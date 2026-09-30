<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\RepairOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TrackingController extends Controller
{
    /**
     * Cổng tra cứu công khai tiến độ sửa chữa cho khách hàng.
     * URL: GET /api/v1/tracking/{code}?phone=0903482716
     * KHÔNG CẦN AUTHENTICATION.
     */
    public function track(string $code, Request $request): JsonResponse
    {
        $phone = $request->input('phone');

        $query = RepairOrder::with([
            'customer:id,name,phone',
            'deviceModel:id,name,model_code,image_url',
            'branch:id,name,address,phone',
            'intakeChecklists:id,repair_order_id,item_name,status,note',
            'intakePhotos:id,repair_order_id,photo_url,caption',
            'quotes:id,repair_order_id,quote_number,total_amount,warranty_terms_days,note,status',
            'quotes.items:id,quote_id,description,quantity,unit_price,amount',
            'shipments:id,repair_order_id,delivery_method,carrier_name,tracking_code,status,scheduled_at',
            'warranties:id,repair_order_id,warranty_code,coverage_item,start_date,duration_days,end_date,status',
        ])->where('order_code', $code);

        // Nếu khách hàng cung cấp số điện thoại thì đối chiếu để bảo mật thông tin
        if ($phone) {
            $cleanPhone = preg_replace('/[^0-9]/', '', $phone);
            $query->whereHas('customer', function ($q) use ($cleanPhone) {
                $q->where(function ($sq) use ($cleanPhone) {
                    $sq->where('phone', $cleanPhone)
                       ->orWhere('phone', 'like', "%{$cleanPhone}%");
                });
            });
        }

        $order = $query->first();

        if (! $order) {
            return $this->failure(
                'Không tìm thấy đơn sửa chữa. Vui lòng kiểm tra lại Mã đơn và Số điện thoại.',
                404
            );
        }

        // Tính toán các bước tiến độ (6 bước quy chuẩn)
        $timeline = [
            [
                'step'        => 1,
                'title'       => 'Tiếp nhận thiết bị',
                'description' => 'Kiểm tra 9 hạng mục chức năng tại quầy & chụp ảnh hiện trạng',
                'completed'   => true,
                'timestamp'   => $order->created_at?->toIso8601String(),
            ],
            [
                'step'        => 2,
                'title'       => 'Báo giá & Linh kiện',
                'description' => $order->price_note ?? 'Lập bảng báo giá chi tiết và gửi khách duyệt',
                'completed'   => in_array($order->status, ['waiting_tech', 'assigned', 'in_repair', 'waiting_parts', 'waiting_qc', 'ready_for_return', 'waiting_pickup', 'completed'], true),
                'timestamp'   => $order->customer_approved_at?->toIso8601String(),
            ],
            [
                'step'        => 3,
                'title'       => 'Tiến hành sửa chữa',
                'description' => 'Kỹ thuật viên chuyên nghiệp xử lý phần cứng và thay linh kiện',
                'completed'   => in_array($order->status, ['waiting_qc', 'ready_for_return', 'waiting_pickup', 'completed'], true),
                'timestamp'   => $order->repair_started_at?->toIso8601String(),
            ],
            [
                'step'        => 4,
                'title'       => 'Kiểm định chất lượng QC',
                'description' => 'Đánh giá 6 tiêu chuẩn âm thanh, Bluetooth, pin và chống ồn',
                'completed'   => in_array($order->status, ['ready_for_return', 'waiting_pickup', 'completed'], true),
                'timestamp'   => $order->qc_passed_at?->toIso8601String(),
            ],
            [
                'step'        => 5,
                'title'       => 'Sẵn sàng bàn giao',
                'description' => 'Vệ sinh máy, đóng gói và thông báo khách đến nhận hoặc xuất kho giao tận nơi',
                'completed'   => in_array($order->status, ['waiting_pickup', 'completed'], true),
                'timestamp'   => $order->customer_notified_at?->toIso8601String(),
            ],
            [
                'step'        => 6,
                'title'       => 'Hoàn tất & Bảo hành',
                'description' => 'Kích hoạt sổ bảo hành điện tử chính hãng',
                'completed'   => $order->status === 'completed',
                'timestamp'   => $order->handed_over_at?->toIso8601String(),
            ],
        ];

        return $this->success([
            'order'    => $order,
            'timeline' => $timeline,
        ], 'Tra cứu thông tin tiến độ đơn sửa chữa thành công.');
    }
}
