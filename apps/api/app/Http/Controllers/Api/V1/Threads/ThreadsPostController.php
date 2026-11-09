<?php

namespace App\Http\Controllers\Api\V1\Threads;

use App\Http\Controllers\Controller;
use App\Models\ThreadsAccount;
use App\Models\ThreadsPost;
use App\Models\ThreadsPublishLog;
use App\Services\Threads\ThreadsPostValidator;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ThreadsPostController extends Controller
{
    /**
     * Khởi tạo query chuẩn cho bài đăng Threads kèm quan hệ tài khoản và bài trả lời nối tiếp.
     */
    protected function basePostQuery(): Builder
    {
        return ThreadsPost::query()->with([
            'account:id,display_name,username,threads_user_id,status,app_group,daily_post_cap,active_hours_start,active_hours_end,quota_used_24h,quota_total_24h,last_error_message,token_expires_at,last_refreshed_at',
            'replies.account:id,display_name,username,status,app_group',
            'parentPost:id,account_id,content_text,status,threads_media_id,permalink,scheduled_at,published_at',
        ]);
    }

    /**
     * Bổ sung thuộc tính tính toán effective_text (Cách C) cho bài đăng và các bài con.
     */
    protected function enrichPost(ThreadsPost $post): ThreadsPost
    {
        $effectiveText = ThreadsPostValidator::resolveEffectiveText(
            $post->content_text,
            (bool) $post->is_sponsored,
            $post->sponsored_suffix
        );

        $post->setAttribute('effective_text', $effectiveText);
        $post->setAttribute('char_count', ThreadsPostValidator::countUtf8Chars($effectiveText));
        $post->setAttribute(
            'unique_links_count',
            ThreadsPostValidator::countUniqueLinks($effectiveText, $post->link_attachment)
        );
        $post->setAttribute('is_auto_chain', $post->reply_to_post_id !== null && $post->scheduled_at === null);

        if ($post->relationLoaded('replies') && $post->replies !== null) {
            foreach ($post->replies as $reply) {
                if ($reply instanceof ThreadsPost) {
                    $replyEffective = ThreadsPostValidator::resolveEffectiveText(
                        $reply->content_text,
                        (bool) $reply->is_sponsored,
                        $reply->sponsored_suffix
                    );
                    $reply->setAttribute('effective_text', $replyEffective);
                    $reply->setAttribute('char_count', ThreadsPostValidator::countUtf8Chars($replyEffective));
                    $reply->setAttribute('is_auto_chain', $reply->reply_to_post_id !== null && $reply->scheduled_at === null);
                }
            }
        }

        return $post;
    }

    /**
     * Danh sách bài đăng Threads hỗ trợ lọc theo status, account_id, is_sponsored, client_ref, thread_group_key, search.
     */
    public function index(Request $request): JsonResponse
    {
        $query = $this->basePostQuery();

        if ($request->filled('status')) {
            $status = trim((string) $request->input('status'));
            if ($status !== '' && strtolower($status) !== 'all') {
                $query->where('status', $status);
            }
        }

        $accountIdParam = $request->input('account_id', $request->input('threads_account_id'));
        if ($accountIdParam !== null && $accountIdParam !== '' && strtolower((string) $accountIdParam) !== 'all') {
            if (is_numeric($accountIdParam)) {
                $query->where('account_id', (int) $accountIdParam);
            }
        }

        if ($request->has('is_sponsored')) {
            $rawSponsored = $request->input('is_sponsored');
            if ($rawSponsored !== null && $rawSponsored !== '' && strtolower((string) $rawSponsored) !== 'all') {
                $isSponsored = filter_var($rawSponsored, FILTER_VALIDATE_BOOLEAN);
                $query->where('is_sponsored', $isSponsored);
            }
        }

        if ($request->filled('client_ref')) {
            $clientRef = trim((string) $request->input('client_ref'));
            $query->where('client_ref', 'like', "%{$clientRef}%");
        }

        if ($request->filled('thread_group_key')) {
            $query->where('thread_group_key', trim((string) $request->input('thread_group_key')));
        }

        if ($request->filled('import_batch_id')) {
            $query->where('import_batch_id', trim((string) $request->input('import_batch_id')));
        }

        if ($request->boolean('root_only', false)) {
            $query->whereNull('reply_to_post_id');
        }

        if ($request->filled('search')) {
            $keyword = trim((string) $request->input('search'));
            $query->where(function (Builder $q) use ($keyword) {
                $q->where('content_text', 'like', "%{$keyword}%")
                    ->orWhere('topic_tag', 'like', "%{$keyword}%")
                    ->orWhere('client_ref', 'like', "%{$keyword}%")
                    ->orWhere('thread_group_key', 'like', "%{$keyword}%");
            });
        }

        $limit = $request->filled('limit') ? max(1, min(500, (int) $request->input('limit'))) : 250;

        $posts = $query
            ->orderByRaw('CASE WHEN scheduled_at IS NULL THEN 1 ELSE 0 END ASC')
            ->orderBy('scheduled_at')
            ->orderBy('reply_order')
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn (ThreadsPost $post) => $this->enrichPost($post));

        return $this->success($posts, 'Lấy danh sách bài đăng Threads thành công.');
    }

    /**
     * Xem chi tiết một bài đăng Threads kèm chuỗi bài nối tiếp và lịch sử gọi API.
     */
    public function show(int $id): JsonResponse
    {
        $post = $this->basePostQuery()
            ->with('publishLogs')
            ->find($id);

        if (! $post) {
            return $this->failure('Không tìm thấy bài đăng Threads.', 404);
        }

        return $this->success(
            $this->enrichPost($post),
            'Lấy chi tiết bài đăng Threads thành công.'
        );
    }

    /**
     * Tạo mới bài đăng đơn lẻ hoặc chuỗi bài nối tiếp (Flexible Multi-post Thread)
     * kèm kiểm định ThreadsPostValidator và nhãn hợp tác trả phí linh hoạt (is_sponsored Cách C).
     */
    public function store(Request $request, ThreadsPostValidator $validator): JsonResponse
    {
        $accountId = (int) $request->input('account_id', $request->input('threads_account_id', 0));
        if ($accountId <= 0) {
            return $this->failure(
                'Vui lòng chọn tài khoản Threads hợp lệ (account_id).',
                422,
                ['account_id' => ['Trường account_id là bắt buộc.']]
            );
        }

        $account = ThreadsAccount::find($accountId);
        if (! $account) {
            return $this->failure(
                'Không tìm thấy tài khoản Threads được chỉ định.',
                404,
                ['account_id' => ['Tài khoản Threads không tồn tại.']]
            );
        }

        $rawSteps = $request->input(
            'thread_steps',
            $request->input('steps', $request->input('posts', $request->input('replies')))
        );

        $isMultiStepRequest = is_array($rawSteps) && count($rawSteps) > 0;
        $stepsToValidate = [];

        $topIsSponsored = filter_var($request->input('is_sponsored', false), FILTER_VALIDATE_BOOLEAN);
        $topSponsoredSuffix = $request->filled('sponsored_suffix')
            ? trim((string) $request->input('sponsored_suffix'))
            : null;
        $topClientRef = $request->filled('client_ref')
            ? trim((string) $request->input('client_ref'))
            : null;
        $topReplyControl = strtolower(trim((string) $request->input('reply_control', 'everyone')));
        if (! in_array($topReplyControl, ThreadsPostValidator::ALLOWED_REPLY_CONTROLS, true)) {
            $topReplyControl = 'everyone';
        }
        $topStatus = in_array($request->input('status'), ['draft', 'scheduled'], true)
            ? (string) $request->input('status')
            : ThreadsPost::STATUS_SCHEDULED;
        $chainMode = strtolower(trim((string) $request->input('chain_mode', 'auto')));
        $allowDuplicate = $request->boolean('allow_duplicate', false);

        $explicitReplyToPostId = $request->filled('reply_to_post_id')
            ? (int) $request->input('reply_to_post_id')
            : ($request->filled('parent_post_id') ? (int) $request->input('parent_post_id') : null);

        if ($explicitReplyToPostId !== null) {
            $parentPost = ThreadsPost::find($explicitReplyToPostId);
            if (! $parentPost) {
                return $this->failure(
                    'Không tìm thấy bài đăng cha (reply_to_post_id).',
                    422,
                    ['reply_to_post_id' => ['Bài đăng cha không tồn tại.']]
                );
            }
            if ((int) $parentPost->account_id !== (int) $account->id) {
                return $this->failure(
                    'Bài đăng nối tiếp (reply_to_post_id) bắt buộc phải thuộc cùng một tài khoản Threads với bài cha.',
                    422,
                    ['reply_to_post_id' => ['Bài con phải thuộc cùng tài khoản Threads với bài cha.']]
                );
            }
        }

        if ($isMultiStepRequest) {
            // Nếu người dùng gửi root content_text kèm mảng replies (không bao gồm root trong replies)
            $usedRepliesKey = $request->has('replies') && ! $request->has('thread_steps') && ! $request->has('steps') && ! $request->has('posts');
            if ($usedRepliesKey && $request->filled('content_text')) {
                array_unshift($rawSteps, [
                    'content_text'     => $request->input('content_text'),
                    'media_type'       => $request->input('media_type', 'TEXT'),
                    'media_urls'       => $request->input('media_urls', []),
                    'link_attachment'  => $request->input('link_attachment'),
                    'topic_tag'        => $request->input('topic_tag'),
                    'scheduled_at'     => $request->input('scheduled_at'),
                    'is_sponsored'     => $topIsSponsored,
                    'sponsored_suffix' => $topSponsoredSuffix,
                    'client_ref'       => $topClientRef,
                ]);
            }

            foreach (array_values($rawSteps) as $idx => $step) {
                if (! is_array($step)) {
                    continue;
                }

                $isRoot = ($idx === 0 && $explicitReplyToPostId === null);
                $stepSponsored = array_key_exists('is_sponsored', $step)
                    ? filter_var($step['is_sponsored'], FILTER_VALIDATE_BOOLEAN)
                    : $topIsSponsored;

                $stepSuffix = array_key_exists('sponsored_suffix', $step)
                    ? (trim((string) $step['sponsored_suffix']) !== '' ? trim((string) $step['sponsored_suffix']) : null)
                    : ($isRoot ? $topSponsoredSuffix : null);

                $stepClientRef = array_key_exists('client_ref', $step)
                    ? (trim((string) $step['client_ref']) !== '' ? trim((string) $step['client_ref']) : null)
                    : $topClientRef;

                $rawStepSchedule = $step['scheduled_at'] ?? ($isRoot ? $request->input('scheduled_at') : null);
                if (! $isRoot && $chainMode === 'auto' && empty($step['scheduled_at'])) {
                    $rawStepSchedule = null;
                }

                $parsedSchedule = null;
                if ($rawStepSchedule !== null && trim((string) $rawStepSchedule) !== '') {
                    try {
                        $parsedSchedule = Carbon::parse((string) $rawStepSchedule);
                    } catch (\Throwable) {
                        return $this->failure(
                            'Định dạng thời gian hẹn đăng (scheduled_at) không hợp lệ.',
                            422,
                            ['scheduled_at' => ['Thời gian scheduled_at không hợp lệ.']]
                        );
                    }
                } elseif ($isRoot && $topStatus === ThreadsPost::STATUS_SCHEDULED) {
                    $parsedSchedule = now()->addMinutes(10);
                }

                $stepsToValidate[] = [
                    'step_index'       => $idx,
                    'is_root'          => $isRoot,
                    'reply_order'      => isset($step['reply_order']) && is_numeric($step['reply_order'])
                        ? (int) $step['reply_order']
                        : $idx,
                    'content_text'     => (string) ($step['content_text'] ?? $step['text'] ?? ''),
                    'media_type'       => strtoupper(trim((string) ($step['media_type'] ?? 'TEXT'))),
                    'media_urls'       => ThreadsPostValidator::normalizeMediaUrls($step['media_urls'] ?? []),
                    'link_attachment'  => isset($step['link_attachment']) && trim((string) $step['link_attachment']) !== ''
                        ? trim((string) $step['link_attachment'])
                        : null,
                    'topic_tag'        => isset($step['topic_tag']) && trim((string) $step['topic_tag']) !== ''
                        ? ltrim(trim((string) $step['topic_tag']), '#')
                        : ($request->filled('topic_tag') ? ltrim(trim((string) $request->input('topic_tag')), '#') : null),
                    'reply_control'    => $topReplyControl,
                    'is_sponsored'     => $stepSponsored,
                    'sponsored_suffix' => $stepSuffix,
                    'client_ref'       => $stepClientRef,
                    'scheduled_at'     => $parsedSchedule,
                    'status'           => isset($step['status']) && in_array($step['status'], ['draft', 'scheduled'], true)
                        ? (string) $step['status']
                        : $topStatus,
                    'allow_duplicate'  => $allowDuplicate,
                ];
            }
        } else {
            $isRoot = ($explicitReplyToPostId === null);
            $rawSchedule = $request->input('scheduled_at');
            $parsedSchedule = null;

            if ($rawSchedule !== null && trim((string) $rawSchedule) !== '') {
                try {
                    $parsedSchedule = Carbon::parse((string) $rawSchedule);
                } catch (\Throwable) {
                    return $this->failure(
                        'Định dạng thời gian hẹn đăng (scheduled_at) không hợp lệ.',
                        422,
                        ['scheduled_at' => ['Thời gian scheduled_at không hợp lệ.']]
                    );
                }
            } elseif ($isRoot && $topStatus === ThreadsPost::STATUS_SCHEDULED && ! $request->exists('scheduled_at')) {
                $parsedSchedule = now()->addMinutes(10);
            }

            $stepsToValidate[] = [
                'step_index'       => 0,
                'is_root'          => $isRoot,
                'reply_order'      => (int) $request->input('reply_order', $isRoot ? 0 : 1),
                'content_text'     => (string) $request->input('content_text', $request->input('text', '')),
                'media_type'       => strtoupper(trim((string) $request->input('media_type', 'TEXT'))),
                'media_urls'       => ThreadsPostValidator::normalizeMediaUrls($request->input('media_urls', [])),
                'link_attachment'  => $request->filled('link_attachment') ? trim((string) $request->input('link_attachment')) : null,
                'topic_tag'        => $request->filled('topic_tag') ? ltrim(trim((string) $request->input('topic_tag')), '#') : null,
                'reply_control'    => $topReplyControl,
                'is_sponsored'     => $topIsSponsored,
                'sponsored_suffix' => $topSponsoredSuffix,
                'client_ref'       => $topClientRef,
                'scheduled_at'     => $parsedSchedule,
                'status'           => $topStatus,
                'allow_duplicate'  => $allowDuplicate,
            ];
        }

        // Kiểm định toàn bộ các bước trong chuỗi trước khi lưu DB
        $seenHashes = [];
        foreach ($stepsToValidate as &$stepData) {
            $validation = $validator->validate([
                'account_id'       => $account->id,
                'content_text'     => $stepData['content_text'],
                'media_type'       => $stepData['media_type'],
                'media_urls'       => $stepData['media_urls'],
                'link_attachment'  => $stepData['link_attachment'],
                'topic_tag'        => $stepData['topic_tag'],
                'is_sponsored'     => $stepData['is_sponsored'],
                'sponsored_suffix' => $stepData['sponsored_suffix'],
                'allow_duplicate'  => $stepData['allow_duplicate'],
            ], null, true, false);

            if (! $validation['valid']) {
                return $this->failure(
                    $validation['first_error_message'] ?? 'Dữ liệu bài đăng không vượt qua kiểm định.',
                    422,
                    $validation['errors'],
                    $validation['first_error_code']
                );
            }

            $contentHash = $validation['content_hash'];
            if (! $stepData['allow_duplicate'] && $contentHash !== '' && isset($seenHashes[$contentHash])) {
                return $this->failure(
                    'Các bước trong chuỗi bài đăng không được có nội dung trùng lặp nhau.',
                    422,
                    ['content_hash' => ['Nội dung trùng lặp giữa các bước trong cùng chuỗi bài.']],
                    ThreadsPostValidator::ERROR_DUPLICATE_CONTENT
                );
            }

            if ($contentHash !== '') {
                $seenHashes[$contentHash] = true;
            }

            $stepData['content_hash'] = $contentHash;
            $stepData['effective_text'] = $validation['effective_text'];
        }
        unset($stepData);

        $threadGroupKey = $request->filled('thread_group_key')
            ? trim((string) $request->input('thread_group_key'))
            : (count($stepsToValidate) > 1
                ? 'thread_' . now()->format('YmdHis') . '_' . strtolower(Str::random(4))
                : null);

        $createdPosts = [];

        DB::transaction(function () use (
            $account,
            $stepsToValidate,
            $explicitReplyToPostId,
            $threadGroupKey,
            &$createdPosts
        ) {
            $previousPostId = $explicitReplyToPostId;

            foreach ($stepsToValidate as $stepData) {
                $post = ThreadsPost::create([
                    'account_id'       => $account->id,
                    'reply_to_post_id' => $previousPostId,
                    'thread_group_key' => $threadGroupKey,
                    'reply_order'      => $stepData['reply_order'],
                    'content_text'     => $stepData['content_text'],
                    'media_type'       => $stepData['media_type'],
                    'media_urls'       => $stepData['media_urls'],
                    'link_attachment'  => $stepData['link_attachment'],
                    'topic_tag'        => $stepData['topic_tag'],
                    'reply_control'    => $stepData['reply_control'],
                    'is_sponsored'     => $stepData['is_sponsored'],
                    'sponsored_suffix' => $stepData['sponsored_suffix'],
                    'client_ref'       => $stepData['client_ref'],
                    'content_hash'     => $stepData['content_hash'],
                    'scheduled_at'     => $stepData['scheduled_at'],
                    'status'           => $stepData['status'],
                    'retry_count'      => 0,
                ]);

                $previousPostId = (int) $post->id;
                $createdPosts[] = $post;
            }
        });

        $rootPost = $this->basePostQuery()->find($createdPosts[0]->id) ?? $createdPosts[0];
        $this->enrichPost($rootPost);

        if (count($createdPosts) > 1) {
            $allIds = array_map(static fn (ThreadsPost $p) => (int) $p->id, $createdPosts);
            $hydratedChain = $this->basePostQuery()
                ->whereIn('id', $allIds)
                ->orderBy('reply_order')
                ->orderBy('id')
                ->get()
                ->map(fn (ThreadsPost $p) => $this->enrichPost($p))
                ->values();

            $rootPost->setAttribute('thread_posts', $hydratedChain);
            $rootPost->setAttribute('posts', $hydratedChain);
        }

        return $this->success(
            $rootPost,
            count($createdPosts) > 1
                ? 'Tạo chuỗi bài đăng nối tiếp (Multi-post Thread) thành công.'
                : 'Tạo bài đăng Threads thành công.',
            201
        );
    }

    /**
     * Cập nhật bài đăng Threads (kiểm định lại qua ThreadsPostValidator với excludePostId).
     */
    public function update(Request $request, int $id, ThreadsPostValidator $validator): JsonResponse
    {
        $post = ThreadsPost::find($id);
        if (! $post) {
            return $this->failure('Không tìm thấy bài đăng Threads.', 404);
        }

        if ($post->status === ThreadsPost::STATUS_PUBLISHED) {
            return $this->failure(
                'Bài đăng đã được xuất bản lên Threads nên không thể chỉnh sửa nội dung.',
                422
            );
        }

        $accountId = $request->filled('account_id') ? (int) $request->input('account_id') : (int) $post->account_id;
        $contentText = $request->exists('content_text')
            ? (string) $request->input('content_text')
            : (string) $post->content_text;
        $mediaType = $request->filled('media_type')
            ? strtoupper(trim((string) $request->input('media_type')))
            : (string) $post->media_type;
        $mediaUrls = $request->exists('media_urls')
            ? ThreadsPostValidator::normalizeMediaUrls($request->input('media_urls'))
            : ($post->media_urls ?? []);
        $linkAttachment = $request->exists('link_attachment')
            ? (trim((string) $request->input('link_attachment')) !== '' ? trim((string) $request->input('link_attachment')) : null)
            : $post->link_attachment;
        $topicTag = $request->exists('topic_tag')
            ? (trim((string) $request->input('topic_tag')) !== '' ? ltrim(trim((string) $request->input('topic_tag')), '#') : null)
            : $post->topic_tag;
        $isSponsored = $request->exists('is_sponsored')
            ? filter_var($request->input('is_sponsored'), FILTER_VALIDATE_BOOLEAN)
            : (bool) $post->is_sponsored;
        $sponsoredSuffix = $request->exists('sponsored_suffix')
            ? (trim((string) $request->input('sponsored_suffix')) !== '' ? trim((string) $request->input('sponsored_suffix')) : null)
            : $post->sponsored_suffix;
        $clientRef = $request->exists('client_ref')
            ? (trim((string) $request->input('client_ref')) !== '' ? trim((string) $request->input('client_ref')) : null)
            : $post->client_ref;

        $validation = $validator->validate([
            'account_id'       => $accountId,
            'content_text'     => $contentText,
            'media_type'       => $mediaType,
            'media_urls'       => $mediaUrls,
            'link_attachment'  => $linkAttachment,
            'topic_tag'        => $topicTag,
            'is_sponsored'     => $isSponsored,
            'sponsored_suffix' => $sponsoredSuffix,
            'allow_duplicate'  => $request->boolean('allow_duplicate', false),
        ], (int) $post->id, true, false);

        if (! $validation['valid']) {
            return $this->failure(
                $validation['first_error_message'] ?? 'Dữ liệu cập nhật không hợp lệ.',
                422,
                $validation['errors'],
                $validation['first_error_code']
            );
        }

        $post->account_id = $accountId;
        $post->content_text = $contentText;
        $post->media_type = $mediaType;
        $post->media_urls = $mediaUrls;
        $post->link_attachment = $linkAttachment;
        $post->topic_tag = $topicTag;
        $post->is_sponsored = $isSponsored;
        $post->sponsored_suffix = $sponsoredSuffix;
        $post->client_ref = $clientRef;
        $post->content_hash = $validation['content_hash'];

        if ($request->filled('reply_control') && in_array($request->input('reply_control'), ThreadsPostValidator::ALLOWED_REPLY_CONTROLS, true)) {
            $post->reply_control = (string) $request->input('reply_control');
        }

        if ($request->exists('reply_to_post_id')) {
            $post->reply_to_post_id = $request->input('reply_to_post_id') !== null && $request->input('reply_to_post_id') !== ''
                ? (int) $request->input('reply_to_post_id')
                : null;
        }

        if ($request->exists('thread_group_key')) {
            $post->thread_group_key = trim((string) $request->input('thread_group_key')) !== ''
                ? trim((string) $request->input('thread_group_key'))
                : null;
        }

        if ($request->exists('reply_order') && is_numeric($request->input('reply_order'))) {
            $post->reply_order = max(0, (int) $request->input('reply_order'));
        }

        if ($request->exists('scheduled_at')) {
            $rawScheduled = $request->input('scheduled_at');
            $post->scheduled_at = ($rawScheduled !== null && trim((string) $rawScheduled) !== '')
                ? Carbon::parse((string) $rawScheduled)
                : null;
        }

        if ($request->filled('status') && in_array($request->input('status'), ['draft', 'scheduled', 'cancelled'], true)) {
            $post->status = (string) $request->input('status');
        }

        $post->save();

        $fresh = $this->basePostQuery()->find($post->id) ?? $post;

        return $this->success(
            $this->enrichPost($fresh),
            'Cập nhật bài đăng Threads thành công.'
        );
    }

    /**
     * Xóa bài đăng Threads.
     */
    public function destroy(int $id): JsonResponse
    {
        $post = ThreadsPost::find($id);
        if (! $post) {
            return $this->failure('Không tìm thấy bài đăng Threads.', 404);
        }

        $post->delete();

        return $this->success(['deleted_id' => $id], 'Đã xóa bài đăng Threads.');
    }

    /**
     * Duyệt lịch đăng (approve): chuyển bài từ draft/cancelled/failed sang scheduled.
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        $post = ThreadsPost::find($id);
        if (! $post) {
            return $this->failure('Không tìm thấy bài đăng Threads cần duyệt lịch.', 404);
        }

        if ($post->status === ThreadsPost::STATUS_PUBLISHED) {
            return $this->failure('Bài đăng này đã được xuất bản.', 422);
        }

        if ($request->filled('scheduled_at')) {
            $post->scheduled_at = Carbon::parse((string) $request->input('scheduled_at'));
        } elseif ($post->reply_to_post_id === null && $post->scheduled_at === null) {
            $post->scheduled_at = now()->addMinutes(5);
        }

        $post->status = ThreadsPost::STATUS_SCHEDULED;
        $post->error_code = null;
        $post->error_message = null;
        $post->next_retry_at = null;
        $post->save();

        // Duyệt đồng thời các bài con đang ở trạng thái draft trong cùng chuỗi
        ThreadsPost::query()
            ->where('reply_to_post_id', $post->id)
            ->where('status', ThreadsPost::STATUS_DRAFT)
            ->update(['status' => ThreadsPost::STATUS_SCHEDULED]);

        $fresh = $this->basePostQuery()->find($post->id) ?? $post;

        return $this->success(
            $this->enrichPost($fresh),
            'Đã duyệt bài đăng vào hàng đợi xuất bản (scheduled).'
        );
    }

    /**
     * Đăng ngay lập tức một bài đăng (publishNow) và kích hoạt Auto-chain cho các bài con.
     */
    public function publishNow(Request $request, int $id): JsonResponse
    {
        $post = ThreadsPost::with('account')->find($id);
        if (! $post) {
            return $this->failure('Không tìm thấy bài đăng Threads cần xuất bản.', 404);
        }

        if ($post->status === ThreadsPost::STATUS_PUBLISHED) {
            return $this->success(
                $this->enrichPost($this->basePostQuery()->find($post->id) ?? $post),
                'Bài đăng này đã được xuất bản trước đó.'
            );
        }

        // Chặn xuất bản bài con nếu bài cha chưa published hoặc chưa có threads_media_id
        if ($post->reply_to_post_id !== null) {
            $parentPost = ThreadsPost::find($post->reply_to_post_id);
            if (! $parentPost || in_array($parentPost->status, [ThreadsPost::STATUS_FAILED, ThreadsPost::STATUS_CANCELLED], true)) {
                $post->status = ThreadsPost::STATUS_FAILED;
                $post->error_code = 'PARENT_POST_FAILED';
                $post->error_message = 'Bài cha trong chuỗi đã thất bại hoặc bị hủy nên bài con không được xuất bản độc lập.';
                $post->next_retry_at = null;
                $post->save();

                return $this->failure(
                    $post->error_message,
                    422,
                    ['post' => $this->enrichPost($this->basePostQuery()->find($post->id) ?? $post)],
                    'PARENT_POST_FAILED'
                );
            }

            if ($parentPost->status !== ThreadsPost::STATUS_PUBLISHED || empty($parentPost->threads_media_id)) {
                return $this->failure(
                    "Không thể xuất bản bài con #{$post->id} khi bài cha #{$parentPost->id} chưa xuất bản thành công (threads_media_id trống).",
                    422,
                    ['post' => $this->enrichPost($this->basePostQuery()->find($post->id) ?? $post)],
                    'PARENT_POST_NOT_PUBLISHED'
                );
            }
        }

        $account = $post->account;
        if (! $account) {
            return $this->failure(
                'Không tìm thấy tài khoản Threads liên kết với bài đăng.',
                422,
                null,
                'ACCOUNT_NOT_FOUND'
            );
        }

        $hasEncryptedToken = ! empty($account->getRawOriginal('access_token_encrypted'));
        if ($account->status === ThreadsAccount::STATUS_NEEDS_REAUTH || ! $hasEncryptedToken) {
            $handle = $account->username ? "@{$account->username}" : $account->display_name;
            $reason = $account->last_error_message
                ?: "Tài khoản {$handle} chưa kết nối OAuth 2.0 hoặc Access Token đã hết hạn (needs_reauth). Vui lòng lấy link OAuth và cấp quyền trước khi xuất bản.";

            if ($account->status !== ThreadsAccount::STATUS_NEEDS_REAUTH) {
                $account->status = ThreadsAccount::STATUS_NEEDS_REAUTH;
                $account->last_error_message = $reason;
                $account->save();
            }

            return $this->failure(
                $reason,
                422,
                [
                    'post'    => $this->enrichPost($this->basePostQuery()->find($post->id) ?? $post),
                    'account' => $account->fresh(),
                ],
                'ACCOUNT_NEEDS_REAUTH'
            );
        }

        if ($account->status !== ThreadsAccount::STATUS_ACTIVE) {
            $handle = $account->username ? "@{$account->username}" : $account->display_name;

            return $this->failure(
                "Tài khoản {$handle} đang ở trạng thái '{$account->status}', không thể xuất bản bài viết ngay.",
                422,
                [
                    'post'    => $this->enrichPost($this->basePostQuery()->find($post->id) ?? $post),
                    'account' => $account->fresh(),
                ],
                'ACCOUNT_INACTIVE'
            );
        }

        $publisher = app(\App\Services\Threads\ThreadsPublisherService::class);
        $result = $publisher->publishNow($post);
        $post->refresh();
        $account->refresh();

        if (! empty($result['success']) && $post->status === ThreadsPost::STATUS_PUBLISHED) {
            $fresh = $this->basePostQuery()->find($post->id) ?? $post;

            return $this->success(
                $this->enrichPost($fresh),
                'Đã xuất bản bài đăng lên Threads thành công.'
            );
        }

        $freshPost = $this->basePostQuery()->find($post->id) ?? $post;
        $errorCode = $post->error_code
            ?: ($result['error_code'] ?? null)
            ?: ($account->status === ThreadsAccount::STATUS_NEEDS_REAUTH
                ? 'AUTH_ERROR_401_403'
                : 'THREADS_PUBLISH_FAILED');

        $errorMessage = $post->error_message
            ?: ($result['error_message'] ?? null)
            ?: ($result['message'] ?? 'Xuất bản bài đăng Threads thất bại.');

        return $this->failure(
            (string) $errorMessage,
            422,
            [
                'post'           => $this->enrichPost($freshPost),
                'account'        => $account,
                'publish_status' => $result['status'] ?? null,
            ],
            (string) $errorCode
        );
    }

    /**
     * Thử lại bài đăng bị lỗi (retry): đặt lại trạng thái scheduled và giữ nguyên container_id (nếu có) để đối soát Idempotency.
     */
    public function retry(Request $request, int $id): JsonResponse
    {
        $post = ThreadsPost::find($id);
        if (! $post) {
            return $this->failure('Không tìm thấy bài đăng Threads cần thử lại.', 404);
        }

        if ($post->status === ThreadsPost::STATUS_PUBLISHED) {
            return $this->failure('Bài đăng đã được xuất bản nên không cần thử lại.', 422);
        }

        $post->status = ThreadsPost::STATUS_SCHEDULED;
        $post->retry_count = 0;
        $post->next_retry_at = null;
        $post->error_code = null;
        $post->error_message = null;

        if ($request->filled('scheduled_at')) {
            $post->scheduled_at = Carbon::parse((string) $request->input('scheduled_at'));
        } elseif ($post->scheduled_at === null || $post->scheduled_at->isPast()) {
            $post->scheduled_at = now()->addMinute();
        }

        $post->save();

        $fresh = $this->basePostQuery()->find($post->id) ?? $post;

        return $this->success(
            $this->enrichPost($fresh),
            'Đã đưa bài đăng trở lại hàng đợi xuất bản (scheduled).'
        );
    }
}
