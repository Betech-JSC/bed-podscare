# Phase 5 — Hook Agent (`p5_hook_agent.py`)

## 1. Mục đích
Đọc `takes.json` và `beats.json` để tạo 3 phương án mở đầu (`teaser`, `question`, `statement`) và xuất `hooks.json` phục vụ Điểm dừng 1 (`human_checkpoint_1`).

## 2. Kết nối với Hồ sơ hiệu lực Giai đoạn S2 (`work/effective_profile.json`)
- Khi có `work/effective_profile.json` (hoặc `effective_profile.json`), `p5_hook_agent.py` tự động đọc nhóm `hook`:
  - `hook.min_ms` và `hook.max_ms` làm khoảng thời lượng mục tiêu cho câu mở đầu.
  - `hook.preferred_style` (`teaser` | `question` | `statement` | `visual`): cộng điểm ưu tiên (`+8.0`) cho phương án khớp với phong cách của video mẫu khi người dùng không nhập `hook_prompt`.
  - **Ưu tiên `user_override`**: Nếu người dùng nhập `hook_prompt` riêng cho phiên hiện tại, `hook_prompt` luôn được ưu tiên cao hơn `preferred_style` của mẫu.
  - `hook.prefer_opening_mode` (`cold_open_duplicate` | `reuse_opening`) và `hook.text_overlay` được đính kèm vào từng phương án trong `hooks.json`.
  - **Bảo toàn ranh giới câu nói (Short Take Boundary Safety)**: Khi tổng độ dài các take thực tế ngắn hơn `hook.min_ms`, `p5_hook_agent.py` giữ nguyên `end_ms` thực tế của take (tuyệt đối không kéo dài khống qua ranh giới take) và gắn cờ `"short_hook": true`.
