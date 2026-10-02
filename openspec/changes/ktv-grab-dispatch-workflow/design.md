# Design

## Context

Hệ thống PodsCare Repair OS hiện đang vận hành theo mô hình phân tầng:
- Giao diện Frontend Next.js 14 (`apps/web`) kết hợp hệ thống Design System Calm Jade & Warm Ivory (`packages/ui`).
- Backend Laravel 11 (`apps/api`) quản lý vòng đời đơn sửa chữa qua `OrderWorkflowService` kế thừa từ `BaseWorkflowService`, phát sự kiện realtime qua Laravel Reverb / Pusher v7 protocol.
- Hiện tại, luồng tương tác của Kỹ thuật viên (KTV) bị phân tán bởi nhiều màn hình và thanh điều hướng quá nhiều mục. Đồng thời, các trạng thái FSM bị xung đột khi CSKH có thể can thiệp vào các bước sửa chữa của KTV, và hệ thống âm thanh thông báo Web Audio gặp vấn đề về âm lượng và chuông phát sai đối tượng.

Xem chi tiết nguyên nhân và bối cảnh tại `proposal.md` và các yêu cầu hành vi tại `specs/technician-workflow/spec.md`.

## Goals / Non-Goals

**Goals:**
- Thiết kế giao diện 1 màn hình duy nhất cho KTV tại `/tech` và tinh gọn thanh điều hướng chỉ còn duy nhất 1 mục `Không gian Kỹ thuật`.
- Thiết kế cơ chế "Nhận cuốc kiểu Grab" 1-chạm: Đơn `waiting_tech` được KTV bấm `[Nhận máy ngay ⚡]` chuyển thẳng sang `in_repair` có gán `technician_id`.
- Thiết kế cơ chế "Bàn giao 1-chạm": KTV bấm `[✓ Hoàn tất sửa chữa]` chuyển thẳng từ `in_repair` sang `ready_for_return`, tự động kích hoạt broadcast thông báo cho CSKH kèm chuông.
- Thiết kế bộ lọc FSM UI Guard trên `/repairs` để ngăn chặn nhân viên CSKH bấm can thiệp vào các trạng thái sửa chữa của KTV.
- Xây dựng kiến trúc Web Audio Graph tích hợp `DynamicsCompressorNode` với âm lượng 100% (gain 1.0) và chuông Dual-tone Chime (nốt C6 -> E6) sắc nét, không vỡ gain.
- Chuẩn hóa kênh lắng nghe Socket giữa Reverb và Next.js cho vai trò KTV (`technician` vs `tech`), đồng thời ngắt chuông tự phát trên máy CSKH khi tạo đơn.

**Non-Goals:**
- Không thay đổi cấu trúc bảng cơ sở dữ liệu (Database Schema) đã có.
- Không loại bỏ chức năng kiểm định chất lượng (QC) đối với các đơn vị/chi nhánh có nhân sự QC chuyên trách; quy trình hoàn tất trực tiếp là tùy chọn tối ưu hóa cho mô hình vận hành tinh gọn.
- Không can thiệp vào module quản lý bảo hành hoặc thanh toán SePay.

## Decisions

### 1. Kiến trúc Chuyển đổi Trạng thái (FSM) và Phân quyền UI Guard

#### Vấn đề
Ma trận `ALLOWED_TRANSITIONS` hiện tại của `OrderWorkflowService` không cho phép chuyển trực tiếp từ `in_repair` sang `ready_for_return`, đồng thời hook `beforeTransition` yêu cầu bắt buộc phải có bản ghi `QcInspection` với kết quả `pass`. Trên giao diện `/repairs`, nhân viên CSKH cũng có thể bấm các nút chuyển trạng thái của KTV.

#### Giải pháp kỹ thuật
1. **Mở rộng Ma trận Chuyển đổi tại Backend (`OrderWorkflowService`)**:
   - Bổ sung `ready_for_return` vào danh sách đích của `in_repair`:
     ```php
     'in_repair' => ['waiting_parts', 'waiting_qc', 'qc_pending', 'qc_inspecting', 'ready_for_return'],
     ```
   - Bổ sung `in_repair` trực tiếp vào `waiting_tech`:
     ```php
     'waiting_tech' => ['in_repair', 'assigned'],
     ```
2. **Xử lý Hook QC Linh hoạt (`beforeTransition`)**:
   - Khi chuyển sang `ready_for_return` trực tiếp từ `in_repair`: Hệ thống ghi nhận biên bản nghiệm thu trực tiếp từ KTV (tự động tạo hoặc bỏ qua yêu cầu kiểm tra QC độc lập nếu đơn được KTV hoàn tất với đầy đủ ghi chú sửa chữa và xác nhận kiểm tra cuối).
   - Hook `afterTransition`: Cập nhật đồng thời `repair_completed_at = now()`, `qc_passed_at = now()`, lưu `repair_note` và `parts_used_summary`.
