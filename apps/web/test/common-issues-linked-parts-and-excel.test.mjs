import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

import {
  POPULAR_APPLE_WATCH_SIZES,
  DEFAULT_ISSUE_PARTS_PRESETS,
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
  buildDeviceIssueSelectionKey,
  toggleIssueNameInDescription,
} from '../app/constants/commonIssueCatalog.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

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

const REAL_WAREHOUSE_SKUS = new Set([
  'BAT-APP2-01',
  'BAT-APP-01',
  'BAT-APP3-02',
  'MESH-APP-02',
  'FLEX-CASE-01',
  'CASE-APP2-04',
  'AW-BAT-01',
  'AW-GLASS-01',
  'APEN-TIP-01',
]);

describe('Independent Tester: Common Issue Catalog (Real Warehouse SKUs), Linked Parts Deduction & Inventory Excel Export Hub', () => {
  test('1. commonIssueCatalog.ts: Đồng bộ 100% mã SKU linh kiện thật trong Kho & Mua hàng (/inventory)', () => {
    assert.deepEqual(
      [...POPULAR_APPLE_WATCH_SIZES],
      ['38mm', '40mm', '41mm', '42mm', '44mm', '45mm', '46mm', '49mm (Ultra)'],
      'POPULAR_APPLE_WATCH_SIZES phải chứa đủ 8 size Apple Watch phổ biến từ 38mm đến 49mm (Ultra)'
    );

    assert.ok(
      Array.isArray(DEFAULT_ISSUE_PARTS_PRESETS) && DEFAULT_ISSUE_PARTS_PRESETS.length >= 9,
      'DEFAULT_ISSUE_PARTS_PRESETS phải có đầy đủ các nhóm lỗi chuẩn'
    );

    const presetSkus = new Set(
      DEFAULT_ISSUE_PARTS_PRESETS.flatMap((p) => p.linked_parts.map((pt) => pt.part_sku))
    );
    for (const expectedSku of REAL_WAREHOUSE_SKUS) {
      assert.ok(
        presetSkus.has(expectedSku),
        `DEFAULT_ISSUE_PARTS_PRESETS phải chứa mã SKU thật trong kho: ${expectedSku}`
      );
    }

    assert.ok(
      ALL_COMMON_ISSUE_CATALOG.length >= 12,
      'Catalog phải có ít nhất 12 mẫu lỗi cho AirPods, Apple Watch, Apple Pencil'
    );

    for (const item of ALL_COMMON_ISSUE_CATALOG) {
      assert.ok(
        item.issue_code && item.issue_code.startsWith('ISS-'),
        `Mỗi lỗi phải có issue_code hợp lệ: ${item.issue_name}`
      );
      assert.ok(item.category, 'Mỗi lỗi phải có category');
      assert.ok(item.issue_name, 'Mỗi lỗi phải có issue_name');
      assert.ok(
        Array.isArray(item.keywords) && item.keywords.length > 0,
        `Lỗi ${item.issue_code} phải có mảng keywords`
      );
      assert.ok(
        Array.isArray(item.linked_parts) && item.linked_parts.length > 0,
        `Lỗi ${item.issue_code} phải có mảng linked_parts`
      );

      for (const part of item.linked_parts) {
        assert.ok(
          REAL_WAREHOUSE_SKUS.has(part.part_sku),
          `Linh kiện ${part.part_sku} của lỗi ${item.issue_code} phải nằm trong tập SKU thật của Kho & Mua hàng`
        );
        assert.ok(part.part_name, 'Mỗi linh kiện phải có part_name');
        assert.ok(
          typeof part.quantity === 'number' && part.quantity >= 1,
          'Số lượng linh kiện >= 1'
        );
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

    // Kiểm tra ưu tiên giữ nguyên linked_parts trả về từ Backend API /api/v1/services/common-issues
    const backendIssue = {
      id: 99,
      category: 'AirPods',
      issue_name: 'Pin chai, tụt pin nhanh dưới 1 tiếng',
      linked_parts: [
        {
          part_sku: 'BAT-APP-01',
          part_name: 'Pin tai nghe AirPods Pro',
          quantity: 2,
          unit: 'Viên',
        },
      ],
    };
    const enrichedBackend = enrichCommonIssueWithParts(backendIssue, 'AirPods');
    assert.equal(enrichedBackend.linked_parts.length, 1);
    assert.equal(enrichedBackend.linked_parts[0].part_sku, 'BAT-APP-01');
    assert.equal(enrichedBackend.linked_parts[0].quantity, 2);
  });

  test('2. commonIssueCatalog.ts: filterCommonIssues lọc nhanh theo tên lỗi, từ khóa, tên linh kiện và mã SKU kho thật', () => {
    const airpodsIssues = COMMON_ISSUE_CATALOG_BY_CATEGORY['AirPods'];
    const watchIssues = COMMON_ISSUE_CATALOG_BY_CATEGORY['Apple Watch'];

    // Filter theo keyword "rít gió" (nằm trong keywords của ISS-AP-002)
    const byKeyword = filterCommonIssues(airpodsIssues, 'rít gió', 'AirPods');
    assert.equal(byKeyword.length, 1);
    assert.equal(byKeyword[0].issue_code, 'ISS-AP-002');

    // Filter theo mã SKU linh kiện kho thật "CASE-APP2-04"
    const bySku = filterCommonIssues(airpodsIssues, 'CASE-APP2-04', 'AirPods');
    assert.equal(bySku.length, 1);
    assert.equal(bySku[0].issue_code, 'ISS-AP-004');

    // Filter theo tên linh kiện "Mặt kính cảm ứng" trên Apple Watch kèm size 45mm
    const byPartName = filterCommonIssues(
      watchIssues,
      'Mặt kính cảm ứng',
      'Apple Watch',
      '45mm'
    );
    assert.ok(byPartName.length >= 1);
    assert.equal(byPartName[0].issue_code, 'ISS-AW-002');
    assert.ok(
      byPartName[0].linked_parts.some(
        (p) =>
          p.part_sku === 'AW-GLASS-01' &&
          p.part_name.includes('[Size 45mm]') &&
          p.watch_size === '45mm'
      ),
      'Kết quả filter Apple Watch khi có watchSize phải tự động gắn [Size 45mm] vào AW-GLASS-01'
    );
  });

  test('3. commonIssueCatalog.ts: applyWatchSizeToLinkedPart, mergeLinkedPartsFromIssues & formatLinkedPartsSummary chuẩn trừ kho', () => {
    const watchPart = {
      part_sku: 'AW-BAT-01',
      part_name: 'Pin Apple Watch chuẩn dung lượng',
      quantity: 1,
      unit: 'Viên',
      position: 'Body',
    };

    const sized41 = applyWatchSizeToLinkedPart(watchPart, '41mm', 'Apple Watch');
    assert.equal(sized41.watch_size, '41mm');
    assert.equal(sized41.part_name, 'Pin Apple Watch chuẩn dung lượng [Size 41mm]');

    // Khi đổi sang size 49mm (Ultra), không được lặp 2 lần tag [Size ...]
    const resizedUltra = applyWatchSizeToLinkedPart(sized41, '49mm (Ultra)', 'Apple Watch');
    assert.equal(resizedUltra.watch_size, '49mm (Ultra)');
    assert.equal(
      resizedUltra.part_name,
      'Pin Apple Watch chuẩn dung lượng [Size 49mm (Ultra)]'
    );

    // Không gắn size vào linh kiện AirPods
    const airpodsPart = {
      part_sku: 'BAT-APP2-01',
      part_name: 'Pin tai nghe AirPods Pro 2',
      quantity: 1,
      unit: 'Viên',
    };
    const untouchedAirpods = applyWatchSizeToLinkedPart(airpodsPart, '45mm', 'AirPods');
    assert.equal(untouchedAirpods.part_name, 'Pin tai nghe AirPods Pro 2');
    assert.equal(untouchedAirpods.watch_size, undefined);

    // mergeLinkedPartsFromIssues khử trùng lặp MESH-APP-02 khi chọn cả ISS-AP-002 (ANC) và ISS-AP-003 (Loa)
    const apIssues = [
      COMMON_ISSUE_CATALOG_BY_CATEGORY['AirPods'][1], // ISS-AP-002: MESH-APP-02, FLEX-CASE-01
      COMMON_ISSUE_CATALOG_BY_CATEGORY['AirPods'][2], // ISS-AP-003: MESH-APP-02
    ];
    const mergedAp = mergeLinkedPartsFromIssues(apIssues, 'AirPods');
    assert.deepEqual(
      mergedAp.map((p) => p.part_sku),
      ['MESH-APP-02', 'FLEX-CASE-01'],
      'MESH-APP-02 xuất hiện ở cả 2 lỗi nhưng sau khi merge chỉ được trừ 1 lần duy nhất'
    );

    // Merge cho Apple Watch
    const watchIssues = COMMON_ISSUE_CATALOG_BY_CATEGORY['Apple Watch'].slice(0, 2);
    const mergedWatch = mergeLinkedPartsFromIssues(watchIssues, 'Apple Watch', '44mm');
    assert.deepEqual(
      mergedWatch.map((p) => p.part_sku),
      ['AW-BAT-01', 'AW-GLASS-01']
    );

    const summaryStr = formatLinkedPartsSummary(mergedWatch, '44mm');
    assert.ok(
      summaryStr.includes('(AW-BAT-01) x1') && summaryStr.includes('(AW-GLASS-01) x1'),
      'formatLinkedPartsSummary phải định dạng đúng chuẩn Tên linh kiện (SKU) xSố_lượng để Backend trừ kho'
    );

    const parsedItems = parsePartsSummaryToItems(summaryStr);
    assert.equal(parsedItems.length, 2);
    assert.equal(parsedItems[0].part_sku, 'AW-BAT-01');
    assert.equal(parsedItems[0].watch_size, '44mm');

    const inferred = inferLinkedPartsFromOrderText('Bật chống ồn ANC bị rè', 'AirPods Pro 2');
    assert.ok(inferred.matchedIssues.some((i) => i.issue_code === 'ISS-AP-002'));
    assert.ok(inferred.linkedParts.some((p) => p.part_sku === 'MESH-APP-02'));
    assert.ok(inferred.linkedParts.some((p) => p.part_sku === 'FLEX-CASE-01'));
  });

  test('4. partsUsageExcelExport.ts: Tổng hợp số lượng linh kiện tiêu hao theo mã SKU thật (Bảng tổng hợp + Bảng chi tiết theo đơn)', async () => {
    const { extractOrderPartsUsage, buildPartsUsageExcelWorkbook } =
      await loadPartsUsageExcelModule();

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
        parts_needed: 'Pin tai nghe AirPods Pro 2 (BAT-APP2-01) x2',
        partsUsed: 'Pin tai nghe AirPods Pro 2 (BAT-APP2-01) x2',
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
                part_sku: 'FLEX-CASE-01',
                part_name: 'Cáp flex hộp sạc AirPods Pro',
                quantity: 1,
                unit: 'Cái',
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
        device: 'AirPods Pro 2',
        issue: 'Pin chai, tụt pin nhanh dưới 1 tiếng',
        accessories: 'Tai L',
        parts_needed: 'Pin tai nghe AirPods Pro 2 (BAT-APP2-01) x1',
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
      usage1.linkedParts.some((p) => p.part_sku === 'FLEX-CASE-01'),
      'extractOrderPartsUsage phải gộp cả linked_parts từ additional_services'
    );

    const workbook = buildPartsUsageExcelWorkbook({
      orders: sampleOrders,
      periodLabel: 'Ngày 04/11/2026',
      branchLabel: 'Chi nhánh Quận 1',
    });

    assert.equal(workbook.orderCount, 3, 'Báo cáo phải ghi nhận đúng 3 đơn sửa chữa');
    assert.equal(workbook.detailRows.length, 3, 'Bảng 2 phải có 3 dòng chi tiết tương ứng 3 đơn');

    // Kiểm tra tổng số lượng của BAT-APP2-01: đơn 1 dùng 2 viên + đơn 2 cần 1 viên = 3 viên trên 2 đơn
    const pinSummary = workbook.summaryRows.find((r) => r.part_sku === 'BAT-APP2-01');
    assert.ok(pinSummary, 'Bảng tổng hợp phải có mã BAT-APP2-01');
    assert.equal(pinSummary.total_quantity, 3, 'Tổng số lượng BAT-APP2-01 phải là 3 (2 + 1)');
    assert.equal(pinSummary.order_count, 2, 'Số đơn phát sinh BAT-APP2-01 phải là 2');
    assert.deepEqual(pinSummary.order_codes, ['FX26-Q1-001', 'FX26-Q1-002']);

    // Kiểm tra đơn Apple Watch số 3 tự động suy diễn linh kiện AW-GLASS-01 kèm [Size 45mm]
    const watchGlassSummary = workbook.summaryRows.find((r) => r.part_sku === 'AW-GLASS-01');
    assert.ok(
      watchGlassSummary,
      'Bảng tổng hợp phải suy diễn được AW-GLASS-01 cho đơn Apple Watch'
    );
    assert.ok(
      watchGlassSummary.part_name.includes('[Size 45mm]'),
      'Tên linh kiện Apple Watch trong bảng tổng hợp phải kèm [Size 45mm]'
    );

    assert.ok(workbook.fileName.endsWith('.xls'), 'Tên file phải có đuôi .xls');
    assert.ok(workbook.content.startsWith('\uFEFF<html'), 'Nội dung phải có UTF-8 BOM cho Excel');
  });

  test('5. Kiểm tra vị trí nút Xuất file Linh kiện nằm đúng ở Kho & Mua hàng (/inventory) và đã gỡ khỏi Dashboard & Repairs', () => {
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
    const inventoryPageContent = fs.readFileSync(
      path.join(webRoot, 'app/inventory/page.tsx'),
      'utf-8'
    );
    const stockTabContent = fs.readFileSync(
      path.join(webRoot, 'app/inventory/components/StockTab.tsx'),
      'utf-8'
    );

    // 5.1 Nút Xuất file Linh kiện đã gỡ khỏi CSKH Dashboard và trang Đơn sửa chữa (/repairs)
    assert.ok(
      !cskhDashboardContent.includes('data-testid="cskh-export-parts-excel-btn"'),
      'CskhDashboardView không được đặt nút Xuất file Linh kiện (.xls) sai chỗ'
    );
    assert.ok(
      !repairsPageContent.includes('data-testid="repairs-export-parts-excel-btn"'),
      'Trang /repairs không được đặt nút Xuất file Linh kiện (.xls) sai chỗ'
    );

    // 5.2 Toàn bộ thông tin & nút xuất file Linh kiện tập trung tại Kho & Mua hàng (/inventory)
    assert.ok(
      inventoryPageContent.includes('data-testid="inventory-export-parts-hub"') &&
        inventoryPageContent.includes('data-testid="export-daily-inventory-btn"') &&
        inventoryPageContent.includes('data-testid="inventory-export-order-parts-btn"') &&
        inventoryPageContent.includes('data-testid="inventory-recent-repair-exports-list"'),
      'Trang Kho & Mua hàng (/inventory) phải có Trung tâm Xuất Linh Kiện & 2 nút Xuất Excel (.xls)'
    );
    assert.ok(
      stockTabContent.includes('data-testid="inventory-issue-parts-mapping-panel"') &&
        stockTabContent.includes('Định mức Lỗi Sửa Chữa ↔ Linh Kiện Kho (Tự động trừ khi tạo đơn)'),
      'StockTab trong Kho & Mua hàng phải hiển thị bảng Định mức Lỗi Sửa Chữa ↔ Linh Kiện Kho'
    );

    // 5.3 IntakeWizardModal & IntakeQuickConsole:
    // - Ẩn hoàn toàn khung giải thích kho trên form tạo đơn (không hiển thị intake-issue-object-preview / quick-intake-issue-object-preview / parts_needed input)
    // - Chỉ hiển thị gọn tên lỗi trên các chip chọn nhanh để note nhanh lỗi
    // - Vẫn giữ logic ngầm tổng hợp parts_needed khi Lưu đơn (handleSave) để Backend tự động trừ kho
    assert.ok(
      intakeWizardContent.includes('data-testid="intake-issue-filter-input"') &&
        !intakeWizardContent.includes('data-testid="intake-issue-object-preview"') &&
        !intakeWizardContent.includes('data-testid="intake-linked-parts-needed-input"') &&
        intakeWizardContent.includes('parts_needed: effectivePartsNeeded'),
      'IntakeWizardModal không hiển thị khung giải thích kho trên form tiếp nhận nhưng vẫn ngầm tính parts_needed khi Lưu đơn'
    );
    assert.ok(
      intakeQuickContent.includes('data-testid="quick-apple-watch-size-selector"') &&
        intakeQuickContent.includes('data-testid="quick-intake-issue-filter-input"') &&
        !intakeQuickContent.includes('data-testid="quick-intake-issue-object-preview"') &&
        !intakeQuickContent.includes('data-testid="quick-intake-linked-parts-needed-input"'),
      'IntakeQuickConsole chỉ note nhanh các lỗi trên giao diện tiếp nhận, không hiển thị khung giải thích kho'
    );

    // 5.4 TechOrderDetailModal & BomInspector
    assert.ok(
      techModalContent.includes('data-testid="tech-linked-parts-from-cskh"') &&
        techModalContent.includes('data-testid="tech-apply-linked-parts-btn"'),
      'TechOrderDetailModal phải hiển thị khối Linh kiện lỗi được link từ đơn CSKH và nút chèn nhanh'
    );
    assert.ok(
      bomInspectorContent.includes('data-testid="cskh-add-service-filter-input"') &&
        bomInspectorContent.includes('data-testid="badge-from-tech-need-quote"'),
      'BomInspector phải hiển thị ô lọc nhanh lỗi & badge TỪ KỸ THUẬT - CẦN BÁO GIÁ KHÁCH'
    );
  });

  test('6. Mặc định không chọn lỗi & Khi đổi sang mã sản phẩm/thiết bị khác thì xóa sạch lỗi cũ (không mang theo lỗi do index)', () => {
    const intakeWizardContent = fs.readFileSync(
      path.join(webRoot, 'app/components/IntakeWizardModal.tsx'),
      'utf-8'
    );
    const intakeQuickContent = fs.readFileSync(
      path.join(webRoot, 'app/components/IntakeQuickConsole.tsx'),
      'utf-8'
    );

    // 6.1 Kiểm tra hàm buildDeviceIssueSelectionKey tạo key duy nhất theo Danh mục + Mã sản phẩm + Tên lỗi
    const keyPro2 = buildDeviceIssueSelectionKey(
      'AirPods',
      'AirPods Pro 2',
      'Pin chai, tụt pin nhanh dưới 1 tiếng'
    );
    const keyGen3 = buildDeviceIssueSelectionKey(
      'AirPods',
      'AirPods 3',
      'Pin chai, tụt pin nhanh dưới 1 tiếng'
    );
    const keyWatch = buildDeviceIssueSelectionKey(
      'Apple Watch',
      'Apple Watch Series 9',
      'Pin phù, sụt nhanh hoặc đẩy bung màn hình'
    );
    assert.notEqual(
      keyPro2,
      keyGen3,
      'Cùng một tên lỗi nhưng khác mã sản phẩm (AirPods Pro 2 vs AirPods 3) phải có key hoàn toàn khác nhau'
    );
    assert.notEqual(keyPro2, keyWatch);

    // 6.2 Kiểm tra toggleIssueNameInDescription bật/tắt chính xác lỗi có dấu phẩy và trả về chuỗi rỗng khi bỏ chọn hết
    const step1 = toggleIssueNameInDescription(
      '',
      'Pin chai, tụt pin nhanh dưới 1 tiếng',
      'AirPods'
    );
    assert.equal(step1.isNowSelected, true);
    assert.equal(step1.nextText, 'Pin chai, tụt pin nhanh dưới 1 tiếng');

    const step2 = toggleIssueNameInDescription(
      step1.nextText,
      'Pin chai, tụt pin nhanh dưới 1 tiếng',
      'AirPods'
    );
    assert.equal(step2.isNowSelected, false);
    assert.equal(step2.nextText, '', 'Khi bỏ chọn lỗi duy nhất thì mô tả lỗi phải về rỗng hoàn toàn');

    // 6.3 Kiểm tra handleDeviceModelChangeForDevice và handleCategoryChangeForDevice reset sạch lỗi cũ
    assert.ok(
      intakeWizardContent.includes('handleDeviceModelChangeForDevice') &&
        intakeWizardContent.includes('buildDeviceIssueSelectionKey') &&
        intakeQuickContent.includes('buildDeviceIssueSelectionKey'),
      'IntakeWizardModal và IntakeQuickConsole phải định danh chip lỗi bằng buildDeviceIssueSelectionKey và có handleDeviceModelChangeForDevice để xóa lỗi cũ khi đổi mã sản phẩm'
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
