import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const printDir = path.resolve(__dirname, '../app/components/print');

// 1. Import trực tiếp các modules độc lập
import {
  generateBarcodeSVG,
  generateQRCodeSVG,
} from '../app/components/print/BarcodeQRUtils.ts';

import {
  getStoredPrintFormat,
  setStoredPrintFormat,
  PRINT_STORAGE_KEY,
} from '../app/components/print/printerPreference.ts';

import {
  renderThermalK80HTML,
  buildCustomerCopyHtml,
  buildStoreCopyHtml,
  formatMoney,
} from '../app/components/print/thermalK80HtmlBuilder.ts';

test('1. Barcode Code 128 SVG generator (Client-side, Zero-network)', async (t) => {
  await t.test('Sinh chuỗi SVG hợp lệ cho mã đơn hàng', () => {
    const svg = generateBarcodeSVG('PC26-88888', { height: 40, showText: true });
    assert.ok(svg.startsWith('<svg'), 'Phải bắt đầu bằng thẻ <svg');
    assert.ok(svg.includes('</svg>'), 'Phải kết thúc bằng thẻ </svg>');
    assert.ok(svg.includes('<rect'), 'Phải chứa các thẻ <rect> biểu diễn vạch mã');
    assert.ok(svg.includes('fill="#000000"'), 'Vạch mã phải có màu đen #000000');
    assert.ok(svg.includes('PC26-88888'), 'Phải hiển thị text mã đơn bên dưới');
  });

  await t.test('Xử lý an toàn chuỗi rỗng và ký tự đặc biệt', () => {
    const svgEmpty = generateBarcodeSVG('', { height: 30 });
    assert.ok(svgEmpty.includes('<svg'), 'Phải trả về SVG an toàn không ném exception');

    const svgSpecial = generateBarcodeSVG('RO-2026-X#1', { height: 35 });
    assert.ok(svgSpecial.includes('RO-2026-X#1'), 'Phải mã hóa đúng ký tự');
  });
});

test('2. QR Code Vector SVG generator (Zero-network, Pure Client-side)', async (t) => {
  await t.test('Sinh chuỗi SVG hợp lệ cho URL tra cứu tiến độ realtime', () => {
    const url = 'https://podscare.fixo.vn/track/PC26-88888';
    const svg = generateQRCodeSVG(url, { size: 100, margin: 2 });
    assert.ok(svg.startsWith('<svg'), 'Phải bắt đầu bằng thẻ <svg');
    assert.ok(svg.includes('</svg>'), 'Phải kết thúc bằng thẻ </svg>');
    assert.ok(svg.includes('<path d="M'), 'Phải chứa path vector SVG của ma trận QR');
    assert.ok(svg.includes('fill="#000000"'), 'Màu các ô QR phải là đen');
  });

  await t.test('Tùy biến kích thước và margin', () => {
    const svg = generateQRCodeSVG('https://fixo.vn/track/123', { size: 64, margin: 1 });
    assert.ok(svg.includes('width="64"'), 'Phải áp dụng đúng width');
    assert.ok(svg.includes('height="64"'), 'Phải áp dụng đúng height');
  });
});

test('3. Printer Preference LocalStorage Manager', async (t) => {
  const storage = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, val) => storage.set(key, String(val)),
      removeItem: (key) => storage.delete(key),
      clear: () => storage.clear(),
    },
    dispatchEvent: () => true,
  };

  await t.test('Đọc giá trị mặc định khi chưa có cấu hình', () => {
    storage.clear();
    const format = getStoredPrintFormat();
    assert.equal(format, 'k80', 'Mặc định ban đầu phải là khổ k80');
  });

  await t.test('Lưu và đọc cấu hình khổ A4', () => {
    setStoredPrintFormat('a4');
    assert.equal(storage.get(PRINT_STORAGE_KEY), 'a4');
    assert.equal(getStoredPrintFormat(), 'a4');
  });

  await t.test('Chuyển lại cấu hình khổ K80', () => {
    setStoredPrintFormat('k80');
    assert.equal(storage.get(PRINT_STORAGE_KEY), 'k80');
    assert.equal(getStoredPrintFormat(), 'k80');
  });
});

