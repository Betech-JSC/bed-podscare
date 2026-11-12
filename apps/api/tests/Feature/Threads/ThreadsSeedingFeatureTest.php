<?php

namespace Tests\Feature\Threads;

use App\Jobs\PublishThreadsReplyJob;
use App\Models\ThreadsAccount;
use App\Models\ThreadsSeedingCampaign;
use App\Models\ThreadsSeedingJob;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class ThreadsSeedingFeatureTest extends TestCase
{
    use RefreshDatabase;

    protected User $adminUser;
    protected User $techUser;

    protected function setUp(): void
    {
        putenv('DB_CONNECTION=sqlite');
        putenv('DB_DATABASE=:memory:');
        $_ENV['DB_CONNECTION'] = 'sqlite';
        $_ENV['DB_DATABASE'] = ':memory:';
        $_SERVER['DB_CONNECTION'] = 'sqlite';
        $_SERVER['DB_DATABASE'] = ':memory:';

        parent::setUp();

        $this->adminUser = User::factory()->create([
            'role' => 'admin',
        ]);

        $this->techUser = User::factory()->create([
            'role' => 'technician',
        ]);
    }

    protected function createActiveAccount(string $username = 'seed_nick_1'): ThreadsAccount
    {
        $account = new ThreadsAccount([
            'display_name' => "Tài khoản {$username}",
            'username' => $username,
            'threads_user_id' => '178414' . rand(10000000000, 99999999999),
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'daily_post_cap' => 10,
            'token_expires_at' => now()->addDays(30),
        ]);
        $account->setAccessToken('token_' . $username);
        $account->save();

        return $account;
    }

    public function test_seeding_endpoints_require_authentication_and_admin_rbac(): void
    {
        // 1. Khách chưa đăng nhập -> 401
        $this->postJson('/api/v1/threads/seeding/discover', ['keyword' => 'airpods'])
            ->assertStatus(401);

        // 2. Technician đăng nhập -> 403 Forbidden
        $this->actingAs($this->techUser, 'sanctum')
            ->postJson('/api/v1/threads/seeding/discover', ['keyword' => 'airpods'])
            ->assertStatus(403);

        // 3. Admin đăng nhập -> 200 OK
        $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/threads/seeding/discover', ['keyword' => 'airpods'])
            ->assertStatus(200);
    }

    public function test_discover_endpoint_returns_ranked_posts(): void
    {
        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/threads/seeding/discover', [
                'keyword' => 'airpods pro 2',
                'limit' => 10,
            ]);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'data' => [
                    'keyword' => 'airpods pro 2',
                ],
            ]);

        $posts = $response->json('data.data');
        $this->assertNotEmpty($posts);
        $this->assertLessThanOrEqual(10, count($posts));

        // Kiểm tra thứ tự Velocity Score giảm dần
        $prevScore = PHP_INT_MAX;
        foreach ($posts as $post) {
            $this->assertLessThanOrEqual($prevScore, $post['velocity_score']);
            $prevScore = $post['velocity_score'];
            $this->assertArrayHasKey('post_id', $post);
            $this->assertArrayHasKey('author_username', $post);
            $this->assertArrayHasKey('permalink', $post);
        }
    }

    public function test_discover_endpoint_returns_empty_when_no_recent_posts(): void
    {
        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/threads/seeding/discover', [
                'keyword' => 'khong_co_bai_viet_24h',
            ]);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'data' => [
                    'total' => 0,
                    'data' => [],
                ],
            ]);
    }

    public function test_parse_urls_endpoint(): void
    {
        // Danh sách URL hợp lệ
        $validRes = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/threads/seeding/parse-urls', [
                'post_urls' => [
                    'https://www.threads.net/@apple_fan/post/DG_xyz123',
                    'https://threads.net/@reviewer/post/DG_abc456',
                ],
            ]);

        $validRes->assertStatus(200)
            ->assertJson(['success' => true])
            ->assertJsonCount(2, 'data.valid');

        // URL không hợp lệ
        $invalidRes = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/threads/seeding/parse-urls', [
                'post_urls' => [
                    'https://instagram.com/p/12345',
                ],
            ]);

        $invalidRes->assertStatus(422)
            ->assertJson(['success' => false]);
    }

    public function test_dispatch_discovery_campaign_round_robin(): void
    {
        Queue::fake();

        $this->createActiveAccount('seeder_01');
        $this->createActiveAccount('seeder_02');

        $payload = [
            'name' => 'Chiến dịch Test Discovery',
            'keyword' => 'airpods 3',
            'selected_posts' => [
                [
                    'post_id' => 'disc_post_01',
                    'permalink' => 'https://threads.net/@tech/post/disc_post_01',
                    'author_username' => 'tech',
                    'caption' => 'AirPods 3 pin trâu không anh em?',
                    'velocity_score' => 60,
                    'metrics' => ['replies' => 5, 'likes' => 30, 'reposts' => 5],
                ],
                [
                    'post_id' => 'disc_post_02',
                    'permalink' => 'https://threads.net/@tech2/post/disc_post_02',
                    'author_username' => 'tech2',
                    'caption' => 'Cách vệ sinh AirPods 3 chuẩn',
                    'velocity_score' => 45,
                    'metrics' => ['replies' => 3, 'likes' => 20, 'reposts' => 4],
                ],
            ],
            'content_template' => 'Tham khảo dịch vụ sửa chữa vệ sinh tại PodsCare nhé!',
            'dispatch_strategy' => ThreadsSeedingCampaign::STRATEGY_ROUND_ROBIN,
            'cooldown_min_seconds' => 180,
            'cooldown_max_seconds' => 420,
        ];

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/threads/seeding/dispatch-discovery', $payload);

        $response->assertStatus(201)
            ->assertJson([
                'success' => true,
                'data' => [
                    'jobs_count' => 2,
                ],
            ]);

        $this->assertDatabaseHas('threads_seeding_campaigns', [
            'name' => 'Chiến dịch Test Discovery',
            'type' => ThreadsSeedingCampaign::TYPE_DISCOVERY,
            'status' => ThreadsSeedingCampaign::STATUS_QUEUED,
            'total_jobs' => 2,
        ]);

        $this->assertDatabaseCount('threads_seeding_jobs', 2);
        Queue::assertPushed(PublishThreadsReplyJob::class, 2);
    }

    public function test_dispatch_direct_campaign_cluster(): void
    {
        Queue::fake();

        $this->createActiveAccount('cluster_acc_1');
        $this->createActiveAccount('cluster_acc_2');

        $payload = [
            'name' => 'Chiến dịch Direct Cluster',
            'post_urls' => [
                'https://www.threads.net/@reviewer/post/direct_cluster_999',
            ],
            'reply_text' => 'PodsCare sửa rất chuẩn và uy tín!',
            'cluster_content_template' => 'Chuẩn luôn, mình vừa qua thay pin tuần trước!',
            'dispatch_strategy' => ThreadsSeedingCampaign::STRATEGY_CLUSTER,
        ];

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/threads/seeding/dispatch-direct', $payload);

        $response->assertStatus(201)
            ->assertJson([
                'success' => true,
                'data' => [
                    'jobs_count' => 2,
                ],
            ]);

        $this->assertDatabaseHas('threads_seeding_campaigns', [
            'name' => 'Chiến dịch Direct Cluster',
            'type' => ThreadsSeedingCampaign::TYPE_DIRECT,
            'dispatch_strategy' => ThreadsSeedingCampaign::STRATEGY_CLUSTER,
            'total_jobs' => 2,
        ]);

        // Cả 2 jobs đều cùng trỏ vào direct_cluster_999 nhưng thứ tự 1 và 2
        $jobs = ThreadsSeedingJob::query()->where('target_post_id', 'direct_cluster_999')->get();
        $this->assertCount(2, $jobs);
        $this->assertEquals(1, $jobs[0]->cluster_order);
        $this->assertEquals(2, $jobs[1]->cluster_order);
        $this->assertNotEquals($jobs[0]->account_id, $jobs[1]->account_id);
    }

    public function test_campaigns_and_jobs_queries_and_retry(): void
    {
        Queue::fake();
        $acc = $this->createActiveAccount('seeder_query');

        $campaign = ThreadsSeedingCampaign::create([
            'name' => 'Chiến dịch Tìm kiếm',
            'type' => ThreadsSeedingCampaign::TYPE_DISCOVERY,
            'keyword' => 'airpods query test',
            'status' => ThreadsSeedingCampaign::STATUS_QUEUED,
            'total_jobs' => 1,
            'created_by' => $this->adminUser->id,
        ]);

        $job = ThreadsSeedingJob::create([
            'campaign_id' => $campaign->id,
            'account_id' => $acc->id,
            'target_post_id' => 'p_query_1',
            'target_post_url' => 'https://threads.net/t/p_query_1',
            'reply_text' => 'Bình luận test query',
            'content_hash' => ThreadsSeedingJob::computeContentHash('Bình luận test query'),
            'status' => ThreadsSeedingJob::STATUS_FAILED,
            'error_code' => 'RATE_LIMIT',
            'error_message' => 'Lỗi thử nghiệm',
        ]);

        // 1. Danh sách chiến dịch
        $campaignsRes = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/threads/seeding/campaigns?keyword=Tìm+kiếm');

        $campaignsRes->assertStatus(200)
            ->assertJson(['success' => true])
            ->assertJsonFragment(['name' => 'Chiến dịch Tìm kiếm']);

        // 2. Chi tiết chiến dịch
        $detailRes = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/threads/seeding/campaigns/{$campaign->id}");

        $detailRes->assertStatus(200)
            ->assertJson([
                'success' => true,
                'data' => [
                    'id' => $campaign->id,
                    'name' => 'Chiến dịch Tìm kiếm',
                ],
            ]);

        // 3. Danh sách jobs
        $jobsRes = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/threads/seeding/jobs?campaign_id={$campaign->id}&status=failed");

        $jobsRes->assertStatus(200)
            ->assertJson(['success' => true])
            ->assertJsonFragment(['target_post_id' => 'p_query_1']);

        // 4. Thử lại job (retry)
        $retryRes = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson("/api/v1/threads/seeding/jobs/{$job->id}/retry");

        $retryRes->assertStatus(200)
            ->assertJson([
                'success' => true,
                'data' => [
                    'id' => $job->id,
                    'status' => ThreadsSeedingJob::STATUS_QUEUED,
                ],
            ]);

        Queue::assertPushed(PublishThreadsReplyJob::class, 1);
    }
}
