<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class OrderOperationalEvent implements ShouldBroadcastNow
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
    public ?int $tenantId;

    /**
     * Khởi tạo Event vận hành đơn hàng & nền tảng thời gian thực (Cô lập đa tầng theo Tenant & Vai trò).
     *
     * @param string|int $id Mã định danh thông báo / event
     * @param string|int $orderId ID đơn sửa chữa (hoặc 0 đối với sự kiện cấp Nền tảng / gói cước SaaS)
     * @param string $orderCode Mã đơn sửa chữa hoặc mã gian hàng
     * @param string $title Tiêu đề thông báo
     * @param string $message Nội dung chi tiết
     * @param string $severity Mức độ ưu tiên ('info', 'warning', 'danger', 'success')
     * @param string|null $timestamp Thời gian ISO8601 (mặc định now())
     * @param string|null $actionUrl Đường dẫn điều hướng
     * @param int|null $branchId Chi nhánh đích
     * @param string|null $targetRole Vai trò đích ('cskh', 'technician', 'qc', 'admin', 'super_admin')
     * @param int|null $userId User ID đích (nếu chỉ định đích danh)
     * @param string $type Loại sự kiện ('order_status', 'sla_warning', 'qc_action', 'quote_action', 'tenant_registered', ...)
     * @param string|null $eventName Tên sự kiện broadcast (mặc định 'order.operational')
     * @param int|null $tenantId ID gian hàng sở hữu (NULL đối với sự kiện cấp Nền tảng của super_admin)
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
        ?string $eventName = null,
        ?int $tenantId = null
    ) {
        $normalizedRole = self::normalizeRole($targetRole);

        $this->id = $id;
        $this->orderId = $orderId;
        $this->orderCode = $orderCode;
        $this->title = $title;
        $this->message = $message;
        $this->severity = in_array($severity, ['info', 'warning', 'danger', 'success'], true) ? $severity : 'info';
        $this->timestamp = $timestamp ?? now()->toIso8601String();
        $defaultActionUrl = $normalizedRole === 'super_admin'
            ? '/platform/stores'
            : "/repairs?id={$this->orderId}";
        $this->actionUrl = $actionUrl ?? $defaultActionUrl;
        $this->branchId = $branchId;
        $this->targetRole = $normalizedRole;
        $this->userId = $userId;
        $this->type = $type;
        $this->eventName = $eventName ?? 'order.operational';
        $this->tenantId = $tenantId;
    }

    /**
     * Chuẩn hóa tên vai trò hai chiều ('tech' <-> 'technician').
     */
    public static function normalizeRole(?string $role): ?string
    {
        if ($role === null) {
            return null;
        }

        $normalized = strtolower(trim($role));
        if ($normalized === '') {
            return null;
        }

        if (in_array($normalized, ['tech', 'technician'], true)) {
            return 'technician';
        }

        return $normalized;
    }

    /**
     * Xác định các PrivateChannel phát sóng cô lập theo Nền tảng / Gian hàng / Chi nhánh / Vai trò / Người dùng.
     * Tuyệt đối không fallback sang kênh toàn cục không có tenantId và không phát lẫn sự kiện có targetRole
     * vào kênh .orders chung của chi nhánh (ngăn rò rỉ giá tiền báo giá sang Kỹ thuật viên).
     *
     * @return array<int, \Illuminate\Broadcasting\Channel>
     */
    public function broadcastOn(): array
    {
        $channelNames = [];
        $normalizedRole = self::normalizeRole($this->targetRole);

        // 1. Sự kiện cấp Quản trị Nền tảng (super_admin) hoặc khi tenantId === null (Fail-Closed)
        if ($normalizedRole === 'super_admin' || $this->tenantId === null) {
            if ($normalizedRole === 'super_admin') {
                $channelNames[] = 'platform.super_admin';
            }

            if ($this->userId !== null) {
                $channelNames[] = "user.{$this->userId}";
            }

            return array_map(
                static fn (string $name): PrivateChannel => new PrivateChannel($name),
                array_values(array_unique($channelNames))
            );
        }

        // 2. Sự kiện thuộc Gian hàng (tenantId !== null)
        $tenantId = (int) $this->tenantId;

        if ($this->userId !== null) {
            // 2a. Sự kiện đích danh cá nhân (giao việc riêng KTV A hoặc nhắc phí riêng Chủ tiệm)
            $channelNames[] = "user.{$this->userId}";

            if ($normalizedRole !== 'admin') {
                $channelNames[] = "tenant.{$tenantId}.role.admin";
            }
        } elseif ($normalizedRole !== null) {
            // 2b. Sự kiện giới hạn theo vai trò (ví dụ 'cskh' có chứa giá tiền VNĐ, 'technician', 'qc', 'admin'):
            // TUYỆT ĐỐI KHÔNG phát vào kênh .orders chung để ngăn KTV nhận ké sự kiện báo giá của CSKH.
            if ($this->branchId !== null) {
                $channelNames[] = "tenant.{$tenantId}.branch.{$this->branchId}.{$normalizedRole}";
            } else {
                $channelNames[] = "tenant.{$tenantId}.role.{$normalizedRole}";
            }

            $channelNames[] = "tenant.{$tenantId}.role.admin";
        } else {
            // 2c. Sự kiện trạng thái chung không giới hạn vai trò và không đích danh cá nhân
            if ($this->branchId !== null) {
                $channelNames[] = "tenant.{$tenantId}.branch.{$this->branchId}.orders";
            }

            $channelNames[] = "tenant.{$tenantId}.orders";
        }

        return array_map(
            static fn (string $name): PrivateChannel => new PrivateChannel($name),
            array_values(array_unique($channelNames))
        );
    }

    /**
     * Tên sự kiện broadcast phía client.
     */
    public function broadcastAs(): string
    {
        return $this->eventName;
    }

    /**
     * Payload chuẩn hóa phát qua Socket (đầy đủ khóa định danh đa tầng cho bộ lọc defense-in-depth).
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
            'tenantId' => $this->tenantId,
            'branchId' => $this->branchId,
            'targetRole' => $this->targetRole,
            'userId' => $this->userId,
        ];
    }
}
