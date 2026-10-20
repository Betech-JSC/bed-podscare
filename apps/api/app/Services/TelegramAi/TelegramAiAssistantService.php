<?php

namespace App\Services\TelegramAi;

use App\Models\Branch;
use App\Models\TelegramRecipient;
use App\Services\TelegramNotificationService;
use Illuminate\Support\Facades\Log;

class TelegramAiAssistantService
{
    protected TelegramAiMemoryService $memoryService;

    public function __construct(
        protected GeminiFunctionCallingClient $geminiClient,
        protected TelegramAiToolRegistry $toolRegistry,
        protected TelegramNotificationService $telegramService,
        ?TelegramAiMemoryService $memoryService = null
    ) {
        $this->memoryService = $memoryService ?? new TelegramAiMemoryService($this->geminiClient);
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
     * Xử lý tin nhắn hội thoại tự nhiên từ Admin đã kích hoạt trên Telegram theo Luồng 2 bước thông minh (2-Turn AI Synthesis với Instant HTML Fallback):
     * - Bước 1 (Turn 1): Gửi câu hỏi sang 9Router để AI phân tích ý định và bóc tách danh sách function_calls (tên Tool + tham số args).
     * - Bước 2 (Backend Tool Execution + Turn 2 Synthesis):
     *   + Thực thi Eloquent query của từng Tool.
     *   + Nếu câu hỏi mang tính phân tích, so sánh, hỏi đích danh ("cái nào cao hơn", "so sánh", "ai thay...") hoặc gọi nhiều Tool / có bảng breakdown:
     *     Gọi tiếp Turn 2 (`synthesizeToolResults`) qua 9Router để AI tổng hợp câu trả lời trực diện bằng HTML tiếng Việt.
     *   + Nếu là tra cứu cơ bản hoặc nếu Turn 2 gặp lỗi/rỗng: Dùng Instant HTML Fallback (`formatHtml()`) gửi thẳng về Telegram.
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
            $functionDeclarations = $this->toolRegistry->getFunctionDeclarations($recipient);

            $initialContents = [
                [
                    'role'  => 'user',
                    'parts' => [
                        ['text' => $text],
                    ],
                ],
            ];

            // Bước 1: Gửi câu hỏi của Admin kèm danh sách Tools sang 9Router để bóc tách tham số
            $step1 = $this->geminiClient->generateWithTools(
                $initialContents,
                $functionDeclarations,
                $systemInstruction
            );

            if (! ($step1['ok'] ?? false)) {
                $errorMsg = "<b>Hệ thống Trợ lý AI tạm thời gián đoạn</b>\n"
                    . "Vui lòng kiểm tra kết nối 9Router hoặc thử lại sau ít phút.";
                $this->telegramService->sendMessage($chatId, $errorMsg, $recipient->telegram_thread_id);
                return false;
            }

            // Bước 2: Thực thi một hoặc nhiều Tool được yêu cầu
            $functionCalls = $step1['function_calls'] ?? (
                ! empty($step1['function_call']) && is_array($step1['function_call'])
                    ? [$step1['function_call']]
                    : []
            );

            if (! empty($functionCalls)) {
                $formattedChunks = [];
                $executedTools = [];

                foreach ($functionCalls as $fc) {
                    if (! is_array($fc)) {
                        continue;
                    }

                    $toolName = trim((string) ($fc['name'] ?? ''));
                    if ($toolName === '') {
                        continue;
                    }

                    $rawArgs = (array) ($fc['args'] ?? []);
                    $args = $this->enrichToolArgumentsFromQuestion($toolName, $rawArgs, $text, $recipient);
                    $toolResult = $this->toolRegistry->execute($toolName, $args, $recipient);

                    $chunk = $this->toolRegistry->formatHtml($toolName, $toolResult)
                        ?? $this->formatToolResultFallback($toolName, $toolResult);
                    $trimmedChunk = trim($chunk);

                    $executedTools[] = [
                        'name'           => $toolName,
                        'args'           => $args,
                        'result'         => $toolResult,
                        'formatted_html' => $trimmedChunk,
                    ];

                    if ($trimmedChunk !== '') {
                        $formattedChunks[] = $trimmedChunk;
                    }
                }

                // Nếu câu hỏi cần phân tích/so sánh/tổng hợp sâu -> Gọi Turn 2 Synthesis qua 9Router
                if ($this->shouldSynthesizeWithAi($text, $executedTools)) {
                    $step2 = $this->geminiClient->synthesizeToolResults(
                        $text,
                        $executedTools,
                        $systemInstruction
                    );

                    if (($step2['ok'] ?? false) && trim((string) ($step2['text'] ?? '')) !== '') {
                        $synthesizedHtml = $this->sanitizeTelegramHtml((string) $step2['text']);
                        if ($synthesizedHtml !== '') {
                            $this->recordMemorySafely($recipient, $text, $executedTools, $synthesizedHtml);

                            return $this->telegramService->sendMessage(
                                $chatId,
                                $synthesizedHtml,
                                $recipient->telegram_thread_id
                            );
                        }
                    }
                }

                // Instant HTML Fallback (dùng cho tra cứu nhanh hoặc khi Turn 2 Synthesis lỗi/rỗng)
                if (! empty($formattedChunks)) {
                    $cleanHtml = $this->sanitizeTelegramHtml(implode("\n\n", $formattedChunks));
                    $this->recordMemorySafely($recipient, $text, $executedTools, $cleanHtml);

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
            $this->recordMemorySafely($recipient, $text, [], $cleanHtml);

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

            try {
                $busyMsg = "<b>Hệ thống Trợ lý AI tạm thời bận</b>\n"
                    . "Đã xảy ra gián đoạn khi xử lý yêu cầu của bạn. Vui lòng thử lại sau ít phút.";
                $this->telegramService->sendMessage($chatId, $busyMsg, $recipient->telegram_thread_id);
            } catch (\Throwable) {
                // Không ném thêm ngoại lệ từ nhánh thông báo lỗi dự phòng
            }

            return false;
        }
    }

    /**
     * Chuẩn hóa an toàn giá trị tham số thành chuỗi đơn.
     */
    protected function scalarString(mixed $value, string $default = ''): string
    {
        if (is_array($value)) {
            $parts = [];
            array_walk_recursive($value, static function (mixed $item) use (&$parts): void {
                if (is_string($item) || is_int($item) || is_float($item)) {
                    $trimmed = trim((string) $item);
                    if ($trimmed !== '') {
                        $parts[] = $trimmed;
                    }
                }
            });

            return ! empty($parts) ? implode(' ', $parts) : $default;
        }

        if (is_string($value) || is_int($value) || is_float($value)) {
            $trimmed = trim((string) $value);

            return $trimmed !== '' ? $trimmed : $default;
        }

        return $default;
    }

    /**
     * Ghi nhận lượt tương tác vào TelegramAiMemoryService một cách an toàn, không làm gián đoạn luồng trả lời.
     *
     * @param  array<int, array<string, mixed>>  $executedTools
     */
    protected function recordMemorySafely(
        TelegramRecipient $recipient,
        string $question,
        array $executedTools = [],
        ?string $assistantSummaryHint = null
    ): void {
        try {
            $this->memoryService->recordInteraction($recipient, $question, $executedTools, $assistantSummaryHint);
        } catch (\Throwable $e) {
            Log::warning('TelegramAiAssistantService recordMemorySafely warning: ' . $e->getMessage(), [
                'recipient_id' => $recipient->id,
            ]);
        }
    }

    /**
     * Tự động bổ sung/chuẩn hóa tham số Tool dựa trên ngữ cảnh câu hỏi của người dùng và trí nhớ hội thoại ngắn hạn:
     * - Nếu câu hỏi có đại từ chỉ định ("đơn đó", "khách đó", "máy đó", "nhà cung cấp đó"...), tự động lấy mã/tên thực thể từ ai_recent_messages.
     * - Nếu câu hỏi so sánh doanh thu giữa nhiều dòng thiết bị (ví dụ: AirPods và Apple Watch) mà AI quên truyền group_by,
     *   tự động gán group_by = 'device_category' và gỡ bỏ bộ lọc đơn lẻ device_category.
     */
    public function enrichToolArgumentsFromQuestion(
        string $toolName,
        array $args,
        string $question,
        ?TelegramRecipient $recipient = null
    ): array {
        if ($recipient !== null) {
            $args = $this->memoryService->resolveToolArgsWithMemory($toolName, $args, $question, $recipient);
        }

        $normalizedQ = mb_strtolower(trim($question), 'UTF-8');

        if ($toolName === 'get_revenue_summary') {
            $detectedCategories = $this->detectMentionedDeviceCategories($normalizedQ);
            $hasExistingGroupBy = $this->scalarString($args['group_by'] ?? '') !== '';

            if (! $hasExistingGroupBy) {
                if (
                    count($detectedCategories) >= 2
                    || str_contains($normalizedQ, 'dòng máy nào')
                    || str_contains($normalizedQ, 'dòng nào')
                    || str_contains($normalizedQ, 'thiết bị nào')
                ) {
                    $args['group_by'] = 'device_category';
                    if (count($detectedCategories) >= 2) {
                        unset($args['device_category']);
                    }
                } elseif (
                    str_contains($normalizedQ, 'kỹ thuật nào')
                    || str_contains($normalizedQ, 'kỹ thuật viên nào')
                    || str_contains($normalizedQ, 'thợ nào')
                ) {
                    $args['group_by'] = 'technician';
                } elseif (str_contains($normalizedQ, 'chi nhánh nào')) {
                    $args['group_by'] = 'branch';
                } elseif (str_contains($normalizedQ, 'dịch vụ nào')) {
                    $args['group_by'] = 'service';
                }
            } elseif (
                strtolower($this->scalarString($args['group_by'] ?? '')) === 'device_category'
                && count($detectedCategories) >= 2
            ) {
                unset($args['device_category']);
            }
        } elseif ($toolName === 'fallback_schema_query') {
            $entity = strtolower($this->scalarString($args['entity'] ?? ''));
            $hasSortBy = $this->scalarString($args['sort_by'] ?? '') !== '';

            if (! $hasSortBy) {
                if (
                    $entity === 'customers'
                    && (
                        str_contains($normalizedQ, 'nhiều lần')
                        || str_contains($normalizedQ, 'nhiều nhất')
                        || str_contains($normalizedQ, 'nhiều đơn')
                        || str_contains($normalizedQ, 'thân thiết')
                        || str_contains($normalizedQ, 'vip')
                    )
                ) {
                    $args['sort_by'] = 'orders_desc';
                } elseif (
                    in_array($entity, ['suppliers', 'goods_receipts', 'supplier_debt_transactions'], true)
                    && (
                        str_contains($normalizedQ, 'nợ nhiều')
                        || str_contains($normalizedQ, 'công nợ cao')
                        || str_contains($normalizedQ, 'nợ cao nhất')
                    )
                ) {
                    $args['sort_by'] = 'debt_desc';
                } elseif (
                    $entity === 'work_shifts'
                    && (
                        str_contains($normalizedQ, 'lệch')
                        || str_contains($normalizedQ, 'chênh lệch')
                        || str_contains($normalizedQ, 'thiếu tiền')
                        || str_contains($normalizedQ, 'thừa tiền')
                    )
                ) {
                    $args['sort_by'] = 'cash_diff_desc';
                }
            }
        }

        return $args;
    }

    /**
     * Tách từ khóa tìm kiếm và gợi ý ngày tháng (date_from, date_to) từ văn bản tự nhiên,
     * bảo toàn tên dòng máy có dấu '/' như "AirPods 1/2", "Gen 1/2", "Series 1/2/3".
     *
     * @return array{keyword: string, date_from: string|null, date_to: string|null, parsed_from: ?\Carbon\Carbon, parsed_to: ?\Carbon\Carbon}
     */
    public function extractKeywordAndDateHints(string $rawKeyword): array
    {
        return (new \App\Services\TelegramAi\Tools\LookupOrderTool())->extractKeywordAndDateHints($rawKeyword);
    }

    /**
     * Phát hiện danh sách các dòng thiết bị được nhắc tới trong câu hỏi.
     *
     * @return array<int, string>
     */
    protected function detectMentionedDeviceCategories(string $normalizedQuestion): array
    {
        $categories = [];

        if (
            str_contains($normalizedQuestion, 'airpod')
            || str_contains($normalizedQuestion, 'tai nghe')
            || str_contains($normalizedQuestion, 'beats')
        ) {
            $categories[] = 'AirPods';
        }

        if (str_contains($normalizedQuestion, 'watch') || str_contains($normalizedQuestion, 'đồng hồ')) {
            $categories[] = 'Apple Watch';
        }

        if (str_contains($normalizedQuestion, 'iphone')) {
            $categories[] = 'iPhone';
        }

        if (str_contains($normalizedQuestion, 'ipad')) {
            $categories[] = 'iPad';
        }

        if (str_contains($normalizedQuestion, 'macbook') || str_contains($normalizedQuestion, 'imac')) {
            $categories[] = 'MacBook';
        }

        return $categories;
    }

    /**
     * Xác định xem có cần gọi Bước 2 (Turn 2 Synthesis qua 9Router) để AI tổng hợp/so sánh/trả lời trực diện hay không.
     *
     * @param  array<int, array{name: string, args: array, result: array}>  $executedTools
     */
    public function shouldSynthesizeWithAi(string $question, array $executedTools): bool
    {
        if (empty($executedTools)) {
            return false;
        }

        $hasSuccessfulTool = false;
        foreach ($executedTools as $item) {
            if (empty($item['result']['error'])) {
                $hasSuccessfulTool = true;
                break;
            }
        }

        if (! $hasSuccessfulTool) {
            return false;
        }

        // Nếu gọi từ 2 công cụ trở lên trong cùng 1 lượt -> cần AI tổng hợp chung
        if (count($executedTools) > 1) {
            return true;
        }

        // Nếu kết quả công cụ có bảng phân rã đa chiều (breakdown) -> cần AI phân tích/so sánh
        foreach ($executedTools as $item) {
            if (! empty($item['result']['breakdown']) && is_array($item['result']['breakdown'])) {
                return true;
            }
        }

        $normalized = mb_strtolower(trim($question), 'UTF-8');

        $analyticalKeywords = [
            'cái nào cao hơn',
            'cao hơn',
            'thấp hơn',
            'nhiều hơn',
            'ít hơn',
            'nhiều nhất',
            'nhiều lần nhất',
            'nhiều đơn nhất',
            'ít nhất',
            'cao nhất',
            'thấp nhất',
            'so sánh',
            'chênh lệch',
            'hơn kém',
            'cái nào',
            'bên nào',
            'dòng nào',
            'dòng máy nào',
            'thiết bị nào',
            'chi nhánh nào',
            'khách hàng nào',
            'khách nào',
            'nhà cung cấp nào',
            'ai thay',
            'ai sửa',
            'ai làm',
            'ai nhận',
            'ai phụ trách',
            'kỹ thuật nào',
            'kỹ thuật viên nào',
            'thợ nào',
            'tại sao',
            'đánh giá',
            'nhận xét',
            'tổng hợp',
            'phân tích',
        ];

        foreach ($analyticalKeywords as $kw) {
            if (str_contains($normalized, $kw)) {
                return true;
            }
        }

        return false;
    }

    public function getMemoryService(): TelegramAiMemoryService
    {
        return $this->memoryService;
    }

    /**
     * Xây dựng System Instruction cho 9Router AI với ngữ cảnh chi nhánh, trí nhớ hội thoại ngắn hạn, hướng dẫn bóc tách tham số đa chiều và quy tắc cấm tuyệt đối emoji/icon & JSON thô.
     */
    public function buildSystemInstruction(TelegramRecipient $recipient): string
    {
        $adminLabel = trim((string) ($recipient->label ?: 'Quản trị viên'));
        $branchDisplay = self::resolveBranchDisplay($recipient);
        $nowStr = now()->format('Y-m-d H:i:s (l)');

        $lines = [
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
            "4. Trung thực dữ liệu 100%: Khi người dùng hỏi về dữ liệu nghiệp vụ cửa hàng, BẮT BUỘC gọi công cụ (Tool) tương ứng. Tuyệt đối không tự suy đoán hoặc bịa đặt số liệu ngoài kết quả do Tool trả về.",
            "5. Quy tắc ưu tiên chọn Tool (4 Tool cốt lõi vs Tool dự phòng fallback_schema_query):",
            "   - LUÔN ƯU TIÊN TUYỆT ĐỐI 4 Tool chuyên biệt cho các nghiệp vụ chính: 'lookup_repair_orders' (Đơn sửa chữa), 'get_revenue_summary' (Doanh thu & Sổ quỹ), 'check_inventory_parts' (Tồn kho linh kiện), và 'lookup_warranties' (Bảo hành).",
            "   - Khi người dùng hỏi ai sửa/thay linh kiện hoặc dịch vụ cụ thể vào ngày nào (ví dụ: 'Ai thay vỏ thép đen ngày 18/10?'), hãy gọi 'lookup_repair_orders' với keyword='thay vỏ thép đen', date_from='18/10', date_to='18/10'.",
            "   - Khi người dùng so sánh doanh thu giữa các dòng thiết bị (ví dụ: 'Doanh thu của AirPods và Apple Watch cái nào cao hơn?'), hãy gọi 'get_revenue_summary' với group_by='device_category'. Nếu hỏi theo kỹ thuật viên thì truyền group_by='technician', theo dịch vụ thì group_by='service', theo chi nhánh thì group_by='branch'.",
            "   - CHỈ GỌI 'fallback_schema_query' khi câu hỏi nằm ngoài phạm vi 4 Tool cốt lõi trên và hỏi về 5 nhóm nghiệp vụ còn lại: Bảng giá dịch vụ niêm yết (entity='repair_services'), Lỗi thường gặp (entity='common_issues'), Nhà cung cấp/Phiếu nhập kho/Công nợ NCC (entity='suppliers' | 'goods_receipts' | 'supplier_debt_transactions'), Ca làm việc & đối soát két tiền (entity='work_shifts'), Khách hàng thân thiết sửa nhiều lần (entity='customers', sort_by='orders_desc'), hoặc Kiểm định QC & Vận đơn COD (entity='qc_inspections' | 'shipments').",
            "6. Định dạng tiền tệ Việt Nam: Luôn trình bày số tiền có dấu chấm phân cách hàng nghìn kèm đơn vị 'đ' (ví dụ: 450.000 đ).",
            "7. Tên chi nhánh: Khi nhắc đến tên cửa hàng hoặc chi nhánh trong câu trả lời, BẮT BUỘC ưu tiên sử dụng đúng tên chi nhánh tại trường 'branch_name' hoặc 'branch_scope' trong kết quả Tool trả về (nếu không gọi Tool thì dùng '{$branchDisplay}'). TUYỆT ĐỐI KHÔNG dùng cụm từ 'FIXO Master System', 'Toàn cửa hàng' hay 'Cửa hàng PodsCare'.",
            "8. TUYỆT ĐỐI KHÔNG in lại chuỗi JSON thô của công cụ (như {\"..._response\": ...}) vào câu trả lời. Chỉ trả lời bằng văn bản tiếng Việt định dạng HTML.",
        ];

        $memorySection = $this->memoryService->formatMemoryPromptSection($recipient);
        if ($memorySection !== '') {
            $lines[] = '';
            $lines[] = $memorySection;
        }

        return implode("\n", $lines);
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
            if (! empty($toolResult['permission_denied']) || $toolName === 'get_revenue_summary') {
                return "<b>Từ chối quyền truy cập</b>\n{$err}";
            }

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

