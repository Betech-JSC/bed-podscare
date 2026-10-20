<?php

namespace App\Services;

use App\Models\RepairOrder;
use App\Models\TelegramRecipient;
use App\Services\TelegramAi\TelegramAiAssistantService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TelegramNotificationService
{
    public const WEBHOOK_IDEMPOTENCY_TTL_SECONDS = 300;
    public const MAX_SAFE_HTML_LENGTH = 3900;

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
     * Gửi trạng thái hoạt động (typing) qua Telegram Bot API (Fail-safe).
     */
    public function sendChatAction(
        string $chatId,
        string $action = 'typing',
        ?string $threadId = null
    ): void {
        $token = $this->resolveBotToken();
        if ($token === '' || trim($chatId) === '') {
            return;
        }

        $payload = [
            'chat_id' => $chatId,
            'action'  => $action,
        ];

        if ($threadId !== null && trim($threadId) !== '') {
            $payload['message_thread_id'] = is_numeric($threadId) ? (int) $threadId : $threadId;
        }

        try {
            Http::connectTimeout(3)
                ->timeout(3)
                ->withOptions(['force_ip_resolve' => 'v4'])
                ->post("https://api.telegram.org/bot{$token}/sendChatAction", $payload);
        } catch (\Throwable $e) {
            // Bỏ qua lỗi sendChatAction để không ảnh hưởng luồng chính
        }
    }

    /**
     * Cắt gọn an toàn chuỗi HTML gửi qua Telegram khi vượt quá ngưỡng ký tự cho phép (mặc định 3900 ký tự UTF-8):
     * - Ưu tiên cắt ở vị trí xuống dòng (\n) hoặc khoảng trắng gần nhất.
     * - Đảm bảo không cắt ngang giữa thẻ HTML (<...>) hoặc thực thể HTML (&...;).
     * - Tự động đóng toàn bộ các thẻ HTML còn mở (<b>, <strong>, <i>, <em>, <u>, <ins>, <s>, <strike>, <del>, <code>, <pre>, <a>) theo thứ tự LIFO.
     * - Nối thêm dòng ghi chú hướng dẫn lọc hẹp từ khóa/khoảng ngày và đảm bảo tổng độ dài cuối cùng <= 4096 ký tự.
     */
    public function truncateTelegramHtmlSafely(string $html, int $maxLength = self::MAX_SAFE_HTML_LENGTH): string
    {
        if (mb_strlen($html, 'UTF-8') <= $maxLength) {
            return $html;
        }

        $suffix = "\n\n<i>... (Danh sách còn tiếp, vui lòng lọc hẹp từ khóa hoặc khoảng ngày để xem chi tiết)</i>";
        $suffixLen = mb_strlen($suffix, 'UTF-8');
        $reservedForClosingTags = 64;
        $cutLimit = max(100, $maxLength - $suffixLen - $reservedForClosingTags);

        $slice = mb_substr($html, 0, $cutLimit, 'UTF-8');

        // Ưu tiên cắt tại dấu xuống dòng (\n) hoặc khoảng trắng gần nhất để không đứt giữa dòng/từ
        $minAcceptableCut = (int) floor($cutLimit * 0.6);
        $lastNewline = mb_strrpos($slice, "\n", 0, 'UTF-8');
        if ($lastNewline !== false && $lastNewline >= $minAcceptableCut) {
            $slice = mb_substr($slice, 0, $lastNewline, 'UTF-8');
        } else {
            $lastSpace = mb_strrpos($slice, ' ', 0, 'UTF-8');
            if ($lastSpace !== false && $lastSpace >= $minAcceptableCut) {
                $slice = mb_substr($slice, 0, $lastSpace, 'UTF-8');
            }
        }

        // Nếu cắt trúng giữa một thẻ HTML đang mở (<... mà chưa có >), cắt lùi về trước dấu <
        $lastOpenAngle = mb_strrpos($slice, '<', 0, 'UTF-8');
        $lastCloseAngle = mb_strrpos($slice, '>', 0, 'UTF-8');
        if ($lastOpenAngle !== false && ($lastCloseAngle === false || $lastOpenAngle > $lastCloseAngle)) {
            $slice = mb_substr($slice, 0, $lastOpenAngle, 'UTF-8');
        }

        // Loại bỏ thực thể HTML bị cắt dở ở cuối chuỗi (ví dụ &quot, &amp, &#123)
        $slice = preg_replace('/&[a-zA-Z0-9#]*$/u', '', $slice) ?? $slice;
        $slice = rtrim($slice);

        // Quét các thẻ HTML đã mở và đóng theo thứ tự LIFO
        $openTags = [];
        if (preg_match_all('/<(\/?)(b|strong|i|em|u|ins|s|strike|del|code|pre|a)\b[^>]*>/iu', $slice, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $fullTag = $match[0];
                $isClosing = $match[1] === '/';
                $tagName = strtolower($match[2]);

                if (! $isClosing && str_ends_with(rtrim($fullTag, '>'), '/')) {
                    continue;
                }

                if (! $isClosing) {
                    $openTags[] = $tagName;
                } else {
                    for ($idx = count($openTags) - 1; $idx >= 0; $idx--) {
                        if ($openTags[$idx] === $tagName) {
                            array_splice($openTags, $idx, 1);
                            break;
                        }
                    }
                }
            }
        }

        $closingTags = '';
        foreach (array_reverse($openTags) as $openTag) {
            $closingTags .= "</{$openTag}>";
        }

        return $slice . $closingTags . $suffix;
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

        if (mb_strlen($htmlText, 'UTF-8') > self::MAX_SAFE_HTML_LENGTH) {
            $htmlText = $this->truncateTelegramHtmlSafely($htmlText, self::MAX_SAFE_HTML_LENGTH);
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

        $recipient = TelegramRecipient::where('connect_token', $connectToken)
            ->where('is_active', true)
            ->first();
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
     * Tìm bản ghi người nhận tương ứng với nội dung tin nhắn (/start <token>, hoặc SĐT đang chờ kích hoạt / mã kết nối).
     * Tuyệt đối KHÔNG tự động liên kết lệnh /start trống (không kèm connect_token) để tránh chiếm quyền bản ghi đang chờ.
     */
    protected function resolveRecipientFromMessage(string $text, ?int $tenantId = null): ?TelegramRecipient
    {
        $text = trim($text);
        if ($text === '') {
            return null;
        }

        // Trường hợp 1: /start <connect_token_hoặc_sđt_đang_chờ>
        if (preg_match('#^/start(?:@\S+)?\s+(.+)$#i', $text, $matches)) {
            $param = trim($matches[1]);
            if ($param === '') {
                return null;
            }

            $cleanParamPhone = preg_replace('/[\s.\-]+/', '', $param);

            $query = TelegramRecipient::query()
                ->where('is_active', true)
                ->where(function ($q) use ($param, $cleanParamPhone) {
                    $q->where('connect_token', $param)
                        ->orWhere(function ($pq) use ($param, $cleanParamPhone) {
                            $phones = array_values(array_unique(array_filter([$param, (string) $cleanParamPhone])));
                            $pq->whereIn('phone', $phones)
                                ->where(function ($sub) {
                                    $sub->whereNull('telegram_chat_id')
                                        ->orWhere('telegram_chat_id', '');
                                });
                        });
                });

            if ($tenantId !== null) {
                $query->where('tenant_id', $tenantId);
            }

            return $query->orderByDesc('id')->first();
        }

        // Lệnh /start thuần không kèm tham số -> từ chối liên kết tự động
        if (preg_match('#^/start(?:@\S+)?$#i', $text)) {
            return null;
        }

        // Trường hợp 2: Nhập trực tiếp mã adm_... hoặc số điện thoại đang chờ kích hoạt
        if (str_starts_with($text, 'adm_')) {
            $query = TelegramRecipient::query()
                ->where('is_active', true)
                ->where('connect_token', $text);
            if ($tenantId !== null) {
                $query->where('tenant_id', $tenantId);
            }
            return $query->first();
        }

        $cleanPhone = preg_replace('/[\s.\-]+/', '', $text);
        if ($cleanPhone !== null && preg_match('/^0\d{8,10}$/', $cleanPhone)) {
            $query = TelegramRecipient::query()
                ->where('is_active', true)
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
     * Thiết lập khóa chống lặp Idempotency cho Webhook Telegram theo cả update_id và cặp chat_id + message_id.
     * Trả về false nếu phát hiện bản cập nhật hoặc tin nhắn đã được xử lý trước đó.
     */
    public function acquireWebhookIdempotencyLock(
        array $update,
        int $ttlSeconds = self::WEBHOOK_IDEMPOTENCY_TTL_SECONDS
    ): bool {
        $ttl = max(self::WEBHOOK_IDEMPOTENCY_TTL_SECONDS, $ttlSeconds);

        $rawUpdateId = data_get($update, 'update_id');
        $updateId = $rawUpdateId !== null ? trim((string) $rawUpdateId) : '';

        $chatId = trim((string) data_get($update, 'message.chat.id', ''));
        $rawMessageId = data_get($update, 'message.message_id');
        $messageId = $rawMessageId !== null ? trim((string) $rawMessageId) : '';

        if ($updateId !== '') {
            $lockedPrimary = Cache::add("tg_webhook_update:{$updateId}", true, $ttl);
            $lockedLegacy = Cache::add("telegram_processed_update_{$updateId}", true, $ttl);
            if (! $lockedPrimary || ! $lockedLegacy) {
                Log::info('Duplicate Telegram webhook update_id ignored.', [
                    'update_id'  => $updateId,
                    'chat_id'    => $chatId,
                    'message_id' => $messageId,
                ]);
                return false;
            }
        }

        if ($chatId !== '' && $messageId !== '') {
            $lockedMsgPrimary = Cache::add("tg_webhook_msg:{$chatId}:{$messageId}", true, $ttl);
            $lockedMsgLegacy = Cache::add("telegram_processed_msg_{$chatId}_{$messageId}", true, $ttl);
            if (! $lockedMsgPrimary || ! $lockedMsgLegacy) {
                Log::info('Duplicate Telegram webhook chat_id + message_id ignored.', [
                    'update_id'  => $updateId,
                    'chat_id'    => $chatId,
                    'message_id' => $messageId,
                ]);
                return false;
            }
        }

        return true;
    }

    /**
     * Xử lý payload Webhook Telegram và trả về mảng trạng thái chi tiết kèm lý do nếu bị bỏ qua do trùng lặp.
     *
     * @return array{handled: bool, recipient_id: int|null, reason?: string}
     */
    public function handleWebhookPayload(array $update): array
    {
        if (! $this->acquireWebhookIdempotencyLock($update)) {
            return [
                'handled'      => true,
                'recipient_id' => null,
                'reason'       => 'duplicate_update_ignored',
            ];
        }

        $recipient = $this->handleWebhookUpdate($update, true);

        return [
            'handled'      => $recipient !== null,
            'recipient_id' => $recipient?->id,
        ];
    }

    /**
     * Xử lý payload update từ Webhook Telegram (Hỗ trợ cả liên kết /start và Trợ lý AI hội thoại).
     */
    public function handleWebhookUpdate(array $update, bool $idempotencyVerified = false): ?TelegramRecipient
    {
        $text = trim((string) data_get($update, 'message.text', ''));
        $chatId = trim((string) data_get($update, 'message.chat.id', ''));

        if ($chatId === '' || $text === '') {
            return null;
        }

        if (! $idempotencyVerified && ! $this->acquireWebhookIdempotencyLock($update)) {
            return null;
        }

        $isStartOrTokenCommand = (bool) preg_match('#^/start(?:\s|$|@)#i', $text) || str_starts_with($text, 'adm_');

        $activeRecipient = TelegramRecipient::with(['tenant', 'branch'])
            ->where('telegram_chat_id', $chatId)
            ->where('is_active', true)
            ->orderByDesc('id')
            ->first();

        if ($isStartOrTokenCommand || ! $activeRecipient) {
            $pendingRecipient = $this->resolveRecipientFromMessage($text);
            if ($pendingRecipient) {
                return $this->handleStartCommand((string) $pendingRecipient->connect_token, $chatId);
            }
        }

        if ($activeRecipient) {
            if ($isStartOrTokenCommand) {
                return $activeRecipient;
            }

            app(TelegramAiAssistantService::class)->handleIncomingMessage($activeRecipient, $text, $update);
            return $activeRecipient;
        }

        $unregisteredMsg = "<b>Tài khoản Telegram chưa được kích hoạt</b>\n"
            . "Vui lòng truy cập trang Cài đặt thương hiệu trên hệ thống PodsCare để thêm số điện thoại và bấm kích hoạt kết nối (<code>/start &lt;connect_token&gt;</code>).";
        $this->sendMessage($chatId, $unregisteredMsg);

        return null;
    }

    /**
     * Chủ động đồng bộ các lệnh /start và tin nhắn AI mới qua getUpdates (hỗ trợ Localhost & Telegram Web).
     */
    public function syncUpdates(?int $tenantId = null): int
    {
        $token = $this->resolveBotToken();
        if ($token === '') {
            return 0;
        }

        try {
            $offset = (int) Cache::get('telegram_last_update_offset', 0);
            $queryParams = ['timeout' => 2];
            if ($offset > 0) {
                $queryParams['offset'] = $offset;
            }

            $response = Http::connectTimeout(5)
                ->timeout(8)
                ->withOptions(['force_ip_resolve' => 'v4'])
                ->get("https://api.telegram.org/bot{$token}/getUpdates", $queryParams);

            if ($response->status() === 409) {
                Http::connectTimeout(5)
                    ->timeout(5)
                    ->withOptions(['force_ip_resolve' => 'v4'])
                    ->post("https://api.telegram.org/bot{$token}/deleteWebhook");

                $response = Http::connectTimeout(5)
                    ->timeout(8)
                    ->withOptions(['force_ip_resolve' => 'v4'])
                    ->get("https://api.telegram.org/bot{$token}/getUpdates", $queryParams);
            }

            if (! $response->successful()) {
                return 0;
            }

            $updates = $response->json('result', []);
            if (! is_array($updates) || empty($updates)) {
                return 0;
            }

            $maxUpdateId = $offset > 0 ? $offset - 1 : 0;
            foreach ($updates as $update) {
                $uid = (int) data_get($update, 'update_id', 0);
                if ($uid > $maxUpdateId) {
                    $maxUpdateId = $uid;
                }
            }

            if ($maxUpdateId > 0) {
                Cache::put('telegram_last_update_offset', $maxUpdateId + 1, now()->addDays(7));
            }

            $syncedCount = 0;
            foreach (array_reverse($updates) as $update) {
                $text = trim((string) data_get($update, 'message.text', ''));
                $chatId = trim((string) data_get($update, 'message.chat.id', ''));

                if ($chatId === '' || $text === '') {
                    continue;
                }

                $recipient = $this->resolveRecipientFromMessage($text, $tenantId);
                if ($recipient) {
                    if (empty($recipient->telegram_chat_id) || (string) $recipient->telegram_chat_id !== $chatId) {
                        $this->handleStartCommand((string) $recipient->connect_token, $chatId);
                        $syncedCount++;
                    }
                    continue;
                }

                $updateId = data_get($update, 'update_id');
                $messageDate = (int) data_get($update, 'message.date', 0);
                if ($updateId !== null && $messageDate > 0 && $messageDate >= now()->subMinutes(2)->timestamp) {
                    if ($this->acquireWebhookIdempotencyLock($update, 86400)) {
                        $activeQuery = TelegramRecipient::with(['tenant', 'branch'])
                            ->where('telegram_chat_id', $chatId)
                            ->where('is_active', true);

                        if ($tenantId !== null) {
                            $activeQuery->where('tenant_id', $tenantId);
                        }

                        $activeRecipient = $activeQuery->orderByDesc('id')->first();
                        if ($activeRecipient) {
                            app(TelegramAiAssistantService::class)->handleIncomingMessage($activeRecipient, $text, $update);
                            $syncedCount++;
                        }
                    }
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
