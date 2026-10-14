import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');
const webDir = path.resolve(rootDir, 'apps/web');
const uiDir = path.resolve(rootDir, 'packages/ui');

test('Simplify Modules: Task 1.1 - AppSidebar.tsx rolePermissions for admin and cskh', () => {
  const sidebarPath = path.join(uiDir, 'src/organisms/AppSidebar.tsx');
  assert.ok(fs.existsSync(sidebarPath), 'AppSidebar.tsx must exist');
  const content = fs.readFileSync(sidebarPath, 'utf-8');

  // Verify removed modules from admin
  const adminMatch = content.match(/admin:\s*\[([\s\S]*?)\]/);
  assert.ok(adminMatch, 'Must find admin role permissions');
  const adminPermissions = adminMatch[1];
  assert.strictEqual(adminPermissions.includes("'quotes'"), false, 'Admin must not contain quotes');
  assert.strictEqual(adminPermissions.includes("'inventory'"), false, 'Admin must not contain inventory');
  assert.strictEqual(adminPermissions.includes("'shipments'"), false, 'Admin must not contain shipments');
  assert.strictEqual(adminPermissions.includes("'partners'"), false, 'Admin must not contain partners');
  assert.strictEqual(adminPermissions.includes("'devices'"), false, 'Admin must not contain devices');

  // Verify removed modules from cskh
  const cskhMatch = content.match(/cskh:\s*\[([\s\S]*?)\]/);
  assert.ok(cskhMatch, 'Must find cskh role permissions');
  const cskhPermissions = cskhMatch[1];
  assert.strictEqual(cskhPermissions.includes("'quotes'"), false, 'CSKH must not contain quotes');
  assert.strictEqual(cskhPermissions.includes("'inventory'"), false, 'CSKH must not contain inventory');
  assert.strictEqual(cskhPermissions.includes("'shipments'"), false, 'CSKH must not contain shipments');
  assert.strictEqual(cskhPermissions.includes("'partners'"), false, 'CSKH must not contain partners');
  assert.strictEqual(cskhPermissions.includes("'devices'"), false, 'CSKH must not contain devices');
});

test('Simplify Modules: Task 1.2 - AppShell.tsx route guard for hidden modules', () => {
  const appShellPath = path.join(webDir, 'app/components/AppShell.tsx');
  assert.ok(fs.existsSync(appShellPath), 'AppShell.tsx must exist');
  const content = fs.readFileSync(appShellPath, 'utf-8');

  assert.ok(content.includes("'/quotes': 'quotes'"), 'Must guard /quotes');
  assert.ok(content.includes("'/inventory': 'inventory'"), 'Must guard /inventory');
  assert.ok(content.includes("'/shipments': 'shipments'"), 'Must guard /shipments');
  assert.ok(content.includes("'/partners': 'partners'"), 'Must guard /partners');
  assert.ok(content.includes("'/devices': 'devices'"), 'Must guard /devices');
  assert.ok(content.includes("router.replace('/dashboard')"), 'Must redirect unauthorized users to /dashboard');
});

test('Simplify Modules: Tasks 2.1 & 2.2 - Admin Dashboard StatCards and warranty_rate', () => {
  const dashPath = path.join(webDir, 'app/dashboard/page.tsx');
  assert.ok(fs.existsSync(dashPath), 'dashboard/page.tsx must exist');
  const content = fs.readFileSync(dashPath, 'utf-8');

  // Verify removed financial stat cards from Admin dashboard
  assert.strictEqual(content.includes('label="Giá vốn hàng bán"'), false, 'Must not contain Giá vốn hàng bán');
  assert.strictEqual(content.includes('label="Lợi nhuận gộp"'), false, 'Must not contain Lợi nhuận gộp');
  assert.strictEqual(content.includes('label="Tiền NCC còn phải trả"'), false, 'Must not contain Tiền NCC còn phải trả');
  assert.strictEqual(content.includes('href="/devices"'), false, 'Must not contain link to /devices');

  // Verify warranty_rate statcard exists
  assert.ok(content.includes('label="Tỉ lệ bảo hành"'), 'Must contain Tỉ lệ bảo hành StatCard');
  assert.ok(content.includes('warranty_rate'), 'Must use warranty_rate metric');
});

test('Simplify Modules: Task 2.3 - Technician Unfinished Orders panel on Dashboard', () => {
  const dashPath = path.join(webDir, 'app/dashboard/page.tsx');
  const content = fs.readFileSync(dashPath, 'utf-8');

  assert.ok(content.includes('Không gian Kỹ thuật - Máy chưa xong chi tiết'), 'Must contain panel title');
  assert.ok(content.includes('unfinishedTechOrders'), 'Must calculate unfinishedTechOrders');
  assert.ok(content.includes('Mở Không gian Kỹ thuật'), 'Must include quick link button to /tech');
});

