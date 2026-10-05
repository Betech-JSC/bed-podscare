<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PaymentManualConfirmTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $cskhUser;
    protected User $adminUser;
    protected User $cashierUser;
    protected User $techUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'                => 'tenant_confirm_' . uniqid(),
            'name'                => 'Tiệm Cầm Tay CSKH',
            'status'              => 'active',
            'plan'                => 'standard',
            'bank_code'           => 'VCB',
            'bank_account_number' => '0123456789',
            'bank_account_holder' => 'CHU TIEM PODSCARE',
        ]);

        $this->branch = Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Q1',
            'code'      => 'BR_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Lê Lợi',
            'is_active' => true,
        ]);

        $this->customer = Customer::first() ?? Customer::create([
            'name'  => 'Khách Hàng Manual Confirm',
            'phone' => '090' . rand(1000000, 9999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->cskhUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Nhân Viên CSKH',
            'email'     => 'cskh_' . uniqid() . '@example.com',
            'phone'     => '098' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chủ Tiệm Admin',
            'email'     => 'admin_' . uniqid() . '@example.com',
            'phone'     => '097' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cashierUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Thu Ngân Quầy',
            'email'     => 'cashier_' . uniqid() . '@example.com',
            'phone'     => '096' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'cashier',
            'is_active' => true,
        ]);

        $this->techUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Kỹ Thuật Viên',
            'email'     => 'tech_' . uniqid() . '@example.com',
            'phone'     => '095' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'technician',
            'is_active' => true,
        ]);
    }

    private function createOrderAndPayment(string $paymentStatus = 'pending', float $price = 450000): array
    {
        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);

        $order = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'order_code'         => "FX{$year}-T{$randomNum}",
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'issue_description'  => 'Sửa loa trong AirPods',
            'status'             => 'ready_for_return',
            'total_price'        => $price,
            'created_by_user_id' => $this->cskhUser->id,
            'technician_id'      => $this->techUser->id,
        ]);

        $payment = Payment::create([
            'payment_code'        => "FX{$year}-PY-{$randomNum}",
            'repair_order_id'     => $order->id,
            'amount'              => $price,
            'payment_method'      => 'bank_transfer',
            'status'              => $paymentStatus,
            'paid_at'             => $paymentStatus === 'paid' ? now() : null,
            'received_by_user_id' => $this->cskhUser->id,
        ]);

        return [$order, $payment];
    }

    /**
     * Test 1: CSKH duyệt thanh toán pending -> paid thành công, hoàn tất đơn sửa chữa và ghi AuditLog.
     */
    public function test_cskh_can_confirm_pending_payment_and_complete_order(): void
    {
        [$order, $payment] = $this->createOrderAndPayment('pending', 520000);

        $response = $this->actingAs($this->cskhUser, 'sanctum')->postJson("/api/v1/payments/{$payment->id}/confirm", [
            'transaction_ref' => 'MB_FT_99887766',
            'notes'           => 'Khách chuyển khoản đúng nội dung vào VCB tiệm',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Duyệt thanh toán thành công.')
            ->assertJsonPath('data.id', $payment->id)
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.transaction_ref', 'MB_FT_99887766');

        // Kiểm tra Payment
        $payment->refresh();
        $this->assertEquals('paid', $payment->status);
        $this->assertNotNull($payment->paid_at);
        $this->assertEquals($this->cskhUser->id, $payment->received_by_user_id);
        $this->assertEquals('MB_FT_99887766', $payment->transaction_ref);
        $this->assertEquals('Khách chuyển khoản đúng nội dung vào VCB tiệm', $payment->notes);

        // Kiểm tra RepairOrder hoàn tất
        $order->refresh();
        $this->assertEquals('completed', $order->status);
        $this->assertNotNull($order->handed_over_at);
        $this->assertEquals($this->cskhUser->id, $order->handed_over_by_user_id);

        // Kiểm tra AuditLog
        $this->assertDatabaseHas('audit_logs', [
            'auditable_type' => 'Payment',
            'auditable_id'   => $payment->id,
            'action'         => 'Duyệt thanh toán',
            'user_id'        => $this->cskhUser->id,
        ]);
    }

    /**
     * Test 2: Admin và Thu ngân cũng có quyền duyệt thanh toán pending.
     */
    public function test_admin_and_cashier_can_also_confirm_payment(): void
    {
        // 2a. Admin duyệt
        [$orderA, $paymentA] = $this->createOrderAndPayment('pending', 300000);
        $resAdmin = $this->actingAs($this->adminUser, 'sanctum')->postJson("/api/v1/payments/{$paymentA->id}/confirm");
        $resAdmin->assertStatus(200)->assertJsonPath('data.status', 'paid');
        $this->assertEquals('paid', $paymentA->fresh()->status);

        // 2b. Cashier duyệt
        [$orderB, $paymentB] = $this->createOrderAndPayment('pending', 400000);
        $resCashier = $this->actingAs($this->cashierUser, 'sanctum')->postJson("/api/v1/payments/{$paymentB->id}/confirm");
        $resCashier->assertStatus(200)->assertJsonPath('data.status', 'paid');
        $this->assertEquals('paid', $paymentB->fresh()->status);
    }

    /**
     * Test 3: Kỹ thuật viên không có thẩm quyền duyệt thanh toán (403 Forbidden).
     */
    public function test_technician_is_forbidden_from_confirming_payment(): void
    {
        [$order, $payment] = $this->createOrderAndPayment('pending', 350000);

        $response = $this->actingAs($this->techUser, 'sanctum')->postJson("/api/v1/payments/{$payment->id}/confirm");

        $response->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Bạn không có quyền duyệt thanh toán này.');

        $payment->refresh();
        $this->assertEquals('pending', $payment->status);
    }

    /**
     * Test 4: Chặn duyệt thanh toán đã paid (HTTP 422 Unprocessable Entity).
     */
    public function test_confirming_already_paid_payment_returns_422(): void
    {
        [$order, $payment] = $this->createOrderAndPayment('paid', 500000);

        $response = $this->actingAs($this->cskhUser, 'sanctum')->postJson("/api/v1/payments/{$payment->id}/confirm");

        $response->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Phiếu thanh toán này đã được duyệt thanh toán trước đó.');
    }

    /**
     * Test 5: Chặn duyệt phiếu thanh toán không ở trạng thái pending (ví dụ cancelled).
     */
    public function test_confirming_cancelled_payment_returns_422(): void
    {
        [$order, $payment] = $this->createOrderAndPayment('cancelled', 200000);

        $response = $this->actingAs($this->cskhUser, 'sanctum')->postJson("/api/v1/payments/{$payment->id}/confirm");

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    /**
     * Test 6: Sinh mã VietQR ưu tiên thông tin tài khoản ngân hàng của Tenant thuộc đơn hàng.
     */
    public function test_vietqr_endpoint_uses_tenant_bank_account_when_configured(): void
    {
        [$order, $payment] = $this->createOrderAndPayment('pending', 650000);

        $response = $this->actingAs($this->cskhUser, 'sanctum')->postJson("/api/v1/payments/{$payment->id}/vietqr");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.payment_id', $payment->id)
            ->assertJsonPath('data.account_number', '0123456789')
            ->assertJsonPath('data.bank_code', 'VCB')
            ->assertJsonPath('data.account_holder', 'CHU TIEM PODSCARE')
            ->assertJsonPath('data.is_custom_bank', true);

        $qrUrl = $response->json('data.qr_url');
        $this->assertStringContainsString('acc=0123456789', $qrUrl);
        $this->assertStringContainsString('bank=VCB', $qrUrl);
        $this->assertStringContainsString('amount=650000', $qrUrl);
        $this->assertStringContainsString("des={$order->order_code}", $qrUrl);
    }

    /**
     * Test 7: Sinh mã VietQR fallback an toàn khi Tenant chưa cấu hình tài khoản ngân hàng.
     */
    public function test_vietqr_endpoint_fallbacks_when_tenant_bank_not_configured(): void
    {
        // Xóa thông tin ngân hàng của tenant
        $this->tenant->update([
            'bank_code'           => null,
            'bank_account_number' => null,
            'bank_account_holder' => null,
        ]);

        [$order, $payment] = $this->createOrderAndPayment('pending', 400000);

        $response = $this->actingAs($this->cskhUser, 'sanctum')->postJson("/api/v1/payments/{$payment->id}/vietqr");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.is_custom_bank', false);

        $message = $response->json('message');
        $this->assertStringContainsString('Cửa hàng chưa cài đặt tài khoản ngân hàng', $message);
    }

    /**
     * Test 8: Tenant Settings API lưu và trả về thông tin tài khoản ngân hàng của tiệm.
     */
    public function test_tenant_settings_can_save_and_retrieve_bank_account_info(): void
    {
        // 8a. Lưu thông tin qua POST /api/v1/tenant/settings
        $updateRes = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/tenant/settings', [
            'name'                => 'Tiệm Sửa Chữa Uy Tín',
            'bank_code'           => 'MB',
            'bank_account_number' => '0987654321',
            'bank_account_holder' => 'CONG TY TNHH PODSCARE',
        ]);

        $updateRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.bank_code', 'MB')
            ->assertJsonPath('data.bank_account_number', '0987654321')
            ->assertJsonPath('data.bank_account_holder', 'CONG TY TNHH PODSCARE');

        // 8b. Đọc lại qua GET /api/v1/tenant/settings
        $getRes = $this->actingAs($this->cskhUser, 'sanctum')->getJson('/api/v1/tenant/settings');

        $getRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.bank_code', 'MB')
            ->assertJsonPath('data.bank_account_number', '0987654321')
            ->assertJsonPath('data.bank_account_holder', 'CONG TY TNHH PODSCARE');
    }
}
