<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    /**
     * Danh sách nhân viên trong hệ thống.
     */
    public function index(Request $request): JsonResponse
    {
        $query = User::with('branch');

        if ($request->user() && ! in_array($request->user()->role, ['admin', 'super_admin'], true)) {
            $query->where('branch_id', $request->user()->branch_id)->where('is_active', true);
        } else {
            if ($branchId = $request->input('branch_id')) {
                $query->where('branch_id', $branchId);
            }

            if ($request->has('is_active')) {
                $query->where('is_active', filter_var($request->input('is_active'), FILTER_VALIDATE_BOOLEAN));
            }
        }

        if ($search = $request->input('q')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        if ($role = $request->input('role')) {
            $query->where('role', $role);
        }

        $users = $query->orderBy('id', 'desc')->paginate($request->input('per_page', 20));

        return $this->success($users, 'Lấy danh sách người dùng thành công.');
    }

    /**
     * Tạo rule kiểm tra branch_id thuộc cùng Tenant với người dùng đang đăng nhập.
     */
    protected function branchExistsRuleForUser(?\App\Models\User $authUser)
    {
        $rule = Rule::exists('branches', 'id');
        if ($authUser && $authUser->role !== 'super_admin' && ! empty($authUser->tenant_id)) {
            $tenantId = $authUser->tenant_id;
            $masterTenantId = \App\Models\Scopes\TenantScope::resolveMasterTenantId();
            $isMaster = $masterTenantId && (int) $tenantId === (int) $masterTenantId;
            $rule->where(function ($q) use ($tenantId, $isMaster, $authUser) {
                $q->where('tenant_id', $tenantId);
                if ($authUser->branch_id) {
                    $q->orWhere('id', $authUser->branch_id);
                }
                if ($isMaster) {
                    $q->orWhereNull('tenant_id');
                }
            });
        }

        return $rule;
    }

    /**
     * Cấp tài khoản mới cho nhân viên.
     */
    public function store(Request $request): JsonResponse
    {
        $authUser = $request->user();
        $authUser?->loadMissing('tenant');
        $tenant = $authUser?->tenant;
        if ($tenant) {
            $quotaService = app(\App\Services\QuotaService::class);
            $quotaService->checkSubscriptionActive($tenant);
            $quotaService->checkUserQuota($tenant);
        }

        $validated = $request->validate([
            'name'      => 'required|string|max:255',
            'email'     => 'required|email|max:255|unique:users,email',
            'password'  => 'required|string|min:6',
            'phone'     => 'nullable|string|max:20',
            'branch_id' => [
                'required_if:role,cskh,technician,tech,qc,inventory,warehouse',
                'nullable',
                $this->branchExistsRuleForUser($authUser),
            ],
            'role'      => ['required', 'string', Rule::in(['admin', 'cskh', 'technician', 'tech', 'qc', 'inventory', 'warehouse'])],
        ], [
            'branch_id.required_if' => 'Chi nhánh công tác là bắt buộc đối với nhân sự chi nhánh.',
        ]);

        $role = $validated['role'] === 'tech' ? 'technician' : $validated['role'];

        $user = new User([
            'tenant_id'  => $tenant?->id ?? $authUser?->tenant_id,
            'name'       => $validated['name'],
            'email'      => $validated['email'],
            'phone'      => $validated['phone'] ?? null,
            'password'   => Hash::make($validated['password']),
            'branch_id'  => $validated['branch_id'] ?? null,
            'is_active'  => true,
            'avatar_url' => 'https://ui-avatars.com/api/?name=' . urlencode($validated['name']) . '&background=176B58&color=fff',
        ]);

        if ($authUser && in_array($authUser->role, ['admin', 'super_admin'], true)) {
            $user->role = $role;
        }

        $user->save();
        $user->load('branch');

        return $this->success($user, 'Cấp tài khoản nhân viên thành công.', 201);
    }

    /**
     * Cập nhật thông tin / vai trò người dùng.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = User::find($id);

        if (! $user) {
            return $this->empty('Không tìm thấy tài khoản người dùng.');
        }

        if (! $request->has('role')) {
            $request->merge(['role' => $user->role]);
        }

        $authUser = $request->user();
        $validated = $request->validate([
            'name'      => 'sometimes|required|string|max:255',
            'email'     => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password'  => 'nullable|string|min:6',
            'phone'     => 'nullable|string|max:20',
            'branch_id' => [
                'sometimes',
                'required_if:role,cskh,technician,tech,qc,inventory,warehouse',
                'nullable',
                $this->branchExistsRuleForUser($authUser),
            ],
            'role'      => ['sometimes', 'required', 'string', Rule::in(['admin', 'cskh', 'technician', 'tech', 'qc', 'inventory', 'warehouse'])],
            'is_active' => 'sometimes|boolean',
        ], [
            'branch_id.required_if' => 'Chi nhánh công tác là bắt buộc đối với nhân sự chi nhánh.',
        ]);

        $oldRole = $user->role;
        $oldBranchId = $user->branch_id;
        $oldIsActive = (bool) $user->is_active;

        if (isset($validated['role']) && $validated['role'] === 'tech') {
            $validated['role'] = 'technician';
        }

        if (isset($validated['role'])) {
            if ($request->user() && in_array($request->user()->role, ['admin', 'super_admin'], true)) {
                $user->role = $validated['role'];
            }
            unset($validated['role']);
        }

        if (! empty($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        } else {
            unset($validated['password']);
        }

        $user->update($validated);
        $user->save();
        $user->load('branch');

        $newRole = $user->role;
        $newBranchId = $user->branch_id;
        $newIsActive = (bool) $user->is_active;

        if ($oldRole !== $newRole || $oldBranchId !== $newBranchId || $oldIsActive !== $newIsActive) {
            app(\App\Services\AuditLogService::class)->logFieldDiff(
                $user->tenant_id,
                $request->user(),
                'Thay đổi phân quyền',
                $user,
                [
                    'role'      => $oldRole,
                    'branch_id' => $oldBranchId,
                    'is_active' => $oldIsActive,
                ],
                [
                    'role'      => $newRole,
                    'branch_id' => $newBranchId,
                    'is_active' => $newIsActive,
                ],
                "Quản trị viên {$request->user()?->name} thay đổi phân quyền cho tài khoản {$user->name} ({$user->email})",
                [
                    'target_user_id' => $user->id,
                    'old_role'       => $oldRole,
                    'new_role'       => $newRole,
                    'old_branch_id'  => $oldBranchId,
                    'new_branch_id'  => $newBranchId,
                    'old_is_active'  => $oldIsActive,
                    'new_is_active'  => $newIsActive,
                ]
            );
        }

        return $this->success($user, 'Cập nhật tài khoản thành công.');
    }

    /**
     * Khóa hoặc kích hoạt tài khoản.
     */
    public function toggleStatus(Request $request, int $id): JsonResponse
    {
        $user = User::find($id);

        if (! $user) {
            return $this->empty('Không tìm thấy tài khoản người dùng.');
        }

        $oldIsActive = (bool) $user->is_active;
        $user->is_active = ! $user->is_active;
        $user->save();
        $user->load('branch');

        $statusText = $user->is_active ? 'kích hoạt' : 'tạm khóa';

        app(\App\Services\AuditLogService::class)->logFieldDiff(
            $user->tenant_id,
            $request->user(),
            'Thay đổi phân quyền',
            $user,
            ['is_active' => $oldIsActive],
            ['is_active' => (bool) $user->is_active],
            "Quản trị viên " . ($request->user()?->name ?? 'Admin') . " {$statusText} tài khoản {$user->name}",
            [
                'target_user_id' => $user->id,
                'old_is_active'  => $oldIsActive,
                'new_is_active'  => (bool) $user->is_active,
            ]
        );

        return $this->success($user, "Đã {$statusText} tài khoản thành công.");
    }
}
