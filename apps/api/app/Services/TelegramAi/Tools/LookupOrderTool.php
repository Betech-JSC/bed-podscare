<?php

namespace App\Services\TelegramAi\Tools;

use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\TelegramRecipient;
use App\Services\TelegramAi\Contracts\TelegramAiToolInterface;
use App\Services\TelegramAi\TelegramAiAssistantService;
use Carbon\Carbon;

class LookupOrderTool implements TelegramAiToolInterface
{
    /**
     * Danh sách hư từ / từ để hỏi tiếng Việt cần loại bỏ khi bóc tách từ khóa tra cứu đơn hàng.
     *
     * @var array<int, string>
     */
    protected const VIETNAMESE_STOP_WORDS = [
        'ai', 'người', 'nào', 'khách', 'hàng', 'thợ', 'kỹ', 'thuật', 'viên', 'ktv',
        'làm', 'sửa', 'chữa', 'nhận', 'đơn', 'phiếu', 'máy', 'ngày', 'hôm', 'qua', 'nay',
        'tuần', 'tháng', 'năm', 'này', 'trước', 'của', 'cho', 'với', 'và', 'hoặc', 'là',
        'có', 'không', 'được', 'bị', 'lỗi', 'cần', 'đã', 'đang', 'sẽ', 'ở', 'tại', 'chi',
        'nhánh', 'cửa', 'shop', 'tiệm', 'gì', 'mấy', 'bao', 'nhiêu', 'kiểm', 'tra', 'xem',
        'giúp', 'anh', 'chị', 'em', 'nhé', 'ạ', 'vậy', 'thế', 'nơi', 'bên',
    ];

    public function name(): string
    {
        return 'lookup_repair_orders';
    }

    public function description(): string
    {
        return 'Tra cứu thông tin chi tiết một hoặc nhiều đơn sửa chữa đa chiều theo mã đơn (order_code), SĐT khách (customer_phone), tên khách (customer_name), từ khóa nội dung sửa chữa/linh kiện/hạng mục báo giá (keyword: ví dụ "vỏ thép đen", "thay pin"), khoảng ngày (date_from, date_to), dòng thiết bị (device_category: AirPods, Apple Watch...), tên kỹ thuật viên (technician_name), trạng thái đơn (status), hoặc phân loại đơn (order_type: in_store, cod, warranty).';
    }

    public function parametersSchema(): array
    {
        return [
            'type'       => 'OBJECT',
            'properties' => [
                'order_code' => [
                    'type'        => 'STRING',
                    'description' => 'Mã đơn sửa chữa cần tìm (ví dụ: PCQ117102602).',
                ],
                'customer_phone' => [
                    'type'        => 'STRING',
                    'description' => 'Số điện thoại khách hàng cần tra cứu đơn.',
                ],
                'customer_name' => [
                    'type'        => 'STRING',
                    'description' => 'Tên khách hàng cần tra cứu đơn.',
                ],
                'keyword' => [
                    'type'        => 'STRING',
                    'description' => 'Từ khóa tìm kiếm theo dịch vụ sửa chữa, hạng mục báo giá, linh kiện thay thế, mô tả lỗi hoặc ghi chú kỹ thuật (ví dụ: "vỏ thép đen", "thay pin", "mất nguồn", "cảm ứng").',
                ],
                'date_from' => [
                    'type'        => 'STRING',
                    'description' => 'Ngày bắt đầu tạo/tiếp nhận đơn (hỗ trợ YYYY-MM-DD, DD/MM/YYYY hoặc DD/MM như 18/10). Nếu người dùng hỏi 1 ngày cụ thể (ví dụ ngày 18/10), truyền cả date_from và date_to là ngày đó.',
                ],
                'date_to' => [
                    'type'        => 'STRING',
                    'description' => 'Ngày kết thúc tạo/tiếp nhận đơn (hỗ trợ YYYY-MM-DD, DD/MM/YYYY hoặc DD/MM như 18/10).',
                ],
                'device_category' => [
                    'type'        => 'STRING',
                    'description' => 'Phân loại dòng thiết bị cần lọc (ví dụ: "AirPods", "Apple Watch", "iPhone", "iPad").',
                ],
                'technician_name' => [
                    'type'        => 'STRING',
                    'description' => 'Tên kỹ thuật viên phụ trách sửa chữa đơn hàng (ví dụ: "Minh", "Tuấn").',
                ],
                'status' => [
                    'type'        => 'STRING',
                    'description' => 'Trạng thái đơn sửa chữa (inspecting, waiting_approval, quote_pending, rejected, waiting_tech, assigned, in_repair, waiting_parts, rework_needed, waiting_qc, qc_pending, ready_for_return, waiting_pickup, completed, cancelled). Hãy ánh xạ câu hỏi tiếng Việt tương ứng: "đang đợi kỹ thuật" -> waiting_tech, "đang sửa" -> in_repair, "đợi khách duyệt" -> waiting_approval, "đợi linh kiện" -> waiting_parts, "đợi QC" -> waiting_qc, "đợi khách nhận" -> waiting_pickup.',
                ],
                'order_type' => [
                    'type'        => 'STRING',
                    'description' => 'Phân loại đơn: in_store (Khách tại cửa hàng), cod (Đơn COD khách tỉnh), warranty (Tiếp nhận bảo hành).',
                ],
                'limit' => [
                    'type'        => 'INTEGER',
                    'description' => 'Số lượng đơn tối đa cần lấy (mặc định 5, tối đa 10).',
                ],
            ],
        ];
    }