test('4. Thermal K80 Receipt Template Standards Verification', () => {
  const k80Path = path.join(printDir, 'thermalK80HtmlBuilder.ts');
  assert.ok(fs.existsSync(k80Path), 'thermalK80HtmlBuilder.ts phải tồn tại');
  const content = fs.readFileSync(k80Path, 'utf-8');

  assert.ok(content.includes('size: 80mm auto;'), 'Phải cấu hình @page size 80mm auto');
  assert.ok(content.includes('max-width: 74mm;'), 'Bề ngang nội dung in tối đa 74mm');
  assert.ok(content.includes('FIXO REPAIR OS'), 'Phải có tên thương hiệu chuẩn');
  assert.ok(content.includes('k80-feed-spacer'), 'Phải có khoảng đệm trống 18mm để dao cắt không phạm vào chữ');
  assert.ok(content.includes('/track/'), 'Phải tích hợp URL tra cứu realtime cho mã QR');
  assert.ok(content.includes('PHIẾU ĐIỀU PHỐI / TEM KHAY KỸ THUẬT'), 'Phải hỗ trợ phiếu điều phối/tem khay cho KTV');
});

test('5. A4 Dual-Copy Template Standards Verification', () => {
  const a4Path = path.join(printDir, 'a4ReceiptHtmlBuilder.ts');
  assert.ok(fs.existsSync(a4Path), 'a4ReceiptHtmlBuilder.ts phải tồn tại');
  const content = fs.readFileSync(a4Path, 'utf-8');

  assert.ok(content.includes('size: A4 portrait;'), 'Phải cấu hình @page A4 portrait');
  assert.ok(content.includes('LIÊN 1 · BẢN LƯU CỬA HÀNG'), 'Phải có Liên 1');
  assert.ok(content.includes('LIÊN 2 · BẢN GIAO KHÁCH HÀNG'), 'Phải có Liên 2');
  assert.ok(content.includes('max-height: 132mm;'), 'Phải khóa chiều cao mỗi liên <=132mm');
  assert.ok(content.includes('10mm'), 'Phải có đường cắt phân cách 10mm');
  assert.ok(content.includes('✂'), 'Phải có biểu tượng kéo cắt đối soát');
});

test('6. Hidden Iframe Silent Print Engine Lifecycle Verification', () => {
  const hookPath = path.join(printDir, 'useSilentPrint.ts');
  assert.ok(fs.existsSync(hookPath), 'useSilentPrint.ts phải tồn tại');
  const content = fs.readFileSync(hookPath, 'utf-8');

  assert.ok(content.includes("style.position = 'fixed'"), 'Iframe phải được cố định ngoài viewport');
  assert.ok(content.includes("style.top = '-9999px'"), 'Iframe phải đặt top âm ngoài viewport');
  assert.ok(content.includes("style.left = '-9999px'"), 'Iframe phải đặt left âm ngoài viewport');
  assert.ok(content.includes('win.print()') || content.includes('contentWindow.print()'), 'Phải kích hoạt lệnh print từ contentWindow');
  assert.ok(content.includes('afterprint'), 'Phải lắng nghe sự kiện afterprint để giải phóng DOM');
  assert.ok(content.includes('removeChild'), 'Phải tự dọn dẹp iframe khỏi body sau khi hoàn tất');
});

test('7. Print Touchpoint Integration Verification', () => {
  // 1. IntakeWizardModal: Silent print on save
  const intakePath = path.resolve(__dirname, '../app/components/IntakeWizardModal.tsx');
  const intakeContent = fs.readFileSync(intakePath, 'utf-8');
  assert.ok(intakeContent.includes('useSilentPrint'), 'IntakeWizardModal phải dùng useSilentPrint');
  assert.ok(intakeContent.includes('printReceipt(newOrder'), 'Phải gọi in ngầm trực tiếp khi lưu');
  assert.ok(!intakeContent.includes("router.push('/print/"), 'Không được dùng router.push sang /print/');

  // 2. Repairs Drawer: Print dropdown
  const repairsPath = path.resolve(__dirname, '../app/repairs/page.tsx');
  const repairsContent = fs.readFileSync(repairsPath, 'utf-8');
  assert.ok(repairsContent.includes('PrintButtonDropdown'), 'Repairs drawer phải tích hợp PrintButtonDropdown');
  assert.ok(repairsContent.includes('useSilentPrint'), 'Repairs page phải dùng useSilentPrint');

  // 3. Tech Queue: Routing slip print
  const techPath = path.resolve(__dirname, '../app/tech/page.tsx');
  const techContent = fs.readFileSync(techPath, 'utf-8');
  assert.ok(techContent.includes('handlePrintRoutingSlip'), 'Tech page phải có hàm in tem khay K80');
  assert.ok(techContent.includes('useSilentPrint'), 'Tech page phải dùng useSilentPrint');
});

