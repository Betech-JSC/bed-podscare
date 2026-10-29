<?php

namespace Tests\Feature;

use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;
use App\Services\QuotaService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class TenantRegistrationTrialTest extends TestCase
{
    use DatabaseTransactions;

    protected function clearTenantRegistrationRateLimiter(string $ip = '127.0.0.1'): void
    {
        RateLimiter::clear(md5('tenant-registration' . $ip));
        RateLimiter::clear('tenant-registration:' . $ip);
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->clearTenantRegistrationRateLimiter();
        Mail::fake();
        Http::fake();
    }

    protected function tearDown(): void
    {
        $this->clearTenantRegistrationRateLimiter();
        Carbon::setTestNow();
        parent::tearDown();
    }

    /**
     * Case 1: Đăng ký tài khoản mới (không truyền plan) được cấp thẳng Gói Chuyên Nghiệp (pro) miễn phí 1 năm đầu.
     */
    public function test_case_1_tenant_registration_creates_active_trial_with_3_months(): void
    {
        // Fix thời gian để kiểm tra ngày hết hạn chính xác
        $knownDate = Carbon::create(2026, 10, 2, 12, 0, 0);
        Carbon::setTestNow($knownDate);

        $storeCode = 'tiem-pro-default-' . uniqid();
        $response = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $storeCode,
            'store_name' => 'Cửa Hàng Chuyên Nghiệp 1 Năm',
            'owner_name' => 'Trần Văn Chủ',
            'phone'      => '0981' . rand(100000, 999999),
            'email'      => "chu_{$storeCode}@tiemmoi.vn",
            'password'   => 'password123',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant.code', $storeCode)
            ->assertJsonPath('data.tenant.status', 'active')
            ->assertJsonPath('data.tenant.plan', 'pro')
            ->assertJsonPath('data.tenant.current_plan_id', 'pro')
            ->assertJsonPath('data.tenant.intended_plan', 'pro');

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
            'plan'            => 'pro',
            'current_plan_id' => 'pro',
            'intended_plan'   => 'pro',
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
     * Case 2: Đăng ký với tham số gói được chọn trước (plan=standard) vẫn được cấp thẳng gói pro miễn phí 1 năm đầu,
     * đồng thời lưu intended_plan=standard để tương thích ngược.
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
            ->assertJsonPath('data.tenant.plan', 'pro')
            ->assertJsonPath('data.tenant.current_plan_id', 'pro')
            ->assertJsonPath('data.tenant.intended_plan', 'standard');

        $expectedExpiry = $knownDate->copy()->addYear()->toISOString();
        $this->assertEquals($expectedExpiry, $response->json('data.tenant.expires_at'));

        $this->assertDatabaseHas('tenants', [
            'code'            => $storeCode,
            'status'          => 'active',
            'plan'            => 'pro',
            'current_plan_id' => 'pro',
            'intended_plan'   => 'standard',
        ]);

        Carbon::setTestNow(); // Reset test time
    }

    /**
     * Case 3: Đăng ký xong dùng ngay Bearer token trả về để gọi các API cần xác thực + ngữ cảnh tenant & branch,
     * kiểm tra /api/v1/saas/current trả về gói pro Unlimited, đồng thời kiểm tra Super Admin nhìn thấy gian hàng mới.
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
            ->assertJsonPath('data.tenant.status', 'active')
            ->assertJsonPath('data.tenant.plan', 'pro');

        // 2. Gọi ngay /api/v1/saas/current để kiểm tra hạn mức gói cước Pro Không Giới Hạn
        $saasResponse = $this->withHeaders($headers)->getJson('/api/v1/saas/current');
        $saasResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant.code', $storeCode)
            ->assertJsonPath('data.tenant.plan', 'pro')
            ->assertJsonPath('data.usage.branches.used', 1)
            ->assertJsonPath('data.usage.branches.unlimited', true)
            ->assertJsonPath('data.usage.users.used', 1)
            ->assertJsonPath('data.usage.users.unlimited', true)
            ->assertJsonPath('data.usage.orders.unlimited', true)
            ->assertJsonPath('data.usage.subscription.plan_id', 'pro')
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
        $this->assertEquals('pro', $matchedStore['plan']);
        $this->assertEquals(1, $matchedStore['branches_count']);
        $this->assertEquals(1, $matchedStore['users_count']);
    }

    /**
     * Case 4: Đăng ký gian hàng mới (không truyền plan, truyền plan=trial, hoặc truyền plan=pro)
     * đều được cấp gói pro (status=active, hạn 1 năm) và tạo được > 2 nhân viên (tổng 4 users)
     * cùng chi nhánh thứ 2 & thứ 3 mà KHÔNG bị chặn bởi QuotaExceededException.
     */
    public function test_case_4_all_registration_variants_grant_pro_1_year_and_allow_unlimited_users_and_branches(): void
    {
        $knownDate = Carbon::create(2026, 10, 29, 10, 0, 0);
        Carbon::setTestNow($knownDate);

        $variants = [
            'omitted' => null,
            'trial'   => 'trial',
            'pro'     => 'pro',
        ];

        $variantIndex = 0;
        foreach ($variants as $label => $planInput) {
            $variantIndex++;
            $this->clearTenantRegistrationRateLimiter();

            $storeCode = "tiem-pro-{$label}-" . strtolower(substr(uniqid(), -6));
            $payload = [
                'store_code' => $storeCode,
                'store_name' => "Tiệm Pro Variant {$label}",
                'owner_name' => "Chủ Tiệm {$label}",
                'phone'      => '097' . $variantIndex . rand(100000, 999999),
                'email'      => "owner_{$storeCode}@tiemmoi.vn",
                'password'   => 'password123',
            ];

            if ($planInput !== null) {
                $payload['plan'] = $planInput;
            }

            $regRes = $this->postJson('/api/v1/tenants/register', $payload);

            $regRes->assertStatus(201)
                ->assertJsonPath('success', true)
                ->assertJsonPath('data.tenant.status', 'active')
                ->assertJsonPath('data.tenant.plan', 'pro')
                ->assertJsonPath('data.tenant.current_plan_id', 'pro')
                ->assertJsonPath('data.tenant.intended_plan', 'pro');

            $expectedExpiry = $knownDate->copy()->addYear()->toISOString();
            $this->assertSame($expectedExpiry, $regRes->json('data.tenant.expires_at'));
            $this->assertGreaterThanOrEqual(365, (int) $regRes->json('data.tenant.days_remaining'));

            $token = $regRes->json('data.token');
            $defaultBranchId = $regRes->json('data.branch.id');
            $headers = ['Authorization' => "Bearer {$token}"];

            // Reset auth guard giữa các lần lặp để đảm bảo dùng đúng Bearer token của gian hàng vừa tạo
            $this->app['auth']->forgetGuards();

            // 1. Tạo thêm chi nhánh thứ 2 và thứ 3 (tổng 3 chi nhánh > giới hạn gói trial=1 và standard=2)
            for ($b = 2; $b <= 3; $b++) {
                $branchRes = $this->withHeaders($headers)->postJson('/api/v1/branches', [
                    'code'    => strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $storeCode), -6)) . "-CN{$b}",
                    'name'    => "Chi nhánh {$b} ({$label})",
                    'address' => "Số {$b} Nguyễn Huệ, Quận 1",
                ]);

                $branchRes->assertStatus(201)
                    ->assertJsonPath('success', true);
            }

            // 2. Tạo thêm 3 nhân viên (tổng 4 users bao gồm chủ tiệm > giới hạn gói trial=2)
            for ($u = 1; $u <= 3; $u++) {
                $userRes = $this->withHeaders($headers)->postJson('/api/v1/users', [
                    'name'      => "Nhân Viên {$u} ({$label})",
                    'email'     => "staff_{$u}_{$storeCode}@tiemmoi.vn",
                    'password'  => 'password123',
                    'role'      => $u === 3 ? 'cskh' : 'technician',
                    'branch_id' => $defaultBranchId,
                ]);

                $userRes->assertStatus(201)
                    ->assertJsonPath('success', true);
            }
        }
    }

    /**
     * Case 5: QuotaService::resolvePlan đảm bảo fallback cho gói 'pro' trả về Không Giới Hạn (null)
     * kể cả khi bảng subscription_plans chưa seed bản ghi 'pro'.
     */
    public function test_case_5_quota_service_fallback_for_pro_when_subscription_plans_unseeded_is_unlimited(): void
    {
        // Gỡ liên kết khóa ngoại tạm thời trong transaction rồi xóa bản ghi 'pro' để mô phỏng DB chưa seed
        Tenant::query()->where('current_plan_id', 'pro')->update(['current_plan_id' => null]);
        SubscriptionPlan::query()->where('id', 'pro')->delete();
        QuotaService::clearCache();

        $tenant = Tenant::create([
            'code'          => 'tiem-unseeded-pro-' . uniqid(),
            'name'          => 'Tiệm Pro Chưa Seed Plans',
            'status'        => 'active',
            'plan'          => 'pro',
            'expires_at'    => now()->addYear(),
            'trial_ends_at' => now()->addYear(),
        ]);

        // Gán current_plan_id = 'pro' trên instance để kiểm tra cả trường hợp đọc từ current_plan_id lẫn plan
        $tenant->current_plan_id = 'pro';

        $quotaService = app(QuotaService::class);
        $resolvedPlan = $quotaService->resolvePlan($tenant);

        $this->assertSame('pro', $resolvedPlan->id);
        $this->assertSame('pro', $resolvedPlan->code);
        $this->assertSame('Gói Chuyên nghiệp', $resolvedPlan->name);
        $this->assertNull($resolvedPlan->max_branches);
        $this->assertNull($resolvedPlan->max_users);
        $this->assertNull($resolvedPlan->max_orders_per_month);

        $this->assertTrue($quotaService->canCreateBranch($tenant));
        $this->assertTrue($quotaService->canCreateUser($tenant));
        $this->assertTrue($quotaService->canCreateOrder($tenant));
    }
}

