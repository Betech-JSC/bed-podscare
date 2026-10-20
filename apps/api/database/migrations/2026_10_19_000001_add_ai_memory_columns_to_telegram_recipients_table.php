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
        if (! Schema::hasTable('telegram_recipients')) {
            return;
        }

        Schema::table('telegram_recipients', function (Blueprint $table) {
            if (! Schema::hasColumn('telegram_recipients', 'ai_message_count')) {
                $table->unsignedInteger('ai_message_count')->default(0)->after('connected_at');
            }

            if (! Schema::hasColumn('telegram_recipients', 'ai_context_summary')) {
                $table->text('ai_context_summary')->nullable()->after('ai_message_count');
            }

            if (! Schema::hasColumn('telegram_recipients', 'ai_recent_messages')) {
                $table->json('ai_recent_messages')->nullable()->after('ai_context_summary');
            }

            if (! Schema::hasColumn('telegram_recipients', 'ai_last_interaction_at')) {
                $table->timestamp('ai_last_interaction_at')->nullable()->after('ai_recent_messages');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (! Schema::hasTable('telegram_recipients')) {
            return;
        }

        Schema::table('telegram_recipients', function (Blueprint $table) {
            $columnsToDrop = [];

            foreach (['ai_message_count', 'ai_context_summary', 'ai_recent_messages', 'ai_last_interaction_at'] as $col) {
                if (Schema::hasColumn('telegram_recipients', $col)) {
                    $columnsToDrop[] = $col;
                }
            }

            if (! empty($columnsToDrop)) {
                $table->dropColumn($columnsToDrop);
            }
        });
    }
};
