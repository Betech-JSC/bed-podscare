<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WorkShift;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class WorkShiftTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Branch $otherBranch;
    protected User $cashier;
    protected User $adminUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_shift_' . uniqid(),
            'name'   => 'PodsCare Shift Test Tenant',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Q1 Shift Test',
            'code'      => 'Q1_' . strtoupper(uniqid()),
            'phone'     => '0901234567',
            'address'   => '123 Lê Lợi, Q1',
            'is_active' => true,
        ]);

        $this->otherBranch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Bình Thạnh Shift Test',
            'code'      => 'BT_' . strtoupper(uniqid()),
            'phone'     => '0907654321',
            'address'   => '456 Bạch Đằng, BT',
            'is_active' => true,
        ]);

        $this->cashier = User::create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Thu Ngân Q1',
            'email'     => 'cashier_' . uniqid() . '@example.com',
            'password'  => bcrypt('secret123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Q1',
            'email'     => 'admin_' . uniqid() . '@example.com',
            'password'  => bcrypt('secret123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);
    }

    /**
     * 1. Mở ca thành công và lưu số tiền mặt đầu ca.
     */
    public function test_can_open_shift_successfully_with_opening_cash(): void
    {
        $response = $this->actingAs($this->cashier)
            ->postJson('/api/v1/shifts/open', [
                'branch_id'    => $this->branch->id,
                'opening_cash' => 1500000,
                'notes'        => 'Mở ca sáng đầu tuần',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.opening_cash', '1500000.00')
            ->assertJsonPath('data.expected_cash', '1500000.00')
            ->assertJsonPath('data.status', 'open');

        $this->assertDatabaseHas('work_shifts', [
            'tenant_id'    => $this->tenant->id,
            'branch_id'    => $this->branch->id,
            'cashier_id'   => $this->cashier->id,
            'opening_cash' => 1500000,
            'status'       => 'open',
        ]);
    }

    /**
     * 2. Chặn mở ca thứ 2 khi chi nhánh đang có ca mở.
     */
    public function test_cannot_open_second_shift_when_branch_already_has_active_open_shift(): void
    {
        // Mở ca đầu tiên
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/shifts/open', [
                'branch_id'    => $this->branch->id,
                'opening_cash' => 1000000,
            ])
            ->assertStatus(201);

        // Mở ca thứ 2 trên cùng chi nhánh -> Bị chặn 422
        $response = $this->actingAs($this->adminUser)
            ->postJson('/api/v1/shifts/open', [
                'branch_id'    => $this->branch->id,
                'opening_cash' => 500000,
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['branch_id']);
    }

    /**
     * 3. Lấy thông tin ca đang mở của chi nhánh.
     */
    public function test_can_get_current_active_shift(): void
    {
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/shifts/open', [
                'branch_id'    => $this->branch->id,
                'opening_cash' => 2000000,
            ])
            ->assertStatus(201);

        $response = $this->actingAs($this->cashier)
            ->getJson('/api/v1/shifts/current?branch_id=' . $this->branch->id);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.opening_cash', '2000000.00');
    }

    /**
     * 4. Lập phiếu chi tiền mặt ngoài và tự động cập nhật system_cash_out của ca mở.
     */
    public function test_create_cash_expense_automatically_updates_open_shift_system_cash_out(): void
    {
        $openResponse = $this->actingAs($this->cashier)
            ->postJson('/api/v1/shifts/open', [
                'branch_id'    => $this->branch->id,
                'opening_cash' => 1000000,
            ])
            ->assertStatus(201);

        $shiftId = $openResponse->json('data.id');

        // Tạo phiếu chi tiền mặt mua keo dán B7000
        $expenseResponse = $this->actingAs($this->cashier)
            ->postJson('/api/v1/cashbook/expenses', [
                'branch_id'       => $this->branch->id,
                'amount'          => 150000,
                'category'        => 'purchasing_parts',
                'recipient_payer' => 'Cửa hàng linh kiện Minh Khai',
                'notes'           => 'Mua 2 tuýp keo B7000 dán ron tai nghe',
            ]);

        $expenseResponse->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.shift_id', $shiftId)
            ->assertJsonPath('data.amount', '150000.00')
            ->assertJsonPath('data.type', 'expense');

        // Kiểm tra số liệu ca làm việc đã được cập nhật
        $shift = WorkShift::find($shiftId);
        $this->assertEquals('150000.00', $shift->system_cash_out);
        $this->assertEquals('850000.00', $shift->expected_cash); // 1.000.000 - 150.000 = 850.000
    }

    /**
     * 5. Đóng ca thành công với 1 ô actual_cash (số tiền thực tế kiểm đếm), tiền khớp hoàn toàn.
     */
    public function test_can_close_shift_successfully_when_cash_matches(): void
    {
        $openResponse = $this->actingAs($this->cashier)
            ->postJson('/api/v1/shifts/open', [
                'branch_id'    => $this->branch->id,
                'opening_cash' => 1000000,
            ])
            ->assertStatus(201);

        $shiftId = $openResponse->json('data.id');

        // Đóng ca với số tiền thực tế kiểm đếm khớp 1.000.000đ, để lại két 300.000đ
        $closeResponse = $this->actingAs($this->cashier)
            ->postJson("/api/v1/shifts/{$shiftId}/close", [
                'actual_cash'       => 1000000,
                'carried_over_cash' => 300000,
                'notes'             => 'Ca làm việc khớp tiền',
            ]);

        $closeResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'closed')
            ->assertJsonPath('data.actual_cash', '1000000.00')
            ->assertJsonPath('data.difference_amount', '0.00')
            ->assertJsonPath('data.carried_over_cash', '300000.00')
            ->assertJsonPath('data.deposited_cash', '700000.00'); // 1.000.000 - 300.000 = 700.000
    }

    /**
     * 6. Bắt buộc có ghi chú giải trình khi chênh lệch khác 0.
     */
    public function test_requires_reconciliation_notes_when_difference_is_not_zero(): void
    {
        $openResponse = $this->actingAs($this->cashier)
            ->postJson('/api/v1/shifts/open', [
                'branch_id'    => $this->branch->id,
                'opening_cash' => 1000000,
            ])
            ->assertStatus(201);

        $shiftId = $openResponse->json('data.id');

        // Đóng ca với số tiền kiểm đếm thiếu 50.000đ (950.000đ) mà KHÔNG có giải trình -> Bị lỗi 422
        $failResponse = $this->actingAs($this->cashier)
            ->postJson("/api/v1/shifts/{$shiftId}/close", [
                'actual_cash'       => 950000,
                'carried_over_cash' => 200000,
                'notes'             => '', // Ghi chú rỗng
            ]);

        $failResponse->assertStatus(422)
            ->assertJsonValidationErrors(['reconciliation_notes']);

        // Đóng ca lại có ghi chú giải trình -> Thành công
        $successResponse = $this->actingAs($this->cashier)
            ->postJson("/api/v1/shifts/{$shiftId}/close", [
                'actual_cash'       => 950000,
                'carried_over_cash' => 200000,
                'notes'             => 'Thiếu 50.000đ do thối nhầm tiền mặt cho khách đơn hàng #1234',
            ]);

        $successResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'closed')
            ->assertJsonPath('data.difference_amount', '-50000.00')
            ->assertJsonPath('data.actual_cash', '950000.00')
            ->assertJsonPath('data.deposited_cash', '750000.00'); // 950.000 - 200.000 = 750.000
    }

    /**
     * 7. Lấy biên bản chốt ca in K80 và in A4.
     */
    public function test_can_get_shift_summary_and_print_receipt(): void
    {
        $openResponse = $this->actingAs($this->cashier)
            ->postJson('/api/v1/shifts/open', [
                'branch_id'    => $this->branch->id,
                'opening_cash' => 1000000,
            ])
            ->assertStatus(201);

        $shiftId = $openResponse->json('data.id');

        $this->actingAs($this->cashier)
            ->postJson("/api/v1/shifts/{$shiftId}/close", [
                'actual_cash'       => 1000000,
                'carried_over_cash' => 200000,
                'notes'             => 'Ca chốt khớp',
            ])
            ->assertStatus(200);

        // API summary
        $summaryResponse = $this->actingAs($this->cashier)
            ->getJson("/api/v1/shifts/{$shiftId}/summary");

        $summaryResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    'shift',
                    'branch',
                    'cashier',
                    'totals' => [
                        'opening_cash',
                        'system_cash_in',
                        'system_cash_out',
                        'expected_cash',
                        'actual_cash',
                        'difference_amount',
                        'carried_over_cash',
                        'deposited_cash',
                    ],
                    'formatted_dates',
                ],
            ]);

        // API print
        $printResponse = $this->actingAs($this->cashier)
            ->getJson("/api/v1/shifts/{$shiftId}/print");

        $printResponse->assertStatus(200)
            ->assertJsonPath('success', true);
    }

    /**
     * 8. Lấy danh mục thu/chi và số dư quỹ chi nhánh.
     */
    public function test_can_get_cashbook_categories_and_balance(): void
    {
        $categoriesResponse = $this->actingAs($this->cashier)
            ->getJson('/api/v1/cashbook/categories');

        $categoriesResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    'expense',
                    'income',
                ],
            ]);

        $balanceResponse = $this->actingAs($this->cashier)
            ->getJson('/api/v1/cashbook/balance?branch_id=' . $this->branch->id);

        $balanceResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    'has_active_shift',
                    'current_cash_balance',
                ],
            ]);
    }

    /**
     * 9. Kiểm tra endpoint GET /api/v1/shifts/current trả về các chỉ số snapshot:
     * vietqr_total, orders_completed_count, expected_cash, và has_active_shift.
     */
    public function test_current_shift_calculates_vietqr_total_and_orders_completed_count(): void
    {
        // 1. Mở ca làm việc với 1.000.000đ tiền mặt
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/shifts/open', [
                'branch_id'    => $this->branch->id,
                'opening_cash' => 1000000,
                'notes'        => 'Mở ca test snapshot',
            ])
            ->assertStatus(201);

        $customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Shift Snapshot',
            'phone'     => '0912' . rand(100000, 999999),
        ]);

        $device = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods 3',
            'category'     => 'AirPods',
            'model_code'   => 'A2565',
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);

        // 2. Tạo đơn 1: Hoàn tất trong ca (status = 'completed') kèm thanh toán VietQR 600.000đ
        $order1 = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'created_by_user_id' => $this->cashier->id,
            'technician_id'      => $this->cashier->id,
            'order_code'         => 'RO-SNAP-1-' . strtoupper(uniqid()),
            'status'             => 'completed',
            'issue_description'  => 'Thay pin dock',
            'total_price'        => 600000,
            'handed_over_at'     => now(),
        ]);

        Payment::create([
            'payment_code'        => 'PAY-SNAP-1-' . strtoupper(uniqid()),
            'repair_order_id'     => $order1->id,
            'amount'              => 600000,
            'payment_method'      => 'vietqr',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $this->cashier->id,
        ]);

        // 3. Tạo đơn 2: Chưa hoàn tất (status = 'in_repair') nhưng có thanh toán cọc chuyển khoản 250.000đ
        $order2 = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'created_by_user_id' => $this->cashier->id,
            'technician_id'      => $this->cashier->id,
            'order_code'         => 'RO-SNAP-2-' . strtoupper(uniqid()),
            'status'             => 'in_repair',
            'issue_description'  => 'Sửa loa rè',
            'total_price'        => 500000,
        ]);

        Payment::create([
            'payment_code'        => 'PAY-SNAP-2-' . strtoupper(uniqid()),
            'repair_order_id'     => $order2->id,
            'amount'              => 250000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $this->cashier->id,
        ]);

        // 4. Gọi API GET /api/v1/shifts/current
        $response = $this->actingAs($this->cashier)
            ->getJson('/api/v1/shifts/current?branch_id=' . $this->branch->id);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('has_active_shift', true)
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.opening_cash', '1000000.00')
            ->assertJsonPath('data.expected_cash', '1000000.00')
            ->assertJsonPath('data.orders_completed_count', 1)
            ->assertJsonPath('data.vietqr_total', 850000); // 600.000 + 250.000 = 850.000
    }

    /**
     * 10. Xử lý an toàn khi chi nhánh chưa có ca mở: data: null, HTTP 200, has_active_shift: false.
     */
    public function test_current_shift_returns_null_safely_when_no_active_shift_open(): void
    {
        // Chi nhánh otherBranch chưa hề mở ca nào
        $response = $this->actingAs($this->cashier)
            ->getJson('/api/v1/shifts/current?branch_id=' . $this->otherBranch->id);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data', null)
            ->assertJsonPath('has_active_shift', false);
    }

    /**
     * 11. Khi Admin chọn "Tất cả chi nhánh" (branch_id=all hoặc không truyền branch_id),
     * API tổng hợp toàn bộ các ca đang mở trên các chi nhánh của Tenant.
     */
    public function test_admin_can_get_aggregated_active_shifts_across_all_branches(): void
    {
        // Mở ca tại chi nhánh 1 (1.000.000đ)
        $this->actingAs($this->adminUser)
            ->postJson('/api/v1/shifts/open', [
                'branch_id'    => $this->branch->id,
                'opening_cash' => 1000000,
                'notes'        => 'Ca sáng CN1',
            ])
            ->assertStatus(201);

        $branch2 = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh 2',
            'code'      => 'BR_2_' . uniqid(),
            'phone'     => '0901234568',
            'address'   => '456 CMT8',
            'is_active' => true,
        ]);

        // Mở ca tại chi nhánh 2 (2.500.000đ)
        $this->actingAs($this->adminUser)
            ->postJson('/api/v1/shifts/open', [
                'branch_id'    => $branch2->id,
                'opening_cash' => 2500000,
                'notes'        => 'Ca sáng CN2',
            ])
            ->assertStatus(201);

        $response = $this->actingAs($this->adminUser)
            ->getJson('/api/v1/shifts/current?branch_id=all');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('has_active_shift', true)
            ->assertJsonPath('data.is_aggregated', true)
            ->assertJsonPath('data.active_shifts_count', 2)
            ->assertJsonPath('data.opening_cash', '3500000.00')
            ->assertJsonPath('data.expected_cash', '3500000.00');

        $this->assertCount(2, $response->json('data.branches_summary'));
    }
}
