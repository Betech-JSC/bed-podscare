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
        Schema::create('threads_publish_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')
                ->nullable()
                ->constrained('threads_accounts')
                ->cascadeOnDelete();
            $table->foreignId('post_id')
                ->nullable()
                ->constrained('threads_posts')
                ->cascadeOnDelete();
            $table->string('action', 48)->index();
            $table->unsignedSmallInteger('http_status')->nullable();
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('threads_publish_logs');
    }
};
