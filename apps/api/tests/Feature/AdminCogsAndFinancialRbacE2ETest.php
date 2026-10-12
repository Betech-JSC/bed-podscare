<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\InventoryTransaction;
use App\Models\Part;
use App\Models\RepairQuote;
use App\Models\QuoteItem;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * End-to-End & Integration Test for Admin COGS Privacy & Financial RBAC
 * 
 * Verifies Task Group 5 (Tasks 5.2 & 5.3):
 * 1. Admin receives full financial disclosure: cost_price, unit_cost, daily_revenue, 
 *    selected_date_cogs, selected_date_gross_profit, accounts_receivable, reconciliation amounts.
 * 2. Technician & Receptionist payloads are 100% sanitized: zero cost_price, zero unit_cost,
 *    zero revenue or receivable fields, displaying only operational metrics.
 */
class AdminCogsAndFinancialRbacE2ETest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected User $adminUser;
    protected User $technicianUser;
    protected User $receptionistUser;
    protected Part $batteryPart;
    protected Part $screenPart;
    protected Customer $customer;
    protected DeviceModel $device;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_e2e_' . uniqid(),
            'name'   => 'PodsCare E2E Financial RBAC Store',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Quận 1 E2E',
            'code'      => 'BR_E2E_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '77 Nguyễn Du, Bến Nghé, Quận 1',
            'is_active' => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Giám Đốc E2E',
            'email'     => 'admin_e2e_' . uniqid() . '@podscare.vn',
            'phone'     => '0908' . rand(100000, 999999),
            'password'  => Hash::make('SecretAdmin123!'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->technicianUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'KTV Trưởng E2E',
            'email'     => 'tech_e2e_' . uniqid() . '@podscare.vn',
            'phone'     => '0907' . rand(100000, 999999),
            'password'  => Hash::make('SecretTech123!'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->receptionistUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Lễ Tân Thu Ngân E2E',
            'email'     => 'recep_e2e_' . uniqid() . '@podscare.vn',
            'phone'     => '0906' . rand(100000, 999999),
            'password'  => Hash::make('SecretRecep123!'),
            'role'      => 'receptionist',
            'is_active' => true,
        ]);

        $this->batteryPart = Part::create([
            'tenant_id'         => $this->tenant->id,
            'sku'               => 'BAT-E2E-' . uniqid(),
            'name'              => 'Pin AirPods Pro 2 E2E',
            'category'          => 'battery',
            'compatible_models' => 'AirPods Pro 2',
            'storage_location'  => 'Kệ A1-01',
            'stock_quantity'    => 50,
            'min_stock_alert'   => 5,
            'cost_price'        => 220000,
            'retail_price'      => 550000,
            'unit'              => 'viên',
            'is_active'         => true,
        ]);

        $this->screenPart = Part::create([
            'tenant_id'         => $this->tenant->id,
            'sku'               => 'SCR-E2E-' . uniqid(),
            'name'              => 'Màn Loa AirPods Pro 2 E2E',
            'category'          => 'speaker',
            'compatible_models' => 'AirPods Pro 2',
            'storage_location'  => 'Kệ B2-04',
            'stock_quantity'    => 30,
            'min_stock_alert'   => 5,
            'cost_price'        => 120000,
            'retail_price'      => 300000,
            'unit'              => 'cái',
            'is_active'         => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng VIP E2E',
            'phone'     => '0919' . rand(100000, 999999),
            'email'     => 'vip_e2e_' . uniqid() . '@customer.test',
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro 2',
            'category'     => 'AirPods',
            'model_code'   => 'A2931',
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);

        // Tạo 1 giao dịch nhập kho
        InventoryTransaction::create([
            'transaction_code'   => 'TX-E2E-' . uniqid(),
            'part_id'            => $this->batteryPart->id,
            'branch_id'          => $this->branch->id,
            'transaction_type'   => 'import',
            'quantity'           => 10,
            'unit_cost'          => 210000,
            'notes'              => 'Giao dịch nhập kho E2E',
            'created_by_user_id' => $this->adminUser->id,
        ]);

        // Tạo 1 đơn hoàn tất hôm nay có quote items với parts
        $today = Carbon::today('Asia/Ho_Chi_Minh');
        $completedOrder = RepairOrder::create([
            'tenant_id'           => $this->tenant->id,
            'order_code'          => 'FX26-' . rand(10000, 99999),
            'branch_id'           => $this->branch->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->device->id,
            'issue_description'   => 'Pin chai và hỏng loa',
            'status'              => 'completed',
            'total_price'         => 850000,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $this->receptionistUser->id,
            'technician_id'       => $this->technicianUser->id,
            'handed_over_at'      => $today->copy()->hour(11),
        ]);

        $quote = RepairQuote::create([
            'tenant_id'           => $this->tenant->id,
            'repair_order_id'     => $completedOrder->id,
            'quote_number'        => 'QT-E2E-' . uniqid(),
            'total_amount'        => 850000,
            'warranty_terms_days' => 90,
            'note'                => 'Báo giá E2E thay pin và màn loa',
            'status'              => 'approved',
            'sent_by_user_id'     => $this->adminUser->id,
        ]);

        QuoteItem::create([
            'quote_id'    => $quote->id,
            'part_id'     => $this->batteryPart->id,
            'description' => $this->batteryPart->name,
            'quantity'    => 1,
            'unit_price'  => 550000,
            'amount'      => 550000,
        ]);

        QuoteItem::create([
            'quote_id'    => $quote->id,
            'part_id'     => $this->screenPart->id,
            'description' => $this->screenPart->name,
            'quantity'    => 1,
            'unit_price'  => 300000,
            'amount'      => 300000,
        ]);

        // Đơn hoàn tất đã thanh toán đủ 850.000
        \App\Models\Payment::create([
            'payment_code'        => 'FX26-PY-' . rand(1000, 9999),
            'repair_order_id'     => $completedOrder->id,
            'amount'              => 850000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => $today->copy()->hour(11),
            'received_by_user_id' => $this->receptionistUser->id,
        ]);

        // Tạo 1 đơn đang sẵn sàng giao (ready_for_return) để test công nợ phải thu (accounts receivable)
        RepairOrder::create([
            'tenant_id'           => $this->tenant->id,
            'order_code'          => 'FX26-' . rand(10000, 99999),
            'branch_id'           => $this->branch->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->device->id,
            'issue_description'   => 'Vệ sinh tai nghe',
            'status'              => 'ready_for_return',
            'total_price'         => 350000,
            'warranty_terms_days' => 30,
            'created_by_user_id'  => $this->receptionistUser->id,
        ]);
    }

    /**
     * Task 5.2: Kiểm tra tích hợp bằng tài khoản Admin thực tế
     * Xác minh Admin xem được đầy đủ doanh thu, COGS, Gross Profit, Công nợ phải thu trên Dashboard và giá vốn trên trang Kho.
     */
    public function test_task_5_2_admin_end_to_end_receives_complete_financial_metrics(): void
    {
        // 1. Kho linh kiện: Admin xem được cost_price trong danh sách linh kiện
        $partsResp = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/inventory/parts?branch_id={$this->branch->id}");
        $partsResp->assertOk();
        $parts = $partsResp->json('data.data');
        $this->assertNotEmpty($parts);
        $battery = collect($parts)->firstWhere('id', $this->batteryPart->id);
        $this->assertNotNull($battery);
        $this->assertArrayHasKey('cost_price', $battery);
        $this->assertEquals(220000, (float) $battery['cost_price']);

        // 2. Giao dịch kho: Admin xem được unit_cost trong danh sách giao dịch
        $txResp = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/inventory/transactions?branch_id={$this->branch->id}");
        $txResp->assertOk();
        $txList = $txResp->json('data.data');
        $this->assertNotEmpty($txList);
        $firstTx = $txList[0];
        $this->assertArrayHasKey('unit_cost', $firstTx);
        $this->assertEquals(210000, (float) $firstTx['unit_cost']);

        // 3. KPI Dashboard: Admin xem được đầy đủ 6 chỉ số tài chính chuyên sâu
        $todayStr = Carbon::today('Asia/Ho_Chi_Minh')->format('Y-m-d');
        $kpiResp = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi?branch_id={$this->branch->id}&date={$todayStr}");
        $kpiResp->assertOk();
        $kpiData = $kpiResp->json('data');

        // Doanh thu
        $this->assertArrayHasKey('daily_revenue', $kpiData);
        $this->assertEquals(850000, $kpiData['daily_revenue']);
        $this->assertArrayHasKey('selected_date_revenue', $kpiData);
        $this->assertEquals(850000, $kpiData['selected_date_revenue']);

        // COGS (Giá vốn hàng bán = 220.000 pin + 120.000 màn loa = 340.000)
        $this->assertArrayHasKey('selected_date_cogs', $kpiData);
        $this->assertEquals(340000, $kpiData['selected_date_cogs']);
        $this->assertArrayHasKey('selected_date_cogs_formatted', $kpiData);

        // Lợi nhuận gộp Gross Profit = 850.000 - 340.000 = 510.000
        $this->assertArrayHasKey('selected_date_gross_profit', $kpiData);
        $this->assertEquals(510000, $kpiData['selected_date_gross_profit']);
        $this->assertArrayHasKey('selected_date_gross_profit_margin', $kpiData);
        $this->assertEquals(60.0, round((float) $kpiData['selected_date_gross_profit_margin'], 1));

        // Công nợ phải thu (Accounts Receivable từ đơn ready_for_return: 350.000)
        $this->assertArrayHasKey('accounts_receivable', $kpiData);
        $this->assertEquals(350000, $kpiData['accounts_receivable']);
        $this->assertArrayHasKey('accounts_receivable_formatted', $kpiData);

        // Biểu đồ doanh thu
        $this->assertArrayHasKey('revenue_chart', $kpiData);
        $this->assertNotEmpty($kpiData['revenue_chart']);

        // Đối soát tài chính (Reconciliation amounts)
        $this->assertArrayHasKey('reconciliation', $kpiData);
        $recon = $kpiData['reconciliation'];
        $this->assertArrayHasKey('ready_for_pickup_amount', $recon);
        $this->assertEquals(350000, $recon['ready_for_pickup_amount']);
        $this->assertArrayHasKey('total_uncollected_amount', $recon);
        $this->assertEquals(350000, $recon['total_uncollected_amount']);
    }

    /**
     * Task 5.3: Kiểm tra tích hợp bằng tài khoản Technician & Receptionist thực tế
     * Xác minh không thấy giá vốn ở cả UI lẫn Network tab payload, và Dashboard chỉ hiển thị thẻ chỉ số vận hành.
     */
    public function test_task_5_3_technician_and_receptionist_payloads_are_strictly_masked(): void
    {
        $nonAdminRoles = [
            'technician'   => $this->technicianUser,
            'receptionist' => $this->receptionistUser,
        ];

        $todayStr = Carbon::today('Asia/Ho_Chi_Minh')->format('Y-m-d');

        foreach ($nonAdminRoles as $roleName => $user) {
            // 1. Kho: KTV & Lễ tân KHÔNG BAO GIỜ nhận cost_price trong danh sách hoặc chi tiết linh kiện
            $partsResp = $this->actingAs($user, 'sanctum')
                ->getJson("/api/v1/inventory/parts?branch_id={$this->branch->id}");
            $partsResp->assertOk();
            $partsResp->assertJsonMissing(['cost_price' => 220000]);
            $partsResp->assertJsonMissing(['cost_price' => 120000]);
            foreach ($partsResp->json('data.data') as $part) {
                $this->assertArrayNotHasKey('cost_price', $part, "Role {$roleName} must not receive cost_price in parts list");
                $this->assertArrayHasKey('retail_price', $part);
            }

            $detailResp = $this->actingAs($user, 'sanctum')
                ->getJson("/api/v1/inventory/parts/{$this->batteryPart->id}");
            $detailResp->assertOk();
            $this->assertArrayNotHasKey('cost_price', $detailResp->json('data'), "Role {$roleName} must not receive cost_price in part detail");

            // 2. Giao dịch kho: KTV & Lễ tân KHÔNG nhận unit_cost trong danh sách giao dịch
            $txResp = $this->actingAs($user, 'sanctum')
                ->getJson("/api/v1/inventory/transactions?branch_id={$this->branch->id}");
            $txResp->assertOk();
            $txResp->assertJsonMissing(['unit_cost' => 210000]);
            foreach ($txResp->json('data.data') as $tx) {
                $this->assertArrayNotHasKey('unit_cost', $tx, "Role {$roleName} must not receive unit_cost in transactions");
                if (isset($tx['part'])) {
                    $this->assertArrayNotHasKey('cost_price', $tx['part']);
                }
            }

            // 3. KPI Dashboard: KTV & Lễ tân KHÔNG nhận bất kỳ trường tài chính nào
            $kpiResp = $this->actingAs($user, 'sanctum')
                ->getJson("/api/v1/kpi?branch_id={$this->branch->id}&date={$todayStr}");
            $kpiResp->assertOk();
            $kpiData = $kpiResp->json('data');

            // Xác minh tuyệt đối không tồn tại các trường tài chính nhạy cảm
            $forbiddenFinancialKeys = [
                'daily_revenue',
                'daily_revenue_formatted',
                'monthly_revenue',
                'monthly_revenue_formatted',
                'selected_date_revenue',
                'selected_date_revenue_formatted',
                'selected_date_cogs',
                'selected_date_cogs_formatted',
                'selected_date_gross_profit',
                'selected_date_gross_profit_formatted',
                'selected_date_gross_profit_margin',
                'monthly_cogs',
                'monthly_cogs_formatted',
                'monthly_gross_profit',
                'monthly_gross_profit_formatted',
                'accounts_receivable',
                'accounts_receivable_formatted',
                'revenue_chart',
            ];

            foreach ($forbiddenFinancialKeys as $key) {
                $this->assertArrayNotHasKey($key, $kpiData, "Role {$roleName} payload must NOT contain financial key '{$key}'");
                if (isset($kpiData['summary'])) {
                    $this->assertArrayNotHasKey($key, $kpiData['summary'], "Role {$roleName} summary must NOT contain financial key '{$key}'");
                }
            }

            // Đối soát tài chính: Chỉ có số lượng đơn (counts), KHÔNG có số tiền (amounts)
            $this->assertArrayHasKey('reconciliation', $kpiData);
            $recon = $kpiData['reconciliation'];
            $this->assertArrayHasKey('in_workshop_count', $recon);
            $this->assertArrayHasKey('ready_for_pickup_count', $recon);
            $this->assertArrayNotHasKey('in_workshop_amount', $recon, "Role {$roleName} must not receive in_workshop_amount");
            $this->assertArrayNotHasKey('total_uncollected_amount', $recon, "Role {$roleName} must not receive total_uncollected_amount");

            // Chỉ số vận hành phải đầy đủ
            $this->assertArrayHasKey('completed_orders', $kpiData);
            $this->assertArrayHasKey('selected_date_completed_orders', $kpiData);
            $this->assertArrayHasKey('status_distribution', $kpiData);
            $this->assertArrayHasKey('operational_summary', $kpiData);
        }
    }
}
