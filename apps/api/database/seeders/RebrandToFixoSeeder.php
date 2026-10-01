<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RebrandToFixoSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Đổi tên các chi nhánh cũ từ PodsCare sang FIXO
        DB::table('branches')
            ->where('name', 'like', '%PodsCare%')
            ->update([
                'name' => DB::raw("REPLACE(name, 'PodsCare', 'FIXO')")
            ]);

        // 2. Đổi email nhân viên từ @podscare.vn sang @fixo.com.vn
        DB::table('users')
            ->where('email', 'like', '%@podscare.vn')
            ->update([
                'email' => DB::raw("REPLACE(email, '@podscare.vn', '@fixo.com.vn')")
            ]);

        // 3. Đổi tiền tố mã đơn hàng từ PC26- sang FX26-
        DB::table('repair_orders')
            ->where('order_code', 'like', 'PC%')
            ->update([
                'order_code' => DB::raw("REPLACE(order_code, 'PC', 'FX')")
            ]);

        // 4. Đổi tên hãng vận chuyển / đơn vị nội bộ nếu có
        if (DB::getSchemaBuilder()->hasTable('shipments')) {
            DB::table('shipments')
                ->where('carrier_name', 'like', '%PodsCare%')
                ->update([
                    'carrier_name' => DB::raw("REPLACE(carrier_name, 'PodsCare', 'FIXO')")
                ]);
        }

        // 5. Cập nhật mã báo giá, thanh toán, bảo hành cũ (nếu có)
        if (DB::getSchemaBuilder()->hasTable('repair_quotes')) {
            DB::table('repair_quotes')
                ->where('quote_number', 'like', 'PC%')
                ->update([
                    'quote_number' => DB::raw("REPLACE(quote_number, 'PC', 'FX')")
                ]);
        }

        if (DB::getSchemaBuilder()->hasTable('payments')) {
            DB::table('payments')
                ->where('payment_code', 'like', '%PC%')
                ->update([
                    'payment_code' => DB::raw("REPLACE(payment_code, 'PC', 'FX')")
                ]);
        }

        if (DB::getSchemaBuilder()->hasTable('warranties')) {
            DB::table('warranties')
                ->where('warranty_code', 'like', 'PC%')
                ->update([
                    'warranty_code' => DB::raw("REPLACE(warranty_code, 'PC', 'FX')")
                ]);
        }
    }
}
