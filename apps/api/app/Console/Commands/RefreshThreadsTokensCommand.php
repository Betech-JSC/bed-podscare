<?php

namespace App\Console\Commands;

use App\Services\Threads\ThreadsOAuthService;
use Illuminate\Console\Command;

class RefreshThreadsTokensCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'threads:refresh-tokens
                            {--days= : Ngưỡng số ngày còn lại trước khi hết hạn (mặc định từ config threads.token_refresh_threshold_days = 14)}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Tự động gia hạn Long-Lived Access Token (60 ngày) cho các tài khoản Threads còn hạn dưới 14 ngày';

    /**
     * Execute the console command.
     */
    public function handle(ThreadsOAuthService $oauthService): int
    {
        $daysOption = $this->option('days');
        $thresholdDays = $daysOption !== null && $daysOption !== ''
            ? (int) $daysOption
            : (int) config('threads.token_refresh_threshold_days', 14);

        $summary = $oauthService->refreshExpiringTokens($thresholdDays);

        $this->info(sprintf(
            'Đã kiểm tra %d tài khoản Threads (ngưỡng <= %d ngày): Gia hạn thành công %d, Lỗi cần re-auth %d.',
            $summary['checked'],
            $thresholdDays,
            $summary['refreshed'],
            $summary['failed']
        ));

        foreach ($summary['details'] as $detail) {
            $label = $detail['username'] ? "@{$detail['username']}" : "Account #{$detail['account_id']}";
            if ($detail['success']) {
                $this->line("  [OK] {$label}: {$detail['message']}");
            } else {
                $this->warn("  [NEEDS_REAUTH] {$label}: {$detail['message']}");
            }
        }

        return self::SUCCESS;
    }
}
