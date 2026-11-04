import type { InventoryTransactionItem } from '@podscare/api-client';

export interface DailyExportedPartsExcelOptions {
  transactions: InventoryTransactionItem[];
  selectedDate: string;
  branchLabel?: string;
  fileNamePrefix?: string;
}

export interface DailyExportedPartSummaryRow {
  part_id: number | string;
  part_sku: string;
  part_name: string;
  product_line: string;
  unit: string;
  exported_quantity: number;
  returned_quantity: number;
  net_exported_quantity: number;
  order_codes: string[];
}

export interface DailyExportedPartDetailRow {
  id: number | string;
  created_time: string;
  part_sku: string;
  part_name: string;
  product_line: string;
  unit: string;
  transaction_type: string;
  transaction_label: string;
  quantity: number;
  signed_quantity_label: string;
  order_code: string;
  branch_name: string;
  staff_name: string;
  notes: string;
}

export interface DailyExportedPartsWorkbookResult {
  content: string;
  fileName: string;
  selectedDate: string;
  totalExportedQuantity: number;
  totalReturnedQuantity: number;
  totalNetExportedQuantity: number;
  distinctSkuCount: number;
  summaryRows: DailyExportedPartSummaryRow[];
  detailRows: DailyExportedPartDetailRow[];
}

const EXPORT_TYPES = new Set(['export_repair', 'export_damage']);
const RETURN_TYPES = new Set(['import_reversal', 'import_return']);

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getTodayDateStringInGmt7(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatSelectedDateVi(dateStr?: string): string {
  if (!dateStr) return 'Hôm nay';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }
  return dateStr;
}

function resolveTransactionProductLine(tx: any): {
  category: string;
  modelName: string;
  display: string;
} {
  const part = tx?.part || {};
  const repairOrder = tx?.repair_order || tx?.repairOrder || {};
  const deviceModel = repairOrder?.device_model || repairOrder?.deviceModel || {};

  const rawCategory =
    part?.category ||
    deviceModel?.category ||
    repairOrder?.device_category ||
    repairOrder?.device_type ||
    '';

  const modelName =
    deviceModel?.name ||
    repairOrder?.device_name ||
    repairOrder?.device ||
    (Array.isArray(part?.compatible_models)
      ? part.compatible_models.filter(Boolean).join(', ')
      : typeof part?.compatible_models === 'string'
      ? part.compatible_models.trim()
      : '');

  let category = String(rawCategory || '').trim();
  if (!category && modelName) {
    const lower = modelName.toLowerCase();
    if (lower.includes('watch')) category = 'Apple Watch';
    else if (lower.includes('pencil')) category = 'Apple Pencil';
    else if (lower.includes('airpods') || lower.includes('pods')) category = 'AirPods';
  }
  if (!category) {
    category = 'AirPods / Linh kiện chung';
  }

  const cleanModel = String(modelName || '').trim();
  const display =
    cleanModel && cleanModel.toLowerCase() !== category.toLowerCase()
      ? `${category} (${cleanModel})`
      : category;

  return { category, modelName: cleanModel, display };
}

function resolveTransactionTypeLabel(type: string): string {
  switch (type) {
    case 'export_repair':
      return 'Xuất sửa chữa';
    case 'export_damage':
      return 'Xuất hỏng / hao hụt';
    case 'import_reversal':
      return 'Hoàn trả kho (Hoàn đơn)';
    case 'import_return':
      return 'Nhập hoàn trả';
    default:
      return type;
  }
}

