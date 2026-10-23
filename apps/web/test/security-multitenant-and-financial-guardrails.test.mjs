import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHECKOUT_ALLOWED_STATUSES,
  canOpenCheckoutForStatus,
  normalizeStatusCode,
} from '../app/repairs/fsm.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(__dirname, '../../..');

describe('OpenSpec: security-multitenant-and-financial-guardrails (Frontend Verification)', () => {
  test('Task 1.5: 1-Tap CSKH Checkout from waiting_qc and Payment Gate before completed', () => {
    // 1. Verify CHECKOUT_ALLOWED_STATUSES & canOpenCheckoutForStatus in fsm.ts
    for (const st of ['ready_for_return', 'waiting_pickup', 'in_repair', 'waiting_qc']) {
      assert.ok(
        CHECKOUT_ALLOWED_STATUSES.includes(st),
        `CHECKOUT_ALLOWED_STATUSES must include ${st}`
      );
      assert.strictEqual(
        canOpenCheckoutForStatus(st),
        true,
        `canOpenCheckoutForStatus('${st}') must be true`
      );
    }
    assert.strictEqual(
      canOpenCheckoutForStatus('Chờ QC'),
      true,
      "canOpenCheckoutForStatus('Chờ QC') must be true"
    );
    assert.strictEqual(
      canOpenCheckoutForStatus('qc_pending'),
      true,
      "canOpenCheckoutForStatus('qc_pending') must be true"
    );
    assert.strictEqual(
      canOpenCheckoutForStatus('completed'),
      false,
      "canOpenCheckoutForStatus('completed') must be false"
    );

    // 2. Verify RepairQueuePane.tsx, FsmActionBar.tsx, and repairs/page.tsx include waiting_qc in checkout condition
    const queuePaneContent = fs.readFileSync(
      path.join(webDir, 'app/repairs/components/RepairQueuePane.tsx'),
      'utf-8'
    );
    const fsmBarContent = fs.readFileSync(
      path.join(webDir, 'app/repairs/components/FsmActionBar.tsx'),
      'utf-8'
    );
    const repairsPageContent = fs.readFileSync(
      path.join(webDir, 'app/repairs/page.tsx'),
      'utf-8'
    );

    assert.ok(
      queuePaneContent.includes(
        "['ready_for_return', 'waiting_pickup', 'in_repair', 'waiting_qc']"
      ),
      'RepairQueuePane.tsx must allow row checkout button for waiting_qc'
    );
    assert.ok(
      fsmBarContent.includes(
        "['ready_for_return', 'waiting_pickup', 'in_repair', 'waiting_qc']"
      ),
      'FsmActionBar.tsx must allow quick checkout button for waiting_qc'
    );
    assert.ok(
      repairsPageContent.includes(
        "['ready_for_return', 'waiting_pickup', 'in_repair', 'waiting_qc']"
      ),
      'repairs/page.tsx modal footer must allow checkout button for waiting_qc'
    );

    // 3. Verify Payment Gate on UI when clicking Hoàn tất (completed)
    assert.ok(
      fsmBarContent.includes("act.targetStatus === 'completed' && hasUnpaidBalance") &&
        fsmBarContent.includes('onQuickCheckout()'),
      'FsmActionBar.tsx must redirect unpaid completed quick action to CheckoutHandoverModal'
    );
    assert.ok(
      repairsPageContent.includes("if (transitionKey === 'completed')") &&
        repairsPageContent.includes('if (effectiveTotal > 0 && paidSum < effectiveTotal)') &&
        repairsPageContent.includes('setCheckoutModalOpen(true)'),
      'repairs/page.tsx handleUpdateStatus must open CheckoutHandoverModal when total_price > 0 and unpaid'
    );

    // 4. Verify CheckoutHandoverModal preserves CSKH service_price input and auto_confirm: true
    const checkoutModalContent = fs.readFileSync(
      path.join(webDir, 'app/components/CheckoutHandoverModal.tsx'),
      'utf-8'
    );
    assert.ok(
      checkoutModalContent.includes('service_price: servicePrice') &&
        checkoutModalContent.includes('auto_confirm: true'),
      'CheckoutHandoverModal.tsx must preserve CSKH service_price input and auto_confirm: true'
    );
  });

  test('Task 5.3: Edge Middleware (middleware.ts) and Role Guard (AppShell.tsx) protect all internal routes while preserving CSKH access', () => {
    const middlewareContent = fs.readFileSync(path.join(webDir, 'middleware.ts'), 'utf-8');
    const appShellContent = fs.readFileSync(
      path.join(webDir, 'app/components/AppShell.tsx'),
      'utf-8'
    );
    const sidebarContent = fs.readFileSync(
      path.join(rootDir, 'packages/ui/src/organisms/AppSidebar.tsx'),
      'utf-8'
    );

    // 1. Check middleware.ts matcher includes all internal routes
    const expectedMatchers = [
      "'/dashboard/:path*'",
      "'/repairs/:path*'",
      "'/customers/:path*'",
      "'/timeline/:path*'",
      "'/tech/:path*'",
      "'/qc/:path*'",
      "'/warranty/:path*'",
      "'/branches/:path*'",
      "'/branding/:path*'",
      "'/users/:path*'",
      "'/payments/:path*'",
      "'/shifts/:path*'",
      "'/subscription/:path*'",
      "'/kpi/:path*'",
      "'/audit/:path*'",
      "'/inventory/:path*'",
      "'/quotes/:path*'",
      "'/shipments/:path*'",
      "'/partners/:path*'",
      "'/devices/:path*'",
      "'/suppliers/:path*'",
      "'/platform/:path*'",
      "'/settings/:path*'",
      "'/print/:path*'",
    ];
    for (const m of expectedMatchers) {
      assert.ok(middlewareContent.includes(m), `middleware.ts matcher must include ${m}`);
    }

    // 2. Check AppShell.tsx routeModuleMap protects admin/sensitive routes and redirects tech to /tech
    const expectedRouteMappings = [
      "'/dashboard': 'dashboard'",
      "'/repairs': 'repairs'",
      "'/customers': 'customers'",
      "'/timeline': 'timeline'",
      "'/tech': 'tech'",
      "'/qc': 'qc'",
      "'/warranty': 'warranty'",
      "'/branches': 'branches'",
      "'/branding': 'branding'",
      "'/users': 'users'",
      "'/payments': 'payments'",
      "'/shifts': 'shifts'",
      "'/subscription': 'subscription'",
      "'/kpi': 'kpi'",
      "'/audit': 'audit'",
      "'/quotes': 'quotes'",
      "'/inventory': 'inventory'",
      "'/shipments': 'shipments'",
      "'/partners': 'partners'",
      "'/devices': 'devices'",
      "'/suppliers': 'suppliers'",
    ];
    for (const mapping of expectedRouteMappings) {
      assert.ok(
        appShellContent.includes(mapping),
        `AppShell.tsx routeModuleMap must include ${mapping}`
      );
    }
    assert.ok(
      appShellContent.includes("normalizedRole === 'tech' ? '/tech' : '/dashboard'") &&
        appShellContent.includes("router.replace('/tech')") &&
        appShellContent.includes("router.replace('/dashboard')"),
      'AppShell.tsx must redirect unauthorized tech to /tech and other roles to /dashboard'
    );

    // 3. Verify CSKH rolePermissions in AppSidebar.tsx remain 100% intact
    const cskhMatch = sidebarContent.match(/cskh:\s*\[([\s\S]*?)\]/);
    assert.ok(cskhMatch, 'Must find cskh rolePermissions in AppSidebar.tsx');
    const cskhPerms = cskhMatch[1];
    for (const cskhModule of ['dashboard', 'repairs', 'customers', 'timeline', 'warranty', 'shifts']) {
      assert.ok(
        cskhPerms.includes(`'${cskhModule}'`),
        `CSKH rolePermissions must preserve '${cskhModule}'`
      );
    }
  });
});
