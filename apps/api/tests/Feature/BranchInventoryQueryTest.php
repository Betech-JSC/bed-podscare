<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\Part;
use App\Models\Tenant;
use App\Models\User;
use Tests\TestCase;

class BranchInventoryQueryTest extends TestCase
{
    protected Tenant $tenant;
    protected Branch $branchA;
    protected Branch $branchB;
    protected User $adminUser;
    protected User $techBranchA;
    protected User $techBranchB;
    protected Part $part1;
    protected Part $part2;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::first() ?? Tenant::create([
            'name'      => 'FixO Branch Inventory Tenant',
            'code'      => 'FIXO-BR-INV',
            'is_active' => true,
        ]);

        $this->branchA = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'CN-Q1-' . uniqid(),
            'address'   => '100 Nguyễn Huệ, Q.1',
            'phone'     => '0901000101',
            'is_active' => true,
        ]);

        $this->branchB = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Bình Thạnh',
            'code'      => 'CN-BT-' . uniqid(),
            'address'   => '200 Điện Biên Phủ, Bình Thạnh',
            'phone'     => '0901000102',
            'is_active' => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'Admin Branch Query',
            'email'     => 'admin_br_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'admin',
        ]);

        $this->techBranchA = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'KTV Chi Nhánh A',
            'email'     => 'tech_a_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'technician',
        ]);

        $this->techBranchB = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branchB->id,
            'name'      => 'KTV Chi Nhánh B',
            'email'     => 'tech_b_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'technician',
        ]);

        // Tạo linh kiện 1: Tồn kho dồi dào ở CN-A (15 cái), cạn kiệt ở CN-B (1 cái, min_alert = 3)
        $this->part1 = Part::create([
            'tenant_id'        => $this->tenant->id,
            'sku'              => 'PIN-PRO2-' . uniqid(),
            'name'             => 'Pin Tai Nghe Pro 2',
            'category'         => 'battery',
            'storage_location' => 'Kệ B1-01',
            'stock_quantity'   => 16,
            'min_stock_alert'  => 5,
            'cost_price'       => 180000,
            'retail_price'     => 400000,
            'is_active'        => true,
        ]);

        BranchPart::create([
            'branch_id'       => $this->branchA->id,
            'part_id'         => $this->part1->id,
            'stock_quantity'  => 15,
            'min_stock_alert' => 5,
        ]);

        BranchPart::create([
            'branch_id'       => $this->branchB->id,
            'part_id'         => $this->part1->id,
            'stock_quantity'  => 1,
            'min_stock_alert' => 3,
        ]);

        // Tạo linh kiện 2: Chỉ có ở CN-A (8 cái), CN-B chưa từng nhập (chưa có bản ghi branch_parts)
        $this->part2 = Part::create([
            'tenant_id'        => $this->tenant->id,
            'sku'              => 'VO-PRO2-' . uniqid(),
            'name'             => 'Vỏ Case Sạc Pro 2',
            'category'         => 'case',
            'storage_location' => 'Kệ B2-01',
            'stock_quantity'   => 8,
            'min_stock_alert'  => 2,
            'cost_price'       => 250000,
            'retail_price'     => 600000,
            'is_active'        => true,
        ]);

        BranchPart::create([
            'branch_id'       => $this->branchA->id,
            'part_id'         => $this->part2->id,
            'stock_quantity'  => 8,
            'min_stock_alert' => 2,
        ]);
    }

    /**
     * Test 1: Nhân viên chi nhánh A nhận được danh sách tồn kho đúng của chi nhánh A.
     */
    public function test_non_admin_user_receives_inventory_scoped_to_assigned_branch(): void
    {
        $response = $this->actingAs($this->techBranchA, 'sanctum')->getJson('/api/v1/inventory/parts?q=Pro+2&per_page=100');
        $response->assertStatus(200);

        $parts = $response->json('data.data');
        $item1 = collect($parts)->firstWhere('id', $this->part1->id);
        $item2 = collect($parts)->firstWhere('id', $this->part2->id);

        $this->assertNotNull($item1);
        $this->assertEquals(15, $item1['stock_quantity']);
        $this->assertEquals(5, $item1['min_stock_alert']);
        $this->assertArrayNotHasKey('cost_price', $item1); // Non-admin bị ẩn giá vốn

        $this->assertNotNull($item2);
        $this->assertEquals(8, $item2['stock_quantity']);
    }

    /**
     * Test 2: Nhân viên chi nhánh B nhận được tồn kho cách ly của chi nhánh B, part2 chưa nhập kho mặc định tồn = 0.
     */
    public function test_branch_b_user_sees_branch_b_stock_and_zero_for_unstocked_parts(): void
    {
        $response = $this->actingAs($this->techBranchB, 'sanctum')->getJson('/api/v1/inventory/parts?q=Pro+2&per_page=100');
        $response->assertStatus(200);

        $parts = $response->json('data.data');
        $item1 = collect($parts)->firstWhere('id', $this->part1->id);
        $item2 = collect($parts)->firstWhere('id', $this->part2->id);

        $this->assertNotNull($item1);
        $this->assertEquals(1, $item1['stock_quantity']); // Tại CN-B chỉ có 1 cái
        $this->assertEquals(3, $item1['min_stock_alert']);

        $this->assertNotNull($item2);
        $this->assertEquals(0, $item2['stock_quantity']); // Chưa có branch_part tại CN-B -> tồn = 0
    }

    /**
     * Test 3: Quản trị viên lọc theo branch_id nhận đúng số tồn kho của chi nhánh được chọn.
     */
    public function test_admin_can_filter_parts_inventory_by_branch_id(): void
    {
        // Admin xem chi nhánh B
        $responseB = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/inventory/parts?branch_id={$this->branchB->id}&q=Pro+2&per_page=100");
        $responseB->assertStatus(200);

        $item1B = collect($responseB->json('data.data'))->firstWhere('id', $this->part1->id);
        $this->assertEquals(1, $item1B['stock_quantity']);
        $this->assertArrayHasKey('cost_price', $item1B); // Admin thấy được giá vốn

        // Admin xem chi nhánh A
        $responseA = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/inventory/parts?branch_id={$this->branchA->id}&q=Pro+2&per_page=100");
        $responseA->assertStatus(200);

        $item1A = collect($responseA->json('data.data'))->firstWhere('id', $this->part1->id);
        $this->assertEquals(15, $item1A['stock_quantity']);
    }

    /**
     * Test 4: Bộ lọc low_stock=true đánh giá chính xác ngưỡng cảnh báo tại cấp chi nhánh.
     */
    public function test_low_stock_filter_evaluates_against_branch_specific_threshold(): void
    {
        // Tại CN-A: part1 có 15 cái (ngưỡng 5) -> Không low stock
        $respA = $this->actingAs($this->techBranchA, 'sanctum')
            ->getJson('/api/v1/inventory/parts?low_stock=true&q=Pro+2&per_page=100');
        $respA->assertStatus(200);
        $lowStockA = collect($respA->json('data.data'))->pluck('id')->all();
        $this->assertNotContains($this->part1->id, $lowStockA);

        // Tại CN-B: part1 có 1 cái (ngưỡng 3) -> Low stock!
        $respB = $this->actingAs($this->techBranchB, 'sanctum')
            ->getJson('/api/v1/inventory/parts?low_stock=true&q=Pro+2&per_page=100');
        $respB->assertStatus(200);
        $lowStockB = collect($respB->json('data.data'))->pluck('id')->all();
        $this->assertContains($this->part1->id, $lowStockB);
    }
}
