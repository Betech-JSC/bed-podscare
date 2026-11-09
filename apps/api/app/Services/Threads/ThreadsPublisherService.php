<?php

namespace App\Services\Threads;

use App\Models\ThreadsAccount;
use App\Models\ThreadsPost;
use Illuminate\Support\Facades\DB;

class ThreadsPublisherService
{
    public const STATUS_DRAFT = 'draft';
    public const STATUS_SCHEDULED = 'scheduled';
    public const STATUS_PUBLISHING = 'publishing';
    public const STATUS_PUBLISHED = 'published';
    public const STATUS_FAILED = 'failed';
    public const STATUS_CANCELLED = 'cancelled';

    public function __construct(
        protected ThreadsPostValidator $validator,
        protected ThreadsGraphApiClient $graphClient,
        protected ThreadsAlertService $alertService
    ) {}

    /**
     * Tính số phút chờ theo cấp số nhân (Exponential Backoff: lần 1 -> 5m, lần 2 -> 30m, lần 3 -> 120m).
     */
    public function calculateRetryDelayMinutes(int $retryAttempt): int
    {
        $schedule = (array) config('threads.retry_backoff_minutes', [5, 30, 120]);
        $index = max(0, $retryAttempt - 1);

        if (isset($schedule[$index]) && is_numeric($schedule[$index])) {
            return max(1, (int) $schedule[$index]);
        }

        $last = end($schedule);

        return is_numeric($last) ? max(1, (int) $last) : 120;
    }

    /**
     * Đếm số bài đã xuất bản thành công trong ngày hôm nay của một tài khoản.
     */
    public function countPublishedToday(int $accountId): int
    {
        $startOfDay = now()->startOfDay();

        return ThreadsPost::query()
            ->where('account_id', $accountId)
            ->where('status', self::STATUS_PUBLISHED)
            ->where(function ($q) use ($startOfDay) {
                $q->where('published_at', '>=', $startOfDay)
                    ->orWhere(function ($fallback) use ($startOfDay) {
                        $fallback->whereNull('published_at')
                            ->where('updated_at', '>=', $startOfDay);
                    });
            })
            ->count();
    }

    /**
     * Kích hoạt các bài con ở chế độ Auto-chain (reply_to_post_id = $parentPost->id và scheduled_at = null)
     * ngay sau khi bài cha chuyển sang trạng thái published và có threads_media_id.
     * Đặt lịch scheduled_at cách thời điểm hiện tại 30–60 giây.
     */
    public function activateAutoChainReplies(ThreadsPost $parentPost): int
    {
        if ($parentPost->status !== self::STATUS_PUBLISHED || empty($parentPost->threads_media_id)) {
            return 0;
        }

        $minDelay = max(1, (int) config('threads.auto_chain_delay_min_seconds', 30));
        $maxDelay = max($minDelay, (int) config('threads.auto_chain_delay_max_seconds', 60));

        $autoChainChildren = ThreadsPost::query()
            ->where('reply_to_post_id', $parentPost->getKey())
            ->whereNull('scheduled_at')
            ->whereIn('status', [self::STATUS_SCHEDULED, self::STATUS_DRAFT])
            ->orderBy('reply_order')
            ->orderBy('id')
            ->get();

        $activatedCount = 0;
        foreach ($autoChainChildren as $childPost) {
            $delaySeconds = random_int($minDelay, $maxDelay);
            $childPost->status = self::STATUS_SCHEDULED;
            $childPost->scheduled_at = now()->addSeconds($delaySeconds);
            $childPost->save();
            $activatedCount++;
        }

        return $activatedCount;
    }

