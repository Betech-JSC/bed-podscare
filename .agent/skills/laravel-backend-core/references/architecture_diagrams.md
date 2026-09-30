# Sơ Đồ Kiến Trúc Hệ Thống (Architecture & Lifecycle Diagrams)

Tài liệu trực quan hóa toàn bộ luồng xử lý dữ liệu, vòng đời Request, kiến trúc Macro Routing và mô hình State Machine dưới dạng sơ đồ ASCII và Sequence Diagrams.

---

## 🧭 1. Vòng đời Request & Phân Tầng Trách Nhiệm (Request Lifecycle)

```
[ Client Request ]
        │
        ▼
[ Routing Layer ] ─── (Route::module or api.php)
        │
        ▼
[ Middleware Pipeline ] ─── (Auth, Throttle, VerifySignature)
        │
        ▼
[ FormRequest Validation ] ─── (StoreOrderRequest / ServiceRequest)
        │
        ├── [FAIL] ──► Trả về HTTP 422 (JSON ApiResponse)
        ▼ [PASS]
[ Thin Controller ] ─── (RestApiController / CrudBackendController)
        │ (Ủy quyền toàn bộ xử lý nghiệp vụ)
        ▼
[ Fat Service / Workflow ] ─── (OrderWorkflowService / SepayService)
        │
        ├── [1. Concurrency Check] ──► So khớp `expected_updated_at` (409 Conflict)
        ├── [2. State Machine Rule] ──► Validate `ALLOWED_TRANSITIONS` (422)
        ├── [3. DB Transaction] ────► Khởi chạy DB::transaction()
        │         │
        │         ├── Eloquent Model ──► Thực thi Queries / lockForUpdate()
        │         ├── Audit Logger ────► Lưu vào OrderStatusLog
        │         └── Commit Transaction
        │
        └── [4. Side-effects] ───────► Dispatch Queue Jobs (Mail, Google Sheet, Slip)
        │
        ▼
[ Resource / ApiResponse ] ─── (OrderResource / ApiResponse Trait)
        │
        ▼
[ HTTP JSON Response (200 / 201) ]
```

---

## ⚡ 2. Cơ chế Tự động hóa Tuyến đường (Macro Routing Architecture)

Lệnh duy nhất:
```php
Route::module(OrderController::class);
```

Tự động ánh xạ 5 routes chuẩn CRUD trong hệ thống:

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 Route::module(Controller)             │
                  └───────────────────────────┬────────────────────────────┘
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              │                               │                               │
              ▼                               ▼                               ▼
    [GET] /orders                   [GET] /orders/form/{id?}        [POST] /orders/store/{id?}
    ├── Action: index()             ├── Action: form()              ├── Action: store()
    └── Name: orders.index          └── Name: orders.form           └── Name: orders.store
                                              │
                              ┌───────────────┴───────────────┐
                              │                               │
                              ▼                               ▼
                    [POST] /orders/destroy/{id}     [POST] /orders/restore/{id}
                    ├── Action: destroy()           ├── Action: restore()
                    └── Name: orders.destroy        └── Name: orders.restore
```

---

## 🔄 3. Mô hình State Machine & Vòng đời Đơn hàng

```
                  ┌──────────────┐
                  │     NEW      │
                  └──────┬───────┘
                         │
        ┌────────────────┼────────────────┐
        │                                 │
        ▼                                 ▼
┌──────────────┐                  ┌──────────────┐
│  CONFIRMED   │                  │  CANCELLED   │◄─── (Có thể hủy từ bất kỳ
└──────┬───────┘                  └──────────────┘      trạng thái trước COMPLETED)
       │                                  ▲
       ▼                                  │
┌──────────────┐                          │
│  PROCESSING  │──────────────────────────┘
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  COMPLETED   │  (Trạng thái kết thúc - Đóng băng không thể chuyển tiếp)
└──────────────┘
```

Mỗi bước chuyển trạng thái (Transition):
1. **Kiểm tra Optimistic Lock**: `$expected === $actual` ? Tiếp tục : Bắn `ConflictHttpException` (409).
2. **Kiểm tra Ma trận**: `$from -> $to` có trong `ALLOWED_TRANSITIONS` ? Tiếp tục : Bắn `DomainException` (422).
3. **Transaction**: `status = $to` + Lưu `OrderStatusLog` (IP, Agent, Admin, Reason).
4. **Trigger Queue Job**: `SendMail`, `CreateInvoice`.

---

## 💳 4. Luồng Xử lý Webhook Thanh toán An toàn (Idempotent Webhook Flow)

```
[ Webhook Provider (SePay) ]
              │
              │ POST /api/webhook/payment/sepay
              ▼
    [ Xác thực API-Key ] ─── [SAI] ──► HTTP 401 Unauthorized (Chặn đứng giả mạo)
              │
              │ [ĐÚNG]
              ▼
    [ DB::transaction() ]
              │
              ├── [1. Kiểm tra Idempotency]
              │         └── Transaction ID đã có trong DB?
              │               ├── [CÓ] ──► Trả về HTTP 200 (duplicate, dừng retry)
              │               └── [CHƯA] ─► Tiếp tục bước 2
              │
              ├── [2. Khóa dòng đơn hàng]
              │         └── Order::where('code', $code)->lockForUpdate()
              │
              ├── [3. So khớp số tiền]
              │         └── Số tiền nhận >= Giá trị đơn hàng?
              │               ├── [THIẾU] ──► Ghi log trạng thái UNDERPAID
              │               └── [ĐỦ] ─────► Ghi log trạng thái SUCCESS
              │
              └── [4. Chuyển trạng thái đơn]
                        └── Order -> PAID (CONFIRMED)
              │
              ▼ [Commit Transaction]
    [ Dispatch Async Jobs ] ──► Gửi mail hóa đơn cho khách / Báo tin Admin
              │
              ▼
    [ HTTP 200 OK Response ] (< 100ms)
```
