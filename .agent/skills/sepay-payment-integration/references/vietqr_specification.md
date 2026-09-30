# Đặc Tả Chuẩn Mã VietQR & Quy Chuẩn Nội Dung Chuyển Khoản

Tài liệu hướng dẫn chi tiết cách khởi tạo mã VietQR động theo tiêu chuẩn quốc gia NAPAS 247 và quy ước sinh mã đối soát tự động.

---

## 1. Cấu trúc URL Tạo Ảnh VietQR Động

Hệ thống VietQR cho phép tạo ảnh mã QR thanh toán động thông qua giao thức HTTP GET trực tiếp tới dịch vụ hình ảnh `img.vietqr.io` mà không cần gọi API sinh token phức tạp.

### Cú pháp chuẩn:
```text
https://img.vietqr.io/image/{bankCode}-{accountNumber}-{template}.jpg?amount={amount}&addInfo={referenceCode}&accountName={accountName}
```

### Các thành phần trong URL:
1. `{bankCode}`: Mã viết tắt chuẩn của ngân hàng (xem bảng mapping bên dưới, ví dụ: `MB`, `ACB`, `VCB`, `TCB`).
2. `{accountNumber}`: Số tài khoản ngân hàng thụ hưởng (chỉ gồm các chữ số).
3. `{template}`: Giao diện hiển thị của ảnh QR (xem mục 3).
4. `amount`: Số tiền thanh toán (số nguyên dương, đơn vị VNĐ).
5. `addInfo`: **Nội dung chuyển khoản (Reference Code)**. Cần được mã hóa URL (`urlencode`).
6. `accountName`: Tên chủ tài khoản ngân hàng (viết HOA không dấu, ví dụ: `NGUYEN VAN A`). Cần được mã hóa URL (`urlencode`).

---

## 2. Bảng Tra Cứu Mã Ngân Hàng (Bank Codes)

| Mã viết tắt (`bankCode`) | Tên thương mại ngân hàng | Tên đầy đủ |
| :--- | :--- | :--- |
| **`MB`** | MB Bank | Ngân hàng TMCP Quân đội |
| **`ACB`** | ACB | Ngân hàng TMCP Á Châu |
| **`VCB`** | Vietcombank | Ngân hàng TMCP Ngoại thương Việt Nam |
| **`TCB`** | Techcombank | Ngân hàng TMCP Kỹ thương Việt Nam |
| **`BIDV`** | BIDV | Ngân hàng TMCP Đầu tư và Phát triển Việt Nam |
| **`VPB`** | VPBank | Ngân hàng TMCP Việt Nam Thịnh Vượng |
| **`TPB`** | TPBank | Ngân hàng TMCP Tiên Phong |
| **`STB`** | Sacombank | Ngân hàng TMCP Sài Gòn Thương Tín |
| **`HDB`** | HDBank | Ngân hàng TMCP Phát triển TP.HCM |
| **`MSB`** | MSB | Ngân hàng TMCP Hàng Hải |
| **`VIB`** | VIB | Ngân hàng TMCP Quốc tế Việt Nam |
| **`SHB`** | SHB | Ngân hàng TMCP Sài Gòn – Hà Nội |
| **`OCB`** | OCB | Ngân hàng TMCP Phương Đông |
| **`LPB`** | LPBank | Ngân hàng TMCP Bưu Điện Liên Việt |
| **`CAKE`** | CAKE | Ngân hàng số CAKE by VPBank |

---

## 3. Các Loại Template VietQR Hỗ Trợ

| Template | Đặc điểm hiển thị | Mục đích sử dụng |
| :--- | :--- | :--- |
| **`compact`** | Khung hiển thị nhỏ gọn gồm mã QR kèm logo ngân hàng và thông tin tài khoản bên dưới. | Khuyến nghị sử dụng trên giao diện Web/Mobile Checkout. |
| **`compact2`** | Thiết kế bo tròn hiện đại, hiển thị logo NAPAS và ngân hàng thụ hưởng nổi bật. | Phù hợp cho Modal thanh toán trên giao diện người dùng. |
| **`qr_only`** | Chỉ chứa đúng hình ảnh mã QR (không kèm khung, viền hay văn bản phụ). | Thích hợp nhúng vào hóa đơn PDF hoặc khi tự thiết kế layout riêng. |
| **`print`** | Bản in kích thước lớn chất lượng cao, định dạng A4/A5 để đặt tại quầy thu ngân. | Dành cho cửa hàng bán lẻ hoặc sự kiện offline. |

---

## 4. Tiêu Chuẩn Sinh Mã Đối Soát (Reference Code Conventions)

Để SePay và hệ thống của bạn nhận diện chính xác 100% nội dung chuyển khoản, mã đối soát phải tuân thủ nghiêm ngặt các quy tắc:

### Quy tắc định dạng:
1. **Chỉ chứa chữ in hoa (A-Z) và chữ số (0-9)**. Tuyệt đối không dùng dấu cách, ký tự đặc biệt (`-`, `_`, `#`, `@`) hoặc tiếng Việt có dấu.
2. **Cấu trúc khuyến nghị**:
   - `[PREFIX] + [LOẠI_GIAO_DỊCH] + [ID_PADDED]`
   - Ví dụ:
     - Đơn nạp ví: `FK` + `00025` + `89` (Prefix + user_id padding 5 số + 2 số ngẫu nhiên) $\rightarrow$ `FK0002589`
     - Đơn khóa học: `FK` + `C` + `01024` (Prefix + C + contact_id padding 5 số) $\rightarrow$ `FKC01024`
     - Đơn bán hàng: `ORDER` + `100452` $\rightarrow$ `ORDER100452`
3. **Độ dài tối ưu**: Từ 6 đến 12 ký tự để khách hàng dễ kiểm tra và gõ tay nếu không thể quét QR.
4. **Tránh nhầm lẫn ký tự**: Nếu có tạo mã ngẫu nhiên, loại bỏ các ký tự dễ nhầm lẫn như `0` (số 0) và `O` (chữ O), `1` (số 1) và `I` (chữ I).

### Biểu thức Regex trích xuất an toàn:
Trong webhook controller:
```php
// Trích xuất mã dạng: FKC12345, QUAC12345
$regex = '/(' . preg_quote($prefix, '/') . '|FK|QUA)C(\d+)/i';

// Trích xuất mã nạp điểm dạng: FK12345
$regexPoint = '/' . preg_quote($prefix, '/') . '(\d+)/i';
```
