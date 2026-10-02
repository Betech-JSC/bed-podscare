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
const apiClientDir = path.resolve(rootDir, 'packages/api-client');

test('SaaS Subscription: Registration Page receives ?plan= and submits plan', () => {
  const registerPath = path.join(webDir, 'app/register/page.tsx');
  assert.ok(fs.existsSync(registerPath), 'register/page.tsx must exist');
  const content = fs.readFileSync(registerPath, 'utf-8');

  // Verify Suspense boundary and useSearchParams
  assert.ok(content.includes('useSearchParams'), 'Must use useSearchParams hook');
  assert.ok(content.includes('Suspense'), 'Must wrap in Suspense boundary for App Router');
  assert.ok(content.includes("searchParams?.get('plan')"), 'Must read plan parameter');

  // Verify Plan Switcher / Selection banner
  assert.ok(content.includes('DÙNG THỬ (TRIAL)'), 'Must mention Trial badge');
  assert.ok(content.includes('TIÊU CHUẨN (STANDARD)'), 'Must mention Standard badge');
  assert.ok(content.includes('CHUYÊN NGHIỆP (PRO)'), 'Must mention Pro badge');
  assert.ok(content.includes('299.000đ/tháng'), 'Must mention Standard pricing');
  assert.ok(content.includes('599.000đ/tháng'), 'Must mention Pro pricing');

  // Verify plan sent in fetch body
  assert.ok(content.includes('plan: selectedPlan'), 'Must include plan in registration body');
  assert.ok(content.includes('/api/v1/tenants/register'), 'Must call register endpoint');
});

test('SaaS Subscription: QuotaProgressBars component structure', () => {
  const quotaPath = path.join(webDir, 'app/components/subscription/QuotaProgressBars.tsx');
  assert.ok(fs.existsSync(quotaPath), 'QuotaProgressBars.tsx must exist');
  const content = fs.readFileSync(quotaPath, 'utf-8');

  assert.ok(content.includes('Số lượng Chi nhánh'), 'Must display branches metric');
  assert.ok(content.includes('Tài khoản Nhân sự'), 'Must display users metric');
  assert.ok(content.includes('Đơn sửa chữa tháng'), 'Must display orders metric');
  assert.ok(content.includes('∞ Không giới hạn'), 'Must display unlimited indicator');
  assert.ok(content.includes('bg-[#bc5b52]'), 'Must have critical warning color');
  assert.ok(content.includes('bg-[#d49342]'), 'Must have warning color at 80%');
});

test('SaaS Subscription: PricingPlanGrid component structure', () => {
  const pricingPath = path.join(webDir, 'app/components/subscription/PricingPlanGrid.tsx');
  assert.ok(fs.existsSync(pricingPath), 'PricingPlanGrid.tsx must exist');
  const content = fs.readFileSync(pricingPath, 'utf-8');

  assert.ok(content.includes('Gói Tiêu chuẩn'), 'Must include Standard plan');
  assert.ok(content.includes('Gói Chuyên nghiệp'), 'Must include Pro plan');
  assert.ok(content.includes('299000'), 'Must include Standard price');
  assert.ok(content.includes('599000'), 'Must include Pro price');
  assert.ok(content.includes('billingCycle'), 'Must support monthly/yearly billing cycle');
  assert.ok(content.includes('onSelectPlan'), 'Must handle plan selection callback');
});

