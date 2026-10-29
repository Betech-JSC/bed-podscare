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
            orderCode: 'FX26-00981',
            title: 'Đơn hàng mới',
            message: 'Đơn hàng FX26-00981 đã được tạo thành công.',
            severity: 'info',
        );

        $this->assertInstanceOf(ShouldBroadcast::class, $event);
        $this->assertInstanceOf(ShouldBroadcastNow::class, $event);
    }

    /**
     * Test payload structure matches OperationalNotificationPayload standard (including 3-tier isolation metadata).
     */
    public function test_event_payload_structure(): void
    {
        $now = now()->toIso8601String();
        $event = new OrderOperationalEvent(
            id: 'evt-123',
            orderId: 42,
            orderCode: 'FX26-00982',
            title: 'Cảnh báo vượt SLA',
            message: 'Đơn sửa chữa đã quá hạn xử lý 120 phút.',
            severity: 'danger',
            timestamp: $now,
            actionUrl: '/repairs?id=42',
            branchId: 1,
            targetRole: 'tech',
            userId: 9,
            type: 'sla_warning',
            eventName: null,
            tenantId: 15
        );

        $payload = $event->broadcastWith();

        $this->assertEquals([
            'id' => 'evt-123',
            'orderId' => '42',
            'orderCode' => 'FX26-00982',
            'title' => 'Cảnh báo vượt SLA',
            'message' => 'Đơn sửa chữa đã quá hạn xử lý 120 phút.',
            'severity' => 'danger',
            'timestamp' => $now,
            'actionUrl' => '/repairs?id=42',
            'type' => 'sla_warning',
            'tenantId' => 15,
            'branchId' => 1,
            'targetRole' => 'technician',
            'userId' => 9,
        ], $payload);

        $this->assertEquals('order.operational', $event->broadcastAs());
    }

    /**
     * Test 3-tier tenant-scoped broadcast channels routing based on tenant, branch, role, and user.
     */
    public function test_broadcast_channels_routing(): void
    {
        // 1. Sự kiện cửa hàng giới hạn theo chi nhánh & vai trò (không phát vào kênh .orders chung để bảo vệ giá tiền báo giá)
        $eventBranchRole = new OrderOperationalEvent(
            id: 1,
            orderId: 10,
            orderCode: 'FX26-00981',
            title: 'Chờ QC kiểm định',
            message: 'Kỹ thuật viên đã hoàn thành sửa chữa, chuyển sang QC.',
            severity: 'warning',
            branchId: 2,
            targetRole: 'qc',
            tenantId: 10
        );

        $channels = $eventBranchRole->broadcastOn();
        $channelNames = array_map(fn ($c) => $c->name, $channels);

        $this->assertContains('private-tenant.10.branch.2.qc', $channelNames);
        $this->assertContains('private-tenant.10.role.admin', $channelNames);
        $this->assertNotContains('private-tenant.10.branch.2.orders', $channelNames);
        $this->assertNotContains('private-orders.all', $channelNames);

        // 2. Sự kiện giao việc đích danh cho user cụ thể trong gian hàng (chỉ user đó & Chủ tiệm nhận, không lộ sang đồng nghiệp khác)
        $eventUser = new OrderOperationalEvent(
            id: 2,
            orderId: 11,
            orderCode: 'FX26-00983',
            title: 'Chỉ định đơn sửa',
            message: 'Bạn được phân công sửa đơn hàng mới.',
            severity: 'info',
            branchId: 2,
            targetRole: 'technician',
            userId: 7,
            tenantId: 10
        );

        $channelsUser = $eventUser->broadcastOn();
        $userChannelNames = array_map(fn ($c) => $c->name, $channelsUser);
        $this->assertContains('private-user.7', $userChannelNames);
        $this->assertContains('private-tenant.10.role.admin', $userChannelNames);
        $this->assertNotContains('private-tenant.10.branch.2.technician', $userChannelNames);

        // 3. Sự kiện trạng thái đơn hàng chung của chi nhánh trong gian hàng (không giới hạn vai trò)
        $eventTenantGeneral = new OrderOperationalEvent(
            id: 3,
            orderId: 12,
            orderCode: 'FX26-00984',
            title: 'Cập nhật trạng thái đơn',
            message: 'Đơn hàng chuyển sang sẵn sàng bàn giao.',
            severity: 'info',
            branchId: 2,
            tenantId: 10
        );

        $channelsTenantGeneral = $eventTenantGeneral->broadcastOn();
        $tenantGeneralNames = array_map(fn ($c) => $c->name, $channelsTenantGeneral);
        $this->assertEqualsCanonicalizing([
            'private-tenant.10.branch.2.orders',
            'private-tenant.10.orders',
        ], $tenantGeneralNames);

        // 4. Sự kiện cấp Quản trị Nền tảng (super_admin)
        $eventPlatform = new OrderOperationalEvent(
            id: 4,
            orderId: 0,
            orderCode: 'ALPHA',
            title: 'Gian hàng mới đăng ký',
            message: 'Gian hàng Alpha vừa đăng ký trên FIXO.',
            severity: 'info',
            targetRole: 'super_admin',
            type: 'tenant_registered',
            tenantId: null
        );

        $platformNames = array_map(fn ($c) => $c->name, $eventPlatform->broadcastOn());
        $this->assertSame(['private-platform.super_admin'], $platformNames);

        // 5. Fail-Closed khi thiếu cả tenantId, targetRole='super_admin' và userId -> Không phát vào bất kỳ kênh toàn cục nào
        $eventMissingTenant = new OrderOperationalEvent(
            id: 5,
            orderId: 12,
            orderCode: 'FX26-00984',
            title: 'Thiếu tenantId',
            message: 'Bị chặn fail-closed.',
            severity: 'info',
            tenantId: null
        );
        $this->assertSame([], $eventMissingTenant->broadcastOn());
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
            'FX26-00999',
            'Hoàn tất bàn giao',
            'Đơn hàng đã được khách nhận tại quầy.',
            'success',
            null,
            null,
            1
        );

        Event::assertDispatched(OrderOperationalEvent::class, function ($event) {
            return $event->orderCode === 'FX26-00999'
                && $event->severity === 'success'
                && $event->branchId === 1;
        });
    }
}
