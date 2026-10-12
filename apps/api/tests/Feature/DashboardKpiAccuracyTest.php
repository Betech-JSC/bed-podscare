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

class DashboardKpiAccuracyTest extends TestCase
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
            'code'   => 'tenant_kpi_acc_' . uniqid(),
            'name'   => 'PodsCare KPI Accuracy Test Tenant',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh KPI Test ' . uniqid(),
            'code'      => 'BR_KPI_' . uniqid(),
            'phone'     => '0901112233',
            'address'   => '456 Đường CMT8, Quận 3',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Test KPI',
            'phone'     => '0912' . rand(100000, 999999),
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
            'name'      => 'Admin KPI Accuracy Tester',
            'email'     => 'admin_accuracy_' . uniqid() . '@podscare.vn',
            'phone'     => '0908' . rand(100000, 999999),
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
            'order_code'         => "PC{$year}-ACC{$randomNum}",
            'issue_description'  => 'Kiểm tra độ chính xác KPI',
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
     * Case 1: Top-level KPI response chứa completed_orders và total_orders (cả /api/v1/kpi và /api/v1/kpi/dashboard).
     */
    public function test_kpi_response_contains_top_level_and_summary_completed_orders_and_total_orders(): void
    {
        // Tạo 2 đơn hoàn tất, 1 đơn đang kiểm tra, 1 đơn đang sửa
        $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 400000,
            'handed_over_at' => Carbon::now($this->tz),
        ]);
        $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 600000,
            'handed_over_at' => Carbon::now($this->tz),
        ]);
        $this->createOrder([
            'status' => 'inspecting',
        ]);
        $this->createOrder([
            'status' => 'in_repair',
        ]);

        // 1. Kiểm tra endpoint /api/v1/kpi/dashboard
        $respDashboard = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}");

        $respDashboard->assertStatus(200)->assertJsonPath('success', true);
        $dataDash = $respDashboard->json('data');

        $this->assertArrayHasKey('completed_orders', $dataDash);
        $this->assertArrayHasKey('total_orders', $dataDash);
        $this->assertEquals(2, $dataDash['completed_orders']);
        $this->assertEquals(4, $dataDash['total_orders']);

        $this->assertArrayHasKey('completed_orders', $dataDash['summary']);
        $this->assertArrayHasKey('total_orders', $dataDash['summary']);
        $this->assertEquals(2, $dataDash['summary']['completed_orders']);
        $this->assertEquals(4, $dataDash['summary']['total_orders']);

        // 2. Kiểm tra endpoint alias /api/v1/kpi
        $respKpi = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi?branch_id={$this->branch->id}");

        $respKpi->assertStatus(200)->assertJsonPath('success', true);
        $dataKpi = $respKpi->json('data');

        $this->assertEquals(2, $dataKpi['completed_orders']);
        $this->assertEquals(4, $dataKpi['total_orders']);
        $this->assertEquals(2, $dataKpi['summary']['completed_orders']);
        $this->assertEquals(4, $dataKpi['summary']['total_orders']);
    }

    /**
     * Case 2: Đơn hoàn tất từ tháng trước bị cập nhật ghi chú/payment trong tháng này KHÔNG được tính vào Doanh thu tháng hiện tại.
     */
    public function test_completed_order_from_previous_month_updated_in_current_month_is_excluded_from_monthly_revenue(): void
    {
        $now = Carbon::now($this->tz);
        $todayStr = $now->toDateString();

        $startOfLastMonth = $now->copy()->subMonthNoOverflow()->startOfMonth();
        $midLastMonth = $startOfLastMonth->copy()->addDays(10);

        // Đơn 1: Hoàn tất trong tháng hiện tại (doanh thu 500.000)
        $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 500000,
            'handed_over_at' => $now->copy()->startOfMonth()->addDays(2),
        ]);

        // Đơn 2: Hoàn tất tháng trước (handed_over_at = tháng trước),
        // nhưng bị cập nhật note/payment trong tháng này khiến updated_at rơi vào tháng này
        $orderLastMonth = $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 700000,
            'handed_over_at' => $midLastMonth,
            'created_at'     => $startOfLastMonth,
        ]);
        // Giả lập cập nhật trong tháng này
        $orderLastMonth->updated_at = $now;
        $orderLastMonth->saveQuietly();

        // Đơn 3: Hoàn tất tháng trước nhưng handed_over_at null (fallback updated_at ở tháng trước)
        $orderNoHandover = $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 300000,
            'handed_over_at' => null,
            'created_at'     => $startOfLastMonth,
        ]);
        $orderNoHandover->updated_at = $midLastMonth;
        $orderNoHandover->saveQuietly();

        // Gọi API KPI với ngày hôm nay
        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}&date={$todayStr}");

        $response->assertStatus(200);
        $data = $response->json('data');

        // Doanh thu tháng này CHỈ được tính 500.000 từ Đơn 1,
        // Đơn 2 (700.000) có updated_at tháng này nhưng handed_over_at tháng trước nên BẮT BUỘC bị loại trừ!
        $this->assertEquals(500000, $data['monthly_revenue']);
        $this->assertEquals(500000, $data['summary']['monthly_revenue']);
    }

    /**
     * Case 3: Tổng status_distribution bằng chính xác total_orders (kể cả khi có đơn rejected hoặc trạng thái alias).
     */
    public function test_sum_of_status_distribution_equals_total_orders_with_rejected_and_aliases(): void
    {
        $statuses = [
            'inspecting',
            'waiting_approval',
            'quote_pending',  // alias -> waiting_approval
            'rejected',       // trạng thái bị từ chối sửa
            'waiting_tech',
            'assigned',
            'in_repair',
            'waiting_parts',
            'rework_needed',
            'waiting_qc',
            'qc_pending',     // alias -> waiting_qc
            'qc_inspecting',  // alias -> waiting_qc
            'ready_for_return',
            'waiting_pickup',
            'completed',
            'cancelled',
        ];

        foreach ($statuses as $st) {
            $this->createOrder([
                'status'         => $st,
                'handed_over_at' => $st === 'completed' ? Carbon::now($this->tz) : null,
            ]);
        }

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}");

        $response->assertStatus(200);
        $data = $response->json('data');

        $this->assertEquals(count($statuses), $data['total_orders']);

        $distribution = $data['status_distribution'];
        $this->assertIsArray($distribution);

        // 1. Phải có key 'rejected'
        $this->assertArrayHasKey('rejected', $distribution);
        $this->assertEquals(1, $distribution['rejected']);

        // 2. waiting_approval phải bao gồm cả quote_pending (1 + 1 = 2)
        $this->assertEquals(2, $distribution['waiting_approval']);

        // 3. waiting_qc phải bao gồm cả qc_pending và qc_inspecting (1 + 1 + 1 = 3)
        $this->assertEquals(3, $distribution['waiting_qc']);

        // 4. Tổng số lượng phân bổ trạng thái phải chính xác bằng total_orders
        $sumDistribution = array_sum($distribution);
        $this->assertEquals($data['total_orders'], $sumDistribution);
    }

    /**
     * Case 4: Phép tính in_workshop_amount và in_workshop_count tính đúng các trạng thái trong xưởng.
     */
    public function test_in_workshop_amount_and_count_include_quote_pending_qc_inspecting_and_rejected(): void
    {
        // 1. quote_pending trong xưởng (200k)
        $this->createOrder([
            'status'      => 'quote_pending',
            'total_price' => 200000,
        ]);

        // 2. qc_inspecting trong xưởng (300k)
        $this->createOrder([
            'status'      => 'qc_inspecting',
            'total_price' => 300000,
        ]);

        // 3. rejected trong xưởng (initial_price 150k, total_price 0)
        $this->createOrder([
            'status'        => 'rejected',
            'initial_price' => 150000,
            'total_price'   => 0,
        ]);

        // 4. in_repair trong xưởng (500k)
        $this->createOrder([
            'status'      => 'in_repair',
            'total_price' => 500000,
        ]);

        // 5. ready_for_return (400k) -> thuộc ready_for_pickup, không tính vào in_workshop
        $this->createOrder([
            'status'      => 'ready_for_return',
            'total_price' => 400000,
        ]);

        // 6. completed (600k) -> đã bàn giao, không tính vào in_workshop
        $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 600000,
            'handed_over_at' => Carbon::now($this->tz),
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}");

        $response->assertStatus(200);
        $reconciliation = $response->json('data.reconciliation');

        // in_workshop gồm: quote_pending, qc_inspecting, rejected, in_repair (tổng cộng 4 đơn)
        $this->assertEquals(4, $reconciliation['in_workshop_count']);
        // in_workshop_amount: 200.000 + 300.000 + 150.000 (COALESCE initial_price) + 500.000 = 1.150.000
        $this->assertEquals(1150000, $reconciliation['in_workshop_amount']);

        // ready_for_pickup gồm: ready_for_return (1 đơn, 400k)
        $this->assertEquals(1, $reconciliation['ready_for_pickup_count']);
        $this->assertEquals(400000, $reconciliation['ready_for_pickup_amount']);

        // total_uncollected_amount = 1.150.000 + 400.000 = 1.550.000
        $this->assertEquals(1550000, $reconciliation['total_uncollected_amount']);
    }
}
