# Proposal: Học Phong Cách Dựng Từ Video Mẫu & Tinh Gọn Giao Diện (`/video-studio`) (`video-studio-style-from-sample`)

## Why

Hiện tại trang `/video-studio` và bộ công cụ `tools/video-pipeline/` đã hỗ trợ quy trình cắt video tự động một chạm (Simple Mode P0 → P8), nhưng vẫn tồn tại hai khoảng trống lớn về trải nghiệm người dùng và khả năng điều khiển chất lượng đầu ra:

1. **Chưa hỗ trợ trích xuất và áp dụng phong cách dựng từ video mẫu (`sample video`)**:
   - Người dùng thường có sẵn một video mẫu đã dựng ưng ý (ví dụ một tập Reels/TikTok/Podcast cũ của kênh hoặc video tham khảo) và muốn video mới có nhịp cắt, độ dài khoảng nghỉ giữa câu, cách mở đầu (Hook), kiểu trình bày phụ đề, mức âm lượng và nhịp phóng khung hình tương đương.
   - Hiện tại người dùng chỉ có thể chọn 3 mức cắt cố định (`Nhẹ` / `Vừa` / `Mạnh`) và 3 mẫu khung hình (`Podcast ngang`, `Podcast dọc`, `Chỉ cắt`), chưa có cơ chế đo đạc định lượng từ video mẫu thành hồ sơ phong cách (`style_profile.json`) có gắn mức độ tự tin (`confidence: measured | estimated | assumed`) và bằng chứng mốc thời gian (`evidence`).
2. **Thiếu cơ chế hợp nhất tham số có truy vết (`profile_trace.json`) và kiểm định độ khớp đầu ra (`style_match.json`)**:
   - Khi kết hợp nhiều nguồn cấu hình (người dùng chỉnh tay, phong cách từ video mẫu, mẫu template, và `memory/profile.yaml` mặc định), hệ thống cần một quy tắc ưu tiên 4 tầng tường minh kèm kẹp biên an toàn (không tự đổi tốc độ phát, không tự cắt cúp đổi tỉ lệ khung hình khi video mẫu khác tỉ lệ video gốc, giới hạn âm lượng trong ngưỡng an toàn `-23` đến `-9` LUFS, và chỉ áp dụng phóng khung hình khi có bằng chứng đo đạc).
   - Sau khi xuất video, người dùng cần bảng đối chiếu khách quan giữa video xuất ra và video mẫu theo từng chỉ số kèm dung sai rõ ràng.
3. **Công tắc `"Chế độ chuyên sâu"` trên thanh điều hướng gây phân mảnh trải nghiệm**:
   - Việc duy trì hai chế độ tách biệt làm rối giao diện đối với người dùng phổ thông. Giao diện cần được thống nhất thành một luồng làm việc duy nhất, gọn gàng, tích hợp khối tùy chọn **"Phong cách theo video mẫu (không bắt buộc)"** ở Trạng thái Chuẩn bị và mục thu gọn **"So với video mẫu"** ở Trạng thái Kết quả.

## What Changes

- **Giai đoạn S0 — Thiết kế OpenSpec & Schema (`tools/video-pipeline/schemas/pipeline_schemas.py`)**:
  - Định nghĩa 4 schema JSON và lớp dữ liệu chuẩn hóa Unicode NFC trong `tools/video-pipeline/schemas/pipeline_schemas.py`:
    1. `style_profile.json` (`StyleProfile` và các lớp con `StyleSource`, `StyleFormat`, `StylePacing`, `StyleHook`, `StyleCaptions`, `StyleAudio`, `StyleTitlecard`, `StylePunchin`).
    2. `effective_profile.json` (`EffectiveProfile` — hồ sơ tham số thực tế sau khi hợp nhất 4 tầng ưu tiên và kẹp biên an toàn).
    3. `profile_trace.json` (`ProfileTrace`, `ProfileTraceEntry` — bảng truy vết nguồn gốc từng tham số `user_override | sample_style | template | default_profile`, giá trị trước/sau kẹp biên, cờ công tắc nhóm và lý do bỏ qua/cảnh báo).
    4. `style_match.json` (`StyleMatchReport`, `StyleMatchItem` — báo cáo đối chiếu chỉ số video xuất ra với video mẫu theo dung sai).
  - Thiết lập đặc tả ánh xạ phong cách → tham số pipeline, thứ tự ưu tiên 4 tầng, bảng dung sai `style_match`, và wireframe ASCII ở 3 cỡ màn hình (`1440px`, `768px`, `390px`).
