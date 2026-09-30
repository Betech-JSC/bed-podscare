<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Partner;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\User;
use App\Models\Warranty;
use Tests\TestCase;

class OrderTransitionTest extends TestCase
{
    private function getAuthenticatedUser(): User
    {
        $user = User::where('email', 'admin@podscare.vn')->first();
        if (! $user) {
            $user = User::first();
        }
        $this->assertNotNull($user, 'Authenticated user must exist');
        return $user;
    }

    private function createTestOrder(string $status = 'inspecting'): RepairOrder
    {
        $branch = Branch::first();
        $customer = Customer::first();
        $device = DeviceModel::first();
        $user = $this->getAuthenticatedUser();

        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);

        return RepairOrder::create([
            'order_code'          => "PC{$year}-T{$randomNum}",
            'branch_id'           => $branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'issue_description'   => 'Kiểm tra lỗi màn hình hoặc âm thanh',
            'status'              => $status,
            'total_price'         => 450000,
            'price_note'          => 'Thay linh kiện pin và màng loa',
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $user->id,
        ]);
    }

    /**
     * Test 1: transition() accepts string ID without throwing TypeError (Task 1.1)
     */
    public function test_order_transition_accepts_string_id_without_type_error(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('inspecting');

        // Pass ID explicitly as string
        $stringId = (string) $order->id;

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$stringId}/transition", [
            'status' => 'waiting_approval',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.id', $order->id)
            ->assertJsonPath('data.status', 'waiting_approval');

        $this->assertEquals('waiting_approval', $order->fresh()->status);
    }

    /**
     * Test 2: transition() returns 404 when order is not found with string or non-existent ID
     */
    public function test_order_transition_returns_not_found_for_invalid_id(): void
    {
        $user = $this->getAuthenticatedUser();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/orders/9999999/transition', [
            'status' => 'waiting_approval',
        ]);

        $response->assertStatus(404)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Không tìm thấy đơn sửa chữa.');
    }

    /**
     * Test 3: Fast-track transition inspecting -> waiting_tech (Task 1.2)
     * Updates customer_approved_at and logs audit
     */
    public function test_fast_track_transition_from_inspecting_to_waiting_tech(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('inspecting');

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status' => 'waiting_tech',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'waiting_tech');

        $updatedOrder = $order->fresh();
        $this->assertEquals('waiting_tech', $updatedOrder->status);
        $this->assertNotNull($updatedOrder->customer_approved_at);

        // Verify AuditLog
        $this->assertDatabaseHas('audit_logs', [
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => $order->id,
            'action'         => 'Đổi trạng thái: inspecting -> waiting_tech',
        ]);
    }

    /**
     * Test 4: Instant handover transition ready_for_return -> completed (Task 1.2)
     * Updates delivered_at / handed_over_at, activates electronic warranty and customer stats
     */
    public function test_instant_handover_transition_from_ready_for_return_to_completed(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('ready_for_return');
        $customer = $order->customer;
        $initialSpent = (float) $customer->total_spent;
        $initialOrdersCount = $customer->orders_count;

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status' => 'completed',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'completed');

        $updatedOrder = $order->fresh();
        $this->assertEquals('completed', $updatedOrder->status);
        $this->assertNotNull($updatedOrder->handed_over_at);
        $this->assertNotNull($updatedOrder->delivered_at);

        // Electronic warranty auto-created
        $this->assertTrue($updatedOrder->warranties()->exists());
        $warranty = $updatedOrder->warranties()->first();
        $this->assertEquals('active', $warranty->status);
        $this->assertEquals($order->customer_id, $warranty->customer_id);

        // Customer stats updated
        $freshCustomer = $customer->fresh();
        $this->assertEquals($initialOrdersCount + 1, $freshCustomer->orders_count);
        $this->assertEquals($initialSpent + (float) $order->total_price, (float) $freshCustomer->total_spent);
    }

    /**
     * Test 5: Normalization between qc_pending and waiting_qc (Task 1.2)
     */
    public function test_qc_pending_and_waiting_qc_two_way_normalization(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('in_repair');

        // Transition using 'qc_pending' -> should normalize to 'waiting_qc'
        $responsePending = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status' => 'qc_pending',
            'repair_note' => 'Đã thay loa thành công',
        ]);

        $responsePending->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'waiting_qc');

        $this->assertEquals('waiting_qc', $order->fresh()->status);

        // Filter orders by qc_pending
        $responseFilterQcPending = $this->actingAs($user, 'sanctum')->getJson('/api/v1/orders?status=qc_pending');
        $responseFilterQcPending->assertStatus(200);
        $orderCodes = collect($responseFilterQcPending->json('data.data'))->pluck('order_code')->toArray();
        $this->assertContains($order->order_code, $orderCodes);

        // Filter orders by waiting_qc
        $responseFilterWaitingQc = $this->actingAs($user, 'sanctum')->getJson('/api/v1/orders?status=waiting_qc');
        $responseFilterWaitingQc->assertStatus(200);
        $orderCodes2 = collect($responseFilterWaitingQc->json('data.data'))->pluck('order_code')->toArray();
        $this->assertContains($order->order_code, $orderCodes2);

        // Transition from waiting_qc to ready_for_return (requires QC Pass)
        QcInspection::create([
            'repair_order_id' => $order->id,
            'inspector_id'    => $user->id,
            'result'          => 'pass',
            'notes'           => 'Đạt tiêu chuẩn xuất xưởng',
        ]);

        $responseReturn = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status' => 'ready_for_return',
        ]);
        $responseReturn->assertStatus(200)
            ->assertJsonPath('data.status', 'ready_for_return');
    }

    /**
     * Test 5b: Status alias normalization: quote_pending -> waiting_approval
     */
    public function test_quote_pending_alias_normalizes_to_waiting_approval(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('inspecting');

        // Transition using status alias 'quote_pending'
        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status' => 'quote_pending',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'waiting_approval');

        $this->assertEquals('waiting_approval', $order->fresh()->status);

        // Filter orders by quote_pending
        $responseFilter = $this->actingAs($user, 'sanctum')->getJson('/api/v1/orders?status=quote_pending');
        $responseFilter->assertStatus(200);
        $orderCodes = collect($responseFilter->json('data.data'))->pluck('order_code')->toArray();
        $this->assertContains($order->order_code, $orderCodes);
    }

    /**
     * Test 5c: Status alias normalization: qc_inspecting -> waiting_qc
     */
    public function test_qc_inspecting_alias_normalizes_to_waiting_qc(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('in_repair');

        // Transition using 'transition' payload with 'qc_inspecting'
        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'transition'  => 'qc_inspecting',
            'repair_note' => 'Hoàn tất thay pin và loa',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'waiting_qc');

        $this->assertEquals('waiting_qc', $order->fresh()->status);

        // Filter orders by qc_inspecting
        $responseFilter = $this->actingAs($user, 'sanctum')->getJson('/api/v1/orders?status=qc_inspecting');
        $responseFilter->assertStatus(200);
        $orderCodes = collect($responseFilter->json('data.data'))->pluck('order_code')->toArray();
        $this->assertContains($order->order_code, $orderCodes);
    }

    /**
     * Test 6: Partner API authentication requirement (Task 1.3)
     */
    public function test_partner_api_requires_authentication(): void
    {
        $response = $this->getJson('/api/v1/partners');
        $response->assertStatus(401);
    }

    /**
     * Test 7: Partner API index, filtering and search (Task 1.3)
     */
    public function test_partner_api_index_and_filtering(): void
    {
        $user = $this->getAuthenticatedUser();

        // Ensure at least one known partner exists
        Partner::firstOrCreate(
            ['code' => 'GHN'],
            [
                'name' => 'Giao Hàng Nhanh (GHN Express)',
                'service_type' => 'logistics',
                'contact_person' => 'Nguyễn Văn Giao',
                'phone' => '19001206',
                'status' => 'active',
            ]
        );

        // 1. List all
        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/partners');
        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'message',
                'data' => [
                    'data' => [
                        '*' => ['id', 'code', 'name', 'service_type', 'status'],
                    ],
                ],
            ]);

        // 2. Filter by service_type
        $responseFilter = $this->actingAs($user, 'sanctum')->getJson('/api/v1/partners?service_type=logistics');
        $responseFilter->assertStatus(200);
        foreach ($responseFilter->json('data.data') as $item) {
            $this->assertEquals('logistics', $item['service_type']);
        }

        // 3. Search by name or code
        $responseSearch = $this->actingAs($user, 'sanctum')->getJson('/api/v1/partners?q=GHN');
        $responseSearch->assertStatus(200);
        $this->assertNotEmpty($responseSearch->json('data.data'));
    }

    /**
     * Test 8: Partner API store, show and update (Task 1.3)
     */
    public function test_partner_api_crud_lifecycle(): void
    {
        $user = $this->getAuthenticatedUser();
        $code = 'PARTNER_' . uniqid();

        // 1. Store
        $responseCreate = $this->actingAs($user, 'sanctum')->postJson('/api/v1/partners', [
            'code'           => $code,
            'name'           => 'Đối tác Thử Nghiệm Alpha',
            'service_type'   => 'specialized_repair',
            'contact_person' => 'Kỹ thuật trưởng',
            'phone'          => '0912345678',
            'status'         => 'active',
            'api_config'     => ['env' => 'sandbox'],
        ]);

        $responseCreate->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.code', $code)
            ->assertJsonPath('data.name', 'Đối tác Thử Nghiệm Alpha');

        $partnerId = $responseCreate->json('data.id');

        // 2. Show (with string ID)
        $responseShow = $this->actingAs($user, 'sanctum')->getJson("/api/v1/partners/{$partnerId}");
        $responseShow->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.id', $partnerId)
            ->assertJsonPath('data.name', 'Đối tác Thử Nghiệm Alpha');

        // 3. Update
        $responseUpdate = $this->actingAs($user, 'sanctum')->putJson("/api/v1/partners/{$partnerId}", [
            'name'           => 'Đối tác Thử Nghiệm Alpha Updated',
            'contact_person' => 'Giám đốc Vận Hành',
        ]);

        $responseUpdate->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.name', 'Đối tác Thử Nghiệm Alpha Updated')
            ->assertJsonPath('data.contact_person', 'Giám đốc Vận Hành');

        // 4. Show non-existent returns 404
        $responseNotFound = $this->actingAs($user, 'sanctum')->getJson('/api/v1/partners/999999');
        $responseNotFound->assertStatus(404)
            ->assertJsonPath('success', false);
    }
}
