# Design: Brand Logo Standardization to FIXO

## Context

Hệ thống PodsCare Repair OS hiện đang sử dụng logo placeholder bằng CSS thuần (hình chữ nhật xanh `#196d52` chứa 2 vạch bo tròn nghiêng `-rotate-[25deg]`) tại nhiều vị trí: `AppSidebar.tsx`, `login/page.tsx`, `page.tsx` (Header & Footer). Ngoài ra, `apps/web/app/layout.tsx` khai báo `icon: '/icon.svg'` nhưng file này không tồn tại trong thư mục tĩnh, dẫn đến lỗi 404 cho favicon trên tab trình duyệt.

Người dùng đã cung cấp file ảnh Logo FIXO chính thức (`media_1790840341004.png`) với thiết kế chất lượng cao (1024x1024, RGBA) mang màu sắc chủ đạo xanh thẫm và xanh ngọc biểu tượng chữ FIXO cách điệu cờ-lê.

## Goals / Non-Goals

**Goals:**
- Tạo bộ tài nguyên logo hoàn chỉnh trong `apps/web/public/` và `apps/web/app/`:
  - `logo.png`, `brand/fixo-logo.png`
  - `icon.png`, `apple-icon.png`, `favicon.ico`
- Cấu hình Next.js App Router metadata để tab trình duyệt và bookmark hiển thị icon chính xác.
- Thay thế triệt để các khối CSS box cũ bằng thẻ `<img>` sử dụng ảnh logo thật tại:
  - Sidebar Header (`AppSidebar.tsx`)
  - Login Page (`apps/web/app/login/page.tsx`)
  - Landing Page Header & Footer (`apps/web/app/page.tsx`)
  - Print Page Header (`apps/web/app/print/[id]/page.tsx`)
- Đảm bảo responsive, bo góc mượt mà (`rounded-[8px]` đến `rounded-[12px]`), shadow tinh tế chuẩn design system.

**Non-Goals:**
- Không thay đổi logic xác thực, logic phân quyền hay API backend.
- Không thay đổi bảng màu Calm Jade chủ đạo của giao diện nghiệp vụ.

## Decisions

### 1. Chuẩn hóa đường dẫn tài nguyên tĩnh & Next.js 14 Conventions
- **Quyết định**:
  - Lưu file gốc chất lượng cao vào `apps/web/public/logo.png` và `apps/web/public/brand/fixo-logo.png`.
  - Đặt file `apps/web/app/icon.png` và `apps/web/app/apple-icon.png` theo quy ước Next.js 14 App Router (tự động inject các thẻ `<link rel="icon">` và `<link rel="apple-touch-icon">` chuẩn SEO và PWA).
  - Cập nhật `metadata.icons` trong `apps/web/app/layout.tsx` với icon: `/icon.png`, apple: `/apple-icon.png`, shortcut: `/favicon.ico`.
- **Lý do**: Đảm bảo tương thích tối đa với mọi trình duyệt, tab title, bookmark và mobile homescreen.

### 2. Định dạng kích thước và hiển thị thẻ ảnh trên các màn hình
- **AppSidebar (`packages/ui/src/organisms/AppSidebar.tsx`)**:
  - Kích thước `w-8 h-8 rounded-[8px] object-cover shadow-sm flex-none`.
  - Thay thế khối CSS 2 vạch cũ.
- **Login Page (`apps/web/app/login/page.tsx`)**:
  - Kích thước `w-14 h-14 rounded-[12px] object-cover shadow-md mb-3`.
  - Nằm trung tâm trên tiêu đề và thông tin form đăng nhập.
- **Landing Page (`apps/web/app/page.tsx`)**:
  - Header: `w-10 h-10 rounded-[10px] object-cover shadow-sm`.
  - Footer: `w-8 h-8 rounded-[8px] object-cover shadow-xs`.
- **Print Receipt (`apps/web/app/print/[id]/page.tsx`)**:
  - Header phiếu in: Thêm `<img src="/logo.png" alt="FIXO" className="w-10 h-10 print:w-8 print:h-8 rounded-[6px] object-cover mr-2.5 flex-none" />` trong container tiêu đề flex.

## Risks / Trade-offs

- **[Risk] Bộ nhớ đệm (Cache) của trình duyệt lưu favicon cũ**
  → *Mitigation*: Khai báo song song cả Next.js App Router `app/icon.png` lẫn thẻ metadata trong `layout.tsx` kèm timestamp hoặc file mới, đồng thời cung cấp cả `favicon.ico` và `icon.png`.
- **[Risk] Vỡ layout khi in phiếu tiếp nhận (Print Media)**
  → *Mitigation*: Định rõ kích thước `print:w-8 print:h-8` và `object-cover` để khi xuất bản in A4/A5 hoặc nhiệt (thermal) không bị lệch căn lề.
