# Phase PS2 — Style Applier & Safety Guardrails (`ps2_style_apply.py`)

## 1. Mục đích
Hợp nhất hồ sơ phong cách đã trích xuất từ video mẫu (`work/style_profile.json` ở Giai đoạn S1) với hồ sơ mặc định (`memory/profile.yaml`), khung dựng (`template`) và tùy chọn ghi đè của phiên (`studio_meta.json` / CLI flags) để xuất ra:
- `work/effective_profile.json` (và bản sao tại gốc `effective_profile.json`)
- `work/profile_trace.json` (và bản sao tại gốc `profile_trace.json`)

## 2. Thứ tự ưu tiên 4 tầng (Priority Order)
```text
user_override (studio_meta.json / CLI) > sample_style (khi bật công tắc) > template > default_profile (profile.yaml)
```
- Chỉ những nhóm có mặt trong `enabled_groups` (`pacing`, `hook`, `captions`, `audio`, `punchin`; mặc định bật `["pacing", "hook", "captions", "audio"]`, tắt `"punchin"`) mới lấy thông số từ `style_profile.json`.
- Mọi tham số trong `work/profile_trace.json` đều ghi rõ `param`, `value`, `source` (`default_profile` | `template` | `sample_style` | `user_override`), `confidence`, và `reason`.

## 3. Các rào chắn an toàn bắt buộc (Safety Guardrails)
1. **Giữ nguyên tốc độ phát**: `playback_speed = 1.0` trong mọi trường hợp (không tăng/giảm tốc độ giọng nói).
2. **Bảo toàn tỷ lệ khung hình video nguồn**: Khi `style_profile.source_sample.aspect_ratio` khác tỷ lệ khung hình thực tế của video nguồn (ví dụ mẫu `9:16` nhưng video nguồn `16:9`), giữ nguyên tỷ lệ khung hình của video nguồn, tự động quy đổi lề phụ đề (`margin_bottom_pct`) và ghi cảnh báo vào `profile_trace.json`.
3. **Kẹp ngưỡng âm lượng an toàn (EBU R128)**:
   - `audio.target_lufs` luôn kẹp trong khoảng `[-23.0, -9.0]` LUFS.
   - `audio.true_peak_db` luôn `<= -1.0` dBTP.
   - Cố định chuẩn xuất `sample_rate = 48000` Hz, `channels = 2` (Stereo).
4. **Phụ đề và bảng trắng phông chữ Tiếng Việt**:
   - Nếu `style_profile.captions.present == false`, tự động đặt `captions.enabled = false` và giữ nguyên thông số phụ đề từ hồ sơ mặc định.
   - Phông chữ phụ đề chỉ được chọn trong danh sách hỗ trợ đầy đủ dấu Tiếng Việt (`ALLOWED_VIETNAMESE_FONTS`: `Be Vietnam Pro`, `Inter`, `Montserrat`, `Plus Jakarta Sans`, `Noto Sans`, `Roboto`); nếu ngoài danh sách sẽ chuyển về `Be Vietnam Pro`.
5. **Phóng nhẹ (Punch-in) an toàn**:
   - Chỉ bật `punchin.enabled = true` khi người dùng bật công tắc `punchin`, `confidence != "assumed"`, có `evidence` thực tế và `scale_pct <= 118%`.
6. **Ghi đè câu mở đầu (`hook_prompt`)**:
   - Khi người dùng nhập `hook_prompt` cho phiên hiện tại, `hook_prompt` (`user_override`) luôn thắng `preferred_style` của video mẫu.

## 4. Cú pháp chạy lệnh
```bash
# Chạy tự kiểm tra độc lập (Self-test)
python3 tools/video-pipeline/phases/ps2_style_apply.py --self-test

# Chạy qua CLI Orchestrator
python3 tools/video-pipeline/cli.py run-phase --phase PS2 --workspace <ws_dir> \
  --style-profile <path/to/style_profile.json> \
  --enabled-groups pacing,hook,captions,audio
```
