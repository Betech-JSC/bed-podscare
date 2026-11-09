<?php

namespace App\Services\Threads;

use App\Models\TelegramRecipient;
use App\Models\ThreadsAccount;
use App\Models\ThreadsPost;
use App\Models\ThreadsPublishLog;
use App\Services\TelegramNotificationService;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class ThreadsAlertService
{
    public const ALERT_NEEDS_REAUTH = 'needs_reauth';
    public const ALERT_POST_FAILED = 'post_failed';
    public const ALERT_LOW_QUOTA = 'low_quota';

    public function __construct(
        protected TelegramNotificationService $telegramService
    ) {}

    /**
     * Gửi cảnh báo Telegram khi tài khoản Threads chuyển sang trạng thái needs_reauth (HTTP 401/403 hoặc lỗi làm mới token).
     */
    public function sendNeedsReauthAlert(
        ThreadsAccount $account,
        ?string $reason = null,
        ?ThreadsPost $post = null
    ): bool {
        $safeReason = ThreadsTokenCipher::redactString(
            trim((string) ($reason ?: $account->last_error_message ?: 'Token hết hạn hoặc bị thu hồi (401/403).'))
        );

        $handle = $account->username ? "@{$account->username}" : $account->display_name;
        $escapedHandle = htmlspecialchars((string) $handle, ENT_QUOTES, 'UTF-8');
        $escapedGroup = htmlspecialchars((string) ($account->app_group ?: 'primary_dev_app'), ENT_QUOTES, 'UTF-8');
        $escapedReason = htmlspecialchars($safeReason, ENT_QUOTES, 'UTF-8');

        $lines = [
            '<b>[THREADS ALERT] Tài khoản cần kết nối lại OAuth (needs_reauth)</b>',
            "Tài khoản: <b>{$escapedHandle}</b> (#{$account->id})",
            "Nhóm Meta App: <code>{$escapedGroup}</code>",
        ];

        if ($post !== null) {
            $lines[] = "Bài đăng bị dừng: <code>#{$post->id}</code>";
        }

        $lines[] = "Nguyên nhân: {$escapedReason}";

        $htmlMessage = implode("\n", $lines);

        return $this->dispatchAlert(
            self::ALERT_NEEDS_REAUTH,
            $htmlMessage,
            (int) $account->getKey(),
            $post ? (int) $post->getKey() : null,
            [
                'alert_type' => self::ALERT_NEEDS_REAUTH,
                'account_id' => (int) $account->getKey(),
                'username'   => $account->username,
                'app_group'  => $account->app_group,
                'post_id'    => $post ? (int) $post->getKey() : null,
                'reason'     => $safeReason,
            ]
        );
    }

    /**
     * Alias cho sendNeedsReauthAlert.
     */
    public function alertAccountNeedsReauth(
        ThreadsAccount $account,
        ?string $reason = null,
        ?ThreadsPost $post = null
    ): bool {
        return $this->sendNeedsReauthAlert($account, $reason, $post);
    }

    /**
     * Alias cho sendNeedsReauthAlert.
     */
    public function notifyNeedsReauth(
        ThreadsAccount $account,
        ?string $reason = null,
        ?ThreadsPost $post = null
    ): bool {
        return $this->sendNeedsReauthAlert($account, $reason, $post);
    }

    /**
     * Gửi cảnh báo Telegram khi bài đăng chuyển sang trạng thái failed sau tối đa số lần retry (3 lần).
     */
    public function sendPostFailedAlert(
        ThreadsPost $post,
        ?string $reason = null,
        ?ThreadsAccount $account = null
    ): bool {
        $account = $account ?? (method_exists($post, 'account') ? $post->account : null);
        $safeReason = ThreadsTokenCipher::redactString(
            trim((string) ($reason ?: $post->error_message ?: 'Xuất bản thất bại sau tối đa số lần thử lại.'))
        );

        $handle = $account
            ? ($account->username ? "@{$account->username}" : $account->display_name)
            : "Account #{$post->account_id}";

        $escapedHandle = htmlspecialchars((string) $handle, ENT_QUOTES, 'UTF-8');
        $escapedErrorCode = htmlspecialchars((string) ($post->error_code ?: 'PUBLISH_FAILED'), ENT_QUOTES, 'UTF-8');
        $escapedReason = htmlspecialchars($safeReason, ENT_QUOTES, 'UTF-8');

        $htmlMessage = implode("\n", [
            '<b>[THREADS ALERT] Bài đăng thất bại sau ' . (int) $post->retry_count . ' lần retry</b>',
            "Bài đăng: <code>#{$post->id}</code> ({$post->media_type})",
            "Tài khoản: <b>{$escapedHandle}</b>",
            "Mã lỗi: <code>{$escapedErrorCode}</code>",
            "Chi tiết: {$escapedReason}",
        ]);

        return $this->dispatchAlert(
            self::ALERT_POST_FAILED,
            $htmlMessage,
            $account ? (int) $account->getKey() : (int) $post->account_id,
            (int) $post->getKey(),
            [
                'alert_type'  => self::ALERT_POST_FAILED,
                'post_id'     => (int) $post->getKey(),
                'account_id'  => $account ? (int) $account->getKey() : (int) $post->account_id,
                'retry_count' => (int) $post->retry_count,
                'error_code'  => $post->error_code,
                'reason'      => $safeReason,
            ]
        );
    }

    /**
     * Alias cho sendPostFailedAlert.
     */
    public function alertPostFailed(
        ThreadsPost $post,
        ?string $reason = null,
        ?ThreadsAccount $account = null
    ): bool {
        return $this->sendPostFailedAlert($post, $reason, $account);
    }

    /**
     * Alias cho sendPostFailedAlert.
     */
    public function notifyPostFailed(
        ThreadsPost $post,
        ?string $reason = null,
        ?ThreadsAccount $account = null
    ): bool {
        return $this->sendPostFailedAlert($post, $reason, $account);
    }

    /**
     * Gửi cảnh báo Telegram khi hạn mức threads_publishing_limit còn dưới ngưỡng an toàn (< 10%).
     */
    public function sendLowQuotaAlert(
        ThreadsAccount $account,
        int $quotaUsed,
        int $quotaTotal,
        ?ThreadsPost $post = null
    ): bool {
        $quotaTotal = max(1, $quotaTotal);
        $quotaRemaining = max(0, $quotaTotal - $quotaUsed);
        $remainingPercent = round(($quotaRemaining / $quotaTotal) * 100, 2);

        $handle = $account->username ? "@{$account->username}" : $account->display_name;
        $escapedHandle = htmlspecialchars((string) $handle, ENT_QUOTES, 'UTF-8');

        $htmlMessage = implode("\n", [
            '<b>[THREADS ALERT] Hạn mức xuất bản 24h chạm ngưỡng cảnh báo (&lt; 10%)</b>',
            "Tài khoản: <b>{$escapedHandle}</b> (#{$account->id})",
            "Đã dùng: <b>{$quotaUsed}/{$quotaTotal}</b> (Còn lại: <b>{$quotaRemaining}</b> bài ~ {$remainingPercent}%)",
        ]);

        return $this->dispatchAlert(
            self::ALERT_LOW_QUOTA,
            $htmlMessage,
            (int) $account->getKey(),
            $post ? (int) $post->getKey() : null,
            [
                'alert_type'        => self::ALERT_LOW_QUOTA,
                'account_id'        => (int) $account->getKey(),
                'username'          => $account->username,
                'post_id'           => $post ? (int) $post->getKey() : null,
                'quota_used'        => $quotaUsed,
                'quota_total'       => $quotaTotal,
                'quota_remaining'   => $quotaRemaining,
                'remaining_percent' => $remainingPercent,
            ]
        );
    }

    /**
     * Alias cho sendLowQuotaAlert.
     */
    public function alertLowQuota(
        ThreadsAccount $account,
        int $quotaUsed,
        int $quotaTotal,
        ?ThreadsPost $post = null
    ): bool {
        return $this->sendLowQuotaAlert($account, $quotaUsed, $quotaTotal, $post);
    }

    /**
     * Alias cho sendLowQuotaAlert.
     */
    public function notifyLowQuota(
        ThreadsAccount $account,
        int $quotaUsed,
        int $quotaTotal,
        ?ThreadsPost $post = null
    ): bool {
        return $this->sendLowQuotaAlert($account, $quotaUsed, $quotaTotal, $post);
    }

    /**
     * Giải quyết danh sách Telegram đích nhận cảnh báo vận hành Threads.
     *
     * @return array<int, array{chat_id: string, thread_id: ?string}>
     */
    protected function resolveTargets(): array
    {
        $targets = [];

        $configuredChatId = trim((string) config('threads.telegram_alert_chat_id', ''));
        if ($configuredChatId !== '') {
            $targets[] = [
                'chat_id'   => $configuredChatId,
                'thread_id' => null,
            ];
        }

        if (empty($targets) && class_exists(TelegramRecipient::class)) {
            try {
                if (Schema::hasTable('telegram_recipients')) {
                    $recipients = TelegramRecipient::query()
                        ->where('is_active', true)
                        ->whereNotNull('telegram_chat_id')
                        ->where('telegram_chat_id', '!=', '')
                        ->limit(5)
                        ->get(['telegram_chat_id', 'telegram_thread_id']);

                    foreach ($recipients as $recipient) {
                        $targets[] = [
                            'chat_id'   => (string) $recipient->telegram_chat_id,
                            'thread_id' => $recipient->telegram_thread_id ? (string) $recipient->telegram_thread_id : null,
                        ];
                    }
                }
            } catch (\Throwable) {
                // Bỏ qua nếu bảng telegram_recipients chưa được migrate trong test cô lập
            }
        }

        $botToken = trim((string) config('services.telegram.bot_token', env('TELEGRAM_BOT_TOKEN', '')));
        if (empty($targets) && $botToken !== '') {
            $targets[] = [
                'chat_id'   => 'threads_ops_alert_channel',
                'thread_id' => null,
            ];
        }

        return $targets;
    }

    /**
     * Thực thi gửi cảnh báo qua TelegramNotificationService và ghi nhận vào bảng threads_publish_logs.
     *
     * @param  array<string, mixed>  $contextPayload
     */
    protected function dispatchAlert(
        string $alertType,
        string $htmlMessage,
        ?int $accountId,
        ?int $postId,
        array $contextPayload = []
    ): bool {
        $startTime = microtime(true);
        $targets = $this->resolveTargets();
        $sentAny = false;
        $sentChatIds = [];

        foreach ($targets as $target) {
            try {
                $ok = $this->telegramService->sendMessage(
                    $target['chat_id'],
                    $htmlMessage,
                    $target['thread_id']
                );
                if ($ok) {
                    $sentAny = true;
                    $sentChatIds[] = $target['chat_id'];
                }
            } catch (\Throwable $e) {
                Log::warning('ThreadsAlertService: Telegram sendMessage failed: ' . $e->getMessage());
            }
        }

        $durationMs = (int) round((microtime(true) - $startTime) * 1000);

        if (class_exists(ThreadsPublishLog::class)) {
            try {
                if (Schema::hasTable('threads_publish_logs')) {
                    ThreadsPublishLog::create([
                        'account_id'       => $accountId,
                        'post_id'          => $postId,
                        'action'           => ThreadsPublishLog::ACTION_ALERT_SENT,
                        'http_status'      => $sentAny ? 200 : 202,
                        'request_payload'  => ThreadsTokenCipher::redact(array_merge($contextPayload, [
                            'alert_type' => $alertType,
                            'targets'    => array_column($targets, 'chat_id'),
                        ])),
                        'response_payload' => [
                            'sent'          => $sentAny,
                            'sent_chat_ids' => $sentChatIds,
                        ],
                        'duration_ms'      => max(0, $durationMs),
                        'created_at'       => now(),
                    ]);
                }
            } catch (\Throwable $e) {
                Log::warning('ThreadsAlertService: Failed to record alert_sent log: ' . $e->getMessage());
            }
        }

        return $sentAny;
    }
}
