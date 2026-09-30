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
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('phone', 20)->unique();
            $table->string('name', 255);
            $table->string('email', 255)->nullable();
            $table->string('customer_type', 50)->default('retail');
            $table->string('source', 50)->default('store');
            $table->text('notes')->nullable();
            $table->unsignedInteger('orders_count')->default(0);
            $table->decimal('total_spent', 15, 2)->default(0.00);
            $table->timestamps();

            $table->index(['phone', 'name'], 'idx_customers_phone_name');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