    /**
     * Thực thi xuất bản một bài đăng cụ thể với khóa nguyên tử (DB::transaction + lockForUpdate),
     * kiểm tra hạn mức kép, đối soát Idempotency container_id, retry Exponential Backoff và Auto-chain.
     *
     * @return array<string, mixed>
     */
    public function publishPost(ThreadsPost|int $postOrId, bool $ignoreSchedule = false): array
    {
        $postId = $postOrId instanceof ThreadsPost ? (int) $postOrId->getKey() : (int) $postOrId;

        /** @var array{state: string, post: ?ThreadsPost, account: ?ThreadsAccount, parent: ?ThreadsPost, message: string} $lockOutcome */
        $lockOutcome = DB::transaction(function () use ($postId, $ignoreSchedule): array {
            /** @var ThreadsPost|null $lockedPost */
            $lockedPost = ThreadsPost::query()
                ->whereKey($postId)
                ->lockForUpdate()
                ->first();

            if (! $lockedPost) {
                return [
                    'state'   => 'not_found',
                    'post'    => null,
                    'account' => null,
                    'parent'  => null,
                    'message' => "Không tìm thấy bài đăng #{$postId}.",
                ];
            }

            if ($lockedPost->status === self::STATUS_PUBLISHED) {
                return [
                    'state'   => 'already_published',
                    'post'    => $lockedPost,
                    'account' => null,
                    'parent'  => null,
                    'message' => "Bài đăng #{$postId} đã được xuất bản trước đó.",
                ];
            }

            if ($lockedPost->status === self::STATUS_PUBLISHING) {
                return [
                    'state'   => 'already_publishing',
                    'post'    => $lockedPost,
                    'account' => null,
                    'parent'  => null,
                    'message' => "Bài đăng #{$postId} đang được xử lý bởi một tiến trình khác.",
                ];
            }

            if ($lockedPost->status === self::STATUS_CANCELLED) {
                return [
                    'state'   => 'cancelled',
                    'post'    => $lockedPost,
                    'account' => null,
                    'parent'  => null,
                    'message' => "Bài đăng #{$postId} đã bị hủy.",
                ];
            }

            if (! $ignoreSchedule) {
                if ($lockedPost->status !== self::STATUS_SCHEDULED) {
                    return [
                        'state'   => 'not_scheduled',
                        'post'    => $lockedPost,
                        'account' => null,
                        'parent'  => null,
                        'message' => "Bài đăng #{$postId} đang ở trạng thái '{$lockedPost->status}', không phải 'scheduled'.",
                    ];
                }

                if ($lockedPost->next_retry_at !== null && $lockedPost->next_retry_at->isFuture()) {
                    return [
                        'state'   => 'waiting_retry_window',
                        'post'    => $lockedPost,
                        'account' => null,
                        'parent'  => null,
                        'message' => "Bài đăng #{$postId} chưa đến thời điểm retry ({$lockedPost->next_retry_at->toIso8601String()}).",
                    ];
                }

                if ($lockedPost->next_retry_at === null && $lockedPost->scheduled_at !== null && $lockedPost->scheduled_at->isFuture()) {
                    return [
                        'state'   => 'waiting_scheduled_time',
                        'post'    => $lockedPost,
                        'account' => null,
                        'parent'  => null,
                        'message' => "Bài đăng #{$postId} chưa đến giờ hẹn đăng ({$lockedPost->scheduled_at->toIso8601String()}).",
                    ];
                }

                if ($lockedPost->reply_to_post_id !== null && $lockedPost->scheduled_at === null && $lockedPost->next_retry_at === null) {
                    return [
                        'state'   => 'waiting_auto_chain_trigger',
                        'post'    => $lockedPost,
                        'account' => null,
                        'parent'  => null,
                        'message' => "Bài con #{$postId} đang ở chế độ Auto-chain chờ bài cha xuất bản.",
                    ];
                }
            }

            /** @var ThreadsAccount|null $account */
            $account = ThreadsAccount::query()->find($lockedPost->account_id);
            if (! $account) {
                $lockedPost->status = self::STATUS_FAILED;
                $lockedPost->error_code = 'ACCOUNT_NOT_FOUND';
                $lockedPost->error_message = 'Không tìm thấy tài khoản Threads liên kết với bài đăng.';
                $lockedPost->save();
                $this->cascadeFailDependentReplies($lockedPost);

                return [
                    'state'   => 'account_missing',
                    'post'    => $lockedPost,
                    'account' => null,
                    'parent'  => null,
                    'message' => $lockedPost->error_message,
                ];
            }

            if ($account->status !== ThreadsAccount::STATUS_ACTIVE) {
                return [
                    'state'   => 'account_inactive',
                    'post'    => $lockedPost,
                    'account' => $account,
                    'parent'  => null,
                    'message' => "Tài khoản #{$account->id} đang ở trạng thái '{$account->status}', bỏ qua xuất bản.",
                ];
            }

            // Kiểm tra điều kiện bài cha nếu đây là bài nối tiếp trong chuỗi (Flexible Multi-post Thread)
            $parentPost = null;
            if ($lockedPost->reply_to_post_id !== null) {
                /** @var ThreadsPost|null $parentPost */
                $parentPost = ThreadsPost::query()->find($lockedPost->reply_to_post_id);
                if (! $parentPost || in_array($parentPost->status, [self::STATUS_FAILED, self::STATUS_CANCELLED], true)) {
                    $lockedPost->status = self::STATUS_FAILED;
                    $lockedPost->error_code = 'PARENT_POST_FAILED';
                    $lockedPost->error_message = 'Bài cha trong chuỗi đã thất bại hoặc bị hủy nên bài con không được xuất bản độc lập.';
                    $lockedPost->next_retry_at = null;
                    $lockedPost->save();
                    $this->cascadeFailDependentReplies($lockedPost);

                    return [
                        'state'   => 'parent_failed',
                        'post'    => $lockedPost,
                        'account' => $account,
                        'parent'  => $parentPost,
                        'message' => $lockedPost->error_message,
                    ];
                }

                if ($parentPost->status !== self::STATUS_PUBLISHED || empty($parentPost->threads_media_id)) {
                    return [
                        'state'   => 'waiting_for_parent',
                        'post'    => $lockedPost,
                        'account' => $account,
                        'parent'  => $parentPost,
                        'message' => "Bài con #{$lockedPost->id} đang đợi bài cha #{$parentPost->id} hoàn tất xuất bản.",
                    ];
                }
            }

            // Kiểm tra trần daily_post_cap nội bộ của tài khoản
            $dailyCap = max(1, (int) ($account->daily_post_cap ?: config('threads.default_daily_post_cap', 8)));
            $publishedToday = $this->countPublishedToday((int) $account->id);
            if ($publishedToday >= $dailyCap) {
                $lockedPost->status = self::STATUS_SCHEDULED;
                $lockedPost->scheduled_at = now()->addHour();
                $lockedPost->error_code = 'DAILY_POST_CAP_REACHED';
                $lockedPost->error_message = "Tài khoản đã chạm trần daily_post_cap ({$publishedToday}/{$dailyCap}) trong ngày; tự động hoãn 1 giờ.";
                $lockedPost->save();

                return [
                    'state'   => 'deferred_daily_cap',
                    'post'    => $lockedPost,
                    'account' => $account,
                    'parent'  => $parentPost,
                    'message' => $lockedPost->error_message,
                ];
            }

            // Chuyển trạng thái nguyên tử sang 'publishing'
            $lockedPost->status = self::STATUS_PUBLISHING;
            $lockedPost->save();

            return [
                'state'   => 'locked_for_publishing',
                'post'    => $lockedPost,
                'account' => $account,
                'parent'  => $parentPost,
                'message' => 'Đã khóa bài đăng sang trạng thái publishing.',
            ];
        });

        if ($lockOutcome['state'] !== 'locked_for_publishing') {
            $post = $lockOutcome['post'];

            return [
                'success'            => $lockOutcome['state'] === 'already_published',
                'ok'                 => $lockOutcome['state'] === 'already_published',
                'status'             => $lockOutcome['state'],
                'post_status'        => $post?->status,
                'post'               => $post,
                'container_id'       => $post?->container_id,
                'threads_media_id'   => $post?->threads_media_id,
                'permalink'          => $post?->permalink,
                'retry_count'        => (int) ($post?->retry_count ?? 0),
                'next_retry_at'      => $post?->next_retry_at?->toIso8601String(),
                'auto_chained_count' => 0,
                'error_code'         => $post?->error_code,
                'error_message'      => $post?->error_message,
                'message'            => $lockOutcome['message'],
            ];
        }

        /** @var ThreadsPost $post */
        $post = $lockOutcome['post'];
        /** @var ThreadsAccount $account */
        $account = $lockOutcome['account'];
        /** @var ThreadsPost|null $parentPost */
        $parentPost = $lockOutcome['parent'];

        // Kiểm định dữ liệu bài đăng qua ThreadsPostValidator trước khi gọi API
        $validation = $this->validator->validate($post, (int) $post->getKey(), false, false);
        if (! $validation['valid']) {
            $post->status = self::STATUS_FAILED;
            $post->error_code = $validation['first_error_code'] ?? 'VALIDATION_FAILED';
            $post->error_message = $validation['first_error_message'] ?? 'Bài đăng không vượt qua bộ kiểm định.';
            $post->next_retry_at = null;
            $post->save();
            $this->cascadeFailDependentReplies($post);

            return $this->buildResult(false, 'validation_failed', $post, 0, $post->error_message);
        }

        // Cập nhật content_hash nếu bài đăng chưa có
        if (empty($post->content_hash) && ! empty($validation['content_hash'])) {
            $post->content_hash = $validation['content_hash'];
            $post->save();
        }

        // Bước 0: Kiểm tra hạn mức thực tế từ Meta API (GET /{threads_user_id}/threads_publishing_limit >= 10%)
        $minQuotaRatio = (float) config('threads.min_quota_remaining_ratio', 0.10);
        $quotaResult = $this->graphClient->getPublishingLimit($account, (int) $post->getKey());

        if ($quotaResult['is_auth_error']) {
            return $this->handleAuthFailure(
                $post,
                $account,
                $quotaResult['error_code'] ?? 'AUTH_ERROR_401_403',
                $quotaResult['error_message'] ?? 'Token không hợp lệ hoặc đã hết hạn khi kiểm tra hạn mức.'
            );
        }

        if ($quotaResult['remaining_ratio'] < $minQuotaRatio) {
            $post->status = self::STATUS_SCHEDULED;
            $post->scheduled_at = now()->addHour();
            $post->error_code = 'QUOTA_BELOW_THRESHOLD';
            $post->error_message = sprintf(
                'Hạn mức xuất bản 24h còn dưới 10%% (%d/%d bài còn trống ~ %.1f%%). Tự động hoãn 1 giờ.',
                $quotaResult['quota_remaining'],
                $quotaResult['quota_total'],
                $quotaResult['remaining_percent']
            );
            $post->save();

            $this->alertService->sendLowQuotaAlert(
                $account,
                (int) $quotaResult['quota_used'],
                (int) $quotaResult['quota_total'],
                $post
            );

            return $this->buildResult(false, 'deferred_low_quota', $post, 0, $post->error_message);
        }

        // Bước 1 & Đối soát Idempotency: Kiểm tra xem bài đã có container_id từ lần thử trước chưa
        $containerId = trim((string) ($post->container_id ?? ''));

        if ($containerId !== '') {
            $pollResult = $this->graphClient->pollContainerUntilFinished(
                $account,
                $containerId,
                (int) $post->getKey()
            );

            if ($pollResult['is_auth_error']) {
                return $this->handleAuthFailure(
                    $post,
                    $account,
                    $pollResult['error_code'] ?? 'AUTH_ERROR_401_403',
                    $pollResult['error_message'] ?? 'Token không hợp lệ khi kiểm tra trạng thái container.'
                );
            }

            // Nếu container đã ở trạng thái PUBLISHED trên Meta -> Cập nhật ngay sang published, KHÔNG tạo container mới và KHÔNG gọi publish lần 2
            if ($pollResult['ok'] && $pollResult['status'] === ThreadsGraphApiClient::STATUS_PUBLISHED) {
                $resolvedMediaId = $pollResult['published_media_id']
                    ?: ($post->threads_media_id ?: $containerId);

                return $this->completePublication($post, $account, $resolvedMediaId);
            }

            if ($pollResult['ok'] && $pollResult['status'] === ThreadsGraphApiClient::STATUS_IN_PROGRESS) {
                return $this->handleRetryOrFail(
                    $post,
                    $account,
                    'CONTAINER_IN_PROGRESS',
                    "Media Container #{$containerId} vẫn đang xử lý (IN_PROGRESS) trên máy chủ Meta."
                );
            }

            if (! $pollResult['ok']) {
                if (in_array($pollResult['status'], [ThreadsGraphApiClient::STATUS_ERROR, ThreadsGraphApiClient::STATUS_EXPIRED], true)) {
                    $post->container_id = null;
                    $post->save();
                }

                return $this->handleRetryOrFail(
                    $post,
                    $account,
                    $pollResult['error_code'] ?? 'CONTAINER_POLL_FAILED',
                    $pollResult['error_message'] ?? 'Không thể xác nhận trạng thái Media Container.'
                );
            }
        } else {
            // Chưa có container_id -> Tạo mới Media Container (Bước 1)
            $replyToMediaId = $parentPost ? trim((string) $parentPost->threads_media_id) : null;

            $createResult = $this->graphClient->createContainer($account, $post, $replyToMediaId);

            if ($createResult['is_auth_error']) {
                return $this->handleAuthFailure(
                    $post,
                    $account,
                    $createResult['error_code'] ?? 'AUTH_ERROR_401_403',
                    $createResult['error_message'] ?? 'Token không hợp lệ khi khởi tạo Media Container.'
                );
            }

            if (! $createResult['ok'] || empty($createResult['container_id'])) {
                return $this->handleRetryOrFail(
                    $post,
                    $account,
                    $createResult['error_code'] ?? 'CREATE_CONTAINER_FAILED',
                    $createResult['error_message'] ?? 'Khởi tạo Media Container thất bại.'
                );
            }

            $containerId = (string) $createResult['container_id'];

            // Lưu ngay container_id vào DB để đảm bảo Idempotency nếu bước sau bị timeout mạng
            $post->container_id = $containerId;
            $post->save();

            // Bước 1.5: Poll trạng thái container cho tới khi đạt FINISHED
            $pollResult = $this->graphClient->pollContainerUntilFinished(
                $account,
                $containerId,
                (int) $post->getKey()
            );

            if ($pollResult['is_auth_error']) {
                return $this->handleAuthFailure(
                    $post,
                    $account,
                    $pollResult['error_code'] ?? 'AUTH_ERROR_401_403',
                    $pollResult['error_message'] ?? 'Token không hợp lệ khi poll Media Container.'
                );
            }

            if ($pollResult['ok'] && $pollResult['status'] === ThreadsGraphApiClient::STATUS_PUBLISHED) {
                $resolvedMediaId = $pollResult['published_media_id'] ?: $containerId;

                return $this->completePublication($post, $account, $resolvedMediaId);
            }

            if ($pollResult['ok'] && $pollResult['status'] === ThreadsGraphApiClient::STATUS_IN_PROGRESS) {
                return $this->handleRetryOrFail(
                    $post,
                    $account,
                    'CONTAINER_IN_PROGRESS',
                    "Media Container #{$containerId} vẫn đang xử lý (IN_PROGRESS)."
                );
            }

            if (! $pollResult['ok']) {
                if (in_array($pollResult['status'], [ThreadsGraphApiClient::STATUS_ERROR, ThreadsGraphApiClient::STATUS_EXPIRED], true)) {
                    $post->container_id = null;
                    $post->save();
                }

                return $this->handleRetryOrFail(
                    $post,
                    $account,
                    $pollResult['error_code'] ?? 'CONTAINER_POLL_FAILED',
                    $pollResult['error_message'] ?? 'Media Container gặp lỗi trong quá trình xử lý.'
                );
            }
        }

        // Bước 2: Gọi POST /{threads_user_id}/threads_publish với creation_id = $containerId
        $publishResult = $this->graphClient->publishContainer(
            $account,
            $containerId,
            (int) $post->getKey()
        );

        if ($publishResult['is_auth_error']) {
            return $this->handleAuthFailure(
                $post,
                $account,
                $publishResult['error_code'] ?? 'AUTH_ERROR_401_403',
                $publishResult['error_message'] ?? 'Token không hợp lệ khi xuất bản Media Container.'
            );
        }

        if (! $publishResult['ok'] || empty($publishResult['threads_media_id'])) {
            // Giữ nguyên $post->container_id để lượt retry kế tiếp đối soát Idempotency
            return $this->handleRetryOrFail(
                $post,
                $account,
                $publishResult['error_code'] ?? 'PUBLISH_CONTAINER_FAILED',
                $publishResult['error_message'] ?? 'Lỗi mạng hoặc máy chủ khi gọi threads_publish.'
            );
        }

        return $this->completePublication($post, $account, (string) $publishResult['threads_media_id']);
    }

