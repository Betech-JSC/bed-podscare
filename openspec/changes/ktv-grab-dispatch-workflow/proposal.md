# Proposal

## Why

Hiện tại, kỹ thuật viên (KTV) tại các chi nhánh gặp nhiều trở ngại và gián đoạn trong ca làm việc do luồng thao tác chưa được chuyên biệt hóa:
1. **Giao diện phân tán, rườm rà**: Thanh điều hướng bên (Sidebar) hiển thị quá nhiều mục menu không liên quan (`/dashboard`, `/repairs`, `/devices`, `/timeline`, `/qc`), khiến KTV phải chuyển đổi qua lại nhiều màn hình thay vì tập trung 100% vào việc sửa chữa.
2. **Xung đột trạng thái và phân quyền FSM (Status Conflict)**: Khi CSKH lập phiếu tiếp nhận tại quầy, đơn chưa được đưa thẳng vào hàng đợi nhận việc của KTV; trên trang `/repairs`, nhân sự CSKH có thể bấm đè vào các nút chuyển trạng thái kỹ thuật (`Đang sửa`, `Chờ linh kiện`, `Chờ QC`); quy trình kỹ thuật yêu cầu qua nhiều bước trung gian (`waiting_tech` -> `assigned` -> `in_repair` -> `waiting_qc`) gây nghẽn nghiêm trọng tại các chi nhánh không có bộ phận QC chuyên trách.
3. **Lỗi chuông thông báo và kênh Socket**: Nhân sự CSKH khi tạo đơn bị hệ thống tự phát chuông ting ting cho chính mình; kênh WebSocket giữa Laravel Reverb và Next.js bị lệch định danh vai trò (`tech` vs `technician`) khiến KTV không nhận được thông báo nổ cuốc tức thì; âm thanh chuông hiện tại quá nhỏ (gain 25%), thiếu bộ nén âm chống vỡ tiếng; `NotificationPopover` chứa các nút thừa thãi gây rối mắt.

Đề xuất này nhằm tái cấu trúc toàn diện quy trình kỹ thuật viên theo mô hình **"Nhận cuốc 1-chạm kiểu Grab"**, tối ưu 1 màn hình duy nhất cho KTV, phân quyền FSM chuẩn xác và nâng cấp hệ thống âm thanh Web Audio Chime đạt chuẩn chất lượng cao.

## What Changes

- **Sidebar KTV Tinh gọn (AppSidebar)**:
  - Khi người dùng đăng nhập với vai trò KTV (`role === 'tech' | 'technician'`), ẩn toàn bộ các menu không liên quan (`/repairs`, `/devices`, `/timeline`, `/qc`, `/dashboard`, nhóm HỆ THỐNG).
  - Chỉ hiển thị duy nhất 1 mục làm việc: `Không gian Kỹ thuật` (`/tech`).
- **Màn hình làm việc KTV 1-chạm (Grab-style Workspace `/tech`)**:
  - **Header 3 KPI cá nhân**: Thay thế 4 ô thống kê cũ bằng 3 chỉ số trọng tâm trong ca: `Đã nhận hôm nay` | `Đang sửa (chưa xong)` | `Đã hoàn thành hôm nay`.
  - **Hàng đợi máy mới (Grab-style queue)**: Card máy to, thông tin lỗi rõ ràng, phát chuông nổ cuốc tức thì và nút bấm nổi bật `[Nhận máy ngay ⚡]`. Bấm 1-chạm chuyển thẳng sang `in_repair`, tự động gán `technician_id` cho KTV hiện tại.
  - **Danh sách máy đang sửa**: Hiển thị các máy KTV đang phụ trách với nút hành động chính `[✓ Hoàn tất sửa chữa]`.
  - **Bàn giao tức thì cho CSKH**: Khi KTV bấm `[✓ Hoàn tất sửa chữa]`, đơn chuyển thẳng sang `ready_for_return` (cho phép bỏ qua bước kẹt `waiting_qc` bắt buộc đối với chi nhánh không có QC riêng), đồng thời tự động bắn WebSocket và phát chuông ngược lại cho CSKH ngoài quầy.
