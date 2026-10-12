<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Part;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WarrantyClaimReworkFlowTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $adminUser;
    protected User $techUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_rwk_' . uniqid(),
            'name'   => 'Tiệm Sửa Chữa Rework',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Rework',
            'code'      => 'BR_RWK_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '456 Rework Street',
            'is_active' => true,
        ]);

        $this->customer = Customer::forceCreate([
            'tenant_id'    => $this->tenant->id,
            'name'         => 'Khách Hàng Rework',
            'phone'        => '091' . rand(1000000, 9999999),
            'orders_count' => 1,
            'total_spent'  => 500000,
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Rework',
            'email'     => 'admin_rwk_' . uniqid() . '@example.com',
            'phone'     => '098' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->techUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'KTV Rework',
            'email'     => 'tech_rwk_' . uniqid() . '@example.com',
            'phone'     => '096' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'technician',
            'is_active' => true,
        ]);
    }

    protected function createOriginalOrderAndWarranty(): array
    {
        $originalOrder = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'order_type'         => 'in_store',
            'status'             => 'completed',
            'issue_description'  => 'Thay pin AirPods',
            'serial_number'      => 'SER-TEST-' . rand(1000, 9999),
            'total_price'        => 500000,
            'initial_price'      => 500000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $warranty = Warranty::forceCreate([
            'warranty_code'   => 'WR-' . rand(10000, 99999),
            'repair_order_id' => $originalOrder->id,
            'customer_id'     => $this->customer->id,
            'device_model_id' => $this->device->id,
            'coverage_item'   => 'Bảo hành thay pin',
            'start_date'      => now()->subDays(5),
            'end_date'        => now()->addDays(85),
            'status'          => 'active',
        ]);

        return [$originalOrder, $warranty];
    }

    /**
     * Test 1: Tiếp nhận khiếu nại bảo hành tự động sinh đơn Rework loại warranty với giá 0 ₫.
     */
    public function test_create_claim_generates_rework_order_with_warranty_type_and_zero_price(): void
    {
        [$originalOrder, $warranty] = $this->createOriginalOrderAndWarranty();

        $response = $this->actingAs($this->adminUser)->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $warranty->id,
            'issue_description' => 'Tai phải bị rè sau 3 ngày',
            'resolution_mode'   => 'replace_part',
            'notes'             => 'Khách mang trực tiếp tới tiệm',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.resolution_mode', 'replace_part')
            ->assertJsonPath('data.rework_order.order_type', 'warranty')
            ->assertJsonPath('data.rework_order.status', 'waiting_tech');

        $reworkOrderId = $response->json('data.rework_order.id');
        $reworkOrder = RepairOrder::find($reworkOrderId);

        $this->assertNotNull($reworkOrder);
        $this->assertEquals(0, (float) $reworkOrder->total_price);
        $this->assertEquals(0, (float) $reworkOrder->initial_price);
        $this->assertEquals($originalOrder->id, $reworkOrder->parent_order_id);
        $this->assertEquals($originalOrder->serial_number, $reworkOrder->serial_number);
        $this->assertEquals($response->json('data.id'), $reworkOrder->claim_id);
    }

    /**
     * Test 2: Đơn Rework xuất hiện ngay trong danh sách chờ tiếp nhận của Kỹ thuật viên.
     */
    public function test_rework_order_appears_in_tech_queue(): void
    {
        [$originalOrder, $warranty] = $this->createOriginalOrderAndWarranty();

        $res = $this->actingAs($this->adminUser)->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $warranty->id,
            'issue_description' => 'Hỏng mic đàm thoại',
            'resolution_mode'   => 'send_tech',
        ]);
        $res->assertStatus(201);
        $reworkCode = $res->json('data.rework_order.order_code');

        $techRes = $this->actingAs($this->techUser)->getJson("/api/v1/orders?branch_id={$this->branch->id}&status=waiting_tech");
        $techRes->assertOk();

        $orderCodes = collect($techRes->json('data.data'))->pluck('order_code')->all();
        $this->assertContains($reworkCode, $orderCodes);
    }

    /**
     * Test 3: KTV xuất linh kiện cho đơn bảo hành nhưng tổng tiền khách trả vẫn giữ nguyên 0 ₫.
     */
    public function test_export_warranty_part_does_not_increase_customer_total_price(): void
    {
        [$originalOrder, $warranty] = $this->createOriginalOrderAndWarranty();

        $claimRes = $this->actingAs($this->adminUser)->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $warranty->id,
            'issue_description' => 'Cần thay driver loa',
            'resolution_mode'   => 'replace_part',
        ]);
        $reworkOrder = RepairOrder::find($claimRes->json('data.rework_order.id'));

        $part = Part::forceCreate([
            'tenant_id'        => $this->tenant->id,
            'name'             => 'Driver Loa AirPods Test',
            'sku'              => 'DRV-' . uniqid(),
            'category'         => 'speaker',
            'storage_location' => 'Kệ B2',
            'stock_quantity'   => 5,
            'cost_price'       => 80000,
            'retail_price'     => 200000,
        ]);

        $branchPart = BranchPart::forceCreate([
            'branch_id'       => $this->branch->id,
            'part_id'         => $part->id,
            'stock_quantity'  => 5,
            'min_stock_alert' => 1,
        ]);

        // KTV xuất linh kiện phục vụ sửa đơn rework
        $invRes = $this->actingAs($this->techUser)->postJson('/api/v1/inventory/transactions', [
            'part_id'          => $part->id,
            'branch_id'        => $this->branch->id,
            'repair_order_id'  => $reworkOrder->id,
            'transaction_type' => 'export_repair',
            'quantity'         => 1,
            'notes'            => 'Xuất driver thay thế bảo hành',
        ]);
        $invRes->assertStatus(201);

        $branchPart->refresh();
        $this->assertEquals(4, $branchPart->stock_quantity);

        $reworkOrder->refresh();
        $this->assertEquals(0, (float) $reworkOrder->total_price, 'Warranty order price must stay 0 after parts export');
    }

    /**
     * Test 4: Chặn đơn bảo hành chuyển sang ready_for_return hoặc completed nếu chưa qua kiểm định QC đạt chuẩn.
     */
    public function test_warranty_order_transition_blocked_without_qc_pass(): void
    {
        [$originalOrder, $warranty] = $this->createOriginalOrderAndWarranty();

        $claimRes = $this->actingAs($this->adminUser)->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $warranty->id,
            'issue_description' => 'Lỗi sạc',
            'resolution_mode'   => 'send_tech',
        ]);
        $reworkOrder = RepairOrder::find($claimRes->json('data.rework_order.id'));

        // Giả lập KTV đang sửa (in_repair)
        $reworkOrder->update(['status' => 'in_repair', 'technician_id' => $this->techUser->id]);

        // KTV cố chuyển sang ready_for_return khi chưa có bản ghi QC nào
        $transRes = $this->actingAs($this->techUser)->postJson("/api/v1/orders/{$reworkOrder->id}/transition", [
            'status' => 'ready_for_return',
        ]);

        $transRes->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Đơn sửa chữa bảo hành bắt buộc phải hoàn thành kiểm định QC đạt chuẩn (Pass) trước khi sẵn sàng trả máy hoặc hoàn tất.');

        // Giả lập biên bản QC thất bại (rework_needed)
        QcInspection::forceCreate([
            'tenant_id'       => $this->tenant->id,
            'repair_order_id' => $reworkOrder->id,
            'inspector_id'    => $this->adminUser->id,
            'result'          => 'rework_needed',
            'notes'           => 'Vẫn còn rè nhẹ',
        ]);

        // Thử lại vẫn bị chặn
        $transRes2 = $this->actingAs($this->techUser)->postJson("/api/v1/orders/{$reworkOrder->id}/transition", [
            'status' => 'ready_for_return',
        ]);

        $transRes2->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    /**
     * Test 5: Cho phép chuyển trạng thái sau khi đã kiểm định QC Pass.
     */
    public function test_warranty_order_transition_succeeds_when_qc_passed(): void
    {
        [$originalOrder, $warranty] = $this->createOriginalOrderAndWarranty();

        $claimRes = $this->actingAs($this->adminUser)->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $warranty->id,
            'issue_description' => 'Lỗi kết nối Bluetooth',
            'resolution_mode'   => 'send_tech',
        ]);
        $reworkOrder = RepairOrder::find($claimRes->json('data.rework_order.id'));
        $reworkOrder->update(['status' => 'in_repair', 'technician_id' => $this->techUser->id]);

        // Tạo biên bản QC Pass
        QcInspection::forceCreate([
            'tenant_id'       => $this->tenant->id,
            'repair_order_id' => $reworkOrder->id,
            'inspector_id'    => $this->adminUser->id,
            'result'          => 'pass',
            'notes'           => 'Kiểm tra âm thanh và Bluetooth đạt chuẩn',
        ]);

        $transRes = $this->actingAs($this->techUser)->postJson("/api/v1/orders/{$reworkOrder->id}/transition", [
            'status' => 'ready_for_return',
        ]);

        $transRes->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'ready_for_return');
    }

    /**
     * Test 6: Từ chối tiếp nhận claim khi sổ bảo hành đã bị thu hồi hoặc hết hạn.
     */
    public function test_cannot_create_claim_on_expired_or_revoked_warranty(): void
    {
        [$originalOrder, $warranty] = $this->createOriginalOrderAndWarranty();

        // 1. Sổ bị revoked
        $warranty->update(['status' => 'revoked', 'revoked_at' => now(), 'revoked_reason' => 'Hoàn tiền đơn']);

        $resRevoked = $this->actingAs($this->adminUser)->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $warranty->id,
            'issue_description' => 'Yêu cầu trên sổ thu hồi',
            'resolution_mode'   => 'send_tech',
        ]);

        $resRevoked->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Sổ bảo hành đã bị thu hồi do đơn hàng đã được hoàn tiền, không thể tiếp nhận khiếu nại.');

        // 2. Sổ hết hạn
        $warranty->update([
            'status'   => 'active',
            'end_date' => now()->subDays(10),
        ]);

        $resExpired = $this->actingAs($this->adminUser)->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $warranty->id,
            'issue_description' => 'Yêu cầu trên sổ hết hạn',
            'resolution_mode'   => 'send_tech',
        ]);

        $resExpired->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Sổ bảo hành đã hết hạn hoặc không còn hiệu lực để tiếp nhận khiếu nại.');
    }
}
