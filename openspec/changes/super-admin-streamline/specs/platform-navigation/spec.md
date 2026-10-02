# Spec Delta: Platform Navigation and Streamlined Super Admin Portal

## Purpose

Cung cấp trải nghiệm điều hướng tinh gọn, chuyên nghiệp và liền mạch cho Quản trị viên Nền tảng FIXO (Super Admin), đảm bảo loại bỏ các trang kỹ thuật dư thừa, hoàn thiện các trang quản trị SaaS cốt lõi và hỗ trợ điều hướng lịch sử thông minh khi gặp lỗi 404.

## ADDED Requirements

### Requirement: Streamlined Super Admin Sidebar Navigation
Hệ thống SHALL (PHẢI) cung cấp thanh điều hướng Sidebar tinh giản dành riêng cho người dùng có vai trò `super_admin`. Sidebar này PHẢI loại bỏ hoàn toàn các mục kỹ thuật không phục vụ trực tiếp cho hoạt động kinh doanh (bao gồm mục "Hạn mức & Quotas", "Sức khỏe Máy chủ", và các cấu hình SMS/ZNS/Email rườm rà).
Sidebar Super Admin PHẢI phân nhóm cấu trúc thành 3 khối nghiệp vụ rõ ràng:
1. **ĐIỀU HÀNH NỀN TẢNG**: Danh sách Gian hàng (`/platform/stores`), Duyệt đăng ký (`/platform/approvals`), Gói cước & Bản quyền (`/platform/plans`).
2. **GIÁM SÁT TOÀN SÀN**: Tổng quan Toàn sàn (`/platform`), Doanh thu SaaS (`/platform/billing`).
3. **CẤU HÌNH DOANH THU**: Tài khoản nhận tiền SePay (`/platform/integrations`).
Giao diện thanh Sidebar PHẢI tuân thủ thiết kế Flat Enterprise, sử dụng các mã màu Calm Jade (`#176b58`) và Warm Ivory, TUYỆT ĐỐI KHÔNG sử dụng màu gradient tùy tiện và KHÔNG hiển thị nút chuyển sang "Cửa hàng mẫu".

#### Scenario: Rendering pruned sidebar for Super Admin role
- **WHEN** người dùng đăng nhập với vai trò `super_admin` xem thanh Sidebar
- **THEN** hệ thống chỉ hiển thị đúng 6 mục thuộc 3 khối "ĐIỀU HÀNH NỀN TẢNG", "GIÁM SÁT TOÀN SÀN", và "CẤU HÌNH DOANH THU", đồng thời các mục `/platform/quotas` và `/platform/health` không còn xuất hiện trên giao diện.

#### Scenario: Active state indicator on platform menu click
- **WHEN** Super Admin điều hướng tới bất kỳ trang nào trong 6 đường dẫn quản trị nền tảng (ví dụ: `/platform/plans`)
- **THEN** mục menu tương ứng trên Sidebar được đánh dấu trạng thái Active với nền xanh ngọc nhạt (`#eaf4ef`), chữ xanh đậm (`#176b58`), và thanh trượt cuộn Sidebar được bảo lưu vị trí.

---

### Requirement: Context-Preserving 404 Error Navigation
Trang thông báo lỗi 404 Not Found (`apps/web/app/not-found.tsx`) SHALL (PHẢI) bảo lưu ngữ cảnh làm việc của người dùng bằng cách cung cấp nút hành động điều hướng quay lại trang trước (`router.back()`) thay vì chuyển hướng cố định về trang chủ (`/`).

#### Scenario: Navigating back to previous platform page from 404
- **WHEN** Super Admin đang làm việc trong khu vực `/platform/*` và vô tình truy cập vào một đường dẫn không tồn tại
- **THEN** trang 404 hiển thị nút bấm `← Quay lại trang trước` và khi người dùng bấm vào nút này, trình duyệt sẽ quay trở lại màn hình quản trị liền kề trước đó thay vì bị văng về trang chủ khách hàng.

#### Scenario: Fallback navigation when no history exists
- **WHEN** người dùng truy cập trực tiếp đường dẫn 404 bằng liên kết ngoài mà không có lịch sử trang trước trong phiên duyệt
- **THEN** nút điều hướng vẫn đảm bảo an toàn, cho phép người dùng quay về trang tổng quan tương ứng với phân quyền mà không gây lỗi vòng lặp hoặc trang trắng.

---

### Requirement: SaaS Subscription Plans Management Page
Hệ thống SHALL (PHẢI) cung cấp trang quản lý gói cước SaaS tại đường dẫn `/platform/plans` dành riêng cho Super Admin để giám sát và thiết lập các gói bản quyền phần mềm cho toàn bộ các gian hàng.
Trang này PHẢI hiển thị bảng so sánh chi tiết 3 gói cước tiêu chuẩn:
- Gói Dùng thử (Trial - 14 ngày): Miễn phí, 1 chi nhánh, tối đa 100 đơn sửa/tháng.
- Gói Tiêu chuẩn (Standard - 299.000 đ/tháng): 2 chi nhánh, tối đa 500 đơn sửa/tháng, tính năng tích hợp SePay và báo giá Zalo.
- Gói Nâng cao (Pro Enterprise - 599.000 đ/tháng): Không giới hạn chi nhánh, không giới hạn đơn sửa, phân quyền nâng cao và hỗ trợ VIP 24/7.
Super Admin PHẢI có khả năng xem số lượng gian hàng đang kích hoạt từng gói cước và mở modal cập nhật quyền lợi gói cước.

