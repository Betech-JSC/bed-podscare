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
        Schema::create('sepay_transactions', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('sepay_transaction_id')->unique()->index();
            $table->unsignedBigInteger('saas_invoice_id')->nullable()->index();
            $table->string('reference_code')->nullable()->index();
            $table->decimal('amount', 15, 2);
            $table->decimal('accumulated', 15, 2)->nullable();
            $table->string('account_number')->nullable();
            $table->text('transaction_content')->nullable();
            $table->string('bank_brand')->nullable();
            $table->string('gateway')->nullable();
            $table->dateTime('transaction_date')->nullable();
            $table->json('raw_payload')->nullable();
            $table->timestamps();

            $table->foreign('saas_invoice_id')->references('id')->on('saas_invoices')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sepay_transactions');
    }
};
