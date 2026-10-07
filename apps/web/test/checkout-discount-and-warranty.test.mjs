import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Checkout Discount and Warranty Options Test Suite', async (t) => {
  const modalPath = path.resolve(__dirname, '../app/components/CheckoutHandoverModal.tsx');
  assert.ok(fs.existsSync(modalPath), 'CheckoutHandoverModal.tsx phải tồn tại');
  const modalContent = fs.readFileSync(modalPath, 'utf-8');

  await t.test('1. CheckoutHandoverModal: Cấu trúc 4 tùy chọn bảo hành linh hoạt (3, 6, 9, 12 tháng)', () => {
    // Kiểm tra khởi tạo mặc định 3 tháng
    assert.ok(
      modalContent.includes('useState<3 | 6 | 9 | 12>(3)'),
      'Thời hạn bảo hành mặc định phải là 3 tháng'
    );

    // Kiểm tra map ngày bảo hành chuẩn
    assert.ok(modalContent.includes('3: 90'), '3 tháng = 90 ngày');
    assert.ok(modalContent.includes('6: 180'), '6 tháng = 180 ngày');
    assert.ok(modalContent.includes('9: 270'), '9 tháng = 270 ngày');
    assert.ok(modalContent.includes('12: 365'), '12 tháng = 365 ngày (1 năm chuẩn)');

    // Kiểm tra hiển thị 4 nút bấm
    assert.ok(modalContent.includes('WARRANTY_OPTIONS'), 'Phải có danh sách tùy chọn bảo hành');
    assert.ok(modalContent.includes('Hạn bảo hành dự kiến'), 'Phải hiển thị ngày hết hạn bảo hành dự kiến');
  });

  await t.test('2. CheckoutHandoverModal: Khối Giảm giá / Khuyến mãi linh hoạt (% và ₫)', () => {
    // Chế độ giảm giá none | percent | fixed
    assert.ok(
      modalContent.includes("useState<'none' | 'percent' | 'fixed'>('none')"),
      'Chế độ giảm giá mặc định phải là none'
    );

    // Các nút chọn nhanh %
    assert.ok(modalContent.includes('QUICK_PERCENT_OPTIONS'), 'Phải có danh sách nút chọn nhanh %');
    assert.ok(modalContent.includes('5') && modalContent.includes('10') && modalContent.includes('15') && modalContent.includes('20'), 'Phải hỗ trợ các mức 5%, 10%, 15%, 20%');

    // Các nút chọn nhanh tiền mặt
    assert.ok(modalContent.includes('QUICK_FIXED_OPTIONS'), 'Phải có danh sách nút chọn nhanh tiền mặt');
    assert.ok(modalContent.includes('20000') && modalContent.includes('50000') && modalContent.includes('100000'), 'Phải hỗ trợ các mức 20k, 50k, 100k');

    // Nút bỏ giảm giá
    assert.ok(modalContent.includes('Bỏ giảm giá') || modalContent.includes('handleClearDiscount'), 'Phải có nút xóa / bỏ giảm giá');
  });

  await t.test('3. CheckoutHandoverModal: Logic tính toán số tiền thực thu và chặn giá trị âm', () => {
    // Thuật toán tính chiết khấu
    assert.ok(modalContent.includes('calculatedDiscountAmount'), 'Phải có useMemo tính số tiền giảm giá');
    assert.ok(modalContent.includes('finalAmount'), 'Phải tính finalAmount thực thu');
    assert.ok(modalContent.includes('Math.max(0, rawTotal - calculatedDiscountAmount)'), 'Số tiền thực thu không bao giờ được âm');

    // Kiểm tra gửi payload sang simpleCheckout
    assert.ok(modalContent.includes('amount: finalAmount'), 'Phải gửi amount là số tiền thực thu sau chiết khấu');
    assert.ok(modalContent.includes('discount_type'), 'Phải gửi discount_type');
    assert.ok(modalContent.includes('discount_amount'), 'Phải gửi discount_amount');
    assert.ok(modalContent.includes('warranty_months: warrantyMonths'), 'Phải gửi warranty_months');
    assert.ok(modalContent.includes('warranty_terms_days: WARRANTY_MONTH_DAYS_MAP[warrantyMonths]'), 'Phải gửi warranty_terms_days');
  });

  await t.test('4. In ấn nhiệt K80: Phân rã giảm giá và cam kết bảo hành điện tử', async () => {
    const { renderThermalK80HTML } = await import('../app/components/print/thermalK80HtmlBuilder.ts');

    const sampleOrderWithDiscount = {
      id: 'FX26-T1001',
      name: 'Nguyễn Văn Test',
      phone: '0901234567',
      device: 'AirPods Pro 2',
      issue: 'Thay pin',
      status: 'Hoàn tất',
      statusType: 'gray',
      price: 500000,
      total_price: 500000,
      initial_price: 500000,
      discount_amount: 50000,
      discount_type: 'fixed',
      warranty_months: 6,
      warranty_terms_days: 180,
      date: '07/10/2026',
      branch: 'FIXO Q1',
    };

    const html = renderThermalK80HTML(sampleOrderWithDiscount);

    // Kiểm tra dòng giảm giá
    assert.ok(html.includes('Giảm giá:'), 'K80 phải hiển thị dòng Giảm giá');
    assert.ok(html.includes('-50.000'), 'K80 phải hiển thị số tiền giảm -50.000 ₫');
    assert.ok(html.includes('TỔNG THỰC THU:'), 'K80 phải hiển thị nhãn Tổng thực thu');
    assert.ok(html.includes('450.000'), 'K80 phải hiển thị số tiền thực thu là 450.000 ₫');

    // Kiểm tra dòng bảo hành điện tử
    assert.ok(html.includes('BẢO HÀNH ĐIỆN TỬ: 6 THÁNG'), 'K80 phải có tiêu đề bảo hành 6 tháng');
    assert.ok(html.includes('Thời hạn bảo hành: 6 tháng'), 'K80 phải ghi rõ số tháng bảo hành');
    assert.ok(html.includes('Đến ngày'), 'K80 phải có ngày hết hạn bảo hành');
  });

  await t.test('5. In ấn biên nhận A4: Hiển thị chiết khấu giảm giá và thời hạn bảo hành cam kết', () => {
    const a4BuilderPath = path.resolve(__dirname, '../app/components/print/a4ReceiptHtmlBuilder.ts');
    assert.ok(fs.existsSync(a4BuilderPath), 'a4ReceiptHtmlBuilder.ts phải tồn tại');
    const a4Content = fs.readFileSync(a4BuilderPath, 'utf-8');

    // Kiểm tra dòng giảm giá
    assert.ok(a4Content.includes('Giảm giá:'), 'a4ReceiptHtmlBuilder phải có dòng Giảm giá');
    assert.ok(a4Content.includes('finalPriceVal'), 'a4ReceiptHtmlBuilder phải tính finalPriceVal');
    assert.ok(a4Content.includes('TỔNG THANH TOÁN THỰC THU:'), 'a4ReceiptHtmlBuilder phải có tiêu đề Tổng thanh toán thực thu');

    // Kiểm tra thời hạn bảo hành
    assert.ok(a4Content.includes('Thời hạn bảo hành:'), 'a4ReceiptHtmlBuilder phải ghi nhận Thời hạn bảo hành');
    assert.ok(a4Content.includes('formattedExpiryDate'), 'a4ReceiptHtmlBuilder phải hiển thị ngày hết hạn formattedExpiryDate');

    // Kiểm tra A4ReceiptTemplate.tsx
    const a4TemplatePath = path.resolve(__dirname, '../app/components/print/A4ReceiptTemplate.tsx');
    assert.ok(fs.existsSync(a4TemplatePath), 'A4ReceiptTemplate.tsx phải tồn tại');
    const templateContent = fs.readFileSync(a4TemplatePath, 'utf-8');

    assert.ok(templateContent.includes('Giảm giá:'), 'A4ReceiptTemplate phải có dòng Giảm giá');
    assert.ok(templateContent.includes('Tổng thanh toán thực thu'), 'A4ReceiptTemplate phải có dòng Tổng thanh toán thực thu');
    assert.ok(templateContent.includes('Thời hạn bảo hành:'), 'A4ReceiptTemplate phải có cam kết thời hạn bảo hành');
  });
});
