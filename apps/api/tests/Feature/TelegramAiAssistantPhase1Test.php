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
        Config::set('services.gemini.base_url', '');
        Config::set('services.gemini.api_key', 'test_gemini_api_key_phase1');
        Config::set('services.gemini.model', 'gemini-2.0-flash');
        Config::set('services.gemini.fallback_models', 'gemini-2.0-flash-lite,gemini-2.5-flash');
        Config::set('services.gemini.timeout', 15);

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
            'api.telegram.org/*'                   => Http::response(['ok' => true], 200),
            'generativelanguage.googleapis.com/*' => Http::response([], 200),
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

        // Tuyệt đối không có request nào gọi tới Gemini API
        Http::assertNotSent(function ($request) {
            return str_contains($request->url(), 'generativelanguage.googleapis.com');
        });

        // Cả 2 đều nhận thông báo hướng dẫn kích hoạt
        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === '99999999'
                && str_contains($request['text'], 'Tài khoản Telegram chưa được kích hoạt');
        });
    }

    /**
     * 2. Tin nhắn từ chat_id đã kích hoạt (is_active = true) gọi Gemini API và trả lời về Telegram
     *    với định dạng HTML sạch hoàn toàn, tự động lọc sạch emoji và thẻ HTML lạ.
     */
    public function test_active_recipient_message_calls_gemini_and_returns_sanitized_html_without_emojis(): void
    {
        Http::fake([
            'api.telegram.org/*' => Http::response(['ok' => true], 200),
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [
                    [
                        'content' => [
                            'role'  => 'model',
                            'parts' => [
                                [
                                    'text' => "<p>Xin chào <b>Anh Bảo Admin</b>! 🚀✨</p><br/>Hệ thống <i>Trợ lý AI</i> của <code>{$this->tenantA->name}</code> đã sẵn sàng hỗ trợ. ✅📊",
                                ],
                            ],
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
     * 3. Cơ chế Auto-Fallback Model: Khi model chính (gemini-2.0-flash) trả về HTTP 503 hoặc 429,
     *    GeminiFunctionCallingClient tự động chuyển sang model dự phòng (gemini-2.0-flash-lite) và trả lời thành công.
     */
    public function test_auto_fallback_switches_to_secondary_model_when_primary_returns_503_or_429(): void
    {
        Http::fake([
            'api.telegram.org/*' => Http::response(['ok' => true], 200),
            'generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent*' => Http::response([
                'error' => [
                    'code'    => 503,
                    'message' => 'The model is overloaded. Please try again later.',
                    'status'  => 'UNAVAILABLE',
                ],
            ], 503),
            'generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent*' => Http::response([
                'candidates' => [
                    [
                        'content' => [
                            'role'  => 'model',
                            'parts' => [
                                [
                                    'text' => "<b>Phản hồi từ model dự phòng</b>\nHệ thống hoạt động bình thường.",
                                ],
                            ],
                        ],
                    ],
                ],
            ], 200),
        ]);

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

        // Xác nhận cả model chính và model dự phòng đều được gọi theo đúng thứ tự
        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'models/gemini-2.0-flash:generateContent');
        });

        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'models/gemini-2.0-flash-lite:generateContent');
        });

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
                                            'name' => 'mock_store_ping',
                                            'args' => [
                                                'keyword' => 'airpods_pro_2',
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
            'update_id' => 90005,
            'message'   => [
                'message_id' => 105,
                'chat'       => ['id' => 8841956211, 'type' => 'private'],
                'text'       => 'Kiểm tra từ khóa airpods_pro_2',
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.handled', true);

        // Xác nhận Gemini chỉ được gọi đúng 1 lần ở Bước 1 (cắt bỏ hoàn toàn Bước 3)
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
     * 7. Kiểm tra chế độ 9Router (GEMINI_BASE_URL chuẩn OpenAI /v1/chat/completions):
     *    - Tự động nối /v1/chat/completions khi GEMINI_BASE_URL=http://127.0.0.1:20128
     *    - Chuyển đổi functionDeclarations sang chuẩn OpenAI tools (type: "function", parameters.type: "object")
     *    - Tự động fallback từ combo-primary (HTTP 429) sang combo-backup (HTTP 200)
     *    - Bóc tách choices.0.message.tool_calls, chạy RevenueSummaryTool và gửi thẳng báo cáo HTML tiếng Việt về Telegram
     */
    public function test_9router_openai_compatible_base_url_executes_tool_calls_and_supports_fallback(): void
    {
        Config::set('services.gemini.base_url', 'http://127.0.0.1:20128');
        Config::set('services.gemini.api_key', '');
        Config::set('services.gemini.model', 'combo-primary');
        Config::set('services.gemini.fallback_models', 'combo-backup');

        $routerPayloads = [];

        Http::fake(function ($request) use (&$routerPayloads) {
            if (str_contains($request->url(), '127.0.0.1:20128/v1/chat/completions')) {
                $body = $request->data();
                $routerPayloads[] = $body;

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
    }
}



