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
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->string('type', 50)->index();
            $table->string('title', 255);
            $table->text('message');
            $table->foreignId('order_id')->nullable()->constrained('repair_orders')->nullOnDelete();
            $table->string('severity', 20)->default('info');
            $table->boolean('is_read')->default(false)->index();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'is_read'], 'idx_notifications_user_read');
            $table->index(['branch_id', 'is_read'], 'idx_notifications_branch_read');
            $table->index('created_at', 'idx_notifications_created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
