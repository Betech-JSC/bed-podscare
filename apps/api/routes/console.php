<?php

use App\Services\TelegramNotificationService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('telegram:listen {--once : Chỉ chạy 1 lượt đồng bộ rồi thoát}', function () {
    DB::connection()->getPdo();
    $this->info('Đang lắng nghe tin nhắn Telegram thời gian thực (Polling 2s)...');
    $service = app(TelegramNotificationService::class);

    do {
        $synced = $service->syncUpdates();
        if ($synced > 0) {
            $this->line('[' . now()->format('H:i:s') . "] Đã xử lý {$synced} tin nhắn Telegram.");
        }

        if ($this->option('once')) {
            break;
        }

        sleep(2);
    } while (true);
})->purpose('Lắng nghe và phản hồi tin nhắn Telegram AI thời gian thực trên Localhost');

// Dọn dẹp Personal Access Tokens hết hạn hàng ngày
Schedule::command('sanctum:prune-expired --hours=24')->daily();

// Dọn dẹp các failed queue jobs cũ quá 48 giờ
Schedule::command('queue:prune-failed --hours=48')->daily();

