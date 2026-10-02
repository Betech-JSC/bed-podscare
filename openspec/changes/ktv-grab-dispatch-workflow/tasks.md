# Tasks

## 1. Backend FSM & Workflow Transition Adjustments

- [x] 1.1 Cập nhật ma trận `ALLOWED_TRANSITIONS` trong `OrderWorkflowService.php`: Bổ sung `ready_for_return` vào trạng thái `in_repair`, và `in_repair` vào trạng thái `waiting_tech`. Xác minh bằng cách kiểm tra mảng chuyển đổi trạng thái hợp lệ.
- [x] 1.2 Cập nhật hook `beforeTransition` và `afterTransition` trong `OrderWorkflowService.php`: Cho phép chuyển đổi trực tiếp từ `in_repair` sang `ready_for_return` mà không bị chặn bởi kiểm định QC bắt buộc, đồng thời tự động cập nhật `repair_completed_at`, `qc_passed_at`, `repair_note` và `parts_used_summary`. Xác minh bằng PHPUnit/Pest test case chuyển trạng thái.
- [x] 1.3 Cập nhật side-effects và broadcast event trong `OrderWorkflowService.php`: Đảm bảo khi KTV hoàn tất sửa chữa sang `ready_for_return`, sự kiện `order.ready_for_return` được phát sóng tới đúng role `cskh` tại chi nhánh tương ứng. Xác minh qua log broadcast hoặc test event.

## 2. Web Audio Chime & Socket Synchronizations

- [x] 2.1 Cập nhật `apps/web/app/utils/audioChime.ts`: Tích hợp `DynamicsCompressorNode` vào Web Audio Graph (ngưỡng -18dB, knee 12dB, ratio 8, attack 3ms, release 250ms), nâng gain tối đa lên 1.0 (100%), thiết kế âm chuông Dual-tone Chime phong cách Grab (nốt C6 1046.5Hz ngân 0.15s chuyển tiếp nốt E6 1318.51Hz ngân 0.5s). Xác minh bằng kiểm tra mã AudioContext và chạy thử âm thanh.
- [x] 2.2 Tinh giản giao diện `packages/ui/src/organisms/NotificationPopover.tsx`: Xóa bỏ hoàn toàn nút "Thử âm thanh" và nút "Bật/Tắt chuông", dọn dẹp các prop không còn sử dụng. Xác minh giao diện render sạch sẽ không còn nút mute/test sound.
- [x] 2.3 Điều chỉnh `apps/web/app/components/IntakeWizardModal.tsx`: Loại bỏ việc phát sự kiện cục bộ `realtimeEventBus.emit` và `window.dispatchEvent` khi CSKH bấm tạo đơn thành công để không tự kích hoạt chuông trên máy CSKH. Xác minh khi tạo đơn trên máy CSKH không phát tiếng chuông.
- [x] 2.4 Cập nhật `apps/web/app/utils/socketNotifications.ts`: Bổ sung ánh xạ vai trò `tech` sang các kênh `branch.${branchId}.technician` và `role.technician` trong hàm `computeTargetChannels`. Xác minh danh sách activeChannels của KTV chứa đầy đủ kênh broadcast từ backend.

## 3. Sidebar & Repairs FSM UI Protection

- [x] 3.1 Cập nhật `packages/ui/src/organisms/AppSidebar.tsx`: Cấu hình danh mục quyền cho KTV (`role === 'tech' | 'technician'`) chỉ chứa duy nhất mục `tech` với nhãn hiển thị là "Không gian Kỹ thuật", tự động ẩn toàn bộ menu `/repairs`, `/devices`, `/timeline`, `/qc`, `/dashboard` và nhóm HỆ THỐNG. Xác minh khi đăng nhập vai trò KTV chỉ thấy 1 mục điều hướng duy nhất.
- [x] 3.2 Cập nhật `apps/web/app/repairs/fsm.ts`: Bổ sung tham số vai trò người dùng vào hàm `getQuickActionsForStatus`. Nếu vai trò là `cskh`, ẩn toàn bộ các nút thao tác kỹ thuật khi đơn ở trạng thái `waiting_tech`, `assigned`, `in_repair`, `waiting_parts`, `rework_needed`. Xác minh hàm trả về mảng rỗng đối với vai trò CSKH ở các trạng thái này.
- [x] 3.3 Cập nhật `apps/web/app/repairs/page.tsx`: Truyền vai trò người dùng hiện tại vào `getQuickActionsForStatus`, đồng thời hiển thị thông báo trạng thái "Thiết bị đang trong quá trình xử lý kỹ thuật bởi KTV" khi đơn hàng nằm trong giai đoạn kỹ thuật. Xác minh giao diện `/repairs` của CSKH không có nút can thiệp kỹ thuật.

## 4. Màn hình KTV 1-chạm (Grab-style Workspace `/tech`)

- [x] 4.1 Tái cấu trúc Header KPI cá nhân trên `apps/web/app/tech/page.tsx`: Hiển thị đúng 3 thẻ chỉ số cá nhân trong ca làm việc ("Đã nhận hôm nay" | "Đang sửa (chưa xong)" | "Đã hoàn thành hôm nay"). Xác minh số liệu tính toán chính xác theo tài khoản KTV đăng nhập.
- [x] 4.2 Xây dựng Hàng đợi máy mới (Grab-style queue) trên `apps/web/app/tech/page.tsx`: Thiết kế các thẻ máy mới to rõ cho các đơn `waiting_tech` với nút hành động `[Nhận máy ngay ⚡]`. Khi bấm nút, gọi API transition sang `in_repair` và tự động gán `technician_id`. Xác minh đơn chuyển thẳng sang `in_repair` sau 1 click.
- [x] 4.3 Xây dựng danh sách "Máy đang sửa" và nút hành động `[✓ Hoàn tất sửa chữa]`: Hiển thị danh sách các máy KTV đang phụ trách kèm nút nổi bật `[✓ Hoàn tất sửa chữa]`. Khi bấm nút, mở modal ghi nhận kết quả và chuyển thẳng đơn sang `ready_for_return`. Xác minh đơn chuyển thành công sang `ready_for_return`.
- [x] 4.4 Kiểm thử tích hợp toàn chu trình (Integration Verification): Kiểm tra luồng tiếp nhận từ CSKH (chuyển `waiting_tech`, không kêu chuông CSKH) -> KTV nhận được đơn trên hàng đợi với chuông nổ cuốc -> KTV bấm `[Nhận máy ngay ⚡]` -> KTV bấm `[✓ Hoàn tất sửa chữa]` -> CSKH nhận được thông báo kèm chuông sẵn sàng trả máy.
