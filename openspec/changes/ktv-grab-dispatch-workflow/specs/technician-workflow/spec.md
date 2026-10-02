# Spec Delta

## Purpose

Cung cấp quy trình làm việc chuyên biệt 1 màn hình chuẩn kiểu Grab cho Kỹ thuật viên (KTV), tối ưu khả năng nhận máy 1-chạm, hoàn tất bàn giao tức thì cho CSKH, bảo vệ ma trận trạng thái FSM khỏi thao tác đè lẫn nhau và hệ thống âm thanh thông báo Web Audio nén động không rè loa.

## ADDED Requirements

### Requirement: Tinh gọn thanh điều hướng cho Kỹ thuật viên
Hệ thống SHALL tinh gọn giao diện thanh điều hướng bên (Sidebar) cho người dùng có vai trò Kỹ thuật viên (`tech` hoặc `technician`) thành duy nhất 1 mục làm việc độc lập.

#### Scenario: KTV đăng nhập chỉ thấy Không gian Kỹ thuật
- **WHEN** người dùng có vai trò `tech` hoặc `technician` truy cập vào hệ thống
- **THEN** Sidebar chỉ hiển thị duy nhất 1 mục điều hướng là "Không gian Kỹ thuật" dẫn tới `/tech`
- **THEN** toàn bộ các menu khác (`/dashboard`, `/repairs`, `/devices`, `/timeline`, `/qc` và nhóm Quản trị Hệ thống) đều bị ẩn hoàn toàn

---

### Requirement: Giao diện làm việc KTV 1 màn hình và 3 chỉ số KPI cá nhân
Hệ thống SHALL cung cấp màn hình `/tech` làm không gian thao tác trọn vẹn của KTV với 3 chỉ số KPI cá nhân trực quan tại đầu trang.

#### Scenario: Hiển thị bộ 3 KPI cá nhân trong ca làm việc
- **WHEN** KTV mở màn hình `/tech`
- **THEN** hệ thống hiển thị chính xác 3 chỉ số KPI cá nhân: "Đã nhận hôm nay", "Đang sửa (chưa xong)" và "Đã hoàn thành hôm nay" tính theo phạm vi công việc của KTV tại chi nhánh phụ trách

---

### Requirement: Hàng đợi máy mới kiểu Grab và nhận máy 1-chạm
Hệ thống SHALL hiển thị hàng đợi các đơn máy mới sẵn sàng sửa chữa dưới dạng các thẻ lớn trực quan và cho phép KTV nhận máy ngay chỉ với 1 lượt bấm.

#### Scenario: Nhận đơn mới từ hàng đợi chuyển thẳng sang Đang sửa
- **WHEN** KTV bấm nút "[Nhận máy ngay ⚡]" trên một thẻ đơn hàng ở trạng thái `waiting_tech`
- **THEN** hệ thống SHALL chuyển ngay trạng thái đơn hàng sang `in_repair`
- **THEN** hệ thống SHALL tự động gán `technician_id` bằng ID của KTV hiện tại mà không bắt buộc phải qua bước trung gian `assigned`
- **THEN** đơn hàng lập tức được đưa vào danh sách "Máy đang sửa" của KTV

---

### Requirement: Hoàn tất sửa chữa 1-chạm và bàn giao tức thì cho CSKH
Hệ thống SHALL cho phép KTV xác nhận hoàn tất sửa chữa và chuyển thẳng đơn sang trạng thái sẵn sàng giao trả khách, bỏ qua bước nghẽn QC bắt buộc đối với mô hình vận hành tinh gọn.

#### Scenario: KTV bấm hoàn tất sửa chữa bàn giao cho CSKH
- **WHEN** KTV nhấn nút "[✓ Hoàn tất sửa chữa]" trên đơn hàng đang phụ trách
- **THEN** hệ thống SHALL chuyển trực tiếp trạng thái đơn hàng từ `in_repair` sang `ready_for_return`
- **THEN** hệ thống SHALL phát sinh sự kiện thông báo vận hành `order.ready_for_return` gửi tới nhân sự CSKH của chi nhánh kèm âm thanh chuông báo

---

### Requirement: Chống xung đột trạng thái và phân quyền nút bấm trên Đơn sửa chữa
Hệ thống SHALL bảo vệ ma trận trạng thái (FSM) và giao diện `/repairs`, đảm bảo CSKH chỉ thao tác các bước ngoài quầy và không thể bấm can thiệp vào các trạng thái kỹ thuật của KTV.

#### Scenario: CSKH tiếp nhận đơn chuyển trạng thái sang Chờ kỹ thuật
- **WHEN** CSKH hoàn thành việc lập phiếu tiếp nhận trên giao diện tiếp nhận đơn
- **THEN** đơn hàng mới được thiết lập trạng thái khởi tạo là `waiting_tech` để hiển thị tức thì trên hàng đợi của KTV

#### Scenario: Khóa các nút chuyển trạng thái kỹ thuật đối với CSKH trên trang Đơn sửa chữa
- **WHEN** người dùng có vai trò `cskh` xem chi tiết đơn hàng trên trang `/repairs`
- **THEN** nếu đơn hàng đang ở các trạng thái kỹ thuật (`waiting_tech`, `assigned`, `in_repair`, `waiting_parts`, `rework_needed`), hệ thống KHÔNG hiển thị các nút thao tác kỹ thuật (như "Đang sửa", "Chờ QC")
- **THEN** hệ thống hiển thị thông báo tiến độ đang được kỹ thuật viên tiếp nhận và xử lý

---

### Requirement: Tối ưu kênh phát âm thanh thông báo và Web Audio Compressor
Hệ thống SHALL phân phối âm thanh chuông thông báo đúng người nhận, tăng âm lượng lên 100% với bộ nén âm chống vỡ gain và loại bỏ các nút điều khiển dư thừa trên popover.

#### Scenario: Không tự phát chuông âm thanh trên máy của người tạo đơn
- **WHEN** CSKH thực hiện lưu tạo mới đơn sửa chữa tại quầy
- **THEN** hệ thống phát sóng sự kiện qua kênh WebSocket tới KTV nhưng TUYỆT ĐỐI KHÔNG tự động phát âm thanh chuông báo tại trình duyệt của chính CSKH vừa tạo đơn

#### Scenario: Phát âm chuông Dual-tone Chime với bộ nén âm lượng cao
- **WHEN** KTV nhận sự kiện có đơn mới nổ cuốc hoặc CSKH nhận sự kiện máy đã sửa xong
- **THEN** hệ thống tổng hợp âm thanh Web Audio với cấu trúc Dual-tone Chime (nốt C6 ngân 0.15s chuyển tiếp nốt E6 ngân 0.5s)
- **THEN** âm thanh đi qua bộ nén `DynamicsCompressorNode` với gain mức 1.0 (100%), đảm bảo âm thanh to rõ, sắc nét và không bị méo tiếng hoặc vỡ gain loa

#### Scenario: Giao diện popover thông báo tinh giản không có nút mute hoặc test sound
- **WHEN** người dùng mở bảng thông báo `NotificationPopover`
- **THEN** bảng thông báo không chứa nút "Thử âm thanh" và không chứa nút "Bật/Tắt chuông"
- **THEN** âm thanh thông báo tự động được kích hoạt theo cơ chế tương tác người dùng ban đầu
