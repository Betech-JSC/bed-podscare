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
        Schema::table('tenants', function (Blueprint $table) {
            $table->dateTime('trial_ends_at')->nullable()->after('expires_at');
            $table->string('billing_cycle')->default('monthly')->after('trial_ends_at');
            $table->string('current_plan_id')->nullable()->after('billing_cycle');
            $table->string('intended_plan')->nullable()->after('current_plan_id');

            $table->foreign('current_plan_id')->references('id')->on('subscription_plans')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropForeign(['current_plan_id']);
            $table->dropColumn(['trial_ends_at', 'billing_cycle', 'current_plan_id', 'intended_plan']);
        });
    }
};
