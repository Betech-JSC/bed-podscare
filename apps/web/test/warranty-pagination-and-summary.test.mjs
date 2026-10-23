import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '../..');

describe('OpenSpec: warranty-and-system-pagination (Phase 1 Verification)', () => {
  test('Task 1.1: Shared <PaginationBar /> molecule exists, is exported in @podscare/ui, and follows Calm Jade Design System', () => {
    const paginationBarPath = path.join(repoRoot, 'packages/ui/src/molecules/PaginationBar.tsx');
    const uiIndexPath = path.join(repoRoot, 'packages/ui/src/index.ts');

    assert.ok(fs.existsSync(paginationBarPath), 'PaginationBar.tsx must exist in packages/ui/src/molecules/');
    assert.ok(fs.existsSync(uiIndexPath), 'packages/ui/src/index.ts must exist');

    const paginationCode = fs.readFileSync(paginationBarPath, 'utf-8');
    const uiIndexCode = fs.readFileSync(uiIndexPath, 'utf-8');

    assert.ok(
      uiIndexCode.includes("export * from './molecules/PaginationBar'"),
      'packages/ui/src/index.ts must export PaginationBar'
    );

    // Calm Jade tokens & tabular-nums compliance
    assert.ok(paginationCode.includes('#176b58'), 'Must use Calm Jade primary accent #176b58');
    assert.ok(paginationCode.includes('tabular-nums'), 'Must enforce tabular-nums for numeric alignment');
    assert.strictEqual(
      paginationCode.includes('bg-gradient-'),
      false,
      'Must NOT use arbitrary CSS gradients'
    );
    assert.strictEqual(
      paginationCode.includes('backdrop-blur'),
      false,
      'Must NOT use backdrop-blur'
    );

    // Per-page options: 15, 30, 50, 100, 'all'
    assert.ok(
      paginationCode.includes("[15, 30, 50, 100, 'all']"),
      'Must define default per-page options [15, 30, 50, 100, "all"]'
    );
    assert.ok(
      paginationCode.includes("opt === 'all' ? 'Tất cả' : `${opt} / trang`"),
      'Must render "Tất cả" for "all" option and "{opt} / trang" for numeric options'
    );

    // Required testIds & Vietnamese labels
    assert.ok(
      paginationCode.includes('data-testid={`${testIdPrefix}-pagination-bar`}'),
      'Must render pagination bar testid'
    );
    assert.ok(
      paginationCode.includes('data-testid={`${testIdPrefix}-pagination-summary`}'),
      'Must render pagination summary testid'
    );
    assert.ok(
      paginationCode.includes('data-testid={`${testIdPrefix}-per-page-select`}'),
      'Must render per-page select testid'
    );
    assert.ok(
      paginationCode.includes('data-testid={`${testIdPrefix}-prev-page`}'),
      'Must render prev-page button testid'
    );
    assert.ok(
      paginationCode.includes('data-testid={`${testIdPrefix}-next-page`}'),
      'Must render next-page button testid'
    );
    assert.ok(
      paginationCode.includes('trên tổng'),
      'Must display "Hiển thị {from} - {to} trên tổng {total} {itemLabel}"'
    );
    assert.ok(paginationCode.includes('Trước') && paginationCode.includes('Sau'), 'Must display Trước / Sau buttons');

    // Selecting perPage resets page to 1 and disables navigation when perPage === 'all'
    assert.ok(
      paginationCode.includes('onPerPageChange(nextPerPage)') && paginationCode.includes('onPageChange(1)'),
      'Changing perPage must trigger onPerPageChange(nextPerPage) and reset page to 1 via onPageChange(1)'
    );
    assert.ok(
      paginationCode.includes("safeCurrentPage <= 1 || perPage === 'all' || isLoading"),
      'Prev button must be disabled when on page 1, perPage === "all", or loading'
    );
    assert.ok(
      paginationCode.includes("safeCurrentPage >= safeLastPage || perPage === 'all' || isLoading"),
      'Next button must be disabled when on lastPage, perPage === "all", or loading'
    );
  });

  test('Task 1.3: @podscare/types and @podscare/api-client support WarrantyPaginationParams, per_page="all", q, and WarrantySummaryCounts', () => {
    const typesPath = path.join(repoRoot, 'packages/types/src/warranty.ts');
    const servicePath = path.join(repoRoot, 'packages/api-client/src/services/warranty.service.ts');

    assert.ok(fs.existsSync(typesPath), 'packages/types/src/warranty.ts must exist');
    assert.ok(fs.existsSync(servicePath), 'packages/api-client/src/services/warranty.service.ts must exist');

    const typesCode = fs.readFileSync(typesPath, 'utf-8');
    const serviceCode = fs.readFileSync(servicePath, 'utf-8');

    for (const field of [
      'total: number',
      'active: number',
      'expiring_soon: number',
      'expired: number',
      'total_warranties?: number',
      'active_count?: number',
      'expiring_soon_count?: number',
      'expired_or_revoked_count?: number',
    ]) {
      assert.ok(typesCode.includes(field), `packages/types/src/warranty.ts must include ${field}`);
      assert.ok(serviceCode.includes(field), `warranty.service.ts must include ${field}`);
    }

    assert.ok(
      typesCode.includes("per_page?: number | 'all'"),
      'WarrantyPaginationParams in types must support per_page?: number | "all"'
    );
    assert.ok(
      serviceCode.includes('getWarranties(params?: WarrantyQueryParams)'),
      'WarrantyService.getWarranties must accept WarrantyQueryParams'
    );
    assert.ok(
      serviceCode.includes('getClaims(params?: WarrantyClaimQueryParams)'),
      'WarrantyService.getClaims must accept WarrantyClaimQueryParams'
    );
    assert.ok(
      serviceCode.includes("params.per_page === 'all' || params.all === true"),
      'buildCleanPaginationParams must normalize per_page="all" and all=true'
    );
  });

  test('Task 1.4: WarrantyPage (/warranty) removes 50-record cap, renders 4 server KPI summary cards, and wires independent two-tab PaginationBar + search', () => {
    const warrantyPagePath = path.join(webRoot, 'app/warranty/page.tsx');
    assert.ok(fs.existsSync(warrantyPagePath), 'apps/web/app/warranty/page.tsx must exist');

    const pageCode = fs.readFileSync(warrantyPagePath, 'utf-8');

    // 1. Hard-coded per_page: 50 must be completely removed
    assert.strictEqual(
      pageCode.includes('per_page: 50'),
      false,
      'Must NOT hardcode per_page: 50 in loadWarranties or loadClaims'
    );

    // 2. Client-side redundant array filtering for table rows must be removed
    assert.strictEqual(
      pageCode.includes('const filteredWarranties ='),
      false,
      'Must NOT filter warranties on client-side for table rendering'
    );

    // 3. 4 Global KPI Summary Cards rendered from server summary
    for (const kpiTestId of [
      'warranty-kpi-grid',
      'warranty-kpi-total',
      'warranty-kpi-active',
      'warranty-kpi-expiring-soon',
      'warranty-kpi-expired',
    ]) {
      assert.ok(
        pageCode.includes(`data-testid="${kpiTestId}"`),
        `WarrantyPage must render KPI element with data-testid="${kpiTestId}"`
      );
    }
    assert.ok(pageCode.includes('Tổng sổ bảo hành'), 'Must display "Tổng sổ bảo hành" KPI label');
    assert.ok(pageCode.includes('Đang còn hạn'), 'Must display "Đang còn hạn" KPI label');
    assert.ok(pageCode.includes('Sắp hết hạn (≤ 7 ngày)'), 'Must display "Sắp hết hạn (≤ 7 ngày)" KPI label');
    assert.ok(pageCode.includes('Đã hết hạn / Thu hồi'), 'Must display "Đã hết hạn / Thu hồi" KPI label');

    // 4. Tab badges display total count from server instead of current page array length
    assert.ok(
      pageCode.includes('data-testid="warranty-tab-list-badge"') && pageCode.includes('{warrantiesTotal}'),
      'Warranties tab badge must display server total {warrantiesTotal}'
    );
    assert.ok(
      pageCode.includes('data-testid="warranty-tab-claims-badge"') && pageCode.includes('{claimsTotal}'),
      'Claims tab badge must display server total {claimsTotal}'
    );

    // 5. Independent pagination state & PaginationBar for Tab 1 (warranties) and Tab 2 (claims)
    assert.ok(
      pageCode.includes('testIdPrefix="warranties"') && pageCode.includes('itemLabel="sổ bảo hành"'),
      'Tab 1 must mount <PaginationBar testIdPrefix="warranties" itemLabel="sổ bảo hành" />'
    );
    assert.ok(
      pageCode.includes('testIdPrefix="claims"') && pageCode.includes('itemLabel="khiếu nại"'),
      'Tab 2 must mount <PaginationBar testIdPrefix="claims" itemLabel="khiếu nại" />'
    );

    // 6. Search inputs reset page to 1 on both tabs
    assert.ok(
      pageCode.includes('setSearch(sanitizeInputLive(val));\n                  setPage(1);'),
      'Tab 1 search change must reset page to 1'
    );
    assert.ok(
      pageCode.includes('setClaimsSearch(sanitizeInputLive(val));\n                  setClaimsPage(1);'),
      'Tab 2 claims search change must reset claimsPage to 1'
    );
  });
});

