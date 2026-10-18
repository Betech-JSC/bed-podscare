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
    public function name(): string
    {
        return 'get_revenue_summary';
    }

    public function description(): string
    {
        return 'Thống kê báo cáo doanh thu, số lượng đơn sửa chữa (đơn mới, đơn hoàn thành, phân loại tại quầy/COD/bảo hành), thực thu thanh toán và thu chi sổ quỹ của cửa hàng theo khoảng thời gian (today, yesterday, this_week, this_month, hoặc từ ngày date_from đến date_to) và chi nhánh (branch_name).';
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
                    'description' => 'Ngày bắt đầu (định dạng YYYY-MM-DD hoặc DD/MM/YYYY) nếu tra cứu theo ngày cụ thể.',
                ],
                'date_to' => [
                    'type'        => 'STRING',
                    'description' => 'Ngày kết thúc (định dạng YYYY-MM-DD hoặc DD/MM/YYYY) nếu tra cứu theo ngày cụ thể.',
                ],
                'branch_name' => [
                    'type'        => 'STRING',
                    'description' => 'Tên hoặc mã chi nhánh cần xem báo cáo (ví dụ: Quận 1). Để trống nếu xem toàn bộ chi nhánh được phân quyền.',
                ],
            ],
        ];
    }

    public function execute(array $args, TelegramRecipient $recipient): array
    {
        // Bước 1: Tự kiểm tra & chuẩn hóa khoảng thời gian và chi nhánh (Sanitize & Normalize)
        $tenantId = (int) $recipient->tenant_id;

        $rawDateFrom = trim((string) ($args['date_from'] ?? ''));
        $rawDateTo = trim((string) ($args['date_to'] ?? ''));
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
            $rawPeriod = strtolower(trim((string) ($args['period'] ?? 'today')));

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
        $branchNameArg = trim((string) ($args['branch_name'] ?? ''));

        if ($recipient->branch_id !== null) {
            $branchId = (int) $recipient->branch_id;
            $lockedBranch = Branch::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where('id', $branchId)
                ->first();
            $branchLabel = $lockedBranch ? (string) $lockedBranch->name : "Chi nhánh #{$branchId}";
        } elseif ($branchNameArg !== '') {
            $matchedBranch = Branch::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where(function ($q) use ($branchNameArg) {
                    $q->where('name', 'like', "%{$branchNameArg}%")
                        ->orWhere('code', 'like', "%{$branchNameArg}%");
                })
                ->first();

            if ($matchedBranch !== null) {
                $branchId = (int) $matchedBranch->id;
                $branchLabel = (string) $matchedBranch->name;
            }
        }

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
            ->whereIn('status', ['completed', 'delivered', 'handed_over', 'ready_for_pickup', 'qc_passed'])
            ->count();
        $estimatedOrderRevenue = (float) (clone $orderBaseQuery)->sum('total_price');

        // 2. Thực thu Thanh toán Đơn hàng (Payment)
        $paymentQuery = Payment::withoutGlobalScopes()
            ->whereIn('status', ['completed', 'paid', 'success'])
            ->whereHas('repairOrder', function ($q) use ($tenantId, $branchId) {
                $q->withoutGlobalScopes()->where('tenant_id', $tenantId);
                if ($branchId !== null) {
                    $q->where('branch_id', $branchId);
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

        return [
            'period'                            => $period,
            'period_label'                      => $periodLabel,
            'date_from'                         => $startDate->format('Y-m-d'),
            'date_to'                           => $endDate->format('Y-m-d'),
            'branch_id'                         => $branchId,
            'branch_name'                       => $branchLabel,
            'branch_scope'                      => $branchLabel,
            'total_new_orders'                  => $totalNewOrders,
            'in_store_orders'                   => $inStoreOrders,
            'cod_orders'                        => $codOrders,
            'warranty_orders'                   => $warrantyOrders,
            'completed_orders'                  => $completedOrders,
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
        ];
    }

    /**
     * Parse ngày an toàn từ chuỗi YYYY-MM-DD hoặc DD/MM/YYYY.
     */
    protected function parseDate(string $value): ?Carbon
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        try {
            if (preg_match('/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/', $value, $matches)) {
                return Carbon::createFromDate((int) $matches[3], (int) $matches[2], (int) $matches[1]);
            }

            if (preg_match('/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/', $value, $matches)) {
                return Carbon::createFromDate((int) $matches[1], (int) $matches[2], (int) $matches[3]);
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
     * Kết xuất trực tiếp báo cáo doanh thu & thu chi sổ quỹ sang văn bản HTML tiếng Việt chuẩn gửi về Telegram.
     */
    public function formatHtml(array $result): string
    {
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
        $formattedEstimated = htmlspecialchars((string) ($result['formatted_estimated_order_revenue'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $formattedPayment = htmlspecialchars((string) ($result['formatted_net_payment_collected'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $formattedIncome = htmlspecialchars((string) ($result['formatted_cashbook_income'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $formattedExpense = htmlspecialchars((string) ($result['formatted_cashbook_expense'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $formattedNetCashflow = htmlspecialchars((string) ($result['formatted_net_cashflow'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        return implode("\n", [
            "<b>Báo cáo doanh thu - {$periodLabel}</b>",
            "Chi nhánh: <b>{$branchScope}</b>",
            "- Tổng số đơn mới: <b>{$totalNew}</b> đơn (Tại cửa hàng: {$inStore}, COD: {$cod}, Bảo hành: {$warranty})",
            "- Số đơn đã hoàn thành/bàn giao: <b>{$completed}</b> đơn",
            "- Doanh thu ước tính từ đơn hàng: <b>{$formattedEstimated}</b>",
            "- Thực thu thanh toán: <b>{$formattedPayment}</b>",
            "- Thu sổ quỹ: <b>{$formattedIncome}</b> | Chi sổ quỹ: <b>{$formattedExpense}</b>",
            "- Dòng tiền ròng sổ quỹ: <b>{$formattedNetCashflow}</b>",
        ]);
    }
}

