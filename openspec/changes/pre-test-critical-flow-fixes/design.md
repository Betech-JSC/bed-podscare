# Design: Pre-Test Critical Flow Technical Architecture

## Context

See `proposal.md` for motivation and operational background. Ahead of the scheduled comprehensive testing session, six operational and architectural friction points must be resolved across the frontend applications, the shared API client, and the backend service layer.

Current architectural constraints:
1. **Next.js Layout Wrapper**: In `apps/web/app/print/[id]/page.tsx`, the receipt DOM is nested inside global providers and layout containers. Simple selector `body > *:not(#printSheetWrapper)` fails because `#printSheetWrapper` is not an immediate child of `body`.
2. **Role Hierarchy in UI**: `AppSidebar.tsx` in `packages/ui` manages navigation through an explicit `rolePermissions` whitelist. Routes outside this whitelist are stripped from the DOM.
3. **Database Seeding**: `CustomerAndOrderSeeder.php` currently provisions only 1 single order at Branch Q1, preventing testing of cross-branch workflows, approval queues, tech queues, and payment transitions.
4. **State Machine Integrity**: `OrderWorkflowService` enforces domain rules (such as requiring a passed QC inspection before transitioning to `ready_for_return`). However, `apps/web/app/repairs/page.tsx` swallows API rejection errors in its optimistic update handler without reverting in-memory state.
5. **URL Joining in API Client**: In `packages/api-client/src/http-client.ts`, concatenating a `baseURL` containing `/api/v1` with an endpoint also containing `/api/v1` leads to malformed `/api/v1/api/v1` routes.

## Goals / Non-Goals

**Goals:**
- Provide a robust, clean A4 printout containing both Store Copy and Customer Copy on exactly 1 physical page.
- Expose the technician queue (`/tech`) in `AppSidebar` with role-based visibility for `admin` and `tech`.
- Seed a deterministic matrix of 6 repair orders covering all 6 core lifecycle states across Branch Q1 and Branch Q3.
- Allow cashiers/testers to select pending orders and simulate payment success directly from `/payments`, updating order state and generating completed receipts.
- Implement proactive URL normalization in `HttpClient` to prevent duplicate `/api/v1` segments.
- Implement atomic optimistic rollback on the repairs page when FSM transitions return HTTP 422, and normalize status aliases in `OrderController`.

**Non-Goals:**
- **No Quick Login / Role Switcher**: Form-based authentication with standard username and password remains unchanged as requested by the user.
- **No Realtime SePay Webhooks**: External bank webhook listeners, socket reconnection logic, and automated SePay API polling are omitted from this phase in favor of the manual payment simulation trigger.
- **No Database Schema Alterations**: No migrations, column drops, or table structure alterations are permitted; existing database tables remain 100% intact.

## Decisions

### 1. CSS Print Isolation Architecture

**Decision**: Re-architect `@media print` in `globals.css` and `print/[id]/page.tsx` using CSS visibility isolation and explicit page dimension bounding:
- In `globals.css`:
  ```css
  @media print {
    @page {
      size: A4 portrait;
      margin: 6mm 8mm;
    }
    html, body {
      background: #ffffff !important;
      color: #111111 !important;
      margin: 0 !important;
      padding: 0 !important;
      height: 100% !important;
      overflow: visible !important;
    }
    /* Hide all layout elements outside the printable sheet */
    body * {
      visibility: hidden;
    }
    #printSheetWrapper, #printSheetWrapper * {
      visibility: visible;
    }
    #printSheetWrapper {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      margin: 0 !important;
      padding: 0 !important;
    }
    .print-receipt {
      box-sizing: border-box;
      max-height: 132mm;
      padding: 4mm 6mm !important;
      margin-bottom: 2mm !important;
      page-break-inside: avoid;
      break-inside: avoid;
      overflow: hidden;
    }
    .print-receipt:first-child {
      border-bottom: 1px dashed #777777 !important;
      padding-bottom: 4mm !important;
    }
  }
  ```
- In `apps/web/app/print/[id]/page.tsx`:
  - Compact typography, table padding, and signature blocks so total height of each slip remains within 125-130mm.
  - Set image dimensions to fixed height (max 40px) to prevent layout inflation.