describe('OpenSpec: warranty-and-system-pagination (Phase 2 Verification)', () => {
  test('Task 2.1: @podscare/api-client services (repair, quote, payment) normalize per_page="all", all=true, q/search, and PaymentSummary', () => {
    const repairServicePath = path.join(repoRoot, 'packages/api-client/src/services/repair.service.ts');
    const quoteServicePath = path.join(repoRoot, 'packages/api-client/src/services/quote.service.ts');
    const paymentServicePath = path.join(repoRoot, 'packages/api-client/src/services/payment.service.ts');

    assert.ok(fs.existsSync(repairServicePath), 'repair.service.ts must exist');
    assert.ok(fs.existsSync(quoteServicePath), 'quote.service.ts must exist');
    assert.ok(fs.existsSync(paymentServicePath), 'payment.service.ts must exist');

    const repairServiceCode = fs.readFileSync(repairServicePath, 'utf-8');
    const quoteServiceCode = fs.readFileSync(quoteServicePath, 'utf-8');
    const paymentServiceCode = fs.readFileSync(paymentServicePath, 'utf-8');

    assert.ok(
      repairServiceCode.includes("params?.per_page === 'all' || params?.all === true") &&
        repairServiceCode.includes("queryParams.per_page = 'all'"),
      'RepairService.getRepairs must support per_page="all" and all=true'
    );
    assert.ok(
      quoteServiceCode.includes("per_page?: number | 'all'") &&
        quoteServiceCode.includes("params.per_page === 'all' || params.all === true"),
      'QuoteService.getQuotes must support QuoteFilterDTO with per_page="all" and all=true'
    );
    assert.ok(
      paymentServiceCode.includes('PaymentSummary') &&
        paymentServiceCode.includes("params.per_page === 'all' || params.all === true"),
      'PaymentService.getPayments must support PaymentFilterDTO, PaymentSummary, and per_page="all"'
    );
  });

  test('Task 2.2: /repairs (RepairQueuePane), /tech, and /qc remove hardcoded limits, integrate <PaginationBar />, filter waiting_qc from server, and preserve tech price masking', () => {
    const repairsPagePath = path.join(webRoot, 'app/repairs/page.tsx');
    const repairQueuePanePath = path.join(webRoot, 'app/repairs/components/RepairQueuePane.tsx');
    const techPagePath = path.join(webRoot, 'app/tech/page.tsx');
    const qcPagePath = path.join(webRoot, 'app/qc/page.tsx');

    const repairsPageCode = fs.readFileSync(repairsPagePath, 'utf-8');
    const queuePaneCode = fs.readFileSync(repairQueuePanePath, 'utf-8');
    const techPageCode = fs.readFileSync(techPagePath, 'utf-8');
    const qcPageCode = fs.readFileSync(qcPagePath, 'utf-8');

    // 1. /repairs & RepairQueuePane: supports warranty tab, masks price for tech, and mounts <PaginationBar />
    assert.ok(
      repairsPageCode.includes("per_page: 'all'") && repairsPageCode.includes('all: true'),
      '/repairs page must fetch full shift/filter dataset without 15-item silent truncation'
    );
    assert.ok(
      queuePaneCode.includes('data-testid="tab-filter-warranty"') &&
        queuePaneCode.includes("setOrderTypeFilter('warranty')") &&
        queuePaneCode.includes('{orderCounts.warranty}'),
      'RepairQueuePane must render "Đơn bảo hành" quick filter tab with warranty count'
    );
    assert.ok(
      queuePaneCode.includes('{!isTechRole && <th className="px-4">Chi phí</th>}') &&
        queuePaneCode.includes('{!isTechRole && ('),
      'RepairQueuePane must mask price column when isTechRole is true'
    );
    assert.ok(
      queuePaneCode.includes('<PaginationBar') &&
        queuePaneCode.includes('testIdPrefix="repairs"') &&
        queuePaneCode.includes('itemLabel="đơn sửa chữa"'),
      'RepairQueuePane must mount <PaginationBar testIdPrefix="repairs" itemLabel="đơn sửa chữa" />'
    );

    // 2. /tech: mounts <PaginationBar /> across all 4 tabs, resets page on filter change, and does not expose price on cards
    assert.ok(
      techPageCode.includes("per_page: 'all'") && techPageCode.includes('all: true'),
      '/tech page must fetch orders with per_page="all" & all=true'
    );
    assert.ok(
      techPageCode.includes('setPage(1);') &&
        techPageCode.includes('[dateFilter, branchId, search, activeTab]'),
      '/tech page must reset page to 1 when dateFilter, branchId, search, or activeTab changes'
    );
    const techPaginationMatches = techPageCode.match(/testIdPrefix="tech-orders"/g) || [];
    assert.strictEqual(
      techPaginationMatches.length,
      4,
      '/tech page must mount <PaginationBar testIdPrefix="tech-orders" /> on all 4 tabs (my_orders, available, completed, special_parts)'
    );
    assert.strictEqual(
      techPageCode.includes('moneyFormatted('),
      false,
      '/tech page must NOT render formatted prices on technician queue cards'
    );

    // 3. /qc: fetches status="waiting_qc" directly from server and mounts <PaginationBar /> for both pending & history lists
    assert.ok(
      qcPageCode.includes("status: 'waiting_qc'") &&
        qcPageCode.includes("per_page: 'all'") &&
        qcPageCode.includes("date_filter: 'all'"),
      '/qc page must fetch waiting_qc orders directly from server with status="waiting_qc", per_page="all", date_filter="all"'
    );
    assert.ok(
      qcPageCode.includes('testIdPrefix="qc-pending"') && qcPageCode.includes('itemLabel="đơn chờ QC"'),
      '/qc page must mount <PaginationBar testIdPrefix="qc-pending" itemLabel="đơn chờ QC" />'
    );
    assert.ok(
      qcPageCode.includes('testIdPrefix="qc-history"') && qcPageCode.includes('itemLabel="lịch sử kiểm định"'),
      '/qc page must mount <PaginationBar testIdPrefix="qc-history" itemLabel="lịch sử kiểm định" />'
    );
  });

  test('Task 2.3: /quotes and /payments remove 15-record truncation, integrate <PaginationBar />, and render server summary KPIs on /payments', () => {
    const quotesPagePath = path.join(webRoot, 'app/quotes/page.tsx');
    const paymentsPagePath = path.join(webRoot, 'app/payments/page.tsx');

    const quotesPageCode = fs.readFileSync(quotesPagePath, 'utf-8');
    const paymentsPageCode = fs.readFileSync(paymentsPagePath, 'utf-8');

    // 1. /quotes: fetches all quotes via per_page: 'all', all: true and mounts <PaginationBar testIdPrefix="quotes" />
    assert.ok(
      quotesPageCode.includes("quoteService.getQuotes({ per_page: 'all', all: true })"),
      '/quotes page must request all quotes via quoteService.getQuotes({ per_page: "all", all: true })'
    );
    assert.ok(
      quotesPageCode.includes('testIdPrefix="quotes"') && quotesPageCode.includes('itemLabel="báo giá"'),
      '/quotes page must mount <PaginationBar testIdPrefix="quotes" itemLabel="báo giá" />'
    );
    assert.ok(
      quotesPageCode.includes('setPage(1);') && quotesPageCode.includes('[search, filterStatus]'),
      '/quotes page must reset page to 1 when search or filterStatus changes'
    );

    // 2. /payments: server-driven pagination, global KPI summary cards from server summary, and VietQR pending orders from server
    assert.ok(
      paymentsPageCode.includes("page: perPage === 'all' ? 1 : page") &&
        paymentsPageCode.includes('per_page: perPage') &&
        paymentsPageCode.includes('paymentService.getPayments(params)'),
      '/payments page must pass page and per_page params to paymentService.getPayments'
    );
    assert.ok(
      paymentsPageCode.includes('setSummary(raw.summary)') &&
        paymentsPageCode.includes('summary?.total_amount') &&
        paymentsPageCode.includes('summary?.transfer_amount') &&
        paymentsPageCode.includes('summary?.cash_amount') &&
        paymentsPageCode.includes('summary?.total_count'),
      '/payments page must derive KPI card totals from server summary (total_amount, transfer_amount, cash_amount, total_count)'
    );
    assert.ok(
      paymentsPageCode.includes('testIdPrefix="payments"') && paymentsPageCode.includes('itemLabel="giao dịch"'),
      '/payments page must mount <PaginationBar testIdPrefix="payments" itemLabel="giao dịch" />'
    );
  });
});

