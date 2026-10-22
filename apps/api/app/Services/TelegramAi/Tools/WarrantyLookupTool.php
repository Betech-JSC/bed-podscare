<?php

namespace App\Services\TelegramAi\Tools;

use App\Models\TelegramRecipient;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use App\Services\TelegramAi\Contracts\TelegramAiToolInterface;
use App\Services\TelegramAi\TelegramAiAssistantService;

class WarrantyLookupTool implements TelegramAiToolInterface
{
    public function name(): string
    {
        return 'lookup_warranties';
    }

    public function description(): string
    {
        return 'Tra cứu thông tin phiếu bảo hành điện tử, thời hạn bảo hành còn lại và lịch sử yêu cầu bảo hành (claims) của khách hàng theo mã bảo hành (warranty_code), mã đơn sửa chữa gốc (order_code), số điện thoại khách hàng (customer_phone), từ khóa hạng mục/lỗi bảo hành (keyword), khoảng ngày (date_from, date_to), dòng thiết bị (device_category), tên kỹ thuật viên đơn gốc (technician_name), hoặc lọc các phiếu còn hạn bảo hành (only_active = true).';
    }

    public function parametersSchema(): array
    {
        return [
            'type'       => 'OBJECT',
            'properties' => [
                'warranty_code' => [
                    'type'        => 'STRING',
                    'description' => 'Mã phiếu bảo hành cần tra cứu (ví dụ: BH-PCQ117102602).',
                ],
                'order_code' => [
                    'type'        => 'STRING',
                    'description' => 'Mã đơn sửa chữa gốc cần kiểm tra bảo hành (ví dụ: PCQ117102602).',
                ],
                'customer_phone' => [
                    'type'        => 'STRING',
                    'description' => 'Số điện thoại khách hàng cần tra cứu bảo hành.',
                ],
                'keyword' => [
                    'type'        => 'STRING',
                    'description' => 'Từ khóa tìm kiếm trong hạng mục bảo hành (coverage_item), mô tả lỗi khiếu nại (claims.issue_description) hoặc tên thiết bị (deviceModel.name).',
                ],
                'date_from' => [
                    'type'        => 'STRING',
                    'description' => 'Ngày bắt đầu tra cứu theo ngày kích hoạt bảo hành hoặc ngày tạo (hỗ trợ DD/MM, DD/MM/YYYY, YYYY-MM-DD).',
                ],
                'date_to' => [
                    'type'        => 'STRING',
                    'description' => 'Ngày kết thúc tra cứu theo ngày kích hoạt bảo hành hoặc ngày tạo (hỗ trợ DD/MM, DD/MM/YYYY, YYYY-MM-DD).',
                ],
                'device_category' => [
                    'type'        => 'STRING',
                    'description' => 'Lọc theo dòng thiết bị (ví dụ: AirPods, Apple Watch, iPhone, iPad, MacBook).',
                ],
                'technician_name' => [
                    'type'        => 'STRING',
                    'description' => 'Lọc theo tên kỹ thuật viên phụ trách đơn sửa chữa gốc.',
                ],
                'only_active' => [
                    'type'        => 'BOOLEAN',
                    'description' => 'Đặt là true nếu chỉ muốn lọc các phiếu bảo hành đang còn hiệu lực (status = active và chưa hết hạn end_date).',
                ],
                'limit' => [
                    'type'        => 'INTEGER',
                    'description' => 'Số lượng phiếu bảo hành tối đa trả về (mặc định 5, tối đa 10).',
                ],
            ],
        ];
    }

    /**
     * Chuyển đổi trạng thái phiếu bảo hành sang nhãn tiếng Việt thân thiện.
     */
    public static function formatWarrantyStatusLabel(string $status, bool $isValidNow, int $daysRemaining): string
    {
        if (strtolower(trim($status)) === 'revoked') {
            return 'Đã thu hồi bảo hành';
        }

        if ($isValidNow) {
            return "Đang còn hạn bảo hành (còn {$daysRemaining} ngày)";
        }

        return 'Đã hết hạn bảo hành';
    }

