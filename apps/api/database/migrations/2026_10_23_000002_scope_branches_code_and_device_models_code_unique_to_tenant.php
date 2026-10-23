<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Chuyển đổi ràng buộc unique toàn cục trên branches.code và device_models.model_code
     * sang composite unique theo từng Tenant (tenant_id, code) và (tenant_id, model_code).
     */
    public function up(): void
    {
        if (Schema::hasTable('branches')) {
            if (Schema::hasIndex('branches', 'branches_code_unique')) {
                Schema::table('branches', function (Blueprint $table) {
                    $table->dropUnique('branches_code_unique');
                });
            }

            if (Schema::hasColumns('branches', ['tenant_id', 'code']) && ! Schema::hasIndex('branches', 'uq_branches_tenant_code')) {
                Schema::table('branches', function (Blueprint $table) {
                    $table->unique(['tenant_id', 'code'], 'uq_branches_tenant_code');
                });
            }
        }

        if (Schema::hasTable('device_models')) {
            if (Schema::hasIndex('device_models', 'device_models_model_code_unique')) {
                Schema::table('device_models', function (Blueprint $table) {
                    $table->dropUnique('device_models_model_code_unique');
                });
            }

            if (Schema::hasColumns('device_models', ['tenant_id', 'model_code']) && ! Schema::hasIndex('device_models', 'uq_device_models_tenant_model_code')) {
                Schema::table('device_models', function (Blueprint $table) {
                    $table->unique(['tenant_id', 'model_code'], 'uq_device_models_tenant_model_code');
                });
            }
        }
    }

    /**
     * Hoàn tác các composite unique indexes.
     */
    public function down(): void
    {
        if (Schema::hasTable('branches')) {
            if (Schema::hasIndex('branches', 'uq_branches_tenant_code')) {
                Schema::table('branches', function (Blueprint $table) {
                    $table->dropUnique('uq_branches_tenant_code');
                });
            }
        }

        if (Schema::hasTable('device_models')) {
            if (Schema::hasIndex('device_models', 'uq_device_models_tenant_model_code')) {
                Schema::table('device_models', function (Blueprint $table) {
                    $table->dropUnique('uq_device_models_tenant_model_code');
                });
            }
        }
    }
};
