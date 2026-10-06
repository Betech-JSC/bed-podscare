<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Notification;
use App\Models\RepairOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class OrderPartsRequestTest extends TestCase
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
            'email'     => 'user_' . uniqid() . '@fixo.vn',
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
            'name'  => 'Trần Hoàng Long',
            'phone' => '090' . random_int(1000000, 9999999),
            'email' => 'long_' . uniqid() . '@gmail.com',
        ]);

        $device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);

        return RepairOrder::create([
            'order_code'          => "FX{$year}-P{$randomNum}",
            'branch_id'           => $branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'issue_description'   => 'Màng loa rè, pin chai',
            'status'              => $status,
            'total_price'         => 650000,
            'price_note'          => 'Thay pin và màng loa tai phải',
            'warranty_terms_days' => 90,
            'technician_id'       => $tech?->id,
            'created_by_user_id'  => $tech?->id ?? 1,
            'repair_started_at'   => $status === 'in_repair' ? now() : null,
        ]);
    }

    /**
     * Test 1: KTV cập nhật ghi chú linh kiện độc lập mà không đổi trạng thái đơn hàng
     */
    public function test_technician_can_update_parts_note_without_changing_status(): void
    {
        $tech = $this->getAuthenticatedUser('technician');
        $order = $this->createTestOrder('in_repair', $tech);

        $response = $this->actingAs($tech, 'sanctum')->patchJson("/api/v1/orders/{$order->id}/parts-note", [
            'parts_needed' => 'Pin AirPods Pro 2 - A2731',
            'repair_note'  => 'Pin phù nhẹ, cần thay sớm tránh biến dạng vỏ',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.id', $order->id)
            ->assertJsonPath('data.status', 'in_repair')
            ->assertJsonPath('data.parts_needed', 'Pin AirPods Pro 2 - A2731')
            ->assertJsonPath('data.repair_note', 'Pin phù nhẹ, cần thay sớm tránh biến dạng vỏ');

        $fresh = $order->fresh();
        $this->assertEquals('in_repair', $fresh->status);
        $this->assertEquals('Pin AirPods Pro 2 - A2731', $fresh->parts_needed);
        $this->assertEquals('Pin phù nhẹ, cần thay sớm tránh biến dạng vỏ', $fresh->repair_note);

        // Verify Audit Log
        $this->assertDatabaseHas('audit_logs', [
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => $order->id,
            'action'         => 'Cập nhật ghi chú linh kiện',
        ]);
    }

    /**
     * Test 2: KTV chuyển đơn sang waiting_parts kèm parts_needed và repair_note
     */
    public function test_technician_can_transition_to_waiting_parts_with_parts_needed(): void
    {
        $tech = $this->getAuthenticatedUser('technician');
        $order = $this->createTestOrder('in_repair', $tech);

        $response = $this->actingAs($tech, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'transition'   => 'waiting_parts',
            'parts_needed' => 'Màng loa AirPods 3 (SKU: SP-AP3-SPK)',
            'repair_note'  => 'Màng loa rách thủng, cần xuất kho linh kiện mới',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'waiting_parts')
            ->assertJsonPath('data.parts_needed', 'Màng loa AirPods 3 (SKU: SP-AP3-SPK)');

        $fresh = $order->fresh();
        $this->assertEquals('waiting_parts', $fresh->status);
        $this->assertEquals('Màng loa AirPods 3 (SKU: SP-AP3-SPK)', $fresh->parts_needed);
        $this->assertNotNull($fresh->paused_at);

        // Verify Audit Log
        $this->assertDatabaseHas('audit_logs', [
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => $order->id,
            'action'         => 'Đổi trạng thái: in_repair -> waiting_parts',
        ]);

        // Verify notification created
        $this->assertDatabaseHas('notifications', [
            'order_id' => $order->id,
            'type'     => 'order_waiting_parts',
        ]);
    }



    /**
     * Test 4: Admin / CSKH mở lại đơn từ waiting_parts về in_repair khi đã có linh kiện
     */
    public function test_admin_or_cskh_can_resume_order_from_waiting_parts_to_in_repair(): void
    {
        $admin = $this->getAuthenticatedUser('admin');
        $tech = $this->getAuthenticatedUser('technician');
        $order = $this->createTestOrder('in_repair', $tech);

        // KTV tạm dừng trước
        $order->update([
            'status'       => 'waiting_parts',
            'parts_needed' => 'Pin dock sạc AirPods Pro 1',
            'paused_at'    => now(),
        ]);

        // Admin bấm resume
        $response = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'transition' => 'in_repair',
            'reason'     => 'Linh kiện pin dock đã nhập về chi nhánh',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'in_repair');

        $fresh = $order->fresh();
        $this->assertEquals('in_repair', $fresh->status);
        $this->assertNull($fresh->paused_at); // paused_at must be reset
        $this->assertEquals('Pin dock sạc AirPods Pro 1', $fresh->parts_needed); // preserved

        // Verify Audit Log
        $this->assertDatabaseHas('audit_logs', [
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => $order->id,
            'action'         => 'Đổi trạng thái: waiting_parts -> in_repair',
        ]);

        // Verify notification to technician
        $this->assertDatabaseHas('notifications', [
            'order_id' => $order->id,
            'type'     => 'order_resumed',
        ]);
    }
}
