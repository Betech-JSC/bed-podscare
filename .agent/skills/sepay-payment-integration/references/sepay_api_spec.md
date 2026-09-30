# SePay API & Webhook Technical Specification

Tài liệu đặc tả kỹ thuật chi tiết về cơ chế tích hợp cổng thanh toán tự động qua SePay (Cổng thanh toán quét mã QR chuyển khoản ngân hàng Việt Nam).

---

## 1. Tổng quan cơ chế hoạt động

Cổng thanh toán SePay hoạt động theo mô hình **Bank Hub & Webhook**:
1. Khách hàng thực hiện thanh toán bằng cách quét mã **VietQR** hoặc nhập thông tin chuyển khoản (Số tài khoản, Ngân hàng, Số tiền, Nội dung chuyển khoản duy nhất).
2. Khi tiền về tài khoản ngân hàng của Merchant, hệ thống SePay (thông qua liên kết ngân hàng hoặc ứng dụng thông báo biến động số dư) phát hiện giao dịch thành công.
3. SePay ngay lập tức gửi một HTTP POST request (**Webhook**) tới URL webhook đã được cấu hình trên hệ thống của bạn kèm theo toàn bộ dữ liệu giao dịch.
4. Server của bạn xác thực chữ ký (API Key), phân tích nội dung chuyển khoản để nhận diện đơn hàng, cập nhật trạng thái thanh toán và trả về HTTP 200 OK.

---

## 2. Xác thực Webhook (Authentication)

SePay sử dụng cơ chế xác thực thông qua HTTP Header `Authorization`.

### Header Format:
```http
Authorization: Apikey {SEPAY_WEBHOOK_SECRET}
```

*Trong đó:*
- `SEPAY_WEBHOOK_SECRET`: Là chuỗi bí mật (API Token/Secret) do bạn thiết lập trong trang quản trị SePay (`Cấu hình Webhook` -> `API Key/Secret`).

### Quy tắc bảo mật:
1. **Kiểm tra bắt buộc**: Mọi request đến endpoint Webhook nếu thiếu header `Authorization` hoặc giá trị không khớp chính xác với `SEPAY_WEBHOOK_SECRET` **BẮT BUỘC** phải bị từ chối với mã HTTP `401 Unauthorized`.
2. **Timing-safe comparison**: Nên sử dụng hàm so sánh an toàn theo thời gian (ví dụ `hash_equals()` trong PHP) để chống lại các cuộc tấn công vét cạn theo thời gian (Timing attacks).
3. **Môi trường cục bộ (Local Dev)**: Chỉ được phép bỏ qua xác thực khi đang ở chế độ giả lập test nội bộ (`APP_ENV=local` hoặc cờ `is_dev_simulation`).

---

## 3. Cấu trúc Payload Webhook từ SePay

Khi có giao dịch mới, SePay sẽ gửi một JSON payload với phương thức `POST` có định dạng như sau:

```json
{
  "id": 1284752,
  "gateway": "MBBank",
  "transactionDate": "2026-09-30 11:20:15",
  "accountNumber": "0388888888",
  "subAccount": null,
  "transferType": "in",
  "transferAmount": 2500000,
  "accumulated": 15400000,
  "code": null,
  "content": "FKC01024 Nguyen Van A chuyen hoc phi",
  "referenceCode": "FKC01024",
  "description": "Nhan tien tu MBBank den 0388888888 - FKC01024",
  "bankBrandName": "MBBank"
}
```

### Chi tiết các trường dữ liệu:

| Trường (Field) | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `id` | Integer / String | ID giao dịch duy nhất trên hệ thống SePay. **Bắt buộc dùng trường này để làm Idempotency Key**. |
| `gateway` | String | Tên cổng hoặc ngân hàng phát hiện giao dịch (MB, ACB, VCB, TPB...). |
| `transactionDate` | String | Thời gian thực hiện giao dịch theo định dạng `YYYY-MM-DD HH:mm:ss`. |
| `accountNumber` | String | Số tài khoản ngân hàng thụ hưởng của Merchant. |
| `subAccount` | String / Null | Tài khoản phụ (nếu có đăng ký dịch vụ tài khoản ảo/sub-account). |
| `transferType` | String | Loại giao dịch: `"in"` (tiền vào) hoặc `"out"` (tiền ra). **Chỉ xử lý khi `transferType === "in"`**. |
| `transferAmount` | Integer / Float | Số tiền thực tế được chuyển vào tài khoản (đơn vị: VNĐ). |
| `accumulated` | Integer / Float | Số dư lũy kế tài khoản sau biến động (nếu ngân hàng hỗ trợ). |
| `code` | String / Null | Mã tham chiếu của hệ thống ngân hàng (nếu có). |
| `content` | String | **Nội dung chuyển khoản thực tế** mà khách hàng đã nhập khi chuyển khoản. |
| `referenceCode` | String / Null | Mã đơn hàng do SePay tự động bóc tách từ `content` (nếu khớp cấu hình nhận diện của SePay). |
| `description` | String | Tin nhắn thông báo biến động số dư nguyên bản của ngân hàng. |

---

## 4. Quy ước phản hồi HTTP từ Webhook Server

Server của bạn cần phản hồi nhanh chóng (dưới **3 giây**) với các mã HTTP tiêu chuẩn:

| HTTP Status | Điều kiện | Hành vi của SePay Gateway |
| :--- | :--- | :--- |
| **`200 OK`** | Xử lý thành công **HOẶC** giao dịch hợp lệ nhưng không tìm thấy đơn / đã xử lý trước đó. | SePay ghi nhận thành công, **không retry**. |
| **`401 Unauthorized`** | Sai `SEPAY_WEBHOOK_SECRET` hoặc thiếu header Authorization. | SePay đánh dấu thất bại bảo mật, có thể dừng webhook. |
| **`500 Internal Error`** | Server lỗi DB tạm thời, mất kết nối mạng. | SePay sẽ kích hoạt cơ chế retry tự động. |

> ⚠️ **LƯU Ý CỰC KỲ QUAN TRỌNG:**  
> Nếu nội dung chuyển khoản không tìm thấy đơn hàng tương ứng (ví dụ khách ghi sai cú pháp), server **VẪN NÊN TRẢ VỀ HTTP 200** kèm log `{"success": false, "message": "Order not found"}`. Nếu trả về `404` hoặc `500`, SePay sẽ hiểu là server bị lỗi và tiếp tục gửi lại (retry) nhiều lần, gây nghẽn log và quá tải server.

---

## 5. Chính sách Retry của SePay

Trong trường hợp server của bạn không phản hồi kịp thời (timeout) hoặc trả về mã lỗi `5xx`:
- SePay sẽ gửi lại webhook theo thuật toán dãn cách tăng dần (Exponential backoff): sau 1 phút, 5 phút, 15 phút, 30 phút, 1 giờ...
- Tối đa retry: Thường từ 5 đến 10 lần tùy theo gói dịch vụ.
- **Hệ quả**: Bắt buộc hệ thống của bạn phải có cơ chế **Idempotency** để không xử lý cộng tiền hoặc kích hoạt dịch vụ 2 lần khi nhận request retry.
