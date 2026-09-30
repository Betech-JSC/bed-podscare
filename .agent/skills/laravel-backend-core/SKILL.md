---
name: laravel-backend-core
description: "Bộ kỹ năng Backend chuyên nghiệp (Laravel REST API Core & Architecture Kit) bao gồm chuẩn phân tầng Controller mỏng - Service dày, chuẩn REST API JSON formatting, CRUD Macros (Route & Blueprint), State Machine Workflow với Optimistic Locking, an toàn giao dịch Idempotency và Feature Test-Driven Development."
---

# Laravel Backend Core & Architecture Kit

Bộ kỹ năng cốt lõi dành cho việc phát triển, duy trì và tối ưu hệ thống Backend Laravel chuyên nghiệp. Cung cấp nền tảng kiến trúc phân tầng chuẩn mực, các macro tự động hóa CRUD, State Machine Service, an toàn giao dịch và bộ quy tắc kiểm thử độc lập.

---

## 🎯 1. Triết lý Kiến trúc (Architectural Philosophy)

Hệ thống tuân thủ 5 nguyên lý cốt lõi:
1. **Controller mỏng - Service dày (Thin Controllers, Fat Services)**:
   - Controller chỉ làm nhiệm vụ nhận Request, ủy thác cho FormRequest xác thực, gọi Service xử lý nghiệp vụ và trả về Response.
   - Tuyệt đối không viết business logic phức tạp, query Eloquent lồng ghép, hoặc xử lý transaction trực tiếp trong Controller.
2. **Đơn nhiệm (Single Responsibility Principle - SRP)**:
   - Mỗi Service chỉ đảm nhiệm một domain hoặc một quy trình nghiệp vụ rõ ràng (VD: `OrderWorkflowService`, `SepayService`).
3. **Chuẩn hóa Giao diện REST API (Consistent REST Responses)**:
   - Mọi response API đều dùng Trait `ApiResponse` để đảm bảo định dạng JSON nhất quán (`success`, `data`, `message`, `errors`).
4. **An toàn Giao dịch & Chống Race Condition (Concurrency & Idempotency)**:
   - Nghiệp vụ thay đổi dữ liệu trọng yếu (đơn hàng, thanh toán, ví tiền) bắt buộc phải bọc trong `DB::transaction()`.
   - Kết hợp Optimistic Locking (`expected_updated_at`) khi sửa đổi đồng thời và Idempotency Key cho Webhook/Payment.
5. **Kiểm thử Hướng Tính năng (Feature Test-Driven)**:
   - Mọi nghiệp vụ phải có Feature Test độc lập, kiểm tra luồng thành công lẫn các trường hợp lỗi (403, 404, 409, 422).

---

## 📂 2. Cấu trúc Bộ Kỹ năng (Skill Layout)

```
laravel-backend-core/
├── SKILL.md                          # Tài liệu nhạc trưởng & tổng quan kiến trúc
├── rules/
│   ├── coding_standards.md           # Chuẩn PSR-12, PHP 8.1+, đặt tên Model/Table/Service
│   ├── database_conventions.md       # Chuẩn Migrations, Blueprint macros, Indexing, Translatable
│   └── security_and_concurrency.md   # Race conditions, Locking, Transactions, Idempotency, Audit log
├── workflows/
│   ├── new_crud_module.md            # Quy trình 4 bước tạo nhanh 1 CRUD module chuẩn
│   ├── workflow_service.md           # Quy trình xây dựng State Machine Service quản lý trạng thái
│   ├── payment_and_webhook.md        # Quy trình tích hợp Webhook an toàn & chống trùng lặp
│   └── feature_test_driven.md        # Quy trình viết Feature Test độc lập với Fakes
├── templates/
│   ├── Traits/
│   │   ├── ApiResponse.php           # Trait chuẩn hóa output JSON API
│   │   └── HasCrudActions.php        # Trait tự động hóa các actions CRUD cho Backend Controller
│   ├── Providers/
│   │   └── MacroServiceProvider.php  # Provider đăng ký Router::macro('module') & Blueprint macros
│   ├── Controllers/
│   │   ├── CrudBackendController.php # Code mẫu Controller Admin mỏng
│   │   └── RestApiController.php     # Code mẫu REST API Controller
│   ├── Services/
│   │   └── BaseWorkflowService.php   # Code mẫu State Machine Service với Optimistic Lock & Audit Log
│   └── Tests/
│       └── BaseFeatureTest.php       # Code mẫu Feature Test với fakes và assertions
└── references/
    ├── http_status_and_errors.md     # Bảng mã HTTP status & Application Error Codes
    └── architecture_diagrams.md      # Sơ đồ luồng dữ liệu, lifecycle & routing macros
```

