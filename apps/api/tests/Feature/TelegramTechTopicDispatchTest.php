<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Notification;
use App\Models\RepairOrder;
use App\Models\TelegramRecipient;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class TelegramTechTopicDispatchTest extends TestCase
{
    use DatabaseTransactions {
        beginDatabaseTransaction as parentBeginDatabaseTransaction;
    }

    protected Tenant $tenant;
    protected Branch $branch1;
    protected Branch $branch2;
    protected User $admin;
    protected User $tech1;
    protected User $tech2;
    protected DeviceModel $deviceModel;

    public function beginDatabaseTransaction(): void
    {
        $migration = include base_path('database/migrations/2026_11_05_000001_add_tech_topic_dispatch_columns.php');
        $migration->up();

        $this->parentBeginDatabaseTransaction();
    }

    protected function setUp(): void
    {
        parent::setUp();

        Config::set('services.telegram.bot_token', 'test_bot_token_ktv_topic');
        Config::set('services.telegram.bot_username', 'PodsCareNotifyBot');
        Config::set('services.telegram.webhook_secret', '');
        Config::set('services.telegram.frontend_url', 'http://localhost:3010');

        $this->tenant = Tenant::create([
            'name'   => 'Cửa hàng FIXO Test',
            'code'   => 'fixo-ktv-' . uniqid(),
            'status' => 'active',
        ]);

        $this->branch1 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'Q1' . rand(10, 99),
            'address'   => '123 Lê Lợi, Q1',
            'phone'     => '0901112222',
            'is_active' => true,
        ]);

        $this->branch2 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Quận 7',
            'code'      => 'Q7' . rand(10, 99),
            'address'   => '456 Nguyễn Thị Thập, Q7',
            'phone'     => '0903334444',
            'is_active' => true,
        ]);

        $this->admin = (new User())->forceFill([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch1->id,
            'name'      => 'Admin Quận 1',
            'email'     => 'admin_q1_' . uniqid() . '@fixo.com.vn',
            'phone'     => '0909000111',
            'password'  => bcrypt('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);
        $this->admin->save();

        $this->tech1 = (new User())->forceFill([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch1->id,
            'name'      => 'KTV Hùng',
            'email'     => 'ktv_hung_' . uniqid() . '@fixo.com.vn',
            'phone'     => '0911222333',
            'password'  => bcrypt('password'),
            'role'      => 'technician',
            'is_active' => true,
        ]);
        $this->tech1->save();

        $this->tech2 = (new User())->forceFill([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch1->id,
            'name'      => 'KTV Minh',
            'email'     => 'ktv_minh_' . uniqid() . '@fixo.com.vn',
            'phone'     => '0922333444',
            'password'  => bcrypt('password'),
            'role'      => 'technician',
            'is_active' => true,
        ]);
        $this->tech2->save();

        $this->deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro 2',
            'category'     => 'AirPods',
            'model_code'   => 'APP2-' . rand(100, 999),
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);
    }

    /**
     * 1. Tạo recipient KTV có user_id và gõ /start <ktv_token> trong Topic nhóm Telegram -> lưu cả chat_id, thread_id, telegram_user_id.
     */
    public function test_admin_creates_technician_recipient_and_start_command_in_group_topic_binds_thread_id(): void
    {
        Http::fake([
            'api.telegram.org/*' => Http::response(['ok' => true, 'result' => ['message_id' => 101]], 200),
        ]);

        $createRes = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/v1/telegram-recipients', [
                'label'       => 'Topic KTV Hùng',
                'phone'       => '0911222333',
                'branch_id'   => $this->branch1->id,
                'user_id'     => $this->tech1->id,
                'target_role' => 'technician',
            ]);

        $createRes->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.target_role', 'technician')
            ->assertJsonPath('data.user_id', $this->tech1->id)
            ->assertJsonPath('data.user.name', 'KTV Hùng');

        $token = (string) $createRes->json('data.connect_token');
        $this->assertStringStartsWith('ktv_', $token);

        // KTV gõ /start <token> bên trong Topic 456 của nhóm Telegram -100987654321
        $webhookRes = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 50001,
            'message'   => [
                'message_id'        => 88,
                'message_thread_id' => 456,
                'from'              => [
                    'id'         => 777888999,
                    'first_name' => 'Hùng KTV',
                ],
                'chat'              => [
                    'id'    => -100987654321,
                    'type'  => 'supergroup',
                    'title' => 'Xưởng Kỹ Thuật FIXO',
                ],
                'text'              => "/start {$token}",
            ],
        ]);

        $webhookRes->assertStatus(200)
            ->assertJsonPath('data.handled', true);

        $recipient = TelegramRecipient::find($createRes->json('data.id'));
        $this->assertNotNull($recipient);
        $this->assertEquals('-100987654321', $recipient->telegram_chat_id);
        $this->assertEquals('456', $recipient->telegram_thread_id);
        $this->assertEquals('777888999', $recipient->telegram_user_id);
        $this->assertNotNull($recipient->connected_at);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === '-100987654321'
                && (int) $request['message_thread_id'] === 456
                && str_contains($request['text'], 'KTV Hùng')
                && data_get($request->data(), 'reply_markup.inline_keyboard.0.0.callback_data') === 'tech_my_orders';
        });
    }

    /**
     * 2. Tạo đơn mới bắn vào Topic của từng KTV trong chi nhánh: có đủ thông tin kỹ thuật & nút Nhận/Không nhận, ẨN 100% GIÁ TIỀN.
     */
    public function test_new_order_dispatches_price_free_message_with_accept_reject_buttons_to_technician_topics(): void
    {
        $seq = 200;
        Http::fake(function () use (&$seq) {
            $seq++;
            return Http::response(['ok' => true, 'result' => ['message_id' => $seq]], 200);
        });

        // Admin nhận thông báo có giá
        TelegramRecipient::create([
            'tenant_id'         => $this->tenant->id,
            'branch_id'         => $this->branch1->id,
            'label'             => 'Admin Q1',
            'phone'             => '0909000111',
            'target_role'       => 'admin',
            'telegram_chat_id'  => '-100111222',
            'connect_token'     => 'adm_tok_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
        ]);

        // KTV 1 (Topic 101)
        $recTech1 = TelegramRecipient::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch1->id,
            'user_id'            => $this->tech1->id,
            'label'              => 'KTV Hùng Topic',
            'phone'              => '0911222333',
            'target_role'        => 'technician',
            'telegram_chat_id'   => '-100555666',
            'telegram_thread_id' => '101',
            'connect_token'      => 'ktv_tok_1_' . uniqid(),
            'subscribed_events'  => ['order.created'],
            'is_active'          => true,
        ]);

        // KTV 2 (Topic 102)
        $recTech2 = TelegramRecipient::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch1->id,
            'user_id'            => $this->tech2->id,
            'label'              => 'KTV Minh Topic',
            'phone'              => '0922333444',
            'target_role'        => 'technician',
            'telegram_chat_id'   => '-100555666',
            'telegram_thread_id' => '102',
            'connect_token'      => 'ktv_tok_2_' . uniqid(),
            'subscribed_events'  => ['order.created'],
            'is_active'          => true,
        ]);

        $orderRes = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/v1/orders', [
                'branch_id'         => $this->branch1->id,
                'customer_name'     => 'Trần Thị Mai',
                'customer_phone'    => '0988777666',
                'device_model_id'   => $this->deviceModel->id,
                'serial_number'     => 'SN-APP2-999',
                'accessories'       => 'Tai trái (L), Tai phải (R), Hộp sạc',
                'issue_description' => 'Tai trái mất nguồn, hộp sạc hao pin',
                'test_note'         => 'Đã đo dòng sạc hộp 0.1A',
                'parts_needed'      => 'Pin tai nghe AirPods Pro 2',
                'estimated_price'   => 650000,
            ]);

        $orderRes->assertStatus(201);
        $orderId = (int) $orderRes->json('data.id');
        $order = RepairOrder::find($orderId);
        $this->assertNotNull($order);

        // Kiểm tra telegram_dispatch_messages được lưu đủ 2 KTV
        $dispatchMsgs = $order->telegram_dispatch_messages;
        $this->assertIsArray($dispatchMsgs);
        $this->assertCount(2, $dispatchMsgs);
        $this->assertEquals($recTech1->id, $dispatchMsgs[0]['recipient_id']);
        $this->assertEquals('101', $dispatchMsgs[0]['thread_id']);
        $this->assertEquals($recTech2->id, $dispatchMsgs[1]['recipient_id']);
        $this->assertEquals('102', $dispatchMsgs[1]['thread_id']);

        $techPayloads = [];
        $adminPayloads = [];
        Http::assertSent(function ($request) use (&$techPayloads, &$adminPayloads) {
            if (! str_contains($request->url(), '/sendMessage')) {
                return false;
            }
            $data = $request->data();
            if ((string) ($data['chat_id'] ?? '') === '-100555666') {
                $techPayloads[] = $data;
            } elseif ((string) ($data['chat_id'] ?? '') === '-100111222') {
                $adminPayloads[] = $data;
            }
            return true;
        });

        // Admin vẫn thấy giá 650.000 đ
        $this->assertCount(1, $adminPayloads);
        $this->assertStringContainsString('650.000 đ', $adminPayloads[0]['text']);

        // Cả 2 Topic KTV nhận được tin nhắn có đủ thông tin kỹ thuật & nút bấm, nhưng TUYỆT ĐỐI KHÔNG CÓ GIÁ
        $this->assertCount(2, $techPayloads);
        foreach ($techPayloads as $tp) {
            $this->assertStringContainsString('Trần Thị Mai', $tp['text']);
            $this->assertStringContainsString('0988777666', $tp['text']);
            $this->assertStringContainsString('Tai trái mất nguồn, hộp sạc hao pin', $tp['text']);
            $this->assertStringContainsString('Đã đo dòng sạc hộp 0.1A', $tp['text']);
            $this->assertStringContainsString('Pin tai nghe AirPods Pro 2', $tp['text']);
            $this->assertStringNotContainsString('650.000', $tp['text']);
            $this->assertStringNotContainsString('650000', $tp['text']);
            $this->assertStringNotContainsString('Giá dự kiến', $tp['text']);

            $buttons = data_get($tp, 'reply_markup.inline_keyboard.0', []);
            $this->assertEquals("accept_order:{$orderId}", $buttons[0]['callback_data'] ?? '');
            $this->assertEquals("reject_order:{$orderId}", $buttons[1]['callback_data'] ?? '');
        }
    }

    /**
     * 3. KTV 1 bấm [✅ Nhận đơn] -> chuyển thẳng sang in_repair (Đang sửa), gán technician_id = tech1,
     * đồng bộ khóa nút ở Topic KTV 2 và chặn KTV 2 bấm nhận đè.
     */
    public function test_accept_order_callback_transitions_to_in_repair_and_locks_other_tech_topics(): void
    {
        Http::fake([
            'api.telegram.org/*' => Http::response(['ok' => true, 'result' => ['message_id' => 501]], 200),
        ]);

        $recTech1 = TelegramRecipient::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch1->id,
            'user_id'            => $this->tech1->id,
            'label'              => 'KTV Hùng Topic',
            'phone'              => '0911222333',
            'target_role'        => 'technician',
            'telegram_chat_id'   => '-100555666',
            'telegram_thread_id' => '101',
            'telegram_user_id'   => '1110001',
            'connect_token'      => 'ktv_accept_1_' . uniqid(),
            'is_active'          => true,
        ]);

        $recTech2 = TelegramRecipient::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch1->id,
            'user_id'            => $this->tech2->id,
            'label'              => 'KTV Minh Topic',
            'phone'              => '0922333444',
            'target_role'        => 'technician',
            'telegram_chat_id'   => '-100555666',
            'telegram_thread_id' => '102',
            'telegram_user_id'   => '1110002',
            'connect_token'      => 'ktv_accept_2_' . uniqid(),
            'is_active'          => true,
        ]);

        $customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Nhận Đơn',
            'phone'     => '0905123456',
        ]);

        $order = RepairOrder::create([
            'tenant_id'                  => $this->tenant->id,
            'branch_id'                  => $this->branch1->id,
            'order_code'                 => 'PC0104112601',
            'customer_id'                => $customer->id,
            'device_model_id'            => $this->deviceModel->id,
            'issue_description'          => 'Rè loa phải AirPods Pro 2',
            'status'                     => 'waiting_tech',
            'total_price'                => 500000,
            'initial_price'              => 500000,
            'created_by_user_id'         => $this->admin->id,
            'telegram_dispatch_messages' => [
                [
                    'recipient_id' => $recTech1->id,
                    'user_id'      => $this->tech1->id,
                    'chat_id'      => '-100555666',
                    'thread_id'    => '101',
                    'message_id'   => 301,
                ],
                [
                    'recipient_id' => $recTech2->id,
                    'user_id'      => $this->tech2->id,
                    'chat_id'      => '-100555666',
                    'thread_id'    => '102',
                    'message_id'   => 302,
                ],
            ],
        ]);

        // KTV 1 bấm [✅ Nhận đơn] trong Topic 101
        $cbRes1 = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id'      => 60001,
            'callback_query' => [
                'id'      => 'cb_accept_tech1',
                'from'    => ['id' => 1110001, 'first_name' => 'Hùng'],
                'message' => [
                    'message_id'        => 301,
                    'message_thread_id' => 101,
                    'chat'              => ['id' => -100555666, 'type' => 'supergroup'],
                ],
                'data'    => "accept_order:{$order->id}",
            ],
        ]);

        $cbRes1->assertStatus(200)
            ->assertJsonPath('data.handled', true)
            ->assertJsonPath('data.recipient_id', $recTech1->id);

        $order->refresh();
        $this->assertEquals('in_repair', $order->status);
        $this->assertEquals($this->tech1->id, $order->technician_id);
        $this->assertNotNull($order->tech_accepted_at);
        $this->assertNotNull($order->repair_started_at);

        // Kiểm tra cả 2 tin nhắn (301 của KTV 1 và 302 của KTV 2) đều được editMessageText và KHÔNG lộ giá 500.000
        $editedMessages = [];
        Http::assertSent(function ($request) use (&$editedMessages) {
            if (str_contains($request->url(), '/editMessageText')) {
                $editedMessages[(int) $request['message_id']] = $request->data();
                return true;
            }
            return false;
        });

        $this->assertArrayHasKey(301, $editedMessages);
        $this->assertArrayHasKey(302, $editedMessages);
        $this->assertStringContainsString('Bạn (KTV Hùng) đã nhận đơn này', $editedMessages[301]['text']);
        $this->assertStringNotContainsString('500.000', $editedMessages[301]['text']);
        $this->assertStringContainsString('Đơn đã được KTV KTV Hùng nhận xử lý', $editedMessages[302]['text']);
        $this->assertStringNotContainsString('500.000', $editedMessages[302]['text']);

        // KTV 2 cố bấm [✅ Nhận đơn] sau khi KTV 1 đã nhận -> không bị ghi đè
        $cbRes2 = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id'      => 60002,
            'callback_query' => [
                'id'      => 'cb_accept_tech2_late',
                'from'    => ['id' => 1110002, 'first_name' => 'Minh'],
                'message' => [
                    'message_id'        => 302,
                    'message_thread_id' => 102,
                    'chat'              => ['id' => -100555666, 'type' => 'supergroup'],
                ],
                'data'    => "accept_order:{$order->id}",
            ],
        ]);

        $cbRes2->assertStatus(200);
        $order->refresh();
        $this->assertEquals('in_repair', $order->status);
        $this->assertEquals($this->tech1->id, $order->technician_id);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/answerCallbackQuery')
                && ($request['callback_query_id'] ?? '') === 'cb_accept_tech2_late'
                && str_contains((string) ($request['text'] ?? ''), 'đã được KTV Hùng nhận xử lý trước đó');
        });
    }

    /**
     * 4. KTV bấm [❌ Không nhận]: Khi 1 KTV từ chối thì giữ waiting_tech; khi 100% KTV trong chi nhánh đều từ chối
     * thì tạo Notification cảnh báo cho Admin/CSKH và gửi tin nhắn Telegram cảnh báo cho Admin.
     */
    public function test_reject_order_callback_alerts_admin_and_cskh_when_all_branch_techs_reject(): void
    {
        Http::fake([
            'api.telegram.org/*' => Http::response(['ok' => true, 'result' => ['message_id' => 701]], 200),
        ]);

        $adminRecipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenant->id,
            'branch_id'         => $this->branch1->id,
            'label'             => 'Admin Cảnh Báo',
            'phone'             => '0909000111',
            'target_role'       => 'admin',
            'telegram_chat_id'  => '-100999000',
            'connect_token'     => 'adm_alert_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
        ]);

        $recTech1 = TelegramRecipient::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch1->id,
            'user_id'            => $this->tech1->id,
            'label'              => 'KTV Hùng Topic',
            'phone'              => '0911222333',
            'target_role'        => 'technician',
            'telegram_chat_id'   => '-100555666',
            'telegram_thread_id' => '101',
            'telegram_user_id'   => '1110001',
            'connect_token'      => 'ktv_rej_1_' . uniqid(),
            'is_active'          => true,
        ]);

        $recTech2 = TelegramRecipient::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch1->id,
            'user_id'            => $this->tech2->id,
            'label'              => 'KTV Minh Topic',
            'phone'              => '0922333444',
            'target_role'        => 'technician',
            'telegram_chat_id'   => '-100555666',
            'telegram_thread_id' => '102',
            'telegram_user_id'   => '1110002',
            'connect_token'      => 'ktv_rej_2_' . uniqid(),
            'is_active'          => true,
        ]);

        $customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Từ Chối',
            'phone'     => '0906789123',
        ]);

        $order = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch1->id,
            'order_code'         => 'PC0104112602',
            'customer_id'        => $customer->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Chạm mạch hộp sạc nặng',
            'status'             => 'waiting_tech',
            'total_price'        => 700000,
            'created_by_user_id' => $this->admin->id,
        ]);

        // Bước 1: KTV 1 bấm [❌ Không nhận] -> chưa phải 100% nên chưa bắn cảnh báo Admin
        $this->postJson('/api/v1/webhooks/telegram', [
            'update_id'      => 70001,
            'callback_query' => [
                'id'      => 'cb_reject_tech1',
                'from'    => ['id' => 1110001],
                'message' => [
                    'message_id'        => 401,
                    'message_thread_id' => 101,
                    'chat'              => ['id' => -100555666, 'type' => 'supergroup'],
                ],
                'data'    => "reject_order:{$order->id}",
            ],
        ])->assertStatus(200);

        $order->refresh();
        $this->assertEquals('waiting_tech', $order->status);
        $this->assertNull($order->technician_id);
        $this->assertEquals([$this->tech1->id], $order->rejected_by_tech_ids);
        $this->assertDatabaseMissing('notifications', [
            'order_id' => $order->id,
            'type'     => 'order_all_techs_rejected',
        ]);

        // Bước 2: KTV 2 (KTV cuối cùng của chi nhánh) cũng bấm [❌ Không nhận] -> Phát cảnh báo cho Admin & CSKH!
        $this->postJson('/api/v1/webhooks/telegram', [
            'update_id'      => 70002,
            'callback_query' => [
                'id'      => 'cb_reject_tech2',
                'from'    => ['id' => 1110002],
                'message' => [
                    'message_id'        => 402,
                    'message_thread_id' => 102,
                    'chat'              => ['id' => -100555666, 'type' => 'supergroup'],
                ],
                'data'    => "reject_order:{$order->id}",
            ],
        ])->assertStatus(200);

        $order->refresh();
        $this->assertEqualsCanonicalizing([$this->tech1->id, $this->tech2->id], $order->rejected_by_tech_ids);

        $this->assertDatabaseHas('notifications', [
            'order_id'    => $order->id,
            'target_role' => 'admin',
            'type'        => 'order_all_techs_rejected',
        ]);
        $this->assertDatabaseHas('notifications', [
            'order_id'    => $order->id,
            'target_role' => 'cskh',
            'type'        => 'order_all_techs_rejected',
        ]);

        Http::assertSent(function ($request) use ($adminRecipient) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === (string) $adminRecipient->telegram_chat_id
                && str_contains($request['text'], 'CẢNH BÁO ĐIỀU PHỐI ĐƠN #PC0104112602');
        });
    }

    /**
     * 5. Hai chế độ tra cứu nhanh trong Topic KTV (/doncuatoi & /tracuu / nút bấm):
     * Hiển thị đúng đơn của KTV trong ngày & chi tiết kỹ thuật, ẨN TUYỆT ĐỐI 100% MỌI TRƯỜNG GIÁ TIỀN.
     */
    public function test_technician_quick_commands_and_buttons_list_orders_and_lookup_detail_without_any_price(): void
    {
        Http::fake([
            'api.telegram.org/*' => Http::response(['ok' => true, 'result' => ['message_id' => 801]], 200),
        ]);

        $recTech1 = TelegramRecipient::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch1->id,
            'user_id'            => $this->tech1->id,
            'label'              => 'KTV Hùng Topic',
            'phone'              => '0911222333',
            'target_role'        => 'technician',
            'telegram_chat_id'   => '-100555666',
            'telegram_thread_id' => '101',
            'telegram_user_id'   => '1110001',
            'connect_token'      => 'ktv_lookup_1_' . uniqid(),
            'is_active'          => true,
        ]);

        $customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Lê Hoàng Nam',
            'phone'     => '0933444555',
        ]);

        $order = RepairOrder::create([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branch1->id,
            'order_code'          => 'PC0104112699',
            'customer_id'         => $customer->id,
            'device_model_id'     => $this->deviceModel->id,
            'serial_number'       => 'SN-998877',
            'accessories'         => 'Đủ bộ L/R/Case',
            'issue_description'   => 'Thay pin 2 tai & vệ sinh',
            'test_note'           => 'Mic hoạt động tốt',
            'parts_needed'        => '2x Pin AirPods Pro 2',
            'status'              => 'in_repair',
            'technician_id'       => $this->tech1->id,
            'initial_price'       => 500000,
            'total_price'         => 850000,
            'additional_services' => [
                [
                    'id'    => 'srv-1',
                    'name'  => 'Thay thêm cáp cảm biến lực',
                    'price' => 350000,
                    'note'  => 'Khách đã đồng ý thay',
                ],
            ],
            'created_by_user_id'  => $this->admin->id,
        ]);

        $doneTodayOrder = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch1->id,
            'order_code'         => 'PC0104112688',
            'customer_id'        => $customer->id,
            'device_model_id'    => $this->deviceModel->id,
            'issue_description'  => 'Thay màng loa tai phải',
            'status'             => 'waiting_qc',
            'technician_id'      => $this->tech1->id,
            'initial_price'      => 990000,
            'total_price'        => 990000,
            'created_by_user_id' => $this->admin->id,
        ]);

        // Chế độ 1: Gõ lệnh /doncuatoi trong Topic 101
        $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 80001,
            'message'   => [
                'message_id'        => 901,
                'message_thread_id' => 101,
                'from'              => ['id' => 1110001],
                'chat'              => ['id' => -100555666, 'type' => 'supergroup'],
                'text'              => '/doncuatoi',
            ],
        ])->assertStatus(200);

        // Chế độ 2: Gõ lệnh /tracuu PC0104112699 trong Topic 101
        $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 80002,
            'message'   => [
                'message_id'        => 902,
                'message_thread_id' => 101,
                'from'              => ['id' => 1110001],
                'chat'              => ['id' => -100555666, 'type' => 'supergroup'],
                'text'              => '/tracuu PC0104112699',
            ],
        ])->assertStatus(200);

        $sentMessages = [];
        Http::assertSent(function ($request) use (&$sentMessages) {
            if (str_contains($request->url(), '/sendMessage')) {
                $sentMessages[] = $request->data();
                return true;
            }
            return false;
        });

        $this->assertCount(2, $sentMessages);

        // Kiểm tra tin nhắn 1 (/doncuatoi): hiển thị cả đơn đang sửa (#PC0104112699) và đơn đã sửa xong hôm nay (#PC0104112688)
        $listText = $sentMessages[0]['text'];
        $this->assertStringContainsString('ĐƠN CỦA KTV KTV Hùng', $listText);
        $this->assertStringContainsString('Đang xử lý: <b>1 đơn</b> | Đã xong hôm nay: <b>1 đơn</b>', $listText);
        $this->assertStringContainsString('#PC0104112699', $listText);
        $this->assertStringContainsString('#PC0104112688', $listText);
        $this->assertStringContainsString('Đang sửa', $listText);
        $this->assertStringContainsString('Chờ QC', $listText);
        $this->assertStringContainsString('Lê Hoàng Nam', $listText);
        $this->assertStringContainsString('0933444555', $listText);
        $this->assertStringNotContainsString('850.000', $listText);
        $this->assertStringNotContainsString('500.000', $listText);
        $this->assertStringNotContainsString('350.000', $listText);
        $this->assertStringNotContainsString('990.000', $listText);
        $this->assertStringNotContainsString('990000', $listText);
        $inlineCallbacks = collect(data_get($sentMessages[0], 'reply_markup.inline_keyboard', []))
            ->flatten(1)
            ->pluck('callback_data')
            ->all();
        $this->assertContains("tech_view_order:{$order->id}", $inlineCallbacks);
        $this->assertContains("tech_view_order:{$doneTodayOrder->id}", $inlineCallbacks);

        // Kiểm tra tin nhắn 2 (/tracuu PC0104112699)
        $detailText = $sentMessages[1]['text'];
        $this->assertStringContainsString('CHI TIẾT ĐƠN KỸ THUẬT #PC0104112699', $detailText);
        $this->assertStringContainsString('Đang sửa', $detailText);
        $this->assertStringContainsString('Lê Hoàng Nam', $detailText);
        $this->assertStringContainsString('0933444555', $detailText);
        $this->assertStringContainsString('Thay pin 2 tai &amp; vệ sinh', $detailText);
        $this->assertStringContainsString('Mic hoạt động tốt', $detailText);
        $this->assertStringContainsString('2x Pin AirPods Pro 2', $detailText);
        $this->assertStringContainsString('Thay thêm cáp cảm biến lực', $detailText);
        $this->assertStringContainsString('Khách đã đồng ý thay', $detailText);
        // Cam kết ẩn 100% giá đơn hàng và giá dịch vụ bổ sung
        $this->assertStringNotContainsString('850.000', $detailText);
        $this->assertStringNotContainsString('850000', $detailText);
        $this->assertStringNotContainsString('500.000', $detailText);
        $this->assertStringNotContainsString('350.000', $detailText);
        $this->assertStringNotContainsString('350000', $detailText);
    }

    /**
     * 8. Khóa bảo mật chống KTV mạo danh SĐT Admin, chống chiếm quyền token đã kích hoạt, chống gộp chung chat 1-1 Admin-KTV và ẩn 100% giá trên LookupOrderTool.
     */
    public function test_security_prevents_ktv_impersonating_admin_phone_or_hijacking_admin_chat_and_redacts_lookup_order_prices(): void
    {
        Http::fake([
            'api.telegram.org/*/sendMessage*' => Http::response(['ok' => true], 200),
        ]);

        // 8.1: Không cho phép tạo kết nối KTV bằng SĐT của Admin
        $conflictRes = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/v1/telegram-recipients', [
                'label'       => 'KTV giả mạo SĐT Admin',
                'phone'       => $this->admin->phone,
                'target_role' => 'technician',
                'user_id'     => $this->tech1->id,
                'branch_id'   => $this->branch1->id,
            ]);
        $conflictRes->assertStatus(422);

        // 8.2: Khi Admin đã kết nối với chat_id 9990001, một chat_id khác (8880002) gửi /start adm_... bị chặn chiếm quyền
        $adminRecipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenant->id,
            'branch_id'         => $this->branch1->id,
            'label'             => 'Admin Chủ Shop',
            'phone'             => $this->admin->phone,
            'target_role'       => 'admin',
            'connect_token'     => 'adm_locked_owner_token',
            'telegram_chat_id'  => '9990001',
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);

        $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 90001,
            'message'   => [
                'message_id' => 1001,
                'from'       => ['id' => 8880002],
                'chat'       => ['id' => 8880002, 'type' => 'private'],
                'text'       => '/start adm_locked_owner_token',
            ],
        ])->assertStatus(200);

        $adminRecipient->refresh();
        $this->assertEquals('9990001', $adminRecipient->telegram_chat_id);

        // 8.3: Không cho phép kích hoạt mã ktv_... đè lên cùng đoạn hội thoại 1-1 cá nhân (9990001, không có Topic) của Admin
        $pendingKtv = TelegramRecipient::create([
            'tenant_id'         => $this->tenant->id,
            'branch_id'         => $this->branch1->id,
            'user_id'           => $this->tech1->id,
            'label'             => 'KTV Hùng Riêng',
            'phone'             => $this->tech1->phone,
            'target_role'       => 'technician',
            'connect_token'     => 'ktv_separate_device_token',
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
        ]);

        $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 90002,
            'message'   => [
                'message_id' => 1002,
                'from'       => ['id' => 9990001],
                'chat'       => ['id' => 9990001, 'type' => 'private'],
                'text'       => '/start ktv_separate_device_token',
            ],
        ])->assertStatus(200);

        $pendingKtv->refresh();
        $this->assertNull($pendingKtv->telegram_chat_id);

        // Khi KTV Hùng mở trên thiết bị/tài khoản Telegram riêng (chat_id 7770001) -> Kết nối 1-1 độc lập thành công!
        $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 90003,
            'message'   => [
                'message_id' => 1003,
                'from'       => ['id' => 7770001],
                'chat'       => ['id' => 7770001, 'type' => 'private'],
                'text'       => '/start ktv_separate_device_token',
            ],
        ])->assertStatus(200);

        $pendingKtv->refresh();
        $this->assertEquals('7770001', $pendingKtv->telegram_chat_id);

        // 8.4: Khi KTV tra cứu qua LookupOrderTool, toàn bộ giá đơn và giá dịch vụ bổ sung bị ẩn 100%
        $customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Trần Quốc Tuấn',
            'phone'     => '0944555666',
        ]);

        RepairOrder::create([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branch1->id,
            'order_code'          => 'PC0105112601',
            'customer_id'         => $customer->id,
            'device_model_id'     => $this->deviceModel->id,
            'issue_description'   => 'Thay pin 2 tai AirPods Pro 2',
            'status'              => 'in_repair',
            'technician_id'       => $this->tech1->id,
            'initial_price'       => 650000,
            'total_price'         => 950000,
            'additional_services' => [
                ['name' => 'Vệ sinh lưới loa', 'price' => 300000],
            ],
            'created_by_user_id'  => $this->admin->id,
        ]);

        $lookupTool = new \App\Services\TelegramAi\Tools\LookupOrderTool();
        $techResult = $lookupTool->execute(['order_code' => 'PC0105112601'], $pendingKtv);
        $this->assertTrue($techResult['financial_fields_redacted']);
        $this->assertNull($techResult['orders'][0]['total_price']);
        $this->assertNull($techResult['orders'][0]['formatted_price']);
        $this->assertStringNotContainsString('300.000', $techResult['orders'][0]['quote_items_summary']);

        $techHtml = $lookupTool->formatHtml($techResult);
        $this->assertStringNotContainsString('950.000', $techHtml);
        $this->assertStringNotContainsString('300.000', $techHtml);
        $this->assertStringNotContainsString('Chi phí:', $techHtml);
    }
}
