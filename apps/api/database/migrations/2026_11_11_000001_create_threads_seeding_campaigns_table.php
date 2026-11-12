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
        Schema::create('threads_seeding_campaigns', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('type', 32)->default('discovery')->index();
            $table->string('keyword', 150)->nullable()->index();
            $table->string('dispatch_strategy', 32)->default('round_robin');
            $table->text('content_template')->nullable();
            $table->string('status', 32)->default('draft')->index();
            $table->unsignedSmallInteger('total_jobs')->default(0);
            $table->unsignedSmallInteger('completed_jobs')->default(0);
            $table->unsignedSmallInteger('failed_jobs')->default(0);
            $table->json('settings')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['type', 'status']);
            $table->index(['status', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('threads_seeding_campaigns');
    }
};
