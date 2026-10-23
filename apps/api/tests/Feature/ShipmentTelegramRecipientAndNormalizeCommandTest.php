<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\Shipment;
use App\Models\TelegramRecipient;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ShipmentTelegramRecipientAndNormalizeCommandTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected Branch $branchA;
    protected User $adminA;
    protected User $adminB;
    protected Customer $customer;
    protected DeviceModel $deviceModel;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenantA = Tenant::create([
            'code'       => 'ship_tg_a_' . uniqid(),
            'name'       => 'Store A',
            'status'     => 'active',
            'plan'       => 'pro',
            'expires_at' => now()->addYear(),
        ]);

        $this->tenantB = Tenant::create([
            'code'       => 'ship_tg_b_' . uniqid(),
            'name'       => 'Store B',
            'status'     => 'active',
            'plan'       => 'pro',
            'expires_at' => now()->addYear(),
        ]);

        $this->branchA = Branch::create([
            'tenant_id' => $this->tenantA->id,
            'code'      => 'CN_SA_' . uniqid(),
            'name'      => 'Chi Nhánh Store A',
            'address'   => '10 Hai Bà Trưng',
            'phone'     => '0901112233',
            'is_active' => true,
        ]);

        $this->adminA = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'Admin Store A',
            'email'     => 'admin_sa_' . uniqid() . '@podscare.vn',
            'phone'     => '091' . rand(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->adminB = User::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'branch_id' => null,
            'name'      => 'Admin Store B',
            'email'     => 'admin_sb_' . uniqid() . '@podscare.vn',
            'phone'     => '092' . rand(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Khách Giao Vận',
            'phone'     => '093' . rand(1000000, 9999999),
        ]);

        $this->deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'tenant_id'   => $this->tenantA->id,
            'name'        => 'AirPods Max',
            'category'    => 'AirPods',
            'model_code'  => 'A2096_' . uniqid(),
            'description' => 'Test model',
        ]);
    }

    /**
     * 1. Guardrail bắt buộc ảnh bằng chứng (Proof of Delivery) khi PUT /api/v1/shipments/{id}/status = delivered,
     *    và tự động hoàn tất đơn sửa chữa khi cung cấp proof_photo_url hợp lệ.
     */
    public function test_shipment_delivered_requires_proof_and_auto_completes_order(): void
    {
        $order = RepairOrder::create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA->id,
            'order_code'         => 'PCSHIP_' . uniqid(),
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->deviceModel->id,
            'status'             => 'ready_for_return',
            'issue_description'  => 'Thay đệm tai AirPods Max',
            'total_price'        => 350000,
            'created_by_user_id' => $this->adminA->id,
        ]);

        \App\Models\Payment::create([
            'payment_code'        => 'PAY-SHIP-' . uniqid(),
            'repair_order_id'     => $order->id,
            'amount'              => 350000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $this->adminA->id,
        ]);

        $shipment = Shipment::create([
            'shipment_code'      => 'SH-TEST-' . uniqid(),
            'repair_order_id'    => $order->id,
            'delivery_method'    => 'courier',
            'carrier_name'       => 'GHTK',
            'tracking_code'      => 'GHTK123456',
            'delivery_address'   => '123 Lê Lợi, Q1',
            'status'             => 'in_transit',
            'created_by_user_id' => $this->adminA->id,
        ]);

        // 1. Chuyển sang delivered khi chưa có ảnh bằng chứng -> bị chặn HTTP 422
        $noProofRes = $this->actingAs($this->adminA, 'sanctum')
            ->putJson("/api/v1/shipments/{$shipment->id}/status", [
                'status' => 'delivered',
            ]);

        $noProofRes->assertStatus(422)
            ->assertJsonPath('success', false);

        // 2. Chuyển sang delivered kèm proof_photo_url -> thành công HTTP 200 và đơn chuyển sang completed
        $withProofRes = $this->actingAs($this->adminA, 'sanctum')
            ->putJson("/api/v1/shipments/{$shipment->id}/status", [
                'status'          => 'delivered',
                'proof_photo_url' => 'https://cdn.podscare.vn/proofs/pod-test.jpg',
                'notes'           => 'Khách đã nhận hàng và thanh toán COD',
            ]);

        $withProofRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'delivered');

        $order->refresh();
        $this->assertSame('completed', $order->status);
    }

    /**
     * 2. Kiểm thử PUT/DELETE /api/v1/telegram-recipients/{id} và cô lập đa gian hàng (Tenant Isolation).
     */
    public function test_telegram_recipient_update_and_delete_with_tenant_isolation(): void
    {
        $recipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => $this->branchA->id,
            'label'             => 'Quản lý Ca Sáng',
            'phone'             => '0909111222',
            'target_role'       => 'admin',
            'connect_token'     => 'adm_iso_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
        ]);

        // 1. Admin Store B không thể sửa hoặc xóa người nhận của Store A (HTTP 404)
        $this->actingAs($this->adminB, 'sanctum')
            ->putJson("/api/v1/telegram-recipients/{$recipient->id}", [
                'label' => 'Hacked Label',
            ])
            ->assertStatus(404);

        $this->actingAs($this->adminB, 'sanctum')
            ->deleteJson("/api/v1/telegram-recipients/{$recipient->id}")
            ->assertStatus(404);

        // 2. Admin Store A cập nhật hợp lệ
        $updateRes = $this->actingAs($this->adminA, 'sanctum')
            ->putJson("/api/v1/telegram-recipients/{$recipient->id}", [
                'label'            => 'Quản lý Ca Chiều',
                'telegram_chat_id' => '99887766',
                'is_active'        => false,
            ]);

        $updateRes->assertStatus(200)
            ->assertJsonPath('data.label', 'Quản lý Ca Chiều')
            ->assertJsonPath('data.telegram_chat_id', '99887766')
            ->assertJsonPath('data.is_active', false);

        // 3. Admin Store A xóa hợp lệ
        $deleteRes = $this->actingAs($this->adminA, 'sanctum')
            ->deleteJson("/api/v1/telegram-recipients/{$recipient->id}");

        $deleteRes->assertStatus(200)
            ->assertJsonPath('data.deleted_id', $recipient->id);
        $this->assertNull(TelegramRecipient::find($recipient->id));
    }

    /**
     * 3. Kiểm thử Console Command orders:normalize-codes-and-prices (--dry-run) chạy an toàn không làm thay đổi DB khi dry-run.
     */
    public function test_normalize_order_codes_and_prices_command_dry_run(): void
    {
        $order = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA->id,
            'order_code'         => 'FX26-99999',
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->deviceModel->id,
            'status'             => 'waiting_tech',
            'issue_description'  => 'Chuẩn hóa giá mồi',
            'total_price'        => 350001,
            'initial_price'      => 1,
            'created_by_user_id' => $this->adminA->id,
        ]);

        $this->artisan('orders:normalize-codes-and-prices', ['--dry-run' => true])
            ->assertExitCode(0);

        // Vì --dry-run nên dữ liệu trong DB vẫn giữ nguyên
        $order->refresh();
        $this->assertSame('FX26-99999', $order->order_code);
        $this->assertEquals(350001.0, (float) $order->total_price);
    }
}
