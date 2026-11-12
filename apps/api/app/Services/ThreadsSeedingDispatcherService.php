<?php

namespace App\Services;

use App\Jobs\PublishThreadsReplyJob;
use App\Models\ThreadsAccount;
use App\Models\ThreadsSeedingCampaign;
use App\Models\ThreadsSeedingJob;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ThreadsSeedingDispatcherService
{
    public const DEFAULT_COOLDOWN_MIN_SECONDS = 180;
    public const DEFAULT_COOLDOWN_MAX_SECONDS = 420;
    public const CLUSTER_MIN_DELAY_SECONDS = 900; // 15 phút

    public function __construct(
        protected ThreadsDiscoveryService $discoveryService
    ) {}

    /**
     * Lấy danh sách các tài khoản Threads đủ điều kiện xuất bản seeding:
     * - Trạng thái: active
     * - Token: Còn hạn và đã được mã hóa hợp lệ
     * - Hạn mức: Chưa vượt quá daily_post_cap trong ngày hôm nay
     *
     * @param  array<int, int>|null  $accountIds
     * @return Collection<int, ThreadsAccount>
     */
    public function getEligibleAccounts(?array $accountIds = null): Collection
    {
        $query = ThreadsAccount::query()->where('status', ThreadsAccount::STATUS_ACTIVE);

        if (! empty($accountIds)) {
            $query->whereIn('id', $accountIds);
        }

        $candidates = $query->get();
        $startOfToday = now()->startOfDay();

        return $candidates->filter(function (ThreadsAccount $account) use ($startOfToday) {
            // Kiểm tra token chưa hết hạn và đã mã hóa
            if (! $account->hasValidToken()) {
                return false;
            }

            // Đếm số job seeding đã tạo trong ngày hôm nay (trừ các job đã failed hoặc skipped)
            $usedToday = ThreadsSeedingJob::query()
                ->where('account_id', $account->id)
                ->where('created_at', '>=', $startOfToday)
                ->whereNotIn('status', [ThreadsSeedingJob::STATUS_FAILED, ThreadsSeedingJob::STATUS_SKIPPED])
                ->count();

            $cap = (int) ($account->daily_post_cap ?: 10);
            $remaining = $cap - $usedToday;

            if ($remaining <= 0) {
                return false;
            }

            $account->setAttribute('remaining_quota', $remaining);
            $account->setAttribute('daily_comment_count', $usedToday);

            return true;
        })->values();
    }

    /**
     * Kiểm tra va chạm nội dung trên cùng 1 bài viết mục tiêu (Anti-Collision).
     * Trả về true nếu phát hiện trùng lặp trong 24 giờ qua.
     */
    public function checkAntiCollision(string $targetPostId, string $replyText): bool
    {
        $contentHash = ThreadsSeedingJob::computeContentHash($replyText);
        $since = now()->subHours(24);

        return ThreadsSeedingJob::query()
            ->where('target_post_id', trim($targetPostId))
            ->where('content_hash', $contentHash)
            ->where('created_at', '>=', $since)
            ->whereNotIn('status', [ThreadsSeedingJob::STATUS_FAILED, ThreadsSeedingJob::STATUS_SKIPPED])
            ->exists();
    }

    /**
     * Điều phối chiến dịch Seeding từ kết quả Discovery (10 bài hot).
     *
     * @param  array<string, mixed>  $payload
     * @return array{campaign: ThreadsSeedingCampaign, jobs_count: int, message: string}
     */
    public function dispatchDiscovery(array $payload, ?int $userId = null): array
    {
        $selectedPosts = $payload['selected_posts'] ?? [];
        if (empty($selectedPosts) || ! is_array($selectedPosts)) {
            throw ValidationException::withMessages([
                'selected_posts' => 'Vui lòng chọn ít nhất 1 bài viết mục tiêu để điều phối seeding.',
            ]);
        }

        $formattedTargets = [];
        foreach ($selectedPosts as $item) {
            $postId = (string) ($item['post_id'] ?? '');
            if ($postId === '') {
                continue;
            }

            $formattedTargets[] = [
                'target_post_id' => $postId,
                'target_post_url' => (string) ($item['permalink'] ?? "https://www.threads.net/t/{$postId}"),
                'target_author_username' => (string) ($item['author_username'] ?? 'threads_user'),
                'target_post_caption' => (string) ($item['caption'] ?? ''),
                'target_velocity_score' => (int) ($item['velocity_score'] ?? 0),
                'target_post_metrics' => is_array($item['metrics'] ?? null) ? $item['metrics'] : null,
            ];
        }

        if (empty($formattedTargets)) {
            throw ValidationException::withMessages([
                'selected_posts' => 'Dữ liệu các bài viết mục tiêu không hợp lệ.',
            ]);
        }

        $campaignName = trim((string) ($payload['name'] ?? '')) ?: ('Discovery Seeding ' . now()->format('d/m/Y H:i'));
        $contentTemplate = trim((string) ($payload['content_template'] ?? ($payload['reply_text'] ?? '')));
        if ($contentTemplate === '') {
            throw ValidationException::withMessages([
                'content_template' => 'Nội dung bình luận soạn sẵn không được để trống.',
            ]);
        }

        $strategy = (string) ($payload['dispatch_strategy'] ?? ThreadsSeedingCampaign::STRATEGY_ROUND_ROBIN);
        $accountIds = isset($payload['account_ids']) && is_array($payload['account_ids']) ? $payload['account_ids'] : null;

        return $this->executeDispatch(
            type: ThreadsSeedingCampaign::TYPE_DISCOVERY,
            name: $campaignName,
            keyword: (string) ($payload['keyword'] ?? null),
            contentTemplate: $contentTemplate,
            strategy: $strategy,
            targets: $formattedTargets,
            accountIds: $accountIds,
            userId: $userId,
            settings: [
                'cooldown_min_seconds' => (int) ($payload['cooldown_min_seconds'] ?? self::DEFAULT_COOLDOWN_MIN_SECONDS),
                'cooldown_max_seconds' => (int) ($payload['cooldown_max_seconds'] ?? self::DEFAULT_COOLDOWN_MAX_SECONDS),
                'cluster_secondary_template' => (string) ($payload['cluster_content_template'] ?? ''),
            ]
        );
    }

    /**
     * Điều phối chiến dịch Seeding theo danh sách liên kết bài viết Threads chỉ định.
     *
     * @param  array<string, mixed>  $payload
     * @return array{campaign: ThreadsSeedingCampaign, jobs_count: int, message: string}
     */
    public function dispatchDirect(array $payload, ?int $userId = null): array
    {
        $urls = (array) ($payload['post_urls'] ?? []);
        if (empty($urls)) {
            throw ValidationException::withMessages([
                'post_urls' => 'Vui lòng cung cấp ít nhất 1 liên kết bài viết Threads.',
            ]);
        }

        $parsed = $this->discoveryService->parseDirectPostUrls($urls);
        if (! empty($parsed['invalid'])) {
            throw ValidationException::withMessages([
                'post_urls' => 'Có ' . count($parsed['invalid']) . ' liên kết không đúng định dạng tên miền threads.net.',
            ]);
        }

        if (empty($parsed['valid'])) {
            throw ValidationException::withMessages([
                'post_urls' => 'Không tìm thấy liên kết Threads hợp lệ nào.',
            ]);
        }

        $formattedTargets = [];
        foreach ($parsed['valid'] as $item) {
            $formattedTargets[] = [
                'target_post_id' => $item['post_id'],
                'target_post_url' => $item['permalink'],
                'target_author_username' => $item['author_username'],
                'target_post_caption' => $item['caption'],
                'target_velocity_score' => 0,
                'target_post_metrics' => $item['metrics'],
            ];
        }

        $campaignName = trim((string) ($payload['name'] ?? '')) ?: ('Direct Seeding ' . now()->format('d/m/Y H:i'));
        $contentTemplate = trim((string) ($payload['reply_text'] ?? ($payload['content_template'] ?? '')));
        if ($contentTemplate === '') {
            throw ValidationException::withMessages([
                'reply_text' => 'Nội dung bình luận soạn sẵn không được để trống.',
            ]);
        }

        $strategy = (string) ($payload['dispatch_strategy'] ?? ThreadsSeedingCampaign::STRATEGY_ROUND_ROBIN);
        $accountIds = isset($payload['account_ids']) && is_array($payload['account_ids']) ? $payload['account_ids'] : null;

        return $this->executeDispatch(
            type: ThreadsSeedingCampaign::TYPE_DIRECT,
            name: $campaignName,
            keyword: null,
            contentTemplate: $contentTemplate,
            strategy: $strategy,
            targets: $formattedTargets,
            accountIds: $accountIds,
            userId: $userId,
            settings: [
                'cooldown_min_seconds' => (int) ($payload['cooldown_min_seconds'] ?? self::DEFAULT_COOLDOWN_MIN_SECONDS),
                'cooldown_max_seconds' => (int) ($payload['cooldown_max_seconds'] ?? self::DEFAULT_COOLDOWN_MAX_SECONDS),
                'cluster_secondary_template' => (string) ($payload['cluster_content_template'] ?? ''),
            ]
        );
    }

    /**
     * Khởi tạo chiến dịch và phân bổ dàn tài khoản kèm hàng đợi giãn cách Cooldown Jitter & Anti-Collision.
     *
     * @param  list<array<string, mixed>>  $targets
     * @param  array<string, mixed>  $settings
     * @return array{campaign: ThreadsSeedingCampaign, jobs_count: int, message: string}
     */
    protected function executeDispatch(
        string $type,
        string $name,
        ?string $keyword,
        string $contentTemplate,
        string $strategy,
        array $targets,
        ?array $accountIds,
        ?int $userId,
        array $settings
    ): array {
        // Kiểm tra danh sách tài khoản khả dụng
        $eligibleAccounts = $this->getEligibleAccounts($accountIds);
        if ($eligibleAccounts->isEmpty()) {
            throw ValidationException::withMessages([
                'accounts' => 'Không có tài khoản Threads nào khả dụng (active, token hợp lệ và còn hạn mức trong ngày).',
            ]);
        }

        if ($strategy === ThreadsSeedingCampaign::STRATEGY_CLUSTER && $eligibleAccounts->count() < 2) {
            throw ValidationException::withMessages([
                'dispatch_strategy' => 'Chiến lược Cluster Seeding (tung hứng) yêu cầu tối thiểu 2 tài khoản Threads khả dụng.',
            ]);
        }

        $cooldownMin = max(30, (int) ($settings['cooldown_min_seconds'] ?? self::DEFAULT_COOLDOWN_MIN_SECONDS));
        $cooldownMax = max($cooldownMin, (int) ($settings['cooldown_max_seconds'] ?? self::DEFAULT_COOLDOWN_MAX_SECONDS));
        $clusterSecondaryTemplate = trim((string) ($settings['cluster_secondary_template'] ?? ''));

        return DB::transaction(function () use (
            $type,
            $name,
            $keyword,
            $contentTemplate,
            $strategy,
            $targets,
            $eligibleAccounts,
            $userId,
            $settings,
            $cooldownMin,
            $cooldownMax,
            $clusterSecondaryTemplate
        ): array {
            $campaign = ThreadsSeedingCampaign::create([
                'name' => $name,
                'type' => $type,
                'keyword' => $keyword,
                'dispatch_strategy' => $strategy,
                'content_template' => $contentTemplate,
                'status' => ThreadsSeedingCampaign::STATUS_QUEUED,
                'total_jobs' => 0,
                'completed_jobs' => 0,
                'failed_jobs' => 0,
                'settings' => $settings,
                'created_by' => $userId,
            ]);

            $now = now();
            // Theo dõi thời gian lên lịch kế tiếp cho từng tài khoản
            $accountScheduleTimestamps = [];
            foreach ($eligibleAccounts as $acc) {
                $accountScheduleTimestamps[$acc->id] = $now->copy();
            }

            $createdJobs = [];
            $accountCount = $eligibleAccounts->count();
            $accountIndex = 0;

            foreach ($targets as $targetIndex => $target) {
                $targetPostId = (string) $target['target_post_id'];
                $targetUrl = (string) $target['target_post_url'];
                $authorUsername = $target['target_author_username'] ?? null;
                $caption = $target['target_post_caption'] ?? null;
                $velocityScore = (int) ($target['target_velocity_score'] ?? 0);
                $metrics = $target['target_post_metrics'] ?? null;

                if ($strategy === ThreadsSeedingCampaign::STRATEGY_CLUSTER) {
                    // Chiến lược Cluster: Gán 2 tài khoản KHÁC NHAU vào cùng 1 bài viết
                    $acc1 = $eligibleAccounts[$accountIndex % $accountCount];
                    $acc2 = $eligibleAccounts[($accountIndex + 1) % $accountCount];
                    $accountIndex += 2;

                    // Bài 1 (cluster_order = 1)
                    $jitter1 = random_int($cooldownMin, $cooldownMax);
                    $accountScheduleTimestamps[$acc1->id] = $accountScheduleTimestamps[$acc1->id]->addSeconds($jitter1);
                    $scheduled1 = $accountScheduleTimestamps[$acc1->id]->copy();

                    $replyText1 = $contentTemplate;
                    $createdJobs[] = $this->createSeedingJob(
                        campaign: $campaign,
                        account: $acc1,
                        targetPostId: $targetPostId,
                        targetUrl: $targetUrl,
                        authorUsername: $authorUsername,
                        caption: $caption,
                        velocityScore: $velocityScore,
                        metrics: $metrics,
                        replyText: $replyText1,
                        clusterOrder: 1,
                        scheduledAt: $scheduled1
                    );

                    // Bài 2 (cluster_order = 2): Đăng sau bài 1 tối thiểu 15 phút (900s) + jitter
                    $clusterGap = self::CLUSTER_MIN_DELAY_SECONDS + random_int(60, 300);
                    $scheduled2 = $scheduled1->copy()->addSeconds($clusterGap);
                    if ($accountScheduleTimestamps[$acc2->id]->lt($scheduled2)) {
                        $accountScheduleTimestamps[$acc2->id] = $scheduled2->copy();
                    } else {
                        $accountScheduleTimestamps[$acc2->id] = $accountScheduleTimestamps[$acc2->id]->addSeconds(random_int($cooldownMin, $cooldownMax));
                        $scheduled2 = $accountScheduleTimestamps[$acc2->id]->copy();
                    }

                    // Đảm bảo nội dung bài 2 khác bài 1 để chống dẫm chân Anti-Collision
                    $replyText2 = $clusterSecondaryTemplate !== ''
                        ? $clusterSecondaryTemplate
                        : ($contentTemplate . ' (Đồng ý, dịch vụ ở đây uy tín)');

                    $createdJobs[] = $this->createSeedingJob(
                        campaign: $campaign,
                        account: $acc2,
                        targetPostId: $targetPostId,
                        targetUrl: $targetUrl,
                        authorUsername: $authorUsername,
                        caption: $caption,
                        velocityScore: $velocityScore,
                        metrics: $metrics,
                        replyText: $replyText2,
                        clusterOrder: 2,
                        scheduledAt: $scheduled2
                    );
                } else {
                    // Chiến lược Round-Robin hoặc Manual: Phân bổ 1 tài khoản cho 1 bài viết
                    $acc = $eligibleAccounts[$accountIndex % $accountCount];
                    $accountIndex++;

                    $jitter = ($targetIndex === 0) ? random_int(5, 30) : random_int($cooldownMin, $cooldownMax);
                    $accountScheduleTimestamps[$acc->id] = $accountScheduleTimestamps[$acc->id]->addSeconds($jitter);
                    $scheduledAt = $accountScheduleTimestamps[$acc->id]->copy();

                    $createdJobs[] = $this->createSeedingJob(
                        campaign: $campaign,
                        account: $acc,
                        targetPostId: $targetPostId,
                        targetUrl: $targetUrl,
                        authorUsername: $authorUsername,
                        caption: $caption,
                        velocityScore: $velocityScore,
                        metrics: $metrics,
                        replyText: $contentTemplate,
                        clusterOrder: 1,
                        scheduledAt: $scheduledAt
                    );
                }
            }

            $campaign->total_jobs = count($createdJobs);
            $campaign->save();

            // Đẩy các job hợp lệ vào Queue
            foreach ($createdJobs as $job) {
                if ($job->status === ThreadsSeedingJob::STATUS_QUEUED) {
                    $delay = ($job->scheduled_at !== null && $job->scheduled_at->isFuture())
                        ? $job->scheduled_at
                        : null;

                    if ($delay) {
                        PublishThreadsReplyJob::dispatch($job->id)->delay($delay)->onQueue('threads-seeding');
                    } else {
                        PublishThreadsReplyJob::dispatch($job->id)->onQueue('threads-seeding');
                    }
                }
            }

            return [
                'campaign' => $campaign->fresh(['jobs.account']),
                'jobs_count' => count($createdJobs),
                'message' => 'Điều phối chiến dịch Seeding thành công.',
            ];
        });
    }

    /**
     * Tạo bản ghi ThreadsSeedingJob và kiểm tra Anti-Collision.
     */
    protected function createSeedingJob(
        ThreadsSeedingCampaign $campaign,
        ThreadsAccount $account,
        string $targetPostId,
        string $targetUrl,
        ?string $authorUsername,
        ?string $caption,
        int $velocityScore,
        ?array $metrics,
        string $replyText,
        int $clusterOrder,
        Carbon $scheduledAt
    ): ThreadsSeedingJob {
        $contentHash = ThreadsSeedingJob::computeContentHash($replyText);

        // Kiểm tra Anti-Collision (chống trùng lặp nội dung trên cùng post_id trong 24h)
        $isCollision = $this->checkAntiCollision($targetPostId, $replyText);

        $status = $isCollision ? ThreadsSeedingJob::STATUS_SKIPPED : ThreadsSeedingJob::STATUS_QUEUED;
        $errorCode = $isCollision ? 'ANTI_COLLISION' : null;
        $errorMessage = $isCollision ? 'Hủy xuất bản do phát hiện trùng lặp nội dung với bình luận khác trên cùng bài viết trong 24 giờ qua (Anti-Collision).' : null;

        return ThreadsSeedingJob::create([
            'campaign_id' => $campaign->id,
            'account_id' => $account->id,
            'target_post_id' => $targetPostId,
            'target_post_url' => $targetUrl,
            'target_author_username' => $authorUsername,
            'target_post_caption' => $caption,
            'target_velocity_score' => $velocityScore,
            'target_post_metrics' => $metrics,
            'reply_text' => $replyText,
            'content_hash' => $contentHash,
            'cluster_order' => $clusterOrder,
            'scheduled_at' => $scheduledAt,
            'status' => $status,
            'error_code' => $errorCode,
            'error_message' => $errorMessage,
        ]);
    }
}
