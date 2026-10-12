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
        Schema::create('cash_transactions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained('work_shifts')->nullOnDelete();
            $table->string('transaction_code', 50);
            $table->string('type', 20); // 'income', 'expense'
            $table->string('category', 50); // 'purchasing_parts', 'shipping_cod', 'store_operations', 'refund', 'other_expense', 'opening_float', 'other_income'
            $table->string('payment_method', 20)->default('cash');
            $table->decimal('amount', 15, 2);
            $table->string('recipient_payer', 255)->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->index(['tenant_id', 'branch_id', 'type']);
            $table->index(['shift_id']);
            $table->unique(['tenant_id', 'transaction_code']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cash_transactions');
    }
};
