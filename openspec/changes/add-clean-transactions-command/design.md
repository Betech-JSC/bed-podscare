# Design: Clean Transactional Data Command Architecture

## Context

Hệ thống PodsCare Repair OS yêu cầu một quy trình làm sạch dữ liệu kiểm thử nhanh chóng và đáng tin cậy. Khi chuẩn bị cho các đợt kiểm thử tích hợp, kiểm thử luồng sửa chữa thực tế hoặc demo cho khách hàng, môi trường test chứa nhiều dữ liệu rác từ các lần chạy trước. Sử dụng `migrate:fresh` gây phiền toái vì làm mất dữ liệu seed nền tảng (chi nhánh, nhân sự, thiết bị, bảng giá linh kiện...) vốn tốn nhiều công sức tinh chỉnh.

Lệnh `CleanTransactionalDataCommand` được thiết kế nhằm giải quyết bài toán trên bằng cách thực hiện truncate theo danh sách các bảng giao dịch phát sinh (transactional tables) nhưng bảo lưu hoàn toàn các bảng danh mục cốt lõi (master/reference tables).

## Goals / Non-Goals

**Goals:**
- Cung cấp lệnh CLI chuẩn Artisan: `php artisan db:clean-transactions {--force}`.
- Xóa sạch dữ liệu (truncate) trên 16 bảng giao dịch: `repair_orders`, `customers`, `intake_checklists`, `intake_photos`, `repair_quotes`, `quote_items`, `qc_inspections`, `qc_checklist_results`, `payments`, `warranties`, `warranty_claims`, `shipments`, `shipment_proofs`, `inventory_transactions`, `notifications`, `audit_logs`.
- Bảo toàn tuyệt đối 100% dữ liệu trên 9 bảng nền tảng: `branches`, `users`, `device_models`, `repair_services`, `parts`, `branch_parts`, `partners`, `checklist_templates`, `common_issues`.
- Xử lý khóa ngoại an toàn tự động dựa trên driver CSDL (MySQL hoặc SQLite), đảm bảo khóa ngoại luôn được bật lại kể cả khi có ngoại lệ xảy ra.
- Hiển thị bảng tổng kết trực quan (CLI Table) với số lượng bản ghi còn lại sau khi dọn dẹp.

**Non-Goals:**
- Không xóa các tệp tin hình ảnh vật lý đã lưu trên đĩa trong thư mục `storage/` trong phạm vi lệnh này (chỉ dọn dẹp bản ghi CSDL).
- Không can thiệp vào cấu trúc bảng (schema/migrations).

## Decisions

### 1. Phân loại bảng dữ liệu (Transactional vs. Master Data)
- **Transactional Tables (16 bảng)**:
  - Tiếp nhận & Đơn hàng: `repair_orders`, `customers`, `intake_checklists`, `intake_photos`
  - Báo giá & QC: `repair_quotes`, `quote_items`, `qc_inspections`, `qc_checklist_results`
  - Thanh toán, Bảo hành & Giao nhận: `payments`, `warranties`, `warranty_claims`, `shipments`, `shipment_proofs`
  - Vận hành kho & Nhật ký: `inventory_transactions`, `notifications`, `audit_logs`
- **Master / Reference Tables (9 bảng được bảo lưu)**:
  - `branches`, `users`, `device_models`, `repair_services`, `parts`, `branch_parts`, `partners`, `checklist_templates`, `common_issues`

### 2. Quản lý kiểm tra khóa ngoại (Foreign Key Constraints Management)
Do các bảng giao dịch có quan hệ khóa ngoại đan xen với nhau và với các bảng master, việc truncate trực tiếp sẽ bị chặn bởi RDBMS nếu không tạm ngắt ràng buộc khóa ngoại.
- Triển khai helper phương thức nhận diện driver:
  - MySQL:
    ```php
    DB::statement('SET FOREIGN_KEY_CHECKS=0;');
    // Truncate logic
    DB::statement('SET FOREIGN_KEY_CHECKS=1;');
    ```
  - SQLite:
    ```php
    DB::statement('PRAGMA foreign_keys = OFF;');
    // Truncate logic
    DB::statement('PRAGMA foreign_keys = ON;');
    ```
- Khối bảo vệ an toàn: Bọc logic ngắt khóa ngoại và phục hồi khóa ngoại trong cấu trúc `try { ... } finally { ... }` để đảm bảo hệ thống không bao giờ bị rơi vào trạng thái vô hiệu hóa khóa ngoại vĩnh viễn nếu phát sinh lỗi giữa chừng.

### 3. Phương thức làm sạch bảng (Truncate vs Delete)
- Sử dụng `DB::table($table)->truncate()`.
- Laravel xử lý lệnh `truncate()` thông minh:
  - Trên MySQL: phát lệnh `TRUNCATE TABLE` giúp reset auto-increment ID về 1.
  - Trên SQLite: thực thi `DELETE FROM` và tự động reset bảng `sqlite_sequence`.

### 4. Giao diện CLI và trải nghiệm người dùng
- Khi chạy không có `--force`:
  - Xuất cảnh báo màu đỏ: `CẢNH BÁO: Thao tác này sẽ xóa sạch toàn bộ dữ liệu đơn hàng và giao dịch phát sinh!`
  - Hỏi xác nhận interactive: `$this->confirm('Bạn có chắc chắn muốn dọn dẹp dữ liệu giao dịch?', false)`.
  - Nếu người dùng chọn `no`, dừng ngay với `$this->warn('Thao tác đã được hủy bỏ.')` và trả về mã thoát `0`.
- Khi có `--force`: Bỏ qua xác nhận interactive và tiến hành dọn dẹp ngay lập tức.
- Sau khi dọn dẹp: Đọc lại `count()` của từng bảng và kết xuất bảng định dạng:
  ```
  +------------------------+------------+--------------------+
  | Tên bảng               | Phân loại  | Bản ghi sau dọn    |
  +------------------------+------------+--------------------+
  | repair_orders          | Truncated  | 0                  |
  | customers              | Truncated  | 0                  |
  ...
  | branches               | Preserved  | 2                  |
  ...
  +------------------------+------------+--------------------+
  ```