describe('OpenSpec: warranty-and-system-pagination (Phase 3 & Phase 4 Verification)', () => {
  test('Task 3.1 & 3.2: Inventory Services and 4 Inventory Tabs + SupplierDebtHistoryModal support per_page="all", server summary, and <PaginationBar />', () => {
    const invServicePath = path.join(repoRoot, 'packages/api-client/src/services/inventory.service.ts');
    const supServicePath = path.join(repoRoot, 'packages/api-client/src/services/supplier.service.ts');
    const invPagePath = path.join(webRoot, 'app/inventory/page.tsx');
    const stockTabPath = path.join(webRoot, 'app/inventory/components/StockTab.tsx');
    const receiptsTabPath = path.join(webRoot, 'app/inventory/components/ReceiptsTab.tsx');
    const suppliersTabPath = path.join(webRoot, 'app/inventory/components/SuppliersTab.tsx');
    const movementsTabPath = path.join(webRoot, 'app/inventory/components/MovementsTab.tsx');
    const debtModalPath = path.join(webRoot, 'app/inventory/components/SupplierDebtHistoryModal.tsx');

    const invServiceCode = fs.readFileSync(invServicePath, 'utf-8');
    const supServiceCode = fs.readFileSync(supServicePath, 'utf-8');
    const invPageCode = fs.readFileSync(invPagePath, 'utf-8');
    const stockTabCode = fs.readFileSync(stockTabPath, 'utf-8');
    const receiptsTabCode = fs.readFileSync(receiptsTabPath, 'utf-8');
    const suppliersTabCode = fs.readFileSync(suppliersTabPath, 'utf-8');
    const movementsTabCode = fs.readFileSync(movementsTabPath, 'utf-8');
    const debtModalCode = fs.readFileSync(debtModalPath, 'utf-8');

    assert.ok(
      invServiceCode.includes('InventorySummary') &&
        invServiceCode.includes("params.per_page === 'all' || params.all === true"),
      'inventory.service.ts must define InventorySummary and normalize per_page="all"'
    );
    assert.ok(
      supServiceCode.includes("params.per_page === 'all' || params.all === true"),
      'supplier.service.ts must normalize per_page="all" across getSuppliers, getDebtHistory, and getGoodsReceipts'
    );
    assert.ok(
      invPageCode.includes("supplierService.getSuppliers({ per_page: 'all', all: true })") &&
        invPageCode.includes("inventoryService.getParts({ per_page: 'all', all: true })"),
      'InventoryPage parent dropdown loaders must request per_page="all", all=true'
    );
    assert.ok(
      stockTabCode.includes('testIdPrefix="inventory-stock"') &&
        stockTabCode.includes('serverSummary?.total_sku') &&
        !stockTabCode.includes('per_page: 50'),
      'StockTab must mount <PaginationBar testIdPrefix="inventory-stock" /> and read server summary'
    );
    assert.ok(
      receiptsTabCode.includes('testIdPrefix="inventory-receipts"') &&
        !receiptsTabCode.includes('per_page: 50'),
      'ReceiptsTab must mount <PaginationBar testIdPrefix="inventory-receipts" /> without per_page: 50'
    );
    assert.ok(
      suppliersTabCode.includes('testIdPrefix="inventory-suppliers"') &&
        !suppliersTabCode.includes('per_page: 100'),
      'SuppliersTab must mount <PaginationBar testIdPrefix="inventory-suppliers" /> without per_page: 100'
    );
    assert.ok(
      movementsTabCode.includes('testIdPrefix="inventory-movements"') &&
        !movementsTabCode.includes('per_page: 100'),
      'MovementsTab must mount <PaginationBar testIdPrefix="inventory-movements" /> without per_page: 100'
    );
    assert.ok(
      debtModalCode.includes('testIdPrefix="supplier-debt-history"') &&
        !debtModalCode.includes('per_page: 50'),
      'SupplierDebtHistoryModal must mount <PaginationBar testIdPrefix="supplier-debt-history" />'
    );
  });

  test('Task 4.1 & 4.2: Customers, Shipments, Audit, Timeline, Users, Staff Selectors, Partners, Shifts, and Platform Super Admin pages integrate <PaginationBar /> and per_page="all"', () => {
    const customersCode = fs.readFileSync(path.join(webRoot, 'app/customers/page.tsx'), 'utf-8');
    const shipmentsCode = fs.readFileSync(path.join(webRoot, 'app/shipments/page.tsx'), 'utf-8');
    const auditCode = fs.readFileSync(path.join(webRoot, 'app/audit/page.tsx'), 'utf-8');
    const timelineCode = fs.readFileSync(path.join(webRoot, 'app/timeline/page.tsx'), 'utf-8');
    const usersCode = fs.readFileSync(path.join(webRoot, 'app/users/page.tsx'), 'utf-8');
    const partnersCode = fs.readFileSync(path.join(webRoot, 'app/partners/page.tsx'), 'utf-8');
    const shiftsCode = fs.readFileSync(path.join(webRoot, 'app/shifts/page.tsx'), 'utf-8');
    const storesCode = fs.readFileSync(path.join(webRoot, 'app/platform/stores/page.tsx'), 'utf-8');
    const approvalsCode = fs.readFileSync(path.join(webRoot, 'app/platform/approvals/page.tsx'), 'utf-8');
    const billingCode = fs.readFileSync(path.join(webRoot, 'app/platform/billing/page.tsx'), 'utf-8');
    const handoverModalCode = fs.readFileSync(path.join(webRoot, 'app/components/HandoverTechModal.tsx'), 'utf-8');
    const techDetailModalCode = fs.readFileSync(path.join(webRoot, 'app/components/TechOrderDetailModal.tsx'), 'utf-8');
    const intakeModalCode = fs.readFileSync(path.join(webRoot, 'app/components/IntakeWizardModal.tsx'), 'utf-8');

    assert.ok(
      customersCode.includes('testIdPrefix="customers"') &&
        customersCode.includes('testIdPrefix="customer-orders"'),
      'CustomersPage must mount <PaginationBar /> for both customer list and customer detail order history'
    );
    assert.ok(
      shipmentsCode.includes('testIdPrefix="shipments"') && !shipmentsCode.includes('per_page: 50'),
      'ShipmentsPage must mount <PaginationBar testIdPrefix="shipments" /> without per_page: 50'
    );
    assert.ok(
      auditCode.includes('testIdPrefix="audit-logs"') && !auditCode.includes('per_page: 50'),
      'AuditPage must mount <PaginationBar testIdPrefix="audit-logs" /> without per_page: 50'
    );
    assert.ok(
      timelineCode.includes('testIdPrefix="timeline-events"') && !timelineCode.includes('per_page: 50'),
      'TimelinePage must mount <PaginationBar testIdPrefix="timeline-events" /> without per_page: 50'
    );
    assert.ok(
      usersCode.includes('testIdPrefix="users"') && !usersCode.includes('per_page: 50'),
      'UsersPage must mount <PaginationBar testIdPrefix="users" /> without per_page: 50'
    );
    assert.ok(
      handoverModalCode.includes("getUsers({ role: 'technician', is_active: true, per_page: 'all', all: true })"),
      'HandoverTechModal must fetch all active technicians via per_page="all", all=true'
    );
    assert.ok(
      techDetailModalCode.includes("getUsers({ role: 'technician', is_active: true, per_page: 'all', all: true })"),
      'TechOrderDetailModal must fetch all active technicians via per_page="all", all=true'
    );
    assert.ok(
      intakeModalCode.includes("getUsers({ role: 'cskh', is_active: true, per_page: 'all', all: true })"),
      'IntakeWizardModal must fetch all active CSKH users via per_page="all", all=true'
    );
    assert.ok(
      partnersCode.includes('testIdPrefix="partners"') && !partnersCode.includes('per_page: 50'),
      'PartnersPage must mount <PaginationBar testIdPrefix="partners" /> without per_page: 50'
    );
    assert.ok(
      shiftsCode.includes('testIdPrefix="cashbook-tx"') &&
        shiftsCode.includes('testIdPrefix="shifts-history"'),
      'ShiftsPage must mount <PaginationBar /> on both cashbook and shifts history tabs'
    );
    assert.ok(
      storesCode.includes('testIdPrefix="platform-stores"') &&
        !storesCode.includes("params.append('per_page', '50')"),
      'PlatformStoresPage must mount <PaginationBar testIdPrefix="platform-stores" />'
    );
    assert.ok(
      approvalsCode.includes('testIdPrefix="platform-approvals"'),
      'PlatformApprovalsPage must mount <PaginationBar testIdPrefix="platform-approvals" />'
    );
    assert.ok(
      billingCode.includes('testIdPrefix="platform-billing"'),
      'PlatformBillingPage must mount <PaginationBar testIdPrefix="platform-billing" />'
    );
  });
});
