<?php

namespace App\Traits;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Trait HasCrudActions - Cung cấp toàn bộ các hành vi CRUD chuẩn mực cho Backend Controller:
 * index, form, store, destroy, restore với các hooks can thiệp dữ liệu linh hoạt.
 */
trait HasCrudActions
{
    /**
     * Tên class Model tương ứng (bắt buộc khai báo tại Controller con).
     * Ví dụ: public string $model = \App\Models\Service::class;
     */
    // public string $model;

    /**
     * FormRequest dùng để validate (tùy chọn).
     * Ví dụ: public string $requestClass = \App\Http\Requests\ServiceRequest::class;
     */
    // public ?string $requestClass = null;

    /**
     * Màn hình danh sách bản ghi (Hỗ trợ phân trang, lọc, tìm kiếm).
     */
    public function index(Request $request): mixed
    {
        $this->checkAuthorize();

        $query = $this->model()::query();

        // 1. Hook tiền xử lý query
        $query = $this->beforeIndex($query, $request);

        // 2. Tự động nạp quan hệ nếu được khai báo
        $relations = $this->getWithRelations('index');
        if (!empty($relations)) {
            $query->with($relations);
        }

        // 3. Tìm kiếm theo scopeSearchLike nếu Model có định nghĩa
        $keyword = $request->input('keyword') ?? $request->input('filters.global.value') ?? $request->input('search');
        if (!empty($keyword) && method_exists($this->model, 'scopeSearchLike')) {
            $query->searchLike((string) $keyword);
        }

        // 4. Phân trang
        $perPage = (int) $request->input('per_page', $request->input('limit', 15));
        $items = $query->paginate($perPage);

        // 5. Hook hậu xử lý danh sách
        $items = $this->afterIndex($items, $request);

        if ($request->wantsJson()) {
            return response()->json([
                'success' => true,
                'data'    => $items->items(),
                'meta'    => [
                    'current_page' => $items->currentPage(),
                    'last_page'    => $items->lastPage(),
                    'per_page'     => $items->perPage(),
                    'total'        => $items->total(),
                ],
            ]);
        }

        $viewName = $this->getViewPath('index');
        if (view()->exists($viewName)) {
            return view($viewName, compact('items'));
        }

        return response()->json($items);
    }

    /**
     * Lấy dữ liệu cho màn hình chi tiết hoặc Form chỉnh sửa / thêm mới.
     */
    public function form(Request $request, mixed $id = null): mixed
    {
        $this->checkAuthorize();

        if ($id) {
            $query = $this->model()::query();
            if ($this->hasSoftDeletes()) {
                $query->withTrashed();
            }

            $relations = $this->getWithRelations('form');
            if (!empty($relations)) {
                $query->with($relations);
            }

            $item = $query->findOrFail($id);
        } else {
            $item = $this->model();
        }

        $item = $this->afterForm($item, $request);

        if ($request->wantsJson()) {
            return response()->json([
                'success' => true,
                'data'    => $item,
            ]);
        }

        $viewName = $this->getViewPath('form');
        if (view()->exists($viewName)) {
            return view($viewName, compact('item'));
        }

        return response()->json($item);
    }

    /**
     * Tạo mới hoặc cập nhật bản ghi trong DB Transaction an toàn.
     */
    public function store(Request $request, mixed $id = null): mixed
    {
        $this->checkAuthorize();

        // 1. Xác thực dữ liệu (FormRequest hoặc rules)
        $validatedData = $this->validateStoreRequest($request, $id);

        // 2. Hook tiền xử lý trước khi lưu
        $data = $this->beforeStore($request, $validatedData, $id);

        // 3. Thực thi lưu trữ trong Transaction
        $resource = DB::transaction(function () use ($data, $id) {
            if ($id) {
                $query = $this->model()::query();
                if ($this->hasSoftDeletes()) {
                    $query->withTrashed();
                }
                $record = $query->findOrFail($id);
                $record->update($data);
                return $record;
            }

            return $this->model()::create($data);
        });

        // 4. Hook hậu xử lý
        $resource = $this->afterStore($request, $resource, $id);

        $message = $id
            ? __('Cập nhật bản ghi thành công')
            : __('Tạo mới bản ghi thành công');

        if ($request->wantsJson()) {
            return response()->json([
                'success' => true,
                'message' => $message,
                'data'    => $resource,
            ], $id ? 200 : 201);
        }

        return redirect()->back()->with('success', $message);
    }

