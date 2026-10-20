<?php

namespace App\Services\TelegramAi\Tools;

use App\Models\Branch;
use App\Models\CommonIssue;
use App\Models\Customer;
use App\Models\GoodsReceipt;
use App\Models\QcInspection;
use App\Models\RepairService;
use App\Models\Shipment;
use App\Models\Supplier;
use App\Models\SupplierDebtTransaction;
use App\Models\TelegramRecipient;
use App\Models\WorkShift;
use App\Services\TelegramAi\Contracts\TelegramAiToolInterface;
use App\Services\TelegramAi\TelegramAiAssistantService;
use Carbon\Carbon;

class FallbackSchemaQueryTool implements TelegramAiToolInterface
{
    /**
     * Danh sách 9 bảng thuộc 5 nhóm nghiệp vụ được phép truy vấn chỉ đọc (Allow-list).
     *
     * @var array<int, string>
     */
    public const ALLOWED_ENTITIES = [
        'repair_services',
        'common_issues',
        'suppliers',
        'goods_receipts',
        'supplier_debt_transactions',
        'work_shifts',
        'customers',
        'qc_inspections',
        'shipments',
    ];

    /**
     * Các thực thể tài chính/nhà cung cấp nhạy cảm chỉ dành riêng cho Quản trị viên (admin).
     *
     * @var array<int, string>
     */
    public const ADMIN_ONLY_ENTITIES = [
        'suppliers',
        'goods_receipts',
        'supplier_debt_transactions',
    ];

    /**
     * Danh sách các giá trị sort_by hợp lệ.
     *
     * @var array<int, string>
     */
    public const ALLOWED_SORT_BY = [
        'latest',
        'debt_desc',
        'orders_desc',
        'price_asc',
        'price_desc',
        'cash_diff_desc',
        'spent_desc',
        'name_asc',
    ];

    public function name(): string
    {
        return 'fallback_schema_query';
    }

    public function description(): string
    {
        return 'Tool dự phòng vạn năng CHỈ GỌI KHI câu hỏi nằm ngoài phạm vi của 4 Tool cốt lõi (lookup_repair_orders, get_revenue_summary, check_inventory_parts, lookup_warranties). Dùng để tra cứu dữ liệu chỉ đọc (Read-only) cho 5 nhóm nghiệp vụ còn lại: (1) Bảng giá dịch vụ niêm yết (repair_services) & Lỗi thường gặp (common_issues); (2) Nhà cung cấp (suppliers), Phiếu nhập kho (goods_receipts) & Giao dịch công nợ NCC (supplier_debt_transactions - chỉ Admin); (3) Ca làm việc & đối soát tiền mặt đầu/cuối ca (work_shifts); (4) Danh sách & xếp hạng khách hàng thân thiết sửa nhiều lần nhất (customers); (5) Biên bản kiểm định chất lượng QC (qc_inspections) & Vận đơn giao hàng COD (shipments).';
    }

    /**
     * Alias tương thích nếu nơi gọi dùng parameters().
     */
    public function parameters(): array
    {
        return $this->parametersSchema();
    }

    public function parametersSchema(): array
    {
        return [
            'type'       => 'OBJECT',
            'required'   => ['entity'],
            'properties' => [
                'entity' => [
                    'type'        => 'STRING',
                    'enum'        => self::ALLOWED_ENTITIES,
                    'description' => 'Tên bảng nghiệp vụ cần tra cứu (bắt buộc thuộc allow-list): repair_services (bảng giá dịch vụ niêm yết), common_issues (lỗi thường gặp), suppliers (nhà cung cấp & dư nợ), goods_receipts (phiếu nhập kho), supplier_debt_transactions (lịch sử công nợ NCC), work_shifts (ca làm việc & đối soát két tiền), customers (khách hàng & xếp hạng khách sửa nhiều lần), qc_inspections (kiểm định QC), shipments (vận đơn giao nhận/COD).',
                ],
                'keyword' => [
                    'type'        => 'STRING',
                    'description' => 'Từ khóa tìm kiếm theo tên, mã, số điện thoại, dòng máy, ghi chú hoặc mã vận đơn.',
                ],
                'status' => [
                    'type'        => 'STRING',
                    'description' => 'Trạng thái cần lọc (ví dụ: open/closed cho work_shifts; pass/fail cho qc_inspections; pending/shipping/delivered cho shipments; completed/draft/cancelled cho goods_receipts).',
                ],
                'date_from' => [
                    'type'        => 'STRING',
                    'description' => 'Ngày bắt đầu lọc dữ liệu (hỗ trợ YYYY-MM-DD, DD/MM/YYYY hoặc DD/MM).',
                ],
                'date_to' => [
                    'type'        => 'STRING',
                    'description' => 'Ngày kết thúc lọc dữ liệu (hỗ trợ YYYY-MM-DD, DD/MM/YYYY hoặc DD/MM).',
                ],
                'sort_by' => [
                    'type'        => 'STRING',
                    'enum'        => [
                        'latest',
                        'debt_desc',
                        'orders_desc',
                        'price_asc',
                        'price_desc',
                        'cash_diff_desc',
                    ],
                    'description' => 'Tiêu chí sắp xếp: latest (mới nhất), debt_desc (công nợ cao nhất), orders_desc (khách sửa nhiều đơn nhất / chi tiêu cao nhất), price_asc (giá thấp đến cao), price_desc (giá cao đến thấp), cash_diff_desc (lệch tiền mặt ca làm việc lớn nhất).',
                ],
                'limit' => [
                    'type'        => 'INTEGER',
                    'description' => 'Số lượng bản ghi tối đa trả về (mặc định 5, tối đa 20).',
                ],
            ],
        ];
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
     * Parse chuỗi ngày hỗ trợ DD/MM/YYYY, YYYY-MM-DD và DD/MM (tự động lấy năm hiện tại).
     * Bắt buộc kiểm tra checkdate() để tránh Carbon tự động tràn ngày/tháng.
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

            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }

    protected function formatVnd(float $amount): string
    {
        return number_format($amount, 0, ',', '.') . ' đ';
    }

    public function execute(array $args, TelegramRecipient $recipient): array
    {
        $entity = strtolower($this->scalarString($args['entity'] ?? ''));

        // 1. Kiểm tra Allow-list 9 bảng thuộc 5 nhóm nghiệp vụ
        if ($entity === '' || ! in_array($entity, self::ALLOWED_ENTITIES, true)) {
            return [
                'error'            => "Thực thể '{$entity}' không nằm trong danh sách cho phép tra cứu. Chỉ hỗ trợ: " . implode(', ', self::ALLOWED_ENTITIES) . '.',
                'invalid_entity'   => true,
                'allowed_entities' => self::ALLOWED_ENTITIES,
            ];
        }

        // 2. Kiểm tra phân quyền target_role đối với nhóm tài chính nhà cung cấp
        $role = strtolower(trim((string) ($recipient->target_role ?? '')));
        if (in_array($entity, self::ADMIN_ONLY_ENTITIES, true) && ! in_array($role, ['admin', 'super_admin'], true)) {
            return [
                'error'             => 'Bạn không có quyền truy cập dữ liệu nhà cung cấp, phiếu nhập kho và công nợ.',
                'permission_denied' => true,
            ];
        }

        $keyword = $this->scalarString($args['keyword'] ?? '');
        $status = strtolower($this->scalarString($args['status'] ?? ''));
        $rawDateFrom = $this->scalarString($args['date_from'] ?? '');
        $rawDateTo = $this->scalarString($args['date_to'] ?? '');
        $rawSortBy = strtolower($this->scalarString($args['sort_by'] ?? 'latest', 'latest'));
        $sortBy = in_array($rawSortBy, self::ALLOWED_SORT_BY, true) ? $rawSortBy : 'latest';
        $limit = max(1, min(20, (int) $this->scalarString($args['limit'] ?? null, '5')));

        $parsedFrom = $this->parseDate($rawDateFrom);
        $parsedTo = $this->parseDate($rawDateTo);
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
        }

        $branchDisplay = TelegramAiAssistantService::resolveBranchDisplay($recipient);

