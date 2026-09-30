import assert from 'node:assert';
import test, { describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webAppDir = path.resolve(__dirname, '../app');

// Import FSM helpers
import {
  normalizeStatusCode,
  getStatusCodeLabel,
  getQuickActionsForStatus,
  FSM_QUICK_ACTIONS,
} from '../app/repairs/fsm.ts';

describe('OpenSpec: friendly-fsm-status-messages-and-ui-guard Group 2 Verification', () => {
  test('Task 2.1: normalizeStatusCode handles both Vietnamese labels and snake_case codes 2-way', () => {
    // Vietnamese labels
    assert.strictEqual(normalizeStatusCode('Tiếp nhận mới'), 'inspecting');
    assert.strictEqual(normalizeStatusCode('Đang kiểm tra'), 'inspecting');
    assert.strictEqual(normalizeStatusCode('Chờ khách duyệt'), 'waiting_approval');
    assert.strictEqual(normalizeStatusCode('Chờ kỹ thuật'), 'waiting_tech');
    assert.strictEqual(normalizeStatusCode('Đã nhận đơn'), 'assigned');
    assert.strictEqual(normalizeStatusCode('Đang sửa'), 'in_repair');
    assert.strictEqual(normalizeStatusCode('Chờ linh kiện'), 'waiting_parts');
    assert.strictEqual(normalizeStatusCode('Cần sửa lại'), 'rework_needed');
    assert.strictEqual(normalizeStatusCode('Chờ QC'), 'waiting_qc');
    assert.strictEqual(normalizeStatusCode('Sẵn sàng trả'), 'ready_for_return');
    assert.strictEqual(normalizeStatusCode('Chờ khách nhận'), 'waiting_pickup');
    assert.strictEqual(normalizeStatusCode('Hoàn tất'), 'completed');
    assert.strictEqual(normalizeStatusCode('Khách từ chối'), 'rejected');
    assert.strictEqual(normalizeStatusCode('Từ chối sửa'), 'rejected');
    assert.strictEqual(normalizeStatusCode('Đã hủy'), 'cancelled');

    // snake_case & aliases
    assert.strictEqual(normalizeStatusCode('inspecting'), 'inspecting');
    assert.strictEqual(normalizeStatusCode('waiting_approval'), 'waiting_approval');
    assert.strictEqual(normalizeStatusCode('quote_pending'), 'waiting_approval');
    assert.strictEqual(normalizeStatusCode('waiting_tech'), 'waiting_tech');
    assert.strictEqual(normalizeStatusCode('assigned'), 'assigned');
    assert.strictEqual(normalizeStatusCode('in_repair'), 'in_repair');
    assert.strictEqual(normalizeStatusCode('waiting_parts'), 'waiting_parts');
    assert.strictEqual(normalizeStatusCode('rework_needed'), 'rework_needed');
    assert.strictEqual(normalizeStatusCode('waiting_qc'), 'waiting_qc');
    assert.strictEqual(normalizeStatusCode('qc_pending'), 'waiting_qc');
    assert.strictEqual(normalizeStatusCode('qc_inspecting'), 'waiting_qc');
    assert.strictEqual(normalizeStatusCode('ready_for_return'), 'ready_for_return');
    assert.strictEqual(normalizeStatusCode('waiting_pickup'), 'waiting_pickup');
    assert.strictEqual(normalizeStatusCode('completed'), 'completed');
    assert.strictEqual(normalizeStatusCode('rejected'), 'rejected');
    assert.strictEqual(normalizeStatusCode('cancelled'), 'cancelled');
  });

  test('Task 2.1: getStatusCodeLabel maps canonical snake_case codes to Vietnamese labels', () => {
    assert.strictEqual(getStatusCodeLabel('waiting_qc'), 'Chờ QC');
    assert.strictEqual(getStatusCodeLabel('in_repair'), 'Đang sửa');
    assert.strictEqual(getStatusCodeLabel('ready_for_return'), 'Sẵn sàng trả');
    assert.strictEqual(getStatusCodeLabel('completed'), 'Hoàn tất');
    assert.strictEqual(getStatusCodeLabel('waiting_approval'), 'Chờ khách duyệt');
    assert.strictEqual(getStatusCodeLabel('waiting_tech'), 'Chờ kỹ thuật');
  });

  test('Task 2.1: FSM_QUICK_ACTIONS matrix matches exact lifecycle transitions', () => {
    // inspecting
    const inspectingLabels = getQuickActionsForStatus('inspecting').map((a) => a.label);
    assert.deepStrictEqual(inspectingLabels, ['Chờ khách duyệt', 'Chờ kỹ thuật', 'Đã hủy']);

    // waiting_approval
    const approvalLabels = getQuickActionsForStatus('waiting_approval').map((a) => a.label);
    assert.deepStrictEqual(approvalLabels, ['Chờ kỹ thuật', 'Khách từ chối', 'Đã hủy']);

    // waiting_tech
    const techLabels = getQuickActionsForStatus('waiting_tech').map((a) => a.label);
    assert.deepStrictEqual(techLabels, ['Đang sửa']);

    // in_repair
    const inRepairLabels = getQuickActionsForStatus('in_repair').map((a) => a.label);
    assert.deepStrictEqual(inRepairLabels, ['Chờ linh kiện', 'Chờ QC']);

    // waiting_parts
    const partsLabels = getQuickActionsForStatus('waiting_parts').map((a) => a.label);
    assert.deepStrictEqual(partsLabels, ['Đang sửa']);

    // rework_needed
    const reworkLabels = getQuickActionsForStatus('rework_needed').map((a) => a.label);
    assert.deepStrictEqual(reworkLabels, ['Đang sửa']);

    // waiting_qc: Strictly ['Sẵn sàng trả'] - NO 'Hoàn tất'
    const qcActions = getQuickActionsForStatus('waiting_qc');
    const qcLabels = qcActions.map((a) => a.label);
    assert.deepStrictEqual(qcLabels, ['Sẵn sàng trả']);
    assert.ok(!qcLabels.includes('Hoàn tất'), 'waiting_qc must NEVER contain Hoàn tất button');

    // ready_for_return
    const readyLabels = getQuickActionsForStatus('ready_for_return').map((a) => a.label);
    assert.deepStrictEqual(readyLabels, ['Chờ khách nhận', 'Hoàn tất']);

    // waiting_pickup
    const pickupLabels = getQuickActionsForStatus('waiting_pickup').map((a) => a.label);
    assert.deepStrictEqual(pickupLabels, ['Hoàn tất']);

    // completed
    const completedLabels = getQuickActionsForStatus('completed').map((a) => a.label);
    assert.deepStrictEqual(completedLabels, []);
  });

  test('Task 2.1: getQuickActionsForStatus works identically with Vietnamese status strings', () => {
    assert.deepStrictEqual(
      getQuickActionsForStatus('Chờ QC').map((a) => a.label),
      ['Sẵn sàng trả']
    );
    assert.deepStrictEqual(
      getQuickActionsForStatus('Đang sửa').map((a) => a.label),
      ['Chờ linh kiện', 'Chờ QC']
    );
    assert.deepStrictEqual(
      getQuickActionsForStatus('Sẵn sàng trả').map((a) => a.label),
      ['Chờ khách nhận', 'Hoàn tất']
    );
  });

  test('Task 2.2: repairs/page.tsx replaces static buttons with dynamic FSM_QUICK_ACTIONS rendering', () => {
    const pagePath = path.join(webAppDir, 'repairs/page.tsx');
    assert.ok(fs.existsSync(pagePath), 'repairs/page.tsx must exist');
    const content = fs.readFileSync(pagePath, 'utf-8');

    // Must import and use getQuickActionsForStatus
    assert.ok(content.includes('getQuickActionsForStatus'), 'Must use getQuickActionsForStatus');
    assert.ok(content.includes('normalizeStatusCode'), 'Must use normalizeStatusCode');

    // Must map over actions dynamically
    assert.ok(content.includes('actions.map('), 'Must render buttons by mapping over actions');

    // Must NOT have static 4-button block
    assert.ok(
      !content.includes("onClick={() => handleUpdateStatus('Đang sửa', 'progress')}\n              >\n                Đang sửa\n              </Button>\n              <Button\n                variant=\"secondary\"\n                size=\"sm\"\n                onClick={() => handleUpdateStatus('Chờ QC', 'wait')"),
      'Must have replaced static button block'
    );
  });

  test('Task 2.3: repairs/page.tsx implements specialized handling for Chờ QC (waiting_qc)', () => {
    const pagePath = path.join(webAppDir, 'repairs/page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    // Must detect waiting_qc
    assert.ok(
      content.includes("currentStatusCode === 'waiting_qc'") || content.includes('isWaitingQc'),
      'Must detect waiting_qc status in Drawer'
    );

    // Must have auxiliary button linking to /qc
    assert.ok(content.includes('/qc?id='), 'Must have navigation link to /qc?id=');
    assert.ok(
      content.includes('Mở phiếu kiểm định QC ↗'),
      'Must render button with label Mở phiếu kiểm định QC ↗'
    );

    // Must render QC coordination advisory
    assert.ok(content.includes('Lưu ý QC:'), 'Must show advisory notice for technician during QC');
  });

  test('Task 2.4: handleUpdateStatus extracts Vietnamese error message from API response and toasts it', () => {
    const pagePath = path.join(webAppDir, 'repairs/page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    // Check Toast error extraction pattern
    assert.ok(
      content.includes('err?.response?.data?.message ||') &&
      content.includes('err?.data?.message ||') &&
      content.includes('err?.message'),
      'Must extract error message via err?.response?.data?.message || err?.data?.message || err?.message'
    );
    assert.ok(content.includes("toast(errMsg, 'error')"), 'Must display toast error');
  });
});
