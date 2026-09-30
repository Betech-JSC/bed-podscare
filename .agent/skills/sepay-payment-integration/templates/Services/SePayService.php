<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class SePayService
{
    /**
     * Sinh mã nội dung chuyển khoản chuẩn hóa (Reference Code).
     * Ví dụ: PAY01024, ORD05912
     *
     * @param string|null $prefix Tiền tố (nếu null sẽ lấy từ config sepay.reference_prefix)
     * @param int|null $id ID đơn hàng hoặc đối tượng
     * @param int $padLength Chiều dài đệm số (mặc định 5 số)
     */
    public function generateReferenceCode(?string $prefix = null, ?int $id = null, int $padLength = 5): string
    {
        $prefix = $prefix ?: config('sepay.reference_prefix', 'PAY');
        $idPart = $id ? str_pad((string)$id, $padLength, '0', STR_PAD_LEFT) : rand(10000, 99999);

        return strtoupper($prefix . $idPart);
    }

    /**
     * Tạo URL ảnh QR VietQR động theo chuẩn img.vietqr.io.
     * Docs: https://www.vietqr.io/danh-sach-api/tao-ma-qr/
     *
     * @param int|float $amount Số tiền thanh toán (VNĐ)
     * @param string $referenceCode Nội dung chuyển khoản
     * @param string|null $bankCode Mã ngân hàng (VD: MB, ACB, VCB)
     * @param string|null $accountNumber Số tài khoản
     * @param string|null $accountName Tên chủ tài khoản
     */
    public function generateVietQRUrl(
        int|float $amount,
        string $referenceCode,
        ?string $bankCode = null,
        ?string $accountNumber = null,
        ?string $accountName = null
    ): string {
        $bankCode      = $bankCode ?: config('sepay.bank_code', 'MB');
        $accountNumber = $accountNumber ?: config('sepay.account_number');
        $accountName   = $accountName ?: config('sepay.account_holder');
        $baseUrl       = config('sepay.vietqr_base_url', 'https://img.vietqr.io/image');
        $template      = config('sepay.qr_template', 'compact');

        $params = http_build_query([
            'amount'      => (int) $amount,
            'addInfo'     => $referenceCode,
            'accountName' => $accountName,
        ]);

        return "{$baseUrl}/{$bankCode}-{$accountNumber}-{$template}.jpg?{$params}";
    }

    /**
     * Xác thực chữ ký webhook từ SePay.
     * SePay gửi token qua Header: Authorization: Apikey {secret}
     * Sử dụng hash_equals để chống tấn công Timing Attack.
     */
    public function verifyWebhookSignature(Request $request): bool
    {
        $secret = config('sepay.webhook_secret');

        // Nếu môi trường Local và chưa cấu hình secret thì cảnh báo và cho qua
        if (empty($secret)) {
            if (app()->environment('local')) {
                Log::warning('[SePay] SEPAY_WEBHOOK_SECRET chưa được cấu hình! Bỏ qua verify trên local.');
                return true;
            }
            Log::error('[SePay] SEPAY_WEBHOOK_SECRET đang trống trên production. Từ chối request.');
            return false;
        }

        $authHeader = $request->header('Authorization', '');
        $expectedHeader = "Apikey {$secret}";

        return hash_equals($expectedHeader, (string) $authHeader);
    }

    /**
     * Trích xuất mã đối soát (Reference Code) từ nội dung chuyển khoản của ngân hàng.
     *
     * @param string $content Nội dung chuyển khoản thực tế từ payload
     * @param string|null $prefix Tiền tố cần tìm kiếm
     */
    public function parseReferenceCode(string $content, ?string $prefix = null): ?string
    {
        $prefix = $prefix ?: config('sepay.reference_prefix', 'PAY');
        
        // Regex bóc tách: [PREFIX] + các ký tự số (ví dụ PAY01024)
        $pattern = '/(' . preg_quote($prefix, '/') . ')(\d+)/i';
        if (preg_match($pattern, $content, $matches)) {
            return strtoupper($matches[0]);
        }

        return null;
    }

    /**
     * Bóc tách ID thực tế từ mã đối soát (bỏ tiền tố và padding).
     */
    public function parseIdFromReferenceCode(string $referenceCode, ?string $prefix = null): ?int
    {
        $prefix = $prefix ?: config('sepay.reference_prefix', 'PAY');
        $pattern = '/^' . preg_quote($prefix, '/') . '0*(\d+)$/i';

        if (preg_match($pattern, $referenceCode, $matches)) {
            return (int) $matches[1];
        }

        return null;
    }

    /**
     * Xử lý webhook tiêu chuẩn từ SePay (Hỗ trợ Idempotency & Phân loại thanh toán).
     *
     * @param array $payload Raw JSON data nhận từ SePay
     * @param callable $orderResolver Hàm tìm kiếm đơn hàng: function(string $referenceCode, ?int $orderId)
     * @param callable $onSuccess Hàm callback khi thanh toán thành công: function($order, float $amount, array $payload)
     * @param float $minDeposit Số tiền cọc tối thiểu cho phép
     */
    public function handleWebhookTransaction(
        array $payload,
        callable $orderResolver,
        callable $onSuccess,
        float $minDeposit = 500000
    ): array {
        $sePayId        = (string) ($payload['id'] ?? '');
        $content        = $payload['content'] ?? '';
        $transferAmount = (float) ($payload['transferAmount'] ?? 0);

        Log::info('[SePay Webhook] Bắt đầu xử lý giao dịch', [
            'sepay_id' => $sePayId,
            'amount'   => $transferAmount,
            'content'  => $content,
        ]);

        // 1. Trích xuất Reference Code
        $refCode = $this->parseReferenceCode($content);
        if (!$refCode) {
            Log::warning('[SePay Webhook] Không tìm thấy mã đối soát hợp lệ trong nội dung: ' . $content);
            return [
                'success' => false,
                'status'  => 'UNMATCHED_CODE',
                'message' => 'Không tìm thấy mã đối soát trong nội dung chuyển khoản.',
            ];
        }

        $orderId = $this->parseIdFromReferenceCode($refCode);

        // 2. Tìm đơn hàng tương ứng
        $order = $orderResolver($refCode, $orderId);
        if (!$order) {
            Log::warning("[SePay Webhook] Không tìm thấy đơn hàng cho mã: {$refCode} (ID: {$orderId})");
            return [
                'success' => false,
                'status'  => 'ORDER_NOT_FOUND',
                'message' => "Không tìm thấy đơn hàng tương ứng với mã {$refCode}.",
            ];
        }

        // 3. Kiểm tra Idempotency (Tránh xử lý lặp lại nếu SePay retry)
        $processedIds = $order->sepay_transaction_ids ?? ($order->data['sepay_transaction_ids'] ?? []);
        if ($sePayId && in_array($sePayId, (array) $processedIds)) {
            Log::info("[SePay Webhook] Giao dịch #{$sePayId} đã được xử lý trước đó (Idempotent bypass).");
            return [
                'success'         => true,
                'status'          => 'ALREADY_PROCESSED',
                'message'         => 'Giao dịch đã được đối soát thành công trước đó.',
                'order'           => $order,
                'transfer_amount' => $transferAmount,
            ];
        }

        // 4. Kiểm tra số tiền chuyển
        if ($transferAmount <= 0) {
            return [
                'success' => false,
                'status'  => 'INVALID_AMOUNT',
                'message' => 'Số tiền chuyển khoản không hợp lệ.',
                'order'   => $order,
            ];
        }

        $requiredAmount = (float) ($order->final_price ?? ($order->total_amount ?? ($order->data['price'] ?? 0)));

        // 5. Phân loại trạng thái thanh toán
        if ($transferAmount >= $requiredAmount) {
            $paymentStatus = 'PAID_FULL';
            $paidAmount    = $requiredAmount;
            $debtAmount    = 0;
        } elseif ($transferAmount >= $minDeposit) {
            $paymentStatus = 'DEPOSITED';
            $paidAmount    = $transferAmount;
            $debtAmount    = max(0, $requiredAmount - $transferAmount);
        } else {
            // Thiếu tiền dưới mức tối thiểu
            Log::warning("[SePay Webhook] Đơn #{$orderId} chuyển thiếu tiền ({$transferAmount} / {$requiredAmount})");
            return [
                'success'         => false,
                'status'          => 'UNDERPAID',
                'message'         => 'Số tiền chuyển nhỏ hơn mức tối thiểu cho phép. Cần kiểm tra thủ công.',
                'order'           => $order,
                'transfer_amount' => $transferAmount,
                'required_amount' => $requiredAmount,
            ];
        }

        // 6. Thực thi callback nghiệp vụ an toàn trong Transaction
        DB::transaction(function () use ($order, $transferAmount, $paymentStatus, $paidAmount, $debtAmount, $sePayId, $payload, $onSuccess) {
            $onSuccess($order, [
                'status'               => $paymentStatus,
                'paid_amount'          => $paidAmount,
                'debt_amount'          => $debtAmount,
                'transfer_amount'      => $transferAmount,
                'sepay_transaction_id' => $sePayId,
                'raw_payload'          => $payload,
            ]);
        });

        return [
            'success'         => true,
            'status'          => $paymentStatus,
            'message'         => 'Xử lý thanh toán SePay thành công!',
            'order'           => $order,
            'paid_amount'     => $paidAmount,
            'debt_amount'     => $debtAmount,
            'transfer_amount' => $transferAmount,
        ];
    }
}
