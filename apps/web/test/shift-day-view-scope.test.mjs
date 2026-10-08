import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const typesOrderPath = path.resolve(__dirname, '../../../packages/types/src/order.ts');
const apiClientRepairPath = path.resolve(__dirname, '../../../packages/api-client/src/services/repair.service.ts');
const repairsPagePath = path.resolve(__dirname, '../app/repairs/page.tsx');
const techPagePath = path.resolve(__dirname, '../app/tech/page.tsx');
const providersPath = path.resolve(__dirname, '../app/providers.tsx');
const orderControllerPath = path.resolve(__dirname, '../../api/app/Http/Controllers/Api/V1/OrderController.php');

test('OpenSpec: Shift-Day View & Role History Scope', async (t) => {
  await t.test('1. Types & Client: OrderDateFilter definition and API parameter', () => {
    assert.ok(fs.existsSync(typesOrderPath), 'packages/types/src/order.ts must exist');
    const typesContent = fs.readFileSync(typesOrderPath, 'utf-8');
    assert.ok(
      typesContent.includes("export type OrderDateFilter = 'today' | 'yesterday' | '7_days' | '30_days' | 'all'"),
      'OrderDateFilter type must be defined with today, yesterday, 7_days, 30_days, all'
    );

    assert.ok(fs.existsSync(apiClientRepairPath), 'repair.service.ts must exist');
    const clientContent = fs.readFileSync(apiClientRepairPath, 'utf-8');
    assert.ok(
      clientContent.includes('date_filter?: OrderDateFilter;'),
      'repairService.getRepairs must accept date_filter parameter'
    );
  });

  await t.test('2. Backend RBAC & Smart Shift Scope in OrderController', () => {
    assert.ok(fs.existsSync(orderControllerPath), 'OrderController.php must exist');
    const backendContent = fs.readFileSync(orderControllerPath, 'utf-8');

    // Default today
    assert.ok(
      backendContent.includes("input('date_filter', 'today')"),
      'OrderController must default date_filter to today'
    );

    // Technician 7 days clamp
    assert.ok(
      backendContent.includes("$isTechnician") && backendContent.includes("'7_days'"),
      'OrderController must clamp technician to 7_days'
    );
    assert.ok(
      backendContent.includes("subDays(7)->startOfDay()"),
      'OrderController must clamp date boundary using subDays(7)->startOfDay()'
    );

    // Strict shift scope: today strictly includes only orders between todayStart and todayEnd
    assert.ok(
      backendContent.includes("whereBetween('created_at', [$todayStart, $todayEnd])"),
      'OrderController must query orders between todayStart and todayEnd'
    );
    assert.ok(
      !backendContent.includes("orWhereNotIn('status'"),
      'OrderController must strictly exclude past unfinished orders from today filter'
    );
  });

  await t.test('3. RepairsPage (/repairs): 5 Date Filter Pills & default today for CSKH/Admin', () => {
    assert.ok(fs.existsSync(repairsPagePath), 'apps/web/app/repairs/page.tsx must exist');
    const repairsContent = fs.readFileSync(repairsPagePath, 'utf-8');

    // Default state today
    assert.ok(
      repairsContent.includes("const [dateFilter, setDateFilter] = useState<OrderDateFilter>('today')"),
      'RepairsPage must initialize dateFilter with today'
    );

    // Connected to useQuery queryKey and params
    assert.ok(
      repairsContent.includes("queryKey: ['repairs', branchId, statusFilter, search, orderTypeFilter, dateFilter]"),
      'useQuery queryKey must include dateFilter'
    );
    assert.ok(
      repairsContent.includes("date_filter: dateFilter"),
      'useQuery queryFn must pass date_filter: dateFilter'
    );

    // 5 Pills present
    assert.ok(repairsContent.includes('data-testid="date-filter-today"'), 'Must have today pill');
    assert.ok(repairsContent.includes('data-testid="date-filter-yesterday"'), 'Must have yesterday pill');
    assert.ok(repairsContent.includes('data-testid="date-filter-7_days"'), 'Must have 7_days pill');
    assert.ok(repairsContent.includes('data-testid="date-filter-30_days"'), 'Must have 30_days pill');
    assert.ok(repairsContent.includes('data-testid="date-filter-all"'), 'Must have all pill');
    assert.ok(
      repairsContent.includes('☀️ Chỉ hiển thị đơn tiếp nhận trong ngày hôm nay'),
      'RepairsPage must display strict today badge'
    );
  });

  await t.test('4. TechPage (/tech): 2 Date Filter Pills & strictly no 30_days/all for Technicians', () => {
    assert.ok(fs.existsSync(techPagePath), 'apps/web/app/tech/page.tsx must exist');
    const techContent = fs.readFileSync(techPagePath, 'utf-8');

    // Default state today
    assert.ok(
      techContent.includes("const [dateFilter, setDateFilter] = useState<'today' | '7_days'>('today')"),
      'TechPage must initialize dateFilter with today'
    );

    // Connected to useQuery queryKey and params
    assert.ok(
      techContent.includes("queryKey: ['tech-orders', branchId, dateFilter]"),
      'TechPage useQuery queryKey must include dateFilter'
    );
    assert.ok(
      techContent.includes("date_filter: dateFilter"),
      'TechPage useQuery queryFn must pass date_filter: dateFilter'
    );

    // Exactly 2 Pills present
    assert.ok(techContent.includes('data-testid="tech-date-filter-today"'), 'Must have today pill in tech queue');
    assert.ok(techContent.includes('data-testid="tech-date-filter-7_days"'), 'Must have 7_days pill in tech queue');

    // Strict RBAC: No 30_days or all pills in TechPage
    assert.ok(!techContent.includes('data-testid="tech-date-filter-30_days"'), 'TechPage MUST NOT have 30_days pill');
    assert.ok(!techContent.includes('data-testid="tech-date-filter-all"'), 'TechPage MUST NOT have all history pill');
  });

  await t.test('5. Providers: default date_filter: today in fetchOrders', () => {
    assert.ok(fs.existsSync(providersPath), 'apps/web/app/providers.tsx must exist');
    const providersContent = fs.readFileSync(providersPath, 'utf-8');

    // fetchOrders passes date_filter: dateFilter with default today
    assert.ok(
      providersContent.includes("date_filter: dateFilter") || providersContent.includes("date_filter: 'today'"),
      'fetchOrders in providers.tsx must include date_filter default today'
    );
    assert.ok(
      providersContent.includes("dateFilter: OrderDateFilter = 'today'"),
      'fetchOrders in providers.tsx must declare dateFilter default today'
    );
  });
});
