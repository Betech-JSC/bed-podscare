# Spec Delta

## Purpose

Defines the technical specifications and behavioral contracts for pre-test critical hotfixes across two-part A4 receipt printing, technician workspace navigation, multi-state demo data coverage, on-screen payment simulation, HTTP URL deduplication, and resilient FSM transition rollback.

## ADDED Requirements

### Requirement: Two-Part A4 Intake Receipt Print Isolation and Compact Layout
The system SHALL format and render both copies (Store Copy and Customer Copy) of the repair intake receipt within a single physical A4 page (210mm x 297mm) without generating trailing blank pages, horizontal overflow, or content truncation. The print stylesheet MUST isolate the printable sheet wrapper and prevent parent Next.js layout containers from introducing unconstrained margins or heights during `@media print`. Each individual receipt copy MUST NOT exceed 132mm in height.

#### Scenario: Printing receipt without blank pages
- **WHEN** a user triggers the print action or invokes `window.print()` on the receipt page `/print/[id]`
- **THEN** the browser print preview SHALL fit both copies onto exactly one A4 sheet with zero blank pages following it.

#### Scenario: Print stylesheet isolation ignores parent layout margins
- **WHEN** the print view is generated inside the Next.js application tree
- **THEN** the print stylesheet MUST override parent display, padding, and background attributes so that only `#printSheetWrapper` is rendered on white background.

### Requirement: Technician Navigation Entry in AppSidebar
The AppSidebar component SHALL include a dedicated navigation entry for the Technician Workspace (`/tech`) within the operational navigation group. The system MUST grant visibility and active routing for this navigation item to both `admin` and `tech` (or `technician`) roles while hiding it from roles that lack technician queue permissions (such as `cskh`).

#### Scenario: Technician or Admin views sidebar
- **WHEN** a user authenticated with role `tech`, `technician`, or `admin` views the sidebar navigation
- **THEN** the sidebar SHALL display the "Bàn làm việc KTV" navigation item linking to `/tech`.

#### Scenario: CSKH views sidebar
- **WHEN** a user authenticated with role `cskh` views the sidebar navigation
- **THEN** the sidebar SHALL NOT display the technician navigation item.

### Requirement: Comprehensive Multi-State and Multi-Branch Demo Seeder
The database seeder (`CustomerAndOrderSeeder`) SHALL seed at least 6 distinct repair orders covering 6 canonical lifecycle states: `waiting_approval`, `waiting_tech`, `in_repair`, `waiting_qc`, `ready_for_return`, and `completed`. The seeder MUST distribute these orders across both Branch Q1 and Branch Q3 so that branch-scoped filtering and queue switching can be demonstrated without manual order intake. Each seeded order MUST include valid relationships for customer, device model, intake checklist, and assigned staff.

#### Scenario: Running database seed command
- **WHEN** `php artisan db:seed --class=CustomerAndOrderSeeder` is executed
- **THEN** the database SHALL contain 6 demo repair orders covering all 6 lifecycle states with valid branch IDs for Q1 and Q3.

#### Scenario: Technician inspects branch queues
- **WHEN** a technician filters orders for Branch Q1 or Branch Q3 in the system
- **THEN** the interface SHALL display orders in that branch across active technician and QC queues.

### Requirement: Manual Payment Simulation and Order Selection
The `/payments` interface SHALL provide a selectable dropdown or list of repair orders currently pending payment (including orders in `ready_for_return` and `waiting_pickup` states). Selecting a pending order MUST automatically populate the receipt creation modal with the order code and payable amount. The interface SHALL provide a "Simulate Payment Success" action that creates a completed payment record and transitions the order state to `completed` without requiring live external payment webhooks.

#### Scenario: Cashier selects pending order
- **WHEN** a user opens the payment creation modal and chooses a pending order from the selector
- **THEN** the order code and total payable amount SHALL automatically populate the payment input fields.

#### Scenario: Cashier simulates payment success
- **WHEN** a user clicks the "Giả lập thanh toán thành công" (Simulate Payment Success) button for an eligible order
- **THEN** the system SHALL create a payment record with status `completed`, advance the order to `completed` in the state machine, and refresh the payment transaction list.

### Requirement: Resilient API Base URL Resolution and Deduplication
The `HttpClient` class SHALL normalize request URLs against the configured `baseURL` to prevent accidental duplication of the `/api/v1` prefix. The client MUST resolve both relative endpoints (e.g. `/orders`, `orders`) and redundantly prefixed endpoints (e.g. `/api/v1/orders`) into a single canonical path (`.../api/v1/orders`) without producing `/api/v1/api/v1/...`.

#### Scenario: Request made with redundant prefix
- **WHEN** a service passes `/api/v1/orders` to `httpClient.get()` while `baseURL` is configured as `http://localhost:8000/api/v1`
- **THEN** the HTTP client SHALL dispatch the request to `http://localhost:8000/api/v1/orders` without duplicating the prefix.

#### Scenario: Base URL without trailing slash combines cleanly
- **WHEN** `baseURL` ends without a slash and endpoint starts with `/orders`
- **THEN** the HTTP client SHALL join them into a valid URL without duplicate or missing slashes.

### Requirement: Optimistic State Rollback and FSM Status Alias Normalization
When a repair order status transition fails on the backend (including HTTP 422 Unprocessable Content due to unmet FSM conditions or missing QC pass), the frontend state management SHALL immediately rollback the in-memory order data to its previous confirmed state and display an error toast notification to the user. The backend `OrderController` SHALL accept recognized state aliases (`quote_pending` mapping to `waiting_approval`, and `qc_inspecting` mapping to `waiting_qc`) before dispatching to the workflow engine.

#### Scenario: Transition rejected due to missing QC inspection
- **WHEN** a user attempts to transition an order to `ready_for_return` without a passing QC inspection
- **THEN** the backend SHALL return HTTP 422 and the frontend SHALL rollback the displayed order status to its prior value and display an error message.

#### Scenario: Transition requested with legacy status alias
- **WHEN** an API client requests a transition using alias `quote_pending` or `qc_inspecting`
- **THEN** the `OrderController` SHALL map the alias to `waiting_approval` or `waiting_qc` respectively and execute the state transition successfully.