    /**
     * Alias cho publishPost($post, true) để đăng ngay lập tức.
     *
     * @return array<string, mixed>
     */
    public function publishNow(ThreadsPost|int $postOrId): array
    {
        return $this->publishPost($postOrId, true);
    }

    /**
     * Alias cho publishPost.
     *
     * @return array<string, mixed>
     */
    public function publish(ThreadsPost|int $postOrId, bool $ignoreSchedule = false): array
    {
        return $this->publishPost($postOrId, $ignoreSchedule);
    }

    /**
     * Đặt lại trạng thái bài lỗi về scheduled để thử lại hoặc thực thi đăng lại ngay.
     *
     * @return array<string, mixed>
     */
    public function retryPost(ThreadsPost|int $postOrId, bool $publishImmediately = true): array
    {
        $post = $postOrId instanceof ThreadsPost ? $postOrId : ThreadsPost::findOrFail((int) $postOrId);

        $post->status = self::STATUS_SCHEDULED;
        $post->next_retry_at = now();
        if ($post->scheduled_at === null || $post->scheduled_at->isFuture()) {
            $post->scheduled_at = now();
        }
        $post->error_code = null;
        $post->error_message = null;
        $post->save();

        if ($publishImmediately) {
            return $this->publishPost($post, true);
        }

        return $this->buildResult(true, 'scheduled_for_retry', $post, 0, 'Đã đưa bài đăng vào hàng đợi thử lại.');
    }

