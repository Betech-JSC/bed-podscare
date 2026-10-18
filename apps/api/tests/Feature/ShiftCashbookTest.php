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

class ShiftCashbookTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch1;
    protected Branch $branch2;
    protected Branch $branch3;
    protected User $adminUser;
    protected User $cashier1;
    protected User $cashier2;
    protected Customer $customer;
    protected DeviceModel $device;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_shift_agg_' . uniqid(),
            'name'   => 'PodsCare Multi-Branch Shift Tenant',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch1 = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'CN1_' . strtoupper(uniqid()),
            'phone'     => '0901111111',
            'address'   => '100 Lê Lợi, Q1',
            'is_active' => true,
        ]);

        $this->branch2 = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Quận 3',
            'code'      => 'CN3_' . strtoupper(uniqid()),
            'phone'     => '0902222222',
            'address'   => '200 Võ Văn Tần, Q3',
            'is_active' => true,
        ]);

        $this->branch3 = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Thủ Đức',
            'code'      => 'CNTD_' . strtoupper(uniqid()),
            'phone'     => '0903333333',
            'address'   => '300 Võ Văn Ngân, TĐ',
            'is_active' => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => null,
            'name'      => 'Tổng Quản Lý Admin',
            'email'     => 'admin_agg_' . uniqid() . '@podscare.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cashier1 = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch1->id,
            'name'      => 'Thu Ngân Q1',
            'email'     => 'cashier1_' . uniqid() . '@podscare.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'cashier',
            'is_active' => true,
        ]);

        $this->cashier2 = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch2->id,
            'name'      => 'Thu Ngân Q3',
            'email'     => 'cashier2_' . uniqid() . '@podscare.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'cashier',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Sổ Quỹ',
            'phone'     => '0989' . rand(100000, 999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro 2',
            'category'     => 'AirPods',
            'model_code'   => 'A2931',
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);
    }

    /**
     * Test 1: GET /api/v1/shifts/current?branch_id=all tổng hợp chính xác các ca đang mở trên toàn chuỗi.
     */
    public function test_current_shift_aggregates_all_open_shifts_when_branch_id_is_all_or_omitted_by_admin(): void
    {
        // Mở ca tại Chi nhánh 1: đầu ca 1.000.000, thu tiền mặt 500.000, chi tiền mặt 100.000 => expected_cash = 1.400.000
        WorkShift::create([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch1->id,
            'shift_code'      => 'SH-B1-' . strtoupper(uniqid()),
            'cashier_id'      => $this->cashier1->id,
            'opened_at'       => now()->subHours(3),
            'status'          => 'open',
            'opening_cash'    => 1000000,
            'system_cash_in'  => 500000,
            'system_cash_out' => 100000,
            'expected_cash'   => 1400000,
        ]);

        // Mở ca tại Chi nhánh 2: đầu ca 1.500.000, thu tiền mặt 300.000, chi 0 => expected_cash = 1.800.000
        WorkShift::create([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch2->id,
            'shift_code'      => 'SH-B2-' . strtoupper(uniqid()),
            'cashier_id'      => $this->cashier2->id,
            'opened_at'       => now()->subHours(2),
            'status'          => 'open',
            'opening_cash'    => 1500000,
            'system_cash_in'  => 300000,
            'system_cash_out' => 0,
            'expected_cash'   => 1800000,
        ]);

        // Chi nhánh 3 chưa mở ca (status closed)
        WorkShift::create([
            'tenant_id'       => $this->tenant->id,
            'branch_id'       => $this->branch3->id,
            'shift_code'      => 'SH-B3-' . strtoupper(uniqid()),
            'cashier_id'      => $this->adminUser->id,
            'opened_at'       => now()->subDay(),
            'closed_at'       => now()->subHours(10),
            'status'          => 'closed',
            'opening_cash'    => 2000000,
            'system_cash_in'  => 0,
            'system_cash_out' => 0,
            'expected_cash'   => 2000000,
        ]);

        // Đơn hoàn tất tại Chi nhánh 1 kèm VietQR 400.000
        $orderB1 = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch1->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'created_by_user_id' => $this->cashier1->id,
            'order_code'         => 'PC26-B1-' . uniqid(),
            'status'             => 'completed',
            'issue_description'  => 'Thay pin tai trái',
            'total_price'        => 400000,
            'handed_over_at'     => now()->subHour(),
        ]);

        Payment::create([
            'payment_code'        => 'PAY-B1-' . uniqid(),
            'repair_order_id'     => $orderB1->id,
            'amount'              => 400000,
            'payment_method'      => 'vietqr',
            'status'              => 'paid',
            'paid_at'             => now()->subHour(),
            'received_by_user_id' => $this->cashier1->id,
        ]);

        // 2 đơn hoàn tất tại Chi nhánh 2 kèm bank_transfer 650.000
        $orderB2A = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch2->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'created_by_user_id' => $this->cashier2->id,
            'order_code'         => 'PC26-B2A-' . uniqid(),
            'status'             => 'completed',
            'issue_description'  => 'Sửa sạc kén',
            'total_price'        => 650000,
            'handed_over_at'     => now()->subMinutes(45),
        ]);

        Payment::create([
            'payment_code'        => 'PAY-B2A-' . uniqid(),
            'repair_order_id'     => $orderB2A->id,
            'amount'              => 650000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'paid',
            'paid_at'             => now()->subMinutes(45),
            'received_by_user_id' => $this->cashier2->id,
        ]);

        RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch2->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'created_by_user_id' => $this->cashier2->id,
            'order_code'         => 'PC26-B2B-' . uniqid(),
            'status'             => 'completed',
            'issue_description'  => 'Vệ sinh mic',
            'total_price'        => 300000,
            'handed_over_at'     => now()->subMinutes(30),
        ]);

        // Gọi với branch_id=all
        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/shifts/current?branch_id=all');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('has_active_shift', true)
            ->assertJsonPath('data.is_aggregated', true)
            ->assertJsonPath('data.open_branches_count', 2)
            ->assertJsonPath('data.total_branches_count', 3)
            ->assertJsonPath('data.orders_completed_count', 3);

        $this->assertEquals(2500000, (float) $response->json('data.opening_cash'));
        $this->assertEquals(800000, (float) $response->json('data.system_cash_in'));
        $this->assertEquals(100000, (float) $response->json('data.system_cash_out'));
        $this->assertEquals(3200000, (float) $response->json('data.expected_cash')); // 1.400.000 + 1.800.000
        $this->assertEquals(1050000, (float) $response->json('data.vietqr_total'));  // 400.000 + 650.000
        $this->assertCount(2, $response->json('data.open_shifts'));

        // Gọi không truyền branch_id bởi Admin (branch_id=null) -> Không bị lỗi 422 mà trả về bản tổng hợp
        $responseNoParam = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/shifts/current');

        $responseNoParam->assertStatus(200)
            ->assertJsonPath('data.is_aggregated', true)
            ->assertJsonPath('data.open_branches_count', 2);
    }

    /**
     * Test 2: Khi không có chi nhánh nào mở ca, branch_id=all trả về has_active_shift = false và các tổng bằng 0.
     */
    public function test_current_shift_all_branches_returns_zero_when_no_branch_has_open_shift(): void
    {
        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/shifts/current?branch_id=all');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('has_active_shift', false)
            ->assertJsonPath('data.is_aggregated', true)
            ->assertJsonPath('data.open_branches_count', 0)
            ->assertJsonPath('data.total_branches_count', 3)
            ->assertJsonPath('data.expected_cash', 0)
            ->assertJsonPath('data.vietqr_total', 0)
            ->assertJsonPath('data.orders_completed_count', 0);
    }
}
