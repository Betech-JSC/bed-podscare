<?php

namespace App\Http\Controllers\Api\V1\Threads;

use App\Http\Controllers\Controller;
use App\Models\ThreadsAccount;
use App\Models\ThreadsPost;
use App\Services\Threads\ThreadsOAuthService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ThreadsAccountController extends Controller
{
    /**
     * Khởi tạo query chuẩn cho ThreadsAccount kèm số liệu bài đăng trong ngày.
     */
    protected function baseAccountQuery(): Builder
    {
        $startOfToday = now()->startOfDay();

        return ThreadsAccount::query()
            ->withCount([
                'posts as published_today_count' => function (Builder $query) use ($startOfToday) {
                    $query->where('status', ThreadsPost::STATUS_PUBLISHED)
                        ->where(function (Builder $q) use ($startOfToday) {
                            $q->where('published_at', '>=', $startOfToday)
                                ->orWhere(function (Builder $fallback) use ($startOfToday) {
                                    $fallback->whereNull('published_at')
                                        ->where('updated_at', '>=', $startOfToday);
                                });
                        });
                },
                'posts as scheduled_count' => function (Builder $query) {
                    $query->where('status', ThreadsPost::STATUS_SCHEDULED);
                },
                'posts as failed_count' => function (Builder $query) {
                    $query->where('status', ThreadsPost::STATUS_FAILED);
                },
            ]);
    }

    /**
     * Chuẩn hóa dữ liệu trả về của một tài khoản Threads (đảm bảo ẩn token tuyệt đối).
     */
    protected function enrichAccount(ThreadsAccount $account): ThreadsAccount
    {
        $publishedToday = (int) ($account->published_today_count ?? 0);
        $account->setAttribute('published_today_count', $publishedToday);
        $account->setAttribute('published_today', $publishedToday);
        $account->setAttribute('scheduled_count', (int) ($account->scheduled_count ?? 0));
        $account->setAttribute('failed_count', (int) ($account->failed_count ?? 0));

        if ($account->token_expires_at !== null) {
            $daysLeft = (int) max(0, ceil(now()->diffInSeconds($account->token_expires_at, false) / 86400));
            $account->setAttribute('token_days_remaining', $daysLeft);
        } else {
            $account->setAttribute('token_days_remaining', null);
        }

        return $account;
    }

    /**
     * Danh sách tối đa 20 tài khoản Threads kèm trạng thái hạn mức trong ngày.
     */
    public function index(Request $request): JsonResponse
    {
        $query = $this->baseAccountQuery();

        if ($request->filled('status')) {
            $query->where('status', trim((string) $request->input('status')));
        }

        if ($request->filled('app_group')) {
            $query->where('app_group', trim((string) $request->input('app_group')));
        }

        if ($request->filled('search')) {
            $keyword = trim((string) $request->input('search'));
            $query->where(function (Builder $q) use ($keyword) {
                $q->where('display_name', 'like', "%{$keyword}%")
                    ->orWhere('username', 'like', "%{$keyword}%")
                    ->orWhere('threads_user_id', 'like', "%{$keyword}%");
            });
        }

        $accounts = $query
            ->orderBy('id')
            ->get()
            ->map(fn (ThreadsAccount $account) => $this->enrichAccount($account));

        return $this->success($accounts, 'Lấy danh sách tài khoản Threads thành công.');
    }

    /**
     * Tạo mới tài khoản Threads (tối đa 20 tài khoản thuộc sở hữu công ty).
     */
    public function store(Request $request): JsonResponse
    {
        $maxAccounts = (int) config('threads.max_accounts', 20);
        if (ThreadsAccount::count() >= $maxAccounts) {
            return $this->failure(
                "Hệ thống chỉ cho phép quản lý tối đa {$maxAccounts} tài khoản Threads thuộc sở hữu công ty.",
                422
            );
        }

        $validated = $request->validate([
            'display_name' => 'required|string|max:120',
            'username' => 'nullable|string|max:100|unique:threads_accounts,username',
            'threads_user_id' => 'nullable|string|max:64|unique:threads_accounts,threads_user_id',
            'app_group' => 'nullable|string|max:64',
            'daily_post_cap' => 'nullable|integer|min:1|max:250',
            'active_hours_start' => ['nullable', 'string', 'regex:/^\d{2}:\d{2}$/'],
            'active_hours_end' => ['nullable', 'string', 'regex:/^\d{2}:\d{2}$/'],
            'status' => 'nullable|string|in:active,needs_reauth,paused,disabled',
            'access_token' => 'nullable|string',
            'token_expires_at' => 'nullable|date',
            'notes' => 'nullable|string|max:2000',
        ]);

        $hasPlainToken = isset($validated['access_token']) && trim((string) $validated['access_token']) !== '';
        $defaultStatus = $hasPlainToken
            ? ThreadsAccount::STATUS_ACTIVE
            : ThreadsAccount::STATUS_NEEDS_REAUTH;

        $account = new ThreadsAccount([
            'display_name' => trim($validated['display_name']),
            'username' => isset($validated['username']) && trim((string) $validated['username']) !== ''
                ? ltrim(trim((string) $validated['username']), '@')
                : null,
            'threads_user_id' => isset($validated['threads_user_id']) && trim((string) $validated['threads_user_id']) !== ''
                ? trim((string) $validated['threads_user_id'])
                : null,
            'app_group' => isset($validated['app_group']) && trim((string) $validated['app_group']) !== ''
                ? trim((string) $validated['app_group'])
                : (string) config('threads.default_app_group', 'primary_dev_app'),
            'daily_post_cap' => (int) ($validated['daily_post_cap'] ?? config('threads.default_daily_post_cap', 8)),
            'active_hours_start' => (string) ($validated['active_hours_start'] ?? config('threads.default_active_hours_start', '08:00')),
            'active_hours_end' => (string) ($validated['active_hours_end'] ?? config('threads.default_active_hours_end', '22:00')),
            'status' => (string) ($validated['status'] ?? $defaultStatus),
            'quota_used_24h' => 0,
            'quota_total_24h' => (int) config('threads.quota_total_24h', 250),
            'notes' => $validated['notes'] ?? null,
        ]);

        if ($hasPlainToken) {
            $account->setAccessToken((string) $validated['access_token']);
            $account->token_expires_at = isset($validated['token_expires_at'])
                ? $validated['token_expires_at']
                : now()->addSeconds((int) config('threads.long_lived_token_ttl_seconds', 5184000));
            $account->last_refreshed_at = now();
        } elseif (! empty($validated['token_expires_at'])) {
            $account->token_expires_at = $validated['token_expires_at'];
        }

        $account->save();

        $fresh = $this->baseAccountQuery()->find($account->id) ?? $account;

        return $this->success(
            $this->enrichAccount($fresh),
            'Tạo tài khoản Threads thành công.',
            201
        );
    }

    /**
     * Xem chi tiết một tài khoản Threads.
     */
    public function show(int $id): JsonResponse
    {
        $account = $this->baseAccountQuery()->find($id);
        if (! $account) {
            return $this->failure('Không tìm thấy tài khoản Threads.', 404);
        }

        return $this->success(
            $this->enrichAccount($account),
            'Lấy thông tin tài khoản Threads thành công.'
        );
    }

    /**
     * Cập nhật cấu hình tài khoản Threads (daily_post_cap, app_group, active_hours, notes...).
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $account = ThreadsAccount::find($id);
        if (! $account) {
            return $this->failure('Không tìm thấy tài khoản Threads.', 404);
        }

        $validated = $request->validate([
            'display_name' => 'sometimes|required|string|max:120',
            'username' => [
                'nullable',
                'string',
                'max:100',
                Rule::unique('threads_accounts', 'username')->ignore($account->id),
            ],
            'threads_user_id' => [
                'nullable',
                'string',
                'max:64',
                Rule::unique('threads_accounts', 'threads_user_id')->ignore($account->id),
            ],
            'app_group' => 'nullable|string|max:64',
            'daily_post_cap' => 'nullable|integer|min:1|max:250',
            'active_hours_start' => ['nullable', 'string', 'regex:/^\d{2}:\d{2}$/'],
            'active_hours_end' => ['nullable', 'string', 'regex:/^\d{2}:\d{2}$/'],
            'status' => 'nullable|string|in:active,needs_reauth,paused,disabled',
            'access_token' => 'nullable|string',
            'token_expires_at' => 'nullable|date',
            'notes' => 'nullable|string|max:2000',
        ]);

        if (array_key_exists('display_name', $validated)) {
            $account->display_name = trim((string) $validated['display_name']);
        }
        if (array_key_exists('username', $validated)) {
            $account->username = $validated['username'] !== null && trim((string) $validated['username']) !== ''
                ? ltrim(trim((string) $validated['username']), '@')
                : null;
        }
        if (array_key_exists('threads_user_id', $validated)) {
            $account->threads_user_id = $validated['threads_user_id'] !== null && trim((string) $validated['threads_user_id']) !== ''
                ? trim((string) $validated['threads_user_id'])
                : null;
        }
        if (array_key_exists('app_group', $validated) && $validated['app_group'] !== null && trim((string) $validated['app_group']) !== '') {
            $account->app_group = trim((string) $validated['app_group']);
        }
        if (array_key_exists('daily_post_cap', $validated) && $validated['daily_post_cap'] !== null) {
            $account->daily_post_cap = (int) $validated['daily_post_cap'];
        }
        if (array_key_exists('active_hours_start', $validated) && $validated['active_hours_start'] !== null) {
            $account->active_hours_start = (string) $validated['active_hours_start'];
        }
        if (array_key_exists('active_hours_end', $validated) && $validated['active_hours_end'] !== null) {
            $account->active_hours_end = (string) $validated['active_hours_end'];
        }
        if (array_key_exists('status', $validated) && $validated['status'] !== null) {
            $account->status = (string) $validated['status'];
        }
        if (array_key_exists('notes', $validated)) {
            $account->notes = $validated['notes'];
        }
        if (array_key_exists('token_expires_at', $validated)) {
            $account->token_expires_at = $validated['token_expires_at'];
        }
        if (array_key_exists('access_token', $validated) && $validated['access_token'] !== null && trim((string) $validated['access_token']) !== '') {
            $account->setAccessToken((string) $validated['access_token']);
            $account->last_refreshed_at = now();
            if (! array_key_exists('token_expires_at', $validated) && $account->token_expires_at === null) {
                $account->token_expires_at = now()->addSeconds((int) config('threads.long_lived_token_ttl_seconds', 5184000));
            }
        }

        $account->save();

        $fresh = $this->baseAccountQuery()->find($account->id) ?? $account;

        return $this->success(
            $this->enrichAccount($fresh),
            'Cập nhật cấu hình tài khoản Threads thành công.'
        );
    }

    /**
     * Xóa tài khoản Threads.
     */
    public function destroy(int $id): JsonResponse
    {
        $account = ThreadsAccount::find($id);
        if (! $account) {
            return $this->failure('Không tìm thấy tài khoản Threads.', 404);
        }

        $account->delete();

        return $this->success(['deleted_id' => $id], 'Đã xóa tài khoản Threads.');
    }

    /**
     * Tạm dừng (paused) hoặc kích hoạt lại (active) một tài khoản Threads.
     */
    public function toggleStatus(Request $request, int $id): JsonResponse
    {
        $account = ThreadsAccount::find($id);
        if (! $account) {
            return $this->failure('Không tìm thấy tài khoản Threads.', 404);
        }

        $explicitStatus = $request->input('status');
        $targetStatus = null;
        if (is_string($explicitStatus) && in_array($explicitStatus, [
            ThreadsAccount::STATUS_ACTIVE,
            ThreadsAccount::STATUS_PAUSED,
            ThreadsAccount::STATUS_NEEDS_REAUTH,
            ThreadsAccount::STATUS_DISABLED,
        ], true)) {
            $targetStatus = $explicitStatus;
        } elseif ($account->status === ThreadsAccount::STATUS_ACTIVE) {
            $targetStatus = ThreadsAccount::STATUS_PAUSED;
        } else {
            $targetStatus = ThreadsAccount::STATUS_ACTIVE;
        }

        if ($targetStatus === ThreadsAccount::STATUS_ACTIVE) {
            $hasToken = ! empty($account->getRawOriginal('access_token_encrypted'));
            if (! $hasToken) {
                $account->status = ThreadsAccount::STATUS_NEEDS_REAUTH;
                $account->last_error_message = 'Tài khoản chưa được cấp Access Token qua OAuth 2.0.';
                $account->save();
                $fresh = $this->baseAccountQuery()->find($account->id) ?? $account;

                return $this->failure(
                    'Tài khoản chưa kết nối OAuth 2.0 (chưa có Access Token). Vui lòng bấm "Lấy link OAuth" để ủy quyền trước khi kích hoạt.',
                    422,
                    ['account' => $this->enrichAccount($fresh)],
                    'ACCOUNT_NEEDS_REAUTH'
                );
            }

            if ($account->token_expires_at !== null && $account->token_expires_at->isPast()) {
                $account->status = ThreadsAccount::STATUS_NEEDS_REAUTH;
                $account->last_error_message = 'Access Token 60 ngày của tài khoản đã hết hạn.';
                $account->save();
                $fresh = $this->baseAccountQuery()->find($account->id) ?? $account;

                return $this->failure(
                    'Access Token của tài khoản đã hết hạn. Vui lòng bấm "Làm mới Token" hoặc "Lấy link OAuth" để cấp lại quyền.',
                    422,
                    ['account' => $this->enrichAccount($fresh)],
                    'TOKEN_EXPIRED_NEEDS_REAUTH'
                );
            }
        }

        $account->status = $targetStatus;
        $account->save();

        $fresh = $this->baseAccountQuery()->find($account->id) ?? $account;

        return $this->success(
            $this->enrichAccount($fresh),
            $account->status === ThreadsAccount::STATUS_PAUSED
                ? 'Đã tạm dừng tài khoản Threads.'
                : 'Đã kích hoạt lại tài khoản Threads.'
        );
    }

    /**
     * Sinh URL ủy quyền Meta Threads OAuth 2.0 kèm tham số state chống CSRF.
     */
    public function authorizeUrl(Request $request, int $id, ThreadsOAuthService $oauthService): JsonResponse
    {
        $account = ThreadsAccount::find($id);
        if (! $account) {
            return $this->failure('Không tìm thấy tài khoản Threads.', 404);
        }

        $customRedirectUri = $request->input('redirect_uri');
        $payload = $oauthService->buildAuthorizeUrl(
            $account,
            is_string($customRedirectUri) ? $customRedirectUri : null
        );

        return $this->success(
            $payload,
            'Khởi tạo đường dẫn ủy quyền Meta Threads OAuth 2.0 thành công.'
        );
    }

    /**
     * Chủ động làm mới Long-Lived Access Token ngay cho một tài khoản.
     */
    public function refreshTokenNow(Request $request, int $id, ThreadsOAuthService $oauthService): JsonResponse
    {
        $account = ThreadsAccount::find($id);
        if (! $account) {
            return $this->failure('Không tìm thấy tài khoản Threads.', 404);
        }

        $result = $oauthService->refreshAccountToken($account);
        $fresh = $this->baseAccountQuery()->find($account->id) ?? $result['account'];

        if (! $result['success']) {
            return $this->failure(
                $result['message'],
                422,
                ['account' => $this->enrichAccount($fresh)],
                'THREADS_TOKEN_REFRESH_FAILED'
            );
        }

        return $this->success(
            $this->enrichAccount($fresh),
            $result['message']
        );
    }
}
