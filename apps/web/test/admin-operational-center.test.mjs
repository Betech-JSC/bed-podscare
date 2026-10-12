import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dashboardPagePath = path.join(__dirname, '../app/dashboard/page.tsx');
const actionCenterPath = path.join(__dirname, '../app/dashboard/components/ActionableTasksCenter.tsx');

describe('OpenSpec: admin-operational-dashboard-and-action-center Verification', () => {
  const dashboardCode = fs.readFileSync(dashboardPagePath, 'utf-8');
  const actionCenterCode = fs.readFileSync(actionCenterPath, 'utf-8');

  test('1. Date Range Presets (Hôm nay, Hôm qua, 7 ngày qua, Tháng này) implemented with Calm Jade tokens', () => {
    assert.match(dashboardCode, /Hôm nay/, 'Contains Hôm nay preset button');
    assert.match(dashboardCode, /Hôm qua/, 'Contains Hôm qua preset button');
    assert.match(dashboardCode, /7 ngày qua/, 'Contains 7 ngày qua preset button');
    assert.match(dashboardCode, /Tháng này/, 'Contains Tháng này preset button');
    assert.match(dashboardCode, /activePreset/, 'Tracks activePreset state');
    assert.match(dashboardCode, /bg-\[#176b58\] text-white font-bold/, 'Active button uses Calm Jade primary token');
    assert.match(dashboardCode, /border-\[#d8e2dc\] hover:bg-\[#f0f4f2\]/, 'Inactive buttons use neutral subtle border');
  });

  test('2. Area B: 4 Operational Metric Cards (Active, Waiting Pickup, Waiting Parts, Overdue) preserved and drill-down supported', () => {
    assert.match(dashboardCode, /Đơn đang mở/, 'Contains Active Orders card');
    assert.match(dashboardCode, /Chờ khách nhận/, 'Contains Waiting Pickup card');
    assert.match(dashboardCode, /Chờ linh kiện/, 'Contains Waiting Parts card');
    assert.match(dashboardCode, /Trễ thời hạn/, 'Contains Overdue Orders card');

    assert.match(dashboardCode, /operational_summary\?\.active_orders/, 'Displays active_orders from API');
    assert.match(dashboardCode, /operational_summary\?\.waiting_pickup_orders/, 'Displays waiting_pickup_orders from API');
    assert.match(dashboardCode, /operational_summary\?\.waiting_parts_orders/, 'Displays waiting_parts_orders from API');
    assert.match(dashboardCode, /operational_summary\?\.overdue_orders/, 'Displays overdue_orders from API');

    assert.match(dashboardCode, /router\.push\('\/repairs\?status=waiting_pickup'\)/, 'Drill-down to waiting_pickup');
    assert.match(dashboardCode, /router\.push\('\/repairs\?status=waiting_parts'\)/, 'Drill-down to waiting_parts');
    assert.match(dashboardCode, /router\.push\('\/repairs\?filter=overdue'\)/, 'Drill-down to overdue');
  });

  test('3. Area C: Actionable Tasks Center with 5 priority workflows and fast actions', () => {
    assert.match(actionCenterCode, /Việc cần xử lý trong ca/, 'Title of Action Center matches spec');
    assert.match(actionCenterCode, /ACTION CENTER · TRUNG TÂM TÁC NGHIỆP/, 'Badge header');

    // 5 workflow tabs
    assert.match(actionCenterCode, /Tất cả/, 'Tab Tất cả');
    assert.match(actionCenterCode, /Quá hạn/, 'Tab Quá hạn');
    assert.match(actionCenterCode, /Chờ duyệt giá/, 'Tab Chờ duyệt giá');
    assert.match(actionCenterCode, /Chờ QC/, 'Tab Chờ QC');
    assert.match(actionCenterCode, /Sẵn sàng trả máy/, 'Tab Sẵn sàng trả máy');
    assert.match(actionCenterCode, /Linh kiện sắp hết/, 'Tab Linh kiện sắp hết');

    // Quick action triggers
    assert.match(actionCenterCode, /tel:/, 'Customer phone tel: click-to-call link');
    assert.match(actionCenterCode, /Giục KTV \/ Xem đơn/, 'Technician reminder / view order action');
    assert.match(actionCenterCode, /Duyệt QC ↗/, 'QC approval quick action');
    assert.match(actionCenterCode, /Thu tiền & Trả máy/, 'Checkout handover quick action');
    assert.match(actionCenterCode, /Vào kho phụ tùng ↗/, 'Low stock inventory quick action');
  });

  test('4. Preservation of 100% existing financial cards, SVG chart, and Calm Jade/Warm Ivory reconciliation blocks', () => {
    // 6 Financial KPI cards
    assert.match(dashboardCode, /label="Đơn đang xử lý"/, 'Preserves Đơn đang xử lý');
    assert.match(dashboardCode, /label="Tiếp nhận hôm nay"/, 'Preserves Tiếp nhận hôm nay');
    assert.match(dashboardCode, /label="Tổng doanh thu hôm nay"/, 'Preserves Tổng doanh thu hôm nay');
    assert.match(dashboardCode, /label="Doanh thu ngày chọn"/, 'Preserves Doanh thu ngày chọn');
    assert.match(dashboardCode, /label="Doanh thu tháng"/, 'Preserves Doanh thu tháng');
    assert.match(dashboardCode, /label="Tỷ lệ hoàn thành"/, 'Preserves Tỷ lệ hoàn thành');

    // SVG Chart
    assert.match(dashboardCode, /renderRevenueChart\(\)/, 'Preserves dynamic SVG revenue chart');

    // Reconciliation block
    assert.match(dashboardCode, /Máy khách đã lấy \(Đã bàn giao\)/, 'Preserves Calm Jade handed-over reconciliation');
    assert.match(dashboardCode, /Máy khách chưa lấy \(Tại cửa hàng\)/, 'Preserves Warm Ivory uncollected reconciliation');
    assert.match(dashboardCode, /Tổng tiền chưa thu/, 'Preserves uncollected amount card');
  });

  test('5. Strict Brand Colors and Standard @podscare/ui Icon Compliance', () => {
    // Calm Jade token
    assert.match(actionCenterCode, /#176b58/, 'Uses Calm Jade #176b58');
    assert.match(actionCenterCode, /#eaf4ef/, 'Uses Calm Jade secondary bg #eaf4ef');
    assert.match(actionCenterCode, /#c5e1d4/, 'Uses Calm Jade border #c5e1d4');

    // Warm Ivory token
    assert.match(actionCenterCode, /#fcfaf5/, 'Uses Warm Ivory bg #fcfaf5');
    assert.match(actionCenterCode, /#915e1b/, 'Uses Warm Ivory text #915e1b');
    assert.match(actionCenterCode, /#ebd9bd/, 'Uses Warm Ivory border #ebd9bd');

    // Soft Alert token
    assert.match(actionCenterCode, /#fbefed/, 'Uses Soft Alert bg #fbefed');
    assert.match(actionCenterCode, /#f5c7c2/, 'Uses Soft Alert border #f5c7c2');
    assert.match(actionCenterCode, /#bc5b52/, 'Uses Soft Alert text #bc5b52');

    // Icons: Only standard atoms
    const disallowedIcons = ['lucide', 'fa-', 'material-icons'];
    for (const disallowed of disallowedIcons) {
      assert.strictEqual(actionCenterCode.includes(disallowed), false, `Must not contain ${disallowed}`);
    }
  });
});
