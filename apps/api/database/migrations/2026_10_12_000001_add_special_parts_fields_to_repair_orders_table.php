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
            $table->text('special_parts_needed')->nullable()->after('parts_needed');
            $table->string('special_parts_status', 50)->nullable()->default(null)->after('special_parts_needed');
            $table->timestamp('special_parts_requested_at')->nullable()->after('special_parts_status');
            $table->timestamp('special_parts_fulfilled_at')->nullable()->after('special_parts_requested_at');
            $table->index(['branch_id', 'special_parts_status'], 'repair_orders_branch_special_parts_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('repair_orders', function (Blueprint $table) {
            $table->dropIndex('repair_orders_branch_special_parts_idx');
            $table->dropColumn([
                'special_parts_needed',
                'special_parts_status',
                'special_parts_requested_at',
                'special_parts_fulfilled_at',
            ]);
        });
    }
};
