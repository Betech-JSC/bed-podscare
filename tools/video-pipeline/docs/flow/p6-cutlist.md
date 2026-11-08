# Phase 6 — Cutlist Builder (`p6_cutlist.py`)

## 1. Mục đích
Hợp nhất `takes.json` (P4), `hooks.json` (P5), `flags.json` (P3) và `words.json` (P2) để tạo danh sách cắt `cutlist.json` căn chỉnh theo khung hình (`fps`), bảo vệ ranh giới từ và gắn hiệu ứng chuyển âm (`audio_fade` 30ms).

## 2. Kết nối với Hồ sơ hiệu lực Giai đoạn S2 (`work/effective_profile.json`)
- Lưu ý kiến trúc: Trong `tools/video-pipeline/phases/`, `p6_cutlist.py` là module hợp nhất duy nhất cho Phase 6 (không tách thành `p6a..p6d`).
- Khi có `work/effective_profile.json` (hoặc `effective_profile.json`), `p6_cutlist.py` tự động đọc:
  - `pacing.pad_start_ms`, `pacing.pad_end_ms`, `pacing.merge_gap_ms` để cộng bù đầu/cuối câu và gộp các đoạn cùng vai trò.
  - `hook.prefer_opening_mode`:
    - Khi câu mở đầu được trích từ giữa hoặc cuối video (`hook_beat_id != best_takes[0]["beat_id"]`), luôn áp dụng chế độ `cold_open_duplicate` (`is_hook_preview = true`): giữ nguyên câu đó ở phần thân video để mạch nội dung không bị đứt đoạn.
    - Khi câu mở đầu trùng với beat đầu tiên và `prefer_opening_mode == "reuse_opening"`, dùng trực tiếp làm mở đầu mà không lặp lại hai lần liên tiếp.
  - Nhúng đầy đủ các khối cấu hình đã hợp nhất (`style_id`, `template`, `playback_speed = 1.0`, `aspect_ratio`, `pacing`, `hook`, `captions`, `audio`, `titlecard`, `punchin`) vào `cutlist.json` để `p7_exporter.py` và `p8_qa.py` sử dụng đồng nhất.
