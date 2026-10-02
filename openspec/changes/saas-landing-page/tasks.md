# Tasks

## 1. Component Scaffolding & Navigation Core

- [x] 1.1 Khởi tạo thư mục `apps/web/app/components/landing/` và index export để chuẩn bị cấu trúc module hóa
- [x] 1.2 Xây dựng component `LandingNavbar.tsx` với sticky header, logo FIXO ("PHẦN MỀM QUẢN LÝ SỬA CHỮA"), smooth scroll tới các anchor (`#features`, `#industries`, `#workflow`, `#pricing`, `#contact`), nút "Tra cứu đơn" (`/track`), nút "Đăng nhập" (`/login`), nút "Dùng thử miễn phí" (`/register`), xử lý trạng thái `isAuthenticated` chuyển sang nút "Vào Dashboard" (`/dashboard`) và Drawer menu trên Mobile; kiểm tra điều hướng anchor và auth toggle
- [x] 1.3 Xây dựng component `LandingFooter.tsx` với logo thương hiệu, mô tả sứ mệnh, các cột liên kết sản phẩm, tài liệu hỗ trợ, pháp lý điều khoản và dòng bản quyền © 2026 FIXO; kiểm tra hiển thị đầy đủ liên kết và layout responsive

## 2. Hero, Value Commitments & Interactive Mockups

- [x] 2.1 Xây dựng component `LandingHero.tsx` bao gồm Eyebrow badge, tiêu đề H1 Manrope, mô tả copywriting, 2 nút CTA ("Dùng thử miễn phí 14 ngày" và "Xem video giới thiệu") cùng 4 khối cam kết giá trị vận hành cốt lõi (Dễ sử dụng, Quản lý mọi lúc, An toàn dữ liệu, Hỗ trợ 7 ngày/tuần); kiểm tra kích hoạt nút CTA và hiển thị icon Calm Jade
- [x] 2.2 Xây dựng component `DashboardMockup.tsx` tái hiện bảng điều khiển Web Console macOS với 3 nút dot điều khiển, sidebar danh mục, 4 thẻ chỉ số KPI, biểu đồ cột doanh thu 10 ngày, biểu đồ tròn tình trạng đơn hàng bằng CSS, kết hợp khung điện thoại 3D floating hiển thị danh sách đơn sửa chữa realtime thuần CSS/SVG; kiểm tra giao diện mockup không bị vỡ trên màn hình nhỏ
- [x] 2.3 Xây dựng component `VideoModal.tsx` popup hiển thị video giới thiệu giải pháp FIXO khi bấm "Xem video giới thiệu", hỗ trợ đóng bằng nút 'x', click backdrop và phím ESC; kiểm tra đóng/mở modal mượt mà và không làm scroll trang ngầm

## 3. Social Proof, Features & Industry Grids

- [x] 3.1 Xây dựng component `TrustBar.tsx` dạng thẻ nổi với 4 thông số tín nhiệm xã hội (500+ Cửa hàng tin dùng, 50.000+ Đơn sửa chữa/tháng, 100.000+ Khách hàng, 4.9/5 Đánh giá); kiểm tra hiển thị phân cách viền và layout 4 cột / 2 cột mobile
- [x] 3.2 Xây dựng component `FeatureGrid.tsx` với bố cục 2 cột (cột trái 280px giới thiệu thông điệp vận hành, cột phải lưới 8 module nghiệp vụ: Đơn sửa chữa, CRM khách hàng, Kho linh kiện, Bảo hành điện tử, Thu chi công nợ, Báo cáo doanh thu, Quản lý nhân viên, Tùy chỉnh dịch vụ) sử dụng 100% icon SVG từ `@podscare/ui`; kiểm tra hiệu ứng hover -3px và bóng đổ
- [x] 3.3 Xây dựng component `IndustryGrid.tsx` hiển thị lưới 6 thẻ ngành hàng công nghệ (Điện thoại, Laptop, Tai nghe, Smartwatch, Tablet, Phụ kiện); kiểm tra hiệu ứng viền đổi màu khi hover và hiển thị chuẩn trên lưới 6 cột desktop / 2 cột mobile

## 4. Standardization Workflow & SaaS Pricing

- [x] 4.1 Xây dựng component `WorkflowSteps.tsx` thể hiện sơ đồ quy trình 4 bước chuẩn hóa (Tiếp nhận -> Kiểm tra & Báo giá -> Sửa chữa -> Giao máy & Bảo hành) với số thứ tự tròn màu Calm Jade và mô tả chi tiết; kiểm tra thứ tự tuần tự và responsive
- [x] 4.2 Xây dựng component `PricingSection.tsx` hiển thị bảng 3 gói cước SaaS thực tế đồng bộ với hệ thống: Gói Dùng thử (0đ / 14 ngày) trỏ tới `/register?plan=trial`, Gói Tiêu chuẩn (299.000đ / tháng) trỏ tới `/register?plan=standard`, Gói Chuyên nghiệp (599.000đ / tháng) trỏ tới `/register?plan=pro`, làm nổi bật gói Tiêu chuẩn với badge "Phổ biến nhất"; kiểm tra tham số query plan truyền đúng khi click
- [x] 4.3 Xây dựng component `CTASection.tsx` biểu ngữ chuyển đổi chốt trang với nền Dark Forest `#102d35`, hiệu ứng ánh sáng jade mờ và nút CTA chuyển đổi tới trang đăng ký dùng thử; kiểm tra độ tương phản văn bản và nút bấm

## 5. Page Composition, Integration & Verification

- [x] 5.1 Tái cấu trúc file `apps/web/app/page.tsx` thành master controller tích hợp toàn bộ 11 components trong `components/landing/`, quản lý trạng thái mở VideoModal, smooth scroll offset (`scroll-mt-20`) và liên kết context xác thực `usePodsCare`
- [x] 5.2 Cấu hình SEO metadata hoàn chỉnh (Title: "FIXO — Phần mềm quản lý cửa hàng sửa chữa", description, OpenGraph, viewport) cho trang chủ
- [x] 5.3 Chạy kiểm tra TypeScript và biên dịch toàn diện ứng dụng web bằng lệnh `pnpm --filter web build`; đảm bảo 0 lỗi type-check và bundle hoàn thành thành công
- [x] 5.4 Kiểm tra hiển thị responsive và luồng thao tác trên trình duyệt (desktop 1280px, tablet 768px, mobile 375px), xác nhận tất cả anchor link, modal video và CTA hoạt động trơn tru
