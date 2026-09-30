# An toàn Giao dịch & Kiểm soát Đồng thời (Security & Concurrency)

Tài liệu quy định kiến trúc bảo vệ hệ thống trước tình trạng tranh chấp dữ liệu (Race Condition), xung đột ghi đè đồng thời (Concurrent Edits), gian lận thanh toán (Double Spending) và truy vết lịch sử (Audit Logging).

---

## 🔒 1. Kiểm soát Đồng thời (Concurrency Control)

Trong hệ thống có nhiều người dùng và quản trị viên cùng thao tác, có 2 cơ chế khóa dữ liệu bắt buộc áp dụng:

### 1.1. Khóa Lạc quan (Optimistic Locking) - Cho Admin & Backoffice
Áp dụng cho các màn hình quản trị chỉnh sửa đơn hàng, khách hàng, nội dung:
- **Cơ chế**: Sử dụng trường `expected_updated_at` (hoặc cột version).
- **Hoạt động**: Khi Admin A mở trang sửa, client giữ timestamp `updated_at`. Khi gửi lệnh lưu lên server, Service so khớp timestamp của record trong DB với `expected_updated_at`. Nếu lệch nhau (do Admin B đã lưu trước), Service từ chối với ngoại lệ `ConflictHttpException` (HTTP 409).
- **Mã mẫu**:
```php
if (!empty($options['expected_updated_at']) && $model->updated_at) {
    $expected = Carbon::parse($options['expected_updated_at'])->timestamp;
    $actual = $model->updated_at->timestamp;

    if ($expected !== $actual) {
        throw new \Symfony\Component\HttpKernel\Exception\ConflictHttpException(
            'Bản ghi đã được cập nhật bởi một người khác. Vui lòng tải lại trang để xem thông tin mới nhất.'
        );
    }
}
```

### 1.2. Khóa Bi quan (Pessimistic Locking) - Cho Trừ Tồn kho & Trừ Số dư Ví
Áp dụng khi thực hiện các phép toán tài chính hoặc giảm số lượng:
- **Cơ chế**: Sử dụng câu lệnh SQL `SELECT ... FOR UPDATE` thông qua Eloquent `$query->lockForUpdate()`.
- **Mã mẫu**:
```php
DB::transaction(function () use ($userId, $amount) {
    // Khóa bản ghi của user cho đến khi transaction hoàn tất
    $wallet = Wallet::where('user_id', $userId)->lockForUpdate()->firstOrFail();

    if ($wallet->balance < $amount) {
        throw new InsufficientBalanceException('Số dư ví không đủ.');
    }

    $wallet->balance -= $amount;
    $wallet->save();
});
```

---

## 💳 2. Nguyên lý Bất biến (Idempotency)

Các tác vụ tạo thanh toán, trừ tiền, hoặc nhận Webhook từ ngân hàng/cổng thanh toán (SePay, Momo, VNPay) BẮT BUỘC phải đảm bảo tính Idempotent (gọi $N$ lần cho kết quả như gọi $1$ lần).

### Quy trình Xử lý Idempotent:
1. **Khóa bản ghi bằng Unique Reference / Transaction ID**:
   - Sử dụng bảng `payment_transactions` với cột `transaction_id` hoặc `reference_number` đánh `UNIQUE`.
2. **Kiểm tra trạng thái trước khi thay đổi (Check-Then-Act trong Transaction)**:
   ```php
   return DB::transaction(function () use ($webhookData) {
       // 1. Kiểm tra xem giao dịch ngân hàng đã từng được ghi nhận chưa
       $existingTransaction = PaymentTransaction::where('transaction_id', $webhookData['id'])->first();
       if ($existingTransaction) {
           // Đã xử lý rồi -> Trả về kết quả thành công ngay, KHÔNG cộng tiền lần 2
           return ['status' => 'already_processed', 'data' => $existingTransaction];
       }

       // 2. Tìm đơn hàng tương ứng với khóa FOR UPDATE
       $order = Order::where('order_code', $webhookData['order_code'])->lockForUpdate()->firstOrFail();

       if ($order->isPaid()) {
           return ['status' => 'order_already_paid', 'order' => $order];
       }

       // 3. Ghi nhận giao dịch
       $transaction = PaymentTransaction::create([
           'transaction_id' => $webhookData['id'],
           'order_id'       => $order->id,
           'amount'         => $webhookData['amount'],
           'status'         => 'SUCCESS',
           'payload'        => $webhookData,
       ]);

       // 4. Chuyển trạng thái đơn hàng
       $order->update(['status' => Order::STATUS_PAID, 'paid_at' => now()]);

       return ['status' => 'success', 'data' => $transaction];
   });
   ```

---

## 🛡️ 3. Quy tắc Thực thi DB Transaction

1. **Bắt buộc cho mọi nghiệp vụ tác động nhiều hơn 1 bảng**:
   - Khi tạo Đơn hàng (bảng `orders` + bảng `order_items`).
   - Khi chuyển trạng thái đơn (bảng `orders` + bảng `order_status_logs`).
2. **Không bọc các tác vụ I/O chậm trong Transaction**:
   - Tuyệt đối **KHÔNG** gọi API bên thứ ba, gửi mail, hoặc tải file nặng **bên trong** khối `DB::transaction()`.
   - Nếu gọi API chậm bên trong transaction, kết nối DB sẽ bị chiếm giữ (connection exhaustion), gây treo toàn bộ ứng dụng.
   - **Giải pháp**: Dispatch Queue Job hoặc Event sau khi transaction đã commit thành công:
   ```php
   $order = DB::transaction(function () use ($data) {
       // Thao tác DB nhanh
       return Order::create($data);
   });

   // Tác vụ chậm thực hiện ngoài transaction
   SendOrderEmailJob::dispatch($order);
   ```

---

## 📜 4. Nhật ký Kiểm toán (Audit Logging)

Mọi thay đổi trạng thái quan trọng (Status Transitions) bắt buộc phải lưu vết:
- **Ai thay đổi**: `changed_by` (ID) và `admin_name`.
- **Trạng thái**: `old_status` và `new_status`.
- **Bối cảnh**: `reason` (lý do hủy/thay đổi), `note` (ghi chú nội bộ), `ip_address`, `user_agent`.
- **Thời gian**: `created_at`.
- Lưu trữ trong bảng riêng biệt (VD: `order_status_logs`, `contact_status_logs`), không được phép sửa hay xóa bản ghi log này.
