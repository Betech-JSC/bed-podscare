<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Payment;
use App\Models\RepairOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class PaymentController extends Controller
{
    /**
     * Danh sách phiếu thu / thanh toán.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Payment::with(['repairOrder.customer', 'receivedByUser:id,name']);

        if ($orderId = $request->input('repair_order_id')) {
            $query->where('repair_order_id', $orderId);
        }

        if ($method = $request->input('payment_method')) {
            $query->where('payment_method', $method);
        }

        $payments = $query->latest('id')->paginate($request->input('per_page', 15));

        return $this->success($payments, 'Lấy danh sách phiếu thanh toán thành công.');
    }

    /**
     * Lập phiếu thu thanh toán cho đơn sửa chữa.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'repair_order_id' => 'required|exists:repair_orders,id',
            'amount'          => 'required|numeric|min:1',
            'payment_method'  => 'required|in:cash,bank_transfer,card_pos,wallet',
            'transaction_ref' => 'nullable|string|max:100',
            'notes'           => 'nullable|string',
        ]);

        return DB::transaction(function () use ($request, $validated) {
            $order = RepairOrder::findOrFail($validated['repair_order_id']);

            $year = date('y');
            $randomNum = str_pad((string) random_int(100, 99999), 4, '0', STR_PAD_LEFT);
            $paymentCode = "PC{$year}-PY-{$randomNum}";

            $payment = Payment::create([
                'payment_code'        => $paymentCode,
                'repair_order_id'     => $order->id,
                'amount'              => $validated['amount'],
                'payment_method'      => $validated['payment_method'],
                'transaction_ref'     => $validated['transaction_ref'] ?? null,
                'status'              => 'paid',
                'paid_at'             => Carbon::now(),
                'received_by_user_id' => $request->user()?->id ?? 1,
                'notes'               => $validated['notes'] ?? null,
            ]);

            AuditLog::create([
                'user_id'        => $request->user()?->id,
                'user_name'      => $request->user()?->name ?? 'Thu ngân',
                'action'         => 'Thu tiền',
                'auditable_type' => 'Payment',
                'auditable_id'   => $payment->id,
                'details'        => "Thu tiền đơn {$order->order_code}: " . number_format($validated['amount']) . " ₫ qua {$validated['payment_method']}",
                'ip_address'     => $request->ip(),
            ]);

            return $this->success($payment->load('repairOrder'), 'Lập phiếu thu thành công.', 201);
        });
    }
}
