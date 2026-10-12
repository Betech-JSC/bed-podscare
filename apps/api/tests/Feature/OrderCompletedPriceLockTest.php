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

class OrderCompletedPriceLockTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $adminUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_lock_' . uniqid(),
            'name'   => 'Tiệm Khóa Giá Test',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Khóa Giá',
            'code'      => 'BR_LOCK_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Lock St',
            'is_active' => true,
        ]);

        $this->customer = Customer::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Khóa Giá',
            'phone'     => '090' . rand(1000000, 9999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Quản Lý',
            'email'     => 'admin_lock_' . uniqid() . '@example.com',
            'phone'     => '098' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);
    }

    protected function createOrder(string $status, float $price = 500000): RepairOrder
    {
        return RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'issue_description'  => 'Thay pin',
            'status'             => $status,
            'total_price'        => $price,
            'initial_price'      => $price,
            'created_by_user_id' => $this->adminUser->id,
        ]);
    }

    public function test_cannot_update_total_price_on_completed_order(): void
    {
        $this->actingAs($this->adminUser);
        $order = $this->createOrder('completed', 500000);

        $response = $this->putJson("/api/v1/orders/{$order->id}", [
            'total_price' => 600000,
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);

        $order->refresh();
        $this->assertEquals(500000, (float) $order->total_price);
    }

    public function test_cannot_update_initial_price_on_completed_order(): void
    {
        $this->actingAs($this->adminUser);
        $order = $this->createOrder('completed', 500000);

        $response = $this->putJson("/api/v1/orders/{$order->id}", [
            'initial_price' => 450000,
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);

        $order->refresh();
        $this->assertEquals(500000, (float) $order->initial_price);
    }

    public function test_cannot_update_estimated_price_to_different_value_on_completed_order(): void
    {
        $this->actingAs($this->adminUser);
        $order = $this->createOrder('completed', 500000);

        $response = $this->putJson("/api/v1/orders/{$order->id}", [
            'estimated_price' => 700000,
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_can_update_metadata_notes_accessories_on_completed_order(): void
    {
        $this->actingAs($this->adminUser);
        $order = $this->createOrder('completed', 500000);

        $response = $this->putJson("/api/v1/orders/{$order->id}", [
            'accessories'       => 'Hộp sạc, cáp Lightning',
            'appearance_notes'  => 'Trầy xước nhẹ viền',
            'test_note'         => 'Kiểm tra hoạt động tốt trước bàn giao',
            'total_price'       => 500000,
            'initial_price'     => 500000,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $order->refresh();
        $this->assertEquals('Hộp sạc, cáp Lightning', $order->accessories);
        $this->assertEquals('Trầy xước nhẹ viền', $order->appearance_notes);
        $this->assertEquals('Kiểm tra hoạt động tốt trước bàn giao', $order->test_note);
        $this->assertEquals(500000, (float) $order->total_price);
    }

    public function test_can_update_price_on_uncompleted_order_in_repair(): void
    {
        $this->actingAs($this->adminUser);
        $order = $this->createOrder('in_repair', 500000);

        $response = $this->putJson("/api/v1/orders/{$order->id}", [
            'total_price' => 650000,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $order->refresh();
        $this->assertEquals(650000, (float) $order->total_price);
    }

    public function test_can_update_price_on_uncompleted_order_ready_for_return(): void
    {
        $this->actingAs($this->adminUser);
        $order = $this->createOrder('ready_for_return', 500000);

        $response = $this->putJson("/api/v1/orders/{$order->id}", [
            'total_price' => 450000,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $order->refresh();
        $this->assertEquals(450000, (float) $order->total_price);
    }
}
