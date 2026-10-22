<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\InventoryTransaction;
use App\Models\Notification;
use App\Models\Part;
use App\Models\RepairOrder;
use App\Models\SaasInvoice;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MultiTenantIsolationTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(array $attributes): User
    {
        $user = new User();
        $user->forceFill($attributes);
        $user->saveQuietly();

        return $user;
    }

    private function setupTwoTenants(): array
    {
        \App\Models\SubscriptionPlan::firstOrCreate(
            ['id' => 'pro'],
            [
                'code'          => 'PRO',
                'name'          => 'Gói Chuyên Nghiệp',
                'price'         => 299000,
                'price_monthly' => 299000,
                'price_yearly'  => 2990000,
                'billing_cycle' => 'monthly',
                'is_active'     => true,
            ]
        );

        $tenantA = Tenant::create([
            'name'   => 'Store Alpha',
            'code'   => 'ALPHA',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $tenantB = Tenant::create([
            'name'   => 'Store Beta',
            'code'   => 'BETA',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $branchA1 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code'      => 'A1',
            'name'      => 'Alpha Branch 1',
            'address'   => '123 Alpha St',
            'phone'     => '0901111111',
            'is_active' => true,
        ]);

        $branchA2 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code'      => 'A2',
            'name'      => 'Alpha Branch 2',
            'address'   => '456 Alpha St',
            'phone'     => '0901111112',
            'is_active' => true,
        ]);

        $branchB1 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'code'      => 'B1',
            'name'      => 'Beta Branch 1',
            'address'   => '789 Beta St',
            'phone'     => '0902222222',
            'is_active' => true,
        ]);

        $adminA = $this->createUser([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA1->id,
            'name'      => 'Admin Alpha',
            'email'     => 'admin@alpha.test',
            'phone'     => '0911000001',
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $cskhA1 = $this->createUser([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA1->id,
            'name'      => 'CSKH Alpha 1',
            'email'     => 'cskh1@alpha.test',
            'phone'     => '0911000002',
            'password'  => Hash::make('password'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $adminB = $this->createUser([
            'tenant_id' => $tenantB->id,
            'branch_id' => $branchB1->id,
            'name'      => 'Admin Beta',
            'email'     => 'admin@beta.test',
            'phone'     => '0922000001',
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $superAdmin = $this->createUser([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA1->id,
            'name'      => 'Super Admin',
            'email'     => 'super@podscare.test',
            'phone'     => '0999999999',
            'password'  => Hash::make('password'),
            'role'      => 'super_admin',
            'is_active' => true,
        ]);

        $deviceModel = DeviceModel::firstOrCreate(
            ['model_code' => 'A2931'],
            [
                'name'     => 'AirPods Pro 2',
                'category' => 'AirPods Pro',
            ]
        );

        $customerA = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'name'      => 'Khách Hàng Alpha',
            'phone'     => '0988111222',
        ]);

        $customerB = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'name'      => 'Khách Hàng Beta',
            'phone'     => '0988333444',
        ]);

        $orderA1 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $tenantA->id,
            'order_code'         => 'PCA122102601',
            'branch_id'          => $branchA1->id,
            'customer_id'        => $customerA->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Rè tai trái',
            'status'             => 'in_repair',
            'shipping_address'   => 'Số 99 Nguyễn Huệ, Quận 1, TP.HCM',
            'repair_note'        => 'Ghi chú nội bộ KTV',
            'created_by_user_id' => $adminA->id,
        ]);

        $orderA2 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $tenantA->id,
            'order_code'         => 'PCA222102601',
            'branch_id'          => $branchA2->id,
            'customer_id'        => $customerA->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Hỏng sạc',
            'status'             => 'in_repair',
            'created_by_user_id' => $adminA->id,
        ]);

        $orderB1 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $tenantB->id,
            'order_code'         => 'PCB122102601',
            'branch_id'          => $branchB1->id,
            'customer_id'        => $customerB->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Chai pin',
            'status'             => 'in_repair',
            'created_by_user_id' => $adminB->id,
        ]);

        return compact(
            'tenantA',
            'tenantB',
            'branchA1',
            'branchA2',
            'branchB1',
            'adminA',
            'cskhA1',
            'adminB',
            'superAdmin',
            'deviceModel',
            'customerA',
            'customerB',
            'orderA1',
            'orderA2',
            'orderB1'
        );
    }

    public function test_warranties_and_claims_are_isolated_by_tenant_and_branch(): void
    {
        \Illuminate\Database\Eloquent\Model::preventLazyLoading(true);

        $ctx = $this->setupTwoTenants();
        $adminAToken = $ctx['adminA']->createToken('admin-a-warranty-test')->plainTextToken;
        $cskhA1Token = $ctx['cskhA1']->createToken('cskh-a1-warranty-test')->plainTextToken;

        $warrantyA1 = Warranty::create([
            'warranty_code'   => 'FX26-WR-100001',
            'repair_order_id' => $ctx['orderA1']->id,
            'customer_id'     => $ctx['customerA']->id,
            'device_model_id' => $ctx['deviceModel']->id,
            'coverage_item'   => 'Thay pin',
            'start_date'      => now()->toDateString(),
            'duration_days'   => 90,
            'end_date'        => now()->addDays(90)->toDateString(),
            'status'          => 'active',
        ]);

        $warrantyB1 = Warranty::create([
            'warranty_code'   => 'FX26-WR-200002',
            'repair_order_id' => $ctx['orderB1']->id,
            'customer_id'     => $ctx['customerB']->id,
            'device_model_id' => $ctx['deviceModel']->id,
            'coverage_item'   => 'Thay màng loa',
            'start_date'      => now()->toDateString(),
            'duration_days'   => 90,
            'end_date'        => now()->addDays(90)->toDateString(),
            'status'          => 'active',
        ]);

        // Admin Tenant A chỉ thấy bảo hành của Tenant A (gọi qua Bearer Token thật)
        auth()->forgetGuards();
        $res = $this->withHeader('Authorization', 'Bearer ' . $adminAToken)->getJson('/api/v1/warranties');
        $res->assertOk();
        $codes = collect($res->json('data.data'))->pluck('warranty_code')->all();
        $this->assertContains('FX26-WR-100001', $codes);
        $this->assertNotContains('FX26-WR-200002', $codes);

        // Admin Tenant A không thể tạo claim cho bảo hành của Tenant B -> 403
        auth()->forgetGuards();
        $claimRes = $this->withHeader('Authorization', 'Bearer ' . $adminAToken)->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $warrantyB1->id,
            'issue_description' => 'Lỗi lại',
            'resolution_mode'   => 'store_check',
        ]);
        $claimRes->assertStatus(403);

        // Bảo hành thuộc Chi nhánh A2 của Tenant A
        $warrantyA2 = Warranty::create([
            'warranty_code'   => 'FX26-WR-100002',
            'repair_order_id' => $ctx['orderA2']->id,
            'customer_id'     => $ctx['customerA']->id,
            'device_model_id' => $ctx['deviceModel']->id,
            'coverage_item'   => 'Thay cáp sạc',
            'start_date'      => now()->toDateString(),
            'duration_days'   => 90,
            'end_date'        => now()->addDays(90)->toDateString(),
            'status'          => 'active',
        ]);

        // CSKH Chi nhánh A1 không thể tạo claim cho bảo hành thuộc Chi nhánh A2 -> 403
        auth()->forgetGuards();
        $crossBranchClaimRes = $this->withHeader('Authorization', 'Bearer ' . $cskhA1Token)->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $warrantyA2->id,
            'issue_description' => 'Lỗi chéo chi nhánh',
            'resolution_mode'   => 'store_check',
        ]);
        $crossBranchClaimRes->assertStatus(403);

        // Tạo 3 claims: A1, A2, B1 để kiểm chứng updateClaim() và revoke() qua Bearer Token thật
        $claimA1 = \App\Models\WarrantyClaim::create([
            'claim_code'          => 'CLM-ISO-A1',
            'warranty_id'         => $warrantyA1->id,
            'issue_description'   => 'Lỗi tại A1',
            'resolution_mode'     => 'store_check',
            'status'              => 'received',
            'received_by_user_id' => $ctx['cskhA1']->id,
        ]);

        $claimA2 = \App\Models\WarrantyClaim::create([
            'claim_code'          => 'CLM-ISO-A2',
            'warranty_id'         => $warrantyA2->id,
            'issue_description'   => 'Lỗi tại A2',
            'resolution_mode'     => 'store_check',
            'status'              => 'received',
            'received_by_user_id' => $ctx['adminA']->id,
        ]);

        $claimB1 = \App\Models\WarrantyClaim::create([
            'claim_code'          => 'CLM-ISO-B1',
            'warranty_id'         => $warrantyB1->id,
            'issue_description'   => 'Lỗi tại B1',
            'resolution_mode'     => 'store_check',
            'status'              => 'received',
            'received_by_user_id' => $ctx['adminB']->id,
        ]);

        // 1. updateClaim(): Chặn chéo Tenant (Admin A cập nhật claim của Tenant B -> 403)
        auth()->forgetGuards();
        $this->withHeader('Authorization', 'Bearer ' . $adminAToken)
            ->putJson("/api/v1/warranties/claims/{$claimB1->id}", ['status' => 'resolved'])
            ->assertStatus(403);
        $this->assertSame('received', $claimB1->fresh()->status);

        // 2. updateClaim(): Chặn chéo Chi nhánh đối với nhân sự chi nhánh (CSKH A1 cập nhật claim của Chi nhánh A2 -> 403)
        auth()->forgetGuards();
        $this->withHeader('Authorization', 'Bearer ' . $cskhA1Token)
            ->patchJson("/api/v1/warranties/claims/{$claimA2->id}", ['status' => 'resolved'])
            ->assertStatus(403);
        $this->assertSame('received', $claimA2->fresh()->status);

        // 3. updateClaim(): Cho phép CSKH A1 cập nhật claim đúng chi nhánh A1 và Admin A cập nhật claim liên chi nhánh A2
        auth()->forgetGuards();
        $this->withHeader('Authorization', 'Bearer ' . $cskhA1Token)
            ->patchJson("/api/v1/warranties/claims/{$claimA1->id}", ['status' => 'in_progress'])
            ->assertOk()
            ->assertJsonPath('data.status', 'in_progress');

        auth()->forgetGuards();
        $this->withHeader('Authorization', 'Bearer ' . $adminAToken)
            ->putJson("/api/v1/warranties/claims/{$claimA2->id}", ['status' => 'resolved'])
            ->assertOk()
            ->assertJsonPath('data.status', 'resolved');

        // 4. revoke(): Chặn chéo Tenant (Admin A thu hồi sổ bảo hành của Tenant B -> 403)
        auth()->forgetGuards();
        $this->withHeader('Authorization', 'Bearer ' . $adminAToken)
            ->postJson("/api/v1/warranties/{$warrantyB1->id}/revoke", ['reason' => 'Thu hồi trái phép'])
            ->assertStatus(403);
        $this->assertSame('active', $warrantyB1->fresh()->status);

        // 5. revoke(): Chặn chéo Chi nhánh đối với nhân sự chi nhánh (CSKH A1 thu hồi sổ bảo hành của Chi nhánh A2 -> 403)
        auth()->forgetGuards();
        $this->withHeader('Authorization', 'Bearer ' . $cskhA1Token)
            ->postJson("/api/v1/warranties/{$warrantyA2->id}/revoke", ['reason' => 'CSKH thu hồi chéo chi nhánh'])
            ->assertStatus(403);
        $this->assertSame('active', $warrantyA2->fresh()->status);

        // 6. revoke(): Admin A được phép thu hồi sổ bảo hành thuộc Tenant A
        auth()->forgetGuards();
        $this->withHeader('Authorization', 'Bearer ' . $adminAToken)
            ->postJson("/api/v1/warranties/{$warrantyA2->id}/revoke", ['reason' => 'Khách hoàn tiền'])
            ->assertOk()
            ->assertJsonPath('data.status', 'revoked');
        $this->assertSame('revoked', $warrantyA2->fresh()->status);
    }

    public function test_websocket_branch_channels_enforce_tenant_and_branch_isolation(): void
    {
        $ctx = $this->setupTwoTenants();

        // Đảm bảo routes/channels.php đã được nạp
        require base_path('routes/channels.php');

        $broadcaster = \Illuminate\Support\Facades\Broadcast::driver();
        $reflection = new \ReflectionObject($broadcaster);
        $channelsProp = $reflection->getProperty('channels');
        $channelsProp->setAccessible(true);
        $channels = $channelsProp->getValue($broadcaster);

        $this->assertArrayHasKey('branch.{branchId}.orders', $channels);
        $this->assertArrayHasKey('branch.{branchId}.{role}', $channels);

        $ordersCallback = $channels['branch.{branchId}.orders'];
        $roleCallback = $channels['branch.{branchId}.{role}'];

        // 1. Admin của Tenant A truy cập được các chi nhánh thuộc Tenant A (A1, A2) nhưng bị chặn (false) khi truy cập chi nhánh của Tenant B (B1)
        $this->actingAs($ctx['adminA']);
        $this->assertTrue($ordersCallback($ctx['adminA'], $ctx['branchA1']->id));
        $this->assertTrue($ordersCallback($ctx['adminA'], $ctx['branchA2']->id));
        $this->assertFalse($ordersCallback($ctx['adminA'], $ctx['branchB1']->id));

        $this->assertTrue($roleCallback($ctx['adminA'], $ctx['branchA1']->id, 'cskh'));
        $this->assertFalse($roleCallback($ctx['adminA'], $ctx['branchB1']->id, 'cskh'));

        // 2. Nhân sự chi nhánh (CSKH A1) chỉ truy cập được đúng chi nhánh A1 và đúng role 'cskh'
        $this->actingAs($ctx['cskhA1']);
        $this->assertTrue($ordersCallback($ctx['cskhA1'], $ctx['branchA1']->id));
        $this->assertFalse($ordersCallback($ctx['cskhA1'], $ctx['branchA2']->id));
        $this->assertFalse($ordersCallback($ctx['cskhA1'], $ctx['branchB1']->id));

        $this->assertTrue($roleCallback($ctx['cskhA1'], $ctx['branchA1']->id, 'cskh'));
        $this->assertFalse($roleCallback($ctx['cskhA1'], $ctx['branchA1']->id, 'technician'));
        $this->assertFalse($roleCallback($ctx['cskhA1'], $ctx['branchA2']->id, 'cskh'));
        $this->assertFalse($roleCallback($ctx['cskhA1'], $ctx['branchB1']->id, 'cskh'));

        // 3. Super Admin có quyền lắng nghe trên mọi chi nhánh
        $this->actingAs($ctx['superAdmin']);
        $this->assertTrue($ordersCallback($ctx['superAdmin'], $ctx['branchA1']->id));
        $this->assertTrue($ordersCallback($ctx['superAdmin'], $ctx['branchB1']->id));
    }

    public function test_notifications_mark_all_as_read_is_isolated_by_tenant(): void
    {
        $ctx = $this->setupTwoTenants();

        $notifA = Notification::create([
            'branch_id' => $ctx['branchA1']->id,
            'order_id'  => $ctx['orderA1']->id,
            'type'      => 'order_created',
            'title'     => 'Notif A',
            'message'   => 'Msg A',
            'is_read'   => false,
        ]);

        $notifB = Notification::create([
            'branch_id' => $ctx['branchB1']->id,
            'order_id'  => $ctx['orderB1']->id,
            'type'      => 'order_created',
            'title'     => 'Notif B',
            'message'   => 'Msg B',
            'is_read'   => false,
        ]);

        // Admin Tenant A đánh dấu đọc tất cả không làm ảnh hưởng Tenant B
        $this->actingAs($ctx['adminA'])
            ->postJson('/api/v1/notifications/read-all')
            ->assertOk();

        $this->assertTrue((bool) $notifA->fresh()->is_read);
        $this->assertFalse((bool) $notifB->fresh()->is_read);

        // Admin Tenant A không thể đánh dấu đã đọc thông báo của Tenant B
        $this->actingAs($ctx['adminA'])
            ->patchJson("/api/v1/notifications/{$notifB->id}/read")
            ->assertStatus(404);
    }

    public function test_inventory_transactions_and_saas_invoices_and_audit_logs_are_isolated(): void
    {
        $ctx = $this->setupTwoTenants();

        $partB = Part::withoutGlobalScopes()->create([
            'tenant_id'        => $ctx['tenantB']->id,
            'sku'              => 'SKU-B1',
            'name'             => 'Pin Beta',
            'category'         => 'Pin',
            'storage_location' => 'Kệ B1',
            'stock_quantity'   => 10,
            'cost_price'       => 100000,
            'retail_price'     => 200000,
        ]);

        InventoryTransaction::create([
            'transaction_code'   => 'TX-BETA-001',
            'part_id'            => $partB->id,
            'branch_id'          => $ctx['branchB1']->id,
            'transaction_type'   => 'import',
            'quantity'           => 10,
            'unit_cost'          => 100000,
            'created_by_user_id' => $ctx['adminB']->id,
        ]);

        // Admin Tenant A không thấy giao dịch kho của Tenant B
        $txRes = $this->actingAs($ctx['adminA'])->getJson('/api/v1/inventory/transactions');
        $txRes->assertOk();
        $this->assertEmpty($txRes->json('data.data'));

        // Hóa đơn SaaS của Tenant B không thể bị đọc bởi Admin Tenant A
        $invoiceB = SaasInvoice::create([
            'tenant_id'      => $ctx['tenantB']->id,
            'reference_code' => 'FIXSUB999',
            'plan_id'        => 'pro',
            'billing_cycle'  => 'monthly',
            'amount'         => 299000,
            'status'         => 'pending',
            'expires_at'     => now()->addDay(),
        ]);

        $this->actingAs($ctx['adminA'])
            ->getJson("/api/v1/saas/invoices/{$invoiceB->id}/status")
            ->assertStatus(404);

        // CSKH bị chặn 403 khi truy cập /audit-logs và tạo /partners
        $this->actingAs($ctx['cskhA1'])
            ->getJson('/api/v1/audit-logs')
            ->assertStatus(403);

        $this->actingAs($ctx['cskhA1'])
            ->postJson('/api/v1/partners', ['name' => 'Partner X', 'type' => 'carrier'])
            ->assertStatus(403);

        // Audit log của Tenant B không bị lộ sang Admin Tenant A
        $logB = AuditLog::withoutGlobalScopes()->create([
            'tenant_id'      => $ctx['tenantB']->id,
            'user_id'        => $ctx['adminB']->id,
            'user_name'      => $ctx['adminB']->name,
            'action'         => 'Beta Secret Action',
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => $ctx['orderB1']->id,
            'details'        => 'Secret details',
        ]);

        $this->actingAs($ctx['adminA'])
            ->getJson("/api/v1/audit-logs/{$logB->id}")
            ->assertStatus(404);
    }

    public function test_public_endpoints_do_not_leak_staff_pii_or_unverified_customer_pii(): void
    {
        $ctx = $this->setupTwoTenants();

        Warranty::create([
            'warranty_code'   => 'FX26-WR-888888',
            'repair_order_id' => $ctx['orderA1']->id,
            'customer_id'     => $ctx['customerA']->id,
            'device_model_id' => $ctx['deviceModel']->id,
            'coverage_item'   => 'Thay pin',
            'start_date'      => now()->toDateString(),
            'duration_days'   => 90,
            'end_date'        => now()->addDays(90)->toDateString(),
            'status'          => 'active',
        ]);

        // 1. Public GET /api/v1/branches/{id} không lộ danh sách nhân sự (users)
        $branchRes = $this->getJson("/api/v1/branches/{$ctx['branchA1']->id}");
        $branchRes->assertOk();
        $this->assertArrayNotHasKey('users', $branchRes->json('data'));

        // 2. Public GET /api/v1/warranties/lookup?phone=... chỉ truyền phone sẽ che mờ tên và SĐT khách hàng
        $lookupPhoneOnly = $this->getJson('/api/v1/warranties/lookup?phone=0988111222');
        $lookupPhoneOnly->assertOk();
        $firstWarranty = $lookupPhoneOnly->json('data.0');
        $this->assertNotEquals('0988111222', $firstWarranty['customer']['phone']);
        $this->assertStringContainsString('*', $firstWarranty['customer']['phone']);

        // Khi truyền đồng thời cả code và phone khớp -> trả về đầy đủ SĐT không bị mask
        $lookupBoth = $this->getJson('/api/v1/warranties/lookup?code=FX26-WR-888888&phone=0988111222');
        $lookupBoth->assertOk();
        $this->assertEquals('0988111222', $lookupBoth->json('data.0.customer.phone'));

        // 3. Public GET /api/v1/tracking/{code} không kèm phone -> shipping_address bị che mờ và ẩn repair_note
        $trackRes = $this->getJson("/api/v1/tracking/{$ctx['orderA1']->order_code}");
        $trackRes->assertOk();
        $this->assertNotEquals('Số 99 Nguyễn Huệ, Quận 1, TP.HCM', $trackRes->json('data.order.shipping_address'));
        $this->assertStringContainsString('*', $trackRes->json('data.order.customer.phone'));
        $this->assertArrayNotHasKey('repair_note', $trackRes->json('data.order'));
    }

    public function test_cross_tenant_foreign_key_injection_and_branch_isolation_and_super_admin_access(): void
    {
        $ctx = $this->setupTwoTenants();

        // 1. Tạo khách hàng cùng SĐT ở Tenant B tuyệt đối không ghi đè khách hàng của Tenant A
        $resCustB = $this->actingAs($ctx['adminB'])->postJson('/api/v1/customers', [
            'name'  => 'Khách Hàng Beta Trùng SĐT',
            'phone' => '0988111222',
        ]);
        $this->assertTrue(in_array($resCustB->status(), [201, 422], true));
        $this->assertEquals('Khách Hàng Alpha', $ctx['customerA']->fresh()->name);

        // 2. Admin Tenant A không thể truyền branch_id của Tenant B khi tạo đơn hàng
        $crossOrderRes = $this->actingAs($ctx['adminA'])->postJson('/api/v1/orders', [
            'branch_id'         => $ctx['branchB1']->id,
            'customer_id'       => $ctx['customerA']->id,
            'device_model_id'   => $ctx['deviceModel']->id,
            'issue_description' => 'Test Cross Branch',
        ]);
        $crossOrderRes->assertStatus(422);

        // 3. CSKH Chi nhánh 1 không thể tạo báo giá cho đơn hàng thuộc Chi nhánh 2
        $crossBranchQuote = $this->actingAs($ctx['cskhA1'])->postJson('/api/v1/quotes', [
            'repair_order_id' => $ctx['orderA2']->id,
            'note'            => 'Báo giá chéo chi nhánh',
            'items'           => [
                ['description' => 'Thay pin', 'quantity' => 1, 'unit_price' => 500000],
            ],
        ]);
        $crossBranchQuote->assertStatus(403);

        // 4. Super Admin được xem cost_price của Part và xem đơn hàng liên chi nhánh
        $partA = Part::withoutGlobalScopes()->create([
            'tenant_id'        => $ctx['tenantA']->id,
            'sku'              => 'SKU-A1',
            'name'             => 'Pin Alpha',
            'category'         => 'Pin',
            'storage_location' => 'Kệ A1',
            'stock_quantity'   => 5,
            'cost_price'       => 150000,
            'retail_price'     => 300000,
        ]);

        $superOrderRes = $this->actingAs($ctx['superAdmin'])->getJson("/api/v1/orders/{$ctx['orderA2']->id}");
        $superOrderRes->assertOk();

        $req = \Illuminate\Http\Request::create('/api/v1/inventory/parts', 'GET');
        $req->setUserResolver(fn () => $ctx['superAdmin']);
        app()->instance('request', $req);
        $this->assertArrayHasKey('cost_price', $partA->toArray());
    }
}
