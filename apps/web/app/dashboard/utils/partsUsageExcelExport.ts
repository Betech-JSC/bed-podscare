import type { RepairOrder } from '@podscare/types';
import {
  inferLinkedPartsFromOrderText,
  parsePartsSummaryToItems,
  formatLinkedPartsSummary,
  extractWatchSizeFromText,
  applyWatchSizeToLinkedPart,
  type LinkedPartItem,
} from '../../constants/commonIssueCatalog';
import {
  formatOrderStatusForReport,
  formatIntakeDateForReport,
} from './revenueExcelExport';

export interface PartsUsageExcelExportOptions {
  orders: RepairOrder[];
  periodLabel?: string;
  branchLabel?: string;
  fileNamePrefix?: string;
  /**
   * Ẩn toàn bộ cột / ô Tổng doanh thu đơn (VNĐ) và Tổng tiền đơn (VNĐ) đối với nhân sự không phải Admin.
   * Mặc định: true (chỉ xuất số lượng linh kiện tiêu hao và thông tin kỹ thuật của đơn).
   */
  hideRevenue?: boolean;
}

export interface AggregatedPartUsageRow {
  part_sku: string;
  part_name: string;
  unit: string;
  total_quantity: number;
  order_count: number;
  order_codes: string[];
}

export interface OrderPartsDetailRow {
  order_code: string;
  created_date: string;
  customer_display: string;
  device_display: string;
  issue_display: string;
  linked_parts_display: string;
  used_parts_display: string;
  technician_name: string;
  status_label: string;
  consumed_parts: LinkedPartItem[];
}

