<?php

namespace Tests\Feature;

use App\Events\OrderOperationalEvent;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Notification;
use App\Models\NotificationRead;
use App\Models\RepairOrder;
use App\Models\Scopes\TenantScope;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MultiTenantNotificationIsolationTest extends TestCase
{
    use DatabaseTransactions;

    /**
     * Khởi tạo User kiểm thử an toàn: gán tường minh `role`, `tenant_id`, `branch_id`
     * (vượt qua $fillable không chứa `role` và trait BelongsToTenant tự điền master tenant_id).
     */
    private function createTestUser(array $attributes): User
    {
        $role = $attributes['role'] ?? 'technician';
        $hasExplicitTenantKey = array_key_exists('tenant_id', $attributes);
        $explicitTenantId = $attributes['tenant_id'] ?? null;
        $explicitBranchId = $attributes['branch_id'] ?? null;

        $factoryAttrs = $attributes;
        unset($factoryAttrs['role']);

        $user = User::factory()->make($factoryAttrs);
        $user->forceFill([
            'role'      => $role,
            'tenant_id' => $explicitTenantId,
            'branch_id' => $explicitBranchId,
            'phone'     => $attributes['phone'] ?? ('09' . str_pad((string) random_int(10000000, 99999999), 8, '0', STR_PAD_LEFT)),
            'password'  => $attributes['password'] ?? Hash::make('password'),
            'is_active' => $attributes['is_active'] ?? true,
        ]);
        $user->saveQuietly();

        if ($hasExplicitTenantKey && $explicitTenantId === null) {
            DB::table('users')->where('id', $user->id)->update(['tenant_id' => null]);
        }

        return User::withoutGlobalScopes()->findOrFail($user->id);
    }

    /**
     * Dựng bối cảnh kiểm thử đa tầng hoàn chỉnh:
     * - Tầng 1: superAdmin1, superAdmin2 (tenant_id = null)
     * - Tầng 2 & 3: Master Tenant (PODSCARE / fixo-master), Tenant A (Chi nhánh A1, A2), Tenant B (Chi nhánh B1)
     *
     * @return array<string, mixed>
     */
    private function setupMultiTierFixture(): array
    {
        NotificationRead::query()->delete();
        Notification::query()->delete();
        TenantScope::clearCache();

        SubscriptionPlan::firstOrCreate(
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

        $masterTenant = Tenant::query()
            ->whereIn('code', ['fixo-master', 'PODSCARE', 'podscare'])
            ->orderBy('id')
            ->first();

        if (! $masterTenant) {
            $masterTenant = Tenant::create([
                'name'   => 'PodsCare Master Store',
                'code'   => 'fixo-master',
                'status' => 'active',
                'plan'   => 'pro',
            ]);
        }

        TenantScope::clearCache();

        $suffix = strtoupper(substr(uniqid(), -5));

        $tenantA = Tenant::create([
            'name'   => "Gian Hàng Alpha {$suffix}",
            'code'   => "ALPHA-{$suffix}",
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $tenantB = Tenant::create([
            'name'   => "Gian Hàng Beta {$suffix}",
            'code'   => "BETA-{$suffix}",
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $branchMaster = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $masterTenant->id,
            'code'      => "MST-{$suffix}",
            'name'      => 'Chi nhánh Master Q1',
            'address'   => '100 Lê Lợi, Q1',
            'phone'     => '0901000100',
            'is_active' => true,
        ]);

        $branchA1 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code'      => "A1-{$suffix}",
            'name'      => 'Alpha Chi nhánh 1',
            'address'   => '101 Nguyễn Huệ, Q1',
            'phone'     => '0902000101',
            'is_active' => true,
        ]);

        $branchA2 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code'      => "A2-{$suffix}",
            'name'      => 'Alpha Chi nhánh 2',
            'address'   => '202 Võ Văn Ngân, Thủ Đức',
            'phone'     => '0902000102',
            'is_active' => true,
        ]);

        $branchB1 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'code'      => "B1-{$suffix}",
            'name'      => 'Beta Chi nhánh 1',
            'address'   => '303 Cầu Giấy, Hà Nội',
            'phone'     => '0903000101',
            'is_active' => true,
        ]);

        $superAdmin = $this->createTestUser([
            'tenant_id' => null,
            'branch_id' => null,
            'name'      => 'FIXO Super Admin',
            'email'     => "super1.{$suffix}@fixo.test",
            'role'      => 'super_admin',
        ]);

        $superAdmin2 = $this->createTestUser([
            'tenant_id' => null,
            'branch_id' => null,
            'name'      => 'FIXO Super Admin 2',
            'email'     => "super2.{$suffix}@fixo.test",
            'role'      => 'super_admin',
        ]);

        $masterAdmin = $this->createTestUser([
            'tenant_id' => $masterTenant->id,
            'branch_id' => $branchMaster->id,
            'name'      => 'Master Store Admin',
            'email'     => "master.admin.{$suffix}@podscare.test",
            'role'      => 'admin',
        ]);

        $masterCskh = $this->createTestUser([
            'tenant_id' => $masterTenant->id,
            'branch_id' => $branchMaster->id,
            'name'      => 'Master Store CSKH',
            'email'     => "master.cskh.{$suffix}@podscare.test",
            'role'      => 'cskh',
        ]);

        $adminA = $this->createTestUser([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA1->id,
            'name'      => 'Chủ tiệm Alpha',
            'email'     => "admin.a.{$suffix}@alpha.test",
            'role'      => 'admin',
        ]);

        $cskhA1 = $this->createTestUser([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA1->id,
            'name'      => 'CSKH Alpha CN1 #1',
            'email'     => "cskh1.a1.{$suffix}@alpha.test",
            'role'      => 'cskh',
        ]);

        $cskhA1Colleague = $this->createTestUser([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA1->id,
            'name'      => 'CSKH Alpha CN1 #2',
            'email'     => "cskh2.a1.{$suffix}@alpha.test",
            'role'      => 'cskh',
        ]);

        $techA1 = $this->createTestUser([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA1->id,
            'name'      => 'KTV Alpha CN1 (technician)',
            'email'     => "tech1.a1.{$suffix}@alpha.test",
            'role'      => 'technician',
        ]);

        $techA1Alias = $this->createTestUser([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA1->id,
            'name'      => 'KTV Alpha CN1 #2 (tech)',
            'email'     => "tech2.a1.{$suffix}@alpha.test",
            'role'      => 'tech',
        ]);

        $qcA1 = $this->createTestUser([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA1->id,
            'name'      => 'QC Alpha CN1',
            'email'     => "qc.a1.{$suffix}@alpha.test",
            'role'      => 'qc',
        ]);

        $cskhA2 = $this->createTestUser([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA2->id,
            'name'      => 'CSKH Alpha CN2',
            'email'     => "cskh.a2.{$suffix}@alpha.test",
            'role'      => 'cskh',
        ]);

        $adminB = $this->createTestUser([
            'tenant_id' => $tenantB->id,
            'branch_id' => $branchB1->id,
            'name'      => 'Chủ tiệm Beta',
            'email'     => "admin.b.{$suffix}@beta.test",
            'role'      => 'admin',
        ]);

        $cskhB1 = $this->createTestUser([
            'tenant_id' => $tenantB->id,
            'branch_id' => $branchB1->id,
            'name'      => 'CSKH Beta CN1',
            'email'     => "cskh.b1.{$suffix}@beta.test",
            'role'      => 'cskh',
        ]);

        $deviceModel = DeviceModel::firstOrCreate(
            ['model_code' => 'A2931-ISO'],
            [
                'name'     => 'AirPods Pro 2 USB-C',
                'category' => 'AirPods Pro',
            ]
        );

        $customerA = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'name'      => 'Khách Alpha',
            'phone'     => '0977111222',
        ]);

        $customerB = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'name'      => 'Khách Beta',
            'phone'     => '0977333444',
        ]);

        $orderA1 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $tenantA->id,
            'order_code'         => "PCA1-{$suffix}-01",
            'branch_id'          => $branchA1->id,
            'customer_id'        => $customerA->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Rè loa tai phải',
            'status'             => 'inspecting',
            'created_by_user_id' => $cskhA1->id,
        ]);

        $orderB1 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $tenantB->id,
            'order_code'         => "PCB1-{$suffix}-01",
            'branch_id'          => $branchB1->id,
            'customer_id'        => $customerB->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Sạc không vào hộp sạc',
            'status'             => 'in_repair',
            'created_by_user_id' => $adminB->id,
        ]);

        return compact(
            'masterTenant',
            'tenantA',
            'tenantB',
            'branchMaster',
            'branchA1',
            'branchA2',
            'branchB1',
            'superAdmin',
            'superAdmin2',
            'masterAdmin',
            'masterCskh',
            'adminA',
            'cskhA1',
            'cskhA1Colleague',
            'techA1',
            'techA1Alias',
            'qcA1',
            'cskhA2',
            'adminB',
            'cskhB1',
            'deviceModel',
            'customerA',
            'customerB',
            'orderA1',
            'orderB1'
        );
    }

    /**
     * Nhóm 1: Cô lập Tầng 1 (`super_admin`)
     * - Chỉ nhận thông báo cấp Nền tảng (`tenant_id IS NULL` & `(user_id = self OR target_role = 'super_admin')`).
     * - Tuyệt đối không thấy đơn sửa chữa nội bộ của bất kỳ Tenant nào.
     * - `POST /api/v1/notifications/read-all` của `super_admin` không làm giảm `unread_count` của bất kỳ Tenant nào.
     * - `PATCH /api/v1/notifications/{tenantNotifId}/read` trả về `404`.
     * - `POST /api/v1/platform/stores/{id}/remind-fee` gửi thông báo nhắc phí về đúng Chủ tiệm Tenant đích (`target_role = 'admin'`), không hiển thị ngược lại trên chuông của `super_admin`.
     */
    public function test_group1_super_admin_only_sees_platform_notifications_and_cannot_touch_tenant_notifications(): void
    {
        $ctx = $this->setupMultiTierFixture();

        $platformRegistered = Notification::create([
            'tenant_id'   => null,
            'user_id'     => $ctx['superAdmin']->id,
            'branch_id'   => null,
            'target_role' => 'super_admin',
            'type'        => 'tenant_registered',
            'title'       => 'Gian hàng mới đăng ký: Alpha',
            'message'     => 'Chủ tiệm vừa đăng ký gian hàng mới trên FIXO.',
            'severity'    => 'info',
        ]);

        $platformSaasPaid = Notification::create([
            'tenant_id'   => null,
            'user_id'     => null,
            'branch_id'   => null,
            'target_role' => 'super_admin',
            'type'        => 'saas_payment_received',
            'title'       => 'Thanh toán gói cước SaaS thành công',
            'message'     => 'Gian hàng Alpha vừa thanh toán hóa đơn FIXSUB101.',
            'severity'    => 'success',
        ]);

        // Thông báo cá nhân gửi riêng cho Super Admin 2 (Super Admin 1 không được thấy)
        $otherSuperAdminPersonal = Notification::create([
            'tenant_id'   => null,
            'user_id'     => $ctx['superAdmin2']->id,
            'branch_id'   => null,
            'target_role' => 'super_admin',
            'type'        => 'tenant_registered',
            'title'       => 'Thông báo riêng Super Admin 2',
            'message'     => 'Chỉ Super Admin 2 nhận.',
            'severity'    => 'info',
        ]);

        // Thông báo đơn sửa chữa nội bộ của Tenant A và Tenant B
        $tenantAOrderNotif = Notification::create([
            'tenant_id'   => $ctx['tenantA']->id,
            'branch_id'   => $ctx['branchA1']->id,
            'order_id'    => $ctx['orderA1']->id,
            'target_role' => 'technician',
            'type'        => 'order_created',
            'title'       => 'Tiếp nhận đơn mới Alpha',
            'message'     => 'Đơn sửa chữa nội bộ Alpha.',
            'severity'    => 'info',
        ]);

        $tenantBOrderNotif = Notification::create([
            'tenant_id'   => $ctx['tenantB']->id,
            'branch_id'   => $ctx['branchB1']->id,
            'order_id'    => $ctx['orderB1']->id,
            'target_role' => null,
            'type'        => 'order_status',
            'title'       => 'Cập nhật đơn sửa chữa Beta',
            'message'     => 'Đơn sửa chữa nội bộ Beta.',
            'severity'    => 'info',
        ]);

        // 1. Super Admin gọi GET /api/v1/notifications -> Chỉ thấy đúng 2 thông báo cấp Nền tảng của mình
        $res = $this->actingAs($ctx['superAdmin'], 'sanctum')
            ->getJson('/api/v1/notifications');

        $res->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.total', 2)
            ->assertJsonPath('data.unread_count', 2);

        $returnedIds = collect($res->json('data.data'))->pluck('id')->map(fn ($id) => (int) $id)->all();
        $this->assertEqualsCanonicalizing([$platformRegistered->id, $platformSaasPaid->id], $returnedIds);
        $this->assertNotContains($otherSuperAdminPersonal->id, $returnedIds);
        $this->assertNotContains($tenantAOrderNotif->id, $returnedIds);
        $this->assertNotContains($tenantBOrderNotif->id, $returnedIds);

        // 2. Super Admin cố đánh dấu đọc thông báo đơn sửa chữa của Tenant A -> 404
        $this->actingAs($ctx['superAdmin'], 'sanctum')
            ->patchJson("/api/v1/notifications/{$tenantAOrderNotif->id}/read")
            ->assertStatus(404)
            ->assertJsonPath('success', false);

        // 3. Super Admin gọi POST /api/v1/notifications/read-all -> Không làm thay đổi unread_count của Tenant A hay Tenant B
        $this->actingAs($ctx['superAdmin'], 'sanctum')
            ->postJson('/api/v1/notifications/read-all')
            ->assertOk()
            ->assertJsonPath('data.updated_count', 2);

        $this->actingAs($ctx['superAdmin'], 'sanctum')
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('data.unread_count', 0);

        $this->actingAs($ctx['adminA'], 'sanctum')
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('data.unread_count', 1);

        $this->actingAs($ctx['adminB'], 'sanctum')
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('data.unread_count', 1);

        // 4. Super Admin gửi nhắc phí duy trì phần mềm xuống Tenant A -> Chỉ Chủ tiệm Tenant A nhận được
        $this->actingAs($ctx['superAdmin'], 'sanctum')
            ->postJson("/api/v1/platform/stores/{$ctx['tenantA']->id}/remind-fee")
            ->assertOk();

        $feeNotif = Notification::query()->where('type', 'fee_reminder')->latest('id')->first();
        $this->assertNotNull($feeNotif);
        $this->assertSame((int) $ctx['tenantA']->id, (int) $feeNotif->tenant_id);
        $this->assertSame((int) $ctx['adminA']->id, (int) $feeNotif->user_id);
        $this->assertSame('admin', $feeNotif->target_role);
        $this->assertSame('/subscription', $feeNotif->action_url);

        // Super Admin, Chủ tiệm Tenant B và CSKH Tenant A đều không nhìn thấy thông báo nhắc phí này
        $superIdsAfter = collect(
            $this->actingAs($ctx['superAdmin'], 'sanctum')->getJson('/api/v1/notifications')->json('data.data')
        )->pluck('id')->all();
        $this->assertNotContains($feeNotif->id, $superIdsAfter);

        $cskhAIdsAfter = collect(
            $this->actingAs($ctx['cskhA1'], 'sanctum')->getJson('/api/v1/notifications')->json('data.data')
        )->pluck('id')->all();
        $this->assertNotContains($feeNotif->id, $cskhAIdsAfter);

        $adminBIdsAfter = collect(
            $this->actingAs($ctx['adminB'], 'sanctum')->getJson('/api/v1/notifications')->json('data.data')
        )->pluck('id')->all();
        $this->assertNotContains($feeNotif->id, $adminBIdsAfter);

        // Chủ tiệm Tenant A nhìn thấy đầy đủ
        $adminAIdsAfter = collect(
            $this->actingAs($ctx['adminA'], 'sanctum')->getJson('/api/v1/notifications')->json('data.data')
        )->pluck('id')->all();
        $this->assertContains($feeNotif->id, $adminAIdsAfter);
    }

    /**
     * Nhóm 2: Cô lập Master Tenant (`fixo-master` / `PODSCARE`), Cross-Tenant & Fail-Closed khi `tenant_id = NULL`
     * - Admin và nhân sự thuộc Master Tenant tuyệt đối không thấy `tenant_registered` / `saas_payment_received` của `super_admin` hay bản ghi mồ côi `tenant_id = NULL`.
     * - Tenant A không thấy thông báo của Tenant B (kể cả khi truyền `?branch_id={branchB1}`).
     * - Tài khoản thường (`admin`, `cskh`) bị khuyết `tenant_id = NULL` bị chặn fail-closed trả về `0` thông báo.
     */
    public function test_group2_master_tenant_and_cross_tenant_isolation_and_null_tenant_fail_closed(): void
    {
        $ctx = $this->setupMultiTierFixture();

        $platformReg = Notification::create([
            'tenant_id'   => null,
            'user_id'     => null,
            'branch_id'   => null,
            'target_role' => 'super_admin',
            'type'        => 'tenant_registered',
            'title'       => 'Gian hàng mới đăng ký: Beta',
            'message'     => 'Thông báo dành riêng cho Super Admin.',
        ]);

        $platformBilling = Notification::create([
            'tenant_id'   => null,
            'user_id'     => $ctx['superAdmin']->id,
            'branch_id'   => null,
            'target_role' => 'super_admin',
            'type'        => 'saas_payment_received',
            'title'       => 'Thanh toán SaaS',
            'message'     => 'Doanh thu gói cước cấp Sàn.',
        ]);

        // Bản ghi mồ côi không có tenant_id trong DB (mô phỏng dữ liệu lỗi)
        $orphanNotifId = DB::table('notifications')->insertGetId([
            'tenant_id'   => null,
            'user_id'     => null,
            'branch_id'   => null,
            'target_role' => null,
            'type'        => 'order_status',
            'title'       => 'Bản ghi mồ côi tenant_id NULL',
            'message'     => 'Không được phép lộ sang Master Tenant',
            'severity'    => 'info',
            'is_read'     => 0,
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        $masterStoreNotif = Notification::create([
            'tenant_id'   => $ctx['masterTenant']->id,
            'branch_id'   => $ctx['branchMaster']->id,
            'target_role' => null,
            'type'        => 'order_status',
            'title'       => 'Đơn nội bộ Master Store',
            'message'     => 'Thông báo hợp lệ của Master Store.',
        ]);

        $tenantANotif = Notification::create([
            'tenant_id'   => $ctx['tenantA']->id,
            'branch_id'   => $ctx['branchA1']->id,
            'order_id'    => $ctx['orderA1']->id,
            'target_role' => null,
            'type'        => 'order_status',
            'title'       => 'Đơn nội bộ Alpha',
            'message'     => 'Thông báo hợp lệ của Tenant A.',
        ]);

        $tenantBNotif = Notification::create([
            'tenant_id'   => $ctx['tenantB']->id,
            'branch_id'   => $ctx['branchB1']->id,
            'order_id'    => $ctx['orderB1']->id,
            'target_role' => null,
            'type'        => 'order_status',
            'title'       => 'Đơn nội bộ Beta',
            'message'     => 'Thông báo hợp lệ của Tenant B.',
        ]);

        // 1. Master Tenant Admin & CSKH chỉ thấy đúng 1 thông báo của Master Store, tuyệt đối không thấy thông báo Nền tảng hay Tenant khác
        foreach ([$ctx['masterAdmin'], $ctx['masterCskh']] as $masterActor) {
            $masterRes = $this->actingAs($masterActor, 'sanctum')->getJson('/api/v1/notifications');
            $masterRes->assertOk()
                ->assertJsonPath('data.total', 1)
                ->assertJsonPath('data.unread_count', 1);

            $ids = collect($masterRes->json('data.data'))->pluck('id')->map(fn ($v) => (int) $v)->all();
            $this->assertSame([$masterStoreNotif->id], $ids);
            $this->assertNotContains($platformReg->id, $ids);
            $this->assertNotContains($platformBilling->id, $ids);
            $this->assertNotContains((int) $orphanNotifId, $ids);
            $this->assertNotContains($tenantANotif->id, $ids);
            $this->assertNotContains($tenantBNotif->id, $ids);
        }

        // 2. Admin Tenant A chỉ thấy Tenant A; cố lọc theo branch_id của Tenant B bị fail-closed trả về 0
        $resAdminA = $this->actingAs($ctx['adminA'], 'sanctum')->getJson('/api/v1/notifications');
        $resAdminA->assertOk()->assertJsonPath('data.total', 1);
        $this->assertSame($tenantANotif->id, (int) $resAdminA->json('data.data.0.id'));

        $this->actingAs($ctx['adminA'], 'sanctum')
            ->getJson("/api/v1/notifications?branch_id={$ctx['branchB1']->id}")
            ->assertOk()
            ->assertJsonPath('data.total', 0)
            ->assertJsonPath('data.unread_count', 0);

        $this->actingAs($ctx['adminA'], 'sanctum')
            ->patchJson("/api/v1/notifications/{$tenantBNotif->id}/read")
            ->assertStatus(404);

        $this->actingAs($ctx['adminA'], 'sanctum')
            ->patchJson("/api/v1/notifications/{$platformReg->id}/read")
            ->assertStatus(404);

        // 3. Tài khoản không phải super_admin bị khuyết tenant_id = NULL -> Fail-Closed trả về 0 thông báo
        $orphanAdmin = $this->createTestUser([
            'tenant_id' => null,
            'branch_id' => null,
            'name'      => 'Orphan Admin Null Tenant',
            'email'     => 'orphan.admin.' . uniqid() . '@fixo.test',
            'role'      => 'admin',
        ]);
        $orphanCskh = $this->createTestUser([
            'tenant_id' => null,
            'branch_id' => null,
            'name'      => 'Orphan CSKH Null Tenant',
            'email'     => 'orphan.cskh.' . uniqid() . '@fixo.test',
            'role'      => 'cskh',
        ]);

        $this->assertNull($orphanAdmin->fresh()->tenant_id);
        $this->assertNull($orphanCskh->fresh()->tenant_id);

        foreach ([$orphanAdmin, $orphanCskh] as $orphanActor) {
            $this->actingAs($orphanActor, 'sanctum')
                ->getJson('/api/v1/notifications')
                ->assertOk()
                ->assertJsonPath('data.total', 0)
                ->assertJsonPath('data.unread_count', 0)
                ->assertJsonCount(0, 'data.data');

            $this->actingAs($orphanActor, 'sanctum')
                ->postJson('/api/v1/notifications/read-all')
                ->assertOk()
                ->assertJsonPath('data.updated_count', 0);
        }
    }

    /**
     * Nhóm 3: Cô lập Nội bộ Tầng 3 & Chống Giả mạo Query Params (`?branch_id=all|khác`, `?user_id=khác`)
     * - Nhân sự chi nhánh (`cskh`, `technician`, `tech`, `qc`) không thấy thông báo của chi nhánh khác.
     * - Không thấy thông báo đích danh của đồng nghiệp cùng chi nhánh (`user_id = KTV A` không lộ sang `KTV B` hay `CSKH`).
     * - Không thấy `fee_reminder` của Chủ tiệm (`target_role = 'admin'`).
     * - Chuẩn hóa hai chiều `'tech'` <-> `'technician'`.
     * - Mọi tham số giả mạo `?branch_id=all`, `?branch_id={chi_nhanh_khac}`, `?user_id={nguoi_khac}` đều bị vô hiệu hóa hoàn toàn.
     */
    public function test_group3_branch_staff_isolation_and_query_parameter_tampering_prevention(): void
    {
        $ctx = $this->setupMultiTierFixture();

        // 1. Thông báo chung toàn Chi nhánh A1
        $sharedBranchA1 = Notification::create([
            'tenant_id'   => $ctx['tenantA']->id,
            'branch_id'   => $ctx['branchA1']->id,
            'user_id'     => null,
            'target_role' => null,
            'type'        => 'order_status',
            'title'       => 'Thông báo chung CN1',
            'message'     => 'Sự kiện chung của Chi nhánh A1.',
        ]);

        // 2. Thông báo riêng vai trò CSKH tại Chi nhánh A1
        $cskhRoleA1 = Notification::create([
            'tenant_id'   => $ctx['tenantA']->id,
            'branch_id'   => $ctx['branchA1']->id,
            'user_id'     => null,
            'target_role' => 'cskh',
            'type'        => 'quote_action',
            'title'       => 'Báo giá chờ CSKH gọi khách',
            'message'     => 'Báo giá 850.000 ₫ chờ khách xác nhận.',
        ]);

        // 3. Thông báo chung vai trò 'technician' tại Chi nhánh A1
        $techRoleA1 = Notification::create([
            'tenant_id'   => $ctx['tenantA']->id,
            'branch_id'   => $ctx['branchA1']->id,
            'user_id'     => null,
            'target_role' => 'technician',
            'type'        => 'order_created',
            'title'       => 'Đơn mới chờ KTV',
            'message'     => 'Đơn sửa chữa mới chờ tiếp nhận.',
        ]);

        // 4. Thông báo gắn bí danh 'tech' tại Chi nhánh A1
        $techAliasRoleA1 = Notification::create([
            'tenant_id'   => $ctx['tenantA']->id,
            'branch_id'   => $ctx['branchA1']->id,
            'user_id'     => null,
            'target_role' => 'tech',
            'type'        => 'order_status',
            'title'       => 'Thông báo xưởng (target_role=tech)',
            'message'     => 'Kiểm tra đồng bộ hai chiều tech <-> technician.',
        ]);

        // 5. Thông báo giao việc đích danh cho KTV A (techA1)
        $personalTechA1 = Notification::create([
            'tenant_id'   => $ctx['tenantA']->id,
            'branch_id'   => $ctx['branchA1']->id,
            'user_id'     => $ctx['techA1']->id,
            'target_role' => 'technician',
            'type'        => 'order_assigned',
            'title'       => 'Giao việc đích danh KTV 1',
            'message'     => 'Chỉ KTV 1 được phép thấy thông báo này.',
        ]);

        // 6. Thông báo giao việc đích danh cho KTV B (techA1Alias)
        $personalTechA2 = Notification::create([
            'tenant_id'   => $ctx['tenantA']->id,
            'branch_id'   => $ctx['branchA1']->id,
            'user_id'     => $ctx['techA1Alias']->id,
            'target_role' => 'technician',
            'type'        => 'order_assigned',
            'title'       => 'Giao việc đích danh KTV 2',
            'message'     => 'Chỉ KTV 2 được phép thấy thông báo này.',
        ]);

        // 7. Thông báo dành cho QC tại Chi nhánh A1
        $qcRoleA1 = Notification::create([
            'tenant_id'   => $ctx['tenantA']->id,
            'branch_id'   => $ctx['branchA1']->id,
            'user_id'     => null,
            'target_role' => 'qc',
            'type'        => 'qc_action',
            'title'       => 'Chờ QC nghiệm thu',
            'message'     => 'Đơn sửa xong chờ QC.',
        ]);

        // 8. Thông báo nhắc phí duy trì phần mềm của Chủ tiệm
        $ownerFeeReminder = Notification::create([
            'tenant_id'   => $ctx['tenantA']->id,
            'branch_id'   => $ctx['branchA1']->id,
            'user_id'     => $ctx['adminA']->id,
            'target_role' => 'admin',
            'type'        => 'fee_reminder',
            'title'       => 'Nhắc phí phần mềm Alpha',
            'message'     => 'Chỉ Chủ tiệm được thấy.',
        ]);

        // 9. Thông báo thuộc Chi nhánh A2 cùng Tenant A
        $branchA2Notif = Notification::create([
            'tenant_id'   => $ctx['tenantA']->id,
            'branch_id'   => $ctx['branchA2']->id,
            'user_id'     => null,
            'target_role' => null,
            'type'        => 'order_status',
            'title'       => 'Thông báo Chi nhánh A2',
            'message'     => 'Nhân viên CN1 không được thấy.',
        ]);

        // Kiểm chứng tập thông báo chuẩn của CSKH CN1
        $expectedCskhA1Ids = [$sharedBranchA1->id, $cskhRoleA1->id];
        $cskhRes = $this->actingAs($ctx['cskhA1'], 'sanctum')->getJson('/api/v1/notifications');
        $cskhRes->assertOk()->assertJsonPath('data.total', 2);
        $this->assertEqualsCanonicalizing(
            $expectedCskhA1Ids,
            collect($cskhRes->json('data.data'))->pluck('id')->map(fn ($v) => (int) $v)->all()
        );

        // Kiểm chứng giả mạo query params từ CSKH CN1 (?branch_id=all, ?branch_id=A2, ?branch_id=B1, ?user_id=adminA, ?user_id=techA1)
        $tamperedQueries = [
            '/api/v1/notifications?branch_id=all',
            "/api/v1/notifications?branch_id={$ctx['branchA2']->id}",
            "/api/v1/notifications?branch_id={$ctx['branchB1']->id}",
            "/api/v1/notifications?user_id={$ctx['adminA']->id}",
            "/api/v1/notifications?branch_id={$ctx['branchA2']->id}&user_id={$ctx['techA1']->id}",
            "/api/v1/notifications?branch=all&user={$ctx['adminA']->id}",
        ];

        foreach ($tamperedQueries as $tamperedUrl) {
            $tamperedRes = $this->actingAs($ctx['cskhA1'], 'sanctum')->getJson($tamperedUrl);
            $tamperedRes->assertOk()->assertJsonPath('data.total', 2);
            $tamperedIds = collect($tamperedRes->json('data.data'))->pluck('id')->map(fn ($v) => (int) $v)->all();
            $this->assertEqualsCanonicalizing($expectedCskhA1Ids, $tamperedIds, "Query giả mạo bị lọt tại URL: {$tamperedUrl}");
        }

        // Kiểm chứng KTV 1 (role = 'technician') thấy cả target_role='technician' lẫn 'tech' và thông báo cá nhân của mình, KHÔNG thấy của KTV 2 hay CSKH/Admin
        $expectedTechA1Ids = [$sharedBranchA1->id, $techRoleA1->id, $techAliasRoleA1->id, $personalTechA1->id];
        $tech1Res = $this->actingAs($ctx['techA1'], 'sanctum')
            ->getJson("/api/v1/notifications?branch_id=all&user_id={$ctx['techA1Alias']->id}");
        $tech1Res->assertOk()->assertJsonPath('data.total', 4);
        $this->assertEqualsCanonicalizing(
            $expectedTechA1Ids,
            collect($tech1Res->json('data.data'))->pluck('id')->map(fn ($v) => (int) $v)->all()
        );

        // Kiểm chứng KTV 2 (role = 'tech') thấy thông báo cá nhân của KTV 2, tuyệt đối KHÔNG thấy thông báo cá nhân của KTV 1
        $expectedTechA2Ids = [$sharedBranchA1->id, $techRoleA1->id, $techAliasRoleA1->id, $personalTechA2->id];
        $tech2Res = $this->actingAs($ctx['techA1Alias'], 'sanctum')
            ->getJson("/api/v1/notifications?user_id={$ctx['techA1']->id}");
        $tech2Res->assertOk()->assertJsonPath('data.total', 4);
        $this->assertEqualsCanonicalizing(
            $expectedTechA2Ids,
            collect($tech2Res->json('data.data'))->pluck('id')->map(fn ($v) => (int) $v)->all()
        );

        // Kiểm chứng QC CN1 chỉ thấy thông báo chung CN1 và thông báo QC
        $qcRes = $this->actingAs($ctx['qcA1'], 'sanctum')->getJson('/api/v1/notifications?branch_id=all');
        $qcRes->assertOk()->assertJsonPath('data.total', 2);
        $this->assertEqualsCanonicalizing(
            [$sharedBranchA1->id, $qcRoleA1->id],
            collect($qcRes->json('data.data'))->pluck('id')->map(fn ($v) => (int) $v)->all()
        );

        // KTV 2 hoặc CSKH cố tình gọi PATCH /read lên thông báo đích danh của KTV 1 hoặc thông báo CN2 / Chủ tiệm -> 404
        $this->actingAs($ctx['techA1Alias'], 'sanctum')
            ->patchJson("/api/v1/notifications/{$personalTechA1->id}/read")
            ->assertStatus(404);

        $this->actingAs($ctx['cskhA1'], 'sanctum')
            ->patchJson("/api/v1/notifications/{$ownerFeeReminder->id}/read")
            ->assertStatus(404);

        $this->actingAs($ctx['cskhA1'], 'sanctum')
            ->patchJson("/api/v1/notifications/{$branchA2Notif->id}/read")
            ->assertStatus(404);
    }

    /**
     * Nhóm 4: Bảo mật Ẩn 100% Giá Tiền VNĐ đối với Kỹ thuật viên (`technician` & `tech`)
     * - Thực thi thật luồng:
     *   1. Lập báo giá `POST /api/v1/quotes` (`QuoteController::store`) trị giá `1.250.000 ₫`
     *   2. Duyệt báo giá `POST /api/v1/quotes/{id}/approve` (`QuoteController::approve`)
     *   3. Thêm dịch vụ bổ sung `POST /api/v1/orders/{id}/additional-services` (`OrderController::addAdditionalService`) trị giá `350.000 ₫`
     * - Xác minh `cskh` và `admin` nhận thông báo đầy đủ số tiền VNĐ.
     * - Xác minh `technician` và `tech` chỉ nhận thông báo kỹ thuật sạch 100% không chứa bất kỳ con số giá tiền hay ký hiệu tiền tệ VNĐ nào (cả trong DB query lẫn trong event `OrderOperationalEvent` phát ra và kênh broadcast).
     */
    public function test_group4_quote_and_additional_service_workflows_hide_100_percent_vnd_prices_from_technicians(): void
    {
        Event::fake([OrderOperationalEvent::class]);

        $ctx = $this->setupMultiTierFixture();

        // Gán sẵn KTV 1 phụ trách đơn sửa chữa
        $ctx['orderA1']->update([
            'status'        => 'inspecting',
            'technician_id' => $ctx['techA1']->id,
        ]);

        // Bước 1: CSKH lập báo giá 1.250.000 VNĐ
        $createQuoteRes = $this->actingAs($ctx['cskhA1'], 'sanctum')
            ->postJson('/api/v1/quotes', [
                'repair_order_id'     => $ctx['orderA1']->id,
                'note'                => 'Thay pin và vệ sinh màng loa',
                'warranty_terms_days' => 90,
                'items'               => [
                    [
                        'description' => 'Thay cặp pin AirPods Pro 2 chính hãng',
                        'quantity'    => 1,
                        'unit_price'  => 1250000,
                    ],
                ],
            ]);

        $createQuoteRes->assertStatus(201)->assertJsonPath('success', true);
        $quoteId = (int) $createQuoteRes->json('data.id');
        $this->assertGreaterThan(0, $quoteId);

        // Bước 2: CSKH xác nhận khách duyệt báo giá
        $approveQuoteRes = $this->actingAs($ctx['cskhA1'], 'sanctum')
            ->postJson("/api/v1/quotes/{$quoteId}/approve");
        $approveQuoteRes->assertOk()->assertJsonPath('success', true);

        // Đưa đơn vào trạng thái đang sửa bởi KTV 1 để phát sinh thêm dịch vụ bổ sung
        $ctx['orderA1']->update([
            'status'        => 'in_repair',
            'technician_id' => $ctx['techA1']->id,
        ]);

        // Bước 3: CSKH thêm dịch vụ sửa chữa bổ sung trị giá 350.000 VNĐ
        $addServiceRes = $this->actingAs($ctx['cskhA1'], 'sanctum')
            ->postJson("/api/v1/orders/{$ctx['orderA1']->id}/additional-services", [
                'name'  => 'Thay màng loa chống ồn ANC',
                'price' => 350000,
                'note'  => 'Khách yêu cầu làm thêm',
            ]);
        $addServiceRes->assertOk()->assertJsonPath('success', true);

        // Kiểm chứng 1: CSKH và Chủ tiệm nhìn thấy đầy đủ thông báo tài chính có số tiền VNĐ
        foreach ([$ctx['cskhA1'], $ctx['adminA']] as $privilegedActor) {
            auth()->forgetGuards();
            $privRes = $this->actingAs($privilegedActor, 'sanctum')->getJson('/api/v1/notifications');
            $privRes->assertOk();
            $combinedPrivilegedText = collect($privRes->json('data.data'))
                ->map(fn (array $item) => ($item['title'] ?? '') . ' ' . ($item['message'] ?? ''))
                ->implode(' | ');

            $this->assertStringContainsString('₫', $combinedPrivilegedText);
            $this->assertMatchesRegularExpression('/1[.,]250[.,]000/', $combinedPrivilegedText);
            $this->assertMatchesRegularExpression('/350[.,]000/', $combinedPrivilegedText);
        }

        // Kiểm chứng 2: Kỹ thuật viên (`technician` được gán đơn & `tech` cùng chi nhánh) tuyệt đối KHÔNG nhận bất kỳ con số hay ký hiệu tiền tệ VNĐ nào
        $forbiddenPricePatterns = [
            '/1[.,]?250[.,]?000/u',
            '/350[.,]?000/u',
            '/₫/u',
            '/\bvn[đd]\b/iu',
            '/\d+\s*(?:đ|đồng|k)\b/iu',
        ];

        auth()->forgetGuards();
        $tech1Res = $this->actingAs($ctx['techA1'], 'sanctum')->getJson('/api/v1/notifications');
        $tech1Res->assertOk();
        $tech1Items = $tech1Res->json('data.data');
        $this->assertGreaterThanOrEqual(2, count($tech1Items), 'KTV phụ trách đơn phải nhận được thông báo kỹ thuật duyệt đơn & làm thêm hạng mục.');

        $tech1Titles = collect($tech1Items)->pluck('title')->implode(' | ');
        $this->assertStringContainsString('Đơn chờ kỹ thuật viên tiếp nhận', $tech1Titles);
        $this->assertStringContainsString('Thay màng loa chống ồn ANC', $tech1Titles);

        foreach ([$ctx['techA1'], $ctx['techA1Alias']] as $techActor) {
            auth()->forgetGuards();
            $techRes = $this->actingAs($techActor, 'sanctum')->getJson('/api/v1/notifications');
            $techRes->assertOk();

            foreach ($techRes->json('data.data') as $notifItem) {
                $fullText = ($notifItem['title'] ?? '') . ' ' . ($notifItem['message'] ?? '');
                $this->assertNotSame('quote_action', $notifItem['type'] ?? null);
                foreach ($forbiddenPricePatterns as $pattern) {
                    $this->assertDoesNotMatchRegularExpression(
                        $pattern,
                        $fullText,
                        "Phát hiện rò rỉ giá tiền sang tài khoản KTV ({$techActor->role}): {$fullText}"
                    );
                }
            }
        }

        // Kiểm chứng 3: Toàn bộ Event WebSocket `OrderOperationalEvent` phát tới KTV không chứa giá tiền và sự kiện của CSKH không lọt vào kênh `.orders` chung
        $dispatchedEvents = Event::dispatched(OrderOperationalEvent::class);
        $this->assertGreaterThanOrEqual(5, $dispatchedEvents->count());

        $techEventsCount = 0;
        $cskhEventsCount = 0;

        foreach ($dispatchedEvents as [$event]) {
            /** @var OrderOperationalEvent $event */
            $payload = $event->broadcastWith();
            $channelNames = array_map(fn ($ch) => $ch->name, $event->broadcastOn());

            $this->assertSame((int) $ctx['tenantA']->id, $payload['tenantId']);

            if ($payload['targetRole'] === 'cskh') {
                $cskhEventsCount++;
                // Sự kiện báo giá / tài chính của CSKH chỉ phát vào kênh riêng cskh & admin, tuyệt đối không phát vào kênh .orders chung của chi nhánh
                $this->assertContains("private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchA1']->id}.cskh", $channelNames);
                $this->assertNotContains("private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchA1']->id}.orders", $channelNames);
                $this->assertNotContains("private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchA1']->id}.technician", $channelNames);
            }

            if ($payload['targetRole'] === 'technician') {
                $techEventsCount++;
                $eventText = ($payload['title'] ?? '') . ' ' . ($payload['message'] ?? '');
                foreach ($forbiddenPricePatterns as $pattern) {
                    $this->assertDoesNotMatchRegularExpression(
                        $pattern,
                        $eventText,
                        "Sự kiện OrderOperationalEvent gửi cho KTV bị rò rỉ tiền tệ: {$eventText}"
                    );
                }
            }
        }

        $this->assertGreaterThanOrEqual(3, $cskhEventsCount);
        $this->assertGreaterThanOrEqual(2, $techEventsCount);
    }

    /**
     * Nhóm 5: Trạng thái Đã đọc Độc lập Per-User qua bảng `notification_reads`
     * - Trên thông báo chung của chi nhánh (`user_id = NULL`), khi `CSKH 1` gọi `markAsRead` hoặc `markAllAsRead`:
     *   + `CSKH 1` thấy `is_read = true`, `read_at != null`, `unread_count = 0` (và lọc đúng `?is_read=0|1`).
     *   + Đồng nghiệp `CSKH 2`, `KTV` và `Admin` cùng tiệm vẫn thấy `is_read = false`, `read_at = null` và giữ nguyên `unread_count` của mình!
     */
    public function test_group5_per_user_independent_read_state_via_notification_reads_table(): void
    {
        $ctx = $this->setupMultiTierFixture();

        $shared1 = Notification::create([
            'tenant_id'   => $ctx['tenantA']->id,
            'branch_id'   => $ctx['branchA1']->id,
            'user_id'     => null,
            'target_role' => null,
            'type'        => 'order_status',
            'title'       => 'Thông báo chung #1',
            'message'     => 'Đơn hàng chuyển sang chờ kiểm tra.',
        ]);

        $shared2 = Notification::create([
            'tenant_id'   => $ctx['tenantA']->id,
            'branch_id'   => $ctx['branchA1']->id,
            'user_id'     => null,
            'target_role' => null,
            'type'        => 'sla_warning',
            'title'       => 'Thông báo chung #2',
            'message'     => 'Cảnh báo SLA chi nhánh 1.',
            'severity'    => 'danger',
        ]);

        $personalCskh1 = Notification::create([
            'tenant_id'   => $ctx['tenantA']->id,
            'branch_id'   => $ctx['branchA1']->id,
            'user_id'     => $ctx['cskhA1']->id,
            'target_role' => 'cskh',
            'type'        => 'order_status',
            'title'       => 'Thông báo riêng CSKH 1',
            'message'     => 'Nhắc gọi lại khách hàng VIP.',
        ]);

        // 1. CSKH 1 bấm đọc 1 thông báo chung ($shared1) (gọi 2 lần liên tiếp để kiểm chứng tính Idempotent)
        $this->actingAs($ctx['cskhA1'], 'sanctum')
            ->patchJson("/api/v1/notifications/{$shared1->id}/read")
            ->assertOk()
            ->assertJsonPath('data.is_read', true);

        $this->actingAs($ctx['cskhA1'], 'sanctum')
            ->patchJson("/api/v1/notifications/{$shared1->id}/read")
            ->assertOk()
            ->assertJsonPath('data.is_read', true);

        $this->assertSame(
            1,
            NotificationRead::query()
                ->where('notification_id', $shared1->id)
                ->where('user_id', $ctx['cskhA1']->id)
                ->count()
        );

        // Dòng gốc trên bảng notifications tuyệt đối KHÔNG bị ghi đè is_read = true cho thông báo chung (user_id IS NULL)
        $this->assertFalse((bool) $shared1->fresh()->getRawOriginal('is_read'));

        // Kiểm tra bộ lọc ?is_read=1 và ?is_read=0 theo riêng CSKH 1
        $this->actingAs($ctx['cskhA1'], 'sanctum')
            ->getJson('/api/v1/notifications?is_read=1')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.unread_count', 2);

        $this->actingAs($ctx['cskhA1'], 'sanctum')
            ->getJson('/api/v1/notifications?is_read=0')
            ->assertOk()
            ->assertJsonPath('data.total', 2)
            ->assertJsonPath('data.unread_count', 2);

        // Đồng nghiệp CSKH 2, KTV 1 và Chủ tiệm Admin A vẫn thấy $shared1 là chưa đọc (is_read = false, unread_count = 2)
        foreach ([$ctx['cskhA1Colleague'], $ctx['techA1'], $ctx['adminA']] as $otherStaff) {
            auth()->forgetGuards();
            $staffRes = $this->actingAs($otherStaff, 'sanctum')->getJson('/api/v1/notifications');
            $staffRes->assertOk()
                ->assertJsonPath('data.total', 2)
                ->assertJsonPath('data.unread_count', 2);

            $shared1ForOther = collect($staffRes->json('data.data'))->firstWhere('id', $shared1->id);
            $this->assertNotNull($shared1ForOther);
            $this->assertFalse($shared1ForOther['is_read']);
            $this->assertNull($shared1ForOther['read_at']);
        }

        // 2. CSKH 1 bấm "Đọc tất cả" (POST /api/v1/notifications/read-all) -> Chỉ cập nhật 2 thông báo còn lại của CSKH 1
        auth()->forgetGuards();
        $this->actingAs($ctx['cskhA1'], 'sanctum')
            ->postJson('/api/v1/notifications/read-all')
            ->assertOk()
            ->assertJsonPath('data.updated_count', 2);

        $cskh1AfterAll = $this->actingAs($ctx['cskhA1'], 'sanctum')->getJson('/api/v1/notifications');
        $cskh1AfterAll->assertOk()->assertJsonPath('data.unread_count', 0);
        $this->assertTrue(collect($cskh1AfterAll->json('data.data'))->every(fn ($n) => $n['is_read'] === true));

        // Thông báo cá nhân của CSKH 1 được đồng bộ cột is_read = true trên dòng gốc
        $this->assertTrue((bool) $personalCskh1->fresh()->is_read);

        // Trong khi đó KTV 1, CSKH 2 và Chủ tiệm Admin A vẫn giữ nguyên unread_count = 2!
        foreach ([$ctx['cskhA1Colleague'], $ctx['techA1'], $ctx['adminA']] as $otherStaff) {
            auth()->forgetGuards();
            $afterRes = $this->actingAs($otherStaff, 'sanctum')->getJson('/api/v1/notifications');
            $afterRes->assertOk()->assertJsonPath('data.unread_count', 2);
            $this->assertTrue(collect($afterRes->json('data.data'))->every(fn ($n) => $n['is_read'] === false));
        }
    }

    /**
     * Nhóm 6: Kiểm thử Logic Migration Backfill & Model Hooks (`Notification::creating` + `action_url`)
     * - Hook `Notification::creating` tự suy diễn `tenant_id` từ `order_id` -> `branch_id` -> `user_id` và giữ `tenant_id = NULL` cho thông báo Nền tảng.
     * - Thuộc tính `action_url` điều hướng chuẩn xác (`/platform/stores`, `/platform/approvals`, `/platform/billing`, `/subscription`, `/repairs?id=...`).
     * - Hàm `runSafeBackfill()` của migration xử lý idempotent 4 bước trên dữ liệu lịch sử thô.
     */
    public function test_group6_migration_backfill_and_model_creating_hooks_and_action_urls(): void
    {
        $ctx = $this->setupMultiTierFixture();

        // Phần A: Kiểm chứng Hook Notification::creating và getActionUrlAttribute()
        $fromOrder = Notification::create([
            'order_id' => $ctx['orderA1']->id,
            'type'     => 'order_status',
            'title'    => 'Suy diễn từ order_id',
            'message'  => 'Tự điền tenant_id của đơn hàng.',
        ]);
        $this->assertSame((int) $ctx['tenantA']->id, (int) $fromOrder->tenant_id);
        $this->assertSame("/repairs?id={$ctx['orderA1']->id}", $fromOrder->action_url);

        $fromBranch = Notification::create([
            'branch_id' => $ctx['branchB1']->id,
            'type'      => 'order_status',
            'title'     => 'Suy diễn từ branch_id',
            'message'   => 'Tự điền tenant_id của chi nhánh.',
        ]);
        $this->assertSame((int) $ctx['tenantB']->id, (int) $fromBranch->tenant_id);
        $this->assertSame('/repairs', $fromBranch->action_url);

        $fromUser = Notification::create([
            'user_id' => $ctx['cskhA1']->id,
            'type'    => 'order_status',
            'title'   => 'Suy diễn từ user_id',
            'message' => 'Tự điền tenant_id của nhân viên.',
        ]);
        $this->assertSame((int) $ctx['tenantA']->id, (int) $fromUser->tenant_id);

        $platformReg = Notification::create([
            'user_id'     => $ctx['superAdmin']->id,
            'target_role' => 'super_admin',
            'type'        => 'tenant_registered',
            'title'       => 'Đăng ký gian hàng',
            'message'     => 'Không được suy diễn sang tenant cửa hàng.',
        ]);
        $this->assertNull($platformReg->tenant_id);
        $this->assertSame('/platform/stores', $platformReg->action_url);

        $platformApproval = Notification::create([
            'target_role' => 'super_admin',
            'type'        => 'tenant_approval_pending',
            'title'       => 'Chờ duyệt gian hàng',
            'message'     => 'Điều hướng tới trang phê duyệt.',
        ]);
        $this->assertNull($platformApproval->tenant_id);
        $this->assertSame('/platform/approvals', $platformApproval->action_url);

        $platformBilling = Notification::create([
            'target_role' => 'super_admin',
            'type'        => 'saas_payment_received',
            'title'       => 'Thanh toán gói cước',
            'message'     => 'Điều hướng tới trang tài chính Sàn.',
        ]);
        $this->assertNull($platformBilling->tenant_id);
        $this->assertSame('/platform/billing', $platformBilling->action_url);

        $storeRenewed = Notification::create([
            'tenant_id'   => $ctx['tenantA']->id,
            'target_role' => 'admin',
            'type'        => 'saas_subscription_renewed',
            'title'       => 'Gia hạn gói cước',
            'message'     => 'Điều hướng tới trang gói cước cửa hàng.',
        ]);
        $this->assertSame('/subscription', $storeRenewed->action_url);

        // Phần B: Chèn các dòng dữ liệu lịch sử thô (bỏ qua Eloquent hook) và thực thi backfill idempotent 2 lần
        $now = now();

        $legacyPlatformId = DB::table('notifications')->insertGetId([
            'tenant_id'   => $ctx['tenantA']->id, // Dữ liệu cũ bị gán nhầm tenant_id
            'user_id'     => null,
            'branch_id'   => null,
            'target_role' => null,
            'type'        => 'tenant_registered',
            'title'       => 'Legacy Tenant Registered',
            'message'     => 'Gian hàng cũ đăng ký',
            'severity'    => 'info',
            'is_read'     => 0,
            'created_at'  => $now,
            'updated_at'  => $now,
        ]);

        $legacySuperUserNotifId = DB::table('notifications')->insertGetId([
            'tenant_id'   => null,
            'user_id'     => $ctx['superAdmin']->id,
            'branch_id'   => null,
            'target_role' => null,
            'type'        => 'system_notice',
            'title'       => 'Legacy Super Admin Notice',
            'message'     => 'Gắn với tài khoản super_admin',
            'severity'    => 'info',
            'is_read'     => 1,
            'read_at'     => $now,
            'created_at'  => $now,
            'updated_at'  => $now,
        ]);

        $legacyOrderNotifId = DB::table('notifications')->insertGetId([
            'tenant_id'   => null,
            'user_id'     => null,
            'branch_id'   => null,
            'order_id'    => $ctx['orderA1']->id,
            'target_role' => null,
            'type'        => 'order_status',
            'title'       => 'Đơn Apple Watch đồng hồ thông minh',
            'message'     => 'Khách đồng ý kiểm tra kỹ thuật',
            'severity'    => 'info',
            'is_read'     => 0,
            'created_at'  => $now,
            'updated_at'  => $now,
        ]);

        $legacyBranchPriceNotifId = DB::table('notifications')->insertGetId([
            'tenant_id'   => null,
            'user_id'     => null,
            'branch_id'   => $ctx['branchB1']->id,
            'order_id'    => null,
            'target_role' => null,
            'type'        => 'order_status',
            'title'       => 'Đã bổ sung dịch vụ cũ',
            'message'     => 'Thay màng loa (+350.000 đ) cho đơn sửa chữa cũ',
            'severity'    => 'warning',
            'is_read'     => 0,
            'created_at'  => $now,
            'updated_at'  => $now,
        ]);

        $legacyFeeReadNotifId = DB::table('notifications')->insertGetId([
            'tenant_id'   => null,
            'user_id'     => $ctx['adminA']->id,
            'branch_id'   => null,
            'order_id'    => null,
            'target_role' => null,
            'type'        => 'fee_reminder',
            'title'       => 'Nhắc phí lịch sử',
            'message'     => 'Vui lòng gia hạn gói cước',
            'severity'    => 'warning',
            'is_read'     => 1,
            'read_at'     => $now,
            'created_at'  => $now,
            'updated_at'  => $now,
        ]);

        $migration = require base_path('database/migrations/2026_10_29_000001_add_tenant_isolation_and_notification_reads_table.php');
        $backfillMethod = new \ReflectionMethod($migration, 'runSafeBackfill');
        $backfillMethod->setAccessible(true);

        // Chạy 2 lần liên tiếp để kiểm chứng tính Idempotent tuyệt đối
        $backfillMethod->invoke($migration);
        $backfillMethod->invoke($migration);

        $rowPlatform = DB::table('notifications')->find($legacyPlatformId);
        $this->assertNull($rowPlatform->tenant_id);
        $this->assertSame('super_admin', $rowPlatform->target_role);

        $rowSuperUser = DB::table('notifications')->find($legacySuperUserNotifId);
        $this->assertNull($rowSuperUser->tenant_id);
        $this->assertSame('super_admin', $rowSuperUser->target_role);

        $rowOrder = DB::table('notifications')->find($legacyOrderNotifId);
        $this->assertSame((int) $ctx['tenantA']->id, (int) $rowOrder->tenant_id);
        $this->assertNull($rowOrder->target_role, 'Từ tiếng Việt "đồng hồ" / "đồng ý" không được nhận nhầm là tiền tệ VNĐ.');

        $rowBranchPrice = DB::table('notifications')->find($legacyBranchPriceNotifId);
        $this->assertSame((int) $ctx['tenantB']->id, (int) $rowBranchPrice->tenant_id);
        $this->assertSame('cskh', $rowBranchPrice->target_role, 'Thông báo cũ chứa "(+350.000 đ)" phải tự động gán target_role = cskh để ẩn giá với KTV.');

        $rowFeeRead = DB::table('notifications')->find($legacyFeeReadNotifId);
        $this->assertSame((int) $ctx['tenantA']->id, (int) $rowFeeRead->tenant_id);
        $this->assertSame('admin', $rowFeeRead->target_role);

        $this->assertSame(
            1,
            DB::table('notification_reads')
                ->where('notification_id', $legacyFeeReadNotifId)
                ->where('user_id', $ctx['adminA']->id)
                ->count()
        );
    }

    /**
     * Nhóm 7: Kiểm thử Phân quyền HTTP `POST /api/v1/broadcasting/auth` & `POST /broadcasting/auth`
     * - Guest -> `401 Unauthorized`
     * - `super_admin` -> `200` (có chữ ký HMAC `auth`) cho `private-platform.super_admin` & `private-user.{self}`, `403` cho mọi kênh `private-tenant.*`
     * - `admin` Tenant A -> `200` cho `private-tenant.{A}.*`, `403` cho `private-tenant.{B}.*`, `private-tenant.{A}.branch.{B1}.*` (cross-tenant branch IDOR) và `private-platform.super_admin`
     * - Nhân sự chi nhánh (`cskh`, `technician`, `tech`) -> `200` cho đúng chi nhánh & vai trò chuẩn hóa của mình, `403` cho chi nhánh khác, vai trò khác, kênh toàn tiệm `private-tenant.{A}.orders`, và kênh toàn cục cũ `private-orders.all`.
     */
    public function test_group7_http_broadcasting_auth_endpoints_enforce_strict_3_tier_channel_authorization(): void
    {
        $ctx = $this->setupMultiTierFixture();

        $superToken = $ctx['superAdmin']->createToken('super-ws-test')->plainTextToken;
        $adminAToken = $ctx['adminA']->createToken('admin-a-ws-test')->plainTextToken;
        $cskhA1Token = $ctx['cskhA1']->createToken('cskh-a1-ws-test')->plainTextToken;
        $techA1Token = $ctx['techA1']->createToken('tech-a1-ws-test')->plainTextToken;
        $techAliasToken = $ctx['techA1Alias']->createToken('tech-alias-ws-test')->plainTextToken;

        $socketId = '123456.7890123';

        $postBroadcastAuth = function (?string $bearerToken, string $channelName, string $endpoint = '/api/v1/broadcasting/auth') use ($socketId) {
            auth()->forgetGuards();
            $req = $this->withHeader('Accept', 'application/json');
            if ($bearerToken !== null) {
                $req = $req->withHeader('Authorization', 'Bearer ' . $bearerToken);
            }

            return $req->postJson($endpoint, [
                'socket_id'    => $socketId,
                'channel_name' => $channelName,
            ]);
        };

        // 1. Guest chưa xác thực -> 401 trên cả 2 endpoint
        $postBroadcastAuth(null, 'private-platform.super_admin', '/api/v1/broadcasting/auth')->assertStatus(401);
        $postBroadcastAuth(null, 'private-platform.super_admin', '/broadcasting/auth')->assertStatus(401);

        // 2. Super Admin: 200 trên platform.super_admin & user.{self} (trên cả /api/v1/broadcasting/auth lẫn /broadcasting/auth), 403 trên mọi kênh cửa hàng
        foreach (['/api/v1/broadcasting/auth', '/broadcasting/auth'] as $endpoint) {
            $okPlatform = $postBroadcastAuth($superToken, 'private-platform.super_admin', $endpoint);
            $okPlatform->assertOk();
            $this->assertMatchesRegularExpression('/^[^:]+:[a-f0-9]{64}$/', (string) $okPlatform->json('auth'));
        }

        $postBroadcastAuth($superToken, "private-user.{$ctx['superAdmin']->id}")->assertOk();
        $postBroadcastAuth($superToken, "private-user.{$ctx['adminA']->id}")->assertStatus(403);
        $postBroadcastAuth($superToken, "private-tenant.{$ctx['tenantA']->id}.orders")->assertStatus(403);
        $postBroadcastAuth($superToken, "private-tenant.{$ctx['tenantA']->id}.role.admin")->assertStatus(403);
        $postBroadcastAuth($superToken, "private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchA1']->id}.orders")->assertStatus(403);
        $postBroadcastAuth($superToken, "private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchA1']->id}.cskh")->assertStatus(403);

        // 3. Chủ tiệm Tenant A: 200 trên các kênh thuộc Tenant A; 403 trên platform, Tenant B, hoặc Cross-Tenant Branch IDOR (tenant A + branch B1)
        $okAdminOrders = $postBroadcastAuth($adminAToken, "private-tenant.{$ctx['tenantA']->id}.orders");
        $okAdminOrders->assertOk();
        $this->assertMatchesRegularExpression('/^[^:]+:[a-f0-9]{64}$/', (string) $okAdminOrders->json('auth'));

        $postBroadcastAuth($adminAToken, "private-tenant.{$ctx['tenantA']->id}.role.admin")->assertOk();
        $postBroadcastAuth($adminAToken, "private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchA1']->id}.orders")->assertOk();
        $postBroadcastAuth($adminAToken, "private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchA2']->id}.cskh")->assertOk();

        $postBroadcastAuth($adminAToken, 'private-platform.super_admin')->assertStatus(403);
        $postBroadcastAuth($adminAToken, "private-tenant.{$ctx['tenantB']->id}.orders")->assertStatus(403);
        $postBroadcastAuth($adminAToken, "private-tenant.{$ctx['tenantB']->id}.branch.{$ctx['branchB1']->id}.orders")->assertStatus(403);
        $postBroadcastAuth($adminAToken, "private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchB1']->id}.orders")->assertStatus(403);
        $postBroadcastAuth($adminAToken, "private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchB1']->id}.cskh")->assertStatus(403);

        // 4. Nhân sự Chi nhánh (CSKH CN1, KTV 'technician' CN1, KTV 'tech' CN1)
        $postBroadcastAuth($cskhA1Token, "private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchA1']->id}.orders")->assertOk();
        $postBroadcastAuth($cskhA1Token, "private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchA1']->id}.cskh")->assertOk();
        $postBroadcastAuth($cskhA1Token, "private-user.{$ctx['cskhA1']->id}")->assertOk();

        $postBroadcastAuth($cskhA1Token, "private-tenant.{$ctx['tenantA']->id}.orders")->assertStatus(403);
        $postBroadcastAuth($cskhA1Token, "private-tenant.{$ctx['tenantA']->id}.role.admin")->assertStatus(403);
        $postBroadcastAuth($cskhA1Token, "private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchA1']->id}.technician")->assertStatus(403);
        $postBroadcastAuth($cskhA1Token, "private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchA2']->id}.cskh")->assertStatus(403);
        $postBroadcastAuth($cskhA1Token, 'private-orders.all')->assertStatus(403);
        $postBroadcastAuth($cskhA1Token, "private-branch.{$ctx['branchA1']->id}.orders")->assertStatus(403);

        // KTV ('technician' & 'tech') vào được kênh chi nhánh & vai trò kỹ thuật của mình, bị chặn 403 trên kênh báo giá CSKH
        foreach ([$techA1Token, $techAliasToken] as $tToken) {
            $postBroadcastAuth($tToken, "private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchA1']->id}.orders")->assertOk();
            $postBroadcastAuth($tToken, "private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchA1']->id}.technician")->assertOk();
            $postBroadcastAuth($tToken, "private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchA1']->id}.tech")->assertOk();
            $postBroadcastAuth($tToken, "private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchA1']->id}.cskh")->assertStatus(403);
            $postBroadcastAuth($tToken, "private-tenant.{$ctx['tenantA']->id}.branch.{$ctx['branchA2']->id}.technician")->assertStatus(403);
            $postBroadcastAuth($tToken, "private-tenant.{$ctx['tenantA']->id}.orders")->assertStatus(403);
        }
    }
}
