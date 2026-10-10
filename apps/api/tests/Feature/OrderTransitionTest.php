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
use App\Services\BaseWorkflowService;
use App\Services\OrderWorkflowService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class OrderTransitionTest extends TestCase
{
    use DatabaseTransactions;

    private function getAuthenticatedUser(): User
    {
        $user = User::where('email', 'admin@fixo.com.vn')->first()
            ?? User::where('email', 'admin@podscare.vn')->first()
            ?? User::where('role', 'admin')->first()
            ?? User::first();

        $this->assertNotNull($user, 'Authenticated user must exist');
        return $user;
    }

    private function createTestOrder(string $status = 'inspecting'): RepairOrder
    {
        $branch = Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'BR_Q1_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Lê Lợi, Q1, TP.HCM',
            'is_active' => true,
        ]);
        $customer = Customer::first() ?? Customer::create([
            'name'  => 'Nguyễn Minh Anh',
            'phone' => '090' . random_int(1000000, 9999999),
            'email' => 'minhanh_' . uniqid() . '@gmail.com',
        ]);
        $device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);
        $user = $this->getAuthenticatedUser();

        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);

        return RepairOrder::create([
            'order_code'          => "FX{$year}-T{$randomNum}",
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

    /**
     * Test 9 (Task 1.1): Chuẩn hóa từ điển STATUS_LABELS cho 13 trạng thái và các helper methods.
     */
    public function test_status_labels_and_helpers_for_all_13_lifecycle_statuses(): void
    {
        $workflowService = app(OrderWorkflowService::class);

        // 1. Kiểm tra 13 trạng thái chính và alias có trong STATUS_LABELS
        $expectedLabels = [
            'inspecting'       => 'Đang kiểm tra',
            'waiting_approval' => 'Chờ khách duyệt',
            'quote_pending'    => 'Chờ khách duyệt',
            'rejected'         => 'Khách từ chối sửa',
            'waiting_tech'     => 'Chờ kỹ thuật',
            'assigned'         => 'KTV đã nhận',
            'in_repair'        => 'Đang sửa',
            'waiting_parts'    => 'Chờ linh kiện',
            'rework_needed'    => 'Cần sửa lại',
            'waiting_qc'       => 'Chờ QC',
            'qc_pending'       => 'Chờ QC',
            'qc_inspecting'    => 'Chờ QC',
            'ready_for_return' => 'Sẵn sàng trả',
            'waiting_pickup'   => 'Chờ khách nhận',
            'completed'        => 'Hoàn tất',
            'cancelled'        => 'Đã hủy',
        ];

        foreach ($expectedLabels as $statusCode => $expectedLabel) {
            $this->assertEquals(
                $expectedLabel,
                $workflowService->getStatusLabel($statusCode),
                "Nhãn của trạng thái '{$statusCode}' phải là '{$expectedLabel}'."
            );
        }

        // 2. Helper getNextAllowedStatusesWithLabels cho waiting_qc
        $qcNext = $workflowService->getNextAllowedStatusesWithLabels('waiting_qc');
        $this->assertArrayHasKey('ready_for_return', $qcNext);
        $this->assertEquals('Sẵn sàng trả', $qcNext['ready_for_return']);
        $this->assertArrayHasKey('rework_needed', $qcNext);
        $this->assertEquals('Cần sửa lại', $qcNext['rework_needed']);
        $this->assertArrayNotHasKey('completed', $qcNext, 'waiting_qc tuyệt đối không được chứa completed');

        // 3. Helper getNextAllowedStatusesWithLabels cho in_repair
        $repairNext = $workflowService->getNextAllowedStatusesWithLabels('in_repair');
        $this->assertArrayHasKey('waiting_parts', $repairNext);
        $this->assertEquals('Chờ linh kiện', $repairNext['waiting_parts']);
        $this->assertArrayHasKey('waiting_qc', $repairNext);
        $this->assertEquals('Chờ QC', $repairNext['waiting_qc']);
        $this->assertArrayHasKey('ready_for_return', $repairNext);
        $this->assertEquals('Sẵn sàng trả', $repairNext['ready_for_return']);
    }

    /**
     * Test 10 (Task 1.2 & 1.3): Chuyển trực tiếp waiting_qc sang completed ném lỗi 422 thân thiện có định hướng.
     */
    public function test_transition_from_waiting_qc_to_completed_throws_friendly_actionable_error(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('waiting_qc');

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status' => 'completed',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath(
                'message',
                "Không thể chuyển trực tiếp từ 'Chờ QC' sang 'Hoàn tất'. Thiết bị bắt buộc phải có biên bản kiểm định chất lượng (QC Pass) và chuyển sang 'Sẵn sàng trả' trước khi hoàn tất."
            );
    }

    /**
     * Test 11 (Task 1.2 & 1.3): Chuyển trạng thái bất hợp lệ tổng quát trả về danh sách bước kế tiếp hợp lệ.
     */
    public function test_general_invalid_transition_returns_friendly_message_with_allowed_next_statuses(): void
    {
        $user = $this->getAuthenticatedUser();

        // Case A: Đang sửa (in_repair) không thể nhảy sang Hoàn tất (completed)
        $orderRepair = $this->createTestOrder('in_repair');
        $responseRepair = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$orderRepair->id}/transition", [
            'status' => 'completed',
        ]);

        $responseRepair->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath(
                'message',
                "Không thể chuyển trạng thái từ 'Đang sửa' sang 'Hoàn tất'. Các trạng thái hợp lệ tiếp theo: Chờ linh kiện, Chờ QC, Sẵn sàng trả, Chờ kỹ thuật, KTV đã nhận."
            );

        // Case B: Đang kiểm tra (inspecting) không thể nhảy sang Hoàn tất (completed)
        $orderInspect = $this->createTestOrder('inspecting');
        $responseInspect = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$orderInspect->id}/transition", [
            'status' => 'completed',
        ]);

        $responseInspect->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath(
                'message',
                "Không thể chuyển trạng thái từ 'Đang kiểm tra' sang 'Hoàn tất'. Các trạng thái hợp lệ tiếp theo: Chờ khách duyệt, Chờ kỹ thuật, Đang sửa, Đã hủy."
            );
    }

    /**
     * Test 12 (Task 1.2): Chuyển sang Sẵn sàng trả khi chưa có QC Pass báo lỗi thân thiện.
     */
    public function test_transition_to_ready_for_return_requires_qc_pass_friendly_message(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('waiting_qc');

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status' => 'ready_for_return',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath(
                'message',
                'Đơn hàng chưa có biên bản kiểm định chất lượng đạt chuẩn (QC Pass). Không thể chuyển sang trạng thái sẵn sàng giao trả.'
            );
    }

    /**
     * Test 13: Endpoint GET /api/v1/orders/{id}/allowed-transitions trả về ma trận chuyển đổi hợp lệ kèm nhãn.
     */
    public function test_order_allowed_transitions_api_endpoint(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('waiting_qc');

        $response = $this->actingAs($user, 'sanctum')->getJson("/api/v1/orders/{$order->id}/allowed-transitions");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_status', 'waiting_qc')
            ->assertJsonPath('data.current_label', 'Chờ QC')
            ->assertJsonStructure([
                'success',
                'message',
                'data' => [
                    'order_id',
                    'current_status',
                    'current_label',
                    'allowed_statuses',
                ],
            ]);

        $allowedStatuses = $response->json('data.allowed_statuses');
        $this->assertArrayHasKey('ready_for_return', $allowedStatuses);
        $this->assertEquals('Sẵn sàng trả', $allowedStatuses['ready_for_return']);
        $this->assertArrayNotHasKey('completed', $allowedStatuses);
    }

    /**
     * Test 14 (OpenSpec ktv-grab-dispatch Task 1.1): Chuyển trực tiếp từ waiting_tech sang in_repair và tự động gán technician_id.
     */
    public function test_direct_transition_from_waiting_tech_to_in_repair_with_technician_assignment(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('waiting_tech');

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status'        => 'in_repair',
            'technician_id' => $user->id,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'in_repair')
            ->assertJsonPath('data.technician_id', $user->id);

        $fresh = $order->fresh();
        $this->assertEquals('in_repair', $fresh->status);
        $this->assertEquals($user->id, $fresh->technician_id);
        $this->assertNotNull($fresh->repair_started_at);
        $this->assertNotNull($fresh->tech_accepted_at);
    }

    /**
     * Test 15 (OpenSpec ktv-grab-dispatch Task 1.2 & 1.3): Chuyển trực tiếp từ in_repair sang ready_for_return tự động tạo QC pass và dispatch event cho CSKH.
     */
    public function test_direct_transition_from_in_repair_to_ready_for_return_bypasses_qc_block_and_dispatches_event(): void
    {
        \Illuminate\Support\Facades\Event::fake([\App\Events\OrderOperationalEvent::class]);

        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('in_repair');

        // Chuyển thẳng in_repair -> ready_for_return mà chưa có QC Inspection thủ công
        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status'      => 'ready_for_return',
            'repair_note' => 'Đã thay thế linh kiện và kiểm tra âm thanh hoàn tất',
            'parts_used'  => 'Pin AirPods Pro 2, Loa tai trái',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'ready_for_return');

        $fresh = $order->fresh();
        $this->assertEquals('ready_for_return', $fresh->status);
        $this->assertNotNull($fresh->repair_completed_at);
        $this->assertNotNull($fresh->qc_passed_at);
        $this->assertEquals('Đã thay thế linh kiện và kiểm tra âm thanh hoàn tất', $fresh->repair_note);
        $this->assertEquals('Pin AirPods Pro 2, Loa tai trái', $fresh->parts_used_summary);

        // Đảm bảo bản ghi QcInspection ngầm được tạo tự động với kết quả pass
        $this->assertDatabaseHas('qc_inspections', [
            'repair_order_id' => $order->id,
            'result'          => 'pass',
            'notes'           => 'Đã thay thế linh kiện và kiểm tra âm thanh hoàn tất',
        ]);

        // Đảm bảo event được dispatch tới đúng role cskh của chi nhánh
        \Illuminate\Support\Facades\Event::assertDispatched(\App\Events\OrderOperationalEvent::class, function (\App\Events\OrderOperationalEvent $event) use ($order) {
            return (int) $event->orderId === (int) $order->id
                && $event->targetRole === 'cskh'
                && $event->eventName === 'order.ready_for_return'
                && $event->severity === 'success';
        });
    }

    /**
     * Test 16: Chuyển nhanh từ assigned sang ready_for_return tự động gán repair_started_at, technician_id và tạo QC pass.
     */
    public function test_fast_track_transition_from_assigned_to_ready_for_return(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('assigned');
        $this->assertNull($order->repair_started_at);

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status'      => 'ready_for_return',
            'repair_note' => 'KTV hoàn tất trực tiếp từ trạng thái đã nhận',
            'parts_used'  => 'Thay pin Dock sạc',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'ready_for_return');

        $fresh = $order->fresh();
        $this->assertEquals('ready_for_return', $fresh->status);
        $this->assertNotNull($fresh->repair_started_at);
        $this->assertNotNull($fresh->repair_completed_at);
        $this->assertNotNull($fresh->qc_passed_at);
        $this->assertEquals('Thay pin Dock sạc', $fresh->parts_used_summary);

        // Bản ghi QcInspection tự động tạo với pass
        $this->assertDatabaseHas('qc_inspections', [
            'repair_order_id' => $order->id,
            'result'          => 'pass',
            'notes'           => 'KTV hoàn tất trực tiếp từ trạng thái đã nhận',
        ]);
    }

    /**
     * Test 17: Chuyển nhanh từ rework_needed sang ready_for_return tự động tạo QC pass.
     */
    public function test_fast_track_transition_from_rework_needed_to_ready_for_return(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('rework_needed');

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status'      => 'ready_for_return',
            'repair_note' => 'Đã khắc phục lỗi sau khi QC báo làm lại',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'ready_for_return');

        $fresh = $order->fresh();
        $this->assertEquals('ready_for_return', $fresh->status);
        $this->assertNotNull($fresh->repair_started_at);
        $this->assertNotNull($fresh->repair_completed_at);
        $this->assertNotNull($fresh->qc_passed_at);

        $this->assertDatabaseHas('qc_inspections', [
            'repair_order_id' => $order->id,
            'result'          => 'pass',
            'notes'           => 'Đã khắc phục lỗi sau khi QC báo làm lại',
        ]);
    }

    /**
     * Test 18: Chuyển từ assigned sang waiting_parts thành công.
     */
    public function test_transition_from_assigned_to_waiting_parts(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('assigned');

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status' => 'waiting_parts',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'waiting_parts');

        $this->assertEquals('waiting_parts', $order->fresh()->status);
    }
}

