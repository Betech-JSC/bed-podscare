# Design: Học Phong Cách Dựng Từ Video Mẫu & Tinh Gọn Giao Diện (`/video-studio`) (`video-studio-style-from-sample`)

## Context

Xem `proposal.md` để nắm lý do thay đổi. Sau khi hoàn thiện luồng cắt tự động một chạm (Simple Mode P0 → P8), người dùng cần khả năng nạp một **video mẫu (`sample video`)** hoặc chọn một **phong cách đã lưu (`memory/styles/<style_id>.json`)** để hệ thống đo đạc các chỉ số dựng có thể kiểm chứng và áp dụng sang video mới, đồng thời loại bỏ công tắc `"Chế độ chuyên sâu"` trên thanh điều hướng để thống nhất một trải nghiệm gọn gàng duy nhất.

Thiết kế này tuân thủ nguyên tắc **Đo đạc có bằng chứng — Hợp nhất có truy vết — Kẹp biên an toàn — Đối chiếu sau xuất bản**:
1. Mọi chỉ số trích xuất từ video mẫu đều phải kèm mức độ tự tin (`confidence: measured | estimated | assumed`) và bằng chứng mốc thời gian/khung hình (`evidence`).
2. Các yếu tố không thể trích xuất hoặc tái tạo đáng tin cậy từ một file video phẳng đã xuất (như tách nhạc nền để ghép lại, hiệu ứng chuyển cảnh phức tạp, hay bảng màu phim LUT) được thông báo thẳng thắn trên giao diện: **"Chưa áp dụng được: nhạc nền, hiệu ứng, màu phim"**.
3. Không bao giờ tự ý làm biến dạng video mới: **không đổi tốc độ phát (`playback_speed = 1.0x`)** và **không tự cắt/đệm đổi tỉ lệ khung hình (`format.aspect`)** khi video mẫu khác tỉ lệ với video gốc mới.

---

## Goals / Non-Goals

**Goals:**
- Chuẩn hóa 4 schema dữ liệu mới trong `tools/video-pipeline/schemas/pipeline_schemas.py` (`style_profile.json`, `effective_profile.json`, `profile_trace.json`, `style_match.json`) có chuẩn hóa Unicode NFC tự động cho mọi chuỗi tiếng Việt và tương thích ngược với 7 schema hiện hữu.
- Quy định rõ bảng ánh xạ từ `style_profile.json` sang các tham số thực thi của P3, P5, P6, P6a, P6b, P6c, P6d kèm điều kiện kẹp biên an toàn.
- Thiết lập cơ chế giải quyết xung đột tham số 4 tầng ưu tiên (`user_override > sample_style > template > default_profile`) và lưu vết chi tiết vào `work/profile_trace.json`.
- Thiết lập bảng dung sai kiểm tra độ khớp đầu ra (`work/style_match.json`) giữa video xuất ra và video mẫu.
- Thiết kế wireframe ASCII ở cả 3 kích thước màn hình (`1440px` Desktop, `768px` Tablet, `390px` Mobile) cho khối **"Phong cách theo video mẫu (không bắt buộc)"**, mục thu gọn **"So với video mẫu"**, và bố cục tổng thể sau khi gỡ bỏ công tắc `"Chế độ chuyên sâu"`.

**Non-Goals:**
- Không thay đổi tốc độ phát giọng nói (`playback speed` luôn giữ ở `1.0x`).
- Không tự động crop/pad chuyển đổi tỉ lệ khung hình (ví dụ từ `16:9` sang `9:16` hoặc ngược lại) chỉ vì video mẫu có tỉ lệ khác video mới.
- Không sao chép nhạc nền, hiệu ứng hình ảnh đặc biệt hoặc bảng màu phim (color grading) từ video mẫu.
- Không tác động đến cơ sở dữ liệu hay các phân hệ ERP/POS.

---

## 1. Schema Chi Tiết & Chuẩn Hóa Unicode NFC (S0.2)

Mọi chuỗi ký tự tiếng Việt trong các hồ sơ JSON (`name`, ghi chú bằng chứng trong `evidence`, lý do truy vết `reason`, thông điệp cảnh báo `warnings`, nhãn đối chiếu trong `style_match.json`) đều được chuẩn hóa về dạng **Unicode NFC** (`unicodedata.normalize("NFC", text)`) ngay khi khởi tạo đối tượng hoặc trước khi kiểm định schema, ngăn ngừa lỗi lệch dấu tổ hợp (NFD) trên macOS.

### 1.1. Schema `style_profile.json` (`StyleProfile`)

Lưu trữ kết quả đo đạc từ tối đa `90` giây đầu (`analyzed_ms <= 90000`) của video mẫu.

```json
{
  "style_id": "style_ab12",
  "name": "Podcast dọc nhịp nhanh PodsCare",
  "source": {
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "duration_ms": 62400,
    "analyzed_ms": 62400
  },
  "format": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "aspect": "9:16",
    "template": "podcast_vertical"
  },
  "pacing": {
    "words_per_min": 168.5,
    "pause_median_ms": 240,
    "pause_p90_ms": 520,
    "max_silence_kept_ms": 650,
    "shots_per_min": 18.2,
    "jump_cut_ratio": 0.65
  },
  "hook": {
    "duration_ms": 6200,
    "style": "question",
    "text_overlay": true,
    "repeated_later": true,
    "time_to_first_word_ms": 180
  },
  "captions": {
    "present": true,
    "position": "bottom_center",
    "words_per_line": 3,
    "lines": 1,
    "highlight": "keyword_color",
    "font_class": "sans_bold",
    "text_color": "#FFFFFF",
    "highlight_color": "#FFD60A"
  },
  "audio": {
    "lufs": -14.2,
    "true_peak_db": -1.2,
    "lra": 6.4,
    "music_detected": false
  },
  "titlecard": {
    "present": true
  },
  "punchin": {
    "detected": true,
    "min_gap_s": 5.5,
    "scale": 1.08
  },
  "confidence": {
    "format": "measured",
    "pacing": "measured",
    "hook": "estimated",
    "captions": "estimated",
    "audio": "measured",
    "titlecard": "estimated",
    "punchin": "estimated"
  },
  "evidence": {
    "format": {
      "stream_index": 0,
      "codec_name": "h264",
      "sample_frames": [0]
    },
    "pacing": {
      "pause_samples_ms": [180, 220, 240, 310, 520],
      "cut_timestamps_ms": [3200, 6200, 9800, 14100]
    },
    "hook": {
      "start_ms": 0,
      "end_ms": 6200,
      "matched_repeat_ms": [24500, 30700],
      "first_sentence": "Tai nghe AirPods Pro bị rè một bên có sửa được không?"
    },
    "captions": {
      "sample_timestamps_ms": [1200, 4500, 8900],
      "bbox_norm": [0.12, 0.76, 0.88, 0.86]
    },
    "audio": {
      "window_ms": [0, 62400],
      "filter": "ebur128"
    },
    "titlecard": {
      "start_ms": 0,
      "end_ms": 2800,
      "sample_frames": [15, 45]
    },
    "punchin": {
      "events": [
        {"start_ms": 6200, "end_ms": 9400, "estimated_scale": 1.08, "frame_pair": [185, 190]},
        {"start_ms": 15800, "end_ms": 18900, "estimated_scale": 1.07, "frame_pair": [473, 478]}
      ]
    }
  }
}
```

