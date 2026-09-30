<?php

namespace Database\Seeders;

use App\Models\ChecklistTemplate;
use Illuminate\Database\Seeder;

class ChecklistTemplateSeeder extends Seeder
{
    public function run(): void
    {
        $checklists = [
            // AirPods
            [
                'category' => 'AirPods',
                'item_name' => 'Kết nối Bluetooth',
                'description' => 'Kiểm tra tốc độ pop-up và duy trì kết nối ổn định',
                'type' => 'functional',
                'order_index' => 1,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'item_name' => 'Âm thanh tai trái',
                'description' => 'Âm lượng, dải âm trầm/bổng, không rè',
                'type' => 'functional',
                'order_index' => 2,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'item_name' => 'Âm thanh tai phải',
                'description' => 'Âm lượng, dải âm trầm/bổng, không rè',
                'type' => 'functional',
                'order_index' => 3,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'item_name' => 'Microphone',
                'description' => 'Thu âm rõ ràng khi gọi thoại hoặc ghi âm',
                'type' => 'functional',
                'order_index' => 4,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'item_name' => 'Pin & thời lượng sử dụng',
                'description' => 'Đo dung lượng thực tế và hao pin nhanh',
                'type' => 'functional',
                'order_index' => 5,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'item_name' => 'Hộp sạc / nhận sạc',
                'description' => 'Chân sạc cắm dây hoặc đế sạc không dây MagSafe',
                'type' => 'functional',
                'order_index' => 6,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'item_name' => 'Chống ồn ANC',
                'description' => 'Khử tiếng ồn chủ động không bị hú/rít gió (Pro/Max)',
                'type' => 'functional',
                'order_index' => 7,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'item_name' => 'Xuyên âm (Transparency)',
                'description' => 'Thu âm thanh môi trường tự nhiên (Pro/Max)',
                'type' => 'functional',
                'order_index' => 8,
                'is_active' => true,
            ],
            [
                'category' => 'AirPods',
                'item_name' => 'Nút cảm ứng lực',
                'description' => 'Cảm ứng bóp thân tai nghe hoặc xoay Digital Crown',
                'type' => 'functional',
                'order_index' => 9,
                'is_active' => true,
            ],

            // Apple Watch
            [
                'category' => 'Apple Watch',
                'item_name' => 'Cảm ứng màn hình',
                'description' => 'Kiểm tra điểm chết, phản hồi vuốt chạm toàn màn hình',
                'type' => 'functional',
                'order_index' => 1,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Watch',
                'item_name' => 'Hiển thị màn hình & kính',
                'description' => 'Kiểm tra ám màn, sọc, nứt vỡ hoặc bong tróc gioăng',
                'type' => 'visual',
                'order_index' => 2,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Watch',
                'item_name' => 'Digital Crown & Nút nguồn',
                'description' => 'Độ nảy vật lý, độ mượt khi xoay và phản hồi rung haptic',
                'type' => 'functional',
                'order_index' => 3,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Watch',
                'item_name' => 'Cảm biến nhịp tim & SpO2',
                'description' => 'Kiểm tra đo nhịp tim mặt lưng dưới, đèn cảm biến phát quang',
                'type' => 'functional',
                'order_index' => 4,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Watch',
                'item_name' => 'Pin & sạc từ tính',
                'description' => 'Đo dung lượng pin, kiểm tra đế sạc không dây từ tính',
                'type' => 'functional',
                'order_index' => 5,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Watch',
                'item_name' => 'Loa & Micro đàm thoại',
                'description' => 'Âm thanh chuông báo và thu âm ghi âm giọng nói',
                'type' => 'functional',
                'order_index' => 6,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Watch',
                'item_name' => 'Kết nối Bluetooth & Wi-Fi',
                'description' => 'Ghép đôi với iPhone và đồng bộ hóa dữ liệu Watch app',
                'type' => 'functional',
                'order_index' => 7,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Watch',
                'item_name' => 'Chống nước & Nắp lưng gốm',
                'description' => 'Kiểm tra độ hở gioăng chống nước, nứt gốm/kính lưng',
                'type' => 'visual',
                'order_index' => 8,
                'is_active' => true,
            ],

            // Apple Pencil
            [
                'category' => 'Apple Pencil',
                'item_name' => 'Đầu ngòi bút (Tip)',
                'description' => 'Kiểm tra độ mòn ngòi bút, ren ốc kim loại bên trong',
                'type' => 'visual',
                'order_index' => 1,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Pencil',
                'item_name' => 'Cảm ứng lực & Độ nghiêng',
                'description' => 'Vẽ nét thanh nét đậm trên màn hình iPad',
                'type' => 'functional',
                'order_index' => 2,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Pencil',
                'item_name' => 'Kết nối Bluetooth',
                'description' => 'Ghép đôi Bluetooth và nhận diện phụ kiện trên iPadOS',
                'type' => 'functional',
                'order_index' => 3,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Pencil',
                'item_name' => 'Sạc nam châm / Chân sạc',
                'description' => 'Hít nam châm sạc cạnh iPad hoặc cắm cổng Lightning/Type-C',
                'type' => 'functional',
                'order_index' => 4,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Pencil',
                'item_name' => 'Thao tác Double-Tap / Squeeze',
                'description' => 'Cảm ứng chạm thân bút chuyển công cụ trên Pencil 2/Pro',
                'type' => 'functional',
                'order_index' => 5,
                'is_active' => true,
            ],
            [
                'category' => 'Apple Pencil',
                'item_name' => 'Pin & Giữ nguồn',
                'description' => 'Kiểm tra giữ pin, không sập nguồn đột ngột khi tháo sạc',
                'type' => 'functional',
                'order_index' => 6,
                'is_active' => true,
            ],

            // MacBook
            [
                'category' => 'MacBook',
                'item_name' => 'Nguồn & Khởi động',
                'description' => 'Kiểm tra khởi động vào macOS, âm thanh khởi động, quạt tản nhiệt',
                'type' => 'functional',
                'order_index' => 1,
                'is_active' => true,
            ],
            [
                'category' => 'MacBook',
                'item_name' => 'Màn hình & Cáp bản lề',
                'description' => 'Kiểm tra điểm sáng, sọc cáp flexgate, hiển thị True Tone khi gập mở',
                'type' => 'visual',
                'order_index' => 2,
                'is_active' => true,
            ],
            [
                'category' => 'MacBook',
                'item_name' => 'Bàn phím & Đèn nền phím',
                'description' => 'Gõ test từng phím, độ nảy phím, hệ thống LED nền phím',
                'type' => 'functional',
                'order_index' => 3,
                'is_active' => true,
            ],
            [
                'category' => 'MacBook',
                'item_name' => 'Trackpad & Force Touch',
                'description' => 'Cảm ứng đa điểm, độ nhạy lực bấm phản hồi rung haptic',
                'type' => 'functional',
                'order_index' => 4,
                'is_active' => true,
            ],
            [
                'category' => 'MacBook',
                'item_name' => 'Pin & Chu kỳ sạc',
                'description' => 'Số chu kỳ cycle count, dung lượng còn lại mAh, cảnh báo Service',
                'type' => 'functional',
                'order_index' => 5,
                'is_active' => true,
            ],
            [
                'category' => 'MacBook',
                'item_name' => 'Loa & Microphone',
                'description' => 'Âm thanh stereo trái/phải không rè, mic thu âm lọc ồn',
                'type' => 'functional',
                'order_index' => 6,
                'is_active' => true,
            ],
            [
                'category' => 'MacBook',
                'item_name' => 'Cổng kết nối ngoại vi',
                'description' => 'Cổng Thunderbolt/USB-C, Jack 3.5mm, HDMI/khe SD card',
                'type' => 'functional',
                'order_index' => 7,
                'is_active' => true,
            ],
            [
                'category' => 'MacBook',
                'item_name' => 'Touch ID & Camera FaceTime',
                'description' => 'Cảm biến vân tay Touch ID và chất lượng hình ảnh webcam',
                'type' => 'functional',
                'order_index' => 8,
                'is_active' => true,
            ],

            // iPad
            [
                'category' => 'iPad',
                'item_name' => 'Cảm ứng & Kính hiển thị',
                'description' => 'Test cảm ứng đa điểm toàn màn hình, không điểm liệt điểm chết',
                'type' => 'functional',
                'order_index' => 1,
                'is_active' => true,
            ],
            [
                'category' => 'iPad',
                'item_name' => 'Màn hình Retina / ProMotion',
                'description' => 'Độ sáng, True Tone, độ mượt tần số quét 120Hz',
                'type' => 'visual',
                'order_index' => 2,
                'is_active' => true,
            ],
            [
                'category' => 'iPad',
                'item_name' => 'Cổng sạc USB-C / Lightning',
                'description' => 'Nhận sạc nhanh và kết nối truyền dữ liệu máy tính',
                'type' => 'functional',
                'order_index' => 3,
                'is_active' => true,
            ],
            [
                'category' => 'iPad',
                'item_name' => 'Pin & Hiệu năng',
                'description' => 'Đo độ chai pin, kiểm tra nhiệt độ khi chạy tác vụ nặng',
                'type' => 'functional',
                'order_index' => 4,
                'is_active' => true,
            ],
            [
                'category' => 'iPad',
                'item_name' => 'Hệ thống Loa & Micro',
                'description' => 'Âm thanh 4 loa stereo, micro đàm thoại và video call',
                'type' => 'functional',
                'order_index' => 5,
                'is_active' => true,
            ],
            [
                'category' => 'iPad',
                'item_name' => 'Camera & Face ID / Touch ID',
                'description' => 'Lấy nét camera trước/sau, cảm biến nhận diện khuôn mặt / vân tay',
                'type' => 'functional',
                'order_index' => 6,
                'is_active' => true,
            ],
            [
                'category' => 'iPad',
                'item_name' => 'Nút bấm vật lý',
                'description' => 'Độ nảy phím nguồn và cụm phím tăng giảm âm lượng',
                'type' => 'functional',
                'order_index' => 7,
                'is_active' => true,
            ],
            [
                'category' => 'iPad',
                'item_name' => 'Smart Connector & Hít nam châm',
                'description' => 'Kết nối bàn phím Magic Keyboard và sạc hít Apple Pencil',
                'type' => 'functional',
                'order_index' => 8,
                'is_active' => true,
            ],
        ];

        foreach ($checklists as $item) {
            ChecklistTemplate::updateOrCreate(
                [
                    'category' => $item['category'],
                    'item_name' => $item['item_name'],
                ],
                $item
            );
        }
    }
}
