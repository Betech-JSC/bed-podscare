<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashTransaction;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WorkShift;
use Carbon\Carbon;
use Tests\TestCase;

class CashExpenseGuardrailTest extends TestCase
{
    protected Tenant $tenant;
    protected Branch $branch;
    protected User $cashierUser;
    protected User $adminUser;

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
            'name'      => 'Thu Ngân Test Guardrail',
            'email'     => 'cashier_guardrail_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'cashier',
        ]);

        $this->adminUser = User::where('tenant_id', $this->tenant->id)->where('role', 'admin')->first() ?? User::create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Test Guardrail',
            'email'     => 'admin_guardrail_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'admin',
        ]);

        // Đóng toàn bộ ca trực hiện hữu để kiểm thử có kiểm soát
        WorkShift::where('tenant_id', $this->tenant->id)
            ->where('branch_id', $this->branch->id)
            ->update(['status' => 'closed', 'closed_at' => Carbon::now()]);
    }

    /**
     * Test 1: Từ chối lập phiếu chi tiền mặt khi chi nhánh chưa mở ca trực (HTTP 422).
     */
    public function test_reject_cash_expense_when_no_active_shift(): void
    {
        $response = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/cash-transactions/expense', [
            'branch_id'       => $this->branch->id,
            'amount'          => 200000,
            'category'        => 'store_operations',
            'payment_method'  => 'cash',
            'recipient_payer' => 'Cửa hàng tiện lợi',
            'notes'           => 'Mua nước suối và cà phê cho khách',
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('chưa mở ca trực', $response->json('message'));
        $this->assertFalse(CashTransaction::where('notes', 'like', '%Mua nước suối%')->exists());
    }

    /**
     * Test 2: Từ chối lập phiếu chi tiền mặt khi số tiền chi vượt quá số dư két tiền mặt hiện tại (HTTP 422).
     */
    public function test_reject_cash_expense_when_amount_exceeds_drawer_balance(): void
    {
        // Mở ca trực với 500.000 VNĐ tiền mặt
        $shift = WorkShift::create([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch->id,
            'shift_code'      => 'WS-TEST-' . uniqid(),
            'cashier_id'      => $this->cashierUser->id,
            'opened_at'       => Carbon::now(),
            'status'          => 'open',
            'opening_cash'    => 500000,
            'system_cash_in'  => 0,
            'system_cash_out' => 0,
            'expected_cash'   => 500000,
        ]);

        // Thử chi 600.000 VNĐ (vượt quá 500.000)
        $response = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/cash-transactions/expense', [
            'branch_id'       => $this->branch->id,
            'amount'          => 600000,
            'category'        => 'purchasing_parts',
            'payment_method'  => 'cash',
            'recipient_payer' => 'Đại lý linh kiện',
            'notes'           => 'Mua pin khẩn cấp ngoài',
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('không đủ', $response->json('message'));

        // Kiểm tra số dư két ca trực không bị thay đổi
        $shift->refresh();
        $this->assertEquals(0, (float) $shift->system_cash_out);
        $this->assertEquals(500000, (float) $shift->expected_cash);
    }

    /**
     * Test 3: Cho phép lập phiếu chi tiền mặt khi có ca trực mở và số dư két đủ.
     */
    public function test_allow_cash_expense_when_shift_open_and_balance_sufficient(): void
    {
        $shift = WorkShift::create([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch->id,
            'shift_code'      => 'WS-TEST-' . uniqid(),
            'cashier_id'      => $this->cashierUser->id,
            'opened_at'       => Carbon::now(),
            'status'          => 'open',
            'opening_cash'    => 1000000,
            'system_cash_in'  => 500000,
            'system_cash_out' => 0,
            'expected_cash'   => 1500000,
        ]);

        $response = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/cash-transactions/expense', [
            'branch_id'       => $this->branch->id,
            'amount'          => 350000,
            'category'        => 'store_operations',
            'payment_method'  => 'cash',
            'recipient_payer' => 'Tiệm điện nước',
            'notes'           => 'Thay bóng đèn cửa hàng',
        ]);

        $response->assertStatus(201);
        $tx = $response->json('data');

        $this->assertEquals('expense', $tx['type']);
        $this->assertEquals(350000, (float) $tx['amount']);
        $this->assertEquals($shift->id, $tx['shift_id']);

        // Kiểm tra số dư két ca trực được cập nhật
        $shift->refresh();
        $this->assertEquals(350000, (float) $shift->system_cash_out);
        $this->assertEquals(1150000, (float) $shift->expected_cash); // 1.500.000 - 350.000
    }

    /**
     * Test 4: Cho phép lập phiếu chi ngân hàng (bank_transfer) mà không bị giới hạn bởi số dư két tiền mặt hay ca trực.
     */
    public function test_non_cash_expense_allowed_without_shift_drawer_restrictions(): void
    {
        // Chưa mở ca trực nào
        $this->assertFalse(WorkShift::where('branch_id', $this->branch->id)->where('status', 'open')->exists());

        $response = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/cash-transactions/expense', [
            'branch_id'       => $this->branch->id,
            'amount'          => 5000000, // Số tiền lớn
            'category'        => 'purchasing_parts',
            'payment_method'  => 'bank_transfer',
            'recipient_payer' => 'Nhà phân phối linh kiện Apple',
            'notes'           => 'Chuyển khoản thanh toán lô màn hình',
        ]);

        $response->assertStatus(201);
        $tx = $response->json('data');

        $this->assertEquals('expense', $tx['type']);
        $this->assertEquals('bank_transfer', $tx['payment_method']);
        $this->assertEquals(5000000, (float) $tx['amount']);
        $this->assertNull($tx['shift_id']);
    }
}
