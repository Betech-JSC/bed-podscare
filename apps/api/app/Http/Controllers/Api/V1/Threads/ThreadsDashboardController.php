<?php

namespace App\Http\Controllers\Api\V1\Threads;

use App\Http\Controllers\Controller;
use App\Models\ThreadsAccount;
use App\Models\ThreadsPost;
use App\Models\ThreadsPublishLog;
use App\Services\Threads\ThreadsTokenCipher;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ThreadsDashboardController extends Controller
{
    /**
     * Thống kê tổng quan mạng lưới 20 tài khoản Threads và danh sách nhật ký xuất bản mới nhất.
     */
    public function index(Request $request): JsonResponse
    {
        $startOfToday = now()->startOfDay();
        $endOfToday = now()->endOfDay();

        $totalAccounts = ThreadsAccount::query()->count();
        $activeAccounts = ThreadsAccount::query()->where('status', ThreadsAccount::STATUS_ACTIVE)->count();
        $needsReauthAccounts = ThreadsAccount::query()->where('status', ThreadsAccount::STATUS_NEEDS_REAUTH)->count();
        $pausedAccounts = ThreadsAccount::query()->where('status', ThreadsAccount::STATUS_PAUSED)->count();
        $disabledAccounts = ThreadsAccount::query()->where('status', ThreadsAccount::STATUS_DISABLED)->count();

        $scheduledToday = ThreadsPost::query()
            ->where('status', ThreadsPost::STATUS_SCHEDULED)
            ->where(function (Builder $q) use ($startOfToday, $endOfToday) {
                $q->whereBetween('scheduled_at', [$startOfToday, $endOfToday])
                    ->orWhere(function (Builder $autoChainQuery) use ($startOfToday) {
                        $autoChainQuery->whereNull('scheduled_at')
                            ->where('created_at', '>=', $startOfToday);
                    });
            })
            ->count();

        $publishedToday = ThreadsPost::query()
            ->where('status', ThreadsPost::STATUS_PUBLISHED)
            ->where(function (Builder $q) use ($startOfToday) {
                $q->where('published_at', '>=', $startOfToday)
                    ->orWhere(function (Builder $fallback) use ($startOfToday) {
                        $fallback->whereNull('published_at')
                            ->where('updated_at', '>=', $startOfToday);
                    });
            })
            ->count();

        $failedPosts = ThreadsPost::query()
            ->where('status', ThreadsPost::STATUS_FAILED)
            ->count();

        $sponsoredPostsCount = ThreadsPost::query()
            ->where('is_sponsored', true)
            ->whereNotIn('status', [ThreadsPost::STATUS_CANCELLED])
            ->count();

        $logsLimit = $request->filled('logs_limit')
            ? max(1, min(100, (int) $request->input('logs_limit')))
            : 30;

        $recentLogs = ThreadsPublishLog::query()
            ->with('account:id,display_name,username,status,app_group')
            ->orderByDesc('id')
            ->limit($logsLimit)
            ->get()
            ->map(fn (ThreadsPublishLog $log) => $this->sanitizeLog($log))
            ->values();

        return $this->success([
            'total_accounts'        => $totalAccounts,
            'active_accounts'       => $activeAccounts,
            'needs_reauth_accounts' => $needsReauthAccounts,
            'paused_accounts'       => $pausedAccounts,
            'disabled_accounts'     => $disabledAccounts,
            'scheduled_today'       => $scheduledToday,
            'published_today'       => $publishedToday,
            'failed_posts'          => $failedPosts,
            'sponsored_posts_count' => $sponsoredPostsCount,
            'recent_logs'           => $recentLogs,
            'publish_logs'          => $recentLogs,
            'threads_publish_logs'  => $recentLogs,
        ], 'Lấy số liệu thống kê Threads Dashboard thành công.');
    }

    /**
     * Alias cho index().
     */
    public function stats(Request $request): JsonResponse
    {
        return $this->index($request);
    }

    /**
     * Danh sách lịch sử gọi API / xuất bản bài đăng (threads_publish_logs) đã ẩn tuyệt đối token.
     */
    public function logs(Request $request): JsonResponse
    {
        $query = ThreadsPublishLog::query()
            ->with('account:id,display_name,username,status,app_group');

        if ($request->filled('account_id') && is_numeric($request->input('account_id'))) {
            $query->where('account_id', (int) $request->input('account_id'));
        }

        if ($request->filled('post_id') && is_numeric($request->input('post_id'))) {
            $query->where('post_id', (int) $request->input('post_id'));
        }

        if ($request->filled('action')) {
            $action = trim((string) $request->input('action'));
            if ($action !== '' && strtolower($action) !== 'all') {
                $query->where('action', $action);
            }
        }

        $limit = $request->filled('limit')
            ? max(1, min(200, (int) $request->input('limit')))
            : 50;

        $logs = $query
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn (ThreadsPublishLog $log) => $this->sanitizeLog($log))
            ->values();

        return $this->success($logs, 'Lấy nhật ký xuất bản Threads thành công.');
    }

    /**
     * Đảm bảo request_payload và response_payload của bản ghi log luôn được redact token.
     */
    protected function sanitizeLog(ThreadsPublishLog $log): ThreadsPublishLog
    {
        if ($log->request_payload !== null) {
            $log->request_payload = ThreadsTokenCipher::redact($log->request_payload);
        }
        if ($log->response_payload !== null) {
            $log->response_payload = ThreadsTokenCipher::redact($log->response_payload);
        }

        return $log;
    }
}
