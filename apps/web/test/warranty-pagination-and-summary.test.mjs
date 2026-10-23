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
