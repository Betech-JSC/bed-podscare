# Quy trình Xây dựng State Machine Service (Workflow Pattern)

Hướng dẫn xây dựng Service chuyên biệt quản lý vòng đời trạng thái của các thực thể quan trọng (Đơn hàng, Lịch hẹn/Booking, Hồ sơ khách hàng) có hỗ trợ khóa lạc quan (Optimistic Locking) và ghi vết lịch sử (Audit Log).

---

## 🎯 1. Tại sao cần State Machine Service?

Khi một thực thể có nhiều trạng thái phức tạp (ví dụ: `NEW` ➔ `CONFIRMED` ➔ `PROCESSING` ➔ `COMPLETED` / `CANCELLED`), nếu viết logic đổi trạng thái phân tán rải rác trong các Controllers:
- Dễ dẫn đến việc chuyển đổi trạng thái phi lý (VD: Đơn đã `CANCELLED` nhưng lại bị chuyển thành `COMPLETED`).
- Không có cơ chế kiểm tra xung đột khi 2 admin cùng mở đơn và đổi trạng thái khác nhau cùng một thời điểm.
- Thiếu audit log ghi nhận ai đổi, đổi khi nào, tại sao đổi.
- Side effects (gửi email, xuất hóa đơn, tích điểm) bị gọi lặp lại nhiều lần.

---

## 🛠️ 2. Quy trình Triển khai 5 Bước

### Bước 1: Khai báo Hằng số Trạng thái & Bảng Audit Log
Trong Model (VD: `Order.php`):
```php
class Order extends Model
{
    public const STATUS_NEW        = 'NEW';
    public const STATUS_CONFIRMED  = 'CONFIRMED';
    public const STATUS_PROCESSING = 'PROCESSING';
    public const STATUS_COMPLETED  = 'COMPLETED';
    public const STATUS_CANCELLED  = 'CANCELLED';

    public const STATUS_LIST = [
        self::STATUS_NEW        => 'Mới tạo',
        self::STATUS_CONFIRMED  => 'Đã xác nhận',
        self::STATUS_PROCESSING => 'Đang xử lý',
        self::STATUS_COMPLETED  => 'Hoàn tất',
        self::STATUS_CANCELLED  => 'Đã hủy',
    ];

    public function statusLogs()
    {
        return $this->hasMany(OrderStatusLog::class)->latest();
    }
}
```

Bảng migration `order_status_logs`:
```php
Schema::create('order_status_logs', function (Blueprint $table) {
    $table->id();
    $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
    $table->string('old_status', 50)->nullable();
    $table->string('new_status', 50);
    $table->unsignedBigInteger('changed_by')->nullable();
    $table->string('admin_name')->nullable();
    $table->string('reason')->nullable();
    $table->text('note')->nullable();
    $table->string('ip_address', 45)->nullable();
    $table->string('user_agent')->nullable();
    $table->timestamps();
});
```

---

### Bước 2: Định nghĩa Ma trận Chuyển đổi Hợp lệ
Trong `OrderWorkflowService.php`:
```php
class OrderWorkflowService extends BaseWorkflowService
{
    /**
     * Ma trận quy định các trạng thái tiếp theo được phép chuyển đến.
     */
    public const ALLOWED_TRANSITIONS = [
        Order::STATUS_NEW => [
            Order::STATUS_CONFIRMED,
            Order::STATUS_CANCELLED,
        ],
        Order::STATUS_CONFIRMED => [
            Order::STATUS_PROCESSING,
            Order::STATUS_CANCELLED,
        ],
        Order::STATUS_PROCESSING => [
            Order::STATUS_COMPLETED,
            Order::STATUS_CANCELLED,
        ],
        Order::STATUS_COMPLETED => [
            // Trạng thái kết thúc, không cho phép đổi tiếp
        ],
        Order::STATUS_CANCELLED => [
            // Trạng thái kết thúc
        ],
    ];
}
```

---

### Bước 3: Triển khai Hàm `transition()` với Optimistic Locking
Trong Service, xử lý kiểm tra `expected_updated_at`:
```php
public function transition(Order $order, string $newStatus, array $options = []): Order
{
    $currentStatus = $order->status;

    if ($currentStatus === $newStatus) {
        return $order;
    }

    // 1. Chống xung đột đồng thời (Optimistic Lock)
    if (!empty($options['expected_updated_at']) && $order->updated_at) {
        $expected = Carbon::parse($options['expected_updated_at'])->timestamp;
        $actual = $order->updated_at->timestamp;

        if ($expected !== $actual) {
            throw new ConflictHttpException(
                'Đơn hàng vừa được cập nhật bởi một người khác. Vui lòng tải lại trang!'
            );
        }
    }

    // 2. Kiểm tra tính hợp lệ của bước chuyển
    $this->validateTransition($currentStatus, $newStatus);

    // 3. Thực thi trong DB Transaction
    return DB::transaction(function () use ($order, $currentStatus, $newStatus, $options) {
        // Cập nhật trạng thái
        $order->status = $newStatus;
        if ($newStatus === Order::STATUS_COMPLETED) {
            $order->completed_at = now();
        }
        $order->save();

        // Ghi Audit Log
        $adminId = $options['admin_id'] ?? auth()->guard('admin')->id();
        $adminName = $options['admin_name'] ?? auth()->guard('admin')->user()?->name ?? 'Hệ thống';

        OrderStatusLog::create([
            'order_id'   => $order->id,
            'old_status' => $currentStatus,
            'new_status' => $newStatus,
            'changed_by' => $adminId,
            'admin_name' => $adminName,
            'reason'     => $options['reason'] ?? null,
            'note'       => $options['note'] ?? null,
            'ip_address' => $options['ip'] ?? request()->ip(),
            'user_agent' => $options['user_agent'] ?? request()->userAgent(),
        ]);

        // Kích hoạt tác vụ phụ
        $this->handleSideEffects($order, $currentStatus, $newStatus);

        return $order->fresh(['statusLogs']);
    });
}
```

---

### Bước 4: Xử lý Tác vụ Phụ (Side Effects) An toàn
Tách bạch side-effects sang Queue Jobs:
```php
protected function handleSideEffects(Order $order, string $oldStatus, string $newStatus): void
{
    if ($newStatus === Order::STATUS_CONFIRMED) {
        SendOrderConfirmationJob::dispatch($order->id);
    }

    if ($newStatus === Order::STATUS_COMPLETED) {
        GenerateInvoiceSlipJob::dispatch($order->id);
        AwardRewardPointsJob::dispatch($order->id);
    }
}
```

---

### Bước 5: Gọi từ Controller
Controller chỉ cần truyền dữ liệu vào Service và bắt `ConflictHttpException`:
```php
public function updateStatus(Request $request, $id, OrderWorkflowService $workflow)
{
    $request->validate([
        'status' => 'required|string',
        'reason' => 'nullable|string',
        'expected_updated_at' => 'nullable|string',
    ]);

    $order = Order::findOrFail($id);

    try {
        $updatedOrder = $workflow->transition($order, $request->status, [
            'reason' => $request->reason,
            'expected_updated_at' => $request->expected_updated_at,
        ]);

        return $this->success($updatedOrder, 'Cập nhật trạng thái thành công');
    } catch (ConflictHttpException $e) {
        return $this->failure($e->getMessage(), 409);
    } catch (\DomainException $e) {
        return $this->failure($e->getMessage(), 422);
    }
}
```
