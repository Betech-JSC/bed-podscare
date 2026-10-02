# Spec Delta

## Purpose

Cung cấp giải pháp quản lý vòng đời thuê bao SaaS B2B, chốt chặn hạn mức tài nguyên (chi nhánh, nhân sự, đơn hàng), và tự động hóa thanh toán gia hạn qua SePay VietQR cho các chủ tiệm FIXO Repair OS.

## ADDED Requirements

### Requirement: Tự động cấp quyền dùng thử 14 ngày khi đăng ký
Hệ thống SHALL tự động kích hoạt gói dùng thử (Trial) với thời hạn đúng 14 ngày cho cửa hàng (Tenant) ngay khi chủ tiệm đăng ký tài khoản thành công qua API xác thực.

#### Scenario: Đăng ký tài khoản mới thành công nhận 14 ngày dùng thử
- **WHEN** chủ tiệm gửi yêu cầu đăng ký hợp lệ tới `POST /api/v1/auth/register`
- **THEN** hệ thống tạo mới Tenant với gói cước `trial`, thiết lập `trial_ends_at` và `expires_at` đúng 14 ngày kể từ thời điểm đăng ký (`now()->addDays(14)`)
- **THEN** trả về thông tin xác thực thành công kèm trạng thái gói `trial` và ngày hết hạn

#### Scenario: Đăng ký với tham số gói được chọn trước
- **WHEN** chủ tiệm đăng ký qua form có đính kèm tham số gói cước mong muốn (ví dụ `plan=standard`)
- **THEN** hệ thống vẫn cấp dùng thử 14 ngày ban đầu nhưng lưu vết gói mong muốn (`intended_plan`) để gợi ý nâng cấp trong bảng điều khiển

---

### Requirement: Chốt chặn hạn mức chi nhánh (Branch Quota Guard)
Hệ thống SHALL kiểm tra số lượng chi nhánh hiện có của cửa hàng so với hạn mức tối đa của gói cước trước khi cho phép tạo chi nhánh mới.

#### Scenario: Tạo chi nhánh trong hạn mức cho phép
- **WHEN** chủ tiệm sở hữu gói có `max_branches = 1` tạo chi nhánh đầu tiên hoặc gói `Standard` (`max_branches = 2`) tạo chi nhánh thứ 2 qua `POST /api/v1/branches`
- **THEN** hệ thống chấp thuận và trả về mã trạng thái HTTP 201 Created

#### Scenario: Chặn tạo chi nhánh vượt quá hạn mức gói cước
- **WHEN** chủ tiệm gói `trial` (`max_branches = 1`) cố gắng tạo chi nhánh thứ 2 hoặc gói `Standard` tạo chi nhánh thứ 3
- **THEN** hệ thống chặn yêu cầu và trả về lỗi HTTP 422 Unprocessable Entity kèm thông báo "Vượt quá số lượng chi nhánh cho phép của gói cước hiện tại. Vui lòng nâng cấp gói."

#### Scenario: Không giới hạn chi nhánh đối với gói Pro
- **WHEN** chủ tiệm sử dụng gói `pro` (`max_branches = -1`) gửi yêu cầu tạo chi nhánh bất kỳ
- **THEN** hệ thống không áp dụng giới hạn số lượng và tạo chi nhánh thành công

---

### Requirement: Chốt chặn hạn mức nhân sự (User Quota Guard)
Hệ thống SHALL giới hạn số lượng tài khoản nhân viên (User/Staff) được phân quyền trong cùng một cửa hàng dựa trên gói cước hiện tại.

#### Scenario: Thêm nhân viên trong hạn mức cho phép
- **WHEN** chủ tiệm gửi yêu cầu tạo nhân viên mới qua `POST /api/v1/users` và tổng số nhân viên hiện tại chưa đạt `max_users`
- **THEN** hệ thống lưu nhân viên mới thành công và trả về HTTP 201 Created

#### Scenario: Chặn thêm nhân viên khi vượt quá hạn mức
- **WHEN** tổng số nhân sự đã chạm ngưỡng `max_users` quy định của gói (ví dụ gói Trial chạm 2 nhân viên)
- **THEN** hệ thống từ chối yêu cầu với HTTP 422 Unprocessable Entity kèm mã lỗi `QUOTA_EXCEEDED_USERS`

