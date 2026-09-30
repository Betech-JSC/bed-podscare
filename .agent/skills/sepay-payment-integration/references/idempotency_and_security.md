# Cơ chế Chống Trùng Lặp (Idempotency) & Bảo Mật Thanh Toán SePay

Tài liệu hướng dẫn chuyên sâu về các giải pháp kỹ thuật nhằm đảm bảo an toàn tuyệt đối, chống double-spending, xử lý tranh chấp (concurrency/race conditions) và các kịch bản ngoại lệ khi tích hợp SePay.

---

## 1. Bản chất phân phối Webhook: At-Least-Once Delivery

Trong các hệ thống phân tán và thanh toán tài chính (bao gồm SePay), webhook được phân phối theo cơ chế **At-Least-Once Delivery** (Ít nhất một lần):
- Khi đường truyền mạng bị trễ hoặc server của bạn phản hồi quá 3-5 giây, SePay sẽ coi đó là timeout và **gửi lại webhook lần 2, lần 3**.
- Thậm chí, trong một số trường hợp giao dịch ngân hàng phát sinh biến động 2 lần (ví dụ: giao dịch điều chỉnh, hoàn phí), webhook có thể bắn lặp lại.
- **Hệ quả nếu không có Idempotency**:
  - Người dùng nạp 100k nhưng được cộng 200k, 300k.
  - Sĩ số lớp học hoặc số lượng tồn kho bị cộng dồn hoặc trừ lặp lại nhiều lần.
  - Sinh ra nhiều hóa đơn/phiếu xác nhận trùng lặp cho cùng một đơn hàng.

---

## 2. Giải pháp Chống Trùng Lặp (Idempotency Patterns)

Có 2 mô hình thiết kế chống trùng lặp đã được kiểm chứng trong thực tế:

### Mô hình 1: Bảng Giao Dịch Độc Lập (`transactions` table) - Khuyến nghị cho Ví điện tử / Nạp điểm
- Mỗi biến động số dư hoặc giao dịch nạp tiền đều ánh xạ vào 1 bản ghi trong bảng `point_transactions` hoặc `payment_transactions`.
- Bảng này có cột:
  ```sql
  sepay_transaction_id VARCHAR(100) UNIQUE NULL
  ```
- **Quy trình xử lý**:
  ```php
  $sePayTransactionId = (string) ($payload['id'] ?? '');

  if ($sePayTransactionId) {
      $exists = PointTransaction::where('sepay_transaction_id', $sePayTransactionId)->exists();
      if ($exists) {
          Log::info("[SePay] Giao dịch {$sePayTransactionId} đã được xử lý trước đó (Bỏ qua).");
          return response()->json(['success' => true, 'message' => 'Transaction already processed']);
      }
  }
  ```

### Mô hình 2: Mảng Transaction IDs trên Order Model - Phù hợp cho Đơn hàng Khóa học / Thương mại điện tử
- Nếu đơn hàng cho phép thanh toán nhiều lần (ví dụ: Cọc lần 1 -> Đóng nốt tiền đợt 2), ta lưu danh sách các ID giao dịch SePay đã ghi nhận vào cột JSON:
  ```json
  {
    "payment_status": "PAID_FULL",
    "paid_amount": 2500000,
    "debt_amount": 0,
    "sepay_transaction_ids": [100001, 100002]
  }
  ```
- **Quy trình kiểm tra**:
  ```php
  $sePayId = (string)($payload['id'] ?? '');
  $processedIds = $order->data['sepay_transaction_ids'] ?? [];

  if ($sePayId && in_array($sePayId, $processedIds)) {
      Log::info("[SePay] Giao dịch SePay #{$sePayId} đã đối soát cho đơn #{$order->id}");
      return [
          'success' => true,
          'status'  => $order->data['payment_status'] ?? 'PROCESSED',
          'message' => 'Giao dịch đã được đối soát trước đó (Idempotent).',
      ];
  }
  ```

---

## 3. Khóa dòng Database (Pessimistic Locking / `lockForUpdate`)

Để ngăn chặn **Race Condition** khi 2 webhook gửi đến gần như đồng thời (ví dụ: cách nhau 100ms):
- Cả 2 request cùng kiểm tra `exists()` và đều thấy chưa có giao dịch.
- Sau đó cả 2 cùng thực hiện cộng tiền hoặc xếp lớp.

**Giải pháp**: Sử dụng `DB::transaction()` kết hợp `lockForUpdate()`:

