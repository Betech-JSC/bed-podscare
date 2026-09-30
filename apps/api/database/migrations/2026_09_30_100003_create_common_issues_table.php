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
        Schema::create('common_issues', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_model_id')->nullable()->constrained('device_models')->nullOnDelete();
            $table->string('category', 50)->default('AirPods')->index();
            $table->string('issue_name', 200);
            $table->text('solution')->nullable();
            $table->string('estimated_time', 50)->nullable();
            $table->foreignId('suggested_service_id')->nullable()->constrained('repair_services')->nullOnDelete();
            $table->decimal('estimated_cost', 12, 2)->unsigned()->nullable();
            $table->integer('order_index')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['category', 'is_active', 'order_index'], 'idx_common_issues_cat_active_order');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('common_issues');
    }
};
