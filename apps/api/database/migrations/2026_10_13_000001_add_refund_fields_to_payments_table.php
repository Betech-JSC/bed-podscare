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
        Schema::table('payments', function (Blueprint $table) {
            $table->decimal('refund_amount', 15, 2)->default(0)->after('amount');
            $table->string('refund_method', 50)->nullable()->after('payment_method');
            $table->timestamp('refunded_at')->nullable()->after('paid_at');
            $table->foreignId('refunded_by_user_id')->nullable()->after('received_by_user_id')->constrained('users')->nullOnDelete();
            $table->text('refund_reason')->nullable()->after('notes');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropForeign(['refunded_by_user_id']);
            $table->dropColumn([
                'refund_amount',
                'refund_method',
                'refunded_at',
                'refunded_by_user_id',
                'refund_reason',
            ]);
        });
    }
};
