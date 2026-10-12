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

class StaffPerformanceKpiTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch1;
    protected Branch $branch2;
    protected User $adminUser;
    protected User $managerUser;
    protected User $technician1;
    protected User $technician2;
    protected User $cskhUser;
    protected Customer $customer;
    protected DeviceModel $device;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_staff_kpi_' . uniqid(),
            'name'   => 'PodsCare Staff KPI Tenant',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch1 = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Quận 1 Staff Test',
            'code'      => 'Q1_' . strtoupper(uniqid()),
            'phone'     => '0901234111',
            'address'   => '123 Nguyễn Huệ, Q1',
            'is_active' => true,
        ]);

        $this->branch2 = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Thủ Đức Staff Test',
            'code'      => 'TD_' . strtoupper(uniqid()),
            'phone'     => '0901234222',
            'address'   => '456 Võ Văn Ngân, Thủ Đức',
            'is_active' => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch1->id,
            'name'      => 'Admin Staff KPI Tester',
            'email'     => 'admin_staff_' . uniqid() . '@example.com',
            'password'  => Hash::make('secret123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->managerUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch1->id,
            'name'      => 'Manager Staff KPI Tester',
            'email'     => 'manager_staff_' . uniqid() . '@example.com',
            'password'  => Hash::make('secret123'),
            'role'      => 'manager',
            'is_active' => true,
        ]);

        $this->technician1 = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch1->id,
            'name'      => 'Tech 1 Q1',
            'email'     => 'tech1_' . uniqid() . '@example.com',
            'password'  => Hash::make('secret123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->technician2 = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch2->id,
            'name'      => 'Tech 2 TD',
            'email'     => 'tech2_' . uniqid() . '@example.com',
            'password'  => Hash::make('secret123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->cskhUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch1->id,
            'name'      => 'CSKH Lan Anh',
            'email'     => 'cskh_' . uniqid() . '@example.com',
            'password'  => Hash::make('secret123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Test KPI',
            'phone'     => '0988' . rand(100000, 999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro 2',
            'category'     => 'AirPods',
            'model_code'   => 'A2931',
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);
    }

    /**
     * Helper tạo đơn hàng sửa chữa.
     */
    protected function createOrder(array $attributes): RepairOrder
    {
        return RepairOrder::create(array_merge([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch1->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'created_by_user_id' => $this->adminUser->id,
            'order_code'         => 'RO-' . strtoupper(uniqid()),
            'status'             => 'in_repair',
            'issue_description'  => 'Mất kết nối bluetooth bên phải',
            'total_price'        => 500000,
        ], $attributes));
    }

    /**
     * 1. Admin truy vấn KPI KTV: tính đúng revenue_generated và revenue_generated_formatted.
     */
    public function test_admin_can_view_technician_metrics_with_revenue_generated(): void
    {
        // Tạo 1 đơn completed 700.000đ và 1 đơn in_repair 300.000đ cho Tech 1
        $this->createOrder([
            'branch_id'     => $this->branch1->id,
            'technician_id' => $this->technician1->id,
            'status'        => 'completed',
            'total_price'   => 700000,
        ]);

        $this->createOrder([
            'branch_id'     => $this->branch1->id,
            'technician_id' => $this->technician1->id,
            'status'        => 'in_repair',
            'total_price'   => 300000,
        ]);

        $response = $this->actingAs($this->adminUser)
            ->getJson('/api/v1/kpi/staff?branch_id=' . $this->branch1->id);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $staffList = collect($response->json('data.staff'));
        $techStat = $staffList->firstWhere('id', $this->technician1->id);

        $this->assertNotNull($techStat);
        $this->assertEquals(2, $techStat['total_orders']);
        $this->assertEquals(1, $techStat['completed']);
        $this->assertEquals(700000, $techStat['revenue_generated']);
        $this->assertEquals('700.000 ₫', $techStat['revenue_generated_formatted']);
    }

    /**
     * 2. Manager truy vấn KPI KTV: có quyền xem revenue_generated.
     */
    public function test_manager_can_view_revenue_generated(): void
    {
        $this->createOrder([
            'branch_id'     => $this->branch1->id,
            'technician_id' => $this->technician1->id,
            'status'        => 'completed',
            'total_price'   => 450000,
        ]);

        $response = $this->actingAs($this->managerUser)
            ->getJson('/api/v1/kpi/staff');

        $response->assertStatus(200);

        $staffList = collect($response->json('data.staff'));
        $techStat = $staffList->firstWhere('id', $this->technician1->id);

        $this->assertNotNull($techStat);
        $this->assertEquals(450000, $techStat['revenue_generated']);
        $this->assertEquals('450.000 ₫', $techStat['revenue_generated_formatted']);
    }

    /**
     * 3. RBAC Masking: Technician truy vấn KPI staff thì revenue_generated phải là null.
     */
    public function test_technician_cannot_view_financial_revenue_due_to_rbac_masking(): void
    {
        $this->createOrder([
            'branch_id'     => $this->branch1->id,
            'technician_id' => $this->technician1->id,
            'status'        => 'completed',
            'total_price'   => 1200000,
        ]);

        $response = $this->actingAs($this->technician1)
            ->getJson('/api/v1/kpi/staff');

        $response->assertStatus(200);

        $staffList = collect($response->json('data.staff'));
        $techStat = $staffList->firstWhere('id', $this->technician1->id);

        $this->assertNotNull($techStat);
        $this->assertNull($techStat['revenue_generated'], 'revenue_generated must be null for technician');
        $this->assertNull($techStat['revenue_generated_formatted'], 'revenue_generated_formatted must be null for technician');
    }

    /**
     * 4. Thống kê năng suất nhân viên CSKH (role = 'cskh'):
     * Tính orders_created_count, orders_completed_count, conversion_rate, revenue_generated.
     */
    public function test_can_query_cskh_intake_metrics_via_created_by_user_id(): void
    {
        // CSKH tạo 3 đơn: 2 completed (200.000đ + 400.000đ) và 1 in_repair (150.000đ)
        $this->createOrder([
            'branch_id'          => $this->branch1->id,
            'created_by_user_id' => $this->cskhUser->id,
            'status'             => 'completed',
            'total_price'        => 200000,
        ]);

        $this->createOrder([
            'branch_id'          => $this->branch1->id,
            'created_by_user_id' => $this->cskhUser->id,
            'status'             => 'completed',
            'total_price'        => 400000,
        ]);

        $this->createOrder([
            'branch_id'          => $this->branch1->id,
            'created_by_user_id' => $this->cskhUser->id,
            'status'             => 'in_repair',
            'total_price'        => 150000,
        ]);

        $response = $this->actingAs($this->adminUser)
            ->getJson('/api/v1/kpi/staff?role=cskh&branch_id=' . $this->branch1->id);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $cskhList = collect($response->json('data.staff'));
        $cskhStat = $cskhList->firstWhere('id', $this->cskhUser->id);

        $this->assertNotNull($cskhStat);
        $this->assertEquals(3, $cskhStat['orders_created_count']);
        $this->assertEquals(2, $cskhStat['orders_completed_count']);
        // Tỉ lệ chốt: 2 / 3 * 100 = 66.7%
        $this->assertEquals(66.7, $cskhStat['conversion_rate']);
        $this->assertEquals(600000, $cskhStat['revenue_generated']);
        $this->assertEquals('600.000 ₫', $cskhStat['revenue_generated_formatted']);
    }

    /**
     * 5. RBAC Masking cho CSKH khi xem bởi Technician.
     */
    public function test_cskh_revenue_is_masked_when_viewed_by_technician(): void
    {
        $this->createOrder([
            'branch_id'          => $this->branch1->id,
            'created_by_user_id' => $this->cskhUser->id,
            'status'             => 'completed',
            'total_price'        => 800000,
        ]);

        $response = $this->actingAs($this->technician1)
            ->getJson('/api/v1/kpi/staff?role=cskh');

        $response->assertStatus(200);

        $cskhList = collect($response->json('data.staff'));
        $cskhStat = $cskhList->firstWhere('id', $this->cskhUser->id);

        $this->assertNotNull($cskhStat);
        $this->assertNull($cskhStat['revenue_generated']);
        $this->assertNull($cskhStat['revenue_generated_formatted']);
    }

    /**
     * 6. Phân lập dữ liệu theo chi nhánh (branch_id filter).
     */
    public function test_staff_kpi_query_isolated_by_branch(): void
    {
        $this->createOrder([
            'branch_id'     => $this->branch1->id,
            'technician_id' => $this->technician1->id,
            'status'        => 'completed',
            'total_price'   => 500000,
        ]);

        $this->createOrder([
            'branch_id'     => $this->branch2->id,
            'technician_id' => $this->technician2->id,
            'status'        => 'completed',
            'total_price'   => 900000,
        ]);

        // Lọc theo branch 1
        $response1 = $this->actingAs($this->adminUser)
            ->getJson('/api/v1/kpi/staff?branch_id=' . $this->branch1->id);

        $staffList1 = collect($response1->json('data.staff'));
        $this->assertTrue($staffList1->contains('id', $this->technician1->id));
        $this->assertFalse($staffList1->contains('id', $this->technician2->id));

        // Lọc theo branch 2
        $response2 = $this->actingAs($this->adminUser)
            ->getJson('/api/v1/kpi/staff?branch_id=' . $this->branch2->id);

        $staffList2 = collect($response2->json('data.staff'));
        $this->assertFalse($staffList2->contains('id', $this->technician1->id));
        $this->assertTrue($staffList2->contains('id', $this->technician2->id));
    }
}
