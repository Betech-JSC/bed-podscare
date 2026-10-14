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
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SimplifyModulesBackendEnhancementsTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $adminUser;
    protected User $cskhUser;
    protected User $techUser;
    protected string $tz;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tz = config('app.timezone', 'Asia/Ho_Chi_Minh');

        $this->tenant = Tenant::create([
            'code'   => 'tenant_test_' . uniqid(),
            'name'   => 'Tiệm Test Simplify Modules',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Trung Tâm',
            'code'      => 'TT_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Nguyễn Huệ, Q1',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Trần Thị Thu Hà',
            'phone'     => '093' . rand(1000000, 9999999),
            'email'     => 'ha.tran@example.com',
            'address'   => '456 Hai Bà Trưng, Q3, TP.HCM',
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'     => 'AirPods Pro 2',
            'category' => 'airpods',
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin User Test',
            'email'     => 'admin_simp_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cskhUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'CSKH User Test',
            'email'     => 'cskh_simp_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->techUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Technician User Test',
            'email'     => 'tech_simp_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);
    }

    /**
     * Test 2.2: KpiController dashboard tính toán warranty_rate (%) và warranty_claims_count chính xác.
     */
    public function test_kpi_dashboard_calculates_warranty_rate_and_warranty_claims_count(): void
    {
        // 1. Tạo 4 đơn completed thông thường
        for ($i = 0; $i < 4; $i++) {
            RepairOrder::create([
                'tenant_id'          => $this->tenant->id,
                'branch_id'          => $this->branch->id,
                'customer_id'        => $this->customer->id,
                'device_model_id'    => $this->device->id,
                'order_code'         => 'FX26-CMP-' . uniqid(),
                'issue_description'  => 'Thay pin AirPods',
                'status'             => 'completed',
                'order_type'         => 'in_store',
                'total_price'        => 200000,
                'created_by_user_id' => $this->cskhUser->id,
                'technician_id'      => $this->techUser->id,
                'handed_over_at'     => Carbon::now($this->tz),
            ]);
        }

        // 2. Tạo 1 đơn bảo hành (order_type = 'warranty')
        RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-WRN-' . uniqid(),
            'issue_description'  => 'Bảo hành tai nghe',
            'status'             => 'in_repair',
            'order_type'         => 'warranty',
            'total_price'        => 0,
            'created_by_user_id' => $this->cskhUser->id,
            'technician_id'      => $this->techUser->id,
        ]);

        $token = $this->adminUser->createToken('admin_token')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        // Kiểm tra tồn tại warranty_rate và warranty_claims_count trong summary
        $summary = $response->json('data.summary');
        $this->assertArrayHasKey('warranty_rate', $summary);
        $this->assertArrayHasKey('warranty_claims_count', $summary);

        $this->assertEquals(1, $summary['warranty_claims_count']);
        // 1 đơn warranty / 4 đơn completed = 25.0%
        $this->assertEquals(25.0, (float) $summary['warranty_rate']);

        // Đồng thời có ở top level data payload
        $this->assertEquals(1, $response->json('data.warranty_claims_count'));
        $this->assertEquals(25.0, (float) $response->json('data.warranty_rate'));
    }

    /**
     * Test 2.2b: Tránh lỗi chia cho 0 khi chưa có đơn completed nào.
     */
    public function test_kpi_dashboard_handles_zero_completed_orders_without_division_by_zero(): void
    {
        $emptyTenant = Tenant::create([
            'code'   => 'tenant_empty_' . uniqid(),
            'name'   => 'Empty Tenant',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $emptyBranch = Branch::create([
            'tenant_id' => $emptyTenant->id,
            'name'      => 'Chi nhánh Trống',
            'code'      => 'TR_' . uniqid(),
            'phone'     => '0908888888',
            'address'   => '123 Trống',
            'is_active' => true,
        ]);

        $emptyAdmin = User::forceCreate([
            'tenant_id' => $emptyTenant->id,
            'branch_id' => $emptyBranch->id,
            'name'      => 'Empty Admin',
            'email'     => 'empty_admin_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $token = $emptyAdmin->createToken('admin_token')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson("/api/v1/kpi/dashboard?branch_id={$emptyBranch->id}");

        $response->assertStatus(200);
        $this->assertEquals(0.0, (float) $response->json('data.summary.warranty_rate'));
        $this->assertEquals(0, $response->json('data.summary.warranty_claims_count'));
    }

    /**
     * Test 3.1: CSKH hoặc Admin cập nhật thông tin hồ sơ khách hàng thành công qua PUT /api/v1/customers/{id}.
     */
    public function test_customer_update_endpoint_updates_profile_and_address_successfully(): void
    {
        $token = $this->cskhUser->createToken('cskh_token')->plainTextToken;

        $payload = [
            'name'    => 'Nguyễn Văn Cập Nhật',
            'phone'   => '0987654321',
            'email'   => 'updated.customer@gmail.com',
            'address' => '789 Đường 3/2, Quận 10, TP. Hồ Chí Minh',
            'notes'   => 'Khách hàng thân thiết',
        ];

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson("/api/v1/customers/{$this->customer->id}", $payload);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.name', 'Nguyễn Văn Cập Nhật')
            ->assertJsonPath('data.phone', '0987654321')
            ->assertJsonPath('data.email', 'updated.customer@gmail.com')
            ->assertJsonPath('data.address', '789 Đường 3/2, Quận 10, TP. Hồ Chí Minh');

        // Kiểm tra database đã cập nhật
        $this->customer->refresh();
        $this->assertEquals('Nguyễn Văn Cập Nhật', $this->customer->name);
        $this->assertEquals('0987654321', $this->customer->phone);
        $this->assertEquals('789 Đường 3/2, Quận 10, TP. Hồ Chí Minh', $this->customer->address);
    }

    /**
     * Test 3.1b: Xác thực định dạng SĐT Việt Nam hợp lệ (0x / +84x).
     */
    public function test_customer_update_validates_vietnam_phone_regex(): void
    {
        $token = $this->cskhUser->createToken('cskh_token')->plainTextToken;

        $invalidPayload = [
            'name'  => 'Tên Hợp Lệ',
            'phone' => '12345678', // Không đúng regex SĐT VN
        ];

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson("/api/v1/customers/{$this->customer->id}", $invalidPayload);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);
    }

    /**
     * Test 3.1c: Xác thực trùng SĐT trong cùng tenant_id.
     */
    public function test_customer_update_enforces_tenant_scoped_phone_uniqueness(): void
    {
        // Tạo customer 2 trong cùng tenant
        $customer2 = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Số 2',
            'phone'     => '0912345678',
        ]);

        $token = $this->cskhUser->createToken('cskh_token')->plainTextToken;

        // Cố tình sửa SĐT của customer1 thành SĐT của customer2 -> 422 Unprocessable Entity
        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson("/api/v1/customers/{$this->customer->id}", [
                'name'  => $this->customer->name,
                'phone' => '0912345678',
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);

        // Sửa giữ nguyên SĐT của chính mình -> OK (ignore self)
        $selfResponse = $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson("/api/v1/customers/{$this->customer->id}", [
                'name'  => 'Tên Mới Của Chính Tôi',
                'phone' => $this->customer->phone,
            ]);

        $selfResponse->assertStatus(200)
            ->assertJsonPath('data.name', 'Tên Mới Của Chính Tôi');
    }

    /**
     * Test 6.1: Kỹ thuật viên lọc date_filter = 7_days sử dụng Carbon::today()->subDays(6).
     */
    public function test_technician_7_days_filter_fetches_orders_within_7_days(): void
    {
        // 1. Đơn 5 ngày trước (trong phạm vi 7 ngày)
        $within7DaysOrder = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-IN7-' . rand(1000, 9999),
            'issue_description'  => 'Đơn 5 ngày trước trong 7 days',
            'status'             => 'in_repair',
            'created_by_user_id' => $this->cskhUser->id,
            'technician_id'      => $this->techUser->id,
        ]);
        DB::table('repair_orders')->where('id', $within7DaysOrder->id)->update([
            'created_at' => Carbon::today($this->tz)->subDays(5)->addHours(4),
        ]);

        // 2. Đơn 10 ngày trước (ngoài phạm vi 7 ngày)
        $olderThan7DaysOrder = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-OUT7-' . rand(1000, 9999),
            'issue_description'  => 'Đơn 10 ngày trước ngoài 7 days',
            'status'             => 'in_repair',
            'created_by_user_id' => $this->cskhUser->id,
            'technician_id'      => $this->techUser->id,
        ]);
        DB::table('repair_orders')->where('id', $olderThan7DaysOrder->id)->update([
            'created_at' => Carbon::today($this->tz)->subDays(10),
        ]);

        $techToken = $this->techUser->createToken('tech_token')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$techToken}")
            ->getJson('/api/v1/orders?date_filter=7_days&per_page=100');

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $returnedCodes = collect($response->json('data.data'))->pluck('order_code')->toArray();

        $this->assertContains($within7DaysOrder->order_code, $returnedCodes);
        $this->assertNotContains($olderThan7DaysOrder->order_code, $returnedCodes);
    }
}
