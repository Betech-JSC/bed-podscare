import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const typesOrderPath = path.resolve(__dirname, '../../../packages/types/src/order.ts');
const apiClientRepairPath = path.resolve(__dirname, '../../../packages/api-client/src/services/repair.service.ts');
const intakeWizardPath = path.resolve(__dirname, '../app/components/IntakeWizardModal.tsx');
const repairsPagePath = path.resolve(__dirname, '../app/repairs/page.tsx');
const k80BuilderPath = path.resolve(__dirname, '../app/components/print/thermalK80HtmlBuilder.ts');
const a4BuilderPath = path.resolve(__dirname, '../app/components/print/a4ReceiptHtmlBuilder.ts');
const checkoutModalPath = path.resolve(__dirname, '../app/components/CheckoutHandoverModal.tsx');
const adminEditModalPath = path.resolve(__dirname, '../app/components/AdminEditOrderModal.tsx');
const confirmDeleteModalPath = path.resolve(__dirname, '../app/components/ConfirmDeleteOrderModal.tsx');

test('OpenSpec: COD Order Type, Simple Checkout, and Admin Full CRUD', async (t) => {
  await t.test('1. Types & Client: order_type field and API methods', () => {
    assert.ok(fs.existsSync(typesOrderPath), 'packages/types/src/order.ts must exist');
    const typesContent = fs.readFileSync(typesOrderPath, 'utf-8');
    assert.ok(
      typesContent.includes("order_type?: 'in_store' | 'cod'"),
      'RepairOrder must include order_type'
    );
    assert.ok(
      typesContent.includes("orderType?: 'in_store' | 'cod'"),
      'RepairOrder must include orderType alias'
    );

    assert.ok(fs.existsSync(apiClientRepairPath), 'repair.service.ts must exist');
    const clientContent = fs.readFileSync(apiClientRepairPath, 'utf-8');
    assert.ok(clientContent.includes('adminUpdate'), 'repair.service.ts must include adminUpdate');
    assert.ok(clientContent.includes('deleteOrder'), 'repair.service.ts must include deleteOrder');
    assert.ok(clientContent.includes('simpleCheckout'), 'repair.service.ts must include simpleCheckout');
  });

  await t.test('2. IntakeWizardModal: props, UI selector, payload & local order', () => {
    assert.ok(fs.existsSync(intakeWizardPath), 'IntakeWizardModal.tsx must exist');
    const wizardContent = fs.readFileSync(intakeWizardPath, 'utf-8');

    // Props support
    assert.ok(
      wizardContent.includes("initialIntakeType?: 'in_store' | 'cod'") ||
      wizardContent.includes("defaultOrderType?: 'in_store' | 'cod'"),
      'IntakeWizardModalProps must accept initialIntakeType or defaultOrderType'
    );

    // State & Selector UI
    assert.ok(
      wizardContent.includes("orderType") && wizardContent.includes("setOrderType"),
      'IntakeWizardModal must maintain orderType state'
    );
    assert.ok(
      wizardContent.includes('order-type-in-store-btn') && wizardContent.includes('order-type-cod-btn'),
      'IntakeWizardModal must render order type selector buttons'
    );

    // Payload & newOrder
    assert.ok(
      wizardContent.includes('order_type: orderType'),
      'IntakeWizardModal must pass order_type in payload and newOrder'
    );
  });

  await t.test('3. Print templates (K80 & A4): Prominent classification line', () => {
    assert.ok(fs.existsSync(k80BuilderPath), 'thermalK80HtmlBuilder.ts must exist');
    const k80Content = fs.readFileSync(k80BuilderPath, 'utf-8');
    assert.ok(
      k80Content.includes('LOẠI ĐƠN: ĐƠN COD (KHÁCH TỈNH)') &&
      k80Content.includes('LOẠI ĐƠN: ĐƠN TẠI CỬA HÀNG'),
      'K80 template must render prominent LOẠI ĐƠN classification'
    );

    assert.ok(fs.existsSync(a4BuilderPath), 'a4ReceiptHtmlBuilder.ts must exist');
    const a4Content = fs.readFileSync(a4BuilderPath, 'utf-8');
    assert.ok(
      a4Content.includes('LOẠI ĐƠN: ĐƠN COD (KHÁCH TỈNH)') &&
      a4Content.includes('LOẠI ĐƠN: ĐƠN TẠI CỬA HÀNG'),
      'A4 template must render prominent LOẠI ĐƠN classification'
    );
  });

  await t.test('4. RepairsPage: 1-click Intake button, Quick tabs, and Table Badges', () => {
    assert.ok(fs.existsSync(repairsPagePath), 'repairs/page.tsx must exist');
    const repairsContent = fs.readFileSync(repairsPagePath, 'utf-8');

    // 1-click Intake button
    assert.ok(
      repairsContent.includes('intake-main-btn') &&
      repairsContent.includes("setInitialIntakeType('in_store')") &&
      repairsContent.includes('setIntakeModalOpen(true)'),
      'Repairs page must feature 1-click intake button that opens modal directly'
    );

    // Tab filters
    assert.ok(
      repairsContent.includes('tab-filter-all') &&
      repairsContent.includes('tab-filter-in-store') &&
      repairsContent.includes('tab-filter-cod'),
      'Repairs page must feature tab quick filters for all, in_store, and cod'
    );

    // Badges in table
    assert.ok(
      repairsContent.includes('badge-order-type-in-store') &&
      repairsContent.includes('badge-order-type-cod'),
      'Repairs table must render Calm Jade and Amber order type badges'
    );
  });

  await t.test('5. Modals & RBAC: CSKH Checkout & Admin-only full CRUD', () => {
    assert.ok(fs.existsSync(checkoutModalPath), 'CheckoutHandoverModal.tsx must exist');
    assert.ok(fs.existsSync(adminEditModalPath), 'AdminEditOrderModal.tsx must exist');
    assert.ok(fs.existsSync(confirmDeleteModalPath), 'ConfirmDeleteOrderModal.tsx must exist');

    const repairsContent = fs.readFileSync(repairsPagePath, 'utf-8');

    // CSKH checkout trigger
    assert.ok(
      repairsContent.includes('cskh-checkout-btn'),
      'Repairs page must provide CSKH checkout trigger for ready_for_return/waiting_pickup'
    );

    // Admin CRUD guards
    assert.ok(
      repairsContent.includes("role === 'admin' || role === 'super_admin'"),
      'Admin edit & delete must be strictly guarded by admin / super_admin role check'
    );
    assert.ok(
      repairsContent.includes('admin-edit-order-btn') &&
      repairsContent.includes('admin-delete-order-btn'),
      'Repairs page must render admin edit and delete modal triggers'
    );

    // Confirm delete code match check
    const confirmDeleteContent = fs.readFileSync(confirmDeleteModalPath, 'utf-8');
    assert.ok(
      confirmDeleteContent.includes('isMatch') &&
      confirmDeleteContent.includes('toUpperCase'),
      'ConfirmDeleteOrderModal must enforce exact order code matching before deleting'
    );
  });
});
