import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '..');
const repairsPagePath = path.join(webDir, 'app/repairs/page.tsx');

describe('Repairs Table STT (Sequence Number) - Option A Test Suite', () => {

  describe('Static Code Verification in apps/web/app/repairs/page.tsx', () => {
    test('repairs/page.tsx exists', () => {
      assert.ok(fs.existsSync(repairsPagePath), 'repairs/page.tsx must exist');
    });

    test('repairs/page.tsx implements Option A formula: filteredOrders.length - idx', () => {
      const content = fs.readFileSync(repairsPagePath, 'utf-8');

      // Must NOT contain old idx + 1 for table rows
      assert.ok(
        !content.includes('{idx + 1}</td>'),
        'repairs/page.tsx must NOT use {idx + 1} for order sequence number'
      );

      // Must contain Option A logic: filteredOrders.length - idx
      assert.ok(
        content.includes('{filteredOrders.length - idx}'),
        'repairs/page.tsx must render {filteredOrders.length - idx}'
      );

      // Must include data-testid="order-row-stt" for testability
      assert.ok(
        content.includes('data-testid="order-row-stt"'),
        'repairs/page.tsx must have data-testid="order-row-stt"'
      );
    });
  });

  describe('Runtime STT Calculation Simulation (Option A behavior)', () => {
    // Formula under test
    const calculateSTT = (totalCount, idx) => totalCount - idx;

    test('Scenario 1: Initial list of 8 orders (newest at index 0)', () => {
      const orders = [
        { id: 'ORD-008', createdAt: '2026-10-10 11:00' }, // Newest
        { id: 'ORD-007', createdAt: '2026-10-10 10:30' },
        { id: 'ORD-006', createdAt: '2026-10-10 10:00' },
        { id: 'ORD-005', createdAt: '2026-10-10 09:30' },
        { id: 'ORD-004', createdAt: '2026-10-10 09:00' },
        { id: 'ORD-003', createdAt: '2026-10-10 08:30' },
        { id: 'ORD-002', createdAt: '2026-10-10 08:00' },
        { id: 'ORD-001', createdAt: '2026-10-10 07:30' }, // Oldest (morning)
      ];

      const renderedRows = orders.map((order, idx) => ({
        id: order.id,
        stt: calculateSTT(orders.length, idx),
      }));

      // Top row (idx = 0) must have STT = 8
      assert.strictEqual(renderedRows[0].stt, 8, 'Top row (idx = 0) must have STT = 8');
      assert.strictEqual(renderedRows[0].id, 'ORD-008');

      // Second row (idx = 1) must have STT = 7
      assert.strictEqual(renderedRows[1].stt, 7);

      // Bottom row (idx = 7) must have STT = 1 (oldest morning order keeps STT = 1)
      assert.strictEqual(renderedRows[7].stt, 1, 'Bottom row (idx = 7) must have STT = 1');
      assert.strictEqual(renderedRows[7].id, 'ORD-001');

      // Sequence must strictly be descending [8, 7, 6, 5, 4, 3, 2, 1]
      const sttList = renderedRows.map(r => r.stt);
      assert.deepStrictEqual(sttList, [8, 7, 6, 5, 4, 3, 2, 1]);
    });

    test('Scenario 2: Creating 9th order -> New order on top receives STT = 9 ("đơn mới lên số mới"), older orders keep their STT', () => {
      // Prior orders
      const previousOrders = [
        { id: 'ORD-008' },
        { id: 'ORD-007' },
        { id: 'ORD-006' },
        { id: 'ORD-005' },
        { id: 'ORD-004' },
        { id: 'ORD-003' },
        { id: 'ORD-002' },
        { id: 'ORD-001' },
      ];
      const previousSttMap = new Map(
        previousOrders.map((o, idx) => [o.id, calculateSTT(previousOrders.length, idx)])
      );

      // New order created and prepended to top of list
      const newOrder = { id: 'ORD-009' };
      const updatedOrders = [newOrder, ...previousOrders];

      const newRenderedRows = updatedOrders.map((order, idx) => ({
        id: order.id,
        stt: calculateSTT(updatedOrders.length, idx),
      }));

      // Top row (new order) must receive incremental number 9
      assert.strictEqual(newRenderedRows[0].id, 'ORD-009');
      assert.strictEqual(newRenderedRows[0].stt, 9, 'New order on top receives STT = 9');

      // Crucial verification: All previous orders retain their exact same STT!
      // ORD-008 was STT 8, now at index 1 -> 9 - 1 = 8 (STILL 8)
      assert.strictEqual(newRenderedRows[1].id, 'ORD-008');
      assert.strictEqual(newRenderedRows[1].stt, 8);
      assert.strictEqual(newRenderedRows[1].stt, previousSttMap.get('ORD-008'));

      // Check all existing orders retain their original STT numbers
      for (let i = 1; i < newRenderedRows.length; i++) {
        const row = newRenderedRows[i];
        const previousSTT = previousSttMap.get(row.id);
        assert.strictEqual(
          row.stt,
          previousSTT,
          `Order ${row.id} must preserve its STT of ${previousSTT} after new order is prepended`
        );
      }

      // Oldest morning order ORD-001 still has STT = 1
      assert.strictEqual(newRenderedRows[8].id, 'ORD-001');
      assert.strictEqual(newRenderedRows[8].stt, 1);

      // Sequence must strictly be descending [9, 8, 7, 6, 5, 4, 3, 2, 1]
      const sttList = newRenderedRows.map(r => r.stt);
      assert.deepStrictEqual(sttList, [9, 8, 7, 6, 5, 4, 3, 2, 1]);
    });

    test('Scenario 3: Filtered list calculation consistency', () => {
      // When searching/filtering down to 3 orders
      const filtered = [
        { id: 'ORD-005' },
        { id: 'ORD-003' },
        { id: 'ORD-001' },
      ];

      const result = filtered.map((o, idx) => calculateSTT(filtered.length, idx));
      assert.deepStrictEqual(result, [3, 2, 1]);
    });
  });
});
