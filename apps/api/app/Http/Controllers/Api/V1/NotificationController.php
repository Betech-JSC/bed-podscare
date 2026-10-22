<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /**
     * Áp dụng cách ly theo Tenant cho truy vấn Notification (thông qua user, branch hoặc repairOrder).
     */
    protected function applyTenantScope($query, ?\App\Models\User $user): void
    {
        if (! $user || $user->role === 'super_admin') {
            return;
        }

        $tenantId = $user->tenant_id;
        $masterTenantId = \App\Models\Scopes\TenantScope::resolveMasterTenantId();
        $isMasterTenant = ! $tenantId || ($masterTenantId && (int) $tenantId === (int) $masterTenantId);

        $query->where(function ($q) use ($tenantId, $isMasterTenant) {
            $q->whereHas('user', function ($uq) use ($tenantId, $isMasterTenant) {
                $uq->withoutGlobalScopes();
                if ($tenantId) {
                    $uq->where(function ($sub) use ($tenantId, $isMasterTenant) {
                        $sub->where('users.tenant_id', $tenantId);
                        if ($isMasterTenant) {
                            $sub->orWhereNull('users.tenant_id');
                        }
                    });
                }
            })
            ->orWhereHas('branch', function ($bq) use ($tenantId, $isMasterTenant) {
                $bq->withoutGlobalScopes();
                if ($tenantId) {
                    $bq->where(function ($sub) use ($tenantId, $isMasterTenant) {
                        $sub->where('branches.tenant_id', $tenantId);
                        if ($isMasterTenant) {
                            $sub->orWhereNull('branches.tenant_id');
                        }
                    });
                }
            })
            ->orWhereHas('repairOrder', function ($oq) use ($tenantId, $isMasterTenant) {
                $oq->withoutGlobalScopes();
                if ($tenantId) {
                    $oq->where(function ($sub) use ($tenantId, $isMasterTenant) {
                        $sub->where('repair_orders.tenant_id', $tenantId);
                        if ($isMasterTenant) {
                            $sub->orWhereNull('repair_orders.tenant_id');
                        }
                    });
                }
            });

            if ($isMasterTenant) {
                $q->orWhere(function ($nullQ) {
                    $nullQ->whereNull('user_id')
                          ->whereNull('branch_id')
                          ->whereNull('order_id');
                });
            }
        });
    }

    /**
     * Danh sách thông báo (phân trang, hỗ trợ lọc theo user, branch, is_read).
     * GET /api/v1/notifications
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Notification::query()
            ->with(['repairOrder:id,order_code,status,customer_id', 'user:id,name,role', 'branch:id,name']);

        $this->applyTenantScope($query, $user);

        // Lọc theo user_id
        if ($userId = $request->input('user_id', $request->input('user'))) {
            $query->where('user_id', $userId);
        }

        // Lọc theo branch_id (bỏ qua nếu là 'all')
        $branchId = $request->input('branch_id', $request->input('branch'));
        if ($user && ! in_array($user->role, ['admin', 'super_admin'], true) && ! $userId && ! $branchId && $user->branch_id) {
            $query->where(function ($q) use ($user) {
                $q->where('branch_id', $user->branch_id)
                  ->orWhere('user_id', $user->id)
                  ->orWhereNull('branch_id');
            });
        } elseif ($branchId && $branchId !== 'all') {
            $query->where('branch_id', $branchId);
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
        $this->applyTenantScope($unreadQuery, $user);
        if ($userId) {
            $unreadQuery->where('user_id', $userId);
        }
        if ($user && ! in_array($user->role, ['admin', 'super_admin'], true) && ! $userId && ! $branchId && $user->branch_id) {
            $unreadQuery->where(function ($q) use ($user) {
                $q->where('branch_id', $user->branch_id)
                  ->orWhere('user_id', $user->id)
                  ->orWhereNull('branch_id');
            });
        } elseif ($branchId && $branchId !== 'all') {
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
    public function markAsRead(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $query = Notification::with(['repairOrder:id,order_code,status']);
        $this->applyTenantScope($query, $user);

        $notification = $query->find($id);

        if (! $notification) {
            return $this->empty('Không tìm thấy thông báo.');
        }

        if ($user && ! in_array($user->role, ['admin', 'super_admin'], true)) {
            if ($notification->user_id && (int) $notification->user_id !== (int) $user->id) {
                abort(403, 'Bạn không có quyền đánh dấu thông báo của người dùng khác.');
            }
            if ($notification->branch_id && $user->branch_id && (int) $notification->branch_id !== (int) $user->branch_id) {
                abort(403, 'Bạn không có quyền đánh dấu thông báo của chi nhánh khác.');
            }
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
        $user = $request->user();
        $query = Notification::where('is_read', false);
        $this->applyTenantScope($query, $user);

        $userId = $request->input('user_id', $request->input('user'));
        if ($userId) {
            $query->where('user_id', $userId);
        }

        $branchId = $request->input('branch_id', $request->input('branch'));
        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        // Nếu không truyền tham số lọc và người dùng đăng nhập không phải admin/super_admin, giới hạn theo người dùng
        if (! $userId && ! $branchId && $user) {
            if (! in_array($user->role, ['admin', 'super_admin'], true)) {
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
