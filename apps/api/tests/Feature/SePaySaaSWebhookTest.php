<?php

namespace Tests\Feature;

use App\Models\SaasInvoice;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SePaySaaSWebhookTest extends TestCase
{
    use DatabaseTransactions;

    protected string $webhookSecret;

    protected function setUp(): void
    {
        parent::setUp();

        $this->webhookSecret = config('sepay.webhook_secret') ?? config('services.sepay.api_key') ?? 'fixo_secret_sepay_platform_2026';
    }

    private function createTenantWithOwner(string $plan = 'trial', ?\DateTimeInterface $expiresAt = null): array
    {
        $tenant = Tenant::create([
            'code'            => 'tenant_sepay_' . uniqid(),
            'name'            => 'Tiệm SePay ' . uniqid(),
            'status'          => 'active',
            'plan'            => $plan,
            'current_plan_id' => $plan,
            'expires_at'      => $expiresAt ?? now()->addDays(10),
            'trial_ends_at'   => $plan === 'trial' ? now()->addDays(10) : null,
        ]);

        $owner = User::forceCreate([
            'tenant_id' => $tenant->id,
            'name'      => 'Chủ Tiệm SePay',
            'email'     => 'owner_' . uniqid() . '@example.com',
            'phone'     => '095' . rand(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        return [$tenant, $owner];
    }

    /**
     * Case 9 (Unauthorized Webhook): Webhook gửi sai Secret bị từ chối HTTP 401.
     */
    public function test_case_9_unauthorized_webhook_returns_401(): void
    {
        // 1. Không gửi header
        $res1 = $this->postJson('/api/v1/webhooks/sepay', [
            'id'             => 'TXN_UNAUTH_1',
            'content'        => 'FIXSUB999',
            'transferAmount' => 299000,
        ]);
        $res1->assertStatus(401)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error', 'Unauthorized');

        // 2. Gửi sai Secret Key
        $res2 = $this->withHeaders([
            'SePay-Api-Key' => 'wrong_secret_key_123',
        ])->postJson('/api/v1/webhooks/sepay', [
            'id'             => 'TXN_UNAUTH_2',
            'content'        => 'FIXSUB999',
            'transferAmount' => 299000,
        ]);
        $res2->assertStatus(401);

        // 3. Endpoint alias /api/v1/saas/sepay/webhook cũng được bảo vệ 401
        $res3 = $this->postJson('/api/v1/saas/sepay/webhook', [
            'id' => 'TXN_UNAUTH_3',
        ]);
        $res3->assertStatus(401);
    }

    /**
     * Case 10 (Valid Webhook & Auto-Renewal): Webhook gửi mã FIXSUB... hợp lệ kích hoạt thành công.
     */
    public function test_case_10_valid_webhook_auto_renews_subscription(): void
    {
        $baseDate = Carbon::create(2026, 10, 2, 10, 0, 0);
        Carbon::setTestNow($baseDate);

        // Tenant còn 5 ngày bản quyền (hết hạn vào 2026-10-07)
        $initialExpiry = $baseDate->copy()->addDays(5);
        [$tenant, $owner] = $this->createTenantWithOwner('trial', $initialExpiry);

        $invoice = SaasInvoice::create([
            'tenant_id'      => $tenant->id,
            'plan_id'        => 'standard',
            'billing_cycle'  => 'monthly',
            'amount'         => 299000,
            'reference_code' => 'TMP_REF_' . uniqid(),
            'status'         => 'pending',
            'payment_method' => 'sepay_vietqr',
            'expires_at'     => now()->addMinutes(30),
        ]);

        $refCode = 'FIXSUB' . $invoice->id;
        $invoice->update(['reference_code' => $refCode]);

        $sepayTxnId = 'TXN_CASE_10_' . uniqid();

        // Gửi webhook thành công
        $response = $this->withHeaders([
            'SePay-Api-Key' => $this->webhookSecret,
        ])->postJson('/api/v1/webhooks/sepay', [
            'id'              => $sepayTxnId,
            'content'         => "Thanh toan don hang {$refCode} qua MB Bank",
            'transferAmount'  => 299000,
            'accountNumber'   => '0388960848',
            'gateway'         => 'MBBank',
            'transactionDate' => now()->toDateTimeString(),
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        // Kiểm tra hóa đơn đã chuyển thành paid
        $invoice->refresh();
        $this->assertEquals('paid', $invoice->status);
        $this->assertNotNull($invoice->paid_at);

        // Kiểm tra bảng sepay_transactions đã lưu vết
        $this->assertDatabaseHas('sepay_transactions', [
            'sepay_transaction_id' => $sepayTxnId,
            'saas_invoice_id'      => $invoice->id,
            'reference_code'       => $refCode,
            'amount'               => 299000,
        ]);

        // Kiểm tra tenant được gia hạn: +30 ngày tính từ ngày hết hạn hiện tại (2026-10-07 + 30 = 2026-11-06)
        $tenant->refresh();
        $this->assertEquals('standard', $tenant->plan);
        $this->assertEquals('standard', $tenant->current_plan_id);
        $this->assertEquals('active', $tenant->status);

        $expectedExpiry = $initialExpiry->copy()->addDays(30)->toISOString();
        $this->assertEquals($expectedExpiry, $tenant->expires_at->toISOString());

        Carbon::setTestNow();
    }

    /**
     * Case 11 (Idempotency Protection): Webhook gửi 2 lần cùng transaction_id không làm gia hạn đúp.
     */
    public function test_case_11_idempotency_protection_prevents_duplicate_extension(): void
    {
        $baseDate = Carbon::create(2026, 10, 2, 10, 0, 0);
        Carbon::setTestNow($baseDate);

        $initialExpiry = $baseDate->copy()->addDays(10);
        [$tenant, $owner] = $this->createTenantWithOwner('trial', $initialExpiry);

        $invoice = SaasInvoice::create([
            'tenant_id'      => $tenant->id,
            'plan_id'        => 'standard',
            'billing_cycle'  => 'monthly',
            'amount'         => 299000,
            'reference_code' => 'TMP_' . uniqid(),
            'status'         => 'pending',
        ]);
        $refCode = 'FIXSUB' . $invoice->id;
        $invoice->update(['reference_code' => $refCode]);

        $sepayTxnId = 'TXN_IDEMPOTENCY_11';

        $payload = [
            'id'             => $sepayTxnId,
            'content'        => "Chuyen khoan {$refCode}",
            'transferAmount' => 299000,
            'accountNumber'  => '0388960848',
        ];

        // Lần 1: Xử lý thành công
        $res1 = $this->withHeaders([
            'SePay-Api-Key' => $this->webhookSecret,
        ])->postJson('/api/v1/webhooks/sepay', $payload);

        $res1->assertStatus(200)
            ->assertJsonPath('success', true);

        $tenant->refresh();
        $firstExtendedDate = $tenant->expires_at->toISOString();

        // Lần 2: Gửi lại cùng transaction_id
        $res2 = $this->withHeaders([
            'SePay-Api-Key' => $this->webhookSecret,
        ])->postJson('/api/v1/webhooks/sepay', $payload);

        $res2->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'already_processed');

        // Kiểm tra tenant không bị gia hạn đúp lần 2
        $tenant->refresh();
        $this->assertEquals($firstExtendedDate, $tenant->expires_at->toISOString());

        Carbon::setTestNow();
    }

    /**
     * Case 12 (Invalid Content or Amount): Webhook sai số tiền hoặc sai cú pháp được ghi log an toàn.
     */
    public function test_case_12_invalid_content_or_amount_handled_safely(): void
    {
        [$tenant, $owner] = $this->createTenantWithOwner('trial', now()->addDays(5));

        $invoice = SaasInvoice::create([
            'tenant_id'      => $tenant->id,
            'plan_id'        => 'standard',
            'billing_cycle'  => 'monthly',
            'amount'         => 299000,
            'reference_code' => 'TMP_' . uniqid(),
            'status'         => 'pending',
        ]);
        $refCode = 'FIXSUB' . $invoice->id;
        $invoice->update(['reference_code' => $refCode]);

        // 12a: Thiếu tiền (chuyển 100.000đ thay vì 299.000đ)
        $resUnderpaid = $this->withHeaders([
            'SePay-Api-Key' => $this->webhookSecret,
        ])->postJson('/api/v1/webhooks/sepay', [
            'id'             => 'TXN_UNDERPAID_' . uniqid(),
            'content'        => "Thanh toan {$refCode}",
            'transferAmount' => 100000,
        ]);

        $resUnderpaid->assertStatus(422)
            ->assertJsonPath('error', 'Amount insufficient');

        // Hóa đơn vẫn pending, tenant chưa được nâng cấp
        $invoice->refresh();
        $this->assertEquals('pending', $invoice->status);
        $tenant->refresh();
        $this->assertEquals('trial', $tenant->plan);

        // 12b: Nội dung sai cú pháp (không có FIXSUB...)
        $unrecognizedTxId = 'TXN_UNRECOGNIZED_' . uniqid();
        $resUnrecognized = $this->withHeaders([
            'SePay-Api-Key' => $this->webhookSecret,
        ])->postJson('/api/v1/webhooks/sepay', [
            'id'             => $unrecognizedTxId,
            'content'        => 'Chuyen tien ung ho quy tu thien',
            'transferAmount' => 500000,
        ]);

        $resUnrecognized->assertStatus(200)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Unrecognized reference code');

        // Ghi log giao dịch sepay_transactions an toàn
        $this->assertDatabaseHas('sepay_transactions', [
            'sepay_transaction_id' => $unrecognizedTxId,
            'reference_code'       => 'UNRECOGNIZED',
        ]);
    }

    /**
     * Case 13 (Invoice Polling Endpoint): Endpoint trả về đúng trạng thái pending -> paid.
     */
    public function test_case_13_invoice_polling_status_lifecycle(): void
    {
        [$tenant, $owner] = $this->createTenantWithOwner('trial', now()->addDays(5));

        // 1. Tạo hóa đơn qua API subscribe
        $subRes = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/saas/subscribe', [
            'plan_id'       => 'standard',
            'billing_cycle' => 'monthly',
        ]);

        $subRes->assertStatus(201)
            ->assertJsonPath('success', true);

        $refCode = $subRes->json('data.reference_code');
        $invoiceId = $subRes->json('data.invoice_id');
        $this->assertNotEmpty($refCode);

        // 2. Polling khi chưa thanh toán: status pending
        $pollPending = $this->actingAs($owner, 'sanctum')->getJson("/api/v1/saas/invoices/{$refCode}/status");
        $pollPending->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.reference_code', $refCode);

        // 3. Giả lập SePay gửi Webhook thành công
        $webhookRes = $this->withHeaders([
            'SePay-Api-Key' => $this->webhookSecret,
        ])->postJson('/api/v1/webhooks/sepay', [
            'id'             => 'TXN_POLL_' . uniqid(),
            'content'        => "Thanh toan {$refCode}",
            'transferAmount' => 299000,
        ]);
        $webhookRes->assertStatus(200);

        // 4. Polling sau khi thanh toán: status paid
        $pollPaid = $this->actingAs($owner, 'sanctum')->getJson("/api/v1/saas/invoices/{$refCode}/status");
        $pollPaid->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.plan', 'standard');
    }
}
