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
use App\Services\TelegramAi\TelegramAiAssistantService;
use App\Services\TelegramAi\TelegramAiMemoryService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class TelegramAiMemoryServiceTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected User $technician;
    protected TelegramRecipient $adminRecipient;
    protected TelegramAiMemoryService $memoryService;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();

        Config::set('services.telegram.bot_token', 'test_bot_token_phase5');
        Config::set('services.telegram.bot_username', 'PodsCareNotifyBot');
        Config::set('services.telegram.webhook_secret', '');
        Config::set('services.gemini.base_url', 'http://127.0.0.1:20128/v1');
        Config::set('services.gemini.api_key', '9router-local');
        Config::set('services.gemini.model', 'podscare-ai');
        Config::set('services.gemini.fallback_models', '');
        Config::set('services.gemini.timeout', 20);
        Config::set('services.gemini.summarize_with_ai', false);

        $this->tenant = Tenant::create([
            'name'   => 'PodsCare Memory Tenant',
            'code'   => 'tenant-p5-mem-' . uniqid(),
            'status' => 'active',
        ]);

        $this->branch = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'CN-Q1-M' . rand(100, 999),
            'address'   => '100 Nguyễn Huệ, Quận 1',
            'phone'     => '0901222333',
            'is_active' => true,
        ]);

        $this->technician = User::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'KTV Hoàng',
            'email'     => 'ktv.hoang.' . uniqid() . '@podscare.vn',
            'password'  => bcrypt('password123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->adminRecipient = TelegramRecipient::create([
            'tenant_id'              => $this->tenant->id,
            'branch_id'              => $this->branch->id,
            'label'                  => 'Anh Bảo Admin',
            'phone'                  => '0862389728',
            'target_role'            => 'admin',
            'telegram_chat_id'       => '8841956555',
            'connect_token'          => 'adm_phase5_mem_' . uniqid(),
            'subscribed_events'      => ['order.created'],
            'is_active'              => true,
            'connected_at'           => now(),
            'ai_message_count'       => 0,
            'ai_context_summary'     => null,
            'ai_recent_messages'     => null,
            'ai_last_interaction_at' => null,
        ]);

        $this->memoryService = $this->app->make(TelegramAiMemoryService::class);
    }

    /**
     * 1. Kiểm tra schema bảng telegram_recipients đã có đầy đủ 4 cột trí nhớ hội thoại AI
     *    và lưu trữ tối đa 5 lượt hội thoại gần nhất (ai_recent_messages),
     *    chỉ giữ câu hỏi & mã thực thể, TUYỆT ĐỐI KHÔNG lưu số tiền/doanh thu/tồn kho/công nợ tĩnh.
     */
    public function test_rolling_memory_keeps_max_5_recent_messages_and_strictly_strips_all_static_monetary_stock_and_debt_numbers(): void
    {
        $this->assertTrue(Schema::hasColumn('telegram_recipients', 'ai_message_count'));
        $this->assertTrue(Schema::hasColumn('telegram_recipients', 'ai_context_summary'));
        $this->assertTrue(Schema::hasColumn('telegram_recipients', 'ai_recent_messages'));
        $this->assertTrue(Schema::hasColumn('telegram_recipients', 'ai_last_interaction_at'));

        // Ghi nhận 7 lượt tương tác liên tiếp chứa nhiều trường số tiền/doanh thu/tồn kho/công nợ nhạy cảm
        for ($i = 1; $i <= 7; $i++) {
            $orderCode = "RO-MEM-00{$i}";
            $customerName = "Khách Hàng Số {$i}";
            $customerPhone = "090900011{$i}";
            $warrantyCode = "BH-MEM-00{$i}";

            $this->memoryService->recordInteraction(
                $this->adminRecipient,
                "Tra cứu đơn {$orderCode} của {$customerName}",
                [
                    [
                        'name'   => 'lookup_repair_orders',
                        'args'   => ['order_code' => $orderCode],
                        'result' => [
                            'branch_name' => 'Chi nhánh Quận 1',
                            'orders'      => [
                                [
                                    'order_code'      => $orderCode,
                                    'customer_name'   => $customerName,
                                    'customer_phone'  => $customerPhone,
                                    'device_name'     => "AirPods Pro Gen {$i}",
                                    'device_category' => 'AirPods',
                                    'technician_name' => 'KTV Hoàng',
                                    'total_price'     => 450000 * $i,
                                    'formatted_price' => number_format(450000 * $i, 0, ',', '.') . ' đ',
                                ],
                            ],
                        ],
                    ],
                    [
                        'name'   => 'get_revenue_summary',
                        'args'   => ['period' => 'today'],
                        'result' => [
                            'estimated_order_revenue'           => 12500000,
                            'formatted_estimated_order_revenue' => '12.500.000 đ',
                            'net_payment_collected'             => 9800000,
                            'formatted_net_payment_collected'   => '9.800.000 đ',
                        ],
                    ],
                    [
                        'name'   => 'check_inventory_parts',
                        'args'   => ['keyword' => 'Vỏ thép đen'],
                        'result' => [
                            'parts' => [
                                [
                                    'sku'                    => "SKU-STEEL-0{$i}",
                                    'name'                   => 'Vỏ thép đen 45mm',
                                    'stock_quantity'         => 18,
                                    'total_stock_quantity'   => 25,
                                    'retail_price'           => 650000,
                                    'formatted_retail_price' => '650.000 đ',
                                    'cost_price'             => 320000,
                                ],
                            ],
                        ],
                    ],
                    [
                        'name'   => 'lookup_warranties',
                        'args'   => ['order_code' => $orderCode],
                        'result' => [
                            'warranties' => [
                                [
                                    'warranty_code'  => $warrantyCode,
                                    'order_code'     => $orderCode,
                                    'customer_name'  => $customerName,
                                    'customer_phone' => $customerPhone,
                                ],
                            ],
                        ],
                    ],
                    [
                        'name'   => 'fallback_schema_query',
                        'args'   => ['entity' => 'suppliers'],
                        'result' => [
                            'entity' => 'suppliers',
                            'items'  => [
                                [
                                    'name'           => "NCC Linh Kiện Sài Gòn {$i}",
                                    'debt_balance'   => 45000000,
                                    'total_debt'     => 45000000,
                                    'formatted_debt' => '45.000.000 đ',
                                ],
                            ],
                        ],
                    ],
                ]
            );
        }

        $this->adminRecipient->refresh();

        $this->assertSame(7, $this->adminRecipient->ai_message_count);
        $this->assertNotNull($this->adminRecipient->ai_last_interaction_at);

        $recentMessages = $this->adminRecipient->ai_recent_messages;
        $this->assertIsArray($recentMessages);
        // Chỉ giữ tối đa 5 lượt hội thoại gần nhất (lượt 3 -> lượt 7)
        $this->assertCount(TelegramAiMemoryService::RECENT_MESSAGES_LIMIT, $recentMessages);
        $this->assertSame('Tra cứu đơn RO-MEM-003 của Khách Hàng Số 3', $recentMessages[0]['question']);
        $this->assertSame('Tra cứu đơn RO-MEM-007 của Khách Hàng Số 7', $recentMessages[4]['question']);

        // Kiểm tra lượt mới nhất lưu đúng các mã thực thể
        $lastEntities = $recentMessages[4]['entities'];
        $this->assertSame('RO-MEM-007', $lastEntities['order_code']);
        $this->assertSame('Khách Hàng Số 7', $lastEntities['customer_name']);
        $this->assertSame('0909000117', $lastEntities['customer_phone']);
        $this->assertSame('AirPods Pro Gen 7', $lastEntities['device_name']);
        $this->assertSame('BH-MEM-007', $lastEntities['warranty_code']);
        $this->assertSame('SKU-STEEL-07', $lastEntities['sku']);
        $this->assertSame('Vỏ thép đen 45mm', $lastEntities['part_name']);
        $this->assertSame('NCC Linh Kiện Sài Gòn 7', $lastEntities['supplier_name']);
        $this->assertSame('Chi nhánh Quận 1', $lastEntities['branch_name']);

        // TUYỆT ĐỐI KHÔNG chứa bất kỳ trường số tiền/doanh thu/tồn kho/công nợ nào
        $serializedMemory = json_encode($recentMessages, JSON_UNESCAPED_UNICODE);
        $this->assertNotFalse($serializedMemory);
        $this->assertStringNotContainsString('total_price', $serializedMemory);
        $this->assertStringNotContainsString('formatted_price', $serializedMemory);
        $this->assertStringNotContainsString('estimated_order_revenue', $serializedMemory);
        $this->assertStringNotContainsString('net_payment_collected', $serializedMemory);
        $this->assertStringNotContainsString('stock_quantity', $serializedMemory);
        $this->assertStringNotContainsString('retail_price', $serializedMemory);
        $this->assertStringNotContainsString('cost_price', $serializedMemory);
        $this->assertStringNotContainsString('debt_balance', $serializedMemory);
        $this->assertStringNotContainsString('12.500.000', $serializedMemory);
        $this->assertStringNotContainsString('12500000', $serializedMemory);
        $this->assertStringNotContainsString('45.000.000', $serializedMemory);
        $this->assertStringNotContainsString('650.000', $serializedMemory);

        // Kiểm tra khối prompt được kết xuất chứa mã thực thể và chỉ thị bắt buộc cấm dùng số liệu cũ
        $promptSection = $this->memoryService->formatMemoryPromptSection($this->adminRecipient);
        $this->assertStringContainsString('RO-MEM-007', $promptSection);
        $this->assertStringContainsString('Khách Hàng Số 7', $promptSection);
        $this->assertStringContainsString('0909000117', $promptSection);
        $this->assertStringNotContainsString('RO-MEM-001', $promptSection);
        $this->assertStringNotContainsString('RO-MEM-002', $promptSection);
        $this->assertStringContainsString('TUYỆT ĐỐI KHÔNG dùng lại bất kỳ con số doanh thu/tồn kho/công nợ cũ nào mà PHẢI gọi Tool để lấy số liệu thực tế mới nhất từ Database', $promptSection);
    }

    /**
     * 2. Giải nghĩa đại từ chỉ định ở lượt hỏi kế tiếp:
     *    - Lượt 1: Hỏi "Ai thay vỏ thép đen ngày 18/10?" -> Tìm thấy đơn RO-STEEL-1810 của khách Anh Tuấn (0909123456), giá 850.000 đ.
     *    - Sau Lượt 1, cập nhật giá đơn RO-STEEL-1810 trong DB lên 950.000 đ để kiểm chứng AI thực sự gọi Tool lấy dữ liệu mới.
     *    - Lượt 2: Hỏi "Đơn đó của khách nào, bảo hành bao lâu?" và "Khách đó số điện thoại gì?" ->
     *      Hệ thống tự động gắn mã đơn RO-STEEL-1810 / thông tin khách từ trí nhớ ngắn hạn, gọi Tool lấy số liệu mới nhất từ DB.
     */
    public function test_follow_up_question_with_demonstrative_pronoun_resolves_entity_from_recent_memory_and_fetches_fresh_db_data(): void
    {
        $device = DeviceModel::withoutGlobalScopes()->create([
            'tenant_id'  => $this->tenant->id,
            'name'       => 'Apple Watch Series 8 45mm',
            'category'   => 'Apple Watch',
            'model_code' => 'AW-S8-45',
            'is_active'  => true,
        ]);

        $customer = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Anh Tuấn',
            'phone'     => '0909123456',
        ]);

        $orderDate = now()->setMonth(10)->setDay(18)->setTime(10, 30, 0);

        $order = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'technician_id'       => $this->technician->id,
            'created_by_user_id'  => $this->technician->id,
            'order_code'          => 'RO-STEEL-1810',
            'order_type'          => 'in_store',
            'status'              => 'completed',
            'issue_description'   => 'Trầy vỏ cũ, yêu cầu thay vỏ thép đen',
            'parts_used_summary'  => 'Vỏ thép đen 45mm',
            'total_price'         => 850000,
            'repair_completed_at' => $orderDate,
            'handed_over_at'      => $orderDate,
            'created_at'          => $orderDate,
            'updated_at'          => $orderDate,
        ]);

        Warranty::withoutGlobalScopes()->create([
            'repair_order_id' => $order->id,
            'customer_id'     => $customer->id,
            'device_model_id' => $device->id,
            'warranty_code'   => 'BH-STEEL-1810',
            'coverage_item'   => 'Bảo hành thay vỏ thép đen 45mm',
            'duration_days'   => 90,
            'start_date'      => now()->subDays(2)->toDateString(),
            'end_date'        => now()->addDays(88)->toDateString(),
            'status'          => 'active',
        ]);

        $routerCallIndex = 0;
        $capturedSystemPrompts = [];

        Http::fake(function ($request) use (&$routerCallIndex, &$capturedSystemPrompts) {
            if (str_contains($request->url(), '/v1/chat/completions')) {
                $routerCallIndex++;
                $body = $request->data();
                $messages = $body['messages'] ?? [];
                foreach ($messages as $m) {
                    if (($m['role'] ?? '') === 'system') {
                        $capturedSystemPrompts[$routerCallIndex] = (string) ($m['content'] ?? '');
                    }
                }

                // Lượt 1 - Turn 1: AI gọi lookup_repair_orders cho câu "Ai thay vỏ thép đen ngày 18/10?"
                if ($routerCallIndex === 1) {
                    return Http::response([
                        'id'      => 'chatcmpl-p5-turn1-step1',
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
                                            'id'       => 'call_steel_1',
                                            'type'     => 'function',
                                            'function' => [
                                                'name'      => 'lookup_repair_orders',
                                                'arguments' => json_encode([
                                                    'keyword'   => 'thay vỏ thép đen',
                                                    'date_from' => '18/10',
                                                    'date_to'   => '18/10',
                                                ], JSON_UNESCAPED_UNICODE),
                                            ],
                                        ],
                                    ],
                                ],
                                'finish_reason' => 'tool_calls',
                            ],
                        ],
                    ], 200);
                }

                // Lượt 1 - Turn 2 (Synthesis): vì câu hỏi có "Ai thay"
                if ($routerCallIndex === 2) {
                    return Http::response([
                        'id'      => 'chatcmpl-p5-turn1-step2',
                        'object'  => 'chat.completion',
                        'model'   => 'podscare-ai',
                        'choices' => [
                            [
                                'index'   => 0,
                                'message' => [
                                    'role'    => 'assistant',
                                    'content' => "<b>KTV Hoàng</b> đã thay vỏ thép đen cho đơn <code>RO-STEEL-1810</code> của khách <b>Anh Tuấn</b> với chi phí 850.000 đ.",
                                ],
                            ],
                        ],
                    ], 200);
                }

                // Lượt 2: Người dùng hỏi nối tiếp "Đơn đó của khách nào, bảo hành bao lâu?"
                // Giả lập LLM gọi 2 Tool lookup_repair_orders và lookup_warranties nhưng KHÔNG truyền order_code (để kiểm tra cơ chế tự động giải nghĩa đại từ "Đơn đó" từ trí nhớ)
                if ($routerCallIndex === 3) {
                    return Http::response([
                        'id'      => 'chatcmpl-p5-turn2-step1',
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
                                            'id'       => 'call_followup_order',
                                            'type'     => 'function',
                                            'function' => [
                                                'name'      => 'lookup_repair_orders',
                                                'arguments' => json_encode(['keyword' => 'đơn đó của khách nào'], JSON_UNESCAPED_UNICODE),
                                            ],
                                        ],
                                        [
                                            'id'       => 'call_followup_warranty',
                                            'type'     => 'function',
                                            'function' => [
                                                'name'      => 'lookup_warranties',
                                                'arguments' => json_encode([], JSON_UNESCAPED_UNICODE),
                                            ],
                                        ],
                                    ],
                                ],
                                'finish_reason' => 'tool_calls',
                            ],
                        ],
                    ], 200);
                }

                // Lượt 2 - Turn 2 Synthesis: trả về rỗng để hệ thống dùng Instant HTML Fallback từ kết quả thật của 2 Tool vừa chạy
                if ($routerCallIndex === 4) {
                    return Http::response([
                        'id'      => 'chatcmpl-p5-turn2-step2',
                        'object'  => 'chat.completion',
                        'model'   => 'podscare-ai',
                        'choices' => [
                            [
                                'index'   => 0,
                                'message' => [
                                    'role'    => 'assistant',
                                    'content' => '',
                                ],
                            ],
                        ],
                    ], 200);
                }

                // Lượt 3: Người dùng hỏi tiếp "Khách đó số điện thoại gì?" -> LLM gọi lookup_repair_orders với args rỗng
                if ($routerCallIndex === 5) {
                    return Http::response([
                        'id'      => 'chatcmpl-p5-turn3-step1',
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
                                            'id'       => 'call_followup_customer_phone',
                                            'type'     => 'function',
                                            'function' => [
                                                'name'      => 'lookup_repair_orders',
                                                'arguments' => json_encode([], JSON_UNESCAPED_UNICODE),
                                            ],
                                        ],
                                    ],
                                ],
                                'finish_reason' => 'tool_calls',
                            ],
                        ],
                    ], 200);
                }
            }

            return Http::response(['ok' => true], 200);
        });

        // Thực thi Lượt 1: "Ai thay vỏ thép đen ngày 18/10?"
        $resTurn1 = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 95001,
            'message'   => [
                'message_id' => 501,
                'chat'       => ['id' => 8841956555, 'type' => 'private'],
                'text'       => 'Ai thay vỏ thép đen ngày 18/10?',
            ],
        ]);

        $resTurn1->assertStatus(200)->assertJsonPath('data.handled', true);

        $this->adminRecipient->refresh();
        $this->assertSame(1, $this->adminRecipient->ai_message_count);
        $this->assertCount(1, $this->adminRecipient->ai_recent_messages);
        $this->assertSame('RO-STEEL-1810', $this->adminRecipient->ai_recent_messages[0]['entities']['order_code']);
        $this->assertSame('Anh Tuấn', $this->adminRecipient->ai_recent_messages[0]['entities']['customer_name']);

        // Cập nhật giá đơn RO-STEEL-1810 trong DB từ 850.000 đ lên 950.000 đ trước khi hỏi Lượt 2
        $order->update(['total_price' => 950000]);

        // Thực thi Lượt 2: "Đơn đó của khách nào, bảo hành bao lâu?"
        $resTurn2 = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 95002,
            'message'   => [
                'message_id' => 502,
                'chat'       => ['id' => 8841956555, 'type' => 'private'],
                'text'       => 'Đơn đó của khách nào, bảo hành bao lâu?',
            ],
        ]);

        $resTurn2->assertStatus(200)->assertJsonPath('data.handled', true);

        // Kiểm tra System Prompt ở Lượt 2 đã chứa ngữ cảnh thực thể RO-STEEL-1810 từ Lượt 1
        $this->assertArrayHasKey(3, $capturedSystemPrompts);
        $this->assertStringContainsString('RO-STEEL-1810', $capturedSystemPrompts[3]);
        $this->assertStringContainsString('Anh Tuấn', $capturedSystemPrompts[3]);

        // Thực thi Lượt 3: "Khách đó số điện thoại gì?"
        $resTurn3 = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 95003,
            'message'   => [
                'message_id' => 503,
                'chat'       => ['id' => 8841956555, 'type' => 'private'],
                'text'       => 'Khách đó số điện thoại gì?',
            ],
        ]);

        $resTurn3->assertStatus(200)->assertJsonPath('data.handled', true);

        // Kiểm tra các tin nhắn gửi về Telegram ở Lượt 2 và Lượt 3 chứa dữ liệu mới nhất từ DB (950.000 đ, BH-STEEL-1810, 0909123456)
        $telegramReplies = [];
        Http::assertSent(function ($request) use (&$telegramReplies) {
            if (str_contains($request->url(), '/sendMessage') && (string) $request['chat_id'] === '8841956555') {
                $telegramReplies[] = (string) $request['text'];
                return true;
            }
            return false;
        });

        $this->assertCount(3, $telegramReplies);
        // Phản hồi Lượt 2 có cả mã đơn RO-STEEL-1810, khách Anh Tuấn, số tiền mới 950.000 đ và mã bảo hành BH-STEEL-1810
        $this->assertStringContainsString('RO-STEEL-1810', $telegramReplies[1]);
        $this->assertStringContainsString('Anh Tuấn', $telegramReplies[1]);
        $this->assertStringContainsString('950.000 đ', $telegramReplies[1]);
        $this->assertStringContainsString('BH-STEEL-1810', $telegramReplies[1]);

        // Phản hồi Lượt 3 có SĐT khách 0909123456
        $this->assertStringContainsString('0909123456', $telegramReplies[2]);
    }

    /**
     * 3. Kiểm tra cơ chế hết hạn phiên sau 30 phút không tương tác:
     *    - Khi ai_last_interaction_at đã quá 30 phút, isSessionExpired() = true.
     *    - getActiveRecentMessages() trả về mảng rỗng, không dùng lại thực thể cũ cho đại từ "Đơn đó".
     *    - Khi có tin nhắn mới, danh sách ai_recent_messages cũ được làm mới hoàn toàn.
     */
    public function test_session_expires_after_30_minutes_of_inactivity_and_ignores_stale_recent_messages(): void
    {
        $this->adminRecipient->update([
            'ai_message_count'       => 4,
            'ai_last_interaction_at' => now()->subMinutes(31),
            'ai_recent_messages'     => [
                [
                    'at'           => now()->subMinutes(31)->format('H:i d/m/Y'),
                    'question'     => 'Đơn RO-EXPIRED-999 của ai?',
                    'tools_called' => ['lookup_repair_orders'],
                    'entities'     => [
                        'order_code'     => 'RO-EXPIRED-999',
                        'customer_name'  => 'Khách Phiên Cũ',
                        'customer_phone' => '0900999888',
                    ],
                ],
            ],
        ]);

        $this->adminRecipient->refresh();

        $this->assertTrue($this->memoryService->isSessionExpired($this->adminRecipient));
        $this->assertSame([], $this->memoryService->getActiveRecentMessages($this->adminRecipient));

        // Prompt không được chứa thực thể của phiên đã quá hạn 30 phút
        $promptSection = $this->memoryService->formatMemoryPromptSection($this->adminRecipient);
        $this->assertStringNotContainsString('RO-EXPIRED-999', $promptSection);
        $this->assertStringNotContainsString('Khách Phiên Cũ', $promptSection);

        // Giải nghĩa đại từ "Đơn đó" không được lấy mã đơn RO-EXPIRED-999 của phiên đã hết hạn
        $resolvedArgs = $this->memoryService->resolveToolArgsWithMemory(
            'lookup_repair_orders',
            [],
            'Đơn đó của khách nào?',
            $this->adminRecipient
        );
        $this->assertArrayNotHasKey('order_code', $resolvedArgs);

        // Khi ghi nhận tương tác mới, ai_recent_messages cũ bị xóa bỏ và chỉ chứa lượt mới
        $this->memoryService->recordInteraction(
            $this->adminRecipient,
            'Kiểm tra đơn RO-FRESH-101',
            [
                [
                    'name'   => 'lookup_repair_orders',
                    'args'   => ['order_code' => 'RO-FRESH-101'],
                    'result' => [
                        'orders' => [
                            [
                                'order_code'    => 'RO-FRESH-101',
                                'customer_name' => 'Khách Phiên Mới',
                            ],
                        ],
                    ],
                ],
            ]
        );

        $this->adminRecipient->refresh();
        $this->assertFalse($this->memoryService->isSessionExpired($this->adminRecipient));
        $this->assertCount(1, $this->adminRecipient->ai_recent_messages);
        $this->assertSame('RO-FRESH-101', $this->adminRecipient->ai_recent_messages[0]['entities']['order_code']);
        $this->assertSame(5, $this->adminRecipient->ai_message_count);
    }

    /**
     * 4. Kiểm tra cơ chế tự động tóm tắt mỗi 20 tin nhắn (20-Message Summary):
     *    - Khi ai_message_count chạm mốc 20, tự động tổng hợp ngữ cảnh thực thể vào ai_context_summary
     *      (không chứa số tiền/doanh thu/tồn kho tĩnh) và reset ai_message_count = 0.
     *    - Tin nhắn thứ 21 tiếp tục đếm ai_message_count = 1 và nhúng ai_context_summary vào System Prompt.
     */
    public function test_reaching_20_messages_triggers_context_summary_persists_to_database_and_resets_counter_to_zero(): void
    {
        // Đặt bộ đếm ở mức 18 tin nhắn kèm lịch sử ngắn hạn
        $this->adminRecipient->update([
            'ai_message_count'       => 18,
            'ai_context_summary'     => null,
            'ai_last_interaction_at' => now()->subMinutes(5),
            'ai_recent_messages'     => [
                [
                    'at'           => now()->subMinutes(5)->format('H:i d/m/Y'),
                    'question'     => 'Kiểm tra đơn RO-18TH-MSG',
                    'tools_called' => ['lookup_repair_orders'],
                    'entities'     => [
                        'order_code'    => 'RO-18TH-MSG',
                        'customer_name' => 'Anh Minh',
                        'device_name'   => 'AirPods Pro 2',
                    ],
                ],
            ],
        ]);

        // Tin nhắn thứ 19
        $this->memoryService->recordInteraction(
            $this->adminRecipient,
            'Kiểm tra bảo hành đơn RO-19TH-MSG',
            [
                [
                    'name'   => 'lookup_warranties',
                    'args'   => ['order_code' => 'RO-19TH-MSG'],
                    'result' => [
                        'warranties' => [
                            [
                                'warranty_code'  => 'BH-19TH-MSG',
                                'order_code'     => 'RO-19TH-MSG',
                                'customer_name'  => 'Chị Hương',
                                'customer_phone' => '0988777666',
                                'device_name'    => 'Apple Watch Ultra',
                            ],
                        ],
                    ],
                ],
            ]
        );

        $this->adminRecipient->refresh();
        $this->assertSame(19, $this->adminRecipient->ai_message_count);
        $this->assertNull($this->adminRecipient->ai_context_summary);

        // Tin nhắn thứ 20 (có kèm số tiền 1.500.000 đ trong kết quả Tool để kiểm tra bộ lọc chống lưu số tĩnh)
        $this->memoryService->recordInteraction(
            $this->adminRecipient,
            'Xem đơn RO-20TH-MSG của Chị Lan giá 1.500.000 đ',
            [
                [
                    'name'   => 'lookup_repair_orders',
                    'args'   => ['order_code' => 'RO-20TH-MSG'],
                    'result' => [
                        'branch_name' => 'Chi nhánh Quận 1',
                        'orders'      => [
                            [
                                'order_code'      => 'RO-20TH-MSG',
                                'customer_name'   => 'Chị Lan',
                                'customer_phone'  => '0912345678',
                                'device_name'     => 'AirPods Max',
                                'total_price'     => 1500000,
                                'formatted_price' => '1.500.000 đ',
                            ],
                        ],
                    ],
                ],
            ],
            'Đơn RO-20TH-MSG của Chị Lan tổng chi phí 1.500.000 đ, tồn kho còn 12 cái.'
        );

        $this->adminRecipient->refresh();

        // Chạm mốc 20 tin nhắn -> ai_message_count phải reset về 0 và ai_context_summary được lưu vào DB
        $this->assertSame(0, $this->adminRecipient->ai_message_count);
        $this->assertNotNull($this->adminRecipient->ai_context_summary);
        $this->assertNotEmpty($this->adminRecipient->ai_context_summary);

        $summary = (string) $this->adminRecipient->ai_context_summary;
        $this->assertStringContainsString('Chi nhánh Quận 1', $summary);
        $this->assertStringContainsString('RO-20TH-MSG', $summary);
        $this->assertStringContainsString('Chị Lan', $summary);
        $this->assertStringContainsString('0912345678', $summary);
        $this->assertStringContainsString('BH-19TH-MSG', $summary);
        // Bản tóm tắt tuyệt đối không chứa số tiền tĩnh 1.500.000 đ hay số lượng tồn kho "còn 12 cái"
        $this->assertStringNotContainsString('1.500.000', $summary);
        $this->assertStringNotContainsString('1500000', $summary);
        $this->assertStringNotContainsString('12 cái', $summary);

        // Kiểm tra System Instruction của TelegramAiAssistantService nhúng cả ai_context_summary
        /** @var TelegramAiAssistantService $assistant */
        $assistant = $this->app->make(TelegramAiAssistantService::class);
        $systemInstruction = $assistant->buildSystemInstruction($this->adminRecipient);

        $this->assertStringContainsString('NGỮ CẢNH HỘI THOẠI & TRÍ NHỚ THỰC THỂ:', $systemInstruction);
        $this->assertStringContainsString('Tóm tắt ngữ cảnh tích lũy (20 tin nhắn trước):', $systemInstruction);
        $this->assertStringContainsString('RO-20TH-MSG', $systemInstruction);
    }

    /**
     * 5. Giai đoạn 2 (Task 2.4) - Kiểm thử khóa dòng lockForUpdate() trong DB::transaction() của recordInteraction()
     *    và đảm bảo Turn 2 Synthesis luôn nhận đầy đủ trường formatted_html từ kết quả formatHtml() của Tool.
     */
    public function test_phase2_record_interaction_uses_row_lock_transaction_and_turn_2_receives_formatted_html(): void
    {
        // 1. Theo dõi các câu lệnh SQL thực thi trong recordInteraction để xác nhận FOR UPDATE row lock
        $executedSqlQueries = [];
        \Illuminate\Support\Facades\DB::listen(function ($query) use (&$executedSqlQueries) {
            $executedSqlQueries[] = $query->sql;
        });

        // Giả lập hai instance cùng trỏ tới một bản ghi TelegramRecipient để kiểm chứng tránh ghi đè dữ liệu cũ
        $staleInstanceA = TelegramRecipient::withoutGlobalScopes()->findOrFail($this->adminRecipient->id);
        $staleInstanceB = TelegramRecipient::withoutGlobalScopes()->findOrFail($this->adminRecipient->id);

        $this->memoryService->recordInteraction(
            $staleInstanceA,
            'Kiểm tra đơn thông qua instance A',
            [
                [
                    'name'           => 'lookup_repair_orders',
                    'args'           => [],
                    'result'         => [],
                    'formatted_html' => '<b>Đơn hàng</b>: <code>PCAP20102601</code> - Bảo hành <code>BH-20102601</code>',
                ],
            ]
        );

        // Instance B vẫn đang giữ ai_message_count = 0 trên RAM, nhưng khi gọi recordInteraction sẽ đọc bản ghi thật với lockForUpdate()
        $this->memoryService->recordInteraction(
            $staleInstanceB,
            'Kiểm tra đơn thông qua instance B',
            [
                [
                    'name'           => 'lookup_repair_orders',
                    'args'           => [],
                    'result'         => [],
                    'formatted_html' => '<b>Đơn hàng</b>: <code>PCAW20102602</code>',
                ],
            ]
        );

        // Xác nhận có câu lệnh SELECT ... FOR UPDATE trên bảng telegram_recipients
        $hasForUpdateLock = collect($executedSqlQueries)->contains(function (string $sql): bool {
            return str_contains(strtolower($sql), 'telegram_recipients')
                && str_contains(strtolower($sql), 'for update');
        });
        $this->assertTrue($hasForUpdateLock, 'recordInteraction() phải sử dụng lockForUpdate() trên bảng telegram_recipients');

        // Xác nhận bộ đếm không bị ghi đè mất lượt của instance A (tổng phải bằng 2 và giữ cả 2 lượt trong ai_recent_messages)
        $this->adminRecipient->refresh();
        $this->assertSame(2, $this->adminRecipient->ai_message_count);
        $this->assertSame(2, $staleInstanceB->ai_message_count);
        $this->assertCount(2, $this->adminRecipient->ai_recent_messages);
        $this->assertSame('PCAP20102601', $this->adminRecipient->ai_recent_messages[0]['entities']['order_code'] ?? null);
        $this->assertSame('BH-20102601', $this->adminRecipient->ai_recent_messages[0]['entities']['warranty_code'] ?? null);
        $this->assertSame('PCAW20102602', $this->adminRecipient->ai_recent_messages[1]['entities']['order_code'] ?? null);

        // 2. Kiểm tra Turn 2 Synthesis nhận được trường formatted_html trong mảng executedTools
        $routerPayloads = [];
        Http::fake(function ($request) use (&$routerPayloads) {
            if (str_contains($request->url(), '/v1/chat/completions')) {
                $body = $request->data();
                $routerPayloads[] = $body;

                if (count($routerPayloads) === 1) {
                    return Http::response([
                        'choices' => [
                            [
                                'message' => [
                                    'role'       => 'assistant',
                                    'content'    => null,
                                    'tool_calls' => [
                                        [
                                            'id'       => 'call_fmt_html_1',
                                            'type'     => 'function',
                                            'function' => [
                                                'name'      => 'get_revenue_summary',
                                                'arguments' => json_encode([
                                                    'period'   => 'today',
                                                    'group_by' => 'device_category',
                                                ]),
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ], 200);
                }

                return Http::response([
                    'choices' => [
                        [
                            'message' => [
                                'role'    => 'assistant',
                                'content' => '<b>Báo cáo so sánh doanh thu hôm nay</b>',
                            ],
                        ],
                    ],
                ], 200);
            }

            return Http::response(['ok' => true], 200);
        });

        /** @var TelegramAiAssistantService $assistant */
        $assistant = $this->app->make(TelegramAiAssistantService::class);
        $handled = $assistant->handleIncomingMessage(
            $this->adminRecipient,
            'Doanh thu của AirPods và Apple Watch hôm nay cái nào cao hơn?'
        );

        $this->assertTrue($handled);
        $this->assertCount(2, $routerPayloads);

        $turn2UserMessage = (string) ($routerPayloads[1]['messages'][1]['content'] ?? '');
        $this->assertStringContainsString('Bản trình bày chuẩn từ hệ thống:', $turn2UserMessage);
        $this->assertStringContainsString('<b>Báo cáo doanh thu', $turn2UserMessage);
    }
}

