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
        if (
            Schema::hasTable('telegram_recipients')
            && (! Schema::hasColumn('telegram_recipients', 'user_id') || ! Schema::hasColumn('telegram_recipients', 'telegram_user_id'))
        ) {
            Schema::table('telegram_recipients', function (Blueprint $table) {
                if (! Schema::hasColumn('telegram_recipients', 'user_id')) {
                    $table->foreignId('user_id')
                        ->nullable()
                        ->after('branch_id')
                        ->constrained('users')
                        ->nullOnDelete();
                }

                if (! Schema::hasColumn('telegram_recipients', 'telegram_user_id')) {
                    $table->string('telegram_user_id', 64)
                        ->nullable()
                        ->after('telegram_thread_id');
                }
            });
        }

        if (
            Schema::hasTable('repair_orders')
            && (! Schema::hasColumn('repair_orders', 'rejected_by_tech_ids') || ! Schema::hasColumn('repair_orders', 'telegram_dispatch_messages'))
        ) {
            Schema::table('repair_orders', function (Blueprint $table) {
                if (! Schema::hasColumn('repair_orders', 'rejected_by_tech_ids')) {
                    $table->json('rejected_by_tech_ids')
                        ->nullable()
                        ->after('technician_id');
                }

                if (! Schema::hasColumn('repair_orders', 'telegram_dispatch_messages')) {
                    $table->json('telegram_dispatch_messages')
                        ->nullable()
                        ->after('rejected_by_tech_ids');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('telegram_recipients')) {
            Schema::table('telegram_recipients', function (Blueprint $table) {
                if (Schema::hasColumn('telegram_recipients', 'user_id')) {
                    try {
                        $table->dropForeign(['user_id']);
                    } catch (\Throwable $e) {
                        // Ignore if foreign key does not exist (e.g. SQLite)
                    }
                    $table->dropColumn('user_id');
                }

                if (Schema::hasColumn('telegram_recipients', 'telegram_user_id')) {
                    $table->dropColumn('telegram_user_id');
                }
            });
        }

        if (Schema::hasTable('repair_orders')) {
            Schema::table('repair_orders', function (Blueprint $table) {
                $cols = [];
                foreach (['rejected_by_tech_ids', 'telegram_dispatch_messages'] as $col) {
                    if (Schema::hasColumn('repair_orders', $col)) {
                        $cols[] = $col;
                    }
                }
                if (! empty($cols)) {
                    $table->dropColumn($cols);
                }
            });
        }
    }
};
