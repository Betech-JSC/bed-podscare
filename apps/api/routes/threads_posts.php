<?php

use App\Http\Controllers\Api\V1\Threads\ThreadsDashboardController;
use App\Http\Controllers\Api\V1\Threads\ThreadsImportController;
use App\Http\Controllers\Api\V1\Threads\ThreadsPostController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Threads Auto-Publishing System — Posts, CSV Bulk Import & Dashboard Routes (Track 3)
|--------------------------------------------------------------------------
*/

Route::prefix('v1/threads')->group(function () {
    // 1. Dashboard KPI & Nhật ký xuất bản (Publish Logs)
    Route::get('/dashboard', [ThreadsDashboardController::class, 'index'])
        ->name('api.v1.threads.dashboard');
    Route::get('/dashboard-stats', [ThreadsDashboardController::class, 'index'])
        ->name('api.v1.threads.dashboard_stats');
    Route::get('/stats', [ThreadsDashboardController::class, 'index'])
        ->name('api.v1.threads.stats');
    Route::get('/logs', [ThreadsDashboardController::class, 'logs'])
        ->name('api.v1.threads.logs.index');
    Route::get('/publish-logs', [ThreadsDashboardController::class, 'logs'])
        ->name('api.v1.threads.publish_logs.index');

    // 2. Nhập hàng loạt CSV (100+ bài) kèm Random Jitter & tải CSV mẫu
    Route::post('/posts/import-csv', [ThreadsImportController::class, 'importCsv'])
        ->name('api.v1.threads.posts.import_csv');
    Route::post('/import-csv', [ThreadsImportController::class, 'importCsv'])
        ->name('api.v1.threads.import_csv');
    Route::get('/posts/sample-csv', [ThreadsImportController::class, 'sampleCsv'])
        ->name('api.v1.threads.posts.sample_csv');
    Route::get('/sample-csv', [ThreadsImportController::class, 'sampleCsv'])
        ->name('api.v1.threads.sample_csv');

    // 3. Quản lý bài đăng đơn lẻ & chuỗi bài nối tiếp (Flexible Multi-post Thread)
    Route::get('/posts', [ThreadsPostController::class, 'index'])
        ->name('api.v1.threads.posts.index');
    Route::post('/posts', [ThreadsPostController::class, 'store'])
        ->name('api.v1.threads.posts.store');
    Route::get('/posts/{id}', [ThreadsPostController::class, 'show'])
        ->whereNumber('id')
        ->name('api.v1.threads.posts.show');
    Route::match(['put', 'patch'], '/posts/{id}', [ThreadsPostController::class, 'update'])
        ->whereNumber('id')
        ->name('api.v1.threads.posts.update');
    Route::delete('/posts/{id}', [ThreadsPostController::class, 'destroy'])
        ->whereNumber('id')
        ->name('api.v1.threads.posts.destroy');

    // 4. Các thao tác điều phối trạng thái bài đăng (Approve, Publish Now, Retry)
    Route::post('/posts/{id}/approve', [ThreadsPostController::class, 'approve'])
        ->whereNumber('id')
        ->name('api.v1.threads.posts.approve');
    Route::post('/posts/{id}/publish-now', [ThreadsPostController::class, 'publishNow'])
        ->whereNumber('id')
        ->name('api.v1.threads.posts.publish_now');
    Route::post('/posts/{id}/retry', [ThreadsPostController::class, 'retry'])
        ->whereNumber('id')
        ->name('api.v1.threads.posts.retry');
});
