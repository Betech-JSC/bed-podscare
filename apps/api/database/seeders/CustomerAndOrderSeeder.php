<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\IntakeChecklist;
use App\Models\IntakePhoto;
use App\Models\Part;
use App\Models\Payment;
use App\Models\QcInspection;
use App\Models\QuoteItem;
use App\Models\RepairOrder;
use App\Models\RepairQuote;
use App\Models\RepairService;
use App\Models\User;
use App\Models\Warranty;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class CustomerAndOrderSeeder extends Seeder
{
    public function run(): void
    {
        $branchQ1 = Branch::where('code', 'Q1')->first();
        $branchQ3 = Branch::where('code', 'Q3')->first();
        $branchQ3Id = $branchQ3?->id ?? 2;

        $admin = User::where('email', 'admin@fixo.com.vn')->first() ?? User::where('email', 'admin@podscare.vn')->first() ?? User::where('role', 'admin')->first();
        $cskh = User::where('email', 'cskh.lan@fixo.com.vn')->first() ?? User::where('email', 'cskh.lan@podscare.vn')->first() ?? User::where('role', 'cskh')->first();
        $ktvTuan = User::where('email', 'ktv.tuan@fixo.com.vn')->first() ?? User::where('email', 'ktv.tuan@podscare.vn')->first() ?? User::where('role', 'technician')->first();
        $ktvDuy = User::where('email', 'ktv.duy@fixo.com.vn')->first() ?? User::where('email', 'ktv.duy@podscare.vn')->first();
        $qc = User::where('email', 'qc.inspector@fixo.com.vn')->first() ?? User::where('email', 'qc.inspector@podscare.vn')->first() ?? User::where('role', 'qc')->first();

        $pro2 = DeviceModel::where('model_code', 'MTJV3VN/A')->first();
        $ap3 = DeviceModel::where('model_code', 'MME73VN/A')->first();
        $pro = DeviceModel::where('model_code', 'MLWK3VN/A')->first();
        $max = DeviceModel::where('model_code', 'MGYH3VN/A')->first();
        $ap2 = DeviceModel::where('model_code', 'MV7N2VN/A')->first();

        $srvAnc = RepairService::where('code', 'SRV-ANC-PRO2')->first();
        $srvBatPro2 = RepairService::where('code', 'SRV-BAT-PRO2')->first();
        $srvBatAp3 = RepairService::where('code', 'SRV-BAT-AP3')->first();
        $srvSpkPro = RepairService::where('code', 'SRV-SPK-PRO')->first();
        $srvCln = RepairService::where('code', 'SRV-CLN-ALL')->first();

        $partPinPro2 = Part::where('sku', 'BAT-APP2-01')->first();
        $partPinAp3 = Part::where('sku', 'BAT-APP3-02')->first();

        // 1. Customers
        $c1 = Customer::updateOrCreate(
            ['phone' => '0900000001'],
            [
                'name' => 'Nguyễn Minh Anh',
                'email' => 'minhanh.nguyen@gmail.com',
                'customer_type' => 'retail',
                'source' => 'store',
                'notes' => 'Khách hàng thân thiết, cần lấy gấp trước 17h',
                'orders_count' => 1,
                'total_spent' => 450000.00,
            ]
        );

        $c2 = Customer::updateOrCreate(
            ['phone' => '0988112233'],
            [
                'name' => 'Lê Hoàng Long',
                'email' => 'long.le@gmail.com',
                'customer_type' => 'retail',
                'source' => 'store',
                'notes' => 'Khách mang máy đến vào buổi trưa, chờ duyệt giá',
                'orders_count' => 1,
                'total_spent' => 350000.00,
            ]
        );

        $c3 = Customer::updateOrCreate(
            ['phone' => '0977223344'],
            [
                'name' => 'Phạm Thu Hà',
                'email' => 'thuha.pham@gmail.com',
                'customer_type' => 'retail',
                'source' => 'online',
                'notes' => 'Đặt lịch qua Zalo OA, đã duyệt giá trước',
                'orders_count' => 1,
                'total_spent' => 600000.00,
            ]
        );

        $c4 = Customer::updateOrCreate(
            ['phone' => '0918223344'],
            [
                'name' => 'Hoàng Nhật Nam (iStore)',
                'email' => 'nam.istore@gmail.com',
                'customer_type' => 'dealer',
                'source' => 'referral',
                'notes' => 'Đại lý quận 10 gửi lô 5 máy',
                'orders_count' => 5,
                'total_spent' => 3200000.00,
            ]
        );

        $c5 = Customer::updateOrCreate(
            ['phone' => '0933556677'],
            [
                'name' => 'Đỗ Bích Phương',
                'email' => 'bichphuong.do@gmail.com',
                'customer_type' => 'vip',
                'source' => 'store',
                'notes' => 'Khách hàng VIP, yêu cầu kiểm tra kỹ',
                'orders_count' => 2,
                'total_spent' => 1850000.00,
            ]
        );

        $c6 = Customer::updateOrCreate(
            ['phone' => '0912998877'],
            [
                'name' => 'Vũ Anh Tuấn',
                'email' => 'tuan.vu@gmail.com',
                'customer_type' => 'retail',
                'source' => 'store',
                'notes' => 'Khách hàng thường, sửa AirPods 2',
                'orders_count' => 1,
                'total_spent' => 250000.00,
            ]
        );

        $c7 = Customer::updateOrCreate(
            ['phone' => '0909887766'],
            [
                'name' => 'Trần Bảo Ngọc',
                'email' => 'ngoc.tran@gmail.com',
                'customer_type' => 'retail',
                'source' => 'store',
                'notes' => 'Khách tiếp nhận tại Chi nhánh Q3',
                'orders_count' => 1,
                'total_spent' => 480000.00,
            ]
        );

        // Helper gán 9 tiêu chí checklist tiêu chuẩn
        $seedChecklist = function (RepairOrder $order, array $customFails = []) {
            $baseItems = [
                ['item_name' => 'Kết nối Bluetooth', 'default_note' => 'Nhận kết nối nhanh trên thiết bị iOS/Android'],
                ['item_name' => 'Âm thanh tai trái', 'default_note' => 'Âm lượng đều, chi tiết tốt'],
                ['item_name' => 'Âm thanh tai phải', 'default_note' => 'Âm lượng đều, không rè'],
                ['item_name' => 'Microphone', 'default_note' => 'Thu âm rõ, không chập chờn'],
                ['item_name' => 'Pin & thời lượng sử dụng', 'default_note' => 'Dung lượng pin trên 85%'],
                ['item_name' => 'Hộp sạc / nhận sạc', 'default_note' => 'Sạc dây và sạc không dây đều nhận tốt'],
                ['item_name' => 'Chống ồn ANC', 'default_note' => 'Khử ồn tốt, không rít'],
                ['item_name' => 'Xuyên âm (Transparency)', 'default_note' => 'Chế độ xuyên âm rõ ràng tự nhiên'],
                ['item_name' => 'Nút cảm ứng lực', 'default_note' => 'Thao tác bóp đúp và vuốt âm lượng tốt'],
            ];

            foreach ($baseItems as $item) {
                $status = 'pass';
                $note = $item['default_note'];
                if (isset($customFails[$item['item_name']])) {
                    $status = 'fail';
                    $note = $customFails[$item['item_name']];
                }

                IntakeChecklist::updateOrCreate(
                    ['repair_order_id' => $order->id, 'item_name' => $item['item_name']],
                    [
                        'status' => $status,
                        'note' => $note,
                    ]
                );
            }
        };

        // =========================================================================
        // ĐƠN 1: FX26-00981 - in_repair (Chi nhánh Q1, KTV Tuấn)
        // =========================================================================
        if ($branchQ1 && $pro2 && $cskh && $ktvTuan) {
            $order1 = RepairOrder::updateOrCreate(
                ['order_code' => 'FX26-00981'],
                [
                    'branch_id' => $branchQ1->id,
                    'customer_id' => $c1->id,
                    'device_model_id' => $pro2->id,
                    'serial_number' => 'DEMO-APP2-00981',
                    'intake_battery_level' => '76–100%',
                    'accessories' => 'Hộp sạc, cáp Type-C',
                    'issue_description' => 'Tai nghe bên phải bị rè khi bật Chống ồn chủ động (ANC) và Micro chập chờn khi gọi điện',
                    'appearance_notes' => 'Vết xước dăm nhẹ nắp lưng hộp sạc, tai nghe nguyên vẹn không nứt vỡ',
                    'status' => 'in_repair',
                    'total_price' => 450000.00,
                    'price_note' => 'Gói sửa ANC & Thay màng rung âm trầm',
                    'warranty_terms_days' => 90,
                    'created_by_user_id' => $cskh->id,
                    'technician_id' => $ktvTuan->id,
                    'qc_inspector_id' => $qc?->id,
                    'customer_approved_at' => Carbon::now()->subHours(3),
                    'tech_accepted_at' => Carbon::now()->subHours(2),
                    'repair_started_at' => Carbon::now()->subHours(1),
                ]
            );

            $seedChecklist($order1, [
                'Âm thanh tai phải' => 'Bị rè âm bass khi bật chống ồn',
                'Microphone' => 'Thu âm nghẹt phía tai phải',
                'Chống ồn ANC' => 'Phát tiếng rít gió khi kích hoạt',
            ]);

            IntakePhoto::updateOrCreate(
                ['repair_order_id' => $order1->id, 'caption' => 'Hiện trạng tiếp nhận tại quầy'],
                [
                    'photo_url' => 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=800&auto=format&fit=crop',
                    'file_path' => 'intake/2026/09/FX26-00981-front.jpg',
                    'uploaded_by_user_id' => $cskh->id,
                ]
            );

            $quote1 = RepairQuote::updateOrCreate(
                ['quote_number' => 'FX26-QT-00981'],
                [
                    'repair_order_id' => $order1->id,
                    'total_amount' => 450000.00,
                    'warranty_terms_days' => 90,
                    'note' => 'Báo giá xử lý triệt để rè chống ồn ANC tai phải, bảo hành chính hãng 90 ngày',
                    'status' => 'approved',
                    'sent_by_user_id' => $cskh->id,
                    'sent_at' => Carbon::now()->subHours(4),
                    'responded_at' => Carbon::now()->subHours(3),
                ]
            );

            QuoteItem::updateOrCreate(
                ['quote_id' => $quote1->id, 'description' => 'Sửa lỗi chống ồn ANC & Cân chỉnh Driver tai phải'],
                [
                    'service_id' => $srvAnc?->id,
                    'part_id' => null,
                    'quantity' => 1,
                    'unit_price' => 450000.00,
                    'amount' => 450000.00,
                ]
            );
        }

        // =========================================================================
        // ĐƠN 2: FX26-00982 - waiting_approval (Chi nhánh Q1, kèm RepairQuote pending)
        // =========================================================================
        if ($branchQ1 && $cskh) {
            $order2 = RepairOrder::updateOrCreate(
                ['order_code' => 'FX26-00982'],
                [
                    'branch_id' => $branchQ1->id,
                    'customer_id' => $c2->id,
                    'device_model_id' => $ap3?->id ?? $pro2->id,
                    'serial_number' => 'DEMO-AP3-00982',
                    'intake_battery_level' => '26–50%',
                    'accessories' => 'Hộp sạc',
                    'issue_description' => 'Tai nghe trái chai pin, sạc đầy chỉ nghe được 15 phút là báo yếu pin sập nguồn',
                    'appearance_notes' => 'Ngoại hình đẹp 98%, chân tiếp xúc dock sạc sạch sẽ',
                    'status' => 'waiting_approval',
                    'total_price' => 350000.00,
                    'price_note' => 'Thay pin tai nghe AirPods 3 chính hãng',
                    'warranty_terms_days' => 90,
                    'created_by_user_id' => $cskh->id,
                    'technician_id' => null,
                    'qc_inspector_id' => null,
                ]
            );

            $seedChecklist($order2, [
                'Pin & thời lượng sử dụng' => 'Tai nghe trái chai pin nặng, tụt nguồn sau 15 phút',
            ]);

            IntakePhoto::updateOrCreate(
                ['repair_order_id' => $order2->id, 'caption' => 'Hiện trạng tiếp nhận AirPods 3'],
                [
                    'photo_url' => 'https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?w=800&auto=format&fit=crop',
                    'file_path' => 'intake/2026/09/FX26-00982-front.jpg',
                    'uploaded_by_user_id' => $cskh->id,
                ]
            );

            $quote2 = RepairQuote::updateOrCreate(
                ['quote_number' => 'FX26-QT-00982'],
                [
                    'repair_order_id' => $order2->id,
                    'total_amount' => 350000.00,
                    'warranty_terms_days' => 90,
                    'note' => 'Báo giá thay pin tai nghe AirPods 3 chính hãng chuẩn Apple, bảo hành 90 ngày',
                    'status' => 'pending', // Kèm RepairQuote pending
                    'sent_by_user_id' => $cskh->id,
                    'sent_at' => Carbon::now()->subHours(2),
                    'responded_at' => null,
                ]
            );

            QuoteItem::updateOrCreate(
                ['quote_id' => $quote2->id, 'description' => 'Thay pin tai nghe AirPods 3 zin chuẩn Apple'],
                [
                    'service_id' => $srvBatAp3?->id,
                    'part_id' => $partPinAp3?->id,
                    'quantity' => 1,
                    'unit_price' => 350000.00,
                    'amount' => 350000.00,
                ]
            );
        }

        // =========================================================================
        // ĐƠN 3: FX26-00983 - waiting_tech (Chi nhánh Q1, chưa phân công KTV - technician_id null)
        // =========================================================================
        if ($branchQ1 && $cskh) {
            $order3 = RepairOrder::updateOrCreate(
                ['order_code' => 'FX26-00983'],
                [
                    'branch_id' => $branchQ1->id,
                    'customer_id' => $c3->id,
                    'device_model_id' => $pro?->id ?? $pro2->id,
                    'serial_number' => 'DEMO-APP-00983',
                    'intake_battery_level' => '51–75%',
                    'accessories' => 'Hộp sạc, đệm tai size M',
                    'issue_description' => 'Màng loa titan bị rách gây rè âm bass khi nghe nhạc lớn, mic bên trái đàm thoại nhỏ',
                    'appearance_notes' => 'Hộp sạc xước nhẹ mặt lưng, tai nghe không cấn móp',
                    'status' => 'waiting_tech',
                    'total_price' => 600000.00,
                    'price_note' => 'Thay củ loa titan AirPods Pro & Vệ sinh màng mic',
                    'warranty_terms_days' => 90,
                    'created_by_user_id' => $cskh->id,
                    'technician_id' => null, // Chưa phân công KTV - technician_id null
                    'qc_inspector_id' => null,
                    'customer_approved_at' => Carbon::now()->subHours(2),
                ]
            );

            $seedChecklist($order3, [
                'Âm thanh tai trái' => 'Rè âm bass khi âm lượng trên 70%',
                'Microphone' => 'Mic trái đàm thoại nhỏ',
            ]);

            IntakePhoto::updateOrCreate(
                ['repair_order_id' => $order3->id, 'caption' => 'Hiện trạng tiếp nhận AirPods Pro'],
                [
                    'photo_url' => 'https://images.unsplash.com/photo-1588423771073-b8903fbb85b5?w=800&auto=format&fit=crop',
                    'file_path' => 'intake/2026/09/FX26-00983-front.jpg',
                    'uploaded_by_user_id' => $cskh->id,
                ]
            );

            $quote3 = RepairQuote::updateOrCreate(
                ['quote_number' => 'FX26-QT-00983'],
                [
                    'repair_order_id' => $order3->id,
                    'total_amount' => 600000.00,
                    'warranty_terms_days' => 90,
                    'note' => 'Khách hàng đã đồng ý báo giá gói thay driver màng titan',
                    'status' => 'approved',
                    'sent_by_user_id' => $cskh->id,
                    'sent_at' => Carbon::now()->subHours(3),
                    'responded_at' => Carbon::now()->subHours(2),
                ]
            );

            QuoteItem::updateOrCreate(
                ['quote_id' => $quote3->id, 'description' => 'Thay cụm loa titan AirPods Pro và căn chỉnh âm trường'],
                [
                    'service_id' => $srvSpkPro?->id,
                    'part_id' => null,
                    'quantity' => 1,
                    'unit_price' => 600000.00,
                    'amount' => 600000.00,
                ]
            );
        }

        // =========================================================================
        // ĐƠN 4: FX26-00984 - waiting_qc (Chi nhánh Q1, KTV Tuấn vừa sửa xong)
        // =========================================================================
        if ($branchQ1 && $pro2 && $cskh && $ktvTuan) {
            $order4 = RepairOrder::updateOrCreate(
                ['order_code' => 'FX26-00984'],
                [
                    'branch_id' => $branchQ1->id,
                    'customer_id' => $c4->id,
                    'device_model_id' => $pro2->id,
                    'serial_number' => 'DEMO-APP2-00984',
                    'intake_battery_level' => '76–100%',
                    'accessories' => 'Hộp sạc, cáp Type-C',
                    'issue_description' => 'Chai pin cả 2 bên tai nghe và hộp sạc báo đèn cam chập chờn khi sạc dây',
                    'appearance_notes' => 'Hộp sạc có vết cấn nhẹ góc dưới phải',
                    'status' => 'waiting_qc',
                    'total_price' => 550000.00,
                    'price_note' => 'Thay cặp cell pin tai nghe AirPods Pro 2 & Xử lý mạch sạc dock',
                    'warranty_terms_days' => 90,
                    'created_by_user_id' => $cskh->id,
                    'technician_id' => $ktvTuan->id, // KTV Tuấn vừa sửa xong
                    'qc_inspector_id' => $qc?->id,
                    'customer_approved_at' => Carbon::now()->subHours(4),
                    'tech_accepted_at' => Carbon::now()->subHours(3),
                    'repair_started_at' => Carbon::now()->subHours(2),
                    'repair_completed_at' => Carbon::now()->subMinutes(20),
                    'repair_note' => 'Đã thay cặp cell pin zin và hàn gia cố chân sạc dock, dòng sạc ổn định.',
                    'parts_used_summary' => '2x Cell Pin BAT-APP2-01',
                ]
            );

            $seedChecklist($order4, [
                'Pin & thời lượng sử dụng' => 'Chai pin cả 2 tai nghe',
                'Hộp sạc / nhận sạc' => 'Cổng cắm lỏng chân sạc',
            ]);

            IntakePhoto::updateOrCreate(
                ['repair_order_id' => $order4->id, 'caption' => 'Hiện trạng tiếp nhận AirPods Pro 2'],
                [
                    'photo_url' => 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=800&auto=format&fit=crop',
                    'file_path' => 'intake/2026/09/FX26-00984-front.jpg',
                    'uploaded_by_user_id' => $cskh->id,
                ]
            );

            $quote4 = RepairQuote::updateOrCreate(
                ['quote_number' => 'FX26-QT-00984'],
                [
                    'repair_order_id' => $order4->id,
                    'total_amount' => 550000.00,
                    'warranty_terms_days' => 90,
                    'note' => 'Báo giá đại lý thay cặp cell pin và cân chỉnh dock sạc',
                    'status' => 'approved',
                    'sent_by_user_id' => $cskh->id,
                    'sent_at' => Carbon::now()->subHours(5),
                    'responded_at' => Carbon::now()->subHours(4),
                ]
            );

            QuoteItem::updateOrCreate(
                ['quote_id' => $quote4->id, 'description' => 'Thay cặp pin tai nghe AirPods Pro 2'],
                [
                    'service_id' => $srvBatPro2?->id,
                    'part_id' => $partPinPro2?->id,
                    'quantity' => 2,
                    'unit_price' => 275000.00,
                    'amount' => 550000.00,
                ]
            );
        }

        // =========================================================================
        // ĐƠN 5: FX26-00985 - ready_for_return (Chi nhánh Q1, đã có QcInspection pass, chờ thu tiền / trả máy)
        // =========================================================================
        if ($branchQ1 && $cskh && $ktvTuan) {
            $order5 = RepairOrder::updateOrCreate(
                ['order_code' => 'FX26-00985'],
                [
                    'branch_id' => $branchQ1->id,
                    'customer_id' => $c5->id,
                    'device_model_id' => $max?->id ?? $pro2->id,
                    'serial_number' => 'DEMO-APM-00985',
                    'intake_battery_level' => '76–100%',
                    'accessories' => 'Smart Case',
                    'issue_description' => 'Mất kết nối chụp tai phải, không chuyển được chế độ chống ồn và spatial audio',
                    'appearance_notes' => 'Đệm tai hơi ngả màu, khung headband nhôm nguyên vẹn',
                    'status' => 'ready_for_return',
                    'total_price' => 1200000.00,
                    'price_note' => 'Thay cáp kết nối trục xoay headband AirPods Max',
                    'warranty_terms_days' => 90,
                    'created_by_user_id' => $cskh->id,
                    'technician_id' => $ktvTuan->id,
                    'qc_inspector_id' => $qc?->id,
                    'customer_approved_at' => Carbon::now()->subDays(1),
                    'tech_accepted_at' => Carbon::now()->subHours(8),
                    'repair_started_at' => Carbon::now()->subHours(6),
                    'repair_completed_at' => Carbon::now()->subHours(3),
                    'qc_passed_at' => Carbon::now()->subHours(2),
                    'repair_note' => 'Đã thay cụm cáp flex headband chính hãng, test âm thanh đa hướng spatial audio chuẩn.',
                    'parts_used_summary' => '1x Cáp flex trục headband AirPods Max',
                ]
            );

            $seedChecklist($order5, [
                'Âm thanh tai phải' => 'Mất âm tai phải do đứt cáp bản lề',
                'Chống ồn ANC' => 'Không kích hoạt được ANC',
            ]);

            IntakePhoto::updateOrCreate(
                ['repair_order_id' => $order5->id, 'caption' => 'Hiện trạng tiếp nhận AirPods Max'],
                [
                    'photo_url' => 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&auto=format&fit=crop',
                    'file_path' => 'intake/2026/09/FX26-00985-front.jpg',
                    'uploaded_by_user_id' => $cskh->id,
                ]
            );

            $quote5 = RepairQuote::updateOrCreate(
                ['quote_number' => 'FX26-QT-00985'],
                [
                    'repair_order_id' => $order5->id,
                    'total_amount' => 1200000.00,
                    'warranty_terms_days' => 90,
                    'note' => 'Báo giá thay cụm cáp flex bản lề AirPods Max chính hãng',
                    'status' => 'approved',
                    'sent_by_user_id' => $cskh->id,
                    'sent_at' => Carbon::now()->subDays(1)->subHours(2),
                    'responded_at' => Carbon::now()->subDays(1),
                ]
            );

            QuoteItem::updateOrCreate(
                ['quote_id' => $quote5->id, 'description' => 'Thay cáp flex headband AirPods Max'],
                [
                    'service_id' => null,
                    'part_id' => null,
                    'quantity' => 1,
                    'unit_price' => 1200000.00,
                    'amount' => 1200000.00,
                ]
            );

            // Đã có biên bản QC Pass để đáp ứng FSM precondition
            QcInspection::updateOrCreate(
                ['repair_order_id' => $order5->id],
                [
                    'inspector_id' => $qc?->id ?? $admin->id,
                    'result' => 'pass',
                    'notes' => 'Kiểm định toàn diện 9 tiêu chí đạt chuẩn xuất sắc, đã test chống ồn ANC và spatial audio ổn định',
                ]
            );
        }

        // =========================================================================
        // ĐƠN 6: FX26-00986 - completed (Chi nhánh Q1, đã có Payment và Warranty kích hoạt)
        // =========================================================================
        if ($branchQ1 && $cskh && $ktvTuan) {
            $order6 = RepairOrder::updateOrCreate(
                ['order_code' => 'FX26-00986'],
                [
                    'branch_id' => $branchQ1->id,
                    'customer_id' => $c6->id,
                    'device_model_id' => $ap2?->id ?? $pro2->id,
                    'serial_number' => 'DEMO-AP2-00986',
                    'intake_battery_level' => '76–100%',
                    'accessories' => 'Hộp sạc',
                    'issue_description' => 'Loa bị nhỏ bên trái, màng loa bám bụi bẩn lâu ngày',
                    'appearance_notes' => 'Hộp sạc và tai nghe hơi trầy do sử dụng lâu năm',
                    'status' => 'completed',
                    'total_price' => 250000.00,
                    'price_note' => 'Vệ sinh chuyên sâu sóng siêu âm & Cân chỉnh âm lượng tai nghe',
                    'warranty_terms_days' => 30,
                    'created_by_user_id' => $cskh->id,
                    'technician_id' => $ktvTuan->id,
                    'qc_inspector_id' => $qc?->id,
                    'handed_over_by_user_id' => $cskh->id,
                    'customer_approved_at' => Carbon::now()->subDays(2),
                    'tech_accepted_at' => Carbon::now()->subDays(2)->addHours(1),
                    'repair_started_at' => Carbon::now()->subDays(2)->addHours(2),
                    'repair_completed_at' => Carbon::now()->subDays(2)->addHours(4),
                    'qc_passed_at' => Carbon::now()->subDays(2)->addHours(5),
                    'customer_notified_at' => Carbon::now()->subDays(2)->addHours(5)->addMinutes(30),
                    'handed_over_at' => Carbon::now()->subDays(1),
                    'repair_note' => 'Đã làm sạch màng loa sóng siêu âm, âm thanh 2 bên to rõ đều nhau.',
                ]
            );

            $seedChecklist($order6, [
                'Âm thanh tai trái' => 'Âm thanh nhỏ do bám bụi lâu ngày',
            ]);

            IntakePhoto::updateOrCreate(
                ['repair_order_id' => $order6->id, 'caption' => 'Hiện trạng tiếp nhận AirPods 2'],
                [
                    'photo_url' => 'https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?w=800&auto=format&fit=crop',
                    'file_path' => 'intake/2026/09/FX26-00986-front.jpg',
                    'uploaded_by_user_id' => $cskh->id,
                ]
            );

            $quote6 = RepairQuote::updateOrCreate(
                ['quote_number' => 'FX26-QT-00986'],
                [
                    'repair_order_id' => $order6->id,
                    'total_amount' => 250000.00,
                    'warranty_terms_days' => 30,
                    'note' => 'Gói vệ sinh chuyên sâu toàn diện AirPods 2',
                    'status' => 'approved',
                    'sent_by_user_id' => $cskh->id,
                    'sent_at' => Carbon::now()->subDays(2)->subHours(1),
                    'responded_at' => Carbon::now()->subDays(2),
                ]
            );

            QuoteItem::updateOrCreate(
                ['quote_id' => $quote6->id, 'description' => 'Vệ sinh chuyên sâu sóng siêu âm & Cân chỉnh driver'],
                [
                    'service_id' => $srvCln?->id,
                    'part_id' => null,
                    'quantity' => 1,
                    'unit_price' => 250000.00,
                    'amount' => 250000.00,
                ]
            );

            QcInspection::updateOrCreate(
                ['repair_order_id' => $order6->id],
                [
                    'inspector_id' => $qc?->id ?? $admin->id,
                    'result' => 'pass',
                    'notes' => 'Kiểm tra âm thanh và ngoại quan đạt chuẩn bàn giao',
                ]
            );

            // Đã có Payment
            Payment::updateOrCreate(
                ['payment_code' => 'PAY-FX26-00986'],
                [
                    'repair_order_id' => $order6->id,
                    'amount' => 250000.00,
                    'payment_method' => 'cash',
                    'status' => 'completed',
                    'paid_at' => Carbon::now()->subDays(1),
                    'received_by_user_id' => $cskh->id,
                    'notes' => 'Khách thanh toán tiền mặt tại quầy',
                ]
            );

            // Đã có Warranty kích hoạt
            Warranty::updateOrCreate(
                ['warranty_code' => 'FX26-WR-00986'],
                [
                    'repair_order_id' => $order6->id,
                    'customer_id' => $c6->id,
                    'device_model_id' => $ap2?->id ?? $pro2->id,
                    'coverage_item' => 'Vệ sinh chuyên sâu sóng siêu âm & Cân chỉnh driver',
                    'start_date' => Carbon::now()->subDays(1)->toDateString(),
                    'duration_days' => 30,
                    'end_date' => Carbon::now()->subDays(1)->addDays(30)->toDateString(),
                    'status' => 'active',
                ]
            );
        }

        // =========================================================================
        // ĐƠN 7: FX26-00987 - in_repair (Chi nhánh Q3, gán branch_id = 2 và KTV Duy)
        // =========================================================================
        if ($pro2) {
            $order7 = RepairOrder::updateOrCreate(
                ['order_code' => 'FX26-00987'],
                [
                    'branch_id' => $branchQ3Id,
                    'customer_id' => $c7->id,
                    'device_model_id' => $pro2->id,
                    'serial_number' => 'DEMO-APP2-00987',
                    'intake_battery_level' => '76–100%',
                    'accessories' => 'Hộp sạc, cáp sạc USB-C, 3 cặp tips',
                    'issue_description' => 'Chống ồn ANC phát ra tiếng rít chói tai, mic thu âm rè khi đi xe máy ngoài đường',
                    'appearance_notes' => 'Ngoại hình máy mới 99%, đầy đủ phụ kiện',
                    'status' => 'in_repair',
                    'total_price' => 480000.00,
                    'price_note' => 'Sửa cụm mic chống ồn ANC & Cân chỉnh tần số âm thanh',
                    'warranty_terms_days' => 90,
                    'created_by_user_id' => $admin->id,
                    'technician_id' => $ktvDuy?->id, // KTV Duy tại Q3 (ktv.duy@fixo.com.vn)
                    'qc_inspector_id' => $qc?->id,
                    'customer_approved_at' => Carbon::now()->subHours(5),
                    'tech_accepted_at' => Carbon::now()->subHours(3),
                    'repair_started_at' => Carbon::now()->subHours(2),
                    'repair_note' => 'Đang tháo cụm driver để cân chỉnh lại mic thu âm môi trường',
                ]
            );

            $seedChecklist($order7, [
                'Chống ồn ANC' => 'Phát tiếng rít khi có gió thổi vào micro',
                'Microphone' => 'Mic rè khi nói chuyện',
            ]);

            IntakePhoto::updateOrCreate(
                ['repair_order_id' => $order7->id, 'caption' => 'Hiện trạng tiếp nhận tại Chi nhánh Q3'],
                [
                    'photo_url' => 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=800&auto=format&fit=crop',
                    'file_path' => 'intake/2026/09/FX26-00987-front.jpg',
                    'uploaded_by_user_id' => $admin->id,
                ]
            );

            $quote7 = RepairQuote::updateOrCreate(
                ['quote_number' => 'FX26-QT-00987'],
                [
                    'repair_order_id' => $order7->id,
                    'total_amount' => 480000.00,
                    'warranty_terms_days' => 90,
                    'note' => 'Báo giá xử lý triệt để rè chống ồn ANC tại Chi nhánh Quận 3',
                    'status' => 'approved',
                    'sent_by_user_id' => $admin->id,
                    'sent_at' => Carbon::now()->subHours(5),
                    'responded_at' => Carbon::now()->subHours(5),
                ]
            );

            QuoteItem::updateOrCreate(
                ['quote_id' => $quote7->id, 'description' => 'Gói sửa cụm mic chống ồn ANC và cân chỉnh âm sắc'],
                [
                    'service_id' => $srvAnc?->id,
                    'part_id' => null,
                    'quantity' => 1,
                    'unit_price' => 480000.00,
                    'amount' => 480000.00,
                ]
            );
        }
    }
}
