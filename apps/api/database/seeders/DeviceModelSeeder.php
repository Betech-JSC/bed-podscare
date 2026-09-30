<?php

namespace Database\Seeders;

use App\Models\DeviceModel;
use Illuminate\Database\Seeder;

class DeviceModelSeeder extends Seeder
{
    public function run(): void
    {
        $devices = [
            // AirPods
            [
                'name' => 'AirPods 2',
                'category' => 'AirPods',
                'model_code' => 'MV7N2VN/A',
                'release_year' => 2019,
                'manufacturer' => 'Apple',
                'has_anc' => false,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/MV7N2?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],
            [
                'name' => 'AirPods 3',
                'category' => 'AirPods',
                'model_code' => 'MME73VN/A',
                'release_year' => 2021,
                'manufacturer' => 'Apple',
                'has_anc' => false,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/MME73?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],
            [
                'name' => 'AirPods 4',
                'category' => 'AirPods',
                'model_code' => 'MXP63VN/A',
                'release_year' => 2024,
                'manufacturer' => 'Apple',
                'has_anc' => false,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/airpods-4-anc-select-202409?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],
            [
                'name' => 'AirPods Pro',
                'category' => 'AirPods',
                'model_code' => 'MLWK3VN/A',
                'release_year' => 2021,
                'manufacturer' => 'Apple',
                'has_anc' => true,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/MWP22?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],
            [
                'name' => 'AirPods Pro 2',
                'category' => 'AirPods',
                'model_code' => 'MTJV3VN/A',
                'release_year' => 2023,
                'manufacturer' => 'Apple',
                'has_anc' => true,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/MTJV3?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],
            [
                'name' => 'AirPods Max',
                'category' => 'AirPods',
                'model_code' => 'MGYH3VN/A',
                'release_year' => 2020,
                'manufacturer' => 'Apple',
                'has_anc' => true,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/airpods-max-select-silver-202011?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],

            // Apple Watch
            [
                'name' => 'Apple Watch Series 9',
                'category' => 'Apple Watch',
                'model_code' => 'MR993VN/A',
                'release_year' => 2023,
                'manufacturer' => 'Apple',
                'has_anc' => false,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/watch-s9-midnight?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],
            [
                'name' => 'Apple Watch Ultra 2',
                'category' => 'Apple Watch',
                'model_code' => 'MREG3VN/A',
                'release_year' => 2023,
                'manufacturer' => 'Apple',
                'has_anc' => false,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/watch-ultra-2?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],

            // Apple Pencil
            [
                'name' => 'Apple Pencil 2',
                'category' => 'Apple Pencil',
                'model_code' => 'MU8F2AM/A',
                'release_year' => 2018,
                'manufacturer' => 'Apple',
                'has_anc' => false,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/MU8F2?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],
            [
                'name' => 'Apple Pencil Pro',
                'category' => 'Apple Pencil',
                'model_code' => 'MX2D3AM/A',
                'release_year' => 2024,
                'manufacturer' => 'Apple',
                'has_anc' => false,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/apple-pencil-pro-select-202405?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],

            // MacBook
            [
                'name' => 'MacBook Air M2',
                'category' => 'MacBook',
                'model_code' => 'MLY33VN/A',
                'release_year' => 2022,
                'manufacturer' => 'Apple',
                'has_anc' => false,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/macbook-air-midnight-select-20220606?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],
            [
                'name' => 'MacBook Pro 14 M3',
                'category' => 'MacBook',
                'model_code' => 'MTL73VN/A',
                'release_year' => 2023,
                'manufacturer' => 'Apple',
                'has_anc' => false,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/mbp14-spaceblack-select-202310?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],

            // iPad
            [
                'name' => 'iPad Air 5',
                'category' => 'iPad',
                'model_code' => 'MM9E3VN/A',
                'release_year' => 2022,
                'manufacturer' => 'Apple',
                'has_anc' => false,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/ipad-air-select-wifi-blue-202203?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],
            [
                'name' => 'iPad Pro 11 M4',
                'category' => 'iPad',
                'model_code' => 'MVVJ3VN/A',
                'release_year' => 2024,
                'manufacturer' => 'Apple',
                'has_anc' => false,
                'image_url' => 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/ipad-pro-finish-select-202405-11inch-spaceblack?wid=572&hei=572&fmt=jpeg',
                'is_active' => true,
            ],
        ];

        foreach ($devices as $device) {
            DeviceModel::updateOrCreate(['model_code' => $device['model_code']], $device);
        }
    }
}
