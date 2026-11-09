<?php

namespace Tests\Feature\Threads;

use App\Models\ThreadsAccount;
use App\Models\ThreadsPost;
use App\Models\ThreadsPublishLog;
use App\Services\Threads\ThreadsTokenCipher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

class ThreadsAccountAndOAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        putenv('DB_CONNECTION=sqlite');
        putenv('DB_DATABASE=:memory:');
        $_ENV['DB_CONNECTION'] = 'sqlite';
        $_ENV['DB_DATABASE'] = ':memory:';
        $_SERVER['DB_CONNECTION'] = 'sqlite';
        $_SERVER['DB_DATABASE'] = ':memory:';

        parent::setUp();
    }

    public function test_aes_256_gcm_cipher_encrypts_decrypts_and_detects_tampering(): void
    {
        $plainToken = 'THQVJ_super_secret_long_lived_threads_token_1234567890';
        $encrypted = ThreadsTokenCipher::encrypt($plainToken);

        $this->assertNotSame($plainToken, $encrypted);
        $this->assertStringNotContainsString($plainToken, $encrypted);

        $rawBytes = base64_decode($encrypted, true);
        $this->assertNotFalse($rawBytes);
        // 12-byte IV + 16-byte Tag + Ciphertext length
        $this->assertGreaterThan(28, strlen($rawBytes));

        $decrypted = ThreadsTokenCipher::decrypt($encrypted);
        $this->assertSame($plainToken, $decrypted);

        // Giả mạo 1 byte trong Authentication Tag / Ciphertext -> Bắt buộc ném ngoại lệ
        $tamperedBytes = $rawBytes;
        $tamperedBytes[15] = $tamperedBytes[15] ^ "\xFF";
        $tamperedPayload = base64_encode($tamperedBytes);

        $this->expectException(RuntimeException::class);
        ThreadsTokenCipher::decrypt($tamperedPayload);
    }

    public function test_token_cipher_redacts_tokens_and_secrets_recursively(): void
    {
        $rawPayload = [
            'endpoint' => 'https://graph.threads.net/access_token?grant_type=th_exchange_token&access_token=THQVJ_RAW_SECRET_999&client_secret=APP_SECRET_888',
            'access_token' => 'THQVJ_RAW_SECRET_999',
            'client_secret' => 'APP_SECRET_888',
            'nested' => [
                'authorization' => 'Bearer THQVJ_RAW_SECRET_999',
                'raw_json' => '{"access_token":"THQVJ_RAW_SECRET_999","id":"123"}',
            ],
        ];

        $redacted = ThreadsTokenCipher::redact($rawPayload);

        $encoded = json_encode($redacted);
        $this->assertIsString($encoded);
        $this->assertStringNotContainsString('THQVJ_RAW_SECRET_999', $encoded);
        $this->assertStringNotContainsString('APP_SECRET_888', $encoded);
        $this->assertSame('[REDACTED_TOKEN]', $redacted['access_token']);
        $this->assertSame('[REDACTED_TOKEN]', $redacted['client_secret']);
        $this->assertStringContainsString('access_token=[REDACTED_TOKEN]', $redacted['endpoint']);
        $this->assertStringContainsString('client_secret=[REDACTED_TOKEN]', $redacted['endpoint']);
    }

    public function test_accounts_api_lists_20_accounts_with_published_today_count_and_hides_encrypted_tokens(): void
    {
        $rawSecret = 'THQVJ_DO_NOT_LEAK_IN_JSON_RESPONSE_777';

        $createRes = $this->postJson('/api/v1/threads/accounts', [
            'display_name' => 'PodsCare Official 01',
            'username' => '@podscare.vn',
            'threads_user_id' => '25000001',
            'app_group' => 'primary_dev_app',
            'daily_post_cap' => 8,
            'access_token' => $rawSecret,
            'notes' => 'Tài khoản thương hiệu chính',
        ]);

        $createRes->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.display_name', 'PodsCare Official 01')
            ->assertJsonPath('data.username', 'podscare.vn')
            ->assertJsonPath('data.app_group', 'primary_dev_app')
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.has_access_token', true)
            ->assertJsonMissing(['access_token_encrypted'])
            ->assertDontSee($rawSecret);

        $accountId = (int) $createRes->json('data.id');
        $account = ThreadsAccount::findOrFail($accountId);
        $this->assertSame($rawSecret, $account->getAccessToken());

        // Tạo 2 bài đã đăng hôm nay và 1 bài đăng hôm qua
        ThreadsPost::create([
            'account_id' => $account->id,
            'content_text' => 'Bài đăng hôm nay #1',
            'status' => ThreadsPost::STATUS_PUBLISHED,
            'published_at' => now()->subMinutes(30),
        ]);
        ThreadsPost::create([
            'account_id' => $account->id,
            'content_text' => 'Bài đăng hôm nay #2',
            'status' => ThreadsPost::STATUS_PUBLISHED,
            'published_at' => now()->subMinutes(10),
        ]);
        ThreadsPost::create([
            'account_id' => $account->id,
            'content_text' => 'Bài đăng hôm qua',
            'status' => ThreadsPost::STATUS_PUBLISHED,
            'published_at' => now()->subDays(2),
        ]);

        $listRes = $this->getJson('/api/v1/threads/accounts');
        $listRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.0.id', $accountId)
            ->assertJsonPath('data.0.published_today_count', 2)
            ->assertJsonMissing(['access_token_encrypted'])
            ->assertDontSee($rawSecret);

        // Kiểm tra toggle-status: active -> paused -> active
        $togglePaused = $this->postJson("/api/v1/threads/accounts/{$accountId}/toggle-status");
        $togglePaused->assertStatus(200)
            ->assertJsonPath('data.status', 'paused');

        $toggleActive = $this->postJson("/api/v1/threads/accounts/{$accountId}/toggle-status");
        $toggleActive->assertStatus(200)
            ->assertJsonPath('data.status', 'active');
    }

    public function test_enforces_maximum_20_company_accounts_limit(): void
    {
        for ($i = 1; $i <= 20; $i++) {
            ThreadsAccount::create([
                'display_name' => sprintf('PodsCare Network #%02d', $i),
                'username' => sprintf('podscare.net.%02d', $i),
                'app_group' => 'primary_dev_app',
                'status' => ThreadsAccount::STATUS_NEEDS_REAUTH,
            ]);
        }

        $overflowRes = $this->postJson('/api/v1/threads/accounts', [
            'display_name' => 'PodsCare Network #21',
            'username' => 'podscare.net.21',
        ]);

        $overflowRes->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_oauth_authorize_url_and_callback_exchanges_long_lived_token_and_redacts_logs(): void
    {
        $account = ThreadsAccount::create([
            'display_name' => 'PodsCare Studio 02',
            'app_group' => 'primary_dev_app',
            'status' => ThreadsAccount::STATUS_NEEDS_REAUTH,
        ]);

        // 1. Lấy Authorize URL kèm state
        $authUrlRes = $this->getJson("/api/v1/threads/accounts/{$account->id}/authorize-url");
        $authUrlRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.account_id', $account->id);

        $state = (string) $authUrlRes->json('data.state');
        $authorizeUrl = (string) $authUrlRes->json('data.authorize_url');
        $this->assertNotEmpty($state);
        $this->assertStringContainsString('https://threads.net/oauth/authorize', $authorizeUrl);
        $this->assertStringContainsString('threads_basic%2Cthreads_content_publish', $authorizeUrl);

        // 2. Callback với state giả mạo phải bị chặn CSRF (422)
        $badStateRes = $this->getJson('/api/v1/threads/oauth/callback?code=AUTH_CODE_123&state=FORGED_STATE');
        $badStateRes->assertStatus(422)
            ->assertJsonPath('success', false);

        // 3. Callback với code & state hợp lệ -> Đổi short-lived -> long-lived 60 ngày -> đồng bộ /v1.0/me
        $shortSecretToken = 'TH_SHORT_LIVED_SECRET_TOKEN_111';
        $longSecretToken = 'TH_LONG_LIVED_60_DAYS_SECRET_TOKEN_222';

        Http::fake([
            'https://graph.threads.net/oauth/access_token*' => Http::response([
                'access_token' => $shortSecretToken,
                'user_id' => '9988776655',
            ], 200),
            'https://graph.threads.net/access_token*' => Http::response([
                'access_token' => $longSecretToken,
                'token_type' => 'bearer',
                'expires_in' => 5184000,
            ], 200),
            'https://graph.threads.net/v1.0/me*' => Http::response([
                'id' => '9988776655',
                'username' => 'podscare.studio02',
                'name' => 'PodsCare Studio 02',
            ], 200),
        ]);

        $callbackRes = $this->getJson("/api/v1/threads/oauth/callback?code=VALID_OAUTH_CODE&state={$state}");
        $callbackRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.threads_user_id', '9988776655')
            ->assertJsonPath('data.username', 'podscare.studio02')
            ->assertJsonMissing(['access_token_encrypted'])
            ->assertDontSee($shortSecretToken)
            ->assertDontSee($longSecretToken);

        // 4. Chống OAuth State Replay Attack: gọi lại callback lần 2 với cùng state đã dùng phải bị chặn 422 (nhờ Cache::pull)
        $replayRes = $this->getJson("/api/v1/threads/oauth/callback?code=VALID_OAUTH_CODE&state={$state}");
        $replayRes->assertStatus(422)
            ->assertJsonPath('success', false);

        $account->refresh();
        $this->assertSame('active', $account->status);
        $this->assertSame($longSecretToken, $account->getAccessToken());
        $this->assertNotNull($account->token_expires_at);
        $this->assertTrue($account->token_expires_at->gt(now()->addDays(58)));

        // Kiểm tra threads_publish_logs có ghi nhận oauth_exchange & token_refresh và đã redact 100% token
        $logs = ThreadsPublishLog::where('account_id', $account->id)->get();
        $this->assertGreaterThanOrEqual(2, $logs->count());
        $this->assertTrue($logs->contains('action', ThreadsPublishLog::ACTION_OAUTH_EXCHANGE));
        $this->assertTrue($logs->contains('action', ThreadsPublishLog::ACTION_TOKEN_REFRESH));

        foreach ($logs as $log) {
            $rawLogJson = json_encode([$log->request_payload, $log->response_payload]);
            $this->assertIsString($rawLogJson);
            $this->assertStringNotContainsString($shortSecretToken, $rawLogJson);
            $this->assertStringNotContainsString($longSecretToken, $rawLogJson);
        }
    }

    public function test_refresh_threads_tokens_command_renews_expiring_tokens_and_marks_failed_as_needs_reauth(): void
    {
        // Tài khoản 1: Còn 5 ngày (< 14 ngày) -> Gia hạn thành công
        $expiringAccount = ThreadsAccount::create([
            'display_name' => 'PodsCare Expiring Soon',
            'username' => 'podscare.expiring',
            'threads_user_id' => '10001',
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'access_token' => 'OLD_TOKEN_EXPIRING_10001',
            'token_expires_at' => now()->addDays(5),
        ]);

        // Tài khoản 2: Còn 10 ngày (< 14 ngày) nhưng bị Meta trả lỗi 401 -> Chuyển sang needs_reauth
        $revokedAccount = ThreadsAccount::create([
            'display_name' => 'PodsCare Revoked Token',
            'username' => 'podscare.revoked',
            'threads_user_id' => '10002',
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'access_token' => 'OLD_TOKEN_REVOKED_10002',
            'token_expires_at' => now()->addDays(10),
        ]);

        // Tài khoản 3: Còn 45 ngày (> 14 ngày) -> Không cần gọi API làm mới
        $healthyAccount = ThreadsAccount::create([
            'display_name' => 'PodsCare Healthy Token',
            'username' => 'podscare.healthy',
            'threads_user_id' => '10003',
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'access_token' => 'HEALTHY_TOKEN_10003',
            'token_expires_at' => now()->addDays(45),
        ]);

        Http::fake(function ($request) {
            $url = $request->url();
            if (str_contains($url, 'OLD_TOKEN_EXPIRING_10001')) {
                return Http::response([
                    'access_token' => 'NEW_REFRESHED_60D_TOKEN_10001',
                    'token_type' => 'bearer',
                    'expires_in' => 5184000,
                ], 200);
            }

            if (str_contains($url, 'OLD_TOKEN_REVOKED_10002')) {
                return Http::response([
                    'error' => [
                        'message' => 'Error validating access token: Session has been invalidated with access_token=OLD_TOKEN_REVOKED_10002',
                        'type' => 'OAuthException',
                        'code' => 190,
                    ],
                ], 401);
            }

            return Http::response(['ok' => true], 200);
        });

        $this->artisan('threads:refresh-tokens')
            ->assertExitCode(0);

        $expiringAccount->refresh();
        $this->assertSame(ThreadsAccount::STATUS_ACTIVE, $expiringAccount->status);
        $this->assertSame('NEW_REFRESHED_60D_TOKEN_10001', $expiringAccount->getAccessToken());
        $this->assertTrue($expiringAccount->token_expires_at->gt(now()->addDays(58)));
        $this->assertNotNull($expiringAccount->last_refreshed_at);

        $revokedAccount->refresh();
        $this->assertSame(ThreadsAccount::STATUS_NEEDS_REAUTH, $revokedAccount->status);
        $this->assertNotNull($revokedAccount->last_error_message);
        $this->assertStringNotContainsString('OLD_TOKEN_REVOKED_10002', (string) $revokedAccount->last_error_message);
        $this->assertStringContainsString('[REDACTED_TOKEN]', (string) $revokedAccount->last_error_message);

        $healthyAccount->refresh();
        $this->assertSame('HEALTHY_TOKEN_10003', $healthyAccount->getAccessToken());
    }

    public function test_refresh_token_now_endpoint_and_toggle_status_guard_handle_real_account_token_errors(): void
    {
        // 1. Tài khoản vừa tạo chưa kết nối OAuth (chưa có token) -> Bấm Kích hoạt hoặc Làm mới Token đều phải trả 422
        $unlinkedAccount = ThreadsAccount::create([
            'display_name' => 'PodsCare Unlinked Channel',
            'username' => 'podscare.unlinked',
            'app_group' => 'primary_dev_app',
            'status' => ThreadsAccount::STATUS_NEEDS_REAUTH,
        ]);

        $toggleUnlinkedRes = $this->postJson("/api/v1/threads/accounts/{$unlinkedAccount->id}/toggle-status");
        $toggleUnlinkedRes->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error_code', 'ACCOUNT_NEEDS_REAUTH')
            ->assertJsonPath('errors.account.status', 'needs_reauth');

        $refreshUnlinkedRes = $this->postJson("/api/v1/threads/accounts/{$unlinkedAccount->id}/refresh-token");
        $refreshUnlinkedRes->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error_code', 'THREADS_TOKEN_REFRESH_FAILED')
            ->assertJsonPath('errors.account.status', 'needs_reauth');

        // 2. Tài khoản có token nhưng khi gọi POST /refresh-token bị Meta trả về lỗi 401 OAuthException 190
        $expiredSecret = 'THQVJ_EXPIRED_LIVE_TOKEN_998877';
        $liveAccount = ThreadsAccount::create([
            'display_name' => 'PodsCare Live Channel',
            'username' => 'podscare.live',
            'threads_user_id' => '90001',
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'access_token' => $expiredSecret,
            'token_expires_at' => now()->addDays(3),
        ]);

        Http::fake([
            'https://graph.threads.net/refresh_access_token*' => Http::response([
                'error' => [
                    'message' => "Error validating access token: Session has expired for token {$expiredSecret}",
                    'type' => 'OAuthException',
                    'code' => 190,
                ],
            ], 401),
        ]);

        $refreshFailRes = $this->postJson("/api/v1/threads/accounts/{$liveAccount->id}/refresh-token");
        $refreshFailRes->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error_code', 'THREADS_TOKEN_REFRESH_FAILED')
            ->assertJsonPath('errors.account.status', 'needs_reauth')
            ->assertDontSee($expiredSecret);

        $liveAccount->refresh();
        $this->assertSame(ThreadsAccount::STATUS_NEEDS_REAUTH, $liveAccount->status);
        $this->assertStringContainsString('[REDACTED_TOKEN]', (string) $liveAccount->last_error_message);
        $this->assertStringNotContainsString($expiredSecret, (string) $liveAccount->last_error_message);
    }
}
