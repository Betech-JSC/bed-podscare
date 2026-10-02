# Tasks: super-admin-streamline

## 1. Tinh gọn Sidebar Super Admin (Navigation Restructuring)

- [x] 1.1 Loại bỏ các mục kỹ thuật rườm rà (`platform-quotas`, `platform-health`) khỏi `packages/ui/src/organisms/AppSidebar.tsx` và verify mã nguồn không còn chứa route `/platform/quotas` hay `/platform/health`
- [x] 1.2 Tái cấu trúc menu Super Admin thành 3 phân nhóm phẳng: ĐIỀU HÀNH NỀN TẢNG (Stores, Approvals, Plans), GIÁM SÁT TOÀN SÀN (Dashboard, Billing), và CẤU HÌNH DOANH THU (Integrations - SePay), đổi nhãn thành "Tài khoản nhận tiền SePay", verify thanh điều hướng hiển thị đúng 6 mục khi user có role `super_admin`
- [x] 1.3 Đảm bảo trạng thái Active, Scroll position và không sử dụng màu gradient hay icon lạ trên Sidebar, verify giao diện hiển thị chuẩn các token Calm Jade (`#176b58`) và Slate

## 2. Tối ưu trang lỗi 404 (History Navigation Fix)

- [x] 2.1 Cập nhật `apps/web/app/not-found.tsx` sử dụng hook `useRouter` với hành động `router.back()` và nhãn `← Quay lại trang trước`, verify hành động bấm nút kích hoạt `router.back()` đưa người dùng quay lại màn hình trước đó thay vì văng về trang chủ `/`
- [x] 2.2 Bổ sung liên kết văn bản phụ an toàn ("Hoặc về trang chủ / tổng quan") khi người dùng truy cập trực tiếp URL chết không có lịch sử duyệt, verify không xảy ra lỗi trắng trang hoặc điều hướng vô tận

## 3. Xây dựng trang Quản lý Gói cước SaaS (`/platform/plans`)

- [x] 3.1 Khởi tạo route `apps/web/app/platform/plans/page.tsx` bọc trong `AppShell`, thiết lập cấu trúc dữ liệu cho 3 gói cước (Trial 14 ngày, Standard 299k/tháng, Pro 599k/tháng), verify route `/platform/plans` trả về mã 200 không còn bị lỗi 404
- [x] 3.2 Hiện thực hóa giao diện so sánh 3 thẻ gói cước phẳng chuẩn Enterprise, hiển thị giá niêm yết, chu kỳ thanh toán, số lượng gian hàng đang kích hoạt và danh sách quyền lợi chi tiết, verify giao diện responsive trên mọi kích thước màn hình
- [x] 3.3 Thêm modal cập nhật quyền lợi gói cước cho phép Super Admin điều chỉnh giá niêm yết và tính năng đi kèm, verify dữ liệu thay đổi được phản ánh tức thì trên UI

## 4. Xây dựng trang Doanh thu SaaS (`/platform/billing`)

- [x] 4.1 Khởi tạo route `apps/web/app/platform/billing/page.tsx` bọc trong `AppShell`, thiết lập 4 thẻ chỉ số tài chính (Doanh thu lũy kế, Doanh thu tháng, Gian hàng sắp hết hạn, Tỷ lệ duy trì), verify route `/platform/billing` tải thành công không còn lỗi 404
- [x] 4.2 Xây dựng bảng danh sách giao dịch SePay VietQR toàn sàn kèm mã tham chiếu ngân hàng, tên gian hàng, số tiền và trạng thái khớp lệnh tự động, verify bảng dữ liệu có hỗ trợ tìm kiếm và phân trang
- [x] 4.3 Xây dựng khối cảnh báo danh sách gian hàng có gói cước sắp hết hạn trong 7 ngày tới kèm nút nhắc phí/hỗ trợ, verify danh sách cảnh báo hiển thị chính xác ngày hết hạn và tên gói

## 5. Xây dựng trang Cấu hình Cổng SePay (`/platform/integrations`)

- [x] 5.1 Khởi tạo route `apps/web/app/platform/integrations/page.tsx` bọc trong `AppShell`, xây dựng form cấu hình tài khoản ngân hàng thụ hưởng (Ngân hàng, STK, Tên chủ tài khoản) và SePay API Token / Webhook URL, verify route `/platform/integrations` tải thành công không còn lỗi 404
- [x] 5.2 Xây dựng khung mô phỏng trực quan mã VietQR động dựa trên STK và ngân hàng đã nhập cùng cơ chế ẩn/hiện ký tự bảo mật của API Token, verify khung xem trước VietQR render đúng thông tin tài khoản
- [x] 5.3 Hiện thực hóa nút "Kiểm tra kết nối SePay" (Test connection) kèm huy hiệu trạng thái Live màu Calm Jade (`#176b58`), verify phản hồi kết nối và nút lưu cấu hình hoạt động chính xác

## 6. Kiểm thử tích hợp và Xác thực giao diện

- [x] 6.1 Chạy lệnh kiểm tra TypeScript và build ứng dụng web (`npm run build` hoặc typecheck tương ứng) để verify không có lỗi cú pháp, lint hoặc import gãy
- [x] 6.2 Kiểm thử điều hướng toàn bộ 6 liên kết trên thanh Sidebar Super Admin và nút quay lại trên trang 404 bằng trình duyệt, chụp ảnh screenshot bằng chứng xác nhận 100% không còn lỗi 404 và giao diện tuân thủ quy chuẩn thiết kế
