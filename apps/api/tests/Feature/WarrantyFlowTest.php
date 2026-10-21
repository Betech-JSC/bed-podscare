<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Payment;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WarrantyFlowTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $adminUser;
    protected User $cskhUser;
    protected User $techUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_wfl_' . uniqid(),
            'name'   => 'Tiệm Sửa Chữa Warranty Flow',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Warranty Flow',
            'code'      => 'BR_WFL_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '789 Warranty Street',
            'is_active' => true,
        ]);

        $this->customer = Customer::forceCreate([
            'tenant_id'    => $this->tenant->id,
            'name'         => 'Khách Hàng Bảo Hành',
            'phone'        => '091' . random_int(1000000, 9999999),
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
            'name'      => 'Admin Warranty',
            'email'     => 'admin_wfl_' . uniqid() . '@example.com',
            'phone'     => '098' . random_int(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cskhUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'CSKH Warranty',
            'email'     => 'cskh_wfl_' . uniqid() . '@example.com',
            'phone'     => '097' . random_int(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->techUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'KTV Warranty',
            'email'     => 'tech_wfl_' . uniqid() . '@example.com',
            'phone'     => '096' . random_int(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'technician',
            'is_active' => true,
        ]);
    }

    protected function createClaimAndReworkOrder(): array
    {
        $originalOrder = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . random_int(10000, 99999),
            'order_type'         => 'in_store',
            'status'             => 'completed',
            'issue_description'  => 'Thay pin AirPods gốc',
            'serial_number'      => 'SER-WFL-' . random_int(1000, 9999),
            'total_price'        => 500000,
            'initial_price'      => 500000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $warranty = Warranty::forceCreate([
            'warranty_code'   => 'WR-' . random_int(10000, 99999),
            'repair_order_id' => $originalOrder->id,
            'customer_id'     => $this->customer->id,
            'device_model_id' => $this->device->id,
            'coverage_item'   => 'Bảo hành thay pin',
            'start_date'      => now()->subDays(10),
            'end_date'        => now()->addDays(80),
            'status'          => 'active',
        ]);

        $claimRes = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $warranty->id,
            'issue_description' => 'Pin tai trái tụt nhanh cần bảo hành',
            'resolution_mode'   => 'replace_part',
        ]);

        $claimRes->assertStatus(201);
        $claim = WarrantyClaim::findOrFail($claimRes->json('data.id'));
        $reworkOrder = RepairOrder::findOrFail($claimRes->json('data.rework_order.id'));

        return [$originalOrder, $warranty, $claim, $reworkOrder];
    }

    /**
     * Test 1: KTV hoặc CSKH hoàn thành sửa chữa đơn bảo hành (Chặng 1 -> ready_for_return) tự động tạo QcInspection (pass),
     * và Chặng 2 (ready_for_return -> completed qua transition) đóng WarrantyClaim sang resolved mà không tạo trùng Warranty hay tăng orders_count.
     */
    public function test_warranty_order_two_stage_via_transition_resolves_claim_without_duplicate_warranty(): void
    {
        [$originalOrder, $warranty, $claim, $reworkOrder] = $this->createClaimAndReworkOrder();

        $initialWarranties = Warranty::where('customer_id', $this->customer->id)->count();
        $initialOrdersCount = (int) $this->customer->fresh()->orders_count;

        // Chặng 1: KTV hoàn thành sửa chữa trực tiếp từ waiting_tech -> ready_for_return
        $stage1Res = $this->actingAs($this->techUser, 'sanctum')->postJson("/api/v1/orders/{$reworkOrder->id}/transition", [
            'status'             => 'ready_for_return',
            'repair_note'        => 'Đã thay mới cell pin bảo hành tai trái',
            'parts_used'         => 'Cell pin AirPods Pro 2',
            'final_check_result' => 'Test xả pin 2h ổn định',
        ]);

        $stage1Res->assertOk()
            ->assertJsonPath('data.status', 'ready_for_return')
            ->assertJsonPath('data.technician_id', $this->techUser->id)
            ->assertJsonPath('data.final_check_result', 'Test xả pin 2h ổn định');

        $this->assertDatabaseHas('qc_inspections', [
            'repair_order_id' => $reworkOrder->id,
            'result'          => 'pass',
        ]);

        // Chặng 2: CSKH bấm Hoàn tất (transition ready_for_return -> completed)
        $stage2Res = $this->actingAs($this->cskhUser, 'sanctum')->postJson("/api/v1/orders/{$reworkOrder->id}/transition", [
            'status' => 'completed',
        ]);

        $stage2Res->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.technician_id', $this->techUser->id);

        $reworkOrder->refresh();
        $this->assertEquals('completed', $reworkOrder->status);
        $this->assertEquals($this->techUser->id, $reworkOrder->technician_id);
        $this->assertNotNull($reworkOrder->repair_started_at);
        $this->assertNotNull($reworkOrder->repair_completed_at);
        $this->assertNotNull($reworkOrder->qc_passed_at);
        $this->assertNotNull($reworkOrder->handed_over_at);
        $this->assertEquals($this->cskhUser->id, $reworkOrder->handed_over_by_user_id);

        // WarrantyClaim tự động chuyển sang resolved
        $this->assertEquals('resolved', $claim->fresh()->status);

        // Không sinh chồng sổ bảo hành mới và không cộng trùng orders_count
        $this->assertEquals($initialWarranties, Warranty::where('customer_id', $this->customer->id)->count());
        $this->assertEquals($initialOrdersCount, (int) $this->customer->fresh()->orders_count);
    }

    /**
     * Test 2: Chặng 2 bàn giao đơn bảo hành 0 ₫ qua PaymentController::store và PaymentController::confirm.
     */
    public function test_warranty_order_stage_two_via_payment_store_and_confirm_resolves_claim(): void
    {
        [$originalOrder, $warranty, $claim, $reworkOrder] = $this->createClaimAndReworkOrder();

        // CSKH nghiệm thu Chặng 1 với technician_id được chọn
        $this->actingAs($this->cskhUser, 'sanctum')->postJson("/api/v1/orders/{$reworkOrder->id}/transition", [
            'status'             => 'ready_for_return',
            'technician_id'      => $this->techUser->id,
            'repair_note'        => 'Thay lại màng loa bảo hành',
            'parts_used'         => 'Màng loa zin',
            'final_check_result' => 'Âm thanh trong, không rè',
        ])->assertOk();

        $initialWarranties = Warranty::where('customer_id', $this->customer->id)->count();
        $initialOrdersCount = (int) $this->customer->fresh()->orders_count;

        // Chặng 2: Tạo phiếu thanh toán chuyển khoản pending rồi confirm
        $payRes = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $reworkOrder->id,
            'amount'          => 0,
            'service_price'   => 0,
            'payment_method'  => 'bank_transfer',
            'auto_confirm'    => false,
            'notes'           => 'Bàn giao bảo hành 0đ',
        ]);
        $payRes->assertStatus(201);
        $paymentId = $payRes->json('data.id');

        $confirmRes = $this->actingAs($this->cskhUser, 'sanctum')->postJson("/api/v1/payments/{$paymentId}/confirm", [
            'notes' => 'Xác nhận bàn giao máy bảo hành',
        ]);
        $confirmRes->assertOk();

        $this->assertEquals('completed', $reworkOrder->fresh()->status);
        $this->assertEquals($this->techUser->id, $reworkOrder->fresh()->technician_id);
        $this->assertEquals('resolved', $claim->fresh()->status);
        $this->assertEquals($initialWarranties, Warranty::where('customer_id', $this->customer->id)->count());
        $this->assertEquals($initialOrdersCount, (int) $this->customer->fresh()->orders_count);
    }

    /**
     * Test 3: Chặn 422 khi CSKH chuyển đơn bảo hành chưa gán KTV sang ready_for_return mà thiếu technician_id,
     * và hỗ trợ thanh toán 0 ₫ trực tiếp (cash / auto_confirm = true như CheckoutHandoverModal) ở Chặng 2.
     */
    public function test_warranty_order_blocks_unassigned_cskh_completion_and_supports_zero_vnd_cash_checkout(): void
    {
        [$originalOrder, $warranty, $claim, $reworkOrder] = $this->createClaimAndReworkOrder();

        // 1. CSKH bấm hoàn thành sửa chữa đơn bảo hành chưa gán KTV nhưng không truyền technician_id -> 422
        $blockedRes = $this->actingAs($this->cskhUser, 'sanctum')->postJson("/api/v1/orders/{$reworkOrder->id}/transition", [
            'status'      => 'ready_for_return',
            'repair_note' => 'Thử hoàn thành đơn bảo hành khi chưa chọn KTV',
        ]);
        $blockedRes->assertStatus(422)
            ->assertJsonPath('success', false);
        $this->assertDatabaseMissing('qc_inspections', [
            'repair_order_id' => $reworkOrder->id,
            'result'          => 'pass',
        ]);

        // 2. CSKH chọn KTV hợp lệ -> Chặng 1 thành công (ready_for_return) + tự động tạo QC Pass
        $stage1Res = $this->actingAs($this->cskhUser, 'sanctum')->postJson("/api/v1/orders/{$reworkOrder->id}/transition", [
            'status'             => 'ready_for_return',
            'technician_id'      => $this->techUser->id,
            'repair_note'        => 'Vệ sinh chân sạc và thay cáp sạc hộp bảo hành',
            'parts_used'         => 'Cáp sạc hộp AirPods Pro 2',
            'final_check_result' => 'Đã chạy thử, hoạt động hoàn hảo',
        ]);
        $stage1Res->assertOk()
            ->assertJsonPath('data.status', 'ready_for_return')
            ->assertJsonPath('data.technician_id', $this->techUser->id);

        $initialWarranties = Warranty::where('customer_id', $this->customer->id)->count();
        $initialOrdersCount = (int) $this->customer->fresh()->orders_count;

        // 3. Chặng 2: Thu tiền & Trả máy 0 ₫ (cash + auto_confirm = true)
        $checkoutRes = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id'     => $reworkOrder->id,
            'amount'              => 0,
            'service_price'       => 0,
            'payment_method'      => 'cash',
            'auto_confirm'        => true,
            'warranty_months'     => 3,
            'warranty_terms_days' => 90,
            'notes'               => 'Bàn giao trả máy đơn bảo hành 0 ₫ tại quầy CSKH',
        ]);
        $checkoutRes->assertStatus(201);

        $reworkOrder->refresh();
        $this->assertEquals('completed', $reworkOrder->status);
        $this->assertEquals($this->techUser->id, $reworkOrder->technician_id);
        $this->assertNotNull($reworkOrder->repair_started_at);
        $this->assertNotNull($reworkOrder->repair_completed_at);
        $this->assertNotNull($reworkOrder->qc_passed_at);
        $this->assertNotNull($reworkOrder->handed_over_at);
        $this->assertEquals($this->cskhUser->id, $reworkOrder->handed_over_by_user_id);

        $this->assertEquals('resolved', $claim->fresh()->status);
        $this->assertEquals($initialWarranties, Warranty::where('customer_id', $this->customer->id)->count());
        $this->assertEquals($initialOrdersCount, (int) $this->customer->fresh()->orders_count);
    }
}
