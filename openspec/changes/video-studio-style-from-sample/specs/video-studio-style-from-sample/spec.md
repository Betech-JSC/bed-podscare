# Spec Delta: Học Phong Cách Dựng Từ Video Mẫu & Tinh Gọn Giao Diện (`video-studio-style-from-sample`)

## Purpose

Cung cấp khả năng trích xuất hồ sơ phong cách dựng từ video mẫu (`style_profile.json`), hợp nhất tham số theo 4 tầng ưu tiên có truy vết (`effective_profile.json`, `profile_trace.json`), đối chiếu độ khớp sau xuất bản (`style_match.json`), bổ sung giao diện chọn/lưu phong cách từ video mẫu ở Trạng thái Chuẩn bị và bảng đối chiếu ở Trạng thái Kết quả, đồng thời gỡ bỏ công tắc `"Chế độ chuyên sâu"` trên `/video-studio`.

## ADDED Requirements

### Requirement: Định nghĩa Schema và chuẩn hóa Unicode NFC cho hồ sơ phong cách (Stage S0)
Module `tools/video-pipeline/schemas/pipeline_schemas.py` SHALL định nghĩa đầy đủ JSON Schema, lớp dữ liệu (`StyleProfile`, `EffectiveProfile`, `ProfileTrace`, `ProfileTraceEntry`, `StyleMatchReport`, `StyleMatchItem`) và bộ kiểm định miền dữ liệu cho 4 tệp `style_profile.json`, `effective_profile.json`, `profile_trace.json`, `style_match.json`, đồng thời chuẩn hóa mọi chuỗi tiếng Việt về dạng Unicode NFC và giữ tương thích ngược với 7 schema hiện có.

#### Scenario: Chuẩn hóa chuỗi tiếng Việt NFD sang NFC khi khởi tạo và kiểm định Schema
- **WHEN** khởi tạo `StyleProfile`, `EffectiveProfile`, `ProfileTrace`, hoặc `StyleMatchReport` với chuỗi tiếng Việt ở dạng tổ hợp Unicode NFD (ví dụ tên phong cách, lý do truy vết, hoặc ghi chú bằng chứng)
- **THEN** hệ thống MUST tự động chuẩn hóa toàn bộ các trường chuỗi về dạng Unicode NFC (`unicodedata.normalize("NFC", ...)`) và vượt qua kiểm định `validate_artifact()`

#### Scenario: Kiểm định mức độ tự tin và bằng chứng trong style_profile.json
- **WHEN** gọi `validate_style_profile(data)` hoặc `validate_artifact("style_profile", data)`
- **THEN** hệ thống MUST kiểm tra đủ các nhóm (`source`, `format`, `pacing`, `hook`, `captions`, `audio`, `titlecard`, `punchin`, `confidence`, `evidence`) và chỉ chấp nhận các giá trị `confidence` thuộc tập `{"measured", "estimated", "assumed"}`

---

### Requirement: Phân tích video mẫu có bằng chứng và giới hạn thời lượng phân tích (Stage S1)
Module `phases/ps1_style_analyzer.py` SHALL phân tích tối đa `90` giây đầu (`analyzed_ms <= 90000`) của video mẫu để xuất `style_profile.json` kèm mức độ tự tin (`confidence`) và bằng chứng (`evidence`) cụ thể cho từng nhóm chỉ số, đồng thời hỗ trợ lưu hồ sơ tái sử dụng vào `memory/styles/<style_id>.json`.

#### Scenario: Đo đạc chỉ số từ video mẫu và ghi nhận bằng chứng
- **WHEN** người dùng cung cấp một file video mẫu hợp lệ cho `ps1_style_analyzer.py`
- **THEN** hệ thống MUST đo định dạng (`width`, `height`, `fps`, `aspect`), nhịp nghỉ (`pause_median_ms`, `pause_p90_ms`, `max_silence_kept_ms`, `shots_per_min`), mở đầu (`duration_ms`, `style`, `text_overlay`, `repeated_later`), phụ đề (`present`, `position`, `words_per_line`, `lines`, `highlight`, `font_class`), âm lượng (`lufs`, `true_peak_db`, `lra`), bảng chữ đầu (`titlecard.present`) và phóng khung hình (`punchin.detected`, `min_gap_s`, `scale`) kèm `confidence` và `evidence`

---

### Requirement: Ánh xạ phong cách sang tham số pipeline và kẹp biên an toàn (Stage S2)
Module `phases/ps2_style_applier.py` SHALL hợp nhất tham số theo thứ tự ưu tiên 4 tầng (`user_override > sample_style > template > default_profile`), thực thi các ràng buộc an toàn và xuất `work/effective_profile.json` cùng `work/profile_trace.json`.

