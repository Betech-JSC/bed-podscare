<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Part;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class KpiController extends Controller
{
    /**
     * Thống kê KPI hiệu suất nhân sự và kỹ thuật viên.
     *
     * Truy vấn tổng hợp số lượng đơn đã sửa theo KTV từ bảng repair_orders:
     * - Tổng đơn hoàn tất (completed)
     * - Đơn bảo hành / sửa lại (rework_needed)
     * - Tỉ lệ đạt QC (qc_pass_rate)
     * - Thời gian xử lý trung bình (avg_processing_time)
     */
    public function staff(Request $request): JsonResponse
    {
        $user = $request->user();
        $isAdminOrSuper = $user && in_array($user->role, ['admin', 'super_admin'], true);
        $canViewRevenue = $user && in_array($user->role, ['admin', 'super_admin', 'manager'], true);

        $branchId = $request->input('branch_id');
        if (! $isAdminOrSuper && $user && $user->branch_id) {
            $branchId = $user->branch_id;
        }

        $techId = $request->input('technician_id');
        $roleFilter = $request->input('role');
        $tz = 'Asia/Ho_Chi_Minh';
        $fromDate = $request->input('from_date', $request->input('date_from'));
        $toDate = $request->input('to_date', $request->input('date_to'));
        $dateInput = $request->input('date', $request->input('target_date'));
        $periodInput = $request->input('period');

        if (! $fromDate && ! $toDate && ($dateInput || $periodInput)) {
            $anchorDate = $dateInput ? Carbon::parse($dateInput, $tz) : Carbon::today($tz);
            switch ($periodInput) {
                case 'today':
                    $fromDate = $anchorDate->copy()->toDateString();
                    $toDate = $anchorDate->copy()->toDateString();
                    break;
                case 'yesterday':
                    $yesterday = $anchorDate->copy()->subDay()->toDateString();
                    $fromDate = $yesterday;
                    $toDate = $yesterday;
                    break;
                case '7_days':
                    $fromDate = $anchorDate->copy()->subDays(6)->toDateString();
                    $toDate = $anchorDate->copy()->toDateString();
                    break;
                case '14_days':
                    $fromDate = $anchorDate->copy()->subDays(13)->toDateString();
                    $toDate = $anchorDate->copy()->toDateString();
                    break;
                case '30_days':
                    $fromDate = $anchorDate->copy()->subDays(29)->toDateString();
                    $toDate = $anchorDate->copy()->toDateString();
                    break;
                case 'this_month':
                    $fromDate = $anchorDate->copy()->startOfMonth()->toDateString();
                    $toDate = $anchorDate->copy()->endOfMonth()->toDateString();
                    break;
                default:
                    if ($dateInput) {
                        $fromDate = $anchorDate->copy()->toDateString();
                        $toDate = $anchorDate->copy()->toDateString();
                    }
                    break;
            }
        }
        if ($fromDate && ! $toDate) {
            $toDate = $fromDate;
        } elseif (! $fromDate && $toDate) {
            $fromDate = $toDate;
        }
        if ($fromDate && $toDate && $fromDate > $toDate) {
            [$fromDate, $toDate] = [$toDate, $fromDate];
        }

        $queryTechnicians = ! $roleFilter || $roleFilter === 'all' || in_array($roleFilter, ['technician', 'tech'], true);
        $queryCskh = ! $roleFilter || $roleFilter === 'all' || $roleFilter === 'cskh';

        // 1. Lọc và thống kê nhân viên kỹ thuật
        $technicians = collect();
        $staffKpis = [];
        $totalSystemOrders = 0;
        $totalSystemCompleted = 0;
        $totalSystemRework = 0;
        $totalSystemWarranty = 0;
        $allSystemDurations = [];
        $totalSystemQcTotal = 0;
        $totalSystemQcPassed = 0;

        if ($queryTechnicians) {
            $userQuery = User::whereIn('role', ['technician', 'tech']);

            if ($user && $user->tenant_id && $user->role !== 'super_admin') {
                $userQuery->where('tenant_id', $user->tenant_id);
            }

            if ($branchId && $branchId !== 'all') {
                $userQuery->where('branch_id', $branchId);
            }

            if ($techId) {
                $userQuery->where('id', $techId);
            }

            $technicians = $userQuery->with('branch:id,name,code')->get([
                'id',
                'tenant_id',
                'branch_id',
                'name',
                'email',
                'phone',
                'role',
                'avatar_url',
                'is_active',
            ]);

            // Nếu chỉ định technician_id cụ thể nhưng user mang vai trò khác (ví dụ admin test)
            if ($techId && $technicians->isEmpty()) {
                $fallbackTechQuery = User::where('id', $techId)->with('branch:id,name,code');
                if ($user && $user->tenant_id && $user->role !== 'super_admin') {
                    $fallbackTechQuery->where('tenant_id', $user->tenant_id);
                }
                $technicians = $fallbackTechQuery->get([
                    'id',
                    'tenant_id',
                    'branch_id',
                    'name',
                    'email',
                    'phone',
                    'role',
                    'avatar_url',
                    'is_active',
                ]);
            }

            // Nếu không có KTV nào thỏa mãn và không có techId/branchId, fallback trong tenant
            if ($technicians->isEmpty() && ! $techId && ! $branchId) {
                $fallbackAllQuery = User::whereIn('role', ['technician', 'tech'])->with('branch:id,name,code');
                if ($user && $user->tenant_id && $user->role !== 'super_admin') {
                    $fallbackAllQuery->where('tenant_id', $user->tenant_id);
                }
                $technicians = $fallbackAllQuery->limit(10)->get([
                    'id',
                    'tenant_id',
                    'branch_id',
                    'name',
                    'email',
                    'phone',
                    'role',
                    'avatar_url',
                    'is_active',
                ]);
            }

            $techIds = $technicians->pluck('id')->all();
            $techOrderStats = collect();
            $techQcStats = collect();

            if (! empty($techIds)) {
                $durationExpr = 'CASE
                    WHEN repair_orders.repair_completed_at IS NOT NULL AND COALESCE(repair_orders.repair_started_at, repair_orders.tech_accepted_at, repair_orders.created_at) IS NOT NULL
                    THEN ABS(TIMESTAMPDIFF(SECOND, COALESCE(repair_orders.repair_started_at, repair_orders.tech_accepted_at, repair_orders.created_at), repair_orders.repair_completed_at)) / 60.0
                    ELSE NULL
                END';

                $ordersStatsQuery = RepairOrder::query()
                    ->whereIn('repair_orders.technician_id', $techIds)
                    ->selectRaw("
                        repair_orders.technician_id,
                        COUNT(*) AS total_orders,
                        SUM(CASE WHEN repair_orders.status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
                        COALESCE(SUM(CASE WHEN repair_orders.status = 'completed' THEN repair_orders.total_price ELSE 0 END), 0) AS revenue_generated,
                        SUM(CASE WHEN repair_orders.status IN ('assigned', 'in_repair', 'waiting_parts', 'waiting_qc') THEN 1 ELSE 0 END) AS in_repair_count,
                        SUM(CASE WHEN repair_orders.status = 'rework_needed' OR EXISTS (
                            SELECT 1 FROM qc_inspections WHERE qc_inspections.repair_order_id = repair_orders.id AND qc_inspections.result = 'fail'
                        ) THEN 1 ELSE 0 END) AS rework_count,
                        SUM(CASE WHEN repair_orders.status = 'rework_needed'
                            OR repair_orders.order_type = 'warranty'
                            OR repair_orders.claim_id IS NOT NULL
                            OR repair_orders.parent_order_id IS NOT NULL
                            OR EXISTS (
                                SELECT 1 FROM qc_inspections WHERE qc_inspections.repair_order_id = repair_orders.id AND qc_inspections.result = 'fail'
                            ) THEN 1 ELSE 0 END) AS warranty_count,
                        SUM(CASE WHEN repair_orders.qc_passed_at IS NOT NULL OR repair_orders.status IN ('ready_for_return', 'waiting_pickup', 'completed', 'rework_needed') THEN 1 ELSE 0 END) AS fallback_qc_eligible,
                        SUM(CASE WHEN repair_orders.qc_passed_at IS NOT NULL OR repair_orders.status IN ('ready_for_return', 'waiting_pickup', 'completed') THEN 1 ELSE 0 END) AS fallback_qc_passed,
                        AVG({$durationExpr}) AS avg_duration_minutes,
                        COALESCE(SUM({$durationExpr}), 0) AS sum_duration_minutes,
                        COUNT({$durationExpr}) AS count_duration_orders
                    ");

                $qcStatsQuery = \App\Models\QcInspection::withoutGlobalScopes()
                    ->join('repair_orders', 'qc_inspections.repair_order_id', '=', 'repair_orders.id')
                    ->whereIn('repair_orders.technician_id', $techIds)
                    ->selectRaw("
                        repair_orders.technician_id,
                        COUNT(qc_inspections.id) AS qc_total,
                        SUM(CASE WHEN qc_inspections.result = 'pass' THEN 1 ELSE 0 END) AS qc_passed
                    ");

                if ($user && $user->tenant_id && $user->role !== 'super_admin') {
                    $ordersStatsQuery->where('repair_orders.tenant_id', $user->tenant_id);
                    $qcStatsQuery->where('repair_orders.tenant_id', $user->tenant_id);
                }

                if ($branchId && $branchId !== 'all') {
                    $ordersStatsQuery->where('repair_orders.branch_id', $branchId);
                    $qcStatsQuery->where('repair_orders.branch_id', $branchId);
                }

                if ($fromDate) {
                    $fromBound = Carbon::parse($fromDate)->startOfDay();
                    $ordersStatsQuery->where('repair_orders.created_at', '>=', $fromBound);
                    $qcStatsQuery->where('repair_orders.created_at', '>=', $fromBound);
                }

                if ($toDate) {
                    $toBound = Carbon::parse($toDate)->endOfDay();
                    $ordersStatsQuery->where('repair_orders.created_at', '<=', $toBound);
                    $qcStatsQuery->where('repair_orders.created_at', '<=', $toBound);
                }

                $techOrderStats = $ordersStatsQuery
                    ->groupBy('repair_orders.technician_id')
                    ->get()
                    ->keyBy('technician_id');

                $techQcStats = $qcStatsQuery
                    ->groupBy('repair_orders.technician_id')
                    ->get()
                    ->keyBy('technician_id');
            }

            foreach ($technicians as $tech) {
                $stat = $techOrderStats->get($tech->id);
                $qcStat = $techQcStats->get($tech->id);

                $orderCount = (int) ($stat->total_orders ?? 0);
                $completedCount = (int) ($stat->completed_count ?? 0);

                // Doanh thu dịch vụ tạo ra (Task 1.1 & 1.2)
                $revenueGenerated = (float) ($stat->revenue_generated ?? 0);
                $revenueGeneratedFormatted = number_format($revenueGenerated, 0, ',', '.') . ' ₫';

                if (! $canViewRevenue) {
                    $revenueGenerated = null;
                    $revenueGeneratedFormatted = null;
                }

                // Đơn sửa lại / bảo hành (rework_needed hoặc fail QC)
                $reworkCount = (int) ($stat->rework_count ?? 0);

                // Tỷ lệ bảo hành / sửa lại của KTV
                $techWarrantyCount = (int) ($stat->warranty_count ?? 0);
                $techWarrantyRate = $completedCount > 0
                    ? round(($techWarrantyCount / $completedCount) * 100, 1)
                    : 0.0;

                // Tỉ lệ đạt QC
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

                // Thời gian xử lý trung bình (phút)
                $durationOrdersCount = (int) ($stat->count_duration_orders ?? 0);
                $avgMinutes = $durationOrdersCount > 0 ? round((float) $stat->avg_duration_minutes, 1) : 0.0;
                $avgHours = round($avgMinutes / 60, 2);

                $hoursPart = floor($avgMinutes / 60);
                $minsPart = round($avgMinutes % 60);
                $formattedTime = $hoursPart > 0 ? "{$hoursPart}h {$minsPart}m" : "{$minsPart}m";

                // Tích lũy số liệu toàn hệ thống
                $totalSystemOrders += $orderCount;
                $totalSystemCompleted += $completedCount;
                $totalSystemRework += $reworkCount;
                $totalSystemWarranty += $techWarrantyCount;
                $totalSystemQcTotal += $qcTotal;
                $totalSystemQcPassed += $qcPassed;
                if ($durationOrdersCount > 0) {
                    $allSystemDurations[] = [
                        'sum'   => (float) ($stat->sum_duration_minutes ?? 0),
                        'count' => $durationOrdersCount,
                    ];
                }

                $roleLabel = match ($tech->role) {
                    'technician', 'tech' => 'Kỹ thuật viên',
                    'cskh'               => 'CSKH',
                    'qc'                 => 'Kiểm định QC',
                    default              => 'Kỹ thuật viên',
                };

                // Điểm đánh giá (rating) và trend tính động từ dữ liệu thực tế
                $rating = null;
                if ($orderCount > 0) {
                    if ($qcPassRate !== null) {
                        $score = round(($qcPassRate / 100) * 5, 1);
                        $rating = "{$score}/5";
                    } elseif ($completedCount > 0) {
                        $score = round(($completedCount / $orderCount) * 5, 1);
                        $rating = "{$score}/5";
                    }
                }

                $staffKpis[] = [
                    'id'                           => $tech->id,
                    'technician_id'                => $tech->id,
                    'name'                         => $tech->name,
                    'email'                        => $tech->email,
                    'phone'                        => $tech->phone,
                    'role'                         => $roleLabel,
                    'user_role'                    => $tech->role,
                    'branch_id'                    => $tech->branch_id,
                    'branch_name'                  => $tech->branch?->name,
                    'count'                        => "{$orderCount} đơn",
                    'total_orders'                 => $orderCount,
                    'completed'                    => $completedCount,
                    'rework_needed'                => $reworkCount,
                    'warranty_count'               => $techWarrantyCount,
                    'warranty_rate'                => $techWarrantyRate,
                    'warranty_rate_formatted'      => "{$techWarrantyRate}%",
                    'in_repair'                    => (int) ($stat->in_repair_count ?? 0),
                    'qc_passed'                    => $qcPassed,
                    'qc_total'                     => $qcTotal,
                    'qc_pass_rate'                 => $qcPassRate,
                    'qcPass'                       => $qcPassRate !== null ? "{$qcPassRate}%" : null,
                    'rating'                       => $rating,
                    'trend'                        => null,
                    'avg_processing_time_minutes'  => $avgMinutes,
                    'avg_processing_time_hours'    => $avgHours,
                    'avg_processing_time_formatted'=> $formattedTime,
                    'revenue_generated'            => $revenueGenerated,
                    'revenue_generated_formatted'  => $revenueGeneratedFormatted,
                ];
            }
        }

        // 2. Lọc và thống kê nhân sự CSKH (Task 1.3)
        $cskhUsers = collect();
        $cskhKpis = [];

        if ($queryCskh) {
            $cskhQuery = User::where('role', 'cskh');

            if ($user && $user->tenant_id && $user->role !== 'super_admin') {
                $cskhQuery->where('tenant_id', $user->tenant_id);
            }

            if ($branchId && $branchId !== 'all') {
                $cskhQuery->where('branch_id', $branchId);
            }

            $cskhUsers = $cskhQuery->with('branch:id,name,code')->get([
                'id',
                'tenant_id',
                'branch_id',
                'name',
                'email',
                'phone',
                'role',
                'avatar_url',
                'is_active',
            ]);
            $cskhIds = $cskhUsers->pluck('id')->all();

            $cskhOrderStats = collect();

            if (! empty($cskhIds)) {
                $cskhOrdersQuery = RepairOrder::query()
                    ->whereIn('repair_orders.created_by_user_id', $cskhIds)
                    ->selectRaw("
                        repair_orders.created_by_user_id,
                        COUNT(*) AS created_count,
                        SUM(CASE WHEN repair_orders.status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
                        COALESCE(SUM(CASE WHEN repair_orders.status = 'completed' THEN repair_orders.total_price ELSE 0 END), 0) AS revenue_generated
                    ");

                if ($user && $user->tenant_id && $user->role !== 'super_admin') {
                    $cskhOrdersQuery->where('repair_orders.tenant_id', $user->tenant_id);
                }

                if ($branchId && $branchId !== 'all') {
                    $cskhOrdersQuery->where('repair_orders.branch_id', $branchId);
                }

                if ($fromDate) {
                    $cskhOrdersQuery->where('repair_orders.created_at', '>=', Carbon::parse($fromDate)->startOfDay());
                }

                if ($toDate) {
                    $cskhOrdersQuery->where('repair_orders.created_at', '<=', Carbon::parse($toDate)->endOfDay());
                }

                $cskhOrderStats = $cskhOrdersQuery
                    ->groupBy('repair_orders.created_by_user_id')
                    ->get()
                    ->keyBy('created_by_user_id');
            }

            foreach ($cskhUsers as $cskh) {
                $cskhStat = $cskhOrderStats->get($cskh->id);
                $createdCount = (int) ($cskhStat->created_count ?? 0);
                $completedCount = (int) ($cskhStat->completed_count ?? 0);
                $conversionRate = $createdCount > 0 ? round(($completedCount / $createdCount) * 100, 1) : 0.0;

                $cskhRevenue = (float) ($cskhStat->revenue_generated ?? 0);
                $cskhRevenueFormatted = number_format($cskhRevenue, 0, ',', '.') . ' ₫';

                if (! $canViewRevenue) {
                    $cskhRevenue = null;
                    $cskhRevenueFormatted = null;
                }

                $cskhKpis[] = [
                    'id'                          => $cskh->id,
                    'user_id'                     => $cskh->id,
                    'name'                        => $cskh->name,
                    'email'                       => $cskh->email,
                    'phone'                       => $cskh->phone,
                    'role'                        => 'CSKH',
                    'user_role'                   => 'cskh',
                    'branch_id'                   => $cskh->branch_id,
                    'branch_name'                 => $cskh->branch?->name,
                    'count'                       => "{$createdCount} đơn",
                    'total_orders'                => $createdCount,
                    'orders_created_count'        => $createdCount,
                    'completed'                   => $completedCount,
                    'orders_completed_count'      => $completedCount,
                    'conversion_rate'             => $conversionRate,
                    'conversion_rate_formatted'   => "{$conversionRate}%",
                    'revenue_generated'           => $cskhRevenue,
                    'revenue_generated_formatted' => $cskhRevenueFormatted,
                ];
            }
        }

        // Tính tổng hợp hệ thống
        $durationSum = array_sum(array_column($allSystemDurations, 'sum'));
        $durationCount = array_sum(array_column($allSystemDurations, 'count'));
        $systemAvgMinutes = $durationCount > 0 ? round($durationSum / $durationCount, 1) : 0.0;
        $systemAvgHours = round($systemAvgMinutes / 60, 2);
        $systemAvgDays = round($systemAvgHours / 8, 1); // 8 giờ làm việc / ngày
        $systemHoursPart = floor($systemAvgMinutes / 60);
        $systemMinsPart = round($systemAvgMinutes % 60);
        $systemFormattedTime = $systemHoursPart > 0 ? "{$systemHoursPart}h {$systemMinsPart}m" : "{$systemMinsPart}m";

        $systemQcRate = $totalSystemQcTotal > 0
            ? round(($totalSystemQcPassed / $totalSystemQcTotal) * 100, 1)
            : ($totalSystemCompleted > 0 ? 100.0 : null);

        $customerSatisfaction = null;
        if ($totalSystemCompleted > 0 && $systemQcRate !== null) {
            $csScore = round(($systemQcRate / 100) * 5, 2);
            $customerSatisfaction = str_replace('.', ',', (string) $csScore) . ' / 5';
        }

        $systemWarrantyRate = $totalSystemCompleted > 0
            ? round(($totalSystemWarranty / $totalSystemCompleted) * 100, 1)
            : 0.0;

        $summary = [
            'total_technicians'            => count($technicians),
            'total_cskh'                   => count($cskhUsers),
            'total_orders'                 => $totalSystemOrders,
            'total_completed'              => $totalSystemCompleted,
            'completed'                    => $totalSystemCompleted,
            'total_rework'                 => $totalSystemRework,
            'rework_needed'                => $totalSystemRework,
            'warranty_count'               => $totalSystemWarranty,
            'warranty_rate'                => $systemWarrantyRate,
            'warranty_rate_formatted'      => "{$systemWarrantyRate}%",
            'qc_pass_rate'                 => $systemQcRate,
            'avg_processing_time_minutes'  => $systemAvgMinutes,
            'avg_processing_time_hours'    => $systemAvgHours,
            'avg_processing_time_formatted'=> $systemFormattedTime,
            'avg_repair_days'              => $systemAvgDays > 0 ? (str_replace('.', ',', (string) $systemAvgDays) . ' ngày') : null,
            'customer_satisfaction'        => $customerSatisfaction,
            'from_date'                    => $fromDate,
            'to_date'                      => $toDate,
        ];

        // Xác định danh sách nhân sự chính trả về theo roleFilter
        if ($roleFilter === 'cskh') {
            $selectedStaff = $cskhKpis;
        } elseif (in_array($roleFilter, ['technician', 'tech'], true)) {
            $selectedStaff = $staffKpis;
        } elseif ($roleFilter === 'all') {
            $selectedStaff = array_merge($staffKpis, $cskhKpis);
        } else {
            // Mặc định trả về KTV trong staff để tương thích với các view hiện hữu
            $selectedStaff = $staffKpis;
        }

        // Nếu client yêu cầu chỉ lấy danh sách mảng KTV/CSKH phẳng
        if ($request->input('view') === 'list' || $request->boolean('flat')) {
            return $this->success($selectedStaff, 'Lấy thống kê KPI nhân sự thành công.');
        }

        return $this->success([
            'summary'     => $summary,
            'staff'       => $selectedStaff,
            'technicians' => $staffKpis,
            'cskh'        => $cskhKpis,
            'from_date'   => $fromDate,
            'to_date'     => $toDate,
        ], 'Lấy thống kê KPI nhân sự thành công.');
    }

    /**
     * Thống kê KPI tổng quan cho Dashboard điều hành.
     *
     * Hỗ trợ bộ lọc: branch_id, period (7_days, 14_days, 30_days hoặc số ngày).
     * Trả về:
     * - active_orders: số đơn đang xử lý (chưa hoàn tất hoặc hủy)
     * - intake_today: số đơn tiếp nhận hôm nay
     * - monthly_revenue: tổng doanh thu đơn hoàn tất trong tháng
     * - monthly_revenue_formatted: định dạng hiển thị tiền tệ
     * - completion_rate: tỷ lệ hoàn tất (%)
     * - status_distribution: phân bổ tất cả trạng thái
     * - workload_by_status: phân bổ khối lượng công việc theo nhóm
     * - revenue_chart: chuỗi điểm dữ liệu doanh thu N ngày gần nhất (mặc định 14 ngày)
     */
    public function dashboard(Request $request): JsonResponse
    {
        $user = $request->user();
        $isAdmin = $user && in_array($user->role, ['admin', 'super_admin'], true);
        $branchId = $request->input('branch_id');
        if (! $isAdmin && $user) {
            $branchId = $user->branch_id;
        }
        $periodInput = $request->input('period', '14_days');

        $daysCount = match ($periodInput) {
            '7_days'  => 7,
            '30_days' => 30,
            default   => is_numeric($periodInput) ? (int) $periodInput : 14,
        };

        // Query cơ sở
        $baseQuery = RepairOrder::query();
        if ($branchId && $branchId !== 'all') {
            $baseQuery->where('repair_orders.branch_id', $branchId);
        }

        $tz = 'Asia/Ho_Chi_Minh';
        $today = Carbon::today($tz);
        $todayStart = $today->copy()->startOfDay();
        $todayEnd = $today->copy()->endOfDay();

        // Xử lý tham số ngày tra cứu (date/target_date) và khoảng ngày (from_date/date_from -> to_date/date_to)
        $parseValidDateStr = static function ($input) use ($tz): ?string {
            if ($input && is_string($input) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $input)) {
                try {
                    $parsedDate = Carbon::createFromFormat('Y-m-d', $input, $tz);
                    if ($parsedDate && $parsedDate->format('Y-m-d') === $input) {
                        return $input;
                    }
                } catch (\Throwable $e) {
                    return null;
                }
            }

            return null;
        };

        $targetDateStr = $parseValidDateStr($request->input('date', $request->input('target_date')));
        $fromDateStr = $parseValidDateStr($request->input('from_date', $request->input('date_from')));
        $toDateStr = $parseValidDateStr($request->input('to_date', $request->input('date_to')));

        if (! $fromDateStr && ! $toDateStr) {
            $resolvedSingleDate = $targetDateStr ?? $today->toDateString();
            $fromDateStr = $resolvedSingleDate;
            $toDateStr = $resolvedSingleDate;
            $targetDateStr = $resolvedSingleDate;
        } else {
            if (! $fromDateStr) {
                $fromDateStr = $toDateStr ?? $targetDateStr ?? $today->toDateString();
            }
            if (! $toDateStr) {
                $toDateStr = $fromDateStr;
            }
            if ($fromDateStr > $toDateStr) {
                [$fromDateStr, $toDateStr] = [$toDateStr, $fromDateStr];
            }
            if (! $targetDateStr) {
                $targetDateStr = $toDateStr;
            }
        }

        $fromDateStart = Carbon::parse($fromDateStr, $tz)->startOfDay();
        $toDateEnd = Carbon::parse($toDateStr, $tz)->endOfDay();
        $targetDate = Carbon::parse($targetDateStr, $tz);
        $startOfMonth = $targetDate->copy()->startOfMonth();
        $endOfMonth = $targetDate->copy()->endOfMonth();

        $inWorkshopStatuses = [
            'inspecting',
            'waiting_approval',
            'quote_pending',
            'waiting_tech',
            'assigned',
            'in_repair',
            'waiting_parts',
            'rework_needed',
            'waiting_qc',
            'qc_pending',
            'qc_inspecting',
        ];

        $normTotalExpr = 'CASE WHEN COALESCE(total_price, 0) <= 1 THEN 0 WHEN ROUND(COALESCE(total_price, 0)) >= 500 THEN ROUND(COALESCE(total_price, 0) / 1000.0) * 1000 ELSE ROUND(COALESCE(total_price, 0)) END';
        $rawWorkshopExpr = 'CASE WHEN COALESCE(total_price, 0) > 1 THEN COALESCE(total_price, 0) ELSE COALESCE(initial_price, 0) END';
        $normWorkshopExpr = "CASE WHEN ({$rawWorkshopExpr}) <= 1 THEN 0 WHEN ROUND({$rawWorkshopExpr}) >= 500 THEN ROUND(({$rawWorkshopExpr}) / 1000.0) * 1000 ELSE ROUND({$rawWorkshopExpr}) END";
        $inWorkshopPlaceholders = implode(',', array_fill(0, count($inWorkshopStatuses), '?'));

        // 1. Gộp toàn bộ thống kê trạng thái, tiếp nhận hôm nay, bảo hành, doanh thu tháng hoàn tất, và đối soát vào 1 câu GROUP BY status duy nhất
        $statusBindings = array_merge(
            [
                $todayStart->toDateTimeString(),
                $todayEnd->toDateTimeString(),
                $fromDateStart->toDateTimeString(),
                $toDateEnd->toDateTimeString(),
                $startOfMonth->toDateTimeString(),
                $endOfMonth->toDateTimeString(),
                $startOfMonth->toDateTimeString(),
                $endOfMonth->toDateTimeString(),
            ],
            $inWorkshopStatuses
        );

        $statusAggRows = (clone $baseQuery)
            ->selectRaw(
                "status, " .
                "COUNT(*) as count, " .
                "SUM(CASE WHEN created_at BETWEEN ? AND ? THEN 1 ELSE 0 END) as intake_today_count, " .
                "SUM(CASE WHEN order_type = 'warranty' OR claim_id IS NOT NULL THEN 1 ELSE 0 END) as warranty_claims_count, " .
                "SUM(CASE WHEN status = 'completed' AND created_at BETWEEN ? AND ? THEN 1 ELSE 0 END) as selected_date_completed_count, " .
                "COALESCE(SUM(CASE WHEN status = 'completed' AND (handed_over_at BETWEEN ? AND ? OR (handed_over_at IS NULL AND updated_at BETWEEN ? AND ?)) THEN COALESCE(total_price, 0) ELSE 0 END), 0) as monthly_completed_revenue, " .
                "COALESCE(SUM(CASE WHEN status = 'completed' THEN {$normTotalExpr} ELSE 0 END), 0) as handed_over_revenue, " .
                "COALESCE(SUM(CASE WHEN status IN ('ready_for_return', 'waiting_pickup') THEN {$normTotalExpr} ELSE 0 END), 0) as ready_for_pickup_amount, " .
                "COALESCE(SUM(CASE WHEN status IN ({$inWorkshopPlaceholders}) THEN {$normWorkshopExpr} ELSE 0 END), 0) as in_workshop_amount",
                $statusBindings
            )
            ->groupBy('status')
            ->get();

        $statusRawCounts = [];
        $intakeToday = 0;
        $warrantyClaimsCount = 0;
        $selectedDateCompletedOrders = 0;
        $monthlyRevenue = 0.0;
        $handedOverRevenue = 0.0;
        $readyForPickupAmount = 0.0;
        $inWorkshopAmount = 0.0;

        foreach ($statusAggRows as $row) {
            $st = (string) $row->status;
            $statusRawCounts[$st] = (int) $row->count;
            $intakeToday += (int) ($row->intake_today_count ?? 0);
            $warrantyClaimsCount += (int) ($row->warranty_claims_count ?? 0);
            $selectedDateCompletedOrders += (int) ($row->selected_date_completed_count ?? 0);
            $monthlyRevenue += (float) ($row->monthly_completed_revenue ?? 0);
            if ($isAdmin) {
                $handedOverRevenue += (float) ($row->handed_over_revenue ?? 0);
                $readyForPickupAmount += (float) ($row->ready_for_pickup_amount ?? 0);
                $inWorkshopAmount += (float) ($row->in_workshop_amount ?? 0);
            }
        }

        $totalOrders = array_sum($statusRawCounts);
        $completedOrders = (int) ($statusRawCounts['completed'] ?? 0);
        $activeOrders = max(
            0,
            $totalOrders
            - $completedOrders
            - (int) ($statusRawCounts['cancelled'] ?? 0)
            - (int) ($statusRawCounts['rejected'] ?? 0)
        );

        $formatCurrency = function (float $amount): string {
            return number_format($amount, 0, ',', '.') . ' ₫';
        };

        $formatCurrencyShort = function (float $amount): string {
            if (abs($amount) >= 1000000) {
                $inMillions = round($amount / 1000000, 1);
                return str_replace('.', ',', (string) $inMillions) . 'tr ₫';
            }
            return number_format($amount, 0, ',', '.') . ' ₫';
        };

        $dailyRevenue = 0.0;
        $dailyRevenueFormatted = '0 ₫';
        $selectedDateRevenue = 0.0;
        $selectedDateRevenueFormatted = '0 ₫';
        $monthlyRevenueFormatted = $formatCurrencyShort($monthlyRevenue);

        $handedOverCount = $completedOrders;
        $readyForPickupCount = (int) (($statusRawCounts['ready_for_return'] ?? 0) + ($statusRawCounts['waiting_pickup'] ?? 0));
        $inWorkshopCount = 0;
        foreach ($inWorkshopStatuses as $wsStatus) {
            $inWorkshopCount += (int) ($statusRawCounts[$wsStatus] ?? 0);
        }

        $totalUncollectedAmount = $readyForPickupAmount + $inWorkshopAmount;
        $totalUncollectedAmountFormatted = $formatCurrency($totalUncollectedAmount);

        if ($isAdmin) {
            $reconciliation = [
                'handed_over_count'                 => $handedOverCount,
                'handed_over_revenue'               => $handedOverRevenue,
                'handed_over_revenue_formatted'     => $formatCurrency($handedOverRevenue),
                'ready_for_pickup_count'            => $readyForPickupCount,
                'ready_for_pickup_amount'           => $readyForPickupAmount,
                'ready_for_pickup_amount_formatted' => $formatCurrency($readyForPickupAmount),
                'in_workshop_count'                 => $inWorkshopCount,
                'in_workshop_amount'                => $inWorkshopAmount,
                'in_workshop_amount_formatted'      => $formatCurrency($inWorkshopAmount),
                'total_uncollected_amount'          => $totalUncollectedAmount,
                'total_uncollected_amount_formatted'=> $totalUncollectedAmountFormatted,
            ];
        } else {
            $reconciliation = [
                'handed_over_count'      => $handedOverCount,
                'ready_for_pickup_count' => $readyForPickupCount,
                'in_workshop_count'      => $inWorkshopCount,
            ];
        }

        // Tính toán COGS, Gross Profit & Accounts Receivable cho Admin
        $selectedDateCogs = 0.0;
        $monthlyCogs = 0.0;
        $selectedDateGrossProfit = 0.0;
        $monthlyGrossProfit = 0.0;
        $selectedDateGrossProfitMargin = 0.0;
        $monthlyGrossProfitMargin = 0.0;
        $grossProfitMargin = 0.0;
        $accountsReceivable = 0.0;
        $accountsPayable = 0.0;
        $selectedDateCogsFormatted = '0 ₫';
        $monthlyCogsFormatted = '0 ₫';
        $selectedDateGrossProfitFormatted = '0 ₫';
        $monthlyGrossProfitFormatted = '0 ₫';
        $accountsReceivableFormatted = '0 ₫';
        $accountsPayableFormatted = '0 ₫';

        // 4 ô tài chính hàng đầu (Tổng tháng / Thực thu tháng, Công nợ chưa thu ở tháng, Tổng ngày chọn / Thực thu ngày, Công nợ chưa thu theo ngày)
        $monthlyTotalRevenue = 0.0;
        $monthlyTotalRevenueFormatted = '0 ₫';
        $monthlyRevenueFullFormatted = '0 ₫';
        $monthlyCollectedAmount = 0.0;
        $monthlyCollectedAmountFormatted = '0 ₫';
        $monthlyCompletedOrdersCount = 0;
        $monthlyFinishedOrdersCount = 0;
        $monthlyUncollectedAmount = 0.0;
        $monthlyUncollectedAmountFormatted = '0 ₫';
        $monthlyUncollectedOrdersCount = 0;
        $monthlyReadyForPickupOrdersCount = 0;
        $monthlyInWorkshopOrdersCount = 0;
        $monthlyReadyForPickupAmount = 0.0;
        $monthlyInWorkshopAmount = 0.0;
        $monthlyOrdersBreakdown = [];

        $selectedDateTotalRevenue = 0.0;
        $selectedDateTotalRevenueFormatted = '0 ₫';
        $selectedDateRevenueFullFormatted = '0 ₫';
        $selectedDateCollectedAmount = 0.0;
        $selectedDateCollectedAmountFormatted = '0 ₫';
        $selectedDateCompletedOrdersCount = 0;
        $selectedDateFinishedOrdersCount = 0;
        $selectedDateUncollectedAmount = 0.0;
        $selectedDateUncollectedAmountFormatted = '0 ₫';
        $selectedDateUncollectedOrdersCount = 0;
        $selectedDateReadyForPickupOrdersCount = 0;
        $selectedDateInWorkshopOrdersCount = 0;
        $selectedDateReadyForPickupAmount = 0.0;
        $selectedDateInWorkshopAmount = 0.0;
        $selectedDateOrdersBreakdown = [];

        $periodReconciliation = $reconciliation;
        $periodOperationalSummary = null;
        $periodWorkloadByStatus = null;

        if ($isAdmin) {
            $finishedOrderColumns = [
                'repair_orders.id',
                'repair_orders.tenant_id',
                'repair_orders.branch_id',
                'repair_orders.order_code',
                'repair_orders.customer_id',
                'repair_orders.device_model_id',
                'repair_orders.status',
                'repair_orders.special_parts_status',
                'repair_orders.total_price',
                'repair_orders.initial_price',
                'repair_orders.handed_over_at',
                'repair_orders.qc_passed_at',
                'repair_orders.repair_completed_at',
                'repair_orders.created_at',
                'repair_orders.updated_at',
                DB::raw('customers.name as joined_customer_name'),
                DB::raw('customers.phone as joined_customer_phone'),
                DB::raw('customers.orders_count as joined_customer_orders_count'),
                DB::raw('dm.name as joined_device_name'),
                DB::raw('dm.model_code as joined_model_code'),
            ];

            $finishedOrderRelations = [
                'payments' => function ($q) {
                    $q->select(['id', 'repair_order_id', 'status', 'amount', 'payment_method'])
                      ->whereIn('status', ['paid', 'completed']);
                },
            ];

            // Đồng bộ Card 1-2 (Tháng này) và Card 3-4 (Kỳ chọn) theo cùng quy tắc lọc:
            // whereNotIn('status', ['cancelled', 'rejected'])->whereBetween('created_at', [...])
            $monthlyFinishedOrders = (clone $baseQuery)
                ->leftJoin('customers', 'repair_orders.customer_id', '=', 'customers.id')
                ->leftJoin('device_models as dm', 'repair_orders.device_model_id', '=', 'dm.id')
                ->select($finishedOrderColumns)
                ->whereNotIn('repair_orders.status', ['cancelled', 'rejected'])
                ->whereBetween('repair_orders.created_at', [$startOfMonth, $endOfMonth])
                ->with($finishedOrderRelations)
                ->orderByDesc('repair_orders.created_at')
                ->orderByDesc('repair_orders.id')
                ->get();

            // Nếu khoảng ngày chọn nằm trọn trong tháng của targetDate -> tái sử dụng luôn tập đơn tháng trong bộ nhớ PHP
            if ($fromDateStart->gte($startOfMonth) && $toDateEnd->lte($endOfMonth)) {
                $selectedDateFinishedOrders = $monthlyFinishedOrders
                    ->filter(function (RepairOrder $order) use ($fromDateStart, $toDateEnd, $tz) {
                        if (! $order->created_at) {
                            return false;
                        }
                        return Carbon::parse($order->created_at, $tz)->betweenIncluded($fromDateStart, $toDateEnd);
                    })
                    ->values();
            } else {
                $selectedDateFinishedOrders = (clone $baseQuery)
                    ->leftJoin('customers', 'repair_orders.customer_id', '=', 'customers.id')
                    ->leftJoin('device_models as dm', 'repair_orders.device_model_id', '=', 'dm.id')
                    ->select($finishedOrderColumns)
                    ->whereNotIn('repair_orders.status', ['cancelled', 'rejected'])
                    ->whereBetween('repair_orders.created_at', [$fromDateStart, $toDateEnd])
                    ->with($finishedOrderRelations)
                    ->orderByDesc('repair_orders.created_at')
                    ->orderByDesc('repair_orders.id')
                    ->get();
            }

            $batchCustomerOrderCounts = $monthlyFinishedOrders
                ->concat($selectedDateFinishedOrders)
                ->unique('id')
                ->groupBy('customer_id')
                ->map(fn ($group) => $group->count())
                ->all();

            $buildPeriodBreakdown = function ($orders) use ($formatCurrency, $batchCustomerOrderCounts): array {
                $totalRevenue = 0.0;
                $collectedAmount = 0.0;
                $completedOrdersCount = 0;
                $uncollectedOrdersCount = 0;
                $readyForPickupOrdersCount = 0;
                $inWorkshopOrdersCount = 0;
                $readyForPickupAmount = 0.0;
                $inWorkshopAmount = 0.0;
                $handedOverRevenue = 0.0;
                $unpaidCompletedOrdersCount = 0;
                $unpaidCompletedAmount = 0.0;
                $breakdown = [];

                foreach ($orders as $order) {
                    $rawTotal = (float) ($order->total_price > 1 ? $order->total_price : ($order->initial_price ?? 0));
                    $orderTotal = RepairOrder::normalizeVndAmount($rawTotal);
                    $paidPayments = $order->payments->whereIn('status', ['paid', 'completed']);
                    $paidSum = 0.0;
                    $orderCash = 0.0;
                    $orderTransfer = 0.0;
                    foreach ($paidPayments as $p) {
                        $normAmt = RepairOrder::normalizeVndAmount($p->amount);
                        $paidSum += $normAmt;
                        if ($p->payment_method === 'cash') {
                            $orderCash += $normAmt;
                        } elseif (in_array($p->payment_method, ['bank_transfer', 'transfer', 'vietqr', 'sepay'], true)) {
                            $orderTransfer += $normAmt;
                        }
                    }

                    if ($order->status === 'completed') {
                        if ($paidSum > 0) {
                            $orderCollected = $paidSum;
                            $orderUncollected = 0.0;
                            $effectiveOrderTotal = $orderCollected;
                        } else {
                            $orderCollected = 0.0;
                            $orderCash = 0.0;
                            $orderUncollected = $orderTotal;
                            $effectiveOrderTotal = $orderTotal;
                            $unpaidCompletedOrdersCount++;
                            $unpaidCompletedAmount += $orderTotal;
                        }
                        $completedOrdersCount++;
                        $handedOverRevenue += $effectiveOrderTotal;
                    } else {
                        $orderCollected = $paidSum;
                        $orderUncollected = max(0.0, $orderTotal - $orderCollected);
                        $effectiveOrderTotal = $orderTotal;
                        $uncollectedOrdersCount++;

                        if (in_array($order->status, ['ready_for_return', 'waiting_pickup'], true)) {
                            $readyForPickupOrdersCount++;
                            $readyForPickupAmount += $orderUncollected;
                        } else {
                            $inWorkshopOrdersCount++;
                            $inWorkshopAmount += $orderUncollected;
                        }
                    }

                    $totalRevenue += $effectiveOrderTotal;
                    $collectedAmount += $orderCollected;

                    $customerOrdersCount = max(
                        (int) ($order->joined_customer_orders_count ?? 0),
                        (int) ($batchCustomerOrderCounts[$order->customer_id] ?? 0),
                        1
                    );

                    $completedAtIso = ($order->status === 'completed'
                        ? ($order->handed_over_at ?? $order->updated_at)
                        : ($order->qc_passed_at ?? $order->repair_completed_at ?? $order->created_at ?? $order->updated_at)
                    )?->toIso8601String();

                    $breakdown[] = [
                        'id'                           => $order->id,
                        'order_code'                   => $order->order_code,
                        'customer_id'                  => $order->customer_id,
                        'customer_name'                => $order->joined_customer_name ?? $order->customer_name ?? 'Khách lẻ',
                        'customer_phone'               => $order->joined_customer_phone ?? $order->customer_phone ?? '',
                        'customer_orders_count'        => $customerOrdersCount,
                        'device_name'                  => $order->joined_device_name ?? $order->device_name ?? 'Thiết bị',
                        'model_code'                   => $order->joined_model_code ?? null,
                        'status'                       => $order->status,
                        'total_price'                  => $effectiveOrderTotal,
                        'total_price_formatted'        => $formatCurrency($effectiveOrderTotal),
                        'collected_amount'             => $orderCollected,
                        'collected_amount_formatted'   => $formatCurrency($orderCollected),
                        'cash_amount'                  => $orderCash,
                        'transfer_amount'              => $orderTransfer,
                        'uncollected_amount'           => $orderUncollected,
                        'uncollected_amount_formatted' => $formatCurrency($orderUncollected),
                        'created_at'                   => $order->created_at?->toIso8601String(),
                        'handed_over_at'               => $order->handed_over_at?->toIso8601String(),
                        'completed_at'                 => $completedAtIso,
                        'updated_at'                   => $completedAtIso,
                    ];
                }

                return [
                    'total_revenue'                 => $totalRevenue,
                    'collected_amount'              => $collectedAmount,
                    'uncollected_amount'            => max(0.0, $totalRevenue - $collectedAmount),
                    'completed_orders_count'        => $completedOrdersCount,
                    'finished_orders_count'         => $orders->count(),
                    'uncollected_orders_count'      => $uncollectedOrdersCount,
                    'ready_for_pickup_orders_count' => $readyForPickupOrdersCount,
                    'in_workshop_orders_count'      => $inWorkshopOrdersCount,
                    'ready_for_pickup_amount'       => $readyForPickupAmount,
                    'in_workshop_amount'            => $inWorkshopAmount,
                    'handed_over_revenue'           => $handedOverRevenue,
                    'unpaid_completed_orders_count' => $unpaidCompletedOrdersCount,
                    'unpaid_completed_amount'       => $unpaidCompletedAmount,
                    'orders_breakdown'              => $breakdown,
                ];
            };

            $monthlyPeriodStats = $buildPeriodBreakdown($monthlyFinishedOrders);
            $monthlyTotalRevenue = $monthlyPeriodStats['total_revenue'];
            $monthlyTotalRevenueFormatted = $formatCurrency($monthlyTotalRevenue);
            $monthlyRevenueFullFormatted = $formatCurrency($monthlyTotalRevenue);
            $monthlyCollectedAmount = $monthlyPeriodStats['collected_amount'];
            $monthlyCollectedAmountFormatted = $formatCurrency($monthlyCollectedAmount);
            $monthlyCompletedOrdersCount = $monthlyPeriodStats['completed_orders_count'];
            $monthlyFinishedOrdersCount = $monthlyPeriodStats['finished_orders_count'];
            $monthlyUncollectedAmount = $monthlyPeriodStats['uncollected_amount'];
            $monthlyUncollectedAmountFormatted = $formatCurrency($monthlyUncollectedAmount);
            $monthlyUncollectedOrdersCount = $monthlyPeriodStats['uncollected_orders_count'];
            $monthlyReadyForPickupOrdersCount = $monthlyPeriodStats['ready_for_pickup_orders_count'];
            $monthlyInWorkshopOrdersCount = $monthlyPeriodStats['in_workshop_orders_count'];
            $monthlyReadyForPickupAmount = $monthlyPeriodStats['ready_for_pickup_amount'];
            $monthlyInWorkshopAmount = $monthlyPeriodStats['in_workshop_amount'];
            $monthlyOrdersBreakdown = $monthlyPeriodStats['orders_breakdown'];

            $selectedDatePeriodStats = $buildPeriodBreakdown($selectedDateFinishedOrders);
            $selectedDateTotalRevenue = $selectedDatePeriodStats['total_revenue'];
            $selectedDateTotalRevenueFormatted = $formatCurrency($selectedDateTotalRevenue);
            $selectedDateRevenueFullFormatted = $formatCurrency($selectedDateTotalRevenue);
            $selectedDateCollectedAmount = $selectedDatePeriodStats['collected_amount'];
            $selectedDateCollectedAmountFormatted = $formatCurrency($selectedDateCollectedAmount);
            $selectedDateCompletedOrdersCount = $selectedDatePeriodStats['completed_orders_count'];
            $selectedDateFinishedOrdersCount = $selectedDatePeriodStats['finished_orders_count'];
            $selectedDateUncollectedAmount = $selectedDatePeriodStats['uncollected_amount'];
            $selectedDateUncollectedAmountFormatted = $formatCurrency($selectedDateUncollectedAmount);
            $selectedDateUncollectedOrdersCount = $selectedDatePeriodStats['uncollected_orders_count'];
            $selectedDateReadyForPickupOrdersCount = $selectedDatePeriodStats['ready_for_pickup_orders_count'];
            $selectedDateInWorkshopOrdersCount = $selectedDatePeriodStats['in_workshop_orders_count'];
            $selectedDateReadyForPickupAmount = $selectedDatePeriodStats['ready_for_pickup_amount'];
            $selectedDateInWorkshopAmount = $selectedDatePeriodStats['in_workshop_amount'];
            $selectedDateOrdersBreakdown = $selectedDatePeriodStats['orders_breakdown'];

            $selectedDateRevenue = $selectedDateTotalRevenue;
            $selectedDateCompletedOrders = $selectedDateCompletedOrdersCount;
            $selectedDateRevenueFormatted = $formatCurrencyShort($selectedDateRevenue);

            // Đối soát và Pipeline theo kỳ đang chọn (tính trên bộ nhớ PHP từ $selectedDateFinishedOrders)
            $periodTotalUncollected = $selectedDateReadyForPickupAmount + $selectedDateInWorkshopAmount;
            $periodReconciliation = [
                'handed_over_count'                  => $selectedDateCompletedOrdersCount,
                'handed_over_revenue'                => $selectedDatePeriodStats['handed_over_revenue'],
                'handed_over_revenue_formatted'      => $formatCurrency($selectedDatePeriodStats['handed_over_revenue']),
                'ready_for_pickup_count'             => $selectedDateReadyForPickupOrdersCount,
                'ready_for_pickup_amount'            => $selectedDateReadyForPickupAmount,
                'ready_for_pickup_amount_formatted'  => $formatCurrency($selectedDateReadyForPickupAmount),
                'in_workshop_count'                  => $selectedDateInWorkshopOrdersCount,
                'in_workshop_amount'                 => $selectedDateInWorkshopAmount,
                'in_workshop_amount_formatted'       => $formatCurrency($selectedDateInWorkshopAmount),
                'total_uncollected_amount'           => $periodTotalUncollected,
                'total_uncollected_amount_formatted' => $formatCurrency($periodTotalUncollected),
            ];

            // Gộp tính COGS 1 lần duy nhất cho hợp của tập đơn tháng và tập đơn kỳ chọn
            $selectedDateOrderIds = $selectedDateFinishedOrders
                ->where('status', 'completed')
                ->pluck('id')
                ->all();
            $monthlyOrderIds = $monthlyFinishedOrders
                ->where('status', 'completed')
                ->pluck('id')
                ->all();
            $allCogsOrderIds = array_values(array_unique(array_merge($monthlyOrderIds, $selectedDateOrderIds)));

            $orderCogsMap = [];
            if (! empty($allCogsOrderIds)) {
                $exportCogsByOrder = DB::table('inventory_transactions as it')
                    ->leftJoin('parts as p', 'it.part_id', '=', 'p.id')
                    ->whereIn('it.repair_order_id', $allCogsOrderIds)
                    ->where('it.transaction_type', 'export_repair')
                    ->select('it.repair_order_id', DB::raw('SUM(ABS(it.quantity) * COALESCE(it.unit_cost, p.cost_price, 0)) as order_cogs'))
                    ->groupBy('it.repair_order_id')
                    ->pluck('order_cogs', 'repair_order_id')
                    ->all();

                foreach ($exportCogsByOrder as $oid => $cogsVal) {
                    $orderCogsMap[(int) $oid] = (float) $cogsVal;
                }

                $remainingOrderIds = array_values(array_diff($allCogsOrderIds, array_keys($exportCogsByOrder)));
                if (! empty($remainingOrderIds)) {
                    $quoteCogsByOrder = DB::table('quote_items as qi')
                        ->join('repair_quotes as rq', 'qi.quote_id', '=', 'rq.id')
                        ->join('parts as p', 'qi.part_id', '=', 'p.id')
                        ->whereIn('rq.repair_order_id', $remainingOrderIds)
                        ->where(function ($q) {
                            $q->where('rq.status', 'approved')
                              ->orWhereNull('rq.status');
                        })
                        ->whereNotNull('qi.part_id')
                        ->select('rq.repair_order_id', DB::raw('SUM(qi.quantity * COALESCE(p.cost_price, 0)) as quote_cogs'))
                        ->groupBy('rq.repair_order_id')
                        ->pluck('quote_cogs', 'repair_order_id')
                        ->all();

                    foreach ($quoteCogsByOrder as $oid => $cogsVal) {
                        $orderCogsMap[(int) $oid] = (float) $cogsVal;
                    }
                }
            }

            $selectedDateCogs = 0.0;
            foreach ($selectedDateOrderIds as $oid) {
                $selectedDateCogs += $orderCogsMap[(int) $oid] ?? 0.0;
            }
            $monthlyCogs = 0.0;
            foreach ($monthlyOrderIds as $oid) {
                $monthlyCogs += $orderCogsMap[(int) $oid] ?? 0.0;
            }

            $selectedDateGrossProfit = $selectedDateRevenue - $selectedDateCogs;
            $monthlyGrossProfit = $monthlyRevenue - $monthlyCogs;

            $selectedDateGrossProfitMargin = $selectedDateRevenue > 0
                ? round(($selectedDateGrossProfit / $selectedDateRevenue) * 100, 1)
                : 0.0;
            $monthlyGrossProfitMargin = $monthlyRevenue > 0
                ? round(($monthlyGrossProfit / $monthlyRevenue) * 100, 1)
                : 0.0;
            $grossProfitMargin = $monthlyGrossProfitMargin;

            // Chuẩn hóa Công nợ khách hàng (AR) qua SQL Aggregate trực tiếp (leftJoinSub)
            $paidPaymentsSub = DB::table('payments')
                ->where('status', 'paid')
                ->whereIn(
                    'repair_order_id',
                    (clone $baseQuery)
                        ->whereIn('repair_orders.status', ['ready_for_return', 'waiting_pickup', 'completed'])
                        ->select('repair_orders.id')
                )
                ->select('repair_order_id', DB::raw('SUM(amount) as paid_sum'))
                ->groupBy('repair_order_id');

            $accountsReceivable = (float) (clone $baseQuery)
                ->whereIn('repair_orders.status', ['ready_for_return', 'waiting_pickup', 'completed'])
                ->leftJoinSub($paidPaymentsSub, 'paid_payments', function ($join) {
                    $join->on('repair_orders.id', '=', 'paid_payments.repair_order_id');
                })
                ->selectRaw('COALESCE(SUM(CASE WHEN (repair_orders.total_price - COALESCE(paid_payments.paid_sum, 0)) > 0 THEN (repair_orders.total_price - COALESCE(paid_payments.paid_sum, 0)) ELSE 0 END), 0) as total_ar')
                ->value('total_ar');

            $accountsReceivableFormatted = $formatCurrencyShort($accountsReceivable);

            // Tính tổng nợ NCC (Accounts Payable)
            $supplierQuery = \App\Models\Supplier::where('is_active', true);
            if ($user && $user->tenant_id && $user->role !== 'super_admin') {
                $supplierQuery->where('tenant_id', $user->tenant_id);
            }
            $accountsPayable = (float) $supplierQuery->sum('debt_balance');
            $accountsPayableFormatted = $formatCurrencyShort($accountsPayable);

            $selectedDateCogsFormatted = $formatCurrencyShort($selectedDateCogs);
            $monthlyCogsFormatted = $formatCurrencyShort($monthlyCogs);
            $selectedDateGrossProfitFormatted = $formatCurrencyShort($selectedDateGrossProfit);
            $monthlyGrossProfitFormatted = $formatCurrencyShort($monthlyGrossProfit);
        }

        // 6. Tỷ lệ hoàn tất đơn hàng & Tỷ lệ bảo hành (tái sử dụng từ $statusAggRows)
        $completionRate = $totalOrders > 0
            ? round(($completedOrders / $totalOrders) * 100, 1)
            : 0.0;

        $warrantyRate = $completedOrders > 0
            ? round(($warrantyClaimsCount / $completedOrders) * 100, 1)
            : 0.0;

        // 5. Phân bổ theo trạng thái (Bao phủ 13 trạng thái chuẩn + gộp alias từ $statusRawCounts đã nạp)
        $allStatuses = [
            'inspecting',
            'waiting_approval',
            'waiting_tech',
            'assigned',
            'in_repair',
            'waiting_parts',
            'rework_needed',
            'waiting_qc',
            'ready_for_return',
            'waiting_pickup',
            'completed',
            'cancelled',
            'rejected',
        ];

        $aliasMap = [
            'quote_pending'  => 'waiting_approval',
            'qc_pending'     => 'waiting_qc',
            'qc_inspecting'  => 'waiting_qc',
        ];

        $statusDistribution = [];
        foreach ($allStatuses as $status) {
            $statusDistribution[$status] = 0;
        }

        foreach ($statusRawCounts as $rawStatus => $count) {
            $targetStatus = $aliasMap[$rawStatus] ?? $rawStatus;
            if (isset($statusDistribution[$targetStatus])) {
                $statusDistribution[$targetStatus] += (int) $count;
            } else {
                $statusDistribution[$targetStatus] = (int) $count;
            }
        }

        // 7. Biểu đồ doanh thu chuỗi ngày gần nhất + Doanh thu hôm nay qua 1 câu SQL Aggregation duy nhất (Chỉ tính cho Admin)
        $revenueChart = [];
        if ($isAdmin) {
            $startDate = $today->copy()->subDays($daysCount - 1)->startOfDay();
            $endDate = $todayEnd;

            $dailyStats = (clone $baseQuery)
                ->where('repair_orders.status', 'completed')
                ->where(function ($q) use ($startDate, $endDate) {
                    $q->whereBetween('repair_orders.handed_over_at', [$startDate, $endDate])
                      ->orWhere(function ($sq) use ($startDate, $endDate) {
                          $sq->whereNull('repair_orders.handed_over_at')
                             ->whereBetween('repair_orders.updated_at', [$startDate, $endDate]);
                      });
                })
                ->selectRaw("DATE(COALESCE(repair_orders.handed_over_at, repair_orders.updated_at)) as day_date, COUNT(*) as order_count, SUM(repair_orders.total_price) as total_revenue")
                ->groupBy('day_date')
                ->get()
                ->keyBy('day_date');

            $dailyRevenue = (float) ($dailyStats->get($today->toDateString())?->total_revenue ?? 0);
            $dailyRevenueFormatted = $formatCurrencyShort($dailyRevenue);

            $dayNames = [
                0 => 'CN',
                1 => 'T2',
                2 => 'T3',
                3 => 'T4',
                4 => 'T5',
                5 => 'T6',
                6 => 'T7',
            ];

            for ($i = $daysCount - 1; $i >= 0; $i--) {
                $date = $today->copy()->subDays($i);
                $dateStr = $date->toDateString();
                $dayOfWeek = $date->dayOfWeek;
                $label = $dayNames[$dayOfWeek] ?? ('T' . ($dayOfWeek + 1));

                $stat = $dailyStats->get($dateStr);

                $revenueChart[] = [
                    'date'             => $dateStr,
                    'label'            => $label,
                    'revenue'          => (float) ($stat?->total_revenue ?? 0),
                    'completed_orders' => (int) ($stat?->order_count ?? 0),
                ];
            }
        }

        // 8 & 9. Gộp toàn bộ truy vấn đơn đang mở (Actionable Tasks + Operational Summary) vào 1 câu SQL duy nhất
        $activeOrdersOp = $activeOrders;
        $waitingPickupOrders = $readyForPickupCount;
        $twentyFourHoursAgo = Carbon::now($tz)->subHours(24);
        $nowCarbon = Carbon::now($tz);

        $openOrdersCollection = $activeOrders === 0
            ? collect()
            : (clone $baseQuery)
                ->leftJoin('customers', 'repair_orders.customer_id', '=', 'customers.id')
                ->leftJoin('users as tech', 'repair_orders.technician_id', '=', 'tech.id')
                ->leftJoin('device_models as dm', 'repair_orders.device_model_id', '=', 'dm.id')
                ->whereNotIn('repair_orders.status', ['completed', 'cancelled', 'rejected'])
                ->select([
                    'repair_orders.id',
                    'repair_orders.tenant_id',
                    'repair_orders.branch_id',
                    'repair_orders.order_code',
                    'repair_orders.customer_id',
                    'repair_orders.technician_id',
                    'repair_orders.device_model_id',
                    'repair_orders.status',
                    'repair_orders.special_parts_status',
                    'repair_orders.total_price',
                    'repair_orders.initial_price',
                    'repair_orders.issue_description',
                    'repair_orders.repair_completed_at',
                    'repair_orders.qc_passed_at',
                    'repair_orders.created_at',
                    'repair_orders.updated_at',
                    DB::raw('customers.name as joined_customer_name'),
                    DB::raw('customers.phone as joined_customer_phone'),
                    DB::raw('tech.name as joined_technician_name'),
                    DB::raw('dm.name as joined_device_name'),
                ])
                ->get();

        // Phân loại từ $openOrdersCollection trong bộ nhớ PHP
        $waitingPartsFiltered = $openOrdersCollection->filter(function (RepairOrder $order) {
            return $order->status === 'waiting_parts' || $order->special_parts_status === 'pending';
        });
        $waitingPartsOrders = $waitingPartsFiltered->count();

        $overdueFiltered = $openOrdersCollection->filter(function (RepairOrder $order) use ($twentyFourHoursAgo, $tz) {
            if (in_array($order->status, ['ready_for_return', 'waiting_pickup'], true)) {
                return false;
            }
            if (! $order->created_at) {
                return false;
            }
            return Carbon::parse($order->created_at, $tz)->lte($twentyFourHoursAgo);
        });
        $overdueOrdersCount = $overdueFiltered->count();

        // 6. Workload by status (6 bước pipeline đầy đủ bao gồm waiting_parts)
        $workloadByStatus = [
            'inspecting'       => $statusDistribution['inspecting'] ?? 0,
            'waiting_approval' => $statusDistribution['waiting_approval'] ?? 0,
            'in_repair'        => ($statusDistribution['in_repair'] ?? 0)
                                + ($statusDistribution['assigned'] ?? 0)
                                + ($statusDistribution['waiting_tech'] ?? 0),
            'waiting_parts'    => max((int) ($statusDistribution['waiting_parts'] ?? 0), $waitingPartsOrders),
            'waiting_qc'       => ($statusDistribution['waiting_qc'] ?? 0)
                                + ($statusDistribution['rework_needed'] ?? 0),
            'ready_for_return' => ($statusDistribution['ready_for_return'] ?? 0)
                                + ($statusDistribution['waiting_pickup'] ?? 0),
        ];

        $operationalSummary = [
            'active_orders'          => $activeOrdersOp,
            'waiting_pickup_orders'  => $waitingPickupOrders,
            'waiting_parts_orders'   => $waitingPartsOrders,
            'overdue_orders'         => $overdueOrdersCount,
        ];

        if ($isAdmin) {
            $periodOpenOrders = $selectedDateFinishedOrders->where('status', '!=', 'completed');
            $periodWaitingPartsCount = $periodOpenOrders->filter(fn ($o) => $o->status === 'waiting_parts' || $o->special_parts_status === 'pending')->count();
            $periodOverdueCount = $periodOpenOrders->filter(function ($o) use ($twentyFourHoursAgo, $tz) {
                if (in_array($o->status, ['ready_for_return', 'waiting_pickup'], true)) {
                    return false;
                }
                return $o->created_at && Carbon::parse($o->created_at, $tz)->lte($twentyFourHoursAgo);
            })->count();

            $periodOperationalSummary = [
                'active_orders'         => $periodOpenOrders->count(),
                'waiting_pickup_orders' => $selectedDateReadyForPickupOrdersCount,
                'waiting_parts_orders'  => $periodWaitingPartsCount,
                'overdue_orders'        => $periodOverdueCount,
            ];

            $periodStatusCounts = [];
            foreach ($selectedDateFinishedOrders as $pOrder) {
                $mappedSt = $aliasMap[$pOrder->status] ?? $pOrder->status;
                $periodStatusCounts[$mappedSt] = ($periodStatusCounts[$mappedSt] ?? 0) + 1;
            }

            $periodWorkloadByStatus = [
                'inspecting'       => $periodStatusCounts['inspecting'] ?? 0,
                'waiting_approval' => $periodStatusCounts['waiting_approval'] ?? 0,
                'in_repair'        => ($periodStatusCounts['in_repair'] ?? 0)
                                    + ($periodStatusCounts['assigned'] ?? 0)
                                    + ($periodStatusCounts['waiting_tech'] ?? 0),
                'waiting_parts'    => max((int) ($periodStatusCounts['waiting_parts'] ?? 0), $periodWaitingPartsCount),
                'waiting_qc'       => ($periodStatusCounts['waiting_qc'] ?? 0)
                                    + ($periodStatusCounts['rework_needed'] ?? 0),
                'ready_for_return' => ($periodStatusCounts['ready_for_return'] ?? 0)
                                    + ($periodStatusCounts['waiting_pickup'] ?? 0),
            ];
        }

        // Danh sách công việc cần xử lý trong ca (Actionable Tasks)
        $overdueCount = $overdueOrdersCount;
        $overdueOrders = $overdueFiltered
            ->sortBy(fn (RepairOrder $o) => $o->created_at ? Carbon::parse($o->created_at)->getTimestamp() : 0)
            ->take(200)
            ->map(function (RepairOrder $order) use ($tz, $nowCarbon) {
                $hoursOverdue = max(0, (int) Carbon::parse($order->created_at, $tz)->diffInHours($nowCarbon));
                return [
                    'id'               => $order->id,
                    'order_code'       => $order->order_code,
                    'customer_name'    => $order->joined_customer_name ?? 'Khách vãng lai',
                    'customer_phone'   => $order->joined_customer_phone ?? '',
                    'device_model'     => $order->joined_device_name ?? 'Thiết bị',
                    'technician_name'  => $order->joined_technician_name ?? 'Chưa phân công',
                    'created_at'       => $order->created_at?->toIso8601String(),
                    'hours_overdue'    => $hoursOverdue,
                    'status'           => $order->status,
                    'issue_description'=> $order->issue_description ?? '',
                    'total_price'      => RepairOrder::normalizeVndAmount($order->total_price ?? 0),
                ];
            })
            ->values()
            ->all();

        $waitingApprovalCount = (int) ($statusDistribution['waiting_approval'] ?? 0);
        $waitingApprovalOrders = $waitingApprovalCount === 0
            ? []
            : $openOrdersCollection
                ->filter(fn (RepairOrder $o) => in_array($o->status, ['waiting_approval', 'quote_pending'], true))
                ->sortByDesc(fn (RepairOrder $o) => $o->updated_at ? Carbon::parse($o->updated_at)->getTimestamp() : 0)
                ->take(200)
                ->map(function (RepairOrder $order) use ($tz, $nowCarbon) {
                    $hoursPending = max(0, (int) Carbon::parse($order->updated_at ?? $order->created_at, $tz)->diffInHours($nowCarbon));
                    $rawPrice = (float) ($order->total_price ?? 0) > 1 ? $order->total_price : ($order->initial_price ?? 0);
                    return [
                        'id'               => $order->id,
                        'order_code'       => $order->order_code,
                        'customer_name'    => $order->joined_customer_name ?? 'Khách vãng lai',
                        'customer_phone'   => $order->joined_customer_phone ?? '',
                        'device_model'     => $order->joined_device_name ?? 'Thiết bị',
                        'technician_name'  => $order->joined_technician_name ?? 'Chưa phân công',
                        'total_price'      => RepairOrder::normalizeVndAmount($rawPrice),
                        'issue_description'=> $order->issue_description ?? '',
                        'hours_pending'    => $hoursPending,
                        'status'           => $order->status,
                        'created_at'       => $order->created_at?->toIso8601String(),
                    ];
                })
                ->values()
                ->all();

        $waitingPartsList = $waitingPartsOrders === 0
            ? []
            : $waitingPartsFiltered
                ->sortByDesc(fn (RepairOrder $o) => $o->updated_at ? Carbon::parse($o->updated_at)->getTimestamp() : 0)
                ->take(200)
                ->map(function (RepairOrder $order) use ($tz, $nowCarbon) {
                    $hoursWaiting = max(0, (int) Carbon::parse($order->updated_at ?? $order->created_at, $tz)->diffInHours($nowCarbon));
                    $rawPrice = (float) ($order->total_price ?? 0) > 1 ? $order->total_price : ($order->initial_price ?? 0);
                    return [
                        'id'               => $order->id,
                        'order_code'       => $order->order_code,
                        'customer_name'    => $order->joined_customer_name ?? 'Khách vãng lai',
                        'customer_phone'   => $order->joined_customer_phone ?? '',
                        'device_model'     => $order->joined_device_name ?? 'Thiết bị',
                        'technician_name'  => $order->joined_technician_name ?? 'Chưa phân công',
                        'total_price'      => RepairOrder::normalizeVndAmount($rawPrice),
                        'issue_description'=> $order->issue_description ?? '',
                        'hours_waiting'    => $hoursWaiting,
                        'status'           => $order->status,
                        'created_at'       => $order->created_at?->toIso8601String(),
                    ];
                })
                ->values()
                ->all();

        $waitingQcCount = (int) ($statusDistribution['waiting_qc'] ?? 0);
        $waitingQcOrders = $waitingQcCount === 0
            ? []
            : $openOrdersCollection
                ->filter(fn (RepairOrder $o) => in_array($o->status, ['waiting_qc', 'qc_pending', 'qc_inspecting'], true))
                ->sortBy(fn (RepairOrder $o) => $o->repair_completed_at ? Carbon::parse($o->repair_completed_at)->getTimestamp() : PHP_INT_MAX)
                ->take(200)
                ->map(function (RepairOrder $order) use ($tz, $nowCarbon) {
                    $refTime = $order->repair_completed_at ?? $order->updated_at ?? $order->created_at;
                    $hoursWaiting = max(0, (int) Carbon::parse($refTime, $tz)->diffInHours($nowCarbon));
                    return [
                        'id'                  => $order->id,
                        'order_code'          => $order->order_code,
                        'customer_name'       => $order->joined_customer_name ?? 'Khách vãng lai',
                        'customer_phone'      => $order->joined_customer_phone ?? '',
                        'device_model'        => $order->joined_device_name ?? 'Thiết bị',
                        'technician_name'     => $order->joined_technician_name ?? 'Chưa phân công',
                        'repair_completed_at' => $order->repair_completed_at ? Carbon::parse($order->repair_completed_at)->toIso8601String() : null,
                        'hours_waiting'       => $hoursWaiting,
                        'status'              => $order->status,
                        'issue_description'   => $order->issue_description ?? '',
                        'total_price'         => RepairOrder::normalizeVndAmount($order->total_price ?? 0),
                    ];
                })
                ->values()
                ->all();

        $waitingPickupCount = $waitingPickupOrders;
        $waitingPickupList = $waitingPickupCount === 0
            ? []
            : $openOrdersCollection
                ->filter(fn (RepairOrder $o) => in_array($o->status, ['waiting_pickup', 'ready_for_return'], true))
                ->sortBy(fn (RepairOrder $o) => $o->qc_passed_at ? Carbon::parse($o->qc_passed_at)->getTimestamp() : PHP_INT_MAX)
                ->take(200)
                ->map(function (RepairOrder $order) {
                    return [
                        'id'               => $order->id,
                        'order_code'       => $order->order_code,
                        'customer_name'    => $order->joined_customer_name ?? 'Khách vãng lai',
                        'customer_phone'   => $order->joined_customer_phone ?? '',
                        'device_model'     => $order->joined_device_name ?? 'Thiết bị',
                        'technician_name'  => $order->joined_technician_name ?? 'Chưa phân công',
                        'total_price'      => RepairOrder::normalizeVndAmount($order->total_price ?? 0),
                        'status'           => $order->status,
                        'issue_description'=> $order->issue_description ?? '',
                    ];
                })
                ->values()
                ->all();

        $partsQuery = Part::query();
        if ($user && $user->tenant_id) {
            $partsQuery->where('tenant_id', $user->tenant_id);
        }
        $lowStockQuery = $partsQuery->whereColumn('stock_quantity', '<=', 'min_stock_alert');
        $lowStockPartsCollection = (clone $lowStockQuery)
            ->select(['id', 'sku', 'name', 'stock_quantity', 'min_stock_alert', 'category', 'storage_location', 'unit'])
            ->orderBy('stock_quantity', 'asc')
            ->limit(200)
            ->get();
        $lowStockCount = $lowStockPartsCollection->count() < 200
            ? $lowStockPartsCollection->count()
            : (clone $lowStockQuery)->count();
        $lowStockParts = $lowStockPartsCollection
            ->map(function (Part $part) {
                return [
                    'id'               => $part->id,
                    'sku'              => $part->sku,
                    'name'             => $part->name,
                    'stock_quantity'   => (int) $part->stock_quantity,
                    'min_stock_alert'  => (int) $part->min_stock_alert,
                    'category'         => $part->category,
                    'storage_location' => $part->storage_location,
                    'unit'             => $part->unit ?? 'cái',
                ];
            })
            ->values()
            ->all();

        $actionableTasks = [
            'overdue'          => $overdueOrders,
            'waiting_approval' => $waitingApprovalOrders,
            'pending_quotes'   => $waitingApprovalOrders,
            'waiting_parts'    => $waitingPartsList,
            'waiting_qc'       => $waitingQcOrders,
            'pending_qc'       => $waitingQcOrders,
            'waiting_pickup'   => $waitingPickupList,
            'ready_pickup'     => $waitingPickupList,
            'low_stock_parts'  => $lowStockParts,
            'counts'           => [
                'overdue'          => $overdueCount,
                'waiting_approval' => $waitingApprovalCount,
                'waiting_parts'    => $waitingPartsOrders,
                'waiting_qc'       => $waitingQcCount,
                'waiting_pickup'   => $waitingPickupCount,
                'low_stock'        => $lowStockCount,
                'total'            => $overdueCount + $waitingQcCount + $waitingPickupCount,
            ],
        ];

        $summary = [
            'active_orders'                  => $activeOrders,
            'intake_today'                   => $intakeToday,
            'today_orders'                   => $intakeToday,
            'selected_date'                  => $targetDateStr,
            'from_date'                      => $fromDateStr,
            'to_date'                        => $toDateStr,
            'selected_date_completed_orders' => $selectedDateCompletedOrders,
            'completion_rate'                => $completionRate,
            'warranty_rate'                  => $warrantyRate,
            'warranty_claims_count'          => $warrantyClaimsCount,
            'total_orders'                   => $totalOrders,
            'completed_orders'               => $completedOrders,
            'reconciliation'                 => $reconciliation,
            'operational_summary'            => $operationalSummary,
            'actionable_tasks'               => $actionableTasks,
        ];

        if ($isAdmin) {
            $financialMetrics = [
                'daily_revenue'                                => $dailyRevenue,
                'daily_revenue_formatted'                      => $dailyRevenueFormatted,
                'selected_date_revenue'                        => $selectedDateRevenue,
                'selected_date_revenue_formatted'              => $selectedDateRevenueFormatted,
                'monthly_revenue'                              => $monthlyRevenue,
                'monthly_revenue_formatted'                    => $monthlyRevenueFormatted,
                'monthly_total_revenue'                        => $monthlyTotalRevenue,
                'monthly_total_revenue_formatted'              => $monthlyTotalRevenueFormatted,
                'monthly_revenue_full_formatted'               => $monthlyRevenueFullFormatted,
                'monthly_collected_amount'                     => $monthlyCollectedAmount,
                'monthly_collected_amount_formatted'           => $monthlyCollectedAmountFormatted,
                'monthly_completed_orders_count'               => $monthlyCompletedOrdersCount,
                'monthly_finished_orders_count'                => $monthlyFinishedOrdersCount,
                'monthly_uncollected_amount'                   => $monthlyUncollectedAmount,
                'monthly_uncollected_amount_formatted'         => $monthlyUncollectedAmountFormatted,
                'monthly_uncollected_orders_count'             => $monthlyUncollectedOrdersCount,
                'monthly_ready_for_pickup_orders_count'        => $monthlyReadyForPickupOrdersCount,
                'monthly_in_workshop_orders_count'             => $monthlyInWorkshopOrdersCount,
                'monthly_ready_for_pickup_amount'              => $monthlyReadyForPickupAmount,
                'monthly_in_workshop_amount'                   => $monthlyInWorkshopAmount,
                'monthly_orders_breakdown'                     => $monthlyOrdersBreakdown,
                'selected_date_total_revenue'                  => $selectedDateTotalRevenue,
                'selected_date_total_revenue_formatted'        => $selectedDateTotalRevenueFormatted,
                'selected_date_revenue_full_formatted'         => $selectedDateRevenueFullFormatted,
                'selected_date_collected_amount'               => $selectedDateCollectedAmount,
                'selected_date_collected_amount_formatted'     => $selectedDateCollectedAmountFormatted,
                'selected_date_completed_orders_count'         => $selectedDateCompletedOrdersCount,
                'selected_date_finished_orders_count'          => $selectedDateFinishedOrdersCount,
                'selected_date_uncollected_amount'             => $selectedDateUncollectedAmount,
                'selected_date_uncollected_amount_formatted'   => $selectedDateUncollectedAmountFormatted,
                'selected_date_uncollected_orders_count'       => $selectedDateUncollectedOrdersCount,
                'selected_date_ready_for_pickup_orders_count'  => $selectedDateReadyForPickupOrdersCount,
                'selected_date_in_workshop_orders_count'       => $selectedDateInWorkshopOrdersCount,
                'selected_date_ready_for_pickup_amount'        => $selectedDateReadyForPickupAmount,
                'selected_date_in_workshop_amount'             => $selectedDateInWorkshopAmount,
                'selected_date_orders_breakdown'               => $selectedDateOrdersBreakdown,
                'selected_date_cogs'                           => $selectedDateCogs,
                'selected_date_cogs_formatted'                 => $selectedDateCogsFormatted,
                'monthly_cogs'                                 => $monthlyCogs,
                'monthly_cogs_formatted'                       => $monthlyCogsFormatted,
                'selected_date_gross_profit'                   => $selectedDateGrossProfit,
                'selected_date_gross_profit_formatted'         => $selectedDateGrossProfitFormatted,
                'selected_date_gross_profit_margin'            => $selectedDateGrossProfitMargin,
                'monthly_gross_profit'                         => $monthlyGrossProfit,
                'monthly_gross_profit_formatted'               => $monthlyGrossProfitFormatted,
                'monthly_gross_profit_margin'                  => $monthlyGrossProfitMargin,
                'gross_profit_margin'                          => $grossProfitMargin,
                'accounts_receivable'                          => $accountsReceivable,
                'accounts_receivable_formatted'                => $accountsReceivableFormatted,
                'accounts_payable'                             => $accountsPayable,
                'accounts_payable_formatted'                   => $accountsPayableFormatted,
                'period_reconciliation'                        => $periodReconciliation,
                'period_operational_summary'                   => $periodOperationalSummary,
                'period_workload_by_status'                    => $periodWorkloadByStatus,
            ];

            $summary = array_merge($summary, $financialMetrics);
        }

        $responsePayload = [
            'summary'                         => $summary,
            'active_orders'                   => $activeOrders,
            'intake_today'                    => $intakeToday,
            'today_orders'                    => $intakeToday,
            'selected_date'                   => $targetDateStr,
            'from_date'                       => $fromDateStr,
            'to_date'                         => $toDateStr,
            'selected_date_completed_orders'  => $selectedDateCompletedOrders,
            'reconciliation'                  => $reconciliation,
            'completion_rate'                 => $completionRate,
            'warranty_rate'                   => $warrantyRate,
            'warranty_claims_count'           => $warrantyClaimsCount,
            'total_orders'                    => $totalOrders,
            'completed_orders'                => $completedOrders,
            'status_distribution'            => $statusDistribution,
            'workload_by_status'              => $workloadByStatus,
            'operational_summary'             => $operationalSummary,
            'actionable_tasks'                => $actionableTasks,
        ];

        if ($isAdmin) {
            $responsePayload = array_merge($responsePayload, $financialMetrics, [
                'revenue_chart' => $revenueChart,
            ]);
        }

        return $this->success($responsePayload, 'Lấy số liệu tổng quan KPI thành công.');
    }

    /**
     * Alias method cho GET /api/v1/kpi
     */
    public function index(Request $request): JsonResponse
    {
        return $this->dashboard($request);
    }
}
