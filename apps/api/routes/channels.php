<?php

use App\Models\Branch;
use App\Models\Scopes\TenantScope;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Broadcast Channels
|--------------------------------------------------------------------------
|
| Here you may register all of the event broadcasting channels that your
| application supports. The given channel authorization callbacks are
| used to check if an authenticated user can listen to the channel.
|
*/

Broadcast::channel('user.{id}', function (User $user, $id) {
    return (int) $user->id === (int) $id;
});

Broadcast::channel('branch.{branchId}.orders', function (User $user, $branchId) {
    if ($user->role === 'super_admin') {
        return true;
    }

    $existsInTenant = Branch::whereKey((int) $branchId)
        ->when(! empty($user->tenant_id), function ($query) use ($user) {
            $masterTenantId = TenantScope::resolveMasterTenantId();
            $isMaster = $masterTenantId && (int) $user->tenant_id === (int) $masterTenantId;
            $query->where(function ($tq) use ($user, $isMaster) {
                $tq->where('branches.tenant_id', $user->tenant_id);
                if ($isMaster) {
                    $tq->orWhereNull('branches.tenant_id');
                }
            });
        })
        ->exists();

    if ($user->role === 'admin') {
        return $existsInTenant;
    }

    return $existsInTenant && (int) $user->branch_id === (int) $branchId;
});

Broadcast::channel('branch.{branchId}.{role}', function (User $user, $branchId, $role) {
    if ($user->role === 'super_admin') {
        return true;
    }

    $existsInTenant = Branch::whereKey((int) $branchId)
        ->when(! empty($user->tenant_id), function ($query) use ($user) {
            $masterTenantId = TenantScope::resolveMasterTenantId();
            $isMaster = $masterTenantId && (int) $user->tenant_id === (int) $masterTenantId;
            $query->where(function ($tq) use ($user, $isMaster) {
                $tq->where('branches.tenant_id', $user->tenant_id);
                if ($isMaster) {
                    $tq->orWhereNull('branches.tenant_id');
                }
            });
        })
        ->exists();

    if ($user->role === 'admin') {
        return $existsInTenant;
    }

    return $existsInTenant && (int) $user->branch_id === (int) $branchId && $user->role === $role;
});

Broadcast::channel('role.{role}', function (User $user, $role) {
    return in_array($user->role, ['admin', 'super_admin'], true) || $user->role === $role;
});

Broadcast::channel('orders.all', function (User $user) {
    return in_array($user->role, ['super_admin', 'admin', 'technician', 'cskh', 'qc', 'inventory'], true);
});
