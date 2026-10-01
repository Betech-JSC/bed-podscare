<?php

namespace App\Models\Traits;

use App\Models\Branch;
use App\Models\Scopes\TenantScope;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

trait BelongsToTenant
{
    /**
     * Boot the trait to attach TenantScope and auto-assign tenant_id on create.
     */
    public static function bootBelongsToTenant(): void
    {
        static::addGlobalScope(new TenantScope());

        static::creating(function ($model) {
            if (empty($model->tenant_id)) {
                $user = Auth::user() ?? (app()->bound('request') ? request()?->user() : null);
                if ($user && ! empty($user->tenant_id)) {
                    $model->tenant_id = $user->tenant_id;
                } elseif (! empty($model->branch_id)) {
                    $branch = Branch::withoutGlobalScope(TenantScope::class)->find($model->branch_id);
                    if ($branch && ! empty($branch->tenant_id)) {
                        $model->tenant_id = $branch->tenant_id;
                    }
                } elseif (! empty($model->created_by_user_id)) {
                    $creator = User::withoutGlobalScope(TenantScope::class)->find($model->created_by_user_id);
                    if ($creator && ! empty($creator->tenant_id)) {
                        $model->tenant_id = $creator->tenant_id;
                    }
                }

                if (empty($model->tenant_id)) {
                    $masterTenantId = Tenant::where('code', 'fixo-master')->value('id');
                    if ($masterTenantId) {
                        $model->tenant_id = $masterTenantId;
                    }
                }
            }
        });
    }

    /**
     * Quan hệ Model thuộc về một Tenant.
     */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }
}
