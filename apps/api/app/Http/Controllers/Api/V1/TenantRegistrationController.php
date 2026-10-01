<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class TenantRegistrationController extends Controller
{
    /**
     * Đăng ký gian hàng mới công khai.
     */
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'store_code' => ['required', 'alpha_dash', 'unique:tenants,code'],
            'store_name' => ['required', 'string', 'max:255'],
            'owner_name' => ['required', 'string', 'max:255'],
            'phone'      => ['required', 'string'],
            'email'      => ['required', 'email', 'max:255'],
            'password'   => ['required', 'string', 'min:6'],
        ], [
            'store_code.required'   => 'Vui lòng nhập mã gian hàng.',
            'store_code.unique'     => 'Mã gian hàng đã tồn tại trên hệ thống.',
            'store_code.alpha_dash' => 'Mã gian hàng chỉ được chứa chữ cái, số, dấu gạch nối và gạch dưới.',
            'store_name.required'   => 'Vui lòng nhập tên cửa hàng.',
            'owner_name.required'   => 'Vui lòng nhập tên chủ cửa hàng.',
            'phone.required'        => 'Vui lòng nhập số điện thoại liên hệ.',
            'email.required'        => 'Vui lòng nhập địa chỉ email.',
            'email.email'           => 'Địa chỉ email không đúng định dạng.',
            'password.required'     => 'Vui lòng nhập mật khẩu.',
            'password.min'          => 'Mật khẩu phải có ít nhất 6 ký tự.',
        ]);

        $result = DB::transaction(function () use ($validated) {
            // 1. Tạo Tenant ở trạng thái chờ duyệt
            $tenant = Tenant::create([
                'code'       => strtolower($validated['store_code']),
                'name'       => $validated['store_name'],
                'phone'      => $validated['phone'],
                'email'      => $validated['email'],
                'status'     => 'pending',
                'plan'       => 'trial',
                'expires_at' => null,
            ]);

            // 2. Tạo tài khoản chủ tiệm ở trạng thái chưa kích hoạt
            $owner = User::forceCreate([
                'tenant_id' => $tenant->id,
                'name'      => $validated['owner_name'],
                'email'     => $validated['email'],
                'phone'     => $validated['phone'],
                'password'  => Hash::make($validated['password']),
                'role'      => 'admin',
                'is_active' => false,
            ]);

            return [
                'tenant' => [
                    'id'     => $tenant->id,
                    'code'   => $tenant->code,
                    'name'   => $tenant->name,
                    'status' => $tenant->status,
                    'plan'   => $tenant->plan,
                ],
                'owner' => [
                    'id'    => $owner->id,
                    'name'  => $owner->name,
                    'email' => $owner->email,
                    'phone' => $owner->phone,
                    'role'  => $owner->role,
                ],
            ];
        });

        return $this->success(
            $result,
            'Đăng ký gian hàng thành công. Hồ sơ đang được Ban quản trị xem xét.',
            201
        );
    }
}
