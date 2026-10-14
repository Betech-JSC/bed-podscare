import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '../..');

describe('OpenSpec: admin-dashboard-four-revenue-and-debt-cards Frontend Verification', () => {
  test('Task 2.1: packages/types/src/kpi.ts defines RevenueOrderBreakdownItem and monthly/daily revenue & uncollected debt fields', () => {
    const kpiTypesPath = path.join(repoRoot, 'packages/types/src/kpi.ts');
    assert.ok(fs.existsSync(kpiTypesPath), 'packages/types/src/kpi.ts must exist');

    const content = fs.readFileSync(kpiTypesPath, 'utf-8');

    assert.ok(
      content.includes('export interface RevenueOrderBreakdownItem'),
      'Must export RevenueOrderBreakdownItem interface'
    );

    const requiredFields = [
      'monthly_collected_amount?: number;',
      'monthly_uncollected_amount?: number;',
      'monthly_uncollected_orders_count?: number;',
      'monthly_orders_breakdown?: RevenueOrderBreakdownItem[];',
      'selected_date_collected_amount?: number;',
      'selected_date_uncollected_amount?: number;',
      'selected_date_uncollected_orders_count?: number;',
      'selected_date_orders_breakdown?: RevenueOrderBreakdownItem[];',
    ];

    for (const field of requiredFields) {
      assert.ok(content.includes(field), `kpi.ts must include field: ${field}`);
    }
  });

  test('Task 2.2: DashboardPage (/dashboard) renders the exact 4 top financial cards in order with full VND values and keeps lower sections intact', () => {
    const dashboardPath = path.join(webRoot, 'app/dashboard/page.tsx');
    assert.ok(fs.existsSync(dashboardPath), 'apps/web/app/dashboard/page.tsx must exist');

    const content = fs.readFileSync(dashboardPath, 'utf-8');

    // Verify exact 4 card testids and their order in JSX
    const idxCard1 = content.indexOf('data-testid="admin-card-monthly-total"');
    const idxCard2 = content.indexOf('data-testid="admin-card-monthly-uncollected"');
    const idxCard3 = content.indexOf('data-testid="admin-card-daily-total"');
    const idxCard4 = content.indexOf('data-testid="admin-card-daily-uncollected"');

    assert.ok(idxCard1 > -1, 'Card 1 (admin-card-monthly-total) must exist');
    assert.ok(idxCard2 > idxCard1, 'Card 2 (admin-card-monthly-uncollected) must appear after Card 1');
    assert.ok(idxCard3 > idxCard2, 'Card 3 (admin-card-daily-total) must appear after Card 2');
    assert.ok(idxCard4 > idxCard3, 'Card 4 (admin-card-daily-uncollected) must appear after Card 3');

    // Verify labels & full VND formatting helper
    assert.ok(content.includes('Tổng tháng'), 'Card 1 must display label "Tổng tháng"');
    assert.ok(content.includes('Công nợ chưa thu ở tháng'), 'Card 2 must display label "Công nợ chưa thu ở tháng"');
    assert.ok(content.includes('Tổng ngày đã chọn'), 'Card 3 must display label "Tổng ngày đã chọn"');
    assert.ok(content.includes('Công nợ chưa thu theo ngày'), 'Card 4 must display label "Công nợ chưa thu theo ngày"');

    assert.ok(content.includes('formatVND(monthlyTotalRevenue)'), 'Card 1 must format monthlyTotalRevenue with formatVND');
    assert.ok(content.includes('formatVND(monthlyCollectedAmount)'), 'Card 1 sub-line must format monthlyCollectedAmount with formatVND');
    assert.ok(content.includes('formatVND(monthlyUncollectedAmount)'), 'Card 2 must format monthlyUncollectedAmount with formatVND');
    assert.ok(content.includes('formatVND(selectedDateTotalRevenue)'), 'Card 3 must format selectedDateTotalRevenue with formatVND');
    assert.ok(content.includes('formatVND(selectedDateCollectedAmount)'), 'Card 3 sub-line must format selectedDateCollectedAmount with formatVND');
    assert.ok(content.includes('formatVND(selectedDateUncollectedAmount)'), 'Card 4 must format selectedDateUncollectedAmount with formatVND');

    // Verify lower sections remain 100% intact
    assert.ok(
      content.includes('CHỈ SỐ ĐIỀU HÀNH CA LÀM VIỆC (OPERATIONAL METRICS)'),
      'Lower section Operational Metrics must remain intact'
    );
    assert.ok(
      content.includes('<ActionableTasksCenter'),
      'Lower section ActionableTasksCenter must remain intact'
    );
    assert.ok(
      content.includes('<StaffPerformanceWidget'),
      'Lower section StaffPerformanceWidget must remain intact'
    );
    assert.ok(
      content.includes('Không gian Kỹ thuật - Máy chưa xong chi tiết'),
      'Lower section Unfinished Tech Orders must remain intact'
    );
  });

  test('Task 2.3: DashboardPage (/dashboard) implements Customer Revenue & Debt Drill-Down Modal with reconciliation summary, filter tabs, sortable columns, and quick actions', () => {
    const dashboardPath = path.join(webRoot, 'app/dashboard/page.tsx');
    const content = fs.readFileSync(dashboardPath, 'utf-8');

    // Modal container and period switchers
    assert.ok(
      content.includes('data-testid="revenue-debt-drilldown-modal"'),
      'Must render revenue-debt-drilldown-modal container'
    );
    assert.ok(
      content.includes('data-testid="drilldown-period-month"') &&
        content.includes('data-testid="drilldown-period-day"'),
      'Must render period switch buttons for Month and Selected Day'
    );

    // Tier 1: 3-box cashflow reconciliation
    assert.ok(
      content.includes('Tổng phát sinh (Máy đã xong)') &&
        content.includes('Thực thu (Đã thanh toán)') &&
        content.includes('Công nợ chưa thu'),
      'Must render 3-box cashflow summary in Tier 1'
    );

    // Tier 2: Filter tabs & search input
    assert.ok(
      content.includes('data-testid="drilldown-tab-all"') &&
        content.includes('data-testid="drilldown-tab-collected"') &&
        content.includes('data-testid="drilldown-tab-uncollected"'),
      'Must render All, Collected, and Uncollected filter tabs'
    );
    assert.ok(
      content.includes('data-testid="drilldown-search-input"'),
      'Must render customer/order search input'
    );

    // Tier 3: Sortable table headers and quick actions
    const sortHeaders = [
      'drilldown-sort-customer',
      'drilldown-sort-order',
      'drilldown-sort-total',
      'drilldown-sort-collected',
      'drilldown-sort-uncollected',
    ];
    for (const testId of sortHeaders) {
      assert.ok(
        content.includes(`data-testid="${testId}"`),
        `Must include sortable column header ${testId}`
      );
    }

    assert.ok(
      content.includes('Thu tiền') && content.includes('Hồ sơ khách'),
      'Must provide quick action buttons for Thu tiền and Hồ sơ khách'
    );
  });
});
