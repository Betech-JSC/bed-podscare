<?php

namespace App\Services\TelegramAi\Tools;

use App\Models\Branch;
use App\Models\CashTransaction;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\TelegramRecipient;
use App\Services\TelegramAi\Contracts\TelegramAiToolInterface;
use App\Services\TelegramAi\TelegramAiAssistantService;
use Carbon\Carbon;

class RevenueSummaryTool implements TelegramAiToolInterface
{
    /**
     * Danh sách trạng thái đơn hàng bị hủy hoặc khách từ chối sửa, bắt buộc loại trừ khỏi doanh thu và thực thu.
     *
     * @var array<int, string>
     */
    public const EXCLUDED_STATUSES = ['cancelled', 'rejected'];

    public function name(): string
    {
        return 'get_revenue_summary';
    }

    /**
     * Chỉ cho phép Quản trị viên (admin, super_admin) truy cập báo cáo doanh thu và sổ quỹ.
     *
     * @return array<int, string>
     */
    public function allowedRoles(): array
    {
        return ['admin', 'super_admin'];
    }

    public function description(): string
    {
        return 'Thống kê báo cáo doanh thu, số lượng đơn sửa chữa, thực thu thanh toán, thu chi sổ quỹ và phân tích/so sánh doanh thu đa chiều theo khoảng thời gian (period: today, yesterday, this_week, this_month, hoặc date_from/date_to), chi nhánh (branch_name), lọc theo dòng thiết bị (device_category: AirPods, Apple Watch...) và gom nhóm so sánh (group_by: device_category, technician, service, branch, order_type). Khi người dùng hỏi so sánh giữa các dòng máy, kỹ thuật viên hoặc dịch vụ, bắt buộc truyền group_by tương ứng.';
    }

    public function parametersSchema(): array
    {
        return [
            'type'       => 'OBJECT',
            'properties' => [
                'period' => [
                    'type'        => 'STRING',
                    'description' => 'Khoảng thời gian báo cáo: today (hôm nay), yesterday (hôm qua), this_week (tuần này), this_month (tháng này), custom (tùy chỉnh theo date_from/date_to). Mặc định là today.',
                ],
                'date_from' => [
                    'type'        => 'STRING',
                    'description' => 'Ngày bắt đầu (định dạng YYYY-MM-DD, DD/MM/YYYY hoặc DD/MM) nếu tra cứu theo ngày cụ thể.',
                ],
                'date_to' => [
                    'type'        => 'STRING',
                    'description' => 'Ngày kết thúc (định dạng YYYY-MM-DD, DD/MM/YYYY hoặc DD/MM) nếu tra cứu theo ngày cụ thể.',
                ],
                'branch_name' => [
                    'type'        => 'STRING',
                    'description' => 'Tên hoặc mã chi nhánh cần xem báo cáo (ví dụ: Quận 1). Để trống nếu xem toàn bộ chi nhánh được phân quyền.',
                ],
                'device_category' => [
                    'type'        => 'STRING',
                    'description' => 'Lọc riêng doanh thu cho một dòng thiết bị cụ thể (ví dụ: "AirPods", "Apple Watch"). Để trống nếu đang cần so sánh nhiều dòng thiết bị với nhau.',
                ],
                'group_by' => [
                    'type'        => 'STRING',
                    'description' => 'Tiêu chí gom nhóm để phân tích & xếp hạng doanh thu: device_category (theo dòng máy AirPods / Apple Watch...), technician (theo kỹ thuật viên), service (theo hạng mục dịch vụ sửa chữa), branch (theo chi nhánh), order_type (theo loại đơn tại quầy / COD / bảo hành).',
                ],
            ],
        ];
    }

