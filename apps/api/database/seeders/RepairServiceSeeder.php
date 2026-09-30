<?php

namespace Database\Seeders;

use App\Models\DeviceModel;
use App\Models\RepairService;
use Illuminate\Database\Seeder;

class RepairServiceSeeder extends Seeder
{
    public function run(): void
    {
        $pro2 = DeviceModel::where('model_code', 'MTJV3VN/A')->first();
        $pro = DeviceModel::where('model_code', 'MLWK3VN/A')->first();
        $ap3 = DeviceModel::where('model_code', 'MME73VN/A')->first();

        $services = [
            [
                'device_model_id' => $pro2?->id,
                'name' => 'Thay pin tai nghe (AirPods Pro 2)',
                'code' => 'SRV-BAT-PRO2',
                'category' => 'Pin',
                'base_price' => 280000.00,
                'default_warranty_days' => 90,
                'description' => 'Thay thế cell pin dung lượng cao chính hãng, bảo hành 90 ngày',
                'is_active' => true,
            ],
            [
                'device_model_id' => $pro2?->id,
                'name' => 'Thay pin hộp sạc (AirPods Pro 2)',
                'code' => 'SRV-CASE-PRO2',
                'category' => 'Hộp sạc',
                'base_price' => 350000.00,
                'default_warranty_days' => 90,
                'description' => 'Thay pin case sạc type-C/Lightning dung lượng chuẩn Apple',
                'is_active' => true,
            ],
            [
                'device_model_id' => $pro2?->id,
                'name' => 'Sửa lỗi chống ồn ANC & Xuyên âm',
                'code' => 'SRV-ANC-PRO2',
                'category' => 'Driver',
                'base_price' => 450000.00,
                'default_warranty_days' => 90,
                'description' => 'Cân chỉnh micro thu âm ngoài, loại bỏ hiện tượng rè và rít âm ANC',
                'is_active' => true,
            ],
            [
                'device_model_id' => $pro?->id,
                'name' => 'Thay loa / driver rè (AirPods Pro)',
                'code' => 'SRV-SPK-PRO',
                'category' => 'Loa',
                'base_price' => 320000.00,
                'default_warranty_days' => 90,
                'description' => 'Thay màng loa và củ loa titan mới độ nhạy cao',
                'is_active' => true,
            ],
            [
                'device_model_id' => $ap3?->id,
                'name' => 'Thay pin tai nghe (AirPods 3)',
                'code' => 'SRV-BAT-AP3',
                'category' => 'Pin',
                'base_price' => 240000.00,
                'default_warranty_days' => 90,
                'description' => 'Thay pin chuẩn cho AirPods 3',
                'is_active' => true,
            ],
            [
                'device_model_id' => null,
                'name' => 'Vệ sinh & làm sạch chuyên sâu toàn diện',
                'code' => 'SRV-CLN-ALL',
                'category' => 'Vệ sinh',
                'base_price' => 100000.00,
                'default_warranty_days' => 30,
                'description' => 'Làm sạch màng loa, khử khuẩn UV, tẩy ố chân sạc và buồng tai nghe',
                'is_active' => true,
            ],
        ];

        foreach ($services as $service) {
            RepairService::updateOrCreate(['code' => $service['code']], $service);
        }
    }
}
