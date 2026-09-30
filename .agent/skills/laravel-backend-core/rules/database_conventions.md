# Quy chuẩn Cơ sở Dữ liệu & Migration (Database Conventions)

Tài liệu quy định kiến trúc lược đồ (Schema), quy chuẩn đặt tên cột, kiểu dữ liệu, lập chỉ mục (Indexing), cấu trúc bảng đa ngôn ngữ (Translatable) và việc tận dụng Blueprint macros.

---

## 🏗️ 1. Tận dụng Blueprint Macros Cốt lõi

Để giảm trùng lặp mã nguồn và chuẩn hóa audit log, tất cả migrations nên sử dụng các Macro đăng ký trong `MacroServiceProvider`:

```php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('name')->index();
            $table->string('sku')->unique();
            $table->decimal('price', 15, 2)->default(0);

            // Tự động thêm: status VARCHAR(255) DEFAULT 'ACTIVE'
            $table->addStatus();

            // Tự động thêm: seo_meta_title, seo_slug, seo_meta_description, seo_image,...
            $table->addSeo();

            // Tự động thêm: created_by, updated_by, deleted_by, timestamps(), softDeletes()
            $table->addTimestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
```

### Các Macros được cung cấp:
1. `$table->addTimestamps()`:
   - `created_by` (unsignedBigInteger, nullable, index)
   - `updated_by` (unsignedBigInteger, nullable, index)
   - `deleted_by` (unsignedBigInteger, nullable, index)
   - `created_at` & `updated_at` (timestamps)
   - `deleted_at` (softDeletes)
2. `$table->addStatus($default = 'ACTIVE')`:
   - `status` (string, default $default, index)
3. `$table->addSeo()`:
   - Các cột chuẩn SEO phục vụ frontend / SSR: `seo_meta_title`, `seo_slug`, `seo_meta_description`, `seo_meta_keywords`, `seo_meta_robots`, `seo_canonical`, `seo_image`, `seo_schemas`.
4. `$table->addInjectCode()`:
   - `inject_head`, `inject_body_start`, `inject_body_end` dành cho cấu hình mã theo dõi tùy biến (Google Tag Manager, Facebook Pixel).

---

## 📊 2. Quy ước Kiểu Dữ liệu (Data Types)

| Dữ liệu | Kiểu trong Migration | Lý do & Quy chuẩn |
| :--- | :--- | :--- |
| **Primary Key** | `$table->id()` | Bigint unsigned tự tăng |
| **Foreign Key** | `$table->foreignId('user_id')->constrained()->cascadeOnDelete()` | Ràng buộc khóa ngoại tường minh |
| **Tiền tệ / Giá** | `$table->decimal('amount', 15, 2)` | Tuyệt đối KHÔNG dùng Float/Double tránh sai số làm tròn |
| **Trạng thái (Enum)** | `$table->string('status', 50)->default('PENDING')->index()` | Dùng String thay vì DB ENUM để dễ bảo trì và mở rộng code |
| **JSON Payload** | `$table->json('payload')->nullable()` | Chứa metadata, raw webhook data, hoặc form fields động |
| **Cờ logic (Flag)** | `$table->boolean('is_featured')->default(false)` | Kiểu Tinyint(1) |
| **Thời gian** | `$table->timestamp('paid_at')->nullable()` | Lưu dấu thời gian cụ thể |

---

## ⚡ 3. Chiến lược Đánh Chỉ mục (Indexing Strategies)

1. **Khóa Ngoại (Foreign Keys)**: Tất cả foreign keys (`user_id`, `category_id`) bắt buộc phải có index (hàm `foreignId()` mặc định đã có hoặc dùng `->index()`).
2. **Composite Index cho Tìm kiếm & Lọc (Filter Optimization)**:
   - Khi bảng có khối lượng bản ghi lớn và thường xuyên truy vấn theo bộ điều kiện kết hợp:
   ```php
   // Tìm kiếm đơn theo status và sắp xếp theo ngày tạo mới nhất
   $table->index(['status', 'created_at']);

   // Truy vấn theo người dùng và trạng thái
   $table->index(['user_id', 'status']);
   ```
3. **Unique Index chống Trùng Lặp**:
   - Trường hợp mã đơn (`order_code`), mã giao dịch đối tác (`transaction_id`), email khách hàng:
   ```php
   $table->unique('order_code');
   $table->unique('transaction_id');
   ```

---

## 🌐 4. Chuẩn Bảng Đa Ngôn Ngữ (Translatable Schema)

Hệ thống hỗ trợ đa ngôn ngữ bằng cách tách bảng nội dung riêng biệt theo quy chuẩn `[table_singular]_translations`:

### Bảng chính: `posts`
```php
Schema::create('posts', function (Blueprint $table) {
    $table->id();
    $table->foreignId('category_id')->nullable()->constrained('post_categories');
    $table->addStatus();
    $table->addTimestamps();
});
```

### Bảng dịch thuật: `post_translations`
```php
Schema::create('post_translations', function (Blueprint $table) {
    $table->id();
    $table->foreignId('post_id')->constrained('posts')->cascadeOnDelete();
    $table->string('locale', 10)->index(); // 'vi', 'en', 'ja'
    $table->string('title');
    $table->string('slug')->index();
    $table->text('description')->nullable();
    $table->longText('content')->nullable();
    $table->addSeo();
    $table->timestamps();

    // Ràng buộc duy nhất: Mỗi bài viết chỉ có 1 bản dịch cho 1 locale
    $table->unique(['post_id', 'locale']);
});
```
