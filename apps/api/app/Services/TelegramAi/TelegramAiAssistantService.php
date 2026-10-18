<?php

namespace App\Services\TelegramAi;

use App\Models\Branch;
use App\Models\TelegramRecipient;
use App\Services\TelegramNotificationService;
use Illuminate\Support\Facades\Log;

class TelegramAiAssistantService
{
    public function __construct(
        protected GeminiFunctionCallingClient $geminiClient,
        protected TelegramAiToolRegistry $toolRegistry,
        protected TelegramNotificationService $telegramService
    ) {
    }

    /**
     * Xác định tên hiển thị chi nhánh chuẩn cho người nhận Telegram.
     */
    public static function resolveBranchDisplay(TelegramRecipient $recipient): string
    {
        if ($recipient->branch_id !== null) {
            $branchName = trim((string) ($recipient->branch?->name ?? ''));
            if ($branchName === '') {
                $branchName = trim((string) Branch::withoutGlobalScopes()
                    ->where('id', (int) $recipient->branch_id)
                    ->value('name'));
            }

            return $branchName !== '' ? $branchName : "Chi nhánh #{$recipient->branch_id}";
        }

        $branchNames = Branch::withoutGlobalScopes()
            ->where('tenant_id', (int) $recipient->tenant_id)
            ->where('is_active', true)
            ->orderBy('id')
            ->pluck('name')
            ->map(static fn ($name) => trim((string) $name))
            ->filter()
            ->values()
            ->all();

        if (count($branchNames) === 1) {
            return $branchNames[0];
        }

        if (count($branchNames) > 1) {
            return implode(', ', $branchNames);
        }

        return 'Chi nhánh chính';
    }

    /**
     * Xử lý tin nhắn hội thoại tự nhiên từ Admin đã kích hoạt trên Telegram theo Luồng 2 bước (2-Step Flow):
     * - Bước 1: Gửi câu hỏi sang Gemini để AI phân tích ý định và bóc tách danh sách function_calls (tên Tool + tham số args).
     * - Bước 2: Backend thực thi Eloquent query của từng Tool và dùng trực tiếp hàm định dạng HTML tại Backend để gửi thẳng về Telegram (không gọi lại Gemini lần 2).
     */
    public function handleIncomingMessage(TelegramRecipient $recipient, string $text, array $update = []): bool
    {
        $chatId = trim((string) $recipient->telegram_chat_id);
        $text = trim($text);

        if ($chatId === '' || $text === '') {
            return false;
        }

        try {
            $recipient->loadMissing(['tenant', 'branch']);

            $this->telegramService->sendChatAction($chatId, 'typing', $recipient->telegram_thread_id);

            $systemInstruction = $this->buildSystemInstruction($recipient);
            $functionDeclarations = $this->toolRegistry->getFunctionDeclarations();

            $initialContents = [
                [
                    'role'  => 'user',
                    'parts' => [
                        ['text' => $text],
                    ],
                ],
            ];

            // Bước 1: Gửi câu hỏi của Admin kèm danh sách Tools sang Gemini để bóc tách tham số
            $step1 = $this->geminiClient->generateWithTools(
                $initialContents,
                $functionDeclarations,
                $systemInstruction
            );

            if (! ($step1['ok'] ?? false)) {
                $errorMsg = "<b>Hệ thống Trợ lý AI tạm thời gián đoạn</b>\n"
                    . "Vui lòng kiểm tra cấu hình GEMINI_API_KEY hoặc thử lại sau ít phút.";
                $this->telegramService->sendMessage($chatId, $errorMsg, $recipient->telegram_thread_id);
                return false;
            }

            // Bước 2: Nếu Gemini yêu cầu gọi một hoặc nhiều Tool, thực thi tại Backend và tự định dạng HTML tiếng Việt gửi thẳng về Telegram
            $functionCalls = $step1['function_calls'] ?? (
                ! empty($step1['function_call']) && is_array($step1['function_call'])
                    ? [$step1['function_call']]
                    : []
            );

            if (! empty($functionCalls)) {
                $formattedChunks = [];

                foreach ($functionCalls as $fc) {
                    if (! is_array($fc)) {
                        continue;
                    }

                    $toolName = trim((string) ($fc['name'] ?? ''));
                    if ($toolName === '') {
                        continue;
                    }

                    $args = (array) ($fc['args'] ?? []);
                    $toolResult = $this->toolRegistry->execute($toolName, $args, $recipient);

                    $chunk = $this->toolRegistry->formatHtml($toolName, $toolResult)
                        ?? $this->formatToolResultFallback($toolName, $toolResult);

                    if (trim($chunk) !== '') {
                        $formattedChunks[] = trim($chunk);
                    }
                }

                if (! empty($formattedChunks)) {
                    $cleanHtml = $this->sanitizeTelegramHtml(implode("\n\n", $formattedChunks));

                    return $this->telegramService->sendMessage(
                        $chatId,
                        $cleanHtml,
                        $recipient->telegram_thread_id
                    );
                }
            }

            // Trường hợp câu hỏi hội thoại thông thường không cần gọi Tool
            $replyText = trim((string) ($step1['text'] ?? ''));
            if ($replyText === '') {
                $replyText = "<b>Trợ lý AI PodsCare</b>\nTôi có thể hỗ trợ bạn tra cứu đơn sửa chữa, báo cáo doanh thu, kiểm tra tồn kho linh kiện và tra cứu bảo hành.";
            }

            $cleanHtml = $this->sanitizeTelegramHtml($replyText);

            return $this->telegramService->sendMessage(
                $chatId,
                $cleanHtml,
                $recipient->telegram_thread_id
            );
        } catch (\Throwable $e) {
            Log::error('TelegramAiAssistantService handleIncomingMessage failed: ' . $e->getMessage(), [
                'recipient_id' => $recipient->id,
                'chat_id'      => $chatId,
            ]);

            return false;
        }
    }

