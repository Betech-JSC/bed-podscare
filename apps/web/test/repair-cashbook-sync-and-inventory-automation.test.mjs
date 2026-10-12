import assert from 'node:assert';
import test, { describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');
const webDir = path.resolve(__dirname, '..');

describe('OpenSpec: repair-cashbook-sync-and-inventory-automation Frontend Verification', () => {
  test('Task 2.4: CreateExpenseModal enforces active shift and cash drawer overdraft guardrails', () => {
    const modalPath = path.resolve(webDir, 'app/components/CreateExpenseModal.tsx');
    assert.ok(fs.existsSync(modalPath), 'CreateExpenseModal.tsx must exist');

    const content = fs.readFileSync(modalPath, 'utf8');
    // Enforces shift check
    assert.ok(
      content.includes('Chi nhánh chưa mở ca trực. Không thể xuất tiền mặt từ két.'),
      'Must guard against expense when no active shift is open'
    );
    // Enforces overdraft check
    assert.ok(
      content.includes('Số dư két tiền mặt hiện tại không đủ'),
      'Must guard against expense exceeding available expected_cash'
    );
    assert.ok(
      content.includes('amount > availableCash'),
      'Must check if expense amount > availableCash'
    );
  });

  test('Task 1.5: ShiftsPage includes repair_order_cash in CATEGORY_LABELS', () => {
    const shiftsPagePath = path.resolve(webDir, 'app/shifts/page.tsx');
    assert.ok(fs.existsSync(shiftsPagePath), 'shifts/page.tsx must exist');

    const content = fs.readFileSync(shiftsPagePath, 'utf8');
    assert.ok(
      content.includes('repair_order_cash'),
      'CATEGORY_LABELS must define repair_order_cash'
    );
    assert.ok(
      content.includes('Thu tiền mặt sửa chữa'),
      'repair_order_cash must display human readable label'
    );
  });

  test('Task 4.4: InventoryPage passes branch_id (selectedWarehouse) to query', () => {
    const invPagePath = path.resolve(webDir, 'app/inventory/page.tsx');
    const stockTabPath = path.resolve(webDir, 'app/inventory/components/StockTab.tsx');
    assert.ok(fs.existsSync(invPagePath), 'inventory/page.tsx must exist');

    const content = fs.existsSync(stockTabPath)
      ? fs.readFileSync(stockTabPath, 'utf8')
      : fs.readFileSync(invPagePath, 'utf8');
    assert.ok(
      content.includes("queryKey: ['inventory-parts', selectedWarehouse"),
      'Inventory useQuery key must react to selectedWarehouse'
    );
    assert.ok(
      content.includes('branch_id: selectedWarehouse ? Number(selectedWarehouse) : undefined'),
      'inventoryService.getParts must receive branch_id'
    );
  });

  test('Task 4.3: InventoryService in @podscare/api-client supports branch_id in getParts', () => {
    const invServicePath = path.resolve(rootDir, 'packages/api-client/src/services/inventory.service.ts');
    assert.ok(fs.existsSync(invServicePath), 'inventory.service.ts must exist');

    const content = fs.readFileSync(invServicePath, 'utf8');
    assert.ok(
      content.includes('branch_id?: number | string;'),
      'InventoryService.getParts must declare branch_id parameter'
    );
  });

  test('Task 5.4: Dashboard prioritizes standardized accounts_receivable metric', () => {
    const dashboardPagePath = path.resolve(webDir, 'app/dashboard/page.tsx');
    assert.ok(fs.existsSync(dashboardPagePath), 'dashboard/page.tsx must exist');

    const content = fs.readFileSync(dashboardPagePath, 'utf8');
    assert.ok(
      content.includes('kpiData?.accounts_receivable_formatted ||'),
      'Dashboard must prioritize accounts_receivable_formatted for AR stat card'
    );
    assert.ok(
      content.includes('Đơn bàn giao chưa thu đủ'),
      'Dashboard StatCard should indicate delivered unpaid orders'
    );
  });
});
