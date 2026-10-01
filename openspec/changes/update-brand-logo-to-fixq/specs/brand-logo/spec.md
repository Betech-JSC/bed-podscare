# Spec Delta: brand-logo

## Purpose

Chuẩn hóa bộ nhận diện thương hiệu hình ảnh Logo FIXO trên toàn bộ ứng dụng web và hệ thống in ấn, thay thế hoàn toàn các khối CSS box đồ họa tạm thời và cung cấp đầy đủ icon cho tab trình duyệt, thiết bị di động (PWA/Apple Touch Icon).

## ADDED Requirements

### Requirement: Browser Tab Favicon and Next.js App Router Icons
Hệ thống SHALL cung cấp các tệp tài nguyên icon chất lượng cao được lưu trữ tại `apps/web/app/icon.png`, `apps/web/app/apple-icon.png`, `apps/web/public/icon.png`, `apps/web/public/apple-icon.png`, `apps/web/public/favicon.ico`, và cấu hình đầy đủ trong `apps/web/app/layout.tsx`. Khi người dùng mở ứng dụng trên trình duyệt web, tab trình duyệt SHALL hiển thị biểu tượng Logo FIXO chính thức.

#### Scenario: Người dùng mở bất kỳ trang nào của ứng dụng trên trình duyệt
- **WHEN** người dùng truy cập trang web (ví dụ: `/`, `/login`, `/dashboard`, `/repairs`)
- **THEN** trình duyệt tải và hiển thị favicon / icon mang hình ảnh Logo FIXO.

### Requirement: Consistent Brand Logo Display across Navigation and Auth
Hệ thống SHALL hiển thị ảnh Logo FIXO sắc nét, tỉ lệ 1:1, bo góc hài hòa và đổ bóng tinh tế tại thanh Sidebar điều hành nội bộ (`AppSidebar`) và màn hình Đăng nhập (`/login`), thay thế toàn bộ khối CSS box hình học cũ.

#### Scenario: Người dùng quan sát Sidebar điều hành nội bộ
- **WHEN** người dùng ở trong bất kỳ màn hình quản trị nội bộ nào có hiển thị `AppSidebar`
- **THEN** phần Brand Header của Sidebar hiển thị ảnh `<img src="/logo.png" alt="FIXO Logo" ... />` cùng tên thương hiệu FIXO thay vì 2 vạch CSS màu xanh.

#### Scenario: Người dùng truy cập trang Đăng nhập
- **WHEN** người dùng truy cập đường dẫn `/login`
- **THEN** màn hình đăng nhập hiển thị Logo FIXO nổi bật kích thước `w-14 h-14` với góc bo mềm mại và bóng đổ nhẹ ở vị trí trung tâm phía trên tiêu đề.

### Requirement: Brand Logo on Public Landing Page and Print Receipts
Trang Landing Page công chúng (`/`) và Trang In phiếu sửa chữa (`/print/[id]`) SHALL hiển thị ảnh Logo FIXO chính thức tại Header, Footer và đầu phiếu biên nhận.

#### Scenario: Người dùng cuộn xem trang Landing Page
- **WHEN** người dùng duyệt trang chủ tại `/`
- **THEN** cả thanh Header dính (Sticky Header) và phần Footer ở chân trang đều hiển thị hình ảnh Logo FIXO thay thế cho khối hình họa cũ.

#### Scenario: Kỹ thuật viên hoặc CSKH in phiếu sửa chữa
- **WHEN** nhân viên mở trang in phiếu tiếp nhận tại `/print/[id]` hoặc kích hoạt lệnh in (`Ctrl+P` / `Cmd+P`)
- **THEN** tiêu đề phiếu tiếp nhận hiển thị ảnh Logo FIXO bên cạnh tên thương hiệu và thông tin tiếp nhận.
