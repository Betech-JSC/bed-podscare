<?php

namespace Tests\Feature;

use App\Jobs\ProcessTelegramAiMessageJob;
use App\Models\Branch;
use App\Models\CashTransaction;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Part;
use App\Models\Payment;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\RepairService;
use App\Models\TelegramRecipient;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use App\Services\TelegramAi\TelegramAiAssistantService;
use App\Services\TelegramAi\TelegramAiToolRegistry;
use App\Services\TelegramAi\Tools\FallbackSchemaQueryTool;
use App\Services\TelegramAi\Tools\LookupOrderTool;
use App\Services\TelegramAi\Tools\RevenueSummaryTool;
use App\Services\TelegramAi\Tools\StaffKpiTool;
use App\Services\TelegramNotificationService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class TelegramAiSmartAssistantV2Test extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected User $techMinh;
    protected User $techTuan;
    protected TelegramRecipient $adminRecipient;
    protected TelegramRecipient $techRecipient;
    protected TelegramRecipient $receptionistRecipient;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();

        Config::set('services.telegram.bot_token', 'test_bot_token_v2');
        Config::set('services.telegram.bot_username', 'PodsCareNotifyBot');
        Config::set('services.telegram.webhook_secret', '');
        Config::set('services.gemini.base_url', 'http://127.0.0.1:20128/v1');
        Config::set('services.gemini.api_key', '9router-local');
        Config::set('services.gemini.model', 'podscare-ai');
        Config::set('services.gemini.fallback_models', '');
        Config::set('services.gemini.timeout', 20);
        Config::set('services.gemini.summarize_with_ai', false);

        $this->tenant = Tenant::create([
            'name'   => 'PodsCare V2 Analytics Tenant',
            'code'   => 'tenant-v2-analytics-' . uniqid(),
            'status' => 'active',
        ]);

        $this->branch = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'CN-Q1-V2-' . rand(100, 999),
            'address'   => '123 Lê Lợi, Quận 1',
            'phone'     => '0901999888',
            'is_active' => true,
        ]);

        $this->techMinh = User::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'KTV Minh',
            'email'     => 'ktv.minh.' . uniqid() . '@podscare.vn',
            'phone'     => '0909888111',
            'password'  => bcrypt('password123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->techTuan = User::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'KTV Tuấn',
            'email'     => 'ktv.tuan.' . uniqid() . '@podscare.vn',
            'phone'     => '0909888222',
            'password'  => bcrypt('password123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->adminRecipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenant->id,
            'branch_id'         => $this->branch->id,
            'label'             => 'Anh Bảo Admin',
            'phone'             => '0862389728',
            'target_role'       => 'admin',
            'telegram_chat_id'  => '8841956777',
            'connect_token'     => 'adm_v2_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);

        $this->techRecipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenant->id,
            'branch_id'         => $this->branch->id,
            'label'             => 'KTV Minh Telegram',
            'phone'             => '0909888111',
            'target_role'       => 'technician',
            'telegram_chat_id'  => '8841956778',
            'connect_token'     => 'tech_v2_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);

        $this->receptionistRecipient = TelegramRecipient::create([
            'tenant_id'         => $this->tenant->id,
            'branch_id'         => $this->branch->id,
            'label'             => 'Lễ Tân Thu Ngân',
            'phone'             => '0909888333',
            'target_role'       => 'receptionist',
            'telegram_chat_id'  => '8841956779',
            'connect_token'     => 'rec_v2_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);
    }

    /**
     * Task 1.2: TelegramAiToolRegistry tự động nạp đủ 6 Tools theo đúng thứ tự ưu tiên,
     *           get_staff_kpi có độ ưu tiên 25 và fallback_schema_query luôn đứng cuối cùng.
     */
    public function test_tool_registry_discovers_all_6_tools_in_exact_priority_order_with_get_staff_kpi_and_fallback_last(): void
    {
        $registry = (new TelegramAiToolRegistry())->discoverToolsFromDirectory();
        $toolNames = array_keys($registry->all());

        $this->assertCount(6, $toolNames);
        $this->assertSame([
            'lookup_repair_orders',
            'get_revenue_summary',
            'get_staff_kpi',
            'check_inventory_parts',
            'lookup_warranties',
            'fallback_schema_query',
        ], $toolNames);

        $declarationNames = array_column($registry->getFunctionDeclarations($this->adminRecipient), 'name');
        $this->assertSame($toolNames, $declarationNames);
        $this->assertSame('fallback_schema_query', end($declarationNames));
    }

    /**
     * Task 1.1 & 1.3: StaffKpiTool tính toán chính xác warranty_count, warranty_rate, qc_pass_rate,
     *                 avg_processing_time_formatted, ẩn revenue_generated với role khác admin,
     *                 và RevenueSummaryTool(group_by='technician') trả về đầy đủ chỉ số bảo hành.
     */
    public function test_staff_kpi_tool_and_revenue_summary_technician_breakdown_calculate_warranty_rates_and_enforce_rbac(): void
    {
        $device = DeviceModel::withoutGlobalScopes()->create([
            'tenant_id'  => $this->tenant->id,
            'name'       => 'AirPods Pro 2',
            'category'   => 'AirPods',
            'model_code' => 'APP2-' . rand(100, 999),
            'is_active'  => true,
        ]);

        $customer = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Test KPI',
            'phone'     => '0901112233',
        ]);

        // KTV Minh: 2 đơn hoàn tất, nhưng cả 2 đơn đều dính bảo hành/làm lại -> warranty_count = 2, warranty_rate = 100%
        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'technician_id'       => $this->techMinh->id,
            'created_by_user_id'  => $this->techMinh->id,
            'order_code'          => 'RO-KPI-M1',
            'order_type'          => 'warranty',
            'status'              => 'completed',
            'issue_description'   => 'Bảo hành thay pin bên trái',
            'total_price'         => 500000,
            'repair_started_at'   => now()->subMinutes(90),
            'repair_completed_at' => now()->subMinutes(30),
        ]);

        $orderMinh2 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'technician_id'       => $this->techMinh->id,
            'created_by_user_id'  => $this->techMinh->id,
            'order_code'          => 'RO-KPI-M2',
            'order_type'          => 'in_store',
            'status'              => 'completed',
            'issue_description'   => 'Thay loa AirPods Pro 2',
            'total_price'         => 600000,
            'repair_started_at'   => now()->subMinutes(60),
            'repair_completed_at' => now()->subMinutes(10),
        ]);

        // Tạo QC fail cho đơn thứ 2 của KTV Minh
        QcInspection::withoutGlobalScopes()->create([
            'tenant_id'       => $this->tenant->id,
            'repair_order_id' => $orderMinh2->id,
            'inspector_id'    => $this->techMinh->id,
            'result'          => 'fail',
            'notes'           => 'Loa rè khi bật ANC',
        ]);

        // KTV Tuấn: 4 đơn hoàn tất, chỉ 1 đơn có phiếu bảo hành phát sinh claim -> warranty_count = 1, warranty_rate = 25%
        for ($i = 1; $i <= 4; $i++) {
            $orderTuan = RepairOrder::withoutGlobalScopes()->create([
                'tenant_id'           => $this->tenant->id,
                'branch_id'           => $this->branch->id,
                'customer_id'         => $customer->id,
                'device_model_id'     => $device->id,
                'technician_id'       => $this->techTuan->id,
                'created_by_user_id'  => $this->techTuan->id,
                'order_code'          => "RO-KPI-T{$i}",
                'order_type'          => 'in_store',
                'status'              => 'completed',
                'issue_description'   => "Thay pin chuẩn lần {$i}",
                'total_price'         => 400000,
                'repair_started_at'   => now()->subMinutes(45),
                'repair_completed_at' => now()->subMinutes(15),
            ]);

            QcInspection::withoutGlobalScopes()->create([
                'tenant_id'       => $this->tenant->id,
                'repair_order_id' => $orderTuan->id,
                'inspector_id'    => $this->techTuan->id,
                'result'          => 'pass',
                'notes'           => 'Đạt chuẩn QC',
            ]);

            if ($i === 1) {
                $w = Warranty::withoutGlobalScopes()->create([
                    'repair_order_id' => $orderTuan->id,
                    'customer_id'     => $customer->id,
                    'device_model_id' => $device->id,
                    'warranty_code'   => 'BH-KPI-T1',
                    'coverage_item'   => 'Pin AirPods',
                    'duration_days'   => 90,
                    'start_date'      => now()->toDateString(),
                    'end_date'        => now()->addDays(90)->toDateString(),
                    'status'          => 'active',
                ]);

                WarrantyClaim::withoutGlobalScopes()->create([
                    'claim_code'          => 'CLM-KPI-T1',
                    'warranty_id'         => $w->id,
                    'issue_description'   => 'Pin tụt nhanh sau 2 ngày',
                    'resolution_mode'     => 'rework',
                    'status'              => 'received',
                    'received_by_user_id' => $this->techTuan->id,
                ]);
            }
        }

        // 1. Admin gọi StaffKpiTool sắp xếp theo warranty_rate_desc (hỗ trợ cả tham số mảng qua scalarString)
        $staffKpiTool = new StaffKpiTool();
        $adminResult = $staffKpiTool->execute([
            'period'  => ['today'],
            'sort_by' => ['warranty_rate_desc'],
        ], $this->adminRecipient);

        $this->assertFalse($adminResult['revenue_fields_redacted']);
        $this->assertNotEmpty($adminResult['technicians']);
        $this->assertSame('KTV Minh', $adminResult['technicians'][0]['name']);
        $this->assertSame(2, $adminResult['technicians'][0]['completed_orders']);
        $this->assertSame(2, $adminResult['technicians'][0]['warranty_count']);
        $this->assertSame(100.0, $adminResult['technicians'][0]['warranty_rate']);
        $this->assertSame(1100000.0, $adminResult['technicians'][0]['revenue_generated']);

        $this->assertSame('KTV Tuấn', $adminResult['technicians'][1]['name']);
        $this->assertSame(4, $adminResult['technicians'][1]['completed_orders']);
        $this->assertSame(1, $adminResult['technicians'][1]['warranty_count']);
        $this->assertSame(25.0, $adminResult['technicians'][1]['warranty_rate']);
        $this->assertSame(1600000.0, $adminResult['technicians'][1]['revenue_generated']);
        $this->assertStringContainsString('KTV Minh có tỷ lệ bảo hành/làm lại cao nhất', (string) $adminResult['comparison_summary']);

        $adminHtml = $staffKpiTool->formatHtml($adminResult);
        $this->assertStringContainsString('KTV Minh', $adminHtml);
        $this->assertStringContainsString('100%', $adminHtml);
        $this->assertStringContainsString('1.100.000 đ', $adminHtml);

        // 2. Technician gọi StaffKpiTool -> ẩn hoàn toàn revenue_generated
        $techResult = $staffKpiTool->execute([
            'period'  => 'today',
            'sort_by' => 'warranty_rate_desc',
        ], $this->techRecipient);

        $this->assertTrue($techResult['revenue_fields_redacted']);
        $this->assertNull($techResult['technicians'][0]['revenue_generated']);
        $this->assertNull($techResult['technicians'][0]['revenue_generated_formatted']);
        $techHtml = $staffKpiTool->formatHtml($techResult);
        $this->assertStringNotContainsString('1.100.000 đ', $techHtml);
        $this->assertStringNotContainsString('1.600.000 đ', $techHtml);
        $this->assertStringContainsString('100%', $techHtml);

        // 3. RevenueSummaryTool với group_by = 'technician' trả về kèm warranty_count, rework_count, warranty_rate
        $revenueTool = new RevenueSummaryTool();
        $revResult = $revenueTool->execute([
            'period'   => 'today',
            'group_by' => 'technician',
        ], $this->adminRecipient);

        $this->assertSame('technician', $revResult['group_by']);
        $this->assertCount(2, $revResult['breakdown']);

        $byLabel = collect($revResult['breakdown'])->keyBy('group_label');
        $this->assertSame(2, $byLabel['KTV Minh']['warranty_count']);
        $this->assertSame(1, $byLabel['KTV Minh']['rework_count']);
        $this->assertSame(100.0, $byLabel['KTV Minh']['warranty_rate']);

        $this->assertSame(1, $byLabel['KTV Tuấn']['warranty_count']);
        $this->assertSame(0, $byLabel['KTV Tuấn']['rework_count']);
        $this->assertSame(25.0, $byLabel['KTV Tuấn']['warranty_rate']);

        $revHtml = $revenueTool->formatHtml($revResult);
        $this->assertStringContainsString('Tỷ lệ BH: <b>100,0%</b>', $revHtml);
        $this->assertStringContainsString('Tỷ lệ BH: <b>25,0%</b>', $revHtml);
    }

    /**
     * Task 2.1: LookupOrderTool hỗ trợ sort_by = 'price_desc' | 'price_asc', tự động loại trừ đơn cancelled/rejected
     *           khi xếp hạng doanh thu, và loại bỏ hư từ xếp hạng ("doanh thu cao nhất") khỏi keyword.
     */
    public function test_lookup_order_tool_sorts_by_price_desc_excludes_cancelled_and_strips_ranking_stopwords(): void
    {
        $device = DeviceModel::withoutGlobalScopes()->create([
            'tenant_id'  => $this->tenant->id,
            'name'       => 'Apple Watch Ultra 2',
            'category'   => 'Apple Watch',
            'model_code' => 'AWU2-' . rand(100, 999),
            'is_active'  => true,
        ]);

        $customer = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Xếp Hạng Đơn',
            'phone'     => '0902223344',
        ]);

        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'technician_id'      => $this->techMinh->id,
            'created_by_user_id' => $this->techMinh->id,
            'order_code'         => 'RO-PRICE-LOW',
            'order_type'         => 'in_store',
            'status'             => 'completed',
            'issue_description'  => 'Vệ sinh loa Apple Watch',
            'total_price'        => 250000,
        ]);

        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'technician_id'      => $this->techMinh->id,
            'created_by_user_id' => $this->techMinh->id,
            'order_code'         => 'RO-PRICE-MAX',
            'order_type'         => 'in_store',
            'status'             => 'completed',
            'issue_description'  => 'Thay màn hình zin Apple Watch Ultra 2',
            'total_price'        => 3850000,
        ]);

        // Đơn đã hủy có giá 9.900.000 đ -> Phải bị loại trừ khi sort_by = price_desc
        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'technician_id'      => $this->techMinh->id,
            'created_by_user_id' => $this->techMinh->id,
            'order_code'         => 'RO-CANCELLED-9M',
            'order_type'         => 'in_store',
            'status'             => 'cancelled',
            'issue_description'  => 'Khách hủy đơn thay main',
            'total_price'        => 9900000,
        ]);

        $lookupTool = new LookupOrderTool();

        // Kiểm tra extractSearchTokens loại bỏ sạch các từ khóa xếp hạng
        $this->assertSame([], $lookupTool->extractSearchTokens('Đơn sửa chữa nào doanh thu cao nhất?'));
        $this->assertSame([], $lookupTool->extractSearchTokens('đơn đắt nhất giá cao nhất'));

        // Ngay cả khi LLM truyền nhầm keyword = 'doanh thu cao nhất', LookupOrderTool tự động làm sạch và sắp xếp đúng
        /** @var TelegramAiAssistantService $assistant */
        $assistant = $this->app->make(TelegramAiAssistantService::class);
        $enrichedArgs = $assistant->enrichToolArgumentsFromQuestion(
            'lookup_repair_orders',
            ['keyword' => 'doanh thu cao nhất'],
            'Đơn sửa chữa nào doanh thu cao nhất?',
            $this->adminRecipient
        );

        $this->assertSame('price_desc', $enrichedArgs['sort_by'] ?? null);
        $this->assertSame('', $enrichedArgs['keyword'] ?? null);

        $resDesc = $lookupTool->execute([
            'keyword' => 'doanh thu cao nhất',
            'sort_by' => 'price_desc',
            'limit'   => 5,
        ], $this->adminRecipient);

        $this->assertSame(2, $resDesc['total_matched']);
        $this->assertSame('RO-PRICE-MAX', $resDesc['orders'][0]['order_code']);
        $this->assertSame(3850000.0, $resDesc['orders'][0]['total_price']);
        $this->assertSame('RO-PRICE-LOW', $resDesc['orders'][1]['order_code']);

        $resAsc = $lookupTool->execute([
            'sort_by' => 'price_asc',
            'limit'   => 5,
        ], $this->adminRecipient);

        $this->assertSame('RO-PRICE-LOW', $resAsc['orders'][0]['order_code']);
        $this->assertSame(250000.0, $resAsc['orders'][0]['total_price']);
    }

    /**
     * Task 2.2: TelegramNotificationService::syncUpdates() xử lý tin nhắn bị trễ > 2 phút (ví dụ 10 phút trước)
     *           nhờ cửa sổ 24 giờ + khóa Idempotency, và không xử lý lặp ở lần quét kế tiếp.
     */
    public function test_sync_updates_processes_delayed_messages_within_24h_window_and_enforces_idempotency(): void
    {
        Queue::fake();

        $delayedMessageDate = now()->subMinutes(10)->timestamp;

        Http::fake([
            'api.telegram.org/bot*/getUpdates*' => Http::response([
                'ok'     => true,
                'result' => [
                    [
                        'update_id' => 778899,
                        'message'   => [
                            'message_id' => 901,
                            'date'       => $delayedMessageDate,
                            'chat'       => ['id' => 8841956777, 'type' => 'private'],
                            'text'       => 'Đơn sửa chữa nào doanh thu cao nhất?',
                        ],
                    ],
                ],
            ], 200),
        ]);

        /** @var TelegramNotificationService $telegramService */
        $telegramService = $this->app->make(TelegramNotificationService::class);

        // Lần quét 1: Tin nhắn gửi từ 10 phút trước vẫn được đẩy vào ProcessTelegramAiMessageJob
        $syncedCount1 = $telegramService->syncUpdates($this->tenant->id);
        $this->assertSame(1, $syncedCount1);
        $this->assertSame(779000 - 100, (int) Cache::get('telegram_last_update_offset'));

        Queue::assertPushed(
            ProcessTelegramAiMessageJob::class,
            fn (ProcessTelegramAiMessageJob $job) => $job->recipientId === $this->adminRecipient->id
                && $job->messageText === 'Đơn sửa chữa nào doanh thu cao nhất?'
        );

        // Lần quét 2: Cùng update_id = 778899 bị chặn bởi khóa Idempotency (không dispatch lặp)
        $syncedCount2 = $telegramService->syncUpdates($this->tenant->id);
        $this->assertSame(0, $syncedCount2);
        Queue::assertPushed(ProcessTelegramAiMessageJob::class, 1);
    }

    /**
     * Task 3.1 & 3.2: FallbackSchemaQueryTool mở rộng 16 bảng, bảo mật RBAC (ẩn password/remember_token trên users,
     *                 chặn payments/cash_transactions cho non-admin, ẩn giá tiền/giá vốn cho technician)
     *                 và thực thi Smart Aggregation Mode (count, sum, avg, max, min + group_by).
     */
    public function test_fallback_schema_query_supports_16_entities_rbac_redaction_and_smart_aggregation_mode(): void
    {
        $fallbackTool = new FallbackSchemaQueryTool();

        // 1. Kiểm tra Allow-list có đúng 16 bảng
        $this->assertCount(16, FallbackSchemaQueryTool::ALLOWED_ENTITIES);
        foreach (['repair_orders', 'warranties', 'warranty_claims', 'payments', 'cash_transactions', 'parts', 'users'] as $newEntity) {
            $this->assertContains($newEntity, FallbackSchemaQueryTool::ALLOWED_ENTITIES);
        }

        // 2. Kiểm tra bảng users tuyệt đối không trả về password hoặc remember_token
        $usersRes = $fallbackTool->execute([
            'entity'  => 'users',
            'keyword' => 'KTV Minh',
        ], $this->adminRecipient);

        $this->assertArrayNotHasKey('error', $usersRes);
        $this->assertGreaterThanOrEqual(1, $usersRes['total_matched']);
        $firstUser = $usersRes['items'][0];
        $this->assertSame('KTV Minh', $firstUser['name']);
        $this->assertArrayNotHasKey('password', $firstUser);
        $this->assertArrayNotHasKey('remember_token', $firstUser);

        // 3. Tạo dữ liệu cho repair_orders, parts, payments, cash_transactions
        $device = DeviceModel::withoutGlobalScopes()->create([
            'tenant_id'  => $this->tenant->id,
            'name'       => 'AirPods Pro 2',
            'category'   => 'AirPods',
            'model_code' => 'APP2-AGG-' . rand(100, 999),
            'is_active'  => true,
        ]);

        $customer = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Aggregation',
            'phone'     => '0903334455',
        ]);

        $order1 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'technician_id'      => $this->techMinh->id,
            'created_by_user_id' => $this->techMinh->id,
            'order_code'         => 'RO-AGG-01',
            'order_type'         => 'in_store',
            'status'             => 'completed',
            'issue_description'  => 'Thay pin AirPods Pro 2',
            'total_price'        => 500000,
            'initial_price'      => 500000,
        ]);

        $order2 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'technician_id'      => $this->techTuan->id,
            'created_by_user_id' => $this->techTuan->id,
            'order_code'         => 'RO-AGG-02',
            'order_type'         => 'cod',
            'status'             => 'completed',
            'issue_description'  => 'Thay vỏ hộp sạc AirPods Pro 2',
            'total_price'        => 1500000,
            'initial_price'      => 1500000,
        ]);

        // Đơn đã hủy không được cộng vào tổng doanh thu khi chạy Smart Aggregation trên repair_orders
        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'technician_id'      => $this->techMinh->id,
            'created_by_user_id' => $this->techMinh->id,
            'order_code'         => 'RO-AGG-CANCELLED',
            'order_type'         => 'in_store',
            'status'             => 'cancelled',
            'issue_description'  => 'Đơn hủy',
            'total_price'        => 8000000,
            'initial_price'      => 8000000,
        ]);

        Payment::withoutGlobalScopes()->create([
            'payment_code'        => 'PAY-AGG-01',
            'repair_order_id'     => $order1->id,
            'amount'              => 500000,
            'refund_amount'       => 0,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $this->techMinh->id,
        ]);

        Payment::withoutGlobalScopes()->create([
            'payment_code'        => 'PAY-AGG-02',
            'repair_order_id'     => $order2->id,
            'amount'              => 1500000,
            'refund_amount'       => 0,
            'payment_method'      => 'bank_transfer',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $this->techTuan->id,
        ]);

        CashTransaction::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'transaction_code'   => 'CT-AGG-01',
            'type'               => 'in',
            'category'           => 'repair_payment',
            'amount'             => 2000000,
            'payment_method'     => 'cash',
            'description'        => 'Thu tiền sửa chữa trong ngày',
            'transaction_date'   => now()->toDateString(),
            'created_by_user_id' => $this->techMinh->id,
        ]);

        Part::withoutGlobalScopes()->create([
            'tenant_id'         => $this->tenant->id,
            'sku'               => 'LK-APP2-PIN-' . rand(100, 999),
            'name'              => 'Pin tai nghe AirPods Pro 2',
            'category'          => 'battery',
            'compatible_models' => 'AirPods Pro 2',
            'storage_location'  => 'Tủ A1',
            'cost_price'        => 120000,
            'retail_price'      => 350000,
            'stock_quantity'    => 10,
            'min_stock_alert'   => 3,
            'unit'              => 'viên',
            'is_active'         => true,
        ]);

        RepairService::withoutGlobalScopes()->create([
            'device_model_id'       => $device->id,
            'name'                  => 'Dịch vụ thay pin AirPods Pro 2',
            'code'                  => 'SRV-APP2-PIN-' . rand(100, 999),
            'category'              => 'battery',
            'base_price'            => 350000,
            'default_warranty_days' => 90,
            'is_active'             => true,
        ]);

        // 4. Kiểm tra RBAC chặn payments và cash_transactions cho technician & receptionist
        foreach (['payments', 'cash_transactions'] as $restrictedFinancialEntity) {
            $techDenied = $fallbackTool->execute(['entity' => $restrictedFinancialEntity], $this->techRecipient);
            $this->assertTrue($techDenied['permission_denied'] ?? false);

            $recDenied = $fallbackTool->execute(['entity' => $restrictedFinancialEntity], $this->receptionistRecipient);
            $this->assertTrue($recDenied['permission_denied'] ?? false);

            $adminAllowed = $fallbackTool->execute(['entity' => $restrictedFinancialEntity], $this->adminRecipient);
            $this->assertArrayNotHasKey('error', $adminAllowed);
            $this->assertGreaterThanOrEqual(1, $adminAllowed['total_matched']);
        }

        // 5. Kiểm tra RBAC ẩn trường giá tiền/giá vốn cho technician trên repair_orders, parts, repair_services
        $techOrders = $fallbackTool->execute(['entity' => 'repair_orders'], $this->techRecipient);
        $this->assertTrue($techOrders['financial_fields_redacted'] ?? false);
        $this->assertNull($techOrders['items'][0]['total_price']);

        $techParts = $fallbackTool->execute(['entity' => 'parts'], $this->techRecipient);
        $this->assertTrue($techParts['financial_fields_redacted'] ?? false);
        $this->assertNull($techParts['items'][0]['cost_price']);
        $this->assertNull($techParts['items'][0]['retail_price']);

        $techServices = $fallbackTool->execute(['entity' => 'repair_services'], $this->techRecipient);
        $this->assertTrue($techServices['financial_fields_redacted'] ?? false);
        $this->assertNull($techServices['items'][0]['base_price']);

        // Technician bị chặn khi cố tình chạy Smart Aggregation sum/max/min trên trường tiền tệ
        $techAggDenied = $fallbackTool->execute([
            'entity'             => 'repair_orders',
            'aggregate_function' => 'sum',
            'aggregate_field'    => 'total_price',
        ], $this->techRecipient);
        $this->assertTrue($techAggDenied['permission_denied'] ?? false);

        // Nhưng Technician vẫn được phép đếm số lượng đơn (count) theo trạng thái
        $techCountAllowed = $fallbackTool->execute([
            'entity'             => 'repair_orders',
            'aggregate_function' => 'count',
            'group_by'           => 'status',
        ], $this->techRecipient);
        $this->assertArrayNotHasKey('error', $techCountAllowed);
        $this->assertSame('aggregation', $techCountAllowed['mode']);
        $this->assertSame(2.0, $techCountAllowed['aggregation']['value']);

        // 6. Kiểm tra Smart Aggregation Mode cho Admin (sum total_price theo technician trên repair_orders, tự động loại đơn cancelled)
        $adminAggOrders = $fallbackTool->execute([
            'entity'             => 'repair_orders',
            'aggregate_function' => 'sum',
            'aggregate_field'    => 'total_price',
            'group_by'           => 'technician',
            'sort_by'            => 'metric_desc',
        ], $this->adminRecipient);

        $this->assertSame('aggregation', $adminAggOrders['mode']);
        $this->assertSame(2, $adminAggOrders['aggregation']['total_records']);
        $this->assertSame(2000000.0, $adminAggOrders['aggregation']['value']);
        $this->assertSame('2.000.000 đ', $adminAggOrders['aggregation']['formatted_value']);
        $this->assertCount(2, $adminAggOrders['groups']);
        $this->assertSame('KTV Tuấn', $adminAggOrders['groups'][0]['group_label']);
        $this->assertSame(1500000.0, $adminAggOrders['groups'][0]['metric_value']);
        $this->assertSame(75.0, $adminAggOrders['groups'][0]['share_percent']);

        $aggHtml = $fallbackTool->formatHtml($adminAggOrders);
        $this->assertStringContainsString('<b>Thống kê dữ liệu - Danh sách đơn sửa chữa</b>', $aggHtml);
        $this->assertStringContainsString('2.000.000 đ', $aggHtml);
        $this->assertStringContainsString('KTV Tuấn', $aggHtml);
        $this->assertStringContainsString('1.500.000 đ', $aggHtml);

        // Kiểm tra Smart Aggregation trên payments gom theo payment_method
        $adminAggPayments = $fallbackTool->execute([
            'entity'             => 'payments',
            'aggregate_function' => 'sum',
            'aggregate_field'    => 'amount',
            'group_by'           => 'payment_method',
        ], $this->adminRecipient);

        $this->assertSame(2000000.0, $adminAggPayments['aggregation']['value']);
        $this->assertSame('Chuyển khoản', $adminAggPayments['groups'][0]['group_label']);
    }

    /**
     * Task 4.1 & 4.2: Kiểm thử E2E qua Webhook cho 3 câu hỏi phân tích/xếp hạng trọng tâm:
     *  1) "Đơn sửa chữa nào doanh thu cao nhất?"
     *  2) "Kỹ thuật viên nào có tỷ lệ bảo hành cao nhất?"
     *  3) Thống kê động qua fallback_schema_query.
     */
    public function test_e2e_webhook_answers_highest_revenue_order_and_highest_warranty_rate_technician(): void
    {
        $device = DeviceModel::withoutGlobalScopes()->create([
            'tenant_id'  => $this->tenant->id,
            'name'       => 'AirPods Max USB-C',
            'category'   => 'AirPods',
            'model_code' => 'APM-E2E-' . rand(100, 999),
            'is_active'  => true,
        ]);

        $customer = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Anh Long VIP',
            'phone'     => '0908889999',
        ]);

        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'technician_id'       => $this->techMinh->id,
            'created_by_user_id'  => $this->techMinh->id,
            'order_code'          => 'RO-MAX-4500K',
            'order_type'          => 'warranty',
            'status'              => 'completed',
            'issue_description'   => 'Thay cụm headband và IC nguồn AirPods Max',
            'total_price'         => 4500000,
            'repair_started_at'   => now()->subMinutes(80),
            'repair_completed_at' => now()->subMinutes(20),
        ]);

        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'technician_id'       => $this->techTuan->id,
            'created_by_user_id'  => $this->techTuan->id,
            'order_code'          => 'RO-MIN-300K',
            'order_type'          => 'in_store',
            'status'              => 'completed',
            'issue_description'   => 'Vệ sinh đệm tai AirPods Max',
            'total_price'         => 300000,
            'repair_started_at'   => now()->subMinutes(40),
            'repair_completed_at' => now()->subMinutes(10),
        ]);

        $routerPayloads = [];

        Http::fake(function ($request) use (&$routerPayloads) {
            if (str_contains($request->url(), '/v1/chat/completions')) {
                $body = $request->data();
                $routerPayloads[] = $body;
                $callIndex = count($routerPayloads);

                // Kịch bản 1 - Turn 1: AI gọi lookup_repair_orders nhưng truyền nhầm keyword = 'doanh thu cao nhất' và quên sort_by
                if ($callIndex === 1) {
                    return Http::response([
                        'choices' => [
                            [
                                'message' => [
                                    'role'       => 'assistant',
                                    'content'    => null,
                                    'tool_calls' => [
                                        [
                                            'id'       => 'call_max_rev_order',
                                            'type'     => 'function',
                                            'function' => [
                                                'name'      => 'lookup_repair_orders',
                                                'arguments' => json_encode([
                                                    'keyword' => 'doanh thu cao nhất',
                                                ], JSON_UNESCAPED_UNICODE),
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ], 200);
                }

                // Kịch bản 1 - Turn 2 Synthesis: trả về rỗng để kiểm chứng Instant HTML Fallback hiển thị đơn RO-MAX-4500K đứng đầu
                if ($callIndex === 2) {
                    return Http::response([
                        'choices' => [
                            [
                                'message' => [
                                    'role'    => 'assistant',
                                    'content' => '',
                                ],
                            ],
                        ],
                    ], 200);
                }

                // Kịch bản 2 - Turn 1: AI gọi get_staff_kpi nhưng quên truyền sort_by cho câu hỏi "Kỹ thuật viên nào có tỷ lệ bảo hành cao nhất?"
                if ($callIndex === 3) {
                    return Http::response([
                        'choices' => [
                            [
                                'message' => [
                                    'role'       => 'assistant',
                                    'content'    => null,
                                    'tool_calls' => [
                                        [
                                            'id'       => 'call_staff_warranty_rate',
                                            'type'     => 'function',
                                            'function' => [
                                                'name'      => 'get_staff_kpi',
                                                'arguments' => json_encode([
                                                    'period' => 'this_month',
                                                ], JSON_UNESCAPED_UNICODE),
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ], 200);
                }

                // Kịch bản 2 - Turn 2 Synthesis
                return Http::response([
                    'choices' => [
                        [
                            'message' => [
                                'role'    => 'assistant',
                                'content' => "<b>Xếp hạng tỷ lệ bảo hành kỹ thuật viên tại Chi nhánh Quận 1</b>\n- <b>KTV Minh</b> có tỷ lệ bảo hành cao nhất là <b>100%</b> (1/1 đơn hoàn tất), trong khi <b>KTV Tuấn</b> là <b>0%</b>.",
                            ],
                        ],
                    ],
                ], 200);
            }

            return Http::response(['ok' => true], 200);
        });

        // 1. Gửi câu hỏi "Đơn sửa chữa nào doanh thu cao nhất?"
        $res1 = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 98001,
            'message'   => [
                'message_id' => 801,
                'chat'       => ['id' => 8841956777, 'type' => 'private'],
                'text'       => 'Đơn sửa chữa nào doanh thu cao nhất?',
            ],
        ]);
        $res1->assertStatus(200)->assertJsonPath('data.handled', true);

        // Xác nhận Turn 2 nhận được dữ liệu đơn RO-MAX-4500K (4.500.000 đ) đứng đầu nhờ auto-enrich sort_by = price_desc
        $turn2OrderPayload = (string) ($routerPayloads[1]['messages'][1]['content'] ?? '');
        $this->assertStringContainsString('"sort_by":"price_desc"', $turn2OrderPayload);
        $this->assertStringContainsString('RO-MAX-4500K', $turn2OrderPayload);
        $this->assertStringContainsString('4.500.000 đ', $turn2OrderPayload);

        // 2. Gửi câu hỏi "Kỹ thuật viên nào có tỷ lệ bảo hành cao nhất?"
        $res2 = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 98002,
            'message'   => [
                'message_id' => 802,
                'chat'       => ['id' => 8841956777, 'type' => 'private'],
                'text'       => 'Kỹ thuật viên nào có tỷ lệ bảo hành cao nhất?',
            ],
        ]);
        $res2->assertStatus(200)->assertJsonPath('data.handled', true);

        $turn2KpiPayload = (string) ($routerPayloads[3]['messages'][1]['content'] ?? '');
        $this->assertStringContainsString('"sort_by":"warranty_rate_desc"', $turn2KpiPayload);
        $this->assertStringContainsString('KTV Minh', $turn2KpiPayload);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === '8841956777'
                && str_contains($request['text'], '<b>KTV Minh</b> có tỷ lệ bảo hành cao nhất là <b>100%</b>');
        });
    }

    /**
     * Kiểm thử trực diện 2 câu hỏi thực tế từ ảnh chụp màn hình của người dùng:
     * - Câu 1: "tỉ lệ bảo hành" / "tỷ lệ bảo hành của kỹ thuật viên"
     * - Câu 2: "đơn hàng nào có doanh thu cao nhất" khi LLM gọi "lookup_repair_order" (kể cả số ít)
     *          và truyền nhầm keyword = "đơn hàng nào có doanh thu cao nhất" hoặc "doanh thu cao nhất".
     */
    public function test_screenshot_scenarios_lookup_repair_order_with_full_question_keyword_and_warranty_rate_queries(): void
    {
        $device = DeviceModel::withoutGlobalScopes()->create([
            'tenant_id'  => $this->tenant->id,
            'name'       => 'AirPods Pro 2 USB-C',
            'category'   => 'AirPods',
            'model_code' => 'APP2-SCR-' . rand(100, 999),
            'is_active'  => true,
        ]);

        $customer = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Thực Tế Screenshot',
            'phone'     => '0907776655',
        ]);

        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'technician_id'       => $this->techMinh->id,
            'created_by_user_id'  => $this->techMinh->id,
            'order_code'          => 'PCQ1-HIGHEST-5200K',
            'order_type'          => 'warranty',
            'status'              => 'completed',
            'issue_description'   => 'Thay cặp tai nghe + hộp sạc zin',
            'total_price'         => 5200000,
            'repair_started_at'   => now()->subMinutes(50),
            'repair_completed_at' => now()->subMinutes(10),
        ]);

        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'technician_id'       => $this->techTuan->id,
            'created_by_user_id'  => $this->techTuan->id,
            'order_code'          => 'PCQ1-NORMAL-450K',
            'order_type'          => 'in_store',
            'status'              => 'completed',
            'issue_description'   => 'Thay pin tai phải',
            'total_price'         => 450000,
            'repair_started_at'   => now()->subMinutes(35),
            'repair_completed_at' => now()->subMinutes(5),
        ]);

        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'technician_id'      => $this->techMinh->id,
            'created_by_user_id' => $this->techMinh->id,
            'order_code'         => 'PCQ1-REJECTED-9999K',
            'order_type'         => 'in_store',
            'status'             => 'rejected',
            'issue_description'  => 'Khách từ chối sửa',
            'total_price'        => 9999000,
        ]);

        $routerPayloads = [];

        Http::fake(function ($request) use (&$routerPayloads) {
            if (str_contains($request->url(), '/v1/chat/completions')) {
                $body = $request->data();
                $routerPayloads[] = $body;
                $callIndex = count($routerPayloads);

                // Lượt 1 - Turn 1: Người dùng hỏi "đơn hàng nào có doanh thu cao nhất",
                // LLM gọi alias số ít 'lookup_repair_order' và nhét nguyên câu hỏi vào keyword
                if ($callIndex === 1) {
                    return Http::response([
                        'choices' => [
                            [
                                'message' => [
                                    'role'       => 'assistant',
                                    'content'    => null,
                                    'tool_calls' => [
                                        [
                                            'id'       => 'call_singular_lookup',
                                            'type'     => 'function',
                                            'function' => [
                                                'name'      => 'lookup_repair_order',
                                                'arguments' => json_encode([
                                                    'keyword' => 'đơn hàng nào có doanh thu cao nhất',
                                                ], JSON_UNESCAPED_UNICODE),
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ], 200);
                }

                // Lượt 1 - Turn 2: Trả về rỗng để kiểm tra Instant HTML Fallback trả đúng đơn PCQ1-HIGHEST-5200K đầu tiên
                if ($callIndex === 2) {
                    return Http::response([
                        'choices' => [
                            [
                                'message' => [
                                    'role'    => 'assistant',
                                    'content' => '',
                                ],
                            ],
                        ],
                    ], 200);
                }

                // Lượt 2 - Turn 1: Người dùng hỏi "tỉ lệ bảo hành của kỹ thuật viên", LLM gọi get_staff_kpi
                if ($callIndex === 3) {
                    return Http::response([
                        'choices' => [
                            [
                                'message' => [
                                    'role'       => 'assistant',
                                    'content'    => null,
                                    'tool_calls' => [
                                        [
                                            'id'       => 'call_warranty_rate',
                                            'type'     => 'function',
                                            'function' => [
                                                'name'      => 'get_staff_kpi',
                                                'arguments' => json_encode([
                                                    'sort_by' => 'completed_desc',
                                                ], JSON_UNESCAPED_UNICODE),
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
                                'content' => '',
                            ],
                        ],
                    ],
                ], 200);
            }

            return Http::response(['ok' => true], 200);
        });

        /** @var TelegramAiAssistantService $assistant */
        $assistant = $this->app->make(TelegramAiAssistantService::class);

        $ok1 = $assistant->handleIncomingMessage($this->adminRecipient, 'đơn hàng nào có doanh thu cao nhất');
        $this->assertTrue($ok1);

        $turn2OrderPayload = (string) ($routerPayloads[1]['messages'][1]['content'] ?? '');
        $this->assertStringContainsString('"sort_by":"price_desc"', $turn2OrderPayload);
        $this->assertStringContainsString('"keyword":null', $turn2OrderPayload);
        $this->assertStringContainsString('PCQ1-HIGHEST-5200K', $turn2OrderPayload);
        $this->assertStringContainsString('5.200.000 đ', $turn2OrderPayload);
        $this->assertStringNotContainsString('PCQ1-REJECTED-9999K', $turn2OrderPayload);

        $ok2 = $assistant->handleIncomingMessage($this->adminRecipient, 'tỉ lệ bảo hành của kỹ thuật viên');
        $this->assertTrue($ok2);

        $turn2KpiPayload = (string) ($routerPayloads[3]['messages'][1]['content'] ?? '');
        $this->assertStringContainsString('"sort_by":"warranty_rate_desc"', $turn2KpiPayload);
        $this->assertStringContainsString('"warranty_rate":100', $turn2KpiPayload);
        $this->assertStringContainsString('"warranty_count":1', $turn2KpiPayload);
    }
}
