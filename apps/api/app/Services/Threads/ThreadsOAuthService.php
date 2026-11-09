<?php

namespace App\Services\Threads;

use App\Models\ThreadsAccount;
use App\Models\ThreadsPublishLog;
use App\Services\TelegramNotificationService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

class ThreadsOAuthService
{
    public const STATE_CACHE_PREFIX = 'threads_oauth_state:';

    /**
     * Lấy cấu hình Meta App (app_id, app_secret, redirect_uri) theo app_group của tài khoản.
     *
     * @return array{app_id: string, app_secret: string, redirect_uri: string, label: string}
     */
    public function resolveAppGroupConfig(?string $appGroup = null): array
    {
        $groupKey = $appGroup && trim($appGroup) !== ''
            ? trim($appGroup)
            : (string) config('threads.default_app_group', 'primary_dev_app');

        $groups = (array) config('threads.app_groups', []);
        $groupConfig = $groups[$groupKey] ?? $groups['primary_dev_app'] ?? [];

        $defaultRedirect = (string) config(
            'threads.redirect_uri',
            rtrim((string) config('app.url', 'http://localhost:8010'), '/') . '/api/v1/threads/oauth/callback'
        );

        return [
            'label' => (string) ($groupConfig['label'] ?? $groupKey),
            'app_id' => trim((string) ($groupConfig['app_id'] ?? env('THREADS_APP_ID', 'threads_dev_app_01'))),
            'app_secret' => trim((string) ($groupConfig['app_secret'] ?? env('THREADS_APP_SECRET', 'threads_dev_secret_01'))),
            'redirect_uri' => trim((string) ($groupConfig['redirect_uri'] ?? $defaultRedirect)),
        ];
    }

    /**
     * Sinh URL ủy quyền Meta Threads OAuth 2.0 kèm tham số state lưu trong Cache chống tấn công CSRF.
     *
     * @return array{authorize_url: string, state: string, account_id: int, app_group: string, expires_in: int}
     */
    public function buildAuthorizeUrl(ThreadsAccount $account, ?string $customRedirectUri = null): array
    {
        $appConfig = $this->resolveAppGroupConfig($account->app_group);
        $redirectUri = $customRedirectUri && trim($customRedirectUri) !== ''
            ? trim($customRedirectUri)
            : $appConfig['redirect_uri'];

        $state = Str::random(40);
        $ttlSeconds = (int) config('threads.oauth_state_ttl_seconds', 900);

        Cache::put(self::STATE_CACHE_PREFIX . $state, [
            'account_id' => $account->id,
            'app_group' => $account->app_group ?: 'primary_dev_app',
            'redirect_uri' => $redirectUri,
            'created_at' => now()->toIso8601String(),
        ], $ttlSeconds);

        $authorizeBaseUrl = rtrim((string) config('threads.oauth_authorize_url', 'https://threads.net/oauth/authorize'), '?');
        $scopes = (string) config('threads.oauth_scopes', 'threads_basic,threads_content_publish');

        $query = http_build_query([
            'client_id' => $appConfig['app_id'],
            'redirect_uri' => $redirectUri,
            'scope' => $scopes,
            'response_type' => 'code',
            'state' => $state,
        ]);

        return [
            'authorize_url' => "{$authorizeBaseUrl}?{$query}",
            'state' => $state,
            'account_id' => (int) $account->id,
            'app_group' => (string) ($account->app_group ?: 'primary_dev_app'),
            'expires_in' => $ttlSeconds,
        ];
    }

    /**
     * Alias của buildAuthorizeUrl().
     */
    public function generateAuthorizeUrl(ThreadsAccount $account, ?string $customRedirectUri = null): array
    {
        return $this->buildAuthorizeUrl($account, $customRedirectUri);
    }

