import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const typesOrderPath = path.resolve(__dirname, '../../../packages/types/src/order.ts');
const intakeWizardPath = path.resolve(__dirname, '../app/components/IntakeWizardModal.tsx');
const repairsPagePath = path.resolve(__dirname, '../app/repairs/page.tsx');
const customersPagePath = path.resolve(__dirname, '../app/customers/page.tsx');
const k80BuilderPath = path.resolve(__dirname, '../app/components/print/thermalK80HtmlBuilder.ts');
const a4BuilderPath = path.resolve(__dirname, '../app/components/print/a4ReceiptHtmlBuilder.ts');

test('OpenSpec: Warranty Intake & Compact Customer List', async (t) => {
  await t.test('1. Shared Types: order_type includes warranty', () => {
    assert.ok(fs.existsSync(typesOrderPath), 'packages/types/src/order.ts must exist');
    const content = fs.readFileSync(typesOrderPath, 'utf-8');
    assert.ok(
      content.includes("'warranty'"),
      'RepairOrder must include warranty in order_type union'
    );
    assert.ok(
      content.includes("order_type?: 'in_store' | 'cod' | 'warranty'"),
      'order_type must support in_store, cod, and warranty'
    );
  });

  await t.test('2. IntakeWizardModal: 3 intake buttons, warranty price 0 ₫, and validation', () => {
    assert.ok(fs.existsSync(intakeWizardPath), 'IntakeWizardModal.tsx must exist');
    const content = fs.readFileSync(intakeWizardPath, 'utf-8');

    // 3 intake buttons in Step 1
    assert.ok(
      content.includes('order-type-in-store-btn'),
      'Must render in-store intake button'
    );
    assert.ok(
      content.includes('order-type-cod-btn'),
      'Must render COD intake button'
    );
    assert.ok(
      content.includes('order-type-warranty-btn'),
      'Must render warranty intake button'
    );
    assert.ok(
      content.includes('Tiếp nhận bảo hành'),
      'Must contain label "Tiếp nhận bảo hành"'
    );

    // Default price 0 ₫ and policy description for warranty
    assert.ok(
      content.includes('handleSelectOrderType'),
      'Must have handleSelectOrderType function'
    );
    assert.ok(
      content.includes('Bảo hành thiết bị theo chính sách FIXO'),
      'Must suggest default warranty policy text'
    );

    // Validation allows price >= 0 for warranty
    assert.ok(
      content.includes("orderType === 'warranty'"),
      'Must check orderType === warranty during validation'
    );
    assert.ok(
      content.includes('numPrice < 0'),
      'Must reject negative price while allowing 0 for warranty'
    );
  });

  await t.test('3. Repairs Page: Single Intake button, warranty filter tab, and badges', () => {
    assert.ok(fs.existsSync(repairsPagePath), 'repairs/page.tsx must exist');
    const content = fs.readFileSync(repairsPagePath, 'utf-8');

    // Filter tab
    assert.ok(
      content.includes('tab-filter-warranty'),
      'Must include tab-filter-warranty button'
    );
    assert.ok(
      content.includes('Đơn bảo hành'),
      'Must display text "Đơn bảo hành"'
    );

    // Table badge
    assert.ok(
      content.includes('badge-order-type-warranty'),
      'Must render badge-order-type-warranty in order table'
    );

    // Single intake button
    assert.ok(
      content.includes('Tiếp nhận thiết bị'),
      'Must have single intake button "Tiếp nhận thiết bị"'
    );
  });

  await t.test('4. Print Builders: Thermal K80 and A4 support warranty classification label', () => {
    assert.ok(fs.existsSync(k80BuilderPath), 'thermalK80HtmlBuilder.ts must exist');
    const k80Content = fs.readFileSync(k80BuilderPath, 'utf-8');

    assert.ok(
      k80Content.includes('formatOrderTypeLabel'),
      'Must define formatOrderTypeLabel'
    );
    assert.ok(
      k80Content.includes('LOẠI ĐƠN: TIẾP NHẬN BẢO HÀNH'),
      'Must output LOẠI ĐƠN: TIẾP NHẬN BẢO HÀNH'
    );
    assert.ok(
      k80Content.includes('formatMultiOrderTypeLabel'),
      'Must define formatMultiOrderTypeLabel'
    );

    assert.ok(fs.existsSync(a4BuilderPath), 'a4ReceiptHtmlBuilder.ts must exist');
    const a4Content = fs.readFileSync(a4BuilderPath, 'utf-8');
    assert.ok(
      a4Content.includes('formatOrderTypeLabel'),
      'a4ReceiptHtmlBuilder must use formatOrderTypeLabel'
    );
    assert.ok(
      a4Content.includes('formatMultiOrderTypeLabel'),
      'a4ReceiptHtmlBuilder must use formatMultiOrderTypeLabel'
    );
  });

  await t.test('5. Customers Page: Compact Dense List (48px-52px) and Detail Modal', () => {
    assert.ok(fs.existsSync(customersPagePath), 'customers/page.tsx must exist');
    const content = fs.readFileSync(customersPagePath, 'utf-8');

    // Compact Dense List
    assert.ok(
      content.includes('compact-customer-list'),
      'Must render compact-customer-list container'
    );
    assert.ok(
      content.includes('min-h-[48px] max-h-[52px]') || content.includes('max-h-[52px]'),
      'Each customer row must maintain compact height ~48px-52px'
    );
    assert.ok(
      content.includes('w-8 h-8 rounded-full'),
      'Must render compact 32px avatar (w-8 h-8)'
    );

    // Detail Modal with 3 Stat Cards
    assert.ok(
      content.includes('modal-stat-total-spent'),
      'Must include total spent stat card in modal'
    );
    assert.ok(
      content.includes('modal-stat-orders-count'),
      'Must include orders count stat card in modal'
    );
    assert.ok(
      content.includes('modal-stat-warranties-count'),
      'Must include warranties count stat card in modal'
    );

    // Customer History List & Actions
    assert.ok(
      content.includes('customer-history-list'),
      'Must render customer-history-list in modal'
    );
    assert.ok(
      content.includes('btn-copy-phone'),
      'Must provide quick copy phone button'
    );
    assert.ok(
      content.includes('btn-call-phone'),
      'Must provide quick call phone link'
    );
    assert.ok(
      content.includes('modal-intake-for-customer-btn'),
      'Must provide button to intake new device for this customer'
    );
    assert.ok(
      content.includes('IntakeWizardModal'),
      'Must embed IntakeWizardModal for direct intake from customer profile'
    );
  });
});
