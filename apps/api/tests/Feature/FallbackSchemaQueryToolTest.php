<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CommonIssue;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\GoodsReceipt;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\RepairService;
use App\Models\Shipment;
use App\Models\Supplier;
use App\Models\SupplierDebtTransaction;
use App\Models\TelegramRecipient;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WorkShift;
use App\Services\TelegramAi\TelegramAiAssistantService;
use App\Services\TelegramAi\TelegramAiToolRegistry;
use App\Services\TelegramAi\Tools\FallbackSchemaQueryTool;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class FallbackSchemaQueryToolTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected Branch $branchA1;
    protected Branch $branchA2;
    protected Branch $branchB1;
    protected User $staffA1;
    protected User $staffB1;
    protected TelegramRecipient $adminRecipientA1;
    protected TelegramRecipient $techRecipientA1;
    protected TelegramRecipient $receptionistRecipientA1;
    protected FallbackSchemaQueryTool $tool;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();

        Config::set('services.telegram.bot_token', 'test_bot_token_phase4');
        Config::set('services.telegram.bot_username', 'PodsCareNotifyBot');
        Config::set('services.telegram.webhook_secret', '');
        Config::set('services.gemini.base_url', 'http://127.0.0.1:20128/v1');
        Config::set('services.gemini.api_key', '9router-local');
        Config::set('services.gemini.model', 'podscare-ai');
        Config::set('services.gemini.fallback_models', '');
        Config::set('services.gemini.timeout', 20);

        $this->tenantA = Tenant::create([
            'name'   => 'PodsCare Tenant A',
            'code'   => 'tenant-a-p4-' . uniqid(),
            'status' => 'active',
        ]);

        $this->tenantB = Tenant::create([
            'name'   => 'PodsCare Tenant B',
            'code'   => 'tenant-b-p4-' . uniqid(),
            'status' => 'active',
        ]);

        $this->branchA1 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'CN-Q1-' . rand(100, 999),
            'address'   => '123 Nguyễn Huệ, Q1',
            'phone'     => '0901112233',
            'is_active' => true,
        ]);

        $this->branchA2 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Quận 7',
            'code'      => 'CN-Q7-' . rand(100, 999),
            'address'   => '456 Nguyễn Thị Thập, Q7',
            'phone'     => '0902223344',
            'is_active' => true,
        ]);

        $this->branchB1 = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Chi nhánh Đối Thủ B',
            'code'      => 'CN-B1-' . rand(100, 999),
            'address'   => '789 Cầu Giấy, HN',
            'phone'     => '0909998888',
            'is_active' => true,
        ]);

        $this->staffA1 = User::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'KTV Lê Hoàng',
            'email'     => 'ktv.hoang.p4.' . uniqid() . '@podscare.vn',
            'phone'     => '0912345678',
            'password'  => 'password123',
            'is_active' => true,
        ]);

        $this->staffB1 = User::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantB->id,
            'branch_id' => $this->branchB1->id,
            'name'      => 'KTV Bên B',
            'email'     => 'ktv.b1.p4.' . uniqid() . '@podscare.vn',
            'phone'     => '0987654321',
            'password'  => 'password123',
            'is_active' => true,
        ]);

        $this->adminRecipientA1 = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => $this->branchA1->id,
            'label'             => 'Admin Quận 1',
            'phone'             => '0862389728',
            'target_role'       => 'admin',
            'telegram_chat_id'  => '8841956401',
            'connect_token'     => 'adm_p4_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);

        $this->techRecipientA1 = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => $this->branchA1->id,
            'label'             => 'KTV Quận 1',
            'phone'             => '0912345678',
            'target_role'       => 'technician',
            'telegram_chat_id'  => '8841956402',
            'connect_token'     => 'tech_p4_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);

        $this->receptionistRecipientA1 = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => $this->branchA1->id,
            'label'             => 'Lễ Tân Quận 1',
            'phone'             => '0912345679',
            'target_role'       => 'receptionist',
            'telegram_chat_id'  => '8841956403',
            'connect_token'     => 'rec_p4_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);

        $this->tool = new FallbackSchemaQueryTool();
    }

    /**
     * 1. Kiểm tra Auto-Discovery đăng ký FallbackSchemaQueryTool ở cuối danh sách
     *    và kiểm tra tra cứu Nhóm 1: repair_services & common_issues.
     */
    public function test_group_1_queries_repair_services_and_common_issues_with_clean_vietnamese_html(): void
    {
        /** @var TelegramAiToolRegistry $registry */
        $registry = $this->app->make(TelegramAiToolRegistry::class);
        $registeredKeys = array_keys($registry->all());
        $this->assertSame('fallback_schema_query', end($registeredKeys));

        $deviceModel = DeviceModel::create([
            'name'         => 'AirPods Pro 2 Gen USB-C',
            'category'     => 'AirPods',
            'model_code'   => 'A3048-P4-' . rand(100, 999),
            'release_year' => 2023,
            'manufacturer' => 'Apple',
            'has_anc'      => true,
            'is_active'    => true,
        ]);

        $service1 = RepairService::create([
            'device_model_id'       => $deviceModel->id,
            'name'                  => 'Thay pin tai nghe AirPods Pro 2 chính hãng',
            'code'                  => 'SRV-PIN-APP2-' . rand(100, 999),
            'category'              => 'battery',
            'base_price'            => 350000,
            'default_warranty_days' => 90,
            'description'           => 'Pin chuẩn dung lượng gốc, bảo hành 3 tháng',
            'is_active'             => true,
        ]);

        RepairService::create([
            'device_model_id'       => $deviceModel->id,
            'name'                  => 'Thay màng loa chống ồn ANC AirPods Pro 2',
            'code'                  => 'SRV-LOA-APP2-' . rand(100, 999),
            'category'              => 'audio',
            'base_price'            => 550000,
            'default_warranty_days' => 180,
            'description'           => 'Khắc phục rè loa khi bật xuyên âm',
            'is_active'             => true,
        ]);

        CommonIssue::create([
            'device_model_id'      => $deviceModel->id,
            'category'             => 'AirPods',
            'issue_name'           => 'Tai nghe AirPods Pro 2 bị sôi rè khi bật chống ồn',
            'solution'             => 'Thay màng loa cảm biến áp suất ANC',
            'estimated_time'       => '45 phút',
            'suggested_service_id' => $service1->id,
            'estimated_cost'       => 550000,
            'order_index'          => 1,
            'is_active'            => true,
        ]);

        // Tra cứu repair_services
        $serviceRes = $this->tool->execute([
            'entity'  => 'repair_services',
            'keyword' => 'AirPods Pro 2',
            'sort_by' => 'price_asc',
        ], $this->adminRecipientA1);

        $this->assertArrayNotHasKey('error', $serviceRes);
        $this->assertGreaterThanOrEqual(2, $serviceRes['total_matched']);
        $this->assertSame(350000.0, $serviceRes['items'][0]['base_price']);
        $this->assertSame(90, $serviceRes['items'][0]['warranty_days']);
        $this->assertSame('AirPods Pro 2 Gen USB-C', $serviceRes['items'][0]['device_model_name']);

        $serviceHtml = $this->tool->formatHtml($serviceRes);
        $this->assertStringContainsString('<b>Bảng giá dịch vụ sửa chữa niêm yết</b>', $serviceHtml);
        $this->assertStringContainsString('350.000 đ', $serviceHtml);
        $this->assertStringContainsString('90 ngày', $serviceHtml);

        // Tra cứu common_issues
        $issueRes = $this->tool->execute([
            'entity'  => 'common_issues',
            'keyword' => 'sôi rè',
        ], $this->techRecipientA1);

        $this->assertArrayNotHasKey('error', $issueRes);
        $this->assertSame(1, $issueRes['total_matched']);
        $this->assertSame('Tai nghe AirPods Pro 2 bị sôi rè khi bật chống ồn', $issueRes['items'][0]['name']);
        $this->assertSame(550000.0, $issueRes['items'][0]['estimated_price']);

        $issueHtml = $this->tool->formatHtml($issueRes);
        $this->assertStringContainsString('<b>Danh mục lỗi thường gặp &amp; hướng xử lý</b>', $issueHtml);
        $this->assertStringContainsString('550.000 đ', $issueHtml);
        $this->assertStringContainsString('Thay màng loa cảm biến áp suất ANC', $issueHtml);
    }

    /**
     * 2. Kiểm tra Nhóm 2: suppliers, goods_receipts, supplier_debt_transactions cho Admin
     *    và xác nhận chặn quyền truy cập đối với technician / receptionist.
     */
    public function test_group_2_queries_suppliers_goods_receipts_and_debt_for_admin_and_denies_non_admin(): void
    {
        $supplier1 = Supplier::withoutGlobalScopes()->create([
            'tenant_id'    => $this->tenantA->id,
            'code'         => 'NCC-LK-01',
            'name'         => 'Linh Kiện Táo Vàng Sài Gòn',
            'phone'        => '0903111222',
            'debt_balance' => 4500000,
            'is_active'    => true,
        ]);

        $supplier2 = Supplier::withoutGlobalScopes()->create([
            'tenant_id'    => $this->tenantA->id,
            'code'         => 'NCC-LK-02',
            'name'         => 'Phụ Kiện Zin Miền Nam',
            'phone'        => '0903333444',
            'debt_balance' => 1200000,
            'is_active'    => true,
        ]);

        // Nhà cung cấp của Tenant B (không được rò rỉ)
        Supplier::withoutGlobalScopes()->create([
            'tenant_id'    => $this->tenantB->id,
            'code'         => 'NCC-TENANT-B',
            'name'         => 'Nhà Cung Cấp Bí Mật Bên B',
            'phone'        => '0999888777',
            'debt_balance' => 99000000,
            'is_active'    => true,
        ]);

        $receipt = GoodsReceipt::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'supplier_id'        => $supplier1->id,
            'receipt_code'       => 'PNK-Q1-191001',
            'status'             => 'completed',
            'total_amount'       => 8000000,
            'discount_amount'    => 500000,
            'final_amount'       => 7500000,
            'paid_amount'        => 3000000,
            'debt_amount'        => 4500000,
            'payment_method'     => 'bank_transfer',
            'notes'              => 'Nhập lô pin AirPods Pro 2 và cáp sạc',
            'created_by_user_id' => $this->staffA1->id,
        ]);

        SupplierDebtTransaction::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'supplier_id'        => $supplier1->id,
            'goods_receipt_id'   => $receipt->id,
            'transaction_code'   => 'GDNo-191001',
            'transaction_type'   => 'purchase_debt',
            'amount'             => 4500000,
            'debt_before'        => 0,
            'debt_after'         => 4500000,
            'payment_method'     => 'none',
            'notes'              => 'Ghi nợ phiếu nhập PNK-Q1-191001',
            'created_by_user_id' => $this->staffA1->id,
        ]);

        // Admin truy vấn danh sách nhà cung cấp sắp xếp theo công nợ giảm dần
        $supRes = $this->tool->execute([
            'entity'  => 'suppliers',
            'sort_by' => 'debt_desc',
        ], $this->adminRecipientA1);

        $this->assertArrayNotHasKey('error', $supRes);
        $this->assertSame(2, $supRes['total_matched']);
        $this->assertSame('Linh Kiện Táo Vàng Sài Gòn', $supRes['items'][0]['name']);
        $this->assertSame(4500000.0, $supRes['items'][0]['debt_balance']);
        $this->assertSame(7500000.0, $supRes['items'][0]['total_purchased']);
        $this->assertSame('Phụ Kiện Zin Miền Nam', $supRes['items'][1]['name']);

        $supHtml = $this->tool->formatHtml($supRes);
        $this->assertStringContainsString('Linh Kiện Táo Vàng Sài Gòn', $supHtml);
        $this->assertStringContainsString('4.500.000 đ', $supHtml);
        $this->assertStringContainsString('7.500.000 đ', $supHtml);
        $this->assertStringNotContainsString('Nhà Cung Cấp Bí Mật Bên B', $supHtml);

        // Admin truy vấn phiếu nhập kho
        $grRes = $this->tool->execute([
            'entity'  => 'goods_receipts',
            'keyword' => 'PNK-Q1-191001',
        ], $this->adminRecipientA1);

        $this->assertArrayNotHasKey('error', $grRes);
        $this->assertSame(1, $grRes['total_matched']);
        $this->assertSame('PNK-Q1-191001', $grRes['items'][0]['receipt_code']);
        $this->assertSame(7500000.0, $grRes['items'][0]['total_amount']);
        $this->assertSame(4500000.0, $grRes['items'][0]['debt_amount']);

        // Admin truy vấn lịch sử giao dịch công nợ NCC
        $txRes = $this->tool->execute([
            'entity'  => 'supplier_debt_transactions',
            'keyword' => 'Táo Vàng',
        ], $this->adminRecipientA1);

        $this->assertArrayNotHasKey('error', $txRes);
        $this->assertSame(1, $txRes['total_matched']);
        $this->assertSame('GDNo-191001', $txRes['items'][0]['transaction_code']);
        $this->assertSame(4500000.0, $txRes['items'][0]['balance_after']);

        $superAdminRecipientA1 = TelegramRecipient::create([
            'tenant_id'         => $this->tenantA->id,
            'branch_id'         => $this->branchA1->id,
            'label'             => 'Super Admin Quận 1',
            'phone'             => '0862389700',
            'target_role'       => 'super_admin',
            'telegram_chat_id'  => '8841956400',
            'connect_token'     => 'sadm_p4_' . uniqid(),
            'subscribed_events' => ['order.created'],
            'is_active'         => true,
            'connected_at'      => now(),
        ]);

        // Super Admin cũng truy vấn được đầy đủ cả 3 bảng nhạy cảm
        foreach (['suppliers', 'goods_receipts', 'supplier_debt_transactions'] as $adminEntity) {
            $superRes = $this->tool->execute(['entity' => $adminEntity], $superAdminRecipientA1);
            $this->assertArrayNotHasKey('error', $superRes);
            $this->assertGreaterThanOrEqual(1, $superRes['total_matched']);
        }

        // Technician và Receptionist bị từ chối truy cập cả 3 bảng nhạy cảm này
        foreach (['suppliers', 'goods_receipts', 'supplier_debt_transactions'] as $restrictedEntity) {
            $deniedTech = $this->tool->execute(['entity' => $restrictedEntity], $this->techRecipientA1);
            $this->assertTrue($deniedTech['permission_denied'] ?? false);
            $this->assertSame(
                'Bạn không có quyền truy cập dữ liệu nhà cung cấp, phiếu nhập kho và công nợ.',
                $deniedTech['error'] ?? null
            );

            $deniedHtml = $this->tool->formatHtml($deniedTech);
            $this->assertStringContainsString('<b>Từ chối quyền truy cập</b>', $deniedHtml);
            $this->assertStringContainsString('Bạn không có quyền truy cập dữ liệu nhà cung cấp, phiếu nhập kho và công nợ.', $deniedHtml);

            $deniedRec = $this->tool->execute(['entity' => $restrictedEntity], $this->receptionistRecipientA1);
            $this->assertTrue($deniedRec['permission_denied'] ?? false);
        }
    }

    /**
     * 3. Kiểm tra Nhóm 3: work_shifts, đối soát chênh lệch tiền mặt (cash_diff_desc), cách ly theo branch_id
     *    và phân quyền chi tiết giữa Admin/SuperAdmin/Receptionist (xem đủ két tiền) với Technician (ẩn két tiền).
     */
    public function test_group_3_queries_work_shifts_with_branch_isolation_and_cash_difference_sorting(): void
    {
        WorkShift::withoutGlobalScopes()->create([
            'tenant_id'            => $this->tenantA->id,
            'branch_id'            => $this->branchA1->id,
            'shift_code'           => 'CA-Q1-SANG',
            'cashier_id'           => $this->staffA1->id,
            'opened_at'            => now()->subHours(8),
            'closed_at'            => now()->subHours(1),
            'status'               => 'closed',
            'opening_cash'         => 2000000,
            'expected_cash'        => 5500000,
            'actual_cash'          => 5500000,
            'difference_amount'    => 0,
            'reconciliation_notes' => 'Khớp két tiền buổi sáng',
            'closed_by_user_id'    => $this->staffA1->id,
        ]);

        WorkShift::withoutGlobalScopes()->create([
            'tenant_id'            => $this->tenantA->id,
            'branch_id'            => $this->branchA1->id,
            'shift_code'           => 'CA-Q1-CHIEU',
            'cashier_id'           => $this->staffA1->id,
            'opened_at'            => now()->subHours(4),
            'closed_at'            => now(),
            'status'               => 'closed',
            'opening_cash'         => 2000000,
            'expected_cash'        => 6000000,
            'actual_cash'          => 5850000,
            'difference_amount'    => -150000,
            'reconciliation_notes' => 'Thiếu 150k tiền lẻ thối khách',
            'closed_by_user_id'    => $this->staffA1->id,
        ]);

        // Ca làm việc của Chi nhánh Quận 7 (cùng Tenant A nhưng khác branch_id của adminRecipientA1)
        WorkShift::withoutGlobalScopes()->create([
            'tenant_id'            => $this->tenantA->id,
            'branch_id'            => $this->branchA2->id,
            'shift_code'           => 'CA-Q7-CHIEU',
            'cashier_id'           => $this->staffA1->id,
            'opened_at'            => now()->subHours(3),
            'status'               => 'open',
            'opening_cash'         => 3000000,
            'expected_cash'        => 3000000,
            'difference_amount'    => 0,
            'reconciliation_notes' => 'Ca Quận 7 không được hiển thị ở Quận 1',
        ]);

        // A. Admin xem đầy đủ số liệu két tiền
        $shiftRes = $this->tool->execute([
            'entity'  => 'work_shifts',
            'sort_by' => 'cash_diff_desc',
        ], $this->adminRecipientA1);

        $this->assertArrayNotHasKey('error', $shiftRes);
        $this->assertFalse($shiftRes['cash_fields_redacted'] ?? true);
        $this->assertSame(2, $shiftRes['total_matched']);
        $this->assertSame('CA-Q1-CHIEU', $shiftRes['items'][0]['shift_code']);
        $this->assertSame(-150000.0, $shiftRes['items'][0]['difference_amount']);
        $this->assertSame('CA-Q1-SANG', $shiftRes['items'][1]['shift_code']);

        $shiftHtml = $this->tool->formatHtml($shiftRes);
        $this->assertStringContainsString('CA-Q1-CHIEU', $shiftHtml);
        $this->assertStringContainsString('-150.000 đ', $shiftHtml);
        $this->assertStringNotContainsString('CA-Q7-CHIEU', $shiftHtml);

        // B. Receptionist (Lễ tân/Thu ngân) cũng được xem đầy đủ số liệu đối soát két tiền
        $recShiftRes = $this->tool->execute([
            'entity'  => 'work_shifts',
            'sort_by' => 'cash_diff_desc',
        ], $this->receptionistRecipientA1);

        $this->assertFalse($recShiftRes['cash_fields_redacted'] ?? true);
        $this->assertSame(2000000.0, $recShiftRes['items'][0]['opening_cash']);
        $this->assertSame(5850000.0, $recShiftRes['items'][0]['closing_cash']);
        $this->assertSame(-150000.0, $recShiftRes['items'][0]['difference_amount']);
        $recHtml = $this->tool->formatWorkShiftsHtml($recShiftRes);
        $this->assertStringContainsString('5.850.000 đ', $recHtml);
        $this->assertStringContainsString('-150.000 đ', $recHtml);

        // C. Technician (Kỹ thuật viên) chỉ xem được mã ca, nhân viên, chi nhánh, trạng thái, giờ mở/đóng; ẩn toàn bộ két tiền
        $techShiftRes = $this->tool->execute([
            'entity' => 'work_shifts',
        ], $this->techRecipientA1);

        $this->assertTrue($techShiftRes['cash_fields_redacted'] ?? false);
        $this->assertTrue($techShiftRes['cash_fields_hidden'] ?? false);
        $this->assertSame(2, $techShiftRes['total_matched']);

        $firstTechShift = $techShiftRes['items'][0];
        $this->assertSame('CA-Q1-CHIEU', $firstTechShift['shift_code']);
        $this->assertSame('KTV Lê Hoàng', $firstTechShift['cashier_name']);
        $this->assertSame('KTV Lê Hoàng', $firstTechShift['closed_by_name']);
        $this->assertSame('Chi nhánh Quận 1', $firstTechShift['branch_name']);
        $this->assertSame('closed', $firstTechShift['status']);
        $this->assertSame('Đã đóng ca', $firstTechShift['status_label']);
        $this->assertNotEmpty($firstTechShift['opened_at']);
        $this->assertNotEmpty($firstTechShift['closed_at']);
        $this->assertTrue($firstTechShift['cash_fields_redacted']);
        $this->assertNull($firstTechShift['opening_cash']);
        $this->assertNull($firstTechShift['closing_cash']);
        $this->assertNull($firstTechShift['actual_cash']);
        $this->assertNull($firstTechShift['expected_cash']);
        $this->assertNull($firstTechShift['difference_amount']);
        $this->assertNull($firstTechShift['cash_difference']);
        $this->assertNull($firstTechShift['reconciliation_notes']);

        $techShiftHtml = $this->tool->formatWorkShiftsHtml($techShiftRes);
        $this->assertStringContainsString('CA-Q1-CHIEU', $techShiftHtml);
        $this->assertStringContainsString('🔒 Đã ẩn (Chỉ Admin/Thu ngân)', $techShiftHtml);
        $this->assertStringNotContainsString('5.850.000 đ', $techShiftHtml);
        $this->assertStringNotContainsString('-150.000 đ', $techShiftHtml);
        $this->assertStringNotContainsString('Thiếu 150k tiền lẻ thối khách', $techShiftHtml);

        // Technician không thể dò tìm theo nội dung reconciliation_notes
        $techNoteProbe = $this->tool->execute([
            'entity'  => 'work_shifts',
            'keyword' => 'Thiếu 150k tiền lẻ',
        ], $this->techRecipientA1);
        $this->assertSame(0, $techNoteProbe['total_matched']);
    }

    /**
     * 4. Kiểm tra Nhóm 4: customers - xếp hạng khách hàng sửa nhiều lần nhất (sort_by = 'orders_desc'),
     *    loại trừ đơn đã hủy/từ chối sửa khỏi tổng chi tiêu và số lần sửa.
     */
    public function test_group_4_ranks_top_loyal_customers_by_orders_desc_excluding_cancelled_orders(): void
    {
        $deviceModel = DeviceModel::create([
            'name'         => 'AirPods 3',
            'category'     => 'AirPods',
            'model_code'   => 'A2564-P4-' . rand(100, 999),
            'release_year' => 2021,
            'manufacturer' => 'Apple',
            'has_anc'      => false,
            'is_active'    => true,
        ]);

        $vipCustomer = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Anh Tuấn Khách VIP',
            'phone'     => '0908888999',
            'address'   => 'Quận 1, TP.HCM',
        ]);

        $regularCustomer = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chị Lan Khách Thường',
            'phone'     => '0907777666',
            'address'   => 'Quận 3, TP.HCM',
        ]);

        // Tạo 3 đơn thành công + 1 đơn đã hủy cho Anh Tuấn Khách VIP
        for ($i = 1; $i <= 3; $i++) {
            RepairOrder::withoutGlobalScopes()->create([
                'tenant_id'          => $this->tenantA->id,
                'branch_id'          => $this->branchA1->id,
                'order_code'         => 'PCVIP19100' . $i,
                'customer_id'        => $vipCustomer->id,
                'device_model_id'    => $deviceModel->id,
                'issue_description'  => 'Thay pin AirPods lần ' . $i,
                'status'             => 'completed',
                'order_type'         => 'in_store',
                'total_price'        => 400000,
                'initial_price'      => 400000,
                'created_by_user_id' => $this->staffA1->id,
                'technician_id'      => $this->staffA1->id,
            ]);
        }

        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCVIP191099',
            'customer_id'        => $vipCustomer->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Đơn khách hủy không sửa',
            'status'             => 'cancelled',
            'order_type'         => 'in_store',
            'total_price'        => 900000,
            'initial_price'      => 900000,
            'created_by_user_id' => $this->staffA1->id,
        ]);

        // Tạo 1 đơn cho Chị Lan Khách Thường
        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCREG191001',
            'customer_id'        => $regularCustomer->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Vệ sinh tai nghe',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 150000,
            'initial_price'      => 150000,
            'created_by_user_id' => $this->staffA1->id,
        ]);

        $custRes = $this->tool->execute([
            'entity'  => 'customers',
            'sort_by' => 'orders_desc',
            'limit'   => 5,
        ], $this->adminRecipientA1);

        $this->assertArrayNotHasKey('error', $custRes);
        $this->assertSame(2, $custRes['total_matched']);
        $this->assertSame('Anh Tuấn Khách VIP', $custRes['items'][0]['name']);
        $this->assertSame(3, $custRes['items'][0]['orders_count']);
        $this->assertSame(1200000.0, $custRes['items'][0]['total_spent']);
        $this->assertSame('Chị Lan Khách Thường', $custRes['items'][1]['name']);
        $this->assertSame(1, $custRes['items'][1]['orders_count']);

        $custHtml = $this->tool->formatHtml($custRes);
        $this->assertStringContainsString('Anh Tuấn Khách VIP', $custHtml);
        $this->assertStringContainsString('3 đơn', $custHtml);
        $this->assertStringContainsString('1.200.000 đ', $custHtml);
    }

    /**
     * 5. Kiểm tra Nhóm 5: qc_inspections & shipments (vận đơn COD).
     */
    public function test_group_5_queries_qc_inspections_and_cod_shipments(): void
    {
        $deviceModel = DeviceModel::create([
            'name'         => 'Apple Watch Ultra 49mm',
            'category'     => 'Apple Watch',
            'model_code'   => 'A2684-P4-' . rand(100, 999),
            'release_year' => 2022,
            'manufacturer' => 'Apple',
            'has_anc'      => false,
            'is_active'    => true,
        ]);

        $customer = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Anh Khoa Khách Tỉnh COD',
            'phone'     => '0933444555',
            'address'   => 'Đà Nẵng',
        ]);

        $order = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCCOD191088',
            'customer_id'        => $customer->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Ép kính cảm ứng Apple Watch Ultra',
            'status'             => 'ready_for_return',
            'order_type'         => 'cod',
            'total_price'        => 1850000,
            'initial_price'      => 1850000,
            'shipping_address'   => '99 Bạch Đằng, Hải Châu, Đà Nẵng',
            'created_by_user_id' => $this->staffA1->id,
            'technician_id'      => $this->staffA1->id,
        ]);

        QcInspection::withoutGlobalScopes()->create([
            'tenant_id'       => $this->tenantA->id,
            'repair_order_id' => $order->id,
            'inspector_id'    => $this->staffA1->id,
            'result'          => 'pass',
            'notes'           => 'Cảm ứng mượt, áp suất chống nước đạt chuẩn',
        ]);

        Shipment::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'shipment_code'      => 'SHP-191088',
            'repair_order_id'    => $order->id,
            'delivery_method'    => 'courier',
            'carrier_name'       => 'Giao Hàng Tiết Kiệm',
            'tracking_code'      => 'GHTK88990011',
            'delivery_address'   => '99 Bạch Đằng, Hải Châu, Đà Nẵng',
            'status'             => 'shipping',
            'notes'              => 'Cho khách đồng kiểm khi nhận',
            'created_by_user_id' => $this->staffA1->id,
        ]);

        // Tra cứu qc_inspections
        $qcRes = $this->tool->execute([
            'entity'  => 'qc_inspections',
            'keyword' => 'PCCOD191088',
        ], $this->adminRecipientA1);

        $this->assertArrayNotHasKey('error', $qcRes);
        $this->assertSame(1, $qcRes['total_matched']);
        $this->assertSame('PCCOD191088', $qcRes['items'][0]['order_code']);
        $this->assertTrue($qcRes['items'][0]['overall_passed']);
        $this->assertSame('KTV Lê Hoàng', $qcRes['items'][0]['inspector_name']);

        $qcHtml = $this->tool->formatHtml($qcRes);
        $this->assertStringContainsString('PCCOD191088', $qcHtml);
        $this->assertStringContainsString('Đạt chuẩn QC', $qcHtml);

        // Tra cứu shipments
        $shipRes = $this->tool->execute([
            'entity'  => 'shipments',
            'keyword' => 'GHTK88990011',
        ], $this->adminRecipientA1);

        $this->assertArrayNotHasKey('error', $shipRes);
        $this->assertSame(1, $shipRes['total_matched']);
        $this->assertSame('PCCOD191088', $shipRes['items'][0]['order_code']);
        $this->assertSame('Giao Hàng Tiết Kiệm', $shipRes['items'][0]['carrier']);
        $this->assertSame('GHTK88990011', $shipRes['items'][0]['tracking_code']);
        $this->assertSame(1850000.0, $shipRes['items'][0]['cod_amount']);
        $this->assertSame('Anh Khoa Khách Tỉnh COD', $shipRes['items'][0]['recipient_name']);

        $shipHtml = $this->tool->formatHtml($shipRes);
        $this->assertStringContainsString('GHTK88990011', $shipHtml);
        $this->assertStringContainsString('1.850.000 đ', $shipHtml);
        $this->assertStringContainsString('Đang giao hàng', $shipHtml);
    }

    /**
     * 6. Kiểm tra từ chối mọi entity ngoài Allow-list, kiểm tra cách ly tenant_id tuyệt đối,
     *    escape wildcard SQL (%, _) và luồng E2E Webhook gọi fallback_schema_query qua 9Router.
     */
    public function test_rejects_disallowed_entities_enforces_tenant_isolation_and_executes_e2e_webhook_via_9router(): void
    {
        // 1) Từ chối các bảng nhạy cảm hoặc ngoài allow-list
        foreach (['users', 'tenants', 'personal_access_tokens', 'repair_orders', 'payments', ''] as $disallowedEntity) {
            $res = $this->tool->execute(['entity' => $disallowedEntity], $this->adminRecipientA1);
            $this->assertTrue($res['invalid_entity'] ?? false);
            $this->assertArrayHasKey('error', $res);
        }

        // 2) Kiểm tra escape wildcard % và _ trong keyword + cách ly Tenant B
        Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Khách giảm giá 100% VIP_1',
            'phone'     => '0901119991',
        ]);

        Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Khách giảm giá 1000 VIPA1',
            'phone'     => '0901119992',
        ]);

        Customer::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Khách giảm giá 100% VIP_1 Bên B',
            'phone'     => '0901119993',
        ]);

        $wildcardRes = $this->tool->execute([
            'entity'  => 'customers',
            'keyword' => '100% VIP_1',
        ], $this->adminRecipientA1);

        $this->assertSame(1, $wildcardRes['total_matched']);
        $this->assertSame('Khách giảm giá 100% VIP_1', $wildcardRes['items'][0]['name']);

        // 3) Kiểm tra System Instruction hướng dẫn AI gọi fallback_schema_query đúng phạm vi
        /** @var TelegramAiAssistantService $assistant */
        $assistant = $this->app->make(TelegramAiAssistantService::class);
        $sysPrompt = $assistant->buildSystemInstruction($this->adminRecipientA1);
        $this->assertStringContainsString('fallback_schema_query', $sysPrompt);
        $this->assertStringContainsString('lookup_repair_orders', $sysPrompt);

        // 4) Kiểm tra E2E Webhook gọi fallback_schema_query qua 9Router (auto-enrich sort_by = orders_desc)
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
                                            'id'       => 'call_fb_customers_01',
                                            'type'     => 'function',
                                            'function' => [
                                                'name'      => 'fallback_schema_query',
                                                'arguments' => json_encode([
                                                    'entity' => 'customers',
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
                                'content' => "<b>Khách hàng thân thiết tại Chi nhánh Quận 1</b>\n- <b>Khách giảm giá 100% VIP_1</b> (<code>0901119991</code>)",
                            ],
                        ],
                    ],
                ], 200);
            }

            return Http::response(['ok' => true], 200);
        });

        $webhookRes = $this->postJson('/api/v1/webhooks/telegram', [
            'update_id' => 94001,
            'message'   => [
                'message_id' => 401,
                'chat'       => ['id' => 8841956401, 'type' => 'private'],
                'text'       => 'Khách hàng nào sửa nhiều lần nhất tại cửa hàng?',
            ],
        ]);

        $webhookRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.handled', true);

        $this->assertCount(2, $routerPayloads);
        $turn2Content = (string) ($routerPayloads[1]['messages'][1]['content'] ?? '');
        $this->assertStringContainsString('"sort_by":"orders_desc"', $turn2Content);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/sendMessage')
                && (string) $request['chat_id'] === '8841956401'
                && str_contains($request['text'], '<b>Khách hàng thân thiết tại Chi nhánh Quận 1</b>');
        });
    }

    /**
     * 7. Giai đoạn 2 (Task 2.3) - Sắp xếp cash_diff_desc trực tiếp ở tầng SQL trước khi LIMIT
     *    và nâng giới hạn limit tối đa của FallbackSchemaQueryTool từ 10 lên 20 bản ghi.
     */
    public function test_phase2_work_shifts_sorts_by_cash_diff_desc_at_sql_level_and_supports_limit_up_to_20(): void
    {
        // Tạo 2 ca làm việc cũ nhất nhưng có độ lệch tiền mặt tuyệt đối lớn nhất (-800.000 đ và +650.000 đ)
        WorkShift::withoutGlobalScopes()->create([
            'tenant_id'            => $this->tenantA->id,
            'branch_id'            => $this->branchA1->id,
            'shift_code'           => 'CA-OLD-MAX-DIFF-1',
            'cashier_id'           => $this->staffA1->id,
            'opened_at'            => now()->subDays(15),
            'closed_at'            => now()->subDays(15)->addHours(8),
            'status'               => 'closed',
            'opening_cash'         => 2000000,
            'expected_cash'        => 5000000,
            'actual_cash'          => 4200000,
            'difference_amount'    => -800000,
            'reconciliation_notes' => 'Ca cũ lệch âm lớn nhất',
            'closed_by_user_id'    => $this->staffA1->id,
        ]);

        WorkShift::withoutGlobalScopes()->create([
            'tenant_id'            => $this->tenantA->id,
            'branch_id'            => $this->branchA1->id,
            'shift_code'           => 'CA-OLD-MAX-DIFF-2',
            'cashier_id'           => $this->staffA1->id,
            'opened_at'            => now()->subDays(14),
            'closed_at'            => now()->subDays(14)->addHours(8),
            'status'               => 'closed',
            'opening_cash'         => 2000000,
            'expected_cash'        => 5000000,
            'actual_cash'          => 5650000,
            'difference_amount'    => 650000,
            'reconciliation_notes' => 'Ca cũ lệch dương lớn thứ hai',
            'closed_by_user_id'    => $this->staffA1->id,
        ]);

        // Tạo tiếp 20 ca mới hơn nhưng không lệch tiền (difference_amount = 0)
        for ($i = 1; $i <= 20; $i++) {
            WorkShift::withoutGlobalScopes()->create([
                'tenant_id'            => $this->tenantA->id,
                'branch_id'            => $this->branchA1->id,
                'shift_code'           => sprintf('CA-NEW-ZERO-%02d', $i),
                'cashier_id'           => $this->staffA1->id,
                'opened_at'            => now()->subHours(25 - $i),
                'closed_at'            => now()->subHours(24 - $i),
                'status'               => 'closed',
                'opening_cash'         => 2000000,
                'expected_cash'        => 3000000,
                'actual_cash'          => 3000000,
                'difference_amount'    => 0,
                'reconciliation_notes' => 'Khớp két tiền',
                'closed_by_user_id'    => $this->staffA1->id,
            ]);
        }

        // Nhờ ORDER BY ABS(COALESCE(difference_amount, 0)) DESC ở tầng SQL trước khi LIMIT,
        // 2 ca cũ có chênh lệch lớn nhất phải đứng đầu ngay cả khi limit = 5
        $resTop5 = $this->tool->execute([
            'entity'  => 'work_shifts',
            'sort_by' => 'cash_diff_desc',
            'limit'   => 5,
        ], $this->adminRecipientA1);

        $this->assertCount(5, $resTop5['items']);
        $this->assertSame('CA-OLD-MAX-DIFF-1', $resTop5['items'][0]['shift_code']);
        $this->assertSame(-800000.0, $resTop5['items'][0]['difference_amount']);
        $this->assertSame('CA-OLD-MAX-DIFF-2', $resTop5['items'][1]['shift_code']);
        $this->assertSame(650000.0, $resTop5['items'][1]['difference_amount']);

        // Kiểm tra limit tối đa đã nâng lên 20 (truyền 25 sẽ giới hạn ở 20 bản ghi thay vì 10 như trước)
        $resLimit20 = $this->tool->execute([
            'entity'  => 'work_shifts',
            'sort_by' => 'cash_diff_desc',
            'limit'   => 25,
        ], $this->adminRecipientA1);

        $this->assertSame(22, $resLimit20['total_matched']);
        $this->assertCount(20, $resLimit20['items']);
    }

    /**
     * 8. Giai đoạn 3 (Task 3.1 & 3.3):
     *    - Khi truy vấn entity = 'customers' có branch_id, date_from/date_to hoặc khách chỉ có đơn đã hủy,
     *      không được fallback về cột tổng toàn hệ thống (orders_count / total_spent trên bảng customers).
     *    - withCount / withSum của repairOrders phải áp dụng bộ lọc khoảng ngày (date_from / date_to).
     *    - Kiểm tra checkdate() trong parseDate().
     */
    public function test_phase3_customers_filters_orders_count_and_spent_by_date_range_and_does_not_fallback_to_global_totals(): void
    {
        // 1. Kiểm tra parseDate() với checkdate()
        $this->assertNull($this->tool->parseDate('31/02/2026'));
        $this->assertNull($this->tool->parseDate('45/18'));

        $deviceModel = DeviceModel::create([
            'name'         => 'AirPods Pro 2',
            'category'     => 'AirPods',
            'model_code'   => 'A3048-P3-CUST-' . rand(100, 999),
            'release_year' => 2023,
            'manufacturer' => 'Apple',
            'has_anc'      => true,
            'is_active'    => true,
        ]);

        // Khách hàng A: có orders_count = 10, total_spent = 5.000.000 trên bảng customers,
        // nhưng tại Chi nhánh Quận 1 (branchA1) chỉ có 2 đơn đã hủy (cancelled), còn đơn thành công nằm ở Chi nhánh Quận 7 (branchA2)
        $customerOnlyCancelledInA1 = Customer::withoutGlobalScopes()->create([
            'tenant_id'    => $this->tenantA->id,
            'name'         => 'Khách Hủy Đơn Tại Quận 1',
            'phone'        => '0905000111',
            'orders_count' => 10,
            'total_spent'  => 5000000,
        ]);

        for ($i = 1; $i <= 2; $i++) {
            RepairOrder::withoutGlobalScopes()->create([
                'tenant_id'          => $this->tenantA->id,
                'branch_id'          => $this->branchA1->id,
                'order_code'         => 'PCA1-CANC-0' . $i,
                'customer_id'        => $customerOnlyCancelledInA1->id,
                'device_model_id'    => $deviceModel->id,
                'issue_description'  => 'Đơn hủy tại Quận 1 lần ' . $i,
                'status'             => 'cancelled',
                'order_type'         => 'in_store',
                'total_price'        => 500000,
                'initial_price'      => 500000,
                'created_by_user_id' => $this->staffA1->id,
            ]);
        }

        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA2->id,
            'order_code'         => 'PCA2-COMP-01',
            'customer_id'        => $customerOnlyCancelledInA1->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Đơn thành công tại Quận 7',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 4000000,
            'initial_price'      => 4000000,
            'created_by_user_id' => $this->staffA1->id,
        ]);

        // Khi Admin Quận 1 (branchA1) tra cứu khách hàng này -> số đơn hợp lệ và chi tiêu tại Quận 1 phải là 0, không fallback về 10 đơn / 5.000.000 đ
        $resBranchA1 = $this->tool->execute([
            'entity'  => 'customers',
            'keyword' => '0905000111',
        ], $this->adminRecipientA1);

        $this->assertSame(1, $resBranchA1['total_matched']);
        $this->assertSame(0, $resBranchA1['items'][0]['orders_count']);
        $this->assertSame(0.0, $resBranchA1['items'][0]['total_spent']);
        $this->assertSame('0 đ', $resBranchA1['items'][0]['formatted_total_spent']);

        // Khách hàng B: tạo từ tháng 08/2026, có 1 đơn tháng 09/2026 (900.000 đ) và 2 đơn tháng 10/2026 (400.000 đ x 2 = 800.000 đ)
        $customerDateScoped = Customer::withoutGlobalScopes()->create([
            'tenant_id'    => $this->tenantA->id,
            'name'         => 'Khách Thân Thiết Tháng 10',
            'phone'        => '0905000222',
            'orders_count' => 15,
            'total_spent'  => 9900000,
        ]);
        $customerDateScoped->timestamps = false;
        $customerDateScoped->created_at = \Illuminate\Support\Carbon::create(2026, 8, 10, 9, 0, 0);
        $customerDateScoped->updated_at = \Illuminate\Support\Carbon::create(2026, 8, 10, 9, 0, 0);
        $customerDateScoped->save();

        $sepOrder = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $this->tenantA->id,
            'branch_id'          => $this->branchA1->id,
            'order_code'         => 'PCQ1-SEP-01',
            'customer_id'        => $customerDateScoped->id,
            'device_model_id'    => $deviceModel->id,
            'issue_description'  => 'Đơn tháng 9',
            'status'             => 'completed',
            'order_type'         => 'in_store',
            'total_price'        => 900000,
            'initial_price'      => 900000,
            'created_by_user_id' => $this->staffA1->id,
        ]);
        $sepOrder->timestamps = false;
        $sepOrder->created_at = \Illuminate\Support\Carbon::create(2026, 9, 15, 10, 0, 0);
        $sepOrder->updated_at = \Illuminate\Support\Carbon::create(2026, 9, 15, 10, 0, 0);
        $sepOrder->save();

        foreach ([10, 20] as $idx => $day) {
            $octOrder = RepairOrder::withoutGlobalScopes()->create([
                'tenant_id'          => $this->tenantA->id,
                'branch_id'          => $this->branchA1->id,
                'order_code'         => 'PCQ1-OCT-0' . ($idx + 1),
                'customer_id'        => $customerDateScoped->id,
                'device_model_id'    => $deviceModel->id,
                'issue_description'  => 'Đơn tháng 10 lần ' . ($idx + 1),
                'status'             => 'completed',
                'order_type'         => 'in_store',
                'total_price'        => 400000,
                'initial_price'      => 400000,
                'created_by_user_id' => $this->staffA1->id,
            ]);
            $octOrder->timestamps = false;
            $octOrder->created_at = \Illuminate\Support\Carbon::create(2026, 10, $day, 14, 0, 0);
            $octOrder->updated_at = \Illuminate\Support\Carbon::create(2026, 10, $day, 14, 0, 0);
            $octOrder->save();
        }

        // Lọc khách hàng trong khoảng 01/10/2026 - 31/10/2026 -> chỉ tính 2 đơn tháng 10 (800.000 đ), không cộng đơn tháng 9 hay cột tổng 9.900.000 đ
        $resOct = $this->tool->execute([
            'entity'    => 'customers',
            'keyword'   => '0905000222',
            'date_from' => '01/10/2026',
            'date_to'   => '31/10/2026',
            'sort_by'   => 'orders_desc',
        ], $this->adminRecipientA1);

        $this->assertSame(1, $resOct['total_matched']);
        $this->assertSame(2, $resOct['items'][0]['orders_count']);
        $this->assertSame(800000.0, $resOct['items'][0]['total_spent']);
        $this->assertSame('800.000 đ', $resOct['items'][0]['formatted_total_spent']);
    }
}


