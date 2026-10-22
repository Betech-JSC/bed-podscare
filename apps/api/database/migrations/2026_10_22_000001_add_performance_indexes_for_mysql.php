<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Danh sách các chỉ mục (Composite & Non-FK Indexes) cần bổ sung cho MySQL InnoDB.
     *
     * @var array<string, array<string, list<string>>>
     */
    protected array $indexes = [
        'users' => [
            'idx_users_phone'              => ['phone'],
            'idx_users_tenant_role_branch' => ['tenant_id', 'role', 'branch_id'],
        ],
        'repair_orders' => [
            'idx_ro_tenant_branch_status'  => ['tenant_id', 'branch_id', 'status'],
            'idx_ro_tenant_branch_created' => ['tenant_id', 'branch_id', 'created_at'],
            'idx_ro_tenant_status_created' => ['tenant_id', 'status', 'created_at'],
            'idx_ro_tenant_created'        => ['tenant_id', 'created_at'],
            'idx_ro_branch_order_code'     => ['branch_id', 'order_code'],
            'idx_ro_handed_over_at'        => ['handed_over_at'],
            'idx_ro_qc_passed_at'          => ['qc_passed_at'],
            'idx_ro_repair_completed_at'   => ['repair_completed_at'],
            'idx_ro_repair_started_at'     => ['repair_started_at'],
            'idx_ro_serial_number'         => ['serial_number'],
        ],
        'payments' => [
            'idx_pay_order_status'          => ['repair_order_id', 'status'],
            'idx_pay_order_status_paid_at'  => ['repair_order_id', 'status', 'paid_at'],
            'idx_pay_tenant_status_paid_at' => ['status', 'paid_at'],
            'idx_pay_status'                => ['status'],
            'idx_pay_method'                => ['payment_method'],
        ],
        'inventory_transactions' => [
            'idx_inv_tx_order_type' => ['repair_order_id', 'transaction_type'],
        ],
        'qc_inspections' => [
            'idx_qc_order_result' => ['repair_order_id', 'result'],
        ],
        'warranties' => [
            'idx_warranties_status_end' => ['status', 'end_date'],
        ],
        'warranty_claims' => [
            'idx_wc_status'     => ['status'],
            'idx_wc_created_at' => ['created_at'],
        ],
        'telegram_recipients' => [
            'idx_tg_chat_active'  => ['telegram_chat_id', 'is_active'],
            'idx_tg_tenant_phone' => ['tenant_id', 'phone'],
        ],
        'audit_logs' => [
            'idx_audit_tenant_created' => ['tenant_id', 'created_at'],
            'idx_audit_action'         => ['action'],
        ],
        'work_shifts' => [
            'idx_work_shifts_opened_at' => ['opened_at'],
        ],
        'cash_transactions' => [
            'idx_cash_tx_tenant_branch_created' => ['tenant_id', 'branch_id', 'created_at'],
            'idx_cash_tx_category'              => ['category'],
        ],
    ];

    /**
     * Run the migrations.
     */
    public function up(): void
    {
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
                if (! Schema::hasIndex($tableName, $indexName)) {
                    continue;
                }

                try {
                    Schema::table($tableName, function (Blueprint $table) use ($indexName) {
                        $table->dropIndex($indexName);
                    });
                } catch (\Illuminate\Database\QueryException $e) {
                    if (str_contains($e->getMessage(), '1553') && count($columns) > 1) {
                        $firstColumn = $columns[0];
                        $fkIndexName = "{$tableName}_{$firstColumn}_foreign";

                        if (! Schema::hasIndex($tableName, $fkIndexName)) {
                            Schema::table($tableName, function (Blueprint $table) use ($firstColumn, $fkIndexName) {
                                $table->index([$firstColumn], $fkIndexName);
                            });
                        }

                        Schema::table($tableName, function (Blueprint $table) use ($indexName) {
                            $table->dropIndex($indexName);
                        });

                        continue;
                    }

                    throw $e;
                }
            }
        }
    }
};
