<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    /**
     * Áp dụng lọc cách ly theo Tenant cho truy vấn AuditLog.
     */
    protected function applyTenantScope($query, ?\App\Models\User $user): void
    {
        if (! $user || $user->role === 'super_admin') {
            return;
        }

        $tenantId = $user->tenant_id;
        if (empty($tenantId)) {
            return;
        }

        $masterTenantId = \App\Models\Scopes\TenantScope::resolveMasterTenantId();
        $isMasterTenant = $masterTenantId && (int) $tenantId === (int) $masterTenantId;

        $query->where(function ($q) use ($tenantId, $isMasterTenant) {
            $q->where('tenant_id', $tenantId)
              ->orWhere(function ($sub) use ($tenantId, $isMasterTenant) {
                  $sub->whereNull('tenant_id')
                      ->whereHas('user', function ($uq) use ($tenantId, $isMasterTenant) {
                          $uq->withoutGlobalScopes()->where(function ($utq) use ($tenantId, $isMasterTenant) {
                              $utq->where('users.tenant_id', $tenantId);
                              if ($isMasterTenant) {
                                  $utq->orWhereNull('users.tenant_id');
                              }
                          });
                      });
              });

            if ($isMasterTenant) {
                $q->orWhere(function ($subNull) {
                    $subNull->whereNull('tenant_id')->whereNull('user_id');
                });
            }
        });
    }

    /**
     * Danh sách nhật ký hoạt động hệ thống (Audit Trail).
     *
     * Hỗ trợ sắp xếp mới nhất, eager load user/causer, phân trang mặc định 50 bản ghi,
     * và lọc theo module (auditable_type) hoặc action.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user || ! in_array($user->role, ['admin', 'super_admin'], true)) {
            abort(403, 'Chỉ quản trị viên mới có quyền truy cập nhật ký hệ thống.');
        }

        $query = AuditLog::with(['user:id,name,email,role,avatar_url', 'auditable'])->latest('id');

        // Lọc theo module / auditable_type (ví dụ: RepairOrder, Payment, Warranty...)
        if ($module = $request->input('module', $request->input('auditable_type'))) {
            $query->where(function ($q) use ($module) {
                $q->where('auditable_type', $module)
                  ->orWhere('auditable_type', 'like', "%{$module}%");
            });
        }

        // Lọc theo action
        if ($action = $request->input('action')) {
            $query->where('action', 'like', "%{$action}%");
        }

        // Lọc theo người thực hiện
        if ($userId = $request->input('user_id')) {
            $query->where('user_id', $userId);
        }

        // Lọc theo auditable_id
        if ($auditableId = $request->input('auditable_id')) {
            $query->where('auditable_id', $auditableId);
        }

        // Lọc theo ngày tạo (from_date, to_date)
        if ($fromDate = $request->input('from_date')) {
            $query->where('created_at', '>=', \Illuminate\Support\Carbon::parse($fromDate)->startOfDay());
        }
        if ($toDate = $request->input('to_date')) {
            $query->where('created_at', '<=', \Illuminate\Support\Carbon::parse($toDate)->endOfDay());
        }

        // Lọc theo has_diff (có chứa old_values hoặc new_values)
        if ($request->has('has_diff')) {
            $hasDiff = filter_var($request->input('has_diff'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($hasDiff === true) {
                $query->where(function ($q) {
                    $q->whereNotNull('old_values')
                      ->orWhereNotNull('new_values');
                });
            } elseif ($hasDiff === false) {
                $query->whereNull('old_values')
                      ->whereNull('new_values');
            }
        }

        // Tìm kiếm tổng hợp theo q / search
        $rawSearch = $request->input('q') ?? $request->input('search');
        if ($rawSearch !== null && trim((string) $rawSearch) !== '') {
            $search = trim((string) $rawSearch);
            $query->where(function ($q) use ($search) {
                $q->where('details', 'like', "%{$search}%")
                  ->orWhere('action', 'like', "%{$search}%")
                  ->orWhere('user_name', 'like', "%{$search}%")
                  ->orWhere('auditable_type', 'like', "%{$search}%")
                  ->orWhere('ip_address', 'like', "%{$search}%");
            });
        }

        // Phân quyền tenant
        $this->applyTenantScope($query, $user);

        if ($request->boolean('all') || $request->input('per_page') === 'all') {
            $items = $query->limit(1000)->get();
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
            ], 'Lấy danh sách nhật ký hoạt động thành công.');
        }

        $perPage = max(1, min(500, (int) $request->input('per_page', $request->input('limit', 15))));
        $logs = $query->paginate($perPage);

        return $this->success($logs, 'Lấy danh sách nhật ký hoạt động thành công.');
    }

    /**
     * Chi tiết một bản ghi nhật ký hoạt động.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (! $user || ! in_array($user->role, ['admin', 'super_admin'], true)) {
            abort(403, 'Chỉ quản trị viên mới có quyền truy cập nhật ký hệ thống.');
        }

        $query = AuditLog::with(['user:id,name,email,role,avatar_url', 'auditable']);
        $this->applyTenantScope($query, $user);

        $log = $query->find($id);

        if (! $log) {
            return $this->empty('Không tìm thấy bản ghi nhật ký hoạt động.');
        }

        return $this->success($log, 'Lấy chi tiết nhật ký hoạt động thành công.');
    }
}
