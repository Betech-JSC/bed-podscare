import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRevenueExcelWorkbook,
  formatOrderStatusForReport,
} from '../app/dashboard/utils/revenueExcelExport.ts';

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

  const readDashboardAll = () => {
    const dashboardPath = path.join(webRoot, 'app/dashboard/page.tsx');
    const compDir = path.join(webRoot, 'app/dashboard/components');
    const utilsDir = path.join(webRoot, 'app/dashboard/utils');
    const compFiles = fs.existsSync(compDir)
      ? fs.readdirSync(compDir).filter((f) => f.endsWith('.tsx')).map((f) => fs.readFileSync(path.join(compDir, f), 'utf-8'))
      : [];
    const utilFiles = fs.existsSync(utilsDir)
      ? fs.readdirSync(utilsDir).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(path.join(utilsDir, f), 'utf-8'))
      : [];
    return [fs.readFileSync(dashboardPath, 'utf-8'), ...compFiles, ...utilFiles].join('\n');
  };

  const readRepairsAll = () => {
    const repairsPath = path.join(webRoot, 'app/repairs/page.tsx');
    const compDir = path.join(webRoot, 'app/repairs/components');
    const compFiles = fs.existsSync(compDir)
      ? fs.readdirSync(compDir).filter((f) => f.endsWith('.tsx')).map((f) => fs.readFileSync(path.join(compDir, f), 'utf-8'))
      : [];
    return [fs.readFileSync(repairsPath, 'utf-8'), ...compFiles].join('\n');
  };

  test('Task 2.2: DashboardPage (/dashboard) renders the exact 4 top financial cards in order with synchronized completed/waiting-pickup counts and status-aware fallback', () => {
    const dashboardPath = path.join(webRoot, 'app/dashboard/page.tsx');
    assert.ok(fs.existsSync(dashboardPath), 'apps/web/app/dashboard/page.tsx must exist');

    const content = readDashboardAll();

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
      content.includes(
        'Thực thu: {formatVND(monthlyCollectedAmount)} · {monthlyCompletedCount} đơn hoàn tất · Chờ thu: {formatVND(monthlyUncollectedAmount)} ({monthlyUncollectedCount} đơn chờ lấy) ({selectedMonthLabel})'
      ),
      'Card 1 sub-line must display explicit formula: Thực thu + Chờ thu'
    );
    assert.ok(
      content.includes('{monthlyUncollectedCount} đơn chờ khách nhận ({selectedMonthLabel})'),
      'Card 2 sub-line must display monthlyUncollectedCount đơn chờ khách nhận'
    );
    assert.ok(
      content.includes(
        'Thực thu: {formatVND(selectedDateCollectedAmount)} · {selectedDateCompletedCount} đơn hoàn tất · Chờ thu: {formatVND(selectedDateUncollectedAmount)} ({selectedDateUncollectedCount} đơn chờ lấy)'
      ),
      'Card 3 sub-line must display explicit formula: Thực thu + Chờ thu matching the date badge'
    );
    assert.ok(
      content.includes('{selectedDateUncollectedCount} đơn chờ khách nhận ngày {selectedDateDisplay}'),
      'Card 4 sub-line must display selectedDateUncollectedCount đơn chờ khách nhận ngày {selectedDateDisplay}'
    );

    // Verify Single Source of Truth: no frontend fallback breakdown calculation
    assert.ok(
      !content.includes('fallbackMonthlyBreakdown') &&
        !content.includes('fallbackDailyBreakdown') &&
        content.includes('kpiData?.monthly_orders_breakdown') &&
        content.includes('kpiData?.selected_date_orders_breakdown'),
      'DashboardPage must read monthly_orders_breakdown and selected_date_orders_breakdown strictly from kpiData without frontend fallback'
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
    const content = readDashboardAll();

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

  test('Task 3.1 & 3.2 (GMT+7 & Daily Order Filter): DashboardPage uses Asia/Ho_Chi_Minh timezone for date initialization and queries kpi-dashboard directly', () => {
    const content = readDashboardAll();

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
      content.includes("queryKey: ['kpi-dashboard', branchId, period, selectedDate"),
      'DashboardPage must query kpi-dashboard with selectedDate'
    );
  });

  test('Task 3.1 & 3.2: Technician views (/tech, renderTechDashboard, TechOrderDetailModal, /repairs) hide all price figures', () => {
    const techPagePath = path.join(webRoot, 'app/tech/page.tsx');
    const techModalPath = path.join(webRoot, 'app/components/TechOrderDetailModal.tsx');
    const techDashPath = path.join(webRoot, 'app/dashboard/components/TechDashboardView.tsx');

    const techPageContent = fs.readFileSync(techPagePath, 'utf-8');
    const techModalContent = fs.readFileSync(techModalPath, 'utf-8');
    const techDashboardSlice = fs.existsSync(techDashPath)
      ? fs.readFileSync(techDashPath, 'utf-8')
      : readDashboardAll();
    const repairsContent = readRepairsAll();

    // 1. /tech page must not render Báo giá: or Chi phí: or moneyFormatted(order.price)
    assert.ok(!techPageContent.includes('Báo giá:'), 'tech/page.tsx must not display "Báo giá:"');
    assert.ok(!techPageContent.includes('Chi phí:'), 'tech/page.tsx must not display "Chi phí:"');
    assert.ok(!techPageContent.includes('moneyFormatted(order.price)'), 'tech/page.tsx must not format order.price');

    // 2. TechDashboardView must not render Báo giá: or Chi phí:
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

  test('Tasks 3.1, 3.2, 3.3 (admin-self-explanatory-kpi-and-data-normalization): Operational breakdown, Admin Sidebar all-orders scope, Repairs composite filters, and VND price normalization', () => {
    const dashboardContent = readDashboardAll();
    const providersContent = fs.readFileSync(path.join(webRoot, 'app/providers.tsx'), 'utf-8');
    const repairsContent = readRepairsAll();
    const checkoutContent = fs.readFileSync(path.join(webRoot, 'app/components/CheckoutHandoverModal.tsx'), 'utf-8');
    const quotesContent = fs.readFileSync(path.join(webRoot, 'app/quotes/page.tsx'), 'utf-8');
    const adminEditContent = fs.readFileSync(path.join(webRoot, 'app/components/AdminEditOrderModal.tsx'), 'utf-8');

    // Task 3.1: Operational breakdown & reconciliation links
    assert.ok(
      dashboardContent.includes('{inWorkshopCount} đang sửa trong xưởng · {waitingPickupCount} chờ khách nhận'),
      'Active orders card must show inWorkshopCount + waitingPickupCount breakdown'
    );
    assert.ok(
      dashboardContent.includes('Máy đang sửa quá 24h trong xưởng'),
      'Overdue card must state "Máy đang sửa quá 24h trong xưởng"'
    );
    assert.ok(
      dashboardContent.includes("'/repairs?status=open&date_filter=all'") &&
        dashboardContent.includes("'/repairs?status=waiting_pickup&date_filter=all'") &&
        dashboardContent.includes("'/repairs?status=in_workshop&date_filter=all'") &&
        dashboardContent.includes("'/repairs?filter=overdue&date_filter=all'"),
      'Dashboard cards and reconciliation blocks must link to /repairs with date_filter=all'
    );

    // Task 3.2: Providers Admin scope (per_page: 500, date_filter: all)
    assert.ok(
      (providersContent.includes('per_page: 500') || providersContent.includes('per_page = 500')) &&
        (providersContent.includes("date_filter = 'all'") || providersContent.includes("effectiveDateFilter = (isAdmin ? 'all'")),
      'providers.tsx must set per_page=500 and date_filter=all for Admin'
    );

    // Task 3.3: Repairs composite status mapping & normalizeVndPrice across frontend
    assert.ok(
      repairsContent.includes("open: 'Đơn đang mở'") &&
        repairsContent.includes("in_workshop: 'Đang sửa trong xưởng'") &&
        repairsContent.includes("overdue: 'Trễ thời hạn (>24h)'"),
      'repairs/page.tsx must map open, in_workshop, and overdue status params'
    );
    assert.ok(
      repairsContent.includes('normalizeVndPrice') &&
        checkoutContent.includes('normalizeVndPrice') &&
        quotesContent.includes('normalizeVndPrice') &&
        adminEditContent.includes('normalizeVndPrice'),
      'normalizeVndPrice must be applied in repairs/page.tsx, CheckoutHandoverModal.tsx, quotes/page.tsx, and AdminEditOrderModal.tsx'
    );
  });

  test('OpenSpec: dashboard-remove-fallback-and-add-loading-skeleton (Tasks 1.1, 1.2, 2.1, 2.2): Single Source of Truth kpiData and Loading Skeletons across Dashboard, ActionableTasksCenter, and StaffPerformanceWidget', () => {
    const dashboardContent = readDashboardAll();
    const actionableContent = fs.readFileSync(
      path.join(webRoot, 'app/dashboard/components/ActionableTasksCenter.tsx'),
      'utf-8'
    );
    const staffContent = fs.readFileSync(
      path.join(webRoot, 'app/dashboard/components/StaffPerformanceWidget.tsx'),
      'utf-8'
    );

    // Task 1.1: Remove fallbackMonthlyBreakdown & fallbackDailyBreakdown
    assert.ok(
      !dashboardContent.includes('fallbackMonthlyBreakdown') &&
        !dashboardContent.includes('fallbackDailyBreakdown'),
      'dashboard/page.tsx must not contain fallbackMonthlyBreakdown or fallbackDailyBreakdown'
    );

    // Task 1.2: Loading skeletons on DashboardPage
    assert.ok(
      dashboardContent.includes('isLoading: isLoadingKpi') &&
        dashboardContent.includes('isFetching: isFetchingKpi') &&
        dashboardContent.includes('const isKpiLoading = isLoadingKpi || isFetchingKpi;'),
      'dashboard/page.tsx must derive isKpiLoading = isLoadingKpi || isFetchingKpi from useQuery'
    );
    assert.ok(
      dashboardContent.includes('data-testid="kpi-card-loading-skeleton"') &&
        dashboardContent.includes('animate-pulse'),
      'dashboard/page.tsx must render kpi-card-loading-skeleton with animate-pulse when isKpiLoading is true'
    );

    // Task 2.1: Loading skeletons on ActionableTasksCenter
    assert.ok(
      dashboardContent.includes('isLoading={isKpiLoading}') &&
        actionableContent.includes('isLoading?: boolean;') &&
        actionableContent.includes('data-testid="actionable-tasks-loading-skeleton"') &&
        actionableContent.includes('animate-pulse'),
      'ActionableTasksCenter.tsx must accept isLoading and render actionable-tasks-loading-skeleton with animate-pulse'
    );

    // Task 2.2: Loading skeletons on StaffPerformanceWidget
    assert.ok(
      staffContent.includes('const isStaffLoading = isLoading || isFetching;') &&
        staffContent.includes('data-testid="staff-kpi-loading-skeleton"') &&
        staffContent.includes('data-testid="staff-performance-loading-skeleton"') &&
        staffContent.includes('animate-pulse'),
      'StaffPerformanceWidget.tsx must use isStaffLoading = isLoading || isFetching and render staff-kpi-loading-skeleton / staff-performance-loading-skeleton with animate-pulse'
    );
  });

  test('OpenSpec: sync-admin-repairs-counts-and-fix-empty-date-fallback (Tasks 2.1, 2.2, 2.3, 3.1, 3.2, 3.3): ActionableTasks.counts, Sidebar repairsCount, Repairs empty date zero-fallback, persistent 5-tab counts, and Admin status reconciliation bar', () => {
    const kpiTypesContent = fs.readFileSync(path.join(repoRoot, 'packages/types/src/kpi.ts'), 'utf-8');
    const appShellContent = fs.readFileSync(path.join(webRoot, 'app/components/AppShell.tsx'), 'utf-8');
    const actionableContent = fs.readFileSync(
      path.join(webRoot, 'app/dashboard/components/ActionableTasksCenter.tsx'),
      'utf-8'
    );
    const repairsContent = readRepairsAll();

    // Task 2.1: ActionableTasks.counts in packages/types/src/kpi.ts
    assert.ok(
      kpiTypesContent.includes('counts?: {') &&
        kpiTypesContent.includes('overdue: number;') &&
        kpiTypesContent.includes('waiting_qc: number;') &&
        kpiTypesContent.includes('waiting_pickup: number;') &&
        kpiTypesContent.includes('total: number;'),
      'packages/types/src/kpi.ts must include optional counts object on ActionableTasks'
    );

    // Task 2.2: Sidebar repairsCount excludes all 3 terminal statuses ['Hoàn tất', 'Đã hủy', 'Từ chối sửa']
    assert.ok(
      appShellContent.includes(
        "const repairsCount = orders.filter((o) => !['Hoàn tất', 'Đã hủy', 'Từ chối sửa'].includes(o.status)).length;"
      ),
      'AppShell.tsx must exclude Hoàn tất, Đã hủy, and Từ chối sửa in repairsCount'
    );

    // Task 2.3: ActionableTasksCenter reads counts from actionableTasks?.counts with fallback to array length
    assert.ok(
      actionableContent.includes('const overdueCount = actionableTasks?.counts?.overdue ?? overdueList.length;') &&
        actionableContent.includes('const qcCount = actionableTasks?.counts?.waiting_qc ?? qcList.length;') &&
        actionableContent.includes('const pickupCount = actionableTasks?.counts?.waiting_pickup ?? pickupList.length;') &&
        actionableContent.includes('actionableTasks?.counts?.total ??'),
      'ActionableTasksCenter.tsx must prioritize actionableTasks?.counts for tab and header badge counts'
    );

    // Task 3.1: Zero fallback to global orders when API returns 0 orders on /repairs & isRepairsLoading
    assert.ok(
      !repairsContent.includes('const list = Array.isArray(raw) ? raw : (orders || []);') &&
        !repairsContent.includes('if (list.length === 0 && !search && !statusFilter) {\n      list = orders;\n    }'),
      'repairs/page.tsx must not fallback to global orders in orderCounts or filteredOrders'
    );
    assert.ok(
      repairsContent.includes('const isRepairsLoading = isLoading || isFetching;') &&
        repairsContent.includes(') : isRepairsLoading ? ('),
      'repairs/page.tsx must define and use isRepairsLoading = isLoading || isFetching for TableSkeleton'
    );

    // Task 3.2: Separate orderTypeFilter from useQuery API params and compute orderCounts from statusFilteredOrders (baseFilteredByStatus)
    assert.ok(
      repairsContent.includes('const baseFilteredByStatus: RepairOrder[] = useMemo(') &&
        repairsContent.includes('const statusFilteredOrders = baseFilteredByStatus;') &&
        repairsContent.includes('statusFilteredOrders.forEach((o: any) => {'),
      'repairs/page.tsx must compute orderCounts from statusFilteredOrders (baseFilteredByStatus) so 5 tab counts stay persistent when switching tabs'
    );

    // Task 3.3: Admin Status Reconciliation Bar on /repairs
    assert.ok(
      repairsContent.includes('const statusReconciliationCounts = useMemo(') &&
        repairsContent.includes('data-testid="admin-repairs-status-reconciliation-bar"') &&
        repairsContent.includes('data-testid="status-pill-all"') &&
        repairsContent.includes('data-testid="status-pill-open"') &&
        repairsContent.includes('data-testid="status-pill-in-workshop"') &&
        repairsContent.includes('data-testid="status-pill-waiting-pickup"') &&
        repairsContent.includes('data-testid="status-pill-completed"'),
      'repairs/page.tsx must render admin-repairs-status-reconciliation-bar with all 5 status reconciliation pills for Admin'
    );
  });

  test('OpenSpec: intake-date-revenue-and-excel-export (Tasks 2.1, 2.2, 2.3, 2.4): Date range filter (from_date -> to_date), all active statuses support, and Excel report export with STT, Họ tên, Mã máy, Tiền, and TỔNG TIỀN footer', () => {
    const kpiTypesContent = fs.readFileSync(path.join(repoRoot, 'packages/types/src/kpi.ts'), 'utf-8');
    const kpiServiceContent = fs.readFileSync(
      path.join(repoRoot, 'packages/api-client/src/services/kpi.service.ts'),
      'utf-8'
    );
    const dashboardContent = readDashboardAll();

    // Task 2.1: Types & API client support from_date, to_date, created_at
    assert.ok(
      kpiTypesContent.includes('from_date?: string;') &&
        kpiTypesContent.includes('to_date?: string;') &&
        kpiTypesContent.includes('created_at?: string | null;'),
      'packages/types/src/kpi.ts must include from_date, to_date, and created_at'
    );
    assert.ok(
      kpiServiceContent.includes('from_date?: string;') &&
        kpiServiceContent.includes('to_date?: string;'),
      'packages/api-client/src/services/kpi.service.ts getDashboardKpi must accept from_date and to_date'
    );

    // Task 2.2: Date range filter inputs on AdminDashboardView & RevenueDrilldownModal and API query params
    assert.ok(
      dashboardContent.includes('data-testid="dashboard-from-date-input"') &&
        dashboardContent.includes('data-testid="dashboard-to-date-input"') &&
        dashboardContent.includes('data-testid="drilldown-from-date-input"') &&
        dashboardContent.includes('data-testid="drilldown-to-date-input"'),
      'AdminDashboardView and RevenueDrilldownModal must render Từ ngày (fromDate) and Đến ngày (toDate) inputs'
    );
    assert.ok(
      dashboardContent.includes('from_date: fromDate') &&
        dashboardContent.includes('to_date: toDate'),
      'DashboardPage must pass from_date and to_date to kpiService.getDashboardKpi'
    );

    // Task 2.3: Export Excel buttons on AdminDashboardView and RevenueDrilldownModal
    assert.ok(
      dashboardContent.includes('data-testid="admin-export-excel-btn"') &&
        dashboardContent.includes('data-testid="drilldown-export-excel-btn"') &&
        dashboardContent.includes('Xuất Excel'),
      'AdminDashboardView and RevenueDrilldownModal must provide Excel export buttons'
    );

    // Runtime verification of buildRevenueExcelWorkbook & formatOrderStatusForReport
    assert.equal(formatOrderStatusForReport('inspecting'), 'Đang kiểm tra');
    assert.equal(formatOrderStatusForReport('in_repair'), 'Đang sửa chữa');
    assert.equal(formatOrderStatusForReport('completed'), 'Đã giao máy');

    const sampleOrders = [
      {
        id: 101,
        order_code: 'RO-261022-001',
        customer_name: 'Nguyễn Văn An',
        customer_phone: '0901234567',
        device_name: 'AirPods Pro 2',
        status: 'inspecting',
        total_price: 400000,
        collected_amount: 0,
        uncollected_amount: 400000,
        created_at: '2026-10-22T09:15:00+07:00',
      },
      {
        id: 102,
        order_code: 'RO-261022-002',
        customer_name: 'Trần Thị Bình',
        customer_phone: '0909888777',
        device_name: 'AirPods 3',
        status: 'in_repair',
        total_price: 600000,
        collected_amount: 200000,
        uncollected_amount: 400000,
        created_at: '2026-10-22T11:30:00+07:00',
      },
      {
        id: 103,
        order_code: 'RO-261022-003',
        customer_name: 'Lê Hoàng Cường',
        customer_phone: '0912333444',
        device_name: 'AirPods Max',
        status: 'completed',
        total_price: 500000,
        collected_amount: 500000,
        uncollected_amount: 0,
        created_at: '2026-10-22T15:45:00+07:00',
      },
    ];

    const workbook = buildRevenueExcelWorkbook({
      items: sampleOrders,
      periodLabel: '22/10/2026',
      fromDate: '2026-10-22',
      toDate: '2026-10-22',
      branchName: 'Chi nhánh Quận 1',
    });

    assert.equal(workbook.rowCount, 3, 'Workbook must contain 3 rows');
    assert.equal(workbook.totalAmount, 1500000, 'Workbook totalAmount must equal 1,500,000');
    assert.equal(
      workbook.fileName,
      'bao-cao-doanh-thu-podscare-2026-10-22.xls',
      'Workbook file name must reflect selected date'
    );
    assert.ok(workbook.content.startsWith('\uFEFF'), 'Workbook content must start with UTF-8 BOM');
    assert.ok(workbook.content.includes('>STT<'), 'Workbook must contain column STT');
    assert.ok(workbook.content.includes('>Họ tên<'), 'Workbook must contain column Họ tên');
    assert.ok(workbook.content.includes('>Mã máy<'), 'Workbook must contain column Mã máy');
    assert.ok(workbook.content.includes('>Tiền<'), 'Workbook must contain column Tiền');
    assert.ok(
      workbook.content.includes('RO-261022-001 - AirPods Pro 2'),
      'Workbook must format Mã máy as <order_code> - <device_name>'
    );
    assert.ok(
      workbook.content.includes('TỔNG TIỀN') && workbook.content.includes('data-value="1500000"'),
      'Workbook footer must contain TỔNG TIỀN with exact total sum 1500000'
    );
  });
});