---

### Requirement: Chốt chặn hạn mức đơn hàng theo tháng (Order Quota Guard)
Hệ thống SHALL đếm tổng số lượng đơn sửa chữa được tạo trong tháng hiện tại và chặn tạo đơn mới nếu cửa hàng vượt quá chỉ tiêu hàng tháng của gói.

#### Scenario: Tạo đơn sửa chữa khi chưa vượt hạn mức tháng
- **WHEN** nhân viên tạo đơn sửa chữa mới qua `POST /api/v1/orders` trong tháng mà số đơn tích lũy nhỏ hơn `max_orders_per_month`
- **THEN** hệ thống tạo đơn thành công và trả về HTTP 201 Created

#### Scenario: Chặn tạo đơn sửa chữa khi vượt hạn mức tháng
- **WHEN** số đơn sửa chữa trong tháng hiện tại đã đạt ngưỡng tối đa (ví dụ gói Trial chạm 50 đơn/tháng)
- **THEN** hệ thống chặn tạo đơn mới và trả về HTTP 422 Unprocessable Entity với mã lỗi `QUOTA_EXCEEDED_ORDERS`

---

### Requirement: Chốt chặn bản quyền hết hạn (Subscription Expired Guard)
Hệ thống SHALL ngăn chặn các thao tác ghi dữ liệu nghiệp vụ nếu thời hạn sử dụng của cửa hàng đã kết thúc (`expires_at < now()`).

#### Scenario: Cửa hàng còn hạn sử dụng thao tác bình thường
- **WHEN** người dùng thuộc Tenant có `expires_at >= now()` thực hiện các tác vụ tạo/sửa dữ liệu
- **THEN** hệ thống xử lý bình thường

#### Scenario: Cửa hàng hết hạn bị chặn tác vụ ghi dữ liệu
- **WHEN** người dùng thuộc Tenant có `expires_at < now()` gửi yêu cầu tạo hoặc cập nhật dữ liệu (như tạo đơn hàng, sửa phiếu thu, tạo linh kiện)
- **THEN** hệ thống trả về lỗi HTTP 403 Forbidden kèm mã lỗi `SUBSCRIPTION_EXPIRED` và đường dẫn điều hướng tới trang gia hạn `/subscription`

#### Scenario: Cho phép truy cập xem dữ liệu khi hết hạn (Read-only mode)
- **WHEN** người dùng thuộc Tenant hết hạn gửi yêu cầu xem danh sách (`GET /api/v1/orders`, `GET /api/v1/branches`)
- **THEN** hệ thống vẫn cho phép truy xuất dữ liệu chỉ đọc để cửa hàng tra cứu dữ liệu cũ

---

### Requirement: Khởi tạo hóa đơn SaaS & Sinh mã VietQR SePay
Hệ thống SHALL cho phép chủ tiệm chọn gói cước (Standard hoặc Pro) theo chu kỳ (tháng hoặc năm), khởi tạo hóa đơn SaaS và sinh chuỗi mã VietQR thanh toán động với cú pháp `FIXSUB{invoice_id}`.

#### Scenario: Khởi tạo hóa đơn và lấy thông tin thanh toán VietQR
- **WHEN** chủ tiệm gửi yêu cầu `POST /api/v1/saas/subscribe` với `plan_id` và `billing_cycle` (`monthly` hoặc `yearly`)
- **THEN** hệ thống tạo bản ghi `saas_invoices` ở trạng thái `pending`
- **THEN** hệ thống trả về thông tin chi tiết gồm: `invoice_id`, `amount`, `reference_code` dạng `FIXSUB{id}`, số tài khoản SePay nhận tiền, và đường link hình ảnh mã QR VietQR tương thích

#### Scenario: Ngăn chặn tạo hóa đơn với gói không hợp lệ
- **WHEN** người dùng gửi yêu cầu đăng ký với `plan_id` không tồn tại hoặc gói `trial`
- **THEN** hệ thống trả về lỗi HTTP 422 Validation Error

---

### Requirement: Xử lý Webhook SePay Realtime với Idempotency & Database Locking
Hệ thống SHALL cung cấp endpoint công khai tiếp nhận Webhook từ SePay, xác thực Secret API Key, áp dụng Pessimistic Locking và Idempotency để tự động kích hoạt/gia hạn gói cước an toàn tuyệt đối.

