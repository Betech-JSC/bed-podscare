<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Part;
use App\Models\QuoteItem;
use App\Models\RepairOrder;
use App\Models\RepairQuote;
use App\Models\Tenant;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class KpiFinancialRbacTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected User $adminUser;
    protected User $technicianUser;
    protected User $receptionistUser;
    protected Customer $customer;
    protected DeviceModel $device;
    protected Part $part;
    protected string $tz;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tz = config('app.timezone', 'Asia/Ho_Chi_Minh');

        $this->tenant = Tenant::create([
            'code'   => 'tenant_kpi_rbac_' . uniqid(),
            'name'   => 'PodsCare KPI Financial RBAC Tenant',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh KPI RBAC ' . uniqid(),
            'code'      => 'BR_KPIRBAC_' . uniqid(),
            'phone'     => '0901113355',
            'address'   => '789 Đường Lê Văn Sỹ, Quận 3',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng KPI RBAC',
            'phone'     => '0918' . rand(100000, 999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro 2',
            'category'     => 'AirPods',
            'model_code'   => 'A2931',
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin KPI RBAC Tester',
            'email'     => 'admin_kpi_rbac_' . uniqid() . '@podscare.vn',
            'phone'     => '0908' . rand(100000, 999999),
            'password'  => Hash::make('Secret123!'),
            'role'      => 'admin',
        ]);

        $this->technicianUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Tech KPI RBAC Tester',
            'email'     => 'tech_kpi_rbac_' . uniqid() . '@podscare.vn',
            'phone'     => '0907' . rand(100000, 999999),
            'password'  => Hash::make('Secret123!'),
            'role'      => 'technician',
        ]);

        $this->receptionistUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Recep KPI RBAC Tester',
            'email'     => 'recep_kpi_rbac_' . uniqid() . '@podscare.vn',
            'phone'     => '0906' . rand(100000, 999999),
            'password'  => Hash::make('Secret123!'),
            'role'      => 'receptionist',
        ]);

        $this->part = Part::create([
            'tenant_id'         => $this->tenant->id,
            'sku'               => 'SPK-APP2-' . uniqid(),
            'name'              => 'Màng Loa AirPods Pro 2 Zin',
            'category'          => 'speaker',
            'compatible_models' => 'AirPods Pro 2',
            'storage_location'  => 'Kệ B2-01',
            'stock_quantity'    => 50,
            'min_stock_alert'   => 5,
            'cost_price'        => 200000,
            'retail_price'      => 500000,
            'unit'              => 'cái',
            'is_active'         => true,
        ]);
    }

    private function createOrder(array $attributes = []): RepairOrder
    {
        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);

        return RepairOrder::create(array_merge([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => "PC{$year}-RBAC{$randomNum}",
            'issue_description'  => 'Kiểm tra phân quyền tài chính KPI',
            'status'             => 'inspecting',
            'order_type'         => 'in_store',
            'total_price'        => 500000,
            'initial_price'      => 500000,
            'warranty_terms_days'=> 90,
            'created_by_user_id' => $this->adminUser->id,
            'created_at'         => Carbon::now($this->tz),
        ], $attributes));
    }

    /**
     * 1.3 Non-admin (KTV & Lễ tân) gọi GET /api/v1/kpi KHÔNG nhận được các trường tài chính.
     */
    public function test_non_admin_cannot_see_financial_metrics_in_kpi_dashboard(): void
    {
        // Tạo đơn completed có doanh thu
        $completedOrder = $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 1000000,
            'handed_over_at' => Carbon::now($this->tz),
        ]);

        // Tạo đơn đang xử lý
        $this->createOrder([
            'status'        => 'in_repair',
            'initial_price' => 400000,
            'total_price'   => 400000,
        ]);

        // Tạo đơn sẵn sàng giao
        $this->createOrder([
            'status'      => 'ready_for_return',
            'total_price' => 300000,
        ]);

        $financialFields = [
            'daily_revenue',
            'daily_revenue_formatted',
            'monthly_revenue',
            'monthly_revenue_formatted',
            'selected_date_revenue',
            'selected_date_revenue_formatted',
            'revenue_chart',
            'selected_date_cogs',
            'selected_date_cogs_formatted',
            'monthly_cogs',
            'monthly_cogs_formatted',
            'selected_date_gross_profit',
            'selected_date_gross_profit_formatted',
            'monthly_gross_profit',
            'monthly_gross_profit_formatted',
            'gross_profit_margin',
            'accounts_receivable',
            'accounts_receivable_formatted',
        ];

        $reconciliationMoneyFields = [
            'handed_over_revenue',
            'handed_over_revenue_formatted',
            'in_workshop_amount',
            'in_workshop_amount_formatted',
            'ready_for_pickup_amount',
            'ready_for_pickup_amount_formatted',
            'total_uncollected_amount',
            'total_uncollected_amount_formatted',
        ];

        // 1. Kiểm tra với Technician qua /api/v1/kpi
        $respTech = $this->actingAs($this->technicianUser, 'sanctum')
            ->getJson("/api/v1/kpi?branch_id={$this->branch->id}");

        $respTech->assertStatus(200);
        $dataTech = $respTech->json('data');

        // Xác minh các trường tài chính không xuất hiện ở top-level và summary
        foreach ($financialFields as $field) {
            $this->assertArrayNotHasKey($field, $dataTech, "Trường tài chính {$field} không được phép xuất hiện ở top-level của Non-admin");
            $this->assertArrayNotHasKey($field, $dataTech['summary'] ?? [], "Trường tài chính {$field} không được phép xuất hiện trong summary của Non-admin");
        }

        // Xác minh các trường tiền trong reconciliation bị ẩn
        $reconTech = $dataTech['reconciliation'] ?? [];
        foreach ($reconciliationMoneyFields as $field) {
            $this->assertArrayNotHasKey($field, $reconTech, "Trường tiền đối soát {$field} không được phép xuất hiện trong reconciliation của Non-admin");
        }

        // Xác minh các chỉ số vận hành VẪN ĐẦY ĐỦ cho KTV
        $this->assertArrayHasKey('active_orders', $dataTech);
        $this->assertArrayHasKey('intake_today', $dataTech);
        $this->assertArrayHasKey('completion_rate', $dataTech);
        $this->assertArrayHasKey('total_orders', $dataTech);
        $this->assertArrayHasKey('completed_orders', $dataTech);
        $this->assertArrayHasKey('status_distribution', $dataTech);
        $this->assertArrayHasKey('workload_by_status', $dataTech);
        $this->assertArrayHasKey('operational_summary', $dataTech);
        $this->assertArrayHasKey('actionable_tasks', $dataTech);
        $this->assertArrayHasKey('handed_over_count', $reconTech);
        $this->assertArrayHasKey('in_workshop_count', $reconTech);
        $this->assertArrayHasKey('ready_for_pickup_count', $reconTech);

        // 2. Kiểm tra với Receptionist qua /api/v1/kpi/dashboard
        $respRecep = $this->actingAs($this->receptionistUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}");

        $respRecep->assertStatus(200);
        $dataRecep = $respRecep->json('data');

        foreach ($financialFields as $field) {
            $this->assertArrayNotHasKey($field, $dataRecep);
            $this->assertArrayNotHasKey($field, $dataRecep['summary'] ?? []);
        }
        foreach ($reconciliationMoneyFields as $field) {
            $this->assertArrayNotHasKey($field, $dataRecep['reconciliation'] ?? []);
        }
    }

    /**
     * 1.3 Admin gọi GET /api/v1/kpi nhận ĐẦY ĐỦ doanh thu, COGS, Gross Profit và Accounts Receivable.
     */
    public function test_admin_receives_complete_financial_metrics_including_cogs_gross_profit_and_receivables(): void
    {
        // 1. Tạo đơn hàng completed hôm nay kèm Quote và QuoteItem (Part zin có cost_price = 200000)
        $completedOrder = $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 500000,
            'handed_over_at' => Carbon::now($this->tz),
        ]);

        $quote = RepairQuote::create([
            'tenant_id'           => $this->tenant->id,
            'repair_order_id'     => $completedOrder->id,
            'quote_number'        => 'QT-TEST-' . uniqid(),
            'total_amount'        => 500000,
            'warranty_terms_days' => 90,
            'note'                => 'Báo giá test linh kiện zin',
            'status'              => 'approved',
            'sent_by_user_id'     => $this->adminUser->id,
        ]);

        QuoteItem::create([
            'quote_id'    => $quote->id,
            'part_id'     => $this->part->id,
            'description' => 'Màng loa zin',
            'quantity'    => 1,
            'unit_price'  => 500000,
            'amount'      => 500000,
        ]);

        // 2. Tạo đơn sẵn sàng giao khách (chưa thu tiền)
        $this->createOrder([
            'status'      => 'ready_for_return',
            'total_price' => 300000,
        ]);

        // 3. Tạo đơn đang trong xưởng (chưa thu tiền)
        $this->createOrder([
            'status'        => 'in_repair',
            'initial_price' => 400000,
            'total_price'   => 400000,
        ]);

        $todayStr = Carbon::now($this->tz)->toDateString();

        $resp = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi?branch_id={$this->branch->id}&date={$todayStr}");

        $resp->assertStatus(200);
        $data = $resp->json('data');

        // Doanh thu
        $this->assertArrayHasKey('selected_date_revenue', $data);
        $this->assertEquals(500000, (float) $data['selected_date_revenue']);
        $this->assertArrayHasKey('monthly_revenue', $data);
        $this->assertEquals(500000, (float) $data['monthly_revenue']);
        $this->assertArrayHasKey('revenue_chart', $data);
        $this->assertNotEmpty($data['revenue_chart']);

        // Giá vốn hàng bán (COGS): 1 cái * 200,000 = 200,000
        $this->assertArrayHasKey('selected_date_cogs', $data);
        $this->assertEquals(200000, (float) $data['selected_date_cogs']);
        $this->assertArrayHasKey('monthly_cogs', $data);
        $this->assertEquals(200000, (float) $data['monthly_cogs']);
        $this->assertArrayHasKey('selected_date_cogs_formatted', $data);

        // Lợi nhuận gộp Gross Profit: 500,000 - 200,000 = 300,000
        $this->assertArrayHasKey('selected_date_gross_profit', $data);
        $this->assertEquals(300000, (float) $data['selected_date_gross_profit']);
        $this->assertArrayHasKey('monthly_gross_profit', $data);
        $this->assertEquals(300000, (float) $data['monthly_gross_profit']);
        $this->assertArrayHasKey('selected_date_gross_profit_formatted', $data);
        $this->assertArrayHasKey('monthly_gross_profit_formatted', $data);

        // Tỷ suất lợi nhuận gộp: (300,000 / 500,000) * 100 = 60.0%
        $this->assertArrayHasKey('gross_profit_margin', $data);
        $this->assertEquals(60.0, (float) $data['gross_profit_margin']);

        // Công nợ phải thu (Accounts Receivable): 500,000 (hoàn tất chưa thu) + 300,000 (sẵn sàng giao) = 800,000 (loại trừ 400,000 đang sửa trong xưởng)
        $this->assertArrayHasKey('accounts_receivable', $data);
        $this->assertEquals(800000, (float) $data['accounts_receivable']);
        $this->assertArrayHasKey('accounts_receivable_formatted', $data);

        // Reconciliation đầy đủ cả số lượng và số tiền
        $recon = $data['reconciliation'];
        $this->assertEquals(700000, (float) $recon['total_uncollected_amount']);
        $this->assertEquals(300000, (float) $recon['ready_for_pickup_amount']);
        $this->assertEquals(400000, (float) $recon['in_workshop_amount']);
        $this->assertEquals(500000, (float) $recon['handed_over_revenue']);

        // Xác minh có cả trong summary
        $this->assertArrayHasKey('selected_date_cogs', $data['summary']);
        $this->assertArrayHasKey('selected_date_gross_profit', $data['summary']);
        $this->assertArrayHasKey('monthly_cogs', $data['summary']);
        $this->assertArrayHasKey('monthly_gross_profit', $data['summary']);
        $this->assertArrayHasKey('accounts_receivable', $data['summary']);
    }

    /**
     * 1.3 Đơn hàng hoàn tất không có linh kiện thì COGS = 0, Gross Profit = 100% doanh thu.
     */
    public function test_completed_order_without_parts_has_zero_cogs_and_100_percent_gross_profit(): void
    {
        // Đơn hoàn tất chỉ tính tiền công vệ sinh / xử lý phần mềm, không linh kiện
        $order = $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 350000,
            'handed_over_at' => Carbon::now($this->tz),
        ]);

        $todayStr = Carbon::now($this->tz)->toDateString();

        $resp = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi?branch_id={$this->branch->id}&date={$todayStr}");

        $resp->assertStatus(200);
        $data = $resp->json('data');

        $this->assertEquals(350000, (float) $data['selected_date_revenue']);
        $this->assertEquals(0, (float) $data['selected_date_cogs']);
        $this->assertEquals(350000, (float) $data['selected_date_gross_profit']);
        $this->assertEquals(100.0, (float) $data['gross_profit_margin']);
    }
}
