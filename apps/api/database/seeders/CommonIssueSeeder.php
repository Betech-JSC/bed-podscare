<?php

namespace Database\Seeders;

use App\Models\CommonIssue;
use Illuminate\Database\Seeder;

class CommonIssueSeeder extends Seeder
{
    public function run(): void
    {
        $issues = [
            // AirPods
            [
                'category' => 'AirPods',
                'issue_name' => 'Pin chai, tụt pin nhanh dưới 1 tiếng',
                'solution' => 'Thay cell pin dung lượng cao chính hãng',
                'estimated_time' => '30–45 phút',
                'estimated_cost' => 250000,
                'order_index' => 1,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'issue_name' => 'Bật chống ồn ANC bị rè, rít gió chói tai',
                'solution' => 'Cân chỉnh micro ngoài, fix lỗi rít màng âm',
                'estimated_time' => '60 phút',
                'estimated_cost' => 350000,
                'order_index' => 2,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'issue_name' => 'Loa một bên nhỏ tiếng hoặc rè bass',
                'solution' => 'Vệ sinh lưới âm thanh hoặc thay driver titan',
                'estimated_time' => '45 phút',
                'estimated_cost' => 200000,
                'order_index' => 3,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'issue_name' => 'Hộp sạc không nhận sạc hoặc không sạc được cho tai',
                'solution' => 'Thay pin case sạc hoặc hàn cáp flex chân tiếp xúc',
                'estimated_time' => '45–60 phút',
                'estimated_cost' => 300000,
                'order_index' => 4,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'issue_name' => 'Bám bẩn lâu ngày, tắc màng âm thanh',
                'solution' => 'Vệ sinh chuyên sâu bằng dung dịch chuyên dụng và tia UV',
                'estimated_time' => '20 phút',
                'estimated_cost' => 100000,
                'order_index' => 5,
                'is_active' => true,
            ],

            // Apple Watch
            [
                'category' => 'Apple Watch',
                'issue_name' => 'Pin phồng, phù đội màn hình hoặc tụt nguồn nhanh',
                'solution' => 'Thay pin Apple Watch tiêu chuẩn Apple',
                'estimated_time' => '45 phút',
                'estimated_cost' => 450000,
                'order_index' => 1,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Watch',
                'issue_name' => 'Vỡ mặt kính, trầy xước sâu nhưng cảm ứng vẫn tốt',
                'solution' => 'Ép kính Apple Watch công nghệ hút chân không',
                'estimated_time' => '60–90 phút',
                'estimated_cost' => 500000,
                'order_index' => 2,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Watch',
                'issue_name' => 'Liệt cảm ứng, loạn vuốt hoặc đơ toàn màn hình',
                'solution' => 'Thay kính cảm ứng zin Apple Watch',
                'estimated_time' => '60 phút',
                'estimated_cost' => 650000,
                'order_index' => 3,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Watch',
                'issue_name' => 'Hư Digital Crown hoặc kẹt cứng nút nguồn',
                'solution' => 'Vệ sinh cơ học hoặc thay cụm cáp rung Digital Crown',
                'estimated_time' => '45 phút',
                'estimated_cost' => 350000,
                'order_index' => 4,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Watch',
                'issue_name' => 'Mất rung Taptic Engine hoặc loa rè',
                'solution' => 'Thay cục rung Taptic Engine / cụm loa chuông zin',
                'estimated_time' => '45 phút',
                'estimated_cost' => 400000,
                'order_index' => 5,
                'is_active' => true,
            ],

            // Apple Pencil
            [
                'category' => 'Apple Pencil',
                'issue_name' => 'Không kết nối Bluetooth hoặc chập chờn',
                'solution' => 'Kiểm tra chip Bluetooth và cân chỉnh ăng-ten',
                'estimated_time' => '30 phút',
                'estimated_cost' => 300000,
                'order_index' => 1,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Pencil',
                'issue_name' => 'Hỏng pin, sạc không vào hoặc rút sạc là mất nguồn',
                'solution' => 'Thay pin Apple Pencil chuyên dụng',
                'estimated_time' => '45 phút',
                'estimated_cost' => 400000,
                'order_index' => 2,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Pencil',
                'issue_name' => 'Mất cảm ứng lực nhấn / vẽ đứt đoạn',
                'solution' => 'Thay đầu tiếp xúc cảm ứng lực bên trong ngòi',
                'estimated_time' => '45 phút',
                'estimated_cost' => 350000,
                'order_index' => 3,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Pencil',
                'issue_name' => 'Gãy ngòi ren ốc kẹt bên trong thân bút',
                'solution' => 'Gắp ren gãy chuyên dụng và thay ngòi bút mới',
                'estimated_time' => '15–20 phút',
                'estimated_cost' => 150000,
                'order_index' => 4,
                'is_active' => true,
            ],

            // MacBook
            [
                'category' => 'MacBook',
                'issue_name' => 'Pin phù, báo Service Battery hoặc tụt nhanh',
                'solution' => 'Thay pin MacBook bảo hành dung lượng 12 tháng',
                'estimated_time' => '60–90 phút',
                'estimated_cost' => 1200000,
                'order_index' => 1,
                'is_active' => true,
            ],
            [
                'category' => 'MacBook',
                'issue_name' => 'Kẹt phím, gõ nhảy chữ hoặc liệt hàng phím',
                'solution' => 'Vệ sinh cơ phím hoặc thay bàn phím zin',
                'estimated_time' => '60–90 phút',
                'estimated_cost' => 850000,
                'order_index' => 2,
                'is_active' => true,
            ],
            [
                'category' => 'MacBook',
                'issue_name' => 'Màn hình sọc, nháy hình khi gập mở góc màn hình',
                'solution' => 'Xử lý cáp màn hình Flexgate không cần thay nguyên cụm',
                'estimated_time' => '120 phút',
                'estimated_cost' => 950000,
                'order_index' => 3,
                'is_active' => true,
            ],
            [
                'category' => 'MacBook',
                'issue_name' => 'Quạt kêu to, máy nóng quá nhiệt và chạy chậm giật',
                'solution' => 'Bảo dưỡng vệ sinh tra keo tản nhiệt gốm cao cấp',
                'estimated_time' => '45 phút',
                'estimated_cost' => 300000,
                'order_index' => 4,
                'is_active' => true,
            ],
            [
                'category' => 'MacBook',
                'issue_name' => 'Không nhận sạc Type-C hoặc hỏng cổng Thunderbolt',
                'solution' => 'Sửa mạch sạc IC nguồn USB-PD / thay cụm cổng Type-C',
                'estimated_time' => '90 phút',
                'estimated_cost' => 750000,
                'order_index' => 5,
                'is_active' => true,
            ],

            // iPad
            [
                'category' => 'iPad',
                'issue_name' => 'Vỡ nứt mặt kính ngoài, hiển thị bên trong bình thường',
                'solution' => 'Ép mặt kính iPad công nghệ ép nhiệt OCA',
                'estimated_time' => '90 phút',
                'estimated_cost' => 650000,
                'order_index' => 1,
                'is_active' => true,
            ],
            [
                'category' => 'iPad',
                'issue_name' => 'Chai pin, sạc lâu đầy hoặc sập nguồn khi pin dưới 20%',
                'solution' => 'Thay pin iPad dung lượng chuẩn nguyên bản',
                'estimated_time' => '60 phút',
                'estimated_cost' => 750000,
                'order_index' => 2,
                'is_active' => true,
            ],
            [
                'category' => 'iPad',
                'issue_name' => 'Màn hình liệt cảm ứng một phần hoặc giật sọc',
                'solution' => 'Thay màn hình nguyên bộ chính hãng',
                'estimated_time' => '60 phút',
                'estimated_cost' => 1500000,
                'order_index' => 3,
                'is_active' => true,
            ],
            [
                'category' => 'iPad',
                'issue_name' => 'Chân sạc lỏng lẻo, cắm không báo nhận sạc',
                'solution' => 'Thay chân cáp sạc Type-C/Lightning chính hãng',
                'estimated_time' => '45 phút',
                'estimated_cost' => 450000,
                'order_index' => 4,
                'is_active' => true,
            ],
            [
                'category' => 'iPad',
                'issue_name' => 'Cong vênh khung sườn nhôm do va đập',
                'solution' => 'Nắn chỉnh khung vỏ nhôm bằng máy ép chuyên dụng',
                'estimated_time' => '45 phút',
                'estimated_cost' => 300000,
                'order_index' => 5,
                'is_active' => true,
            ],
        ];

        foreach ($issues as $issue) {
            CommonIssue::updateOrCreate(
                [
                    'category' => $issue['category'],
                    'issue_name' => $issue['issue_name'],
                ],
                $issue
            );
        }
    }
}
