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
        Schema::create('parts', function (Blueprint $table) {
            $table->id();
            $table->string('sku', 100)->unique();
            $table->string('name', 255);
            $table->string('category', 100);
            $table->string('compatible_models', 255)->nullable();
            $table->string('storage_location', 100);
            $table->integer('stock_quantity')->default(0);
            $table->integer('min_stock_alert')->default(5);
            $table->decimal('cost_price', 15, 2)->default(0.00);
            $table->decimal('retail_price', 15, 2)->default(0.00);
            $table->string('unit', 50)->default('cái');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['sku', 'category'], 'idx_parts_sku_category');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('parts');
    }
};
