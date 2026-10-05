import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import HTML Builders
import {
  renderThermalK80HTML,
  renderCombinedThermalK80HTML,
  formatMoney,
} from '../app/components/print/thermalK80HtmlBuilder.ts';



// Sample mock data for multi-device batch
const mockBatchCode = 'IB26-998877';

const mockOrder1 = {
  id: 'FX26-1001',
  name: 'Trần Văn Hoàng',
  phone: '0909123456',
  deviceCategory: 'AirPods',
  device: 'AirPods Pro 2',
  serial: 'H123XYZ456',
  issue: 'Tai trái rè rè khi bật chống ồn ANC, pin dock nhanh hết',
  accessories: 'Hộp sạc, núm tai size M',
  branch: 'FIXO Store · Quận 1',
  status: 'Chờ khách duyệt',
  statusType: 'wait',
  price: 450000,
  priceNote: 'Thay pin dock + vệ sinh màng loa',
  tech: 'Chưa phân công',
  date: '05/10/2026',
  intake_batch_code: mockBatchCode,
  checks: [
    { label: 'Loa / Màng loa', status: 'Lỗi' },
    { label: 'Pin Dock', status: 'Lỗi' },
    { label: 'Mic đàm thoại', status: 'Hoạt động' },
  ],
  createdBy: 'Tiếp tân FIXO',
};

const mockOrder2 = {
  id: 'FX26-1002',
  name: 'Trần Văn Hoàng',
  phone: '0909123456',
  deviceCategory: 'Apple Watch',
  device: 'Apple Watch Series 8 45mm',
  serial: 'W8899AABB',
  issue: 'Mặt kính trầy nặng, pin phù nhẹ kênh màn',
  accessories: 'Dây đeo cao su đen',
  branch: 'FIXO Store · Quận 1',
  status: 'Chờ khách duyệt',
  statusType: 'wait',
  price: 850000,
  priceNote: 'Ép kính + thay pin chính hãng',
  tech: 'Chưa phân công',
  date: '05/10/2026',
  intake_batch_code: mockBatchCode,
  checks: [
    { label: 'Cảm ứng', status: 'Hoạt động' },
    { label: 'Pin', status: 'Lỗi' },
  ],
  createdBy: 'Tiếp tân FIXO',
};

const mockOrder3 = {
  id: 'FX26-1003',
  name: 'Trần Văn Hoàng',
  phone: '0909123456',
  deviceCategory: 'Pencil',
  device: 'Apple Pencil 2',
  serial: 'P776655',
  issue: 'Không nhận sạc không dây qua cạnh iPad',
  accessories: 'Thân bút, ngòi zin',
  branch: 'FIXO Store · Quận 1',
  status: 'Chờ khách duyệt',
  statusType: 'wait',
  price: 300000,
  priceNote: 'Kiểm tra mạch sạc cảm ứng',
  tech: 'Chưa phân công',
  date: '05/10/2026',
  intake_batch_code: mockBatchCode,
  checks: [
    { label: 'Cảm ứng lực', status: 'Hoạt động' },
  ],
  createdBy: 'Tiếp tân FIXO',
};

const mockOrders = [mockOrder1, mockOrder2, mockOrder3];