    /**
     * Chuyển đổi mã trạng thái kỹ thuật của BE sang nhãn tiếng Việt thân thiện (dạng "Đang đợi...").
     */
    public static function formatStatusLabel(string $status): string
    {
        return match (strtolower(trim($status))) {
            'received'          => 'Mới tiếp nhận (Đang đợi kiểm tra)',
            'inspecting'        => 'Đang kiểm tra tình trạng máy',
            'waiting_approval',
            'quote_pending',
            'waiting_customer',
            'quoted'            => 'Đang đợi khách duyệt báo giá',
            'approved'          => 'Khách đã duyệt báo giá',
            'rejected'          => 'Khách từ chối sửa',
            'waiting_tech'      => 'Đang đợi kỹ thuật viên tiếp nhận',
            'assigned'          => 'Kỹ thuật viên đã nhận máy',
            'in_repair',
            'repairing',
            'in_progress'       => 'Đang trong quá trình sửa chữa',
            'waiting_parts'     => 'Đang đợi linh kiện thay thế',
            'rework_needed'     => 'Cần kiểm tra / sửa lại',
            'waiting_qc',
            'qc_pending',
            'qc_inspecting'     => 'Đang đợi kiểm định chất lượng (QC)',
            'qc_passed'         => 'Đã đạt kiểm định QC',
            'ready_for_return'  => 'Sẵn sàng trả máy cho khách',
            'waiting_pickup',
            'ready_for_pickup'  => 'Đang đợi khách đến nhận máy',
            'completed'         => 'Đã hoàn tất',
            'delivered',
            'handed_over'       => 'Đã bàn giao cho khách',
            'cancelled'         => 'Đã hủy đơn',
            default             => 'Đang xử lý',
        };
    }

    /**
     * Chuẩn hóa nhãn phân loại dòng thiết bị từ DeviceModel (AirPods, Apple Watch, iPhone, iPad, MacBook...).
     */
    public static function resolveDeviceCategoryLabel(?DeviceModel $deviceModel): string
    {
        if ($deviceModel === null) {
            return 'AirPods';
        }

        $rawCategory = trim((string) ($deviceModel->category ?? ''));
        $rawName = trim((string) ($deviceModel->name ?? ''));
        $combined = mb_strtolower($rawCategory . ' ' . $rawName, 'UTF-8');

        if (str_contains($combined, 'watch') || str_contains($combined, 'đồng hồ')) {
            return 'Apple Watch';
        }

        if (
            str_contains($combined, 'airpod')
            || str_contains($combined, 'tai nghe')
            || str_contains($combined, 'earpod')
            || str_contains($combined, 'beats')
        ) {
            return 'AirPods';
        }

        if (str_contains($combined, 'iphone')) {
            return 'iPhone';
        }

        if (str_contains($combined, 'ipad')) {
            return 'iPad';
        }

        if (str_contains($combined, 'macbook') || str_contains($combined, 'imac')) {
            return 'MacBook';
        }

        return $rawCategory !== '' ? $rawCategory : 'AirPods';
    }

