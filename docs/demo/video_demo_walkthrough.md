# Video Giới Thiệu & Hướng Dẫn Sử Dụng Hệ Thống FIXO (`https://fixo.com.vn`)

![Video Giới Thiệu & Hướng Dẫn Sử Dụng FIXO Full HD 1080p](./fixo-demo-guide-online.mp4)

---

## 1. Thông Số File Video Xuất Bản

| Hạng mục | Chi tiết |
| :--- | :--- |
| **File MP4 Chuẩn H.264 (Full HD)** | [`docs/demo/fixo-demo-guide-online.mp4`](./fixo-demo-guide-online.mp4) |
| **Tài liệu kịch bản chi tiết** | [`docs/demo/demo_script_podscare.md`](./demo_script_podscare.md) |
| **Độ phân giải & Khung hình** | `1920x1080` (Full HD 1080p) · `H.264 (yuv420p)` · `25 fps` (`6.626 frames`) |
| **Thời lượng & Dung lượng** | **04 phút 25 giây** (`264.92s`) · **11.61 MB** (`.mp4`) |
| **Hiệu ứng tích hợp trên màn hình** | Thanh phụ đề hướng dẫn từng bước (**On-Screen Step Overlay**) + Con trỏ chuột ảo di chuyển mượt kèm vòng sóng highlight khi click (**Virtual Cursor & Ripple**) |

---

## 2. Bộ Tài Khoản & Dữ Liệu Mới Đã Khởi Tạo Trên `https://fixo.com.vn`

> [!IMPORTANT]
> Toàn bộ tài khoản dưới đây vừa được tạo mới trực tiếp trên `https://fixo.com.vn` trong quá trình quay video (hoàn toàn độc lập với dữ liệu Seeder). Bạn có thể đăng nhập trực tiếp tại `https://fixo.com.vn/login` để kiểm tra hoặc quay bổ sung bất kỳ lúc nào.

- **Tên gian hàng**: `iCare Lab Sài Gòn 2847`
- **Mã gian hàng (`store_code`)**: `icarelab2847`
- **Gói cước**: **Chuyên Nghiệp (Pro - 599k/tháng)** *(Kích hoạt 3 tháng dùng thử miễn phí, không giới hạn nhân sự)*
- **Mật khẩu chung cho cả 4 tài khoản**: `Fixo@2026`

| Vai trò (Role) | Họ và tên | Email đăng nhập | Số điện thoại | Trang đích |
| :--- | :--- | :--- | :--- | :--- |
| **1. Chủ cửa hàng (`admin`)** | Lê Hoàng Nam | `admin.icarelab2847@fixo.com.vn` | `0908262847` | `/dashboard` |
| **2. Lễ tân / CSKH (`cskh`)** | Trần Ngọc Mai | `cskh.icarelab2847@fixo.com.vn` | `0901262847` | `/dashboard` |
| **3. Kỹ thuật viên (`technician`)** | Nguyễn Tuấn Kiệt | `tech.icarelab2847@fixo.com.vn` | `0902262847` | `/tech` |
| **4. Kiểm định QC (`qc`)** | Phạm Bảo Châu | `qc.icarelab2847@fixo.com.vn` | `0903262847` | `/qc` |

### Đơn hàng End-to-End đã tạo & hoàn tất trong video:
- **Mã đơn sửa chữa (`order_code`)**: `PCICARELAB28-CN126102601`
- **Khách hàng**: Đặng Quốc Khánh — SĐT: `0909888777`
- **Thiết bị**: `AirPods Pro 2` — Serial: `H0YLP982LX2Y` (Nhận đủ: `Tai trái L`, `Tai phải R`, `Hộp sạc Case`)
- **Dịch vụ & Thanh toán**: `450.000 ₫` (Đã thu tiền mặt vào Sổ quỹ ca trực, kích hoạt Sổ bảo hành điện tử **90 ngày**)

---

## 3. Mục Lục 7 Phân Cảnh Trong Video (`04:25`)

1. **Phần 1/7 — Giới thiệu Landing Page & Đăng ký Gian hàng Multi-Tenant (`/`, `/register?plan=pro`)**:
   - Lướt trang chủ `https://fixo.com.vn`, đăng ký cửa hàng mới `iCare Lab Sài Gòn 2847` (`icarelab2847`) gói Pro và tự động vào thẳng `/dashboard`.
2. **Phần 2/7 — Khởi tạo Nhân sự & Phân quyền RBAC (`/users`)**:
   - Tạo mới 3 tài khoản nhân sự (`CSKH`, `Kỹ thuật viên`, `Kiểm định QC`) gán vào chi nhánh chính.
3. **Phần 3/7 — Mở Ca làm việc & Tiếp nhận Thiết bị 5 bước (`/shifts`, `/repairs`)**:
   - Mở ca trực với quỹ tiền mặt đầu ca `2.000.000 ₫`.
   - Tiếp nhận máy `AirPods Pro 2` qua Wizard 5 bước (chọn bộ phận `L / R / Case`, chấm Checklist đầu vào, nhập báo giá `450.000 ₫`), xem phiếu in biên nhận và chuyển sang `Chờ kỹ thuật (waiting_tech)`.
4. **Phần 4/7 — Không gian Kỹ thuật viên & Bảo mật Ẩn giá 100% (`/login`, `/tech`)**:
   - Đăng nhập tài khoản Kỹ thuật viên `tech.icarelab2847@fixo.com.vn`, trình diễn giao diện ẩn 100% giá tiền/doanh thu, bấm **Nhận máy ngay**, ghi chẩn đoán kỹ thuật, kê khai linh kiện và bấm **Hoàn thành sửa chữa** đẩy sang `Chờ QC (waiting_qc)`.
5. **Phần 5/7 — Chốt chặn Kiểm định Chất lượng Độc lập (`/qc`)**:
   - Đăng nhập tài khoản QC `qc.icarelab2847@fixo.com.vn`, chấm ĐẠT toàn bộ tiêu chí kiểm chuẩn, nhập ghi chú nghiệm thu và duyệt sang `Sẵn sàng trả máy (ready_for_return)`.
6. **Phần 6/7 — Thu ngân VietQR SePay / Tiền mặt, Bàn giao & Kích hoạt Bảo hành (`/repairs`, `/warranty`)**:
   - Mở modal **Thu tiền & Trả máy**, trình diễn mã **VietQR SePay động** theo đúng số tiền `450.000 ₫` và mã đơn `PCICARELAB28-CN126102601`, xác nhận thu tiền mặt & hoàn tất bàn giao (`completed`).
   - Mở `/warranty` kiểm tra Sổ bảo hành điện tử 90 ngày vừa tự động kích hoạt và xem **Bệnh án thiết bị**.
7. **Phần 7/7 — Khách hàng Tra cứu Công khai (`/track`) & Đối soát Lợi nhuận / Kiểm toán (`/dashboard`, `/shifts`, `/audit`)**:
   - Tại `https://fixo.com.vn/track`: Tra cứu lần 1 chỉ bằng mã đơn để trình diễn **PII Masking** (che mờ tên & SĐT khách); tra cứu lần 2 kèm SĐT `0909888777` để xem đầy đủ 5/5 bước.
   - Quay lại Admin kiểm tra Doanh thu thực thu & Lợi nhuận ròng (`/dashboard`), Sổ quỹ ca trực tăng lên `2.450.000 ₫` (`/shifts`) và trình soi **Before / After Diff** trong Nhật ký kiểm toán bất biến (`/audit`).
