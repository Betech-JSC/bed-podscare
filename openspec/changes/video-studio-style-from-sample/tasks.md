# Tasks: Học Phong Cách Dựng Từ Video Mẫu & Tinh Gọn Giao Diện (`video-studio-style-from-sample`)

## 0. Giai đoạn S0 — Thiết kế OpenSpec & Schema (`GATE S1`)

- [x] S0.1 Khởi tạo OpenSpec change `video-studio-style-from-sample` (`proposal.md`, `design.md`, `specs/video-studio-style-from-sample/spec.md`, `tasks.md`) và kiểm chứng hợp lệ qua `openspec validate video-studio-style-from-sample`.
- [x] S0.2 Bổ sung 4 schema và lớp dữ liệu (`StyleProfile`, `EffectiveProfile`, `ProfileTrace`, `ProfileTraceEntry`, `StyleMatchReport`, `StyleMatchItem`) vào `tools/video-pipeline/schemas/pipeline_schemas.py` kèm chuẩn hóa Unicode NFC tự động cho tiếng Việt và giữ tương thích ngược với 7 schema hiện có.
- [x] S0.3 Đặc tả chi tiết bảng ánh xạ từ `style_profile.json` sang các tham số của P3, P5, P6, P6a, P6b, P6c, P6d kèm các ràng buộc kẹp biên an toàn trong `design.md`.
- [x] S0.4 Đặc tả thứ tự ưu tiên 4 tầng (`user_override > sample_style > template > default_profile`) và cấu trúc truy vết `work/profile_trace.json` trong `design.md`.
- [x] S0.5 Đặc tả bảng dung sai kiểm tra độ khớp `work/style_match.json` (Loudness `±1.0 LU`, Pause median `±30%`, Hook duration `±1,5s`, Captions `±1` từ/dòng & cùng vị trí, `shots/min` `±30%` chỉ báo thông tin) trong `design.md`.
- [x] S0.6 Vẽ wireframe ASCII ở 3 cỡ màn hình (`1440px`, `768px`, `390px`) cho khối `"Phong cách theo video mẫu (không bắt buộc)"`, mục thu gọn `"So với video mẫu"`, và khu vực cấu hình sau khi gỡ công tắc `"Chế độ chuyên sâu"`.

## 1. Giai đoạn S1 — Bộ phân tích phong cách từ video mẫu (`ps1_style_extract.py` / `ps1_style_analyzer.py`)

- [x] S1.1 Xây dựng `tools/video-pipeline/phases/ps1_style_extract.py` (cùng wrapper tương thích `ps1_style_analyzer.py`) phân tích tối đa 5 phút đầu (`300.000 ms`) của video mẫu (`ffprobe`, `ebur128`, STT `words.json`, scene cut & vùng phụ đề) để xuất `style_profile.json` có đầy đủ `confidence` và `evidence`.
- [x] S1.2 Hỗ trợ lưu trữ và quản lý các hồ sơ phong cách tái sử dụng trong `tools/video-pipeline/memory/styles/<style_id>.json` (chống trùng lặp theo `source.sha256` kèm bằng chứng `evidence/<style_id>/evidence.json`) và kiểm chứng qua `--self-test` + unit tests.

## 2. Giai đoạn S2 — Bộ hợp nhất tham số 4 tầng & truy vết (`ps2_style_applier.py`)

- [x] S2.1 Xây dựng `tools/video-pipeline/phases/ps2_style_applier.py` giải quyết thứ tự ưu tiên 4 tầng (`user_override > sample_style > template > default_profile`) theo trạng thái bật/tắt của từng công tắc nhóm.
- [x] S2.2 Thực thi đầy đủ các quy tắc bảo vệ (giữ tốc độ phát `1.0x`, không tự đổi tỉ lệ khung hình khi khác video mới, kẹp `target_lufs` trong `[-23.0, -9.0]` LUFS và `true_peak_max_db <= -1.0` dBTP, kiểm tra họ chữ tiếng Việt, chỉ bật `punchin` khi `confidence >= estimated` có `evidence`), xuất `work/effective_profile.json` và `work/profile_trace.json`.

## 3. Giai đoạn S3 — Tích hợp Pipeline & Kiểm tra độ khớp (`style_match.json`)

- [x] S3.1 Kết nối `effective_profile.json` vào `p3_acoustic_detect.py`, `p5_hook_agent.py`, `p6_cutlist.py`, `p6a_audio_clean.py`, `p6b_captions.py`, `p6c_punchin.py`, `p6d_titlecard.py` và `cli.py`.
- [x] S3.2 Bổ sung bộ đối chiếu sau xuất bản để đo đạc và sinh `work/style_match.json` theo đúng bảng dung sai S0.5, tích hợp vào `p8_qa.py` và kết quả trả về của job.

## 4. Giai đoạn S4 — Giao diện `/video-studio`, API Phong cách mẫu & Gỡ công tắc Chế độ chuyên sâu

- [x] S4.1 Bổ sung API phân tích/lưu/liệt kê phong cách video mẫu trong `apps/web/src/app/api/video-studio/` và mở rộng `run`/`result` routes để nhận `styleProfile` + `enabledStyleGroups` và trả về `styleMatch` + `profileTrace`.
- [x] S4.2 Gỡ bỏ công tắc `"Chế độ chuyên sâu"` khỏi `SimpleStudioHeader.tsx` và `apps/web/src/app/video-studio/page.tsx`.
- [x] S4.3 Xây dựng khối `"Phong cách theo video mẫu (không bắt buộc)"` trong `SimplePrepareState.tsx` và mục thu gọn `"So với video mẫu"` trong `SimpleResultState.tsx` theo đúng wireframe ASCII ở 3 kích thước `1440px`, `768px`, `390px`, kiểm chứng bằng `npm run build` và trình duyệt thật.