    /**
     * Tách thông minh từ khóa tìm kiếm và gợi ý ngày tháng (date_from, date_to) từ chuỗi văn bản tự nhiên:
     * - Với ngày đầy đủ có năm (dd/mm/yyyy hoặc yyyy-mm-dd): cho phép trích xuất nếu parseDate() (kèm checkdate) hợp lệ.
     * - Với ngày rút gọn không năm (dd/mm hoặc dd-mm): chỉ trích xuất khi đứng sau tiền tố chỉ thời gian tiếng Việt
     *   (ngày, hôm, từ, đến, lúc, vào) HOẶC không đứng liền sau các từ khóa dòng máy/thế hệ
     *   (airpods, gen, series, pro, se, ipad, watch, pencil, macbook, cáp, vỏ, pin).
     *
     * @return array{keyword: string, date_from: string|null, date_to: string|null, parsed_from: ?Carbon, parsed_to: ?Carbon}
     */
    public function extractKeywordAndDateHints(string $rawKeyword): array
    {
        $cleaned = trim($rawKeyword);
        if ($cleaned === '') {
            return [
                'keyword'     => '',
                'date_from'   => null,
                'date_to'     => null,
                'parsed_from' => null,
                'parsed_to'   => null,
            ];
        }

        $extractedDates = [];
        $fullDatePattern = '/(?<![\/\-\d])\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b(?![\/\-\d])/u';

        $cleaned = preg_replace_callback($fullDatePattern, function (array $matches) use (&$extractedDates): string {
            $candidate = $matches[1];
            $parsed = $this->parseDate($candidate);
            if ($parsed !== null) {
                $extractedDates[] = $parsed;

                return ' ';
            }

            return $matches[0];
        }, $cleaned) ?? $cleaned;

        $shortDatePattern = '/(?<![\/\-\d])\b(\d{1,2}[\/\-]\d{1,2})\b(?![\/\-\d])/u';
        if (preg_match_all($shortDatePattern, $cleaned, $shortMatches, PREG_OFFSET_CAPTURE)) {
            for ($i = count($shortMatches[1]) - 1; $i >= 0; $i--) {
                $candidate = $shortMatches[1][$i][0];
                $offset = (int) $shortMatches[1][$i][1];

                $prefixText = mb_strtolower(trim(substr($cleaned, 0, $offset)), 'UTF-8');

                $hasTimePrefix = (bool) preg_match('/(?:^|\s)(ngày|hôm|từ|đến|lúc|vào)$/u', $prefixText);
                $hasModelPrefix = (bool) preg_match(
                    '/(?:^|\s)(airpods?|gen|series|pro|se|ipad|iphone|watch|pencil|macbook|cáp|vỏ|pin|tai\s+nghe|đồng\s+hồ)$/u',
                    $prefixText
                );

                if ($hasTimePrefix || ! $hasModelPrefix) {
                    $parsed = $this->parseDate($candidate);
                    if ($parsed !== null) {
                        array_unshift($extractedDates, $parsed);
                        $cleaned = substr($cleaned, 0, $offset) . ' ' . substr($cleaned, $offset + strlen($candidate));
                    }
                }
            }
        }

        if (! empty($extractedDates)) {
            $cleaned = preg_replace('/(?:^|\s)(?:vào\s+ngày|từ\s+ngày|đến\s+ngày|ngày|hôm|lúc|vào)(?=\s|$)/iu', ' ', $cleaned) ?? $cleaned;
        }

        $cleaned = trim(preg_replace('/\s+/u', ' ', $cleaned) ?? $cleaned);

        $parsedFrom = $extractedDates[0] ?? null;
        $parsedTo = ! empty($extractedDates) ? $extractedDates[count($extractedDates) - 1] : null;

        if ($parsedFrom !== null && $parsedTo !== null && $parsedTo->lt($parsedFrom)) {
            [$parsedFrom, $parsedTo] = [$parsedTo, $parsedFrom];
        }

        return [
            'keyword'     => $cleaned,
            'date_from'   => $parsedFrom?->format('Y-m-d'),
            'date_to'     => $parsedTo?->format('Y-m-d'),
            'parsed_from' => $parsedFrom?->copy(),
            'parsed_to'   => $parsedTo?->copy(),
        ];
    }

