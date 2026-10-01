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

        if ($branchId = $request->input('branch_id')) {
            $query->where('branch_id', $branchId);
        }

        if ($request->has('is_active')) {
            $query->where('is_active', filter_var($request->input('is_active'), FILTER_VALIDATE_BOOLEAN));
        }

        $users = $query->orderBy('id', 'desc')->paginate($request->input('per_page', 20));

        return $this->success($users, 'Lấy danh sách người dùng thành công.');
    }

    /**
     * Cấp tài khoản mới cho nhân viên.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'      => 'required|string|max:255',
            'email'     => 'required|email|max:255|unique:users,email',
            'password'  => 'required|string|min:6',
            'phone'     => 'nullable|string|max:20',
            'branch_id' => 'required_if:role,cskh,technician,tech,qc,inventory,warehouse|nullable|exists:branches,id',
            'role'      => ['required', 'string', Rule::in(['admin', 'cskh', 'technician', 'tech', 'qc', 'inventory', 'warehouse'])],
        ], [
            'branch_id.required_if' => 'Chi nhánh công tác là bắt buộc đối với nhân sự chi nhánh.',
        ]);

        $role = $validated['role'] === 'tech' ? 'technician' : $validated['role'];

        $user = new User([
            'name'       => $validated['name'],
            'email'      => $validated['email'],
            'phone'      => $validated['phone'] ?? null,
            'password'   => Hash::make($validated['password']),
            'branch_id'  => $validated['branch_id'] ?? null,
            'is_active'  => true,
            'avatar_url' => 'https://ui-avatars.com/api/?name=' . urlencode($validated['name']) . '&background=176B58&color=fff',
        ]);

        if ($request->user() && $request->user()->role === 'admin') {
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

        $validated = $request->validate([
            'name'      => 'sometimes|required|string|max:255',
            'email'     => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password'  => 'nullable|string|min:6',
            'phone'     => 'nullable|string|max:20',
            'branch_id' => 'sometimes|required_if:role,cskh,technician,tech,qc,inventory,warehouse|nullable|exists:branches,id',
            'role'      => ['sometimes', 'required', 'string', Rule::in(['admin', 'cskh', 'technician', 'tech', 'qc', 'inventory', 'warehouse'])],
            'is_active' => 'sometimes|boolean',
        ], [
            'branch_id.required_if' => 'Chi nhánh công tác là bắt buộc đối với nhân sự chi nhánh.',
        ]);

        if (isset($validated['role']) && $validated['role'] === 'tech') {
            $validated['role'] = 'technician';
        }

        if (isset($validated['role'])) {
            if ($request->user() && $request->user()->role === 'admin') {
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

        return $this->success($user, 'Cập nhật tài khoản thành công.');
    }

    /**
     * Khóa hoặc kích hoạt tài khoản.
     */
    public function toggleStatus(int $id): JsonResponse
    {
        $user = User::find($id);

        if (! $user) {
            return $this->empty('Không tìm thấy tài khoản người dùng.');
        }

        $user->is_active = ! $user->is_active;
        $user->save();
        $user->load('branch');

        $statusText = $user->is_active ? 'kích hoạt' : 'tạm khóa';

        return $this->success($user, "Đã {$statusText} tài khoản thành công.");
    }
}