    /**
     * Xử lý OAuth 2.0 Callback:
     * 1. Xác thực state trong Cache chống CSRF
     * 2. Đổi code sang Short-Lived Token (POST https://graph.threads.net/oauth/access_token)
     * 3. Đổi Short-Lived Token sang Long-Lived Token 60 ngày (GET https://graph.threads.net/access_token)
     * 4. Truy vấn GET https://graph.threads.net/v1.0/me lấy id & username
     * 5. Mã hóa token bằng AES-256-GCM và kích hoạt tài khoản
     */
    public function handleCallback(string $code, string $state): ThreadsAccount
    {
        $code = trim($code);
        $state = trim($state);

        if ($code === '' || $state === '') {
            throw new RuntimeException('Thiếu tham số code hoặc state trong phản hồi OAuth.');
        }

        $stateData = Cache::pull(self::STATE_CACHE_PREFIX . $state);
        if (! is_array($stateData) || empty($stateData['account_id'])) {
            throw new RuntimeException('Tham số OAuth state không hợp lệ hoặc đã hết hạn (CSRF protection).');
        }

        /** @var ThreadsAccount|null $account */
        $account = ThreadsAccount::find($stateData['account_id']);
        if (! $account) {
            throw new RuntimeException('Không tìm thấy tài khoản Threads tương ứng với phiên OAuth.');
        }

        $appGroup = (string) ($stateData['app_group'] ?? $account->app_group ?? 'primary_dev_app');
        $appConfig = $this->resolveAppGroupConfig($appGroup);
        $redirectUri = (string) ($stateData['redirect_uri'] ?? $appConfig['redirect_uri']);
        $graphBase = rtrim((string) config('threads.graph_base_url', 'https://graph.threads.net'), '/');
        $graphVersion = trim((string) config('threads.graph_version', 'v1.0'), '/');

        // Bước 1: Đổi code -> Short-Lived Access Token (1 giờ)
        $shortTokenUrl = "{$graphBase}/oauth/access_token";
        $shortRequestPayload = [
            'client_id' => $appConfig['app_id'],
            'client_secret' => $appConfig['app_secret'],
            'grant_type' => 'authorization_code',
            'redirect_uri' => $redirectUri,
            'code' => $code,
        ];

        $startedAt = microtime(true);
        $shortResponse = Http::asForm()
            ->timeout(15)
            ->post($shortTokenUrl, $shortRequestPayload);
        $shortDurationMs = (int) round((microtime(true) - $startedAt) * 1000);

        $shortBody = $shortResponse->json();
        if (! is_array($shortBody)) {
            $shortBody = ['raw' => $shortResponse->body()];
        }

        ThreadsPublishLog::record([
            'account_id' => $account->id,
            'action' => ThreadsPublishLog::ACTION_OAUTH_EXCHANGE,
            'http_status' => $shortResponse->status(),
            'request_payload' => ThreadsTokenCipher::redact($shortRequestPayload, [$appConfig['app_secret']]),
            'response_payload' => ThreadsTokenCipher::redact($shortBody, [$appConfig['app_secret']]),
            'duration_ms' => $shortDurationMs,
        ]);

        $shortLivedToken = trim((string) ($shortBody['access_token'] ?? ''));
        if (! $shortResponse->successful() || $shortLivedToken === '') {
            $errMsg = $this->extractGraphErrorMessage($shortBody, 'Không thể đổi mã ủy quyền sang Short-Lived Token.');
            $account->status = ThreadsAccount::STATUS_NEEDS_REAUTH;
            $account->last_error_message = ThreadsTokenCipher::redactString($errMsg, [$appConfig['app_secret']]);
            $account->save();

            throw new RuntimeException($account->last_error_message);
        }

        $shortUserId = isset($shortBody['user_id']) ? (string) $shortBody['user_id'] : null;

        // Bước 2: Đổi Short-Lived Token -> Long-Lived Token (60 ngày)
        $longTokenUrl = "{$graphBase}/access_token";
        $longQuery = [
            'grant_type' => 'th_exchange_token',
            'client_secret' => $appConfig['app_secret'],
            'access_token' => $shortLivedToken,
        ];

        $startedAt = microtime(true);
        $longResponse = Http::timeout(15)->get($longTokenUrl, $longQuery);
        $longDurationMs = (int) round((microtime(true) - $startedAt) * 1000);

        $longBody = $longResponse->json();
        if (! is_array($longBody)) {
            $longBody = ['raw' => $longResponse->body()];
        }

        $longLivedToken = trim((string) ($longBody['access_token'] ?? ''));

        ThreadsPublishLog::record([
            'account_id' => $account->id,
            'action' => ThreadsPublishLog::ACTION_TOKEN_REFRESH,
            'http_status' => $longResponse->status(),
            'request_payload' => ThreadsTokenCipher::redact(
                array_merge(['endpoint' => $longTokenUrl], $longQuery),
                [$shortLivedToken, $appConfig['app_secret']]
            ),
            'response_payload' => ThreadsTokenCipher::redact(
                $longBody,
                [$shortLivedToken, $longLivedToken, $appConfig['app_secret']]
            ),
            'duration_ms' => $longDurationMs,
        ]);

        if (! $longResponse->successful() || $longLivedToken === '') {
            $errMsg = $this->extractGraphErrorMessage($longBody, 'Không thể đổi sang Long-Lived Token 60 ngày.');
            $account->status = ThreadsAccount::STATUS_NEEDS_REAUTH;
            $account->last_error_message = ThreadsTokenCipher::redactString(
                $errMsg,
                [$shortLivedToken, $appConfig['app_secret']]
            );
            $account->save();

            throw new RuntimeException($account->last_error_message);
        }

        $expiresInSeconds = (int) ($longBody['expires_in'] ?? config('threads.long_lived_token_ttl_seconds', 5184000));
        if ($expiresInSeconds <= 0) {
            $expiresInSeconds = 5184000;
        }

        // Bước 3: Đồng bộ thông tin định danh từ GET /v1.0/me
        $meUrl = "{$graphBase}/{$graphVersion}/me";
        $meResponse = Http::timeout(15)->get($meUrl, [
            'fields' => 'id,username,name,threads_profile_picture_url',
            'access_token' => $longLivedToken,
        ]);

        if ($meResponse->successful()) {
            $meData = (array) $meResponse->json();
            if (! empty($meData['id'])) {
                $account->threads_user_id = (string) $meData['id'];
            }
            if (! empty($meData['username'])) {
                $account->username = (string) $meData['username'];
            }
        }

        if (empty($account->threads_user_id) && $shortUserId !== null && $shortUserId !== '') {
            $account->threads_user_id = $shortUserId;
        }

        $account->setAccessToken($longLivedToken);
        $account->status = ThreadsAccount::STATUS_ACTIVE;
        $account->token_expires_at = now()->addSeconds($expiresInSeconds);
        $account->last_refreshed_at = now();
        $account->last_error_message = null;
        $account->save();

        return $account->fresh() ?? $account;
    }

