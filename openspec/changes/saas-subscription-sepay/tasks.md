# Tasks: SaaS Subscription & SePay VietQR Billing

## 1. Database Migrations & Seeds

- [x] 1.1 Tạo migration bảng `subscription_plans` (code, name, price_monthly, price_yearly, max_branches, max_users, max_orders_per_month, features, is_active, sort_order) và verify bằng `php artisan migrate:status`.
- [x] 1.2 Tạo migration bảng `saas_invoices` (tenant_id, plan_id, billing_cycle, amount, reference_code, status, payment_method, paid_at, expires_at) và verify foreign keys.
- [x] 1.3 Tạo migration bảng `sepay_transactions` (sepay_transaction_id unique, saas_invoice_id, reference_code, amount, accumulated, account_number, gateway, transaction_date, raw_payload) và verify unique index.
- [x] 1.4 Tạo migration bổ sung `trial_ends_at`, `billing_cycle`, `current_plan_id` vào bảng `tenants` và verify schema.
- [x] 1.5 Tạo `SubscriptionPlanSeeder` nạp 3 gói cước (`trial`, `standard`, `pro`) với hạn mức chuẩn và verify dữ liệu sau khi seed bằng `php artisan db:seed --class=SubscriptionPlanSeeder`.
- [x] 1.6 Cập nhật Eloquent Models (`SubscriptionPlan`, `SaasInvoice`, `SepayTransaction`, `Tenant`) cùng quan hệ `hasMany`/`belongsTo` và casts kiểu dữ liệu datetime/decimal.

## 2. Quota Service & Chốt chặn Hạn mức Backend

- [x] 2.1 Xây dựng `App\Services\QuotaService` với các phương thức kiểm tra hạn mức `checkBranchQuota`, `checkUserQuota`, `checkOrderQuota`, `checkSubscriptionActive`, và `getQuotaUsage`.
- [x] 2.2 Tạo Custom Exceptions `QuotaExceededException` (mã HTTP 422) và `SubscriptionExpiredException` (mã HTTP 403) xử lý trả về JSON đồng nhất.
- [x] 2.3 Cập nhật `TenantRegistrationController::register`: Tự động gán gói `trial`, kích hoạt `trial_ends_at = expires_at = now()->addDays(14)`, kích hoạt trạng thái `active` và ghi nhận `intended_plan`.
- [x] 2.4 Tích hợp Quota Guard vào `BranchController::store`: Kiểm tra bản quyền còn hạn và kiểm tra hạn mức chi nhánh trước khi cho phép tạo.
- [x] 2.5 Tích hợp Quota Guard vào `UserController::store`: Kiểm tra hạn mức nhân viên tối đa của gói trước khi tạo tài khoản mới.
- [x] 2.6 Tích hợp Quota Guard vào `RepairOrderController::store`: Kiểm tra hạn mức đơn hàng trong tháng trước khi tạo phiếu sửa chữa.

## 3. Cổng Thanh toán SePay VietQR Platform & Webhook

- [x] 3.1 Cấu hình SePay config trong `config/services.php` (`sepay.api_key`, `sepay.account_number`, `sepay.bank_name`, `sepay.account_name`).
- [x] 3.2 Xây dựng `SaasBillingController`:
  - `POST /api/v1/saas/subscribe`: Tạo hóa đơn `saas_invoices`, sinh mã `FIXSUB{id}` và trả về link QuickLink VietQR SePay.
  - `GET /api/v1/saas/invoices/{id}/status`: Trả về trạng thái hóa đơn theo thời gian thực phục vụ Frontend polling.
  - `GET /api/v1/saas/current-plan`: Trả về thông tin gói cước và dữ liệu `getQuotaUsage()`.
  - `GET /api/v1/saas/plans`: Trả về danh sách gói cước kích hoạt.
- [x] 3.3 Xây dựng `SePayPlatformWebhookController`:
  - `POST /api/v1/saas/sepay/webhook`: Xác thực Secret Key từ header `SePay-Api-Key` hoặc Bearer token.
  - Database Transaction với `lockForUpdate` trên `saas_invoices` tìm theo regex `FIXSUB(\d+)`.
  - Kiểm tra Idempotency trên `sepay_transactions` (`sepay_transaction_id`) chống nhân đôi ngày gia hạn.
  - Đối soát số tiền, chuyển trạng thái hóa đơn `paid`, cộng dồn ngày sử dụng (+30 ngày hoặc +365 ngày), nâng cấp `plan` và `current_plan_id` trên Tenant.
- [x] 3.4 Đăng ký routes SaaS và Webhook trong `routes/api.php` với middleware phân quyền phù hợp (Webhook bỏ qua CSRF và Sanctum, bảo vệ bằng API Key).

## 4. Bộ Test Suite Toàn Diện 100% (Backend Feature & Unit Tests)

- [x] 4.1 Viết `tests/Feature/TenantRegistrationTrialTest.php` bao gồm:
  - **Case 1**: Đăng ký cửa hàng mới thành công, kiểm tra DB tenant có `plan = 'trial'`, `status = 'active'`, và `expires_at` đúng 14 ngày sau ngày đăng ký.
  - **Case 2**: Đăng ký đính kèm param `plan=standard`, kiểm tra tenant nhận trial 14 ngày và ghi nhận đúng `intended_plan`.
