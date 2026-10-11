<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminDateFilterAndRevenueAlignmentTest extends TestCase
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
            'code'   => 'tenant_align_' . uniqid(),
            'name'   => 'PodsCare Alignment Test Suite',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Alignment ' . uniqid(),
            'code'      => 'BR_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '456 Đường CMT8, Quận 3',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Test Alignment',
            'phone'     => '0977' . rand(100000, 999999),
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
            'name'      => 'Admin Alignment Tester',
            'email'     => 'admin_align_' . uniqid() . '@podscare.vn',
            'phone'     => '0912' . rand(100000, 999999),
            'password'  => Hash::make('Secret123!'),
            'role'      => 'admin',
        ]);
    }

    private function createOrder(array $attributes = []): RepairOrder
    {
        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);

        $createdAt = $attributes['created_at'] ?? null;
        $updatedAt = $attributes['updated_at'] ?? null;
        unset($attributes['created_at'], $attributes['updated_at']);

        $order = RepairOrder::create(array_merge([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branch->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->device->id,
            'order_code'          => "PC{$year}-AL{$randomNum}",
            'issue_description'   => 'Lỗi âm thanh test alignment',
            'status'              => 'inspecting',
            'order_type'          => 'in_store',
            'total_price'         => 600000,
            'initial_price'       => 600000,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $this->adminUser->id,
        ], $attributes));

        $timestampUpdates = [];
        if ($createdAt) {
            $timestampUpdates['created_at'] = $createdAt;
        }
        if ($updatedAt) {
            $timestampUpdates['updated_at'] = $updatedAt;
        }
        if (! empty($timestampUpdates)) {
            \Illuminate\Support\Facades\DB::table('repair_orders')
                ->where('id', $order->id)
                ->update($timestampUpdates);
            $order->refresh();
        }

        return $order;
    }

    /**
     * Test 1: Lọc đơn theo loại ngày (created_at vs completed_at) và ngày cụ thể (date=YYYY-MM-DD).
     */
    public function test_order_index_supports_date_and_date_type_filtering(): void
    {
        $pastDate = Carbon::today($this->tz)->subDays(4);
        $pastDateStr = $pastDate->toDateString();
        $todayStr = Carbon::today($this->tz)->toDateString();

        // Đơn 1: Tạo ngày hôm nay, tiếp nhận hôm nay
        $orderToday = $this->createOrder([
            'created_at' => Carbon::parse($todayStr . ' 09:00:00', $this->tz),
        ]);

        // Đơn 2: Tạo vào ngày quá khứ
        $orderPast = $this->createOrder([
            'created_at' => Carbon::parse($pastDateStr . ' 10:00:00', $this->tz),
        ]);

        // Đơn 3: Tạo 4 ngày trước, hoàn tất hôm nay (có handed_over_at)
        $orderCompletedHandedOverToday = $this->createOrder([
            'status'         => 'completed',
            'created_at'     => Carbon::parse($pastDateStr . ' 11:00:00', $this->tz),
            'handed_over_at' => Carbon::parse($todayStr . ' 14:00:00', $this->tz),
        ]);

        // Đơn 4: Tạo 4 ngày trước, hoàn tất hôm nay (handed_over_at null, fallback updated_at)
        $orderCompletedFallbackToday = $this->createOrder([
            'status'         => 'completed',
            'created_at'     => Carbon::parse($pastDateStr . ' 08:00:00', $this->tz),
            'handed_over_at' => null,
            'updated_at'     => Carbon::parse($todayStr . ' 16:30:00', $this->tz),
        ]);

        // Scenario A: Mặc định (created_at hôm nay)
        $resDefault = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/orders?date_filter=today&branch_id=' . $this->branch->id);

        $resDefault->assertOk();
        $idsDefault = collect($resDefault->json('data.data'))->pluck('id')->all();
        $this->assertContains($orderToday->id, $idsDefault);
        $this->assertNotContains($orderPast->id, $idsDefault);

        // Scenario B: Tra cứu ngày cụ thể theo created_at
        $resSpecificCreated = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/orders?date={$pastDateStr}&date_type=created_at&branch_id={$this->branch->id}");

        $resSpecificCreated->assertOk();
        $idsSpecific = collect($resSpecificCreated->json('data.data'))->pluck('id')->all();
        $this->assertContains($orderPast->id, $idsSpecific);
        $this->assertNotContains($orderToday->id, $idsSpecific);

        // Scenario C: Lọc theo completed_at hôm nay
        $resCompletedToday = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/orders?date_type=completed_at&status=completed&date_filter=today&branch_id={$this->branch->id}");

        $resCompletedToday->assertOk();
        $idsCompletedToday = collect($resCompletedToday->json('data.data'))->pluck('id')->all();
        $this->assertContains($orderCompletedHandedOverToday->id, $idsCompletedToday);
        $this->assertContains($orderCompletedFallbackToday->id, $idsCompletedToday);
        $this->assertNotContains($orderToday->id, $idsCompletedToday);

        // Scenario D: Lọc theo completed_at ngày quá khứ
        $resCompletedPast = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/orders?date={$pastDateStr}&date_type=completed_at&status=completed&branch_id={$this->branch->id}");

        $resCompletedPast->assertOk();
        $idsCompletedPast = collect($resCompletedPast->json('data.data'))->pluck('id')->all();
        // Không chứa các đơn hoàn tất hôm nay
        $this->assertNotContains($orderCompletedHandedOverToday->id, $idsCompletedPast);
        $this->assertNotContains($orderCompletedFallbackToday->id, $idsCompletedPast);
    }

    /**
     * Test 2: revenueChart trong KpiController đồng bộ 100% với selectedDateRevenue và dailyRevenue.
     */
    public function test_kpi_revenue_chart_aligns_with_stat_card_revenue(): void
    {
        $targetDate = Carbon::today($this->tz)->subDays(2);
        $targetDateStr = $targetDate->toDateString();
        $todayStr = Carbon::today($this->tz)->toDateString();

        // 1 đơn hoàn tất vào ngày targetDate với handed_over_at = null, updated_at = targetDate
        $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 750000,
            'handed_over_at' => null,
            'updated_at'     => Carbon::parse($targetDateStr . ' 10:00:00', $this->tz),
        ]);

        // 1 đơn hoàn tất vào ngày targetDate với handed_over_at = targetDate
        $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 250000,
            'handed_over_at' => Carbon::parse($targetDateStr . ' 15:00:00', $this->tz),
        ]);

        // 1 đơn hoàn tất hôm nay với handed_over_at = null, updated_at = today
        $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 400000,
            'handed_over_at' => null,
            'updated_at'     => Carbon::parse($todayStr . ' 11:00:00', $this->tz),
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}&date={$targetDateStr}");

        $response->assertOk();
        $data = $response->json('data');

        // Doanh thu targetDate: 750k + 250k = 1.000.000
        $this->assertEquals(1000000, $data['selected_date_revenue']);
        $this->assertEquals(2, $data['selected_date_completed_orders']);

        // Doanh thu hôm nay: 400.000
        $this->assertEquals(400000, $data['daily_revenue']);

        // Khớp trong biểu đồ revenue_chart
        $chart = collect($data['revenue_chart'])->keyBy('date');

        $targetChartPoint = $chart->get($targetDateStr);
        $this->assertNotNull($targetChartPoint);
        $this->assertEquals(1000000, $targetChartPoint['revenue']);
        $this->assertEquals(2, $targetChartPoint['completed_orders']);

        $todayChartPoint = $chart->get($todayStr);
        $this->assertNotNull($todayChartPoint);
        $this->assertEquals(400000, $todayChartPoint['revenue']);
        $this->assertEquals(1, $todayChartPoint['completed_orders']);
    }

    /**
     * Test 3: PaymentController::index hỗ trợ lọc theo tham số date trên COALESCE(paid_at, created_at).
     */
    public function test_payment_index_supports_date_filter(): void
    {
        $pastDate = Carbon::today($this->tz)->subDays(3);
        $pastDateStr = $pastDate->toDateString();
        $todayStr = Carbon::today($this->tz)->toDateString();

        $order = $this->createOrder();

        // Phiếu 1: Thanh toán hôm nay (có paid_at hôm nay, created_at quá khứ)
        $payment1 = Payment::create([
            'payment_code'       => 'PAY_' . uniqid(),
            'repair_order_id'    => $order->id,
            'amount'             => 300000,
            'payment_method'     => 'vietqr',
            'status'             => 'completed',
            'paid_at'            => Carbon::parse($todayStr . ' 09:30:00', $this->tz),
            'created_at'         => Carbon::parse($pastDateStr . ' 09:30:00', $this->tz),
            'received_by_user_id'=> $this->adminUser->id,
        ]);

        // Phiếu 2: Thanh toán hôm nay (paid_at null, fallback created_at hôm nay)
        $payment2 = Payment::create([
            'payment_code'       => 'PAY_' . uniqid(),
            'repair_order_id'    => $order->id,
            'amount'             => 200000,
            'payment_method'     => 'cash',
            'status'             => 'completed',
            'paid_at'            => null,
            'created_at'         => Carbon::parse($todayStr . ' 10:15:00', $this->tz),
            'received_by_user_id'=> $this->adminUser->id,
        ]);

        // Phiếu 3: Thanh toán ngày quá khứ
        $payment3 = Payment::create([
            'payment_code'       => 'PAY_' . uniqid(),
            'repair_order_id'    => $order->id,
            'amount'             => 500000,
            'payment_method'     => 'cash',
            'status'             => 'completed',
            'paid_at'            => Carbon::parse($pastDateStr . ' 14:00:00', $this->tz),
            'created_at'         => Carbon::parse($pastDateStr . ' 14:00:00', $this->tz),
            'received_by_user_id'=> $this->adminUser->id,
        ]);

        // Lọc ngày hôm nay: phải chứa payment1 và payment2, không chứa payment3
        $resToday = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/payments?date={$todayStr}");

        $resToday->assertOk();
        $idsToday = collect($resToday->json('data.data'))->pluck('id')->all();
        $this->assertContains($payment1->id, $idsToday);
        $this->assertContains($payment2->id, $idsToday);
        $this->assertNotContains($payment3->id, $idsToday);

        // Lọc ngày quá khứ: chỉ chứa payment3
        $resPast = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/payments?date={$pastDateStr}");

        $resPast->assertOk();
        $idsPast = collect($resPast->json('data.data'))->pluck('id')->all();
        $this->assertContains($payment3->id, $idsPast);
        $this->assertNotContains($payment1->id, $idsPast);
        $this->assertNotContains($payment2->id, $idsPast);

        // Không truyền date: trả về tất cả
        $resAll = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/payments');

        $resAll->assertOk();
        $idsAll = collect($resAll->json('data.data'))->pluck('id')->all();
        $this->assertContains($payment1->id, $idsAll);
        $this->assertContains($payment2->id, $idsAll);
        $this->assertContains($payment3->id, $idsAll);
    }
}
