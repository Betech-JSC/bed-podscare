<?php

namespace App\Services;

use App\Models\RepairOrder;
use App\Models\TelegramRecipient;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TelegramNotificationService
{
    /**
     * Lấy Bot Token từ config hoặc fallback sang biến môi trường.
     */
    protected function resolveBotToken(): string
    {
        $token = trim((string) config('services.telegram.bot_token', ''));
        if ($token === '') {
            $token = trim((string) env('TELEGRAM_BOT_TOKEN', ''));
        }

        return $token;
    }

    /**
     * Gửi tin nhắn HTML qua Telegram Bot API (Fail-safe).
     */
    public function sendMessage(
        string $chatId,
        string $htmlText,
        ?string $threadId = null,
        ?array $inlineKeyboard = null
    ): bool {
        $token = $this->resolveBotToken();
        if ($token === '') {
            Log::warning('TelegramNotificationService: TELEGRAM_BOT_TOKEN is not configured.');
            return false;
        }

        $payload = [
            'chat_id'                  => $chatId,
            'text'                     => $htmlText,
            'parse_mode'               => 'HTML',
            'disable_web_page_preview' => true,
        ];

        if ($threadId !== null && trim($threadId) !== '') {
            $payload['message_thread_id'] = is_numeric($threadId) ? (int) $threadId : $threadId;
        }

        if (! empty($inlineKeyboard)) {
            $payload['reply_markup'] = [
                'inline_keyboard' => $inlineKeyboard,
            ];
        }

        try {
            $response = Http::connectTimeout(5)
                ->timeout(8)
                ->withOptions(['force_ip_resolve' => 'v4'])
                ->post(
                    "https://api.telegram.org/bot{$token}/sendMessage",
                    $payload
                );

            if ((! $response->successful() || ! $response->json('ok', true)) && ! empty($inlineKeyboard) && $response->status() === 400) {
                unset($payload['reply_markup']);
                $response = Http::connectTimeout(5)
                    ->timeout(8)
                    ->withOptions(['force_ip_resolve' => 'v4'])
                    ->post(
                        "https://api.telegram.org/bot{$token}/sendMessage",
                        $payload
                    );
            }

            if (! $response->successful() || ! $response->json('ok', true)) {
                Log::warning('Telegram sendMessage failed', [
                    'chat_id' => $chatId,
                    'status'  => $response->status(),
                    'body'    => $response->body(),
                ]);
                return false;
            }

            return true;
        } catch (\Throwable $e) {
            Log::error('Telegram sendMessage exception: ' . $e->getMessage(), [
                'chat_id' => $chatId,
            ]);
            return false;
        }
    }

    /**
     * Kiểm tra URL có phải là public HTTP/HTTPS hợp lệ cho Telegram inline_keyboard hay không.
     * Telegram Bot API từ chối URL chứa localhost hoặc IP loopback (127.0.0.1, ::1).
     */
    protected function isPublicWebUrl(string $url): bool
    {
        $url = trim($url);
        if (! preg_match('#^https?://#i', $url)) {
            return false;
        }

        $host = strtolower(trim((string) parse_url($url, PHP_URL_HOST), '[]'));
        if (
            $host === ''
            || in_array($host, ['localhost', '127.0.0.1', '::1', '0.0.0.0'], true)
            || str_ends_with($host, '.local')
            || str_ends_with($host, '.test')
        ) {
            return false;
        }

        return true;
    }

    /**
     * Xử lý lệnh /start <connect_token> để liên kết số điện thoại với Telegram Chat ID.
     */
    public function handleStartCommand(string $connectToken, string $chatId): ?TelegramRecipient
    {
        $connectToken = trim($connectToken);
        $chatId = trim($chatId);

        if ($connectToken === '' || $chatId === '') {
            return null;
        }

        $recipient = TelegramRecipient::where('connect_token', $connectToken)->first();
        if (! $recipient) {
            return null;
        }

        $recipient->telegram_chat_id = $chatId;
        $recipient->connected_at = now();
        $recipient->save();

        $phone = $this->escapeHtml((string) $recipient->phone);
        $label = $this->escapeHtml((string) $recipient->label);

        $welcomeMessage = "<b>Đã kích hoạt nhận thông báo Telegram!</b>\n"
            . "Số điện thoại: <b>{$phone}</b> ({$label})\n"
            . "Bạn sẽ tự động nhận thông báo ngay khi có đơn sửa chữa mới.";

        $this->sendMessage($chatId, $welcomeMessage, $recipient->telegram_thread_id);

        return $recipient;
    }

    /**
     * Tìm bản ghi người nhận tương ứng với nội dung tin nhắn (/start <token>, /start thuần trên Telegram Web, hoặc SĐT/mã kết nối).
     */
    protected function resolveRecipientFromMessage(string $text, ?int $tenantId = null): ?TelegramRecipient
    {
        $text = trim($text);
        if ($text === '') {
            return null;
        }

        // Trường hợp 1: /start <connect_token_hoặc_sđt>
        if (preg_match('#^/start(?:@\S+)?\s+(.+)$#i', $text, $matches)) {
            $param = trim($matches[1]);
            if ($param === '') {
                return null;
            }

            $query = TelegramRecipient::query()->where(function ($q) use ($param) {
                $q->where('connect_token', $param)
                    ->orWhere('phone', $param);
            });

            if ($tenantId !== null) {
                $query->where('tenant_id', $tenantId);
            }

            return $query->orderByDesc('id')->first();
        }

        // Trường hợp 2: /start thuần (Telegram Web làm rớt ?start=<token>) -> lấy bản ghi đang chờ kích hoạt mới nhất
        if (preg_match('#^/start(?:@\S+)?$#i', $text)) {
            $query = TelegramRecipient::query()
                ->where('is_active', true)
                ->where(function ($q) {
                    $q->whereNull('telegram_chat_id')
                        ->orWhere('telegram_chat_id', '');
                });

            if ($tenantId !== null) {
                $query->where('tenant_id', $tenantId);
            }

            return $query->orderByDesc('id')->first();
        }

        // Trường hợp 3: Nhập trực tiếp mã adm_... hoặc số điện thoại
        if (str_starts_with($text, 'adm_')) {
            $query = TelegramRecipient::query()->where('connect_token', $text);
            if ($tenantId !== null) {
                $query->where('tenant_id', $tenantId);
            }
            return $query->first();
        }

        $cleanPhone = preg_replace('/[\s.\-]+/', '', $text);
        if ($cleanPhone !== null && preg_match('/^0\d{8,10}$/', $cleanPhone)) {
            $query = TelegramRecipient::query()
                ->where('phone', $cleanPhone)
                ->where(function ($q) {
                    $q->whereNull('telegram_chat_id')
                        ->orWhere('telegram_chat_id', '');
                });

            if ($tenantId !== null) {
                $query->where('tenant_id', $tenantId);
            }

            return $query->orderByDesc('id')->first();
        }

        return null;
    }

    /**
     * Xử lý payload update từ Webhook Telegram.
     */
    public function handleWebhookUpdate(array $update): ?TelegramRecipient
    {
        $text = trim((string) data_get($update, 'message.text', ''));
        $chatId = trim((string) data_get($update, 'message.chat.id', ''));

        if ($chatId === '' || $text === '') {
            return null;
        }

        $recipient = $this->resolveRecipientFromMessage($text);
        if (! $recipient) {
            return null;
        }

        return $this->handleStartCommand((string) $recipient->connect_token, $chatId);
    }

    /**
     * Chủ động đồng bộ các lệnh /start qua getUpdates (hỗ trợ Localhost & Telegram Web).
     */
    public function syncUpdates(?int $tenantId = null): int
    {
        $token = $this->resolveBotToken();
        if ($token === '') {
            return 0;
        }

        try {
            $response = Http::connectTimeout(5)
                ->timeout(8)
                ->withOptions(['force_ip_resolve' => 'v4'])
                ->get("https://api.telegram.org/bot{$token}/getUpdates");
            if (! $response->successful()) {
                return 0;
            }

            $updates = $response->json('result', []);
            if (! is_array($updates) || empty($updates)) {
                return 0;
            }

            $syncedCount = 0;
            foreach (array_reverse($updates) as $update) {
                $text = trim((string) data_get($update, 'message.text', ''));
                $chatId = trim((string) data_get($update, 'message.chat.id', ''));

                if ($chatId === '' || $text === '') {
                    continue;
                }

                $recipient = $this->resolveRecipientFromMessage($text, $tenantId);
                if (! $recipient) {
                    continue;
                }

                if (empty($recipient->telegram_chat_id) || (string) $recipient->telegram_chat_id !== $chatId) {
                    $this->handleStartCommand((string) $recipient->connect_token, $chatId);
                    $syncedCount++;
                }
            }

            return $syncedCount;
        } catch (\Throwable $e) {
            Log::error('Telegram syncUpdates failed: ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * Tự động gửi thông báo đơn sửa chữa mới (order.created) cho tất cả SĐT Admin hợp lệ.
     */
    public function notifyNewOrder(RepairOrder $order): int
    {
        try {
            $order->loadMissing(['customer', 'deviceModel', 'branch', 'createdByUser']);

            $tenantId = $order->tenant_id ?? $order->branch?->tenant_id;
            if (! $tenantId) {
                return 0;
            }

            $hasPending = TelegramRecipient::query()
                ->where('tenant_id', $tenantId)
                ->where('is_active', true)
                ->where(function ($q) {
                    $q->whereNull('telegram_chat_id')
                        ->orWhere('telegram_chat_id', '');
                })
                ->exists();

            if ($hasPending) {
                $this->syncUpdates((int) $tenantId);
            }

            $recipients = TelegramRecipient::query()
                ->where('tenant_id', $tenantId)
                ->where('is_active', true)
                ->whereNotNull('telegram_chat_id')
                ->where('telegram_chat_id', '!=', '')
                ->where('target_role', 'admin')
                ->where(function ($q) use ($order) {
                    $q->whereNull('branch_id')
                        ->orWhere('branch_id', $order->branch_id);
                })
                ->get()
                ->filter(function (TelegramRecipient $recipient) {
                    $events = $recipient->subscribed_events;
                    if (! is_array($events) || empty($events)) {
                        $events = ['order.created'];
                    }
                    return in_array('order.created', $events, true);
                });

            if ($recipients->isEmpty()) {
                return 0;
            }

            $orderCode = $this->escapeHtml((string) $order->order_code);
            $branchName = $this->escapeHtml((string) ($order->branch?->name ?? 'Mặc định'));
            $customerName = $this->escapeHtml((string) ($order->customer?->name ?? 'Khách lẻ'));
            $customerPhone = $this->escapeHtml((string) ($order->customer?->phone ?? 'N/A'));
            $deviceName = $this->escapeHtml((string) ($order->deviceModel?->name ?? 'Thiết bị'));
            $issueDescription = $this->escapeHtml((string) ($order->issue_description ?? 'Không rõ'));
            $formattedPrice = number_format((float) ($order->total_price ?? 0), 0, ',', '.') . ' đ';
            $creatorName = $this->escapeHtml((string) ($order->createdByUser?->name ?? 'Nhân viên'));
            $createdAtStr = now()->format('H:i - d/m/Y');

            $orderType = (string) ($order->order_type ?? 'in_store');
            $orderTypeLabel = match ($orderType) {
                'cod'      => 'Đơn COD (Khách tỉnh)',
                'warranty' => 'Tiếp nhận bảo hành',
                default    => 'Khách tại cửa hàng',
            };

            $shippingLine = '';
            if ($orderType === 'cod' && trim((string) $order->shipping_address) !== '') {
                $shippingAddress = $this->escapeHtml(trim((string) $order->shipping_address));
                $shippingLine = "<b>Địa chỉ COD:</b> {$shippingAddress}\n";
            }

            $htmlText = "<b>ĐƠN SỬA CHỮA MỚI #{$orderCode}</b>\n"
                . "━━━━━━━━━━━━━━━━━━\n"
                . "<b>Chi nhánh:</b> {$branchName}\n"
                . "<b>Phân loại:</b> {$orderTypeLabel}\n"
                . "<b>Khách hàng:</b> {$customerName} - <code>{$customerPhone}</code>\n"
                . $shippingLine
                . "<b>Thiết bị:</b> {$deviceName}\n"
                . "<b>Tình trạng lỗi:</b> {$issueDescription}\n"
                . "<b>Giá dự kiến:</b> <b>{$formattedPrice}</b>\n"
                . "<b>Người tiếp nhận:</b> {$creatorName}\n"
                . "<b>Thời gian:</b> {$createdAtStr}";

            $frontendUrl = trim((string) config('services.telegram.frontend_url', ''));
            $inlineKeyboard = null;
            if ($this->isPublicWebUrl($frontendUrl)) {
                $orderUrl = rtrim($frontendUrl, '/') . "/repairs?id={$order->id}";
                $inlineKeyboard = [
                    [
                        [
                            'text' => "Mở xem đơn #{$order->order_code}",
                            'url'  => $orderUrl,
                        ],
                    ],
                ];
            }

            $sentCount = 0;
            foreach ($recipients as $recipient) {
                $ok = $this->sendMessage(
                    (string) $recipient->telegram_chat_id,
                    $htmlText,
                    $recipient->telegram_thread_id,
                    $inlineKeyboard
                );
                if ($ok) {
                    $sentCount++;
                }
            }

            return $sentCount;
        } catch (\Throwable $e) {
            Log::error('Telegram notifyNewOrder failed: ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * Escape HTML an toàn cho Telegram parse_mode=HTML.
     */
    protected function escapeHtml(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
