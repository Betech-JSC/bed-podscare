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
        Schema::create('threads_seeding_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('campaign_id')
                ->constrained('threads_seeding_campaigns')
                ->cascadeOnDelete();
            $table->foreignId('account_id')
                ->constrained('threads_accounts')
                ->cascadeOnDelete();
            $table->string('target_post_id', 64)->index();
            $table->string('target_post_url', 500);
            $table->string('target_author_username', 100)->nullable();
            $table->text('target_post_caption')->nullable();
            $table->unsignedInteger('target_velocity_score')->default(0);
            $table->json('target_post_metrics')->nullable();
            $table->text('reply_text');
            $table->string('content_hash', 64)->index();
            $table->unsignedTinyInteger('cluster_order')->default(1);
            $table->timestamp('scheduled_at')->nullable()->index();
            $table->string('status', 32)->default('queued')->index();
            $table->string('container_id', 64)->nullable()->index();
            $table->string('threads_media_id', 64)->nullable()->index();
            $table->string('permalink', 500)->nullable();
            $table->timestamp('published_at')->nullable()->index();
            $table->unsignedTinyInteger('retry_count')->default(0);
            $table->string('error_code', 64)->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->index(['campaign_id', 'status']);
            $table->index(['account_id', 'status']);
            $table->index(['target_post_id', 'content_hash']);
            $table->index(['status', 'scheduled_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('threads_seeding_jobs');
    }
};