    /**
     * Tách từ khóa tiếng Việt thông minh:
     * Loại bỏ hư từ (ai, người, nào, khách, thợ, làm, sửa, đơn, ngày...) và ngày tháng hợp lệ (18/10),
     * đồng thời bảo toàn ký hiệu dòng máy có dấu '/' như "AirPods 1/2", "Gen 1/2", "Series 1/2/3".
     *
     * @return array<int, string>
     */
    public function extractSearchTokens(string $rawKeyword): array
    {
        $hints = $this->extractKeywordAndDateHints($rawKeyword);
        $normalized = mb_strtolower(trim($hints['keyword']), 'UTF-8');
        if ($normalized === '') {
            return [];
        }

        // Giữ lại dấu '/' khi nối trực tiếp giữa các chữ số (như 1/2, 1/2/3), còn lại thay bằng khoảng trắng
        $normalized = preg_replace('/(?<!\d)\/|\/(?!\d)/u', ' ', $normalized) ?? $normalized;
        // Thay thế ký tự đặc biệt bằng khoảng trắng (giữ lại %, _, \, / để tìm kiếm chính xác)
        $normalized = preg_replace('/[^\p{L}\p{N}\s%_\\\\\/]+/u', ' ', $normalized) ?? $normalized;

        $words = preg_split('/\s+/u', trim($normalized), -1, PREG_SPLIT_NO_EMPTY);
        if (! is_array($words) || empty($words)) {
            return [];
        }

        $tokens = [];
        foreach ($words as $word) {
            $word = trim($word);
            if ($word === '' || in_array($word, self::VIETNAMESE_STOP_WORDS, true)) {
                continue;
            }
            $tokens[] = $word;
        }

        return array_values(array_unique($tokens));
    }

    /**
     * Escape các ký tự wildcard SQL (%, _, \) để tránh wildcard injection trong truy vấn LIKE.
     */
    protected function escapeLike(string $value): string
    {
        return strtr($value, ['\\' => '\\\\', '%' => '\\%', '_' => '\\_']);
    }

