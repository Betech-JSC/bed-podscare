# Tasks: Update Brand Logo to FIXO

## 1. Brand Asset Processing and Storage

- [x] 1.1 Sao chép và tạo các tệp tài nguyên tĩnh từ ảnh logo mới: `apps/web/public/logo.png`, `apps/web/public/brand/fixo-logo.png`, `apps/web/public/icon.png`, `apps/web/public/apple-icon.png`, `apps/web/public/favicon.ico`.
- [x] 1.2 Tạo tệp icon tự động cho Next.js 14 App Router: `apps/web/app/icon.png`, `apps/web/app/apple-icon.png`.
- [x] 1.3 Cập nhật cấu hình metadata `icons` trong `apps/web/app/layout.tsx`.

## 2. Brand Logo UI Integration

- [x] 2.1 Cập nhật `packages/ui/src/organisms/AppSidebar.tsx`: Thay thế khối CSS box cũ bằng thẻ ảnh `<img src="/logo.png" alt="FIXO Logo" className="w-8 h-8 rounded-[8px] object-cover shadow-sm" />`.
- [x] 2.2 Cập nhật `apps/web/app/login/page.tsx`: Thay thế khối CSS box cũ bằng Logo mới kích thước `w-14 h-14 rounded-[12px] object-cover shadow-md mb-3`.
- [x] 2.3 Cập nhật `apps/web/app/page.tsx` (Landing Page): Thay thế khối CSS box cũ ở cả Header và Footer bằng ảnh Logo mới.
- [x] 2.4 Cập nhật `apps/web/app/print/[id]/page.tsx`: Bổ sung ảnh Logo mới vào tiêu đề phiếu in sửa chữa.
- [x] 2.5 Cập nhật `apps/web/app/components/TrackingView.tsx`: Thay thế khối CSS box cũ bằng ảnh Logo FIXO mới trên cổng tra cứu.

## 3. Verification & Build Quality Gate

- [x] 3.1 Chạy `pnpm --filter web check-types` để đảm bảo không có lỗi TypeScript.
- [x] 3.2 Chạy `pnpm --filter web build` để xác nhận ứng dụng build thành công 100%.
