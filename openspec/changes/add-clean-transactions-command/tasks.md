# Tasks

## 1. Specification & Planning

- [x] 1.1 Khởi tạo và xác thực OpenSpec change `add-clean-transactions-command` với đầy đủ proposal, design, spec và tasks.

## 2. Command Implementation

- [x] 2.1 Tạo lệnh Artisan `CleanTransactionalDataCommand` tại `apps/api/app/Console/Commands/CleanTransactionalDataCommand.php` với signature, mô tả, danh sách 16 bảng truncate và 9 bảng bảo lưu.
- [x] 2.2 Tích hợp cơ chế an toàn bật/tắt foreign key checks cho cả MySQL và SQLite, khối try-finally đảm bảo luôn tái kích hoạt foreign key checks.
- [x] 2.3 Xây dựng bảng hiển thị CLI summary thống kê trạng thái dọn dẹp và số lượng bản ghi sau khi dọn.

## 3. Automated Feature Testing & Verification

- [x] 3.1 Viết Feature Test `CleanTransactionalDataCommandTest` tại `apps/api/tests/Feature/CleanTransactionalDataCommandTest.php` kiểm tra cả 16 bảng vận hành về 0 và 9 bảng nền tảng được bảo lưu nguyên vẹn.
- [x] 3.2 Chạy `php artisan test --filter=CleanTransactionalDataCommandTest` và xác nhận 100% test pass.

## 4. Finalization & Git Synchronization

- [x] 4.1 Cập nhật tasks.md thành [x].
- [x] 4.2 Commit và push lên GitHub origin main.
