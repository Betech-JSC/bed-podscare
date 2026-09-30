# Spec Delta

## Purpose

Đặc tả kỹ thuật và tiêu chuẩn hành vi cho lệnh bảo trì Artisan `db:clean-transactions`, cho phép xóa sạch toàn bộ dữ liệu đơn hàng và giao dịch phát sinh trong quá trình vận hành/test mà vẫn bảo toàn 100% dữ liệu danh mục nền tảng (Master Data).

## ADDED Requirements

### Requirement: Transactional Data Cleaning Command Execution
Hệ thống SHALL cung cấp lệnh Artisan `db:clean-transactions` với cờ `--force` cho phép truncate toàn bộ 16 bảng dữ liệu vận hành và giao dịch phát sinh, bảo lưu tuyệt đối 9 bảng dữ liệu nền tảng, và hiển thị bảng tổng kết số lượng bản ghi sau khi dọn dẹp.

#### Scenario: Dọn dẹp dữ liệu giao dịch thành công với cờ --force
- **WHEN** Người vận hành thực thi lệnh `php artisan db:clean-transactions --force`
- **THEN** Hệ thống vô hiệu hóa kiểm tra khóa ngoại, truncate toàn bộ 16 bảng vận hành (`repair_orders`, `customers`, `intake_checklists`, `intake_photos`, `repair_quotes`, `quote_items`, `qc_inspections`, `qc_checklist_results`, `payments`, `warranties`, `warranty_claims`, `shipments`, `shipment_proofs`, `inventory_transactions`, `notifications`, `audit_logs`), tái kích hoạt kiểm tra khóa ngoại, và hiển thị bảng CLI summary với số lượng bản ghi sau khi dọn của toàn bộ các bảng trên bằng 0.

#### Scenario: Bảo lưu toàn vẹn 100% dữ liệu nền tảng (Master Data)
- **WHEN** Lệnh `db:clean-transactions --force` được thực thi
- **THEN** Dữ liệu trên 9 bảng nền tảng (`branches`, `users`, `device_models`, `repair_services`, `parts`, `branch_parts`, `partners`, `checklist_templates`, `common_issues`) không bị ảnh hưởng, giữ nguyên số lượng bản ghi và cấu trúc trước đó.

#### Scenario: Xác nhận tương tác an toàn khi không dùng cờ --force
- **WHEN** Người vận hành thực thi `php artisan db:clean-transactions` không kèm cờ `--force`
- **THEN** Hệ thống hiển thị cảnh báo và yêu cầu xác nhận. Nếu người dùng chọn "no", lệnh dừng lại ngay lập tức mà không xóa bất kỳ dữ liệu nào.

### Requirement: Cross-Database Foreign Key Safety
Lệnh dọn dẹp dữ liệu SHALL tự động nhận diện hệ quản trị cơ sở dữ liệu hiện tại (MySQL, SQLite) để tạm dừng ràng buộc khóa ngoại trước khi truncate và luôn phục hồi lại trạng thái kiểm tra khóa ngoại trong khối lệnh bảo vệ `finally`.

#### Scenario: Vận hành trên cơ sở dữ liệu MySQL
- **WHEN** Command chạy trên kết nối cơ sở dữ liệu `mysql`
- **THEN** Hệ thống thực thi `SET FOREIGN_KEY_CHECKS=0;` trước khi truncate và kích hoạt lại bằng `SET FOREIGN_KEY_CHECKS=1;` sau khi hoàn tất.

#### Scenario: Vận hành trên cơ sở dữ liệu SQLite
- **WHEN** Command chạy trên kết nối cơ sở dữ liệu `sqlite`
- **THEN** Hệ thống thực thi `PRAGMA foreign_keys = OFF;` trước khi truncate và kích hoạt lại bằng `PRAGMA foreign_keys = ON;` sau khi hoàn tất.
