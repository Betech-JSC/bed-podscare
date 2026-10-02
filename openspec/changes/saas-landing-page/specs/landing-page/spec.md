# Spec Delta: SaaS Landing Page

## Purpose

Cung cấp giao diện Landing Page B2B SaaS chính thức cho nền tảng FIXO tại trang chủ, tối ưu hóa tỷ lệ chuyển đổi khách hàng doanh nghiệp sửa chữa thông qua cấu trúc giới thiệu trực quan, minh bạch bảng giá 3 gói cước và tích hợp mockup tương tác.

## ADDED Requirements

### Requirement: Sticky Navbar and Global Navigation
Hệ thống SHALL hiển thị thanh điều hướng cố định (sticky navigation bar) ở phía trên cùng của trang web với nền bán trong suốt blur, logo FIXO ("PHẦN MỀM QUẢN LÝ SỬA CHỮA"), danh sách liên kết neo trượt mượt mà (smooth scrolling) tới các phần nội dung chính, nút tra cứu nhanh đơn hàng và các nút chuyển hướng tài khoản phù hợp với trạng thái xác thực.

#### Scenario: Desktop navigation and smooth scroll
- **WHEN** Người dùng trên màn hình máy tính (>= 1024px) nhấp vào một trong các liên kết "Tính năng", "Ngành nghề", "Quy trình", "Bảng giá" hoặc "Liên hệ"
- **THEN** Trình duyệt cuộn mượt mà (smooth scroll) tới đúng anchor ID tương ứng (`#features`, `#industries`, `#workflow`, `#pricing`, `#contact`) mà không làm tải lại trang

#### Scenario: Guest user navigation actions
- **WHEN** Người dùng chưa đăng nhập truy cập vào thanh điều hướng
- **THEN** Hệ thống hiển thị nút "Tra cứu đơn" dẫn tới `/track`, nút "Đăng nhập" dẫn tới `/login`, và nút CTA chính "Dùng thử miễn phí" dẫn tới `/register`

#### Scenario: Authenticated user navigation state
- **WHEN** Người dùng đã đăng nhập vào hệ thống (`isAuthenticated = true`)
- **THEN** Hệ thống thay thế nút "Đăng nhập" bằng nút "Vào Dashboard" trỏ trực tiếp tới `/dashboard`

#### Scenario: Mobile drawer navigation toggle
- **WHEN** Người dùng trên thiết bị di động (< 1024px) nhấn vào nút biểu tượng Hamburger Menu
- **THEN** Hệ thống mở Drawer trượt xuống chứa đầy đủ các liên kết điều hướng và nút thao tác, đồng thời tự động đóng Drawer khi người dùng bấm chọn một mục hoặc bấm nút đóng

---

### Requirement: SaaS Hero Section with Core Value Propositions
Hệ thống SHALL hiển thị phần Hero banner ấn tượng giới thiệu định vị sản phẩm phần mềm quản lý cửa hàng sửa chữa thiết bị công nghệ FIXO, cung cấp 2 nút kêu gọi hành động (CTA) và 4 cam kết giá trị vận hành cốt lõi.

#### Scenario: Hero banner CTA execution
- **WHEN** Khách truy cập nhấp vào nút "Dùng thử miễn phí 14 ngày" tại Hero banner
- **THEN** Hệ thống chuyển hướng người dùng tới trang `/register?plan=trial` để bắt đầu đăng ký gói dùng thử

#### Scenario: Trigger video demonstration popup
- **WHEN** Khách truy cập nhấp vào nút "Xem video giới thiệu" tại Hero banner
- **THEN** Hệ thống mở cửa sổ tương tác (VideoModal) hiển thị nội dung giới thiệu giải pháp FIXO

#### Scenario: Display 4 operational value commitments
- **WHEN** Khách truy cập quan sát chân phần Hero banner
- **THEN** Hệ thống hiển thị đầy đủ 4 khối cam kết: "Dễ sử dụng" (Bắt đầu ngay), "Quản lý mọi lúc" (Máy tính & điện thoại), "An toàn dữ liệu" (Sao lưu tự động), và "Hỗ trợ tận tâm" (7 ngày/tuần) với icon chuẩn và màu sắc Calm Jade

---

### Requirement: Interactive Dashboard and Mobile Frame Mockups
Hệ thống SHALL giả lập trực quan bảng điều khiển quản trị FIXO Web Console phong cách macOS và khung thiết bị di động 3D nổi (Mobile Frame) bằng thuần CSS/SVG, minh họa trực quan các chỉ số KPI, biểu đồ doanh thu, biểu đồ tỷ lệ đơn hàng và danh sách phiếu sửa chữa thời gian thực.