```php
DB::transaction(function () use ($transaction, $payload, $sePayTransactionId) {
    // 1. Khóa bản ghi User hoặc Order để độc quyền cập nhật
    $user = User::where('id', $transaction->user_id)->lockForUpdate()->first();
    
    // 2. Kiểm tra lại một lần nữa sau khi đã giữ lock
    if (PointTransaction::where('sepay_transaction_id', $sePayTransactionId)->exists()) {
        return;
    }

    // 3. Thực hiện cộng tiền
    $balanceBefore = (int) ($user->points ?? 0);
    $user->increment('points', $transaction->amount);
    
    // 4. Cập nhật transaction kèm sepay_transaction_id
    $transaction->update([
        'status'               => 'completed',
        'balance_before'       => $balanceBefore,
        'balance_after'        => $user->fresh()->points,
        'sepay_transaction_id' => $sePayTransactionId,
        'meta'                 => $payload,
    ]);
});
```

---

## 4. Xử lý các Kịch bản Sai lệch (Deviation & Edge Cases)

Trong thanh toán ngân hàng thực tế, người dùng rất dễ mắc các sai sót sau:

### Kịch bản 1: Chuyển thiếu tiền (Underpaid)
- **Tình huống**: Khóa học giá 2.500.000đ nhưng khách chuyển 50.000đ hoặc 100.000đ.
- **Quy tắc xử lý**:
  - Đặt ngưỡng cọc tối thiểu (`minDeposit`, ví dụ: 500.000đ).
  - Nếu `transferAmount < minDeposit`:
    - Đánh dấu đơn là `UNDERPAID`.
    - Ghi nhận `paid_amount = transferAmount`, `debt_amount = finalPrice - transferAmount`.
    - **TUYỆT ĐỐI KHÔNG TỰ ĐỘNG CONFIRM** đơn hàng, không tự ý cấp quyền/xếp lớp.
    - Bắn cảnh báo về Slack/Telegram hoặc cờ cảnh báo trên màn hình Admin để nhân viên liên hệ hỗ trợ khách.

### Kịch bản 2: Khách cọc trước một phần (Deposit / Partial Payment)
- **Tình huống**: Khách chuyển số tiền $\ge minDeposit$ nhưng $< finalPrice$.
- **Quy tắc xử lý**:
  - Đánh dấu trạng thái là `DEPOSITED` hoặc `PARTIAL`.
  - Ghi nhận số tiền nợ còn lại (`debt_amount = finalPrice - transferAmount`).
  - Cho phép xuất phiếu xác nhận ghi rõ số tiền đã đóng và số tiền nợ.
  - Khi khách thanh toán đợt 2, mã QR trên phiếu sẽ tự động đổi số tiền thanh toán thành đúng số nợ còn lại.

### Kịch bản 3: Thanh toán khi QR đã hết hạn (Late Payment / Expired QR)
- **Tình huống**: Giao dịch đặt hạn 15 phút, nhưng sau 2 giờ khách mới chuyển khoản.
- **Quy tắc xử lý**:
  - Nếu đơn hàng hoặc dịch vụ vẫn còn khả dụng (lớp chưa đầy, sản phẩm còn hàng): Cho phép Admin duyệt kích hoạt thủ công.
  - Nếu dịch vụ đã đóng/hết chỗ: Hệ thống kích hoạt quy trình hoàn tiền (Refund Workflow) cho khách hàng.

### Kịch bản 4: Chuyển sai nội dung hoặc thiếu cú pháp
- Khách chuyển khoản chỉ ghi tên mình hoặc nội dung bâng quơ: "Nguyen Van A ck tien".
- Regex không thể trích xuất được `reference_code`.
- **Hành động**:
  - Ghi log Warning đầy đủ với payload.
  - Lưu vào bảng `unmatched_bank_transactions` (các giao dịch treo chưa rõ chủ nhân).
  - Cung cấp giao diện Admin "Tra cứu giao dịch treo" để kế toán dễ dàng đối soát thủ công bằng số tài khoản hoặc số tiền.

---

## 5. Cấu hình Miễn trừ CSRF (CSRF Exemption)

Endpoint webhook được gọi trực tiếp từ server SePay (không có CSRF token của trình duyệt).
- **Trong Laravel**:
  - Khuyến nghị đặt route trong `routes/api.php` (mặc định đã không áp dụng middleware `VerifyCsrfToken`).
  - Nếu bắt buộc đặt trong `routes/web.php`, phải thêm URL vào danh sách ngoại lệ trong `app/Http/Middleware/VerifyCsrfToken.php`:
    ```php
    protected $except = [
        'api/sepay/webhook',
        'sepay/webhook',
    ];
    ```
