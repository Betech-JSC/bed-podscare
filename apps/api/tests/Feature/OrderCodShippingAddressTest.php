<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OrderCodShippingAddressTest extends TestCase
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
            'code'   => 'tenant_cod_' . uniqid(),
            'name'   => 'Tiệm Sửa Chữa Test COD Shipping Address',
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
            'name'      => 'Trần COD Khách Tỉnh',
            'phone'     => '098' . rand(1000000, 9999999),
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
            'issue_description'   => 'Lỗi pin tai nghe',
            'status'              => 'waiting_tech',
            'order_type'          => 'cod',
            'shipping_address'    => null,
            'total_price'         => 450000,
            'created_by_user_id'  => $this->cskhUser->id,
        ], $attributes));
    }

    /**
     * Test 1: Tạo đơn COD kèm shipping_address thành công
     */
    public function test_can_create_cod_order_with_shipping_address(): void
    {
        $payload = [
            'branch_id'          => $this->branch->id,
            'customer_name'      => 'Lê Văn Tỉnh Xa',
            'customer_phone'     => '0912345678',
            'device_model_id'    => $this->device->id,
            'issue_description'  => 'Pin chai cần thay gấp',
            'estimated_price'    => 500000,
            'order_type'         => 'cod',
            'shipping_address'   => 'Số 45 Ngõ 12 Đường Hùng Vương, TP. Việt Trì, Phú Thọ',
        ];

        $response = $this->actingAs($this->cskhUser)
            ->postJson('/api/v1/orders', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('success', true);

        $orderId = $response->json('data.id');
        $this->assertDatabaseHas('repair_orders', [
            'id'               => $orderId,
            'order_type'       => 'cod',
            'shipping_address' => 'Số 45 Ngõ 12 Đường Hùng Vương, TP. Việt Trì, Phú Thọ',
        ]);
    }

    /**
     * Test 2: Tạo đơn COD khi không có địa chỉ giao hàng (Optional)
     */
    public function test_can_create_cod_order_without_shipping_address(): void
    {
        $payload = [
            'branch_id'          => $this->branch->id,
            'customer_name'      => 'Hoàng Thị COD',
            'customer_phone'     => '0987654321',
            'device_model_id'    => $this->device->id,
            'issue_description'  => 'Mất kết nối Bluetooth',
            'estimated_price'    => 300000,
            'order_type'         => 'cod',
            'shipping_address'   => null,
        ];

        $response = $this->actingAs($this->cskhUser)
            ->postJson('/api/v1/orders', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('success', true);

        $orderId = $response->json('data.id');
        $this->assertDatabaseHas('repair_orders', [
            'id'               => $orderId,
            'order_type'       => 'cod',
            'shipping_address' => null,
        ]);
    }

    /**
     * Test 3: CSKH cập nhật địa chỉ giao hàng COD thành công
     */
    public function test_cskh_can_update_shipping_address(): void
    {
        $order = $this->createOrder([
            'order_type'       => 'cod',
            'shipping_address' => null,
        ]);

        $updatePayload = [
            'shipping_address' => 'Số 88 Trần Hưng Đạo, P. 7, TP. Đà Lạt, Lâm Đồng',
        ];

        $response = $this->actingAs($this->cskhUser)
            ->putJson("/api/v1/orders/{$order->id}", $updatePayload);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertDatabaseHas('repair_orders', [
            'id'               => $order->id,
            'shipping_address' => 'Số 88 Trần Hưng Đạo, P. 7, TP. Đà Lạt, Lâm Đồng',
        ]);
    }

    /**
     * Test 4: Admin cập nhật toàn diện đơn kèm shipping_address
     */
    public function test_admin_can_update_shipping_address_via_full_edit(): void
    {
        $order = $this->createOrder([
            'order_type'       => 'cod',
            'shipping_address' => 'Địa chỉ cũ',
        ]);

        $payload = [
            'customer_name'    => 'Trần COD Cập Nhật',
            'shipping_address' => 'Địa chỉ mới: 123 Nguyễn Thị Minh Khai, Q. 1, TP. HCM',
            'order_type'       => 'cod',
        ];

        $response = $this->actingAs($this->adminUser)
            ->putJson("/api/v1/orders/{$order->id}", $payload);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertDatabaseHas('repair_orders', [
            'id'               => $order->id,
            'shipping_address' => 'Địa chỉ mới: 123 Nguyễn Thị Minh Khai, Q. 1, TP. HCM',
        ]);
    }

    /**
     * Test 5: Kỹ thuật viên (technician) bị từ chối khi cố tình cập nhật shipping_address
     */
    public function test_technician_cannot_update_shipping_address(): void
    {
        $order = $this->createOrder([
            'order_type'       => 'cod',
            'shipping_address' => 'Địa chỉ ban đầu của CSKH',
        ]);

        $payload = [
            'shipping_address' => 'KTV muốn đổi địa chỉ',
        ];

        $response = $this->actingAs($this->techUser)
            ->putJson("/api/v1/orders/{$order->id}", $payload);

        $response->assertStatus(403)
            ->assertJsonPath('success', false);

        // Đảm bảo trong database không bị thay đổi
        $this->assertDatabaseHas('repair_orders', [
            'id'               => $order->id,
            'shipping_address' => 'Địa chỉ ban đầu của CSKH',
        ]);
    }

    /**
     * Test 6: Kỹ thuật viên cập nhật thông tin kỹ thuật bình thường thì thành công
     */
    public function test_technician_can_update_repair_note_without_shipping_address(): void
    {
        $order = $this->createOrder([
            'order_type'       => 'cod',
            'shipping_address' => 'Địa chỉ cố định',
        ]);

        $payload = [
            'repair_note' => 'Đã thay pin thành công, chờ sấy keo',
        ];

        $response = $this->actingAs($this->techUser)
            ->putJson("/api/v1/orders/{$order->id}", $payload);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertDatabaseHas('repair_orders', [
            'id'               => $order->id,
            'repair_note'      => 'Đã thay pin thành công, chờ sấy keo',
            'shipping_address' => 'Địa chỉ cố định',
        ]);
    }
}
