<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WarrantyIntakeAndCustomerHistoryTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $adminUser;
    protected User $cskhUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_test_' . uniqid(),
            'name'   => 'PodsCare Warranty Intake Test',
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
            'name'      => 'Trần Thị Bảo Hành',
            'phone'     => '0912345678',
            'email'     => 'baohanh@example.com',
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro 2',
            'category'     => 'AirPods',
            'model_code'   => 'A2931',
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Store Admin',
            'email'     => 'admin_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cskhUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Nhân viên CSKH',
            'email'     => 'cskh_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);
    }

    /**
     * Test tạo đơn tiếp nhận bảo hành với chi phí 0đ thành công.
     */
    public function test_can_create_order_with_warranty_type_and_zero_estimated_price(): void
    {
        $token = $this->cskhUser->createToken('test_token')->plainTextToken;

        $payload = [
            'branch_id'         => $this->branch->id,
            'customer_name'     => 'Trần Thị Bảo Hành',
            'customer_phone'    => '0912345678',
            'device_model_id'   => $this->device->id,
            'serial_number'     => 'WARRANTY123',
            'issue_description' => 'Bảo hành thiết bị theo chính sách FIXO',
            'estimated_price'   => 0,
            'order_type'        => 'warranty',
        ];

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/orders', $payload);

        $response->assertStatus(201);
        $response->assertJsonPath('success', true);
        $response->assertJsonPath('data.order_type', 'warranty');
        $response->assertJsonPath('data.estimated_price', 0);

        $this->assertDatabaseHas('repair_orders', [
            'tenant_id'     => $this->tenant->id,
            'order_type'    => 'warranty',
            'total_price'   => 0,
            'serial_number' => 'WARRANTY123',
        ]);
    }

    /**
     * Test tạo đơn tiếp nhận bảo hành có phát sinh phí linh kiện.
     */
    public function test_can_create_order_with_warranty_type_and_custom_price(): void
    {
        $token = $this->cskhUser->createToken('test_token')->plainTextToken;

        $payload = [
            'branch_id'         => $this->branch->id,
            'customer_name'     => 'Trần Thị Bảo Hành',
            'customer_phone'    => '0912345678',
            'device_model_id'   => $this->device->id,
            'serial_number'     => 'WARRANTY_PAID',
            'issue_description' => 'Bảo hành phát sinh thay pin hộp sạc',
            'estimated_price'   => 150000,
            'order_type'        => 'warranty',
        ];

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/orders', $payload);

        $response->assertStatus(201);
        $response->assertJsonPath('data.order_type', 'warranty');
        $response->assertJsonPath('data.estimated_price', 150000);
    }

    /**
     * Test không cho phép tạo đơn với giá âm (< 0).
     */
    public function test_cannot_create_order_with_negative_price(): void
    {
        $token = $this->cskhUser->createToken('test_token')->plainTextToken;

        $payload = [
            'branch_id'         => $this->branch->id,
            'customer_name'     => 'Khách lỗi giá',
            'customer_phone'    => '0900000001',
            'device_model_id'   => $this->device->id,
            'issue_description' => 'Lỗi giá âm',
            'estimated_price'   => -50000,
            'order_type'        => 'warranty',
        ];

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/orders', $payload);

        $response->assertStatus(422);
    }

    /**
     * Test Admin có thể cập nhật loại đơn thành warranty và tổng tiền 0đ.
     */
    public function test_admin_can_update_order_to_warranty_and_zero_total_price(): void
    {
        $order = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . rand(1000, 9999),
            'status'             => 'in_repair',
            'issue_description'  => 'Thay pin AirPods',
            'total_price'        => 200000,
            'initial_price'      => 200000,
            'order_type'         => 'in_store',
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $token = $this->adminUser->createToken('test_token')->plainTextToken;

        $updatePayload = [
            'order_type'  => 'warranty',
            'total_price' => 0,
            'repair_note' => 'Xác nhận bảo hành chính hãng, miễn phí linh kiện',
        ];

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson("/api/v1/orders/{$order->id}", $updatePayload);

        $response->assertStatus(200);
        $response->assertJsonPath('success', true);
        $response->assertJsonPath('data.order_type', 'warranty');
        $this->assertEquals(0, (float) $response->json('data.total_price'));

        $order->refresh();
        $this->assertEquals('warranty', $order->order_type);
        $this->assertEquals(0, (float) $order->total_price);
    }

    /**
     * Test endpoint Customer show và history trả về danh sách đơn hàng kèm thiết bị và bảo hành.
     */
    public function test_customer_show_and_history_endpoints_return_orders(): void
    {
        $order = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . rand(1000, 9999),
            'status'             => 'completed',
            'total_price'        => 0,
            'initial_price'      => 0,
            'order_type'         => 'warranty',
            'issue_description'  => 'Bảo hành âm thanh AirPods Pro 2',
            'created_by_user_id' => $this->adminUser->id,
        ]);

        Warranty::forceCreate([
            'customer_id'     => $this->customer->id,
            'repair_order_id' => $order->id,
            'device_model_id' => $this->device->id,
            'warranty_code'   => 'BH26-' . rand(1000, 9999),
            'coverage_item'   => 'Toàn bộ linh kiện và công thợ',
            'status'          => 'active',
            'start_date'      => Carbon::now()->toDateString(),
            'duration_days'   => 180,
            'end_date'        => Carbon::now()->addMonths(6)->toDateString(),
        ]);

        $token = $this->cskhUser->createToken('test_token')->plainTextToken;

        // Test GET /api/v1/customers/{id}
        $showResponse = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson("/api/v1/customers/{$this->customer->id}");

        $showResponse->assertStatus(200);
        $showResponse->assertJsonPath('success', true);
        $showResponse->assertJsonPath('data.name', 'Trần Thị Bảo Hành');
        $this->assertNotEmpty($showResponse->json('data.repair_orders'));

        // Test GET /api/v1/customers/{id}/history
        $histResponse = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson("/api/v1/customers/{$this->customer->id}/history");

        $histResponse->assertStatus(200);
        $histResponse->assertJsonPath('success', true);
        $this->assertNotEmpty($histResponse->json('data.data'));
    }
}
