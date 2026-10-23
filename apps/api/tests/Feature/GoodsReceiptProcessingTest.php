<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\CashTransaction;
use App\Models\GoodsReceipt;
use App\Models\InventoryTransaction;
use App\Models\Part;
use App\Models\Supplier;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WorkShift;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class GoodsReceiptProcessingTest extends TestCase
{
    use DatabaseTransactions;
    protected Tenant $tenant;
    protected Branch $branch;
    protected User $adminUser;
    protected Supplier $supplier;
    protected Part $part;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::first() ?? Tenant::create([
            'name'      => 'FixO Test Tenant GR',
            'code'      => 'TENANT-GR-' . uniqid(),
            'is_active' => true,
        ]);

        $this->branch = Branch::where('tenant_id', $this->tenant->id)->first() ?? Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'CN-Q1-' . uniqid(),
            'address'   => '123 Lê Lợi, Q.1',
            'phone'     => '0901000001',
            'is_active' => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin GR Test',
            'email'     => 'admin_gr_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'admin',
        ]);

        $this->supplier = Supplier::create([
            'tenant_id'    => $this->tenant->id,
            'code'         => 'SUP-GR-' . uniqid(),
            'name'         => 'Nhà Phân Phối Linh Kiện Apple Sài Gòn',
            'phone'        => '0909888777',
            'debt_balance' => 0.00,
            'is_active'    => true,
        ]);

        $this->part = Part::create([
            'tenant_id'        => $this->tenant->id,
            'sku'              => 'PART-TEST-' . uniqid(),
            'name'             => 'Pin AirPods Pro 2 Chính Hãng',
            'category'         => 'battery',
            'storage_location' => 'Kệ A1',
            'stock_quantity'   => 10,
            'min_stock_alert'  => 3,
            'cost_price'       => 100000.00,
            'retail_price'     => 350000.00,
            'unit'             => 'viên',
            'is_active'        => true,
        ]);

        BranchPart::create([
            'branch_id'       => $this->branch->id,
            'part_id'         => $this->part->id,
            'stock_quantity'  => 10,
            'min_stock_alert' => 3,
        ]);

        // Đóng các ca trực cũ
        WorkShift::where('tenant_id', $this->tenant->id)
            ->where('branch_id', $this->branch->id)
            ->update(['status' => 'closed', 'closed_at' => Carbon::now()]);
    }

    /**
     * Test 1: Tạo phiếu nhập kho thanh toán tiền mặt trừ két ca trực (HTTP 201).
     */
    public function test_goods_receipt_with_immediate_cash_payment_deducts_shift_drawer(): void
    {
        $shift = WorkShift::create([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch->id,
            'shift_code'      => 'WS-GR-' . uniqid(),
            'cashier_id'      => $this->adminUser->id,
            'opened_at'       => Carbon::now(),
            'status'          => 'open',
            'opening_cash'    => 2000000,
            'system_cash_in'  => 0,
            'system_cash_out' => 0,
            'expected_cash'   => 2000000,
        ]);

        $payload = [
            'supplier_id'    => $this->supplier->id,
            'branch_id'      => $this->branch->id,
            'paid_amount'    => 1000000,
            'payment_method' => 'cash',
            'notes'          => 'Nhập khẩn cấp đợt 1',
            'items'          => [
                [
                    'part_id'    => $this->part->id,
                    'quantity'   => 5,
                    'unit_price' => 200000,
                ],
            ],
        ];

        $response = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/goods-receipts', $payload);

        $response->assertStatus(201);
        $gr = $response->json('data');

        $this->assertEquals(1000000, (float) $gr['total_amount']);
        $this->assertEquals(1000000, (float) $gr['paid_amount']);
        $this->assertEquals(0, (float) $gr['debt_amount']);
        $this->assertNotNull($gr['cash_transaction_id']);

        // Kiểm tra số dư két ca trực bị trừ
        $shift->refresh();
        $this->assertEquals(1000000, (float) $shift->system_cash_out);
        $this->assertEquals(1000000, (float) $shift->expected_cash);

        // Kiểm tra phiếu chi CashTransaction
        $cashTx = CashTransaction::find($gr['cash_transaction_id']);
        $this->assertNotNull($cashTx);
        $this->assertEquals('purchasing_parts', $cashTx->category);
        $this->assertEquals(1000000, (float) $cashTx->amount);
        $this->assertEquals($shift->id, $cashTx->shift_id);
    }

    /**
     * Test 2: Từ chối thanh toán tiền mặt khi két ca trực không đủ số dư (HTTP 422).
     */
    public function test_reject_cash_goods_receipt_when_drawer_insufficient(): void
    {
        $shift = WorkShift::create([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch->id,
            'shift_code'      => 'WS-GR-' . uniqid(),
            'cashier_id'      => $this->adminUser->id,
            'opened_at'       => Carbon::now(),
            'status'          => 'open',
            'opening_cash'    => 300000, // Chỉ có 300.000 ₫
            'system_cash_in'  => 0,
            'system_cash_out' => 0,
            'expected_cash'   => 300000,
        ]);

        $payload = [
            'supplier_id'    => $this->supplier->id,
            'branch_id'      => $this->branch->id,
            'paid_amount'    => 1000000, // Muốn chi 1.000.000 ₫
            'payment_method' => 'cash',
            'items'          => [
                [
                    'part_id'    => $this->part->id,
                    'quantity'   => 5,
                    'unit_price' => 200000,
                ],
            ],
        ];

        $response = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/goods-receipts', $payload);

        $response->assertStatus(422);
        $this->assertStringContainsString('không đủ', $response->json('message'));

        // Kiểm tra tồn kho và ca trực không bị thay đổi
        $shift->refresh();
        $this->assertEquals(300000, (float) $shift->expected_cash);
        $this->assertEquals(0, (float) $shift->system_cash_out);
        $this->assertEquals(10, $this->part->fresh()->stock_quantity);
    }

    /**
     * Test 3: Thanh toán chuyển khoản ngân hàng không bị ràng buộc bởi két tiền mặt (HTTP 201).
     */
    public function test_immediate_bank_transfer_goods_receipt_without_shift_restriction(): void
    {
        // Không mở ca trực nào
        $this->assertFalse(WorkShift::where('branch_id', $this->branch->id)->where('status', 'open')->exists());

        $payload = [
            'supplier_id'    => $this->supplier->id,
            'branch_id'      => $this->branch->id,
            'paid_amount'    => 5000000,
            'payment_method' => 'bank_transfer',
            'items'          => [
                [
                    'part_id'    => $this->part->id,
                    'quantity'   => 25,
                    'unit_price' => 200000,
                ],
            ],
        ];

        $response = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/goods-receipts', $payload);

        $response->assertStatus(201);
        $gr = $response->json('data');

        $this->assertEquals('bank_transfer', $gr['payment_method']);
        $this->assertEquals(5000000, (float) $gr['paid_amount']);

        $cashTx = CashTransaction::find($gr['cash_transaction_id']);
        $this->assertNotNull($cashTx);
        $this->assertEquals('bank_transfer', $cashTx->payment_method);
        $this->assertNull($cashTx->shift_id);
    }

    /**
     * Test 4: Kiểm thử tính toán chính xác Giá vốn bình quân di động (MAC) và tăng tồn kho.
     * Tồn cũ: 10 cái @ 100.000 ₫
     * Nhập mới: 10 cái @ 200.000 ₫
     * Giá vốn mới kỳ vọng: (10 * 100.000 + 10 * 200.000) / 20 = 150.000 ₫.
     * Tồn kho mới kỳ vọng: 20 cái.
     */
    public function test_moving_average_cost_calculation_and_inventory_stock_increment(): void
    {
        $payload = [
            'supplier_id'    => $this->supplier->id,
            'branch_id'      => $this->branch->id,
            'paid_amount'    => 2000000,
            'payment_method' => 'bank_transfer',
            'items'          => [
                [
                    'part_id'    => $this->part->id,
                    'quantity'   => 10,
                    'unit_price' => 200000,
                ],
            ],
        ];

        $response = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/goods-receipts', $payload);

        $response->assertStatus(201);

        // Kiểm tra Part MAC & Stock
        $updatedPart = $this->part->fresh();
        $this->assertEquals(150000.00, (float) $updatedPart->cost_price);
        $this->assertEquals(20, (int) $updatedPart->stock_quantity);

        // Kiểm tra BranchPart stock
        $branchPart = BranchPart::where('branch_id', $this->branch->id)->where('part_id', $this->part->id)->first();
        $this->assertEquals(20, (int) $branchPart->stock_quantity);

        // Kiểm tra bản ghi giao dịch kho InventoryTransaction loại import_supplier
        $this->assertDatabaseHas('inventory_transactions', [
            'part_id'          => $this->part->id,
            'branch_id'        => $this->branch->id,
            'transaction_type' => 'import_supplier',
            'quantity'         => 10,
            'unit_cost'        => 200000.00,
        ]);
    }
}
