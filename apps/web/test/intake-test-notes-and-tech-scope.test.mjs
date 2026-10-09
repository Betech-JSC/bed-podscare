import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import Print Builders
import {
  renderThermalK80HTML,
  renderCombinedThermalK80HTML,
} from '../app/components/print/thermalK80HtmlBuilder.ts';

const a4ReceiptHtmlBuilderPath = path.resolve(__dirname, '../app/components/print/a4ReceiptHtmlBuilder.ts');
const dashboardPagePath = path.resolve(__dirname, '../app/dashboard/page.tsx');
const repairsPagePath = path.resolve(__dirname, '../app/repairs/page.tsx');
const techPagePath = path.resolve(__dirname, '../app/tech/page.tsx');
const intakeWizardModalPath = path.resolve(__dirname, '../app/components/IntakeWizardModal.tsx');
const techOrderDetailModalPath = path.resolve(__dirname, '../app/components/TechOrderDetailModal.tsx');
const providersPath = path.resolve(__dirname, '../app/providers.tsx');
const typesOrderPath = path.resolve(__dirname, '../../../packages/types/src/order.ts');
const orderControllerPath = path.resolve(__dirname, '../../api/app/Http/Controllers/Api/V1/OrderController.php');
const repairOrderModelPath = path.resolve(__dirname, '../../api/app/Models/RepairOrder.php');

