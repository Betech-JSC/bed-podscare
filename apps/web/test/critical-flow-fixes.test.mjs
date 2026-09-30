import assert from 'node:assert';
import test, { describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('OpenSpec: pre-test-critical-flow-fixes Frontend Verification', () => {
  const rootDir = path.resolve(__dirname, '../../..');
  const webAppDir = path.resolve(__dirname, '../app');
  const uiPackageDir = path.resolve(rootDir, 'packages/ui/src');
  const apiClientDir = path.resolve(rootDir, 'packages/api-client/src');

  test('Task 1.1: globals.css print isolation removes destructive body child hiding and adds A4 @page sizing', () => {
    const cssPath = path.join(webAppDir, 'globals.css');
    assert.ok(fs.existsSync(cssPath), 'globals.css must exist');
    const content = fs.readFileSync(cssPath, 'utf-8');

    // Must not use the destructive selector that hides parent Next.js containers
    assert.ok(
      !content.includes('body > *:not(#printSheetWrapper)'),
      'Must NOT contain body > *:not(#printSheetWrapper) which hides Next.js root tree'
    );

    // Must contain A4 page size with specified margins
    assert.ok(content.includes('size: A4 portrait'), 'Must specify size: A4 portrait');
    assert.ok(content.includes('margin: 8mm 6mm'), 'Must specify margin: 8mm 6mm');

    // Must contain visibility isolation for #printSheetWrapper
    assert.ok(content.includes('#printSheetWrapper'), 'Must contain #printSheetWrapper rule');
    assert.ok(content.includes('visibility: hidden'), 'Must hide non-printable elements via visibility');
    assert.ok(content.includes('visibility: visible'), 'Must make #printSheetWrapper visible');
  });

  test('Task 1.2: print/[id]/page.tsx locks slip height to <=132mm with 10mm cutting line', () => {
    const printPagePath = path.join(webAppDir, 'print/[id]/page.tsx');
    assert.ok(fs.existsSync(printPagePath), 'print/[id]/page.tsx must exist');
    const content = fs.readFileSync(printPagePath, 'utf-8');

    // Must have id="printSheetWrapper"
    assert.ok(content.includes('id="printSheetWrapper"'), 'Must contain wrapper with id="printSheetWrapper"');

    // Must lock slip height to max 132mm
    assert.ok(content.includes('max-h-[132mm]'), 'Must restrict slip height to max-h-[132mm]');

    // Must have 10mm cutting line between slips
    assert.ok(content.includes('print:h-[10mm]'), 'Must have 10mm separator line in print');
    assert.ok(content.includes('✂'), 'Must include cut mark indicator');
  });

  test('Task 2.1: AppSidebar.tsx registers technician item (/tech) with wrench icon in operationsNav and mainNavItems', () => {
    const sidebarPath = path.join(uiPackageDir, 'organisms/AppSidebar.tsx');
    assert.ok(fs.existsSync(sidebarPath), 'AppSidebar.tsx must exist');
    const content = fs.readFileSync(sidebarPath, 'utf-8');

    // Must export or define mainNavItems
    assert.ok(content.includes('mainNavItems'), 'Must export/define mainNavItems');

    // Must have tech nav item with wrench icon and /tech href
    assert.ok(content.includes("id: 'tech'"), "Must have nav item with id: 'tech'");
    assert.ok(content.includes("icon: 'wrench'"), "Must have icon: 'wrench'");
    assert.ok(content.includes("href: '/tech'"), "Must have href: '/tech'");
  });

  test('Task 2.2: AppSidebar.tsx rolePermissions grants /tech to admin and tech, but restricts from cskh', () => {
    const sidebarPath = path.join(uiPackageDir, 'organisms/AppSidebar.tsx');
    const content = fs.readFileSync(sidebarPath, 'utf-8');

    // Extract rolePermissions block
    const roleMatch = content.match(/const rolePermissions:\s*Record<[^>]+>\s*=\s*({[\s\S]*?});/);
    assert.ok(roleMatch, 'rolePermissions matrix must be defined in AppSidebar.tsx');
    const matrixStr = roleMatch[1];

    // admin must include 'tech'
    const adminMatch = matrixStr.match(/admin:\s*\[([\s\S]*?)\]/);
    assert.ok(adminMatch && adminMatch[1].includes("'tech'"), "admin role must include 'tech'");

    // tech must include 'tech'
    const techMatch = matrixStr.match(/tech:\s*\[([\s\S]*?)\]/);
    assert.ok(techMatch && techMatch[1].includes("'tech'"), "tech role must include 'tech'");

    // cskh must NOT include 'tech'
    const cskhMatch = matrixStr.match(/cskh:\s*\[([\s\S]*?)\]/);
    assert.ok(cskhMatch && !cskhMatch[1].includes("'tech'"), "cskh role must NOT include 'tech'");
  });

  test('Task 4.1: payments/page.tsx includes pending order selector and Simulate Payment button', () => {
    const paymentsPagePath = path.join(webAppDir, 'payments/page.tsx');
    assert.ok(fs.existsSync(paymentsPagePath), 'payments/page.tsx must exist');
    const content = fs.readFileSync(paymentsPagePath, 'utf-8');

    // Must fetch pending orders using repairService.getRepairs
    assert.ok(content.includes('repairService.getRepairs'), 'Must fetch orders via repairService.getRepairs');

    // Must contain pending order selector in modal
    assert.ok(content.includes('handleSelectPendingOrder'), 'Must define handleSelectPendingOrder');
    assert.ok(content.includes('pendingOrders'), 'Must maintain pendingOrders state');

    // Must contain "Giả lập thanh toán thành công" simulation handler
    assert.ok(content.includes('handleSimulatePayment'), 'Must define handleSimulatePayment');
    assert.ok(content.includes('Giả lập thanh toán thành công'), 'Must display "Giả lập thanh toán thành công" button');

    // Must call transition to 'completed'
    assert.ok(content.includes("transition: 'completed'"), "Must transition order to 'completed'");
    // Must create payment
    assert.ok(content.includes('paymentService.createPayment'), 'Must create payment via paymentService');
  });

  test('Task 5.1: HttpClient.buildUrl deduplicates /api/v1 between baseURL and endpoint', async () => {
    const httpClientModule = await import(path.join(apiClientDir, 'http-client.ts'));
    const { HttpClient } = httpClientModule;

    // Case 1: baseURL has /api/v1 and endpoint has /api/v1/orders
    const client1 = new HttpClient('http://localhost:8000/api/v1');
    assert.strictEqual(client1.buildUrl('/api/v1/orders'), 'http://localhost:8000/api/v1/orders');
    assert.strictEqual(client1.buildUrl('api/v1/orders'), 'http://localhost:8000/api/v1/orders');

    // Case 2: baseURL has /api/v1/ with trailing slash
    const client2 = new HttpClient('http://localhost:8000/api/v1/');
    assert.strictEqual(client2.buildUrl('/api/v1/orders'), 'http://localhost:8000/api/v1/orders');

    // Case 3: baseURL does NOT have /api/v1
    const client3 = new HttpClient('http://localhost:8000');
    assert.strictEqual(client3.buildUrl('/api/v1/orders'), 'http://localhost:8000/api/v1/orders');

    // Case 4: baseURL has /api/v1 and endpoint has no prefix
    const client4 = new HttpClient('http://localhost:8000/api/v1');
    assert.strictEqual(client4.buildUrl('/orders'), 'http://localhost:8000/api/v1/orders');

    // Case 5: External full URL is preserved
    assert.strictEqual(
      client1.buildUrl('https://img.vietqr.io/image.png'),
      'https://img.vietqr.io/image.png'
    );
  });

  test('Task 5.2: apps/web/.env.example sets NEXT_PUBLIC_API_URL=http://localhost:8000', () => {
    const envExamplePath = path.join(rootDir, 'apps/web/.env.example');
    assert.ok(fs.existsSync(envExamplePath), 'apps/web/.env.example must exist');
    const content = fs.readFileSync(envExamplePath, 'utf-8');

    assert.ok(
      content.includes('NEXT_PUBLIC_API_URL=http://localhost:8000'),
      'Must configure NEXT_PUBLIC_API_URL=http://localhost:8000'
    );
    assert.ok(
      !content.includes('NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1'),
      'Must NOT end with /api/v1 in .env.example'
    );
  });

  test('Task 6.1: repairs/page.tsx implements RAM state rollback on FSM transition failure', () => {
    const repairsPagePath = path.join(webAppDir, 'repairs/page.tsx');
    assert.ok(fs.existsSync(repairsPagePath), 'repairs/page.tsx must exist');
    const content = fs.readFileSync(repairsPagePath, 'utf-8');

    // Must backup previous state
    assert.ok(content.includes('previousOrder') || content.includes('prevStatus'), 'Must save previous order/status state');

    // In catch block, must rollback state
    assert.ok(content.includes('updateOrder(revertedOrder)'), 'Must call updateOrder to revert RAM state in catch');
    assert.ok(content.includes('setSelectedOrder(revertedOrder)'), 'Must call setSelectedOrder to revert selected order in catch');

    // Must surface error toast
    assert.ok(content.includes("toast(errMsg, 'error')"), 'Must display error toast when transition fails');
  });
});
