<?php

namespace Tests\Feature\Threads;

use App\Models\ThreadsAccount;
use App\Models\ThreadsPost;
use App\Models\ThreadsPublishLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpClientRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ThreadsCsvImportAndPostApiTest extends TestCase
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

    /**
     * Khởi tạo mạng lưới 20 tài khoản Threads thuộc sở hữu công ty phục vụ kiểm thử.
     *
     * @return array<int, ThreadsAccount>
     */
    protected function seedTwentyCompanyAccounts(): array
    {
        $accounts = [];
        for ($i = 1; $i <= 20; $i++) {
            $status = ThreadsAccount::STATUS_ACTIVE;
            if ($i === 6 || $i === 12) {
                $status = ThreadsAccount::STATUS_NEEDS_REAUTH;
            } elseif ($i === 19 || $i === 20) {
                $status = ThreadsAccount::STATUS_PAUSED;
            }

            $account = new ThreadsAccount([
                'display_name'       => sprintf('PodsCare Official %02d', $i),
                'username'           => sprintf('podscare.acct%02d', $i),
                'threads_user_id'    => sprintf('254001928371%02d', $i),
                'app_group'          => 'primary_dev_app',
                'status'             => $status,
                'daily_post_cap'     => 8,
                'active_hours_start' => '08:00',
                'active_hours_end'   => '22:00',
                'quota_used_24h'     => 0,
                'quota_total_24h'    => 250,
            ]);

            if ($status === ThreadsAccount::STATUS_ACTIVE) {
                $account->setAccessToken("THQVJ_valid_token_for_account_{$i}_secret");
                $account->token_expires_at = now()->addDays(45);
                $account->last_refreshed_at = now()->subDays(15);
            }

            $account->save();
            $accounts[] = $account;
        }

        return $accounts;
    }

    public function test_csv_bulk_import_100_posts_across_20_accounts_with_random_jitter_and_no_second_collision(): void
    {
        $accounts = $this->seedTwentyCompanyAccounts();
        $this->assertCount(20, $accounts);

        $headers = 'account_username,content_text,media_type,media_urls,link_attachment,topic_tag,thread_group_key,reply_order,scheduled_at,is_sponsored,sponsored_suffix,client_ref';
        $lines = [$headers];

        for ($i = 1; $i <= 100; $i++) {
            $account = $accounts[($i - 1) % 20];
            $isSponsored = ($i % 5 === 0) ? '1' : '0';
            $suffix = ($i % 10 === 0) ? '#Sponsored' : '';
            $clientRef = $isSponsored === '1' ? sprintf('BRAND_CAMPAIGN_%03d', $i) : '';
            $text = sprintf(
                'Bản tin kỹ thuật độc lập số #%03d tại kênh %s: Đo kiểm áp suất buồng âm và hiệu chuẩn chống ồn ANC.',
                $i,
                $account->username
            );

            $lines[] = implode(',', [
                $account->username,
                '"' . $text . '"',
                'TEXT',
                '',
                '',
                'PodsCareLab',
                '',
                '0',
                '',
                $isSponsored,
                $suffix,
                $clientRef,
            ]);
        }

        $csvContent = implode("\n", $lines);
        $uploadedFile = UploadedFile::fake()->createWithContent('threads_100_posts.csv', $csvContent);

        $response = $this->postJson('/api/v1/threads/posts/import-csv', [
            'file'               => $uploadedFile,
            'jitter_min_minutes' => 3,
            'jitter_max_minutes' => 12,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.total_rows', 100)
            ->assertJsonPath('data.imported_count', 100)
            ->assertJsonPath('data.failed_count', 0);

        $batchId = $response->json('data.import_batch_id');
        $this->assertNotEmpty($batchId);

        $importedPosts = ThreadsPost::query()
            ->where('import_batch_id', $batchId)
            ->orderBy('id')
            ->get();

        $this->assertCount(100, $importedPosts);

        $scheduledTimestamps = [];
        foreach ($importedPosts as $post) {
            $this->assertNotNull($post->scheduled_at, "Bài gốc #{$post->id} phải được tự động tính scheduled_at.");
            $this->assertSame(ThreadsPost::STATUS_SCHEDULED, $post->status);

            // Kiểm tra giờ nằm trong khung active_hours (08:00 .. 22:00)
            $hourMinute = $post->scheduled_at->format('H:i');
            $this->assertGreaterThanOrEqual('08:00', $hourMinute);
            $this->assertLessThanOrEqual('22:00', $hourMinute);

            // Không tròn giây :00 (có Random Jitter + lệch pha)
            $tsKey = $post->scheduled_at->format('Y-m-d H:i:s');
            $scheduledTimestamps[] = $tsKey;
        }

        // Đảm bảo 100 bài có mốc giây (Y-m-d H:i:s) hoàn toàn phân biệt, không trùng khít giây nào
        $uniqueTimestamps = array_unique($scheduledTimestamps);
        $this->assertCount(100, $uniqueTimestamps);
    }

    public function test_csv_import_links_multi_post_thread_chains_and_handles_sponsored_option_c(): void
    {
        $accounts = $this->seedTwentyCompanyAccounts();
        $primaryAccount = $accounts[0];

        $csvLines = [
            'account_username,content_text,media_type,media_urls,link_attachment,topic_tag,thread_group_key,reply_order,scheduled_at,is_sponsored,sponsored_suffix,client_ref',
            // Chuỗi 1: Auto-chain (bài con reply_order=1 để trống scheduled_at -> giữ null)
            sprintf(
                '%s,"Chuỗi ANC Phần 1/2: Nguyên nhân tai nghe bị rò âm trầm.",TEXT,,,PodsCareLab,chain_anc_auto,0,,1,,CLIENT_PURE_C',
                $primaryAccount->username
            ),
            sprintf(
                '%s,"Chuỗi ANC Phần 2/2: Thay ron cao su khít buồng âm.",IMAGE,https://cdn.podscare.vn/threads/anc-seal.jpg,,PodsCareLab,chain_anc_auto,1,,1,,CLIENT_PURE_C',
                $primaryAccount->username
            ),
            // Chuỗi 2: Scheduled-chain (bài con có scheduled_at cụ thể) + có sponsored_suffix
            sprintf(
                '%s,"Đánh giá pin dung lượng chuẩn cho tai nghe không dây.",TEXT,,,AudioGear,chain_scheduled_02,0,2026-11-15 09:00:00,1,#Sponsored,CLIENT_TAG_C',
                $primaryAccount->username
            ),
            sprintf(
                '%s,"Biểu đồ nhiệt độ khi sạc nhanh không dây.",TEXT,,,AudioGear,chain_scheduled_02,1,2026-11-15 12:30:00,1,,CLIENT_TAG_C',
                $primaryAccount->username
            ),
        ];

        $response = $this->postJson('/api/v1/threads/posts/import-csv', [
            'csv_text' => implode("\n", $csvLines),
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.imported_count', 4)
            ->assertJsonPath('data.failed_count', 0);

        $autoRoot = ThreadsPost::query()
            ->where('thread_group_key', 'chain_anc_auto')
            ->where('reply_order', 0)
            ->firstOrFail();

        $autoChild = ThreadsPost::query()
            ->where('thread_group_key', 'chain_anc_auto')
            ->where('reply_order', 1)
            ->firstOrFail();

        $this->assertNull($autoRoot->reply_to_post_id);
        $this->assertNotNull($autoRoot->scheduled_at);
        $this->assertSame($autoRoot->id, $autoChild->reply_to_post_id);
        // Bài con để trống scheduled_at -> bắt buộc giữ null để chạy Auto-chain (30-60s sau bài cha)
        $this->assertNull($autoChild->scheduled_at);
        $this->assertTrue($autoChild->isAutoChainReply());

        // Kiểm chứng is_sponsored Cách C: khi sponsored_suffix rỗng, giữ nguyên 100% văn bản gốc
        $this->assertTrue($autoRoot->is_sponsored);
        $this->assertNull($autoRoot->sponsored_suffix);
        $this->assertSame('CLIENT_PURE_C', $autoRoot->client_ref);
        $this->assertSame('Chuỗi ANC Phần 1/2: Nguyên nhân tai nghe bị rò âm trầm.', $autoRoot->content_text);

        // Chuỗi 2: Bài con có scheduled_at cụ thể và bài gốc có #Sponsored
        $schedRoot = ThreadsPost::query()
            ->where('thread_group_key', 'chain_scheduled_02')
            ->where('reply_order', 0)
            ->firstOrFail();

        $schedChild = ThreadsPost::query()
            ->where('thread_group_key', 'chain_scheduled_02')
            ->where('reply_order', 1)
            ->firstOrFail();

        $this->assertSame($schedRoot->id, $schedChild->reply_to_post_id);
        $this->assertNotNull($schedChild->scheduled_at);
        $this->assertSame('2026-11-15 12:30:00', $schedChild->scheduled_at->format('Y-m-d H:i:s'));
        $this->assertTrue($schedRoot->is_sponsored);
        $this->assertSame('#Sponsored', $schedRoot->sponsored_suffix);
    }

    public function test_csv_import_and_post_creation_reject_over_500_chars_and_over_5_unique_links(): void
    {
        $accounts = $this->seedTwentyCompanyAccounts();
        $account = $accounts[0];

        $over500Text = str_repeat('Kiểm định giới hạn 500 ký tự UTF-8 trên Threads. ', 12); // > 500 ký tự

        // 1. Tạo bài vượt quá 500 ký tự qua POST /api/v1/threads/posts -> 422
        $resChar = $this->postJson('/api/v1/threads/posts', [
            'account_id'   => $account->id,
            'content_text' => $over500Text,
            'media_type'   => 'TEXT',
        ]);

        $resChar->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error_code', 'THREADS_VALIDATOR__CHAR_LIMIT_EXCEEDED');

        // 2. Tạo bài chứa 6 liên kết duy nhất -> 422 THREADS_API__LINK_LIMIT_EXCEEDED
        $sixLinksText = implode(' ', [
            'Tham khảo tài liệu:',
            'https://podscare.vn/link-1',
            'https://podscare.vn/link-2',
            'https://podscare.vn/link-3',
            'https://podscare.vn/link-4',
            'https://podscare.vn/link-5',
            'https://podscare.vn/link-6',
        ]);

        $resLinks = $this->postJson('/api/v1/threads/posts', [
            'account_id'   => $account->id,
            'content_text' => $sixLinksText,
            'media_type'   => 'TEXT',
        ]);

        $resLinks->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error_code', 'THREADS_API__LINK_LIMIT_EXCEEDED');

        // 3. Nhập CSV chứa dòng > 500 ký tự -> 422
        $invalidCsv = "account_username,content_text,media_type\n{$account->username},\"{$over500Text}\",TEXT";
        $resCsv = $this->postJson('/api/v1/threads/posts/import-csv', [
            'csv_text' => $invalidCsv,
        ]);

        $resCsv->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('data.failed_count', 1);
    }

    public function test_post_crud_multi_post_thread_workflow_and_publish_now_triggers_auto_chain(): void
    {
        $accounts = $this->seedTwentyCompanyAccounts();
        $account = $accounts[0];

        // 1. Tạo chuỗi Multi-post Thread 2 bước (Auto-chain) kèm is_sponsored Cách C có hậu tố
        $createRes = $this->postJson('/api/v1/threads/posts', [
            'account_id'       => $account->id,
            'is_sponsored'     => true,
            'sponsored_suffix' => '#Sponsored',
            'client_ref'       => 'SONY_WF1000XM5',
            'chain_mode'       => 'auto',
            'thread_steps'     => [
                [
                    'content_text'    => 'Bước 1: Đánh giá khả năng cách âm của tip bọt biển thế hệ mới.',
                    'media_type'      => 'TEXT',
                    'scheduled_at'    => now()->addHours(2)->toIso8601String(),
                ],
                [
                    'content_text'    => 'Bước 2: So sánh độ bền sau 90 ngày sử dụng thực tế.',
                    'media_type'      => 'IMAGE',
                    'media_urls'      => ['https://cdn.podscare.vn/threads/xm5-tips.jpg'],
                    'scheduled_at'    => null,
                ],
            ],
        ]);

        $createRes->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.is_sponsored', true)
            ->assertJsonPath('data.sponsored_suffix', '#Sponsored')
            ->assertJsonPath('data.client_ref', 'SONY_WF1000XM5')
            ->assertJsonPath(
                'data.effective_text',
                'Bước 1: Đánh giá khả năng cách âm của tip bọt biển thế hệ mới. #Sponsored'
            );

        $rootId = (int) $createRes->json('data.id');
        $childId = (int) $createRes->json('data.replies.0.id');
        $this->assertGreaterThan(0, $rootId);
        $this->assertGreaterThan(0, $childId);
        $this->assertNull($createRes->json('data.replies.0.scheduled_at'));

        // 2. Lọc danh sách bài đăng theo is_sponsored và client_ref
        $listRes = $this->getJson('/api/v1/threads/posts?is_sponsored=1&client_ref=SONY_WF1000XM5');
        $listRes->assertStatus(200)
            ->assertJsonCount(2, 'data');

        // 3. Cập nhật nội dung bài con
        $updateRes = $this->putJson("/api/v1/threads/posts/{$childId}", [
            'content_text' => 'Bước 2 (Đã cập nhật): So sánh độ bền sau 120 ngày sử dụng thực tế.',
        ]);
        $updateRes->assertStatus(200)
            ->assertJsonPath('data.content_text', 'Bước 2 (Đã cập nhật): So sánh độ bền sau 120 ngày sử dụng thực tế.');

        // 3b. Chặn gọi publish-now trực tiếp trên bài con khi bài cha chưa published (422 PARENT_POST_NOT_PUBLISHED)
        $prematureChildPublishRes = $this->postJson("/api/v1/threads/posts/{$childId}/publish-now");
        $prematureChildPublishRes->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error_code', 'PARENT_POST_NOT_PUBLISHED');

        // 4. Gọi publish-now cho bài gốc -> Bài gốc chuyển sang published qua quy trình 2 bước Container API & bài con Auto-chain được gán scheduled_at sau 30-60s
        Http::fake(function (HttpClientRequest $request) use ($account) {
            $url = $request->url();

            if (str_contains($url, '/threads_publishing_limit')) {
                return Http::response([
                    'data' => [
                        [
                            'quota_usage' => 6,
                            'config'      => ['quota_total' => 250],
                        ],
                    ],
                ], 200);
            }

            if ($request->method() === 'POST' && str_ends_with($url, "/{$account->threads_user_id}/threads")) {
                return Http::response(['id' => '1789560000998877'], 200);
            }

            if ($request->method() === 'GET' && str_contains($url, '1789560000998877')) {
                return Http::response([
                    'id'     => '1789560000998877',
                    'status' => 'FINISHED',
                ], 200);
            }

            if ($request->method() === 'POST' && str_ends_with($url, "/{$account->threads_user_id}/threads_publish")) {
                return Http::response(['id' => '1802000000998877'], 200);
            }

            return Http::response([
                'id'        => '1802000000998877',
                'permalink' => "https://www.threads.net/@{$account->username}/post/C_real_01",
            ], 200);
        });

        $publishRes = $this->postJson("/api/v1/threads/posts/{$rootId}/publish-now");
        $publishRes->assertStatus(200)
            ->assertJsonPath('data.status', ThreadsPost::STATUS_PUBLISHED)
            ->assertJsonPath('data.container_id', '1789560000998877')
            ->assertJsonPath('data.threads_media_id', '1802000000998877');

        $childFresh = ThreadsPost::findOrFail($childId);
        $this->assertNotNull(
            $childFresh->scheduled_at,
            'Khi bài gốc xuất bản, bài con Auto-chain (scheduled_at = null) phải được tự động gán lịch sau 30-60 giây.'
        );
        $diffSeconds = now()->diffInSeconds($childFresh->scheduled_at, false);
        $this->assertGreaterThanOrEqual(20, $diffSeconds);
        $this->assertLessThanOrEqual(75, $diffSeconds);

        // 5. Kiểm tra approve và retry trên một bài lỗi
        $failedPost = ThreadsPost::create([
            'account_id'    => $account->id,
            'content_text'  => 'Bài đăng thử nghiệm thao tác retry khi gặp lỗi mạng tạm thời.',
            'media_type'    => 'TEXT',
            'status'        => ThreadsPost::STATUS_FAILED,
            'container_id'  => '1789560000112233',
            'retry_count'   => 3,
            'error_code'    => 'HTTP_503',
            'error_message' => 'Service temporarily unavailable',
        ]);

        $retryRes = $this->postJson("/api/v1/threads/posts/{$failedPost->id}/retry");
        $retryRes->assertStatus(200)
            ->assertJsonPath('data.status', ThreadsPost::STATUS_SCHEDULED)
            ->assertJsonPath('data.retry_count', 0)
            ->assertJsonPath('data.container_id', '1789560000112233');

        // 6. Xóa bài đăng
        $deleteRes = $this->deleteJson("/api/v1/threads/posts/{$failedPost->id}");
        $deleteRes->assertStatus(200)
            ->assertJsonPath('data.deleted_id', $failedPost->id);
        $this->assertDatabaseMissing('threads_posts', ['id' => $failedPost->id]);
    }

    public function test_dashboard_stats_and_sample_csv_endpoints_return_accurate_metrics_and_redact_tokens(): void
    {
        $accounts = $this->seedTwentyCompanyAccounts();
        $activeAccount = $accounts[0];

        // Tạo 2 bài scheduled hôm nay (1 bài có is_sponsored = true), 1 bài published hôm nay, 1 bài failed
        ThreadsPost::create([
            'account_id'   => $activeAccount->id,
            'content_text' => 'Bài hẹn giờ hôm nay số 1 (Sponsored).',
            'media_type'   => 'TEXT',
            'is_sponsored' => true,
            'client_ref'   => 'DASHBOARD_REF_01',
            'scheduled_at' => now()->addMinutes(30),
            'status'       => ThreadsPost::STATUS_SCHEDULED,
        ]);

        ThreadsPost::create([
            'account_id'   => $activeAccount->id,
            'content_text' => 'Bài hẹn giờ hôm nay số 2.',
            'media_type'   => 'TEXT',
            'is_sponsored' => false,
            'scheduled_at' => now()->addMinutes(90),
            'status'       => ThreadsPost::STATUS_SCHEDULED,
        ]);

        $publishedPost = ThreadsPost::create([
            'account_id'       => $activeAccount->id,
            'content_text'     => 'Bài đã đăng thành công hôm nay.',
            'media_type'       => 'TEXT',
            'is_sponsored'     => true,
            'sponsored_suffix' => '#Ad',
            'client_ref'       => 'DASHBOARD_REF_02',
            'scheduled_at'     => now()->subMinutes(20),
            'published_at'     => now()->subMinutes(19),
            'status'           => ThreadsPost::STATUS_PUBLISHED,
            'threads_media_id' => '180200999888777',
        ]);

        ThreadsPost::create([
            'account_id'    => $accounts[5]->id,
            'content_text'  => 'Bài bị lỗi xác thực OAuth.',
            'media_type'    => 'TEXT',
            'status'        => ThreadsPost::STATUS_FAILED,
            'error_code'    => 'OAuthException_190',
            'error_message' => 'Session expired',
        ]);

        ThreadsPublishLog::record([
            'account_id'       => $activeAccount->id,
            'post_id'          => $publishedPost->id,
            'action'           => ThreadsPublishLog::ACTION_PUBLISH,
            'http_status'      => 200,
            'request_payload'  => [
                'endpoint'     => 'https://graph.threads.net/v1.0/me/threads_publish?access_token=THQVJ_SECRET_RAW_777',
                'access_token' => 'THQVJ_SECRET_RAW_777',
            ],
            'response_payload' => [
                'id' => '180200999888777',
            ],
            'duration_ms'      => 312,
        ]);

        $dashRes = $this->getJson('/api/v1/threads/dashboard');
        $dashRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.total_accounts', 20)
            ->assertJsonPath('data.active_accounts', 16)
            ->assertJsonPath('data.needs_reauth_accounts', 2)
            ->assertJsonPath('data.paused_accounts', 2)
            ->assertJsonPath('data.scheduled_today', 2)
            ->assertJsonPath('data.published_today', 1)
            ->assertJsonPath('data.failed_posts', 1)
            ->assertJsonPath('data.sponsored_posts_count', 2);

        $rawDashboardBody = $dashRes->getContent();
        $this->assertIsString($rawDashboardBody);
        $this->assertStringNotContainsString('THQVJ_SECRET_RAW_777', $rawDashboardBody);
        $this->assertStringContainsString('[REDACTED_TOKEN]', $rawDashboardBody);

        // Kiểm tra endpoint tải CSV mẫu
        $sampleRes = $this->get('/api/v1/threads/posts/sample-csv?download=1');
        $sampleRes->assertStatus(200);
        $this->assertStringContainsString('account_username', (string) $sampleRes->getContent());
        $this->assertStringContainsString('thread_group_key', (string) $sampleRes->getContent());
        $this->assertStringContainsString('sponsored_suffix', (string) $sampleRes->getContent());
    }

    public function test_publish_now_endpoint_surfaces_real_oauth_401_and_quota_limit_errors_to_ui(): void
    {
        $accounts = $this->seedTwentyCompanyAccounts();
        $activeAccount = $accounts[0]; // active with token
        $needsReauthAccount = $accounts[5]; // needs_reauth without token

        // 1. Gọi publish-now trên tài khoản chưa kết nối OAuth (needs_reauth) -> Trả về 422 ACCOUNT_NEEDS_REAUTH, tuyệt đối không đăng giả
        $unauthedPost = ThreadsPost::create([
            'account_id'   => $needsReauthAccount->id,
            'content_text' => 'Bài đăng trên tài khoản chưa cấp quyền OAuth.',
            'media_type'   => 'TEXT',
            'status'       => ThreadsPost::STATUS_SCHEDULED,
            'scheduled_at' => now()->addMinutes(15),
        ]);

        $unauthedRes = $this->postJson("/api/v1/threads/posts/{$unauthedPost->id}/publish-now");
        $unauthedRes->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error_code', 'ACCOUNT_NEEDS_REAUTH')
            ->assertJsonPath('errors.account.status', 'needs_reauth');

        $unauthedPost->refresh();
        $this->assertNotSame(ThreadsPost::STATUS_PUBLISHED, $unauthedPost->status);

        // 2. Gọi publish-now khi Meta API trả về quota_usage = 240/250 (còn 4% < 10%) -> Trả về 422 QUOTA_BELOW_THRESHOLD và cập nhật quota_used_24h
        $quotaPost = ThreadsPost::create([
            'account_id'   => $activeAccount->id,
            'content_text' => 'Bài đăng kiểm thử chạm ngưỡng hạn mức 24h trên Meta API.',
            'media_type'   => 'TEXT',
            'status'       => ThreadsPost::STATUS_SCHEDULED,
            'scheduled_at' => now()->addMinutes(10),
        ]);

        Http::fake([
            'https://api.telegram.org/*' => Http::response(['ok' => true], 200),
            "https://graph.threads.net/v1.0/{$activeAccount->threads_user_id}/threads_publishing_limit*" => Http::response([
                'data' => [
                    [
                        'quota_usage' => 240,
                        'config'      => ['quota_total' => 250],
                    ],
                ],
            ], 200),
        ]);

        $quotaRes = $this->postJson("/api/v1/threads/posts/{$quotaPost->id}/publish-now");
        $quotaRes->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error_code', 'QUOTA_BELOW_THRESHOLD')
            ->assertJsonPath('errors.account.quota_used_24h', 240)
            ->assertJsonPath('errors.post.status', ThreadsPost::STATUS_SCHEDULED);

        // 3. Gọi publish-now khi Token của tài khoản bị thu hồi (HTTP 401 OAuthException code 190) -> Trả về 422, chuyển post sang failed và account sang needs_reauth
        $secondActiveAccount = $accounts[1];
        $tokenFailPost = ThreadsPost::create([
            'account_id'   => $secondActiveAccount->id,
            'content_text' => 'Bài đăng gặp lỗi Token hết hạn khi gọi publish-now.',
            'media_type'   => 'TEXT',
            'status'       => ThreadsPost::STATUS_SCHEDULED,
            'scheduled_at' => now()->addMinutes(20),
        ]);

        Http::fake([
            "https://graph.threads.net/v1.0/{$secondActiveAccount->threads_user_id}/threads_publishing_limit*" => Http::response([
                'error' => [
                    'message' => 'Error validating access token: Session has expired',
                    'type'    => 'OAuthException',
                    'code'    => 190,
                ],
            ], 401),
        ]);

        $tokenFailRes = $this->postJson("/api/v1/threads/posts/{$tokenFailPost->id}/publish-now");
        $tokenFailRes->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('errors.post.status', ThreadsPost::STATUS_FAILED)
            ->assertJsonPath('errors.account.status', ThreadsAccount::STATUS_NEEDS_REAUTH);
    }
}
