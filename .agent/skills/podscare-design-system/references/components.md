# PodsCare UI Components Reference Guide

Bộ thư viện component chuẩn mực cho PodsCare Repair OS:

## 1. Atoms
- **Button**:
  - `primary`: Nền Calm Jade `#176b58`, viền `#176b58`, chữ trắng. Hover: `#125945`.
  - `secondary`: Nền trắng, viền `#e2e9e4`, chữ `#516059`.
  - `ghost`: Nền trong suốt, không viền, chữ `#708078`.
- **StatusTag**:
  - Semantic types: `wait` (vàng đất), `progress` (xanh dương kỹ thuật), `ready` (xanh ngọc đạt chuẩn), `danger` (đỏ cảnh báo), `new` (tím nhạt), `gray` (xám lưu trữ).
  - Có dot `5px` đồng màu.
- **Input / Select / Textarea**:
  - Border `#e4eae6`, bo góc `7px` hoặc `8px`, focus ring `3px #176b5812`, border focus `#75a994`.
- **Avatar**:
  - Mini-avatar kích thước `25px`, `avatar-dark` kích thước `32px`.

## 2. Molecules
- **StatCard**:
  - Kích thước tối thiểu `112px`, nền trắng, bóng `0 2px 5px rgba(36, 60, 41, 0.03)`.
  - Giá trị số lớn: font `Manrope`, cỡ `24px`, bold 700.
  - Trend indicator: `trend-up` (`#368361`) / `trend-down` (`#bd7650`).
- **DynamicTestRow**:
  - 3 lựa chọn radio: Hoạt động (chấm xanh `✓`), Lỗi (chấm đỏ `!`), Không kiểm tra (chấm xám `—`).
- **PhotoDropzone**:
  - Viền nét đứt dashed `#b7d2c3`, nền `#f7faf8`, icon camera/plus, danh sách ảnh thu nhỏ có nút xoá.

## 3. Organisms
- **AppSidebar**:
  - Chiều rộng `248px`, nền trắng, viền phải `1px solid #e5ece8`.
  - Brand mark hình khối tai nghe đặc trưng.
  - Menu phân loại: WORKSPACE, VẬN HÀNH, HỆ THỐNG.
- **Topbar**:
  - Chiều cao `64px`, sticky, search bar `257px` kèm phím tắt `⌘K`.
- **PrintSheet**:
  - Layout 2 liên A4 tiêu chuẩn (`@page { size: A4; margin: 8mm; }`), Liên 1 Cửa hàng giữ, Liên 2 Khách hàng giữ.
