<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Notification;
use App\Models\RepairOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class NotificationControllerTest extends TestCase
{
    use DatabaseTransactions;

    protected User $user;
    protected Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();

        $this->branch = Branch::first() ?? Branch::create([
            'name' => 'Chi nhánh Test',
            'code' => 'CN-TEST',
            'address' => '123 Đường Test, Q1',
            'phone' => '0901112222',
            'is_active' => true,
        ]);

        $this->user = User::where('email', 'admin@podscare.vn')->first() ?? User::factory()->create([
            'email' => 'admin@podscare.vn',
            'role' => 'admin',
            'branch_id' => $this->branch->id,
        ]);
    }

    /**
     * Test unauthenticated access returns 401 Unauthorized.
     */
    public function test_unauthenticated_user_cannot_access_notifications(): void
    {
        $response = $this->getJson('/api/v1/notifications');
        $response->assertStatus(401);

        $responsePatch = $this->patchJson('/api/v1/notifications/1/read');
        $responsePatch->assertStatus(401);

        $responseReadAll = $this->postJson('/api/v1/notifications/read-all');
        $responseReadAll->assertStatus(401);
    }

    /**
     * Test authenticated user can retrieve paginated notifications list with unread_count.
     */
    public function test_authenticated_user_can_get_paginated_notifications(): void
    {
        // Tạo 25 thông báo
        Notification::factory()->count(25)->create([
            'user_id' => $this->user->id,
            'branch_id' => $this->branch->id,
            'is_read' => false,
        ]);

        $response = $this->actingAs($this->user, 'sanctum')->getJson('/api/v1/notifications?per_page=10');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.total', 25)
            ->assertJsonPath('data.per_page', 10)
            ->assertJsonPath('data.unread_count', 25)
            ->assertJsonStructure([
                'success',
                'message',
                'data' => [
                    'current_page',
                    'data' => [
                        '*' => [
                            'id',
                            'user_id',
                            'branch_id',
                            'type',
                            'title',
                            'message',
                            'severity',
                            'is_read',
                            'created_at',
                        ],
                    ],
                    'total',
                    'unread_count',
                ],
            ]);

        $this->assertCount(10, $response->json('data.data'));
    }

    /**
     * Test filtering notifications by user_id.
     */
    public function test_can_filter_notifications_by_user(): void
    {
        $otherUser = User::factory()->create([
            'email' => 'other_' . uniqid() . '@podscare.vn',
            'role' => 'technician',
            'branch_id' => $this->branch->id,
        ]);

        Notification::factory()->count(3)->create(['user_id' => $this->user->id]);
        Notification::factory()->count(2)->create(['user_id' => $otherUser->id]);

        $response = $this->actingAs($this->user, 'sanctum')
            ->getJson("/api/v1/notifications?user_id={$otherUser->id}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.total', 2);
    }

    /**
     * Test filtering notifications by branch_id.
     */
    public function test_can_filter_notifications_by_branch(): void
    {
        $branch2 = Branch::create([
            'name' => 'Chi nhánh Thủ Đức',
            'code' => 'CN-TD',
            'address' => '456 Võ Văn Ngân, Thủ Đức',
            'phone' => '0903334444',
            'is_active' => true,
        ]);

        Notification::factory()->count(4)->create(['branch_id' => $this->branch->id]);
        Notification::factory()->count(2)->create(['branch_id' => $branch2->id]);

        $response = $this->actingAs($this->user, 'sanctum')
            ->getJson("/api/v1/notifications?branch_id={$branch2->id}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.total', 2);
    }

    /**
     * Test filtering notifications by is_read status.
     */
    public function test_can_filter_notifications_by_is_read(): void
    {
        Notification::factory()->count(3)->create(['is_read' => false]);
        Notification::factory()->count(5)->create(['is_read' => true, 'read_at' => now()]);

        $responseUnread = $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/v1/notifications?is_read=0');

        $responseUnread->assertStatus(200)
            ->assertJsonPath('data.total', 3);

        $responseRead = $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/v1/notifications?is_read=1');

        $responseRead->assertStatus(200)
            ->assertJsonPath('data.total', 5);
    }

    /**
     * Test marking a single notification as read.
     */
    public function test_can_mark_single_notification_as_read(): void
    {
        $notification = Notification::factory()->create([
            'user_id' => $this->user->id,
            'is_read' => false,
            'read_at' => null,
        ]);

        $response = $this->actingAs($this->user, 'sanctum')
            ->patchJson("/api/v1/notifications/{$notification->id}/read");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.is_read', true);

        $notification->refresh();
        $this->assertTrue($notification->is_read);
        $this->assertNotNull($notification->read_at);
    }

    /**
     * Test marking non-existent notification returns 404.
     */
    public function test_mark_non_existent_notification_returns_404(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')
            ->patchJson('/api/v1/notifications/999999/read');

        $response->assertStatus(404)
            ->assertJsonPath('success', false);
    }

    /**
     * Test marking all notifications as read.
     */
    public function test_can_mark_all_notifications_as_read(): void
    {
        Notification::factory()->count(4)->create([
            'user_id' => $this->user->id,
            'is_read' => false,
            'read_at' => null,
        ]);

        $this->assertEquals(4, Notification::where('is_read', false)->count());

        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/notifications/read-all');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.updated_count', 4);

        $this->assertEquals(0, Notification::where('is_read', false)->count());
    }
}
