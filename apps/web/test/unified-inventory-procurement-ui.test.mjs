import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sidebarPath = path.join(__dirname, '../../../packages/ui/src/organisms/AppSidebar.tsx');
const inventoryPagePath = path.join(__dirname, '../app/inventory/page.tsx');
const suppliersRedirectPath = path.join(__dirname, '../app/suppliers/page.tsx');

const stockTabPath = path.join(__dirname, '../app/inventory/components/StockTab.tsx');
const receiptsTabPath = path.join(__dirname, '../app/inventory/components/ReceiptsTab.tsx');
const suppliersTabPath = path.join(__dirname, '../app/inventory/components/SuppliersTab.tsx');
const movementsTabPath = path.join(__dirname, '../app/inventory/components/MovementsTab.tsx');

const createPartTxModalPath = path.join(__dirname, '../app/inventory/components/CreatePartTransactionModal.tsx');
const createSupplierModalPath = path.join(__dirname, '../app/inventory/components/CreateSupplierModal.tsx');
const viewReceiptModalPath = path.join(__dirname, '../app/inventory/components/ViewReceiptDetailModal.tsx');
const repayDebtModalPath = path.join(__dirname, '../app/inventory/components/RepaySupplierDebtModal.tsx');
const debtHistoryModalPath = path.join(__dirname, '../app/inventory/components/SupplierDebtHistoryModal.tsx');
const createReceiptModalPath = path.join(__dirname, '../app/inventory/components/CreateGoodsReceiptModal.tsx');

