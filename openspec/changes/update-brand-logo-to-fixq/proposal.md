# Proposal: Update Brand Logo to FIXO

## Why

Trước đây, giao diện hệ thống (Sidebar, trang Đăng nhập, Landing Page, phiếu in) sử dụng khối hình học CSS tạm thời (CSS box gồm 2 vạch bo tròn nghiêng trên nền xanh ngọc) và biểu tượng favicon mặc định không có file thực tế (`/icon.svg` bị 404). Khách hàng và người dùng hệ thống yêu cầu cập nhật bộ nhận diện thương hiệu chính thức với Logo "FIXO" (chữ FIXO cách điệu cờ-lê màu xanh ngọc / trắng trên nền xanh thẫm) đồng bộ từ tab trình duyệt (Favicon, Apple Touch Icon) đến các điểm chạm thị giác trong toàn bộ ứng dụng.

## What Changes

- **Tài nguyên thương hiệu (Brand Assets)**:
  - Tiếp nhận và chuẩn hóa ảnh Logo FIXO (1024x1024 RGBA) vào thư mục public và app router:
    * `apps/web/public/logo.png`
    * `apps/web/public/brand/fixo-logo.png`
    * `apps/web/public/icon.png`
    * `apps/web/public/apple-icon.png`
    * `apps/web/public/favicon.ico`
    * `apps/web/app/icon.png` (Next.js 14 App Router tự động nhận diện và render icon trên tab trình duyệt)
    * `apps/web/app/apple-icon.png`
  - Cập nhật cấu hình metadata `icons` trong `apps/web/app/layout.tsx` trỏ đúng vào các file icon thực tế (`/icon.png`, `/apple-icon.png`, `/favicon.ico`).

- **Đồng bộ hiển thị Logo trên các thành phần giao diện**:
  - **Sidebar điều hướng nội bộ (`packages/ui/src/organisms/AppSidebar.tsx`)**:
    * Thay thế khối CSS box tạm bằng thẻ ảnh `<img src="/logo.png" alt="FIXO Logo" className="w-8 h-8 rounded-[8px] object-cover shadow-sm" />`.
    * Cập nhật nhận diện thương hiệu FIXO trên tiêu đề Sidebar.
  - **Màn hình Đăng nhập (`apps/web/app/login/page.tsx`)**:
    * Thay thế khối CSS box cũ bằng Logo FIXO kích thước lớn sắc nét (`w-14 h-14 rounded-[12px] object-cover shadow-md mb-3`).
    * Đồng bộ tên thương hiệu FIXO.
  - **Trang Landing Page (`apps/web/app/page.tsx`)**:
    * Cập nhật Header sticky: Sử dụng ảnh Logo FIXO (`w-10 h-10 rounded-[10px] object-cover shadow-sm`).
    * Cập nhật Footer: Sử dụng ảnh Logo FIXO (`w-8 h-8 rounded-[8px] object-cover shadow-xs`).
  - **Phiếu in biên nhận sửa chữa (`apps/web/app/print/[id]/page.tsx`)**:
    * Bổ sung logo FIXO sắc nét vào phần tiêu đề phiếu tiếp nhận sửa chữa phục vụ in ấn chuyên nghiệp.

## Capabilities

### New Capabilities
- `brand-logo`: Cung cấp nhận diện thương hiệu FIXO thống nhất, bao gồm favicon/tab icon chuẩn cho Next.js App Router, tài nguyên tĩnh đa định dạng và hiển thị ảnh Logo tại mọi điểm chạm chính của ứng dụng.

### Modified Capabilities
*(Không có spec hiện hữu nào bị thay đổi)*

## Impact

- **Frontend Routes & UI Components**:
  - `apps/web/app/layout.tsx`
  - `packages/ui/src/organisms/AppSidebar.tsx`
  - `apps/web/app/login/page.tsx`
  - `apps/web/app/page.tsx`
  - `apps/web/app/print/[id]/page.tsx`
- **Dependencies & DB**:
  - Không thay đổi backend, không can thiệp cơ sở dữ liệu.
  - Không bổ sung dependency bên ngoài.
