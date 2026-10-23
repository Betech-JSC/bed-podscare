<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\IntakeChecklist;
use App\Models\Part;
use App\Models\Payment;
use App\Models\QcInspection;
use App\Models\QuoteItem;
use App\Models\RepairOrder;
use App\Models\RepairQuote;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use App\Services\OrderWorkflowService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class KpiSqlAggregationAndHotIndexesTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branchA;
    protected Branch $branchB;
    protected User $admin;
    protected User $tech;
    protected User $cskh;
    protected Customer $customer;
    protected DeviceModel $deviceModel;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'       => 'kpi_sql_' . uniqid(),
            'name'       => 'PodsCare SQL Agg Store',
            'status'     => 'active',
            'plan'       => 'pro',
            'expires_at' => now()->addYear(),
        ]);

        $this->branchA = Branch::create([
            'tenant_id' => $this->tenant->id,
            'code'      => 'CN_KPI_A_' . uniqid(),
            'name'      => 'Chi Nhánh KPI A',
            'address'   => '123 Nguyễn Huệ',
            'phone'     => '0901112223',
            'is_active' => true,
        ]);

        $this->branchB = Branch::create([
            'tenant_id' => $this->tenant->id,
            'code'      => 'CN_KPI_B_' . uniqid(),
            'name'      => 'Chi Nhánh KPI B',
            'address'   => '456 Lê Lợi',
            'phone'     => '0901112224',
            'is_active' => true,
        ]);

        $this->admin = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'Admin KPI',
            'email'     => 'admin_kpi_' . uniqid() . '@podscare.vn',
            'phone'     => '091' . rand(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->tech = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'KTV SQL Agg',
            'email'     => 'tech_kpi_' . uniqid() . '@podscare.vn',
            'phone'     => '092' . rand(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->cskh = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branchA->id,
            'name'      => 'CSKH SQL Agg',
            'email'     => 'cskh_kpi_' . uniqid() . '@podscare.vn',
            'phone'     => '093' . rand(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id'    => $this->tenant->id,
            'name'         => 'Khách KPI Test',
            'phone'        => '094' . rand(1000000, 9999999),
            'orders_count' => 0,
            'total_spent'  => 0,
        ]);

        $this->deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'tenant_id'   => $this->tenant->id,
            'name'        => 'AirPods Pro 2',
            'category'    => 'AirPods',
            'model_code'  => 'A2931_' . uniqid(),
            'description' => 'Test model',
        ]);
    }

    /**
     * 1. Xác minh 5 chỉ mục nóng (Hot Query Indexes Phase 4) tồn tại trong DB.
     */
    public function test_phase_4_hot_query_indexes_exist_in_schema(): void
    {
        $this->assertTrue(Schema::hasIndex('repair_orders', 'idx_ro_tenant_batch_code'));
        $this->assertTrue(Schema::hasIndex('payments', 'idx_pay_tenant_tx_ref'));
        $this->assertTrue(Schema::hasIndex('notifications', 'idx_notif_user_read'));
        $this->assertTrue(Schema::hasIndex('notifications', 'idx_notif_branch_read'));
        $this->assertTrue(Schema::hasIndex('telegram_recipients', 'idx_tg_connect_token'));
    }

    /**
     * 2. Xác minh KpiController::staff() sử dụng SQL Aggregation (<= 6 câu SQL) và áp dụng đúng bộ lọc ngày/chi nhánh cho QC.
     */
    public function test_kpi_staff_uses_sql_aggregation_and_filters_qc_by_date_and_branch(): void
    {
        $inRangeDate = Carbon::parse('2026-10-10 10:00:00');
        $outOfRangeDate = Carbon::parse('2026-09-01 10:00:00');

        // Đơn 1: Trong khoảng ngày, tại branchA, hoàn tất + QC pass
        $order1 = RepairOrder::forceCreate([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branchA->id,
            'order_code'          => 'PCKPIA1_' . uniqid(),
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->deviceModel->id,
            'technician_id'       => $this->tech->id,
            'created_by_user_id'  => $this->cskh->id,
            'status'              => 'completed',
            'issue_description'   => 'Thay pin AirPods',
            'total_price'         => 500000,
            'repair_started_at'   => $inRangeDate->copy(),
            'repair_completed_at' => $inRangeDate->copy()->addMinutes(60),
            'qc_passed_at'        => $inRangeDate->copy()->addMinutes(70),
            'created_at'          => $inRangeDate,
            'updated_at'          => $inRangeDate,
        ]);
        QcInspection::create([
            'repair_order_id' => $order1->id,
            'inspector_id'    => $this->admin->id,
            'result'          => 'pass',
            'rework_count'    => 0,
        ]);

        // Đơn 2: Ngoài khoảng ngày (tháng 9), QC fail -> không được làm sai lệch tỉ lệ QC của tháng 10
        $orderOut = RepairOrder::forceCreate([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branchA->id,
            'order_code'          => 'PCKPIA2_' . uniqid(),
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->deviceModel->id,
            'technician_id'       => $this->tech->id,
            'created_by_user_id'  => $this->cskh->id,
            'status'              => 'rework_needed',
            'issue_description'   => 'Lỗi mic',
            'total_price'         => 300000,
            'created_at'          => $outOfRangeDate,
            'updated_at'          => $outOfRangeDate,
        ]);
        QcInspection::create([
            'repair_order_id' => $orderOut->id,
            'inspector_id'    => $this->admin->id,
            'result'          => 'fail',
            'rework_count'    => 1,
        ]);

        // Đơn 3: Trong khoảng ngày nhưng ở branchB (QC fail) -> khi lọc branchA không được tính vào
        $orderBranchB = RepairOrder::forceCreate([
            'tenant_id'           => $this->tenant->id,
            'branch_id'           => $this->branchB->id,
            'order_code'          => 'PCKPIB1_' . uniqid(),
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->deviceModel->id,
            'technician_id'       => $this->tech->id,
            'created_by_user_id'  => $this->cskh->id,
            'status'              => 'rework_needed',
            'issue_description'   => 'Rè loa',
            'total_price'         => 400000,
            'created_at'          => $inRangeDate,
            'updated_at'          => $inRangeDate,
        ]);
        QcInspection::create([
            'repair_order_id' => $orderBranchB->id,
            'inspector_id'    => $this->admin->id,
            'result'          => 'fail',
            'rework_count'    => 1,
        ]);

        DB::enableQueryLog();
        DB::flushQueryLog();

        $res = $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/v1/kpi/staff?branch_id={$this->branchA->id}&from_date=2026-10-01&to_date=2026-10-31");

        $queries = DB::getQueryLog();
        DB::disableQueryLog();

        $res->assertStatus(200)
            ->assertJsonPath('success', true);

        // Xác nhận số câu truy vấn SQL được gom nhóm tối ưu (không bị N+1 theo từng nhân viên/đơn hàng)
        $this->assertLessThanOrEqual(8, count($queries));

        $techRow = collect($res->json('data.technicians'))->firstWhere('id', $this->tech->id);
        $this->assertNotNull($techRow);
        $this->assertSame(1, $techRow['total_orders']);
        $this->assertSame(1, $techRow['completed']);
        $this->assertSame(0, $techRow['rework_needed']);
        $this->assertEquals(100.0, $techRow['qc_pass_rate']);
        $this->assertEquals(500000.0, (float) $techRow['revenue_generated']);

        $cskhRow = collect($res->json('data.cskh'))->firstWhere('id', $this->cskh->id);
        $this->assertNotNull($cskhRow);
        $this->assertSame(1, $cskhRow['orders_created_count']);
        $this->assertSame(1, $cskhRow['orders_completed_count']);
    }

    /**
     * 3. Xác minh N+1 fix khi lưu checklist và khi tạo giao dịch kho.
     */
    public function test_checklist_bulk_insert_and_inventory_transaction_query_count(): void
    {
        $order = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branchA->id,
            'order_code'         => 'PCCHK_' . uniqid(),
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->deviceModel->id,
            'status'             => 'waiting_tech',
            'issue_description'  => 'Kiểm tra tổng quát',
            'total_price'        => 200000,
            'created_by_user_id' => $this->admin->id,
        ]);

        IntakeChecklist::create([
            'repair_order_id' => $order->id,
            'item_name'       => 'Mic trái',
            'status'          => 'pass',
            'note'            => 'Bình thường',
        ]);

        DB::enableQueryLog();
        DB::flushQueryLog();

        // Gửi 1 mục cũ giữ nguyên (không đổi) + 3 mục mới (bulk insert 1 query)
        $chkRes = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/v1/orders/{$order->id}/checklists", [
                'items' => [
                    ['item_name' => 'Mic trái', 'status' => 'pass', 'note' => 'Bình thường'],
                    ['item_name' => 'Mic phải', 'status' => 'fail', 'note' => 'Rè'],
                    ['item_name' => 'Pin trái', 'status' => 'pass', 'note' => null],
                    ['item_name' => 'Pin phải', 'status' => 'pass', 'note' => null],
                ],
            ]);

        $chkQueries = DB::getQueryLog();
        DB::disableQueryLog();

        $chkRes->assertStatus(200);
        $this->assertCount(4, $chkRes->json('data'));
        // Không có lệnh UPDATE dư thừa cho Mic trái và chỉ 1 lệnh INSERT gộp cho 3 mục mới
        $insertQueries = array_filter($chkQueries, fn ($q) => str_contains(strtolower($q['query']), 'insert into `intake_checklists`'));
        $updateQueries = array_filter($chkQueries, fn ($q) => str_contains(strtolower($q['query']), 'update `intake_checklists`'));
        $this->assertCount(1, $insertQueries);
        $this->assertCount(0, $updateQueries);
    }

    /**
     * 4. Xác minh Gói 2: completeOrderLifecycle hợp nhất (trừ kho 1 lần, kích hoạt bảo hành, tăng chi tiêu khách)
     *    và chuyển trạng thái trực tiếp sang waiting_qc + lọc danh sách waiting_qc nhiều ngày.
     */
    public function test_complete_order_lifecycle_dedup_and_waiting_qc_transitions_and_filter(): void
    {
        $part = Part::create([
            'tenant_id'        => $this->tenant->id,
            'sku'              => 'PART_DEDUP_' . uniqid(),
            'name'             => 'Pin AirPods Pro 2',
            'category'         => 'Pin',
            'storage_location' => 'Kệ A1',
            'cost_price'       => 100000,
            'sell_price'       => 250000,
            'stock_quantity'   => 10,
            'min_stock_alert'  => 2,
        ]);

        BranchPart::create([
            'branch_id'       => $this->branchA->id,
            'part_id'         => $part->id,
            'stock_quantity'  => 10,
            'min_stock_alert' => 2,
        ]);

        // Tạo đơn ở trạng thái waiting_tech cách đây 10 ngày
        $oldDate = Carbon::now()->subDays(10);
        $order = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branchA->id,
            'order_code'         => 'PCG2_' . uniqid(),
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->deviceModel->id,
            'status'             => 'waiting_tech',
            'issue_description'  => 'Thay pin mới',
            'total_price'        => 450000,
            'initial_price'      => 450000,
            'created_by_user_id' => $this->admin->id,
            'created_at'         => $oldDate,
            'updated_at'         => $oldDate,
        ]);

        $quote = RepairQuote::create([
            'tenant_id'           => $this->tenant->id,
            'repair_order_id'     => $order->id,
            'quote_number'        => 'QT_G2_' . uniqid(),
            'total_amount'        => 450000,
            'warranty_terms_days' => 180,
            'note'                => 'Báo giá thay pin',
            'status'              => 'approved',
            'sent_by_user_id'     => $this->admin->id,
            'responded_at'        => now(),
        ]);

        QuoteItem::create([
            'quote_id'    => $quote->id,
            'part_id'     => $part->id,
            'description' => 'Pin AirPods Pro 2',
            'quantity'    => 1,
            'unit_price'  => 250000,
            'amount'      => 250000,
        ]);

        // Chuyển thẳng từ waiting_tech -> waiting_qc (Task 1.3 Gói 2)
        $transRes = $this->actingAs($this->tech, 'sanctum')
            ->postJson("/api/v1/orders/{$order->id}/transition", [
                'status'              => 'waiting_qc',
                'repair_note'         => 'Đã thay pin mới',
                'parts_used_summary'  => '1x Pin AirPods Pro 2',
                'final_check_result'  => 'pass',
            ]);

        $transRes->assertStatus(200)
            ->assertJsonPath('data.status', 'waiting_qc')
            ->assertJsonPath('data.technician_id', $this->tech->id)
            ->assertJsonPath('data.repair_note', 'Đã thay pin mới');

        $order->refresh();
        $this->assertNotNull($order->tech_accepted_at);
        $this->assertNotNull($order->repair_started_at);
        $this->assertNotNull($order->repair_completed_at);

        // Truy vấn GET /api/v1/orders?status=waiting_qc trả về cả đơn tạo cách đây 10 ngày (Task 3.1 Gói 2)
        $qcListRes = $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/v1/orders?status=waiting_qc&branch_id={$this->branchA->id}");
        $qcListRes->assertStatus(200);
        $foundIds = collect($qcListRes->json('data.data'))->pluck('id')->all();
        $this->assertContains($order->id, $foundIds);

        // Chuyển sang ready_for_return và thanh toán toàn bộ qua PaymentController::store -> gọi completeOrderLifecycle() (Task 1.2 Gói 2)
        $order->update(['status' => 'ready_for_return']);

        $payRes = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/v1/payments', [
                'repair_order_id' => $order->id,
                'amount'          => 450000,
                'payment_method'  => 'bank_transfer',
                'auto_confirm'    => true,
            ]);
        $payRes->assertStatus(201);

        $order->refresh();
        $part->refresh();
        $this->customer->refresh();

        $this->assertSame('completed', $order->status);
        $this->assertNotNull($order->handed_over_at);
        $this->assertSame(9, (int) $part->stock_quantity);
        $this->assertSame(1, (int) $this->customer->orders_count);
        $this->assertEquals(450000.0, (float) $this->customer->total_spent);
        $this->assertSame(1, Warranty::where('repair_order_id', $order->id)->count());

        // Gọi lại completeOrderLifecycle lần 2 -> idempotent, không trừ kho đúp, không cộng đúp chi tiêu khách
        app(OrderWorkflowService::class)->completeOrderLifecycle($order, ['user' => $this->admin]);
        $part->refresh();
        $this->customer->refresh();
        $this->assertSame(9, (int) $part->stock_quantity);
        $this->assertSame(1, (int) $this->customer->orders_count);
        $this->assertSame(1, Warranty::where('repair_order_id', $order->id)->count());
    }
}
