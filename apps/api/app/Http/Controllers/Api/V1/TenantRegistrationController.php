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
     * Đăng ký gian hàng mới công khai, tự động kích hoạt 14 ngày dùng thử.
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
            'plan'       => ['nullable', 'string', 'in:trial,standard,pro'],
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
            'plan.in'               => 'Gói cước đăng ký không hợp lệ.',
        ]);

        $selectedPlan = $validated['plan'] ?? 'trial';
        $trialPeriodDays = 14;
        $expiresAt = now()->addDays($trialPeriodDays);

        $result = DB::transaction(function () use ($validated, $selectedPlan, $expiresAt) {
            // 1. Tạo Tenant tự động kích hoạt gói dùng thử
            $tenant = Tenant::create([
                'code'            => strtolower($validated['store_code']),
                'name'            => $validated['store_name'],
                'phone'           => $validated['phone'],
                'email'           => $validated['email'],
                'status'          => 'active',
                'plan'            => $selectedPlan,
                'current_plan_id' => $selectedPlan,
                'intended_plan'   => $selectedPlan,
                'trial_ends_at'   => $expiresAt,
                'expires_at'      => $expiresAt,
                'billing_cycle'   => 'monthly',
            ]);

            // 2. Tạo tài khoản chủ tiệm ở trạng thái kích hoạt sẵn
            $owner = User::forceCreate([
                'tenant_id' => $tenant->id,
                'name'      => $validated['owner_name'],
                'email'     => $validated['email'],
                'phone'     => $validated['phone'],
                'password'  => Hash::make($validated['password']),
                'role'      => 'admin',
                'is_active' => true,
            ]);

            return [
                'tenant' => [
                    'id'            => $tenant->id,
                    'code'          => $tenant->code,
                    'name'          => $tenant->name,
                    'status'        => $tenant->status,
                    'plan'          => $tenant->plan,
                    'intended_plan' => $tenant->intended_plan,
                    'trial_ends_at' => $tenant->trial_ends_at?->toISOString(),
                    'expires_at'    => $tenant->expires_at?->toISOString(),
                ],
                'owner'  => [
                    'id'        => $owner->id,
                    'name'      => $owner->name,
                    'email'     => $owner->email,
                    'phone'     => $owner->phone,
                    'role'      => $owner->role,
                    'is_active' => $owner->is_active,
                ],
            ];
        });

        return $this->success(
            $result,
            'Đăng ký gian hàng thành công. Gói dùng thử 14 ngày đã được kích hoạt.',
            201
        );
    }
}