test('SaaS Subscription: SePayPaymentModal component structure & Polling', () => {
  const modalPath = path.join(webDir, 'app/components/subscription/SePayPaymentModal.tsx');
  assert.ok(fs.existsSync(modalPath), 'SePayPaymentModal.tsx must exist');
  const content = fs.readFileSync(modalPath, 'utf-8');

  // Verify QR & Bank details
  assert.ok(content.includes('qr_url'), 'Must render dynamic QR image URL');
  assert.ok(content.includes('account_number'), 'Must display account number');
  assert.ok(content.includes('reference_code'), 'Must display reference code syntax');
  assert.ok(content.includes('copyToClipboard'), 'Must provide copy button functionality');

  // Verify 15-minute countdown timer & Polling interval
  assert.ok(content.includes('900'), 'Must initialize 15-minute countdown (900 seconds)');
  assert.ok(content.includes('getInvoiceStatus'), 'Must poll invoice status');
  assert.ok(content.includes('2500') || content.includes('2000'), 'Must poll every 2-2.5 seconds');
  assert.ok(content.includes('handlePaymentSuccess'), 'Must handle success callback');
  assert.ok(content.includes('Thanh toán thành công!'), 'Must display success message');
});

test('SaaS Subscription: Subscription Management Page at /subscription', () => {
  const subPagePath = path.join(webDir, 'app/subscription/page.tsx');
  assert.ok(fs.existsSync(subPagePath), 'subscription/page.tsx must exist');
  const content = fs.readFileSync(subPagePath, 'utf-8');

  assert.ok(content.includes('AppShell'), 'Must wrap in AppShell');
  assert.ok(content.includes('QuotaProgressBars'), 'Must render QuotaProgressBars');
  assert.ok(content.includes('PricingPlanGrid'), 'Must render PricingPlanGrid');
  assert.ok(content.includes('SePayPaymentModal'), 'Must render SePayPaymentModal');
  assert.ok(content.includes('saasService.getCurrent'), 'Must fetch current subscription');
  assert.ok(content.includes('Gói cước & Bản quyền'), 'Must set breadcrumb title');
});

test('SaaS Subscription: AppSidebar navigation contains /subscription for admin', () => {
  const sidebarPath = path.join(uiDir, 'src/organisms/AppSidebar.tsx');
  assert.ok(fs.existsSync(sidebarPath), 'AppSidebar.tsx must exist');
  const content = fs.readFileSync(sidebarPath, 'utf-8');

  assert.ok(content.includes("id: 'subscription'"), 'Must contain subscription item id');
  assert.ok(content.includes('Gói cước & Bản quyền'), 'Must label as Gói cước & Bản quyền');
  assert.ok(content.includes("href: '/subscription'"), 'Must link to /subscription');
  assert.ok(content.includes("'subscription'"), 'Must include subscription in admin permissions');
});

test('SaaS Subscription: Topbar & AppShell support Plan Badge', () => {
  const topbarPath = path.join(uiDir, 'src/organisms/Topbar.tsx');
  const appShellPath = path.join(webDir, 'app/components/AppShell.tsx');
  assert.ok(fs.existsSync(topbarPath), 'Topbar.tsx must exist');
  assert.ok(fs.existsSync(appShellPath), 'AppShell.tsx must exist');

  const topbarContent = fs.readFileSync(topbarPath, 'utf-8');
  const shellContent = fs.readFileSync(appShellPath, 'utf-8');

  assert.ok(topbarContent.includes('planBadgeSlot'), 'Topbar must define and render planBadgeSlot');
  assert.ok(shellContent.includes('planBadgeSlot='), 'AppShell must pass planBadgeSlot into Topbar');
  assert.ok(shellContent.includes('/subscription'), 'Badge must navigate to /subscription');
  assert.ok(shellContent.includes('saasService'), 'AppShell must load saasService for plan badge');
});

test('SaaS Subscription: @podscare/api-client exports saasService', () => {
  const clientIndexPath = path.join(apiClientDir, 'src/index.ts');
  const saasServicePath = path.join(apiClientDir, 'src/services/saas.service.ts');
  assert.ok(fs.existsSync(clientIndexPath), 'api-client index.ts must exist');
  assert.ok(fs.existsSync(saasServicePath), 'saas.service.ts must exist');

  const clientContent = fs.readFileSync(clientIndexPath, 'utf-8');
  assert.ok(clientContent.includes('saas.service'), 'api-client must export saas.service');
});
