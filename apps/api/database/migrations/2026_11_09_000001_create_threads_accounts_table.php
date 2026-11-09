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
        Schema::create('threads_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('display_name', 120);
            $table->string('username', 100)->nullable()->unique();
            $table->string('threads_user_id', 64)->nullable()->unique();
            $table->string('app_group', 64)->default('primary_dev_app')->index();
            $table->text('access_token_encrypted')->nullable();
            $table->timestamp('token_expires_at')->nullable()->index();
            $table->timestamp('last_refreshed_at')->nullable();
            $table->string('status', 32)->default('needs_reauth')->index();
            $table->unsignedSmallInteger('daily_post_cap')->default(8);
            $table->string('active_hours_start', 5)->default('08:00');
            $table->string('active_hours_end', 5)->default('22:00');
            $table->unsignedSmallInteger('quota_used_24h')->default(0);
            $table->unsignedSmallInteger('quota_total_24h')->default(250);
            $table->text('last_error_message')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('threads_accounts');
    }
};