        [$totalMatched, $items] = match ($entity) {
            'repair_services'            => $this->queryRepairServices($recipient, $keyword, $status, $startDate, $endDate, $sortBy, $limit),
            'common_issues'              => $this->queryCommonIssues($recipient, $keyword, $status, $startDate, $endDate, $sortBy, $limit),
            'suppliers'                  => $this->querySuppliers($recipient, $keyword, $status, $startDate, $endDate, $sortBy, $limit),
            'goods_receipts'             => $this->queryGoodsReceipts($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, $sortBy, $limit),
            'supplier_debt_transactions' => $this->querySupplierDebtTransactions($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, $sortBy, $limit),
            'work_shifts'                => $this->queryWorkShifts($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, $sortBy, $limit),
            'customers'                  => $this->queryCustomers($recipient, $keyword, $status, $startDate, $endDate, $sortBy, $limit),
            'qc_inspections'             => $this->queryQcInspections($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, $sortBy, $limit),
            'shipments'                  => $this->queryShipments($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, $sortBy, $limit),
        };

        $response = [
            'entity'          => $entity,
            'entity_label'    => self::resolveEntityLabel($entity),
            'branch_name'     => $branchDisplay,
            'branch_scope'    => $branchDisplay,
            'filters_applied' => [
                'entity'    => $entity,
                'keyword'   => $keyword !== '' ? $keyword : null,
                'status'    => $status !== '' ? $status : null,
                'date_from' => $startDate?->format('Y-m-d'),
                'date_to'   => $endDate?->format('Y-m-d'),
                'sort_by'   => $sortBy,
                'limit'     => $limit,
            ],
            'total_matched'  => $totalMatched,
            'returned_count' => count($items),
            'items'          => $items,
            $entity          => $items,
        ];

        if ($entity === 'work_shifts') {
            $canViewCash = in_array($role, ['admin', 'super_admin', 'receptionist'], true);
            $response['cash_fields_redacted'] = ! $canViewCash;
            $response['cash_fields_hidden'] = ! $canViewCash;
        }