    /**
     * Làm mới Long-Lived Token (60 ngày) cho một tài khoản cụ thể qua GET https://graph.threads.net/refresh_access_token.
     *
     * @return array{success: bool, account: ThreadsAccount, message: string, http_status: int|null}
     */
    public function refreshAccountToken(ThreadsAccount $account): array
    {
        try {
            $currentToken = $account->getAccessToken();
        } catch (\Throwable $e) {
            $account->status = ThreadsAccount::STATUS_NEEDS_REAUTH;
            $account->last_error_message = 'Không thể giải mã Access Token hiện tại: ' . $e->getMessage();
            $account->save();

            $this->dispatchNeedsReauthAlert($account, $account->last_error_message);

            return [
                'success' => false,
                'account' => $account,
                'message' => $account->last_error_message,
                'http_status' => null,
            ];
        }

        if ($currentToken === null || trim($currentToken) === '') {
            $account->status = ThreadsAccount::STATUS_NEEDS_REAUTH;
            $account->last_error_message = 'Tài khoản chưa có Access Token để làm mới.';
            $account->save();

            $this->dispatchNeedsReauthAlert($account, $account->last_error_message);

            return [
                'success' => false,
                'account' => $account,
                'message' => $account->last_error_message,
                'http_status' => null,
            ];
        }

        $graphBase = rtrim((string) config('threads.graph_base_url', 'https://graph.threads.net'), '/');
        $refreshUrl = "{$graphBase}/refresh_access_token";
        $queryParams = [
            'grant_type' => 'th_refresh_token',
            'access_token' => $currentToken,
        ];

        $startedAt = microtime(true);
        try {
            $response = Http::timeout(15)->get($refreshUrl, $queryParams);
        } catch (\Throwable $e) {
            $durationMs = (int) round((microtime(true) - $startedAt) * 1000);
            $safeError = ThreadsTokenCipher::redactString($e->getMessage(), [$currentToken]);

            ThreadsPublishLog::record([
                'account_id' => $account->id,
                'action' => ThreadsPublishLog::ACTION_TOKEN_REFRESH,
                'http_status' => 500,
                'request_payload' => ThreadsTokenCipher::redact(
                    array_merge(['endpoint' => $refreshUrl], $queryParams),
                    [$currentToken]
                ),
                'response_payload' => ['error' => $safeError],
                'duration_ms' => $durationMs,
            ]);

            $account->last_error_message = $safeError;
            $account->save();

            return [
                'success' => false,
                'account' => $account,
                'message' => $safeError,
                'http_status' => 500,
            ];
        }

        $durationMs = (int) round((microtime(true) - $startedAt) * 1000);
        $body = $response->json();
        if (! is_array($body)) {
            $body = ['raw' => $response->body()];
        }

        $newToken = trim((string) ($body['access_token'] ?? ''));

        ThreadsPublishLog::record([
            'account_id' => $account->id,
            'action' => ThreadsPublishLog::ACTION_TOKEN_REFRESH,
            'http_status' => $response->status(),
            'request_payload' => ThreadsTokenCipher::redact(
                array_merge(['endpoint' => $refreshUrl], $queryParams),
                [$currentToken]
            ),
            'response_payload' => ThreadsTokenCipher::redact($body, [$currentToken, $newToken]),
            'duration_ms' => $durationMs,
        ]);

        if (! $response->successful() || $newToken === '') {
            $errMsg = $this->extractGraphErrorMessage(
                $body,
                "Làm mới token thất bại (HTTP {$response->status()})."
            );
            $safeError = ThreadsTokenCipher::redactString($errMsg, [$currentToken]);

            $account->status = ThreadsAccount::STATUS_NEEDS_REAUTH;
            $account->last_error_message = $safeError;
            $account->save();

            $this->dispatchNeedsReauthAlert($account, $safeError);

            return [
                'success' => false,
                'account' => $account->fresh() ?? $account,
                'message' => $safeError,
                'http_status' => $response->status(),
            ];
        }

        $expiresInSeconds = (int) ($body['expires_in'] ?? config('threads.long_lived_token_ttl_seconds', 5184000));
        if ($expiresInSeconds <= 0) {
            $expiresInSeconds = 5184000;
        }

        $account->setAccessToken($newToken);
        $account->status = ThreadsAccount::STATUS_ACTIVE;
        $account->token_expires_at = now()->addSeconds($expiresInSeconds);
        $account->last_refreshed_at = now();
        $account->last_error_message = null;
        $account->save();

        return [
            'success' => true,
            'account' => $account->fresh() ?? $account,
            'message' => 'Đã gia hạn Long-Lived Token (60 ngày) thành công.',
            'http_status' => $response->status(),
        ];
    }