    /**
     * Xóa bản ghi (Soft Delete hoặc Force Delete).
     */
    public function destroy(Request $request, mixed $id): mixed
    {
        $this->checkAuthorize();

        try {
            DB::beginTransaction();
            $resource = $this->model()::findOrFail($id);

            // Ghi nhận deleted_by nếu có người đăng nhập
            if (auth()->check() && in_array('deleted_by', $resource->getFillable(), true)) {
                $resource->deleted_by = auth()->id();
                $resource->save();
            }

            $resource->delete();
            DB::commit();

            $message = __('Đã xóa bản ghi thành công');

            if ($request->wantsJson()) {
                return response()->json(['success' => true, 'message' => $message]);
            }

            return redirect()->back()->with('success', $message);
        } catch (\Throwable $e) {
            DB::rollBack();

            if ($request->wantsJson()) {
                return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
            }

            return redirect()->back()->with('error', $e->getMessage());
        }
    }

    /**
     * Khôi phục bản ghi đã bị xóa mềm (Soft Delete).
     */
    public function restore(Request $request, mixed $id): mixed
    {
        $this->checkAuthorize();

        if (!$this->hasSoftDeletes()) {
            abort(404, 'Mô hình không hỗ trợ Soft Deletes');
        }

        $resource = $this->model()::withTrashed()->findOrFail($id);
        $resource->restore();

        $message = __('Khôi phục bản ghi thành công');

        if ($request->wantsJson()) {
            return response()->json(['success' => true, 'message' => $message]);
        }

        return redirect()->back()->with('success', $message);
    }

    // ==========================================
    // Hooks & Phương thức Mở rộng (Overridable)
    // ==========================================

    protected function beforeIndex($query, Request $request)
    {
        return $query->orderBy('id', 'DESC');
    }

    protected function afterIndex($items, Request $request)
    {
        return $items;
    }

    protected function afterForm($item, Request $request)
    {
        return $item;
    }

    protected function beforeStore(Request $request, array $data, mixed $id = null): array
    {
        if (auth()->check()) {
            if (!$id && in_array('created_by', $this->model()->getFillable(), true)) {
                $data['created_by'] = auth()->id();
            }
            if (in_array('updated_by', $this->model()->getFillable(), true)) {
                $data['updated_by'] = auth()->id();
            }
        }
        return $data;
    }

    protected function afterStore(Request $request, $resource, mixed $id = null)
    {
        return $resource;
    }

    protected function checkAuthorize(): void
    {
        // Có thể bổ sung phân quyền: $this->authorize('viewAny', $this->model);
    }

    // ==========================================
    // Phương thức Bổ trợ Nội bộ (Internal Helpers)
    // ==========================================

    protected function model()
    {
        return new $this->model();
    }

    protected function hasSoftDeletes(): bool
    {
        return in_array('Illuminate\Database\Eloquent\SoftDeletes', class_uses_recursive($this->model), true);
    }

    protected function getWithRelations(string $action): array
    {
        if (isset($this->with) && is_array($this->with)) {
            return $this->with[$action] ?? $this->with['default'] ?? [];
        }
        return [];
    }

    protected function getViewPath(string $view): string
    {
        $folder = Str::kebab(class_basename($this->model));
        return "backend.{$folder}.{$view}";
    }

    protected function validateStoreRequest(Request $request, mixed $id = null): array
    {
        if (isset($this->requestClass) && class_exists($this->requestClass)) {
            $formRequest = app($this->requestClass);
            return $request->validate($formRequest->rules(), $formRequest->messages() ?? []);
        }

        if (method_exists($this->model, 'rules')) {
            $rules = $this->model()->rules();
            $actionRules = $id ? ($rules['update'] ?? $rules) : ($rules['store'] ?? $rules);
            return $request->validate($actionRules);
        }

        return $request->except(['_token', '_method']);
    }
}