**Giải thích các trường và quy ước:**
- `style_id` (`string`, bắt buộc): Định danh duy nhất của hồ sơ phong cách (ví dụ `style_ab12`, khớp mẫu `^style_[a-z0-9_]+$` hoặc chuỗi định danh không rỗng).
- `name` (`string`): Tên hiển thị tiếng Việt do người dùng đặt hoặc tự sinh (chuẩn hóa NFC, có thể rỗng `""` khi mới phân tích nháp).
- `source` (`object`, bắt buộc):
  - `sha256` (`string`): Mã băm SHA-256 của file video mẫu dùng để nhận diện trùng lặp và cache kết quả phân tích.
  - `duration_ms` (`integer >= 0`): Tổng thời lượng gốc của video mẫu (mili-giây).
  - `analyzed_ms` (`integer >= 0`, `<= duration_ms`): Thời lượng thực tế đã trích xuất để phân tích (tối đa `90000` ms đầu).
- `format` (`object`, bắt buộc):
  - `width` (`integer > 0`), `height` (`integer > 0`), `fps` (`number > 0`).
  - `aspect` (`string`): Tỉ lệ khung hình rút gọn (`"9:16"`, `"16:9"`, `"1:1"`, `"4:5"`...).
  - `template` (`string`, enum: `"podcast_horizontal" | "podcast_vertical" | "cut_only"`).
- `pacing` (`object`, bắt buộc):
  - `words_per_min` (`number >= 0`): Tốc độ từ/phút đo từ STT trên video mẫu (chỉ dùng để tham khảo nhịp nói, không dùng để tua nhanh giọng).
  - `pause_median_ms` (`number >= 0`): Trung vị độ dài các khoảng nghỉ giữa câu/cụm từ được giữ lại trong video mẫu.
  - `pause_p90_ms` (`number >= 0`, `>= pause_median_ms`): Phân vị thứ 90 của khoảng nghỉ được giữ lại.
  - `max_silence_kept_ms` (`number >= 0`): Khoảng lặng dài nhất được giữ lại trong đoạn mẫu phân tích.
  - `shots_per_min` (`number >= 0`): Số cú cắt chuyển cảnh trên mỗi phút.
  - `jump_cut_ratio` (`number`, `0.0 .. 1.0`): Tỉ lệ các điểm cắt là jump-cut trên cùng một góc máy.
- `hook` (`object`, bắt buộc):
  - `duration_ms` (`number >= 0`): Độ dài đoạn mở đầu (mili-giây).
  - `style` (`string`, enum: `"question" | "teaser" | "statement"`): Kiểu mở đầu nhận diện được.
  - `text_overlay` (`boolean`): Có lớp chữ tiêu đề lớn xuất hiện trong đoạn mở đầu hay không.
  - `repeated_later` (`boolean`): Đoạn mở đầu có xuất hiện lặp lại ở phần thân video hay không (dấu hiệu của `cold_open_duplicate` / `teaser_highlight`).
  - `time_to_first_word_ms` (`number >= 0`): Thời gian từ đầu video đến từ đầu tiên được phát âm.
- `captions` (`object`, bắt buộc):
  - `present` (`boolean`): Video mẫu có phụ đề đốt sẵn (burned-in) hay không.
  - `position` (`string`, enum: `"bottom_center" | "middle_center" | "top_center" | "lower_third"`).
  - `words_per_line` (`integer >= 0`): Số từ trung bình trên mỗi dòng phụ đề.
  - `lines` (`integer >= 0`): Số dòng phụ đề hiển thị đồng thời (`1` hoặc `2`).
  - `highlight` (`string`, enum: `"none" | "keyword_color" | "box"`): Kiểu nhấn mạnh từ khóa đang đọc.
  - `font_class` (`string`, enum: `"sans_bold" | "sans_regular" | "rounded_bold" | "serif_bold"`).
  - `text_color`, `highlight_color` (`string`): Mã màu HEX (ví dụ `"#FFFFFF"`, `"#FFD60A"`) hoặc chuỗi rỗng `""` nếu không xác định.
- `audio` (`object`, bắt buộc):
  - `lufs` (`number`): Độ lớn âm lượng tích hợp đo theo chuẩn EBU R128.
  - `true_peak_db` (`number`): Đỉnh thực âm thanh (dBTP).
  - `lra` (`number >= 0`): Độ rộng dải động âm lượng (Loudness Range - LU).
  - `music_detected` (`boolean | null`): Có phát hiện nhạc nền dưới giọng nói hay không (`null` nếu không xác định).
- `titlecard` (`object`, bắt buộc):
  - `present` (`boolean`): Có thẻ tiêu đề đầu video hay không.
- `punchin` (`object`, bắt buộc):
  - `detected` (`boolean`): Có phát hiện thao tác phóng nhẹ khung hình (`punch-in zoom`) hay không.
  - `min_gap_s` (`number | null`, `>= 0` khi khác `null`): Khoảng cách ngắn nhất giữa hai lần phóng liên tiếp (giây).
  - `scale` (`number | null`, `> 1.0` khi khác `null`): Tỉ lệ phóng ước lượng (ví dụ `1.08` tương ứng `108%`).
- `confidence` (`object`, bắt buộc): Bản đồ ánh xạ từng nhóm (`format`, `pacing`, `hook`, `captions`, `audio`, `titlecard`, `punchin`) sang một trong 3 mức độ tự tin:
  - `"measured"`: Đo trực tiếp từ metadata hoặc tín hiệu vật lý chính xác (`ffprobe`, `ebur128`, biên từ STT rõ ràng) — hiển thị nhãn **"Chắc chắn"** trên UI.
  - `"estimated"`: Suy luận có căn cứ từ thuật toán phát hiện cảnh/vùng chữ/khung hình kèm mẫu thời gian cụ thể — hiển thị nhãn **"Ước lượng"** trên UI.
  - `"assumed"`: Giá trị suy đoán mặc định khi tín hiệu trong video mẫu quá mờ hoặc không đủ mẫu — không tự động kích hoạt các biến đổi nhạy cảm như `punchin`.
