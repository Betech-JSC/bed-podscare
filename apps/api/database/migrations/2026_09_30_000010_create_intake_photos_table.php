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
        Schema::create('intake_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('repair_order_id')->constrained('repair_orders')->cascadeOnDelete();
            $table->string('photo_url', 500);
            $table->string('file_path', 500)->nullable();
            $table->string('caption', 255)->nullable();
            $table->foreignId('uploaded_by_user_id')->constrained('users');
            $table->timestamps();

            $table->index('repair_order_id', 'idx_intake_photos_order');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('intake_photos');
    }
};
