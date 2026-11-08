# KẾ HOẠCH THIẾT KẾ & WIREFRAME `/video-studio` (GATE R1)

> **Tài liệu thiết kế trước khi lập trình (Design-First Gate R1)**
> - **Đối tượng người dùng:** Người sản xuất nội dung podcast / video ngắn (1–3 phút, tiếng Việt), không rành kỹ thuật âm thanh hay AI pipeline.
> - **Mục tiêu cốt lõi:** Tải video thô → (Tùy chọn) dán kịch bản → Bấm 1 nút duy nhất → Nhận video đã cắt vấp & gói dự án CapCut, kèm **bằng chứng trực quan đã cắt những gì và vì sao** để hoàn toàn yên tâm hệ thống không cắt nhầm.
> - **Ý tưởng trung tâm (Yếu tố đáng nhớ duy nhất):** **"Bản đồ đoạn cắt" (Cut Map)** — một dải thời gian ngang thể hiện toàn bộ video gốc, nơi đoạn **giữ lại** là khối đặc và đoạn **đã cắt** là khối gạch chéo phân loại bằng **ký hiệu + chữ** (`× vấp`, `… im lặng`, `↺ nói lại`, `~ từ đệm`). Mọi thành phần khác (nút, thẻ, biểu mẫu) giữ phẳng, đơn giản, yên tĩnh, không trang trí.

---

## 1. MÀU SẮC (5 MÀU HỆ THỐNG + 1 MÀU VÙNG "ĐÃ CẮT")