    /**
     * Xây dựng System Instruction cho Gemini với ngữ cảnh chi nhánh và quy tắc cấm tuyệt đối emoji/icon & JSON thô.
     */
    public function buildSystemInstruction(TelegramRecipient $recipient): string
    {
        $adminLabel = trim((string) ($recipient->label ?: 'Quản trị viên'));
        $branchDisplay = self::resolveBranchDisplay($recipient);
        $nowStr = now()->format('Y-m-d H:i:s (l)');

        return implode("\n", [
            "Bạn là Trợ lý Quản trị AI chuyên nghiệp của hệ thống quản lý sửa chữa PodsCare.",
            "Thông tin ngữ cảnh hiện tại:",
            "- Thời gian hệ thống: {$nowStr}",
            "- Chi nhánh quản lý: {$branchDisplay}",
            "- Người đang trò chuyện: {$adminLabel} (Vai trò: {$recipient->target_role})",
            "",
            "QUY TẮC BẮT BUỘC TUYỆT ĐỐI:",
            "1. Ngôn ngữ: Trả lời hoàn toàn bằng tiếng Việt, ngắn gọn, súc tích, lịch sự, chuyên nghiệp.",
            "2. Định dạng HTML Telegram: Chỉ được phép sử dụng các thẻ <b>, <i>, <code>. Khi trình bày danh sách hoặc tách đoạn, hãy xuống dòng trực tiếp (ký tự xuống dòng thật) và dùng gạch đầu dòng '- '. TUYỆT ĐỐI KHÔNG viết chuỗi ký tự '\\n' dạng chữ vào nội dung trả lời.",
            "3. CẤM TUYỆT ĐỐI ICON & EMOJI: Không được sử dụng bất kỳ biểu tượng cảm xúc (emoji), icon đồ họa hay ký tự tượng hình nào trong câu trả lời.",
            "4. Trung thực dữ liệu 100%: Khi người dùng hỏi về đơn sửa chữa, doanh thu, thu chi, tồn kho linh kiện hoặc bảo hành, BẮT BUỘC gọi công cụ (Tool) tương ứng. Tuyệt đối không tự suy đoán hoặc bịa đặt số liệu ngoài kết quả do Tool trả về.",
            "5. Định dạng tiền tệ Việt Nam: Luôn trình bày số tiền có dấu chấm phân cách hàng nghìn kèm đơn vị 'đ' (ví dụ: 450.000 đ).",
            "6. Tên chi nhánh: Khi nhắc đến tên cửa hàng hoặc chi nhánh trong câu trả lời, BẮT BUỘC ưu tiên sử dụng đúng tên chi nhánh tại trường 'branch_name' hoặc 'branch_scope' trong kết quả Tool trả về (nếu không gọi Tool thì dùng '{$branchDisplay}'). TUYỆT ĐỐI KHÔNG dùng cụm từ 'FIXO Master System', 'Toàn cửa hàng' hay 'Cửa hàng PodsCare'.",
            "7. TUYỆT ĐỐI KHÔNG in lại chuỗi JSON thô của công cụ (như {\"..._response\": ...}) vào câu trả lời. Chỉ trả lời bằng văn bản tiếng Việt định dạng HTML.",
        ]);
    }

