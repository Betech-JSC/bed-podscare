<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\InventoryTransaction;
use App\Models\Part;
use App\Models\QuoteItem;
use App\Models\RepairOrder;
use App\Models\RepairQuote;
use App\Models\Tenant;
use App\Models\User;
use App\Services\OrderWorkflowService;
use Carbon\Carbon;
use Tests\TestCase;

class OrderInventoryAutomationTest extends TestCase
{
    protected Tenant $tenant;
    protected Branch $branch;
    protected User $adminUser;
    protected User $technicianUser;
    protected Customer $customer;
    protected DeviceModel $device;
    protected Part $part;
    protected BranchPart $branchPart;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::first() ?? Tenant::create([
            'name'      => 'FixO Inventory Tenant',
            'code'      => 'FIXO-INV',
            'is_active' => true,
        ]);

        $this->branch = Branch::where('tenant_id', $this->tenant->id)->first() ?? Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Kho Test',
            'code'      => 'CN-KHO',
            'address'   => '789 Trần Hưng Đạo, Q.5',
            'phone'     => '0901000002',
            'is_active' => true,
        ]);

        $this->adminUser = User::where('tenant_id', $this->tenant->id)->where('role', 'admin')->first() ?? User::create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Kho Test',
            'email'     => 'admin_kho_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'admin',
        ]);

        $this->technicianUser = User::where('tenant_id', $this->tenant->id)->where('role', 'technician')->first() ?? User::create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'KTV Kho Test',
            'email'     => 'tech_kho_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'technician',
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Kho Test',
            'phone'     => '0977' . rand(100000, 999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods 3',
            'category'     => 'AirPods',
            'model_code'   => 'A2564',
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);

        // Tạo linh kiện và tồn kho chi nhánh
        $this->part = Part::create([
            'tenant_id'        => $this->tenant->id,
            'sku'              => 'PART-TEST-' . uniqid(),
            'name'             => 'Pin AirPods 3 Zin',
            'category'         => 'battery',
            'storage_location' => 'Kệ A1-02',
            'stock_quantity'   => 20,
            'min_stock_alert'  => 5,
            'cost_price'       => 150000,
            'retail_price'     => 350000,
            'is_active'        => true,
        ]);

        $this->branchPart = BranchPart::create([
            'branch_id'       => $this->branch->id,
            'part_id'         => $this->part->id,
            'stock_quantity'  => 10,
            'min_stock_alert' => 3,
        ]);
    }

    private function createOrderWithQuote(int $partQty = 1): RepairOrder
    {
        $order = RepairOrder::create([
            'tenant_id'           => $this->tenant->id,
            'order_code'          => 'PC26-' . strtoupper(bin2hex(random_bytes(4))) . rand(100, 999),
            'branch_id'           => $this->branch->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->device->id,
            'issue_description'   => 'Thay pin',
            'status'              => 'ready_for_return',
            'total_price'         => 350000 * $partQty,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $this->adminUser->id,
            'technician_id'       => $this->technicianUser->id,
        ]);

        $quote = RepairQuote::create([
            'tenant_id'           => $this->tenant->id,
            'repair_order_id'     => $order->id,
            'quote_number'        => 'QT-INV-' . uniqid(),
            'total_amount'        => 350000 * $partQty,
            'warranty_terms_days' => 90,
            'note'                => 'Báo giá linh kiện zin',
            'status'              => 'approved',
            'sent_by_user_id'     => $this->adminUser->id,
        ]);

        QuoteItem::create([
            'quote_id'    => $quote->id,
            'part_id'     => $this->part->id,
            'description' => 'Pin AirPods 3 Zin',
            'quantity'    => $partQty,
            'unit_price'  => 350000,
            'amount'      => 350000 * $partQty,
        ]);

        return $order;
    }

    /**
     * Test 1: Khi đơn hàng chuyển sang completed, tự động trừ kho branch_parts và tạo giao dịch export_repair.
     */
    public function test_order_completion_automatically_deducts_branch_inventory_and_records_export(): void
    {
        $order = $this->createOrderWithQuote(2);

        $workflowService = app(OrderWorkflowService::class);
        $workflowService->transition($order, 'completed', [
            'user' => $this->adminUser,
        ]);

        // 1. Kiểm tra tồn kho branch_parts giảm từ 10 xuống 8
        $this->branchPart->refresh();
        $this->assertEquals(8, $this->branchPart->stock_quantity);

        // 2. Kiểm tra tồn kho toàn cục của Part giảm từ 20 xuống 18
        $this->part->refresh();
        $this->assertEquals(18, $this->part->stock_quantity);

        // 3. Kiểm tra bản ghi InventoryTransaction loại export_repair
        $tx = InventoryTransaction::where('repair_order_id', $order->id)
            ->where('transaction_type', 'export_repair')
            ->first();

        $this->assertNotNull($tx);
        $this->assertEquals($this->part->id, $tx->part_id);
        $this->assertEquals($this->branch->id, $tx->branch_id);
        $this->assertEquals(-2, $tx->quantity);
        $this->assertEquals(150000, (float) $tx->unit_cost);
    }

    /**
     * Test 2: Chống trừ kho trùng lặp (Idempotency) khi hoàn tất đơn được gọi lặp lại.
     */
    public function test_prevent_duplicate_inventory_deduction_on_repeated_completion(): void
    {
        $order = $this->createOrderWithQuote(1);

        $workflowService = app(OrderWorkflowService::class);
        $workflowService->transition($order, 'completed', [
            'user' => $this->adminUser,
        ]);

        $this->branchPart->refresh();
        $this->assertEquals(9, $this->branchPart->stock_quantity);

        // Gọi lại hàm trừ kho trực tiếp
        $workflowService->deductInventoryForOrder($order, $this->adminUser->id);

        $this->branchPart->refresh();
        $this->assertEquals(9, $this->branchPart->stock_quantity); // Vẫn là 9, không bị trừ thành 8

        $txCount = InventoryTransaction::where('repair_order_id', $order->id)
            ->where('transaction_type', 'export_repair')
            ->count();
        $this->assertEquals(1, $txCount);
    }

    /**
     * Test 3: Khi đơn hàng đã xuất linh kiện bị hủy (cancelled), tự động hoàn trả kho và tạo import_reversal.
     */
    public function test_order_cancellation_reverses_inventory_and_records_import_reversal(): void
    {
        $order = $this->createOrderWithQuote(2);

        $workflowService = app(OrderWorkflowService::class);
        $workflowService->transition($order, 'completed', [
            'user' => $this->adminUser,
        ]);

        $this->branchPart->refresh();
        $this->assertEquals(8, $this->branchPart->stock_quantity);

        // Hủy đơn hàng
        $workflowService->transition($order, 'cancelled', [
            'user'   => $this->adminUser,
            'reason' => 'Khách hàng đổi ý muốn trả lại máy và hoàn tiền',
        ]);

        // Kiểm tra tồn kho được hoàn lại 8 + 2 = 10
        $this->branchPart->refresh();
        $this->assertEquals(10, $this->branchPart->stock_quantity);

        $this->part->refresh();
        $this->assertEquals(20, $this->part->stock_quantity);

        // Kiểm tra có bản ghi import_reversal
        $reversalTx = InventoryTransaction::where('repair_order_id', $order->id)
            ->where('transaction_type', 'import_reversal')
            ->first();

        $this->assertNotNull($reversalTx);
        $this->assertEquals(2, $reversalTx->quantity);
        $this->assertEquals(150000, (float) $reversalTx->unit_cost);
    }

    /**
     * Test 4: Đơn hàng chỉ có dịch vụ sửa chữa (không linh kiện) không phát sinh giao dịch kho khi completed.
     */
    public function test_order_without_parts_does_not_trigger_inventory_transactions(): void
    {
        $order = RepairOrder::create([
            'tenant_id'           => $this->tenant->id,
            'order_code'          => 'PC26-' . rand(10000, 99999),
            'branch_id'           => $this->branch->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->device->id,
            'issue_description'   => 'Vệ sinh tai nghe khử trùng',
            'status'              => 'ready_for_return',
            'total_price'         => 100000,
            'warranty_terms_days' => 30,
            'created_by_user_id'  => $this->adminUser->id,
        ]);

        $workflowService = app(OrderWorkflowService::class);
        $workflowService->transition($order, 'completed', [
            'user' => $this->adminUser,
        ]);

        // Không có giao dịch kho nào
        $txCount = InventoryTransaction::where('repair_order_id', $order->id)->count();
        $this->assertEquals(0, $txCount);

        // Tồn kho không đổi
        $this->branchPart->refresh();
        $this->assertEquals(10, $this->branchPart->stock_quantity);
    }

    /**
     * Test 5: Khi Quản trị viên xóa đơn hàng (destroy), tồn kho linh kiện được hoàn trả và lịch sử giao dịch được bảo lưu.
     */
    public function test_order_destroy_restores_inventory_and_preserves_audit_trail(): void
    {
        $order = $this->createOrderWithQuote(3);

        $workflowService = app(OrderWorkflowService::class);
        $workflowService->transition($order, 'completed', [
            'user' => $this->adminUser,
        ]);

        $this->branchPart->refresh();
        $this->assertEquals(7, $this->branchPart->stock_quantity); // 10 - 3 = 7

        $orderId = $order->id;

        // Admin xóa đơn hàng qua API
        $response = $this->actingAs($this->adminUser, 'sanctum')->deleteJson("/api/v1/orders/{$orderId}");
        $response->assertStatus(200);

        // Kiểm tra tồn kho được hoàn lại đầy đủ: 7 + 3 = 10
        $this->branchPart->refresh();
        $this->assertEquals(10, $this->branchPart->stock_quantity);

        $this->part->refresh();
        $this->assertEquals(20, $this->part->stock_quantity);

        // Kiểm tra lịch sử giao dịch không bị xóa mất vết (bảo lưu với repair_order_id = null)
        $txCount = InventoryTransaction::where('part_id', $this->part->id)
            ->whereIn('transaction_type', ['export_repair', 'import_reversal'])
            ->count();
        $this->assertEquals(2, $txCount);
    }
}
