# Design: super-admin-streamline

## Context

Hệ thống quản trị Nền tảng FIXO dành cho Super Admin hiện đang trong giai đoạn chuyển đổi sang mô hình kinh doanh SaaS đa gian hàng (Multi-tenant). Trải nghiệm hiện tại gặp 3 vấn đề kiến trúc giao diện chính:
1. Thanh điều hướng `AppSidebar` bị quá tải bởi các tính năng hạ tầng kỹ thuật rườm rà (Hạn mức & Quotas, Sức khỏe VPS, cấu hình SMS/ZNS/Email) vốn không thuộc trọng tâm điều hành kinh doanh.
2. Các liên kết cốt lõi trong menu (`/platform/plans`, `/platform/billing`, `/platform/integrations`) trỏ đến các route chưa có file `page.tsx`, gây lỗi 404 cho Super Admin.
3. Khi gặp lỗi 404, trang `apps/web/app/not-found.tsx` điều hướng cứng về `/` (trang chủ gian hàng), làm mất ngữ cảnh và phiên làm việc của Super Admin.

Chi tiết về động lực và phạm vi thay đổi được mô tả trong [proposal.md](file:///Users/macbookpro2020/bed-podscare/openspec/changes/super-admin-streamline/proposal.md) và [spec.md](file:///Users/macbookpro2020/bed-podscare/openspec/changes/super-admin-streamline/specs/platform-navigation/spec.md).

## Goals / Non-Goals

**Goals:**
- Tinh giản Sidebar Super Admin thành 3 phân nhóm nghiệp vụ tập trung: ĐIỀU HÀNH NỀN TẢNG (3 mục), GIÁM SÁT TOÀN SÀN (2 mục), và CẤU HÌNH DOANH THU (1 mục duy nhất: SePay).
- Xây dựng 3 màn hình hoàn chỉnh, trực quan, có dữ liệu mẫu thực tế và khả năng kết nối API:
  - `apps/web/app/platform/plans/page.tsx`: Quản lý 3 gói SaaS (Trial 14 ngày, Standard 299k, Pro 599k).
  - `apps/web/app/platform/billing/page.tsx`: Theo dõi doanh thu toàn sàn, giao dịch SePay VietQR và cảnh báo hạn dùng.
  - `apps/web/app/platform/integrations/page.tsx`: Quản trị tài khoản nhận tiền SePay VietQR và Webhook kích hoạt tự động.
- Sửa đổi trang 404 Not Found để ưu tiên điều hướng quay lại trang trước (`router.back()`), bảo toàn lịch sử duyệt của người dùng.
- Tuân thủ 100% nguyên tắc thiết kế: Flat Enterprise, bảng màu Calm Jade (`#176b58`) & Warm Ivory (`#f4f7f5`), KHÔNG gradient, KHÔNG icon hoa lá cành, KHÔNG nút "Cửa hàng mẫu".

**Non-Goals:**
- Không can thiệp hoặc thay đổi cấu trúc bảng cơ sở dữ liệu production/staging.
- Không cấu hình các cổng SMS Brandname, Zalo ZNS hay SMTP Gateway (đã được quyết định loại bỏ để giữ cổng Super Admin tinh gọn tuyệt đối).
- Không sửa đổi menu phân quyền của các vai trò cửa hàng (`admin`, `tech`, `qc`, `cskh`, `inventory`).

## Decisions

### Quyết định 1: Tinh gọn cấu trúc dữ liệu Navigation trong `AppSidebar.tsx`
- **Cách thực hiện**:
  - Giữ lại mảng `platformOperationsNav` với 3 mục: `platform-stores` (Danh sách Gian hàng), `platform-approvals` (Duyệt đăng ký), và `platform-plans` (Gói cước & Bản quyền).
  - Rút gọn mảng `platformMonitoringNav` còn 2 mục: `platform-dashboard` (Tổng quan Toàn sàn), và `platform-billing` (Doanh thu SaaS). Xóa bỏ vĩnh viễn mục `platform-quotas`.
  - Thay thế mảng `platformSystemNav` thành `platformRevenueConfigNav` chỉ gồm 1 mục: `platform-integrations` với nhãn "Tài khoản nhận tiền SePay", icon `payments` (hoặc `spark`).
  - Cập nhật JSX render nhóm thứ 3 từ nhãn cũ `KỸ THUẬT HỆ THỐNG` sang nhãn mới `CẤU HÌNH DOANH THU`.
- **Phương án thay thế đã cân nhắc**: Tạo đường dẫn mới `/platform/sepay`.
  - *Lý do bác bỏ*: Giữ nguyên `/platform/integrations` giúp tái sử dụng các route đã định hình trong tài liệu và hệ thống xác thực mà không làm gãy các liên kết nội bộ.

### Quyết định 2: Tối ưu điều hướng trên trang 404 Not Found (`apps/web/app/not-found.tsx`)
- **Cách thực hiện**:
  - Sử dụng hook `useRouter` của Next.js với phương thức `router.back()`.
  - Nhãn nút được đổi thành `← Quay lại trang trước`.
  - Bổ sung một liên kết phụ văn bản nhỏ phía dưới: "Hoặc chuyển về Trang chủ / Tổng quan" trỏ về `/` để đảm bảo trong trường hợp người dùng truy cập trực tiếp URL chết từ tab mới (không có lịch sử duyệt) thì vẫn có lối thoát an toàn.
- **Phương án thay thế đã cân nhắc**: Kiểm tra `document.referrer`.
  - *Lý do bác bỏ*: `router.back()` được hỗ trợ tự nhiên bởi Next.js client router và xử lý tốt cả Single-Page-App history transitions.

### Quyết định 3: Kiến trúc giao diện và State cho 3 màn hình mới
- **Đóng gói chuẩn mực**: Cả 3 trang đều được bọc trong `<AppShell>` với thuộc tính `crumbName` tương ứng, kế thừa Header, User Profile, Mobile Drawer và Notifications.
- **Quản lý dữ liệu linh hoạt (Graceful Degradation)**:
  - Khởi tạo State với dữ liệu tiêu chuẩn thực tế (Initial State) phản ánh đúng mô hình FIXO (Gói Trial, Standard, Pro; giao dịch VietQR SePay mẫu; thông tin tài khoản ngân hàng).
  - Gửi request bất đồng bộ tới backend API `/api/v1/platform/*` khi mount (nếu backend đã triển khai) và hiển thị thông báo trạng thái cập nhật (toast / status badge).
- **Trang Plans (`/platform/plans`)**:
  - Bố cục lưới 3 cột (grid 3 cards) tương ứng 3 gói cước.
  - Mỗi thẻ gói cước có giá niêm yết rõ ràng (0đ, 299.000đ, 599.000đ), chu kỳ thanh toán, huy hiệu "Phổ biến nhất" cho gói Standard (màu xanh Calm Jade phẳng), danh sách tính năng kèm icon check xanh, và nút "Cập nhật quyền lợi".
- **Trang Billing (`/platform/billing`)**:
  - Hàng trên: 4 thẻ KPI thống kê doanh thu (Doanh thu lũy kế, Doanh thu tháng, Gian hàng sắp hết hạn, Tỷ lệ duy trì).
  - Khối cảnh báo: Danh sách các gian hàng cần gia hạn trong 7 ngày tới.
  - Hàng dưới: Bảng dữ liệu giao dịch VietQR SePay toàn sàn có phân trang, bộ lọc tìm kiếm và trạng thái khớp lệnh ("Thành công", "Đang xử lý").
- **Trang Integrations (`/platform/integrations`)**:
  - Form cấu hình 2 cột:
    - Cột trái: Form nhập thông tin ngân hàng thụ hưởng (Ngân hàng, STK, Tên tài khoản) và thông số kỹ thuật SePay (API Token, Webhook URL, Webhook Secret Key). Có nút copy nhanh Webhook URL và nút toggle ẩn/hiện API Token.
    - Cột phải: Khung hiển thị mô phỏng mã VietQR thời gian thực được sinh tự động dựa trên số tài khoản và ngân hàng đã nhập, cùng thẻ trạng thái kết nối Webhook Live (Calm Jade).

### Quyết định 4: Tuân thủ Design Tokens của PodsCare / FIXO
- Màu chủ đạo: Calm Jade `#176b58` (primary), `#eaf4ef` (light active background), `#cde2d6` (subtle border).
- Màu nền: Warm Ivory `#f4f7f5` (shell canvas), `#ffffff` (card background).
- Chữ: `#1c302b` (heading), `#596962` / `#718279` (muted body).
- Bo góc: `rounded-[10px]` cho card, `rounded-[8px]` cho nút và input.
- TUYỆT ĐỐI KHÔNG dùng `bg-gradient-to-*` hoặc bất kỳ CSS gradient nào.

## Risks / Trade-offs

- **[Risk]**: Super Admin truy cập trang 404 bằng liên kết trực tiếp từ trình duyệt mới mà không có trang trước trong lịch sử.
  - **Mitigation**: Thêm liên kết văn bản phụ bên dưới nút `router.back()` cho phép bấm về trang chủ hoặc trang tổng quan an toàn.
- **[Risk]**: Lộ mã bí mật SePay API Token trên màn hình khi thao tác trình chiếu hoặc chia sẻ màn hình.
  - **Mitigation**: Mặc định đặt trường API Token ở dạng `type="password"`, chỉ hiển thị khi Super Admin bấm biểu tượng con mắt.
- **[Risk]**: Backend API cho một số endpoint `/api/v1/platform/*` có thể chưa hoàn thành hoặc chưa sẵn sàng dữ liệu.
  - **Mitigation**: Khởi tạo sẵn bộ dữ liệu mặc định chuẩn mực, xử lý try/catch khi fetch API và không để màn hình bị crash hoặc quay vô tận.

## Migration Plan

1. Áp dụng thay đổi trên `packages/ui/src/organisms/AppSidebar.tsx` và build lại package UI (nếu cần) hoặc rely trên Next.js monorepo workspace resolution.
2. Cập nhật `apps/web/app/not-found.tsx` với logic `router.back()`.
3. Tạo 3 file trang mới trong `apps/web/app/platform/`: `plans/page.tsx`, `billing/page.tsx`, `integrations/page.tsx`.
4. Kiểm thử routing, kiểm tra tính thẩm mỹ và xác thực bằng trình duyệt.
