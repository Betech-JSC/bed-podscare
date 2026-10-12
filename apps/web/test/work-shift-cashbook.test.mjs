import assert from 'node:assert';
import test, { describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');
const webDir = path.resolve(__dirname, '..');

describe('OpenSpec: branch-cashbook-and-shift-reconciliation Frontend Verification', () => {
  test('Phase 4.1: Types in @podscare/types exist and contain shift and cashbook interfaces', () => {
    const shiftTypesPath = path.resolve(rootDir, 'packages/types/src/shift.ts');
    assert.ok(fs.existsSync(shiftTypesPath), 'shift.ts types file must exist');

    const content = fs.readFileSync(shiftTypesPath, 'utf8');
    assert.ok(content.includes('export interface WorkShift'), 'Must define WorkShift');
    assert.ok(content.includes('export interface CashTransaction'), 'Must define CashTransaction');
    assert.ok(content.includes('export interface ShiftReconciliationSummary'), 'Must define ShiftReconciliationSummary');
    assert.ok(content.includes('export interface BranchCashBalance'), 'Must define BranchCashBalance');
    assert.ok(content.includes('actual_cash'), 'Must include actual_cash');
    assert.ok(content.includes('reconciliation_notes'), 'Must include reconciliation_notes');
    assert.ok(content.includes('carried_over_cash'), 'Must include carried_over_cash');
    assert.ok(content.includes('deposited_cash'), 'Must include deposited_cash');
  });

  test('Phase 4.2: ShiftService and CashbookService are defined and exported in @podscare/api-client', () => {
    const shiftServicePath = path.resolve(rootDir, 'packages/api-client/src/services/shift.service.ts');
    const cashbookServicePath = path.resolve(rootDir, 'packages/api-client/src/services/cashbook.service.ts');
    const indexClientPath = path.resolve(rootDir, 'packages/api-client/src/index.ts');

    assert.ok(fs.existsSync(shiftServicePath), 'shift.service.ts must exist');
    assert.ok(fs.existsSync(cashbookServicePath), 'cashbook.service.ts must exist');

    const indexContent = fs.readFileSync(indexClientPath, 'utf8');
    assert.ok(indexContent.includes('shift.service'), 'index.ts must export shift.service');
    assert.ok(indexContent.includes('cashbook.service'), 'index.ts must export cashbook.service');

    const shiftContent = fs.readFileSync(shiftServicePath, 'utf8');
    assert.ok(shiftContent.includes('getCurrentShift'), 'Must have getCurrentShift');
    assert.ok(shiftContent.includes('openShift'), 'Must have openShift');
    assert.ok(shiftContent.includes('closeShift'), 'Must have closeShift');
    assert.ok(shiftContent.includes('getShiftSummary'), 'Must have getShiftSummary');
    assert.ok(shiftContent.includes('getShiftPrintData'), 'Must have getShiftPrintData');

    const cashContent = fs.readFileSync(cashbookServicePath, 'utf8');
    assert.ok(cashContent.includes('getTransactions'), 'Must have getTransactions');
    assert.ok(cashContent.includes('createExpense'), 'Must have createExpense');
    assert.ok(cashContent.includes('getBranchBalance'), 'Must have getBranchBalance');
  });

  test('Phase 5.1 & 5.2: ShiftControlWidget and OpenShiftModal follow Calm Jade and Zero-Emoji rule', () => {
    const widgetPath = path.resolve(webDir, 'app/components/ShiftControlWidget.tsx');
    const openModalPath = path.resolve(webDir, 'app/components/OpenShiftModal.tsx');
    const bannerPath = path.resolve(webDir, 'app/components/CurrentShiftBanner.tsx');

    assert.ok(fs.existsSync(widgetPath), 'ShiftControlWidget must exist');
    assert.ok(fs.existsSync(openModalPath), 'OpenShiftModal must exist');
    assert.ok(fs.existsSync(bannerPath), 'CurrentShiftBanner must exist');

    const widgetContent = fs.readFileSync(widgetPath, 'utf8');
    const openContent = fs.readFileSync(openModalPath, 'utf8');
    const bannerContent = fs.readFileSync(bannerPath, 'utf8');

    // Strict zero-emoji check
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    assert.ok(!emojiRegex.test(widgetContent), 'ShiftControlWidget must not contain emojis');
    assert.ok(!emojiRegex.test(openContent), 'OpenShiftModal must not contain emojis');
    assert.ok(!emojiRegex.test(bannerContent), 'CurrentShiftBanner must not contain emojis');

    // Calm Jade color usage check (#176b51)
    assert.ok(widgetContent.includes('#176b51') || widgetContent.includes('#eaf4ef'), 'Should use Calm Jade tokens');
    assert.ok(openContent.includes('#176b51'), 'Should use Calm Jade token #176b51');
    assert.ok(bannerContent.includes('#176b51'), 'Banner should use Calm Jade token #176b51');
  });

  test('Phase 5.3: CloseShiftModal has SINGLE actual_cash CurrencyInput, NO polymer denomination table', () => {
    const closeModalPath = path.resolve(webDir, 'app/components/CloseShiftModal.tsx');
    assert.ok(fs.existsSync(closeModalPath), 'CloseShiftModal must exist');

    const content = fs.readFileSync(closeModalPath, 'utf8');

    // Check absence of polymer denomination table
    assert.ok(!content.includes('500000'), 'Must NOT contain polymer 500k breakdown');
    assert.ok(!content.includes('200000'), 'Must NOT contain polymer 200k breakdown');
    assert.ok(!content.includes('100000'), 'Must NOT contain polymer 100k breakdown');
    assert.ok(!content.includes('50000'), 'Must NOT contain polymer 50k breakdown');
    assert.ok(!content.includes('denomination'), 'Must NOT have denomination logic');

    // Check single actual_cash CurrencyInput
    assert.ok(content.includes('actualCash'), 'Must bind actualCash state');
    assert.ok(content.includes('CurrencyInput'), 'Must use CurrencyInput component');
    assert.ok(content.includes('reconciliationNotes'), 'Must bind reconciliationNotes state');
    assert.ok(content.includes('isMismatched'), 'Must track mismatch state');
    assert.ok(content.includes('carriedOverCash'), 'Must track carriedOverCash state');
    assert.ok(content.includes('depositedCash'), 'Must calculate depositedCash');

    // Zero-emoji check
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    assert.ok(!emojiRegex.test(content), 'CloseShiftModal must not contain emojis');
  });

  test('Phase 5.4 & 5.5: Shifts and Cashbook Pages are mounted and properly routed', () => {
    const shiftsPagePath = path.resolve(webDir, 'app/shifts/page.tsx');
    const cashbookPagePath = path.resolve(webDir, 'app/dashboard/cashbook/page.tsx');

    assert.ok(fs.existsSync(shiftsPagePath), 'app/shifts/page.tsx must exist');
    assert.ok(fs.existsSync(cashbookPagePath), 'app/dashboard/cashbook/page.tsx must exist');

    const shiftsContent = fs.readFileSync(shiftsPagePath, 'utf8');
    assert.ok(shiftsContent.includes('CurrentShiftBanner'), 'Shifts page must display CurrentShiftBanner');
    assert.ok(shiftsContent.includes('cashbook'), 'Must have cashbook tab');
    assert.ok(shiftsContent.includes('shifts'), 'Must have shifts history tab');
    assert.ok(shiftsContent.includes('/payments'), 'Must have cross-link to payments');
  });

  test('Phase 6.1: ShiftReceiptPrint supports both K80 thermal and A4 admin formats', () => {
    const printPath = path.resolve(webDir, 'app/components/print/ShiftReceiptPrint.tsx');
    assert.ok(fs.existsSync(printPath), 'ShiftReceiptPrint.tsx must exist');

    const content = fs.readFileSync(printPath, 'utf8');
    assert.ok(content.includes('k80'), 'Must support k80 format');
    assert.ok(content.includes('a4'), 'Must support a4 format');
    assert.ok(content.includes('window.print'), 'Must call window.print');
    assert.ok(content.includes('BIÊN BẢN CHỐT CA'), 'Must have receipt title');
    assert.ok(content.includes('NGƯỜI BÀN GIAO'), 'Must have handover signature block');
    assert.ok(content.includes('NGƯỜI NHẬN BÀN GIAO'), 'Must have recipient signature block');
    assert.ok(content.includes('QUẢN LÝ CHI NHÁNH'), 'Must have manager signature block');

    // Zero-emoji check
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    assert.ok(!emojiRegex.test(content), 'ShiftReceiptPrint must not contain emojis');
  });
});
