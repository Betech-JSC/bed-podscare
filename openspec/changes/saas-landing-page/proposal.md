# Proposal: B2B SaaS Landing Page for FIXO

## Why

Trang đích hiện tại (`apps/web/app/page.tsx`) đang được định hình như website của một cửa hàng sửa chữa đơn lẻ (với dịch vụ phòng lab, quy trình QC tai nghe, danh sách chi nhánh cục bộ), không còn phù hợp với định hướng chiến lược của FIXO: nền tảng B2B SaaS toàn diện quản lý cửa hàng sửa chữa thiết bị công nghệ (điện thoại, laptop, tai nghe, smartwatch, tablet, phụ kiện). 

Để thúc đẩy chuyển đổi khách hàng doanh nghiệp và cửa hàng sửa chữa (B2B SaaS conversion), FIXO cần một Landing Page hiện đại, chuẩn hóa theo nguyên mẫu gốc tại `preview.html`. Trang đích mới sẽ truyền tải rõ ràng giá trị giải pháp, cấu trúc 8 module quản lý cốt lõi, quy trình tiếp nhận chuẩn hóa, niềm tin xã hội (social proof), và bảng giá 3 gói cước rõ ràng (Dùng thử 0đ, Tiêu chuẩn 299k/tháng, Chuyên nghiệp 599k/tháng), đồng thời tuân thủ nghiêm ngặt PodsCare Design System.

## What Changes

- **Thay thế hoàn toàn cấu trúc monolithic cũ tại `apps/web/app/page.tsx`**: Tái cấu trúc thành trang điều phối mỏng (slim composition) tích hợp 11 component con độc lập trong thư mục `apps/web/app/components/landing/`.
- **Kiến trúc Component chuẩn hóa trong `apps/web/app/components/landing/`**:
  - `LandingNavbar.tsx`: Sticky navigation bar, logo thương hiệu FIXO ("PHẦN MỀM QUẢN LÝ SỬA CHỮA"), smooth scroll tới anchor sections (`#features`, `#industries`, `#pricing`, `#contact`), nút "Tra cứu đơn" (`/track`), nút "Đăng nhập" (`/login`), nút CTA "Dùng thử miễn phí" (`/register`), và Drawer navigation mượt mà cho Mobile.
  - `LandingHero.tsx`: Phần mở đầu với Eyebrow badge, tiêu đề H1 ấn tượng, thông điệp giá trị, 2 nút hành động chính ("Dùng thử miễn phí 14 ngày", "Xem video giới thiệu"), cùng 4 khối cam kết chất lượng (Dễ sử dụng, Quản lý mọi lúc, An toàn dữ liệu, Hỗ trợ tận tâm 7 ngày/tuần).
  - `DashboardMockup.tsx`: Khung giả lập giao diện Web Console phong cách macOS window 3 nút chấm màu (hiển thị KPI cards, biểu đồ cột doanh thu theo ngày, biểu đồ tròn tình trạng đơn) và khung điện thoại thông minh 3D floating (Mobile Frame) hiển thị đơn sửa chữa realtime thuần CSS/SVG không phụ thuộc ảnh bitmap nặng.
  - `TrustBar.tsx`: Thanh chỉ số tín nhiệm xã hội (Social Proof) dạng floating card: 500+ Cửa hàng tin dùng, 50.000+ Đơn sửa chữa/tháng, 100.000+ Khách hàng phục vụ, 4.9/5 Đánh giá hài lòng.
  - `FeatureGrid.tsx`: Bố cục 2 cột (Cột giới thiệu 280px và lưới 8 modules nghiệp vụ: Quản lý đơn sửa chữa, CRM khách hàng, Quản lý linh kiện, Quản lý bảo hành, Thu chi & công nợ, Báo cáo doanh thu, Quản lý nhân viên, Tùy chỉnh linh hoạt).
  - `IndustryGrid.tsx`: Lưới 6 nhóm ngành hàng thiết bị công nghệ hỗ trợ (Điện thoại, Laptop, Tai nghe, Đồng hồ thông minh, Máy tính bảng, Phụ kiện).
  - `WorkflowSteps.tsx`: Sơ đồ quy trình 4 bước chuẩn hóa vận hành cửa hàng (1. Tiếp nhận -> 2. Kiểm tra & Báo giá -> 3. Sửa chữa -> 4. Giao máy & Bảo hành).
  - `PricingSection.tsx`: Bảng cước SaaS 3 gói dịch vụ thực tế minh bạch:
    * **Gói Dùng thử**: 0đ / 14 ngày (Đầy đủ tính năng trải nghiệm) -> CTA trỏ tới `/register?plan=trial`.
    * **Gói Tiêu chuẩn**: 299.000đ / tháng (Phù hợp cửa hàng đơn lẻ) -> CTA trỏ tới `/register?plan=standard`.
    * **Gói Chuyên nghiệp**: 599.000đ / tháng (Phù hợp chuỗi và cửa hàng lớn) -> CTA trỏ tới `/register?plan=pro`.
  - `CTASection.tsx`: Banner kêu gọi chuyển đổi chốt trang với nền Dark Forest `#102d35` thanh lịch, tiêu đề lớn và nút hành động nổi bật.
  - `LandingFooter.tsx`: Chân trang thương hiệu chứa logo FIXO, mô tả sứ mệnh, cột điều hướng nhóm sản phẩm, hỗ trợ, công ty và dòng bản quyền © 2026 FIXO.
  - `VideoModal.tsx`: Popup Modal tương tác hiển thị khung video giới thiệu giải pháp khi người dùng bấm "Xem video giới thiệu" từ Hero banner, hỗ trợ phím ESC và bấm backdrop để đóng.
