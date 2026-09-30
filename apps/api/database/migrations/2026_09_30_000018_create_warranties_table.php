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
        Schema::create('warranties', function (Blueprint $table) {
            $table->id();
            $table->string('warranty_code', 50)->unique();
            $table->foreignId('repair_order_id')->constrained('repair_orders');
            $table->foreignId('customer_id')->constrained('customers');
            $table->foreignId('device_model_id')->constrained('device_models');
            $table->string('coverage_item', 255);
            $table->date('start_date');
            $table->unsignedInteger('duration_days')->default(90);
            $table->date('end_date');
            $table->string('status', 50)->default('active');
            $table->timestamps();

            $table->index(['end_date', 'status'], 'idx_warranties_end_status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('warranties');
    }
};