export interface PartsUsageExcelWorkbookResult {
  content: string;
  fileName: string;
  totalPartQuantity: number;
  distinctSkuCount: number;
  orderCount: number;
  hideRevenue: boolean;
  summaryRows: AggregatedPartUsageRow[];
  detailRows: OrderPartsDetailRow[];
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Trích xuất linh kiện liên kết & linh kiện đã xuất thay thế từ 1 đơn sửa chữa
 */
export function extractOrderPartsUsage(order: RepairOrder): {
  linkedParts: LinkedPartItem[];
  usedParts: LinkedPartItem[];
  effectivePartsForSummary: LinkedPartItem[];
  linkedPartsText: string;
  usedPartsText: string;
} {
  const category =
    order.deviceCategory ||
    (order.device?.toLowerCase().includes('watch')
      ? 'Apple Watch'
      : order.device?.toLowerCase().includes('pencil')
      ? 'Apple Pencil'
      : 'AirPods');

  const detectedWatchSize =
    extractWatchSizeFromText(order.accessories) ||
    extractWatchSizeFromText(order.issue) ||
    extractWatchSizeFromText(order.parts_needed || order.partsNeeded);

  const linkedMap = new Map<string, LinkedPartItem>();

  // 1. Từ parts_needed
  const rawPartsNeeded = order.parts_needed || order.partsNeeded || '';
  if (rawPartsNeeded.trim()) {
    parsePartsSummaryToItems(rawPartsNeeded).forEach((pt) => {
      const sized = applyWatchSizeToLinkedPart(pt, detectedWatchSize, category);
      const key = `${sized.part_sku}__${sized.part_name}`;
      if (!linkedMap.has(key)) {
        linkedMap.set(key, sized);
      }
    });
  }

  // 2. Từ additional_services[].linked_parts
  const addServices = order.additional_services || order.additionalServices || [];
  addServices.forEach((srv) => {
    const srvParts =
      Array.isArray(srv.linked_parts) && srv.linked_parts.length > 0
        ? srv.linked_parts
        : inferLinkedPartsFromOrderText(srv.name, category, detectedWatchSize).linkedParts;
    srvParts.forEach((pt) => {
      const sized = applyWatchSizeToLinkedPart(pt, detectedWatchSize, category);
      const key = `${sized.part_sku}__${sized.part_name}`;
      if (!linkedMap.has(key)) {
        linkedMap.set(key, sized);
      }
    });
  });

  // 3. Nếu chưa có parts_needed, suy diễn từ commonIssueCatalog theo mô tả lỗi
  if (linkedMap.size === 0 && order.issue) {
    const inferred = inferLinkedPartsFromOrderText(order.issue, category, detectedWatchSize);
    inferred.linkedParts.forEach((pt) => {
      const key = `${pt.part_sku}__${pt.part_name}`;
      if (!linkedMap.has(key)) {
        linkedMap.set(key, pt);
      }
    });
  }

  const linkedParts = Array.from(linkedMap.values());

  // 4. Linh kiện đã thay thế thực tế (partsUsed / parts_used_summary)
  const rawPartsUsed =
    order.partsUsed || (order as any).parts_used_summary || '';
  const usedParts = rawPartsUsed.trim()
    ? parsePartsSummaryToItems(rawPartsUsed).map((pt) =>
        applyWatchSizeToLinkedPart(pt, detectedWatchSize, category)
      )
    : [];

  // Ưu tiên tính tiêu hao theo partsUsed nếu đã hoàn thành/có nhập partsUsed, ngược lại tính theo linkedParts
  const effectivePartsForSummary = usedParts.length > 0 ? usedParts : linkedParts;

  const linkedPartsText =
    rawPartsNeeded.trim() || formatLinkedPartsSummary(linkedParts, detectedWatchSize) || '—';
  const usedPartsText =
    rawPartsUsed.trim() ||
    (['Hoàn tất', 'Sẵn sàng trả', 'Chờ khách nhận', 'Chờ QC'].includes(order.status)
      ? formatLinkedPartsSummary(linkedParts, detectedWatchSize)
      : 'Chưa xuất thay');

  return {
    linkedParts,
    usedParts,
    effectivePartsForSummary,
    linkedPartsText,
    usedPartsText,
  };
}

export function buildPartsUsageExcelWorkbook(
  options: PartsUsageExcelExportOptions
): PartsUsageExcelWorkbookResult {
  const orders = Array.isArray(options.orders) ? options.orders : [];
  const periodLabel = options.periodLabel || 'Hôm nay';
  const branchLabel = options.branchLabel || 'Toàn hệ thống';
  const prefix = options.fileNamePrefix || 'bao-cao-linh-kien-tieu-hao-podscare';
  const hideRevenue = options.hideRevenue !== undefined ? Boolean(options.hideRevenue) : true;
  const dateSuffix = new Date().toISOString().slice(0, 10);
  const fileName = `${prefix}-${dateSuffix}.xls`;

  const skuSummaryMap = new Map<
    string,
    {
      part_sku: string;
      part_name: string;
      unit: string;
      total_quantity: number;
      order_codes_set: Set<string>;
    }
  >();

  const detailRows: OrderPartsDetailRow[] = orders.map((order) => {
    const orderCode = String(order.id || (order as any).order_code || '');
    const createdDate =
      formatIntakeDateForReport(order.createdAt || order.date) || order.date || 'Hôm nay';
    const customerDisplay = `${order.name || 'Khách lẻ'}${
      order.phone ? ` (${order.phone})` : ''
    }`;
    const watchSizeTag = extractWatchSizeFromText(order.accessories || order.issue);
    const deviceDisplay = `${order.device || 'Thiết bị'}${
      watchSizeTag && !order.device?.includes(watchSizeTag) ? ` [Size ${watchSizeTag}]` : ''
    }`;

    const addServices = order.additional_services || order.additionalServices || [];
    const addServiceNames = addServices.map((s) => s.name).filter(Boolean);
    const issueDisplay =
      addServiceNames.length > 0
        ? `${order.issue} (+ Phát sinh: ${addServiceNames.join(', ')})`
        : order.issue || 'Kiểm tra';

    const extracted = extractOrderPartsUsage(order);

    extracted.effectivePartsForSummary.forEach((pt) => {
      const key = `${pt.part_sku}__${pt.part_name}`;
      const qty = Math.max(1, Number(pt.quantity) || 1);
      const existing = skuSummaryMap.get(key);
      if (existing) {
        existing.total_quantity += qty;
        if (orderCode) existing.order_codes_set.add(orderCode);
      } else {
        skuSummaryMap.set(key, {
          part_sku: pt.part_sku,
          part_name: pt.part_name,
          unit: pt.unit || 'Cái',
          total_quantity: qty,
          order_codes_set: new Set(orderCode ? [orderCode] : []),
        });
      }
    });

    return {
      order_code: orderCode,
      created_date: createdDate,
      customer_display: customerDisplay,
      device_display: deviceDisplay,
      issue_display: issueDisplay,
      linked_parts_display: extracted.linkedPartsText,
      used_parts_display: extracted.usedPartsText,
      technician_name: order.tech || 'Chưa phân công',
      status_label: formatOrderStatusForReport(order.status),
      consumed_parts: extracted.effectivePartsForSummary,
    };
  });

  const summaryRows: AggregatedPartUsageRow[] = Array.from(skuSummaryMap.values())
    .map((item) => ({
      part_sku: item.part_sku,
      part_name: item.part_name,
      unit: item.unit,
      total_quantity: item.total_quantity,
      order_count: item.order_codes_set.size,
      order_codes: Array.from(item.order_codes_set),
    }))
    .sort((a, b) => b.total_quantity - a.total_quantity);

  const totalPartQuantity = summaryRows.reduce((sum, r) => sum + r.total_quantity, 0);

  const summaryRowsHtml =
    summaryRows.length > 0
      ? summaryRows
          .map(
            (row, idx) => `
        <tr>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px;">${idx + 1}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px; font-family:monospace; font-weight:bold; color:#176b51;">${escapeHtml(row.part_sku)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px; font-weight:600;">${escapeHtml(row.part_name)}</td>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px;">${escapeHtml(row.unit)}</td>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px; font-weight:bold; color:#176b51;" data-value="${row.total_quantity}">${row.total_quantity}</td>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px;" data-value="${row.order_count}">${row.order_count}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px; font-family:monospace;">${escapeHtml(row.order_codes.join(', '))}</td>
        </tr>`
          )
          .join('')
      : `
        <tr>
          <td colspan="7" style="text-align:center; border:1px solid #d8e2dc; padding:12px; color:#81908a;">
            Chưa có dữ liệu linh kiện tiêu hao trong danh sách đơn hiện tại
          </td>
        </tr>`;

  const detailRowsHtml =
    detailRows.length > 0
      ? detailRows
          .map(
            (row, idx) => `
        <tr>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px;">${idx + 1}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px; font-family:monospace; font-weight:bold; color:#176b51;">${escapeHtml(row.order_code)}</td>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px;">${escapeHtml(row.created_date)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px;">${escapeHtml(row.customer_display)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px; font-weight:600;">${escapeHtml(row.device_display)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px;">${escapeHtml(row.issue_display)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px; color:#176b51; font-weight:600;">${escapeHtml(row.linked_parts_display)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px;">${escapeHtml(row.used_parts_display)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px;">${escapeHtml(row.technician_name)}</td>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px;">${escapeHtml(row.status_label)}</td>
        </tr>`
          )
          .join('')
      : `
        <tr>
          <td colspan="10" style="text-align:center; border:1px solid #d8e2dc; padding:12px; color:#81908a;">
            Không có đơn hàng nào trong danh sách lọc
          </td>
        </tr>`;

  const htmlContent = `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta charset="UTF-8" />
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>ThongKeLinhKien</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
</head>
<body style="font-family: 'DM Sans', Arial, sans-serif; font-size: 11pt; color: #17231f;">
  <!-- BẢNG 1: TỔNG HỢP SỐ LƯỢNG LINH KIỆN TIÊU HAO -->
  <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse; width:100%; margin-bottom:24px;">
    <thead>
      <tr>
        <th colspan="7" style="background-color:#176b51; color:#ffffff; font-size:13pt; font-weight:bold; text-align:center; padding:10px; border:1px solid #176b51;">
          BẢNG 1 — TỔNG HỢP SỐ LƯỢNG LINH KIỆN TIÊU HAO (${escapeHtml(periodLabel)}) — CHI NHÁNH: ${escapeHtml(branchLabel)}
        </th>
      </tr>
      <tr style="background-color:#e9f4ef; color:#176b51; font-weight:bold;">
        <th style="width:50px; text-align:center; border:1px solid #cde4d8; padding:8px;">STT</th>
        <th style="width:140px; text-align:left; border:1px solid #cde4d8; padding:8px;">Mã SKU</th>
        <th style="width:280px; text-align:left; border:1px solid #cde4d8; padding:8px;">Tên linh kiện</th>
        <th style="width:80px; text-align:center; border:1px solid #cde4d8; padding:8px;">Đơn vị</th>
        <th style="width:140px; text-align:center; border:1px solid #cde4d8; padding:8px;">Số lượng tốn (tiêu hao)</th>
        <th style="width:120px; text-align:center; border:1px solid #cde4d8; padding:8px;">Số đơn phát sinh</th>
        <th style="width:260px; text-align:left; border:1px solid #cde4d8; padding:8px;">Mã các đơn hàng</th>
      </tr>
    </thead>
    <tbody>
      ${summaryRowsHtml}
    </tbody>
    <tfoot>
      <tr style="background-color:#faf1df; font-weight:bold; color:#17231f;">
        <td colspan="4" style="text-align:right; border:1px solid #f2deba; padding:8px 10px; font-weight:bold;">TỔNG CỘNG LINH KIỆN TIÊU HAO</td>
        <td style="text-align:center; border:1px solid #f2deba; padding:8px 10px; font-weight:bold; color:#176b51;" data-value="${totalPartQuantity}">${totalPartQuantity}</td>
        <td style="text-align:center; border:1px solid #f2deba; padding:8px 10px; font-weight:bold;">${orders.length} đơn</td>
        <td style="text-align:left; border:1px solid #f2deba; padding:8px 10px;">${summaryRows.length} mã linh kiện (SKU)</td>
      </tr>
    </tfoot>
  </table>

  <br />

  <!-- BẢNG 2: CHI TIẾT LINH KIỆN THEO TỪNG ĐƠN SỬA CHỮA -->
  <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse; width:100%;">
    <thead>
      <tr>
        <th colspan="10" style="background-color:#176b51; color:#ffffff; font-size:13pt; font-weight:bold; text-align:center; padding:10px; border:1px solid #176b51;">
          BẢNG 2 — CHI TIẾT LINH KIỆN THEO TỪNG ĐƠN SỬA CHỮA (${orders.length} ĐƠN)
        </th>
      </tr>
      <tr style="background-color:#e9f4ef; color:#176b51; font-weight:bold;">
        <th style="width:50px; text-align:center; border:1px solid #cde4d8; padding:8px;">STT</th>
        <th style="width:110px; text-align:left; border:1px solid #cde4d8; padding:8px;">Mã đơn</th>
        <th style="width:95px; text-align:center; border:1px solid #cde4d8; padding:8px;">Ngày tạo</th>
        <th style="width:180px; text-align:left; border:1px solid #cde4d8; padding:8px;">Khách hàng</th>
        <th style="width:160px; text-align:left; border:1px solid #cde4d8; padding:8px;">Thiết bị</th>
        <th style="width:240px; text-align:left; border:1px solid #cde4d8; padding:8px;">Lỗi khách báo / phát sinh</th>
        <th style="width:260px; text-align:left; border:1px solid #cde4d8; padding:8px;">Linh kiện liên kết (CSKH/KTV)</th>
        <th style="width:240px; text-align:left; border:1px solid #cde4d8; padding:8px;">Linh kiện đã xuất thay thế</th>
        <th style="width:140px; text-align:left; border:1px solid #cde4d8; padding:8px;">Kỹ thuật viên</th>
        <th style="width:120px; text-align:center; border:1px solid #cde4d8; padding:8px;">Trạng thái</th>
      </tr>
    </thead>
    <tbody>
      ${detailRowsHtml}
    </tbody>
  </table>
</body>
</html>`;

  return {
    content: htmlContent,
    fileName,
    totalPartQuantity,
    distinctSkuCount: summaryRows.length,
    orderCount: orders.length,
    hideRevenue,
    summaryRows,
    detailRows,
  };
}

export function exportPartsUsageExcel(
  options: PartsUsageExcelExportOptions
): PartsUsageExcelWorkbookResult {
  const result = buildPartsUsageExcelWorkbook(options);

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([result.content], {
      type: 'application/vnd.ms-excel;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', result.fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  return result;
}

export const downloadPartsUsageExcelReport = exportPartsUsageExcel;
