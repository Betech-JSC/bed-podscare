<?php

namespace Tests\Unit;

use App\Models\ThreadsAccount;
use App\Models\ThreadsSeedingCampaign;
use App\Models\ThreadsSeedingJob;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ThreadsSeedingModelsTest extends TestCase
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

    public function test_can_create_campaign_and_jobs_with_proper_relations(): void
    {
        $account = ThreadsAccount::create([
            'display_name' => 'Podscare Seeder 01',
            'username' => 'podscare_01',
            'threads_user_id' => '17841400000000001',
            'status' => ThreadsAccount::STATUS_ACTIVE,
            'daily_post_cap' => 10,
        ]);

        $campaign = ThreadsSeedingCampaign::create([
            'name' => 'Chiến dịch Seeding Test',
            'type' => ThreadsSeedingCampaign::TYPE_DISCOVERY,
            'keyword' => 'airpods pro 2',
            'dispatch_strategy' => ThreadsSeedingCampaign::STRATEGY_ROUND_ROBIN,
            'content_template' => 'Tham khảo sửa tại PodsCare nhé!',
            'status' => ThreadsSeedingCampaign::STATUS_QUEUED,
            'total_jobs' => 1,
            'completed_jobs' => 0,
            'failed_jobs' => 0,
            'settings' => ['cooldown_min' => 180, 'cooldown_max' => 420],
        ]);

        $replyText = 'Tai nghe AirPods Pro 2 bị rè bass sửa lấy liền tại PodsCare.';
        $hash = ThreadsSeedingJob::computeContentHash($replyText);

        $job = ThreadsSeedingJob::create([
            'campaign_id' => $campaign->id,
            'account_id' => $account->id,
            'target_post_id' => 'post_test_99999',
            'target_post_url' => 'https://www.threads.net/@user/post/xyz',
            'target_author_username' => 'tech_reviewer',
            'target_post_caption' => 'AirPods Pro 2 có đáng mua cuối năm 2026?',
            'target_velocity_score' => 45,
            'target_post_metrics' => ['replies' => 5, 'likes' => 20, 'reposts' => 5],
            'reply_text' => $replyText,
            'content_hash' => $hash,
            'cluster_order' => 1,
            'scheduled_at' => now()->subMinute(),
            'status' => ThreadsSeedingJob::STATUS_QUEUED,
        ]);

        // Kiểm tra quan hệ
        $this->assertCount(1, $campaign->jobs);
        $this->assertEquals($campaign->id, $job->campaign->id);
        $this->assertEquals($account->id, $job->account->id);
        $this->assertCount(1, $account->seedingJobs);

        // Kiểm tra casts
        $this->assertIsArray($campaign->settings);
        $this->assertEquals(180, $campaign->settings['cooldown_min']);
        $this->assertIsArray($job->target_post_metrics);
        $this->assertEquals(5, $job->target_post_metrics['replies']);
        $this->assertIsInt($job->target_velocity_score);

        // Kiểm tra Scopes
        $this->assertEquals(1, ThreadsSeedingCampaign::status(ThreadsSeedingCampaign::STATUS_QUEUED)->count());
        $this->assertEquals(1, ThreadsSeedingCampaign::type(ThreadsSeedingCampaign::TYPE_DISCOVERY)->count());
        $this->assertEquals(1, ThreadsSeedingJob::queued()->count());
        $this->assertEquals(1, ThreadsSeedingJob::readyToPublish()->count());

        // Kiểm tra Hash chuẩn hóa
        $hash2 = ThreadsSeedingJob::computeContentHash('  TAI NGHE airpods pro 2 BỊ RÈ BASS SỬA LẤY LIỀN TẠI PODSCARE.  ');
        $this->assertEquals($hash, $hash2);
    }
}
