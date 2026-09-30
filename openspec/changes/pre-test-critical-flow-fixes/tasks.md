# Tasks

## 1. Shared HTTP Client URL Deduplication & Environment Config

- [x] 1.1 Implement URL normalizer in `packages/api-client/src/http-client.ts` to deduplicate `/api/v1` prefixes between baseURL and endpoints, and verify through unit tests or test script.
- [x] 1.2 Audit and standardize API base URL configuration in `apps/web/.env.example` and verify that sample variables match standard conventions.

## 2. Backend FSM Status Aliases & Multi-Branch Seeder Data

- [x] 2.1 Add status alias normalization (`quote_pending` -> `waiting_approval`, `qc_inspecting` -> `waiting_qc`) in `apps/api/app/Http/Controllers/Api/V1/OrderController.php` and verify transition requests succeed for both aliases.
- [x] 2.2 Expand `apps/api/database/seeders/CustomerAndOrderSeeder.php` with 6 deterministic demo orders covering 6 lifecycle states across Q1 and Q3 branches, and verify by running `php artisan db:seed --class=CustomerAndOrderSeeder`.

## 3. Sidebar Navigation Technician Workspace Entry

- [x] 3.1 Register the `/tech` navigation item with dedicated icon in `packages/ui/src/organisms/AppSidebar.tsx` and verify item definition in `operationsNav`.
- [x] 3.2 Update `rolePermissions` in `packages/ui/src/organisms/AppSidebar.tsx` to include `tech` for `admin` and `tech` roles while hiding from `cskh`, and verify role-based visibility.

## 4. Two-Part A4 Receipt Print Layout & Stylesheet Isolation

- [x] 4.1 Update `@media print` rules in `apps/web/app/globals.css` with visibility-based isolation, `@page` A4 sizing, and overflow suppression, and verify CSS rules.
- [x] 4.2 Refactor `apps/web/app/print/[id]/page.tsx` receipt containers, margins, and image dimensions to guarantee 1-page fit (<= 132mm per slip), and verify print preview fit without trailing blank pages.

## 5. Resilient State Rollback & Error Handling in Order Management

- [x] 5.1 Implement previous state backup and optimistic rollback in `apps/web/app/repairs/page.tsx` on 422/FSM errors, and verify UI reverts accurately on simulated transition failure.
- [x] 5.2 Enhance error toast feedback on `apps/web/app/repairs/page.tsx` to surface specific backend validation errors instead of false success messages, and verify toast output.

## 6. Payment Flow Order Selection & Payment Simulation

- [x] 6.1 Add pending order selector to `apps/web/app/payments/page.tsx` to auto-populate order code and payable amount, and verify field population on order select.
- [x] 6.2 Implement "Giả lập thanh toán thành công" (Simulate Payment Success) action button triggering payment creation and order status transition to `completed`, and verify payment history and order state update.
