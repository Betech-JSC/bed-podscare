<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\RepairService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ServiceController extends Controller
{
    /**
     * Bảng giá & danh mục gói dịch vụ sửa chữa.
     */
    public function index(Request $request): JsonResponse
    {
        $query = RepairService::with('deviceModel')->where('is_active', true);

        if ($cat = $request->input('category')) {
            $query->where('category', $cat);
        }

        if ($deviceId = $request->input('device_model_id')) {
            $query->where(function ($q) use ($deviceId) {
                $q->where('device_model_id', $deviceId)->orWhereNull('device_model_id');
            });
        }

        $services = $query->orderBy('base_price', 'asc')->get();

        return $this->success($services, 'Lấy bảng giá dịch vụ thành công.');
    }

    /**
     * Danh sách các sự cố / lỗi thường gặp theo nhóm.
     */
    public function commonIssues(): JsonResponse
    {
        $issues = [
            [
                'issue_name' => 'Pin chai, tụt pin nhanh dưới 1 tiếng',
                'category'   => 'Pin',
                'solution'   => 'Thay cell pin dung lượng cao chính hãng',
                'estimated_time' => '30–45 phút',
            ],
            [
                'issue_name' => 'Bật chống ồn ANC bị rè, rít gió chói tai',
                'category'   => 'Driver',
                'solution'   => 'Cân chỉnh micro ngoài, fix lỗi rít màng âm',
                'estimated_time' => '60 phút',
            ],
            [
                'issue_name' => 'Loa một bên nhỏ tiếng hoặc rè bass',
                'category'   => 'Loa',
                'solution'   => 'Vệ sinh lưới âm thanh hoặc thay driver titan',
                'estimated_time' => '45 phút',
            ],
            [
                'issue_name' => 'Hộp sạc không nhận sạc hoặc không sạc được cho tai',
                'category'   => 'Hộp sạc',
                'solution'   => 'Thay pin case sạc hoặc hàn cáp flex chân tiếp xúc',
                'estimated_time' => '45–60 phút',
            ],
            [
                'issue_name' => 'Bám bẩn lâu ngày, tắc màng âm thanh',
                'category'   => 'Vệ sinh',
                'solution'   => 'Vệ sinh chuyên sâu bằng dung dịch chuyên dụng và tia UV',
                'estimated_time' => '20 phút',
            ],
        ];

        return $this->success($issues, 'Lấy danh mục lỗi thường gặp thành công.');
    }

    /**
     * Chi tiết dịch vụ sửa chữa.
     */
    public function show(int $id): JsonResponse
    {
        $service = RepairService::with('deviceModel')->find($id);

        if (! $service) {
            return $this->empty('Không tìm thấy dịch vụ.');
        }

        return $this->success($service, 'Lấy chi tiết dịch vụ thành công.');
    }
}
