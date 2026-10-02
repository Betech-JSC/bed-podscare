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
     * Case 1: Đăng ký tài khoản mới thành công nhận 14 ngày dùng thử (status active, expires_at = +14 days).
     */
    public function test_case_1_tenant_registration_creates_active_trial_with_14_days(): void
    {
        // Fix thời gian để kiểm tra ngày hết hạn chính xác
        $knownDate = Carbon::create(2026, 10, 2, 12, 0, 0);
        Carbon::setTestNow($knownDate);

        $storeCode = 'tiem-trial-' . uniqid();
        $response = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $storeCode,
            'store_name' => 'Cửa Hàng Thử Nghiệm 14 Ngày',
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

        $expectedExpiry = $knownDate->copy()->addDays(14)->toISOString();
        $this->assertEquals($expectedExpiry, $response->json('data.tenant.expires_at'));
        $this->assertEquals($expectedExpiry, $response->json('data.tenant.trial_ends_at'));

        $this->assertDatabaseHas('tenants', [
            'code'            => $storeCode,
            'status'          => 'active',
            'plan'            => 'trial',
            'current_plan_id' => 'trial',
        ]);

        $this->assertDatabaseHas('users', [
            'email'     => "chu_{$storeCode}@tiemmoi.vn",
            'role'      => 'admin',
            'is_active' => true,
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

        $expectedExpiry = $knownDate->copy()->addDays(14)->toISOString();
        $this->assertEquals($expectedExpiry, $response->json('data.tenant.expires_at'));

        $this->assertDatabaseHas('tenants', [
            'code'          => $storeCode,
            'status'        => 'active',
            'plan'          => 'standard',
            'intended_plan' => 'standard',
        ]);

        Carbon::setTestNow(); // Reset test time
    }
}
