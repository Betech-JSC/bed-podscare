<?php

namespace Tests\Feature;

use App\Events\OrderOperationalEvent;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Notification;
use App\Models\RepairOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class SpecialPartsRequestTest extends TestCase
{
    use DatabaseTransactions;

    private function getAuthenticatedUser(string $role = 'technician'): User
    {
        $branch = Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'BR_Q1_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Lê Lợi, Q1, TP.HCM',
            'is_active' => true,
        ]);

        return User::factory()->create([
            'name'      => 'Test ' . ucfirst($role),
            'email'     => 'user_' . uniqid() . '@podscare.vn',
            'role'      => $role,
            'branch_id' => $branch->id,
        ]);
    }

    private function createTestOrder(string $status = 'in_repair', ?User $tech = null): RepairOrder
    {
        $branch = $tech?->branch ?? (Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'BR_Q1_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Lê Lợi, Q1, TP.HCM',
            'is_active' => true,
        ]));

        $customer = Customer::first() ?? Customer::create([
            'name'  => 'Lê Văn Khang',
            'phone' => '090' . random_int(1000000, 9999999),
            'email' => 'khang_' . uniqid() . '@gmail.com',
        ]);

        $device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2 USB-C',
            'model_code' => 'A2968_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);

        $creator = $tech ?? $this->getAuthenticatedUser('cskh');

        return RepairOrder::create([
            'order_code'          => "PC{$year}-SP{$randomNum}",
            'branch_id'           => $branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'issue_description'   => 'Lỗi mất kết nối Bluetooth tai phải',
            'status'              => $status,
            'total_price'         => 850000,
            'price_note'          => 'Tìm mua tai lẻ zin bóc máy',
            'warranty_terms_days' => 90,
            'technician_id'       => $tech?->id,
            'created_by_user_id'  => $creator->id,
            'repair_started_at'   => $status === 'in_repair' ? now() : null,
        ]);
    }

    /**
     * Test 1: KTV gửi yêu cầu mua linh kiện đặc biệt không tạm dừng đơn
     */
    public function test_technician_can_request_special_parts_without_pausing_order(): void
    {
        Event::fake([OrderOperationalEvent::class]);

        $tech = $this->getAuthenticatedUser('technician');
        $order = $this->createTestOrder('in_repair', $tech);

        $note = 'Tai lẻ AirPods Pro 2 Type-C (A2698) zin bóc máy';
        $response = $this->actingAs($tech, 'sanctum')->postJson("/api/v1/orders/{$order->id}/special-parts-request", [
            'special_parts_needed' => $note,
            'pause_order'          => false,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.id', $order->id)
            ->assertJsonPath('data.special_parts_needed', $note)
            ->assertJsonPath('data.special_parts_status', 'pending');

        $fresh = $order->fresh();
        $this->assertEquals($note, $fresh->special_parts_needed);
        $this->assertEquals('pending', $fresh->special_parts_status);
        $this->assertNotNull($fresh->special_parts_requested_at);
        $this->assertEquals('in_repair', $fresh->status);

        // Verify Audit Log
        $this->assertDatabaseHas('audit_logs', [
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => $order->id,
            'action'         => 'Yêu cầu linh kiện đặc biệt',
        ]);

        // Verify Notification
        $this->assertDatabaseHas('notifications', [
            'order_id' => $order->id,
            'type'     => 'special_part_requested',
        ]);

        // Verify Event Broadcast
        Event::assertDispatched(OrderOperationalEvent::class, function ($event) use ($order) {
            return (int) $event->orderId === (int) $order->id
                && $event->eventName === 'order.special_part_requested';
        });
    }

    /**
     * Test 2: KTV gửi yêu cầu mua linh kiện đặc biệt và chọn tạm dừng đơn -> chuyển waiting_parts
     */
    public function test_technician_can_request_special_parts_and_pause_order_to_waiting_parts(): void
    {
        $tech = $this->getAuthenticatedUser('technician');
        $order = $this->createTestOrder('in_repair', $tech);

        $note = 'Vỏ dock sạc AirPods 3 màu đặc biệt, chờ mua shopee';
        $response = $this->actingAs($tech, 'sanctum')->postJson("/api/v1/orders/{$order->id}/special-parts-request", [
            'special_parts_needed' => $note,
            'pause_order'          => true,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'waiting_parts')
            ->assertJsonPath('data.special_parts_status', 'pending');

        $fresh = $order->fresh();
        $this->assertEquals('waiting_parts', $fresh->status);
        $this->assertEquals('pending', $fresh->special_parts_status);
        $this->assertNotNull($fresh->paused_at);
        $this->assertNotNull($fresh->special_parts_requested_at);
    }

    /**
     * Test 3: Validation thất bại khi nội dung Textarea để trống
     */
    public function test_request_special_parts_validation_fails_when_note_is_empty(): void
    {
        $tech = $this->getAuthenticatedUser('technician');
        $order = $this->createTestOrder('in_repair', $tech);

        $response = $this->actingAs($tech, 'sanctum')->postJson("/api/v1/orders/{$order->id}/special-parts-request", [
            'special_parts_needed' => '',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['special_parts_needed']);
    }

    /**
     * Test 4: Admin hoặc CSKH bấm 1 nút xác nhận đã mua -> special_parts_status = 'purchased'
     */
    public function test_admin_or_cskh_can_fulfill_special_parts_request(): void
    {
        Event::fake([OrderOperationalEvent::class]);

        $cskh = $this->getAuthenticatedUser('cskh');
        $tech = $this->getAuthenticatedUser('technician');
        $order = $this->createTestOrder('waiting_parts', $tech);

        $order->update([
            'special_parts_needed'       => 'Tai trái A2084 zin 99%',
            'special_parts_status'       => 'pending',
            'special_parts_requested_at' => now(),
        ]);

        $response = $this->actingAs($cskh, 'sanctum')->postJson("/api/v1/orders/{$order->id}/special-parts-fulfill");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.special_parts_status', 'purchased');

        $fresh = $order->fresh();
        $this->assertEquals('purchased', $fresh->special_parts_status);
        $this->assertNotNull($fresh->special_parts_fulfilled_at);

        // Verify Audit Log
        $this->assertDatabaseHas('audit_logs', [
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => $order->id,
            'action'         => 'Xác nhận đã mua linh kiện đặc biệt',
        ]);

        // Verify Notification
        $this->assertDatabaseHas('notifications', [
            'order_id' => $order->id,
            'type'     => 'special_part_fulfilled',
            'user_id'  => $tech->id,
        ]);

        // Verify Event Broadcast to KTV
        Event::assertDispatched(OrderOperationalEvent::class, function ($event) use ($order) {
            return (int) $event->orderId === (int) $order->id
                && $event->eventName === 'order.special_part_fulfilled';
        });
    }

    /**
     * Test 5: Kỹ thuật viên không có quyền bấm xác nhận đã mua (Forbidden 403)
     */
    public function test_technician_is_forbidden_from_fulfilling_special_parts_request(): void
    {
        $tech = $this->getAuthenticatedUser('technician');
        $order = $this->createTestOrder('in_repair', $tech);

        $order->update([
            'special_parts_needed' => 'IC Nguồn',
            'special_parts_status' => 'pending',
        ]);

        $response = $this->actingAs($tech, 'sanctum')->postJson("/api/v1/orders/{$order->id}/special-parts-fulfill");

        $response->assertStatus(403);
    }

    /**
     * Test 6: Bộ lọc đơn hàng lọc chính xác danh sách special_parts_status = 'pending'
     */
    public function test_orders_index_filters_by_special_parts_status(): void
    {
        $admin = $this->getAuthenticatedUser('admin');
        $orderPending = $this->createTestOrder('in_repair');
        $orderPending->update([
            'special_parts_needed' => 'Linh kiện ngoài A',
            'special_parts_status' => 'pending',
        ]);

        $orderNone = $this->createTestOrder('in_repair');
        $orderNone->update([
            'special_parts_status' => null,
        ]);

        // Lọc qua query param special_parts_status=pending
        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/orders?special_parts_status=pending');
        $response->assertStatus(200);

        $data = $response->json('data.data');
        $orderCodes = array_column($data, 'order_code');

        $this->assertContains($orderPending->order_code, $orderCodes);
        $this->assertNotContains($orderNone->order_code, $orderCodes);

        // Lọc qua query param status=special_parts
        $responseAlias = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/orders?status=special_parts');
        $responseAlias->assertStatus(200);
        $aliasCodes = array_column($responseAlias->json('data.data'), 'order_code');
        $this->assertContains($orderPending->order_code, $aliasCodes);
        $this->assertNotContains($orderNone->order_code, $aliasCodes);
    }

    /**
     * Test 7: CSKH xác nhận mua kèm resume_order = true -> đơn tự động trở lại in_repair
     */
    public function test_cskh_can_fulfill_and_resume_order_when_requested(): void
    {
        $cskh = $this->getAuthenticatedUser('cskh');
        $tech = $this->getAuthenticatedUser('technician');
        $order = $this->createTestOrder('waiting_parts', $tech);

        $order->update([
            'special_parts_needed' => 'Pin zin bóc máy',
            'special_parts_status' => 'pending',
            'paused_at'            => now(),
        ]);

        $response = $this->actingAs($cskh, 'sanctum')->postJson("/api/v1/orders/{$order->id}/special-parts-fulfill", [
            'resume_order' => true,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'in_repair')
            ->assertJsonPath('data.special_parts_status', 'purchased');

        $fresh = $order->fresh();
        $this->assertEquals('in_repair', $fresh->status);
        $this->assertEquals('purchased', $fresh->special_parts_status);
        $this->assertNull($fresh->paused_at);
    }
}
