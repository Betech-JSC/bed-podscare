<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class StaffKpiTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $adminUser;
    protected User $techUser;
    protected User $cskhUser;
    protected string $tz = 'Asia/Ho_Chi_Minh';

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_staff_kpi_' . uniqid(),
            'name'   => 'PodsCare Staff KPI Period Tenant',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Trung Tâm',
            'code'      => 'CN_SKPI_' . strtoupper(uniqid()),
            'phone'     => '0901234567',
            'address'   => '123 Nguyễn Huệ, Q1',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Test KPI',
            'phone'     => '0919' . rand(100000, 999999),
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
            'name'      => 'Admin KPI',
            'email'     => 'admin_skpi_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->techUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'KTV Lê Hoàng',
            'email'     => 'tech_skpi_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->cskhUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'CSKH Ngọc Anh',
            'email'     => 'cskh_skpi_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);
    }

    private function createOrderWithDates(array $attrs, string $createdAtStr, ?string $handedOverAtStr = null, ?string $updatedAtStr = null): RepairOrder
    {
        $order = RepairOrder::create(array_merge([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'PC26-SK-' . strtoupper(uniqid()),
            'issue_description'  => 'Thay pin AirPods',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 400000,
            'created_by_user_id' => $this->cskhUser->id,
            'technician_id'      => $this->techUser->id,
            'handed_over_at'     => $handedOverAtStr ? Carbon::parse($handedOverAtStr, $this->tz) : null,
        ], $attrs));

        $order->created_at = Carbon::parse($createdAtStr, $this->tz);
        $order->updated_at = Carbon::parse($updatedAtStr ?? $handedOverAtStr ?? $createdAtStr, $this->tz);
        $order->saveQuietly();

        return $order;
    }

    /**
     * Test 1: Lọc hiệu suất KTV và CSKH theo ngày được chọn (period=today&date=2026-10-16) và tháng (period=this_month).
     * Đảm bảo đơn tạo ngày hôm trước nhưng bàn giao ngày 2026-10-16 vẫn được tính completed & revenue_generated trong ngày 2026-10-16.
     */
    public function test_staff_kpi_filters_by_period_today_and_this_month_using_handed_over_date(): void
    {
        // Đơn 1: Tạo ngày 2026-10-14, bàn giao hoàn tất ngày 2026-10-16 (giá 500.000)
        $order1 = $this->createOrderWithDates(
            ['total_price' => 500000, 'status' => 'completed'],
            '2026-10-14 10:00:00',
            '2026-10-16 14:30:00'
        );
        QcInspection::create([
            'repair_order_id' => $order1->id,
            'inspector_id'    => $this->adminUser->id,
            'result'          => 'pass',
        ]);

        // Đơn 2: Tạo ngày 2026-10-16, bàn giao hoàn tất ngày 2026-10-16 (giá 350.000)
        $order2 = $this->createOrderWithDates(
            ['total_price' => 350000, 'status' => 'completed'],
            '2026-10-16 09:00:00',
            '2026-10-16 16:00:00'
        );

        // Đơn 3: Tạo ngày 2026-10-05 (đầu tháng 10), bàn giao ngày 2026-10-05 (giá 600.000)
        $this->createOrderWithDates(
            ['total_price' => 600000, 'status' => 'completed'],
            '2026-10-05 11:00:00',
            '2026-10-05 15:00:00'
        );

        // Đơn 4: Tạo ngày 2026-10-16 nhưng đang sửa (in_repair)
        $this->createOrderWithDates(
            ['total_price' => 450000, 'status' => 'in_repair'],
            '2026-10-16 11:30:00',
            null,
            '2026-10-16 11:45:00'
        );

        // 1. Kiểm tra period=today&date=2026-10-16
        $resToday = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/kpi/staff?period=today&date=2026-10-16');

        $resToday->assertStatus(200);

        $techToday = collect($resToday->json('data.technicians'))->firstWhere('id', $this->techUser->id);
        $this->assertNotNull($techToday);
        // Đơn 1 và Đơn 2 đều bàn giao ngày 2026-10-16 => completed = 2, revenue = 850.000
        $this->assertEquals(2, $techToday['completed']);
        $this->assertEquals(850000, (float) $techToday['revenue_generated']);
        $this->assertEquals('850.000 ₫', $techToday['revenue_generated_formatted']);
        $this->assertEquals(1, $techToday['in_repair']);

        $cskhToday = collect($resToday->json('data.cskh'))->firstWhere('id', $this->cskhUser->id);
        $this->assertNotNull($cskhToday);
        // CSKH tạo mới trong ngày 2026-10-16: Đơn 2 + Đơn 4 = 2 đơn; hoàn tất bàn giao trong ngày 2026-10-16: Đơn 1 + Đơn 2 = 2 đơn (850.000)
        $this->assertEquals(2, $cskhToday['orders_created_count']);
        $this->assertEquals(2, $cskhToday['completed']);
        $this->assertEquals(850000, (float) $cskhToday['revenue_generated']);

        // 2. Kiểm tra period=this_month&date=2026-10-16
        $resMonth = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/kpi/staff?period=this_month&date=2026-10-16');

        $resMonth->assertStatus(200);
        $techMonth = collect($resMonth->json('data.technicians'))->firstWhere('id', $this->techUser->id);
        $this->assertEquals(3, $techMonth['completed']);
        $this->assertEquals(1450000, (float) $techMonth['revenue_generated']); // 500k + 350k + 600k

        $cskhMonth = collect($resMonth->json('data.cskh'))->firstWhere('id', $this->cskhUser->id);
        $this->assertEquals(4, $cskhMonth['orders_created_count']);
        $this->assertEquals(3, $cskhMonth['completed']);
        $this->assertEquals(1450000, (float) $cskhMonth['revenue_generated']);
    }

    /**
     * Test 2: RBAC masking - Kỹ thuật viên gọi GET /api/v1/kpi/staff?period=this_month bị ẩn revenue_generated = null.
     */
    public function test_staff_kpi_masks_revenue_generated_for_technician_role_across_periods(): void
    {
        $this->createOrderWithDates(
            ['total_price' => 500000, 'status' => 'completed'],
            '2026-10-16 09:00:00',
            '2026-10-16 15:00:00'
        );

        $resTech = $this->actingAs($this->techUser, 'sanctum')
            ->getJson('/api/v1/kpi/staff?period=today&date=2026-10-16');

        $resTech->assertStatus(200);

        $techRow = collect($resTech->json('data.technicians'))->firstWhere('id', $this->techUser->id);
        $this->assertNotNull($techRow);
        $this->assertEquals(1, $techRow['completed']);
        $this->assertNull($techRow['revenue_generated']);
        $this->assertNull($techRow['revenue_generated_formatted']);

        $cskhRow = collect($resTech->json('data.cskh'))->firstWhere('id', $this->cskhUser->id);
        $this->assertNotNull($cskhRow);
        $this->assertNull($cskhRow['revenue_generated']);
        $this->assertNull($cskhRow['revenue_generated_formatted']);
    }
}
