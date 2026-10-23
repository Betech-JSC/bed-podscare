<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WarrantyPaginationAndSummaryTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected Branch $branchA1;
    protected Branch $branchA2;
    protected Branch $branchB1;
    protected DeviceModel $devicePro2;
    protected DeviceModel $deviceMax;
    protected User $adminTenantA;
    protected User $cskhBranchA1;
    protected User $cskhBranchA2;
    protected User $adminTenantB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenantA = Tenant::create([
            'code'   => 'tenant_wps_a_' . uniqid(),
            'name'   => 'PodsCare Store A',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->tenantB = Tenant::create([
            'code'   => 'tenant_wps_b_' . uniqid(),
            'name'   => 'PodsCare Store B',
            'status' => 'active',
            'plan'   => 'basic',
        ]);

        $this->branchA1 = Branch::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'BR_A1_' . uniqid(),
            'phone'     => '0901111222',
            'address'   => '101 Nguyễn Huệ, Q1',
            'is_active' => true,
        ]);

        $this->branchA2 = Branch::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Quận 3',
            'code'      => 'BR_A2_' . uniqid(),
            'phone'     => '0901111333',
            'address'   => '202 Võ Văn Tần, Q3',
            'is_active' => true,
        ]);

        $this->branchB1 = Branch::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Chi nhánh Store B',
            'code'      => 'BR_B1_' . uniqid(),
            'phone'     => '0902222333',
            'address'   => '303 Cầu Giấy, HN',
            'is_active' => true,
        ]);

        $this->devicePro2 = DeviceModel::create([
            'name'       => 'AirPods Pro 2 USB-C ' . uniqid(),
            'model_code' => 'A3048_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->deviceMax = DeviceModel::create([
            'name'       => 'AirPods Max Lightning ' . uniqid(),
            'model_code' => 'A2096_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->adminTenantA = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'Admin Store A',
            'email'     => 'admin_a_' . uniqid() . '@podscare.vn',
            'phone'     => '098' . random_int(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cskhBranchA1 = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'CSKH Quận 1',
            'email'     => 'cskh_a1_' . uniqid() . '@podscare.vn',
            'phone'     => '097' . random_int(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->cskhBranchA2 = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA2->id,
            'name'      => 'CSKH Quận 3',
            'email'     => 'cskh_a2_' . uniqid() . '@podscare.vn',
            'phone'     => '096' . random_int(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->adminTenantB = User::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'branch_id' => $this->branchB1->id,
            'name'      => 'Admin Store B',
            'email'     => 'admin_b_' . uniqid() . '@podscare.vn',
            'phone'     => '095' . random_int(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);
    }

    /**
     * Helper tạo nhanh đơn sửa chữa kèm sổ bảo hành điện tử.
     */
    protected function createOrderAndWarranty(array $overrides = []): array
    {
        $tenantId = $overrides['tenant_id'] ?? $this->tenantA->id;
        $branchId = $overrides['branch_id'] ?? $this->branchA1->id;
        $deviceModelId = $overrides['device_model_id'] ?? $this->devicePro2->id;

        $customer = $overrides['customer'] ?? Customer::withoutGlobalScopes()->forceCreate([
            'tenant_id'    => $tenantId,
            'name'         => $overrides['customer_name'] ?? ('Khách BH ' . uniqid()),
            'phone'        => $overrides['customer_phone'] ?? ('091' . random_int(1000000, 9999999)),
            'orders_count' => 1,
            'total_spent'  => 450000,
        ]);

        $order = RepairOrder::withoutGlobalScopes()->forceCreate([
            'tenant_id'          => $tenantId,
            'branch_id'          => $branchId,
            'customer_id'        => $customer->id,
            'device_model_id'    => $deviceModelId,
            'order_code'         => $overrides['order_code'] ?? ('RO-WPS-' . strtoupper(uniqid())),
            'order_type'         => 'in_store',
            'status'             => 'completed',
            'issue_description'  => $overrides['issue_description'] ?? 'Thay pin AirPods',
            'serial_number'      => $overrides['serial_number'] ?? ('SN-' . strtoupper(uniqid())),
            'total_price'        => 450000,
            'initial_price'      => 450000,
            'created_by_user_id' => $this->adminTenantA->id,
        ]);

        $warranty = Warranty::withoutGlobalScopes()->forceCreate([
            'warranty_code'   => $overrides['warranty_code'] ?? ('WR-WPS-' . strtoupper(uniqid())),
            'repair_order_id' => $order->id,
            'customer_id'     => $customer->id,
            'device_model_id' => $deviceModelId,
            'coverage_item'   => $overrides['coverage_item'] ?? 'Bảo hành pin 90 ngày',
            'duration_days'   => $overrides['duration_days'] ?? 90,
            'start_date'      => $overrides['start_date'] ?? now()->subDays(10)->toDateString(),
            'end_date'        => $overrides['end_date'] ?? now()->addDays(80)->toDateString(),
            'status'          => $overrides['status'] ?? 'active',
            'revoked_at'      => $overrides['revoked_at'] ?? null,
            'revoked_reason'  => $overrides['revoked_reason'] ?? null,
        ]);

        return [$customer, $order, $warranty];
    }

    /**
     * Test 1: GET /api/v1/warranties hỗ trợ phân trang page=1&per_page=15, page=2&per_page=15, page=2&per_page=30
     * và trả về đối tượng summary phản ánh đúng tổng thực tế trên toàn bộ 65 sổ bảo hành (không bị cắt theo per_page).
     */
    public function test_warranties_index_paginates_beyond_50_and_returns_accurate_global_summary(): void
    {
        // Tạo 35 sổ active còn hạn dài (80 ngày)
        for ($i = 1; $i <= 35; $i++) {
            $this->createOrderAndWarranty([
                'status'   => 'active',
                'end_date' => now()->addDays(60)->toDateString(),
            ]);
        }

        // Tạo 5 sổ active sắp hết hạn trong vòng 7 ngày tới (4 ngày)
        for ($i = 1; $i <= 5; $i++) {
            $this->createOrderAndWarranty([
                'status'   => 'active',
                'end_date' => now()->addDays(4)->toDateString(),
            ]);
        }

        // Tạo 15 sổ đã hết hạn (end_date quá khứ)
        for ($i = 1; $i <= 15; $i++) {
            $this->createOrderAndWarranty([
                'status'   => 'expired',
                'end_date' => now()->subDays(10)->toDateString(),
            ]);
        }

        // Tạo 10 sổ đã bị thu hồi (revoked) dù end_date vẫn ở tương lai
        for ($i = 1; $i <= 10; $i++) {
            $this->createOrderAndWarranty([
                'status'         => 'revoked',
                'end_date'       => now()->addDays(45)->toDateString(),
                'revoked_at'     => now(),
                'revoked_reason' => 'Hoàn tiền đơn hàng',
            ]);
        }

        // Tổng = 65, active = 40 (35 + 5), expiring_soon = 5, expired_or_revoked = 25 (15 + 10)
        $expectedSummary = [
            'total'                    => 65,
            'active'                   => 40,
            'expiring_soon'            => 5,
            'expired'                  => 25,
            'total_warranties'         => 65,
            'active_count'             => 40,
            'expiring_soon_count'      => 5,
            'expired_or_revoked_count' => 25,
        ];

        // 1. Kiểm tra page=1&per_page=15
        $resPage1 = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/warranties?page=1&per_page=15');

        $resPage1->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.per_page', 15)
            ->assertJsonPath('data.total', 65)
            ->assertJsonPath('data.last_page', 5)
            ->assertJsonPath('data.from', 1)
            ->assertJsonPath('data.to', 15)
            ->assertJsonPath('data.summary', $expectedSummary);

        $this->assertCount(15, $resPage1->json('data.data'));

        // 2. Kiểm tra page=2&per_page=15
        $resPage2 = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/warranties?page=2&per_page=15');

        $resPage2->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonPath('data.per_page', 15)
            ->assertJsonPath('data.total', 65)
            ->assertJsonPath('data.last_page', 5)
            ->assertJsonPath('data.from', 16)
            ->assertJsonPath('data.to', 30)
            ->assertJsonPath('data.summary', $expectedSummary);

        $this->assertCount(15, $resPage2->json('data.data'));

        // 3. Kiểm tra Scenario trong spec: page=2&per_page=30 (trả về bản ghi 31..60 trên tổng 65)
        $resPage2Of30 = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/warranties?page=2&per_page=30');

        $resPage2Of30->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonPath('data.per_page', 30)
            ->assertJsonPath('data.total', 65)
            ->assertJsonPath('data.last_page', 3)
            ->assertJsonPath('data.from', 31)
            ->assertJsonPath('data.to', 60)
            ->assertJsonPath('data.summary', $expectedSummary);

        $this->assertCount(30, $resPage2Of30->json('data.data'));
    }

    /**
     * Test 2: GET /api/v1/warranties hỗ trợ per_page=all, all=true và kẹp trần per_page trong khoảng 1..500.
     */
    public function test_warranties_index_supports_per_page_all_and_clamps_per_page_bounds(): void
    {
        for ($i = 1; $i <= 55; $i++) {
            $this->createOrderAndWarranty([
                'status'   => 'active',
                'end_date' => now()->addDays(30)->toDateString(),
            ]);
        }

        // 1. per_page=all trả về toàn bộ 55 bản ghi (> 50 giới hạn cũ)
        $resPerPageAll = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/warranties?per_page=all');

        $resPerPageAll->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.last_page', 1)
            ->assertJsonPath('data.total', 55)
            ->assertJsonPath('data.from', 1)
            ->assertJsonPath('data.to', 55)
            ->assertJsonPath('data.summary.total_warranties', 55);

        $this->assertCount(55, $resPerPageAll->json('data.data'));

        // 2. all=true trả về toàn bộ 55 bản ghi
        $resAllFlag = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/warranties?all=true');

        $resAllFlag->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.last_page', 1)
            ->assertJsonPath('data.total', 55);

        $this->assertCount(55, $resAllFlag->json('data.data'));

        // 3. Kẹp trần per_page tối đa 500 khi truyền số lớn (VD: 2000)
        $resClampMax = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/warranties?per_page=2000');

        $resClampMax->assertStatus(200)
            ->assertJsonPath('data.per_page', 500)
            ->assertJsonPath('data.total', 55);

        // 4. Kẹp sàn per_page tối thiểu 1 khi truyền 0 hoặc số âm
        $resClampMin = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/warranties?per_page=0');

        $resClampMin->assertStatus(200)
            ->assertJsonPath('data.per_page', 1)
            ->assertJsonPath('data.total', 55);
        $this->assertCount(1, $resClampMin->json('data.data'));
    }

    /**
     * Test 3: Cô lập dữ liệu đa chi nhánh (branch_id) và đa cửa hàng (tenant_id) cho cả danh sách và summary.
     */
    public function test_warranties_index_and_summary_enforce_branch_and_tenant_isolation(): void
    {
        // Branch A1 (Tenant A): 8 active (trong đó 2 expiring soon), 4 expired => tổng 12
        for ($i = 1; $i <= 6; $i++) {
            $this->createOrderAndWarranty([
                'tenant_id' => $this->tenantA->id,
                'branch_id' => $this->branchA1->id,
                'status'    => 'active',
                'end_date'  => now()->addDays(45)->toDateString(),
            ]);
        }
        for ($i = 1; $i <= 2; $i++) {
            $this->createOrderAndWarranty([
                'tenant_id' => $this->tenantA->id,
                'branch_id' => $this->branchA1->id,
                'status'    => 'active',
                'end_date'  => now()->addDays(3)->toDateString(),
            ]);
        }
        for ($i = 1; $i <= 4; $i++) {
            $this->createOrderAndWarranty([
                'tenant_id' => $this->tenantA->id,
                'branch_id' => $this->branchA1->id,
                'status'    => 'expired',
                'end_date'  => now()->subDays(5)->toDateString(),
            ]);
        }

        // Branch A2 (Tenant A): 5 active, 2 revoked => tổng 7
        for ($i = 1; $i <= 5; $i++) {
            $this->createOrderAndWarranty([
                'tenant_id' => $this->tenantA->id,
                'branch_id' => $this->branchA2->id,
                'status'    => 'active',
                'end_date'  => now()->addDays(50)->toDateString(),
            ]);
        }
        for ($i = 1; $i <= 2; $i++) {
            $this->createOrderAndWarranty([
                'tenant_id' => $this->tenantA->id,
                'branch_id' => $this->branchA2->id,
                'status'    => 'revoked',
                'end_date'  => now()->addDays(50)->toDateString(),
            ]);
        }

        // Branch B1 (Tenant B - cửa hàng khác): 9 active
        for ($i = 1; $i <= 9; $i++) {
            $this->createOrderAndWarranty([
                'tenant_id' => $this->tenantB->id,
                'branch_id' => $this->branchB1->id,
                'status'    => 'active',
                'end_date'  => now()->addDays(60)->toDateString(),
            ]);
        }

        // 1. CSKH Chi nhánh A1 chỉ thấy đúng 12 sổ của Branch A1
        $resBranchA1 = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/warranties?per_page=all');

        $resBranchA1->assertStatus(200)
            ->assertJsonPath('data.total', 12)
            ->assertJsonPath('data.summary.total', 12)
            ->assertJsonPath('data.summary.total_warranties', 12)
            ->assertJsonPath('data.summary.active', 8)
            ->assertJsonPath('data.summary.active_count', 8)
            ->assertJsonPath('data.summary.expiring_soon', 2)
            ->assertJsonPath('data.summary.expiring_soon_count', 2)
            ->assertJsonPath('data.summary.expired', 4)
            ->assertJsonPath('data.summary.expired_or_revoked_count', 4);

        // 2. CSKH Chi nhánh A2 chỉ thấy đúng 7 sổ của Branch A2
        $resBranchA2 = $this->actingAs($this->cskhBranchA2, 'sanctum')
            ->getJson('/api/v1/warranties?per_page=all');

        $resBranchA2->assertStatus(200)
            ->assertJsonPath('data.total', 7)
            ->assertJsonPath('data.summary.total_warranties', 7)
            ->assertJsonPath('data.summary.active_count', 5)
            ->assertJsonPath('data.summary.expiring_soon_count', 0)
            ->assertJsonPath('data.summary.expired_or_revoked_count', 2);

        // 3. Admin của Tenant A thấy tổng cộng 19 sổ (Branch A1 + A2), tuyệt đối không lẫn 9 sổ của Tenant B
        $resAdminA = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/warranties?per_page=all');

        $resAdminA->assertStatus(200)
            ->assertJsonPath('data.total', 19)
            ->assertJsonPath('data.summary.total_warranties', 19)
            ->assertJsonPath('data.summary.active_count', 13)
            ->assertJsonPath('data.summary.expiring_soon_count', 2)
            ->assertJsonPath('data.summary.expired_or_revoked_count', 6);

        // 4. Admin của Tenant B chỉ thấy đúng 9 sổ của Tenant B
        $resAdminB = $this->actingAs($this->adminTenantB, 'sanctum')
            ->getJson('/api/v1/warranties?per_page=all');

        $resAdminB->assertStatus(200)
            ->assertJsonPath('data.total', 9)
            ->assertJsonPath('data.summary.total_warranties', 9)
            ->assertJsonPath('data.summary.active_count', 9);
    }

    /**
     * Test 4: GET /api/v1/warranties hỗ trợ tìm kiếm từ khóa q theo mã BH, mã đơn, serial, tên/SĐT khách và tên dòng máy.
     */
    public function test_warranties_index_supports_keyword_search_while_preserving_global_summary(): void
    {
        $this->createOrderAndWarranty([
            'warranty_code'  => 'WR-FIND-CODE-999',
            'order_code'     => 'RO-ORD-8888',
            'serial_number'  => 'SN-APPLE-7777',
            'customer_name'  => 'Nguyễn Bảo Ngọc',
            'customer_phone' => '0909888777',
            'device_model_id'=> $this->deviceMax->id,
        ]);

        // Tạo thêm 5 sổ bảo hành khác
        for ($i = 1; $i <= 5; $i++) {
            $this->createOrderAndWarranty([
                'device_model_id' => $this->devicePro2->id,
            ]);
        }

        // Tìm theo mã bảo hành
        $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/warranties?q=WR-FIND-CODE-999')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.summary.total_warranties', 6);

        // Tìm theo mã đơn sửa chữa
        $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/warranties?q=RO-ORD-8888')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 1);

        // Tìm theo số serial
        $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/warranties?q=SN-APPLE-7777')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 1);

        // Tìm theo SĐT khách hàng
        $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/warranties?q=0909888777')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 1);

        // Tìm theo tên dòng máy
        $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/warranties?q=' . urlencode('AirPods Max Lightning'))
            ->assertStatus(200)
            ->assertJsonPath('data.total', 1);
    }

    /**
     * Test 5: GET /api/v1/warranties/claims hỗ trợ phân trang (page, per_page, per_page=all, all=true),
     * tìm kiếm từ khóa q (mã khiếu nại, mô tả lỗi, mã đơn làm lại, mã sổ BH, SĐT/tên khách hàng) và cô lập chi nhánh/tenant.
     */
    public function test_warranty_claims_supports_pagination_search_and_scope_isolation(): void
    {
        // Tạo 18 yêu cầu khiếu nại ở Branch A1
        for ($i = 1; $i <= 18; $i++) {
            [$customer, $order, $warranty] = $this->createOrderAndWarranty([
                'tenant_id' => $this->tenantA->id,
                'branch_id' => $this->branchA1->id,
            ]);

            WarrantyClaim::forceCreate([
                'claim_code'          => sprintf('CLM-2026-%04d', $i),
                'warranty_id'         => $warranty->id,
                'issue_description'   => "Lỗi tai nghe định kỳ số {$i}",
                'resolution_mode'     => 'send_tech',
                'status'              => 'received',
                'received_by_user_id' => $this->cskhBranchA1->id,
            ]);
        }

        // Tạo 1 khiếu nại đặc biệt có gắn đơn làm lại (reworkOrder) ở Branch A1 để test tìm kiếm q
        [$specialCustomer, $specialOrder, $specialWarranty] = $this->createOrderAndWarranty([
            'tenant_id'      => $this->tenantA->id,
            'branch_id'      => $this->branchA1->id,
            'warranty_code'  => 'WR-SPECIAL-2026',
            'customer_name'  => 'Trần Minh Quân',
            'customer_phone' => '0918765432',
        ]);

        $reworkOrder = RepairOrder::withoutGlobalScopes()->forceCreate([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'customer_id'        => $specialCustomer->id,
            'device_model_id'    => $this->devicePro2->id,
            'parent_order_id'    => $specialOrder->id,
            'order_code'         => 'RO-RWK-9988',
            'order_type'         => 'warranty',
            'status'             => 'waiting_tech',
            'issue_description'  => '[BẢO HÀNH] Mic chống ồn rè lẹt xẹt',
            'serial_number'      => 'SN-RWK-9988',
            'total_price'        => 0,
            'initial_price'      => 0,
            'created_by_user_id' => $this->cskhBranchA1->id,
        ]);

        WarrantyClaim::forceCreate([
            'claim_code'          => 'CLM-SPECIAL-9988',
            'warranty_id'         => $specialWarranty->id,
            'rework_order_id'     => $reworkOrder->id,
            'issue_description'   => 'Mic chống ồn rè lẹt xẹt khi bật ANC',
            'resolution_mode'     => 'replace_part',
            'status'              => 'in_progress',
            'received_by_user_id' => $this->cskhBranchA1->id,
        ]);

        // Tạo thêm 3 khiếu nại ở Branch A2 và 4 khiếu nại ở Tenant B để kiểm tra cô lập dữ liệu
        for ($j = 1; $j <= 3; $j++) {
            [, , $wA2] = $this->createOrderAndWarranty([
                'tenant_id' => $this->tenantA->id,
                'branch_id' => $this->branchA2->id,
            ]);
            WarrantyClaim::forceCreate([
                'claim_code'          => "CLM-A2-{$j}-" . uniqid(),
                'warranty_id'         => $wA2->id,
                'issue_description'   => 'Khiếu nại chi nhánh 2',
                'resolution_mode'     => 'store_check',
                'status'              => 'received',
                'received_by_user_id' => $this->cskhBranchA2->id,
            ]);
        }

        for ($k = 1; $k <= 4; $k++) {
            [, , $wB1] = $this->createOrderAndWarranty([
                'tenant_id' => $this->tenantB->id,
                'branch_id' => $this->branchB1->id,
            ]);
            WarrantyClaim::forceCreate([
                'claim_code'          => "CLM-B1-{$k}-" . uniqid(),
                'warranty_id'         => $wB1->id,
                'issue_description'   => 'Khiếu nại cửa hàng B',
                'resolution_mode'     => 'store_check',
                'status'              => 'received',
                'received_by_user_id' => $this->adminTenantB->id,
            ]);
        }

        // Tổng số khiếu nại tại Branch A1 = 19 (18 + 1)
        // 1. Phân trang page=1&per_page=15 bởi CSKH Branch A1
        $resClaimsP1 = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/warranties/claims?page=1&per_page=15');

        $resClaimsP1->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.per_page', 15)
            ->assertJsonPath('data.total', 19)
            ->assertJsonPath('data.last_page', 2)
            ->assertJsonPath('data.from', 1)
            ->assertJsonPath('data.to', 15);
        $this->assertCount(15, $resClaimsP1->json('data.data'));

        // 2. Phân trang page=2&per_page=15 trả về 4 bản ghi còn lại
        $resClaimsP2 = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/warranties/claims?page=2&per_page=15');

        $resClaimsP2->assertStatus(200)
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonPath('data.total', 19)
            ->assertJsonPath('data.from', 16)
            ->assertJsonPath('data.to', 19);
        $this->assertCount(4, $resClaimsP2->json('data.data'));

        // 3. per_page=all trả về toàn bộ 19 bản ghi của Branch A1
        $resClaimsAll = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/warranties/claims?per_page=all');

        $resClaimsAll->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.last_page', 1)
            ->assertJsonPath('data.total', 19);
        $this->assertCount(19, $resClaimsAll->json('data.data'));

        // 4. Admin Tenant A thấy 22 khiếu nại (19 của Branch A1 + 3 của Branch A2), không thấy 4 của Tenant B
        $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/warranties/claims?all=true')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 22);

        // 5. Tìm kiếm q trên claims theo mã khiếu nại, mô tả lỗi, mã đơn làm lại, mã sổ BH, SĐT và tên khách hàng
        foreach ([
            'CLM-SPECIAL-9988',
            'rè lẹt xẹt khi bật ANC',
            'RO-RWK-9988',
            'WR-SPECIAL-2026',
            '0918765432',
            'Trần Minh Quân',
        ] as $keyword) {
            $searchRes = $this->actingAs($this->cskhBranchA1, 'sanctum')
                ->getJson('/api/v1/warranties/claims?q=' . urlencode($keyword) . '&page=1&per_page=15');

            $searchRes->assertStatus(200)
                ->assertJsonPath('data.total', 1)
                ->assertJsonPath('data.data.0.claim_code', 'CLM-SPECIAL-9988');
        }
    }
}