#### Scenario: Viewing SaaS plans comparison and tier stats
- **WHEN** Super Admin truy cập đường dẫn `/platform/plans`
- **THEN** giao diện hiển thị 3 thẻ gói cước phẳng (Trial, Standard, Pro) với đầy đủ thông tin giá niêm yết, chu kỳ thanh toán, số gian hàng đang sử dụng và danh sách quyền lợi chi tiết dạng tích chọn.

#### Scenario: Updating a plan tier pricing or feature entitlements
- **WHEN** Super Admin bấm nút "Cập nhật quyền lợi" trên một gói cước
- **THEN** hệ thống hiển thị form cho phép điều chỉnh giá niêm yết, số chi nhánh tối đa và các tính năng đi kèm, đồng thời lưu trữ cập nhật an toàn mà không làm gián đoạn các hợp đồng đang hiệu lực.

---

### Requirement: SaaS Platform Billing and Revenue Page
Hệ thống SHALL (PHẢI) cung cấp trang theo dõi doanh thu và dòng tiền SaaS tại đường dẫn `/platform/billing` dành riêng cho Super Admin.
Trang này PHẢI bao gồm:
1. Thẻ chỉ số tổng hợp (KPI Cards): Tổng doanh thu lũy kế, Doanh thu tháng hiện tại, Số gian hàng sắp đến hạn gia hạn trong 7 ngày tới, và Tỷ lệ duy trì gói cước (Retention Rate).
2. Bảng lịch sử giao dịch SePay VietQR toàn sàn: Mã giao dịch ngân hàng, Tên gian hàng thanh toán, Gói cước đăng ký/gia hạn, Số tiền (VNĐ), Thời gian thanh toán và Trạng thái khớp lệnh tự động.
3. Bộ lọc tìm kiếm theo tên gian hàng, khoảng thời gian và trạng thái thanh toán.

#### Scenario: Viewing SaaS revenue dashboard and renewal warnings
- **WHEN** Super Admin truy cập đường dẫn `/platform/billing`
- **THEN** màn hình hiển thị đầy đủ 4 thẻ chỉ số tài chính kèm danh sách cảnh báo các gian hàng có thời hạn gói cước còn dưới 7 ngày để hỗ trợ nhắc phí kịp thời.

#### Scenario: Inspecting real-time VietQR SePay transaction history
- **WHEN** một gian hàng quét mã VietQR và hệ thống nhận webhook thanh toán SePay thành công
- **THEN** giao diện trang `/platform/billing` ghi nhận giao dịch mới với đầy đủ mã tham chiếu ngân hàng, số tiền khớp đúng và trạng thái chuyển sang màu xanh "Thành công".

---

### Requirement: Platform SePay Payment Gateway Integration Page
Hệ thống SHALL (PHẢI) cung cấp trang cấu hình tài khoản nhận tiền SePay tại đường dẫn `/platform/integrations` dành riêng cho Super Admin.
Trang này PHẢI cho phép Super Admin thiết lập duy nhất cổng thanh toán SePay thu phí SaaS của nền tảng, bao gồm:
- Thông tin tài khoản ngân hàng nhận tiền: Tên ngân hàng đối tác (MBBank, Vietcombank, Techcombank, ACB...), Số tài khoản, Tên chủ tài khoản thụ hưởng.
- Cấu hình xác thực SePay: SePay API Token (có chế độ ẩn/hiện ký tự bảo mật), Webhook URL nhận thông báo giao dịch, và Khóa bí mật Webhook Secret.
- Bản xem trước mã VietQR mẫu: Tự động render khung mã VietQR chuẩn với thông tin tài khoản đã nhập để Super Admin kiểm tra trực quan.
- Nút kiểm tra kết nối (Test Webhook/Connection) để xác thực trạng thái hoạt động với SePay API.

#### Scenario: Configuring platform VietQR receiving account
- **WHEN** Super Admin nhập số tài khoản, chọn ngân hàng và điền tên chủ tài khoản thụ hưởng tại `/platform/integrations` rồi bấm "Lưu cấu hình"
- **THEN** hệ thống lưu thông tin an toàn vào cấu hình nền tảng và cập nhật khung xem trước VietQR tương ứng ngay trên giao diện.

#### Scenario: Testing connection with SePay API
- **WHEN** Super Admin bấm nút "Kiểm tra kết nối SePay" sau khi điền API Token
- **THEN** hệ thống gửi yêu cầu kiểm tra tới SePay gateway và hiển thị thông báo kết nối thành công kèm trạng thái "Đang kết nối (Live)" màu xanh Calm Jade.