test('1. Combined Thermal K80 HTML Receipt (Phiếu in nhiệt gộp nhiều thiết bị)', async (t) => {
  await t.test('renderCombinedThermalK80HTML sinh HTML chứa đầy đủ thông tin đợt tiếp nhận và danh sách thiết bị', () => {
    const html = renderCombinedThermalK80HTML(mockOrders, {
      origin: 'https://fixo.com.vn',
    });

    assert.ok(html.includes('<!DOCTYPE html>'), 'Phải là tài liệu HTML hoàn chỉnh');
    assert.ok(html.includes('PHIẾU TIẾP NHẬN SỬA CHỮA'), 'Tiêu đề phiếu');
    assert.ok(html.includes('ĐỢT TIẾP NHẬN GỘP 3 THIẾT BỊ'), 'Badge hiển thị số lượng thiết bị gộp');
    assert.ok(html.includes(mockBatchCode), 'Hiển thị mã đợt tiếp nhận');
    assert.ok(html.includes('Trần Văn Hoàng'), 'Tên khách hàng');
    assert.ok(html.includes('0909123456'), 'Số điện thoại khách hàng');

    // Kiểm tra từng thiết bị có mặt với số thứ tự
    assert.ok(html.includes('[1] AirPods Pro 2'), 'Thiết bị 1');
    assert.ok(html.includes('FX26-1001'), 'Mã đơn 1');
    assert.ok(html.includes('H123XYZ456'), 'Serial thiết bị 1');

    assert.ok(html.includes('[2] Apple Watch Series 8 45mm'), 'Thiết bị 2');
    assert.ok(html.includes('FX26-1002'), 'Mã đơn 2');
    assert.ok(html.includes('W8899AABB'), 'Serial thiết bị 2');

    assert.ok(html.includes('[3] Apple Pencil 2'), 'Thiết bị 3');
    assert.ok(html.includes('FX26-1003'), 'Mã đơn 3');

    // Tổng tiền 450.000 + 850.000 + 300.000 = 1.600.000 đ
    const totalExpected = 450000 + 850000 + 300000;
    const formattedExpected = formatMoney(totalExpected);
    assert.ok(html.includes(formattedExpected), 'Tổng chi phí dự kiến chuẩn xác');
    assert.ok(html.includes('TỔNG CỘNG TIẾP NHẬN:'), 'Tiêu đề tổng tiền gộp');
    assert.ok(html.includes('(3 thiết bị gửi sửa)'), 'Số lượng thiết bị gửi sửa');

    // Cả 2 liên: Liên 1 (Bản giao khách) và Liên 2 (Bản lưu cửa hàng)
    assert.ok(html.includes('LIÊN KHÁCH HÀNG'), 'Liên khách hàng');
    assert.ok(html.includes('BẢN LƯU CỬA HÀNG & KỸ THUẬT') || html.includes('BẢN LƯU CỬA HÀNG &amp; KỸ THUẬT'), 'Liên lưu cửa hàng');

    // Auto-cutter separator
    assert.ok(html.includes('CẮT GIẤY') || html.includes('ĐIỂM DAO CẮT'), 'Chứa điểm ngắt dao cắt');
  });

  await t.test('renderThermalK80HTML hỗ trợ nhận RepairOrder | RepairOrder[] đa hình', () => {
    // Trường hợp mảng rỗng
    assert.strictEqual(renderThermalK80HTML([]), '');

    // Trường hợp mảng 1 phần tử -> tự động render như đơn lẻ
    const singleArrHtml = renderThermalK80HTML([mockOrder1]);
    assert.ok(singleArrHtml.includes('FX26-1001'));
    assert.ok(!singleArrHtml.includes('ĐỢT TIẾP NHẬN GỘP'));

    // Trường hợp mảng nhiều phần tử -> tự động render combined
    const multiArrHtml = renderThermalK80HTML(mockOrders);
    assert.ok(multiArrHtml.includes('ĐỢT TIẾP NHẬN GỘP 3 THIẾT BỊ'));
    assert.ok(multiArrHtml.includes('FX26-1001'));
    assert.ok(multiArrHtml.includes('FX26-1002'));
    assert.ok(multiArrHtml.includes('FX26-1003'));
  });
});

test('2. Combined A4 HTML Receipt (Phiếu in A4 gộp nhiều thiết bị)', async (t) => {
  const a4Path = path.resolve(__dirname, '../app/components/print/a4ReceiptHtmlBuilder.ts');
  const a4Content = fs.readFileSync(a4Path, 'utf-8');

  await t.test('a4ReceiptHtmlBuilder.ts xuất phát sinh phiếu A4 gộp và bảng thiết bị N dòng', () => {
    assert.ok(
      a4Content.includes('export function renderCombinedA4ReceiptHTML'),
      'Phải xuất hàm renderCombinedA4ReceiptHTML'
    );
    assert.ok(
      a4Content.includes('export function renderA4ReceiptHTML'),
      'Phải xuất hàm renderA4ReceiptHTML'
    );
    assert.ok(
      a4Content.includes('orderOrOrders: RepairOrder | RepairOrder[]'),
      'renderA4ReceiptHTML phải hỗ trợ đa hình RepairOrder | RepairOrder[]'
    );
    assert.ok(
      a4Content.includes('renderCombinedA4ReceiptHTML(orderOrOrders'),
      'renderA4ReceiptHTML phải tự động chuyển tiếp sang renderCombinedA4ReceiptHTML khi là mảng'
    );
    assert.ok(
      a4Content.includes('DANH SÁCH THIẾT BỊ TIẾP NHẬN'),
      'Phải chứa tiêu đề danh sách thiết bị tiếp nhận'
    );
    assert.ok(
      a4Content.includes('TỔNG CHI PHÍ TIẾP NHẬN DỰ KIẾN:'),
      'Phải hiển thị tổng chi phí tiếp nhận dự kiến của đợt'
    );
    assert.ok(
      a4Content.includes('a4-divider'),
      'Phải có đường cắt phân cách 10mm giữa 2 liên'
    );
    assert.ok(
      a4Content.includes('LIÊN 1 · BẢN LƯU CỬA HÀNG') && a4Content.includes('LIÊN 2 · BẢN GIAO KHÁCH HÀNG'),
      'Phải sinh đủ 2 liên: Bản lưu cửa hàng và Bản giao khách hàng'
    );
  });
});

