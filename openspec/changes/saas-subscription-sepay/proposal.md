# Proposal: SaaS Subscription & SePay VietQR Billing

## Why

FIXO Repair OS đang chuyển đổi sang mô hình kinh doanh B2B SaaS trả phí định kỳ, tuy nhiên hệ thống hiện tại chưa có cơ chế thanh toán gói cước tự động, dẫn đến việc kích hoạt và gia hạn dịch vụ phải xử lý thủ công bằng tay. Hơn nữa, việc đăng ký tài khoản chưa tự động cấp quyền dùng thử 14 ngày (Trial), và hệ thống thiếu bộ chốt chặn hạn mức tài nguyên (Quota Guard), cho phép các cửa hàng ở gói dùng thử hoặc gói thấp có thể tạo chi nhánh, nhân sự và đơn hàng vượt quá quyền lợi được quy định. Việc tích hợp cổng thanh toán SePay VietQR tập trung dành riêng cho chủ tiệm cùng bộ chốt chặn hạn mức là yêu cầu cấp thiết để tự động hóa 100% vòng đời thuê bao SaaS và chống thất thoát doanh thu.

## What Changes

- **Tự động hóa 14 ngày dùng thử (Auto-Trial on Register)**: Khi chủ tiệm đăng ký tài khoản mới (`/api/v1/auth/register`), hệ thống tự động gán gói `trial` với hạn sử dụng 14 ngày (`trial_ends_at = expires_at = now()->addDays(14)`).
- **Bộ chốt chặn hạn mức Quota Guard**: Kiểm tra chặt chẽ các giới hạn gói cước trước khi cho phép thực hiện tác vụ:
  * Hạn mức chi nhánh (`max_branches`): Gói Trial (1 chi nhánh), Standard (2 chi nhánh), Pro (không giới hạn / -1).
  * Hạn mức nhân sự (`max_users`): Giới hạn số lượng tài khoản nhân viên được tạo trong cửa hàng.
  * Hạn mức đơn sửa chữa theo tháng (`max_orders_per_month`): Đếm số đơn trong tháng hiện tại; chặn tạo đơn mới khi vượt hạn mức.
  * Chốt chặn hết hạn bản quyền (`subscription expired check`): Khóa quyền tạo/sửa dữ liệu khi quá hạn gói thuê bao (`expires_at < now()`).
- **Thanh toán gói cước SaaS tập trung qua SePay (B2B SaaS Only)**:
  * Khởi tạo hóa đơn SaaS (`saas_invoices`) và sinh mã VietQR chuyển khoản động với cú pháp `FIXSUB{invoice_id}`.
  * Nhận Webhook SePay theo thời gian thực tại endpoint `/api/v1/saas/sepay/webhook` để đối soát số tiền và mã giao dịch.
  * Tự động nâng cấp gói cước và gia hạn ngày sử dụng (+30 ngày hoặc +365 ngày) cho cửa hàng (Tenant) ngay khi tiền vào tài khoản chủ quản FIXO.
  * Đảm bảo Idempotency (chống ghi nhận trùng lặp webhook) và Database Pessimistic Locking (`lockForUpdate`).
- **Polling & Trạng thái thanh toán thời gian thực**: Cung cấp API kiểm tra trạng thái hóa đơn theo thời gian thực (`/api/v1/saas/invoices/{id}/status`) hỗ trợ Frontend cập nhật giao diện ngay lập tức khi thanh toán thành công mà không cần tải lại trang.
- **Giao diện quản lý gói cước Tenant UI (`/subscription`)**:
  * Trang quản trị gói thuê bao hiển thị trực quan thông tin gói hiện tại, thời hạn còn lại, thanh tiến trình đo lường Quota Usage (chi nhánh, nhân viên, đơn hàng).
  * Bảng so sánh các gói dịch vụ (Trial, Standard 299k/tháng, Pro 599k/tháng) và nút kích hoạt/nâng cấp gói.
  * Hộp thoại (Modal) hiển thị mã QR VietQR động SePay với hướng dẫn thanh toán chi tiết và đồng hồ đếm ngược.
  * Huy hiệu (Badge) gói cước hiển thị trên thanh Header / Topbar và liên kết điều hướng trên Sidebar.
- **Ranh giới phạm vi (Scope Boundary)**:
  * Cổng thanh toán SePay trong đề xuất này chỉ phục vụ cho việc chủ tiệm thanh toán gói SaaS vào tài khoản ngân hàng trung tâm của FIXO Platform.
  * Tuyệt đối KHÔNG áp dụng cho khách sửa máy lẻ thanh toán dịch vụ sửa chữa tại từng chi nhánh.

## Capabilities

### New Capabilities
- `saas-subscription-sepay`: Quản lý vòng đời thuê bao SaaS B2B, chốt chặn hạn mức tài nguyên (chi nhánh, nhân sự, đơn hàng), tích hợp thanh toán VietQR tự động qua SePay Platform Webhook, và giao diện quản lý thuê bao cho chủ tiệm FIXO.

### Modified Capabilities
<!-- Không có capability hiện có nào bị sửa đổi yêu cầu nghiệp vụ -->

## Impact

- **Database**:
  * Bảng mới `subscription_plans`: Lưu danh mục gói dịch vụ, giá bán, hạn mức chi nhánh, nhân sự, đơn hàng.
  * Bảng mới `saas_invoices`: Quản lý các đơn hàng / hóa đơn thanh toán gia hạn gói SaaS của Tenant.
  * Bảng mới `sepay_transactions`: Lưu lịch sử giao dịch từ webhook SePay để đối soát và đảm bảo tính Idempotency.
  * Cập nhật bảng `tenants`: Bổ sung `trial_ends_at`, `billing_cycle`, `current_plan_id`.
- **Backend APIs**:
  * `POST /api/v1/saas/subscribe`: Tạo hóa đơn nâng cấp/gia hạn gói SaaS và sinh thông tin VietQR SePay.
  * `GET /api/v1/saas/invoices/{id}/status`: Polling trạng thái thanh toán của hóa đơn.
  * `GET /api/v1/saas/current-plan`: Lấy thông tin gói cước và hạn mức sử dụng hiện tại của tenant.
  * `POST /api/v1/saas/sepay/webhook`: Endpoint đón webhook từ SePay (xác thực `SePay-Api-Key`, xử lý giao dịch an toàn).
  * Chốt chặn tại `BranchController`, `UserController`, `OrderController` thông qua `QuotaService` hoặc middleware chuyên biệt.
- **Frontend Applications**:
  * Trang mới: `apps/web/app/subscription/page.tsx`.
  * Cập nhật `apps/web/app/register/page.tsx`: Ghi nhận tham số `plan` khi đăng ký từ trang bảng giá.
  * Cập nhật Header Topbar: Thêm Plan Badge và hiển thị ngày hết hạn / trạng thái Trial.
  * Cập nhật Sidebar Navigation: Bổ sung liên kết "Gói dịch vụ & Hạn mức".
- **Environment & Security**:
  * Cấu hình biến môi trường: `SEPAY_API_KEY`, `SEPAY_ACCOUNT_NUMBER`, `SEPAY_BANK_NAME`, `SEPAY_ACCOUNT_NAME`.