*Alternatives considered*:
- Using `window.open` with a blank popup document: Discarded because modern browsers often block popups and asset styles (Tailwind/fonts) would need to be reloaded.

### 2. Sidebar Navigation Configuration

**Decision**:
- Add navigation item definition in `packages/ui/src/organisms/AppSidebar.tsx`:
  ```ts
  { id: 'tech', label: 'Bàn làm việc KTV', icon: 'tools' (hoặc 'repairs') }
  ```
  in `operationsNav`.
- Update `rolePermissions`:
  - `admin`: Add `'tech'`.
  - `tech`: Ensure `'tech'` is included along with `'repairs'`, `'devices'`, `'timeline'`, `'qc'`.
- Ensure `onNavigate('tech')` navigates to `/tech`.

*Alternatives considered*:
- Putting `tech` only under Workspace: Discarded because technician queue management aligns with operational tasks alongside QC and Inventory.

### 3. Seeder Matrix (6 Orders, 6 States, 2 Branches)

**Decision**: Expand `CustomerAndOrderSeeder.php` to seed 6 representative orders:

| Order Code | Status | Branch | Customer | Device Model | Assigned Tech | QC Inspector | Total Price | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **PC26-00981** | `in_repair` | Q1 | Nguyễn Minh Anh | AirPods Pro 2 | KTV Q1 (Trần Kỹ Thuật) | QC Inspector | 450,000 ₫ | Đang xử lý lỗi rè chống ồn ANC |
| **PC26-00982** | `waiting_approval` | Q1 | Lê Hoàng Long | AirPods 3 | Chưa gán | None | 350,000 ₫ | Chờ khách duyệt báo giá pin |
| **PC26-00983** | `waiting_tech` | Q1 | Phạm Thu Hà | AirPods Pro 1 | Chưa gán | None | 600,000 ₫ | Đã duyệt báo giá, chờ KTV tiếp nhận |
| **PC26-00984** | `waiting_qc` | Q3 | Hoàng Nhật Nam | AirPods Pro 2 | KTV Q3 | QC Inspector | 550,000 ₫ | Đã sửa xong, chờ QC kiểm định |
| **PC26-00985** | `ready_for_return`| Q3 | Đỗ Bích Phương | AirPods Max | KTV Q3 | QC Inspector | 1,200,000 ₫ | Đã pass QC, chờ thu tiền & trả máy |
| **PC26-00986** | `completed` | Q3 | Vũ Anh Tuấn | AirPods 2 | KTV Q3 | QC Inspector | 250,000 ₫ | Đã thanh toán & hoàn tất quy trình |

Each order includes corresponding entries in:
- `intake_checklists`: Checklist 9 tiêu chí.
- `repair_quotes`: Báo giá linh kiện & dịch vụ.
- `qc_inspections`: Cho các đơn `ready_for_return` và `completed` với kết quả `pass` để thỏa mãn điều kiện FSM.
- `payments`: Cho đơn `completed`.

*Alternatives considered*:
- Random factory seeding: Discarded because deterministic codes (`PC26-00981` through `PC26-00986`) make manual and automated testing predictable.

### 4. Payment Simulation Endpoint & Frontend Trigger

**Decision**:
- In `apps/web/app/payments/page.tsx`:
  - Fetch list of pending orders using `repairService.getRepairs({ per_page: 50 })`.
  - Filter orders eligible for payment (`ready_for_return`, `waiting_pickup`, or orders with outstanding balance).
  - Provide an order selection `<Select>` in the payment modal. Selecting an order auto-fills `qrOrderCode` and `qrAmount` (from `order.price`).
  - Add a dedicated action button: **"Giả lập thanh toán thành công"** (Simulate Payment Success).
  - When clicked:
    1. Create payment record via `paymentService.createPayment({ repair_order_id, amount, payment_method: 'cash' | 'bank_transfer', notes: 'Giả lập thanh toán tại quầy' })`.
    2. Advance order status to `completed` via `repairService.transition(orderId, { transition: 'completed' })`.
    3. Close modal, refresh transaction table via `loadPayments()`, and display success toast.