export function buildDailyExportedPartsWorkbook(
  options: DailyExportedPartsExcelOptions
): DailyExportedPartsWorkbookResult {
  const rawTransactions = Array.isArray(options.transactions) ? options.transactions : [];
  const selectedDate = (options.selectedDate || getTodayDateStringInGmt7()).trim();
  const branchLabel = options.branchLabel || 'Toàn bộ chi nhánh';
  const prefix = options.fileNamePrefix || 'Bao_Cao_Xuat_Kho_Linh_Kien';
  const fileName = `${prefix}_${selectedDate}.xls`;

  // Lọc các giao dịch thuộc nhóm xuất kho và hoàn trả kho
  const targetTransactions = rawTransactions.filter((tx: any) => {
    const type = String(tx?.transaction_type || '');
    if (!EXPORT_TYPES.has(type) && !RETURN_TYPES.has(type)) {
      return false;
    }
    return true;
  });

  const summaryMap = new Map<
    string,
    {
      part_id: number | string;
      part_sku: string;
      part_name: string;
      categories: Set<string>;
      models: Set<string>;
      unit: string;
      exported_quantity: number;
      returned_quantity: number;
      order_codes: Set<string>;
    }
  >();

  const detailRows: DailyExportedPartDetailRow[] = targetTransactions.map((tx: any, idx: number) => {
    const type = String(tx?.transaction_type || '');
    const isExport = EXPORT_TYPES.has(type);
    const qty = Math.abs(Number(tx?.quantity) || 0);
    const partId = tx?.part_id ?? tx?.part?.id ?? `part_${idx + 1}`;
    const partSku = String(tx?.part?.sku || `SKU-${partId}`).trim();
    const partName = String(tx?.part?.name || `Linh kiện #${partId}`).trim();
    const unit = String((tx?.part as any)?.unit || 'Cái').trim() || 'Cái';
    const repairOrder = tx?.repair_order || tx?.repairOrder || {};
    const orderCode = String(repairOrder?.order_code || '').trim();
    const productLineInfo = resolveTransactionProductLine(tx);

    const key = `${partSku}__${partName}`;
    const existing = summaryMap.get(key);
    if (existing) {
      if (isExport) {
        existing.exported_quantity += qty;
      } else {
        existing.returned_quantity += qty;
      }
      if (productLineInfo.category) existing.categories.add(productLineInfo.category);
      if (productLineInfo.modelName) existing.models.add(productLineInfo.modelName);
      if (orderCode) existing.order_codes.add(orderCode);
    } else {
      summaryMap.set(key, {
        part_id: partId,
        part_sku: partSku,
        part_name: partName,
        categories: new Set(productLineInfo.category ? [productLineInfo.category] : []),
        models: new Set(productLineInfo.modelName ? [productLineInfo.modelName] : []),
        unit,
        exported_quantity: isExport ? qty : 0,
        returned_quantity: isExport ? 0 : qty,
        order_codes: new Set(orderCode ? [orderCode] : []),
      });
    }

    const createdTime = tx?.created_at
      ? new Date(tx.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
      : formatSelectedDateVi(selectedDate);

    return {
      id: tx?.id ?? idx + 1,
      created_time: createdTime,
      part_sku: partSku,
      part_name: partName,
      product_line: productLineInfo.display,
      unit,
      transaction_type: type,
      transaction_label: resolveTransactionTypeLabel(type),
      quantity: qty,
      signed_quantity_label: isExport ? `-${qty}` : `+${qty}`,
      order_code: orderCode || '—',
      branch_name: tx?.branch?.name || branchLabel,
      staff_name: tx?.created_by_user?.name || (tx as any)?.createdByUser?.name || 'Hệ thống',
      notes: String(tx?.notes || '').trim() || '—',
    };
  });

  const summaryRows: DailyExportedPartSummaryRow[] = Array.from(summaryMap.values())
    .map((item) => {
      const categoryStr = Array.from(item.categories).join(', ') || 'AirPods';
      const modelsArr = Array.from(item.models).filter(
        (m) => m.toLowerCase() !== categoryStr.toLowerCase()
      );
      const productLine =
        modelsArr.length > 0 ? `${categoryStr} (${modelsArr.join(', ')})` : categoryStr;
      const netQty = item.exported_quantity - item.returned_quantity;

      return {
        part_id: item.part_id,
        part_sku: item.part_sku,
        part_name: item.part_name,
        product_line: productLine,
        unit: item.unit,
        exported_quantity: item.exported_quantity,
        returned_quantity: item.returned_quantity,
        net_exported_quantity: netQty,
        order_codes: Array.from(item.order_codes),
      };
    })
    .sort((a, b) => b.exported_quantity - a.exported_quantity);

  const totalExportedQuantity = summaryRows.reduce((sum, r) => sum + r.exported_quantity, 0);
  const totalReturnedQuantity = summaryRows.reduce((sum, r) => sum + r.returned_quantity, 0);
  const totalNetExportedQuantity = summaryRows.reduce((sum, r) => sum + r.net_exported_quantity, 0);

  const summaryRowsHtml =
    summaryRows.length > 0
      ? summaryRows
          .map(
            (row, idx) => `
        <tr>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px;">${idx + 1}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px; font-family:monospace; font-weight:bold; color:#176b51;">${escapeHtml(row.part_sku)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px; font-weight:600;">${escapeHtml(row.part_name)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px; color:#1c302b;">${escapeHtml(row.product_line)}</td>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px;">${escapeHtml(row.unit)}</td>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px; font-weight:bold; color:#bc5b52;" data-value="${row.exported_quantity}">${row.exported_quantity}</td>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px; font-weight:bold; color:#28805e;" data-value="${row.returned_quantity}">${row.returned_quantity}</td>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px; font-weight:bold; color:#176b51;" data-value="${row.net_exported_quantity}">${row.net_exported_quantity}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px; font-family:monospace;">${escapeHtml(row.order_codes.length > 0 ? row.order_codes.join(', ') : 'Xuất lẻ')}</td>
        </tr>`
          )
          .join('')
      : `
        <tr>
          <td colspan="9" style="text-align:center; border:1px solid #d8e2dc; padding:12px; color:#81908a;">
            Không có giao dịch xuất kho hoặc hoàn trả nguyên liệu nào trong ngày ${escapeHtml(formatSelectedDateVi(selectedDate))}
          </td>
        </tr>`;

  const detailRowsHtml =
    detailRows.length > 0
      ? detailRows
          .map(
            (row, idx) => `
        <tr>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px;">${idx + 1}</td>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px;">${escapeHtml(row.created_time)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px; font-family:monospace; font-weight:bold; color:#176b51;">${escapeHtml(row.part_sku)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px; font-weight:600;">${escapeHtml(row.part_name)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px;">${escapeHtml(row.product_line)}</td>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px;">${escapeHtml(row.transaction_label)}</td>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px; font-weight:bold; color:${EXPORT_TYPES.has(row.transaction_type) ? '#bc5b52' : '#28805e'};" data-value="${row.quantity}">${escapeHtml(row.signed_quantity_label)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px; font-family:monospace; font-weight:bold;">${escapeHtml(row.order_code)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px;">${escapeHtml(row.branch_name)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px;">${escapeHtml(row.staff_name)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px;">${escapeHtml(row.notes)}</td>
        </tr>`
          )
          .join('')
      : `
        <tr>
          <td colspan="11" style="text-align:center; border:1px solid #d8e2dc; padding:12px; color:#81908a;">
            Chưa có lượt xuất/hoàn kho chi tiết nào trong ngày ${escapeHtml(formatSelectedDateVi(selectedDate))}
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
          <x:Name>XuatKhoNgay_${escapeHtml(selectedDate)}</x:Name>
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
  <!-- BẢNG 1: TỔNG HỢP NGUYÊN LIỆU / LINH KIỆN XUẤT KHO TRONG NGÀY -->
  <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse; width:100%; margin-bottom:24px;">
    <thead>
      <tr>
        <th colspan="9" style="background-color:#176b51; color:#ffffff; font-size:13pt; font-weight:bold; text-align:center; padding:10px; border:1px solid #176b51;">
          BÁO CÁO NGUYÊN LIỆU &amp; LINH KIỆN XUẤT KHO NGÀY ${escapeHtml(formatSelectedDateVi(selectedDate))} — CHI NHÁNH: ${escapeHtml(branchLabel)}
        </th>
      </tr>
      <tr style="background-color:#e9f4ef; color:#176b51; font-weight:bold;">
        <th style="width:50px; text-align:center; border:1px solid #cde4d8; padding:8px;">STT</th>
        <th style="width:140px; text-align:left; border:1px solid #cde4d8; padding:8px;">Mã SKU</th>
        <th style="width:260px; text-align:left; border:1px solid #cde4d8; padding:8px;">Tên nguyên liệu / linh kiện</th>
        <th style="width:220px; text-align:left; border:1px solid #cde4d8; padding:8px;">Thuộc dòng sản phẩm nào</th>
        <th style="width:80px; text-align:center; border:1px solid #cde4d8; padding:8px;">Đơn vị</th>
        <th style="width:130px; text-align:center; border:1px solid #cde4d8; padding:8px;">Số lượng xuất kho</th>
        <th style="width:130px; text-align:center; border:1px solid #cde4d8; padding:8px;">Số lượng hoàn trả</th>
        <th style="width:130px; text-align:center; border:1px solid #cde4d8; padding:8px;">Thực xuất ròng</th>
        <th style="width:240px; text-align:left; border:1px solid #cde4d8; padding:8px;">Mã đơn sửa chữa liên quan</th>
      </tr>
    </thead>
    <tbody>
      ${summaryRowsHtml}
    </tbody>
    <tfoot>
      <tr style="background-color:#faf1df; font-weight:bold; color:#17231f;">
        <td colspan="5" style="text-align:right; border:1px solid #f2deba; padding:8px 10px; font-weight:bold;">TỔNG CỘNG TRONG NGÀY (${escapeHtml(formatSelectedDateVi(selectedDate))})</td>
        <td style="text-align:center; border:1px solid #f2deba; padding:8px 10px; font-weight:bold; color:#bc5b52;" data-value="${totalExportedQuantity}">${totalExportedQuantity}</td>
        <td style="text-align:center; border:1px solid #f2deba; padding:8px 10px; font-weight:bold; color:#28805e;" data-value="${totalReturnedQuantity}">${totalReturnedQuantity}</td>
        <td style="text-align:center; border:1px solid #f2deba; padding:8px 10px; font-weight:bold; color:#176b51;" data-value="${totalNetExportedQuantity}">${totalNetExportedQuantity}</td>
        <td style="text-align:left; border:1px solid #f2deba; padding:8px 10px;">${summaryRows.length} mã nguyên liệu (SKU)</td>
      </tr>
    </tfoot>
  </table>

  <br />

  <!-- BẢNG 2: CHI TIẾT TỪNG LƯỢT XUẤT / HOÀN KHO TRONG NGÀY -->
  <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse; width:100%;">
    <thead>
      <tr>
        <th colspan="11" style="background-color:#176b51; color:#ffffff; font-size:13pt; font-weight:bold; text-align:center; padding:10px; border:1px solid #176b51;">
          BẢNG 2 — CHI TIẾT CÁC LƯỢT XUẤT &amp; HOÀN KHO TRONG NGÀY (${detailRows.length} GIAO DỊCH)
        </th>
      </tr>
      <tr style="background-color:#e9f4ef; color:#176b51; font-weight:bold;">
        <th style="width:50px; text-align:center; border:1px solid #cde4d8; padding:8px;">STT</th>
        <th style="width:140px; text-align:center; border:1px solid #cde4d8; padding:8px;">Thời gian</th>
        <th style="width:130px; text-align:left; border:1px solid #cde4d8; padding:8px;">Mã SKU</th>
        <th style="width:240px; text-align:left; border:1px solid #cde4d8; padding:8px;">Tên nguyên liệu / linh kiện</th>
        <th style="width:200px; text-align:left; border:1px solid #cde4d8; padding:8px;">Thuộc dòng sản phẩm</th>
        <th style="width:150px; text-align:center; border:1px solid #cde4d8; padding:8px;">Loại giao dịch</th>
        <th style="width:110px; text-align:center; border:1px solid #cde4d8; padding:8px;">SL biến động</th>
        <th style="width:120px; text-align:left; border:1px solid #cde4d8; padding:8px;">Mã đơn sửa chữa</th>
        <th style="width:150px; text-align:left; border:1px solid #cde4d8; padding:8px;">Kho chi nhánh</th>
        <th style="width:140px; text-align:left; border:1px solid #cde4d8; padding:8px;">Nhân sự thực hiện</th>
        <th style="width:220px; text-align:left; border:1px solid #cde4d8; padding:8px;">Ghi chú</th>
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
    selectedDate,
    totalExportedQuantity,
    totalReturnedQuantity,
    totalNetExportedQuantity,
    distinctSkuCount: summaryRows.length,
    summaryRows,
    detailRows,
  };
}

export function exportDailyExportedPartsExcel(
  options: DailyExportedPartsExcelOptions
): DailyExportedPartsWorkbookResult {
  const result = buildDailyExportedPartsWorkbook(options);

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
