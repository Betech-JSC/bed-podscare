import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

test('Task 2.1: PaymentService confirmPayment & TenantSettings Bank Fields Verification', () => {
  const paymentServicePath = path.resolve(rootDir, 'packages/api-client/src/services/payment.service.ts');
  assert.ok(fs.existsSync(paymentServicePath), 'payment.service.ts phải tồn tại');
  const paymentContent = fs.readFileSync(paymentServicePath, 'utf-8');

  assert.ok(
    paymentContent.includes('confirmPayment('),
    'PaymentService phải có phương thức confirmPayment'
  );
  assert.ok(
    paymentContent.includes('/confirm'),
    'confirmPayment phải gọi endpoint /api/v1/payments/{paymentId}/confirm'
  );

  const tenantServicePath = path.resolve(rootDir, 'packages/api-client/src/services/tenant.service.ts');
  assert.ok(fs.existsSync(tenantServicePath), 'tenant.service.ts phải tồn tại');
  const tenantContent = fs.readFileSync(tenantServicePath, 'utf-8');

  assert.ok(
    tenantContent.includes('bank_code?: string | null'),
    'TenantBrandingSettings phải có bank_code'
  );
  assert.ok(
    tenantContent.includes('bank_account_number?: string | null'),
    'TenantBrandingSettings phải có bank_account_number'
  );
  assert.ok(
    tenantContent.includes('bank_account_holder?: string | null'),
    'TenantBrandingSettings phải có bank_account_holder'
  );
  assert.ok(
    tenantContent.includes('export interface TenantSettings'),
    'Phải export interface TenantSettings'
  );

  // Check exports in index.ts and paymentService.ts
  const indexPath = path.resolve(rootDir, 'packages/api-client/src/index.ts');
  const indexContent = fs.readFileSync(indexPath, 'utf-8');
  assert.ok(
    indexContent.includes('./services/payment.service'),
    'index.ts phải export payment.service'
  );
  assert.ok(
    indexContent.includes('./services/tenant.service'),
    'index.ts phải export tenant.service'
  );

  const paymentServiceAliasPath = path.resolve(rootDir, 'packages/api-client/src/services/paymentService.ts');
  const aliasContent = fs.readFileSync(paymentServiceAliasPath, 'utf-8');
  assert.ok(
    aliasContent.includes('./payment.service'),
    'paymentService.ts phải re-export ./payment.service'
  );
});

test('Task 2.2: Tenant Branding Page Bank Account Configuration Verification', () => {
  const brandingPagePath = path.resolve(__dirname, '../app/branding/page.tsx');
  assert.ok(fs.existsSync(brandingPagePath), 'branding/page.tsx phải tồn tại');
  const content = fs.readFileSync(brandingPagePath, 'utf-8');

  // Kiểm tra state và input ngân hàng
  assert.ok(content.includes('bankCode'), 'Phải có state bankCode');
  assert.ok(content.includes('bankAccountNumber'), 'Phải có state bankAccountNumber');
  assert.ok(content.includes('bankAccountHolder'), 'Phải có state bankAccountHolder');

  // Kiểm tra các ngân hàng phổ biến trong dropdown
  assert.ok(content.includes('value="MB"'), 'Phải hỗ trợ MBBank');
  assert.ok(content.includes('value="VCB"'), 'Phải hỗ trợ Vietcombank');
  assert.ok(content.includes('value="TCB"'), 'Phải hỗ trợ Techcombank');
  assert.ok(content.includes('value="ACB"'), 'Phải hỗ trợ ACB');
  assert.ok(content.includes('value="VietinBank"'), 'Phải hỗ trợ VietinBank');
  assert.ok(content.includes('value="BIDV"'), 'Phải hỗ trợ BIDV');

  // Kiểm tra nạp và lưu qua tenantService
  assert.ok(content.includes('tenantService.getSettings()'), 'Phải gọi tenantService.getSettings()');
  assert.ok(content.includes('tenantService.updateSettings'), 'Phải gọi tenantService.updateSettings()');
  assert.ok(content.includes('toUpperNoDiacritics'), 'Phải chuẩn hóa tên chủ tài khoản viết hoa không dấu');
});

test('Task 2.3: Payments Page Quick Confirm Action for Pending Payments Verification', () => {
  const paymentsPagePath = path.resolve(__dirname, '../app/payments/page.tsx');
  assert.ok(fs.existsSync(paymentsPagePath), 'payments/page.tsx phải tồn tại');
  const content = fs.readFileSync(paymentsPagePath, 'utf-8');

  // Kiểm tra nút Duyệt đã nhận tiền
  assert.ok(
    content.includes('Duyệt đã nhận tiền'),
    'Bảng phiếu thu phải có nút hành động Duyệt đã nhận tiền'
  );
  assert.ok(
    content.includes('rawStatus === \'pending\''),
    'Nút duyệt chỉ hiển thị cho phiếu thu có trạng thái pending'
  );
  assert.ok(
    content.includes('paymentService.confirmPayment'),
    'Phải gọi paymentService.confirmPayment khi duyệt'
  );
  assert.ok(
    content.includes('handleConfirmPayment'),
    'Phải có hàm xử lý handleConfirmPayment'
  );
  assert.ok(
    content.includes('Thao tác'),
    'Bảng phiếu thu phải có cột Thao tác'
  );
});

test('Task 2.4: VietQrPaymentModal CSKH Confirmation & No-Polling Verification', () => {
  const modalPath = path.resolve(__dirname, '../app/components/VietQrPaymentModal.tsx');
  assert.ok(fs.existsSync(modalPath), 'VietQrPaymentModal.tsx phải tồn tại');
  const content = fs.readFileSync(modalPath, 'utf-8');

  // Loại bỏ polling lặp 2.5s SePay
  assert.ok(
    !content.includes('setInterval'),
    'VietQrPaymentModal TUYỆT ĐỐI KHÔNG chứa setInterval polling lặp'
  );
  assert.ok(
    !content.includes('usePaymentPolling'),
    'VietQrPaymentModal đã loại bỏ hook usePaymentPolling lặp 2.5s'
  );

  // Hiển thị STK, Tên chủ TK, Ngân hàng, mã VietQR
  assert.ok(content.includes('bankCode'), 'Modal phải hiển thị Ngân hàng');
  assert.ok(content.includes('accountNumber'), 'Modal phải hiển thị Số tài khoản');
  assert.ok(content.includes('accountName'), 'Modal phải hiển thị Chủ tài khoản');
  assert.ok(content.includes('effectiveQrUrl'), 'Modal phải hiển thị mã VietQR');

  // Nút bấm nổi bật CSKH và Audio chime
  assert.ok(
    content.includes('CSKH: Đã nhận tiền thành công'),
    'Modal phải có nút nổi bật "CSKH: Đã nhận tiền thành công"'
  );
  assert.ok(
    content.includes('paymentService.confirmPayment'),
    'Phải gọi paymentService.confirmPayment khi CSKH bấm xác nhận'
  );
  assert.ok(
    content.includes('playAudioChime'),
    'Phải gọi playAudioChime() khi xác nhận thành công'
  );
  assert.ok(
    content.includes('transactionRef'),
    'Modal phải có ô nhập mã GD ngân hàng (transactionRef)'
  );
});
