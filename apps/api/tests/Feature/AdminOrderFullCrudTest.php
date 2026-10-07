<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\IntakeChecklist;
use App\Models\IntakePhoto;
use App\Models\Notification;
use App\Models\Payment;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\RepairQuote;
use App\Models\Shipment;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminOrderFullCrudTest extends TestCase
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
            'code'   => 'tenant_test_' . uniqid(),
            'name'   => 'Tiệm Sửa Chữa Test Admin CRUD',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Q1',
            'code'      => 'Q1_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Lê Lợi',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Nguyễn Văn Test',
            'phone'     => '091' . rand(1000000, 9999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Store Admin',
            'email'     => 'admin_' . uniqid() . '@example.com',
            'phone'     => '098' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cskhUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Nhân Viên CSKH',
            'email'     => 'cskh_' . uniqid() . '@example.com',
            'phone'     => '097' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->techUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Kỹ Thuật Viên',
            'email'     => 'tech_' . uniqid() . '@example.com',
            'phone'     => '096' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'technician',
            'is_active' => true,
        ]);
    }

    private function createOrder(array $attributes = []): RepairOrder
    {
        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);

        return RepairOrder::create(array_merge([
            'tenant_id'           => $this->tenant->id,
            'order_code'          => "FX{$year}-T{$randomNum}",
            'branch_id'           => $this->branch->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->device->id,
            'issue_description'   => 'Lỗi pin',
            'status'              => 'waiting_tech',
            'order_type'          => 'in_store',
            'total_price'         => 350000,
            'created_by_user_id'  => $this->adminUser->id,
        ], $attributes));
    }

    /**
     * Test 1: Tạo đơn với order_type là 'in_store' và 'cod' thành công.
     */
    public function test_can_create_order_with_in_store_and_cod_type(): void
    {
        // Tạo đơn in_store
        $resInStore = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/orders', [
            'branch_id'         => $this->branch->id,
            'customer_name'     => 'Khách Tại Quầy',
            'customer_phone'    => '0901112233',
            'device_model_id'   => $this->device->id,
            'issue_description' => 'Mất âm thanh tai phải',
            'estimated_price'   => 400000,
            'order_type'        => 'in_store',
        ]);

        $resInStore->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.order_type', 'in_store');

        $inStoreOrder = RepairOrder::find($resInStore->json('data.id'));
        $this->assertTrue($inStoreOrder->isInStore());
        $this->assertFalse($inStoreOrder->isCod());

        // Tạo đơn COD
        $resCod = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/orders', [
            'branch_id'         => $this->branch->id,
            'customer_name'     => 'Khách Tỉnh COD',
            'customer_phone'    => '0908889900',
            'device_model_id'   => $this->device->id,
            'issue_description' => 'Chai pin hộp sạc gửi từ Đà Nẵng',
            'estimated_price'   => 500000,
            'order_type'        => 'cod',
        ]);

        $resCod->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.order_type', 'cod');

        $codOrder = RepairOrder::find($resCod->json('data.id'));
        $this->assertTrue($codOrder->isCod());
        $this->assertFalse($codOrder->isInStore());
    }

    /**
     * Test 2: Bộ lọc order_type trên endpoint GET /api/v1/orders.
     */
    public function test_filter_orders_by_order_type(): void
    {
        $order1 = $this->createOrder(['order_type' => 'in_store']);
        $order2 = $this->createOrder(['order_type' => 'cod']);

        // Lọc cod
        $resCod = $this->actingAs($this->adminUser, 'sanctum')->getJson('/api/v1/orders?order_type=cod');
        $resCod->assertStatus(200);
        $codIds = collect($resCod->json('data.data'))->pluck('id')->toArray();
        $this->assertContains($order2->id, $codIds);

        // Lọc in_store
        $resInStore = $this->actingAs($this->adminUser, 'sanctum')->getJson('/api/v1/orders?order_type=in_store');
        $resInStore->assertStatus(200);
        $inStoreIds = collect($resInStore->json('data.data'))->pluck('id')->toArray();
        $this->assertContains($order1->id, $inStoreIds);
    }

    /**
     * Test 3: Admin sửa toàn diện thông tin đơn hàng thành công.
     */
    public function test_admin_can_update_order_comprehensively(): void
    {
        $order = $this->createOrder([
            'order_type'        => 'in_store',
            'issue_description' => 'Lỗi cũ',
            'total_price'       => 200000,
        ]);

        $updateData = [
            'customer_name'     => 'Tên Khách Đã Đổi',
            'customer_phone'    => '0933334444',
            'issue_description' => 'Mô tả lỗi sau khi kiểm tra kỹ lại',
            'serial_number'     => 'SN99998888',
            'total_price'       => 650000,
            'order_type'        => 'cod',
            'status'            => 'in_repair',
        ];

        $response = $this->actingAs($this->adminUser, 'sanctum')->putJson("/api/v1/orders/{$order->id}", $updateData);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.order_type', 'cod')
            ->assertJsonPath('data.serial_number', 'SN99998888')
            ->assertJsonPath('data.issue_description', 'Mô tả lỗi sau khi kiểm tra kỹ lại')
            ->assertJsonPath('data.status', 'in_repair');

        $order->refresh();
        $this->assertEquals('cod', $order->order_type);
        $this->assertEquals(650000, (float) $order->total_price);
        $this->assertEquals('Tên Khách Đã Đổi', $order->customer->name);
        $this->assertEquals('0933334444', $order->customer->phone);

        // Kiểm tra có AuditLog
        $this->assertTrue(AuditLog::where('auditable_type', 'RepairOrder')
            ->where('auditable_id', $order->id)
            ->where('action', 'Cập nhật toàn diện đơn hàng')
            ->exists());
    }

    /**
     * Test 4: Admin xóa đơn hàng thành công, dọn sạch toàn bộ dữ liệu phụ thuộc.
     */
    public function test_admin_can_safely_delete_order_and_cascade_children(): void
    {
        $order = $this->createOrder();

        // Tạo dữ liệu con
        $checklist = IntakeChecklist::create([
            'repair_order_id' => $order->id,
            'item_name'       => 'Loa ngoài',
            'status'          => 'pass',
        ]);

        $photo = IntakePhoto::create([
            'repair_order_id'     => $order->id,
            'photo_url'           => 'https://example.com/test.jpg',
            'caption'             => 'Ảnh test',
            'uploaded_by_user_id' => $this->adminUser->id,
        ]);

        $quote = RepairQuote::create([
            'quote_number'    => 'QUO-' . uniqid(),
            'repair_order_id' => $order->id,
            'total_amount'    => 300000,
            'sent_by_user_id' => $this->adminUser->id,
            'note'            => 'Báo giá test',
            'status'          => 'approved',
        ]);

        $qc = QcInspection::create([
            'tenant_id'       => $this->tenant->id,
            'repair_order_id' => $order->id,
            'inspector_id'    => $this->adminUser->id,
            'result'          => 'pass',
        ]);

        $payment = Payment::create([
            'payment_code'        => 'FX26-PY-' . rand(100, 9999),
            'repair_order_id'     => $order->id,
            'amount'              => 350000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'received_by_user_id' => $this->adminUser->id,
        ]);

        $warranty = Warranty::create([
            'warranty_code'   => 'FX26-WR-' . rand(100, 9999),
            'repair_order_id' => $order->id,
            'customer_id'     => $order->customer_id,
            'device_model_id' => $order->device_model_id,
            'coverage_item'   => 'Thay pin',
            'start_date'      => now()->toDateString(),
            'end_date'        => now()->addDays(90)->toDateString(),
            'status'          => 'active',
        ]);

        $notification = Notification::create([
            'branch_id' => $this->branch->id,
            'order_id'  => $order->id,
            'type'      => 'order_created',
            'title'     => 'Test notify',
            'message'   => 'Test message',
        ]);

        $orderId = $order->id;

        // Admin xóa đơn
        $response = $this->actingAs($this->adminUser, 'sanctum')->deleteJson("/api/v1/orders/{$orderId}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        // Kiểm tra đơn hàng và tất cả các bảng con đã bị dọn sạch
        $this->assertNull(RepairOrder::find($orderId));
        $this->assertNull(IntakeChecklist::find($checklist->id));
        $this->assertNull(IntakePhoto::find($photo->id));
        $this->assertNull(RepairQuote::find($quote->id));
        $this->assertNull(QcInspection::find($qc->id));
        $this->assertNull(Payment::find($payment->id));
        $this->assertNull(Warranty::find($warranty->id));
        $this->assertNull(Notification::find($notification->id));

        // Kiểm tra có AuditLog xóa đơn
        $this->assertTrue(AuditLog::where('auditable_type', 'RepairOrder')
            ->where('auditable_id', $orderId)
            ->where('action', 'Xóa đơn hàng')
            ->exists());
    }

    /**
     * Test 5: CSKH và KTV bị chặn (403 Forbidden) khi cố tình gọi API xóa đơn.
     */
    public function test_cskh_and_technician_are_forbidden_from_deleting_order(): void
    {
        $order = $this->createOrder();

        // CSKH xóa -> 403 Forbidden
        $resCskh = $this->actingAs($this->cskhUser, 'sanctum')->deleteJson("/api/v1/orders/{$order->id}");
        $resCskh->assertStatus(403);

        // Kỹ thuật viên xóa -> 403 Forbidden
        $resTech = $this->actingAs($this->techUser, 'sanctum')->deleteJson("/api/v1/orders/{$order->id}");
        $resTech->assertStatus(403);

        // Đơn hàng vẫn còn nguyên trong DB
        $this->assertNotNull(RepairOrder::find($order->id));
    }

    /**
     * Test 6: Thu tiền nhanh không cần QR (cả tiền mặt lẫn chuyển khoản ngoài) tự động hoàn tất đơn và kích hoạt bảo hành.
     */
    public function test_simple_checkout_cash_and_bank_transfer_without_qr(): void
    {
        // 1. Thu tiền mặt tại quầy
        $orderCash = $this->createOrder(['status' => 'ready_for_return', 'total_price' => 300000]);

        $resCash = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $orderCash->id,
            'amount'          => 300000,
            'payment_method'  => 'cash',
            'notes'           => 'Khách trả tiền mặt tại quầy',
        ]);

        $resCash->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'paid');

        $orderCash->refresh();
        $this->assertEquals('completed', $orderCash->status);
        $this->assertNotNull($orderCash->handed_over_at);
        $this->assertEquals($this->cskhUser->id, $orderCash->handed_over_by_user_id);
        $this->assertTrue($orderCash->warranties()->exists());
        $this->assertEquals('active', $orderCash->warranties()->first()->status);

        // 2. Thu chuyển khoản ngoài với auto_confirm = true (Bypass VietQR)
        $orderBank = $this->createOrder(['status' => 'ready_for_return', 'total_price' => 450000]);

        $resBank = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $orderBank->id,
            'amount'          => 450000,
            'payment_method'  => 'bank_transfer',
            'auto_confirm'    => true,
            'transaction_ref' => 'FT2610079988',
            'notes'           => 'Khách tự quét QR cá nhân của tiệm ngoài quầy',
        ]);

        $resBank->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'paid');

        $orderBank->refresh();
        $this->assertEquals('completed', $orderBank->status);
        $this->assertNotNull($orderBank->handed_over_at);
        $this->assertTrue($orderBank->warranties()->exists());
    }
}
