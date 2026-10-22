<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Part;
use App\Models\Payment;
use App\Models\PersonalAccessToken;
use App\Models\RepairOrder;
use App\Models\Scopes\TenantScope;
use App\Models\SystemSetting;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class QueryPerformanceOptimizationTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();

        TenantScope::clearCache();
        SystemSetting::clearCache();
    }

    public function test_tenant_scope_caches_master_tenant_id_in_memory_across_queries_and_creates(): void
    {
        $masterTenant = Tenant::firstOrCreate(
            ['code' => 'fixo-master'],
            ['name' => 'PodsCare Master', 'status' => 'active']
        );

        $adminUser = User::factory()->create([
            'role'      => 'admin',
            'tenant_id' => $masterTenant->id,
            'is_active' => true,
        ]);

        $this->actingAs($adminUser);
        TenantScope::clearCache();

        DB::enableQueryLog();
        DB::flushQueryLog();

        // Thực hiện nhiều truy vấn qua các model dùng BelongsToTenant (kích hoạt TenantScope::apply)
        Customer::query()->count();
        RepairOrder::query()->count();
        Part::query()->count();
        Branch::query()->count();
        Customer::query()->first();
        RepairOrder::query()->first();

        // Tạo bản ghi mới khi user không có tenant_id (kích hoạt BelongsToTenant::bootBelongsToTenant)
        $superAdmin = User::factory()->create([
            'role'      => 'super_admin',
            'tenant_id' => null,
            'is_active' => true,
        ]);
        $this->actingAs($superAdmin);
        Customer::create([
            'name'  => 'Khách hàng Test Cache',
            'phone' => '0901234567',
        ]);

        $queries = DB::getQueryLog();
        $masterLookupQueries = array_filter($queries, function (array $q): bool {
            return str_contains(strtolower($q['query']), 'tenants')
                && in_array('fixo-master', $q['bindings'] ?? [], true);
        });

        $this->assertCount(
            1,
            $masterLookupQueries,
            'Truy vấn tìm tenant fixo-master chỉ được phép chạy tối đa 1 lần trong suốt vòng đời request.'
        );
        $this->assertSame($masterTenant->id, TenantScope::resolveMasterTenantId());
    }

    public function test_system_setting_caches_values_in_memory_and_invalidates_on_set(): void
    {
        SystemSetting::set('sepay_bank_name', 'Vietcombank', 'string', 'sepay');
        SystemSetting::clearCache();

        DB::enableQueryLog();
        DB::flushQueryLog();

        $firstRead = SystemSetting::get('sepay_bank_name');
        $secondRead = SystemSetting::get('sepay_bank_name');
        $thirdRead = SystemSetting::get('sepay_bank_name');

        $queries = DB::getQueryLog();
        $settingSelects = array_filter($queries, function (array $q): bool {
            return str_contains(strtolower($q['query']), 'system_settings');
        });

        $this->assertSame('Vietcombank', $firstRead);
        $this->assertSame('Vietcombank', $secondRead);
        $this->assertSame('Vietcombank', $thirdRead);
        $this->assertCount(1, $settingSelects, 'SystemSetting::get() phải lấy từ bộ nhớ đệm tĩnh ở các lần đọc tiếp theo.');

        // Khi gọi set(), cache phải được cập nhật ngay
        SystemSetting::set('sepay_bank_name', 'MBBank', 'string', 'sepay');
        DB::flushQueryLog();

        $afterUpdateRead = SystemSetting::get('sepay_bank_name');
        $this->assertSame('MBBank', $afterUpdateRead);
        $this->assertCount(0, DB::getQueryLog(), 'Sau khi SystemSetting::set() cập nhật cache, SystemSetting::get() không cần query lại DB.');
    }

    public function test_tenant_settings_endpoint_does_not_fire_duplicate_tenant_select_query(): void
    {
        $tenant = Tenant::create([
            'code'                => 'test-opt-tenant',
            'name'                => 'Cửa hàng Tối Ưu SQL',
            'status'              => 'active',
            'plan'                => 'pro',
            'hotline'             => '0909111222',
            'receipt_footer_note' => 'Cảm ơn quý khách',
        ]);

        $user = User::factory()->create([
            'role'      => 'admin',
            'tenant_id' => $tenant->id,
            'is_active' => true,
        ]);

        $plainTextToken = $user->createToken('settings-test')->plainTextToken;
        auth()->forgetGuards();

        DB::enableQueryLog();
        DB::flushQueryLog();

        $response = $this->withHeader('Authorization', 'Bearer ' . $plainTextToken)
            ->getJson('/api/v1/tenant/settings');

        $response->assertOk()
            ->assertJsonPath('data.tenant_id', $tenant->id)
            ->assertJsonPath('data.hotline', '0909111222');

        $tenantByIdQueries = array_filter(DB::getQueryLog(), function (array $q) use ($tenant): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'select')
                && str_contains($sql, 'tenants')
                && (
                    in_array($tenant->id, $q['bindings'] ?? [], false)
                    || str_contains($sql, 'in (' . (int) $tenant->id . ')')
                );
        });

        $this->assertCount(
            1,
            $tenantByIdQueries,
            'GET /api/v1/tenant/settings chỉ được phép SELECT bảng tenants theo ID đúng 1 lần (không gọi ->fresh() dư thừa).'
        );
    }

    public function test_payment_show_reuses_eager_loaded_repair_order_without_second_query(): void
    {
        $tenant = Tenant::create([
            'code'   => 'test-pay-opt',
            'name'   => 'Gian hàng Payment Opt',
            'status' => 'active',
        ]);

        $branch = Branch::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $tenant->id,
            'code'      => 'CN-PAY-OPT',
            'name'      => 'Chi nhánh Payment Opt',
            'address'   => '123 Nguyễn Huệ, Q.1',
            'phone'     => '0901112222',
            'is_active' => true,
        ]);

        $cskhUser = User::factory()->create([
            'role'      => 'cskh',
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'is_active' => true,
        ]);

        $customer = Customer::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $tenant->id,
            'name'      => 'Khách Thanh Toán',
            'phone'     => '0912345678',
        ]);

        $deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'model_code'  => 'A2931',
            'category'    => 'AirPods Pro',
            'name'        => 'AirPods Pro 2',
            'device_type' => 'AirPods',
            'is_active'   => true,
        ]);

        $order = RepairOrder::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id'          => $tenant->id,
            'branch_id'          => $branch->id,
            'order_code'         => 'FX26-OPT-0001',
            'customer_id'        => $customer->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Rè tai trái',
            'status'             => 'ready_for_return',
            'total_price'        => 500000,
            'created_by_user_id' => $cskhUser->id,
        ]);

        $payment = Payment::create([
            'payment_code'        => 'FX26-PY-OPT001',
            'repair_order_id'     => $order->id,
            'amount'              => 500000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'pending',
            'received_by_user_id' => $cskhUser->id,
        ]);

        $this->actingAs($cskhUser, 'sanctum');
        // Làm nóng master tenant cache trước khi đo riêng truy vấn của PaymentController::show
        TenantScope::resolveMasterTenantId();

        DB::enableQueryLog();
        DB::flushQueryLog();

        $response = $this->getJson("/api/v1/payments/{$payment->id}");
        $response->assertOk()
            ->assertJsonPath('data.id', $payment->id)
            ->assertJsonPath('data.repair_order.id', $order->id);

        $repairOrderSelects = array_filter(DB::getQueryLog(), function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'select') && str_contains($sql, 'repair_orders');
        });

        $this->assertCount(
            1,
            $repairOrderSelects,
            'GET /api/v1/payments/{id} phải tái sử dụng quan hệ repairOrder đã eager-load, chỉ bắn 1 câu SELECT vào repair_orders.'
        );
    }

    public function test_audit_log_reuses_authenticated_user_name_without_duplicate_user_query(): void
    {
        $tenant = Tenant::firstOrCreate(
            ['code' => 'fixo-master'],
            ['name' => 'PodsCare Master', 'status' => 'active']
        );

        $user = User::factory()->create([
            'name'      => 'Nguyễn Văn Tester',
            'role'      => 'admin',
            'tenant_id' => $tenant->id,
            'is_active' => true,
        ]);

        $this->actingAs($user);

        DB::enableQueryLog();
        DB::flushQueryLog();

        $log = AuditLog::create([
            'tenant_id'      => $tenant->id,
            'user_id'        => $user->id,
            'action'         => 'TEST_ACTION',
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => 1,
            'details'        => 'Kiểm tra tạo AuditLog không query lại bảng users',
        ]);

        $userQueries = array_filter(DB::getQueryLog(), function (array $q): bool {
            return str_contains(strtolower($q['query']), 'from "users"')
                || str_contains(strtolower($q['query']), 'from `users`');
        });

        $this->assertSame('Nguyễn Văn Tester', $log->user_name);
        $this->assertCount(0, $userQueries, 'AuditLog::creating không được query lại bảng users khi user_id trùng với auth()->id().');
    }

    public function test_auth_login_eager_loads_tenant_and_branch_without_lazy_loading(): void
    {
        $tenant = Tenant::create([
            'code'   => 'login-opt-store',
            'name'   => 'Gian hàng Login Opt',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $branch = Branch::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $tenant->id,
            'code'      => 'CN-LOGIN-OPT',
            'name'      => 'Chi nhánh Login Opt',
            'address'   => '456 Lê Lợi, Q.1',
            'phone'     => '0903334444',
            'is_active' => true,
        ]);

        $user = User::factory()->create([
            'name'      => 'Admin Login Opt',
            'email'     => 'login.opt@podscare.vn',
            'password'  => Hash::make('Password123!'),
            'role'      => 'admin',
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'is_active' => true,
        ]);

        DB::enableQueryLog();
        DB::flushQueryLog();

        Model::preventLazyLoading(true);
        try {
            $response = $this->postJson('/api/v1/auth/login', [
                'email'      => $user->email,
                'password'   => 'Password123!',
                'store_code' => 'login-opt-store',
            ]);
        } finally {
            Model::preventLazyLoading(! $this->app->isProduction());
        }

        $response->assertOk()
            ->assertJsonPath('data.user.id', $user->id)
            ->assertJsonPath('data.user.tenant.id', $tenant->id)
            ->assertJsonPath('data.user.branch.id', $branch->id);

        $branchSelects = array_filter(DB::getQueryLog(), function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'select') && str_contains($sql, 'branches');
        });

        $this->assertCount(
            1,
            $branchSelects,
            'POST /api/v1/auth/login phải eager-load branch trong 1 truy vấn và không gây lazy-loading.'
        );
    }

    public function test_sanctum_personal_access_token_throttles_last_used_at_updates(): void
    {
        $tenant = Tenant::firstOrCreate(
            ['code' => 'fixo-master'],
            ['name' => 'PodsCare Master', 'status' => 'active']
        );

        $user = User::factory()->create([
            'role'      => 'admin',
            'tenant_id' => $tenant->id,
            'is_active' => true,
        ]);

        $newToken = $user->createToken('test-device');
        $plainTextToken = $newToken->plainTextToken;
        /** @var PersonalAccessToken $tokenModel */
        $tokenModel = $newToken->accessToken;

        $this->assertNull($tokenModel->fresh()->last_used_at);

        // Request 1 (GET): Lần đầu tiên sử dụng token (last_used_at === null) -> Phải cập nhật vào DB (1 UPDATE)
        DB::enableQueryLog();
        DB::flushQueryLog();

        $response1 = $this->withHeader('Authorization', 'Bearer ' . $plainTextToken)
            ->getJson('/api/v1/auth/me');
        $response1->assertOk();

        $firstRequestUpdates = array_filter(DB::getQueryLog(), function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'update') && str_contains($sql, 'personal_access_tokens');
        });
        $this->assertCount(1, $firstRequestUpdates, 'Request đầu tiên khi last_used_at=null phải chạy 1 câu lệnh UPDATE personal_access_tokens.');

        $firstUsedAt = $tokenModel->fresh()->last_used_at;
        $this->assertNotNull($firstUsedAt, 'Lần đầu dùng token phải ghi nhận last_used_at.');

        // Request 2 (GET) & Request 3 (POST): Gọi liên tiếp trong cửa sổ < 5 phút -> 0 câu lệnh UPDATE personal_access_tokens
        auth()->forgetGuards();
        DB::flushQueryLog();

        $response2 = $this->withHeader('Authorization', 'Bearer ' . $plainTextToken)
            ->getJson('/api/v1/tenant/settings');
        $response2->assertOk();

        auth()->forgetGuards();

        $response3 = $this->withHeader('Authorization', 'Bearer ' . $plainTextToken)
            ->postJson('/api/v1/tenant/settings', [
                'hotline' => '0988777666',
            ]);
        $response3->assertOk();

        $tokenUpdateQueriesInWindow = array_filter(DB::getQueryLog(), function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'update') && str_contains($sql, 'personal_access_tokens');
        });

        $this->assertCount(
            0,
            $tokenUpdateQueriesInWindow,
            'Các request GET/POST tiếp theo trong vòng 5 phút phải có 0 câu lệnh UPDATE personal_access_tokens.'
        );

        // Request 4: Khi last_used_at đã cũ hơn 5 phút (>= 300s) -> Phải cập nhật lại vào DB
        $staleTimestamp = now()->subMinutes(6);
        DB::table('personal_access_tokens')
            ->where('id', $tokenModel->id)
            ->update(['last_used_at' => $staleTimestamp]);

        auth()->forgetGuards();
        DB::flushQueryLog();

        $response4 = $this->withHeader('Authorization', 'Bearer ' . $plainTextToken)
            ->getJson('/api/v1/auth/me');
        $response4->assertOk();

        $tokenUpdateQueriesAfterWindow = array_filter(DB::getQueryLog(), function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'update') && str_contains($sql, 'personal_access_tokens');
        });

        $this->assertCount(
            1,
            $tokenUpdateQueriesAfterWindow,
            'Khi last_used_at đã quá 5 phút (>= 300s), request tiếp theo phải cập nhật lại last_used_at.'
        );
    }

    public function test_phase2_mysql_performance_indexes_migration_creates_and_rolls_back_all_indexes_safely(): void
    {
        $migration = require base_path('database/migrations/2026_10_22_000001_add_performance_indexes_for_mysql.php');

        $expectedIndexes = [
            'users' => [
                'idx_users_phone',
                'idx_users_tenant_role_branch',
            ],
            'repair_orders' => [
                'idx_ro_tenant_branch_status',
                'idx_ro_tenant_branch_created',
                'idx_ro_tenant_status_created',
                'idx_ro_tenant_created',
                'idx_ro_branch_order_code',
                'idx_ro_handed_over_at',
                'idx_ro_qc_passed_at',
                'idx_ro_repair_completed_at',
                'idx_ro_repair_started_at',
                'idx_ro_serial_number',
            ],
            'payments' => [
                'idx_pay_order_status',
                'idx_pay_order_status_paid_at',
                'idx_pay_tenant_status_paid_at',
                'idx_pay_status',
                'idx_pay_method',
            ],
            'inventory_transactions' => [
                'idx_inv_tx_order_type',
            ],
            'qc_inspections' => [
                'idx_qc_order_result',
            ],
            'warranties' => [
                'idx_warranties_status_end',
            ],
            'warranty_claims' => [
                'idx_wc_status',
                'idx_wc_created_at',
            ],
            'telegram_recipients' => [
                'idx_tg_chat_active',
                'idx_tg_tenant_phone',
            ],
            'audit_logs' => [
                'idx_audit_tenant_created',
                'idx_audit_action',
            ],
            'work_shifts' => [
                'idx_work_shifts_opened_at',
            ],
            'cash_transactions' => [
                'idx_cash_tx_tenant_branch_created',
                'idx_cash_tx_category',
            ],
        ];

        // Chạy up() 2 lần liên tiếp để kiểm chứng tính idempotent
        $migration->up();
        $migration->up();

        foreach ($expectedIndexes as $table => $indexes) {
            foreach ($indexes as $indexName) {
                $this->assertTrue(
                    \Illuminate\Support\Facades\Schema::hasIndex($table, $indexName),
                    "Bảng {$table} phải có chỉ mục {$indexName} sau khi chạy migration up()."
                );
            }
        }

        // Kiểm chứng rollback (down) gỡ toàn bộ index an toàn
        $migration->down();

        foreach ($expectedIndexes as $table => $indexes) {
            foreach ($indexes as $indexName) {
                $this->assertFalse(
                    \Illuminate\Support\Facades\Schema::hasIndex($table, $indexName),
                    "Bảng {$table} phải gỡ chỉ mục {$indexName} sau khi chạy migration down()."
                );
            }
        }

        // Bật lại toàn bộ index cho môi trường test
        $migration->up();
    }

    public function test_phase2_date_filters_use_sargable_range_queries_without_sql_date_function(): void
    {
        $tenant = Tenant::firstOrCreate(
            ['code' => 'fixo-master'],
            ['name' => 'PodsCare Master', 'status' => 'active']
        );

        $admin = User::factory()->create([
            'role'      => 'admin',
            'tenant_id' => $tenant->id,
            'is_active' => true,
        ]);

        $this->actingAs($admin, 'sanctum');

        DB::enableQueryLog();
        DB::flushQueryLog();

        $this->getJson('/api/v1/audit-logs?from_date=2026-10-01&to_date=2026-10-21')->assertOk();
        $this->getJson('/api/v1/cashbook/transactions?from_date=2026-10-01&to_date=2026-10-21')->assertOk();
        $this->getJson('/api/v1/shifts?from_date=2026-10-01&to_date=2026-10-21')->assertOk();
        $this->getJson('/api/v1/payments?date=2026-10-21')->assertOk();
        $this->getJson('/api/v1/kpi/staff?from_date=2026-10-01&to_date=2026-10-21')->assertOk();

        $nonSargableDateQueries = array_filter(DB::getQueryLog(), function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'date(`created_at`)')
                || str_contains($sql, 'date("created_at")')
                || str_contains($sql, 'date(`opened_at`)')
                || str_contains($sql, 'date("opened_at")')
                || str_contains($sql, 'date(coalesce(paid_at, created_at))');
        });

        $this->assertCount(
            0,
            $nonSargableDateQueries,
            'Các bộ lọc ngày trên AuditLog, CashTransaction, Shift, Payment và KPI không được bọc hàm DATE() lên cột thời gian.'
        );
    }

    public function test_phase2_date_filters_preserve_exact_day_boundaries_and_coalesce_semantics(): void
    {
        $tenant = Tenant::create([
            'code'   => 'date-boundary-tenant',
            'name'   => 'Gian hàng Boundary Test',
            'status' => 'active',
        ]);

        $branch = Branch::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $tenant->id,
            'code'      => 'CN-BOUNDARY',
            'name'      => 'Chi nhánh Boundary',
            'address'   => '100 Nguyễn Thị Minh Khai',
            'phone'     => '0905556666',
            'is_active' => true,
        ]);

        $admin = User::factory()->create([
            'role'      => 'admin',
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'is_active' => true,
        ]);

        $this->actingAs($admin, 'sanctum');

        // 1. Kiểm tra biên 00:00:00 và 23:59:59 trên AuditLog
        $logBefore = AuditLog::create([
            'tenant_id'      => $tenant->id,
            'user_id'        => $admin->id,
            'action'         => 'BOUNDARY_TEST',
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => 101,
            'details'        => 'Trước biên 1 giây',
        ]);
        DB::table('audit_logs')->where('id', $logBefore->id)->update(['created_at' => '2026-10-14 23:59:59']);

        $logStart = AuditLog::create([
            'tenant_id'      => $tenant->id,
            'user_id'        => $admin->id,
            'action'         => 'BOUNDARY_TEST',
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => 102,
            'details'        => 'Đầu ngày 00:00:00',
        ]);
        DB::table('audit_logs')->where('id', $logStart->id)->update(['created_at' => '2026-10-15 00:00:00']);

        $logEnd = AuditLog::create([
            'tenant_id'      => $tenant->id,
            'user_id'        => $admin->id,
            'action'         => 'BOUNDARY_TEST',
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => 103,
            'details'        => 'Cuối ngày 23:59:59',
        ]);
        DB::table('audit_logs')->where('id', $logEnd->id)->update(['created_at' => '2026-10-15 23:59:59']);

        $logAfter = AuditLog::create([
            'tenant_id'      => $tenant->id,
            'user_id'        => $admin->id,
            'action'         => 'BOUNDARY_TEST',
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => 104,
            'details'        => 'Sau biên 1 giây',
        ]);
        DB::table('audit_logs')->where('id', $logAfter->id)->update(['created_at' => '2026-10-16 00:00:00']);

        $auditRes = $this->getJson('/api/v1/audit-logs?action=BOUNDARY_TEST&from_date=2026-10-15&to_date=2026-10-15');
        $auditRes->assertOk();
        $returnedAuditIds = collect($auditRes->json('data.data'))->pluck('id')->all();

        $this->assertContains($logStart->id, $returnedAuditIds, 'Bản ghi lúc 00:00:00 phải nằm trong kết quả lọc ngày.');
        $this->assertContains($logEnd->id, $returnedAuditIds, 'Bản ghi lúc 23:59:59 phải nằm trong kết quả lọc ngày.');
        $this->assertNotContains($logBefore->id, $returnedAuditIds, 'Bản ghi lúc 23:59:59 ngày hôm trước phải bị loại trừ.');
        $this->assertNotContains($logAfter->id, $returnedAuditIds, 'Bản ghi lúc 00:00:00 ngày hôm sau phải bị loại trừ.');

        // 2. Kiểm tra ngữ nghĩa COALESCE(paid_at, created_at) trên PaymentController::index
        $customer = Customer::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $tenant->id,
            'name'      => 'Khách Boundary Payment',
            'phone'     => '0919888777',
        ]);
        $deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'model_code'  => 'A2931',
            'category'    => 'AirPods Pro',
            'name'        => 'AirPods Pro 2',
            'device_type' => 'AirPods',
            'is_active'   => true,
        ]);
        $order = RepairOrder::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id'          => $tenant->id,
            'branch_id'          => $branch->id,
            'order_code'         => 'FX26-BND-0001',
            'customer_id'        => $customer->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Test lọc ngày payment',
            'status'             => 'ready_for_return',
            'total_price'        => 300000,
            'created_by_user_id' => $admin->id,
        ]);

        // Payment A: paid_at đầu ngày 2026-10-15 00:00:00 (created_at ngày 14) -> Phải khớp ngày 15
        $payStart = Payment::create([
            'payment_code'        => 'FX26-PY-BND01',
            'repair_order_id'     => $order->id,
            'amount'              => 100000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => '2026-10-15 00:00:00',
            'received_by_user_id' => $admin->id,
        ]);
        DB::table('payments')->where('id', $payStart->id)->update(['created_at' => '2026-10-14 20:00:00']);

        // Payment B: pending (paid_at = null), created_at cuối ngày 2026-10-15 23:59:59 -> Phải khớp ngày 15
        $payPendingEnd = Payment::create([
            'payment_code'        => 'FX26-PY-BND02',
            'repair_order_id'     => $order->id,
            'amount'              => 100000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'pending',
            'paid_at'             => null,
            'received_by_user_id' => $admin->id,
        ]);
        DB::table('payments')->where('id', $payPendingEnd->id)->update(['created_at' => '2026-10-15 23:59:59']);

        // Payment C: created_at ngày 15 nhưng paid_at ngày 16 -> Không được khớp ngày 15
        $payPaidNextDay = Payment::create([
            'payment_code'        => 'FX26-PY-BND03',
            'repair_order_id'     => $order->id,
            'amount'              => 100000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'paid',
            'paid_at'             => '2026-10-16 08:30:00',
            'received_by_user_id' => $admin->id,
        ]);
        DB::table('payments')->where('id', $payPaidNextDay->id)->update(['created_at' => '2026-10-15 12:00:00']);

        $payRes = $this->getJson('/api/v1/payments?date=2026-10-15');
        $payRes->assertOk();
        $returnedPayIds = collect($payRes->json('data.data'))->pluck('id')->all();

        $this->assertContains($payStart->id, $returnedPayIds, 'Payment có paid_at=2026-10-15 00:00:00 phải khớp.');
        $this->assertContains($payPendingEnd->id, $returnedPayIds, 'Payment có paid_at=null và created_at=2026-10-15 23:59:59 phải khớp.');
        $this->assertNotContains($payPaidNextDay->id, $returnedPayIds, 'Payment có created_at ngày 15 nhưng paid_at ngày 16 không được khớp ngày 15.');
    }

    public function test_phase2_phone_helper_eliminates_nested_replace_functions_on_column(): void
    {
        $tenant = Tenant::create([
            'code'   => 'phone-opt-tenant',
            'name'   => 'Gian hàng Phone Opt',
            'status' => 'active',
        ]);

        $customer = Customer::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $tenant->id,
            'name'      => 'Khách Tìm SĐT Chuẩn Hóa',
            'phone'     => '0898842339',
        ]);

        $searchInputs = [
            'Có số 0 đầu'              => '0898842339',
            'Thiếu số 0 đầu'           => '898842339',
            'Có mã quốc gia +84'       => '+84 898 842 339',
            'Có dấu chấm/gạch/cách'    => '0898.842-339',
            'Có ký tự Unicode vô hình' => "\u{202D}\u{200B}089 884 2339\u{202C}",
        ];

        foreach ($searchInputs as $scenario => $keyword) {
            $query = Customer::withoutGlobalScopes()->where('tenant_id', $tenant->id);
            \App\Support\PhoneHelper::applyPhoneColumnSearch($query, 'phone', $keyword, 'and');

            $sql = strtolower($query->toSql());
            $this->assertStringNotContainsString(
                'replace(',
                $sql,
                "Kịch bản [{$scenario}]: PhoneHelper::applyPhoneColumnSearch() không được bọc hàm REPLACE() lên cột phone trong SQL."
            );

            $matchedIds = $query->pluck('id')->all();
            $this->assertContains(
                $customer->id,
                $matchedIds,
                "Kịch bản [{$scenario}] với từ khóa '{$keyword}' phải tìm thấy chính xác khách hàng có SĐT 0898842339."
            );
        }
    }

    public function test_phase3_kpi_dashboard_calculates_reconciliation_ar_and_status_counts_via_sql_aggregates_with_reduced_query_count(): void
    {
        $tenant = Tenant::create([
            'code'   => 'kpi-phase3-tenant',
            'name'   => 'Gian hàng KPI Phase 3',
            'status' => 'active',
        ]);

        $branch = Branch::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $tenant->id,
            'code'      => 'CN-KPI3',
            'name'      => 'Chi nhánh KPI 3',
            'address'   => '88 Nguyễn Huệ, Q.1',
            'phone'     => '0903334444',
            'is_active' => true,
        ]);

        $admin = User::factory()->create([
            'role'      => 'admin',
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'is_active' => true,
        ]);

        $customer = Customer::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $tenant->id,
            'name'      => 'Khách Hàng KPI Phase 3',
            'phone'     => '0906667777',
        ]);

        $deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'model_code'  => 'A2931',
            'category'    => 'AirPods Pro',
            'name'        => 'AirPods Pro 2',
            'device_type' => 'AirPods',
            'is_active'   => true,
        ]);

        // Đơn 1: completed (thanh toán dư: total_price = 300.000đ, đã thu 350.000đ -> AR của đơn phải = 0, tuyệt đối không âm -50.000đ)
        $orderCompletedOverpaid = RepairOrder::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id'          => $tenant->id,
            'branch_id'          => $branch->id,
            'order_code'         => 'FX26-KPI3-001',
            'customer_id'        => $customer->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Thay pin hoàn tất thu dư',
            'status'             => 'completed',
            'total_price'        => 300000,
            'handed_over_at'     => now(),
            'created_by_user_id' => $admin->id,
        ]);
        Payment::create([
            'payment_code'        => 'FX26-PY-K301',
            'repair_order_id'     => $orderCompletedOverpaid->id,
            'amount'              => 350000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $admin->id,
        ]);

        // Đơn 2: completed (500.000đ, mới thu 200.000đ paid + 100.000đ cancelled -> AR = 300.000đ)
        $orderCompletedPartial = RepairOrder::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id'          => $tenant->id,
            'branch_id'          => $branch->id,
            'order_code'         => 'FX26-KPI3-002',
            'customer_id'        => $customer->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Thay vỏ hoàn tất nợ 1 phần',
            'status'             => 'completed',
            'total_price'        => 500000,
            'handed_over_at'     => now(),
            'created_by_user_id' => $admin->id,
        ]);
        Payment::create([
            'payment_code'        => 'FX26-PY-K302A',
            'repair_order_id'     => $orderCompletedPartial->id,
            'amount'              => 200000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $admin->id,
        ]);
        Payment::create([
            'payment_code'        => 'FX26-PY-K302B',
            'repair_order_id'     => $orderCompletedPartial->id,
            'amount'              => 100000,
            'payment_method'      => 'cash',
            'status'              => 'cancelled',
            'paid_at'             => null,
            'received_by_user_id' => $admin->id,
        ]);

        // Đơn 3: ready_for_return (400.000đ, thu 150.000đ paid + 250.000đ pending -> AR = 250.000đ)
        $orderReady = RepairOrder::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id'          => $tenant->id,
            'branch_id'          => $branch->id,
            'order_code'         => 'FX26-KPI3-003',
            'customer_id'        => $customer->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Chờ trả khách',
            'status'             => 'ready_for_return',
            'total_price'        => 400000,
            'qc_passed_at'       => now(),
            'created_by_user_id' => $admin->id,
        ]);
        Payment::create([
            'payment_code'        => 'FX26-PY-K303A',
            'repair_order_id'     => $orderReady->id,
            'amount'              => 150000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $admin->id,
        ]);
        Payment::create([
            'payment_code'        => 'FX26-PY-K303B',
            'repair_order_id'     => $orderReady->id,
            'amount'              => 250000,
            'payment_method'      => 'vietqr',
            'status'              => 'pending',
            'paid_at'             => null,
            'received_by_user_id' => $admin->id,
        ]);

        // Đơn 4: in_repair (total_price = 0, initial_price = 180.000đ -> in_workshop_amount += 180.000đ, không tính vào AR)
        RepairOrder::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id'          => $tenant->id,
            'branch_id'          => $branch->id,
            'order_code'         => 'FX26-KPI3-004',
            'customer_id'        => $customer->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Đang sửa trong xưởng',
            'status'             => 'in_repair',
            'total_price'        => 0,
            'initial_price'      => 180000,
            'created_by_user_id' => $admin->id,
        ]);

        // Đơn 5: quote_pending (alias của waiting_approval, total_price = 250.003đ -> làm tròn VND = 250.000đ)
        RepairOrder::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id'          => $tenant->id,
            'branch_id'          => $branch->id,
            'order_code'         => 'FX26-KPI3-005',
            'customer_id'        => $customer->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Chờ khách duyệt báo giá',
            'status'             => 'quote_pending',
            'total_price'        => 250003,
            'created_by_user_id' => $admin->id,
        ]);

        // Đơn 6: cancelled (không tính vào active_orders, không tính vào AR)
        RepairOrder::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id'          => $tenant->id,
            'branch_id'          => $branch->id,
            'order_code'         => 'FX26-KPI3-006',
            'customer_id'        => $customer->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Đơn đã hủy',
            'status'             => 'cancelled',
            'total_price'        => 900000,
            'created_by_user_id' => $admin->id,
        ]);

        // Đơn ngoại lai thuộc Tenant khác và Chi nhánh khác (để kiểm chứng cách ly tenant_id và branch_id trong AR)
        $otherTenant = Tenant::create([
            'code'   => 'kpi-other-tenant',
            'name'   => 'Gian hàng Khác',
            'status' => 'active',
        ]);
        $otherTenantBranch = Branch::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $otherTenant->id,
            'code'      => 'CN-OTHER-T',
            'name'      => 'Chi nhánh Khác Tenant',
            'address'   => '99 Đường Khác',
            'phone'     => '0907778888',
            'is_active' => true,
        ]);
        RepairOrder::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id'          => $otherTenant->id,
            'branch_id'          => $otherTenantBranch->id,
            'order_code'         => 'FX26-OTHER-T01',
            'customer_id'        => $customer->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Đơn nợ của Tenant khác',
            'status'             => 'completed',
            'total_price'        => 999000,
            'handed_over_at'     => now(),
            'created_by_user_id' => $admin->id,
        ]);

        $branch2 = Branch::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $tenant->id,
            'code'      => 'CN-KPI3-B2',
            'name'      => 'Chi nhánh 2 cùng Tenant',
            'address'   => '89 Nguyễn Huệ, Q.1',
            'phone'     => '0903335555',
            'is_active' => true,
        ]);
        RepairOrder::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id'          => $tenant->id,
            'branch_id'          => $branch2->id,
            'order_code'         => 'FX26-KPI3-B201',
            'customer_id'        => $customer->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Đơn nợ ở Chi nhánh 2',
            'status'             => 'waiting_pickup',
            'total_price'        => 700000,
            'qc_passed_at'       => now(),
            'created_by_user_id' => $admin->id,
        ]);

        $this->actingAs($admin, 'sanctum');

        DB::enableQueryLog();
        DB::flushQueryLog();

        $response = $this->getJson("/api/v1/kpi/dashboard?branch_id={$branch->id}");
        $response->assertOk()->assertJsonPath('success', true);

        $queries = DB::getQueryLog();
        $data = $response->json('data');

        // Kiểm chứng tính chính xác 100% của các chỉ số tổng hợp SQL tại Chi nhánh 1 ($branch->id)
        $this->assertSame(6, $data['total_orders']);
        $this->assertSame(2, $data['completed_orders']);
        $this->assertSame(3, $data['active_orders']); // ready_for_return (1) + in_repair (1) + quote_pending (1)

        // Reconciliation: handed_over (2 đơn = 800.000đ), ready_for_pickup (1 đơn = 400.000đ), in_workshop (2 đơn = 180.000 + 250.000 = 430.000đ)
        $this->assertSame(2, $data['reconciliation']['handed_over_count']);
        $this->assertEquals(800000.0, $data['reconciliation']['handed_over_revenue']);
        $this->assertSame(1, $data['reconciliation']['ready_for_pickup_count']);
        $this->assertEquals(400000.0, $data['reconciliation']['ready_for_pickup_amount']);
        $this->assertSame(2, $data['reconciliation']['in_workshop_count']);
        $this->assertEquals(430000.0, $data['reconciliation']['in_workshop_amount']);
        $this->assertEquals(830000.0, $data['reconciliation']['total_uncollected_amount']);

        // Accounts Receivable tại Chi nhánh 1:
        // Đơn 1 (thu dư 350k / 300k -> max(0, -50k) = 0)
        // + Đơn 2 (500.000 - 200.000 paid [bỏ qua 100k cancelled] = 300.000)
        // + Đơn 3 (400.000 - 150.000 paid [bỏ qua 250k pending] = 250.000)
        // = 550.000đ (không bị lẫn 999.000đ của Tenant khác và 700.000đ của Chi nhánh 2)
        $this->assertEquals(550000.0, $data['accounts_receivable']);

        // Status distribution & alias mapping (quote_pending -> waiting_approval)
        $this->assertSame(1, $data['status_distribution']['waiting_approval']);
        $this->assertSame(1, $data['status_distribution']['in_repair']);
        $this->assertSame(1, $data['status_distribution']['ready_for_return']);
        $this->assertSame(2, $data['status_distribution']['completed']);
        $this->assertSame(1, $data['status_distribution']['cancelled']);

        // Kiểm chứng không còn truy vấn .get(['total_price']) hoặc .get(['id', 'total_price', 'status']) không giới hạn
        $unboundedGetQueries = array_filter($queries, function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'select `total_price` from `repair_orders`')
                || str_contains($sql, 'select `total_price`, `initial_price` from `repair_orders`')
                || str_contains($sql, 'select `id`, `total_price`, `status` from `repair_orders`');
        });
        $this->assertCount(0, $unboundedGetQueries, 'KpiController::dashboard() không được chạy các lệnh .get() không giới hạn cho Reconciliation và AR.');

        // Kiểm chứng chỉ chạy đúng 1 câu lệnh GROUP BY status trên repair_orders
        $groupByStatusQueries = array_filter($queries, function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'from `repair_orders`') && str_contains($sql, 'group by `status`');
        });
        $this->assertCount(1, $groupByStatusQueries, 'Chỉ được phép chạy 1 câu lệnh GROUP BY status duy nhất.');

        // Kiểm chứng khi Admin xem toàn bộ chi nhánh (branch_id=all): AR = 550.000 + 700.000 (CN2) = 1.250.000đ, vẫn cách ly tuyệt đối khỏi Tenant khác
        $allBranchesRes = $this->getJson('/api/v1/kpi/dashboard?branch_id=all');
        $allBranchesRes->assertOk();
        $this->assertEquals(1250000.0, $allBranchesRes->json('data.accounts_receivable'));
    }

    public function test_phase3_kpi_staff_and_warranty_endpoints_select_minimal_columns_and_enforce_safe_limits(): void
    {
        $tenant = Tenant::create([
            'code'   => 'warranty-phase3-tenant',
            'name'   => 'Gian hàng Warranty Phase 3',
            'status' => 'active',
        ]);

        $branch = Branch::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $tenant->id,
            'code'      => 'CN-WAR3',
            'name'      => 'Chi nhánh Warranty 3',
            'address'   => '99 Lê Lợi, Q.1',
            'phone'     => '0904445555',
            'is_active' => true,
        ]);

        $admin = User::factory()->create([
            'role'      => 'admin',
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'is_active' => true,
        ]);

        $tech = User::factory()->create([
            'role'      => 'technician',
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'is_active' => true,
        ]);

        $customer = Customer::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $tenant->id,
            'name'      => 'Khách Bảo Hành Phase 3',
            'phone'     => '0918222333',
        ]);

        $deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'model_code'  => 'A2931',
            'category'    => 'AirPods Pro',
            'name'        => 'AirPods Pro 2',
            'device_type' => 'AirPods',
            'is_active'   => true,
        ]);

        $order = RepairOrder::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id'           => $tenant->id,
            'branch_id'           => $branch->id,
            'order_code'          => 'FX26-WAR3-001',
            'customer_id'         => $customer->id,
            'device_model_id'     => $deviceModel->id,
            'serial_number'       => 'SN-PHASE3-001',
            'issue_description'   => 'Thay pin bảo hành',
            'status'              => 'completed',
            'total_price'         => 350000,
            'technician_id'       => $tech->id,
            'repair_started_at'   => now()->subMinutes(45),
            'repair_completed_at' => now(),
            'handed_over_at'      => now(),
            'created_by_user_id'  => $admin->id,
        ]);

        \App\Models\Warranty::create([
            'warranty_code'   => 'BH-PHASE3-001',
            'repair_order_id' => $order->id,
            'customer_id'     => $customer->id,
            'device_model_id' => $deviceModel->id,
            'coverage_item'   => 'Thay pin bảo hành',
            'start_date'      => now()->toDateString(),
            'end_date'        => now()->addDays(90)->toDateString(),
            'duration_days'   => 90,
            'status'          => 'active',
        ]);

        $this->actingAs($admin, 'sanctum');

        // 1. Kiểm tra KpiController::staff() không SELECT * trên repair_orders
        DB::enableQueryLog();
        DB::flushQueryLog();

        $staffRes = $this->getJson('/api/v1/kpi/staff');
        $staffRes->assertOk()->assertJsonPath('success', true);

        $selectAllOrdersInStaff = array_filter(DB::getQueryLog(), function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'select * from `repair_orders`');
        });
        $this->assertCount(0, $selectAllOrdersInStaff, 'KpiController::staff() chỉ được select các cột cần thiết thay vì SELECT * FROM repair_orders.');

        // 2. Kiểm tra WarrantyController::history() và lookup() có giới hạn LIMIT an toàn
        DB::flushQueryLog();
        $historyRes = $this->getJson('/api/v1/warranties/history?phone=0918222333&limit=50');
        $historyRes->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.total_repairs', 1);

        $lookupRes = $this->getJson('/api/v1/warranties/lookup?code=BH-PHASE3-001&phone=0918222333&limit=50');
        $lookupRes->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.0.warranty_code', 'BH-PHASE3-001');

        $limitedQueries = array_filter(DB::getQueryLog(), function (array $q): bool {
            $sql = strtolower($q['query']);

            return (str_contains($sql, 'from `repair_orders`') || str_contains($sql, 'from `warranties`'))
                && str_contains($sql, 'limit 50');
        });
        $this->assertGreaterThanOrEqual(2, count($limitedQueries), 'Cả history() và lookup() phải áp dụng mệnh đề LIMIT an toàn.');
    }

    public function test_phase4_order_workflow_inventory_and_customer_updates_eliminate_n_plus_one_queries(): void
    {
        $tenant = Tenant::create([
            'code'   => 'phase4-wf-tenant',
            'name'   => 'Gian hàng Workflow Phase 4',
            'status' => 'active',
        ]);

        $branch = Branch::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $tenant->id,
            'code'      => 'CN-WF4',
            'name'      => 'Chi nhánh Workflow 4',
            'address'   => '123 Hai Bà Trưng, Q.1',
            'phone'     => '0905556666',
            'is_active' => true,
        ]);

        $admin = User::factory()->create([
            'role'      => 'admin',
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'is_active' => true,
        ]);

        $customer = Customer::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id'    => $tenant->id,
            'name'         => 'Khách Hàng Phase 4',
            'phone'        => '0919888777',
            'orders_count' => 1,
            'total_spent'  => 200000,
        ]);

        $deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'model_code'  => 'A2931',
            'category'    => 'AirPods Pro',
            'name'        => 'AirPods Pro 2',
            'device_type' => 'AirPods',
            'is_active'   => true,
        ]);

        $this->actingAs($admin, 'sanctum');

        // Tạo 3 linh kiện và tồn kho chi nhánh
        $parts = [];
        for ($i = 1; $i <= 3; $i++) {
            $part = Part::create([
                'tenant_id'         => $tenant->id,
                'sku'               => "SKU-P4-00{$i}",
                'name'              => "Linh kiện Phase 4 #{$i}",
                'category'          => 'battery',
                'compatible_models' => 'AirPods Pro 2',
                'storage_location'  => "Kệ A{$i}",
                'cost_price'        => 50000 * $i,
                'retail_price'      => 100000 * $i,
                'stock_quantity'    => 20,
                'min_stock_alert'   => 5,
            ]);
            \App\Models\BranchPart::create([
                'branch_id'       => $branch->id,
                'part_id'         => $part->id,
                'stock_quantity'  => 20,
                'min_stock_alert' => 5,
            ]);
            $parts[] = $part;
        }

        $order = RepairOrder::create([
            'tenant_id'           => $tenant->id,
            'branch_id'           => $branch->id,
            'order_code'          => 'FX26-WF4-0001',
            'customer_id'         => $customer->id,
            'device_model_id'     => $deviceModel->id,
            'issue_description'   => 'Thay combo 3 linh kiện',
            'status'              => 'ready_for_return',
            'total_price'         => 600000,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $admin->id,
        ]);

        Payment::create([
            'payment_code'        => 'FX26-PY-WF4001',
            'repair_order_id'     => $order->id,
            'amount'              => 600000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $admin->id,
        ]);

        $quote = \App\Models\Quote::create([
            'tenant_id'           => $tenant->id,
            'repair_order_id'     => $order->id,
            'quote_number'        => 'BG-WF4-001',
            'status'              => 'approved',
            'total_amount'        => 600000,
            'warranty_terms_days' => 90,
            'note'                => 'Báo giá Phase 4',
            'sent_by_user_id'     => $admin->id,
        ]);

        foreach ($parts as $index => $part) {
            \App\Models\QuoteItem::create([
                'quote_id'    => $quote->id,
                'part_id'     => $part->id,
                'description' => $part->name,
                'quantity'    => $index + 1,
                'unit_price'  => $part->retail_price,
                'amount'      => $part->retail_price * ($index + 1),
            ]);
        }

        // Edge case: Thêm 1 QuoteItem thứ 2 cùng trỏ vào $parts[0]->id (quantity = 2)
        // Tổng trừ cho $parts[0] phải là 1 + 2 = 3 (tồn kho từ 20 xuống 19 rồi 17)
        \App\Models\QuoteItem::create([
            'quote_id'    => $quote->id,
            'part_id'     => $parts[0]->id,
            'description' => $parts[0]->name . ' (bổ sung)',
            'quantity'    => 2,
            'unit_price'  => $parts[0]->retail_price,
            'amount'      => $parts[0]->retail_price * 2,
        ]);

        /** @var \App\Services\OrderWorkflowService $workflow */
        $workflow = app(\App\Services\OrderWorkflowService::class);

        DB::enableQueryLog();
        DB::flushQueryLog();

        $workflow->transition($order, 'completed', [
            'user'     => $admin,
            'admin_id' => $admin->id,
        ]);

        $queries = DB::getQueryLog();

        // 1. Chỉ được SELECT bảng warranties theo repair_order_id đúng 1 lần trong afterTransition() (không gọi exists() rồi get() lặp)
        $warrantySelects = array_filter($queries, function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'select') && str_contains($sql, 'from `warranties`') && str_contains($sql, 'repair_order_id');
        });
        $this->assertCount(1, $warrantySelects, 'afterTransition() chỉ được query bảng warranties theo repair_order_id đúng 1 lần.');

        // 2. Chỉ được UPDATE bảng customers đúng 1 lần (gộp orders_count và total_spent)
        $customerUpdates = array_filter($queries, function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'update `customers`');
        });
        $this->assertCount(1, $customerUpdates, 'afterTransition() phải gộp cập nhật orders_count và total_spent vào 1 câu UPDATE customers duy nhất.');

        $freshCustomer = $customer->fresh();
        $this->assertSame(2, (int) $freshCustomer->orders_count);
        $this->assertEquals(800000.0, (float) $freshCustomer->total_spent);

        // 3. deductInventoryForOrder() phải preload parts và branch_parts bằng 1 câu SELECT ... WHERE IN (...) FOR UPDATE
        $partSelects = array_filter($queries, function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'select') && str_contains($sql, 'from `parts`');
        });
        $branchPartSelects = array_filter($queries, function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'select') && str_contains($sql, 'from `branch_parts`');
        });
        $this->assertCount(1, $partSelects, 'deductInventoryForOrder() chỉ được SELECT bảng parts 1 lần trước vòng lặp.');
        $this->assertCount(1, $branchPartSelects, 'deductInventoryForOrder() chỉ được SELECT bảng branch_parts 1 lần trước vòng lặp.');

        // Kiểm tra tồn kho Part & BranchPart đã trừ chính xác (kể cả $parts[0] có 2 dòng QuoteItem: 20 - 1 - 2 = 17, 20 - 2 = 18, 20 - 3 = 17)
        $this->assertSame(17, (int) $parts[0]->fresh()->stock_quantity);
        $this->assertSame(18, (int) $parts[1]->fresh()->stock_quantity);
        $this->assertSame(17, (int) $parts[2]->fresh()->stock_quantity);

        $branchPart0 = \App\Models\BranchPart::where('branch_id', $branch->id)->where('part_id', $parts[0]->id)->first();
        $branchPart1 = \App\Models\BranchPart::where('branch_id', $branch->id)->where('part_id', $parts[1]->id)->first();
        $branchPart2 = \App\Models\BranchPart::where('branch_id', $branch->id)->where('part_id', $parts[2]->id)->first();
        $this->assertSame(17, (int) $branchPart0->stock_quantity);
        $this->assertSame(18, (int) $branchPart1->stock_quantity);
        $this->assertSame(17, (int) $branchPart2->stock_quantity);

        $part0ExportQuantities = \App\Models\InventoryTransaction::where('repair_order_id', $order->id)
            ->where('part_id', $parts[0]->id)
            ->where('transaction_type', 'export_repair')
            ->orderBy('id')
            ->pluck('quantity')
            ->map(fn ($v) => (int) $v)
            ->all();
        $this->assertSame([-1, -2], $part0ExportQuantities, 'Hai giao dịch xuất kho liên tiếp của cùng 1 part_id phải ghi nhận đúng quantity (-1 và -2).');

        // 4. Kiểm tra reverseInventoryForOrder() với 4 giao dịch xuất kho chỉ chạy 1 SELECT parts & 1 SELECT branch_parts
        DB::flushQueryLog();
        $workflow->reverseInventoryForOrder($order, $admin->id, 'cancelled');
        $reverseQueries = DB::getQueryLog();

        $reversePartSelects = array_filter($reverseQueries, function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'select') && str_contains($sql, 'from `parts`');
        });
        $reverseBranchPartSelects = array_filter($reverseQueries, function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'select') && str_contains($sql, 'from `branch_parts`');
        });
        $this->assertCount(1, $reversePartSelects, 'reverseInventoryForOrder() chỉ được SELECT bảng parts 1 lần trước vòng lặp.');
        $this->assertCount(1, $reverseBranchPartSelects, 'reverseInventoryForOrder() chỉ được SELECT bảng branch_parts 1 lần trước vòng lặp.');
        $this->assertSame(20, (int) $parts[0]->fresh()->stock_quantity);
        $this->assertSame(20, (int) $parts[1]->fresh()->stock_quantity);
        $this->assertSame(20, (int) $parts[2]->fresh()->stock_quantity);
        $this->assertSame(20, (int) $branchPart0->fresh()->stock_quantity);
        $this->assertSame(20, (int) $branchPart1->fresh()->stock_quantity);
        $this->assertSame(20, (int) $branchPart2->fresh()->stock_quantity);

        // 5. Kiểm tra restockInventoryForOrder() trên đơn hàng hoàn tiền cũng gom batch SELECT parts & branch_parts
        $refundOrder = RepairOrder::create([
            'tenant_id'           => $tenant->id,
            'branch_id'           => $branch->id,
            'order_code'          => 'FX26-WF4-0002',
            'customer_id'         => $customer->id,
            'device_model_id'     => $deviceModel->id,
            'issue_description'   => 'Đơn test restockInventoryForOrder',
            'status'              => 'completed',
            'total_price'         => 300000,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $admin->id,
        ]);
        $refundQuote = \App\Models\Quote::create([
            'tenant_id'           => $tenant->id,
            'repair_order_id'     => $refundOrder->id,
            'quote_number'        => 'BG-WF4-002',
            'status'              => 'approved',
            'total_amount'        => 300000,
            'warranty_terms_days' => 90,
            'note'                => 'Báo giá hoàn tiền Phase 4',
            'sent_by_user_id'     => $admin->id,
        ]);
        \App\Models\QuoteItem::create([
            'quote_id'    => $refundQuote->id,
            'part_id'     => $parts[0]->id,
            'description' => $parts[0]->name,
            'quantity'    => 2,
            'unit_price'  => $parts[0]->retail_price,
            'amount'      => $parts[0]->retail_price * 2,
        ]);
        \App\Models\QuoteItem::create([
            'quote_id'    => $refundQuote->id,
            'part_id'     => $parts[1]->id,
            'description' => $parts[1]->name,
            'quantity'    => 1,
            'unit_price'  => $parts[1]->retail_price,
            'amount'      => $parts[1]->retail_price,
        ]);

        $workflow->deductInventoryForOrder($refundOrder, $admin->id);
        $this->assertSame(18, (int) $parts[0]->fresh()->stock_quantity);
        $this->assertSame(19, (int) $parts[1]->fresh()->stock_quantity);

        DB::flushQueryLog();
        $workflow->restockInventoryForOrder($refundOrder, $admin->id, 'refund');
        $restockQueries = DB::getQueryLog();

        $this->assertSame(2, \App\Models\InventoryTransaction::where('repair_order_id', $refundOrder->id)->where('transaction_type', 'import_return')->count());
        $restockPartSelects = array_filter($restockQueries, function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'select') && str_contains($sql, 'from `parts`');
        });
        $restockBranchPartSelects = array_filter($restockQueries, function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'select') && str_contains($sql, 'from `branch_parts`');
        });
        $this->assertCount(1, $restockPartSelects, 'restockInventoryForOrder() chỉ được SELECT bảng parts 1 lần trước vòng lặp.');
        $this->assertCount(1, $restockBranchPartSelects, 'restockInventoryForOrder() chỉ được SELECT bảng branch_parts 1 lần trước vòng lặp.');
        $this->assertSame(20, (int) $parts[0]->fresh()->stock_quantity);
        $this->assertSame(20, (int) $parts[1]->fresh()->stock_quantity);
    }

    public function test_phase4_platform_billing_stats_and_plans_eliminate_n_plus_one_queries(): void
    {
        $superAdmin = User::factory()->create([
            'role'      => 'super_admin',
            'tenant_id' => null,
            'is_active' => true,
        ]);

        \App\Models\SubscriptionPlan::firstOrCreate(
            ['id' => 'basic'],
            ['code' => 'BASIC', 'name' => 'Gói Cơ Bản', 'price' => 199000, 'price_monthly' => 199000, 'is_active' => true, 'sort_order' => 1]
        );
        \App\Models\SubscriptionPlan::firstOrCreate(
            ['id' => 'pro'],
            ['code' => 'PRO', 'name' => 'Gói Chuyên Nghiệp', 'price' => 499000, 'price_monthly' => 499000, 'is_active' => true, 'sort_order' => 2]
        );

        for ($i = 1; $i <= 4; $i++) {
            Tenant::create([
                'code'            => "p4-billing-store-{$i}",
                'name'            => "Cửa hàng Billing #{$i}",
                'status'          => 'active',
                'plan'            => $i % 2 === 0 ? 'pro' : 'basic',
                'current_plan_id' => $i % 2 === 0 ? 'pro' : 'basic',
                'expires_at'      => now()->addDays(30),
            ]);
        }

        $this->actingAs($superAdmin, 'sanctum');

        // 1. Kiểm tra /api/v1/platform/billing-stats
        DB::enableQueryLog();
        DB::flushQueryLog();

        $statsRes = $this->getJson('/api/v1/platform/billing-stats');
        $statsRes->assertOk()->assertJsonPath('success', true);

        $planSelectsInStats = array_filter(DB::getQueryLog(), function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'select') && str_contains($sql, 'from `subscription_plans`');
        });
        $this->assertCount(1, $planSelectsInStats, 'billingStats() chỉ được phép SELECT bảng subscription_plans đúng 1 lần (whereIn).');

        // 2. Kiểm tra /api/v1/platform/plans
        DB::flushQueryLog();

        $plansRes = $this->getJson('/api/v1/platform/plans');
        $plansRes->assertOk()->assertJsonPath('success', true);

        $plansQueries = DB::getQueryLog();
        $separateTenantCountQueries = array_filter($plansQueries, function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'from `tenants`') && ! str_contains($sql, 'from `subscription_plans`');
        });
        $this->assertCount(0, $separateTenantCountQueries, 'plans() phải sử dụng withCount(\'tenants\') trong 1 truy vấn thay vì bắn N+1 query đếm tenants.');
    }

    public function test_phase4_order_store_checklist_and_destroy_use_preloading_and_bulk_deletes(): void
    {
        $tenant = Tenant::create([
            'code'   => 'phase4-order-tenant',
            'name'   => 'Gian hàng Order Phase 4',
            'status' => 'active',
        ]);

        $branch = Branch::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $tenant->id,
            'code'      => 'CN-ORD4',
            'name'      => 'Chi nhánh Order 4',
            'address'   => '456 Nguyễn Thị Minh Khai, Q.3',
            'phone'     => '0906667777',
            'is_active' => true,
        ]);

        $admin = User::factory()->create([
            'role'      => 'admin',
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'is_active' => true,
        ]);

        $customer = Customer::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $tenant->id,
            'name'      => 'Khách Xóa Đơn Phase 4',
            'phone'     => '0917666555',
        ]);

        $deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'model_code'  => 'A2931',
            'category'    => 'AirPods Pro',
            'name'        => 'AirPods Pro 2',
            'device_type' => 'AirPods',
            'is_active'   => true,
        ]);

        $order = RepairOrder::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id'          => $tenant->id,
            'branch_id'          => $branch->id,
            'order_code'         => 'FX26-ORD4-0001',
            'customer_id'        => $customer->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Kiểm tra storeChecklist và destroy',
            'status'             => 'received',
            'total_price'        => 300000,
            'created_by_user_id' => $admin->id,
        ]);

        $this->actingAs($admin, 'sanctum');
        TenantScope::resolveMasterTenantId();

        // 1. Gọi storeChecklist lần 1 (tạo mới 3 mục) và lần 2 (cập nhật 3 mục + thêm 1 mục)
        $this->postJson("/api/v1/orders/{$order->id}/checklists", [
            'items' => [
                ['item_name' => 'Ngoại quan vỏ sạc', 'status' => 'pass', 'note' => 'Tốt'],
                ['item_name' => 'Kết nối Bluetooth', 'status' => 'pass', 'note' => 'Nhanh'],
                ['item_name' => 'Thời lượng pin', 'status' => 'fail', 'note' => 'Chai pin'],
            ],
        ])->assertOk();

        DB::enableQueryLog();
        DB::flushQueryLog();

        $checklistRes = $this->postJson("/api/v1/orders/{$order->id}/checklists", [
            'items' => [
                ['item_name' => 'Ngoại quan vỏ sạc', 'status' => 'pass', 'note' => 'Đẹp'],
                ['item_name' => 'Kết nối Bluetooth', 'status' => 'pass', 'note' => 'Ổn định'],
                ['item_name' => 'Thời lượng pin', 'status' => 'pass', 'note' => 'Đã thay pin'],
                ['item_name' => 'Cảm biến tiệm cận', 'status' => 'pass', 'note' => 'OK'],
            ],
        ]);
        $checklistRes->assertOk()->assertJsonCount(4, 'data');

        $checklistSelects = array_filter(DB::getQueryLog(), function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'select') && str_contains($sql, 'from `intake_checklists`');
        });
        // 1 lần preload trước vòng lặp + 1 lần trả về danh sách sau khi lưu = 2 lần (không phải 4+1 lần như updateOrCreate)
        $this->assertCount(2, $checklistSelects, 'storeChecklist() chỉ được SELECT intake_checklists 1 lần để preload và 1 lần để trả về.');

        // 2. Tạo nhiều dữ liệu phụ thuộc để kiểm chứng xóa hàng loạt trong destroy()
        for ($i = 1; $i <= 2; $i++) {
            $q = \App\Models\Quote::create([
                'tenant_id'           => $tenant->id,
                'repair_order_id'     => $order->id,
                'quote_number'        => "BG-DEL4-00{$i}",
                'status'              => 'pending',
                'total_amount'        => 150000,
                'warranty_terms_days' => 90,
                'note'                => "Báo giá xóa #{$i}",
                'sent_by_user_id'     => $admin->id,
            ]);
            \App\Models\QuoteItem::create([
                'quote_id'    => $q->id,
                'description' => "Dịch vụ #{$i}",
                'quantity'    => 1,
                'unit_price'  => 150000,
                'amount'      => 150000,
            ]);
        }

        DB::flushQueryLog();

        $delRes = $this->deleteJson("/api/v1/orders/{$order->id}");
        $delRes->assertOk()->assertJsonPath('success', true);

        $deleteQueries = DB::getQueryLog();
        $quoteItemDeletes = array_filter($deleteQueries, function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'delete from `quote_items`');
        });
        $quoteDeletes = array_filter($deleteQueries, function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'delete from `repair_quotes`');
        });

        $this->assertCount(1, $quoteItemDeletes, 'destroy() phải xóa hàng loạt quote_items bằng 1 câu DELETE ... WHERE quote_id IN (...).');
        $this->assertCount(1, $quoteDeletes, 'destroy() phải xóa hàng loạt repair_quotes bằng 1 câu DELETE.');
        $this->assertNull(RepairOrder::withoutGlobalScope(TenantScope::class)->find($order->id));
    }

    public function test_phase5_telegram_notify_new_order_and_operational_events_execute_after_transaction_commit(): void
    {
        $tenant = Tenant::create([
            'code'   => 'phase5-commit-tenant',
            'name'   => 'Gian hàng Phase 5 Commit',
            'status' => 'active',
        ]);

        $branch = Branch::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $tenant->id,
            'code'      => 'CN-P5',
            'name'      => 'Chi nhánh Phase 5',
            'address'   => '789 Điện Biên Phủ, Q.3',
            'phone'     => '0908889999',
            'is_active' => true,
        ]);

        $admin = User::factory()->create([
            'role'      => 'admin',
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'is_active' => true,
        ]);

        $tech = User::factory()->create([
            'role'      => 'technician',
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'is_active' => true,
        ]);

        $deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'model_code'  => 'A2931',
            'category'    => 'AirPods Pro',
            'name'        => 'AirPods Pro 2',
            'device_type' => 'AirPods',
            'is_active'   => true,
        ]);

        $this->actingAs($admin, 'sanctum');

        $baseTransactionLevel = DB::transactionLevel();
        $telegramTxLevels = [];
        $eventTxLevels = [];
        $dispatchedEvents = [];

        // Bind spy cho TelegramNotificationService để đo transactionLevel tại thời điểm notifyNewOrder được gọi
        $this->app->bind(\App\Services\TelegramNotificationService::class, function () use (&$telegramTxLevels) {
            return new class($telegramTxLevels) extends \App\Services\TelegramNotificationService {
                public function __construct(private array &$levels) {}

                public function notifyNewOrder(RepairOrder $order): int
                {
                    $this->levels[] = DB::transactionLevel();

                    return 1;
                }
            };
        });

        \Illuminate\Support\Facades\Event::listen(
            \App\Events\OrderOperationalEvent::class,
            function (\App\Events\OrderOperationalEvent $event) use (&$eventTxLevels, &$dispatchedEvents) {
                $eventTxLevels[] = DB::transactionLevel();
                $dispatchedEvents[] = $event->eventName;
            }
        );

        // 1. Tạo đơn sửa chữa qua OrderController::store()
        $storeRes = $this->postJson('/api/v1/orders', [
            'branch_id'         => $branch->id,
            'customer_name'     => 'Khách Phase 5',
            'customer_phone'    => '0916555444',
            'device_model_id'   => $deviceModel->id,
            'issue_description' => 'Mất nguồn hộp sạc',
            'estimated_price'   => 400000,
        ]);
        $storeRes->assertCreated();
        $createdOrderId = (int) $storeRes->json('data.id');
        $createdOrder = RepairOrder::findOrFail($createdOrderId);

        // 2. Tạo báo giá qua QuoteController::store() và duyệt qua QuoteController::approve()
        $quoteRes = $this->postJson('/api/v1/quotes', [
            'repair_order_id'     => $createdOrder->id,
            'note'                => 'Báo giá thay IC nguồn',
            'warranty_terms_days' => 90,
            'items'               => [
                [
                    'description' => 'Thay IC nguồn hộp sạc',
                    'quantity'    => 1,
                    'unit_price'  => 400000,
                ],
            ],
        ]);
        $quoteRes->assertCreated();
        $quoteId = (int) $quoteRes->json('data.id');

        $this->postJson("/api/v1/quotes/{$quoteId}/approve")->assertOk();

        // 3. Chuyển trạng thái qua OrderWorkflowService::transition()
        $this->postJson("/api/v1/orders/{$createdOrder->id}/transition", [
            'status'        => 'in_repair',
            'technician_id' => $tech->id,
        ])->assertOk();

        // 4. Nộp biên bản QC qua QcController::store()
        $this->postJson('/api/v1/qc', [
            'repair_order_id' => $createdOrder->id,
            'result'          => 'pass',
            'notes'           => 'Đạt chuẩn 6/6',
            'criteria'        => [
                ['criterion' => 'Sạc pin ổn định', 'is_passed' => true],
            ],
        ])->assertCreated();

        // 5. Tạo đơn bảo hành làm lại qua WarrantyReworkService::createReworkOrderFromClaim()
        $warranty = \App\Models\Warranty::create([
            'tenant_id'       => $tenant->id,
            'warranty_code'   => 'BH-P5-0001',
            'repair_order_id' => $createdOrder->id,
            'customer_id'     => $createdOrder->customer_id,
            'device_model_id' => $deviceModel->id,
            'coverage_item'   => 'Thay IC nguồn hộp sạc',
            'start_date'      => now()->toDateString(),
            'end_date'        => now()->addDays(90)->toDateString(),
            'duration_days'   => 90,
            'status'          => 'active',
        ]);

        $claim = \App\Models\WarrantyClaim::create([
            'claim_code'          => 'KN-P5-0001',
            'warranty_id'         => $warranty->id,
            'issue_description'   => 'Sạc chập chờn lại',
            'resolution_mode'     => 'rework',
            'status'              => 'open',
            'received_by_user_id' => $admin->id,
        ]);

        /** @var \App\Services\WarrantyReworkService $reworkService */
        $reworkService = app(\App\Services\WarrantyReworkService::class);
        $reworkOrder = $reworkService->createReworkOrderFromClaim($claim, $admin, [
            'branch_id' => $branch->id,
        ]);
        $this->assertNotNull($reworkOrder->id);

        // Kiểm chứng toàn bộ lời gọi Telegram notifyNewOrder (từ OrderController::store và WarrantyReworkService)
        // đều chạy ở mức transaction gốc ($baseTransactionLevel), tức là sau khi DB::transaction nghiệp vụ đã commit
        $this->assertCount(2, $telegramTxLevels, 'notifyNewOrder phải được gọi đúng 2 lần (1 lần tạo đơn mới, 1 lần tạo đơn bảo hành).');
        foreach ($telegramTxLevels as $lvl) {
            $this->assertSame(
                $baseTransactionLevel,
                $lvl,
                'TelegramNotificationService::notifyNewOrder() phải thực thi bên ngoài (sau khi commit) DB::transaction nghiệp vụ.'
            );
        }

        // Kiểm chứng toàn bộ sự kiện OrderOperationalEvent đều được phát đầy đủ và chỉ chạy sau khi DB::transaction nghiệp vụ đã commit
        $this->assertContains('order.created', $dispatchedEvents);
        $this->assertContains('quote.created', $dispatchedEvents);
        $this->assertContains('quote.approved', $dispatchedEvents);
        $this->assertContains('order.in_repair', $dispatchedEvents);
        $this->assertContains('qc.passed', $dispatchedEvents);

        foreach ($eventTxLevels as $lvl) {
            $this->assertSame(
                $baseTransactionLevel,
                $lvl,
                'OrderOperationalEvent::dispatch() phải thực thi sau khi DB::transaction nghiệp vụ đã commit.'
            );
        }
    }

    public function test_phase5_telegram_sync_updates_never_deletes_webhook_in_production(): void
    {
        config(['services.telegram.bot_token' => 'test-prod-bot-token']);

        \Illuminate\Support\Facades\Http::fake([
            'https://api.telegram.org/bottest-prod-bot-token/getUpdates*'    => \Illuminate\Support\Facades\Http::response(['ok' => false, 'description' => 'Conflict: can\'t use getUpdates method while webhook is active'], 409),
            'https://api.telegram.org/bottest-prod-bot-token/deleteWebhook*' => \Illuminate\Support\Facades\Http::response(['ok' => true], 200),
        ]);

        $originalEnv = $this->app['env'];
        $this->app['env'] = 'production';

        try {
            $service = new \App\Services\TelegramNotificationService();
            $synced = $service->syncUpdates();

            $this->assertSame(0, $synced);

            \Illuminate\Support\Facades\Http::assertNotSent(function ($request) {
                return str_contains($request->url(), 'deleteWebhook');
            });
        } finally {
            $this->app['env'] = $originalEnv;
        }
    }

    public function test_goods_receipt_service_preloads_branch_parts_in_single_query(): void
    {
        $tenant = Tenant::create([
            'code'   => 'gr-preload-tenant',
            'name'   => 'Gian hàng GoodsReceipt Preload',
            'status' => 'active',
        ]);

        $branch = Branch::withoutGlobalScope(TenantScope::class)->create([
            'tenant_id' => $tenant->id,
            'code'      => 'CN-GR',
            'name'      => 'Chi nhánh GR',
            'address'   => '101 Nguyễn Văn Cừ, Q.5',
            'phone'     => '0907771111',
            'is_active' => true,
        ]);

        $admin = User::factory()->create([
            'role'      => 'admin',
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'is_active' => true,
        ]);

        $this->actingAs($admin, 'sanctum');

        $supplier = \App\Models\Supplier::create([
            'tenant_id'    => $tenant->id,
            'code'         => 'NCC-GR-01',
            'name'         => 'Nhà cung cấp Linh kiện GR',
            'phone'        => '0909888111',
            'debt_balance' => 0,
            'is_active'    => true,
        ]);

        $parts = [];
        for ($i = 1; $i <= 3; $i++) {
            $part = Part::create([
                'tenant_id'         => $tenant->id,
                'sku'               => "SKU-GR-0{$i}",
                'name'              => "Linh kiện nhập kho #{$i}",
                'category'          => 'battery',
                'compatible_models' => 'AirPods Pro 2',
                'storage_location'  => "Kệ B{$i}",
                'cost_price'        => 40000,
                'retail_price'      => 120000,
                'stock_quantity'    => 10,
                'min_stock_alert'   => 5,
            ]);
            \App\Models\BranchPart::create([
                'branch_id'       => $branch->id,
                'part_id'         => $part->id,
                'stock_quantity'  => 10,
                'min_stock_alert' => 5,
            ]);
            $parts[] = $part;
        }

        /** @var \App\Services\GoodsReceiptService $receiptService */
        $receiptService = app(\App\Services\GoodsReceiptService::class);

        DB::enableQueryLog();
        DB::flushQueryLog();

        $receipt = $receiptService->createReceipt($tenant->id, $branch->id, $admin->id, [
            'supplier_id'     => $supplier->id,
            'discount_amount' => 0,
            'paid_amount'     => 0,
            'payment_method'  => 'none',
            'items'           => [
                ['part_id' => $parts[0]->id, 'quantity' => 5, 'unit_price' => 50000],
                ['part_id' => $parts[1]->id, 'quantity' => 3, 'unit_price' => 60000],
                ['part_id' => $parts[2]->id, 'quantity' => 2, 'unit_price' => 70000],
            ],
        ]);

        $this->assertNotNull($receipt->id);

        $branchPartSelects = array_filter(DB::getQueryLog(), function (array $q): bool {
            $sql = strtolower($q['query']);

            return str_contains($sql, 'select') && str_contains($sql, 'from `branch_parts`');
        });

        $this->assertCount(1, $branchPartSelects, 'GoodsReceiptService::createReceipt() chỉ được SELECT bảng branch_parts đúng 1 lần trước vòng lặp.');
        $this->assertSame(15, (int) \App\Models\BranchPart::where('branch_id', $branch->id)->where('part_id', $parts[0]->id)->value('stock_quantity'));
        $this->assertSame(13, (int) \App\Models\BranchPart::where('branch_id', $branch->id)->where('part_id', $parts[1]->id)->value('stock_quantity'));
        $this->assertSame(12, (int) \App\Models\BranchPart::where('branch_id', $branch->id)->where('part_id', $parts[2]->id)->value('stock_quantity'));
    }
}


