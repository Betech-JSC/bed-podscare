<?php

namespace Database\Seeders;

use App\Models\Partner;
use Illuminate\Database\Seeder;

class PartnerSeeder extends Seeder
{
    public function run(): void
    {
        $partners = [
            [
                'code' => 'GHN',
                'name' => 'Giao Hàng Nhanh (GHN Express)',
                'service_type' => 'logistics',
                'contact_person' => 'Nguyễn Văn Giao',
                'phone' => '19001206',
                'status' => 'active',
                'api_config' => ['webhook_enabled' => true, 'env' => 'sandbox'],
            ],
            [
                'code' => 'GrabExpress',
                'name' => 'GrabExpress Giao Siêu Tốc',
                'service_type' => 'logistics',
                'contact_person' => 'Trần Grab',
                'phone' => '02871087108',
                'status' => 'active',
                'api_config' => ['instant_delivery' => true],
            ],
            [
                'code' => 'FixHub',
                'name' => 'FixHub - Trạm Sửa Phần Cứng Chuyên Sâu',
                'service_type' => 'specialized_repair',
                'contact_person' => 'Lê Văn Fix',
                'phone' => '0988112233',
                'status' => 'active',
                'api_config' => ['scope' => 'chipset_and_anc'],
            ],
            [
                'code' => 'CarePlus',
                'name' => 'CarePlus - Bảo Hành Mở Rộng Toàn Diện',
                'service_type' => 'warranty_extended',
                'contact_person' => 'Phạm Thị Care',
                'phone' => '0977445566',
                'status' => 'active',
                'api_config' => ['warranty_partner' => true],
            ],
        ];

        foreach ($partners as $partner) {
            Partner::updateOrCreate(['code' => $partner['code']], $partner);
        }
    }
}
