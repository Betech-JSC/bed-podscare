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

class CustomerPaginationAndStaffKpiTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected DeviceModel $device;
    protected User $adminUser;
    protected User $cskhUser;
    protected User $techUser1;
    protected User $techUser2;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_cust_kpi_' . uniqid(),
            'name'   => 'PodsCare Customer & KPI Test Tenant',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Test Trung Tâm',
            'code'      => 'CN_' . strtoupper(uniqid()),
            'phone'     => '0901234567',
            'address'   => '123 Nguyễn Huệ, Q1, TP.HCM',
            'is_active' => true,
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro 2',
            'category'     => 'airpods',
            'model_code'   => 'A2931_' . uniqid(),
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Test User',
            'email'     => 'admin_ckpi_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cskhUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'CSKH Test User',
            'email'     => 'cskh_ckpi_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->techUser1 = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'KTV Nguyễn Văn A',
            'email'     => 'tech1_ckpi_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->techUser2 = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'KTV Trần Văn B',
            'email'     => 'tech2_ckpi_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);
    }

    /**
     * Test 1: GET /api/v1/customers hỗ trợ phân trang với per_page=25&page=2 trả về đúng metadata và số bản ghi.
     */
    public function test_customers_index_supports_custom_per_page_and_page_navigation(): void
    {
        for ($i = 1; $i <= 30; $i++) {
            Customer::create([
                'tenant_id'     => $this->tenant->id,
                'name'          => sprintf('Khách Hàng Phân Trang %02d', $i),
                'phone'         => sprintf('091%07d', 1000000 + $i),
                'customer_type' => 'retail',
            ]);
        }

        // Trang 1 với per_page=25
        $resPage1 = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/customers?per_page=25&page=1');

        $resPage1->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.per_page', 25)
            ->assertJsonPath('data.total', 30)
            ->assertJsonPath('data.last_page', 2)
            ->assertJsonPath('data.from', 1)
            ->assertJsonPath('data.to', 25);

        $this->assertCount(25, $resPage1->json('data.data'));

        // Trang 2 với per_page=25 (còn lại 5 bản ghi)
        $resPage2 = $this->actingAs($this->cskhUser, 'sanctum')
            ->getJson('/api/v1/customers?per_page=25&page=2');

        $resPage2->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonPath('data.per_page', 25)
            ->assertJsonPath('data.total', 30)
            ->assertJsonPath('data.last_page', 2)
            ->assertJsonPath('data.from', 26)
            ->assertJsonPath('data.to', 30);

        $this->assertCount(5, $resPage2->json('data.data'));
    }

    /**
     * Test 2: GET /api/v1/customers?all=true và per_page=all trả về toàn bộ khách hàng (> 15 bản ghi) trong 1 trang.
     */
    public function test_customers_index_supports_all_flag_and_per_page_all(): void
    {
        for ($i = 1; $i <= 22; $i++) {
            Customer::create([
                'tenant_id'     => $this->tenant->id,
                'name'          => sprintf('Khách Hàng Toàn Bộ %02d', $i),
                'phone'         => sprintf('092%07d', 2000000 + $i),
                'customer_type' => $i % 2 === 0 ? 'vip' : 'retail',
            ]);
        }

        // Kiểm tra ?all=true
        $resAll = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/customers?all=true');

        $resAll->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.last_page', 1)
            ->assertJsonPath('data.total', 22)
            ->assertJsonPath('data.from', 1)
            ->assertJsonPath('data.to', 22);

        $itemsAll = $resAll->json('data.data');
        $this->assertCount(22, $itemsAll);
        // Sắp xếp mới nhất trước (id giảm dần)
        $this->assertGreaterThan($itemsAll[1]['id'], $itemsAll[0]['id']);

        // Kiểm tra ?per_page=all bởi CSKH
        $resPerPageAll = $this->actingAs($this->cskhUser, 'sanctum')
            ->getJson('/api/v1/customers?per_page=all');

        $resPerPageAll->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.last_page', 1)
            ->assertJsonPath('data.total', 22);

        $this->assertCount(22, $resPerPageAll->json('data.data'));
    }

    /**
     * Test 3: Tenant isolation khi gọi GET /api/v1/customers?all=true.
     */
    public function test_customers_index_all_enforces_tenant_isolation(): void
    {
        // Tạo 18 khách hàng thuộc tenant hiện tại
        for ($i = 1; $i <= 18; $i++) {
            Customer::create([
                'tenant_id' => $this->tenant->id,
                'name'      => "Khách Tenant A #{$i}",
                'phone'     => sprintf('093%07d', 3000000 + $i),
            ]);
        }

        // Tạo 6 khách hàng thuộc tenant khác
        $otherTenant = Tenant::create([
            'code'   => 'other_tenant_' . uniqid(),
            'name'   => 'Tiệm Khác Tenant B',
            'status' => 'active',
            'plan'   => 'basic',
        ]);

        for ($j = 1; $j <= 6; $j++) {
            Customer::withoutGlobalScopes()->create([
                'tenant_id' => $otherTenant->id,
                'name'      => "Khách Tenant B #{$j}",
                'phone'     => sprintf('094%07d', 4000000 + $j),
            ]);
        }

        $response = $this->actingAs($this->cskhUser, 'sanctum')
            ->getJson('/api/v1/customers?all=true');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.total', 18);

        $returnedTenantIds = collect($response->json('data.data'))
            ->pluck('tenant_id')
            ->unique()
            ->values()
            ->all();

        $this->assertEquals([$this->tenant->id], $returnedTenantIds);
    }

    /**
     * Test 4: GET /api/v1/kpi/staff trả về warranty_count, warranty_rate và warranty_rate_formatted
     * trong từng phần tử staff/technicians và trong summary.
     */
    public function test_staff_kpi_returns_warranty_rate_for_technicians_and_summary(): void
    {
        $customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Sửa Tai Nghe',
            'phone'     => '097' . rand(1000000, 9999999),
        ]);

        // Tech 1: 4 đơn completed + 1 đơn rework_needed => warranty_rate = 1/4 = 25.0%
        for ($i = 1; $i <= 4; $i++) {
            RepairOrder::create([
                'tenant_id'          => $this->tenant->id,
                'branch_id'          => $this->branch->id,
                'customer_id'        => $customer->id,
                'device_model_id'    => $this->device->id,
                'order_code'         => 'FX26-T1C-' . uniqid() . '-' . $i,
                'issue_description'  => 'Thay pin AirPods',
                'status'             => 'completed',
                'order_type'         => 'in_store',
                'total_price'        => 300000,
                'created_by_user_id' => $this->cskhUser->id,
                'technician_id'      => $this->techUser1->id,
            ]);
        }

        RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-T1R-' . uniqid(),
            'issue_description'  => 'Sửa lại rè loa phải',
            'status'             => 'rework_needed',
            'order_type'         => 'in_store',
            'total_price'        => 0,
            'created_by_user_id' => $this->cskhUser->id,
            'technician_id'      => $this->techUser1->id,
        ]);

        // Tech 2: 2 đơn completed + 1 đơn bảo hành (order_type = warranty) => warranty_rate = 1/2 = 50.0%
        for ($i = 1; $i <= 2; $i++) {
            RepairOrder::create([
                'tenant_id'          => $this->tenant->id,
                'branch_id'          => $this->branch->id,
                'customer_id'        => $customer->id,
                'device_model_id'    => $this->device->id,
                'order_code'         => 'FX26-T2C-' . uniqid() . '-' . $i,
                'issue_description'  => 'Vệ sinh & thay màng loa',
                'status'             => 'completed',
                'order_type'         => 'in_store',
                'total_price'        => 250000,
                'created_by_user_id' => $this->cskhUser->id,
                'technician_id'      => $this->techUser2->id,
            ]);
        }

        RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-T2W-' . uniqid(),
            'issue_description'  => 'Bảo hành mic thu âm',
            'status'             => 'in_repair',
            'order_type'         => 'warranty',
            'total_price'        => 0,
            'created_by_user_id' => $this->cskhUser->id,
            'technician_id'      => $this->techUser2->id,
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/staff?branch_id={$this->branch->id}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $technicians = collect($response->json('data.technicians'));
        $tech1Stat = $technicians->firstWhere('id', $this->techUser1->id);
        $tech2Stat = $technicians->firstWhere('id', $this->techUser2->id);

        $this->assertNotNull($tech1Stat);
        $this->assertEquals(1, $tech1Stat['warranty_count']);
        $this->assertEquals(25.0, (float) $tech1Stat['warranty_rate']);
        $this->assertEquals('25%', $tech1Stat['warranty_rate_formatted']);

        $this->assertNotNull($tech2Stat);
        $this->assertEquals(1, $tech2Stat['warranty_count']);
        $this->assertEquals(50.0, (float) $tech2Stat['warranty_rate']);
        $this->assertEquals('50%', $tech2Stat['warranty_rate_formatted']);

        // Kiểm tra trong mảng staff trả về đồng nhất
        $staffList = collect($response->json('data.staff'));
        $staffTech1 = $staffList->firstWhere('id', $this->techUser1->id);
        $this->assertNotNull($staffTech1);
        $this->assertArrayHasKey('warranty_rate', $staffTech1);
        $this->assertArrayHasKey('warranty_rate_formatted', $staffTech1);
        $this->assertEquals(25.0, (float) $staffTech1['warranty_rate']);

        // Kiểm tra trong khối summary: tổng completed = 6, tổng warranty/rework = 2 => 33.3%
        $summary = $response->json('data.summary');
        $this->assertArrayHasKey('warranty_rate', $summary);
        $this->assertArrayHasKey('warranty_rate_formatted', $summary);
        $this->assertEquals(2, $summary['warranty_count']);
        $this->assertEquals(33.3, (float) $summary['warranty_rate']);
        $this->assertEquals('33.3%', $summary['warranty_rate_formatted']);
    }
}
