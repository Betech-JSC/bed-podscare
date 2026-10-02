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
        $branches = Branch::where('is_active', true)
            ->withCount(['users', 'repairOrders'])
            ->get();

        return $this->success($branches, 'Lấy danh sách chi nhánh thành công.');
    }

    /**
     * Chi tiết chi nhánh.
     */
    public function show(int $id): JsonResponse
    {
        $branch = Branch::with(['users:id,branch_id,name,role,phone,avatar_url'])
            ->find($id);

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
        if ($request->user()->role !== 'admin') {
            return $this->forbidden('Chỉ quản trị viên (Admin) mới có quyền tạo chi nhánh mới.');
        }

        $tenant = $request->user()->tenant;
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
            'auditable_type' => 'branch',
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
        if ($request->user()->role !== 'admin') {
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
            'auditable_type' => 'branch',
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
        if ($request->user()->role !== 'admin') {
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
            'auditable_type' => 'branch',
            'auditable_id'   => $branch->id,
            'description'    => "Quản trị viên {$request->user()->name} đã {$statusText} chi nhánh {$branch->name} ({$branch->code})",
            'details'        => "Quản trị viên {$request->user()->name} đã {$statusText} chi nhánh {$branch->name} ({$branch->code})",
            'metadata'       => ['branch_id' => $branch->id, 'code' => $branch->code, 'is_active' => $branch->is_active],
            'ip_address'     => $request->ip(),
        ]);

        return $this->success($branch, "Đã {$statusText} chi nhánh thành công.");
    }
}