- **Giai đoạn S1 — Bộ phân tích phong cách từ video mẫu (`phases/ps1_style_analyzer.py`)**:
  - Phân tích tối đa `90` giây đầu của video mẫu để đo đạc định dạng khung hình, nhịp nói & khoảng nghỉ giữa câu, cấu trúc mở đầu (Hook), vùng phụ đề, âm lượng (`LUFS`, `True Peak`, `LRA`), bảng chữ đầu video và nhịp phóng khung hình (`punch-in`).
  - Ghi nhận minh bạch `confidence` (`measured | estimated | assumed`) và `evidence` (mốc thời gian/khung hình cụ thể) cho từng nhóm, đồng thời hỗ trợ lưu hồ sơ tái sử dụng vào `memory/styles/<style_id>.json`.
- **Giai đoạn S2 — Bộ hợp nhất tham số 4 tầng & kẹp biên an toàn (`phases/ps2_style_applier.py`)**:
  - Hợp nhất cấu hình theo thứ tự ưu tiên: **Người dùng nhập tay (`user_override`) > Phong cách mẫu theo công tắc bật (`sample_style`) > Mẫu template (`template`) > `profile.yaml` mặc định (`default_profile`)**.
  - Thực thi các quy tắc bảo vệ: giữ nguyên tốc độ phát `1.0x`, không tự đổi tỉ lệ khung hình khi khác cảnh quay mới, kẹp mục tiêu âm lượng trong khoảng `[-23.0, -9.0]` LUFS với đỉnh thực `<= -1.0` dBTP, kiểm tra họ chữ hỗ trợ đầy đủ dấu tiếng Việt, và chỉ bật `punchin` khi `confidence` đạt `measured` hoặc `estimated` kèm bằng chứng mốc thời gian.
  - Xuất `work/effective_profile.json` và `work/profile_trace.json`.
- **Giai đoạn S3 — Tích hợp Pipeline & Kiểm định độ khớp (`style_match.json`)**:
  - Kết nối `effective_profile.json` vào các bước P3, P5, P6, P6a, P6b, P6c, P6d và bổ sung bước đánh giá độ khớp sau xuất bản để sinh `work/style_match.json`.
- **Giai đoạn S4 — Cập nhật Giao diện `/video-studio` & Gỡ công tắc Chế độ chuyên sâu**:
  - Gỡ bỏ công tắc `"Chế độ chuyên sâu"` khỏi thanh điều hướng `SimpleStudioHeader` và luồng trang `/video-studio`.
  - Bổ sung khối **"Phong cách theo video mẫu (không bắt buộc)"** ở Trạng thái Chuẩn bị (chọn/tải video mẫu hoặc chọn phong cách đã lưu, danh sách công tắc nhóm kèm nhãn độ tin cậy `"Chắc chắn"` / `"Ước lượng"`, dòng lưu ý *"Chưa áp dụng được: nhạc nền, hiệu ứng, màu phim"*, và ô lưu tên phong cách).
  - Bổ sung mục thu gọn **"So với video mẫu"** ở Trạng thái Kết quả để hiển thị bảng đối chiếu giữa video mẫu và video xuất ra.

## Capabilities

### New Capabilities
- `video-studio-style-from-sample`: Phân tích phong cách dựng từ video mẫu (`style_profile.json`), hợp nhất tham số 4 tầng ưu tiên có truy vết (`effective_profile.json`, `profile_trace.json`), đối chiếu độ khớp đầu ra (`style_match.json`), tích hợp giao diện chọn phong cách mẫu và gỡ bỏ công tắc Chế độ chuyên sâu trên `/video-studio`.

### Modified Capabilities
<!-- Không sửa đổi các capability nghiệp vụ ERP/POS trong openspec/specs/ -->

## Impact

- **`tools/video-pipeline/`**:
  - Cập nhật tại S0: `schemas/pipeline_schemas.py` (thêm JSON Schema, lớp dữ liệu chuẩn hóa NFC và hàm kiểm tra cho `style_profile`, `effective_profile`, `profile_trace`, `style_match`).
  - Dự kiến ở các giai đoạn tiếp theo (S1 → S3): thêm `phases/ps1_style_analyzer.py`, `phases/ps2_style_applier.py`, thư mục `memory/styles/`, và tích hợp vào `cli.py` cùng các phase P3–P8.
- **`apps/web/`**:
  - Dự kiến ở giai đoạn S4: cập nhật `SimpleStudioHeader.tsx`, `SimplePrepareState.tsx`, `SimpleResultState.tsx`, `page.tsx`, và các API routes trong `src/app/api/video-studio/`.
- **`apps/api/` & Database**: Không tác động tới cơ sở dữ liệu hay các API Laravel ERP/POS.