- `evidence` (`object`, bắt buộc): Lưu trữ bằng chứng cụ thể (mốc thời gian `start_ms`/`end_ms`, danh sách khung hình `sample_frames`, tọa độ vùng chữ `bbox_norm`, hoặc danh sách sự kiện `events`) cho từng nhóm đo lường.

---

### 1.2. Schema `effective_profile.json` (`EffectiveProfile`)

Là hồ sơ tham số thực thi cuối cùng được ghi vào `work/effective_profile.json` sau khi bộ hợp nhất (`ps2_style_applier.py`) giải quyết thứ tự ưu tiên 4 tầng và áp dụng các ràng buộc kẹp biên an toàn. Các bước P3, P5, P6, P6a, P6b, P6c, P6d đọc trực tiếp từ hồ sơ này.

```json
{
  "schema_version": "1.0",
  "project_id": "demo_podscare_01",
  "style_id": "style_ab12",
  "template": "podcast_vertical",
  "playback_speed": 1.0,
  "enabled_groups": {
    "pacing": true,
    "hook": true,
    "captions": true,
    "audio": true,
    "punchin": true
  },
  "format": {
    "width": 1080,
    "height": 1920,
    "fps": 30.0,
    "aspect": "9:16",
    "keep_source_aspect": true
  },
  "pacing": {
    "pad_start_ms": 70,
    "pad_end_ms": 95,
    "merge_gap_ms": 180,
    "silence_threshold_ms": 520,
    "max_silence_ms": 650,
    "min_silence_ms": 380,
    "target_pause_median_ms": 240
  },
  "hook": {
    "min_ms": 4700,
    "max_ms": 7700,
    "target_ms": 6200,
    "preferred_style": "question",
    "prefer_opening_mode": "cold_open_duplicate",
    "text_overlay": true
  },
  "captions": {
    "enabled": true,
    "position": "bottom_center",
    "words_per_line": 3,
    "max_lines": 1,
    "highlight": "keyword_color",
    "font_class": "sans_bold",
    "font_family": "Be Vietnam Pro",
    "text_color": "#FFFFFF",
    "highlight_color": "#FFD60A"
  },
  "audio": {
    "target_lufs": -14.2,
    "true_peak_max_db": -1.0,
    "lra_target": 11.0
  },
  "titlecard": {
    "enabled": true,
    "duration_ms": 3000
  },
  "punchin": {
    "enabled": true,
    "min_gap_ms": 5500,
    "scale": 1.08,
    "min_shot_duration_ms": 2500
  },
  "warnings": []
}
```

**Ràng buộc miền dữ liệu (`_validate_effective_profile_domain`):**
- `playback_speed` bắt buộc bằng `1.0` (không cho phép thay đổi tốc độ phát).
- `audio.target_lufs` phải nằm trong đoạn an toàn `[-23.0, -9.0]` LUFS; `audio.true_peak_max_db <= -1.0` dBTP.
- `hook.min_ms > 0` và `hook.max_ms >= hook.min_ms`.
- `captions.font_family` phải nằm trong tập họ chữ hỗ trợ đầy đủ dấu tiếng Việt (`"Be Vietnam Pro"`, `"Inter"`, `"Noto Sans"`, `"Manrope"`, `"DM Sans"`).

---

### 1.3. Schema `profile_trace.json` (`ProfileTrace` & `ProfileTraceEntry`)

Lưu vết minh bạch tại `work/profile_trace.json` cho từng khóa tham số: lấy từ nguồn nào trong 4 tầng ưu tiên, giá trị trước/sau khi kẹp biên an toàn, và lý do nếu một tham số từ video mẫu bị bỏ qua hoặc bị giới hạn.

```json
{
  "schema_version": "1.0",
  "project_id": "demo_podscare_01",
  "style_id": "style_ab12",
  "priority_order": [
    "user_override",
    "sample_style",
    "template",
    "default_profile"
  ],
  "enabled_groups": {
    "pacing": true,
    "hook": true,
    "captions": true,
    "audio": true,
    "punchin": true
  },
  "entries": [
    {
      "param": "pacing.silence_threshold_ms",
      "group": "pacing",
      "source": "sample_style",
      "raw_value": 520,
      "effective_value": 520,
      "clamped": false,
      "skipped_sources": {
        "template": 600,
        "default_profile": 400
      },
      "confidence": "measured",
      "reason": "Áp dụng pause_p90_ms (520ms) từ video mẫu do nhóm Nhịp cắt & khoảng lặng đang bật."
    },
    {
      "param": "audio.target_lufs",
      "group": "audio",
      "source": "sample_style",
      "raw_value": -7.5,
      "effective_value": -9.0,
      "clamped": true,
      "skipped_sources": {
        "default_profile": -14.0
      },
      "confidence": "measured",
      "reason": "Giá trị âm lượng video mẫu (-7.5 LUFS) vượt ngưỡng an toàn nên được kẹp về -9.0 LUFS."
    },
    {
      "param": "format.aspect",
      "group": "format",
      "source": "default_profile",
      "raw_value": "9:16",
      "effective_value": "16:9",
      "clamped": false,
      "skipped_sources": {
        "sample_style": "9:16"
      },
      "confidence": "measured",
      "reason": "Video mẫu có tỉ lệ 9:16 khác với video gốc mới (16:9); giữ nguyên khung hình gốc để tránh cắt mất hình."
    }
  ],
  "warnings": [
    "Video mẫu có tỉ lệ 9:16 khác với video mới (16:9). Hệ thống giữ nguyên khung hình 16:9 của video mới."
  ]
}
```

---

### 1.4. Schema `style_match.json` (`StyleMatchReport` & `StyleMatchItem`)

Lưu kết quả đối chiếu giữa video xuất ra (`out/polished.mp4` hoặc `out/cut_master.mp4`) và `style_profile.json` của video mẫu tại `work/style_match.json`.

