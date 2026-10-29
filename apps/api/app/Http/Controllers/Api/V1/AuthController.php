<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Scopes\TenantScope;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    /**
     * Đăng nhập người dùng & cấp Sanctum API token theo ngữ cảnh Tenant hoặc Super Admin.
     */
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'password' => 'required|string',
        ]);

        $loginInput = $request->input('email') ?? $request->input('phone') ?? $request->input('login');
        if (! $loginInput) {
            return $this->failure('Vui lòng nhập Email hoặc Số điện thoại.', 422);
        }

        $storeCode = trim((string) ($request->input('store_code') ?? $request->input('tenant_code') ?? ''));

        // Hỗ trợ đăng nhập chéo giữa @podscare.vn và @fixo.com.vn trong quá trình chuyển đổi
        $alternateEmail = null;
        if (str_contains($loginInput, '@podscare.vn')) {
            $alternateEmail = str_replace('@podscare.vn', '@fixo.com.vn', $loginInput);
        } elseif (str_contains($loginInput, '@fixo.com.vn')) {
            $alternateEmail = str_replace('@fixo.com.vn', '@podscare.vn', $loginInput);
        }

        $password = $request->input('password');

        // 1. Kiểm tra tài khoản Super Admin (nền tảng)
        // Super admin xác định qua role='super_admin' trong cơ sở dữ liệu khi store_code rỗng hoặc fixo-platform
        $isSuperAdminCandidate = empty($storeCode) || $storeCode === 'fixo-platform';

        if ($isSuperAdminCandidate) {
            $superAdmin = User::withoutGlobalScope(TenantScope::class)
                ->where('role', 'super_admin')
                ->where(function ($q) use ($loginInput, $alternateEmail) {
                    $q->where('email', $loginInput)
                        ->when($alternateEmail, fn ($sq) => $sq->orWhere('email', $alternateEmail))
                        ->orWhere('phone', $loginInput);
                })
                ->first();

            if ($superAdmin) {
                if (! Hash::check($password, $superAdmin->password)) {
                    return $this->failure('Email hoặc mật khẩu không chính xác.', 401);
                }

                if (! $superAdmin->is_active) {
                    return $this->failure('Tài khoản đã bị tạm khóa.', 403);
                }

                $token = $superAdmin->createToken('platform_token', ['platform:super_admin'])->plainTextToken;

                app(AuditLogService::class)->log(
                    null,
                    $superAdmin,
                    'user_login',
                    $superAdmin,
                    "Đăng nhập hệ thống thành công ({$superAdmin->email})",
                    [
                        'role'       => $superAdmin->role,
                        'branch_id'  => null,
                        'store_code' => null,
                    ]
                );

                return $this->success([
                    'token'      => $token,
                    'token_type' => 'Bearer',
                    'user'       => [
                        'id'         => $superAdmin->id,
                        'name'       => $superAdmin->name,
                        'email'      => $superAdmin->email,
                        'phone'      => $superAdmin->phone,
                        'role'       => $superAdmin->role,
                        'tenant_id'  => null,
                        'tenant'     => null,
                        'avatar_url' => $superAdmin->avatar_url,
                        'branch_id'  => null,
                        'branch'     => null,
                    ],
                ], 'Đăng nhập thành công.');
            }
        }

        // 2. Xác định mã gian hàng (mặc định fixo-master nếu không truyền)
        $effectiveStoreCode = ! empty($storeCode) ? $storeCode : 'fixo-master';
        $tenant = Tenant::where('code', $effectiveStoreCode)->first();

        // Nếu store_code được chỉ định rõ ràng mà không tìm thấy
        if (! $tenant && ! empty($storeCode) && $storeCode !== 'fixo-master') {
            return $this->failure('Gian hàng không tồn tại.', 404);
        }

        // 3. Tìm user thuộc tenant
        $userQuery = User::withoutGlobalScope(TenantScope::class)->with(['tenant', 'branch']);
        if ($tenant) {
            $userQuery->where(function ($q) use ($tenant, $storeCode) {
                $q->where('tenant_id', $tenant->id);
                // Nếu không truyền store_code (fallback fixo-master), cho phép tìm user có tenant_id null để tương thích ngược
                if (empty($storeCode)) {
                    $q->orWhereNull('tenant_id');
                }
            });
        }

        $user = $userQuery->where(function ($q) use ($loginInput, $alternateEmail) {
            $q->where('email', $loginInput)
                ->when($alternateEmail, fn ($sq) => $sq->orWhere('email', $alternateEmail))
                ->orWhere('phone', $loginInput);
        })->first();

        // Hỗ trợ tự động nhận diện gian hàng của khách nếu khách quên đổi store_code khỏi mặc định 'fixo-master'
        if (! $user && (empty($storeCode) || $storeCode === 'fixo-master')) {
            $fallbackUser = User::withoutGlobalScope(TenantScope::class)
                ->with(['tenant', 'branch'])
                ->whereNotNull('tenant_id')
                ->where(function ($q) use ($loginInput, $alternateEmail) {
                    $q->where('email', $loginInput)
                        ->when($alternateEmail, fn ($sq) => $sq->orWhere('email', $alternateEmail))
                        ->orWhere('phone', $loginInput);
                })
                ->orderByDesc('id')
                ->first();

            if ($fallbackUser && $fallbackUser->tenant) {
                $user = $fallbackUser;
                $tenant = $fallbackUser->tenant;
            }
        }

        if (! $tenant && $user && $user->tenant) {
            $tenant = $user->tenant;
        }

        // Kiểm tra trạng thái bị khóa hoặc hết hạn của tenant
        if ($tenant) {
            if ($tenant->status === 'suspended') {
                return $this->failure('Gian hàng đã bị tạm khóa. Vui lòng liên hệ hỗ trợ.', 403);
            }
            if ($tenant->expires_at && $tenant->expires_at->isPast()) {
                return response()->json([
                    'success'    => false,
                    'message'    => 'Gói dịch vụ của gian hàng đã hết hạn. Vui lòng gia hạn gói dịch vụ.',
                    'error'      => 'SUBSCRIPTION_EXPIRED',
                    'error_code' => 'SUBSCRIPTION_EXPIRED',
                    'redirect'   => '/subscription',
                ], 403);
            }
        }

        if (! $user || ! Hash::check($password, $user->password)) {
            return $this->failure('Email hoặc mật khẩu không chính xác.', 401);
        }

        // Tự động phê duyệt nếu tenant đang ở trạng thái pending (sau khi xác thực đúng mật khẩu)
        if ($tenant && $tenant->status === 'pending') {
            $expiresAt = $tenant->expires_at ?? now()->addYear();
            $tenant->update([
                'status'        => 'active',
                'trial_ends_at' => $tenant->trial_ends_at ?? $expiresAt,
                'expires_at'    => $expiresAt,
            ]);

            User::withoutGlobalScope(TenantScope::class)
                ->where('tenant_id', $tenant->id)
                ->where('role', 'admin')
                ->update(['is_active' => true]);

            if ((int) $user->tenant_id === (int) $tenant->id) {
                if ($user->role === 'admin') {
                    $user->is_active = true;
                }
                $user->setRelation('tenant', $tenant);
            }
        }

        if (! $user->is_active) {
            return $this->failure('Tài khoản đã bị tạm khóa.', 403);
        }

        // Đảm bảo gian hàng mới đăng ký luôn có ít nhất 1 chi nhánh hoạt động để sử dụng app ngay
        $resolvedTenant = $tenant ?? $user->tenant;
        if ($resolvedTenant && empty($user->branch_id)) {
            $defaultBranch = Branch::withoutGlobalScope(TenantScope::class)
                ->where('tenant_id', $resolvedTenant->id)
                ->first();

            if (! $defaultBranch) {
                $baseBranchCode = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', substr($resolvedTenant->code, 0, 10))) ?: 'CN';
                $branchCode = $baseBranchCode . '-CN1';
                while (Branch::withoutGlobalScope(TenantScope::class)->where('code', $branchCode)->exists()) {
                    $branchCode = $baseBranchCode . '-' . strtoupper(substr(uniqid(), -4));
                }

                $defaultBranch = Branch::withoutGlobalScope(TenantScope::class)->create([
                    'tenant_id' => $resolvedTenant->id,
                    'code'      => $branchCode,
                    'name'      => $resolvedTenant->name . ' - Chi nhánh chính',
                    'address'   => 'Trụ sở chính',
                    'phone'     => $resolvedTenant->phone ?? $user->phone ?? '',
                    'is_active' => true,
                ]);
            }

            $user->forceFill(['branch_id' => $defaultBranch->id])->save();
            $user->setRelation('branch', $defaultBranch);
        }

        $tokenContext = $resolvedTenant ? "tenant:{$resolvedTenant->id}" : 'tenant:default';
        $token = $user->createToken('auth_token', [$tokenContext])->plainTextToken;

        app(AuditLogService::class)->log(
            $user->tenant_id ?? $resolvedTenant?->id,
            $user,
            'user_login',
            $user,
            "Đăng nhập hệ thống thành công ({$user->email})",
            [
                'role'       => $user->role,
                'branch_id'  => $user->branch_id,
                'store_code' => $resolvedTenant?->code,
            ]
        );

        $tenantData = null;
        if ($resolvedTenant) {
            $daysRemaining = $resolvedTenant->expires_at ? max(0, (int) now()->diffInDays($resolvedTenant->expires_at, false)) : null;
            $tenantData = [
                'id'                  => $resolvedTenant->id,
                'code'                => $resolvedTenant->code,
                'name'                => $resolvedTenant->name,
                'status'              => $resolvedTenant->status,
                'plan'                => $resolvedTenant->plan,
                'expires_at'          => $resolvedTenant->expires_at?->toISOString(),
                'trial_ends_at'       => $resolvedTenant->trial_ends_at?->toISOString(),
                'days_remaining'      => $daysRemaining,
                'settings'            => $resolvedTenant->settings ?? null,
                'logo_url'            => $resolvedTenant->logo_url,
                'hotline'             => $resolvedTenant->hotline,
                'receipt_footer_note' => $resolvedTenant->receipt_footer_note,
            ];
        }

        return $this->success([
            'token'      => $token,
            'token_type' => 'Bearer',
            'user'       => [
                'id'         => $user->id,
                'name'       => $user->name,
                'email'      => $user->email,
                'phone'      => $user->phone,
                'role'       => $user->role,
                'is_active'  => (bool) $user->is_active,
                'tenant_id'  => $user->tenant_id ?? $resolvedTenant?->id,
                'tenant'     => $tenantData,
                'avatar_url' => $user->avatar_url,
                'branch_id'  => $user->branch_id,
                'branch'     => $user->branch?->only(['id', 'code', 'name']),
            ],
        ], 'Đăng nhập thành công.');
    }

    /**
     * Đăng xuất & thu hồi token hiện tại.
     */
    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user) {
            app(AuditLogService::class)->log(
                $user->tenant_id,
                $user,
                'user_logout',
                $user,
                "Đăng xuất khỏi hệ thống ({$user->email})",
                [
                    'role'      => $user->role,
                    'branch_id' => $user->branch_id,
                ]
            );
            $user->currentAccessToken()?->delete();
        }

        return $this->success(null, 'Đăng xuất thành công.');
    }

    /**
     * Lấy thông tin user hiện tại.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load(['branch', 'tenant']);

        $resolvedTenant = $user->tenant;
        if (! $resolvedTenant && $user->role !== 'super_admin') {
            $resolvedTenant = Tenant::where('code', 'fixo-master')->first() ?? Tenant::first();
        }
        $tenantData = null;
        if ($resolvedTenant) {
            $daysRemaining = $resolvedTenant->expires_at ? max(0, (int) now()->diffInDays($resolvedTenant->expires_at, false)) : null;
            $tenantData = [
                'id'                  => $resolvedTenant->id,
                'code'                => $resolvedTenant->code,
                'name'                => $resolvedTenant->name,
                'status'              => $resolvedTenant->status,
                'plan'                => $resolvedTenant->plan,
                'expires_at'          => $resolvedTenant->expires_at?->toISOString(),
                'trial_ends_at'       => $resolvedTenant->trial_ends_at?->toISOString(),
                'days_remaining'      => $daysRemaining,
                'settings'            => $resolvedTenant->settings ?? null,
                'logo_url'            => $resolvedTenant->logo_url,
                'hotline'             => $resolvedTenant->hotline,
                'receipt_footer_note' => $resolvedTenant->receipt_footer_note,
            ];
        }

        $userData = [
            'id'         => $user->id,
            'name'       => $user->name,
            'email'      => $user->email,
            'phone'      => $user->phone,
            'role'       => $user->role,
            'is_active'  => (bool) $user->is_active,
            'tenant_id'  => $user->tenant_id ?? $resolvedTenant?->id,
            'tenant'     => $tenantData,
            'avatar_url' => $user->avatar_url,
            'branch_id'  => $user->branch_id,
            'branch'     => $user->branch?->only(['id', 'code', 'name']),
        ];

        return $this->success($userData, 'Lấy thông tin người dùng thành công.');
    }
}