test('8. K80 Dual-Slip Auto-Cut & Template Engine Verification', async (t) => {
  const mockOrder = {
    id: 'PC26-22580',
    name: 'Nguyễn Văn A',
    phone: '0987654321',
    device: 'AirPods Pro 2',
    serial: 'GW4Y90ABCD',
    issue: 'Tai trái rè tiếng khi bật ANC',
    price: 350000,
    priceNote: 'Đã bao gồm công thay linh kiện',
    branch: 'FIXO Landmark 81',
    createdBy: 'KTV Hoàng',
    date: '03/10/2026',
    accessories: 'Hộp sạc, cáp sạc',
    appearance: 'Trầy nhẹ mặt lưng case',
    checks: [
      { label: 'Chống ồn ANC', status: 'Lỗi' },
      { label: 'Xuyên âm Transparency', status: 'Hoạt động' },
    ],
    testNote: 'Pin tai trái còn 85%',
  };

  await t.test('8.1. buildCustomerCopyHtml: Đầy đủ giá tiền, QR tra cứu, bảng kiểm tra và 2 chữ ký', () => {
    const html = buildCustomerCopyHtml(mockOrder, 'https://podscare.fixo.vn');
    assert.ok(html.includes('k80-customer-copy'), 'Phải chứa class k80-customer-copy');
    assert.ok(html.includes('LIÊN KHÁCH HÀNG'), 'Phải có tiêu đề nhận diện Liên khách hàng');
    assert.ok(html.includes('PHIẾU TIẾP NHẬN SỬA CHỮA'), 'Phải có tiêu đề phiếu tiếp nhận');
    assert.ok(html.includes('GIÁ DỰ KIẾN:'), 'Phải hiển thị nhãn GIÁ DỰ KIẾN');
    assert.ok(html.includes('350.000 ₫'), 'Phải format đúng giá tiền 350.000 ₫');
    assert.ok(html.includes('/track/PC26-22580'), 'Phải chứa URL tra cứu tiến độ realtime trong QR code');
    assert.ok(html.includes('KHÁCH HÀNG') && html.includes('TIẾP NHẬN'), 'Phải có 2 khối chữ ký xác nhận');
    assert.ok(html.includes('k80-feed-spacer'), 'Phải có khoảng đệm đẩy giấy k80-feed-spacer 15mm');
    assert.ok(html.includes('✂ - - - - - CẮT GIẤY - - - - - ✂'), 'Phải có đường chỉ dẫn cắt giấy nét đứt');
  });

  await t.test('8.2. buildStoreCopyHtml: Tem khay KTV to rõ, TUYỆT ĐỐI KHÔNG CÓ giá tiền và QR', () => {
    const html = buildStoreCopyHtml(mockOrder);
    assert.ok(html.includes('k80-store-copy'), 'Phải chứa class k80-store-copy');
    assert.ok(html.includes('BẢN LƯU CỬA HÀNG'), 'Phải có tiêu đề nhận diện Bản lưu cửa hàng & kỹ thuật');
    assert.ok(html.includes('PC26-22580'), 'Phải hiển thị mã phiếu to rõ');
    assert.ok(html.includes('BỆNH MÁY TIẾP NHẬN'), 'Phải có ô BỆNH MÁY TIẾP NHẬN');
    assert.ok(html.includes('Khay số: [ ..... ] | Kỹ Thuật: [ .......... ]'), 'Phải có vùng ghi chú viết tay khay số');
    assert.ok(html.includes('k80-feed-spacer end'), 'Cuối liên 2 phải có k80-feed-spacer end đẩy hết mép giấy');

    // Các điều kiện BẢO MẬT tuyệt đối
    assert.ok(!html.includes('GIÁ DỰ KIẾN'), 'TUYỆT ĐỐI KHÔNG ĐƯỢC CHỨA nhãn GIÁ DỰ KIẾN');
    assert.ok(!html.includes('350.000 ₫') && !html.includes(' ₫'), 'TUYỆT ĐỐI KHÔNG ĐƯỢC CHỨA số tiền hoặc ký hiệu tiền tệ ₫');
    assert.ok(!html.includes('/track/'), 'TUYỆT ĐỐI KHÔNG ĐƯỢC CHỨA link tra cứu tiến độ');
    assert.ok(!html.includes('Quét mã QR'), 'TUYỆT ĐỐI KHÔNG ĐƯỢC CHỨA mã QR');
    assert.ok(!html.includes('k80-signatures'), 'TUYỆT ĐỐI KHÔNG ĐƯỢC CHỨA khối chữ ký');
    assert.ok(!html.includes('k80-footer-note'), 'TUYỆT ĐỐI KHÔNG ĐƯỢC CHỨA cam kết bảo hành khách hàng');
  });

  await t.test('8.3. renderThermalK80HTML chế độ mặc định dual: Sinh cả 2 liên và bộ ngắt trang Paged Media', () => {
    const html = renderThermalK80HTML(mockOrder);
    assert.ok(html.includes('<!DOCTYPE html>'), 'Phải là tài liệu HTML hoàn chỉnh');
    assert.ok(html.includes('size: 80mm auto;'), 'Phải cấu hình khổ in 80mm');
    assert.ok(html.includes('page-break-after: always;'), 'Phải có CSS ngắt trang page-break-after: always;');
    assert.ok(html.includes('break-after: page;'), 'Phải có CSS ngắt trang break-after: page;');
    assert.ok(html.includes('k80-slip-separator'), 'Phải có phần tử ngắt trang k80-slip-separator giữa 2 liên');
    assert.ok(html.includes('LIÊN KHÁCH HÀNG'), 'Phải chứa Liên 1');
    assert.ok(html.includes('BẢN LƯU CỬA HÀNG'), 'Phải chứa Liên 2');
  });

  await t.test('8.4. renderThermalK80HTML các chế độ slipMode: customer_only, store_only và isRoutingSlip', () => {
    // Mode customer_only
    const customerOnlyHtml = renderThermalK80HTML(mockOrder, undefined, { slipMode: 'customer_only' });
    assert.ok(customerOnlyHtml.includes('LIÊN KHÁCH HÀNG'), 'Phải chứa Liên 1');
    assert.ok(!customerOnlyHtml.includes('BẢN LƯU CỬA HÀNG'), 'Không được chứa Liên 2');
    assert.ok(!customerOnlyHtml.includes('<div class="k80-slip-separator"></div>'), 'Không được có thẻ ngắt trang giữa chừng');

    // Mode store_only
    const storeOnlyHtml = renderThermalK80HTML(mockOrder, undefined, { slipMode: 'store_only' });
    assert.ok(storeOnlyHtml.includes('BẢN LƯU CỬA HÀNG'), 'Phải chứa Liên 2');
    assert.ok(!storeOnlyHtml.includes('GIÁ DỰ KIẾN'), 'Không được có giá tiền');
    assert.ok(!storeOnlyHtml.includes('<div class="k80-slip-separator"></div>'), 'Không được có thẻ ngắt trang');

    // Chữ ký hàm cũ: isRoutingSlip = true
    const legacyRoutingHtml = renderThermalK80HTML(mockOrder, 'https://fixo.vn', true);
    assert.ok(legacyRoutingHtml.includes('BẢN LƯU CỬA HÀNG'), 'Legacy routing slip phải render Liên 2');
    assert.ok(!legacyRoutingHtml.includes('GIÁ DỰ KIẾN'), 'Legacy routing slip không có giá tiền');
  });
});