#### Scenario: Web Console window rendering
- **WHEN** Khách truy cập quan sát khu vực mockup trên màn hình
- **THEN** Hệ thống hiển thị khung cửa sổ macOS với 3 nút điều khiển (dot), thanh sidebar menu chức năng, 4 thẻ chỉ số KPI (Doanh thu, Đơn sửa chữa, Khách hàng mới, Linh kiện tồn), biểu đồ cột doanh thu 10 ngày và biểu đồ tròn tình trạng đơn hàng bằng CSS

#### Scenario: Floating 3D Mobile Frame display
- **WHEN** Khách truy cập quan sát góc phải của Dashboard mockup
- **THEN** Hệ thống hiển thị khung điện thoại thông minh viền bo tròn 3D chứa danh sách các đơn sửa chữa thực tế với mã phiếu (`#FX0001223`), tên khách hàng và badge trạng thái nghiệp vụ chuẩn màu

---

### Requirement: Trust Indicators and Social Proof
Hệ thống SHALL hiển thị thanh chỉ số tín nhiệm xã hội (TrustBar) dạng thẻ nổi bắc cầu giữa Hero và Features, thống kê các con số định lượng khẳng định độ tin cậy của phần mềm.

#### Scenario: Social proof metrics display
- **WHEN** Khách truy cập cuộn qua khu vực tiếp giáp giữa Hero và Features
- **THEN** Hệ thống hiển thị chính xác 4 chỉ số: 500+ Cửa hàng tin dùng, 50.000+ Đơn sửa chữa/tháng, 100.000+ Khách hàng được phục vụ, và 4.9/5 Đánh giá từ khách hàng

---

### Requirement: Comprehensive 8-Module Feature Grid
Hệ thống SHALL bố trí khu vực tính năng (FeatureGrid) theo bố cục 2 cột: cột trái (280px) tóm tắt triết lý "Quản lý đơn giản, Vận hành hiệu quả" và cột phải gồm lưới thẻ 8 module nghiệp vụ chuyên sâu cho cửa hàng sửa chữa.

#### Scenario: 8 business modules rendering
- **WHEN** Khách truy cập xem phần Tính năng nổi bật
- **THEN** Hệ thống hiển thị đầy đủ 8 thẻ tính năng với icon SVG chuẩn từ `@podscare/ui`:
  1. Quản lý đơn sửa chữa (`repairs`)
  2. Quản lý khách hàng (`customers`)
  3. Quản lý linh kiện (`inventory`)
  4. Quản lý bảo hành (`warranty`)
  5. Thu chi & công nợ (`payments`)
  6. Báo cáo doanh thu (`kpi`)
  7. Quản lý nhân viên (`users`)
  8. Tùy chỉnh linh hoạt (`wrench`)

#### Scenario: Feature card hover micro-interaction
- **WHEN** Người dùng di chuột (hover) qua bất kỳ thẻ tính năng nào
- **THEN** Thẻ tính năng nâng nhẹ theo trục Y (-3px) và đổ bóng nổi bật mềm mại

---

### Requirement: Multi-Industry Applicability Grid
Hệ thống SHALL hiển thị phân khu ngành nghề (IndustryGrid) chứng minh khả năng áp dụng linh hoạt của FIXO cho 6 nhóm thiết bị công nghệ phổ biến.

#### Scenario: Six tech industries display
- **WHEN** Khách truy cập cuộn tới phần Ngành nghề (`#industries`)
- **THEN** Hệ thống hiển thị lưới 6 ngành hàng: Điện thoại (iPhone, Samsung...), Laptop (MacBook, Windows...), Tai nghe (AirPods, Sony...), Đồng hồ thông minh (Apple Watch...), Máy tính bảng (iPad...), và Phụ kiện (Sạc, Cáp...)

---

### Requirement: Four-Step Standardization Workflow
Hệ thống SHALL hiển thị quy trình chuẩn hóa 4 bước từ tiếp nhận thiết bị tới khi bàn giao và kích hoạt bảo hành điện tử (WorkflowSteps).