---

## 🚀 3. Hướng dẫn Nhận diện Framework & Áp dụng

### Nhận diện Dự án Laravel:
Khi làm việc trong workspace, kiểm tra các tệp sau để nhận diện phiên bản và cấu trúc:
- `composer.json`: Phiên bản `laravel/framework` (>= 9.x, 10.x, 11.x), phiên bản PHP (>= 8.1).
- `bootstrap/app.php` hoặc `app/Http/Kernel.php`: Cách đăng ký middleware và service providers.
- `routes/api.php` & `routes/web.php` (hoặc `routes/backend.php`): Định tuyến của dự án.

### Các Bước Triển Khai Vào Dự án:

#### Bước 1: Đăng ký MacroServiceProvider
1. Đặt `MacroServiceProvider.php` vào `app/Providers/MacroServiceProvider.php`.
2. Đăng ký provider:
   - **Laravel 9/10**: Khai báo trong mảng `providers` tại `config/app.php`.
   - **Laravel 11**: Đăng ký trong `bootstrap/providers.php`.
3. Lúc này bạn đã có:
   - `Route::module(OrderController::class)` tự động sinh 5 routes: `index`, `form`, `store`, `destroy`, `restore`.
   - `Blueprint::macro('addTimestamps')`: Tạo `created_by`, `updated_by`, `deleted_by`, `timestamps()`, `softDeletes()`.
   - `Blueprint::macro('addStatus')`: Tạo cột `status` với giá trị mặc định.
   - `Blueprint::macro('addSeo')`: Tạo các cột SEO tiêu chuẩn.

#### Bước 2: Chuẩn hóa REST API Controller
1. Sử dụng Trait `App\Traits\ApiResponse` trong Base Controller hoặc trực tiếp trong Controller API.
2. Trả kết quả:
   - Thành công: `return $this->success($data, 'Tạo đơn hàng thành công', 201);`
   - Lỗi validation/nghiệp vụ: `return $this->failure('Mã giảm giá không hợp lệ', 422, $errors);`
   - Không tìm thấy: `return $this->empty('Không tìm thấy tài nguyên');`
   - Xóa thành công: `return $this->delete();` (HTTP 204 No Content)

#### Bước 3: Áp dụng State Machine cho Quy trình Nghiệp vụ (Workflow Service)
1. Kế thừa `BaseWorkflowService` khi quản lý thực thể có vòng đời trạng thái (Đơn hàng, Lịch hẹn, Đăng ký).
2. Định nghĩa ma trận `ALLOWED_TRANSITIONS`.
3. Gọi `transition($entity, $newStatus, $options)`:
   - Tự động kiểm tra Optimistic Locking (`expected_updated_at`) để chặn tình trạng 2 admin ghi đè dữ liệu nhau.
   - Tự động bọc trong `DB::transaction()`.
   - Tự động ghi nhận `StatusLog` (ai đổi, từ trạng thái nào sang trạng thái nào, lý do, IP, User Agent).

#### Bước 4: Viết Feature Test
1. Sử dụng template `BaseFeatureTest`.
2. Kiểm tra `RefreshDatabase`, fake queue/mail để test chạy nhanh và cô lập.

---

## 🔗 4. Liên kết Tài liệu Chi tiết

| Mục tiêu | Tài liệu tham khảo |
| :--- | :--- |
| **Quy chuẩn Code & Tên gọi** | [`rules/coding_standards.md`](./rules/coding_standards.md) |
| **Quy chuẩn CSDL & Blueprint Macros** | [`rules/database_conventions.md`](./rules/database_conventions.md) |
| **An toàn Giao dịch & Idempotency** | [`rules/security_and_concurrency.md`](./rules/security_and_concurrency.md) |
| **Tạo CRUD Module 4 Bước** | [`workflows/new_crud_module.md`](./workflows/new_crud_module.md) |
| **Xây dựng State Machine Service** | [`workflows/workflow_service.md`](./workflows/workflow_service.md) |
| **Tích hợp Webhook & Payment an toàn** | [`workflows/payment_and_webhook.md`](./workflows/payment_and_webhook.md) |
| **Quy trình Viết Feature Test** | [`workflows/feature_test_driven.md`](./workflows/feature_test_driven.md) |
| **Bảng mã HTTP Status & Codes** | [`references/http_status_and_errors.md`](./references/http_status_and_errors.md) |
| **Sơ đồ Kiến trúc ASCII** | [`references/architecture_diagrams.md`](./references/architecture_diagrams.md) |
