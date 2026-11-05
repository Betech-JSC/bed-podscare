<?php

namespace Database\Seeders;

use App\Models\CommonIssue;
use Illuminate\Database\Seeder;

class CommonIssueSeeder extends Seeder
{
    public function run(): void
    {
        $issues = [
            // =========================================================================
            // 1. AirPods (Tách rõ 3 phạm vi: Tai Trái (L), Tai Phải (R), Cả 2 tai (L + R))
            // =========================================================================
            // Nhóm 1.1: Thay pin tai nghe AirPods
            [
                'category' => 'AirPods',
                'issue_name' => 'Thay pin AirPods - 1 bên Tai Trái (L)',
                'solution' => 'Thay cell pin dung lượng chuẩn cho tai nghe bên Trái (L)',
                'estimated_time' => '30–45 phút',
                'estimated_cost' => 250000,
                'order_index' => 1,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'issue_name' => 'Thay pin AirPods - 1 bên Tai Phải (R)',
                'solution' => 'Thay cell pin dung lượng chuẩn cho tai nghe bên Phải (R)',
                'estimated_time' => '30–45 phút',
                'estimated_cost' => 250000,
                'order_index' => 2,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'issue_name' => 'Thay pin AirPods - Cả 2 tai (L + R)',
                'solution' => 'Thay cặp cell pin dung lượng chuẩn cho cả 2 tai Trái (L) và Phải (R)',
                'estimated_time' => '45–60 phút',
                'estimated_cost' => 450000,
                'order_index' => 3,
                'is_active' => true,
            ],

            // Nhóm 1.2: Sửa/Thay loa & ANC AirPods
            [
                'category' => 'AirPods',
                'issue_name' => 'Sửa/Thay loa & ANC AirPods - 1 bên Tai Trái (L)',
                'solution' => 'Thay cụm loa Driver & cân chỉnh chống ồn ANC bên Trái (L)',
                'estimated_time' => '45–60 phút',
                'estimated_cost' => 350000,
                'order_index' => 4,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'issue_name' => 'Sửa/Thay loa & ANC AirPods - 1 bên Tai Phải (R)',
                'solution' => 'Thay cụm loa Driver & cân chỉnh chống ồn ANC bên Phải (R)',
                'estimated_time' => '45–60 phút',
                'estimated_cost' => 350000,
                'order_index' => 5,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'issue_name' => 'Sửa/Thay loa & ANC AirPods - Cả 2 tai (L + R)',
                'solution' => 'Thay cặp cụm loa Driver & cân chỉnh chống ồn ANC cả 2 tai (L + R)',
                'estimated_time' => '60 phút',
                'estimated_cost' => 650000,
                'order_index' => 6,
                'is_active' => true,
            ],

            // Nhóm 1.3: Thay Mic đàm thoại / Mic ANC AirPods
            [
                'category' => 'AirPods',
                'issue_name' => 'Thay Mic đàm thoại / Mic ANC AirPods - 1 bên Tai Trái (L)',
                'solution' => 'Thay cụm cáp Mic đàm thoại & thu âm chống ồn bên Trái (L)',
                'estimated_time' => '45 phút',
                'estimated_cost' => 280000,
                'order_index' => 7,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'issue_name' => 'Thay Mic đàm thoại / Mic ANC AirPods - 1 bên Tai Phải (R)',
                'solution' => 'Thay cụm cáp Mic đàm thoại & thu âm chống ồn bên Phải (R)',
                'estimated_time' => '45 phút',
                'estimated_cost' => 280000,
                'order_index' => 8,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'issue_name' => 'Thay Mic đàm thoại / Mic ANC AirPods - Cả 2 tai (L + R)',
                'solution' => 'Thay cặp cụm cáp Mic đàm thoại & thu âm chống ồn cả 2 tai (L + R)',
                'estimated_time' => '60 phút',
                'estimated_cost' => 520000,
                'order_index' => 9,
                'is_active' => true,
            ],

            // Nhóm 1.4: Vệ sinh & Thay lưới chống bụi âm thanh AirPods
            [
                'category' => 'AirPods',
                'issue_name' => 'Vệ sinh & Thay lưới chống bụi âm thanh AirPods - 1 bên Tai Trái (L)',
                'solution' => 'Vệ sinh sóng siêu âm và thay lưới chống bụi âm thanh bên Trái (L)',
                'estimated_time' => '20–30 phút',
                'estimated_cost' => 70000,
                'order_index' => 10,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'issue_name' => 'Vệ sinh & Thay lưới chống bụi âm thanh AirPods - 1 bên Tai Phải (R)',
                'solution' => 'Vệ sinh sóng siêu âm và thay lưới chống bụi âm thanh bên Phải (R)',
                'estimated_time' => '20–30 phút',
                'estimated_cost' => 70000,
                'order_index' => 11,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'issue_name' => 'Vệ sinh & Thay lưới chống bụi âm thanh AirPods - Cả 2 tai (L + R)',
                'solution' => 'Vệ sinh sóng siêu âm và thay cặp lưới chống bụi âm thanh cả 2 tai (L + R)',
                'estimated_time' => '30 phút',
                'estimated_cost' => 120000,
                'order_index' => 12,
                'is_active' => true,
            ],

            // Nhóm 1.5: Hộp sạc (Case) & Khớp xoay AirPods Max
            [
                'category' => 'AirPods',
                'issue_name' => 'Thay pin hộp sạc (Case) AirPods',
                'solution' => 'Thay pin hộp sạc dung lượng chuẩn Apple',
                'estimated_time' => '45–60 phút',
                'estimated_cost' => 350000,
                'order_index' => 13,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'issue_name' => 'Thay cáp flex chân tiếp xúc sạc (Case) AirPods',
                'solution' => 'Thay cáp flex chân sạc hộp sạc AirPods',
                'estimated_time' => '45–60 phút',
                'estimated_cost' => 280000,
                'order_index' => 14,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'issue_name' => 'Thay cáp xoay khớp nối headband AirPods Max',
                'solution' => 'Thay bộ cáp flex xoay khớp nối headband AirPods Max',
                'estimated_time' => '60–90 phút',
                'estimated_cost' => 600000,
                'order_index' => 15,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'issue_name' => 'Thay cụm chân sạc Lightning AirPods Max',
                'solution' => 'Thay cụm cáp chân sạc Lightning AirPods Max',
                'estimated_time' => '45–60 phút',
                'estimated_cost' => 550000,
                'order_index' => 16,
                'is_active' => true,
            ],

            // =========================================================================
            // 2. Apple Watch
            // =========================================================================
            [
                'category' => 'Apple Watch',
                'issue_name' => 'Pin phồng, phù đội màn hình hoặc tụt nguồn nhanh',
                'solution' => 'Thay pin Apple Watch chuẩn dung lượng + ron chống nước',
                'estimated_time' => '45 phút',
                'estimated_cost' => 480000,
                'order_index' => 1,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Watch',
                'issue_name' => 'Vỡ mặt kính, trầy xước sâu nhưng cảm ứng vẫn tốt',
                'solution' => 'Ép mặt kính cảm ứng Apple Watch công nghệ OCA',
                'estimated_time' => '60–90 phút',
                'estimated_cost' => 600000,
                'order_index' => 2,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Watch',
                'issue_name' => 'Sọc màn hình, chảy mực hoặc chết hiển thị OLED',
                'solution' => 'Thay màn hình OLED nguyên bộ Apple Watch chính hãng',
                'estimated_time' => '60 phút',
                'estimated_cost' => 1850000,
                'order_index' => 3,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Watch',
                'issue_name' => 'Hư Digital Crown hoặc kẹt cứng nút nguồn',
                'solution' => 'Thay cụm cáp nút xoay Digital Crown & nút nguồn Apple Watch',
                'estimated_time' => '45 phút',
                'estimated_cost' => 420000,
                'order_index' => 4,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Watch',
                'issue_name' => 'Mất rung Taptic Engine hoặc loa rè',
                'solution' => 'Thay cục rung Taptic Engine / Cụm loa ngoài Apple Watch',
                'estimated_time' => '45 phút',
                'estimated_cost' => 450000,
                'order_index' => 5,
                'is_active' => true,
            ],

            // =========================================================================
            // 3. Apple Pencil
            // =========================================================================
            [
                'category' => 'Apple Pencil',
                'issue_name' => 'Hỏng pin, sạc không vào hoặc rút sạc là mất nguồn',
                'solution' => 'Thay cell pin Apple Pencil chuyên dụng',
                'estimated_time' => '45 phút',
                'estimated_cost' => 380000,
                'order_index' => 1,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Pencil',
                'issue_name' => 'Mất cảm ứng lực nhấn / vẽ đứt đoạn / gãy ngòi',
                'solution' => 'Thay đầu tiếp xúc cảm ứng lực & ngòi bút Apple Pencil',
                'estimated_time' => '30–45 phút',
                'estimated_cost' => 320000,
                'order_index' => 2,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Pencil',
                'issue_name' => 'Không kết nối Bluetooth hoặc lỗi cuộn sạc từ tính',
                'solution' => 'Sửa mạch Bluetooth & cuộn sạc từ tính Apple Pencil',
                'estimated_time' => '45 phút',
                'estimated_cost' => 420000,
                'order_index' => 3,
                'is_active' => true,
            ],

            // =========================================================================
            // 4. MacBook
            // =========================================================================
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

            // =========================================================================
            // 5. iPad
            // =========================================================================
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
