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

class PaymentTenantIsolationTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected Branch $branchA1;
    protected Branch $branchA2;
    protected Branch $branchB;
    protected Customer $customerA;
    protected Customer $customerB;
    protected DeviceModel $device;

    protected User $adminTenantA;
    protected User $cskhTenantA1;
    protected User $cskhTenantA2;
    protected User $adminTenantB;

    protected RepairOrder $orderA1;
    protected RepairOrder $orderA2;
    protected RepairOrder $orderB;

    protected Payment $paymentA1;
    protected Payment $paymentA2;
    protected Payment $paymentB;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Tenants
        $this->tenantA = Tenant::create([
            'code'   => 'tenant_iso_a_' . uniqid(),
            'name'   => 'Cửa Hàng Isolation A',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->tenantB = Tenant::create([
            'code'   => 'tenant_iso_b_' . uniqid(),
            'name'   => 'Cửa Hàng Isolation B',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        // 2. Branches
        $this->branchA1 = Branch::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh A - Quận 1',
            'code'      => 'BR_A1_' . uniqid(),
            'phone'     => '0901111111',
            'address'   => 'Quận 1',
            'is_active' => true,
        ]);

        $this->branchA2 = Branch::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh A - Quận 7',
            'code'      => 'BR_A2_' . uniqid(),
            'phone'     => '0902222222',
            'address'   => 'Quận 7',
            'is_active' => true,
        ]);

        $this->branchB = Branch::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Chi nhánh B',
            'code'      => 'BR_B_' . uniqid(),
            'phone'     => '0903333333',
            'address'   => 'Hà Nội',
            'is_active' => true,
        ]);

        // 3. Customers & Device
        $this->customerA = Customer::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Khách Tenant A',
            'phone'     => '0981' . rand(100000, 999999),
        ]);

        $this->customerB = Customer::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Khách Tenant B',
            'phone'     => '0982' . rand(100000, 999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);

        // 4. Users
        $this->adminTenantA = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'Admin Tenant A',
            'email'     => 'admin_a_' . uniqid() . '@example.com',
            'phone'     => '0971' . rand(100000, 999999),
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cskhTenantA1 = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'CSKH Branch 1',
            'email'     => 'cskh_a1_' . uniqid() . '@example.com',
            'phone'     => '0972' . rand(100000, 999999),
            'password'  => Hash::make('password'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->cskhTenantA2 = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA2->id,
            'name'      => 'CSKH Branch 2',
            'email'     => 'cskh_a2_' . uniqid() . '@example.com',
            'phone'     => '0973' . rand(100000, 999999),
            'password'  => Hash::make('password'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->adminTenantB = User::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'branch_id' => $this->branchB->id,
            'name'      => 'Admin Tenant B',
            'email'     => 'admin_b_' . uniqid() . '@example.com',
            'phone'     => '0974' . rand(100000, 999999),
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        // 5. Orders
        $this->orderA1 = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'customer_id'        => $this->customerA->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'issue_description'  => 'Thay pin A1',
            'status'             => 'ready_for_return',
            'total_price'        => 300000,
            'created_by_user_id' => $this->adminTenantA->id,
        ]);

        $this->orderA2 = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA2->id,
            'customer_id'        => $this->customerA->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'issue_description'  => 'Thay pin A2',
            'status'             => 'ready_for_return',
            'total_price'        => 400000,
            'created_by_user_id' => $this->adminTenantA->id,
        ]);

        $this->orderB = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenantB->id,
            'branch_id'          => $this->branchB->id,
            'customer_id'        => $this->customerB->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'issue_description'  => 'Thay loa B',
            'status'             => 'ready_for_return',
            'total_price'        => 500000,
            'created_by_user_id' => $this->adminTenantB->id,
        ]);

        // 6. Payments
        $this->paymentA1 = Payment::create([
            'payment_code'        => 'FX26-PY-' . rand(1000, 9999),
            'repair_order_id'     => $this->orderA1->id,
            'amount'              => 300000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'pending',
            'received_by_user_id' => $this->adminTenantA->id,
        ]);

        $this->paymentA2 = Payment::create([
            'payment_code'        => 'FX26-PY-' . rand(1000, 9999),
            'repair_order_id'     => $this->orderA2->id,
            'amount'              => 400000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'pending',
            'received_by_user_id' => $this->adminTenantA->id,
        ]);

        $this->paymentB = Payment::create([
            'payment_code'        => 'FX26-PY-' . rand(1000, 9999),
            'repair_order_id'     => $this->orderB->id,
            'amount'              => 500000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'pending',
            'received_by_user_id' => $this->adminTenantB->id,
        ]);
    }

    public function test_tenant_a_cannot_see_payments_of_tenant_b(): void
    {
        $this->actingAs($this->adminTenantA);

        $response = $this->getJson('/api/v1/payments');

        $response->assertStatus(200);
        $ids = collect($response->json('data.data'))->pluck('id')->all();

        $this->assertContains($this->paymentA1->id, $ids);
        $this->assertNotContains($this->paymentB->id, $ids);
    }

    public function test_tenant_a_cannot_show_payment_of_tenant_b(): void
    {
        $this->actingAs($this->adminTenantA);

        $response = $this->getJson("/api/v1/payments/{$this->paymentB->id}");

        $response->assertStatus(403);
    }

    public function test_tenant_a_cannot_vietqr_payment_of_tenant_b(): void
    {
        $this->actingAs($this->adminTenantA);

        $response = $this->postJson("/api/v1/payments/{$this->paymentB->id}/vietqr");

        $response->assertStatus(403);
    }

    public function test_tenant_a_cannot_confirm_payment_of_tenant_b(): void
    {
        $this->actingAs($this->adminTenantA);

        $response = $this->postJson("/api/v1/payments/{$this->paymentB->id}/confirm", [
            'transaction_ref' => 'REF123456',
        ]);

        $response->assertStatus(403);
    }

    public function test_non_admin_only_sees_payments_in_own_branch(): void
    {
        $this->actingAs($this->cskhTenantA1);

        $response = $this->getJson('/api/v1/payments');

        $response->assertStatus(200);
        $ids = collect($response->json('data.data'))->pluck('id')->all();

        $this->assertContains($this->paymentA1->id, $ids);
        $this->assertNotContains($this->paymentA2->id, $ids);
        $this->assertNotContains($this->paymentB->id, $ids);
    }

    public function test_non_admin_cannot_show_or_confirm_payment_of_another_branch(): void
    {
        $this->actingAs($this->cskhTenantA1);

        $showResp = $this->getJson("/api/v1/payments/{$this->paymentA2->id}");
        $showResp->assertStatus(403);

        $confirmResp = $this->postJson("/api/v1/payments/{$this->paymentA2->id}/confirm", [
            'transaction_ref' => 'REF123',
        ]);
        $confirmResp->assertStatus(403);
    }

    public function test_admin_can_see_payments_across_all_branches_in_same_tenant(): void
    {
        $this->actingAs($this->adminTenantA);

        $response = $this->getJson('/api/v1/payments');

        $response->assertStatus(200);
        $ids = collect($response->json('data.data'))->pluck('id')->all();

        $this->assertContains($this->paymentA1->id, $ids);
        $this->assertContains($this->paymentA2->id, $ids);
        $this->assertNotContains($this->paymentB->id, $ids);
    }
}
