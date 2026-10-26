<?php

namespace App\Services\TelegramAi\Tools;

use App\Models\Branch;
use App\Models\CashTransaction;
use App\Models\CommonIssue;
use App\Models\Customer;
use App\Models\GoodsReceipt;
use App\Models\Part;
use App\Models\Payment;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\RepairService;
use App\Models\Shipment;
use App\Models\Supplier;
use App\Models\SupplierDebtTransaction;
use App\Models\TelegramRecipient;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use App\Models\WorkShift;
use App\Services\TelegramAi\Contracts\TelegramAiToolInterface;
use App\Services\TelegramAi\TelegramAiAssistantService;
use Carbon\Carbon;

class FallbackSchemaQueryTool implements TelegramAiToolInterface
{
    /**
     * Danh sách 16 bảng nghiệp vụ cốt lõi được phép truy vấn chỉ đọc và thống kê động (Allow-list).
     *
     * @var array<int, string>
     */
    public const ALLOWED_ENTITIES = [
        'repair_orders',
        'warranties',
        'warranty_claims',
        'payments',
        'cash_transactions',
        'parts',
        'users',
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
     * Các thực thể tài chính/nhà cung cấp/sổ quỹ nhạy cảm chỉ dành riêng cho Quản trị viên (admin / super_admin).
     *
     * @var array<int, string>
     */
    public const ADMIN_ONLY_ENTITIES = [
        'suppliers',
        'goods_receipts',
        'supplier_debt_transactions',
        'payments',
        'cash_transactions',
    ];

    /**
     * Danh sách các giá trị sort_by hợp lệ.
     *
     * @var array<int, string>
     */
    public const ALLOWED_SORT_BY = [
        'latest',
        'oldest',
        'debt_desc',
        'orders_desc',
        'price_asc',
        'price_desc',
        'cash_diff_desc',
        'spent_desc',
        'name_asc',
        'metric_desc',
        'metric_asc',
        'count_desc',
        'sum_desc',
    ];

    /**
     * Danh sách các hàm thống kê động (Smart Aggregation Mode) hợp lệ.
     *
     * @var array<int, string>
     */
    public const ALLOWED_AGGREGATE_FUNCTIONS = [
        'count',
        'sum',
        'avg',
        'max',
        'min',
    ];

    /**
     * Danh sách các chiều gom nhóm (group_by) hợp lệ trong chế độ thống kê động.
     *
     * @var array<int, string>
     */
    public const ALLOWED_GROUP_BY = [
        'status',
        'order_type',
        'technician',
        'customer',
        'branch',
        'device_category',
        'payment_method',
        'category',
        'type',
        'result',
        'role',
        'day',
        'month',
    ];

    /**
     * Allow-list các trường số được phép đưa vào aggregate_field theo từng bảng.
     *
     * @var array<string, array<int, string>>
     */
    public const ALLOWED_AGGREGATE_FIELDS = [
        'repair_orders'              => ['id', 'total_price', 'initial_price', 'deposit_amount', 'discount_amount'],
        'warranties'                 => ['id', 'duration_days'],
        'warranty_claims'            => ['id'],
        'payments'                   => ['id', 'amount', 'refund_amount'],
        'cash_transactions'          => ['id', 'amount'],
        'parts'                      => ['id', 'stock_quantity', 'cost_price', 'retail_price', 'min_stock_alert'],
        'users'                      => ['id'],
        'repair_services'            => ['id', 'base_price', 'default_warranty_days'],
        'common_issues'              => ['id', 'estimated_cost'],
        'suppliers'                  => ['id', 'debt_balance'],
        'goods_receipts'             => ['id', 'total_amount', 'discount_amount', 'final_amount', 'paid_amount', 'debt_amount'],
        'supplier_debt_transactions' => ['id', 'amount', 'debt_before', 'debt_after'],
        'work_shifts'                => ['id', 'opening_cash', 'expected_cash', 'actual_cash', 'difference_amount'],
        'customers'                  => ['id', 'orders_count', 'total_spent'],
        'qc_inspections'             => ['id'],
        'shipments'                  => ['id', 'cod_amount', 'shipping_fee'],
    ];

    /**
     * Danh sách các trường tiền tệ nhạy cảm không cho phép vai trò technician truy vấn hoặc thống kê.
     *
     * @var array<int, string>
     */
    public const MONETARY_AGGREGATE_FIELDS = [
        'total_price',
        'initial_price',
        'deposit_amount',
        'discount_amount',
        'amount',
        'refund_amount',
        'cost_price',
        'retail_price',
        'base_price',
        'estimated_cost',
        'debt_balance',
        'total_amount',
        'final_amount',
        'paid_amount',
        'debt_amount',
        'debt_before',
        'debt_after',
        'opening_cash',
        'expected_cash',
        'actual_cash',
        'difference_amount',
        'total_spent',
        'cod_amount',
        'shipping_fee',
    ];

    public function name(): string
    {
        return 'fallback_schema_query';
    }

    public function description(): string
    {
        return 'Tool dự phòng và thống kê động vạn năng (Smart Aggregation & Read-only Schema Query) trên 16 bảng nghiệp vụ cốt lõi: repair_orders, warranties, warranty_claims, payments (Admin), cash_transactions (Admin), parts, users, repair_services, common_issues, suppliers (Admin), goods_receipts (Admin), supplier_debt_transactions (Admin), work_shifts, customers, qc_inspections, shipments. Hỗ trợ cả tra cứu danh sách lẫn thống kê động (aggregate_function: count/sum/avg/max/min, aggregate_field, group_by: status/order_type/technician/customer/branch/device_category/payment_method/category/type/result/role/day/month) cho các câu hỏi nằm ngoài phạm vi 5 Tool chuyên biệt.';
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
                    'description' => 'Tên bảng nghiệp vụ cần tra cứu hoặc thống kê (bắt buộc thuộc allow-list 16 bảng): repair_orders (đơn sửa chữa), warranties (phiếu bảo hành), warranty_claims (lịch sử tiếp nhận bảo hành), payments (thanh toán đơn sửa - chỉ Admin), cash_transactions (sổ quỹ thu chi - chỉ Admin), parts (linh kiện tồn kho), users (nhân sự cửa hàng), repair_services (bảng giá dịch vụ), common_issues (lỗi thường gặp), suppliers (nhà cung cấp & dư nợ - chỉ Admin), goods_receipts (phiếu nhập kho - chỉ Admin), supplier_debt_transactions (lịch sử công nợ NCC - chỉ Admin), work_shifts (ca làm việc & đối soát két tiền), customers (khách hàng), qc_inspections (kiểm định QC), shipments (vận đơn giao nhận/COD).',
                ],
                'keyword' => [
                    'type'        => 'STRING',
                    'description' => 'Từ khóa tìm kiếm theo tên, mã, số điện thoại, dòng máy, ghi chú hoặc mã vận đơn.',
                ],
                'status' => [
                    'type'        => 'STRING',
                    'description' => 'Trạng thái cần lọc (ví dụ: completed/in_repair/waiting_tech cho repair_orders; active/expired cho warranties; paid/pending cho payments; income/expense cho cash_transactions; open/closed cho work_shifts; pass/fail cho qc_inspections; pending/shipping/delivered cho shipments).',
                ],
                'date_from' => [
                    'type'        => 'STRING',
                    'description' => 'Ngày bắt đầu lọc dữ liệu (hỗ trợ YYYY-MM-DD, DD/MM/YYYY hoặc DD/MM).',
                ],
                'date_to' => [
                    'type'        => 'STRING',
                    'description' => 'Ngày kết thúc lọc dữ liệu (hỗ trợ YYYY-MM-DD, DD/MM/YYYY hoặc DD/MM).',
                ],
                'aggregate_function' => [
                    'type'        => 'STRING',
                    'enum'        => self::ALLOWED_AGGREGATE_FUNCTIONS,
                    'description' => 'Hàm thống kê động (Smart Aggregation Mode): count (đếm số bản ghi), sum (tổng), avg (trung bình), max (lớn nhất), min (nhỏ nhất). Bỏ trống nếu chỉ muốn lấy danh sách bản ghi.',
                ],
                'aggregate_field' => [
                    'type'        => 'STRING',
                    'description' => 'Tên trường số cần tính tổng/trung bình/max/min (ví dụ: total_price trên repair_orders; amount trên payments/cash_transactions; stock_quantity/retail_price/cost_price trên parts; debt_balance trên suppliers; final_amount/debt_amount trên goods_receipts; difference_amount trên work_shifts; total_spent/orders_count trên customers; cod_amount trên shipments).',
                ],
                'group_by' => [
                    'type'        => 'STRING',
                    'enum'        => self::ALLOWED_GROUP_BY,
                    'description' => 'Chiều gom nhóm thống kê động: status, order_type, technician, customer, branch, device_category, payment_method, category, type, result, role, day, month.',
                ],
                'sort_by' => [
                    'type'        => 'STRING',
                    'enum'        => self::ALLOWED_SORT_BY,
                    'description' => 'Tiêu chí sắp xếp: latest (mới nhất), oldest (cũ nhất), debt_desc (công nợ cao nhất), orders_desc (nhiều đơn nhất), price_asc (giá/tiền thấp đến cao), price_desc (giá/tiền cao đến thấp), cash_diff_desc (lệch tiền mặt ca lớn nhất), metric_desc (chỉ số thống kê cao đến thấp), metric_asc (chỉ số thống kê thấp đến cao).',
                ],
                'limit' => [
                    'type'        => 'INTEGER',
                    'description' => 'Số lượng bản ghi hoặc nhóm tối đa trả về (mặc định 5, tối đa 20).',
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

        // 1. Kiểm tra Allow-list 16 bảng nghiệp vụ cốt lõi
        if ($entity === '' || ! in_array($entity, self::ALLOWED_ENTITIES, true)) {
            return [
                'error'            => "Thực thể '{$entity}' không nằm trong danh sách cho phép tra cứu. Chỉ hỗ trợ: " . implode(', ', self::ALLOWED_ENTITIES) . '.',
                'invalid_entity'   => true,
                'allowed_entities' => self::ALLOWED_ENTITIES,
            ];
        }

        // 2. Kiểm tra phân quyền target_role đối với các bảng tài chính/nhà cung cấp/sổ quỹ nhạy cảm
        $role = strtolower(trim((string) ($recipient->target_role ?? '')));
        if (in_array($entity, self::ADMIN_ONLY_ENTITIES, true) && ! in_array($role, ['admin', 'super_admin'], true)) {
            $deniedMessage = in_array($entity, ['payments', 'cash_transactions'], true)
                ? 'Bạn không có quyền truy cập dữ liệu thu chi, thanh toán và sổ quỹ.'
                : 'Bạn không có quyền truy cập dữ liệu nhà cung cấp, phiếu nhập kho và công nợ.';

            return [
                'error'             => $deniedMessage,
                'permission_denied' => true,
            ];
        }

        $keyword = $this->scalarString($args['keyword'] ?? '');
        $status = strtolower($this->scalarString($args['status'] ?? ''));
        $rawDateFrom = $this->scalarString($args['date_from'] ?? '');
        $rawDateTo = $this->scalarString($args['date_to'] ?? '');
        $aggregateFunction = strtolower($this->scalarString($args['aggregate_function'] ?? ''));
        $aggregateField = strtolower($this->scalarString($args['aggregate_field'] ?? ''));
        $groupBy = strtolower($this->scalarString($args['group_by'] ?? ''));
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

        // 3. Nếu có truyền aggregate_function hoặc group_by -> Chuyển sang chế độ Thống kê động (Smart Aggregation Mode)
        if ($aggregateFunction !== '' || $groupBy !== '') {
            return $this->executeAggregation(
                $entity,
                $recipient,
                $branchDisplay,
                $keyword,
                $status,
                $startDate,
                $endDate,
                $aggregateFunction,
                $aggregateField,
                $groupBy,
                $sortBy,
                $limit
            );
        }

        [$totalMatched, $items] = match ($entity) {
            'repair_orders'              => $this->queryRepairOrders($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, $sortBy, $limit),
            'warranties'                 => $this->queryWarranties($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, $sortBy, $limit),
            'warranty_claims'            => $this->queryWarrantyClaims($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, $sortBy, $limit),
            'payments'                   => $this->queryPayments($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, $sortBy, $limit),
            'cash_transactions'          => $this->queryCashTransactions($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, $sortBy, $limit),
            'parts'                      => $this->queryParts($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, $sortBy, $limit),
            'users'                      => $this->queryUsers($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, $sortBy, $limit),
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

        if (in_array($entity, ['repair_orders', 'parts', 'repair_services'], true) && in_array($role, ['technician', 'tech'], true)) {
            $response['financial_fields_redacted'] = true;
        }

        return $response;
    }

    /**
     * Nhãn tiếng Việt cho từng bảng nghiệp vụ.
     */
    public static function resolveEntityLabel(string $entity): string
    {
        return match ($entity) {
            'repair_orders'              => 'Danh sách đơn sửa chữa',
            'warranties'                 => 'Danh sách phiếu bảo hành',
            'warranty_claims'            => 'Lịch sử tiếp nhận bảo hành (Warranty Claims)',
            'payments'                   => 'Lịch sử giao dịch thanh toán đơn hàng',
            'cash_transactions'          => 'Sổ quỹ thu chi cửa hàng',
            'parts'                      => 'Danh mục linh kiện & tồn kho',
            'users'                      => 'Danh sách nhân sự cửa hàng',
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
        $role = strtolower(trim((string) ($recipient->target_role ?? '')));
        $canViewPrice = ! in_array($role, ['technician', 'tech'], true);

        $items = $records->map(function (RepairService $service) use ($canViewPrice): array {
            $basePrice = (float) ($service->base_price ?? 0);
            $warrantyDays = (int) ($service->default_warranty_days ?? 0);
            $deviceName = (string) ($service->deviceModel?->name ?? 'Tất cả dòng máy');

            return [
                'id'                        => (int) $service->id,
                'code'                      => (string) ($service->code ?? ''),
                'name'                      => (string) $service->name,
                'category'                  => (string) ($service->category ?? ''),
                'device_model_name'         => $deviceName,
                'device_name'               => $deviceName,
                'base_price'                => $canViewPrice ? $basePrice : null,
                'price'                     => $canViewPrice ? $basePrice : null,
                'formatted_price'           => $canViewPrice ? $this->formatVnd($basePrice) : 'Đã ẩn (Chỉ Admin/Thu ngân)',
                'warranty_days'             => $warrantyDays,
                'default_warranty_days'     => $warrantyDays,
                'estimated_minutes'         => $service->getAttribute('estimated_minutes'),
                'description'               => (string) ($service->description ?? ''),
                'is_active'                 => (bool) $service->is_active,
                'financial_fields_redacted' => ! $canViewPrice,
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
     * 6A. Tra cứu đơn sửa chữa (repair_orders).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function queryRepairOrders(
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
        $role = strtolower(trim((string) ($recipient->target_role ?? '')));
        $canViewFinancials = ! in_array($role, ['technician', 'tech'], true);

        $query = RepairOrder::withoutGlobalScopes()
            ->with([
                'customer'      => fn ($q) => $q->withoutGlobalScopes(),
                'deviceModel'   => fn ($q) => $q->withoutGlobalScopes(),
                'branch'        => fn ($q) => $q->withoutGlobalScopes(),
                'technician'    => fn ($q) => $q->withoutGlobalScopes(),
                'createdByUser' => fn ($q) => $q->withoutGlobalScopes(),
            ])
            ->where('tenant_id', $tenantId);

        if ($branchId !== null) {
            $query->where('branch_id', $branchId);
        }

        if ($status !== '' && $status !== 'all') {
            $query->where('status', $status);
        } elseif (in_array($sortBy, ['price_desc', 'price_asc'], true)) {
            $query->whereNotIn('status', ['cancelled', 'rejected']);
        }

        if ($startDate !== null && $endDate !== null) {
            $query->whereBetween('created_at', [$startDate, $endDate]);
        }

        if ($keyword !== '') {
            $tokens = (new LookupOrderTool())->extractSearchTokens($keyword);
            if (! empty($tokens)) {
                $escaped = $this->escapeLike($keyword);
                $like = "%{$escaped}%";
                $query->where(function ($q) use ($like) {
                    $q->where('order_code', 'like', $like)
                        ->orWhere('intake_batch_code', 'like', $like)
                        ->orWhere('issue_description', 'like', $like)
                        ->orWhere('repair_note', 'like', $like)
                        ->orWhere('parts_used_summary', 'like', $like)
                        ->orWhereHas('customer', function ($cq) use ($like) {
                            $cq->withoutGlobalScopes()->where(function ($sub) use ($like) {
                                $sub->where('name', 'like', $like)
                                    ->orWhere('phone', 'like', $like);
                            });
                        })
                        ->orWhereHas('deviceModel', function ($dq) use ($like) {
                            $dq->withoutGlobalScopes()->where(function ($sub) use ($like) {
                                $sub->where('name', 'like', $like)
                                    ->orWhere('category', 'like', $like);
                            });
                        })
                        ->orWhereHas('technician', function ($tq) use ($like) {
                            $tq->withoutGlobalScopes()->where('name', 'like', $like);
                        });
                });
            }
        }

        $totalMatched = (clone $query)->count();

        if ($canViewFinancials && $sortBy === 'price_desc') {
            $query->orderByDesc('total_price')->orderByDesc('id');
        } elseif ($canViewFinancials && $sortBy === 'price_asc') {
            $query->orderBy('total_price', 'asc')->orderByDesc('id');
        } elseif ($sortBy === 'oldest') {
            $query->orderBy('created_at', 'asc')->orderBy('id', 'asc');
        } else {
            $query->orderByDesc('id');
        }

        $records = $query->limit($limit)->get();

        $items = $records->map(function (RepairOrder $order) use ($branchDisplay, $canViewFinancials): array {
            $totalPrice = (float) ($order->total_price ?? 0);
            $initialPrice = (float) ($order->initial_price ?? 0);
            $rawStatus = (string) $order->status;

            return [
                'id'                        => (int) $order->id,
                'order_code'                => (string) $order->order_code,
                'status'                    => $rawStatus,
                'status_label'              => LookupOrderTool::formatStatusLabel($rawStatus),
                'order_type'                => (string) ($order->order_type ?: 'in_store'),
                'branch_name'               => (string) ($order->branch?->name ?? $branchDisplay),
                'customer_name'             => (string) ($order->customer?->name ?? 'Khách lẻ'),
                'customer_phone'            => (string) ($order->customer?->phone ?? ''),
                'device_name'               => (string) ($order->deviceModel?->name ?? 'Thiết bị AirPods'),
                'device_category'           => LookupOrderTool::resolveDeviceCategoryLabel($order->deviceModel),
                'issue_description'         => (string) ($order->issue_description ?? ''),
                'technician_name'           => (string) ($order->technician?->name ?? 'Chưa phân công'),
                'total_price'               => $canViewFinancials ? $totalPrice : null,
                'initial_price'             => $canViewFinancials ? $initialPrice : null,
                'formatted_price'           => $canViewFinancials ? $this->formatVnd($totalPrice) : 'Đã ẩn (Chỉ Admin/Thu ngân)',
                'financial_fields_redacted' => ! $canViewFinancials,
                'created_at'                => optional($order->created_at)->format('H:i - d/m/Y'),
            ];
        })->values()->all();

        return [$totalMatched, $items];
    }

    /**
     * 6B. Tra cứu phiếu bảo hành (warranties).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function queryWarranties(
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

        $query = Warranty::withoutGlobalScopes()
            ->with([
                'repairOrder' => fn ($q) => $q->withoutGlobalScopes()->with([
                    'branch' => fn ($bq) => $bq->withoutGlobalScopes(),
                ]),
                'customer'    => fn ($q) => $q->withoutGlobalScopes(),
                'deviceModel' => fn ($q) => $q->withoutGlobalScopes(),
            ])
            ->withCount(['claims' => fn ($cq) => $cq->withoutGlobalScopes()])
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
            $query->whereBetween('created_at', [$startDate, $endDate]);
        }

        if ($keyword !== '') {
            $escaped = $this->escapeLike($keyword);
            $like = "%{$escaped}%";
            $query->where(function ($q) use ($like) {
                $q->where('warranty_code', 'like', $like)
                    ->orWhere('coverage_item', 'like', $like)
                    ->orWhereHas('repairOrder', function ($oq) use ($like) {
                        $oq->withoutGlobalScopes()->where(function ($sub) use ($like) {
                            $sub->where('order_code', 'like', $like)
                                ->orWhere('serial_imei', 'like', $like);
                        });
                    })
                    ->orWhereHas('customer', function ($cq) use ($like) {
                        $cq->withoutGlobalScopes()->where(function ($sub) use ($like) {
                            $sub->where('name', 'like', $like)
                                ->orWhere('phone', 'like', $like);
                        });
                    })
                    ->orWhereHas('deviceModel', function ($dq) use ($like) {
                        $dq->withoutGlobalScopes()->where('name', 'like', $like);
                    });
            });
        }

        $totalMatched = (clone $query)->count();
        $records = $sortBy === 'oldest'
            ? $query->orderBy('id', 'asc')->limit($limit)->get()
            : $query->orderByDesc('id')->limit($limit)->get();

        $items = $records->map(function (Warranty $warranty) use ($branchDisplay): array {
            $endDateObj = $warranty->end_date ? Carbon::parse($warranty->end_date) : null;
            $isValidNow = strtolower((string) $warranty->status) === 'active'
                && ($endDateObj === null || $endDateObj->endOfDay()->gte(now()));

            return [
                'id'             => (int) $warranty->id,
                'warranty_code'  => (string) $warranty->warranty_code,
                'order_code'     => (string) ($warranty->repairOrder?->order_code ?? ''),
                'branch_name'    => (string) ($warranty->repairOrder?->branch?->name ?? $branchDisplay),
                'customer_name'  => (string) ($warranty->customer?->name ?? 'Khách lẻ'),
                'customer_phone' => (string) ($warranty->customer?->phone ?? ''),
                'device_name'    => (string) ($warranty->deviceModel?->name ?? 'Thiết bị AirPods'),
                'coverage_item'  => (string) ($warranty->coverage_item ?? ''),
                'duration_days'  => (int) ($warranty->duration_days ?? 0),
                'start_date'     => $warranty->start_date ? Carbon::parse($warranty->start_date)->format('d/m/Y') : '',
                'end_date'       => $endDateObj?->format('d/m/Y') ?? '',
                'status'         => (string) $warranty->status,
                'is_valid_now'   => $isValidNow,
                'claims_count'   => (int) ($warranty->getAttribute('claims_count') ?? 0),
            ];
        })->values()->all();

        return [$totalMatched, $items];
    }

    /**
     * 6C. Tra cứu lịch sử tiếp nhận bảo hành (warranty_claims).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function queryWarrantyClaims(
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

        $query = WarrantyClaim::withoutGlobalScopes()
            ->with([
                'warranty' => fn ($wq) => $wq->withoutGlobalScopes()->with([
                    'repairOrder' => fn ($oq) => $oq->withoutGlobalScopes()->with([
                        'branch'     => fn ($bq) => $bq->withoutGlobalScopes(),
                        'technician' => fn ($tq) => $tq->withoutGlobalScopes(),
                    ]),
                    'customer'    => fn ($cq) => $cq->withoutGlobalScopes(),
                    'deviceModel' => fn ($dq) => $dq->withoutGlobalScopes(),
                ]),
                'reworkOrder'    => fn ($rq) => $rq->withoutGlobalScopes()->with([
                    'technician' => fn ($tq) => $tq->withoutGlobalScopes(),
                ]),
                'receivedByUser' => fn ($q) => $q->withoutGlobalScopes(),
            ])
            ->whereHas('warranty.repairOrder', function ($oq) use ($tenantId, $branchId) {
                $oq->withoutGlobalScopes()->where('tenant_id', $tenantId);
                if ($branchId !== null) {
                    $oq->where('branch_id', $branchId);
                }
            });

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
                $q->where('claim_code', 'like', $like)
                    ->orWhere('issue_description', 'like', $like)
                    ->orWhere('notes', 'like', $like)
                    ->orWhereHas('warranty', function ($wq) use ($like) {
                        $wq->withoutGlobalScopes()->where(function ($sub) use ($like) {
                            $sub->where('warranty_code', 'like', $like)
                                ->orWhereHas('repairOrder', function ($oq) use ($like) {
                                    $oq->withoutGlobalScopes()->where('order_code', 'like', $like);
                                });
                        });
                    });
            });
        }

        $totalMatched = (clone $query)->count();
        $records = $sortBy === 'oldest'
            ? $query->orderBy('id', 'asc')->limit($limit)->get()
            : $query->orderByDesc('id')->limit($limit)->get();

        $items = $records->map(function (WarrantyClaim $claim) use ($branchDisplay): array {
            $warranty = $claim->warranty;
            $repairOrder = $warranty?->repairOrder;

            return [
                'id'                => (int) $claim->id,
                'claim_code'        => (string) ($claim->claim_code ?? ''),
                'warranty_code'     => (string) ($warranty?->warranty_code ?? ''),
                'order_code'        => (string) ($repairOrder?->order_code ?? ''),
                'branch_name'       => (string) ($repairOrder?->branch?->name ?? $branchDisplay),
                'customer_name'     => (string) ($warranty?->customer?->name ?? 'Khách lẻ'),
                'device_name'       => (string) ($warranty?->deviceModel?->name ?? 'Thiết bị AirPods'),
                'issue_description' => (string) ($claim->issue_description ?? ''),
                'resolution_mode'   => (string) ($claim->resolution_mode ?? ''),
                'resolution_note'   => (string) ($claim->notes ?? ''),
                'notes'             => (string) ($claim->notes ?? ''),
                'technician_name'   => (string) ($claim->reworkOrder?->technician?->name ?? $repairOrder?->technician?->name ?? 'Chưa phân công'),
                'status'            => (string) ($claim->status ?? ''),
                'created_at'        => optional($claim->created_at)->format('H:i - d/m/Y'),
            ];
        })->values()->all();

        return [$totalMatched, $items];
    }

    /**
     * 6D. Tra cứu giao dịch thanh toán đơn hàng (payments - chỉ Admin).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function queryPayments(
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

        $query = Payment::withoutGlobalScopes()
            ->with([
                'repairOrder' => fn ($oq) => $oq->withoutGlobalScopes()->with([
                    'customer'    => fn ($cq) => $cq->withoutGlobalScopes(),
                    'branch'      => fn ($bq) => $bq->withoutGlobalScopes(),
                    'deviceModel' => fn ($dq) => $dq->withoutGlobalScopes(),
                ]),
                'receivedByUser' => fn ($uq) => $uq->withoutGlobalScopes(),
            ])
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
                $dq->whereBetween('paid_at', [$startDate, $endDate])
                    ->orWhereBetween('created_at', [$startDate, $endDate]);
            });
        }

        if ($keyword !== '') {
            $escaped = $this->escapeLike($keyword);
            $like = "%{$escaped}%";
            $query->where(function ($q) use ($like) {
                $q->where('payment_code', 'like', $like)
                    ->orWhere('transaction_ref', 'like', $like)
                    ->orWhere('payment_method', 'like', $like)
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

        if ($sortBy === 'price_desc') {
            $query->orderByDesc('amount')->orderByDesc('id');
        } elseif ($sortBy === 'price_asc') {
            $query->orderBy('amount', 'asc')->orderByDesc('id');
        } elseif ($sortBy === 'oldest') {
            $query->orderBy('id', 'asc');
        } else {
            $query->orderByDesc('paid_at')->orderByDesc('id');
        }

        $records = $query->limit($limit)->get();

        $items = $records->map(function (Payment $payment) use ($branchDisplay): array {
            $amount = (float) ($payment->amount ?? 0);
            $refund = (float) ($payment->refund_amount ?? 0);
            $netAmount = max(0.0, $amount - $refund);
            $method = strtolower(trim((string) ($payment->payment_method ?? 'cash')));
            $methodLabel = match ($method) {
                'cash'          => 'Tiền mặt',
                'bank_transfer',
                'transfer'      => 'Chuyển khoản',
                'sepay',
                'vietqr'        => 'SePay / VietQR',
                'card'          => 'Quẹt thẻ',
                default         => $method !== '' ? $method : 'Tiền mặt',
            };

            return [
                'id'                   => (int) $payment->id,
                'payment_code'         => (string) ($payment->payment_code ?? ''),
                'order_code'           => (string) ($payment->repairOrder?->order_code ?? ''),
                'branch_name'          => (string) ($payment->repairOrder?->branch?->name ?? $branchDisplay),
                'customer_name'        => (string) ($payment->repairOrder?->customer?->name ?? 'Khách lẻ'),
                'amount'               => $amount,
                'refund_amount'        => $refund,
                'net_amount'           => $netAmount,
                'formatted_amount'     => $this->formatVnd($amount),
                'formatted_net_amount' => $this->formatVnd($netAmount),
                'payment_method'       => $method,
                'payment_method_label' => $methodLabel,
                'status'               => (string) ($payment->status ?? 'paid'),
                'received_by_name'     => (string) ($payment->receivedByUser?->name ?? 'Hệ thống'),
                'paid_at'              => optional($payment->paid_at ?? $payment->created_at)->format('H:i - d/m/Y'),
                'note'                 => (string) ($payment->notes ?? ''),
            ];
        })->values()->all();

        return [$totalMatched, $items];
    }

    /**
     * 6E. Tra cứu sổ quỹ thu chi (cash_transactions - chỉ Admin).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function queryCashTransactions(
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

        $query = CashTransaction::withoutGlobalScopes()
            ->with([
                'branch'        => fn ($q) => $q->withoutGlobalScopes(),
                'createdByUser' => fn ($q) => $q->withoutGlobalScopes(),
            ])
            ->where('tenant_id', $tenantId);

        if ($branchId !== null) {
            $query->where('branch_id', $branchId);
        }

        if ($status !== '' && $status !== 'all') {
            if (in_array($status, ['in', 'income', 'thu'], true)) {
                $query->whereIn('type', ['in', 'income']);
            } elseif (in_array($status, ['out', 'expense', 'chi'], true)) {
                $query->whereIn('type', ['out', 'expense']);
            } else {
                $query->where('type', $status);
            }
        }

        if ($startDate !== null && $endDate !== null) {
            $query->whereBetween('created_at', [$startDate, $endDate]);
        }

        if ($keyword !== '') {
            $escaped = $this->escapeLike($keyword);
            $like = "%{$escaped}%";
            $query->where(function ($q) use ($like) {
                $q->where('transaction_code', 'like', $like)
                    ->orWhere('category', 'like', $like)
                    ->orWhere('notes', 'like', $like)
                    ->orWhere('recipient_payer', 'like', $like)
                    ->orWhere('payment_method', 'like', $like);
            });
        }

        $totalMatched = (clone $query)->count();

        if ($sortBy === 'price_desc') {
            $query->orderByDesc('amount')->orderByDesc('id');
        } elseif ($sortBy === 'price_asc') {
            $query->orderBy('amount', 'asc')->orderByDesc('id');
        } elseif ($sortBy === 'oldest') {
            $query->orderBy('id', 'asc');
        } else {
            $query->orderByDesc('id');
        }

        $records = $query->limit($limit)->get();

        $items = $records->map(function (CashTransaction $tx) use ($branchDisplay): array {
            $amount = (float) ($tx->amount ?? 0);
            $rawType = strtolower(trim((string) ($tx->type ?? 'in')));
            $isIncome = in_array($rawType, ['in', 'income'], true);

            return [
                'id'               => (int) $tx->id,
                'transaction_code' => (string) ($tx->transaction_code ?? ''),
                'type'             => $rawType,
                'type_label'       => $isIncome ? 'Phiếu thu' : 'Phiếu chi',
                'category'         => (string) ($tx->category ?? ''),
                'amount'           => $amount,
                'formatted_amount' => $this->formatVnd($amount),
                'payment_method'   => (string) ($tx->payment_method ?? 'cash'),
                'order_code'       => '',
                'branch_name'      => (string) ($tx->branch?->name ?? $branchDisplay),
                'created_by_name'  => (string) ($tx->createdByUser?->name ?? 'Hệ thống'),
                'description'      => (string) ($tx->notes ?: ($tx->recipient_payer ?? '')),
                'transaction_date' => optional($tx->created_at)->format('d/m/Y'),
            ];
        })->values()->all();

        return [$totalMatched, $items];
    }

    /**
     * 6F. Tra cứu linh kiện & tồn kho (parts).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function queryParts(
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
        $role = strtolower(trim((string) ($recipient->target_role ?? '')));
        $canViewCostPrice = in_array($role, ['admin', 'super_admin'], true);
        $canViewRetailPrice = ! in_array($role, ['technician', 'tech'], true);

        $query = Part::withoutGlobalScopes()
            ->with([
                'branchParts' => fn ($q) => $q->withoutGlobalScopes()->with([
                    'branch' => fn ($bq) => $bq->withoutGlobalScopes(),
                ]),
            ])
            ->where('tenant_id', $tenantId);

        if ($status === 'low_stock') {
            $query->whereColumn('stock_quantity', '<=', 'min_stock_alert');
        } elseif ($status === 'out_of_stock') {
            $query->where('stock_quantity', '<=', 0);
        } elseif ($status === 'inactive') {
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
                $q->where('sku', 'like', $like)
                    ->orWhere('name', 'like', $like)
                    ->orWhere('category', 'like', $like)
                    ->orWhere('compatible_models', 'like', $like)
                    ->orWhere('storage_location', 'like', $like);
            });
        }

        $totalMatched = (clone $query)->count();

        if ($canViewRetailPrice && $sortBy === 'price_desc') {
            $query->orderByDesc('retail_price')->orderByDesc('id');
        } elseif ($canViewRetailPrice && $sortBy === 'price_asc') {
            $query->orderBy('retail_price', 'asc')->orderByDesc('id');
        } elseif ($sortBy === 'name_asc') {
            $query->orderBy('name', 'asc');
        } elseif ($sortBy === 'oldest') {
            $query->orderBy('id', 'asc');
        } else {
            $query->orderBy('stock_quantity', 'asc')->orderByDesc('id');
        }

        $records = $query->limit($limit)->get();

        $items = $records->map(function (Part $part) use ($branchId, $branchDisplay, $canViewCostPrice, $canViewRetailPrice): array {
            $costPrice = (float) ($part->cost_price ?? 0);
            $retailPrice = (float) ($part->retail_price ?? 0);
            $matchedBranchPart = $branchId !== null
                ? $part->branchParts?->firstWhere('branch_id', $branchId)
                : $part->branchParts?->first();
            $stockQty = $matchedBranchPart !== null
                ? (int) ($matchedBranchPart->stock_quantity ?? $part->stock_quantity ?? 0)
                : (int) ($part->stock_quantity ?? 0);
            $minStock = $matchedBranchPart !== null
                ? (int) ($matchedBranchPart->min_stock_alert ?? $part->min_stock_alert ?? 0)
                : (int) ($part->min_stock_alert ?? 0);
            $sku = (string) ($part->sku ?? '');

            return [
                'id'                        => (int) $part->id,
                'code'                      => $sku,
                'sku'                       => $sku,
                'name'                      => (string) $part->name,
                'category'                  => (string) ($part->category ?? ''),
                'compatible_models'         => (string) ($part->compatible_models ?? ''),
                'device_name'               => (string) ($part->compatible_models ?: 'Dùng chung'),
                'branch_name'               => (string) ($matchedBranchPart?->branch?->name ?? $branchDisplay),
                'stock_quantity'            => $stockQty,
                'min_stock_alert'           => $minStock,
                'unit'                      => (string) ($part->unit ?: 'cái'),
                'storage_location'          => (string) ($part->storage_location ?? ''),
                'cost_price'                => $canViewCostPrice ? $costPrice : null,
                'formatted_cost_price'      => $canViewCostPrice ? $this->formatVnd($costPrice) : 'Đã ẩn',
                'retail_price'              => $canViewRetailPrice ? $retailPrice : null,
                'formatted_retail_price'    => $canViewRetailPrice ? $this->formatVnd($retailPrice) : 'Đã ẩn',
                'financial_fields_redacted' => ! $canViewRetailPrice,
                'is_active'                 => (bool) $part->is_active,
            ];
        })->values()->all();

        return [$totalMatched, $items];
    }

    /**
     * 6G. Tra cứu danh sách nhân sự cửa hàng (users - tuyệt đối ẩn password, remember_token).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function queryUsers(
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

        $query = User::withoutGlobalScopes()
            ->select([
                'id',
                'tenant_id',
                'branch_id',
                'name',
                'email',
                'phone',
                'role',
                'is_active',
                'created_at',
            ])
            ->with(['branch' => fn ($q) => $q->withoutGlobalScopes()])
            ->where('tenant_id', $tenantId);

        if ($branchId !== null) {
            $query->where(function ($bq) use ($branchId) {
                $bq->where('branch_id', $branchId)
                    ->orWhereNull('branch_id');
            });
        }

        if ($status === 'inactive') {
            $query->where('is_active', false);
        } elseif (in_array($status, ['admin', 'super_admin', 'technician', 'tech', 'receptionist'], true)) {
            $query->where('role', $status);
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
                    ->orWhere('email', 'like', $like)
                    ->orWhere('phone', 'like', $like)
                    ->orWhere('role', 'like', $like);
            });
        }

        $totalMatched = (clone $query)->count();

        if ($sortBy === 'name_asc') {
            $query->orderBy('name', 'asc');
        } elseif ($sortBy === 'oldest') {
            $query->orderBy('id', 'asc');
        } else {
            $query->orderByDesc('id');
        }

        $records = $query->limit($limit)->get();

        $items = $records->map(function (User $user) use ($branchDisplay): array {
            $role = strtolower(trim((string) ($user->role ?? 'technician')));
            $roleLabel = match ($role) {
                'super_admin'  => 'Super Admin',
                'admin'        => 'Quản trị viên (Admin)',
                'receptionist' => 'Lễ tân / Thu ngân',
                'technician',
                'tech'         => 'Kỹ thuật viên',
                default        => $role,
            };

            return [
                'id'          => (int) $user->id,
                'name'        => (string) $user->name,
                'email'       => (string) ($user->email ?? ''),
                'phone'       => (string) ($user->phone ?? ''),
                'role'        => $role,
                'role_label'  => $roleLabel,
                'branch_id'   => $user->branch_id !== null ? (int) $user->branch_id : null,
                'branch_name' => (string) ($user->branch?->name ?? $branchDisplay),
                'is_active'   => (bool) $user->is_active,
                'created_at'  => optional($user->created_at)->format('d/m/Y'),
            ];
        })->values()->all();

        return [$totalMatched, $items];
    }

    /**
     * Thực thi chế độ Thống kê động (Smart Aggregation Mode) cho 16 bảng nghiệp vụ.
     */
    protected function executeAggregation(
        string $entity,
        TelegramRecipient $recipient,
        string $branchDisplay,
        string $keyword,
        string $status,
        ?Carbon $startDate,
        ?Carbon $endDate,
        string $aggregateFunction,
        string $aggregateField,
        string $groupBy,
        string $sortBy,
        int $limit
    ): array {
        $fn = $aggregateFunction !== '' ? $aggregateFunction : 'count';
        if (! in_array($fn, self::ALLOWED_AGGREGATE_FUNCTIONS, true)) {
            return [
                'error'                    => "Hàm thống kê '{$fn}' không hợp lệ. Chỉ hỗ trợ: " . implode(', ', self::ALLOWED_AGGREGATE_FUNCTIONS) . '.',
                'invalid_aggregate_config' => true,
            ];
        }

        if ($groupBy !== '' && ! in_array($groupBy, self::ALLOWED_GROUP_BY, true)) {
            return [
                'error'                    => "Chiều gom nhóm '{$groupBy}' không hợp lệ. Chỉ hỗ trợ: " . implode(', ', self::ALLOWED_GROUP_BY) . '.',
                'invalid_aggregate_config' => true,
            ];
        }

        $resolvedField = $this->resolveAggregateField($entity, $fn, $aggregateField);
        if ($resolvedField === null) {
            $allowedForEntity = self::ALLOWED_AGGREGATE_FIELDS[$entity] ?? ['id'];

            return [
                'error'                    => "Trường thống kê '{$aggregateField}' không hợp lệ cho bảng '{$entity}'. Các trường cho phép: " . implode(', ', $allowedForEntity) . '.',
                'invalid_aggregate_config' => true,
                'allowed_aggregate_fields' => $allowedForEntity,
            ];
        }

        $role = strtolower(trim((string) ($recipient->target_role ?? '')));
        $isMonetaryField = in_array($resolvedField, self::MONETARY_AGGREGATE_FIELDS, true);

        if (in_array($role, ['technician', 'tech'], true) && $fn !== 'count' && $isMonetaryField) {
            return [
                'error'             => 'Bạn không có quyền thống kê các chỉ số tài chính, doanh thu và giá tiền.',
                'permission_denied' => true,
            ];
        }

        if ($role === 'receptionist' && $fn !== 'count' && $resolvedField === 'cost_price') {
            return [
                'error'             => 'Bạn không có quyền thống kê giá vốn linh kiện.',
                'permission_denied' => true,
            ];
        }

        // Lấy danh sách bản ghi đã áp dụng đầy đủ bộ lọc tenant_id, branch_id, keyword, status, date_from/date_to (tối đa 1000 bản ghi để gom nhóm chính xác)
        $effectiveStatus = $status;
        if ($entity === 'repair_orders' && $effectiveStatus === '') {
            // Mặc định loại trừ đơn đã hủy/từ chối khi thống kê doanh thu/giá trị hoặc gom nhóm trên repair_orders
            $effectiveStatus = '__exclude_cancelled_rejected__';
        }

        [, $rawItems] = $this->fetchItemsForAggregation(
            $entity,
            $recipient,
            $branchDisplay,
            $keyword,
            $effectiveStatus,
            $startDate,
            $endDate
        );

        $totalRecords = count($rawItems);
        $values = array_map(
            fn (array $item): float => $this->extractRecordMetricValue($item, $resolvedField),
            $rawItems
        );

        $overallValue = $this->computeScalarAggregate($fn, $values, $totalRecords);
        $isMonetaryMetric = $fn !== 'count' && $isMonetaryField;
        $formattedOverall = $isMonetaryMetric
            ? $this->formatVnd($overallValue)
            : (floor($overallValue) == $overallValue ? number_format($overallValue, 0, ',', '.') : number_format($overallValue, 2, ',', '.'));

        $groups = [];
        $comparisonSummary = null;

        if ($groupBy !== '') {
            $buckets = [];
            foreach ($rawItems as $item) {
                $groupLabel = $this->extractRecordGroupDimension($entity, $item, $groupBy, $branchDisplay);
                if (! isset($buckets[$groupLabel])) {
                    $buckets[$groupLabel] = [
                        'group_key'   => $groupLabel,
                        'group_label' => $groupLabel,
                        'values'      => [],
                        'count'       => 0,
                    ];
                }
                $buckets[$groupLabel]['count']++;
                $buckets[$groupLabel]['values'][] = $this->extractRecordMetricValue($item, $resolvedField);
            }

            $totalForShare = 0.0;
            foreach ($buckets as $key => $bucket) {
                $metricVal = $this->computeScalarAggregate($fn, $bucket['values'], $bucket['count']);
                $sumVal = array_sum($bucket['values']);
                $avgVal = $bucket['count'] > 0 ? round($sumVal / $bucket['count'], 2) : 0.0;
                $maxVal = ! empty($bucket['values']) ? max($bucket['values']) : 0.0;
                $minVal = ! empty($bucket['values']) ? min($bucket['values']) : 0.0;

                $buckets[$key]['metric_value'] = $metricVal;
                $buckets[$key]['sum'] = $isMonetaryField && in_array($role, ['technician', 'tech'], true) ? null : $sumVal;
                $buckets[$key]['avg'] = $isMonetaryField && in_array($role, ['technician', 'tech'], true) ? null : $avgVal;
                $buckets[$key]['max'] = $isMonetaryField && in_array($role, ['technician', 'tech'], true) ? null : $maxVal;
                $buckets[$key]['min'] = $isMonetaryField && in_array($role, ['technician', 'tech'], true) ? null : $minVal;
                $buckets[$key]['formatted_metric_value'] = $isMonetaryMetric
                    ? $this->formatVnd($metricVal)
                    : (floor($metricVal) == $metricVal ? number_format($metricVal, 0, ',', '.') : number_format($metricVal, 2, ',', '.'));

                if ($metricVal > 0) {
                    $totalForShare += $metricVal;
                }
            }

            $groupList = array_values($buckets);
            foreach ($groupList as &$g) {
                unset($g['values']);
                $g['share_percent'] = $totalForShare > 0
                    ? round((max(0.0, (float) $g['metric_value']) / $totalForShare) * 100, 1)
                    : 0.0;
            }
            unset($g);

            $ascending = in_array($sortBy, ['metric_asc', 'price_asc', 'oldest'], true);
            usort($groupList, static function (array $a, array $b) use ($ascending, $sortBy): int {
                if ($sortBy === 'count_desc' || $sortBy === 'orders_desc') {
                    if ($b['count'] !== $a['count']) {
                        return $b['count'] <=> $a['count'];
                    }
                }
                if ((float) $a['metric_value'] !== (float) $b['metric_value']) {
                    return $ascending
                        ? ((float) $a['metric_value'] <=> (float) $b['metric_value'])
                        : ((float) $b['metric_value'] <=> (float) $a['metric_value']);
                }

                return $b['count'] <=> $a['count'];
            });

            $groups = array_slice($groupList, 0, $limit);

            if (! empty($groups)) {
                $top = $groups[0];
                $second = $groups[1] ?? null;
                $comparisonSummary = [
                    'top_group'                => $top['group_label'],
                    'top_metric_value'         => $top['metric_value'],
                    'formatted_top_metric'     => $top['formatted_metric_value'],
                    'top_count'                => $top['count'],
                    'top_share_percent'        => $top['share_percent'],
                    'second_group'             => $second['group_label'] ?? null,
                    'second_metric_value'      => $second['metric_value'] ?? null,
                    'formatted_second_metric'  => $second['formatted_metric_value'] ?? null,
                    'difference_from_second'   => $second !== null ? round((float) $top['metric_value'] - (float) $second['metric_value'], 2) : null,
                ];
            }
        }

        return [
            'mode'               => 'aggregation',
            'entity'             => $entity,
            'entity_label'       => self::resolveEntityLabel($entity),
            'branch_name'        => $branchDisplay,
            'branch_scope'       => $branchDisplay,
            'filters_applied'    => [
                'entity'             => $entity,
                'keyword'            => $keyword !== '' ? $keyword : null,
                'status'             => $status !== '' ? $status : null,
                'date_from'          => $startDate?->format('Y-m-d'),
                'date_to'            => $endDate?->format('Y-m-d'),
                'aggregate_function' => $fn,
                'aggregate_field'    => $resolvedField,
                'group_by'           => $groupBy !== '' ? $groupBy : null,
                'sort_by'            => $sortBy,
                'limit'              => $limit,
            ],
            'aggregation'        => [
                'function'        => $fn,
                'field'           => $resolvedField,
                'group_by'        => $groupBy !== '' ? $groupBy : null,
                'total_records'   => $totalRecords,
                'value'           => $overallValue,
                'formatted_value' => $formattedOverall,
                'is_monetary'     => $isMonetaryMetric,
            ],
            'total_matched'      => $totalRecords,
            'returned_count'     => $groupBy !== '' ? count($groups) : 1,
            'groups'             => $groups,
            'breakdown'          => $groups,
            'comparison_summary' => $comparisonSummary,
            'items'              => $groupBy !== '' ? $groups : [
                [
                    'group_label'            => 'Toàn bộ bản ghi khớp điều kiện',
                    'count'                  => $totalRecords,
                    'metric_value'           => $overallValue,
                    'formatted_metric_value' => $formattedOverall,
                ],
            ],
        ];
    }

    /**
     * Ánh xạ thông minh và kiểm tra allow-list cho trường số cần thống kê (aggregate_field).
     */
    protected function resolveAggregateField(string $entity, string $fn, string $rawField): ?string
    {
        $allowed = self::ALLOWED_AGGREGATE_FIELDS[$entity] ?? ['id'];
        $field = strtolower(trim($rawField));

        if ($fn === 'count' && $field === '') {
            return 'id';
        }

        if ($field === '') {
            return match ($entity) {
                'repair_orders'              => 'total_price',
                'warranties'                 => 'duration_days',
                'payments',
                'cash_transactions',
                'supplier_debt_transactions' => 'amount',
                'parts'                      => 'stock_quantity',
                'repair_services'            => 'base_price',
                'common_issues'              => 'estimated_cost',
                'suppliers'                  => 'debt_balance',
                'goods_receipts'             => 'final_amount',
                'work_shifts'                => 'difference_amount',
                'customers'                  => 'total_spent',
                'shipments'                  => 'cod_amount',
                default                      => 'id',
            };
        }

        $aliasMap = [
            'revenue'   => match ($entity) {
                'repair_orders' => 'total_price',
                'customers'     => 'total_spent',
                default         => 'amount',
            },
            'price'     => match ($entity) {
                'repair_orders'   => 'total_price',
                'parts'           => 'retail_price',
                'repair_services' => 'base_price',
                'common_issues'   => 'estimated_cost',
                'goods_receipts'  => 'final_amount',
                default           => 'amount',
            },
            'amount'    => match ($entity) {
                'repair_orders'  => 'total_price',
                'suppliers'      => 'debt_balance',
                'goods_receipts' => 'final_amount',
                'customers'      => 'total_spent',
                'shipments'      => 'cod_amount',
                default          => 'amount',
            },
            'debt'      => match ($entity) {
                'goods_receipts'             => 'debt_amount',
                'supplier_debt_transactions' => 'debt_after',
                default                      => 'debt_balance',
            },
            'stock'     => 'stock_quantity',
            'quantity'  => 'stock_quantity',
            'spent'     => 'total_spent',
            'diff'      => 'difference_amount',
            'cash_diff' => 'difference_amount',
        ];

        $candidate = $aliasMap[$field] ?? $field;

        return in_array($candidate, $allowed, true) ? $candidate : null;
    }

    /**
     * Lấy danh sách bản ghi phục vụ tính toán thống kê động (giới hạn an toàn tối đa 500 bản ghi).
     *
     * @return array{0: int, 1: array<int, array<string, mixed>>}
     */
    protected function fetchItemsForAggregation(
        string $entity,
        TelegramRecipient $recipient,
        string $branchDisplay,
        string $keyword,
        string $status,
        ?Carbon $startDate,
        ?Carbon $endDate
    ): array {
        $maxScanLimit = 500;

        if ($entity === 'repair_orders' && $status === '__exclude_cancelled_rejected__') {
            [$totalMatched, $items] = $this->queryRepairOrders(
                $recipient,
                $branchDisplay,
                $keyword,
                '',
                $startDate,
                $endDate,
                'price_desc',
                $maxScanLimit
            );

            return [$totalMatched, $items];
        }

        return match ($entity) {
            'repair_orders'              => $this->queryRepairOrders($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, 'latest', $maxScanLimit),
            'warranties'                 => $this->queryWarranties($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, 'latest', $maxScanLimit),
            'warranty_claims'            => $this->queryWarrantyClaims($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, 'latest', $maxScanLimit),
            'payments'                   => $this->queryPayments($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, 'latest', $maxScanLimit),
            'cash_transactions'          => $this->queryCashTransactions($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, 'latest', $maxScanLimit),
            'parts'                      => $this->queryParts($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, 'latest', $maxScanLimit),
            'users'                      => $this->queryUsers($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, 'latest', $maxScanLimit),
            'repair_services'            => $this->queryRepairServices($recipient, $keyword, $status, $startDate, $endDate, 'latest', $maxScanLimit),
            'common_issues'              => $this->queryCommonIssues($recipient, $keyword, $status, $startDate, $endDate, 'latest', $maxScanLimit),
            'suppliers'                  => $this->querySuppliers($recipient, $keyword, $status, $startDate, $endDate, 'latest', $maxScanLimit),
            'goods_receipts'             => $this->queryGoodsReceipts($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, 'latest', $maxScanLimit),
            'supplier_debt_transactions' => $this->querySupplierDebtTransactions($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, 'latest', $maxScanLimit),
            'work_shifts'                => $this->queryWorkShifts($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, 'latest', $maxScanLimit),
            'customers'                  => $this->queryCustomers($recipient, $keyword, $status, $startDate, $endDate, 'latest', $maxScanLimit),
            'qc_inspections'             => $this->queryQcInspections($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, 'latest', $maxScanLimit),
            'shipments'                  => $this->queryShipments($recipient, $branchDisplay, $keyword, $status, $startDate, $endDate, 'latest', $maxScanLimit),
        };
    }

    /**
     * Trích xuất giá trị số của trường thống kê từ mảng bản ghi.
     */
    protected function extractRecordMetricValue(array $item, string $field): float
    {
        if (array_key_exists($field, $item) && is_numeric($item[$field])) {
            return (float) $item[$field];
        }

        return 0.0;
    }

    /**
     * Tính toán chỉ số vô hướng (count, sum, avg, max, min).
     *
     * @param array<int, float> $values
     */
    protected function computeScalarAggregate(string $fn, array $values, int $count): float
    {
        if ($fn === 'count') {
            return (float) $count;
        }

        if (empty($values)) {
            return 0.0;
        }

        return match ($fn) {
            'sum'   => round(array_sum($values), 2),
            'avg'   => round(array_sum($values) / count($values), 2),
            'max'   => round((float) max($values), 2),
            'min'   => round((float) min($values), 2),
            default => (float) $count,
        };
    }

    /**
     * Trích xuất nhãn gom nhóm (group_by) từ bản ghi.
     */
    protected function extractRecordGroupDimension(string $entity, array $item, string $groupBy, string $branchDisplay): string
    {
        return match ($groupBy) {
            'status'          => (string) ($item['status_label'] ?? $item['result_label'] ?? $item['status'] ?? 'Khác'),
            'order_type'      => match (strtolower((string) ($item['order_type'] ?? 'in_store'))) {
                'cod'      => 'Đơn COD (Khách tỉnh)',
                'warranty' => 'Tiếp nhận bảo hành',
                default    => 'Khách tại cửa hàng',
            },
            'technician'      => (string) ($item['technician_name'] ?? $item['inspector_name'] ?? $item['user_name'] ?? $item['name'] ?? 'Chưa phân công'),
            'customer'        => (string) ($item['customer_name'] ?? $item['recipient_name'] ?? $item['name'] ?? 'Khách lẻ'),
            'branch'          => (string) ($item['branch_name'] ?? $branchDisplay),
            'device_category' => (string) ($item['device_category'] ?? $item['device_name'] ?? $item['category'] ?? 'AirPods'),
            'payment_method'  => (string) ($item['payment_method_label'] ?? $item['payment_method'] ?? 'Tiền mặt'),
            'category'        => (string) (($item['category'] ?? '') !== '' ? $item['category'] : ($item['device_category'] ?? 'Chưa phân loại')),
            'type'            => (string) ($item['type_label'] ?? $item['order_type'] ?? $item['type'] ?? 'Khác'),
            'result'          => (string) ($item['result_label'] ?? $item['result'] ?? 'Khác'),
            'role'            => (string) ($item['role_label'] ?? $item['role'] ?? 'Nhân viên'),
            'day'             => $this->extractDateGroupFromItem($item, 'day'),
            'month'           => $this->extractDateGroupFromItem($item, 'month'),
            default           => 'Tất cả',
        };
    }

    protected function extractDateGroupFromItem(array $item, string $granularity): string
    {
        $rawDate = (string) ($item['created_at'] ?? $item['paid_at'] ?? $item['transaction_date'] ?? $item['opened_at'] ?? $item['received_at'] ?? '');
        if ($rawDate === '') {
            return 'Không rõ ngày';
        }

        if (preg_match('/(\d{2})\/(\d{2})\/(\d{4})/', $rawDate, $matches)) {
            return $granularity === 'month'
                ? "{$matches[2]}/{$matches[3]}"
                : "{$matches[1]}/{$matches[2]}/{$matches[3]}";
        }

        return $rawDate;
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

        if (($result['mode'] ?? '') === 'aggregation' || ! empty($result['aggregation'])) {
            return $this->formatAggregationHtml($result);
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
                'repair_orders'              => $this->formatRepairOrderItemHtml($item),
                'warranties'                 => $this->formatWarrantyItemHtml($item),
                'warranty_claims'            => $this->formatWarrantyClaimItemHtml($item),
                'payments'                   => $this->formatPaymentItemHtml($item),
                'cash_transactions'          => $this->formatCashTransactionItemHtml($item),
                'parts'                      => $this->formatPartItemHtml($item),
                'users'                      => $this->formatUserItemHtml($item),
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

    protected function formatAggregationHtml(array $result): string
    {
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

        $agg = is_array($result['aggregation'] ?? null) ? $result['aggregation'] : [];
        $fn = strtoupper((string) ($agg['function'] ?? 'COUNT'));
        $field = htmlspecialchars((string) ($agg['field'] ?? 'id'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $totalRecords = (int) ($agg['total_records'] ?? $result['total_matched'] ?? 0);
        $formattedValue = htmlspecialchars((string) ($agg['formatted_value'] ?? '0'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $groups = is_array($result['groups'] ?? null) ? $result['groups'] : [];

        $lines = [
            "<b>Thống kê dữ liệu - {$entityLabel}</b>",
            "Chi nhánh: <b>{$branchScope}</b> | Số bản ghi hợp lệ: <b>{$totalRecords}</b>",
            "- Kết quả tổng hợp ({$fn} - <code>{$field}</code>): <b>{$formattedValue}</b>",
        ];

        if (! empty($groups)) {
            $lines[] = '';
            $lines[] = '<b>Chi tiết phân nhóm xếp hạng:</b>';
            foreach ($groups as $idx => $g) {
                if (! is_array($g)) {
                    continue;
                }
                $rank = $idx + 1;
                $label = htmlspecialchars((string) ($g['group_label'] ?? 'Khác'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $metricStr = htmlspecialchars((string) ($g['formatted_metric_value'] ?? '0'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $count = (int) ($g['count'] ?? 0);
                $share = number_format((float) ($g['share_percent'] ?? 0), 1, '.', '');
                $lines[] = "{$rank}. <b>{$label}</b>: <b>{$metricStr}</b> (Số lượng: <b>{$count}</b> | Tỷ trọng: <b>{$share}%</b>)";
            }
        }

        return implode("\n", $lines);
    }

    protected function formatRepairOrderItemHtml(array $item): string
    {
        $code = htmlspecialchars((string) ($item['order_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $customer = htmlspecialchars((string) ($item['customer_name'] ?? 'Khách lẻ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $device = htmlspecialchars((string) ($item['device_name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $statusLabel = htmlspecialchars((string) ($item['status_label'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $tech = htmlspecialchars((string) ($item['technician_name'] ?? 'Chưa phân công'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $price = htmlspecialchars((string) ($item['formatted_price'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        return "- Mã đơn: <code>{$code}</code> | Khách: <b>{$customer}</b> | Thiết bị: {$device}"
            . "\n  Trạng thái: <b>{$statusLabel}</b> | KTV: <b>{$tech}</b> | Chi phí: <b>{$price}</b>";
    }

    protected function formatWarrantyItemHtml(array $item): string
    {
        $wCode = htmlspecialchars((string) ($item['warranty_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $oCode = htmlspecialchars((string) ($item['order_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $customer = htmlspecialchars((string) ($item['customer_name'] ?? 'Khách lẻ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $device = htmlspecialchars((string) ($item['device_name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $endDate = htmlspecialchars((string) ($item['end_date'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $claimsCount = (int) ($item['claims_count'] ?? 0);

        return "- Mã BH: <code>{$wCode}</code> (Đơn: <code>{$oCode}</code>) | Khách: <b>{$customer}</b> | Thiết bị: {$device}"
            . "\n  Hạn bảo hành: <b>{$endDate}</b> | Số lần tiếp nhận BH: <b>{$claimsCount}</b>";
    }

    protected function formatWarrantyClaimItemHtml(array $item): string
    {
        $cCode = htmlspecialchars((string) ($item['claim_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $wCode = htmlspecialchars((string) ($item['warranty_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $oCode = htmlspecialchars((string) ($item['order_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $issue = htmlspecialchars((string) ($item['issue_description'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $tech = htmlspecialchars((string) ($item['technician_name'] ?? 'Chưa phân công'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $status = htmlspecialchars((string) ($item['status'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        return "- Mã Claim: <code>{$cCode}</code> | Phiếu BH: <code>{$wCode}</code> (Đơn gốc: <code>{$oCode}</code>)"
            . "\n  Lỗi BH: {$issue} | KTV xử lý: <b>{$tech}</b> | Trạng thái: <b>{$status}</b>";
    }

    protected function formatPaymentItemHtml(array $item): string
    {
        $pCode = htmlspecialchars((string) ($item['payment_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $oCode = htmlspecialchars((string) ($item['order_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $customer = htmlspecialchars((string) ($item['customer_name'] ?? 'Khách lẻ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $amount = htmlspecialchars((string) ($item['formatted_net_amount'] ?? $item['formatted_amount'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $method = htmlspecialchars((string) ($item['payment_method_label'] ?? 'Tiền mặt'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $paidAt = htmlspecialchars((string) ($item['paid_at'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        return "- Mã TT: <code>{$pCode}</code> | Đơn: <code>{$oCode}</code> | Khách: <b>{$customer}</b>"
            . "\n  Thực thu: <b>{$amount}</b> | Phương thức: <b>{$method}</b> | Thời gian: {$paidAt}";
    }

    protected function formatCashTransactionItemHtml(array $item): string
    {
        $code = htmlspecialchars((string) ($item['transaction_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $typeLabel = htmlspecialchars((string) ($item['type_label'] ?? 'Phiếu thu'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $category = htmlspecialchars((string) ($item['category'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $amount = htmlspecialchars((string) ($item['formatted_amount'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $desc = htmlspecialchars((string) ($item['description'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $date = htmlspecialchars((string) ($item['transaction_date'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        return "- Mã phiếu: <code>{$code}</code> | Loại: <b>{$typeLabel}</b> | Hạng mục: {$category} | Số tiền: <b>{$amount}</b> ({$date})"
            . ($desc !== '' ? "\n  Nội dung: {$desc}" : '');
    }

    protected function formatPartItemHtml(array $item): string
    {
        $name = htmlspecialchars((string) ($item['name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $code = htmlspecialchars((string) ($item['code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $stock = (int) ($item['stock_quantity'] ?? 0);
        $unit = htmlspecialchars((string) ($item['unit'] ?? 'cái'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $retailPrice = htmlspecialchars((string) ($item['formatted_retail_price'] ?? 'Đã ẩn'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        return "- <b>{$name}</b> (<code>{$code}</code>) | Tồn kho: <b>{$stock} {$unit}</b> | Giá bán: <b>{$retailPrice}</b>";
    }

    protected function formatUserItemHtml(array $item): string
    {
        $name = htmlspecialchars((string) ($item['name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $roleLabel = htmlspecialchars((string) ($item['role_label'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $phone = htmlspecialchars((string) ($item['phone'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $branch = htmlspecialchars((string) ($item['branch_name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        return "- <b>{$name}</b> | Vai trò: <b>{$roleLabel}</b>"
            . ($phone !== '' ? " | SĐT: <code>{$phone}</code>" : '')
            . " | Chi nhánh: {$branch}";
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
