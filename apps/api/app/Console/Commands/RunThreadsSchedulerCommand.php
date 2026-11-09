<?php

namespace App\Console\Commands;

use App\Services\Threads\ThreadsPublisherService;
use Illuminate\Console\Command;

class RunThreadsSchedulerCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'threads:run-scheduler
                            {--limit=50 : Số lượng bài đăng tối đa xử lý trong một lượt chạy}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Quét và xuất bản tự động các bài đăng Threads đã đến giờ hẹn hoặc đến hạn retry';

    /**
     * Execute the console command.
     */
    public function handle(ThreadsPublisherService $publisherService): int
    {
        $limitOption = $this->option('limit');
        $limit = $limitOption !== null && is_numeric($limitOption)
            ? max(1, (int) $limitOption)
            : 50;

        $summary = $publisherService->runScheduler($limit);

        $this->info(sprintf(
            'Đã xử lý %d bài đăng Threads: Thành công %d, Hẹn retry %d, Hoãn quota/cap %d, Lỗi %d, Kích hoạt Auto-chain %d.',
            $summary['processed'],
            $summary['published'],
            $summary['retried'],
            $summary['deferred'],
            $summary['failed'],
            $summary['auto_chained']
        ));

        foreach ($summary['results'] as $item) {
            if ($item['success']) {
                $this->line("  [PUBLISHED] Post #{$item['post_id']} (Account #{$item['account_id']}) -> Media ID: {$item['threads_media_id']}");
            } else {
                $this->warn("  [" . strtoupper((string) $item['status']) . "] Post #{$item['post_id']} (Account #{$item['account_id']}): {$item['message']}");
            }
        }

        return self::SUCCESS;
    }
}
