<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\Supplier;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WorkShift;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class FieldLevelAuditTrailTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch1;
    protected Branch $branch2;
    protected User $adminUser;
    protected User $targetUser;
    protected Customer $customer;
    protected DeviceModel $device;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_aud_' . uniqid(),
            'name'   => 'Tiệm Kiểm Toán Field Level',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch1 = Branch::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh 1',
            'code'      => 'BR_AUD_1_' . uniqid(),
            'phone'     => '0901111111',
            'address'   => '101 Audit Street',
            'is_active' => true,
        ]);

        $this->branch2 = Branch::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh 2',
            'code'      => 'BR_AUD_2_' . uniqid(),
            'phone'     => '0902222222',
            'address'   => '202 Audit Street',
            'is_active' => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch1->id,
            'name'      => 'Quản Trị Viên Audit',
            'email'     => 'admin_aud_' . uniqid() . '@example.com',
            'phone'     => '098' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->targetUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch1->id,
            'name'      => 'KTV Nguyễn Văn A',
            'email'     => 'staff_target_' . uniqid() . '@example.com',
            'phone'     => '097' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->customer = Customer::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Audit',
            'phone'     => '090' . rand(1000000, 9999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro',
            'model_code' => 'A2084_' . uniqid(),
            'category'   => 'airpods',
        ]);
    }

    /**
     * Test 1: Sửa giá đơn hàng lưu vết old vs new values chi tiết.
     */
    public function test_audit_log_captures_field_diff_on_order_price_adjustment(): void
    {
        $order = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch1->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'order_type'         => 'in_store',
            'status'             => 'in_repair',
            'issue_description'  => 'Thay pin',
            'total_price'        => 500000,
            'initial_price'      => 500000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $res = $this->actingAs($this->adminUser)->putJson("/api/v1/orders/{$order->id}", [
            'total_price' => 400000,
            'price_note'  => 'Áp dụng khuyến mãi khách thân thiết',
        ]);
        $res->assertOk();

        $log = AuditLog::where('auditable_type', 'RepairOrder')
            ->where('auditable_id', $order->id)
            ->where('action', 'Sửa giá đơn hàng')
            ->latest('id')
            ->first();

        $this->assertNotNull($log, 'AuditLog for price adjustment must be created');
        $this->assertEquals(500000, (float) $log->old_values['total_price']);
        $this->assertEquals(400000, (float) $log->new_values['total_price']);
        $this->assertEquals(-100000, (float) ($log->metadata['difference'] ?? 0));
        $this->assertEquals('Áp dụng khuyến mãi khách thân thiết', $log->metadata['reason']);
    }

    /**
     * Test 2: Chốt ca lệch két lưu vết expected_cash, actual_cash và discrepancy.
     */
    public function test_audit_log_captures_cash_drawer_discrepancy_on_shift_close(): void
    {
        $shift = WorkShift::forceCreate([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch1->id,
            'cashier_id'      => $this->adminUser->id,
            'shift_code'      => 'SH-' . uniqid(),
            'status'          => 'open',
            'opened_at'       => now()->subHours(4),
            'opening_cash'    => 2000000,
            'system_cash_in'  => 0,
            'system_cash_out' => 0,
            'expected_cash'   => 2000000,
        ]);

        $res = $this->actingAs($this->adminUser)->postJson("/api/v1/shifts/{$shift->id}/close", [
            'actual_cash' => 1950000,
            'notes'       => 'Nhầm lẫn tiền thối cho khách đơn 001',
        ]);
        $res->assertOk();

        $log = AuditLog::where('action', 'Lệch két chốt ca')
            ->where('auditable_id', $shift->id)
            ->latest('id')
            ->first();

        $this->assertNotNull($log, 'AuditLog for shift discrepancy must exist');
        $this->assertEquals(2000000, (float) $log->old_values['expected_cash']);
        $this->assertEquals(1950000, (float) $log->new_values['actual_cash']);
        $this->assertEquals(-50000, (float) $log->new_values['discrepancy']);
        $this->assertEquals('Nhầm lẫn tiền thối cho khách đơn 001', $log->metadata['notes']);
    }

    /**
     * Test 3: Trả nợ nhà cung cấp lưu vết công nợ trước vs sau khi thanh toán.
     */
    public function test_audit_log_captures_supplier_debt_settlement(): void
    {
        $supplier = Supplier::forceCreate([
            'tenant_id'    => $this->tenant->id,
            'name'         => 'Nhà Cung Cấp Phụ Kiện A',
            'code'         => 'NCC-A-' . uniqid(),
            'phone'        => '0933333333',
            'debt_balance' => 12000000,
        ]);

        // Cần ca trực mở để trả tiền mặt
        WorkShift::forceCreate([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch1->id,
            'cashier_id'      => $this->adminUser->id,
            'shift_code'      => 'SH-' . uniqid(),
            'status'          => 'open',
            'opened_at'       => now()->subHours(2),
            'opening_cash'    => 15000000,
            'system_cash_in'  => 0,
            'system_cash_out' => 0,
            'expected_cash'   => 15000000,
        ]);

        $res = $this->actingAs($this->adminUser)->postJson("/api/v1/suppliers/{$supplier->id}/payments", [
            'amount'         => 5000000,
            'payment_method' => 'cash',
            'branch_id'      => $this->branch1->id,
            'notes'          => 'Thanh toán đợt 1',
        ]);
        $res->assertStatus(201);

        $log = AuditLog::where('action', 'Chi trả nợ NCC')
            ->where('auditable_id', $supplier->id)
            ->latest('id')
            ->first();

        $this->assertNotNull($log, 'AuditLog for supplier debt payment must exist');
        $this->assertEquals(12000000, (float) $log->old_values['debt_balance']);
        $this->assertEquals(7000000, (float) $log->new_values['debt_balance']);
        $this->assertEquals(5000000, (float) $log->metadata['amount_paid']);
        $this->assertEquals('cash', $log->metadata['payment_method']);
    }

    /**
     * Test 4: Thay đổi vai trò và phân quyền user lưu vết old vs new values.
     */
    public function test_audit_log_captures_user_role_and_permission_changes(): void
    {
        $res = $this->actingAs($this->adminUser)->putJson("/api/v1/users/{$this->targetUser->id}", [
            'role'      => 'admin',
            'branch_id' => $this->branch2->id,
        ]);
        $res->assertOk();

        $log = AuditLog::where('action', 'Thay đổi phân quyền')
            ->where('auditable_id', $this->targetUser->id)
            ->latest('id')
            ->first();

        $this->assertNotNull($log, 'AuditLog for permission change must exist');
        $this->assertEquals('technician', $log->old_values['role']);
        $this->assertEquals('admin', $log->new_values['role']);
        $this->assertEquals($this->branch1->id, $log->old_values['branch_id']);
        $this->assertEquals($this->branch2->id, $log->new_values['branch_id']);
    }

    /**
     * Test 5: API tra cứu nhật ký kiểm toán hỗ trợ lọc theo module, auditable_id và has_diff.
     */
    public function test_audit_log_api_filters_by_has_diff_and_auditable(): void
    {
        $order = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch1->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'order_type'         => 'in_store',
            'status'             => 'in_repair',
            'issue_description'  => 'Kiểm toán test',
            'total_price'        => 500000,
            'initial_price'      => 500000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $this->actingAs($this->adminUser)->putJson("/api/v1/orders/{$order->id}", [
            'total_price' => 350000,
        ]);

        // 1. Lọc theo auditable_type và auditable_id
        $res1 = $this->actingAs($this->adminUser)->getJson("/api/v1/audit-logs?auditable_type=RepairOrder&auditable_id={$order->id}");
        $res1->assertOk()
            ->assertJsonPath('success', true);
        $logs1 = $res1->json('data.data');
        $this->assertNotEmpty($logs1);
        $this->assertEquals('RepairOrder', $logs1[0]['auditable_type']);
        $this->assertEquals($order->id, $logs1[0]['auditable_id']);

        // 2. Lọc theo has_diff = true
        $resDiff = $this->actingAs($this->adminUser)->getJson('/api/v1/audit-logs?has_diff=true');
        $resDiff->assertOk();
        $diffLogs = $resDiff->json('data.data');
        foreach ($diffLogs as $l) {
            $hasValues = ! empty($l['old_values']) || ! empty($l['new_values']);
            $this->assertTrue($hasValues);
        }
    }
}
