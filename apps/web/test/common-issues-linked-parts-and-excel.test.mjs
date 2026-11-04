import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

import {
  POPULAR_APPLE_WATCH_SIZES,
  COMMON_ISSUE_CATALOG_BY_CATEGORY,
  ALL_COMMON_ISSUE_CATALOG,
  applyWatchSizeToLinkedPart,
  enrichCommonIssueWithParts,
  formatLinkedPartsSummary,
  mergeLinkedPartsFromIssues,
  filterCommonIssues,
  extractWatchSizeFromText,
  applyWatchSizeTagToText,
  inferLinkedPartsFromOrderText,
  parsePartsSummaryToItems,
} from '../app/constants/commonIssueCatalog.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '../..');

/**
 * Helper to dynamically import TypeScript modules that use extensionless relative imports
 * under `node --experimental-strip-types`.
 */
async function loadPartsUsageExcelModule() {
  const targetPath = path.join(webRoot, 'app/dashboard/utils/partsUsageExcelExport.ts');
  const catalogUrl = pathToFileURL(path.join(webRoot, 'app/constants/commonIssueCatalog.ts')).href;
  const revenueUrl = pathToFileURL(
    path.join(webRoot, 'app/dashboard/utils/revenueExcelExport.ts')
  ).href;

  const rawSource = fs.readFileSync(targetPath, 'utf-8');
  const rewritten = rawSource
    .replace("from '../../constants/commonIssueCatalog'", `from '${catalogUrl}'`)
    .replace("from './revenueExcelExport'", `from '${revenueUrl}'`);

  const jsCode = stripTypeScriptTypes(rewritten);
  const base64 = Buffer.from(jsCode, 'utf-8').toString('base64');
  return import(`data:text/javascript;base64,${base64}`);
}