- **Khắc phục lỗi xung đột trạng thái (Status Conflict & FSM Guards)**:
  - Khi CSKH lập phiếu tiếp nhận xong, đơn đặt trạng thái khởi tạo kỹ thuật là `waiting_tech` để xuất hiện ngay trên hàng đợi KTV.
  - Bổ sung bước chuyển `in_repair` -> `ready_for_return` vào ma trận `ALLOWED_TRANSITIONS` và cập nhật logic kiểm tra QC trong `OrderWorkflowService`.
  - Phân quyền giao diện trên `/repairs`: CSKH chỉ thao tác các bước quầy (tiếp nhận, báo giá, giao trả khách), ẩn hoàn toàn các nút can thiệp vào giai đoạn thao tác kỹ thuật của KTV.
- **Tối ưu Âm thanh Web Audio & Socket Broadcast**:
  - Tắt cơ chế tự phát chuông trên máy CSKH trong `IntakeWizardModal` khi CSKH là người tạo đơn.
  - Đồng bộ chuẩn hóa Channel WebSocket giữa Backend Laravel Reverb và Frontend Next.js (`role.technician` / `branch.{id}.technician` được map thông suốt cho role `tech`).
  - Nâng cấp `audioChime.ts`: Tăng âm lượng tối đa lên 100% (volume = 1.0) kết hợp tích hợp `DynamicsCompressorNode` trong Web Audio Graph để âm thanh to, rõ ràng, đanh chắc nhưng tuyệt đối không bị clipping hay rè loa.
  - Thiết kế âm chuông Dual-tone Chime phong cách Grab: Nốt C6 (1046.50Hz, 0.15s) chuyển tiếp mượt mà sang nốt E6 (1318.51Hz, 0.5s).
  - Tinh giản `NotificationPopover.tsx`: Xóa bỏ nút "Thử âm thanh" và "Bật/Tắt chuông", hệ thống tự động kích hoạt âm thanh khi người dùng tương tác với trang.

## Capabilities

### New Capabilities
- `technician-workflow`: Quy trình tiếp nhận và sửa chữa máy kiểu Grab cho Kỹ thuật viên (KTV) 1 màn hình duy nhất, cơ chế nhận cuốc 1-chạm, hoàn tất chuyển thẳng CSKH, phân quyền FSM chống đè trạng thái, và hệ thống chuông Web Audio nén động 100% volume.

### Modified Capabilities
<!-- Hiện tại hệ thống chưa có capability spec nào tồn tại trong openspec/specs/ -->

## Impact

- **Frontend (`apps/web`)**:
  - `apps/web/app/tech/page.tsx`: Tái cấu trúc layout 1 màn hình duy nhất, 3 KPI, hàng đợi Grab-queue, nút nhận máy ngay và hoàn tất sửa chữa.
  - `apps/web/app/components/AppShell.tsx` & `packages/ui/src/organisms/AppSidebar.tsx`: Rút gọn navigation cho KTV chỉ còn duy nhất `/tech`.
  - `apps/web/app/components/IntakeWizardModal.tsx`: Loại bỏ việc tự kích hoạt chuông âm thanh tại máy người tạo đơn.
  - `apps/web/app/repairs/page.tsx` & `apps/web/app/repairs/fsm.ts`: Khóa quyền chuyển trạng thái kỹ thuật đối với role CSKH, cập nhật danh mục action.
  - `apps/web/app/utils/audioChime.ts`: Nâng cấp Web Audio graph với `DynamicsCompressorNode`, dual-tone C6->E6, gain 1.0.
  - `packages/ui/src/organisms/NotificationPopover.tsx`: Xóa bỏ nút "Thử âm thanh" và "Bật/Tắt chuông".
  - `apps/web/app/utils/socketNotifications.ts`: Chuẩn hóa kênh lắng nghe cho role `tech` sang `technician`.
- **Backend (`apps/api`)**:
  - `apps/api/app/Services/OrderWorkflowService.php`: Cập nhật `ALLOWED_TRANSITIONS` hỗ trợ `in_repair` -> `ready_for_return`, điều chỉnh hook `beforeTransition` để hỗ trợ flow KTV hoàn tất trực tiếp mà không bị kẹt bắt buộc QC Pass.
