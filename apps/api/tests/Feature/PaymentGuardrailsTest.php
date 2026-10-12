<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PaymentGuardrailsTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $staffUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_guard_' . uniqid(),
            'name'   => 'Tiệm Sửa Chữa Guardrails',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Test',
            'code'      => 'BR_GUARD_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Guardrails Ave',
            'is_active' => true,
        ]);

        $this->customer = Customer::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Test',
            'phone'     => '090' . rand(1000000, 9999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->staffUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Nhân Viên Thu Ngân',
            'email'     => 'cashier_' . uniqid() . '@example.com',
            'phone'     => '098' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);
    }

    protected function createOrderWithStatus(string $status, float $price = 350000): RepairOrder
    {
        return RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'issue_description'  => 'Thay pin dock sạc',
            'status'             => $status,
            'total_price'        => $price,
            'initial_price'      => $price,
            'created_by_user_id' => $this->staffUser->id,
        ]);
    }

    public function test_can_create_payment_when_order_is_ready_for_return(): void
    {
        $this->actingAs($this->staffUser);
        $order = $this->createOrderWithStatus('ready_for_return');

        $response = $this->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 350000,
            'payment_method'  => 'cash',
            'notes'           => 'Thu tiền mặt tại quầy',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true);

        $order->refresh();
        $this->assertEquals('completed', $order->status);
        $this->assertDatabaseHas('payments', [
            'repair_order_id' => $order->id,
            'amount'          => 350000,
            'status'          => 'paid',
        ]);
    }

    public function test_can_create_payment_when_order_is_waiting_pickup(): void
    {
        $this->actingAs($this->staffUser);
        $order = $this->createOrderWithStatus('waiting_pickup');

        $response = $this->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 350000,
            'payment_method'  => 'cash',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true);

        $order->refresh();
        $this->assertEquals('completed', $order->status);
    }

    public function test_can_create_payment_when_order_is_in_repair(): void
    {
        $this->actingAs($this->staffUser);
        $order = $this->createOrderWithStatus('in_repair');

        $response = $this->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 350000,
            'payment_method'  => 'cash',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true);

        $order->refresh();
        $this->assertEquals('completed', $order->status);
        $this->assertDatabaseHas('payments', [
            'repair_order_id' => $order->id,
            'amount'          => 350000,
            'status'          => 'paid',
        ]);
    }

    public function test_cannot_create_payment_when_order_is_waiting_tech(): void
    {
        $this->actingAs($this->staffUser);
        $order = $this->createOrderWithStatus('waiting_tech');

        $response = $this->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 350000,
            'payment_method'  => 'cash',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_cannot_create_payment_when_order_is_cancelled(): void
    {
        $this->actingAs($this->staffUser);
        $order = $this->createOrderWithStatus('cancelled');

        $response = $this->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 350000,
            'payment_method'  => 'cash',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_cannot_create_payment_when_order_is_rejected(): void
    {
        $this->actingAs($this->staffUser);
        $order = $this->createOrderWithStatus('rejected');

        $response = $this->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 350000,
            'payment_method'  => 'cash',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_cannot_create_payment_when_order_is_already_completed(): void
    {
        $this->actingAs($this->staffUser);
        $order = $this->createOrderWithStatus('completed');

        $response = $this->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 350000,
            'payment_method'  => 'cash',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_cannot_create_duplicate_payment_when_paid_payment_already_exists(): void
    {
        $this->actingAs($this->staffUser);
        $order = $this->createOrderWithStatus('ready_for_return');

        Payment::create([
            'payment_code'        => 'FX26-PY-1111',
            'repair_order_id'     => $order->id,
            'amount'              => 350000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => Carbon::now(),
            'received_by_user_id' => $this->staffUser->id,
        ]);

        $response = $this->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 350000,
            'payment_method'  => 'cash',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }
}