describe('OpenSpec: unified-inventory-procurement-ui Verification', () => {
  const sidebarCode = fs.readFileSync(sidebarPath, 'utf-8');
  const inventoryPageCode = fs.readFileSync(inventoryPagePath, 'utf-8');
  const suppliersRedirectCode = fs.readFileSync(suppliersRedirectPath, 'utf-8');

  const stockTabCode = fs.readFileSync(stockTabPath, 'utf-8');
  const receiptsTabCode = fs.readFileSync(receiptsTabPath, 'utf-8');
  const suppliersTabCode = fs.readFileSync(suppliersTabPath, 'utf-8');
  const movementsTabCode = fs.readFileSync(movementsTabPath, 'utf-8');

  const createPartTxModalCode = fs.readFileSync(createPartTxModalPath, 'utf-8');
  const createSupplierModalCode = fs.readFileSync(createSupplierModalPath, 'utf-8');
  const viewReceiptModalCode = fs.readFileSync(viewReceiptModalPath, 'utf-8');
  const repayDebtModalCode = fs.readFileSync(repayDebtModalPath, 'utf-8');
  const debtHistoryModalCode = fs.readFileSync(debtHistoryModalPath, 'utf-8');
  const createReceiptModalCode = fs.readFileSync(createReceiptModalPath, 'utf-8');

  test('1. Sidebar Navigation Unification & Permission Cleanup', () => {
    // Operations navigation must contain unified "Kho & Mua hàng"
    assert.match(
      sidebarCode,
      /\{\s*id:\s*'inventory',\s*label:\s*'Kho & Mua hàng',\s*icon:\s*'inventory',\s*href:\s*'\/inventory'\s*\}/,
      'AppSidebar operationsNav must contain unified "Kho & Mua hàng" menu item pointing to /inventory'
    );

    // Old separate suppliers menu must not exist in operationsNav
    assert.strictEqual(
      sidebarCode.includes("id: 'suppliers', label: 'Nhà cung cấp & Nhập kho'"),
      false,
      'Separate "Nhà cung cấp & Nhập kho" nav item must be removed from AppSidebar'
    );

    // suppliers must be removed from rolePermissions
    const adminPermissionsMatch = sidebarCode.match(/admin:\s*\[([\s\S]*?)\]/);
    assert.ok(adminPermissionsMatch, 'admin permissions array found');
    assert.strictEqual(
      adminPermissionsMatch[1].includes("'suppliers'"),
      false,
      "'suppliers' must be removed from admin rolePermissions"
    );

    const inventoryPermissionsMatch = sidebarCode.match(/inventory:\s*\[([\s\S]*?)\]/);
    assert.ok(inventoryPermissionsMatch, 'inventory permissions array found');
    assert.strictEqual(
      inventoryPermissionsMatch[1].includes("'suppliers'"),
      false,
      "'suppliers' must be removed from inventory rolePermissions"
    );

    // Active state matching handles query params
    assert.match(sidebarCode, /currentPath\.split\('\?'\)\[0\]/, 'Sidebar active matching sanitizes query parameters');
  });

  test('2. Master Inventory Page Multi-Tab Coordination & Suspense Boundary', () => {
    // Breadcrumb and headers
    assert.match(inventoryPageCode, /crumbName="Kho & Mua hàng"/, 'Crumb name is "Kho & Mua hàng"');
    assert.match(inventoryPageCode, /Kho & Mua hàng/, 'Header title is "Kho & Mua hàng"');

    // Suspense Boundary wrapping
    assert.match(inventoryPageCode, /<Suspense fallback=/, 'Master view is wrapped in React Suspense boundary');

    // URL SearchParams bidirectional sync
    assert.match(inventoryPageCode, /useSearchParams/, 'Uses Next.js useSearchParams for query params');
    assert.match(inventoryPageCode, /useRouter/, 'Uses Next.js useRouter for navigation');
    assert.match(inventoryPageCode, /VALID_TABS/, 'Defines VALID_TABS array');
    assert.match(inventoryPageCode, /rawTab && VALID_TABS\.includes\(rawTab\)\s*\?\s*rawTab\s*:\s*'stock'/, 'Falls back to "stock" on invalid or missing tab');

    // 4 Tabs configured
    assert.match(inventoryPageCode, /id:\s*'stock',\s*label:\s*'Tồn kho & Kệ tủ'/, 'Configures Stock tab');
    assert.match(inventoryPageCode, /id:\s*'receipts',\s*label:\s*'Nhập hàng từ NCC'/, 'Configures Receipts tab');
    assert.match(inventoryPageCode, /id:\s*'suppliers',\s*label:\s*'Nhà cung cấp & Sổ nợ'/, 'Configures Suppliers tab');
    assert.match(inventoryPageCode, /id:\s*'movements',\s*label:\s*'Thẻ kho & Biến động'/, 'Configures Movements tab');

    // Rendering tab components conditionally
    assert.match(inventoryPageCode, /activeTab === 'stock' &&\s*\(?\s*<StockTab/, 'Renders StockTab');
    assert.match(inventoryPageCode, /activeTab === 'receipts' &&\s*\(?\s*<ReceiptsTab/, 'Renders ReceiptsTab');
    assert.match(inventoryPageCode, /activeTab === 'suppliers' &&\s*\(?\s*<SuppliersTab/, 'Renders SuppliersTab');
    assert.match(inventoryPageCode, /activeTab === 'movements' &&\s*\(?\s*<MovementsTab/, 'Renders MovementsTab');
  });

  test('3. Backward Compatibility Redirect for Legacy /suppliers Route', () => {
    assert.match(suppliersRedirectCode, /useRouter/, 'Uses useRouter for client redirection');
    assert.match(suppliersRedirectCode, /useSearchParams/, 'Preserves existing search parameters');
    assert.match(suppliersRedirectCode, /params\.set\('tab',\s*'suppliers'\)/, 'Sets tab=suppliers on target URL');
    assert.match(suppliersRedirectCode, /router\.replace\(`\/inventory\?\$\{params\.toString\(\)\}`\)/, 'Replaces URL to /inventory?tab=suppliers');
    assert.match(suppliersRedirectCode, /<Suspense fallback=/, 'Wrapped in Suspense to prevent build de-opt');
  });

  test('4. StockTab Implementation & COGS RBAC Protection', () => {
    assert.match(stockTabCode, /inventory-parts/, 'Queries inventory-parts API');
    assert.match(stockTabCode, /MÃ LINH KIỆN/, 'Displays SKU count KPI');
    assert.match(stockTabCode, /TỔNG SỐ LƯỢNG TỒN/, 'Displays Total items KPI');
    assert.match(stockTabCode, /CẢNH BÁO SẮP HẾT/, 'Displays Low stock alert KPI');
    assert.match(stockTabCode, /role === 'admin' && \([\s\S]*?TỔNG GIÁ TRỊ VỐN KHO/, 'Guards COGS valuation card for admin role only');
    assert.match(stockTabCode, /role === 'admin' && <th className="px-3">Giá vốn \(MAC\)<\/th>/, 'Guards cost price table column for admin only');
    assert.match(stockTabCode, /availableShelves/, 'Calculates shelf location filters');
  });

  test('5. ReceiptsTab Implementation & Goods Receipts Workflows', () => {
    assert.match(receiptsTabCode, /goods-receipts/, 'Queries goods-receipts API');
    assert.match(receiptsTabCode, /PHIẾU NHẬP KHO CHÍNH QUY \(MAC\)/, 'Receipts sub-header');
    assert.match(receiptsTabCode, /ViewReceiptDetailModal/, 'Integrates ViewReceiptDetailModal');
    assert.match(receiptsTabCode, /CreateGoodsReceiptModal/, 'Integrates CreateGoodsReceiptModal');
    assert.match(receiptsTabCode, /gr\.receipt_code/, 'Renders receipt code');
    assert.match(receiptsTabCode, /gr\.final_amount/, 'Renders final amount');
    assert.match(receiptsTabCode, /gr\.debt_amount/, 'Renders debt amount');
  });

  test('6. SuppliersTab Implementation & Accounts Payable Management', () => {
    assert.match(suppliersTabCode, /NHÀ CUNG CẤP & CÔNG NỢ PHẢI TRẢ \(AP\)/, 'Suppliers sub-header');
    assert.match(suppliersTabCode, /Tiền NCC còn phải trả/, 'Displays Accounts Payable KPI');
    assert.match(suppliersTabCode, /Số NCC có công nợ/, 'Displays In-debt suppliers KPI');
    assert.match(suppliersTabCode, /hasDebtFilter/, 'Provides debt filter');
    assert.match(suppliersTabCode, /RepaySupplierDebtModal/, 'Integrates RepaySupplierDebtModal');
    assert.match(suppliersTabCode, /SupplierDebtHistoryModal/, 'Integrates SupplierDebtHistoryModal');
    assert.match(suppliersTabCode, /CreateSupplierModal/, 'Integrates CreateSupplierModal');
  });

  test('7. MovementsTab Implementation & Full-Chain Stock Card Audit Log', () => {
    assert.match(movementsTabCode, /inventory-transactions/, 'Queries inventory transactions API');
    assert.match(movementsTabCode, /THẺ KHO & LỊCH SỬ BIẾN ĐỘNG TOÀN CHUỖI/, 'Movements sub-header');
    assert.match(movementsTabCode, /selectedType/, 'Provides transaction type filter');
    assert.match(movementsTabCode, /export_repair/, 'Handles repair consumption transaction type');
    assert.match(movementsTabCode, /role === 'admin' && <th className="px-3 text-right">Giá vốn \(MAC\)<\/th>/, 'Protects unit_cost in movements for admin only');
  });

  test('8. Sub-components & Modals Integrity', () => {
    // CreatePartTransactionModal
    assert.match(createPartTxModalCode, /inventoryService\.createTransaction/, 'Calls createTransaction API');
    assert.match(createPartTxModalCode, /import|export_repair|export_damage|adjust_inventory/, 'Supports 4 transaction types');

    // CreateSupplierModal
    assert.match(createSupplierModalCode, /supplierService\.createSupplier/, 'Supports creating supplier');
    assert.match(createSupplierModalCode, /supplierService\.updateSupplier/, 'Supports updating supplier');

    // ViewReceiptDetailModal
    assert.match(viewReceiptModalCode, /receipt\.receipt_code/, 'Displays receipt code');
    assert.match(viewReceiptModalCode, /receipt\.items/, 'Displays receipt line items');

    // RepaySupplierDebtModal
    assert.match(repayDebtModalCode, /drawerBalance\?\.has_active_shift/, 'Validates active shift drawer');
    assert.match(repayDebtModalCode, /drawerBalance\.current_cash_balance < amount/, 'Validates drawer balance sufficiency');
    assert.match(repayDebtModalCode, /supplierService\.repayDebt/, 'Calls repayDebt API');

    // SupplierDebtHistoryModal
    assert.match(debtHistoryModalCode, /supplierService\.getDebtHistory/, 'Fetches debt ledger history');

    // CreateGoodsReceiptModal
    assert.match(createReceiptModalCode, /receiptTotalAmount - disc/, 'Calculates net amount after discount');
    assert.match(createReceiptModalCode, /receiptFinalAmount - paid/, 'Calculates debt amount to record');
    assert.match(createReceiptModalCode, /supplierService\.createGoodsReceipt/, 'Submits goods receipt with MAC');
  });

  test('9. Design Tokens & Zero-Emoji Compliance', () => {
    const allFiles = [
      inventoryPageCode,
      suppliersRedirectCode,
      stockTabCode,
      receiptsTabCode,
      suppliersTabCode,
      movementsTabCode,
      createPartTxModalCode,
      createSupplierModalCode,
      viewReceiptModalCode,
      repayDebtModalCode,
      debtHistoryModalCode,
      createReceiptModalCode,
    ];

    const forbiddenEmojis = ['📦', '🏪', '📋', '⚡', '🖨️', '⚠️', '➕', '💬', '👋', '🟢', '🟡', '🔧', '✓', '★'];
    for (const code of allFiles) {
      for (const emoji of forbiddenEmojis) {
        assert.strictEqual(code.includes(emoji), false, `Must not contain emoji ${emoji}`);
      }
      assert.strictEqual(code.includes('lucide'), false, 'Must not import lucide icons');
      assert.strictEqual(code.includes('react-icons'), false, 'Must not import react-icons');
    }
  });
});
