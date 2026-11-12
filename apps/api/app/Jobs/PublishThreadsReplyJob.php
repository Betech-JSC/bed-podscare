<?php

namespace App\Jobs;

use App\Models\ThreadsAccount;
use App\Models\ThreadsSeedingCampaign;
use App\Models\ThreadsSeedingJob;
use App\Services\Threads\ThreadsGraphApiClient;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class PublishThreadsReplyJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $jobId;

    public int $tries = 3;

    public int $timeout = 120;

    /**
     * Create a new job instance.
     */
    public function __construct(int|ThreadsSeedingJob $job)
    {
        $this->jobId = $job instanceof ThreadsSeedingJob ? (int) $job->id : (int) $job;
    }

    /**
     * Execute the job.
     */
    public function handle(ThreadsGraphApiClient $graphClient): void
    {
        /** @var ThreadsSeedingJob|null $job */
        $job = ThreadsSeedingJob::with(['account', 'campaign'])->find($this->jobId);

        if (! $job) {
            Log::warning("PublishThreadsReplyJob: Không tìm thấy job #{$this->jobId}.");

            return;
        }

        // Idempotency: Không chạy lại nếu đã xuất bản thành công hoặc bị hủy
        if (in_array($job->status, [ThreadsSeedingJob::STATUS_PUBLISHED, ThreadsSeedingJob::STATUS_SKIPPED], true)) {
            return;
        }

        $account = $job->account;
        if (! $account) {
            $job->update([
                'status' => ThreadsSeedingJob::STATUS_FAILED,
                'error_code' => 'ACCOUNT_NOT_FOUND',
                'error_message' => 'Không tìm thấy tài khoản Threads tương ứng cho job này.',
            ]);
            $this->updateCampaignProgress($job->campaign);

            return;
        }

        // Kiểm tra tính hợp lệ của tài khoản trước khi gọi API
        if ($account->status !== ThreadsAccount::STATUS_ACTIVE || ! $account->hasValidToken()) {
            $job->update([
                'status' => ThreadsSeedingJob::STATUS_FAILED,
                'error_code' => 'ACCOUNT_INACTIVE_OR_EXPIRED',
                'error_message' => 'Tài khoản Threads không ở trạng thái hoạt động (active) hoặc token đã hết hạn.',
            ]);
            $this->updateCampaignProgress($job->campaign);

            return;
        }

        // Kiểm tra Anti-Collision lần 2 chống va chạm nội dung trong 24h
        $hasDuplicate = ThreadsSeedingJob::query()
            ->where('target_post_id', $job->target_post_id)
            ->where('content_hash', $job->content_hash)
            ->where('id', '!=', $job->id)
            ->where('status', ThreadsSeedingJob::STATUS_PUBLISHED)
            ->where('created_at', '>=', now()->subHours(24))
            ->exists();

        if ($hasDuplicate) {
            $job->update([
                'status' => ThreadsSeedingJob::STATUS_SKIPPED,
                'error_code' => 'ANTI_COLLISION',
                'error_message' => 'Hủy xuất bản do phát hiện nội dung này đã được tài khoản khác xuất bản trên cùng bài viết trong 24 giờ qua (Anti-Collision).',
            ]);
            $this->updateCampaignProgress($job->campaign);

            return;
        }

        // Đánh dấu job và campaign sang processing
        $job->update(['status' => ThreadsSeedingJob::STATUS_PROCESSING]);
        if ($job->campaign && $job->campaign->status === ThreadsSeedingCampaign::STATUS_QUEUED) {
            $job->campaign->update(['status' => ThreadsSeedingCampaign::STATUS_PROCESSING]);
        }

        // BƯỚC 1: Tạo media container nếu chưa có
        $containerId = $job->container_id;
        if (empty($containerId)) {
            $createResult = $graphClient->createContainer(
                $account,
                [
                    'content_text' => $job->reply_text,
                    'media_type' => 'TEXT',
                ],
                $job->target_post_id
            );

            if (! ($createResult['ok'] ?? false) || empty($createResult['container_id'])) {
                $job->update([
                    'status' => ThreadsSeedingJob::STATUS_FAILED,
                    'retry_count' => $job->retry_count + 1,
                    'error_code' => $createResult['error_code'] ?? 'CONTAINER_CREATION_FAILED',
                    'error_message' => $createResult['error_message'] ?? 'Lỗi tạo container bài đăng Threads.',
                ]);
                $this->updateCampaignProgress($job->campaign);

                return;
            }

            $containerId = (string) $createResult['container_id'];
            $job->update(['container_id' => $containerId]);
        }

        // BƯỚC 1.5: Kiểm tra trạng thái Container cho tới khi FINISHED hoặc PUBLISHED
        $pollResult = $graphClient->pollContainerUntilFinished($account, $containerId, (int) $job->id);
        if (! ($pollResult['ok'] ?? false)) {
            $job->update([
                'status' => ThreadsSeedingJob::STATUS_FAILED,
                'retry_count' => $job->retry_count + 1,
                'error_code' => $pollResult['error_code'] ?? 'CONTAINER_PROCESSING_FAILED',
                'error_message' => $pollResult['error_message'] ?? 'Container xử lý không thành công trên Meta Threads.',
            ]);
            $this->updateCampaignProgress($job->campaign);

            return;
        }

        // BƯỚC 2: Xuất bản Container thành bài đăng Threads chính thức
        $publishResult = $graphClient->publishContainer($account, $containerId, (int) $job->id);
        if (! ($publishResult['ok'] ?? false) || empty($publishResult['threads_media_id'])) {
            $job->update([
                'status' => ThreadsSeedingJob::STATUS_FAILED,
                'retry_count' => $job->retry_count + 1,
                'error_code' => $publishResult['error_code'] ?? 'PUBLISH_FAILED',
                'error_message' => $publishResult['error_message'] ?? 'Xuất bản container thành bài đăng chính thức thất bại.',
            ]);
            $this->updateCampaignProgress($job->campaign);

            return;
        }

        // Xuất bản thành công!
        $mediaId = (string) $publishResult['threads_media_id'];
        $username = $account->username ?: 'me';
        $permalink = "https://www.threads.net/@{$username}/post/{$mediaId}";

        $job->update([
            'status' => ThreadsSeedingJob::STATUS_PUBLISHED,
            'threads_media_id' => $mediaId,
            'permalink' => $permalink,
            'published_at' => now(),
            'error_code' => null,
            'error_message' => null,
        ]);

        $this->updateCampaignProgress($job->campaign);
    }

    /**
     * Cập nhật tiến độ và trạng thái tổng quan của chiến dịch sở hữu job này.
     */
    protected function updateCampaignProgress(?ThreadsSeedingCampaign $campaign): void
    {
        if (! $campaign) {
            return;
        }

        $total = $campaign->jobs()->count();
        $completed = $campaign->jobs()->where('status', ThreadsSeedingJob::STATUS_PUBLISHED)->count();
        $failed = $campaign->jobs()->whereIn('status', [ThreadsSeedingJob::STATUS_FAILED, ThreadsSeedingJob::STATUS_SKIPPED])->count();
        $processing = $campaign->jobs()->where('status', ThreadsSeedingJob::STATUS_PROCESSING)->count();

        $campaign->total_jobs = $total;
        $campaign->completed_jobs = $completed;
        $campaign->failed_jobs = $failed;

        if ($total > 0 && ($completed + $failed) >= $total) {
            if ($failed === 0) {
                $campaign->status = ThreadsSeedingCampaign::STATUS_COMPLETED;
            } elseif ($completed > 0) {
                $campaign->status = ThreadsSeedingCampaign::STATUS_PARTIALLY_FAILED;
            } else {
                $campaign->status = ThreadsSeedingCampaign::STATUS_FAILED;
            }
        } elseif ($processing > 0 || $completed > 0 || $failed > 0) {
            $campaign->status = ThreadsSeedingCampaign::STATUS_PROCESSING;
        }

        $campaign->save();
    }
}
