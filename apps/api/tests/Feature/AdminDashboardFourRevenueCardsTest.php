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

class AdminDashboardFourRevenueCardsTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customerVip;
    protected Customer $customerNew;
    protected DeviceModel $devicePro2;
    protected DeviceModel $deviceMax;
    protected User $adminUser;
    protected User $techUser;
    protected string $tz;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tz = config('app.timezone', 'Asia/Ho_Chi_Minh');

        $this->tenant = Tenant::create([
            'code'   => 'tenant_four_cards_' . uniqid(),
            'name'   => 'PodsCare Four Cards Test Tenant',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Quận 10 ' . uniqid(),
            'code'      => 'BR_FC_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Đường 3/2, Quận 10',
            'is_active' => true,
        ]);

        $this->customerVip = Customer::create([
            'tenant_id'    => $this->tenant->id,
            'name'         => 'Trần Minh Quân',
            'phone'        => '0918' . rand(100000, 999999),
            'orders_count' => 4,
        ]);

        $this->customerNew = Customer::create([
            'tenant_id'    => $this->tenant->id,
            'name'         => 'Lê Thị Bích Ngọc',
            'phone'        => '0977' . rand(100000, 999999),
            'orders_count' => 1,
        ]);

        $this->devicePro2 = DeviceModel::create([
            'name'         => 'AirPods Pro 2 (USB-C)',
            'category'     => 'AirPods',
            'model_code'   => 'A3047_' . uniqid(),
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);

        $this->deviceMax = DeviceModel::create([
            'name'         => 'AirPods Max',
            'category'     => 'AirPods',
            'model_code'   => 'A2096_' . uniqid(),
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Four Cards Tester',
            'email'     => 'admin_four_cards_' . uniqid() . '@podscare.vn',
            'phone'     => '0909' . rand(100000, 999999),
            'password'  => Hash::make('Secret123!'),
            'role'      => 'admin',
        ]);

        $this->techUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Tech Four Cards Tester',
            'email'     => 'tech_four_cards_' . uniqid() . '@podscare.vn',
            'phone'     => '0903' . rand(100000, 999999),
            'password'  => Hash::make('Secret123!'),
            'role'      => 'technician',
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
            'customer_id'         => $this->customerVip->id,
            'device_model_id'     => $this->devicePro2->id,
            'order_code'          => "PC{$year}-FC{$randomNum}",
            'issue_description'   => 'Thay pin và vệ sinh lưới loa',
            'status'              => 'inspecting',
            'order_type'          => 'in_store',
            'total_price'         => 500000,
            'initial_price'       => 500000,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $this->adminUser->id,
        ], $attributes));

        if ($createdAt || $updatedAt) {
            if ($createdAt) {
                $order->created_at = $createdAt;
            }
            if ($updatedAt) {
                $order->updated_at = $updatedAt;
            }
            $order->saveQuietly();
        }

        return $order;
    }

    /**
     * Test 1: Kiểm tra đầy đủ 4 ô tài chính hàng đầu (Tổng tháng, Công nợ tháng, Tổng ngày chọn, Công nợ ngày chọn)
     * và định dạng tiền tệ đầy đủ từng đồng (không viết tắt tr ₫).
     */
    public function test_dashboard_returns_four_revenue_and_debt_cards_with_full_vnd_formatting_and_breakdowns(): void
    {
        // Chọn ngày cố định giữa tháng để cả ngày chọn và ngày khác trong tháng đều cùng 1 tháng
        $targetDate = Carbon::create(2026, 10, 15, 12, 0, 0, $this->tz);
        $targetDateStr = $targetDate->toDateString(); // 2026-10-15
        $earlierInMonth = Carbon::create(2026, 10, 5, 14, 0, 0, $this->tz);
        $previousMonthDate = Carbon::create(2026, 9, 20, 10, 0, 0, $this->tz);

        // --- ĐƠN TRONG NGÀY ĐÃ CHỌN (2026-10-15) ---
        // Đơn 1: Completed trong ngày chọn, giá 1.250.000 ₫, đã thu đủ (750.000 tiền mặt + 500.000 chuyển khoản)
        $orderDayPaidFull = $this->createOrder([
            'customer_id'     => $this->customerVip->id,
            'device_model_id' => $this->deviceMax->id,
            'order_code'      => 'PC26-DAY-FULL',
            'status'          => 'completed',
            'total_price'     => 1250000,
            'handed_over_at'  => Carbon::parse($targetDateStr . ' 10:15:00', $this->tz),
        ]);
        Payment::create([
            'payment_code'        => 'PAY_CASH_' . uniqid(),
            'repair_order_id'     => $orderDayPaidFull->id,
            'amount'              => 750000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => Carbon::parse($targetDateStr . ' 10:15:00', $this->tz),
            'received_by_user_id' => $this->adminUser->id,
        ]);
        Payment::create([
            'payment_code'        => 'PAY_BANK_' . uniqid(),
            'repair_order_id'     => $orderDayPaidFull->id,
            'amount'              => 500000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'paid',
            'paid_at'             => Carbon::parse($targetDateStr . ' 10:16:00', $this->tz),
            'received_by_user_id' => $this->adminUser->id,
        ]);

        // Đơn 2: Ready for return trong ngày chọn, giá 600.000 ₫, mới cọc 200.000 ₫ chuyển khoản, còn nợ 400.000 ₫
        $orderDayPartial = $this->createOrder([
            'customer_id'     => $this->customerNew->id,
            'device_model_id' => $this->devicePro2->id,
            'order_code'      => 'PC26-DAY-PARTIAL',
            'status'          => 'ready_for_return',
            'total_price'     => 600000,
            'handed_over_at'  => null,
            'created_at'      => Carbon::parse($targetDateStr . ' 09:30:00', $this->tz),
            'updated_at'      => Carbon::parse($targetDateStr . ' 15:30:00', $this->tz),
        ]);

        Payment::create([
            'payment_code'        => 'PAY_PART_' . uniqid(),
            'repair_order_id'     => $orderDayPartial->id,
            'amount'              => 200000,
            'payment_method'      => 'vietqr',
            'status'              => 'paid',
            'paid_at'             => Carbon::parse($targetDateStr . ' 15:35:00', $this->tz),
            'received_by_user_id' => $this->adminUser->id,
        ]);

        // Đơn 3: Waiting pickup trong ngày chọn, giá 450.000 ₫, chưa thu đồng nào (còn nợ 450.000 ₫)
        $orderDayUnpaid = $this->createOrder([
            'customer_id'     => $this->customerVip->id,
            'device_model_id' => $this->devicePro2->id,
            'order_code'      => 'PC26-DAY-UNPAID',
            'status'          => 'waiting_pickup',
            'total_price'     => 450000,
            'handed_over_at'  => null,
            'created_at'      => Carbon::parse($targetDateStr . ' 11:00:00', $this->tz),
            'updated_at'      => Carbon::parse($targetDateStr . ' 17:00:00', $this->tz),
        ]);

        // --- ĐƠN KHÁC TRONG CÙNG THÁNG 10/2026 (2026-10-05) ---
        // Đơn 4: Ready for return ngày 05/10, giá 1.500.000 ₫, mới cọc 1.000.000 ₫ tiền mặt, còn nợ 500.000 ₫
        $orderMonthEarlier = $this->createOrder([
            'customer_id'     => $this->customerNew->id,
            'device_model_id' => $this->deviceMax->id,
            'order_code'      => 'PC26-MONTH-EARLIER',
            'status'          => 'ready_for_return',
            'total_price'     => 1500000,
            'handed_over_at'  => $earlierInMonth,
            'created_at'      => $earlierInMonth,
            'updated_at'      => $earlierInMonth,
        ]);
        Payment::create([
            'payment_code'        => 'PAY_M_CASH_' . uniqid(),
            'repair_order_id'     => $orderMonthEarlier->id,
            'amount'              => 1000000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => $earlierInMonth,
            'received_by_user_id' => $this->adminUser->id,
        ]);

        // --- ĐƠN ĐANG SỬA TRONG XƯỞNG & ĐƠN THÁNG TRƯỚC (KHÔNG ĐƯỢC TÍNH VÀO 4 Ô) ---
        $this->createOrder([
            'status'      => 'in_repair',
            'total_price' => 900000,
        ]);

        $orderPrevMonth = $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 2000000,
            'handed_over_at' => $previousMonthDate,
        ]);
        $orderPrevMonth->updated_at = $targetDate;
        $orderPrevMonth->saveQuietly();

        // Gọi API với quyền Admin
        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}&date={$targetDateStr}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $data = $response->json('data');
        $summary = $response->json('data.summary');

        // =====================================================================
        // KIỂM TRA Ô 3 & Ô 4: THEO NGÀY ĐÃ CHỌN (2026-10-15)
        // Tổng ngày = 1.250.000 + 600.000 + 450.000 = 2.300.000 ₫ (3 đơn xong: 1 completed + 2 chờ nhận)
        // Thực thu ngày = 1.250.000 + 200.000 + 0 = 1.450.000 ₫
        // Công nợ chưa thu theo ngày = 2.300.000 - 1.450.000 = 850.000 ₫ (2 đơn chờ nhận còn nợ)
        // =====================================================================
        $this->assertEquals(2300000.0, (float) $data['selected_date_total_revenue']);
        $this->assertEquals('2.300.000 ₫', $data['selected_date_total_revenue_formatted']);
        $this->assertEquals('2.300.000 ₫', $data['selected_date_revenue_full_formatted']);
        $this->assertStringNotContainsString('tr', $data['selected_date_total_revenue_formatted']);

        $this->assertEquals(1450000.0, (float) $data['selected_date_collected_amount']);
        $this->assertEquals('1.450.000 ₫', $data['selected_date_collected_amount_formatted']);
        $this->assertEquals(1, $data['selected_date_completed_orders_count']);
        $this->assertEquals($data['selected_date_completed_orders'], $data['selected_date_completed_orders_count']);
        $this->assertEquals(3, $data['selected_date_finished_orders_count']);

        $this->assertEquals(850000.0, (float) $data['selected_date_uncollected_amount']);
        $this->assertEquals('850.000 ₫', $data['selected_date_uncollected_amount_formatted']);
        $this->assertEquals(2, $data['selected_date_uncollected_orders_count']);

        // =====================================================================
        // KIỂM TRA Ô 1 & Ô 2: THEO THÁNG ĐÃ CHỌN (10/2026)
        // Tổng tháng = 2.300.000 (ngày 15/10) + 1.500.000 (ngày 05/10) = 3.800.000 ₫ (4 đơn xong: 1 completed + 3 chờ nhận)
        // Thực thu tháng = 1.450.000 + 1.000.000 = 2.450.000 ₫
        // Công nợ chưa thu ở tháng = 3.800.000 - 2.450.000 = 1.350.000 ₫ (3 đơn chờ nhận còn nợ)
        // =====================================================================
        $this->assertEquals(3800000.0, (float) $data['monthly_total_revenue']);
        $this->assertEquals('3.800.000 ₫', $data['monthly_total_revenue_formatted']);
        $this->assertEquals('3.800.000 ₫', $data['monthly_revenue_full_formatted']);
        $this->assertStringNotContainsString('tr', $data['monthly_total_revenue_formatted']);

        $this->assertEquals(2450000.0, (float) $data['monthly_collected_amount']);
        $this->assertEquals('2.450.000 ₫', $data['monthly_collected_amount_formatted']);
        $this->assertEquals(1, $data['monthly_completed_orders_count']);
        $this->assertEquals(4, $data['monthly_finished_orders_count']);

        $this->assertEquals(1350000.0, (float) $data['monthly_uncollected_amount']);
        $this->assertEquals('1.350.000 ₫', $data['monthly_uncollected_amount_formatted']);
        $this->assertStringNotContainsString('tr', $data['monthly_uncollected_amount_formatted']);
        $this->assertEquals(3, $data['monthly_uncollected_orders_count']);

        // Đồng bộ trong data.summary
        $this->assertEquals(3800000.0, (float) $summary['monthly_total_revenue']);
        $this->assertEquals('3.800.000 ₫', $summary['monthly_total_revenue_formatted']);
        $this->assertEquals(2450000.0, (float) $summary['monthly_collected_amount']);
        $this->assertEquals(1, $summary['monthly_completed_orders_count']);
        $this->assertEquals(1350000.0, (float) $summary['monthly_uncollected_amount']);
        $this->assertEquals(2300000.0, (float) $summary['selected_date_total_revenue']);
        $this->assertEquals(1450000.0, (float) $summary['selected_date_collected_amount']);
        $this->assertEquals(1, $summary['selected_date_completed_orders_count']);
        $this->assertEquals(850000.0, (float) $summary['selected_date_uncollected_amount']);

        // =====================================================================
        // KIỂM TRA DANH SÁCH KHÁCH HÀNG & ĐƠN HÀNG (BREAKDOWN CHO DRILL-DOWN MODAL)
        // =====================================================================
        $this->assertIsArray($data['monthly_orders_breakdown']);
        $this->assertCount(4, $data['monthly_orders_breakdown']);

        $this->assertIsArray($data['selected_date_orders_breakdown']);
        $this->assertCount(3, $data['selected_date_orders_breakdown']);

        $dayBreakdownByCode = collect($data['selected_date_orders_breakdown'])->keyBy('order_code');

        // Kiểm tra chi tiết đơn thu đủ (PC26-DAY-FULL)
        $fullItem = $dayBreakdownByCode->get('PC26-DAY-FULL');
        $this->assertNotNull($fullItem);
        $this->assertEquals('Trần Minh Quân', $fullItem['customer_name']);
        $this->assertEquals($this->customerVip->phone, $fullItem['customer_phone']);
        $this->assertGreaterThanOrEqual(2, $fullItem['customer_orders_count']);
        $this->assertEquals('AirPods Max', $fullItem['device_name']);
        $this->assertEquals('completed', $fullItem['status']);
        $this->assertEquals(1250000.0, (float) $fullItem['total_price']);
        $this->assertEquals('1.250.000 ₫', $fullItem['total_price_formatted']);
        $this->assertEquals(1250000.0, (float) $fullItem['collected_amount']);
        $this->assertEquals('1.250.000 ₫', $fullItem['collected_amount_formatted']);
        $this->assertEquals(750000.0, (float) $fullItem['cash_amount']);
        $this->assertEquals(500000.0, (float) $fullItem['transfer_amount']);
        $this->assertEquals(0.0, (float) $fullItem['uncollected_amount']);
        $this->assertEquals('0 ₫', $fullItem['uncollected_amount_formatted']);

        // Kiểm tra chi tiết đơn thu 1 phần / còn nợ (PC26-DAY-PARTIAL)
        $partialItem = $dayBreakdownByCode->get('PC26-DAY-PARTIAL');
        $this->assertNotNull($partialItem);
        $this->assertEquals('Lê Thị Bích Ngọc', $partialItem['customer_name']);
        $this->assertEquals('AirPods Pro 2 (USB-C)', $partialItem['device_name']);
        $this->assertEquals('ready_for_return', $partialItem['status']);
        $this->assertEquals(600000.0, (float) $partialItem['total_price']);
        $this->assertEquals(200000.0, (float) $partialItem['collected_amount']);
        $this->assertEquals(0.0, (float) $partialItem['cash_amount']);
        $this->assertEquals(200000.0, (float) $partialItem['transfer_amount']);
        $this->assertEquals(400000.0, (float) $partialItem['uncollected_amount']);
        $this->assertEquals('400.000 ₫', $partialItem['uncollected_amount_formatted']);
    }

    /**
     * Test 2: Đơn completed không có dòng Payment (seeded/chuyển trạng thái trực tiếp) hoặc có giảm giá khi checkout
     * luôn được tính 100% vào Thực thu (uncollected_amount = 0), không phát sinh công nợ ảo.
     */
    public function test_completed_orders_without_payments_or_with_checkout_discounts_have_zero_uncollected_debt(): void
    {
        $targetDate = Carbon::create(2026, 10, 14, 12, 0, 0, $this->tz);
        $targetDateStr = $targetDate->toDateString();

        // 1. Đơn completed KHÔNG có bản ghi Payment (giá 500.000 ₫) -> Thực thu = 500.000 ₫ (mặc định tiền mặt), Công nợ = 0 ₫
        $orderSeededCompleted = $this->createOrder([
            'order_code'     => 'PC26-SEED-COMP',
            'status'         => 'completed',
            'total_price'    => 500000,
            'handed_over_at' => Carbon::parse($targetDateStr . ' 09:00:00', $this->tz),
        ]);

        // 2. Đơn completed CÓ giảm giá tại quầy (total_price = 1.000.000 ₫, khách thực trả 900.000 ₫ chuyển khoản)
        // -> Thực thu = 900.000 ₫, total_price hiệu lực = 900.000 ₫, Công nợ = 0 ₫
        $orderDiscountedCompleted = $this->createOrder([
            'order_code'     => 'PC26-DISC-COMP',
            'status'         => 'completed',
            'total_price'    => 1000000,
            'handed_over_at' => Carbon::parse($targetDateStr . ' 11:00:00', $this->tz),
        ]);
        Payment::create([
            'payment_code'        => 'PAY_DISC_' . uniqid(),
            'repair_order_id'     => $orderDiscountedCompleted->id,
            'amount'              => 900000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'paid',
            'paid_at'             => Carbon::parse($targetDateStr . ' 11:05:00', $this->tz),
            'received_by_user_id' => $this->adminUser->id,
        ]);

        // 3. Đơn waiting_pickup (chờ khách nhận, giá 350.000 ₫, chưa thanh toán) -> Thực thu = 0 ₫, Công nợ = 350.000 ₫
        $orderWaitingPickup = $this->createOrder([
            'order_code'     => 'PC26-WAIT-PICK',
            'status'         => 'waiting_pickup',
            'total_price'    => 350000,
            'handed_over_at' => null,
            'created_at'     => Carbon::parse($targetDateStr . ' 10:00:00', $this->tz),
            'updated_at'     => Carbon::parse($targetDateStr . ' 14:00:00', $this->tz),
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}&date={$targetDateStr}");

        $response->assertStatus(200);
        $data = $response->json('data');

        // Kiểm tra số lượng đơn hoàn tất vs đơn chờ khách nhận
        $this->assertEquals(2, $data['selected_date_completed_orders']);
        $this->assertEquals(2, $data['selected_date_completed_orders_count']);
        $this->assertEquals(1, $data['selected_date_uncollected_orders_count']);
        $this->assertEquals(3, $data['selected_date_finished_orders_count']);

        // Thực thu = 500.000 + 900.000 = 1.400.000 ₫
        // Công nợ chưa thu = 350.000 ₫ (chỉ từ đơn waiting_pickup)
        // Tổng = Thực thu + Công nợ = 1.750.000 ₫
        $this->assertEquals(1400000.0, (float) $data['selected_date_collected_amount']);
        $this->assertEquals(350000.0, (float) $data['selected_date_uncollected_amount']);
        $this->assertEquals(1750000.0, (float) $data['selected_date_total_revenue']);

        $breakdownByCode = collect($data['selected_date_orders_breakdown'])->keyBy('order_code');

        $seededItem = $breakdownByCode->get('PC26-SEED-COMP');
        $this->assertNotNull($seededItem);
        $this->assertEquals(500000.0, (float) $seededItem['total_price']);
        $this->assertEquals(500000.0, (float) $seededItem['collected_amount']);
        $this->assertEquals(500000.0, (float) $seededItem['cash_amount']);
        $this->assertEquals(0.0, (float) $seededItem['transfer_amount']);
        $this->assertEquals(0.0, (float) $seededItem['uncollected_amount']);

        $discountedItem = $breakdownByCode->get('PC26-DISC-COMP');
        $this->assertNotNull($discountedItem);
        $this->assertEquals(900000.0, (float) $discountedItem['total_price']);
        $this->assertEquals(900000.0, (float) $discountedItem['collected_amount']);
        $this->assertEquals(0.0, (float) $discountedItem['cash_amount']);
        $this->assertEquals(900000.0, (float) $discountedItem['transfer_amount']);
        $this->assertEquals(0.0, (float) $discountedItem['uncollected_amount']);

        $waitingItem = $breakdownByCode->get('PC26-WAIT-PICK');
        $this->assertNotNull($waitingItem);
        $this->assertEquals(350000.0, (float) $waitingItem['total_price']);
        $this->assertEquals(0.0, (float) $waitingItem['collected_amount']);
        $this->assertEquals(350000.0, (float) $waitingItem['uncollected_amount']);
    }

    /**
     * Test 3: Non-Admin (Technician) không được phép nhìn thấy các trường tài chính mới.
     */
    public function test_non_admin_does_not_receive_four_revenue_card_fields_or_breakdowns(): void
    {
        $this->createOrder([
            'status'         => 'completed',
            'total_price'    => 1200000,
            'handed_over_at' => Carbon::now($this->tz),
        ]);

        $response = $this->actingAs($this->techUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}");

        $response->assertStatus(200);
        $data = $response->json('data');

        $restrictedFields = [
            'monthly_total_revenue',
            'monthly_total_revenue_formatted',
            'monthly_collected_amount',
            'monthly_completed_orders_count',
            'monthly_uncollected_amount',
            'monthly_orders_breakdown',
            'selected_date_total_revenue',
            'selected_date_collected_amount',
            'selected_date_completed_orders_count',
            'selected_date_uncollected_amount',
            'selected_date_orders_breakdown',
        ];

        foreach ($restrictedFields as $field) {
            $this->assertArrayNotHasKey($field, $data);
            $this->assertArrayNotHasKey($field, $data['summary'] ?? []);
        }
    }

    /**
     * Test 4 (Task 2.2): Đơn chờ khách lấy từ ngày hôm trước (PCQUAN1013102608 - kể cả khi created_at bị lệch sang 14/10 01:00)
     * và đơn cũ (FX26-43210 tạo ngày 10/10) được kỹ thuật sửa xong ngày 14/10 KHÔNG bị lọt vào Công nợ chưa thu theo ngày 14/10,
     * nhưng vẫn nằm đầy đủ trong Công nợ chưa thu ở tháng và xuất hiện đúng ở ngày 13/10.
     */
    public function test_previous_day_and_legacy_uncollected_orders_repaired_today_do_not_leak_into_selected_date_breakdown(): void
    {
        $this->assertSame('Asia/Ho_Chi_Minh', config('app.timezone'));
        $this->assertSame('Asia/Ho_Chi_Minh', date_default_timezone_get());

        // 1. Đơn ngày 13/10 (PCQUAN1013102608) bị lệch created_at sang 14/10 01:00:00 do DB_TIMEZONE cũ,
        // và được kỹ thuật sửa xong ngày 14/10 lúc 10:00:00 (waiting_pickup, giá 450.000 ₫)
        $orderPrevDayPc = $this->createOrder([
            'order_code'     => 'PCQUAN1013102608',
            'status'         => 'waiting_pickup',
            'total_price'    => 450000,
            'handed_over_at' => null,
            'created_at'     => Carbon::parse('2026-10-14 01:00:00', $this->tz),
            'updated_at'     => Carbon::parse('2026-10-14 10:00:00', $this->tz),
        ]);

        // 2. Đơn cũ FX26-43210 tạo ngày 10/10/2026, kỹ thuật sửa xong ngày 14/10 lúc 10:00:00 (ready_for_return, giá 600.000 ₫)
        $orderLegacyFx = $this->createOrder([
            'order_code'     => 'FX26-43210',
            'status'         => 'ready_for_return',
            'total_price'    => 600000,
            'handed_over_at' => null,
            'created_at'     => Carbon::parse('2026-10-10 09:00:00', $this->tz),
            'updated_at'     => Carbon::parse('2026-10-14 10:00:00', $this->tz),
        ]);

        // 3. Đơn tiếp nhận đúng ngày 14/10 (PCQUAN1014102623, ready_for_return, giá 350.000 ₫)
        $orderTodayWaiting = $this->createOrder([
            'order_code'     => 'PCQUAN1014102623',
            'status'         => 'ready_for_return',
            'total_price'    => 350000,
            'handed_over_at' => null,
            'created_at'     => Carbon::parse('2026-10-14 09:15:00', $this->tz),
            'updated_at'     => Carbon::parse('2026-10-14 11:30:00', $this->tz),
        ]);

        // 4. Đơn completed bàn giao đúng ngày 14/10 (PCQUAN1014102601, completed, giá 500.000 ₫)
        $orderTodayCompleted = $this->createOrder([
            'order_code'     => 'PCQUAN1014102601',
            'status'         => 'completed',
            'total_price'    => 500000,
            'handed_over_at' => Carbon::parse('2026-10-14 15:00:00', $this->tz),
            'created_at'     => Carbon::parse('2026-10-14 08:30:00', $this->tz),
            'updated_at'     => Carbon::parse('2026-10-14 15:00:00', $this->tz),
        ]);

        // --- KIỂM TRA LỌC NGÀY 2026-10-14 ---
        $resOct14 = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}&date=2026-10-14");

        $resOct14->assertStatus(200);
        $dataOct14 = $resOct14->json('data');

        $oct14Codes = collect($dataOct14['selected_date_orders_breakdown'])->pluck('order_code')->all();

        // Đơn ngày 14/10 (PCQUAN1014102623 và PCQUAN1014102601) PHẢI có mặt
        $this->assertContains('PCQUAN1014102623', $oct14Codes);
        $this->assertContains('PCQUAN1014102601', $oct14Codes);

        // Đơn ngày 13/10 (PCQUAN1013102608) và đơn cũ (FX26-43210) TUYỆT ĐỐI KHÔNG được lọt vào ngày 14/10
        $this->assertNotContains('PCQUAN1013102608', $oct14Codes);
        $this->assertNotContains('FX26-43210', $oct14Codes);

        // Kiểm tra số tiền và số lượng đơn của ngày 14/10: chỉ có 1 đơn completed (500k) và 1 đơn chờ lấy (350k)
        $this->assertEquals(1, $dataOct14['selected_date_completed_orders_count']);
        $this->assertEquals(1, $dataOct14['selected_date_uncollected_orders_count']);
        $this->assertEquals(350000.0, (float) $dataOct14['selected_date_uncollected_amount']);
        $this->assertEquals(500000.0, (float) $dataOct14['selected_date_collected_amount']);
        $this->assertEquals(850000.0, (float) $dataOct14['selected_date_total_revenue']);

        // Nhưng trong THÁNG 10/2026 (monthly_orders_breakdown & monthly_uncollected_amount), cả 3 đơn chờ lấy đều phải được tính đủ!
        $monthlyCodes = collect($dataOct14['monthly_orders_breakdown'])->pluck('order_code')->all();
        $this->assertContains('PCQUAN1013102608', $monthlyCodes);
        $this->assertContains('FX26-43210', $monthlyCodes);
        $this->assertContains('PCQUAN1014102623', $monthlyCodes);
        $this->assertContains('PCQUAN1014102601', $monthlyCodes);
        $this->assertEquals(3, $dataOct14['monthly_uncollected_orders_count']);
        // 450.000 + 600.000 + 350.000 = 1.400.000 ₫
        $this->assertEquals(1400000.0, (float) $dataOct14['monthly_uncollected_amount']);

        // --- KIỂM TRA LỌC NGÀY 2026-10-13 ---
        $resOct13 = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}&date=2026-10-13");

        $resOct13->assertStatus(200);
        $dataOct13 = $resOct13->json('data');

        $oct13Codes = collect($dataOct13['selected_date_orders_breakdown'])->pluck('order_code')->all();
        $this->assertContains('PCQUAN1013102608', $oct13Codes);
        $this->assertNotContains('PCQUAN1014102623', $oct13Codes);
        $this->assertNotContains('FX26-43210', $oct13Codes);
        $this->assertEquals(1, $dataOct13['selected_date_uncollected_orders_count']);
        $this->assertEquals(450000.0, (float) $dataOct13['selected_date_uncollected_amount']);
    }
}
