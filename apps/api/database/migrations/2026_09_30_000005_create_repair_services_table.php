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
        Schema::create('repair_services', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_model_id')->nullable()->constrained('device_models')->cascadeOnDelete();
            $table->string('name', 255);
            $table->string('code', 100)->unique();
            $table->string('category', 100);
            $table->decimal('base_price', 15, 2)->default(0.00);
            $table->unsignedInteger('default_warranty_days')->default(90);
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('category', 'idx_services_category');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('repair_services');
    }
};
