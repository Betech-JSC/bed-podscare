<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class TenantAuthenticationTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $activeTenant;
    protected Tenant $pendingTenant;
    protected Tenant $suspendedTenant;
    protected User $activeUser;
    protected User $pendingUser;
    protected User $suspendedUser;
    protected User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Tenant đang hoạt động
        $this->activeTenant = Tenant::create([
            'code'   => 'tiem-active-' . uniqid(),
            'name'   => 'Tiệm Đang Chạy',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->activeUser = User::forceCreate([
            'tenant_id' => $this->activeTenant->id,
            'name'      => 'Chủ Tiệm Active',
            'email'     => 'active_' . uniqid() . '@tiem.vn',
            'phone'     => '0911' . rand(100000, 999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        // 2. Tenant chờ duyệt
        $this->pendingTenant = Tenant::create([
            'code'   => 'tiem-pending-' . uniqid(),
            'name'   => 'Tiệm Chờ Duyệt',
            'status' => 'pending',
            'plan'   => 'trial',
        ]);

        $this->pendingUser = User::forceCreate([
            'tenant_id' => $this->pendingTenant->id,
            'name'      => 'Chủ Tiệm Pending',
            'email'     => 'pending_' . uniqid() . '@tiem.vn',
            'phone'     => '0922' . rand(100000, 999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => false,
        ]);

        // 3. Tenant bị tạm khóa
        $this->suspendedTenant = Tenant::create([
            'code'   => 'tiem-suspended-' . uniqid(),
            'name'   => 'Tiệm Bị Khóa',
            'status' => 'suspended',
            'plan'   => 'standard',
        ]);

        $this->suspendedUser = User::forceCreate([
            'tenant_id' => $this->suspendedTenant->id,
            'name'      => 'Chủ Tiệm Suspended',
            'email'     => 'suspended_' . uniqid() . '@tiem.vn',
            'phone'     => '0933' . rand(100000, 999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        // 4. Super Admin nền tảng
        $this->superAdmin = User::forceCreate([
            'tenant_id' => null,
            'name'      => 'FIXO Platform Admin Test',
            'email'     => 'superadmin_' . uniqid() . '@fixo.com.vn',
            'phone'     => '0900' . rand(100000, 999999),
            'password'  => Hash::make('password123'),
            'role'      => 'super_admin',
            'is_active' => true,
        ]);
    }

    public function test_login_successful_with_valid_store_code(): void
    {
        $response = $this->postJson('/api/v1/auth/login', [
            'store_code' => $this->activeTenant->code,
            'login'      => $this->activeUser->email,
            'password'   => 'password123',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.role', 'admin')
            ->assertJsonPath('data.user.tenant_id', $this->activeTenant->id)
            ->assertJsonPath('data.user.tenant.code', $this->activeTenant->code)
            ->assertJsonPath('data.user.tenant.status', 'active');

        $this->assertNotEmpty($response->json('data.token'));
    }

    public function test_login_fails_when_store_code_does_not_exist(): void
    {
        $response = $this->postJson('/api/v1/auth/login', [
            'store_code' => 'non-existent-store-' . uniqid(),
            'login'      => $this->activeUser->email,
            'password'   => 'password123',
        ]);

        $response->assertStatus(404)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Gian hàng không tồn tại.');
    }

    public function test_login_rejected_for_pending_tenant(): void
    {
        $response = $this->postJson('/api/v1/auth/login', [
            'store_code' => $this->pendingTenant->code,
            'login'      => $this->pendingUser->email,
            'password'   => 'password123',
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Gian hàng đang chờ Super Admin phê duyệt.');
    }

    public function test_login_rejected_for_suspended_tenant(): void
    {
        $response = $this->postJson('/api/v1/auth/login', [
            'store_code' => $this->suspendedTenant->code,
            'login'      => $this->suspendedUser->email,
            'password'   => 'password123',
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Gian hàng đã bị tạm khóa. Vui lòng liên hệ hỗ trợ.');
    }

    public function test_super_admin_can_login_with_platform_context(): void
    {
        // 1. Đăng nhập với store_code = fixo-platform
        $response1 = $this->postJson('/api/v1/auth/login', [
            'store_code' => 'fixo-platform',
            'login'      => $this->superAdmin->email,
            'password'   => 'password123',
        ]);

        $response1->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.role', 'super_admin')
            ->assertJsonPath('data.user.tenant_id', null);

        // 2. Đăng nhập với store_code rỗng
        $response2 = $this->postJson('/api/v1/auth/login', [
            'login'    => $this->superAdmin->email,
            'password' => 'password123',
        ]);

        $response2->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.role', 'super_admin');
    }

    public function test_me_endpoint_returns_tenant_info(): void
    {
        $response = $this->actingAs($this->activeUser)
            ->getJson('/api/v1/auth/me');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant.code', $this->activeTenant->code)
            ->assertJsonPath('data.tenant.status', 'active');
    }

    public function test_public_tenant_registration_creates_pending_store_and_inactive_owner(): void
    {
        $storeCode = 'tiem-moi-' . uniqid();
        $response = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $storeCode,
            'store_name' => 'Cửa Hàng Sửa Chữa Mới',
            'owner_name' => 'Nguyễn Văn Chủ',
            'phone'      => '0988777666',
            'email'      => "chu_{$storeCode}@tiemmoi.vn",
            'password'   => 'password123',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant.code', $storeCode)
            ->assertJsonPath('data.tenant.status', 'pending')
            ->assertJsonPath('data.tenant.plan', 'trial');

        $this->assertDatabaseHas('tenants', [
            'code'   => $storeCode,
            'status' => 'pending',
            'plan'   => 'trial',
        ]);

        $this->assertDatabaseHas('users', [
            'email'     => "chu_{$storeCode}@tiemmoi.vn",
            'role'      => 'admin',
            'is_active' => false,
        ]);
    }

    public function test_tenant_registration_fails_on_duplicate_store_code(): void
    {
        $response = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $this->activeTenant->code, // Đã tồn tại
            'store_name' => 'Trùng Mã',
            'owner_name' => 'Nguyễn Trùng',
            'phone'      => '0988000111',
            'email'      => 'trung@tiem.vn',
            'password'   => 'password123',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['store_code']);
    }
}
