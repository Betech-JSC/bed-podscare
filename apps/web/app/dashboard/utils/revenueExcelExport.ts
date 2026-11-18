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

const ORDER_TYPE_LABELS: Record<string, string> = {
  in_store: 'Tại quầy',
  cod: 'Đơn COD',
  warranty: 'Bảo hành',
};

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  retail: 'Khách lẻ',
  dealer: 'Đại lý',
  vip: 'Khách VIP',
};

export function formatOrderStatusForReport(status?: string | null): string {
  if (!status) return 'Tiếp nhận mới';
  const clean = status.trim();
  return STATUS_LABELS[clean] || clean;
}

export function formatOrderTypeForReport(orderType?: string | null): string {
  if (!orderType || !orderType.trim()) return '—';
  const clean = orderType.trim();
  return ORDER_TYPE_LABELS[clean] || clean;
}

export function formatCustomerTypeForReport(customerType?: string | null): string {
  if (!customerType || !customerType.trim()) return '—';
  const clean = customerType.trim();
  return CUSTOMER_TYPE_LABELS[clean] || clean;
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

function displayOrDash(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const text = String(value).trim();
  return text.length > 0 ? text : '—';
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAdditionalServicesNames(
  services?: RevenueOrderBreakdownItem['additional_services']
): string {
  if (!Array.isArray(services) || services.length === 0) return '—';
  const names = services
    .map((service) => (service && typeof service.name === 'string' ? service.name.trim() : ''))
    .filter((name) => name.length > 0);
  return names.length > 0 ? names.join(', ') : '—';
}

function formatRepairAndPartsNotes(item: RevenueOrderBreakdownItem): string {
  const segments: string[] = [];
  const repairNote = typeof item.repair_note === 'string' ? item.repair_note.trim() : '';
  const partsUsed =
    typeof item.parts_used_summary === 'string' ? item.parts_used_summary.trim() : '';
  const partsNeeded = typeof item.parts_needed === 'string' ? item.parts_needed.trim() : '';

  if (repairNote) {
    segments.push(`Ghi chú KTV: ${repairNote}`);
  }
  if (partsUsed) {
    segments.push(`Linh kiện đã dùng: ${partsUsed}`);
  }
  if (partsNeeded) {
    segments.push(`Linh kiện cần: ${partsNeeded}`);
  }
  return segments.length > 0 ? segments.join(' | ') : '—';
}

const REPORT_COLUMNS: Array<{ label: string; width: string; align: 'center' | 'left' }> = [
  { label: 'STT', width: '52px', align: 'center' },
  { label: 'Mã đơn', width: '130px', align: 'left' },
  { label: 'Mã đợt gộp', width: '120px', align: 'left' },
  { label: 'Hình thức', width: '100px', align: 'center' },
  { label: 'Ngày tiếp nhận', width: '120px', align: 'center' },
  { label: 'Ngày bàn giao', width: '120px', align: 'center' },
  { label: 'Họ tên khách', width: '180px', align: 'left' },
  { label: 'Số điện thoại', width: '125px', align: 'left' },
  { label: 'Email', width: '190px', align: 'left' },
  { label: 'Địa chỉ khách', width: '220px', align: 'left' },
  { label: 'Địa chỉ giao nhận (COD/BH)', width: '230px', align: 'left' },
  { label: 'Loại khách', width: '110px', align: 'center' },
  { label: 'Nguồn khách', width: '120px', align: 'left' },
  { label: 'Ghi chú khách hàng', width: '200px', align: 'left' },
  { label: 'Danh mục', width: '130px', align: 'left' },
  { label: 'Thiết bị', width: '190px', align: 'left' },
  { label: 'Serial Number', width: '150px', align: 'left' },
  { label: 'Phụ kiện bàn giao', width: '170px', align: 'left' },
  { label: 'Sửa những gì / Lỗi khách báo', width: '260px', align: 'left' },
  { label: 'Dịch vụ làm thêm', width: '210px', align: 'left' },
  { label: 'Ghi chú sửa chữa / Linh kiện', width: '260px', align: 'left' },
  { label: 'Trạng thái', width: '130px', align: 'center' },
  { label: 'Kỹ thuật viên', width: '150px', align: 'left' },
  { label: 'Chi nhánh', width: '150px', align: 'left' },
];

export function buildRevenueExcelWorkbook(
  options: RevenueExcelExportOptions
): RevenueExcelWorkbookResult {
  const items = Array.isArray(options.items) ? options.items : [];

  const fromDateClean = (options.fromDate || '').trim();
  const toDateClean = (options.toDate || '').trim();
  const prefix = options.fileNamePrefix || 'danh-sach-don-sua-chua';
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
      const orderCode = displayOrDash(item.order_code || item.id);
      const batchCode = displayOrDash(item.intake_batch_code);
      const orderTypeLabel = formatOrderTypeForReport(item.order_type);
      const intakeDate = displayOrDash(formatIntakeDateForReport(item.created_at));
      const handoverDate = displayOrDash(formatIntakeDateForReport(item.handed_over_at));
      const customerName = displayOrDash(item.customer_name || 'Khách lẻ');
      const customerPhone = displayOrDash(item.customer_phone);
      const customerEmail = displayOrDash(item.customer_email);
      const customerAddress = displayOrDash(item.customer_address);
      const shippingAddress = displayOrDash(item.shipping_address);
      const customerType = formatCustomerTypeForReport(item.customer_type);
      const customerSource = displayOrDash(item.customer_source);
      const customerNotes = displayOrDash(item.customer_notes);
      const deviceCategory = displayOrDash(item.device_category);
      const deviceName = displayOrDash(item.device_name || 'Thiết bị');
      const serialNumber = displayOrDash(item.serial_number);
      const accessories = displayOrDash(item.accessories);
      const issueDescription = displayOrDash(item.issue_description);
      const additionalServices = formatAdditionalServicesNames(item.additional_services);
      const repairAndParts = formatRepairAndPartsNotes(item);
      const statusLabel = formatOrderStatusForReport(item.status);
      const technicianName = displayOrDash(item.technician_name);
      const branchName = displayOrDash(item.branch_name || options.branchName);

      const cellStyle = 'border:1px solid #d8e2dc; padding:6px 10px; vertical-align:top;';

      return `
        <tr>
          <td style="text-align:center; ${cellStyle}">${stt}</td>
          <td style="text-align:left; ${cellStyle} font-family:monospace; font-weight:bold; color:#176b51; mso-number-format:'\\@';">${escapeHtml(orderCode)}</td>
          <td style="text-align:left; ${cellStyle} font-family:monospace; mso-number-format:'\\@';">${escapeHtml(batchCode)}</td>
          <td style="text-align:center; ${cellStyle}">${escapeHtml(orderTypeLabel)}</td>
          <td style="text-align:center; ${cellStyle} mso-number-format:'\\@';">${escapeHtml(intakeDate)}</td>
          <td style="text-align:center; ${cellStyle} mso-number-format:'\\@';">${escapeHtml(handoverDate)}</td>
          <td style="text-align:left; ${cellStyle} font-weight:600;">${escapeHtml(customerName)}</td>
          <td style="text-align:left; ${cellStyle} mso-number-format:'\\@';">${escapeHtml(customerPhone)}</td>
          <td style="text-align:left; ${cellStyle}">${escapeHtml(customerEmail)}</td>
          <td style="text-align:left; ${cellStyle}">${escapeHtml(customerAddress)}</td>
          <td style="text-align:left; ${cellStyle}">${escapeHtml(shippingAddress)}</td>
          <td style="text-align:center; ${cellStyle}">${escapeHtml(customerType)}</td>
          <td style="text-align:left; ${cellStyle}">${escapeHtml(customerSource)}</td>
          <td style="text-align:left; ${cellStyle}">${escapeHtml(customerNotes)}</td>
          <td style="text-align:left; ${cellStyle}">${escapeHtml(deviceCategory)}</td>
          <td style="text-align:left; ${cellStyle} font-weight:600;">${escapeHtml(deviceName)}</td>
          <td style="text-align:left; ${cellStyle} font-family:monospace; mso-number-format:'\\@';">${escapeHtml(serialNumber)}</td>
          <td style="text-align:left; ${cellStyle}">${escapeHtml(accessories)}</td>
          <td style="text-align:left; ${cellStyle}">${escapeHtml(issueDescription)}</td>
          <td style="text-align:left; ${cellStyle}">${escapeHtml(additionalServices)}</td>
          <td style="text-align:left; ${cellStyle}">${escapeHtml(repairAndParts)}</td>
          <td style="text-align:center; ${cellStyle}">${escapeHtml(statusLabel)}</td>
          <td style="text-align:left; ${cellStyle}">${escapeHtml(technicianName)}</td>
          <td style="text-align:left; ${cellStyle}">${escapeHtml(branchName)}</td>
        </tr>`;
    })
    .join('');

  const colCount = REPORT_COLUMNS.length;
  const emptyRowHtml =
    items.length === 0
      ? `
        <tr>
          <td colspan="${colCount}" style="text-align:center; border:1px solid #d8e2dc; padding:12px; color:#81908a;">
            Không có đơn sửa chữa nào trong kỳ (${escapeHtml(options.periodLabel)})
          </td>
        </tr>`
      : '';

  const branchInfo = options.branchName ? ` — Chi nhánh: ${options.branchName}` : '';
  const headersHtml = REPORT_COLUMNS.map(
    (col) =>
      `<th style="width:${col.width}; text-align:${col.align}; border:1px solid #cde4d8; padding:8px;">${escapeHtml(col.label)}</th>`
  ).join('\n        ');

  const htmlContent = `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta charset="UTF-8" />
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>DanhSachDonSuaChua</x:Name>
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
  <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse; width:100%;">
    <thead>
      <tr>
        <th colspan="${colCount}" style="background-color:#176b51; color:#ffffff; font-size:13pt; font-weight:bold; text-align:center; padding:10px; border:1px solid #176b51;">
          DANH SÁCH ĐƠN SỬA CHỮA &amp; THÔNG TIN KHÁCH HÀNG (${escapeHtml(options.periodLabel)})${escapeHtml(branchInfo)}
        </th>
      </tr>
      <tr style="background-color:#e9f4ef; color:#176b51; font-weight:bold;">
        ${headersHtml}
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || emptyRowHtml}
    </tbody>
  </table>
</body>
</html>`;

  return {
    content: htmlContent,
    fileName,
    totalAmount: 0,
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
