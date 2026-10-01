<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\RepairOrder;
use App\Models\Scopes\TenantScope;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SuperAdminController extends Controller
{
    /**
     * Thống kê tổng quan nền tảng cho Super Admin.
     */
    public function dashboardStats(Request $request): JsonResponse
    {
        $stats = [
            'total_tenants'       => Tenant::count(),
            'active_tenants'      => Tenant::where('status', 'active')->count(),
            'pending_tenants'     => Tenant::where('status', 'pending')->count(),
            'suspended_tenants'   => Tenant::where('status', 'suspended')->count(),
            'total_branches'      => Branch::withoutGlobalScope(TenantScope::class)->count(),
            'total_repair_orders' => RepairOrder::withoutGlobalScope(TenantScope::class)->count(),
        ];

        return $this->success($stats, 'Lấy thống kê nền tảng thành công.');
    }

    /**
     * Danh sách toàn bộ gian hàng trên nền tảng kèm tìm kiếm và phân trang.
     */
    public function stores(Request $request): JsonResponse
    {
        $query = Tenant::withCount(['branches', 'users', 'repairOrders']);

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $perPage = (int) $request->input('per_page', 15);
        $stores = $query->orderBy('id', 'desc')->paginate($perPage);

        return $this->success($stores, 'Lấy danh sách gian hàng thành công.');
    }

    /**
     * Phê duyệt gian hàng mới: kích hoạt tenant và user chủ tiệm, gia hạn 14 ngày.
     */
    public function approveStore(Request $request, int|string $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);

        $tenant->update([
            'status'     => 'active',
            'expires_at' => now()->addDays(14),
        ]);

        // Kích hoạt tài khoản chủ tiệm
        User::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->where('role', 'admin')
            ->update(['is_active' => true]);

        return $this->success($tenant->fresh(), 'Phê duyệt gian hàng thành công.');
    }

    /**
     * Tạm khóa gian hàng: chặn toàn bộ truy cập của người dùng thuộc tenant.
     */
    public function suspendStore(Request $request, int|string $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);

        $tenant->update([
            'status' => 'suspended',
        ]);

        return $this->success($tenant->fresh(), 'Tạm khóa gian hàng thành công.');
    }

    /**
     * Mở khóa / kích hoạt lại gian hàng.
     */
    public function activateStore(Request $request, int|string $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);

        $tenant->update([
            'status' => 'active',
        ]);

        return $this->success($tenant->fresh(), 'Kích hoạt lại gian hàng thành công.');
    }
}