#### Scenario: Xác thực SePay API Key thất bại
- **WHEN** SePay gửi webhook tới `POST /api/v1/saas/sepay/webhook` nhưng thiếu hoặc sai header `SePay-Api-Key`
- **THEN** hệ thống từ chối xử lý và trả về ngay HTTP 401 Unauthorized

#### Scenario: Xử lý thanh toán thành công và gia hạn gói cước
- **WHEN** webhook hợp lệ gửi đến chứa `transaction_id`, số tiền `transferAmount`, và nội dung chuyển khoản chứa cú pháp `FIXSUB{invoice_id}`
- **THEN** hệ thống khóa dòng hóa đơn bằng `lockForUpdate()`, kiểm tra trạng thái đang `pending` và số tiền khớp đúng
- **THEN** cập nhật hóa đơn sang `paid`, lưu giao dịch vào `sepay_transactions`
- **THEN** cập nhật Tenant sang gói cước mới và gia hạn `expires_at` (+30 ngày cho gói tháng hoặc +365 ngày cho gói năm) tính từ thời điểm hết hạn hiện tại (hoặc từ hiện tại nếu đã hết hạn)
- **THEN** trả về phản hồi JSON `{ "success": true }` với HTTP 200

#### Scenario: Chống trùng lặp Webhook (Idempotency Guard)
- **WHEN** SePay gửi lại webhook có cùng `transaction_id` đã được ghi nhận trước đó trong `sepay_transactions`
- **THEN** hệ thống nhận diện giao dịch trùng lặp, không cộng dồn thêm ngày gia hạn và trả về ngay HTTP 200 OK với thông báo `already_processed`

#### Scenario: Chuyển khoản sai số tiền hoặc sai cú pháp
- **WHEN** nội dung chuyển khoản không tìm thấy hóa đơn tương ứng hoặc số tiền thực chuyển thấp hơn giá trị hóa đơn
- **THEN** hệ thống đánh dấu trạng thái cảnh báo trên hóa đơn, ghi log chi tiết và không tự động gia hạn tenant

---

### Requirement: Polling trạng thái thanh toán thời gian thực
Hệ thống SHALL cung cấp API kiểm tra trạng thái hóa đơn thanh toán để Frontend có thể tự động đồng bộ mà không cần tải lại trang.

#### Scenario: Polling hóa đơn đang chờ thanh toán
- **WHEN** Frontend gửi yêu cầu `GET /api/v1/saas/invoices/{id}/status` của hóa đơn chưa thanh toán
- **THEN** hệ thống trả về `{ "status": "pending" }`

#### Scenario: Polling hóa đơn đã thanh toán thành công
- **WHEN** Frontend kiểm tra hóa đơn vừa được Webhook xử lý thành công
- **THEN** hệ thống trả về `{ "status": "paid", "plan": "...", "expires_at": "..." }`

---

### Requirement: Giao diện quản lý gói cước và huy hiệu trạng thái
Hệ thống SHALL hiển thị giao diện quản lý thuê bao trực quan tại `/subscription`, bao gồm tiến trình tiêu thụ hạn mức (Quota Progress Bars), danh sách gói cước, modal thanh toán VietQR động, và huy hiệu thời hạn trên Topbar.

#### Scenario: Xem tiến trình sử dụng hạn mức hiện tại
- **WHEN** chủ tiệm truy cập trang `/subscription`
- **THEN** giao diện hiển thị chính xác tên gói, ngày hết hạn và các thanh tiến trình hiển thị tỷ lệ đã dùng của Chi nhánh, Nhân sự và Đơn hàng trong tháng

#### Scenario: Mở modal thanh toán VietQR khi bấm Nâng cấp
- **WHEN** chủ tiệm bấm chọn gói Standard hoặc Pro và chọn chu kỳ thanh toán
- **THEN** hệ thống gọi API tạo hóa đơn và hiển thị modal chứa mã VietQR SePay kèm mã chuyển khoản `FIXSUB{id}` và đồng hồ đếm ngược
- **THEN** modal tự động kích hoạt polling mỗi 2 giây; khi hóa đơn chuyển trạng thái `paid`, hiển thị thông báo thành công và cập nhật lại giao diện
