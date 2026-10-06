<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('repair_orders', function (Blueprint $table) {
            $table->decimal('initial_price', 15, 2)->nullable()->after('total_price');
            $table->json('additional_services')->nullable()->after('price_note');
        });

        // Backfill: initial_price = total_price cho cac ban ghi cu
        DB::table('repair_orders')->whereNull('initial_price')->update([
            'initial_price' => DB::raw('total_price'),
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('repair_orders', function (Blueprint $table) {
            $table->dropColumn(['additional_services', 'initial_price']);
        });
    }
};
