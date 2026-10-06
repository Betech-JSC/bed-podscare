<?php

namespace Tests\Feature;

use App\Events\OrderOperationalEvent;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OrderCreatorAssignmentTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected Branch $branchA;
    protected Branch $branchB;
    protected User $adminUserA;
    protected User $cskhUserA;
    protected User $cskhUserB;
    protected Customer $customerA;
    protected DeviceModel $deviceModel;

    protected function setUp(): void
    {
        parent::setUp();
        Event::fake([OrderOperationalEvent::class]);

        // 1. Tạo 2 tenant độc lập
        $this->tenantA = Tenant::create([
            'code'            => 'tenant-a-' . uniqid(),
            'name'            => 'Cửa hàng PodsCare Quận 1',
            'status'          => 'active',
            'plan'            => 'pro',
            'current_plan_id' => 'pro',
            'expires_at'      => now()->addYear(),
        ]);

        $this->tenantB = Tenant::create([
            'code'            => 'tenant-b-' . uniqid(),
            'name'            => 'Cửa hàng PodsCare Thủ Đức',
            'status'          => 'active',
            'plan'            => 'pro',
            'current_plan_id' => 'pro',
            'expires_at'      => now()->addYear(),
        ]);

        // 2. Chi nhánh của từng tenant
        $this->branchA = Branch::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Q1',
            'code'      => 'BR_A_' . uniqid(),
            'phone'     => '0901111111',
            'address'   => 'Quận 1, TP.HCM',
            'is_active' => true,
        ]);

        $this->branchB = Branch::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Chi nhánh Thủ Đức',
            'code'      => 'BR_B_' . uniqid(),
            'phone'     => '0902222222',
            'address'   => 'Thủ Đức, TP.HCM',
            'is_active' => true,
        ]);

        // 3. User của Tenant A
        $this->adminUserA = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'Admin Tiệm A',
            'email'     => 'admin_a_' . uniqid() . '@podscare.vn',
            'phone'     => '0911000001',
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cskhUserA = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'CSKH Nguyễn Thị A',
            'email'     => 'cskh_a_' . uniqid() . '@podscare.vn',
            'phone'     => '0911000002',
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        // 4. User của Tenant B
        $this->cskhUserB = User::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'branch_id' => $this->branchB->id,
            'name'      => 'CSKH Trần Văn B',
            'email'     => 'cskh_b_' . uniqid() . '@podscare.vn',
            'phone'     => '0912000002',
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        // 5. Khách hàng và Thiết bị mẫu
        $this->customerA = Customer::firstOrCreate(
            ['phone' => '0988' . rand(100000, 999999)],
            ['name' => 'Khách Hàng Thử Nghiệm', 'tenant_id' => $this->tenantA->id]
        );

        $this->deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);
    }

    private function validOrderPayload(array $overrides = []): array
    {
        return array_merge([
            'branch_id'            => $this->branchA->id,
            'customer_phone'       => '0977' . rand(100000, 999999),
            'customer_name'        => 'Khách Test Tiếp Nhận',
            'device_model_id'      => $this->deviceModel->id,
            'serial_number'        => 'TEST-SR-' . uniqid(),
            'intake_battery_level' => '90%',
            'accessories'          => 'Dock sạc + Cáp',
            'issue_description'    => 'Mất kết nối tai phải và rè loa',
            'estimated_price'      => 450000,
            'warranty_terms_days'  => 90,
        ], $overrides);
    }

    /**
     * Test case 1: Tạo đơn chỉ định created_by_user_id của CSKH trong cùng tenant -> Đơn được tạo với đúng created_by_user_id.
     */
    public function test_store_order_with_assigned_cskh_creator_in_same_tenant(): void
    {
        $payload = $this->validOrderPayload([
            'created_by_user_id' => $this->cskhUserA->id,
        ]);

        $response = $this->actingAs($this->adminUserA, 'sanctum')
            ->postJson('/api/v1/orders', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.created_by_user_id', $this->cskhUserA->id)
            ->assertJsonPath('data.created_by_user.id', $this->cskhUserA->id)
            ->assertJsonPath('data.created_by_user.name', $this->cskhUserA->name)
            ->assertJsonPath('data.created_by_user.role', 'cskh');

        $this->assertDatabaseHas('repair_orders', [
            'id'                 => $response->json('data.id'),
            'created_by_user_id' => $this->cskhUserA->id,
            'tenant_id'          => $this->tenantA->id,
        ]);
    }

    /**
     * Test case 2: Tạo đơn không truyền created_by_user_id -> Fallback về ID của tài khoản đang đăng nhập.
     */
    public function test_store_order_without_creator_id_falls_back_to_authenticated_user(): void
    {
        $payload = $this->validOrderPayload();
        unset($payload['created_by_user_id']);

        $response = $this->actingAs($this->adminUserA, 'sanctum')
            ->postJson('/api/v1/orders', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.created_by_user_id', $this->adminUserA->id)
            ->assertJsonPath('data.created_by_user.id', $this->adminUserA->id);

        $this->assertDatabaseHas('repair_orders', [
            'id'                 => $response->json('data.id'),
            'created_by_user_id' => $this->adminUserA->id,
            'tenant_id'          => $this->tenantA->id,
        ]);
    }

    /**
     * Test case 3: Tạo đơn truyền created_by_user_id của user thuộc tenant khác -> Bị chặn với lỗi 422.
     */
    public function test_store_order_with_creator_from_different_tenant_fails_with_422(): void
    {
        $payload = $this->validOrderPayload([
            'created_by_user_id' => $this->cskhUserB->id,
        ]);

        $response = $this->actingAs($this->adminUserA, 'sanctum')
            ->postJson('/api/v1/orders', $payload);

        $response->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Nhân viên tiếp nhận không hợp lệ hoặc không thuộc cửa hàng.');
    }

    /**
     * Test case 4: Gọi GET /api/v1/orders -> Trả về quan hệ created_by_user có chứa id, name, role.
     */
    public function test_index_orders_eager_loads_created_by_user(): void
    {
        // Tạo một đơn với CSKH tạo đơn
        $order = RepairOrder::create([
            'order_code'          => 'FX26-' . rand(10000, 99999),
            'branch_id'           => $this->branchA->id,
            'customer_id'         => $this->customerA->id,
            'device_model_id'     => $this->deviceModel->id,
            'issue_description'   => 'Kiểm tra pin và tai nghe',
            'status'              => 'waiting_tech',
            'total_price'         => 350000,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $this->cskhUserA->id,
            'tenant_id'           => $this->tenantA->id,
        ]);

        $response = $this->actingAs($this->adminUserA, 'sanctum')
            ->getJson('/api/v1/orders');

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $data = $response->json('data.data');
        $this->assertNotEmpty($data, 'Danh sách đơn hàng không được rỗng.');

        $foundOrder = collect($data)->firstWhere('id', $order->id);
        $this->assertNotNull($foundOrder, "Đơn hàng ID {$order->id} phải có trong kết quả trả về.");
        $this->assertArrayHasKey('created_by_user', $foundOrder);
        $this->assertNotNull($foundOrder['created_by_user']);
        $this->assertEquals($this->cskhUserA->id, $foundOrder['created_by_user']['id']);
        $this->assertEquals($this->cskhUserA->name, $foundOrder['created_by_user']['name']);
        $this->assertEquals('cskh', $foundOrder['created_by_user']['role']);
    }
}
