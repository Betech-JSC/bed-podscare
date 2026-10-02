# Design: B2B SaaS Landing Page Architecture

## Context

Trang web hiện tại (`apps/web/app/page.tsx`) là một file đơn khối 844 dòng chứa mã nguồn giao diện mô tả một cửa hàng sửa chữa đơn lẻ. Dự án đang vận hành với Next.js App Router trong monorepo Turborepo, chia sẻ thư viện `@podscare/ui` và hệ thống token Tailwind (`packages/config-tailwind/tailwind.preset.js`).

Xem `proposal.md` để nắm rõ bối cảnh và động lực thay đổi từ trang dịch vụ đơn lẻ sang nền tảng B2B SaaS cho thương hiệu FIXO. 

Các ràng buộc kỹ thuật cốt lõi:
- **Design Tokens**: Màu Calm Jade (`#176b58` / `#176b51`), Dark Forest (`#102d35`), Canvas (`#f6f8f6`), Card (`#ffffff`), Border (`#e6ebe8`), Text (`#1f2937`).
- **Typography**: Manrope cho tiêu đề/KPI và DM Sans cho văn bản nội dung.
- **Biểu tượng**: Bắt buộc dùng component `<Icon name="..." />` từ `@podscare/ui`.
- **Hiệu năng**: Tối ưu Core Web Vitals (LCP, CLS) bằng việc không dùng ảnh bitmap nặng nề cho các khung mô phỏng dashboard.

## Goals / Non-Goals

**Goals:**
- Tách nhỏ mã nguồn thành 11 components độc lập, có thể tái sử dụng và kiểm thử độc lập tại `apps/web/app/components/landing/`.
- Tái hiện khung Dashboard Web Console (macOS window) và Mobile Frame 3D hoàn toàn bằng thuần CSS và SVG vector, đảm bảo tốc độ tải tức thì và sắc nét trên mọi màn hình Retina.
- Tích hợp bảng giá 3 gói cước SaaS chuẩn hóa (Dùng thử 0đ, Tiêu chuẩn 299.000đ, Chuyên nghiệp 599.000đ) liên kết trực tiếp tới trang đăng ký với query param (`/register?plan=trial|standard|pro`).
- Tích hợp trạng thái đăng nhập linh hoạt (`isAuthenticated` qua `usePodsCare`), tự động hiển thị link chuyển tiếp vào `/dashboard` cho người dùng hiện tại.
- Hỗ trợ mượt mà thanh điều hướng cuộn trang (smooth anchor scrolling) với bù trừ chiều cao sticky navbar (`scroll-mt-20`).
- Tối ưu SEO metadata hoàn chỉnh (Title, Meta Description, OpenGraph, Canonical) trong Next.js App Router.

**Non-Goals:**
- Không sửa đổi cấu trúc Database hay chạy migration (đây là tầng giao diện presentation).
- Không nhúng luồng thanh toán SePay/Stripe trực tiếp vào Landing Page (việc thanh toán sẽ diễn ra tại trang checkout sau khi tạo tài khoản).
- Không can thiệp vào logic xác thực nội bộ của `/login` và `/register`.

## Architecture & Component Breakdown

```
apps/web/app/
├── page.tsx                           # Master Composition Page (Client Controller)
└── components/
    └── landing/
        ├── LandingNavbar.tsx          # Sticky Header + Desktop Nav + Mobile Drawer + Auth
        ├── LandingHero.tsx            # Eyebrow + H1 + CTA Buttons + 4 Value Props
        ├── DashboardMockup.tsx        # Pure CSS macOS Web Console + 3D Floating Mobile Frame
        ├── TrustBar.tsx               # 4 Quantified Social Proof Stats (Floating Card)
        ├── FeatureGrid.tsx            # 2-Column Layout (Intro + 8 Business Modules)
        ├── IndustryGrid.tsx           # 6 Technology Device Categories
        ├── WorkflowSteps.tsx          # 4-Step Standardized Repair Operation Process
        ├── PricingSection.tsx         # 3 SaaS Pricing Cards (Trial, Standard, Pro)
        ├── CTASection.tsx             # Dark Forest Conversion Banner (#102d35)
        ├── LandingFooter.tsx          # Brand Logo, Multi-column Links & Legal Info
        └── VideoModal.tsx             # Interactive Video Player Dialog with Backdrop & ESC
```

## Decisions

### 1. Phân rã Component trong `apps/web/app/components/landing/`
- **Lý do**: File cũ `page.tsx` quá dài (844 dòng), trộn lẫn header, hero, process, services, branch list và footer khiến việc bảo trì, tối ưu hóa CSS và viết test case độc lập rất khó khăn. Việc tách thành 11 components giúp mỗi thành phần đảm nhiệm duy nhất một chức năng (Single Responsibility Principle).
- **Giải pháp thay thế đã cân nhắc**: Giữ nguyên một file duy nhất hoặc chỉ tách 2-3 components lớn. Bị loại bỏ vì không đáp ứng tính module hóa và gây khó khăn khi tinh chỉnh giao diện.

