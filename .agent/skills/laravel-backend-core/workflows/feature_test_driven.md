# Quy trình Viết Feature Test Độc Lập (Feature Test-Driven)

Hướng dẫn phương pháp viết bài kiểm thử tính năng (Feature Tests) cô lập, tự động dọn dẹp cơ sở dữ liệu sau mỗi bài test, mô phỏng các dịch vụ bên ngoài (Fakes/Mocks) và kiểm thử các kịch bản biên (Edge cases, 403, 409, 422).

---

## ⚙️ 1. Cấu hình Môi trường Kiểm thử

Đảm bảo `phpunit.xml` có cấu hình database riêng biệt hoặc SQLite in-memory để không làm ảnh hưởng đến dữ liệu thực tế:
```xml
<php>
    <env name="APP_ENV" value="testing"/>
    <env name="BCRYPT_ROUNDS" value="4"/>
    <env name="CACHE_DRIVER" value="array"/>
    <env name="DB_CONNECTION" value="sqlite"/>
    <env name="DB_DATABASE" value=":memory:"/>
    <env name="MAIL_MAILER" value="array"/>
    <env name="QUEUE_CONNECTION" value="sync"/>
    <env name="SESSION_DRIVER" value="array"/>
</php>
```

---

## 🧪 2. Cấu trúc Chuẩn Một Bài Feature Test (Pattern AAA)

Mọi test case đều tuân thủ mô hình **Arrange - Act - Assert**:
1. **Arrange (Chuẩn bị)**: Khởi tạo dữ liệu giả lập (Factory), fake các tác vụ nền (`Queue::fake()`, `Mail::fake()`).
2. **Act (Hành động)**: Thực hiện gọi HTTP Request (`$this->postJson()`, `$this->actingAs()`).
3. **Assert (Xác nhận)**: Kiểm tra mã HTTP status, cấu trúc JSON trả về và dữ liệu được ghi vào CSDL (`assertDatabaseHas`).

---

## 📝 3. Mẫu Kịch bản Test Đầy Đủ (State Machine & Webhook)

### 3.1. Test Chuyển Trạng thái Đơn hàng & Optimistic Locking
```php
namespace Tests\Feature;

use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class OrderWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected Order $order;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();

        $this->admin = User::factory()->create(['is_admin' => true]);
        $this->order = Order::factory()->create([
            'status' => Order::STATUS_NEW,
        ]);
    }

    /** @test */
    public function admin_can_transition_order_from_new_to_confirmed(): void
    {
        $response = $this->actingAs($this->admin, 'admin')
            ->postJson(route('admin.orders.status', $this->order->id), [
                'status' => Order::STATUS_CONFIRMED,
                'expected_updated_at' => (string) $this->order->updated_at,
            ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', Order::STATUS_CONFIRMED);

        // Xác nhận dữ liệu trong database
        $this->assertDatabaseHas('orders', [
            'id' => $this->order->id,
            'status' => Order::STATUS_CONFIRMED,
        ]);

        // Xác nhận có ghi Audit Log
        $this->assertDatabaseHas('order_status_logs', [
            'order_id'   => $this->order->id,
            'old_status' => Order::STATUS_NEW,
            'new_status' => Order::STATUS_CONFIRMED,
            'changed_by' => $this->admin->id,
        ]);
    }

    /** @test */
    public function optimistic_locking_prevents_concurrent_overwrite(): void
    {
        // Giả lập một admin khác đã sửa đơn trước đó 5 phút
        $staleTimestamp = now()->subMinutes(5)->toDateTimeString();

        $response = $this->actingAs($this->admin, 'admin')
            ->postJson(route('admin.orders.status', $this->order->id), [
                'status' => Order::STATUS_CONFIRMED,
                'expected_updated_at' => $staleTimestamp, // Timestamp cũ
            ]);

        // Kỳ vọng trả về 409 Conflict
        $response->assertStatus(409)
            ->assertJsonPath('success', false);

        // Đơn hàng vẫn giữ trạng thái cũ trong DB
        $this->assertDatabaseHas('orders', [
            'id' => $this->order->id,
            'status' => Order::STATUS_NEW,
        ]);
    }
}
```

### 3.2. Test Webhook Idempotency (Chống Replay)
```php
    /** @test */
    public function duplicate_webhook_call_is_idempotent(): void
    {
        $payload = [
            'id' => 'TXN_TEST_9999',
            'code' => $this->order->order_code,
            'amount' => $this->order->total_amount,
        ];

        // Lần 1: Thành công
        $firstResponse = $this->withHeader('Authorization', 'Bearer valid_token')
            ->postJson('/api/webhook/payment/sepay', $payload);
        $firstResponse->assertOk()
            ->assertJsonPath('data.status', 'success');

        // Lần 2: Cổng thanh toán retry gửi lại payload y hệt
        $secondResponse = $this->withHeader('Authorization', 'Bearer valid_token')
            ->postJson('/api/webhook/payment/sepay', $payload);

        // Vẫn phải trả về 200 OK nhưng không cộng tiền lần 2
        $secondResponse->assertOk()
            ->assertJsonPath('data.status', 'duplicate');

        // Chỉ có đúng 1 bản ghi giao dịch trong CSDL
        $this->assertDatabaseCount('payment_transactions', 1);
    }
```

---

## 🏃 4. Các Lệnh Chạy Test Thường Dùng

```bash
# Chạy toàn bộ test suite
php artisan test

# Chạy riêng 1 file test cụ thể
php artisan test tests/Feature/OrderWorkflowTest.php

# Chạy và dừng ngay khi gặp lỗi đầu tiên (Stop on defect)
php artisan test --stop-on-failure

# Lọc chạy theo tên hàm test
php artisan test --filter=optimistic_locking
```
