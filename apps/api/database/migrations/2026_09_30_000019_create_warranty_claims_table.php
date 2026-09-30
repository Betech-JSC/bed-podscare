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
        Schema::create('warranty_claims', function (Blueprint $table) {
            $table->id();
            $table->string('claim_code', 50)->unique();
            $table->foreignId('warranty_id')->constrained('warranties');
            $table->text('issue_description');
            $table->string('resolution_mode', 50);
            $table->foreignId('rework_order_id')->nullable()->constrained('repair_orders')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->string('status', 50)->default('received');
            $table->foreignId('received_by_user_id')->constrained('users');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('warranty_claims');
    }
};
