import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '../..');

describe('OpenSpec: customer-pagination-and-admin-kpi-sorting Frontend Verification', () => {
  test('Task 2.1: CustomerService.getCustomers supports both string query and CustomerQueryParams object, and KPI types include warranty_rate', () => {
    const customerServicePath = path.join(
      repoRoot,
      'packages/api-client/src/services/customer.service.ts'
    );
    const kpiTypesPath = path.join(repoRoot, 'packages/types/src/kpi.ts');

    assert.ok(fs.existsSync(customerServicePath), 'customer.service.ts must exist');
    assert.ok(fs.existsSync(kpiTypesPath), 'kpi.ts must exist');

    const customerServiceCode = fs.readFileSync(customerServicePath, 'utf-8');
    const kpiTypesCode = fs.readFileSync(kpiTypesPath, 'utf-8');

    // CustomerQueryParams & getCustomers signature
    assert.ok(
      customerServiceCode.includes('export interface CustomerQueryParams'),
      'Must export CustomerQueryParams interface'
    );
    assert.ok(
      customerServiceCode.includes("per_page?: number | 'all'"),
      'CustomerQueryParams must support per_page?: number | "all"'
    );
    assert.ok(
      customerServiceCode.includes('page?: number'),
      'CustomerQueryParams must support page?: number'
    );
    assert.ok(
      customerServiceCode.includes('all?: boolean'),
      'CustomerQueryParams must support all?: boolean'
    );
    assert.ok(
      customerServiceCode.includes('params?: string | CustomerQueryParams'),
      'getCustomers must accept string | CustomerQueryParams'
    );

    // KPI types include warranty_rate
    assert.ok(
      kpiTypesCode.includes('warranty_rate?: number'),
      'KPI types must include warranty_rate?: number'
    );
    assert.ok(
      kpiTypesCode.includes('warranty_rate_formatted?: string'),
      'KPI types must include warranty_rate_formatted?: string'
    );
    assert.ok(
      kpiTypesCode.includes('warranty_count?: number'),
      'KPI types must include warranty_count?: number'
    );
  });

  test('Task 2.2: CustomersPage (/customers) implements pagination state and Calm Jade Pagination Bar UI', () => {
    const customersPagePath = path.join(webRoot, 'app/customers/page.tsx');
    assert.ok(fs.existsSync(customersPagePath), 'customers/page.tsx must exist');

    const content = fs.readFileSync(customersPagePath, 'utf-8');

    // Pagination state & query key
    assert.ok(
      content.includes('const [page, setPage] = useState<number>(1)'),
      'Must have page state initialized to 1'
    );
    assert.ok(
      content.includes("const [perPage, setPerPage] = useState<number | 'all'>"),
      'Must have perPage state supporting number | "all"'
    );
    assert.ok(
      content.includes("queryKey: ['customers', search.trim(), page, perPage]"),
      'useQuery key must include search.trim(), page, perPage'
    );
    assert.ok(
      content.includes('per_page: perPage'),
      'Must pass per_page: perPage to customerService.getCustomers'
    );
    assert.ok(
      content.includes("all: perPage === 'all' ? true : undefined"),
      'Must pass all: true when perPage === "all"'
    );

    // Pagination Bar UI & testids
    assert.ok(
      content.includes('data-testid="customers-pagination-bar"'),
      'Must render customers-pagination-bar container'
    );
    assert.ok(
      content.includes('data-testid="customers-per-page-select"'),
      'Must render customers-per-page-select dropdown'
    );
    assert.ok(
      content.includes('data-testid="customers-prev-page"'),
      'Must render customers-prev-page button'
    );
    assert.ok(
      content.includes('data-testid="customers-next-page"'),
      'Must render customers-next-page button'
    );
    assert.ok(
      content.includes('<option value="all">Tất cả</option>'),
      'Must include "Tất cả" option in per-page select'
    );
    assert.ok(
      content.includes('trên tổng'),
      'Must display total customers counter text'
    );
  });

  test('Task 3.1: DashboardPage (/dashboard) removes duplicate "Tỷ lệ hoàn thành" StatCard and uses "Tỉ lệ bảo hành"', () => {
    const dashboardPath = path.join(webRoot, 'app/dashboard/page.tsx');
    const adminViewPath = path.join(webRoot, 'app/dashboard/components/AdminDashboardView.tsx');
    assert.ok(fs.existsSync(dashboardPath), 'dashboard/page.tsx must exist');

    const content = [
      fs.readFileSync(dashboardPath, 'utf-8'),
      fs.existsSync(adminViewPath) ? fs.readFileSync(adminViewPath, 'utf-8') : '',
    ].join('\n');

    assert.strictEqual(
      content.includes('label="Tỷ lệ hoàn thành"'),
      false,
      'Dashboard must not render duplicate "Tỷ lệ hoàn thành" StatCard'
    );
    assert.ok(
      content.includes('label="Tỉ lệ bảo hành"'),
      'Dashboard must render "Tỉ lệ bảo hành" StatCard'
    );
    assert.ok(
      content.includes('warranty_rate'),
      'Dashboard must reference warranty_rate metric'
    );
  });

  test('Task 3.2: StaffPerformanceWidget supports clickable sortable headers (asc/desc) on both tabs and displays warranty_rate', () => {
    const widgetPath = path.join(
      webRoot,
      'app/dashboard/components/StaffPerformanceWidget.tsx'
    );
    assert.ok(fs.existsSync(widgetPath), 'StaffPerformanceWidget.tsx must exist');

    const content = fs.readFileSync(widgetPath, 'utf-8');

    // Sort handlers & state
    assert.ok(content.includes('handleTechSort'), 'Must implement handleTechSort');
    assert.ok(content.includes('handleCskhSort'), 'Must implement handleCskhSort');
    assert.ok(content.includes('sortedTechnicians'), 'Must compute sortedTechnicians');
    assert.ok(content.includes('sortedCskhStaff'), 'Must compute sortedCskhStaff');
    assert.ok(
      content.includes("localeCompare(b.name || '', 'vi')"),
      'Must sort names using Vietnamese localeCompare'
    );

    // Technician sortable headers
    const techHeaders = [
      'sort-tech-name',
      'sort-tech-total_orders',
      'sort-tech-completed',
      'sort-tech-warranty_rate',
      'sort-tech-qc_pass_rate',
      'sort-tech-avg_processing_time_minutes',
      'sort-tech-revenue_generated',
    ];
    for (const testId of techHeaders) {
      assert.ok(
        content.includes(`data-testid="${testId}"`),
        `Technician table must include sortable header ${testId}`
      );
    }

    // CSKH sortable headers
    const cskhHeaders = [
      'sort-cskh-name',
      'sort-cskh-orders_created_count',
      'sort-cskh-orders_completed_count',
      'sort-cskh-conversion_rate',
      'sort-cskh-efficiency',
      'sort-cskh-revenue_generated',
    ];
    for (const testId of cskhHeaders) {
      assert.ok(
        content.includes(`data-testid="${testId}"`),
        `CSKH table must include sortable header ${testId}`
      );
    }

    // Warranty rate column & summary
    assert.ok(
      content.includes('Tỷ lệ bảo hành'),
      'StaffPerformanceWidget must display "Tỷ lệ bảo hành"'
    );
    assert.ok(
      content.includes('warranty_rate'),
      'StaffPerformanceWidget must bind warranty_rate'
    );
  });

  test('Task 3.3: KPIPage (/kpi) replaces completion card with "Tỷ lệ bảo hành (%)" and provides sortable headers for all columns', () => {
    const kpiPagePath = path.join(webRoot, 'app/kpi/page.tsx');
    assert.ok(fs.existsSync(kpiPagePath), 'kpi/page.tsx must exist');

    const content = fs.readFileSync(kpiPagePath, 'utf-8');

    // StatCard replacement
    assert.ok(
      content.includes('label="Tỷ lệ bảo hành (%)"'),
      'KPI page must display "Tỷ lệ bảo hành (%)" StatCard'
    );
    assert.strictEqual(
      content.includes('label="Đơn hoàn tất toàn hệ thống"'),
      false,
      'KPI page must replace old completion StatCard'
    );

    // Sortable headers for all 7 columns
    const kpiHeaders = [
      'kpi-sort-name',
      'kpi-sort-role',
      'kpi-sort-count',
      'kpi-sort-warranty_rate',
      'kpi-sort-qcPass',
      'kpi-sort-rating',
      'kpi-sort-trend',
    ];
    for (const testId of kpiHeaders) {
      assert.ok(
        content.includes(`data-testid="${testId}"`),
        `KPI table must include sortable header ${testId}`
      );
    }

    assert.ok(content.includes('sortedStaff'), 'KPI page must render sortedStaff');
    assert.ok(content.includes('handleSort'), 'KPI page must define handleSort');
  });
});
