# Quy trình Tạo Nhanh CRUD Module Chuẩn (4 Bước)

Hướng dẫn từng bước để tạo một Module Quản trị CRUD hoàn chỉnh, hiệu năng cao và kế thừa đầy đủ tính năng phân trang, tìm kiếm, lưu trữ và khôi phục (Soft Deletes).

---

## 🚀 Bước 1: Tạo Database Migration với Blueprint Macros

Chạy lệnh artisan tạo migration:
```bash
php artisan make:migration create_services_table
```

Viết schema sử dụng macros chuẩn:
```php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('services', function (Blueprint $table) {
            $table->id();
            $table->string('name')->index();
            $table->string('slug')->unique();
            $table->decimal('price', 15, 2)->default(0);
            $table->text('description')->nullable();

            $table->addStatus();     // Tạo status với default ACTIVE
            $table->addSeo();        // Tạo các trường SEO
            $table->addTimestamps(); // Tạo created_by, updated_by, deleted_by, timestamps & softDeletes
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('services');
    }
};
```

Chạy migration:
```bash
php artisan migrate
```

---

## 🏛️ Bước 2: Khởi tạo Model Chuẩn

Tạo model:
```bash
php artisan make:model Service
```

Định nghĩa Model với SoftDeletes, `$fillable` và `$casts`:
```php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Service extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'name',
        'slug',
        'price',
        'description',
        'status',
        'seo_meta_title',
        'seo_slug',
        'seo_meta_description',
        'created_by',
        'updated_by',
        'deleted_by',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Scope tìm kiếm nhanh dùng cho Trait HasCrudActions
     */
    public function scopeSearchLike($query, string $keyword)
    {
        return $query->where(function ($q) use ($keyword) {
            $q->where('name', 'LIKE', "%{$keyword}%")
              ->orWhere('slug', 'LIKE', "%{$keyword}%");
        });
    }
}
```

---

## 🛡️ Bước 3: Tạo FormRequest Xác thực

Tạo FormRequest để cô lập quy tắc validate:
```bash
php artisan make:request ServiceRequest
```

Khai báo rules:
```php
namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ServiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $id = $this->route('id');

        return [
            'name'  => ['required', 'string', 'max:255'],
            'slug'  => ['required', 'string', 'max:255', 'unique:services,slug,' . $id],
            'price' => ['nullable', 'numeric', 'min:0'],
            'status' => ['nullable', 'string', 'in:ACTIVE,INACTIVE'],
            'description' => ['nullable', 'string'],
        ];
    }
}
```

---

## 🎮 Bước 4: Tạo Controller Mỏng & Đăng ký Tuyến đường (Routing)

### 4.1. Tạo Controller Admin kế thừa Trait `HasCrudActions`
```php
namespace App\Http\Controllers\Backend;

use App\Http\Controllers\Controller;
use App\Http\Requests\ServiceRequest;
use App\Models\Service;
use App\Traits\HasCrudActions;

class ServiceController extends Controller
{
    use HasCrudActions;

    /**
     * Khai báo Model mà Controller này quản lý
     */
    public string $model = Service::class;

    /**
     * FormRequest dùng để validate khi lưu (store/update)
     */
    public string $requestClass = ServiceRequest::class;

    /**
     * Hook can thiệp dữ liệu trước khi lưu
     */
    protected function beforeStore($request, array $data): array
    {
        if (auth()->guard('admin')->check()) {
            if (!$request->route('id')) {
                $data['created_by'] = auth()->guard('admin')->id();
            }
            $data['updated_by'] = auth()->guard('admin')->id();
        }

        return $data;
    }
}
```

### 4.2. Đăng ký Tuyến đường với `Route::module`
Trong `routes/backend.php` (hoặc `routes/web.php`):
```php
use App\Http\Controllers\Backend\ServiceController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:admin'])->prefix('admin')->name('admin.')->group(function () {
    // Chỉ 1 dòng lệnh đăng ký trọn gói 5 actions: index, form, store, destroy, restore
    Route::module(ServiceController::class);
});
```

Hệ thống sẽ tự động đăng ký:
- `GET  /admin/services` ➔ `admin.services.index`
- `GET  /admin/services/form/{id?}` ➔ `admin.services.form`
- `POST /admin/services/store/{id?}` ➔ `admin.services.store`
- `POST /admin/services/destroy/{id}` ➔ `admin.services.destroy`
- `POST /admin/services/restore/{id}` ➔ `admin.services.restore`

---

## ✅ Checklist Kiểm tra Hoàn thành (Verification)

- [ ] Lệnh `php artisan route:list --name=services` hiển thị đủ 5 routes.
- [ ] Bảng CSDL có đủ các cột từ `addTimestamps()`, `addStatus()`, `addSeo()`.
- [ ] Màn hình danh sách hỗ trợ phân trang và tìm kiếm theo tên qua `scopeSearchLike`.
- [ ] Xóa bản ghi hoạt động dưới dạng Soft Delete (cột `deleted_at` được gán).
- [ ] Chức năng `restore` khôi phục lại bản ghi đã xóa thành công.