    /**
     * Quét và tự động làm mới toàn bộ tài khoản active có token còn hạn dưới $thresholdDays ngày (mặc định 14 ngày).
     *
     * @return array{checked: int, refreshed: int, failed: int, details: array<int, array<string, mixed>>}
     */
    public function refreshExpiringTokens(?int $thresholdDays = null): array
    {
        $days = $thresholdDays ?? (int) config('threads.token_refresh_threshold_days', 14);

        $accounts = ThreadsAccount::query()
            ->where('status', ThreadsAccount::STATUS_ACTIVE)
            ->whereNotNull('access_token_encrypted')
            ->where(function ($query) use ($days) {
                $query->whereNull('token_expires_at')
                    ->orWhere('token_expires_at', '<=', now()->addDays($days));
            })
            ->orderBy('id')
            ->get();

        $summary = [
            'checked' => $accounts->count(),
            'refreshed' => 0,
            'failed' => 0,
            'details' => [],
        ];

        foreach ($accounts as $account) {
            $result = $this->refreshAccountToken($account);
            if ($result['success']) {
                $summary['refreshed']++;
            } else {
                $summary['failed']++;
            }

            $summary['details'][] = [
                'account_id' => $account->id,
                'username' => $account->username,
                'success' => $result['success'],
                'status' => $result['account']->status,
                'message' => $result['message'],
            ];
        }

        return $summary;
    }

