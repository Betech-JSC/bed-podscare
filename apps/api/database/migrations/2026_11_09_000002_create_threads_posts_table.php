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
        Schema::create('threads_posts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')
                ->constrained('threads_accounts')
                ->cascadeOnDelete();
            $table->foreignId('reply_to_post_id')
                ->nullable()
                ->constrained('threads_posts')
                ->nullOnDelete();
            $table->string('thread_group_key', 64)->nullable()->index();
            $table->unsignedSmallInteger('reply_order')->default(0);
            $table->text('content_text')->nullable();
            $table->string('media_type', 20)->default('TEXT');
            $table->json('media_urls')->nullable();
            $table->string('link_attachment', 500)->nullable();
            $table->string('topic_tag', 100)->nullable();
            $table->string('reply_control', 32)->default('everyone');
            $table->boolean('is_sponsored')->default(false)->index();
            $table->string('sponsored_suffix', 100)->nullable();
            $table->string('client_ref', 100)->nullable()->index();
            $table->string('content_hash', 64)->nullable()->index();
            $table->string('import_batch_id', 64)->nullable()->index();
            $table->timestamp('scheduled_at')->nullable()->index();
            $table->string('status', 32)->default('scheduled')->index();
            $table->string('container_id', 64)->nullable()->index();
            $table->string('threads_media_id', 64)->nullable()->index();
            $table->string('permalink', 500)->nullable();
            $table->timestamp('published_at')->nullable()->index();
            $table->unsignedTinyInteger('retry_count')->default(0);
            $table->timestamp('next_retry_at')->nullable()->index();
            $table->string('error_code', 64)->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->index(['account_id', 'status']);
            $table->index(['status', 'scheduled_at']);
            $table->index(['reply_to_post_id', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('threads_posts');
    }
};
