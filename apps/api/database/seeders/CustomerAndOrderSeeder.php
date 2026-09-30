<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\IntakeChecklist;
use App\Models\IntakePhoto;
use App\Models\Part;
use App\Models\Payment;
use App\Models\QcChecklistResult;
use App\Models\QcInspection;
use App\Models\QuoteItem;
use App\Models\RepairOrder;
use App\Models\RepairQuote;
use App\Models\RepairService;
use App\Models\Shipment;
use App\Models\User;
use App\Models\Warranty;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class CustomerAndOrderSeeder extends Seeder
{
    public function run(): void
    {
        $branchQ1 = Branch::where('code', 'Q1')->first();
        $admin = User::where('role', 'admin')->first();
        $cskh = User::where('role', 'cskh')->first();
        $ktv = User::where('role', 'technician')->first();
        $qc = User::where('role', 'qc')->first();
        $pro2 = DeviceModel::where('model_code', 'MTJV3VN/A')->first();
        $srvAnc = RepairService::where('code', 'SRV-ANC-PRO2')->first();
        $partPin = Part::where('sku', 'BAT-APP2-01')->first();

        // 1. Customers
        $c1 = Customer::updateOrCreate(
            ['phone' => '0903482716'],
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

        // 2. Core Repair Order PC26-00981
        if ($branchQ1 && $pro2 && $cskh && $ktv) {
            $order = RepairOrder::updateOrCreate(
                ['order_code' => 'PC26-00981'],
                [
                    'branch_id' => $branchQ1->id,
                    'customer_id' => $c1->id,
                    'device_model_id' => $pro2->id,
                    'serial_number' => 'H2LDK9ZMJMMT',
                    'intake_battery_level' => '76–100%',
                    'accessories' => 'Hộp sạc, cáp Type-C',
                    'issue_description' => 'Tai nghe bên phải bị rè khi bật Chống ồn chủ động (ANC) và Micro chập chờn khi gọi điện',
                    'appearance_notes' => 'Vết xước dăm nhẹ nắp lưng hộp sạc, tai nghe nguyên vẹn không nứt vỡ',
                    'status' => 'in_repair',
                    'total_price' => 450000.00,
                    'price_note' => 'Gói sửa ANC & Thay màng rung âm trầm',
                    'warranty_terms_days' => 90,
                    'created_by_user_id' => $cskh->id,
                    'technician_id' => $ktv->id,
                    'qc_inspector_id' => $qc?->id,
                    'customer_approved_at' => Carbon::now()->subHours(3),
                    'tech_accepted_at' => Carbon::now()->subHours(2),
                    'repair_started_at' => Carbon::now()->subHours(1),
                ]
            );

            // 3. Intake Checklists (9 criteria)
            $checklists = [
                ['item_name' => 'Kết nối Bluetooth', 'status' => 'pass', 'note' => 'Nhận kết nối nhanh trên iOS 18'],
                ['item_name' => 'Âm thanh tai trái', 'status' => 'pass', 'note' => 'Âm lượng đều, chi tiết tốt'],
                ['item_name' => 'Âm thanh tai phải', 'status' => 'fail', 'note' => 'Bị rè âm bass khi bật chống ồn'],
                ['item_name' => 'Microphone', 'status' => 'fail', 'note' => 'Thu âm nghẹt phía tai phải'],
                ['item_name' => 'Pin & thời lượng sử dụng', 'status' => 'pass', 'note' => 'Pin còn 92% dung lượng'],
                ['item_name' => 'Hộp sạc / nhận sạc', 'status' => 'pass', 'note' => 'Sạc dây và MagSafe đều nhận'],
                ['item_name' => 'Chống ồn ANC', 'status' => 'fail', 'note' => 'Phát tiếng rít gió khi kích hoạt'],
                ['item_name' => 'Xuyên âm (Transparency)', 'status' => 'pass', 'note' => 'Hoạt động bình thường'],
                ['item_name' => 'Nút cảm ứng lực', 'status' => 'pass', 'note' => 'Thao tác bóp đúp và vuốt âm lượng tốt'],
            ];

            foreach ($checklists as $item) {
                IntakeChecklist::updateOrCreate(
                    ['repair_order_id' => $order->id, 'item_name' => $item['item_name']],
                    $item
                );
            }

            // 4. Intake Photos
            IntakePhoto::updateOrCreate(
                ['repair_order_id' => $order->id, 'caption' => 'Hiện trạng tiếp nhận tại quầy'],
                [
                    'photo_url' => 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=800&auto=format&fit=crop',
                    'file_path' => 'intake/2026/09/PC26-00981-front.jpg',
                    'uploaded_by_user_id' => $cskh->id,
                ]
            );

            // 5. Repair Quote
            $quote = RepairQuote::updateOrCreate(
                ['quote_number' => 'PC26-QT-00981'],
                [
                    'repair_order_id' => $order->id,
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
                ['quote_id' => $quote->id, 'description' => 'Sửa lỗi chống ồn ANC & Cân chỉnh Driver tai phải'],
                [
                    'service_id' => $srvAnc?->id,
                    'part_id' => null,
                    'quantity' => 1,
                    'unit_price' => 450000.00,
                    'amount' => 450000.00,
                ]
            );
        }
    }
}
