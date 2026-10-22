<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Danh sách các Composite Indexes bổ sung trong Đợt 3 (Phase 3).
     *
     * @var array<string, array<string, list<string>>>
     */
    protected array $indexes = [
        'cash_transactions' => [
            'idx_cash_tx_reference' => ['reference_type', 'reference_id'],
        ],
        'parts' => [
            'idx_parts_tenant_active_category' => ['tenant_id', 'is_active', 'category'],
        ],
        'shipments' => [
            'idx_shipments_tenant_status' => ['tenant_id', 'status'],
            'idx_shipments_tracking_code' => ['tracking_code'],
        ],
        'suppliers' => [
            'idx_suppliers_tenant_active' => ['tenant_id', 'is_active'],
        ],
        'goods_receipts' => [
            'idx_goods_receipts_tenant_branch_created' => ['tenant_id', 'branch_id', 'created_at'],
        ],
        'tenants' => [
            'idx_tenants_status_expires_at' => ['status', 'expires_at'],
        ],
        'audit_logs' => [
            'idx_audit_tenant_user_created' => ['tenant_id', 'user_id', 'created_at'],
        ],
        'customers' => [
            'idx_customers_tenant_type' => ['tenant_id', 'customer_type'],
        ],
    ];

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1.1 Bổ sung reference_type và reference_id vào bảng cash_transactions
        if (Schema::hasTable('cash_transactions')) {
            Schema::table('cash_transactions', function (Blueprint $table) {
                if (! Schema::hasColumn('cash_transactions', 'reference_type')) {
                    $table->string('reference_type', 50)->nullable()->after('category');
                }
                if (! Schema::hasColumn('cash_transactions', 'reference_id')) {
                    $table->unsignedBigInteger('reference_id')->nullable()->after('reference_type');
                }
            });
        }

        // 1.2 Chuyển đổi Global Unique sang Tenant-Scoped Composite Unique
        if (Schema::hasTable('customers')) {
            if (Schema::hasIndex('customers', 'customers_phone_unique')) {
                Schema::table('customers', function (Blueprint $table) {
                    $table->dropUnique('customers_phone_unique');
                });
            }

            if (Schema::hasColumns('customers', ['tenant_id', 'phone']) && ! Schema::hasIndex('customers', 'uq_customers_tenant_phone')) {
                Schema::table('customers', function (Blueprint $table) {
                    $table->unique(['tenant_id', 'phone'], 'uq_customers_tenant_phone');
                });
            }
        }

        if (Schema::hasTable('parts')) {
            if (Schema::hasIndex('parts', 'parts_sku_unique')) {
                Schema::table('parts', function (Blueprint $table) {
                    $table->dropUnique('parts_sku_unique');
                });
            }

            if (Schema::hasColumns('parts', ['tenant_id', 'sku']) && ! Schema::hasIndex('parts', 'uq_parts_tenant_sku')) {
                Schema::table('parts', function (Blueprint $table) {
                    $table->unique(['tenant_id', 'sku'], 'uq_parts_tenant_sku');
                });
            }
        }

        // 1.3 Bổ sung các Composite Indexes phụ trợ
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

        if (Schema::hasTable('parts')) {
            if (Schema::hasIndex('parts', 'uq_parts_tenant_sku')) {
                Schema::table('parts', function (Blueprint $table) {
                    $table->dropUnique('uq_parts_tenant_sku');
                });
            }
            if (! Schema::hasIndex('parts', 'parts_sku_unique')) {
                Schema::table('parts', function (Blueprint $table) {
                    $table->unique('sku', 'parts_sku_unique');
                });
            }
        }

        if (Schema::hasTable('customers')) {
            if (Schema::hasIndex('customers', 'uq_customers_tenant_phone')) {
                Schema::table('customers', function (Blueprint $table) {
                    $table->dropUnique('uq_customers_tenant_phone');
                });
            }
            if (! Schema::hasIndex('customers', 'customers_phone_unique')) {
                Schema::table('customers', function (Blueprint $table) {
                    $table->unique('phone', 'customers_phone_unique');
                });
            }
        }

        if (Schema::hasTable('cash_transactions')) {
            Schema::table('cash_transactions', function (Blueprint $table) {
                if (Schema::hasColumn('cash_transactions', 'reference_id')) {
                    $table->dropColumn('reference_id');
                }
                if (Schema::hasColumn('cash_transactions', 'reference_type')) {
                    $table->dropColumn('reference_type');
                }
            });
        }
    }
};
