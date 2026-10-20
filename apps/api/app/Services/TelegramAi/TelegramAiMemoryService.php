<?php

namespace App\Services\TelegramAi;

use App\Models\TelegramRecipient;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class TelegramAiMemoryService
{
    /**
     * Số lượt hội thoại gần nhất tối đa được giữ trong ai_recent_messages (3 - 5 lượt).
     */
    public const RECENT_MESSAGES_LIMIT = 5;

    /**
     * Thời gian hết hạn phiên hội thoại ngắn hạn (30 phút không tương tác sẽ làm mới ai_recent_messages).
     */
    public const SESSION_TTL_MINUTES = 30;

    /**
     * Ngưỡng số lượng tin nhắn kích hoạt tự động tóm tắt vào ai_context_summary và reset ai_message_count = 0.
     */
    public const SUMMARY_THRESHOLD = 20;

    /**
     * Danh sách các trường số liệu tài chính / doanh thu / tồn kho / công nợ tĩnh bị CẤM lưu vào bộ nhớ.
     *
     * @var array<int, string>
     */
    public const FORBIDDEN_STATIC_NUMBER_KEYS = [
        'total_price',
        'formatted_price',
        'base_price',
        'price',
        'estimated_price',
        'estimated_cost',
        'formatted_estimated_price',
        'estimated_order_revenue',
        'formatted_estimated_order_revenue',
        'net_payment_collected',
        'formatted_net_payment_collected',
        'cashbook_total_in',
        'cashbook_total_out',
        'cashbook_net',
        'stock_quantity',
        'total_stock_quantity',
        'branch_stock_quantity',
        'min_stock_alert',
        'retail_price',
        'formatted_retail_price',
        'cost_price',
        'formatted_cost_price',
        'debt_balance',
        'total_debt',
        'current_debt',
        'formatted_debt',
        'total_purchased',
        'formatted_total_purchased',
        'total_amount',
        'final_amount',
        'paid_amount',
        'debt_amount',
        'formatted_total_amount',
        'formatted_paid_amount',
        'formatted_debt_amount',
        'amount',
        'formatted_amount',
        'debt_before',
        'debt_after',
        'balance_after',
        'formatted_balance_after',
        'opening_cash',
        'closing_cash',
        'actual_cash',
        'expected_cash',
        'difference_amount',
        'cash_difference',
        'formatted_opening_cash',
        'formatted_closing_cash',
        'formatted_expected_cash',
        'formatted_difference_amount',
        'total_spent',
        'valid_orders_spent',
        'formatted_total_spent',
        'cod_amount',
        'formatted_cod_amount',
        'shipping_fee',
        'formatted_shipping_fee',
    ];

    public function __construct(
        protected ?GeminiFunctionCallingClient $geminiClient = null
    ) {
    }

    /**
     * Kiểm tra phiên hội thoại ngắn hạn (ai_recent_messages) đã hết hạn sau 30 phút không tương tác hay chưa.
     */
    public function isSessionExpired(TelegramRecipient $recipient): bool
    {
        $lastInteraction = $recipient->ai_last_interaction_at;
        if ($lastInteraction === null) {
            return true;
        }

        try {
            $lastCarbon = $lastInteraction instanceof Carbon
                ? $lastInteraction
                : Carbon::parse((string) $lastInteraction);

            return $lastCarbon->lte(now()->subMinutes(self::SESSION_TTL_MINUTES));
        } catch (\Throwable) {
            return true;
        }
    }

    /**
     * Lấy danh sách 3-5 lượt hội thoại gần nhất còn hạn (trong vòng 30 phút).
     * Nếu đã quá 30 phút không tương tác, trả về mảng rỗng [].
     *
     * @return array<int, array<string, mixed>>
     */
    public function getActiveRecentMessages(TelegramRecipient $recipient): array
    {
        if ($this->isSessionExpired($recipient)) {
            return [];
        }

        $rawMessages = $recipient->ai_recent_messages;
        if (! is_array($rawMessages) || empty($rawMessages)) {
            return [];
        }

        $sanitized = [];
        foreach ($rawMessages as $msg) {
            if (! is_array($msg)) {
                continue;
            }

            $sanitized[] = $this->sanitizeRecentMessageItem($msg);
        }

        return array_slice($sanitized, -self::RECENT_MESSAGES_LIMIT);
    }

    /**
     * Xây dựng cấu trúc dữ liệu ngữ cảnh trí nhớ đầy đủ cho một TelegramRecipient.
     *
     * @return array{
     *     session_expired: bool,
     *     message_count: int,
     *     context_summary: string,
     *     recent_messages: array<int, array<string, mixed>>,
     *     latest_entities: array<string, mixed>
     * }
     */
    public function buildMemoryContext(TelegramRecipient $recipient): array
    {
        $expired = $this->isSessionExpired($recipient);
        $recentMessages = $expired ? [] : $this->getActiveRecentMessages($recipient);
        $rawSummary = trim((string) ($recipient->ai_context_summary ?? ''));
        $cleanSummary = $rawSummary !== '' ? $this->stripMonetaryFigures($rawSummary) : '';

        return [
            'session_expired' => $expired,
            'message_count'   => (int) ($recipient->ai_message_count ?? 0),
            'context_summary' => $cleanSummary,
            'recent_messages' => $recentMessages,
            'latest_entities' => $this->resolveLatestEntitiesFromMessages($recentMessages),
        ];
    }

    /**
     * Alias tương thích với thiết kế: trả về khối văn bản ngữ cảnh trí nhớ để nhúng vào System Prompt.
     */
    public function buildPromptContext(TelegramRecipient $recipient): string
    {
        return $this->formatMemoryPromptSection($recipient);
    }

    /**
     * Kết xuất khối văn bản ngữ cảnh trí nhớ (gồm ai_context_summary và 3-5 lượt ai_recent_messages còn hạn)
     * kèm chỉ thị bắt buộc cấm dùng số liệu cũ (Zero Stale Numbers).
     */
    public function formatMemoryPromptSection(TelegramRecipient $recipient): string
    {
        $context = $this->buildMemoryContext($recipient);
        $summary = $context['context_summary'];
        $recentMessages = $context['recent_messages'];

        if ($summary === '' && empty($recentMessages)) {
            return '';
        }

        $lines = [
            'NGỮ CẢNH HỘI THOẠI & TRÍ NHỚ THỰC THỂ:',
        ];

        if ($summary !== '') {
            $lines[] = "- Tóm tắt ngữ cảnh tích lũy (20 tin nhắn trước): {$summary}";
        }

        if (! empty($recentMessages)) {
            $lines[] = '- Lịch sử các lượt hỏi gần nhất trong phiên hiện tại (còn hạn 30 phút):';
            foreach ($recentMessages as $idx => $turn) {
                $turnNo = $idx + 1;
                $at = trim((string) ($turn['at'] ?? ''));
                $question = trim((string) ($turn['question'] ?? ''));
                $toolsCalled = is_array($turn['tools_called'] ?? null)
                    ? implode(', ', array_filter(array_map('strval', $turn['tools_called'])))
                    : '';
                $entitiesText = $this->formatEntitiesInline((array) ($turn['entities'] ?? []));

                $turnDesc = "  + Lượt {$turnNo}" . ($at !== '' ? " ({$at})" : '') . ": Câu hỏi=\"{$question}\"";
                if ($toolsCalled !== '') {
                    $turnDesc .= " | Tool đã gọi={$toolsCalled}";
                }
                if ($entitiesText !== '') {
                    $turnDesc .= " | Thực thể=[{$entitiesText}]";
                }

                $lines[] = $turnDesc;
            }
        }

        $latestEntitiesText = $this->formatEntitiesInline($context['latest_entities']);
        if ($latestEntitiesText !== '') {
            $lines[] = "- Thực thể trọng tâm gần nhất để giải nghĩa đại từ ('đơn đó', 'khách đó', 'máy đó', 'nhà cung cấp đó'): {$latestEntitiesText}";
        }

        $lines[] = 'CHỈ THỊ BẮT BUỘC VỀ TRÍ NHỚ HỘI THOẠI:';
        $lines[] = "- Chỉ dùng thông tin mã thực thể (order_code, customer_name, phone, warranty_code, device_name, supplier_name...) từ lịch sử hội thoại để giải nghĩa các đại từ chỉ định như 'đơn đó', 'khách đó', 'máy đó', 'nhà cung cấp đó'. TUYỆT ĐỐI KHÔNG dùng lại bất kỳ con số doanh thu/tồn kho/công nợ cũ nào mà PHẢI gọi Tool để lấy số liệu thực tế mới nhất từ Database.";

        return implode("\n", $lines);
    }

    /**
     * Trích xuất CHỈ các mã định danh & tên thực thể từ kết quả các Tool vừa chạy.
     * TUYỆT ĐỐI LOẠI BỎ các trường số tiền, doanh thu, số lượng tồn kho, công nợ tĩnh.
     *
     * @param  array<int, array<string, mixed>>  $executedTools
     * @return array<string, mixed>
     */
    public function extractEntityReferencesFromToolResults(array $executedTools): array
    {
        $toolNames = [];
        $orderCodes = [];
        $customerNames = [];
        $customerPhones = [];
        $deviceNames = [];
        $deviceCategories = [];
        $technicianNames = [];
        $warrantyCodes = [];
        $partNames = [];
        $skus = [];
        $supplierNames = [];
        $receiptCodes = [];
        $shiftCodes = [];
        $shipmentCodes = [];
        $branchNames = [];
        $entitiesQueried = [];

        foreach ($executedTools as $toolEntry) {
            if (! is_array($toolEntry)) {
                continue;
            }

            $toolName = trim((string) ($toolEntry['name'] ?? $toolEntry['tool_name'] ?? ''));
            if ($toolName !== '') {
                $toolNames[] = $toolName;
            }

            $args = is_array($toolEntry['args'] ?? null) ? $toolEntry['args'] : [];
            $result = is_array($toolEntry['result'] ?? null) ? $toolEntry['result'] : $toolEntry;

            // Bóc tách mã thực thể từ tham số đầu vào (nếu có)
            $this->collectStringValue($orderCodes, $args['order_code'] ?? null);
            $this->collectStringValue($customerNames, $args['customer_name'] ?? null, ['Khách lẻ']);
            $this->collectStringValue($customerPhones, $args['customer_phone'] ?? null);
            $this->collectStringValue($deviceCategories, $args['device_category'] ?? null);
            $this->collectStringValue($technicianNames, $args['technician_name'] ?? null, ['Chưa phân công', 'Hệ thống']);
            $this->collectStringValue($warrantyCodes, $args['warranty_code'] ?? null);
            $this->collectStringValue($entitiesQueried, $args['entity'] ?? null);

            if (! empty($result['error'])) {
                continue;
            }

            $this->collectStringValue($branchNames, $result['branch_name'] ?? $result['branch_scope'] ?? null);
            $this->collectStringValue($entitiesQueried, $result['entity'] ?? null);

            // 1. Kết quả từ lookup_repair_orders (orders)
            if (is_array($result['orders'] ?? null)) {
                foreach ($result['orders'] as $order) {
                    if (! is_array($order)) {
                        continue;
                    }
                    $this->collectFromRecord(
                        $order,
                        $orderCodes,
                        $customerNames,
                        $customerPhones,
                        $deviceNames,
                        $deviceCategories,
                        $technicianNames,
                        $warrantyCodes,
                        $partNames,
                        $skus,
                        $supplierNames,
                        $receiptCodes,
                        $shiftCodes,
                        $shipmentCodes,
                        $branchNames
                    );
                }
            }

            // 2. Kết quả từ lookup_warranties (warranties)
            if (is_array($result['warranties'] ?? null)) {
                foreach ($result['warranties'] as $warranty) {
                    if (! is_array($warranty)) {
                        continue;
                    }
                    $this->collectFromRecord(
                        $warranty,
                        $orderCodes,
                        $customerNames,
                        $customerPhones,
                        $deviceNames,
                        $deviceCategories,
                        $technicianNames,
                        $warrantyCodes,
                        $partNames,
                        $skus,
                        $supplierNames,
                        $receiptCodes,
                        $shiftCodes,
                        $shipmentCodes,
                        $branchNames
                    );
                }
            }

            // 3. Kết quả từ check_inventory_parts (parts)
            if (is_array($result['parts'] ?? null)) {
                foreach ($result['parts'] as $part) {
                    if (! is_array($part)) {
                        continue;
                    }
                    $this->collectStringValue($partNames, $part['name'] ?? $part['part_name'] ?? null);
                    $this->collectStringValue($skus, $part['sku'] ?? null);
                    $this->collectStringValue($deviceCategories, $part['category'] ?? null);
                }
            }

            // 4. Kết quả từ fallback_schema_query hoặc danh sách items tổng quát
            $entityType = strtolower(trim((string) ($result['entity'] ?? $args['entity'] ?? '')));
            if (is_array($result['items'] ?? null)) {
                foreach ($result['items'] as $item) {
                    if (! is_array($item)) {
                        continue;
                    }

                    if ($entityType === 'customers') {
                        $this->collectStringValue($customerNames, $item['name'] ?? $item['customer_name'] ?? null, ['Khách lẻ']);
                        $this->collectStringValue($customerPhones, $item['phone'] ?? $item['customer_phone'] ?? null);
                    } elseif ($entityType === 'suppliers') {
                        $this->collectStringValue($supplierNames, $item['name'] ?? $item['supplier_name'] ?? null);
                    } elseif (in_array($entityType, ['repair_services', 'common_issues'], true)) {
                        $this->collectStringValue($deviceNames, $item['device_name'] ?? $item['device_model_name'] ?? null, ['Tất cả dòng máy']);
                    }

                    $this->collectFromRecord(
                        $item,
                        $orderCodes,
                        $customerNames,
                        $customerPhones,
                        $deviceNames,
                        $deviceCategories,
                        $technicianNames,
                        $warrantyCodes,
                        $partNames,
                        $skus,
                        $supplierNames,
                        $receiptCodes,
                        $shiftCodes,
                        $shipmentCodes,
                        $branchNames
                    );
                }
            }

            // Trường hợp truyền trực tiếp bản ghi đơn lẻ vào $executedTools
            $this->collectFromRecord(
                $result,
                $orderCodes,
                $customerNames,
                $customerPhones,
                $deviceNames,
                $deviceCategories,
                $technicianNames,
                $warrantyCodes,
                $partNames,
                $skus,
                $supplierNames,
                $receiptCodes,
                $shiftCodes,
                $shipmentCodes,
                $branchNames
            );

            // Bóc tách bổ sung mã thực thể từ formatted_html (nếu có)
            $formattedHtml = $this->scalarString($toolEntry['formatted_html'] ?? '');
            if ($formattedHtml !== '') {
                if (preg_match_all('/\b(?:(?:RO|PC|BH|GR|WS|SH)-[A-Z0-9\-]+|PC[A-Z]{1,4}\d{6,10})\b/i', $formattedHtml, $htmlCodeMatches)) {
                    foreach ($htmlCodeMatches[0] as $matchedCode) {
                        $upperCode = strtoupper(trim($matchedCode));
                        if (str_starts_with($upperCode, 'BH-')) {
                            $this->collectStringValue($warrantyCodes, $upperCode);
                        } elseif (str_starts_with($upperCode, 'GR-')) {
                            $this->collectStringValue($receiptCodes, $upperCode);
                        } elseif (str_starts_with($upperCode, 'WS-')) {
                            $this->collectStringValue($shiftCodes, $upperCode);
                        } elseif (str_starts_with($upperCode, 'SH-')) {
                            $this->collectStringValue($shipmentCodes, $upperCode);
                        } else {
                            $this->collectStringValue($orderCodes, $upperCode);
                        }
                    }
                }
            }
        }

        $extracted = [];

        if (! empty($toolNames)) {
            $extracted['tool_name'] = $toolNames[0];
            $extracted['tool_names'] = $toolNames;
        }
        if (! empty($orderCodes)) {
            $extracted['order_code'] = $orderCodes[0];
            $extracted['order_codes'] = $orderCodes;
        }
        if (! empty($customerNames)) {
            $extracted['customer_name'] = $customerNames[0];
            $extracted['customer_names'] = $customerNames;
        }
        if (! empty($customerPhones)) {
            $extracted['customer_phone'] = $customerPhones[0];
            $extracted['phone'] = $customerPhones[0];
            $extracted['customer_phones'] = $customerPhones;
        }
        if (! empty($deviceNames)) {
            $extracted['device_name'] = $deviceNames[0];
            $extracted['device_names'] = $deviceNames;
        }
        if (! empty($deviceCategories)) {
            $extracted['device_category'] = $deviceCategories[0];
            $extracted['device_categories'] = $deviceCategories;
        }
        if (! empty($technicianNames)) {
            $extracted['technician_name'] = $technicianNames[0];
            $extracted['technician_names'] = $technicianNames;
        }
        if (! empty($warrantyCodes)) {
            $extracted['warranty_code'] = $warrantyCodes[0];
            $extracted['warranty_codes'] = $warrantyCodes;
        }
        if (! empty($partNames)) {
            $extracted['part_name'] = $partNames[0];
            $extracted['part_names'] = $partNames;
        }
        if (! empty($skus)) {
            $extracted['sku'] = $skus[0];
            $extracted['skus'] = $skus;
        }
        if (! empty($supplierNames)) {
            $extracted['supplier_name'] = $supplierNames[0];
            $extracted['supplier_names'] = $supplierNames;
        }
        if (! empty($receiptCodes)) {
            $extracted['receipt_code'] = $receiptCodes[0];
            $extracted['receipt_codes'] = $receiptCodes;
        }
        if (! empty($shiftCodes)) {
            $extracted['shift_code'] = $shiftCodes[0];
            $extracted['shift_codes'] = $shiftCodes;
        }
        if (! empty($shipmentCodes)) {
            $extracted['shipment_code'] = $shipmentCodes[0];
            $extracted['shipment_codes'] = $shipmentCodes;
        }
        if (! empty($branchNames)) {
            $extracted['branch_name'] = $branchNames[0];
            $extracted['branch_names'] = $branchNames;
        }
        if (! empty($entitiesQueried)) {
            $extracted['entity'] = $entitiesQueried[0];
            $extracted['entities'] = $entitiesQueried;
        }

        return $this->purgeForbiddenStaticKeys($extracted);
    }

    /**
     * Ghi nhận một lượt tương tác của người dùng vào bộ nhớ (an toàn với DB::transaction + lockForUpdate):
     * - Làm mới ai_recent_messages nếu đã quá 30 phút không tương tác.
     * - Lưu tối đa 5 lượt gần nhất (chỉ lưu câu hỏi, tên Tool và mã thực thể, CẤM lưu số tiền/tồn kho tĩnh).
     * - Tăng ai_message_count thêm 1; khi đạt mốc 20 tin nhắn thì tự động tóm tắt vào ai_context_summary và reset ai_message_count = 0.
     *
     * @param  array<int, array<string, mixed>>  $executedTools
     */
    public function recordInteraction(
        TelegramRecipient $recipient,
        string $userQuestion,
        array $executedTools = [],
        ?string $assistantSummaryHint = null
    ): void {
        $cleanQuestion = $this->stripMonetaryFigures(trim($userQuestion));
        if ($cleanQuestion === '') {
            return;
        }

        $entities = $this->extractEntityReferencesFromToolResults($executedTools);

        $toolsCalled = [];
        foreach ($executedTools as $toolEntry) {
            if (! is_array($toolEntry)) {
                continue;
            }
            $name = $this->scalarString($toolEntry['name'] ?? $toolEntry['tool_name'] ?? '');
            if ($name !== '' && ! in_array($name, $toolsCalled, true)) {
                $toolsCalled[] = $name;
            }
        }

        $sanitizedNewTurn = $this->sanitizeRecentMessageItem([
            'at'           => now()->format('H:i d/m/Y'),
            'question'     => $cleanQuestion,
            'tools_called' => $toolsCalled,
            'entities'     => $entities,
        ]);

        DB::transaction(function () use ($recipient, $sanitizedNewTurn, $assistantSummaryHint): void {
            /** @var TelegramRecipient|null $lockedRecipient */
            $lockedRecipient = $recipient->getKey() !== null
                ? TelegramRecipient::withoutGlobalScopes()
                    ->whereKey($recipient->getKey())
                    ->lockForUpdate()
                    ->first()
                : null;

            $target = $lockedRecipient ?? $recipient;

            if ($target !== $recipient) {
                if ($recipient->isDirty('ai_message_count')) {
                    $target->ai_message_count = $recipient->ai_message_count;
                }
                if ($recipient->isDirty('ai_recent_messages')) {
                    $target->ai_recent_messages = $recipient->ai_recent_messages;
                }
                if ($recipient->isDirty('ai_last_interaction_at')) {
                    $target->ai_last_interaction_at = $recipient->ai_last_interaction_at;
                }
                if ($recipient->isDirty('ai_context_summary')) {
                    $target->ai_context_summary = $recipient->ai_context_summary;
                }
            }

            // Nếu phiên cũ đã quá 30 phút không tương tác -> làm mới danh sách ai_recent_messages
            $recentMessages = $this->isSessionExpired($target)
                ? []
                : $this->getActiveRecentMessages($target);

            $recentMessages[] = $sanitizedNewTurn;
            $recentMessages = array_values(array_slice($recentMessages, -self::RECENT_MESSAGES_LIMIT));

            $newCount = ((int) ($target->ai_message_count ?? 0)) + 1;

            $target->ai_recent_messages = $recentMessages;
            $target->ai_last_interaction_at = now();

            if ($newCount >= self::SUMMARY_THRESHOLD) {
                $target->ai_context_summary = $this->summarizeContext(
                    $target,
                    $recentMessages,
                    $assistantSummaryHint
                );
                $target->ai_message_count = 0;
            } else {
                $target->ai_message_count = $newCount;
            }

            $target->save();

            if ($target !== $recipient) {
                $recipient->ai_recent_messages = $target->ai_recent_messages;
                $recipient->ai_last_interaction_at = $target->ai_last_interaction_at;
                $recipient->ai_context_summary = $target->ai_context_summary;
                $recipient->ai_message_count = $target->ai_message_count;
                $recipient->syncOriginal();
            }
        });
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
     * Tổng hợp ngữ cảnh sau mỗi 20 tin nhắn để lưu vào ai_context_summary.
     * Chỉ giữ lại chủ đề quan tâm, chi nhánh, dòng máy và các mã định danh thực thể gần nhất;
     * lọc bỏ 100% các con số tiền tệ, doanh thu, tồn kho, công nợ tĩnh.
     *
     * @param  array<int, array<string, mixed>>  $recentMessages
     */
    public function summarizeContext(
        TelegramRecipient $recipient,
        array $recentMessages = [],
        ?string $assistantSummaryHint = null,
        bool $preferAiClient = false
    ): string {
        if (empty($recentMessages) && is_array($recipient->ai_recent_messages)) {
            $recentMessages = $recipient->ai_recent_messages;
        }

        $fallbackSummary = $this->buildDeterministicContextSummary(
            $recipient,
            $recentMessages,
            $assistantSummaryHint
        );

        $useAiSummarizer = $preferAiClient || (bool) config('services.gemini.summarize_with_ai', false);
        if (! $useAiSummarizer) {
            return $fallbackSummary;
        }

        try {
            $client = $this->geminiClient ?? app(GeminiFunctionCallingClient::class);
            $promptLines = [
                'Hãy tóm tắt ngắn gọn (tối đa 3 câu tiếng Việt) ngữ cảnh hội thoại của Quản trị viên sau 20 tin nhắn.',
                'YÊU CẦU BẮT BUỘC:',
                '- Chỉ nêu các chủ đề nghiệp vụ đang quan tâm, tên chi nhánh, dòng thiết bị và các mã thực thể (order_code, customer_name, customer_phone, warranty_code, supplier_name).',
                '- TUYỆT ĐỐI KHÔNG đưa bất kỳ con số tiền tệ (đ, VNĐ), doanh thu, chi phí, công nợ hay số lượng tồn kho nào vào bản tóm tắt.',
                '- Dữ liệu cơ sở: ' . $fallbackSummary,
            ];

            $res = $client->generateWithTools([
                [
                    'role'    => 'user',
                    'content' => implode("\n", $promptLines),
                ],
            ]);

            if (($res['ok'] ?? false) && empty($res['function_calls']) && trim((string) ($res['text'] ?? '')) !== '') {
                $aiSummary = $this->stripMonetaryFigures(strip_tags(trim((string) $res['text'])));
                if ($aiSummary !== '') {
                    return $aiSummary;
                }
            }
        } catch (\Throwable $e) {
            Log::warning('TelegramAiMemoryService summarizeContext AI fallback triggered: ' . $e->getMessage());
        }

        return $fallbackSummary;
    }

    /**
     * Hỗ trợ tự động điền mã/tên thực thể từ ai_recent_messages (còn hạn 30 phút) vào tham số Tool
     * khi câu hỏi của người dùng chứa đại từ chỉ định tham chiếu ngược ("đơn đó", "khách đó", "máy đó", "nhà cung cấp đó"...)
     * mà LLM chưa truyền đủ order_code / customer_phone / customer_name / warranty_code / keyword.
     */
    public function resolveToolArgsWithMemory(
        string $toolName,
        array $args,
        string $question,
        TelegramRecipient $recipient
    ): array {
        if ($this->isSessionExpired($recipient)) {
            return $args;
        }

        $recentMessages = $this->getActiveRecentMessages($recipient);
        if (empty($recentMessages)) {
            return $args;
        }

        $latestEntities = $this->resolveLatestEntitiesFromMessages($recentMessages);
        if (empty($latestEntities)) {
            return $args;
        }

        $normalizedQ = mb_strtolower(trim($question), 'UTF-8');
        $hasOrderPronoun = $this->containsAnyPhrase($normalizedQ, [
            'đơn đó', 'đơn này', 'đơn vừa rồi', 'đơn trên', 'đơn đấy', 'phiếu đó', 'phiếu này', 'ca đó',
        ]);
        $hasCustomerPronoun = $this->containsAnyPhrase($normalizedQ, [
            'khách đó', 'khách này', 'khách vừa rồi', 'khách trên', 'khách đấy',
            'người đó', 'người này', 'anh đó', 'anh ấy', 'chị đó', 'chị ấy', 'bạn đó',
        ]);
        $hasDevicePronoun = $this->containsAnyPhrase($normalizedQ, [
            'máy đó', 'máy này', 'máy vừa rồi', 'thiết bị đó', 'tai nghe đó', 'đồng hồ đó', 'chiếc đó',
        ]);
        $hasSupplierPronoun = $this->containsAnyPhrase($normalizedQ, [
            'nhà cung cấp đó', 'nhà cung cấp này', 'ncc đó', 'ncc này', 'bên đó', 'đối tác đó',
        ]);
        $hasPartPronoun = $this->containsAnyPhrase($normalizedQ, [
            'linh kiện đó', 'linh kiện này', 'món đó', 'vỏ đó', 'pin đó', 'màn đó', 'cáp đó',
        ]);
        $hasWarrantyPronoun = $this->containsAnyPhrase($normalizedQ, [
            'bảo hành đó', 'phiếu bảo hành đó', 'gói bảo hành đó',
        ]);

        $hasAnyPronoun = $hasOrderPronoun
            || $hasCustomerPronoun
            || $hasDevicePronoun
            || $hasSupplierPronoun
            || $hasPartPronoun
            || $hasWarrantyPronoun;

        if (! $hasAnyPronoun) {
            return $args;
        }

        $latestOrderCode = $this->scalarString($latestEntities['order_code'] ?? '');
        $latestCustomerPhone = $this->scalarString($latestEntities['customer_phone'] ?? $latestEntities['phone'] ?? '');
        $latestCustomerName = $this->scalarString($latestEntities['customer_name'] ?? '');
        $latestDeviceName = $this->scalarString($latestEntities['device_name'] ?? '');
        $latestDeviceCategory = $this->scalarString($latestEntities['device_category'] ?? '');
        $latestWarrantyCode = $this->scalarString($latestEntities['warranty_code'] ?? '');
        $latestSupplierName = $this->scalarString($latestEntities['supplier_name'] ?? '');
        $latestSku = $this->scalarString($latestEntities['sku'] ?? '');
        $latestPartName = $this->scalarString($latestEntities['part_name'] ?? '');

        if ($toolName === 'lookup_repair_orders') {
            $hasExplicitIdentifier = $this->scalarString($args['order_code'] ?? '') !== ''
                || $this->scalarString($args['customer_phone'] ?? '') !== ''
                || $this->scalarString($args['customer_name'] ?? '') !== '';

            if (! $hasExplicitIdentifier) {
                if (($hasOrderPronoun || $hasDevicePronoun) && $latestOrderCode !== '') {
                    $args['order_code'] = $latestOrderCode;
                    // Nếu keyword chỉ là nội dung câu hỏi đại từ (ví dụ: "đơn đó của khách nào"), xóa keyword để tìm đúng theo order_code
                    if ($this->isPronounOrFollowUpKeyword($this->scalarString($args['keyword'] ?? ''))) {
                        unset($args['keyword']);
                    }
                } elseif ($hasCustomerPronoun) {
                    if ($latestOrderCode !== '' && $this->isAskingAboutSpecificOrderDetails($normalizedQ)) {
                        $args['order_code'] = $latestOrderCode;
                    } elseif ($latestCustomerPhone !== '') {
                        $args['customer_phone'] = $latestCustomerPhone;
                    } elseif ($latestCustomerName !== '') {
                        $args['customer_name'] = $latestCustomerName;
                    } elseif ($latestOrderCode !== '') {
                        $args['order_code'] = $latestOrderCode;
                    }

                    if (
                        (! empty($args['order_code']) || ! empty($args['customer_phone']) || ! empty($args['customer_name']))
                        && $this->isPronounOrFollowUpKeyword($this->scalarString($args['keyword'] ?? ''))
                    ) {
                        unset($args['keyword']);
                    }
                } elseif ($latestOrderCode !== '') {
                    $args['order_code'] = $latestOrderCode;
                    if ($this->isPronounOrFollowUpKeyword($this->scalarString($args['keyword'] ?? ''))) {
                        unset($args['keyword']);
                    }
                } elseif ($latestCustomerPhone !== '') {
                    $args['customer_phone'] = $latestCustomerPhone;
                } elseif ($latestCustomerName !== '') {
                    $args['customer_name'] = $latestCustomerName;
                }
            }
        } elseif ($toolName === 'lookup_warranties') {
            $hasExplicitWarrantyFilter = $this->scalarString($args['warranty_code'] ?? '') !== ''
                || $this->scalarString($args['order_code'] ?? '') !== ''
                || $this->scalarString($args['customer_phone'] ?? '') !== '';

            if (! $hasExplicitWarrantyFilter) {
                if ($hasWarrantyPronoun && $latestWarrantyCode !== '') {
                    $args['warranty_code'] = $latestWarrantyCode;
                } elseif ($latestOrderCode !== '') {
                    $args['order_code'] = $latestOrderCode;
                } elseif ($latestCustomerPhone !== '') {
                    $args['customer_phone'] = $latestCustomerPhone;
                } elseif ($latestWarrantyCode !== '') {
                    $args['warranty_code'] = $latestWarrantyCode;
                }

                if (
                    (! empty($args['warranty_code']) || ! empty($args['order_code']) || ! empty($args['customer_phone']))
                    && $this->isPronounOrFollowUpKeyword($this->scalarString($args['keyword'] ?? ''))
                ) {
                    unset($args['keyword']);
                }
            }
        } elseif ($toolName === 'check_inventory_parts') {
            $currentKw = $this->scalarString($args['keyword'] ?? '');
            if ($currentKw === '' || $this->isPronounOrFollowUpKeyword($currentKw)) {
                if ($latestSku !== '') {
                    $args['keyword'] = $latestSku;
                } elseif ($latestPartName !== '') {
                    $args['keyword'] = $latestPartName;
                } elseif ($latestDeviceName !== '') {
                    $args['keyword'] = $latestDeviceName;
                }
            }
        } elseif ($toolName === 'fallback_schema_query') {
            $entity = strtolower($this->scalarString($args['entity'] ?? ''));
            $currentKw = $this->scalarString($args['keyword'] ?? '');

            if ($currentKw === '' || $this->isPronounOrFollowUpKeyword($currentKw)) {
                if ($entity === 'customers') {
                    if ($latestCustomerPhone !== '') {
                        $args['keyword'] = $latestCustomerPhone;
                    } elseif ($latestCustomerName !== '') {
                        $args['keyword'] = $latestCustomerName;
                    }
                } elseif (in_array($entity, ['suppliers', 'goods_receipts', 'supplier_debt_transactions'], true)) {
                    if ($latestSupplierName !== '') {
                        $args['keyword'] = $latestSupplierName;
                    }
                } elseif (in_array($entity, ['qc_inspections', 'shipments'], true)) {
                    if ($latestOrderCode !== '') {
                        $args['keyword'] = $latestOrderCode;
                    } elseif ($latestCustomerPhone !== '') {
                        $args['keyword'] = $latestCustomerPhone;
                    }
                } elseif (in_array($entity, ['repair_services', 'common_issues'], true)) {
                    if ($latestDeviceName !== '') {
                        $args['keyword'] = $latestDeviceName;
                    } elseif ($latestDeviceCategory !== '') {
                        $args['keyword'] = $latestDeviceCategory;
                    }
                }
            }
        }

        return $args;
    }

    /**
     * Loại bỏ mọi con số tiền tệ / doanh thu / giá tiền (ví dụ: "450.000 đ", "1.200.000đ", "500k", "2 triệu")
     * khỏi chuỗi văn bản để chống lưu số liệu tĩnh (Zero Stale Numbers).
     */
    public function stripMonetaryFigures(string $text): string
    {
        if ($text === '') {
            return '';
        }

        // Xóa các cụm số tiền có đơn vị tiền tệ (450.000 đ, 1,500,000 VNĐ, 300.000d, 500k, 2 triệu...)
        $cleaned = preg_replace(
            '/\b\d{1,3}(?:[.,]\d{3})+(?:\s*(?:đ|đồng|vnd|vnđ|d))?\b/iu',
            '[số liệu động]',
            $text
        ) ?? $text;

        $cleaned = preg_replace(
            '/\b\d+(?:[.,]\d+)?\s*(?:đ|đồng|vnd|vnđ|triệu|tr|nghìn|ngàn|k)\b/iu',
            '[số liệu động]',
            $cleaned
        ) ?? $cleaned;

        // Xóa các cụm khai báo tồn kho tĩnh dạng "tồn kho: 15 cái", "tồn kho còn 12 cái", "còn 12 cái"
        $cleaned = preg_replace(
            '/(?:(?:tồn\s*kho|số\s*lượng\s*tồn|còn\s*tồn)(?:\s*còn)?\s*[:=]?\s*\d+\s*(?:cái|chiếc|bộ|viên|sợi|cặp)?|\b(?:còn|tồn)\s+\d+\s+(?:cái|chiếc|bộ|viên|sợi|cặp)\b)/iu',
            'tồn kho [tra cứu trực tiếp]',
            $cleaned
        ) ?? $cleaned;

        return trim((string) (preg_replace('/\s{2,}/u', ' ', $cleaned) ?? $cleaned));
    }

    /**
     * Làm sạch một phần tử trong ai_recent_messages, đảm bảo không có trường số tiền/tồn kho tĩnh.
     *
     * @param  array<string, mixed>  $item
     * @return array{at: string, question: string, tools_called: array<int, string>, entities: array<string, mixed>}
     */
    protected function sanitizeRecentMessageItem(array $item): array
    {
        $at = trim((string) ($item['at'] ?? now()->format('H:i d/m/Y')));
        $question = $this->stripMonetaryFigures(trim((string) ($item['question'] ?? '')));

        $toolsCalled = [];
        if (is_array($item['tools_called'] ?? null)) {
            foreach ($item['tools_called'] as $toolName) {
                $t = trim((string) $toolName);
                if ($t !== '' && ! in_array($t, $toolsCalled, true)) {
                    $toolsCalled[] = $t;
                }
            }
        }

        $rawEntities = is_array($item['entities'] ?? null) ? $item['entities'] : [];
        $cleanEntities = $this->purgeForbiddenStaticKeys($rawEntities);

        return [
            'at'           => $at,
            'question'     => $question,
            'tools_called' => $toolsCalled,
            'entities'     => $cleanEntities,
        ];
    }

    /**
     * Đệ quy loại bỏ toàn bộ các key số tiền / doanh thu / tồn kho / công nợ bị cấm và làm sạch chuỗi tiền tệ.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function purgeForbiddenStaticKeys(array $data): array
    {
        $clean = [];

        foreach ($data as $key => $value) {
            $keyStr = strtolower(trim((string) $key));

            if (in_array($keyStr, self::FORBIDDEN_STATIC_NUMBER_KEYS, true)) {
                continue;
            }

            if (
                str_contains($keyStr, 'price')
                || str_contains($keyStr, 'revenue')
                || str_contains($keyStr, 'amount')
                || str_contains($keyStr, 'spent')
                || str_contains($keyStr, 'debt')
                || str_contains($keyStr, 'stock')
                || str_contains($keyStr, 'cash')
                || str_contains($keyStr, 'cost')
                || str_contains($keyStr, 'fee')
            ) {
                continue;
            }

            if (is_array($value)) {
                $cleanedSub = $this->purgeForbiddenStaticKeys($value);
                if (! empty($cleanedSub)) {
                    $clean[$key] = $cleanedSub;
                }
                continue;
            }

            if (is_string($value)) {
                $trimmedVal = trim($value);
                if ($trimmedVal === '') {
                    continue;
                }
                // Không áp dụng stripMonetaryFigures lên số điện thoại hoặc mã đơn, chỉ áp dụng nếu chứa đơn vị tiền tệ
                if ((bool) preg_match('/\b(?:đ|đồng|vnd|vnđ)\b/iu', $trimmedVal)) {
                    $trimmedVal = $this->stripMonetaryFigures($trimmedVal);
                }
                $clean[$key] = $trimmedVal;
            }
        }

        return $clean;
    }

    /**
     * Xây dựng bản tóm tắt ngữ cảnh thực thể an toàn (không chứa số tiền/doanh thu/tồn kho tĩnh).
     *
     * @param  array<int, array<string, mixed>>  $recentMessages
     */
    protected function buildDeterministicContextSummary(
        TelegramRecipient $recipient,
        array $recentMessages = [],
        ?string $assistantSummaryHint = null
    ): string {
        $branchDisplay = TelegramAiAssistantService::resolveBranchDisplay($recipient);
        $previousSummary = $this->stripMonetaryFigures(trim((string) ($recipient->ai_context_summary ?? '')));

        $toolsUsed = [];
        $orderCodes = [];
        $customerNames = [];
        $customerPhones = [];
        $deviceNames = [];
        $warrantyCodes = [];
        $supplierNames = [];
        $partNames = [];
        $recentQuestions = [];

        // Kế thừa các mã đơn từ bản tóm tắt cũ nếu có
        if ($previousSummary !== '') {
            if (preg_match_all('/\b(?:RO|PC|BH|GR|WS|SH)-[A-Z0-9\-]+\b/i', $previousSummary, $matches)) {
                foreach ($matches[0] as $code) {
                    $upper = strtoupper(trim($code));
                    if (str_starts_with($upper, 'BH-')) {
                        $this->collectStringValue($warrantyCodes, $upper);
                    } else {
                        $this->collectStringValue($orderCodes, $upper);
                    }
                }
            }
        }

        foreach ($recentMessages as $turn) {
            if (! is_array($turn)) {
                continue;
            }

            $q = $this->stripMonetaryFigures(trim((string) ($turn['question'] ?? '')));
            if ($q !== '') {
                $recentQuestions[] = $q;
            }

            foreach ((array) ($turn['tools_called'] ?? []) as $t) {
                $this->collectStringValue($toolsUsed, $t);
            }

            $ent = is_array($turn['entities'] ?? null) ? $turn['entities'] : [];
            foreach ((array) ($ent['order_codes'] ?? [$ent['order_code'] ?? null]) as $v) {
                $this->collectStringValue($orderCodes, $v);
            }
            foreach ((array) ($ent['customer_names'] ?? [$ent['customer_name'] ?? null]) as $v) {
                $this->collectStringValue($customerNames, $v, ['Khách lẻ']);
            }
            foreach ((array) ($ent['customer_phones'] ?? [$ent['customer_phone'] ?? $ent['phone'] ?? null]) as $v) {
                $this->collectStringValue($customerPhones, $v);
            }
            foreach ((array) ($ent['device_names'] ?? [$ent['device_name'] ?? $ent['device_category'] ?? null]) as $v) {
                $this->collectStringValue($deviceNames, $v, ['Tất cả dòng máy']);
            }
            foreach ((array) ($ent['warranty_codes'] ?? [$ent['warranty_code'] ?? null]) as $v) {
                $this->collectStringValue($warrantyCodes, $v);
            }
            foreach ((array) ($ent['supplier_names'] ?? [$ent['supplier_name'] ?? null]) as $v) {
                $this->collectStringValue($supplierNames, $v);
            }
            foreach ((array) ($ent['part_names'] ?? [$ent['part_name'] ?? $ent['sku'] ?? null]) as $v) {
                $this->collectStringValue($partNames, $v);
            }
        }

        $segments = [
            "Chi nhánh: {$branchDisplay}",
        ];

        if (! empty($toolsUsed)) {
            $segments[] = 'Công cụ thường dùng: ' . implode(', ', array_slice($toolsUsed, -5));
        }
        if (! empty($orderCodes)) {
            $segments[] = 'Mã đơn gần đây: ' . implode(', ', array_slice($orderCodes, -5));
        }
        if (! empty($customerNames)) {
            $segments[] = 'Khách hàng: ' . implode(', ', array_slice($customerNames, -5));
        }
        if (! empty($customerPhones)) {
            $segments[] = 'SĐT khách: ' . implode(', ', array_slice($customerPhones, -5));
        }
        if (! empty($deviceNames)) {
            $segments[] = 'Thiết bị: ' . implode(', ', array_slice($deviceNames, -5));
        }
        if (! empty($warrantyCodes)) {
            $segments[] = 'Mã bảo hành: ' . implode(', ', array_slice($warrantyCodes, -5));
        }
        if (! empty($supplierNames)) {
            $segments[] = 'Nhà cung cấp: ' . implode(', ', array_slice($supplierNames, -5));
        }
        if (! empty($partNames)) {
            $segments[] = 'Linh kiện: ' . implode(', ', array_slice($partNames, -5));
        }
        if (! empty($recentQuestions)) {
            $lastThreeQ = array_slice($recentQuestions, -3);
            $segments[] = 'Chủ đề hỏi gần nhất: ' . implode(' | ', $lastThreeQ);
        }
        if ($assistantSummaryHint !== null && trim($assistantSummaryHint) !== '') {
            $cleanHint = $this->stripMonetaryFigures(strip_tags(trim($assistantSummaryHint)));
            if ($cleanHint !== '') {
                $segments[] = 'Ghi chú ngữ cảnh: ' . mb_substr($cleanHint, 0, 160, 'UTF-8');
            }
        }

        return $this->stripMonetaryFigures(implode('. ', $segments) . '.');
    }

    /**
     * Tổng hợp thực thể mới nhất từ danh sách các lượt hội thoại gần đây (ưu tiên lượt mới nhất trước).
     *
     * @param  array<int, array<string, mixed>>  $recentMessages
     * @return array<string, mixed>
     */
    public function resolveLatestEntitiesFromMessages(array $recentMessages): array
    {
        $merged = [];

        // Duyệt từ lượt mới nhất ngược về lượt cũ hơn
        for ($i = count($recentMessages) - 1; $i >= 0; $i--) {
            $turn = $recentMessages[$i];
            if (! is_array($turn) || ! is_array($turn['entities'] ?? null)) {
                continue;
            }

            foreach ($turn['entities'] as $k => $v) {
                if (! array_key_exists($k, $merged) && ! empty($v)) {
                    $merged[$k] = $v;
                }
            }
        }

        return $this->purgeForbiddenStaticKeys($merged);
    }

    /**
     * Định dạng mảng entities thành chuỗi ngắn gọn để nhúng vào System Prompt.
     *
     * @param  array<string, mixed>  $entities
     */
    protected function formatEntitiesInline(array $entities): string
    {
        if (empty($entities)) {
            return '';
        }

        $parts = [];
        $scalarMap = [
            'order_code'      => 'order_code',
            'customer_name'   => 'customer_name',
            'customer_phone'  => 'customer_phone',
            'warranty_code'   => 'warranty_code',
            'device_name'     => 'device_name',
            'device_category' => 'device_category',
            'technician_name' => 'technician_name',
            'supplier_name'   => 'supplier_name',
            'part_name'       => 'part_name',
            'sku'             => 'sku',
            'branch_name'     => 'branch_name',
        ];

        foreach ($scalarMap as $key => $label) {
            $val = trim((string) ($entities[$key] ?? ''));
            if ($val !== '') {
                $parts[] = "{$label}={$val}";
            }
        }

        return implode(', ', $parts);
    }

    /**
     * Thu thập các định danh thực thể từ một bản ghi kết quả Tool.
     *
     * @param  array<string, mixed>  $record
     * @param  array<int, string>    $orderCodes
     * @param  array<int, string>    $customerNames
     * @param  array<int, string>    $customerPhones
     * @param  array<int, string>    $deviceNames
     * @param  array<int, string>    $deviceCategories
     * @param  array<int, string>    $technicianNames
     * @param  array<int, string>    $warrantyCodes
     * @param  array<int, string>    $partNames
     * @param  array<int, string>    $skus
     * @param  array<int, string>    $supplierNames
     * @param  array<int, string>    $receiptCodes
     * @param  array<int, string>    $shiftCodes
     * @param  array<int, string>    $shipmentCodes
     * @param  array<int, string>    $branchNames
     */
    protected function collectFromRecord(
        array $record,
        array &$orderCodes,
        array &$customerNames,
        array &$customerPhones,
        array &$deviceNames,
        array &$deviceCategories,
        array &$technicianNames,
        array &$warrantyCodes,
        array &$partNames,
        array &$skus,
        array &$supplierNames,
        array &$receiptCodes,
        array &$shiftCodes,
        array &$shipmentCodes,
        array &$branchNames
    ): void {
        $this->collectStringValue($orderCodes, $record['order_code'] ?? null);
        $this->collectStringValue($customerNames, $record['customer_name'] ?? $record['recipient_name'] ?? null, ['Khách lẻ', 'Khách nhận hàng']);
        $this->collectStringValue($customerPhones, $record['customer_phone'] ?? $record['recipient_phone'] ?? null);
        $this->collectStringValue($deviceNames, $record['device_name'] ?? $record['device_model_name'] ?? null, ['Tất cả dòng máy']);
        $this->collectStringValue($deviceCategories, $record['device_category'] ?? null);
        $this->collectStringValue($technicianNames, $record['technician_name'] ?? $record['inspector_name'] ?? null, ['Chưa phân công', 'Chưa rõ', 'Hệ thống']);
        $this->collectStringValue($warrantyCodes, $record['warranty_code'] ?? null);
        $this->collectStringValue($partNames, $record['part_name'] ?? null);
        $this->collectStringValue($skus, $record['sku'] ?? null);
        $this->collectStringValue($supplierNames, $record['supplier_name'] ?? null, ['Nhà cung cấp']);
        $this->collectStringValue($receiptCodes, $record['receipt_code'] ?? null);
        $this->collectStringValue($shiftCodes, $record['shift_code'] ?? null);
        $this->collectStringValue($shipmentCodes, $record['shipment_code'] ?? $record['tracking_code'] ?? null);
        $this->collectStringValue($branchNames, $record['branch_name'] ?? null);
    }

    /**
     * Thêm chuỗi hợp lệ (không rỗng, không nằm trong danh sách loại trừ) vào mảng đích.
     *
     * @param  array<int, string>  $target
     * @param  mixed               $value
     * @param  array<int, string>  $ignoreList
     */
    protected function collectStringValue(array &$target, mixed $value, array $ignoreList = []): void
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return;
        }

        $str = trim((string) $value);
        if ($str === '') {
            return;
        }

        foreach ($ignoreList as $ignored) {
            if (mb_strtolower($str, 'UTF-8') === mb_strtolower($ignored, 'UTF-8')) {
                return;
            }
        }

        if (! in_array($str, $target, true)) {
            $target[] = $str;
        }
    }

    /**
     * Kiểm tra chuỗi có chứa ít nhất một cụm từ trong danh sách hay không.
     *
     * @param  array<int, string>  $phrases
     */
    protected function containsAnyPhrase(string $haystack, array $phrases): bool
    {
        foreach ($phrases as $phrase) {
            if ($phrase !== '' && str_contains($haystack, $phrase)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Kiểm tra xem keyword mà LLM truyền vào có phải chỉ là cụm đại từ/câu hỏi nối tiếp chung chung hay không.
     */
    protected function isPronounOrFollowUpKeyword(string $keyword): bool
    {
        $normalized = mb_strtolower(trim($keyword), 'UTF-8');
        if ($normalized === '') {
            return true;
        }

        $pronounPhrases = [
            'đơn đó', 'đơn này', 'đơn vừa rồi', 'đơn trên', 'phiếu đó',
            'khách đó', 'khách này', 'người đó', 'anh đó', 'chị đó',
            'máy đó', 'thiết bị đó', 'nhà cung cấp đó', 'ncc đó', 'linh kiện đó',
            'bảo hành bao lâu', 'số điện thoại', 'sđt', 'ai làm', 'ai sửa', 'hết bao nhiêu', 'giá bao nhiêu',
        ];

        return $this->containsAnyPhrase($normalized, $pronounPhrases);
    }

    /**
     * Kiểm tra xem câu hỏi về "khách đó" có đang hỏi chi tiết của đơn hàng vừa tra cứu hay không.
     */
    protected function isAskingAboutSpecificOrderDetails(string $normalizedQuestion): bool
    {
        return $this->containsAnyPhrase($normalizedQuestion, [
            'sửa hết bao nhiêu',
            'hết bao nhiêu',
            'bảo hành',
            'máy gì',
            'lỗi gì',
            'ai làm',
            'ai sửa',
            'trạng thái',
        ]);
    }
}
