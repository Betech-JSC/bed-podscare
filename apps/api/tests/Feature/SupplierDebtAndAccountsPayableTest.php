<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\CashTransaction;
use App\Models\GoodsReceipt;
use App\Models\Part;
use App\Models\Supplier;
use App\Models\SupplierDebtTransaction;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WorkShift;
use Carbon\Carbon;
use Tests\TestCase;

class SupplierDebtAndAccountsPayableTest extends TestCase
{
    protected Tenant $tenant;
    protected Branch $branch;
    protected User $adminUser;
    protected User $techUser;
    protected Supplier $supplier;
    protected Part $part;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::first() ?? Tenant::create([
            'name'      => 'FixO AP Test Tenant',
            'code'      => 'TENANT-AP-' . uniqid(),
            'is_active' => true,
        ]);

        $this->branch = Branch::where('tenant_id', $this->tenant->id)->first() ?? Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'CN-AP-' . uniqid(),
            'address'   => '123 Lê Lợi, Q.1',
            'phone'     => '0901000001',
            'is_active' => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin AP Test',
            'email'     => 'admin_ap_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'admin',
        ]);

        $this->techUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Tech AP Test',
            'email'     => 'tech_ap_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'technician',
        ]);

        $this->supplier = Supplier::create([
            'tenant_id'    => $this->tenant->id,
            'code'         => 'SUP-AP-' . uniqid(),
            'name'         => 'Tổng Kho Linh Kiện Sài Gòn',
            'phone'        => '0988001122',
            'debt_balance' => 0.00,
            'is_active'    => true,
        ]);

        $this->part = Part::create([
            'tenant_id'        => $this->tenant->id,
            'sku'              => 'PART-AP-' . uniqid(),
            'name'             => 'Màn hình AirPods Pro OLED',
            'category'         => 'screen',
            'storage_location' => 'Kệ B2',
            'stock_quantity'   => 5,
            'min_stock_alert'  => 2,
            'cost_price'       => 500000.00,
            'retail_price'     => 1200000.00,
            'unit'             => 'cái',
            'is_active'        => true,
        ]);

        BranchPart::create([
            'branch_id'       => $this->branch->id,
            'part_id'         => $this->part->id,
            'stock_quantity'  => 5,
            'min_stock_alert' => 2,
        ]);

        WorkShift::where('tenant_id', $this->tenant->id)
            ->where('branch_id', $this->branch->id)
            ->update(['status' => 'closed', 'closed_at' => Carbon::now()]);
    }

    /**
     * Test 1: Phiếu nhập kho thanh toán một phần phát sinh công nợ NCC và tạo bản ghi purchase_debt.
     */
    public function test_goods_receipt_with_partial_payment_creates_supplier_debt(): void
    {
        $payload = [
            'supplier_id'    => $this->supplier->id,
            'branch_id'      => $this->branch->id,
            'paid_amount'    => 1000000,
            'payment_method' => 'bank_transfer',
            'items'          => [
                [
                    'part_id'    => $this->part->id,
                    'quantity'   => 6,
                    'unit_price' => 500000, // Total = 3.000.000
                ],
            ],
        ];

        $response = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/goods-receipts', $payload);

        $response->assertStatus(201);
        $gr = $response->json('data');

        $this->assertEquals(3000000, (float) $gr['total_amount']);
        $this->assertEquals(1000000, (float) $gr['paid_amount']);
        $this->assertEquals(2000000, (float) $gr['debt_amount']);

        // Kiểm tra số dư nợ NCC
        $this->supplier->refresh();
        $this->assertEquals(2000000, (float) $this->supplier->debt_balance);

        // Kiểm tra biến động công nợ
        $this->assertDatabaseHas('supplier_debt_transactions', [
            'supplier_id'      => $this->supplier->id,
            'goods_receipt_id' => $gr['id'],
            'transaction_type' => 'purchase_debt',
            'amount'           => 2000000.00,
            'debt_before'      => 0.00,
            'debt_after'       => 2000000.00,
        ]);
    }

    /**
     * Test 2: Phiếu nhập kho không trả trước (paid_amount = 0) ghi nhận toàn bộ đơn hàng vào công nợ.
     */
    public function test_goods_receipt_with_zero_down_payment_accrues_full_order_debt(): void
    {
        $payload = [
            'supplier_id'    => $this->supplier->id,
            'branch_id'      => $this->branch->id,
            'paid_amount'    => 0,
            'items'          => [
                [
                    'part_id'    => $this->part->id,
                    'quantity'   => 4,
                    'unit_price' => 500000, // Total = 2.000.000
                ],
            ],
        ];

        $response = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/goods-receipts', $payload);

        $response->assertStatus(201);
        $gr = $response->json('data');

        $this->assertEquals(0, (float) $gr['paid_amount']);
        $this->assertEquals(2000000, (float) $gr['debt_amount']);
        $this->assertNull($gr['cash_transaction_id']);

        $this->supplier->refresh();
        $this->assertEquals(2000000, (float) $this->supplier->debt_balance);
    }

    /**
     * Test 3: Trả nợ NCC bằng tiền mặt khi két ca trực đủ tiền (HTTP 201).
     */
    public function test_repay_supplier_debt_cash_with_sufficient_drawer(): void
    {
        $this->supplier->update(['debt_balance' => 3000000]);

        $shift = WorkShift::create([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch->id,
            'shift_code'      => 'WS-REPAY-' . uniqid(),
            'cashier_id'      => $this->adminUser->id,
            'opened_at'       => Carbon::now(),
            'status'          => 'open',
            'opening_cash'    => 5000000,
            'system_cash_in'  => 0,
            'system_cash_out' => 0,
            'expected_cash'   => 5000000,
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')->postJson("/api/v1/suppliers/{$this->supplier->id}/payments", [
            'amount'         => 2000000,
            'payment_method' => 'cash',
            'branch_id'      => $this->branch->id,
            'notes'          => 'Thanh toán đợt 1 nợ tháng 10',
        ]);

        $response->assertStatus(201);
        $data = $response->json('data');

        $this->assertEquals('debt_payment', $data['transaction_type']);
        $this->assertEquals(2000000, (float) $data['amount']);
        $this->assertEquals(3000000, (float) $data['debt_before']);
        $this->assertEquals(1000000, (float) $data['debt_after']);

        // Kiểm tra số dư nợ NCC
        $this->supplier->refresh();
        $this->assertEquals(1000000, (float) $this->supplier->debt_balance);

        // Kiểm tra két ca trực bị trừ
        $shift->refresh();
        $this->assertEquals(2000000, (float) $shift->system_cash_out);
        $this->assertEquals(3000000, (float) $shift->expected_cash);

        // Kiểm tra phiếu chi CashTransaction
        $this->assertDatabaseHas('cash_transactions', [
            'shift_id'        => $shift->id,
            'type'            => 'expense',
            'category'        => 'supplier_payable',
            'amount'          => 2000000.00,
            'payment_method'  => 'cash',
        ]);
    }

    /**
     * Test 4: Từ chối trả nợ tiền mặt khi két ca trực không đủ số dư (HTTP 422).
     */
    public function test_reject_cash_debt_payment_when_drawer_insufficient(): void
    {
        $this->supplier->update(['debt_balance' => 3000000]);

        $shift = WorkShift::create([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch->id,
            'shift_code'      => 'WS-REPAY-' . uniqid(),
            'cashier_id'      => $this->adminUser->id,
            'opened_at'       => Carbon::now(),
            'status'          => 'open',
            'opening_cash'    => 500000, // Chỉ có 500k
            'system_cash_in'  => 0,
            'system_cash_out' => 0,
            'expected_cash'   => 500000,
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')->postJson("/api/v1/suppliers/{$this->supplier->id}/payments", [
            'amount'         => 2000000, // Trả 2tr
            'payment_method' => 'cash',
            'branch_id'      => $this->branch->id,
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('không đủ', $response->json('message'));

        $this->supplier->refresh();
        $this->assertEquals(3000000, (float) $this->supplier->debt_balance);
        $shift->refresh();
        $this->assertEquals(500000, (float) $shift->expected_cash);
    }

    /**
     * Test 5: Từ chối trả nợ vượt quá số dư nợ hiện tại của NCC (HTTP 422).
     */
    public function test_reject_debt_payment_exceeding_current_supplier_debt(): void
    {
        $this->supplier->update(['debt_balance' => 2000000]);

        $response = $this->actingAs($this->adminUser, 'sanctum')->postJson("/api/v1/suppliers/{$this->supplier->id}/payments", [
            'amount'         => 5000000, // Trả 5tr trong khi nợ 2tr
            'payment_method' => 'bank_transfer',
            'branch_id'      => $this->branch->id,
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('vượt quá số dư nợ', $response->json('message'));

        $this->supplier->refresh();
        $this->assertEquals(2000000, (float) $this->supplier->debt_balance);
    }

    /**
     * Test 6: Chỉ số Accounts Payable hiển thị chính xác trên Dashboard KPI cho Admin.
     */
    public function test_accounts_payable_reflected_on_dashboard_kpi_for_admin(): void
    {
        // Reset nợ của nhà cung cấp test
        Supplier::where('tenant_id', $this->tenant->id)->update(['debt_balance' => 0]);

        $this->supplier->update(['debt_balance' => 2000000, 'is_active' => true]);

        $supplier2 = Supplier::create([
            'tenant_id'    => $this->tenant->id,
            'code'         => 'SUP-KPI-' . uniqid(),
            'name'         => 'NCC Linh Kiện 2',
            'phone'        => '0912345678',
            'debt_balance' => 3000000,
            'is_active'    => true,
        ]);

        $supplierInactive = Supplier::create([
            'tenant_id'    => $this->tenant->id,
            'code'         => 'SUP-INACTIVE-' . uniqid(),
            'name'         => 'NCC Đã Ngừng Hoạt Động',
            'phone'        => '0912345679',
            'debt_balance' => 1000000,
            'is_active'    => false, // Không tính NCC đã ngừng hoạt động
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')->getJson('/api/v1/kpi/dashboard');

        $response->assertStatus(200);
        $data = $response->json('data');

        $this->assertArrayHasKey('accounts_payable', $data);
        $this->assertArrayHasKey('accounts_payable_formatted', $data);
        $this->assertEquals(5000000, (float) $data['accounts_payable']);
        $this->assertEquals('5tr ₫', $data['accounts_payable_formatted']);
    }

    /**
     * Test 7: Người dùng phi quản trị (Technician) không thấy chỉ số accounts_payable trên Dashboard KPI.
     */
    public function test_non_admin_cannot_see_accounts_payable_on_dashboard(): void
    {
        $response = $this->actingAs($this->techUser, 'sanctum')->getJson('/api/v1/kpi/dashboard');

        $response->assertStatus(200);
        $data = $response->json('data');

        $this->assertArrayNotHasKey('accounts_payable', $data);
        $this->assertArrayNotHasKey('accounts_payable_formatted', $data);
    }
}
