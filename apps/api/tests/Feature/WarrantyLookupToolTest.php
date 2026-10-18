<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\TelegramRecipient;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use App\Services\TelegramAi\TelegramAiToolRegistry;
use App\Services\TelegramAi\Tools\WarrantyLookupTool;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WarrantyLookupToolTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected Branch $branchA1;
    protected Branch $branchA2;
    protected Branch $branchB1;
    protected DeviceModel $deviceModel;
    protected User $staffA;
    protected Customer $customerA1;
    protected Customer $customerA2;
    protected Customer $customerB1;
    protected RepairOrder $orderA1;
    protected RepairOrder $orderA2;
    protected RepairOrder $orderB1;
    protected Warranty $warrantyA1Active;
    protected Warranty $warrantyA1Expired;
    protected Warranty $warrantyA2Revoked;
    protected Warranty $warrantyB1Secret;
    protected WarrantyClaim $claimA1;
    protected TelegramRecipient $recipientTenantAllBranches;
    protected TelegramRecipient $recipientBranchA1Only;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();

        Config::set('services.telegram.bot_token', 'test_bot_token_phase5');
        Config::set('services.telegram.bot_username', 'PodsCareNotifyBot');
        Config::set('services.telegram.webhook_secret', '');
        Config::set('services.gemini.api_key', 'test_gemini_api_key_phase5');
        Config::set('services.gemini.model', 'gemini-2.0-flash');
        Config::set('services.gemini.fallback_models', 'gemini-2.0-flash-lite,gemini-2.5-flash');
        Config::set('services.gemini.timeout', 15);

        $this->tenantA = Tenant::create([
            'name'   => 'PodsCare Sài Gòn (Tenant A)',
            'code'   => 'tenant-a-p5-' . uniqid(),
            'status' => 'active',
        ]);

        $this->tenantB = Tenant::create([
            'name'   => 'PodsCare Hà Nội (Tenant B)',
            'code'   => 'tenant-b-p5-' . uniqid(),
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
            'name'      => 'KTV Minh Tuấn',
            'email'     => 'ktv.tuan.p5.' . uniqid() . '@podscare.vn',
            'phone'     => '0911222333',
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

        $this->orderA1 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCQ117102602',
            'customer_id'        => $this->customerA1->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Thay pin 2 bên và xử lý rè loa chống ồn ANC',
            'status'             => 'completed',
            'order_type'         => 'cod',
            'total_price'        => 450000,
            'initial_price'      => 450000,
            'created_by_user_id' => $this->staffA->id,
            'technician_id'      => $this->staffA->id,
        ]);

        $this->orderA2 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA2->id,
            'order_code'         => 'PCQ317102699',
            'customer_id'        => $this->customerA2->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Sửa bo mạch hộp sạc AirPods Pro 2',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 550000,
            'initial_price'      => 550000,
            'created_by_user_id' => $this->staffA->id,
        ]);

        $this->orderB1 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantB->id,
            'branch_id'          => $this->branchB1->id,
            'order_code'         => 'PCHN17102688',
            'customer_id'        => $this->customerB1->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Đơn bảo hành riêng của Cửa hàng B',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 900000,
            'initial_price'      => 900000,
            'created_by_user_id' => $this->staffA->id,
        ]);

        // 1. Phiếu bảo hành đang còn hiệu lực (status = active, còn 60 ngày) của Tenant A - Chi nhánh Quận 1
        $this->warrantyA1Active = Warranty::withoutGlobalScopes()->create([
            'warranty_code'   => 'BH-PCQ117102602',
            'repair_order_id' => $this->orderA1->id,
            'customer_id'     => $this->customerA1->id,
            'device_model_id' => $this->deviceModel->id,
            'coverage_item'   => 'Bảo hành Pin 2 tai nghe & màng loa chống ồn ANC 90 ngày',
            'start_date'      => now()->subDays(30)->toDateString(),
            'duration_days'   => 90,
            'end_date'        => now()->addDays(60)->toDateString(),
            'status'          => 'active',
        ]);

        // Ca khiếu nại bảo hành gắn với phiếu BH-PCQ117102602
        $this->claimA1 = WarrantyClaim::create([
            'claim_code'          => 'CLM-202610-0088',
            'warranty_id'         => $this->warrantyA1Active->id,
            'issue_description'   => 'Tai phải hơi nhỏ tiếng sau 3 tuần sử dụng',
            'resolution_mode'     => 'store_check',
            'status'              => 'received',
            'received_by_user_id' => $this->staffA->id,
        ]);

        // 2. Phiếu bảo hành đã hết hạn (end_date quá khứ) của Tenant A - Chi nhánh Quận 1
        $this->warrantyA1Expired = Warranty::withoutGlobalScopes()->create([
            'warranty_code'   => 'BH-EXPIRED-001',
            'repair_order_id' => $this->orderA1->id,
            'customer_id'     => $this->customerA1->id,
            'device_model_id' => $this->deviceModel->id,
            'coverage_item'   => 'Bảo hành vệ sinh lưới loa 30 ngày',
            'start_date'      => now()->subDays(60)->toDateString(),
            'duration_days'   => 30,
            'end_date'        => now()->subDays(30)->toDateString(),
            'status'          => 'active',
        ]);

        // 3. Phiếu bảo hành bị thu hồi (status = revoked) của Tenant A - Chi nhánh Quận 3
        $this->warrantyA2Revoked = Warranty::withoutGlobalScopes()->create([
            'warranty_code'   => 'BH-PCQ317102699',
            'repair_order_id' => $this->orderA2->id,
            'customer_id'     => $this->customerA2->id,
            'device_model_id' => $this->deviceModel->id,
            'coverage_item'   => 'Bảo hành bo mạch hộp sạc 60 ngày',
            'start_date'      => now()->subDays(10)->toDateString(),
            'duration_days'   => 60,
            'end_date'        => now()->addDays(50)->toDateString(),
            'status'          => 'revoked',
            'revoked_at'      => now()->subDays(2),
            'revoked_reason'  => 'Hoàn tiền theo yêu cầu khách hàng',
        ]);

        // 4. Phiếu bảo hành riêng của Tenant B (không bao giờ được lộ sang Tenant A)
        $this->warrantyB1Secret = Warranty::withoutGlobalScopes()->create([
            'warranty_code'   => 'BH-PCHN17102688',
            'repair_order_id' => $this->orderB1->id,
            'customer_id'     => $this->customerB1->id,
            'device_model_id' => $this->deviceModel->id,
            'coverage_item'   => 'Bảo hành toàn diện AirPods Max Hà Nội',
            'start_date'      => now()->subDays(5)->toDateString(),
            'duration_days'   => 180,
            'end_date'        => now()->addDays(175)->toDateString(),
            'status'          => 'active',
        ]);

        $this->recipientTenantAllBranches = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => null,
            'label'             => 'Admin Toàn Cửa Hàng A',
            'phone'             => '0862389728',
            'target_role'       => 'admin',
            'telegram_chat_id'  => '8841956511',
            'connect_token'     => 'adm_p5_all_' . uniqid(),
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
            'telegram_chat_id'  => '8841956512',
            'connect_token'     => 'adm_p5_b1_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);
    }

    /**
     * 1. Tra cứu bảo hành theo warranty_code, order_code, customer_phone (có chuẩn hóa khoảng trắng/ký tự '#')
     *    trả về chính xác thông tin bảo hành, hạn bảo hành và danh sách claims.
     */
    public function test_warranty_lookup_tool_searches_by_warranty_code_order_code_and_phone_with_claims(): void
    {
        $tool = new WarrantyLookupTool();

        // Tra cứu theo warranty_code có dấu '#' và chữ thường
        $byWarrantyCode = $tool->execute([
            'warranty_code' => '  #bh-pcq117102602  ',
        ], $this->recipientTenantAllBranches);

        $this->assertSame('BH-PCQ117102602', $byWarrantyCode['filters_applied']['warranty_code']);
        $this->assertSame(1, $byWarrantyCode['total_matched']);
        $this->assertCount(1, $byWarrantyCode['warranties']);

        $warrantyItem = $byWarrantyCode['warranties'][0];
        $this->assertSame('BH-PCQ117102602', $warrantyItem['warranty_code']);
        $this->assertSame('active', $warrantyItem['status']);
        $this->assertSame('Đang còn hạn bảo hành (còn 60 ngày)', $warrantyItem['status_label']);
        $this->assertTrue($warrantyItem['is_valid_now']);
        $this->assertSame(60, $warrantyItem['days_remaining']);
        $this->assertSame('PCQ117102602', $warrantyItem['order_code']);
        $this->assertSame('Chi nhánh Quận 1', $warrantyItem['branch_name']);
        $this->assertSame('Anh Bảo Khách Tỉnh', $warrantyItem['customer_name']);
        $this->assertSame('0779550864', $warrantyItem['customer_phone']);
        $this->assertSame('Bảo hành Pin 2 tai nghe & màng loa chống ồn ANC 90 ngày', $warrantyItem['coverage_item']);
        $this->assertSame(90, $warrantyItem['duration_days']);
        $this->assertSame(1, $warrantyItem['claims_count']);
        $this->assertCount(1, $warrantyItem['claims']);
        $this->assertSame('CLM-202610-0088', $warrantyItem['claims'][0]['claim_code']);
        $this->assertSame('Tai phải hơi nhỏ tiếng sau 3 tuần sử dụng', $warrantyItem['claims'][0]['issue_description']);
        $this->assertSame('store_check', $warrantyItem['claims'][0]['resolution_mode']);
        $this->assertSame('Đang đợi xử lý bảo hành', $warrantyItem['claims'][0]['status_label']);

        // Tra cứu theo order_code và customer_phone có dấu cách/dấu chấm
        $byOrderAndPhone = $tool->execute([
            'order_code'     => '#pcq117102602',
            'customer_phone' => '0779 550.864',
        ], $this->recipientTenantAllBranches);

        $this->assertSame('PCQ117102602', $byOrderAndPhone['filters_applied']['order_code']);
        $this->assertSame('0779550864', $byOrderAndPhone['filters_applied']['customer_phone']);
        $this->assertSame(2, $byOrderAndPhone['total_matched']);
    }

    /**
     * 2. Lọc only_active = true chỉ trả về phiếu bảo hành còn hiệu lực,
     *    loại bỏ phiếu đã hết hạn (end_date quá khứ) hoặc bị thu hồi (revoked).
     */
    public function test_warranty_lookup_tool_filters_only_active_warranties_correctly(): void
    {
        $tool = new WarrantyLookupTool();

        $activeResult = $tool->execute([
            'only_active' => true,
        ], $this->recipientTenantAllBranches);

        $this->assertTrue($activeResult['filters_applied']['only_active']);
        $this->assertSame(1, $activeResult['total_matched']);
        $this->assertCount(1, $activeResult['warranties']);

        $activeWarranty = $activeResult['warranties'][0];
        $this->assertSame('BH-PCQ117102602', $activeWarranty['warranty_code']);
        $this->assertTrue($activeWarranty['is_valid_now']);

        $codes = array_column($activeResult['warranties'], 'warranty_code');
        $this->assertNotContains('BH-EXPIRED-001', $codes);
        $this->assertNotContains('BH-PCQ317102699', $codes);
    }

    /**
     * 3. Bảo mật cô lập tuyệt đối tenant_id và branch_id:
     *    - Admin Cửa hàng A không thể tra cứu phiếu bảo hành của Cửa hàng B (total_matched = 0).
     *    - Người nhận gắn riêng Chi nhánh Quận 1 không thể tra cứu phiếu bảo hành thuộc Chi nhánh Quận 3.
     */
    public function test_warranty_lookup_tool_strictly_isolates_tenant_and_branch(): void
    {
        $tool = new WarrantyLookupTool();

        // Admin Cửa hàng A cố tình tra cứu mã bảo hành của Cửa hàng B
        $crossTenantByCode = $tool->execute([
            'warranty_code' => 'BH-PCHN17102688',
        ], $this->recipientTenantAllBranches);

        $this->assertSame(0, $crossTenantByCode['total_matched']);
        $this->assertEmpty($crossTenantByCode['warranties']);

        // Admin Cửa hàng A cố tình tra cứu SĐT khách của Cửa hàng B
        $crossTenantByPhone = $tool->execute([
            'customer_phone' => '0933888999',
        ], $this->recipientTenantAllBranches);

        $this->assertSame(0, $crossTenantByPhone['total_matched']);
        $this->assertEmpty($crossTenantByPhone['warranties']);

        // Người nhận chỉ gắn với Chi nhánh Quận 1 (branchA1) cố tình tìm phiếu bảo hành của Chi nhánh Quận 3 (branchA2)
        $crossBranchResult = $tool->execute([
            'warranty_code' => 'BH-PCQ317102699',
        ], $this->recipientBranchA1Only);

        $this->assertSame(0, $crossBranchResult['total_matched']);
        $this->assertEmpty($crossBranchResult['warranties']);
        $this->assertSame('Chi nhánh Quận 1', $crossBranchResult['branch_name']);
        $this->assertSame('Chi nhánh Quận 1', $crossBranchResult['branch_scope']);
    }

    /**
     * 4. Luồng 2 bước End-to-End qua Webhook Telegram (POST /api/v1/webhooks/telegram):
     *    - Bước 1: Gemini bóc tách tham số gọi 'lookup_warranties' (chỉ gọi Gemini đúng 1 lần duy nhất).
     *    - Bước 2: WarrantyLookupTool truy vấn DB thật và tự format HTML tiếng Việt gửi thẳng về Telegram,
     *      hiển thị trạng thái bảo hành và khiếu nại hoàn toàn bằng tiếng Việt.
     */
    public function test_end_to_end_webhook_calls_warranty_lookup_tool_and_sends_clean_html_reply(): void
    {
        /** @var TelegramAiToolRegistry $registry */
        $registry = $this->app->make(TelegramAiToolRegistry::class);
        $this->assertNotNull($registry->get('lookup_warranties'));

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
                                            'name' => 'lookup_warranties',
                                            'args' => [
                                                'customer_phone' => '0779550864',
                                                'only_active'    => true,
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
            'update_id' => 95001,
            'message'   => [
                'message_id' => 501,
                'chat'       => ['id' => 8841956511, 'type' => 'private'],
                'text'       => 'Kiểm tra bảo hành của khách 0779550864',
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', true);

        // Xác nhận chỉ gọi Gemini đúng 1 lần duy nhất ở Bước 1 (cắt bỏ Bước 3)
        $this->assertSame(1, $geminiCallCount);

        // Kiểm tra tin nhắn gửi về Telegram do WarrantyLookupTool::formatHtml tạo ra
        $sentTelegramText = null;
        Http::assertSent(function ($request) use (&$sentTelegramText) {
            if (str_contains($request->url(), '/sendMessage') && (string) $request['chat_id'] === '8841956511') {
                $sentTelegramText = (string) $request['text'];
                return true;
            }
            return false;
        });

        $this->assertNotNull($sentTelegramText);
        $this->assertStringContainsString('<b>Kết quả tra cứu bảo hành</b>', $sentTelegramText);
        $this->assertStringContainsString('<code>BH-PCQ117102602</code>', $sentTelegramText);
        $this->assertStringContainsString('<code>CLM-202610-0088</code>', $sentTelegramText);
        $this->assertStringContainsString('<b>Đang còn hạn bảo hành (còn 60 ngày)</b>', $sentTelegramText);
        $this->assertStringContainsString('<b>Đang đợi xử lý bảo hành</b>', $sentTelegramText);
        $this->assertStringNotContainsString('{', $sentTelegramText);
        $this->assertStringNotContainsString('}', $sentTelegramText);
    }
}