### 2. Dựng Mockup macOS Web Console & Điện thoại 3D hoàn toàn bằng CSS/SVG
- **Lý do**: Sử dụng ảnh chụp màn hình PNG/JPEG thường nặng từ 500KB - 2MB, làm giảm điểm số LCP (Largest Contentful Paint) và bị vỡ nét trên màn hình 4K/Retina. Bằng cách dùng CSS Flexbox/Grid, border-radius và SVG, mockup có dung lượng dưới 5KB, tải tức thì, dễ dàng tùy biến thông số số liệu (Doanh thu, Đơn hàng) mà không cần xuất lại ảnh đồ họa.
- **Giải pháp thay thế đã cân nhắc**: Chụp ảnh màn hình Figma hoặc render ảnh WebP. Bị loại bỏ vì dung lượng nặng và thiếu tính linh hoạt khi thay đổi dữ liệu demo.

### 3. Đồng bộ 3 Gói Cước SaaS và Đường Dẫn Đăng Ký
- **Lý do**: Mô hình kinh doanh của FIXO là B2B SaaS phục vụ các cửa hàng sửa chữa từ nhỏ đến chuỗi lớn:
  - Gói Dùng thử: 0đ / 14 ngày (Dành cho chủ cửa hàng muốn kiểm nghiệm tính năng).
  - Gói Tiêu chuẩn: 299.000đ / tháng (Dành cho 1 cửa hàng độc lập, giới hạn nhân viên cơ bản).
  - Gói Chuyên nghiệp: 599.000đ / tháng (Dành cho chuỗi chi nhánh, phân quyền nâng cao và báo cáo chuyên sâu).
  Các nút CTA sẽ truyền query parameter trực tiếp: `/register?plan=trial`, `/register?plan=standard`, `/register?plan=pro` giúp trang đăng ký tự động chọn trước gói cước mong muốn.
- **Giải pháp thay thế đã cân nhắc**: Chỉ hiển thị 1 nút đăng ký chung không có thông tin gói. Bị loại bỏ vì làm giảm trải nghiệm chuyển đổi (conversion rate).

### 4. Quy tắc sử dụng Biểu Tượng và Design Tokens
- **Lý do**: Tuân thủ triệt để kỹ năng `podscare-design-system`:
  - 100% icon SVG được gọi từ `<Icon name="..." />` trong `@podscare/ui` (`repairs`, `customers`, `inventory`, `warranty`, `payments`, `kpi`, `users`, `wrench`, `check`, `search`, `menu`, `close`, `star`, `arrow`).
  - Nền toàn trang: Canvas `#f6f8f6`.
  - Khối điểm nhấn tối: Dark Forest `#102d35` (dùng cho CTA section, Logo box, Sidebar mockup).
  - Khối nhận diện chính: Calm Jade `#176b58` (cho các nút primary, active state, checkmarks).
  - Không sử dụng các dải gradient đa sắc lòe loẹt; chỉ sử dụng viền mỏng tinh tế (`#e6ebe8`) và shadow mềm (`rgba(16, 37, 31, 0.08)`).

### 5. VideoModal Tương tác với Khả năng Tiếp cận (Accessibility)
- **Lý do**: Giúp khách hàng xem nhanh video giới thiệu mà không bị chuyển hướng khỏi trang. Modal hỗ trợ:
  - Khóa cuộn trang (scroll lock) khi đang mở.
  - Hỗ trợ phím Escape (ESC) để thoát.
  - Đóng khi nhấp chuột ra ngoài vùng nền (backdrop click).
  - Trọng tâm tiêu điểm (focus trap) thân thiện với bàn phím.

## Risks / Trade-offs

| Rủi ro (Risk) | Khả năng | Mức độ | Biện pháp giảm thiểu (Mitigation) |
| :--- | :--- | :--- | :--- |
| Tràn viền (Horizontal Overflow) của Mockup điện thoại nổi trên màn hình di động nhỏ (< 400px) | Trung bình | Vừa | Áp dụng CSS media query `@media (max-width: 768px)` để ẩn hoặc chuyển điện thoại nổi xuống dưới dashboard console theo luồng dọc tự nhiên. |
| Xung đột vị trí cuộn trang do Sticky Navbar che khuất tiêu đề section | Thấp | Nhỏ | Thiết lập thuộc tính `scroll-mt-20` (scroll margin top ~80px) trên toàn bộ các section đích (`#features`, `#industries`, `#workflow`, `#pricing`, `#contact`). |
| Hydration mismatch do kiểm tra `isAuthenticated` từ client storage/cookie | Thấp | Vừa | Sử dụng hook `usePodsCare` chuẩn đã bọc trong `ClientProvider`, có trạng thái `isLoaded`/mặc định an toàn trước khi mount. |

## Migration & Deployment Plan

1. Tạo thư mục `apps/web/app/components/landing/`.
2. Tạo lần lượt 11 components theo đặc tả kỹ thuật.
3. Thay thế nội dung `apps/web/app/page.tsx` thành bản composition mỏng.
4. Kiểm tra TypeScript và Build thử nghiệm: `pnpm --filter web build`.
5. Không cần can thiệp rollback cơ sở dữ liệu vì thay đổi thuần túy ở frontend presentation.