    /**
     * Làm sạch văn bản trả về từ AI để đảm bảo tương thích Telegram HTML, lọc bỏ JSON thô và loại bỏ 100% icon/emoji.
     */
    public function sanitizeTelegramHtml(string $text): string
    {
        // Loại bỏ markdown code fence nếu AI bọc ```html ... ``` hoặc ```json ... ```
        $text = preg_replace('/^```(?:html|json)?\s*/i', '', trim($text)) ?? $text;
        $text = preg_replace('/\s*```$/', '', $text) ?? $text;

        // Loại bỏ mọi khối JSON thô (như {"get_revenue_summary_response": ...}) ở đầu văn bản trước khi xử lý HTML
        $text = $this->stripRawToolJsonBlocks($text);

        // Chuyển đổi mọi chuỗi ký tự \r\n và \n bị viết dưới dạng literal (\n) thành ký tự xuống dòng thật
        $text = str_replace(['\\r\\n', '\\n'], "\n", $text);

        // Chuyển đổi các thẻ xuống dòng/khối phổ biến sang \n
        $text = preg_replace('/<br\s*\/?>/i', "\n", $text) ?? $text;
        $text = preg_replace('/<\/p\s*>/i', "\n", $text) ?? $text;
        $text = preg_replace('/<p(?:\s[^>]*)?>/i', '', $text) ?? $text;
        $text = preg_replace('/<\/li\s*>/i', "\n", $text) ?? $text;
        $text = preg_replace('/<li(?:\s[^>]*)?>/i', '- ', $text) ?? $text;

        // Chuyển đổi Markdown **bold** sang <b>bold</b> nếu AI dùng nhầm Markdown
        $text = preg_replace('/\*\*(.+?)\*\*/s', '<b>$1</b>', $text) ?? $text;

        // Chỉ giữ lại các thẻ HTML được Telegram hỗ trợ
        $text = strip_tags($text, '<b><strong><i><em><u><code><pre><a>');

        // Lọc lại một lần nữa phòng trường hợp khối JSON nằm bên trong thẻ <code> hoặc <p> đã bị bóc tách
        $text = $this->stripRawToolJsonBlocks($text);

        // Đảm bảo không còn sót chuỗi literal \r\n hoặc \n sau khi bóc thẻ
        $text = str_replace(['\\r\\n', '\\n'], "\n", $text);

        // Loại bỏ toàn bộ ký tự Emoji / Pictographs / Dingbats / Variation Selectors
        $text = preg_replace(
            '/[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2300}-\x{23FF}\x{2B50}\x{2B55}\x{FE00}-\x{FE0F}\x{200D}]/u',
            '',
            $text
        ) ?? $text;

        // Thu gọn khoảng trắng và dòng trống dư thừa
        $text = preg_replace("/\n{3,}/", "\n\n", $text) ?? $text;

        return trim($text);
    }

