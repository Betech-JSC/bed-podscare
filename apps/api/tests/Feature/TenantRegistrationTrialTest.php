<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class TenantRegistrationTrialTest extends TestCase
{
    use DatabaseTransactions;

    /**
     * Case 1: Đăng ký tài khoản mới thành công nhận 1 năm dùng thử (status active, expires_at = +1 year).
     */
    public function test_case_1_tenant_registration_creates_active_trial_with_3_months(): void
    {
        // Fix thời gian để kiểm tra ngày hết hạn chính xác
        $knownDate = Carbon::create(2026, 10, 2, 12, 0, 0);
        Carbon::setTestNow($knownDate);

        $storeCode = 'tiem-trial-' . uniqid();
        $response = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $storeCode,
            'store_name' => 'Cửa Hàng Thử Nghiệm 1 Năm',
            'owner_name' => 'Trần Văn Chủ',
            'phone'      => '0981' . rand(100000, 999999),
            'email'      => "chu_{$storeCode}@tiemmoi.vn",
            'password'   => 'password123',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant.code', $storeCode)
            ->assertJsonPath('data.tenant.status', 'active')
            ->assertJsonPath('data.tenant.plan', 'trial');

        $expectedExpiryCarbon = $knownDate->copy()->addYear();
        $expectedExpiry = $expectedExpiryCarbon->toISOString();
        $expectedDaysRemaining = (int) $knownDate->diffInDays($expectedExpiryCarbon, false);
        $this->assertEquals($expectedExpiry, $response->json('data.tenant.expires_at'));
        $this->assertEquals($expectedExpiry, $response->json('data.tenant.trial_ends_at'));
        $this->assertEquals($expectedDaysRemaining, $response->json('data.tenant.days_remaining'));
        $this->assertNotEmpty($response->json('data.token'));
        $this->assertNotEmpty($response->json('data.branch.id'));
        $this->assertEquals($response->json('data.branch.id'), $response->json('data.user.branch_id'));

        $this->assertDatabaseHas('tenants', [
            'code'            => $storeCode,
            'status'          => 'active',
            'plan'            => 'trial',
            'current_plan_id' => 'trial',
        ]);

        $this->assertDatabaseHas('branches', [
            'id'        => $response->json('data.branch.id'),
            'tenant_id' => $response->json('data.tenant.id'),
            'is_active' => true,
        ]);

        $this->assertDatabaseHas('users', [
            'email'     => "chu_{$storeCode}@tiemmoi.vn",
            'role'      => 'admin',
            'is_active' => true,
            'branch_id' => $response->json('data.branch.id'),
        ]);

        Carbon::setTestNow(); // Reset test time
    }

    /**
     * Case 2: Đăng ký với tham số gói được chọn trước (plan=standard).
     */
    public function test_case_2_tenant_registration_with_intended_plan_standard(): void
    {
        $knownDate = Carbon::create(2026, 10, 2, 12, 0, 0);
        Carbon::setTestNow($knownDate);

        $storeCode = 'tiem-std-' . uniqid();
        $response = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $storeCode,
            'store_name' => 'Cửa Hàng Standard Tech',
            'owner_name' => 'Lê Thị Standard',
            'phone'      => '0982' . rand(100000, 999999),
            'email'      => "std_{$storeCode}@tiemmoi.vn",
            'password'   => 'password123',
            'plan'       => 'standard',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant.code', $storeCode)
            ->assertJsonPath('data.tenant.status', 'active')
            ->assertJsonPath('data.tenant.plan', 'standard')
            ->assertJsonPath('data.tenant.intended_plan', 'standard');

        $expectedExpiry = $knownDate->copy()->addYear()->toISOString();
        $this->assertEquals($expectedExpiry, $response->json('data.tenant.expires_at'));

        $this->assertDatabaseHas('tenants', [
            'code'          => $storeCode,
            'status'        => 'active',
            'plan'          => 'standard',
            'intended_plan' => 'standard',
        ]);

        Carbon::setTestNow(); // Reset test time
    }

    /**
     * Case 3: Đăng ký xong dùng ngay Bearer token trả về để gọi các API cần xác thực + ngữ cảnh tenant & branch,
     * đồng thời kiểm tra Super Admin nhìn thấy gian hàng mới với đầy đủ số lượng chi nhánh & nhân sự.
     */
    public function test_case_3_registered_tenant_can_immediately_call_protected_apis_and_appear_in_super_admin(): void
    {
        $storeCode = 'tiem-e2e-' . uniqid();
        $regResponse = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $storeCode,
            'store_name' => 'Tiệm E2E Tức Thì',
            'owner_name' => 'Hoàng Văn E2E',
            'phone'      => '0983' . rand(100000, 999999),
            'email'      => "e2e_{$storeCode}@tiemmoi.vn",
            'password'   => 'password123',
            'plan'       => 'pro',
        ]);

        $regResponse->assertStatus(201);
        $token = $regResponse->json('data.token');
        $tenantId = $regResponse->json('data.tenant.id');
        $branchId = $regResponse->json('data.branch.id');

        $headers = ['Authorization' => "Bearer {$token}"];

        // 1. Gọi ngay /api/v1/auth/me bằng token vừa cấp
        $meResponse = $this->withHeaders($headers)->getJson('/api/v1/auth/me');
        $meResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant_id', $tenantId)
            ->assertJsonPath('data.branch_id', $branchId)
            ->assertJsonPath('data.tenant.code', $storeCode)
            ->assertJsonPath('data.tenant.status', 'active');

        // 2. Gọi ngay /api/v1/saas/current để kiểm tra hạn mức gói cước
        $saasResponse = $this->withHeaders($headers)->getJson('/api/v1/saas/current');
        $saasResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant.code', $storeCode)
            ->assertJsonPath('data.usage.branches.used', 1)
            ->assertJsonPath('data.usage.users.used', 1)
            ->assertJsonPath('data.usage.subscription.is_active', true);

        // 3. Tạo khách hàng mới thuộc gian hàng ngay lập tức
        $customerResponse = $this->withHeaders($headers)->postJson('/api/v1/customers', [
            'name'  => 'Khách Hàng Đầu Tiên',
            'phone' => '0919' . rand(100000, 999999),
        ]);
        $customerResponse->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant_id', $tenantId);

        // 4. Kiểm tra trang Super Admin danh sách cửa hàng hiển thị đúng gian hàng mới
        $superAdmin = User::forceCreate([
            'tenant_id' => null,
            'name'      => 'Super Admin Verifier',
            'email'     => 'sa_verifier_' . uniqid() . '@fixo.com.vn',
            'phone'     => '0909' . rand(100000, 999999),
            'password'  => bcrypt('password123'),
            'role'      => 'super_admin',
            'is_active' => true,
        ]);

        $storesResponse = $this->actingAs($superAdmin, 'sanctum')
            ->getJson("/api/v1/platform/stores?search={$storeCode}");

        $storesResponse->assertStatus(200)
            ->assertJsonPath('success', true);

        $matchedStore = collect($storesResponse->json('data.data'))->firstWhere('code', $storeCode);
        $this->assertNotNull($matchedStore);
        $this->assertEquals('active', $matchedStore['status']);
        $this->assertEquals(1, $matchedStore['branches_count']);
        $this->assertEquals(1, $matchedStore['users_count']);
    }
}

