import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const kpiControllerPath = path.resolve(__dirname, '../../api/app/Http/Controllers/Api/V1/KpiController.php');
const warrantyControllerPath = path.resolve(__dirname, '../../api/app/Http/Controllers/Api/V1/WarrantyController.php');
const apiRoutesPath = path.resolve(__dirname, '../../api/routes/api.php');
const typesKpiPath = path.resolve(__dirname, '../../../packages/types/src/kpi.ts');
const typesWarrantyPath = path.resolve(__dirname, '../../../packages/types/src/warranty.ts');
const typesIndexPath = path.resolve(__dirname, '../../../packages/types/src/index.ts');
const apiClientKpiPath = path.resolve(__dirname, '../../../packages/api-client/src/services/kpi.service.ts');
const apiClientWarrantyPath = path.resolve(__dirname, '../../../packages/api-client/src/services/warranty.service.ts');
const dashboardPagePath = path.resolve(__dirname, '../app/dashboard/page.tsx');
const warrantyPagePath = path.resolve(__dirname, '../app/warranty/page.tsx');

test('OpenSpec: Revenue Reconciliation & Warranty History', async (t) => {
  await t.test('1. Backend: KPI daily revenue & operational reconciliation', () => {
    assert.ok(fs.existsSync(kpiControllerPath), 'KpiController.php must exist');
    const kpiContent = fs.readFileSync(kpiControllerPath, 'utf-8');

    assert.ok(
      kpiContent.includes('$dailyRevenue') && kpiContent.includes('daily_revenue_formatted'),
      'KpiController must calculate dailyRevenue and daily_revenue_formatted'
    );
    assert.ok(
      kpiContent.includes('$reconciliation') &&
      kpiContent.includes('handed_over_count') &&
      kpiContent.includes('ready_for_pickup_count') &&
      kpiContent.includes('in_workshop_count'),
      'KpiController must calculate reconciliation with handed_over, ready_for_pickup, and in_workshop'
    );
  });

  await t.test('2. Backend: Warranty customer phone search, serial filter & medical history', () => {
    assert.ok(fs.existsSync(warrantyControllerPath), 'WarrantyController.php must exist');
    const warrantyContent = fs.readFileSync(warrantyControllerPath, 'utf-8');

    assert.ok(
      warrantyContent.includes("whereHas('customer'") && warrantyContent.includes('$phone'),
      'WarrantyController must support phone filtering via customer relation'
    );
    assert.ok(
      warrantyContent.includes("whereHas('repairOrder'") && warrantyContent.includes('$serial'),
      'WarrantyController must support serial number filtering via repairOrder relation'
    );
    assert.ok(
      warrantyContent.includes('public function history(Request $request)'),
      'WarrantyController must expose history method for device medical records'
    );
    assert.ok(
      warrantyContent.includes('issue_description') &&
      warrantyContent.includes('appearance_notes') &&
      warrantyContent.includes('repair_note') &&
      warrantyContent.includes('technician_name') &&
      warrantyContent.includes('parts_used_summary') &&
      warrantyContent.includes('qc_result'),
      'WarrantyController history must return complete technical repair details'
    );

    assert.ok(fs.existsSync(apiRoutesPath), 'api.php routes file must exist');
    const routesContent = fs.readFileSync(apiRoutesPath, 'utf-8');
    assert.ok(
      routesContent.includes('/warranties/history'),
      'api.php must register GET /warranties/history route'
    );
  });

  await t.test('3. Shared Types & Api-Client: KPI & Warranty expansion', () => {
    assert.ok(fs.existsSync(typesKpiPath), 'packages/types/src/kpi.ts must exist');
    const typesKpi = fs.readFileSync(typesKpiPath, 'utf-8');
    assert.ok(typesKpi.includes('export interface OperationalReconciliation'), 'Must export OperationalReconciliation interface');
    assert.ok(typesKpi.includes('daily_revenue'), 'Must define daily_revenue');

    assert.ok(fs.existsSync(typesWarrantyPath), 'packages/types/src/warranty.ts must exist');
    const typesWarranty = fs.readFileSync(typesWarrantyPath, 'utf-8');
    assert.ok(typesWarranty.includes('export interface DeviceRepairHistoryItem'), 'Must export DeviceRepairHistoryItem');
    assert.ok(typesWarranty.includes('export interface DeviceHistoryResponse'), 'Must export DeviceHistoryResponse');

    const typesIndex = fs.readFileSync(typesIndexPath, 'utf-8');
    assert.ok(typesIndex.includes("export * from './kpi';") && typesIndex.includes("export * from './warranty';"), 'index.ts must re-export kpi and warranty');

    const apiClientKpi = fs.readFileSync(apiClientKpiPath, 'utf-8');
    assert.ok(apiClientKpi.includes('daily_revenue?: number;') && apiClientKpi.includes('reconciliation?:'), 'kpi.service.ts must include daily_revenue and reconciliation');

    const apiClientWarranty = fs.readFileSync(apiClientWarrantyPath, 'utf-8');
    assert.ok(apiClientWarranty.includes('getDeviceHistory('), 'warranty.service.ts must have getDeviceHistory method');
    assert.ok(apiClientWarranty.includes('phone?: string;'), 'warranty.service.ts must accept phone param');
  });

  await t.test('4. Frontend: Admin Dashboard daily revenue StatCard and reconciliation widget', () => {
    assert.ok(fs.existsSync(dashboardPagePath), 'dashboard/page.tsx must exist');
    const dashboardContent = fs.readFileSync(dashboardPagePath, 'utf-8');

    // StatCard Doanh thu hôm nay
    assert.ok(
      dashboardContent.includes('label="Doanh thu hôm nay"') &&
      dashboardContent.includes('value={dailyRevenueDisplay}'),
      'Admin Dashboard must display StatCard for Doanh thu hôm nay'
    );

    // Khối Đối chiếu vận hành & dòng tiền
    assert.ok(
      dashboardContent.includes('Đối chiếu máy khách đã lấy vs chưa lấy'),
      'Admin Dashboard must render title for operational reconciliation'
    );
    assert.ok(
      dashboardContent.includes('Máy khách đã lấy (Đã bàn giao)') &&
      dashboardContent.includes('reconciliation.handed_over_count') &&
      dashboardContent.includes('reconciliation.handed_over_revenue_formatted'),
      'Column 1 must display handed over count and revenue'
    );
    assert.ok(
      dashboardContent.includes('Máy khách chưa lấy (Tại cửa hàng)') &&
      dashboardContent.includes('Đã sửa xong chờ lấy') &&
      dashboardContent.includes('reconciliation.ready_for_pickup_count') &&
      dashboardContent.includes('reconciliation.ready_for_pickup_amount_formatted') &&
      dashboardContent.includes('Đang sửa trong xưởng') &&
      dashboardContent.includes('reconciliation.in_workshop_count') &&
      dashboardContent.includes('reconciliation.in_workshop_amount_formatted'),
      'Column 2 must display waiting for pickup amount and in workshop amount'
    );
  });

  await t.test('5. Frontend: Warranty page phone search and medical history drawer', () => {
    assert.ok(fs.existsSync(warrantyPagePath), 'warranty/page.tsx must exist');
    const warrantyContent = fs.readFileSync(warrantyPagePath, 'utf-8');

    assert.ok(
      warrantyContent.includes('Nhập Số điện thoại khách hàng, Số Serial hoặc Mã BH...'),
      'Search input must display comprehensive placeholder'
    );
    assert.ok(
      warrantyContent.includes('Xem bệnh án máy'),
      'Warranty table must include button to view device medical history'
    );
    assert.ok(
      warrantyContent.includes('Hồ sơ bệnh án & Lịch sử sửa chữa') &&
      warrantyContent.includes('Chi tiết lần sửa trước đó') &&
      warrantyContent.includes('Toàn bộ lịch sử các lần sửa chữa của khách / thiết bị này'),
      'Warranty page must include medical history drawer with previous repair details and customer timeline'
    );
    assert.ok(
      warrantyContent.includes('Tạo đơn bảo hành / Sửa lại') &&
      warrantyContent.includes('In lại phiếu bảo hành'),
      'Drawer must offer quick actions for re-repair and warranty slip reprint'
    );
  });
});
