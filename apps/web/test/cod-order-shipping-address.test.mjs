import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(__dirname, '../../..');

const controllerPath = path.join(repoRoot, 'apps/api/app/Http/Controllers/Api/V1/OrderController.php');
const wizardPath = path.join(webDir, 'app/components/IntakeWizardModal.tsx');
const repairsPagePath = path.join(webDir, 'app/repairs/page.tsx');
const k80BuilderPath = path.join(webDir, 'app/components/print/thermalK80HtmlBuilder.ts');
const a4BuilderPath = path.join(webDir, 'app/components/print/a4ReceiptHtmlBuilder.ts');

test('COD Shipping Address Note - Code Review & Independent Verification', async (t) => {
  await t.test('1. Backend OrderController: RBAC on shipping_address update', () => {
    const controllerSource = fs.readFileSync(controllerPath, 'utf8');

    // Kiểm tra store cho phép shipping_address nullable
    assert.ok(
      controllerSource.includes("'shipping_address'      => 'nullable|string|max:500'"),
      'OrderController store validation must allow shipping_address nullable with max 500 chars'
    );

    // Kiểm tra RBAC: chặn non-cskh / non-admin khi cố update shipping_address
    assert.ok(
      controllerSource.includes("if ($request->has('shipping_address') && (! $user || ! in_array($user->role, ['cskh', 'admin', 'super_admin'], true)))"),
      'OrderController update must forbid roles other than cskh, admin, super_admin if shipping_address is sent'
    );
    assert.ok(
      controllerSource.includes("return $this->failure('Bạn không có quyền cập nhật địa chỉ giao hàng.', 403)"),
      'OrderController must return 403 failure message when unauthorized role tries to update shipping_address'
    );

    // Kiểm tra CSKH role được thêm rule shipping_address
    assert.ok(
      controllerSource.includes("if ($user && $user->role === 'cskh') {\n            $rules['shipping_address'] = 'nullable|string|max:500';\n        }"),
      'OrderController must allow cskh role to update shipping_address'
    );

    // Kiểm tra Admin update cho phép shipping_address
    assert.ok(
      controllerSource.includes("'shipping_address'      => 'nullable|string|max:500'"),
      'Admin full update rules must include shipping_address'
    );
  });

  await t.test('2. Frontend IntakeWizardModal: Shipping Address Field Visibility & Optional Nature (COD & Warranty)', () => {
    const wizardSource = fs.readFileSync(wizardPath, 'utf8');

    // Kiểm tra state shippingAddress
    assert.ok(
      wizardSource.includes("const [shippingAddress, setShippingAddress] = useState('')"),
      'IntakeWizardModal must manage shippingAddress state'
    );

    // Kiểm tra reset khi chuyển loại đơn sang in_store (bảo lưu khi qua lại giữa cod và warranty)
    assert.ok(
      wizardSource.includes("if (type === 'in_store') {\n      setShippingAddress('');\n    }"),
      'IntakeWizardModal must clear shippingAddress when switching to in_store'
    );

    // Kiểm tra trường hiển thị khi orderType === "cod" hoặc "warranty"
    assert.ok(
      wizardSource.includes("(orderType === 'cod' || orderType === 'warranty')"),
      'IntakeWizardModal must conditionally render shipping address when orderType is cod or warranty'
    );
    assert.ok(
      wizardSource.includes('data-testid="cod-shipping-address-input"'),
      'IntakeWizardModal must have cod-shipping-address-input test id'
    );
    assert.ok(
      wizardSource.includes('(Tùy chọn — có thể cập nhật sau)'),
      'IntakeWizardModal must clearly mark shipping address as optional'
    );

    // Kiểm tra payload chỉ đính kèm shipping_address khi orderType === 'cod' hoặc 'warranty' và có nội dung
    assert.ok(
      wizardSource.includes("shipping_address: (orderType === 'cod' || orderType === 'warranty') && shippingAddress.trim() ? shippingAddress.trim() : undefined"),
      'IntakeWizardModal payload must include shipping_address when orderType is cod or warranty and address is not empty'
    );
  });

  await t.test('3. Frontend Repairs Page: In-place COD Shipping Address Update for CSKH / Admin', () => {
    const repairsComponentsDir = path.join(path.dirname(repairsPagePath), 'components');
    const repairsComponentFiles = fs.existsSync(repairsComponentsDir)
      ? fs.readdirSync(repairsComponentsDir).filter((f) => f.endsWith('.tsx')).map((f) => fs.readFileSync(path.join(repairsComponentsDir, f), 'utf8'))
      : [];
    const repairsSource = [fs.readFileSync(repairsPagePath, 'utf8'), ...repairsComponentFiles].join('\n');

    // Kiểm tra phân quyền canManageShippingAddress
    assert.ok(
      repairsSource.includes("const canManageShippingAddress = role === 'cskh' || role === 'admin' || (role as string) === 'super_admin'"),
      'RepairsPage must restrict shipping address management to cskh and admin'
    );

    // Kiểm tra card địa chỉ COD trong drawer
    assert.ok(
      repairsSource.includes('data-testid="cod-shipping-address-card"'),
      'RepairsPage drawer must contain cod-shipping-address-card'
    );
    assert.ok(
      repairsSource.includes('data-testid="edit-cod-shipping-address-btn"'),
      'RepairsPage drawer must contain edit-cod-shipping-address-btn'
    );
    assert.ok(
      repairsSource.includes('data-testid="inline-shipping-address-input"'),
      'RepairsPage drawer must contain inline-shipping-address-input'
    );
    assert.ok(
      repairsSource.includes('data-testid="save-cod-shipping-address-btn"'),
      'RepairsPage drawer must contain save-cod-shipping-address-btn'
    );

    // Kiểm tra gọi API repairService.updateOrder khi lưu
    assert.ok(
      repairsSource.includes("await repairService.updateOrder(selectedOrder.id, {\n        shipping_address: addressValue,\n      })"),
      'handleSaveShippingAddress must invoke repairService.updateOrder with shipping_address'
    );
  });

  await t.test('4. Print Templates: Strict Privacy Verification (NO shipping address printed on receipts)', () => {
    const k80Source = fs.readFileSync(k80BuilderPath, 'utf8');
    const a4Source = fs.readFileSync(a4BuilderPath, 'utf8');

    // Xác thực k80Builder không bao giờ render shipping_address
    assert.ok(
      !k80Source.includes('shipping_address') && !k80Source.includes('shippingAddress'),
      'thermalK80HtmlBuilder must NOT reference shipping_address or shippingAddress'
    );

    // Xác thực a4Builder không bao giờ render shipping_address
    assert.ok(
      !a4Source.includes('shipping_address') && !a4Source.includes('shippingAddress'),
      'a4ReceiptHtmlBuilder must NOT reference shipping_address or shippingAddress'
    );
  });
});