    /**
     * Hoàn tất xuất bản: lấy permalink, cập nhật trạng thái published, và kích hoạt chuỗi bài con Auto-chain.
     *
     * @return array<string, mixed>
     */
    protected function completePublication(
        ThreadsPost $post,
        ThreadsAccount $account,
        string $threadsMediaId
    ): array {
        $permalinkResult = $this->graphClient->fetchPermalink(
            $account,
            $threadsMediaId,
            (int) $post->getKey()
        );

        $post->status = self::STATUS_PUBLISHED;
        $post->threads_media_id = $threadsMediaId;
        $post->permalink = $permalinkResult['permalink'];
        $post->published_at = now();
        $post->next_retry_at = null;
        $post->error_code = null;
        $post->error_message = null;
        $post->save();

        $autoChainedCount = $this->activateAutoChainReplies($post);

        return $this->buildResult(
            true,
            self::STATUS_PUBLISHED,
            $post,
            $autoChainedCount,
            'Xuất bản bài đăng Threads thành công.'
        );
    }

    /**
     * Khi một bài cha bị failed hoặc cancelled vĩnh viễn, tự động đánh dấu failed
     * cho toàn bộ chuỗi bài con/cháu phụ thuộc (Auto-chain & Scheduled-chain) để không bị kẹt vô hạn.
     */
    public function cascadeFailDependentReplies(ThreadsPost $failedParent, ?string $reason = null): int
    {
        $failedCount = 0;
        $parentIds = [(int) $failedParent->getKey()];
        $defaultReason = $reason ?? sprintf(
            'Bài cha #%d trong chuỗi đã thất bại hoặc bị hủy nên bài con không được xuất bản độc lập.',
            (int) $failedParent->getKey()
        );

        while (! empty($parentIds)) {
            $children = ThreadsPost::query()
                ->whereIn('reply_to_post_id', $parentIds)
                ->whereIn('status', [self::STATUS_DRAFT, self::STATUS_SCHEDULED, self::STATUS_PUBLISHING])
                ->get();

            if ($children->isEmpty()) {
                break;
            }

            $nextParentIds = [];
            foreach ($children as $child) {
                $child->status = self::STATUS_FAILED;
                $child->error_code = 'PARENT_POST_FAILED';
                $child->error_message = $defaultReason;
                $child->next_retry_at = null;
                $child->save();

                $failedCount++;
                $nextParentIds[] = (int) $child->getKey();
            }

            $parentIds = $nextParentIds;
        }

        return $failedCount;
    }

