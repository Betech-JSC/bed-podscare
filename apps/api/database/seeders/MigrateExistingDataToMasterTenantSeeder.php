<?php

namespace Database\Seeders;

use App\Models\Tenant;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class MigrateExistingDataToMasterTenantSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // 1. Tạo bản ghi Master Tenant mặc định nếu chưa tồn tại
        $masterTenant = Tenant::firstOrCreate(
            ['code' => 'fixo-master'],
            [
                'name'       => 'FIXO Master System',
                'status'     => 'active',
                'plan'       => 'pro',
                'phone'      => '0901 000 001',
                'email'      => 'contact@fixo.com.vn',
                'expires_at' => null,
            ]
        );

        if ($masterTenant->status !== 'active') {
            $masterTenant->update(['status' => 'active']);
        }

        // 2. Danh sách các bảng nghiệp vụ cần gán tenant_id
        $tables = [
            'branches',
            'repair_orders',
            'customers',
            'parts',
            'device_models',
            'devices',
            'repair_quotes',
            'quotes',
            'qc_inspections',
            'shipments',
            'audit_logs',
        ];

        foreach ($tables as $tableName) {
            if (Schema::hasTable($tableName) && Schema::hasColumn($tableName, 'tenant_id')) {
                DB::table($tableName)
                    ->whereNull('tenant_id')
                    ->update(['tenant_id' => $masterTenant->id]);
            }
        }

        // 3. Với bảng users, gán cho tất cả user ngoại trừ super_admin
        if (Schema::hasTable('users') && Schema::hasColumn('users', 'tenant_id')) {
            DB::table('users')
                ->whereNull('tenant_id')
                ->where(function ($query) {
                    $query->where('role', '!=', 'super_admin')
                        ->orWhereNull('role');
                })
                ->update(['tenant_id' => $masterTenant->id]);
        }
    }
}