test('3. Single-Flight Print Job & Intake Wizard Logic Guard', async (t) => {
  await t.test('Kiểm tra useSilentPrint.ts xử lý orderOrOrders là mảng trong 1 lệnh in duy nhất', () => {
    const filePath = path.resolve(__dirname, '../app/components/print/useSilentPrint.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Kiểm tra signature
    assert.ok(
      content.includes('orderOrOrders: RepairOrder | RepairOrder[]'),
      'Signature printReceipt phải nhận orderOrOrders là đơn lẻ hoặc mảng'
    );

    // Kiểm tra gọi render hàm builder với orderOrOrders
    assert.ok(
      content.includes('renderA4ReceiptHTML(orderOrOrders') || content.includes('renderA4ReceiptHTML(orderOrOrders,'),
      'Gọi renderA4ReceiptHTML với mảng hoặc đơn'
    );
    assert.ok(
      content.includes('renderThermalK80HTML(orderOrOrders') || content.includes('renderThermalK80HTML(orderOrOrders,'),
      'Gọi renderThermalK80HTML với mảng hoặc đơn'
    );
  });

  await t.test('Kiểm tra IntakeWizardModal.tsx sinh batchCode và gọi printReceipt 1 lần duy nhất', () => {
    const filePath = path.resolve(__dirname, '../app/components/IntakeWizardModal.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Kiểm tra sinh mã đợt tiếp nhận IB26-...
    assert.ok(
      content.includes('IB26-') || content.includes('batchCode'),
      'Phải tạo batchCode khi tiếp nhận nhiều thiết bị'
    );

    // Kiểm tra truyền intake_batch_code vào payload
    assert.ok(
      content.includes('intake_batch_code: batchCode'),
      'Phải gửi intake_batch_code lên backend API'
    );

    // Đảm bảo TUYỆT ĐỐI không có vòng lặp for/forEach gọi printReceipt
    assert.ok(
      !content.match(/createdOrders\.forEach\([^)]*printReceipt/),
      'Nghiêm cấm dùng forEach gọi printReceipt nhiều lần'
    );
    assert.ok(
      !content.match(/for\s*\([^)]+\)\s*\{[^}]*printReceipt/),
      'Nghiêm cấm dùng vòng for gọi printReceipt trong vòng lặp'
    );

    // Kiểm tra gọi printReceipt theo mô hình Single-Flight
    assert.ok(
      content.includes('printReceipt(createdOrders, currentFormat)') ||
      content.includes('printReceipt(createdOrders.length === 1 ? createdOrders[0] : createdOrders, currentFormat)'),
      'Phải gọi printReceipt đúng 1 lần với createdOrders'
    );
  });

  await t.test('Kiểm tra PrintButtonDropdown hỗ trợ in bill gộp đợt tiếp nhận', () => {
    const filePath = path.resolve(__dirname, '../app/components/print/PrintFormatModal.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    assert.ok(
      content.includes('batchOrders?: RepairOrder[]'),
      'PrintButtonDropdownProps phải nhận batchOrders'
    );
    assert.ok(
      content.includes('In bill gộp') || content.includes('effectiveBatchOrders'),
      'Phải có tùy chọn In bill gộp khi có nhiều thiết bị trong đợt'
    );
  });

  await t.test('Kiểm tra repairs/page.tsx hiển thị đợt tiếp nhận và truyền batchOrders vào dropdown', () => {
    const filePath = path.resolve(__dirname, '../app/repairs/page.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    assert.ok(
      content.includes('selectedOrderBatchOrders'),
      'Phải tính toán selectedOrderBatchOrders'
    );
    assert.ok(
      content.includes('batchOrders={selectedOrderBatchOrders}'),
      'Phải truyền batchOrders vào PrintButtonDropdown'
    );
    assert.ok(
      content.includes('intake_batch_code'),
      'Phải hiển thị dải thông tin đợt tiếp nhận'
    );
  });
});
