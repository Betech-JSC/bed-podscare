# Bảng Mã Lỗi HTTP & Application Error Codes

Tài liệu quy định chi tiết danh sách các mã trạng thái HTTP chuẩn (RFC 7231 / RFC 6585) và mã lỗi định danh nội bộ (Application Error Codes) dùng cho toàn bộ hệ thống API.

---

## 🌐 1. Bảng Mã Trạng thái HTTP (HTTP Status Codes)

| HTTP Status | Tên chuẩn | Ý nghĩa trong hệ thống | Khi nào sử dụng? |
| :---: | :--- | :--- | :--- |
| **`200`** | `OK` | Thành công | Trả về dữ liệu truy vấn (GET) hoặc cập nhật thành công (PUT/PATCH/POST). |
| **`201`** | `Created` | Tạo mới thành công | Trả về khi tạo mới thành công tài nguyên (POST /orders, POST /users). |
| **`204`** | `No Content` | Xóa thành công | Trả về sau khi xóa tài nguyên (DELETE). Thân phản hồi hoàn toàn rỗng. |
| **`400`** | `Bad Request` | Yêu cầu không hợp lệ | Tham số không đúng định dạng logic hoặc vi phạm nghiệp vụ cơ bản. |
| **`401`** | `Unauthorized` | Chưa xác thực | Thiếu Token, Token hết hạn, hoặc API Key webhook không chính xác. |
| **`403`** | `Forbidden` | Bị từ chối truy cập | Đã đăng nhập nhưng không có quyền hạn (Permission/Role) thực hiện action. |
| **`404`** | `Not Found` | Không tìm thấy | ID tài nguyên không tồn tại trong CSDL hoặc đường dẫn API sai. |
| **`409`** | `Conflict` | Xung đột đồng thời | **Optimistic Locking**: Bản ghi đã bị người khác sửa trước đó (`expected_updated_at` bị lệch). |
| **`422`** | `Unprocessable Content` | Lỗi Validation | Dữ liệu gửi lên không vượt qua FormRequest rules (thiếu trường, sai regex, email trùng). |
| **`429`** | `Too Many Requests` | Bị giới hạn tần suất | Rate limit vượt ngưỡng cho phép (Throttle API). |
| **`500`** | `Internal Server Error` | Lỗi hệ thống | Ngoại lệ chưa được bắt (Unhandled Exception), lỗi kết nối CSDL. |

---

## 📦 2. Cấu trúc Chuẩn JSON Payload

### 2.1. Phản hồi Thành công (Success Payload)
```json
{
  "success": true,
  "message": "Lấy thông tin chi tiết thành công",
  "data": {
    "id": 105,
    "code": "ORD-2026-00105",
    "total_amount": 2500000,
    "status": "CONFIRMED"
  }
}
```

### 2.2. Phản hồi Lỗi Validation (422 Unprocessable Entity)
```json
{
  "success": false,
  "message": "Dữ liệu gửi lên không hợp lệ.",
  "errors": {
    "phone": [
      "Số điện thoại không đúng định dạng số Việt Nam."
    ],
    "email": [
      "Địa chỉ email này đã được đăng ký trước đó."
    ]
  },
  "error_code": "VALIDATION_FAILED"
}
```

### 2.3. Phản hồi Lỗi Xung đột Đồng thời (409 Conflict)
```json
{
  "success": false,
  "message": "Đơn hàng vừa được cập nhật bởi một quản trị viên khác. Vui lòng tải lại trang để xem thông tin mới nhất.",
  "errors": null,
  "error_code": "ERR_CONCURRENT_CONFLICT"
}
```

---

## 🏷️ 3. Danh mục Mã Lỗi Ứng dụng (Application Error Codes)

| Application Error Code | HTTP Map | Mô tả chi tiết | Hướng dẫn xử lý cho Client |
| :--- | :---: | :--- | :--- |
| `ERR_AUTH_UNAUTHENTICATED` | 401 | Người dùng chưa đăng nhập hoặc token hết hạn | Chuyển hướng về màn hình đăng nhập |
| `ERR_AUTH_FORBIDDEN` | 403 | Không có quyền thực hiện thao tác | Hiển thị thông báo quyền hạn |
| `ERR_CONCURRENT_CONFLICT` | 409 | Xung đột sửa đổi dữ liệu đồng thời | Hiển thị pop-up yêu cầu reload dữ liệu mới |
| `ERR_INVALID_TRANSITION` | 422 | Bước chuyển trạng thái không được phép trong workflow | Báo lỗi trạng thái đơn không hợp lệ |
| `ERR_PAYMENT_UNDERPAID` | 422 | Số tiền chuyển khoản nhỏ hơn giá trị đơn hàng | Yêu cầu khách chuyển khoản phần chênh lệch |
| `ERR_ORDER_ALREADY_PAID` | 400 | Đơn hàng đã được thanh toán trước đó | Không ghi nhận thanh toán lần hai |
| `ERR_INSUFFICIENT_STOCK` | 422 | Sản phẩm trong kho đã hết | Báo người dùng chọn số lượng ít hơn |
| `ERR_INTERNAL_SERVER` | 500 | Lỗi server nội bộ | Yêu cầu thử lại sau hoặc liên hệ hỗ trợ |
