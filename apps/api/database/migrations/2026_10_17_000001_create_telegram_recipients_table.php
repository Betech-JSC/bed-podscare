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
        Schema::create('telegram_recipients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->string('label', 100);
            $table->string('phone', 30);
            $table->string('target_role', 30)->default('admin');
            $table->string('telegram_chat_id', 64)->nullable();
            $table->string('telegram_thread_id', 64)->nullable();
            $table->string('connect_token', 64)->unique();
            $table->json('subscribed_events')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('connected_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'target_role', 'is_active']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('telegram_recipients');
    }
};
