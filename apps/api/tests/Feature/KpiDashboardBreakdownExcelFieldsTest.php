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

class KpiDashboardBreakdownExcelFieldsTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected User $adminUser;
    protected User $technicianUser;
    protected Customer $customer;
    protected DeviceModel $deviceModel;
    protected string $tz;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tz = 'Asia/Ho_Chi_Minh';

        $this->tenant = Tenant::create([
            'code'   => 'tenant_kpi_excel_' . uniqid(),
            'name'   => 'PodsCare KPI Excel Breakdown Tenant',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Hà Nội Excel Test',
            'code'      => 'BR_EXCEL_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Phố Huế, Hai Bà Trưng, Hà Nội',
            'is_active' => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Excel Tester',
            'email'     => 'admin_excel_' . uniqid() . '@podscare.vn',
            'phone'     => '0908' . random_int(100000, 999999),
            'password'  => Hash::make('Secret123!'),
            'role'      => 'admin',
        ]);

        $this->technicianUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'KTV Nguyễn Văn An',
            'email'     => 'tech_excel_' . uniqid() . '@podscare.vn',
            'phone'     => '0907' . random_int(100000, 999999),
            'password'  => Hash::make('Secret123!'),
            'role'      => 'technician',
        ]);

        $this->customer = Customer::create([
            'tenant_id'     => $this->tenant->id,
            'name'          => 'Trần Minh Khách',
            'phone'         => '0919' . random_int(100000, 999999),
            'email'         => 'minhkhach@example.com',
            'address'       => '45 Nguyễn Trãi, Thanh Xuân, Hà Nội',
            'customer_type' => 'vip',
            'source'        => 'facebook',
            'notes'         => 'Khách quen ưu tiên giao trước 17h',
            'orders_count'  => 3,
        ]);

        $this->deviceModel = DeviceModel::create([
            'tenant_id'    => $this->tenant->id,
            'name'         => 'AirPods Pro 2 USB-C',
            'category'     => 'AirPods',
            'model_code'   => 'A3047',
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);
    }

    public function test_admin_dashboard_breakdown_includes_all_excel_export_fields_and_keeps_shared_batch_orders_separate(): void
    {
        $now = Carbon::now($this->tz);
        $batchCode = 'BATCH-2026-001';
        $additionalServices = [
            ['name' => 'Vệ sinh màng loa chuyên sâu', 'price' => 50000],
            ['name' => 'Thay tips silicon zin', 'price' => 80000],
        ];

        $orderOne = RepairOrder::create([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branch->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->deviceModel->id,
            'technician_id'       => $this->technicianUser->id,
            'created_by_user_id'  => $this->adminUser->id,
            'order_code'          => 'PC26-XLS-001-' . uniqid(),
            'intake_batch_code'   => $batchCode,
            'order_type'          => 'cod',
            'serial_number'       => 'SN-APP2-LEFT-001',
            'accessories'         => 'Hộp sạc + cáp USB-C',
            'issue_description'   => 'Tai trái rè khi bật chống ồn ANC',
            'shipping_address'    => '88 Láng Hạ, Đống Đa, Hà Nội',
            'additional_services' => $additionalServices,
            'repair_note'         => 'Đã vệ sinh lưới mic và thay màng loa tai trái',
            'parts_used_summary'  => 'Màng loa AirPods Pro 2 x1',
            'parts_needed'        => 'Keo B7000',
            'status'              => 'completed',
            'total_price'         => 650000,
            'initial_price'       => 650000,
            'warranty_terms_days' => 90,
            'handed_over_at'      => $now,
            'created_at'          => $now,
        ]);

        $orderTwo = RepairOrder::create([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branch->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->deviceModel->id,
            'technician_id'       => $this->technicianUser->id,
            'created_by_user_id'  => $this->adminUser->id,
            'order_code'          => 'PC26-XLS-002-' . uniqid(),
            'intake_batch_code'   => $batchCode,
            'order_type'          => 'in_store',
            'serial_number'       => 'SN-APP2-CASE-002',
            'accessories'         => 'Chỉ dock sạc',
            'issue_description'   => 'Hộp sạc không vào pin',
            'shipping_address'    => null,
            'additional_services' => [],
            'repair_note'         => 'Đo dòng thấy chạm IC sạc',
            'parts_used_summary'  => null,
            'parts_needed'        => 'IC sạc Lightning/USB-C',
            'status'              => 'in_repair',
            'total_price'         => 450000,
            'initial_price'       => 450000,
            'warranty_terms_days' => 90,
            'created_at'          => $now,
        ]);

        $todayStr = $now->toDateString();

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}&date={$todayStr}");

        $response->assertStatus(200);

        $data = $response->json('data');
        $this->assertIsArray($data['selected_date_orders_breakdown']);
        $this->assertIsArray($data['monthly_orders_breakdown']);
        $this->assertCount(2, $data['selected_date_orders_breakdown']);
        $this->assertCount(2, $data['monthly_orders_breakdown']);

        foreach (['selected_date_orders_breakdown', 'monthly_orders_breakdown'] as $breakdownKey) {
            $byCode = collect($data[$breakdownKey])->keyBy('order_code');

            $this->assertArrayHasKey($orderOne->order_code, $byCode);
            $this->assertArrayHasKey($orderTwo->order_code, $byCode);

            $rowOne = $byCode[$orderOne->order_code];
            // Customer fields
            $this->assertSame($this->customer->name, $rowOne['customer_name']);
            $this->assertSame($this->customer->phone, $rowOne['customer_phone']);
            $this->assertSame('minhkhach@example.com', $rowOne['customer_email']);
            $this->assertSame('45 Nguyễn Trãi, Thanh Xuân, Hà Nội', $rowOne['customer_address']);
            $this->assertSame('vip', $rowOne['customer_type']);
            $this->assertSame('facebook', $rowOne['customer_source']);
            $this->assertSame('Khách quen ưu tiên giao trước 17h', $rowOne['customer_notes']);
            $this->assertSame('88 Láng Hạ, Đống Đa, Hà Nội', $rowOne['shipping_address']);

            // Device fields
            $this->assertSame($batchCode, $rowOne['intake_batch_code']);
            $this->assertSame('cod', $rowOne['order_type']);
            $this->assertSame('AirPods', $rowOne['device_category']);
            $this->assertSame('AirPods Pro 2 USB-C', $rowOne['device_name']);
            $this->assertSame('A3047', $rowOne['model_code']);
            $this->assertSame('SN-APP2-LEFT-001', $rowOne['serial_number']);
            $this->assertSame('Hộp sạc + cáp USB-C', $rowOne['accessories']);

            // Repair fields
            $this->assertSame('Tai trái rè khi bật chống ồn ANC', $rowOne['issue_description']);
            $this->assertSame($additionalServices, $rowOne['additional_services']);
            $this->assertSame('Đã vệ sinh lưới mic và thay màng loa tai trái', $rowOne['repair_note']);
            $this->assertSame('Màng loa AirPods Pro 2 x1', $rowOne['parts_used_summary']);
            $this->assertSame('Keo B7000', $rowOne['parts_needed']);
            $this->assertSame('KTV Nguyễn Văn An', $rowOne['technician_name']);
            $this->assertSame('Chi nhánh Hà Nội Excel Test', $rowOne['branch_name']);

            // Second order in same intake_batch_code remains distinct item
            $rowTwo = $byCode[$orderTwo->order_code];
            $this->assertSame($batchCode, $rowTwo['intake_batch_code']);
            $this->assertSame('in_store', $rowTwo['order_type']);
            $this->assertSame('SN-APP2-CASE-002', $rowTwo['serial_number']);
            $this->assertSame([], $rowTwo['additional_services']);
            $this->assertSame('IC sạc Lightning/USB-C', $rowTwo['parts_needed']);
        }
    }

    public function test_admin_dashboard_cross_month_range_also_populates_excel_fields(): void
    {
        $now = Carbon::now($this->tz);
        $lastMonthDate = $now->copy()->subMonthNoOverflow()->startOfMonth()->addDays(2);

        $oldOrder = RepairOrder::create([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branch->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->deviceModel->id,
            'technician_id'       => $this->technicianUser->id,
            'created_by_user_id'  => $this->adminUser->id,
            'order_code'          => 'PC26-XLS-OLD-' . uniqid(),
            'intake_batch_code'   => 'BATCH-OLD-001',
            'order_type'          => 'in_store',
            'serial_number'       => 'SN-OLD-001',
            'accessories'         => 'Không phụ kiện',
            'issue_description'   => 'Pin chai',
            'repair_note'         => 'Thay cell pin mới',
            'parts_used_summary'  => 'Pin AirPods Pro 2',
            'parts_needed'        => null,
            'status'              => 'completed',
            'total_price'         => 500000,
            'initial_price'       => 500000,
            'warranty_terms_days' => 90,
            'handed_over_at'      => $lastMonthDate,
            'created_at'          => $lastMonthDate,
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson(sprintf(
                '/api/v1/kpi/dashboard?branch_id=%d&from_date=%s&to_date=%s',
                $this->branch->id,
                $lastMonthDate->copy()->startOfMonth()->toDateString(),
                $now->toDateString()
            ));

        $response->assertStatus(200);
        $byCode = collect($response->json('data.selected_date_orders_breakdown'))->keyBy('order_code');
        $this->assertArrayHasKey($oldOrder->order_code, $byCode);

        $row = $byCode[$oldOrder->order_code];
        $this->assertSame('minhkhach@example.com', $row['customer_email']);
        $this->assertSame('AirPods', $row['device_category']);
        $this->assertSame('KTV Nguyễn Văn An', $row['technician_name']);
        $this->assertSame('Chi nhánh Hà Nội Excel Test', $row['branch_name']);
        $this->assertSame('BATCH-OLD-001', $row['intake_batch_code']);
    }

    public function test_technician_cannot_access_orders_breakdown_or_financial_fields_on_kpi_dashboard(): void
    {
        $now = Carbon::now($this->tz);

        RepairOrder::create([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branch->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->deviceModel->id,
            'technician_id'       => $this->technicianUser->id,
            'created_by_user_id'  => $this->adminUser->id,
            'order_code'          => 'PC26-TECH-HIDE-' . uniqid(),
            'issue_description'   => 'Test RBAC KTV',
            'status'              => 'completed',
            'total_price'         => 800000,
            'initial_price'       => 800000,
            'warranty_terms_days' => 90,
            'handed_over_at'      => $now,
            'created_at'          => $now,
        ]);

        $response = $this->actingAs($this->technicianUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}&date={$now->toDateString()}");

        $response->assertStatus(200);
        $data = $response->json('data');

        $this->assertArrayNotHasKey('selected_date_orders_breakdown', $data);
        $this->assertArrayNotHasKey('monthly_orders_breakdown', $data);
        $this->assertArrayNotHasKey('selected_date_orders_breakdown', $data['summary'] ?? []);
        $this->assertArrayNotHasKey('monthly_orders_breakdown', $data['summary'] ?? []);

        $hiddenFinancialKeys = [
            'daily_revenue',
            'monthly_revenue',
            'selected_date_revenue',
            'monthly_total_revenue',
            'selected_date_total_revenue',
            'revenue_chart',
            'selected_date_cogs',
            'monthly_cogs',
            'selected_date_gross_profit',
            'monthly_gross_profit',
            'accounts_receivable',
        ];

        foreach ($hiddenFinancialKeys as $key) {
            $this->assertArrayNotHasKey($key, $data);
            $this->assertArrayNotHasKey($key, $data['summary'] ?? []);
        }
    }
}
