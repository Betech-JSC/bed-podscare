# Design: SaaS Subscription & SePay VietQR Billing

## Context

FIXO Repair OS là nền tảng quản lý chuỗi cửa hàng sửa chữa thiết bị di động đa chi nhánh. Hệ thống đang chuyển dịch sang mô hình B2B SaaS thu phí định kỳ (Standard 299.000đ/tháng, Pro 599.000đ/tháng). 
Trước đây, hệ thống chưa có cơ chế kiểm soát hạn mức tài nguyên (chi nhánh, nhân sự, đơn hàng sửa chữa theo tháng) và việc đăng ký cửa hàng mới chưa tự động cấp 14 ngày dùng thử. Đồng thời, toàn bộ việc thu phí gói phần mềm đang làm thủ công, chưa có cổng thanh toán tự động tập trung.

Tài liệu này thiết kế kiến trúc kỹ thuật toàn diện cho việc tích hợp SePay VietQR Platform, bộ chốt chặn Quota Guard phân tầng, và luồng trải nghiệm người dùng tự động 100% từ đăng ký, dùng thử, đến thanh toán và gia hạn dịch vụ.

Xem thêm: [proposal.md](file:///Users/macbookpro2020/bed-podscare/openspec/changes/saas-subscription-sepay/proposal.md) và [spec.md](file:///Users/macbookpro2020/bed-podscare/openspec/changes/saas-subscription-sepay/specs/saas-subscription-sepay/spec.md).

---

## Goals / Non-Goals

### Goals
- **Tự động hóa 100% vòng đời thuê bao SaaS**: Đăng ký -> Dùng thử 14 ngày -> Khởi tạo hóa đơn -> Thanh toán VietQR SePay -> Gia hạn tức thì theo thời gian thực (Zero-touch).
- **Bộ chốt chặn hạn mức Quota Guard tin cậy**: Ngăn chặn tình trạng lạm dụng tài nguyên ở tầng ứng dụng và cơ sở dữ liệu (`max_branches`, `max_users`, `max_orders_per_month`, `expires_at`).
- **An toàn giao dịch tài chính & Chống trùng lặp (Idempotency)**: Đảm bảo xử lý Webhook SePay an toàn tuyệt đối với Pessimistic Locking (`lockForUpdate`), bảng lưu vết `sepay_transactions`, chống lặp lệnh (Double-credit).
- **Trải nghiệm chủ tiệm mượt mà**: Giao diện `/subscription` trực quan theo chuẩn thiết kế Calm Jade / Warm Ivory, thanh tiến trình sử dụng hạn mức, modal VietQR tự động cập nhật khi thanh toán thành công qua Polling.

### Non-Goals
- **Không áp dụng SePay cho khách sửa máy lẻ**: Cổng SePay trong thiết kế này chỉ nhận tiền phí thuê bao SaaS chuyển vào tài khoản trung tâm của công ty chủ quản FIXO. Khách sửa chữa tại các chi nhánh tiếp tục thanh toán tiền mặt/chuyển khoản riêng của từng cửa hàng.
- **Không hỗ trợ trừ tiền tự động thẻ tín dụng (Auto-debit / Tokenization)**: Tại Việt Nam, mô hình VietQR chuyển khoản ngân hàng quét mã là tối ưu và phổ biến nhất; thanh toán theo từng chu kỳ gia hạn chủ động.

---

## Data Model & Kiến trúc Database

### 1. Bảng `subscription_plans`
Lưu trữ định nghĩa các gói cước và hạn mức tương ứng:
```sql
CREATE TABLE subscription_plans (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,       -- 'trial', 'standard', 'pro'
    name VARCHAR(100) NOT NULL,             -- 'Dùng thử 14 ngày', 'Tiêu chuẩn', 'Chuyên nghiệp'
    price_monthly DECIMAL(12, 0) NOT NULL DEFAULT 0,
    price_yearly DECIMAL(12, 0) NOT NULL DEFAULT 0,
    max_branches INT NOT NULL DEFAULT 1,     -- -1 nghĩa là Unlimited
    max_users INT NOT NULL DEFAULT 2,        -- -1 nghĩa là Unlimited
    max_orders_per_month INT NOT NULL DEFAULT 50, -- -1 nghĩa là Unlimited
    features JSON NULL,                     -- Danh sách tính năng bổ trợ dạng JSON
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);
```

Dữ liệu mặc định (Seeded):
- `trial`: Giá 0đ, `max_branches: 1`, `max_users: 2`, `max_orders_per_month: 50`.
- `standard`: Giá 299.000đ/tháng (3.289.000đ/năm), `max_branches: 2`, `max_users: 5`, `max_orders_per_month: 200`.
- `pro`: Giá 599.000đ/tháng (6.589.000đ/năm), `max_branches: -1`, `max_users: -1`, `max_orders_per_month: -1`.

### 2. Bảng `saas_invoices`
Lưu trữ các hóa đơn thu phí thuê bao gói SaaS của Tenant:
```sql
CREATE TABLE saas_invoices (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    plan_id BIGINT UNSIGNED NOT NULL,
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly', -- 'monthly' | 'yearly'
    amount DECIMAL(12, 0) NOT NULL,
    reference_code VARCHAR(50) NOT NULL UNIQUE,          -- 'FIXSUB{id}', dùng làm cú pháp CK
    status VARCHAR(20) NOT NULL DEFAULT 'pending',        -- 'pending', 'paid', 'cancelled', 'expired'
    payment_method VARCHAR(30) NOT NULL DEFAULT 'sepay_vietqr',
    paid_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,                           -- Thời hạn hiệu lực của mã QR (15-30 phút)
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)->onDelete('cascade'),
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
);
```

### 3. Bảng `sepay_transactions`
Lưu vết toàn bộ webhook từ SePay gửi tới để đối soát và chống trùng lặp:
```sql
CREATE TABLE sepay_transactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sepay_transaction_id VARCHAR(100) NOT NULL UNIQUE,   -- ID giao dịch phía SePay (chống lặp)
    saas_invoice_id BIGINT UNSIGNED NULL,
    reference_code VARCHAR(100) NULL,
    amount DECIMAL(12, 0) NOT NULL,
    accumulated DECIMAL(12, 0) NULL,
    account_number VARCHAR(50) NULL,
    gateway VARCHAR(50) NULL,
    transaction_date TIMESTAMP NULL,
    raw_payload JSON NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    FOREIGN KEY (saas_invoice_id) REFERENCES saas_invoices(id)->nullOnDelete()
);
```

### 4. Cập nhật bảng `tenants`
Bổ sung các trường quản lý thuê bao:
- `trial_ends_at TIMESTAMP NULL`
- `billing_cycle VARCHAR(20) NULL DEFAULT 'monthly'`
- `current_plan_id BIGINT UNSIGNED NULL` (khóa ngoại tới `subscription_plans`)

---

## Kiến trúc Backend (Laravel)

### 1. `QuotaService` (`app/Services/QuotaService.php`)
Chịu trách nhiệm tập trung toàn bộ logic kiểm tra và tính toán hạn mức:
- `checkBranchQuota(Tenant $tenant): void`: Đếm `$tenant->branches()->count()`. Nếu `>= $plan->max_branches` (và `max_branches != -1`), ném `QuotaExceededException("QUOTA_EXCEEDED_BRANCHES")`.
- `checkUserQuota(Tenant $tenant): void`: Đếm `$tenant->users()->count()`. Nếu `>= $plan->max_users` (và `max_users != -1`), ném `QuotaExceededException("QUOTA_EXCEEDED_USERS")`.
- `checkOrderQuota(Tenant $tenant): void`: Đếm số đơn trong tháng hiện tại:
  `$tenant->repairOrders()->whereBetween('created_at', [now()->startOfMonth(), now()->endOfMonth()])->count()`.
  Nếu `>= $plan->max_orders_per_month` (và `!= -1`), ném `QuotaExceededException("QUOTA_EXCEEDED_ORDERS")`.
- `checkSubscriptionActive(Tenant $tenant): void`: Nếu `$tenant->expires_at < now()`, ném `SubscriptionExpiredException("SUBSCRIPTION_EXPIRED")`.
- `getQuotaUsage(Tenant $tenant): array`: Trả về dữ liệu chi tiết dùng/hạn mức để API `/saas/current-plan` gửi lên Frontend.

### 2. Tích hợp Quota Guard vào các Controllers
- **Branch Creation**: Tại `BranchController::store`, gọi `QuotaService::checkSubscriptionActive($tenant)` và `QuotaService::checkBranchQuota($tenant)`.
- **User Creation**: Tại `UserController::store`, gọi `QuotaService::checkSubscriptionActive($tenant)` và `QuotaService::checkUserQuota($tenant)`.
- **Order Creation**: Tại `RepairOrderController::store`, gọi `QuotaService::checkSubscriptionActive($tenant)` và `QuotaService::checkOrderQuota($tenant)`.
- **Tự động cấp 14 ngày Trial**: Tại `TenantRegistrationController::register`, cập nhật:
  * `expires_at = now()->addDays(14)`
  * `trial_ends_at = now()->addDays(14)`
  * `status = 'active'` (chủ tiệm có thể trải nghiệm ngay)
  * `plan = 'trial'`

### 3. `SaasBillingController` (`app/Http/Controllers/Api/V1/SaasBillingController.php`)
- `POST /api/v1/saas/subscribe`:
  * Nhận `plan_id`, `billing_cycle`.
  * Tính tiền (`price_monthly` hoặc `price_yearly`).
  * Tạo `saas_invoices` với `reference_code = "FIXSUB" . $invoice->id`.
  * Sinh URL QuickLink SePay VietQR:
    `https://qr.sepay.vn/img?acc={ACC_NO}&bank={BANK}&amount={AMOUNT}&des={REF_CODE}&template=compact`
- `GET /api/v1/saas/invoices/{id}/status`: Trả về `{ status: 'pending'|'paid'|'expired', plan, expires_at }`.
- `GET /api/v1/saas/current-plan`: Trả về thông tin gói, ngày hết hạn và `getQuotaUsage()`.
- `GET /api/v1/saas/plans`: Danh sách các gói cước đang kích hoạt.

### 4. `SePayPlatformWebhookController` (`app/Http/Controllers/Api/V1/SePayPlatformWebhookController.php`)
Xử lý giao dịch ngân hàng theo chuẩn an toàn tuyệt đối:
```php
public function handle(Request $request): JsonResponse
{
    // 1. Xác thực Secret API Key SePay
    $apiKey = $request->header('SePay-Api-Key') ?? $request->bearerToken();
    if ($apiKey !== config('services.sepay.api_key')) {
        return response()->json(['error' => 'Unauthorized'], 401);
    }

    $payload = $request->all();
    $sepayTxnId = (string) ($payload['id'] ?? '');
    $content = $payload['content'] ?? '';
    $transferAmount = (float) ($payload['transferAmount'] ?? 0);

    return DB::transaction(function () use ($payload, $sepayTxnId, $content, $transferAmount) {
        // 2. Idempotency Check
        if (SepayTransaction::where('sepay_transaction_id', $sepayTxnId)->exists()) {
            return response()->json(['success' => true, 'message' => 'already_processed'], 200);
        }

        // 3. Tách mã hóa đơn từ nội dung chuyển khoản: FIXSUB{id}
        if (!preg_match('/FIXSUB(\d+)/i', $content, $matches)) {
            Log::warning("SePay webhook unrecognized reference: {$content}");
            return response()->json(['success' => false, 'message' => 'Unrecognized reference code'], 200);
        }

        $invoiceId = (int) $matches[1];
        $invoice = SaasInvoice::where('id', $invoiceId)->lockForUpdate()->first();

        if (!$invoice || $invoice->status === 'paid') {
            return response()->json(['success' => true, 'message' => 'Invoice not found or already paid'], 200);
        }

        // 4. Kiểm tra số tiền
        if ($transferAmount < (float) $invoice->amount) {
            Log::error("SePay webhook underpaid for invoice {$invoiceId}: expected {$invoice->amount}, got {$transferAmount}");
            return response()->json(['error' => 'Amount insufficient'], 422);
        }

        // 5. Cập nhật hóa đơn
        $invoice->update([
            'status' => 'paid',
            'paid_at' => now(),
        ]);

        // 6. Lưu vết transaction chống lặp
        SepayTransaction::create([
            'sepay_transaction_id' => $sepayTxnId,
            'saas_invoice_id' => $invoice->id,
            'reference_code' => $invoice->reference_code,
            'amount' => $transferAmount,
            'account_number' => $payload['accountNumber'] ?? null,
            'gateway' => $payload['gateway'] ?? null,
            'transaction_date' => $payload['transactionDate'] ?? now(),
            'raw_payload' => $payload,
        ]);

        // 7. Gia hạn Tenant
        $tenant = $invoice->tenant()->lockForUpdate()->first();
        $daysToAdd = ($invoice->billing_cycle === 'yearly') ? 365 : 30;

        $baseDate = ($tenant->expires_at && $tenant->expires_at->isFuture()) 
            ? $tenant->expires_at 
            : now();
        $newExpiresAt = $baseDate->copy()->addDays($daysToAdd);

        $tenant->update([
            'plan' => $invoice->plan->code,
            'current_plan_id' => $invoice->plan_id,
            'billing_cycle' => $invoice->billing_cycle,
            'expires_at' => $newExpiresAt,
            'status' => 'active',
        ]);

        return response()->json(['success' => true], 200);
    });
}
```

---

## Kiến trúc Frontend (Next.js / React)

### 1. Trang Quản lý Gói cước `/subscription`
- **Location**: `apps/web/app/subscription/page.tsx`
- **Components**:
  * `CurrentPlanCard`: Hiển thị gói hiện tại, thời hạn sử dụng, cảnh báo nếu sắp hết hạn (dưới 3 ngày) hoặc đã hết hạn.
  * `QuotaProgressSection`: 3 thanh tiến trình đẹp mắt (Chi nhánh, Nhân viên, Đơn hàng tháng) hiển thị rõ `đã dùng / tối đa` và phần trăm.
  * `PricingGrid`: Thẻ so sánh gói Standard và Pro (hỗ trợ chuyển đổi tab chu kỳ Tháng / Năm để nhận ưu đãi thanh toán năm).
  * `PaymentModal`:
    - Hiển thị QR VietQR do SePay sinh ra.
    - Hiển thị chi tiết số tài khoản, ngân hàng, số tiền, và cú pháp `FIXSUB{id}` với nút copy 1-click.
    - Đồng hồ đếm ngược hiệu lực mã (15 phút).
    - Hook polling tự động mỗi 2 giây tới `/api/v1/saas/invoices/{id}/status`. Khi trạng thái chuyển sang `paid`, modal hiển thị hiệu ứng thành công và tự động reload dữ liệu gói cước.

### 2. Tích hợp Đăng ký `/register`
- Nhận tham số query `?plan=standard` hoặc `?plan=pro`.
- Hiển thị khung tóm tắt "Gói bạn đang chọn: Standard (Dùng thử 14 ngày miễn phí trước khi thanh toán)".

### 3. Topbar Plan Badge & Sidebar Link
- Hiển thị trên thanh Header: Huy hiệu nhỏ hiển thị loại gói:
  * `[Trial - Còn 12 ngày]` (màu vàng hổ phách)
  * `[Standard]` (màu Calm Jade)
  * `[Pro]` (màu Calm Jade đậm)
  * `[Hết hạn]` (màu đỏ Rose kèm nút "Gia hạn ngay")
- Thêm icon "Gói dịch vụ" vào Sidebar dẫn trực tiếp tới `/subscription`.

---

## Decisions & Alternatives

| Quyết định kỹ thuật | Phương án lựa chọn | Phương án thay thế đã cân nhắc | Lý do lựa chọn |
| :--- | :--- | :--- | :--- |
| **Cổng thanh toán** | SePay VietQR Platform | Cổng thẻ (VNPAY, PayOS, Stripe) | SePay hỗ trợ nhận biến động số dư VietQR tự động qua tài khoản ngân hàng chính chủ của công ty, phí rẻ, quét app ngân hàng tiện lợi nhất tại VN. |
| **Cú pháp đối soát** | `FIXSUB{invoice_id}` | Tên tenant hoặc mã ngẫu nhiên | Tiền tố ngắn gọn, duy nhất, regex bóc tách chính xác 100%, không bị ngân hàng cắt bớt ký tự. |
| **Kiểm soát đồng thời** | Database `lockForUpdate` | Redis Distributed Lock | Dự án sử dụng MySQL InnoDB; transaction lock trực tiếp trên hàng hóa đơn và tenant đảm bảo tính nhất quán tuyệt đối mà không phụ thuộc thêm hạ tầng Redis. |
| **Cơ chế chống lặp** | Unique key `sepay_transaction_id` | Cache check ngắn hạn | Unique constraint ở DB lưu vĩnh viễn đảm bảo webhook dù retry sau nhiều giờ cũng không bao giờ bị ghi nhận lần 2. |
| **Thời điểm gia hạn** | Cộng dồn từ `expires_at` hiện tại | Luôn tính từ `now()` | Khách thanh toán trước khi hết hạn không bị mất các ngày còn thừa của chu kỳ trước. |

---

## Risks / Trade-offs & Mitigations

- **[Risk: Khách hàng chuyển khoản thiếu tiền hoặc sai cú pháp]**
  * *Mitigation*: Webhook ghi log cảnh báo chi tiết, lưu vào `sepay_transactions` ở trạng thái không khớp, không kích hoạt gói tự động. Tạo trang hỗ trợ hiển thị hotline/zalo để admin kiểm tra thủ công.
- **[Risk: Webhook bị trễ do mạng ngân hàng]**
  * *Mitigation*: Modal thanh toán có nút "Tôi đã chuyển khoản - Kiểm tra ngay", ngoài ra hệ thống có scheduler định kỳ quét giao dịch SePay nếu webhook bị drop.
- **[Risk: Tenant hết hạn làm gián đoạn vận hành cửa hàng]**
  * *Mitigation*: Cho phép xem dữ liệu chỉ đọc (Read-only) khi hết hạn để không mất dữ liệu khách hàng; gửi thông báo nhắc trước khi hết hạn 3 ngày và 1 ngày.

---

## Migration Plan & Rollback Strategy

1. **Deployment**:
   - Chạy migration tạo 3 bảng mới và cập nhật `tenants`.
   - Chạy Seeder chèn 3 gói cước (`trial`, `standard`, `pro`).
   - Cập nhật các tenants hiện có trong hệ thống gán `current_plan_id` tương ứng với `plan` hiện tại.
2. **Rollback**:
   - Các migration thiết kế phương thức `down()` an toàn: drop foreign keys trước, drop bảng `sepay_transactions`, `saas_invoices`, `subscription_plans`.
