<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Services\SePayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;

class SePayPaymentController extends Controller
{
    public function __construct(
        protected SePayService $sePayService
    ) {}

    /**
     * POST /payment/sepay/create
     * Khởi tạo mã chuyển khoản VietQR cho đơn hàng.
     */
    public function createPayment(Request $request): JsonResponse
    {
        $request->validate([
            'order_id' => 'required|integer|exists:orders,id',
        ]);

        $order = Order::findOrFail($request->order_id);
        
        // Sinh mã đối soát duy nhất (nếu đơn chưa có)
        $referenceCode = $order->reference_code ?: $this->sePayService->generateReferenceCode('PAY', $order->id);
        $amount = (float) ($order->final_price ?? $order->total_amount);

        // Sinh link ảnh VietQR
        $qrUrl = $this->sePayService->generateVietQRUrl($amount, $referenceCode);
        $expiresAt = now()->addMinutes((int) config('sepay.qr_expires_minutes', 15));

        // Lưu thông tin thanh toán vào đơn hàng
        $order->update([
            'reference_code' => $referenceCode,
            'qr_url'         => $qrUrl,
            'payment_status' => 'PENDING',
        ]);

        return response()->json([
            'success'        => true,
            'order_id'       => $order->id,
            'reference_code' => $referenceCode,
            'qr_url'         => $qrUrl,
            'amount'         => $amount,
            'expires_at'     => $expiresAt->toIso8601String(),
            'bank_info'      => [
                'bank_code'      => config('sepay.bank_code'),
                'account_number' => config('sepay.account_number'),
                'account_holder' => config('sepay.account_holder'),
            ],
        ]);
    }

    /**
     * GET /payment/sepay/check/{referenceCode}
     * API Polling để Frontend kiểm tra trạng thái thanh toán (gọi mỗi 2-3 giây).
     */
    public function checkStatus(string $referenceCode): JsonResponse
    {
        $order = Order::where('reference_code', strtoupper($referenceCode))->first();

        if (!$order) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy đơn hàng'], 404);
        }

        $isPaid = in_array($order->payment_status, ['PAID', 'PAID_FULL', 'DEPOSITED']);

        return response()->json([
            'success'        => true,
            'order_id'       => $order->id,
            'status'         => $order->status,
            'payment_status' => $order->payment_status,
            'paid_amount'    => (float) ($order->paid_amount ?? 0),
            'debt_amount'    => (float) ($order->debt_amount ?? 0),
            'is_paid'        => $isPaid,
        ]);
    }

    /**
     * POST /payment/sepay/cancel/{referenceCode}
     * Hủy giao dịch thanh toán pending.
     */
    public function cancelPayment(string $referenceCode): JsonResponse
    {
        $order = Order::where('reference_code', strtoupper($referenceCode))
            ->where('payment_status', 'PENDING')
            ->firstOrFail();

        $order->update(['payment_status' => 'CANCELLED']);

        return response()->json([
            'success' => true,
            'message' => 'Đã hủy phiên thanh toán.',
        ]);
    }

    /**
     * POST /payment/sepay/simulate/{referenceCode}
     * [DEV ONLY] Giả lập thanh toán thành công khi phát triển local.
     */
    public function simulatePayment(string $referenceCode): JsonResponse
    {
        if (!app()->environment('local')) {
            abort(404);
        }

        $order = Order::where('reference_code', strtoupper($referenceCode))->firstOrFail();
        $amount = (float) ($order->final_price ?? $order->total_amount);

        $fakePayload = [
            'id'             => 'SIM_' . time(),
            'gateway'        => config('sepay.bank_code', 'MB'),
            'transactionDate'=> now()->format('Y-m-d H:i:s'),
            'accountNumber'  => config('sepay.account_number'),
            'transferType'   => 'in',
            'transferAmount' => $amount,
            'content'        => "{$referenceCode} Dev Simulation",
            'referenceCode'  => $referenceCode,
        ];

        $order->update([
            'payment_status'       => 'PAID_FULL',
            'paid_amount'          => $amount,
            'debt_amount'          => 0,
            'sepay_transaction_id' => $fakePayload['id'],
            'status'               => 'confirmed',
        ]);

        return response()->json([
            'success' => true,
            'message' => '✅ Giả lập thanh toán SePay thành công!',
            'order'   => $order->fresh(),
        ]);
    }
}
