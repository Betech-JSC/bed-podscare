<?php

namespace App\Services\TelegramAi\Tools;

use App\Models\Branch;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\TelegramRecipient;
use App\Models\User;
use App\Services\TelegramAi\Contracts\TelegramAiToolInterface;
use App\Services\TelegramAi\TelegramAiAssistantService;
use Carbon\Carbon;

class StaffKpiTool implements TelegramAiToolInterface
{
    /**
     * Danh sách các trạng thái được tính là đơn đã hoàn thành sửa chữa của Kỹ thuật viên.
     *
     * @var array<int, string>
     */
    public const COMPLETED_STATUSES = [
        'completed',
        'delivered',
        'handed_over',
        'ready_for_pickup',
        'ready_for_return',
        'qc_passed',
    ];

    /**
     * Danh sách các tiêu chí sắp xếp hợp lệ.
     *
     * @var array<int, string>
     */
    public const ALLOWED_SORT_BY = [
        'warranty_rate_desc',
        'warranty_count_desc',
        'completed_desc',
        'revenue_desc',
        'qc_rate_desc',
        'speed_asc',
    ];

    public function name(): string
    {
        return 'get_staff_kpi';
    }

    public function description(): string
    {
        return 'Thống kê và xếp hạng KPI hiệu suất nhân sự (Kỹ thuật viên & CSKH): tổng số đơn (total_orders), đơn hoàn tất (completed_orders), số đơn bảo hành/sửa lại (warranty_count, rework_needed), tỷ lệ bảo hành (warranty_rate %), tỷ lệ đạt QC (qc_pass_rate %), thời gian xử lý trung bình (avg_processing_time_formatted) và doanh thu tạo ra (revenue_generated - chỉ hiển thị cho Admin). Bắt buộc gọi công cụ này khi người dùng hỏi về tỷ lệ bảo hành của kỹ thuật viên, thợ nào bảo hành/làm lại nhiều nhất, hiệu suất thợ, tốc độ sửa chữa hoặc chất lượng QC của kỹ thuật viên.';
    }

