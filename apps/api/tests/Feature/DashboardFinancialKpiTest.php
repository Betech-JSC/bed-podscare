<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\InventoryTransaction;
use App\Models\Part;
use App\Models\Payment;
use App\Models\QuoteItem;
use App\Models\RepairOrder;
use App\Models\RepairQuote;
use App\Models\Tenant;
use App\Models\User;
use Carbon\Carbon;
use Tests\TestCase;

class DashboardFinancialKpiTest extends TestCase
{
    protected Tenant $tenant;
    protected Branch $branch;
    protected User $adminUser;
    protected Customer $customer;
    protected DeviceModel $device;
    protected Part $partA;
    protected Part $partB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::first() ?? Tenant::create([
            'name'      => 'FixO KPI Test Tenant',
            'code'      => 'FIXO-KPI-NORM',
            'is_active' => true,
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh KPI Test',
            'code'      => 'CN-KPI-' . uniqid(),
            'address'   => '555 Hai Bà Trưng, Q.3',
            'phone'     => '0901000999',
            'is_active' => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Financial KPI',
            'email'     => 'admin_kpi_' . uniqid() . '@fixo.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'admin',
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng KPI Test',
            'phone'     => '0933' . rand(100000, 999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro',
            'category'     => 'AirPods',
            'model_code'   => 'A2084',
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);

        // Tạo 2 linh kiện để tính COGS
        $this->partA = Part::create([
            'tenant_id'        => $this->tenant->id,
            'sku'              => 'PART-A-' . uniqid(),
            'name'             => 'Pin AirPods Pro',
            'category'         => 'battery',
            'storage_location' => 'Kệ KPI-01',
            'stock_quantity'   => 50,
            'min_stock_alert'  => 5,
            'cost_price'       => 100000, // Giá vốn: 100.000đ
            'retail_price'     => 300000,
            'is_active'        => true,
        ]);

        $this->partB = Part::create([
            'tenant_id'        => $this->tenant->id,
            'sku'              => 'PART-B-' . uniqid(),
            'name'             => 'Loa AirPods Pro',
            'category'         => 'speaker',
            'storage_location' => 'Kệ KPI-02',
            'stock_quantity'   => 50,
            'min_stock_alert'  => 5,
            'cost_price'       => 150000, // Giá vốn: 150.000đ
            'retail_price'     => 400000,
            'is_active'        => true,
        ]);

        BranchPart::create([
            'branch_id'       => $this->branch->id,
            'part_id'         => $this->partA->id,
            'stock_quantity'  => 30,
            'min_stock_alert' => 5,
        ]);

        BranchPart::create([
            'branch_id'       => $this->branch->id,
            'part_id'         => $this->partB->id,
            'stock_quantity'  => 30,
            'min_stock_alert' => 5,
        ]);
    }

    private function createOrder(string $status, float $totalPrice, array $extra = []): RepairOrder
    {
        return RepairOrder::create(array_merge([
            'tenant_id'           => $this->tenant->id,
            'order_code'          => 'PC26-' . strtoupper(bin2hex(random_bytes(4))) . rand(100, 999),
            'branch_id'           => $this->branch->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->device->id,
            'issue_description'   => 'Lỗi sửa chữa test',
            'status'              => $status,
            'total_price'         => $totalPrice,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $this->adminUser->id,
        ], $extra));
    }

    /**
     * Test 1: Accounts Receivable (Công nợ khách hàng) chỉ tính trên các đơn ready_for_return, waiting_pickup, completed chưa thanh toán đủ.
     * Hoàn toàn loại bỏ các đơn đang sửa trong xưởng (inspecting, waiting_approval, in_repair, rejected, cancelled).
     */
    public function test_accounts_receivable_includes_only_delivered_or_completed_orders_with_unpaid_balances(): void
    {
        $today = Carbon::today('Asia/Ho_Chi_Minh');

        // 1. Đơn inspecting: 200.000đ -> WIP, KHÔNG tính vào AR
        $this->createOrder('inspecting', 200000);

        // 2. Đơn in_repair: 500.000đ -> WIP, KHÔNG tính vào AR
        $this->createOrder('in_repair', 500000);

        // 3. Đơn waiting_approval: 400.000đ -> WIP, KHÔNG tính vào AR
        $this->createOrder('waiting_approval', 400000);

        // 4. Đơn rejected: 300.000đ -> KHÔNG tính vào AR
        $this->createOrder('rejected', 300000);

        // 5. Đơn cancelled: 350.000đ -> KHÔNG tính vào AR
        $this->createOrder('cancelled', 350000);

        // 6. Đơn ready_for_return: 600.000đ, chưa thanh toán đồng nào -> TÍNH VÀO AR: 600.000đ
        $this->createOrder('ready_for_return', 600000);

        // 7. Đơn waiting_pickup: 800.000đ, đã cọc/trả trước 300.000đ -> TÍNH VÀO AR: 500.000đ
        $orderWaiting = $this->createOrder('waiting_pickup', 800000);
        Payment::create([
            'payment_code'        => 'FX26-PY-' . rand(1000, 9999),
            'repair_order_id'     => $orderWaiting->id,
            'amount'              => 300000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'paid',
            'paid_at'             => $today->copy()->hour(10),
            'received_by_user_id' => $this->adminUser->id,
        ]);

        // 8. Đơn completed: 1.000.000đ, đã thanh toán đủ 1.000.000đ -> AR = 0
        $orderCompletedPaid = $this->createOrder('completed', 1000000, [
            'handed_over_at' => $today->copy()->hour(11),
        ]);
        Payment::create([
            'payment_code'        => 'FX26-PY-' . rand(1000, 9999),
            'repair_order_id'     => $orderCompletedPaid->id,
            'amount'              => 1000000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => $today->copy()->hour(11),
            'received_by_user_id' => $this->adminUser->id,
        ]);

        // 9. Đơn completed giao máy trả sau: 700.000đ, chưa thanh toán -> TÍNH VÀO AR: 700.000đ
        $this->createOrder('completed', 700000, [
            'handed_over_at' => $today->copy()->hour(14),
        ]);

        // Tổng AR kỳ vọng: 600.000 (ready) + 500.000 (waiting) + 700.000 (completed unpaid) = 1.800.000đ
        $todayStr = $today->toDateString();
        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi?branch_id={$this->branch->id}&date={$todayStr}");

        $response->assertStatus(200);
        $data = $response->json('data');

        $this->assertArrayHasKey('accounts_receivable', $data);
        $this->assertEquals(1800000, (float) $data['accounts_receivable']);
    }

    /**
     * Test 2: Giá vốn hàng bán (COGS) được tính từ chi phí linh kiện thực xuất (export_repair) của các đơn hoàn tất trong kỳ.
     * Tính đúng Lợi nhuận gộp: Gross Profit = Revenue - COGS.
     */
    public function test_cogs_and_gross_profit_calculated_from_actual_export_repair_transactions(): void
    {
        $today = Carbon::today('Asia/Ho_Chi_Minh');

        // Tạo 1 đơn hoàn tất hôm nay: Doanh thu 900.000đ
        $order = $this->createOrder('completed', 900000, [
            'handed_over_at' => $today->copy()->hour(10),
        ]);

        // Ghi nhận 2 giao dịch xuất kho thực tế cho đơn này:
        // - 1 pin (cost 100.000đ)
        // - 2 loa (cost 150.000đ * 2 = 300.000đ)
        // => Tổng COGS thực tế = 400.000đ
        InventoryTransaction::create([
            'transaction_code'   => 'TX-TEST-' . uniqid(),
            'part_id'            => $this->partA->id,
            'branch_id'          => $this->branch->id,
            'repair_order_id'    => $order->id,
            'transaction_type'   => 'export_repair',
            'quantity'           => -1,
            'unit_cost'          => 100000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        InventoryTransaction::create([
            'transaction_code'   => 'TX-TEST-' . uniqid(),
            'part_id'            => $this->partB->id,
            'branch_id'          => $this->branch->id,
            'repair_order_id'    => $order->id,
            'transaction_type'   => 'export_repair',
            'quantity'           => -2,
            'unit_cost'          => 150000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $todayStr = $today->toDateString();
        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi?branch_id={$this->branch->id}&date={$todayStr}");

        $response->assertStatus(200);
        $data = $response->json('data');

        // 1. Doanh thu hôm nay = 900.000đ
        $this->assertEquals(900000, (float) $data['selected_date_revenue']);

        // 2. COGS hôm nay = 400.000đ
        $this->assertEquals(400000, (float) $data['selected_date_cogs']);

        // 3. Gross Profit = 900.000 - 400.000 = 500.000đ
        $this->assertEquals(500000, (float) $data['selected_date_gross_profit']);

        // 4. Gross Profit Margin = (500.000 / 900.000) * 100 = 55.6%
        $this->assertEquals(55.6, round((float) $data['selected_date_gross_profit_margin'], 1));
    }
}