    /**
     * Escape các ký tự wildcard SQL (%, _, \) trước khi đưa vào điều kiện LIKE.
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

    public function execute(array $args, TelegramRecipient $recipient): array
    {
        $role = strtolower(trim((string) ($recipient->target_role ?? '')));
        if (! in_array($role, ['admin', 'super_admin'], true)) {
            return [
                'error' => 'Bạn không có quyền truy cập báo cáo doanh thu và sổ quỹ.',
            ];
        }

        // Bước 1: Tự kiểm tra & chuẩn hóa khoảng thời gian và chi nhánh (Sanitize & Normalize)
        $tenantId = (int) $recipient->tenant_id;

        $rawDateFrom = $this->scalarString($args['date_from'] ?? '');
        $rawDateTo = $this->scalarString($args['date_to'] ?? '');
        $parsedFrom = $this->parseDate($rawDateFrom);
        $parsedTo = $this->parseDate($rawDateTo);

        if ($parsedFrom !== null || $parsedTo !== null) {
            $start = ($parsedFrom ?? $parsedTo)->copy();
            $end = ($parsedTo ?? $parsedFrom)->copy();

            if ($end->lt($start)) {
                [$start, $end] = [$end, $start];
            }

            $startDate = $start->startOfDay();
            $endDate = $end->endOfDay();
            $period = 'custom';
            $periodLabel = $startDate->isSameDay($endDate)
                ? 'Ngày ' . $startDate->format('d/m/Y')
                : 'Từ ' . $startDate->format('d/m/Y') . ' đến ' . $endDate->format('d/m/Y');
        } else {
            $rawPeriod = strtolower($this->scalarString($args['period'] ?? 'today', 'today'));

            switch ($rawPeriod) {
                case 'yesterday':
                    $period = 'yesterday';
                    $startDate = now()->subDay()->startOfDay();
                    $endDate = now()->subDay()->endOfDay();
                    $periodLabel = 'Hôm qua (' . $startDate->format('d/m/Y') . ')';
                    break;

                case 'this_week':
                    $period = 'this_week';
                    $startDate = now()->startOfWeek();
                    $endDate = now()->endOfWeek();
                    $periodLabel = 'Tuần này (' . $startDate->format('d/m/Y') . ' - ' . $endDate->format('d/m/Y') . ')';
                    break;

                case 'this_month':
                    $period = 'this_month';
                    $startDate = now()->startOfMonth();
                    $endDate = now()->endOfMonth();
                    $periodLabel = 'Tháng này (' . $startDate->format('m/Y') . ')';
                    break;

                default:
                    $period = 'today';
                    $startDate = now()->startOfDay();
                    $endDate = now()->endOfDay();
                    $periodLabel = 'Hôm nay (' . $startDate->format('d/m/Y') . ')';
                    break;
            }
        }

        // Xác định phạm vi chi nhánh (khóa cứng theo recipient->branch_id nếu người nhận bị giới hạn chi nhánh)
        $branchId = null;
        $branchLabel = TelegramAiAssistantService::resolveBranchDisplay($recipient);
        $branchNameArg = $this->scalarString($args['branch_name'] ?? '');

        if ($recipient->branch_id !== null) {
            $branchId = (int) $recipient->branch_id;
            $lockedBranch = Branch::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where('id', $branchId)
                ->first();
            $branchLabel = $lockedBranch ? (string) $lockedBranch->name : "Chi nhánh #{$branchId}";
        } elseif ($branchNameArg !== '') {
            $escapedBranchName = $this->escapeLike($branchNameArg);
            $matchedBranch = Branch::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where(function ($q) use ($escapedBranchName) {
                    $q->where('name', 'like', "%{$escapedBranchName}%")
                        ->orWhere('code', 'like', "%{$escapedBranchName}%");
                })
                ->first();

            if ($matchedBranch !== null) {
                $branchId = (int) $matchedBranch->id;
                $branchLabel = (string) $matchedBranch->name;
            }
        }

        $deviceCategory = $this->scalarString($args['device_category'] ?? '');
        $rawGroupBy = strtolower($this->scalarString($args['group_by'] ?? ''));
        $allowedGroupBys = ['device_category', 'technician', 'service', 'branch', 'order_type'];
        $groupBy = in_array($rawGroupBy, $allowedGroupBys, true) ? $rawGroupBy : null;

        // Bước 2: Thực thi Eloquent Query khóa cứng tenant_id & branch_id
        // 1. Thống kê Đơn sửa chữa (RepairOrder) tạo trong khoảng [$startDate, $endDate]
        $orderBaseQuery = RepairOrder::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->whereBetween('created_at', [$startDate, $endDate]);

        if ($branchId !== null) {
            $orderBaseQuery->where('branch_id', $branchId);
        } else {
            $activeOrderBranchIds = (clone $orderBaseQuery)
                ->whereNotNull('branch_id')
                ->distinct()
                ->pluck('branch_id')
                ->all();

            if (count($activeOrderBranchIds) === 1) {
                $singleBranchName = Branch::withoutGlobalScopes()
                    ->where('id', (int) $activeOrderBranchIds[0])
                    ->value('name');
                if ($singleBranchName) {
                    $branchLabel = (string) $singleBranchName;
                }
            }
        }

        if ($deviceCategory !== '') {
            $this->applyDeviceCategoryFilter($orderBaseQuery, $deviceCategory);
        }

        $completedStatuses = ['completed', 'delivered', 'handed_over', 'ready_for_pickup', 'qc_passed'];
        $excludedStatuses = self::EXCLUDED_STATUSES;

        $totalNewOrders = (clone $orderBaseQuery)->count();
        $inStoreOrders = (clone $orderBaseQuery)
            ->where(function ($q) {
                $q->where('order_type', 'in_store')
                    ->orWhereNull('order_type')
                    ->orWhere('order_type', '');
            })
            ->count();
        $codOrders = (clone $orderBaseQuery)->where('order_type', 'cod')->count();
        $warrantyOrders = (clone $orderBaseQuery)->where('order_type', 'warranty')->count();
        $completedOrders = (clone $orderBaseQuery)
            ->whereIn('status', $completedStatuses)
            ->count();
        $cancelledOrders = (clone $orderBaseQuery)
            ->whereIn('status', $excludedStatuses)
            ->count();
        $estimatedOrderRevenue = (float) (clone $orderBaseQuery)
            ->whereNotIn('status', $excludedStatuses)
            ->sum('total_price');

        // 2. Thực thu Thanh toán Đơn hàng (Payment) - loại trừ đơn đã hủy/từ chối sửa để khớp 100% với breakdown
        $paymentQuery = Payment::withoutGlobalScopes()
            ->whereIn('status', ['completed', 'paid', 'success'])
            ->whereHas('repairOrder', function ($q) use ($tenantId, $branchId, $deviceCategory, $excludedStatuses) {
                $q->withoutGlobalScopes()
                    ->where('tenant_id', $tenantId)
                    ->whereNotIn('status', $excludedStatuses);
                if ($branchId !== null) {
                    $q->where('branch_id', $branchId);
                }
                if ($deviceCategory !== '') {
                    $this->applyDeviceCategoryFilter($q, $deviceCategory);
                }
            })
            ->where(function ($q) use ($startDate, $endDate) {
                $q->whereBetween('paid_at', [$startDate, $endDate])
                    ->orWhere(function ($sub) use ($startDate, $endDate) {
                        $sub->whereNull('paid_at')
                            ->whereBetween('created_at', [$startDate, $endDate]);
                    });
            });

        $grossPaymentAmount = (float) (clone $paymentQuery)->sum('amount');
        $totalRefundAmount = (float) (clone $paymentQuery)->sum('refund_amount');
        $netPaymentCollected = max(0.0, $grossPaymentAmount - $totalRefundAmount);

        // 3. Thu / Chi Sổ quỹ (CashTransaction)
        $cashBaseQuery = CashTransaction::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->whereBetween('created_at', [$startDate, $endDate]);

        if ($branchId !== null) {
            $cashBaseQuery->where('branch_id', $branchId);
        }

        $cashbookIncome = (float) (clone $cashBaseQuery)->where('type', 'income')->sum('amount');
        $cashbookExpense = (float) (clone $cashBaseQuery)->where('type', 'expense')->sum('amount');
        $netCashflow = $cashbookIncome - $cashbookExpense;

        // 4. Phân rã & So sánh đa chiều (breakdown & comparison_summary) khi có group_by
        $breakdown = [];
        $comparisonSummary = null;

        if ($groupBy !== null) {
            [$breakdown, $comparisonSummary] = $this->buildGroupByBreakdown(
                $groupBy,
                (clone $orderBaseQuery)->whereNotIn('status', $excludedStatuses),
                clone $paymentQuery,
                $completedStatuses
            );
        }

        return [
            'period'                            => $period,
            'period_label'                      => $periodLabel,
            'date_from'                         => $startDate->format('Y-m-d'),
            'date_to'                           => $endDate->format('Y-m-d'),
            'branch_id'                         => $branchId,
            'branch_name'                       => $branchLabel,
            'branch_scope'                      => $branchLabel,
            'device_category'                   => $deviceCategory !== '' ? $deviceCategory : null,
            'group_by'                          => $groupBy,
            'total_new_orders'                  => $totalNewOrders,
            'in_store_orders'                   => $inStoreOrders,
            'cod_orders'                        => $codOrders,
            'warranty_orders'                   => $warrantyOrders,
            'completed_orders'                  => $completedOrders,
            'cancelled_orders'                  => $cancelledOrders,
            'estimated_order_revenue'           => $estimatedOrderRevenue,
            'formatted_estimated_order_revenue' => $this->formatVnd($estimatedOrderRevenue),
            'net_payment_collected'             => $netPaymentCollected,
            'formatted_net_payment_collected'   => $this->formatVnd($netPaymentCollected),
            'cashbook_income'                   => $cashbookIncome,
            'formatted_cashbook_income'         => $this->formatVnd($cashbookIncome),
            'cashbook_expense'                  => $cashbookExpense,
            'formatted_cashbook_expense'        => $this->formatVnd($cashbookExpense),
            'net_cashflow'                      => $netCashflow,
            'formatted_net_cashflow'            => $this->formatVnd($netCashflow),
            'breakdown'                         => $breakdown,
            'comparison_summary'                => $comparisonSummary,
        ];
    }

    /**
     * Áp dụng bộ lọc dòng thiết bị (device_category) lên query của RepairOrder.
     */
    protected function applyDeviceCategoryFilter($orderQuery, string $deviceCategory): void
    {
        $normCat = mb_strtolower(trim($deviceCategory), 'UTF-8');
        $escapedCategory = $this->escapeLike(trim($deviceCategory));

        $orderQuery->whereHas('deviceModel', function ($dq) use ($escapedCategory, $normCat) {
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

    /**
     * Tính toán bảng phân rã breakdown và chuỗi nhận xét so sánh trực diện comparison_summary.
     *
     * @param  array<int, string>  $completedStatuses
     * @return array{0: array<int, array<string, mixed>>, 1: string|null}
     */
    protected function buildGroupByBreakdown(
        string $groupBy,
        $orderQuery,
        $paymentQuery,
        array $completedStatuses
    ): array {
        $orderRelations = match ($groupBy) {
            'device_category' => ['deviceModel' => fn ($q) => $q->withoutGlobalScopes()->select(['id', 'name', 'category'])],
            'technician'      => [
                'technician'    => fn ($q) => $q->withoutGlobalScopes()->select(['id', 'name']),
                'qcInspections' => fn ($q) => $q->withoutGlobalScopes()->select(['id', 'repair_order_id', 'result']),
                'warranties'    => fn ($q) => $q->withoutGlobalScopes()->with(['claims']),
            ],
            'branch'          => ['branch' => fn ($q) => $q->withoutGlobalScopes()->select(['id', 'name'])],
            'service'         => ['quotes' => fn ($q) => $q->withoutGlobalScopes()->with(['items.service'])],
            default           => [],
        };

        $orderColumns = [
            'id',
            'tenant_id',
            'branch_id',
            'technician_id',
            'device_model_id',
            'status',
            'order_type',
            'claim_id',
            'parent_order_id',
            'total_price',
            'issue_description',
            'tech_accepted_at',
            'repair_started_at',
            'repair_completed_at',
            'qc_passed_at',
            'created_at',
        ];

        $orders = (clone $orderQuery)
            ->select($orderColumns)
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->with($orderRelations)
            ->get();

        $payments = $paymentQuery
            ->select(['id', 'repair_order_id', 'amount', 'refund_amount', 'status', 'paid_at'])
            ->with([
                'repairOrder' => fn ($q) => $q->withoutGlobalScopes()
                    ->select($orderColumns)
                    ->with($orderRelations),
            ])
            ->get();

        // Map thực thu ròng theo repair_order_id
        $netPayByOrderId = [];
        foreach ($payments as $payment) {
            $oid = (int) $payment->repair_order_id;
            $net = max(0.0, (float) $payment->amount - (float) $payment->refund_amount);
            $netPayByOrderId[$oid] = ($netPayByOrderId[$oid] ?? 0.0) + $net;
        }

        $groups = [];
        $orderIdsIncluded = [];

        foreach ($orders as $order) {
            /** @var RepairOrder $order */
            if (in_array((string) $order->status, ['cancelled', 'rejected'], true)) {
                continue;
            }
            $orderIdsIncluded[(int) $order->id] = true;
            $isCompleted = in_array((string) $order->status, $completedStatuses, true);
            $orderEst = (float) ($order->total_price ?? 0);
            $orderNetPay = (float) ($netPayByOrderId[(int) $order->id] ?? 0.0);

            if ($groupBy === 'service') {
                $serviceEntries = $this->extractOrderServiceEntries($order, $orderEst, $orderNetPay);
                foreach ($serviceEntries as $srvEntry) {
                    $key = $srvEntry['key'];
                    $label = $srvEntry['label'];
                    if (! isset($groups[$key])) {
                        $groups[$key] = [
                            'group_key'             => $key,
                            'group_label'           => $label,
                            'orders_count'          => 0,
                            'completed_orders'      => 0,
                            'estimated_revenue'     => 0.0,
                            'net_payment_collected' => 0.0,
                        ];
                    }
                    $groups[$key]['orders_count']++;
                    if ($isCompleted) {
                        $groups[$key]['completed_orders']++;
                    }
                    $groups[$key]['estimated_revenue'] += $srvEntry['estimated_revenue'];
                    $groups[$key]['net_payment_collected'] += $srvEntry['net_payment_collected'];
                }
                continue;
            }

            [$key, $label] = $this->resolveOrderGroupKeyAndLabel($order, $groupBy);

            if (! isset($groups[$key])) {
                $groups[$key] = [
                    'group_key'             => $key,
                    'group_label'           => $label,
                    'orders_count'          => 0,
                    'completed_orders'      => 0,
                    'estimated_revenue'     => 0.0,
                    'net_payment_collected' => 0.0,
                    'warranty_count'        => 0,
                    'rework_count'          => 0,
                    'qc_total'              => 0,
                    'qc_passed'             => 0,
                    'duration_sum'          => 0.0,
                    'duration_count'        => 0,
                ];
            }

            $groups[$key]['orders_count']++;
            if ($isCompleted) {
                $groups[$key]['completed_orders']++;
            }
            $groups[$key]['estimated_revenue'] += $orderEst;
            $groups[$key]['net_payment_collected'] += $orderNetPay;

            if ($groupBy === 'technician') {
                $hasFailedQc = $order->relationLoaded('qcInspections')
                    && $order->qcInspections->contains(
                        static fn ($qc) => in_array(strtolower((string) $qc->result), ['fail', 'failed', 'rework'], true)
                    );
                $hasWarrantyClaim = $order->relationLoaded('warranties')
                    && $order->warranties->contains(
                        static fn ($w) => $w->relationLoaded('claims') && $w->claims->isNotEmpty()
                    );

                $isRework = ((string) $order->status === 'rework_needed') || $hasFailedQc;
                $isWarranty = $isRework
                    || strtolower((string) $order->order_type) === 'warranty'
                    || $order->claim_id !== null
                    || $order->parent_order_id !== null
                    || $hasWarrantyClaim;

                if ($isRework) {
                    $groups[$key]['rework_count']++;
                }
                if ($isWarranty) {
                    $groups[$key]['warranty_count']++;
                }

                if ($order->relationLoaded('qcInspections') && $order->qcInspections->isNotEmpty()) {
                    foreach ($order->qcInspections as $qc) {
                        $groups[$key]['qc_total']++;
                        if (in_array(strtolower((string) $qc->result), ['pass', 'passed'], true)) {
                            $groups[$key]['qc_passed']++;
                        }
                    }
                }

                if ($order->repair_completed_at !== null) {
                    $startAt = $order->repair_started_at ?? $order->tech_accepted_at ?? $order->created_at;
                    if ($startAt !== null) {
                        $durMin = abs($order->repair_completed_at->diffInSeconds($startAt)) / 60.0;
                        $groups[$key]['duration_sum'] += $durMin;
                        $groups[$key]['duration_count']++;
                    }
                }
            }
        }

        // Cộng thêm các khoản thanh toán của đơn cũ được thu tiền trong kỳ (nếu đơn gốc tạo trước kỳ báo cáo)
        foreach ($payments as $payment) {
            $oid = (int) $payment->repair_order_id;
            if (
                isset($orderIdsIncluded[$oid])
                || ! $payment->repairOrder
                || in_array((string) $payment->repairOrder->status, ['cancelled', 'rejected'], true)
            ) {
                continue;
            }

            $net = max(0.0, (float) $payment->amount - (float) $payment->refund_amount);
            if ($net <= 0) {
                continue;
            }

            if ($groupBy === 'service') {
                $serviceEntries = $this->extractOrderServiceEntries($payment->repairOrder, 0.0, $net);
                foreach ($serviceEntries as $srvEntry) {
                    $key = $srvEntry['key'];
                    $label = $srvEntry['label'];
                    if (! isset($groups[$key])) {
                        $groups[$key] = [
                            'group_key'             => $key,
                            'group_label'           => $label,
                            'orders_count'          => 0,
                            'completed_orders'      => 0,
                            'estimated_revenue'     => 0.0,
                            'net_payment_collected' => 0.0,
                        ];
                    }
                    $groups[$key]['net_payment_collected'] += $srvEntry['net_payment_collected'];
                }
                continue;
            }

            [$key, $label] = $this->resolveOrderGroupKeyAndLabel($payment->repairOrder, $groupBy);
            if (! isset($groups[$key])) {
                $groups[$key] = [
                    'group_key'             => $key,
                    'group_label'           => $label,
                    'orders_count'          => 0,
                    'completed_orders'      => 0,
                    'estimated_revenue'     => 0.0,
                    'net_payment_collected' => 0.0,
                    'warranty_count'        => 0,
                    'rework_count'          => 0,
                    'qc_total'              => 0,
                    'qc_passed'             => 0,
                    'duration_sum'          => 0.0,
                    'duration_count'        => 0,
                ];
            }
            $groups[$key]['net_payment_collected'] += $net;
        }

        $totalEst = array_sum(array_column($groups, 'estimated_revenue'));
        $totalNet = array_sum(array_column($groups, 'net_payment_collected'));
        $totalOrd = array_sum(array_column($groups, 'orders_count'));

        $breakdown = [];
        foreach ($groups as $g) {
            $est = (float) $g['estimated_revenue'];
            $net = (float) $g['net_payment_collected'];
            $ord = (int) $g['orders_count'];
            $comp = (int) $g['completed_orders'];

            if ($totalEst > 0) {
                $share = round(($est / $totalEst) * 100, 1);
            } elseif ($totalNet > 0) {
                $share = round(($net / $totalNet) * 100, 1);
            } elseif ($totalOrd > 0) {
                $share = round(($ord / $totalOrd) * 100, 1);
            } else {
                $share = 0.0;
            }

            $entry = [
                'group_key'                       => (string) $g['group_key'],
                'group_label'                     => (string) $g['group_label'],
                'label'                           => (string) $g['group_label'],
                'orders_count'                    => $ord,
                'completed_orders'                => $comp,
                'estimated_revenue'               => $est,
                'formatted_estimated_revenue'     => $this->formatVnd($est),
                'net_payment_collected'           => $net,
                'formatted_net_payment_collected' => $this->formatVnd($net),
                'share_percent'                   => $share,
            ];

            if ($groupBy === 'technician') {
                $warrantyCount = (int) ($g['warranty_count'] ?? 0);
                $reworkCount = (int) ($g['rework_count'] ?? 0);
                $warrantyRate = $comp > 0
                    ? round(($warrantyCount / $comp) * 100, 1)
                    : ($ord > 0 ? round(($warrantyCount / $ord) * 100, 1) : 0.0);

                $qcTotal = (int) ($g['qc_total'] ?? 0);
                $qcPassed = (int) ($g['qc_passed'] ?? 0);
                $qcPassRate = $qcTotal > 0
                    ? round(($qcPassed / $qcTotal) * 100, 1)
                    : ($comp > 0 ? round((max(0, $comp - $reworkCount) / $comp) * 100, 1) : null);

                $durCount = (int) ($g['duration_count'] ?? 0);
                $avgMinutes = $durCount > 0 ? round(((float) ($g['duration_sum'] ?? 0.0)) / $durCount, 1) : 0.0;
                $hoursPart = (int) floor($avgMinutes / 60);
                $minsPart = (int) round(fmod($avgMinutes, 60));
                if ($minsPart === 60) {
                    $hoursPart++;
                    $minsPart = 0;
                }
                $avgFormatted = $avgMinutes > 0
                    ? ($hoursPart > 0 ? "{$hoursPart}h {$minsPart}m" : "{$minsPart}m")
                    : '0m';

                $entry['warranty_count'] = $warrantyCount;
                $entry['rework_count'] = $reworkCount;
                $entry['rework_needed'] = $reworkCount;
                $entry['warranty_rate'] = $warrantyRate;
                $entry['warranty_rate_formatted'] = "{$warrantyRate}%";
                $entry['qc_pass_rate'] = $qcPassRate;
                $entry['avg_processing_time_minutes'] = $avgMinutes;
                $entry['avg_processing_time_formatted'] = $avgFormatted;
            }

            $breakdown[] = $entry;
        }

        usort($breakdown, static function (array $a, array $b): int {
            if ($b['estimated_revenue'] !== $a['estimated_revenue']) {
                return $b['estimated_revenue'] <=> $a['estimated_revenue'];
            }
            if ($b['net_payment_collected'] !== $a['net_payment_collected']) {
                return $b['net_payment_collected'] <=> $a['net_payment_collected'];
            }

            return $b['orders_count'] <=> $a['orders_count'];
        });

        $comparisonSummary = null;
        if (count($breakdown) >= 2) {
            $first = $breakdown[0];
            $second = $breakdown[1];
            $diff = max(0.0, (float) $first['estimated_revenue'] - (float) $second['estimated_revenue']);
            $formattedDiff = $this->formatVnd($diff);

            if ($diff > 0) {
                $comparisonSummary = sprintf(
                    '%s cao hơn %s %s (%s: %s / %d đơn vs %s: %s / %d đơn)',
                    $first['group_label'],
                    $second['group_label'],
                    $formattedDiff,
                    $first['group_label'],
                    $first['formatted_estimated_revenue'],
                    $first['orders_count'],
                    $second['group_label'],
                    $second['formatted_estimated_revenue'],
                    $second['orders_count']
                );
            } else {
                $comparisonSummary = sprintf(
                    '%s và %s ngang nhau ở mức %s (%s: %d đơn vs %s: %d đơn)',
                    $first['group_label'],
                    $second['group_label'],
                    $first['formatted_estimated_revenue'],
                    $first['group_label'],
                    $first['orders_count'],
                    $second['group_label'],
                    $second['orders_count']
                );
            }
        } elseif (count($breakdown) === 1) {
            $first = $breakdown[0];
            $comparisonSummary = sprintf(
                '%s dẫn đầu với %s / %d đơn (chiếm 100%% doanh thu)',
                $first['group_label'],
                $first['formatted_estimated_revenue'],
                $first['orders_count']
            );
        }

        return [$breakdown, $comparisonSummary];
    }

    /**
     * Xác định cặp [group_key, group_label] của một đơn sửa chữa theo tiêu chí group_by.
     *
     * @return array{0: string, 1: string}
     */
    protected function resolveOrderGroupKeyAndLabel(RepairOrder $order, string $groupBy): array
    {
        return match ($groupBy) {
            'device_category' => (static function () use ($order): array {
                $label = LookupOrderTool::resolveDeviceCategoryLabel($order->deviceModel);
                $key = mb_strtolower(preg_replace('/\s+/u', '_', trim($label)) ?: 'airpods', 'UTF-8');
                return [$key, $label];
            })(),
            'technician' => (static function () use ($order): array {
                $techName = trim((string) ($order->technician?->name ?? ''));
                if ($techName === '') {
                    return ['unassigned', 'Chưa phân công'];
                }
                $key = $order->technician_id ? 'tech_' . (int) $order->technician_id : mb_strtolower($techName, 'UTF-8');
                return [$key, $techName];
            })(),
            'branch' => (static function () use ($order): array {
                $branchName = trim((string) ($order->branch?->name ?? '')) ?: 'Chi nhánh chính';
                $key = $order->branch_id ? 'branch_' . (int) $order->branch_id : 'branch_default';
                return [$key, $branchName];
            })(),
            'order_type' => (static function () use ($order): array {
                $type = strtolower((string) ($order->order_type ?: 'in_store'));
                $label = match ($type) {
                    'cod'      => 'Đơn COD (Khách tỉnh)',
                    'warranty' => 'Tiếp nhận bảo hành',
                    default    => 'Khách tại cửa hàng',
                };
                return [$type, $label];
            })(),
            default => ['all', 'Tất cả'],
        };
    }

    /**
     * Trích xuất danh sách hạng mục dịch vụ của một đơn hàng để gom nhóm theo 'service'.
     *
     * @return array<int, array{key: string, label: string, estimated_revenue: float, net_payment_collected: float}>
     */
    protected function extractOrderServiceEntries(RepairOrder $order, float $orderEst, float $orderNetPay): array
    {
        $quoteItems = [];
        if ($order->relationLoaded('quotes')) {
            foreach ($order->quotes as $quote) {
                if ($quote->relationLoaded('items')) {
                    foreach ($quote->items as $qi) {
                        $label = trim((string) ($qi->service?->name ?? $qi->description ?? ''));
                        if ($label === '') {
                            continue;
                        }
                        $amt = (float) ($qi->amount ?? ((float) ($qi->unit_price ?? 0) * max(1, (int) ($qi->quantity ?? 1))));
                        $quoteItems[] = [
                            'label'  => $label,
                            'amount' => $amt,
                        ];
                    }
                }
            }
        }

        if (! empty($quoteItems)) {
            $sumItems = array_sum(array_column($quoteItems, 'amount'));
            $mergedByKey = [];
            foreach ($quoteItems as $qi) {
                $label = $qi['label'];
                $key = mb_strtolower($label, 'UTF-8');
                $estShare = $sumItems > 0 ? $qi['amount'] : ($orderEst / count($quoteItems));
                $netShare = $sumItems > 0
                    ? ($orderNetPay * ($qi['amount'] / $sumItems))
                    : ($orderNetPay / count($quoteItems));

                if (! isset($mergedByKey[$key])) {
                    $mergedByKey[$key] = [
                        'key'                   => $key,
                        'label'                 => $label,
                        'estimated_revenue'     => 0.0,
                        'net_payment_collected' => 0.0,
                    ];
                }
                $mergedByKey[$key]['estimated_revenue'] += $estShare;
                $mergedByKey[$key]['net_payment_collected'] += $netShare;
            }

            return array_values($mergedByKey);
        }

        $fallbackLabel = trim((string) ($order->issue_description ?? '')) ?: 'Dịch vụ sửa chữa chung';
        $fallbackKey = mb_strtolower($fallbackLabel, 'UTF-8');

        return [
            [
                'key'                   => $fallbackKey,
                'label'                 => $fallbackLabel,
                'estimated_revenue'     => $orderEst,
                'net_payment_collected' => $orderNetPay,
            ],
        ];
    }

    /**
     * Parse ngày an toàn từ chuỗi YYYY-MM-DD, DD/MM/YYYY hoặc DD/MM (tự động gán năm hiện tại).
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

    /**
     * Kết xuất trực tiếp báo cáo doanh thu & thu chi sổ quỹ (kèm bảng phân rã breakdown & comparison_summary) sang văn bản HTML tiếng Việt.
     */
    public function formatHtml(array $result): string
    {
        if (isset($result['error']) && trim((string) $result['error']) !== '') {
            $safeError = htmlspecialchars(trim((string) $result['error']), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

            return "<b>Từ chối quyền truy cập</b>\n{$safeError}";
        }

        $branchScope = htmlspecialchars(
            (string) ($result['branch_scope'] ?? $result['branch_name'] ?? 'Chi nhánh chính'),
            ENT_QUOTES | ENT_SUBSTITUTE,
            'UTF-8'
        );
        $periodLabel = htmlspecialchars((string) ($result['period_label'] ?? 'Hôm nay'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $totalNew = (int) ($result['total_new_orders'] ?? 0);
        $inStore = (int) ($result['in_store_orders'] ?? 0);
        $cod = (int) ($result['cod_orders'] ?? 0);
        $warranty = (int) ($result['warranty_orders'] ?? 0);
        $completed = (int) ($result['completed_orders'] ?? 0);
        $cancelled = (int) ($result['cancelled_orders'] ?? 0);
        $formattedEstimated = htmlspecialchars((string) ($result['formatted_estimated_order_revenue'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $formattedPayment = htmlspecialchars((string) ($result['formatted_net_payment_collected'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $formattedIncome = htmlspecialchars((string) ($result['formatted_cashbook_income'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $formattedExpense = htmlspecialchars((string) ($result['formatted_cashbook_expense'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $formattedNetCashflow = htmlspecialchars((string) ($result['formatted_net_cashflow'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $lines = [
            "<b>Báo cáo doanh thu - {$periodLabel}</b>",
            "Chi nhánh: <b>{$branchScope}</b>",
            "- Tổng số đơn mới: <b>{$totalNew}</b> đơn (Tại cửa hàng: {$inStore}, COD: {$cod}, Bảo hành: {$warranty})",
            "- Số đơn đã hoàn thành/bàn giao: <b>{$completed}</b> đơn",
        ];

        if ($cancelled > 0) {
            $lines[] = "- Số đơn đã hủy/từ chối sửa: <b>{$cancelled}</b> đơn (đã loại trừ khỏi doanh thu ước tính)";
        }

        $lines[] = "- Doanh thu ước tính từ đơn hàng: <b>{$formattedEstimated}</b>";
        $lines[] = "- Thực thu thanh toán: <b>{$formattedPayment}</b>";
        $lines[] = "- Thu sổ quỹ: <b>{$formattedIncome}</b> | Chi sổ quỹ: <b>{$formattedExpense}</b>";
        $lines[] = "- Dòng tiền ròng sổ quỹ: <b>{$formattedNetCashflow}</b>";

        $comparisonSummary = trim((string) ($result['comparison_summary'] ?? ''));
        if ($comparisonSummary !== '') {
            $safeComparison = htmlspecialchars($comparisonSummary, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $lines[] = "Nhận xét so sánh: <b>{$safeComparison}</b>";
        }

        $breakdown = is_array($result['breakdown'] ?? null) ? $result['breakdown'] : [];
        if (! empty($breakdown)) {
            $lines[] = "<b>Phân tích chi tiết theo nhóm:</b>";
            foreach ($breakdown as $item) {
                if (! is_array($item)) {
                    continue;
                }
                $gLabel = htmlspecialchars((string) ($item['group_label'] ?? $item['label'] ?? 'Nhóm'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $gOrders = (int) ($item['orders_count'] ?? 0);
                $gCompleted = (int) ($item['completed_orders'] ?? 0);
                $gEst = htmlspecialchars((string) ($item['formatted_estimated_revenue'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $gNet = htmlspecialchars((string) ($item['formatted_net_payment_collected'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $gShare = number_format((float) ($item['share_percent'] ?? 0), 1, ',', '.');

                $line = "- <b>{$gLabel}</b>: <b>{$gEst}</b> (Thực thu: {$gNet}) | Số đơn: <b>{$gOrders}</b> (Hoàn thành: {$gCompleted}) | Tỷ trọng: <b>{$gShare}%</b>";

                if (array_key_exists('warranty_count', $item)) {
                    $gWarrantyCount = (int) ($item['warranty_count'] ?? 0);
                    $gReworkCount = (int) ($item['rework_count'] ?? $item['rework_needed'] ?? 0);
                    $gWarrantyRate = number_format((float) ($item['warranty_rate'] ?? 0), 1, ',', '.');
                    $line .= " | Bảo hành: <b>{$gWarrantyCount}</b> đơn (Làm lại: {$gReworkCount}, Tỷ lệ BH: <b>{$gWarrantyRate}%</b>)";
                }

                $lines[] = $line;
            }
        }

        return implode("\n", $lines);
    }
}
