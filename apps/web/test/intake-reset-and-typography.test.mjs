import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const intakeWizardPath = path.resolve(__dirname, '../app/components/IntakeWizardModal.tsx');
const thermalK80HtmlPath = path.resolve(__dirname, '../app/components/print/thermalK80HtmlBuilder.ts');
const thermalK80ReceiptPath = path.resolve(__dirname, '../app/components/print/ThermalK80Receipt.tsx');
const a4ReceiptHtmlPath = path.resolve(__dirname, '../app/components/print/a4ReceiptHtmlBuilder.ts');
const a4ReceiptTemplatePath = path.resolve(__dirname, '../app/components/print/A4ReceiptTemplate.tsx');

// Import trực tiếp hàm render HTML để test chuỗi output thực tế
import { renderThermalK80HTML } from '../app/components/print/thermalK80HtmlBuilder.ts';

const mockOrder = {
  id: 'FX26-0042',
  name: 'Nguyễn Văn A',
  phone: '0988776655',
  deviceCategory: 'AirPods',
  device: 'AirPods Pro 2',
  serial: 'H12345XYZ',
  issue: 'Loa rè bên phải',
  accessories: 'Hộp sạc + 2 tai',
  branch: 'Chi nhánh Quận 1',
  branchId: 1,
  branchName: 'Chi nhánh Quận 1',
  status: 'Chờ khách duyệt',
  statusType: 'wait',
  price: 350000,
  priceNote: 'Thay pin tai phải',
  tech: 'KTV Nam',
  date: '05/10/2026',
  checks: [
    { label: 'Kết nối Bluetooth', status: 'Hoạt động' },
    { label: 'Âm thanh tai phải', status: 'Lỗi' },
  ],
  photos: [],
  appearance: 'Trầy xước nhẹ',
  testNote: 'Đã test tại quầy',
  createdBy: 'Thu Ngân 01',
  createdAt: new Date().toISOString(),
};