- [x] 4.2 Viết `tests/Feature/QuotaGuardTest.php` bao gồm:
  - **Case 3 (Trial Branch Limit)**: Gói Trial tạo chi nhánh 1 thành công (201), tạo chi nhánh thứ 2 bị chặn với mã 422 (`QUOTA_EXCEEDED_BRANCHES`).
  - **Case 4 (Trial User Limit)**: Gói Trial tạo tối đa 2 nhân viên (201), tạo nhân viên thứ 3 bị chặn với mã 422 (`QUOTA_EXCEEDED_USERS`).
  - **Case 5 (Trial Order Monthly Limit)**: Gói Trial tạo quá 50 đơn sửa chữa trong tháng bị chặn với mã 422 (`QUOTA_EXCEEDED_ORDERS`).
  - **Case 6 (Standard Limits)**: Gói Standard tạo chi nhánh 2 thành công, tạo chi nhánh 3 bị chặn; tạo vượt 200 đơn trong tháng bị chặn.
  - **Case 7 (Pro Unlimited)**: Gói Pro (`max_branches = -1`, `max_users = -1`, `max_orders = -1`) tạo không giới hạn chi nhánh, nhân sự, đơn hàng thành công.
  - **Case 8 (Subscription Expired)**: Tenant có `expires_at` trong quá khứ bị chặn tạo chi nhánh/nhân viên/đơn với lỗi 403 (`SUBSCRIPTION_EXPIRED`).
- [x] 4.3 Viết `tests/Feature/SePaySaaSWebhookTest.php` bao gồm:
  - **Case 9 (Unauthorized Webhook)**: Gửi request webhook với sai hoặc thiếu API Key bị từ chối với mã HTTP 401 Unauthorized.
  - **Case 10 (Valid Webhook & Auto-Renewal)**: Gửi webhook chứa cú pháp `FIXSUB{id}` và số tiền chuẩn xác; kiểm tra hóa đơn đổi thành `paid`, tenant được nâng cấp gói và gia hạn thêm đúng 30 ngày (hoặc 365 ngày).
  - **Case 11 (Idempotency Protection)**: Gửi lại webhook cùng `transaction_id` lần thứ 2; kiểm tra hệ thống trả về 200 OK (`already_processed`), không cộng dồn thêm ngày gia hạn lần 2.
  - **Case 12 (Invalid Content or Amount)**: Gửi webhook với nội dung chuyển khoản sai cú pháp hoặc thiếu tiền; kiểm tra hệ thống ghi log cảnh báo an toàn và không tự động gia hạn tenant.
  - **Case 13 (Invoice Polling Endpoint)**: Kiểm tra endpoint `/api/v1/saas/invoices/{id}/status` trả về chính xác `pending` trước khi thanh toán và chuyển sang `paid` ngay sau khi webhook được xử lý.
- [x] 4.4 Chạy toàn bộ test suite backend bằng `php artisan test --filter="TenantRegistrationTrialTest|QuotaGuardTest|SePaySaaSWebhookTest"` và đảm bảo 100% test cases đều PASS.

## 5. Giao diện Frontend Quản lý Thuê bao (`apps/web`)

- [x] 5.1 Tạo trang `apps/web/app/subscription/page.tsx` hiển thị thông tin gói cước hiện tại, trạng thái, và ngày hết hạn.
- [x] 5.2 Xây dựng component `QuotaProgressBars`: Hiển thị thanh tiến trình trực quan cho Chi nhánh, Nhân sự và Đơn hàng tháng với màu sắc Calm Jade và cảnh báo khi chạm 80% hạn mức.
- [x] 5.3 Xây dựng component `PricingPlanGrid`: Thẻ giá gói Standard (299k) và Pro (599k) với nút chuyển đổi chu kỳ Tháng / Năm và nút "Nâng cấp ngay".
- [x] 5.4 Xây dựng component `SePayPaymentModal`:
  - Hiển thị QR Code VietQR động SePay với template rõ nét.
  - Hiển thị ngân hàng, số tài khoản, số tiền và cú pháp `FIXSUB{id}` kèm nút sao chép nhanh.
  - Đồng hồ đếm ngược thời gian thanh toán (15 phút).
  - Polling hook tự động gọi API kiểm tra trạng thái mỗi 2 giây và hiển thị màn hình chúc mừng khi thanh toán hoàn tất.
- [x] 5.5 Cập nhật Header/Topbar: Thêm Plan Badge thể hiện trạng thái gói (Trial x ngày, Standard, Pro, Hết hạn) và nút gia hạn nhanh.
- [x] 5.6 Cập nhật Sidebar Navigation: Bổ sung liên kết dẫn tới `/subscription` cho người dùng có quyền Admin.
- [x] 5.7 Cập nhật trang `apps/web/app/register/page.tsx`: Tiếp nhận param `?plan=...` và hiển thị tóm tắt gói cước được chọn trước.

## 6. Frontend Tests & QA Verification

- [x] 6.1 Viết unit/integration tests cho trang `/subscription` và component `QuotaProgressBars` (kiểm tra render đúng tỷ lệ hạn mức).
- [x] 6.2 Viết unit tests cho `SePayPaymentModal` (kiểm tra hiển thị QR, copy cú pháp, và xử lý polling thành công).
- [x] 6.3 Chạy `pnpm test` tại `apps/web` để xác minh tất cả frontend tests đều PASS.
- [x] 6.4 Chạy build kiểm tra toàn bộ monorepo bằng `pnpm build` đảm bảo không có lỗi type hoặc compile.

## 7. Đóng gói & Báo cáo

- [x] 7.1 Kiểm tra trạng thái OpenSpec change `saas-subscription-sepay` đảm bảo sẵn sàng cho bước Apply.
- [x] 7.2 Tổng hợp bằng chứng test và lập tài liệu bàn giao kỹ thuật.
- [x] 7.3 Đóng gói mã nguồn, tạo commit và push lên branch main của GitHub.
