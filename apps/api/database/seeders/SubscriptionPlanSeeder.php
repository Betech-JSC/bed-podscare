<?php

namespace Database\Seeders;

use App\Models\SubscriptionPlan;
use Illuminate\Database\Seeder;

class SubscriptionPlanSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $plans = [
            [
                'id'                   => 'trial',
                'code'                 => 'trial',
                'name'                 => 'Dùng thử miễn phí',
                'price'                => 0,
                'price_monthly'        => 0,
                'price_yearly'         => 0,
                'billing_cycle'        => 'monthly',
                'max_branches'         => 1,
                'max_users'            => 2,
                'max_orders_per_month' => 50,
                'features'             => [
                    '1 chi nhánh hoạt động',
                    'Tối đa 2 nhân sự',
                    '50 đơn sửa chữa / tháng',
                    'Thời hạn dùng thử 14 ngày',
                ],
                'is_active'            => true,
                'sort_order'           => 1,
            ],
            [
                'id'                   => 'standard',
                'code'                 => 'standard',
                'name'                 => 'Gói Tiêu chuẩn',
                'price'                => 299000,
                'price_monthly'        => 299000,
                'price_yearly'         => 3289000,
                'billing_cycle'        => 'monthly',
                'max_branches'         => 2,
                'max_users'            => 5,
                'max_orders_per_month' => 200,
                'features'             => [
                    'Tối đa 2 chi nhánh',
                    'Tối đa 5 nhân sự',
                    '200 đơn sửa chữa / tháng',
                    'In phiếu tiếp nhận & Báo giá QuickLink',
                    'Quản lý kho linh kiện cơ bản',
                    'Hỗ trợ kỹ thuật giờ hành chính',
                ],
                'is_active'            => true,
                'sort_order'           => 2,
            ],
            [
                'id'                   => 'pro',
                'code'                 => 'pro',
                'name'                 => 'Gói Chuyên nghiệp',
                'price'                => 599000,
                'price_monthly'        => 599000,
                'price_yearly'         => 6589000,
                'billing_cycle'        => 'monthly',
                'max_branches'         => null, // Unlimited
                'max_users'            => null, // Unlimited
                'max_orders_per_month' => null, // Unlimited
                'features'             => [
                    'Không giới hạn chi nhánh',
                    'Không giới hạn nhân viên',
                    'Không giới hạn đơn hàng',
                    'Điều phối kho linh kiện liên chi nhánh',
                    'Phân tích KPI nhân viên & Doanh số thời gian thực',
                    'Cổng theo dõi bảo hành công khai VIP',
                    'Hỗ trợ kỹ thuật ưu tiên 24/7',
                ],
                'is_active'            => true,
                'sort_order'           => 3,
            ],
        ];

        foreach ($plans as $plan) {
            SubscriptionPlan::updateOrCreate(
                ['id' => $plan['id']],
                $plan
            );
        }
    }
}
