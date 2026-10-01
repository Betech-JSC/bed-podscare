<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class TenantIsolationTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected User $userTenantA;
    protected User $userTenantB;
    protected User $superAdmin;
    protected Branch $branchA;
    protected Branch $branchB;
    protected Customer $customerA;
    protected Customer $customerB;
    protected DeviceModel $deviceModel;
    protected RepairOrder $orderA;
    protected RepairOrder $orderB;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Tạo 2 tenant độc lập
        $this->tenantA = Tenant::create([
            'code'   => 'tenant-a-' . uniqid(),
            'name'   => 'Cửa hàng Sửa chữa A',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->tenantB = Tenant::create([
            'code'   => 'tenant-b-' . uniqid(),
            'name'   => 'Cửa hàng Sửa chữa B',
            'status' => 'active',
            'plan'   => 'standard',
        ]);

        // 2. Chi nhánh của từng tenant
        $this->branchA = Branch::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh A',
            'code'      => 'BR_A_' . uniqid(),
            'phone'     => '0901111111',
            'address'   => 'Quận 1, TP.HCM',
            'is_active' => true,
        ]);

        $this->branchB = Branch::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Chi nhánh B',
            'code'      => 'BR_B_' . uniqid(),
            'phone'     => '0902222222',
            'address'   => 'Quận Cầu Giấy, Hà Nội',
            'is_active' => true,
        ]);

        // 3. User của từng tenant
        $this->userTenantA = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'Admin Tiệm A',
            'email'     => 'admin_a_' . uniqid() . '@tiema.vn',
            'phone'     => '0911000001',
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->userTenantB = User::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'branch_id' => $this->branchB->id,
            'name'      => 'Admin Tiệm B',
            'email'     => 'admin_b_' . uniqid() . '@tiemb.vn',
            'phone'     => '0912000002',
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        // 4. Super Admin nền tảng
        $this->superAdmin = User::forceCreate([
            'tenant_id' => null,
            'name'      => 'Super Admin',
            'email'     => 'superadmin_' . uniqid() . '@fixo.com.vn',
            'phone'     => '0900999999',
            'password'  => Hash::make('password123'),
            'role'      => 'super_admin',
            'is_active' => true,
        ]);

        // 5. Khách hàng
        $this->customerA = Customer::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Khách hàng A',
            'phone'     => '0981' . rand(100000, 999999),
        ]);

        $this->customerB = Customer::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Khách hàng B',
            'phone'     => '0982' . rand(100000, 999999),
        ]);

        $this->deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2931_' . uniqid(),
        ]);

        // 6. Đơn sửa chữa
        $this->orderA = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA->id,
            'customer_id'        => $this->customerA->id,
            'device_model_id'    => $this->deviceModel->id,
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'issue_description'  => 'Pin chai, tụt nhanh bên trái',
            'status'             => 'inspecting',
            'created_by_user_id' => $this->userTenantA->id,
        ]);

        $this->orderB = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenantB->id,
            'branch_id'          => $this->branchB->id,
            'customer_id'        => $this->customerB->id,
            'device_model_id'    => $this->deviceModel->id,
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'issue_description'  => 'Hỏng mic, rè loa bên phải',
            'status'             => 'inspecting',
            'created_by_user_id' => $this->userTenantB->id,
        ]);
    }

    public function test_tenant_a_queries_only_see_own_orders_branches_customers(): void
    {
        $this->actingAs($this->userTenantA);

        $orders = RepairOrder::all();
        $this->assertTrue($orders->contains('id', $this->orderA->id));
        $this->assertFalse($orders->contains('id', $this->orderB->id));

        $branches = Branch::all();
        $this->assertTrue($branches->contains('id', $this->branchA->id));
        $this->assertFalse($branches->contains('id', $this->branchB->id));

        $customers = Customer::all();
        $this->assertTrue($customers->contains('id', $this->customerA->id));
        $this->assertFalse($customers->contains('id', $this->customerB->id));
    }

    public function test_tenant_b_queries_only_see_own_orders_branches_customers(): void
    {
        $this->actingAs($this->userTenantB);

        $orders = RepairOrder::all();
        $this->assertFalse($orders->contains('id', $this->orderA->id));
        $this->assertTrue($orders->contains('id', $this->orderB->id));

        $branches = Branch::all();
        $this->assertFalse($branches->contains('id', $this->branchA->id));
        $this->assertTrue($branches->contains('id', $this->branchB->id));

        $customers = Customer::all();
        $this->assertFalse($customers->contains('id', $this->customerA->id));
        $this->assertTrue($customers->contains('id', $this->customerB->id));
    }

    public function test_tenant_a_cannot_view_or_update_tenant_b_order(): void
    {
        $response = $this->actingAs($this->userTenantA)
            ->getJson("/api/v1/orders/{$this->orderB->id}");

        $response->assertStatus(404);

        $updateResponse = $this->actingAs($this->userTenantA)
            ->putJson("/api/v1/orders/{$this->orderB->id}", [
                'issue_description' => 'Hacker update',
            ]);

        $updateResponse->assertStatus(404);

        // Kiểm tra truy cập chéo bằng chuỗi order_code
        $byCodeResponse = $this->actingAs($this->userTenantA)
            ->getJson("/api/v1/orders/{$this->orderB->order_code}");

        $byCodeResponse->assertStatus(404);
    }

    public function test_creating_record_auto_assigns_authenticated_tenant_id(): void
    {
        $this->actingAs($this->userTenantA);

        $newOrder = RepairOrder::create([
            'created_by_user_id' => $this->userTenantA->id,
            'branch_id'          => $this->branchA->id,
            'customer_id'        => $this->customerA->id,
            'device_model_id'    => $this->deviceModel->id,
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'issue_description'  => 'Mất bluetooth một bên tai',
            'status'             => 'received',
        ]);

        $this->assertEquals($this->tenantA->id, $newOrder->tenant_id);
    }

    public function test_super_admin_bypasses_tenant_scope_and_sees_all_records(): void
    {
        $this->actingAs($this->superAdmin);

        $orders = RepairOrder::all();
        $this->assertTrue($orders->contains('id', $this->orderA->id));
        $this->assertTrue($orders->contains('id', $this->orderB->id));
    }
}
