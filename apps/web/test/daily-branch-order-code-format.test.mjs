import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  generateBarcodeSVG,
  generateQRCodeSVG,
  extractOrderDisplaySuffix,
} from '../app/components/print/BarcodeQRUtils.ts';
import {
  renderCombinedThermalK80HTML,
} from '../app/components/print/thermalK80HtmlBuilder.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('OpenSpec: daily-branch-order-code-format Frontend & Print Suite', () => {
  test('1. IntakeWizardModal: Fallback mã đơn phải theo cấu trúc PC{branch}{DDMMYY}{STT}', () => {
    const intakeModalPath = path.join(rootDir, 'app/components/IntakeWizardModal.tsx');
    assert.ok(fs.existsSync(intakeModalPath), 'IntakeWizardModal.tsx phải tồn tại');
    const content = fs.readFileSync(intakeModalPath, 'utf-8');

    // Không còn fallback mã cũ FX trong IntakeWizardModal
    assert.ok(
      !content.includes('newId = `FX'),
      'IntakeWizardModal không được fallback mã đơn cũ dạng FX'
    );

    // Fallback mã mới dạng PC{branchCode}{dateStr}{seq}
    assert.ok(
      content.includes('newId = `PC${branchCode}${dateStr}${seq}`'),
      'IntakeWizardModal phải fallback mã đơn chuẩn PC{branchCode}{dateStr}{seq}'
    );
  });

  test('2. Barcode Code128 & QR Code SVG Generator: Hoạt động chuẩn xác với mã PC...', () => {
    const testCode = 'PC112102601';
    const barcodeSvg = generateBarcodeSVG(testCode, { height: 40, barWidth: 1.5, showText: true });

    assert.ok(barcodeSvg.startsWith('<svg'), 'Barcode SVG phải bắt đầu bằng thẻ <svg>');
    assert.ok(barcodeSvg.endsWith('</svg>'), 'Barcode SVG phải kết thúc bằng </svg>');
    assert.ok(barcodeSvg.includes(testCode), 'Barcode SVG phải hiển thị rõ mã text PC112102601');
    assert.ok(barcodeSvg.includes('<rect'), 'Barcode SVG phải chứa các thanh vạch <rect>');

    const qrUrl = `https://fixo.com.vn/track/${testCode}`;
    const qrSvg = generateQRCodeSVG(qrUrl, { size: 96, margin: 1 });
    assert.ok(qrSvg.startsWith('<svg') && qrSvg.endsWith('</svg>'), 'QR Code SVG phải hợp lệ');
    assert.ok(qrSvg.includes('<path'), 'QR Code SVG phải chứa ma trận điểm ảnh');
  });

  test('3. Hậu tố mã đơn extractOrderDisplaySuffix: Tương thích cả định dạng mới PC và cũ FX', () => {
    // Mã mới PC chuẩn 11 ký tự
    assert.strictEqual(extractOrderDisplaySuffix('PC112102601'), '01');
    assert.strictEqual(extractOrderDisplaySuffix('PC112102602'), '02');
    assert.strictEqual(extractOrderDisplaySuffix('PC212102699'), '99');

    // Mã PC có dấu gạch
    assert.strictEqual(extractOrderDisplaySuffix('PC1-121026-01'), '01');

    // Mã cũ FX
    assert.strictEqual(extractOrderDisplaySuffix('FX26-0001'), '0001');
    assert.strictEqual(extractOrderDisplaySuffix('FX26-10293'), '10293');
  });

  test('4. In ấn phiếu gộp K80 & A4: Sinh batchCode chuẩn xác từ mã PC...', () => {
    const mockOrders = [
      {
        id: 'PC112102601',
        name: 'Nguyễn Văn A',
        phone: '0901234567',
        device: 'AirPods Pro 2',
        issue: 'Rè loa',
        price: 250000,
        branch: 'Chi nhánh 1',
        date: '12/10/2026',
        checks: [],
      },
      {
        id: 'PC112102602',
        name: 'Nguyễn Văn A',
        phone: '0901234567',
        device: 'AirPods Pro 2 (Hộp sạc)',
        issue: 'Chai pin dock',
        price: 350000,
        branch: 'Chi nhánh 1',
        date: '12/10/2026',
        checks: [],
      },
    ];

    // K80 html builder
    const k80Html = renderCombinedThermalK80HTML(mockOrders);
    assert.ok(k80Html.includes('IB26-01-02'), 'Phiếu K80 gộp phải sinh batchCode IB26-01-02');
    assert.ok(k80Html.includes('PC112102601, PC112102602'), 'Phiếu K80 gộp phải chứa danh sách mã đơn PC');

    // A4 html builder: Kiểm tra source code tích hợp extractOrderDisplaySuffix
    const a4BuilderPath = path.join(rootDir, 'app/components/print/a4ReceiptHtmlBuilder.ts');
    const a4Content = fs.readFileSync(a4BuilderPath, 'utf-8');
    assert.ok(
      a4Content.includes('extractOrderDisplaySuffix(o.id)'),
      'a4ReceiptHtmlBuilder.ts phải sử dụng extractOrderDisplaySuffix cho batchCode'
    );
    assert.ok(
      !a4Content.includes("o.id.replace(/^FX\\d+-/, '')"),
      'a4ReceiptHtmlBuilder.ts không được hardcode regex cũ replace(/^FX\\d+-/)'
    );
  });

  test('5. UI repairs/page.tsx và tech/page.tsx: Hiển thị mã đơn bằng font-mono rõ ràng', () => {
    const repairsPath = path.join(rootDir, 'app/repairs/page.tsx');
    const techPath = path.join(rootDir, 'app/tech/page.tsx');

    const repairsContent = fs.readFileSync(repairsPath, 'utf-8');
    const techContent = fs.readFileSync(techPath, 'utf-8');

    assert.ok(
      repairsContent.includes('font-mono font-bold text-[#176b58]'),
      'repairs/page.tsx phải áp dụng class font-mono font-bold text-[#176b58] cho mã đơn'
    );

    assert.ok(
      techContent.includes('font-mono font-bold text-sm text-[#176b58]'),
      'tech/page.tsx phải áp dụng class font-mono font-bold text-sm text-[#176b58] cho mã đơn'
    );
  });
});
