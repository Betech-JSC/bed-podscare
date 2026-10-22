<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\ChecklistTemplate;
use App\Models\CommonIssue;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\IntakeChecklist;
use App\Models\IntakePhoto;
use App\Models\InventoryTransaction;
use App\Models\Notification;
use App\Models\Part;
use App\Models\Partner;
use App\Models\Payment;
use App\Models\QcChecklistResult;
use App\Models\QcInspection;
use App\Models\QuoteItem;
use App\Models\RepairOrder;
use App\Models\RepairQuote;
use App\Models\RepairService;
use App\Models\Shipment;
use App\Models\ShipmentProof;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CleanTransactionalDataCommandTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Danh sách 21 bảng dữ liệu vận hành & giao dịch cần truncate.
     */
    protected array $transactionalTables = [
        'repair_orders',
        'customers',
        'intake_checklists',
        'intake_photos',
        'repair_quotes',
        'quote_items',
        'qc_inspections',
        'qc_checklist_results',
        'payments',
        'warranties',
        'warranty_claims',
        'shipments',
        'shipment_proofs',
        'inventory_transactions',
        'notifications',
        'audit_logs',
        'work_shifts',
        'cash_transactions',
        'goods_receipts',
        'goods_receipt_items',
        'supplier_debt_transactions',
    ];

    /**
     * Danh sách 9 bảng danh mục nền tảng được bảo lưu.
     */
    protected array $preservedTables = [
        'branches',
        'users',
        'device_models',
        'repair_services',
        'parts',
        'branch_parts',
        'partners',
        'checklist_templates',
        'common_issues',
    ];

    /**
     * Chuẩn bị dữ liệu mẫu cho toàn bộ 21 bảng vận hành và 9 bảng nền tảng.
     */
    protected function seedFullTestData(): void
    {
        $this->seed(DatabaseSeeder::class);

        $order = RepairOrder::first();
        $user = User::first();
        $branch = Branch::first();
        $part = Part::first();
        $partner = Partner::first();
        $warranty = Warranty::first();
        $inspection = QcInspection::first();

        // Đảm bảo các bảng giao dịch phụ trợ đều có dữ liệu trước khi chạy command
        if ($inspection && QcChecklistResult::count() === 0) {
            QcChecklistResult::create([
                'qc_inspection_id' => $inspection->id,
                'criterion'        => 'Loa và mic hoạt động rõ',
                'is_passed'        => true,
            ]);
        }

        if ($warranty && WarrantyClaim::count() === 0) {
            WarrantyClaim::create([
                'claim_code'          => 'CLM-TEST-0001',
                'warranty_id'         => $warranty->id,
                'issue_description'   => 'Lỗi rè tai nghe sau sửa',
                'resolution_mode'     => 'rework',
                'status'              => 'received',
                'received_by_user_id' => $user->id,
            ]);
        }

        if ($order && Shipment::count() === 0) {
            $shipment = Shipment::create([
                'shipment_code'       => 'SH-TEST-0001',
                'repair_order_id'     => $order->id,
                'partner_id'          => $partner?->id,
                'delivery_method'     => 'express',
                'carrier_name'        => 'GiaoHangNhanh',
                'status'              => 'pending',
                'created_by_user_id'  => $user->id,
            ]);

            ShipmentProof::create([
                'shipment_id' => $shipment->id,
                'photo_url'   => 'https://example.com/proof.jpg',
                'caption'     => 'Ảnh giao hàng thành công',
            ]);
        }

        if ($part && $branch && InventoryTransaction::count() === 0) {
            InventoryTransaction::create([
                'transaction_code'    => 'TRX-TEST-0001',
                'part_id'             => $part->id,
                'branch_id'           => $branch->id,
                'transaction_type'    => 'import',
                'quantity'            => 10,
                'unit_cost'           => 150000,
                'created_by_user_id'  => $user->id,
            ]);
        }

        if (Notification::count() === 0) {
            Notification::create([
                'user_id'   => $user->id,
                'branch_id' => $branch->id,
                'type'      => 'order_created',
                'title'     => 'Đơn hàng mới',
                'message'   => 'Đơn hàng vừa được tiếp nhận',
                'severity'  => 'info',
            ]);
        }

        if (AuditLog::count() === 0) {
            AuditLog::create([
                'user_id'        => $user->id,
                'user_name'      => $user->name,
                'action'         => 'created',
                'auditable_type' => RepairOrder::class,
                'auditable_id'   => $order ? $order->id : 1,
                'details'        => 'Khởi tạo đơn hàng kiểm thử',
            ]);
        }

        $tenantId = $user?->tenant_id ?? $branch?->tenant_id ?? \App\Models\Tenant::first()?->id;

        if ($branch && $user && \App\Models\WorkShift::withoutGlobalScopes()->count() === 0) {
            $shift = \App\Models\WorkShift::withoutGlobalScopes()->create([
                'tenant_id'       => $tenantId,
                'branch_id'       => $branch->id,
                'shift_code'      => 'WS-CLEAN-0001',
                'cashier_id'      => $user->id,
                'opened_at'       => now(),
                'opening_cash'    => 1000000,
                'system_cash_in'  => 200000,
                'system_cash_out' => 0,
                'expected_cash'   => 1200000,
                'status'          => 'open',
            ]);
        } else {
            $shift = \App\Models\WorkShift::withoutGlobalScopes()->first();
        }

        if ($branch && $user && \App\Models\CashTransaction::withoutGlobalScopes()->count() === 0) {
            \App\Models\CashTransaction::withoutGlobalScopes()->create([
                'tenant_id'          => $tenantId,
                'branch_id'          => $branch->id,
                'work_shift_id'      => $shift?->id,
                'transaction_code'   => 'CT-CLEAN-0001',
                'type'               => 'income',
                'category'           => 'repair_order',
                'amount'             => 200000,
                'payment_method'     => 'cash',
                'recipient_payer'    => 'Khách Kiểm Thử',
                'notes'              => 'Thu tiền đơn kiểm thử',
                'created_by_user_id' => $user->id,
            ]);
        }

        if ($branch && $user && $part) {
            $supplier = \App\Models\Supplier::withoutGlobalScopes()->first()
                ?? \App\Models\Supplier::withoutGlobalScopes()->create([
                    'tenant_id'    => $tenantId,
                    'code'         => 'NCC-CLEAN-01',
                    'name'         => 'Nhà Cung Cấp Kiểm Thử',
                    'phone'        => '0909999888',
                    'debt_balance' => 500000,
                    'is_active'    => true,
                ]);

            if (\App\Models\GoodsReceipt::withoutGlobalScopes()->count() === 0) {
                $receipt = \App\Models\GoodsReceipt::withoutGlobalScopes()->create([
                    'tenant_id'          => $tenantId,
                    'branch_id'          => $branch->id,
                    'supplier_id'        => $supplier->id,
                    'receipt_code'       => 'GR-CLEAN-0001',
                    'status'             => 'completed',
                    'total_amount'       => 500000,
                    'discount_amount'    => 0,
                    'final_amount'       => 500000,
                    'paid_amount'        => 0,
                    'debt_amount'        => 500000,
                    'payment_method'     => 'none',
                    'created_by_user_id' => $user->id,
                ]);
            } else {
                $receipt = \App\Models\GoodsReceipt::withoutGlobalScopes()->first();
            }

            if ($receipt && \App\Models\GoodsReceiptItem::count() === 0) {
                \App\Models\GoodsReceiptItem::create([
                    'goods_receipt_id' => $receipt->id,
                    'part_id'          => $part->id,
                    'quantity'         => 5,
                    'unit_price'       => 100000,
                    'total_price'      => 500000,
                ]);
            }

            if ($receipt && \App\Models\SupplierDebtTransaction::withoutGlobalScopes()->count() === 0) {
                \App\Models\SupplierDebtTransaction::withoutGlobalScopes()->create([
                    'tenant_id'          => $tenantId,
                    'branch_id'          => $branch->id,
                    'supplier_id'        => $supplier->id,
                    'goods_receipt_id'   => $receipt->id,
                    'transaction_code'   => 'SDT-CLEAN-0001',
                    'transaction_type'   => 'receipt_debt',
                    'amount'             => 500000,
                    'debt_before'        => 0,
                    'debt_after'         => 500000,
                    'created_by_user_id' => $user->id,
                ]);
            }
        }
    }

    /**
     * Kiểm tra khi chạy với cờ --force:
     * - Toàn bộ 16 bảng vận hành đều về 0 bản ghi.
     * - Toàn bộ 9 bảng nền tảng được bảo lưu nguyên vẹn 100%.
     */
    public function test_command_cleans_all_transactional_data_and_preserves_master_tables_with_force(): void
    {
        $this->seedFullTestData();

        // Xác minh toàn bộ 16 bảng vận hành có dữ liệu (> 0) trước khi dọn
        foreach ($this->transactionalTables as $table) {
            $this->assertGreaterThan(
                0,
                DB::table($table)->count(),
                "Bảng {$table} phải có dữ liệu trước khi thực hiện dọn dẹp."
            );
        }

        // Ghi nhận số lượng bản ghi của 9 bảng nền tảng trước khi dọn
        $preservedCountsBefore = [];
        foreach ($this->preservedTables as $table) {
            $count = DB::table($table)->count();
            $this->assertGreaterThan(
                0,
                $count,
                "Bảng nền tảng {$table} phải có dữ liệu ban đầu."
            );
            $preservedCountsBefore[$table] = $count;
        }

        // Thực thi command với cờ --force
        $this->artisan('db:clean-transactions', ['--force' => true])
            ->expectsOutputToContain('Đang tiến hành dọn dẹp dữ liệu giao dịch...')
            ->expectsOutputToContain('Đã dọn dẹp thành công toàn bộ dữ liệu giao dịch!')
            ->assertSuccessful();

        // Xác minh 100% cả 16 bảng vận hành đã về 0 bản ghi
        foreach ($this->transactionalTables as $table) {
            $this->assertDatabaseCount($table, 0);
        }

        // Xác minh 100% cả 9 bảng nền tảng giữ nguyên vẹn số lượng bản ghi
        foreach ($this->preservedTables as $table) {
            $this->assertDatabaseCount($table, $preservedCountsBefore[$table]);
        }
    }

    /**
     * Kiểm tra khi chạy không có cờ --force và người dùng từ chối xác nhận:
     * - Command hủy bỏ an toàn và dữ liệu được bảo toàn.
     */
    public function test_command_aborts_safely_when_confirmation_declined(): void
    {
        $this->seedFullTestData();

        $ordersCountBefore = RepairOrder::count();
        $this->assertGreaterThan(0, $ordersCountBefore);

        $this->artisan('db:clean-transactions')
            ->expectsConfirmation('Bạn có chắc chắn muốn dọn dẹp dữ liệu giao dịch để chuẩn bị môi trường test sạch?', 'no')
            ->expectsOutputToContain('Thao tác đã được hủy bỏ an toàn.')
            ->assertSuccessful();

        // Dữ liệu vẫn còn nguyên
        $this->assertEquals($ordersCountBefore, RepairOrder::count());
    }

    /**
     * Kiểm tra khi chạy không có cờ --force và người dùng đồng ý xác nhận:
     * - Command thực hiện dọn dẹp thành công.
     */
    public function test_command_executes_successfully_when_confirmed_interactively(): void
    {
        $this->seedFullTestData();

        $this->artisan('db:clean-transactions')
            ->expectsConfirmation('Bạn có chắc chắn muốn dọn dẹp dữ liệu giao dịch để chuẩn bị môi trường test sạch?', 'yes')
            ->expectsOutputToContain('Đã dọn dẹp thành công toàn bộ dữ liệu giao dịch!')
            ->assertSuccessful();

        // 16 bảng vận hành về 0
        foreach ($this->transactionalTables as $table) {
            $this->assertDatabaseCount($table, 0);
        }
    }

    protected function tearDown(): void
    {
        $this->seed(DatabaseSeeder::class);
        parent::tearDown();
    }
}

