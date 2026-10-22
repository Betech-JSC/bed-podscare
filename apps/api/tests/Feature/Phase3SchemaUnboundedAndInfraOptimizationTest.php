<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashTransaction;
use App\Models\ChecklistTemplate;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\IntakeChecklist;
use App\Models\Part;
use App\Models\Payment;
use App\Models\QcChecklistResult;
use App\Models\QuoteItem;
use App\Models\RepairOrder;
use App\Models\SubscriptionPlan;
use App\Models\Supplier;
use App\Models\SystemSetting;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WorkShift;
use App\Services\CashTransactionService;
use App\Services\GoodsReceiptService;
use App\Services\QuotaService;
use App\Services\RefundService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class Phase3SchemaUnboundedAndInfraOptimizationTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected Branch $branchA;
    protected Branch $branchB;
    protected User $adminA;
    protected User $adminB;

    protected function setUp(): void
    {
        parent::setUp();

        SystemSetting::clearCache();
        QuotaService::clearCache();

        SubscriptionPlan::updateOrCreate(
            ['id' => 'pro'],
            [
                'code'                 => 'pro',
                'name'                 => 'Gói Chuyên Nghiệp',
                'price_monthly'        => 299000,
                'max_branches'         => 5,
                'max_users'            => 20,
                'max_orders_per_month' => 1000,
            ]
        );

        $this->tenantA = Tenant::create([
            'name'            => 'PodsCare Tenant A',
            'code'            => 'TENANTA',
            'slug'            => 'tenant-a',
            'status'          => 'active',
            'plan'            => 'pro',
            'current_plan_id' => 'pro',
            'expires_at'      => now()->addDays(30),
        ]);

        $this->tenantB = Tenant::create([
            'name'            => 'PodsCare Tenant B',
            'code'            => 'TENANTB',
            'slug'            => 'tenant-b',
            'status'          => 'active',
            'plan'            => 'pro',
            'current_plan_id' => 'pro',
            'expires_at'      => now()->addDays(30),
        ]);

        $this->branchA = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'code'      => 'BRA',
            'name'      => 'Chi nhánh A',
            'address'   => '123 Đường A',
            'phone'     => '0901111111',
            'is_active' => true,
        ]);

        $this->branchB = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantB->id,
            'code'      => 'BRB',
            'name'      => 'Chi nhánh B',
            'address'   => '456 Đường B',
            'phone'     => '0902222222',
            'is_active' => true,
        ]);

        $this->adminA = User::withoutGlobalScopes()->forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'Admin A',
            'email'     => 'admin-a@podscare.test',
            'phone'     => '0911111111',
            'password'  => bcrypt('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->adminB = User::withoutGlobalScopes()->forceCreate([
            'tenant_id' => $this->tenantB->id,
            'branch_id' => $this->branchB->id,
            'name'      => 'Admin B',
            'email'     => 'admin-b@podscare.test',
            'phone'     => '0922222222',
            'password'  => bcrypt('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);
    }

    public function test_phase3_migration_creates_reference_columns_and_composite_indexes(): void
    {
        $this->assertTrue(Schema::hasColumn('cash_transactions', 'reference_type'));
        $this->assertTrue(Schema::hasColumn('cash_transactions', 'reference_id'));
        $this->assertTrue(Schema::hasIndex('cash_transactions', 'idx_cash_tx_reference'));

        $this->assertTrue(Schema::hasIndex('customers', 'uq_customers_tenant_phone'));
        $this->assertFalse(Schema::hasIndex('customers', 'customers_phone_unique'));

        $this->assertTrue(Schema::hasIndex('parts', 'uq_parts_tenant_sku'));
        $this->assertFalse(Schema::hasIndex('parts', 'parts_sku_unique'));

        $this->assertTrue(Schema::hasIndex('parts', 'idx_parts_tenant_active_category'));
        $this->assertTrue(Schema::hasIndex('shipments', 'idx_shipments_tenant_status'));
        $this->assertTrue(Schema::hasIndex('shipments', 'idx_shipments_tracking_code'));
        $this->assertTrue(Schema::hasIndex('suppliers', 'idx_suppliers_tenant_active'));
        $this->assertTrue(Schema::hasIndex('goods_receipts', 'idx_goods_receipts_tenant_branch_created'));
        $this->assertTrue(Schema::hasIndex('tenants', 'idx_tenants_status_expires_at'));
        $this->assertTrue(Schema::hasIndex('audit_logs', 'idx_audit_tenant_user_created'));
        $this->assertTrue(Schema::hasIndex('customers', 'idx_customers_tenant_type'));
    }

    public function test_cash_transaction_stores_reference_columns_and_prevents_duplicates_for_payment_and_refund(): void
    {
        WorkShift::withoutGlobalScopes()->create([
            'tenant_id'       => $this->tenantA->id,
            'branch_id'       => $this->branchA->id,
            'shift_code'      => 'SH-TEST-01',
            'cashier_id'      => $this->adminA->id,
            'opened_at'       => now(),
            'opening_cash'    => 1000000,
            'system_cash_in'  => 0,
            'system_cash_out' => 0,
            'expected_cash'   => 1000000,
            'status'          => 'open',
        ]);

        $customer = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Khách A',
            'phone'     => '0988111222',
        ]);

        $device = DeviceModel::withoutGlobalScopes()->create([
            'tenant_id'  => $this->tenantA->id,
            'name'       => 'AirPods Pro 2',
            'category'   => 'AirPods',
            'model_code' => 'APP2-A',
        ]);

        $order = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA->id,
            'order_code'         => 'PCBRA221026001',
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'issue_description'  => 'Thay pin',
            'status'             => 'ready_for_return',
            'total_price'        => 400000,
            'created_by_user_id' => $this->adminA->id,
        ]);

        $payment = Payment::create([
            'payment_code'        => 'PAY-TEST-001',
            'repair_order_id'     => $order->id,
            'amount'              => 400000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $this->adminA->id,
        ]);

        $cashService = app(CashTransactionService::class);

        $tx1 = $cashService->recordRepairOrderCashPayment(
            $this->tenantA->id,
            $this->branchA->id,
            $this->adminA->id,
            $payment,
            $order
        );

        $this->assertNotNull($tx1);
        $this->assertSame('Payment', $tx1->reference_type);
        $this->assertSame($payment->id, $tx1->reference_id);

        // Gọi lần 2 (kể cả khi notes bị đổi khác): vẫn idempotent nhờ (reference_type, reference_id)
        $tx1->update(['notes' => 'Ghi chú đã chỉnh sửa không còn chuỗi ngoặc vuông']);

        $tx2 = $cashService->recordRepairOrderCashPayment(
            $this->tenantA->id,
            $this->branchA->id,
            $this->adminA->id,
            $payment,
            $order
        );

        $this->assertSame($tx1->id, $tx2->id);
        $this->assertSame(
            1,
            CashTransaction::withoutGlobalScopes()
                ->where('reference_type', 'Payment')
                ->where('reference_id', $payment->id)
                ->where('type', 'income')
                ->count()
        );

        // Kiểm tra RefundService::processRefund() lưu reference_type = 'Payment' & reference_id = $payment->id
        $refundService = app(RefundService::class);
        $refundService->processRefund($payment, $this->adminA, [
            'refund_amount' => 400000,
            'refund_method' => 'cash',
            'refund_reason' => 'Khách đổi ý',
        ]);

        $refundTx = CashTransaction::withoutGlobalScopes()
            ->where('tenant_id', $this->tenantA->id)
            ->where('type', 'expense')
            ->where('category', 'refund')
            ->first();

        $this->assertNotNull($refundTx);
        $this->assertSame('Payment', $refundTx->reference_type);
        $this->assertSame($payment->id, $refundTx->reference_id);
    }

    public function test_different_tenants_can_share_customer_phone_and_part_sku_but_same_tenant_cannot(): void
    {
        $sharedPhone = '0977888999';
        $sharedSku = 'PIN-APP2-SHARED';

        $customerA = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Khách Tenant A',
            'phone'     => $sharedPhone,
        ]);

        $customerB = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Khách Tenant B',
            'phone'     => $sharedPhone,
        ]);

        $this->assertNotEquals($customerA->id, $customerB->id);

        // Cùng Tenant A tạo trùng số điện thoại sẽ bị chặn bởi uq_customers_tenant_phone
        $this->expectException(UniqueConstraintViolationException::class);
        Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Khách Trùng Tenant A',
            'phone'     => $sharedPhone,
        ]);
    }

    public function test_different_tenants_can_share_part_sku_and_customer_update_respects_tenant_scope(): void
    {
        $sharedSku = 'PIN-APP2-SHARED';

        $partA = Part::withoutGlobalScopes()->create([
            'tenant_id'        => $this->tenantA->id,
            'sku'              => $sharedSku,
            'name'             => 'Pin AirPods Pro 2 (A)',
            'category'         => 'Pin',
            'storage_location' => 'Kệ A1',
            'stock_quantity'   => 10,
            'cost_price'       => 80000,
            'retail_price'     => 250000,
        ]);

        $partB = Part::withoutGlobalScopes()->create([
            'tenant_id'        => $this->tenantB->id,
            'sku'              => $sharedSku,
            'name'             => 'Pin AirPods Pro 2 (B)',
            'category'         => 'Pin',
            'storage_location' => 'Kệ B1',
            'stock_quantity'   => 5,
            'cost_price'       => 85000,
            'retail_price'     => 260000,
        ]);

        $this->assertNotEquals($partA->id, $partB->id);

        // Kiểm tra API cập nhật số điện thoại khách hàng ở Tenant B trùng với số đã có ở Tenant A vẫn thành công
        Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Khách A',
            'phone'     => '0933444555',
        ]);

        $custB = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Khách B',
            'phone'     => '0933000111',
        ]);

        Sanctum::actingAs($this->adminB);
        $res = $this->putJson("/api/v1/customers/{$custB->id}", [
            'phone' => '0933444555',
        ]);
        $res->assertOk();
        $this->assertSame('0933444555', $custB->fresh()->phone);
    }

    public function test_bulk_inserts_for_device_order_qc_quote_and_goods_receipt(): void
    {
        Sanctum::actingAs($this->adminA);

        // 1. DeviceController::store & update (ChecklistTemplate::insert)
        $deviceRes = $this->postJson('/api/v1/devices', [
            'name'     => 'AirPods Max USB-C',
            'category' => 'AirPods Max',
            'checks'   => ['Kiểm tra ANC', 'Kiểm tra Digital Crown', 'Kiểm tra Cổng sạc'],
        ]);
        $deviceRes->assertCreated();
        $deviceId = $deviceRes->json('data.id');
        $this->assertSame(3, ChecklistTemplate::where('device_model_id', $deviceId)->count());

        $updateRes = $this->putJson("/api/v1/devices/{$deviceId}", [
            'checks' => ['Kiểm tra ANC', 'Kiểm tra Pin'],
        ]);
        $updateRes->assertOk();
        $this->assertSame(2, ChecklistTemplate::where('device_model_id', $deviceId)->count());

        // 2. OrderController::store (IntakeChecklist::insert)
        $orderRes = $this->postJson('/api/v1/orders', [
            'branch_id'         => $this->branchA->id,
            'customer_name'     => 'Nguyễn Văn Bulk',
            'customer_phone'    => '0944555666',
            'device_model_id'   => $deviceId,
            'issue_description' => 'Mất kết nối bên phải',
            'checklists'        => [
                ['item_name' => 'Ngoại quan tai trái', 'status' => 'pass'],
                ['item_name' => 'Ngoại quan tai phải', 'status' => 'fail'],
                ['item_name' => 'Hộp sạc', 'status' => 'not_tested'],
            ],
        ]);
        $orderRes->assertCreated();
        $orderId = $orderRes->json('data.id');
        $this->assertSame(3, IntakeChecklist::where('repair_order_id', $orderId)->count());

        // 3. QuoteController::store (QuoteItem::insert)
        $quoteRes = $this->postJson('/api/v1/quotes', [
            'repair_order_id' => $orderId,
            'note'            => 'Báo giá thay cáp & pin',
            'items'           => [
                ['description' => 'Thay pin tai phải', 'quantity' => 1, 'unit_price' => 250000],
                ['description' => 'Vệ sinh màng loa', 'quantity' => 1, 'unit_price' => 50000],
            ],
        ]);
        $quoteRes->assertCreated();
        $quoteId = $quoteRes->json('data.id');
        $this->assertSame(2, QuoteItem::where('quote_id', $quoteId)->count());

        // 4. QcController::store (QcChecklistResult::insert)
        RepairOrder::withoutGlobalScopes()->whereKey($orderId)->update(['status' => 'waiting_qc']);
        $qcRes = $this->postJson('/api/v1/qc', [
            'repair_order_id' => $orderId,
            'result'          => 'pass',
            'notes'           => 'Đạt chuẩn QC',
            'criteria'        => [
                ['criterion' => 'Âm thanh đều 2 bên', 'is_passed' => true],
                ['criterion' => 'Chống ồn ANC', 'is_passed' => true],
                ['criterion' => 'Sạc hộp ổn định', 'is_passed' => true],
            ],
        ]);
        $qcRes->assertCreated();
        $qcId = $qcRes->json('data.id');
        $this->assertSame(3, QcChecklistResult::where('qc_inspection_id', $qcId)->count());

        // 5. GoodsReceiptService::createReceipt (batch inventory codes & bulk insert)
        $supplier = Supplier::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'code'      => 'NCC-BULK',
            'name'      => 'NCC Linh Kiện Bulk',
            'phone'     => '0966777888',
            'is_active' => true,
        ]);

        $part1 = Part::withoutGlobalScopes()->create([
            'tenant_id'        => $this->tenantA->id,
            'sku'              => 'BULK-SKU-1',
            'name'             => 'Linh kiện 1',
            'category'         => 'Pin',
            'storage_location' => 'A1',
            'stock_quantity'   => 0,
            'cost_price'       => 0,
            'retail_price'     => 150000,
        ]);

        $part2 = Part::withoutGlobalScopes()->create([
            'tenant_id'        => $this->tenantA->id,
            'sku'              => 'BULK-SKU-2',
            'name'             => 'Linh kiện 2',
            'category'         => 'Loa',
            'storage_location' => 'A2',
            'stock_quantity'   => 0,
            'cost_price'       => 0,
            'retail_price'     => 200000,
        ]);

        $receipt = app(GoodsReceiptService::class)->createReceipt(
            $this->tenantA->id,
            $this->branchA->id,
            $this->adminA->id,
            [
                'supplier_id' => $supplier->id,
                'paid_amount' => 0,
                'items'       => [
                    ['part_id' => $part1->id, 'quantity' => 5, 'unit_price' => 70000],
                    ['part_id' => $part2->id, 'quantity' => 3, 'unit_price' => 90000],
                ],
            ]
        );

        $this->assertCount(2, $receipt->items);
        $this->assertSame(5, $part1->fresh()->stock_quantity);
        $this->assertSame(3, $part2->fresh()->stock_quantity);
    }

    public function test_system_setting_negative_cache_and_quota_service_plan_cache(): void
    {
        SystemSetting::clearCache();

        DB::enableQueryLog();
        DB::flushQueryLog();

        $val1 = SystemSetting::get('non_existent_setting_key_phase3', 'default_val');
        $val2 = SystemSetting::get('non_existent_setting_key_phase3', 'default_val');
        $val3 = SystemSetting::get('non_existent_setting_key_phase3', 'other_default');

        $queries = DB::getQueryLog();
        $this->assertCount(1, $queries);
        $this->assertSame('default_val', $val1);
        $this->assertSame('default_val', $val2);
        $this->assertSame('other_default', $val3);

        // Kiểm tra QuotaService::resolvePlan() cache in-memory
        QuotaService::clearCache();
        DB::flushQueryLog();

        $quotaService = app(QuotaService::class);
        $plan1 = $quotaService->resolvePlan($this->tenantA);
        $plan2 = $quotaService->resolvePlan($this->tenantA);
        $plan3 = $quotaService->resolvePlan($this->tenantB);

        $planQueries = collect(DB::getQueryLog())
            ->filter(fn ($q) => str_contains($q['query'], 'subscription_plans'))
            ->all();

        $this->assertCount(1, $planQueries);
        $this->assertSame('pro', $plan1->id);
        $this->assertSame($plan1, $plan2);
        $this->assertSame($plan1, $plan3);

        DB::disableQueryLog();
    }

    public function test_sqlite_infra_config_and_sepay_security_hardening(): void
    {
        $this->assertEquals(5000, config('database.connections.sqlite.busy_timeout'));
        $this->assertSame('WAL', config('database.connections.sqlite.journal_mode'));

        // Task 3.1: Khi không có biến môi trường SEPAY_WEBHOOK_SECRET, cả config('sepay.webhook_secret'),
        // config('services.sepay.api_key') và config('services.sepay.webhook_secret') đều mặc định là '' (chuỗi rỗng).
        $prevEnv = getenv('SEPAY_WEBHOOK_SECRET');
        $prevEnvArr = $_ENV['SEPAY_WEBHOOK_SECRET'] ?? null;
        $prevServerArr = $_SERVER['SEPAY_WEBHOOK_SECRET'] ?? null;

        try {
            putenv('SEPAY_WEBHOOK_SECRET');
            unset($_ENV['SEPAY_WEBHOOK_SECRET'], $_SERVER['SEPAY_WEBHOOK_SECRET']);

            $reloadedServices = require base_path('config/services.php');
            $reloadedSepay = require base_path('config/sepay.php');

            $this->assertSame('', $reloadedServices['sepay']['api_key']);
            $this->assertSame('', $reloadedServices['sepay']['webhook_secret']);
            $this->assertSame('', $reloadedSepay['webhook_secret']);
        } finally {
            if ($prevEnv !== false) {
                putenv("SEPAY_WEBHOOK_SECRET={$prevEnv}");
            }
            if ($prevEnvArr !== null) {
                $_ENV['SEPAY_WEBHOOK_SECRET'] = $prevEnvArr;
            }
            if ($prevServerArr !== null) {
                $_SERVER['SEPAY_WEBHOOK_SECRET'] = $prevServerArr;
            }
        }

        // Task 3.4: Migration 2026_10_22_000001 không chứa khai báo trùng 'idx_cash_tx_reference'
        $migration000001 = require base_path('database/migrations/2026_10_22_000001_add_performance_indexes_for_mysql.php');
        $refProp = new \ReflectionProperty($migration000001, 'indexes');
        $refProp->setAccessible(true);
        $indexes000001 = $refProp->getValue($migration000001);
        $this->assertArrayNotHasKey('idx_cash_tx_reference', $indexes000001['cash_transactions'] ?? []);

        // PlatformBillingController::getSepayConfig không trả về chuỗi secret mặc định cứng khi config rỗng
        config([
            'services.sepay.api_key'        => '',
            'services.sepay.webhook_secret' => '',
            'sepay.webhook_secret'          => '',
        ]);
        SystemSetting::clearCache();

        $superAdmin = User::withoutGlobalScopes()->forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'Super Admin',
            'email'     => 'superadmin@podscare.test',
            'phone'     => '0900000000',
            'password'  => bcrypt('password'),
            'role'      => 'super_admin',
            'is_active' => true,
        ]);

        Sanctum::actingAs($superAdmin);
        $sepayConfigRes = $this->getJson('/api/v1/platform/integrations/sepay');
        $sepayConfigRes->assertOk();
        $this->assertNotSame('fixo_secret_sepay_platform_2026', $sepayConfigRes->json('data.webhook_secret'));
        $this->assertSame('', $sepayConfigRes->json('data.webhook_secret'));

        // Khi secret rỗng (''), gọi cả 2 endpoint webhook (/api/v1/webhooks/sepay và /api/v1/saas/sepay/webhook)
        // kể cả kèm secret mặc định cũ hay rỗng đều bị từ chối 401
        $emptySecretRes = $this->postJson('/api/v1/webhooks/sepay', [
            'id' => '998',
        ], [
            'SePay-Api-Key' => 'fixo_secret_sepay_platform_2026',
        ]);
        $emptySecretRes->assertStatus(401);

        $emptySaasWebhookRes = $this->postJson('/api/v1/saas/sepay/webhook', [
            'id' => '998-saas',
        ], [
            'SePay-Api-Key' => '',
        ]);
        $emptySaasWebhookRes->assertStatus(401);

        // SePayPlatformWebhookController không log raw headerKey khi unauthorized
        config(['sepay.webhook_secret' => 'real_secret_2026']);
        Log::spy();

        $webhookRes = $this->postJson('/api/v1/webhooks/sepay', [
            'id' => '999',
        ], [
            'SePay-Api-Key' => 'leaked_sensitive_token_value',
        ]);

        $webhookRes->assertStatus(401);
        Log::shouldHaveReceived('warning')
            ->once()
            ->withArgs(function (string $message, array $context) {
                return $message === 'SePay Webhook unauthorized attempt'
                    && ! array_key_exists('headerKey', $context)
                    && ($context['has_header_key'] ?? false) === true;
            });
    }

    public function test_database_transactions_preserves_seeded_baseline_data(): void
    {
        // Chứng minh việc sử dụng DatabaseTransactions thay cho RefreshDatabase giúp bảo toàn
        // dữ liệu nền từ DatabaseSeeder xuyên suốt quá trình chạy test suite
        $this->assertGreaterThan(0, SubscriptionPlan::count());
        $this->assertGreaterThan(1, SubscriptionPlan::count(), 'Các gói cước nền từ DatabaseSeeder phải còn nguyên vẹn (không chỉ có gói pro tạo trong setUp).');
        $this->assertGreaterThan(0, DeviceModel::count(), 'Danh mục dòng máy từ DatabaseSeeder không bị xóa trắng bởi RefreshDatabase.');
        $this->assertGreaterThan(0, User::count());
        $this->assertGreaterThan(2, User::withoutGlobalScopes()->count(), 'Tài khoản người dùng nền từ DatabaseSeeder phải còn nguyên vẹn bên cạnh 2 user test trong setUp.');
        $this->assertGreaterThan(2, Branch::withoutGlobalScopes()->count(), 'Chi nhánh nền từ DatabaseSeeder phải còn nguyên vẹn bên cạnh 2 branch test trong setUp.');
        $this->assertGreaterThan(0, Part::withoutGlobalScopes()->count(), 'Danh mục linh kiện nền từ DatabaseSeeder không bị xóa trắng.');
    }
}

