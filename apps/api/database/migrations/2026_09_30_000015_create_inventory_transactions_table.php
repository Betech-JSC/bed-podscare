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
        Schema::create('inventory_transactions', function (Blueprint $table) {
            $table->id();
            $table->string('transaction_code', 50)->unique();
            $table->foreignId('part_id')->constrained('parts');
            $table->foreignId('branch_id')->constrained('branches');
            $table->foreignId('repair_order_id')->nullable()->constrained('repair_orders')->nullOnDelete();
            $table->string('transaction_type', 50);
            $table->integer('quantity');
            $table->decimal('unit_cost', 15, 2)->default(0.00);
            $table->string('supplier_name', 255)->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by_user_id')->constrained('users');
            $table->timestamps();

            $table->index('part_id', 'idx_inv_tx_part');
            $table->index('repair_order_id', 'idx_inv_tx_order');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('inventory_transactions');
    }
};
