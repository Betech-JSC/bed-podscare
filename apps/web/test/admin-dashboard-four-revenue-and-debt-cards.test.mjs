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
      'monthly_completed_orders_count?: number;',
      'monthly_uncollected_orders_count?: number;',
      'monthly_orders_breakdown?: RevenueOrderBreakdownItem[];',
      'selected_date_collected_amount?: number;',
      'selected_date_uncollected_amount?: number;',
      'selected_date_completed_orders_count?: number;',
      'selected_date_uncollected_orders_count?: number;',
      'selected_date_orders_breakdown?: RevenueOrderBreakdownItem[];',
    ];

    for (const field of requiredFields) {
      assert.ok(content.includes(field), `kpi.ts must include field: ${field}`);
    }
  });

  test('Task 2.2: DashboardPage (/dashboard) renders the exact 4 top financial cards in order with synchronized completed/waiting-pickup counts and status-aware fallback', () => {
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

    // Verify synchronized sub-lines on Cards 1-4
    assert.ok(
      content.includes('Thực thu: {formatVND(monthlyCollectedAmount)} · {monthlyCompletedCount} đơn hoàn tất ({selectedMonthLabel})'),
      'Card 1 sub-line must display monthlyCompletedCount đơn hoàn tất'
    );
    assert.ok(
      content.includes('{monthlyUncollectedCount} đơn chờ khách nhận ({selectedMonthLabel})'),
      'Card 2 sub-line must display monthlyUncollectedCount đơn chờ khách nhận'
    );
    assert.ok(
      content.includes('Thực thu: {formatVND(selectedDateCollectedAmount)} · {selectedDateCompletedCount} đơn hoàn tất'),
      'Card 3 sub-line must display selectedDateCompletedCount đơn hoàn tất matching the date badge'
    );
    assert.ok(
      content.includes('{selectedDateUncollectedCount} đơn chờ khách nhận ngày {selectedDateDisplay}'),
      'Card 4 sub-line must display selectedDateUncollectedCount đơn chờ khách nhận ngày {selectedDateDisplay}'
    );

    // Verify status-aware toBreakdownItem fallback sets uncollectedAmount = 0 for completed orders
    assert.ok(
      content.includes("if (code === 'completed' || o.status === 'Hoàn tất')") &&
        content.includes('uncollectedAmount = 0;') &&
        content.includes('totalPrice = collectedAmount;'),
      'toBreakdownItem must treat completed orders as settled with uncollectedAmount = 0 and totalPrice = collectedAmount'
    );

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

    // Synchronized badge label in Tier 1 box 3
    assert.ok(
      content.includes('{periodUncollectedCount} đơn chờ khách nhận') &&
        !content.includes('{periodUncollectedCount} đơn chưa thu đủ'),
      'Tier 1 box 3 badge in drilldown modal must display "{periodUncollectedCount} đơn chờ khách nhận"'
    );

    // Status-aware collected and uncollected tab & filter matching (including 0đ warranty orders)
    assert.ok(
      content.includes("normalizeStatusCode(item.status) === 'completed'") &&
        content.includes("(normalizeStatusCode(item.status) !== 'completed' && item.status !== 'Hoàn tất') ||"),
      'Drilldown modal filter and uncollected counts must include completed (incl. 0đ warranty) in collected and waiting-pickup (incl. 0đ warranty) in uncollected'
    );
    assert.ok(
      content.includes("normalizeStatusCode(i.status) === 'completed'") &&
        content.includes("(normalizeStatusCode(i.status) !== 'completed' && i.status !== 'Hoàn tất') ||"),
      'Drilldown modal tab counters must include completed (incl. 0đ warranty) in collected and waiting-pickup (incl. 0đ warranty) in uncollected'
    );
  });

  test('Task 3.1 & 3.2 (GMT+7 & Daily Order Filter): DashboardPage uses Asia/Ho_Chi_Minh timezone for date initialization and extractIsoDate, and prioritizes qc_passed_at / repair_completed_at / PC order code / createdAt for waiting-pickup fallback', () => {
    const dashboardPath = path.join(webRoot, 'app/dashboard/page.tsx');
    const content = fs.readFileSync(dashboardPath, 'utf-8');

    assert.ok(
      content.includes("const formatDateInGmt7 = (date: Date): string =>") &&
        content.includes("new Intl.DateTimeFormat('en-CA'") &&
        content.includes("timeZone: 'Asia/Ho_Chi_Minh'"),
      'DashboardPage must define formatDateInGmt7 using Intl.DateTimeFormat en-CA with Asia/Ho_Chi_Minh timezone'
    );

    assert.ok(
      content.includes('const todayStr = React.useMemo(() => formatDateInGmt7(new Date()), []);') &&
        content.includes('const [selectedDate, setSelectedDate] = useState<string>(() => formatDateInGmt7(new Date()));'),
      'todayStr and selectedDate must initialize using formatDateInGmt7'
    );

    assert.ok(
      content.includes('/^\\d{4}-\\d{2}-\\d{2}$/.test(s)') &&
        content.includes('return formatDateInGmt7(parsed);'),
      'extractIsoDate must only slice pure YYYY-MM-DD strings and format ISO timestamps with formatDateInGmt7'
    );

    assert.ok(
      content.includes('/^PC.*?(\\d{2})(\\d{2})(\\d{2})\\d{2,}$/') &&
        content.includes('? (o as any).qc_passed_at ||') &&
        content.includes('(o as any).repair_completed_at ||') &&
        content.includes('pcCodeDate ||'),
      'toBreakdownItem must prioritize qc_passed_at, repair_completed_at, PC...DDMMYY.. order code date, or createdAt over updated_at for waiting-pickup orders'
    );
  });

  test('Task 3.1 & 3.2: Technician views (/tech, renderTechDashboard, TechOrderDetailModal, /repairs) hide all price figures', () => {
    const techPagePath = path.join(webRoot, 'app/tech/page.tsx');
    const techModalPath = path.join(webRoot, 'app/components/TechOrderDetailModal.tsx');
    const dashboardPath = path.join(webRoot, 'app/dashboard/page.tsx');
    const repairsPath = path.join(webRoot, 'app/repairs/page.tsx');

    const techPageContent = fs.readFileSync(techPagePath, 'utf-8');
    const techModalContent = fs.readFileSync(techModalPath, 'utf-8');
    const dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');
    const repairsContent = fs.readFileSync(repairsPath, 'utf-8');

    // 1. /tech page must not render Báo giá: or Chi phí: or moneyFormatted(order.price)
    assert.ok(!techPageContent.includes('Báo giá:'), 'tech/page.tsx must not display "Báo giá:"');
    assert.ok(!techPageContent.includes('Chi phí:'), 'tech/page.tsx must not display "Chi phí:"');
    assert.ok(!techPageContent.includes('moneyFormatted(order.price)'), 'tech/page.tsx must not format order.price');

    // 2. renderTechDashboard in dashboard/page.tsx must not render Báo giá: or Chi phí:
    const techDashboardSlice = dashboardContent.slice(dashboardContent.indexOf('const renderTechDashboard'));
    assert.ok(!techDashboardSlice.includes('Báo giá:'), 'renderTechDashboard must not display "Báo giá:"');
    assert.ok(!techDashboardSlice.includes('Chi phí:'), 'renderTechDashboard must not display "Chi phí:"');
    assert.ok(!techDashboardSlice.includes('moneyFormatted(order.price)'), 'renderTechDashboard must not format order.price');

    // 3. TechOrderDetailModal must not render Báo giá tiếp nhận, Đã thu/báo giá, BẢO HÀNH (0 ₫), or Chi phí khách: 0 ₫
    assert.ok(!techModalContent.includes('Báo giá tiếp nhận'), 'TechOrderDetailModal must not display "Báo giá tiếp nhận"');
    assert.ok(!techModalContent.includes('Đã thu/báo giá'), 'TechOrderDetailModal must not display "Đã thu/báo giá"');
    assert.ok(!techModalContent.includes('BẢO HÀNH (0 ₫)'), 'TechOrderDetailModal must not display "BẢO HÀNH (0 ₫)"');
    assert.ok(!techModalContent.includes('Chi phí khách: 0 ₫'), 'TechOrderDetailModal must not display "Chi phí khách: 0 ₫"');
    assert.ok(!techModalContent.includes('moneyFormatted('), 'TechOrderDetailModal must not call moneyFormatted');

    // 4. repairs/page.tsx must guard Chi phí column and modal pricing blocks with !isTechRole
    assert.ok(repairsContent.includes('const isTechRole ='), 'repairs/page.tsx must define isTechRole');
    assert.ok(repairsContent.includes('{!isTechRole && <th className="px-4">Chi phí</th>}'), 'repairs/page.tsx must hide Chi phí header for tech role');
  });
});
