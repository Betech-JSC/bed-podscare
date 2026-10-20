<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\TelegramRecipient;
use App\Models\Tenant;
use App\Models\User;
use App\Services\TelegramAi\TelegramAiToolRegistry;
use App\Services\TelegramAi\Tools\LookupOrderTool;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class LookupOrderToolTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected Branch $branchA1;
    protected Branch $branchA2;
    protected Branch $branchB1;
    protected DeviceModel $deviceModel;
    protected User $technicianA;
    protected User $receptionistA;
    protected Customer $customerA1;
    protected Customer $customerA2;
    protected Customer $customerB1;
    protected RepairOrder $orderA1Cod;
    protected RepairOrder $orderA2InStore;
    protected RepairOrder $orderB1;
    protected TelegramRecipient $recipientTenantAllBranches;
    protected TelegramRecipient $recipientBranchA1Only;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();

        Config::set('services.telegram.bot_token', 'test_bot_token_phase2');
        Config::set('services.telegram.bot_username', 'PodsCareNotifyBot');
        Config::set('services.telegram.webhook_secret', '');
        Config::set('services.gemini.base_url', 'http://127.0.0.1:20128/v1');
        Config::set('services.gemini.api_key', '9router-local');
        Config::set('services.gemini.model', 'podscare-ai');
        Config::set('services.gemini.fallback_models', '');
        Config::set('services.gemini.timeout', 20);

        $this->tenantA = Tenant::create([
            'name'   => 'PodsCare Sài Gòn (Tenant A)',
            'code'   => 'tenant-a-p2-' . uniqid(),
            'status' => 'active',
        ]);

        $this->tenantB = Tenant::create([
            'name'   => 'PodsCare Hà Nội (Tenant B)',
            'code'   => 'tenant-b-p2-' . uniqid(),
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

        $this->technicianA = User::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'KTV Minh Tuấn',
            'email'     => 'ktv.tuan.' . uniqid() . '@podscare.vn',
            'phone'     => '0911222333',
            'password'  => 'password123',
            'is_active' => true,
        ]);

        $this->receptionistA = User::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'Lễ tân Thu Hà',
            'email'     => 'letan.ha.' . uniqid() . '@podscare.vn',
            'phone'     => '0911444555',
            'password'  => 'password123',
            'is_active' => true,
        ]);

        $this->customerA1 = Customer::withoutGlobalScopes()->updateOrCreate(
            ['phone' => '0779550864'],
            [
                'tenant_id' => $this->tenantA->id,
                'name'      => 'Anh Bảo Khách Tỉnh',
                'address'   => 'TP. Đà Nẵng',
            ]
        );

        $this->customerA2 = Customer::withoutGlobalScopes()->updateOrCreate(
            ['phone' => '0988777666'],
            [
                'tenant_id' => $this->tenantA->id,
                'name'      => 'Chị Lan Quận 3',
                'address'   => 'Quận 3, TP.HCM',
            ]
        );

        $this->customerB1 = Customer::withoutGlobalScopes()->updateOrCreate(
            ['phone' => '0933888999'],
            [
                'tenant_id' => $this->tenantB->id,
                'name'      => 'Anh Hùng Hà Nội',
                'address'   => 'Cầu Giấy, Hà Nội',
            ]
        );

        $this->orderA1Cod = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCQ117102602',
            'intake_batch_code'  => 'BATCH-Q1-01',
            'customer_id'        => $this->customerA1->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Tai trái rè khi bật chống ồn ANC, thay pin 2 bên',
            'status'             => 'repairing',
            'order_type'         => 'cod',
            'shipping_address'   => 'Số 10 Nguyễn Văn Linh, Hải Châu, Đà Nẵng',
            'total_price'        => 450000,
            'initial_price'      => 450000,
            'created_by_user_id' => $this->receptionistA->id,
            'technician_id'      => $this->technicianA->id,
        ]);

        $this->orderA2InStore = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA2->id,
            'order_code'         => 'PCQ317102699',
            'customer_id'        => $this->customerA2->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Vệ sinh loa và kiểm tra hộp sạc hao nguồn',
            'status'             => 'received',
            'order_type'         => 'in_store',
            'total_price'        => 250000,
            'initial_price'      => 250000,
            'created_by_user_id' => $this->receptionistA->id,
        ]);

        $this->orderB1 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantB->id,
            'branch_id'          => $this->branchB1->id,
            'order_code'         => 'PCHN17102688',
            'customer_id'        => $this->customerB1->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Đơn của cửa hàng B tuyệt đối không được rò rỉ sang cửa hàng A',
            'status'             => 'received',
            'order_type'         => 'in_store',
            'total_price'        => 900000,
            'initial_price'      => 900000,
            'created_by_user_id' => $this->receptionistA->id,
        ]);

        $this->recipientTenantAllBranches = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => null,
            'label'             => 'Admin Toàn Cửa Hàng A',
            'phone'             => '0862389728',
            'target_role'       => 'admin',
            'telegram_chat_id'  => '8841956211',
            'connect_token'     => 'adm_p2_all_' . uniqid(),
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
            'telegram_chat_id'  => '8841956212',
            'connect_token'     => 'adm_p2_b1_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);
    }

    /**
     * 1. Chuẩn hóa tham số & tìm kiếm theo order_code (truyền chữ thường kèm dấu '#' như '#pcq117102602'
     *    vẫn tìm thấy chính xác đơn PCQ117102602 kèm đầy đủ thông tin chi tiết).
     */
    public function test_lookup_order_tool_sanitizes_order_code_and_returns_exact_order_details(): void
    {
        $tool = new LookupOrderTool();

        $result = $tool->execute([
            'order_code' => '  #pcq117102602  ',
        ], $this->recipientTenantAllBranches);

        $this->assertSame('PCQ117102602', $result['filters_applied']['order_code']);
        $this->assertSame(1, $result['total_matched']);
        $this->assertCount(1, $result['orders']);

        $orderData = $result['orders'][0];
        $this->assertSame('PCQ117102602', $orderData['order_code']);
        $this->assertSame('repairing', $orderData['status']);
        $this->assertSame('Đang trong quá trình sửa chữa', $orderData['status_label']);
        $this->assertSame('cod', $orderData['order_type']);
        $this->assertSame('Đơn COD (Khách tỉnh)', $orderData['order_type_label']);
        $this->assertSame('Chi nhánh Quận 1', $orderData['branch_name']);
        $this->assertSame('Anh Bảo Khách Tỉnh', $orderData['customer_name']);
        $this->assertSame('0779550864', $orderData['customer_phone']);
        $this->assertSame('450.000 đ', $orderData['formatted_price']);
        $this->assertSame('KTV Minh Tuấn', $orderData['technician_name']);
        $this->assertSame('Lễ tân Thu Hà', $orderData['received_by_name']);
        $this->assertSame('Số 10 Nguyễn Văn Linh, Hải Châu, Đà Nẵng', $orderData['shipping_address']);
    }

    /**
     * 2. Tìm kiếm theo customer_phone có khoảng trắng/dấu chấm ('0779 550.864')
     *    và lọc theo order_type ('cod', 'in_store', 'warranty') cùng status.
     */
    public function test_lookup_order_tool_filters_by_normalized_phone_and_order_type(): void
    {
        $tool = new LookupOrderTool();

        // Tìm theo SĐT có dấu cách và dấu chấm
        $byPhone = $tool->execute([
            'customer_phone' => '0779 550.864',
        ], $this->recipientTenantAllBranches);

        $this->assertSame('0779550864', $byPhone['filters_applied']['customer_phone']);
        // Chỉ khớp đơn của Tenant A (không lấy đơn của Tenant B dù trùng SĐT)
        $this->assertSame(1, $byPhone['total_matched']);
        $this->assertSame('PCQ117102602', $byPhone['orders'][0]['order_code']);

        // Lọc theo order_type = cod
        $byCod = $tool->execute([
            'order_type' => 'COD',
        ], $this->recipientTenantAllBranches);

        $this->assertSame(1, $byCod['total_matched']);
        $this->assertSame('PCQ117102602', $byCod['orders'][0]['order_code']);

        // Lọc theo order_type = in_store
        $byInStore = $tool->execute([
            'order_type' => 'in_store',
        ], $this->recipientTenantAllBranches);

        $this->assertSame(1, $byInStore['total_matched']);
        $this->assertSame('PCQ317102699', $byInStore['orders'][0]['order_code']);
        $this->assertSame('Khách tại cửa hàng', $byInStore['orders'][0]['order_type_label']);
    }

    /**
     * 3. Bảo mật cô lập tenant_id và branch_id:
     *    - Admin của Cửa hàng A không thể tra cứu đơn của Cửa hàng B (total_matched = 0).
     *    - Người nhận gắn riêng Chi nhánh 1 không thấy đơn của Chi nhánh 2.
     */
    public function test_lookup_order_tool_strictly_isolates_tenant_and_branch(): void
    {
        $tool = new LookupOrderTool();

        // Cố tình truyền mã đơn của Cửa hàng B khi đang dùng tài khoản Admin Cửa hàng A
        $crossTenantResult = $tool->execute([
            'order_code' => 'PCHN17102688',
        ], $this->recipientTenantAllBranches);

        $this->assertSame(0, $crossTenantResult['total_matched']);
        $this->assertEmpty($crossTenantResult['orders']);

        // Người nhận chỉ gắn với Chi nhánh Quận 1 (branchA1) cố tình tìm đơn của Chi nhánh Quận 3 (branchA2)
        $crossBranchResult = $tool->execute([
            'order_code' => 'PCQ317102699',
        ], $this->recipientBranchA1Only);

        $this->assertSame(0, $crossBranchResult['total_matched']);
        $this->assertEmpty($crossBranchResult['orders']);
        $this->assertSame('Chi nhánh Quận 1', $crossBranchResult['branch_name']);
        $this->assertSame('Chi nhánh Quận 1', $crossBranchResult['branch_scope']);

        // Khi liệt kê toàn bộ đơn với người nhận Chi nhánh Quận 1 -> chỉ trả về 1 đơn của Quận 1
        $branchA1List = $tool->execute([], $this->recipientBranchA1Only);
        $this->assertSame(1, $branchA1List['total_matched']);
        $this->assertSame('PCQ117102602', $branchA1List['orders'][0]['order_code']);
    }

    /**
     * 4. Luồng 2 bước End-to-End qua Webhook Telegram (POST /api/v1/webhooks/telegram):
     *    - Bước 1: Gemini bóc tách tham số gọi 'lookup_repair_orders' (chỉ gọi Gemini đúng 1 lần duy nhất).
     *    - Bước 2: LookupOrderTool truy vấn DB thật và tự format HTML tiếng Việt gửi thẳng về Telegram,
     *      hiển thị status = 'waiting_tech' thành '<b>Đang đợi kỹ thuật viên tiếp nhận</b>', hoàn toàn không có chữ 'waiting_tech'.
     */
    public function test_end_to_end_webhook_calls_lookup_order_tool_in_two_steps_and_formats_vietnamese_status_label(): void
    {
        $this->orderA1Cod->update(['status' => 'waiting_tech']);

        /** @var TelegramAiToolRegistry $registry */
        $registry = $this->app->make(TelegramAiToolRegistry::class);
        $this->assertNotNull($registry->get('lookup_repair_orders'));

        $geminiCallCount = 0;

        Http::fake(function ($request) use (&$geminiCallCount) {
            if (str_contains($request->url(), '127.0.0.1:20128/v1/chat/completions')) {
                $geminiCallCount++;
                return Http::response([
                    'id'      => 'chatcmpl-p2-001',
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
                                        'id'       => 'call_lookup_order_01',
                                        'type'     => 'function',
                                        'function' => [
                                            'name'      => 'lookup_repair_orders',
                                            'arguments' => json_encode(['order_code' => '#pcq117102602']),
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
            'update_id' => 92001,
            'message'   => [
                'message_id' => 201,
                'chat'       => ['id' => 8841956211, 'type' => 'private'],
                'text'       => 'Kiểm tra giúp anh đơn #pcq117102602 đang tới bước nào rồi?',
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', true);

        // Xác nhận chỉ gọi 9Router đúng 1 lần duy nhất cho câu tra cứu mã đơn đơn giản
        $this->assertSame(1, $geminiCallCount);

        // Kiểm tra tin nhắn gửi về Telegram do LookupOrderTool::formatHtml tạo ra có HTML tiếng Việt sạch và hiển thị nhãn trạng thái tiếng Việt
        $sentTelegramText = null;
        Http::assertSent(function ($request) use (&$sentTelegramText) {
            if (str_contains($request->url(), '/sendMessage') && (string) $request['chat_id'] === '8841956211') {
                $sentTelegramText = (string) $request['text'];
                return true;
            }
            return false;
        });

        $this->assertNotNull($sentTelegramText);
        $this->assertStringContainsString('<b>Kết quả tra cứu đơn sửa chữa</b>', $sentTelegramText);
        $this->assertStringContainsString('<code>PCQ117102602</code>', $sentTelegramText);
        $this->assertStringContainsString('<b>Anh Bảo Khách Tỉnh</b>', $sentTelegramText);
        $this->assertStringContainsString('<b>Đang đợi kỹ thuật viên tiếp nhận</b>', $sentTelegramText);
        $this->assertStringNotContainsString('waiting_tech', $sentTelegramText);
        $this->assertStringContainsString('<b>450.000 đ</b>', $sentTelegramText);
    }

    /**
     * 5. Tra cứu đa chiều theo câu hỏi thực tế "Ai thay vỏ thép đen ngày 18/10?":
     *    - Tách từ khóa tiếng Việt thông minh (bỏ hư từ "ai", "ngày", giữ từ khóa cốt lõi "vỏ", "thép", "đen")
     *    - Khớp xuyên qua quotes.items.description, parts_needed, repair_note
     *    - Lọc chính xác theo date_from/date_to (cả dạng DD/MM và DD/MM/YYYY), device_category ("Apple Watch"), technician_name ("Minh")
     *    - Hiển thị đầy đủ Khách hàng, Hạng mục sửa chữa/báo giá, Linh kiện, Kỹ thuật viên phụ trách và Người tiếp nhận trong formatHtml().
     */
    public function test_lookup_order_tool_searches_by_vietnamese_keyword_across_quotes_parts_and_filters_by_date_device_and_technician(): void
    {
        $watchModel = DeviceModel::create([
            'name'         => 'Apple Watch Series 8 45mm',
            'category'     => 'Apple Watch',
            'model_code'   => 'A2771-' . rand(10, 99),
            'release_year' => 2022,
            'manufacturer' => 'Apple',
            'has_anc'      => false,
            'is_active'    => true,
        ]);

        $targetDate = \Carbon\Carbon::create((int) now()->year, 10, 18, 15, 20, 0);

        $watchOrderA = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCQ118102688',
            'customer_id'        => $this->customerA1->id,
            'device_model_id'    => $watchModel->id,
            'issue_description'  => 'Trầy xước khung viền, khách yêu cầu nâng cấp ngoại hình',
            'repair_note'        => 'Đã lắp bộ khung viền mới hoàn chỉnh',
            'parts_needed'       => 'Bộ vỏ thép đen 45mm zin',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 1850000,
            'initial_price'      => 1850000,
            'created_by_user_id' => $this->receptionistA->id,
            'technician_id'      => $this->technicianA->id,
        ]);
        $watchOrderA->timestamps = false;
        $watchOrderA->created_at = $targetDate;
        $watchOrderA->updated_at = $targetDate;
        $watchOrderA->save();

        $quoteA = \App\Models\RepairQuote::withoutGlobalScopes()->create([
            'tenant_id'           => $this->tenantA->id,
            'repair_order_id'     => $watchOrderA->id,
            'quote_number'        => 'BG-PCQ118102688',
            'total_amount'        => 1850000,
            'warranty_terms_days' => 90,
            'note'                => 'Khách đồng ý thay vỏ thép đen',
            'status'              => 'approved',
            'sent_by_user_id'     => $this->receptionistA->id,
        ]);

        \App\Models\QuoteItem::create([
            'quote_id'    => $quoteA->id,
            'description' => 'Thay vỏ thép đen Apple Watch Series 8 45mm',
            'quantity'    => 1,
            'unit_price'  => 1850000,
            'amount'      => 1850000,
        ]);

        // Đơn cùng ngày 18/10 nhưng thuộc Tenant B -> tuyệt đối không được lọt vào kết quả của Tenant A
        $watchOrderB = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantB->id,
            'branch_id'          => $this->branchB1->id,
            'order_code'         => 'PCHN18102699',
            'customer_id'        => $this->customerB1->id,
            'device_model_id'    => $watchModel->id,
            'issue_description'  => 'Thay vỏ thép đen tại Hà Nội',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 1900000,
            'initial_price'      => 1900000,
            'created_by_user_id' => $this->receptionistA->id,
        ]);
        $watchOrderB->timestamps = false;
        $watchOrderB->created_at = $targetDate;
        $watchOrderB->updated_at = $targetDate;
        $watchOrderB->save();

        $tool = new LookupOrderTool();

        // Kịch bản A: Truyền nguyên câu hỏi "Ai thay vỏ thép đen" kèm ngày ngắn "18/10"
        $result = $tool->execute([
            'keyword'   => 'Ai thay vỏ thép đen',
            'date_from' => '18/10',
            'date_to'   => '18/10',
        ], $this->recipientTenantAllBranches);

        $this->assertSame(1, $result['total_matched']);
        $this->assertCount(1, $result['orders']);

        $matchedOrder = $result['orders'][0];
        $this->assertSame('PCQ118102688', $matchedOrder['order_code']);
        $this->assertSame('Apple Watch', $matchedOrder['device_category']);
        $this->assertSame('KTV Minh Tuấn', $matchedOrder['technician_name']);
        $this->assertSame('Lễ tân Thu Hà', $matchedOrder['received_by_name']);
        $this->assertStringContainsString('Thay vỏ thép đen Apple Watch Series 8 45mm (1.850.000 đ)', $matchedOrder['quote_items_summary']);
        $this->assertStringContainsString('Bộ vỏ thép đen 45mm zin', $matchedOrder['parts_summary']);

        $html = $tool->formatHtml($result);
        $this->assertStringContainsString('<code>PCQ118102688</code>', $html);
        $this->assertStringContainsString('<b>Anh Bảo Khách Tỉnh</b>', $html);
        $this->assertStringContainsString('Hạng mục sửa chữa/báo giá: <b>Thay vỏ thép đen Apple Watch Series 8 45mm (1.850.000 đ)</b>', $html);
        $this->assertStringContainsString('Linh kiện: Bộ vỏ thép đen 45mm zin', $html);
        $this->assertStringContainsString('Kỹ thuật viên: <b>KTV Minh Tuấn</b>', $html);
        $this->assertStringContainsString('Người tiếp nhận: Lễ tân Thu Hà', $html);
        $this->assertStringNotContainsString('PCHN18102699', $html);

        // Kịch bản B: Lọc theo device_category = 'Apple Watch' và technician_name = 'Minh'
        $byDeviceAndTech = $tool->execute([
            'device_category' => 'Apple Watch',
            'technician_name' => 'Minh',
        ], $this->recipientTenantAllBranches);

        $this->assertSame(1, $byDeviceAndTech['total_matched']);
        $this->assertSame('PCQ118102688', $byDeviceAndTech['orders'][0]['order_code']);
    }

    /**
     * 6. Mở rộng bộ lọc khoảng ngày (created_at HOẶC repair_completed_at HOẶC handed_over_at)
     *    và escape ký tự wildcard SQL (%, _, \) trong keyword / order_code.
     */
    public function test_lookup_order_tool_matches_orders_by_repair_completed_at_or_handed_over_at_and_escapes_sql_wildcards(): void
    {
        $year = (int) now()->year;
        $date16 = \Carbon\Carbon::create($year, 10, 16, 9, 0, 0);
        $date17 = \Carbon\Carbon::create($year, 10, 17, 10, 30, 0);
        $date18 = \Carbon\Carbon::create($year, 10, 18, 15, 45, 0);

        // Đơn 1: Tiếp nhận ngày 17/10 nhưng hoàn thành sửa chữa (repair_completed_at) vào ngày 18/10
        $orderRepairedOn18 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'           => $this->tenantA->id,
            'branch_id'           => $this->branchA1->id,
            'order_code'          => 'PCQ1-REP-1810',
            'customer_id'         => $this->customerA1->id,
            'device_model_id'     => $this->deviceModel->id,
            'issue_description'   => 'Thay pin mới đạt 100% dung lượng chuẩn',
            'status'              => 'ready_for_pickup',
            'order_type'          => 'in_store',
            'total_price'         => 500000,
            'initial_price'       => 500000,
            'created_by_user_id'  => $this->receptionistA->id,
            'technician_id'       => $this->technicianA->id,
            'repair_completed_at' => $date18,
        ]);
        $orderRepairedOn18->timestamps = false;
        $orderRepairedOn18->created_at = $date17;
        $orderRepairedOn18->updated_at = $date18;
        $orderRepairedOn18->save();

        // Đơn 2: Tiếp nhận ngày 16/10, sửa xong ngày 17/10, nhưng bàn giao (handed_over_at) vào ngày 18/10
        $orderHandedOverOn18 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'           => $this->tenantA->id,
            'branch_id'           => $this->branchA1->id,
            'order_code'          => 'PCQ1-HAND-1810',
            'customer_id'         => $this->customerA2->id,
            'device_model_id'     => $this->deviceModel->id,
            'issue_description'   => 'Xử lý mã lỗi ERR_01 trên hộp sạc',
            'status'              => 'handed_over',
            'order_type'          => 'in_store',
            'total_price'         => 350000,
            'initial_price'       => 350000,
            'created_by_user_id'  => $this->receptionistA->id,
            'technician_id'       => $this->technicianA->id,
            'repair_completed_at' => $date17,
            'handed_over_at'      => $date18,
        ]);
        $orderHandedOverOn18->timestamps = false;
        $orderHandedOverOn18->created_at = $date16;
        $orderHandedOverOn18->updated_at = $date18;
        $orderHandedOverOn18->save();

        // Đơn 3 (đơn nhiễu tạo ngày 18/10 để kiểm tra wildcard '%' và '_' không khớp nhầm '100mA' hay 'ERRX01')
        $orderDistractorOn18 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCQ1-DIST-1810',
            'customer_id'        => $this->customerA1->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Thay pin mới đạt 100mA và xử lý mã lỗi ERRX01',
            'status'             => 'received',
            'order_type'         => 'in_store',
            'total_price'        => 300000,
            'initial_price'      => 300000,
            'created_by_user_id' => $this->receptionistA->id,
        ]);
        $orderDistractorOn18->timestamps = false;
        $orderDistractorOn18->created_at = $date18;
        $orderDistractorOn18->updated_at = $date18;
        $orderDistractorOn18->save();

        $tool = new LookupOrderTool();

        // 1. Tra cứu ngày 18/10 -> phải tìm thấy cả đơn sửa xong ngày 18/10 (tạo 17/10) và đơn bàn giao ngày 18/10 (tạo 16/10)
        $byDate18 = $tool->execute([
            'date_from' => '18/10',
            'date_to'   => '18/10',
            'limit'     => 10,
        ], $this->recipientTenantAllBranches);

        $matchedCodes = array_column($byDate18['orders'], 'order_code');
        $this->assertContains('PCQ1-REP-1810', $matchedCodes);
        $this->assertContains('PCQ1-HAND-1810', $matchedCodes);
        $this->assertContains('PCQ1-DIST-1810', $matchedCodes);

        // 2. Kiểm tra escape ký tự '%' trong keyword: '100%' chỉ khớp đơn có chuỗi literal '100%', KHÔNG khớp '100mA'
        $byPercentKeyword = $tool->execute([
            'keyword'   => '100%',
            'date_from' => '18/10',
            'date_to'   => '18/10',
        ], $this->recipientTenantAllBranches);

        $this->assertSame(1, $byPercentKeyword['total_matched']);
        $this->assertSame('PCQ1-REP-1810', $byPercentKeyword['orders'][0]['order_code']);

        // 3. Kiểm tra escape ký tự '_' trong keyword: 'ERR_01' chỉ khớp đơn có chuỗi literal 'ERR_01', KHÔNG khớp 'ERRX01'
        $byUnderscoreKeyword = $tool->execute([
            'keyword'   => 'ERR_01',
            'date_from' => '18/10',
            'date_to'   => '18/10',
        ], $this->recipientTenantAllBranches);

        $this->assertSame(1, $byUnderscoreKeyword['total_matched']);
        $this->assertSame('PCQ1-HAND-1810', $byUnderscoreKeyword['orders'][0]['order_code']);

        // 4. Truyền duy nhất ký tự '%' làm keyword không được trả về toàn bộ đơn hàng trong DB
        $onlyWildcard = $tool->execute([
            'keyword' => '%',
        ], $this->recipientTenantAllBranches);

        $this->assertSame(1, $onlyWildcard['total_matched']);
        $this->assertSame('PCQ1-REP-1810', $onlyWildcard['orders'][0]['order_code']);
    }

    /**
     * 7. Giai đoạn 3 (Task 3.1):
     *    - Không bắt nhầm tên dòng máy có dấu '/' như "AirPods 1/2", "Gen 1/2", "Series 1/2/3" thành ngày 01/02.
     *    - Vẫn tách đúng ngày hợp lệ khi có tiền tố thời gian ("ngày 18/10") hoặc ngày đầy đủ ("18/10/2026").
     *    - Kiểm tra checkdate() trong parseDate() trả về null với ngày không tồn tại (31/02/2026, 45/18).
     */
    public function test_phase3_preserves_device_generation_slashes_like_airpods_1_2_and_validates_checkdate_in_parse_date(): void
    {
        $airpods12Model = DeviceModel::create([
            'name'         => 'AirPods 1/2 (Sạc có dây)',
            'category'     => 'AirPods',
            'model_code'   => 'A1602-A2031-' . rand(100, 999),
            'release_year' => 2019,
            'manufacturer' => 'Apple',
            'has_anc'      => false,
            'is_active'    => true,
        ]);

        $orderAirpods12Today = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCQ1-AP12-TODAY',
            'customer_id'        => $this->customerA1->id,
            'device_model_id'    => $airpods12Model->id,
            'issue_description'  => 'Thay pin AirPods 1/2 cả 2 tai nghe',
            'status'             => 'repairing',
            'order_type'         => 'in_store',
            'total_price'        => 350000,
            'initial_price'      => 350000,
            'created_by_user_id' => $this->receptionistA->id,
            'technician_id'      => $this->technicianA->id,
        ]);

        $tool = new LookupOrderTool();
        /** @var \App\Services\TelegramAi\TelegramAiAssistantService $assistant */
        $assistant = $this->app->make(\App\Services\TelegramAi\TelegramAiAssistantService::class);

        // 1. Kiểm tra parseDate() với checkdate()
        $this->assertNull($tool->parseDate('31/02/2026'));
        $this->assertNull($tool->parseDate('2026-02-30'));
        $this->assertNull($tool->parseDate('45/18'));
        $this->assertSame('2026-02-28', $tool->parseDate('28/02/2026')?->format('Y-m-d'));

        // 2. Kiểm tra extractSearchTokens và extractKeywordAndDateHints giữ nguyên '1/2' của 'AirPods 1/2'
        $tokens = $tool->extractSearchTokens('Thay pin AirPods 1/2');
        $this->assertContains('airpods', $tokens);
        $this->assertContains('1/2', $tokens);

        $hintsModel = $assistant->extractKeywordAndDateHints('Thay pin AirPods 1/2');
        $this->assertNull($hintsModel['date_from']);
        $this->assertNull($hintsModel['date_to']);
        $this->assertStringContainsString('1/2', $hintsModel['keyword']);

        // 3. Tra cứu 'Thay pin AirPods 1/2' không bị gán nhầm date_from = 01/02 và tìm thấy đơn tạo hôm nay
        $resAirpods12 = $tool->execute([
            'keyword' => 'Thay pin AirPods 1/2',
        ], $this->recipientTenantAllBranches);

        $this->assertNull($resAirpods12['filters_applied']['date_from']);
        $this->assertNull($resAirpods12['filters_applied']['date_to']);
        $this->assertSame(1, $resAirpods12['total_matched']);
        $this->assertSame($orderAirpods12Today->order_code, $resAirpods12['orders'][0]['order_code']);

        // 4. Khi có từ chỉ thời gian "ngày 18/10", vẫn tự động bóc tách chính xác ngày 18/10
        $hintsDate = $assistant->extractKeywordAndDateHints('Thay vỏ thép đen ngày 18/10');
        $expectedDate = sprintf('%04d-10-18', (int) now()->year);
        $this->assertSame($expectedDate, $hintsDate['date_from']);
        $this->assertSame($expectedDate, $hintsDate['date_to']);
        $this->assertStringNotContainsString('18/10', $hintsDate['keyword']);
    }
}



