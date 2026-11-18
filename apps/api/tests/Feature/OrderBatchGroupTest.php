<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\IntakeChecklist;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OrderBatchGroupTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected Branch $branchA1;
    protected Branch $branchA2;
    protected Branch $branchB1;
    protected Customer $customerA1;
    protected Customer $customerA2;
    protected Customer $customerB1;
    protected DeviceModel $deviceModel;
    protected User $adminA;
    protected User $cskhA1;
    protected User $techA1;
    protected User $adminB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenantA = Tenant::create([
            'code'              => 'tenant_bg_a_' . uniqid(),
            'name'              => 'PodsCare Batch Group A',
            'status'            => 'active',
            'plan'              => 'pro',
            'hotline'           => '0901000111',
            'receipt_footer_note' => 'Cam kết bảo hành 90 ngày',
        ]);

        $this->tenantB = Tenant::create([
            'code'   => 'tenant_bg_b_' . uniqid(),
            'name'   => 'PodsCare Batch Group B',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branchA1 = Branch::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Q1',
            'code'      => 'Q1_' . uniqid(),
            'phone'     => '0901111111',
            'address'   => '123 Lê Lợi, Q1',
            'is_active' => true,
        ]);

        $this->branchA2 = Branch::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Q3',
            'code'      => 'Q3_' . uniqid(),
            'phone'     => '0902222222',
            'address'   => '456 Võ Văn Tần, Q3',
            'is_active' => true,
        ]);

        $this->branchB1 = Branch::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Chi nhánh Tenant B',
            'code'      => 'TB_' . uniqid(),
            'phone'     => '0903333333',
            'address'   => '789 Nguyễn Huệ',
            'is_active' => true,
        ]);

        $this->customerA1 = Customer::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Nguyễn Văn Khách A1',
            'phone'     => '091' . random_int(1000000, 9999999),
        ]);

        $this->customerA2 = Customer::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Trần Thị Khách A2',
            'phone'     => '092' . random_int(1000000, 9999999),
        ]);

        $this->customerB1 = Customer::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Khách Tenant B',
            'phone'     => '093' . random_int(1000000, 9999999),
        ]);

        $this->deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro 2',
            'category'     => 'AirPods',
            'model_code'   => 'A2931_' . uniqid(),
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);

        $this->adminA = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'Admin A',
            'email'     => 'admin_a_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cskhA1 = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'CSKH Q1',
            'email'     => 'cskh_a1_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->techA1 = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'KTV Q1',
            'email'     => 'tech_a1_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->adminB = User::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'branch_id' => $this->branchB1->id,
            'name'      => 'Admin B',
            'email'     => 'admin_b_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);
    }

    private function createOrder(
        Tenant $tenant,
        Branch $branch,
        Customer $customer,
        User $creator,
        ?string $batchCode = null,
        ?User $technician = null
    ): RepairOrder {
        return RepairOrder::forceCreate([
            'tenant_id'           => $tenant->id,
            'order_code'          => 'PCBG' . strtoupper(substr(uniqid(), -6)) . random_int(10, 99),
            'intake_batch_code'   => $batchCode,
            'branch_id'           => $branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $this->deviceModel->id,
            'technician_id'       => $technician?->id,
            'issue_description'   => 'Kiểm tra pin và loa',
            'test_note'           => 'Test nhanh tại quầy OK',
            'status'              => 'waiting_tech',
            'order_type'          => 'in_store',
            'initial_price'       => 300000,
            'total_price'         => 300000,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $creator->id,
        ]);
    }

    public function test_index_and_show_eager_load_batch_orders_with_nested_relations(): void
    {
        $batchCode = 'IB26-' . strtoupper(substr(uniqid(), -6));

        $order1 = $this->createOrder($this->tenantA, $this->branchA1, $this->customerA1, $this->cskhA1, $batchCode, $this->techA1);
        $order2 = $this->createOrder($this->tenantA, $this->branchA1, $this->customerA1, $this->cskhA1, $batchCode, $this->techA1);
        $soloOrder = $this->createOrder($this->tenantA, $this->branchA1, $this->customerA1, $this->cskhA1, null);

        IntakeChecklist::create([
            'repair_order_id' => $order1->id,
            'item_name'       => 'Mic đàm thoại',
            'status'          => 'pass',
            'note'            => 'Thu âm rõ',
        ]);

        Payment::forceCreate([
            'tenant_id'           => $this->tenantA->id,
            'payment_code'        => 'PAY-' . strtoupper(uniqid()),
            'repair_order_id'     => $order2->id,
            'amount'              => 150000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $this->cskhA1->id,
        ]);

        $indexRes = $this->actingAs($this->cskhA1, 'sanctum')
            ->getJson('/api/v1/orders?per_page=50');

        $indexRes->assertStatus(200)
            ->assertJsonPath('success', true);

        $items = collect($indexRes->json('data.data'));
        $foundOrder1 = $items->firstWhere('id', $order1->id);
        $foundSolo = $items->firstWhere('id', $soloOrder->id);

        $this->assertNotNull($foundOrder1);
        $this->assertCount(2, $foundOrder1['batch_orders']);

        $batchOrder1 = collect($foundOrder1['batch_orders'])->firstWhere('id', $order1->id);
        $batchOrder2 = collect($foundOrder1['batch_orders'])->firstWhere('id', $order2->id);

        $this->assertArrayHasKey('device_model', $batchOrder1);
        $this->assertArrayHasKey('customer', $batchOrder1);
        $this->assertArrayHasKey('technician', $batchOrder1);
        $this->assertArrayHasKey('branch', $batchOrder1);
        $this->assertArrayHasKey('payments', $batchOrder2);
        $this->assertArrayHasKey('intake_checklists', $batchOrder1);
        $this->assertArrayHasKey('created_by_user', $batchOrder1);
        $this->assertArrayHasKey('tenant', $batchOrder1);
        $this->assertCount(1, $batchOrder1['intake_checklists']);
        $this->assertCount(1, $batchOrder2['payments']);
        $this->assertEquals($this->tenantA->receipt_footer_note, $batchOrder1['tenant']['receipt_footer_note']);

        $this->assertNotNull($foundSolo);
        $this->assertEmpty($foundSolo['batch_orders']);

        $showRes = $this->actingAs($this->cskhA1, 'sanctum')
            ->getJson("/api/v1/orders/{$order1->id}");

        $showRes->assertStatus(200)
            ->assertJsonPath('success', true);

        $showBatchOrders = $showRes->json('data.batch_orders');
        $this->assertCount(2, $showBatchOrders);
        $showBatch1 = collect($showBatchOrders)->firstWhere('id', $order1->id);
        $showBatch2 = collect($showBatchOrders)->firstWhere('id', $order2->id);

        $this->assertArrayHasKey('intake_checklists', $showBatch1);
        $this->assertArrayHasKey('payments', $showBatch2);
        $this->assertArrayHasKey('branch', $showBatch1);
        $this->assertArrayHasKey('technician', $showBatch1);
        $this->assertArrayHasKey('created_by_user', $showBatch1);
        $this->assertArrayHasKey('tenant', $showBatch1);
    }

    public function test_batch_group_succeeds_for_same_customer_and_branch_and_logs_audit(): void
    {
        $order1 = $this->createOrder($this->tenantA, $this->branchA1, $this->customerA1, $this->cskhA1);
        $order2 = $this->createOrder($this->tenantA, $this->branchA1, $this->customerA1, $this->cskhA1);

        $response = $this->actingAs($this->cskhA1, 'sanctum')
            ->postJson('/api/v1/orders/batch-group', [
                'order_ids' => [$order1->id, $order2->order_code],
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Đã gộp nhóm thiết bị thành công.');

        $batchCode = $response->json('data.intake_batch_code');
        $this->assertIsString($batchCode);
        $this->assertMatchesRegularExpression('/^IB26-\d{6}[A-Z0-9]{4}$/', $batchCode);
        $this->assertCount(2, $response->json('data.orders'));

        $this->assertEquals($batchCode, $order1->fresh()->intake_batch_code);
        $this->assertEquals($batchCode, $order2->fresh()->intake_batch_code);

        $this->assertDatabaseHas('audit_logs', [
            'tenant_id' => $this->tenantA->id,
            'user_id'   => $this->cskhA1->id,
            'action'    => 'Gộp nhóm đơn tiếp nhận',
        ]);

        // Re-grouping the exact same 2 orders via /repairs/batch-group keeps the existing exclusive batch code
        $reuseRes = $this->actingAs($this->cskhA1, 'sanctum')
            ->postJson('/api/v1/repairs/batch-group', [
                'order_ids' => [$order1->order_code, $order2->id],
            ]);

        $reuseRes->assertStatus(200)
            ->assertJsonPath('data.intake_batch_code', $batchCode);

        // If a 3rd order also has that batch code and only 2 are selected, a new batch code is generated
        $order3 = $this->createOrder($this->tenantA, $this->branchA1, $this->customerA1, $this->cskhA1, $batchCode);

        $splitRes = $this->actingAs($this->cskhA1, 'sanctum')
            ->postJson('/api/v1/orders/batch-group', [
                'order_ids' => [$order1->id, $order2->id],
            ]);

        $splitRes->assertStatus(200);
        $newBatchCode = $splitRes->json('data.intake_batch_code');
        $this->assertNotEquals($batchCode, $newBatchCode);
        $this->assertEquals($newBatchCode, $order1->fresh()->intake_batch_code);
        $this->assertEquals($newBatchCode, $order2->fresh()->intake_batch_code);
        $this->assertEquals($batchCode, $order3->fresh()->intake_batch_code);
    }

    public function test_batch_group_returns_422_for_invalid_count_different_customer_or_different_branch(): void
    {
        $order1 = $this->createOrder($this->tenantA, $this->branchA1, $this->customerA1, $this->cskhA1);
        $order2SameCustOtherBranch = $this->createOrder($this->tenantA, $this->branchA2, $this->customerA1, $this->adminA);
        $order3OtherCustSameBranch = $this->createOrder($this->tenantA, $this->branchA1, $this->customerA2, $this->cskhA1);

        // < 2 orders
        $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/orders/batch-group', ['order_ids' => [$order1->id]])
            ->assertStatus(422);

        // Duplicate same order via id + order_code -> < 2 unique orders
        $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/orders/batch-group', ['order_ids' => [$order1->id, $order1->order_code]])
            ->assertStatus(422);

        // Non-existent order code
        $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/orders/batch-group', ['order_ids' => [$order1->id, 'PC-NOT-EXIST-999']])
            ->assertStatus(422);

        // Different customers
        $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/orders/batch-group', ['order_ids' => [$order1->id, $order3OtherCustSameBranch->id]])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Chỉ có thể gộp các đơn của cùng một khách hàng.');

        // Different branches (admin can access both branches, fails same-branch validation)
        $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/orders/batch-group', ['order_ids' => [$order1->id, $order2SameCustOtherBranch->id]])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Chỉ có thể gộp các đơn trong cùng một chi nhánh.');
    }

    public function test_batch_group_rejects_technician_with_403_and_blocks_cross_branch_and_cross_tenant(): void
    {
        $orderA1 = $this->createOrder($this->tenantA, $this->branchA1, $this->customerA1, $this->cskhA1);
        $orderA2 = $this->createOrder($this->tenantA, $this->branchA1, $this->customerA1, $this->cskhA1);
        $orderBranchA2 = $this->createOrder($this->tenantA, $this->branchA2, $this->customerA1, $this->adminA);
        $orderTenantB = $this->createOrder($this->tenantB, $this->branchB1, $this->customerB1, $this->adminB);

        // Technician -> 403
        $this->actingAs($this->techA1, 'sanctum')
            ->postJson('/api/v1/orders/batch-group', ['order_ids' => [$orderA1->id, $orderA2->id]])
            ->assertStatus(403);

        $this->actingAs($this->techA1, 'sanctum')
            ->postJson('/api/v1/repairs/batch-group', ['order_ids' => [$orderA1->id, $orderA2->id]])
            ->assertStatus(403);

        // Cross-branch CSKH (branchA1 CSKH accessing branchA2 order) -> 403
        $this->actingAs($this->cskhA1, 'sanctum')
            ->postJson('/api/v1/orders/batch-group', ['order_ids' => [$orderA1->id, $orderBranchA2->id]])
            ->assertStatus(403);

        // Cross-tenant (tenantA admin trying to include tenantB order) -> 422 & tenantB untouched
        $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/orders/batch-group', ['order_ids' => [$orderA1->id, $orderTenantB->id]])
            ->assertStatus(422);

        $this->assertNull($orderTenantB->fresh()->intake_batch_code);
        $this->assertNull($orderA1->fresh()->intake_batch_code);
    }
}
