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
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class TechnicianHandoverTest extends TestCase
{
    use DatabaseTransactions;

    private Branch $branch1;
    private Branch $branch2;
    private User $tech1;
    private User $tech2;
    private User $techOtherBranch;
    private User $admin;
    private Customer $customer;
    private DeviceModel $device;

    protected function setUp(): void
    {
        parent::setUp();

        $this->branch1 = Branch::create([
            'name'      => 'Chi nhánh Thử nghiệm Q1',
            'code'      => 'BR_TEST_' . uniqid(),
            'phone'     => '0901111222',
            'address'   => '100 Lê Thánh Tôn, Q1',
            'is_active' => true,
        ]);

        $this->branch2 = Branch::create([
            'name'      => 'Chi nhánh Thử nghiệm Q3',
            'code'      => 'BR_TEST_' . uniqid(),
            'phone'     => '0903333444',
            'address'   => '200 Võ Văn Tần, Q3',
            'is_active' => true,
        ]);

        $this->tech1 = new User([
            'name'      => 'KTV Nguyễn Văn A',
            'email'     => 'ktv.a.' . uniqid() . '@fixo.vn',
            'password'  => Hash::make('password'),
            'branch_id' => $this->branch1->id,
            'is_active' => true,
        ]);
        $this->tech1->role = 'technician';
        $this->tech1->save();

        $this->tech2 = new User([
            'name'      => 'KTV Trần Văn B',
            'email'     => 'ktv.b.' . uniqid() . '@fixo.vn',
            'password'  => Hash::make('password'),
            'branch_id' => $this->branch1->id,
            'is_active' => true,
        ]);
        $this->tech2->role = 'technician';
        $this->tech2->save();

        $this->techOtherBranch = new User([
            'name'      => 'KTV Lê Văn C',
            'email'     => 'ktv.c.' . uniqid() . '@fixo.vn',
            'password'  => Hash::make('password'),
            'branch_id' => $this->branch2->id,
            'is_active' => true,
        ]);
        $this->techOtherBranch->role = 'technician';
        $this->techOtherBranch->save();

        $this->admin = new User([
            'name'      => 'Admin Quản Lý',
            'email'     => 'admin.' . uniqid() . '@fixo.vn',
            'password'  => Hash::make('password'),
            'branch_id' => $this->branch1->id,
            'is_active' => true,
        ]);
        $this->admin->role = 'admin';
        $this->admin->save();

        $this->customer = Customer::create([
            'name'  => 'Khách Hàng Test',
            'phone' => '098' . random_int(1000000, 9999999),
        ]);

        $this->device = DeviceModel::create([
            'name'       => 'AirPods Pro 2 Test',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);
    }

    private function createOrder(string $status, ?int $techId): RepairOrder
    {
        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);

        return RepairOrder::create([
            'order_code'           => "FX{$year}-H{$randomNum}",
            'branch_id'            => $this->branch1->id,
            'customer_id'          => $this->customer->id,
            'device_model_id'      => $this->device->id,
            'technician_id'        => $techId,
            'tech_accepted_at'     => $techId ? now() : null,
            'status'               => $status,
            'issue_description'    => 'Test lỗi âm thanh rè',
            'initial_price'        => 350000,
            'total_price'          => 350000,
            'created_by_user_id'   => $this->tech1->id,
            'warranty_terms_days'  => 90,
        ]);
    }

    /**
     * 1. Test bàn giao đơn về hàng đợi chung (waiting_tech).
     */
    public function test_handover_order_to_common_queue(): void
    {
        $order = $this->createOrder('in_repair', $this->tech1->id);

        $response = $this->actingAs($this->tech1, 'sanctum')
            ->postJson("/api/v1/orders/{$order->id}/handover", [
                'target'         => 'queue',
                'reason_tag'     => 'wrong_order',
                'handover_notes' => 'Bấm nhầm dòng tai nghe, trả lại hàng đợi chung',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'waiting_tech')
            ->assertJsonPath('data.technician_id', null);

        $fresh = $order->fresh();
        $this->assertEquals('waiting_tech', $fresh->status);
        $this->assertNull($fresh->technician_id);
        $this->assertNull($fresh->tech_accepted_at);
        $this->assertStringContainsString('Bàn giao từ ' . $this->tech1->name, (string) $fresh->repair_note);

        $this->assertDatabaseHas('audit_logs', [
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => $order->id,
            'action'         => 'Bàn giao kỹ thuật',
        ]);

        $this->assertDatabaseHas('notifications', [
            'order_id' => $order->id,
            'type'     => 'order_handover',
        ]);
    }

    /**
     * 2. Test bàn giao đơn cho KTV khác cùng chi nhánh (assigned).
     */
    public function test_handover_order_to_peer_technician(): void
    {
        $order = $this->createOrder('assigned', $this->tech1->id);

        $response = $this->actingAs($this->tech1, 'sanctum')
            ->postJson("/api/v1/orders/{$order->id}/handover", [
                'target'         => 'technician',
                'technician_id'  => $this->tech2->id,
                'reason_tag'     => 'shift_change',
                'handover_notes' => 'Hết ca làm việc, chuyển giao cho đồng nghiệp B',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'assigned')
            ->assertJsonPath('data.technician_id', $this->tech2->id);

        $fresh = $order->fresh();
        $this->assertEquals('assigned', $fresh->status);
        $this->assertEquals($this->tech2->id, $fresh->technician_id);
        $this->assertNotNull($fresh->tech_accepted_at);
        $this->assertStringContainsString('Bàn giao từ ' . $this->tech1->name, (string) $fresh->repair_note);
    }

    /**
     * 3. Chặn KTV bàn giao đơn do người khác phụ trách (403).
     */
    public function test_technician_cannot_handover_other_technician_order(): void
    {
        $order = $this->createOrder('in_repair', $this->tech2->id);

        $response = $this->actingAs($this->tech1, 'sanctum')
            ->postJson("/api/v1/orders/{$order->id}/handover", [
                'target'     => 'queue',
                'reason_tag' => 'wrong_order',
            ]);

        $response->assertStatus(403)
            ->assertJsonPath('success', false);
    }

    /**
     * 4. Chặn bàn giao đơn đã hoàn tất hoặc không ở trạng thái active (422).
     */
    public function test_cannot_handover_order_in_invalid_status(): void
    {
        $order = $this->createOrder('ready_for_return', $this->tech1->id);

        $response = $this->actingAs($this->tech1, 'sanctum')
            ->postJson("/api/v1/orders/{$order->id}/handover", [
                'target'     => 'queue',
                'reason_tag' => 'wrong_order',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    /**
     * 5. Khi chọn reason_tag = complex_repair, ghi chú phải >= 3 ký tự (422).
     */
    public function test_complex_repair_requires_minimum_notes_length(): void
    {
        $order = $this->createOrder('in_repair', $this->tech1->id);

        $response = $this->actingAs($this->tech1, 'sanctum')
            ->postJson("/api/v1/orders/{$order->id}/handover", [
                'target'         => 'technician',
                'technician_id'  => $this->tech2->id,
                'reason_tag'     => 'complex_repair',
                'handover_notes' => 'hi',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    /**
     * 6. Chặn bàn giao cho chính bản thân (422).
     */
    public function test_cannot_handover_to_self(): void
    {
        $order = $this->createOrder('in_repair', $this->tech1->id);

        $response = $this->actingAs($this->tech1, 'sanctum')
            ->postJson("/api/v1/orders/{$order->id}/handover", [
                'target'        => 'technician',
                'technician_id' => $this->tech1->id,
                'reason_tag'    => 'missing_parts_tools',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    /**
     * 7. Chặn bàn giao cho KTV thuộc chi nhánh khác (422).
     */
    public function test_cannot_handover_to_technician_in_different_branch(): void
    {
        $order = $this->createOrder('in_repair', $this->tech1->id);

        $response = $this->actingAs($this->tech1, 'sanctum')
            ->postJson("/api/v1/orders/{$order->id}/handover", [
                'target'        => 'technician',
                'technician_id' => $this->techOtherBranch->id,
                'reason_tag'    => 'missing_parts_tools',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    /**
     * 8. Admin có quyền bàn giao bất kỳ đơn nào trong chi nhánh.
     */
    public function test_admin_can_handover_any_order_in_branch(): void
    {
        $order = $this->createOrder('in_repair', $this->tech1->id);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/v1/orders/{$order->id}/handover", [
                'target'         => 'technician',
                'technician_id'  => $this->tech2->id,
                'reason_tag'     => 'complex_repair',
                'handover_notes' => 'Điều phối thợ chuyên môn sửa vi mạch',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.technician_id', $this->tech2->id);
    }

    /**
     * 9. KTV truy cập GET /users chỉ nhận danh sách đồng nghiệp cùng chi nhánh và đang active.
     */
    public function test_technician_directory_scoped_to_same_branch(): void
    {
        $response = $this->actingAs($this->tech1, 'sanctum')
            ->getJson('/api/v1/users?role=technician');

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $userIds = collect($response->json('data.data'))->pluck('id')->all();
        $this->assertContains($this->tech1->id, $userIds);
        $this->assertContains($this->tech2->id, $userIds);
        $this->assertNotContains($this->techOtherBranch->id, $userIds);
    }
}
