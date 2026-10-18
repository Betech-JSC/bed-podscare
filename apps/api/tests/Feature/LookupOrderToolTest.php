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
        Config::set('services.gemini.api_key', 'test_gemini_api_key_phase2');
        Config::set('services.gemini.model', 'gemini-2.0-flash');
        Config::set('services.gemini.fallback_models', 'gemini-2.0-flash-lite,gemini-2.5-flash');
        Config::set('services.gemini.timeout', 15);

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
                                            'name' => 'lookup_repair_orders',
                                            'args' => [
                                                'order_code' => '#pcq117102602',
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

        // Xác nhận chỉ gọi Gemini đúng 1 lần duy nhất ở Bước 1 (cắt bỏ Bước 3)
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
}

