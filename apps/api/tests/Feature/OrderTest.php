<?php

namespace Tests\Feature;

use App\Events\OrderOperationalEvent;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Notification;
use App\Models\RepairOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class OrderTest extends TestCase
{
    use DatabaseTransactions;
    private function getAuthenticatedUser(): User
    {
        $user = User::where('email', 'admin@fixo.com.vn')->first()
            ?? User::where('email', 'admin@podscare.vn')->first()
            ?? User::where('role', 'admin')->first()
            ?? User::first();
        $this->assertNotNull($user, 'Authenticated user must exist');
        return $user;
    }

    private function createTestOrder(string $status = 'inspecting'): RepairOrder
    {
        $branch = Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'BR_Q1_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Lê Lợi, Q1, TP.HCM',
            'is_active' => true,
        ]);
        $customer = Customer::first() ?? Customer::create([
            'name'  => 'Nguyễn Minh Anh',
            'phone' => '090' . random_int(1000000, 9999999),
            'email' => 'minhanh_' . uniqid() . '@gmail.com',
        ]);
        $device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);
        $user = $this->getAuthenticatedUser();

        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);

        return RepairOrder::create([
            'order_code'          => "FX{$year}-T{$randomNum}",
            'branch_id'           => $branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'issue_description'   => 'Kiểm tra lỗi mic đàm thoại và pin',
            'status'              => $status,
            'total_price'         => 650000,
            'price_note'          => 'Thay pin dock sạc',
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $user->id,
        ]);
    }

    /**
     * Test 1: GET /api/v1/orders/{id} hoạt động với numeric primary key ID.
     */
    public function test_show_order_by_numeric_id(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder();

        $response = $this->actingAs($user, 'sanctum')->getJson("/api/v1/orders/{$order->id}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.id', $order->id)
            ->assertJsonPath('data.order_code', $order->order_code);
    }

    /**
     * Test 2: GET /api/v1/orders/{order_code} hoạt động với chuỗi mã đơn hàng (Dual-Lookup).
     */
    public function test_show_order_by_string_order_code(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder();

        $response = $this->actingAs($user, 'sanctum')->getJson("/api/v1/orders/{$order->order_code}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.id', $order->id)
            ->assertJsonPath('data.order_code', $order->order_code);
    }

    /**
     * Test 3: GET /api/v1/orders/{id} trả về 404 khi không tìm thấy cả theo ID lẫn order_code.
     */
    public function test_show_order_returns_404_when_not_found(): void
    {
        $user = $this->getAuthenticatedUser();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/orders/FX99-NONEXIST');

        $response->assertStatus(404)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Không tìm thấy đơn sửa chữa.');
    }

    /**
     * Test 4: PUT /api/v1/orders/{order_code} cập nhật đơn qua chuỗi mã đơn hàng.
     */
    public function test_update_order_by_string_order_code(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder();

        $response = $this->actingAs($user, 'sanctum')->putJson("/api/v1/orders/{$order->order_code}", [
            'price_note'         => 'Cập nhật ghi chú sửa chữa qua order_code',
            'parts_used_summary' => 'Pin AirPods Pro Gen 2',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.price_note', 'Cập nhật ghi chú sửa chữa qua order_code');

        $this->assertEquals('Cập nhật ghi chú sửa chữa qua order_code', $order->fresh()->price_note);
    }

    /**
     * Test 5: POST /api/v1/orders/{order_code}/transition chuyển trạng thái qua mã đơn hàng.
     */
    public function test_transition_order_by_string_order_code(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('inspecting');

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->order_code}/transition", [
            'status' => 'waiting_approval',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'waiting_approval');

        $this->assertEquals('waiting_approval', $order->fresh()->status);
    }

    /**
     * Test 6: POST /api/v1/orders/{order_code}/checklists lưu checklist qua mã đơn hàng.
     */
    public function test_store_checklist_by_string_order_code(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder();

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->order_code}/checklists", [
            'items' => [
                [
                    'item_name' => 'Kiểm tra mic thu âm',
                    'status'    => 'pass',
                    'note'      => 'Âm lượng rõ ràng',
                ],
                [
                    'item_name' => 'Kiểm tra cảm ứng chạm',
                    'status'    => 'fail',
                    'note'      => 'Chạm tai phải không phản hồi',
                ],
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertDatabaseHas('intake_checklists', [
            'repair_order_id' => $order->id,
            'item_name'       => 'Kiểm tra mic thu âm',
            'status'          => 'pass',
        ]);
    }

    /**
     * Test 7: POST /api/v1/orders/{order_code}/photos tải ảnh hiện trạng qua mã đơn hàng.
     */
    public function test_upload_photo_by_string_order_code(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder();

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->order_code}/photos", [
            'photo_url' => 'https://images.unsplash.com/photo-test-airpods.jpg',
            'caption'   => 'Hiện trạng trầy xước tai trái',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.repair_order_id', $order->id);

        $this->assertDatabaseHas('intake_photos', [
            'repair_order_id' => $order->id,
            'photo_url'       => 'https://images.unsplash.com/photo-test-airpods.jpg',
        ]);
    }

    /**
     * Test 8: POST /api/v1/orders tạo đơn mới, đồng thời lưu notification và dispatch OrderOperationalEvent.
     */
    public function test_store_order_creates_notification_and_dispatches_operational_event(): void
    {
        Event::fake([OrderOperationalEvent::class]);

        $user = $this->getAuthenticatedUser();
        $branch = Branch::first();
        $device = DeviceModel::first();

        $payload = [
            'branch_id'            => $branch->id,
            'customer_phone'       => '0987654321',
            'customer_name'        => 'Nguyễn Văn Test',
            'device_model_id'      => $device->id,
            'serial_number'        => 'TEST-SR-12345',
            'intake_battery_level' => '85%',
            'accessories'          => 'Hộp sạc, cáp Lightning',
            'issue_description'    => 'AirPods bị rè loa trái và chai pin',
            'appearance_notes'     => 'Hộp sạc xước nhẹ',
            'estimated_price'      => 450000,
            'warranty_terms_days'  => 90,
            'checklists'           => [
                [
                    'item_name' => 'Kiểm tra âm thanh tai trái',
                    'status'    => 'fail',
                    'note'      => 'Bị rè',
                ],
            ],
        ];

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/orders', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'waiting_tech');

        $orderId = $response->json('data.id');
        $orderCode = $response->json('data.order_code');

        $this->assertNotNull($orderId);
        $this->assertNotNull($orderCode);

        // 1. Kiểm tra bản ghi Notification trong database
        $this->assertDatabaseHas('notifications', [
            'order_id'  => $orderId,
            'branch_id' => $branch->id,
            'type'      => 'order_created',
            'title'     => 'Tiếp nhận đơn mới',
            'severity'  => 'info',
            'is_read'   => false,
        ]);

        $notification = Notification::where('order_id', $orderId)->first();
        $this->assertNotNull($notification);
        $this->assertStringContainsString($orderCode, $notification->message);
        $this->assertStringContainsString($branch->name, $notification->message);

        // 2. Kiểm tra Event OrderOperationalEvent được dispatch với đầy đủ thông tin (targetRole = technician)
        Event::assertDispatched(OrderOperationalEvent::class, function (OrderOperationalEvent $event) use ($orderId, $orderCode, $branch, $notification) {
            return $event->orderId === $orderId
                && $event->orderCode === $orderCode
                && $event->branchId === $branch->id
                && $event->targetRole === 'technician'
                && $event->type === 'order_created'
                && $event->title === 'Tiếp nhận đơn mới'
                && $event->severity === 'info'
                && (int) $event->id === (int) $notification->id
                && $event->actionUrl === "/repairs?id={$orderId}";
        });
    }

    /**
     * Test filter orders by numeric technician_id.
     */
    public function test_index_orders_filter_by_numeric_technician_id(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder();
        $order->technician_id = $user->id;
        $order->save();

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/orders?technician_id=' . $user->id);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $orders = $response->json('data.data');
        $this->assertNotEmpty($orders);
        foreach ($orders as $o) {
            $this->assertEquals($user->id, $o['technician_id']);
        }

        // Also test /repairs alias
        $responseRepairs = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/repairs?technician_id=' . $user->id);
        $responseRepairs->assertStatus(200)
            ->assertJsonPath('success', true);
    }

    /**
     * Test filter orders by technician_id=unassigned.
     */
    public function test_index_orders_filter_by_unassigned_technician_id(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder();
        $order->technician_id = null;
        $order->save();

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/orders?technician_id=unassigned');

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $orders = $response->json('data.data');
        $this->assertNotEmpty($orders);
        foreach ($orders as $o) {
            $this->assertNull($o['technician_id']);
        }

        // Also test /repairs alias
        $responseRepairs = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/repairs?technician_id=unassigned');
        $responseRepairs->assertStatus(200)
            ->assertJsonPath('success', true);
    }
}
