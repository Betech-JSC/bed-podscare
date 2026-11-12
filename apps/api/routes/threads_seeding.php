<?php

use App\Http\Controllers\Api\V1\ThreadsSeedingController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Threads Traffic Discovery & Multi-Account Seeding Engine Routes
|--------------------------------------------------------------------------
*/

Route::prefix('v1/threads/seeding')
    ->middleware(['auth:sanctum', 'role:admin,super_admin'])
    ->name('api.v1.threads.seeding.')
    ->group(function () {
        // 1. Khám phá 10 bài viết hot theo từ khóa & tính Velocity Score
        Route::post('/discover', [ThreadsSeedingController::class, 'discover'])
            ->name('discover');

        // 2. Bóc tách danh sách link bài viết Threads dán trực tiếp
        Route::post('/parse-urls', [ThreadsSeedingController::class, 'parseUrls'])
            ->name('parse_urls');

        // 3. Kích hoạt điều phối Seeding từ Discovery
        Route::post('/dispatch-discovery', [ThreadsSeedingController::class, 'dispatchDiscovery'])
            ->name('dispatch_discovery');

        // 4. Kích hoạt điều phối Seeding theo URLs chỉ định
        Route::post('/dispatch-direct', [ThreadsSeedingController::class, 'dispatchDirect'])
            ->name('dispatch_direct');

        // 5. Danh sách & chi tiết các chiến dịch Seeding
        Route::get('/campaigns', [ThreadsSeedingController::class, 'campaigns'])
            ->name('campaigns.index');
        Route::get('/campaigns/{id}', [ThreadsSeedingController::class, 'showCampaign'])
            ->whereNumber('id')
            ->name('campaigns.show');

        // 6. Danh sách & thử lại các jobs Seeding
        Route::get('/jobs', [ThreadsSeedingController::class, 'jobs'])
            ->name('jobs.index');
        Route::post('/jobs/{id}/retry', [ThreadsSeedingController::class, 'retryJob'])
            ->whereNumber('id')
            ->name('jobs.retry');
    });
