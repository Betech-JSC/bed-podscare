import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '../..');

describe('OpenSpec: Staff Performance and Shift Snapshot Frontend Verification', () => {
  test('Task 3.1: Types in @podscare/types contain full Staff KPI & Shift Snapshot interfaces', () => {
    const kpiTypesPath = path.join(repoRoot, 'packages/types/src/kpi.ts');
    const shiftTypesPath = path.join(repoRoot, 'packages/types/src/shift.ts');

    assert.ok(fs.existsSync(kpiTypesPath), 'kpi.ts must exist');
    assert.ok(fs.existsSync(shiftTypesPath), 'shift.ts must exist');

    const kpiContent = fs.readFileSync(kpiTypesPath, 'utf8');
    const shiftContent = fs.readFileSync(shiftTypesPath, 'utf8');

    // KPI Staff interfaces
    assert.ok(kpiContent.includes('export interface TechnicianKpiItem'), 'Must export TechnicianKpiItem');
    assert.ok(kpiContent.includes('export interface CskhKpiItem'), 'Must export CskhKpiItem');
    assert.ok(kpiContent.includes('revenue_generated?: number | null'), 'TechnicianKpiItem must support nullable revenue_generated');
    assert.ok(kpiContent.includes('orders_created_count: number'), 'CskhKpiItem must have orders_created_count');
    assert.ok(kpiContent.includes('orders_completed_count: number'), 'CskhKpiItem must have orders_completed_count');
    assert.ok(kpiContent.includes('conversion_rate: number'), 'CskhKpiItem must have conversion_rate');
    assert.ok(kpiContent.includes('export interface StaffPerformanceData'), 'Must export StaffPerformanceData');

    // Shift Snapshot interfaces
    assert.ok(shiftContent.includes('vietqr_total?: number'), 'WorkShift must contain vietqr_total');
    assert.ok(shiftContent.includes('orders_completed_count?: number'), 'WorkShift must contain orders_completed_count');
    assert.ok(shiftContent.includes('export interface CurrentShiftSnapshot'), 'Must export CurrentShiftSnapshot');
    assert.ok(shiftContent.includes('export interface CurrentShiftResponse'), 'Must export CurrentShiftResponse');
  });

  test('Task 3.1: @podscare/api-client supports getStaffKpi & getCurrentShift with updated signatures', () => {
    const kpiServicePath = path.join(repoRoot, 'packages/api-client/src/services/kpi.service.ts');
    const shiftServicePath = path.join(repoRoot, 'packages/api-client/src/services/shift.service.ts');

    const kpiContent = fs.readFileSync(kpiServicePath, 'utf8');
    const shiftContent = fs.readFileSync(shiftServicePath, 'utf8');

    assert.ok(kpiContent.includes('getStaffKpi('), 'kpiService must have getStaffKpi method');
    assert.ok(kpiContent.includes('StaffPerformanceData'), 'getStaffKpi must return StaffPerformanceData');
    assert.ok(shiftContent.includes('getCurrentShift('), 'shiftService must have getCurrentShift method');
    assert.ok(shiftContent.includes('CurrentShiftResponse'), 'getCurrentShift must return CurrentShiftResponse');
  });

  test('Task 3.2: StaffPerformanceWidget structure & Zero-Trust RBAC Masking verification', () => {
    const widgetPath = path.join(webRoot, 'app/dashboard/components/StaffPerformanceWidget.tsx');
    assert.ok(fs.existsSync(widgetPath), 'StaffPerformanceWidget.tsx must exist');

    const content = fs.readFileSync(widgetPath, 'utf8');

    // Tab switcher
    assert.ok(content.includes('Kỹ thuật viên'), 'Must have Technicians tab');
    assert.ok(content.includes('CSKH / Tiếp nhận'), 'Must have CSKH tab');

    // Columns / Indicators
    assert.ok(content.includes('Đơn phụ trách'), 'Must have assigned orders column');
    assert.ok(content.includes('Đã sửa xong'), 'Must have completed repairs column');
    assert.ok(content.includes('Tỷ lệ QC'), 'Must have QC pass rate column');
    assert.ok(content.includes('Xử lý TB'), 'Must have average processing time column');
    assert.ok(content.includes('Doanh thu tạo ra'), 'Must have revenue generated column');
    assert.ok(content.includes('Đơn tiếp nhận'), 'Must have intake orders column');
    assert.ok(content.includes('Tỷ lệ chốt'), 'Must have conversion rate column');

    // RBAC Masking
    assert.ok(content.includes('••••••'), 'Must render masked bullet placeholder for masked revenue');
    assert.ok(content.includes('lock'), 'Must use lock icon for masked revenue');
    assert.ok(content.includes('Zero-Trust'), 'Must declare Zero-Trust security policy note');

    // Zero-Emoji check
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.ok(!emojiRegex.test(content), 'StaffPerformanceWidget must not contain any emoji');
  });

  test('Task 3.3: ShiftCashbookSnapshot structure & Active/Inactive states verification', () => {
    const widgetPath = path.join(webRoot, 'app/dashboard/components/ShiftCashbookSnapshot.tsx');
    assert.ok(fs.existsSync(widgetPath), 'ShiftCashbookSnapshot.tsx must exist');

    const content = fs.readFileSync(widgetPath, 'utf8');

    // Active shift elements
    assert.ok(content.includes('Đang trong ca'), 'Must display active shift badge');
    assert.ok(content.includes('Tiền mặt trong két'), 'Must display expected cash balance');
    assert.ok(content.includes('VietQR'), 'Must display VietQR payments total');
    assert.ok(content.includes('Vào sổ quỹ / Chốt ca'), 'Must provide CTA button to /shifts');

    // Inactive shift elements
    assert.ok(content.includes('Chưa mở ca'), 'Must display inactive shift badge');
    assert.ok(content.includes('Mở ca làm việc ngay'), 'Must provide CTA button to open shift');

    // Zero-Emoji check
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.ok(!emojiRegex.test(content), 'ShiftCashbookSnapshot must not contain any emoji');
  });

  test('Task 3.4: Dashboard page integrates Area D and Area F seamlessly', () => {
    const dashboardPath = path.join(webRoot, 'app/dashboard/page.tsx');
    const compDir = path.join(webRoot, 'app/dashboard/components');
    const compFiles = fs.existsSync(compDir)
      ? fs.readdirSync(compDir).filter((f) => f.endsWith('.tsx')).map((f) => fs.readFileSync(path.join(compDir, f), 'utf8'))
      : [];
    const content = [fs.readFileSync(dashboardPath, 'utf8'), ...compFiles].join('\n');

    // Imports
    assert.ok(content.includes('StaffPerformanceWidget'), 'Must import StaffPerformanceWidget');
    assert.ok(content.includes('ShiftCashbookSnapshot'), 'Must import ShiftCashbookSnapshot');

    // JSX Integration
    assert.ok(content.includes('<StaffPerformanceWidget'), 'Must render StaffPerformanceWidget');
    assert.ok(content.includes('<ShiftCashbookSnapshot'), 'Must render ShiftCashbookSnapshot');
    assert.ok(content.includes('lg:grid-cols-3'), 'Must be placed in responsive layout grid');
  });
});
