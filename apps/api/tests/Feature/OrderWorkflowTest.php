<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OrderWorkflowTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $adminUser;
    protected User $cskhUser;
    protected User $techUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_owf_' . uniqid(),
            'name'   => 'Tiệm Sửa Chữa Workflow',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Workflow',
            'code'      => 'BR_OWF_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Workflow Street',
            'is_active' => true,
        ]);

        $this->customer = Customer::forceCreate([
            'tenant_id'    => $this->tenant->id,
            'name'         => 'Khách Hàng Workflow',
            'phone'        => '091' . random_int(1000000, 9999999),
            'orders_count' => 0,
            'total_spent'  => 0,
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Workflow',
            'email'     => 'admin_owf_' . uniqid() . '@example.com',
            'phone'     => '098' . random_int(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cskhUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'CSKH Workflow',
            'email'     => 'cskh_owf_' . uniqid() . '@example.com',
            'phone'     => '097' . random_int(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->techUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'KTV Workflow',
            'email'     => 'tech_owf_' . uniqid() . '@example.com',
            'phone'     => '096' . random_int(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'technician',
            'is_active' => true,
        ]);
    }

    protected function createOrderInStatus(string $status, ?int $techId = null, string $orderType = 'in_store'): RepairOrder
    {
        return RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . random_int(10000, 99999),
            'order_type'         => $orderType,
            'status'             => $status,
            'technician_id'      => $techId,
            'issue_description'  => 'Kiểm tra âm thanh và pin',
            'total_price'        => $orderType === 'warranty' ? 0 : 400000,
            'initial_price'      => $orderType === 'warranty' ? 0 : 400000,
            'warranty_terms_days'=> 90,
            'created_by_user_id' => $this->cskhUser->id,
        ]);
    }

    /**
     * Test 1: Cho phép chuyển thẳng sang ready_for_return từ cả 5 trạng thái kỹ thuật (waiting_tech, assigned, in_repair, waiting_parts, rework_needed).
     */
    public function test_transitions_from_all_five_technical_statuses_to_ready_for_return_succeed(): void
    {
        $statuses = ['waiting_tech', 'assigned', 'in_repair', 'waiting_parts', 'rework_needed'];

        foreach ($statuses as $status) {
            $order = $this->createOrderInStatus($status);

            $res = $this->actingAs($this->cskhUser, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
                'status'             => 'ready_for_return',
                'technician_id'      => $this->techUser->id,
                'repair_note'        => "Nghiệm thu hoàn thành từ trạng thái {$status}",
                'parts_used'         => 'Pin tai nghe trái',
                'final_check_result' => 'Đã test nghe nhạc 30 phút đạt chuẩn',
            ]);

            $res->assertStatus(200)
                ->assertJsonPath('success', true)
                ->assertJsonPath('data.status', 'ready_for_return')
                ->assertJsonPath('data.technician_id', $this->techUser->id)
                ->assertJsonPath('data.final_check_result', 'Đã test nghe nhạc 30 phút đạt chuẩn');

            $fresh = $order->fresh();
            $this->assertEquals('ready_for_return', $fresh->status);
            $this->assertEquals($this->techUser->id, $fresh->technician_id);
            $this->assertEquals("Nghiệm thu hoàn thành từ trạng thái {$status}", $fresh->repair_note);
            $this->assertEquals('Pin tai nghe trái', $fresh->parts_used_summary);
            $this->assertEquals('Đã test nghe nhạc 30 phút đạt chuẩn', $fresh->final_check_result);
            $this->assertNotNull($fresh->repair_started_at);
            $this->assertNotNull($fresh->repair_completed_at);
            $this->assertNotNull($fresh->qc_passed_at);

            $this->assertDatabaseHas('qc_inspections', [
                'repair_order_id' => $order->id,
                'result'          => 'pass',
            ]);
        }
    }

    /**
     * Test 2: Chặn (422) khi CSKH hoặc Admin bấm Hoàn thành sửa chữa cho đơn chưa có KTV phụ trách mà không chọn technician_id, hoặc chọn ID của CSKH.
     */
    public function test_cskh_and_admin_cannot_complete_unassigned_order_without_valid_technician_id(): void
    {
        $order = $this->createOrderInStatus('waiting_tech', null);

        // 1. CSKH không truyền technician_id -> 422
        $resNoTech = $this->actingAs($this->cskhUser, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status'      => 'ready_for_return',
            'repair_note' => 'Hoàn thành nhanh tại quầy',
        ]);

        $resNoTech->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Vui lòng chọn kỹ thuật viên thực hiện trước khi hoàn thành sửa chữa.');

        // 2. CSKH truyền chính ID của CSKH vào technician_id -> 422
        $resInvalidRole = $this->actingAs($this->cskhUser, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status'        => 'ready_for_return',
            'technician_id' => $this->cskhUser->id,
            'repair_note'   => 'Hoàn thành nhanh tại quầy',
        ]);

        $resInvalidRole->assertStatus(422)
            ->assertJsonPath('success', false);

        $this->assertEquals('waiting_tech', $order->fresh()->status);
        $this->assertNull($order->fresh()->technician_id);
    }

    /**
     * Test 3: Khi đơn đã có technician_id, CSKH hoàn thành sửa chữa sẽ giữ nguyên technician_id của KTV (tuyệt đối không ghi đè bằng ID của CSKH).
     */
    public function test_cskh_completing_assigned_order_preserves_existing_technician_id(): void
    {
        $order = $this->createOrderInStatus('in_repair', $this->techUser->id);

        $res = $this->actingAs($this->cskhUser, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status'             => 'ready_for_return',
            'repair_note'        => 'KTV báo đã sửa xong, CSKH xác nhận trên hệ thống',
            'parts_used'         => 'IC nguồn Dock sạc',
            'final_check_result' => 'Dòng sạc ổn định',
        ]);

        $res->assertStatus(200)
            ->assertJsonPath('data.status', 'ready_for_return')
            ->assertJsonPath('data.technician_id', $this->techUser->id);

        $this->assertEquals($this->techUser->id, $order->fresh()->technician_id);
        $this->assertNotEquals($this->cskhUser->id, $order->fresh()->technician_id);
    }
}