    /**
     * Chuẩn hóa an toàn tham số đầu vào thành chuỗi đơn (chống lỗi Array to string conversion khi LLM trả về mảng).
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
     * Parse chuỗi ngày hỗ trợ DD/MM/YYYY, YYYY-MM-DD và DD/MM (tự động lấy năm hiện tại),
     * kết hợp kiểm tra checkdate() để loại bỏ ngày không hợp lệ (như 31/02/2026 hay 45/18).
     */
    public function parseDate(string $value): ?Carbon
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        try {
            if (preg_match('/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/', $value, $matches)) {
                $day = (int) $matches[1];
                $month = (int) $matches[2];
                $year = (int) $matches[3];

                if (! checkdate($month, $day, $year)) {
                    return null;
                }

                return Carbon::createFromDate($year, $month, $day);
            }

            if (preg_match('/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/', $value, $matches)) {
                $year = (int) $matches[1];
                $month = (int) $matches[2];
                $day = (int) $matches[3];

                if (! checkdate($month, $day, $year)) {
                    return null;
                }

                return Carbon::createFromDate($year, $month, $day);
            }

            if (preg_match('/^(\d{1,2})[\/\-](\d{1,2})$/', $value, $matches)) {
                $day = (int) $matches[1];
                $month = (int) $matches[2];
                $year = (int) now()->year;

                if (! checkdate($month, $day, $year)) {
                    return null;
                }

                return Carbon::createFromDate($year, $month, $day);
            }

            if (preg_match('/^\d+[\/\-]\d+/', $value)) {
                return null;
            }

            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Áp dụng điều kiện tìm kiếm một token đơn lẻ trên tất cả các trường nội dung/quan hệ của RepairOrder.
     */
    protected function applySingleTokenCondition($query, string $token): void
    {
        $escapedToken = $this->escapeLike($token);
        $like = "%{$escapedToken}%";

        $query->where(function ($q) use ($like) {
            $q->where('issue_description', 'like', $like)
                ->orWhere('appearance_notes', 'like', $like)
                ->orWhere('test_note', 'like', $like)
                ->orWhere('repair_note', 'like', $like)
                ->orWhere('price_note', 'like', $like)
                ->orWhere('parts_used_summary', 'like', $like)
                ->orWhere('parts_needed', 'like', $like)
                ->orWhere('special_parts_needed', 'like', $like)
                ->orWhere('additional_services', 'like', $like)
                ->orWhere('serial_number', 'like', $like)
                ->orWhere('order_code', 'like', $like)
                ->orWhereHas('deviceModel', function ($dq) use ($like) {
                    $dq->withoutGlobalScopes()->where(function ($sub) use ($like) {
                        $sub->where('name', 'like', $like)
                            ->orWhere('category', 'like', $like)
                            ->orWhere('model_code', 'like', $like);
                    });
                })
                ->orWhereHas('customer', function ($cq) use ($like) {
                    $cq->withoutGlobalScopes()->where(function ($sub) use ($like) {
                        $sub->where('name', 'like', $like)
                            ->orWhere('phone', 'like', $like);
                    });
                })
                ->orWhereHas('technician', function ($tq) use ($like) {
                    $tq->withoutGlobalScopes()->where('name', 'like', $like);
                })
                ->orWhereHas('quotes', function ($qq) use ($like) {
                    $qq->withoutGlobalScopes()->where(function ($sub) use ($like) {
                        $sub->where('note', 'like', $like)
                            ->orWhereHas('items', function ($iq) use ($like) {
                                $iq->where('description', 'like', $like);
                            });
                    });
                });
        });
    }

    public function execute(array $args, TelegramRecipient $recipient): array
    {
        // Bước 1: Tự kiểm tra & chuẩn hóa lại tham số đầu vào (Sanitize & Normalize)
        $orderCode = strtoupper(ltrim($this->scalarString($args['order_code'] ?? ''), '#'));
        $customerPhone = preg_replace('/[\s.\-]+/', '', $this->scalarString($args['customer_phone'] ?? '')) ?? '';
        $customerName = $this->scalarString($args['customer_name'] ?? '');
        $keyword = $this->scalarString($args['keyword'] ?? '');
        $rawDateFrom = $this->scalarString($args['date_from'] ?? '');
        $rawDateTo = $this->scalarString($args['date_to'] ?? '');
        $deviceCategory = $this->scalarString($args['device_category'] ?? '');
        $technicianName = $this->scalarString($args['technician_name'] ?? '');
        $status = strtolower($this->scalarString($args['status'] ?? ''));
        $orderType = strtolower($this->scalarString($args['order_type'] ?? ''));
        $limit = max(1, min(10, (int) $this->scalarString($args['limit'] ?? null, '5')));
        $branchDisplay = TelegramAiAssistantService::resolveBranchDisplay($recipient);

        $parsedFrom = $this->parseDate($rawDateFrom);
        $parsedTo = $this->parseDate($rawDateTo);

        // Nếu trong keyword có chứa ngày hợp lệ mà date_from/date_to chưa truyền, tự động trích xuất ngày qua extractKeywordAndDateHints
        if ($parsedFrom === null && $parsedTo === null && $keyword !== '') {
            $dateHints = $this->extractKeywordAndDateHints($keyword);
            if ($dateHints['parsed_from'] !== null) {
                $parsedFrom = $dateHints['parsed_from']->copy();
                $parsedTo = ($dateHints['parsed_to'] ?? $dateHints['parsed_from'])->copy();
                $keyword = $dateHints['keyword'];
            }
        }

        // Bước 2: Thực thi Eloquent Query khóa cứng tenant_id & branch_id
        $query = RepairOrder::withoutGlobalScopes()
            ->with([
                'customer'      => fn ($q) => $q->withoutGlobalScopes(),
                'deviceModel'   => fn ($q) => $q->withoutGlobalScopes(),
                'branch'        => fn ($q) => $q->withoutGlobalScopes(),
                'technician'    => fn ($q) => $q->withoutGlobalScopes(),
                'createdByUser' => fn ($q) => $q->withoutGlobalScopes(),
                'quotes'        => fn ($q) => $q->withoutGlobalScopes()->with(['items.service', 'items.part']),
            ])
            ->where('tenant_id', (int) $recipient->tenant_id);

        if ($recipient->branch_id !== null) {
            $query->where('branch_id', (int) $recipient->branch_id);
        }

        if ($orderCode !== '') {
            $escapedOrderCode = $this->escapeLike($orderCode);
            $query->where(function ($q) use ($orderCode, $escapedOrderCode) {
                $q->where('order_code', $orderCode)
                    ->orWhere('order_code', 'like', "%{$escapedOrderCode}%")
                    ->orWhere('intake_batch_code', $orderCode)
                    ->orWhere('intake_batch_code', 'like', "%{$escapedOrderCode}%");
            });
        }

        if ($customerPhone !== '') {
            $escapedPhone = $this->escapeLike($customerPhone);
            $query->whereHas('customer', function ($q) use ($escapedPhone) {
                $q->withoutGlobalScopes()->where('phone', 'like', "%{$escapedPhone}%");
            });
        }

        if ($customerName !== '') {
            $escapedCustomerName = $this->escapeLike($customerName);
            $query->whereHas('customer', function ($q) use ($escapedCustomerName) {
                $q->withoutGlobalScopes()->where('name', 'like', "%{$escapedCustomerName}%");
            });
        }

        $startDate = null;
        $endDate = null;
        if ($parsedFrom !== null || $parsedTo !== null) {
            $start = ($parsedFrom ?? $parsedTo)->copy();
            $end = ($parsedTo ?? $parsedFrom)->copy();

            if ($end->lt($start)) {
                [$start, $end] = [$end, $start];
            }

            $startDate = $start->startOfDay();
            $endDate = $end->endOfDay();

            $query->where(function ($dateQ) use ($startDate, $endDate) {
                $dateQ->whereBetween('created_at', [$startDate, $endDate])
                    ->orWhereBetween('repair_completed_at', [$startDate, $endDate])
                    ->orWhereBetween('handed_over_at', [$startDate, $endDate]);
            });
        }

        if ($deviceCategory !== '') {
            $normCat = mb_strtolower($deviceCategory, 'UTF-8');
            $escapedCategory = $this->escapeLike($deviceCategory);
            $query->whereHas('deviceModel', function ($dq) use ($escapedCategory, $normCat) {
                $dq->withoutGlobalScopes()->where(function ($sub) use ($escapedCategory, $normCat) {
                    if (str_contains($normCat, 'watch') || str_contains($normCat, 'đồng hồ')) {
                        $sub->where('category', 'like', '%Watch%')
                            ->orWhere('name', 'like', '%Watch%');
                    } elseif (str_contains($normCat, 'airpod') || str_contains($normCat, 'tai nghe')) {
                        $sub->where('category', 'like', '%AirPod%')
                            ->orWhere('name', 'like', '%AirPod%');
                    } else {
                        $sub->where('category', 'like', "%{$escapedCategory}%")
                            ->orWhere('name', 'like', "%{$escapedCategory}%");
                    }
                });
            });
        }

        if ($technicianName !== '') {
            $escapedTechName = $this->escapeLike($technicianName);
            $query->whereHas('technician', function ($tq) use ($escapedTechName) {
                $tq->withoutGlobalScopes()->where('name', 'like', "%{$escapedTechName}%");
            });
        }

        if ($keyword !== '') {
            $tokens = $this->extractSearchTokens($keyword);
            $actionVerbs = ['thay', 'độ', 'ép', 'đóng', 'hàn', 'vệ', 'sinh'];
            $nonVerbTokens = array_values(array_filter(
                $tokens,
                static fn (string $t) => ! in_array($t, $actionVerbs, true)
            ));

            // Nếu sau khi tách các động từ (như 'thay') vẫn còn từ khóa danh từ cốt lõi (ví dụ 'vỏ', 'thép', 'đen'),
            // ưu tiên khớp AND trên các danh từ cốt lõi để bắt trúng cả 'Thay vỏ thép đen' lẫn 'Vỏ thép đen 45mm'.
            $effectiveTokens = ! empty($nonVerbTokens) ? $nonVerbTokens : $tokens;

            if (! empty($effectiveTokens)) {
                $query->where(function ($andGroup) use ($effectiveTokens) {
                    foreach ($effectiveTokens as $token) {
                        $this->applySingleTokenCondition($andGroup, $token);
                    }
                });
            } else {
                $this->applySingleTokenCondition($query, $keyword);
            }
        }

        if ($status !== '') {
            if (in_array($status, ['waiting_tech', 'received'], true)) {
                $query->whereIn('status', ['waiting_tech', 'received']);
            } elseif (in_array($status, ['waiting_approval', 'quote_pending', 'waiting_customer', 'quoted'], true)) {
                $query->whereIn('status', ['waiting_approval', 'quote_pending', 'waiting_customer', 'quoted']);
            } elseif (in_array($status, ['in_repair', 'repairing', 'in_progress'], true)) {
                $query->whereIn('status', ['in_repair', 'repairing', 'in_progress']);
            } elseif (in_array($status, ['waiting_qc', 'qc_pending', 'qc_inspecting'], true)) {
                $query->whereIn('status', ['waiting_qc', 'qc_pending', 'qc_inspecting']);
            } elseif (in_array($status, ['waiting_pickup', 'ready_for_pickup', 'ready_for_return'], true)) {
                $query->whereIn('status', ['waiting_pickup', 'ready_for_pickup', 'ready_for_return']);
            } elseif (in_array($status, ['completed', 'delivered', 'handed_over'], true)) {
                $query->whereIn('status', ['completed', 'delivered', 'handed_over']);
            } else {
                $query->where('status', $status);
            }
        }

        if ($orderType !== '' && in_array($orderType, ['in_store', 'cod', 'warranty'], true)) {
            $query->where('order_type', $orderType);
        }

        $totalMatched = (clone $query)->count();
        $orders = $query->orderByDesc('id')->limit($limit)->get();

        $items = $orders->map(function (RepairOrder $order) use ($branchDisplay): array {
            $type = strtolower((string) ($order->order_type ?: 'in_store'));
            $orderTypeLabel = match ($type) {
                'cod'      => 'Đơn COD (Khách tỉnh)',
                'warranty' => 'Tiếp nhận bảo hành',
                default    => 'Khách tại cửa hàng',
            };

            $rawStatus = (string) $order->status;
            $totalPrice = (float) ($order->total_price ?? 0);

            $quoteLines = [];
            if ($order->relationLoaded('quotes')) {
                foreach ($order->quotes as $quote) {
                    if ($quote->relationLoaded('items')) {
                        foreach ($quote->items as $qi) {
                            $desc = trim((string) ($qi->description ?: ($qi->service?->name ?? $qi->part?->name ?? '')));
                            if ($desc === '') {
                                continue;
                            }
                            $amt = (float) ($qi->amount ?? $qi->unit_price ?? 0);
                            $quoteLines[] = $amt > 0
                                ? $desc . ' (' . number_format($amt, 0, ',', '.') . ' đ)'
                                : $desc;
                        }
                    }
                    $quoteNote = trim((string) ($quote->note ?? ''));
                    if ($quoteNote !== '' && empty($quoteLines)) {
                        $quoteLines[] = $quoteNote;
                    }
                }
            }

            if (is_array($order->additional_services)) {
                foreach ($order->additional_services as $srv) {
                    if (! is_array($srv) || empty($srv['name'])) {
                        continue;
                    }
                    $srvName = trim((string) $srv['name']);
                    $srvPrice = (float) ($srv['price'] ?? 0);
                    $quoteLines[] = $srvPrice > 0
                        ? $srvName . ' (' . number_format($srvPrice, 0, ',', '.') . ' đ)'
                        : $srvName;
                }
            }

            $quoteItemsSummary = implode('; ', array_values(array_unique($quoteLines)));

            $partsSummary = implode('; ', array_values(array_unique(array_filter(array_map('trim', [
                (string) ($order->parts_used_summary ?? ''),
                (string) ($order->parts_needed ?? ''),
                (string) ($order->special_parts_needed ?? ''),
            ])))));

            return [
                'order_code'          => (string) $order->order_code,
                'intake_batch_code'   => $order->intake_batch_code,
                'status'              => $rawStatus,
                'status_label'        => self::formatStatusLabel($rawStatus),
                'order_type'          => $type,
                'order_type_label'    => $orderTypeLabel,
                'branch_name'         => (string) ($order->branch?->name ?? $branchDisplay),
                'customer_name'       => (string) ($order->customer?->name ?? 'Khách lẻ'),
                'customer_phone'      => (string) ($order->customer?->phone ?? ''),
                'device_name'         => (string) ($order->deviceModel?->name ?? 'Thiết bị AirPods'),
                'device_category'     => self::resolveDeviceCategoryLabel($order->deviceModel),
                'issue_description'   => (string) ($order->issue_description ?? ''),
                'repair_note'         => (string) ($order->repair_note ?? ''),
                'quote_items_summary' => $quoteItemsSummary,
                'parts_summary'       => $partsSummary,
                'total_price'         => $totalPrice,
                'formatted_price'     => number_format($totalPrice, 0, ',', '.') . ' đ',
                'technician_name'     => (string) ($order->technician?->name ?? 'Chưa phân công'),
                'received_by_name'    => (string) ($order->createdByUser?->name ?? 'Hệ thống'),
                'shipping_address'    => (string) ($order->shipping_address ?? ''),
                'created_at'          => optional($order->created_at)->format('H:i - d/m/Y'),
            ];
        })->values()->all();

        if ($recipient->branch_id === null) {
            $itemBranches = array_values(array_unique(array_filter(array_column($items, 'branch_name'))));
            if (count($itemBranches) === 1) {
                $branchDisplay = (string) $itemBranches[0];
            }
        }

        return [
            'branch_name'     => $branchDisplay,
            'branch_scope'    => $branchDisplay,
            'filters_applied' => [
                'order_code'      => $orderCode !== '' ? $orderCode : null,
                'customer_phone'  => $customerPhone !== '' ? $customerPhone : null,
                'customer_name'   => $customerName !== '' ? $customerName : null,
                'keyword'         => $keyword !== '' ? $keyword : null,
                'date_from'       => $startDate?->format('Y-m-d'),
                'date_to'         => $endDate?->format('Y-m-d'),
                'device_category' => $deviceCategory !== '' ? $deviceCategory : null,
                'technician_name' => $technicianName !== '' ? $technicianName : null,
                'status'          => $status !== '' ? $status : null,
                'order_type'      => in_array($orderType, ['in_store', 'cod', 'warranty'], true) ? $orderType : null,
                'limit'           => $limit,
            ],
            'total_matched'  => $totalMatched,
            'returned_count' => count($items),
            'orders'         => $items,
        ];
    }

    /**
     * Kết xuất trực tiếp kết quả tra cứu đơn sửa chữa sang văn bản HTML tiếng Việt chuẩn gửi về Telegram.
     * Tuyệt đối chỉ hiển thị nhãn trạng thái tiếng Việt (status_label), không hiển thị mã kỹ thuật BE.
     */
    public function formatHtml(array $result): string
    {
        $branchScope = htmlspecialchars(
            (string) ($result['branch_scope'] ?? $result['branch_name'] ?? 'Chi nhánh chính'),
            ENT_QUOTES | ENT_SUBSTITUTE,
            'UTF-8'
        );
        $totalMatched = (int) ($result['total_matched'] ?? 0);
        $orders = is_array($result['orders'] ?? null) ? $result['orders'] : [];

        if ($totalMatched === 0 || empty($orders)) {
            return "<b>Kết quả tra cứu đơn sửa chữa</b>\nKhông tìm thấy đơn sửa chữa nào khớp với điều kiện tra cứu tại chi nhánh <b>{$branchScope}</b>.";
        }

        $lines = [
            "<b>Kết quả tra cứu đơn sửa chữa</b>",
            "Chi nhánh: <b>{$branchScope}</b> (Tìm thấy <b>{$totalMatched}</b> đơn)",
        ];

        foreach ($orders as $order) {
            if (! is_array($order)) {
                continue;
            }

            $orderCode = htmlspecialchars((string) ($order['order_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $orderBranch = htmlspecialchars((string) ($order['branch_name'] ?? $branchScope), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $orderTypeLabel = htmlspecialchars((string) ($order['order_type_label'] ?? 'Khách tại cửa hàng'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $customerName = htmlspecialchars((string) ($order['customer_name'] ?? 'Khách lẻ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $customerPhone = htmlspecialchars((string) ($order['customer_phone'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $deviceName = htmlspecialchars((string) ($order['device_name'] ?? 'Thiết bị AirPods'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $issueDescription = htmlspecialchars((string) (($order['issue_description'] ?? '') ?: 'Đang kiểm tra'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $quoteItemsSummary = htmlspecialchars(trim((string) ($order['quote_items_summary'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $partsSummary = htmlspecialchars(trim((string) ($order['parts_summary'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $repairNote = htmlspecialchars(trim((string) ($order['repair_note'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $rawStatusLabel = trim((string) ($order['status_label'] ?? ''));
            if ($rawStatusLabel === '') {
                $rawStatusLabel = self::formatStatusLabel((string) ($order['status'] ?? ''));
            }
            $statusLabel = htmlspecialchars($rawStatusLabel, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $technicianName = htmlspecialchars((string) (($order['technician_name'] ?? '') ?: 'Chưa phân công'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $receivedByName = htmlspecialchars((string) (($order['received_by_name'] ?? '') ?: 'Hệ thống'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $formattedPrice = htmlspecialchars((string) ($order['formatted_price'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $createdAt = htmlspecialchars((string) ($order['created_at'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

            $customerInfo = $customerPhone !== ''
                ? "<b>{$customerName}</b> - <code>{$customerPhone}</code>"
                : "<b>{$customerName}</b>";

            $entryLines = [
                "- Mã đơn: <code>{$orderCode}</code> | Chi nhánh: <b>{$orderBranch}</b> | Phân loại: {$orderTypeLabel}",
                "  Khách hàng: {$customerInfo} | Thiết bị: {$deviceName}",
                "  Tình trạng lỗi: {$issueDescription}",
            ];

            if ($quoteItemsSummary !== '') {
                $entryLines[] = "  Hạng mục sửa chữa/báo giá: <b>{$quoteItemsSummary}</b>";
            }

            if ($partsSummary !== '') {
                $entryLines[] = "  Linh kiện: {$partsSummary}";
            }

            if ($repairNote !== '') {
                $entryLines[] = "  Ghi chú sửa chữa: {$repairNote}";
            }

            $entryLines[] = "  Trạng thái: <b>{$statusLabel}</b> | Kỹ thuật viên: <b>{$technicianName}</b> | Người tiếp nhận: {$receivedByName}";
            $entryLines[] = "  Chi phí: <b>{$formattedPrice}</b> | Thời gian: {$createdAt}";

            $lines[] = implode("\n", $entryLines);
        }

        return implode("\n", $lines);
    }
}
