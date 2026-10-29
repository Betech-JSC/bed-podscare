<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\NotificationIsolationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function __construct(
        protected NotificationIsolationService $notificationIsolationService
    ) {
    }

    /**
     * Danh sách thông báo phân trang theo mô hình cô lập 3 tầng & trạng thái đọc per-user.
     * GET /api/v1/notifications
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->only([
            'user_id',
            'user',
            'branch_id',
            'branch',
            'is_read',
            'per_page',
            'page',
        ]);

        $data = $this->notificationIsolationService->listForUser($request->user(), $filters);

        return $this->success($data, 'Lấy danh sách thông báo thành công.');
    }

    /**
     * Đánh dấu một thông báo là đã đọc cho tài khoản hiện tại.
     * PATCH /api/v1/notifications/{id}/read
     */
    public function markAsRead(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return $this->failure('Unauthenticated.', 401);
        }

        $notification = $this->notificationIsolationService->markAsRead($user, $id);

        if (! $notification) {
            return $this->empty('Không tìm thấy thông báo.');
        }

        return $this->success($notification, 'Đánh dấu thông báo đã đọc thành công.');
    }

    /**
     * Đánh dấu toàn bộ thông báo chưa đọc trong phạm vi hợp lệ của tài khoản hiện tại là đã đọc.
     * POST /api/v1/notifications/read-all
     */
    public function markAllAsRead(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return $this->failure('Unauthenticated.', 401);
        }

        $filters = $request->only([
            'user_id',
            'user',
            'branch_id',
            'branch',
        ]);

        $updatedCount = $this->notificationIsolationService->markAllAsRead($user, $filters);

        return $this->success([
            'updated_count' => $updatedCount,
        ], 'Đánh dấu tất cả thông báo đã đọc thành công.');
    }
}
