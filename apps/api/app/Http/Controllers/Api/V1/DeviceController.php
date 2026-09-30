<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DeviceModel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeviceController extends Controller
{
    /**
     * Danh sách thiết bị (AirPods các dòng).
     */
    public function index(Request $request): JsonResponse
    {
        $devices = DeviceModel::where('is_active', true)
            ->withCount('repairServices')
            ->orderBy('release_year', 'desc')
            ->get();

        return $this->success($devices, 'Lấy danh mục thiết bị thành công.');
    }

    /**
     * Chi tiết thiết bị kèm các dịch vụ áp dụng.
     */
    public function show(int $id): JsonResponse
    {
        $device = DeviceModel::with(['repairServices' => function ($q) {
            $q->where('is_active', true);
        }])->find($id);

        if (! $device) {
            return $this->empty('Không tìm thấy dòng thiết bị.');
        }

        return $this->success($device, 'Lấy chi tiết thiết bị thành công.');
    }

    /**
     * Danh sách 9 tiêu chí kiểm tra tiếp nhận tiêu chuẩn tại quầy.
     */
    public function checklistTemplate(): JsonResponse
    {
        $template = [
            ['item_name' => 'Kết nối Bluetooth', 'description' => 'Kiểm tra tốc độ pop-up và duy trì kết nối ổn định'],
            ['item_name' => 'Âm thanh tai trái', 'description' => 'Âm lượng, dải âm trầm/bổng, không rè'],
            ['item_name' => 'Âm thanh tai phải', 'description' => 'Âm lượng, dải âm trầm/bổng, không rè'],
            ['item_name' => 'Microphone', 'description' => 'Thu âm rõ ràng khi gọi thoại hoặc ghi âm'],
            ['item_name' => 'Pin & thời lượng sử dụng', 'description' => 'Đo dung lượng thực tế và hao pin nhanh'],
            ['item_name' => 'Hộp sạc / nhận sạc', 'description' => 'Chân sạc cắm dây hoặc đế sạc không dây MagSafe'],
            ['item_name' => 'Chống ồn ANC', 'description' => 'Khử tiếng ồn chủ động không bị hú/rít gió (Pro/Max)'],
            ['item_name' => 'Xuyên âm (Transparency)', 'description' => 'Thu âm thanh môi trường tự nhiên (Pro/Max)'],
            ['item_name' => 'Nút cảm ứng lực', 'description' => 'Cảm ứng bóp thân tai nghe hoặc xoay Digital Crown'],
        ];

        return $this->success($template, 'Lấy checklist mẫu kiểm tra tiếp nhận thành công.');
    }
}