    /**
     * Trích xuất thông báo lỗi từ phản hồi Meta Graph API.
     */
    protected function extractGraphErrorMessage(array $body, string $fallback): string
    {
        if (isset($body['error']) && is_array($body['error'])) {
            $msg = trim((string) ($body['error']['message'] ?? ''));
            $code = isset($body['error']['code']) ? " (code {$body['error']['code']})" : '';
            if ($msg !== '') {
                return $msg . $code;
            }
        }

        if (isset($body['error_message']) && is_string($body['error_message']) && trim($body['error_message']) !== '') {
            return trim($body['error_message']);
        }

        if (isset($body['message']) && is_string($body['message']) && trim($body['message']) !== '') {
            return trim($body['message']);
        }

        return $fallback;
    }

    /**
     * Gửi cảnh báo Telegram khi tài khoản chuyển sang needs_reauth.
     */
    protected function dispatchNeedsReauthAlert(ThreadsAccount $account, string $errorMessage): void
    {
        try {
            if (class_exists(\App\Services\Threads\ThreadsAlertService::class)) {
                $alertService = app(\App\Services\Threads\ThreadsAlertService::class);
                foreach (['sendNeedsReauthAlert', 'alertAccountNeedsReauth', 'notifyNeedsReauth'] as $method) {
                    if (method_exists($alertService, $method)) {
                        $alertService->{$method}($account, $errorMessage);
                        return;
                    }
                }
            }

            $chatId = trim((string) config('threads.telegram_alert_chat_id', ''));
            if ($chatId !== '' && class_exists(TelegramNotificationService::class)) {
                $handle = $account->username ? "@{$account->username}" : $account->display_name;
                $html = "<b>[THREADS ALERT] Tài khoản cần kết nối lại OAuth (needs_reauth)</b>\n"
                    . "Tài khoản: <b>" . htmlspecialchars((string) $handle, ENT_QUOTES, 'UTF-8') . "</b>\n"
                    . "Nhóm App: <code>" . htmlspecialchars((string) $account->app_group, ENT_QUOTES, 'UTF-8') . "</code>\n"
                    . "Lý do: " . htmlspecialchars($errorMessage, ENT_QUOTES, 'UTF-8');

                app(TelegramNotificationService::class)->sendMessage($chatId, $html);
            }
        } catch (\Throwable $e) {
            Log::warning('ThreadsOAuthService alert dispatch skipped: ' . $e->getMessage());
        }
    }
}
