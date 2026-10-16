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
     * Test 4: Kiểm chứng quy tắc lọc đơn chờ khách nhận theo NGÀY SỬA XONG (qc_passed_at / repair_completed_at)
     * và đồng bộ số lượng đơn chờ nhận (kể cả đơn bảo hành 0đ) với thẻ Chờ khách nhận:
     * - Đơn nhận ngày 13/10 (PCQUAN1013102608) nhưng sửa xong ngày 14/10 (qc_passed_at = 2026-10-14 13:16:47)
     *   ĐƯỢC tính vào selected_date_orders_breakdown và selected_date_uncollected_amount của ngày 2026-10-14.
     * - Đơn đã sửa xong từ các ngày trước (FX26-43210 sửa xong 12/10, PCQUAN1013102630 sửa xong 13/10)
     *   nhưng hôm nay 14/10 bị chạm vào (updated_at = 2026-10-14 15:56:36) KHÔNG bị lọt vào ngày 2026-10-14,
     *   mà nằm đúng ở ngày sửa xong của nó (2026-10-12 / 2026-10-13) và trong tổng tháng.
     * - Đơn waiting_pickup / ready_for_return có giá 0đ (bảo hành) vẫn được đếm trong monthly_uncollected_orders_count
     *   để khớp 100% với thẻ Chờ khách nhận (ready_for_pickup_count).
     */
    public function test_uncollected_orders_filter_by_repair_completion_date_and_match_ready_for_pickup_count_including_zero_price_warranty(): void
    {
        $this->assertSame('Asia/Ho_Chi_Minh', config('app.timezone'));
        $this->assertSame('Asia/Ho_Chi_Minh', date_default_timezone_get());

        // 1. Đơn nhận ngày 13/10 (PCQUAN1013102608) nhưng vừa sửa xong ngày 14/10 (qc_passed_at = 2026-10-14 13:16:47, giá 500.000 ₫)
        // -> PHẢI được tính vào Công nợ chưa thu theo ngày 14/10!
        $this->createOrder([
            'order_code'          => 'PCQUAN1013102608',
            'status'              => 'waiting_pickup',
            'total_price'         => 500000,
            'handed_over_at'      => null,
            'repair_completed_at' => Carbon::parse('2026-10-14 12:30:00', $this->tz),
            'qc_passed_at'        => Carbon::parse('2026-10-14 13:16:47', $this->tz),
            'created_at'          => Carbon::parse('2026-10-13 10:00:00', $this->tz),
            'updated_at'          => Carbon::parse('2026-10-14 15:24:31', $this->tz),
        ]);

        // 2. Đơn cũ FX26-43210 tạo ngày 10/10, sửa xong ngày 12/10 (qc_passed_at = 2026-10-12 13:50:11),
        // nhưng ngày 14/10 nhân viên bấm báo khách khiến updated_at = 2026-10-14 15:56:36 (ready_for_return, giá 600.000 ₫)
        // -> KHÔNG ĐƯỢC lọt vào ngày 14/10, phải nằm ở ngày 12/10!
        $this->createOrder([
            'order_code'          => 'FX26-43210',
            'status'              => 'ready_for_return',
            'total_price'         => 600000,
            'handed_over_at'      => null,
            'repair_completed_at' => Carbon::parse('2026-10-12 11:20:00', $this->tz),
            'qc_passed_at'        => Carbon::parse('2026-10-12 13:50:11', $this->tz),
            'created_at'          => Carbon::parse('2026-10-10 09:00:00', $this->tz),
            'updated_at'          => Carbon::parse('2026-10-14 15:56:36', $this->tz),
        ]);

        // 3. Đơn nhận và sửa xong ngày 13/10 (PCQUAN1013102630, qc_passed_at = 2026-10-13 18:13:38),
        // ngày 14/10 bị cập nhật updated_at = 2026-10-14 11:02:11 (waiting_pickup, giá 450.000 ₫)
        // -> KHÔNG ĐƯỢC lọt vào ngày 14/10, phải nằm ở ngày 13/10!
        $this->createOrder([
            'order_code'          => 'PCQUAN1013102630',
            'status'              => 'waiting_pickup',
            'total_price'         => 450000,
            'handed_over_at'      => null,
            'repair_completed_at' => Carbon::parse('2026-10-13 17:45:00', $this->tz),
            'qc_passed_at'        => Carbon::parse('2026-10-13 18:13:38', $this->tz),
            'created_at'          => Carbon::parse('2026-10-13 15:30:00', $this->tz),
            'updated_at'          => Carbon::parse('2026-10-14 11:02:11', $this->tz),
        ]);

        // 4. Đơn tiếp nhận và sửa xong ngày 14/10 (PCQUAN1014102623, ready_for_return, giá 350.000 ₫)
        $this->createOrder([
            'order_code'          => 'PCQUAN1014102623',
            'status'              => 'ready_for_return',
            'total_price'         => 350000,
            'handed_over_at'      => null,
            'repair_completed_at' => Carbon::parse('2026-10-14 11:00:00', $this->tz),
            'qc_passed_at'        => Carbon::parse('2026-10-14 11:30:00', $this->tz),
            'created_at'          => Carbon::parse('2026-10-14 09:15:00', $this->tz),
            'updated_at'          => Carbon::parse('2026-10-14 11:30:00', $this->tz),
        ]);

        // 5. Đơn bảo hành 0đ chờ khách nhận sửa xong ngày 14/10 (PCQUAN1014102699, waiting_pickup, giá 0 ₫)
        // -> Phải được đếm trong uncollected_orders_count để tổng số đơn khớp 100% với ready_for_pickup_count!
        $this->createOrder([
            'order_code'          => 'PCQUAN1014102699',
            'status'              => 'waiting_pickup',
            'order_type'          => 'warranty',
            'total_price'         => 0,
            'initial_price'       => 0,
            'handed_over_at'      => null,
            'repair_completed_at' => Carbon::parse('2026-10-14 14:00:00', $this->tz),
            'qc_passed_at'        => Carbon::parse('2026-10-14 14:20:00', $this->tz),
            'created_at'          => Carbon::parse('2026-10-14 10:00:00', $this->tz),
            'updated_at'          => Carbon::parse('2026-10-14 14:20:00', $this->tz),
        ]);

        // 6. Đơn completed bàn giao đúng ngày 14/10 (PCQUAN1014102601, completed, giá 700.000 ₫)
        $this->createOrder([
            'order_code'     => 'PCQUAN1014102601',
            'status'         => 'completed',
            'total_price'    => 700000,
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

        // Đơn sửa xong ngày 14/10 (PCQUAN1013102608 nhận 13/10 sửa xong 14/10, PCQUAN1014102623, PCQUAN1014102699) và đơn bàn giao 14/10 (PCQUAN1014102601) PHẢI có mặt
        $this->assertContains('PCQUAN1013102608', $oct14Codes);
        $this->assertContains('PCQUAN1014102623', $oct14Codes);
        $this->assertContains('PCQUAN1014102699', $oct14Codes);
        $this->assertContains('PCQUAN1014102601', $oct14Codes);

        // Đơn sửa xong từ ngày 12/10 (FX26-43210) và ngày 13/10 (PCQUAN1013102630) dù updated_at = 14/10 TUYỆT ĐỐI KHÔNG được lọt vào ngày 14/10
        $this->assertNotContains('FX26-43210', $oct14Codes);
        $this->assertNotContains('PCQUAN1013102630', $oct14Codes);

        // Kiểm tra số tiền và số lượng đơn của ngày 14/10:
        // - 1 đơn completed (700k)
        // - 3 đơn chờ nhận sửa xong hôm nay (500k + 350k + 0đ = 850k)
        $this->assertEquals(1, $dataOct14['selected_date_completed_orders_count']);
        $this->assertEquals(3, $dataOct14['selected_date_uncollected_orders_count']);
        $this->assertEquals(4, $dataOct14['selected_date_finished_orders_count']);
        $this->assertEquals(850000.0, (float) $dataOct14['selected_date_uncollected_amount']);
        $this->assertEquals(700000.0, (float) $dataOct14['selected_date_collected_amount']);
        $this->assertEquals(1550000.0, (float) $dataOct14['selected_date_total_revenue']);

        // Trong THÁNG 10/2026:
        // - Cả 5 đơn chờ nhận (kể cả đơn 0đ bảo hành) đều phải nằm trong monthly_uncollected_orders_count
        //   và khớp 100% với ready_for_pickup_count (5 đơn) & waiting_pickup_orders (5 đơn)
        $monthlyCodes = collect($dataOct14['monthly_orders_breakdown'])->pluck('order_code')->all();
        $this->assertContains('PCQUAN1013102608', $monthlyCodes);
        $this->assertContains('FX26-43210', $monthlyCodes);
        $this->assertContains('PCQUAN1013102630', $monthlyCodes);
        $this->assertContains('PCQUAN1014102623', $monthlyCodes);
        $this->assertContains('PCQUAN1014102699', $monthlyCodes);
        $this->assertContains('PCQUAN1014102601', $monthlyCodes);

        $this->assertEquals(5, $dataOct14['monthly_uncollected_orders_count']);
        $this->assertEquals(5, $dataOct14['reconciliation']['ready_for_pickup_count']);
        $this->assertEquals(5, $dataOct14['operational_summary']['waiting_pickup_orders']);
        $this->assertEquals(
            $dataOct14['monthly_completed_orders_count'] + $dataOct14['monthly_uncollected_orders_count'],
            $dataOct14['monthly_finished_orders_count']
        );
        // 500.000 + 600.000 + 450.000 + 350.000 + 0 = 1.900.000 ₫
        $this->assertEquals(1900000.0, (float) $dataOct14['monthly_uncollected_amount']);

        // --- KIỂM TRA LỌC NGÀY 2026-10-13 (chỉ có PCQUAN1013102630 sửa xong ngày 13/10) ---
        $resOct13 = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}&date=2026-10-13");

        $resOct13->assertStatus(200);
        $dataOct13 = $resOct13->json('data');

        $oct13Codes = collect($dataOct13['selected_date_orders_breakdown'])->pluck('order_code')->all();
        $this->assertContains('PCQUAN1013102630', $oct13Codes);
        $this->assertNotContains('PCQUAN1013102608', $oct13Codes);
        $this->assertNotContains('FX26-43210', $oct13Codes);
        $this->assertEquals(1, $dataOct13['selected_date_uncollected_orders_count']);
        $this->assertEquals(450000.0, (float) $dataOct13['selected_date_uncollected_amount']);

        // --- KIỂM TRA LỌC NGÀY 2026-10-12 (chỉ có FX26-43210 sửa xong ngày 12/10) ---
        $resOct12 = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}&date=2026-10-12");

        $resOct12->assertStatus(200);
        $dataOct12 = $resOct12->json('data');

        $oct12Codes = collect($dataOct12['selected_date_orders_breakdown'])->pluck('order_code')->all();
        $this->assertContains('FX26-43210', $oct12Codes);
        $this->assertEquals(1, $dataOct12['selected_date_uncollected_orders_count']);
        $this->assertEquals(600000.0, (float) $dataOct12['selected_date_uncollected_amount']);
    }

    /**
     * Test 5: RepairOrder::normalizeVndAmount và addAdditionalService khử triệt để giá mồi 1đ và số lẻ ...001đ / ...999đ.
     */
    public function test_normalize_vnd_amount_and_additional_service_eliminates_1_vnd_placeholder_and_001_remainder(): void
    {
        $this->assertSame(0.0, RepairOrder::normalizeVndAmount(0));
        $this->assertSame(0.0, RepairOrder::normalizeVndAmount(1));
        $this->assertSame(0.0, RepairOrder::normalizeVndAmount(0.5));
        $this->assertSame(350000.0, RepairOrder::normalizeVndAmount(350001));
        $this->assertSame(450000.0, RepairOrder::normalizeVndAmount(449999));
        $this->assertSame(500000.0, RepairOrder::normalizeVndAmount(500001));
        $this->assertSame(500000.0, RepairOrder::normalizeVndAmount(499999));
        $this->assertSame(500000.0, RepairOrder::normalizeVndAmount(500000));

        // Đơn có initial_price = 1đ, khi cộng dịch vụ 500.000đ phải ra đúng 500.000đ (không phải 500.001đ)
        $order = $this->createOrder([
            'order_code'    => 'PC26-NORM-01',
            'status'        => 'in_repair',
            'initial_price' => 1,
            'total_price'   => 1,
        ]);

        $order->addAdditionalService([
            'name'  => 'Thay pin AirPods Pro 2',
            'price' => 500000,
        ], $this->adminUser);

        $order->refresh();
        $this->assertEquals(0.0, (float) $order->initial_price);
        $this->assertEquals(500000.0, (float) $order->total_price);
    }

    /**
     * Test 6: overdue_orders loại trừ ready_for_return / waiting_pickup và khớp 1-1 với bộ lọc OrderController::index
     * (open, in_workshop, waiting_pickup, waiting_parts, overdue).
     */
    public function test_overdue_orders_excludes_ready_for_return_and_waiting_pickup_and_matches_orders_index_filters(): void
    {
        $now = Carbon::now($this->tz);

        // 2 đơn đang sửa trong xưởng quá 24h (overdue + in_workshop + open)
        $overdue1 = $this->createOrder([
            'order_code' => 'PC26-OVD-01',
            'status'     => 'in_repair',
            'created_at' => $now->copy()->subHours(30),
            'updated_at' => $now->copy()->subHours(10),
        ]);
        $overdue2 = $this->createOrder([
            'order_code' => 'PC26-OVD-02',
            'status'     => 'inspecting',
            'created_at' => $now->copy()->subHours(36),
            'updated_at' => $now->copy()->subHours(12),
        ]);

        // 2 đơn chờ linh kiện vừa tạo < 24h (waiting_parts + in_workshop + open, không overdue)
        $waitingPart1 = $this->createOrder([
            'order_code' => 'PC26-WP-01',
            'status'     => 'waiting_parts',
            'created_at' => $now->copy()->subHours(5),
            'updated_at' => $now->copy()->subHours(2),
        ]);
        $waitingPart2 = $this->createOrder([
            'order_code'           => 'PC26-WP-02',
            'status'               => 'in_repair',
            'special_parts_status' => 'pending',
            'created_at'           => $now->copy()->subHours(4),
            'updated_at'           => $now->copy()->subHours(1),
        ]);

        // 2 đơn đã sửa xong chờ khách nhận tạo từ 48h trước (waiting_pickup + open, KHÔNG thuộc in_workshop, KHÔNG thuộc overdue)
        $pickup1 = $this->createOrder([
            'order_code' => 'PC26-PK-01',
            'status'     => 'ready_for_return',
            'created_at' => $now->copy()->subHours(48),
            'updated_at' => $now->copy()->subHours(3),
        ]);
        $pickup2 = $this->createOrder([
            'order_code' => 'PC26-PK-02',
            'status'     => 'waiting_pickup',
            'created_at' => $now->copy()->subHours(50),
            'updated_at' => $now->copy()->subHours(2),
        ]);

        // 1 đơn đã hoàn tất từ 72h trước (không thuộc open)
        $this->createOrder([
            'order_code' => 'PC26-DONE-01',
            'status'     => 'completed',
            'created_at' => $now->copy()->subHours(72),
            'updated_at' => $now->copy()->subHours(24),
        ]);

        // 1 đơn từ chối sửa (rejected) và 1 đơn đã hủy (cancelled) - KHÔNG thuộc active_orders hay in_workshop
        $this->createOrder([
            'order_code' => 'PC26-REJ-01',
            'status'     => 'rejected',
            'created_at' => $now->copy()->subHours(40),
            'updated_at' => $now->copy()->subHours(10),
        ]);
        $this->createOrder([
            'order_code' => 'PC26-CAN-01',
            'status'     => 'cancelled',
            'created_at' => $now->copy()->subHours(40),
            'updated_at' => $now->copy()->subHours(10),
        ]);

        // 1. Kiểm tra KPI Dashboard
        $kpiRes = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}");
        $kpiRes->assertOk();
        $kpiData = $kpiRes->json('data');

        $this->assertEquals(6, $kpiData['active_orders']);
        $this->assertEquals(6, $kpiData['summary']['active_orders']);
        $this->assertEquals(6, $kpiData['operational_summary']['active_orders']);
        $this->assertEquals(4, $kpiData['reconciliation']['in_workshop_count']);
        $this->assertEquals(2, $kpiData['reconciliation']['ready_for_pickup_count']);
        $this->assertEquals(
            $kpiData['operational_summary']['active_orders'],
            $kpiData['reconciliation']['in_workshop_count'] + $kpiData['reconciliation']['ready_for_pickup_count']
        );
        $this->assertEquals(2, $kpiData['operational_summary']['waiting_pickup_orders']);
        $this->assertEquals(2, $kpiData['operational_summary']['waiting_parts_orders']);
        $this->assertEquals(2, $kpiData['operational_summary']['overdue_orders']);
        $this->assertCount(2, $kpiData['actionable_tasks']['overdue']);
        $this->assertEquals(2, $kpiData['actionable_tasks']['counts']['overdue']);
        $this->assertEquals(2, $kpiData['actionable_tasks']['counts']['waiting_pickup']);
        $this->assertEquals(0, $kpiData['actionable_tasks']['counts']['waiting_qc']);
        $this->assertEquals(4, $kpiData['actionable_tasks']['counts']['total']);

        // 2. Kiểm tra OrderController::index với các bộ lọc tổ hợp khớp 1-1
        $openRes = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/orders?branch_id={$this->branch->id}&status=open&date_filter=all&per_page=100");
        $openRes->assertOk();
        $this->assertCount(6, $openRes->json('data.data'));

        $workshopRes = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/orders?branch_id={$this->branch->id}&status=in_workshop&date_filter=all&per_page=100");
        $workshopRes->assertOk();
        $this->assertCount(4, $workshopRes->json('data.data'));

        $pickupRes = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/orders?branch_id={$this->branch->id}&status=waiting_pickup&date_filter=all&per_page=100");
        $pickupRes->assertOk();
        $this->assertCount(2, $pickupRes->json('data.data'));

        $partsRes = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/orders?branch_id={$this->branch->id}&status=waiting_parts&date_filter=all&per_page=100");
        $partsRes->assertOk();
        $this->assertCount(2, $partsRes->json('data.data'));

        $overdueRes = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/orders?branch_id={$this->branch->id}&filter=overdue&date_filter=all&per_page=100");
        $overdueRes->assertOk();
        $overdueCodes = collect($overdueRes->json('data.data'))->pluck('order_code')->all();
        $this->assertCount(2, $overdueCodes);
        $this->assertContains($overdue1->order_code, $overdueCodes);
        $this->assertContains($overdue2->order_code, $overdueCodes);
        $this->assertNotContains($pickup1->order_code, $overdueCodes);
        $this->assertNotContains($pickup2->order_code, $overdueCodes);
    }

    /**
     * Test 7: Command orders:normalize-codes-and-prices đổi sạch mã FX... sang PC{branch_code}{DDMMYY}{STT}
     * và khử sạch giá 1đ / ...001đ / ...999đ.
     */
    public function test_normalize_order_codes_and_prices_command_cleans_1_vnd_and_converts_fx_codes_to_pc(): void
    {
        $fxOrder1 = $this->createOrder([
            'order_code'          => 'FX26-TEST01',
            'status'              => 'waiting_pickup',
            'initial_price'       => 1,
            'total_price'         => 350001,
            'additional_services' => [
                [
                    'id'    => 'srv_test_1',
                    'name'  => 'Vệ sinh màng loa',
                    'price' => 350000,
                ],
            ],
            'created_at'          => Carbon::parse('2026-10-12 09:00:00', $this->tz),
            'updated_at'          => Carbon::parse('2026-10-12 10:00:00', $this->tz),
        ]);

        $fxOrder2 = $this->createOrder([
            'order_code'    => 'FX26-TEST02',
            'status'        => 'inspecting',
            'initial_price' => 1,
            'total_price'   => 1,
            'created_at'    => Carbon::parse('2026-10-12 09:30:00', $this->tz),
            'updated_at'    => Carbon::parse('2026-10-12 09:30:00', $this->tz),
        ]);

        $fxOrder3 = $this->createOrder([
            'order_code'          => 'FX26-TEST03',
            'status'              => 'completed',
            'initial_price'       => 0,
            'total_price'         => 449999,
            'additional_services' => [
                [
                    'id'    => 'srv_test_999',
                    'name'  => 'Thay pin AirPods Pro 2',
                    'price' => 449999,
                ],
            ],
            'created_at'          => Carbon::parse('2026-10-12 10:00:00', $this->tz),
            'updated_at'          => Carbon::parse('2026-10-12 11:00:00', $this->tz),
        ]);

        $payment = Payment::create([
            'payment_code'        => 'PAY_FX_TEST_' . uniqid(),
            'repair_order_id'     => $fxOrder1->id,
            'amount'              => 350001,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => Carbon::parse('2026-10-12 11:00:00', $this->tz),
            'received_by_user_id' => $this->adminUser->id,
        ]);

        $payment999 = Payment::create([
            'payment_code'        => 'PAY_FX_999_' . uniqid(),
            'repair_order_id'     => $fxOrder3->id,
            'amount'              => 449999,
            'payment_method'      => 'bank_transfer',
            'status'              => 'paid',
            'paid_at'             => Carbon::parse('2026-10-12 11:15:00', $this->tz),
            'received_by_user_id' => $this->adminUser->id,
        ]);

        $this->artisan('orders:normalize-codes-and-prices')
            ->assertExitCode(0);

        $fxOrder1->refresh();
        $fxOrder2->refresh();
        $fxOrder3->refresh();
        $payment->refresh();
        $payment999->refresh();

        $this->assertStringStartsWith("PC{$this->branch->code}121026", $fxOrder1->order_code);
        $this->assertStringStartsWith("PC{$this->branch->code}121026", $fxOrder2->order_code);
        $this->assertStringStartsWith("PC{$this->branch->code}121026", $fxOrder3->order_code);
        $this->assertNotEquals($fxOrder1->order_code, $fxOrder2->order_code);

        $this->assertEquals(0.0, (float) $fxOrder1->initial_price);
        $this->assertEquals(350000.0, (float) $fxOrder1->total_price);

        $this->assertEquals(0.0, (float) $fxOrder2->initial_price);
        $this->assertEquals(0.0, (float) $fxOrder2->total_price);

        $this->assertEquals(0.0, (float) $fxOrder3->initial_price);
        $this->assertEquals(450000.0, (float) $fxOrder3->total_price);
        $this->assertEquals(450000.0, (float) ($fxOrder3->additional_services[0]['price'] ?? 0));

        $this->assertEquals(350000.0, (float) $payment->amount);
        $this->assertEquals(450000.0, (float) $payment999->amount);
    }

    /**
     * Test 8: actionable_tasks trả về hơn 10 bản ghi (tối đa 200) và đối tượng counts khớp 1-1
     * với operational_summary khi có > 10 đơn trễ hạn và > 10 đơn chờ khách nhận.
     */
    public function test_actionable_tasks_returns_more_than_10_items_and_exact_counts_matching_operational_summary(): void
    {
        $now = Carbon::now($this->tz);

        // Tạo 12 đơn trễ hạn (> 24h) đang sửa trong xưởng
        for ($i = 1; $i <= 12; $i++) {
            $this->createOrder([
                'order_code' => sprintf('PC26-OVD-BULK-%02d', $i),
                'status'     => 'in_repair',
                'created_at' => $now->copy()->subHours(25 + $i),
                'updated_at' => $now->copy()->subHours(2),
            ]);
        }

        // Tạo 3 đơn chờ QC (< 24h, không trễ hạn)
        for ($i = 1; $i <= 3; $i++) {
            $this->createOrder([
                'order_code'          => sprintf('PC26-QC-BULK-%02d', $i),
                'status'              => 'waiting_qc',
                'repair_completed_at' => $now->copy()->subHours(2),
                'created_at'          => $now->copy()->subHours(6),
                'updated_at'          => $now->copy()->subHours(2),
            ]);
        }

        // Tạo 2 đơn chờ duyệt báo giá (< 24h, không trễ hạn)
        for ($i = 1; $i <= 2; $i++) {
            $this->createOrder([
                'order_code' => sprintf('PC26-APP-BULK-%02d', $i),
                'status'     => 'waiting_approval',
                'created_at' => $now->copy()->subHours(4),
                'updated_at' => $now->copy()->subHours(1),
            ]);
        }

        // Tạo 14 đơn chờ khách nhận
        for ($i = 1; $i <= 14; $i++) {
            $this->createOrder([
                'order_code'   => sprintf('PC26-PKP-BULK-%02d', $i),
                'status'       => $i % 2 === 0 ? 'waiting_pickup' : 'ready_for_return',
                'qc_passed_at' => $now->copy()->subHours($i),
                'created_at'   => $now->copy()->subHours(30 + $i),
                'updated_at'   => $now->copy()->subHours($i),
            ]);
        }

        // Tạo 2 đơn bị từ chối sửa (rejected) - không được tính vào active_orders hay in_workshop
        for ($i = 1; $i <= 2; $i++) {
            $this->createOrder([
                'order_code' => sprintf('PC26-REJ-BULK-%02d', $i),
                'status'     => 'rejected',
                'created_at' => $now->copy()->subHours(10),
                'updated_at' => $now->copy()->subHours(5),
            ]);
        }

        $kpiRes = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}");
        $kpiRes->assertOk();
        $kpiData = $kpiRes->json('data');

        // Trong xưởng = 12 (in_repair) + 3 (waiting_qc) + 2 (waiting_approval) = 17
        // Chờ nhận = 14
        // Tổng đơn đang mở = 17 + 14 = 31 (loại trừ 2 đơn rejected)
        $this->assertEquals(17, $kpiData['reconciliation']['in_workshop_count']);
        $this->assertEquals(14, $kpiData['reconciliation']['ready_for_pickup_count']);
        $this->assertEquals(31, $kpiData['active_orders']);
        $this->assertEquals(31, $kpiData['summary']['active_orders']);
        $this->assertEquals(31, $kpiData['operational_summary']['active_orders']);
        $this->assertEquals(12, $kpiData['operational_summary']['overdue_orders']);
        $this->assertEquals(14, $kpiData['operational_summary']['waiting_pickup_orders']);

        // Danh sách trong actionable_tasks trả về đủ > 10 bản ghi (12 overdue, 14 waiting_pickup)
        $this->assertCount(12, $kpiData['actionable_tasks']['overdue']);
        $this->assertCount(14, $kpiData['actionable_tasks']['waiting_pickup']);
        $this->assertCount(3, $kpiData['actionable_tasks']['waiting_qc']);
        $this->assertCount(2, $kpiData['actionable_tasks']['waiting_approval']);

        // Kiểm tra actionable_tasks.counts khớp tuyệt đối
        $counts = $kpiData['actionable_tasks']['counts'];
        $this->assertEquals(12, $counts['overdue']);
        $this->assertEquals(2, $counts['waiting_approval']);
        $this->assertEquals(3, $counts['waiting_qc']);
        $this->assertEquals(14, $counts['waiting_pickup']);
        $this->assertEquals(12 + 3 + 14, $counts['total']);
    }
}
