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
     * Apply the scope to a given Eloquent query builder.
     */
    public function apply(Builder $builder, Model $model): void
    {
        $user = Auth::user() ?? (app()->bound('request') ? request()?->user() : null);

        if (! $user) {
            return;
        }

        // Super Admin có tenant_id = null hoặc role = super_admin, tự động bypass
        if ($user->role === 'super_admin') {
            return;
        }

        // Nếu người dùng hiện tại có tenant_id, áp dụng cách ly dòng theo tenant_id
        if (! empty($user->tenant_id)) {
            $masterTenantId = Tenant::where('code', 'fixo-master')->value('id');

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
