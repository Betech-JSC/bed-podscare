<?php

namespace App\Http\Controllers\Api;

use App\Models\Order; // Thay thế bằng Model đơn hàng thực tế của dự án bạn
use App\Services\SePayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Log;

class SePayWebhookController extends Controller
{
    public function __construct(
        protected SePayService $sePayService
    ) {}

    /**
     * POST /api/sepay/webhook
     * Endpoint công khai nhận thông báo thanh toán tự động từ SePay.
     */
    public function handle(Request $request): JsonResponse
    {
        // 1. Kiểm tra xác thực (Authorization: Apikey {secret})
        if (!$this->sePayService->verifyWebhookSignature($request)) {
            Log::warning('[SePay Webhook] Truy cập trái phép (Invalid API Key)', [
                'ip'      => $request->ip(),
                'headers' => $request->header('Authorization'),
            ]);
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $payload = $request->all();
        Log::info('[SePay Webhook] Nhận dữ liệu webhook', $payload);

        try {
            // 2. Định nghĩa hàm tìm đơn hàng theo mã đối soát
            $orderResolver = function (string $referenceCode, ?int $orderId) {
                // Ưu tiên tìm theo reference_code đã lưu, hoặc theo ID đơn
                return Order::where('reference_code', $referenceCode)
                    ->when($orderId, fn($q) => $q->orWhere('id', $orderId))
                    ->latest()
                    ->first();
            };

            // 3. Định nghĩa hàm cập nhật nghiệp vụ khi thanh toán hợp lệ
            $onSuccess = function ($order, array $data) {
                // Cập nhật trạng thái thanh toán đơn hàng
                $order->update([
                    'payment_status'       => $data['status'], // PAID_FULL, DEPOSITED
                    'paid_amount'          => $data['paid_amount'],
                    'debt_amount'          => $data['debt_amount'],
                    'sepay_transaction_id' => $data['sepay_transaction_id'],
                    'status'               => ($data['status'] === 'PAID_FULL') ? 'confirmed' : $order->status,
                ]);

                // Kích hoạt Event hoặc gửi Email thông báo nếu cần
                // event(new \App\Events\OrderPaymentSucceeded($order));
            };

            // 4. Xử lý webhook qua SePayService
            $result = $this->sePayService->handleWebhookTransaction(
                $payload,
                $orderResolver,
                $onSuccess,
                minDeposit: 500000 // Mức cọc tối thiểu (nếu áp dụng)
            );

            // 5. Trả về HTTP 200 OK cho SePay
            return response()->json([
                'success' => $result['success'],
                'status'  => $result['status'] ?? 'PROCESSED',
                'message' => $result['message'] ?? 'Webhook processed',
                'data'    => [
                    'order_id'       => $result['order']?->id ?? null,
                    'paid_amount'    => $result['paid_amount'] ?? 0,
                    'debt_amount'    => $result['debt_amount'] ?? 0,
                ],
            ], 200);

        } catch (\Throwable $e) {
            Log::error('[SePay Webhook] Lỗi ngoại lệ trong quá trình xử lý: ' . $e->getMessage(), [
                'trace'   => $e->getTraceAsString(),
                'payload' => $payload,
            ]);

            // Trả về 500 để SePay kích hoạt cơ chế retry nếu là lỗi máy chủ tạm thời
            return response()->json([
                'success' => false,
                'message' => 'Lỗi máy chủ nội bộ',
            ], 500);
        }
    }
}