test('Simplify Modules: Task 3.2 - Customer Profile Edit in customers/page.tsx', () => {
  const customersPath = path.join(webDir, 'app/customers/page.tsx');
  assert.ok(fs.existsSync(customersPath), 'customers/page.tsx must exist');
  const content = fs.readFileSync(customersPath, 'utf-8');

  assert.ok(content.includes('handleOpenEditModal'), 'Must have handleOpenEditModal handler');
  assert.ok(content.includes('customerService.updateCustomer'), 'Must call customerService.updateCustomer');
  assert.ok(content.includes('Chỉnh sửa thông tin khách hàng'), 'Must have edit customer modal title');
  assert.ok(content.includes('btn-save-customer-edit'), 'Must have save edit button');
});

test('Simplify Modules: Task 3.3 - 1-Click Popular Device Model Selection in IntakeWizardModal', () => {
  const intakePath = path.join(webDir, 'app/components/IntakeWizardModal.tsx');
  assert.ok(fs.existsSync(intakePath), 'IntakeWizardModal.tsx must exist');
  const content = fs.readFileSync(intakePath, 'utf-8');

  assert.ok(content.includes('QUICK_POPULAR_MODELS'), 'Must define QUICK_POPULAR_MODELS');
  assert.ok(content.includes('AirPods Pro 2'), 'Must include AirPods Pro 2');
  assert.ok(content.includes('quick-device-btn-'), 'Must render quick select buttons');
});

test('Simplify Modules: Tasks 4.1 & 4.2 - Standardized Warranty Terms in K80 and A4 Receipts', () => {
  const k80Path = path.join(webDir, 'app/components/print/thermalK80HtmlBuilder.ts');
  const a4Path = path.join(webDir, 'app/components/print/a4ReceiptHtmlBuilder.ts');
  assert.ok(fs.existsSync(k80Path), 'thermalK80HtmlBuilder.ts must exist');
  assert.ok(fs.existsSync(a4Path), 'a4ReceiptHtmlBuilder.ts must exist');

  const k80Content = fs.readFileSync(k80Path, 'utf-8');
  assert.ok(k80Content.includes('ĐIỀU KHOẢN & CHÍNH SÁCH BẢO HÀNH'), 'K80 must contain warranty terms header');
  assert.ok(k80Content.includes('Tem niêm phong'), 'K80 must mention intake seal');
  assert.ok(k80Content.includes('Từ chối bảo hành'), 'K80 must mention exclusion criteria');

  const a4Content = fs.readFileSync(a4Path, 'utf-8');
  assert.ok(a4Content.includes('ĐIỀU KHOẢN VÀ CHÍNH SÁCH BẢO HÀNH TIÊU CHUẨN'), 'A4 must contain warranty terms header');
  assert.ok(a4Content.includes('Điều kiện bảo hành'), 'A4 must contain warranty conditions');
  assert.ok(a4Content.includes('Từ chối bảo hành'), 'A4 must contain exclusion criteria');
});

test('Simplify Modules: Tasks 5.1 & 5.2 - Shift Cashbook VietQR Total and Breakdown', () => {
  const shiftsPath = path.join(webDir, 'app/shifts/page.tsx');
  const closeShiftPath = path.join(webDir, 'app/components/CloseShiftModal.tsx');
  const printShiftPath = path.join(webDir, 'app/components/print/ShiftReceiptPrint.tsx');

  assert.ok(fs.existsSync(shiftsPath), 'shifts/page.tsx must exist');
  assert.ok(fs.existsSync(closeShiftPath), 'CloseShiftModal.tsx must exist');
  assert.ok(fs.existsSync(printShiftPath), 'ShiftReceiptPrint.tsx must exist');

  const shiftsContent = fs.readFileSync(shiftsPath, 'utf-8');
  assert.ok(shiftsContent.includes('Doanh thu Chuyển khoản (VietQR / CK)'), 'Shifts page must display VietQR StatCard');

  const closeContent = fs.readFileSync(closeShiftPath, 'utf-8');
  assert.ok(closeContent.includes('Chuyển khoản (VietQR)'), 'CloseShiftModal must display VietQR breakdown');

  const printContent = fs.readFileSync(printShiftPath, 'utf-8');
  assert.ok(printContent.includes('Thu Chuyển khoản:'), 'ShiftReceiptPrint must display VietQR revenue on slip');
});

test('Simplify Modules: Tasks 6.2 & 6.3 - 7 Days Filter Chip & High-Visibility Red Alerts', () => {
  const techPath = path.join(webDir, 'app/tech/page.tsx');
  assert.ok(fs.existsSync(techPath), 'tech/page.tsx must exist');
  const techContent = fs.readFileSync(techPath, 'utf-8');

  // Verify 7-day filter chip
  assert.ok(techContent.includes('tech-date-filter-7_days'), 'Must have 7 days filter chip');
  assert.ok(techContent.includes('7 ngày qua'), 'Must label 7 days filter');

  // Verify Red Alert badges
  assert.ok(techContent.includes('bg-red-50 text-red-700 border border-red-300 font-bold'), 'Must have high-visibility red badge');
  assert.ok(techContent.includes('border-red-400 ring-1 ring-red-400/20 bg-red-50/10'), 'Must have red border alert styling');
});
