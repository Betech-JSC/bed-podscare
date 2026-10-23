<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\DeviceModel;
use App\Models\TelegramRecipient;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class TelegramNotificationTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected Branch $branchA1;
    protected Branch $branchA2;
    protected User $adminA;
    protected User $adminB;
    protected DeviceModel $deviceModel;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set('services.telegram.bot_token', 'test_bot_token_123456');
        Config::set('services.telegram.bot_username', 'PodsCareNotifyBot');
        Config::set('services.telegram.webhook_secret', '');
        Config::set('services.telegram.frontend_url', 'http://localhost:3000');

        $this->tenantA = Tenant::where('code', 'fixo-master')->first() ?? Tenant::create([
            'name'   => 'Cửa hàng A',
            'code'   => 'tenant-a-' . uniqid(),
            'status' => 'active',
        ]);

        $this->tenantB = Tenant::create([
            'name'   => 'Cửa hàng B',
            'code'   => 'tenant-b-' . uniqid(),
            'status' => 'active',
        ]);

        $this->branchA1 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'CN-Q1-' . rand(100, 999),
            'address'   => '123 Nguyễn Huệ, Q1',
            'phone'     => '0901112222',
            'is_active' => true,
        ]);

        $this->branchA2 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Quận 7',
            'code'      => 'CN-Q7-' . rand(100, 999),
            'address'   => '456 Nguyễn Thị Thập, Q7',
            'phone'     => '0903334444',
            'is_active' => true,
        ]);

        $this->adminA = (new User())->forceFill([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'Admin Cửa Hàng A',
            'email'     => 'admin_a_' . uniqid() . '@fixo.com.vn',
            'password'  => bcrypt('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);
        $this->adminA->save();

        $this->adminB = (new User())->forceFill([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Admin Cửa Hàng B',
            'email'     => 'admin_b_' . uniqid() . '@fixo.com.vn',
            'password'  => bcrypt('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);
        $this->adminB->save();

        $this->deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro 2',
            'category'     => 'AirPods',
            'model_code'   => 'APP2-' . rand(100, 999),
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);
    }

    /**
     * 1. Admin thêm nhiều số điện thoại nhận tin -> trả về 201 kèm connect_token và connect_url.
     */
    public function test_admin_can_create_multiple_telegram_phone_recipients(): void
    {
        Http::fake([
            'api.telegram.org/*' => Http::response(['ok' => true, 'result' => []], 200),
        ]);

        $res1 = $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/telegram-recipients', [
                'label' => 'Anh Nam - Chủ shop',
                'phone' => '0901234567',
            ]);

        $res1->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.label', 'Anh Nam - Chủ shop')
            ->assertJsonPath('data.phone', '0901234567')
            ->assertJsonPath('data.target_role', 'admin')
            ->assertJsonPath('data.is_active', true);

        $token1 = $res1->json('data.connect_token');
        $url1 = $res1->json('data.connect_url');
        $this->assertNotEmpty($token1);
        $this->assertEquals("https://t.me/PodsCareNotifyBot?start={$token1}", $url1);
        $this->assertNull($res1->json('data.connected_at'));

        // Thêm SĐT thứ 2 có sẵn telegram_chat_id
        $res2 = $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/telegram-recipients', [
                'label'              => 'Chị Lan - Quản lý Q1',
                'phone'              => '0909888777',
                'branch_id'          => $this->branchA1->id,
                'telegram_chat_id'   => '-10099887766',
                'telegram_thread_id' => '15',
            ]);

        $res2->assertStatus(201)
            ->assertJsonPath('data.telegram_chat_id', '-10099887766')
            ->assertJsonPath('data.telegram_thread_id', '15');
        $this->assertNotNull($res2->json('data.connected_at'));

        // Lấy danh sách
        $listRes = $this->actingAs($this->adminA, 'sanctum')
            ->getJson('/api/v1/telegram-recipients');

        $listRes->assertStatus(200);
        $this->assertCount(2, $listRes->json('data'));
    }

    /**
     * 2. Cô lập dữ liệu giữa các cửa hàng (Multi-tenant Isolation).
     */
    public function test_multi_tenant_isolation_for_telegram_recipients(): void
    {
        $recipientB = TelegramRecipient::create([
            'tenant_id'          => $this->tenantB->id,
            'label'              => 'Chủ shop B',
            'phone'              => '0911222333',
            'target_role'        => 'admin',
            'connect_token'      => 'adm_test_token_b_' . uniqid(),
            'subscribed_events'  => ['order.created'],
            'is_active'          => true,
        ]);

        // Admin A không nhìn thấy bản ghi của cửa hàng B
        $listRes = $this->actingAs($this->adminA, 'sanctum')
            ->getJson('/api/v1/telegram-recipients');
        $listRes->assertStatus(200);
        $ids = collect($listRes->json('data'))->pluck('id')->all();
        $this->assertNotContains($recipientB->id, $ids);

        // Admin A cố tình sửa hoặc xóa bản ghi của cửa hàng B -> 404
        $updateRes = $this->actingAs($this->adminA, 'sanctum')
            ->putJson("/api/v1/telegram-recipients/{$recipientB->id}", [
                'label' => 'Hack Shop B',
            ]);
        $updateRes->assertStatus(404);

        $deleteRes = $this->actingAs($this->adminA, 'sanctum')
            ->deleteJson("/api/v1/telegram-recipients/{$recipientB->id}");
        $deleteRes->assertStatus(404);
    }

    /**
     * 3. Liên kết tài khoản 1 chạm qua Webhook (/start <connect_token>).
     */
    public function test_webhook_start_command_links_chat_id_and_sends_welcome(): void
    {
        Http::fake([
            'api.telegram.org/*' => Http::response(['ok' => true, 'result' => ['message_id' => 1]], 200),
        ]);

        $recipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'label'             => 'Anh Nam',
            'phone'             => '0901234567',
            'target_role'       => 'admin',
            'connect_token'     => 'adm_webhook_token_123',
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
        ]);

        $response = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 10001,
            'message'   => [
                'message_id' => 50,
                'chat'       => [
                    'id'   => 88990011,
                    'type' => 'private',
                ],
                'text'       => '/start adm_webhook_token_123',
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', true)
            ->assertJsonPath('data.recipient_id', $recipient->id);

        $recipient->refresh();
        $this->assertEquals('88990011', $recipient->telegram_chat_id);
        $this->assertNotNull($recipient->connected_at);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === '88990011'
                && str_contains($request['text'], '0901234567');
        });
    }

    /**
     * 4. Liên kết tài khoản qua Polling Sync (POST /api/v1/telegram-recipients/sync).
     */
    public function test_polling_sync_updates_links_pending_recipient(): void
    {
        $recipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'label'             => 'Anh Minh Admin',
            'phone'             => '0988777666',
            'target_role'       => 'admin',
            'connect_token'     => 'adm_sync_token_999',
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
        ]);

        Http::fake([
            'api.telegram.org/*/getUpdates*' => Http::response([
                'ok'     => true,
                'result' => [
                    [
                        'update_id' => 2001,
                        'message'   => [
                            'chat' => ['id' => 77665544],
                            'text' => '/start adm_sync_token_999',
                        ],
                    ],
                ],
            ], 200),
            'api.telegram.org/*/sendMessage*' => Http::response(['ok' => true], 200),
        ]);

        $syncRes = $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/telegram-recipients/sync');

        $syncRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.synced_count', 1);

        $recipient->refresh();
        $this->assertEquals('77665544', $recipient->telegram_chat_id);
        $this->assertNotNull($recipient->connected_at);
    }

    /**
     * 5. Gửi tin nhắn kiểm tra kết nối (POST /api/v1/telegram-recipients/{id}/test).
     */
    public function test_admin_can_send_test_notification_to_connected_recipient(): void
    {
        Http::fake([
            'api.telegram.org/*/sendMessage*' => Http::response(['ok' => true], 200),
        ]);

        $recipient = TelegramRecipient::create([
            'tenant_id'          => $this->tenantA->id,
            'label'              => 'Anh Nam Test',
            'phone'              => '0901234567',
            'target_role'        => 'admin',
            'telegram_chat_id'   => '11223344',
            'telegram_thread_id' => '9',
            'connect_token'      => 'adm_test_btn_token',
            'subscribed_events'  => ['order.created'],
            'is_active'          => true,
            'connected_at'       => now(),
        ]);

        $res = $this->actingAs($this->adminA, 'sanctum')
            ->postJson("/api/v1/telegram-recipients/{$recipient->id}/test");

        $res->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.sent', true);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === '11223344'
                && (int) $request['message_thread_id'] === 9
                && str_contains($request['text'], 'TIN NHẮN KIỂM TRA');
        });
    }

    /**
     * 6. Tạo đơn mới tự động bắn tin nhắn cho tất cả SĐT Admin hợp lệ và lọc đúng chi nhánh / trạng thái.
     */
    public function test_creating_order_notifies_all_matching_active_admin_recipients(): void
    {
        Http::fake([
            'api.telegram.org/*/sendMessage*' => Http::response(['ok' => true], 200),
        ]);

        // Người nhận 1: Toàn cửa hàng (branch_id = null), đang bật -> PHẢI NHẬN ĐƯỢC
        TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => null,
            'label'             => 'Chủ shop (Toàn hệ thống)',
            'phone'             => '0901111111',
            'target_role'       => 'admin',
            'telegram_chat_id'  => 'chat_all_branches',
            'connect_token'     => 'adm_tok_1_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
        ]);

        // Người nhận 2: Đúng chi nhánh 1 (branchA1), đang bật -> PHẢI NHẬN ĐƯỢC
        TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => $this->branchA1->id,
            'label'             => 'Quản lý CN Quận 1',
            'phone'             => '0902222222',
            'target_role'       => 'admin',
            'telegram_chat_id'  => 'chat_branch_a1',
            'connect_token'     => 'adm_tok_2_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
        ]);

        // Người nhận 3: Khác chi nhánh (branchA2) -> KHÔNG ĐƯỢC NHẬN
        TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => $this->branchA2->id,
            'label'             => 'Quản lý CN Quận 7',
            'phone'             => '0903333333',
            'target_role'       => 'admin',
            'telegram_chat_id'  => 'chat_branch_a2',
            'connect_token'     => 'adm_tok_3_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
        ]);

        // Người nhận 4: Đang tắt (is_active = false) -> KHÔNG ĐƯỢC NHẬN
        TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => null,
            'label'             => 'Admin tạm ngưng',
            'phone'             => '0904444444',
            'target_role'       => 'admin',
            'telegram_chat_id'  => 'chat_inactive',
            'connect_token'     => 'adm_tok_4_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => false,
        ]);

        $orderRes = $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/orders', [
                'branch_id'         => $this->branchA1->id,
                'customer_name'     => 'Nguyễn Văn Khách <script>',
                'customer_phone'    => '0912345678',
                'device_model_id'   => $this->deviceModel->id,
                'issue_description' => 'Rè loa trái & hao pin',
                'estimated_price'   => 450000,
            ]);

        $orderRes->assertStatus(201)
            ->assertJsonPath('success', true);

        $sentChatIds = [];
        Http::assertSent(function ($request) use (&$sentChatIds) {
            if (str_contains($request->url(), '/sendMessage')) {
                $sentChatIds[] = (string) $request['chat_id'];
                // Kiểm tra HTML escape an toàn
                $this->assertStringContainsString('Nguyễn Văn Khách &lt;script&gt;', $request['text']);
                $this->assertStringContainsString('Rè loa trái &amp; hao pin', $request['text']);
                $this->assertStringContainsString('450.000 đ', $request['text']);
                return true;
            }
            return false;
        });

        $this->assertCount(2, $sentChatIds);
        $this->assertContains('chat_all_branches', $sentChatIds);
        $this->assertContains('chat_branch_a1', $sentChatIds);
        $this->assertNotContains('chat_branch_a2', $sentChatIds);
        $this->assertNotContains('chat_inactive', $sentChatIds);
    }

    /**
     * 7. Fail-safe: Khi Telegram API trả về HTTP 500, API tạo đơn vẫn trả về HTTP 201 thành công.
     */
    public function test_order_creation_succeeds_even_when_telegram_api_fails(): void
    {
        Http::fake([
            'api.telegram.org/*' => Http::response(['ok' => false, 'description' => 'Internal Server Error'], 500),
        ]);

        TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => null,
            'label'             => 'Chủ shop Fail-safe',
            'phone'             => '0905555555',
            'target_role'       => 'admin',
            'telegram_chat_id'  => 'chat_failsafe',
            'connect_token'     => 'adm_tok_failsafe_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
        ]);

        $orderRes = $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/orders', [
                'branch_id'         => $this->branchA1->id,
                'customer_name'     => 'Khách Test Fail-safe',
                'customer_phone'    => '0987654321',
                'device_model_id'   => $this->deviceModel->id,
                'issue_description' => 'Mất kết nối Bluetooth',
                'estimated_price'   => 300000,
            ]);

        $orderRes->assertStatus(201)
            ->assertJsonPath('success', true);
    }

    /**
     * 8. Bảo mật liên kết: /start thuần KHÔNG tự động liên kết bản ghi đang chờ; phải gửi SĐT chờ kích hoạt hoặc /start <token>.
     */
    public function test_polling_sync_updates_links_pending_recipient_on_plain_start_from_telegram_web(): void
    {
        $recipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'label'             => 'Nhật Bảo',
            'phone'             => '0862389728',
            'target_role'       => 'admin',
            'connect_token'     => 'adm_web_fallback_token',
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
        ]);

        Http::fakeSequence('api.telegram.org/*/getUpdates*')
            ->push([
                'ok'     => true,
                'result' => [
                    [
                        'update_id' => 3001,
                        'message'   => [
                            'chat' => ['id' => 66554433],
                            'text' => '/start',
                        ],
                    ],
                ],
            ], 200)
            ->push([
                'ok'     => true,
                'result' => [
                    [
                        'update_id' => 3002,
                        'message'   => [
                            'chat' => ['id' => 66554433],
                            'text' => '0862389728',
                        ],
                    ],
                ],
            ], 200);

        Http::fake([
            'api.telegram.org/*/sendMessage*' => Http::response(['ok' => true], 200),
        ]);

        // Bước 1: Gửi /start thuần -> KHÔNG tự động gán chat_id
        $syncBareStartRes = $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/telegram-recipients/sync');

        $syncBareStartRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.synced_count', 0);

        $recipient->refresh();
        $this->assertNull($recipient->telegram_chat_id);

        // Bước 2: Gửi SĐT đang chờ kích hoạt -> Liên kết thành công
        $syncPhoneRes = $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/telegram-recipients/sync');

        $syncPhoneRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.synced_count', 1);

        $recipient->refresh();
        $this->assertEquals('66554433', $recipient->telegram_chat_id);
        $this->assertNotNull($recipient->connected_at);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === '66554433'
                && str_contains($request['text'], '0862389728');
        });
    }

    /**
     * 9. Zero-click Sync tại GET /api/v1/telegram-recipients và tạo đơn mới không gọi getUpdates đồng bộ.
     */
    public function test_zero_click_auto_sync_links_pending_recipient_and_notifies_on_new_order(): void
    {
        $recipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'label'             => 'Admin Zero Click',
            'phone'             => '0977888999',
            'target_role'       => 'admin',
            'connect_token'     => 'adm_zeroclick_token',
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
        ]);

        Http::fake([
            'api.telegram.org/*/getUpdates*' => Http::response([
                'ok'     => true,
                'result' => [
                    [
                        'update_id' => 4001,
                        'message'   => [
                            'chat' => ['id' => 55443322],
                            'text' => '/start adm_zeroclick_token',
                        ],
                    ],
                ],
            ], 200),
            'api.telegram.org/*/sendMessage*' => Http::response(['ok' => true], 200),
        ]);

        // Mở danh sách người nhận -> tự động syncUpdates() zero-click cho các bản ghi chưa có chat_id
        $listRes = $this->actingAs($this->adminA, 'sanctum')
            ->getJson('/api/v1/telegram-recipients');
        $listRes->assertStatus(200);

        $recipient->refresh();
        $this->assertEquals('55443322', $recipient->telegram_chat_id);
        $this->assertNotNull($recipient->connected_at);

        // Khi tạo đơn mới -> bắn thông báo qua SendTelegramNewOrderNotificationJob mà không gọi lại getUpdates
        $orderRes = $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/orders', [
                'branch_id'         => $this->branchA1->id,
                'customer_name'     => 'Khách Zero Click',
                'customer_phone'    => '0909123123',
                'device_model_id'   => $this->deviceModel->id,
                'issue_description' => 'Thay pin tai phải',
                'estimated_price'   => 350000,
            ]);

        $orderRes->assertStatus(201);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === '55443322'
                && str_contains($request['text'], 'ĐƠN SỬA CHỮA MỚI');
        });
    }

    /**
     * 10. Kiểm tra cả 3 loại đơn (in_store, cod kèm shipping_address, warranty) và bảo vệ inline_keyboard khi FRONTEND_URL là localhost.
     */
    public function test_all_three_order_types_and_localhost_url_safety(): void
    {
        Http::fake([
            'api.telegram.org/*/sendMessage*' => Http::response(['ok' => true], 200),
        ]);

        TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => null,
            'label'             => 'Admin Nhận Đủ 3 Loại Đơn',
            'phone'             => '0862389728',
            'target_role'       => 'admin',
            'telegram_chat_id'  => '8841956211',
            'connect_token'     => 'adm_3types_token',
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
        ]);

        // Case 1: Đơn tại cửa hàng (in_store) + FRONTEND_URL = http://localhost:3000 -> không gửi reply_markup
        Config::set('services.telegram.frontend_url', 'http://localhost:3000');
        $inStoreRes = $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/orders', [
                'branch_id'         => $this->branchA1->id,
                'order_type'        => 'in_store',
                'customer_name'     => 'Khách Tại Quầy',
                'customer_phone'    => '0901112233',
                'device_model_id'   => $this->deviceModel->id,
                'issue_description' => 'Vệ sinh loa & thay pin',
                'estimated_price'   => 250000,
            ]);
        $inStoreRes->assertStatus(201);

        // Case 2: Đơn COD (Khách tỉnh) kèm shipping_address
        $codRes = $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/orders', [
                'branch_id'         => $this->branchA1->id,
                'order_type'        => 'cod',
                'shipping_address'  => '99 Nguyễn Văn Linh, Hải Châu, Đà Nẵng',
                'customer_name'     => 'Khách Tỉnh COD',
                'customer_phone'    => '0902223344',
                'device_model_id'   => $this->deviceModel->id,
                'issue_description' => 'Mất nguồn kén sạc',
                'estimated_price'   => 500000,
            ]);
        $codRes->assertStatus(201);

        // Case 3: Đơn Tiếp nhận bảo hành (warranty) + FRONTEND_URL public domain -> có reply_markup
        Config::set('services.telegram.frontend_url', 'https://app.fixo.com.vn');
        $warrantyRes = $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/orders', [
                'branch_id'         => $this->branchA1->id,
                'order_type'        => 'warranty',
                'customer_name'     => 'Khách Bảo Hành',
                'customer_phone'    => '0903334455',
                'device_model_id'   => $this->deviceModel->id,
                'issue_description' => '[Bảo hành] Tai trái sụt pin nhanh',
                'estimated_price'   => 0,
            ]);
        $warrantyRes->assertStatus(201);

        $sentPayloads = [];
        Http::assertSent(function ($request) use (&$sentPayloads) {
            if (str_contains($request->url(), '/sendMessage')) {
                $sentPayloads[] = $request->data();
                return true;
            }
            return false;
        });

        $this->assertCount(3, $sentPayloads);

        // Kiểm tra payload 1 (in_store + localhost)
        $this->assertStringContainsString('Khách tại cửa hàng', $sentPayloads[0]['text']);
        $this->assertArrayNotHasKey('reply_markup', $sentPayloads[0]);

        // Kiểm tra payload 2 (cod + shipping_address)
        $this->assertStringContainsString('Đơn COD (Khách tỉnh)', $sentPayloads[1]['text']);
        $this->assertStringContainsString('99 Nguyễn Văn Linh, Hải Châu, Đà Nẵng', $sentPayloads[1]['text']);

        // Kiểm tra payload 3 (warranty + public domain)
        $this->assertStringContainsString('Tiếp nhận bảo hành', $sentPayloads[2]['text']);
        $this->assertArrayHasKey('reply_markup', $sentPayloads[2]);
    }

    /**
     * 11. Tự động retry bỏ reply_markup nếu Telegram trả về 400 Bad Request do lỗi nút bấm.
     */
    public function test_send_message_retries_without_inline_keyboard_if_telegram_returns_400(): void
    {
        Http::fakeSequence()
            ->push(['ok' => false, 'error_code' => 400, 'description' => 'Bad Request: Wrong HTTP URL'], 400)
            ->push(['ok' => true, 'result' => ['message_id' => 99]], 200);

        $service = app(\App\Services\TelegramNotificationService::class);
        $ok = $service->sendMessage(
            '8841956211',
            '<b>Test Fallback</b>',
            null,
            [[['text' => 'Xem đơn', 'url' => 'http://invalid-url']]]
        );

        $this->assertTrue($ok);
    }

    /**
     * 12. Tạo đơn mới đẩy SendTelegramNewOrderNotificationJob vào Queue (Queue::fake) và thực thi trực tiếp handle() không gọi getUpdates.
     */
    public function test_new_order_dispatches_send_telegram_new_order_notification_job_and_executes_handle_directly(): void
    {
        \Illuminate\Support\Facades\Queue::fake();

        TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => null,
            'label'             => 'Admin Queue Test',
            'phone'             => '0862389728',
            'target_role'       => 'admin',
            'telegram_chat_id'  => '8841956211',
            'connect_token'     => 'adm_queue_test_token',
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
        ]);

        $orderRes = $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/orders', [
                'branch_id'         => $this->branchA1->id,
                'customer_name'     => 'Khách Queue Job',
                'customer_phone'    => '0908887766',
                'device_model_id'   => $this->deviceModel->id,
                'issue_description' => 'Thay màng loa AirPods Pro',
                'estimated_price'   => 400000,
            ]);

        $orderRes->assertStatus(201);
        $orderId = (int) $orderRes->json('data.id');

        \Illuminate\Support\Facades\Queue::assertPushed(
            \App\Jobs\SendTelegramNewOrderNotificationJob::class,
            fn (\App\Jobs\SendTelegramNewOrderNotificationJob $job) => $job->orderId === $orderId
        );

        // Thực thi trực tiếp handle() của Job và xác nhận gọi sendMessage nhưng KHÔNG gọi getUpdates
        Http::fake([
            'api.telegram.org/*/sendMessage*' => Http::response(['ok' => true], 200),
            'api.telegram.org/*/getUpdates*'  => Http::response(['ok' => true, 'result' => []], 200),
        ]);

        $job = new \App\Jobs\SendTelegramNewOrderNotificationJob($orderId);
        $job->handle(app(\App\Services\TelegramNotificationService::class));

        Http::assertSent(fn ($req) => str_contains($req->url(), '/sendMessage') && (string) $req['chat_id'] === '8841956211');
        Http::assertNotSent(fn ($req) => str_contains($req->url(), '/getUpdates'));
    }
}



