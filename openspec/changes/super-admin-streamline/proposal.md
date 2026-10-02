# Proposal: super-admin-streamline

## Why

Giao diện Quản trị Nền tảng FIXO (Super Admin) hiện tại còn tồn đọng nhiều menu kỹ thuật rườm rà (Hạn mức & Quotas, Sức khỏe Máy chủ, cấu hình SMS/ZNS/Email) gây phân tán sự chú ý và không phù hợp với nghiệp vụ điều hành kinh doanh SaaS. Đồng thời, các mục menu cốt lõi như `/platform/plans`, `/platform/billing`, `/platform/integrations` chưa được hiện thực hóa giao diện dẫn đến lỗi 404, và trang lỗi 404 toàn sàn đang gắn cứng nút quay về trang chủ khách hàng (`/`) khiến Super Admin bị văng khỏi ngữ cảnh quản trị nền tảng.

Việc tinh gọn cổng Super Admin theo Phương án A sẽ tập trung tối đa vào vận hành đối tác gian hàng và quản trị dòng tiền bản quyền SaaS tự động qua cổng SePay VietQR, tạo trải nghiệm điều hành mượt mà, chuyên nghiệp và chuẩn Enterprise.

## What Changes

- **Tinh gọn Sidebar Super Admin (`packages/ui/src/organisms/AppSidebar.tsx`)**:
  - Loại bỏ các mục không cần thiết: "Hạn mức & Quotas" (`/platform/quotas`), "Sức khỏe Máy chủ" (`/platform/health`), các cấu hình kỹ thuật SMS/ZNS/Email.
  - Tái cấu trúc thanh điều hướng Super Admin thành 3 phân nhóm phẳng chuẩn Enterprise:
    1. **ĐIỀU HÀNH NỀN TẢNG**: Danh sách Gian hàng (`/platform/stores`), Duyệt đăng ký (`/platform/approvals`), Gói cước & Bản quyền (`/platform/plans`).
    2. **GIÁM SÁT TOÀN SÀN**: Tổng quan Toàn sàn (`/platform`), Doanh thu SaaS (`/platform/billing`).
    3. **CẤU HÌNH DOANH THU**: Tài khoản nhận tiền SePay (`/platform/integrations`).
- **Khắc phục triệt để lỗi 404 trên các route Super Admin**:
  - Xây dựng trang Quản trị Gói cước SaaS (`apps/web/app/platform/plans/page.tsx`): Hiển thị và tùy chỉnh 3 gói cước chính thức (Trial 14 ngày, Standard 299k/tháng, Pro 599k/tháng), so sánh quyền lợi, số chi nhánh và tính năng kích hoạt.
  - Xây dựng trang Quản trị Doanh thu SaaS (`apps/web/app/platform/billing/page.tsx`): Theo dõi dòng tiền thu phí gia hạn nền tảng, danh sách giao dịch SePay VietQR toàn sàn, cảnh báo gian hàng sắp hết hạn bản quyền.
  - Xây dựng trang Cấu hình Cổng SePay Thu Phí Nền Tảng (`apps/web/app/platform/integrations/page.tsx`): Quản trị thông tin tài khoản ngân hàng nhận tiền VietQR (Ngân hàng, STK, Chủ TK, Webhook URL, API Token) để hệ thống tự động kích hoạt gian hàng khi thanh toán phí nền tảng.
- **Sửa nút điều hướng trên trang 404 (`apps/web/app/not-found.tsx`)**:
  - Thay thế link gắn cứng `<Link href="/">` bằng nút hành động `router.back()` với nhãn `← Quay lại trang trước`, bảo toàn lịch sử duyệt trang cho Super Admin và người dùng.
- **Tuân thủ quy chuẩn thiết kế FIXO**:
  - Flat enterprise UI, bảng màu Calm Jade (`#176b58`) & Warm Ivory (`#f4f7f5`).
  - Tuyệt đối không dùng gradient tùy tiện, không dùng icon rườm rà, không có nút "Cửa hàng mẫu".

## Capabilities

### New Capabilities
- `platform-navigation`: Cung cấp cấu trúc điều hướng Super Admin tinh gọn, hệ thống trang quản trị bản quyền và doanh thu SaaS (`/platform/plans`, `/platform/billing`, `/platform/integrations`), cùng cơ chế phục hồi lịch sử duyệt trang thông minh trên trang 404.

### Modified Capabilities
<!-- Không có capability nào thay đổi yêu cầu trong openspec/specs/ do dự án đang khởi tạo các capabilities ban đầu -->

## Impact

- **UI Components**: `packages/ui/src/organisms/AppSidebar.tsx` (cấu trúc navigation Super Admin, loại bỏ 2 nav items, cập nhật caption nhóm thứ 3 thành "CẤU HÌNH DOANH THU").
- **Error Handling**: `apps/web/app/not-found.tsx` (chuyển sang `useRouter().back()` với nhãn rõ ràng).
- **Frontend Pages**:
  - Thêm mới `apps/web/app/platform/plans/page.tsx`.
  - Thêm mới `apps/web/app/platform/billing/page.tsx`.
  - Thêm mới `apps/web/app/platform/integrations/page.tsx`.
- **Dependencies & APIs**: Tương thích với các API endpoint hiện có `/api/v1/platform/*` và cơ chế xác thực token `podscare_token`. Không gây ảnh hưởng đến dữ liệu cửa hàng hiện tại.
