<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Branch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class BranchController extends Controller
{
    /**
     * Danh sách chi nhánh hoạt động.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user('sanctum') ?? $request->user();

        if ($user) {
            $query = Branch::where('is_active', true);
            if ($user->role !== 'super_admin' && ! empty($user->tenant_id)) {
                $masterTenantId = \App\Models\Scopes\TenantScope::resolveMasterTenantId();
                $isMaster = $masterTenantId && (int) $user->tenant_id === (int) $masterTenantId;
                $query->where(function ($tq) use ($user, $isMaster) {
                    $tq->where('tenant_id', $user->tenant_id);
                    if ($isMaster) {
                        $tq->orWhereNull('tenant_id');
                    }
                });
            }
            $branches = $query->withCount(['users', 'repairOrders'])->get();
        } else {
            $branches = Branch::withoutGlobalScopes()
                ->where('is_active', true)
                ->get(['id', 'tenant_id', 'code', 'name', 'address', 'phone', 'is_active', 'created_at', 'updated_at']);
            $branches->each->makeHidden(['users', 'users_count', 'repair_orders_count']);
        }

        return $this->success($branches, 'Lấy danh sách chi nhánh thành công.');
    }

    /**
     * Chi tiết chi nhánh.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $user = $request->user('sanctum') ?? $request->user();

        if ($user) {
            $query = Branch::with(['users:id,branch_id,name,role,phone,avatar_url']);
            if ($user->role !== 'super_admin' && ! empty($user->tenant_id)) {
                $masterTenantId = \App\Models\Scopes\TenantScope::resolveMasterTenantId();
                $isMaster = $masterTenantId && (int) $user->tenant_id === (int) $masterTenantId;
                $query->where(function ($tq) use ($user, $isMaster) {
                    $tq->where('tenant_id', $user->tenant_id);
                    if ($isMaster) {
                        $tq->orWhereNull('tenant_id');
                    }
                });
            }
            $branch = $query->find($id);
        } else {
            $branch = Branch::withoutGlobalScopes()->find($id);
            $branch?->makeHidden(['users', 'users_count', 'repair_orders_count']);
        }

        if (! $branch) {
            return $this->empty('Không tìm thấy chi nhánh.');
        }

        return $this->success($branch, 'Lấy chi tiết chi nhánh thành công.');
    }

    /**
     * Tạo mới chi nhánh (chỉ dành cho Admin).
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user || ! in_array($user->role, ['admin', 'super_admin'], true)) {
            return $this->forbidden('Chỉ quản trị viên (Admin) mới có quyền tạo chi nhánh mới.');
        }

        $user->loadMissing('tenant');
        $tenant = $user->tenant;
        if ($tenant) {
            $quotaService = app(\App\Services\QuotaService::class);
            $quotaService->checkSubscriptionActive($tenant);
            $quotaService->checkBranchQuota($tenant);
        }

        if ($request->has('code') && is_string($request->input('code'))) {
            $request->merge(['code' => strtoupper(trim($request->input('code')))]);
        }

        $validated = $request->validate([
            'code'      => 'required|string|max:20|unique:branches,code',
            'name'      => 'required|string|max:255',
            'address'   => 'required|string|max:500',
            'phone'     => 'nullable|string|max:20',
            'is_active' => 'boolean',
        ]);

        $validated['code'] = strtoupper(trim($validated['code']));
        $validated['is_active'] = $validated['is_active'] ?? true;

        $branch = Branch::create($validated);

        AuditLog::create([
            'user_id'        => $request->user()->id,
            'user_name'      => $request->user()->name,
            'action'         => 'branch.created',
            'module'         => 'branch',
            'auditable_type' => 'Branch',
            'auditable_id'   => $branch->id,
            'description'    => "Quản trị viên {$request->user()->name} đã tạo mới chi nhánh {$branch->name} ({$branch->code})",
            'details'        => "Quản trị viên {$request->user()->name} đã tạo mới chi nhánh {$branch->name} ({$branch->code})",
            'metadata'       => ['branch_id' => $branch->id, 'code' => $branch->code],
            'ip_address'     => $request->ip(),
        ]);

        return $this->created($branch, 'Tạo chi nhánh mới thành công.');
    }

    /**
     * Cập nhật thông tin chi nhánh (chỉ dành cho Admin).
     */
    public function update(Request $request, int $id): JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'super_admin'], true)) {
            return $this->forbidden('Chỉ quản trị viên (Admin) mới có quyền cập nhật chi nhánh.');
        }

        $branch = Branch::find($id);

        if (! $branch) {
            return $this->empty('Không tìm thấy chi nhánh.');
        }

        if ($request->has('code') && is_string($request->input('code'))) {
            $request->merge(['code' => strtoupper(trim($request->input('code')))]);
        }

        $validated = $request->validate([
            'code'      => ['sometimes', 'required', 'string', 'max:20', Rule::unique('branches', 'code')->ignore($branch->id)],
            'name'      => 'sometimes|required|string|max:255',
            'address'   => 'sometimes|required|string|max:500',
            'phone'     => 'nullable|string|max:20',
            'is_active' => 'sometimes|boolean',
        ]);

        if (isset($validated['code'])) {
            $validated['code'] = strtoupper(trim($validated['code']));
        }

        $branch->update($validated);

        AuditLog::create([
            'user_id'        => $request->user()->id,
            'user_name'      => $request->user()->name,
            'action'         => 'branch.updated',
            'module'         => 'branch',
            'auditable_type' => 'Branch',
            'auditable_id'   => $branch->id,
            'description'    => "Quản trị viên {$request->user()->name} đã cập nhật chi nhánh {$branch->name} ({$branch->code})",
            'details'        => "Quản trị viên {$request->user()->name} đã cập nhật chi nhánh {$branch->name} ({$branch->code})",
            'metadata'       => ['branch_id' => $branch->id, 'code' => $branch->code],
            'ip_address'     => $request->ip(),
        ]);

        return $this->success($branch, 'Cập nhật thông tin chi nhánh thành công.');
    }

    /**
     * Bật / tắt trạng thái hoạt động của chi nhánh (chỉ dành cho Admin).
     */
    public function toggleStatus(Request $request, int $id): JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'super_admin'], true)) {
            return $this->forbidden('Chỉ quản trị viên (Admin) mới có quyền thay đổi trạng thái chi nhánh.');
        }

        $branch = Branch::find($id);

        if (! $branch) {
            return $this->empty('Không tìm thấy chi nhánh.');
        }

        $branch->is_active = ! $branch->is_active;
        $branch->save();

        $statusText = $branch->is_active ? 'kích hoạt' : 'tạm ngưng hoạt động';

        AuditLog::create([
            'user_id'        => $request->user()->id,
            'user_name'      => $request->user()->name,
            'action'         => 'branch.status_toggled',
            'module'         => 'branch',
            'auditable_type' => 'Branch',
            'auditable_id'   => $branch->id,
            'description'    => "Quản trị viên {$request->user()->name} đã {$statusText} chi nhánh {$branch->name} ({$branch->code})",
            'details'        => "Quản trị viên {$request->user()->name} đã {$statusText} chi nhánh {$branch->name} ({$branch->code})",
            'metadata'       => ['branch_id' => $branch->id, 'code' => $branch->code, 'is_active' => $branch->is_active],
            'ip_address'     => $request->ip(),
        ]);

        return $this->success($branch, "Đã {$statusText} chi nhánh thành công.");
    }
}
