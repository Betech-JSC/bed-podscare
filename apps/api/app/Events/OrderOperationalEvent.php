<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class OrderOperationalEvent implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public string|int $id;
    public string|int $orderId;
    public string $orderCode;
    public string $title;
    public string $message;
    public string $severity;
    public string $timestamp;
    public string $actionUrl;
    public ?int $branchId;
    public ?string $targetRole;
    public ?int $userId;
    public string $type;
    public ?string $eventName;

    /**
     * Khởi tạo Event vận hành đơn hàng thời gian thực.
     *
     * @param string|int $id Mã định danh thông báo / event
     * @param string|int $orderId ID đơn sửa chữa
     * @param string $orderCode Mã đơn sửa chữa (ví dụ: PC26-00981)
     * @param string $title Tiêu đề thông báo
     * @param string $message Nội dung chi tiết
     * @param string $severity Mức độ ưu tiên ('info', 'warning', 'danger', 'success')
     * @param string|null $timestamp Thời gian ISO8601 (mặc định now())
     * @param string|null $actionUrl Đường dẫn điều hướng (mặc định "/repairs?id={orderId}")
     * @param int|null $branchId Chi nhánh đích
     * @param string|null $targetRole Vai trò đích ('cskh', 'technician', 'qc', 'admin')
     * @param int|null $userId User ID đích (nếu chỉ định đích danh)
     * @param string $type Loại sự kiện ('order_status', 'sla_warning', 'qc_action', 'quote_action')
     * @param string|null $eventName Tên sự kiện broadcast (mặc định 'order.operational')
     */
    public function __construct(
        string|int $id,
        string|int $orderId,
        string $orderCode,
        string $title,
        string $message,
        string $severity = 'info',
        ?string $timestamp = null,
        ?string $actionUrl = null,
        ?int $branchId = null,
        ?string $targetRole = null,
        ?int $userId = null,
        string $type = 'order_status',
        ?string $eventName = null
    ) {
        $this->id = $id;
        $this->orderId = $orderId;
        $this->orderCode = $orderCode;
        $this->title = $title;
        $this->message = $message;
        $this->severity = in_array($severity, ['info', 'warning', 'danger', 'success'], true) ? $severity : 'info';
        $this->timestamp = $timestamp ?? now()->toIso8601String();
        $this->actionUrl = $actionUrl ?? "/repairs?id={$this->orderId}";
        $this->branchId = $branchId;
        $this->targetRole = $targetRole;
        $this->userId = $userId;
        $this->type = $type;
        $this->eventName = $eventName ?? 'order.operational';
    }

    /**
     * Xác định các channel phát sóng theo chi nhánh / vai trò / người dùng.
     *
     * @return array<int, \Illuminate\Broadcasting\Channel>
     */
    public function broadcastOn(): array
    {
        $channels = [];

        // Broadcast tới kênh chi nhánh nếu có branch_id
        if ($this->branchId !== null) {
            $channels[] = new PrivateChannel("branch.{$this->branchId}.orders");

            if ($this->targetRole !== null) {
                $channels[] = new PrivateChannel("branch.{$this->branchId}.{$this->targetRole}");
            }
        }

        // Broadcast tới kênh vai trò cụ thể
        if ($this->targetRole !== null) {
            $channels[] = new PrivateChannel("role.{$this->targetRole}");
        }

        // Broadcast tới đích danh user nếu có
        if ($this->userId !== null) {
            $channels[] = new PrivateChannel("user.{$this->userId}");
        }

        // Nếu không có bộ lọc cụ thể nào, phát vào kênh chung toàn hệ thống
        if (empty($channels)) {
            $channels[] = new PrivateChannel('orders.all');
        }

        return $channels;
    }

    /**
     * Tên sự kiện broadcast phía client.
     */
    public function broadcastAs(): string
    {
        return $this->eventName;
    }

    /**
     * Payload chuẩn hóa phát qua Socket.
     *
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'id' => (string) $this->id,
            'orderId' => (string) $this->orderId,
            'orderCode' => $this->orderCode,
            'title' => $this->title,
            'message' => $this->message,
            'severity' => $this->severity,
            'timestamp' => $this->timestamp,
            'actionUrl' => $this->actionUrl,
            'type' => $this->type,
        ];
    }
}
