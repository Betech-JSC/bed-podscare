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
        $fromDate = $request->input('from_date', $request->input('date_from'));
        $toDate = $request->input('to_date', $request->input('date_to'));
        $periodInput = $request->input('period');
        $dateInput = $request->input('date', $request->input('target_date'));

        $tz = 'Asia/Ho_Chi_Minh';
        $today = Carbon::today($tz);
        $refDate = $today->copy();

        if ($dateInput && is_string($dateInput) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateInput)) {
            try {
                $parsed = Carbon::createFromFormat('Y-m-d', $dateInput, $tz);
                if ($parsed && $parsed->format('Y-m-d') === $dateInput) {
                    $refDate = $parsed;
                }
            } catch (\Throwable $e) {
                // Fallback to today
            }
        }

        $periodStart = null;
        $periodEnd = null;
        $hasPeriodFilter = $request->filled('period') || $request->filled('date') || $request->filled('target_date') || ! empty($fromDate) || ! empty($toDate);

        if ($hasPeriodFilter && $periodInput !== 'all') {
            $effectivePeriod = $periodInput ?: ((! empty($fromDate) || ! empty($toDate)) ? 'custom' : 'today');
            switch ($effectivePeriod) {
                case 'today':
                    $periodStart = $refDate->copy()->startOfDay();
                    $periodEnd = $refDate->copy()->endOfDay();
                    break;
                case 'yesterday':
                    $y = $refDate->copy()->subDay();
                    $periodStart = $y->copy()->startOfDay();
                    $periodEnd = $y->copy()->endOfDay();
                    break;
                case '3_days':
                    $periodStart = $refDate->copy()->subDays(2)->startOfDay();
                    $periodEnd = $refDate->copy()->endOfDay();
                    break;
                case '7_days':
                    $periodStart = $refDate->copy()->subDays(6)->startOfDay();
                    $periodEnd = $refDate->copy()->endOfDay();
                    break;
                case '14_days':
                    $periodStart = $refDate->copy()->subDays(13)->startOfDay();
                    $periodEnd = $refDate->copy()->endOfDay();
                    break;
                case '30_days':
                    $periodStart = $refDate->copy()->subDays(29)->startOfDay();
                    $periodEnd = $refDate->copy()->endOfDay();
                    break;
                case 'this_month':
                    $periodStart = $refDate->copy()->startOfMonth()->startOfDay();
                    $periodEnd = $refDate->copy()->endOfMonth()->endOfDay();
                    break;
                case 'custom':
                default:
                    if ($fromDate) {
                        $periodStart = Carbon::parse($fromDate, $tz)->startOfDay();
                    }
                    if ($toDate) {
                        $periodEnd = Carbon::parse($toDate, $tz)->endOfDay();
                    }
                    if (! $periodStart && ! $periodEnd) {
                        $periodStart = $refDate->copy()->startOfDay();
                        $periodEnd = $refDate->copy()->endOfDay();
                    }
                    break;
            }
        }

        $isTimestampInPeriod = function ($timestamp) use ($periodStart, $periodEnd, $tz): bool {
            if (! $periodStart && ! $periodEnd) {
                return true;
            }
            if (! $timestamp) {
                return false;
            }
            $dt = Carbon::parse($timestamp)->setTimezone($tz);
            if ($periodStart && $dt->lt($periodStart)) {
                return false;
            }
            if ($periodEnd && $dt->gt($periodEnd)) {
                return false;
            }
            return true;
        };

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

            $technicians = $userQuery->with('branch')->get();

            // Nếu chỉ định technician_id cụ thể nhưng user mang vai trò khác (ví dụ admin test)
            if ($techId && $technicians->isEmpty()) {
                $fallbackTechQuery = User::where('id', $techId)->with('branch');
                if ($user && $user->tenant_id && $user->role !== 'super_admin') {
                    $fallbackTechQuery->where('tenant_id', $user->tenant_id);
                }
                $technicians = $fallbackTechQuery->get();
            }

            // Nếu không có KTV nào thỏa mãn và không có techId/branchId, fallback trong tenant
            if ($technicians->isEmpty() && ! $techId && ! $branchId) {
                $fallbackAllQuery = User::whereIn('role', ['technician', 'tech'])->with('branch');
                if ($user && $user->tenant_id && $user->role !== 'super_admin') {
                    $fallbackAllQuery->where('tenant_id', $user->tenant_id);
                }
                $technicians = $fallbackAllQuery->limit(10)->get();
            }

            $techIds = $technicians->pluck('id')->all();

            $ordersQuery = RepairOrder::whereIn('technician_id', $techIds);

            if ($user && $user->tenant_id && $user->role !== 'super_admin') {
                $ordersQuery->where('tenant_id', $user->tenant_id);
            }

            if ($branchId && $branchId !== 'all') {
                $ordersQuery->where('branch_id', $branchId);
            }

            $ordersGrouped = $ordersQuery->with('qcInspections')->get()->groupBy('technician_id');

            foreach ($technicians as $tech) {
                /** @var \Illuminate\Support\Collection<int, RepairOrder> $allTechOrders */
                $allTechOrders = $ordersGrouped->get($tech->id, collect());

                // Số đơn đang sửa trực tiếp tại xưởng (Live state)
                $liveInRepairCount = $allTechOrders->whereIn('status', ['assigned', 'in_repair', 'waiting_parts', 'waiting_qc'])->count();

                // Tập đơn trong kỳ đã chọn:
                // - Đơn completed: xét theo COALESCE(handed_over_at, updated_at)
                // - Đơn khác: xét theo COALESCE(repair_completed_at, updated_at, created_at) hoặc created_at
                $techOrders = ($periodStart || $periodEnd)
                    ? $allTechOrders->filter(function (RepairOrder $order) use ($isTimestampInPeriod) {
                        if ($order->status === 'completed') {
                            return $isTimestampInPeriod($order->handed_over_at ?? $order->updated_at);
                        }
                        return $isTimestampInPeriod($order->created_at)
                            || $isTimestampInPeriod($order->updated_at);
                    })->values()
                    : $allTechOrders;

                $orderCount = $techOrders->count();

                // Tổng đơn hoàn tất trong kỳ (theo COALESCE(handed_over_at, updated_at))
                $completedOrders = $allTechOrders->where('status', 'completed')->filter(function (RepairOrder $order) use ($isTimestampInPeriod) {
                    return $isTimestampInPeriod($order->handed_over_at ?? $order->updated_at);
                });
                $completedCount = $completedOrders->count();

                // Doanh thu dịch vụ tạo ra
                $revenueGenerated = (float) $completedOrders->sum('total_price');
                $revenueGeneratedFormatted = number_format($revenueGenerated, 0, ',', '.') . ' ₫';

                if (! $canViewRevenue) {
                    $revenueGenerated = null;
                    $revenueGeneratedFormatted = null;
                }

                // Đơn sửa lại / bảo hành (rework_needed hoặc fail QC)
                $reworkOrders = $techOrders->filter(function ($order) {
                    return $order->status === 'rework_needed'
                        || $order->qcInspections->contains('result', 'fail');
                });
                $reworkCount = $reworkOrders->count();

                // Tỷ lệ bảo hành / sửa lại của KTV
                $techWarrantyCount = $techOrders->filter(function ($order) {
                    return $order->status === 'rework_needed'
                        || ($order->order_type ?? '') === 'warranty'
                        || ! empty($order->is_warranty_claim)
                        || ! empty($order->claim_id)
                        || ! empty($order->parent_order_id)
                        || $order->qcInspections->contains('result', 'fail');
                })->count();
                $techWarrantyRate = $completedCount > 0
                    ? round(($techWarrantyCount / $completedCount) * 100, 1)
                    : 0.0;

                // Tỉ lệ đạt QC
                $allQc = $techOrders->flatMap->qcInspections;
                $qcTotal = $allQc->count();
                $qcPassed = $allQc->where('result', 'pass')->count();

                if ($qcTotal > 0) {
                    $qcPassRate = round(($qcPassed / $qcTotal) * 100, 1);
                } else {
                    $eligibleOrders = $techOrders->filter(function ($o) {
                        return $o->qc_passed_at !== null
                            || in_array($o->status, ['ready_for_return', 'waiting_pickup', 'completed', 'rework_needed'], true);
                    });
                    $passedOrders = $techOrders->filter(function ($o) {
                        return $o->qc_passed_at !== null
                            || in_array($o->status, ['ready_for_return', 'waiting_pickup', 'completed'], true);
                    });
                    $qcPassRate = $eligibleOrders->count() > 0
                        ? round(($passedOrders->count() / $eligibleOrders->count()) * 100, 1)
                        : null;
                }

                // Thời gian xử lý trung bình (phút)
                $durations = $techOrders->map(function ($order) {
                    if ($order->repair_started_at && $order->repair_completed_at) {
                        return abs(Carbon::parse($order->repair_completed_at)->diffInMinutes(Carbon::parse($order->repair_started_at)));
                    }
                    if ($order->repair_completed_at && $order->tech_accepted_at) {
                        return abs(Carbon::parse($order->repair_completed_at)->diffInMinutes(Carbon::parse($order->tech_accepted_at)));
                    }
                    if ($order->repair_completed_at && $order->created_at) {
                        return abs(Carbon::parse($order->repair_completed_at)->diffInMinutes(Carbon::parse($order->created_at)));
                    }
                    return null;
                })->filter(fn($val) => $val !== null && $val >= 0);

                $avgMinutes = $durations->count() > 0 ? round($durations->avg(), 1) : 0.0;
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
                foreach ($durations as $d) {
                    $allSystemDurations[] = $d;
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
                    'in_repair'                    => $liveInRepairCount,
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

        // 2. Lọc và thống kê nhân sự CSKH
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

            $cskhUsers = $cskhQuery->with('branch')->get();
            $cskhIds = $cskhUsers->pluck('id')->all();

            $cskhOrdersGrouped = collect();

            if (! empty($cskhIds)) {
                $cskhOrdersQuery = RepairOrder::whereIn('created_by_user_id', $cskhIds);

                if ($user && $user->tenant_id && $user->role !== 'super_admin') {
                    $cskhOrdersQuery->where('tenant_id', $user->tenant_id);
                }

                if ($branchId && $branchId !== 'all') {
                    $cskhOrdersQuery->where('branch_id', $branchId);
                }

                $cskhOrdersGrouped = $cskhOrdersQuery->get()->groupBy('created_by_user_id');
            }

            foreach ($cskhUsers as $cskh) {
                /** @var \Illuminate\Support\Collection<int, RepairOrder> $allCskhOrders */
                $allCskhOrders = $cskhOrdersGrouped->get($cskh->id, collect());

                // Số đơn tiếp nhận mới trong kỳ (theo created_at)
                $createdOrdersInPeriod = ($periodStart || $periodEnd)
                    ? $allCskhOrders->filter(fn (RepairOrder $o) => $isTimestampInPeriod($o->created_at))
                    : $allCskhOrders;
                $createdCount = $createdOrdersInPeriod->count();

                // Số đơn hoàn tất và doanh thu tạo ra trong kỳ (theo COALESCE(handed_over_at, updated_at))
                $completedOrders = $allCskhOrders->where('status', 'completed')->filter(function (RepairOrder $o) use ($isTimestampInPeriod) {
                    return $isTimestampInPeriod($o->handed_over_at ?? $o->updated_at);
                });
                $completedCount = $completedOrders->count();
                $conversionRate = $createdCount > 0 ? round(($completedCount / $createdCount) * 100, 1) : 0.0;

                $cskhRevenue = (float) $completedOrders->sum('total_price');
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
        $durationCount = count($allSystemDurations);
        $systemAvgMinutes = $durationCount > 0 ? round(array_sum($allSystemDurations) / $durationCount, 1) : 0.0;
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
            'period'                       => $periodInput ?: ($hasPeriodFilter ? 'today' : 'all'),
            'date'                         => $refDate->toDateString(),
            'from_date'                    => $periodStart?->toDateString(),
            'to_date'                      => $periodEnd?->toDateString(),
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
        $hasExplicitPeriod = $request->filled('period');
        $periodInput = $request->input('period', '14_days');

        $daysCount = match ($periodInput) {
            '7_days'  => 7,
            '30_days' => 30,
            default   => is_numeric($periodInput) ? (int) $periodInput : 14,
        };

        // Query cơ sở
        $baseQuery = RepairOrder::query();
        if ($branchId && $branchId !== 'all') {
            $baseQuery->where('branch_id', $branchId);
        }

        // 1. Số đơn đang hoạt động (không thuộc trạng thái hoàn tất, hủy hoặc từ chối sửa)
        $activeOrders = (clone $baseQuery)
            ->whereNotIn('status', ['completed', 'cancelled', 'rejected'])
            ->count();

        // 2. Tiếp nhận hôm nay
        $tz = 'Asia/Ho_Chi_Minh';
        $today = Carbon::today($tz);
        $intakeToday = (clone $baseQuery)
            ->whereDate('created_at', $today)
            ->count();

        // Xử lý tham số ngày tra cứu (date hoặc target_date)
        $targetDateInput = $request->input('date', $request->input('target_date'));
        $targetDateStr = null;

        if ($targetDateInput && is_string($targetDateInput) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $targetDateInput)) {
            try {
                $parsedDate = Carbon::createFromFormat('Y-m-d', $targetDateInput, $tz);
                if ($parsedDate && $parsedDate->format('Y-m-d') === $targetDateInput) {
                    $targetDateStr = $targetDateInput;
                }
            } catch (\Throwable $e) {
                $targetDateStr = null;
            }
        }

        if (! $targetDateStr) {
            $targetDateStr = $today->toDateString();
        }

        $targetDate = Carbon::parse($targetDateStr, $tz);
        $targetDateStart = $targetDate->copy()->startOfDay();
        $targetDateEnd = $targetDate->copy()->endOfDay();

        // Xác định khoảng thời gian của Kỳ đã chọn (Zone 1: period_metrics)
        $activePeriodKey = $hasExplicitPeriod ? (string) $periodInput : 'today';
        switch ($activePeriodKey) {
            case 'yesterday':
                $yesterdayDate = $targetDate->copy()->subDay();
                $periodStart = $yesterdayDate->copy()->startOfDay();
                $periodEnd = $yesterdayDate->copy()->endOfDay();
                $periodLabel = 'Hôm qua (' . $yesterdayDate->format('d/m/Y') . ')';
                break;
            case '3_days':
                $periodStart = $targetDate->copy()->subDays(2)->startOfDay();
                $periodEnd = $targetDate->copy()->endOfDay();
                $periodLabel = '3 ngày qua';
                break;
            case '7_days':
                $periodStart = $targetDate->copy()->subDays(6)->startOfDay();
                $periodEnd = $targetDate->copy()->endOfDay();
                $periodLabel = '7 ngày qua';
                break;
            case '14_days':
                $periodStart = $targetDate->copy()->subDays(13)->startOfDay();
                $periodEnd = $targetDate->copy()->endOfDay();
                $periodLabel = '14 ngày qua';
                break;
            case '30_days':
                $periodStart = $targetDate->copy()->subDays(29)->startOfDay();
                $periodEnd = $targetDate->copy()->endOfDay();
                $periodLabel = '30 ngày qua';
                break;
            case 'this_month':
                $periodStart = $targetDate->copy()->startOfMonth()->startOfDay();
                $periodEnd = $targetDate->copy()->endOfMonth()->endOfDay();
                $periodLabel = 'Tháng ' . $targetDate->format('m/Y');
                break;
            case 'custom':
                $fromInput = $request->input('from_date', $request->input('date_from', $targetDateStr));
                $toInput = $request->input('to_date', $request->input('date_to', $targetDateStr));
                $periodStart = Carbon::parse($fromInput, $tz)->startOfDay();
                $periodEnd = Carbon::parse($toInput, $tz)->endOfDay();
                $periodLabel = $periodStart->format('d/m/Y') . ' - ' . $periodEnd->format('d/m/Y');
                break;
            case 'today':
            default:
                $activePeriodKey = 'today';
                $periodStart = $targetDateStart->copy();
                $periodEnd = $targetDateEnd->copy();
                $periodLabel = $targetDate->isSameDay($today)
                    ? 'Hôm nay (' . $targetDate->format('d/m/Y') . ')'
                    : 'Ngày ' . $targetDate->format('d/m/Y');
                break;
        }

        // 3. Doanh thu hôm nay (cho tất cả các đơn completed: tại quầy và COD)
        $todayStart = Carbon::today($tz)->startOfDay();
        $todayEnd = Carbon::today($tz)->endOfDay();
        $dailyRevenue = (float) (clone $baseQuery)
            ->where('status', 'completed')
            ->where(function ($q) use ($todayStart, $todayEnd) {
                $q->whereBetween('handed_over_at', [$todayStart, $todayEnd])
                  ->orWhere(function ($sq) use ($todayStart, $todayEnd) {
                      $sq->whereNull('handed_over_at')
                         ->whereBetween('updated_at', [$todayStart, $todayEnd]);
                  });
            })
            ->sum('total_price');

        if ($dailyRevenue >= 1000000) {
            $dailyRevenueInMillions = round($dailyRevenue / 1000000, 1);
            $dailyRevenueFormatted = str_replace('.', ',', (string) $dailyRevenueInMillions) . 'tr ₫';
        } else {
            $dailyRevenueFormatted = number_format($dailyRevenue, 0, ',', '.') . ' ₫';
        }

        // 3b. Doanh thu ngày được chọn (selected_date)
        $selectedDateOrdersQuery = (clone $baseQuery)
            ->where('status', 'completed')
            ->where(function ($q) use ($targetDateStart, $targetDateEnd) {
                $q->whereBetween('handed_over_at', [$targetDateStart, $targetDateEnd])
                  ->orWhere(function ($sq) use ($targetDateStart, $targetDateEnd) {
                      $sq->whereNull('handed_over_at')
                         ->whereBetween('updated_at', [$targetDateStart, $targetDateEnd]);
                  });
            });

        $selectedDateRevenue = (float) (clone $selectedDateOrdersQuery)->sum('total_price');
        $selectedDateCompletedOrders = (int) (clone $selectedDateOrdersQuery)->count();

        if ($selectedDateRevenue >= 1000000) {
            $selectedRevenueInMillions = round($selectedDateRevenue / 1000000, 1);
            $selectedDateRevenueFormatted = str_replace('.', ',', (string) $selectedRevenueInMillions) . 'tr ₫';
        } else {
            $selectedDateRevenueFormatted = number_format($selectedDateRevenue, 0, ',', '.') . ' ₫';
        }

        // 4. Doanh thu tháng này từ các đơn hoàn tất (theo $targetDate và COALESCE handed_over_at, updated_at)
        $startOfMonth = $targetDate->copy()->startOfMonth();
        $endOfMonth = $targetDate->copy()->endOfMonth();

        $monthlyOrdersQuery = (clone $baseQuery)
            ->where('status', 'completed')
            ->where(function ($q) use ($startOfMonth, $endOfMonth) {
                $q->whereBetween('handed_over_at', [$startOfMonth, $endOfMonth])
                  ->orWhere(function ($sq) use ($startOfMonth, $endOfMonth) {
                      $sq->whereNull('handed_over_at')
                         ->whereBetween('updated_at', [$startOfMonth, $endOfMonth]);
                  });
            });

        $monthlyRevenue = (float) (clone $monthlyOrdersQuery)->sum('total_price');

        // Định dạng doanh thu tháng
        if ($monthlyRevenue >= 1000000) {
            $revenueInMillions = round($monthlyRevenue / 1000000, 1);
            $monthlyRevenueFormatted = str_replace('.', ',', (string) $revenueInMillions) . 'tr ₫';
        } else {
            $monthlyRevenueFormatted = number_format($monthlyRevenue, 0, ',', '.') . ' ₫';
        }

        // 5. Khối đối chiếu máy đã lấy vs máy chưa lấy (Reconciliation)
        $handedOverOrdersList = (clone $baseQuery)
            ->where('status', 'completed')
            ->get(['total_price']);
        $handedOverCount = (int) $handedOverOrdersList->count();
        $handedOverRevenue = (float) $handedOverOrdersList->sum(fn ($o) => RepairOrder::normalizeVndAmount($o->total_price));

        $readyForPickupOrdersList = (clone $baseQuery)
            ->whereIn('status', ['ready_for_return', 'waiting_pickup'])
            ->get(['total_price']);
        $readyForPickupCount = (int) $readyForPickupOrdersList->count();
        $readyForPickupAmount = (float) $readyForPickupOrdersList->sum(fn ($o) => RepairOrder::normalizeVndAmount($o->total_price));

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

        $inWorkshopOrdersList = (clone $baseQuery)
            ->whereIn('status', $inWorkshopStatuses)
            ->get(['total_price', 'initial_price']);
        $inWorkshopCount = (int) $inWorkshopOrdersList->count();
        $inWorkshopAmount = (float) $inWorkshopOrdersList->sum(function ($o) {
            $raw = (float) ($o->total_price ?? 0) > 1 ? $o->total_price : ($o->initial_price ?? 0);
            return RepairOrder::normalizeVndAmount($raw);
        });

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

        // Kỳ đã chọn (Zone 1): Intake, Completed & Warranty count
        $periodIntakeCount = (int) (clone $baseQuery)
            ->whereBetween('created_at', [$periodStart, $periodEnd])
            ->count();

        $periodWarrantyCount = (int) (clone $baseQuery)
            ->whereBetween('created_at', [$periodStart, $periodEnd])
            ->where(function ($wq) {
                $wq->where('order_type', 'warranty')
                   ->orWhereNotNull('claim_id');
            })
            ->count();

        $periodCompletedOrdersQuery = (clone $baseQuery)
            ->where('status', 'completed')
            ->where(function ($q) use ($periodStart, $periodEnd) {
                $q->whereBetween('handed_over_at', [$periodStart, $periodEnd])
                  ->orWhere(function ($sq) use ($periodStart, $periodEnd) {
                      $sq->whereNull('handed_over_at')
                         ->whereBetween('updated_at', [$periodStart, $periodEnd]);
                  });
            });
        $periodCompletedCount = (int) (clone $periodCompletedOrdersQuery)->count();

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
        $selectedDateOrdersBreakdown = [];

        $periodHandoverStats = null;
        $monthlyHandoverStats = null;
        $periodProfitAndCogs = null;
        $liveReadyForPickupStats = null;
        $inWorkshopCollectedAmount = 0.0;
        $inWorkshopUncollectedAmount = 0.0;

        if ($isAdmin) {
            $finishedStatuses = ['ready_for_return', 'waiting_pickup', 'completed'];

            $buildPeriodBreakdown = function ($orders) use ($formatCurrency): array {
                $totalRevenue = 0.0;
                $collectedAmount = 0.0;
                $totalCash = 0.0;
                $totalTransfer = 0.0;
                $completedOrdersCount = 0;
                $uncollectedOrdersCount = 0;
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
                        } elseif (in_array($p->payment_method, ['bank_transfer', 'transfer', 'vietqr', 'sepay', 'banking'], true)) {
                            $orderTransfer += $normAmt;
                        }
                    }

                    if ($order->status === 'completed') {
                        $orderCollected = $paidSum > 0 ? $paidSum : $orderTotal;
                        if ($paidSum <= 0 && $orderCollected > 0) {
                            $orderCash = $orderCollected;
                            $orderTransfer = 0.0;
                        }
                        $orderUncollected = 0.0;
                        $effectiveOrderTotal = $orderCollected;
                        $completedOrdersCount++;
                    } else {
                        $orderCollected = $paidSum;
                        $orderUncollected = max(0.0, $orderTotal - $orderCollected);
                        $effectiveOrderTotal = $orderTotal;
                        $uncollectedOrdersCount++;
                    }

                    $totalRevenue += $effectiveOrderTotal;
                    $collectedAmount += $orderCollected;
                    $totalCash += $orderCash;
                    $totalTransfer += $orderTransfer;

                    $customerOrdersCount = max(
                        (int) ($order->customer?->orders_count ?? 0),
                        (int) ($order->customer?->repair_orders_count ?? 0),
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
                        'customer_name'                => $order->customer?->name ?? $order->customer_name ?? 'Khách lẻ',
                        'customer_phone'               => $order->customer?->phone ?? $order->customer_phone ?? '',
                        'customer_orders_count'        => $customerOrdersCount,
                        'device_name'                  => $order->deviceModel?->name ?? $order->device_name ?? 'Thiết bị',
                        'status'                       => $order->status,
                        'total_price'                  => $effectiveOrderTotal,
                        'total_price_formatted'        => $formatCurrency($effectiveOrderTotal),
                        'collected_amount'             => $orderCollected,
                        'collected_amount_formatted'   => $formatCurrency($orderCollected),
                        'cash_amount'                  => $orderCash,
                        'transfer_amount'              => $orderTransfer,
                        'uncollected_amount'           => $orderUncollected,
                        'uncollected_amount_formatted' => $formatCurrency($orderUncollected),
                        'completed_at'                 => $completedAtIso,
                        'updated_at'                   => $completedAtIso,
                    ];
                }

                return [
                    'total_revenue'            => $totalRevenue,
                    'collected_amount'         => $collectedAmount,
                    'cash_amount'              => $totalCash,
                    'transfer_amount'          => $totalTransfer,
                    'uncollected_amount'       => max(0.0, $totalRevenue - $collectedAmount),
                    'completed_orders_count'   => $completedOrdersCount,
                    'finished_orders_count'    => $orders->count(),
                    'uncollected_orders_count' => $uncollectedOrdersCount,
                    'orders_breakdown'         => $breakdown,
                ];
            };

            $isCurrentMonth = $targetDate->isSameMonth(Carbon::now($tz));

            $monthlyFinishedOrders = (clone $baseQuery)
                ->where(function ($query) use ($startOfMonth, $endOfMonth, $isCurrentMonth) {
                    $query->where(function ($cq) use ($startOfMonth, $endOfMonth) {
                        $cq->where('status', 'completed')
                           ->where(function ($q) use ($startOfMonth, $endOfMonth) {
                               $q->whereBetween('handed_over_at', [$startOfMonth, $endOfMonth])
                                 ->orWhere(function ($sq) use ($startOfMonth, $endOfMonth) {
                                     $sq->whereNull('handed_over_at')
                                        ->whereBetween('updated_at', [$startOfMonth, $endOfMonth]);
                                 });
                           });
                    })->orWhere(function ($wq) use ($startOfMonth, $endOfMonth, $isCurrentMonth) {
                        $wq->whereIn('status', ['ready_for_return', 'waiting_pickup']);
                        if (! $isCurrentMonth) {
                            $wq->where(function ($q) use ($startOfMonth, $endOfMonth) {
                                $q->whereBetween('qc_passed_at', [$startOfMonth, $endOfMonth])
                                  ->orWhere(function ($sq) use ($startOfMonth, $endOfMonth) {
                                      $sq->whereNull('qc_passed_at')
                                         ->whereBetween('repair_completed_at', [$startOfMonth, $endOfMonth]);
                                  })
                                  ->orWhere(function ($sq2) use ($startOfMonth, $endOfMonth) {
                                      $sq2->whereNull('qc_passed_at')
                                          ->whereNull('repair_completed_at')
                                          ->whereBetween('created_at', [$startOfMonth, $endOfMonth]);
                                  });
                            });
                        }
                    });
                })
                ->with([
                    'payments' => function ($q) {
                        $q->whereIn('status', ['paid', 'completed']);
                    },
                    'customer' => function ($q) {
                        $q->withCount('repairOrders');
                    },
                    'deviceModel',
                ])
                ->orderByDesc(DB::raw('COALESCE(handed_over_at, qc_passed_at, repair_completed_at, updated_at)'))
                ->get();

            $selectedDateFinishedOrders = (clone $baseQuery)
                ->where(function ($query) use ($targetDateStart, $targetDateEnd) {
                    $query->where(function ($cq) use ($targetDateStart, $targetDateEnd) {
                        $cq->where('status', 'completed')
                           ->where(function ($q) use ($targetDateStart, $targetDateEnd) {
                               $q->whereBetween('handed_over_at', [$targetDateStart, $targetDateEnd])
                                 ->orWhere(function ($sq) use ($targetDateStart, $targetDateEnd) {
                                     $sq->whereNull('handed_over_at')
                                        ->whereBetween('updated_at', [$targetDateStart, $targetDateEnd]);
                                 });
                           });
                    })->orWhere(function ($wq) use ($targetDateStart, $targetDateEnd) {
                        $wq->whereIn('status', ['ready_for_return', 'waiting_pickup'])
                           ->where(function ($q) use ($targetDateStart, $targetDateEnd) {
                               $q->whereBetween('qc_passed_at', [$targetDateStart, $targetDateEnd])
                                 ->orWhere(function ($sq) use ($targetDateStart, $targetDateEnd) {
                                     $sq->whereNull('qc_passed_at')
                                        ->whereBetween('repair_completed_at', [$targetDateStart, $targetDateEnd]);
                                 })
                                 ->orWhere(function ($sq2) use ($targetDateStart, $targetDateEnd) {
                                     $sq2->whereNull('qc_passed_at')
                                         ->whereNull('repair_completed_at')
                                         ->whereBetween('created_at', [$targetDateStart, $targetDateEnd]);
                                 });
                           });
                    });
                })
                ->with([
                    'payments' => function ($q) {
                        $q->whereIn('status', ['paid', 'completed']);
                    },
                    'customer' => function ($q) {
                        $q->withCount('repairOrders');
                    },
                    'deviceModel',
                ])
                ->orderByDesc(DB::raw('COALESCE(handed_over_at, qc_passed_at, repair_completed_at, updated_at)'))
                ->get();

            // Đơn hoàn tất bàn giao trong kỳ đã chọn (Zone 1: period_metrics.handover_revenue)
            $periodCompletedOrdersWithRelations = (clone $periodCompletedOrdersQuery)
                ->with([
                    'payments' => function ($q) {
                        $q->whereIn('status', ['paid', 'completed']);
                    },
                    'customer' => function ($q) {
                        $q->withCount('repairOrders');
                    },
                    'deviceModel',
                ])
                ->orderByDesc(DB::raw('COALESCE(handed_over_at, updated_at)'))
                ->get();

            $periodHandoverStats = $buildPeriodBreakdown($periodCompletedOrdersWithRelations);
            $monthlyCompletedOrdersWithRelations = $monthlyFinishedOrders->where('status', 'completed')->values();
            $monthlyHandoverStats = $buildPeriodBreakdown($monthlyCompletedOrdersWithRelations);

            // Đơn đang chờ khách lấy tại cửa hàng (Zone 2: store_live_financials.ready_for_pickup)
            $liveReadyForPickupOrders = (clone $baseQuery)
                ->whereIn('status', ['ready_for_return', 'waiting_pickup'])
                ->with([
                    'payments' => function ($q) {
                        $q->whereIn('status', ['paid', 'completed']);
                    },
                    'customer' => function ($q) {
                        $q->withCount('repairOrders');
                    },
                    'deviceModel',
                ])
                ->orderByDesc(DB::raw('COALESCE(qc_passed_at, repair_completed_at, updated_at)'))
                ->get();

            $liveReadyForPickupStats = $buildPeriodBreakdown($liveReadyForPickupOrders);

            // Tính phần cọc và phần chưa thu của các máy đang sửa trong xưởng
            $liveInWorkshopOrders = (clone $baseQuery)
                ->whereIn('status', $inWorkshopStatuses)
                ->with([
                    'payments' => function ($q) {
                        $q->whereIn('status', ['paid', 'completed']);
                    },
                ])
                ->get(['id', 'total_price', 'initial_price', 'status']);

            foreach ($liveInWorkshopOrders as $wsOrder) {
                $rawWs = (float) (($wsOrder->total_price ?? 0) > 1 ? $wsOrder->total_price : ($wsOrder->initial_price ?? 0));
                $normWs = RepairOrder::normalizeVndAmount($rawWs);
                $paidWs = (float) $wsOrder->payments->sum(fn ($p) => RepairOrder::normalizeVndAmount($p->amount));
                $inWorkshopCollectedAmount += $paidWs;
                $inWorkshopUncollectedAmount += max(0.0, $normWs - $paidWs);
            }

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
            $selectedDateOrdersBreakdown = $selectedDatePeriodStats['orders_breakdown'];

            $calcCogsForOrderIds = function (array $orderIds): float {
                if (empty($orderIds)) {
                    return 0.0;
                }

                // 1. COGS từ các giao dịch xuất kho export_repair thực tế
                $exportCogsByOrder = DB::table('inventory_transactions as it')
                    ->leftJoin('parts as p', 'it.part_id', '=', 'p.id')
                    ->whereIn('it.repair_order_id', $orderIds)
                    ->where('it.transaction_type', 'export_repair')
                    ->select('it.repair_order_id', DB::raw('SUM(ABS(it.quantity) * COALESCE(it.unit_cost, p.cost_price, 0)) as order_cogs'))
                    ->groupBy('it.repair_order_id')
                    ->pluck('order_cogs', 'repair_order_id')
                    ->all();

                // 2. Fallback cho các đơn hoàn tất không có giao dịch xuất kho: kiểm tra quote_items của báo giá approved
                $ordersWithExport = array_keys($exportCogsByOrder);
                $remainingOrderIds = array_diff($orderIds, $ordersWithExport);

                $quoteCogs = 0.0;
                if (! empty($remainingOrderIds)) {
                    $quoteCogs = (float) DB::table('quote_items as qi')
                        ->join('repair_quotes as rq', 'qi.quote_id', '=', 'rq.id')
                        ->join('parts as p', 'qi.part_id', '=', 'p.id')
                        ->whereIn('rq.repair_order_id', $remainingOrderIds)
                        ->where(function ($q) {
                            $q->where('rq.status', 'approved')
                              ->orWhereNull('rq.status');
                        })
                        ->whereNotNull('qi.part_id')
                        ->sum(DB::raw('qi.quantity * COALESCE(p.cost_price, 0)'));
                }

                return (float) (array_sum($exportCogsByOrder) + $quoteCogs);
            };

            $selectedDateOrderIds = (clone $selectedDateOrdersQuery)->pluck('id')->all();
            $monthlyOrderIds = (clone $monthlyOrdersQuery)->pluck('id')->all();
            $periodOrderIds = $periodCompletedOrdersWithRelations->pluck('id')->all();

            $selectedDateCogs = $calcCogsForOrderIds($selectedDateOrderIds);
            $monthlyCogs = $calcCogsForOrderIds($monthlyOrderIds);
            $periodCogs = $calcCogsForOrderIds($periodOrderIds);

            $selectedDateGrossProfit = $selectedDateRevenue - $selectedDateCogs;
            $monthlyGrossProfit = $monthlyRevenue - $monthlyCogs;
            $periodRevenueAmount = (float) $periodHandoverStats['total_revenue'];
            $periodGrossProfit = $periodRevenueAmount - $periodCogs;

            $selectedDateGrossProfitMargin = $selectedDateRevenue > 0
                ? round(($selectedDateGrossProfit / $selectedDateRevenue) * 100, 1)
                : 0.0;
            $monthlyGrossProfitMargin = $monthlyRevenue > 0
                ? round(($monthlyGrossProfit / $monthlyRevenue) * 100, 1)
                : 0.0;
            $periodGrossProfitMargin = $periodRevenueAmount > 0
                ? round(($periodGrossProfit / $periodRevenueAmount) * 100, 1)
                : 0.0;
            $grossProfitMargin = $monthlyGrossProfitMargin;

            // Chuẩn hóa Công nợ khách hàng (AR):
            // Chỉ tính trên các đơn đã bàn giao hoặc hoàn tất (ready_for_return, waiting_pickup, completed) mà chưa thanh toán đủ.
            // Loại bỏ hoàn toàn các đơn xưởng (inspecting, waiting_approval, in_repair, rejected, cancelled).
            $arOrders = (clone $baseQuery)
                ->whereIn('status', ['ready_for_return', 'waiting_pickup', 'completed'])
                ->with(['payments' => function ($q) {
                    $q->where('status', 'paid');
                }])
                ->get(['id', 'total_price', 'status']);

            $accountsReceivable = 0.0;
            foreach ($arOrders as $arOrder) {
                $paid = (float) $arOrder->payments->sum('amount');
                $unpaid = (float) $arOrder->total_price - $paid;
                if ($unpaid > 0) {
                    $accountsReceivable += $unpaid;
                }
            }
            $accountsReceivableFormatted = $formatCurrencyShort($accountsReceivable);

            // Tính tổng nợ NCC (Accounts Payable)
            $supplierQuery = \App\Models\Supplier::where('is_active', true);
            if ($user && $user->tenant_id && $user->role !== 'super_admin') {
                $supplierQuery->where('tenant_id', $user->tenant_id);
            }
            $accountsPayable = (float) $supplierQuery->sum('debt_balance');
            $accountsPayableFormatted = $formatCurrencyShort($accountsPayable);

            $periodProfitAndCogs = [
                'revenue'                    => $periodRevenueAmount,
                'revenue_formatted'          => $formatCurrency($periodRevenueAmount),
                'cogs'                       => $periodCogs,
                'cogs_amount'                => $periodCogs,
                'cogs_formatted'             => $formatCurrency($periodCogs),
                'gross_profit'               => $periodGrossProfit,
                'gross_profit_formatted'     => $formatCurrency($periodGrossProfit),
                'gross_profit_margin'        => $periodGrossProfitMargin,
                'accounts_payable'           => $accountsPayable,
                'accounts_payable_formatted' => $formatCurrency($accountsPayable),
            ];

            $selectedDateCogsFormatted = $formatCurrencyShort($selectedDateCogs);
            $monthlyCogsFormatted = $formatCurrencyShort($monthlyCogs);
            $selectedDateGrossProfitFormatted = $formatCurrencyShort($selectedDateGrossProfit);
            $monthlyGrossProfitFormatted = $formatCurrencyShort($monthlyGrossProfit);
        }

        // 6. Tỷ lệ hoàn tất đơn hàng
        $totalOrders = (clone $baseQuery)->count();
        $completedOrders = (clone $baseQuery)->where('status', 'completed')->count();
        $completionRate = $totalOrders > 0
            ? round(($completedOrders / $totalOrders) * 100, 1)
            : 0.0;

        // 6b. Tỷ lệ bảo hành / khiếu nại (Warranty Return Rate %)
        // Đếm số đơn bảo hành/khiếu nại (order_type = 'warranty' hoặc có claim_id)
        $warrantyClaimsCount = (clone $baseQuery)
            ->where(function ($q) {
                $q->where('order_type', 'warranty')
                  ->orWhereNotNull('claim_id');
            })
            ->count();

        $warrantyRate = $completedOrders > 0
            ? round(($warrantyClaimsCount / $completedOrders) * 100, 1)
            : 0.0;

        // 5. Phân bổ theo trạng thái (Bao phủ 13 trạng thái chuẩn + gộp alias)
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

        $statusRawCounts = (clone $baseQuery)
            ->select('status', DB::raw('count(*) as count'))
            ->groupBy('status')
            ->pluck('count', 'status')
            ->all();

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

        // 6. Workload by status cho dashboard widgets
        $workloadByStatus = [
            'inspecting'       => $statusDistribution['inspecting'] ?? 0,
            'waiting_approval' => $statusDistribution['waiting_approval'] ?? 0,
            'in_repair'        => ($statusDistribution['in_repair'] ?? 0)
                                + ($statusDistribution['assigned'] ?? 0)
                                + ($statusDistribution['waiting_tech'] ?? 0)
                                + ($statusDistribution['waiting_parts'] ?? 0),
            'waiting_qc'       => ($statusDistribution['waiting_qc'] ?? 0)
                                + ($statusDistribution['rework_needed'] ?? 0),
            'ready_for_return' => ($statusDistribution['ready_for_return'] ?? 0)
                                + ($statusDistribution['waiting_pickup'] ?? 0),
        ];

        // 7. Biểu đồ doanh thu qua SQL Aggregation trực tiếp (Chỉ tính cho Admin)
        $revenueChart = [];
        $periodRevenueChart = [];
        if ($isAdmin) {
            $dayNames = [
                0 => 'CN',
                1 => 'T2',
                2 => 'T3',
                3 => 'T4',
                4 => 'T5',
                5 => 'T6',
                6 => 'T7',
            ];

            $buildChartForRange = function (Carbon $rangeStart, Carbon $rangeEnd) use ($baseQuery, $dayNames, $tz): array {
                $dailyStats = (clone $baseQuery)
                    ->where('status', 'completed')
                    ->where(function ($q) use ($rangeStart, $rangeEnd) {
                        $q->whereBetween('handed_over_at', [$rangeStart, $rangeEnd])
                          ->orWhere(function ($sq) use ($rangeStart, $rangeEnd) {
                              $sq->whereNull('handed_over_at')
                                 ->whereBetween('updated_at', [$rangeStart, $rangeEnd]);
                          });
                    })
                    ->selectRaw("DATE(COALESCE(handed_over_at, updated_at)) as day_date, COUNT(*) as order_count, SUM(total_price) as total_revenue")
                    ->groupBy('day_date')
                    ->get()
                    ->keyBy('day_date');

                $points = [];
                $cursor = $rangeStart->copy()->startOfDay();
                $endDay = $rangeEnd->copy()->startOfDay();
                while ($cursor->lte($endDay)) {
                    $dateStr = $cursor->toDateString();
                    $dayOfWeek = $cursor->dayOfWeek;
                    $label = $dayNames[$dayOfWeek] ?? ('T' . ($dayOfWeek + 1));
                    $stat = $dailyStats->get($dateStr);

                    $points[] = [
                        'date'             => $dateStr,
                        'label'            => $label,
                        'revenue'          => (float) ($stat?->total_revenue ?? 0),
                        'completed_orders' => (int) ($stat?->order_count ?? 0),
                    ];
                    $cursor->addDay();
                }

                return $points;
            };

            // Biểu đồ theo kỳ đã chọn (period_metrics.revenue_chart)
            $chartRangeStart = match ($activePeriodKey) {
                'this_month' => $startOfMonth->copy()->startOfDay(),
                '30_days'    => $targetDate->copy()->subDays(29)->startOfDay(),
                '14_days'    => $targetDate->copy()->subDays(13)->startOfDay(),
                'custom'     => $periodStart->copy()->startOfDay(),
                default      => $periodEnd->copy()->subDays(6)->startOfDay(),
            };
            $chartRangeEnd = match ($activePeriodKey) {
                'this_month' => $endOfMonth->copy()->endOfDay(),
                'custom'     => $periodEnd->copy()->endOfDay(),
                default      => $periodEnd->copy()->endOfDay(),
            };
            $periodRevenueChart = $buildChartForRange($chartRangeStart, $chartRangeEnd);

            // Top-level revenue_chart:
            // Nếu client truyền period tường minh (this_month, today, yesterday, custom, 7_days, 30_days) thì trả theo period;
            // nếu không truyền period thì trả 14 ngày mặc định để tương thích ngược với KpiTest.
            if (! $hasExplicitPeriod) {
                $defaultStart = Carbon::today($tz)->subDays(13)->startOfDay();
                $defaultEnd = Carbon::today($tz)->endOfDay();
                $revenueChart = $buildChartForRange($defaultStart, $defaultEnd);
            } elseif (in_array($periodInput, ['7_days', '14_days', '30_days'], true) || is_numeric($periodInput)) {
                $refEnd = ($request->filled('date') || $request->filled('target_date')) ? $targetDate->copy() : Carbon::today($tz);
                $revenueChart = $buildChartForRange($refEnd->copy()->subDays($daysCount - 1)->startOfDay(), $refEnd->copy()->endOfDay());
            } else {
                $revenueChart = $periodRevenueChart;
            }
        }

        // 8. Thống kê chỉ số điều hành (Operational Summary) & Tiến độ xưởng 6 bước loại trừ lẫn nhau (Zone 3: workshop_pipeline)
        // Quy tắc phân vùng loại trừ lẫn nhau:
        // - Bước 6 (ready_for_return / waiting_pickup): status IN ('ready_for_return', 'waiting_pickup')
        // - Các đơn còn lại là in_workshop:
        //   + Bước 4 (waiting_parts) ưu tiên kiểm tra trước: status = 'waiting_parts' OR special_parts_status = 'pending'
        //   + Các đơn in_workshop còn lại (special_parts_status != 'pending'):
        //     * Bước 1 (inspecting): status = 'inspecting'
        //     * Bước 2 (waiting_approval): status IN ('waiting_approval', 'quote_pending')
        //     * Bước 3 (in_repair): status IN ('waiting_tech', 'assigned', 'in_repair', 'rework_needed')
        //     * Bước 5 (waiting_qc): status IN ('waiting_qc', 'qc_pending', 'qc_inspecting')
        $activeOrdersRecords = (clone $baseQuery)
            ->whereNotIn('status', ['completed', 'cancelled', 'rejected'])
            ->get(['id', 'status', 'special_parts_status', 'created_at']);

        $pipelineCounts = [
            'inspecting'       => 0,
            'waiting_approval' => 0,
            'in_repair'        => 0,
            'waiting_parts'    => 0,
            'waiting_qc'       => 0,
            'ready_for_return' => 0,
        ];

        foreach ($activeOrdersRecords as $ao) {
            $st = $ao->status;
            $sp = $ao->special_parts_status;
            if (in_array($st, ['ready_for_return', 'waiting_pickup'], true)) {
                $pipelineCounts['ready_for_return']++;
            } elseif ($st === 'waiting_parts' || $sp === 'pending') {
                $pipelineCounts['waiting_parts']++;
            } elseif (in_array($st, ['waiting_qc', 'qc_pending', 'qc_inspecting'], true)) {
                $pipelineCounts['waiting_qc']++;
            } elseif (in_array($st, ['waiting_approval', 'quote_pending'], true)) {
                $pipelineCounts['waiting_approval']++;
            } elseif (in_array($st, ['waiting_tech', 'assigned', 'in_repair', 'rework_needed'], true)) {
                $pipelineCounts['in_repair']++;
            } else {
                $pipelineCounts['inspecting']++;
            }
        }

        $activeOrdersOp = $activeOrdersRecords->count();
        $waitingPickupOrders = $pipelineCounts['ready_for_return'];
        $inWorkshopPipelineCount = $activeOrdersOp - $waitingPickupOrders;

        $waitingPartsOrders = (clone $baseQuery)
            ->where(function ($q) {
                $q->where('status', 'waiting_parts')
                  ->orWhere('special_parts_status', 'pending');
            })
            ->whereNotIn('status', ['completed', 'cancelled', 'rejected'])
            ->count();

        $twentyFourHoursAgo = Carbon::now($tz)->subHours(24);
        $overdueOrdersCount = (clone $baseQuery)
            ->whereNotIn('status', ['completed', 'cancelled', 'rejected', 'ready_for_return', 'waiting_pickup'])
            ->where('created_at', '<=', $twentyFourHoursAgo)
            ->count();

        $operationalSummary = [
            'active_orders'          => $activeOrdersOp,
            'waiting_pickup_orders'  => $waitingPickupOrders,
            'waiting_parts_orders'   => $waitingPartsOrders,
            'overdue_orders'         => $overdueOrdersCount,
        ];

        $workshopPipeline = [
            'total_active_orders' => $activeOrdersOp,
            'open_orders_count'   => $activeOrdersOp,
            'in_workshop_count'   => $inWorkshopPipelineCount,
            'steps'               => $pipelineCounts,
            'inspecting'          => $pipelineCounts['inspecting'],
            'waiting_approval'    => $pipelineCounts['waiting_approval'],
            'in_repair'           => $pipelineCounts['in_repair'],
            'waiting_parts'       => $pipelineCounts['waiting_parts'],
            'waiting_qc'          => $pipelineCounts['waiting_qc'],
            'ready_for_return'    => $pipelineCounts['ready_for_return'],
            'waiting_pickup'      => $pipelineCounts['ready_for_return'],
            'overdue_count'       => $overdueOrdersCount,
            'overdue_orders'      => $overdueOrdersCount,
        ];

        // 9. Danh sách công việc cần xử lý trong ca (Actionable Tasks - 5 Tabs)
        $overdueCount = $overdueOrdersCount;
        $overdueOrders = (clone $baseQuery)
            ->whereNotIn('status', ['completed', 'cancelled', 'rejected', 'ready_for_return', 'waiting_pickup'])
            ->where('created_at', '<=', $twentyFourHoursAgo)
            ->with(['customer', 'technician', 'deviceModel'])
            ->orderBy('created_at', 'asc')
            ->limit(200)
            ->get()
            ->map(function (RepairOrder $order) use ($tz) {
                $hoursOverdue = max(0, (int) Carbon::parse($order->created_at, $tz)->diffInHours(Carbon::now($tz)));
                return [
                    'id'               => $order->id,
                    'order_code'       => $order->order_code,
                    'customer_name'    => $order->customer?->name ?? 'Khách vãng lai',
                    'customer_phone'   => $order->customer?->phone ?? '',
                    'device_model'     => $order->deviceModel?->name ?? 'Thiết bị',
                    'technician_name'  => $order->technician?->name ?? 'Chưa phân công',
                    'created_at'       => $order->created_at?->toIso8601String(),
                    'hours_overdue'    => $hoursOverdue,
                    'status'           => $order->status,
                    'issue_description'=> $order->issue_description ?? '',
                    'total_price'      => RepairOrder::normalizeVndAmount($order->total_price ?? 0),
                ];
            })
            ->values()
            ->all();

        $waitingApprovalQuery = (clone $baseQuery)
            ->whereIn('status', ['waiting_approval', 'quote_pending'])
            ->where(function ($sq) {
                $sq->whereNull('special_parts_status')
                   ->orWhere('special_parts_status', '!=', 'pending');
            });
        $waitingApprovalCount = (clone $waitingApprovalQuery)->count();
        $waitingApprovalOrders = $waitingApprovalQuery
            ->with(['customer', 'technician', 'deviceModel'])
            ->orderBy('updated_at', 'desc')
            ->limit(200)
            ->get()
            ->map(function (RepairOrder $order) use ($tz) {
                $hoursPending = max(0, (int) Carbon::parse($order->updated_at ?? $order->created_at, $tz)->diffInHours(Carbon::now($tz)));
                $rawPrice = (float) ($order->total_price ?? 0) > 1 ? $order->total_price : ($order->initial_price ?? 0);
                return [
                    'id'               => $order->id,
                    'order_code'       => $order->order_code,
                    'customer_name'    => $order->customer?->name ?? 'Khách vãng lai',
                    'customer_phone'   => $order->customer?->phone ?? '',
                    'device_model'     => $order->deviceModel?->name ?? 'Thiết bị',
                    'technician_name'  => $order->technician?->name ?? 'Chưa phân công',
                    'total_price'      => RepairOrder::normalizeVndAmount($rawPrice),
                    'issue_description'=> $order->issue_description ?? '',
                    'hours_pending'    => $hoursPending,
                    'status'           => $order->status,
                    'created_at'       => $order->created_at?->toIso8601String(),
                ];
            })
            ->values()
            ->all();

        $waitingPartsTaskQuery = (clone $baseQuery)
            ->whereNotIn('status', ['completed', 'cancelled', 'rejected', 'ready_for_return', 'waiting_pickup'])
            ->where(function ($q) {
                $q->where('status', 'waiting_parts')
                  ->orWhere('special_parts_status', 'pending');
            });
        $waitingPartsTaskCount = (clone $waitingPartsTaskQuery)->count();
        $waitingPartsTaskOrders = $waitingPartsTaskQuery
            ->with(['customer', 'technician', 'deviceModel'])
            ->orderBy('updated_at', 'desc')
            ->limit(200)
            ->get()
            ->map(function (RepairOrder $order) use ($tz) {
                $hoursWaiting = max(0, (int) Carbon::parse($order->updated_at ?? $order->created_at, $tz)->diffInHours(Carbon::now($tz)));
                $rawPrice = (float) ($order->total_price ?? 0) > 1 ? $order->total_price : ($order->initial_price ?? 0);
                return [
                    'id'                   => $order->id,
                    'order_code'           => $order->order_code,
                    'customer_name'        => $order->customer?->name ?? 'Khách vãng lai',
                    'customer_phone'       => $order->customer?->phone ?? '',
                    'device_model'         => $order->deviceModel?->name ?? 'Thiết bị',
                    'technician_name'      => $order->technician?->name ?? 'Chưa phân công',
                    'total_price'          => RepairOrder::normalizeVndAmount($rawPrice),
                    'issue_description'    => $order->issue_description ?? '',
                    'special_parts_status' => $order->special_parts_status,
                    'special_parts_note'   => $order->special_parts_note ?? '',
                    'hours_waiting'        => $hoursWaiting,
                    'status'               => $order->status,
                    'created_at'           => $order->created_at?->toIso8601String(),
                ];
            })
            ->values()
            ->all();

        $waitingQcQuery = (clone $baseQuery)
            ->whereIn('status', ['waiting_qc', 'qc_pending', 'qc_inspecting'])
            ->where(function ($sq) {
                $sq->whereNull('special_parts_status')
                   ->orWhere('special_parts_status', '!=', 'pending');
            });
        $waitingQcCount = (clone $waitingQcQuery)->count();
        $waitingQcOrders = $waitingQcQuery
            ->with(['customer', 'technician', 'deviceModel'])
            ->orderBy('repair_completed_at', 'asc')
            ->limit(200)
            ->get()
            ->map(function (RepairOrder $order) use ($tz) {
                $refTime = $order->repair_completed_at ?? $order->updated_at ?? $order->created_at;
                $hoursWaiting = max(0, (int) Carbon::parse($refTime, $tz)->diffInHours(Carbon::now($tz)));
                return [
                    'id'                  => $order->id,
                    'order_code'          => $order->order_code,
                    'customer_name'       => $order->customer?->name ?? 'Khách vãng lai',
                    'customer_phone'      => $order->customer?->phone ?? '',
                    'device_model'        => $order->deviceModel?->name ?? 'Thiết bị',
                    'technician_name'     => $order->technician?->name ?? 'Chưa phân công',
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
        $waitingPickupList = (clone $baseQuery)
            ->whereIn('status', ['waiting_pickup', 'ready_for_return'])
            ->with(['customer', 'technician', 'deviceModel'])
            ->orderBy('qc_passed_at', 'asc')
            ->limit(200)
            ->get()
            ->map(function (RepairOrder $order) {
                return [
                    'id'               => $order->id,
                    'order_code'       => $order->order_code,
                    'customer_name'    => $order->customer?->name ?? 'Khách vãng lai',
                    'customer_phone'   => $order->customer?->phone ?? '',
                    'device_model'     => $order->deviceModel?->name ?? 'Thiết bị',
                    'technician_name'  => $order->technician?->name ?? 'Chưa phân công',
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
        $lowStockCount = (clone $lowStockQuery)->count();
        $lowStockParts = $lowStockQuery
            ->orderBy('stock_quantity', 'asc')
            ->limit(200)
            ->get()
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
            'waiting_parts'    => $waitingPartsTaskOrders,
            'special_parts'    => $waitingPartsTaskOrders,
            'waiting_qc'       => $waitingQcOrders,
            'pending_qc'       => $waitingQcOrders,
            'waiting_pickup'   => $waitingPickupList,
            'ready_pickup'     => $waitingPickupList,
            'low_stock_parts'  => $lowStockParts,
            'counts'           => [
                'overdue'          => $overdueCount,
                'waiting_approval' => $waitingApprovalCount,
                'waiting_parts'    => $waitingPartsTaskCount,
                'waiting_qc'       => $waitingQcCount,
                'waiting_pickup'   => $waitingPickupCount,
                'ready_pickup'     => $waitingPickupCount,
                'low_stock'        => $lowStockCount,
                'total'            => $overdueCount + $waitingQcCount + $waitingPickupCount,
            ],
        ];

        // Cấu trúc 3 vùng ngữ nghĩa (Zone 1: period_metrics, Zone 2: store_live_financials, Zone 3: workshop_pipeline)
        $periodMetrics = [
            'period'          => $activePeriodKey,
            'date'            => $targetDateStr,
            'from_date'       => $periodStart->toDateString(),
            'to_date'         => $periodEnd->toDateString(),
            'period_label'    => $periodLabel,
            'intake_count'    => $periodIntakeCount,
            'completed_count' => $periodCompletedCount,
            'warranty_count'  => $periodWarrantyCount,
            'order_flow'      => [
                'intake_count'    => $periodIntakeCount,
                'completed_count' => $periodCompletedCount,
                'warranty_count'  => $periodWarrantyCount,
            ],
            'handover_revenue'=> $isAdmin && $periodHandoverStats ? [
                'total_revenue'                => $periodHandoverStats['total_revenue'],
                'total_revenue_formatted'      => $formatCurrency($periodHandoverStats['total_revenue']),
                'collected_amount'             => $periodHandoverStats['collected_amount'],
                'collected_amount_formatted'   => $formatCurrency($periodHandoverStats['collected_amount']),
                'cash_amount'                  => $periodHandoverStats['cash_amount'],
                'cash_amount_formatted'        => $formatCurrency($periodHandoverStats['cash_amount']),
                'transfer_amount'              => $periodHandoverStats['transfer_amount'],
                'transfer_amount_formatted'    => $formatCurrency($periodHandoverStats['transfer_amount']),
                'uncollected_amount'           => $periodHandoverStats['uncollected_amount'],
                'uncollected_amount_formatted' => $formatCurrency($periodHandoverStats['uncollected_amount']),
                'completed_orders_count'       => $periodHandoverStats['completed_orders_count'],
                'orders_breakdown'             => $periodHandoverStats['orders_breakdown'],
            ] : null,
            'profit_and_cogs' => $isAdmin ? $periodProfitAndCogs : null,
            'monthly_revenue_summary' => $isAdmin && $monthlyHandoverStats ? [
                'month_label'                  => 'Tháng ' . $targetDate->format('m/Y'),
                'total_revenue'                => $monthlyHandoverStats['total_revenue'],
                'total_revenue_formatted'      => $formatCurrency($monthlyHandoverStats['total_revenue']),
                'collected_amount'             => $monthlyHandoverStats['collected_amount'],
                'collected_amount_formatted'   => $formatCurrency($monthlyHandoverStats['collected_amount']),
                'cash_amount'                  => $monthlyHandoverStats['cash_amount'],
                'cash_amount_formatted'        => $formatCurrency($monthlyHandoverStats['cash_amount']),
                'transfer_amount'              => $monthlyHandoverStats['transfer_amount'],
                'transfer_amount_formatted'    => $formatCurrency($monthlyHandoverStats['transfer_amount']),
                'completed_orders_count'       => $monthlyHandoverStats['completed_orders_count'],
                'gross_profit'                 => $monthlyGrossProfit,
                'cogs_amount'                  => $monthlyCogs,
            ] : null,
            'revenue_chart'   => $isAdmin ? $periodRevenueChart : [],
        ];

        $waitingPickupTotalAmt = $isAdmin && $liveReadyForPickupStats ? (float) $liveReadyForPickupStats['total_revenue'] : 0.0;
        $waitingPickupDepositAmt = $isAdmin && $liveReadyForPickupStats ? (float) $liveReadyForPickupStats['collected_amount'] : 0.0;
        $waitingPickupUncollectedAmt = $isAdmin && $liveReadyForPickupStats ? (float) $liveReadyForPickupStats['uncollected_amount'] : 0.0;

        $storeLiveFinancials = [
            'open_orders_count'                 => $readyForPickupCount + $inWorkshopCount,
            'open_orders_amount'                => $isAdmin ? ($waitingPickupTotalAmt + $inWorkshopAmount) : null,
            'waiting_pickup_count'              => $readyForPickupCount,
            'waiting_pickup_total_amount'       => $isAdmin ? $waitingPickupTotalAmt : null,
            'waiting_pickup_deposit_amount'     => $isAdmin ? $waitingPickupDepositAmt : null,
            'waiting_pickup_uncollected_amount' => $isAdmin ? $waitingPickupUncollectedAmt : null,
            'in_workshop_count'                 => $inWorkshopCount,
            'in_workshop_expected_amount'       => $isAdmin ? $inWorkshopAmount : null,
            'ready_for_pickup' => $isAdmin && $liveReadyForPickupStats ? [
                'count'                        => $readyForPickupCount,
                'total_amount'                 => $liveReadyForPickupStats['total_revenue'],
                'total_amount_formatted'       => $formatCurrency($liveReadyForPickupStats['total_revenue']),
                'collected_amount'             => $liveReadyForPickupStats['collected_amount'],
                'collected_amount_formatted'   => $formatCurrency($liveReadyForPickupStats['collected_amount']),
                'deposit_amount'               => $liveReadyForPickupStats['collected_amount'],
                'deposit_amount_formatted'     => $formatCurrency($liveReadyForPickupStats['collected_amount']),
                'uncollected_amount'           => $liveReadyForPickupStats['uncollected_amount'],
                'uncollected_amount_formatted' => $formatCurrency($liveReadyForPickupStats['uncollected_amount']),
                'orders_breakdown'             => $liveReadyForPickupStats['orders_breakdown'],
            ] : [
                'count' => $readyForPickupCount,
            ],
            'in_workshop' => $isAdmin ? [
                'count'                        => $inWorkshopCount,
                'expected_amount'              => $inWorkshopAmount,
                'expected_amount_formatted'    => $formatCurrency($inWorkshopAmount),
                'estimated_amount'             => $inWorkshopAmount,
                'estimated_amount_formatted'   => $formatCurrency($inWorkshopAmount),
                'collected_amount'             => $inWorkshopCollectedAmount,
                'uncollected_amount'           => $inWorkshopUncollectedAmount,
                'uncollected_amount_formatted' => $formatCurrency($inWorkshopUncollectedAmount),
            ] : [
                'count' => $inWorkshopCount,
            ],
            'outstanding_debt' => $isAdmin ? [
                'accounts_receivable'                => $accountsReceivable,
                'accounts_receivable_formatted'      => $formatCurrency($accountsReceivable),
                'accounts_payable'                   => $accountsPayable,
                'accounts_payable_formatted'         => $formatCurrency($accountsPayable),
                'total_uncollected_amount'           => $totalUncollectedAmount,
                'total_uncollected_amount_formatted' => $totalUncollectedAmountFormatted,
            ] : null,
        ];

        $summary = [
            'active_orders'                  => $activeOrders,
            'intake_today'                   => $intakeToday,
            'today_orders'                   => $intakeToday,
            'selected_date'                  => $targetDateStr,
            'selected_date_completed_orders' => $selectedDateCompletedOrders,
            'completion_rate'                => $completionRate,
            'warranty_rate'                  => $warrantyRate,
            'warranty_claims_count'          => $warrantyClaimsCount,
            'total_orders'                   => $totalOrders,
            'completed_orders'               => $completedOrders,
            'reconciliation'                 => $reconciliation,
            'operational_summary'            => $operationalSummary,
            'actionable_tasks'               => $actionableTasks,
            'period_metrics'                 => $periodMetrics,
            'store_live_financials'          => $storeLiveFinancials,
            'workshop_pipeline'              => $workshopPipeline,
        ];

        if ($isAdmin) {
            $financialMetrics = [
                'daily_revenue'                            => $dailyRevenue,
                'daily_revenue_formatted'                  => $dailyRevenueFormatted,
                'selected_date_revenue'                    => $selectedDateRevenue,
                'selected_date_revenue_formatted'          => $selectedDateRevenueFormatted,
                'monthly_revenue'                          => $monthlyRevenue,
                'monthly_revenue_formatted'                => $monthlyRevenueFormatted,
                'monthly_total_revenue'                    => $monthlyTotalRevenue,
                'monthly_total_revenue_formatted'          => $monthlyTotalRevenueFormatted,
                'monthly_revenue_full_formatted'           => $monthlyRevenueFullFormatted,
                'monthly_collected_amount'                 => $monthlyCollectedAmount,
                'monthly_collected_amount_formatted'       => $monthlyCollectedAmountFormatted,
                'monthly_completed_orders_count'           => $monthlyCompletedOrdersCount,
                'monthly_finished_orders_count'            => $monthlyFinishedOrdersCount,
                'monthly_uncollected_amount'               => $monthlyUncollectedAmount,
                'monthly_uncollected_amount_formatted'     => $monthlyUncollectedAmountFormatted,
                'monthly_uncollected_orders_count'         => $monthlyUncollectedOrdersCount,
                'monthly_orders_breakdown'                 => $monthlyOrdersBreakdown,
                'selected_date_total_revenue'              => $selectedDateTotalRevenue,
                'selected_date_total_revenue_formatted'    => $selectedDateTotalRevenueFormatted,
                'selected_date_revenue_full_formatted'     => $selectedDateRevenueFullFormatted,
                'selected_date_collected_amount'           => $selectedDateCollectedAmount,
                'selected_date_collected_amount_formatted' => $selectedDateCollectedAmountFormatted,
                'selected_date_completed_orders_count'     => $selectedDateCompletedOrdersCount,
                'selected_date_finished_orders_count'      => $selectedDateFinishedOrdersCount,
                'selected_date_uncollected_amount'         => $selectedDateUncollectedAmount,
                'selected_date_uncollected_amount_formatted'=> $selectedDateUncollectedAmountFormatted,
                'selected_date_uncollected_orders_count'   => $selectedDateUncollectedOrdersCount,
                'selected_date_orders_breakdown'           => $selectedDateOrdersBreakdown,
                'selected_date_cogs'                       => $selectedDateCogs,
                'selected_date_cogs_formatted'             => $selectedDateCogsFormatted,
                'monthly_cogs'                             => $monthlyCogs,
                'monthly_cogs_formatted'                   => $monthlyCogsFormatted,
                'selected_date_gross_profit'               => $selectedDateGrossProfit,
                'selected_date_gross_profit_formatted'     => $selectedDateGrossProfitFormatted,
                'selected_date_gross_profit_margin'        => $selectedDateGrossProfitMargin,
                'monthly_gross_profit'                     => $monthlyGrossProfit,
                'monthly_gross_profit_formatted'           => $monthlyGrossProfitFormatted,
                'monthly_gross_profit_margin'              => $monthlyGrossProfitMargin,
                'gross_profit_margin'                      => $grossProfitMargin,
                'accounts_receivable'                      => $accountsReceivable,
                'accounts_receivable_formatted'            => $accountsReceivableFormatted,
                'accounts_payable'                         => $accountsPayable,
                'accounts_payable_formatted'               => $accountsPayableFormatted,
            ];

            $summary = array_merge($summary, $financialMetrics);
        }

        $responsePayload = [
            'summary'                         => $summary,
            'active_orders'                   => $activeOrders,
            'intake_today'                    => $intakeToday,
            'today_orders'                    => $intakeToday,
            'selected_date'                   => $targetDateStr,
            'selected_date_completed_orders'  => $selectedDateCompletedOrders,
            'reconciliation'                  => $reconciliation,
            'completion_rate'                 => $completionRate,
            'warranty_rate'                   => $warrantyRate,
            'warranty_claims_count'           => $warrantyClaimsCount,
            'total_orders'                    => $totalOrders,
            'completed_orders'                => $completedOrders,
            'status_distribution'             => $statusDistribution,
            'workload_by_status'              => $workloadByStatus,
            'operational_summary'             => $operationalSummary,
            'actionable_tasks'                => $actionableTasks,
            'period_metrics'                  => $periodMetrics,
            'store_live_financials'           => $storeLiveFinancials,
            'workshop_pipeline'               => $workshopPipeline,
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