test('OpenSpec: Intake Test Notes Print, Warranty Quick Intake & Tech 3-Day Scope', async (t) => {
  await t.test('1. Backend: CSDL & Controller hỗ trợ test_note và KTV gom đơn 3 ngày dở dang', () => {
    assert.ok(fs.existsSync(orderControllerPath), 'OrderController.php must exist');
    const controllerCode = fs.readFileSync(orderControllerPath, 'utf-8');

    assert.ok(
      controllerCode.includes("'test_note'             => 'nullable|string'"),
      'OrderController store must validate test_note'
    );
    assert.ok(
      controllerCode.includes("'test_note'             => $validated['test_note'] ?? null"),
      'OrderController store must save test_note to RepairOrder'
    );
    assert.ok(
      controllerCode.includes('$isTechnician') &&
      controllerCode.includes('subDays(2)->startOfDay()') &&
      controllerCode.includes("whereNotIn('status', ['completed', 'cancelled', 'rejected'])"),
      'OrderController index must aggregate unfinished orders from last 3 days for technician in today scope'
    );

    const modelCode = fs.readFileSync(repairOrderModelPath, 'utf-8');
    assert.ok(
      modelCode.includes("'test_note'"),
      'RepairOrder model must include test_note in $fillable'
    );
  });

  await t.test('2. Shared Types & Mappers: testNote and test_note mapping', () => {
    const typesCode = fs.readFileSync(typesOrderPath, 'utf-8');
    assert.ok(typesCode.includes('test_note?: string | null;'), 'RepairOrder must include test_note');
    assert.ok(typesCode.includes('testNote?: string | null;'), 'RepairOrder must include testNote');

    const providersCode = fs.readFileSync(providersPath, 'utf-8');
    assert.ok(
      providersCode.includes('testNote: o.test_note || o.testNote') &&
      providersCode.includes('test_note: o.test_note || o.testNote'),
      'providers.tsx must map testNote and test_note'
    );

    const techCode = fs.readFileSync(techPagePath, 'utf-8');
    assert.ok(
      techCode.includes('testNote: o.test_note || o.testNote') &&
      techCode.includes('test_note: o.test_note || o.testNote'),
      'tech/page.tsx must map testNote and test_note'
    );

    const repairsCode = fs.readFileSync(repairsPagePath, 'utf-8');
    assert.ok(
      repairsCode.includes('testNote: o.test_note || o.testNote') &&
      repairsCode.includes('test_note: o.test_note || o.testNote'),
      'repairs/page.tsx must map testNote and test_note'
    );
  });

  await t.test('3. Bàn CSKH & Quản lý sửa chữa: Nút Tiếp nhận bảo hành', () => {
    const dashboardCode = fs.readFileSync(dashboardPagePath, 'utf-8');
    assert.ok(
      dashboardCode.includes('data-testid="cskh-warranty-intake-btn"'),
      'Dashboard must render cskh-warranty-intake-btn on CSKH workspace'
    );
    assert.ok(
      dashboardCode.includes('data-testid="admin-warranty-intake-btn"'),
      'Dashboard must render admin-warranty-intake-btn on Admin workspace'
    );
    assert.ok(
      dashboardCode.includes('initialIntakeType={initialIntakeType}'),
      'Dashboard must pass initialIntakeType to IntakeWizardModal'
    );

    const repairsCode = fs.readFileSync(repairsPagePath, 'utf-8');
    assert.ok(
      repairsCode.includes('data-testid="repairs-warranty-intake-btn"'),
      'Repairs page must render repairs-warranty-intake-btn'
    );

    const wizardCode = fs.readFileSync(intakeWizardModalPath, 'utf-8');
    assert.ok(
      wizardCode.includes("defType === 'warranty'") &&
      wizardCode.includes('setPrice(0)'),
      'IntakeWizardModal must initialize price to 0 when opening as warranty'
    );
    assert.ok(
      wizardCode.includes('test_note: dev.testNote.trim() || undefined'),
      'IntakeWizardModal must send test_note in API payload'
    );
  });

  await t.test('4. Chi tiết đơn CSKH và KTV: Hiển thị ghi chú test quầy', () => {
    const repairsCode = fs.readFileSync(repairsPagePath, 'utf-8');
    assert.ok(
      repairsCode.includes('data-testid="order-detail-test-note-box"') &&
      repairsCode.includes('Ghi chú kết quả test tại quầy:'),
      'Repairs detail modal must render order-detail-test-note-box'
    );

    const techDetailCode = fs.readFileSync(techOrderDetailModalPath, 'utf-8');
    assert.ok(
      techDetailCode.includes('data-testid="tech-order-detail-test-note"') &&
      techDetailCode.includes('Ghi chú test từ CSKH:'),
      'TechOrderDetailModal must render tech-order-detail-test-note'
    );
  });

  await t.test('5. Mẫu in nhiệt cuộn K80: In rõ ràng dòng Ghi chú test tại quầy trên các liên', () => {
    const sampleOrderWithNote = {
      id: 'FX26-88899',
      name: 'Nguyễn Văn Minh',
      phone: '0988776655',
      device: 'AirPods Pro 2',
      serial: 'AP2-XYZ-999',
      issue: 'Loa rè khi mở âm lượng trên 70%',
      accessories: 'Đầy đủ dock sạc',
      branch: 'FIXO Store · Quận 1',
      status: 'Chờ kỹ thuật',
      statusType: 'wait',
      price: 350000,
      tech: 'Chưa phân công',
      date: '09/10/2026',
      testNote: 'Tai trái rè rõ, hộp sạc nhận sạc bình thường, pin dock còn 85%',
      createdBy: 'Thu Ngân CSKH',
      checks: [
        { label: 'Loa tai trái', status: 'Lỗi' },
        { label: 'Loa tai phải', status: 'Hoạt động' },
      ],
    };

    // Single K80 slip
    const k80Html = renderThermalK80HTML(sampleOrderWithNote);
    assert.ok(k80Html.includes('Ghi chú test tại quầy:'), 'K80 single slip must contain Ghi chú test tại quầy:');
    assert.ok(k80Html.includes('Tai trái rè rõ'), 'K80 single slip must contain note text');

    // Multi-device K80 slip
    const combinedK80Html = renderCombinedThermalK80HTML(
      [
        sampleOrderWithNote,
        {
          ...sampleOrderWithNote,
          id: 'FX26-88900',
          device: 'Apple Watch Series 7',
          testNote: 'Màn hình cảm ứng bị loạn góc dưới',
        },
      ]
    );

    assert.ok(
      combinedK80Html.includes('Ghi chú test tại quầy:'),
      'K80 combined slip must contain Ghi chú test tại quầy:'
    );
    assert.ok(
      combinedK80Html.includes('Màn hình cảm ứng bị loạn góc dưới'),
      'K80 combined slip must contain second device note'
    );
  });

  await t.test('6. Mẫu in A4: In rõ ràng dòng Ghi chú test tại quầy trên phiếu đơn và phiếu gộp', () => {
    assert.ok(fs.existsSync(a4ReceiptHtmlBuilderPath), 'a4ReceiptHtmlBuilder.ts must exist');
    const a4Code = fs.readFileSync(a4ReceiptHtmlBuilderPath, 'utf-8');

    assert.ok(
      a4Code.includes('testNoteText') &&
      a4Code.includes('Ghi chú test tại quầy:'),
      'a4ReceiptHtmlBuilder must render Ghi chú test tại quầy for single receipts'
    );
    assert.ok(
      a4Code.includes('renderCombinedA4ReceiptHTML') &&
      a4Code.includes('Ghi chú test tại quầy: ${dev.testNote || (dev as any).test_note}'),
      'a4ReceiptHtmlBuilder must render Ghi chú test tại quầy in combined receipt table'
    );
  });
});
