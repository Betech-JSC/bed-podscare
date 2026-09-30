<?php

use App\Http\Controllers\Api\SePayWebhookController;
use App\Http\Controllers\SePayPaymentController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| SePay Routes Configuration
|--------------------------------------------------------------------------
|
| 1. Route Webhook: Đặt trong routes/api.php để tự động miễn trừ kiểm tra CSRF.
| 2. Route Client/Checkout: Có thể đặt trong routes/api.php hoặc routes/web.php
|
*/

// =========================================================================
// 1. WEBHOOK ENDPOINT (Dành cho SePay Gateway gửi biến động số dư)
// =========================================================================
Route::post('/sepay/webhook', [SePayWebhookController::class, 'handle'])
    ->name('api.sepay.webhook');

// =========================================================================
// 2. CLIENT / FRONTEND PAYMENT ENDPOINTS
// =========================================================================
Route::prefix('payment/sepay')->group(function () {
    // Tạo phiên thanh toán & lấy ảnh VietQR động
    Route::post('/create', [SePayPaymentController::class, 'createPayment'])
        ->name('payment.sepay.create');

    // Polling kiểm tra trạng thái thanh toán theo reference_code (Realtime check)
    Route::get('/check/{referenceCode}', [SePayPaymentController::class, 'checkStatus'])
        ->name('payment.sepay.check');

    // Hủy phiên thanh toán
    Route::post('/cancel/{referenceCode}', [SePayPaymentController::class, 'cancelPayment'])
        ->name('payment.sepay.cancel');

    // [DEV ONLY] Giả lập thanh toán thành công trong môi trường local
    if (app()->environment('local')) {
        Route::post('/simulate/{referenceCode}', [SePayPaymentController::class, 'simulatePayment'])
            ->name('payment.sepay.simulate');
    }
});
