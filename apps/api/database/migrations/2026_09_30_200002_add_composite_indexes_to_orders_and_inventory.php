<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('repair_orders', function (Blueprint $table) {
            $table->index(['branch_id', 'status'], 'idx_repair_orders_branch_status');
            $table->index(['technician_id', 'status'], 'idx_repair_orders_tech_status');
        });

        Schema::table('inventory_transactions', function (Blueprint $table) {
            $table->index(['branch_id', 'transaction_type'], 'idx_inv_tx_branch_type');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('repair_orders', function (Blueprint $table) {
            $table->dropIndex('idx_repair_orders_branch_status');
            $table->dropIndex('idx_repair_orders_tech_status');
        });

        Schema::table('inventory_transactions', function (Blueprint $table) {
            $table->dropIndex('idx_inv_tx_branch_type');
        });
    }
};
