<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashTransaction;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WorkShift;
use Carbon\Carbon;
use Tests\TestCase;

class PaymentCashShiftSyncTest extends TestCase
{
    protected Tenant $tenant;
    protected Branch $branch;
    protected User $cashierUser;
    protected User $adminUser;
    protected Customer $customer;
    protected DeviceModel $device;
    protected WorkShift $activeShift;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::first() ?? Tenant::create([
            'name'      => 'FixO Test Tenant',
            'code'      => 'FIXO-TEST',
            'is_active' => true,
        ]);

        $this->branch = Branch::where('tenant_id', $this->tenant->id)->first() ?? Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'CN-Q1',
            'address'   => '123 Lê Lợi, Q.1',
            'phone'     => '0901000001',
            'is_active' => true,
        ]);

        $this->cashierUser = User::where('tenant_id', $this->tenant->id)->where('role', 'cashier')->first() ?? User::create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Thu Ngân Test',
            'email'     => 'cashier_test_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'cashier',
        ]);

        $this->adminUser = User::where('tenant_id', $this->tenant->id)->where('role', 'admin')->first() ?? User::create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Test',
            'email'     => 'admin_sync_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'admin',
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Sync Test',
            'phone'     => '0988' . rand(100000, 999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro 2',
            'category'     => 'AirPods',
            'model_code'   => 'A2931',
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);

        // Đóng các ca cũ nếu có và mở 1 ca trực mới
        WorkShift::where('tenant_id', $this->tenant->id)
            ->where('branch_id', $this->branch->id)
            ->where('status', 'open')
            ->update(['status' => 'closed', 'closed_at' => Carbon::now()]);

        $this->activeShift = WorkShift::create([
            'tenant_id'         => $this->tenant->id,
            'branch_id'         => $this->branch->id,
            'shift_code'        => 'WS-TEST-' . uniqid(),
            'cashier_id'        => $this->cashierUser->id,
            'opened_at'         => Carbon::now(),
            'status'            => 'open',
            'opening_cash'      => 1000000,
            'system_cash_in'    => 0,
            'system_cash_out'   => 0,
            'expected_cash'     => 1000000,
        ]);
    }

    private function createOrder(string $status = 'ready_for_return', float $price = 500000): RepairOrder
    {
        return RepairOrder::create([
            'tenant_id'           => $this->tenant->id,
            'order_code'          => 'PC26-' . strtoupper(bin2hex(random_bytes(4))) . rand(100, 999),
            'branch_id'           => $this->branch->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->device->id,
            'issue_description'   => 'Thay pin AirPods',
            'status'              => $status,
            'total_price'         => $price,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $this->cashierUser->id,
        ]);
    }

    /**
     * Test: Thu tiền mặt trực tiếp tại quầy tự động tạo CashTransaction và cập nhật WorkShift.
     */
    public function test_cash_payment_at_store_creates_cashbook_income_and_updates_shift_balance(): void
    {
        $order = $this->createOrder('ready_for_return', 450000);

        $response = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 450000,
            'payment_method'  => 'cash',
            'notes'           => 'Khách thanh toán tiền mặt tại quầy',
        ]);

        $response->assertStatus(201);
        $paymentId = $response->json('data.id');

        // 1. Kiểm tra bản ghi CashTransaction được tạo
        $cashTx = CashTransaction::where('tenant_id', $this->tenant->id)
            ->where('category', 'repair_order_cash')
            ->where('notes', 'like', "%[Payment #{$paymentId}]%")
            ->first();

        $this->assertNotNull($cashTx);
        $this->assertEquals('income', $cashTx->type);
        $this->assertEquals('cash', $cashTx->payment_method);
        $this->assertEquals(450000, (float) $cashTx->amount);
        $this->assertEquals($this->activeShift->id, $cashTx->shift_id);
        $this->assertEquals($this->branch->id, $cashTx->branch_id);

        // 2. Kiểm tra số dư ca trực cập nhật chính xác
        $this->activeShift->refresh();
        $this->assertEquals(450000, (float) $this->activeShift->system_cash_in);
        $this->assertEquals(0, (float) $this->activeShift->system_cash_out);
        $this->assertEquals(1450000, (float) $this->activeShift->expected_cash); // 1.000.000 + 450.000

        // 3. Đơn hàng chuyển sang completed
        $order->refresh();
        $this->assertEquals('completed', $order->status);
    }

    /**
     * Test: Duyệt thanh toán tiền mặt qua API confirm tự động đồng bộ vào ca trực.
     */
    public function test_cash_payment_confirmed_asynchronously_updates_shift_cash(): void
    {
        $order = $this->createOrder('waiting_pickup', 300000);

        // Tạo payment pending ban đầu
        $payment = Payment::create([
            'payment_code'        => 'FX26-PY-' . rand(1000, 9999),
            'repair_order_id'     => $order->id,
            'amount'              => 300000,
            'payment_method'      => 'cash',
            'status'              => 'pending',
            'received_by_user_id' => $this->cashierUser->id,
        ]);

        $this->assertEquals(0, (float) $this->activeShift->system_cash_in);

        // Duyệt thanh toán
        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson("/api/v1/payments/{$payment->id}/confirm", [
                'transaction_ref' => 'REF-CASH-001',
                'notes'           => 'Đã nhận đủ tiền mặt',
            ]);

        $response->assertStatus(200);

        // Kiểm tra CashTransaction
        $cashTx = CashTransaction::where('category', 'repair_order_cash')
            ->where('notes', 'like', "%[Payment #{$payment->id}]%")
            ->first();

        $this->assertNotNull($cashTx);
        $this->assertEquals(300000, (float) $cashTx->amount);
        $this->assertEquals($this->activeShift->id, $cashTx->shift_id);

        // Ca trực được cộng tiền
        $this->activeShift->refresh();
        $this->assertEquals(300000, (float) $this->activeShift->system_cash_in);
        $this->assertEquals(1300000, (float) $this->activeShift->expected_cash);
    }

    /**
     * Test: Thanh toán phi tiền mặt (bank_transfer, card_pos) KHÔNG làm tăng két ca trực.
     */
    public function test_non_cash_payment_does_not_affect_shift_cash_drawer(): void
    {
        $order = $this->createOrder('ready_for_return', 600000);

        $response = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 600000,
            'payment_method'  => 'bank_transfer',
            'auto_confirm'    => true,
            'transaction_ref' => 'MB-12345678',
        ]);

        $response->assertStatus(201);
        $paymentId = $response->json('data.id');

        // Không có bản ghi cash_transactions loại repair_order_cash
        $cashTxExists = CashTransaction::where('notes', 'like', "%[Payment #{$paymentId}]%")->exists();
        $this->assertFalse($cashTxExists);

        // Két ca trực không thay đổi
        $this->activeShift->refresh();
        $this->assertEquals(0, (float) $this->activeShift->system_cash_in);
        $this->assertEquals(1000000, (float) $this->activeShift->expected_cash);
    }

    /**
     * Test: Tính lũy thừa (Idempotency) - không cộng dồn hai lần nếu gọi đồng bộ lặp lại.
     */
    public function test_idempotent_sync_prevents_duplicate_cash_income_and_shift_credits(): void
    {
        $order = $this->createOrder('ready_for_return', 200000);

        $payment = Payment::create([
            'payment_code'        => 'FX26-PY-' . rand(1000, 9999),
            'repair_order_id'     => $order->id,
            'amount'              => 200000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'received_by_user_id' => $this->cashierUser->id,
        ]);

        $cashTxService = app(\App\Services\CashTransactionService::class);

        // Gọi đồng bộ lần 1
        $tx1 = $cashTxService->recordRepairOrderCashPayment(
            $this->tenant->id,
            $this->branch->id,
            $this->cashierUser->id,
            $payment,
            $order
        );
        $this->assertNotNull($tx1);

        $this->activeShift->refresh();
        $this->assertEquals(200000, (float) $this->activeShift->system_cash_in);
        $this->assertEquals(1200000, (float) $this->activeShift->expected_cash);

        // Gọi đồng bộ lần 2 với cùng payment
        $tx2 = $cashTxService->recordRepairOrderCashPayment(
            $this->tenant->id,
            $this->branch->id,
            $this->cashierUser->id,
            $payment,
            $order
        );

        $this->assertEquals($tx1->id, $tx2->id);

        // Số dư két ca trực không bị cộng dồn lần hai
        $this->activeShift->refresh();
        $this->assertEquals(200000, (float) $this->activeShift->system_cash_in);
        $this->assertEquals(1200000, (float) $this->activeShift->expected_cash);
    }
}