*Alternatives considered*:
- Creating a separate backend-only simulation route: Discarded because using the existing `paymentService.createPayment` and `repairService.transition` directly from the UI exercises the real API contracts and validates both endpoints together.

### 5. HttpClient URL Normalizer

**Decision**: In `packages/api-client/src/http-client.ts`, update `request()` URL building:
```ts
private buildUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  const cleanBase = this.baseURL.replace(/\/+$/, '');
  let cleanEndpoint = endpoint.replace(/^\/+/, '');

  // Strip duplicate /api/v1 if both base and endpoint declare it
  if (cleanBase.endsWith('/api/v1') && cleanEndpoint.startsWith('api/v1/')) {
    cleanEndpoint = cleanEndpoint.substring('api/v1/'.length);
  }

  return `${cleanBase}/${cleanEndpoint}`;
}
```
In `apps/web/.env.example`:
Standardize `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1`.

*Alternatives considered*:
- Hardcoding `cleanEndpoint = cleanEndpoint.replace(/^api\/v1\//, '')` everywhere: The conditional check `cleanBase.endsWith('/api/v1')` is safer because it preserves endpoints if the base URL does not have `/api/v1`.

### 6. Optimistic State Rollback & FSM Normalizer

**Decision**:
- In `apps/web/app/repairs/page.tsx`:
  - Preserve a snapshot of `selectedOrder` before applying optimistic update:
    ```tsx
    const previousOrder = { ...selectedOrder };
    ```
  - In `handleUpdateStatus`, apply optimistic state to UI:
    ```tsx
    updateOrder(updated);
    setSelectedOrder(updated);
    ```
  - In the `catch` block:
    ```tsx
    catch (err: any) {
      // Revert optimistic update
      updateOrder(previousOrder);
      setSelectedOrder(previousOrder);
      const errMsg = err?.data?.message || err?.message || 'Chuyển trạng thái thất bại do vi phạm quy tắc nghiệp vụ.';
      toast(`Không thể cập nhật: ${errMsg}`, 'error');
      return;
    }
    ```
- In `apps/api/app/Http/Controllers/Api/V1/OrderController.php`:
  - Normalize incoming transition status before passing to `OrderWorkflowService`:
    ```php
    $rawStatus = (string) ($validated['transition'] ?? $validated['status']);
    $statusMap = [
        'quote_pending'  => 'waiting_approval',
        'qc_inspecting'  => 'waiting_qc',
        'qc_pending'     => 'waiting_qc',
    ];
    $targetStatus = $statusMap[$rawStatus] ?? $rawStatus;
    ```

*Alternatives considered*:
- Waiting for network roundtrip before updating UI (no optimistic update): Discarded because optimistic updates provide snappy UI feedback, and proper rollback guarantees consistency when errors occur.

## Risks / Trade-offs

- **[Risk] Print styling divergence across different browsers (Chrome vs Safari)**
  → *Mitigation*: Use strict standard CSS dimensions (`mm` units), `@page { size: A4 portrait; margin: 6mm 8mm; }`, and `box-sizing: border-box` on all receipt containers.
- **[Risk] State machine rejects transition from `in_repair` to `completed` directly**
  → *Mitigation*: Ensure simulated payment targets orders that are in `ready_for_return` or `waiting_pickup` (which already passed QC), or support transitional progression.
- **[Risk] Seeder execution in development environments with existing data**
  → *Mitigation*: Use `updateOrCreate` on deterministic keys (`order_code`, `phone`, `model_code`) so the seeder is idempotent and does not duplicate records if run multiple times.

## Migration Plan

1. Apply changes in order of low-level dependencies: `http-client.ts` → `OrderController.php` & `CustomerAndOrderSeeder.php` → `AppSidebar.tsx` → `print/[id]/page.tsx` & `globals.css` → `repairs/page.tsx` → `payments/page.tsx`.
2. Run `php artisan db:seed --class=CustomerAndOrderSeeder` to refresh test fixtures.
3. Validate and verify using browser checks and automated endpoint tests.