Toàn bộ mã màu được trích xuất trực tiếp từ [`apps/web/app/globals.css`](file:///Users/macbookpro2020/bed-podscare/apps/web/app/globals.css#L23-L36), [`packages/config-tailwind/tailwind.preset.js`](file:///Users/macbookpro2020/bed-podscare/packages/config-tailwind/tailwind.preset.js#L6-L37) và [`apps/web/src/app/video-studio/page.tsx`](file:///Users/macbookpro2020/bed-podscare/apps/web/src/app/video-studio/page.tsx#L1578-L1620):

| Nhóm vai trò | Mã Hex | Nguồn CSS / Token hiện tại | Độ tương phản (WCAG AA) | Quy tắc sử dụng trên `/video-studio` |
| :--- | :--- | :--- | :--- | :--- |
| **1. Xanh đậm chủ đạo** | `#176b51`<br>*(Hover: `#10583f`, Nền nhạt: `#e9f4ef`)* | `--green` (`globals.css:29`)<br>`brand.primary` (`tailwind.preset.js:7`) | **6.54:1** với chữ `#ffffff`<br>**5.25:1** trên nền `#e9f4ef` | Dùng cho **1 nút hành động chính duy nhất** trên màn hình, khối **đoạn giữ lại** trên Bản đồ đoạn cắt, và chấm trạng thái AI sẵn sàng. |
| **2. Nền (Canvas & Bề mặt)** | `#f6f8f6` *(Nền trang)*<br>`#ffffff` *(Nền khung chính)* | `--bg`, `--white` (`globals.css:31-32`)<br>`surface.canvas`, `surface.card` | — | Nền toàn trang `#f6f8f6` ấm mắt; khung làm việc chính dùng `#ffffff` phẳng, không lồng thẻ trắng chồng chéo. |
| **3. Chữ (Chính & Phụ chuẩn WCAG AA)** | `#17231f` *(Chữ chính)*<br>`#4a5d54` *(Chữ phụ chuẩn AA)* | `--ink` (`globals.css:26`)<br>`text-[#4a5d54]` (`page.tsx:1583`) | `#17231f`: **15.4:1** (AAA)<br>`#4a5d54`: **6.65:1** trên `#f6f8f6` & **7.25:1** trên `#ffffff` (AA ≥ 4.5:1) | **Lưu ý quan trọng:** Màu `--muted: #81908a` trong `globals.css:27` chỉ đạt **3.12:1** trên `#f6f8f6` (trượt WCAG AA). Toàn bộ chữ phụ, nhãn, chú thích và lý do cắt trên `/video-studio` bắt buộc dùng **`#4a5d54`** để đảm bảo độ tương phản ≥ 4.5:1. |
| **4. Viền (Mảnh & Nhấn)** | `#e9eeeb` *(Viền mảnh)*<br>`#d5e0d7` *(Viền khung/input)* | `--line` (`globals.css:28`)<br>`border-[#d5e0d7]` (`page.tsx:1578`) | — | Dùng đường kẻ `1px solid #e9eeeb` để chia vùng nội dung thay cho thẻ bo góc đổ bóng; dùng `#d5e0d7` cho ô nhập liệu và viền Bản đồ đoạn cắt. |
| **5. Cảnh báo (Lưu ý)** | `#b77a21` *(Chữ/Icon)*<br>`#faf3e7` *(Nền)* | `--amber` (`globals.css:33`)<br>`status.wait` (`tailwind.preset.js:30`) | **4.62:1** *(Khi đi kèm chữ mô tả dài, dùng `#8f5d14` đạt **5.85:1**)* | Chỉ dùng cho mục "Lưu ý" (ví dụ: đoạn cắt sát nhịp thở cần nghe thử lại). |
| **6. Lỗi (Cần xử lý)** | `#bc5b52` *(Chữ/Icon)*<br>`#fbefed` *(Nền)* | `--red` (`globals.css:34`)<br>`status.danger` (`tailwind.preset.js:33`) | **4.58:1** *(Chữ thông báo lỗi chi tiết dùng `#993f37` đạt **6.10:1**)* | Chỉ xuất hiện ngay tại bước bị lỗi trong quá trình xử lý hoặc khi tải tệp thất bại. |
| **★ Màu phụ duy nhất cho vùng "Đã cắt"** | Nền: **`#efeae2`**<br>Sọc chéo 45°: **`#cfc6b8`**<br>Chữ/Ký hiệu: **`#524a3e`** | Đề xuất bổ sung duy nhất cho **Bản đồ đoạn cắt** (`--cut-bg`, `--cut-hatch`, `--cut-ink`) | `#524a3e` trên `#efeae2`: **7.05:1** (Đạt chuẩn WCAG AAA) | Tạo tương phản thị giác rõ rệt với khối giữ lại (`#176b51`) nhưng không gây cảm giác "báo lỗi đỏ". Kết hợp họa tiết gạch chéo `repeating-linear-gradient(-45deg, #efeae2 0 6px, #cfc6b8 6px 8px)` và **ký hiệu + chữ** bắt buộc. |

### Quy ước phân loại đoạn đã cắt (Ký hiệu + Chữ — Không phụ thuộc màu sắc)
Mọi đoạn đã cắt trên Bản đồ đoạn cắt và trong danh sách chi tiết đều dùng chung nền gạch chéo `#efeae2` / `#cfc6b8`, phân biệt bằng **ký hiệu + nhãn chữ tiếng Việt**:
- **`× vấp`** — Nói vấp, đọc nhịu hoặc phát âm sai nửa từ.
- **`… im lặng`** — Khoảng ngừng nghỉ quá dài giữa hai ý (`> 0.5 giây`).
- **`↺ nói lại`** — Nói lặp lại cùng một câu/đoạn để lấy lần nói tốt hơn (mặc định giữ lần nói sau).
- **`~ từ đệm`** — Tiếng đệm thừa (*"ờm"*, *"à"*, *"kiểu là"*).

---

## 2. CHỮ (TYPOGRAPHY) & KIỂM ĐỊNH DẤU TIẾNG VIỆT

Giữ nguyên cấu hình font chữ từ [`apps/web/app/layout.tsx`](file:///Users/macbookpro2020/bed-podscare/apps/web/app/layout.tsx#L6-L45) (`<html lang="vi">`):
- **Tiêu đề (`font-heading`):** `Manrope` (`--font-manrope`, weights `600`, `700`).
- **Nội dung & Nhãn (`font-sans`):** `DM Sans` (`--font-dm-sans`, weights `400`, `500`, `600`).
- **Số liệu & Thời gian (`font-mono`):** `ui-monospace, SFMono-Regular, Menlo, monospace` kèm `font-variant-numeric: tabular-nums` để các mốc thời gian (`0:00` → `2:14`) thẳng hàng tuyệt đối.

### Bảng thang chữ kiểm định với chuỗi dấu chồng tiếng Việt: `"Nghiệp vụ Ệ ử ữ ặ ẫ"`

Chuỗi kiểm định **`"Nghiệp vụ Ệ ử ữ ặ ẫ"`** chứa cả nguyên âm viết hoa có mũ + dấu nặng (`Ệ`), nguyên âm có móc + dấu hỏi/ngã (`ử`, `ữ`), và nguyên âm có trăng + dấu nặng/ngã (`ặ`, `ẫ`). Để **tuyệt đối không bị cắt dấu (clipping)** ở đỉnh và đáy dòng chữ:

| Cấp độ chữ | Họ chữ & Độ đậm | Cỡ chữ (`font-size`) | Chiều cao dòng (`line-height`) | Khoảng cách chữ (`letter-spacing`) | Kiểm định `"Nghiệp vụ Ệ ử ữ ặ ẫ"` & Quy tắc bắt buộc |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tóm tắt kết quả** *(Dòng `"2:14 → 1:48..."`)* | `Manrope` `700` *(Số dùng `font-mono`)* | `22px` (`1.375rem`) | `32px` (`1.45`) | `normal` (`0em`) | Đủ khoảng trống trên cho dấu mũ và khoảng dưới cho dấu nặng của chữ `Ệ`. |
| **Tiêu đề khu vực (H1/H2)** | `Manrope` `700` | `18px` (`1.125rem`) | `26px` (`1.44`) | `normal` (`0em`) | Cấm dùng `leading-none` hoặc `leading-tight` (`1.25`) kết hợp `overflow-hidden`. |
| **Tiêu đề mục (H3)** | `Manrope` `600` | `15px` (`0.9375rem`) | `22px` (`1.47`) | `normal` (`0em`) | Giữ kiểu chữ viết hoa đầu câu tự nhiên (*Sentence case*), không viết hoa toàn bộ. |
| **Nội dung chính & Kịch bản (Body)** | `DM Sans` `400` / `500` | `15px` (`0.9375rem`) | `24px` (`1.60`) | `normal` (`0em`) | **Độ dài dòng `< 80 ký tự`** (khóa cứng `max-w-[68ch]` cho ô kịch bản, lý do cắt và ghi chú). |
| **Nhãn điều khiển & Lý do cắt** | `DM Sans` `500` | `13px` (`0.8125rem`) | `20px` (`1.54`) | `normal` (`0em`) | Thay thế hoàn toàn kiểu chữ `text-[9px] uppercase tracking-wider` cũ vốn làm dính dấu chữ `Ệ, Ử, Ữ, Ặ, Ẫ`. |
| **Mốc thời gian & Ký hiệu cắt** | `font-mono` `500` (`tabular-nums`) | `12px` (`0.75rem`) | `18px` (`1.50`) | `0em` | Không dùng cỡ chữ nhỏ hơn `12px` ở bất kỳ vị trí nào trên giao diện. |

---

## 3. BỐ CỤC & WIREFRAME ASCII

### 3.1. Thanh trên cùng tối giản (Top Bar)
Chỉ gồm 4 thành phần thiết yếu trên một hàng ngang phẳng (`height: 56px`, viền dưới `1px solid #e9eeeb`, nền `#ffffff`):
1. **Logo + Tên:** `PodsCare · Cắt vấp Video`
2. **Chấm trạng thái AI:** `● AI sẵn sàng` (xanh `#176b51`) hoặc `○ Chế độ ngoại tuyến` (vàng `#b77a21`)
3. **Nút "Học & cải thiện":** Có chấm thông báo + số quy tắc mới chờ duyệt (`● 2`)
4. **Nút "Cài đặt":** Mở ngăn cài đặt đường dẫn thư mục CapCut trên máy Mac.

```text
+--------------------------------------------------------------------------------------------------+
| [P] PodsCare · Cắt vấp Video    ● AI sẵn sàng                   [Học & cải thiện ● 2]  [Cài đặt] |
+--------------------------------------------------------------------------------------------------+
```

---

### 3.2. Trạng thái 1: Chuẩn bị (Chưa chạy xử lý)
Bố cục **1 cột tập trung** (`max-w-[760px]` căn giữa trên màn hình lớn), yên tĩnh, dẫn dắt thao tác rõ ràng. Nút thử video mẫu chỉ xuất hiện ở môi trường dev, không hiện trên màn chính.

```text
+--------------------------------------------------------------------------------------------------+
| [P] PodsCare · Cắt vấp Video    ● AI sẵn sàng                   [Học & cải thiện ● 2]  [Cài đặt] |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|           VIDEO CẦN CẮT (Vùng thả lớn — toàn bộ khung là nút bấm được, cao ≥ 120px)              |
|           +--------------------------------------------------------------------------+           |
|           |  [Trạng thái rỗng]:  "Thả video vào đây hoặc chọn file"                  |           |
|           |  ----------------------------------------------------------------------  |           |
|           |  [Sau khi chọn]:     airpods-pro2-vesinh-raw.mp4                         |           |
|           |                      Thời lượng: 2:14  ·  Độ phân giải: 1080×1920        |           |
|           |                      [ Đổi video khác ]                                  |           |
|           +--------------------------------------------------------------------------+           |
|                                                                                                  |
|           Kịch bản (không bắt buộc)                                                              |
|           +--------------------------------------------------------------------------+           |
|           |  Tai nghe AirPods Pro 2 của bạn bị rè một bên hoặc tụt pin chỉ sau       |           |
|           |  20 phút nghe nhạc? Đừng vội mua tai mới tốn hơn 5 triệu đồng!           |           |
|           |  Xin chào mọi người, mình là kỹ thuật viên tại phòng Lab PodsCare...     |           |
|           +--------------------------------------------------------------------------+           |
|           Có kịch bản, hệ thống chọn đúng lần nói tốt nhất cho từng câu.                         |
|           *(Khi để trống tự đổi thành: "Không có kịch bản, hệ thống chỉ bỏ vấp,                  |
|             im lặng và đoạn nói lại.")*                                                          |
|                                                                                                  |
|           Mức cắt:   ( ) Nhẹ    (●) Vừa    ( ) Mạnh                                              |
|           Cắt vấp, từ đệm và khoảng lặng dài; giữ nhịp thở tự nhiên.                             |
|                                                                                                  |
|           Gợi ý cho phần mở đầu: [ Nhấn mạnh chi phí tiết kiệm 5 triệu... ] · [ Tải clip riêng ] |
|                                                                                                  |
|           [ Bắt đầu cắt video ]     ▸ Tùy chỉnh nâng cao                                         |
|           *(Khi chưa chọn video: nút [ Bắt đầu cắt video ] bị vô hiệu hóa,                       |
|             hiện lý do ngay cạnh nút: "Chọn video để bắt đầu")*                                  |
|           *(Khi mở ▸ Tùy chỉnh nâng cao: chọn mẫu Podcast ngang / Podcast dọc / Chỉ cắt,         |
|             khoảng đệm đầu-cuối, giữ tiếng cười — mặc định đọc từ profile.yaml)*                 |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```

---

### 3.3. Trạng thái 2: Đang xử lý (5 bước tuần tự `1..5` + Trạng thái lỗi ngay tại bước bị lỗi)
Khi đang chạy, tiêu đề chuyển thành **`"Đang cắt video"`**, biểu mẫu phía trên thu gọn thành **1 dòng tóm tắt không sửa được** (tên video, mức cắt). Tiến trình hiển thị đúng **5 bước tuần tự** (`1. Đọc video` → `2. Nhận diện giọng nói` → `3. Chọn đoạn tốt nhất` → `4. Dựng & xuất` → `5. Kiểm tra`), mỗi bước có trạng thái (`chờ`, `đang chạy`, `xong`, `lỗi`), 1 dòng chi tiết sống, thời gian đã chạy và nút **`Hủy`**. Khi gặp lỗi ở bước nào, hiện lỗi và nút **`[ Thử lại từ bước này ]`** ngay tại bước đó:

```text
+--------------------------------------------------------------------------------------------------+
| [P] PodsCare · Cắt vấp Video    ● AI sẵn sàng                   [Học & cải thiện ● 2]  [Cài đặt] |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|           Đang cắt video                                              Đã chạy: 00:18   [ Hủy ]   |
|           Tóm tắt: airpods-pro2-vesinh-raw.mp4 (2:14) · Mức cắt: Vừa · Có kịch bản (Đã khóa sửa) |
|           +--------------------------------------------------------------------------+           |
|           |  ✓  1. Đọc video                                                  Xong   |           |
|           |     Đã tách âm thanh chuẩn và kiểm tra khung hình 1080×1920 (30fps)      |           |
|           |--------------------------------------------------------------------------|           |
|           |  ✓  2. Nhận diện giọng nói                                        Xong   |           |
|           |     Đã nhận diện 412 từ                                                  |           |
|           |--------------------------------------------------------------------------|           |
|           |  !  3. Chọn đoạn tốt nhất                                         Lỗi    |           |
|           |     Tìm thấy 7 lần nói lại                                               |           |
|           |     +------------------------------------------------------------------+ |           |
|           |     | Không kết nối được dịch vụ AI. Kiểm tra 9Router đang chạy ở      | |           |
|           |     | cổng 20128 rồi bấm Thử lại từ bước này.                          | |           |
|           |     |                                                                  | |           |
|           |     | [ Thử lại từ bước này ]                                          | |           |
|           |     +------------------------------------------------------------------+ |           |
|           |--------------------------------------------------------------------------|           |
|           |  ·  4. Dựng & xuất                                                Chờ    |           |
|           |     Chờ ghép video hoàn thiện, phụ đề .srt và gói dự án CapCut           |           |
|           |--------------------------------------------------------------------------|           |
|           |  ·  5. Kiểm tra                                                   Chờ    |           |
|           |     Chờ đối chiếu câu chữ và kiểm tra từ bị cắt cụt                      |           |
|           +--------------------------------------------------------------------------+           |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```

---

### 3.4. Trạng thái 3: Kết quả (Bản đồ đoạn cắt + Xem trước & Phần mở đầu + 5 mục Tải về + Lưu ý + Chi tiết chỉ đọc)

Khi hoàn tất, đầu trang hiển thị dòng tiêu đề trạng thái **`"Đã cắt xong video · 2:14 → 1:48, đã cắt 26 giây ở 11 chỗ."`** cùng **"Bản đồ đoạn cắt"** làm tâm điểm thị giác duy nhất. Danh sách chi tiết các chỗ đã cắt ở dạng **chỉ đọc** (không có nút khôi phục/sửa đoạn cắt ở đợt này):

```text
+--------------------------------------------------------------------------------------------------+
| [P] PodsCare · Cắt vấp Video    ● AI sẵn sàng                   [Học & cải thiện ● 2]  [Cài đặt] |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|  Đã cắt xong video · 2:14 → 1:48, đã cắt 26 giây ở 11 chỗ.                 [ Chạy lại từ đầu ]   |
|                                                                                                  |
|  BẢN ĐỒ ĐOẠN CẮT (Chạm hoặc di chuột vào từng đoạn để xem lý do & nghe thử)                      |
|  +--------------------------------------------------------------------------------------------+  |
|  | Chú giải:  [████ Giữ lại (#176b51)]   [//// Đã cắt (#efeae2): × vấp  … im lặng  ↺ nói lại  ~ từ đệm] |
|  |                                                                                            |  |
|  | 0:00              0:38.2  0:42.7        1:05.0 1:07.8         1:36.0 1:39.4           2:14 |  |
|  | +-----------------+------+--------------+-----+---------------+-----+--------------------+ |  |
|  | |█████████████████|//////|██████████████|/////|███████████████|/////|████████████████████| |  |
|  | |   Giữ đoạn 1    |↺ 4.5s|  Giữ đoạn 2  |…2.8s|  Giữ đoạn 3   |×3.4s|    Giữ đoạn 4–6    | |  |
|  | |                 |nói lại|             |lặng |               | vấp |                    | |  |
|  | +-----------------+--^---+--------------+-----+---------------+-----+--------------------+ |  |
|  |                      | (Đang chọn đoạn cắt #3 — vùng chạm tối thiểu ≥ 44×44px, chỉ đọc)    |  |
|  |  +-------------------+------------------------------------------------------------------+  |  |
|  |  | Đang xem chỗ cắt #3: 0:38.2 – 0:42.7 (4.5 giây) · Loại: [↺ Nói lại]                  |  |  |
|  |  | Lý do: "Nói lại câu 3 do vấp chữ 'màng loa', hệ thống giữ lần nói thứ 2 rõ hơn."     |  |  |
|  |  | Nội dung đã bỏ: "Chúng tôi tiến hành mở... ờm mở màng loa AirPods..."                 |  |  |
|  |  | [ ▶ Nghe thử đoạn bị cắt (4.5s) ]                                                    |  |  |
|  |  +--------------------------------------------------------------------------------------+  |  |
|  +--------------------------------------------------------------------------------------------+  |
|                                                                                                  |
|  +---------------------------------------------------+  +-------------------------------------+  |
|  | TRÌNH XEM TRƯỚC & PHẦN MỞ ĐẦU                     |  | TẢI VỀ                              |  |
|  | +-----------------------------------------------+ |  |                                     |  |
|  | |        [ VIDEO HOÀN THIỆN (POLISHED) ]        | |  | 1. Video hoàn thiện        [Tải về] |  |
|  | |                  0:12 / 1:48                  | |  |    Đã có phụ đề, âm thanh chuẩn hóa |  |
|  | |   "Tai nghe AirPods Pro 2 của bạn bị rè..."   | |  |                                     |  |
|  | +-----------------------------------------------+ |  | 2. Video đã cắt (chất      [Tải về] |  |
|  |                                                   |  |    lượng gốc)                       |  |
|  | Phần mở đầu:  (● 1)   (○ 2)   (○ 3)               |  |    Dùng để dựng lại trong CapCut    |  |
|  | - Phương án 1 (7.2s): "Tai nghe AirPods Pro 2     |  |                                     |  |
|  |   của bạn bị rè một bên hoặc tụt pin nhanh?"      |  | 3. Phụ đề .srt             [Tải về] |  |
|  | - Phương án 2 (6.5s): "Chỉ mất 15 phút tại Lab..."|  |    File phụ đề khớp với video đã cắt|  |
|  | - Phương án 3 (5.8s): "Đừng vội tốn 5 triệu..."   |  |                                     |  |
|  |                                                   |  | 4. Các đoạn rời            [Tải về] |  |
|  | [ Dùng phần mở đầu này ]  ✓ Đã đổi phần mở đầu    |  |    Từng câu đã tách riêng (.zip)    |  |
|  |                                                   |  |                                     |  |
|  | Mô tả phần mở đầu khác:                           |  | 5. Dự án CapCut     [Đẩy vào CapCut]|  |
|  | [ Nhập ý tưởng mở đầu khác... ] [ Tải clip riêng ]|  |    *(Khi không tạo được: nút bị     |  |
|  +---------------------------------------------------+  |    vô hiệu hóa, hiện rõ lý do:      |  |
|                                                         |    "Chưa tạo được dự án CapCut      |  |
|                                                         |    (bản CapCut mới mã hóa dự án).   |  |
|                                                         |    Dùng video đã cắt và file .srt   |  |
|                                                         |    để nhập vào CapCut.")*           |  |
|                                                         +-------------------------------------+  |
|                                                                                                  |
|  LƯU Ý (Chỉ hiện khi có cảnh báo cần người dùng biết)                                            |
|  +--------------------------------------------------------------------------------------------+  |
|  | ! Lưu ý (Gom mọi cảnh báo vào 1 khối duy nhất kèm hành động gợi ý):                        |  |
|  | • Gợi ý mở đầu chưa khớp hoàn toàn (`prompt_warning`): Không tìm thấy câu nói về "bảo hành |  |
|  |   12 tháng" trong video gốc → Gợi ý: Đổi mô tả mở đầu hoặc tải clip mở đầu riêng.          |  |
|  | • Clip mở đầu riêng khác độ phân giải (720p so với 1080p) → Gợi ý: Tải lại clip 1080×1920. |  |
|  | • Phần mở đầu hơi ngắn (`short_hook`: 4.2s < 5s) → Gợi ý: Chọn phương án 2 (6.5s).         |  |
|  | • Chạy ở chế độ dự phòng (`degraded`) → Gợi ý: Bật lại 9Router và bấm Chạy lại từ đầu.     |  |
|  | • Dự án CapCut bị bỏ qua do phiên bản mới mã hóa → Gợi ý: Tải Video đã cắt + Phụ đề .srt.  |  |
|  +--------------------------------------------------------------------------------------------+  |
|                                                                                                  |
|  ▸ Xem chi tiết các chỗ đã cắt (Danh sách 11 chỗ chỉ đọc — bấm để mở rộng / thu gọn)             |
|  +--------------------------------------------------------------------------------------------+  |
|  | #  | Giờ gốc       | Thời lượng | Phân loại    | Lý do cắt & câu chữ bị loại bỏ  | Nghe thử|  |
|  |----+---------------+------------+--------------+---------------------------------+---------|  |
|  | 01 | 0:00.0–0:01.8 | 1.8 giây   | … Im lặng    | Khoảng lặng đầu video trước khi nói | [▶] |  |
|  | 02 | 0:14.2–0:15.1 | 0.9 giây   | ~ Từ đệm     | Tiếng đệm "ờm" giữa câu mở đầu      | [▶] |  |
|  | 03 | 0:38.2–0:42.7 | 4.5 giây   | ↺ Nói lại    | Nói lại câu 3, giữ lần nói sau      | [▶] |  |
|  | 04 | 1:05.0–1:07.8 | 2.8 giây   | … Im lặng    | Nghỉ lấy hơi dài sau đoạn giới thiệu| [▶] |  |
|  | 05 | 1:36.0–1:39.4 | 3.4 giây   | × Vấp        | Vấp từ "chẩn đoán", nói lại ngay sau| [▶] |  |
|  +--------------------------------------------------------------------------------------------+  |
+--------------------------------------------------------------------------------------------------+
```

---

### 3.5. Ngăn "Học & cải thiện" (Khi bấm nút `[Học & cải thiện ● 2]` trên thanh trên cùng)
Thay vì phơi bày thuật ngữ `P9 Curator Loop`, `Golden JSONL`, `proposals.md`, `lessons/p4.md`, giao diện chỉ hiển thị danh sách các bài học AI rút ra sau khi người dùng sửa lại trong CapCut, kèm nút **`Duyệt`** / **`Bỏ qua`** và bộ đếm **`12/30`**:

```text
+--------------------------------------------------------------------------------------------------+
|  HỌC TỪ BẢN SỬA CAPCUT CỦA BẠN                           Bộ nhớ quy tắc: 12/30   [Đóng ngăn ×]   |
|  AI đã so sánh bản cắt tự động với bản bạn chỉnh lại trong CapCut và rút ra 2 quy tắc mới:       |
|  +--------------------------------------------------------------------------------------------+  |
|  | 1. Giữ lại nhịp nghỉ 0.6 giây trước câu kết luận để giọng đọc tự nhiên hơn                 |  |
|  |    Phát hiện tại mốc 1:42.0 (Bạn đã kéo dài thêm 0.4 giây so với bản AI cắt)               |  |
|  |                                                                   [ Duyệt ]   [ Bỏ qua ]   |  |
|  |--------------------------------------------------------------------------------------------|  |
|  | 2. Không cắt cụm từ "vệ sinh chuyên sâu" khi người nói nhấn giọng chậm                     |  |
|  |    Phát hiện tại mốc 0:54.2 (Bạn đã khôi phục đoạn AI tưởng nhầm là nói vấp)               |  |
|  |                                                                   [ Duyệt ]   [ Bỏ qua ]   |  |
|  +--------------------------------------------------------------------------------------------+  |
|  ▸ Xem 12/30 quy tắc đang áp dụng (Bấm để mở rộng danh sách)                                     |
+--------------------------------------------------------------------------------------------------+
```

---

### 3.6. Thiết kế Đáp ứng (Responsive) ở 3 cỡ màn hình: `1440px`, `768px`, `390px` (Hỗ trợ từ `360px`)

Mọi nút bấm, công tắc và mỗi phân đoạn trên **Bản đồ đoạn cắt** đều đảm bảo diện tích vùng chạm tối thiểu **`≥ 44px × 44px`** (các đoạn cắt ngắn `< 2 giây` vẫn có chiều rộng tối thiểu `44px` trên thanh bản đồ hoặc dùng chế độ cuộn ngang mượt để chạm chính xác bằng ngón cái).

```text
[1] MÀN HÌNH MÁY TÍNH (1440px — Khung chính max-w-[1160px] căn giữa, lề 24px):
+-----------------------------------------------------------------------------------+
| Thanh trên cùng: Logo | ● AI sẵn sàng                 | [Học & cải thiện ● 2] | [⚙]|
+-----------------------------------------------------------------------------------+
| Đã cắt xong video · 2:14 → 1:48, đã cắt 26 giây ở 11 chỗ.      [ Chạy lại từ đầu ]|
| [ BẢN ĐỒ ĐOẠN CẮT — Chiều ngang 100%, hiển thị trọn vẹn dải 0:00 -> 2:14 ]        |
| [ Khung chi tiết đoạn đang chọn (chỉ đọc + nút Nghe thử, nằm ngay dưới bản đồ) ]  |
+-------------------------------------------------+---------------------------------+
| Cột trái (7/12): Trình xem trước (polished)     | Cột phải (5/12): Tải về (5 mục: |
| + Phần mở đầu (●1)(○2)(○3) + [Dùng phần mở đầu  | Video hoàn thiện, Video đã cắt, |
|   này] + Ô mô tả mở đầu khác & [Tải clip riêng] | Phụ đề .srt, Các đoạn rời,      |
|                                                 | Dự án CapCut kèm lý do nếu khóa)|
+-------------------------------------------------+---------------------------------+
| Khối Lưu ý (chỉ hiện khi có cảnh báo: prompt_warning, short_hook, degraded, ...)  |
+-----------------------------------------------------------------------------------+
| ▸ Xem chi tiết các chỗ đã cắt (Danh sách 11 chỗ chỉ đọc)                          |
+-----------------------------------------------------------------------------------+

[2] MÀN HÌNH MÁY TÍNH BẢNG (768px — Xếp 1 cột dọc, lề 20px):
+--------------------------------------------------------+
| Logo · Cắt vấp   ● AI                   [Học ● 2]  [⚙] |
+--------------------------------------------------------+
| Đã cắt xong video · 2:14 → 1:48, đã cắt 26 giây        |
| ở 11 chỗ.                           [ Chạy lại từ đầu ]|
| [ BẢN ĐỒ ĐOẠN CẮT — Cuộn ngang mượt nếu > 8 đoạn ]     |
| [ Khung chi tiết đoạn đang chạm (chỉ đọc, ≥ 44px) ]    |
+--------------------------------------------------------+
| [ TRÌNH XEM TRƯỚC & PHẦN MỞ ĐẦU (●1)(○2)(○3) ]         |
| [ Dùng phần mở đầu này ] + Ô mô tả khác & Tải clip riêng|
+--------------------------------------------------------+
| [ TẢI VỀ (5 mục kèm dòng giải thích bằng lời thường) ] |
+--------------------------------------------------------+
| [ LƯU Ý (Chỉ hiện khi có) ]                            |
+--------------------------------------------------------+
| [ ▸ Xem chi tiết các chỗ đã cắt (Chỉ đọc, gộp cột Giờ)]|
+--------------------------------------------------------+

[3] MÀN HÌNH ĐIỆN THOẠI (390px và hỗ trợ xuống tới 360px — 1 cột dọc, lề 16px):
+-----------------------------------+
| [P] Cắt vấp  ● AI  [Học ●2]  [⚙]  |
+-----------------------------------+
| Đã cắt xong video                 |
| 2:14 → 1:48, đã cắt 26 giây       |
| ở 11 chỗ.                         |
+-----------------------------------+
| BẢN ĐỒ ĐOẠN CẮT (Vuốt ngang ◄ ►)  |
| +---------+-------+-------------+ |
| |█████████|///////|█████████████| |  <- Mỗi khối cao 48px, rộng tối thiểu 48px
| | Giữ #1  |↺ 4.5s |   Giữ #2    | |     để chạm ngón tay dễ dàng (≥ 44×44px)
| +---------+---^---+-------------+ |
| Đang chọn: 0:38.2–0:42.7 (4.5s)   |
| Loại: ↺ Nói lại (Chỉ đọc)         |
| Lý do: "Nói lại câu 3, giữ lần 2" |
| [ ▶ Nghe thử đoạn bị cắt (4.5s) ] |  <- Nút nghe thử rộng 100%, cao 44px (không có nút Giữ lại)
+-----------------------------------+
| [ TRÌNH XEM TRƯỚC & PHẦN MỞ ĐẦU ] |
| (●1) (○2) (○3)                    |
| [ Dùng phần mở đầu này ]          |
| [ Ô mô tả khác ] [Tải clip riêng] |
+-----------------------------------+
| [ TẢI VỀ (5 mục) ]                |
| 1. Video hoàn thiện      [Tải về] |
| 2. Video đã cắt (gốc)    [Tải về] |
| 3. Phụ đề .srt           [Tải về] |
| 4. Các đoạn rời (.zip)   [Tải về] |
| 5. Dự án CapCut (Hiện lý do nếu   |
|    vô hiệu hóa, không ẩn đi)      |
+-----------------------------------+
| [ LƯU Ý (Chỉ hiện khi có) ]       |
+-----------------------------------+
| ▸ Xem chi tiết các chỗ đã cắt     |  <- Danh sách chỉ đọc, mỗi chỗ 1 dòng 2 tầng,
| 03 · 0:38.2–0:42.7 (4.5s) · ↺ Nói |     không tràn ngang ở màn hình 360px
| "Nói lại câu 3, giữ lần sau"  [▶] |
+-----------------------------------+
```

---

## 4. NGUYÊN TẮC THIẾT KẾ & TỰ RÀ SOÁT (SELF-CRITIQUE CHỐNG GIAO DIỆN SAAS RẬP KHUÔN)

### 4.1. Nguyên tắc "Một điểm nhấn đáng nhớ duy nhất"
- **Yếu tố đáng nhớ duy nhất:** **"Bản đồ đoạn cắt"** kèm câu tóm tắt `"Đã cắt xong video · 2:14 → 1:48, đã cắt 26 giây ở 11 chỗ."` — nhìn vào 3 giây là hiểu ngay video đã được làm sạch thế nào và vì sao.
- **Mọi thành phần còn lại giữ yên tĩnh tuyệt đối:** Không biểu đồ tròn, không thẻ thống kê 4 ô đầu trang (KPI cards), không thanh điều hướng 10 pha kỹ thuật, không hiệu ứng phát sáng hay chuyển màu (gradient).

### 4.2. Bảng Tự rà soát (Đối chiếu mã nguồn thực tế `apps/web/src/app/video-studio/` và lý do thay đổi)

| # | Dấu hiệu "SaaS rập khuôn" phát hiện trong code hiện tại | Vị trí thực tế trong mã nguồn | Đã đổi gì trong thiết kế mới? | Vì sao phải đổi? |
| :- | :--- | :--- | :--- | :--- |
| **1** | **Thẻ bo góc lồng nhau dày đặc (`rounded-xl`, `rounded-[10px]`)** | `page.tsx:1578, 1618`<br>`ScriptAndPromptEditor.tsx:592`<br>`CuratorLearningPanel.tsx:990` | Bỏ bố cục 3 cột lồng hàng chục thẻ bo góc. Chuyển sang **1 luồng dọc theo trạng thái** (Chuẩn bị → Đang xử lý → Kết quả), phân tách các mục bằng đường kẻ ngang mảnh `1px solid #e9eeeb`. | Giúp mắt người dùng tập trung vào **Bản đồ đoạn cắt** thay vì bị chia nhỏ sự chú ý vào 7–8 chiếc hộp trắng giống hệt nhau. |
| **2** | **Đổ bóng đồng loạt (`shadow-sm`, `shadow-[0_2px_5px_...]`)** | `ScriptAndPromptEditor.tsx:592`<br>`CuratorLearningPanel.tsx:990` | Loại bỏ hoàn toàn `box-shadow` trên các thẻ nội dung và nút bấm; chỉ dùng nền `#ffffff` + viền `#e9eeeb` / `#d5e0d7`. | Giữ bề mặt phẳng, sạch sẽ, đúng tinh thần công cụ biên tập âm thanh/video nghiêm túc. |
| **3** | **Nhãn VIẾT HOA có giãn chữ (`uppercase tracking-wider`, `tracking-[1.05px]`)** | `VideoSourceSelector.tsx:962, 974, 986`<br>`ScriptAndPromptEditor.tsx:598`<br>`AgentProfileTuner.tsx:664, 675, 686` | **Cấm hoàn toàn `uppercase tracking-wider`** cho nhãn tiếng Việt. Đổi sang chữ viết hoa đầu câu tự nhiên (*Sentence case*), cỡ `13px`, `line-height: 20px`. | Chữ tiếng Việt viết hoa toàn bộ ở cỡ nhỏ (`9px`–`10px`) kèm giãn chữ làm biến dạng và cắt dấu chồng (`Ệ, Ử, Ữ, Ặ, Ẫ`), rất mỏi mắt khi đọc. |
| **4** | **Màu chữ phụ `#81908a` không đạt chuẩn tương phản WCAG AA** | `globals.css:27` (`--muted: #81908a`)<br>`VideoSourceSelector.tsx:962`<br>`ScriptAndPromptEditor.tsx:598` | Chuẩn hóa toàn bộ chữ phụ sang **`#4a5d54`** (tương phản **6.65:1** trên `#f6f8f6` và **7.25:1** trên `#ffffff`). | Màu `#81908a` chỉ đạt tương phản `3.12:1` trên nền `#f6f8f6`, làm người dùng khó đọc lý do cắt và mốc thời gian. |
| **5** | **Chuỗi ngăn cách bằng dấu chấm giữa (`·`) dày đặc** | `ScriptAndPromptEditor.tsx:599`<br>`RoughcutPreviewAndQa.tsx:1220` | Tách thông tin thành cấu trúc bảng rõ ràng hoặc nhãn phụ độc lập; chỉ dùng tối đa 1 dấu `·` trên dòng phụ đề. | Chuỗi `A · B · C · D` nối dài là thói quen trang trí rối mắt của dashboard kỹ thuật, khó quét thông tin trên màn hình nhỏ. |
| **6** | **Mũi tên `→` lặp lại trên nút bấm và nhãn pha (`P0 → P5`, `P6 → P8`)** | `HookDecisionPanel.tsx:1011-1012`<br>`ScriptAndPromptEditor.tsx:968-969` | Xóa toàn bộ mũi tên `→` trên nút bấm (đổi thành `"Bắt đầu cắt video"`, `"Dùng phần mở đầu này"`). **Chỉ giữ duy nhất 1 dấu `→`** ở câu tóm tắt `"2:14 → 1:48"`. | Dành trọn ý nghĩa thị giác của ký hiệu `→` cho sự biến đổi thời lượng trước và sau khi cắt. |
| **7** | **Phơi bày toàn bộ thuật ngữ kỹ thuật nội bộ (`P0..P9`, `16kHz PCM s16le`, `beats.json`, `qa.md`, `lessons/p4.md`)** | `page.tsx:1581-1586`<br>`VideoSourceSelector.tsx:987-994`<br>`RoughcutPreviewAndQa.tsx:1228` | Loại bỏ hoàn toàn giao diện 10 pha kỹ thuật `P0–P9` và thống nhất về **1 luồng làm việc duy nhất** bằng ngôn ngữ đời thường: 5 bước xử lý `1..5`, `"Bản đồ đoạn cắt"`, `"Học & cải thiện (12/30)"`. | Người làm podcast chỉ cần biết *"đã cắt chỗ nào, vì sao, và tải file về đâu"*, không cần hiểu kiến trúc `P0–P9` hay định dạng `Mono PCM s16le`. |
| **8** | **Thiếu điểm tựa niềm tin trực quan (Chưa có Bản đồ đoạn cắt)** | `RoughcutPreviewAndQa.tsx` (Hiện chỉ có video player, bảng take/clip và file `qa.md` thô) | Thiết kế mới đặt **"Bản đồ đoạn cắt"** làm trung tâm của màn hình Kết quả: nhìn thấy ngay đoạn giữ (`#176b51`) xen kẽ đoạn cắt (`#efeae2` gạch chéo + ký hiệu `×`, `…`, `↺`, `~`) và chạm vào để đọc lý do + nghe thử. | Giải quyết trực tiếp nỗi sợ lớn nhất của người dùng: *"Lỡ AI cắt mất ý quan trọng của tôi thì sao?"* |

---

## 11. KẾT QUẢ TỰ PHÊ BÌNH GIAI ĐOẠN 6, ĐỐI CHIẾU 15 ẢNH CHỤP NGHIỆM THU & CÁC CHI TIẾT THỪA ĐÃ LƯỢC BỎ

### 11.1. Danh sách 15 ảnh chụp nghiệm thu thực tế (`docs/design/screenshots/`)

| # | Trạng thái giao diện | Desktop (`1440×900`) | Tablet (`768×1024`) | Mobile (`390×844`) |
| :- | :--- | :--- | :--- | :--- |
| **01** | **Trạng thái 1 (Rỗng)** — Màn hình Chuẩn bị khi chưa chọn video | `docs/design/screenshots/01-prepare-empty-1440.png` | `docs/design/screenshots/01-prepare-empty-768.png` | `docs/design/screenshots/01-prepare-empty-390.png` |
| **02** | **Trạng thái 1 (Đã điền)** — Đã nạp video, chọn mức cắt & gợi ý mở đầu | `docs/design/screenshots/02-prepare-selected-1440.png` | `docs/design/screenshots/02-prepare-selected-768.png` | `docs/design/screenshots/02-prepare-selected-390.png` |
| **03** | **Trạng thái 2 (Đang xử lý)** — Tiến trình 5 bước tiếng Việt rõ nghĩa | `docs/design/screenshots/03-processing-1440.png` | `docs/design/screenshots/03-processing-768.png` | `docs/design/screenshots/03-processing-390.png` |
| **04** | **Trạng thái 2 (Báo lỗi bước 3)** — Lỗi chọn câu trôi chảy kèm hướng dẫn khắc phục | `docs/design/screenshots/04-processing-error-1440.png` | `docs/design/screenshots/04-processing-error-768.png` | `docs/design/screenshots/04-processing-error-390.png` |
| **05** | **Trạng thái 3 (Kết quả)** — Bản đồ đoạn cắt, 3 phương án mở đầu & Lưu ý kiểm tra | `docs/design/screenshots/05-result-warnings-1440.png` | `docs/design/screenshots/05-result-warnings-768.png` | `docs/design/screenshots/05-result-warnings-390.png` |

### 11.2. Các lỗi phát hiện qua kiểm thử tự phê bình (Playwright DOM Audit) và đã sửa triệt để

1. **Chồng chữ & gãy dòng trên Thanh đầu trang (`SimpleStudioHeader.tsx` & `page.tsx`)**:
   - **Hiện tượng**: Ở `390px` và `768px`, cụm thương hiệu `PodsCare · Cắt vấp Video`, badge `● AI sẵn sàng`, nút `Dự phòng`, `Học & cải thiện` và `Cài đặt` bị ép trên cùng một hàng gây gãy dòng hoặc chồng chữ.
   - **Khắc phục**: Thêm `whitespace-nowrap shrink-0` và `min-h-[44px]` cho toàn bộ các phần tử trên header; rút gọn thương hiệu thành `Cắt vấp Video` trên `< 640px`; giữ đúng 4 thành phần tinh gọn trên thanh đầu trang.
2. **Đảm bảo 100% vùng chạm `>= 44×44px` trên toàn bộ giao diện `/video-studio`**:
   - Nâng toàn bộ các nút/ô nhập từ `min-h-[36px]` / `min-h-[40px]` lên `min-h-[44px]` trong ngăn `"Cài đặt"` (`page.tsx`), ngăn `"Học & cải thiện"` (`SimpleLearningPanel.tsx`), nút `"Bỏ clip riêng"` & checkbox `"Giữ tiếng cười tự nhiên và nhịp thở cảm xúc"` (`SimplePrepareState.tsx`), nút chuyển `"Dải ngang / Danh sách"` (`CutMapTimeline.tsx`), nút `"Bỏ ×"` clip mở đầu riêng và các thẻ `<label>` chọn phương án mở đầu (`SimpleResultState.tsx`, dùng `sr-only` cho radio/checkbox kèm chấm chọn custom `20×20px`).
3. **Sửa 3 điểm hiển thị trên Bản đồ đoạn cắt (`CutMapTimeline.tsx`)**:
   - **Ca biên `0 chỗ cắt` (`cuts.length === 0`)**: Hiển thị rõ thông báo thân thiện `"Video không có đoạn vấp hoặc im lặng cần cắt — giữ nguyên 100% thời lượng gốc."`.
   - **Chống cắt cụt chữ `"Gi..."`, `"Nói ..."`, `"Từ ..."` trên dải băng khi có nhiều đoạn cắt**: Chỉ hiển thị dòng nhãn thứ 2 khi `rawPercent >= 14`; với các đoạn hẹp hơn (`< 14%`), chỉ hiển thị 1 dòng gọn gàng gồm **ký hiệu + số giây** (`↺ 4.5s`, `× 2.1s`, `12.4s`) có `whitespace-nowrap`.
   - **Đồng bộ trục thời gian khi cuộn ngang trên mobile**: Đặt thanh trục thời gian (`0:00 ... 2:14`) nằm bên trong cùng khối `min-w-[640px]` của dải băng ngang.
4. **Làm sạch Console mạng nền & Tiêu đề trang cho `/video-studio` (`apps/web/app/providers.tsx` & `layout.tsx`)**:
   - Tách riêng nhánh `pathname?.startsWith('/video-studio')` trong `providers.tsx` để không kích hoạt các provider của POS (`ShiftProvider`, `NotificationProvider`, `PodsCareProvider`) vốn tự gọi API `/api/v1/shifts/current`, `/api/v1/cashbook/balance`, `/api/v1/notifications`, `/api/v1/auth/me` và WebSocket `ws://localhost:8080`.
   - Đặt tiêu đề trang chuẩn `PodsCare · Cắt vấp Video` trong `layout.tsx` và `page.tsx`.

### 11.3. Năm (05) chi tiết trang trí / lặp lại đã lược bỏ sau khi nhìn ảnh chụp thật

| # | Chi tiết thừa đã lược bỏ | File thực hiện | Lý do lược bỏ |
| :- | :--- | :--- | :--- |
| **1** | **Thanh công cụ kiểm thử nổi thường trực trên đầu trang & dưới bước xử lý** | `apps/web/src/app/video-studio/page.tsx` | Làm bẩn mặt phẳng hiển thị chính và phá vỡ bố cục 1 cột tối giản; đã chuyển gọn toàn bộ bộ chọn trạng thái/kịch bản kiểm thử vào bên trong ngăn `"Cài đặt"`. |
| **2** | **Hàng nút `"Dùng video mẫu để thử"` khi đã chọn video** | `apps/web/src/components/video-studio/SimplePrepareState.tsx` | Khi `video !== null`, thẻ thông tin video đã có sẵn nút `"Đổi file video khác"`, việc giữ thêm hàng nút nạp video mẫu bên dưới gây trùng lặp chức năng. |
| **3** | **Hiệu ứng nhấp nháy `animate-pulse` và thanh tiến trình con thứ 2 bị trùng lặp trong từng bước xử lý** | `apps/web/src/components/video-studio/SimpleProcessingState.tsx` | Vi phạm nguyên tắc *"Không dùng hiệu ứng nhấp nháy liên tục"* và *"Không vẽ 2 thanh tiến trình chồng nhau"*; chỉ giữ duy nhất 1 thanh tiến trình tổng ở đầu thẻ kèm dòng trạng thái trực tiếp (`liveDetail`). |
| **4** | **Nút `"Cắt video khác"` bị lặp lần 2 ở cuối màn hình Kết quả** | `apps/web/src/components/video-studio/SimpleResultState.tsx` | Đã có nút `"Cắt video khác"` rõ ràng ngay trên thanh tóm tắt đầu màn hình Kết quả; xóa nút lặp ở chân trang để tránh phân tán hành động. |
| **5** | **Mốc thời gian bị in lặp 2 định dạng cạnh nhau (`0:38 – 0:43 (0:38.2 – 0:42.7 · 4.5 giây)`)** | `apps/web/src/components/video-studio/CutMapTimeline.tsx`<br>`apps/web/src/components/video-studio/SimpleResultState.tsx` | Hai mốc thời gian mang cùng một thông tin gây dài dòng và dễ tràn dòng trên màn hình hẹp; đã rút gọn thống nhất thành `0:38.2 – 0:42.7 (4.5 giây)`. |

