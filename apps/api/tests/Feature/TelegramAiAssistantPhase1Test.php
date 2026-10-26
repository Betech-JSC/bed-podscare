<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\TelegramRecipient;
use App\Models\Tenant;
use App\Services\TelegramAi\Contracts\TelegramAiToolInterface;
use App\Services\TelegramAi\TelegramAiToolRegistry;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class TelegramAiAssistantPhase1Test extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Branch $branchA1;
    protected TelegramRecipient $activeRecipient;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();

        Config::set('services.telegram.bot_token', 'test_bot_token_phase1');
        Config::set('services.telegram.bot_username', 'PodsCareNotifyBot');
        Config::set('services.telegram.webhook_secret', '');
        Config::set('services.gemini.base_url', 'http://127.0.0.1:20128/v1');
        Config::set('services.gemini.api_key', '9router-local');
        Config::set('services.gemini.model', 'podscare-ai');
        Config::set('services.gemini.fallback_models', '');
        Config::set('services.gemini.timeout', 20);

        $this->tenantA = Tenant::where('code', 'fixo-master')->first() ?? Tenant::create([
            'name'   => 'Cửa hàng Phase 1',
            'code'   => 'tenant-p1-' . uniqid(),
            'status' => 'active',
        ]);

        $this->branchA1 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Trung Tâm',
            'code'      => 'CN-TT-' . rand(100, 999),
            'address'   => '100 Lê Lợi, Q1',
            'phone'     => '0901112222',
            'is_active' => true,
        ]);

        $this->activeRecipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => $this->branchA1->id,
            'label'             => 'Anh Bảo Admin',
            'phone'             => '0862389728',
            'target_role'       => 'admin',
            'telegram_chat_id'  => '8841956211',
            'connect_token'     => 'adm_phase1_active_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);
    }

    /**
     * 1. Tin nhắn từ chat_id chưa kích hoạt hoặc is_active = false bị từ chối truy cập AI
     *    và chỉ nhận thông báo hướng dẫn kích hoạt.
     */
    public function test_unregistered_or_inactive_chat_id_is_rejected_and_does_not_call_gemini(): void
    {
        Http::fake([
            'api.telegram.org/*' => Http::response(['ok' => true], 200),
            '*127.0.0.1:20128/*' => Http::response([], 200),
        ]);

        // Trường hợp A: chat_id hoàn toàn lạ (chưa liên kết)
        $resStranger = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 90001,
            'message'   => [
                'message_id' => 101,
                'chat'       => ['id' => 99999999, 'type' => 'private'],
                'text'       => 'Doanh thu hôm nay của shop là bao nhiêu?',
            ],
        ]);

        $resStranger->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', false);

        // Trường hợp B: chat_id đã liên kết nhưng bị tắt (is_active = false)
        TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'label'             => 'Admin Đã Khóa',
            'phone'             => '0909000111',
            'target_role'       => 'admin',
            'telegram_chat_id'  => '77777777',
            'connect_token'     => 'adm_phase1_inactive_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => false,
            'connected_at'      => now(),
        ]);

        $resInactive = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 90002,
            'message'   => [
                'message_id' => 102,
                'chat'       => ['id' => 77777777, 'type' => 'private'],
                'text'       => 'Cho xem danh sách đơn sửa chữa hôm nay',
            ],
        ]);

        $resInactive->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', false);

        // Tuyệt đối không có request nào gọi tới cổng 9Router AI
        Http::assertNotSent(function ($request) {
            return str_contains($request->url(), '127.0.0.1:20128');
        });

        // Cả 2 đều nhận thông báo hướng dẫn kích hoạt
        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === '99999999'
                && str_contains($request['text'], 'Tài khoản Telegram chưa được kích hoạt');
        });
    }

    /**
     * 2. Tin nhắn từ chat_id đã kích hoạt (is_active = true) gọi 9Router API và trả lời về Telegram
     *    với định dạng HTML sạch hoàn toàn, tự động lọc sạch emoji và thẻ HTML lạ.
     */
    public function test_active_recipient_message_calls_gemini_and_returns_sanitized_html_without_emojis(): void
    {
        Http::fake([
            'api.telegram.org/*' => Http::response(['ok' => true], 200),
            '*127.0.0.1:20128/v1/chat/completions' => Http::response([
                'id'      => 'chatcmpl-p1-002',
                'object'  => 'chat.completion',
                'model'   => 'podscare-ai',
                'choices' => [
                    [
                        'index'   => 0,
                        'message' => [
                            'role'    => 'assistant',
                            'content' => "<p>Xin chào <b>Anh Bảo Admin</b>! 🚀✨</p><br/>Hệ thống <i>Trợ lý AI</i> của <code>{$this->tenantA->name}</code> đã sẵn sàng hỗ trợ. ✅📊",
                        ],
                    ],
                ],
            ], 200),
        ]);

        $response = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 90003,
            'message'   => [
                'message_id' => 103,
                'chat'       => ['id' => 8841956211, 'type' => 'private'],
                'text'       => 'Xin chào trợ lý AI',
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', true)
            ->assertJsonPath('data.recipient_id', $this->activeRecipient->id);

        $sentText = null;
        Http::assertSent(function ($request) use (&$sentText) {
            if (str_contains($request->url(), '/sendMessage') && (string) $request['chat_id'] === '8841956211') {
                $sentText = (string) $request['text'];
                return true;
            }
            return false;
        });

        $this->assertNotNull($sentText);
        $this->assertStringContainsString('<b>Anh Bảo Admin</b>', $sentText);
        $this->assertStringContainsString('<i>Trợ lý AI</i>', $sentText);
        // Không còn thẻ <p> hoặc <br/> và không còn bất kỳ emoji nào
        $this->assertStringNotContainsString('<p>', $sentText);
        $this->assertStringNotContainsString('<br/>', $sentText);
        $this->assertStringNotContainsString('🚀', $sentText);
        $this->assertStringNotContainsString('✨', $sentText);
        $this->assertStringNotContainsString('✅', $sentText);
        $this->assertStringNotContainsString('📊', $sentText);
    }

    /**
     * 3. Cơ chế Auto-Fallback Combo qua 9Router: Khi combo chính (podscare-ai) trả về HTTP 503 hoặc 429,
     *    GeminiFunctionCallingClient tự động chuyển sang combo dự phòng (podscare-backup) và trả lời thành công.
     */
    public function test_auto_fallback_switches_to_secondary_model_when_primary_returns_503_or_429(): void
    {
        Config::set('services.gemini.model', 'podscare-ai');
        Config::set('services.gemini.fallback_models', 'podscare-backup');

        $calledCombos = [];

        Http::fake(function ($request) use (&$calledCombos) {
            if (str_contains($request->url(), '127.0.0.1:20128/v1/chat/completions')) {
                $body = $request->data();
                $combo = (string) ($body['model'] ?? '');
                $calledCombos[] = $combo;

                if ($combo === 'podscare-ai') {
                    return Http::response([
                        'error' => [
                            'code'    => 503,
                            'message' => 'The combo is overloaded. Please try again later.',
                            'status'  => 'UNAVAILABLE',
                        ],
                    ], 503);
                }

                return Http::response([
                    'id'      => 'chatcmpl-p1-003',
                    'object'  => 'chat.completion',
                    'model'   => 'podscare-backup',
                    'choices' => [
                        [
                            'index'   => 0,
                            'message' => [
                                'role'    => 'assistant',
                                'content' => "<b>Phản hồi từ model dự phòng</b>\nHệ thống hoạt động bình thường.",
                            ],
                        ],
                    ],
                ], 200);
            }

            return Http::response(['ok' => true], 200);
        });

        $response = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 90004,
            'message'   => [
                'message_id' => 104,
                'chat'       => ['id' => 8841956211, 'type' => 'private'],
                'text'       => 'Kiểm tra kết nối AI dự phòng',
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.handled', true);

        // Xác nhận cả combo chính và combo dự phòng đều được gọi theo đúng thứ tự
        $this->assertSame(['podscare-ai', 'podscare-backup'], $calledCombos);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === '8841956211'
                && str_contains($request['text'], '<b>Phản hồi từ model dự phòng</b>');
        });
    }

    /**
     * 4. Cơ chế Modular Tool Registry 2 bước (2-Step Flow):
     *    - Bước 1: Gemini phân tích câu hỏi và trả về functionCall (chỉ gọi Gemini đúng 1 lần duy nhất)
     *    - Bước 2: Tool độc lập trong TelegramAiToolRegistry được gọi với đúng $args và $recipient (tenant_id/branch_id),
     *      sau đó Backend tự định dạng kết quả HTML tiếng Việt gửi thẳng về Telegram mà không gọi lại Gemini lần 2.
     */
    public function test_two_step_modular_tool_execution_flow_passes_tenant_context_and_formats_html_directly(): void
    {
        $capturedContext = [];

        $mockTool = new class($capturedContext) implements TelegramAiToolInterface {
            private array $captured;

            public function __construct(array &$captured)
            {
                $this->captured = &$captured;
            }

            public function name(): string
            {
                return 'mock_store_ping';
            }

            public function description(): string
            {
                return 'Tool kiểm tra kết nối nội bộ cửa hàng.';
            }

            public function parametersSchema(): array
            {
                return [
                    'type'       => 'OBJECT',
                    'properties' => [
                        'keyword' => [
                            'type'        => 'STRING',
                            'description' => 'Từ khóa kiểm tra',
                        ],
                    ],
                ];
            }

            public function execute(array $args, TelegramRecipient $recipient): array
            {
                $this->captured = [
                    'args'      => $args,
                    'tenant_id' => $recipient->tenant_id,
                    'branch_id' => $recipient->branch_id,
                ];

                return [
                    'status'       => 'connected',
                    'tenant_id'    => $recipient->tenant_id,
                    'echo_keyword' => strtoupper(trim((string) ($args['keyword'] ?? ''))),
                ];
            }
        };

        /** @var TelegramAiToolRegistry $registry */
        $registry = $this->app->make(TelegramAiToolRegistry::class);
        $registry->register($mockTool);

        $geminiCallCount = 0;

        Http::fake(function ($request) use (&$geminiCallCount) {
            if (str_contains($request->url(), '127.0.0.1:20128/v1/chat/completions')) {
                $geminiCallCount++;
                return Http::response([
                    'id'      => 'chatcmpl-p1-004',
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
                                        'id'       => 'call_mock_ping_01',
                                        'type'     => 'function',
                                        'function' => [
                                            'name'      => 'mock_store_ping',
                                            'arguments' => json_encode(['keyword' => 'airpods_pro_2']),
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
            'update_id' => 90005,
            'message'   => [
                'message_id' => 105,
                'chat'       => ['id' => 8841956211, 'type' => 'private'],
                'text'       => 'Kiểm tra từ khóa airpods_pro_2',
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.handled', true);

        // Xác nhận 9Router chỉ được gọi đúng 1 lần cho câu tra cứu đơn giản
        $this->assertSame(1, $geminiCallCount);

        // Kiểm tra Tool độc lập đã nhận đúng tham số từ AI và đúng tenant_id/branch_id của người nhận
        $this->assertSame('airpods_pro_2', $capturedContext['args']['keyword'] ?? null);
        $this->assertSame($this->tenantA->id, $capturedContext['tenant_id'] ?? null);
        $this->assertSame($this->branchA1->id, $capturedContext['branch_id'] ?? null);

        // Kiểm tra câu trả lời được Backend format trực tiếp và gửi về Telegram
        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === '8841956211'
                && str_contains($request['text'], '<code>AIRPODS_PRO_2</code>');
        });
    }

    /**
     * 5. Kiểm tra sanitizeTelegramHtml lọc sạch chuỗi JSON thô {"..._response": ...} ở đầu văn bản
     *    và buildSystemInstruction hiển thị đúng tên chi nhánh (không hiển thị tên Tenant như FIXO Master System).
     */
    public function test_sanitize_telegram_html_strips_raw_json_response_and_system_instruction_uses_branch_name(): void
    {
        /** @var \App\Services\TelegramAi\TelegramAiAssistantService $assistant */
        $assistant = $this->app->make(\App\Services\TelegramAi\TelegramAiAssistantService::class);

        $rawLeakedReply = '{"get_revenue_summary_response": {"content": {"branch_scope": "FIXO · Quận 1", "total_new_orders": 16}, "name": "get_revenue_summary"}}'
            . "\n<b>Báo cáo doanh thu tháng này</b>\nChi nhánh: <b>FIXO · Quận 1</b>\nTổng đơn mới: <code>16</code> đơn";

        $sanitized = $assistant->sanitizeTelegramHtml($rawLeakedReply);

        $this->assertStringNotContainsString('get_revenue_summary_response', $sanitized);
        $this->assertStringNotContainsString('"branch_scope"', $sanitized);
        $this->assertStringStartsWith('<b>Báo cáo doanh thu tháng này</b>', $sanitized);
        $this->assertStringContainsString('Chi nhánh: <b>FIXO · Quận 1</b>', $sanitized);

        $sysInstruction = $assistant->buildSystemInstruction($this->activeRecipient);
        $this->assertStringContainsString('- Chi nhánh quản lý: Chi nhánh Trung Tâm', $sysInstruction);
        $this->assertStringNotContainsString('- Cửa hàng (Tenant):', $sysInstruction);
        $this->assertSame('Chi nhánh Trung Tâm', \App\Services\TelegramAi\TelegramAiAssistantService::resolveBranchDisplay($this->activeRecipient));
    }

    /**
     * 6. Kiểm tra sanitizeTelegramHtml chuyển đổi chuỗi literal \n\n- thành ký tự xuống dòng thật
     *    và formatHtml của cả 4 tools trả về 100% văn bản tiếng Việt HTML sạch, 0% JSON và 0% tag kỹ thuật BE.
     */
    public function test_sanitize_converts_literal_newlines_and_formats_all_four_tools_in_vietnamese_without_json_or_raw_status(): void
    {
        /** @var \App\Services\TelegramAi\TelegramAiAssistantService $assistant */
        $assistant = $this->app->make(\App\Services\TelegramAi\TelegramAiAssistantService::class);

        $literalNewlineReply = 'Chào bbb,\n\nBáo cáo số đơn mới và doanh thu Tháng này (10/2026) tại <b>FIXO · Quận 1</b>:\n\n- Tổng số đơn mới: <b>5</b> đơn\n- Doanh thu ước tính: <b>2.185.000 đ</b>';
        $sanitized = $assistant->sanitizeTelegramHtml($literalNewlineReply);

        $this->assertStringNotContainsString('\n', $sanitized);
        $this->assertStringContainsString("Chào bbb,\n\nBáo cáo số đơn mới", $sanitized);
        $this->assertStringContainsString("\n\n- Tổng số đơn mới: <b>5</b> đơn\n- Doanh thu ước tính: <b>2.185.000 đ</b>", $sanitized);

        // Kiểm tra định dạng HTML của cả 4 tools hoàn toàn không chứa '{' hoặc '}' của JSON và không chứa tag status BE
        $revHtml = $assistant->formatToolResultFallback('get_revenue_summary', [
            'period_label'                      => 'Hôm qua (17/10/2026)',
            'branch_scope'                      => 'FIXO · Quận 1',
            'total_new_orders'                  => 3,
            'in_store_orders'                   => 2,
            'cod_orders'                        => 1,
            'warranty_orders'                   => 0,
            'completed_orders'                  => 2,
            'formatted_estimated_order_revenue' => '1.350.000 đ',
            'formatted_net_payment_collected'   => '900.000 đ',
            'formatted_cashbook_income'         => '900.000 đ',
            'formatted_cashbook_expense'        => '150.000 đ',
            'formatted_net_cashflow'            => '750.000 đ',
        ]);
        $this->assertStringContainsString('<b>Báo cáo doanh thu - Hôm qua (17/10/2026)</b>', $revHtml);
        $this->assertStringContainsString('Chi nhánh: <b>FIXO · Quận 1</b>', $revHtml);
        $this->assertStringNotContainsString('{', $revHtml);
        $this->assertStringNotContainsString('}', $revHtml);

        $orderHtml = $assistant->formatToolResultFallback('lookup_repair_orders', [
            'branch_scope'  => 'FIXO · Quận 1',
            'total_matched' => 1,
            'orders'        => [
                [
                    'order_code'        => 'PCQ118102601',
                    'branch_name'       => 'FIXO · Quận 1',
                    'order_type_label'  => 'Khách tại cửa hàng',
                    'customer_name'     => 'Nguyễn Văn A',
                    'customer_phone'    => '0901234567',
                    'device_name'       => 'AirPods Pro 2',
                    'issue_description' => 'Mất kết nối tai phải',
                    'status'            => 'waiting_tech',
                    'formatted_price'   => '450.000 đ',
                    'created_at'        => '10:30 - 18/10/2026',
                ],
            ],
        ]);
        $this->assertStringContainsString('<b>Kết quả tra cứu đơn sửa chữa</b>', $orderHtml);
        $this->assertStringContainsString('<code>PCQ118102601</code>', $orderHtml);
        $this->assertStringContainsString('<b>Đang đợi kỹ thuật viên tiếp nhận</b>', $orderHtml);
        $this->assertStringNotContainsString('waiting_tech', $orderHtml);
        $this->assertStringNotContainsString('{', $orderHtml);
        $this->assertStringNotContainsString('}', $orderHtml);

        $invHtml = $assistant->formatToolResultFallback('check_inventory_parts', [
            'branch_scope'  => 'FIXO · Quận 1',
            'total_matched' => 1,
            'parts'         => [
                [
                    'name'                   => 'Pin AirPods Pro 2',
                    'sku'                    => 'PIN-APP2',
                    'stock_quantity'         => 12,
                    'unit'                   => 'viên',
                    'formatted_retail_price' => '350.000 đ',
                    'storage_location'       => 'Kệ A1',
                    'min_stock_alert'        => 5,
                ],
            ],
        ]);
        $this->assertStringContainsString('<b>Kết quả kiểm tra tồn kho linh kiện</b>', $invHtml);
        $this->assertStringContainsString('Pin AirPods Pro 2', $invHtml);
        $this->assertStringNotContainsString('{', $invHtml);
        $this->assertStringNotContainsString('}', $invHtml);

        $warHtml = $assistant->formatToolResultFallback('lookup_warranties', [
            'branch_scope'  => 'FIXO · Quận 1',
            'total_matched' => 1,
            'warranties'    => [
                [
                    'warranty_code'  => 'BH-PCQ118102601',
                    'order_code'     => 'PCQ118102601',
                    'branch_name'    => 'FIXO · Quận 1',
                    'customer_name'  => 'Nguyễn Văn A',
                    'customer_phone' => '0901234567',
                    'device_name'    => 'AirPods Pro 2',
                    'start_date'     => '18/10/2026',
                    'end_date'       => '18/01/2027',
                    'status'         => 'active',
                    'is_valid_now'   => true,
                    'days_remaining' => 92,
                    'claims_count'   => 0,
                ],
            ],
        ]);
        $this->assertStringContainsString('<b>Kết quả tra cứu bảo hành</b>', $warHtml);
        $this->assertStringContainsString('<code>BH-PCQ118102601</code>', $warHtml);
        $this->assertStringContainsString('<b>Đang còn hạn bảo hành (còn 92 ngày)</b>', $warHtml);
        $this->assertStringNotContainsString('{', $warHtml);
        $this->assertStringNotContainsString('}', $warHtml);
    }

    /**
     * 7. Kiểm tra chế độ 9Router (Zero Hardcoded Models & OpenAI-compatible /v1/chat/completions):
     *    - Tự động nối /v1/chat/completions khi GEMINI_BASE_URL=http://127.0.0.1:20128
     *    - Chuyển đổi functionDeclarations sang chuẩn OpenAI tools (type: "function", parameters.type: "object")
     *    - Tự động fallback từ combo-primary (HTTP 429) sang combo-backup (HTTP 200)
     *    - Bóc tách choices.0.message.tool_calls, chạy RevenueSummaryTool và gửi thẳng báo cáo HTML tiếng Việt về Telegram
     *    - Xác nhận resolveModelChain() không chứa bất kỳ model gemini-* gán cứng nào và đọc tự động combo & API key từ db.json của 9Router
     */
    public function test_9router_openai_compatible_base_url_executes_tool_calls_and_supports_fallback(): void
    {
        Config::set('services.gemini.base_url', 'http://127.0.0.1:20128');
        Config::set('services.gemini.api_key', '');
        Config::set('services.gemini.model', 'combo-primary');
        Config::set('services.gemini.fallback_models', 'combo-backup');

        $routerPayloads = [];
        $routerAuthHeaders = [];

        Http::fake(function ($request) use (&$routerPayloads, &$routerAuthHeaders) {
            if (str_contains($request->url(), '127.0.0.1:20128/v1/chat/completions')) {
                $body = $request->data();
                $routerPayloads[] = $body;
                $routerAuthHeaders[] = $request->header('Authorization');

                if (($body['model'] ?? '') === 'combo-primary') {
                    return Http::response([
                        'error' => [
                            'message' => 'All accounts in combo-primary are rate-limited',
                            'type'    => 'rate_limit_error',
                        ],
                    ], 429);
                }

                return Http::response([
                    'id'      => 'chatcmpl-9router-001',
                    'object'  => 'chat.completion',
                    'model'   => 'combo-backup',
                    'choices' => [
                        [
                            'index'   => 0,
                            'message' => [
                                'role'       => 'assistant',
                                'content'    => null,
                                'tool_calls' => [
                                    [
                                        'id'       => 'call_rev_today_01',
                                        'type'     => 'function',
                                        'function' => [
                                            'name'      => 'get_revenue_summary',
                                            'arguments' => '{"period":"today"}',
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
            'update_id' => 90007,
            'message'   => [
                'message_id' => 107,
                'chat'       => ['id' => 8841956211, 'type' => 'private'],
                'text'       => 'Báo cáo doanh thu hôm nay qua 9Router',
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', true);

        // Xác nhận 9Router được gọi đúng 2 lần (lần 1: combo-primary 429, lần 2: combo-backup 200) và không gọi lại lần 3
        $this->assertCount(2, $routerPayloads);
        $this->assertSame('combo-primary', $routerPayloads[0]['model'] ?? null);
        $this->assertSame('combo-backup', $routerPayloads[1]['model'] ?? null);
        // Không gắn header Authorization giả 'Bearer 9router-local' khi gọi local 9Router không có key
        $this->assertEmpty($routerAuthHeaders[0]);
        $this->assertEmpty($routerAuthHeaders[1]);

        // Xác nhận schema tools gửi sang 9Router theo đúng chuẩn OpenAI (type: function, parameters.type: object chữ thường)
        $firstTool = $routerPayloads[0]['tools'][0] ?? [];
        $this->assertSame('function', $firstTool['type'] ?? null);
        $this->assertSame('object', $firstTool['function']['parameters']['type'] ?? null);

        // Xác nhận báo cáo HTML tiếng Việt được gửi thẳng về Telegram
        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === '8841956211'
                && str_contains($request['text'], '<b>Báo cáo doanh thu - Hôm nay')
                && str_contains($request['text'], 'Chi nhánh: <b>Chi nhánh Trung Tâm</b>');
        });

        // Kiểm tra cấu hình mặc định của GeminiFunctionCallingClient trỏ về 9Router (Zero Hardcoded Models)
        Config::set('services.gemini.base_url', 'http://127.0.0.1:20128/v1');
        Config::set('services.gemini.api_key', '');
        Config::set('services.gemini.model', '');
        Config::set('services.gemini.fallback_models', '');
        Config::set('services.gemini.nine_router_db_path', '');

        $client = new \App\Services\TelegramAi\GeminiFunctionCallingClient();
        $this->assertSame('http://127.0.0.1:20128/v1', $client->resolveBaseUrl());
        $this->assertSame('9router-local', $client->resolveApiKey());
        $defaultChain = $client->resolveModelChain();
        $this->assertSame(['podscare-ai'], $defaultChain);
        foreach ($defaultChain as $modelItem) {
            $this->assertStringNotContainsString('gemini-', $modelItem);
        }

        // Kiểm tra đọc cả API key và danh sách combos từ db.json của 9Router
        $tmpDb = sys_get_temp_dir() . '/test_9router_db_podscare_v2.json';
        file_put_contents($tmpDb, json_encode([
            'apiKeys' => [
                ['id' => 'k1', 'name' => 'PodsCare VPS', 'key' => 'sk_9router_real_disk_key'],
            ],
            'combos' => [
                ['id' => 'c1', 'name' => 'podscare-ai'],
                ['id' => 'c2', 'alias' => 'podscare-backup-combo'],
                'podscare-analytics',
            ],
        ]));

        $this->assertSame('sk_9router_real_disk_key', $client->resolveNineRouterApiKeyFromDisk([$tmpDb]));
        $this->assertSame(
            ['podscare-ai', 'podscare-backup-combo', 'podscare-analytics'],
            $client->resolveNineRouterCombosFromDisk([$tmpDb])
        );

        Config::set('services.gemini.nine_router_db_path', $tmpDb);
        $this->assertSame('sk_9router_real_disk_key', $client->resolveApiKey());
        $this->assertSame(
            ['podscare-ai', 'podscare-backup-combo', 'podscare-analytics'],
            $client->resolveModelChain()
        );
        Config::set('services.gemini.nine_router_db_path', '');
    }

    /**
     * 8. Kiểm thử E2E Luồng 2 Bước (2-Turn AI Synthesis) cho câu hỏi:
     *    "Doanh thu của AirPods và Apple Watch cái nào cao hơn?"
     *    - Tự động bổ sung group_by = 'device_category' ngay cả khi Turn 1 quên truyền group_by
     *    - Gọi Turn 2 Synthesis qua 9Router với bảng breakdown thực tế và trả lời trực diện bằng HTML tiếng Việt sạch
     */
    public function test_two_turn_ai_synthesis_compares_airpods_and_apple_watch_revenue_and_auto_enriches_group_by(): void
    {
        \Carbon\Carbon::setTestNow(\Carbon\Carbon::create(2026, 10, 19, 14, 0, 0));

        $staffA = \App\Models\User::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'Admin Test A',
            'email'     => 'admin.test.a.' . uniqid() . '@podscare.vn',
            'phone'     => '0911000111',
            'password'  => 'password123',
            'is_active' => true,
        ]);

        $customer = \App\Models\Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Khách So Sánh Doanh Thu',
            'phone'     => '0905556677',
        ]);

        $airpodsModel = \App\Models\DeviceModel::create([
            'name'         => 'AirPods Pro 2 USB-C',
            'category'     => 'airpods',
            'model_code'   => 'A3048-SYN-' . rand(100, 999),
            'release_year' => 2023,
            'manufacturer' => 'Apple',
            'has_anc'      => true,
            'is_active'    => true,
        ]);

        $watchModel = \App\Models\DeviceModel::create([
            'name'         => 'Apple Watch Series 8 45mm',
            'category'     => 'apple_watch',
            'model_code'   => 'A2771-SYN-' . rand(100, 999),
            'release_year' => 2022,
            'manufacturer' => 'Apple',
            'has_anc'      => false,
            'is_active'    => true,
        ]);

        $orderAirpods = \App\Models\RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCAP19102601',
            'customer_id'        => $customer->id,
            'device_model_id'    => $airpodsModel->id,
            'issue_description'  => 'Thay pin AirPods Pro 2',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 450000,
            'initial_price'      => 450000,
            'created_by_user_id' => $staffA->id,
            'technician_id'      => $staffA->id,
            'created_at'         => now(),
        ]);

        \App\Models\Payment::withoutGlobalScopes()->create([
            'payment_code'        => 'PAY-AP-' . rand(1000, 9999),
            'repair_order_id'     => $orderAirpods->id,
            'amount'              => 450000,
            'refund_amount'       => 0,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $staffA->id,
        ]);

        $orderWatch = \App\Models\RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCAW19102602',
            'customer_id'        => $customer->id,
            'device_model_id'    => $watchModel->id,
            'issue_description'  => 'Thay vỏ thép đen Apple Watch',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 1200000,
            'initial_price'      => 1200000,
            'created_by_user_id' => $staffA->id,
            'technician_id'      => $staffA->id,
            'created_at'         => now(),
        ]);

        \App\Models\Payment::withoutGlobalScopes()->create([
            'payment_code'        => 'PAY-AW-' . rand(1000, 9999),
            'repair_order_id'     => $orderWatch->id,
            'amount'              => 1200000,
            'refund_amount'       => 0,
            'payment_method'      => 'bank_transfer',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $staffA->id,
        ]);

        $routerPayloads = [];

        Http::fake(function ($request) use (&$routerPayloads) {
            if (str_contains($request->url(), '/v1/chat/completions')) {
                $body = $request->data();
                $routerPayloads[] = $body;

                // Turn 1: AI gọi get_revenue_summary nhưng quên truyền group_by
                if (count($routerPayloads) === 1) {
                    return Http::response([
                        'choices' => [
                            [
                                'message' => [
                                    'role'       => 'assistant',
                                    'content'    => null,
                                    'tool_calls' => [
                                        [
                                            'id'       => 'call_rev_compare_1',
                                            'type'     => 'function',
                                            'function' => [
                                                'name'      => 'get_revenue_summary',
                                                'arguments' => json_encode([
                                                    'period'          => 'this_month',
                                                    'device_category' => 'AirPods',
                                                ]),
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ], 200);
                }

                // Turn 2: AI nhận kết quả breakdown và tổng hợp câu trả lời so sánh trực diện
                return Http::response([
                    'choices' => [
                        [
                            'message' => [
                                'role'    => 'assistant',
                                'content' => "<b>So sánh doanh thu tại Chi nhánh Trung Tâm</b>\n- <b>Apple Watch</b> đạt thực thu <b>1.200.000 đ</b> (chiếm <b>72.7%</b>), cao hơn <b>AirPods</b> (<b>450.000 đ</b>, chiếm <b>27.3%</b>) là <b>750.000 đ</b>.",
                            ],
                        ],
                    ],
                ], 200);
            }

            return Http::response(['ok' => true], 200);
        });

        $response = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 90008,
            'message'   => [
                'message_id' => 108,
                'chat'       => ['id' => 8841956211, 'type' => 'private'],
                'text'       => 'Doanh thu của AirPods và Apple Watch cái nào cao hơn?',
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', true);

        // Xác nhận 9Router được gọi đúng 2 lần (Turn 1 Tool Call + Turn 2 AI Synthesis)
        $this->assertCount(2, $routerPayloads);

        // Xác nhận Turn 2 nhận được dữ liệu breakdown có cả Apple Watch và AirPods nhờ cơ chế auto-enrich group_by = device_category
        $turn2UserMessage = (string) ($routerPayloads[1]['messages'][1]['content'] ?? '');
        $this->assertStringContainsString('"group_by":"device_category"', $turn2UserMessage);
        $this->assertStringContainsString('Apple Watch', $turn2UserMessage);
        $this->assertStringContainsString('AirPods', $turn2UserMessage);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === '8841956211'
                && str_contains($request['text'], '<b>Apple Watch</b> đạt thực thu <b>1.200.000 đ</b>')
                && str_contains($request['text'], 'cao hơn <b>AirPods</b>');
        });

        \Carbon\Carbon::setTestNow();
    }

    /**
     * 9. Kiểm thử E2E Luồng 2 Bước (2-Turn AI Synthesis) cho câu hỏi thực tế:
     *    "Ai thay vỏ thép đen ngày 18/10?"
     */
    public function test_two_turn_ai_synthesis_answers_who_replaced_black_steel_shell_on_18_10(): void
    {
        \Carbon\Carbon::setTestNow(\Carbon\Carbon::create(2026, 10, 19, 15, 0, 0));

        $staffA = \App\Models\User::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'Admin Test A',
            'email'     => 'admin.test.b.' . uniqid() . '@podscare.vn',
            'phone'     => '0911000222',
            'password'  => 'password123',
            'is_active' => true,
        ]);

        $techHoang = \App\Models\User::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'KTV Hoàng Nam',
            'email'     => 'ktv.hoang.e2e.' . uniqid() . '@podscare.vn',
            'phone'     => '0944111222',
            'password'  => 'password123',
            'is_active' => true,
        ]);

        $customer = \App\Models\Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Anh Minh Khách Watch',
            'phone'     => '0918889999',
        ]);

        $watchModel = \App\Models\DeviceModel::create([
            'name'         => 'Apple Watch Series 7 Thép 45mm',
            'category'     => 'apple_watch',
            'model_code'   => 'A2478-E2E-' . rand(100, 999),
            'release_year' => 2021,
            'manufacturer' => 'Apple',
            'has_anc'      => false,
            'is_active'    => true,
        ]);

        $order = \App\Models\RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCAW18102609',
            'customer_id'        => $customer->id,
            'device_model_id'    => $watchModel->id,
            'issue_description'  => 'Móp sườn máy, yêu cầu độ vỏ',
            'repair_note'        => 'Đã hoàn tất thay vỏ thép đen và ron chống nước',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 1250000,
            'initial_price'      => 1250000,
            'created_by_user_id' => $staffA->id,
            'technician_id'      => $techHoang->id,
        ]);
        $order->forceFill([
            'created_at' => \Carbon\Carbon::create(2026, 10, 18, 15, 30, 0),
        ])->save();

        $quote = \App\Models\RepairQuote::withoutGlobalScopes()->create([
            'repair_order_id' => $order->id,
            'quote_number'    => 1,
            'total_amount'    => 1250000,
            'status'          => 'approved',
            'note'            => 'Báo giá thay vỏ thép đen',
            'sent_by_user_id' => $staffA->id,
        ]);

        \App\Models\QuoteItem::create([
            'quote_id'    => $quote->id,
            'item_type'   => 'service',
            'description' => 'Thay vỏ thép đen Apple Watch S7 45mm',
            'quantity'    => 1,
            'unit_price'  => 1250000,
            'total_price' => 1250000,
        ]);

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
                                            'id'       => 'call_lookup_who_1',
                                            'type'     => 'function',
                                            'function' => [
                                                'name'      => 'lookup_repair_orders',
                                                'arguments' => json_encode([
                                                    'keyword'   => 'thay vỏ thép đen',
                                                    'date_from' => '18/10',
                                                    'date_to'   => '18/10',
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
                                'content' => "Đơn thay vỏ thép đen ngày 18/10/2026 là đơn <code>PCAW18102609</code> (Thiết bị: <b>Apple Watch Series 7 Thép 45mm</b> của khách <b>Anh Minh Khách Watch</b>).\n- Kỹ thuật viên trực tiếp thực hiện: <b>KTV Hoàng Nam</b>\n- Người tiếp nhận đơn: <b>Admin Test A</b>",
                            ],
                        ],
                    ],
                ], 200);
            }

            return Http::response(['ok' => true], 200);
        });

        $response = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 90009,
            'message'   => [
                'message_id' => 109,
                'chat'       => ['id' => 8841956211, 'type' => 'private'],
                'text'       => 'Ai thay vỏ thép đen ngày 18/10?',
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', true);

        $this->assertCount(2, $routerPayloads);

        $turn2UserMessage = (string) ($routerPayloads[1]['messages'][1]['content'] ?? '');
        $this->assertStringContainsString('PCAW18102609', $turn2UserMessage);
        $this->assertStringContainsString('KTV Hoàng Nam', $turn2UserMessage);
        $this->assertStringContainsString('Thay vỏ thép đen Apple Watch S7 45mm', $turn2UserMessage);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === '8841956211'
                && str_contains($request['text'], '<code>PCAW18102609</code>')
                && str_contains($request['text'], '<b>KTV Hoàng Nam</b>');
        });

        \Carbon\Carbon::setTestNow();
    }

    /**
     * 10. Kiểm thử cơ chế Instant HTML Fallback khi Turn 2 Synthesis gặp lỗi HTTP 503 hoặc trả về rỗng:
     *     Hệ thống tự động gửi bảng HTML chuẩn từ formatHtml() của Tool mà không làm gián đoạn trải nghiệm Admin.
     */
    public function test_instant_html_fallback_when_turn_2_synthesis_fails_or_returns_empty(): void
    {
        \Carbon\Carbon::setTestNow(\Carbon\Carbon::create(2026, 10, 19, 16, 0, 0));

        $routerCallCount = 0;

        Http::fake(function ($request) use (&$routerCallCount) {
            if (str_contains($request->url(), '/v1/chat/completions')) {
                $routerCallCount++;

                if ($routerCallCount === 1) {
                    return Http::response([
                        'choices' => [
                            [
                                'message' => [
                                    'role'       => 'assistant',
                                    'content'    => null,
                                    'tool_calls' => [
                                        [
                                            'id'       => 'call_fallback_test_1',
                                            'type'     => 'function',
                                            'function' => [
                                                'name'      => 'get_revenue_summary',
                                                'arguments' => json_encode([
                                                    'period'   => 'this_month',
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

                // Turn 2 trả lỗi 503 Service Unavailable
                return Http::response([
                    'error' => ['message' => 'Upstream provider timeout'],
                ], 503);
            }

            return Http::response(['ok' => true], 200);
        });

        $response = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 90010,
            'message'   => [
                'message_id' => 110,
                'chat'       => ['id' => 8841956211, 'type' => 'private'],
                'text'       => 'Doanh thu của AirPods và Apple Watch cái nào cao hơn?',
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', true);

        $this->assertSame(2, $routerCallCount);

        // Xác nhận kết quả vẫn gửi về Telegram thành công thông qua Instant HTML Fallback (RevenueSummaryTool::formatHtml)
        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === '8841956211'
                && str_contains($request['text'], '<b>Báo cáo doanh thu - Tháng này (10/2026)</b>')
                && str_contains($request['text'], 'Chi nhánh: <b>Chi nhánh Trung Tâm</b>');
        });

        \Carbon\Carbon::setTestNow();
    }

    /**
     * 11. Giai đoạn 2 - Kiểm thử Khóa chống lặp Webhook (Idempotency Lock):
     *     Gửi trùng update_id hoặc trùng cặp chat_id + message_id chỉ gọi 9Router và gửi tin nhắn Telegram đúng 1 lần duy nhất,
     *     các request lặp tiếp theo bị bỏ qua ngay với reason = duplicate_update_ignored.
     */
    public function test_webhook_idempotency_lock_ignores_duplicate_update_id_and_duplicate_chat_id_message_id(): void
    {
        $routerCallCount = 0;
        $telegramSendCount = 0;

        Http::fake(function ($request) use (&$routerCallCount, &$telegramSendCount) {
            if (str_contains($request->url(), '/v1/chat/completions')) {
                $routerCallCount++;

                return Http::response([
                    'id'      => 'chatcmpl-idemp-001',
                    'object'  => 'chat.completion',
                    'model'   => 'podscare-ai',
                    'choices' => [
                        [
                            'index'   => 0,
                            'message' => [
                                'role'    => 'assistant',
                                'content' => "<b>Phản hồi duy nhất</b>\nĐã xử lý yêu cầu của Admin.",
                            ],
                        ],
                    ],
                ], 200);
            }

            if (str_contains($request->url(), '/sendMessage')) {
                $telegramSendCount++;
            }

            return Http::response(['ok' => true], 200);
        });

        $payload = [
            'update_id' => 90011,
            'message'   => [
                'message_id' => 111,
                'chat'       => ['id' => 8841956211, 'type' => 'private'],
                'text'       => 'Kiểm tra chống lặp tin nhắn Telegram',
            ],
        ];

        // Lần 1: Xử lý bình thường
        $res1 = $this->postJson('/api/v1/webhooks/telegram', $payload);
        $res1->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', true)
            ->assertJsonPath('data.recipient_id', $this->activeRecipient->id);

        // Lần 2: Retry trùng update_id -> Bị chặn ngay lập tức
        $res2 = $this->postJson('/api/v1/webhooks/telegram', $payload);
        $res2->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', false)
            ->assertJsonPath('data.reason', 'duplicate_update_ignored');

        // Lần 3: Khác update_id (hoặc không có update_id) nhưng trùng cặp chat_id + message_id -> Cũng bị chặn ngay lập tức
        $res3 = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 90012,
            'message'   => [
                'message_id' => 111,
                'chat'       => ['id' => 8841956211, 'type' => 'private'],
                'text'       => 'Kiểm tra chống lặp tin nhắn Telegram',
            ],
        ]);
        $res3->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', false)
            ->assertJsonPath('data.reason', 'duplicate_update_ignored');

        // Kiểm tra gọi trực tiếp qua TelegramNotificationService::handleWebhookPayload và handleWebhookUpdate
        /** @var \App\Services\TelegramNotificationService $service */
        $service = $this->app->make(\App\Services\TelegramNotificationService::class);
        $directPayloadResult = $service->handleWebhookPayload($payload);
        $this->assertSame('duplicate_update_ignored', $directPayloadResult['reason'] ?? null);
        $this->assertNull($service->handleWebhookUpdate($payload));

        // Xác nhận 9Router và Telegram sendMessage chỉ được gọi đúng 1 lần duy nhất
        $this->assertSame(1, $routerCallCount);
        $this->assertSame(1, $telegramSendCount);
    }

    /**
     * 12. Giai đoạn 2 - Kiểm thử In-Memory Cache cho cấu hình .env và db.json của 9Router trong GeminiFunctionCallingClient:
     *     Trong một vòng đời xử lý gồm cả Bước 1 (generateWithTools) và Bước 2 (synthesizeToolResults),
     *     file db.json chỉ được đọc từ ổ đĩa đúng 1 lần duy nhất và có thể làm mới bằng flushConfigCache().
     */
    public function test_gemini_function_calling_client_caches_env_and_9router_disk_reads_in_memory_and_flushes_cleanly(): void
    {
        $tmpDb = sys_get_temp_dir() . '/test_9router_db_phase2_cache_' . uniqid() . '.json';
        file_put_contents($tmpDb, json_encode([
            'apiKeys' => [
                ['id' => 'k1', 'name' => 'Primary Key', 'key' => 'sk_9router_cached_key_v1'],
            ],
            'combos' => [
                ['id' => 'c1', 'name' => 'podscare-cached-combo-v1'],
            ],
        ]));

        Config::set('services.gemini.base_url', 'http://127.0.0.1:20128/v1');
        Config::set('services.gemini.api_key', '');
        Config::set('services.gemini.model', '');
        Config::set('services.gemini.fallback_models', '');
        Config::set('services.gemini.nine_router_db_path', $tmpDb);

        $capturedHeaders = [];
        $capturedModels = [];

        Http::fake(function ($request) use (&$capturedHeaders, &$capturedModels) {
            if (str_contains($request->url(), '/v1/chat/completions')) {
                $capturedHeaders[] = $request->header('Authorization');
                $body = $request->data();
                $capturedModels[] = $body['model'] ?? null;

                return Http::response([
                    'id'      => 'chatcmpl-cache-test',
                    'object'  => 'chat.completion',
                    'model'   => $body['model'] ?? 'podscare-cached-combo-v1',
                    'choices' => [
                        [
                            'index'   => 0,
                            'message' => [
                                'role'    => 'assistant',
                                'content' => '<b>Kết quả tổng hợp từ cache</b>',
                            ],
                        ],
                    ],
                ], 200);
            }

            return Http::response(['ok' => true], 200);
        });

        $client = new \App\Services\TelegramAi\GeminiFunctionCallingClient();

        // Bước 1: Gọi generateOrCallTools (Turn 1)
        $turn1 = $client->generateOrCallTools([
            ['role' => 'user', 'content' => 'Kiểm tra doanh thu hôm nay'],
        ]);
        $this->assertTrue($turn1['ok']);
        $this->assertSame(1, $client->getDiskReadCounts()['nine_router_db_reads']);

        // Ghi đè nội dung file trên đĩa sau Turn 1 (khi chưa gọi flushConfigCache, Turn 2 phải dùng dữ liệu từ RAM)
        file_put_contents($tmpDb, json_encode([
            'apiKeys' => [
                ['id' => 'k2', 'name' => 'Updated Key', 'key' => 'sk_9router_updated_key_v2'],
            ],
            'combos' => [
                ['id' => 'c2', 'name' => 'podscare-updated-combo-v2'],
            ],
        ]));

        // Bước 2: Gọi synthesizeToolResults (Turn 2)
        $turn2 = $client->synthesizeToolResults(
            'Kiểm tra doanh thu hôm nay',
            [
                [
                    'name'   => 'get_revenue_summary',
                    'result' => ['total_new_orders' => 5],
                ],
            ]
        );
        $this->assertTrue($turn2['ok']);

        // Số lần đọc file db.json trên đĩa vẫn giữ nguyên là 1 qua cả 2 bước
        $this->assertSame(1, $client->getDiskReadCounts()['nine_router_db_reads']);
        $this->assertSame(['Bearer sk_9router_cached_key_v1'], $capturedHeaders[0]);
        $this->assertSame(['Bearer sk_9router_cached_key_v1'], $capturedHeaders[1]);
        $this->assertSame('podscare-cached-combo-v1', $capturedModels[0]);
        $this->assertSame('podscare-cached-combo-v1', $capturedModels[1]);

        // Sau khi gọi flushConfigCache(), client đọc lại cấu hình mới từ đĩa
        $client->flushConfigCache();
        $this->assertSame(0, $client->getDiskReadCounts()['nine_router_db_reads']);
        $this->assertSame('sk_9router_updated_key_v2', $client->resolveApiKey());
        $this->assertContains('podscare-updated-combo-v2', $client->resolveModelChain());
        $this->assertSame(1, $client->getDiskReadCounts()['nine_router_db_reads']);

        Config::set('services.gemini.nine_router_db_path', '');
    }

    /**
     * 13. Giai đoạn 3 - Kiểm thử Auto-Discovery Tool Registry:
     *     - Tự động quét thư mục Tools mà không cần mảng cứng trong AppServiceProvider.
     *     - Đảm bảo 4 Tool cốt lõi luôn xếp đầu theo đúng thứ tự ưu tiên và fallback_schema_query luôn xếp cuối cùng.
     */
    public function test_tool_registry_auto_discovers_tools_from_directory_and_places_fallback_schema_query_last(): void
    {
        /** @var TelegramAiToolRegistry $registry */
        $registry = $this->app->make(TelegramAiToolRegistry::class);

        $registeredNames = array_keys($registry->all());

        // 5 Tool cốt lõi phải tự động được phát hiện và xếp đầu theo đúng thứ tự ưu tiên
        $this->assertGreaterThanOrEqual(5, count($registeredNames));
        $this->assertSame(
            [
                'lookup_repair_orders',
                'get_revenue_summary',
                'get_staff_kpi',
                'check_inventory_parts',
                'lookup_warranties',
            ],
            array_slice($registeredNames, 0, 5)
        );

        // Kiểm tra khi đăng ký fallback_schema_query trước một Tool chuyên biệt khác, fallback_schema_query vẫn luôn đứng cuối cùng
        $freshRegistry = (new TelegramAiToolRegistry())->discoverToolsFromDirectory();

        $mockFallbackTool = new class implements TelegramAiToolInterface {
            public function name(): string
            {
                return 'fallback_schema_query';
            }

            public function description(): string
            {
                return 'Tool dự phòng truy vấn đa thực thể.';
            }

            public function parametersSchema(): array
            {
                return ['type' => 'OBJECT', 'properties' => []];
            }

            public function execute(array $args, TelegramRecipient $recipient): array
            {
                return ['ok' => true];
            }
        };

        $mockSpecializedTool = new class implements TelegramAiToolInterface {
            public function name(): string
            {
                return 'check_branch_schedule';
            }

            public function description(): string
            {
                return 'Tool chuyên biệt kiểm tra lịch chi nhánh.';
            }

            public function parametersSchema(): array
            {
                return ['type' => 'OBJECT', 'properties' => []];
            }

            public function execute(array $args, TelegramRecipient $recipient): array
            {
                return ['ok' => true];
            }
        };

        // Cố tình đăng ký fallback_schema_query trước, sau đó mới đăng ký check_branch_schedule
        $freshRegistry->register($mockFallbackTool);
        $freshRegistry->register($mockSpecializedTool);

        $orderedKeys = array_keys($freshRegistry->all());
        $this->assertSame('fallback_schema_query', end($orderedKeys));
        $this->assertContains('check_branch_schedule', $orderedKeys);

        $declarationNames = array_column($freshRegistry->getFunctionDeclarations(), 'name');
        $this->assertSame('fallback_schema_query', end($declarationNames));
    }

    /**
     * 14. Giai đoạn 3 - Kiểm thử Phân quyền Tool theo Role (RBAC):
     *     - getFunctionDeclarations($recipient) ẩn get_revenue_summary đối với technician và receptionist, nhưng hiển thị đầy đủ với admin.
     *     - Nếu LLM cố tình trả về tool_call gọi get_revenue_summary cho technician, hệ thống chặn an toàn và trả về thông báo từ chối quyền.
     */
    public function test_tool_registry_filters_declarations_by_role_and_blocks_forced_unauthorized_tool_call(): void
    {
        $techRecipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => $this->branchA1->id,
            'label'             => 'KTV Minh Quân',
            'phone'             => '0908111222',
            'target_role'       => 'technician',
            'telegram_chat_id'  => '8841956901',
            'connect_token'     => 'tech_phase3_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);

        $receptionistRecipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => $this->branchA1->id,
            'label'             => 'Lễ Tân Thu Hà',
            'phone'             => '0908333444',
            'target_role'       => 'receptionist',
            'telegram_chat_id'  => '8841956902',
            'connect_token'     => 'rec_phase3_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);

        $superAdminRecipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => null,
            'label'             => 'Super Admin Hệ Thống',
            'phone'             => '0908999000',
            'target_role'       => 'super_admin',
            'telegram_chat_id'  => '8841956900',
            'connect_token'     => 'sadm_phase3_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);

        /** @var TelegramAiToolRegistry $registry */
        $registry = $this->app->make(TelegramAiToolRegistry::class);

        $revenueTool = $registry->get('get_revenue_summary');
        $this->assertNotNull($revenueTool);
        $this->assertSame(['admin', 'super_admin'], $revenueTool->allowedRoles());

        // Kiểm tra isToolAllowedForRecipient
        $this->assertTrue($registry->isToolAllowedForRecipient($revenueTool, $this->activeRecipient));
        $this->assertTrue($registry->isToolAllowedForRecipient($revenueTool, $superAdminRecipient));
        $this->assertFalse($registry->isToolAllowedForRecipient($revenueTool, $techRecipient));
        $this->assertFalse($registry->isToolAllowedForRecipient($revenueTool, $receptionistRecipient));

        // Kiểm tra getFunctionDeclarations($recipient)
        $adminDeclNames = array_column($registry->getFunctionDeclarations($this->activeRecipient), 'name');
        $superAdminDeclNames = array_column($registry->getFunctionDeclarations($superAdminRecipient), 'name');
        $techDeclNames = array_column($registry->getFunctionDeclarations($techRecipient), 'name');
        $receptionistDeclNames = array_column($registry->getFunctionDeclarations($receptionistRecipient), 'name');

        $this->assertContains('get_revenue_summary', $adminDeclNames);
        $this->assertContains('get_revenue_summary', $superAdminDeclNames);
        $this->assertNotContains('get_revenue_summary', $techDeclNames);
        $this->assertNotContains('get_revenue_summary', $receptionistDeclNames);

        // Các Tool tra cứu đơn, tồn kho, bảo hành vẫn được cấp cho technician và receptionist
        $this->assertContains('lookup_repair_orders', $techDeclNames);
        $this->assertContains('check_inventory_parts', $techDeclNames);
        $this->assertContains('lookup_warranties', $techDeclNames);

        // Giả lập kịch bản LLM cố tình trả về tool_call get_revenue_summary cho technician qua Webhook
        $capturedRouterTools = [];

        Http::fake(function ($request) use (&$capturedRouterTools) {
            if (str_contains($request->url(), '/v1/chat/completions')) {
                $body = $request->data();
                $capturedRouterTools = $body['tools'] ?? [];

                return Http::response([
                    'id'      => 'chatcmpl-rbac-tech-01',
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
                                        'id'       => 'call_forced_rev_01',
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
            'update_id' => 90030,
            'message'   => [
                'message_id' => 130,
                'chat'       => ['id' => 8841956901, 'type' => 'private'],
                'text'       => 'Cho xem doanh thu cửa hàng hôm nay',
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', true);

        // Xác nhận danh sách tools gửi sang 9Router không hề chứa get_revenue_summary
        $sentToolNames = array_map(
            static fn (array $t) => $t['function']['name'] ?? '',
            $capturedRouterTools
        );
        $this->assertNotContains('get_revenue_summary', $sentToolNames);

        // Xác nhận Telegram nhận được thông báo từ chối quyền lịch sự và không rò rỉ số liệu doanh thu
        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === '8841956901'
                && str_contains($request['text'], '<b>Từ chối quyền truy cập</b>')
                && str_contains($request['text'], 'Bạn không có quyền truy cập báo cáo doanh thu và sổ quỹ.');
        });
    }

    /**
     * 15. Giai đoạn 1 (Task 1.1) - Bảo mật liên kết Bot /start:
     *     - Gửi lệnh /start thuần hoặc /start@BotName (không kèm connect_token) TUYỆT ĐỐI KHÔNG tự động ghép nối vào bản ghi đang chờ kích hoạt.
     *     - Chỉ cho phép ghép nối khi gửi đúng /start <connect_token> hợp lệ (is_active = true) hoặc số điện thoại đang chờ kích hoạt (telegram_chat_id IS NULL & is_active = true).
     */
    public function test_bare_start_command_does_not_auto_link_pending_recipient_and_requires_valid_token_or_pending_phone(): void
    {
        Http::fake([
            'api.telegram.org/*' => Http::response(['ok' => true], 200),
            '*127.0.0.1:20128/*' => Http::response([], 200),
        ]);

        $pendingAdmin = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => $this->branchA1->id,
            'label'             => 'Admin Đang Chờ Liên Kết',
            'phone'             => '0919888777',
            'target_role'       => 'admin',
            'telegram_chat_id'  => null,
            'connect_token'     => 'adm_strict_token_999',
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
        ]);

        // 1. Người lạ gửi "/start" trống -> bị từ chối liên kết tự động, bản ghi đang chờ vẫn giữ nguyên telegram_chat_id = null
        $resBareStart = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 90101,
            'message'   => [
                'message_id' => 201,
                'chat'       => ['id' => 555666777, 'type' => 'private'],
                'text'       => '/start',
            ],
        ]);

        $resBareStart->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', false)
            ->assertJsonPath('data.recipient_id', null);

        $pendingAdmin->refresh();
        $this->assertNull($pendingAdmin->telegram_chat_id);
        $this->assertNull($pendingAdmin->connected_at);

        // 2. Người lạ gửi "/start@PodsCareNotifyBot" trống -> cũng bị từ chối
        $resBareBotStart = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 90102,
            'message'   => [
                'message_id' => 202,
                'chat'       => ['id' => 555666778, 'type' => 'private'],
                'text'       => '/start@PodsCareNotifyBot',
            ],
        ]);

        $resBareBotStart->assertStatus(200)
            ->assertJsonPath('data.handled', false)
            ->assertJsonPath('data.recipient_id', null);

        $pendingAdmin->refresh();
        $this->assertNull($pendingAdmin->telegram_chat_id);

        // 3. Gửi đúng "/start adm_strict_token_999" -> ghép nối thành công
        $resValidToken = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 90103,
            'message'   => [
                'message_id' => 203,
                'chat'       => ['id' => 555666779, 'type' => 'private'],
                'text'       => '/start adm_strict_token_999',
            ],
        ]);

        $resValidToken->assertStatus(200)
            ->assertJsonPath('data.handled', true)
            ->assertJsonPath('data.recipient_id', $pendingAdmin->id);

        $pendingAdmin->refresh();
        $this->assertSame('555666779', (string) $pendingAdmin->telegram_chat_id);
        $this->assertNotNull($pendingAdmin->connected_at);

        // 4. Khi bản ghi đã có telegram_chat_id, người khác gửi SĐT của bản ghi đó sẽ KHÔNG chiếm được quyền
        $resHijackByPhone = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 90104,
            'message'   => [
                'message_id' => 204,
                'chat'       => ['id' => 555666880, 'type' => 'private'],
                'text'       => '0919888777',
            ],
        ]);

        $resHijackByPhone->assertStatus(200)
            ->assertJsonPath('data.handled', false);

        $pendingAdmin->refresh();
        $this->assertSame('555666779', (string) $pendingAdmin->telegram_chat_id);
    }

    /**
     * 16. Giai đoạn 2 (Task 2.1) - Chuẩn hóa tham số Tool bằng scalarString():
     *     - Khi LLM truyền mảng (array) vào các tham số chuỗi của bất kỳ Tool nào trong 5 Tools
     *       hoặc qua luồng Webhook E2E, hệ thống tự động gom chuỗi an toàn mà không văng lỗi "Array to string conversion".
     */
    public function test_phase2_tools_safely_normalize_array_arguments_via_scalar_string_without_crashing(): void
    {
        $lookupTool = new \App\Services\TelegramAi\Tools\LookupOrderTool();
        $inventoryTool = new \App\Services\TelegramAi\Tools\InventoryCheckTool();
        $warrantyTool = new \App\Services\TelegramAi\Tools\WarrantyLookupTool();
        $revenueTool = new \App\Services\TelegramAi\Tools\RevenueSummaryTool();
        $fallbackTool = new \App\Services\TelegramAi\Tools\FallbackSchemaQueryTool();

        // 1. Gọi trực tiếp cả 5 Tools với các tham số là mảng lồng hoặc mảng danh sách
        $lookupRes = $lookupTool->execute([
            'order_code'      => ['PCAP', '1910'],
            'phone'           => ['0901', '234567'],
            'customer_name'   => ['Anh', 'Minh'],
            'keyword'         => ['thay', 'pin'],
            'status'          => ['in_repair'],
            'technician_name' => ['KTV', 'Hoàng'],
            'date_from'       => ['18/10/2026'],
            'date_to'         => ['19/10/2026'],
            'limit'           => ['5'],
        ], $this->activeRecipient);
        $this->assertIsArray($lookupRes);
        $this->assertArrayHasKey('orders', $lookupRes);

        $invRes = $inventoryTool->execute([
            'keyword'        => ['Pin', 'AirPods'],
            'sku'            => ['LK-PIN-01'],
            'low_stock_only' => ['false'],
            'sort_by'        => ['stock_asc'],
            'limit'          => ['5'],
        ], $this->activeRecipient);
        $this->assertIsArray($invRes);
        $this->assertArrayHasKey('parts', $invRes);

        $warRes = $warrantyTool->execute([
            'warranty_code' => ['BH-100'],
            'order_code'    => ['PCAP-100'],
            'phone'         => ['0909111222'],
            'customer_name' => ['Chị', 'Lan'],
            'status'        => ['active'],
            'limit'         => ['5'],
        ], $this->activeRecipient);
        $this->assertIsArray($warRes);
        $this->assertArrayHasKey('warranties', $warRes);

        $revRes = $revenueTool->execute([
            'period'          => ['today'],
            'date_from'       => ['19/10/2026'],
            'date_to'         => ['19/10/2026'],
            'group_by'        => ['device_category'],
            'device_category' => ['AirPods'],
        ], $this->activeRecipient);
        $this->assertIsArray($revRes);
        $this->assertArrayHasKey('net_payment_collected', $revRes);

        $fbRes = $fallbackTool->execute([
            'entity'    => ['work_shifts'],
            'keyword'   => ['CA-Q1'],
            'status'    => ['closed'],
            'sort_by'   => ['cash_diff_desc'],
            'date_from' => ['18/10/2026'],
            'date_to'   => ['19/10/2026'],
            'limit'     => ['15'],
        ], $this->activeRecipient);
        $this->assertIsArray($fbRes);
        $this->assertSame('work_shifts', $fbRes['entity'] ?? null);

        // 2. Kiểm tra qua luồng Webhook khi 9Router trả về tool_calls chứa tham số kiểu mảng
        Http::fake(function ($request) {
            if (str_contains($request->url(), '/v1/chat/completions')) {
                return Http::response([
                    'choices' => [
                        [
                            'message' => [
                                'role'       => 'assistant',
                                'content'    => null,
                                'tool_calls' => [
                                    [
                                        'id'       => 'call_arr_args_1',
                                        'type'     => 'function',
                                        'function' => [
                                            'name'      => 'lookup_repair_orders',
                                            'arguments' => json_encode([
                                                'keyword'   => ['AirPods', 'Pro'],
                                                'status'    => ['in_repair'],
                                                'date_from' => ['19/10/2026'],
                                            ], JSON_UNESCAPED_UNICODE),
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
            'update_id' => 90201,
            'message'   => [
                'message_id' => 301,
                'chat'       => ['id' => 8841956211, 'type' => 'private'],
                'text'       => 'Tìm đơn sửa AirPods Pro hôm nay',
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', true);
    }

    /**
     * 17. Giai đoạn 2 (Task 2.2 & Task 2.3) - Cắt an toàn HTML dài > 3900 ký tự kèm đóng thẻ HTML mở,
     *     gửi thông báo khôi phục thân thiện khi xảy ra Exception bất ngờ, và xác nhận timeout mặc định 20s.
     */
    public function test_phase2_truncates_long_telegram_html_safely_with_tag_closure_and_sends_friendly_recovery_on_exception(): void
    {
        // 1. Kiểm tra cấu hình timeout mặc định từ config/services.php là 20 giây
        $rawServicesConfig = require base_path('config/services.php');
        $this->assertSame(20, $rawServicesConfig['gemini']['timeout'] ?? null);

        // 2. Kiểm tra cắt an toàn tin nhắn HTML vượt quá 3900 ký tự UTF-8 và tự động đóng các thẻ HTML đang mở
        /** @var \App\Services\TelegramNotificationService $telegramService */
        $telegramService = $this->app->make(\App\Services\TelegramNotificationService::class);

        $longLines = ["<b>Báo cáo danh sách đơn hàng chi tiết</b>"];
        for ($i = 1; $i <= 95; $i++) {
            $longLines[] = sprintf(
                "%d. <b>Đơn hàng <code>PCAP-2026-%04d</code> - <i>Khách hàng Nguyễn Văn An %02d - Thay pin AirPods Pro 2 chính hãng tại chi nhánh</i></b>",
                $i,
                $i,
                $i
            );
        }
        // Thêm một dòng rất dài không đóng thẻ ở phần cuối để kiểm chứng cơ chế đóng thẻ LIFO
        $unclosedTail = "<b><i><code>Đoạn văn bản mở thẻ chưa đóng " . str_repeat("A", 600);
        $longHtml = implode("\n", $longLines) . "\n" . $unclosedTail;

        $this->assertGreaterThan(3900, mb_strlen($longHtml, 'UTF-8'));

        $truncated = $telegramService->truncateTelegramHtmlSafely($longHtml);

        $this->assertLessThanOrEqual(
            \App\Services\TelegramNotificationService::MAX_SAFE_HTML_LENGTH,
            mb_strlen($truncated, 'UTF-8')
        );
        $this->assertLessThanOrEqual(4096, mb_strlen($truncated, 'UTF-8'));
        $this->assertStringContainsString(
            '<i>... (Danh sách còn tiếp, vui lòng lọc hẹp từ khóa hoặc khoảng ngày để xem chi tiết)</i>',
            $truncated
        );

        // Đảm bảo số thẻ mở và thẻ đóng của <b>, <i>, <code> cân bằng nhau
        foreach (['b', 'i', 'code'] as $tag) {
            $openCount = preg_match_all('/<' . $tag . '\b[^>]*>/i', $truncated);
            $closeCount = preg_match_all('/<\/' . $tag . '>/i', $truncated);
            $this->assertSame($openCount, $closeCount, "Thẻ <{$tag}> phải được đóng cân bằng sau khi cắt chuỗi");
        }

        // 3. Kiểm tra khi xảy ra Exception bất ngờ trong lúc thực thi Tool, người dùng nhận được thông báo khôi phục lịch sự
        /** @var TelegramAiToolRegistry $registry */
        $registry = $this->app->make(TelegramAiToolRegistry::class);
        $registry->register(new class implements TelegramAiToolInterface {
            public function name(): string
            {
                return 'lookup_repair_orders';
            }

            public function description(): string
            {
                return 'Mock tool gây lỗi runtime để kiểm tra thông báo khôi phục.';
            }

            public function parametersSchema(): array
            {
                return ['type' => 'OBJECT', 'properties' => []];
            }

            public function execute(array $args, TelegramRecipient $recipient): array
            {
                throw new \RuntimeException('Simulated unexpected database connection drop');
            }
        });

        $sentMessages = [];
        Http::fake(function ($request) use (&$sentMessages) {
            if (str_contains($request->url(), '/v1/chat/completions')) {
                return Http::response([
                    'choices' => [
                        [
                            'message' => [
                                'role'       => 'assistant',
                                'content'    => null,
                                'tool_calls' => [
                                    [
                                        'id'       => 'call_crash_1',
                                        'type'     => 'function',
                                        'function' => [
                                            'name'      => 'lookup_repair_orders',
                                            'arguments' => json_encode(['keyword' => 'PCAP']),
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ], 200);
            }

            if (str_contains($request->url(), '/sendMessage')) {
                $sentMessages[] = (string) ($request['text'] ?? '');
            }

            return Http::response(['ok' => true], 200);
        });

        /** @var \App\Services\TelegramAi\TelegramAiAssistantService $assistant */
        $assistant = $this->app->make(\App\Services\TelegramAi\TelegramAiAssistantService::class);
        $handled = $assistant->handleIncomingMessage($this->activeRecipient, 'Kiểm tra đơn PCAP khi DB lỗi');

        $this->assertFalse($handled);
        $this->assertNotEmpty($sentMessages);
        $this->assertStringContainsString('<b>Hệ thống Trợ lý AI tạm thời bận</b>', $sentMessages[0]);
        $this->assertStringContainsString('Vui lòng thử lại sau ít phút.', $sentMessages[0]);
    }

    /**
     * 35. Webhook Telegram đẩy ProcessTelegramAiMessageJob vào hàng đợi (Queue::fake) và thực thi trực tiếp handle().
     */
    public function test_webhook_dispatches_process_telegram_ai_message_job_and_executes_handle_directly(): void
    {
        \Illuminate\Support\Facades\Queue::fake();

        $webhookRes = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 999888,
            'message'   => [
                'message_id' => 555,
                'chat'       => ['id' => 8841956211, 'type' => 'private'],
                'text'       => 'Xin chào Trợ lý AI qua Queue',
            ],
        ]);

        $webhookRes->assertStatus(200)
            ->assertJsonPath('data.handled', true)
            ->assertJsonPath('data.recipient_id', $this->activeRecipient->id);

        \Illuminate\Support\Facades\Queue::assertPushed(
            \App\Jobs\ProcessTelegramAiMessageJob::class,
            fn (\App\Jobs\ProcessTelegramAiMessageJob $job) => $job->recipientId === $this->activeRecipient->id
                && $job->messageText === 'Xin chào Trợ lý AI qua Queue'
                && $job->messageId === 555
        );

        // Thực thi trực tiếp handle() của ProcessTelegramAiMessageJob
        Http::fake([
            '127.0.0.1:20128/v1/chat/completions*' => Http::response([
                'id'      => 'chatcmpl-queue-test',
                'object'  => 'chat.completion',
                'model'   => 'podscare-ai',
                'choices' => [
                    [
                        'index'   => 0,
                        'message' => [
                            'role'    => 'assistant',
                            'content' => '<b>Xin chào!</b> Đã xử lý qua ProcessTelegramAiMessageJob.',
                        ],
                    ],
                ],
            ], 200),
            'api.telegram.org/*/sendMessage*' => Http::response(['ok' => true], 200),
        ]);

        $job = new \App\Jobs\ProcessTelegramAiMessageJob(
            $this->activeRecipient->id,
            'Xin chào Trợ lý AI qua Queue',
            555
        );
        $job->handle(app(\App\Services\TelegramAi\TelegramAiAssistantService::class));

        Http::assertSent(fn ($req) => str_contains($req->url(), '/sendMessage')
            && (string) $req['chat_id'] === '8841956211'
            && str_contains($req['text'], 'ProcessTelegramAiMessageJob'));
    }
}


