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

test('Super Admin Streamline: Sidebar structure in AppSidebar.tsx', () => {
  const sidebarPath = path.join(uiDir, 'src/organisms/AppSidebar.tsx');
  assert.ok(fs.existsSync(sidebarPath), 'AppSidebar.tsx must exist');
  const content = fs.readFileSync(sidebarPath, 'utf-8');

  // Verify removed items
  assert.strictEqual(content.includes('platform-quotas'), false, 'Must not contain platform-quotas');
  assert.strictEqual(content.includes('platform-health'), false, 'Must not contain platform-health');
  assert.strictEqual(content.includes('/platform/quotas'), false, 'Must not contain /platform/quotas');
  assert.strictEqual(content.includes('/platform/health'), false, 'Must not contain /platform/health');

  // Verify 3 group headers for super_admin
  assert.ok(content.includes("'ĐIỀU HÀNH NỀN TẢNG'"), 'Must contain group ĐIỀU HÀNH NỀN TẢNG');
  assert.ok(content.includes("'GIÁM SÁT TOÀN SÀN'"), 'Must contain group GIÁM SÁT TOÀN SÀN');
  assert.ok(content.includes("'CẤU HÌNH DOANH THU'"), 'Must contain group CẤU HÌNH DOANH THU');

  // Verify 6 navigation items
  assert.ok(content.includes("'platform-stores'"), 'Must contain platform-stores');
  assert.ok(content.includes("'platform-approvals'"), 'Must contain platform-approvals');
  assert.ok(content.includes("'platform-plans'"), 'Must contain platform-plans');
  assert.ok(content.includes("'platform-dashboard'"), 'Must contain platform-dashboard');
  assert.ok(content.includes("'platform-billing'"), 'Must contain platform-billing');
  assert.ok(content.includes("'platform-integrations'"), 'Must contain platform-integrations');
  assert.ok(content.includes('Tài khoản nhận tiền SePay'), 'Must label as Tài khoản nhận tiền SePay');
});

test('Super Admin Streamline: 404 History Back Navigation in not-found.tsx', () => {
  const notFoundPath = path.join(webDir, 'app/not-found.tsx');
  assert.ok(fs.existsSync(notFoundPath), 'not-found.tsx must exist');
  const content = fs.readFileSync(notFoundPath, 'utf-8');

  assert.ok(content.includes('useRouter'), 'Must use useRouter hook');
  assert.ok(content.includes('router.back()'), 'Must call router.back()');
  assert.ok(content.includes('Quay lại trang trước'), 'Must label button as Quay lại trang trước');
  assert.ok(content.includes('href="/"'), 'Must have safe fallback to /');
});

test('Super Admin Streamline: SaaS Plans Page at /platform/plans', () => {
  const plansPath = path.join(webDir, 'app/platform/plans/page.tsx');
  assert.ok(fs.existsSync(plansPath), 'plans/page.tsx must exist');
  const content = fs.readFileSync(plansPath, 'utf-8');

  assert.ok(content.includes('Gói Dùng thử'), 'Must contain Trial plan');
  assert.ok(content.includes('Gói Tiêu chuẩn'), 'Must contain Standard plan');
  assert.ok(content.includes('Gói Chuyên nghiệp'), 'Must contain Pro plan');
  assert.ok(content.includes('299000'), 'Must contain 299k price');
  assert.ok(content.includes('599000'), 'Must contain 599k price');
  assert.ok(content.includes('AppShell'), 'Must wrap in AppShell');
  assert.ok(content.includes('Chỉnh sửa đặc quyền') || content.includes('Cập nhật quyền lợi'), 'Must have edit action');
  assert.ok(content.includes('Modal'), 'Must include Modal for editing');
});

test('Super Admin Streamline: SaaS Billing Page at /platform/billing', () => {
  const billingPath = path.join(webDir, 'app/platform/billing/page.tsx');
  assert.ok(fs.existsSync(billingPath), 'billing/page.tsx must exist');
  const content = fs.readFileSync(billingPath, 'utf-8');

  assert.ok(content.includes('DOANH THU & GIA HẠN SAAS'), 'Must have billing title');
  assert.ok(content.includes('14.850.000'), 'Must contain MRR KPI');
  assert.ok(content.includes('SePay VietQR'), 'Must mention SePay VietQR');
  assert.ok(content.includes('Cảnh báo Gian hàng sắp hết hạn'), 'Must have renewal warning block');
  assert.ok(content.includes('AppShell'), 'Must wrap in AppShell');
});

test('Super Admin Streamline: SePay Gateway Integration Page at /platform/integrations', () => {
  const integrationsPath = path.join(webDir, 'app/platform/integrations/page.tsx');
  assert.ok(fs.existsSync(integrationsPath), 'integrations/page.tsx must exist');
  const content = fs.readFileSync(integrationsPath, 'utf-8');

  assert.ok(content.includes('CẤU HÌNH TÀI KHOẢN NHẬN TIỀN SEPAY'), 'Must have SePay title');
  assert.ok(content.includes('MBBank'), 'Must include MBBank in bank list');
  assert.ok(content.includes('apiToken'), 'Must contain apiToken input');
  assert.ok(content.includes('api.fixo.com.vn/api/v1/webhooks/sepay'), 'Must contain webhook URL');
  assert.ok(content.includes('VietQR'), 'Must include VietQR preview');
  assert.ok(content.includes('Kiểm tra kết nối Live'), 'Must have Test connection button');
  assert.ok(content.includes('AppShell'), 'Must wrap in AppShell');
});