- **Tích hợp trạng thái đăng nhập thông minh**:
  - Nhận diện `isAuthenticated` từ `usePodsCare()`: Tự động chuyển đổi các nút CTA thành "Vào Dashboard" (`/dashboard`) nếu người dùng đã đăng nhập.
  - Nút "Tra cứu đơn" dẫn trực tiếp tới `/track` phục vụ khách hàng cuối tra cứu tiến độ sửa chữa.
- **Tuân thủ PodsCare Design System**:
  - Bảng màu: Calm Jade (`#176b58` / `#176b51`), Dark Forest (`#102d35`), Warm Canvas (`#f6f8f6`), Card surface (`#ffffff`), Border (`#e6ebe8`).
  - Typography: Font Manrope cho Headings và KPIs; font DM Sans cho Body text.
  - Icons: Tận dụng 100% icon SVG chuẩn từ thư viện `@podscare/ui` (`<Icon name="..." />`).
  - Tuyệt đối loại bỏ các gradient lòe loẹt, chỉ sử dụng nền phẳng hoặc radial ánh sáng jade nhẹ nhàng.

## Capabilities

### New Capabilities
- `landing-page`: B2B SaaS Landing Page cho nền tảng quản lý sửa chữa FIXO với đầy đủ các phân khu thành phần, bảng giá 3 gói cước, giao diện mockup console/mobile bằng CSS, navigation mượt mà và tối ưu hóa SEO / responsive.

### Modified Capabilities
<!-- Không có capability nào bị thay đổi requirement sẵn có do đây là trang landing SaaS đầu tiên được chuẩn hóa specs -->

## Impact

- **Mã nguồn Frontend**:
  - `apps/web/app/page.tsx`: Cập nhật cấu trúc page.
  - `apps/web/app/components/landing/`: Thêm mới 11 components giao diện.
- **Phụ thuộc nội bộ**:
  - Tái sử dụng `Icon` từ `@podscare/ui`.
  - Tái sử dụng hook `usePodsCare` từ `apps/web/app/providers.tsx` để xác thực phiên đăng nhập.
  - Điều hướng tới các route sẵn có: `/login`, `/register`, `/track`, `/dashboard`.
- **Hiệu năng & Tương thích**:
  - Cải thiện LCP nhờ không phụ thuộc ảnh mockup chụp màn hình nặng nề; vẽ mockup hoàn toàn bằng CSS và SVG tinh gọn.
  - Chuẩn hóa Responsive toàn diện từ 320px (Mobile) tới 1440px (Ultra-wide Desktop).