```json
{
  "schema_version": "1.0",
  "project_id": "demo_podscare_01",
  "style_id": "style_ab12",
  "overall_status": "pass",
  "summary": "Các chỉ số âm lượng, khoảng nghỉ, độ dài mở đầu và phụ đề đều nằm trong ngưỡng dung sai so với video mẫu.",
  "items": [
    {
      "metric": "loudness_lufs",
      "label": "Âm lượng (LUFS)",
      "target_value": -14.2,
      "actual_value": -14.0,
      "unit": "LUFS",
      "tolerance": "±1.0 LU",
      "deviation": "+0.2 LU",
      "within_tolerance": true,
      "severity": "scored",
      "status": "matched",
      "note": "Khớp mục tiêu âm lượng trong dung sai ±1.0 LU."
    },
    {
      "metric": "pause_median_ms",
      "label": "Khoảng lặng giữa câu (trung vị)",
      "target_value": 240,
      "actual_value": 265,
      "unit": "ms",
      "tolerance": "±30%",
      "deviation": "+10.4%",
      "within_tolerance": true,
      "severity": "scored",
      "status": "matched",
      "note": "Độ lệch +10.4% nằm trong ngưỡng dung sai ±30%."
    },
    {
      "metric": "hook_duration_ms",
      "label": "Độ dài mở đầu (Hook)",
      "target_value": 6200,
      "actual_value": 5800,
      "unit": "ms",
      "tolerance": "±1500 ms",
      "deviation": "-400 ms",
      "within_tolerance": true,
      "severity": "scored",
      "status": "matched",
      "note": "Độ dài mở đầu chênh 0.4 giây, nằm trong ngưỡng ±1.5 giây."
    },
    {
      "metric": "captions_layout",
      "label": "Phụ đề (số từ/dòng & vị trí)",
      "target_value": "3 từ/dòng · bottom_center",
      "actual_value": "3 từ/dòng · bottom_center",
      "unit": "layout",
      "tolerance": "±1 từ/dòng & cùng vị trí",
      "deviation": "0 từ/dòng · khớp vị trí",
      "within_tolerance": true,
      "severity": "scored",
      "status": "matched",
      "note": "Cùng vị trí cuối giữa màn hình và số từ mỗi dòng khớp mục tiêu."
    },
    {
      "metric": "shots_per_min",
      "label": "Nhịp cắt (cảnh/phút)",
      "target_value": 18.2,
      "actual_value": 14.5,
      "unit": "shots/min",
      "tolerance": "±30% (chỉ báo thông tin)",
      "deviation": "-20.3%",
      "within_tolerance": true,
      "severity": "informational",
      "status": "info",
      "note": "Chỉ số tham khảo phụ thuộc vào mật độ nói vấp của video gốc."
    }
  ]
}
```

---

## 2. Bảng Ánh Xạ Phong Cách → Tham Số Pipeline (S0.3)

Bảng dưới đây quy định cách chuyển đổi từng trường trong `style_profile.json` sang tham số cấu hình trong `effective_profile.json` và hành vi tại các phase tương ứng:

| Nhóm & Trường trong `style_profile.json` | Tham số đích trong `effective_profile.json` & Phase tiêu thụ | Công thức ánh xạ & Quy tắc xử lý | Điều kiện an toàn / Kẹp biên bắt buộc |
| :--- | :--- | :--- | :--- |
| **`pacing.pause_median_ms`**, **`pacing.pause_p90_ms`**, **`pacing.max_silence_kept_ms`** | - `pacing.target_pause_median_ms`<br>- `pacing.silence_threshold_ms` (P3)<br>- `pacing.max_silence_ms` (P3/P6)<br>- `pacing.pad_start_ms`, `pacing.pad_end_ms`, `pacing.merge_gap_ms` (P6) | - `silence_threshold_ms = clamp(round(pause_p90_ms), 300, 1200)`<br>- `max_silence_ms = clamp(round(max_silence_kept_ms), 400, 1500)`<br>- `pad_start_ms = clamp(round(pause_median_ms * 0.30), 40, 160)`<br>- `pad_end_ms = clamp(round(pause_median_ms * 0.40), 60, 200)`<br>- `merge_gap_ms = clamp(round(pause_median_ms * 0.65), 80, 300)` | **Tuyệt đối không đổi tốc độ phát (`playback_speed = 1.0x`)**. Chỉ điều chỉnh ngưỡng cắt khoảng lặng và độ dài đệm đầu/cuối câu để giữ tự nhiên âm tiết tiếng Việt. |
| **`hook.duration_ms`** | - `hook.target_ms`<br>- `hook.min_ms` (P5)<br>- `hook.max_ms` (P5) | - `target_ms = clamp(round(hook.duration_ms), 3000, 12000)`<br>- `min_ms = max(2500, target_ms - 1500)` (`-1,5s`)<br>- `max_ms = min(12000, target_ms + 1500)` (`+1,5s`) | Vẫn tuân thủ quy tắc P5: nếu tổng thời lượng take thực tế ngắn hơn `min_ms`, giữ nguyên biên thật và gắn `short_hook: true` (không kéo tràn sang đoạn nháp). |
| **`hook.style`** (`question \| teaser \| statement`) | - `hook.preferred_style` (P5) | - Cộng điểm ưu tiên (`+8.0` điểm trên thang 100) cho phương án mở đầu cùng kiểu `preferred_style` trong `p5_hook_agent.py`. | **Chỉ áp dụng khi người dùng không nhập `hook_prompt`**. Nếu người dùng có nhập `hook_prompt`, ưu tiên tuyệt đối theo mô tả của người dùng (`user_override`). |
| **`hook.text_overlay`** (`boolean`) | - `hook.text_overlay` (P6d)<br>- `titlecard.enabled` (P6d) | - Nếu `hook.text_overlay == true` hoặc `titlecard.present == true`, bật lớp chữ mở đầu ở `p6d_titlecard.py` trong 3 giây đầu. | Nếu cả hai đều `false` và người dùng không bật thủ công, không chèn bảng chữ mở đầu. |
| **`hook.repeated_later`** (`boolean`) | - `hook.prefer_opening_mode` (P5/P6) | - Nếu `repeated_later == true`: ưu tiên phương án mở đầu dạng trích đoạn nhấn mạnh đưa lên đầu (`opening_mode = "cold_open_duplicate"` / `teaser_highlight`).<br>- Nếu `repeated_later == false`: ưu tiên phương án dẫn nhập nối thẳng (`opening_mode = "reuse_opening"` / `direct_intro`). | Khi đoạn mở đầu thực tế lấy từ giữa/cuối video (`lead_beat_id != first_footage_beat_id`), P6 luôn giữ đoạn đó ở phần thân để không làm đứt mạch nội dung. |
| **`captions.present`**, **`captions.position`**, **`captions.words_per_line`**, **`captions.lines`**, **`captions.highlight`**, **`captions.font_class`** | - `captions.enabled`<br>- `captions.position`<br>- `captions.words_per_line`<br>- `captions.max_lines`<br>- `captions.highlight`<br>- `captions.font_family` (P6b) | - `enabled = captions.present`<br>- `words_per_line = clamp(captions.words_per_line, 2, 6)`<br>- `max_lines = clamp(captions.lines, 1, 2)`<br>- Ánh xạ `font_class` sang họ chữ đã kiểm tra đủ dấu tiếng Việt (`sans_bold` → `"Be Vietnam Pro"`, `sans_regular` → `"Inter"`, `rounded_bold` → `"Manrope"`, `serif_bold` → `"Noto Sans"`). | - Nếu `captions.present == false`, đặt `captions.enabled = false` (không tự thêm phụ đề đốt sẵn vào `polished.mp4` trừ khi người dùng chủ động bật). File `.srt` rời vẫn được xuất để dự phòng.<br>- Chỉ chấp nhận họ chữ trong danh sách cho phép hỗ trợ đầy đủ dấu tiếng Việt. |
| **`audio.lufs`**, **`audio.true_peak_db`** | - `audio.target_lufs` (P6a)<br>- `audio.true_peak_max_db` (P6a) | - `target_lufs = clamp(round(audio.lufs, 1), -23.0, -9.0)`<br>- `true_peak_max_db = min(round(audio.true_peak_db, 1), -1.0)` | Kẹp cứng `target_lufs` trong khoảng an toàn **từ `-23.0` đến `-9.0` LUFS** và giới hạn đỉnh thực **`true_peak_db <= -1.0` dBTP** để chống vỡ tiếng (clipping). Nếu bị kẹp, ghi rõ vào `profile_trace.json`. |
| **`format.aspect`** (`9:16`, `16:9`...) | - `format.aspect`<br>- `format.keep_source_aspect = true` (P7/P7b) | - So sánh `sample.format.aspect` với tỉ lệ khung hình của video gốc mới (`source_video`). | **Không tự đổi khung hình**: Nếu `sample.format.aspect != source.aspect`, hệ thống giữ nguyên độ phân giải và tỉ lệ khung hình gốc của video mới, đồng thời ghi cảnh báo rõ vào `profile_trace.json` và hiển thị trên UI. |
| **`punchin.detected`**, **`punchin.min_gap_s`**, **`punchin.scale`** | - `punchin.enabled` (P6c)<br>- `punchin.min_gap_ms` (P6c)<br>- `punchin.scale` (P6c) | - `min_gap_ms = clamp(round(min_gap_s * 1000), 4000, 15000)`<br>- `scale = clamp(round(scale, 2), 1.04, 1.12)` | **Chỉ bật `punchin.enabled = true` khi đồng thời thỏa mãn**: (1) công tắc nhóm `punchin` được bật, (2) `punchin.detected == true`, (3) `confidence["punchin"]` là `"measured"` hoặc `"estimated"`, và (4) `evidence["punchin"]` có mốc thời gian/khung hình cụ thể. Nếu `confidence == "assumed"` hoặc thiếu bằng chứng thì tắt (`enabled = false`). |

