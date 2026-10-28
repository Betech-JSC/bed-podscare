<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Partner;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\Shipment;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SecurityMultitenantAndFinancialGuardrailsTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected Branch $branchA;
    protected Branch $branchB;
    protected Customer $customerA;
    protected Customer $customerB;
    protected DeviceModel $systemDevice;
    protected User $adminA;
    protected User $cskhA;
    protected User $techA;
    protected User $qcA;
    protected User $adminB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenantA = Tenant::create([
            'code'          => 'tenant_sec_a_' . uniqid(),
            'name'          => 'Cửa Hàng Sửa Chữa A',
            'status'        => 'active',
            'plan'          => 'pro',
            'trial_ends_at' => now()->addYear(),
            'expires_at'    => now()->addYear(),
        ]);

        $this->tenantB = Tenant::create([
            'code'          => 'tenant_sec_b_' . uniqid(),
            'name'          => 'Cửa Hàng Sửa Chữa B',
            'status'        => 'active',
            'plan'          => 'pro',
            'trial_ends_at' => now()->addYear(),
            'expires_at'    => now()->addYear(),
        ]);

        $this->branchA = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh A1',
            'code'      => 'BR_A_' . uniqid(),
            'phone'     => '0901111222',
            'address'   => '100 Nguyễn Huệ, Q1',
            'is_active' => true,
        ]);

        $this->branchB = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Chi nhánh B1',
            'code'      => 'BR_B_' . uniqid(),
            'phone'     => '0903333444',
            'address'   => '200 Lê Lợi, Q1',
            'is_active' => true,
        ]);

        $this->customerA = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Khách Hàng A',
            'phone'     => '091' . rand(1000000, 9999999),
        ]);

        $this->customerB = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Khách Hàng B',
            'phone'     => '092' . rand(1000000, 9999999),
        ]);

        $this->systemDevice = DeviceModel::create([
            'tenant_id'  => null,
            'name'       => 'AirPods Pro 2 System Default',
            'model_code' => 'SYS_AP2_' . uniqid(),
            'category'   => 'AirPods',
            'is_active'  => true,
        ]);

        $this->adminA = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'Admin A',
            'email'     => 'admin_a_' . uniqid() . '@example.com',
            'phone'     => '098' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cskhA = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'CSKH A',
            'email'     => 'cskh_a_' . uniqid() . '@example.com',
            'phone'     => '097' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->techA = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'KTV A',
            'email'     => 'tech_a_' . uniqid() . '@example.com',
            'phone'     => '096' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->qcA = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'QC A',
            'email'     => 'qc_a_' . uniqid() . '@example.com',
            'phone'     => '095' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'qc',
            'is_active' => true,
        ]);

        $this->adminB = User::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'branch_id' => $this->branchB->id,
            'name'      => 'Admin B',
            'email'     => 'admin_b_' . uniqid() . '@example.com',
            'phone'     => '094' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);
    }

    protected function createOrderForTenantA(string $status = 'ready_for_return', float $price = 350000, array $extra = []): RepairOrder
    {
        return RepairOrder::withoutGlobalScopes()->forceCreate(array_merge([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA->id,
            'customer_id'        => $this->customerA->id,
            'device_model_id'    => $this->systemDevice->id,
            'order_code'         => 'FX26-A' . rand(10000, 99999),
            'issue_description'  => 'Thay pin tai nghe',
            'status'             => $status,
            'total_price'        => $price,
            'initial_price'      => $price,
            'technician_id'      => $this->techA->id,
            'created_by_user_id' => $this->cskhA->id,
        ], $extra));
    }

    protected function createOrderForTenantB(string $status = 'ready_for_return', float $price = 350000, array $extra = []): RepairOrder
    {
        return RepairOrder::withoutGlobalScopes()->forceCreate(array_merge([
            'tenant_id'          => $this->tenantB->id,
            'branch_id'          => $this->branchB->id,
            'customer_id'        => $this->customerB->id,
            'device_model_id'    => $this->systemDevice->id,
            'order_code'         => 'FX26-B' . rand(10000, 99999),
            'issue_description'  => 'Thay mic tai nghe',
            'status'             => $status,
            'total_price'        => $price,
            'initial_price'      => $price,
            'created_by_user_id' => $this->adminB->id,
        ], $extra));
    }

    /**
     * Nhóm 1.1: Chặn thu tiền vượt quá số tiền còn lại (Overpayment Guardrail) & hỗ trợ thu từng phần.
     */
    public function test_overpayment_is_rejected_and_partial_payment_completes_only_when_paid_in_full(): void
    {
        $order = $this->createOrderForTenantA('ready_for_return', 350000);

        // 1. Thu vượt tổng tiền (500,000 > 350,000) -> 422
        $resOver = $this->actingAs($this->cskhA, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 500000,
            'payment_method'  => 'cash',
        ]);
        $resOver->assertStatus(422)->assertJsonPath('success', false);

        // 2. Thu 1 phần (200,000 / 350,000) -> 201, đơn vẫn ở ready_for_return
        $resPartial1 = $this->actingAs($this->cskhA, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 200000,
            'payment_method'  => 'cash',
        ]);
        $resPartial1->assertStatus(201)->assertJsonPath('success', true);
        $order->refresh();
        $this->assertEquals('ready_for_return', $order->status);

        // 3. Thu tiếp 200,000 (vượt số còn lại 150,000) -> 422
        $resPartialOver = $this->actingAs($this->cskhA, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 200000,
            'payment_method'  => 'cash',
        ]);
        $resPartialOver->assertStatus(422)->assertJsonPath('success', false);

        // 4. Thu đúng phần còn lại 150,000 -> 201 và tự động hoàn tất đơn
        $resPartial2 = $this->actingAs($this->cskhA, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 150000,
            'payment_method'  => 'cash',
        ]);
        $resPartial2->assertStatus(201)->assertJsonPath('success', true);
        $order->refresh();
        $this->assertEquals('completed', $order->status);
    }

    /**
     * Nhóm 1.1: Chặn tái sử dụng mã giao dịch chuyển khoản (Duplicate transaction_ref) trong cùng Tenant.
     */
    public function test_duplicate_transaction_ref_is_blocked_within_same_tenant_but_allowed_across_tenants(): void
    {
        $orderA1 = $this->createOrderForTenantA('ready_for_return', 300000);
        $orderA2 = $this->createOrderForTenantA('ready_for_return', 400000);
        $orderB1 = $this->createOrderForTenantB('ready_for_return', 300000);

        $txRef = 'FT26295999111';

        // Đơn 1 của Tenant A dùng mã FT26295999111 -> 201
        $resA1 = $this->actingAs($this->cskhA, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $orderA1->id,
            'amount'          => 300000,
            'payment_method'  => 'bank_transfer',
            'auto_confirm'    => true,
            'transaction_ref' => $txRef,
        ]);
        $resA1->assertStatus(201);

        // Đơn 2 của Tenant A cố tình dùng lại mã FT26295999111 -> 422
        $resA2 = $this->actingAs($this->cskhA, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $orderA2->id,
            'amount'          => 400000,
            'payment_method'  => 'bank_transfer',
            'auto_confirm'    => true,
            'transaction_ref' => $txRef,
        ]);
        $resA2->assertStatus(422)->assertJsonPath('success', false);

        // Đơn của Tenant B dùng mã FT26295999111 -> 201 (khác Tenant)
        $resB1 = $this->actingAs($this->adminB, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $orderB1->id,
            'amount'          => 300000,
            'payment_method'  => 'bank_transfer',
            'auto_confirm'    => true,
            'transaction_ref' => $txRef,
        ]);
        $resB1->assertStatus(201);
    }

    /**
     * Nhóm 1.2: Cổng kiểm soát thanh toán khi trả máy hoàn tất đơn (Handover Payment Gate) & cho phép đơn 0đ.
     */
    public function test_handover_payment_gate_blocks_unpaid_order_completion_and_allows_zero_price_order(): void
    {
        $unpaidOrder = $this->createOrderForTenantA('ready_for_return', 400000);

        // 1. Gọi transition sang completed khi chưa thanh toán -> 422
        $resTransition = $this->actingAs($this->cskhA, 'sanctum')->postJson("/api/v1/orders/{$unpaidOrder->id}/transition", [
            'status' => 'completed',
        ]);
        $resTransition->assertStatus(422)->assertJsonPath('success', false);
        $this->assertEquals('ready_for_return', $unpaidOrder->fresh()->status);

        // 2. Gọi cập nhật vận đơn sang delivered khi đơn chưa thanh toán -> 422
        $shipment = Shipment::create([
            'shipment_code'      => 'SHP-GATE-' . rand(1000, 9999),
            'repair_order_id'    => $unpaidOrder->id,
            'delivery_method'    => 'courier',
            'carrier_name'       => 'GHTK',
            'status'             => 'in_transit',
            'created_by_user_id' => $this->cskhA->id,
        ]);

        $resShipment = $this->actingAs($this->cskhA, 'sanctum')->putJson("/api/v1/shipments/{$shipment->id}/status", [
            'status'          => 'delivered',
            'proof_photo_url' => 'https://example.com/pod.jpg',
        ]);
        $resShipment->assertStatus(422)->assertJsonPath('success', false);
        $this->assertEquals('in_transit', $shipment->fresh()->status);
        $this->assertEquals('ready_for_return', $unpaidOrder->fresh()->status);

        // 3. Đơn bảo hành / 0đ được phép chuyển thẳng sang completed -> 200
        $zeroOrder = $this->createOrderForTenantA('ready_for_return', 0, ['order_type' => 'warranty']);
        $resZero = $this->actingAs($this->cskhA, 'sanctum')->postJson("/api/v1/orders/{$zeroOrder->id}/transition", [
            'status' => 'completed',
        ]);
        $resZero->assertStatus(200)->assertJsonPath('data.status', 'completed');
    }

    /**
     * Nhóm 1.3: Bảo toàn luồng CSKH 1-Tap Checkout (Thu tiền & Trả máy) từ waiting_qc kèm sửa giá & auto_confirm.
     */
    public function test_cskh_one_tap_checkout_from_waiting_qc_with_service_price_edit_and_auto_confirm(): void
    {
        $order = $this->createOrderForTenantA('waiting_qc', 300000);

        $res = $this->actingAs($this->cskhA, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'service_price'   => 450000,
            'amount'          => 450000,
            'payment_method'  => 'bank_transfer',
            'auto_confirm'    => true,
            'warranty_months' => 6,
            'notes'           => 'CSKH thu tiền 1 chạm từ bước chờ QC',
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'paid');

        $order->refresh();
        $this->assertEquals('completed', $order->status);
        $this->assertEquals(450000.0, (float) $order->total_price);
        $this->assertNotNull($order->handed_over_at);
        $this->assertTrue($order->qcInspections()->where('result', 'pass')->exists());
        $this->assertTrue($order->warranties()->where('status', 'active')->exists());
    }

    /**
     * Nhóm 1.4: KpiController::dashboard không tự bịa tiền mặt cho đơn completed chưa có phiếu thu.
     */
    public function test_kpi_dashboard_does_not_fabricate_cash_for_unpaid_completed_order(): void
    {
        $order = $this->createOrderForTenantA('completed', 500000, [
            'handed_over_at' => Carbon::now(),
        ]);

        $res = $this->actingAs($this->adminA, 'sanctum')->getJson('/api/v1/kpi/dashboard');
        $res->assertStatus(200);

        $breakdown = collect($res->json('data.selected_date_orders_breakdown'));
        $orderRow = $breakdown->firstWhere('id', $order->id);

        $this->assertNotNull($orderRow);
        $this->assertEquals(0.0, (float) $orderRow['collected_amount']);
        $this->assertEquals(500000.0, (float) $orderRow['uncollected_amount']);
        $this->assertEquals(0.0, (float) $orderRow['cash_amount']);
    }

    /**
     * Nhóm 2.1 & 2.2: Chặn nhảy cóc trạng thái qua PUT /api/v1/orders/{id} và PUT /api/v1/shipments/{id}/status.
     */
    public function test_order_update_and_shipment_delivered_cannot_bypass_state_machine(): void
    {
        $order = $this->createOrderForTenantA('waiting_tech', 350000);

        // 1. Admin gọi PUT /api/v1/orders/{id} nhảy cóc từ waiting_tech -> completed -> 422
        $resUpdate = $this->actingAs($this->adminA, 'sanctum')->putJson("/api/v1/orders/{$order->id}", [
            'status' => 'completed',
        ]);
        $resUpdate->assertStatus(422)->assertJsonPath('success', false);
        $this->assertEquals('waiting_tech', $order->fresh()->status);

        // 2. Vận đơn gắn với đơn đang ở waiting_tech không thể chuyển sang delivered -> 422
        $shipment = Shipment::create([
            'shipment_code'      => 'SHP-BYPASS-' . rand(1000, 9999),
            'repair_order_id'    => $order->id,
            'delivery_method'    => 'courier',
            'carrier_name'       => 'GHTK',
            'status'             => 'in_transit',
            'created_by_user_id' => $this->adminA->id,
        ]);

        $resShipment = $this->actingAs($this->adminA, 'sanctum')->putJson("/api/v1/shipments/{$shipment->id}/status", [
            'status'          => 'delivered',
            'proof_photo_url' => 'https://example.com/pod.jpg',
        ]);
        $resShipment->assertStatus(422)->assertJsonPath('success', false);
        $this->assertEquals('in_transit', $shipment->fresh()->status);
        $this->assertEquals('waiting_tech', $order->fresh()->status);
    }

    /**
     * Nhóm 3.1, 3.2, 3.3: Cô lập dữ liệu đa cửa hàng cho Partner, DeviceModel và Composite Unique theo Tenant.
     */
    public function test_multitenant_isolation_for_partners_devices_and_scoped_unique_codes(): void
    {
        // 1. Partner shipments isolation
        $partner = Partner::create([
            'code'         => 'PTN-ISO-' . uniqid(),
            'name'         => 'Đối tác Giao Nhận Liên Tỉnh',
            'service_type' => 'courier',
            'status'       => 'active',
        ]);

        $orderA = $this->createOrderForTenantA();
        $orderB = $this->createOrderForTenantB();

        Shipment::create([
            'shipment_code'      => 'SHP-A-' . uniqid(),
            'repair_order_id'    => $orderA->id,
            'partner_id'         => $partner->id,
            'delivery_method'    => 'courier',
            'carrier_name'       => 'GHTK',
            'status'             => 'pending',
            'created_by_user_id' => $this->adminA->id,
        ]);
        Shipment::create([
            'shipment_code'      => 'SHP-B1-' . uniqid(),
            'repair_order_id'    => $orderB->id,
            'partner_id'         => $partner->id,
            'delivery_method'    => 'courier',
            'carrier_name'       => 'GHTK',
            'status'             => 'pending',
            'created_by_user_id' => $this->adminB->id,
        ]);
        Shipment::create([
            'shipment_code'      => 'SHP-B2-' . uniqid(),
            'repair_order_id'    => $orderB->id,
            'partner_id'         => $partner->id,
            'delivery_method'    => 'courier',
            'carrier_name'       => 'GHTK',
            'status'             => 'pending',
            'created_by_user_id' => $this->adminB->id,
        ]);

        $resPartnerA = $this->actingAs($this->adminA, 'sanctum')->getJson("/api/v1/partners/{$partner->id}");
        $resPartnerA->assertStatus(200);
        $this->assertCount(1, $resPartnerA->json('data.shipments'));

        $resPartnerB = $this->actingAs($this->adminB, 'sanctum')->getJson("/api/v1/partners/{$partner->id}");
        $resPartnerB->assertStatus(200);
        $this->assertCount(2, $resPartnerB->json('data.shipments'));

        // 2. Bảo vệ dòng máy mặc định hệ thống (tenant_id = null) trước Admin cửa hàng
        $resEditSys = $this->actingAs($this->adminA, 'sanctum')->putJson("/api/v1/devices/{$this->systemDevice->id}", [
            'name' => 'Hack Tên Thiết Bị Hệ Thống',
        ]);
        $resEditSys->assertStatus(403);

        $resDelSys = $this->actingAs($this->adminA, 'sanctum')->deleteJson("/api/v1/devices/{$this->systemDevice->id}");
        $resDelSys->assertStatus(403);

        // 3. Hai Tenant tạo trùng mã model_code và mã chi nhánh code thành công độc lập
        $sharedModelCode = 'AP-CUSTOM-' . strtoupper(substr(uniqid(), -4));
        $resDevA = $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/devices', [
            'name'       => 'AirPods Custom A',
            'category'   => 'AirPods',
            'model_code' => $sharedModelCode,
            'checks'     => ['Kiểm tra mic'],
        ]);
        $resDevA->assertStatus(201);
        $devAId = $resDevA->json('data.id');

        $resDevB = $this->actingAs($this->adminB, 'sanctum')->postJson('/api/v1/devices', [
            'name'       => 'AirPods Custom B',
            'category'   => 'AirPods',
            'model_code' => $sharedModelCode,
            'checks'     => ['Kiểm tra loa'],
        ]);
        $resDevB->assertStatus(201);

        // Tenant B không thấy dòng máy riêng của Tenant A và không sửa/xóa được
        $devicesB = collect($this->actingAs($this->adminB, 'sanctum')->getJson('/api/v1/devices')->json('data'))->pluck('id')->all();
        $this->assertNotContains($devAId, $devicesB);
        $this->actingAs($this->adminB, 'sanctum')->deleteJson("/api/v1/devices/{$devAId}")->assertStatus(403);

        // Hai Tenant cùng đặt mã chi nhánh CN-TRUNG-TAM -> đều 201 Created
        $sharedBranchCode = 'CN-TT-' . strtoupper(substr(uniqid(), -3));
        $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/branches', [
            'code'    => $sharedBranchCode,
            'name'    => 'Chi nhánh Trung Tâm A',
            'address' => 'Số 1 Quận 1',
        ])->assertStatus(201);

        $this->actingAs($this->adminB, 'sanctum')->postJson('/api/v1/branches', [
            'code'    => $sharedBranchCode,
            'name'    => 'Chi nhánh Trung Tâm B',
            'address' => 'Số 2 Quận 3',
        ])->assertStatus(201);

        // Tạo trùng mã chi nhánh trong cùng Tenant A -> 422
        $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/branches', [
            'code'    => $sharedBranchCode,
            'name'    => 'Chi nhánh Trùng A',
            'address' => 'Số 99 Quận 1',
        ])->assertStatus(422);
    }

    /**
     * Nhóm 4: Kiểm tra QuotaService trong transaction & bảo toàn 100% chính sách dùng thử miễn phí 1 năm.
     */
    public function test_quota_enforcement_in_transaction_and_three_months_free_trial_preserved(): void
    {
        // 1. Kiểm tra đăng ký gian hàng mới được kích hoạt ngay 1 năm dùng thử (~365 ngày)
        $storeCode = 'podstore_' . strtolower(substr(uniqid(), -5));
        $resReg = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $storeCode,
            'store_name' => 'Tiệm Tai Nghe Dùng Thử 1 Năm',
            'owner_name' => 'Chủ Tiệm Mới',
            'phone'      => '090' . rand(1000000, 9999999),
            'email'      => $storeCode . '@example.com',
            'password'   => 'secret123',
        ]);

        $resReg->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant.status', 'active');

        $daysRemaining = (int) $resReg->json('data.tenant.days_remaining');
        $this->assertGreaterThanOrEqual(360, $daysRemaining);
        $this->assertNotEmpty($resReg->json('data.token'));

        // 2. Kiểm tra chặn vượt hạn mức chi nhánh cho gói trial (tối đa 1 chi nhánh)
        $this->tenantA->update(['plan' => 'trial', 'current_plan_id' => 'trial']);
        $resQuotaBranch = $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/branches', [
            'code'    => 'BR-OVER-' . rand(100, 999),
            'name'    => 'Chi nhánh Vượt Quota',
            'address' => '123 Đường Quota',
        ]);
        $resQuotaBranch->assertStatus(422)
            ->assertJsonPath('error_code', 'QUOTA_EXCEEDED_BRANCHES');
    }

    /**
     * Nhóm 5: Phân quyền RBAC chặt chẽ cho lập phiếu thu, thu hồi bảo hành và loại bỏ fallback ?? 1.
     */
    public function test_rbac_guardrails_on_payments_and_warranty_revoke_and_no_fallback_to_id_1(): void
    {
        $order = $this->createOrderForTenantA('ready_for_return', 350000);

        // 1. Kỹ thuật viên và QC không được phép lập phiếu thu -> 403
        $this->actingAs($this->techA, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 350000,
            'payment_method'  => 'cash',
        ])->assertStatus(403);

        $this->actingAs($this->qcA, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 350000,
            'payment_method'  => 'cash',
        ])->assertStatus(403);

        // 2. CSKH không được phép thu hồi sổ bảo hành, chỉ Admin được phép
        $warranty = Warranty::create([
            'warranty_code'   => 'FX26-WR-' . rand(100000, 999999),
            'repair_order_id' => $order->id,
            'customer_id'     => $this->customerA->id,
            'device_model_id' => $this->systemDevice->id,
            'coverage_item'   => 'Thay pin',
            'start_date'      => now()->toDateString(),
            'duration_days'   => 90,
            'end_date'        => now()->addDays(90)->toDateString(),
            'status'          => 'active',
        ]);

        $this->actingAs($this->cskhA, 'sanctum')
            ->postJson("/api/v1/warranties/{$warranty->id}/revoke", ['reason' => 'CSKH tự ý hủy'])
            ->assertStatus(403);

        $this->actingAs($this->adminA, 'sanctum')
            ->postJson("/api/v1/warranties/{$warranty->id}/revoke", ['reason' => 'Admin thu hồi hợp lệ'])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'revoked');

        // 3. Nhân sự chưa được gán branch_id gọi danh sách linh kiện kho -> 422 thay vì fallback sang branch_id = 1
        $staffNoBranch = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => null,
            'name'      => 'KTV Chưa Phân Chi Nhánh',
            'email'     => 'nobrc_' . uniqid() . '@example.com',
            'phone'     => '093' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->actingAs($staffNoBranch, 'sanctum')
            ->getJson('/api/v1/inventory/parts')
            ->assertStatus(422);
    }
}
