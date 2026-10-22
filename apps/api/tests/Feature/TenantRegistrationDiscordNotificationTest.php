<?php

namespace Tests\Feature;

use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class TenantRegistrationDiscordNotificationTest extends TestCase
{
    use DatabaseTransactions;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /**
     * Khi đăng ký gian hàng thành công và services.discord.webhook_url được cấu hình,
     * hệ thống gửi đúng 1 HTTP POST tới Discord Webhook với username = 'Fixo - Đăng Ký Mới'
     * và embeds[0]['fields'] chứa đầy đủ 5 trường:
     * Tên tiệm, Số điện thoại, Email, Gói cước, Thời gian đăng ký.
     */
    public function test_tenant_registration_sends_discord_webhook_with_all_5_required_fields(): void
    {
        $knownTime = Carbon::create(2026, 10, 21, 14, 30, 45, 'Asia/Ho_Chi_Minh');
        Carbon::setTestNow($knownTime);

        $webhookUrl = 'https://discord.com/api/webhooks/1496150188154683564/test-webhook-token';
        config(['services.discord.webhook_url' => $webhookUrl]);

        Http::fake([
            $webhookUrl => Http::response([], 204),
        ]);

        $storeCode = 'tiem-discord-' . uniqid();
        $storeName = 'Tiệm Sửa Chữa Fixo Sài Gòn';
        $phone = '0988123456';
        $email = "owner_{$storeCode}@fixo.vn";

        $response = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $storeCode,
            'store_name' => $storeName,
            'owner_name' => 'Nguyễn Văn Chủ Tiệm',
            'phone'      => $phone,
            'email'      => $email,
            'password'   => 'password123',
            'plan'       => 'pro',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant.code', $storeCode)
            ->assertJsonPath('data.tenant.plan', 'pro');

        Http::assertSentCount(1);

        Http::assertSent(function (Request $request) use ($webhookUrl, $storeName, $phone, $email) {
            if ($request->url() !== $webhookUrl || $request->method() !== 'POST') {
                return false;
            }

            $data = $request->data();
            if (($data['username'] ?? null) !== 'Fixo - Đăng Ký Mới') {
                return false;
            }

            $fields = collect($data['embeds'][0]['fields'] ?? [])->keyBy('name');

            return $fields->count() === 5
                && $fields->has('Tên tiệm')
                && $fields->get('Tên tiệm')['value'] === $storeName
                && $fields->has('Số điện thoại')
                && $fields->get('Số điện thoại')['value'] === $phone
                && $fields->has('Email')
                && $fields->get('Email')['value'] === $email
                && $fields->has('Gói cước')
                && $fields->get('Gói cước')['value'] === 'Chuyên nghiệp (Pro)'
                && $fields->has('Thời gian đăng ký')
                && $fields->get('Thời gian đăng ký')['value'] === '21/10/2026 14:30:45';
        });
    }

    /**
     * Khi Discord Webhook trả lỗi HTTP 500 hoặc ném ConnectionException,
     * API POST /api/v1/tenants/register vẫn trả về HTTP 201 Created thành công (fail-safe).
     */
    public function test_discord_webhook_failure_or_exception_does_not_break_tenant_registration(): void
    {
        $webhookUrl = 'https://discord.com/api/webhooks/1496150188154683564/test-webhook-token';
        config(['services.discord.webhook_url' => $webhookUrl]);

        // 1. Giả lập Discord trả về HTTP 500 Internal Server Error
        Http::fake([
            $webhookUrl => Http::response(['message' => 'Discord Internal Error'], 500),
        ]);

        $storeCode500 = 'tiem-err500-' . uniqid();
        $response500 = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $storeCode500,
            'store_name' => 'Tiệm FailSafe 500',
            'owner_name' => 'Chủ Tiệm 500',
            'phone'      => '0977' . rand(100000, 999999),
            'email'      => "err500_{$storeCode500}@fixo.vn",
            'password'   => 'password123',
            'plan'       => 'trial',
        ]);

        $response500->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant.code', $storeCode500);

        $this->assertDatabaseHas('tenants', [
            'code'   => $storeCode500,
            'status' => 'active',
        ]);

        // 2. Giả lập Discord bị timeout / ném ConnectionException
        Http::fake([
            $webhookUrl => fn () => throw new ConnectionException('Connection timed out'),
        ]);

        $storeCodeEx = 'tiem-ex-' . uniqid();
        $responseEx = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $storeCodeEx,
            'store_name' => 'Tiệm FailSafe Exception',
            'owner_name' => 'Chủ Tiệm Exception',
            'phone'      => '0966' . rand(100000, 999999),
            'email'      => "ex_{$storeCodeEx}@fixo.vn",
            'password'   => 'password123',
            'plan'       => 'standard',
        ]);

        $responseEx->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant.code', $storeCodeEx);

        $this->assertDatabaseHas('tenants', [
            'code'   => $storeCodeEx,
            'status' => 'active',
        ]);
    }

    /**
     * Khi services.discord.webhook_url rỗng hoặc null,
     * không có HTTP request nào gửi tới Discord và API vẫn trả về HTTP 201 Created.
     */
    public function test_empty_discord_webhook_url_skips_http_request_and_succeeds(): void
    {
        config(['services.discord.webhook_url' => null]);
        Http::fake();

        $storeCode = 'tiem-nowebhook-' . uniqid();
        $response = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $storeCode,
            'store_name' => 'Tiệm Không Cấu Hình Webhook',
            'owner_name' => 'Chủ Tiệm No Webhook',
            'phone'      => '0955' . rand(100000, 999999),
            'email'      => "nowebhook_{$storeCode}@fixo.vn",
            'password'   => 'password123',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant.code', $storeCode);

        Http::assertNothingSent();
    }
}
