<?php

use App\Models\Branch;
use App\Models\User;
use App\Services\NotificationIsolationService;
use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Broadcast Channels (3-Tier Multi-Tenant & Role Isolation)
|--------------------------------------------------------------------------
|
| Phân quyền đăng ký lắng nghe kênh WebSocket thời gian thực (private-*):
| - Tầng 1 (super_admin): Chỉ được phép đăng ký 'platform.super_admin' và
|   'user.{id}' của chính mình. Bị chặn 403 trên mọi kênh 'tenant.{tenantId}.*'.
| - Tầng 2 (admin của Gian hàng): Chỉ được phép đăng ký 'tenant.{tenantId}.*'
|   khi user.tenant_id === tenantId và (với kênh chi nhánh) branch thuộc đúng tenantId.
| - Tầng 3 (nhân sự chi nhánh cskh, technician/tech, qc...): Khóa cứng đồng thời
|   tenant_id, branch_id thuộc đúng tenantId và vai trò chuẩn hóa (normalizeRole).
| - Xóa bỏ hoàn toàn các kênh toàn cục cũ không có tenantId (orders.all, branch.*, role.*).
|
*/

$isPositiveInt = static function (mixed $value): bool {
    if (is_int($value)) {
        return $value > 0;
    }

    if (is_string($value) && ctype_digit($value)) {
        return (int) $value > 0;
    }

    return false;
};

$normalizeRole = static function (?string $role): ?string {
    return app(NotificationIsolationService::class)->normalizeRole($role);
};

$branchBelongsToTenant = static function (int $branchId, int $tenantId): bool {
    return Branch::withoutGlobalScopes()
        ->whereKey($branchId)
        ->where('tenant_id', $tenantId)
        ->exists();
};

// 1. Kênh Quản trị Nền tảng FIXO (chỉ dành cho super_admin)
Broadcast::channel('platform.super_admin', function (User $user) use ($normalizeRole): bool {
    return $normalizeRole($user->role) === 'super_admin';
});

// 2. Kênh đích danh cá nhân từng tài khoản
Broadcast::channel('user.{id}', function (User $user, $id) use ($isPositiveInt): bool {
    return $isPositiveInt($id) && (int) $user->id === (int) $id;
});

Broadcast::channel('App.Models.User.{id}', function (User $user, $id) use ($isPositiveInt): bool {
    return $isPositiveInt($id) && (int) $user->id === (int) $id;
});

// 3. Kênh tổng hợp đơn hàng toàn Gian hàng (chỉ dành riêng cho Chủ tiệm role = 'admin' của đúng tenantId)
Broadcast::channel('tenant.{tenantId}.orders', function (User $user, $tenantId) use ($isPositiveInt, $normalizeRole): bool {
    if (! $isPositiveInt($tenantId)) {
        return false;
    }

    $userRole = $normalizeRole($user->role);
    if ($userRole === 'super_admin' || $userRole !== 'admin' || empty($user->tenant_id)) {
        return false;
    }

    return (int) $user->tenant_id === (int) $tenantId;
});

// 4. Kênh vai trò cấp Gian hàng (ví dụ: tenant.{tenantId}.role.admin)
Broadcast::channel('tenant.{tenantId}.role.{role}', function (User $user, $tenantId, $role) use ($isPositiveInt, $normalizeRole): bool {
    if (! $isPositiveInt($tenantId) || ! is_string($role)) {
        return false;
    }

    $channelRole = $normalizeRole($role);
    if ($channelRole === null || $channelRole === 'super_admin') {
        return false;
    }

    $userRole = $normalizeRole($user->role);
    if ($userRole === 'super_admin' || empty($user->tenant_id) || (int) $user->tenant_id !== (int) $tenantId) {
        return false;
    }

    return $userRole === 'admin' || $userRole === $channelRole;
});

// 5. Kênh đơn hàng chung theo Chi nhánh thuộc Gian hàng (PHẢI khai báo trước tenant.{tenantId}.branch.{branchId}.{role})
Broadcast::channel('tenant.{tenantId}.branch.{branchId}.orders', function (User $user, $tenantId, $branchId) use ($isPositiveInt, $normalizeRole, $branchBelongsToTenant): bool {
    if (! $isPositiveInt($tenantId) || ! $isPositiveInt($branchId)) {
        return false;
    }

    $userRole = $normalizeRole($user->role);
    if ($userRole === 'super_admin' || empty($user->tenant_id) || (int) $user->tenant_id !== (int) $tenantId) {
        return false;
    }

    if (! $branchBelongsToTenant((int) $branchId, (int) $tenantId)) {
        return false;
    }

    if ($userRole === 'admin') {
        return true;
    }

    return ! empty($user->branch_id) && (int) $user->branch_id === (int) $branchId;
});

// 6. Kênh chuyên biệt theo Chi nhánh & Vai trò thuộc Gian hàng (cô lập sự kiện báo giá 'cskh' khỏi 'technician')
Broadcast::channel('tenant.{tenantId}.branch.{branchId}.{role}', function (User $user, $tenantId, $branchId, $role) use ($isPositiveInt, $normalizeRole, $branchBelongsToTenant): bool {
    if (! $isPositiveInt($tenantId) || ! $isPositiveInt($branchId) || ! is_string($role)) {
        return false;
    }

    $channelRole = $normalizeRole($role);
    if ($channelRole === null || $channelRole === 'super_admin' || $channelRole === 'orders') {
        return false;
    }

    $userRole = $normalizeRole($user->role);
    if ($userRole === 'super_admin' || empty($user->tenant_id) || (int) $user->tenant_id !== (int) $tenantId) {
        return false;
    }

    if (! $branchBelongsToTenant((int) $branchId, (int) $tenantId)) {
        return false;
    }

    if ($userRole === 'admin') {
        return true;
    }

    return ! empty($user->branch_id)
        && (int) $user->branch_id === (int) $branchId
        && $userRole === $channelRole;
});
