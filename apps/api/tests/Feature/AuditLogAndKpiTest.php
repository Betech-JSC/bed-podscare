<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\User;
use Carbon\Carbon;
use Tests\TestCase;

class AuditLogAndKpiTest extends TestCase
{
    private function getBranch(): Branch
    {
        return Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'Q1',
            'address'   => '123 Lê Lợi, P. Bến Nghé, Q.1',
            'phone'     => '0901000001',
            'is_active' => true,
        ]);
    }

    private function getCustomer(): Customer
    {
        return Customer::first() ?? Customer::create([
            'name'          => 'Khách hàng Test',
            'phone'         => '0908889999',
            'customer_type' => 'retail',
            'orders_count'  => 0,
            'total_spent'   => 0,
        ]);
    }

    private function getDeviceModel(): DeviceModel
    {
        return DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'APP2-' . uniqid(),
            'is_active'  => true,
        ]);
    }

    private function getAuthUser(): User
    {
        $branch = $this->getBranch();
        $user = User::where('email', 'admin@fixo.com.vn')->first()
            ?? User::where('email', 'admin@podscare.vn')->first()
            ?? User::where('role', 'admin')->first();
        if (! $user) {
            $user = User::forceCreate([
                'name'       => 'Minh Lê',
                'email'      => 'admin@fixo.com.vn',
                'role'       => 'admin',
                'password'   => bcrypt('password'),
                'branch_id'  => $branch->id,
                'is_active'  => true,
                'avatar_url' => 'https://ui-avatars.com/api/?name=Minh+Le',
            ]);
        }
        return $user;
    }

    /**
     * Test 1: Truy cập /api/v1/audit-logs khi chưa đăng nhập trả về 401 Unauthorized.
     */
    public function test_unauthenticated_cannot_access_audit_logs(): void
    {
        $response = $this->getJson('/api/v1/audit-logs');
        $response->assertStatus(401);
    }

    /**
     * Test 2: Đăng nhập thành công lấy danh sách audit logs với chuẩn ApiResponse.
     */
    public function test_authenticated_user_can_list_audit_logs(): void
    {
        $user = $this->getAuthUser();

        AuditLog::create([
            'user_id'        => $user->id,
            'user_name'      => $user->name,
            'action'         => 'Test Audit Log Action',
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => 1,
            'details'        => 'Test audit log details',
            'ip_address'     => '127.0.0.1',
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/audit-logs');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'message',
                'data' => [
                    'current_page',
                    'data' => [
                        '*' => [
                            'id',
                            'user_id',
                            'user_name',
                            'action',
                            'auditable_type',
                            'auditable_id',
                            'details',
                            'created_at',
                        ],
                    ],
                    'per_page',
                    'total',
                ],
            ]);
    }

    /**
     * Test 3: Lọc nhật ký hoạt động theo module (auditable_type) và action.
     */
    public function test_audit_logs_can_filter_by_module_and_action(): void
    {
        $user = $this->getAuthUser();

        AuditLog::create([
            'user_id'        => $user->id,
            'user_name'      => $user->name,
            'action'         => 'UniqueOrderAction',
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => 9991,
            'details'        => 'Unique order detail',
        ]);

        AuditLog::create([
            'user_id'        => $user->id,
            'user_name'      => $user->name,
            'action'         => 'UniquePaymentAction',
            'auditable_type' => 'Payment',
            'auditable_id'   => 9992,
            'details'        => 'Unique payment detail',
        ]);

        // Lọc theo module RepairOrder
        $resModule = $this->actingAs($user, 'sanctum')->getJson('/api/v1/audit-logs?module=RepairOrder');
        $resModule->assertStatus(200)->assertJsonPath('success', true);
        $dataModule = $resModule->json('data.data');
        $this->assertNotEmpty($dataModule);
        foreach ($dataModule as $item) {
            $this->assertStringContainsString('RepairOrder', $item['auditable_type']);
        }

        // Lọc theo action UniquePaymentAction
        $resAction = $this->actingAs($user, 'sanctum')->getJson('/api/v1/audit-logs?action=UniquePaymentAction');
        $resAction->assertStatus(200)->assertJsonPath('success', true);
        $dataAction = $resAction->json('data.data');
        $this->assertNotEmpty($dataAction);
        foreach ($dataAction as $item) {
            $this->assertEquals('UniquePaymentAction', $item['action']);
        }
    }

    /**
     * Test 4: Xem chi tiết một bản ghi audit log và kiểm tra 404 khi không tồn tại.
     */
    public function test_audit_log_show_endpoint(): void
    {
        $user = $this->getAuthUser();

        $log = AuditLog::create([
            'user_id'        => $user->id,
            'user_name'      => $user->name,
            'action'         => 'Detail Check',
            'auditable_type' => 'User',
            'auditable_id'   => $user->id,
            'details'        => 'Check show endpoint',
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson("/api/v1/audit-logs/{$log->id}");
        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.id', $log->id)
            ->assertJsonPath('data.action', 'Detail Check');

        $notFoundResponse = $this->actingAs($user, 'sanctum')->getJson('/api/v1/audit-logs/9999999');
        $notFoundResponse->assertStatus(404)
            ->assertJsonPath('success', false);
    }

    /**
     * Test 5: Truy cập /api/v1/kpi/staff khi chưa đăng nhập trả về 401 Unauthorized.
     */
    public function test_unauthenticated_cannot_access_staff_kpi(): void
    {
        $response = $this->getJson('/api/v1/kpi/staff');
        $response->assertStatus(401);
    }

    /**
     * Test 6: Đăng nhập thành công lấy thống kê KPI nhân sự.
     */
    public function test_authenticated_user_can_get_staff_kpi(): void
    {
        $user = $this->getAuthUser();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/kpi/staff');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'message',
                'data' => [
                    'summary' => [
                        'total_technicians',
                        'total_orders',
                        'completed',
                        'rework_needed',
                        'qc_pass_rate',
                        'avg_processing_time_minutes',
                        'avg_processing_time_hours',
                        'avg_processing_time_formatted',
                    ],
                    'staff',
                ],
            ]);

        $staff = $response->json('data.staff');
        $this->assertIsArray($staff);
        if (! empty($staff)) {
            $item = $staff[0];
            $this->assertArrayHasKey('technician_id', $item);
            $this->assertArrayHasKey('name', $item);
            $this->assertArrayHasKey('completed', $item);
            $this->assertArrayHasKey('rework_needed', $item);
            $this->assertArrayHasKey('qc_pass_rate', $item);
            $this->assertArrayHasKey('avg_processing_time_minutes', $item);
        }
    }

    /**
     * Test 7: Thống kê KPI tính toán chính xác số liệu: completed, rework_needed, avg time.
     */
    public function test_staff_kpi_calculates_metrics_correctly(): void
    {
        $admin = $this->getAuthUser();
        $branch = $this->getBranch();
        $customer = $this->getCustomer();
        $device = $this->getDeviceModel();

        // Tạo kỹ thuật viên kiểm thử
        $tech = User::create([
            'name'       => 'Test KTV ' . uniqid(),
            'email'      => 'test_ktv_' . uniqid() . '@fixo.com.vn',
            'role'       => 'technician',
            'password'   => bcrypt('password'),
            'branch_id'  => $branch->id,
            'is_active'  => true,
            'avatar_url' => 'https://ui-avatars.com/api/?name=Test+KTV',
        ]);

        $baseTime = Carbon::now()->subDays(1);

        // Đơn 1: Completed, thời gian xử lý 60 phút
        RepairOrder::create([
            'order_code'          => 'PC-TEST-' . uniqid(),
            'branch_id'           => $branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'issue_description'   => 'Lỗi pin 1',
            'status'              => 'completed',
            'created_by_user_id'  => $admin->id,
            'technician_id'       => $tech->id,
            'repair_started_at'   => $baseTime,
            'repair_completed_at' => $baseTime->copy()->addMinutes(60),
            'qc_passed_at'        => $baseTime->copy()->addMinutes(70),
        ]);

        // Đơn 2: Completed, thời gian xử lý 120 phút
        RepairOrder::create([
            'order_code'          => 'PC-TEST-' . uniqid(),
            'branch_id'           => $branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'issue_description'   => 'Lỗi loa 2',
            'status'              => 'completed',
            'created_by_user_id'  => $admin->id,
            'technician_id'       => $tech->id,
            'repair_started_at'   => $baseTime,
            'repair_completed_at' => $baseTime->copy()->addMinutes(120),
            'qc_passed_at'        => $baseTime->copy()->addMinutes(130),
        ]);

        // Đơn 3: Rework needed, thời gian 45 phút
        RepairOrder::create([
            'order_code'          => 'PC-TEST-' . uniqid(),
            'branch_id'           => $branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'issue_description'   => 'Lỗi mic 3',
            'status'              => 'rework_needed',
            'created_by_user_id'  => $admin->id,
            'technician_id'       => $tech->id,
            'repair_started_at'   => $baseTime,
            'repair_completed_at' => $baseTime->copy()->addMinutes(45),
        ]);

        // Gọi API thống kê cho riêng kỹ thuật viên này
        $response = $this->actingAs($admin, 'sanctum')->getJson("/api/v1/kpi/staff?technician_id={$tech->id}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $staff = $response->json('data.staff');
        $this->assertCount(1, $staff);
        $kpi = $staff[0];

        $this->assertEquals($tech->id, $kpi['technician_id']);
        $this->assertEquals(3, $kpi['total_orders']);
        $this->assertEquals(2, $kpi['completed']);
        $this->assertEquals(1, $kpi['rework_needed']);
        // Thời gian trung bình: (60 + 120 + 45) / 3 = 75 phút
        $this->assertEquals(75.0, $kpi['avg_processing_time_minutes']);
        $this->assertEquals(1.25, $kpi['avg_processing_time_hours']);
        $this->assertEquals('1h 15m', $kpi['avg_processing_time_formatted']);
    }

    /**
     * Test 8: Hỗ trợ view=list trả về danh sách mảng KTV trực tiếp.
     */
    public function test_staff_kpi_list_view(): void
    {
        $admin = $this->getAuthUser();

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/kpi/staff?view=list');

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $data = $response->json('data');
        $this->assertIsArray($data);
    }
}
