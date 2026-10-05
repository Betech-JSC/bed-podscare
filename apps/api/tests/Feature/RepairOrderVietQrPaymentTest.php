<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\SepayTransaction;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RepairOrderVietQrPaymentTest extends TestCase
{
    use DatabaseTransactions;

    protected string $webhookSecret;
    protected User $cashierUser;
    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;

    protected function setUp(): void
    {
        parent::setUp();

        $this->webhookSecret = config('sepay.webhook_secret') ?? 'fixo_secret_sepay_platform_2026';

        $this->tenant = Tenant::create([
            'code'   => 'tenant_qr_' . uniqid(),
            'name'   => 'Tiệm Sửa Chữa VietQR',
            'status' => 'active',
            'plan'   => 'standard',
        ]);

        $this->branch = Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Q1',
            'code'      => 'Q1_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Lê Lợi',
            'is_active' => true,
        ]);

        $this->customer = Customer::first() ?? Customer::create([
            'name'  => 'Khách Hàng QR',
            'phone' => '090' . rand(1000000, 9999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro',
            'model_code' => 'A2084_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->cashierUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Thu Ngân Quầy',
            'email'     => 'cashier_' . uniqid() . '@example.com',
            'phone'     => '098' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);
    }

    private function createOrder(string $status = 'ready_for_return', float $price = 350000): RepairOrder
    {
        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);

        return RepairOrder::create([
            'tenant_id'           => $this->tenant->id,
            'order_code'          => "FX{$year}-T{$randomNum}",
            'branch_id'           => $this->branch->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->device->id,
            'issue_description'   => 'Thay pin AirPods',
            'status'              => $status,
            'total_price'         => $price,
            'created_by_user_id'  => $this->cashierUser->id,
            'technician_id'       => $this->cashierUser->id,
        ]);
    }

    /**
     * Test 1: Tạo phiếu thu bank_transfer phải lưu trạng thái ban đầu là 'pending'.
     */
    public function test_bank_transfer_payment_creates_with_pending_status(): void
    {
        $order = $this->createOrder();

        $response = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 350000,
            'payment_method'  => 'bank_transfer',
            'notes'           => 'Khách thanh toán chuyển khoản qua VietQR',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'pending');

        $paymentId = $response->json('data.id');
        $payment = Payment::findOrFail($paymentId);
        $this->assertEquals('pending', $payment->status);
        $this->assertNull($payment->paid_at);
    }

    /**
     * Test 2: Tạo phiếu thu cash (tiền mặt) lưu trạng thái 'paid' ngay lập tức.
     */
    public function test_cash_payment_creates_with_paid_status(): void
    {
        $order = $this->createOrder();

        $response = $this->actingAs($this->cashierUser, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 350000,
            'payment_method'  => 'cash',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'paid');

        $paymentId = $response->json('data.id');
        $payment = Payment::findOrFail($paymentId);
        $this->assertEquals('paid', $payment->status);
        $this->assertNotNull($payment->paid_at);
    }

    /**
     * Test 3: Endpoint POST /api/v1/payments/{id}/vietqr sinh URL ảnh VietQR kèm mã đơn sửa chữa.
     */
    public function test_vietqr_endpoint_generates_dynamic_qr_url(): void
    {
        $order = $this->createOrder();

        $payment = Payment::create([
            'payment_code'        => 'FX26-PY-TEST1',
            'repair_order_id'     => $order->id,
            'amount'              => 350000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'pending',
            'received_by_user_id' => $this->cashierUser->id,
        ]);

        $response = $this->actingAs($this->cashierUser, 'sanctum')->postJson("/api/v1/payments/{$payment->id}/vietqr");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.payment_id', $payment->id)
            ->assertJsonPath('data.order_code', $order->order_code)
            ->assertJsonPath('data.transfer_content', $order->order_code)
            ->assertJsonPath('data.amount', 350000);

        $qrUrl = $response->json('data.qr_url');
        $this->assertStringContainsString('https://qr.sepay.vn/img', $qrUrl);
        $this->assertStringContainsString($order->order_code, $qrUrl);
    }

    /**
     * Test 4: Webhook SePay ghi nhận log giao dịch FX... nhưng KHÔNG tự ý can thiệp đổi trạng thái đơn/phiếu thu (CSKH tự duyệt).
     */
    public function test_sepay_webhook_ignores_repair_orders_and_leaves_payment_pending(): void
    {
        $order = $this->createOrder('ready_for_return', 450000);

        $payment = Payment::create([
            'payment_code'        => 'FX26-PY-TEST2',
            'repair_order_id'     => $order->id,
            'amount'              => 450000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'pending',
            'received_by_user_id' => $this->cashierUser->id,
        ]);

        $sepayTxId = 'TXN_REPAIR_' . uniqid();

        $response = $this->withHeaders([
            'SePay-Api-Key' => $this->webhookSecret,
        ])->postJson('/api/v1/webhooks/sepay', [
            'id'              => $sepayTxId,
            'content'         => "Thanh toan don {$order->order_code} VietQR",
            'transferAmount'  => 450000,
            'accountNumber'   => '0388960848',
            'gateway'         => 'MBBank',
            'transactionDate' => now()->toDateTimeString(),
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        // Kiểm tra Payment VẪN giữ status pending, không bị SePay tự động can thiệp
        $payment->refresh();
        $this->assertEquals('pending', $payment->status);
        $this->assertNull($payment->paid_at);

        // Kiểm tra RepairOrder VẪN giữ status ready_for_return
        $order->refresh();
        $this->assertEquals('ready_for_return', $order->status);

        // Kiểm tra bảng sepay_transactions vẫn lưu vết giao dịch
        $this->assertDatabaseHas('sepay_transactions', [
            'sepay_transaction_id' => $sepayTxId,
            'reference_code'       => $order->order_code,
            'amount'               => 450000,
        ]);
    }

    /**
     * Test 5: Webhook SePay ghi nhận giao dịch chuyển khoản thiếu tiền cho mã đơn FX an toàn mà không đổi trạng thái đơn.
     */
    public function test_sepay_webhook_records_partial_amount_safely_without_altering_order(): void
    {
        $order = $this->createOrder('ready_for_return', 500000);

        $payment = Payment::create([
            'payment_code'        => 'FX26-PY-TEST3',
            'repair_order_id'     => $order->id,
            'amount'              => 500000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'pending',
            'received_by_user_id' => $this->cashierUser->id,
        ]);

        $sepayTxId = 'TXN_UNDERPAID_' . uniqid();

        $response = $this->withHeaders([
            'SePay-Api-Key' => $this->webhookSecret,
        ])->postJson('/api/v1/webhooks/sepay', [
            'id'             => $sepayTxId,
            'content'        => "Thanh toan don {$order->order_code}",
            'transferAmount' => 200000, // Thiếu 300k
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $payment->refresh();
        $this->assertEquals('pending', $payment->status);

        $order->refresh();
        $this->assertEquals('ready_for_return', $order->status);

        $this->assertDatabaseHas('sepay_transactions', [
            'sepay_transaction_id' => $sepayTxId,
            'reference_code'       => $order->order_code,
            'amount'               => 200000,
        ]);
    }

    /**
     * Test 6: Idempotency protection cho đơn sửa chữa (không xử lý lặp lại giao dịch).
     */
    public function test_sepay_webhook_idempotency_for_repair_orders(): void
    {
        $order = $this->createOrder('ready_for_return', 300000);

        $payment = Payment::create([
            'payment_code'        => 'FX26-PY-TEST4',
            'repair_order_id'     => $order->id,
            'amount'              => 300000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'pending',
            'received_by_user_id' => $this->cashierUser->id,
        ]);

        $sepayTxId = 'TXN_DUP_' . uniqid();
        $payload = [
            'id'             => $sepayTxId,
            'content'        => "Chuyen tien don {$order->order_code}",
            'transferAmount' => 300000,
        ];

        // Lần 1
        $res1 = $this->withHeaders(['SePay-Api-Key' => $this->webhookSecret])
            ->postJson('/api/v1/webhooks/sepay', $payload);
        $res1->assertStatus(200);

        // Lần 2 (cùng txId)
        $res2 = $this->withHeaders(['SePay-Api-Key' => $this->webhookSecret])
            ->postJson('/api/v1/webhooks/sepay', $payload);
        $res2->assertStatus(200)
            ->assertJsonPath('message', 'already_processed');
    }

    /**
     * Test 7: GET /api/v1/payments/{id} phục vụ polling trạng thái từ UI quầy thu ngân.
     */
    public function test_payment_show_endpoint_returns_payment_status(): void
    {
        $order = $this->createOrder();

        $payment = Payment::create([
            'payment_code'        => 'FX26-PY-POLL',
            'repair_order_id'     => $order->id,
            'amount'              => 350000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'pending',
            'received_by_user_id' => $this->cashierUser->id,
        ]);

        $response = $this->actingAs($this->cashierUser, 'sanctum')->getJson("/api/v1/payments/{$payment->id}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.id', $payment->id)
            ->assertJsonPath('data.status', 'pending');
    }
}
