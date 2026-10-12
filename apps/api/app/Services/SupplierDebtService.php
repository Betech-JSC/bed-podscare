<?php

namespace App\Services;

use App\Models\Supplier;
use App\Models\SupplierDebtTransaction;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SupplierDebtService
{
    public function __construct(
        protected CashTransactionService $cashTransactionService
    ) {}

    /**
     * Lấy lịch sử giao dịch biến động công nợ NCC.
     */
    public function getDebtHistory(int $tenantId, int $supplierId, array $filters = []): LengthAwarePaginator
    {
        $query = SupplierDebtTransaction::where('tenant_id', $tenantId)
            ->where('supplier_id', $supplierId)
            ->with(['goodsReceipt', 'cashTransaction', 'createdByUser', 'branch'])
            ->orderBy('id', 'desc');

        if (! empty($filters['transaction_type'])) {
            $query->where('transaction_type', $filters['transaction_type']);
        }

        $perPage = (int) ($filters['per_page'] ?? 15);
        return $query->paginate($perPage);
    }

    /**
     * Lập phiếu chi trả nợ nhà cung cấp và giảm số dư nợ.
     */
    public function repayDebt(
        int $tenantId,
        int $branchId,
        int $userId,
        int $supplierId,
        array $data
    ): SupplierDebtTransaction {
        return DB::transaction(function () use ($tenantId, $branchId, $userId, $supplierId, $data) {
            $amount = (float) ($data['amount'] ?? $data['payment_amount'] ?? 0);
            if ($amount <= 0) {
                throw new \DomainException('Số tiền trả nợ phải lớn hơn 0.');
            }

            $paymentMethod = $data['payment_method'] ?? 'cash';
            if (! in_array($paymentMethod, ['cash', 'bank_transfer'], true)) {
                throw new \DomainException('Phương thức thanh toán phải là tiền mặt (cash) hoặc chuyển khoản (bank_transfer).');
            }

            /** @var Supplier $supplier */
            $supplier = Supplier::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where('id', $supplierId)
                ->lockForUpdate()
                ->firstOrFail();

            $currentDebt = (float) $supplier->debt_balance;
            if ($amount > $currentDebt) {
                throw new \DomainException("Số tiền trả nợ ({$amount} ₫) vượt quá số dư nợ hiện tại của nhà cung cấp ({$currentDebt} ₫).");
            }

            $notes = $data['notes'] ?? null;
            $notesPrefix = $paymentMethod === 'cash' ? 'Chi tiền mặt trả nợ NCC' : 'Chuyển khoản trả nợ NCC';
            $fullNotes = "{$notesPrefix} {$supplier->name}" . ($notes ? " - {$notes}" : '');

            // Trừ két ca trực nếu trả bằng tiền mặt, hoặc ghi phiếu chi ngân hàng
            $cashTx = $this->cashTransactionService->createExpense(
                $tenantId,
                $branchId,
                $userId,
                [
                    'category'        => 'supplier_payable',
                    'payment_method'  => $paymentMethod,
                    'amount'          => $amount,
                    'recipient_payer' => $supplier->name,
                    'notes'           => $fullNotes,
                ]
            );

            // Cập nhật số dư nợ NCC
            $debtBefore = $currentDebt;
            $debtAfter = round($debtBefore - $amount, 2);

            $supplier->debt_balance = $debtAfter;
            $supplier->save();

            // Ghi nhận biến động công nợ
            $debtTx = SupplierDebtTransaction::create([
                'tenant_id'           => $tenantId,
                'branch_id'           => $branchId,
                'supplier_id'         => $supplier->id,
                'goods_receipt_id'    => null,
                'cash_transaction_id' => $cashTx->id,
                'transaction_code'    => $this->generateDebtCode($tenantId, 'PAY'),
                'transaction_type'    => 'debt_payment',
                'amount'              => $amount,
                'debt_before'         => $debtBefore,
                'debt_after'          => $debtAfter,
                'payment_method'      => $paymentMethod,
                'notes'               => $notes,
                'created_by_user_id'  => $userId,
            ]);

            app(\App\Services\AuditLogService::class)->logFieldDiff(
                $tenantId,
                \App\Models\User::find($userId),
                'Chi trả nợ NCC',
                $supplier,
                ['debt_balance' => $debtBefore],
                ['debt_balance' => $debtAfter, 'amount_paid' => $amount],
                "Thanh toán nợ cho nhà cung cấp {$supplier->name}: Chi trả " . number_format($amount) . " ₫ ({$paymentMethod}). Công nợ trước: " . number_format($debtBefore) . " ₫, sau: " . number_format($debtAfter) . " ₫",
                [
                    'supplier_id'         => $supplier->id,
                    'supplier_name'       => $supplier->name,
                    'amount_paid'         => $amount,
                    'debt_before'         => $debtBefore,
                    'debt_after'          => $debtAfter,
                    'payment_method'      => $paymentMethod,
                    'cash_transaction_id' => $cashTx->id,
                    'transaction_code'    => $debtTx->transaction_code,
                    'branch_id'           => $branchId,
                ]
            );

            return $debtTx;
        });
    }

    /**
     * Sinh mã giao dịch biến động công nợ NCC.
     */
    protected function generateDebtCode(int $tenantId, string $prefix = 'PAY'): string
    {
        $fullPrefix = $prefix . '-' . date('ymd') . '-';
        do {
            $code = $fullPrefix . strtoupper(Str::random(4));
        } while (SupplierDebtTransaction::withoutGlobalScopes()->where('tenant_id', $tenantId)->where('transaction_code', $code)->exists());

        return $code;
    }
}
