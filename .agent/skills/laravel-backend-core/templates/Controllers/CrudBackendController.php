<?php

namespace App\Http\Controllers\Backend;

use App\Http\Controllers\Controller;
use App\Http\Requests\ServiceRequest;
use App\Models\Service;
use App\Traits\HasCrudActions;
use Illuminate\Http\Request;

/**
 * Controller Admin mẫu (Thin Controller) quản lý CRUD thực thể.
 * Tận dụng toàn bộ sức mạnh của Trait HasCrudActions.
 */
class CrudBackendController extends Controller
{
    use HasCrudActions;

    /**
     * Khai báo class Model Eloquent mà controller này điều khiển.
     */
    public string $model = Service::class;

    /**
     * FormRequest dùng để xác thực dữ liệu khi gọi store/update.
     */
    public ?string $requestClass = ServiceRequest::class;

    /**
     * Khai báo các quan hệ (relationships) cần eager-load theo từng action.
     */
    public array $with = [
        'index' => ['category', 'creator'],
        'form'  => ['category', 'translations'],
    ];

    /**
     * Hook can thiệp query trước khi lấy danh sách tại index().
     */
    protected function beforeIndex($query, Request $request)
    {
        // Lọc theo trạng thái nếu có query param ?status=ACTIVE
        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        // Lọc theo khoảng ngày tạo
        if ($fromDate = $request->query('from_date')) {
            $query->whereDate('created_at', '>=', $fromDate);
        }

        return $query->latest('id');
    }

    /**
     * Hook can thiệp dữ liệu trước khi lưu vào CSDL (hàm store).
     */
    protected function beforeStore(Request $request, array $data, mixed $id = null): array
    {
        // Tự động gán người tạo / người cập nhật từ Auth Admin
        if (auth()->guard('admin')->check()) {
            $adminId = auth()->guard('admin')->id();
            if (!$id) {
                $data['created_by'] = $adminId;
            }
            $data['updated_by'] = $adminId;
        }

        // Tự động sinh slug nếu chưa có
        if (empty($data['slug']) && !empty($data['name'])) {
            $data['slug'] = \Illuminate\Support\Str::slug($data['name']);
        }

        return $data;
    }

    /**
     * Hook thực hiện các tác vụ sau khi đã lưu thành công bản ghi vào CSDL.
     */
    protected function afterStore(Request $request, $resource, mixed $id = null)
    {
        // Đồng bộ danh mục phụ hoặc quan hệ many-to-many nếu có
        if ($request->has('tag_ids')) {
            $resource->tags()->sync((array) $request->input('tag_ids'));
        }

        return $resource;
    }
}
