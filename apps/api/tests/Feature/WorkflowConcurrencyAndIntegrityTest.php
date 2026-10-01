<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Part;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\RepairQuote;
use App\Models\Shipment;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use Carbon\Carbon;
use Tests\TestCase;

class WorkflowConcurrencyAndIntegrityTest extends TestCase
{
    private function getAuthenticatedUser(): User
    {
        $user = User::where('email', 'admin@fixo.com.vn')->first()
            ?? User::where('email', 'admin@podscare.vn')->first()
            ?? User::where('role', 'admin')->first()
            ?? User::first();

        $this->assertNotNull($user, 'Authenticated user must exist');
        return $user;
    }

    private function createTestOrder(string $status = 'inspecting', int $warrantyDays = 90): RepairOrder
    {
        $branch = Branch::first();
        $customer = Customer::first() ?? Customer::create([
            'name'  => 'Nguyễn Minh Anh',
            'phone' => '0900000001',
            'email' => 'minhanh.nguyen@gmail.com',
        ]);
        $device = DeviceModel::first();
        $user = $this->getAuthenticatedUser();

        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);

        return RepairOrder::create([
            'order_code'          => "PC{$year}-W{$randomNum}",
            'branch_id'           => $branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'issue_description'   => 'Kiểm tra pin và loa ngoài',
            'status'              => $status,
            'total_price'         => 350000,
            'price_note'          => 'Thay pin linh kiện',
            'warranty_terms_days' => $warrantyDays,
            'created_by_user_id'  => $user->id,
        ]);
    }

    /**
     * 2.1 & 2.2: Optimistic Locking qua expected_updated_at ném ra 409 Conflict khi bị xung đột.
     */
    public function test_optimistic_locking_prevents_lost_updates_with_409_conflict(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('inspecting');

        // Giả lập client A gửi timestamp cũ hơn (xung đột)
        $staleTimestamp = Carbon::now()->subMinutes(15)->toIso8601String();

        $responseConflict = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status'              => 'waiting_approval',
            'expected_updated_at' => $staleTimestamp,
        ]);

        $responseConflict->assertStatus(409)
            ->assertJsonPath('success', false)
            ->assertJsonFragment([
                'message' => 'Dữ liệu vừa được cập nhật bởi một người dùng khác. Vui lòng tải lại trang để xem thông tin mới nhất.',
            ]);

        // Client B gửi timestamp chính xác khớp với bản ghi trong CSDL -> Thành công
        $freshTimestamp = $order->fresh()->updated_at->toIso8601String();

        $responseOk = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status'              => 'waiting_approval',
            'expected_updated_at' => $freshTimestamp,
        ]);

        $responseOk->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'waiting_approval');
    }

    /**
     * 2.1 & 2.3: Bước chuyển không hợp lệ trong ALLOWED_TRANSITIONS trả về 422.
     */
    public function test_invalid_state_transition_returns_422(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('inspecting');

        // inspecting không thể nhảy vọt trực tiếp sang completed
        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status' => 'completed',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    /**
     * 2.1: Hook beforeTransition chặn ready_for_return nếu chưa có QC Pass.
     */
    public function test_ready_for_return_requires_qc_pass_via_workflow_service(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('waiting_qc');

        // 1. Chuyển sang ready_for_return khi chưa có QC Pass -> 422
        $responseFail = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status' => 'ready_for_return',
        ]);

        $responseFail->assertStatus(422)
            ->assertJsonPath('success', false);

        // 2. Tạo biên bản QC Đạt
        QcInspection::create([
            'repair_order_id' => $order->id,
            'inspector_id'    => $user->id,
            'result'          => 'pass',
            'notes'           => 'QC đạt chuẩn âm thanh',
        ]);

        // 3. Chuyển lại -> Thành công 200
        $responseSuccess = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status' => 'ready_for_return',
        ]);

        $responseSuccess->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'ready_for_return');
    }

    /**
     * 3.1: Quản lý kho đa chi nhánh branch_parts cô lập tồn kho giữa các chi nhánh.
     */
    public function test_multi_branch_inventory_isolation_and_lock(): void
    {
        $user = $this->getAuthenticatedUser();
        $branch1 = Branch::first();
        $branch2 = Branch::skip(1)->first() ?? Branch::create([
            'code'      => 'BR_TEST_' . uniqid(),
            'name'      => 'Chi nhánh Test',
            'address'   => '456 Test Street',
            'phone'     => '0988776655',
            'is_active' => true,
        ]);

        $part = Part::create([
            'sku'              => 'TEST-PART-' . uniqid(),
            'name'             => 'Linh kiện tai nghe Test Isolation',
            'category'         => 'Pin',
            'storage_location' => 'Kệ T · Tầng 1',
            'stock_quantity'   => 10,
            'cost_price'       => 100000,
            'retail_price'     => 150000,
            'unit'             => 'cái',
            'is_active'        => true,
        ]);

        // Phân bổ: Branch 1 có 5 cái, Branch 2 có 0 cái
        BranchPart::create([
            'branch_id'      => $branch1->id,
            'part_id'        => $part->id,
            'stock_quantity' => 5,
        ]);

        BranchPart::create([
            'branch_id'      => $branch2->id,
            'part_id'        => $part->id,
            'stock_quantity' => 0,
        ]);

        // Xuất 2 cái từ Branch 2 (kho không đủ tồn tại chi nhánh) -> 422
        $responseBranch2 = $this->actingAs($user, 'sanctum')->postJson('/api/v1/inventory/transactions', [
            'part_id'          => $part->id,
            'branch_id'        => $branch2->id,
            'transaction_type' => 'export_repair',
            'quantity'         => 2,
        ]);

        $responseBranch2->assertStatus(422)
            ->assertJsonPath('success', false);

        // Xuất 2 cái từ Branch 1 (có đủ 5 cái) -> 201 thành công
        $responseBranch1 = $this->actingAs($user, 'sanctum')->postJson('/api/v1/inventory/transactions', [
            'part_id'          => $part->id,
            'branch_id'        => $branch1->id,
            'transaction_type' => 'export_repair',
            'quantity'         => 2,
        ]);

        $responseBranch1->assertStatus(201)
            ->assertJsonPath('success', true);

        // Kiểm tra tồn kho sau khi xuất
        $branch1Part = BranchPart::where('branch_id', $branch1->id)->where('part_id', $part->id)->first();
        $this->assertEquals(3, $branch1Part->stock_quantity);
    }

    /**
     * 3.2: Bộ sinh mã claim_code định dạng CLM-{Ym}-{0001..9999} entropy cao.
     */
    public function test_high_entropy_claim_code_generation(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('ready_for_return');

        $warranty = Warranty::create([
            'warranty_code'   => 'WR-TEST-' . uniqid(),
            'repair_order_id' => $order->id,
            'customer_id'     => $order->customer_id,
            'device_model_id' => $order->device_model_id,
            'coverage_item'   => 'Dịch vụ sửa chữa',
            'start_date'      => now()->toDateString(),
            'duration_days'   => 90,
            'end_date'        => now()->addDays(90)->toDateString(),
            'status'          => 'active',
        ]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $warranty->id,
            'issue_description' => 'Tai nghe mất kết nối bluetooth',
            'resolution_mode'   => 'store_check',
            'notes'             => 'Khách mang trực tiếp qua chi nhánh',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true);

        $claimCode = $response->json('data.claim_code');
        $this->assertMatchesRegularExpression('/^CLM-\d{6}-\d{4}$/', $claimCode);
    }

    /**
     * 3.3: Mã vận đơn SH-{Ymd}-{0001..9999} và mã báo giá Q-{Ym}-{0001..9999}.
     */
    public function test_high_entropy_shipment_and_quote_code_generation(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('inspecting');

        // 1. Tạo vận đơn
        $responseShipment = $this->actingAs($user, 'sanctum')->postJson('/api/v1/shipments', [
            'repair_order_id'  => $order->id,
            'delivery_method'  => 'store_pickup',
            'carrier_name'     => 'PodsCare Express',
        ]);

        $responseShipment->assertStatus(201);
        $shipmentCode = $responseShipment->json('data.shipment_code');
        $this->assertMatchesRegularExpression('/^SH-\d{8}-\d{4}$/', $shipmentCode);

        // 2. Tạo báo giá
        $responseQuote = $this->actingAs($user, 'sanctum')->postJson('/api/v1/quotes', [
            'repair_order_id' => $order->id,
            'note'            => 'Báo giá thay màng loa và pin',
            'items'           => [
                [
                    'description' => 'Pin thay thế zin',
                    'quantity'    => 1,
                    'unit_price'  => 250000,
                ],
            ],
        ]);

        $responseQuote->assertStatus(201);
        $quoteNumber = $responseQuote->json('data.quote_number');
        $this->assertMatchesRegularExpression('/^Q-\d{6}-\d{4}$/', $quoteNumber);
    }

    /**
     * 4.1 & 4.2: Tự động chuyển completed và kích hoạt warranty khi shipment chuyển delivered.
     */
    public function test_shipment_delivered_automatically_completes_order_and_activates_warranty(): void
    {
        $user = $this->getAuthenticatedUser();
        $order = $this->createTestOrder('ready_for_return', 90);
        $customer = $order->customer;
        $initialSpent = (float) $customer->total_spent;
        $initialOrdersCount = $customer->orders_count;

        // Tạo vận đơn cho đơn này
        $shipment = Shipment::create([
            'shipment_code'      => 'SH-' . date('Ymd') . '-' . random_int(1000, 9999) . random_int(10, 99),
            'repair_order_id'    => $order->id,
            'delivery_method'    => 'home_delivery',
            'carrier_name'       => 'Shipper Nội Bộ',
            'status'             => 'pending',
            'created_by_user_id' => $user->id,
        ]);

        // Cập nhật delivered kèm proof_photo_url qua PUT
        $response = $this->actingAs($user, 'sanctum')->putJson("/api/v1/shipments/{$shipment->id}/status", [
            'status'          => 'delivered',
            'proof_photo_url' => 'https://storage.fixo.com.vn/proofs/delivery_photo.jpg',
            'proof_caption'   => 'Khách ký biên bản nhận máy',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'delivered');

        // Kiểm tra RepairOrder liên quan đã tự động chuyển sang completed
        $freshOrder = $order->fresh();
        $this->assertEquals('completed', $freshOrder->status);
        $this->assertNotNull($freshOrder->handed_over_at);
        $this->assertNotNull($freshOrder->delivered_at);

        // Kiểm tra sổ bảo hành điện tử Warranty đã được tạo và kích hoạt active
        $this->assertTrue($freshOrder->warranties()->exists());
        $warranty = $freshOrder->warranties()->first();
        $this->assertEquals('active', $warranty->status);
        $this->assertEquals(now()->toDateString(), $warranty->start_date->toDateString());
        $this->assertEquals(now()->addDays(90)->toDateString(), $warranty->end_date->toDateString());

        // Kiểm tra thống kê khách hàng được tích lũy
        $freshCustomer = $customer->fresh();
        $this->assertEquals($initialOrdersCount + 1, $freshCustomer->orders_count);
        $this->assertEquals($initialSpent + (float) $order->total_price, (float) $freshCustomer->total_spent);
    }
}
