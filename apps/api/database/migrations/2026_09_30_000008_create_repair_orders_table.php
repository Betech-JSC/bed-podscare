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
        Schema::create('repair_orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_code', 50)->unique();
            $table->foreignId('branch_id')->constrained('branches');
            $table->foreignId('customer_id')->constrained('customers');
            $table->foreignId('device_model_id')->constrained('device_models');
            $table->string('serial_number', 100)->nullable();
            $table->string('intake_battery_level', 50)->nullable();
            $table->string('accessories', 255)->nullable();
            $table->text('issue_description');
            $table->text('appearance_notes')->nullable();
            $table->string('status', 50)->default('inspecting');
            $table->decimal('total_price', 15, 2)->default(0.00);
            $table->string('price_note', 255)->nullable();
            $table->unsignedInteger('warranty_terms_days')->default(90);

            // Assignees & Staff
            $table->foreignId('created_by_user_id')->constrained('users');
            $table->foreignId('technician_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('qc_inspector_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('handed_over_by_user_id')->nullable()->constrained('users')->nullOnDelete();

            // Lifecycle audit timestamps & notes
            $table->timestamp('customer_approved_at')->nullable();
            $table->timestamp('customer_declined_at')->nullable();
            $table->text('decline_reason')->nullable();
            $table->timestamp('tech_accepted_at')->nullable();
            $table->timestamp('repair_started_at')->nullable();
            $table->timestamp('repair_completed_at')->nullable();
            $table->text('repair_note')->nullable();
            $table->string('parts_used_summary', 500)->nullable();
            $table->string('final_check_result', 255)->nullable();
            $table->timestamp('qc_passed_at')->nullable();
            $table->text('qc_note')->nullable();
            $table->timestamp('customer_notified_at')->nullable();
            $table->timestamp('handed_over_at')->nullable();
            $table->timestamps();

            $table->index('status', 'idx_orders_status');
            $table->index('customer_id', 'idx_orders_customer');
            $table->index('technician_id', 'idx_orders_tech');
            $table->index('branch_id', 'idx_orders_branch');
            $table->index('created_at', 'idx_orders_created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('repair_orders');
    }
};
