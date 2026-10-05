<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\SaasInvoice;
use App\Models\SepayTransaction;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PlatformBillingApiTest extends TestCase
{
    use DatabaseTransactions;

    protected User $superAdmin;
    protected User $regularUser;
    protected Tenant $testTenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::forceCreate([
            'tenant_id' => null,
            'name'      => 'Super Admin Platform',
            'email'     => 'superadmin_billing_' . uniqid() . '@fixo.com.vn',
            'phone'     => '090' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'super_admin',
            'is_active' => true,
        ]);

        $this->testTenant = Tenant::create([
            'code'            => 'tenant_billing_' . uniqid(),
            'name'            => 'Gian Hàng Test Billing',
            'status'          => 'active',
            'plan'            => 'standard',
            'current_plan_id' => 'standard',
            'expires_at'      => now()->addDays(5),
        ]);

        $this->regularUser = User::forceCreate([
            'tenant_id' => $this->testTenant->id,
            'name'      => 'Chủ Tiệm Thường',
            'email'     => 'owner_billing_' . uniqid() . '@example.com',
            'phone'     => '091' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);
    }

    /**
     * Test 1: Khách vãng lai chưa đăng nhập bị chặn 401 khi truy cập API platform billing.
     */
    public function test_unauthenticated_cannot_access_platform_billing(): void
    {
        $response = $this->getJson('/api/v1/platform/billing-stats');
        $response->assertStatus(401);
    }

    /**
     * Test 2: User thông thường (không phải super_admin) bị từ chối 403.
     */
    public function test_non_super_admin_cannot_access_platform_billing(): void
    {
        $response = $this->actingAs($this->regularUser, 'sanctum')
            ->getJson('/api/v1/platform/billing-stats');

        $response->assertStatus(403);
    }

    /**
     * Test 3: Super Admin lấy số liệu billing stats (MRR, gian hàng sắp hết hạn).
     */
    public function test_super_admin_can_get_billing_stats(): void
    {
        $response = $this->actingAs($this->superAdmin, 'sanctum')
            ->getJson('/api/v1/platform/billing-stats');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'data' => [
                    'mrr',
                    'mrr_formatted',
                    'active_stores_count',
                    'total_stores_count',
                    'expiring_soon_count',
                    'weekly_sepay_transactions_count',
                    'expiring_stores',
                ],
            ]);

        $this->assertGreaterThanOrEqual(1, $response->json('data.active_stores_count'));
    }

    /**
     * Test 4: Super Admin lấy danh sách lịch sử giao dịch SePay từ bảng saas_invoices.
     */
    public function test_super_admin_can_list_transactions(): void
    {
        $invoice = SaasInvoice::create([
            'tenant_id'      => $this->testTenant->id,
            'plan_id'        => 'standard',
            'billing_cycle'  => 'monthly',
            'amount'         => 299000,
            'reference_code' => 'FIXSUB_TEST_' . uniqid(),
            'status'         => 'paid',
            'payment_method' => 'sepay_vietqr',
            'paid_at'        => now(),
        ]);

        SepayTransaction::create([
            'sepay_transaction_id' => 'TXN_TEST_' . uniqid(),
            'saas_invoice_id'      => $invoice->id,
            'reference_code'       => $invoice->reference_code,
            'amount'               => 299000,
            'bank_brand'           => 'MBBank',
        ]);

        $response = $this->actingAs($this->superAdmin, 'sanctum')
            ->getJson('/api/v1/platform/transactions');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    'data' => [
                        '*' => [
                            'id',
                            'ref_code',
                            'store_code',
                            'store_name',
                            'plan_name',
                            'amount',
                            'status',
                        ],
                    ],
                ],
            ]);
    }

    /**
     * Test 5: Super Admin gửi thông báo nhắc phí duy trì gian hàng.
     */
    public function test_super_admin_can_send_fee_reminder(): void
    {
        $response = $this->actingAs($this->superAdmin, 'sanctum')
            ->postJson("/api/v1/platform/stores/{$this->testTenant->id}/remind-fee");

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertDatabaseHas('notifications', [
            'user_id'  => $this->regularUser->id,
            'type'     => 'fee_reminder',
            'severity' => 'warning',
        ]);
    }

    /**
     * Test 6: Super Admin gia hạn thời gian sử dụng gian hàng thành công (+30 ngày).
     */
    public function test_super_admin_can_renew_store(): void
    {
        $initialExpiry = $this->testTenant->expires_at;

        $response = $this->actingAs($this->superAdmin, 'sanctum')
            ->postJson("/api/v1/platform/stores/{$this->testTenant->id}/renew", [
                'days' => 30,
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->testTenant->refresh();
        $this->assertEquals(
            $initialExpiry->copy()->addDays(30)->toDateString(),
            $this->testTenant->expires_at->toDateString()
        );
    }

    /**
     * Test 7: Super Admin xem danh sách và cập nhật cấu hình gói cước (Plans).
     */
    public function test_super_admin_can_list_and_update_plans(): void
    {
        // 1. Lấy danh sách gói
        $resList = $this->actingAs($this->superAdmin, 'sanctum')
            ->getJson('/api/v1/platform/plans');

        $resList->assertStatus(200)
            ->assertJsonPath('success', true);
        $this->assertNotEmpty($resList->json('data'));

        // 2. Cập nhật gói standard
        $newPrice = 320000;
        $resUpdate = $this->actingAs($this->superAdmin, 'sanctum')
            ->putJson('/api/v1/platform/plans/standard', [
                'name'          => 'Gói Tiêu Chuẩn Pro',
                'price_monthly' => $newPrice,
            ]);

        $resUpdate->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.name', 'Gói Tiêu Chuẩn Pro');

        $plan = SubscriptionPlan::findOrFail('standard');
        $this->assertEquals($newPrice, (float) $plan->price_monthly);
    }

    /**
     * Test 8: Super Admin xem, lưu cấu hình và kiểm tra kết nối Live SePay.
     */
    public function test_super_admin_sepay_integration_apis(): void
    {
        // 1. Lấy cấu hình
        $resGet = $this->actingAs($this->superAdmin, 'sanctum')
            ->getJson('/api/v1/platform/integrations/sepay');

        $resGet->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    'bank_code',
                    'account_number',
                    'account_name',
                    'webhook_url',
                ],
            ]);

        // 2. Cập nhật cấu hình
        $resUpdate = $this->actingAs($this->superAdmin, 'sanctum')
            ->postJson('/api/v1/platform/integrations/sepay', [
                'bank_code'      => 'VCB',
                'account_number' => '9988776655',
                'account_name'   => 'CTY TNHH CONG NGHE FIXO',
            ]);

        $resUpdate->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.bank_code', 'VCB')
            ->assertJsonPath('data.account_number', '9988776655');

        // 3. Test kết nối
        $resTest = $this->actingAs($this->superAdmin, 'sanctum')
            ->postJson('/api/v1/platform/integrations/sepay/test-connection');

        $resTest->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.connected', true);
    }
}
