# Proposal: Pre-Test Critical Flow Fixes

## Why

Hệ thống PodsCare Repair OS đang chuẩn bị cho phiên chạy thử nghiệm toàn diện (user testing session). Qua khảo sát thực tế luồng vận hành, hệ thống còn tồn tại một số điểm nghẽn nghiêm trọng (Critical blockers) có thể làm gián đoạn buổi test:
1. In phiếu tiếp nhận 2 liên A4 bị vỡ trang, phát sinh trang trắng thừa khi in ra máy in thật hoặc lưu PDF.
2. Thiếu lối tắt menu Kỹ thuật viên (`/tech`) trên thanh điều hướng chính, khiến KTV không thể truy cập bàn làm việc trực tiếp từ AppSidebar.
3. Dữ liệu mẫu (seeder) chỉ có 1 đơn duy nhất ở Chi nhánh Q1, thiếu các đơn mẫu ở các trạng thái then chốt (`waiting_approval`, `waiting_tech`, `in_repair`, `waiting_qc`, `ready_for_return`, `completed`) trên cả 2 chi nhánh Q1 và Q3.
4. Trang thanh toán (`/payments`) chưa hỗ trợ chọn đơn chờ thanh toán từ hệ thống và chưa có cơ chế giả lập thanh toán thành công để hoàn tất luồng kiểm thử mà không phụ thuộc vào webhook ngân hàng bên ngoài.
5. Nguy cơ lặp kép URL `/api/v1/api/v1` trong `HttpClient` khi cấu hình baseURL và endpoint không đồng nhất.
6. Giao diện quản lý đơn sửa chữa (`/repairs`) bị lỗi ghi nhận sai trạng thái tạm thời trên RAM khi backend từ chối chuyển trạng thái FSM (HTTP 422), đồng thời backend thiếu alias cho một số trạng thái chuyển tiếp tương đương (`quote_pending`, `qc_inspecting`).

Gói hotfix này tập trung xử lý dứt điểm các vấn đề trên nhằm đảm bảo trải nghiệm thông suốt cho toàn bộ các vai trò người dùng trong buổi test sáng mai.

## What Changes

- **In phiếu tiếp nhận 2 liên chuẩn A4**: Tái cấu trúc CSS in (`globals.css` và `apps/web/app/print/[id]/page.tsx`), cô lập `#printSheetWrapper`, kiểm soát chiều cao mỗi liên tối đa 132mm, ngắt trang chính xác `page-break-after: avoid` và ẩn triệt để các phần tử ngoài văn bản để triệt tiêu hoàn toàn trang trắng thừa.
- **Menu Kỹ thuật viên trên AppSidebar**: Bổ sung mục điều hướng "Bàn làm việc KTV" (`/tech`) với icon chuyên dụng vào nhóm Operations trên `packages/ui/src/organisms/AppSidebar.tsx`, phân quyền cho cả vai trò `admin` và `tech`.
- **Làm giàu Seeder đa trạng thái & đa chi nhánh**: Cập nhật `apps/api/database/seeders/CustomerAndOrderSeeder.php` tạo đủ 6 đơn sửa chữa mẫu trải đều 6 trạng thái nghiệp vụ chuẩn (`waiting_approval`, `waiting_tech`, `in_repair`, `waiting_qc`, `ready_for_return`, `completed`) trên cả 2 chi nhánh Quận 1 và Quận 3, kèm đầy đủ biên bản kiểm tra, ảnh intake, báo giá và phân công nhân sự tương ứng.
- **Giả lập thanh toán & Chọn đơn tại `/payments`**: Nâng cấp trang thanh toán `apps/web/app/payments/page.tsx` cho phép chọn nhanh các đơn hàng đang chờ thanh toán (`ready_for_return` / `waiting_pickup`), tự động điền mã đơn và số tiền cần thu; bổ sung nút "Giả lập thanh toán thành công" (Simulate Payment Success) chuyển trạng thái đơn sang `completed` và ghi nhận phiếu thu ngay trên giao diện mà không cần tích hợp SePay/VietQR realtime ở phase này.
- **Chống lặp kép URL trong HttpClient**: Nâng cấp `packages/api-client/src/http-client.ts` với hàm chuẩn hóa URL, tự động loại bỏ tiền tố lặp `/api/v1/api/v1` hoặc `/api/v1` thừa thãi giữa baseURL và endpoint, đồng thời rà soát mẫu cấu hình chuẩn trong `apps/web/.env.example`.
- **Bảo toàn dữ liệu RAM & Alias FSM**: Bổ sung cơ chế Rollback trạng thái giao diện trên `apps/web/app/repairs/page.tsx` khi API trả về lỗi 422 từ chối chuyển đổi trạng thái FSM; chuẩn hóa alias chuyển trạng thái trong `apps/api/app/Http/Controllers/Api/V1/OrderController.php` (hỗ trợ `quote_pending` -> `waiting_approval`, `qc_inspecting` -> `waiting_qc`).
- **Quyết định thiết kế đã thống nhất (Design Decisions)**:
  - Giữ nguyên form đăng nhập tài khoản / mật khẩu tiêu chuẩn hiện tại, KHÔNG triển khai Quick Login / Role Switcher tự động để bảo toàn luồng xác thực bảo mật thực tế.
  - Sử dụng cơ chế nút giả lập thanh toán (Simulate Payment Success) cho phép tester duyệt nhanh luồng thu tiền và hoàn tất đơn mà không phải cấu hình SePay webhook hay quét mã ngân hàng thật.

