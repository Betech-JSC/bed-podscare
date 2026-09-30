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
        Schema::create('checklist_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_model_id')->nullable()->constrained('device_models')->nullOnDelete();
            $table->string('category', 50)->default('AirPods')->index();
            $table->string('item_name', 150);
            $table->text('description')->nullable();
            $table->string('type', 50)->default('visual');
            $table->integer('order_index')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['category', 'is_active', 'order_index'], 'idx_checklist_cat_active_order');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('checklist_templates');
    }
};
