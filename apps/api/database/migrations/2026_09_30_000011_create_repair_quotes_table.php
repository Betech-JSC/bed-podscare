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
        Schema::create('repair_quotes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('repair_order_id')->constrained('repair_orders')->cascadeOnDelete();
            $table->string('quote_number', 50)->unique();
            $table->decimal('total_amount', 15, 2)->default(0.00);
            $table->unsignedInteger('warranty_terms_days')->default(90);
            $table->text('note');
            $table->string('status', 50)->default('pending');
            $table->foreignId('sent_by_user_id')->constrained('users');
            $table->timestamp('sent_at')->useCurrent();
            $table->timestamp('responded_at')->nullable();
            $table->text('decline_reason')->nullable();
            $table->timestamps();

            $table->index(['repair_order_id', 'status'], 'idx_quotes_order_status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('repair_quotes');
    }
};
