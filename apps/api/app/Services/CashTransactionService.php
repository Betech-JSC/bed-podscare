<?php

namespace App\Services;

use App\Models\CashTransaction;
use App\Models\WorkShift;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CashTransactionService
{
    /**
     * Tạo phiếu chi tiền mặt (Expense).
     * Tự động gắn với ca đang mở của chi nhánh (nếu có) và cộng dồn system_cash_out.
     */
    public function createExpense(
        int $tenantId,
        int $branchId,
        int $userId,
        array $data
    ): CashTransaction {
        return DB::transaction(function () use ($tenantId, $branchId, $userId, $data) {
            $amount = (float) $data['amount'];

            // Tìm ca đang mở của chi nhánh để liên kết
            /** @var WorkShift|null $activeShift */
            $activeShift = WorkShift::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where('branch_id', $branchId)
                ->where('status', 'open')
                ->lockForUpdate()
                ->first();

            $paymentMethod = $data['payment_method'] ?? 'cash';

            if ($paymentMethod === 'cash') {
                if (! $activeShift) {
                    throw new \DomainException('Chi nhánh chưa mở ca trực. Không thể xuất tiền mặt từ két.');
                }

                $currentExpectedCash = (float) $activeShift->expected_cash;
                if ($currentExpectedCash < $amount) {
                    throw new \DomainException("Số dư két tiền mặt hiện tại không đủ ({$currentExpectedCash} ₫ < {$amount} ₫).");
                }

                $activeShift->system_cash_out = (float) $activeShift->system_cash_out + $amount;
                $activeShift->expected_cash = (float) $activeShift->opening_cash + (float) $activeShift->system_cash_in - (float) $activeShift->system_cash_out;
                $activeShift->save();
            }

            $transactionCode = $this->generateUniqueCode($tenantId, 'EXP');

            return CashTransaction::create([
                'tenant_id'          => $tenantId,
                'branch_id'          => $branchId,
                'shift_id'           => $activeShift?->id,
                'transaction_code'   => $transactionCode,
                'type'               => 'expense',
                'category'           => $data['category'],
                'payment_method'     => $paymentMethod,
                'amount'             => $amount,
                'recipient_payer'    => $data['recipient_payer'] ?? null,
                'notes'              => $data['notes'] ?? null,
                'created_by_user_id' => $userId,
            ]);
        });
    }

    /**
     * Tạo phiếu thu tiền mặt (Income).
     * Tự động gắn với ca đang mở của chi nhánh (nếu có) và cộng dồn system_cash_in.
     */
    public function createIncome(
        int $tenantId,
        int $branchId,
        int $userId,
        array $data
    ): CashTransaction {
        return DB::transaction(function () use ($tenantId, $branchId, $userId, $data) {
            $amount = (float) $data['amount'];
            $paymentMethod = $data['payment_method'] ?? 'cash';

            /** @var WorkShift|null $activeShift */
            $activeShift = WorkShift::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where('branch_id', $branchId)
                ->where('status', 'open')
                ->lockForUpdate()
                ->first();

            if ($activeShift && $paymentMethod === 'cash') {
                $activeShift->system_cash_in = (float) $activeShift->system_cash_in + $amount;
                $activeShift->expected_cash = (float) $activeShift->opening_cash + (float) $activeShift->system_cash_in - (float) $activeShift->system_cash_out;
                $activeShift->save();
            }

            $transactionCode = $this->generateUniqueCode($tenantId, 'INC');

            return CashTransaction::create([
                'tenant_id'          => $tenantId,
                'branch_id'          => $branchId,
                'shift_id'           => $activeShift?->id,
                'transaction_code'   => $transactionCode,
                'type'               => 'income',
                'category'           => $data['category'],
                'payment_method'     => $paymentMethod,
                'amount'             => $amount,
                'recipient_payer'    => $data['recipient_payer'] ?? null,
                'notes'              => $data['notes'] ?? null,
                'created_by_user_id' => $userId,
            ]);
        });
    }

    /**
     * Tự động đồng bộ tiền mặt thu từ đơn sửa chữa vào sổ quỹ và két ca trực.
     * Đảm bảo tính lũy thừa (idempotency) - không tạo trùng lặp nếu payment đã được ghi nhận.
     */
    public function recordRepairOrderCashPayment(
        int $tenantId,
        int $branchId,
        int $userId,
        \App\Models\Payment $payment,
        \App\Models\RepairOrder $order
    ): ?CashTransaction {
        if ($payment->payment_method !== 'cash') {
            return null;
        }

        // Idempotency: Kiểm tra nếu phiếu thanh toán này đã từng được đồng bộ vào sổ quỹ
        $existing = CashTransaction::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('category', 'repair_order_cash')
            ->where('notes', 'like', "%[Payment #{$payment->id}]%")
            ->first();

        if ($existing) {
            return $existing;
        }

        $notes = "Thu tiền mặt đơn {$order->order_code} [Payment #{$payment->id}]" . ($payment->notes ? " - {$payment->notes}" : '');

        return $this->createIncome($tenantId, $branchId, $userId, [
            'category'        => 'repair_order_cash',
            'payment_method'  => 'cash',
            'amount'          => (float) $payment->amount,
            'recipient_payer' => $order->customer?->name ?? "Khách hàng {$order->order_code}",
            'notes'           => $notes,
        ]);
    }

    /**
     * Lấy danh mục thu chi chuẩn.
     */
    public function getCategories(): array
    {
        return [
            'expense' => [
                ['key' => 'purchasing_parts', 'label' => 'Mua linh kiện ngoài'],
                ['key' => 'supplier_payable', 'label' => 'Chi trả nợ nhà cung cấp'],
                ['key' => 'shipping_cod',     'label' => 'Cước giao nhận COD'],
                ['key' => 'store_operations', 'label' => 'Vận hành cửa hàng (Điện, nước, VPP)'],
                ['key' => 'refund',           'label' => 'Hoàn tiền cho khách'],
                ['key' => 'other_expense',    'label' => 'Chi phí khác'],
            ],
            'income' => [
                ['key' => 'opening_float',     'label' => 'Tiền nạp quỹ / Bổ sung đầu ca'],
                ['key' => 'repair_order_cash', 'label' => 'Thu tiền mặt đơn sửa chữa'],
                ['key' => 'other_income',      'label' => 'Khoản thu khác'],
            ],
        ];
    }

    /**
     * Lấy thông tin số dư quỹ chi nhánh hiện tại.
     */
    public function getBranchBalance(int $tenantId, int $branchId): array
    {
        $activeShift = WorkShift::where('tenant_id', $tenantId)
            ->where('branch_id', $branchId)
            ->where('status', 'open')
            ->first();

        return [
            'has_active_shift'     => (bool) $activeShift,
            'active_shift_code'    => $activeShift?->shift_code,
            'current_cash_balance' => $activeShift ? (float) $activeShift->expected_cash : 0,
            'opening_cash'         => $activeShift ? (float) $activeShift->opening_cash : 0,
            'system_cash_in'       => $activeShift ? (float) $activeShift->system_cash_in : 0,
            'system_cash_out'      => $activeShift ? (float) $activeShift->system_cash_out : 0,
        ];
    }

    /**
     * Sinh mã giao dịch duy nhất trong Tenant.
     */
    protected function generateUniqueCode(int $tenantId, string $prefix): string
    {
        $fullPrefix = $prefix . '-' . date('ymd') . '-';
        do {
            $code = $fullPrefix . strtoupper(Str::random(4));
        } while (CashTransaction::withoutGlobalScopes()->where('tenant_id', $tenantId)->where('transaction_code', $code)->exists());

        return $code;
    }
}
