<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Jobs\PublishThreadsReplyJob;
use App\Models\ThreadsSeedingCampaign;
use App\Models\ThreadsSeedingJob;
use App\Services\ThreadsDiscoveryService;
use App\Services\ThreadsSeedingDispatcherService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ThreadsSeedingController extends Controller
{
    public function __construct(
        protected ThreadsDiscoveryService $discoveryService,
        protected ThreadsSeedingDispatcherService $dispatcherService
    ) {}

    /**
     * Khám phá tối đa 10 bài viết Threads có điểm tương tác cao nhất trong 24h qua theo từ khóa.
     * POST /api/v1/threads/seeding/discover
     */
    public function discover(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'keyword' => ['required', 'string', 'min:1', 'max:150'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:20'],
        ]);

        $keyword = trim($validated['keyword']);
        $limit = isset($validated['limit']) ? (int) $validated['limit'] : 10;

        $result = $this->discoveryService->discover($keyword, $limit);

        if (empty($result['data'])) {
            return $this->success(
                $result,
                'Không tìm thấy bài viết nào trong 24 giờ qua. Vui lòng mở rộng từ khóa tìm kiếm.'
            );
        }

        return $this->success(
            $result,
            'Lấy danh sách 10 bài viết thịnh hành trên Threads thành công.'
        );
    }

    /**
     * Bóc tách và kiểm tra tính hợp lệ của danh sách liên kết bài viết Threads dán trực tiếp.
     * POST /api/v1/threads/seeding/parse-urls
     */
    public function parseUrls(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'post_urls' => ['sometimes', 'array', 'min:1'],
            'post_urls.*' => ['string'],
            'urls' => ['sometimes', 'array', 'min:1'],
            'urls.*' => ['string'],
        ]);

        $urls = $validated['post_urls'] ?? $validated['urls'] ?? [];
        if (empty($urls)) {
            return $this->failure('Vui lòng cung cấp ít nhất 1 liên kết bài viết Threads.', 422);
        }

        $result = $this->discoveryService->parseDirectPostUrls($urls);

        if (! empty($result['invalid'])) {
            return $this->failure(
                'Có ' . count($result['invalid']) . ' liên kết không đúng định dạng tên miền threads.net.',
                422,
                $result['invalid']
            );
        }

        return $this->success(
            $result,
            'Bóc tách liên kết Threads thành công.'
        );
    }

    /**
     * Kích hoạt điều phối Seeding từ danh sách bài viết thịnh hành (Discovery).
     * POST /api/v1/threads/seeding/dispatch-discovery
     */
    public function dispatchDiscovery(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'keyword' => ['required', 'string', 'max:150'],
            'selected_posts' => ['required', 'array', 'min:1'],
            'selected_posts.*.post_id' => ['required', 'string'],
            'selected_posts.*.permalink' => ['nullable', 'string'],
            'selected_posts.*.author_username' => ['nullable', 'string'],
            'selected_posts.*.caption' => ['nullable', 'string'],
            'selected_posts.*.velocity_score' => ['nullable', 'integer'],
            'selected_posts.*.metrics' => ['nullable', 'array'],
            'content_template' => ['required', 'string', 'min:1', 'max:1000'],
            'cluster_content_template' => ['nullable', 'string', 'max:1000'],
            'dispatch_strategy' => [
                'required',
                'string',
                Rule::in([
                    ThreadsSeedingCampaign::STRATEGY_ROUND_ROBIN,
                    ThreadsSeedingCampaign::STRATEGY_MANUAL,
                    ThreadsSeedingCampaign::STRATEGY_CLUSTER,
                ]),
            ],
            'account_ids' => ['nullable', 'array'],
            'account_ids.*' => ['integer', 'exists:threads_accounts,id'],
            'cooldown_min_seconds' => ['nullable', 'integer', 'min:30', 'max:1800'],
            'cooldown_max_seconds' => ['nullable', 'integer', 'min:30', 'max:1800'],
        ]);

        $result = $this->dispatcherService->dispatchDiscovery($validated, $request->user()?->id);

        return $this->created(
            $result,
            'Điều phối chiến dịch Seeding từ Discovery thành công.'
        );
    }

    /**
     * Kích hoạt điều phối Seeding theo danh sách liên kết bài viết Threads chỉ định.
     * POST /api/v1/threads/seeding/dispatch-direct
     */
    public function dispatchDirect(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'post_urls' => ['required', 'array', 'min:1'],
            'post_urls.*' => ['required', 'string'],
            'reply_text' => ['required', 'string', 'min:1', 'max:1000'],
            'cluster_content_template' => ['nullable', 'string', 'max:1000'],
            'dispatch_strategy' => [
                'required',
                'string',
                Rule::in([
                    ThreadsSeedingCampaign::STRATEGY_ROUND_ROBIN,
                    ThreadsSeedingCampaign::STRATEGY_MANUAL,
                    ThreadsSeedingCampaign::STRATEGY_CLUSTER,
                ]),
            ],
            'account_ids' => ['nullable', 'array'],
            'account_ids.*' => ['integer', 'exists:threads_accounts,id'],
            'cooldown_min_seconds' => ['nullable', 'integer', 'min:30', 'max:1800'],
            'cooldown_max_seconds' => ['nullable', 'integer', 'min:30', 'max:1800'],
        ]);

        $result = $this->dispatcherService->dispatchDirect($validated, $request->user()?->id);

        return $this->created(
            $result,
            'Điều phối chiến dịch Seeding theo URL chỉ định thành công.'
        );
    }

    /**
     * Lấy danh sách các chiến dịch Seeding kèm bộ lọc trạng thái và tìm kiếm từ khóa.
     * GET /api/v1/threads/seeding/campaigns
     */
    public function campaigns(Request $request): JsonResponse
    {
        $query = ThreadsSeedingCampaign::query()
            ->with(['creator:id,name,email'])
            ->withCount(['jobs']);

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        if ($request->filled('keyword')) {
            $kw = trim($request->input('keyword'));
            $query->where(function ($q) use ($kw) {
                $q->where('name', 'like', "%{$kw}%")
                    ->orWhere('keyword', 'like', "%{$kw}%");
            });
        }

        $perPage = max(1, min(100, (int) $request->input('per_page', 20)));
        $campaigns = $query->orderByDesc('id')->paginate($perPage);

        return $this->success(
            $campaigns,
            'Lấy danh sách chiến dịch Seeding thành công.'
        );
    }

    /**
     * Xem chi tiết chiến dịch Seeding kèm toàn bộ danh sách jobs và tài khoản thực thi.
     * GET /api/v1/threads/seeding/campaigns/{id}
     */
    public function showCampaign(int $id): JsonResponse
    {
        $campaign = ThreadsSeedingCampaign::query()
            ->with([
                'creator:id,name,email',
                'jobs.account:id,display_name,username,status,daily_post_cap',
            ])
            ->find($id);

        if (! $campaign) {
            return $this->failure('Không tìm thấy chiến dịch Seeding.', 404);
        }

        return $this->success(
            $campaign,
            'Lấy thông tin chi tiết chiến dịch Seeding thành công.'
        );
    }

    /**
     * Lấy danh sách jobs Seeding với các bộ lọc theo chiến dịch, tài khoản, hoặc trạng thái.
     * GET /api/v1/threads/seeding/jobs
     */
    public function jobs(Request $request): JsonResponse
    {
        $query = ThreadsSeedingJob::query()
            ->with([
                'campaign:id,name,type,status',
                'account:id,display_name,username,status',
            ]);

        if ($request->filled('campaign_id')) {
            $query->where('campaign_id', (int) $request->input('campaign_id'));
        }

        if ($request->filled('account_id')) {
            $query->where('account_id', (int) $request->input('account_id'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('target_post_id')) {
            $query->where('target_post_id', $request->input('target_post_id'));
        }

        $perPage = max(1, min(100, (int) $request->input('per_page', 25)));
        $jobs = $query->orderByDesc('id')->paginate($perPage);

        return $this->success(
            $jobs,
            'Lấy danh sách jobs Seeding thành công.'
        );
    }

    /**
     * Đưa job seeding bị lỗi vào hàng đợi để thử lại ngay.
     * POST /api/v1/threads/seeding/jobs/{id}/retry
     */
    public function retryJob(int $id): JsonResponse
    {
        /** @var ThreadsSeedingJob|null $job */
        $job = ThreadsSeedingJob::with(['campaign', 'account'])->find($id);

        if (! $job) {
            return $this->failure('Không tìm thấy job Seeding cần thử lại.', 404);
        }

        if ($job->status === ThreadsSeedingJob::STATUS_PUBLISHED) {
            return $this->failure('Job này đã xuất bản thành công, không thể thử lại.', 400);
        }

        $job->update([
            'status' => ThreadsSeedingJob::STATUS_QUEUED,
            'error_code' => null,
            'error_message' => null,
            'scheduled_at' => now(),
        ]);

        PublishThreadsReplyJob::dispatch($job->id)->onQueue('threads-seeding');

        return $this->success(
            $job->fresh(['account', 'campaign']),
            'Đã đưa job seeding vào hàng đợi xuất bản lại.'
        );
    }
}
