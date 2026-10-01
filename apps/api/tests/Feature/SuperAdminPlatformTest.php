<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SuperAdminPlatformTest extends TestCase
{
    use DatabaseTransactions;

    protected User $superAdmin;
    protected User $regularAdmin;
    protected User $technician;
    protected Tenant $pendingTenant;
    protected User $pendingOwner;
    protected Tenant $activeTenant;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Super Admin
        $this->superAdmin = User::forceCreate([
            'tenant_id' => null,
            'name'      => 'Super Admin Test ' . uniqid(),
            'email'     => 'superadmin_' . uniqid() . '@fixo.com.vn',
            'phone'     => '0900' . rand(100000, 999999),
            'password'  => Hash::make('password123'),
            'role'      => 'super_admin',
            'is_active' => true,
        ]);

        // 2. Active Tenant & Regular Admin
        $this->activeTenant = Tenant::create([
            'code'   => 'tiem-hoat-dong-' . uniqid(),
            'name'   => 'Tiệm Hoạt Động',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->regularAdmin = User::forceCreate([
            'tenant_id' => $this->activeTenant->id,
            'name'      => 'Admin Tiệm',
            'email'     => 'admin_' . uniqid() . '@tiem.vn',
            'phone'     => '0911' . rand(100000, 999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->technician = User::forceCreate([
            'tenant_id' => $this->activeTenant->id,
            'name'      => 'KTV Tiệm',
            'email'     => 'ktv_' . uniqid() . '@tiem.vn',
            'phone'     => '0912' . rand(100000, 999999),
            'password'  => Hash::make('password123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        // 3. Pending Tenant & Owner
        $this->pendingTenant = Tenant::create([
            'code'   => 'tiem-cho-duyet-' . uniqid(),
            'name'   => 'Tiệm Chờ Duyệt',
            'status' => 'pending',
            'plan'   => 'trial',
        ]);

        $this->pendingOwner = User::forceCreate([
            'tenant_id' => $this->pendingTenant->id,
            'name'      => 'Chủ Tiệm Chờ Duyệt',
            'email'     => 'owner_' . uniqid() . '@choduyet.vn',
            'phone'     => '0922' . rand(100000, 999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => false,
        ]);
    }

    public function test_super_admin_can_access_dashboard_stats(): void
    {
        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/platform/dashboard-stats');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'data' => [
                    'total_tenants',
                    'active_tenants',
                    'pending_tenants',
                    'suspended_tenants',
                    'total_branches',
                    'total_repair_orders',
                ],
            ]);

        $this->assertGreaterThanOrEqual(1, $response->json('data.total_tenants'));
        $this->assertGreaterThanOrEqual(1, $response->json('data.pending_tenants'));
    }

    public function test_super_admin_can_list_and_search_stores(): void
    {
        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/platform/stores?status=pending');

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $storeCodes = collect($response->json('data.data'))->pluck('code');
        $this->assertTrue($storeCodes->contains($this->pendingTenant->code));

        // Test tìm kiếm
        $searchResponse = $this->actingAs($this->superAdmin)
            ->getJson("/api/v1/platform/stores?search={$this->activeTenant->code}");

        $searchResponse->assertStatus(200);
        $foundCodes = collect($searchResponse->json('data.data'))->pluck('code');
        $this->assertTrue($foundCodes->contains($this->activeTenant->code));
    }

    public function test_super_admin_can_approve_pending_store(): void
    {
        // 1. Phê duyệt gian hàng
        $response = $this->actingAs($this->superAdmin)
            ->postJson("/api/v1/platform/stores/{$this->pendingTenant->id}/approve");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'active');

        // 2. Xác nhận tenant chuyển sang active và có hạn dùng
        $this->pendingTenant->refresh();
        $this->assertEquals('active', $this->pendingTenant->status);
        $this->assertNotNull($this->pendingTenant->expires_at);

        // 3. Xác nhận chủ tiệm được kích hoạt
        $this->pendingOwner->refresh();
        $this->assertTrue((bool) $this->pendingOwner->is_active);

        // 4. Chủ tiệm có thể đăng nhập thành công
        $loginResponse = $this->postJson('/api/v1/auth/login', [
            'store_code' => $this->pendingTenant->code,
            'login'      => $this->pendingOwner->email,
            'password'   => 'password123',
        ]);

        $loginResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.role', 'admin');
    }

    public function test_super_admin_can_suspend_and_reactivate_store(): void
    {
        // 1. Tạm khóa gian hàng
        $suspendResponse = $this->actingAs($this->superAdmin)
            ->postJson("/api/v1/platform/stores/{$this->activeTenant->id}/suspend");

        $suspendResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'suspended');

        $this->activeTenant->refresh();
        $this->assertEquals('suspended', $this->activeTenant->status);

        // 2. Nhân sự bị chặn đăng nhập khi tenant bị suspended
        $blockedLogin = $this->postJson('/api/v1/auth/login', [
            'store_code' => $this->activeTenant->code,
            'login'      => $this->regularAdmin->email,
            'password'   => 'password123',
        ]);

        $blockedLogin->assertStatus(403)
            ->assertJsonPath('message', 'Gian hàng đã bị tạm khóa. Vui lòng liên hệ hỗ trợ.');

        // 3. Super Admin kích hoạt lại gian hàng
        $activateResponse = $this->actingAs($this->superAdmin)
            ->postJson("/api/v1/platform/stores/{$this->activeTenant->id}/activate");

        $activateResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'active');

        $this->activeTenant->refresh();
        $this->assertEquals('active', $this->activeTenant->status);

        // 4. Đăng nhập lại thành công
        $restoredLogin = $this->postJson('/api/v1/auth/login', [
            'store_code' => $this->activeTenant->code,
            'login'      => $this->regularAdmin->email,
            'password'   => 'password123',
        ]);

        $restoredLogin->assertStatus(200)
            ->assertJsonPath('success', true);
    }

    public function test_non_super_admin_cannot_access_platform_routes(): void
    {
        // 1. Admin tiệm thường bị từ chối
        $adminResponse = $this->actingAs($this->regularAdmin)
            ->getJson('/api/v1/platform/dashboard-stats');

        $adminResponse->assertStatus(403)
            ->assertJsonPath('message', 'Bạn không có quyền truy cập cổng quản trị nền tảng.');

        // 2. KTV bị từ chối
        $techResponse = $this->actingAs($this->technician)
            ->getJson('/api/v1/platform/stores');

        $techResponse->assertStatus(403);
    }

    public function test_unauthenticated_user_cannot_access_platform_routes(): void
    {
        $guestResponse = $this->getJson('/api/v1/platform/dashboard-stats');
        $guestResponse->assertStatus(401);
    }
}
