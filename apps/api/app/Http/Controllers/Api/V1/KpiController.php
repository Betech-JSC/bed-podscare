<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
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
        $branchId = $request->input('branch_id');
        if ($user && $user->role !== 'admin') {
            $branchId = $user->branch_id;
        }
        $techId = $request->input('technician_id');
        $fromDate = $request->input('from_date', $request->input('date_from'));
        $toDate = $request->input('to_date', $request->input('date_to'));

        // 1. Lọc danh sách nhân viên kỹ thuật (hoặc theo branch / technician_id)
        $userQuery = User::whereIn('role', ['technician', 'tech']);

        if ($branchId && $branchId !== 'all') {
            $userQuery->where('branch_id', $branchId);
        }

        if ($techId) {
            $userQuery->where('id', $techId);
        }

        $technicians = $userQuery->with('branch')->get();

        // Nếu chỉ định technician_id cụ thể nhưng user mang vai trò khác (ví dụ admin test)
        if ($techId && $technicians->isEmpty()) {
            $technicians = User::where('id', $techId)->with('branch')->get();
        }

        // Nếu không có KTV nào thỏa mãn trong DB, fallback lấy tất cả KTV hoặc user có đơn
        if ($technicians->isEmpty() && ! $techId) {
            $technicians = User::whereNotNull('role')->with('branch')->limit(10)->get();
        }

        $techIds = $technicians->pluck('id')->all();

        // 2. Truy vấn tất cả repair orders của các KTV
        $ordersQuery = RepairOrder::whereIn('technician_id', $techIds);

        if ($branchId && $branchId !== 'all') {
            $ordersQuery->where('branch_id', $branchId);
        }

        if ($fromDate) {
            $ordersQuery->whereDate('created_at', '>=', $fromDate);
        }

        if ($toDate) {
            $ordersQuery->whereDate('created_at', '<=', $toDate);
        }

        $ordersGrouped = $ordersQuery->with('qcInspections')->get()->groupBy('technician_id');

        $staffKpis = [];
        $totalSystemOrders = 0;
        $totalSystemCompleted = 0;
        $totalSystemRework = 0;
        $allSystemDurations = [];
        $totalSystemQcTotal = 0;
        $totalSystemQcPassed = 0;

        foreach ($technicians as $tech) {
            /** @var \Illuminate\Support\Collection<int, RepairOrder> $techOrders */
            $techOrders = $ordersGrouped->get($tech->id, collect());
            $orderCount = $techOrders->count();

            // Tổng đơn hoàn tất
            $completedOrders = $techOrders->where('status', 'completed');
            $completedCount = $completedOrders->count();

            // Đơn sửa lại / bảo hành (rework_needed hoặc fail QC)
            $reworkOrders = $techOrders->filter(function ($order) {
                return $order->status === 'rework_needed'
                    || $order->qcInspections->contains('result', 'fail');
            });
            $reworkCount = $reworkOrders->count();

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
                'in_repair'                    => $techOrders->whereIn('status', ['assigned', 'in_repair', 'waiting_parts', 'waiting_qc'])->count(),
                'qc_passed'                    => $qcPassed,
                'qc_total'                     => $qcTotal,
                'qc_pass_rate'                 => $qcPassRate,
                'qcPass'                       => $qcPassRate !== null ? "{$qcPassRate}%" : null,
                'rating'                       => $rating,
                'trend'                        => null,
                'avg_processing_time_minutes'  => $avgMinutes,
                'avg_processing_time_hours'    => $avgHours,
                'avg_processing_time_formatted'=> $formattedTime,
            ];
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

        $summary = [
            'total_technicians'            => count($technicians),
            'total_orders'                 => $totalSystemOrders,
            'total_completed'              => $totalSystemCompleted,
            'completed'                    => $totalSystemCompleted,
            'total_rework'                 => $totalSystemRework,
            'rework_needed'                => $totalSystemRework,
            'qc_pass_rate'                 => $systemQcRate,
            'avg_processing_time_minutes'  => $systemAvgMinutes,
            'avg_processing_time_hours'    => $systemAvgHours,
            'avg_processing_time_formatted'=> $systemFormattedTime,
            'avg_repair_days'              => $systemAvgDays > 0 ? (str_replace('.', ',', (string) $systemAvgDays) . ' ngày') : null,
            'customer_satisfaction'        => $customerSatisfaction,
        ];

        // Nếu client yêu cầu chỉ lấy danh sách mảng KTV
        if ($request->input('view') === 'list' || $request->boolean('flat')) {
            return $this->success($staffKpis, 'Lấy thống kê KPI nhân sự thành công.');
        }

        return $this->success([
            'summary' => $summary,
            'staff'   => $staffKpis,
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
        $branchId = $request->input('branch_id');
        if ($user && $user->role !== 'admin') {
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
            $baseQuery->where('branch_id', $branchId);
        }

        // 1. Số đơn đang hoạt động (không thuộc trạng thái hoàn tất hoặc hủy)
        $activeOrders = (clone $baseQuery)
            ->whereNotIn('status', ['completed', 'cancelled'])
            ->count();

        // 2. Tiếp nhận hôm nay
        $tz = config('app.timezone', 'Asia/Ho_Chi_Minh');
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

        $targetDateStart = Carbon::parse($targetDateStr, $tz)->startOfDay();
        $targetDateEnd = Carbon::parse($targetDateStr, $tz)->endOfDay();

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

        // 4. Doanh thu tháng này từ các đơn hoàn tất
        $startOfMonth = Carbon::now()->startOfMonth();
        $monthlyRevenue = (float) (clone $baseQuery)
            ->where('status', 'completed')
            ->where(function ($q) use ($startOfMonth) {
                $q->whereDate('handed_over_at', '>=', $startOfMonth)
                  ->orWhereDate('updated_at', '>=', $startOfMonth)
                  ->orWhereDate('created_at', '>=', $startOfMonth);
            })
            ->sum('total_price');

        // Định dạng doanh thu tháng
        if ($monthlyRevenue >= 1000000) {
            $revenueInMillions = round($monthlyRevenue / 1000000, 1);
            $monthlyRevenueFormatted = str_replace('.', ',', (string) $revenueInMillions) . 'tr ₫';
        } else {
            $monthlyRevenueFormatted = number_format($monthlyRevenue, 0, ',', '.') . ' ₫';
        }

        // 5. Khối đối chiếu máy đã lấy vs máy chưa lấy (Reconciliation)
        $handedOverCount = (int) (clone $baseQuery)
            ->where('status', 'completed')
            ->count();

        $handedOverRevenue = (float) (clone $baseQuery)
            ->where('status', 'completed')
            ->sum('total_price');

        $readyForPickupCount = (int) (clone $baseQuery)
            ->whereIn('status', ['ready_for_return', 'waiting_pickup'])
            ->count();

        $readyForPickupAmount = (float) (clone $baseQuery)
            ->whereIn('status', ['ready_for_return', 'waiting_pickup'])
            ->sum('total_price');

        $inWorkshopStatuses = [
            'inspecting',
            'waiting_approval',
            'waiting_tech',
            'assigned',
            'in_repair',
            'waiting_parts',
            'rework_needed',
            'waiting_qc',
            'qc_pending',
        ];

        $inWorkshopCount = (int) (clone $baseQuery)
            ->whereIn('status', $inWorkshopStatuses)
            ->count();

        $inWorkshopAmount = (float) (clone $baseQuery)
            ->whereIn('status', $inWorkshopStatuses)
            ->sum(DB::raw('COALESCE(NULLIF(total_price, 0), initial_price, 0)'));

        $formatCurrency = function (float $amount): string {
            return number_format($amount, 0, ',', '.') . ' ₫';
        };

        $totalUncollectedAmount = $readyForPickupAmount + $inWorkshopAmount;
        $totalUncollectedAmountFormatted = $formatCurrency($totalUncollectedAmount);

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

        // 6. Tỷ lệ hoàn tất đơn hàng
        $totalOrders = (clone $baseQuery)->count();
        $completedOrders = (clone $baseQuery)->where('status', 'completed')->count();
        $completionRate = $totalOrders > 0
            ? round(($completedOrders / $totalOrders) * 100, 1)
            : 0.0;

        // 5. Phân bổ theo trạng thái
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
        ];

        $statusRawCounts = (clone $baseQuery)
            ->select('status', DB::raw('count(*) as count'))
            ->groupBy('status')
            ->pluck('count', 'status')
            ->all();

        $statusDistribution = [];
        foreach ($allStatuses as $status) {
            $statusDistribution[$status] = (int) ($statusRawCounts[$status] ?? 0);
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

        // 7. Biểu đồ doanh thu chuỗi ngày gần nhất qua SQL Aggregation trực tiếp
        $startDate = Carbon::today()->subDays($daysCount - 1)->startOfDay();
        $endDate = Carbon::today()->endOfDay();

        $dailyStats = (clone $baseQuery)
            ->where('status', 'completed')
            ->where(function ($q) use ($startDate, $endDate) {
                $q->whereBetween('handed_over_at', [$startDate, $endDate])
                  ->orWhere(function ($sq) use ($startDate, $endDate) {
                      $sq->whereNull('handed_over_at')
                         ->whereBetween('created_at', [$startDate, $endDate]);
                  });
            })
            ->selectRaw("DATE(COALESCE(handed_over_at, created_at)) as day_date, COUNT(*) as order_count, SUM(total_price) as total_revenue")
            ->groupBy('day_date')
            ->get()
            ->keyBy('day_date');

        $dayNames = [
            0 => 'CN',
            1 => 'T2',
            2 => 'T3',
            3 => 'T4',
            4 => 'T5',
            5 => 'T6',
            6 => 'T7',
        ];

        $revenueChart = [];
        for ($i = $daysCount - 1; $i >= 0; $i--) {
            $date = Carbon::today()->subDays($i);
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

        $summary = [
            'active_orders'                   => $activeOrders,
            'intake_today'                    => $intakeToday,
            'today_orders'                    => $intakeToday,
            'daily_revenue'                   => $dailyRevenue,
            'daily_revenue_formatted'         => $dailyRevenueFormatted,
            'selected_date'                   => $targetDateStr,
            'selected_date_revenue'           => $selectedDateRevenue,
            'selected_date_revenue_formatted' => $selectedDateRevenueFormatted,
            'selected_date_completed_orders'  => $selectedDateCompletedOrders,
            'monthly_revenue'                 => $monthlyRevenue,
            'monthly_revenue_formatted'       => $monthlyRevenueFormatted,
            'completion_rate'                 => $completionRate,
            'total_orders'                    => $totalOrders,
            'completed_orders'                => $completedOrders,
            'reconciliation'                  => $reconciliation,
        ];

        return $this->success([
            'summary'                         => $summary,
            'active_orders'                   => $activeOrders,
            'intake_today'                    => $intakeToday,
            'today_orders'                    => $intakeToday,
            'daily_revenue'                   => $dailyRevenue,
            'daily_revenue_formatted'         => $dailyRevenueFormatted,
            'selected_date'                   => $targetDateStr,
            'selected_date_revenue'           => $selectedDateRevenue,
            'selected_date_revenue_formatted' => $selectedDateRevenueFormatted,
            'selected_date_completed_orders'  => $selectedDateCompletedOrders,
            'monthly_revenue'                 => $monthlyRevenue,
            'monthly_revenue_formatted'       => $monthlyRevenueFormatted,
            'reconciliation'                  => $reconciliation,
            'completion_rate'                 => $completionRate,
            'status_distribution'            => $statusDistribution,
            'workload_by_status'              => $workloadByStatus,
            'revenue_chart'                   => $revenueChart,
        ], 'Lấy số liệu tổng quan KPI thành công.');
    }
}
