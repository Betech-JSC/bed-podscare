<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Supplier;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class SupplierManagementTest extends TestCase
{
    use DatabaseTransactions;
    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected Branch $branchA;
    protected Branch $branchB;
    protected User $adminUser;
    protected User $techUser;
    protected User $cskhUser;
    protected User $adminUserB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenantA = Tenant::first() ?? Tenant::create([
            'name'      => 'FixO Test Tenant A',
            'code'      => 'TENANT-A-' . uniqid(),
            'is_active' => true,
        ]);

        $this->tenantB = Tenant::where('id', '!=', $this->tenantA->id)->first() ?? Tenant::create([
            'name'      => 'FixO Test Tenant B',
            'code'      => 'TENANT-B-' . uniqid(),
            'is_active' => true,
        ]);

        $this->branchA = Branch::where('tenant_id', $this->tenantA->id)->first() ?? Branch::create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'CN-Q1-' . uniqid(),
            'address'   => '123 Lê Lợi, Q.1',
            'phone'     => '0901000001',
            'is_active' => true,
        ]);

        $this->branchB = Branch::where('tenant_id', $this->tenantB->id)->first() ?? Branch::create([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Chi nhánh Quận 3',
            'code'      => 'CN-Q3-' . uniqid(),
            'address'   => '456 CMT8, Q.3',
            'phone'     => '0901000002',
            'is_active' => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'Admin Supplier Test',
            'email'     => 'admin_sup_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'admin',
        ]);

        $this->techUser = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'KTV Supplier Test',
            'email'     => 'tech_sup_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'technician',
        ]);

        $this->cskhUser = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'CSKH Supplier Test',
            'email'     => 'cskh_sup_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'cskh',
        ]);

        $this->adminUserB = User::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'branch_id' => $this->branchB->id,
            'name'      => 'Admin B Test',
            'email'     => 'admin_b_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'admin',
        ]);
    }

    /**
     * Test 1: Admin tạo thành công nhà cung cấp với số dư nợ ban đầu bằng 0 (HTTP 201).
     */
    public function test_admin_can_create_supplier_with_zero_debt(): void
    {
        $payload = [
            'name'     => 'Công ty Linh Kiện Hoàng Gia',
            'phone'    => '0988776655',
            'email'    => 'contact@hoanggia.vn',
            'address'  => '99 Huỳnh Thúc Kháng, Q.1',
            'tax_code' => '0312345678',
            'notes'    => 'Chuyên cung cấp màn hình và vỏ AirPods chính hãng',
        ];

        $response = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/suppliers', $payload);

        $response->assertStatus(201);
        $data = $response->json('data');

        $this->assertEquals('Công ty Linh Kiện Hoàng Gia', $data['name']);
        $this->assertEquals('0988776655', $data['phone']);
        $this->assertEquals(0, (float) $data['debt_balance']);
        $this->assertNotEmpty($data['code']);
        $this->assertEquals($this->tenantA->id, $data['tenant_id']);

        $this->assertDatabaseHas('suppliers', [
            'tenant_id'    => $this->tenantA->id,
            'name'         => 'Công ty Linh Kiện Hoàng Gia',
            'debt_balance' => 0.00,
        ]);
    }

    /**
     * Test 2: Nhân viên Kỹ thuật và CSKH bị chặn truy cập quản lý nhà cung cấp (HTTP 403).
     */
    public function test_non_admin_staff_blocked_from_supplier_management(): void
    {
        // Technician
        $resTechList = $this->actingAs($this->techUser, 'sanctum')->getJson('/api/v1/suppliers');
        $resTechList->assertStatus(403);

        $resTechCreate = $this->actingAs($this->techUser, 'sanctum')->postJson('/api/v1/suppliers', [
            'name'  => 'Nhà Cung Cấp Lậu',
            'phone' => '0911223344',
        ]);
        $resTechCreate->assertStatus(403);

        // CSKH
        $resCskhList = $this->actingAs($this->cskhUser, 'sanctum')->getJson('/api/v1/suppliers');
        $resCskhList->assertStatus(403);
    }

    /**
     * Test 3: Từ chối tạo nhà cung cấp khi thiếu tên hoặc số điện thoại (HTTP 422).
     */
    public function test_validation_error_when_required_fields_missing(): void
    {
        $response = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/suppliers', [
            'email' => 'missing_name_and_phone@test.vn',
        ]);

        $response->assertStatus(422);
        $errors = $response->json('errors');
        $this->assertArrayHasKey('name', $errors);
        $this->assertArrayHasKey('phone', $errors);
    }

    /**
     * Test 4: Admin xem danh sách và chi tiết nhà cung cấp (HTTP 200).
     */
    public function test_admin_can_view_supplier_list_and_detail(): void
    {
        $supplier = Supplier::create([
            'tenant_id'    => $this->tenantA->id,
            'code'         => 'SUP-DETAIL-' . uniqid(),
            'name'         => 'NCC Chi Tiết Test',
            'phone'        => '0933112233',
            'debt_balance' => 0,
            'is_active'    => true,
        ]);

        $resList = $this->actingAs($this->adminUser, 'sanctum')->getJson('/api/v1/suppliers');
        $resList->assertStatus(200);

        $resDetail = $this->actingAs($this->adminUser, 'sanctum')->getJson("/api/v1/suppliers/{$supplier->id}");
        $resDetail->assertStatus(200);
        $this->assertEquals($supplier->name, $resDetail->json('data.name'));
    }

    /**
     * Test 5: Admin cập nhật thông tin nhà cung cấp (HTTP 200).
     */
    public function test_admin_can_update_supplier(): void
    {
        $supplier = Supplier::create([
            'tenant_id'    => $this->tenantA->id,
            'code'         => 'SUP-UPDATE-' . uniqid(),
            'name'         => 'NCC Cũ',
            'phone'        => '0933112233',
            'debt_balance' => 0,
            'is_active'    => true,
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')->putJson("/api/v1/suppliers/{$supplier->id}", [
            'name'  => 'NCC Đã Đổi Tên',
            'phone' => '0988999888',
        ]);

        $response->assertStatus(200);
        $this->assertEquals('NCC Đã Đổi Tên', $response->json('data.name'));
        $this->assertEquals('0988999888', $response->json('data.phone'));
    }

    /**
     * Test 6: Không cho phép xóa nhà cung cấp đang có nợ (HTTP 422).
     */
    public function test_cannot_delete_supplier_with_outstanding_debt(): void
    {
        $supplier = Supplier::create([
            'tenant_id'    => $this->tenantA->id,
            'code'         => 'SUP-DEBT-' . uniqid(),
            'name'         => 'NCC Còn Nợ',
            'phone'        => '0933112233',
            'debt_balance' => 1500000,
            'is_active'    => true,
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')->deleteJson("/api/v1/suppliers/{$supplier->id}");
        $response->assertStatus(422);
        $this->assertStringContainsString('công nợ', $response->json('message'));
    }

    /**
     * Test 7: Cách ly dữ liệu nhiều người thuê (Tenant Isolation).
     */
    public function test_tenant_isolation_on_suppliers(): void
    {
        $supplierA = Supplier::create([
            'tenant_id'    => $this->tenantA->id,
            'code'         => 'SUP-A-' . uniqid(),
            'name'         => 'NCC Riêng Của Tenant A',
            'phone'        => '0901234567',
            'debt_balance' => 0,
            'is_active'    => true,
        ]);

        // Admin Tenant B không thấy và không thao tác được supplier của Tenant A
        $response = $this->actingAs($this->adminUserB, 'sanctum')->getJson("/api/v1/suppliers/{$supplierA->id}");
        $response->assertStatus(404);
    }
}
