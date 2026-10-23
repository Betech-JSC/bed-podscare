import type { RevenueOrderBreakdownItem } from '@podscare/types';

export interface RevenueExcelExportOptions {
  items: RevenueOrderBreakdownItem[];
  periodLabel: string;
  fromDate?: string;
  toDate?: string;
  branchName?: string;
  fileNamePrefix?: string;
}

export interface RevenueExcelWorkbookResult {
  content: string;
  fileName: string;
  totalAmount: number;
  rowCount: number;
}

const STATUS_LABELS: Record<string, string> = {
  received: 'Tiếp nhận mới',
  inspecting: 'Đang kiểm tra',
  waiting_approval: 'Chờ khách duyệt',
  quote_pending: 'Chờ khách duyệt',
  waiting_tech: 'Chờ kỹ thuật',
  assigned: 'Đã nhận đơn',
  in_repair: 'Đang sửa chữa',
  waiting_parts: 'Chờ linh kiện',
  rework_needed: 'Cần sửa lại',
  waiting_qc: 'Chờ QC',
  qc_pending: 'Chờ QC',
  qc_inspecting: 'Chờ QC',
  ready_for_return: 'Sẵn sàng trả',
  waiting_pickup: 'Chờ khách lấy',
  completed: 'Đã giao máy',
  cancelled: 'Đã hủy',
  rejected: 'Từ chối sửa',
};

export function formatOrderStatusForReport(status?: string | null): string {
  if (!status) return 'Tiếp nhận mới';
  const clean = status.trim();
  return STATUS_LABELS[clean] || clean;
}

export function formatIntakeDateForReport(isoOrDate?: string | null): string {
  if (!isoOrDate) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) {
    const [y, m, d] = isoOrDate.split('-');
    return `${d}/${m}/${y}`;
  }
  try {
    const parsed = new Date(isoOrDate);
    if (Number.isNaN(parsed.getTime())) return String(isoOrDate);
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(parsed);
  } catch {
    return String(isoOrDate);
  }
}

export function formatVndNumber(amount?: number | string | null): string {
  const num = Math.round(Number(amount || 0));
  if (!Number.isFinite(num)) return '0 ₫';
  return `${num.toLocaleString('vi-VN')} ₫`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildRevenueExcelWorkbook(
  options: RevenueExcelExportOptions
): RevenueExcelWorkbookResult {
  const items = Array.isArray(options.items) ? options.items : [];
  const totalAmount = items.reduce(
    (sum, item) => sum + Math.round(Number(item.total_price || 0)),
    0
  );

  const fromDateClean = (options.fromDate || '').trim();
  const toDateClean = (options.toDate || '').trim();
  const prefix = options.fileNamePrefix || 'bao-cao-doanh-thu-podscare';
  const dateSuffix =
    fromDateClean && toDateClean
      ? fromDateClean === toDateClean
        ? fromDateClean
        : `${fromDateClean}_den_${toDateClean}`
      : new Date().toISOString().slice(0, 10);

  const fileName = `${prefix}-${dateSuffix}.xls`;

  const rowsHtml = items
    .map((item, idx) => {
      const stt = idx + 1;
      const customerName = item.customer_name || 'Khách lẻ';
      const orderCode = String(item.order_code || item.id || '');
      const deviceName = item.device_name || 'Thiết bị';
      const statusLabel = formatOrderStatusForReport(item.status);
      const intakeDate = formatIntakeDateForReport(item.created_at || item.completed_at);
      const machineCodeDisplay = `${orderCode} - ${deviceName}${
        intakeDate ? ` (${intakeDate} · ${statusLabel})` : ` (${statusLabel})`
      }`;
      const priceVal = Math.round(Number(item.total_price || 0));

      return `
        <tr>
          <td style="text-align:center; border:1px solid #d8e2dc; padding:6px 10px;">${stt}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px;">${escapeHtml(customerName)}</td>
          <td style="text-align:left; border:1px solid #d8e2dc; padding:6px 10px;">${escapeHtml(machineCodeDisplay)}</td>
          <td style="text-align:right; border:1px solid #d8e2dc; padding:6px 10px; mso-number-format:'\\#\\,\\#\\#0'; font-weight:600;" data-value="${priceVal}">${escapeHtml(formatVndNumber(priceVal))}</td>
        </tr>`;
    })
    .join('');

  const emptyRowHtml =
    items.length === 0
      ? `
        <tr>
          <td colspan="4" style="text-align:center; border:1px solid #d8e2dc; padding:12px; color:#81908a;">
            Không có đơn hàng phát sinh trong kỳ (${escapeHtml(options.periodLabel)})
          </td>
        </tr>`
      : '';

  const branchInfo = options.branchName ? ` — Chi nhánh: ${options.branchName}` : '';

  const htmlContent = `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta charset="UTF-8" />
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>BaoCaoDoanhThu</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
</head>
<body style="font-family: 'DM Sans', Arial, sans-serif; font-size: 12pt; color: #17231f;">
  <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse; width:100%;">
    <thead>
      <tr>
        <th colspan="4" style="background-color:#176b51; color:#ffffff; font-size:14pt; font-weight:bold; text-align:center; padding:10px; border:1px solid #176b51;">
          BÁO CÁO DOANH THU ĐƠN HÀNG (${escapeHtml(options.periodLabel)})${escapeHtml(branchInfo)}
        </th>
      </tr>
      <tr style="background-color:#e9f4ef; color:#176b51; font-weight:bold;">
        <th style="width:60px; text-align:center; border:1px solid #cde4d8; padding:8px;">STT</th>
        <th style="width:220px; text-align:left; border:1px solid #cde4d8; padding:8px;">Họ tên</th>
        <th style="width:360px; text-align:left; border:1px solid #cde4d8; padding:8px;">Mã máy</th>
        <th style="width:160px; text-align:right; border:1px solid #cde4d8; padding:8px;">Tiền</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || emptyRowHtml}
    </tbody>
    <tfoot>
      <tr style="background-color:#faf1df; font-weight:bold; color:#17231f;">
        <td colspan="3" style="text-align:right; border:1px solid #f2deba; padding:8px 10px; font-weight:bold;">TỔNG TIỀN</td>
        <td style="text-align:right; border:1px solid #f2deba; padding:8px 10px; font-weight:bold; color:#176b51; mso-number-format:'\\#\\,\\#\\#0';" data-value="${totalAmount}">${escapeHtml(formatVndNumber(totalAmount))}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;

  return {
    content: htmlContent,
    fileName,
    totalAmount,
    rowCount: items.length,
  };
}

export function downloadRevenueExcelReport(
  options: RevenueExcelExportOptions
): RevenueExcelWorkbookResult {
  const result = buildRevenueExcelWorkbook(options);

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
