<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CleanTransactionalDataCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'db:clean-transactions {--force : Bỏ qua bước xác nhận interactive}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Xóa sạch toàn bộ dữ liệu đơn hàng và giao dịch phát sinh để chuẩn bị môi trường test sạch, bảo lưu 100% Chi nhánh, Nhân sự và Danh mục sản phẩm/dịch vụ.';

    /**
     * Danh sách 16 bảng dữ liệu đơn hàng và giao dịch phát sinh cần truncate.
     *
     * @var array<int, string>
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
    ];

    /**
     * Danh sách 9 bảng danh mục nền tảng được bảo lưu nguyên vẹn 100%.
     *
     * @var array<int, string>
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
     * Execute the console command.
     */
    public function handle(): int
    {
        if (! $this->option('force')) {
            $this->warn('⚠️  CẢNH BÁO: Thao tác này sẽ xóa sạch toàn bộ dữ liệu đơn hàng và giao dịch phát sinh!');
            $this->line('Các bảng danh mục Master (Chi nhánh, Nhân sự, Dịch vụ, Linh kiện...) sẽ được giữ nguyên 100%.');

            if (! $this->confirm('Bạn có chắc chắn muốn dọn dẹp dữ liệu giao dịch để chuẩn bị môi trường test sạch?', false)) {
                $this->info('Thao tác đã được hủy bỏ an toàn.');

                return self::SUCCESS;
            }
        }

        $this->info('Đang tiến hành dọn dẹp dữ liệu giao dịch...');

        $this->disableForeignKeys();

        try {
            foreach ($this->transactionalTables as $table) {
                if (Schema::hasTable($table)) {
                    DB::table($table)->truncate();
                }
            }
        } finally {
            $this->enableForeignKeys();
        }

        $this->info('✓ Đã dọn dẹp thành công toàn bộ dữ liệu giao dịch!');

        $this->displaySummary();

        return self::SUCCESS;
    }

    /**
     * Tạm ngắt kiểm tra khóa ngoại theo từng hệ quản trị CSDL.
     */
    protected function disableForeignKeys(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS = 0;');
        } elseif ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = OFF;');
        }
    }

    /**
     * Tái kích hoạt kiểm tra khóa ngoại sau khi hoàn tất truncate.
     */
    protected function enableForeignKeys(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS = 1;');
        } elseif ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = ON;');
        }
    }

    /**
     * Xuất bảng CLI summary rõ ràng danh sách bảng đã dọn dẹp và số lượng bản ghi sau khi dọn.
     */
    protected function displaySummary(): void
    {
        $rows = [];

        foreach ($this->transactionalTables as $table) {
            $exists = Schema::hasTable($table);
            $count = $exists ? DB::table($table)->count() : 'N/A';
            $rows[] = [
                $table,
                'Đã dọn dẹp (Truncated)',
                $count,
            ];
        }

        foreach ($this->preservedTables as $table) {
            $exists = Schema::hasTable($table);
            $count = $exists ? DB::table($table)->count() : 'N/A';
            $rows[] = [
                $table,
                'Bảo lưu (Preserved)',
                $count,
            ];
        }

        $this->table(['Tên bảng', 'Trạng thái xử lý', 'Số bản ghi hiện tại'], $rows);
    }
}
