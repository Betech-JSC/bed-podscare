<?php

namespace App\Jobs;

use App\Models\RepairOrder;
use App\Services\TelegramNotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendTelegramNewOrderNotificationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $orderId;

    /**
     * Create a new job instance.
     */
    public function __construct(int|RepairOrder $order)
    {
        $this->orderId = $order instanceof RepairOrder ? (int) $order->id : (int) $order;
        $this->afterCommit();
    }

    /**
     * Execute the job.
     */
    public function handle(TelegramNotificationService $telegramService): void
    {
        $order = RepairOrder::withoutGlobalScopes()
            ->with(['customer', 'deviceModel', 'branch', 'createdByUser'])
            ->find($this->orderId);

        if (! $order) {
            return;
        }

        $telegramService->notifyNewOrder($order);
    }
}
