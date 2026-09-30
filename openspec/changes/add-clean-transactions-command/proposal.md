# Proposal: Add Clean Transactions Artisan Command

## Why

Trong quá trình phát triển, kiểm thử phần mềm (QA testing, User Acceptance Testing, E2E testing), hệ thống PodsCare Repair OS phát sinh một lượng lớn dữ liệu thử nghiệm phân tán trên nhiều bảng: đơn hàng sửa chữa, phiếu tiếp nhận, ảnh intake, báo giá, biên bản QC, giao dịch thanh toán, hợp đồng bảo hành, vận đơn giao nhận, phiếu kho, thông báo và nhật ký kiểm toán.

Trước đây, khi muốn làm sạch dữ liệu để chuẩn bị cho một đợt test mới, người vận hành thường phải chạy lại `php artisan migrate:fresh --seed`. Tuy nhiên, cách này làm mất toàn bộ cấu hình chi nhánh, danh sách nhân sự, danh mục thiết bị, linh kiện và bảng giá dịch vụ đã được thiết lập kỹ lưỡng, đòi hỏi thời gian cấu hình lại từ đầu.

Do đó, việc bổ sung một lệnh Artisan chuyên trách `php artisan db:clean-transactions` là yêu cầu cấp thiết để:
1. Xóa sạch toàn bộ dữ liệu đơn hàng và giao dịch nghiệp vụ phát sinh, đưa hệ thống về trạng thái sạch sẽ cho phiên test mới.
2. Bảo lưu nguyên vẹn 100% dữ liệu danh mục nền tảng (Master Data: chi nhánh, tài khoản nhân sự, linh kiện, dịch vụ, mẫu checklist...).
3. Tự động xử lý an toàn ràng buộc toàn vẹn khóa ngoại (Foreign Key Constraints) trên mọi môi trường CSDL (MySQL, SQLite).
4. Cung cấp báo cáo CLI trực quan về trạng thái dọn dẹp của từng bảng sau khi hoàn tất.

## What Changes

- **Tạo Artisan Command mới**: Triển khai `CleanTransactionalDataCommand` tại `apps/api/app/Console/Commands/CleanTransactionalDataCommand.php`.
  - Signature: `db:clean-transactions {--force : Bỏ qua bước xác nhận interactive}`
  - Description: `Xóa sạch toàn bộ dữ liệu đơn hàng và giao dịch phát sinh để chuẩn bị môi trường test sạch, bảo lưu 100% Chi nhánh, Nhân sự và Danh mục sản phẩm/dịch vụ.`
  - Danh sách 16 bảng cần truncate:
    - Nhóm tiếp nhận & đơn hàng: `repair_orders`, `customers`, `intake_checklists`, `intake_photos`
    - Nhóm báo giá & kiểm định QC: `repair_quotes`, `quote_items`, `qc_inspections`, `qc_checklist_results`
    - Nhóm tài chính, bảo hành & giao nhận: `payments`, `warranties`, `warranty_claims`, `shipments`, `shipment_proofs`
    - Nhóm kho & nhật ký hệ thống: `inventory_transactions`, `notifications`, `audit_logs`
  - Danh sách 9 bảng được bảo lưu tuyệt đối:
    - `branches`, `users`, `device_models`, `repair_services`, `parts`, `branch_parts`, `partners`, `checklist_templates`, `common_issues`
  - Cơ chế an toàn khóa ngoại: Tự động phát hiện driver CSDL để ngắt kiểm tra khóa ngoại trước khi truncate và kích hoạt lại ngay sau khi hoàn tất trong khối `try ... finally` (`SET FOREIGN_KEY_CHECKS = 0/1` cho MySQL và `PRAGMA foreign_keys = OFF/ON` cho SQLite).
  - Giao diện CLI trực quan: Hiển thị bảng tổng kết (CLI Table) chi tiết từng bảng, trạng thái dọn dẹp và số lượng bản ghi còn lại (đảm bảo về 0).
- **Tạo Feature Test kiểm thử tự động**:
  - `apps/api/tests/Feature/CleanTransactionalDataCommandTest.php` kiểm tra toàn diện:
    - Khi chạy `--force`, cả 16 bảng vận hành đều được dọn sạch về 0 bản ghi.
    - 9 bảng dữ liệu nền tảng vẫn giữ nguyên vẹn 100% dữ liệu trước và sau lệnh.
    - Chế độ interactive yêu cầu xác nhận khi không có cờ `--force`.

## Capabilities

### New Capabilities
- `maintenance`: Bổ sung bộ công cụ bảo trì hệ thống và dọn dẹp dữ liệu giao dịch phát sinh thông qua Artisan command `db:clean-transactions`, hỗ trợ reset nhanh môi trường kiểm thử mà không làm mất dữ liệu danh mục nền tảng.

### Modified Capabilities

## Impact

- **Backend (Laravel API)**:
  - Thêm mới `apps/api/app/Console/Commands/CleanTransactionalDataCommand.php`.
- **Automated Tests**:
  - Thêm mới `apps/api/tests/Feature/CleanTransactionalDataCommandTest.php`.
- **Database**:
  - Không thay đổi schema, không tạo migration mới.
  - Cho phép dọn dẹp dữ liệu đơn hàng và giao dịch an toàn mà không ảnh hưởng tới dữ liệu master.