describe('Independent Tester: Common Issue Catalog, Linked Parts, Apple Watch Sizes & CSKH Excel Export', () => {
  test('1. commonIssueCatalog.ts: Cấu trúc Object Lỗi mẫu (linked_parts, keywords, watch_sizes)', () => {
    assert.deepEqual(
      [...POPULAR_APPLE_WATCH_SIZES],
      ['38mm', '40mm', '41mm', '42mm', '44mm', '45mm', '46mm', '49mm (Ultra)'],
      'POPULAR_APPLE_WATCH_SIZES phải chứa đủ 8 size Apple Watch phổ biến từ 38mm đến 49mm (Ultra)'
    );

    assert.ok(
      ALL_COMMON_ISSUE_CATALOG.length >= 12,
      'Catalog phải có ít nhất 12 mẫu Object lỗi cho AirPods, Apple Watch, Apple Pencil'
    );

    for (const item of ALL_COMMON_ISSUE_CATALOG) {
      assert.ok(item.issue_code && item.issue_code.startsWith('ISS-'), `Mỗi lỗi phải có issue_code hợp lệ: ${item.issue_name}`);
      assert.ok(item.category, 'Mỗi lỗi phải có category');
      assert.ok(item.issue_name, 'Mỗi lỗi phải có issue_name');
      assert.ok(Array.isArray(item.keywords) && item.keywords.length > 0, `Lỗi ${item.issue_code} phải có mảng keywords`);
      assert.ok(Array.isArray(item.linked_parts) && item.linked_parts.length > 0, `Lỗi ${item.issue_code} phải có mảng linked_parts`);

      for (const part of item.linked_parts) {
        assert.ok(part.part_sku && part.part_sku.startsWith('LK-'), 'Mỗi linh kiện phải có part_sku bắt đầu bằng LK-');
        assert.ok(part.part_name, 'Mỗi linh kiện phải có part_name');
        assert.ok(typeof part.quantity === 'number' && part.quantity >= 1, 'Số lượng linh kiện >= 1');
        assert.ok(part.unit, 'Mỗi linh kiện phải có đơn vị tính (unit)');
      }

      if (item.category === 'Apple Watch') {
        assert.deepEqual(
          item.watch_sizes,
          [...POPULAR_APPLE_WATCH_SIZES],
          `Lỗi Apple Watch ${item.issue_code} phải đính kèm danh sách watch_sizes`
        );
      }
    }
  });

  test('2. commonIssueCatalog.ts: filterCommonIssues lọc nhanh theo tên lỗi, từ khóa, tên linh kiện và mã SKU', () => {
    const airpodsIssues = COMMON_ISSUE_CATALOG_BY_CATEGORY['AirPods'];
    const watchIssues = COMMON_ISSUE_CATALOG_BY_CATEGORY['Apple Watch'];

    // Filter theo keyword "rít gió" (nằm trong keywords của ISS-AP-002)
    const byKeyword = filterCommonIssues(airpodsIssues, 'rít gió', 'AirPods');
    assert.equal(byKeyword.length, 1);
    assert.equal(byKeyword[0].issue_code, 'ISS-AP-002');

    // Filter theo mã SKU linh kiện "LK-AP-CASE-FLEX"
    const bySku = filterCommonIssues(airpodsIssues, 'LK-AP-CASE-FLEX', 'AirPods');
    assert.equal(bySku.length, 1);
    assert.equal(bySku[0].issue_code, 'ISS-AP-004');

    // Filter theo tên linh kiện "Mặt kính cảm ứng" trên Apple Watch kèm size 45mm
    const byPartName = filterCommonIssues(watchIssues, 'Mặt kính cảm ứng', 'Apple Watch', '45mm');
    assert.equal(byPartName.length, 1);
    assert.equal(byPartName[0].issue_code, 'ISS-AW-002');
    assert.ok(
      byPartName[0].linked_parts.some((p) => p.part_name.includes('[Size 45mm]') && p.watch_size === '45mm'),
      'Kết quả filter Apple Watch khi có watchSize phải tự động gắn [Size 45mm] vào linked_parts'
    );
  });

  test('3. commonIssueCatalog.ts: applyWatchSizeToLinkedPart & mergeLinkedPartsFromIssues', () => {
    const watchPart = {
      part_sku: 'LK-AW-PIN',
      part_name: 'Pin Apple Watch dung lượng chuẩn',
      quantity: 1,
      unit: 'Viên',
      position: 'Body',
    };

    const sized41 = applyWatchSizeToLinkedPart(watchPart, '41mm', 'Apple Watch');
    assert.equal(sized41.watch_size, '41mm');
    assert.equal(sized41.part_name, 'Pin Apple Watch dung lượng chuẩn [Size 41mm]');

    // Khi đổi sang size 49mm (Ultra), không được lặp 2 lần tag [Size ...]
    const resizedUltra = applyWatchSizeToLinkedPart(sized41, '49mm (Ultra)', 'Apple Watch');
    assert.equal(resizedUltra.watch_size, '49mm (Ultra)');
    assert.equal(resizedUltra.part_name, 'Pin Apple Watch dung lượng chuẩn [Size 49mm (Ultra)]');

    // Không gắn size vào linh kiện AirPods
    const airpodsPart = {
      part_sku: 'LK-AP-PIN-CAP',
      part_name: 'Pin tai nghe AirPods dung lượng chuẩn',
      quantity: 1,
      unit: 'Viên',
    };
    const untouchedAirpods = applyWatchSizeToLinkedPart(airpodsPart, '45mm', 'AirPods');
    assert.equal(untouchedAirpods.part_name, 'Pin tai nghe AirPods dung lượng chuẩn');
    assert.equal(untouchedAirpods.watch_size, undefined);

    // mergeLinkedPartsFromIssues khử trùng lặp LK-AW-SEAL khi chọn cả ISS-AW-001 (Pin) và ISS-AW-002 (Kính)
    const watchIssues = COMMON_ISSUE_CATALOG_BY_CATEGORY['Apple Watch'].slice(0, 2);
    const merged = mergeLinkedPartsFromIssues(watchIssues, 'Apple Watch', '44mm');
    const skus = merged.map((p) => p.part_sku);
    assert.deepEqual(
      skus,
      ['LK-AW-PIN', 'LK-AW-SEAL', 'LK-AW-GLASS-TOUCH'],
      'LK-AW-SEAL xuất hiện ở cả 2 lỗi nhưng sau khi merge chỉ được tính 1 lần duy nhất cho mỗi đơn'
    );
    assert.ok(merged.every((p) => p.watch_size === '44mm' && p.part_name.includes('[Size 44mm]')));

    // Kiểm tra extractWatchSizeFromText, applyWatchSizeTagToText, inferLinkedPartsFromOrderText, parsePartsSummaryToItems
    assert.equal(extractWatchSizeFromText('[Size: 49mm (Ultra)] Pin phù bung màn'), '49mm (Ultra)');
    assert.equal(applyWatchSizeTagToText('Dây cao su đen', '45mm'), '[Size: 45mm] Dây cao su đen');
    assert.equal(
      applyWatchSizeTagToText('[Size: 41mm] Dây cao su đen', '46mm'),
      '[Size: 46mm] Dây cao su đen'
    );

    const summaryStr = formatLinkedPartsSummary(merged, '44mm');
    const parsedItems = parsePartsSummaryToItems(summaryStr);
    assert.equal(parsedItems.length, 3);
    assert.equal(parsedItems[0].part_sku, 'LK-AW-PIN');
    assert.equal(parsedItems[0].watch_size, '44mm');

    const inferred = inferLinkedPartsFromOrderText('Bật chống ồn ANC bị rè', 'AirPods Pro 1');
    assert.ok(inferred.matchedIssues.some((i) => i.issue_code === 'ISS-AP-002'));
    assert.ok(inferred.linkedParts.some((p) => p.part_sku === 'LK-AP-MIC-ANC'));
  });

  test('4. partsUsageExcelExport.ts: Tổng hợp số lượng linh kiện tiêu hao (Bảng tổng hợp + Bảng chi tiết theo đơn)', async () => {
    const { extractOrderPartsUsage, buildPartsUsageExcelWorkbook } = await loadPartsUsageExcelModule();

    const sampleOrders = [
      {
        id: 'FX26-Q1-001',
        date: '04/11/2026',
        name: 'Nguyễn Văn A',
        phone: '0901112222',
        deviceCategory: 'AirPods',
        device: 'AirPods Pro 2',
        issue: 'Pin chai, tụt pin nhanh dưới 1 tiếng',
        accessories: 'Tai L, Tai R, Case',
        parts_needed: 'Pin tai nghe AirPods dung lượng chuẩn (LK-AP-PIN-CAP) x2, Keo ron chống nước & cố định vỏ tai nghe (LK-AP-SEAL-KEO) x1',
        partsUsed: 'Pin tai nghe AirPods dung lượng chuẩn (LK-AP-PIN-CAP) x2, Keo ron chống nước & cố định vỏ tai nghe (LK-AP-SEAL-KEO) x1',
        tech: 'KTV Minh',
        status: 'Hoàn tất',
        additional_services: [
          {
            id: 'srv-1',
            name: 'Hộp sạc không nhận sạc',
            price: 300000,
            created_at: '2026-11-04T10:00:00Z',
            added_by_role: 'technician',
            linked_parts: [
              {
                part_sku: 'LK-AP-CASE-FLEX',
                part_name: 'Cụm cáp chân sạc & chấu đồng Hộp sạc (Case)',
                quantity: 1,
                unit: 'Cụm',
              },
            ],
          },
        ],
      },
      {
        id: 'FX26-Q1-002',
        date: '04/11/2026',
        name: 'Trần Thị B',
        phone: '0903334444',
        deviceCategory: 'AirPods',
        device: 'AirPods 3',
        issue: 'Pin chai, tụt pin nhanh dưới 1 tiếng',
        accessories: 'Tai L',
        parts_needed: 'Pin tai nghe AirPods dung lượng chuẩn (LK-AP-PIN-CAP) x1',
        partsUsed: '',
        tech: 'KTV Hùng',
        status: 'Đang sửa',
      },
      {
        id: 'FX26-Q1-003',
        date: '04/11/2026',
        name: 'Lê Hoàng C',
        phone: '0905556666',
        deviceCategory: 'Apple Watch',
        device: 'Apple Watch Series 9',
        issue: '[Size: 45mm] Cảm ứng liệt hoặc loạn sau va đập / Vỡ mặt kính',
        accessories: '[Size: 45mm] Thân máy',
        parts_needed: '',
        partsUsed: '',
        tech: 'KTV Minh',
        status: 'Chờ khách nhận',
      },
    ];

    const usage1 = extractOrderPartsUsage(sampleOrders[0]);
    assert.ok(
      usage1.linkedParts.some((p) => p.part_sku === 'LK-AP-CASE-FLEX'),
      'extractOrderPartsUsage phải gộp cả linked_parts từ additional_services'
    );

    const workbook = buildPartsUsageExcelWorkbook({
      orders: sampleOrders,
      periodLabel: 'Ngày 04/11/2026',
      branchLabel: 'Chi nhánh Quận 1',
    });

    assert.equal(workbook.orderCount, 3, 'Báo cáo phải ghi nhận đúng 3 đơn sửa chữa');
    assert.equal(workbook.detailRows.length, 3, 'Bảng 2 phải có 3 dòng chi tiết tương ứng 3 đơn');

    // Kiểm tra tổng số lượng của LK-AP-PIN-CAP: đơn 1 dùng 2 viên + đơn 2 cần 1 viên = 3 viên trên 2 đơn
    const pinSummary = workbook.summaryRows.find((r) => r.part_sku === 'LK-AP-PIN-CAP');
    assert.ok(pinSummary, 'Bảng tổng hợp phải có mã LK-AP-PIN-CAP');
    assert.equal(pinSummary.total_quantity, 3, 'Tổng số lượng LK-AP-PIN-CAP phải là 3 (2 + 1)');
    assert.equal(pinSummary.order_count, 2, 'Số đơn phát sinh LK-AP-PIN-CAP phải là 2');
    assert.deepEqual(pinSummary.order_codes, ['FX26-Q1-001', 'FX26-Q1-002']);

    // Kiểm tra đơn Apple Watch số 3 tự động suy diễn linh kiện kèm [Size 45mm]
    const watchGlassSummary = workbook.summaryRows.find((r) => r.part_sku === 'LK-AW-GLASS-TOUCH');
    assert.ok(watchGlassSummary, 'Bảng tổng hợp phải suy diễn được LK-AW-GLASS-TOUCH cho đơn Apple Watch');
    assert.ok(
      watchGlassSummary.part_name.includes('[Size 45mm]'),
      'Tên linh kiện Apple Watch trong bảng tổng hợp phải kèm [Size 45mm]'
    );

    // Kiểm tra nội dung HTML xuất ra file .xls
    assert.ok(workbook.fileName.endsWith('.xls'), 'Tên file phải có đuôi .xls');
    assert.ok(workbook.content.startsWith('\uFEFF<html'), 'Nội dung phải có UTF-8 BOM cho Excel');
    assert.ok(
      workbook.content.includes('BẢNG 1 — TỔNG HỢP SỐ LƯỢNG LINH KIỆN TIÊU HAO'),
      'HTML phải có tiêu đề BẢNG 1'
    );
    assert.ok(
      workbook.content.includes('BẢNG 2 — CHI TIẾT LINH KIỆN THEO TỪNG ĐƠN SỬA CHỮA (3 ĐƠN)'),
      'HTML phải có tiêu đề BẢNG 2'
    );
    assert.ok(
      workbook.content.includes('TỔNG CỘNG LINH KIỆN TIÊU HAO'),
      'HTML phải có dòng tổng cộng cuối bảng 1'
    );
  });

  test('5. Kiểm tra tích hợp UI và đầy đủ data-testid trong IntakeWizardModal, IntakeQuickConsole, TechOrderDetailModal, BomInspector, /repairs/page.tsx và CskhDashboardView', () => {
    const intakeWizardContent = fs.readFileSync(
      path.join(webRoot, 'app/components/IntakeWizardModal.tsx'),
      'utf-8'
    );
    const intakeQuickContent = fs.readFileSync(
      path.join(webRoot, 'app/components/IntakeQuickConsole.tsx'),
      'utf-8'
    );
    const techModalContent = fs.readFileSync(
      path.join(webRoot, 'app/components/TechOrderDetailModal.tsx'),
      'utf-8'
    );
    const bomInspectorContent = fs.readFileSync(
      path.join(webRoot, 'app/repairs/components/BomInspector.tsx'),
      'utf-8'
    );
    const repairsPageContent = fs.readFileSync(
      path.join(webRoot, 'app/repairs/page.tsx'),
      'utf-8'
    );
    const cskhDashboardContent = fs.readFileSync(
      path.join(webRoot, 'app/dashboard/components/CskhDashboardView.tsx'),
      'utf-8'
    );

    // 5.1 IntakeWizardModal & IntakeQuickConsole
    assert.ok(
      intakeWizardContent.includes('data-testid="intake-issue-filter-input"'),
      'IntakeWizardModal phải có ô lọc nhanh lỗi/linh kiện (intake-issue-filter-input)'
    );
    assert.ok(
      intakeWizardContent.includes('data-testid="intake-issue-object-preview"'),
      'IntakeWizardModal phải render khung mẫu Object Lỗi & Linh kiện liên kết (intake-issue-object-preview)'
    );
    assert.ok(
      intakeWizardContent.includes('data-testid="toggle-issue-json-preview-btn"') &&
        intakeWizardContent.includes('data-testid="intake-issue-json-code"'),
      'IntakeWizardModal phải hỗ trợ bật/tắt xem cấu trúc JSON mẫu của Object Lỗi'
    );
    assert.ok(
      intakeWizardContent.includes('data-testid="intake-linked-parts-needed-input"'),
      'IntakeWizardModal phải có ô hiển thị/chỉnh sửa linh kiện lỗi tự động link sang Kỹ thuật (intake-linked-parts-needed-input)'
    );
    assert.ok(
      intakeWizardContent.includes('data-testid="apple-watch-size-selector"') &&
        intakeWizardContent.includes('watch-size-chip-'),
      'IntakeWizardModal phải có bộ chọn nhanh Size Apple Watch phổ biến (apple-watch-size-selector)'
    );
    assert.ok(
      intakeQuickContent.includes('data-testid="quick-apple-watch-size-selector"') &&
        intakeQuickContent.includes('data-testid="quick-intake-issue-filter-input"') &&
        intakeQuickContent.includes('data-testid="quick-intake-issue-object-preview"'),
      'IntakeQuickConsole cũng phải đồng bộ bộ chọn Size Apple Watch, ô filter nhanh và preview Object Lỗi'
    );

    // 5.2 TechOrderDetailModal
    assert.ok(
      techModalContent.includes('data-testid="tech-linked-parts-from-cskh"') &&
        techModalContent.includes('data-testid="tech-apply-linked-parts-btn"'),
      'TechOrderDetailModal phải hiển thị khối Linh kiện lỗi được link từ đơn CSKH và nút chèn nhanh'
    );
    assert.ok(
      techModalContent.includes('data-testid="tech-add-issue-parts-section"') &&
        techModalContent.includes('data-testid="tech-issue-filter-input"') &&
        techModalContent.includes('data-testid="tech-additional-issue-name-input"') &&
        techModalContent.includes('data-testid="tech-additional-issue-note-input"') &&
        techModalContent.includes('data-testid="tech-confirm-add-issue-parts-btn"'),
      'TechOrderDetailModal phải có đầy đủ khu vực Điền thêm lỗi & linh kiện phát sinh cho KTV đồng bộ sang CSKH'
    );

    // 5.3 BomInspector & /repairs/page.tsx & CskhDashboardView.tsx
    assert.ok(
      bomInspectorContent.includes('data-testid="cskh-add-service-filter-input"'),
      'BomInspector phải có ô lọc nhanh mẫu lỗi & linh kiện cho CSKH (cskh-add-service-filter-input)'
    );
    assert.ok(
      bomInspectorContent.includes('data-testid="badge-from-tech-need-quote"') &&
        bomInspectorContent.includes('TỪ KỸ THUẬT - CẦN BÁO GIÁ KHÁCH'),
      'BomInspector phải hiển thị badge TỪ KỸ THUẬT - CẦN BÁO GIÁ KHÁCH cho lỗi phát sinh từ KTV'
    );
    assert.ok(
      repairsPageContent.includes('data-testid="repairs-export-parts-excel-btn"') &&
        repairsPageContent.includes('Xuất file Linh kiện (.xls)'),
      'Trang /repairs phải có nút Xuất file Linh kiện (.xls) (repairs-export-parts-excel-btn)'
    );
    assert.ok(
      cskhDashboardContent.includes('data-testid="cskh-export-parts-excel-btn"') &&
        cskhDashboardContent.includes('Xuất file Linh kiện (.xls)'),
      'CskhDashboardView phải có nút Xuất file Linh kiện (.xls) (cskh-export-parts-excel-btn)'
    );
  });

  test('6. Đồng bộ 2 chiều giữa Chọn nhanh thiết bị & Loại thiết bị / Dòng sản phẩm / Thành phần bàn giao', () => {
    const intakeWizardContent = fs.readFileSync(
      path.join(webRoot, 'app/components/IntakeWizardModal.tsx'),
      'utf-8'
    );
    const intakeQuickContent = fs.readFileSync(
      path.join(webRoot, 'app/components/IntakeQuickConsole.tsx'),
      'utf-8'
    );

    assert.ok(
      intakeWizardContent.includes('buildQuickDeviceItemsForCategory') &&
        intakeWizardContent.includes('resolveCanonicalModelName') &&
        intakeWizardContent.includes('isSameDeviceModel'),
      'IntakeWizardModal phải có bộ hàm đồng bộ 2 chiều buildQuickDeviceItemsForCategory, resolveCanonicalModelName, isSameDeviceModel'
    );
    assert.ok(
      intakeWizardContent.includes('quick-category-pill-'),
      'IntakeWizardModal phải có thanh pill chuyển nhanh danh mục (quick-category-pill-) đồng bộ với Loại thiết bị bên dưới'
    );
    assert.ok(
      intakeWizardContent.includes("dev.category === 'AirPods'") &&
        intakeWizardContent.includes('data-testid="airpods-handover-parts-selector"') &&
        intakeWizardContent.includes('data-testid="category-handover-parts-selector"'),
      'IntakeWizardModal chỉ hiển thị L / R / Case khi category === AirPods, các danh mục khác hiển thị thành phần bàn giao tương ứng'
    );
    assert.ok(
      intakeWizardContent.includes('sanitizeAccessoriesOnCategoryChange') &&
        intakeWizardContent.includes('Thân bút (Pencil)') &&
        intakeWizardContent.includes('Thân đồng hồ (Body)'),
      'IntakeWizardModal phải có thành phần bàn giao riêng cho Apple Pencil, Apple Watch và tự động xóa thành phần cũ khi đổi danh mục'
    );
    assert.ok(
      intakeQuickContent.includes("device.category === 'AirPods'") &&
        intakeQuickContent.includes('data-testid="quick-category-handover-parts-selector"'),
      'IntakeQuickConsole cũng chỉ hiển thị L / R / Case cho AirPods và hiển thị thành phần bàn giao đúng danh mục cho thiết bị khác'
    );
  });
});