---

## 3. Thứ Tự Ưu Tiên 4 Tầng & Cơ Chế Truy Vết `profile_trace.json` (S0.4)

### 3.1. Thứ tự ưu tiên 4 tầng (từ cao xuống thấp)

Khi hợp nhất cấu hình tại `ps2_style_applier.py`, mỗi tham số được quyết định theo thứ tự ưu tiên nghiêm ngặt sau:

1. **Tầng 1 — Người dùng nhập tay (`user_override`)**:
   - Các thông số người dùng chủ động chỉnh hoặc nhập trên giao diện trong phiên chạy hiện tại (ví dụ: nhập `hook_prompt`, tải `custom_hook_clip`, chỉnh tay mức cắt/độ đệm nếu người dùng thay đổi sau khi nạp mẫu, hoặc gạt tắt/bật từng nhóm công tắc).
2. **Tầng 2 — Phong cách từ video mẫu theo công tắc nhóm đang bật (`sample_style`)**:
   - Các thông số ánh xạ từ `style_profile.json` thuộc những nhóm mà người dùng đang bật công tắc (`pacing`, `hook`, `captions`, `audio`, `punchin`), với điều kiện đạt ngưỡng độ tin cậy tối thiểu của nhóm đó.
3. **Tầng 3 — Mẫu cấu hình chọn sẵn (`template`)**:
   - Giá trị mặc định theo mẫu `podcast_horizontal`, `podcast_vertical`, hoặc `cut_only` được định nghĩa trong `memory/profile.yaml`.
4. **Tầng 4 — Hồ sơ gốc mặc định (`default_profile`)**:
   - Các giá trị nền tảng cấp cao nhất trong `tools/video-pipeline/memory/profile.yaml`.

### 3.2. Quy trình giải quyết và ghi nhận vào `work/profile_trace.json`

Đối với mỗi khóa tham số `param` (ví dụ `pacing.silence_threshold_ms`, `hook.min_ms`, `captions.words_per_line`, `audio.target_lufs`, `punchin.enabled`, `format.aspect`):
1. Thu thập giá trị ứng viên từ cả 4 nguồn (`user_override`, `sample_style`, `template`, `default_profile`).
2. Kiểm tra điều kiện hợp lệ của ứng viên `sample_style`:
   - Nếu công tắc nhóm tương ứng (`enabled_groups[group]`) đang tắt (`false`), bỏ qua `sample_style` và ghi lý do `"Người dùng tắt công tắc nhóm <group>"`.
   - Nếu là nhóm `punchin` nhưng `confidence["punchin"] == "assumed"` hoặc `evidence["punchin"]` rỗng, bỏ qua `sample_style` và ghi lý do `"Độ tin cậy punch-in ở mức giả định (assumed) hoặc thiếu bằng chứng khung hình"`.
   - Nếu là `format.aspect` và khác tỉ lệ khung hình video mới, bỏ qua việc áp tỉ lệ khung hình từ `sample_style` và ghi cảnh báo vào `warnings`.
3. Chọn nguồn có độ ưu tiên cao nhất có giá trị hợp lệ.
4. Áp dụng hàm kẹp biên an toàn (`clamp`). Nếu giá trị sau khi kẹp khác giá trị trước khi kẹp, đặt `clamped = true` và ghi rõ biên đã kẹp vào `reason`.
5. Xuất danh sách đầy đủ các mục `entries[]` và `warnings[]` ra `work/profile_trace.json`.

---

## 4. Bảng Dung Sai Kiểm Tra Độ Khớp `style_match` (S0.5)

Sau khi xuất video hoàn chỉnh, bước kiểm tra độ khớp đối chiếu các chỉ số đo được trên video đầu ra với `style_profile.json` của video mẫu (hoặc mục tiêu đã kẹp biên an toàn trong `effective_profile.json`) theo bảng dung sai cố định sau:

