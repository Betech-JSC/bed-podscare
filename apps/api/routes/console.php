<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Dọn dẹp Personal Access Tokens hết hạn hàng ngày
Schedule::command('sanctum:prune-expired --hours=24')->daily();

// Dọn dẹp các failed queue jobs cũ quá 48 giờ
Schedule::command('queue:prune-failed --hours=48')->daily();
