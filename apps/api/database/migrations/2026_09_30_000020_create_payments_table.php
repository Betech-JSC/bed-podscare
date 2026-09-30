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
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->string('payment_code', 50)->unique();
            $table->foreignId('repair_order_id')->constrained('repair_orders');
            $table->decimal('amount', 15, 2);
            $table->string('payment_method', 50);
            $table->string('transaction_ref', 100)->nullable();
            $table->string('status', 50)->default('paid');
            $table->timestamp('paid_at')->useCurrent();
            $table->foreignId('received_by_user_id')->constrained('users');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('repair_order_id', 'idx_payments_order');
            $table->index('paid_at', 'idx_payments_paid_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
