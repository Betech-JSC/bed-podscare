<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /**
     * Danh sách thông báo (phân trang, hỗ trợ lọc theo user, branch, is_read).
     * GET /api/v1/notifications
     */
    public function index(Request $request): JsonResponse
    {
        $query = Notification::query()
            ->with(['repairOrder:id,order_code,status,customer_id', 'user:id,name,role', 'branch:id,name']);

        // Lọc theo user_id
        if ($userId = $request->input('user_id', $request->input('user'))) {
            $query->where('user_id', $userId);
        }

        // Lọc theo branch_id (bỏ qua nếu là 'all')
        if ($branchId = $request->input('branch_id', $request->input('branch'))) {
            if ($branchId !== 'all') {
                $query->where('branch_id', $branchId);
            }
        }

        // Lọc theo trạng thái đã đọc is_read
        if ($request->has('is_read')) {
            $isRead = filter_var($request->input('is_read'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($isRead !== null) {
                $query->where('is_read', $isRead);
            }
        }

        $perPage = (int) $request->input('per_page', 20);
        $notifications = $query->latest('id')->paginate($perPage);

        // Tính toán tổng số thông báo chưa đọc tương ứng theo ngữ cảnh bộ lọc
        $unreadQuery = Notification::query()->where('is_read', false);
        if ($userId) {
            $unreadQuery->where('user_id', $userId);
        }
        if ($branchId && $branchId !== 'all') {
            $unreadQuery->where('branch_id', $branchId);
        }
        $unreadCount = $unreadQuery->count();

        // Gắn unread_count vào dữ liệu phân trang
        $data = $notifications->toArray();
        $data['unread_count'] = $unreadCount;

        return $this->success($data, 'Lấy danh sách thông báo thành công.');
    }

    /**
     * Đánh dấu một thông báo là đã đọc.
     * PATCH /api/v1/notifications/{id}/read
     */
    public function markAsRead(int $id): JsonResponse
    {
        $notification = Notification::with(['repairOrder:id,order_code,status'])->find($id);

        if (! $notification) {
            return $this->empty('Không tìm thấy thông báo.');
        }

        $notification->update([
            'is_read' => true,
            'read_at' => now(),
        ]);

        return $this->success($notification, 'Đánh dấu thông báo đã đọc thành công.');
    }

    /**
     * Đánh dấu toàn bộ thông báo là đã đọc.
     * POST /api/v1/notifications/read-all
     */
    public function markAllAsRead(Request $request): JsonResponse
    {
        $query = Notification::where('is_read', false);

        if ($userId = $request->input('user_id', $request->input('user'))) {
            $query->where('user_id', $userId);
        }

        if ($branchId = $request->input('branch_id', $request->input('branch'))) {
            $query->where('branch_id', $branchId);
        }

        // Nếu không truyền tham số lọc và người dùng đăng nhập không phải admin, giới hạn theo người dùng
        if (! $userId && ! $branchId && $user = $request->user()) {
            if ($user->role !== 'admin') {
                $query->where(function ($q) use ($user) {
                    $q->where('user_id', $user->id);
                    if ($user->branch_id) {
                        $q->orWhere('branch_id', $user->branch_id);
                    }
                });
            }
        }

        $updatedCount = $query->update([
            'is_read' => true,
            'read_at' => now(),
        ]);

        return $this->success([
            'updated_count' => $updatedCount,
        ], 'Đánh dấu tất cả thông báo đã đọc thành công.');
    }
}
