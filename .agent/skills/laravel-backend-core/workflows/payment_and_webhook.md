# Quy trình Tích hợp Webhook & Xử lý Thanh toán An toàn (Payment & Webhooks)

Hướng dẫn tích hợp Webhook thanh toán (SePay, VietQR, Momo, VNPay, Stripe) đảm bảo các nguyên tắc an ninh, chống tấn công Replay Attack, ngăn chặn chi trả trùng lặp (Double Spending) và tối ưu thời gian phản hồi.

---

## 🛡️ 1. Ba Nguyên tắc Bất di Bất dịch khi Nhận Webhook

1. **Bảo mật Xác thực (Authentication / Signature Verification)**:
   - Luôn kiểm tra `API-Key`, `Authorization: Bearer <token>`, hoặc chữ ký số `HMAC-SHA256` đính kèm trong request header.
   - Nếu chữ ký không khớp ➔ Trả về `401 Unauthorized` ngay lập tức, không parse payload.
2. **Nguyên lý Idempotency (Chống Replay & Trùng lặp)**:
   - Các cổng thanh toán thường gửi lại webhook 3 - 5 lần nếu server phản hồi chậm.
   - Bắt buộc kiểm tra mã giao dịch (`transaction_id` hoặc `reference_number`) xem đã xử lý thành công chưa trước khi cộng tiền.
3. **Phản hồi Nhanh (Fast Response < 2s)**:
   - Cổng thanh toán thường đặt timeout 5 giây. Nếu webhook controller làm tác vụ nặng (gửi email, gọi API hóa đơn điện tử), cổng thanh toán sẽ coi là lỗi và retry liên tục.
   - **Quy tắc**: Chỉ cập nhật DB trong Transaction ngắn, đẩy toàn bộ việc gửi mail/thông báo vào Queue Job, và lập tức trả về `200 OK`.

---

## 🔄 2. Luồng Xử lý 5 Bước Chuẩn

### Bước 1: Khai báo Tuyến đường Webhook (Bỏ qua CSRF Token)
Webhook được gọi từ server bên thứ ba nên không có session cookie hay CSRF token.
Trong `routes/api.php`:
```php
use App\Http\Controllers\Api\PaymentWebhookController;
use Illuminate\Support\Facades\Route;

Route::post('/webhook/payment/{gateway}', [PaymentWebhookController::class, 'handle'])
    ->name('api.webhook.payment');
```
*(Nếu đặt trong `routes/web.php`, bắt buộc phải thêm URL này vào mảng `$except` của `VerifyCsrfToken` middleware).*

---

### Bước 2: Xác thực Header & Chữ ký
Trong Controller hoặc Middleware chuyên biệt:
```php
public function handle(Request $request, string $gateway, PaymentWebhookService $service)
{
    // 1. Xác thực API Key từ Gateway (ví dụ SePay)
    $authHeader = $request->header('Authorization');
    $expectedApiKey = config("services.{$gateway}.api_key");

    if (!$this->isValidSignature($authHeader, $expectedApiKey)) {
        Log::warning("[Webhook:{$gateway}] Truy cập trái phép", ['ip' => $request->ip()]);
        return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
    }

    // 2. Chuyển tiếp cho Service xử lý
    try {
        $result = $service->process($gateway, $request->all());
        return response()->json(['success' => true, 'data' => $result], 200);
    } catch (\Exception $e) {
        Log::error("[Webhook:{$gateway}] Lỗi xử lý: " . $e->getMessage());
        return response()->json(['success' => false, 'message' => $e->getMessage()], 400);
    }
}
```

---

### Bước 3: Kiểm tra Idempotency & Pessimistic Lock
Trong `PaymentWebhookService.php`:
```php
public function process(string $gateway, array $payload): array
{
    $transactionId = $payload['id'] ?? $payload['transaction_id'] ?? null;
    $orderCode     = $payload['code'] ?? $payload['order_code'] ?? null;
    $amountIn      = (float) ($payload['transferAmount'] ?? $payload['amount'] ?? 0);

    if (!$transactionId || !$orderCode) {
        throw new \InvalidArgumentException('Dữ liệu webhook thiếu thông tin giao dịch');
    }

    return DB::transaction(function () use ($gateway, $transactionId, $orderCode, $amountIn, $payload) {
        // 1. Kiểm tra Idempotency: Giao dịch này đã từng lưu chưa?
        $existing = PaymentTransaction::where('gateway', $gateway)
            ->where('transaction_id', $transactionId)
            ->first();

        if ($existing) {
            // Đã xử lý rồi -> Trả 200 ngay để cổng dừng retry
            return [
                'status'  => 'duplicate',
                'message' => 'Giao dịch đã được xử lý trước đó',
                'id'      => $existing->id
            ];
        }

        // 2. Tìm đơn hàng và khóa dòng (Pessimistic Lock)
        $order = Order::where('order_code', $orderCode)
            ->lockForUpdate()
            ->first();

        if (!$order) {
            // Ghi log giao dịch mồ côi (không tìm thấy đơn) để kế toán đối soát thủ công
            PaymentTransaction::create([
                'gateway'        => $gateway,
                'transaction_id' => $transactionId,
                'amount'         => $amountIn,
                'status'         => 'ORPHAN',
                'payload'        => $payload,
            ]);
            return ['status' => 'orphan_recorded', 'message' => 'Không tìm thấy đơn hàng tương ứng'];
        }

        // 3. Kiểm tra số tiền chuyển có khớp với đơn hàng không
        if ($amountIn < $order->total_amount) {
            // Chuyển thiếu tiền -> Lưu vết trạng thái PARTIAL
            $transaction = PaymentTransaction::create([
                'gateway'        => $gateway,
                'transaction_id' => $transactionId,
                'order_id'       => $order->id,
                'amount'         => $amountIn,
                'status'         => 'UNDERPAID',
                'payload'        => $payload,
            ]);
            return ['status' => 'underpaid', 'message' => 'Số tiền thanh toán chưa đủ'];
        }

        // 4. Ghi nhận giao dịch thành công
        $transaction = PaymentTransaction::create([
            'gateway'        => $gateway,
            'transaction_id' => $transactionId,
            'order_id'       => $order->id,
            'amount'         => $amountIn,
            'status'         => 'SUCCESS',
            'payload'        => $payload,
        ]);

        // 5. Cập nhật trạng thái đơn hàng
        $order->update([
            'payment_status' => 'PAID',
            'status'         => Order::STATUS_CONFIRMED,
            'paid_at'        => now(),
        ]);

        // 6. Đẩy tác vụ phụ sang Queue Job (ngoài transaction)
        dispatch(new SendPaymentReceiptEmailJob($order->id));
        dispatch(new NotifyAdminPaymentReceivedJob($order->id, $amountIn));

        return [
            'status'  => 'success',
            'message' => 'Thanh toán thành công',
            'order_id' => $order->id
        ];
    });
}
```

---

## 📋 3. Bảng Kiểm tra An toàn Webhook (Security Checklist)

- [ ] Route webhook đã bỏ qua CSRF verify.
- [ ] Header xác thực (API Key/Token/HMAC) được kiểm tra trước khi đọc body.
- [ ] Bảng `payment_transactions` có ràng buộc `UNIQUE(['gateway', 'transaction_id'])`.
- [ ] Bọc logic trong `DB::transaction()` và dùng `$order->lockForUpdate()`.
- [ ] Giao dịch trùng lặp trả về HTTP 200 kèm flag `duplicate` để webhook provider không spam lại.
- [ ] Toàn bộ email/sms/notification được dispatch sang Queue (không chạy đồng bộ).
