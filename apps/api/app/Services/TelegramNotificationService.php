<?php

namespace App\Services;

use App\Events\OrderOperationalEvent;
use App\Models\Notification;
use App\Models\RepairOrder;
use App\Models\TelegramRecipient;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TelegramNotificationService
{
    public const WEBHOOK_IDEMPOTENCY_TTL_SECONDS = 300;
    public const MAX_SAFE_HTML_LENGTH = 3900;

    protected ?int $lastSentMessageId = null;

    /**
     * Lấy ID tin nhắn Telegram vừa gửi thành công gần nhất.
     */
    public function getLastSentMessageId(): ?int
    {
        return $this->lastSentMessageId;
    }

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
        $this->lastSentMessageId = null;

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

            $msgId = $response->json('result.message_id');
            if ($msgId !== null && is_numeric($msgId)) {
                $this->lastSentMessageId = (int) $msgId;
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
     * Cập nhật nội dung và nút bấm của một tin nhắn Telegram đã gửi (editMessageText).
     */
    public function editMessageText(
        string $chatId,
        int $messageId,
        string $htmlText,
        ?array $inlineKeyboard = null
    ): bool {
        $token = $this->resolveBotToken();
        if ($token === '' || trim($chatId) === '' || $messageId <= 0) {
            return false;
        }

        if (mb_strlen($htmlText, 'UTF-8') > self::MAX_SAFE_HTML_LENGTH) {
            $htmlText = $this->truncateTelegramHtmlSafely($htmlText, self::MAX_SAFE_HTML_LENGTH);
        }

        $payload = [
            'chat_id'                  => $chatId,
            'message_id'               => $messageId,
            'text'                     => $htmlText,
            'parse_mode'               => 'HTML',
            'disable_web_page_preview' => true,
            'reply_markup'             => [
                'inline_keyboard' => $inlineKeyboard ?? [],
            ],
        ];

        try {
            $response = Http::connectTimeout(5)
                ->timeout(8)
                ->withOptions(['force_ip_resolve' => 'v4'])
                ->post("https://api.telegram.org/bot{$token}/editMessageText", $payload);

            return $response->successful() && (bool) $response->json('ok', true);
        } catch (\Throwable $e) {
            Log::warning('Telegram editMessageText exception: ' . $e->getMessage(), [
                'chat_id'    => $chatId,
                'message_id' => $messageId,
            ]);
            return false;
        }
    }

    /**
     * Phản hồi Callback Query khi người dùng bấm nút Inline Keyboard trên Telegram.
     */
    public function answerCallbackQuery(
        string $callbackQueryId,
        string $text = '',
        bool $showAlert = false
    ): bool {
        $token = $this->resolveBotToken();
        if ($token === '' || trim($callbackQueryId) === '') {
            return false;
        }

        $payload = [
            'callback_query_id' => $callbackQueryId,
            'show_alert'        => $showAlert,
        ];
        if (trim($text) !== '') {
            $payload['text'] = mb_substr(trim($text), 0, 195, 'UTF-8');
        }

        try {
            $response = Http::connectTimeout(4)
                ->timeout(5)
                ->withOptions(['force_ip_resolve' => 'v4'])
                ->post("https://api.telegram.org/bot{$token}/answerCallbackQuery", $payload);

            return $response->successful();
        } catch (\Throwable $e) {
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
     * Xử lý lệnh /start <connect_token> để liên kết số điện thoại (và Topic ID nếu gõ trong Topic) với Telegram Chat ID.
     */
    public function handleStartCommand(
        string $connectToken,
        string $chatId,
        ?string $threadId = null,
        ?string $telegramUserId = null
    ): ?TelegramRecipient {
        $connectToken = trim($connectToken);
        $chatId = trim($chatId);

        if ($connectToken === '' || $chatId === '') {
            return null;
        }

        $recipient = TelegramRecipient::with('user')
            ->where('connect_token', $connectToken)
            ->where('is_active', true)
            ->first();
        if (! $recipient) {
            return null;
        }

        $normalizedThreadId = $threadId !== null ? trim($threadId) : '';
        $isTechRole = in_array($recipient->target_role, ['technician', 'tech'], true);

        // Khóa bảo mật 1: Một khi kết nối đã gắn với một chat_id, tuyệt đối chặn chat_id khác dùng lại connect_token để chiếm quyền
        if (! empty($recipient->telegram_chat_id) && (string) $recipient->telegram_chat_id !== $chatId) {
            $rejectMsg = "<b>🔒 Từ chối kích hoạt: Kết nối đã được khóa bảo mật</b>\n"
                . "Mã kết nối này đã được liên kết với một thiết bị/đoạn hội thoại Telegram khác.\n"
                . "Để chống mạo danh và chiếm quyền xem dữ liệu, mã kết nối đang hoạt động không thể kích hoạt đè sang tài khoản khác.\n"
                . "Nếu bạn là Quản trị viên và muốn đổi thiết bị, vui lòng xóa kết nối cũ và tạo lại trên trang Cài đặt thương hiệu.";
            $this->sendMessage($chatId, $rejectMsg, $normalizedThreadId !== '' ? $normalizedThreadId : null);

            return null;
        }

        // Khóa bảo mật 2: Chống gộp chung Admin (có giá) và KTV (ẩn giá) trên cùng 1 đoạn hội thoại cá nhân (không có Topic ID)
        if ($normalizedThreadId === '') {
            if ($isTechRole) {
                $existingAdminOnSamePrivateChat = TelegramRecipient::query()
                    ->where('id', '!=', $recipient->id)
                    ->where('telegram_chat_id', $chatId)
                    ->where('target_role', 'admin')
                    ->where('is_active', true)
                    ->where(function ($q) {
                        $q->whereNull('telegram_thread_id')
                            ->orWhere('telegram_thread_id', '');
                    })
                    ->exists();

                if ($existingAdminOnSamePrivateChat) {
                    $conflictMsg = "<b>⚠️ Không thể kích hoạt KTV chung trên đoạn hội thoại của Admin!</b>\n"
                        . "Tài khoản Telegram hiện tại đang được kết nối làm kênh <b>Quản trị viên (Admin — có hiển thị doanh thu &amp; giá tiền)</b>.\n"
                        . "Nếu kích hoạt mã Kỹ thuật viên ngay trên cùng đoạn hội thoại 1-1 này, thông báo của Admin và KTV sẽ bị gộp chung.\n\n"
                        . "<b>Cách tạo đoạn hội thoại riêng biệt cho từng KTV:</b>\n"
                        . "• <b>Cách 1 (Chat 1-1 trên máy riêng của KTV):</b> Gửi link hoặc lệnh <code>/start {$this->escapeHtml($connectToken)}</code> cho Kỹ thuật viên mở trên <b>tài khoản Telegram cá nhân của KTV đó</b>.\n"
                        . "• <b>Cách 2 (Dùng Nhóm có chia Chủ đề / Topics):</b> Tạo 1 Nhóm Telegram bật chế độ <b>Topics</b>, tạo Topic riêng cho từng KTV và dán lệnh <code>/start {$this->escapeHtml($connectToken)}</code> vào đúng Topic đó.";
                    $this->sendMessage($chatId, $conflictMsg);

                    return null;
                }
            } else {
                $existingTechOnSamePrivateChat = TelegramRecipient::query()
                    ->where('id', '!=', $recipient->id)
                    ->where('telegram_chat_id', $chatId)
                    ->whereIn('target_role', ['technician', 'tech'])
                    ->where('is_active', true)
                    ->where(function ($q) {
                        $q->whereNull('telegram_thread_id')
                            ->orWhere('telegram_thread_id', '');
                    })
                    ->exists();

                if ($existingTechOnSamePrivateChat) {
                    $conflictMsg = "<b>🔒 Từ chối kích hoạt: Tách biệt bảo mật Admin &amp; Kỹ thuật viên</b>\n"
                        . "Đoạn hội thoại Telegram này đang được cấu hình làm kênh riêng của <b>Kỹ thuật viên</b> (chế độ ẩn giá 100%).\n"
                        . "Để bảo mật doanh thu và số tiền của cửa hàng, không thể kích hoạt quyền <b>Quản trị viên (Admin)</b> chung trên cùng đoạn hội thoại cá nhân của Kỹ thuật viên.";
                    $this->sendMessage($chatId, $conflictMsg);

                    return null;
                }
            }
        }

        $recipient->telegram_chat_id = $chatId;
        if ($normalizedThreadId !== '') {
            $recipient->telegram_thread_id = $normalizedThreadId;
        }
        if ($telegramUserId !== null && trim($telegramUserId) !== '') {
            $recipient->telegram_user_id = trim($telegramUserId);
        }
        $recipient->connected_at = now();
        $recipient->save();

        $phone = $this->escapeHtml((string) $recipient->phone);
        $label = $this->escapeHtml((string) $recipient->label);

        if ($isTechRole) {
            $techName = $recipient->user?->name
                ? $this->escapeHtml((string) $recipient->user->name)
                : $label;
            $hasTopic = ! empty($recipient->telegram_thread_id);
            $threadLine = $hasTopic
                ? "\nChủ đề (Topic ID): <code>" . $this->escapeHtml((string) $recipient->telegram_thread_id) . "</code>"
                : "\nChế độ: <b>Đoạn hội thoại 1-1 riêng biệt của Kỹ thuật viên (Ẩn giá 100%)</b>";
            $headerTitle = $hasTopic
                ? 'Đã kích hoạt Chủ đề (Topic) Kỹ thuật viên!'
                : 'Đã kích hoạt Kênh Kỹ thuật viên độc lập!';

            $welcomeMessage = "<b>{$headerTitle}</b>\n"
                . "Kỹ thuật viên: <b>{$techName}</b> (<code>{$phone}</code>){$threadLine}\n"
                . "• Đơn mới tại chi nhánh sẽ tự động gửi vào đây kèm nút <b>Nhận đơn / Không nhận</b>.\n"
                . "• Gõ <code>/doncuatoi</code> để xem toàn bộ đơn đang phụ trách trong ngày.\n"
                . "• Gõ <code>/tracuu &lt;mã_đơn_hoặc_SĐT&gt;</code> để tra cứu nhanh chi tiết đơn.";

            $inlineKeyboard = [
                [
                    ['text' => '📋 Đơn của tôi hôm nay', 'callback_data' => 'tech_my_orders'],
                ],
            ];

            $this->sendMessage($chatId, $welcomeMessage, $recipient->telegram_thread_id, $inlineKeyboard);
        } else {
            $welcomeMessage = "<b>Đã kích hoạt nhận thông báo Telegram!</b>\n"
                . "Số điện thoại: <b>{$phone}</b> ({$label})\n"
                . "Bạn sẽ tự động nhận thông báo ngay khi có đơn sửa chữa mới.";

            $this->sendMessage($chatId, $welcomeMessage, $recipient->telegram_thread_id);
        }

        return $recipient;
    }

    /**
     * Tìm bản ghi người nhận đang hoạt động theo chat_id, ưu tiên khớp chính xác cả telegram_thread_id (Topic)
     * hoặc telegram_user_id để phân biệt nhiều KTV trong cùng một nhóm Telegram.
     */
    protected function findActiveRecipientForChat(
        string $chatId,
        ?string $threadId = null,
        ?string $telegramUserId = null,
        ?int $tenantId = null
    ): ?TelegramRecipient {
        $chatId = trim($chatId);
        $threadId = $threadId !== null ? trim($threadId) : '';
        $telegramUserId = $telegramUserId !== null ? trim($telegramUserId) : '';

        if ($chatId === '') {
            return null;
        }

        $baseQuery = fn () => TelegramRecipient::with(['tenant', 'branch', 'user'])
            ->where('telegram_chat_id', $chatId)
            ->where('is_active', true)
            ->when($tenantId !== null, fn ($q) => $q->where('tenant_id', $tenantId));

        if ($threadId !== '') {
            $byThread = $baseQuery()
                ->where('telegram_thread_id', $threadId)
                ->orderByDesc('id')
                ->first();
            if ($byThread) {
                return $byThread;
            }
        }

        if ($telegramUserId !== '') {
            $byUser = $baseQuery()
                ->where('telegram_user_id', $telegramUserId)
                ->orderByDesc('id')
                ->first();
            if ($byUser) {
                return $byUser;
            }
        }

        if ($threadId === '') {
            $withoutThread = $baseQuery()
                ->where(function ($q) {
                    $q->whereNull('telegram_thread_id')
                        ->orWhere('telegram_thread_id', '');
                })
                ->orderByDesc('id')
                ->first();
            if ($withoutThread) {
                return $withoutThread;
            }
        }

        return $baseQuery()->orderByDesc('id')->first();
    }

    /**
     * Tìm bản ghi người nhận tương ứng với nội dung tin nhắn (/start <connect_token> hoặc mã kết nối adm_... / ktv_...).
     * Tuyệt đối KHÔNG tự động liên kết lệnh /start trống hoặc số điện thoại thô để chống KTV mạo danh SĐT của Admin.
     */
    protected function resolveRecipientFromMessage(string $text, ?int $tenantId = null): ?TelegramRecipient
    {
        $text = trim($text);
        if ($text === '') {
            return null;
        }

        // Trường hợp 1: /start <connect_token>
        if (preg_match('#^/start(?:@\S+)?\s+(.+)$#i', $text, $matches)) {
            $param = trim($matches[1]);
            if ($param === '') {
                return null;
            }

            $query = TelegramRecipient::query()
                ->where('is_active', true)
                ->where('connect_token', $param);

            if ($tenantId !== null) {
                $query->where('tenant_id', $tenantId);
            }

            return $query->orderByDesc('id')->first();
        }

        // Lệnh /start thuần không kèm tham số -> từ chối liên kết tự động
        if (preg_match('#^/start(?:@\S+)?$#i', $text)) {
            return null;
        }

        // Trường hợp 2: Nhập trực tiếp mã kết nối adm_... / ktv_...
        if (str_starts_with($text, 'adm_') || str_starts_with($text, 'ktv_')) {
            $query = TelegramRecipient::query()
                ->where('is_active', true)
                ->where('connect_token', $text);
            if ($tenantId !== null) {
                $query->where('tenant_id', $tenantId);
            }
            return $query->first();
        }

        return null;
    }

    /**
     * Thiết lập khóa chống lặp Idempotency cho Webhook Telegram theo cả update_id, callback_query.id và cặp chat_id + message_id.
     * Trả về false nếu phát hiện bản cập nhật hoặc tin nhắn đã được xử lý trước đó.
     */
    public function acquireWebhookIdempotencyLock(
        array $update,
        int $ttlSeconds = self::WEBHOOK_IDEMPOTENCY_TTL_SECONDS
    ): bool {
        $ttl = max(self::WEBHOOK_IDEMPOTENCY_TTL_SECONDS, $ttlSeconds);

        $rawUpdateId = data_get($update, 'update_id');
        $updateId = $rawUpdateId !== null ? trim((string) $rawUpdateId) : '';

        $callbackQueryId = trim((string) data_get($update, 'callback_query.id', ''));
        $chatId = trim((string) data_get($update, 'message.chat.id', ''));
        $rawMessageId = data_get($update, 'message.message_id');
        $messageId = $rawMessageId !== null ? trim((string) $rawMessageId) : '';

        if ($updateId !== '') {
            $lockedPrimary = Cache::add("tg_webhook_update:{$updateId}", true, $ttl);
            $lockedLegacy = Cache::add("telegram_processed_update_{$updateId}", true, $ttl);
            $lockedAiSync = Cache::add("telegram_ai_processed_update_{$updateId}", true, $ttl);
            if (! $lockedPrimary || ! $lockedLegacy || ! $lockedAiSync) {
                Log::info('Duplicate Telegram webhook update_id ignored.', [
                    'update_id'  => $updateId,
                    'chat_id'    => $chatId,
                    'message_id' => $messageId,
                ]);
                return false;
            }
        }

        if ($callbackQueryId !== '') {
            $lockedCb = Cache::add("tg_cb_query:{$callbackQueryId}", true, $ttl);
            if (! $lockedCb) {
                Log::info('Duplicate Telegram callback_query.id ignored.', [
                    'update_id'         => $updateId,
                    'callback_query_id' => $callbackQueryId,
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
     * Xử lý payload update từ Webhook Telegram (Hỗ trợ liên kết /start, Callback Nhận/Không nhận đơn của KTV, Lệnh nhanh của KTV và Trợ lý AI hội thoại).
     */
    public function handleWebhookUpdate(array $update, bool $idempotencyVerified = false): ?TelegramRecipient
    {
        if (isset($update['callback_query']) && is_array($update['callback_query'])) {
            if (! $idempotencyVerified && ! $this->acquireWebhookIdempotencyLock($update)) {
                return null;
            }

            return $this->handleCallbackQuery($update['callback_query']);
        }

        $text = trim((string) data_get($update, 'message.text', ''));
        $chatId = trim((string) data_get($update, 'message.chat.id', ''));
        $rawThreadId = data_get($update, 'message.message_thread_id');
        $threadId = $rawThreadId !== null && trim((string) $rawThreadId) !== ''
            ? trim((string) $rawThreadId)
            : null;
        $rawFromId = data_get($update, 'message.from.id');
        $fromId = $rawFromId !== null && trim((string) $rawFromId) !== ''
            ? trim((string) $rawFromId)
            : null;

        if ($chatId === '' || $text === '') {
            return null;
        }

        if (! $idempotencyVerified && ! $this->acquireWebhookIdempotencyLock($update)) {
            return null;
        }

        $isStartOrTokenCommand = (bool) preg_match('#^/start(?:\s|$|@)#i', $text)
            || str_starts_with($text, 'adm_')
            || str_starts_with($text, 'ktv_');

        $activeRecipient = $this->findActiveRecipientForChat($chatId, $threadId, $fromId);

        if ($isStartOrTokenCommand || ! $activeRecipient) {
            $pendingRecipient = $this->resolveRecipientFromMessage($text);
            if ($pendingRecipient) {
                return $this->handleStartCommand(
                    (string) $pendingRecipient->connect_token,
                    $chatId,
                    $threadId,
                    $fromId
                );
            }
        }

        if ($activeRecipient) {
            if ($isStartOrTokenCommand) {
                return $activeRecipient;
            }

            if ($this->handleTechnicianQuickCommand($activeRecipient, $text, $threadId ?? $activeRecipient->telegram_thread_id)) {
                return $activeRecipient;
            }

            \App\Jobs\ProcessTelegramAiMessageJob::dispatch($activeRecipient->id, $text, $update);
            return $activeRecipient;
        }

        $unregisteredMsg = "<b>Tài khoản Telegram chưa được kích hoạt</b>\n"
            . "Vui lòng truy cập trang Cài đặt thương hiệu trên hệ thống PodsCare để thêm số điện thoại và bấm kích hoạt kết nối (<code>/start &lt;connect_token&gt;</code>).";
        $this->sendMessage($chatId, $unregisteredMsg, $threadId);

        return null;
    }

    /**
     * Chủ động đồng bộ các lệnh /start, Callback Query và tin nhắn mới qua getUpdates (hỗ trợ Localhost & Telegram Web).
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
                if (app()->isProduction()) {
                    Log::warning('Telegram syncUpdates skipped deleteWebhook in production (409 Conflict: webhook is active).');
                    return 0;
                }

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

            $syncedCount = 0;
            $minAcceptableTimestamp = now()->subHours(24)->timestamp;

            foreach (array_reverse($updates) as $update) {
                if (isset($update['callback_query']) && is_array($update['callback_query'])) {
                    if ($this->acquireWebhookIdempotencyLock($update, 86400)) {
                        $cbRecipient = $this->handleCallbackQuery($update['callback_query']);
                        if ($cbRecipient) {
                            $syncedCount++;
                        }
                    }
                    continue;
                }

                $text = trim((string) data_get($update, 'message.text', ''));
                $chatId = trim((string) data_get($update, 'message.chat.id', ''));
                $rawThreadId = data_get($update, 'message.message_thread_id');
                $threadId = $rawThreadId !== null && trim((string) $rawThreadId) !== ''
                    ? trim((string) $rawThreadId)
                    : null;
                $rawFromId = data_get($update, 'message.from.id');
                $fromId = $rawFromId !== null && trim((string) $rawFromId) !== ''
                    ? trim((string) $rawFromId)
                    : null;

                if ($chatId === '' || $text === '') {
                    continue;
                }

                $recipient = $this->resolveRecipientFromMessage($text, $tenantId);
                if ($recipient) {
                    $needsLink = empty($recipient->telegram_chat_id)
                        || (string) $recipient->telegram_chat_id !== $chatId
                        || ($threadId !== null && (string) $recipient->telegram_thread_id !== $threadId);

                    if ($needsLink) {
                        $linked = $this->handleStartCommand((string) $recipient->connect_token, $chatId, $threadId, $fromId);
                        if ($linked !== null) {
                            $syncedCount++;
                        }
                    }
                    continue;
                }

                $updateId = data_get($update, 'update_id');
                $messageDate = (int) data_get($update, 'message.date', 0);
                if ($updateId !== null && ($messageDate <= 0 || $messageDate >= $minAcceptableTimestamp)) {
                    if ($this->acquireWebhookIdempotencyLock($update, 86400)) {
                        $activeRecipient = $this->findActiveRecipientForChat($chatId, $threadId, $fromId, $tenantId);
                        if ($activeRecipient) {
                            if ($this->handleTechnicianQuickCommand($activeRecipient, $text, $threadId ?? $activeRecipient->telegram_thread_id)) {
                                $syncedCount++;
                                continue;
                            }

                            \App\Jobs\ProcessTelegramAiMessageJob::dispatch($activeRecipient->id, $text, $update);
                            $syncedCount++;
                        }
                    }
                }
            }

            if ($maxUpdateId > 0) {
                Cache::put('telegram_last_update_offset', $maxUpdateId + 1, now()->addDays(7));
            }

            return $syncedCount;
        } catch (\Throwable $e) {
            Log::error('Telegram syncUpdates failed: ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * Tự động gửi thông báo đơn sửa chữa mới (order.created) cho cả Admin (có giá dự kiến)
     * và điều phối vào từng Chủ đề (Topic) của Kỹ thuật viên thuộc chi nhánh (ẩn 100% giá tiền + nút Nhận/Không nhận).
     */
    public function notifyNewOrder(RepairOrder $order): int
    {
        try {
            $order->loadMissing(['customer', 'deviceModel', 'branch', 'createdByUser']);

            $tenantId = $order->tenant_id ?? $order->branch?->tenant_id;
            if (! $tenantId) {
                return 0;
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

            $sentCount = 0;

            if ($recipients->isNotEmpty()) {
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
            }

            // Điều phối đơn mới chờ nhận vào Topic của từng Kỹ thuật viên trong chi nhánh (ẩn 100% giá tiền)
            if (($order->status ?? 'waiting_tech') === 'waiting_tech' && empty($order->technician_id)) {
                $sentCount += $this->notifyTechniciansNewOrder($order);
            }

            return $sentCount;
        } catch (\Throwable $e) {
            Log::error('Telegram notifyNewOrder failed: ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * Gửi thông báo đơn sửa chữa mới (`waiting_tech`) vào từng Chủ đề (Topic) của Kỹ thuật viên thuộc chi nhánh.
     * Tuyệt đối KHÔNG hiển thị bất kỳ trường giá tiền nào.
     * Đính kèm 2 nút Callback: [✅ Nhận đơn] và [❌ Không nhận].
     */
    public function notifyTechniciansNewOrder(RepairOrder $order): int
    {
        try {
            $order->loadMissing(['customer', 'deviceModel', 'branch', 'createdByUser']);

            $tenantId = $order->tenant_id ?? $order->branch?->tenant_id;
            if (! $tenantId) {
                return 0;
            }

            $techRecipients = TelegramRecipient::with('user')
                ->where('tenant_id', $tenantId)
                ->where('is_active', true)
                ->whereNotNull('telegram_chat_id')
                ->where('telegram_chat_id', '!=', '')
                ->whereIn('target_role', ['technician', 'tech'])
                ->where(function ($q) use ($order) {
                    $q->whereNull('branch_id')
                        ->orWhere('branch_id', $order->branch_id);
                })
                ->get()
                ->filter(function (TelegramRecipient $recipient) {
                    if ($recipient->user_id && $recipient->user && ! $recipient->user->is_active) {
                        return false;
                    }
                    $events = $recipient->subscribed_events;
                    if (! is_array($events) || empty($events)) {
                        $events = ['order.created'];
                    }
                    return in_array('order.created', $events, true);
                });

            if ($techRecipients->isEmpty()) {
                return 0;
            }

            $htmlText = $this->buildTechnicianOrderDispatchHtml($order);
            $inlineKeyboard = [
                [
                    [
                        'text'          => '✅ Nhận đơn',
                        'callback_data' => "accept_order:{$order->id}",
                    ],
                    [
                        'text'          => '❌ Không nhận',
                        'callback_data' => "reject_order:{$order->id}",
                    ],
                ],
                [
                    [
                        'text'          => "🔍 Chi tiết #{$order->order_code}",
                        'callback_data' => "tech_view_order:{$order->id}",
                    ],
                ],
            ];

            $dispatchMessages = is_array($order->telegram_dispatch_messages)
                ? $order->telegram_dispatch_messages
                : [];
            $sentCount = 0;

            foreach ($techRecipients as $recipient) {
                $ok = $this->sendMessage(
                    (string) $recipient->telegram_chat_id,
                    $htmlText,
                    $recipient->telegram_thread_id,
                    $inlineKeyboard
                );

                if ($ok) {
                    $sentCount++;
                    $dispatchMessages[] = [
                        'recipient_id' => $recipient->id,
                        'user_id'      => $recipient->user_id,
                        'chat_id'      => (string) $recipient->telegram_chat_id,
                        'thread_id'    => $recipient->telegram_thread_id,
                        'message_id'   => $this->lastSentMessageId,
                    ];
                }
            }

            if ($sentCount > 0) {
                RepairOrder::withoutGlobalScopes()
                    ->whereKey($order->id)
                    ->update(['telegram_dispatch_messages' => json_encode($dispatchMessages)]);
                $order->telegram_dispatch_messages = $dispatchMessages;
            }

            return $sentCount;
        } catch (\Throwable $e) {
            Log::error('Telegram notifyTechniciansNewOrder failed: ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * Xây dựng nội dung HTML thông báo đơn mới cho Kỹ thuật viên (ẨN TUYỆT ĐỐI 100% MỌI TRƯỜNG GIÁ TIỀN).
     */
    public function buildTechnicianOrderDispatchHtml(RepairOrder $order, ?string $statusHeadline = null): string
    {
        $order->loadMissing(['customer', 'deviceModel', 'branch', 'createdByUser', 'technician']);

        $orderCode = $this->escapeHtml((string) $order->order_code);
        $branchName = $this->escapeHtml((string) ($order->branch?->name ?? 'Mặc định'));
        $customerName = $this->escapeHtml((string) ($order->customer?->name ?? 'Khách lẻ'));
        $customerPhone = $this->escapeHtml((string) ($order->customer?->phone ?? 'N/A'));
        $deviceName = $this->escapeHtml((string) ($order->deviceModel?->name ?? 'Thiết bị'));
        $serialNumber = trim((string) ($order->serial_number ?? ''));
        $serialLine = $serialNumber !== ''
            ? " (SN: <code>" . $this->escapeHtml($serialNumber) . "</code>)"
            : '';
        $accessories = trim((string) ($order->accessories ?? ''));
        $issueDescription = $this->escapeHtml((string) ($order->issue_description ?? 'Không rõ'));
        $testNote = trim((string) ($order->test_note ?? ''));
        $appearanceNotes = trim((string) ($order->appearance_notes ?? ''));
        $partsNeeded = trim((string) ($order->parts_needed ?? ''));
        $creatorName = $this->escapeHtml((string) ($order->createdByUser?->name ?? 'Nhân viên'));
        $createdAtStr = ($order->created_at ?? now())->format('H:i - d/m/Y');

        $orderType = (string) ($order->order_type ?? 'in_store');
        $orderTypeLabel = match ($orderType) {
            'cod'      => 'Đơn COD (Khách tỉnh)',
            'warranty' => 'Tiếp nhận bảo hành',
            default    => 'Khách tại cửa hàng',
        };

        $statusLabel = OrderWorkflowService::STATUS_LABELS[(string) $order->status] ?? (string) $order->status;

        $lines = [
            "<b>🔧 ĐƠN KỸ THUẬT MỚI #{$orderCode}</b>",
            "━━━━━━━━━━━━━━━━━━",
            "<b>Trạng thái:</b> <b>" . $this->escapeHtml($statusLabel) . "</b>",
            "<b>Chi nhánh:</b> {$branchName}",
            "<b>Phân loại:</b> {$orderTypeLabel}",
            "<b>Khách hàng:</b> {$customerName} - <code>{$customerPhone}</code>",
            "<b>Thiết bị:</b> {$deviceName}{$serialLine}",
        ];

        if ($accessories !== '') {
            $lines[] = "<b>Phụ kiện:</b> " . $this->escapeHtml($accessories);
        }

        $lines[] = "<b>Tình trạng lỗi:</b> {$issueDescription}";

        if ($testNote !== '') {
            $lines[] = "<b>Ghi chú test:</b> " . $this->escapeHtml($testNote);
        }

        if ($appearanceNotes !== '') {
            $lines[] = "<b>Ngoại quan:</b> " . $this->escapeHtml($appearanceNotes);
        }

        if ($partsNeeded !== '') {
            $lines[] = "<b>Linh kiện dự kiến:</b> " . $this->escapeHtml($partsNeeded);
        }

        $lines[] = "<b>Người tiếp nhận:</b> {$creatorName}";
        $lines[] = "<b>Thời gian:</b> {$createdAtStr}";

        if ($statusHeadline !== null && trim($statusHeadline) !== '') {
            $lines[] = "━━━━━━━━━━━━━━━━━━";
            $lines[] = $statusHeadline;
        }

        return implode("\n", $lines);
    }

    /**
     * Xử lý Callback Query khi Kỹ thuật viên bấm nút trong Topic Telegram:
     * - accept_order:{orderId}
     * - reject_order:{orderId}
     * - tech_my_orders
     * - tech_view_order:{orderId}
     */
    public function handleCallbackQuery(array $callbackQuery): ?TelegramRecipient
    {
        $callbackId = trim((string) data_get($callbackQuery, 'id', ''));
        $data = trim((string) data_get($callbackQuery, 'data', ''));
        $chatId = trim((string) data_get($callbackQuery, 'message.chat.id', ''));
        $messageId = (int) data_get($callbackQuery, 'message.message_id', 0);
        $rawThreadId = data_get($callbackQuery, 'message.message_thread_id');
        $threadId = $rawThreadId !== null && trim((string) $rawThreadId) !== ''
            ? trim((string) $rawThreadId)
            : null;
        $rawFromId = data_get($callbackQuery, 'from.id');
        $fromId = $rawFromId !== null && trim((string) $rawFromId) !== ''
            ? trim((string) $rawFromId)
            : null;

        if ($chatId === '' || $data === '') {
            return null;
        }

        $recipient = $this->findActiveRecipientForChat($chatId, $threadId, $fromId);
        if (! $recipient) {
            $this->answerCallbackQuery($callbackId, 'Tài khoản hoặc Chủ đề Telegram này chưa được kích hoạt.', true);
            return null;
        }

        if ($data === 'tech_my_orders') {
            $this->answerCallbackQuery($callbackId, 'Đang tải danh sách đơn trong ngày...');
            $this->sendTechnicianMyOrdersSummary($recipient, $threadId ?? $recipient->telegram_thread_id);
            return $recipient;
        }

        if (str_starts_with($data, 'tech_view_order:')) {
            $orderId = (int) substr($data, strlen('tech_view_order:'));
            $this->answerCallbackQuery($callbackId, 'Đang tải chi tiết đơn...');
            $this->sendTechnicianOrderDetailById($recipient, $orderId, $threadId ?? $recipient->telegram_thread_id);
            return $recipient;
        }

        if (str_starts_with($data, 'accept_order:')) {
            $orderId = (int) substr($data, strlen('accept_order:'));
            $this->handleAcceptOrderCallback($recipient, $orderId, $callbackId, $chatId, $messageId);
            return $recipient;
        }

        if (str_starts_with($data, 'reject_order:')) {
            $orderId = (int) substr($data, strlen('reject_order:'));
            $this->handleRejectOrderCallback($recipient, $orderId, $callbackId, $chatId, $messageId);
            return $recipient;
        }

        $this->answerCallbackQuery($callbackId);
        return $recipient;
    }

    /**
     * Giải quyết tài khoản User (KTV) tương ứng với TelegramRecipient.
     */
    protected function resolveTechnicianUserForRecipient(TelegramRecipient $recipient): ?User
    {
        $recipient->loadMissing('user');
        if ($recipient->user && $recipient->user->is_active) {
            return $recipient->user;
        }

        $cleanPhone = preg_replace('/[\s.\-]+/', '', (string) $recipient->phone);
        if ($cleanPhone !== null && $cleanPhone !== '') {
            $matchedByPhone = User::withoutGlobalScopes()
                ->where('tenant_id', $recipient->tenant_id)
                ->where('is_active', true)
                ->whereIn('role', ['technician', 'tech'])
                ->where('phone', $cleanPhone)
                ->first();

            if ($matchedByPhone) {
                $recipient->user_id = $matchedByPhone->id;
                $recipient->save();
                return $matchedByPhone;
            }
        }

        return null;
    }

    /**
     * Xử lý khi KTV bấm [✅ Nhận đơn]:
     * - Khóa dòng RepairOrder bằng lockForUpdate()
     * - Chuyển thẳng trạng thái từ waiting_tech -> in_repair qua OrderWorkflowService
     * - Cập nhật tin nhắn ở Topic của KTV vừa nhận và khóa nút ở các Topic của các KTV khác.
     */
    protected function handleAcceptOrderCallback(
        TelegramRecipient $recipient,
        int $orderId,
        string $callbackId,
        string $chatId,
        int $messageId
    ): void {
        $techUser = $this->resolveTechnicianUserForRecipient($recipient);
        if (! $techUser) {
            $this->answerCallbackQuery(
                $callbackId,
                'Chủ đề này chưa được liên kết với tài khoản Kỹ thuật viên trên hệ thống. Vui lòng báo Admin cấu hình!',
                true
            );
            return;
        }

        try {
            $claimResult = DB::transaction(function () use ($recipient, $orderId, $techUser) {
                $order = RepairOrder::withoutGlobalScopes()
                    ->with(['customer', 'deviceModel', 'branch', 'createdByUser', 'technician'])
                    ->where('tenant_id', $recipient->tenant_id)
                    ->whereKey($orderId)
                    ->lockForUpdate()
                    ->first();

                if (! $order) {
                    return ['status' => 'not_found', 'order' => null];
                }

                if ($order->status !== 'waiting_tech' || ! empty($order->technician_id)) {
                    return ['status' => 'already_claimed', 'order' => $order];
                }

                $updatedOrder = app(OrderWorkflowService::class)->transition(
                    $order,
                    'in_repair',
                    [
                        'user'          => $techUser,
                        'admin_id'      => $techUser->id,
                        'admin_name'    => $techUser->name,
                        'technician_id' => $techUser->id,
                        'reason'        => 'KTV nhận đơn qua Telegram Topic',
                    ]
                );

                return ['status' => 'claimed', 'order' => $updatedOrder];
            });

            /** @var RepairOrder|null $order */
            $order = $claimResult['order'];
            if ($claimResult['status'] === 'not_found' || ! $order) {
                $this->answerCallbackQuery($callbackId, 'Không tìm thấy đơn sửa chữa này.', true);
                return;
            }

            $order->loadMissing(['customer', 'deviceModel', 'branch', 'createdByUser', 'technician']);

            if ($claimResult['status'] === 'already_claimed') {
                $ownerName = $order->technician?->name ?? 'KTV khác';
                $this->answerCallbackQuery(
                    $callbackId,
                    "Đơn #{$order->order_code} đã được {$ownerName} nhận xử lý trước đó!",
                    true
                );

                if ($messageId > 0) {
                    $lockedHtml = $this->buildTechnicianOrderDispatchHtml(
                        $order,
                        "🔒 <b>Đơn đã được KTV " . $this->escapeHtml((string) $ownerName) . " nhận xử lý</b>"
                    );
                    $this->editMessageText($chatId, $messageId, $lockedHtml, [
                        [
                            [
                                'text'          => "🔍 Chi tiết #{$order->order_code}",
                                'callback_data' => "tech_view_order:{$order->id}",
                            ],
                        ],
                    ]);
                }
                return;
            }

            // Nhận đơn thành công -> trả lời callback và đồng bộ tin nhắn trên mọi Topic
            $this->answerCallbackQuery(
                $callbackId,
                "✅ Đã nhận đơn #{$order->order_code} — Chuyển sang Đang sửa!"
            );

            $techNameEscaped = $this->escapeHtml((string) $techUser->name);
            $acceptedHtml = $this->buildTechnicianOrderDispatchHtml(
                $order,
                "✅ <b>Bạn ({$techNameEscaped}) đã nhận đơn này — Trạng thái: Đang sửa</b>"
            );
            $acceptedKeyboard = [
                [
                    [
                        'text'          => '📋 Đơn của tôi hôm nay',
                        'callback_data' => 'tech_my_orders',
                    ],
                    [
                        'text'          => "🔍 Chi tiết #{$order->order_code}",
                        'callback_data' => "tech_view_order:{$order->id}",
                    ],
                ],
            ];

            $lockedOtherHtml = $this->buildTechnicianOrderDispatchHtml(
                $order,
                "🔒 <b>Đơn đã được KTV {$techNameEscaped} nhận xử lý</b>"
            );
            $lockedOtherKeyboard = [
                [
                    [
                        'text'          => "🔍 Chi tiết #{$order->order_code}",
                        'callback_data' => "tech_view_order:{$order->id}",
                    ],
                ],
            ];

            if ($messageId > 0) {
                $this->editMessageText($chatId, $messageId, $acceptedHtml, $acceptedKeyboard);
            }

            $dispatchMessages = is_array($order->telegram_dispatch_messages)
                ? $order->telegram_dispatch_messages
                : [];

            foreach ($dispatchMessages as $msgMeta) {
                $targetChatId = (string) ($msgMeta['chat_id'] ?? '');
                $targetMsgId = (int) ($msgMeta['message_id'] ?? 0);
                $targetRecipientId = (int) ($msgMeta['recipient_id'] ?? 0);

                if ($targetChatId === '' || $targetMsgId <= 0) {
                    continue;
                }

                // Bỏ qua tin nhắn của chính KTV vừa nhận nếu đã edit ở trên
                if ($targetRecipientId === (int) $recipient->id || ($targetChatId === $chatId && $targetMsgId === $messageId)) {
                    continue;
                }

                $this->editMessageText($targetChatId, $targetMsgId, $lockedOtherHtml, $lockedOtherKeyboard);
            }
        } catch (\Throwable $e) {
            Log::error('Telegram handleAcceptOrderCallback failed: ' . $e->getMessage());
            $this->answerCallbackQuery($callbackId, 'Không thể nhận đơn lúc này, vui lòng thử lại.', true);
        }
    }

    /**
     * Xử lý khi KTV bấm [❌ Không nhận]:
     * - Giữ đơn ở waiting_tech để KTV khác vẫn nhận được
     * - Lưu ID của KTV vào rejected_by_tech_ids
     * - Nếu 100% KTV active đã kết nối của chi nhánh đều từ chối -> bắn cảnh báo cho Admin & CSKH.
     */
    protected function handleRejectOrderCallback(
        TelegramRecipient $recipient,
        int $orderId,
        string $callbackId,
        string $chatId,
        int $messageId
    ): void {
        $techUser = $this->resolveTechnicianUserForRecipient($recipient);
        $rejectActorId = $techUser ? (int) $techUser->id : (int) $recipient->id;
        $rejectActorName = $techUser?->name ?? $recipient->label;

        try {
            $rejectResult = DB::transaction(function () use ($recipient, $orderId, $rejectActorId) {
                $order = RepairOrder::withoutGlobalScopes()
                    ->with(['customer', 'deviceModel', 'branch', 'createdByUser', 'technician'])
                    ->where('tenant_id', $recipient->tenant_id)
                    ->whereKey($orderId)
                    ->lockForUpdate()
                    ->first();

                if (! $order) {
                    return ['status' => 'not_found', 'order' => null, 'all_rejected' => false];
                }

                if ($order->status !== 'waiting_tech' || ! empty($order->technician_id)) {
                    return ['status' => 'already_claimed', 'order' => $order, 'all_rejected' => false];
                }

                $rejectedIds = is_array($order->rejected_by_tech_ids)
                    ? array_map('intval', $order->rejected_by_tech_ids)
                    : [];

                $wasAlreadyInList = in_array($rejectActorId, $rejectedIds, true);
                if (! $wasAlreadyInList) {
                    $rejectedIds[] = $rejectActorId;
                    $rejectedIds = array_values(array_unique($rejectedIds));
                    $order->rejected_by_tech_ids = $rejectedIds;
                    $order->save();
                }

                // Kiểm tra toàn bộ KTV active đã kết nối Telegram của chi nhánh
                $activeTechRecipients = TelegramRecipient::with('user')
                    ->where('tenant_id', $order->tenant_id)
                    ->where('is_active', true)
                    ->whereNotNull('telegram_chat_id')
                    ->where('telegram_chat_id', '!=', '')
                    ->whereIn('target_role', ['technician', 'tech'])
                    ->where(function ($q) use ($order) {
                        $q->whereNull('branch_id')
                            ->orWhere('branch_id', $order->branch_id);
                    })
                    ->get()
                    ->filter(function (TelegramRecipient $r) {
                        return ! ($r->user_id && $r->user && ! $r->user->is_active);
                    });

                $expectedTechIds = $activeTechRecipients
                    ->map(fn (TelegramRecipient $r) => $r->user_id ? (int) $r->user_id : (int) $r->id)
                    ->unique()
                    ->values()
                    ->all();

                $allRejected = ! empty($expectedTechIds)
                    && count(array_diff($expectedTechIds, $rejectedIds)) === 0
                    && ! $wasAlreadyInList;

                return [
                    'status'       => 'rejected',
                    'order'        => $order,
                    'all_rejected' => $allRejected,
                ];
            });

            /** @var RepairOrder|null $order */
            $order = $rejectResult['order'];
            if ($rejectResult['status'] === 'not_found' || ! $order) {
                $this->answerCallbackQuery($callbackId, 'Không tìm thấy đơn sửa chữa này.', true);
                return;
            }

            if ($rejectResult['status'] === 'already_claimed') {
                $ownerName = $order->technician?->name ?? 'KTV khác';
                $this->answerCallbackQuery(
                    $callbackId,
                    "Đơn #{$order->order_code} đã được {$ownerName} nhận xử lý trước đó!",
                    true
                );
                return;
            }

            $this->answerCallbackQuery($callbackId, "Đã bỏ qua đơn #{$order->order_code}.");

            if ($messageId > 0) {
                $rejectedHtml = $this->buildTechnicianOrderDispatchHtml(
                    $order,
                    "❌ <b>Bạn (" . $this->escapeHtml((string) $rejectActorName) . ") đã từ chối nhận đơn này</b>"
                );
                $this->editMessageText($chatId, $messageId, $rejectedHtml, [
                    [
                        [
                            'text'          => "🔍 Chi tiết #{$order->order_code}",
                            'callback_data' => "tech_view_order:{$order->id}",
                        ],
                    ],
                ]);
            }

            if ($rejectResult['all_rejected']) {
                $this->notifyAllTechniciansRejected($order);
            }
        } catch (\Throwable $e) {
            Log::error('Telegram handleRejectOrderCallback failed: ' . $e->getMessage());
            $this->answerCallbackQuery($callbackId, 'Không thể xử lý thao tác lúc này.', true);
        }
    }

    /**
     * Phát cảnh báo khẩn (In-App Notification + WebSocket + Telegram Admin) khi 100% KTV trong chi nhánh từ chối nhận đơn.
     */
    protected function notifyAllTechniciansRejected(RepairOrder $order): void
    {
        try {
            $order->loadMissing(['customer', 'deviceModel', 'branch']);

            $title = "Cảnh báo: Tất cả KTV từ chối đơn #{$order->order_code}";
            $deviceName = $order->deviceModel?->name ?? 'Thiết bị';
            $customerName = $order->customer?->name ?? 'Khách lẻ';
            $message = "Đơn {$order->order_code} ({$deviceName} - Khách: {$customerName}) đã bị tất cả Kỹ thuật viên trong chi nhánh bấm Không nhận trên Telegram. Vui lòng kiểm tra và điều phối KTV thủ công.";

            foreach (['admin', 'cskh'] as $role) {
                $notif = Notification::create([
                    'tenant_id'   => $order->tenant_id,
                    'branch_id'   => $order->branch_id,
                    'order_id'    => $order->id,
                    'target_role' => $role,
                    'type'        => 'order_all_techs_rejected',
                    'title'       => $title,
                    'message'     => $message,
                    'severity'    => 'danger',
                ]);

                OrderOperationalEvent::dispatch(
                    $notif->id,
                    $order->id,
                    $order->order_code,
                    $title,
                    $message,
                    'danger',
                    now()->toIso8601String(),
                    "/repairs?id={$order->id}",
                    $order->branch_id ? (int) $order->branch_id : null,
                    $role,
                    null,
                    'order_all_techs_rejected',
                    'order.all_techs_rejected',
                    $order->tenant_id ? (int) $order->tenant_id : null
                );
            }

            // Gửi tin nhắn cảnh báo Telegram cho tất cả Admin của chi nhánh
            $adminRecipients = TelegramRecipient::query()
                ->where('tenant_id', $order->tenant_id)
                ->where('is_active', true)
                ->whereNotNull('telegram_chat_id')
                ->where('telegram_chat_id', '!=', '')
                ->where('target_role', 'admin')
                ->where(function ($q) use ($order) {
                    $q->whereNull('branch_id')
                        ->orWhere('branch_id', $order->branch_id);
                })
                ->get();

            $orderCodeEsc = $this->escapeHtml((string) $order->order_code);
            $branchNameEsc = $this->escapeHtml((string) ($order->branch?->name ?? 'Mặc định'));
            $customerNameEsc = $this->escapeHtml((string) $customerName);
            $customerPhoneEsc = $this->escapeHtml((string) ($order->customer?->phone ?? 'N/A'));
            $deviceNameEsc = $this->escapeHtml((string) $deviceName);
            $issueEsc = $this->escapeHtml((string) ($order->issue_description ?? 'Không rõ'));

            $alertHtml = "<b>⚠️ CẢNH BÁO ĐIỀU PHỐI ĐƠN #{$orderCodeEsc}</b>\n"
                . "━━━━━━━━━━━━━━━━━━\n"
                . "Tất cả Kỹ thuật viên đang kết nối Telegram tại <b>{$branchNameEsc}</b> đều đã bấm <b>Không nhận</b> đơn này!\n\n"
                . "<b>Khách hàng:</b> {$customerNameEsc} - <code>{$customerPhoneEsc}</code>\n"
                . "<b>Thiết bị:</b> {$deviceNameEsc}\n"
                . "<b>Tình trạng lỗi:</b> {$issueEsc}\n"
                . "👉 Vui lòng mở hệ thống để kiểm tra và phân công KTV thủ công.";

            foreach ($adminRecipients as $adminRecipient) {
                $this->sendMessage(
                    (string) $adminRecipient->telegram_chat_id,
                    $alertHtml,
                    $adminRecipient->telegram_thread_id
                );
            }
        } catch (\Throwable $e) {
            Log::error('Telegram notifyAllTechniciansRejected failed: ' . $e->getMessage());
        }
    }

    /**
     * Kiểm tra và xử lý các lệnh tra cứu nhanh của Kỹ thuật viên trong Topic:
     * 1. /doncuatoi, /myorders, "đơn của tôi" -> Xem danh sách đơn trong ngày & đơn tồn ca
     * 2. /tracuu <mã_đơn|SĐT>, /tim <mã_đơn|SĐT> -> Tra cứu nhanh chi tiết đơn (ẩn 100% giá tiền)
     */
    public function handleTechnicianQuickCommand(
        TelegramRecipient $recipient,
        string $text,
        ?string $threadId = null
    ): bool {
        if (! in_array($recipient->target_role, ['technician', 'tech'], true)) {
            return false;
        }

        $trimmed = trim($text);
        $lower = mb_strtolower($trimmed, 'UTF-8');

        // 1. Lệnh xem toàn bộ đơn của KTV hôm nay + đơn tồn ca
        if (
            preg_match('#^/(?:doncuatoi|myorders|dsdon)(?:@\S+)?$#iu', $trimmed)
            || in_array($lower, ['đơn của tôi', 'don cua toi', 'đơn hôm nay', 'don hom nay'], true)
        ) {
            $this->sendTechnicianMyOrdersSummary($recipient, $threadId);
            return true;
        }

        // 2. Lệnh tra cứu nhanh theo mã đơn hoặc SĐT khách
        if (preg_match('#^/(?:tracuu|tim|don)(?:@\S+)?(?:\s+(.*))?$#iu', $trimmed, $matches)) {
            $keyword = trim((string) ($matches[1] ?? ''));
            if ($keyword === '') {
                $guideHtml = "<b>🔍 HƯỚNG DẪN TRA CỨU NHANH ĐƠN KỸ THUẬT</b>\n"
                    . "• Xem toàn bộ đơn của bạn hôm nay: gõ <code>/doncuatoi</code>\n"
                    . "• Tra cứu chi tiết theo Mã đơn hoặc SĐT khách: gõ <code>/tracuu PC01...</code> hoặc <code>/tracuu 090...</code>";
                $this->sendMessage(
                    (string) $recipient->telegram_chat_id,
                    $guideHtml,
                    $threadId ?? $recipient->telegram_thread_id,
                    [[['text' => '📋 Đơn của tôi hôm nay', 'callback_data' => 'tech_my_orders']]]
                );
                return true;
            }

            $this->sendTechnicianOrderLookup($recipient, $keyword, $threadId);
            return true;
        }

        return false;
    }

    /**
     * Gửi danh sách toàn bộ đơn đang phụ trách (tồn ca + trong ngày) và đơn đã sửa xong hôm nay của KTV.
     * Cam kết ẨN TUYỆT ĐỐI 100% GIÁ TIỀN.
     */
    public function sendTechnicianMyOrdersSummary(
        TelegramRecipient $recipient,
        ?string $threadId = null
    ): bool {
        $techUser = $this->resolveTechnicianUserForRecipient($recipient);
        $effectiveThreadId = $threadId ?? $recipient->telegram_thread_id;

        if (! $techUser) {
            $msg = "<b>⚠️ Chưa liên kết tài khoản Kỹ thuật viên</b>\n"
                . "Chủ đề Telegram này chưa được gắn với tài khoản KTV trên hệ thống. Vui lòng nhờ Admin chọn tài khoản KTV tại mục Cài đặt thương hiệu.";
            return $this->sendMessage((string) $recipient->telegram_chat_id, $msg, $effectiveThreadId);
        }

        $activeStatuses = ['assigned', 'in_repair', 'waiting_parts', 'rework_needed', 'qc_failed', 'diagnosing'];
        $completedStatuses = ['waiting_qc', 'qc_pending', 'qc_inspecting', 'ready_for_return', 'waiting_pickup', 'completed'];
        $todayStart = Carbon::today();

        $orders = RepairOrder::withoutGlobalScopes()
            ->with(['customer', 'deviceModel', 'branch'])
            ->where('tenant_id', $recipient->tenant_id)
            ->where('technician_id', $techUser->id)
            ->where(function ($q) use ($activeStatuses, $completedStatuses, $todayStart) {
                $q->whereIn('status', $activeStatuses)
                    ->orWhere(function ($sub) use ($completedStatuses, $todayStart) {
                        $sub->whereIn('status', $completedStatuses)
                            ->where('updated_at', '>=', $todayStart);
                    });
            })
            ->orderByDesc('updated_at')
            ->limit(20)
            ->get();

        $techNameEsc = $this->escapeHtml((string) $techUser->name);
        $dateStr = now()->format('d/m/Y');

        if ($orders->isEmpty()) {
            $emptyHtml = "<b>📋 ĐƠN CỦA KTV {$techNameEsc} ({$dateStr})</b>\n"
                . "━━━━━━━━━━━━━━━━━━\n"
                . "Hiện bạn chưa có đơn nào đang sửa hoặc hoàn tất trong ngày hôm nay.\n"
                . "• Gõ <code>/tracuu &lt;mã_đơn_hoặc_SĐT&gt;</code> để tìm nhanh đơn.";

            return $this->sendMessage(
                (string) $recipient->telegram_chat_id,
                $emptyHtml,
                $effectiveThreadId,
                [[['text' => '🔄 Làm mới danh sách', 'callback_data' => 'tech_my_orders']]]
            );
        }

        $activeList = $orders->filter(fn (RepairOrder $o) => in_array($o->status, $activeStatuses, true));
        $doneTodayList = $orders->reject(fn (RepairOrder $o) => in_array($o->status, $activeStatuses, true));

        $lines = [
            "<b>📋 ĐƠN CỦA KTV {$techNameEsc} ({$dateStr})</b>",
            "━━━━━━━━━━━━━━━━━━",
            "Đang xử lý: <b>{$activeList->count()} đơn</b> | Đã xong hôm nay: <b>{$doneTodayList->count()} đơn</b>",
        ];

        if ($activeList->isNotEmpty()) {
            $lines[] = "\n<b>🔧 ĐANG PHỤ TRÁCH TRONG XƯỞNG ({$activeList->count()}):</b>";
            foreach ($activeList as $idx => $ord) {
                $lines[] = $this->formatTechnicianOrderBriefLine($ord);
            }
        }

        if ($doneTodayList->isNotEmpty()) {
            $lines[] = "\n<b>✅ ĐÃ SỬA XONG HÔM NAY ({$doneTodayList->count()}):</b>";
            foreach ($doneTodayList as $ord) {
                $lines[] = $this->formatTechnicianOrderBriefLine($ord);
            }
        }

        $lines[] = "\n<i>👇 Bấm vào mã đơn bên dưới để xem chi tiết kỹ thuật:</i>";

        // Tạo các nút bấm xem chi tiết từng đơn (tối đa 10 đơn, 2 nút mỗi hàng)
        $inlineKeyboard = [];
        $row = [];
        foreach ($orders->take(10) as $ord) {
            $row[] = [
                'text'          => "🔍 #{$ord->order_code}",
                'callback_data' => "tech_view_order:{$ord->id}",
            ];
            if (count($row) === 2) {
                $inlineKeyboard[] = $row;
                $row = [];
            }
        }
        if (! empty($row)) {
            $inlineKeyboard[] = $row;
        }

        $inlineKeyboard[] = [
            ['text' => '🔄 Làm mới danh sách', 'callback_data' => 'tech_my_orders'],
        ];

        return $this->sendMessage(
            (string) $recipient->telegram_chat_id,
            implode("\n", $lines),
            $effectiveThreadId,
            $inlineKeyboard
        );
    }

    /**
     * Định dạng 1 dòng tóm tắt đơn cho KTV (ẨN 100% GIÁ TIỀN).
     */
    protected function formatTechnicianOrderBriefLine(RepairOrder $order): string
    {
        $code = $this->escapeHtml((string) $order->order_code);
        $statusLabel = $this->escapeHtml(OrderWorkflowService::STATUS_LABELS[(string) $order->status] ?? (string) $order->status);
        $device = $this->escapeHtml((string) ($order->deviceModel?->name ?? 'Thiết bị'));
        $custName = $this->escapeHtml((string) ($order->customer?->name ?? 'Khách lẻ'));
        $custPhone = $this->escapeHtml((string) ($order->customer?->phone ?? 'N/A'));
        $issue = $this->escapeHtml((string) ($order->issue_description ?? 'Không rõ'));

        return "• <b>#{$code}</b> [{$statusLabel}] — <b>{$device}</b>\n"
            . "  👤 {$custName} (<code>{$custPhone}</code>) | Lỗi: {$issue}";
    }

    /**
     * Tra cứu nhanh đơn của KTV theo từ khóa (Mã đơn, Serial hoặc SĐT/Tên khách hàng).
     * Chỉ trả về các đơn thuộc quyền phụ trách của KTV đó hoặc đơn đang chờ nhận (waiting_tech) tại chi nhánh của KTV.
     * Cam kết ẨN TUYỆT ĐỐI 100% GIÁ TIỀN.
     */
    public function sendTechnicianOrderLookup(
        TelegramRecipient $recipient,
        string $keyword,
        ?string $threadId = null
    ): bool {
        $techUser = $this->resolveTechnicianUserForRecipient($recipient);
        $effectiveThreadId = $threadId ?? $recipient->telegram_thread_id;
        $cleanKeyword = trim(ltrim($keyword, '#'));

        if ($cleanKeyword === '') {
            return $this->sendTechnicianMyOrdersSummary($recipient, $effectiveThreadId);
        }

        $escapedLike = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $cleanKeyword);
        $cleanDigits = preg_replace('/\D+/', '', $cleanKeyword);

        $query = RepairOrder::withoutGlobalScopes()
            ->with(['customer', 'deviceModel', 'branch', 'createdByUser', 'technician'])
            ->where('tenant_id', $recipient->tenant_id)
            ->where(function ($scope) use ($techUser, $recipient) {
                if ($techUser) {
                    $scope->where('technician_id', $techUser->id);
                }
                $scope->orWhere(function ($unassigned) use ($recipient) {
                    $unassigned->where('status', 'waiting_tech')
                        ->whereNull('technician_id')
                        ->when($recipient->branch_id !== null, fn ($b) => $b->where('branch_id', $recipient->branch_id));
                });
            })
            ->where(function ($q) use ($escapedLike, $cleanDigits) {
                $q->where('order_code', 'like', "%{$escapedLike}%")
                    ->orWhere('serial_number', 'like', "%{$escapedLike}%")
                    ->orWhereHas('customer', function ($cq) use ($escapedLike, $cleanDigits) {
                        $cq->where('name', 'like', "%{$escapedLike}%")
                            ->orWhere('phone', 'like', "%{$escapedLike}%");
                        if ($cleanDigits !== '' && strlen($cleanDigits) >= 4) {
                            $cq->orWhere('phone', 'like', "%{$cleanDigits}%");
                        }
                    });
            })
            ->orderByDesc('updated_at')
            ->limit(10)
            ->get();

        if ($query->isEmpty()) {
            $kwEsc = $this->escapeHtml($cleanKeyword);
            $notFoundHtml = "<b>🔍 Không tìm thấy đơn kỹ thuật khớp từ khóa:</b> <code>{$kwEsc}</code>\n"
                . "<i>(Lưu ý: Bạn chỉ tra cứu được các đơn do bạn phụ trách hoặc đơn đang chờ nhận tại chi nhánh).</i>";

            return $this->sendMessage(
                (string) $recipient->telegram_chat_id,
                $notFoundHtml,
                $effectiveThreadId,
                [[['text' => '📋 Đơn của tôi hôm nay', 'callback_data' => 'tech_my_orders']]]
            );
        }

        if ($query->count() === 1) {
            /** @var RepairOrder $singleOrder */
            $singleOrder = $query->first();
            return $this->sendTechnicianOrderDetail($recipient, $singleOrder, $effectiveThreadId);
        }

        $kwEsc = $this->escapeHtml($cleanKeyword);
        $lines = [
            "<b>🔍 KẾT QUẢ TRA CỨU ({$query->count()} ĐƠN KHỚP '{$kwEsc}')</b>",
            "━━━━━━━━━━━━━━━━━━",
        ];

        $inlineKeyboard = [];
        $row = [];
        foreach ($query as $ord) {
            $lines[] = $this->formatTechnicianOrderBriefLine($ord);
            $row[] = [
                'text'          => "🔍 #{$ord->order_code}",
                'callback_data' => "tech_view_order:{$ord->id}",
            ];
            if (count($row) === 2) {
                $inlineKeyboard[] = $row;
                $row = [];
            }
        }
        if (! empty($row)) {
            $inlineKeyboard[] = $row;
        }
        $inlineKeyboard[] = [
            ['text' => '📋 Đơn của tôi hôm nay', 'callback_data' => 'tech_my_orders'],
        ];

        return $this->sendMessage(
            (string) $recipient->telegram_chat_id,
            implode("\n", $lines),
            $effectiveThreadId,
            $inlineKeyboard
        );
    }

    /**
     * Gửi thẻ chi tiết kỹ thuật của 1 đơn theo ID khi KTV bấm nút [🔍 #PC...].
     */
    public function sendTechnicianOrderDetailById(
        TelegramRecipient $recipient,
        int $orderId,
        ?string $threadId = null
    ): bool {
        $techUser = $this->resolveTechnicianUserForRecipient($recipient);
        $effectiveThreadId = $threadId ?? $recipient->telegram_thread_id;

        $order = RepairOrder::withoutGlobalScopes()
            ->with(['customer', 'deviceModel', 'branch', 'createdByUser', 'technician'])
            ->where('tenant_id', $recipient->tenant_id)
            ->whereKey($orderId)
            ->first();

        if (! $order) {
            return $this->sendMessage(
                (string) $recipient->telegram_chat_id,
                '<b>⚠️ Không tìm thấy thông tin đơn sửa chữa này.</b>',
                $effectiveThreadId
            );
        }

        // Kiểm tra quyền xem của KTV: chỉ xem đơn của mình hoặc đơn đang waiting_tech cùng chi nhánh
        $isOwnOrder = $techUser && (int) $order->technician_id === (int) $techUser->id;
        $isAvailableInBranch = $order->status === 'waiting_tech'
            && empty($order->technician_id)
            && ($recipient->branch_id === null || (int) $order->branch_id === (int) $recipient->branch_id);

        if (! $isOwnOrder && ! $isAvailableInBranch) {
            return $this->sendMessage(
                (string) $recipient->telegram_chat_id,
                "<b>🔒 Đơn #{$this->escapeHtml((string) $order->order_code)} hiện do KTV khác phụ trách.</b>",
                $effectiveThreadId,
                [[['text' => '📋 Đơn của tôi hôm nay', 'callback_data' => 'tech_my_orders']]]
            );
        }

        return $this->sendTechnicianOrderDetail($recipient, $order, $effectiveThreadId);
    }

    /**
     * Render và gửi thẻ chi tiết kỹ thuật của 1 đơn sửa chữa cho KTV.
     * Cam kết ẨN TUYỆT ĐỐI 100% MỌI TRƯỜNG GIÁ TIỀN (total_price, initial_price, additional_services[].price).
     */
    public function sendTechnicianOrderDetail(
        TelegramRecipient $recipient,
        RepairOrder $order,
        ?string $threadId = null
    ): bool {
        $effectiveThreadId = $threadId ?? $recipient->telegram_thread_id;
        $htmlText = $this->buildTechnicianOrderDetailHtml($order);

        $inlineKeyboard = [];
        if ($order->status === 'waiting_tech' && empty($order->technician_id)) {
            $inlineKeyboard[] = [
                [
                    'text'          => '✅ Nhận đơn',
                    'callback_data' => "accept_order:{$order->id}",
                ],
                [
                    'text'          => '❌ Không nhận',
                    'callback_data' => "reject_order:{$order->id}",
                ],
            ];
        }

        $inlineKeyboard[] = [
            ['text' => '📋 Đơn của tôi hôm nay', 'callback_data' => 'tech_my_orders'],
        ];

        return $this->sendMessage(
            (string) $recipient->telegram_chat_id,
            $htmlText,
            $effectiveThreadId,
            $inlineKeyboard
        );
    }

    /**
     * Xây dựng chuỗi HTML chi tiết đơn sửa chữa cho KTV (TUYỆT ĐỐI KHÔNG CHỨA GIÁ TIỀN).
     */
    public function buildTechnicianOrderDetailHtml(RepairOrder $order): string
    {
        $order->loadMissing(['customer', 'deviceModel', 'branch', 'createdByUser', 'technician']);

        $orderCode = $this->escapeHtml((string) $order->order_code);
        $statusLabel = $this->escapeHtml(OrderWorkflowService::STATUS_LABELS[(string) $order->status] ?? (string) $order->status);
        $branchName = $this->escapeHtml((string) ($order->branch?->name ?? 'Mặc định'));
        $customerName = $this->escapeHtml((string) ($order->customer?->name ?? 'Khách lẻ'));
        $customerPhone = $this->escapeHtml((string) ($order->customer?->phone ?? 'N/A'));
        $deviceName = $this->escapeHtml((string) ($order->deviceModel?->name ?? 'Thiết bị'));
        $serial = trim((string) ($order->serial_number ?? ''));
        $accessories = trim((string) ($order->accessories ?? ''));
        $issue = $this->escapeHtml((string) ($order->issue_description ?? 'Không rõ'));
        $testNote = trim((string) ($order->test_note ?? ''));
        $appearance = trim((string) ($order->appearance_notes ?? ''));
        $partsNeeded = trim((string) ($order->parts_needed ?? ''));
        $specialParts = trim((string) ($order->special_parts_needed ?? ''));
        $repairNote = trim((string) ($order->repair_note ?? ''));
        $techName = $this->escapeHtml((string) ($order->technician?->name ?? 'Chưa phân công'));

        $orderType = (string) ($order->order_type ?? 'in_store');
        $orderTypeLabel = match ($orderType) {
            'cod'      => 'Đơn COD (Khách tỉnh)',
            'warranty' => 'Tiếp nhận bảo hành',
            default    => 'Khách tại cửa hàng',
        };

        $lines = [
            "<b>🔍 CHI TIẾT ĐƠN KỸ THUẬT #{$orderCode}</b>",
            "━━━━━━━━━━━━━━━━━━",
            "<b>Trạng thái:</b> <b>{$statusLabel}</b>",
            "<b>KTV phụ trách:</b> {$techName}",
            "<b>Chi nhánh:</b> {$branchName} ({$orderTypeLabel})",
            "<b>Khách hàng:</b> {$customerName} - <code>{$customerPhone}</code>",
            "<b>Thiết bị:</b> {$deviceName}" . ($serial !== '' ? " (SN: <code>" . $this->escapeHtml($serial) . "</code>)" : ''),
        ];

        if ($accessories !== '') {
            $lines[] = "<b>Phụ kiện:</b> " . $this->escapeHtml($accessories);
        }

        $lines[] = "<b>Tình trạng lỗi:</b> {$issue}";

        if ($testNote !== '') {
            $lines[] = "<b>Ghi chú test đầu vào:</b> " . $this->escapeHtml($testNote);
        }

        if ($appearance !== '') {
            $lines[] = "<b>Ngoại quan:</b> " . $this->escapeHtml($appearance);
        }

        if ($partsNeeded !== '') {
            $lines[] = "<b>Linh kiện cần thay:</b> " . $this->escapeHtml($partsNeeded);
        }

        if ($specialParts !== '') {
            $spStatus = $order->special_parts_status === 'purchased' ? 'Đã mua' : 'Chờ mua ngoài';
            $lines[] = "<b>Linh kiện đặc biệt:</b> " . $this->escapeHtml($specialParts) . " ({$spStatus})";
        }

        // Dịch vụ phát sinh: chỉ hiển thị tên dịch vụ & ghi chú kỹ thuật, ẩn 100% giá tiền
        $additionalServices = is_array($order->additional_services) ? $order->additional_services : [];
        if (! empty($additionalServices)) {
            $lines[] = "<b>Hạng mục / Dịch vụ bổ sung:</b>";
            foreach ($additionalServices as $srv) {
                $srvName = $this->escapeHtml(trim((string) ($srv['name'] ?? 'Hạng mục sửa chữa')));
                $srvNote = trim((string) ($srv['note'] ?? ''));
                $noteSuffix = $srvNote !== '' ? ' — <i>' . $this->escapeHtml($srvNote) . '</i>' : '';
                $lines[] = "  • {$srvName}{$noteSuffix}";
            }
        }

        if ($repairNote !== '') {
            $lines[] = "<b>Ghi chú kỹ thuật:</b> " . $this->escapeHtml($repairNote);
        }

        $lines[] = "<b>Tiếp nhận lúc:</b> " . ($order->created_at ?? now())->format('H:i - d/m/Y');

        return implode("\n", $lines);
    }

    /**
     * Escape HTML an toàn cho Telegram parse_mode=HTML.
     */
    protected function escapeHtml(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
