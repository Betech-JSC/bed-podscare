import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '..');

const wizardPath = path.join(webDir, 'app/components/IntakeWizardModal.tsx');
const repairsPagePath = path.join(webDir, 'app/repairs/page.tsx');
const k80BuilderPath = path.join(webDir, 'app/components/print/thermalK80HtmlBuilder.ts');
const a4BuilderPath = path.join(webDir, 'app/components/print/a4ReceiptHtmlBuilder.ts');

test('Warranty Intake Shipping Address - Comprehensive Verification Test Suite', async (t) => {
  const wizardSource = fs.readFileSync(wizardPath, 'utf8');
  const repairsSource = fs.readFileSync(repairsPagePath, 'utf8');
  const k80Source = fs.readFileSync(k80BuilderPath, 'utf8');
  const a4Source = fs.readFileSync(a4BuilderPath, 'utf8');

  await t.test('1. Intake Wizard: Field Visibility, Labels & Helper text for Warranty orders', () => {
    // 1.1 Mở rộng điều kiện hiển thị cho cả cod lẫn warranty
    assert.ok(
      wizardSource.includes("(orderType === 'cod' || orderType === 'warranty')"),
      'IntakeWizardModal must render shipping address input for both cod and warranty orders'
    );

    // 1.2 Test ID bảo toàn
    assert.ok(
      wizardSource.includes('data-testid="cod-shipping-address-input"'),
      'IntakeWizardModal must retain cod-shipping-address-input testid'
    );

    // 1.3 Label theo ngữ cảnh đơn bảo hành và COD
    assert.ok(
      wizardSource.includes("orderType === 'warranty'\n                          ? 'Địa chỉ gửi trả máy bảo hành (Dành cho khách gửi bưu điện)'\n                          : 'Địa chỉ nhận lại máy (Giao hàng COD)'"),
      'IntakeWizardModal must display contextual label for warranty and cod'
    );

    // 1.4 Tag tùy chọn
    assert.ok(
      wizardSource.includes('(Tùy chọn — có thể cập nhật sau)'),
      'IntakeWizardModal must show optional tag'
    );

    // 1.5 Helper text theo ngữ cảnh đơn bảo hành
    assert.ok(
      wizardSource.includes("orderType === 'warranty'\n                        ? 'Không bắt buộc — Bỏ trống nếu khách bảo hành trực tiếp tại cửa hàng hoặc chưa có địa chỉ gửi trả.'\n                        : 'Không bắt buộc — CSKH có thể nhận máy trước rồi liên hệ khách bổ sung sau.'"),
      'IntakeWizardModal must display contextual helper text for warranty and cod'
    );
  });

  await t.test('2. Intake Wizard: Form State Preservation on Tab Switches', () => {
    // Chỉ xóa trắng khi chuyển sang in_store
    assert.ok(
      wizardSource.includes("if (type === 'in_store') {\n      setShippingAddress('');\n    }"),
      'handleSelectOrderType must only reset shippingAddress when switching to in_store'
    );

    // Không có lệnh reset khi chuyển giữa cod và warranty
    assert.ok(
      !wizardSource.includes("if (type !== 'cod') {\n      setShippingAddress('');\n    }"),
      'handleSelectOrderType must NOT reset shippingAddress when switching between cod and warranty'
    );
  });

  await t.test('3. Intake Wizard: API Payload & Local State for Warranty & COD Orders', () => {
    // Payload gửi lên API createIntake
    assert.ok(
      wizardSource.includes("shipping_address: (orderType === 'cod' || orderType === 'warranty') && shippingAddress.trim() ? shippingAddress.trim() : undefined"),
      'IntakeWizardModal must include shipping_address in payload for both cod and warranty'
    );

    // Local newOrder state gán cả snake_case và camelCase
    assert.ok(
      wizardSource.includes("shipping_address: (orderType === 'cod' || orderType === 'warranty') && shippingAddress.trim() ? shippingAddress.trim() : null"),
      'IntakeWizardModal must set newOrder.shipping_address for both cod and warranty'
    );
    assert.ok(
      wizardSource.includes("shippingAddress: (orderType === 'cod' || orderType === 'warranty') && shippingAddress.trim() ? shippingAddress.trim() : null"),
      'IntakeWizardModal must set newOrder.shippingAddress for both cod and warranty'
    );
  });

  await t.test('4. Order Detail Drawer: Card Condition, Contextual Title & Inline Edit for Warranty', () => {
    // 4.1 Điều kiện hiển thị card trong Drawer cho đơn COD, Warranty hoặc đơn có tồn tại shipping_address
    assert.ok(
      repairsSource.includes("const isWarrantyOrder = selectedOrder.order_type === 'warranty' || selectedOrder.orderType === 'warranty';"),
      'repairs page must identify warranty order'
    );
    assert.ok(
      repairsSource.includes("const shouldShowShippingCard = isCodOrder || isWarrantyOrder || hasShippingAddress;"),
      'repairs page must show shipping card for cod, warranty, or when shipping address exists'
    );

    // 4.2 Test IDs hiện diện
    assert.ok(
      repairsSource.includes('data-testid="cod-shipping-address-card"'),
      'repairs page drawer must render cod-shipping-address-card'
    );
    assert.ok(
      repairsSource.includes('data-testid="edit-cod-shipping-address-btn"'),
      'repairs page drawer must render edit-cod-shipping-address-btn'
    );
    assert.ok(
      repairsSource.includes('data-testid="inline-shipping-address-input"'),
      'repairs page drawer must render inline-shipping-address-input'
    );
    assert.ok(
      repairsSource.includes('data-testid="save-cod-shipping-address-btn"'),
      'repairs page drawer must render save-cod-shipping-address-btn'
    );

    // 4.3 Tiêu đề card theo ngữ cảnh đơn bảo hành vs COD
    assert.ok(
      repairsSource.includes("isWarrantyOrder\n                          ? 'ĐỊA CHỈ GỬI TRẢ MÁY BẢO HÀNH (KHÁCH TỈNH)'\n                          : 'ĐỊA CHỈ GIAO HÀNG COD (KHÁCH TỈNH)'"),
      'repairs page drawer must display contextual header for warranty vs cod'
    );

    // 4.4 Nội dung thông báo khi chưa có địa chỉ
    assert.ok(
      repairsSource.includes("isWarrantyOrder\n                                ? 'Chưa cập nhật địa chỉ gửi trả (CSKH ghi chú sau khi liên hệ khách)'\n                                : 'Chưa cập nhật địa chỉ giao hàng (CSKH ghi chú sau khi liên hệ khách)'"),
      'repairs page drawer must display contextual empty message'
    );

    // 4.5 Gọi repairService.updateOrder khi lưu
    assert.ok(
      repairsSource.includes("await repairService.updateOrder(selectedOrder.id, {\n        shipping_address: addressValue,\n      })"),
      'handleSaveShippingAddress must update shipping_address via API'
    );

    // 4.6 Toast thông báo thành công cho đơn bảo hành
    assert.ok(
      repairsSource.includes("isWarranty\n          ? 'Đã cập nhật địa chỉ gửi trả bảo hành thành công!'\n          : 'Đã cập nhật địa chỉ giao hàng COD thành công!'"),
      'handleSaveShippingAddress must toast appropriate message for warranty vs cod'
    );
  });

  await t.test('5. Print Slips Integrity: Strict Exclusion of shipping_address on Thermal K80 and A4 slips', () => {
    // Mẫu in nhiệt K80 tuyệt đối không chứa shipping_address
    assert.ok(
      !k80Source.includes('shipping_address') && !k80Source.includes('shippingAddress'),
      'thermalK80HtmlBuilder must NOT reference shipping_address or shippingAddress'
    );

    // Mẫu in A4 tuyệt đối không chứa shipping_address
    assert.ok(
      !a4Source.includes('shipping_address') && !a4Source.includes('shippingAddress'),
      'a4ReceiptHtmlBuilder must NOT reference shipping_address or shippingAddress'
    );
  });
});