| Chỉ số đối chiếu (`metric`) | Nhãn hiển thị UI | Giá trị chuẩn so sánh (`target`) | Dung sai cho phép (`tolerance`) | Phân loại (`severity`) | Quy tắc đánh giá trạng thái (`status`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`loudness_lufs`** | Âm lượng | `effective_profile.audio.target_lufs` (mục tiêu từ mẫu đã kẹp trong `[-23, -9]` LUFS) | **`±1.0 LU`** (`abs(actual - target) <= 1.0`) | `scored` (Tính vào kết quả khớp) | `matched` nếu lệch `<= 1.0 LU`; `deviated` nếu lệch `> 1.0 LU`. |
| **`pause_median_ms`** | Khoảng lặng giữa câu | `style_profile.pacing.pause_median_ms` | **`±30%`** (`abs(actual - target) / target <= 0.30`) | `scored` (Tính vào kết quả khớp) | `matched` nếu lệch tương đối `<= 30%`; `deviated` nếu lệch `> 30%`. |
| **`hook_duration_ms`** | Độ dài mở đầu (Hook) | `style_profile.hook.duration_ms` | **`±1,5 s` (`±1500 ms`)** (`abs(actual - target) <= 1500`) | `scored` (Tính vào kết quả khớp) | `matched` nếu lệch `<= 1500 ms`; `deviated` nếu lệch `> 1500 ms` (kèm chú thích nếu do video gốc thiếu câu ngắn hơn). |
| **`captions_layout`** | Phụ đề | `style_profile.captions.words_per_line` & `style_profile.captions.position` | **`±1` từ/dòng VÀ cùng vị trí (`position`)** | `scored` (Tính vào kết quả khớp) | `matched` khi `abs(actual_wpl - target_wpl) <= 1` **và** `actual_pos == target_pos`; ngược lại là `deviated`. |
| **`shots_per_min`** | Nhịp cắt (`shots/min`) | `style_profile.pacing.shots_per_min` | **`±30%` (Chỉ báo thông tin)** | `informational` (**Không làm fail kết quả**) | Luôn mang mức `severity = "informational"` (`status = "info"`), chỉ hiển thị để người dùng tham khảo vì mật độ cắt phụ thuộc trực tiếp vào số lần nói vấp của video gốc mới. |

**Quy tắc tổng hợp `overall_status` của `style_match.json`:**
- Chỉ xét các mục có `severity == "scored"` thuộc các nhóm mà người dùng đang bật công tắc (`enabled_groups[group] == true`).
- Nếu tất cả các mục `scored` đang bật đều có `within_tolerance == true` → `overall_status = "pass"`.
- Nếu có ít nhất 1 mục `scored` vượt dung sai → `overall_status = "partial"` (cảnh báo nhẹ trên UI kèm chỉ số lệch cụ thể, không xóa hay chặn tải file video đã xuất).
- Mục `shots_per_min` (`severity = "informational"`) không bao giờ làm hạ `overall_status` từ `"pass"` xuống `"partial"` hay `"fail"`.

---

## 5. Wireframe ASCII Giao Diện Ở 3 Cỡ Màn Hình: 1440px, 768px, 390px (S0.6)

Thiết kế tuân thủ bảng màu **Calm Jade & Warm Ivory** (`#FBF9F5` nền trang, `#FFFFFF` bề mặt thẻ, `#E5E0D8` viền mảnh `1px`, `#0F766E` xanh ngọc điểm nhấn, `#1C1917` chữ chính) và phông chữ `Manrope` + `DM Sans` + `JetBrains Mono`.

### 5.1. Tổng thể khu vực cấu hình sau khi GỠ công tắc "Chế độ chuyên sâu" & Khối "Phong cách theo video mẫu (không bắt buộc)" ở Trạng thái Chuẩn bị

#### (A) Màn hình Desktop — `1440px` (Khung nội dung căn giữa `max-w-[1040px]`)

```text
+------------------------------------------------------------------------------------------------------------------+
| [P] PodsCare · Cắt vấp Video   (*) AI sẵn sàng                          [ Học & cải thiện (2) ]   [ Cài đặt ]    |
|     (Đã gỡ bỏ hoàn toàn công tắc gạt "Chế độ chuyên sâu" khỏi Header để thống nhất 1 luồng làm việc duy nhất)    |
+------------------------------------------------------------------------------------------------------------------+
|                                                                                                                  |
|  +------------------------------------------------------------------------------------------------------------+  |
|  | 1. VIDEO CẦN CẮT                                                                                           |  |
|  | +--------------------------------------------------------------------------------------------------------+ |  |
|  | |  📹  buoi_thu_podcast_tap_12.mp4                                       [ Đổi file ]  [ Dùng video mẫu ]| |  |
|  | |      Thời lượng: 04:18  ·  Độ phân giải: 1080×1920 (9:16)  ·  30 fps  ·  84,2 MB                       | |  |
|  | +--------------------------------------------------------------------------------------------------------+ |  |
|  +------------------------------------------------------------------------------------------------------------+  |
|                                                                                                                  |
|  +------------------------------------------------------------------------------------------------------------+  |
|  | 2. PHONG CÁCH THEO VIDEO MẪU (KHÔNG BẮT BUỘC)                                             [ Thu gọn ▲ ]    |  |
|  | Copy nhịp cắt, khoảng nghỉ, cách mở đầu, phụ đề và âm lượng từ một video mẫu đã dựng ưng ý.                |  |
|  |                                                                                                            |  |
|  | Nguồn phong cách:  (•) Tải video mẫu mới     ( ) Chọn phong cách đã lưu [ Podcast dọc nhịp nhanh ▾ ]       |  |
|  | +--------------------------------------------------------------------------------------------------------+ |  |
|  | |  🎞️  mau_reels_podscare_chuan.mp4 (Đã phân tích 62s đầu · 1080×1920 · 9:16)           [ Đổi video mẫu ]| |  |
|  | +--------------------------------------------------------------------------------------------------------+ |  |
|  |                                                                                                            |  |
|  | Chọn các nhóm muốn áp dụng sang video mới:                                                                 |  |
|  | +---------------------------------------------------+  +-------------------------------------------------+ |  |
|  | | [✓] Nhịp cắt & khoảng lặng        [ Chắc chắn ]   |  | [✓] Mở đầu (Hook)               [ Ước lượng ]   | |  |
|  | |     Nghỉ giữa câu ~240ms · tối đa 650ms           |  |     Độ dài ~6,2s · kiểu Đặt câu hỏi · có chữ đầu| |  |
|  | +---------------------------------------------------+  +-------------------------------------------------+ |  |
|  | +---------------------------------------------------+  +-------------------------------------------------+ |  |
|  | | [✓] Phụ đề                        [ Ước lượng ]   |  | [✓] Âm lượng                    [ Chắc chắn ]   | |  |
|  | |     3 từ/dòng · 1 dòng · cuối giữa · tô từ khóa   |  |     Chuẩn hóa -14,2 LUFS · đỉnh <= -1,0 dBTP    | |  |
|  | +---------------------------------------------------+  +-------------------------------------------------+ |  |
|  | +---------------------------------------------------+                                                      |  |
|  | | [✓] Nhấn khung hình (Punch-in)    [ Ước lượng ]   |                                                      |  |
|  | |     Phóng nhẹ 108% · cách nhau tối thiểu 5,5s     |                                                      |  |
|  | +---------------------------------------------------+                                                      |  |
|  |                                                                                                            |  |
|  | ⓘ Chưa áp dụng được: nhạc nền, hiệu ứng, màu phim. Không tự đổi tốc độ nói và không tự cắt đổi tỉ lệ hình. |  |
|  |                                                                                                            |  |
|  | Lưu phong cách này để dùng lại: [ Podcast dọc nhịp nhanh PodsCare          ]  [ Lưu phong cách ]           |  |
|  +------------------------------------------------------------------------------------------------------------+  |
|                                                                                                                  |
|  +------------------------------------------------------------------------------------------------------------+  |
|  | 3. MỨC CẮT & MẪU KHUNG HÌNH (Áp dụng cho phần không lấy từ mẫu hoặc khi bạn chỉnh tay)                     |  |
|  | Mức cắt vấp:    [   Nhẹ   ]   [ • Vừa (Theo video mẫu) ]   [   Mạnh   ]                                    |  |
|  | Mẫu đầu ra:     [ Podcast ngang 16:9 ]   [ • Podcast dọc 9:16 ]   [ Chỉ cắt ]                              |  |
|  |                                                                                                            |  |
|  | ▸ Kịch bản & gợi ý phần mở đầu (không bắt buộc — bấm để mở rộng)                                           |  |
|  |                                                                                                            |  |
|  |                                      +------------------------------------+                                |  |
|  |                                      |   ▶  Bắt đầu cắt video             |                                |  |
|  |                                      +------------------------------------+                                |  |
|  +------------------------------------------------------------------------------------------------------------+  |
+------------------------------------------------------------------------------------------------------------------+
```

#### (B) Màn hình Tablet — `768px`

```text
+------------------------------------------------------------------------------+
| [P] Cắt vấp Video   (*)                [ Học & cải thiện (2) ]   [ Cài đặt ] |
+------------------------------------------------------------------------------+
| +--------------------------------------------------------------------------+ |
| | 1. VIDEO CẦN CẮT                                                         | |
| | 📹 buoi_thu_podcast_tap_12.mp4 (04:18 · 1080×1920 · 9:16)                | |
| | [ Đổi file ]   [ Dùng video mẫu ]                                        | |
| +--------------------------------------------------------------------------+ |
|                                                                              |
| +--------------------------------------------------------------------------+ |
| | 2. PHONG CÁCH THEO VIDEO MẪU (KHÔNG BẮT BUỘC)              [ Thu gọn ▲ ] | |
| | (•) Tải video mẫu mới   ( ) Phong cách đã lưu [ Podcast dọc nhịp nhanh ▾]| |
| | 🎞️ mau_reels_podscare_chuan.mp4 (Đã phân tích 62s đầu)  [ Đổi video mẫu ]| |
| |                                                                          | |
| | [✓] Nhịp cắt & khoảng lặng (~240ms, tối đa 650ms)          [ Chắc chắn ] | |
| | [✓] Mở đầu / Hook (~6,2s · Đặt câu hỏi · có chữ đầu)       [ Ước lượng ] | |
| | [✓] Phụ đề (3 từ/dòng · 1 dòng · cuối giữa · tô từ khóa)   [ Ước lượng ] | |
| | [✓] Âm lượng (-14,2 LUFS · đỉnh <= -1,0 dBTP)              [ Chắc chắn ] | |
| | [✓] Nhấn khung hình / Punch-in (108% · cách >= 5,5s)       [ Ước lượng ] | |
| |                                                                          | |
| | ⓘ Chưa áp dụng được: nhạc nền, hiệu ứng, màu phim.                       | |
| | Tên lưu: [ Podcast dọc nhịp nhanh PodsCare    ] [ Lưu phong cách ]       | |
| +--------------------------------------------------------------------------+ |
|                                                                              |
| +--------------------------------------------------------------------------+ |
| | 3. MỨC CẮT & MẪU KHUNG HÌNH                                              | |
| | Mức cắt:   [ Nhẹ ]   [ • Vừa (Theo mẫu) ]   [ Mạnh ]                     | |
| | Mẫu:       [ Podcast ngang ]   [ • Podcast dọc ]   [ Chỉ cắt ]           | |
| | ▸ Kịch bản & gợi ý phần mở đầu (không bắt buộc)                          | |
| |                                                                          | |
| | [                        ▶  Bắt đầu cắt video                          ] | |
| +--------------------------------------------------------------------------+ |
+------------------------------------------------------------------------------+
```

#### (C) Màn hình Mobile — `390px` (1 cột dọc, vùng chạm `>= 44px`, không tràn ngang)

```text
+--------------------------------------+
| [P] Cắt vấp Video  (*)  [Học] [Cài đặt]|
+--------------------------------------+
| +----------------------------------+ |
| | 1. VIDEO CẦN CẮT                 | |
| | 📹 buoi_thu_podcast_tap_12.mp4   | |
| | 04:18 · 1080×1920 (9:16)         | |
| | [ Đổi file ]  [ Dùng video mẫu ] | |
| +----------------------------------+ |
|                                      |
| +----------------------------------+ |
| | 2. PHONG CÁCH VIDEO MẪU [Thu ▲]  | |
| | (Không bắt buộc)                 | |
| | [• Tải mẫu mới] [ Đã lưu ▾ ]     | |
| | 🎞️ mau_reels_podscare_chuan.mp4  | |
| | Đã đo 62s đầu    [ Đổi mẫu ]     | |
| | -------------------------------- | |
| | [✓] Nhịp cắt & nghỉ  [Chắc chắn] | |
| |     Nghỉ ~240ms · tối đa 650ms   | |
| | [✓] Mở đầu (Hook)    [Ước lượng] | |
| |     ~6,2s · Đặt câu hỏi          | |
| | [✓] Phụ đề           [Ước lượng] | |
| |     3 từ/dòng · cuối giữa        | |
| | [✓] Âm lượng         [Chắc chắn] | |
| |     Chuẩn hóa -14,2 LUFS         | |
| | [✓] Nhấn khung hình  [Ước lượng] | |
| |     Phóng 108% · cách >= 5,5s    | |
| | -------------------------------- | |
| | ⓘ Chưa áp dụng được: nhạc nền,   | |
| |   hiệu ứng, màu phim.            | |
| | [ Tên phong cách...            ] | |
| | [       Lưu phong cách         ] | |
| +----------------------------------+ |
|                                      |
| +----------------------------------+ |
| | 3. MỨC CẮT & KHUNG HÌNH          | |
| | [ Nhẹ ]  [ • Vừa ]  [ Mạnh ]     | |
| | [ Ngang ] [ • Dọc ] [ Chỉ cắt ]  | |
| | ▸ Kịch bản & gợi ý Hook (tùy chọn)| |
| |                                  | |
| | [     ▶  Bắt đầu cắt video     ] | |
| +----------------------------------+ |
+--------------------------------------+
```

---

### 5.2. Mục thu gọn "So với video mẫu" ở Trạng thái Kết quả

#### (A) Màn hình Desktop — `1440px`

```text
+------------------------------------------------------------------------------------------------------------------+
|  ... (Phía trên: Trình phát Video kết quả, Nút tải Video hoàn chỉnh / Bản cắt sạch / Phụ đề .srt, Đổi Hook) ...  |
|                                                                                                                  |
|  +------------------------------------------------------------------------------------------------------------+  |
|  | ▾ So với video mẫu: "Podcast dọc nhịp nhanh PodsCare" (mau_reels_podscare_chuan.mp4)    [ Đạt 4/4 chỉ số ] |  |
|  | ---------------------------------------------------------------------------------------------------------- |  |
|  | Chỉ số                 Video mẫu (Mục tiêu)     Video xuất ra            Độ lệch / Dung sai    Trạng thái  |  |
|  | ---------------------------------------------------------------------------------------------------------- |  |
|  | Âm lượng               -14,2 LUFS               -14,0 LUFS               +0,2 LU (±1,0 LU)     [  Khớp  ]  |  |
|  | Khoảng lặng giữa câu   240 ms (trung vị)        265 ms                   +10,4% (±30%)         [  Khớp  ]  |  |
|  | Độ dài mở đầu (Hook)   6,2 giây                 5,8 giây                 -0,4s (±1,5s)         [  Khớp  ]  |  |
|  | Phụ đề                 3 từ/dòng · cuối giữa    3 từ/dòng · cuối giữa    0 từ · cùng vị trí    [  Khớp  ]  |  |
|  | Nhịp cắt (tham khảo)   18,2 cảnh/phút           14,5 cảnh/phút           -20,3% (±30% · thông tin) [Thông tin]|
|  +------------------------------------------------------------------------------------------------------------+  |
|                                                                                                                  |
|  +------------------------------------------------------------------------------------------------------------+  |
|  | ▸ Xem danh sách 14 đoạn nói vấp & khoảng lặng đã cắt (bấm để mở rộng)                                      |  |
|  +------------------------------------------------------------------------------------------------------------+  |
+------------------------------------------------------------------------------------------------------------------+
```

#### (B) Màn hình Tablet — `768px`

```text
+------------------------------------------------------------------------------+
| +--------------------------------------------------------------------------+ |
| | ▾ So với video mẫu: "Podcast dọc nhịp nhanh PodsCare"  [ Đạt 4/4 chỉ số ]| |
| | ------------------------------------------------------------------------ | |
| | Chỉ số               Mẫu          Xuất ra       Dung sai      Trạng thái | |
| | ------------------------------------------------------------------------ | |
| | Âm lượng             -14,2 LUFS   -14,0 LUFS    ±1,0 LU       [  Khớp  ] | |
| | Khoảng lặng giữa câu 240 ms       265 ms        ±30% (+10%)   [  Khớp  ] | |
| | Độ dài mở đầu        6,2s         5,8s          ±1,5s (-0,4s) [  Khớp  ] | |
| | Phụ đề               3 từ · dưới  3 từ · dưới   ±1 từ & vị trí[  Khớp  ] | |
| | Nhịp cắt (tham khảo) 18,2/phút    14,5/phút     Thông tin     [Thông tin]| |
| +--------------------------------------------------------------------------+ |
+------------------------------------------------------------------------------+
```

#### (C) Màn hình Mobile — `390px` (Dạng thẻ xếp chồng, không dùng bảng rộng gây cuộn ngang)

```text
+--------------------------------------+
| +----------------------------------+ |
| | ▾ So với video mẫu    [Đạt 4/4]  | |
| |   mau_reels_podscare_chuan.mp4   | |
| | -------------------------------- | |
| | Âm lượng                [ Khớp ] | |
| | Mẫu: -14,2 LUFS → Ra: -14,0 LUFS | |
| | Lệch +0,2 LU (dung sai ±1,0 LU)  | |
| | -------------------------------- | |
| | Khoảng lặng giữa câu    [ Khớp ] | |
| | Mẫu: 240 ms → Ra: 265 ms         | |
| | Lệch +10,4% (dung sai ±30%)      | |
| | -------------------------------- | |
| | Độ dài mở đầu (Hook)    [ Khớp ] | |
| | Mẫu: 6,2s → Ra: 5,8s             | |
| | Lệch -0,4s (dung sai ±1,5s)      | |
| | -------------------------------- | |
| | Phụ đề                  [ Khớp ] | |
| | Mẫu: 3 từ/dòng · cuối giữa       | |
| | Ra:  3 từ/dòng · cuối giữa       | |
| | -------------------------------- | |
| | Nhịp cắt             [Thông tin] | |
| | Mẫu: 18,2/phút → Ra: 14,5/phút   | |
| | (Phụ thuộc số chỗ vấp video gốc) | |
| +----------------------------------+ |
+--------------------------------------+
```

---

## Risks / Trade-offs

- **[Risk] Video mẫu không có giọng nói tiếng Việt rõ ràng hoặc toàn nhạc nền** → **Mitigation**: `ps1_style_analyzer.py` đánh dấu `confidence["pacing"] = "assumed"` và `confidence["hook"] = "assumed"`, thông báo rõ trên giao diện để người dùng biết chỉ nhóm Âm lượng / Định dạng đo được chắc chắn.
- **[Risk] Phụ đề đốt sẵn trên video mẫu dùng phông chữ lạ hoặc bị hòa lẫn vào nền phức tạp** → **Mitigation**: Đánh dấu `confidence["captions"] = "estimated"` (hoặc `"assumed"` khi không phát hiện được hộp chữ ổn định), và khi áp dụng sang `p6b_captions.py` luôn ánh xạ `font_class` về danh sách phông chữ chuẩn tiếng Việt (`Be Vietnam Pro`, `Inter`, `Manrope`, `Noto Sans`).
- **[Risk] Video mẫu có âm lượng quá lớn (ví dụ `-6 LUFS`) gây méo tiếng nếu sao chép nguyên xi** → **Mitigation**: Bộ hợp nhất `ps2_style_applier.py` luôn kẹp cứng `target_lufs` trong đoạn `[-23.0, -9.0]` LUFS và `true_peak_max_db <= -1.0` dBTP, đồng thời ghi lý do kẹp biên vào `work/profile_trace.json`.
