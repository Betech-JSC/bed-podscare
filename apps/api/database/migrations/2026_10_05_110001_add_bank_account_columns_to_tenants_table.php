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
            $table->string('bank_code', 50)->nullable()->after('receipt_footer_note');
            $table->string('bank_account_number', 50)->nullable()->after('bank_code');
            $table->string('bank_account_holder', 150)->nullable()->after('bank_account_number');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn(['bank_code', 'bank_account_number', 'bank_account_holder']);
        });
    }
};
