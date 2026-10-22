<?php

namespace App\Models\Scopes;

use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;
use Illuminate\Support\Facades\Auth;

class TenantScope implements Scope
{
    /**
     * Bộ nhớ đệm tĩnh trong vòng đời request cho ID của gian hàng mặc định (fixo-master).
     */
    protected static ?int $cachedMasterTenantId = null;

    /**
     * Cờ chống đệ quy vô hạn khi Guard (Sanctum) đang truy vấn model User để xác thực Bearer Token.
     */
    protected static bool $isResolvingUser = false;

    /**
     * Phân giải và lưu đệm ID của gian hàng fixo-master để tránh truy vấn lặp N+1 trên mọi model.
     */
    public static function resolveMasterTenantId(): ?int
    {
        if (self::$cachedMasterTenantId !== null) {
            return self::$cachedMasterTenantId;
        }

        $id = Tenant::where('code', 'fixo-master')->value('id');
        if ($id !== null) {
            self::$cachedMasterTenantId = (int) $id;
        }

        return self::$cachedMasterTenantId;
    }

    /**
     * Xóa bộ nhớ đệm tĩnh của master tenant (phục vụ kiểm thử hoặc khi dữ liệu Tenant thay đổi).
     */
    public static function clearCache(): void
    {
        self::$cachedMasterTenantId = null;
        self::$isResolvingUser = false;
    }

    /**
     * Lấy thông tin người dùng đang đăng nhập một cách an toàn, chống đệ quy khi Guard đang nạp model User.
     */
    public static function resolveAuthenticatedUser(): ?\Illuminate\Contracts\Auth\Authenticatable
    {
        if (self::$isResolvingUser) {
            return null;
        }

        self::$isResolvingUser = true;
        try {
            return Auth::user() ?? (app()->bound('request') ? request()?->user() : null);
        } finally {
            self::$isResolvingUser = false;
        }
    }

    /**
     * Apply the scope to a given Eloquent query builder.
     */
    public function apply(Builder $builder, Model $model): void
    {
        if (self::$isResolvingUser) {
            return;
        }

        if ($model instanceof \App\Models\User && ! Auth::hasUser()) {
            return;
        }

        $user = self::resolveAuthenticatedUser();

        if (! $user) {
            return;
        }

        // Super Admin có tenant_id = null hoặc role = super_admin, tự động bypass
        if ($user->role === 'super_admin') {
            return;
        }

        // Nếu người dùng hiện tại có tenant_id, áp dụng cách ly dòng theo tenant_id
        if (! empty($user->tenant_id)) {
            $masterTenantId = self::resolveMasterTenantId();

            // Với master tenant (fixo-master), hỗ trợ backward compatibility cho dữ liệu legacy
            if ($masterTenantId && (int) $user->tenant_id === (int) $masterTenantId) {
                $builder->where(function ($query) use ($model, $user) {
                    $query->where($model->getTable() . '.tenant_id', $user->tenant_id)
                        ->orWhereNull($model->getTable() . '.tenant_id');
                });
            } else {
                $builder->where($model->getTable() . '.tenant_id', $user->tenant_id);
            }
        }
    }
}