    /**
     * Cắt bỏ mọi khối JSON thô của functionResponse (ví dụ: {"get_revenue_summary_response": ...}) hoặc dòng JSON ở đầu văn bản.
     */
    protected function stripRawToolJsonBlocks(string $text): string
    {
        // Xóa các dòng đơn chứa {"..._response": ...} (kể cả khi bọc trong <code>...</code>)
        $text = preg_replace('/^\s*(?:<code>)?\s*\{[^\r\n]*?"[a-z0-9_]+_response"\s*:[^\r\n]*\}\s*(?:<\/code>)?\s*/im', '', $text) ?? $text;

        $trimmed = ltrim($text);
        while (str_starts_with($trimmed, '{')) {
            $endPos = $this->findMatchingJsonBraceEnd($trimmed);
            if ($endPos === null) {
                break;
            }

            $candidate = substr($trimmed, 0, $endPos + 1);
            $decoded = json_decode($candidate, true);
            if (is_array($decoded) || (bool) preg_match('/"[a-z0-9_]+_response"\s*:/i', $candidate)) {
                $trimmed = ltrim(substr($trimmed, $endPos + 1));
                continue;
            }

            break;
        }

        // Phòng trường hợp regex nhiều dòng cho khối {"..._response": ...}
        $trimmed = preg_replace('/^\s*\{[^\n]*?"[a-z0-9_]+_response"\s*:.*?\}\s*/is', '', $trimmed) ?? $trimmed;

        return $trimmed;
    }

    /**
     * Tìm vị trí dấu ngoặc nhọn đóng '}' khớp với dấu '{' ở đầu chuỗi JSON (hỗ trợ cả JSON lồng nhau nhiều cấp).
     */
    protected function findMatchingJsonBraceEnd(string $str): ?int
    {
        $len = strlen($str);
        $depth = 0;
        $inString = false;
        $escape = false;

        for ($i = 0; $i < $len; $i++) {
            $ch = $str[$i];
            if ($escape) {
                $escape = false;
                continue;
            }
            if ($ch === '\\' && $inString) {
                $escape = true;
                continue;
            }
            if ($ch === '"') {
                $inString = ! $inString;
                continue;
            }
            if (! $inString) {
                if ($ch === '{') {
                    $depth++;
                } elseif ($ch === '}') {
                    $depth--;
                    if ($depth === 0) {
                        return $i;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Ghép kết quả dự phòng bằng tiếng Việt HTML khi có một hoặc nhiều Tool được gọi.
     *
     * @param  array<int, array{name: string, args: array, result: array}>  $executedTools
     */
    public function formatMultipleToolResultsFallback(array $executedTools): string
    {
        $sections = [];
        foreach ($executedTools as $item) {
            $toolName = (string) ($item['name'] ?? '');
            $toolResult = (array) ($item['result'] ?? []);
            $sections[] = $this->formatToolResultFallback($toolName, $toolResult);
        }

        return implode("\n\n", array_filter($sections, static fn (string $s) => trim($s) !== ''));
    }

    /**
     * Định dạng câu trả lời bằng văn bản tiếng Việt HTML chuẩn (TUYỆT ĐỐI KHÔNG dùng json_encode và KHÔNG hiển thị tag kỹ thuật BE).
     */
    public function formatToolResultFallback(string $toolName, array $toolResult): string
    {
        if (isset($toolResult['error'])) {
            $err = htmlspecialchars((string) $toolResult['error'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            return "<b>Không thể thực hiện tra cứu</b>\nChi tiết: <code>{$err}</code>";
        }

        $toolFormatted = $this->toolRegistry->formatHtml($toolName, $toolResult);
        if ($toolFormatted !== null && trim($toolFormatted) !== '') {
            return $toolFormatted;
        }

        $lines = ["<b>Kết quả tra cứu hệ thống</b>"];
        foreach ($toolResult as $key => $val) {
            if (is_scalar($val)) {
                $safeKey = htmlspecialchars((string) $key, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $safeVal = htmlspecialchars((string) $val, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $lines[] = "- {$safeKey}: <code>{$safeVal}</code>";
            }
        }

        return implode("\n", $lines);
    }
}