#### Scenario: Sequential workflow rendering
- **WHEN** Khách truy cập xem phần Quy trình vận hành
- **THEN** Hệ thống hiển thị 4 bước tuần tự có đánh số thứ tự từ 1 đến 4:
  - Bước 1: Tiếp nhận (Tạo phiếu sửa chữa và lưu thông tin khách hàng)
  - Bước 2: Kiểm tra & báo giá (Kỹ thuật viên kiểm tra thiết bị và cập nhật báo giá)
  - Bước 3: Sửa chữa (Theo dõi linh kiện, kỹ thuật viên và tiến độ)
  - Bước 4: Giao máy & bảo hành (Thanh toán, giao máy và tự động lưu lịch sử bảo hành)

---

### Requirement: Transparent 3-Tier SaaS Pricing Matrix
Hệ thống SHALL cung cấp bảng giá SaaS minh bạch (PricingSection) gồm 3 gói cước rõ ràng (Dùng thử, Tiêu chuẩn, Chuyên nghiệp), hỗ trợ lựa chọn gói cước và tự động gắn tham số `plan` vào đường dẫn đăng ký.

#### Scenario: Select Trial plan
- **WHEN** Khách hàng nhấn nút chọn gói "Dùng thử" (0đ / 14 ngày)
- **THEN** Hệ thống điều hướng tới `/register?plan=trial`

#### Scenario: Select Standard plan
- **WHEN** Khách hàng nhấn nút chọn gói "Tiêu chuẩn" (299.000đ / tháng)
- **THEN** Hệ thống điều hướng tới `/register?plan=standard`

#### Scenario: Select Professional plan
- **WHEN** Khách hàng nhấn nút chọn gói "Chuyên nghiệp" (599.000đ / tháng)
- **THEN** Hệ thống điều hướng tới `/register?plan=pro`

#### Scenario: Highlight recommended plan
- **WHEN** Bảng giá được hiển thị trên giao diện
- **THEN** Gói "Tiêu chuẩn" hoặc gói trọng tâm được đánh dấu nổi bật (badge "Phổ biến nhất" hoặc viền Calm Jade) để thu hút quyết định mua hàng

---

### Requirement: Bottom Conversion CTA and Brand Footer
Hệ thống SHALL hiển thị khối biểu ngữ kêu gọi hành động cuối trang (CTASection) với nền Dark Forest `#102d35` và chân trang (LandingFooter) chứa đầy đủ thông tin thương hiệu, liên kết dịch vụ, chính sách và bản quyền.

#### Scenario: Final conversion CTA trigger
- **WHEN** Khách truy cập cuộn đến cuối trang và nhấp nút "Dùng thử FIXO miễn phí"
- **THEN** Hệ thống chuyển hướng tới `/register?plan=trial`

#### Scenario: Footer brand and legal navigation
- **WHEN** Khách truy cập xem chân trang (`#contact`)
- **THEN** Hệ thống hiển thị logo FIXO, câu giới thiệu giải pháp, các cột liên kết "Sản phẩm", "Hỗ trợ", "Công ty" và dòng xác nhận bản quyền "© 2026 FIXO. All rights reserved."

---

### Requirement: Video Demonstration Modal
Hệ thống SHALL cung cấp hộp thoại popup (VideoModal) khi người dùng yêu cầu xem video giới thiệu giải pháp từ bất kỳ vị trí kích hoạt nào trên trang đích.

#### Scenario: Open video modal
- **WHEN** Người dùng bấm nút "Xem video giới thiệu"
- **THEN** Modal hiển thị ở giữa màn hình với lớp nền backdrop tối mờ mịt và khung phát video giới thiệu có nút đóng

#### Scenario: Close video modal via multiple inputs
- **WHEN** Video modal đang mở và người dùng nhấn nút 'x', hoặc nhấp ra ngoài vùng backdrop, hoặc nhấn phím Escape (ESC)
- **THEN** Hệ thống đóng modal và đưa trang về trạng thái duyệt bình thường

---

### Requirement: Responsive Layout and Mobile Adaptability
Giao diện Landing Page B2B SaaS SHALL tương thích hoàn hảo trên mọi kích thước màn hình từ điện thoại thông minh (320px - 767px), máy tính bảng (768px - 1023px) đến máy tính để bàn (>= 1024px).

#### Scenario: Mobile viewport responsiveness (< 768px)
- **WHEN** Người dùng truy cập trang với kích thước màn hình nhỏ hơn 768px
- **THEN** Hệ thống chuyển Feature Grid thành 1 cột, Industry Grid thành 2 cột, Workflow Steps thành 1 cột, Trust Grid thành 2 cột, và chuyển Dashboard mockup sang chế độ hiển thị thu gọn không bị tràn viền (horizontal overflow)
