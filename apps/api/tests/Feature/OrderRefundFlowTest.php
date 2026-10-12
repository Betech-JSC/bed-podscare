<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\InventoryTransaction;
use App\Models\Part;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WorkShift;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OrderRefundFlowTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $adminUser;
    protected User $cashierUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_rf_' . uniqid(),
            'name'   => 'Tiệm Sửa Chữa Hoàn Tiền',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Hoàn Tiền',
            'code'      => 'BR_RF_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Refund Ave',
            'is_active' => true,
        ]);

        $this->customer = Customer::forceCreate([
            'tenant_id'    => $this->tenant->id,
            'name'         => 'Khách Hàng Hoàn Tiền',
            'phone'        => '090' . rand(1000000, 9999999),
            'orders_count' => 2,
            'total_spent'  => 2000000,
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Hoàn Tiền',
            'email'     => 'admin_rf_' . uniqid() . '@example.com',
            'phone'     => '098' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cashierUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Thu Ngân Hoàn Tiền',
            'email'     => 'cashier_rf_' . uniqid() . '@example.com',
            'phone'     => '097' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'cashier',
            'is_active' => true,
        ]);
    }

    protected function createPaidOrder(float $amount = 500000): array
    {
        $order = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'order_type'         => 'in_store',
            'status'             => 'completed',
            'issue_description'  => 'Khách báo hỏng loa tai phải',
            'total_price'        => $amount,
            'initial_price'      => $amount,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $payment = Payment::forceCreate([
            'payment_code'        => 'PAY-' . rand(10000, 99999),
            'repair_order_id'     => $order->id,
            'amount'              => $amount,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $this->cashierUser->id,
        ]);

        return [$order, $payment];
    }

    /**
     * Test 1: Hoàn tiền mặt thành công khi ca trực đang mở và đủ tiền két.
     */
    public function test_cash_refund_success_when_shift_is_open_and_has_enough_cash(): void
    {
        $shift = WorkShift::forceCreate([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch->id,
            'cashier_id'      => $this->cashierUser->id,
            'shift_code'      => 'SH-' . uniqid(),
            'status'          => 'open',
            'opened_at'       => now()->subHours(2),
            'opening_cash'    => 1500000,
            'system_cash_in'  => 0,
            'system_cash_out' => 0,
            'expected_cash'   => 1500000,
        ]);

        [$order, $payment] = $this->createPaidOrder(300000);

        $response = $this->actingAs($this->cashierUser)->postJson("/api/v1/payments/{$payment->id}/refund", [
            'refund_amount' => 300000,
            'refund_method' => 'cash',
            'refund_reason' => 'Khách trả hàng vì lỗi loa',
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'refunded')
            ->assertJsonPath('data.refund_method', 'cash');

        $this->assertEquals(300000, (float) $response->json('data.refund_amount'));

        $shift->refresh();
        $this->assertEquals(300000, (float) $shift->system_cash_out);
        $this->assertEquals(1200000, (float) $shift->expected_cash);

        $this->assertDatabaseHas('cash_transactions', [
            'branch_id'      => $this->branch->id,
            'shift_id'       => $shift->id,
            'type'           => 'expense',
            'category'       => 'refund',
            'payment_method' => 'cash',
            'amount'         => 300000,
        ]);

        $order->refresh();
        $this->assertEquals('cancelled', $order->status);
    }

    /**
     * Test 2: Từ chối hoàn tiền mặt khi két ca trực không đủ số dư.
     */
    public function test_cash_refund_rejected_when_shift_has_insufficient_cash(): void
    {
        $shift = WorkShift::forceCreate([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch->id,
            'cashier_id'      => $this->cashierUser->id,
            'shift_code'      => 'SH-' . uniqid(),
            'status'          => 'open',
            'opened_at'       => now()->subHours(2),
            'opening_cash'    => 200000,
            'system_cash_in'  => 0,
            'system_cash_out' => 0,
            'expected_cash'   => 200000,
        ]);

        [$order, $payment] = $this->createPaidOrder(500000);

        $response = $this->actingAs($this->cashierUser)->postJson("/api/v1/payments/{$payment->id}/refund", [
            'refund_amount' => 500000,
            'refund_method' => 'cash',
            'refund_reason' => 'Không đủ tiền két để hoàn',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Số dư két tiền mặt hiện tại không đủ để hoàn tiền.');

        $shift->refresh();
        $this->assertEquals(200000, (float) $shift->expected_cash);

        $payment->refresh();
        $this->assertEquals('paid', $payment->status);
    }

    /**
     * Test 3: Từ chối hoàn tiền mặt khi chi nhánh chưa mở ca trực.
     */
    public function test_cash_refund_rejected_when_no_active_shift_open(): void
    {
        WorkShift::where('branch_id', $this->branch->id)->where('status', 'open')->update(['status' => 'closed']);

        [$order, $payment] = $this->createPaidOrder(300000);

        $response = $this->actingAs($this->cashierUser)->postJson("/api/v1/payments/{$payment->id}/refund", [
            'refund_amount' => 300000,
            'refund_method' => 'cash',
            'refund_reason' => 'Hoàn tiền khi chưa mở ca',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Chi nhánh chưa mở ca trực. Không thể xuất tiền mặt từ két để hoàn tiền.');
    }

    /**
     * Test 4: Hoàn tiền qua chuyển khoản ngân hàng không làm biến động két tiền mặt.
     */
    public function test_bank_transfer_refund_success_without_altering_cash_drawer(): void
    {
        $shift = WorkShift::forceCreate([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch->id,
            'cashier_id'      => $this->cashierUser->id,
            'shift_code'      => 'SH-' . uniqid(),
            'status'          => 'open',
            'opened_at'       => now()->subHours(2),
            'opening_cash'    => 1500000,
            'system_cash_in'  => 0,
            'system_cash_out' => 0,
            'expected_cash'   => 1500000,
        ]);

        [$order, $payment] = $this->createPaidOrder(400000);

        $response = $this->actingAs($this->adminUser)->postJson("/api/v1/payments/{$payment->id}/refund", [
            'refund_amount'   => 400000,
            'refund_method'   => 'bank_transfer',
            'refund_reason'   => 'Hoàn tiền qua MB Bank',
            'transaction_ref' => 'REF-BANK-MB-1234',
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'refunded')
            ->assertJsonPath('data.refund_method', 'bank_transfer');

        $shift->refresh();
        $this->assertEquals(1500000, (float) $shift->expected_cash);
        $this->assertEquals(0, (float) $shift->system_cash_out);
    }

    /**
     * Test 5: Hoàn trả kho linh kiện tự động (import_return) và đảm bảo tính lũy thừa (Idempotency).
     */
    public function test_automatic_inventory_restock_and_idempotency_on_refund(): void
    {
        $part = Part::forceCreate([
            'tenant_id'        => $this->tenant->id,
            'name'             => 'Pin AirPods Pro 2 Test',
            'sku'              => 'PIN-APP2-' . uniqid(),
            'category'         => 'battery',
            'storage_location' => 'Kệ A1',
            'stock_quantity'   => 8,
            'cost_price'       => 150000,
            'retail_price'     => 300000,
        ]);

        $branchPart = BranchPart::forceCreate([
            'branch_id'       => $this->branch->id,
            'part_id'         => $part->id,
            'stock_quantity'  => 8,
            'min_stock_alert' => 2,
        ]);

        [$order, $payment] = $this->createPaidOrder(300000);

        // Giả lập giao dịch xuất kho trước đó
        InventoryTransaction::forceCreate([
            'transaction_code'   => 'TX-' . date('Ymd') . '-' . rand(1000, 9999),
            'part_id'            => $part->id,
            'branch_id'          => $this->branch->id,
            'repair_order_id'    => $order->id,
            'transaction_type'   => 'export_repair',
            'quantity'           => -1,
            'unit_cost'          => 150000,
            'notes'              => 'Xuất kho cho đơn',
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $response = $this->actingAs($this->adminUser)->postJson("/api/v1/payments/{$payment->id}/refund", [
            'refund_amount' => 300000,
            'refund_method' => 'bank_transfer',
            'refund_reason' => 'Hoàn kho linh kiện test',
        ]);

        $response->assertOk();

        $branchPart->refresh();
        $part->refresh();
        $this->assertEquals(9, $branchPart->stock_quantity);
        $this->assertEquals(9, $part->stock_quantity);

        $this->assertDatabaseHas('inventory_transactions', [
            'repair_order_id'  => $order->id,
            'part_id'          => $part->id,
            'transaction_type' => 'import_return',
            'quantity'         => 1,
        ]);

        // Thử gọi restockInventoryForOrder lần nữa để kiểm tra idempotency
        app(\App\Services\OrderWorkflowService::class)->restockInventoryForOrder($order, $this->adminUser->id);

        $branchPart->refresh();
        $this->assertEquals(9, $branchPart->stock_quantity); // Không bị tăng thêm lần 2
    }

    /**
     * Test 6: Thu hồi sổ bảo hành điện tử khi hoàn tiền và chặn khiếu nại bảo hành đã thu hồi.
     */
    public function test_warranties_revoked_on_refund_and_blocks_claims(): void
    {
        [$order, $payment] = $this->createPaidOrder(500000);

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

        $response = $this->actingAs($this->adminUser)->postJson("/api/v1/payments/{$payment->id}/refund", [
            'refund_amount' => 500000,
            'refund_method' => 'bank_transfer',
            'refund_reason' => 'Khách đổi ý',
        ]);

        $response->assertOk();

        $warranty->refresh();
        $this->assertEquals('revoked', $warranty->status);
        $this->assertNotNull($warranty->revoked_at);

        // Chặn tạo khiếu nại trên sổ bảo hành đã thu hồi
        $claimResponse = $this->actingAs($this->cashierUser)->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $warranty->id,
            'issue_description' => 'Tai rè lại',
            'resolution_mode'   => 'send_tech',
        ]);

        $claimResponse->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Sổ bảo hành đã bị thu hồi do đơn hàng đã được hoàn tiền, không thể tiếp nhận khiếu nại.');
    }

    /**
     * Test 7: Khấu trừ chi tiêu tích lũy và số lượng đơn của khách hàng chính xác.
     */
    public function test_customer_spending_and_orders_count_adjusted_on_full_and_partial_refund(): void
    {
        $this->customer->update([
            'total_spent'  => 2000000,
            'orders_count' => 2,
        ]);

        [$order, $payment] = $this->createPaidOrder(800000);

        // Hoàn tiền toàn phần
        $response = $this->actingAs($this->adminUser)->postJson("/api/v1/payments/{$payment->id}/refund", [
            'refund_amount' => 800000,
            'refund_method' => 'bank_transfer',
            'refund_reason' => 'Hoàn toàn bộ đơn',
        ]);

        $response->assertOk();

        $this->customer->refresh();
        $this->assertEquals(1200000, (float) $this->customer->total_spent);
        $this->assertEquals(1, $this->customer->orders_count);

        // Thử tiếp một đơn hoàn 1 phần
        [$order2, $payment2] = $this->createPaidOrder(500000);
        $this->customer->update([
            'total_spent'  => 1500000,
            'orders_count' => 2,
        ]);

        $response2 = $this->actingAs($this->adminUser)->postJson("/api/v1/payments/{$payment2->id}/refund", [
            'refund_amount' => 300000,
            'refund_method' => 'bank_transfer',
            'refund_reason' => 'Hoàn một phần đơn',
        ]);

        $response2->assertOk();

        $this->customer->refresh();
        $this->assertEquals(1200000, (float) $this->customer->total_spent);
        $this->assertEquals(2, $this->customer->orders_count); // Giữ nguyên orders_count khi hoàn một phần
    }
}
