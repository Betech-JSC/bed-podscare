<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class KpiDynamicCalculationTest extends TestCase
{
    use DatabaseTransactions;

    protected User $adminUser;
    protected Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();

        $this->branch = Branch::create([
            'name'      => 'Chi Nhánh Test KPI ' . uniqid(),
            'code'      => 'KPI_' . uniqid(),
            'phone'     => '0901112233',
            'address'   => '789 Đường 3/2, Q.10',
            'is_active' => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => null,
            'name'      => 'Admin KPI Test',
            'email'     => 'admin_kpi_' . uniqid() . '@fixo.com.vn',
            'phone'     => '093' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'branch_id' => $this->branch->id,
            'is_active' => true,
        ]);
    }

    /**
     * Test 1: Kỹ thuật viên mới chưa có đơn nào phải trả về null cho qc_pass_rate, rating, trend (loại bỏ hardcode 4.8/5, +10.2%, 96.5%).
     */
    public function test_technician_with_no_orders_returns_null_without_hardcoded_values(): void
    {
        $newTech = User::forceCreate([
            'tenant_id' => null,
            'name'      => 'KTV Mới Tuyển ' . uniqid(),
            'email'     => 'new_tech_' . uniqid() . '@fixo.com.vn',
            'phone'     => '096' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'technician',
            'branch_id' => $this->branch->id,
            'is_active' => true,
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/staff?technician_id={$newTech->id}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $staff = $response->json('data.staff');
        $this->assertCount(1, $staff);
        $kpi = $staff[0];

        $this->assertEquals($newTech->id, $kpi['technician_id']);
        $this->assertEquals(0, $kpi['total_orders']);
        $this->assertEquals(0, $kpi['completed']);

        // Đảm bảo không còn các giá trị hardcode
        $this->assertNull($kpi['qc_pass_rate'], 'qc_pass_rate must be null when no orders exist, not 96.5%');
        $this->assertNull($kpi['rating'], 'rating must be null when no orders exist, not 4.8/5');
        $this->assertNull($kpi['trend'], 'trend must be null when no orders exist, not +10.2%');
    }

    /**
     * Test 2: Thống kê chi nhánh không có đơn hoàn tất phải trả về null cho customer_satisfaction và avg_repair_days (loại bỏ hardcode 4,86 / 5 và 1,8 ngày).
     */
    public function test_summary_with_no_orders_returns_null_without_hardcoded_satisfaction(): void
    {
        $emptyBranch = Branch::create([
            'name'      => 'Chi Nhánh Trống ' . uniqid(),
            'code'      => 'EMP_' . uniqid(),
            'phone'     => '0909998877',
            'address'   => '999 Đường Trống',
            'is_active' => true,
        ]);

        $techInEmptyBranch = User::forceCreate([
            'tenant_id' => null,
            'name'      => 'KTV Trống ' . uniqid(),
            'email'     => 'empty_tech_' . uniqid() . '@fixo.com.vn',
            'phone'     => '097' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'technician',
            'branch_id' => $emptyBranch->id,
            'is_active' => true,
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/staff?branch_id={$emptyBranch->id}");

        $response->assertStatus(200);

        $summary = $response->json('data.summary');
        $this->assertEquals(0, $summary['total_orders']);
        $this->assertNull($summary['qc_pass_rate']);
        $this->assertNull($summary['customer_satisfaction'], 'customer_satisfaction must be null when no orders, not 4,86 / 5');
        $this->assertNull($summary['avg_repair_days'], 'avg_repair_days must be null when no orders, not 1,8 ngày');
    }

    /**
     * Test 3: KTV có đơn và kiểm định QC tính toán chính xác điểm và tỷ lệ QC thật từ database.
     */
    public function test_technician_with_qc_orders_calculates_dynamically(): void
    {
        $customer = Customer::first() ?? Customer::create([
            'name'  => 'Khách Test KPI',
            'phone' => '090' . rand(1000000, 9999999),
        ]);

        $device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $tech = User::forceCreate([
            'tenant_id' => null,
            'name'      => 'KTV Đã Làm Đơn ' . uniqid(),
            'email'     => 'working_tech_' . uniqid() . '@fixo.com.vn',
            'phone'     => '092' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'technician',
            'branch_id' => $this->branch->id,
            'is_active' => true,
        ]);

        // Đơn 1: Pass QC (hoàn tất)
        $order1 = RepairOrder::create([
            'order_code'          => 'FX26-KPI1-' . uniqid(),
            'branch_id'           => $this->branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'issue_description'   => 'Lỗi pin',
            'status'              => 'completed',
            'created_by_user_id'  => $this->adminUser->id,
            'technician_id'       => $tech->id,
            'repair_started_at'   => now()->subHours(2),
            'repair_completed_at' => now()->subHour(),
        ]);

        QcInspection::create([
            'repair_order_id' => $order1->id,
            'inspector_id'    => $this->adminUser->id,
            'result'          => 'pass',
            'inspected_at'    => now()->subMinutes(30),
        ]);

        // Đơn 2: Fail QC (cần sửa lại)
        $order2 = RepairOrder::create([
            'order_code'          => 'FX26-KPI2-' . uniqid(),
            'branch_id'           => $this->branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'issue_description'   => 'Lỗi mic',
            'status'              => 'rework_needed',
            'created_by_user_id'  => $this->adminUser->id,
            'technician_id'       => $tech->id,
            'repair_started_at'   => now()->subHours(3),
            'repair_completed_at' => now()->subHours(2),
        ]);

        QcInspection::create([
            'repair_order_id' => $order2->id,
            'inspector_id'    => $this->adminUser->id,
            'result'          => 'fail',
            'inspected_at'    => now()->subMinutes(90),
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/staff?technician_id={$tech->id}");

        $response->assertStatus(200);

        $staff = $response->json('data.staff');
        $this->assertCount(1, $staff);
        $kpi = $staff[0];

        $this->assertEquals(2, $kpi['total_orders']);
        $this->assertEquals(1, $kpi['completed']);
        $this->assertEquals(1, $kpi['rework_needed']);
        $this->assertEquals(2, $kpi['qc_total']);
        $this->assertEquals(1, $kpi['qc_passed']);
        // Tỷ lệ QC: 1/2 = 50.0%
        $this->assertEquals(50.0, $kpi['qc_pass_rate']);
        $this->assertEquals('50%', $kpi['qcPass']);
        // Rating: (50 / 100) * 5 = 2.5/5
        $this->assertEquals('2.5/5', $kpi['rating']);
    }
}