test('1. IntakeWizardModal: Centralized resetForm & 3-Tier Defense in Depth', async (t) => {
  assert.ok(fs.existsSync(intakeWizardPath), 'IntakeWizardModal.tsx phải tồn tại');
  const content = fs.readFileSync(intakeWizardPath, 'utf-8');

  await t.test('1.1 Hàm resetForm() tồn tại và dọn dẹp đủ 14 trường dữ liệu + 4 state điều hướng', () => {
    const resetFormRegex = /const resetForm = \(\) => \{([\s\S]*?)\};/;
    const match = content.match(resetFormRegex);
    assert.ok(match, 'Hàm resetForm() phải được định nghĩa trong IntakeWizardModal');
    const body = match[1];

    // 14 trường dữ liệu khách hàng & thiết bị
    assert.ok(body.includes("setName('')"), 'resetForm phải reset name về rỗng');
    assert.ok(body.includes("setPhone('')"), 'resetForm phải reset phone về rỗng');
    assert.ok(body.includes('setSelectedBranchId'), 'resetForm phải gán lại selectedBranchId hợp lệ');
    assert.ok(body.includes("setSelectedCategory('AirPods')"), 'resetForm phải reset category về AirPods');
    assert.ok(body.includes('setSelectedDevice'), 'resetForm phải reset selectedDevice');
    assert.ok(body.includes("setSerial('')"), 'resetForm phải reset serial về rỗng');
    assert.ok(body.includes("setIssue('')"), 'resetForm phải reset issue về rỗng');
    assert.ok(body.includes("setAccessories('')"), 'resetForm phải reset accessories về rỗng');
    assert.ok(body.includes('setTestAnswers({})'), 'resetForm phải reset testAnswers về {}');
    assert.ok(body.includes("setTestNote('')"), 'resetForm phải reset testNote về rỗng');
    assert.ok(body.includes("setAppearance('')"), 'resetForm phải reset appearance về rỗng');
    assert.ok(body.includes('setPhotos([])'), 'resetForm phải reset photos về []');
    assert.ok(body.includes("setPrice('')"), 'resetForm phải reset price về rỗng');
    assert.ok(body.includes("setPriceNote('')"), 'resetForm phải reset priceNote về rỗng');
    assert.ok(body.includes('setConsent(true)'), 'resetForm phải reset consent về true');

    // 4 state điều hướng & lỗi
    assert.ok(body.includes('setCurrentStepIndex(0)'), 'resetForm phải reset currentStepIndex về 0');
    assert.ok(body.includes('setMaxReachedStepIndex(0)'), 'resetForm phải reset maxReachedStepIndex về 0');
    assert.ok(body.includes('setCompletedSteps(new Set())'), 'resetForm phải reset completedSteps về rỗng');
    assert.ok(body.includes('setErrors({})'), 'resetForm phải reset errors về {}');
  });

  await t.test('1.2 Chốt chặn 1: resetForm() được gọi trong useEffect([isOpen]) khi modal mở', () => {
    const isOpenEffectRegex = /useEffect\(\(\) => \{\s*if \(isOpen\) \{\s*resetForm\(\);[\s\S]*?\}, \[isOpen/;
    assert.ok(isOpenEffectRegex.test(content), 'useEffect([isOpen]) phải gọi resetForm() khi isOpen === true');
  });

  await t.test('1.3 Chốt chặn 2: resetForm() được gọi trong handleSave sau addOrder() trước onClose()', () => {
    const saveMatch = content.match(/addOrder\(newOrder\);[\s\S]*?resetForm\(\);[\s\S]*?onClose\(\);/);
    assert.ok(saveMatch, 'handleSave phải gọi resetForm() sau khi addOrder và trước khi onClose');
  });

  await t.test('1.4 Chốt chặn 3: handleModalClose() gọi resetForm() + onClose(), gán cho Modal và nút Hủy', () => {
    const handleModalCloseRegex = /const handleModalClose = \(\) => \{\s*resetForm\(\);\s*onClose\(\);\s*\};/;
    assert.ok(handleModalCloseRegex.test(content), 'handleModalClose phải gọi resetForm() và onClose()');

    assert.ok(content.includes('onClose={handleModalClose}'), '<Modal> phải gán onClose={handleModalClose}');
    assert.ok(
      content.includes('onClick={handleModalClose}') && content.includes('Hủy bỏ'),
      'Nút "Hủy bỏ" phải gọi handleModalClose'
    );
  });
});

test('2. K80 Thermal Print Typography: Anti-Thermal Bleeding Standards', async (t) => {
  assert.ok(fs.existsSync(thermalK80HtmlPath), 'thermalK80HtmlBuilder.ts phải tồn tại');
  const k80Content = fs.readFileSync(thermalK80HtmlPath, 'utf-8');

  await t.test('2.1 .k80-order-code và .k80-store-order-code: font-weight 600, tabular-nums, letter-spacing 1.2px', () => {
    // Không còn font-weight: 900 ở .k80-order-code
    assert.strictEqual(
      /\.k80-order-code\s*\{[^}]*font-weight:\s*900/g.test(k80Content),
      false,
      '.k80-order-code tuyệt đối không được có font-weight: 900'
    );
    assert.strictEqual(
      /\.k80-store-order-code\s*\{[^}]*font-weight:\s*800/g.test(k80Content),
      false,
      '.k80-store-order-code tuyệt đối không được có font-weight: 800'
    );

    // Phải có font-weight: 600, tabular-nums, letter-spacing: 1.2px
    assert.ok(
      /\.k80-order-code\s*\{[^}]*font-weight:\s*600/g.test(k80Content),
      '.k80-order-code phải có font-weight: 600'
    );
    assert.ok(
      /\.k80-order-code\s*\{[^}]*letter-spacing:\s*1\.2px/g.test(k80Content),
      '.k80-order-code phải có letter-spacing: 1.2px'
    );
    assert.ok(
      /\.k80-order-code\s*\{[^}]*font-variant-numeric:\s*tabular-nums/g.test(k80Content),
      '.k80-order-code phải có font-variant-numeric: tabular-nums'
    );

    assert.ok(
      /\.k80-store-order-code\s*\{[^}]*font-weight:\s*600/g.test(k80Content),
      '.k80-store-order-code phải có font-weight: 600'
    );
    assert.ok(
      /\.k80-store-order-code\s*\{[^}]*letter-spacing:\s*1\.2px/g.test(k80Content),
      '.k80-store-order-code phải có letter-spacing: 1.2px'
    );
    assert.ok(
      /\.k80-store-order-code\s*\{[^}]*font-variant-numeric:\s*tabular-nums/g.test(k80Content),
      '.k80-store-order-code phải có font-variant-numeric: tabular-nums'
    );
  });

  await t.test('2.2 .k80-price-amount: font-weight 600, tabular-nums, letter-spacing 0.5px', () => {
    assert.strictEqual(
      /\.k80-price-amount\s*\{[^}]*font-weight:\s*900/g.test(k80Content),
      false,
      '.k80-price-amount tuyệt đối không được có font-weight: 900'
    );
    assert.ok(
      /\.k80-price-amount\s*\{[^}]*font-weight:\s*600/g.test(k80Content),
      '.k80-price-amount phải có font-weight: 600'
    );
    assert.ok(
      /\.k80-price-amount\s*\{[^}]*letter-spacing:\s*0\.5px/g.test(k80Content),
      '.k80-price-amount phải có letter-spacing: 0.5px'
    );
    assert.ok(
      /\.k80-price-amount\s*\{[^}]*font-variant-numeric:\s*tabular-nums/g.test(k80Content),
      '.k80-price-amount phải có font-variant-numeric: tabular-nums'
    );
  });

  await t.test('2.3 .k80-val: font-weight 600 kết hợp tabular-nums', () => {
    assert.ok(
      /\.k80-val\s*\{[^}]*font-weight:\s*600/g.test(k80Content),
      '.k80-val phải có font-weight: 600'
    );
    assert.ok(
      /\.k80-val\s*\{[^}]*font-variant-numeric:\s*tabular-nums/g.test(k80Content),
      '.k80-val phải có font-variant-numeric: tabular-nums'
    );
  });

  await t.test('2.4 generateBarcodeSVG: nhãn text có font-weight="600"', () => {
    assert.ok(
      k80Content.includes('font-weight="600"'),
      'generateBarcodeSVG phải tạo thẻ text có font-weight="600"'
    );
    assert.strictEqual(
      /font-weight="bold"/g.test(k80Content),
      false,
      'generateBarcodeSVG không được dùng font-weight="bold"'
    );
  });

  await t.test('2.5 Output thực tế từ renderThermalK80HTML tuân thủ đúng CSS quy chuẩn', () => {
    const rawHtml = renderThermalK80HTML(mockOrder);
    assert.ok(rawHtml.includes('font-weight: 600;'), 'HTML K80 phải chứa font-weight: 600');
    assert.ok(rawHtml.includes('font-variant-numeric: tabular-nums;'), 'HTML K80 phải chứa tabular-nums');
    assert.ok(rawHtml.includes('letter-spacing: 1.2px;'), 'HTML K80 phải chứa letter-spacing: 1.2px');
    assert.ok(rawHtml.includes('letter-spacing: 0.5px;'), 'HTML K80 phải chứa letter-spacing: 0.5px');
    assert.strictEqual(
      rawHtml.includes('.k80-order-code {\n      font-size: 17px;\n      font-weight: 900'),
      false,
      'HTML K80 không được chứa font-weight: 900 cho .k80-order-code'
    );
  });

  await t.test('2.6 ThermalK80Receipt.tsx đồng bộ live preview (font-semibold, tabular-nums)', () => {
    const previewContent = fs.readFileSync(thermalK80ReceiptPath, 'utf-8');
    assert.ok(
      previewContent.includes('font-semibold font-mono tracking-[1.2px] tabular-nums'),
      'Mã đơn trong preview K80 phải có font-semibold tracking-[1.2px] tabular-nums'
    );
    assert.ok(
      previewContent.includes('font-semibold tabular-nums tracking-[0.5px]'),
      'Giá tiền trong preview K80 phải có font-semibold tabular-nums tracking-[0.5px]'
    );
    assert.strictEqual(
      previewContent.includes('font-black font-mono tracking-wider'),
      false,
      'Không còn class font-black font-mono tracking-wider'
    );
  });
});

test('3. A4 Print Typography & Live Preview Synchronization', async (t) => {
  assert.ok(fs.existsSync(a4ReceiptHtmlPath), 'a4ReceiptHtmlBuilder.ts phải tồn tại');
  const a4Content = fs.readFileSync(a4ReceiptHtmlPath, 'utf-8');

  await t.test('3.1 a4ReceiptHtmlBuilder.ts: .a4-order-code và .a4-price-val', () => {
    assert.ok(
      /\.a4-order-code\s*\{[^}]*font-weight:\s*600/g.test(a4Content),
      '.a4-order-code phải có font-weight: 600'
    );
    assert.ok(
      /\.a4-order-code\s*\{[^}]*letter-spacing:\s*1px/g.test(a4Content),
      '.a4-order-code phải có letter-spacing: 1px'
    );
    assert.ok(
      /\.a4-order-code\s*\{[^}]*font-variant-numeric:\s*tabular-nums/g.test(a4Content),
      '.a4-order-code phải có font-variant-numeric: tabular-nums'
    );

    assert.strictEqual(
      /\.a4-price-val\s*\{[^}]*font-weight:\s*900/g.test(a4Content),
      false,
      '.a4-price-val không được chứa font-weight: 900'
    );
    assert.ok(
      /\.a4-price-val\s*\{[^}]*font-weight:\s*600/g.test(a4Content),
      '.a4-price-val phải có font-weight: 600'
    );
    assert.ok(
      /\.a4-price-val\s*\{[^}]*letter-spacing:\s*0\.5px/g.test(a4Content),
      '.a4-price-val phải có letter-spacing: 0.5px'
    );
    assert.ok(
      /\.a4-price-val\s*\{[^}]*font-variant-numeric:\s*tabular-nums/g.test(a4Content),
      '.a4-price-val phải có font-variant-numeric: tabular-nums'
    );
  });

  await t.test('3.2 a4ReceiptHtmlBuilder.ts: CSS rules tuân thủ đúng quy chuẩn thanh thoát', () => {
    assert.ok(a4Content.includes('letter-spacing: 1px;'), 'CSS A4 phải chứa letter-spacing: 1px');
    assert.ok(a4Content.includes('font-weight: 600;'), 'CSS A4 phải chứa font-weight: 600');
    assert.ok(a4Content.includes('font-variant-numeric: tabular-nums;'), 'CSS A4 phải chứa tabular-nums');
    assert.ok(a4Content.includes('letter-spacing: 0.5px;'), 'CSS A4 phải chứa letter-spacing: 0.5px');
  });

  await t.test('3.3 A4ReceiptTemplate.tsx đồng bộ live preview (font-semibold, tabular-nums)', () => {
    const templateContent = fs.readFileSync(a4ReceiptTemplatePath, 'utf-8');
    assert.ok(
      templateContent.includes('font-semibold font-mono tracking-[1px] tabular-nums'),
      'Mã đơn trong A4ReceiptTemplate phải có font-semibold font-mono tracking-[1px] tabular-nums'
    );
    assert.ok(
      templateContent.includes('font-semibold tabular-nums tracking-[0.5px]'),
      'Giá tiền trong A4ReceiptTemplate phải có font-semibold tabular-nums tracking-[0.5px]'
    );
  });
});
