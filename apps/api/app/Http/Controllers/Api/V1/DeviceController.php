<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ChecklistTemplate;
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
     * Danh sách tiêu chí kiểm tra tiếp nhận tiêu chuẩn tại quầy theo dòng thiết bị / danh mục.
     */
    public function checklistTemplate(Request $request): JsonResponse
    {
        $query = ChecklistTemplate::active();

        if ($modelId = $request->input('device_model_id')) {
            $hasModelSpecific = ChecklistTemplate::active()->where('device_model_id', $modelId)->exists();
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

        $template = $query->orderBy('order_index', 'asc')->get();

        return $this->success($template, 'Lấy checklist mẫu kiểm tra tiếp nhận thành công.');
    }
}