3. **Phân quyền Giao diện trên `/repairs` (FSM UI Guard)**:
   - Trên Frontend (`fsm.ts`), hàm `getQuickActionsForStatus(status, userRole)` sẽ nhận thêm tham số `userRole`.
   - Nếu `userRole === 'cskh'`:
     * Khi đơn hàng đang ở giai đoạn kỹ thuật (`waiting_tech`, `assigned`, `in_repair`, `waiting_parts`, `rework_needed`), trả về mảng rỗng `[]` (ẩn toàn bộ các nút thao tác).
     * Giao diện hiển thị Status Banner thân thiện: *"Thiết bị đang trong quá trình xử lý kỹ thuật bởi KTV. CSKH không can thiệp trạng thái ở bước này."*
     * Chỉ hiển thị các nút hành động khi đơn ở bước quầy: tiếp nhận, báo giá hoặc giao trả khách (`inspecting`, `waiting_approval`, `ready_for_return`, `waiting_pickup`).

*Giải pháp thay thế đã xem xét:* Tạo bảng phân quyền phức tạp trong database. Bị loại bỏ vì quy trình hiện tại có vai trò cố định rõ ràng (`cskh`, `tech`, `qc`, `admin`), việc guard trực tiếp qua FSM service và helper frontend đơn giản, an toàn và không gây overhead.

---

### 2. Thiết kế Màn hình Làm việc KTV 1-chạm (`apps/web/app/tech/page.tsx`)

#### Vấn đề
Màn hình `/tech` hiện tại có 4 ô thống kê rải rác, nút nhận đơn qua 2 bước (`assigned` -> `in_repair`), và KTV bị phân tâm bởi các mục sidebar khác.

#### Giải pháp kỹ thuật
1. **Tinh gọn AppSidebar (`AppSidebar.tsx`)**:
   - Cấu hình `rolePermissions.tech = ['tech']`.
   - Đổi nhãn mục menu thành: `Không gian Kỹ thuật` (`/tech`).
   - Tự động ẩn toàn bộ các nhóm `WORKSPACE` và `HỆ THỐNG`.
2. **Bộ 3 Chỉ số KPI Trọng tâm trên Header**:
   - **Đã nhận hôm nay**: Tổng số đơn mà KTV hiện tại đã bấm nhận trong ngày.
   - **Đang sửa (chưa xong)**: Số lượng đơn đang ở trạng thái `in_repair` của KTV.
   - **Đã hoàn thành hôm nay**: Số lượng đơn KTV đã chuyển sang `ready_for_return` hoặc `completed` trong ngày.
3. **Hàng đợi Nhận máy kiểu Grab (Grab-Queue)**:
   - Lọc các đơn hàng `waiting_tech` thuộc chi nhánh trực.
   - Mỗi thẻ máy hiển thị: Mã đơn to rõ, Thiết bị, Serial, Mô tả lỗi khách báo, Thời gian chờ.
   - Nút hành động chính: `[Nhận máy ngay ⚡]` (Calm Jade, nổi bật). Click gọi ngay `repairService.transition(orderId, { transition: 'in_repair', technician_id: currentUserId })`.
4. **Danh sách Máy đang Sửa**:
   - Hiển thị danh sách các máy KTV đang thao tác.
   - Nút hành động chính: `[✓ Hoàn tất sửa chữa]` mở modal hoàn tất, cho phép nhập nhanh nội dung kiểm tra/linh kiện thay thế, xác nhận chuyển thẳng sang `ready_for_return`.

---

### 3. Kiến trúc Đồ thị Web Audio Chime (`audioChime.ts`)

#### Vấn đề
Âm lượng thông báo hiện tại quá nhỏ (gain mặc định 0.25). Nếu chỉ tăng gain đơn thuần lên 1.0, các dải sóng sine tần số cao khi cộng hưởng sẽ gây vỡ gain (clipping), rè loa laptop hoặc chói tai. Ngoài ra, CSKH tự phát chuông cho chính mình khi bấm tạo đơn tại quầy.

#### Giải pháp kỹ thuật
1. **Web Audio Graph Pipeline**:
   ```
   [OscillatorNode (Sine)] ──> [GainNode (Envelope)] ──> [DynamicsCompressorNode] ──> [ctx.destination]
   ```
2. **Cấu hình DynamicsCompressorNode (Bộ nén chống vỡ gain)**:
   - `threshold = -18 dB`: Ngưỡng nén bắt đầu hoạt động khi âm lượng chạm mức tín hiệu lớn.
   - `knee = 12 dB`: Chuyển tiếp mượt mà giữa vùng không nén và vùng nén (soft-knee).
   - `ratio = 8.0`: Tỉ lệ nén bảo vệ biên độ an toàn, triệt tiêu hoàn toàn hiện tượng vỡ tiếng khi âm lượng ở mức tối đa.
   - `attack = 0.003s`: Bắt tức thì các peak âm thanh đột ngột trong 3ms đầu.
   - `release = 0.25s`: Nhả nén êm dịu, giữ được độ vang tự nhiên.
