<?php

use App\Http\Controllers\Api\V1\Threads\ThreadsAccountController;
use App\Http\Controllers\Api\V1\Threads\ThreadsOAuthCallbackController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Threads Auto-Publishing System — Account & OAuth 2.0 Routes (Track 1)
|--------------------------------------------------------------------------
*/

Route::prefix('v1/threads')->group(function () {
    // OAuth 2.0 Callback từ Meta Threads
    Route::match(['get', 'post'], '/oauth/callback', [ThreadsOAuthCallbackController::class, 'handle'])
        ->name('api.v1.threads.oauth.callback');

    // Quản lý danh sách 20 tài khoản Threads thuộc sở hữu công ty
    Route::get('/accounts', [ThreadsAccountController::class, 'index'])
        ->name('api.v1.threads.accounts.index');
    Route::post('/accounts', [ThreadsAccountController::class, 'store'])
        ->name('api.v1.threads.accounts.store');
    Route::get('/accounts/{id}', [ThreadsAccountController::class, 'show'])
        ->whereNumber('id')
        ->name('api.v1.threads.accounts.show');
    Route::match(['put', 'patch'], '/accounts/{id}', [ThreadsAccountController::class, 'update'])
        ->whereNumber('id')
        ->name('api.v1.threads.accounts.update');
    Route::delete('/accounts/{id}', [ThreadsAccountController::class, 'destroy'])
        ->whereNumber('id')
        ->name('api.v1.threads.accounts.destroy');

    // Tạm dừng / Kích hoạt tài khoản
    Route::post('/accounts/{id}/toggle-status', [ThreadsAccountController::class, 'toggleStatus'])
        ->whereNumber('id')
        ->name('api.v1.threads.accounts.toggle_status');

    // Sinh URL ủy quyền OAuth 2.0 kèm state chống CSRF
    Route::match(['get', 'post'], '/accounts/{id}/authorize-url', [ThreadsAccountController::class, 'authorizeUrl'])
        ->whereNumber('id')
        ->name('api.v1.threads.accounts.authorize_url');
    Route::match(['get', 'post'], '/accounts/{id}/oauth-url', [ThreadsAccountController::class, 'authorizeUrl'])
        ->whereNumber('id')
        ->name('api.v1.threads.accounts.oauth_url');

    // Chủ động làm mới Long-Lived Token ngay
    Route::post('/accounts/{id}/refresh-token', [ThreadsAccountController::class, 'refreshTokenNow'])
        ->whereNumber('id')
        ->name('api.v1.threads.accounts.refresh_token');
});
