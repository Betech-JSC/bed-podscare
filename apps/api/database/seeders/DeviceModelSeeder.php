<?php

namespace Database\Seeders;

use App\Models\DeviceModel;
use Illuminate\Database\Seeder;

class DeviceModelSeeder extends Seeder
{
    public function run(): void
    {
        $devices = [
            [
                'name' => 'AirPods 2',
                'model_code' => 'MV7N2VN/A',
                'release_year' => 2019,
                'manufacturer' => 'Apple',
                'has_anc' => false,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/MV7N2?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],
            [
                'name' => 'AirPods 3',
                'model_code' => 'MME73VN/A',
                'release_year' => 2021,
                'manufacturer' => 'Apple',
                'has_anc' => false,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/MME73?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],
            [
                'name' => 'AirPods 4',
                'model_code' => 'MXP63VN/A',
                'release_year' => 2024,
                'manufacturer' => 'Apple',
                'has_anc' => false,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/airpods-4-anc-select-202409?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],
            [
                'name' => 'AirPods Pro',
                'model_code' => 'MLWK3VN/A',
                'release_year' => 2021,
                'manufacturer' => 'Apple',
                'has_anc' => true,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/MWP22?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],
            [
                'name' => 'AirPods Pro 2',
                'model_code' => 'MTJV3VN/A',
                'release_year' => 2023,
                'manufacturer' => 'Apple',
                'has_anc' => true,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/MTJV3?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],
            [
                'name' => 'AirPods Max',
                'model_code' => 'MGYH3VN/A',
                'release_year' => 2020,
                'manufacturer' => 'Apple',
                'has_anc' => true,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/airpods-max-select-silver-202011?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],
        ];

        foreach ($devices as $device) {
            DeviceModel::updateOrCreate(['model_code' => $device['model_code']], $device);
        }
    }
}