3. **Cấu trúc Dual-tone Chime (Phong cách Nổ cuốc Grab)**:
   - Giai đoạn 1: Nốt **C6** (`1046.50 Hz`) ngân `0.15s`.
   - Giai đoạn 2: Lướt mượt chuyển tiếp sang nốt **E6** (`1318.51 Hz`) ngân `0.5s` trước khi tắt dần (Decay).
   - Tổng thời gian phát: `~0.65s`, âm sắc trong trẻo, vui tai, đanh thép, gây chú ý cao tại môi trường bàn kỹ thuật có tiếng ồn.
   - Gain Envelope: Peak tối đa đạt `1.0` (100% Volume).
4. **Loại bỏ Tự phát chuông tại Máy CSKH (`IntakeWizardModal.tsx`)**:
   - Khi lưu đơn thành công tại quầy, loại bỏ việc gọi `realtimeEventBus.emit('order.created', ...)` và `window.dispatchEvent` trên máy local của CSKH.
   - Chỉ backend Laravel phát sự kiện qua WebSocket tới các kênh KTV (`branch.{id}.technician` hoặc `branch.{id}.orders`). KTV ở phòng kỹ thuật sẽ nhận tín hiệu và phát chuông nổ cuốc; CSKH ngoài quầy không bị giật mình bởi chuông của chính mình.
5. **Đồng bộ Định danh Channel WebSocket**:
   - Trong `socketNotifications.ts`: Hàm `computeTargetChannels` khi nhận vai trò `tech` sẽ bổ sung thêm các kênh `branch.{id}.technician` và `role.technician` để khớp hoàn hảo với `OrderWorkflowService` từ backend.
6. **Tinh giản `NotificationPopover.tsx`**:
   - Xóa bỏ các nút "Thử âm thanh" và "Bật/Tắt chuông".
   - Tận dụng listener tương tác đầu tiên của người dùng (`setupAudioContextUnlock`) để tự động mở khóa Web Audio API mà không cần người dùng phải bấm kích hoạt thủ công.

---

## Risks / Trade-offs

- **[Risk]** Bỏ qua bước kiểm định QC bắt buộc có thể dẫn tới lỗi sót kỹ thuật nếu KTV làm việc thiếu cẩn thận.
  - **Mitigation:** Vẫn duy trì modal xác nhận hoàn tất sửa chữa yêu cầu KTV nhập nội dung đã kiểm tra, linh kiện đã dùng và tích chọn cam kết chất lượng. Đối với các chi nhánh lớn có bộ phận QC, KTV vẫn có thể lựa chọn chuyển sang `waiting_qc` nếu muốn.
- **[Risk]** Autoplay Policy của trình duyệt chặn âm thanh nếu người dùng chưa có cử chỉ click/phím trên tab trang KTV.
  - **Mitigation:** Hàm `setupAudioContextUnlock` đã lắng nghe các sự kiện `click`, `keydown`, `touchstart`, `pointerdown` ngay từ khi KTV đăng nhập hoặc mở tab, đảm bảo AudioContext luôn ở trạng thái `running` trước khi sự kiện socket đầu tiên xuất hiện.
- **[Risk]** Trùng lặp sự kiện giữa Reverb WebSocket và Smart Polling.
  - **Mitigation:** `NotificationProvider` đã có sẵn cơ chế deduplication thông qua `processedEventIdsRef` (bộ nhớ đệm 300 IDs gần nhất) và throttle âm thanh `CHIME_THROTTLE_MS = 800ms`.

## Migration Plan

1. **Backend**: Cập nhật `OrderWorkflowService.php` để cho phép bước chuyển `in_repair` -> `ready_for_return` và xử lý hook QC.
2. **Packages UI**:
   - Cập nhật `AppSidebar.tsx` với quyền tinh gọn cho role `tech`.
   - Cập nhật `NotificationPopover.tsx` bỏ nút mute/test sound.
3. **Frontend Core & Utilities**:
   - Cập nhật `audioChime.ts` với `DynamicsCompressorNode`, dual-tone C6->E6 và volume 1.0.
   - Cập nhật `socketNotifications.ts` để map `tech` -> `technician` channels.
   - Cập nhật `IntakeWizardModal.tsx` tắt tự kích chuông tại máy CSKH.
   - Cập nhật `repairs/fsm.ts` và `repairs/page.tsx` phân quyền nút theo role CSKH.
   - Tái cấu trúc `tech/page.tsx` theo chuẩn Grab-style 1 màn hình với 3 KPI.
