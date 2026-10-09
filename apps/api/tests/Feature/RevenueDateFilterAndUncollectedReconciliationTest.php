<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RevenueDateFilterAndUncollectedReconciliationTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $adminUser;
    protected string $tz;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tz = config('app.timezone', 'Asia/Ho_Chi_Minh');

        $this->tenant = Tenant::create([
            'code'   => 'tenant_test_' . uniqid(),
            'name'   => 'PodsCare KPI Test Suite',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Test ' . uniqid(),
            'code'      => 'BR_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Đường Test, Quận 1',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Test',
            'phone'     => '0988' . rand(100000, 999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro 2',
            'category'     => 'AirPods',
            'model_code'   => 'A2931',
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);

        $this->adminUser = User::create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin KPI Tester',
            'email'     => 'admin_kpi_' . uniqid() . '@podscare.vn',
            'phone'     => '0909' . rand(100000, 999999),
            'password'  => Hash::make('Secret123!'),
            'role'      => 'admin',
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
            'order_code'         => "PC{$year}-T{$randomNum}",
            'issue_description'  => 'Kiểm tra lỗi tai nghe test',
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
     * Test 1: Dashboard KPI chấp nhận tham số date và trả về doanh thu ngày được chọn chính xác.
     */
    public function test_dashboard_kpi_accepts_date_parameter_and_returns_selected_date_revenue(): void
    {
        $targetDate = Carbon::today($this->tz)->subDays(3);
        $targetDateStr = $targetDate->toDateString();

        // 1. Tạo 2 đơn completed vào ngày được chọn (tổng doanh thu 1.100.000)
        $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 450000,
            'handed_over_at' => Carbon::parse($targetDateStr . ' 10:30:00', $this->tz),
        ]);

        $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 650000,
            'handed_over_at' => Carbon::parse($targetDateStr . ' 14:15:00', $this->tz),
        ]);

        // 2. Tạo 1 đơn completed hôm nay (không được tính vào selected_date của ngày trước)
        $todayStr = Carbon::today($this->tz)->toDateString();
        $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 300000,
            'handed_over_at' => Carbon::parse($todayStr . ' 09:00:00', $this->tz),
        ]);

        // Gọi API với param date
        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}&date={$targetDateStr}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $data = $response->json('data');

        // Xác nhận trường cấp gốc (data)
        $this->assertEquals($targetDateStr, $data['selected_date']);
        $this->assertEquals(1100000, $data['selected_date_revenue']);
        $this->assertEquals('1,1tr ₫', $data['selected_date_revenue_formatted']);
        $this->assertEquals(2, $data['selected_date_completed_orders']);

        // Xác nhận trường trong summary (data.summary)
        $this->assertEquals($targetDateStr, $data['summary']['selected_date']);
        $this->assertEquals(1100000, $data['summary']['selected_date_revenue']);
        $this->assertEquals('1,1tr ₫', $data['summary']['selected_date_revenue_formatted']);
        $this->assertEquals(2, $data['summary']['selected_date_completed_orders']);
    }

    /**
     * Test 2: Dashboard KPI duy trì doanh thu hôm nay độc lập với tham số date.
     */
    public function test_dashboard_kpi_maintains_daily_revenue_independent_of_date_parameter(): void
    {
        $todayStr = Carbon::today($this->tz)->toDateString();
        $pastDate = Carbon::today($this->tz)->subDays(7);
        $pastDateStr = $pastDate->toDateString();

        // 1. Tạo đơn hoàn tất hôm nay với doanh thu 500.000
        $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 500000,
            'handed_over_at' => Carbon::parse($todayStr . ' 11:00:00', $this->tz),
        ]);

        // 2. Tạo đơn hoàn tất ngày trong quá khứ với doanh thu 800.000
        $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 800000,
            'handed_over_at' => Carbon::parse($pastDateStr . ' 16:00:00', $this->tz),
        ]);

        // Gọi API với date của ngày quá khứ
        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}&date={$pastDateStr}");

        $response->assertStatus(200);
        $data = $response->json('data');

        // daily_revenue vẫn phản ánh đơn của hôm nay (500.000 ₫)
        $this->assertEquals(500000, $data['daily_revenue']);
        $this->assertEquals('500.000 ₫', $data['daily_revenue_formatted']);
        $this->assertEquals(500000, $data['summary']['daily_revenue']);

        // Trong khi selected_date_revenue phản ánh ngày quá khứ (800.000 ₫)
        $this->assertEquals($pastDateStr, $data['selected_date']);
        $this->assertEquals(800000, $data['selected_date_revenue']);
        $this->assertEquals('800.000 ₫', $data['selected_date_revenue_formatted']);
        $this->assertEquals(1, $data['selected_date_completed_orders']);
    }

    /**
     * Test 3: Đối soát tính toán tổng tiền chưa thu theo Phương án A (total_uncollected_amount).
     */
    public function test_reconciliation_calculates_total_uncollected_amount_option_a(): void
    {
        // 1. Nhóm Chờ lấy / COD (ready_for_return & waiting_pickup)
        $this->createOrder([
            'status'      => 'ready_for_return',
            'total_price' => 400000,
        ]);

        $this->createOrder([
            'status'      => 'waiting_pickup',
            'total_price' => 250000,
        ]);

        // 2. Nhóm Trong xưởng (in_repair & waiting_parts)
        $this->createOrder([
            'status'        => 'in_repair',
            'total_price'   => 500000,
            'initial_price' => 500000,
        ]);

        $this->createOrder([
            'status'        => 'waiting_parts',
            'total_price'   => 350000,
            'initial_price' => 350000,
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}");

        $response->assertStatus(200);

        $reconciliation = $response->json('data.reconciliation');
        $this->assertNotNull($reconciliation);

        // Chờ lấy: 400.000 + 250.000 = 650.000
        $this->assertEquals(2, $reconciliation['ready_for_pickup_count']);
        $this->assertEquals(650000, $reconciliation['ready_for_pickup_amount']);
        $this->assertEquals('650.000 ₫', $reconciliation['ready_for_pickup_amount_formatted']);

        // Trong xưởng: 500.000 + 350.000 = 850.000
        $this->assertEquals(2, $reconciliation['in_workshop_count']);
        $this->assertEquals(850000, $reconciliation['in_workshop_amount']);
        $this->assertEquals('850.000 ₫', $reconciliation['in_workshop_amount_formatted']);

        // Phương án A: Tổng tiền chưa thu = ready_for_pickup_amount + in_workshop_amount
        // 650.000 + 850.000 = 1.500.000
        $this->assertEquals(1500000, $reconciliation['total_uncollected_amount']);
        $this->assertEquals('1.500.000 ₫', $reconciliation['total_uncollected_amount_formatted']);

        // Kiểm tra đối soát trong summary
        $summaryRecon = $response->json('data.summary.reconciliation');
        $this->assertEquals(1500000, $summaryRecon['total_uncollected_amount']);
        $this->assertEquals('1.500.000 ₫', $summaryRecon['total_uncollected_amount_formatted']);
    }

    /**
     * Test 4: Định dạng ngày không hợp lệ fallback an toàn về ngày hôm nay không crash.
     */
    public function test_invalid_date_format_falls_back_gracefully_to_today(): void
    {
        $todayStr = Carbon::today($this->tz)->toDateString();

        // Tạo 1 đơn hoàn tất hôm nay
        $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 400000,
            'handed_over_at' => Carbon::parse($todayStr . ' 08:30:00', $this->tz),
        ]);

        // Trường hợp 1: Chuỗi không đúng định dạng
        $responseInvalid = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}&date=invalid-date-string");

        $responseInvalid->assertStatus(200);
        $dataInvalid = $responseInvalid->json('data');

        $this->assertEquals($todayStr, $dataInvalid['selected_date']);
        $this->assertEquals($dataInvalid['daily_revenue'], $dataInvalid['selected_date_revenue']);

        // Trường hợp 2: Ngày không tồn tại theo lịch (31 tháng 2)
        $responseNonExistent = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}&date=2026-02-31");

        $responseNonExistent->assertStatus(200);
        $dataNonExistent = $responseNonExistent->json('data');

        $this->assertEquals($todayStr, $dataNonExistent['selected_date']);
        $this->assertEquals($dataNonExistent['daily_revenue'], $dataNonExistent['selected_date_revenue']);
    }
}
