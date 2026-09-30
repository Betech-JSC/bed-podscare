<?php

namespace Database\Seeders;

use App\Models\Branch;
use Illuminate\Database\Seeder;

class BranchSeeder extends Seeder
{
    public function run(): void
    {
        $branches = [
            [
                'code' => 'Q1',
                'name' => 'PodsCare · Quận 1',
                'address' => '142 Nguyễn Thị Minh Khai, Phường Bến Thành, Quận 1, TP.HCM',
                'phone' => '028 7300 1234',
                'is_active' => true,
            ],
            [
                'code' => 'Q3',
                'name' => 'PodsCare · Quận 3',
                'address' => '285 Cách Mạng Tháng Tám, Phường 12, Quận 3, TP.HCM',
                'phone' => '028 7300 5678',
                'is_active' => true,
            ],
            [
                'code' => 'THUDUC',
                'name' => 'PodsCare · TP. Thủ Đức',
                'address' => '56 Võ Văn Ngân, Phường Bình Thọ, TP. Thủ Đức, TP.HCM',
                'phone' => '028 7300 9012',
                'is_active' => true,
            ],
        ];

        foreach ($branches as $branch) {
            Branch::updateOrCreate(['code' => $branch['code']], $branch);
        }
    }
}
