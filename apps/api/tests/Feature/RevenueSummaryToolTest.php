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
        Config::set('services.gemini.base_url', 'http://127.0.0.1:20128/v1');
        Config::set('services.gemini.api_key', '9router-local');
        Config::set('services.gemini.model', 'podscare-ai');
        Config::set('services.gemini.fallback_models', '');
        Config::set('services.gemini.timeout', 20);

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
            if (str_contains($request->url(), '127.0.0.1:20128/v1/chat/completions')) {
                $geminiCallCount++;
                return Http::response([
                    'id'      => 'chatcmpl-p3-001',
                    'object'  => 'chat.completion',
                    'model'   => 'podscare-ai',
                    'choices' => [
                        [
                            'index'   => 0,
                            'message' => [
                                'role'       => 'assistant',
                                'content'    => null,
                                'tool_calls' => [
                                    [
                                        'id'       => 'call_rev_01',
                                        'type'     => 'function',
                                        'function' => [
                                            'name'      => 'get_revenue_summary',
                                            'arguments' => json_encode(['period' => 'today']),
                                        ],
                                    ],
                                ],
                            ],
                            'finish_reason' => 'tool_calls',
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

        // Xác nhận chỉ gọi 9Router đúng 1 lần duy nhất cho báo cáo đơn giản
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

    /**
     * 5. Phân tích & so sánh doanh thu đa chiều (group_by: device_category, technician, service, branch, order_type)
     *    và lọc riêng theo device_category, đảm bảo cô lập tuyệt đối tenant_id.
     */
    public function test_revenue_summary_tool_supports_group_by_device_category_technician_service_branch_order_type_and_device_filter(): void
    {
        $watchModel = DeviceModel::create([
            'name'         => 'Apple Watch Ultra 49mm',
            'category'     => 'Apple Watch',
            'model_code'   => 'A2684-' . rand(10, 99),
            'release_year' => 2023,
            'manufacturer' => 'Apple',
            'has_anc'      => false,
            'is_active'    => true,
        ]);

        // Tạo 1 đơn Apple Watch của Tenant A hôm nay: 1.850.000 đ (lớn hơn tổng AirPods 1.250.000 đ)
        $watchOrderA = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCQ1-WATCH-01',
            'customer_id'        => $this->customerA->id,
            'device_model_id'    => $watchModel->id,
            'issue_description'  => 'Thay màn hình Apple Watch Ultra',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 1850000,
            'initial_price'      => 1850000,
            'created_by_user_id' => $this->staffA->id,
            'technician_id'      => $this->staffA->id,
        ]);

        Payment::withoutGlobalScopes()->create([
            'payment_code'        => 'PAY-WATCH-A1-' . uniqid(),
            'repair_order_id'     => $watchOrderA->id,
            'amount'              => 1850000,
            'refund_amount'       => 0,
            'payment_method'      => 'bank_transfer',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $this->staffA->id,
        ]);

        $tool = new RevenueSummaryTool();

        // A. So sánh doanh thu AirPods vs Apple Watch (group_by = device_category)
        $byDevice = $tool->execute([
            'period'   => 'today',
            'group_by' => 'device_category',
        ], $this->recipientTenantAllBranches);

        $this->assertSame('device_category', $byDevice['group_by']);
        $this->assertCount(2, $byDevice['breakdown']);

        // Nhóm đứng đầu: Apple Watch (1.850.000 đ / 1 đơn) > AirPods (1.250.000 đ / 4 đơn), chênh lệch 600.000 đ
        $this->assertSame('Apple Watch', $byDevice['breakdown'][0]['group_label']);
        $this->assertSame(1850000.0, $byDevice['breakdown'][0]['estimated_revenue']);
        $this->assertSame(1850000.0, $byDevice['breakdown'][0]['net_payment_collected']);
        $this->assertSame(1, $byDevice['breakdown'][0]['orders_count']);

        $this->assertSame('AirPods', $byDevice['breakdown'][1]['group_label']);
        $this->assertSame(1250000.0, $byDevice['breakdown'][1]['estimated_revenue']);
        $this->assertSame(650000.0, $byDevice['breakdown'][1]['net_payment_collected']);
        $this->assertSame(4, $byDevice['breakdown'][1]['orders_count']);

        $this->assertStringContainsString(
            'Apple Watch cao hơn AirPods 600.000 đ (Apple Watch: 1.850.000 đ / 1 đơn vs AirPods: 1.250.000 đ / 4 đơn)',
            (string) $byDevice['comparison_summary']
        );

        $html = $tool->formatHtml($byDevice);
        $this->assertStringContainsString('Nhận xét so sánh: <b>Apple Watch cao hơn AirPods 600.000 đ', $html);
        $this->assertStringContainsString('<b>Phân tích chi tiết theo nhóm:</b>', $html);
        $this->assertStringContainsString('- <b>Apple Watch</b>: <b>1.850.000 đ</b>', $html);
        $this->assertStringContainsString('- <b>AirPods</b>: <b>1.250.000 đ</b>', $html);

        // B. Gom nhóm theo kỹ thuật viên (group_by = technician)
        $byTech = $tool->execute([
            'period'   => 'today',
            'group_by' => 'technician',
        ], $this->recipientTenantAllBranches);

        $this->assertNotEmpty($byTech['breakdown']);
        $this->assertSame('Quản lý Thu Hà', $byTech['breakdown'][0]['group_label']);
        $this->assertSame(1850000.0, $byTech['breakdown'][0]['estimated_revenue']);

        // C. Gom nhóm theo dịch vụ (group_by = service)
        $byService = $tool->execute([
            'period'   => 'today',
            'group_by' => 'service',
        ], $this->recipientTenantAllBranches);

        $this->assertNotEmpty($byService['breakdown']);
        $this->assertSame('Thay màn hình Apple Watch Ultra', $byService['breakdown'][0]['group_label']);

        // D. Gom nhóm theo chi nhánh (group_by = branch) và loại đơn (group_by = order_type)
        $byBranch = $tool->execute([
            'period'   => 'today',
            'group_by' => 'branch',
        ], $this->recipientTenantAllBranches);
        $this->assertCount(2, $byBranch['breakdown']);
        $this->assertSame('Chi nhánh Quận 1', $byBranch['breakdown'][0]['group_label']);

        $byOrderType = $tool->execute([
            'period'   => 'today',
            'group_by' => 'order_type',
        ], $this->recipientTenantAllBranches);
        $this->assertNotEmpty($byOrderType['breakdown']);
        $this->assertSame('Khách tại cửa hàng', $byOrderType['breakdown'][0]['group_label']);

        // E. Lọc riêng theo device_category = 'Apple Watch'
        $onlyWatch = $tool->execute([
            'period'          => 'today',
            'device_category' => 'Apple Watch',
        ], $this->recipientTenantAllBranches);

        $this->assertSame('Apple Watch', $onlyWatch['device_category']);
        $this->assertSame(1, $onlyWatch['total_new_orders']);
        $this->assertSame(1850000.0, $onlyWatch['estimated_order_revenue']);
        $this->assertSame(1850000.0, $onlyWatch['net_payment_collected']);
    }

    /**
     * 6. Loại trừ tuyệt đối các đơn cancelled và rejected khỏi estimated_order_revenue,
     *    bảng phân rã breakdown và comparison_summary, đồng thời đếm chính xác cancelled_orders.
     */
    public function test_revenue_summary_tool_excludes_cancelled_and_rejected_orders_from_estimated_revenue_and_breakdown(): void
    {
        $watchModel = DeviceModel::create([
            'name'         => 'Apple Watch Series 9 45mm',
            'category'     => 'Apple Watch',
            'model_code'   => 'A2980-' . rand(10, 99),
            'release_year' => 2023,
            'manufacturer' => 'Apple',
            'has_anc'      => false,
            'is_active'    => true,
        ]);

        // Đơn Apple Watch hợp lệ (completed) - 1.850.000 đ
        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCQ1-WATCH-VALID-01',
            'customer_id'        => $this->customerA->id,
            'device_model_id'    => $watchModel->id,
            'issue_description'  => 'Thay mặt kính cảm ứng Apple Watch Series 9',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 1850000,
            'initial_price'      => 1850000,
            'created_by_user_id' => $this->staffA->id,
            'technician_id'      => $this->staffA->id,
        ]);

        // Đơn AirPods đã hủy (cancelled) - 900.000 đ -> KHÔNG được cộng vào doanh thu ước tính và breakdown
        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCQ1-AIRPODS-CANCEL-01',
            'customer_id'        => $this->customerA->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Đơn khách hủy không sửa nữa',
            'status'             => 'cancelled',
            'order_type'         => 'in_store',
            'total_price'        => 900000,
            'initial_price'      => 900000,
            'created_by_user_id' => $this->staffA->id,
        ]);

        // Đơn Apple Watch khách từ chối sửa (rejected) - 2.500.000 đ -> KHÔNG được cộng vào doanh thu ước tính và breakdown
        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA2->id,
            'order_code'         => 'PCQ3-WATCH-REJECT-01',
            'customer_id'        => $this->customerA->id,
            'device_model_id'    => $watchModel->id,
            'issue_description'  => 'Khách từ chối báo giá thay màn hình',
            'status'             => 'rejected',
            'order_type'         => 'in_store',
            'total_price'        => 2500000,
            'initial_price'      => 2500000,
            'created_by_user_id' => $this->staffA->id,
        ]);

        $tool = new RevenueSummaryTool();

        $result = $tool->execute([
            'period'   => 'today',
            'group_by' => 'device_category',
        ], $this->recipientTenantAllBranches);

        // Tổng số đơn mới phát sinh: 4 đơn cũ + 1 đơn Watch hợp lệ + 2 đơn hủy/từ chối = 7
        $this->assertSame(7, $result['total_new_orders']);
        $this->assertSame(2, $result['cancelled_orders']);

        // Doanh thu ước tính chỉ cộng các đơn hợp lệ: 1.250.000 (AirPods) + 1.850.000 (Apple Watch) = 3.100.000 đ
        $this->assertSame(3100000.0, $result['estimated_order_revenue']);
        $this->assertSame('3.100.000 đ', $result['formatted_estimated_order_revenue']);

        // Bảng breakdown tuyệt đối không tính đơn cancelled/rejected vào orders_count hay estimated_revenue
        $this->assertCount(2, $result['breakdown']);
        $this->assertSame('Apple Watch', $result['breakdown'][0]['group_label']);
        $this->assertSame(1, $result['breakdown'][0]['orders_count']);
        $this->assertSame(1850000.0, $result['breakdown'][0]['estimated_revenue']);

        $this->assertSame('AirPods', $result['breakdown'][1]['group_label']);
        $this->assertSame(4, $result['breakdown'][1]['orders_count']);
        $this->assertSame(1250000.0, $result['breakdown'][1]['estimated_revenue']);

        $this->assertStringContainsString(
            'Apple Watch cao hơn AirPods 600.000 đ (Apple Watch: 1.850.000 đ / 1 đơn vs AirPods: 1.250.000 đ / 4 đơn)',
            (string) $result['comparison_summary']
        );

        $html = $tool->formatHtml($result);
        $this->assertStringContainsString('- Số đơn đã hủy/từ chối sửa: <b>2</b> đơn', $html);
        $this->assertStringContainsString('<b>3.100.000 đ</b>', $html);
    }

    /**
     * 7. Kiểm tra phân quyền: Người nhận có target_role là 'admin' hoặc 'super_admin' được phép truy cập,
     *    còn 'technician' và 'receptionist' bị từ chối truy cập báo cáo doanh thu và sổ quỹ.
     */
    public function test_revenue_summary_tool_denies_non_admin_recipients(): void
    {
        $superAdminRecipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => null,
            'label'             => 'Super Admin Hệ Thống',
            'phone'             => '0909111000',
            'target_role'       => 'super_admin',
            'telegram_chat_id'  => '8841956390',
            'connect_token'     => 'sadm_p1_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);

        $techRecipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => $this->branchA1->id,
            'label'             => 'KTV Quận 1',
            'phone'             => '0909111222',
            'target_role'       => 'technician',
            'telegram_chat_id'  => '8841956399',
            'connect_token'     => 'tech_p1_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);

        $receptionistRecipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => $this->branchA1->id,
            'label'             => 'Lễ tân Quận 1',
            'phone'             => '0909111333',
            'target_role'       => 'receptionist',
            'telegram_chat_id'  => '8841956398',
            'connect_token'     => 'rec_p1_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);

        $tool = new RevenueSummaryTool();

        // Super Admin được phép truy cập đầy đủ số liệu doanh thu và sổ quỹ như Admin
        $superAdminRes = $tool->execute(['period' => 'today'], $superAdminRecipient);
        $this->assertArrayNotHasKey('error', $superAdminRes);
        $this->assertSame(1250000.0, $superAdminRes['estimated_order_revenue']);
        $this->assertSame(650000.0, $superAdminRes['net_payment_collected']);

        foreach ([$techRecipient, $receptionistRecipient] as $nonAdmin) {
            $result = $tool->execute(['period' => 'today'], $nonAdmin);

            $this->assertSame('Bạn không có quyền truy cập báo cáo doanh thu và sổ quỹ.', $result['error'] ?? null);
            $this->assertArrayNotHasKey('estimated_order_revenue', $result);
            $this->assertArrayNotHasKey('cashbook_income', $result);

            $html = $tool->formatHtml($result);
            $this->assertStringContainsString('<b>Từ chối quyền truy cập</b>', $html);
            $this->assertStringContainsString('Bạn không có quyền truy cập báo cáo doanh thu và sổ quỹ.', $html);
            $this->assertStringNotContainsString('1.250.000 đ', $html);
        }
    }

    /**
     * 8. Giai đoạn 3 (Task 3.1, 3.2, 3.4):
     *    - Loại trừ các khoản thanh toán (Payment) thuộc đơn sửa chữa đã hủy (cancelled) hoặc từ chối sửa (rejected)
     *      khỏi Tổng thực thu (net_payment_collected) để khớp 100% với tổng thực thu trong bảng phân rã (breakdown).
     *    - Kiểm tra checkdate() trong parseDate() và escapeLike() đối với branch_name / device_category.
     */
    public function test_phase3_excludes_cancelled_and_rejected_order_payments_from_net_payment_collected_and_escapes_like_wildcards(): void
    {
        $cancelledOrder = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCQ1-CANCEL-PAY-01',
            'customer_id'        => $this->customerA->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Đơn khách đặt cọc rồi hủy',
            'status'             => 'cancelled',
            'order_type'         => 'in_store',
            'total_price'        => 600000,
            'initial_price'      => 600000,
            'created_by_user_id' => $this->staffA->id,
        ]);

        // Khoản thanh toán gắn với đơn đã hủy (chưa cập nhật refund_amount) -> KHÔNG được cộng vào thực thu hợp lệ
        Payment::withoutGlobalScopes()->create([
            'payment_code'        => 'PAY-CANCEL-' . uniqid(),
            'repair_order_id'     => $cancelledOrder->id,
            'amount'              => 200000,
            'refund_amount'       => 0,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $this->staffA->id,
        ]);

        $tool = new RevenueSummaryTool();

        // 1. Kiểm tra parseDate() với checkdate()
        $this->assertNull($tool->parseDate('31/02/2026'));
        $this->assertNull($tool->parseDate('45/18'));

        // 2. Kiểm tra net_payment_collected khớp 100% với tổng net_collected trong breakdown (650.000 đ, không cộng 200.000 đ của đơn hủy)
        $result = $tool->execute([
            'period'   => 'today',
            'group_by' => 'branch',
        ], $this->recipientTenantAllBranches);

        $breakdownNetSum = array_sum(array_map(
            static fn (array $row): float => (float) ($row['net_payment_collected'] ?? 0),
            $result['breakdown']
        ));

        $this->assertSame(650000.0, $result['net_payment_collected']);
        $this->assertSame($breakdownNetSum, $result['net_payment_collected']);

        // 3. Kiểm tra escapeLike() khi lọc device_category = '%' (không khớp bừa mọi dòng thiết bị)
        $wildcardCategoryRes = $tool->execute([
            'period'          => 'today',
            'device_category' => '%',
        ], $this->recipientTenantAllBranches);

        $this->assertSame(0, $wildcardCategoryRes['total_new_orders']);
        $this->assertSame(0.0, $wildcardCategoryRes['estimated_order_revenue']);
        $this->assertSame(0.0, $wildcardCategoryRes['net_payment_collected']);
    }
}



