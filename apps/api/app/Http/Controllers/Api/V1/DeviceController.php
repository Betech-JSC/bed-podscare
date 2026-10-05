<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ChecklistTemplate;
use App\Models\DeviceModel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class DeviceController extends Controller
{
    /**
     * Danh sách thiết bị kèm theo checklist templates của từng máy.
     */
    public function index(Request $request): JsonResponse
    {
        $query = DeviceModel::query()
            ->with(['checklistTemplates' => function ($q) {
                $q->where('is_active', true)->orderBy('order_index', 'asc');
            }])
            ->withCount('repairServices');

        if (! $request->boolean('include_inactive')) {
            $query->where('is_active', true);
        }

        if ($category = $request->input('category')) {
            $query->where('category', $category);
        }

        $devices = $query->orderBy('category', 'asc')
            ->orderBy('name', 'asc')
            ->get();

        return $this->success($devices, 'Lấy danh mục thiết bị thành công.');
    }

    /**
     * Lấy danh sách danh mục thiết bị động (kết hợp CSDL và mặc định).
     */
    public function categories(Request $request): JsonResponse
    {
        $defaultCategories = ['AirPods', 'Apple Watch', 'Apple Pencil', 'MacBook', 'iPad'];

        $deviceCats = DeviceModel::distinct()
            ->whereNotNull('category')
            ->pluck('category')
            ->filter()
            ->toArray();

        $checklistCats = ChecklistTemplate::distinct()
            ->whereNotNull('category')
            ->pluck('category')
            ->filter()
            ->toArray();

        $allCategories = array_values(array_unique(array_merge($defaultCategories, $deviceCats, $checklistCats)));

        return $this->success($allCategories, 'Lấy danh sách danh mục thiết bị thành công.');
    }

    /**
     * Thêm mới danh mục thiết bị.
     */
    public function storeCategory(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:50'],
        ]);

        $name = trim($validated['name']);

        // Lưu bản ghi checklist template mặc định để bảo đảm danh mục được lưu vào DB
        ChecklistTemplate::firstOrCreate(
            [
                'category' => $name,
                'device_model_id' => null,
                'item_name' => 'Kiểm tra ngoại quan',
            ],
            [
                'description' => 'Kiểm tra trầy xước, nứt vỡ ngoại quan',
                'type' => 'visual',
                'order_index' => 1,
                'is_active' => true,
            ]
        );

        return $this->created(['name' => $name], "Tạo danh mục {$name} thành công.");
    }

    /**
     * Tạo mới dòng thiết bị kèm theo checklist templates.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'category' => ['required', 'string', 'max:50'],
            'model_code' => ['nullable', 'string', 'max:100', 'unique:device_models,model_code'],
            'release_year' => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'manufacturer' => ['nullable', 'string', 'max:100'],
            'has_anc' => ['nullable', 'boolean'],
            'image_url' => ['nullable', 'string', 'max:500'],
            'is_active' => ['nullable', 'boolean'],
            'checks' => ['required', 'array', 'min:1'],
            'checks.*' => ['required', 'string', 'max:150'],
        ]);

        $device = DB::transaction(function () use ($validated, $request) {
            $modelCode = $validated['model_code'] ?? null;
            if (empty($modelCode)) {
                $base = strtoupper(Str::slug($validated['name'], '-'));
                $modelCode = ($base ?: 'MOD') . '-' . strtoupper(Str::random(6));
            }

            $device = DeviceModel::create([
                'name' => trim($validated['name']),
                'category' => trim($validated['category']),
                'model_code' => $modelCode,
                'release_year' => $validated['release_year'] ?? (int) date('Y'),
                'manufacturer' => $validated['manufacturer'] ?? 'Apple',
                'has_anc' => $validated['has_anc'] ?? false,
                'image_url' => $validated['image_url'] ?? null,
                'is_active' => $validated['is_active'] ?? true,
            ]);

            foreach ($validated['checks'] as $index => $item) {
                $itemTrimmed = trim($item);
                if ($itemTrimmed !== '') {
                    ChecklistTemplate::create([
                        'device_model_id' => $device->id,
                        'category' => $device->category,
                        'item_name' => $itemTrimmed,
                        'type' => 'functional',
                        'order_index' => $index + 1,
                        'is_active' => true,
                    ]);
                }
            }

            return $device;
        });

        $device->load(['checklistTemplates' => function ($q) {
            $q->where('is_active', true)->orderBy('order_index', 'asc');
        }]);

        return $this->created($device, 'Tạo mới dòng thiết bị thành công.');
    }

    /**
     * Chi tiết thiết bị kèm các dịch vụ áp dụng và checklist templates.
     */
    public function show(int $id): JsonResponse
    {
        $device = DeviceModel::with([
            'checklistTemplates' => function ($q) {
                $q->where('is_active', true)->orderBy('order_index', 'asc');
            },
            'repairServices' => function ($q) {
                $q->where('is_active', true);
            },
        ])->find($id);

        if (! $device) {
            return $this->empty('Không tìm thấy dòng thiết bị.');
        }

        return $this->success($device, 'Lấy chi tiết thiết bị thành công.');
    }

    /**
     * Cập nhật dòng thiết bị và đồng bộ checklist templates.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $device = DeviceModel::find($id);
        if (! $device) {
            return $this->empty('Không tìm thấy dòng thiết bị.');
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:100'],
            'category' => ['sometimes', 'required', 'string', 'max:50'],
            'model_code' => [
                'nullable',
                'string',
                'max:100',
                Rule::unique('device_models', 'model_code')->ignore($device->id),
            ],
            'release_year' => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'manufacturer' => ['nullable', 'string', 'max:100'],
            'has_anc' => ['nullable', 'boolean'],
            'image_url' => ['nullable', 'string', 'max:500'],
            'is_active' => ['nullable', 'boolean'],
            'checks' => ['nullable', 'array', 'min:1'],
            'checks.*' => ['required', 'string', 'max:150'],
        ]);

        DB::transaction(function () use ($device, $validated) {
            $updateData = [];
            if (isset($validated['name'])) {
                $updateData['name'] = trim($validated['name']);
            }
            if (isset($validated['category'])) {
                $updateData['category'] = trim($validated['category']);
            }
            if (array_key_exists('model_code', $validated)) {
                $updateData['model_code'] = ! empty($validated['model_code']) ? trim($validated['model_code']) : $device->model_code;
            }
            if (array_key_exists('release_year', $validated)) {
                $updateData['release_year'] = $validated['release_year'];
            }
            if (array_key_exists('manufacturer', $validated)) {
                $updateData['manufacturer'] = $validated['manufacturer'] ?? 'Apple';
            }
            if (array_key_exists('has_anc', $validated)) {
                $updateData['has_anc'] = $validated['has_anc'];
            }
            if (array_key_exists('image_url', $validated)) {
                $updateData['image_url'] = $validated['image_url'];
            }
            if (array_key_exists('is_active', $validated)) {
                $updateData['is_active'] = $validated['is_active'];
            }

            if (! empty($updateData)) {
                $device->update($updateData);
            }

            if (isset($validated['checks'])) {
                // Xóa checklist templates cũ của dòng máy này
                ChecklistTemplate::where('device_model_id', $device->id)->delete();

                // Tạo lại checklist templates theo danh sách mới
                foreach ($validated['checks'] as $index => $item) {
                    $itemTrimmed = trim($item);
                    if ($itemTrimmed !== '') {
                        ChecklistTemplate::create([
                            'device_model_id' => $device->id,
                            'category' => $device->category,
                            'item_name' => $itemTrimmed,
                            'type' => 'functional',
                            'order_index' => $index + 1,
                            'is_active' => true,
                        ]);
                    }
                }
            }
        });

        $device->refresh()->load(['checklistTemplates' => function ($q) {
            $q->where('is_active', true)->orderBy('order_index', 'asc');
        }]);

        return $this->success($device, 'Cập nhật dòng thiết bị thành công.');
    }

    /**
     * Xóa dòng máy an toàn: nếu có đơn sửa chữa liên kết thì deactivate, ngược lại xóa sạch.
     */
    public function destroy(int $id): JsonResponse
    {
        $device = DeviceModel::find($id);
        if (! $device) {
            return $this->empty('Không tìm thấy dòng thiết bị.');
        }

        $hasOrders = $device->repairOrders()->exists();

        if ($hasOrders) {
            $device->update(['is_active' => false]);

            return $this->success(
                $device,
                'Dòng thiết bị đã có đơn sửa chữa liên kết, đã chuyển sang trạng thái ngưng hoạt động.'
            );
        }

        DB::transaction(function () use ($device) {
            ChecklistTemplate::where('device_model_id', $device->id)->delete();
            $device->delete();
        });

        return $this->success(null, 'Xóa dòng thiết bị thành công.');
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