        return $response;
    }

    /**
     * Nhãn tiếng Việt cho từng bảng nghiệp vụ.
     */
    public static function resolveEntityLabel(string $entity): string
    {
        return match ($entity) {
            'repair_services'            => 'Bảng giá dịch vụ sửa chữa niêm yết',
            'common_issues'              => 'Danh mục lỗi thường gặp & hướng xử lý',
            'suppliers'                  => 'Danh sách nhà cung cấp & công nợ',
            'goods_receipts'             => 'Lịch sử phiếu nhập kho linh kiện',
            'supplier_debt_transactions' => 'Biến động giao dịch công nợ nhà cung cấp',
            'work_shifts'                => 'Danh sách ca làm việc & đối soát tiền mặt',
            'customers'                  => 'Danh sách & xếp hạng khách hàng',
            'qc_inspections'             => 'Biên bản kiểm định chất lượng (QC)',
            'shipments'                  => 'Danh sách vận đơn giao hàng / COD',
            default                      => 'Dữ liệu hệ thống',
        };
    }

    /**
     * 1A. Tra cứu bảng giá dịch vụ niêm yết (repair_services).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function queryRepairServices(
        TelegramRecipient $recipient,
        string $keyword,
        string $status,
        ?Carbon $startDate,
        ?Carbon $endDate,
        string $sortBy,
        int $limit
    ): array {
        $tenantId = (int) $recipient->tenant_id;

        $query = RepairService::withoutGlobalScopes()
            ->with(['deviceModel' => fn ($q) => $q->withoutGlobalScopes()])
            ->where(function ($q) use ($tenantId) {
                $q->whereNull('device_model_id')
                    ->orWhereHas('deviceModel', function ($dq) use ($tenantId) {
                        $dq->withoutGlobalScopes()->where(function ($sub) use ($tenantId) {
                            $sub->whereNull('tenant_id')
                                ->orWhere('tenant_id', $tenantId);
                        });
                    });
            });

        if ($status === 'inactive') {
            $query->where('is_active', false);
        } elseif ($status !== 'all') {
            $query->where('is_active', true);
        }

        if ($startDate !== null && $endDate !== null) {
            $query->whereBetween('created_at', [$startDate, $endDate]);
        }

        if ($keyword !== '') {
            $escaped = $this->escapeLike($keyword);
            $like = "%{$escaped}%";
            $query->where(function ($q) use ($like) {
                $q->where('name', 'like', $like)
                    ->orWhere('code', 'like', $like)
                    ->orWhere('category', 'like', $like)
                    ->orWhere('description', 'like', $like)
                    ->orWhereHas('deviceModel', function ($dq) use ($like) {
                        $dq->withoutGlobalScopes()->where(function ($sub) use ($like) {
                            $sub->where('name', 'like', $like)
                                ->orWhere('category', 'like', $like)
                                ->orWhere('model_code', 'like', $like);
                        });
                    });
            });
        }

        $totalMatched = (clone $query)->count();

        if ($sortBy === 'price_asc') {
            $query->orderBy('base_price', 'asc')->orderBy('id', 'asc');
        } elseif ($sortBy === 'price_desc') {
            $query->orderBy('base_price', 'desc')->orderByDesc('id');
        } elseif ($sortBy === 'name_asc') {
            $query->orderBy('name', 'asc');
        } else {
            $query->orderByDesc('id');
        }

        $records = $query->limit($limit)->get();

        $items = $records->map(function (RepairService $service): array {
            $basePrice = (float) ($service->base_price ?? 0);
            $warrantyDays = (int) ($service->default_warranty_days ?? 0);
            $deviceName = (string) ($service->deviceModel?->name ?? 'Tất cả dòng máy');

            return [
                'id'                    => (int) $service->id,
                'code'                  => (string) ($service->code ?? ''),
                'name'                  => (string) $service->name,
                'category'              => (string) ($service->category ?? ''),
                'device_model_name'     => $deviceName,
                'device_name'           => $deviceName,
                'base_price'            => $basePrice,
                'price'                 => $basePrice,
                'formatted_price'       => $this->formatVnd($basePrice),
                'warranty_days'         => $warrantyDays,
                'default_warranty_days' => $warrantyDays,
                'estimated_minutes'     => $service->getAttribute('estimated_minutes'),
                'description'           => (string) ($service->description ?? ''),
                'is_active'             => (bool) $service->is_active,
            ];
        })->values()->all();

        return [$totalMatched, $items];
    }

    /**
     * 1B. Tra cứu danh mục lỗi thường gặp (common_issues).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function queryCommonIssues(
        TelegramRecipient $recipient,
        string $keyword,
        string $status,
        ?Carbon $startDate,
        ?Carbon $endDate,
        string $sortBy,
        int $limit
    ): array {
        $tenantId = (int) $recipient->tenant_id;

        $query = CommonIssue::withoutGlobalScopes()
            ->with([
                'deviceModel'      => fn ($q) => $q->withoutGlobalScopes(),
                'suggestedService' => fn ($q) => $q->withoutGlobalScopes(),
            ])
            ->where(function ($q) use ($tenantId) {
                $q->whereNull('device_model_id')
                    ->orWhereHas('deviceModel', function ($dq) use ($tenantId) {
                        $dq->withoutGlobalScopes()->where(function ($sub) use ($tenantId) {
                            $sub->whereNull('tenant_id')
                                ->orWhere('tenant_id', $tenantId);
                        });
                    });
            });

        if ($status === 'inactive') {
            $query->where('is_active', false);
        } elseif ($status !== 'all') {
            $query->where('is_active', true);
        }

        if ($startDate !== null && $endDate !== null) {
            $query->whereBetween('created_at', [$startDate, $endDate]);
        }

        if ($keyword !== '') {
            $escaped = $this->escapeLike($keyword);
            $like = "%{$escaped}%";
            $query->where(function ($q) use ($like) {
                $q->where('issue_name', 'like', $like)
                    ->orWhere('category', 'like', $like)
                    ->orWhere('solution', 'like', $like)
                    ->orWhereHas('deviceModel', function ($dq) use ($like) {
                        $dq->withoutGlobalScopes()->where(function ($sub) use ($like) {
                            $sub->where('name', 'like', $like)
                                ->orWhere('category', 'like', $like);
                        });
                    })
                    ->orWhereHas('suggestedService', function ($sq) use ($like) {
                        $sq->withoutGlobalScopes()->where('name', 'like', $like);
                    });
            });
        }

        $totalMatched = (clone $query)->count();

        if ($sortBy === 'price_asc') {
            $query->orderBy('estimated_cost', 'asc')->orderBy('id', 'asc');
        } elseif ($sortBy === 'price_desc') {
            $query->orderBy('estimated_cost', 'desc')->orderByDesc('id');
        } else {
            $query->orderBy('order_index', 'asc')->orderByDesc('id');
        }

        $records = $query->limit($limit)->get();

        $items = $records->map(function (CommonIssue $issue): array {
            $estimatedPrice = (float) ($issue->estimated_cost ?? $issue->suggestedService?->base_price ?? 0);
            $deviceName = (string) ($issue->deviceModel?->name ?? 'Tất cả dòng máy');
            $issueName = (string) $issue->issue_name;
            $solution = (string) ($issue->solution ?? '');

            return [
                'id'                        => (int) $issue->id,
                'name'                      => $issueName,
                'title'                     => $issueName,
                'issue_name'                => $issueName,
                'category'                  => (string) ($issue->category ?? ''),
                'symptom'                   => $solution !== '' ? $solution : $issueName,
                'solution'                  => $solution,
                'estimated_time'            => (string) ($issue->estimated_time ?? ''),
                'estimated_price'           => $estimatedPrice,
                'estimated_cost'            => $estimatedPrice,
                'formatted_estimated_price' => $this->formatVnd($estimatedPrice),
                'device_model_name'         => $deviceName,
                'device_name'               => $deviceName,
                'suggested_service_name'    => (string) ($issue->suggestedService?->name ?? ''),
                'is_active'                 => (bool) $issue->is_active,
            ];
        })->values()->all();

        return [$totalMatched, $items];
    }

    /**
     * 2A. Tra cứu nhà cung cấp & công nợ (suppliers - chỉ Admin).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function querySuppliers(
        TelegramRecipient $recipient,
        string $keyword,
        string $status,
        ?Carbon $startDate,
        ?Carbon $endDate,
        string $sortBy,
        int $limit
    ): array {
        $tenantId = (int) $recipient->tenant_id;
        $branchId = $recipient->branch_id !== null ? (int) $recipient->branch_id : null;

        $query = Supplier::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->withSum([
                'goodsReceipts as total_purchased_amount' => function ($q) use ($tenantId, $branchId) {
                    $q->withoutGlobalScopes()
                        ->where('tenant_id', $tenantId)
                        ->where('status', '!=', 'cancelled');
                    if ($branchId !== null) {
                        $q->where('branch_id', $branchId);
                    }
                },
            ], 'final_amount')
            ->withCount([
                'goodsReceipts as receipts_count' => function ($q) use ($tenantId, $branchId) {
                    $q->withoutGlobalScopes()
                        ->where('tenant_id', $tenantId)
                        ->where('status', '!=', 'cancelled');
                    if ($branchId !== null) {
                        $q->where('branch_id', $branchId);
                    }
                },
            ]);

        if ($status === 'inactive') {
            $query->where('is_active', false);
        } elseif (in_array($status, ['debt', 'has_debt'], true)) {
            $query->where('debt_balance', '>', 0);
        } elseif ($status === 'active') {
            $query->where('is_active', true);
        }

        if ($startDate !== null && $endDate !== null) {
            $query->whereBetween('created_at', [$startDate, $endDate]);
        }

        if ($keyword !== '') {
            $escaped = $this->escapeLike($keyword);
            $like = "%{$escaped}%";
            $query->where(function ($q) use ($like) {
                $q->where('code', 'like', $like)
                    ->orWhere('name', 'like', $like)
                    ->orWhere('phone', 'like', $like)
                    ->orWhere('email', 'like', $like)
                    ->orWhere('address', 'like', $like)
                    ->orWhere('notes', 'like', $like);
            });
        }

        $totalMatched = (clone $query)->count();

        if ($sortBy === 'debt_desc') {
            $query->orderByDesc('debt_balance')->orderByDesc('id');
        } elseif ($sortBy === 'name_asc') {
            $query->orderBy('name', 'asc');
        } else {
            $query->orderByDesc('debt_balance')->orderByDesc('id');
        }

        $records = $query->limit($limit)->get();

        $items = $records->map(function (Supplier $supplier): array {
            $debt = (float) ($supplier->debt_balance ?? 0);
            $totalPurchased = (float) ($supplier->getAttribute('total_purchased_amount') ?? 0);

            return [
                'id'                        => (int) $supplier->id,
                'code'                      => (string) $supplier->code,
                'name'                      => (string) $supplier->name,
                'phone'                     => (string) ($supplier->phone ?? ''),
                'email'                     => (string) ($supplier->email ?? ''),
                'address'                   => (string) ($supplier->address ?? ''),
                'debt_balance'              => $debt,
                'total_debt'                => $debt,
                'current_debt'              => $debt,
                'formatted_debt'            => $this->formatVnd($debt),
                'total_purchased'           => $totalPurchased,
                'formatted_total_purchased' => $this->formatVnd($totalPurchased),
                'receipts_count'            => (int) ($supplier->getAttribute('receipts_count') ?? 0),
                'notes'                     => (string) ($supplier->notes ?? ''),
                'is_active'                 => (bool) $supplier->is_active,
            ];
        })->values()->all();

        return [$totalMatched, $items];
    }

    /**
     * 2B. Tra cứu phiếu nhập kho linh kiện (goods_receipts - chỉ Admin).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function queryGoodsReceipts(
        TelegramRecipient $recipient,
        string $branchDisplay,
        string $keyword,
        string $status,
        ?Carbon $startDate,
        ?Carbon $endDate,
        string $sortBy,
        int $limit
    ): array {
        $tenantId = (int) $recipient->tenant_id;

        $query = GoodsReceipt::withoutGlobalScopes()
            ->with([
                'supplier'      => fn ($q) => $q->withoutGlobalScopes(),
                'branch'        => fn ($q) => $q->withoutGlobalScopes(),
                'createdByUser' => fn ($q) => $q->withoutGlobalScopes(),
            ])
            ->where('tenant_id', $tenantId);

        if ($recipient->branch_id !== null) {
            $query->where('branch_id', (int) $recipient->branch_id);
        }

        if ($status !== '' && $status !== 'all') {
            $query->where('status', $status);
        }

        if ($startDate !== null && $endDate !== null) {
            $query->whereBetween('created_at', [$startDate, $endDate]);
        }

        if ($keyword !== '') {
            $escaped = $this->escapeLike($keyword);
            $like = "%{$escaped}%";
            $query->where(function ($q) use ($like) {
                $q->where('receipt_code', 'like', $like)
                    ->orWhere('notes', 'like', $like)
                    ->orWhereHas('supplier', function ($sq) use ($like) {
                        $sq->withoutGlobalScopes()->where(function ($sub) use ($like) {
                            $sub->where('name', 'like', $like)
                                ->orWhere('code', 'like', $like)
                                ->orWhere('phone', 'like', $like);
                        });
                    })
                    ->orWhereHas('branch', function ($bq) use ($like) {
                        $bq->withoutGlobalScopes()->where('name', 'like', $like);
                    });
            });
        }

        $totalMatched = (clone $query)->count();

        if ($sortBy === 'debt_desc') {
            $query->orderByDesc('debt_amount')->orderByDesc('id');
        } elseif ($sortBy === 'price_desc') {
            $query->orderByDesc('final_amount')->orderByDesc('id');
        } elseif ($sortBy === 'price_asc') {
            $query->orderBy('final_amount', 'asc')->orderByDesc('id');
        } else {
            $query->orderByDesc('created_at')->orderByDesc('id');
        }

        $records = $query->limit($limit)->get();

        $items = $records->map(function (GoodsReceipt $receipt) use ($branchDisplay): array {
            $totalAmount = (float) ($receipt->final_amount ?? $receipt->total_amount ?? 0);
            $paidAmount = (float) ($receipt->paid_amount ?? 0);
            $debtAmount = (float) ($receipt->debt_amount ?? 0);
            $rawStatus = strtolower((string) $receipt->status);
            $statusLabel = match ($rawStatus) {
                'completed' => 'Đã hoàn tất nhập kho',
                'draft'     => 'Phiếu nháp',
                'cancelled' => 'Đã hủy',
                default     => 'Đang xử lý',
            };
            $createdAtStr = optional($receipt->created_at)->format('H:i - d/m/Y');

            return [
                'id'                     => (int) $receipt->id,
                'code'                   => (string) $receipt->receipt_code,
                'receipt_code'           => (string) $receipt->receipt_code,
                'receipt_number'         => (string) $receipt->receipt_code,
                'supplier_name'          => (string) ($receipt->supplier?->name ?? 'Nhà cung cấp'),
                'branch_name'            => (string) ($receipt->branch?->name ?? $branchDisplay),
                'total_amount'           => $totalAmount,
                'final_amount'           => $totalAmount,
                'paid_amount'            => $paidAmount,
                'debt_amount'            => $debtAmount,
                'formatted_total_amount' => $this->formatVnd($totalAmount),
                'formatted_paid_amount'  => $this->formatVnd($paidAmount),
                'formatted_debt_amount'  => $this->formatVnd($debtAmount),
                'status'                 => (string) $receipt->status,
                'status_label'           => $statusLabel,
                'created_by_name'        => (string) ($receipt->createdByUser?->name ?? 'Hệ thống'),
                'notes'                  => (string) ($receipt->notes ?? ''),
                'received_at'            => $createdAtStr,
                'created_at'             => $createdAtStr,
            ];
        })->values()->all();

        return [$totalMatched, $items];
    }

    /**
     * 2C. Tra cứu giao dịch công nợ nhà cung cấp (supplier_debt_transactions - chỉ Admin).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function querySupplierDebtTransactions(
        TelegramRecipient $recipient,
        string $branchDisplay,
        string $keyword,
        string $status,
        ?Carbon $startDate,
        ?Carbon $endDate,
        string $sortBy,
        int $limit
    ): array {
        $tenantId = (int) $recipient->tenant_id;

        $query = SupplierDebtTransaction::withoutGlobalScopes()
            ->with([
                'supplier'      => fn ($q) => $q->withoutGlobalScopes(),
                'branch'        => fn ($q) => $q->withoutGlobalScopes(),
                'goodsReceipt'  => fn ($q) => $q->withoutGlobalScopes(),
                'createdByUser' => fn ($q) => $q->withoutGlobalScopes(),
            ])
            ->where('tenant_id', $tenantId);

        if ($recipient->branch_id !== null) {
            $branchId = (int) $recipient->branch_id;
            $query->where(function ($q) use ($branchId) {
                $q->where('branch_id', $branchId)
                    ->orWhereNull('branch_id');
            });
        }

        if ($status !== '' && $status !== 'all') {
            $query->where('transaction_type', $status);
        }

        if ($startDate !== null && $endDate !== null) {
            $query->whereBetween('created_at', [$startDate, $endDate]);
        }

        if ($keyword !== '') {
            $escaped = $this->escapeLike($keyword);
            $like = "%{$escaped}%";
            $query->where(function ($q) use ($like) {
                $q->where('transaction_code', 'like', $like)
                    ->orWhere('transaction_type', 'like', $like)
                    ->orWhere('notes', 'like', $like)
                    ->orWhereHas('supplier', function ($sq) use ($like) {
                        $sq->withoutGlobalScopes()->where(function ($sub) use ($like) {
                            $sub->where('name', 'like', $like)
                                ->orWhere('code', 'like', $like)
                                ->orWhere('phone', 'like', $like);
                        });
                    })
                    ->orWhereHas('goodsReceipt', function ($rq) use ($like) {
                        $rq->withoutGlobalScopes()->where('receipt_code', 'like', $like);
                    });
            });
        }

        $totalMatched = (clone $query)->count();

        if ($sortBy === 'debt_desc') {
            $query->orderByDesc('debt_after')->orderByDesc('id');
        } elseif ($sortBy === 'price_desc') {
            $query->orderByDesc('amount')->orderByDesc('id');
        } elseif ($sortBy === 'price_asc') {
            $query->orderBy('amount', 'asc')->orderByDesc('id');
        } else {
            $query->orderByDesc('created_at')->orderByDesc('id');
        }

        $records = $query->limit($limit)->get();

        $items = $records->map(function (SupplierDebtTransaction $tx) use ($branchDisplay): array {
            $amount = (float) ($tx->amount ?? 0);
            $debtBefore = (float) ($tx->debt_before ?? 0);
            $debtAfter = (float) ($tx->debt_after ?? 0);
            $txType = (string) $tx->transaction_type;
            $typeLabel = match (strtolower($txType)) {
                'purchase_debt' => 'Ghi nợ nhập hàng',
                'debt_payment'  => 'Thanh toán công nợ',
                'adjustment'    => 'Điều chỉnh công nợ',
                default         => 'Giao dịch công nợ',
            };

            return [
                'id'                      => (int) $tx->id,
                'transaction_code'        => (string) $tx->transaction_code,
                'supplier_name'           => (string) ($tx->supplier?->name ?? 'Nhà cung cấp'),
                'branch_name'             => (string) ($tx->branch?->name ?? $branchDisplay),
                'receipt_code'            => (string) ($tx->goodsReceipt?->receipt_code ?? ''),
                'transaction_type'        => $txType,
                'type'                    => $txType,
                'type_label'              => $typeLabel,
                'amount'                  => $amount,
                'formatted_amount'        => $this->formatVnd($amount),
                'debt_before'             => $debtBefore,
                'debt_after'              => $debtAfter,
                'balance_after'           => $debtAfter,
                'formatted_balance_after' => $this->formatVnd($debtAfter),
                'payment_method'          => (string) ($tx->payment_method ?? ''),
                'note'                    => (string) ($tx->notes ?? ''),
                'notes'                   => (string) ($tx->notes ?? ''),
                'created_at'              => optional($tx->created_at)->format('H:i - d/m/Y'),
            ];
        })->values()->all();

        return [$totalMatched, $items];
    }

    /**
     * 3. Tra cứu ca làm việc & đối soát tiền mặt (work_shifts).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function queryWorkShifts(
        TelegramRecipient $recipient,
        string $branchDisplay,
        string $keyword,
        string $status,
        ?Carbon $startDate,
        ?Carbon $endDate,
        string $sortBy,
        int $limit
    ): array {
        $tenantId = (int) $recipient->tenant_id;
        $role = strtolower(trim((string) ($recipient->target_role ?? '')));
        $canViewCash = in_array($role, ['admin', 'super_admin', 'receptionist'], true);

        $query = WorkShift::withoutGlobalScopes()
            ->with([
                'cashier'  => fn ($q) => $q->withoutGlobalScopes(),
                'closedBy' => fn ($q) => $q->withoutGlobalScopes(),
                'branch'   => fn ($q) => $q->withoutGlobalScopes(),
            ])
            ->where('tenant_id', $tenantId);

        if ($recipient->branch_id !== null) {
            $query->where('branch_id', (int) $recipient->branch_id);
        }

        if ($status !== '' && $status !== 'all') {
            $query->where('status', $status);
        }

        if ($startDate !== null && $endDate !== null) {
            $query->where(function ($dq) use ($startDate, $endDate) {
                $dq->whereBetween('opened_at', [$startDate, $endDate])
                    ->orWhereBetween('closed_at', [$startDate, $endDate])
                    ->orWhereBetween('created_at', [$startDate, $endDate]);
            });
        }

        if ($keyword !== '') {
            $escaped = $this->escapeLike($keyword);
            $like = "%{$escaped}%";
            $query->where(function ($q) use ($like, $canViewCash) {
                $q->where('shift_code', 'like', $like);
                if ($canViewCash) {
                    $q->orWhere('reconciliation_notes', 'like', $like);
                }
                $q->orWhereHas('cashier', function ($uq) use ($like) {
                    $uq->withoutGlobalScopes()->where('name', 'like', $like);
                })
                    ->orWhereHas('closedBy', function ($cq) use ($like) {
                        $cq->withoutGlobalScopes()->where('name', 'like', $like);
                    })
                    ->orWhereHas('branch', function ($bq) use ($like) {
                        $bq->withoutGlobalScopes()->where('name', 'like', $like);
                    });
            });
        }

        $totalMatched = (clone $query)->count();

        if ($canViewCash && $sortBy === 'cash_diff_desc') {
            $records = $query->orderByRaw('ABS(COALESCE(difference_amount, 0)) DESC')
                ->orderByDesc('id')
                ->limit($limit)
                ->get();
        } else {
            $records = $query->orderByDesc('opened_at')
                ->orderByDesc('id')
                ->limit($limit)
                ->get();
        }

        $items = $records->map(function (WorkShift $shift) use ($branchDisplay, $canViewCash): array {
            $openedAtStr = optional($shift->opened_at)->format('H:i - d/m/Y');
            $closedAtStr = optional($shift->closed_at)->format('H:i - d/m/Y');
            $userName = (string) ($shift->cashier?->name ?? 'Nhân viên');
            $closedByName = (string) ($shift->closedBy?->name ?? '');
            $branchName = (string) ($shift->branch?->name ?? $branchDisplay);
            $statusLabel = strtolower((string) $shift->status) === 'open' ? 'Đang mở ca' : 'Đã đóng ca';

            if (! $canViewCash) {
                return [
                    'id'                   => (int) $shift->id,
                    'shift_code'           => (string) $shift->shift_code,
                    'user_name'            => $userName,
                    'cashier_name'         => $userName,
                    'closed_by_name'       => $closedByName,
                    'branch_name'          => $branchName,
                    'status'               => (string) $shift->status,
                    'status_label'         => $statusLabel,
                    'opened_at'            => $openedAtStr,
                    'started_at'           => $openedAtStr,
                    'closed_at'            => $closedAtStr,
                    'ended_at'             => $closedAtStr,
                    'opening_cash'         => null,
                    'closing_cash'         => null,
                    'actual_cash'          => null,
                    'expected_cash'        => null,
                    'difference_amount'    => null,
                    'cash_difference'      => null,
                    'reconciliation_notes' => null,
                    'notes'                => null,
                    'cash_fields_redacted' => true,
                    'cash_fields_hidden'   => true,
                ];
            }

            $openingCash = (float) ($shift->opening_cash ?? 0);
            $closingCash = $shift->actual_cash !== null ? (float) $shift->actual_cash : null;
            $expectedCash = (float) ($shift->expected_cash ?? 0);
            $diffAmount = (float) ($shift->difference_amount ?? 0);

            return [
                'id'                          => (int) $shift->id,
                'shift_code'                  => (string) $shift->shift_code,
                'user_name'                   => $userName,
                'cashier_name'                => $userName,
                'closed_by_name'              => $closedByName,
                'branch_name'                 => $branchName,
                'status'                      => (string) $shift->status,
                'status_label'                => $statusLabel,
                'opened_at'                   => $openedAtStr,
                'started_at'                  => $openedAtStr,
                'closed_at'                   => $closedAtStr,
                'ended_at'                    => $closedAtStr,
                'opening_cash'                => $openingCash,
                'closing_cash'                => $closingCash,
                'actual_cash'                 => $closingCash,
                'expected_cash'               => $expectedCash,
                'difference_amount'           => $diffAmount,
                'cash_difference'             => $diffAmount,
                'formatted_opening_cash'      => $this->formatVnd($openingCash),
                'formatted_closing_cash'      => $closingCash !== null ? $this->formatVnd($closingCash) : 'Chưa chốt ca',
                'formatted_expected_cash'     => $this->formatVnd($expectedCash),
                'formatted_difference_amount' => $this->formatVnd($diffAmount),
                'notes'                       => (string) ($shift->reconciliation_notes ?? ''),
                'reconciliation_notes'        => (string) ($shift->reconciliation_notes ?? ''),
                'cash_fields_redacted'        => false,
                'cash_fields_hidden'          => false,
            ];
        })->values()->all();

        return [$totalMatched, $items];
    }

    /**
     * 4. Tra cứu khách hàng & xếp hạng khách thân thiết (customers).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function queryCustomers(
        TelegramRecipient $recipient,
        string $keyword,
        string $status,
        ?Carbon $startDate,
        ?Carbon $endDate,
        string $sortBy,
        int $limit
    ): array {
        $tenantId = (int) $recipient->tenant_id;
        $branchId = $recipient->branch_id !== null ? (int) $recipient->branch_id : null;
        $excludedStatuses = ['cancelled', 'rejected'];
        $hasDateFilter = $startDate !== null && $endDate !== null;
        $hasScopeFilter = ($branchId !== null) || $hasDateFilter;

        $query = Customer::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->withCount([
                'repairOrders' => function ($q) use ($tenantId, $branchId, $excludedStatuses, $hasDateFilter, $startDate, $endDate) {
                    $q->withoutGlobalScopes()
                        ->where('tenant_id', $tenantId)
                        ->whereNotIn('status', $excludedStatuses);
                    if ($branchId !== null) {
                        $q->where('branch_id', $branchId);
                    }
                    if ($hasDateFilter) {
                        $q->whereBetween('created_at', [$startDate, $endDate]);
                    }
                },
                'repairOrders as all_repair_orders_count' => function ($q) use ($tenantId) {
                    $q->withoutGlobalScopes()
                        ->where('tenant_id', $tenantId);
                },
            ])
            ->withSum([
                'repairOrders as valid_orders_spent' => function ($q) use ($tenantId, $branchId, $excludedStatuses, $hasDateFilter, $startDate, $endDate) {
                    $q->withoutGlobalScopes()
                        ->where('tenant_id', $tenantId)
                        ->whereNotIn('status', $excludedStatuses);
                    if ($branchId !== null) {
                        $q->where('branch_id', $branchId);
                    }
                    if ($hasDateFilter) {
                        $q->whereBetween('created_at', [$startDate, $endDate]);
                    }
                },
            ], 'total_price');

        if ($hasDateFilter) {
            $query->where(function ($dq) use ($tenantId, $branchId, $excludedStatuses, $startDate, $endDate) {
                $dq->whereBetween('created_at', [$startDate, $endDate])
                    ->orWhereHas('repairOrders', function ($rq) use ($tenantId, $branchId, $excludedStatuses, $startDate, $endDate) {
                        $rq->withoutGlobalScopes()
                            ->where('tenant_id', $tenantId)
                            ->whereNotIn('status', $excludedStatuses)
                            ->whereBetween('created_at', [$startDate, $endDate]);
                        if ($branchId !== null) {
                            $rq->where('branch_id', $branchId);
                        }
                    });
            });
        }

        if ($keyword !== '') {
            $escaped = $this->escapeLike($keyword);
            $like = "%{$escaped}%";
            $query->where(function ($q) use ($like) {
                $q->where('name', 'like', $like)
                    ->orWhere('phone', 'like', $like)
                    ->orWhere('email', 'like', $like)
                    ->orWhere('address', 'like', $like)
                    ->orWhere('notes', 'like', $like);
            });
        }

        $totalMatched = (clone $query)->count();

        if ($sortBy === 'orders_desc') {
            $query->orderByDesc('repair_orders_count')
                ->orderByDesc('valid_orders_spent');
            if (! $hasScopeFilter) {
                $query->orderByDesc('orders_count')
                    ->orderByDesc('total_spent');
            }
            $query->orderByDesc('id');
        } elseif (in_array($sortBy, ['spent_desc', 'price_desc'], true)) {
            $query->orderByDesc('valid_orders_spent')
                ->orderByDesc('repair_orders_count');
            if (! $hasScopeFilter) {
                $query->orderByDesc('total_spent');
            }
            $query->orderByDesc('id');
        } else {
            $query->orderByDesc('id');
        }

        $records = $query->limit($limit)->get();

        $items = $records->map(function (Customer $customer) use ($hasScopeFilter): array {
            $countedOrders = (int) ($customer->getAttribute('repair_orders_count') ?? 0);
            $allOrdersCount = (int) ($customer->getAttribute('all_repair_orders_count') ?? 0);
            $storedOrders = (int) ($customer->getRawOriginal('orders_count') ?? $customer->orders_count ?? 0);
            $canFallbackToStored = ! $hasScopeFilter && $allOrdersCount === 0;

            $ordersCount = $countedOrders > 0
                ? $countedOrders
                : ($canFallbackToStored ? $storedOrders : 0);

            $summedSpent = (float) ($customer->getAttribute('valid_orders_spent') ?? 0);
            $storedSpent = (float) ($customer->getRawOriginal('total_spent') ?? $customer->total_spent ?? 0);
            $totalSpent = $countedOrders > 0
                ? $summedSpent
                : ($canFallbackToStored ? $storedSpent : 0.0);

            return [
                'id'                    => (int) $customer->id,
                'name'                  => (string) $customer->name,
                'phone'                 => (string) ($customer->phone ?? ''),
                'email'                 => (string) ($customer->email ?? ''),
                'address'               => (string) ($customer->address ?? ''),
                'customer_type'         => (string) ($customer->customer_type ?? 'retail'),
                'orders_count'          => $ordersCount,
                'repair_orders_count'   => $ordersCount,
                'valid_orders_count'    => $countedOrders,
                'total_spent'           => $totalSpent,
                'valid_orders_spent'    => $countedOrders > 0 ? $summedSpent : 0.0,
                'formatted_total_spent' => $this->formatVnd($totalSpent),
                'notes'                 => (string) ($customer->notes ?? ''),
                'created_at'            => optional($customer->created_at)->format('H:i - d/m/Y'),
            ];
        })->values()->all();

        return [$totalMatched, $items];
    }

    /**
     * 5A. Tra cứu biên bản kiểm định chất lượng QC (qc_inspections).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function queryQcInspections(
        TelegramRecipient $recipient,
        string $branchDisplay,
        string $keyword,
        string $status,
        ?Carbon $startDate,
        ?Carbon $endDate,
        string $sortBy,
        int $limit
    ): array {
        $tenantId = (int) $recipient->tenant_id;
        $branchId = $recipient->branch_id !== null ? (int) $recipient->branch_id : null;

        $query = QcInspection::withoutGlobalScopes()
            ->with([
                'repairOrder' => fn ($q) => $q->withoutGlobalScopes()->with([
                    'deviceModel' => fn ($dq) => $dq->withoutGlobalScopes(),
                    'branch'      => fn ($bq) => $bq->withoutGlobalScopes(),
                    'customer'    => fn ($cq) => $cq->withoutGlobalScopes(),
                ]),
                'inspector' => fn ($q) => $q->withoutGlobalScopes(),
            ])
            ->where(function ($q) use ($tenantId) {
                $q->where('tenant_id', $tenantId)
                    ->orWhereNull('tenant_id');
            })
            ->whereHas('repairOrder', function ($oq) use ($tenantId, $branchId) {
                $oq->withoutGlobalScopes()->where('tenant_id', $tenantId);
                if ($branchId !== null) {
                    $oq->where('branch_id', $branchId);
                }
            });

        if ($status !== '' && $status !== 'all') {
            if (in_array($status, ['pass', 'passed'], true)) {
                $query->whereIn('result', ['pass', 'passed']);
            } elseif (in_array($status, ['fail', 'failed', 'rework'], true)) {
                $query->whereIn('result', ['fail', 'failed', 'rework']);
            } else {
                $query->where('result', $status);
            }
        }

        if ($startDate !== null && $endDate !== null) {
            $query->whereBetween('created_at', [$startDate, $endDate]);
        }

        if ($keyword !== '') {
            $escaped = $this->escapeLike($keyword);
            $like = "%{$escaped}%";
            $query->where(function ($q) use ($like) {
                $q->where('result', 'like', $like)
                    ->orWhere('notes', 'like', $like)
                    ->orWhere('rework_reason', 'like', $like)
                    ->orWhereHas('repairOrder', function ($oq) use ($like) {
                        $oq->withoutGlobalScopes()->where('order_code', 'like', $like);
                    })
                    ->orWhereHas('inspector', function ($iq) use ($like) {
                        $iq->withoutGlobalScopes()->where('name', 'like', $like);
                    });
            });
        }

        $totalMatched = (clone $query)->count();
        $records = $query->orderByDesc('created_at')->orderByDesc('id')->limit($limit)->get();

        $items = $records->map(function (QcInspection $qc) use ($branchDisplay): array {
            $rawResult = strtolower(trim((string) $qc->result));
            $overallPassed = in_array($rawResult, ['pass', 'passed'], true);
            $resultLabel = $overallPassed ? 'Đạt chuẩn QC' : 'Không đạt (Cần kiểm tra/sửa lại)';
            $inspectedAtStr = optional($qc->created_at)->format('H:i - d/m/Y');

            return [
                'id'             => (int) $qc->id,
                'order_code'     => (string) ($qc->repairOrder?->order_code ?? ''),
                'device_name'    => (string) ($qc->repairOrder?->deviceModel?->name ?? ''),
                'branch_name'    => (string) ($qc->repairOrder?->branch?->name ?? $branchDisplay),
                'inspector_name' => (string) ($qc->inspector?->name ?? 'Chưa rõ'),
                'status'         => (string) $qc->result,
                'result'         => (string) $qc->result,
                'overall_passed' => $overallPassed,
                'result_label'   => $resultLabel,
                'notes'          => (string) ($qc->notes ?? ''),
                'rework_reason'  => (string) ($qc->rework_reason ?? ''),
                'inspected_at'   => $inspectedAtStr,
                'created_at'     => $inspectedAtStr,
            ];
        })->values()->all();

        return [$totalMatched, $items];
    }

    /**
     * 5B. Tra cứu vận đơn giao hàng / COD (shipments).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function queryShipments(
        TelegramRecipient $recipient,
        string $branchDisplay,
        string $keyword,
        string $status,
        ?Carbon $startDate,
        ?Carbon $endDate,
        string $sortBy,
        int $limit
    ): array {
        $tenantId = (int) $recipient->tenant_id;
        $branchId = $recipient->branch_id !== null ? (int) $recipient->branch_id : null;

        $query = Shipment::withoutGlobalScopes()
            ->with([
                'repairOrder' => fn ($q) => $q->withoutGlobalScopes()->with([
                    'customer'    => fn ($cq) => $cq->withoutGlobalScopes(),
                    'branch'      => fn ($bq) => $bq->withoutGlobalScopes(),
                    'deviceModel' => fn ($dq) => $dq->withoutGlobalScopes(),
                ]),
                'partner'       => fn ($q) => $q->withoutGlobalScopes(),
                'createdByUser' => fn ($q) => $q->withoutGlobalScopes(),
            ])
            ->where(function ($q) use ($tenantId) {
                $q->where('tenant_id', $tenantId)
                    ->orWhereNull('tenant_id');
            })
            ->whereHas('repairOrder', function ($oq) use ($tenantId, $branchId) {
                $oq->withoutGlobalScopes()->where('tenant_id', $tenantId);
                if ($branchId !== null) {
                    $oq->where('branch_id', $branchId);
                }
            });

        if ($status !== '' && $status !== 'all') {
            $query->where('status', $status);
        }

        if ($startDate !== null && $endDate !== null) {
            $query->where(function ($dq) use ($startDate, $endDate) {
                $dq->whereBetween('created_at', [$startDate, $endDate])
                    ->orWhereBetween('delivered_at', [$startDate, $endDate]);
            });
        }

        if ($keyword !== '') {
            $escaped = $this->escapeLike($keyword);
            $like = "%{$escaped}%";
            $query->where(function ($q) use ($like) {
                $q->where('shipment_code', 'like', $like)
                    ->orWhere('carrier_name', 'like', $like)
                    ->orWhere('tracking_code', 'like', $like)
                    ->orWhere('delivery_address', 'like', $like)
                    ->orWhere('notes', 'like', $like)
                    ->orWhereHas('repairOrder', function ($oq) use ($like) {
                        $oq->withoutGlobalScopes()->where(function ($sub) use ($like) {
                            $sub->where('order_code', 'like', $like)
                                ->orWhereHas('customer', function ($cq) use ($like) {
                                    $cq->withoutGlobalScopes()->where(function ($cSub) use ($like) {
                                        $cSub->where('name', 'like', $like)
                                            ->orWhere('phone', 'like', $like);
                                    });
                                });
                        });
                    });
            });
        }

        $totalMatched = (clone $query)->count();
        $records = $query->orderByDesc('created_at')->orderByDesc('id')->limit($limit)->get();

        $items = $records->map(function (Shipment $shipment) use ($branchDisplay): array {
            $carrier = trim((string) ($shipment->carrier_name ?: ($shipment->partner?->name ?? 'Đơn vị vận chuyển')));
            $trackingCode = (string) ($shipment->tracking_code ?? '');
            $codAmount = (float) ($shipment->getAttribute('cod_amount') ?? $shipment->repairOrder?->total_price ?? 0);
            $shippingFee = (float) ($shipment->getAttribute('shipping_fee') ?? 0);
            $recipientName = (string) ($shipment->repairOrder?->customer?->name ?? 'Khách nhận hàng');
            $recipientPhone = (string) ($shipment->repairOrder?->customer?->phone ?? '');
            $rawStatus = strtolower(trim((string) $shipment->status));
            $statusLabel = match ($rawStatus) {
                'pending'                        => 'Chờ lấy hàng',
                'shipping', 'in_transit',
                'delivering'                     => 'Đang giao hàng',
                'delivered', 'completed'         => 'Đã giao thành công',
                'returned'                       => 'Hoàn trả',
                'cancelled'                      => 'Đã hủy',
                default                          => 'Đang xử lý vận chuyển',
            };
            $shippedAtStr = optional($shipment->created_at)->format('H:i - d/m/Y');
            $deliveredAtStr = optional($shipment->delivered_at)->format('H:i - d/m/Y');

            return [
                'id'                      => (int) $shipment->id,
                'shipment_code'           => (string) $shipment->shipment_code,
                'order_code'              => (string) ($shipment->repairOrder?->order_code ?? ''),
                'branch_name'             => (string) ($shipment->repairOrder?->branch?->name ?? $branchDisplay),
                'carrier'                 => $carrier,
                'provider'                => $carrier,
                'carrier_name'            => $carrier,
                'tracking_number'         => $trackingCode,
                'tracking_code'           => $trackingCode,
                'delivery_method'         => (string) ($shipment->delivery_method ?? ''),
                'delivery_address'        => (string) ($shipment->delivery_address ?: ($shipment->repairOrder?->shipping_address ?? '')),
                'status'                  => (string) $shipment->status,
                'status_label'            => $statusLabel,
                'cod_amount'              => $codAmount,
                'formatted_cod_amount'    => $this->formatVnd($codAmount),
                'shipping_fee'            => $shippingFee,
                'formatted_shipping_fee'  => $this->formatVnd($shippingFee),
                'recipient_name'          => $recipientName,
                'recipient_phone'         => $recipientPhone,
                'shipped_at'              => $shippedAtStr,
                'delivered_at'            => $deliveredAtStr,
                'notes'                   => (string) ($shipment->notes ?? ''),
            ];
        })->values()->all();

        return [$totalMatched, $items];
    }

    /**
     * Định dạng kết quả tiếng Việt bằng thẻ HTML chuẩn Telegram (<b>, <i>, <code>), tuyệt đối không dùng icon/emoji.
     */
    public function formatHtml(array $result): string
    {
        if (isset($result['error']) && trim((string) $result['error']) !== '') {
            $safeError = htmlspecialchars(trim((string) $result['error']), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            if (! empty($result['permission_denied'])) {
                return "<b>Từ chối quyền truy cập</b>\n{$safeError}";
            }

            return "<b>Không thể thực hiện tra cứu</b>\n{$safeError}";
        }

        $entity = strtolower(trim((string) ($result['entity'] ?? '')));
        $entityLabel = htmlspecialchars(
            (string) ($result['entity_label'] ?? self::resolveEntityLabel($entity)),
            ENT_QUOTES | ENT_SUBSTITUTE,
            'UTF-8'
        );
        $branchScope = htmlspecialchars(
            (string) ($result['branch_scope'] ?? $result['branch_name'] ?? 'Chi nhánh chính'),
            ENT_QUOTES | ENT_SUBSTITUTE,
            'UTF-8'
        );
        $totalMatched = (int) ($result['total_matched'] ?? 0);
        $items = is_array($result['items'] ?? null)
            ? $result['items']
            : (is_array($result[$entity] ?? null) ? $result[$entity] : []);

        if ($totalMatched === 0 || empty($items)) {
            return "<b>{$entityLabel}</b>\nKhông tìm thấy dữ liệu nào khớp với điều kiện tra cứu tại chi nhánh <b>{$branchScope}</b>.";
        }

        $lines = [
            "<b>{$entityLabel}</b>",
            "Chi nhánh: <b>{$branchScope}</b> (Tìm thấy <b>{$totalMatched}</b> kết quả)",
        ];

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $lines[] = match ($entity) {
                'repair_services'            => $this->formatRepairServiceItemHtml($item),
                'common_issues'              => $this->formatCommonIssueItemHtml($item),
                'suppliers'                  => $this->formatSupplierItemHtml($item),
                'goods_receipts'             => $this->formatGoodsReceiptItemHtml($item),
                'supplier_debt_transactions' => $this->formatSupplierDebtTxItemHtml($item),
                'work_shifts'                => $this->formatWorkShiftItemHtml($item),
                'customers'                  => $this->formatCustomerItemHtml($item),
                'qc_inspections'             => $this->formatQcInspectionItemHtml($item),
                'shipments'                  => $this->formatShipmentItemHtml($item),
                default                      => '- ' . htmlspecialchars((string) ($item['name'] ?? $item['code'] ?? 'Bản ghi'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'),
            };
        }

        return implode("\n", array_filter($lines, static fn (string $line) => trim($line) !== ''));
    }

    protected function formatRepairServiceItemHtml(array $item): string
    {
        $name = htmlspecialchars((string) ($item['name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $code = htmlspecialchars((string) ($item['code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $device = htmlspecialchars((string) ($item['device_model_name'] ?? 'Tất cả dòng máy'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $price = htmlspecialchars((string) ($item['formatted_price'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $warranty = (int) ($item['warranty_days'] ?? 0);
        $desc = htmlspecialchars(trim((string) ($item['description'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $row = "- <b>{$name}</b>" . ($code !== '' ? " (<code>{$code}</code>)" : '')
            . " | Thiết bị: {$device} | Giá niêm yết: <b>{$price}</b> | Bảo hành: <b>{$warranty} ngày</b>";

        if ($desc !== '') {
            $row .= "\n  Mô tả: {$desc}";
        }

        return $row;
    }

    protected function formatCommonIssueItemHtml(array $item): string
    {
        $name = htmlspecialchars((string) ($item['name'] ?? $item['issue_name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $device = htmlspecialchars((string) ($item['device_model_name'] ?? 'Tất cả dòng máy'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $price = htmlspecialchars((string) ($item['formatted_estimated_price'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $solution = htmlspecialchars(trim((string) ($item['solution'] ?? $item['symptom'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $time = htmlspecialchars(trim((string) ($item['estimated_time'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $row = "- <b>{$name}</b> | Thiết bị: {$device} | Chi phí dự kiến: <b>{$price}</b>"
            . ($time !== '' ? " | Thời gian: {$time}" : '');

        if ($solution !== '') {
            $row .= "\n  Hướng xử lý: {$solution}";
        }

        return $row;
    }

    protected function formatSupplierItemHtml(array $item): string
    {
        $name = htmlspecialchars((string) ($item['name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $code = htmlspecialchars((string) ($item['code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $phone = htmlspecialchars((string) ($item['phone'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $debt = htmlspecialchars((string) ($item['formatted_debt'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $purchased = htmlspecialchars((string) ($item['formatted_total_purchased'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        return "- <b>{$name}</b> (<code>{$code}</code>)"
            . ($phone !== '' ? " | SĐT: <code>{$phone}</code>" : '')
            . "\n  Công nợ hiện tại: <b>{$debt}</b> | Tổng tiền đã nhập: <b>{$purchased}</b>";
    }

    protected function formatGoodsReceiptItemHtml(array $item): string
    {
        $code = htmlspecialchars((string) ($item['code'] ?? $item['receipt_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $supplier = htmlspecialchars((string) ($item['supplier_name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $branch = htmlspecialchars((string) ($item['branch_name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $total = htmlspecialchars((string) ($item['formatted_total_amount'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $paid = htmlspecialchars((string) ($item['formatted_paid_amount'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $debt = htmlspecialchars((string) ($item['formatted_debt_amount'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $statusLabel = htmlspecialchars((string) ($item['status_label'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $receivedAt = htmlspecialchars((string) ($item['received_at'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        return "- Mã phiếu: <code>{$code}</code> | Nhà cung cấp: <b>{$supplier}</b> | Chi nhánh: {$branch}"
            . "\n  Tổng tiền: <b>{$total}</b> | Đã trả: {$paid} | Ghi nợ: <b>{$debt}</b> | Trạng thái: <b>{$statusLabel}</b> ({$receivedAt})";
    }

    protected function formatSupplierDebtTxItemHtml(array $item): string
    {
        $code = htmlspecialchars((string) ($item['transaction_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $supplier = htmlspecialchars((string) ($item['supplier_name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $typeLabel = htmlspecialchars((string) ($item['type_label'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $amount = htmlspecialchars((string) ($item['formatted_amount'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $balanceAfter = htmlspecialchars((string) ($item['formatted_balance_after'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $note = htmlspecialchars(trim((string) ($item['note'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $createdAt = htmlspecialchars((string) ($item['created_at'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $row = "- Mã GD: <code>{$code}</code> | NCC: <b>{$supplier}</b> | Loại: <b>{$typeLabel}</b>"
            . "\n  Số tiền: <b>{$amount}</b> | Dư nợ sau GD: <b>{$balanceAfter}</b> | Thời gian: {$createdAt}";

        if ($note !== '') {
            $row .= "\n  Ghi chú: {$note}";
        }

        return $row;
    }

    /**
     * Định dạng HTML cho danh sách hoặc một bản ghi ca làm việc (work_shifts).
     */
    public function formatWorkShiftsHtml(array $data): string
    {
        if (isset($data['items']) || isset($data['work_shifts']) || isset($data['total_matched'])) {
            return $this->formatHtml(array_merge(['entity' => 'work_shifts'], $data));
        }

        if (isset($data['shift_code'])) {
            return $this->formatWorkShiftItemHtml($data);
        }

        $rows = [];
        foreach ($data as $item) {
            if (is_array($item) && isset($item['shift_code'])) {
                $rows[] = $this->formatWorkShiftItemHtml($item);
            }
        }

        return implode("\n", $rows);
    }

    protected function formatWorkShiftItemHtml(array $item): string
    {
        $shiftCode = htmlspecialchars((string) ($item['shift_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $userName = htmlspecialchars((string) ($item['user_name'] ?? $item['cashier_name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $closedByName = htmlspecialchars(trim((string) ($item['closed_by_name'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $branchName = htmlspecialchars((string) ($item['branch_name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $statusLabel = htmlspecialchars((string) ($item['status_label'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $openedAt = htmlspecialchars((string) ($item['opened_at'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $closedAt = htmlspecialchars(trim((string) ($item['closed_at'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $isRedacted = ! empty($item['cash_fields_redacted'])
            || ! empty($item['cash_fields_hidden'])
            || (! array_key_exists('formatted_opening_cash', $item) && ($item['opening_cash'] ?? null) === null);

        if ($isRedacted) {
            return "- Ca: <code>{$shiftCode}</code> | Nhân viên: <b>{$userName}</b>"
                . ($closedByName !== '' ? " | Chốt ca: <b>{$closedByName}</b>" : '')
                . " | Chi nhánh: <b>{$branchName}</b> | Trạng thái: <b>{$statusLabel}</b>"
                . "\n  Mở ca: {$openedAt}" . ($closedAt !== '' ? " | Đóng ca: {$closedAt}" : '')
                . " | Đối soát két tiền: <i>🔒 Đã ẩn (Chỉ Admin/Thu ngân)</i>";
        }

        $opening = htmlspecialchars((string) ($item['formatted_opening_cash'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $expected = htmlspecialchars((string) ($item['formatted_expected_cash'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $closing = htmlspecialchars((string) ($item['formatted_closing_cash'] ?? 'Chưa chốt ca'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $diff = htmlspecialchars((string) ($item['formatted_difference_amount'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $notes = htmlspecialchars(trim((string) ($item['notes'] ?? $item['reconciliation_notes'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $row = "- Ca: <code>{$shiftCode}</code> | Nhân viên: <b>{$userName}</b> | Chi nhánh: <b>{$branchName}</b> | Trạng thái: <b>{$statusLabel}</b>"
            . "\n  Đầu ca: {$opening} | Hệ thống tính: {$expected} | Thực kiểm: <b>{$closing}</b> | Chênh lệch: <b>{$diff}</b> | Mở ca: {$openedAt}"
            . ($closedAt !== '' ? " | Đóng ca: {$closedAt}" : '');

        if ($notes !== '') {
            $row .= "\n  Ghi chú đối soát: {$notes}";
        }

        return $row;
    }

    protected function formatCustomerItemHtml(array $item): string
    {
        $name = htmlspecialchars((string) ($item['name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $phone = htmlspecialchars((string) ($item['phone'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $ordersCount = (int) ($item['orders_count'] ?? 0);
        $totalSpent = htmlspecialchars((string) ($item['formatted_total_spent'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $address = htmlspecialchars(trim((string) ($item['address'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $row = "- Khách hàng: <b>{$name}</b>" . ($phone !== '' ? " - <code>{$phone}</code>" : '')
            . " | Số lần sửa: <b>{$ordersCount} đơn</b> | Tổng chi tiêu: <b>{$totalSpent}</b>";

        if ($address !== '') {
            $row .= "\n  Địa chỉ: {$address}";
        }

        return $row;
    }

    protected function formatQcInspectionItemHtml(array $item): string
    {
        $orderCode = htmlspecialchars((string) ($item['order_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $inspector = htmlspecialchars((string) ($item['inspector_name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $resultLabel = htmlspecialchars((string) ($item['result_label'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $inspectedAt = htmlspecialchars((string) ($item['inspected_at'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $notes = htmlspecialchars(trim((string) ($item['notes'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $row = "- Đơn hàng: <code>{$orderCode}</code> | Người kiểm định: <b>{$inspector}</b> | Kết quả: <b>{$resultLabel}</b> | Thời gian: {$inspectedAt}";

        if ($notes !== '') {
            $row .= "\n  Ghi chú QC: {$notes}";
        }

        return $row;
    }

    protected function formatShipmentItemHtml(array $item): string
    {
        $orderCode = htmlspecialchars((string) ($item['order_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $carrier = htmlspecialchars((string) ($item['carrier'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $tracking = htmlspecialchars((string) ($item['tracking_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $statusLabel = htmlspecialchars((string) ($item['status_label'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $cod = htmlspecialchars((string) ($item['formatted_cod_amount'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $recipientName = htmlspecialchars((string) ($item['recipient_name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $recipientPhone = htmlspecialchars((string) ($item['recipient_phone'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        return "- Đơn hàng: <code>{$orderCode}</code> | Đơn vị VC: <b>{$carrier}</b>"
            . ($tracking !== '' ? " | Mã vận đơn: <code>{$tracking}</code>" : '')
            . "\n  Người nhận: <b>{$recipientName}</b>" . ($recipientPhone !== '' ? " (<code>{$recipientPhone}</code>)" : '')
            . " | Thu hộ COD: <b>{$cod}</b> | Trạng thái: <b>{$statusLabel}</b>";
    }
}