## Capabilities

### New Capabilities
- `critical-flow-fixes`: Gói đặc tả các yêu cầu và hành vi kỹ thuật cho 6 hạng mục hotfix trọng yếu trước phiên chạy thử nghiệm: chuẩn hóa in ấn phiếu A4 không trang trắng, bổ sung điều hướng Kỹ thuật viên trên AppSidebar, làm giàu dữ liệu mẫu 6 trạng thái trên 2 chi nhánh, giả lập thu tiền đơn hàng tại quầy, triệt tiêu lỗi lặp prefix URL API, và đồng bộ hóa an toàn trạng thái FSM kèm cơ chế rollback khi gặp lỗi.

### Modified Capabilities

## Impact

- **Frontend Core & UI**:
  - `packages/ui/src/organisms/AppSidebar.tsx`: Thêm menu item `tech` và cập nhật quyền hiển thị cho `admin`, `tech`.
  - `apps/web/app/globals.css`: Tinh chỉnh CSS `@media print` để kiểm soát chặt chẽ kích thước trang in A4 và triệt tiêu tràn trang.
  - `apps/web/app/print/[id]/page.tsx`: Điều chỉnh wrapper container và padding/margin của 2 liên phiếu tiếp nhận.
  - `apps/web/app/payments/page.tsx`: Thêm dropdown chọn đơn hàng cần thu tiền và nút giả lập thanh toán hoàn tất đơn.
  - `apps/web/app/repairs/page.tsx`: Xử lý rollback state cục bộ và hiển thị thông báo lỗi chi tiết khi FSM transition thất bại.
  - `apps/web/.env.example`: Đồng bộ ghi chú cấu hình URL API.
- **Shared API Client**:
  - `packages/api-client/src/http-client.ts`: Thêm logic chuẩn hóa và khử trùng lặp URL.
- **Backend Core & Database**:
  - `apps/api/database/seeders/CustomerAndOrderSeeder.php`: Mở rộng từ 1 đơn lên 6 đơn đa trạng thái và đa chi nhánh.
  - `apps/api/app/Http/Controllers/Api/V1/OrderController.php`: Bổ sung mapping alias trạng thái FSM (`quote_pending`, `qc_inspecting`).
- **Khả năng tương thích ngược**: Hoàn toàn tương thích ngược, không phá vỡ schema database hiện tại, không thay đổi cấu trúc table.
