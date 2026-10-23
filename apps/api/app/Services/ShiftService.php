<?php

namespace App\Services;

use App\Models\WorkShift;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ShiftService
{
    /**
     * Mở ca làm việc mới cho chi nhánh.
     * Chặn nếu chi nhánh đã có ca đang open.
     */
    public function openShift(
        int $tenantId,
        int $branchId,
        int $userId,
        float $openingCash,
        ?string $notes = null
    ): WorkShift {
        return DB::transaction(function () use ($tenantId, $branchId, $userId, $openingCash, $notes) {
            // Khóa dòng chi nhánh để tuần tự hóa thao tác mở ca đồng thời tại cùng chi nhánh
            \App\Models\Branch::withoutGlobalScopes()
                ->whereKey($branchId)
                ->lockForUpdate()
                ->first();

            // Kiểm tra xem chi nhánh đã có ca đang mở hay chưa
            $existingOpenShift = WorkShift::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where('branch_id', $branchId)
                ->where('status', 'open')
                ->lockForUpdate()
                ->first();

            if ($existingOpenShift) {
                throw ValidationException::withMessages([
                    'branch_id' => 'Chi nhánh hiện đang có một ca làm việc đang mở (' . $existingOpenShift->shift_code . '). Vui lòng đóng ca trước khi mở ca mới.',
                ]);
            }

            // Tự động sinh mã ca dạng SH-yymmdd-XXXX
            $shiftCode = $this->generateUniqueShiftCode($tenantId);

            return WorkShift::create([
                'tenant_id'            => $tenantId,
                'branch_id'            => $branchId,
                'shift_code'           => $shiftCode,
                'cashier_id'           => $userId,
                'opened_at'            => now(),
                'status'               => 'open',
                'opening_cash'         => $openingCash,
                'system_cash_in'       => 0,
                'system_cash_out'      => 0,
                'expected_cash'        => $openingCash,
                'actual_cash'          => null,
                'difference_amount'    => 0,
                'carried_over_cash'    => 0,
                'deposited_cash'       => 0,
                'reconciliation_notes' => $notes,
            ]);
        });
    }

    /**
     * Lấy ca đang mở của chi nhánh kèm theo chỉ số snapshot vận hành và dòng tiền.
     */
    public function getActiveShift(int $tenantId, int $branchId): ?WorkShift
    {
        /** @var WorkShift|null $shift */
        $shift = WorkShift::where('tenant_id', $tenantId)
            ->where('branch_id', $branchId)
            ->where('status', 'open')
            ->with(['cashier:id,name,role', 'branch:id,name,code'])
            ->latest('id')
            ->first();

        if (! $shift) {
            return null;
        }

        // 1. Tính tổng thanh toán VietQR / chuyển khoản trong ca
        $vietqrTotal = (float) DB::table('payments')
            ->join('repair_orders', 'payments.repair_order_id', '=', 'repair_orders.id')
            ->where('repair_orders.tenant_id', $tenantId)
            ->where('repair_orders.branch_id', $branchId)
            ->where('payments.status', 'paid')
            ->where(function ($q) {
                $q->where('payments.payment_method', 'vietqr')
                  ->orWhere('payments.payment_method', 'bank_transfer')
                  ->orWhere('payments.payment_method', 'like', '%vietqr%')
                  ->orWhere('payments.payment_method', 'transfer')
                  ->orWhere('payments.payment_method', 'banking');
            })
            ->where(function ($q) use ($shift) {
                $q->where('payments.paid_at', '>=', $shift->opened_at)
                  ->orWhere(function ($sq) use ($shift) {
                      $sq->whereNull('payments.paid_at')
                         ->where('payments.created_at', '>=', $shift->opened_at);
                  });
            })
            ->sum('payments.amount');

        // 2. Tính số lượng đơn sửa chữa hoàn tất tại chi nhánh trong ca
        $ordersCompletedCount = (int) DB::table('repair_orders')
            ->where('tenant_id', $tenantId)
            ->where('branch_id', $branchId)
            ->where('status', 'completed')
            ->where(function ($q) use ($shift) {
                $q->where('handed_over_at', '>=', $shift->opened_at)
                  ->orWhere(function ($sq) use ($shift) {
                      $sq->whereNull('handed_over_at')
                         ->where('updated_at', '>=', $shift->opened_at);
                  });
            })
            ->count();

        // 3. Tính toán và xác thực tính toàn vẹn của expected_cash (tiền mặt sổ sách lý thuyết)
        $expectedCash = round((float) $shift->opening_cash + (float) $shift->system_cash_in - (float) $shift->system_cash_out, 2);

        $shift->setAttribute('vietqr_total', $vietqrTotal);
        $shift->setAttribute('orders_completed_count', $ordersCompletedCount);
        $shift->setAttribute('expected_cash', number_format($expectedCash, 2, '.', ''));
        $shift->setAttribute('has_active_shift', true);

        return $shift;
    }

    /**
     * Tổng hợp tất cả các ca đang mở trên toàn bộ chi nhánh active của Tenant (dành cho Admin xem "Tất cả chi nhánh").
     */
    public function getAggregatedActiveShifts(int $tenantId): ?array
    {
        $openShifts = WorkShift::where('tenant_id', $tenantId)
            ->where('status', 'open')
            ->whereHas('branch', function ($q) {
                $q->where('is_active', true);
            })
            ->with(['cashier:id,name,role', 'branch:id,name,code'])
            ->orderBy('opened_at', 'asc')
            ->get();

        if ($openShifts->isEmpty()) {
            return null;
        }

        $totalOpeningCash = 0.0;
        $totalSystemCashIn = 0.0;
        $totalSystemCashOut = 0.0;
        $totalExpectedCash = 0.0;
        $totalVietqr = 0.0;
        $totalOrdersCompleted = 0;
        $branchesSummary = [];

        foreach ($openShifts as $shift) {
            $branchId = (int) $shift->branch_id;
            $opening = (float) $shift->opening_cash;
            $cashIn = (float) $shift->system_cash_in;
            $cashOut = (float) $shift->system_cash_out;
            $expected = round($opening + $cashIn - $cashOut, 2);

            $vietqrTotal = (float) DB::table('payments')
                ->join('repair_orders', 'payments.repair_order_id', '=', 'repair_orders.id')
                ->where('repair_orders.tenant_id', $tenantId)
                ->where('repair_orders.branch_id', $branchId)
                ->where('payments.status', 'paid')
                ->where(function ($q) {
                    $q->where('payments.payment_method', 'vietqr')
                      ->orWhere('payments.payment_method', 'bank_transfer')
                      ->orWhere('payments.payment_method', 'like', '%vietqr%')
                      ->orWhere('payments.payment_method', 'transfer')
                      ->orWhere('payments.payment_method', 'banking');
                })
                ->where(function ($q) use ($shift) {
                    $q->where('payments.paid_at', '>=', $shift->opened_at)
                      ->orWhere(function ($sq) use ($shift) {
                          $sq->whereNull('payments.paid_at')
                             ->where('payments.created_at', '>=', $shift->opened_at);
                      });
                })
                ->sum('payments.amount');

            $ordersCompletedCount = (int) DB::table('repair_orders')
                ->where('tenant_id', $tenantId)
                ->where('branch_id', $branchId)
                ->where('status', 'completed')
                ->where(function ($q) use ($shift) {
                    $q->where('handed_over_at', '>=', $shift->opened_at)
                      ->orWhere(function ($sq) use ($shift) {
                          $sq->whereNull('handed_over_at')
                             ->where('updated_at', '>=', $shift->opened_at);
                      });
                })
                ->count();

            $totalOpeningCash += $opening;
            $totalSystemCashIn += $cashIn;
            $totalSystemCashOut += $cashOut;
            $totalExpectedCash += $expected;
            $totalVietqr += $vietqrTotal;
            $totalOrdersCompleted += $ordersCompletedCount;

            $branchesSummary[] = [
                'id'                     => $shift->id,
                'shift_code'             => $shift->shift_code,
                'branch_id'              => $branchId,
                'branch_name'            => $shift->branch?->name ?? "Chi nhánh #{$branchId}",
                'branch_code'            => $shift->branch?->code ?? '',
                'cashier_name'           => $shift->cashier?->name ?? 'N/A',
                'opened_at'              => $shift->opened_at?->toISOString(),
                'opening_cash'           => number_format($opening, 2, '.', ''),
                'system_cash_in'         => number_format($cashIn, 2, '.', ''),
                'system_cash_out'        => number_format($cashOut, 2, '.', ''),
                'expected_cash'          => number_format($expected, 2, '.', ''),
                'vietqr_total'           => $vietqrTotal,
                'orders_completed_count' => $ordersCompletedCount,
            ];
        }

        $count = $openShifts->count();
        $firstShift = $openShifts->first();
        $cashierNames = $openShifts->map(fn ($s) => $s->cashier?->name)->filter()->unique()->values()->implode(', ');

        return [
            'id'                     => $count === 1 ? $firstShift->id : 0,
            'tenant_id'              => $tenantId,
            'branch_id'              => $count === 1 ? $firstShift->branch_id : null,
            'shift_code'             => $count === 1 ? $firstShift->shift_code : 'TỔNG HỢP (' . $count . ' CA)',
            'status'                 => 'open',
            'is_aggregated'          => true,
            'active_shifts_count'    => $count,
            'opened_at'              => $firstShift->opened_at?->toISOString(),
            'opening_cash'           => number_format($totalOpeningCash, 2, '.', ''),
            'system_cash_in'         => number_format($totalSystemCashIn, 2, '.', ''),
            'system_cash_out'        => number_format($totalSystemCashOut, 2, '.', ''),
            'expected_cash'          => number_format($totalExpectedCash, 2, '.', ''),
            'vietqr_total'           => round($totalVietqr, 2),
            'orders_completed_count' => $totalOrdersCompleted,
            'has_active_shift'       => true,
            'cashier'                => $count === 1 && $firstShift->cashier
                ? [
                    'id'   => $firstShift->cashier->id,
                    'name' => $firstShift->cashier->name,
                    'role' => $firstShift->cashier->role,
                ]
                : [
                    'id'   => 0,
                    'name' => $cashierNames ?: 'Nhiều thu ngân',
                    'role' => 'admin',
                ],
            'branch'                 => $count === 1 && $firstShift->branch
                ? [
                    'id'   => $firstShift->branch->id,
                    'name' => $firstShift->branch->name,
                    'code' => $firstShift->branch->code,
                ]
                : [
                    'id'   => 0,
                    'name' => "Tất cả chi nhánh ({$count} ca đang mở)",
                    'code' => 'ALL',
                ],
            'branches_summary'       => $branchesSummary,
        ];
    }

    /**
     * Đóng ca và đối soát két tiền mặt.
     */
    public function closeShift(
        int $shiftId,
        int $userId,
        float $actualCash,
        float $carriedOverCash = 0,
        ?string $notes = null
    ): WorkShift {
        return DB::transaction(function () use ($shiftId, $userId, $actualCash, $carriedOverCash, $notes) {
            /** @var WorkShift $shift */
            $shift = WorkShift::lockForUpdate()->findOrFail($shiftId);

            if ($shift->status === 'closed') {
                throw ValidationException::withMessages([
                    'shift' => 'Ca làm việc này đã được đóng trước đó.',
                ]);
            }

            $expectedCash = (float) $shift->opening_cash + (float) $shift->system_cash_in - (float) $shift->system_cash_out;
            $differenceAmount = $actualCash - $expectedCash;
            $depositedCash = max(0, $actualCash - $carriedOverCash);

            // Bắt buộc nhập lý do giải trình nếu phát hiện chênh lệch tiền mặt
            if (abs($differenceAmount) > 0.001 && empty(trim($notes ?? ''))) {
                throw ValidationException::withMessages([
                    'reconciliation_notes' => 'Tiền thực tế chênh lệch so với sổ sách, bắt buộc nhập ghi chú giải trình.',
                ]);
            }

            $shift->update([
                'status'               => 'closed',
                'closed_at'            => now(),
                'closed_by_user_id'    => $userId,
                'expected_cash'        => $expectedCash,
                'actual_cash'          => $actualCash,
                'difference_amount'    => $differenceAmount,
                'carried_over_cash'    => $carriedOverCash,
                'deposited_cash'       => $depositedCash,
                'reconciliation_notes' => $notes,
            ]);

            // Ghi nhận Audit Log nếu có chênh lệch két tiền mặt
            if (abs($differenceAmount) > 0.001) {
                app(\App\Services\AuditLogService::class)->logFieldDiff(
                    $shift->tenant_id,
                    \App\Models\User::find($userId),
                    'Lệch két chốt ca',
                    $shift,
                    ['expected_cash' => $expectedCash],
                    ['actual_cash' => $actualCash, 'discrepancy' => $differenceAmount],
                    "Chốt ca {$shift->id} phát hiện lệch két: Kỳ vọng " . number_format($expectedCash) . " ₫, thực tế " . number_format($actualCash) . " ₫ (chênh lệch: " . number_format($differenceAmount) . " ₫). Giải trình: {$notes}",
                    [
                        'shift_id'      => $shift->id,
                        'expected_cash' => $expectedCash,
                        'actual_cash'   => $actualCash,
                        'discrepancy'   => $differenceAmount,
                        'notes'         => $notes,
                        'branch_id'     => $shift->branch_id,
                    ]
                );
            }

            return $shift->fresh(['cashier', 'closedBy', 'branch']);
        });
    }

    /**
     * Lấy dữ liệu chi tiết ca làm việc để in phiếu chốt ca K80 / A4.
     */
    public function getShiftSummary(int $shiftId): array
    {
        $shift = WorkShift::with([
            'cashier:id,name,role,phone',
            'closedBy:id,name,role',
            'branch:id,name,code,address,phone',
            'tenant:id,name,code',
            'cashTransactions.createdByUser:id,name',
        ])->findOrFail($shiftId);

        $transactions = $shift->cashTransactions;
        $incomeTransactions = $transactions->where('type', 'income');
        $expenseTransactions = $transactions->where('type', 'expense');

        $incomeByCategory = $incomeTransactions->groupBy('category')->map(function ($items) {
            return [
                'count' => $items->count(),
                'total' => (float) $items->sum('amount'),
            ];
        });

        $expenseByCategory = $expenseTransactions->groupBy('category')->map(function ($items) {
            return [
                'count' => $items->count(),
                'total' => (float) $items->sum('amount'),
            ];
        });

        return [
            'shift' => $shift,
            'branch' => $shift->branch,
            'tenant' => $shift->tenant,
            'cashier' => $shift->cashier,
            'closed_by' => $shift->closedBy,
            'totals' => [
                'opening_cash'      => (float) $shift->opening_cash,
                'system_cash_in'    => (float) $shift->system_cash_in,
                'system_cash_out'   => (float) $shift->system_cash_out,
                'expected_cash'     => (float) $shift->expected_cash,
                'actual_cash'       => $shift->actual_cash !== null ? (float) $shift->actual_cash : null,
                'difference_amount' => (float) $shift->difference_amount,
                'carried_over_cash' => (float) $shift->carried_over_cash,
                'deposited_cash'    => (float) $shift->deposited_cash,
            ],
            'income_by_category'  => $incomeByCategory,
            'expense_by_category' => $expenseByCategory,
            'total_income_count'  => $incomeTransactions->count(),
            'total_expense_count' => $expenseTransactions->count(),
            'formatted_dates'     => [
                'opened_at' => $shift->opened_at?->format('d/m/Y H:i:s'),
                'closed_at' => $shift->closed_at?->format('d/m/Y H:i:s'),
            ],
        ];
    }

    /**
     * Sinh mã ca làm việc duy nhất trong Tenant.
     */
    protected function generateUniqueShiftCode(int $tenantId): string
    {
        $prefix = 'SH-' . date('ymd') . '-';
        do {
            $code = $prefix . strtoupper(Str::random(4));
        } while (WorkShift::withoutGlobalScopes()->where('tenant_id', $tenantId)->where('shift_code', $code)->exists());

        return $code;
    }
}