    /**
     * Chuyển đổi trạng thái khiếu nại bảo hành sang nhãn tiếng Việt thân thiện (dạng "Đang đợi...").
     */
    public static function formatClaimStatusLabel(string $status): string
    {
        return match (strtolower(trim($status))) {
            'pending',
            'received',
            'open'       => 'Đang đợi xử lý bảo hành',
            'inspecting' => 'Đang kiểm tra bảo hành',
            'in_repair',
            'processing',
            'rework'     => 'Đang sửa bảo hành',
            'completed',
            'resolved',
            'closed'     => 'Đã hoàn tất bảo hành',
            'rejected'   => 'Từ chối bảo hành',
            default      => 'Đang xử lý bảo hành',
        };
    }

    /**
     * Escape các ký tự wildcard SQL (%, _, \) trước khi đưa vào điều kiện LIKE.
     */
    protected function escapeLike(string $value): string
    {
        return strtr($value, [
            '\\' => '\\\\',
            '%'  => '\\%',
            '_'  => '\\_',
        ]);
    }

    /**
     * Parse chuỗi ngày an toàn ủy quyền qua LookupOrderTool::parseDate() (có kiểm tra checkdate).
     */
    public function parseDate(string $value): ?\Illuminate\Support\Carbon
    {
        return (new LookupOrderTool())->parseDate($value);
    }