    public function parametersSchema(): array
    {
        return [
            'type'       => 'OBJECT',
            'properties' => [
                'period' => [
                    'type'        => 'STRING',
                    'description' => 'Khoảng thời gian thống kê: today (hôm nay), yesterday (hôm qua), this_week (tuần này), this_month (tháng này), 7_days (7 ngày qua), 30_days (30 ngày qua), all (toàn thời gian - mặc định nếu không nêu ngày), hoặc custom (tùy chỉnh theo date_from/date_to).',
                ],
                'date_from' => [
                    'type'        => 'STRING',
                    'description' => 'Ngày bắt đầu (định dạng YYYY-MM-DD, DD/MM/YYYY hoặc DD/MM).',
                ],
                'date_to' => [
                    'type'        => 'STRING',
                    'description' => 'Ngày kết thúc (định dạng YYYY-MM-DD, DD/MM/YYYY hoặc DD/MM).',
                ],
                'branch_name' => [
                    'type'        => 'STRING',
                    'description' => 'Tên hoặc mã chi nhánh cần lọc (ví dụ: Quận 1). Để trống nếu xem toàn bộ chi nhánh được phân quyền.',
                ],
                'technician_name' => [
                    'type'        => 'STRING',
                    'description' => 'Tên kỹ thuật viên hoặc nhân viên cần tra cứu cụ thể (ví dụ: Hoàng, Minh). Để trống nếu muốn xếp hạng/so sánh toàn bộ kỹ thuật viên.',
                ],
                'role' => [
                    'type'        => 'STRING',
                    'description' => 'Vai trò nhân sự cần thống kê: technician (kỹ thuật viên - mặc định), cskh (chăm sóc khách hàng), all (tất cả).',
                ],
                'sort_by' => [
                    'type'        => 'STRING',
                    'enum'        => self::ALLOWED_SORT_BY,
                    'description' => 'Tiêu chí xếp hạng: warranty_rate_desc (tỷ lệ bảo hành cao nhất), warranty_count_desc (số lượng đơn bảo hành nhiều nhất), completed_desc (hoàn thành nhiều đơn nhất), revenue_desc (doanh thu cao nhất), qc_rate_desc (tỷ lệ đạt QC cao nhất), speed_asc (thời gian sửa trung bình nhanh nhất).',
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
     * Parse chuỗi ngày hỗ trợ DD/MM/YYYY, YYYY-MM-DD và DD/MM (tự động lấy năm hiện tại),
     * kết hợp kiểm tra checkdate() để tránh Carbon tự động tràn ngày/tháng.
     */
    public function parseDate(string $value): ?Carbon
    {
        return (new LookupOrderTool())->parseDate($value);
    }

    protected function formatVnd(float $amount): string
    {
        return number_format($amount, 0, ',', '.') . ' đ';
    }

    protected function formatMinutesToDuration(float $avgMinutes): string
    {
        if ($avgMinutes <= 0) {
            return '0m';
        }

        $hoursPart = (int) floor($avgMinutes / 60);
        $minsPart = (int) round(fmod($avgMinutes, 60));
        if ($minsPart === 60) {
            $hoursPart++;
            $minsPart = 0;
        }

        return $hoursPart > 0 ? "{$hoursPart}h {$minsPart}m" : "{$minsPart}m";
    }

    public function execute(array $args, TelegramRecipient $recipient): array
    {
        $tenantId = (int) $recipient->tenant_id;
        $recipientRole = strtolower(trim((string) ($recipient->target_role ?? '')));
        $canViewRevenue = in_array($recipientRole, ['admin', 'super_admin'], true);

        // 1. Chuẩn hóa khoảng thời gian (period / date_from / date_to)
        $rawDateFrom = $this->scalarString($args['date_from'] ?? '');
        $rawDateTo = $this->scalarString($args['date_to'] ?? '');
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
            $period = 'custom';
            $periodLabel = $startDate->isSameDay($endDate)
                ? 'Ngày ' . $startDate->format('d/m/Y')
                : 'Từ ' . $startDate->format('d/m/Y') . ' đến ' . $endDate->format('d/m/Y');
        } else {
            $rawPeriod = strtolower($this->scalarString($args['period'] ?? 'all', 'all'));

            switch ($rawPeriod) {
                case 'today':
                    $period = 'today';
                    $startDate = now()->startOfDay();
                    $endDate = now()->endOfDay();
                    $periodLabel = 'Hôm nay (' . $startDate->format('d/m/Y') . ')';
                    break;

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

                case '7_days':
                    $period = '7_days';
                    $startDate = now()->subDays(6)->startOfDay();
                    $endDate = now()->endOfDay();
                    $periodLabel = '7 ngày qua (' . $startDate->format('d/m/Y') . ' - ' . $endDate->format('d/m/Y') . ')';
                    break;

                case '14_days':
                    $period = '14_days';
                    $startDate = now()->subDays(13)->startOfDay();
                    $endDate = now()->endOfDay();
                    $periodLabel = '14 ngày qua (' . $startDate->format('d/m/Y') . ' - ' . $endDate->format('d/m/Y') . ')';
                    break;

                case '30_days':
                    $period = '30_days';
                    $startDate = now()->subDays(29)->startOfDay();
                    $endDate = now()->endOfDay();
                    $periodLabel = '30 ngày qua (' . $startDate->format('d/m/Y') . ' - ' . $endDate->format('d/m/Y') . ')';
                    break;

                case 'this_month':
                    $period = 'this_month';
                    $startDate = now()->startOfMonth();
                    $endDate = now()->endOfMonth();
                    $periodLabel = 'Tháng này (' . $startDate->format('m/Y') . ')';
                    break;

                default:
                    $period = 'all';
                    $startDate = null;
                    $endDate = null;
                    $periodLabel = 'Toàn thời gian';
                    break;
            }
        }

        // 2. Xác định phạm vi chi nhánh (khóa cứng theo recipient->branch_id nếu có)
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
            $escapedBranch = $this->escapeLike($branchNameArg);
            $matchedBranch = Branch::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where(function ($q) use ($escapedBranch) {
                    $q->where('name', 'like', "%{$escapedBranch}%")
                        ->orWhere('code', 'like', "%{$escapedBranch}%");
                })
                ->first();

            if ($matchedBranch !== null) {
                $branchId = (int) $matchedBranch->id;
                $branchLabel = (string) $matchedBranch->name;
            }
        }

        $technicianName = $this->scalarString($args['technician_name'] ?? '');
        $rawRoleFilter = strtolower($this->scalarString($args['role'] ?? 'technician', 'technician'));
        $roleFilter = in_array($rawRoleFilter, ['technician', 'tech', 'cskh', 'all'], true)
            ? ($rawRoleFilter === 'tech' ? 'technician' : $rawRoleFilter)
            : 'technician';

        $rawSortBy = strtolower($this->scalarString($args['sort_by'] ?? 'warranty_rate_desc', 'warranty_rate_desc'));
        $sortBy = in_array($rawSortBy, self::ALLOWED_SORT_BY, true) ? $rawSortBy : 'warranty_rate_desc';

        $queryTechnicians = in_array($roleFilter, ['technician', 'all'], true);
        $queryCskh = in_array($roleFilter, ['cskh', 'all'], true);

        $staffKpis = [];
        $cskhKpis = [];

        $totalSystemOrders = 0;
        $totalSystemCompleted = 0;
        $totalSystemRework = 0;
        $totalSystemWarranty = 0;
        $totalSystemRevenue = 0.0;
        $totalSystemQcTotal = 0;
        $totalSystemQcPassed = 0;
        $allSystemDurations = [];

        // 3. Thống kê KPI Kỹ thuật viên (đồng bộ công thức KpiController::staff())
        if ($queryTechnicians) {
            $userQuery = User::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->whereIn('role', ['technician', 'tech']);

            if ($branchId !== null) {
                $userQuery->where(function ($q) use ($branchId, $tenantId) {
                    $q->where('branch_id', $branchId)
                        ->orWhereIn('id', function ($sub) use ($branchId, $tenantId) {
                            $sub->select('technician_id')
                                ->from('repair_orders')
                                ->where('tenant_id', $tenantId)
                                ->where('branch_id', $branchId)
                                ->whereNotNull('technician_id');
                        });
                });
            }

            if ($technicianName !== '') {
                $escapedTech = $this->escapeLike($technicianName);
                $userQuery->where('name', 'like', "%{$escapedTech}%");
            }

            $technicians = $userQuery
                ->with(['branch' => fn ($q) => $q->withoutGlobalScopes()->select(['id', 'name', 'code'])])
                ->get([
                    'id',
                    'tenant_id',
                    'branch_id',
                    'name',
                    'email',
                    'phone',
                    'role',
                    'is_active',
                ]);

            // Fallback: nếu có đơn hàng gán cho user có role khác (ví dụ admin trực tiếp sửa máy trong test)
            $assignedTechIdsQuery = RepairOrder::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->whereNotNull('technician_id');
            if ($branchId !== null) {
                $assignedTechIdsQuery->where('branch_id', $branchId);
            }
            if ($startDate !== null && $endDate !== null) {
                $assignedTechIdsQuery->whereBetween('created_at', [$startDate, $endDate]);
            }
            $assignedTechIds = $assignedTechIdsQuery->distinct()->pluck('technician_id')->map(fn ($id) => (int) $id)->all();
            $existingTechIds = $technicians->pluck('id')->map(fn ($id) => (int) $id)->all();
            $missingTechIds = array_values(array_diff($assignedTechIds, $existingTechIds));

            if (! empty($missingTechIds)) {
                $extraUsersQuery = User::withoutGlobalScopes()
                    ->where('tenant_id', $tenantId)
                    ->whereIn('id', $missingTechIds);
                if ($technicianName !== '') {
                    $escapedTech = $this->escapeLike($technicianName);
                    $extraUsersQuery->where('name', 'like', "%{$escapedTech}%");
                }
                $extraTechs = $extraUsersQuery
                    ->with(['branch' => fn ($q) => $q->withoutGlobalScopes()->select(['id', 'name', 'code'])])
                    ->get([
                        'id',
                        'tenant_id',
                        'branch_id',
                        'name',
                        'email',
                        'phone',
                        'role',
                        'is_active',
                    ]);
                $technicians = $technicians->concat($extraTechs);
            }

            $techIds = $technicians->pluck('id')->map(fn ($id) => (int) $id)->all();

            if (! empty($techIds)) {
                $completedListSql = "'" . implode("','", self::COMPLETED_STATUSES) . "'";

                $durationExpr = 'CASE
                    WHEN repair_orders.repair_completed_at IS NOT NULL AND COALESCE(repair_orders.repair_started_at, repair_orders.tech_accepted_at, repair_orders.created_at) IS NOT NULL
                    THEN ABS(TIMESTAMPDIFF(SECOND, COALESCE(repair_orders.repair_started_at, repair_orders.tech_accepted_at, repair_orders.created_at), repair_orders.repair_completed_at)) / 60.0
                    ELSE NULL
                END';

                $ordersStatsQuery = RepairOrder::withoutGlobalScopes()
                    ->where('repair_orders.tenant_id', $tenantId)
                    ->whereIn('repair_orders.technician_id', $techIds)
                    ->selectRaw("
                        repair_orders.technician_id,
                        COUNT(*) AS total_orders,
                        SUM(CASE WHEN repair_orders.status IN ({$completedListSql}) THEN 1 ELSE 0 END) AS completed_count,
                        COALESCE(SUM(CASE WHEN repair_orders.status IN ({$completedListSql}) THEN repair_orders.total_price ELSE 0 END), 0) AS revenue_generated,
                        SUM(CASE WHEN repair_orders.status IN ('assigned', 'in_repair', 'waiting_parts', 'waiting_qc') THEN 1 ELSE 0 END) AS in_repair_count,
                        SUM(CASE WHEN repair_orders.status = 'rework_needed' OR EXISTS (
                            SELECT 1 FROM qc_inspections WHERE qc_inspections.repair_order_id = repair_orders.id AND qc_inspections.result IN ('fail', 'failed', 'rework')
                        ) THEN 1 ELSE 0 END) AS rework_count,
                        SUM(CASE WHEN repair_orders.status = 'rework_needed'
                            OR repair_orders.order_type = 'warranty'
                            OR repair_orders.claim_id IS NOT NULL
                            OR repair_orders.parent_order_id IS NOT NULL
                            OR EXISTS (
                                SELECT 1 FROM qc_inspections WHERE qc_inspections.repair_order_id = repair_orders.id AND qc_inspections.result IN ('fail', 'failed', 'rework')
                            )
                            OR EXISTS (
                                SELECT 1 FROM warranties
                                INNER JOIN warranty_claims ON warranty_claims.warranty_id = warranties.id
                                WHERE warranties.repair_order_id = repair_orders.id
                                AND NOT EXISTS (
                                    SELECT 1 FROM repair_orders AS ro_child
                                    WHERE ro_child.technician_id = repair_orders.technician_id
                                    AND (ro_child.parent_order_id = repair_orders.id OR ro_child.claim_id = warranty_claims.id OR ro_child.id = warranty_claims.rework_order_id)
                                )
                            ) THEN 1 ELSE 0 END) AS warranty_count,
                        SUM(CASE WHEN repair_orders.qc_passed_at IS NOT NULL OR repair_orders.status IN ('ready_for_return', 'waiting_pickup', 'ready_for_pickup', 'completed', 'delivered', 'handed_over', 'qc_passed', 'rework_needed') THEN 1 ELSE 0 END) AS fallback_qc_eligible,
                        SUM(CASE WHEN repair_orders.qc_passed_at IS NOT NULL OR repair_orders.status IN ('ready_for_return', 'waiting_pickup', 'ready_for_pickup', 'completed', 'delivered', 'handed_over', 'qc_passed') THEN 1 ELSE 0 END) AS fallback_qc_passed,
                        AVG({$durationExpr}) AS avg_duration_minutes,
                        COALESCE(SUM({$durationExpr}), 0) AS sum_duration_minutes,
                        COUNT({$durationExpr}) AS count_duration_orders
                    ");

                $qcStatsQuery = QcInspection::withoutGlobalScopes()
                    ->join('repair_orders', 'qc_inspections.repair_order_id', '=', 'repair_orders.id')
                    ->where('repair_orders.tenant_id', $tenantId)
                    ->whereIn('repair_orders.technician_id', $techIds)
                    ->selectRaw("
                        repair_orders.technician_id,
                        COUNT(qc_inspections.id) AS qc_total,
                        SUM(CASE WHEN qc_inspections.result IN ('pass', 'passed') THEN 1 ELSE 0 END) AS qc_passed
                    ");

                if ($branchId !== null) {
                    $ordersStatsQuery->where('repair_orders.branch_id', $branchId);
                    $qcStatsQuery->where('repair_orders.branch_id', $branchId);
                }

                if ($startDate !== null && $endDate !== null) {
                    $ordersStatsQuery->whereBetween('repair_orders.created_at', [$startDate, $endDate]);
                    $qcStatsQuery->whereBetween('repair_orders.created_at', [$startDate, $endDate]);
                }

                $techOrderStats = $ordersStatsQuery
                    ->groupBy('repair_orders.technician_id')
                    ->get()
                    ->keyBy('technician_id');

                $techQcStats = $qcStatsQuery
                    ->groupBy('repair_orders.technician_id')
                    ->get()
                    ->keyBy('technician_id');

                foreach ($technicians as $tech) {
                    $stat = $techOrderStats->get($tech->id);
                    $qcStat = $techQcStats->get($tech->id);

                    $orderCount = (int) ($stat->total_orders ?? 0);
                    $completedCount = (int) ($stat->completed_count ?? 0);
                    $inRepairCount = (int) ($stat->in_repair_count ?? 0);
                    $reworkCount = (int) ($stat->rework_count ?? 0);
                    $techWarrantyCount = (int) ($stat->warranty_count ?? 0);

                    $techWarrantyRate = $completedCount > 0
                        ? round(($techWarrantyCount / $completedCount) * 100, 1)
                        : ($orderCount > 0 ? round(($techWarrantyCount / $orderCount) * 100, 1) : 0.0);

                    $rawRevenue = (float) ($stat->revenue_generated ?? 0);
                    $revenueGenerated = $canViewRevenue ? $rawRevenue : null;
                    $revenueGeneratedFormatted = $canViewRevenue ? $this->formatVnd($rawRevenue) : null;

                    $qcTotal = (int) ($qcStat->qc_total ?? 0);
                    $qcPassed = (int) ($qcStat->qc_passed ?? 0);

                    if ($qcTotal > 0) {
                        $qcPassRate = round(($qcPassed / $qcTotal) * 100, 1);
                    } else {
                        $eligibleCount = (int) ($stat->fallback_qc_eligible ?? 0);
                        $passedCount = (int) ($stat->fallback_qc_passed ?? 0);
                        $qcPassRate = $eligibleCount > 0
                            ? round(($passedCount / $eligibleCount) * 100, 1)
                            : null;
                    }

                    $durationOrdersCount = (int) ($stat->count_duration_orders ?? 0);
                    $avgMinutes = $durationOrdersCount > 0 ? round((float) $stat->avg_duration_minutes, 1) : 0.0;
                    $avgHours = round($avgMinutes / 60, 2);
                    $formattedTime = $this->formatMinutesToDuration($avgMinutes);

                    $totalSystemOrders += $orderCount;
                    $totalSystemCompleted += $completedCount;
                    $totalSystemRework += $reworkCount;
                    $totalSystemWarranty += $techWarrantyCount;
                    $totalSystemRevenue += $rawRevenue;
                    $totalSystemQcTotal += $qcTotal;
                    $totalSystemQcPassed += $qcPassed;

                    if ($durationOrdersCount > 0) {
                        $allSystemDurations[] = [
                            'sum'   => (float) ($stat->sum_duration_minutes ?? 0),
                            'count' => $durationOrdersCount,
                        ];
                    }

                    $staffKpis[] = [
                        'id'                            => (int) $tech->id,
                        'technician_id'                 => (int) $tech->id,
                        'name'                          => (string) $tech->name,
                        'technician_name'               => (string) $tech->name,
                        'email'                         => (string) ($tech->email ?? ''),
                        'phone'                         => (string) ($tech->phone ?? ''),
                        'role'                          => 'Kỹ thuật viên',
                        'user_role'                     => (string) $tech->role,
                        'branch_id'                     => $tech->branch_id !== null ? (int) $tech->branch_id : null,
                        'branch_name'                   => (string) ($tech->branch?->name ?? $branchLabel),
                        'total_orders'                  => $orderCount,
                        'orders_count'                  => $orderCount,
                        'completed'                     => $completedCount,
                        'completed_orders'              => $completedCount,
                        'in_repair'                     => $inRepairCount,
                        'rework_needed'                 => $reworkCount,
                        'rework_count'                  => $reworkCount,
                        'warranty_count'                => $techWarrantyCount,
                        'warranty_rate'                 => $techWarrantyRate,
                        'warranty_rate_formatted'       => "{$techWarrantyRate}%",
                        'qc_passed'                     => $qcPassed,
                        'qc_total'                      => $qcTotal,
                        'qc_pass_rate'                  => $qcPassRate,
                        'qc_pass_rate_formatted'        => $qcPassRate !== null ? "{$qcPassRate}%" : 'Chưa có QC',
                        'avg_processing_time_minutes'   => $avgMinutes,
                        'avg_processing_time_hours'     => $avgHours,
                        'avg_processing_time_formatted' => $formattedTime,
                        'revenue_generated'             => $revenueGenerated,
                        'revenue_generated_formatted'   => $revenueGeneratedFormatted,
                        'formatted_revenue'             => $revenueGeneratedFormatted,
                    ];
                }
            }

            // Sắp xếp danh sách Kỹ thuật viên theo sort_by
            usort($staffKpis, function (array $a, array $b) use ($sortBy, $canViewRevenue): int {
                return match ($sortBy) {
                    'warranty_rate_desc' => ($b['warranty_rate'] <=> $a['warranty_rate'])
                        ?: ($b['warranty_count'] <=> $a['warranty_count'])
                        ?: ($b['rework_needed'] <=> $a['rework_needed'])
                        ?: ($b['completed_orders'] <=> $a['completed_orders']),
                    'warranty_count_desc' => ($b['warranty_count'] <=> $a['warranty_count'])
                        ?: ($b['warranty_rate'] <=> $a['warranty_rate'])
                        ?: ($b['rework_needed'] <=> $a['rework_needed'])
                        ?: ($b['completed_orders'] <=> $a['completed_orders']),
                    'revenue_desc' => (
                        $canViewRevenue
                            ? (($b['revenue_generated'] ?? 0) <=> ($a['revenue_generated'] ?? 0))
                            : 0
                    ) ?: ($b['completed_orders'] <=> $a['completed_orders'])
                      ?: ($b['total_orders'] <=> $a['total_orders']),
                    'qc_rate_desc' => (($b['qc_pass_rate'] ?? -1) <=> ($a['qc_pass_rate'] ?? -1))
                        ?: ($b['completed_orders'] <=> $a['completed_orders']),
                    'speed_asc' => (
                        ($a['avg_processing_time_minutes'] > 0 ? $a['avg_processing_time_minutes'] : 999999)
                        <=>
                        ($b['avg_processing_time_minutes'] > 0 ? $b['avg_processing_time_minutes'] : 999999)
                    ) ?: ($b['completed_orders'] <=> $a['completed_orders']),
                    default => ($b['completed_orders'] <=> $a['completed_orders'])
                        ?: ($b['total_orders'] <=> $a['total_orders'])
                        ?: ($a['warranty_rate'] <=> $b['warranty_rate']),
                };
            });
        }

        // 4. Thống kê KPI CSKH (nếu role = 'cskh' hoặc 'all')
        if ($queryCskh) {
            $cskhQuery = User::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where('role', 'cskh');

            if ($branchId !== null) {
                $cskhQuery->where('branch_id', $branchId);
            }

            if ($technicianName !== '') {
                $escapedName = $this->escapeLike($technicianName);
                $cskhQuery->where('name', 'like', "%{$escapedName}%");
            }

            $cskhUsers = $cskhQuery
                ->with(['branch' => fn ($q) => $q->withoutGlobalScopes()->select(['id', 'name', 'code'])])
                ->get([
                    'id',
                    'tenant_id',
                    'branch_id',
                    'name',
                    'email',
                    'phone',
                    'role',
                    'is_active',
                ]);

            $cskhIds = $cskhUsers->pluck('id')->map(fn ($id) => (int) $id)->all();

            if (! empty($cskhIds)) {
                $completedListSql = "'" . implode("','", self::COMPLETED_STATUSES) . "'";
                $cskhOrdersQuery = RepairOrder::withoutGlobalScopes()
                    ->where('repair_orders.tenant_id', $tenantId)
                    ->whereIn('repair_orders.created_by_user_id', $cskhIds)
                    ->selectRaw("
                        repair_orders.created_by_user_id,
                        COUNT(*) AS created_count,
                        SUM(CASE WHEN repair_orders.status IN ({$completedListSql}) THEN 1 ELSE 0 END) AS completed_count,
                        COALESCE(SUM(CASE WHEN repair_orders.status IN ({$completedListSql}) THEN repair_orders.total_price ELSE 0 END), 0) AS revenue_generated
                    ");

                if ($branchId !== null) {
                    $cskhOrdersQuery->where('repair_orders.branch_id', $branchId);
                }

                if ($startDate !== null && $endDate !== null) {
                    $cskhOrdersQuery->whereBetween('repair_orders.created_at', [$startDate, $endDate]);
                }

                $cskhOrderStats = $cskhOrdersQuery
                    ->groupBy('repair_orders.created_by_user_id')
                    ->get()
                    ->keyBy('created_by_user_id');

                foreach ($cskhUsers as $cskh) {
                    $cStat = $cskhOrderStats->get($cskh->id);
                    $createdCount = (int) ($cStat->created_count ?? 0);
                    $completedCount = (int) ($cStat->completed_count ?? 0);
                    $conversionRate = $createdCount > 0 ? round(($completedCount / $createdCount) * 100, 1) : 0.0;
                    $rawCskhRev = (float) ($cStat->revenue_generated ?? 0);

                    $cskhKpis[] = [
                        'id'                          => (int) $cskh->id,
                        'user_id'                     => (int) $cskh->id,
                        'name'                        => (string) $cskh->name,
                        'email'                       => (string) ($cskh->email ?? ''),
                        'phone'                       => (string) ($cskh->phone ?? ''),
                        'role'                        => 'CSKH',
                        'user_role'                   => 'cskh',
                        'branch_id'                   => $cskh->branch_id !== null ? (int) $cskh->branch_id : null,
                        'branch_name'                 => (string) ($cskh->branch?->name ?? $branchLabel),
                        'total_orders'                => $createdCount,
                        'orders_created_count'        => $createdCount,
                        'completed'                   => $completedCount,
                        'completed_orders'            => $completedCount,
                        'conversion_rate'             => $conversionRate,
                        'conversion_rate_formatted'   => "{$conversionRate}%",
                        'revenue_generated'           => $canViewRevenue ? $rawCskhRev : null,
                        'revenue_generated_formatted' => $canViewRevenue ? $this->formatVnd($rawCskhRev) : null,
                    ];
                }
            }
        }

        // 5. Tổng hợp số liệu toàn hệ thống / chi nhánh
        $durationSum = array_sum(array_column($allSystemDurations, 'sum'));
        $durationCount = array_sum(array_column($allSystemDurations, 'count'));
        $systemAvgMinutes = $durationCount > 0 ? round($durationSum / $durationCount, 1) : 0.0;
        $systemFormattedTime = $this->formatMinutesToDuration($systemAvgMinutes);

        $systemQcRate = $totalSystemQcTotal > 0
            ? round(($totalSystemQcPassed / $totalSystemQcTotal) * 100, 1)
            : ($totalSystemCompleted > 0 ? 100.0 : null);

        $systemWarrantyRate = $totalSystemCompleted > 0
            ? round(($totalSystemWarranty / $totalSystemCompleted) * 100, 1)
            : ($totalSystemOrders > 0 ? round(($totalSystemWarranty / $totalSystemOrders) * 100, 1) : 0.0);

        $summary = [
            'total_technicians'             => count($staffKpis),
            'total_cskh'                    => count($cskhKpis),
            'total_orders'                  => $totalSystemOrders,
            'completed_orders'              => $totalSystemCompleted,
            'rework_needed'                 => $totalSystemRework,
            'warranty_count'                => $totalSystemWarranty,
            'warranty_rate'                 => $systemWarrantyRate,
            'warranty_rate_formatted'       => "{$systemWarrantyRate}%",
            'qc_pass_rate'                  => $systemQcRate,
            'avg_processing_time_minutes'   => $systemAvgMinutes,
            'avg_processing_time_formatted' => $systemFormattedTime,
            'revenue_generated'             => $canViewRevenue ? $totalSystemRevenue : null,
            'revenue_generated_formatted'   => $canViewRevenue ? $this->formatVnd($totalSystemRevenue) : null,
        ];

        $selectedStaff = match ($roleFilter) {
            'cskh'  => $cskhKpis,
            'all'   => array_merge($staffKpis, $cskhKpis),
            default => $staffKpis,
        };

        $comparisonSummary = $this->buildComparisonSummary($staffKpis, $sortBy, $canViewRevenue);

        return [
            'period'                  => $period,
            'period_label'            => $periodLabel,
            'date_from'               => $startDate?->format('Y-m-d'),
            'date_to'                 => $endDate?->format('Y-m-d'),
            'branch_id'               => $branchId,
            'branch_name'             => $branchLabel,
            'branch_scope'            => $branchLabel,
            'role'                    => $roleFilter,
            'sort_by'                 => $sortBy,
            'revenue_fields_redacted' => ! $canViewRevenue,
            'summary'                 => $summary,
            'top_technician'          => $staffKpis[0] ?? null,
            'comparison_summary'      => $comparisonSummary,
            'staff'                   => $selectedStaff,
            'technicians'             => $staffKpis,
            'cskh'                    => $cskhKpis,
            'breakdown'               => $selectedStaff,
        ];
    }

    /**
     * Xây dựng nhận xét so sánh trực diện bằng tiếng Việt dựa trên danh sách Kỹ thuật viên đã xếp hạng.
     *
     * @param  array<int, array<string, mixed>>  $staffKpis
     */
    protected function buildComparisonSummary(array $staffKpis, string $sortBy, bool $canViewRevenue): ?string
    {
        if (empty($staffKpis)) {
            return null;
        }

        $first = $staffKpis[0];
        $second = $staffKpis[1] ?? null;

        if (in_array($sortBy, ['warranty_rate_desc', 'warranty_count_desc'], true)) {
            if ($second !== null) {
                return sprintf(
                    '%s có tỷ lệ bảo hành/làm lại cao nhất ở mức %s (%d đơn bảo hành / %d đơn hoàn tất, tổng %d đơn), xếp trên %s (%s - %d đơn bảo hành / %d đơn hoàn tất)',
                    $first['name'],
                    $first['warranty_rate_formatted'],
                    (int) $first['warranty_count'],
                    (int) $first['completed_orders'],
                    (int) $first['total_orders'],
                    $second['name'],
                    $second['warranty_rate_formatted'],
                    (int) $second['warranty_count'],
                    (int) $second['completed_orders']
                );
            }

            return sprintf(
                '%s có tỷ lệ bảo hành/làm lại là %s (%d đơn bảo hành / %d đơn hoàn tất)',
                $first['name'],
                $first['warranty_rate_formatted'],
                (int) $first['warranty_count'],
                (int) $first['completed_orders']
            );
        }

        if ($sortBy === 'speed_asc') {
            return sprintf(
                '%s có thời gian xử lý trung bình nhanh nhất (%s/đơn, hoàn tất %d đơn, tỷ lệ bảo hành %s)',
                $first['name'],
                $first['avg_processing_time_formatted'],
                (int) $first['completed_orders'],
                $first['warranty_rate_formatted']
            );
        }

        if ($sortBy === 'qc_rate_desc') {
            return sprintf(
                '%s dẫn đầu tỷ lệ đạt QC (%s, hoàn tất %d đơn, tỷ lệ bảo hành %s)',
                $first['name'],
                $first['qc_pass_rate_formatted'],
                (int) $first['completed_orders'],
                $first['warranty_rate_formatted']
            );
        }

        if ($sortBy === 'revenue_desc' && $canViewRevenue) {
            return sprintf(
                '%s dẫn đầu doanh thu kỹ thuật với %s (%d đơn hoàn tất, tỷ lệ bảo hành %s)',
                $first['name'],
                (string) ($first['revenue_generated_formatted'] ?? '0 đ'),
                (int) $first['completed_orders'],
                $first['warranty_rate_formatted']
            );
        }

        return sprintf(
            '%s dẫn đầu số đơn hoàn tất với %d/%d đơn (tỷ lệ bảo hành %s, thời gian TB %s)',
            $first['name'],
            (int) $first['completed_orders'],
            (int) $first['total_orders'],
            $first['warranty_rate_formatted'],
            $first['avg_processing_time_formatted']
        );
    }

    /**
     * Kết xuất trực tiếp báo cáo KPI nhân sự & tỷ lệ bảo hành kỹ thuật viên sang HTML tiếng Việt chuẩn gửi về Telegram.
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
        $periodLabel = htmlspecialchars(
            (string) ($result['period_label'] ?? 'Toàn thời gian'),
            ENT_QUOTES | ENT_SUBSTITUTE,
            'UTF-8'
        );
        $canViewRevenue = empty($result['revenue_fields_redacted']);

        $technicians = is_array($result['technicians'] ?? null) ? $result['technicians'] : [];
        $cskhList = is_array($result['cskh'] ?? null) ? $result['cskh'] : [];
        $summary = is_array($result['summary'] ?? null) ? $result['summary'] : [];

        if (empty($technicians) && empty($cskhList)) {
            return "<b>Báo cáo KPI nhân sự - {$periodLabel}</b>\nKhông tìm thấy dữ liệu nhân sự khớp với điều kiện tra cứu tại chi nhánh <b>{$branchScope}</b>.";
        }

        $totalOrders = (int) ($summary['total_orders'] ?? 0);
        $totalCompleted = (int) ($summary['completed_orders'] ?? 0);
        $totalWarranty = (int) ($summary['warranty_count'] ?? 0);
        $systemWarrantyRate = htmlspecialchars((string) ($summary['warranty_rate_formatted'] ?? '0%'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $systemAvgTime = htmlspecialchars((string) ($summary['avg_processing_time_formatted'] ?? '0m'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $lines = [
            "<b>Báo cáo KPI & Hiệu suất Kỹ thuật viên - {$periodLabel}</b>",
            "Chi nhánh: <b>{$branchScope}</b>",
            "- Tổng đơn phân công: <b>{$totalOrders}</b> đơn | Đã hoàn tất: <b>{$totalCompleted}</b> đơn",
            "- Tổng đơn bảo hành/làm lại: <b>{$totalWarranty}</b> đơn (Tỷ lệ bảo hành chung: <b>{$systemWarrantyRate}</b>) | Thời gian sửa TB: <b>{$systemAvgTime}</b>",
        ];

        if ($canViewRevenue && ! empty($summary['revenue_generated_formatted'])) {
            $sysRev = htmlspecialchars((string) $summary['revenue_generated_formatted'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $lines[] = "- Tổng doanh thu kỹ thuật hoàn tất: <b>{$sysRev}</b>";
        }

        $comparisonSummary = trim((string) ($result['comparison_summary'] ?? ''));
        if ($comparisonSummary !== '') {
            $safeComp = htmlspecialchars($comparisonSummary, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $lines[] = "Nhận xét xếp hạng: <b>{$safeComp}</b>";
        }

        if (! empty($technicians)) {
            $lines[] = "<b>Bảng xếp hạng Kỹ thuật viên:</b>";
            foreach ($technicians as $idx => $tech) {
                if (! is_array($tech)) {
                    continue;
                }
                $rank = $idx + 1;
                $name = htmlspecialchars((string) ($tech['name'] ?? 'KTV'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $tOrders = (int) ($tech['total_orders'] ?? 0);
                $tComp = (int) ($tech['completed_orders'] ?? 0);
                $tWarCount = (int) ($tech['warranty_count'] ?? 0);
                $tRework = (int) ($tech['rework_needed'] ?? 0);
                $tWarRate = htmlspecialchars((string) ($tech['warranty_rate_formatted'] ?? '0%'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $tQcRate = htmlspecialchars((string) ($tech['qc_pass_rate_formatted'] ?? 'Chưa có QC'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $tAvgTime = htmlspecialchars((string) ($tech['avg_processing_time_formatted'] ?? '0m'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

                $row = "- Hạng {$rank}: <b>{$name}</b> | Hoàn tất: <b>{$tComp}/{$tOrders} đơn</b>"
                    . " | Bảo hành/Làm lại: <b>{$tWarCount} đơn</b> (Tỷ lệ BH: <b>{$tWarRate}</b>, Cần sửa lại: {$tRework})"
                    . " | Đạt QC: <b>{$tQcRate}</b> | Tốc độ TB: <b>{$tAvgTime}</b>";

                if ($canViewRevenue && ! empty($tech['revenue_generated_formatted'])) {
                    $tRev = htmlspecialchars((string) $tech['revenue_generated_formatted'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                    $row .= " | Doanh thu: <b>{$tRev}</b>";
                }

                $lines[] = $row;
            }
        }

        if (! empty($cskhList)) {
            $lines[] = "<b>Thống kê Nhân viên CSKH:</b>";
            foreach ($cskhList as $cskh) {
                if (! is_array($cskh)) {
                    continue;
                }
                $cName = htmlspecialchars((string) ($cskh['name'] ?? 'CSKH'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $cCreated = (int) ($cskh['orders_created_count'] ?? 0);
                $cComp = (int) ($cskh['orders_completed_count'] ?? 0);
                $cConv = htmlspecialchars((string) ($cskh['conversion_rate_formatted'] ?? '0%'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

                $row = "- <b>{$cName}</b>: Tiếp nhận <b>{$cCreated} đơn</b> | Hoàn tất: <b>{$cComp} đơn</b> (Chuyển đổi: <b>{$cConv}</b>)";
                if ($canViewRevenue && ! empty($cskh['revenue_generated_formatted'])) {
                    $cRev = htmlspecialchars((string) $cskh['revenue_generated_formatted'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                    $row .= " | Doanh thu: <b>{$cRev}</b>";
                }
                $lines[] = $row;
            }
        }

        return implode("\n", $lines);
    }
}
