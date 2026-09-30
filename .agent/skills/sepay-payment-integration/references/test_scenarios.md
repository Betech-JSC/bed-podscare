# Kịch Bản Kiểm Thử Thanh Toán SePay (Test Scenarios & QA Checklist)

Tài liệu cung cấp 5 kịch bản kiểm thử trọng yếu (Test Cases) thực tế từ hệ thống, phục vụ việc viết automated test (PHPUnit/Pest) và kiểm thử thủ công qua cURL/Postman.

---

## 1. Danh mục 5 Kịch bản Kiểm thử Cốt lõi

| Kịch bản | Tên kịch bản | Kỳ vọng đầu ra | Mức độ rủi ro |
| :---: | :--- | :--- | :---: |
| **TC-01** | Happy Path (Thanh toán đủ & đúng cú pháp) | Đơn chuyển sang `PAID_FULL`/`CONFIRMED`, kích hoạt dịch vụ, trả về 200 OK. | Cao |
| **TC-02** | Idempotency Safeguard (Webhook gửi lặp lại) | Bắn webhook 3 lần liên tiếp, hệ thống chỉ xử lý 1 lần duy nhất, không nhân đôi số dư/sĩ số. | Nghiêm trọng |
| **TC-03** | Underpaid / Partial (Chuyển thiếu tiền) | Ghi nhận số tiền đã trả và công nợ, đánh dấu `UNDERPAID`, không tự ý confirm đơn hàng. | Cao |
| **TC-04** | Security Guard (Sai hoặc thiếu API Token) | Trả về HTTP `401 Unauthorized` ngay lập tức, không chạm vào database. | Nghiêm trọng |
| **TC-05** | Expired QR / Late Payment (Thanh toán trễ) | Mã QR đã hết hạn, giao dịch chuyển sang `EXPIRED`, ghi log cảnh báo admin xử lý. | Trung bình |

---

## 2. Chi tiết các Kịch bản & Mẫu Dữ liệu Kiểm Thử

### TC-01: Happy Path (Thanh toán đủ tiền)
- **Mục tiêu**: Xác nhận luồng xử lý chuẩn khi khách quét mã QR và chuyển khoản thành công.
- **Payload mẫu**:
  ```json
  {
    "id": 100001,
    "gateway": "MBBank",
    "transactionDate": "2026-09-30 14:00:00",
    "accountNumber": "0388888888",
    "transferType": "in",
    "transferAmount": 2500000,
    "content": "FKC01024 thanh toan hoc phi",
    "referenceCode": "FKC01024"
  }
  ```
- **Header**: `Authorization: Apikey test_secret_key`
- **Kết quả mong đợi**:
  - HTTP Status: `200 OK`.
  - Body: `{"success": true, "status": "PAID_FULL"}`.
  - Database: Đơn hàng `#1024` chuyển sang trạng thái đã thanh toán đủ, tạo phiếu xác nhận, tăng sĩ số lớp +1.

---

### TC-02: Idempotency (Chống trùng lặp khi SePay retry)
- **Mục tiêu**: Đảm bảo an toàn tuyệt đối khi SePay gửi lại request 2 hoặc 3 lần do mạng chập chờn.
- **Cách thực hiện**:
  1. Gửi request TC-01 lần đầu $\rightarrow$ Nhận `200 OK`.
  2. Gửi tiếp request thứ 2 với **cùng `id` = 100001** $\rightarrow$ Hệ thống nhận diện `id` đã có.
  3. Gửi tiếp request thứ 3 với **cùng `id` = 100001**.
- **Kết quả mong đợi**:
  - Cả 3 lần đều trả về `200 OK`.
  - Lần 2 và 3 trả về message: `"Giao dịch đã được đối soát trước đó (Idempotent)"`.
  - Sĩ số lớp hoặc số dư ví tài khoản **KHÔNG BỊ TĂNG THÊM**.
  - Không sinh ra phiếu xác nhận thứ 2.

---

### TC-03: Underpaid (Chuyển thiếu tiền)
- **Mục tiêu**: Ngăn chặn người dùng trục lợi bằng cách chuyển 10.000đ - 50.000đ để tự động kích hoạt dịch vụ có giá hàng triệu đồng.
- **Payload mẫu**:
  ```json
  {
    "id": 100003,
    "transferAmount": 50000,
    "content": "FKC01024 chuyen tien thieu",
    "referenceCode": "FKC01024"
  }
  ```
- **Kết quả mong đợi**:
  - HTTP Status: `200 OK` (để gateway không retry).
  - Body: `{"success": false, "status": "UNDERPAID", "message": "Số tiền chuyển nhỏ hơn mức cọc tối thiểu."}`.
  - Database: Đơn hàng vẫn giữ trạng thái `NEW` hoặc `PENDING`, **tuyệt đối không chuyển sang `CONFIRMED`**.
  - Cột `paid_amount = 50000`, `debt_amount = 2450000`.

---

### TC-04: Security Guard (Xác thực chữ ký API Key)
- **Mục tiêu**: Kiểm tra hệ thống có từ chối các request giả mạo từ bên ngoài không.
- **Kịch bản a (Thiếu Header)**:
  - Gửi request không có header `Authorization`.
  - **Kết quả**: HTTP `401 Unauthorized`.
- **Kịch bản b (Sai API Key)**:
  - Header: `Authorization: Apikey sai_secret_key_123`
  - **Kết quả**: HTTP `401 Unauthorized`.

---

### TC-05: Expired QR (Thanh toán khi QR đã hết hạn)
- **Mục tiêu**: Kiểm tra xử lý đối với đơn hàng quá hạn (ví dụ quá 15 phút).
- **Kết quả mong đợi**:
  - Trạng thái giao dịch pending chuyển sang `EXPIRED`.
  - Giao diện polling hiển thị thông báo "Mã QR đã hết hạn, vui lòng tạo mã mới".

---

## 3. Lệnh cURL để Kiểm thử Nhanh (Manual Testing)

### Test Webhook Hợp lệ (Happy Path):
```bash
curl -X POST http://localhost:8000/api/sepay/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey your_sepay_webhook_secret" \
  -d '{
    "id": 999901,
    "gateway": "MBBank",
    "transactionDate": "2026-09-30 15:30:00",
    "accountNumber": "0388888888",
    "transferType": "in",
    "transferAmount": 2500000,
    "content": "FKC01024 chuyen tien hoc phi",
    "referenceCode": "FKC01024"
  }'
```

### Test Webhook Sai Token (Kỳ vọng 401):
```bash
curl -X POST http://localhost:8000/api/sepay/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey INVALID_TOKEN" \
  -d '{"id": 999902}'
```