#### Scenario: Giải quyết thứ tự ưu tiên 4 tầng và ghi nhận profile_trace.json
- **WHEN** một tham số có mặt ở nhiều nguồn (`user_override`, `sample_style`, `template`, `default_profile`)
- **THEN** hệ thống MUST chọn giá trị từ nguồn có độ ưu tiên cao nhất đang có hiệu lực và ghi lại nguồn được chọn, các nguồn bị bỏ qua cùng lý do vào `work/profile_trace.json`

#### Scenario: Giữ nguyên tốc độ phát 1.0x và không tự đổi tỉ lệ khung hình
- **WHEN** `style_profile.json` có tốc độ nói (`words_per_min`) nhanh/chậm hơn hoặc có tỉ lệ khung hình (`format.aspect`) khác với video gốc mới
- **THEN** hệ thống MUST giữ nguyên `playback_speed = 1.0`, giữ nguyên khung hình gốc của video mới (không tự crop hoặc pad sang tỉ lệ khác), và ghi cảnh báo rõ ràng vào `profile_trace.json`

#### Scenario: Kẹp biên an toàn cho mục tiêu âm lượng và kiểm soát điều kiện bật Punch-in
- **WHEN** `audio.lufs` của video mẫu nằm ngoài khoảng `[-23.0, -9.0]` LUFS hoặc `punchin` có `confidence == "assumed"` / thiếu `evidence`
- **THEN** hệ thống MUST kẹp `audio.target_lufs` vào trong đoạn `[-23.0, -9.0]` LUFS với `true_peak_max_db <= -1.0` dBTP, và chỉ bật `punchin.enabled = true` khi `confidence` đạt `"measured"` hoặc `"estimated"` kèm bằng chứng mốc thời gian cụ thể

#### Scenario: Không tự thêm phụ đề khi video mẫu không có phụ đề
- **WHEN** `style_profile.captions.present == false` và người dùng không chủ động bật phụ đề
- **THEN** hệ thống MUST đặt `effective_profile.captions.enabled = false` để không đốt phụ đề vào video hoàn chỉnh

---

### Requirement: Đối chiếu độ khớp đầu ra với video mẫu theo dung sai (Stage S3)
Hệ thống SHALL đối chiếu các chỉ số của video xuất ra với `style_profile.json` theo dung sai quy định và xuất báo cáo `work/style_match.json`.

#### Scenario: Đánh giá độ khớp theo dung sai và phân tách chỉ báo thông tin
- **WHEN** quá trình xuất video hoàn tất và có sử dụng phong cách từ video mẫu
- **THEN** hệ thống MUST kiểm tra Âm lượng (`±1.0 LU`), Khoảng lặng trung vị giữa câu (`±30%`), Độ dài mở đầu (`±1500 ms`), Phụ đề (`±1` từ/dòng và cùng vị trí `position`), và đánh dấu Nhịp cắt (`shots/min`, `±30%`) ở mức `informational` (không làm fail kết quả chung)

---

### Requirement: Giao diện chọn phong cách mẫu, bảng đối chiếu kết quả và gỡ công tắc Chế độ chuyên sâu (Stage S4)
Giao diện `/video-studio` SHALL gỡ bỏ công tắc `"Chế độ chuyên sâu"`, bổ sung khối **"Phong cách theo video mẫu (không bắt buộc)"** ở Trạng thái Chuẩn bị và mục thu gọn **"So với video mẫu"** ở Trạng thái Kết quả, hiển thị chuẩn trên cả 3 kích thước màn hình (`1440px`, `768px`, `390px`).

#### Scenario: Cấu hình phong cách từ video mẫu ở Trạng thái Chuẩn bị
- **WHEN** người dùng mở khối **"Phong cách theo video mẫu (không bắt buộc)"** và tải lên video mẫu hoặc chọn một phong cách đã lưu
- **THEN** giao diện MUST hiển thị các công tắc theo nhóm (`Nhịp cắt & khoảng lặng`, `Mở đầu / Hook`, `Phụ đề`, `Âm lượng`, `Nhấn khung hình / Punch-in`) kèm nhãn độ tin cậy (`"Chắc chắn"` cho `measured`, `"Ước lượng"` cho `estimated`), dòng lưu ý *"Chưa áp dụng được: nhạc nền, hiệu ứng, màu phim"*, và ô nhập tên để lưu phong cách tái sử dụng

#### Scenario: Xem bảng đối chiếu So với video mẫu ở Trạng thái Kết quả
- **WHEN** quá trình cắt video có áp dụng phong cách mẫu hoàn tất và chuyển sang Trạng thái Kết quả
- **THEN** giao diện MUST hiển thị mục thu gọn **"So với video mẫu"** liệt kê giá trị Mẫu, giá trị Xuất ra, độ lệch/dung sai và trạng thái (`Khớp` / `Lệch` / `Thông tin`) cho từng chỉ số
