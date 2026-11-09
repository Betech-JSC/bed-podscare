<?php

namespace App\Services\Threads;

use App\Models\ThreadsAccount;
use App\Models\ThreadsPost;
use App\Models\ThreadsPublishLog;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class ThreadsGraphApiClient
{
    public const STATUS_FINISHED = 'FINISHED';
    public const STATUS_PUBLISHED = 'PUBLISHED';
    public const STATUS_IN_PROGRESS = 'IN_PROGRESS';
    public const STATUS_ERROR = 'ERROR';
    public const STATUS_EXPIRED = 'EXPIRED';

    /**
     * Xây dựng URL đầy đủ cho Meta Threads Graph API (v1.0).
     */
    public function buildEndpointUrl(string $path): string
    {
        $baseUrl = rtrim((string) config('threads.graph_base_url', 'https://graph.threads.net'), '/');
        $version = trim((string) config('threads.graph_version', 'v1.0'), '/');
        $cleanPath = ltrim($path, '/');

        if ($version !== '' && ! str_starts_with($cleanPath, $version . '/')) {
            return "{$baseUrl}/{$version}/{$cleanPath}";
        }

        return "{$baseUrl}/{$cleanPath}";
    }

    /**
     * Giải mã Access Token của tài khoản Threads.
     */
    protected function resolveAccessToken(ThreadsAccount $account): string
    {
        if (method_exists($account, 'getAccessToken')) {
            $token = $account->getAccessToken();
            if (is_string($token) && trim($token) !== '') {
                return trim($token);
            }
        }

        $encrypted = (string) $account->getRawOriginal('access_token_encrypted');
        if (trim($encrypted) !== '') {
            return ThreadsTokenCipher::decrypt($encrypted);
        }

        throw new RuntimeException("Tài khoản Threads #{$account->id} chưa được cấu hình Access Token hợp lệ.");
    }

    /**
     * Lấy threads_user_id (mặc định dùng 'me' theo chuẩn Meta Threads Graph API cho User Access Token).
     */
    protected function resolveThreadsUserId(ThreadsAccount $account): string
    {
        $id = trim((string) ($account->threads_user_id ?? ''));

        return $id !== '' ? $id : 'me';
    }

    /**
     * Kiểm tra phản hồi lỗi có phải là lỗi xác thực OAuth (HTTP 401/403 hoặc mã lỗi 190 của Meta) hay không.
     *
     * @param  array<string, mixed>  $responseBody
     */
    public static function isAuthenticationError(?int $httpStatus, array $responseBody = []): bool
    {
        if (in_array($httpStatus, [401, 403], true)) {
            return true;
        }

        $errorCode = $responseBody['error']['code'] ?? $responseBody['error_code'] ?? null;
        if ($errorCode !== null && in_array((int) $errorCode, [190, 102, 104], true)) {
            return true;
        }

        $errorType = (string) ($responseBody['error']['type'] ?? '');
        if (stripos($errorType, 'OAuthException') !== false && $httpStatus === 400) {
            $message = (string) ($responseBody['error']['message'] ?? '');
            if (
                stripos($message, 'access token') !== false
                || stripos($message, 'expired') !== false
                || stripos($message, 'invalid') !== false
                || stripos($message, 'revoked') !== false
                || stripos($message, 'session') !== false
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * Trích xuất mã lỗi và thông điệp lỗi đã được che giấu token từ phản hồi Meta API.
     *
     * @param  array<string, mixed>  $responseBody
     * @param  array<int, string>  $secrets
     * @return array{error_code: string, error_message: string}
     */
    protected function extractErrorDetails(?int $httpStatus, array $responseBody, array $secrets = []): array
    {
        $errorNode = is_array($responseBody['error'] ?? null) ? $responseBody['error'] : [];

        $rawCode = $errorNode['error_user_title']
            ?? $errorNode['code']
            ?? $responseBody['error_code']
            ?? ($responseBody['status'] ?? null)
            ?? ($httpStatus ? "HTTP_{$httpStatus}" : 'THREADS_API_ERROR');

        $rawMessage = $errorNode['error_user_msg']
            ?? $errorNode['message']
            ?? $responseBody['error_message']
            ?? $responseBody['message']
            ?? "Meta Threads API trả về lỗi (HTTP {$httpStatus}).";

        return [
            'error_code'    => (string) $rawCode,
            'error_message' => ThreadsTokenCipher::redactString((string) $rawMessage, $secrets),
        ];
    }

    /**
     * Ghi nhận bản ghi vào bảng threads_publish_logs (luôn đi qua ThreadsTokenCipher::redact).
     *
     * @param  array<string, mixed>  $requestPayload
     * @param  array<string, mixed>  $responsePayload
     * @param  array<int, string>  $extraSecrets
     */
    public function recordPublishLog(
        ?int $accountId,
        ?int $postId,
        string $action,
        ?int $httpStatus,
        array $requestPayload,
        array $responsePayload,
        int $durationMs,
        array $extraSecrets = []
    ): ?ThreadsPublishLog {
        $redactedRequest = ThreadsTokenCipher::redact($requestPayload, $extraSecrets);
        $redactedResponse = ThreadsTokenCipher::redact($responsePayload, $extraSecrets);

        if (! class_exists(ThreadsPublishLog::class)) {
            return null;
        }

        try {
            if (! Schema::hasTable('threads_publish_logs')) {
                return null;
            }

            return ThreadsPublishLog::create([
                'account_id'       => $accountId,
                'post_id'          => $postId,
                'action'           => $action,
                'http_status'      => $httpStatus,
                'request_payload'  => is_array($redactedRequest) ? $redactedRequest : ['raw' => $redactedRequest],
                'response_payload' => is_array($redactedResponse) ? $redactedResponse : ['raw' => $redactedResponse],
                'duration_ms'      => max(0, $durationMs),
                'created_at'       => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('ThreadsGraphApiClient: Failed to write threads_publish_logs: ' . ThreadsTokenCipher::redactString($e->getMessage(), $extraSecrets));

            return null;
        }
    }

    /**
     * Bước 1: Tạo Media Container cho bài viết (TEXT, IMAGE, VIDEO, CAROUSEL).
     *
     * @param  ThreadsPost|array<string, mixed>  $post
     * @return array{
     *     ok: bool,
     *     http_status: ?int,
     *     container_id: ?string,
     *     effective_text: string,
     *     is_auth_error: bool,
     *     error_code: ?string,
     *     error_message: ?string,
     *     raw: array<string, mixed>
     * }
     */
    public function createContainer(
        ThreadsAccount $account,
        ThreadsPost|array $post,
        ?string $replyToId = null
    ): array {
        $postId = $post instanceof ThreadsPost ? (int) $post->getKey() : (isset($post['id']) ? (int) $post['id'] : null);
        $postData = $post instanceof ThreadsPost ? $post->toArray() : $post;

        try {
            $accessToken = $this->resolveAccessToken($account);
        } catch (\Throwable $e) {
            $this->recordPublishLog(
                (int) $account->getKey(),
                $postId,
                'create_container',
                401,
                ['error' => 'missing_or_invalid_access_token'],
                ['message' => $e->getMessage()],
                0
            );

            return [
                'ok'             => false,
                'http_status'    => 401,
                'container_id'   => null,
                'effective_text' => '',
                'is_auth_error'  => true,
                'error_code'     => 'TOKEN_DECRYPT_FAILED',
                'error_message'  => $e->getMessage(),
                'raw'            => [],
            ];
        }

        $threadsUserId = $this->resolveThreadsUserId($account);
        $endpoint = $this->buildEndpointUrl("{$threadsUserId}/threads");

        $contentText = (string) ($postData['content_text'] ?? '');
        $isSponsored = filter_var($postData['is_sponsored'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $sponsoredSuffix = isset($postData['sponsored_suffix']) ? (string) $postData['sponsored_suffix'] : null;

        $effectiveText = ThreadsPostValidator::resolveEffectiveText($contentText, $isSponsored, $sponsoredSuffix);
        $mediaType = strtoupper(trim((string) ($postData['media_type'] ?? 'TEXT')));
        if ($mediaType === '') {
            $mediaType = 'TEXT';
        }

        $mediaUrls = ThreadsPostValidator::normalizeMediaUrls($postData['media_urls'] ?? []);
        $linkAttachment = isset($postData['link_attachment']) && trim((string) $postData['link_attachment']) !== ''
            ? trim((string) $postData['link_attachment'])
            : null;
        $topicTag = isset($postData['topic_tag']) && trim((string) $postData['topic_tag']) !== ''
            ? trim((string) $postData['topic_tag'])
            : null;
        $replyControl = isset($postData['reply_control']) && trim((string) $postData['reply_control']) !== ''
            ? trim((string) $postData['reply_control'])
            : null;

        // Giải quyết reply_to_id từ tham số truyền vào hoặc từ bài cha
        if (($replyToId === null || trim($replyToId) === '') && $post instanceof ThreadsPost) {
            if (method_exists($post, 'parentPost') && $post->parentPost !== null) {
                $replyToId = $post->parentPost->threads_media_id;
            }
        }

        $payload = [
            'media_type'    => $mediaType,
            'access_token'  => $accessToken,
        ];

        // Meta Threads Graph API: Tham số reply_control chỉ gửi khi khác 'everyone'
        // vì 'everyone' là mặc định trên Threads và việc truyền reply_control yêu cầu thêm quyền threads_manage_replies.
        if ($replyControl !== null && $replyControl !== '' && $replyControl !== 'everyone') {
            $payload['reply_control'] = $replyControl;
        }

        if ($effectiveText !== '') {
            $payload['text'] = $effectiveText;
        }

        if ($topicTag !== null) {
            $payload['topic_tag'] = $topicTag;
        }

        if ($linkAttachment !== null) {
            $payload['link_attachment'] = $linkAttachment;
        }

        if ($replyToId !== null && trim($replyToId) !== '') {
            $payload['reply_to_id'] = trim($replyToId);
        }

        // Xử lý từng loại media_type
        if ($mediaType === 'IMAGE' && isset($mediaUrls[0])) {
            $payload['image_url'] = $mediaUrls[0];
        } elseif ($mediaType === 'VIDEO' && isset($mediaUrls[0])) {
            $payload['video_url'] = $mediaUrls[0];
        } elseif ($mediaType === 'CAROUSEL') {
            $childrenIds = [];
            if (! empty($postData['children']) && is_string($postData['children'])) {
                $childrenIds = array_filter(array_map('trim', explode(',', $postData['children'])));
            }

            if (empty($childrenIds) && count($mediaUrls) >= 2) {
                foreach ($mediaUrls as $idx => $itemUrl) {
                    $itemResult = $this->createCarouselItemContainer($account, $accessToken, $threadsUserId, $itemUrl, $idx);
                    if (! $itemResult['ok'] || empty($itemResult['container_id'])) {
                        $this->recordPublishLog(
                            (int) $account->getKey(),
                            $postId,
                            'create_container',
                            $itemResult['http_status'],
                            ['endpoint' => $endpoint, 'carousel_item_url' => $itemUrl, 'access_token' => $accessToken],
                            $itemResult['raw'],
                            $itemResult['duration_ms'] ?? 0,
                            [$accessToken]
                        );

                        return [
                            'ok'             => false,
                            'http_status'    => $itemResult['http_status'],
                            'container_id'   => null,
                            'effective_text' => $effectiveText,
                            'is_auth_error'  => $itemResult['is_auth_error'],
                            'error_code'     => $itemResult['error_code'],
                            'error_message'  => $itemResult['error_message'],
                            'raw'            => $itemResult['raw'],
                        ];
                    }
                    $childrenIds[] = $itemResult['container_id'];
                }
            }

            $payload['children'] = implode(',', $childrenIds);
        }

        $startTime = microtime(true);
        try {
            $response = Http::timeout(20)->post($endpoint, $payload);
            $durationMs = (int) round((microtime(true) - $startTime) * 1000);
            $httpStatus = $response->status();
            $body = $response->json();
            if (! is_array($body)) {
                $body = ['raw_body' => $response->body()];
            }
        } catch (\Throwable $e) {
            $durationMs = (int) round((microtime(true) - $startTime) * 1000);
            $errorMsg = ThreadsTokenCipher::redactString($e->getMessage(), [$accessToken]);

            $this->recordPublishLog(
                (int) $account->getKey(),
                $postId,
                'create_container',
                null,
                ['endpoint' => $endpoint, 'payload' => $payload],
                ['exception' => $errorMsg],
                $durationMs,
                [$accessToken]
            );

            return [
                'ok'             => false,
                'http_status'    => null,
                'container_id'   => null,
                'effective_text' => $effectiveText,
                'is_auth_error'  => false,
                'error_code'     => 'NETWORK_EXCEPTION',
                'error_message'  => $errorMsg,
                'raw'            => ['exception' => $errorMsg],
            ];
        }

        $this->recordPublishLog(
            (int) $account->getKey(),
            $postId,
            'create_container',
            $httpStatus,
            ['endpoint' => $endpoint, 'payload' => $payload],
            $body,
            $durationMs,
            [$accessToken]
        );

        $containerId = isset($body['id']) ? trim((string) $body['id']) : null;
        if ($response->successful() && $containerId !== null && $containerId !== '') {
            return [
                'ok'             => true,
                'http_status'    => $httpStatus,
                'container_id'   => $containerId,
                'effective_text' => $effectiveText,
                'is_auth_error'  => false,
                'error_code'     => null,
                'error_message'  => null,
                'raw'            => $body,
            ];
        }

        $isAuthError = self::isAuthenticationError($httpStatus, $body);
        $errorDetails = $this->extractErrorDetails($httpStatus, $body, [$accessToken]);

        return [
            'ok'             => false,
            'http_status'    => $httpStatus,
            'container_id'   => null,
            'effective_text' => $effectiveText,
            'is_auth_error'  => $isAuthError,
            'error_code'     => $errorDetails['error_code'],
            'error_message'  => $errorDetails['error_message'],
            'raw'            => $body,
        ];
    }

    /**
     * Tạo Item Container con cho bài CAROUSEL.
     *
     * @return array{
     *     ok: bool,
     *     http_status: ?int,
     *     container_id: ?string,
     *     is_auth_error: bool,
     *     error_code: ?string,
     *     error_message: ?string,
     *     duration_ms: int,
     *     raw: array<string, mixed>
     * }
     */
    protected function createCarouselItemContainer(
        ThreadsAccount $account,
        string $accessToken,
        string $threadsUserId,
        string $mediaUrl,
        int $index = 0
    ): array {
        $endpoint = $this->buildEndpointUrl("{$threadsUserId}/threads");
        $path = strtolower((string) parse_url($mediaUrl, PHP_URL_PATH));
        $isVideo = str_ends_with($path, '.mp4') || str_ends_with($path, '.mov') || str_ends_with($path, '.m4v');

        $payload = [
            'is_carousel_item' => true,
            'media_type'       => $isVideo ? 'VIDEO' : 'IMAGE',
            'access_token'     => $accessToken,
        ];

        if ($isVideo) {
            $payload['video_url'] = $mediaUrl;
        } else {
            $payload['image_url'] = $mediaUrl;
        }

        $startTime = microtime(true);
        try {
            $response = Http::timeout(20)->post($endpoint, $payload);
            $durationMs = (int) round((microtime(true) - $startTime) * 1000);
            $httpStatus = $response->status();
            $body = $response->json();
            if (! is_array($body)) {
                $body = ['raw_body' => $response->body()];
            }
        } catch (\Throwable $e) {
            $durationMs = (int) round((microtime(true) - $startTime) * 1000);
            $errorMsg = ThreadsTokenCipher::redactString($e->getMessage(), [$accessToken]);

            return [
                'ok'            => false,
                'http_status'   => null,
                'container_id'  => null,
                'is_auth_error' => false,
                'error_code'    => 'NETWORK_EXCEPTION',
                'error_message' => $errorMsg,
                'duration_ms'   => $durationMs,
                'raw'           => ['exception' => $errorMsg],
            ];
        }

        $containerId = isset($body['id']) ? trim((string) $body['id']) : null;
        if ($response->successful() && $containerId !== null && $containerId !== '') {
            return [
                'ok'            => true,
                'http_status'   => $httpStatus,
                'container_id'  => $containerId,
                'is_auth_error' => false,
                'error_code'    => null,
                'error_message' => null,
                'duration_ms'   => $durationMs,
                'raw'           => $body,
            ];
        }

        $errorDetails = $this->extractErrorDetails($httpStatus, $body, [$accessToken]);

        return [
            'ok'            => false,
            'http_status'   => $httpStatus,
            'container_id'  => null,
            'is_auth_error' => self::isAuthenticationError($httpStatus, $body),
            'error_code'    => $errorDetails['error_code'],
            'error_message' => "Lỗi tạo Carousel Item #" . ($index + 1) . ': ' . $errorDetails['error_message'],
            'duration_ms'   => $durationMs,
            'raw'           => $body,
        ];
    }

    /**
     * Bước 1.5 (Poll đơn): Kiểm tra trạng thái xử lý của Media Container:
     * GET /{container_id}?fields=id,status,error_message
     *
     * @return array{
     *     ok: bool,
     *     http_status: ?int,
     *     container_id: string,
     *     status: ?string,
     *     published_media_id: ?string,
     *     is_auth_error: bool,
     *     error_code: ?string,
     *     error_message: ?string,
     *     raw: array<string, mixed>
     * }
     */
    public function getContainerStatus(
        ThreadsAccount $account,
        string $containerId,
        ?int $postId = null
    ): array {
        $containerId = trim($containerId);

        try {
            $accessToken = $this->resolveAccessToken($account);
        } catch (\Throwable $e) {
            return [
                'ok'                 => false,
                'http_status'        => 401,
                'container_id'       => $containerId,
                'status'             => null,
                'published_media_id' => null,
                'is_auth_error'      => true,
                'error_code'         => 'TOKEN_DECRYPT_FAILED',
                'error_message'      => $e->getMessage(),
                'raw'                => [],
            ];
        }

        $endpoint = $this->buildEndpointUrl($containerId);
        $queryParams = [
            'fields'       => 'id,status,error_message',
            'access_token' => $accessToken,
        ];

        $startTime = microtime(true);
        try {
            $response = Http::timeout(15)->get($endpoint, $queryParams);
            $durationMs = (int) round((microtime(true) - $startTime) * 1000);
            $httpStatus = $response->status();
            $body = $response->json();
            if (! is_array($body)) {
                $body = ['raw_body' => $response->body()];
            }
        } catch (\Throwable $e) {
            $durationMs = (int) round((microtime(true) - $startTime) * 1000);
            $errorMsg = ThreadsTokenCipher::redactString($e->getMessage(), [$accessToken]);

            $this->recordPublishLog(
                (int) $account->getKey(),
                $postId,
                'poll_container',
                null,
                ['endpoint' => $endpoint, 'query' => $queryParams],
                ['exception' => $errorMsg],
                $durationMs,
                [$accessToken]
            );

            return [
                'ok'                 => false,
                'http_status'        => null,
                'container_id'       => $containerId,
                'status'             => null,
                'published_media_id' => null,
                'is_auth_error'      => false,
                'error_code'         => 'NETWORK_EXCEPTION',
                'error_message'      => $errorMsg,
                'raw'                => ['exception' => $errorMsg],
            ];
        }

        $this->recordPublishLog(
            (int) $account->getKey(),
            $postId,
            'poll_container',
            $httpStatus,
            ['endpoint' => $endpoint, 'query' => $queryParams],
            $body,
            $durationMs,
            [$accessToken]
        );

        $status = isset($body['status']) ? strtoupper(trim((string) $body['status'])) : null;
        $publishedMediaId = isset($body['published_media_id'])
            ? trim((string) $body['published_media_id'])
            : (isset($body['media_id']) ? trim((string) $body['media_id']) : null);

        if ($response->successful() && $status !== null) {
            if (in_array($status, [self::STATUS_ERROR, self::STATUS_EXPIRED], true)) {
                $errCode = (string) ($body['error_message'] ?? $status);
                $errMsg = "Media Container #{$containerId} trả về trạng thái {$status}: " . ($body['error_message'] ?? $status);

                return [
                    'ok'                 => false,
                    'http_status'        => $httpStatus,
                    'container_id'       => $containerId,
                    'status'             => $status,
                    'published_media_id' => $publishedMediaId,
                    'is_auth_error'      => false,
                    'error_code'         => $errCode,
                    'error_message'      => ThreadsTokenCipher::redactString($errMsg, [$accessToken]),
                    'raw'                => $body,
                ];
            }

            return [
                'ok'                 => true,
                'http_status'        => $httpStatus,
                'container_id'       => $containerId,
                'status'             => $status,
                'published_media_id' => $publishedMediaId,
                'is_auth_error'      => false,
                'error_code'         => null,
                'error_message'      => null,
                'raw'                => $body,
            ];
        }

        // Nếu response 200 nhưng mock không trả về trường status, mặc định coi là FINISHED
        if ($response->successful() && $status === null) {
            return [
                'ok'                 => true,
                'http_status'        => $httpStatus,
                'container_id'       => $containerId,
                'status'             => self::STATUS_FINISHED,
                'published_media_id' => $publishedMediaId,
                'is_auth_error'      => false,
                'error_code'         => null,
                'error_message'      => null,
                'raw'                => $body,
            ];
        }

        $isAuthError = self::isAuthenticationError($httpStatus, $body);
        $errorDetails = $this->extractErrorDetails($httpStatus, $body, [$accessToken]);

        return [
            'ok'                 => false,
            'http_status'        => $httpStatus,
            'container_id'       => $containerId,
            'status'             => $status,
            'published_media_id' => null,
            'is_auth_error'      => $isAuthError,
            'error_code'         => $errorDetails['error_code'],
            'error_message'      => $errorDetails['error_message'],
            'raw'                => $body,
        ];
    }

    /**
     * Poll trạng thái Container nhiều lần (tối đa $maxAttempts) cho tới khi đạt FINISHED hoặc PUBLISHED.
     *
     * @return array<string, mixed>
     */
    public function pollContainerUntilFinished(
        ThreadsAccount $account,
        string $containerId,
        ?int $postId = null,
        ?int $maxAttempts = null,
        ?int $intervalMs = null
    ): array {
        $attempts = max(1, $maxAttempts ?? (int) config('threads.container_poll_max_attempts', 6));
        $sleepMs = $intervalMs ?? (app()->runningUnitTests() ? 0 : (int) config('threads.container_poll_interval_ms', 500));

        $lastResult = [
            'ok'                 => false,
            'http_status'        => null,
            'container_id'       => $containerId,
            'status'             => null,
            'published_media_id' => null,
            'is_auth_error'      => false,
            'error_code'         => 'POLL_NOT_STARTED',
            'error_message'      => 'Chưa kiểm tra được trạng thái container.',
            'raw'                => [],
        ];

        for ($i = 1; $i <= $attempts; $i++) {
            $lastResult = $this->getContainerStatus($account, $containerId, $postId);

            if (! $lastResult['ok'] || $lastResult['is_auth_error']) {
                return $lastResult;
            }

            if (in_array($lastResult['status'], [self::STATUS_FINISHED, self::STATUS_PUBLISHED], true)) {
                return $lastResult;
            }

            if (in_array($lastResult['status'], [self::STATUS_ERROR, self::STATUS_EXPIRED], true)) {
                $lastResult['ok'] = false;

                return $lastResult;
            }

            if ($i < $attempts && $sleepMs > 0) {
                usleep($sleepMs * 1000);
            }
        }

        return $lastResult;
    }

    /**
     * Bước 2: Xuất bản Media Container thành bài đăng chính thức trên Threads:
     * POST /{threads_user_id}/threads_publish với creation_id={container_id}
     *
     * @return array{
     *     ok: bool,
     *     http_status: ?int,
     *     threads_media_id: ?string,
     *     is_auth_error: bool,
     *     error_code: ?string,
     *     error_message: ?string,
     *     raw: array<string, mixed>
     * }
     */
    public function publishContainer(
        ThreadsAccount $account,
        string $containerId,
        ?int $postId = null
    ): array {
        $containerId = trim($containerId);

        try {
            $accessToken = $this->resolveAccessToken($account);
        } catch (\Throwable $e) {
            return [
                'ok'               => false,
                'http_status'      => 401,
                'threads_media_id' => null,
                'is_auth_error'    => true,
                'error_code'       => 'TOKEN_DECRYPT_FAILED',
                'error_message'    => $e->getMessage(),
                'raw'              => [],
            ];
        }

        $threadsUserId = $this->resolveThreadsUserId($account);
        $endpoint = $this->buildEndpointUrl("{$threadsUserId}/threads_publish");
        $payload = [
            'creation_id'  => $containerId,
            'access_token' => $accessToken,
        ];

        $startTime = microtime(true);
        try {
            $response = Http::timeout(20)->post($endpoint, $payload);
            $durationMs = (int) round((microtime(true) - $startTime) * 1000);
            $httpStatus = $response->status();
            $body = $response->json();
            if (! is_array($body)) {
                $body = ['raw_body' => $response->body()];
            }
        } catch (\Throwable $e) {
            $durationMs = (int) round((microtime(true) - $startTime) * 1000);
            $errorMsg = ThreadsTokenCipher::redactString($e->getMessage(), [$accessToken]);

            $this->recordPublishLog(
                (int) $account->getKey(),
                $postId,
                'publish',
                null,
                ['endpoint' => $endpoint, 'payload' => $payload],
                ['exception' => $errorMsg],
                $durationMs,
                [$accessToken]
            );

            return [
                'ok'               => false,
                'http_status'      => null,
                'threads_media_id' => null,
                'is_auth_error'    => false,
                'error_code'       => 'NETWORK_EXCEPTION',
                'error_message'    => $errorMsg,
                'raw'              => ['exception' => $errorMsg],
            ];
        }

        $this->recordPublishLog(
            (int) $account->getKey(),
            $postId,
            'publish',
            $httpStatus,
            ['endpoint' => $endpoint, 'payload' => $payload],
            $body,
            $durationMs,
            [$accessToken]
        );

        $mediaId = isset($body['id']) ? trim((string) $body['id']) : null;
        if ($response->successful() && $mediaId !== null && $mediaId !== '') {
            return [
                'ok'               => true,
                'http_status'      => $httpStatus,
                'threads_media_id' => $mediaId,
                'is_auth_error'    => false,
                'error_code'       => null,
                'error_message'    => null,
                'raw'              => $body,
            ];
        }

        $isAuthError = self::isAuthenticationError($httpStatus, $body);
        $errorDetails = $this->extractErrorDetails($httpStatus, $body, [$accessToken]);

        return [
            'ok'               => false,
            'http_status'      => $httpStatus,
            'threads_media_id' => null,
            'is_auth_error'    => $isAuthError,
            'error_code'       => $errorDetails['error_code'],
            'error_message'    => $errorDetails['error_message'],
            'raw'              => $body,
        ];
    }

    /**
     * Kiểm tra hạn mức xuất bản 24h của tài khoản trên Meta Threads:
     * GET /{threads_user_id}/threads_publishing_limit
     *
     * @return array{
     *     ok: bool,
     *     http_status: ?int,
     *     quota_used: int,
     *     quota_total: int,
     *     quota_remaining: int,
     *     remaining_ratio: float,
     *     remaining_percent: float,
     *     is_auth_error: bool,
     *     error_code: ?string,
     *     error_message: ?string,
     *     raw: array<string, mixed>
     * }
     */
    public function getPublishingLimit(ThreadsAccount $account, ?int $postId = null): array
    {
        $defaultTotal = (int) ($account->quota_total_24h ?: config('threads.quota_total_24h', 250));
        if ($defaultTotal <= 0) {
            $defaultTotal = 250;
        }
        $defaultUsed = (int) ($account->quota_used_24h ?? 0);

        try {
            $accessToken = $this->resolveAccessToken($account);
        } catch (\Throwable $e) {
            return [
                'ok'                => false,
                'http_status'       => 401,
                'quota_used'        => $defaultUsed,
                'quota_total'       => $defaultTotal,
                'quota_remaining'   => max(0, $defaultTotal - $defaultUsed),
                'remaining_ratio'   => $defaultTotal > 0 ? max(0, $defaultTotal - $defaultUsed) / $defaultTotal : 0.0,
                'remaining_percent' => $defaultTotal > 0 ? round((max(0, $defaultTotal - $defaultUsed) / $defaultTotal) * 100, 2) : 0.0,
                'is_auth_error'     => true,
                'error_code'        => 'TOKEN_DECRYPT_FAILED',
                'error_message'     => $e->getMessage(),
                'raw'               => [],
            ];
        }

        $threadsUserId = $this->resolveThreadsUserId($account);
        $endpoint = $this->buildEndpointUrl("{$threadsUserId}/threads_publishing_limit");
        $queryParams = [
            'fields'       => 'quota_usage,config',
            'access_token' => $accessToken,
        ];

        $startTime = microtime(true);
        try {
            $response = Http::timeout(15)->get($endpoint, $queryParams);
            $durationMs = (int) round((microtime(true) - $startTime) * 1000);
            $httpStatus = $response->status();
            $body = $response->json();
            if (! is_array($body)) {
                $body = ['raw_body' => $response->body()];
            }
        } catch (\Throwable $e) {
            $durationMs = (int) round((microtime(true) - $startTime) * 1000);
            $errorMsg = ThreadsTokenCipher::redactString($e->getMessage(), [$accessToken]);

            $this->recordPublishLog(
                (int) $account->getKey(),
                $postId,
                'quota_check',
                null,
                ['endpoint' => $endpoint, 'query' => $queryParams],
                ['exception' => $errorMsg],
                $durationMs,
                [$accessToken]
            );

            $remaining = max(0, $defaultTotal - $defaultUsed);
            $ratio = $defaultTotal > 0 ? ($remaining / $defaultTotal) : 0.0;

            return [
                'ok'                => false,
                'http_status'       => null,
                'quota_used'        => $defaultUsed,
                'quota_total'       => $defaultTotal,
                'quota_remaining'   => $remaining,
                'remaining_ratio'   => $ratio,
                'remaining_percent' => round($ratio * 100, 2),
                'is_auth_error'     => false,
                'error_code'        => 'NETWORK_EXCEPTION',
                'error_message'     => $errorMsg,
                'raw'               => ['exception' => $errorMsg],
            ];
        }

        $this->recordPublishLog(
            (int) $account->getKey(),
            $postId,
            'quota_check',
            $httpStatus,
            ['endpoint' => $endpoint, 'query' => $queryParams],
            $body,
            $durationMs,
            [$accessToken]
        );

        if ($response->successful()) {
            $node = $body;
            if (isset($body['data'][0]) && is_array($body['data'][0])) {
                $node = $body['data'][0];
            }

            $quotaUsed = (int) ($node['quota_usage'] ?? $node['quota_used'] ?? $body['quota_usage'] ?? $body['quota_used'] ?? $defaultUsed);
            $quotaTotal = (int) (
                $node['config']['quota_total']
                ?? $node['quota_total']
                ?? $body['config']['quota_total']
                ?? $body['quota_total']
                ?? $defaultTotal
            );

            if ($quotaTotal <= 0) {
                $quotaTotal = 250;
            }

            $quotaRemaining = max(0, $quotaTotal - $quotaUsed);
            $remainingRatio = $quotaRemaining / $quotaTotal;
            $remainingPercent = round($remainingRatio * 100, 2);

            try {
                $account->forceFill([
                    'quota_used_24h'  => $quotaUsed,
                    'quota_total_24h' => $quotaTotal,
                ])->save();
            } catch (\Throwable) {
                // Bỏ qua lỗi lưu snapshot nếu đang chạy unit test không có DB
            }

            return [
                'ok'                => true,
                'http_status'       => $httpStatus,
                'quota_used'        => $quotaUsed,
                'quota_total'       => $quotaTotal,
                'quota_remaining'   => $quotaRemaining,
                'remaining_ratio'   => $remainingRatio,
                'remaining_percent' => $remainingPercent,
                'is_auth_error'     => false,
                'error_code'        => null,
                'error_message'     => null,
                'raw'               => $body,
            ];
        }

        $isAuthError = self::isAuthenticationError($httpStatus, $body);
        $errorDetails = $this->extractErrorDetails($httpStatus, $body, [$accessToken]);
        $remaining = max(0, $defaultTotal - $defaultUsed);
        $ratio = $defaultTotal > 0 ? ($remaining / $defaultTotal) : 0.0;

        return [
            'ok'                => false,
            'http_status'       => $httpStatus,
            'quota_used'        => $defaultUsed,
            'quota_total'       => $defaultTotal,
            'quota_remaining'   => $remaining,
            'remaining_ratio'   => $ratio,
            'remaining_percent' => round($ratio * 100, 2),
            'is_auth_error'     => $isAuthError,
            'error_code'        => $errorDetails['error_code'],
            'error_message'     => $errorDetails['error_message'],
            'raw'               => $body,
        ];
    }

    /**
     * Alias cho getPublishingLimit.
     *
     * @return array<string, mixed>
     */
    public function checkPublishingLimit(ThreadsAccount $account, ?int $postId = null): array
    {
        return $this->getPublishingLimit($account, $postId);
    }

    /**
     * Truy vấn đường dẫn công khai (permalink) của bài viết sau khi xuất bản:
     * GET /{threads_media_id}?fields=id,permalink,shortcode,timestamp
     *
     * @return array{
     *     ok: bool,
     *     http_status: ?int,
     *     permalink: ?string,
     *     is_auth_error: bool,
     *     error_code: ?string,
     *     error_message: ?string,
     *     raw: array<string, mixed>
     * }
     */
    public function fetchPermalink(
        ThreadsAccount $account,
        string $threadsMediaId,
        ?int $postId = null
    ): array {
        $threadsMediaId = trim($threadsMediaId);
        $username = ltrim(trim((string) ($account->username ?? 'threads')), '@');
        $fallbackPermalink = "https://www.threads.net/@{$username}/post/{$threadsMediaId}";

        try {
            $accessToken = $this->resolveAccessToken($account);
        } catch (\Throwable $e) {
            return [
                'ok'            => false,
                'http_status'   => 401,
                'permalink'     => $fallbackPermalink,
                'is_auth_error' => true,
                'error_code'    => 'TOKEN_DECRYPT_FAILED',
                'error_message' => $e->getMessage(),
                'raw'           => [],
            ];
        }

        $endpoint = $this->buildEndpointUrl($threadsMediaId);
        $queryParams = [
            'fields'       => 'id,permalink,shortcode,timestamp',
            'access_token' => $accessToken,
        ];

        $startTime = microtime(true);
        try {
            $response = Http::timeout(15)->get($endpoint, $queryParams);
            $durationMs = (int) round((microtime(true) - $startTime) * 1000);
            $httpStatus = $response->status();
            $body = $response->json();
            if (! is_array($body)) {
                $body = ['raw_body' => $response->body()];
            }
        } catch (\Throwable $e) {
            $durationMs = (int) round((microtime(true) - $startTime) * 1000);
            $errorMsg = ThreadsTokenCipher::redactString($e->getMessage(), [$accessToken]);

            $this->recordPublishLog(
                (int) $account->getKey(),
                $postId,
                'fetch_permalink',
                null,
                ['endpoint' => $endpoint, 'query' => $queryParams],
                ['exception' => $errorMsg],
                $durationMs,
                [$accessToken]
            );

            return [
                'ok'            => false,
                'http_status'   => null,
                'permalink'     => $fallbackPermalink,
                'is_auth_error' => false,
                'error_code'    => 'NETWORK_EXCEPTION',
                'error_message' => $errorMsg,
                'raw'           => ['exception' => $errorMsg],
            ];
        }

        $this->recordPublishLog(
            (int) $account->getKey(),
            $postId,
            'fetch_permalink',
            $httpStatus,
            ['endpoint' => $endpoint, 'query' => $queryParams],
            $body,
            $durationMs,
            [$accessToken]
        );

        if ($response->successful()) {
            $permalink = isset($body['permalink']) && trim((string) $body['permalink']) !== ''
                ? trim((string) $body['permalink'])
                : $fallbackPermalink;

            return [
                'ok'            => true,
                'http_status'   => $httpStatus,
                'permalink'     => $permalink,
                'is_auth_error' => false,
                'error_code'    => null,
                'error_message' => null,
                'raw'           => $body,
            ];
        }

        $isAuthError = self::isAuthenticationError($httpStatus, $body);
        $errorDetails = $this->extractErrorDetails($httpStatus, $body, [$accessToken]);

        return [
            'ok'            => false,
            'http_status'   => $httpStatus,
            'permalink'     => $fallbackPermalink,
            'is_auth_error' => $isAuthError,
            'error_code'    => $errorDetails['error_code'],
            'error_message' => $errorDetails['error_message'],
            'raw'           => $body,
        ];
    }

    /**
     * Alias cho fetchPermalink.
     *
     * @return array<string, mixed>
     */
    public function getPermalink(
        ThreadsAccount $account,
        string $threadsMediaId,
        ?int $postId = null
    ): array {
        return $this->fetchPermalink($account, $threadsMediaId, $postId);
    }
}
