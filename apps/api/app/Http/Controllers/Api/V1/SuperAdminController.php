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
        $query = Tenant::withCount([
            'branches'     => fn ($q) => $q->withoutGlobalScope(TenantScope::class),
            'users'        => fn ($q) => $q->withoutGlobalScope(TenantScope::class),
            'repairOrders' => fn ($q) => $q->withoutGlobalScope(TenantScope::class),
        ]);

        if ($status = $request->input('status')) {
            if ($status !== 'all') {
                $query->where('status', $status);
            }
        }

        $rawSearch = $request->input('q') ?? $request->input('search');
        if ($rawSearch !== null && trim((string) $rawSearch) !== '') {
            $search = trim((string) $rawSearch);
            $query->where(function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        if ($request->boolean('all') || $request->input('per_page') === 'all') {
            $items = $query->orderBy('id', 'desc')->limit(1000)->get();
            $total = $items->count();

            return $this->success([
                'current_page'   => 1,
                'data'           => $items,
                'first_page_url' => $request->fullUrlWithQuery(['page' => 1]),
                'from'           => $total > 0 ? 1 : null,
                'last_page'      => 1,
                'last_page_url'  => $request->fullUrlWithQuery(['page' => 1]),
                'next_page_url'  => null,
                'path'           => $request->url(),
                'per_page'       => max($total, 1),
                'prev_page_url'  => null,
                'to'             => $total > 0 ? $total : null,
                'total'          => $total,
            ], 'Lấy danh sách gian hàng thành công.');
        }

        $perPage = max(1, min(500, (int) $request->input('per_page', 15)));
        $stores = $query->orderBy('id', 'desc')->paginate($perPage);

        return $this->success($stores, 'Lấy danh sách gian hàng thành công.');
    }

    /**
     * Phê duyệt gian hàng mới: kích hoạt tenant và user chủ tiệm, gia hạn 3 tháng.
     */
    public function approveStore(Request $request, int|string $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);

        $expiresAt = $tenant->expires_at ?? now()->addMonths(3);
        $tenant->update([
            'status'        => 'active',
            'trial_ends_at' => $tenant->trial_ends_at ?? $expiresAt,
            'expires_at'    => $expiresAt,
        ]);

        $defaultBranch = Branch::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->first();

        if (! $defaultBranch) {
            $baseBranchCode = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', substr($tenant->code, 0, 10))) ?: 'CN';
            $branchCode = $baseBranchCode . '-CN1';
            while (Branch::withoutGlobalScope(TenantScope::class)->where('code', $branchCode)->exists()) {
                $branchCode = $baseBranchCode . '-' . strtoupper(substr(uniqid(), -4));
            }

            $defaultBranch = Branch::withoutGlobalScope(TenantScope::class)->create([
                'tenant_id' => $tenant->id,
                'code'      => $branchCode,
                'name'      => $tenant->name . ' - Chi nhánh chính',
                'address'   => 'Trụ sở chính',
                'phone'     => $tenant->phone ?? '',
                'is_active' => true,
            ]);
        }

        // Kích hoạt tài khoản chủ tiệm
        User::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->where('role', 'admin')
            ->update([
                'is_active' => true,
                'branch_id' => $defaultBranch->id,
            ]);

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
