<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WorkShift;
use DomainException;
use Illuminate\Support\Facades\DB;

class RefundService
{
    public function __construct(
        protected OrderWorkflowService $orderWorkflowService,
        protected CashTransactionService $cashTransactionService,
        protected AuditLogService $auditLogService
    ) {}

    /**
     * Process an order payment refund with cash drawer safety and automatic inventory/warranty rollbacks.
     *
     * @param Payment $payment
     * @param User $actor
     * @param array $params ['refund_amount' => float, 'refund_method' => string, 'refund_reason' => string, 'transaction_ref' => ?string]
     * @return Payment
     * @throws DomainException
     */
    public function processRefund(Payment $payment, User $actor, array $params = []): Payment
    {
        return DB::transaction(function () use ($payment, $actor, $params) {
            // 1. Khóa dòng Payment và RepairOrder ngay đầu transaction để chống hoàn tiền kép
            $payment = Payment::with('repairOrder.customer')
                ->whereKey($payment->id)
                ->lockForUpdate()
                ->firstOrFail();

            $order = $payment->repair_order_id
                ? RepairOrder::withoutGlobalScopes()->with('customer')->whereKey($payment->repair_order_id)->lockForUpdate()->first()
                : $payment->repairOrder;

            if ($order) {
                $payment->setRelation('repairOrder', $order);
            }

            if ($payment->status === 'refunded') {
                throw new DomainException('Khoản thanh toán này đã được hoàn tiền trước đó.');
            }

            if ($payment->status !== 'paid') {
                throw new DomainException('Chỉ có thể hoàn tiền cho khoản thanh toán đã hoàn tất (paid).');
            }

            if (! $order) {
                throw new DomainException('Không tìm thấy đơn hàng tương ứng với phiếu thanh toán.');
            }

            $maxRefundable = (float) $payment->amount;
            $refundAmount = isset($params['refund_amount']) ? (float) $params['refund_amount'] : $maxRefundable;

            if ($refundAmount <= 0) {
                throw new DomainException('Số tiền hoàn trả phải lớn hơn 0.');
            }

            if ($refundAmount > $maxRefundable) {
                throw new DomainException("Số tiền hoàn trả không được vượt quá số tiền đã thanh toán ({$maxRefundable} ₫).");
            }

            $refundMethod = $params['refund_method'] ?? 'cash';
            $refundReason = $params['refund_reason'] ?? 'Hoàn tiền đơn hàng';
            $transactionRef = $params['transaction_ref'] ?? null;

            $tenantId = $order->tenant_id ?? $actor->tenant_id ?? 1;
            $branchId = $order->branch_id;

            // Kiểm tra idempotency chống tạo trùng phiếu chi hoàn tiền
            $existingRefundExpense = \App\Models\CashTransaction::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where('category', 'refund')
                ->where(function ($q) use ($payment, $order) {
                    $q->where(function ($sub) use ($payment) {
                        $sub->where('reference_type', 'Payment')
                            ->where('reference_id', $payment->id);
                    })
                    ->orWhere('notes', 'like', "%[Payment #{$payment->id}]%")
                    ->orWhere('notes', 'like', "%đơn {$order->order_code}%");
                })
                ->lockForUpdate()
                ->first();

            // 2. Bảo vệ két tiền mặt nếu hoàn tiền bằng tiền mặt
            if (! $existingRefundExpense) {
                if ($refundMethod === 'cash') {
                    /** @var WorkShift|null $activeShift */
                    $activeShift = WorkShift::withoutGlobalScopes()
                        ->where('tenant_id', $tenantId)
                        ->where('branch_id', $branchId)
                        ->where('status', 'open')
                        ->lockForUpdate()
                        ->first();

                    if (! $activeShift) {
                        throw new DomainException('Chi nhánh chưa mở ca trực. Không thể xuất tiền mặt từ két để hoàn tiền.');
                    }

                    if ((float) $activeShift->expected_cash < $refundAmount) {
                        throw new DomainException('Số dư két tiền mặt hiện tại không đủ để hoàn tiền.');
                    }

                    // Tạo phiếu chi tiền mặt loại expense danh mục refund
                    $this->cashTransactionService->createExpense(
                        $tenantId,
                        $branchId,
                        $actor->id,
                        [
                            'category'        => 'refund',
                            'reference_type'  => 'Payment',
                            'reference_id'    => $payment->id,
                            'payment_method'  => 'cash',
                            'amount'          => $refundAmount,
                            'recipient_payer' => $order->customer?->name ?? 'Khách hàng',
                            'notes'           => "Hoàn tiền mặt cho đơn {$order->order_code} [Payment #{$payment->id}]: {$refundReason}",
                        ]
                    );
                } else {
                    // Hoàn tiền qua chuyển khoản (bank_transfer)
                    // Không làm biến động két tiền mặt chi nhánh
                    $this->cashTransactionService->createExpense(
                        $tenantId,
                        $branchId,
                        $actor->id,
                        [
                            'category'        => 'refund',
                            'reference_type'  => 'Payment',
                            'reference_id'    => $payment->id,
                            'payment_method'  => 'bank_transfer',
                            'amount'          => $refundAmount,
                            'recipient_payer' => $order->customer?->name ?? 'Khách hàng',
                            'notes'           => "Hoàn tiền ngân hàng cho đơn {$order->order_code} [Payment #{$payment->id}]" . ($transactionRef ? " (Ref: {$transactionRef})" : '') . ": {$refundReason}",
                        ]
                    );
                }
            }

            // 3. Tự động hoàn kho linh kiện (import_return) idempotent
            $this->orderWorkflowService->restockInventoryForOrder($order, $actor->id, $refundReason);

            // 4. Thu hồi sổ bảo hành điện tử liên kết với đơn
            Warranty::where('repair_order_id', $order->id)
                ->where('status', '!=', 'revoked')
                ->update([
                    'status' => 'revoked',
                    'revoked_at' => now(),
                    'revoked_reason' => "Đơn hàng đã được hoàn tiền: {$refundReason}",
                ]);

            // 5. Khấu trừ doanh số tích lũy của khách hàng
            $customer = $order->customer_id
                ? Customer::withoutGlobalScopes()->whereKey($order->customer_id)->lockForUpdate()->first()
                : $order->customer;
            if ($customer) {
                $customer->total_spent = max(0, (float) $customer->total_spent - $refundAmount);
                if ($refundAmount >= (float) $order->total_price || $refundAmount >= $maxRefundable) {
                    $customer->orders_count = max(0, (int) $customer->orders_count - 1);
                }
                $customer->save();
            }

            // 6. Cập nhật phiếu thu và đơn hàng
            $oldPaymentState = [
                'status' => $payment->status,
                'refund_amount' => $payment->refund_amount ?? 0,
            ];

            $payment->update([
                'status' => 'refunded',
                'refund_amount' => $refundAmount,
                'refund_method' => $refundMethod,
                'refund_reason' => $refundReason,
                'refunded_at' => now(),
                'refunded_by_user_id' => $actor->id,
                'transaction_ref' => $transactionRef ?? $payment->transaction_ref,
            ]);

            // Chuyển trạng thái đơn sang cancelled
            $order->update(['status' => 'cancelled']);

            // 7. Ghi AuditLog
            $newPaymentState = [
                'status' => 'refunded',
                'refund_amount' => $refundAmount,
                'refund_method' => $refundMethod,
                'refund_reason' => $refundReason,
            ];

            $this->auditLogService->logFieldDiff(
                $tenantId,
                $actor,
                'Hoàn tiền đơn hàng',
                $payment,
                $oldPaymentState,
                $newPaymentState,
                "Hoàn tiền {$refundAmount} ₫ ({$refundMethod}) cho đơn {$order->order_code}. Lý do: {$refundReason}",
                [
                    'order_id' => $order->id,
                    'order_code' => $order->order_code,
                    'customer_id' => $order->customer_id,
                    'branch_id' => $branchId,
                ]
            );

            return $payment->fresh(['repairOrder', 'refundedByUser', 'receivedByUser']);
        });
    }
}
