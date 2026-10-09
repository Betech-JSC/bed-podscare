<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RevenueReconciliationAndWarrantyHistoryTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $adminUser;
    protected User $techUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_test_' . uniqid(),
            'name'   => 'PodsCare Store Test Suite',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Q1',
            'code'      => 'Q1_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Lê Lợi',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Nguyễn Văn Khách',
            'phone'     => '0988776655',
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
            'name'      => 'Admin Test User',
            'email'     => 'admin_' . uniqid() . '@podscare.vn',
            'phone'     => '0909' . rand(100000, 999999),
            'password'  => Hash::make('Secret123!'),
            'role'      => 'admin',
        ]);

        $this->techUser = User::create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Kỹ Thuật Viên Tuấn',
            'email'     => 'tech_' . uniqid() . '@podscare.vn',
            'phone'     => '0912' . rand(100000, 999999),
            'password'  => Hash::make('Secret123!'),
            'role'      => 'technician',
        ]);
    }

    /**
     * Test 1: KPI Dashboard trả về daily_revenue và reconciliation đầy đủ chính xác.
     */
    public function test_kpi_dashboard_returns_daily_revenue_and_reconciliation_structure(): void
    {
        $now = Carbon::now();

        // 1. Đơn hoàn tất hôm nay tại quầy (Store POS)
        RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'RO-POS-' . uniqid(),
            'issue_description'  => 'Thay pin tai nghe',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 350000,
            'handed_over_at'     => $now,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        // 2. Đơn hoàn tất hôm nay dạng COD
        RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'RO-COD-' . uniqid(),
            'issue_description'  => 'Thay loa và vệ sinh',
            'status'             => 'completed',
            'order_type'         => 'cod',
            'total_price'        => 450000,
            'handed_over_at'     => $now,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        // 3. Đơn đã sửa xong chờ lấy
        RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'RO-RDY-' . uniqid(),
            'issue_description'  => 'Sửa mic đàm thoại',
            'status'             => 'ready_for_return',
            'order_type'         => 'in_store',
            'total_price'        => 500000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        // 4. Đơn đang sửa trong xưởng
        RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'RO-REP-' . uniqid(),
            'issue_description'  => 'Lỗi IC nguồn dock sạc',
            'status'             => 'in_repair',
            'order_type'         => 'in_store',
            'total_price'        => 600000,
            'initial_price'      => 600000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/kpi/dashboard?branch_id=' . $this->branch->id);

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'success',
            'data' => [
                'daily_revenue',
                'daily_revenue_formatted',
                'monthly_revenue',
                'monthly_revenue_formatted',
                'reconciliation' => [
                    'handed_over_count',
                    'handed_over_revenue',
                    'handed_over_revenue_formatted',
                    'ready_for_pickup_count',
                    'ready_for_pickup_amount',
                    'ready_for_pickup_amount_formatted',
                    'in_workshop_count',
                    'in_workshop_amount',
                    'in_workshop_amount_formatted',
                ],
            ],
        ]);

        $data = $response->json('data');

        // daily_revenue phải tính cho cả đơn in_store và COD hoàn tất hôm nay
        $this->assertGreaterThanOrEqual(800000, $data['daily_revenue']);

        // Reconciliation checks
        $this->assertGreaterThanOrEqual(2, $data['reconciliation']['handed_over_count']);
        $this->assertGreaterThanOrEqual(800000, $data['reconciliation']['handed_over_revenue']);
        $this->assertGreaterThanOrEqual(1, $data['reconciliation']['ready_for_pickup_count']);
        $this->assertGreaterThanOrEqual(500000, $data['reconciliation']['ready_for_pickup_amount']);
        $this->assertGreaterThanOrEqual(1, $data['reconciliation']['in_workshop_count']);
        $this->assertGreaterThanOrEqual(600000, $data['reconciliation']['in_workshop_amount']);
    }

    /**
     * Test 2: Tra cứu danh sách bảo hành theo Số điện thoại khách hàng và Serial.
     */
    public function test_warranty_index_filters_by_customer_phone_and_serial(): void
    {
        $uniquePhone1 = '0988' . rand(100000, 999999);
        $uniquePhone2 = '0977' . rand(100000, 999999);
        $uniqueSerial1 = 'SERIAL_AAA_' . uniqid();
        $uniqueSerial2 = 'SERIAL_BBB_' . uniqid();

        $cust1 = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Một',
            'phone'     => $uniquePhone1,
        ]);

        $cust2 = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Hai',
            'phone'     => $uniquePhone2,
        ]);

        $order1 = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $cust1->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'RO-WR1-' . uniqid(),
            'serial_number'      => $uniqueSerial1,
            'issue_description'  => 'Thay pin bên trái',
            'status'             => 'completed',
            'total_price'        => 300000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $order2 = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $cust2->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'RO-WR2-' . uniqid(),
            'serial_number'      => $uniqueSerial2,
            'issue_description'  => 'Thay loa bên phải',
            'status'             => 'completed',
            'total_price'        => 400000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $wr1 = Warranty::create([
            'warranty_code'   => 'WR-CODE-1-' . uniqid(),
            'repair_order_id' => $order1->id,
            'customer_id'     => $cust1->id,
            'device_model_id' => $this->device->id,
            'coverage_item'   => 'Pin AirPods Pro',
            'start_date'      => Carbon::now()->toDateString(),
            'duration_days'   => 90,
            'end_date'        => Carbon::now()->addDays(90)->toDateString(),
            'status'          => 'active',
        ]);

        $wr2 = Warranty::create([
            'warranty_code'   => 'WR-CODE-2-' . uniqid(),
            'repair_order_id' => $order2->id,
            'customer_id'     => $cust2->id,
            'device_model_id' => $this->device->id,
            'coverage_item'   => 'Loa AirPods Pro',
            'start_date'      => Carbon::now()->toDateString(),
            'duration_days'   => 60,
            'end_date'        => Carbon::now()->addDays(60)->toDateString(),
            'status'          => 'active',
        ]);

        // Lọc qua tham số phone
        $resPhone = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/warranties?phone={$uniquePhone1}");

        $resPhone->assertStatus(200);
        $resPhone->assertJsonFragment(['warranty_code' => $wr1->warranty_code]);
        $resPhone->assertJsonMissing(['warranty_code' => $wr2->warranty_code]);

        // Lọc qua tham số search q với Serial
        $resSerial = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/warranties?q={$uniqueSerial2}");

        $resSerial->assertStatus(200);
        $resSerial->assertJsonFragment(['warranty_code' => $wr2->warranty_code]);
        $resSerial->assertJsonMissing(['warranty_code' => $wr1->warranty_code]);
    }

    /**
     * Test 3: API lịch sử bệnh án thiết bị trả về đầy đủ chi tiết kỹ thuật.
     */
    public function test_warranty_history_returns_full_technical_medical_profile(): void
    {
        $uniquePhone = '0933' . rand(100000, 999999);
        $uniqueSerial = 'SERIAL_MED_' . uniqid();

        $cust = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Trần Bệnh Án',
            'phone'     => $uniquePhone,
        ]);

        $order = RepairOrder::create([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branch->id,
            'customer_id'         => $cust->id,
            'device_model_id'     => $this->device->id,
            'order_code'          => 'RO-MED-01',
            'serial_number'       => $uniqueSerial,
            'status'              => 'completed',
            'total_price'         => 850000,
            'initial_price'       => 700000,
            'issue_description'   => 'Tai phải bị rè khi bật chống ồn ANC',
            'appearance_notes'    => 'Trầy xước nhẹ nắp hộp, 2 tai còn đẹp',
            'repair_note'         => 'Đã thay màng loa tai phải chính hãng và căn chỉnh mic',
            'parts_used_summary'  => 'Màng loa AirPods Pro R',
            'additional_services' => [
                ['name' => 'Vệ sinh khử khuẩn tai nghe tia UV', 'price' => 150000],
            ],
            'technician_id'       => $this->techUser->id,
            'qc_passed_at'        => Carbon::now(),
            'handed_over_at'      => Carbon::now(),
            'created_by_user_id'  => $this->adminUser->id,
        ]);

        QcInspection::create([
            'repair_order_id' => $order->id,
            'inspector_id'    => $this->adminUser->id,
            'result'          => 'pass',
            'notes'           => 'Đã test âm thanh 2 bên cân bằng, mic rõ, ANC êm ái.',
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/warranties/history?phone={$uniquePhone}");

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'success',
            'data' => [
                'customer' => ['id', 'name', 'phone'],
                'total_repairs',
                'orders' => [
                    '*' => [
                        'id',
                        'order_code',
                        'status',
                        'serial_number',
                        'issue_description',
                        'appearance_notes',
                        'repair_note',
                        'technician_name',
                        'parts_used_summary',
                        'additional_services',
                        'qc_result' => ['result', 'notes', 'passed'],
                        'total_price',
                        'total_price_formatted',
                    ],
                ],
            ],
        ]);

        $orderData = $response->json('data.orders.0');
        $this->assertEquals('RO-MED-01', $orderData['order_code']);
        $this->assertEquals('Tai phải bị rè khi bật chống ồn ANC', $orderData['issue_description']);
        $this->assertEquals('Trầy xước nhẹ nắp hộp, 2 tai còn đẹp', $orderData['appearance_notes']);
        $this->assertEquals('Kỹ Thuật Viên Tuấn', $orderData['technician_name']);
        $this->assertEquals('Màng loa AirPods Pro R', $orderData['parts_used_summary']);
        $this->assertCount(1, $orderData['additional_services']);
        $this->assertTrue($orderData['qc_result']['passed']);
    }
}
