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

class KpiDashboardReconciliationTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $adminUser;
    protected User $techUser;
    protected string $tz = 'Asia/Ho_Chi_Minh';

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_recon_' . uniqid(),
            'name'   => 'PodsCare Command Center Reconciliation Tenant',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'CN_REC_' . strtoupper(uniqid()),
            'phone'     => '0901112233',
            'address'   => '123 Lê Lợi, Q1',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Đối Soát',
            'phone'     => '0987' . rand(100000, 999999),
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
            'name'      => 'Admin Command Center',
            'email'     => 'admin_recon_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->techUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'KTV Xưởng',
            'email'     => 'tech_recon_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);
    }

    private function createOrder(array $attrs = []): RepairOrder
    {
        $createdAt = $attrs['created_at'] ?? null;
        $updatedAt = $attrs['updated_at'] ?? null;
        unset($attrs['created_at'], $attrs['updated_at']);

        $order = RepairOrder::create(array_merge([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'PC26-RC-' . strtoupper(uniqid()),
            'issue_description'  => 'Thay pin và sửa loa',
            'status'             => 'inspecting',
            'order_type'         => 'in_store',
            'total_price'        => 500000,
            'initial_price'      => 500000,
            'created_by_user_id' => $this->adminUser->id,
            'technician_id'      => $this->techUser->id,
        ], $attrs));

        if ($createdAt || $updatedAt) {
            if ($createdAt) {
                $order->created_at = Carbon::parse($createdAt, $this->tz);
            }
            if ($updatedAt) {
                $order->updated_at = Carbon::parse($updatedAt, $this->tz);
            }
            $order->saveQuietly();
        }

        return $order;
    }

    /**
     * Test 1: Kiểm tra cấu trúc 3 vùng ngữ nghĩa trên Dashboard (period_metrics, store_live_financials, workshop_pipeline)
     * và tính chất phân vùng loại trừ lẫn nhau của 6 bước Tiến độ xưởng.
     */
    public function test_dashboard_returns_three_semantic_zones_and_mutually_exclusive_workshop_pipeline(): void
    {
        $targetDate = '2026-10-16';

        // 1. inspecting (1 đơn, quá hạn > 24h)
        $this->createOrder([
            'status'     => 'inspecting',
            'created_at' => Carbon::now($this->tz)->subHours(30)->toDateTimeString(),
        ]);

        // 2. waiting_approval (1 đơn bình thường + 1 đơn có special_parts_status = pending -> đơn thứ 2 phải vào waiting_parts!)
        $this->createOrder([
            'status'     => 'waiting_approval',
            'created_at' => Carbon::now($this->tz)->subHours(5)->toDateTimeString(),
        ]);
        $this->createOrder([
            'status'               => 'waiting_approval',
            'special_parts_status' => 'pending',
            'special_parts_note'   => 'Đặt cụm cảm biến lực',
            'created_at'           => Carbon::now($this->tz)->subHours(4)->toDateTimeString(),
        ]);

        // 3. in_repair (2 đơn: 1 assigned, 1 in_repair)
        $this->createOrder([
            'status'     => 'assigned',
            'created_at' => Carbon::now($this->tz)->subHours(3)->toDateTimeString(),
        ]);
        $this->createOrder([
            'status'     => 'in_repair',
            'created_at' => Carbon::now($this->tz)->subHours(2)->toDateTimeString(),
        ]);

        // 4. waiting_parts trực tiếp (1 đơn)
        $this->createOrder([
            'status'     => 'waiting_parts',
            'created_at' => Carbon::now($this->tz)->subHours(6)->toDateTimeString(),
        ]);

        // 5. waiting_qc (1 đơn waiting_qc + 1 đơn rework_needed)
        $this->createOrder([
            'status'     => 'waiting_qc',
            'created_at' => Carbon::now($this->tz)->subHours(2)->toDateTimeString(),
        ]);
        $this->createOrder([
            'status'     => 'rework_needed',
            'created_at' => Carbon::now($this->tz)->subHours(2)->toDateTimeString(),
        ]);

        // 6. ready_for_return (1 đơn có giá 700.000, đã cọc 200.000, còn phải thu 500.000)
        $readyOrder = $this->createOrder([
            'status'      => 'ready_for_return',
            'total_price' => 700000,
            'created_at'  => Carbon::now($this->tz)->subHours(8)->toDateTimeString(),
        ]);
        Payment::create([
            'payment_code'        => 'PAY-RDY-' . uniqid(),
            'repair_order_id'     => $readyOrder->id,
            'amount'              => 200000,
            'payment_method'      => 'vietqr',
            'status'              => 'paid',
            'paid_at'             => Carbon::now($this->tz)->subHours(2),
            'received_by_user_id' => $this->adminUser->id,
        ]);

        // 7. Đơn đã completed trong ngày 2026-10-16 (giá 900.000: 400k tiền mặt + 500k chuyển khoản)
        $completedOrder = $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 900000,
            'handed_over_at' => Carbon::parse('2026-10-16 15:00:00', $this->tz),
            'created_at'     => '2026-10-16 10:00:00',
            'updated_at'     => '2026-10-16 15:00:00',
        ]);
        Payment::create([
            'payment_code'        => 'PAY-CMP-CASH-' . uniqid(),
            'repair_order_id'     => $completedOrder->id,
            'amount'              => 400000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => Carbon::parse('2026-10-16 15:00:00', $this->tz),
            'received_by_user_id' => $this->adminUser->id,
        ]);
        Payment::create([
            'payment_code'        => 'PAY-CMP-BANK-' . uniqid(),
            'repair_order_id'     => $completedOrder->id,
            'amount'              => 500000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'paid',
            'paid_at'             => Carbon::parse('2026-10-16 15:01:00', $this->tz),
            'received_by_user_id' => $this->adminUser->id,
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?period=today&date={$targetDate}");

        $response->assertStatus(200);

        // Kiểm tra Zone 1: period_metrics
        $this->assertEquals('today', $response->json('data.period_metrics.period'));
        $this->assertEquals($targetDate, $response->json('data.period_metrics.date'));
        $this->assertEquals(1, $response->json('data.period_metrics.completed_count'));
        $this->assertEquals(1, $response->json('data.period_metrics.order_flow.completed_count'));
        $this->assertEquals(900000, (float) $response->json('data.period_metrics.handover_revenue.total_revenue'));
        $this->assertEquals(400000, (float) $response->json('data.period_metrics.handover_revenue.cash_amount'));
        $this->assertEquals(500000, (float) $response->json('data.period_metrics.handover_revenue.transfer_amount'));
        $this->assertEquals('Tháng 10/2026', $response->json('data.period_metrics.monthly_revenue_summary.month_label'));
        $this->assertEquals(900000, (float) $response->json('data.period_metrics.monthly_revenue_summary.total_revenue'));
        $this->assertEquals(400000, (float) $response->json('data.period_metrics.monthly_revenue_summary.cash_amount'));
        $this->assertEquals(500000, (float) $response->json('data.period_metrics.monthly_revenue_summary.transfer_amount'));
        $this->assertEquals(1, $response->json('data.period_metrics.monthly_revenue_summary.completed_orders_count'));

        // Kiểm tra Zone 2: store_live_financials
        $this->assertEquals(9, $response->json('data.store_live_financials.open_orders_count'));
        $this->assertEquals(1, $response->json('data.store_live_financials.waiting_pickup_count'));
        $this->assertEquals(700000, (float) $response->json('data.store_live_financials.waiting_pickup_total_amount'));
        $this->assertEquals(200000, (float) $response->json('data.store_live_financials.waiting_pickup_deposit_amount'));
        $this->assertEquals(500000, (float) $response->json('data.store_live_financials.waiting_pickup_uncollected_amount'));
        $this->assertEquals(8, $response->json('data.store_live_financials.in_workshop_count'));
        $this->assertEquals(1, $response->json('data.store_live_financials.ready_for_pickup.count'));
        $this->assertEquals(700000, (float) $response->json('data.store_live_financials.ready_for_pickup.total_amount'));
        $this->assertEquals(200000, (float) $response->json('data.store_live_financials.ready_for_pickup.collected_amount'));
        $this->assertEquals(500000, (float) $response->json('data.store_live_financials.ready_for_pickup.uncollected_amount'));
        $this->assertEquals(8, $response->json('data.store_live_financials.in_workshop.count'));

        // Kiểm tra Zone 3: workshop_pipeline 6 bước loại trừ lẫn nhau
        $steps = $response->json('data.workshop_pipeline.steps');
        $this->assertEquals(1, $steps['inspecting']);
        $this->assertEquals(1, $steps['waiting_approval']);
        $this->assertEquals(3, $steps['in_repair']);     // 1 assigned + 1 in_repair + 1 rework_needed
        $this->assertEquals(2, $steps['waiting_parts']); // 1 waiting_parts + 1 waiting_approval có special_parts_status=pending
        $this->assertEquals(1, $steps['waiting_qc']);    // 1 waiting_qc
        $this->assertEquals(1, $steps['ready_for_return']);

        $sumSteps = array_sum($steps);
        $this->assertEquals(9, $sumSteps);
        $this->assertEquals($response->json('data.active_orders'), $sumSteps);
        $this->assertEquals(1, $response->json('data.workshop_pipeline.overdue_count'));

        // Định thức bất biến Vùng 2: inspecting + waiting_approval + in_repair + waiting_parts + waiting_qc === in_workshop_count
        $inWorkshopSum = $steps['inspecting']
            + $steps['waiting_approval']
            + $steps['in_repair']
            + $steps['waiting_parts']
            + $steps['waiting_qc'];
        $this->assertSame($inWorkshopSum, $response->json('data.store_live_financials.in_workshop_count'));
        $this->assertSame($inWorkshopSum, $response->json('data.store_live_financials.in_workshop.count'));

        // Và + waiting_pickup === open_orders_count
        $waitingPickupCount = $response->json('data.store_live_financials.waiting_pickup_count');
        $this->assertSame($steps['ready_for_return'], $waitingPickupCount);
        $this->assertSame(
            $inWorkshopSum + $waitingPickupCount,
            $response->json('data.store_live_financials.open_orders_count')
        );

        // Kiểm tra 5 tabs ngoại lệ trong actionable_tasks
        $this->assertCount(1, $response->json('data.actionable_tasks.overdue'));
        $this->assertCount(2, $response->json('data.actionable_tasks.waiting_parts'));
        $this->assertCount(1, $response->json('data.actionable_tasks.waiting_pickup'));

        // Kiểm tra đối soát phân trang date_filter=all giữa /api/v1/orders (page=1&per_page=2 vs page=2&per_page=2) và /api/v1/kpi/dashboard
        $ordersAllP1 = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/orders?date_filter=all&page=1&per_page=2');
        $ordersAllP2 = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/orders?date_filter=all&page=2&per_page=2');

        $ordersAllP1->assertStatus(200);
        $ordersAllP2->assertStatus(200);
        $this->assertCount(2, $ordersAllP1->json('data.data'));
        $this->assertCount(2, $ordersAllP2->json('data.data'));
        $this->assertEquals($ordersAllP1->json('meta.summary'), $ordersAllP2->json('meta.summary'));

        // Khớp tuyệt đối với Vùng 2 & Vùng 3 trên /api/v1/kpi/dashboard
        $summary = $ordersAllP1->json('meta.summary');
        $this->assertSame($response->json('data.store_live_financials.open_orders_count'), $summary['status_cards']['open']['count']);
        $this->assertSame($response->json('data.store_live_financials.in_workshop_count'), $summary['status_cards']['in_workshop']['count']);
        $this->assertSame($response->json('data.store_live_financials.waiting_pickup_count'), $summary['status_cards']['waiting_pickup']['count']);
        $this->assertEquals((float) $response->json('data.store_live_financials.waiting_pickup_total_amount'), (float) $summary['status_cards']['waiting_pickup']['total_amount']);
        $this->assertEquals((float) $response->json('data.store_live_financials.waiting_pickup_deposit_amount'), (float) $summary['status_cards']['waiting_pickup']['deposit_amount']);
        $this->assertEquals((float) $response->json('data.store_live_financials.waiting_pickup_uncollected_amount'), (float) $summary['status_cards']['waiting_pickup']['uncollected_amount']);

        $this->assertSame($steps['inspecting'], $summary['workshop_steps']['inspecting']);
        $this->assertSame($steps['waiting_approval'], $summary['workshop_steps']['waiting_approval']);
        $this->assertSame($steps['in_repair'], $summary['workshop_steps']['in_repair']);
        $this->assertSame($steps['waiting_parts'], $summary['workshop_steps']['waiting_parts']);
        $this->assertSame($steps['waiting_qc'], $summary['workshop_steps']['waiting_qc']);
        $this->assertSame($steps['ready_for_return'], $summary['workshop_steps']['ready_for_return']);
        $this->assertSame($response->json('data.workshop_pipeline.overdue_count'), $summary['workshop_steps']['overdue']);
    }

    /**
     * Test 2: Đối soát chéo (Cross-Page Reconciliation) giữa Dashboard và Danh sách Đơn sửa chữa
     * + Kiểm tra meta.summary trước phân trang và các trường thanh toán chuẩn hóa.
     */
    public function test_orders_index_reconciles_with_dashboard_and_returns_accurate_meta_summary_before_pagination(): void
    {
        $targetDate = '2026-10-16';

        // Tạo 3 đơn hoàn tất bàn giao trong ngày 2026-10-16 nhưng tiếp nhận ở các ngày khác nhau
        $o1 = $this->createOrder([
            'order_type'     => 'in_store',
            'status'         => 'completed',
            'total_price'    => 400000,
            'handed_over_at' => Carbon::parse('2026-10-16 09:30:00', $this->tz),
            'created_at'     => '2026-10-14 08:00:00',
            'updated_at'     => '2026-10-16 09:30:00',
        ]);
        Payment::create([
            'payment_code'        => 'PAY-O1-' . uniqid(),
            'repair_order_id'     => $o1->id,
            'amount'              => 400000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => Carbon::parse('2026-10-16 09:30:00', $this->tz),
            'received_by_user_id' => $this->adminUser->id,
        ]);

        $o2 = $this->createOrder([
            'order_type'     => 'cod',
            'status'         => 'completed',
            'total_price'    => 600000,
            'handed_over_at' => Carbon::parse('2026-10-16 11:00:00', $this->tz),
            'created_at'     => '2026-10-15 10:00:00',
            'updated_at'     => '2026-10-16 11:00:00',
        ]);
        Payment::create([
            'payment_code'        => 'PAY-O2-CASH-' . uniqid(),
            'repair_order_id'     => $o2->id,
            'amount'              => 200000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => Carbon::parse('2026-10-16 11:00:00', $this->tz),
            'received_by_user_id' => $this->adminUser->id,
        ]);
        Payment::create([
            'payment_code'        => 'PAY-O2-QR-' . uniqid(),
            'repair_order_id'     => $o2->id,
            'amount'              => 400000,
            'payment_method'      => 'vietqr',
            'status'              => 'paid',
            'paid_at'             => Carbon::parse('2026-10-16 11:05:00', $this->tz),
            'received_by_user_id' => $this->adminUser->id,
        ]);

        $this->createOrder([
            'order_type'     => 'warranty',
            'status'         => 'completed',
            'total_price'    => 0,
            'initial_price'  => 0,
            'handed_over_at' => Carbon::parse('2026-10-16 14:00:00', $this->tz),
            'created_at'     => '2026-10-16 08:30:00',
            'updated_at'     => '2026-10-16 14:00:00',
        ]);

        // Tạo thêm 1 đơn đang sửa (in_repair) trong ngày 2026-10-16 (không phải completed)
        $this->createOrder([
            'order_type'  => 'in_store',
            'status'      => 'in_repair',
            'total_price' => 500000,
            'created_at'  => '2026-10-16 15:00:00',
            'updated_at'  => '2026-10-16 15:30:00',
        ]);

        // 1. Gọi Dashboard cho ngày 2026-10-16
        $dashRes = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?period=today&date={$targetDate}");

        $dashRes->assertStatus(200);
        $dashCompletedCount = $dashRes->json('data.period_metrics.completed_count');
        $dashHandoverRevenue = (float) $dashRes->json('data.period_metrics.handover_revenue.total_revenue');

        $this->assertEquals(3, $dashCompletedCount);
        $this->assertEquals(1000000, $dashHandoverRevenue); // 400k + 600k + 0

        // 2. Gọi Orders với date_type=completed_at&date=2026-10-16 và per_page=2 (để kiểm tra meta.summary tính TRƯỚC paginate)
        $ordersRes = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/orders?date_type=completed_at&date={$targetDate}&per_page=2");

        $ordersRes->assertStatus(200);

        // Trang 1 chỉ có 2 dòng, nhưng meta.total và meta.summary phải phản ánh đủ 3 đơn completed!
        $this->assertCount(2, $ordersRes->json('data.data'));
        $this->assertEquals($dashCompletedCount, $ordersRes->json('meta.total'));
        $this->assertEquals(3, $ordersRes->json('meta.summary.order_type_counts.all'));
        $this->assertEquals(1, $ordersRes->json('meta.summary.order_type_counts.in_store'));
        $this->assertEquals(1, $ordersRes->json('meta.summary.order_type_counts.cod'));
        $this->assertEquals(1, $ordersRes->json('meta.summary.order_type_counts.warranty'));
        $this->assertEquals(3, $ordersRes->json('meta.summary.status_cards.completed.count'));
        $this->assertEquals(1000000, (float) $ordersRes->json('meta.summary.status_cards.completed.total_amount'));
        $this->assertEquals(600000, (float) $ordersRes->json('meta.summary.status_cards.completed.cash_amount'));
        $this->assertEquals(400000, (float) $ordersRes->json('meta.summary.status_cards.completed.transfer_amount'));

        // 2b. Gọi trang 2 (page=2, per_page=2) và xác minh meta.summary trên page=2 giống hệt page=1
        $ordersPage2Res = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/orders?date_type=completed_at&date={$targetDate}&per_page=2&page=2");

        $ordersPage2Res->assertStatus(200);
        $this->assertCount(1, $ordersPage2Res->json('data.data'));
        $this->assertEquals(
            $ordersRes->json('meta.summary'),
            $ordersPage2Res->json('meta.summary')
        );

        // 3. Kiểm tra các trường thanh toán chuẩn hóa trên dòng đơn o2 (mixed: 200k cash + 400k vietqr)
        $allOrdersRes = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/orders?date_type=completed_at&date={$targetDate}&per_page=15");

        $o2Row = collect($allOrdersRes->json('data.data'))->firstWhere('id', $o2->id);
        $this->assertNotNull($o2Row);
        $this->assertEquals(600000, (float) $o2Row['normalized_total_price']);
        $this->assertEquals(600000, (float) $o2Row['paid_amount']);
        $this->assertEquals(200000, (float) $o2Row['cash_paid_amount']);
        $this->assertEquals(400000, (float) $o2Row['transfer_paid_amount']);
        $this->assertEquals(0, (float) $o2Row['remaining_amount']);
        $this->assertEquals('mixed', $o2Row['payment_method_summary']);
        $this->assertEquals('Đã thu đủ', $o2Row['payment_status_label']);

        // 4. Kiểm tra lọc theo workshop_step=in_repair
        $wsRes = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/orders?date_filter=all&workshop_step=in_repair');

        $wsRes->assertStatus(200);
        $this->assertEquals(1, $wsRes->json('meta.total'));
        $this->assertEquals(
            $wsRes->json('meta.summary.workshop_steps.in_repair'),
            $wsRes->json('meta.total')
        );
    }
}