    /**
     * Xử lý lỗi xác thực 401/403: dừng retry ngay lập tức, đánh dấu bài failed,
     * chuyển tài khoản sang needs_reauth và bắn cảnh báo Telegram.
     *
     * @return array<string, mixed>
     */
    protected function handleAuthFailure(
        ThreadsPost $post,
        ThreadsAccount $account,
        string $errorCode,
        string $errorMessage
    ): array {
        $safeError = ThreadsTokenCipher::redactString($errorMessage);

        $post->status = self::STATUS_FAILED;
        $post->next_retry_at = null;
        $post->error_code = $errorCode !== '' ? $errorCode : 'AUTH_ERROR_401_403';
        $post->error_message = $safeError;
        $post->save();

        $this->cascadeFailDependentReplies($post);

        $account->status = ThreadsAccount::STATUS_NEEDS_REAUTH;
        $account->last_error_message = $safeError;
        $account->save();

        $this->alertService->sendNeedsReauthAlert($account, $safeError, $post);

        return $this->buildResult(false, 'failed_auth', $post, 0, $safeError);
    }

    /**
     * Xử lý lỗi tạm thời theo cơ chế Exponential Backoff (5m -> 30m -> 2h, tối đa 3 lần retry).
     * Khi đã hết 3 lần retry mà vẫn lỗi, chuyển bài sang failed và bắn cảnh báo Telegram.
     *
     * @return array<string, mixed>
     */
    protected function handleRetryOrFail(
        ThreadsPost $post,
        ThreadsAccount $account,
        string $errorCode,
        string $errorMessage
    ): array {
        $safeError = ThreadsTokenCipher::redactString($errorMessage);
        $maxRetries = max(1, (int) config('threads.max_retries', 3));
        $currentRetryCount = (int) $post->retry_count;

        if ($currentRetryCount < $maxRetries) {
            $nextRetryCount = $currentRetryCount + 1;
            $delayMinutes = $this->calculateRetryDelayMinutes($nextRetryCount);
            $nextRetryAt = now()->addMinutes($delayMinutes);

            $post->status = self::STATUS_SCHEDULED;
            $post->retry_count = $nextRetryCount;
            $post->next_retry_at = $nextRetryAt;
            $post->error_code = $errorCode;
            $post->error_message = $safeError;
            $post->save();

            return $this->buildResult(
                false,
                'retry_scheduled',
                $post,
                0,
                "Lỗi tạm thời ({$errorCode}). Đã lên lịch thử lại lần {$nextRetryCount}/{$maxRetries} sau {$delayMinutes} phút."
            );
        }

        // Đã thử lại đủ 3 lần nhưng vẫn thất bại -> chuyển sang failed và bắn cảnh báo Telegram
        $post->status = self::STATUS_FAILED;
        $post->retry_count = max($maxRetries, $currentRetryCount);
        $post->next_retry_at = null;
        $post->error_code = $errorCode;
        $post->error_message = $safeError;
        $post->save();

        $this->cascadeFailDependentReplies($post);

        $this->alertService->sendPostFailedAlert($post, $safeError, $account);

        return $this->buildResult(
            false,
            self::STATUS_FAILED,
            $post,
            0,
            "Bài đăng #{$post->id} đã chuyển sang trạng thái failed sau {$post->retry_count} lần retry."
        );
    }

