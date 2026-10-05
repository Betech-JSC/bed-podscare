<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthSecurityTest extends TestCase
{
    use DatabaseTransactions;

    /**
     * Test 1: Đảm bảo backdoor 'password123' bị từ chối 401 đối với tài khoản nhân viên / tenant thông thường.
     */
    public function test_backdoor_password123_is_rejected_for_regular_user(): void
    {
        $tenant = Tenant::create([
            'code'   => 'test_store_' . uniqid(),
            'name'   => 'Cửa hàng Kiểm thử Bảo mật',
            'status' => 'active',
            'plan'   => 'standard',
        ]);

        $realPassword = 'secure_secret_password_2026';
        $user = User::forceCreate([
            'tenant_id' => $tenant->id,
            'name'      => 'Kỹ Thuật Viên Test',
            'email'     => 'technician_' . uniqid() . '@example.com',
            'phone'     => '098' . rand(1000000, 9999999),
            'password'  => Hash::make($realPassword),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        // Cố gắng khai thác backdoor password123
        $response = $this->postJson('/api/v1/auth/login', [
            'store_code' => $tenant->code,
            'email'      => $user->email,
            'password'   => 'password123',
        ]);

        $response->assertStatus(401)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Email hoặc mật khẩu không chính xác.');
    }

    /**
     * Test 2: Đảm bảo backdoor 'password123' bị từ chối 401 đối với tài khoản Super Admin nền tảng.
     */
    public function test_backdoor_password123_is_rejected_for_super_admin(): void
    {
        $realPassword = 'super_secure_admin_password_2026';
        $superAdmin = User::forceCreate([
            'tenant_id' => null,
            'name'      => 'Super Admin Test',
            'email'     => 'superadmin_' . uniqid() . '@fixo.com.vn',
            'phone'     => '091' . rand(1000000, 9999999),
            'password'  => Hash::make($realPassword),
            'role'      => 'super_admin',
            'is_active' => true,
        ]);

        // Thử đăng nhập Super Admin bằng backdoor password123
        $response = $this->postJson('/api/v1/auth/login', [
            'email'    => $superAdmin->email,
            'password' => 'password123',
        ]);

        $response->assertStatus(401)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Email hoặc mật khẩu không chính xác.');
    }

    /**
     * Test 3: Đăng nhập với mật khẩu thật đã băm trong database thành công.
     */
    public function test_legitimate_credentials_login_succeeds(): void
    {
        $tenant = Tenant::create([
            'code'   => 'test_legit_' . uniqid(),
            'name'   => 'Cửa hàng Hợp lệ',
            'status' => 'active',
            'plan'   => 'standard',
        ]);

        $realPassword = 'my_real_password_123';
        $user = User::forceCreate([
            'tenant_id' => $tenant->id,
            'name'      => 'Nhân Viên Hợp Lệ',
            'email'     => 'legit_' . uniqid() . '@example.com',
            'phone'     => '097' . rand(1000000, 9999999),
            'password'  => Hash::make($realPassword),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'store_code' => $tenant->code,
            'email'      => $user->email,
            'password'   => $realPassword,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.email', $user->email)
            ->assertJsonPath('data.user.role', 'technician');

        $this->assertNotEmpty($response->json('data.token'));
    }

    /**
     * Test 4: Super Admin đăng nhập không cần store_code được cấp platform_token dựa trên role trong CSDL.
     */
    public function test_super_admin_resolves_via_database_role_without_store_code(): void
    {
        $realPassword = 'real_superadmin_password_999';
        $superAdmin = User::forceCreate([
            'tenant_id' => null,
            'name'      => 'Super Admin Động',
            'email'     => 'dynamic_superadmin_' . uniqid() . '@fixo.com.vn',
            'phone'     => '093' . rand(1000000, 9999999),
            'password'  => Hash::make($realPassword),
            'role'      => 'super_admin',
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email'    => $superAdmin->email,
            'password' => $realPassword,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.role', 'super_admin')
            ->assertJsonPath('data.user.tenant_id', null);

        $this->assertNotEmpty($response->json('data.token'));
    }

    /**
     * Test 5: Không thể bypass xác thực bằng bất kỳ mật khẩu ngẫu nhiên nào.
     */
    public function test_random_invalid_passwords_are_rejected(): void
    {
        $tenant = Tenant::create([
            'code'   => 'test_brute_' . uniqid(),
            'name'   => 'Cửa hàng Chống Brute',
            'status' => 'active',
            'plan'   => 'standard',
        ]);

        $user = User::forceCreate([
            'tenant_id' => $tenant->id,
            'name'      => 'Admin Tiệm',
            'email'     => 'admin_brute_' . uniqid() . '@example.com',
            'phone'     => '094' . rand(1000000, 9999999),
            'password'  => Hash::make('correct_password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $invalidPasswords = ['admin', '123456', 'password', 'root', 'qwerty'];

        foreach ($invalidPasswords as $badPass) {
            $response = $this->postJson('/api/v1/auth/login', [
                'store_code' => $tenant->code,
                'email'      => $user->email,
                'password'   => $badPass,
            ]);

            $response->assertStatus(401)
                ->assertJsonPath('success', false);
        }
    }
}
