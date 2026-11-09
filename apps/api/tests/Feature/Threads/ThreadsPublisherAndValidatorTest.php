<?php

namespace Tests\Feature\Threads;

use App\Models\ThreadsAccount;
use App\Models\ThreadsPost;
use App\Models\ThreadsPublishLog;
use App\Services\Threads\ThreadsPostValidator;
use App\Services\Threads\ThreadsPublisherService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpClientRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ThreadsPublisherAndValidatorTest extends TestCase
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

        config([
            'services.telegram.bot_token' => 'test_telegram_bot_token_123456',
            'threads.telegram_alert_chat_id' => '-1009988776655',
        ]);
    }

    public function test_validator_resolves_is_sponsored_option_c_and_enforces_500_utf8_chars_and_5_unique_links(): void
    {
        $validator = app(ThreadsPostValidator::class);

        // 1. Cách C mặc định (is_sponsored = true, sponsored_suffix = null) -> Giữ nguyên 100% nội dung gốc
        $originalText = 'Trải nghiệm tai nghe chống ồn thế hệ mới.';
        $effectiveNoSuffix = ThreadsPostValidator::resolveEffectiveText($originalText, true, null);
        $this->assertSame($originalText, $effectiveNoSuffix);

        // 2. Cách C có cấu hình sponsored_suffix = "#Sponsored" -> Nối tự động và không nối lặp lần 2
        $effectiveWithSuffix = ThreadsPostValidator::resolveEffectiveText($originalText, true, '#Sponsored');
        $this->assertSame('Trải nghiệm tai nghe chống ồn thế hệ mới. #Sponsored', $effectiveWithSuffix);

        $alreadyTagged = ThreadsPostValidator::resolveEffectiveText(
            'Trải nghiệm tai nghe chống ồn thế hệ mới. #Sponsored',
            true,
            '#sponsored'
        );
        $this->assertSame('Trải nghiệm tai nghe chống ồn thế hệ mới. #Sponsored', $alreadyTagged);

        // 3. Kiểm tra vượt quá 500 ký tự UTF-8 (kể cả khi cộng thêm sponsored_suffix)
        $text495 = str_repeat('ă', 495);
        $validWithoutSuffix = $validator->validate([
            'content_text' => $text495,
            'media_type' => 'TEXT',
            'is_sponsored' => true,
            'sponsored_suffix' => null,
        ], null, false);
        $this->assertTrue($validWithoutSuffix['valid']);
        $this->assertSame(495, $validWithoutSuffix['char_count']);

        // Khi bật sponsored_suffix = "#Sponsored" (495 + 1 khoảng trắng + 10 ký tự = 506 > 500) -> Lỗi
        $invalidWithSuffix = $validator->validate([
            'content_text' => $text495,
            'media_type' => 'TEXT',
            'is_sponsored' => true,
            'sponsored_suffix' => '#Sponsored',
        ], null, false);
        $this->assertFalse($invalidWithSuffix['valid']);
        $this->assertSame(506, $invalidWithSuffix['char_count']);
        $this->assertContains(ThreadsPostValidator::ERROR_CHAR_LIMIT_EXCEEDED, $invalidWithSuffix['error_codes']);

        // 4. Kiểm tra giới hạn <= 5 unique links (vượt quá ném mã lỗi THREADS_API__LINK_LIMIT_EXCEEDED)
        $textWith5Links = implode(' ', [
            'Tham khảo:',
            'https://podscare.vn/link-1',
            'https://podscare.vn/link-2',
            'https://podscare.vn/link-3',
            'https://podscare.vn/link-4',
            'https://podscare.vn/link-5',
            'https://podscare.vn/link-1', // trùng với link-1 nên tổng unique vẫn là 5
        ]);
        $valid5Links = $validator->validate([
            'content_text' => $textWith5Links,
            'media_type' => 'TEXT',
        ], null, false);
        $this->assertTrue($valid5Links['valid']);
        $this->assertSame(5, $valid5Links['unique_links_count']);

        // Thêm link thứ 6 qua link_attachment -> 6 unique links -> Bị từ chối với THREADS_API__LINK_LIMIT_EXCEEDED
        $invalid6Links = $validator->validate([
            'content_text' => $textWith5Links,
            'link_attachment' => 'https://podscare.vn/link-6',
            'media_type' => 'TEXT',
        ], null, false);
        $this->assertFalse($invalid6Links['valid']);
        $this->assertSame(6, $invalid6Links['unique_links_count']);
        $this->assertContains(ThreadsPostValidator::ERROR_LINK_LIMIT_EXCEEDED, $invalid6Links['error_codes']);

        try {
            $validator->validateOrFail([
                'content_text' => $textWith5Links,
                'link_attachment' => 'https://podscare.vn/link-6',
                'media_type' => 'TEXT',
            ], null, false);
            $this->fail('Expected ValidationException for > 5 unique links.');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('THREADS_API__LINK_LIMIT_EXCEEDED', json_encode($e->errors()));
        }
    }

    public function test_validator_enforces_https_urls_carousel_bounds_and_24h_content_hash_deduplication(): void
    {
        $validator = app(ThreadsPostValidator::class);

        // 1. Chặn media_urls không dùng https://
        $httpMediaResult = $validator->validate([
            'content_text' => 'Bài đăng có ảnh HTTP không bảo mật',
            'media_type' => 'IMAGE',
            'media_urls' => ['http://cdn.podscare.vn/insecure-image.jpg'],
        ], null, false);
        $this->assertFalse($httpMediaResult['valid']);
        $this->assertContains(ThreadsPostValidator::ERROR_INVALID_MEDIA_URL, $httpMediaResult['error_codes']);

        // 2. Kiểm tra CAROUSEL bắt buộc từ 2..20 phần tử
        $carousel1Item = $validator->validate([
            'content_text' => 'Carousel chỉ có 1 ảnh',
            'media_type' => 'CAROUSEL',
            'media_urls' => ['https://cdn.podscare.vn/img-1.jpg'],
        ], null, false);
        $this->assertFalse($carousel1Item['valid']);
        $this->assertContains(ThreadsPostValidator::ERROR_INVALID_CAROUSEL_COUNT, $carousel1Item['error_codes']);

        $urls21 = [];
        for ($i = 1; $i <= 21; $i++) {
            $urls21[] = "https://cdn.podscare.vn/img-{$i}.jpg";
        }
        $carousel21Items = $validator->validate([
            'content_text' => 'Carousel vượt quá 20 ảnh',
            'media_type' => 'CAROUSEL',
            'media_urls' => $urls21,
        ], null, false);
        $this->assertFalse($carousel21Items['valid']);
        $this->assertContains(ThreadsPostValidator::ERROR_INVALID_CAROUSEL_COUNT, $carousel21Items['error_codes']);

        // 3. Chống đăng trùng content_hash trong vòng 24 giờ trên cùng tài khoản hoặc chéo tài khoản
        $accountA = ThreadsAccount::create([
            'display_name' => 'PodsCare Account A',
            'username' => 'podscare.a',
            'threads_user_id' => '20001',
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'access_token' => 'TOKEN_ACCOUNT_A_SECRET',
        ]);
        $accountB = ThreadsAccount::create([
            'display_name' => 'PodsCare Account B',
            'username' => 'podscare.b',
            'threads_user_id' => '20002',
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'access_token' => 'TOKEN_ACCOUNT_B_SECRET',
        ]);

        $existingPost = ThreadsPost::create([
            'account_id' => $accountA->id,
            'content_text' => 'Quy trình vệ sinh tai nghe chuẩn phòng Lab tại PodsCare.',
            'media_type' => 'TEXT',
            'status' => ThreadsPost::STATUS_SCHEDULED,
            'scheduled_at' => now()->addHour(),
        ]);

        // Cùng nội dung (chỉ khác khoảng trắng / chữ hoa thường) trên Account B trong 24h -> Bị chặn
        $dupCheck = $validator->validate([
            'account_id' => $accountB->id,
            'content_text' => "  QUY TRÌNH vệ sinh tai nghe   chuẩn phòng Lab tại PodsCare. \n",
            'media_type' => 'TEXT',
        ], null, true);

        $this->assertFalse($dupCheck['valid']);
        $this->assertSame($existingPost->content_hash, $dupCheck['content_hash']);
        $this->assertSame($existingPost->id, $dupCheck['duplicate_post_id']);
        $this->assertContains(ThreadsPostValidator::ERROR_DUPLICATE_CONTENT, $dupCheck['error_codes']);
    }

    public function test_two_step_publishing_flow_and_sponsored_option_c_and_redacted_logs(): void
    {
        $secretToken = 'THQVJ_PUBLISH_FLOW_SECRET_TOKEN_999';
        $account = ThreadsAccount::create([
            'display_name' => 'PodsCare Main',
            'username' => 'podscare.main',
            'threads_user_id' => '30001',
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'daily_post_cap' => 8,
            'access_token' => $secretToken,
            'token_expires_at' => now()->addDays(40),
        ]);

        // Bài 1: is_sponsored = true nhưng sponsored_suffix = null -> Giữ nguyên 100% văn bản gốc
        $postNoSuffix = ThreadsPost::create([
            'account_id' => $account->id,
            'content_text' => 'Trải nghiệm tai nghe chống ồn thế hệ mới.',
            'media_type' => 'IMAGE',
            'media_urls' => ['https://cdn.podscare.vn/products/anc-pro.jpg'],
            'topic_tag' => 'PodsCareAudio',
            'is_sponsored' => true,
            'sponsored_suffix' => null,
            'client_ref' => 'BRAND_X_01',
            'status' => ThreadsPost::STATUS_SCHEDULED,
            'scheduled_at' => now()->subMinute(),
        ]);

        // Bài 2: is_sponsored = true và sponsored_suffix = "#Sponsored" -> Tự động nối hậu tố
        $postWithSuffix = ThreadsPost::create([
            'account_id' => $account->id,
            'content_text' => 'Đánh giá thời lượng pin thực tế sau khi thay cell mới.',
            'media_type' => 'CAROUSEL',
            'media_urls' => [
                'https://cdn.podscare.vn/carousel/slide-1.jpg',
                'https://cdn.podscare.vn/carousel/slide-2.jpg',
            ],
            'is_sponsored' => true,
            'sponsored_suffix' => '#Sponsored',
            'client_ref' => 'BRAND_Y_02',
            'status' => ThreadsPost::STATUS_SCHEDULED,
            'scheduled_at' => now()->subMinute(),
        ]);

        $capturedCreatePayloads = [];

        Http::fake(function (HttpClientRequest $request) use (&$capturedCreatePayloads) {
            $url = $request->url();

            if (str_contains($url, '/threads_publishing_limit')) {
                return Http::response([
                    'data' => [
                        [
                            'quota_usage' => 5,
                            'config' => ['quota_total' => 250],
                        ],
                    ],
                ], 200);
            }

            if ($request->method() === 'POST' && str_ends_with($url, '/30001/threads')) {
                $data = $request->data();
                if (! empty($data['is_carousel_item'])) {
                    return Http::response(['id' => 'carousel_item_' . count($capturedCreatePayloads) . '_' . uniqid()], 200);
                }
                $capturedCreatePayloads[] = $data;
                $idx = count($capturedCreatePayloads);

                return Http::response(['id' => "container_00{$idx}"], 200);
            }

            if ($request->method() === 'GET' && preg_match('#/v1\.0/(container_00\d)#', $url, $m)) {
                return Http::response([
                    'id' => $m[1],
                    'status' => 'FINISHED',
                ], 200);
            }

            if ($request->method() === 'POST' && str_ends_with($url, '/30001/threads_publish')) {
                $creationId = $request->data()['creation_id'] ?? 'unknown';

                return Http::response([
                    'id' => 'media_for_' . $creationId,
                ], 200);
            }

            if ($request->method() === 'GET' && preg_match('#/v1\.0/(media_for_container_00\d)#', $url, $m)) {
                return Http::response([
                    'id' => $m[1],
                    'permalink' => "https://www.threads.net/@podscare.main/post/{$m[1]}",
                ], 200);
            }

            return Http::response(['ok' => true], 200);
        });

        $this->artisan('threads:run-scheduler')
            ->assertExitCode(0);

        $postNoSuffix->refresh();
        $this->assertSame(ThreadsPost::STATUS_PUBLISHED, $postNoSuffix->status);
        $this->assertSame('container_001', $postNoSuffix->container_id);
        $this->assertSame('media_for_container_001', $postNoSuffix->threads_media_id);
        $this->assertSame('https://www.threads.net/@podscare.main/post/media_for_container_001', $postNoSuffix->permalink);
        $this->assertNotNull($postNoSuffix->published_at);

        $postWithSuffix->refresh();
        $this->assertSame(ThreadsPost::STATUS_PUBLISHED, $postWithSuffix->status);
        $this->assertSame('container_002', $postWithSuffix->container_id);
        $this->assertSame('media_for_container_002', $postWithSuffix->threads_media_id);

        // Xác nhận payload gửi lên Meta API cho Cách C
        $this->assertCount(2, $capturedCreatePayloads);
        $this->assertSame('Trải nghiệm tai nghe chống ồn thế hệ mới.', $capturedCreatePayloads[0]['text']);
        $this->assertSame('Đánh giá thời lượng pin thực tế sau khi thay cell mới. #Sponsored', $capturedCreatePayloads[1]['text']);
        $this->assertSame('CAROUSEL', $capturedCreatePayloads[1]['media_type']);
        $this->assertNotEmpty($capturedCreatePayloads[1]['children']);

        // Xác nhận toàn bộ nhật ký threads_publish_logs đã redact secretToken 100%
        $logs = ThreadsPublishLog::where('account_id', $account->id)->get();
        $this->assertNotEmpty($logs);
        foreach ($logs as $log) {
            $serialized = json_encode([$log->request_payload, $log->response_payload]);
            $this->assertIsString($serialized);
            $this->assertStringNotContainsString($secretToken, $serialized);
        }
    }

    public function test_idempotency_reconciles_existing_container_without_creating_duplicate_post(): void
    {
        $account = ThreadsAccount::create([
            'display_name' => 'PodsCare Idempotent',
            'username' => 'podscare.idem',
            'threads_user_id' => '40001',
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'access_token' => 'TOKEN_IDEMPOTENT_40001',
        ]);

        // Kịch bản A: Bài đăng đã có container_id từ lần trước và trên Meta container đã ở trạng thái PUBLISHED
        $postAlreadyPublishedOnMeta = ThreadsPost::create([
            'account_id' => $account->id,
            'content_text' => 'Bài đăng bị timeout lúc gọi threads_publish nhưng thực chất đã lên bài.',
            'media_type' => 'TEXT',
            'status' => ThreadsPost::STATUS_SCHEDULED,
            'container_id' => 'existing_container_published_99',
            'retry_count' => 1,
            'scheduled_at' => now()->subMinutes(10),
            'next_retry_at' => now()->subMinute(),
        ]);

        // Kịch bản B: Bài đăng đã có container_id ở trạng thái FINISHED -> Chỉ gọi threads_publish, không tạo container mới
        $postFinishedContainer = ThreadsPost::create([
            'account_id' => $account->id,
            'content_text' => 'Bài đăng đã tạo xong container FINISHED đang chờ gọi publish.',
            'media_type' => 'TEXT',
            'status' => ThreadsPost::STATUS_SCHEDULED,
            'container_id' => 'existing_container_finished_88',
            'retry_count' => 1,
            'scheduled_at' => now()->subMinutes(10),
            'next_retry_at' => now()->subMinute(),
        ]);

        $createContainerCalls = 0;
        $publishContainerCalls = [];

        Http::fake(function (HttpClientRequest $request) use (&$createContainerCalls, &$publishContainerCalls) {
            $url = $request->url();

            if (str_contains($url, '/threads_publishing_limit')) {
                return Http::response(['quota_usage' => 2, 'config' => ['quota_total' => 250]], 200);
            }

            if ($request->method() === 'POST' && str_ends_with($url, '/40001/threads')) {
                $createContainerCalls++;

                return Http::response(['id' => 'unexpected_new_container'], 200);
            }

            if ($request->method() === 'GET' && str_contains($url, 'existing_container_published_99')) {
                return Http::response([
                    'id' => 'existing_container_published_99',
                    'status' => 'PUBLISHED',
                    'published_media_id' => 'media_already_live_99',
                ], 200);
            }

            if ($request->method() === 'GET' && str_contains($url, 'existing_container_finished_88')) {
                return Http::response([
                    'id' => 'existing_container_finished_88',
                    'status' => 'FINISHED',
                ], 200);
            }

            if ($request->method() === 'POST' && str_ends_with($url, '/40001/threads_publish')) {
                $creationId = $request->data()['creation_id'] ?? '';
                $publishContainerCalls[] = $creationId;

                return Http::response(['id' => 'media_from_' . $creationId], 200);
            }

            return Http::response([
                'id' => 'media_id',
                'permalink' => 'https://www.threads.net/@podscare.idem/post/123',
            ], 200);
        });

        $publisher = app(ThreadsPublisherService::class);
        $publisher->runScheduler();

        // Không có bất kỳ lệnh POST tạo container mới nào được gọi!
        $this->assertSame(0, $createContainerCalls);

        // Kịch bản A không gọi threads_publish lần nữa, chỉ có Kịch bản B gọi threads_publish đúng 1 lần
        $this->assertSame(['existing_container_finished_88'], $publishContainerCalls);

        $postAlreadyPublishedOnMeta->refresh();
        $this->assertSame(ThreadsPost::STATUS_PUBLISHED, $postAlreadyPublishedOnMeta->status);
        $this->assertSame('media_already_live_99', $postAlreadyPublishedOnMeta->threads_media_id);

        $postFinishedContainer->refresh();
        $this->assertSame(ThreadsPost::STATUS_PUBLISHED, $postFinishedContainer->status);
        $this->assertSame('media_from_existing_container_finished_88', $postFinishedContainer->threads_media_id);
    }

    public function test_exponential_backoff_5m_30m_2h_and_immediate_stop_on_401_with_telegram_alerts(): void
    {
        $account = ThreadsAccount::create([
            'display_name' => 'PodsCare Retry Account',
            'username' => 'podscare.retry',
            'threads_user_id' => '50001',
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'access_token' => 'TOKEN_RETRY_50001',
        ]);

        $post = ThreadsPost::create([
            'account_id' => $account->id,
            'content_text' => 'Bài đăng kiểm thử cơ chế Exponential Backoff 5m -> 30m -> 2h.',
            'media_type' => 'TEXT',
            'status' => ThreadsPost::STATUS_SCHEDULED,
            'scheduled_at' => now()->subMinute(),
        ]);

        $telegramMessages = [];
        $simulateAuthError401 = false;

        Http::fake(function (HttpClientRequest $request) use (&$telegramMessages, &$simulateAuthError401) {
            $url = $request->url();

            if (str_contains($url, 'api.telegram.org')) {
                $telegramMessages[] = $request->data();

                return Http::response(['ok' => true, 'result' => ['message_id' => count($telegramMessages)]], 200);
            }

            if ($simulateAuthError401) {
                return Http::response([
                    'error' => [
                        'message' => 'Error validating access token: Session has expired',
                        'type' => 'OAuthException',
                        'code' => 190,
                    ],
                ], 401);
            }

            if (str_contains($url, '/threads_publishing_limit')) {
                return Http::response(['quota_usage' => 10, 'config' => ['quota_total' => 250]], 200);
            }

            // Giả lập lỗi 500 tạm thời từ máy chủ Meta
            return Http::response([
                'error' => [
                    'message' => 'Temporary Meta server error 500',
                    'code' => 2,
                ],
            ], 500);
        });

        $publisher = app(ThreadsPublisherService::class);

        // Lần lỗi 1: retry_count = 1, next_retry_at ~ +5 phút
        $res1 = $publisher->publishPost($post, true);
        $this->assertFalse($res1['success']);
        $post->refresh();
        $this->assertSame(ThreadsPost::STATUS_SCHEDULED, $post->status);
        $this->assertSame(1, $post->retry_count);
        $this->assertTrue($post->next_retry_at->between(now()->addMinutes(4), now()->addMinutes(6)));

        // Lần lỗi 2: retry_count = 2, next_retry_at ~ +30 phút
        $res2 = $publisher->publishPost($post, true);
        $this->assertFalse($res2['success']);
        $post->refresh();
        $this->assertSame(ThreadsPost::STATUS_SCHEDULED, $post->status);
        $this->assertSame(2, $post->retry_count);
        $this->assertTrue($post->next_retry_at->between(now()->addMinutes(28), now()->addMinutes(32)));

        // Lần lỗi 3: retry_count = 3, next_retry_at ~ +120 phút (2 giờ)
        $res3 = $publisher->publishPost($post, true);
        $this->assertFalse($res3['success']);
        $post->refresh();
        $this->assertSame(ThreadsPost::STATUS_SCHEDULED, $post->status);
        $this->assertSame(3, $post->retry_count);
        $this->assertTrue($post->next_retry_at->between(now()->addMinutes(118), now()->addMinutes(122)));
        $this->assertCount(0, $telegramMessages);

        // Sau 3 lần retry vẫn lỗi -> Chuyển sang failed và bắn cảnh báo Telegram
        $res4 = $publisher->publishPost($post, true);
        $this->assertFalse($res4['success']);
        $post->refresh();
        $this->assertSame(ThreadsPost::STATUS_FAILED, $post->status);
        $this->assertSame(3, $post->retry_count);
        $this->assertNull($post->next_retry_at);
        $this->assertCount(1, $telegramMessages);
        $this->assertStringContainsString('Bài đăng thất bại sau 3 lần retry', (string) ($telegramMessages[0]['text'] ?? ''));

        // Kiểm tra lỗi 401/403 dừng retry ngay lập tức và chuyển tài khoản sang needs_reauth
        $authFailPost = ThreadsPost::create([
            'account_id' => $account->id,
            'content_text' => 'Bài đăng gặp lỗi 401 Token bị thu hồi.',
            'media_type' => 'TEXT',
            'status' => ThreadsPost::STATUS_SCHEDULED,
            'scheduled_at' => now()->subMinute(),
        ]);

        $simulateAuthError401 = true;

        $authRes = $publisher->publishPost($authFailPost, true);
        $this->assertFalse($authRes['success']);

        $authFailPost->refresh();
        $account->refresh();
        $this->assertSame(ThreadsPost::STATUS_FAILED, $authFailPost->status);
        $this->assertSame(0, $authFailPost->retry_count);
        $this->assertNull($authFailPost->next_retry_at);
        $this->assertSame(ThreadsAccount::STATUS_NEEDS_REAUTH, $account->status);
        $this->assertCount(2, $telegramMessages);
        $this->assertStringContainsString('needs_reauth', (string) ($telegramMessages[1]['text'] ?? ''));
    }

    public function test_flexible_multi_post_thread_chaining_auto_chain_and_scheduled_chain(): void
    {
        $account = ThreadsAccount::create([
            'display_name' => 'PodsCare Thread Chain',
            'username' => 'podscare.chain',
            'threads_user_id' => '60001',
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'daily_post_cap' => 15,
            'access_token' => 'TOKEN_CHAIN_60001',
        ]);

        // Bài gốc #1: Đến giờ xuất bản ngay
        $rootPost = ThreadsPost::create([
            'account_id' => $account->id,
            'content_text' => 'Bài gốc #1 mở đầu chuỗi kiến thức bảo dưỡng tai nghe.',
            'media_type' => 'TEXT',
            'thread_group_key' => 'chain_group_01',
            'reply_order' => 0,
            'status' => ThreadsPost::STATUS_SCHEDULED,
            'scheduled_at' => now()->subMinute(),
        ]);

        // Bài con #2 (Auto-chain): reply_to_post_id = #1, scheduled_at = null -> Tự động hẹn sau 30–60 giây khi #1 published
        $autoChainChild = ThreadsPost::create([
            'account_id' => $account->id,
            'reply_to_post_id' => $rootPost->id,
            'content_text' => 'Bài nối tiếp #2 (Auto-chain): Chi tiết bước đo áp suất buồng âm.',
            'media_type' => 'TEXT',
            'thread_group_key' => 'chain_group_01',
            'reply_order' => 1,
            'status' => ThreadsPost::STATUS_SCHEDULED,
            'scheduled_at' => null,
        ]);

        // Bài con #3 (Scheduled-chain): reply_to_post_id = #1, scheduled_at = +3 giờ -> Đợi đúng giờ hẹn mới đăng
        $scheduledChainChild = ThreadsPost::create([
            'account_id' => $account->id,
            'reply_to_post_id' => $rootPost->id,
            'content_text' => 'Bài nối tiếp #3 (Scheduled-chain): Tổng kết bảng thông số lúc 12:00.',
            'media_type' => 'TEXT',
            'thread_group_key' => 'chain_group_01',
            'reply_order' => 2,
            'status' => ThreadsPost::STATUS_SCHEDULED,
            'scheduled_at' => now()->addHours(3),
        ]);

        $containerRequests = [];

        Http::fake(function (HttpClientRequest $request) use (&$containerRequests) {
            $url = $request->url();

            if (str_contains($url, '/threads_publishing_limit')) {
                return Http::response(['quota_usage' => 1, 'config' => ['quota_total' => 250]], 200);
            }

            if ($request->method() === 'POST' && str_ends_with($url, '/60001/threads')) {
                $containerRequests[] = $request->data();
                $idx = count($containerRequests);

                return Http::response(['id' => "chain_container_{$idx}"], 200);
            }

            if ($request->method() === 'GET' && preg_match('#/v1\.0/(chain_container_\d+)#', $url, $m)) {
                return Http::response(['id' => $m[1], 'status' => 'FINISHED'], 200);
            }

            if ($request->method() === 'POST' && str_ends_with($url, '/60001/threads_publish')) {
                $creationId = $request->data()['creation_id'] ?? '';
                if ($creationId === 'chain_container_1') {
                    return Http::response(['id' => '18000001'], 200);
                }
                if ($creationId === 'chain_container_2') {
                    return Http::response(['id' => '18000002'], 200);
                }

                return Http::response(['id' => '18000003'], 200);
            }

            return Http::response([
                'id' => '18000001',
                'permalink' => 'https://www.threads.net/@podscare.chain/post/18000001',
            ], 200);
        });

        $publisher = app(ThreadsPublisherService::class);

        // Lượt chạy 1: Xuất bản bài gốc #1 -> Tự động gán scheduled_at (30-60s) cho bài con #2, giữ nguyên lịch +3h của bài #3
        $run1 = $publisher->runScheduler();
        $this->assertSame(1, $run1['published']);
        $this->assertSame(1, $run1['auto_chained']);

        $rootPost->refresh();
        $autoChainChild->refresh();
        $scheduledChainChild->refresh();

        $this->assertSame(ThreadsPost::STATUS_PUBLISHED, $rootPost->status);
        $this->assertSame('18000001', $rootPost->threads_media_id);

        $this->assertSame(ThreadsPost::STATUS_SCHEDULED, $autoChainChild->status);
        $this->assertNotNull($autoChainChild->scheduled_at);
        $this->assertTrue($autoChainChild->scheduled_at->between(now()->addSeconds(25), now()->addSeconds(65)));

        // Bài #3 vẫn giữ nguyên lịch hẹn +3 giờ và chưa xuất bản
        $this->assertSame(ThreadsPost::STATUS_SCHEDULED, $scheduledChainChild->status);
        $this->assertTrue($scheduledChainChild->scheduled_at->gt(now()->addHours(2)));

        // Tua thời gian 65 giây: Bài con #2 (Auto-chain) đến hạn xuất bản với reply_to_id = 18000001, bài #3 vẫn đợi
        $this->travel(65)->seconds();
        $run2 = $publisher->runScheduler();
        $this->assertSame(1, $run2['published']);

        $autoChainChild->refresh();
        $scheduledChainChild->refresh();
        $this->assertSame(ThreadsPost::STATUS_PUBLISHED, $autoChainChild->status);
        $this->assertSame('18000002', $autoChainChild->threads_media_id);
        $this->assertSame('18000001', $containerRequests[1]['reply_to_id'] ?? null);
        $this->assertSame(ThreadsPost::STATUS_SCHEDULED, $scheduledChainChild->status);

        // Tua tiếp tới thời điểm +3 giờ: Bài con #3 (Scheduled-chain) đến giờ hẹn và xuất bản với reply_to_id = 18000001
        $this->travel(3)->hours();
        $run3 = $publisher->runScheduler();
        $this->assertSame(1, $run3['published']);

        $scheduledChainChild->refresh();
        $this->assertSame(ThreadsPost::STATUS_PUBLISHED, $scheduledChainChild->status);
        $this->assertSame('18000003', $scheduledChainChild->threads_media_id);
        $this->assertSame('18000001', $containerRequests[2]['reply_to_id'] ?? null);
    }

    public function test_low_quota_below_10_percent_defers_post_and_dispatches_telegram_alert(): void
    {
        $account = ThreadsAccount::create([
            'display_name' => 'PodsCare High Volume',
            'username' => 'podscare.highvol',
            'threads_user_id' => '70001',
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'daily_post_cap' => 250,
            'access_token' => 'TOKEN_HIGHVOL_70001',
        ]);

        $post = ThreadsPost::create([
            'account_id' => $account->id,
            'content_text' => 'Bài đăng khi quota đã dùng 235/250 (còn 6% < 10%).',
            'media_type' => 'TEXT',
            'status' => ThreadsPost::STATUS_SCHEDULED,
            'scheduled_at' => now()->subMinute(),
        ]);

        $telegramAlerts = [];

        Http::fake(function (HttpClientRequest $request) use (&$telegramAlerts) {
            if (str_contains($request->url(), 'api.telegram.org')) {
                $telegramAlerts[] = $request->data();

                return Http::response(['ok' => true, 'result' => ['message_id' => 1]], 200);
            }

            if (str_contains($request->url(), '/threads_publishing_limit')) {
                return Http::response([
                    'data' => [
                        [
                            'quota_usage' => 235,
                            'config' => ['quota_total' => 250],
                        ],
                    ],
                ], 200);
            }

            return Http::response(['id' => 'should_not_be_called'], 200);
        });

        $publisher = app(ThreadsPublisherService::class);
        $result = $publisher->publishPost($post, false);

        $this->assertFalse($result['success']);
        $this->assertSame('deferred_low_quota', $result['status']);

        $post->refresh();
        $this->assertSame(ThreadsPost::STATUS_SCHEDULED, $post->status);
        $this->assertSame('QUOTA_BELOW_THRESHOLD', $post->error_code);
        $this->assertTrue($post->scheduled_at->gt(now()->addMinutes(50)));

        $this->assertCount(1, $telegramAlerts);
        $this->assertStringContainsString('235/250', (string) ($telegramAlerts[0]['text'] ?? ''));
    }

    public function test_parent_post_permanent_failure_cascades_to_dependent_auto_and_scheduled_child_posts(): void
    {
        $account = ThreadsAccount::create([
            'display_name' => 'PodsCare Cascade Guard',
            'username' => 'podscare.cascade',
            'threads_user_id' => '80001',
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'daily_post_cap' => 15,
            'access_token' => 'TOKEN_CASCADE_80001',
        ]);

        // Bài cha đã qua 3 lần retry, lần chạy tiếp theo nếu vẫn lỗi 500 sẽ chuyển sang failed vĩnh viễn
        $rootPost = ThreadsPost::create([
            'account_id' => $account->id,
            'content_text' => 'Bài gốc chuỗi 3 bước bị lỗi máy chủ Meta sau 3 lần retry.',
            'media_type' => 'TEXT',
            'thread_group_key' => 'cascade_fail_chain',
            'reply_order' => 0,
            'status' => ThreadsPost::STATUS_SCHEDULED,
            'retry_count' => 3,
            'scheduled_at' => now()->subMinutes(10),
            'next_retry_at' => now()->subMinute(),
        ]);

        $autoChild = ThreadsPost::create([
            'account_id' => $account->id,
            'reply_to_post_id' => $rootPost->id,
            'content_text' => 'Bài con Auto-chain phụ thuộc bài gốc.',
            'media_type' => 'TEXT',
            'thread_group_key' => 'cascade_fail_chain',
            'reply_order' => 1,
            'status' => ThreadsPost::STATUS_SCHEDULED,
            'scheduled_at' => null,
        ]);

        $scheduledGrandChild = ThreadsPost::create([
            'account_id' => $account->id,
            'reply_to_post_id' => $autoChild->id,
            'content_text' => 'Bài cháu Scheduled-chain phụ thuộc bài con.',
            'media_type' => 'TEXT',
            'thread_group_key' => 'cascade_fail_chain',
            'reply_order' => 2,
            'status' => ThreadsPost::STATUS_SCHEDULED,
            'scheduled_at' => now()->addHours(2),
        ]);

        Http::fake([
            'https://api.telegram.org/*' => Http::response(['ok' => true], 200),
            'https://graph.threads.net/v1.0/80001/threads_publishing_limit*' => Http::response([
                'quota_usage' => 2,
                'config' => ['quota_total' => 250],
            ], 200),
            'https://graph.threads.net/v1.0/80001/threads' => Http::response([
                'error' => ['message' => 'Meta Internal Error', 'code' => 2],
            ], 500),
        ]);

        $publisher = app(ThreadsPublisherService::class);
        $outcome = $publisher->publishPost($rootPost, false);

        $this->assertFalse($outcome['success']);
        $this->assertSame(ThreadsPost::STATUS_FAILED, $outcome['status']);

        $rootPost->refresh();
        $autoChild->refresh();
        $scheduledGrandChild->refresh();

        $this->assertSame(ThreadsPost::STATUS_FAILED, $rootPost->status);
        $this->assertSame(ThreadsPost::STATUS_FAILED, $autoChild->status);
        $this->assertSame('PARENT_POST_FAILED', $autoChild->error_code);
        $this->assertSame(ThreadsPost::STATUS_FAILED, $scheduledGrandChild->status);
        $this->assertSame('PARENT_POST_FAILED', $scheduledGrandChild->error_code);
    }
}
