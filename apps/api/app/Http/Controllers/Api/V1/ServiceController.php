<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CommonIssue;
use App\Models\DeviceModel;
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
     * Danh sách các sự cố / lỗi thường gặp theo nhóm thiết bị / danh mục.
     */
    public function commonIssues(Request $request): JsonResponse
    {
        $query = CommonIssue::active();

        if ($modelId = $request->input('device_model_id')) {
            $hasModelSpecific = CommonIssue::active()->where('device_model_id', $modelId)->exists();
            if ($hasModelSpecific) {
                $query->where('device_model_id', $modelId);
            } else {
                $model = DeviceModel::find($modelId);
                $cat = $request->input('category') ?: ($model?->category ?? 'AirPods');
                $query->where('category', $cat);
            }
        } elseif ($category = $request->input('category')) {
            $query->where('category', $category);
        } else {
            $query->where('category', 'AirPods');
        }

        $issues = $query->orderBy('order_index', 'asc')->get();

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
