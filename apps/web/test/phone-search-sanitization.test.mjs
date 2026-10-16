import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sanitizeInputLive,
  sanitizeInputText,
  sanitizeSearchQuery,
  normalizePhoneForStorage,
  normalizePhoneForSubmit,
  extractPhoneCoreDigits,
  isPhoneLikeQuery,
  matchesPhoneFlexible,
} from '../../../packages/ui/src/utils/text.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '../..');

describe('OpenSpec: fix-phone-search-and-unicode-sanitization Frontend Verification', () => {
  test('Task 2.1: Unicode sanitization utilities strip invisible characters and normalize spaces', () => {
    // Invisible Unicode from Zalo / iOS Contacts (e.g. \u202D ... \u202C, \u200B, \uFEFF)
    assert.strictEqual(sanitizeInputText('\u202D0898842339\u202C'), '0898842339');
    assert.strictEqual(sanitizeInputText('\u202Ddung'), 'dung');
    assert.strictEqual(sanitizeSearchQuery('  \u200BNguyễn\u00A0  Văn   A\uFEFF  '), 'Nguyễn Văn A');
    assert.strictEqual(sanitizeSearchQuery('\u202D 0987 783 9144 \u202C'), '0987 783 9144');

    // Live input strips invisible Unicode without eating trailing space while typing
    assert.strictEqual(sanitizeInputLive('\u202DTrần Văn '), 'Trần Văn ');
  });

  test('Task 2.1: Phone normalization & flexible phone matching handle missing leading 0, +84, spaces, and 4-10 digit queries', () => {
    // normalizePhoneForStorage / normalizePhoneForSubmit
    assert.strictEqual(normalizePhoneForStorage('\u202D0898 842.339\u202C'), '0898842339');
    assert.strictEqual(normalizePhoneForStorage('+84 987-783-9144'), '09877839144');
    assert.strictEqual(normalizePhoneForStorage('84912345678'), '0912345678');
    // Missing leading zero (9-digit or 10-digit mobile starting with 3/5/7/8/9)
    assert.strictEqual(normalizePhoneForStorage('9877839144'), '09877839144');
    assert.strictEqual(normalizePhoneForSubmit('912345678'), '0912345678');

    // extractPhoneCoreDigits
    assert.strictEqual(extractPhoneCoreDigits('09877839144'), '9877839144');
    assert.strictEqual(extractPhoneCoreDigits('+849877839144'), '9877839144');
    assert.strictEqual(extractPhoneCoreDigits('9877839144'), '9877839144');

    // isPhoneLikeQuery
    assert.strictEqual(isPhoneLikeQuery('9144'), true);
    assert.strictEqual(isPhoneLikeQuery('0836 686 939'), true);
    assert.strictEqual(isPhoneLikeQuery('\u202D0898842339\u202C'), true);
    assert.strictEqual(isPhoneLikeQuery('ORD-1234'), false);

    // matchesPhoneFlexible across real VPS log cases
    assert.strictEqual(matchesPhoneFlexible('9877839144', '09877839144'), true);
    assert.strictEqual(matchesPhoneFlexible('09877839144', '9877839144'), true);
    assert.strictEqual(matchesPhoneFlexible('09877839144', '+84 987 783 9144'), true);
    assert.strictEqual(matchesPhoneFlexible('09877839144', '9144'), true);
    assert.strictEqual(matchesPhoneFlexible('0836 686 939', '0836686939'), true);
    assert.strictEqual(matchesPhoneFlexible('\u202D0898842339\u202C', '0898842339'), true);
    assert.strictEqual(matchesPhoneFlexible('0898842339', '\u202D842339\u202C'), true);
    assert.strictEqual(matchesPhoneFlexible('0898842339', '0999999999'), false);
  });

  test('Task 2.1: FilterBar and Topbar integrate Unicode sanitization and Enter submission', () => {
    const uiIndex = fs.readFileSync(path.join(repoRoot, 'packages/ui/src/index.ts'), 'utf-8');
    const filterBarCode = fs.readFileSync(
      path.join(repoRoot, 'packages/ui/src/molecules/FilterBar.tsx'),
      'utf-8'
    );
    const topbarCode = fs.readFileSync(
      path.join(repoRoot, 'packages/ui/src/organisms/Topbar.tsx'),
      'utf-8'
    );

    assert.ok(uiIndex.includes("export * from './utils/text'"), 'packages/ui must export utils/text');
    assert.ok(
      filterBarCode.includes('sanitizeInputLive') || filterBarCode.includes('sanitizeInputText'),
      'FilterBar must sanitize search input on change'
    );
    assert.ok(
      topbarCode.includes('onSearchSubmit?: (val: string) => void'),
      'Topbar must support onSearchSubmit prop'
    );
    assert.ok(
      topbarCode.includes("e.key === 'Enter'"),
      'Topbar must trigger onSearchSubmit when pressing Enter'
    );
  });

  test('Task 2.2: AppShell, RepairsPage, CustomersPage, IntakeWizardModal, and AdminEditOrderModal wire search & sanitization', () => {
    const appShellCode = fs.readFileSync(
      path.join(webRoot, 'app/components/AppShell.tsx'),
      'utf-8'
    );
    const repairsCode = fs.readFileSync(path.join(webRoot, 'app/repairs/page.tsx'), 'utf-8');
    const customersCode = fs.readFileSync(path.join(webRoot, 'app/customers/page.tsx'), 'utf-8');
    const intakeCode = fs.readFileSync(
      path.join(webRoot, 'app/components/IntakeWizardModal.tsx'),
      'utf-8'
    );
    const adminEditCode = fs.readFileSync(
      path.join(webRoot, 'app/components/AdminEditOrderModal.tsx'),
      'utf-8'
    );

    // AppShell connects Topbar search to /repairs?search=...
    assert.ok(
      appShellCode.includes('handleTopbarSearchSubmit') && appShellCode.includes('/repairs?search='),
      'AppShell must route Topbar search submissions to /repairs'
    );

    // RepairsPage reads URL search/q param, expands date_filter to all when searching, and uses matchesPhoneFlexible
    assert.ok(
      repairsCode.includes("searchParams.get('search') || searchParams.get('q')") ||
        repairsCode.includes("searchParams.get('search') ?? searchParams.get('q')"),
      'RepairsPage must sync search from URL search/q query parameter'
    );
    assert.ok(
      repairsCode.includes("params.date_filter = 'all'") &&
        repairsCode.includes('else if (cleanSearch)'),
      'RepairsPage must expand date_filter to "all" when searching without a fixed selectedDate'
    );
    assert.ok(
      repairsCode.includes('matchesPhoneFlexible(o.phone, cleanQ)'),
      'RepairsPage client filter must use matchesPhoneFlexible'
    );

    // Customers, IntakeWizardModal, AdminEditOrderModal normalize phone before submit
    assert.ok(
      customersCode.includes('normalizePhoneForStorage') &&
        customersCode.includes('sanitizeSearchQuery'),
      'CustomersPage must sanitize search and normalize phone for storage'
    );
    assert.ok(
      intakeCode.includes('normalizePhoneForStorage') &&
        intakeCode.includes('sanitizeSearchQuery'),
      'IntakeWizardModal must normalize phone and sanitize search queries'
    );
    assert.ok(
      adminEditCode.includes('normalizePhoneForStorage'),
      'AdminEditOrderModal must normalize phone before updating customer'
    );
  });

  test('Task 2.3: WarrantyPage, PaymentsPage, and ShipmentsPage support flexible phone search and customerPhone matching', () => {
    const warrantyCode = fs.readFileSync(path.join(webRoot, 'app/warranty/page.tsx'), 'utf-8');
    const paymentsCode = fs.readFileSync(path.join(webRoot, 'app/payments/page.tsx'), 'utf-8');
    const shipmentsCode = fs.readFileSync(path.join(webRoot, 'app/shipments/page.tsx'), 'utf-8');

    // Warranty lookup relaxes strict 9-12 digit regex and uses matchesPhoneFlexible
    assert.ok(
      warrantyCode.includes('isPhoneLikeQuery(query)') &&
        warrantyCode.includes('matchesPhoneFlexible'),
      'WarrantyPage must use isPhoneLikeQuery and matchesPhoneFlexible'
    );

    // PaymentsPage maps customerPhone and filters with matchesPhoneFlexible
    assert.ok(
      paymentsCode.includes('customerPhone: string') &&
        paymentsCode.includes('matchesPhoneFlexible(p.customerPhone, q)'),
      'PaymentsPage must map customerPhone and filter using matchesPhoneFlexible'
    );

    // ShipmentsPage maps customerPhone and filters with matchesPhoneFlexible
    assert.ok(
      shipmentsCode.includes('customerPhone: string') &&
        shipmentsCode.includes('matchesPhoneFlexible(s.customerPhone, q)'),
      'ShipmentsPage must map customerPhone and filter using matchesPhoneFlexible'
    );
  });
});
