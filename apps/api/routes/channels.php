<?php

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
    return $user->role === 'admin' || (int) $user->branch_id === (int) $branchId;
});

Broadcast::channel('branch.{branchId}.{role}', function (User $user, $branchId, $role) {
    return $user->role === 'admin' || ((int) $user->branch_id === (int) $branchId && $user->role === $role);
});

Broadcast::channel('role.{role}', function (User $user, $role) {
    return $user->role === 'admin' || $user->role === $role;
});

Broadcast::channel('orders.all', function (User $user) {
    return in_array($user->role, ['admin', 'technician', 'cskh', 'qc', 'inventory']);
});
