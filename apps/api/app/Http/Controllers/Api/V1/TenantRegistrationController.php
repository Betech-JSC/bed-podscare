<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Scopes\TenantScope;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class TenantRegistrationController extends Controller
{
    /**
     * Đăng ký gian hàng mới công khai, tự động phê duyệt & kích hoạt ngay 3 tháng dùng thử kèm token đăng nhập.
     */
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'store_code' => ['required', 'alpha_dash', 'unique:tenants,code'],
            'store_name' => ['required', 'string', 'max:255'],
            'owner_name' => ['required', 'string', 'max:255'],
            'phone'      => ['required', 'string'],
            'email'      => ['required', 'email', 'max:255', 'unique:users,email'],
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
            'email.unique'          => 'Địa chỉ email này đã được đăng ký trên hệ thống.',
            'password.required'     => 'Vui lòng nhập mật khẩu.',
            'password.min'          => 'Mật khẩu phải có ít nhất 6 ký tự.',
            'plan.in'               => 'Gói cước đăng ký không hợp lệ.',
        ]);

        $selectedPlan = $validated['plan'] ?? 'trial';
        $expiresAt = now()->addMonths(3);
        $trialPeriodDays = max(0, (int) now()->diffInDays($expiresAt, false));

        $result = DB::transaction(function () use ($validated, $selectedPlan, $trialPeriodDays, $expiresAt) {
            // 1. Tạo Tenant tự động phê duyệt (status = active) & kích hoạt gói dùng thử
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

            // 2. Tự động khởi tạo Chi nhánh chính mặc định cho gian hàng để sử dụng được ngay
            $baseBranchCode = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', substr($tenant->code, 0, 10))) ?: 'CN';
            $branchCode = $baseBranchCode . '-CN1';
            while (Branch::withoutGlobalScope(TenantScope::class)->where('code', $branchCode)->exists()) {
                $branchCode = $baseBranchCode . '-' . strtoupper(substr(uniqid(), -4));
            }

            $branch = Branch::withoutGlobalScope(TenantScope::class)->create([
                'tenant_id' => $tenant->id,
                'code'      => $branchCode,
                'name'      => $validated['store_name'] . ' - Chi nhánh chính',
                'address'   => 'Trụ sở chính',
                'phone'     => $validated['phone'],
                'is_active' => true,
            ]);

            // 3. Tạo tài khoản chủ tiệm ở trạng thái kích hoạt sẵn và gắn với chi nhánh chính
            $owner = User::forceCreate([
                'tenant_id' => $tenant->id,
                'branch_id' => $branch->id,
                'name'      => $validated['owner_name'],
                'email'     => $validated['email'],
                'phone'     => $validated['phone'],
                'password'  => Hash::make($validated['password']),
                'role'      => 'admin',
                'is_active' => true,
            ]);

            // 4. Cấp ngay Sanctum API token để khách dùng app tức thì không cần chờ duyệt hay đăng nhập lại
            $token = $owner->createToken('auth_token', ["tenant:{$tenant->id}"])->plainTextToken;

            $tenantPayload = [
                'id'                  => $tenant->id,
                'code'                => $tenant->code,
                'name'                => $tenant->name,
                'status'              => $tenant->status,
                'plan'                => $tenant->plan,
                'intended_plan'       => $tenant->intended_plan,
                'trial_ends_at'       => $tenant->trial_ends_at?->toISOString(),
                'expires_at'          => $tenant->expires_at?->toISOString(),
                'days_remaining'      => $trialPeriodDays,
                'settings'            => $tenant->settings ?? null,
                'logo_url'            => $tenant->logo_url,
                'hotline'             => $tenant->hotline,
                'receipt_footer_note' => $tenant->receipt_footer_note,
            ];

            $branchPayload = [
                'id'        => $branch->id,
                'code'      => $branch->code,
                'name'      => $branch->name,
                'address'   => $branch->address,
                'phone'     => $branch->phone,
                'is_active' => $branch->is_active,
            ];

            return [
                'token'      => $token,
                'token_type' => 'Bearer',
                'tenant'     => $tenantPayload,
                'branch'     => $branchPayload,
                'owner'      => [
                    'id'        => $owner->id,
                    'name'      => $owner->name,
                    'email'     => $owner->email,
                    'phone'     => $owner->phone,
                    'role'      => $owner->role,
                    'is_active' => $owner->is_active,
                    'branch_id' => $branch->id,
                ],
                'user'       => [
                    'id'         => $owner->id,
                    'name'       => $owner->name,
                    'email'      => $owner->email,
                    'phone'      => $owner->phone,
                    'role'       => $owner->role,
                    'is_active'  => (bool) $owner->is_active,
                    'tenant_id'  => $tenant->id,
                    'tenant'     => $tenantPayload,
                    'avatar_url' => $owner->avatar_url,
                    'branch_id'  => $branch->id,
                    'branch'     => [
                        'id'   => $branch->id,
                        'code' => $branch->code,
                        'name' => $branch->name,
                    ],
                ],
            ];
        });

        return $this->success(
            $result,
            'Đăng ký gian hàng thành công. Gian hàng đã được tự động phê duyệt và kích hoạt 3 tháng dùng thử.',
            201
        );
    }
}
