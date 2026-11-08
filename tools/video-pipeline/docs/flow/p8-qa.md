# Phase 8 — QA Verifier & Style Match Report (`p8_qa.py`)

## 1. Mục đích
Kiểm định chất lượng độc lập (cross-model `qa_alt` + bộ quy tắc kỹ thuật tất định) trên `cutlist.json`, `beats.json`, `words.json`, `.srt` và `draft_content.json` (đơn vị micro-giây CapCut Desktop `< v5`), xuất báo cáo `qa.md` và bảng đối chiếu phong cách `work/style_match.json`.

## 2. Đối chiếu phong cách với mẫu (`work/style_match.json`)
`p8_qa.py` thực thi hàm `evaluate_style_match()` đối chiếu thông số đầu ra với `work/effective_profile.json` và `work/style_profile.json`, ghi ra `work/style_match.json` (cùng bản sao `style_match.json` ở gốc workspace) và hiển thị bảng tổng hợp tại Mục 4 của `qa.md`:

| Chỉ số (`metric`) | Nhãn hiển thị | Dung sai (`tolerance`) | Phân loại (`severity`) | Quy tắc chấm (`status`) |
| :--- | :--- | :--- | :--- | :--- |
| `loudness_lufs` | Âm lượng (LUFS) | `±1.0 LU` | `scored` | `pass` (`<= 1.0 LU`), `warn` (`<= 2.0 LU`), `fail` (`> 2.0 LU`) |
| `pause_median_ms` | Khoảng lặng giữa câu (trung vị) | `±30%` | `scored` | `pass` (`<= 30%`), `warn` (`<= 45%`), `fail` (`> 45%`) |
| `hook_duration_ms` | Độ dài mở đầu (Hook) | `±1500 ms` | `scored` | `pass` (nằm trong `[min_ms - 1500, max_ms + 1500]` hoặc `short_hook=true`) |
| `captions_layout` | Phụ đề (số từ/dòng & vị trí) | `±1 từ/dòng & cùng vị trí` | `scored` | `pass` (lệch `<= 1` từ/dòng và khớp vị trí) |
| `shots_per_min` | Nhịp cắt (cảnh/phút) | `±30% (chỉ báo thông tin)` | `informational` | Luôn có `status = "info"`, **tuyệt đối không làm rớt `overall_status`**; khi lệch `> 30%` sẽ ghi chú giải thích nguyên nhân do mật độ câu nói của video nguồn |
