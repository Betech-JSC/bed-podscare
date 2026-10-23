<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Danh sách 5 Hot Query Indexes bổ sung trong Đợt 4 (Phase 4).
     *
     * @var array<string, array<string, list<string>>>
     */
    protected array $indexes = [
        'repair_orders' => [
            'idx_ro_tenant_batch_code' => ['tenant_id', 'intake_batch_code'],
        ],
        'payments' => [
            'idx_pay_tenant_tx_ref' => ['tenant_id', 'transaction_ref'],
        ],
        'notifications' => [
            'idx_notif_user_read'   => ['user_id', 'is_read'],
            'idx_notif_branch_read' => ['branch_id', 'is_read'],
        ],
        'telegram_recipients' => [
            'idx_tg_connect_token' => ['connect_token'],
        ],
    ];

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('payments') && ! Schema::hasColumn('payments', 'tenant_id')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->unsignedBigInteger('tenant_id')->nullable()->after('id');
            });
        }

        foreach ($this->indexes as $tableName => $tableIndexes) {
            if (! Schema::hasTable($tableName)) {
                continue;
            }

            foreach ($tableIndexes as $indexName => $columns) {
                if (! Schema::hasColumns($tableName, $columns)) {
                    continue;
                }

                if (Schema::hasIndex($tableName, $indexName)) {
                    continue;
                }

                Schema::table($tableName, function (Blueprint $table) use ($columns, $indexName) {
                    $table->index($columns, $indexName);
                });
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        foreach ($this->indexes as $tableName => $tableIndexes) {
            if (! Schema::hasTable($tableName)) {
                continue;
            }

            foreach ($tableIndexes as $indexName => $columns) {
                if (Schema::hasIndex($tableName, $indexName)) {
                    Schema::table($tableName, function (Blueprint $table) use ($indexName) {
                        $table->dropIndex($indexName);
                    });
                }
            }
        }
    }
};
