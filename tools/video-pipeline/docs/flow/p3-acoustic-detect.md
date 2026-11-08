# Phase 3 — Acoustic & Disfluency Detector (`p3_acoustic_detect.py`)

## 1. Mục đích
Phân tích `audio_16k.wav` và `words.json` bằng thuật toán Python thuần (RMS dBFS + khoảng cách giữa các từ) để phát hiện khoảng lặng (`SILENCE`), tiếng thở (`BREATH`) và từ đệm Tiếng Việt (`FILLER`), xuất ra:
- `packed.txt` (giảm >70% lượng token cho P4)
- `flags.json`

## 2. Kết nối với Hồ sơ hiệu lực Giai đoạn S2 (`work/effective_profile.json`)
- Khi trong workspace có `work/effective_profile.json` (hoặc `effective_profile.json`), `p3_acoustic_detect.py` tự động ưu tiên đọc nhóm `pacing`:
  - `pacing.silence_threshold_ms` (hoặc `pacing.max_silence_ms`) làm ngưỡng phát hiện khoảng lặng cần cắt (`SILENCE`).
  - `pacing.min_silence_ms` và `pacing.target_pause_median_ms`.
- Ghi nhận `style_id` và `thresholds` đã áp dụng vào trong `flags.json` và `state.json` (`phases.P3.metrics`).
- Nếu không có `effective_profile.json`, tự động fallback về `memory/profile.yaml`.