    protected function applySingleTokenCondition($query, string $token): void
    {
        $escaped = $this->escapeLike($token);
        $like = "%{$escaped}%";

        $query->where(function ($q) use ($like) {
            $q->where('coverage_item', 'like', $like)
                ->orWhereHas('claims', function ($cq) use ($like) {
                    $cq->where('issue_description', 'like', $like);
                })
                ->orWhereHas('deviceModel', function ($dq) use ($like) {
                    $dq->withoutGlobalScopes()->where(function ($sub) use ($like) {
                        $sub->where('name', 'like', $like)
                            ->orWhere('category', 'like', $like);
                    });
                });
        });
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

    public function execute(array $args, TelegramRecipient $recipient): array
    {
        // Bước 1: Tự kiểm tra & chuẩn hóa tham số đầu vào (Sanitize & Normalize)
        $warrantyCode = strtoupper(ltrim($this->scalarString($args['warranty_code'] ?? ''), '#'));
        $orderCode = strtoupper(ltrim($this->scalarString($args['order_code'] ?? ''), '#'));
        $customerPhone = preg_replace('/[\s.\-]+/', '', $this->scalarString($args['customer_phone'] ?? '')) ?? '';
        $keyword = $this->scalarString($args['keyword'] ?? '');
        $rawDateFrom = $this->scalarString($args['date_from'] ?? '');
        $rawDateTo = $this->scalarString($args['date_to'] ?? '');
        $deviceCategory = $this->scalarString($args['device_category'] ?? '');
        $technicianName = $this->scalarString($args['technician_name'] ?? '');
        $onlyActive = filter_var($args['only_active'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $limit = max(1, min(10, (int) $this->scalarString($args['limit'] ?? null, '5')));
        $branchDisplay = TelegramAiAssistantService::resolveBranchDisplay($recipient);

        $lookupHelper = new LookupOrderTool();
        $parsedFrom = $lookupHelper->parseDate($rawDateFrom);
        $parsedTo = $lookupHelper->parseDate($rawDateTo);

        // Bước 2: Thực thi Eloquent Query khóa cứng tenant_id & branch_id
        $query = Warranty::withoutGlobalScopes()
            ->with([
                'customer'    => fn ($q) => $q->withoutGlobalScopes(),
                'deviceModel' => fn ($q) => $q->withoutGlobalScopes(),
                'repairOrder' => fn ($q) => $q->withoutGlobalScopes()->with([
                    'branch'     => fn ($bq) => $bq->withoutGlobalScopes(),
                    'technician' => fn ($tq) => $tq->withoutGlobalScopes(),
                ]),
                'claims',
            ])
            ->whereHas('repairOrder', function ($rq) use ($recipient) {
                $rq->withoutGlobalScopes()->where('tenant_id', (int) $recipient->tenant_id);
                if ($recipient->branch_id !== null) {
                    $rq->where('branch_id', (int) $recipient->branch_id);
                }
            });

        if ($warrantyCode !== '') {
            $escapedWarrantyCode = $this->escapeLike($warrantyCode);
            $query->where('warranty_code', 'like', "%{$escapedWarrantyCode}%");
        }

        if ($orderCode !== '') {
            $escapedOrderCode = $this->escapeLike($orderCode);
            $query->whereHas('repairOrder', fn ($rq) => $rq->withoutGlobalScopes()->where('order_code', 'like', "%{$escapedOrderCode}%"));
        }

        if ($customerPhone !== '') {
            $escapedCustomerPhone = $this->escapeLike($customerPhone);
            $query->whereHas('customer', fn ($cq) => $cq->withoutGlobalScopes()->where('phone', 'like', "%{$escapedCustomerPhone}%"));
        }

        $startDateFilter = null;
        $endDateFilter = null;
        if ($parsedFrom !== null || $parsedTo !== null) {
            $start = ($parsedFrom ?? $parsedTo)->copy();
            $end = ($parsedTo ?? $parsedFrom)->copy();

            if ($end->lt($start)) {
                [$start, $end] = [$end, $start];
            }

            $startDateFilter = $start->startOfDay();
            $endDateFilter = $end->endOfDay();

            $query->where(function ($dq) use ($startDateFilter, $endDateFilter) {
                $dq->whereBetween('start_date', [$startDateFilter->toDateString(), $endDateFilter->toDateString()])
                    ->orWhere(function ($sub) use ($startDateFilter, $endDateFilter) {
                        $sub->whereNull('start_date')->whereBetween('created_at', [$startDateFilter, $endDateFilter]);
                    });
            });
        }

        if ($deviceCategory !== '') {
            $normalizedCat = mb_strtolower($deviceCategory, 'UTF-8');
            $escapedCategory = $this->escapeLike($deviceCategory);
            $query->whereHas('deviceModel', function ($dq) use ($escapedCategory, $normalizedCat) {
                $dq->withoutGlobalScopes()->where(function ($sub) use ($escapedCategory, $normalizedCat) {
                    $sub->where('category', 'like', "%{$escapedCategory}%")
                        ->orWhere('name', 'like', "%{$escapedCategory}%");

                    if (str_contains($normalizedCat, 'watch') || str_contains($normalizedCat, 'đồng hồ')) {
                        $sub->orWhere('category', 'like', '%apple_watch%')
                            ->orWhere('name', 'like', '%Watch%');
                    } elseif (str_contains($normalizedCat, 'airpod') || str_contains($normalizedCat, 'tai nghe')) {
                        $sub->orWhere('category', 'like', '%airpods%')
                            ->orWhere('name', 'like', '%AirPods%');
                    } elseif (str_contains($normalizedCat, 'iphone')) {
                        $sub->orWhere('category', 'like', '%iphone%')
                            ->orWhere('name', 'like', '%iPhone%');
                    } elseif (str_contains($normalizedCat, 'ipad')) {
                        $sub->orWhere('category', 'like', '%ipad%')
                            ->orWhere('name', 'like', '%iPad%');
                    } elseif (str_contains($normalizedCat, 'macbook')) {
                        $sub->orWhere('category', 'like', '%macbook%')
                            ->orWhere('name', 'like', '%MacBook%');
                    }
                });
            });
        }

        if ($technicianName !== '') {
            $escapedTechnicianName = $this->escapeLike($technicianName);
            $query->whereHas('repairOrder.technician', function ($tq) use ($escapedTechnicianName) {
                $tq->withoutGlobalScopes()->where('name', 'like', "%{$escapedTechnicianName}%");
            });
        }

        if ($keyword !== '') {
            $tokens = $lookupHelper->extractSearchTokens($keyword);
            if (! empty($tokens)) {
                $andClone = clone $query;
                foreach ($tokens as $token) {
                    $this->applySingleTokenCondition($andClone, $token);
                }

                if ($andClone->count() > 0) {
                    foreach ($tokens as $token) {
                        $this->applySingleTokenCondition($query, $token);
                    }
                } else {
                    $query->where(function ($orGroup) use ($tokens) {
                        foreach ($tokens as $token) {
                            $orGroup->orWhere(function ($tokenGroup) use ($token) {
                                $this->applySingleTokenCondition($tokenGroup, $token);
                            });
                        }
                    });
                }
            } else {
                $this->applySingleTokenCondition($query, $keyword);
            }
        }

        if ($onlyActive === true) {
            $query->where('status', 'active')
                ->whereNull('revoked_at')
                ->where('end_date', '>=', now()->toDateString());
        }

        $totalMatched = (clone $query)->count();
        $warranties = $query->orderByDesc('id')->limit($limit)->get();

        $items = $warranties->map(function (Warranty $warranty) use ($branchDisplay): array {
            $isValidNow = $warranty->status === 'active'
                && ! $warranty->revoked_at
                && $warranty->end_date !== null
                && $warranty->end_date->copy()->endOfDay()->isFuture();

            $daysRemaining = $isValidNow && $warranty->end_date !== null
                ? max(0, (int) now()->startOfDay()->diffInDays($warranty->end_date->copy()->startOfDay(), false))
                : 0;

            $claims = $warranty->claims->map(function (WarrantyClaim $claim): array {
                $rawClaimStatus = (string) ($claim->status ?? '');

                return [
                    'claim_code'        => (string) $claim->claim_code,
                    'issue_description' => (string) ($claim->issue_description ?? ''),
                    'resolution_mode'   => (string) ($claim->resolution_mode ?? ''),
                    'status'            => $rawClaimStatus,
                    'status_label'      => self::formatClaimStatusLabel($rawClaimStatus),
                    'created_at'        => optional($claim->created_at)->format('H:i - d/m/Y'),
                ];
            })->values()->all();

            $rawWarrantyStatus = (string) $warranty->status;

            return [
                'warranty_code'   => (string) $warranty->warranty_code,
                'status'          => $rawWarrantyStatus,
                'status_label'    => self::formatWarrantyStatusLabel($rawWarrantyStatus, $isValidNow, $daysRemaining),
                'is_valid_now'    => $isValidNow,
                'days_remaining'  => $daysRemaining,
                'order_code'      => (string) ($warranty->repairOrder?->order_code ?? ''),
                'branch_name'     => (string) ($warranty->repairOrder?->branch?->name ?? $branchDisplay),
                'customer_name'   => (string) ($warranty->customer?->name ?? 'Khách lẻ'),
                'customer_phone'  => (string) ($warranty->customer?->phone ?? ''),
                'device_name'     => (string) ($warranty->deviceModel?->name ?? 'Thiết bị AirPods'),
                'device_category' => LookupOrderTool::resolveDeviceCategoryLabel($warranty->deviceModel),
                'technician_name' => (string) ($warranty->repairOrder?->technician?->name ?? 'Chưa phân công'),
                'coverage_item'   => (string) ($warranty->coverage_item ?? ''),
                'duration_days'   => (int) ($warranty->duration_days ?? 0),
                'start_date'      => optional($warranty->start_date)->format('d/m/Y'),
                'end_date'        => optional($warranty->end_date)->format('d/m/Y'),
                'claims_count'    => $warranty->claims->count(),
                'claims'          => $claims,
            ];
        })->values()->all();

        if ($recipient->branch_id === null) {
            $itemBranches = array_values(array_unique(array_filter(array_column($items, 'branch_name'))));
            if (count($itemBranches) === 1) {
                $branchDisplay = (string) $itemBranches[0];
            } elseif (empty($items) && ($customerPhone !== '' || $orderCode !== '')) {
                $latestOrderQuery = \App\Models\RepairOrder::withoutGlobalScopes()
                    ->with(['branch' => fn ($bq) => $bq->withoutGlobalScopes()])
                    ->where('tenant_id', (int) $recipient->tenant_id);

                if ($orderCode !== '') {
                    $escapedOrderCode = $this->escapeLike($orderCode);
                    $latestOrderQuery->where('order_code', 'like', "%{$escapedOrderCode}%");
                }
                if ($customerPhone !== '') {
                    $escapedCustomerPhone = $this->escapeLike($customerPhone);
                    $latestOrderQuery->whereHas('customer', fn ($cq) => $cq->withoutGlobalScopes()->where('phone', 'like', "%{$escapedCustomerPhone}%"));
                }

                $latestOrder = $latestOrderQuery->orderByDesc('id')->first();
                if ($latestOrder?->branch?->name) {
                    $branchDisplay = (string) $latestOrder->branch->name;
                }
            }
        }

        return [
            'branch_name'     => $branchDisplay,
            'branch_scope'    => $branchDisplay,
            'filters_applied' => [
                'warranty_code'   => $warrantyCode !== '' ? $warrantyCode : null,
                'order_code'      => $orderCode !== '' ? $orderCode : null,
                'customer_phone'  => $customerPhone !== '' ? $customerPhone : null,
                'keyword'         => $keyword !== '' ? $keyword : null,
                'date_from'       => $startDateFilter?->format('Y-m-d'),
                'date_to'         => $endDateFilter?->format('Y-m-d'),
                'device_category' => $deviceCategory !== '' ? $deviceCategory : null,
                'technician_name' => $technicianName !== '' ? $technicianName : null,
                'only_active'     => $onlyActive,
                'limit'           => $limit,
            ],
            'total_matched'  => $totalMatched,
            'returned_count' => count($items),
            'warranties'     => $items,
        ];
    }

    /**
     * Kết xuất trực tiếp kết quả tra cứu bảo hành sang văn bản HTML tiếng Việt chuẩn gửi về Telegram.
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
        $warranties = is_array($result['warranties'] ?? null) ? $result['warranties'] : [];

        if ($totalMatched === 0 || empty($warranties)) {
            return "<b>Kết quả tra cứu bảo hành</b>\nKhông tìm thấy phiếu bảo hành nào khớp với điều kiện tra cứu tại chi nhánh <b>{$branchScope}</b>.";
        }

        $lines = [
            "<b>Kết quả tra cứu bảo hành</b>",
            "Chi nhánh: <b>{$branchScope}</b> (Tìm thấy <b>{$totalMatched}</b> phiếu bảo hành)",
        ];

        foreach ($warranties as $w) {
            if (! is_array($w)) {
                continue;
            }

            $warrantyCode = htmlspecialchars((string) ($w['warranty_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $orderCode = htmlspecialchars((string) ($w['order_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $wBranch = htmlspecialchars((string) ($w['branch_name'] ?? $branchScope), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $customerName = htmlspecialchars((string) ($w['customer_name'] ?? 'Khách lẻ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $customerPhone = htmlspecialchars((string) ($w['customer_phone'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $deviceName = htmlspecialchars((string) ($w['device_name'] ?? 'Thiết bị AirPods'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $technicianName = htmlspecialchars((string) (($w['technician_name'] ?? '') ?: 'Chưa phân công'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $coverageItem = htmlspecialchars((string) (($w['coverage_item'] ?? '') ?: 'Theo tiêu chuẩn cửa hàng'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $startDate = htmlspecialchars((string) ($w['start_date'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $endDate = htmlspecialchars((string) ($w['end_date'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $daysRemaining = (int) ($w['days_remaining'] ?? 0);
            $isValidNow = ! empty($w['is_valid_now']);
            $rawStatusLabel = trim((string) ($w['status_label'] ?? ''));
            if ($rawStatusLabel === '') {
                $rawStatusLabel = self::formatWarrantyStatusLabel((string) ($w['status'] ?? ''), $isValidNow, $daysRemaining);
            }
            $statusLabel = htmlspecialchars($rawStatusLabel, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $claimsCount = (int) ($w['claims_count'] ?? 0);
            $claims = is_array($w['claims'] ?? null) ? $w['claims'] : [];

            $customerInfo = $customerPhone !== ''
                ? "<b>{$customerName}</b> - <code>{$customerPhone}</code>"
                : "<b>{$customerName}</b>";

            $entry = "- Mã bảo hành: <code>{$warrantyCode}</code> | Đơn gốc: <code>{$orderCode}</code> | Chi nhánh: <b>{$wBranch}</b>\n"
                . "  Khách hàng: {$customerInfo} | Thiết bị: {$deviceName}\n"
                . "  Hạng mục: {$coverageItem} | Kỹ thuật viên đơn gốc: <b>{$technicianName}</b>\n"
                . "  Thời hạn: {$startDate} - {$endDate} | Trạng thái: <b>{$statusLabel}</b> | Số lần bảo hành: <b>{$claimsCount}</b>";

            foreach ($claims as $claim) {
                if (! is_array($claim)) {
                    continue;
                }
                $claimCode = htmlspecialchars((string) ($claim['claim_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $claimIssue = htmlspecialchars((string) ($claim['issue_description'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $rawClaimLabel = trim((string) ($claim['status_label'] ?? ''));
                if ($rawClaimLabel === '') {
                    $rawClaimLabel = self::formatClaimStatusLabel((string) ($claim['status'] ?? ''));
                }
                $claimStatusLabel = htmlspecialchars($rawClaimLabel, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

                $entry .= "\n  Khiếu nại: <code>{$claimCode}</code> - {$claimIssue} (<b>{$claimStatusLabel}</b>)";
            }

            $lines[] = $entry;
        }

        return implode("\n", $lines);
    }
}

