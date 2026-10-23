<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\CashTransaction;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\GoodsReceipt;
use App\Models\InventoryTransaction;
use App\Models\Part;
use App\Models\Partner;
use App\Models\RepairOrder;
use App\Models\SaasInvoice;
use App\Models\SepayTransaction;
use App\Models\Shipment;
use App\Models\SubscriptionPlan;
use App\Models\Supplier;
use App\Models\SupplierDebtTransaction;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WorkShift;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class Stage3AndStage4PaginationTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected Branch $branchA1;
    protected Branch $branchA2;
    protected Branch $branchB1;
    protected DeviceModel $devicePro2;
    protected DeviceModel $deviceMax;
    protected User $superAdmin;
    protected User $adminTenantA;
    protected User $cskhBranchA1;
    protected User $cskhBranchA2;
    protected User $techBranchA1;
    protected User $adminTenantB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenantA = Tenant::create([
            'code'   => 'tenant_s34_a_' . uniqid(),
            'name'   => 'PodsCare Stage34 Store A',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->tenantB = Tenant::create([
            'code'   => 'tenant_s34_b_' . uniqid(),
            'name'   => 'PodsCare Stage34 Store B',
            'status' => 'active',
            'plan'   => 'basic',
        ]);

        $this->branchA1 = Branch::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Quận 1 S34',
            'code'      => 'BR_S34_A1_' . uniqid(),
            'phone'     => '0901111222',
            'address'   => '101 Nguyễn Huệ, Q1',
            'is_active' => true,
        ]);

        $this->branchA2 = Branch::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Quận 3 S34',
            'code'      => 'BR_S34_A2_' . uniqid(),
            'phone'     => '0901111333',
            'address'   => '202 Võ Văn Tần, Q3',
            'is_active' => true,
        ]);

        $this->branchB1 = Branch::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Chi nhánh Store B S34',
            'code'      => 'BR_S34_B1_' . uniqid(),
            'phone'     => '0902222333',
            'address'   => '303 Cầu Giấy, HN',
            'is_active' => true,
        ]);

        $this->devicePro2 = DeviceModel::create([
            'name'       => 'AirPods Pro 2 USB-C S34 ' . uniqid(),
            'model_code' => 'A3048_S34_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->deviceMax = DeviceModel::create([
            'name'       => 'AirPods Max Type-C S34 ' . uniqid(),
            'model_code' => 'A3184_S34_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->superAdmin = User::forceCreate([
            'tenant_id' => null,
            'branch_id' => null,
            'name'      => 'Super Admin Platform',
            'email'     => 'super_s34_' . uniqid() . '@podscare.vn',
            'phone'     => '099' . random_int(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'super_admin',
            'is_active' => true,
        ]);

        $this->adminTenantA = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'Admin Store A S34',
            'email'     => 'admin_s34_a_' . uniqid() . '@podscare.vn',
            'phone'     => '098' . random_int(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cskhBranchA1 = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'CSKH Quận 1 S34',
            'email'     => 'cskh_s34_a1_' . uniqid() . '@podscare.vn',
            'phone'     => '097' . random_int(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->cskhBranchA2 = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA2->id,
            'name'      => 'CSKH Quận 3 S34',
            'email'     => 'cskh_s34_a2_' . uniqid() . '@podscare.vn',
            'phone'     => '096' . random_int(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->techBranchA1 = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'KTV Quận 1 S34',
            'email'     => 'tech_s34_a1_' . uniqid() . '@podscare.vn',
            'phone'     => '094' . random_int(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->adminTenantB = User::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'branch_id' => $this->branchB1->id,
            'name'      => 'Admin Store B S34',
            'email'     => 'admin_s34_b_' . uniqid() . '@podscare.vn',
            'phone'     => '095' . random_int(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);
    }

    /**
     * Phase 3 — Test 1:
     * GET /api/v1/inventory/parts hỗ trợ page, per_page, per_page=all / all=true, tìm kiếm q,
     * trả kèm summary toàn cục (total_sku, total_stock_qty, total_stock_value cho Admin và 0 cho non-admin,
     * low_stock_count, out_of_stock_count) và ẩn cost_price với non-admin.
     */
    public function test_inventory_parts_paginates_supports_per_page_all_search_and_returns_role_aware_summary(): void
    {
        // 1. Tạo 12 linh kiện tồn kho bình thường tại Branch A1 (stock=10, min=5, cost=100k, retail=200k)
        // => stock_qty = 120, cost_value = 12.000.000, retail_value = 24.000.000
        for ($i = 1; $i <= 12; $i++) {
            $part = Part::withoutGlobalScopes()->forceCreate([
                'tenant_id'         => $this->tenantA->id,
                'sku'               => sprintf('SKU-NORM-A1-%02d', $i),
                'name'              => sprintf('Linh kiện chuẩn A1 %02d', $i),
                'category'          => 'battery',
                'compatible_models' => 'AirPods Pro 2',
                'storage_location'  => 'Kệ A-01',
                'stock_quantity'    => 10,
                'min_stock_alert'   => 5,
                'cost_price'        => 100000,
                'retail_price'      => 200000,
                'unit'              => 'viên',
                'is_active'         => true,
            ]);

            BranchPart::withoutGlobalScopes()->forceCreate([
                'branch_id'       => $this->branchA1->id,
                'part_id'         => $part->id,
                'stock_quantity'  => 10,
                'min_stock_alert' => 5,
            ]);
        }

        // 2. Tạo 5 linh kiện sắp hết hàng (low stock: stock=3 <= min=5, cost=200k, retail=350k)
        // => stock_qty = 15, cost_value = 3.000.000, retail_value = 5.250.000
        for ($i = 1; $i <= 5; $i++) {
            $part = Part::withoutGlobalScopes()->forceCreate([
                'tenant_id'         => $this->tenantA->id,
                'sku'               => sprintf('SKU-LOW-A1-%02d', $i),
                'name'              => sprintf('Màng loa cảnh báo tồn %02d', $i),
                'category'          => 'speaker',
                'compatible_models' => 'AirPods 3',
                'storage_location'  => 'Kệ B-02',
                'stock_quantity'    => 3,
                'min_stock_alert'   => 5,
                'cost_price'        => 200000,
                'retail_price'      => 350000,
                'unit'              => 'cái',
                'is_active'         => true,
            ]);

            BranchPart::withoutGlobalScopes()->forceCreate([
                'branch_id'       => $this->branchA1->id,
                'part_id'         => $part->id,
                'stock_quantity'  => 3,
                'min_stock_alert' => 5,
            ]);
        }

        // 3. Tạo 3 linh kiện hết hàng (out of stock: stock=0 <= min=5, cost=150k, retail=300k)
        // => stock_qty = 0, cost_value = 0, retail_value = 0 (cũng tính vào low_stock_count)
        for ($i = 1; $i <= 3; $i++) {
            $part = Part::withoutGlobalScopes()->forceCreate([
                'tenant_id'         => $this->tenantA->id,
                'sku'               => $i === 1 ? 'SKU-SPECIAL-ANC-999' : sprintf('SKU-OUT-A1-%02d', $i),
                'name'              => $i === 1 ? 'Cáp cảm biến chống ồn ANC đặc biệt' : sprintf('Cáp sạc hết hàng %02d', $i),
                'category'          => 'cable',
                'compatible_models' => $i === 1 ? 'AirPods Max Type-C 2026' : 'AirPods 2',
                'storage_location'  => $i === 1 ? 'Tủ VIP-Z9' : 'Kệ C-03',
                'stock_quantity'    => 0,
                'min_stock_alert'   => 5,
                'cost_price'        => 150000,
                'retail_price'      => 300000,
                'unit'              => 'sợi',
                'is_active'         => true,
            ]);

            BranchPart::withoutGlobalScopes()->forceCreate([
                'branch_id'       => $this->branchA1->id,
                'part_id'         => $part->id,
                'stock_quantity'  => 0,
                'min_stock_alert' => 5,
            ]);
        }

        // 4. Tạo 4 linh kiện thuộc Tenant B để kiểm tra cô lập đa cửa hàng
        for ($i = 1; $i <= 4; $i++) {
            Part::withoutGlobalScopes()->forceCreate([
                'tenant_id'         => $this->tenantB->id,
                'sku'               => sprintf('SKU-TENANT-B-%02d', $i),
                'name'              => sprintf('Linh kiện Store B %02d', $i),
                'category'          => 'battery',
                'compatible_models' => 'AirPods Pro 2',
                'storage_location'  => 'Kệ B-01',
                'stock_quantity'    => 50,
                'min_stock_alert'   => 5,
                'cost_price'        => 500000,
                'retail_price'      => 800000,
                'unit'              => 'viên',
                'is_active'         => true,
            ]);
        }

        // Tổng tại Tenant A / Branch A1:
        // total_sku = 20, total_stock_qty = 135, total_stock_value = 15.000.000,
        // total_retail_value = 29.250.000, low_stock_count = 8 (5 + 3), out_of_stock_count = 3
        $resAdminP1 = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/inventory/parts?page=1&per_page=15');

        $resAdminP1->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.per_page', 15)
            ->assertJsonPath('data.total', 20)
            ->assertJsonPath('data.last_page', 2)
            ->assertJsonPath('data.from', 1)
            ->assertJsonPath('data.to', 15)
            ->assertJsonPath('data.summary.total_sku', 20)
            ->assertJsonPath('data.summary.total_stock_qty', 135)
            ->assertJsonPath('data.summary.total_stock_value', 15000000)
            ->assertJsonPath('data.summary.total_retail_value', 29250000)
            ->assertJsonPath('data.summary.low_stock_count', 8)
            ->assertJsonPath('data.summary.out_of_stock_count', 3);
        $this->assertCount(15, $resAdminP1->json('data.data'));
        $this->assertArrayHasKey('cost_price', $resAdminP1->json('data.data.0'));

        // Trang 2 (per_page=15) trả về 5 linh kiện còn lại, vẫn giữ nguyên summary toàn cục
        $resAdminP2 = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/inventory/parts?page=2&per_page=15');

        $resAdminP2->assertStatus(200)
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonPath('data.total', 20)
            ->assertJsonPath('data.from', 16)
            ->assertJsonPath('data.to', 20)
            ->assertJsonPath('data.summary.total_sku', 20)
            ->assertJsonPath('data.summary.total_stock_value', 15000000);
        $this->assertCount(5, $resAdminP2->json('data.data'));

        // Non-admin (KTV / CSKH) nhận summary.total_stock_value = 0 và không thấy cost_price
        $resTech = $this->actingAs($this->techBranchA1, 'sanctum')
            ->getJson('/api/v1/inventory/parts?page=1&per_page=15');

        $resTech->assertStatus(200)
            ->assertJsonPath('data.total', 20)
            ->assertJsonPath('data.summary.total_sku', 20)
            ->assertJsonPath('data.summary.total_stock_qty', 135)
            ->assertJsonPath('data.summary.total_stock_value', 0)
            ->assertJsonPath('data.summary.low_stock_count', 8)
            ->assertJsonPath('data.summary.out_of_stock_count', 3);
        $this->assertArrayNotHasKey('cost_price', $resTech->json('data.data.0'));

        // Chế độ per_page=all và all=true (phục vụ dropdown chọn linh kiện trong modal nhập kho)
        $resAll = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/inventory/parts?all=true');

        $resAll->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.last_page', 1)
            ->assertJsonPath('data.total', 20);
        $this->assertCount(20, $resAll->json('data.data'));

        $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/inventory/parts?per_page=all')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 20)
            ->assertJsonPath('data.summary.total_stock_value', 0);

        // Tìm kiếm q theo tên, SKU, dòng máy tương thích, vị trí kệ
        foreach ([
            'Cáp cảm biến chống ồn ANC đặc biệt',
            'SKU-SPECIAL-ANC-999',
            'AirPods Max Type-C 2026',
            'Tủ VIP-Z9',
        ] as $kw) {
            $this->actingAs($this->adminTenantA, 'sanctum')
                ->getJson('/api/v1/inventory/parts?q=' . urlencode($kw))
                ->assertStatus(200)
                ->assertJsonPath('data.total', 1)
                ->assertJsonPath('data.data.0.sku', 'SKU-SPECIAL-ANC-999');
        }
    }

    /**
     * Phase 3 — Test 2:
     * GET /api/v1/inventory/transactions hỗ trợ page, per_page, per_page=all / all=true,
     * tìm kiếm q theo tên/SKU linh kiện, mã đơn sửa chữa, ghi chú, mã giao dịch, tên NCC,
     * và ẩn unit_cost đối với non-admin.
     */
    public function test_inventory_transactions_paginates_supports_per_page_all_search_and_hides_cost_for_non_admin(): void
    {
        $partNormal = Part::withoutGlobalScopes()->forceCreate([
            'tenant_id'         => $this->tenantA->id,
            'sku'               => 'SKU-TX-PIN-01',
            'name'              => 'Pin tai nghe AirPods Pro 2 chuẩn',
            'category'          => 'battery',
            'compatible_models' => 'AirPods Pro 2',
            'storage_location'  => 'Kệ A-01',
            'stock_quantity'    => 100,
            'min_stock_alert'   => 5,
            'cost_price'        => 120000,
            'retail_price'      => 250000,
            'unit'              => 'viên',
            'is_active'         => true,
        ]);

        $partSpecial = Part::withoutGlobalScopes()->forceCreate([
            'tenant_id'         => $this->tenantA->id,
            'sku'               => 'SKU-TX-CHIP-H2',
            'name'              => 'Chip xử lý âm thanh H2 zin bóc máy',
            'category'          => 'ic',
            'compatible_models' => 'AirPods Pro 2 USB-C',
            'storage_location'  => 'Tủ IC-02',
            'stock_quantity'    => 20,
            'min_stock_alert'   => 3,
            'cost_price'        => 450000,
            'retail_price'      => 850000,
            'unit'              => 'con',
            'is_active'         => true,
        ]);

        $customer = Customer::withoutGlobalScopes()->forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Khách Giao Dịch Kho',
            'phone'     => '0909888777',
        ]);

        $repairOrder = RepairOrder::withoutGlobalScopes()->forceCreate([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $this->devicePro2->id,
            'order_code'         => 'RO-INV-SEARCH-888',
            'order_type'         => 'in_store',
            'status'             => 'in_repair',
            'issue_description'  => 'Lỗi chip H2 mất kết nối',
            'serial_number'      => 'SN-INV-888',
            'total_price'        => 850000,
            'initial_price'      => 850000,
            'created_by_user_id' => $this->adminTenantA->id,
        ]);

        // Tạo 21 giao dịch thường tại Branch A1
        for ($i = 1; $i <= 21; $i++) {
            InventoryTransaction::forceCreate([
                'transaction_code'   => sprintf('TX-A1-2026-%03d', $i),
                'part_id'            => $partNormal->id,
                'branch_id'          => $this->branchA1->id,
                'repair_order_id'    => null,
                'transaction_type'   => 'import',
                'quantity'           => 5,
                'unit_cost'          => 120000,
                'supplier_name'      => 'NCC Linh Kiện Sài Gòn',
                'notes'              => "Nhập bổ sung pin đợt {$i}",
                'created_by_user_id' => $this->adminTenantA->id,
            ]);
        }

        // Tạo 1 giao dịch đặc biệt gắn với đơn sửa chữa RO-INV-SEARCH-888 tại Branch A1
        InventoryTransaction::forceCreate([
            'transaction_code'   => 'TX-SPECIAL-H2-999',
            'part_id'            => $partSpecial->id,
            'branch_id'          => $this->branchA1->id,
            'repair_order_id'    => $repairOrder->id,
            'transaction_type'   => 'export_repair',
            'quantity'           => -1,
            'unit_cost'          => 450000,
            'supplier_name'      => 'Foxconn Audio Parts',
            'notes'              => 'Xuất kho thay chip H2 cho khách VIP',
            'created_by_user_id' => $this->techBranchA1->id,
        ]);

        // Tạo 3 giao dịch ở Branch A2 để kiểm tra lọc chi nhánh
        for ($j = 1; $j <= 3; $j++) {
            InventoryTransaction::forceCreate([
                'transaction_code'   => sprintf('TX-A2-2026-%03d', $j),
                'part_id'            => $partNormal->id,
                'branch_id'          => $this->branchA2->id,
                'transaction_type'   => 'import',
                'quantity'           => 2,
                'unit_cost'          => 120000,
                'notes'              => 'Nhập kho chi nhánh 2',
                'created_by_user_id' => $this->adminTenantA->id,
            ]);
        }

        // Tổng Branch A1 = 22 giao dịch
        $resP1 = $this->actingAs($this->techBranchA1, 'sanctum')
            ->getJson('/api/v1/inventory/transactions?page=1&per_page=15');

        $resP1->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.per_page', 15)
            ->assertJsonPath('data.total', 22)
            ->assertJsonPath('data.last_page', 2)
            ->assertJsonPath('data.from', 1)
            ->assertJsonPath('data.to', 15);
        $this->assertCount(15, $resP1->json('data.data'));
        $this->assertArrayNotHasKey('unit_cost', $resP1->json('data.data.0'));

        // Trang 2 (per_page=15) trả về 7 giao dịch còn lại
        $resP2 = $this->actingAs($this->techBranchA1, 'sanctum')
            ->getJson('/api/v1/inventory/transactions?page=2&per_page=15');

        $resP2->assertStatus(200)
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonPath('data.total', 22)
            ->assertJsonPath('data.from', 16)
            ->assertJsonPath('data.to', 22);
        $this->assertCount(7, $resP2->json('data.data'));

        // per_page=all và all=true
        $resAll = $this->actingAs($this->techBranchA1, 'sanctum')
            ->getJson('/api/v1/inventory/transactions?per_page=all');

        $resAll->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.last_page', 1)
            ->assertJsonPath('data.total', 22);
        $this->assertCount(22, $resAll->json('data.data'));

        // Admin xem toàn bộ chi nhánh (22 + 3 = 25) và thấy được unit_cost
        $resAdminAll = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/inventory/transactions?all=true&branch_id=all');

        $resAdminAll->assertStatus(200)
            ->assertJsonPath('data.total', 25);
        $this->assertArrayHasKey('unit_cost', $resAdminAll->json('data.data.0'));

        // Tìm kiếm q theo tên linh kiện, SKU linh kiện, mã đơn sửa chữa, ghi chú, mã giao dịch
        foreach ([
            'Chip xử lý âm thanh H2 zin bóc máy',
            'SKU-TX-CHIP-H2',
            'RO-INV-SEARCH-888',
            'Xuất kho thay chip H2 cho khách VIP',
            'TX-SPECIAL-H2-999',
        ] as $keyword) {
            $this->actingAs($this->adminTenantA, 'sanctum')
                ->getJson('/api/v1/inventory/transactions?q=' . urlencode($keyword))
                ->assertStatus(200)
                ->assertJsonPath('data.total', 1)
                ->assertJsonPath('data.data.0.transaction_code', 'TX-SPECIAL-H2-999');
        }
    }

    /**
     * Phase 3 — Test 3:
     * GET /api/v1/suppliers, GET /api/v1/goods-receipts, và GET /api/v1/suppliers/{id}/debt-transactions
     * (cùng alias /api/v1/suppliers/{id}/debt-history) hỗ trợ page, per_page, per_page=all / all=true,
     * tìm kiếm q, và trả kèm summary công nợ toàn cục trên /api/v1/suppliers.
     */
    public function test_suppliers_goods_receipts_and_debt_history_paginate_support_all_search_and_summary(): void
    {
        // 1. Tạo 18 nhà cung cấp tại Tenant A:
        // - 12 NCC đang hoạt động có nợ 2.500.000 ₫ => tổng nợ active = 30.000.000 ₫
        // - 4 NCC đang hoạt động không nợ (0 ₫)
        // - 2 NCC ngừng hoạt động có nợ 1.000.000 ₫
        // => total_suppliers = 18, active_suppliers_count = 16, total_debt_amount = 30.000.000, suppliers_with_debt_count = 14
        $mainSupplier = null;
        for ($i = 1; $i <= 12; $i++) {
            $sup = Supplier::withoutGlobalScopes()->forceCreate([
                'tenant_id'    => $this->tenantA->id,
                'code'         => $i === 1 ? 'SUP-APPLE-VN-01' : sprintf('SUP-DEBT-%02d', $i),
                'name'         => $i === 1 ? 'Công ty Linh Kiện Táo Việt' : sprintf('Nhà cung cấp Có Nợ %02d', $i),
                'phone'        => $i === 1 ? '0908765432' : sprintf('09110000%02d', $i),
                'email'        => $i === 1 ? 'taoviet@supplier.vn' : "sup{$i}@test.vn",
                'tax_code'     => $i === 1 ? '0312345678' : "MST-{$i}",
                'debt_balance' => 2500000,
                'notes'        => $i === 1 ? 'Chuyên cung cấp pin và màng loa zin' : 'NCC định kỳ',
                'is_active'    => true,
            ]);
            if ($i === 1) {
                $mainSupplier = $sup;
            }
        }

        for ($i = 1; $i <= 4; $i++) {
            Supplier::withoutGlobalScopes()->forceCreate([
                'tenant_id'    => $this->tenantA->id,
                'code'         => sprintf('SUP-NODEBT-%02d', $i),
                'name'         => sprintf('Nhà cung cấp Đã Tất Toán %02d', $i),
                'phone'        => sprintf('09120000%02d', $i),
                'debt_balance' => 0,
                'is_active'    => true,
            ]);
        }

        for ($i = 1; $i <= 2; $i++) {
            Supplier::withoutGlobalScopes()->forceCreate([
                'tenant_id'    => $this->tenantA->id,
                'code'         => sprintf('SUP-INACT-%02d', $i),
                'name'         => sprintf('Nhà cung cấp Ngừng HĐ %02d', $i),
                'phone'        => sprintf('09130000%02d', $i),
                'debt_balance' => 1000000,
                'is_active'    => false,
            ]);
        }

        // Tạo 3 NCC ở Tenant B để kiểm tra cô lập
        for ($k = 1; $k <= 3; $k++) {
            Supplier::withoutGlobalScopes()->forceCreate([
                'tenant_id'    => $this->tenantB->id,
                'code'         => sprintf('SUP-B-%02d', $k),
                'name'         => sprintf('NCC Store B %02d', $k),
                'phone'        => sprintf('09140000%02d', $k),
                'debt_balance' => 9000000,
                'is_active'    => true,
            ]);
        }

        // Kiểm chứng GET /api/v1/suppliers (page 1, page 2, all=true, summary, search q)
        $resSupP1 = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/suppliers?page=1&per_page=15');

        $resSupP1->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.per_page', 15)
            ->assertJsonPath('data.total', 18)
            ->assertJsonPath('data.last_page', 2)
            ->assertJsonPath('data.summary.total_suppliers', 18)
            ->assertJsonPath('data.summary.active_suppliers_count', 16)
            ->assertJsonPath('data.summary.total_debt_amount', 30000000)
            ->assertJsonPath('data.summary.suppliers_with_debt_count', 14);
        $this->assertCount(15, $resSupP1->json('data.data'));

        $resSupP2 = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/suppliers?page=2&per_page=15');
        $resSupP2->assertStatus(200)
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonPath('data.total', 18);
        $this->assertCount(3, $resSupP2->json('data.data'));

        $resSupAll = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/suppliers?all=true');
        $resSupAll->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.last_page', 1)
            ->assertJsonPath('data.total', 18);
        $this->assertCount(18, $resSupAll->json('data.data'));

        foreach (['Công ty Linh Kiện Táo Việt', 'SUP-APPLE-VN-01', '0908765432', '0312345678'] as $kw) {
            $this->actingAs($this->adminTenantA, 'sanctum')
                ->getJson('/api/v1/suppliers?q=' . urlencode($kw))
                ->assertStatus(200)
                ->assertJsonPath('data.total', 1)
                ->assertJsonPath('data.data.0.code', 'SUP-APPLE-VN-01');
        }

        // 2. Tạo 19 phiếu nhập kho (GoodsReceipt) tại Tenant A
        $specialReceipt = null;
        for ($i = 1; $i <= 19; $i++) {
            $gr = GoodsReceipt::withoutGlobalScopes()->forceCreate([
                'tenant_id'          => $this->tenantA->id,
                'branch_id'          => $this->branchA1->id,
                'supplier_id'        => $mainSupplier->id,
                'receipt_code'       => $i === 1 ? 'GR-261023-VIP9' : sprintf('GR-261023-%04d', $i),
                'status'             => 'completed',
                'total_amount'       => 2000000,
                'discount_amount'    => 0,
                'final_amount'       => 2000000,
                'paid_amount'        => 1000000,
                'debt_amount'        => 1000000,
                'payment_method'     => 'cash',
                'notes'              => $i === 1 ? 'Nhập lô hàng bản lề hộp sạc đặc biệt' : "Nhập hàng đợt {$i}",
                'created_by_user_id' => $this->adminTenantA->id,
            ]);
            if ($i === 1) {
                $specialReceipt = $gr;
            }
        }

        // Kiểm chứng GET /api/v1/goods-receipts (page 1, page 2, per_page=all, search q)
        $resGrP1 = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/goods-receipts?page=1&per_page=15');
        $resGrP1->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.total', 19)
            ->assertJsonPath('data.last_page', 2);
        $this->assertCount(15, $resGrP1->json('data.data'));

        $resGrP2 = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/goods-receipts?page=2&per_page=15');
        $resGrP2->assertStatus(200)
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonPath('data.total', 19);
        $this->assertCount(4, $resGrP2->json('data.data'));

        $resGrAll = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/goods-receipts?per_page=all');
        $resGrAll->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.last_page', 1)
            ->assertJsonPath('data.total', 19);
        $this->assertCount(19, $resGrAll->json('data.data'));

        foreach (['GR-261023-VIP9', 'bản lề hộp sạc đặc biệt'] as $kw) {
            $this->actingAs($this->adminTenantA, 'sanctum')
                ->getJson('/api/v1/goods-receipts?q=' . urlencode($kw))
                ->assertStatus(200)
                ->assertJsonPath('data.total', 1)
                ->assertJsonPath('data.data.0.receipt_code', 'GR-261023-VIP9');
        }

        // 3. Tạo 17 biến động công nợ (SupplierDebtTransaction) cho $mainSupplier
        for ($i = 1; $i <= 17; $i++) {
            SupplierDebtTransaction::withoutGlobalScopes()->forceCreate([
                'tenant_id'          => $this->tenantA->id,
                'branch_id'          => $this->branchA1->id,
                'supplier_id'        => $mainSupplier->id,
                'goods_receipt_id'   => $i === 1 ? $specialReceipt->id : null,
                'transaction_code'   => $i === 1 ? 'DEBT-VIP-0001' : sprintf('PAY-2610-%04d', $i),
                'transaction_type'   => $i === 1 ? 'purchase_debt' : 'debt_payment',
                'amount'             => 500000,
                'debt_before'        => 3000000,
                'debt_after'         => 2500000,
                'payment_method'     => $i === 1 ? null : 'bank_transfer',
                'notes'              => $i === 1 ? 'Ghi nợ lô bản lề VIP9' : "Thanh toán nợ đợt {$i}",
                'created_by_user_id' => $this->adminTenantA->id,
            ]);
        }

        // Kiểm chứng cả /debt-transactions và alias /debt-history
        foreach ([
            "/api/v1/suppliers/{$mainSupplier->id}/debt-transactions",
            "/api/v1/suppliers/{$mainSupplier->id}/debt-history",
        ] as $endpoint) {
            $resDebtP1 = $this->actingAs($this->adminTenantA, 'sanctum')
                ->getJson("{$endpoint}?page=1&per_page=15");
            $resDebtP1->assertStatus(200)
                ->assertJsonPath('data.current_page', 1)
                ->assertJsonPath('data.total', 17)
                ->assertJsonPath('data.last_page', 2);
            $this->assertCount(15, $resDebtP1->json('data.data'));

            $resDebtP2 = $this->actingAs($this->adminTenantA, 'sanctum')
                ->getJson("{$endpoint}?page=2&per_page=15");
            $resDebtP2->assertStatus(200)
                ->assertJsonPath('data.current_page', 2)
                ->assertJsonPath('data.total', 17);
            $this->assertCount(2, $resDebtP2->json('data.data'));

            $resDebtAll = $this->actingAs($this->adminTenantA, 'sanctum')
                ->getJson("{$endpoint}?per_page=all");
            $resDebtAll->assertStatus(200)
                ->assertJsonPath('data.current_page', 1)
                ->assertJsonPath('data.last_page', 1)
                ->assertJsonPath('data.total', 17);
            $this->assertCount(17, $resDebtAll->json('data.data'));

            foreach (['DEBT-VIP-0001', 'Ghi nợ lô bản lề VIP9', 'GR-261023-VIP9'] as $kw) {
                $this->actingAs($this->adminTenantA, 'sanctum')
                    ->getJson("{$endpoint}?q=" . urlencode($kw))
                    ->assertStatus(200)
                    ->assertJsonPath('data.total', 1)
                    ->assertJsonPath('data.data.0.transaction_code', 'DEBT-VIP-0001');
            }
        }
    }

    /**
     * Phase 4 — Test 4:
     * GET /api/v1/customers, GET /api/v1/customers/{id} (show), và GET /api/v1/customers/{id}/orders (history):
     * Không còn cắt ngầm ở 50 đơn (khách quen có 55 đơn sửa chữa lấy đủ 55 đơn),
     * hỗ trợ page, per_page, per_page=all / all=true, và tìm kiếm từ khóa q.
     */
    public function test_customers_index_show_and_order_history_paginate_beyond_50_orders_and_support_search(): void
    {
        $vipCustomer = Customer::withoutGlobalScopes()->forceCreate([
            'tenant_id'     => $this->tenantA->id,
            'name'          => 'Trần Đại Lý VIP 55 Đơn',
            'phone'         => '0909555666',
            'email'         => 'dailyvip55@podscare.vn',
            'customer_type' => 'dealer',
            'orders_count'  => 55,
            'total_spent'   => 27500000,
        ]);

        // Tạo thêm 17 khách hàng khác tại Tenant A (tổng 18 khách hàng tại Tenant A)
        for ($c = 1; $c <= 17; $c++) {
            Customer::withoutGlobalScopes()->forceCreate([
                'tenant_id'     => $this->tenantA->id,
                'name'          => sprintf('Khách Lẻ S4 %02d', $c),
                'phone'         => sprintf('09380000%02d', $c),
                'customer_type' => 'retail',
            ]);
        }

        // Tạo 55 đơn sửa chữa cho $vipCustomer (vượt mốc giới hạn 50 đơn cũ)
        for ($i = 1; $i <= 55; $i++) {
            RepairOrder::withoutGlobalScopes()->forceCreate([
                'tenant_id'          => $this->tenantA->id,
                'branch_id'          => $this->branchA1->id,
                'customer_id'        => $vipCustomer->id,
                'device_model_id'    => $i === 55 ? $this->deviceMax->id : $this->devicePro2->id,
                'order_code'         => $i === 55 ? 'RO-CUST55-TARGET' : sprintf('RO-CUST55-%03d', $i),
                'order_type'         => 'in_store',
                'status'             => 'completed',
                'issue_description'  => $i === 55 ? 'Thay headband AirPods Max gãy khớp' : "Bảo dưỡng định kỳ lần {$i}",
                'serial_number'      => $i === 55 ? 'SN-MAX-HEADBAND-55' : sprintf('SN-CUST55-%03d', $i),
                'total_price'        => 500000,
                'initial_price'      => 500000,
                'created_by_user_id' => $this->adminTenantA->id,
                'created_at'         => Carbon::now()->subMinutes(60 - $i),
            ]);
        }

        // 1. Kiểm chứng GET /api/v1/customers (index): page 1, page 2, per_page=all, search q
        $resCustP1 = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/customers?page=1&per_page=15');
        $resCustP1->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.total', 18)
            ->assertJsonPath('data.last_page', 2);
        $this->assertCount(15, $resCustP1->json('data.data'));

        $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/customers?per_page=all')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 18);

        $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/customers?q=' . urlencode('0909555666'))
            ->assertStatus(200)
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.id', $vipCustomer->id);

        // 2. Kiểm chứng GET /api/v1/customers/{id} (show): không còn bị cắt ở 50 đơn, trả đủ 55 đơn
        $resShow = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson("/api/v1/customers/{$vipCustomer->id}");

        $resShow->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.id', $vipCustomer->id);
        $this->assertCount(55, $resShow->json('data.repair_orders'));

        // 3. Kiểm chứng GET /api/v1/customers/{id}/orders và /history:
        // hỗ trợ page, per_page, per_page=all / all=true, và tìm kiếm q
        foreach ([
            "/api/v1/customers/{$vipCustomer->id}/orders",
            "/api/v1/customers/{$vipCustomer->id}/history",
        ] as $historyUrl) {
            // Trang 1 (15 đơn)
            $resHistP1 = $this->actingAs($this->adminTenantA, 'sanctum')
                ->getJson("{$historyUrl}?page=1&per_page=15");
            $resHistP1->assertStatus(200)
                ->assertJsonPath('data.current_page', 1)
                ->assertJsonPath('data.per_page', 15)
                ->assertJsonPath('data.total', 55)
                ->assertJsonPath('data.last_page', 4)
                ->assertJsonPath('data.from', 1)
                ->assertJsonPath('data.to', 15);
            $this->assertCount(15, $resHistP1->json('data.data'));

            // Trang 4 (10 đơn cuối từ 46..55 — vượt qua giới hạn 50 đơn cũ)
            $resHistP4 = $this->actingAs($this->adminTenantA, 'sanctum')
                ->getJson("{$historyUrl}?page=4&per_page=15");
            $resHistP4->assertStatus(200)
                ->assertJsonPath('data.current_page', 4)
                ->assertJsonPath('data.total', 55)
                ->assertJsonPath('data.from', 46)
                ->assertJsonPath('data.to', 55);
            $this->assertCount(10, $resHistP4->json('data.data'));

            // Chế độ per_page=all trả về toàn bộ 55 đơn
            $resHistAll = $this->actingAs($this->adminTenantA, 'sanctum')
                ->getJson("{$historyUrl}?per_page=all");
            $resHistAll->assertStatus(200)
                ->assertJsonPath('data.current_page', 1)
                ->assertJsonPath('data.last_page', 1)
                ->assertJsonPath('data.total', 55);
            $this->assertCount(55, $resHistAll->json('data.data'));

            // Tìm kiếm q theo order_code, serial_number, issue_description, deviceModel.name
            foreach ([
                'RO-CUST55-TARGET',
                'SN-MAX-HEADBAND-55',
                'Thay headband AirPods Max gãy khớp',
                'AirPods Max Type-C S34',
            ] as $kw) {
                $this->actingAs($this->adminTenantA, 'sanctum')
                    ->getJson("{$historyUrl}?q=" . urlencode($kw))
                    ->assertStatus(200)
                    ->assertJsonPath('data.total', 1)
                    ->assertJsonPath('data.data.0.order_code', 'RO-CUST55-TARGET');
            }
        }
    }

    /**
     * Phase 4 — Test 5:
     * GET /api/v1/shipments, GET /api/v1/audit-logs, GET /api/v1/users, GET /api/v1/partners,
     * GET /api/v1/cashbook/transactions (và /api/v1/cash-transactions), GET /api/v1/shifts:
     * Hỗ trợ đầy đủ page, per_page, per_page=all / all=true và tìm kiếm từ khóa q trên server.
     */
    public function test_shipments_audit_logs_users_partners_cash_transactions_and_shifts_paginate_and_search(): void
    {
        $customer = Customer::withoutGlobalScopes()->forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Nguyễn Văn Vận Đơn',
            'phone'     => '0907111222',
        ]);

        // --- A. PARTNERS & SHIPMENTS ---
        $baselinePartners = Partner::count();
        $targetPartner = null;
        for ($i = 1; $i <= 18; $i++) {
            $p = Partner::create([
                'code'           => $i === 1 ? 'PTN-S4-GHN-VIP' : sprintf('PTN-S4-%03d-%s', $i, strtoupper(uniqid())),
                'name'           => $i === 1 ? 'Giao Hàng Nhanh Đối Tác Chiến Lược' : sprintf('Đối tác vận chuyển S4 %02d', $i),
                'service_type'   => 'shipping',
                'contact_person' => $i === 1 ? 'Trần Quản Lý GHN' : "Liên hệ {$i}",
                'phone'          => $i === 1 ? '0906999888' : sprintf('09060000%02d', $i),
                'status'         => 'active',
            ]);
            if ($i === 1) {
                $targetPartner = $p;
            }
        }

        for ($i = 1; $i <= 18; $i++) {
            $order = RepairOrder::withoutGlobalScopes()->forceCreate([
                'tenant_id'          => $this->tenantA->id,
                'branch_id'          => $this->branchA1->id,
                'customer_id'        => $customer->id,
                'device_model_id'    => $this->devicePro2->id,
                'order_code'         => $i === 1 ? 'RO-SHIP-FIND-01' : sprintf('RO-SHIP-S4-%03d', $i),
                'order_type'         => 'cod',
                'status'             => 'ready_for_return',
                'issue_description'  => 'Sửa tai nghe gửi COD',
                'serial_number'      => sprintf('SN-SHP-%03d', $i),
                'total_price'        => 400000,
                'initial_price'      => 400000,
                'created_by_user_id' => $this->adminTenantA->id,
            ]);

            Shipment::withoutGlobalScopes()->forceCreate([
                'tenant_id'          => $this->tenantA->id,
                'shipment_code'      => $i === 1 ? 'SH-S4-SPECIAL-01' : sprintf('SH-S4-2026-%03d', $i),
                'repair_order_id'    => $order->id,
                'partner_id'         => $targetPartner->id,
                'delivery_method'    => 'home_delivery',
                'carrier_name'       => $i === 1 ? 'GHN Express Siêu Tốc' : 'ViettelPost',
                'tracking_code'      => $i === 1 ? 'TRK-GHN-999888' : sprintf('TRK-VTP-%03d', $i),
                'delivery_address'   => $i === 1 ? '99 Lê Lợi, Quận 1, TP.HCM' : 'Địa chỉ giao hàng',
                'status'             => 'pending',
                'notes'              => $i === 1 ? 'Giao giờ hành chính gọi trước 15 phút' : null,
                'created_by_user_id' => $this->cskhBranchA1->id,
            ]);
        }

        // Kiểm chứng GET /api/v1/shipments
        $resShipP1 = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/shipments?page=1&per_page=15');
        $resShipP1->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.total', 18)
            ->assertJsonPath('data.last_page', 2);
        $this->assertCount(15, $resShipP1->json('data.data'));

        $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/shipments?page=2&per_page=15')
            ->assertStatus(200)
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonCount(3, 'data.data');

        $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/shipments?per_page=all')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 18)
            ->assertJsonCount(18, 'data.data');

        foreach (['SH-S4-SPECIAL-01', 'TRK-GHN-999888', 'RO-SHIP-FIND-01', '99 Lê Lợi'] as $kw) {
            $this->actingAs($this->cskhBranchA1, 'sanctum')
                ->getJson('/api/v1/shipments?q=' . urlencode($kw))
                ->assertStatus(200)
                ->assertJsonPath('data.total', 1)
                ->assertJsonPath('data.data.0.shipment_code', 'SH-S4-SPECIAL-01');
        }

        // Kiểm chứng GET /api/v1/partners
        $expectedTotalPartners = $baselinePartners + 18;
        $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/partners?page=1&per_page=15')
            ->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.total', $expectedTotalPartners)
            ->assertJsonCount(15, 'data.data');

        $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/partners?per_page=all')
            ->assertStatus(200)
            ->assertJsonPath('data.total', $expectedTotalPartners);

        foreach (['PTN-S4-GHN-VIP', 'Giao Hàng Nhanh Đối Tác Chiến Lược', 'Trần Quản Lý GHN', 'TRK-GHN-999888'] as $kw) {
            $this->actingAs($this->adminTenantA, 'sanctum')
                ->getJson('/api/v1/partners?q=' . urlencode($kw))
                ->assertStatus(200)
                ->assertJsonPath('data.total', 1)
                ->assertJsonPath('data.data.0.code', 'PTN-S4-GHN-VIP');
        }

        // --- B. AUDIT LOGS ---
        // Scenario trong Spec: Phân trang Nhật ký kiểm toán hệ thống (/audit) và tìm kiếm q
        for ($i = 1; $i <= 35; $i++) {
            AuditLog::create([
                'tenant_id'      => $this->tenantA->id,
                'user_id'        => $this->adminTenantA->id,
                'user_name'      => $this->adminTenantA->name,
                'action'         => $i === 1 ? 'Cấu hình bảo mật đặc biệt S4' : "Thao tác kiểm toán #{$i}",
                'auditable_type' => 'RepairOrder',
                'auditable_id'   => $i,
                'details'        => $i === 1 ? 'Thay đổi khóa webhook SePay định kỳ AUDIT-FIND-999' : "Chi tiết nhật ký số {$i}",
                'ip_address'     => $i === 1 ? '203.113.188.99' : '127.0.0.1',
            ]);
        }

        // Kiểm chứng Scenario Spec: page=2&per_page=30
        $resAuditP1 = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/audit-logs?page=1&per_page=30');
        $resAuditP1->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.per_page', 30)
            ->assertJsonPath('data.total', 35)
            ->assertJsonPath('data.last_page', 2);
        $this->assertCount(30, $resAuditP1->json('data.data'));

        $resAuditP2 = $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/audit-logs?page=2&per_page=30');
        $resAuditP2->assertStatus(200)
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonPath('data.from', 31)
            ->assertJsonPath('data.to', 35)
            ->assertJsonCount(5, 'data.data');

        $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/audit-logs?per_page=all')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 35)
            ->assertJsonCount(35, 'data.data');

        foreach (['Cấu hình bảo mật đặc biệt S4', 'AUDIT-FIND-999', '203.113.188.99'] as $kw) {
            $this->actingAs($this->adminTenantA, 'sanctum')
                ->getJson('/api/v1/audit-logs?q=' . urlencode($kw))
                ->assertStatus(200)
                ->assertJsonPath('data.total', 1)
                ->assertJsonPath('data.data.0.ip_address', '203.113.188.99');
        }

        // --- C. USERS ---
        // Đã có 4 user của Tenant A trong setUp(), tạo thêm 14 user => tổng 18 user tại Tenant A
        for ($i = 1; $i <= 14; $i++) {
            User::forceCreate([
                'tenant_id' => $this->tenantA->id,
                'branch_id' => $this->branchA1->id,
                'name'      => $i === 1 ? 'Hoàng Minh Kỹ Thuật Trưởng' : sprintf('Nhân viên S4 %02d', $i),
                'email'     => $i === 1 ? 'hoangminh.lead@podscare.vn' : sprintf('staff_s4_%02d_%s@podscare.vn', $i, uniqid()),
                'phone'     => $i === 1 ? '0905123123' : sprintf('09050000%02d', $i),
                'password'  => Hash::make('password123'),
                'role'      => 'technician',
                'is_active' => true,
            ]);
        }

        $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/users?page=1&per_page=15')
            ->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.total', 18)
            ->assertJsonCount(15, 'data.data');

        $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/users?page=2&per_page=15')
            ->assertStatus(200)
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonCount(3, 'data.data');

        $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/users?all=true')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 18)
            ->assertJsonCount(18, 'data.data');

        foreach (['Hoàng Minh Kỹ Thuật Trưởng', 'hoangminh.lead@podscare.vn', '0905123123'] as $kw) {
            $this->actingAs($this->adminTenantA, 'sanctum')
                ->getJson('/api/v1/users?q=' . urlencode($kw))
                ->assertStatus(200)
                ->assertJsonPath('data.total', 1)
                ->assertJsonPath('data.data.0.email', 'hoangminh.lead@podscare.vn');
        }

        // --- D. WORK SHIFTS & CASH TRANSACTIONS (/shifts & /cashbook/transactions) ---
        $targetShift = null;
        for ($i = 1; $i <= 17; $i++) {
            $shift = WorkShift::withoutGlobalScopes()->forceCreate([
                'tenant_id'            => $this->tenantA->id,
                'branch_id'            => $this->branchA1->id,
                'shift_code'           => $i === 1 ? 'SHF-261023-TARGET' : sprintf('SHF-261023-%03d', $i),
                'cashier_id'           => $this->cskhBranchA1->id,
                'opened_at'            => Carbon::now()->subHours(20 - $i),
                'closed_at'            => $i === 1 ? null : Carbon::now()->subHours(19 - $i),
                'status'               => $i === 1 ? 'open' : 'closed',
                'opening_cash'         => 2000000,
                'system_cash_in'       => 500000,
                'system_cash_out'      => 100000,
                'expected_cash'        => 2400000,
                'actual_cash'          => $i === 1 ? null : 2400000,
                'difference_amount'    => 0,
                'reconciliation_notes' => $i === 1 ? 'Ca sáng bàn giao két chuẩn SHIFT-NOTE-777' : "Ghi chú chốt ca {$i}",
            ]);
            if ($i === 1) {
                $targetShift = $shift;
            }
        }

        // Kiểm chứng GET /api/v1/shifts (page 1, page 2, per_page=all, search q)
        $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/shifts?page=1&per_page=15')
            ->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.total', 17)
            ->assertJsonCount(15, 'data.data');

        $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/shifts?page=2&per_page=15')
            ->assertStatus(200)
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonCount(2, 'data.data');

        $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/shifts?per_page=all')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 17)
            ->assertJsonCount(17, 'data.data');

        foreach (['SHF-261023-TARGET', 'SHIFT-NOTE-777'] as $kw) {
            $this->actingAs($this->adminTenantA, 'sanctum')
                ->getJson('/api/v1/shifts?q=' . urlencode($kw))
                ->assertStatus(200)
                ->assertJsonPath('data.total', 1)
                ->assertJsonPath('data.data.0.shift_code', 'SHF-261023-TARGET');
        }

        // Tạo 19 giao dịch tiền mặt (CashTransaction) tại Branch A1
        for ($i = 1; $i <= 19; $i++) {
            CashTransaction::withoutGlobalScopes()->forceCreate([
                'tenant_id'          => $this->tenantA->id,
                'branch_id'          => $this->branchA1->id,
                'shift_id'           => $targetShift->id,
                'transaction_code'   => $i === 1 ? 'CSH-S4-TARGET-01' : sprintf('CSH-S4-2026-%03d', $i),
                'type'               => $i === 1 ? 'expense' : 'income',
                'category'           => $i === 1 ? 'purchasing_parts' : 'repair_order_cash',
                'payment_method'     => 'cash',
                'amount'             => $i === 1 ? 350000 : 500000,
                'recipient_payer'    => $i === 1 ? 'Anh Tuấn Giao Linh Kiện' : "Khách thu ngân {$i}",
                'notes'              => $i === 1 ? 'Chi mua màn lọc bụi tai nghe khẩn cấp' : "Thu tiền sửa máy {$i}",
                'created_by_user_id' => $this->cskhBranchA1->id,
            ]);
        }

        // Kiểm chứng cả /api/v1/cashbook/transactions và alias /api/v1/cash-transactions
        foreach (['/api/v1/cashbook/transactions', '/api/v1/cash-transactions'] as $cashEndpoint) {
            $this->actingAs($this->cskhBranchA1, 'sanctum')
                ->getJson("{$cashEndpoint}?page=1&per_page=15")
                ->assertStatus(200)
                ->assertJsonPath('data.current_page', 1)
                ->assertJsonPath('data.total', 19)
                ->assertJsonCount(15, 'data.data');

            $this->actingAs($this->cskhBranchA1, 'sanctum')
                ->getJson("{$cashEndpoint}?page=2&per_page=15")
                ->assertStatus(200)
                ->assertJsonPath('data.current_page', 2)
                ->assertJsonCount(4, 'data.data');

            $this->actingAs($this->cskhBranchA1, 'sanctum')
                ->getJson("{$cashEndpoint}?per_page=all")
                ->assertStatus(200)
                ->assertJsonPath('data.total', 19)
                ->assertJsonCount(19, 'data.data');

            // Tìm kiếm txSearch trên server theo mã phiếu, người nhận, ghi chú và nhãn tiếng Việt "mua linh kiện"
            foreach ([
                'CSH-S4-TARGET-01',
                'Anh Tuấn Giao Linh Kiện',
                'Chi mua màn lọc bụi tai nghe khẩn cấp',
                'mua linh kiện',
            ] as $kw) {
                $this->actingAs($this->cskhBranchA1, 'sanctum')
                    ->getJson("{$cashEndpoint}?q=" . urlencode($kw))
                    ->assertStatus(200)
                    ->assertJsonPath('data.total', 1)
                    ->assertJsonPath('data.data.0.transaction_code', 'CSH-S4-TARGET-01');
            }
        }
    }

    /**
     * Phase 4 — Test 6:
     * GET /api/v1/platform/stores và GET /api/v1/platform/transactions (cùng alias /api/v1/platform/billing/transactions)
     * với quyền super_admin: hỗ trợ page, per_page, per_page=all / all=true, lọc status và tìm kiếm từ khóa q.
     */
    public function test_super_admin_platform_stores_and_billing_transactions_paginate_and_search(): void
    {
        $baselineTenants = Tenant::count();
        $baselineInvoices = SaasInvoice::count();

        $planId = 'plan_s4_pro_' . uniqid();
        $plan = SubscriptionPlan::create([
            'id'                   => $planId,
            'code'                 => 'PRO_S4',
            'name'                 => 'Gói Pro Chuyên Nghiệp S4',
            'price'                => 499000,
            'price_monthly'        => 499000,
            'price_yearly'         => 4990000,
            'billing_cycle'        => 'monthly',
            'max_branches'         => 5,
            'max_users'            => 20,
            'max_orders_per_month' => 2000,
            'features'             => ['warranty', 'inventory', 'sepay'],
            'is_active'            => true,
            'sort_order'           => 99,
        ]);

        // Tạo 18 gian hàng mới trên Platform và 18 hóa đơn SaaS tương ứng
        $targetStore = null;
        for ($i = 1; $i <= 18; $i++) {
            $store = Tenant::create([
                'code'            => $i === 1 ? 'store-s4-flagship-999' : sprintf('store-s4-%02d-%s', $i, uniqid()),
                'name'            => $i === 1 ? 'PodsCare Flagship Hà Nội S4' : sprintf('Cửa hàng Thuê Bao S4 %02d', $i),
                'phone'           => $i === 1 ? '0901999777' : sprintf('09018880%02d', $i),
                'email'           => $i === 1 ? 'flagship.hn@podscare.vn' : sprintf('store_s4_%02d@podscare.vn', $i),
                'status'          => $i <= 3 ? 'pending' : 'active',
                'plan'            => 'pro',
                'current_plan_id' => $plan->id,
            ]);
            if ($i === 1) {
                $targetStore = $store;
            }

            $invoice = SaasInvoice::create([
                'tenant_id'      => $store->id,
                'plan_id'        => $plan->id,
                'billing_cycle'  => 'monthly',
                'amount'         => 499000,
                'reference_code' => $i === 1 ? 'SAAS-INV-FLAGSHIP-999' : sprintf('SAAS-INV-S4-%03d-%s', $i, strtoupper(uniqid())),
                'status'         => 'paid',
                'payment_method' => 'sepay_vietqr',
                'paid_at'        => now(),
                'expires_at'     => now()->addMonth(),
            ]);

            if ($i === 1) {
                SepayTransaction::create([
                    'sepay_transaction_id' => 'SEPAY-TX-FLAGSHIP-999',
                    'saas_invoice_id'      => $invoice->id,
                    'reference_code'       => $invoice->reference_code,
                    'amount'               => 499000,
                    'accumulated'          => 499000,
                    'account_number'       => '0123456789',
                    'transaction_content'  => 'Thanh toan SAAS-INV-FLAGSHIP-999',
                    'bank_brand'           => 'Vietcombank',
                    'gateway'              => 'SePay',
                    'transaction_date'     => now(),
                ]);
            }
        }

        // 1. Chặn truy cập nếu không phải super_admin
        $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/platform/stores')
            ->assertStatus(403);

        // 2. Kiểm chứng GET /api/v1/platform/stores với quyền super_admin
        $expectedStores = $baselineTenants + 18;
        $resStoresP1 = $this->actingAs($this->superAdmin, 'sanctum')
            ->getJson('/api/v1/platform/stores?page=1&per_page=15');
        $resStoresP1->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.per_page', 15)
            ->assertJsonPath('data.total', $expectedStores);
        $this->assertCount(15, $resStoresP1->json('data.data'));

        $this->actingAs($this->superAdmin, 'sanctum')
            ->getJson('/api/v1/platform/stores?per_page=all')
            ->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.last_page', 1)
            ->assertJsonPath('data.total', $expectedStores);

        // Tìm kiếm q trên /api/v1/platform/stores
        foreach (['store-s4-flagship-999', 'PodsCare Flagship Hà Nội S4', '0901999777', 'flagship.hn@podscare.vn'] as $kw) {
            $this->actingAs($this->superAdmin, 'sanctum')
                ->getJson('/api/v1/platform/stores?q=' . urlencode($kw))
                ->assertStatus(200)
                ->assertJsonPath('data.total', 1)
                ->assertJsonPath('data.data.0.id', $targetStore->id);
        }

        // 3. Kiểm chứng GET /api/v1/platform/transactions và alias /api/v1/platform/billing/transactions
        $expectedInvoices = $baselineInvoices + 18;
        foreach (['/api/v1/platform/transactions', '/api/v1/platform/billing/transactions'] as $txEndpoint) {
            $resTxP1 = $this->actingAs($this->superAdmin, 'sanctum')
                ->getJson("{$txEndpoint}?page=1&per_page=15");
            $resTxP1->assertStatus(200)
                ->assertJsonPath('success', true)
                ->assertJsonPath('data.current_page', 1)
                ->assertJsonPath('data.per_page', 15)
                ->assertJsonPath('data.total', $expectedInvoices);
            $this->assertCount(15, $resTxP1->json('data.data'));

            $resTxAll = $this->actingAs($this->superAdmin, 'sanctum')
                ->getJson("{$txEndpoint}?all=true");
            $resTxAll->assertStatus(200)
                ->assertJsonPath('data.current_page', 1)
                ->assertJsonPath('data.last_page', 1)
                ->assertJsonPath('data.total', $expectedInvoices);

            foreach ([
                'SAAS-INV-FLAGSHIP-999',
                'PodsCare Flagship Hà Nội S4',
                'store-s4-flagship-999',
                'SEPAY-TX-FLAGSHIP-999',
            ] as $kw) {
                $this->actingAs($this->superAdmin, 'sanctum')
                    ->getJson("{$txEndpoint}?q=" . urlencode($kw))
                    ->assertStatus(200)
                    ->assertJsonPath('data.total', 1)
                    ->assertJsonPath('data.data.0.ref_code', 'SAAS-INV-FLAGSHIP-999')
                    ->assertJsonPath('data.data.0.status', 'completed')
                    ->assertJsonPath('data.data.0.bank', 'Vietcombank');
            }
        }
    }
}
