<?php

namespace Tests\Unit;

use App\Jobs\PublishThreadsReplyJob;
use App\Models\ThreadsAccount;
use App\Models\ThreadsSeedingCampaign;
use App\Models\ThreadsSeedingJob;
use App\Services\Threads\ThreadsGraphApiClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class PublishThreadsReplyJobTest extends TestCase
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

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    protected function createAccount(): ThreadsAccount
    {
        $account = new ThreadsAccount([
            'display_name' => 'Seeder Test',
            'username' => 'podscare_seeder',
            'threads_user_id' => '17841499999999999',
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'daily_post_cap' => 10,
            'token_expires_at' => now()->addDays(30),
        ]);
        $account->setAccessToken('valid_test_access_token');
        $account->save();

        return $account;
    }

    protected function createCampaign(): ThreadsSeedingCampaign
    {
        return ThreadsSeedingCampaign::create([
            'name' => 'Chiến dịch Test Reply Job',
            'type' => ThreadsSeedingCampaign::TYPE_DISCOVERY,
            'dispatch_strategy' => ThreadsSeedingCampaign::STRATEGY_ROUND_ROBIN,
            'status' => ThreadsSeedingCampaign::STATUS_QUEUED,
            'total_jobs' => 1,
        ]);
    }

    public function test_publish_threads_reply_job_success_two_step(): void
    {
        $account = $this->createAccount();
        $campaign = $this->createCampaign();

        $replyText = 'PodsCare chuyên sửa chữa tai nghe AirPods lấy liền!';
        $job = ThreadsSeedingJob::create([
            'campaign_id' => $campaign->id,
            'account_id' => $account->id,
            'target_post_id' => 'post_meta_12345',
            'target_post_url' => 'https://threads.net/t/post_meta_12345',
            'reply_text' => $replyText,
            'content_hash' => ThreadsSeedingJob::computeContentHash($replyText),
            'status' => ThreadsSeedingJob::STATUS_QUEUED,
        ]);

        $mockClient = Mockery::mock(ThreadsGraphApiClient::class);

        // Bước 1: createContainer
        $mockClient->shouldReceive('createContainer')
            ->once()
            ->withArgs(function ($acc, $post, $replyToId) use ($account, $replyText) {
                return $acc->id === $account->id
                    && $post['content_text'] === $replyText
                    && $post['media_type'] === 'TEXT'
                    && $replyToId === 'post_meta_12345';
            })
            ->andReturn([
                'ok' => true,
                'container_id' => 'container_999999',
                'http_status' => 200,
            ]);

        // Bước 1.5: pollContainerUntilFinished
        $mockClient->shouldReceive('pollContainerUntilFinished')
            ->once()
            ->withArgs(function ($acc, $containerId, $jobId) use ($account) {
                return $acc->id === $account->id && $containerId === 'container_999999';
            })
            ->andReturn([
                'ok' => true,
                'status' => 'FINISHED',
            ]);

        // Bước 2: publishContainer
        $mockClient->shouldReceive('publishContainer')
            ->once()
            ->withArgs(function ($acc, $containerId, $jobId) use ($account) {
                return $acc->id === $account->id && $containerId === 'container_999999';
            })
            ->andReturn([
                'ok' => true,
                'threads_media_id' => 'media_final_77777',
                'http_status' => 200,
            ]);

        $jobHandler = new PublishThreadsReplyJob($job->id);
        $jobHandler->handle($mockClient);

        $job->refresh();
        $campaign->refresh();

        // Xác nhận trạng thái published
        $this->assertEquals(ThreadsSeedingJob::STATUS_PUBLISHED, $job->status);
        $this->assertEquals('container_999999', $job->container_id);
        $this->assertEquals('media_final_77777', $job->threads_media_id);
        $this->assertNotNull($job->published_at);
        $this->assertStringContainsString('media_final_77777', $job->permalink);

        // Xác nhận cập nhật tiến độ chiến dịch
        $this->assertEquals(1, $campaign->completed_jobs);
        $this->assertEquals(ThreadsSeedingCampaign::STATUS_COMPLETED, $campaign->status);
    }

    public function test_publish_threads_reply_job_fails_when_container_creation_fails(): void
    {
        $account = $this->createAccount();
        $campaign = $this->createCampaign();

        $job = ThreadsSeedingJob::create([
            'campaign_id' => $campaign->id,
            'account_id' => $account->id,
            'target_post_id' => 'post_deleted_by_author',
            'target_post_url' => 'https://threads.net/t/post_deleted_by_author',
            'reply_text' => 'Bình luận test lỗi',
            'content_hash' => ThreadsSeedingJob::computeContentHash('Bình luận test lỗi'),
            'status' => ThreadsSeedingJob::STATUS_QUEUED,
        ]);

        $mockClient = Mockery::mock(ThreadsGraphApiClient::class);

        $mockClient->shouldReceive('createContainer')
            ->once()
            ->andReturn([
                'ok' => false,
                'http_status' => 400,
                'error_code' => 'TARGET_POST_DELETED',
                'error_message' => 'Bài viết mục tiêu đã bị người dùng xóa hoặc khóa bình luận.',
            ]);

        $jobHandler = new PublishThreadsReplyJob($job->id);
        $jobHandler->handle($mockClient);

        $job->refresh();
        $campaign->refresh();

        $this->assertEquals(ThreadsSeedingJob::STATUS_FAILED, $job->status);
        $this->assertEquals('TARGET_POST_DELETED', $job->error_code);
        $this->assertEquals(1, $job->retry_count);

        $this->assertEquals(1, $campaign->failed_jobs);
        $this->assertEquals(ThreadsSeedingCampaign::STATUS_FAILED, $campaign->status);
    }

    public function test_publish_threads_reply_job_anti_collision_race_condition(): void
    {
        $account = $this->createAccount();
        $campaign = $this->createCampaign();

        $text = 'Câu bình luận chuẩn bị đăng';
        $hash = ThreadsSeedingJob::computeContentHash($text);

        // Giả lập một tài khoản khác vừa xuất bản bài này cách đây 1 phút
        ThreadsSeedingJob::create([
            'campaign_id' => $campaign->id,
            'account_id' => $account->id,
            'target_post_id' => 'post_race_condition',
            'target_post_url' => 'https://threads.net/t/post_race_condition',
            'reply_text' => $text,
            'content_hash' => $hash,
            'status' => ThreadsSeedingJob::STATUS_PUBLISHED,
            'threads_media_id' => 'media_prior_111',
            'created_at' => now()->subMinute(),
        ]);

        // Job hiện tại cùng nội dung và target_post_id
        $job = ThreadsSeedingJob::create([
            'campaign_id' => $campaign->id,
            'account_id' => $account->id,
            'target_post_id' => 'post_race_condition',
            'target_post_url' => 'https://threads.net/t/post_race_condition',
            'reply_text' => $text,
            'content_hash' => $hash,
            'status' => ThreadsSeedingJob::STATUS_QUEUED,
        ]);

        $mockClient = Mockery::mock(ThreadsGraphApiClient::class);
        // Tuyệt đối không được gọi Meta API
        $mockClient->shouldNotReceive('createContainer');
        $mockClient->shouldNotReceive('publishContainer');

        $jobHandler = new PublishThreadsReplyJob($job->id);
        $jobHandler->handle($mockClient);

        $job->refresh();

        $this->assertEquals(ThreadsSeedingJob::STATUS_SKIPPED, $job->status);
        $this->assertEquals('ANTI_COLLISION', $job->error_code);
    }
}