    /**
     * Quét và thực thi toàn bộ các bài viết đã đến hạn đăng hoặc đến hạn retry.
     *
     * @return array{
     *     processed: int,
     *     published: int,
     *     retried: int,
     *     deferred: int,
     *     failed: int,
     *     skipped: int,
     *     auto_chained: int,
     *     results: array<int, array<string, mixed>>
     * }
     */
    public function runScheduler(int $limit = 50): array
    {
        $now = now();

        // Đồng bộ xử lý các bài con đang chờ nhưng bài cha đã bị failed hoặc cancelled vĩnh viễn
        $failedParentsWithPendingChildren = ThreadsPost::query()
            ->whereIn('status', [self::STATUS_FAILED, self::STATUS_CANCELLED])
            ->whereIn('id', function ($sub) {
                $sub->select('reply_to_post_id')
                    ->from('threads_posts')
                    ->whereNotNull('reply_to_post_id')
                    ->whereIn('status', [self::STATUS_SCHEDULED, self::STATUS_DRAFT]);
            })
            ->get();

        $cascadedFailedCount = 0;
        foreach ($failedParentsWithPendingChildren as $failedParent) {
            $cascadedFailedCount += $this->cascadeFailDependentReplies($failedParent);
        }

        // Đồng bộ kích hoạt các bài con Auto-chain có bài cha đã published nhưng scheduled_at còn null
        $publishedParentsWithPendingAutoChain = ThreadsPost::query()
            ->where('status', self::STATUS_PUBLISHED)
            ->whereNotNull('threads_media_id')
            ->whereIn('id', function ($sub) {
                $sub->select('reply_to_post_id')
                    ->from('threads_posts')
                    ->whereNotNull('reply_to_post_id')
                    ->whereNull('scheduled_at')
                    ->whereIn('status', [self::STATUS_SCHEDULED, self::STATUS_DRAFT]);
            })
            ->get();

        $initialAutoChained = 0;
        foreach ($publishedParentsWithPendingAutoChain as $parent) {
            $initialAutoChained += $this->activateAutoChainReplies($parent);
        }

        // Quét các bài đăng đến hạn
        $duePosts = ThreadsPost::query()
            ->where('status', self::STATUS_SCHEDULED)
            ->whereHas('account', function ($q) {
                $q->where('status', ThreadsAccount::STATUS_ACTIVE);
            })
            ->where(function ($q) use ($now) {
                $q->where(function ($qSchedule) use ($now) {
                    $qSchedule->whereNull('next_retry_at')
                        ->whereNotNull('scheduled_at')
                        ->where('scheduled_at', '<=', $now);
                })->orWhere(function ($qRetry) use ($now) {
                    $qRetry->whereNotNull('next_retry_at')
                        ->where('next_retry_at', '<=', $now);
                });
            })
            ->where(function ($qParent) {
                $qParent->whereNull('reply_to_post_id')
                    ->orWhereIn('reply_to_post_id', function ($sub) {
                        $sub->select('id')
                            ->from('threads_posts')
                            ->where('status', self::STATUS_PUBLISHED)
                            ->whereNotNull('threads_media_id');
                    });
            })
            ->orderBy('scheduled_at')
            ->orderBy('reply_order')
            ->orderBy('id')
            ->limit(max(1, $limit))
            ->get();

        $summary = [
            'processed'       => 0,
            'published'       => 0,
            'retried'         => 0,
            'deferred'        => 0,
            'failed'          => 0,
            'cascaded_failed' => $cascadedFailedCount,
            'skipped'         => 0,
            'auto_chained'    => $initialAutoChained,
            'results'         => [],
        ];

        foreach ($duePosts as $duePost) {
            $summary['processed']++;
            $outcome = $this->publishPost($duePost, false);
            $summary['auto_chained'] += (int) ($outcome['auto_chained_count'] ?? 0);

            $status = (string) ($outcome['status'] ?? '');
            if ($outcome['success'] && $status === self::STATUS_PUBLISHED) {
                $summary['published']++;
            } elseif ($status === 'retry_scheduled') {
                $summary['retried']++;
            } elseif (in_array($status, ['deferred_daily_cap', 'deferred_low_quota'], true)) {
                $summary['deferred']++;
            } elseif (in_array($status, [self::STATUS_FAILED, 'failed_auth', 'validation_failed', 'parent_failed', 'account_missing'], true)) {
                $summary['failed']++;
            } else {
                $summary['skipped']++;
            }

            $summary['results'][] = [
                'post_id'          => (int) $duePost->getKey(),
                'account_id'       => (int) $duePost->account_id,
                'success'          => $outcome['success'],
                'status'           => $status,
                'post_status'      => $outcome['post_status'],
                'container_id'     => $outcome['container_id'],
                'threads_media_id' => $outcome['threads_media_id'],
                'permalink'        => $outcome['permalink'],
                'retry_count'      => $outcome['retry_count'],
                'message'          => $outcome['message'],
            ];
        }

        return $summary;
    }

