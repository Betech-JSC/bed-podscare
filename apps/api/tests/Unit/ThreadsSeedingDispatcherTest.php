<?php

namespace Tests\Unit;

use App\Jobs\PublishThreadsReplyJob;
use App\Models\ThreadsAccount;
use App\Models\ThreadsSeedingCampaign;
use App\Models\ThreadsSeedingJob;
use App\Services\ThreadsDiscoveryService;
use App\Services\ThreadsSeedingDispatcherService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ThreadsSeedingDispatcherTest extends TestCase
{
    use RefreshDatabase;

    protected ThreadsDiscoveryService $discoveryService;
    protected ThreadsSeedingDispatcherService $dispatcherService;

    protected function setUp(): void
    {
        putenv('DB_CONNECTION=sqlite');
        putenv('DB_DATABASE=:memory:');
        $_ENV['DB_CONNECTION'] = 'sqlite';
        $_ENV['DB_DATABASE'] = ':memory:';
        $_SERVER['DB_CONNECTION'] = 'sqlite';
        $_SERVER['DB_DATABASE'] = ':memory:';

        parent::setUp();
        $this->discoveryService = new ThreadsDiscoveryService();
        $this->dispatcherService = new ThreadsSeedingDispatcherService($this->discoveryService);
    }

    protected function createActiveAccount(string $username, int $cap = 10, ?int $id = null): ThreadsAccount
    {
        $data = [
            'display_name' => "Nick {$username}",
            'username' => $username,
            'threads_user_id' => '178414' . rand(10000000000, 99999999999),
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'daily_post_cap' => $cap,
            'token_expires_at' => now()->addDays(30),
        ];

        if ($id !== null) {
            $data['id'] = $id;
        }

        $account = new ThreadsAccount($data);
        $account->setAccessToken('test_token_valid_' . $username);
        $account->save();

        return $account;
    }

    public function test_get_eligible_accounts_filters_inactive_and_expired(): void
    {
        // 1 active hợp lệ
        $activeAcc = $this->createActiveAccount('active_nick');

        // 1 paused
        $pausedAcc = ThreadsAccount::create([
            'display_name' => 'Nick Paused',
            'username' => 'paused_nick',
            'threads_user_id' => '1784140000001',
            'status' => ThreadsAccount::STATUS_PAUSED,
            'daily_post_cap' => 10,
        ]);
        $pausedAcc->setAccessToken('token_paused')->save();

        // 1 expired token
        $expiredAcc = ThreadsAccount::create([
            'display_name' => 'Nick Expired',
            'username' => 'expired_nick',
            'threads_user_id' => '1784140000002',
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'daily_post_cap' => 10,
            'token_expires_at' => now()->subDay(),
        ]);
        $expiredAcc->setAccessToken('token_expired')->save();

        $eligible = $this->dispatcherService->getEligibleAccounts();

        $this->assertCount(1, $eligible);
        $this->assertEquals($activeAcc->id, $eligible->first()->id);
    }

    public function test_get_eligible_accounts_filters_capped_accounts(): void
    {
        // Tài khoản có cap = 1
        $cappedAcc = $this->createActiveAccount('capped_nick', 1);

        // Tạo campaign và 1 job đã xuất bản hôm nay cho cappedAcc
        $campaign = ThreadsSeedingCampaign::create([
            'name' => 'Campaign Test',
            'type' => ThreadsSeedingCampaign::TYPE_DISCOVERY,
            'dispatch_strategy' => ThreadsSeedingCampaign::STRATEGY_ROUND_ROBIN,
            'status' => ThreadsSeedingCampaign::STATUS_QUEUED,
        ]);

        ThreadsSeedingJob::create([
            'campaign_id' => $campaign->id,
            'account_id' => $cappedAcc->id,
            'target_post_id' => 'post_1',
            'target_post_url' => 'https://threads.net/t/post_1',
            'reply_text' => 'Bình luận 1',
            'content_hash' => ThreadsSeedingJob::computeContentHash('Bình luận 1'),
            'status' => ThreadsSeedingJob::STATUS_PUBLISHED,
        ]);

        // CappedAcc đã dùng 1/1 -> không còn eligible
        $eligible = $this->dispatcherService->getEligibleAccounts();
        $this->assertCount(0, $eligible);
    }

    public function test_round_robin_strategy_distribution(): void
    {
        Queue::fake();

        $acc1 = $this->createActiveAccount('nick_1');
        $acc2 = $this->createActiveAccount('nick_2');

        $selectedPosts = [
            [
                'post_id' => 'p1',
                'permalink' => 'https://threads.net/@u1/post/p1',
                'author_username' => 'u1',
                'caption' => 'Caption 1',
                'velocity_score' => 50,
                'metrics' => ['replies' => 5, 'likes' => 20, 'reposts' => 5],
            ],
            [
                'post_id' => 'p2',
                'permalink' => 'https://threads.net/@u2/post/p2',
                'author_username' => 'u2',
                'caption' => 'Caption 2',
                'velocity_score' => 40,
                'metrics' => ['replies' => 4, 'likes' => 15, 'reposts' => 4],
            ],
        ];

        $payload = [
            'name' => 'Round-Robin Discovery Test',
            'keyword' => 'airpods',
            'selected_posts' => $selectedPosts,
            'content_template' => 'Tham khảo sửa tại PodsCare!',
            'dispatch_strategy' => ThreadsSeedingCampaign::STRATEGY_ROUND_ROBIN,
            'cooldown_min_seconds' => 180,
            'cooldown_max_seconds' => 420,
        ];

        $result = $this->dispatcherService->dispatchDiscovery($payload);

        $this->assertCount(2, $result['campaign']->jobs);
        $jobs = $result['campaign']->jobs;

        // Phân bổ 2 nick cho 2 bài khác nhau
        $this->assertEquals($acc1->id, $jobs[0]->account_id);
        $this->assertEquals($acc2->id, $jobs[1]->account_id);

        Queue::assertPushed(PublishThreadsReplyJob::class, 2);
    }

    public function test_cluster_seeding_assigns_two_different_accounts_with_15m_delay(): void
    {
        Queue::fake();

        $acc1 = $this->createActiveAccount('cluster_nick_1');
        $acc2 = $this->createActiveAccount('cluster_nick_2');

        $payload = [
            'name' => 'Cluster Test',
            'keyword' => 'airpods pro',
            'selected_posts' => [
                [
                    'post_id' => 'cluster_post_100',
                    'permalink' => 'https://threads.net/@u/post/cluster_post_100',
                    'author_username' => 'reviewer',
                    'caption' => 'Test caption',
                    'velocity_score' => 30,
                    'metrics' => ['replies' => 2, 'likes' => 10, 'reposts' => 2],
                ],
            ],
            'content_template' => 'PodsCare sửa rất nhanh và chuẩn!',
            'cluster_content_template' => 'Mình cũng vừa qua thay pin ở đây, công nhận êm!',
            'dispatch_strategy' => ThreadsSeedingCampaign::STRATEGY_CLUSTER,
        ];

        $result = $this->dispatcherService->dispatchDiscovery($payload);

        $this->assertCount(2, $result['campaign']->jobs);
        $job1 = $result['campaign']->jobs[0];
        $job2 = $result['campaign']->jobs[1];

        // 2 tài khoản phải KHÁC NHAU trên cùng 1 target_post_id
        $this->assertNotEquals($job1->account_id, $job2->account_id);
        $this->assertEquals('cluster_post_100', $job1->target_post_id);
        $this->assertEquals('cluster_post_100', $job2->target_post_id);

        $this->assertEquals(1, $job1->cluster_order);
        $this->assertEquals(2, $job2->cluster_order);

        // Job 2 phải lên lịch sau Job 1 tối thiểu 15 phút (900 giây)
        $diffSeconds = $job2->scheduled_at->getTimestamp() - $job1->scheduled_at->getTimestamp();
        $this->assertGreaterThanOrEqual(900, $diffSeconds);

        // Nội dung khác nhau để không bị Anti-Collision chặn
        $this->assertNotEquals($job1->content_hash, $job2->content_hash);
    }

    public function test_anti_collision_blocks_duplicate_text_on_same_post(): void
    {
        Queue::fake();

        $acc1 = $this->createActiveAccount('anti_acc_1');
        $acc2 = $this->createActiveAccount('anti_acc_2');

        $duplicateText = 'Nội dung seeding y hệt cần kiểm tra va chạm!';

        // Giả lập đã có 1 bài đăng nội dung này cách đây 1 giờ
        $campaignOld = ThreadsSeedingCampaign::create([
            'name' => 'Old Campaign',
            'type' => ThreadsSeedingCampaign::TYPE_DISCOVERY,
            'dispatch_strategy' => ThreadsSeedingCampaign::STRATEGY_ROUND_ROBIN,
            'status' => ThreadsSeedingCampaign::STATUS_QUEUED,
        ]);

        ThreadsSeedingJob::create([
            'campaign_id' => $campaignOld->id,
            'account_id' => $acc1->id,
            'target_post_id' => 'target_duplicate_999',
            'target_post_url' => 'https://threads.net/t/target_duplicate_999',
            'reply_text' => $duplicateText,
            'content_hash' => ThreadsSeedingJob::computeContentHash($duplicateText),
            'status' => ThreadsSeedingJob::STATUS_PUBLISHED,
            'created_at' => now()->subHour(),
        ]);

        // Giờ tạo chiến dịch mới gửi cùng nội dung đó vào cùng target_duplicate_999
        $payload = [
            'name' => 'Collision Campaign',
            'post_urls' => ['https://www.threads.net/@user/post/target_duplicate_999'],
            'reply_text' => $duplicateText,
            'dispatch_strategy' => ThreadsSeedingCampaign::STRATEGY_ROUND_ROBIN,
        ];

        $result = $this->dispatcherService->dispatchDirect($payload);

        $this->assertCount(1, $result['campaign']->jobs);
        $newJob = $result['campaign']->jobs->first();

        // Job mới phải bị đánh dấu SKIPPED kèm mã ANTI_COLLISION
        $this->assertEquals(ThreadsSeedingJob::STATUS_SKIPPED, $newJob->status);
        $this->assertEquals('ANTI_COLLISION', $newJob->error_code);

        // Không được push vào queue
        Queue::assertNothingPushed();
    }
}
