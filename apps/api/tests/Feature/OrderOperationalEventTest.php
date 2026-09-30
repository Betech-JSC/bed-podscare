<?php

namespace Tests\Feature;

use App\Events\OrderOperationalEvent;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class OrderOperationalEventTest extends TestCase
{
    use DatabaseTransactions;

    /**
     * Test that OrderOperationalEvent implements ShouldBroadcastNow (and ShouldBroadcast).
     */
    public function test_event_implements_should_broadcast(): void
    {
        $event = new OrderOperationalEvent(
            id: 1,
            orderId: 10,
            orderCode: 'PC26-00981',
            title: 'Đơn hàng mới',
            message: 'Đơn hàng PC26-00981 đã được tạo thành công.',
            severity: 'info',
        );

        $this->assertInstanceOf(ShouldBroadcast::class, $event);
        $this->assertInstanceOf(ShouldBroadcastNow::class, $event);
    }

    /**
     * Test payload structure matches OperationalNotificationPayload standard.
     */
    public function test_event_payload_structure(): void
    {
        $now = now()->toIso8601String();
        $event = new OrderOperationalEvent(
            id: 'evt-123',
            orderId: 42,
            orderCode: 'PC26-00982',
            title: 'Cảnh báo vượt SLA',
            message: 'Đơn sửa chữa đã quá hạn xử lý 120 phút.',
            severity: 'danger',
            timestamp: $now,
            actionUrl: '/repairs?id=42',
            branchId: 1,
            targetRole: 'technician',
            type: 'sla_warning'
        );

        $payload = $event->broadcastWith();

        $this->assertEquals([
            'id' => 'evt-123',
            'orderId' => '42',
            'orderCode' => 'PC26-00982',
            'title' => 'Cảnh báo vượt SLA',
            'message' => 'Đơn sửa chữa đã quá hạn xử lý 120 phút.',
            'severity' => 'danger',
            'timestamp' => $now,
            'actionUrl' => '/repairs?id=42',
            'type' => 'sla_warning',
        ], $payload);

        $this->assertEquals('order.operational', $event->broadcastAs());
    }

    /**
     * Test broadcast channels based on branch, role, and user.
     */
    public function test_broadcast_channels_routing(): void
    {
        // 1. Theo chi nhánh & vai trò
        $eventBranchRole = new OrderOperationalEvent(
            id: 1,
            orderId: 10,
            orderCode: 'PC26-00981',
            title: 'Chờ QC kiểm định',
            message: 'Kỹ thuật viên đã hoàn thành sửa chữa, chuyển sang QC.',
            severity: 'warning',
            branchId: 2,
            targetRole: 'qc'
        );

        $channels = $eventBranchRole->broadcastOn();
        $channelNames = array_map(fn ($c) => $c->name, $channels);

        $this->assertContains('private-branch.2.orders', $channelNames);
        $this->assertContains('private-branch.2.qc', $channelNames);
        $this->assertContains('private-role.qc', $channelNames);

        // 2. Theo user cụ thể
        $eventUser = new OrderOperationalEvent(
            id: 2,
            orderId: 11,
            orderCode: 'PC26-00983',
            title: 'Chỉ định đơn sửa',
            message: 'Bạn được phân công sửa đơn hàng mới.',
            severity: 'info',
            userId: 7
        );

        $channelsUser = $eventUser->broadcastOn();
        $userChannelNames = array_map(fn ($c) => $c->name, $channelsUser);
        $this->assertContains('private-user.7', $userChannelNames);

        // 3. Toàn hệ thống (default)
        $eventAll = new OrderOperationalEvent(
            id: 3,
            orderId: 12,
            orderCode: 'PC26-00984',
            title: 'Thông báo chung',
            message: 'Cập nhật hệ thống chung.',
            severity: 'info'
        );

        $channelsAll = $eventAll->broadcastOn();
        $allNames = array_map(fn ($c) => $c->name, $channelsAll);
        $this->assertContains('private-orders.all', $allNames);
    }

    /**
     * Test dispatching event with Event::fake.
     */
    public function test_event_can_be_dispatched_and_captured(): void
    {
        Event::fake([OrderOperationalEvent::class]);

        OrderOperationalEvent::dispatch(
            99,
            50,
            'PC26-00999',
            'Hoàn tất bàn giao',
            'Đơn hàng đã được khách nhận tại quầy.',
            'success',
            null,
            null,
            1
        );

        Event::assertDispatched(OrderOperationalEvent::class, function ($event) {
            return $event->orderCode === 'PC26-00999'
                && $event->severity === 'success'
                && $event->branchId === 1;
        });
    }
}
