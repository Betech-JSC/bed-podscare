<?php

namespace Database\Seeders;

use App\Models\Part;
use Illuminate\Database\Seeder;

class PartSeeder extends Seeder
{
    public function run(): void
    {
        $parts = [
            [
                'sku' => 'BAT-APP2-01',
                'name' => 'Pin tai nghe AirPods Pro 2',
                'category' => 'Pin',
                'compatible_models' => 'AirPods Pro 2',
                'storage_location' => 'Kệ A · Tầng 2',
                'stock_quantity' => 18,
                'min_stock_alert' => 5,
                'cost_price' => 180000.00,
                'retail_price' => 280000.00,
                'unit' => 'cái',
                'is_active' => true,
            ],
            [
                'sku' => 'CASE-APP2-04',
                'name' => 'Hộp sạc AirPods Pro 2 USB-C',
                'category' => 'Hộp sạc',
                'compatible_models' => 'AirPods Pro 2',
                'storage_location' => 'Kệ B · Tầng 1',
                'stock_quantity' => 4,
                'min_stock_alert' => 2,
                'cost_price' => 850000.00,
                'retail_price' => 1150000.00,
                'unit' => 'cái',
                'is_active' => true,
            ],
            [
                'sku' => 'MESH-APP-02',
                'name' => 'Lưới chống bụi AirPods Pro',
                'category' => 'Linh kiện',
                'compatible_models' => 'AirPods Pro, AirPods Pro 2',
                'storage_location' => 'Kệ A · Hộc 3',
                'stock_quantity' => 42,
                'min_stock_alert' => 10,
                'cost_price' => 25000.00,
                'retail_price' => 65000.00,
                'unit' => 'bộ',
                'is_active' => true,
            ],
            [
                'sku' => 'BAT-APP3-02',
                'name' => 'Pin tai nghe AirPods 3',
                'category' => 'Pin',
                'compatible_models' => 'AirPods 3',
                'storage_location' => 'Kệ A · Tầng 2',
                'stock_quantity' => 11,
                'min_stock_alert' => 5,
                'cost_price' => 150000.00,
                'retail_price' => 240000.00,
                'unit' => 'cái',
                'is_active' => true,
            ],
            [
                'sku' => 'FLEX-CASE-01',
                'name' => 'Cáp flex hộp sạc AirPods Pro',
                'category' => 'Linh kiện',
                'compatible_models' => 'AirPods Pro',
                'storage_location' => 'Kệ B · Hộc 1',
                'stock_quantity' => 3,
                'min_stock_alert' => 2,
                'cost_price' => 120000.00,
                'retail_price' => 190000.00,
                'unit' => 'cái',
                'is_active' => true,
            ],
            [
                'sku' => 'BAT-APP-01',
                'name' => 'Pin tai nghe AirPods Pro',
                'category' => 'Pin',
                'compatible_models' => 'AirPods Pro',
                'storage_location' => 'Kệ A · Tầng 1',
                'stock_quantity' => 26,
                'min_stock_alert' => 5,
                'cost_price' => 160000.00,
                'retail_price' => 260000.00,
                'unit' => 'cái',
                'is_active' => true,
            ],
        ];

        foreach ($parts as $part) {
            Part::updateOrCreate(['sku' => $part['sku']], $part);
        }
    }
}
