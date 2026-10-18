<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\Part;
use App\Models\TelegramRecipient;
use App\Models\Tenant;
use App\Services\TelegramAi\TelegramAiToolRegistry;
use App\Services\TelegramAi\Tools\InventoryCheckTool;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class InventoryCheckToolTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected Branch $branchA1;
    protected Branch $branchA2;
    protected Branch $branchB1;
    protected Part $partAirPods2Battery;
    protected Part $partAirPodsProSpeakerLowStock;
    protected Part $partAirPods3HingeOutStock;
    protected Part $partTenantBSecret;
    protected TelegramRecipient $recipientTenantAllBranches;
    protected TelegramRecipient $recipientBranchA1Only;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();

        Config::set('services.telegram.bot_token', 'test_bot_token_phase4');
        Config::set('services.telegram.bot_username', 'PodsCareNotifyBot');
        Config::set('services.telegram.webhook_secret', '');
        Config::set('services.gemini.api_key', 'test_gemini_api_key_phase4');
        Config::set('services.gemini.model', 'gemini-2.0-flash');
        Config::set('services.gemini.fallback_models', 'gemini-2.0-flash-lite,gemini-2.5-flash');
        Config::set('services.gemini.timeout', 15);

        $this->tenantA = Tenant::create([
            'name'   => 'PodsCare Sài Gòn (Tenant A)',
            'code'   => 'tenant-a-p4-' . uniqid(),
            'status' => 'active',
        ]);

        $this->tenantB = Tenant::create([
            'name'   => 'PodsCare Hà Nội (Tenant B)',
            'code'   => 'tenant-b-p4-' . uniqid(),
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

        // 1. Linh kiện đủ hàng của Tenant A: Pin AirPods 2
        $this->partAirPods2Battery = Part::withoutGlobalScopes()->create([
            'tenant_id'         => $this->tenantA->id,
            'sku'               => 'PIN-AP2-ZIN',
            'name'              => 'Pin tai nghe AirPods 2 dung lượng chuẩn',
            'category'          => 'Pin',
            'compatible_models' => 'AirPods 1, AirPods 2 (A1602, A2031, A2032)',
            'storage_location'  => 'Tủ A - Ngăn 02',
            'stock_quantity'    => 28,
            'min_stock_alert'   => 10,
            'cost_price'        => 65000,
            'retail_price'      => 200000,
            'unit'              => 'viên',
            'is_active'         => true,
        ]);

        BranchPart::create([
            'branch_id'       => $this->branchA1->id,
            'part_id'         => $this->partAirPods2Battery->id,
            'stock_quantity'  => 18,
            'min_stock_alert' => 5,
        ]);

        BranchPart::create([
            'branch_id'       => $this->branchA2->id,
            'part_id'         => $this->partAirPods2Battery->id,
            'stock_quantity'  => 10,
            'min_stock_alert' => 5,
        ]);

        // 2. Linh kiện sắp hết hàng (stock_quantity = 3 <= min_stock_alert = 5) của Tenant A
        $this->partAirPodsProSpeakerLowStock = Part::withoutGlobalScopes()->create([
            'tenant_id'         => $this->tenantA->id,
            'sku'               => 'LOA-APP2-ANC',
            'name'              => 'Cụm màng loa AirPods Pro 2 chống ồn',
            'category'          => 'Màng loa',
            'compatible_models' => 'AirPods Pro 2 (A2931, A3048)',
            'storage_location'  => 'Tủ B - Khay 04',
            'stock_quantity'    => 3,
            'min_stock_alert'   => 5,
            'cost_price'        => 120000,
            'retail_price'      => 350000,
            'unit'              => 'cụm',
            'is_active'         => true,
        ]);

        BranchPart::create([
            'branch_id'       => $this->branchA1->id,
            'part_id'         => $this->partAirPodsProSpeakerLowStock->id,
            'stock_quantity'  => 2,
            'min_stock_alert' => 3,
        ]);

        // 3. Linh kiện đã hết hàng (stock_quantity = 0 <= min_stock_alert = 4) của Tenant A
        $this->partAirPods3HingeOutStock = Part::withoutGlobalScopes()->create([
            'tenant_id'         => $this->tenantA->id,
            'sku'               => 'BANLE-AP3-01',
            'name'              => 'Bản lề hộp sạc AirPods 3 thép CNC',
            'category'          => 'Vỏ & Bản lề',
            'compatible_models' => 'AirPods 3 (A2566)',
            'storage_location'  => 'Tủ C - Hộp 01',
            'stock_quantity'    => 0,
            'min_stock_alert'   => 4,
            'cost_price'        => 90000,
            'retail_price'      => 280000,
            'unit'              => 'bộ',
            'is_active'         => true,
        ]);

        // 4. Linh kiện độc quyền của Tenant B (không bao giờ được lộ sang Tenant A)
        $this->partTenantBSecret = Part::withoutGlobalScopes()->create([
            'tenant_id'         => $this->tenantB->id,
            'sku'               => 'MAIN-MAX-HN99',
            'name'              => 'Mainboard AirPods Max Kho Hà Nội',
            'category'          => 'Bo mạch',
            'compatible_models' => 'AirPods Max',
            'storage_location'  => 'Két sắt Cầu Giấy',
            'stock_quantity'    => 15,
            'min_stock_alert'   => 2,
            'cost_price'        => 1500000,
            'retail_price'      => 2900000,
            'unit'              => 'bộ',
            'is_active'         => true,
        ]);

        $this->recipientTenantAllBranches = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => null,
            'label'             => 'Admin Toàn Cửa Hàng A',
            'phone'             => '0862389728',
            'target_role'       => 'admin',
            'telegram_chat_id'  => '8841956411',
            'connect_token'     => 'adm_p4_all_' . uniqid(),
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
            'telegram_chat_id'  => '8841956412',
            'connect_token'     => 'adm_p4_b1_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);
    }

    /**
     * 1. Tìm kiếm linh kiện theo từ khóa (keyword: tên linh kiện, mã SKU, hoặc dòng máy 'AirPods 2')
     *    trả về đúng số lượng tồn kho, giá bán lẻ, vị trí lưu kho và chi tiết tồn từng chi nhánh.
     */
    public function test_inventory_check_tool_searches_by_keyword_sku_and_compatible_model(): void
    {
        $tool = new InventoryCheckTool();

        // Tìm theo dòng máy tương thích 'AirPods 2'
        $byModel = $tool->execute([
            'keyword' => '  AirPods 2  ',
        ], $this->recipientTenantAllBranches);

        $this->assertSame('AirPods 2', $byModel['filters_applied']['keyword']);
        $this->assertFalse($byModel['filters_applied']['low_stock_only']);
        $this->assertSame(1, $byModel['total_matched']);
        $this->assertCount(1, $byModel['parts']);

        $partData = $byModel['parts'][0];
        $this->assertSame('PIN-AP2-ZIN', $partData['sku']);
        $this->assertSame('Pin tai nghe AirPods 2 dung lượng chuẩn', $partData['name']);
        $this->assertSame('Tủ A - Ngăn 02', $partData['storage_location']);
        $this->assertSame('viên', $partData['unit']);
        $this->assertSame(28, $partData['stock_quantity']);
        $this->assertSame(28, $partData['total_stock_quantity']);
        $this->assertFalse($partData['is_low_stock']);
        $this->assertSame(200000.0, $partData['retail_price']);
        $this->assertSame('200.000 đ', $partData['formatted_retail_price']);
        $this->assertSame(65000.0, $partData['cost_price']);
        $this->assertSame('65.000 đ', $partData['formatted_cost_price']);
        $this->assertCount(2, $partData['branch_stocks']);

        // Tìm theo mã SKU 'LOA-APP2-ANC' với người nhận gắn riêng Chi nhánh Quận 1
        $bySkuBranchA1 = $tool->execute([
            'keyword' => 'LOA-APP2-ANC',
        ], $this->recipientBranchA1Only);

        $this->assertSame('Chi nhánh Quận 1', $bySkuBranchA1['branch_name']);
        $this->assertSame('Chi nhánh Quận 1', $bySkuBranchA1['branch_scope']);
        $this->assertSame(1, $bySkuBranchA1['total_matched']);
        $this->assertSame(2, $bySkuBranchA1['parts'][0]['stock_quantity']);
        $this->assertSame(2, $bySkuBranchA1['parts'][0]['branch_stock_quantity']);
        $this->assertSame(3, $bySkuBranchA1['parts'][0]['total_stock_quantity']);
        $this->assertTrue($bySkuBranchA1['parts'][0]['is_low_stock']);
    }

    /**
     * 2. Lọc linh kiện sắp hết hàng (low_stock_only = true) chỉ trả về các linh kiện
     *    có stock_quantity <= min_stock_alert, sắp xếp ưu tiên số lượng tồn thấp nhất lên đầu.
     */
    public function test_inventory_check_tool_filters_low_stock_parts_accurately(): void
    {
        $tool = new InventoryCheckTool();

        $lowStockResult = $tool->execute([
            'low_stock_only' => true,
        ], $this->recipientTenantAllBranches);

        $this->assertTrue($lowStockResult['filters_applied']['low_stock_only']);
        $this->assertSame(2, $lowStockResult['total_matched']);
        $this->assertCount(2, $lowStockResult['parts']);

        // Sắp xếp tăng dần theo stock_quantity: BANLE-AP3-01 (0 bộ) đứng trước LOA-APP2-ANC (3 cụm)
        $this->assertSame('BANLE-AP3-01', $lowStockResult['parts'][0]['sku']);
        $this->assertSame(0, $lowStockResult['parts'][0]['stock_quantity']);
        $this->assertTrue($lowStockResult['parts'][0]['is_low_stock']);

        $this->assertSame('LOA-APP2-ANC', $lowStockResult['parts'][1]['sku']);
        $this->assertSame(3, $lowStockResult['parts'][1]['stock_quantity']);
        $this->assertTrue($lowStockResult['parts'][1]['is_low_stock']);

        // Đảm bảo linh kiện đủ hàng (PIN-AP2-ZIN: 28 > 10) không xuất hiện trong danh sách sắp hết
        $skus = array_column($lowStockResult['parts'], 'sku');
        $this->assertNotContains('PIN-AP2-ZIN', $skus);
    }

    /**
     * 3. Bảo mật cô lập tuyệt đối tenant_id:
     *    Admin của Cửa hàng A không thể nhìn thấy linh kiện trong kho của Cửa hàng B (total_matched = 0).
     */
    public function test_inventory_check_tool_strictly_isolates_tenant_inventory(): void
    {
        $tool = new InventoryCheckTool();

        // Cố tình tra cứu mã SKU hoặc tên linh kiện thuộc Cửa hàng B từ tài khoản Admin Cửa hàng A
        $crossTenantBySku = $tool->execute([
            'keyword' => 'MAIN-MAX-HN99',
        ], $this->recipientTenantAllBranches);

        $this->assertSame(0, $crossTenantBySku['total_matched']);
        $this->assertEmpty($crossTenantBySku['parts']);

        $crossTenantByName = $tool->execute([
            'keyword' => 'AirPods Max Kho Hà Nội',
        ], $this->recipientTenantAllBranches);

        $this->assertSame(0, $crossTenantByName['total_matched']);
        $this->assertEmpty($crossTenantByName['parts']);

        // Khi liệt kê toàn bộ kho Cửa hàng A -> tuyệt đối không chứa SKU của Cửa hàng B
        $allTenantAParts = $tool->execute([], $this->recipientTenantAllBranches);
        $this->assertSame(3, $allTenantAParts['total_matched']);
        $skus = array_column($allTenantAParts['parts'], 'sku');
        $this->assertNotContains('MAIN-MAX-HN99', $skus);
    }

    /**
     * 4. Luồng 2 bước End-to-End qua Webhook Telegram (POST /api/v1/webhooks/telegram):
     *    - Bước 1: Gemini bóc tách tham số gọi 'check_inventory_parts' (chỉ gọi Gemini đúng 1 lần duy nhất).
     *    - Bước 2: InventoryCheckTool truy vấn DB thật và tự format kết quả HTML tiếng Việt gửi thẳng về Telegram.
     */
    public function test_end_to_end_webhook_calls_inventory_check_tool_and_sends_clean_html_reply(): void
    {
        /** @var TelegramAiToolRegistry $registry */
        $registry = $this->app->make(TelegramAiToolRegistry::class);
        $this->assertNotNull($registry->get('check_inventory_parts'));

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
                                            'name' => 'check_inventory_parts',
                                            'args' => [
                                                'keyword' => 'AirPods 2',
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
            'update_id' => 94001,
            'message'   => [
                'message_id' => 401,
                'chat'       => ['id' => 8841956411, 'type' => 'private'],
                'text'       => 'Kho còn mấy viên pin AirPods 2?',
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', true);

        // Xác nhận chỉ gọi Gemini đúng 1 lần duy nhất ở Bước 1 (cắt bỏ Bước 3)
        $this->assertSame(1, $geminiCallCount);

        // Kiểm tra tin nhắn gửi về Telegram do InventoryCheckTool::formatHtml tạo ra
        $sentTelegramText = null;
        Http::assertSent(function ($request) use (&$sentTelegramText) {
            if (str_contains($request->url(), '/sendMessage') && (string) $request['chat_id'] === '8841956411') {
                $sentTelegramText = (string) $request['text'];
                return true;
            }
            return false;
        });

        $this->assertNotNull($sentTelegramText);
        $this->assertStringContainsString('<b>Kết quả kiểm tra tồn kho linh kiện</b>', $sentTelegramText);
        $this->assertStringContainsString('<code>PIN-AP2-ZIN</code>', $sentTelegramText);
        $this->assertStringContainsString('<b>28 viên</b>', $sentTelegramText);
        $this->assertStringContainsString('<b>200.000 đ</b>', $sentTelegramText);
        $this->assertStringNotContainsString('{', $sentTelegramText);
        $this->assertStringNotContainsString('}', $sentTelegramText);
    }
}

