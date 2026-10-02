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
        Schema::create('subscription_plans', function (Blueprint $table) {
            $table->string('id')->primary(); // 'trial', 'standard', 'pro'
            $table->string('code')->nullable()->index();
            $table->string('name');
            $table->decimal('price', 15, 2)->default(0);
            $table->decimal('price_monthly', 15, 2)->default(0);
            $table->decimal('price_yearly', 15, 2)->default(0);
            $table->string('billing_cycle')->default('monthly');
            $table->integer('max_branches')->nullable(); // null or -1 = unlimited
            $table->integer('max_users')->nullable();    // null or -1 = unlimited
            $table->integer('max_orders_per_month')->nullable(); // null or -1 = unlimited
            $table->json('features')->nullable();
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('subscription_plans');
    }
};