    /**
     * Alias cho runScheduler.
     *
     * @return array<string, mixed>
     */
    public function processDuePosts(int $limit = 50): array
    {
        return $this->runScheduler($limit);
    }

    /**
     * Alias cho runScheduler.
     *
     * @return array<string, mixed>
     */
    public function dispatchDuePosts(int $limit = 50): array
    {
        return $this->runScheduler($limit);
    }

    /**
     * Đóng gói cấu trúc phản hồi thống nhất.
     *
     * @return array<string, mixed>
     */
    protected function buildResult(
        bool $success,
        string $status,
        ThreadsPost $post,
        int $autoChainedCount,
        ?string $message = null
    ): array {
        $freshPost = $post->fresh() ?? $post;

        return [
            'success'            => $success,
            'ok'                 => $success,
            'status'             => $status,
            'post_status'        => $freshPost->status,
            'post'               => $freshPost,
            'container_id'       => $freshPost->container_id,
            'threads_media_id'   => $freshPost->threads_media_id,
            'permalink'          => $freshPost->permalink,
            'retry_count'        => (int) $freshPost->retry_count,
            'next_retry_at'      => $freshPost->next_retry_at?->toIso8601String(),
            'auto_chained_count' => $autoChainedCount,
            'error_code'         => $freshPost->error_code,
            'error_message'      => $freshPost->error_message,
            'message'            => $message ?? '',
        ];
    }
}
