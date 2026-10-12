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
use App\Models\Payment;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\RepairQuote;
use App\Models\Supplier;
use App\Models\SupplierDebtTransaction;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use App\Models\WorkShift;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Continuous Business Lifecycle Backend E2E Test Suite
 * OpenSpec: full-system-e2e-and-regression-verification (Bước 2.5)
 */
class SystemE2ELifecycleTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected Part $part;
    protected BranchPart $branchPart;
    protected Supplier $supplier;
    protected User $adminUser;
    protected User $cashierUser;
    protected User $techUser;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Tạo Tenant cô lập ngẫu nhiên
        $this->tenant = Tenant::create([
            'code'      => 'tenant_e2e_' . uniqid(),
            'name'      => 'Cửa Hàng Sửa Chữa AirPods E2E',
            'status'    => 'active',
            'plan'      => 'pro',
            'is_active' => true,
        ]);

        // 2. Tạo Chi nhánh mới
        $this->branch = Branch::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh E2E Central',
            'code'      => 'BR_E2E_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '100 E2E Boulevard, Q.1',
            'is_active' => true,
        ]);

        // 3. Tạo 3 người dùng chuẩn RBAC
        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Quản Lý Cửa Hàng E2E',
            'email'     => 'admin_e2e_' . uniqid() . '@fixo.vn',
            'phone'     => '098' . rand(1000000, 9999999),
            'password'  => Hash::make('secret123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cashierUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Thu Ngân Ca Trực E2E',
            'email'     => 'cashier_e2e_' . uniqid() . '@fixo.vn',
            'phone'     => '097' . rand(1000000, 9999999),
            'password'  => Hash::make('secret123'),
            'role'      => 'cashier',
            'is_active' => true,
        ]);

        $this->techUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'KTV Trưởng E2E',
            'email'     => 'tech_e2e_' . uniqid() . '@fixo.vn',
            'phone'     => '096' . rand(1000000, 9999999),
            'password'  => Hash::make('secret123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        // 4. Tạo Khách hàng ban đầu
        $this->customer = Customer::forceCreate([
            'tenant_id'    => $this->tenant->id,
            'name'         => 'Nguyễn Văn Khách E2E',
            'phone'        => '091' . rand(1000000, 9999999),
            'orders_count' => 0,
            'total_spent'  => 0,
        ]);

        // 5. Tạo Dòng máy AirPods
        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro 2',
            'model_code'   => 'A2698_' . uniqid(),
            'category'     => 'airpods',
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);

        // 6. Tạo Linh kiện mẫu và khởi tạo tồn kho chi nhánh ban đầu = 5 viên
        $this->part = Part::forceCreate([
            'tenant_id'        => $this->tenant->id,
            'sku'              => 'BAT-APP2-' . uniqid(),
            'name'             => 'Pin AirPods Pro 2 Zin Bóc Máy',
            'category'         => 'battery',
            'storage_location' => 'Kệ A1-01',
            'stock_quantity'   => 5,
            'cost_price'       => 100000.00,
            'retail_price'     => 350000.00,
            'min_stock_alert'  => 2,
            'unit'             => 'viên',
            'is_active'        => true,
        ]);

        $this->branchPart = BranchPart::forceCreate([
            'branch_id'       => $this->branch->id,
            'part_id'         => $this->part->id,
            'stock_quantity'  => 5,
            'min_stock_alert' => 2,
        ]);

        // 7. Tạo Nhà cung cấp linh kiện ban đầu có công nợ = 0
        $this->supplier = Supplier::forceCreate([
            'tenant_id'    => $this->tenant->id,
            'code'         => 'SUP-E2E-' . uniqid(),
            'name'         => 'Kho Sỉ Linh Kiện Apple Sài Gòn',
            'phone'        => '0938889999',
            'debt_balance' => 0.00,
            'is_active'    => true,
        ]);

        // Đảm bảo không có ca trực nào đang mở sẵn tại chi nhánh
        WorkShift::where('branch_id', $this->branch->id)->where('status', 'open')->update(['status' => 'closed']);
    }

    /**
     * KỊCH BẢN CHÍNH: Continuous Business Lifecycle Stateful End-To-End Test (10 Bước Nối Tiếp).
     */
    public function test_continuous_business_lifecycle_end_to_end(): void
    {
        // -------------------------------------------------------------
        // BƯỚC 1: Mở ca làm việc đầu ngày với 1.000.000 ₫ tiền két
        // -------------------------------------------------------------
        $openShiftRes = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/shifts/open', [
            'branch_id'    => $this->branch->id,
            'opening_cash' => 1000000,
            'notes'        => 'Mở ca trực sáng kiểm thử E2E liên hoàn',
        ]);

        $openShiftRes->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'open');

        $shiftId = $openShiftRes->json('data.id');
        $shift = WorkShift::find($shiftId);
        $this->assertEquals(1000000, (float) $shift->opening_cash);
        $this->assertEquals(0, (float) $shift->system_cash_in);
        $this->assertEquals(0, (float) $shift->system_cash_out);
        $this->assertEquals(1000000, (float) $shift->expected_cash);

        // -------------------------------------------------------------
        // BƯỚC 2: Tiếp nhận máy & Báo giá sửa chữa 450.000 ₫ ➜ Khách duyệt báo giá
        // -------------------------------------------------------------
        $createOrderRes = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/orders', [
            'branch_id'         => $this->branch->id,
            'customer_id'       => $this->customer->id,
            'device_model_id'   => $this->device->id,
            'serial_number'     => 'AP-PRO-SER-' . rand(1000, 9999),
            'issue_description' => 'Pin chai nhanh hết trong 30 phút',
            'estimated_price'   => 450000,
            'order_type'        => 'in_store',
        ]);

        $createOrderRes->assertStatus(201);
        $orderId = $createOrderRes->json('data.id');
        $order = RepairOrder::find($orderId);

        // Tạo báo giá chính thức
        $quoteRes = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/quotes', [
            'repair_order_id'     => $order->id,
            'note'                => 'Thay pin zin chính hãng bảo hành 90 ngày',
            'warranty_terms_days' => 90,
            'items'               => [
                [
                    'part_id'     => $this->part->id,
                    'description' => 'Pin AirPods Pro 2 Zin',
                    'quantity'    => 1,
                    'unit_price'  => 450000,
                ],
            ],
        ]);

        $quoteRes->assertStatus(201);
        $quoteId = $quoteRes->json('data.id');

        // Khách hàng / CSKH duyệt báo giá
        $approveQuoteRes = $this->actingAs($this->adminUser, 'sanctum')->postJson("/api/v1/quotes/{$quoteId}/approve");
        $approveQuoteRes->assertOk();

        $order->refresh();
        $this->assertEquals('waiting_tech', $order->status);
        $this->assertEquals(450000, (float) $order->total_price);

        // -------------------------------------------------------------
        // BƯỚC 3: KTV nhận sửa & Xuất kho linh kiện (export_repair)
        // -------------------------------------------------------------
        $acceptRes = $this->actingAs($this->techUser, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status'        => 'in_repair',
            'technician_id' => $this->techUser->id,
        ]);
        $acceptRes->assertOk();

        // KTV xuất 1 viên pin thay thế cho máy
        $exportPartRes = $this->actingAs($this->techUser, 'sanctum')->postJson('/api/v1/inventory/transactions', [
            'part_id'          => $this->part->id,
            'branch_id'        => $this->branch->id,
            'repair_order_id'  => $order->id,
            'transaction_type' => 'export_repair',
            'quantity'         => 1,
            'notes'            => 'Xuất pin thay thế theo báo giá',
        ]);
        $exportPartRes->assertStatus(201);

        $this->branchPart->refresh();
        $this->part->refresh();
        $this->assertEquals(4, $this->branchPart->stock_quantity, 'Tồn kho chi nhánh giảm từ 5 xuống 4');
        $this->assertEquals(4, $this->part->stock_quantity, 'Tồn kho toàn cục giảm từ 5 xuống 4');

        $this->assertDatabaseHas('inventory_transactions', [
            'repair_order_id'  => $order->id,
            'part_id'          => $this->part->id,
            'transaction_type' => 'export_repair',
            'quantity'         => -1,
        ]);

        // -------------------------------------------------------------
        // BƯỚC 4: KTV sửa xong, Thu ngân thu 450.000 ₫ tiền mặt ➜ Đồng bộ két ca trực
        // -------------------------------------------------------------
        // Chuyển trạng thái sang ready_for_return
        $readyRes = $this->actingAs($this->techUser, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status' => 'ready_for_return',
        ]);
        $readyRes->assertOk();

        // Thu ngân thu tiền mặt
        $payRes = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id'     => $order->id,
            'amount'              => 450000,
            'payment_method'      => 'cash',
            'warranty_terms_days' => 90,
            'notes'               => 'Khách thanh toán tiền mặt tại quầy',
        ]);
        $payRes->assertStatus(201)
            ->assertJsonPath('data.status', 'paid');

        $paymentId = $payRes->json('data.id');

        // Xác thực biến động két tiền mặt
        $shift->refresh();
        $this->assertEquals(450000, (float) $shift->system_cash_in, 'system_cash_in tăng 450k');
        $this->assertEquals(1450000, (float) $shift->expected_cash, 'expected_cash tăng từ 1tr lên 1.45tr');

        // Xác thực đơn hàng hoàn tất & cấp sổ bảo hành
        $order->refresh();
        $this->assertEquals('completed', $order->status);

        $warranty = Warranty::where('repair_order_id', $order->id)->first();
        $this->assertNotNull($warranty, 'Sổ bảo hành điện tử tự động cấp');
        $this->assertEquals('active', $warranty->status);

        // Xác thực tích lũy khách hàng
        $this->customer->refresh();
        $this->assertEquals(1, $this->customer->orders_count);
        $this->assertEquals(450000, (float) $this->customer->total_spent);

        // -------------------------------------------------------------
        // BƯỚC 5: Nhập kho từ NCC (10 pin @ 120.000 ₫ = 1.200.000 ₫).
        // Chi 500.000 ₫ tiền mặt từ két, nợ lại 700.000 ₫. Tính lại giá vốn MAC.
        // -------------------------------------------------------------
        $receiptRes = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/goods-receipts', [
            'supplier_id'    => $this->supplier->id,
            'branch_id'      => $this->branch->id,
            'paid_amount'    => 500000,
            'payment_method' => 'cash',
            'items'          => [
                [
                    'part_id'    => $this->part->id,
                    'quantity'   => 10,
                    'unit_price' => 120000,
                ],
            ],
            'notes'          => 'Nhập lô pin bổ sung từ kho sài gòn',
        ]);
        $receiptRes->assertStatus(201);
        $receiptId = $receiptRes->json('data.id');

        // Tồn kho tăng từ 4 lên 14
        $this->branchPart->refresh();
        $this->part->refresh();
        $this->assertEquals(14, $this->branchPart->stock_quantity);
        $this->assertEquals(14, $this->part->stock_quantity);

        // Giá vốn MAC mới: (4*100000 + 10*120000)/14 = 1.600.000 / 14 = 114285.71
        $expectedMac = round((4 * 100000 + 10 * 120000) / 14, 2);
        $this->assertEqualsWithDelta($expectedMac, (float) $this->part->cost_price, 0.05);

        // Công nợ NCC tăng lên 700.000 ₫
        $this->supplier->refresh();
        $this->assertEquals(700000, (float) $this->supplier->debt_balance);

        $this->assertDatabaseHas('supplier_debt_transactions', [
            'supplier_id'      => $this->supplier->id,
            'goods_receipt_id' => $receiptId,
            'transaction_type' => 'purchase_debt',
            'amount'           => 700000,
        ]);

        // Két ca trực: system_cash_out tăng 500.000 ₫, expected_cash còn 950.000 ₫
        $shift->refresh();
        $this->assertEquals(500000, (float) $shift->system_cash_out);
        $this->assertEquals(950000, (float) $shift->expected_cash);

        // -------------------------------------------------------------
        // BƯỚC 6: Chi trả nợ NCC 300.000 ₫ từ két tiền mặt
        // -------------------------------------------------------------
        $payDebtRes = $this->actingAs($this->adminUser, 'sanctum')->postJson("/api/v1/suppliers/{$this->supplier->id}/payments", [
            'amount'         => 300000,
            'payment_method' => 'cash',
            'branch_id'      => $this->branch->id,
            'notes'          => 'Chi trả đợt 1 tiền hàng từ két ca sáng',
        ]);
        $payDebtRes->assertStatus(201);

        // Công nợ NCC giảm xuống 400.000 ₫
        $this->supplier->refresh();
        $this->assertEquals(400000, (float) $this->supplier->debt_balance);

        // Két ca trực: system_cash_out tăng thêm 300k thành 800k, expected_cash còn 650.000 ₫
        $shift->refresh();
        $this->assertEquals(800000, (float) $shift->system_cash_out);
        $this->assertEquals(650000, (float) $shift->expected_cash);

        $this->assertDatabaseHas('cash_transactions', [
            'shift_id'       => $shift->id,
            'type'           => 'expense',
            'category'       => 'supplier_payable',
            'amount'         => 300000,
            'payment_method' => 'cash',
        ]);

        // -------------------------------------------------------------
        // BƯỚC 7: Đóng ca & Đối soát quỹ (Lệch -20.000 ₫ kèm giải trình & Audit Log)
        // Sau đó mở ca tiếp theo với 1.000.000 ₫
        // -------------------------------------------------------------
        $closeShiftRes = $this->actingAs($this->cashierUser, 'sanctum')->postJson("/api/v1/shifts/{$shift->id}/close", [
            'actual_cash'       => 630000,
            'carried_over_cash' => 0,
            'notes'             => 'Lệch 20k do nhầm tiền thối cho khách',
        ]);
        $closeShiftRes->assertOk();

        $shift->refresh();
        $this->assertEquals('closed', $shift->status);
        $this->assertEquals(630000, (float) $shift->actual_cash);
        $this->assertEquals(-20000, (float) $shift->difference_amount);

        // Kiểm tra AuditLog ghi nhận mức trường diff
        $auditLog = AuditLog::where('action', 'Lệch két chốt ca')
            ->where('auditable_id', $shift->id)
            ->latest('id')
            ->first();

        $this->assertNotNull($auditLog, 'Phải có AuditLog Lệch két chốt ca');
        $this->assertEquals(650000, (float) $auditLog->old_values['expected_cash']);
        $this->assertEquals(630000, (float) $auditLog->new_values['actual_cash']);
        $this->assertEquals(-20000, (float) $auditLog->new_values['discrepancy']);
        $this->assertEquals('Lệch 20k do nhầm tiền thối cho khách', $auditLog->metadata['notes']);

        // Mở ca trực chiều phục vụ các kịch bản tiếp theo
        $afternoonShiftRes = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/shifts/open', [
            'branch_id'    => $this->branch->id,
            'opening_cash' => 1000000,
            'notes'        => 'Mở ca chiều đối soát',
        ]);
        $afternoonShiftRes->assertStatus(201);
        $afternoonShift = WorkShift::find($afternoonShiftRes->json('data.id'));

        // -------------------------------------------------------------
        // BƯỚC 8: Khách khiếu nại bảo hành ➜ Tự động sinh đơn Rework 0 ₫ vào /tech
        // Thử nghiệm QC Guardrail: Chặn bàn giao nếu QC chưa Pass
        // -------------------------------------------------------------
        $claimRes = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $warranty->id,
            'issue_description' => 'Khách báo tai vẫn tụt pin sau 2 ngày',
            'resolution_mode'   => 'replace_part',
            'notes'             => 'Tiếp nhận bảo hành thay lại pin',
        ]);
        $claimRes->assertStatus(201);
        $reworkOrderId = $claimRes->json('data.rework_order.id');
        $reworkOrder = RepairOrder::find($reworkOrderId);

        $this->assertNotNull($reworkOrder);
        $this->assertEquals('warranty', $reworkOrder->order_type);
        $this->assertEquals(0, (float) $reworkOrder->total_price);
        $this->assertEquals('waiting_tech', $reworkOrder->status);
        $this->assertEquals($order->id, $reworkOrder->parent_order_id);

        // KTV nhận đơn rework
        $techAcceptRes = $this->actingAs($this->techUser, 'sanctum')->postJson("/api/v1/orders/{$reworkOrder->id}/transition", [
            'status'        => 'in_repair',
            'technician_id' => $this->techUser->id,
        ]);
        $techAcceptRes->assertOk();

        // QC Guardrail: Cố tình chuyển ready_for_return khi chưa có QC Pass -> Bị chặn 422
        $blockedTransRes = $this->actingAs($this->techUser, 'sanctum')->postJson("/api/v1/orders/{$reworkOrder->id}/transition", [
            'status' => 'ready_for_return',
        ]);
        $blockedTransRes->assertStatus(422)
            ->assertJsonPath('success', false);

        // Tạo biên bản QC Pass
        QcInspection::forceCreate([
            'tenant_id'       => $this->tenant->id,
            'repair_order_id' => $reworkOrder->id,
            'inspector_id'    => $this->adminUser->id,
            'result'          => 'pass',
            'notes'           => 'Kiểm tra pin và âm thanh đạt chuẩn nghiệm thu',
        ]);

        // Sau khi có QC Pass -> Chuyển ready_for_return thành công
        $successTransRes = $this->actingAs($this->techUser, 'sanctum')->postJson("/api/v1/orders/{$reworkOrder->id}/transition", [
            'status' => 'ready_for_return',
        ]);
        $successTransRes->assertOk()
            ->assertJsonPath('data.status', 'ready_for_return');

        // -------------------------------------------------------------
        // BƯỚC 9: Hoàn tiền đơn hàng gốc 450.000 ₫ tiền mặt ➜ Full Rollback
        // Hoàn kho (import_return), Thu hồi bảo hành (revoked), Giảm tích lũy khách hàng
        // -------------------------------------------------------------
        $refundRes = $this->actingAs($this->adminUser, 'sanctum')->postJson("/api/v1/orders/{$order->id}/refund", [
            'refund_amount' => 450000,
            'refund_method' => 'cash',
            'refund_reason' => 'Khách yêu cầu hoàn tiền toàn bộ dịch vụ',
        ]);
        $refundRes->assertOk();

        // 1. Trạng thái thanh toán đổi sang refunded
        $payment = Payment::find($paymentId);
        $this->assertEquals('refunded', $payment->status);

        // 2. Két ca trực chiều bị trừ 450.000 ₫
        $afternoonShift->refresh();
        $this->assertEquals(450000, (float) $afternoonShift->system_cash_out);
        $this->assertEquals(550000, (float) $afternoonShift->expected_cash);

        // 3. Linh kiện được tự động hoàn lại vào kho (+1 tồn kho)
        $this->branchPart->refresh();
        $this->part->refresh();
        $this->assertEquals(15, $this->branchPart->stock_quantity, 'Tồn kho chi nhánh được hoàn lại +1 từ 14 lên 15');
        $this->assertEquals(15, $this->part->stock_quantity, 'Tồn kho tổng được hoàn lại +1 từ 14 lên 15');

        $this->assertDatabaseHas('inventory_transactions', [
            'repair_order_id'  => $order->id,
            'part_id'          => $this->part->id,
            'transaction_type' => 'import_return',
            'quantity'         => 1,
        ]);

        // 4. Sổ bảo hành chuyển sang revoked
        $warranty->refresh();
        $this->assertEquals('revoked', $warranty->status);
        $this->assertNotNull($warranty->revoked_at);

        // 5. Khấu trừ tích lũy chi tiêu của khách hàng
        $this->customer->refresh();
        $this->assertEquals(0, (float) $this->customer->total_spent);
        $this->assertEquals(0, $this->customer->orders_count);

        // 6. Bản ghi Audit Log hoàn tiền chi tiết diff
        $refundAudit = AuditLog::where('action', 'Hoàn tiền đơn hàng')
            ->where('auditable_id', $payment->id)
            ->latest('id')
            ->first();
        $this->assertNotNull($refundAudit, 'Audit log hoàn tiền đơn hàng phải được ghi lại');

        // -------------------------------------------------------------
        // BƯỚC 10: Thử nghiệm chặn tạo khiếu nại trên sổ bảo hành đã bị revoked
        // -------------------------------------------------------------
        $blockedClaimRes = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $warranty->id,
            'issue_description' => 'Cố tình khiếu nại trên sổ đã thu hồi',
            'resolution_mode'   => 'replace_part',
        ]);
        $blockedClaimRes->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Sổ bảo hành đã bị thu hồi do đơn hàng đã được hoàn tiền, không thể tiếp nhận khiếu nại.');
    }

    /**
     * Task 1.2: Kịch bản 1 & 2: Tiếp nhận máy & Báo giá duyệt sửa, KTV nhận sửa & Xuất kho linh kiện.
     * Kiểm tra thêm guardrail chặn xuất kho khi hết hàng (422).
     */
    public function test_task_1_2_intake_quote_approval_and_parts_export_with_stock_guardrail(): void
    {
        // 1. Tạo đơn sửa chữa
        $order = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'order_type'         => 'in_store',
            'status'             => 'inspecting',
            'issue_description'  => 'Thay pin AirPods',
            'total_price'        => 400000,
            'created_by_user_id' => $this->cashierUser->id,
        ]);

        // 2. Tạo báo giá và duyệt
        $quoteRes = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/quotes', [
            'repair_order_id' => $order->id,
            'note'            => 'Báo giá pin',
            'items'           => [
                [
                    'part_id'     => $this->part->id,
                    'description' => 'Pin AirPods',
                    'quantity'    => 1,
                    'unit_price'  => 400000,
                ],
            ],
        ]);
        $quoteRes->assertStatus(201);
        $quoteId = $quoteRes->json('data.id');

        $approveRes = $this->actingAs($this->adminUser, 'sanctum')->postJson("/api/v1/quotes/{$quoteId}/approve");
        $approveRes->assertOk();

        $order->refresh();
        $this->assertEquals('waiting_tech', $order->status);

        // 3. KTV nhận đơn
        $acceptRes = $this->actingAs($this->techUser, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status'        => 'in_repair',
            'technician_id' => $this->techUser->id,
        ]);
        $acceptRes->assertOk();

        // 4. Guardrail: Thử xuất kho vượt quá số lượng tồn tại chi nhánh (tồn = 5, xuất 99)
        $blockedInvRes = $this->actingAs($this->techUser, 'sanctum')->postJson('/api/v1/inventory/transactions', [
            'part_id'          => $this->part->id,
            'branch_id'        => $this->branch->id,
            'repair_order_id'  => $order->id,
            'transaction_type' => 'export_repair',
            'quantity'         => 99,
        ]);
        $blockedInvRes->assertStatus(422);

        // 5. Xuất kho hợp lệ 1 viên pin
        $validInvRes = $this->actingAs($this->techUser, 'sanctum')->postJson('/api/v1/inventory/transactions', [
            'part_id'          => $this->part->id,
            'branch_id'        => $this->branch->id,
            'repair_order_id'  => $order->id,
            'transaction_type' => 'export_repair',
            'quantity'         => 1,
        ]);
        $validInvRes->assertStatus(201);

        $this->branchPart->refresh();
        $this->assertEquals(4, $this->branchPart->stock_quantity);
    }

    /**
     * Task 1.3: Kịch bản 3: Thu tiền mặt đơn sửa chữa, đồng bộ két ca trực.
     * Kiểm tra thêm guardrail chặn thu tiền mặt khi chưa mở ca (422).
     */
    public function test_task_1_3_cash_collection_and_no_open_shift_guardrail(): void
    {
        $order = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'order_type'         => 'in_store',
            'status'             => 'ready_for_return',
            'issue_description'  => 'Thay pin AirPods',
            'total_price'        => 350000,
            'created_by_user_id' => $this->cashierUser->id,
        ]);

        // 1. Guardrail: Khi chi nhánh chưa mở ca trực -> Chặn xuất chi tiền mặt (422)
        WorkShift::where('branch_id', $this->branch->id)->where('status', 'open')->update(['status' => 'closed']);

        $blockedExpenseRes = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/cash-transactions/expense', [
            'branch_id'       => $this->branch->id,
            'amount'          => 100000,
            'category'        => 'store_operations',
            'payment_method'  => 'cash',
            'recipient_payer' => 'Cửa hàng tạp hóa',
            'notes'           => 'Chi tiền mặt khi chưa mở ca trực',
        ]);
        $blockedExpenseRes->assertStatus(422)
            ->assertJsonPath('success', false);
        $this->assertStringContainsString('chưa mở ca trực', $blockedExpenseRes->json('message'));

        // 2. Mở ca trực
        $shift = WorkShift::forceCreate([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch->id,
            'cashier_id'      => $this->cashierUser->id,
            'shift_code'      => 'SH-' . uniqid(),
            'status'          => 'open',
            'opened_at'       => Carbon::now(),
            'opening_cash'    => 500000,
            'system_cash_in'  => 0,
            'system_cash_out' => 0,
            'expected_cash'   => 500000,
        ]);

        // 3. Thu tiền mặt thành công
        $payRes = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 350000,
            'payment_method'  => 'cash',
        ]);
        $payRes->assertStatus(201);

        $shift->refresh();
        $this->assertEquals(350000, (float) $shift->system_cash_in);
        $this->assertEquals(850000, (float) $shift->expected_cash);
    }

    /**
     * Task 1.4: Kịch bản 4: Nhập kho từ NCC, tính giá vốn bình quân di động (MAC), tăng tồn kho, ghi nợ NCC.
     * Kiểm tra thêm guardrail chặn thanh toán tiền mặt vượt quá số dư két (422).
     */
    public function test_task_1_4_supplier_goods_receipt_mac_and_drawer_cash_deduction(): void
    {
        $shift = WorkShift::forceCreate([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch->id,
            'cashier_id'      => $this->cashierUser->id,
            'shift_code'      => 'SH-' . uniqid(),
            'status'          => 'open',
            'opened_at'       => Carbon::now(),
            'opening_cash'    => 400000, // Chỉ có 400k trong két
            'system_cash_in'  => 0,
            'system_cash_out' => 0,
            'expected_cash'   => 400000,
        ]);

        // 1. Guardrail: Nhập hàng trả ngay 600.000 ₫ tiền mặt trong khi két chỉ có 400.000 ₫ -> Chặn 422
        $blockedReceiptRes = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/goods-receipts', [
            'supplier_id'    => $this->supplier->id,
            'branch_id'      => $this->branch->id,
            'paid_amount'    => 600000,
            'payment_method' => 'cash',
            'items'          => [
                [
                    'part_id'    => $this->part->id,
                    'quantity'   => 5,
                    'unit_price' => 120000,
                ],
            ],
        ]);
        $blockedReceiptRes->assertStatus(422)
            ->assertJsonPath('success', false);

        // 2. Nhập hàng trả ngay 300.000 ₫ (đủ số dư két) và ghi nợ phần còn lại 300.000 ₫
        $receiptRes = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/goods-receipts', [
            'supplier_id'    => $this->supplier->id,
            'branch_id'      => $this->branch->id,
            'paid_amount'    => 300000,
            'payment_method' => 'cash',
            'items'          => [
                [
                    'part_id'    => $this->part->id,
                    'quantity'   => 5,
                    'unit_price' => 120000,
                ],
            ],
        ]);
        $receiptRes->assertStatus(201);

        $shift->refresh();
        $this->assertEquals(300000, (float) $shift->system_cash_out);
        $this->assertEquals(100000, (float) $shift->expected_cash);

        $this->supplier->refresh();
        $this->assertEquals(300000, (float) $this->supplier->debt_balance);
    }

    /**
     * Task 1.5: Kịch bản 5: Chi trả nợ Nhà cung cấp, giảm nợ NCC, sinh phiếu chi tiền mặt két ca trực.
     * Kiểm tra thêm guardrail chặn chi tiền mặt vượt quá số dư két (422).
     */
    public function test_task_1_5_supplier_debt_payment_and_insufficient_drawer_guardrail(): void
    {
        $this->supplier->update(['debt_balance' => 1000000]);

        $shift = WorkShift::forceCreate([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch->id,
            'cashier_id'      => $this->cashierUser->id,
            'shift_code'      => 'SH-' . uniqid(),
            'status'          => 'open',
            'opened_at'       => Carbon::now(),
            'opening_cash'    => 500000, // Két chỉ có 500k
            'system_cash_in'  => 0,
            'system_cash_out' => 0,
            'expected_cash'   => 500000,
        ]);

        // 1. Guardrail: Chi trả nợ 800.000 ₫ vượt quá 500.000 ₫ trong két -> Chặn 422
        $blockedDebtPayRes = $this->actingAs($this->adminUser, 'sanctum')->postJson("/api/v1/suppliers/{$this->supplier->id}/payments", [
            'amount'         => 800000,
            'payment_method' => 'cash',
            'branch_id'      => $this->branch->id,
        ]);
        $blockedDebtPayRes->assertStatus(422)
            ->assertJsonPath('success', false);

        // 2. Chi trả nợ hợp lệ 400.000 ₫
        $debtPayRes = $this->actingAs($this->adminUser, 'sanctum')->postJson("/api/v1/suppliers/{$this->supplier->id}/payments", [
            'amount'         => 400000,
            'payment_method' => 'cash',
            'branch_id'      => $this->branch->id,
        ]);
        $debtPayRes->assertStatus(201);

        $this->supplier->refresh();
        $this->assertEquals(600000, (float) $this->supplier->debt_balance);

        $shift->refresh();
        $this->assertEquals(400000, (float) $shift->system_cash_out);
        $this->assertEquals(100000, (float) $shift->expected_cash);
    }

    /**
     * Task 1.6: Kịch bản 6: Đóng ca & Đối soát quỹ, đối chiếu tiền thực tế vs kỳ vọng két, ghi vết AuditLog.
     */
    public function test_task_1_6_shift_close_reconciliation_discrepancy_and_audit_diff(): void
    {
        $shift = WorkShift::forceCreate([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch->id,
            'cashier_id'      => $this->cashierUser->id,
            'shift_code'      => 'SH-' . uniqid(),
            'status'          => 'open',
            'opened_at'       => Carbon::now()->subHours(8),
            'opening_cash'    => 1000000,
            'system_cash_in'  => 500000,
            'system_cash_out' => 200000,
            'expected_cash'   => 1300000,
        ]);

        // Đóng ca với số tiền lệch -30.000 ₫
        $closeRes = $this->actingAs($this->cashierUser, 'sanctum')->postJson("/api/v1/shifts/{$shift->id}/close", [
            'actual_cash'       => 1270000,
            'carried_over_cash' => 0,
            'notes'             => 'Lệch quỹ 30k do chi mua văn phòng phẩm vặt chưa tạo phiếu',
        ]);
        $closeRes->assertOk();

        $shift->refresh();
        $this->assertEquals('closed', $shift->status);
        $this->assertEquals(1270000, (float) $shift->actual_cash);
        $this->assertEquals(-30000, (float) $shift->difference_amount);

        // Kiểm tra AuditLog
        $this->assertDatabaseHas('audit_logs', [
            'action'         => 'Lệch két chốt ca',
            'auditable_type' => WorkShift::class,
            'auditable_id'   => $shift->id,
        ]);
    }

    /**
     * Task 1.7: Kịch bản 7: Khiếu nại bảo hành sinh đơn Rework 0 ₫, QC Guardrail chặn giao máy nếu chưa đạt.
     */
    public function test_task_1_7_warranty_claim_rework_order_and_qc_pass_guardrail(): void
    {
        $order = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'order_type'         => 'in_store',
            'status'             => 'completed',
            'issue_description'  => 'Thay pin AirPods',
            'total_price'        => 500000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $warranty = Warranty::forceCreate([
            'warranty_code'   => 'WR-' . rand(10000, 99999),
            'repair_order_id' => $order->id,
            'customer_id'     => $this->customer->id,
            'device_model_id' => $this->device->id,
            'coverage_item'   => 'Bảo hành thay pin',
            'start_date'      => now()->subDays(5),
            'end_date'        => now()->addDays(85),
            'status'          => 'active',
        ]);

        // Tạo khiếu nại bảo hành
        $claimRes = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $warranty->id,
            'issue_description' => 'Pin phồng',
            'resolution_mode'   => 'replace_part',
        ]);
        $claimRes->assertStatus(201);
        $reworkOrderId = $claimRes->json('data.rework_order.id');

        $reworkOrder = RepairOrder::find($reworkOrderId);
        $this->assertEquals('warranty', $reworkOrder->order_type);
        $this->assertEquals(0, (float) $reworkOrder->total_price);

        // KTV nhận sửa
        $reworkOrder->update(['status' => 'in_repair', 'technician_id' => $this->techUser->id]);

        // Chặn chuyển trạng thái khi chưa có QC Pass
        $blockedRes = $this->actingAs($this->techUser, 'sanctum')->postJson("/api/v1/orders/{$reworkOrder->id}/transition", [
            'status' => 'ready_for_return',
        ]);
        $blockedRes->assertStatus(422);

        // Đánh giá QC Pass
        QcInspection::forceCreate([
            'tenant_id'       => $this->tenant->id,
            'repair_order_id' => $reworkOrder->id,
            'inspector_id'    => $this->adminUser->id,
            'result'          => 'pass',
            'notes'           => 'Đã kiểm tra đạt chuẩn',
        ]);

        // Chuyển ready_for_return thành công
        $successRes = $this->actingAs($this->techUser, 'sanctum')->postJson("/api/v1/orders/{$reworkOrder->id}/transition", [
            'status' => 'ready_for_return',
        ]);
        $successRes->assertOk();
    }

    /**
     * Task 1.8: Kịch bản 8: Hoàn tiền đơn hàng (Refund): Chặn âm quỹ, hoàn kho linh kiện, thu hồi bảo hành, trừ tích lũy.
     */
    public function test_task_1_8_order_refund_full_rollback_and_drawer_guardrail(): void
    {
        $this->customer->update(['total_spent' => 1000000, 'orders_count' => 2]);

        $shift = WorkShift::forceCreate([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch->id,
            'cashier_id'      => $this->cashierUser->id,
            'shift_code'      => 'SH-' . uniqid(),
            'status'          => 'open',
            'opened_at'       => Carbon::now(),
            'opening_cash'    => 200000, // Chỉ có 200k trong két
            'system_cash_in'  => 0,
            'system_cash_out' => 0,
            'expected_cash'   => 200000,
        ]);

        $order = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'order_type'         => 'in_store',
            'status'             => 'completed',
            'issue_description'  => 'Thay pin AirPods',
            'total_price'        => 500000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $payment = Payment::forceCreate([
            'payment_code'        => 'PAY-' . rand(10000, 99999),
            'repair_order_id'     => $order->id,
            'amount'              => 500000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $this->cashierUser->id,
        ]);

        $warranty = Warranty::forceCreate([
            'warranty_code'   => 'WR-' . rand(10000, 99999),
            'repair_order_id' => $order->id,
            'customer_id'     => $this->customer->id,
            'device_model_id' => $this->device->id,
            'coverage_item'   => 'Thay pin',
            'start_date'      => now(),
            'end_date'        => now()->addDays(90),
            'status'          => 'active',
        ]);

        // Giả lập giao dịch xuất linh kiện trước đó
        InventoryTransaction::forceCreate([
            'transaction_code'   => 'TX-' . date('Ymd') . '-' . rand(1000, 9999),
            'part_id'            => $this->part->id,
            'branch_id'          => $this->branch->id,
            'repair_order_id'    => $order->id,
            'transaction_type'   => 'export_repair',
            'quantity'           => -1,
            'unit_cost'          => 100000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        // 1. Guardrail: Két chỉ có 200k, hoàn 500k tiền mặt -> Chặn 422
        $blockedRefundRes = $this->actingAs($this->adminUser, 'sanctum')->postJson("/api/v1/payments/{$payment->id}/refund", [
            'refund_amount' => 500000,
            'refund_method' => 'cash',
            'refund_reason' => 'Khách trả hàng',
        ]);
        $blockedRefundRes->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Số dư két tiền mặt hiện tại không đủ để hoàn tiền.');

        // Nạp thêm tiền két để đủ hoàn
        $shift->update(['expected_cash' => 1000000, 'opening_cash' => 1000000]);

        // 2. Hoàn tiền thành công
        $refundRes = $this->actingAs($this->adminUser, 'sanctum')->postJson("/api/v1/payments/{$payment->id}/refund", [
            'refund_amount' => 500000,
            'refund_method' => 'cash',
            'refund_reason' => 'Khách trả hàng',
        ]);
        $refundRes->assertOk();

        // Kiểm tra payment chuyển refunded
        $payment->refresh();
        $this->assertEquals('refunded', $payment->status);

        // Kiểm tra hoàn kho
        $this->branchPart->refresh();
        $this->assertEquals(6, $this->branchPart->stock_quantity);

        // Kiểm tra thu hồi sổ bảo hành
        $warranty->refresh();
        $this->assertEquals('revoked', $warranty->status);

        // Kiểm tra khấu trừ chi tiêu khách hàng
        $this->customer->refresh();
        $this->assertEquals(500000, (float) $this->customer->total_spent);
        $this->assertEquals(1, $this->customer->orders_count);
    }
}
