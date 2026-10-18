<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashTransaction;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\TelegramRecipient;
use App\Models\Tenant;
use App\Models\User;
use App\Services\TelegramAi\TelegramAiToolRegistry;
use App\Services\TelegramAi\Tools\RevenueSummaryTool;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class RevenueSummaryToolTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected Branch $branchA1;
    protected Branch $branchA2;
    protected Branch $branchB1;
    protected DeviceModel $deviceModel;
    protected User $staffA;
    protected User $staffB;
    protected Customer $customerA;
    protected Customer $customerB;
    protected TelegramRecipient $recipientTenantAllBranches;
    protected TelegramRecipient $recipientBranchA1Only;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();

        Config::set('services.telegram.bot_token', 'test_bot_token_phase3');
        Config::set('services.telegram.bot_username', 'PodsCareNotifyBot');
        Config::set('services.telegram.webhook_secret', '');
        Config::set('services.gemini.base_url', '');
        Config::set('services.gemini.api_key', 'test_gemini_api_key_phase3');
        Config::set('services.gemini.model', 'gemini-2.0-flash');
        Config::set('services.gemini.fallback_models', 'gemini-2.0-flash-lite,gemini-2.5-flash');
        Config::set('services.gemini.timeout', 15);

        $this->tenantA = Tenant::create([
            'name'   => 'PodsCare Sài Gòn (Tenant A)',
            'code'   => 'tenant-a-p3-' . uniqid(),
            'status' => 'active',
        ]);

        $this->tenantB = Tenant::create([
            'name'   => 'PodsCare Hà Nội (Tenant B)',
            'code'   => 'tenant-b-p3-' . uniqid(),
            'status' => 'active',
        ]);

        $this->branchA1 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'CN-Q1-' . rand(100, 999),
            'address'   => '123 Lê Lợi, Quận 1',
            'phone'     => '0901111111',
            'is_active' => true,
        ]);

        $this->branchA2 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Quận 3',
            'code'      => 'CN-Q3-' . rand(100, 999),
            'address'   => '456 Võ Văn Tần, Quận 3',
            'phone'     => '0902222222',
            'is_active' => true,
        ]);

        $this->branchB1 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Chi nhánh Cầu Giấy',
            'code'      => 'CN-CG-' . rand(100, 999),
            'address'   => '789 Cầu Giấy, Hà Nội',
            'phone'     => '0903333333',
            'is_active' => true,
        ]);

        $this->deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro 2 (USB-C)',
            'category'     => 'AirPods',
            'model_code'   => 'A3048-' . rand(10, 99),
            'release_year' => 2023,
            'manufacturer' => 'Apple',
            'has_anc'      => true,
            'is_active'    => true,
        ]);

        $this->staffA = User::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'Quản lý Thu Hà',
            'email'     => 'ql.ha.' . uniqid() . '@podscare.vn',
            'phone'     => '0911444555',
            'password'  => 'password123',
            'is_active' => true,
        ]);

        $this->staffB = User::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantB->id,
            'branch_id' => $this->branchB1->id,
            'name'      => 'Quản lý Quốc Huy',
            'email'     => 'ql.huy.' . uniqid() . '@podscare.vn',
            'phone'     => '0911666777',
            'password'  => 'password123',
            'is_active' => true,
        ]);

        $this->customerA = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Khách Hàng Sài Gòn',
            'phone'     => '0909' . rand(100000, 999999),
            'address'   => 'TP.HCM',
        ]);

        $this->customerB = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Khách Hàng Hà Nội',
            'phone'     => '0918' . rand(100000, 999999),
            'address'   => 'Hà Nội',
        ]);

        // --- Dữ liệu HÔM NAY của Tenant A ---
        // 1. Đơn tại quầy (in_store) tại Chi nhánh Quận 1 - đã hoàn thành (completed) - 500.000đ
        $orderA1InStore = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCQ1-TODAY-01',
            'customer_id'        => $this->customerA->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Thay pin 2 tai AirPods Pro 2',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 500000,
            'initial_price'      => 500000,
            'created_by_user_id' => $this->staffA->id,
        ]);

        // 2. Đơn COD tại Chi nhánh Quận 1 - đang sửa (repairing) - 350.000đ
        $orderA1Cod = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCQ1-TODAY-02',
            'customer_id'        => $this->customerA->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Sửa mic tai phải khách tỉnh',
            'status'             => 'repairing',
            'order_type'         => 'cod',
            'total_price'        => 350000,
            'initial_price'      => 350000,
            'created_by_user_id' => $this->staffA->id,
        ]);

        // 3. Đơn bảo hành (warranty) tại Chi nhánh Quận 3 - đã giao (delivered) - 0đ
        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA2->id,
            'order_code'         => 'PCQ3-TODAY-03',
            'customer_id'        => $this->customerA->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Bảo hành vệ sinh lưới loa',
            'status'             => 'delivered',
            'order_type'         => 'warranty',
            'total_price'        => 0,
            'initial_price'      => 0,
            'created_by_user_id' => $this->staffA->id,
        ]);

        // 4. Đơn tại quầy tại Chi nhánh Quận 3 - 400.000đ
        $orderA2InStore = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA2->id,
            'order_code'         => 'PCQ3-TODAY-04',
            'customer_id'        => $this->customerA->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Sửa bản lề hộp sạc',
            'status'             => 'received',
            'order_type'         => 'in_store',
            'total_price'        => 400000,
            'initial_price'      => 400000,
            'created_by_user_id' => $this->staffA->id,
        ]);

        // Thanh toán (Payment) của Tenant A hôm nay:
        // - Payment 1 (Quận 1): 500.000đ, refund 50.000đ => thực thu 450.000đ
        Payment::withoutGlobalScopes()->create([
            'payment_code'        => 'PAY-A1-' . uniqid(),
            'repair_order_id'     => $orderA1InStore->id,
            'amount'              => 500000,
            'refund_amount'       => 50000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $this->staffA->id,
        ]);

        // - Payment 2 (Quận 3): 200.000đ (status completed) => thực thu 200.000đ
        Payment::withoutGlobalScopes()->create([
            'payment_code'        => 'PAY-A2-' . uniqid(),
            'repair_order_id'     => $orderA2InStore->id,
            'amount'              => 200000,
            'refund_amount'       => 0,
            'payment_method'      => 'bank_transfer',
            'status'              => 'completed',
            'paid_at'             => now(),
            'received_by_user_id' => $this->staffA->id,
        ]);

        // - Payment 3 (Quận 1, status = pending) => không được cộng vào thực thu
        Payment::withoutGlobalScopes()->create([
            'payment_code'        => 'PAY-A1-PENDING-' . uniqid(),
            'repair_order_id'     => $orderA1Cod->id,
            'amount'              => 350000,
            'refund_amount'       => 0,
            'payment_method'      => 'bank_transfer',
            'status'              => 'pending',
            'paid_at'             => now(),
            'received_by_user_id' => $this->staffA->id,
        ]);

        // Sổ quỹ (CashTransaction) của Tenant A hôm nay:
        // - Thu sổ quỹ Quận 1: 600.000đ
        CashTransaction::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'transaction_code'   => 'CT-IN-Q1-' . uniqid(),
            'type'               => 'income',
            'category'           => 'other_income',
            'payment_method'     => 'cash',
            'amount'             => 600000,
            'created_by_user_id' => $this->staffA->id,
        ]);

        // - Chi sổ quỹ Quận 1: 150.000đ
        CashTransaction::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'transaction_code'   => 'CT-EX-Q1-' . uniqid(),
            'type'               => 'expense',
            'category'           => 'store_operations',
            'payment_method'     => 'cash',
            'amount'             => 150000,
            'created_by_user_id' => $this->staffA->id,
        ]);

        // - Thu sổ quỹ Quận 3: 300.000đ
        CashTransaction::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA2->id,
            'transaction_code'   => 'CT-IN-Q3-' . uniqid(),
            'type'               => 'income',
            'category'           => 'other_income',
            'payment_method'     => 'bank_transfer',
            'amount'             => 300000,
            'created_by_user_id' => $this->staffA->id,
        ]);

        // --- Dữ liệu của Tenant B hôm nay (tuyệt đối không được cộng lẫn vào Tenant A) ---
        $orderB1 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantB->id,
            'branch_id'          => $this->branchB1->id,
            'order_code'         => 'PCHN-TODAY-99',
            'customer_id'        => $this->customerB->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Đơn của cửa hàng B',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 9000000,
            'initial_price'      => 9000000,
            'created_by_user_id' => $this->staffB->id,
        ]);

        Payment::withoutGlobalScopes()->create([
            'payment_code'        => 'PAY-B1-' . uniqid(),
            'repair_order_id'     => $orderB1->id,
            'amount'              => 9000000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $this->staffB->id,
        ]);

        CashTransaction::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantB->id,
            'branch_id'          => $this->branchB1->id,
            'transaction_code'   => 'CT-IN-B1-' . uniqid(),
            'type'               => 'income',
            'category'           => 'other_income',
            'payment_method'     => 'cash',
            'amount'             => 9000000,
            'created_by_user_id' => $this->staffB->id,
        ]);

        $this->recipientTenantAllBranches = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => null,
            'label'             => 'Admin Toàn Cửa Hàng A',
            'phone'             => '0862389728',
            'target_role'       => 'admin',
            'telegram_chat_id'  => '8841956311',
            'connect_token'     => 'adm_p3_all_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);

        $this->recipientBranchA1Only = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => $this->branchA1->id,
            'label'             => 'Quản lý Chi nhánh Quận 1',
            'phone'             => '0862389729',
            'target_role'       => 'admin',
            'telegram_chat_id'  => '8841956312',
            'connect_token'     => 'adm_p3_b1_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);
    }

    /**
     * 1. Thống kê chính xác tổng số đơn mới (theo cả 3 loại in_store, cod, warranty),
     *    doanh thu dự kiến, thực thu Payment và thu/chi CashTransaction trong ngày (period = 'today').
     */
    public function test_revenue_summary_tool_calculates_exact_today_metrics_for_tenant(): void
    {
        $tool = new RevenueSummaryTool();

        $result = $tool->execute([
            'period' => 'today',
        ], $this->recipientTenantAllBranches);

        $this->assertSame('today', $result['period']);
        $this->assertSame('Chi nhánh Quận 1, Chi nhánh Quận 3', $result['branch_scope']);
        $this->assertSame('Chi nhánh Quận 1, Chi nhánh Quận 3', $result['branch_name']);
        $this->assertSame(4, $result['total_new_orders']);
        $this->assertSame(2, $result['in_store_orders']);
        $this->assertSame(1, $result['cod_orders']);
        $this->assertSame(1, $result['warranty_orders']);
        $this->assertSame(2, $result['completed_orders']);

        // Doanh thu dự kiến: 500k + 350k + 0 + 400k = 1.250.000 đ
        $this->assertSame(1250000.0, $result['estimated_order_revenue']);
        $this->assertSame('1.250.000 đ', $result['formatted_estimated_order_revenue']);

        // Thực thu Payment: (500k - 50k refund) + 200k = 650.000 đ (bỏ qua 350k pending)
        $this->assertSame(650000.0, $result['net_payment_collected']);
        $this->assertSame('650.000 đ', $result['formatted_net_payment_collected']);

        // Sổ quỹ: thu 600k + 300k = 900k; chi 150k; dòng tiền ròng = 750.000 đ
        $this->assertSame(900000.0, $result['cashbook_income']);
        $this->assertSame('900.000 đ', $result['formatted_cashbook_income']);
        $this->assertSame(150000.0, $result['cashbook_expense']);
        $this->assertSame('150.000 đ', $result['formatted_cashbook_expense']);
        $this->assertSame(750000.0, $result['net_cashflow']);
        $this->assertSame('750.000 đ', $result['formatted_net_cashflow']);
    }

    /**
     * 2. Hỗ trợ chuẩn hóa khoảng ngày tùy chỉnh (date_from, date_to định dạng d/m/Y hoặc Y-m-d)
     *    và lọc theo tên chi nhánh (branch_name).
     */
    public function test_revenue_summary_tool_normalizes_custom_date_range_and_filters_by_branch_name(): void
    {
        // Tạo dữ liệu ở ngày cố định 10/10/2026 tại Chi nhánh Quận 3
        $customDate = \Carbon\Carbon::create(2026, 10, 10, 14, 30, 0);

        $pastOrder = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA2->id,
            'order_code'         => 'PCQ3-101026-01',
            'customer_id'        => $this->customerA->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Thay màng loa AirPods 3',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 320000,
            'initial_price'      => 320000,
            'created_by_user_id' => $this->staffA->id,
        ]);
        $pastOrder->timestamps = false;
        $pastOrder->created_at = $customDate;
        $pastOrder->updated_at = $customDate;
        $pastOrder->save();

        $tool = new RevenueSummaryTool();

        // Truyền định dạng DD/MM/YYYY kèm branch_name = 'Quận 3'
        $customResult = $tool->execute([
            'date_from'   => '10/10/2026',
            'date_to'     => '10/10/2026',
            'branch_name' => 'Quận 3',
        ], $this->recipientTenantAllBranches);

        $this->assertSame('custom', $customResult['period']);
        $this->assertSame('2026-10-10', $customResult['date_from']);
        $this->assertSame('2026-10-10', $customResult['date_to']);
        $this->assertSame('Chi nhánh Quận 3', $customResult['branch_scope']);
        $this->assertSame(1, $customResult['total_new_orders']);
        $this->assertSame(320000.0, $customResult['estimated_order_revenue']);
        $this->assertSame('320.000 đ', $customResult['formatted_estimated_order_revenue']);

        // Khi lọc hôm nay cho riêng 'Quận 1' từ tài khoản Admin toàn cửa hàng
        $q1Today = $tool->execute([
            'period'      => 'today',
            'branch_name' => 'Quận 1',
        ], $this->recipientTenantAllBranches);

        $this->assertSame('Chi nhánh Quận 1', $q1Today['branch_scope']);
        $this->assertSame(2, $q1Today['total_new_orders']);
        $this->assertSame(850000.0, $q1Today['estimated_order_revenue']);
        $this->assertSame(450000.0, $q1Today['net_payment_collected']);
        $this->assertSame(600000.0, $q1Today['cashbook_income']);
        $this->assertSame(150000.0, $q1Today['cashbook_expense']);
    }

    /**
     * 3. Bảo mật cô lập tuyệt đối tenant_id và branch_id:
     *    - Người nhận bị giới hạn branch_id (Quận 1) cố tình truyền branch_name = 'Quận 3'
     *      hoặc 'Cầu Giấy' vẫn bị khóa cứng ở Quận 1, không rò rỉ số liệu.
     */
    public function test_revenue_summary_tool_strictly_isolates_tenant_and_locked_branch(): void
    {
        $tool = new RevenueSummaryTool();

        // Người nhận chỉ thuộc Chi nhánh Quận 1 cố tình hỏi doanh thu 'Quận 3'
        $result = $tool->execute([
            'period'      => 'today',
            'branch_name' => 'Quận 3',
        ], $this->recipientBranchA1Only);

        $this->assertSame($this->branchA1->id, $result['branch_id']);
        $this->assertSame('Chi nhánh Quận 1', $result['branch_scope']);
        $this->assertSame('Chi nhánh Quận 1', $result['branch_name']);
        $this->assertSame(2, $result['total_new_orders']);
        $this->assertSame(850000.0, $result['estimated_order_revenue']);
        $this->assertSame(450000.0, $result['net_payment_collected']);
        $this->assertSame(600000.0, $result['cashbook_income']);
        $this->assertSame(150000.0, $result['cashbook_expense']);
    }

    /**
     * 4. Luồng 2 bước End-to-End qua Webhook Telegram (POST /api/v1/webhooks/telegram):
     *    - Bước 1: Gemini bóc tách tham số gọi 'get_revenue_summary' (chỉ gọi Gemini đúng 1 lần duy nhất).
     *    - Bước 2: RevenueSummaryTool truy vấn DB thật và tự format báo cáo HTML tiếng Việt chuẩn gửi thẳng về Telegram.
     */
    public function test_end_to_end_webhook_calls_revenue_summary_tool_and_sends_clean_html_reply(): void
    {
        /** @var TelegramAiToolRegistry $registry */
        $registry = $this->app->make(TelegramAiToolRegistry::class);
        $this->assertNotNull($registry->get('get_revenue_summary'));

        $geminiCallCount = 0;

        Http::fake(function ($request) use (&$geminiCallCount) {
            if (str_contains($request->url(), 'generativelanguage.googleapis.com')) {
                $geminiCallCount++;
                return Http::response([
                    'candidates' => [
                        [
                            'content' => [
                                'role'  => 'model',
                                'parts' => [
                                    [
                                        'functionCall' => [
                                            'name' => 'get_revenue_summary',
                                            'args' => [
                                                'period' => 'today',
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ], 200);
            }

            return Http::response(['ok' => true], 200);
        });

        $response = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 93001,
            'message'   => [
                'message_id' => 301,
                'chat'       => ['id' => 8841956311, 'type' => 'private'],
                'text'       => 'Báo cáo doanh thu và thu chi hôm nay của cửa hàng giúp anh nhé',
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', true);

        // Xác nhận chỉ gọi Gemini đúng 1 lần duy nhất ở Bước 1 (cắt bỏ Bước 3)
        $this->assertSame(1, $geminiCallCount);

        // Kiểm tra tin nhắn gửi về Telegram do RevenueSummaryTool::formatHtml tạo ra có HTML tiếng Việt sạch, đúng số liệu thật
        $sentTelegramText = null;
        Http::assertSent(function ($request) use (&$sentTelegramText) {
            if (str_contains($request->url(), '/sendMessage') && (string) $request['chat_id'] === '8841956311') {
                $sentTelegramText = (string) $request['text'];
                return true;
            }
            return false;
        });

        $this->assertNotNull($sentTelegramText);
        $this->assertStringStartsWith('<b>Báo cáo doanh thu - Hôm nay', $sentTelegramText);
        $this->assertStringContainsString('Chi nhánh: <b>Chi nhánh Quận 1, Chi nhánh Quận 3</b>', $sentTelegramText);
        $this->assertStringContainsString('<b>1.250.000 đ</b>', $sentTelegramText);
        $this->assertStringContainsString('<b>650.000 đ</b>', $sentTelegramText);
        $this->assertStringContainsString('<b>750.000 đ</b>', $sentTelegramText);
        $this->assertStringNotContainsString('{', $sentTelegramText);
        $this->assertStringNotContainsString('}', $sentTelegramText);
    }
}

