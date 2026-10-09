/**
 * a4ReceiptTemplate.ts
 * Module tạo mã HTML độc lập cho khổ giấy A4 (2 liên đối soát).
 * 100% TypeScript thuần, không chứa React JSX, tương thích hoàn toàn với Node.js test runner.
 */

import type { RepairOrder } from '@podscare/types';
import { generateBarcodeSVG, generateQRCodeSVG } from './BarcodeQRUtils';
import { formatMoney, formatOrderTypeLabel, formatMultiOrderTypeLabel, FIXO_LOGO_A4_SVG, type TenantReceiptBranding } from './thermalK80HtmlBuilder';

/**
 * Sinh chuỗi HTML độc lập cho khổ giấy A4 (2 liên đối soát).
 * Đảm bảo khóa chiều cao mỗi liên <=132mm và đường cắt phân cách 10mm có biểu tượng kéo ✂.
 * Hỗ trợ nhận 1 đơn hàng hoặc mảng đơn hàng gộp.
 */
export function renderA4ReceiptHTML(
  orderOrOrders: RepairOrder | RepairOrder[],
  origin?: string,
  branding?: TenantReceiptBranding
): string {
  if (Array.isArray(orderOrOrders)) {
    if (orderOrOrders.length === 0) return '';
    if (orderOrOrders.length === 1) {
      return renderA4ReceiptHTML(orderOrOrders[0], origin, branding);
    }
    return renderCombinedA4ReceiptHTML(orderOrOrders, origin, branding);
  }

  const order = orderOrOrders;
  const currentOrigin =
    origin || (typeof window !== 'undefined' ? window.location.origin : 'https://fixo.com.vn');
  const trackUrl = `${currentOrigin}/track/${order.id}`;

  const effectiveBranding = branding || (order as any).tenant;
  const effectiveLogoUrl = effectiveBranding?.logoUrl || effectiveBranding?.storeLogoUrl || (order as any).tenant?.logo_url;
  const effectiveStoreName = effectiveBranding?.storeName || (order as any).tenant?.name || 'FIXO REPAIR OS';
  const effectiveBranch = order.branch || effectiveBranding?.storeName || (order as any).tenant?.name || 'FIXO Store';
  const effectiveHotline = effectiveBranding?.hotline || effectiveBranding?.storeHotline || (order as any).tenant?.hotline;
  const effectiveFooterNote = effectiveBranding?.footerNote || effectiveBranding?.receiptFooterNote || (order as any).tenant?.receipt_footer_note;

  const barcodeSvg = generateBarcodeSVG(order.id, {
    height: 30,
    barWidth: 1.2,
    showText: false,
  });

  const qrCodeSvg = generateQRCodeSVG(trackUrl, {
    size: 70,
    margin: 1,
  });

  const renderSingleCopyHtml = (copyTitle: string) => {
    const checks = Array.isArray(order.checks) ? order.checks : [];
    const testNoteText = ((order.testNote || (order as any).test_note || '') as string).trim();
    const mid = Math.ceil(checks.length / 2);
    const leftChecks = checks.slice(0, mid);
    const rightChecks = checks.slice(mid);

    const checksTableHtml =
      (checks.length > 0 || Boolean(testNoteText))
        ? `
      <div class="a4-section a4-checks-section">
        <div class="a4-section-title">KẾT QUẢ KIỂM TRA TÍNH NĂNG TẠI QUẦY</div>
        ${checks.length > 0 ? `
        <div class="a4-grid-2">
          <table class="a4-table">
            <tbody>
              ${leftChecks
                .map(
                  (c) => `
                <tr>
                  <td class="td-name">${c.label}</td>
                  <td class="td-res ${
                    c.status === 'Hoạt động'
                      ? 'pass'
                      : c.status === 'Lỗi'
                      ? 'fail'
                      : 'na'
                  }">${c.status}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
          <table class="a4-table">
            <tbody>
              ${rightChecks
                .map(
                  (c) => `
                <tr>
                  <td class="td-name">${c.label}</td>
                  <td class="td-res ${
                    c.status === 'Hoạt động'
                      ? 'pass'
                      : c.status === 'Lỗi'
                      ? 'fail'
                      : 'na'
                  }">${c.status}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>` : ''}
        ${
          testNoteText
            ? `<div class="a4-test-note"><b>Ghi chú test tại quầy:</b> ${testNoteText}</div>`
            : ''
        }
      </div>`
        : '';

    const additionalServices = (order.additional_services || (order as any).additionalServices || []) as any[];
    const hasAdditional = Array.isArray(additionalServices) && additionalServices.length > 0;
    const initialPriceVal = order.initial_price !== undefined && order.initial_price !== null
      ? order.initial_price
      : (order as any).initialPrice !== undefined && (order as any).initialPrice !== null
      ? (order as any).initialPrice
      : order.price;
    const totalPriceVal = order.total_price !== undefined && order.total_price !== null ? order.total_price : order.price;

    const discountAmount = Number(order.discount_amount || (order as any).discountAmount) || 0;
    const finalPriceVal = discountAmount > 0 ? Math.max(0, totalPriceVal - discountAmount) : totalPriceVal;

    const warrantyDays = order.warranty_terms_days
      || (order.warranty_months ? (order.warranty_months === 12 ? 365 : order.warranty_months * 30) : null)
      || 90;
    const warrantyMonths = order.warranty_months
      || (warrantyDays === 365 ? 12 : Math.round(warrantyDays / 30))
      || 3;

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + warrantyDays);
    const formattedExpiryDate = new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(expiryDate);

    return `
    <article class="a4-copy">
      <!-- Header -->
      <div class="a4-header">
        <div class="a4-brand-wrap">
          <div class="a4-brand-logo">
            ${effectiveLogoUrl ? `<img src="${effectiveLogoUrl}" class="a4-store-logo" alt="Logo" onerror="this.style.display='none'" />` : FIXO_LOGO_A4_SVG}
          </div>
          <div>
            <div class="a4-brand-title">${effectiveStoreName}</div>
            <div class="a4-brand-subtitle">PHIẾU TIẾP NHẬN SỬA CHỮA THIẾT BỊ ĐIỆN TỬ</div>
          </div>
        </div>
        <div class="a4-badge">${copyTitle}</div>
      </div>

      <!-- Info Bar -->
      <div class="a4-infobar">
        <div class="a4-order-info">
          <span>MÃ PHIẾU:</span>
          <b class="a4-order-code">${order.id}</b>
          <div class="a4-barcode-wrap">${barcodeSvg}</div>
        </div>
        <div class="a4-infobar-right">
          <div>Ngày nhận: <b>${order.date || 'Hôm nay'}</b></div>
          <div>Chi nhánh: <b>${effectiveBranch}</b></div>
          ${effectiveHotline ? `<div>Hotline: <b>${effectiveHotline}</b></div>` : ''}
        </div>
      </div>

      <!-- Customer & Device -->
      <div class="a4-grid-2 a4-section a4-cust-dev">
        <div>
          <div class="a4-section-title">THÔNG TIN KHÁCH HÀNG</div>
          <div class="a4-line"><b>Họ tên:</b> ${order.name || 'Khách lẻ'}</div>
          <div class="a4-line"><b>Số điện thoại:</b> ${order.phone || '—'}</div>
          <div class="a4-line" style="font-weight: bold; font-size: 8pt; margin-top: 2px; color: ${((order as any).order_type === 'cod' || (order as any).orderType === 'cod') ? '#b45309' : '#176b58'};">
            ${formatOrderTypeLabel(order, finalPriceVal) /* Hỗ trợ: LOẠI ĐƠN: ĐƠN COD (KHÁCH TỈNH) · LOẠI ĐƠN: ĐƠN TẠI CỬA HÀNG · LOẠI ĐƠN: TIẾP NHẬN BẢO HÀNH */}
          </div>
        </div>
        <div>
          <div class="a4-section-title">THIẾT BỊ TIẾP NHẬN</div>
          <div class="a4-line"><b>Dòng máy:</b> ${order.device || 'Thiết bị Apple'}</div>
          <div class="a4-line"><b>Serial / Model:</b> ${order.serial || 'Chưa cập nhật'}</div>
          <div class="a4-line"><b>Phụ kiện đi kèm:</b> ${order.accessories || 'Không gửi kèm'}</div>
        </div>
      </div>

      <!-- Issue -->
      <div class="a4-section">
        <div class="a4-section-title">TÌNH TRẠNG LỖI KHÁCH BÁO</div>
        <div class="a4-issue-box">${order.issue || 'Kiểm tra tổng quát thiết bị'}</div>
      </div>

      <!-- Checklist -->
      ${checksTableHtml}

      <!-- Appearance -->
      <div class="a4-section a4-appearance">
        <div class="a4-section-title">TÌNH TRẠNG NGOẠI HÌNH TIẾP NHẬN</div>
        <div class="a4-line">${order.appearance || 'Không ghi nhận vết nứt vỡ ngoại quan'}</div>
      </div>

      ${(hasAdditional || discountAmount > 0) ? `
      <!-- Additional Services Breakdown -->
      <div class="a4-section" style="margin-bottom: 2px; padding: 2px 4px; background: #fafdfb; border: 1px dashed #b8d0c5; border-radius: 4px;">
        <div style="font-size: 7pt; font-weight: bold; color: #176b58; margin-bottom: 1.5px;">BẢNG KÊ DỊCH VỤ & CHI PHÍ:</div>
        <div style="display: flex; justify-content: space-between; font-size: 7pt; padding: 1px 0;">
          <span>1. Tiếp nhận ban đầu (${order.device || 'Thiết bị'}):</span>
          <b style="font-variant-numeric: tabular-nums;">${formatMoney(initialPriceVal)}</b>
        </div>
        ${additionalServices.map((srv: any, i: number) => `
        <div style="display: flex; justify-content: space-between; font-size: 7pt; padding: 1px 0;">
          <span>${i + 2}. [Làm thêm] ${srv.name}:</span>
          <b style="color: #176b58; font-variant-numeric: tabular-nums;">+${formatMoney(srv.price)}</b>
        </div>`).join('')}
        ${discountAmount > 0 ? `
        <div style="display: flex; justify-content: space-between; font-size: 7pt; padding: 1px 0; color: #b91c1c; font-weight: bold;">
          <span>• Giảm giá:</span>
          <b style="font-variant-numeric: tabular-nums;">-${formatMoney(discountAmount)}</b>
        </div>` : ''}
      </div>` : ''}

      <!-- Price & QR -->
      <div class="a4-price-row">
        <div class="a4-price-box">
          <span>${discountAmount > 0 ? 'TỔNG THANH TOÁN THỰC THU:' : (hasAdditional ? 'TỔNG CỘNG THANH TOÁN:' : 'GIÁ SỬA CHỮA DỰ KIẾN:')}</span>
          <b class="a4-price-val">${formatMoney(finalPriceVal)}</b>
          ${order.priceNote ? `<small class="a4-price-note">(${order.priceNote})</small>` : ''}
        </div>
        <div class="a4-qr-wrap">
          <div class="a4-qr-img">${qrCodeSvg}</div>
          <span class="a4-qr-text">Quét tra cứu tiến độ</span>
        </div>
      </div>

      <!-- Terms -->
      <div class="a4-terms">
        * Chi phí trên là dự kiến tại thời điểm tiếp nhận. <b>Thời hạn bảo hành: ${warrantyMonths} tháng (Đến ngày ${formattedExpiryDate})</b>. FIXO sẽ chủ động liên hệ quý khách xác nhận trước khi can thiệp nếu có phát sinh linh kiện. Quý khách vui lòng giữ phiếu này để đối chiếu khi nhận lại thiết bị.
      </div>

      <!-- Signatures -->
      <div class="a4-signatures">
        <div class="a4-sig-col">
          <b>KHÁCH HÀNG</b>
          <div class="a4-sig-sub">(Ký và ghi rõ họ tên)</div>
          <div class="a4-sig-space"></div>
          <div class="a4-sig-name">${order.name || ''}</div>
        </div>
        <div class="a4-sig-col">
          <b>NHÂN VIÊN TIẾP NHẬN</b>
          <div class="a4-sig-sub">(Ký và ghi rõ họ tên)</div>
          <div class="a4-sig-space"></div>
          <div class="a4-sig-name">${order.createdBy || 'FIXO'}</div>
        </div>
      </div>

      <!-- Footer -->
      <div class="a4-footer">
        ${effectiveFooterNote ? `<div style="margin-bottom: 2px;">${effectiveFooterNote}</div>` : ''}
        <div>⚡ Powered by FIXO Repair OS · fixo.vn · Phiếu tiếp nhận được lập thành 02 liên có giá trị pháp lý đối chiếu như nhau · Mã: ${order.id}</div>
      </div>
    </article>`;
  };

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>${order.id} - In phiếu A4 2 liên</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 5mm 7mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      width: 100%;
      margin: 0;
      padding: 0;
      background: #ffffff !important;
      color: #111111 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-size: 8.5pt;
      line-height: 1.3;
    }
    .a4-container {
      width: 100%;
      max-width: 196mm;
      margin: 0 auto;
    }
    .a4-copy {
      height: 132mm;
      max-height: 132mm;
      overflow: hidden;
      border: 1px solid #c8d3cc;
      border-radius: 6px;
      padding: 4mm 6mm;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .a4-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #176b58;
      padding-bottom: 3px;
      margin-bottom: 3px;
    }
    .a4-brand-wrap {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .a4-brand-logo svg {
      display: block;
    }
    .a4-store-logo {
      max-width: 48mm;
      max-height: 28mm;
      object-fit: contain;
      display: block;
    }
    .a4-brand-title {
      font-size: 13pt;
      font-weight: 900;
      color: #176b58;
      letter-spacing: -0.3px;
      line-height: 1;
    }
    .a4-brand-subtitle {
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.8px;
      color: #555555;
      margin-top: 1px;
    }
    .a4-badge {
      font-size: 7.5pt;
      font-weight: 800;
      padding: 2px 7px;
      border: 1px solid #176b58;
      color: #176b58;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .a4-infobar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f2f7f4;
      padding: 3px 6px;
      border-radius: 4px;
      margin-bottom: 4px;
      font-size: 7.5pt;
    }
    .a4-order-info {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .a4-order-code {
      font-size: 10pt;
      font-weight: 600;
      font-family: monospace;
      color: #176b58;
      letter-spacing: 1px;
      font-variant-numeric: tabular-nums;
    }
    .a4-barcode-wrap {
      display: inline-flex;
      align-items: center;
      height: 22px;
    }
    .a4-barcode-wrap svg {
      height: 20px;
      max-width: 140px;
    }
    .a4-infobar-right {
      display: flex;
      gap: 12px;
      color: #444444;
      font-size: 7pt;
    }
    .a4-grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .a4-section {
      margin-bottom: 3px;
    }
    .a4-section-title {
      font-size: 7pt;
      font-weight: 800;
      color: #176b58;
      text-transform: uppercase;
      margin-bottom: 1.5px;
      letter-spacing: 0.3px;
    }
    .a4-line {
      font-size: 7.5pt;
      line-height: 1.25;
      color: #222222;
    }
    .a4-cust-dev {
      border-bottom: 1px solid #edf1ee;
      padding-bottom: 3px;
    }
    .a4-issue-box {
      background: #fafbfa;
      border: 1px solid #e1e8e3;
      padding: 3px 5px;
      border-radius: 3px;
      font-size: 7.5pt;
      line-height: 1.25;
    }
    .a4-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 7pt;
    }
    .a4-table td {
      padding: 1.5px 4px;
      border: 1px solid #e3e8e5;
    }
    .td-name {
      color: #333333;
    }
    .td-res {
      width: 32%;
      font-weight: 700;
      text-align: right;
    }
    .pass { color: #176b58; }
    .fail { color: #c0392b; }
    .na { color: #777777; }
    .a4-test-note {
      font-size: 6.5pt;
      color: #666666;
      margin-top: 1px;
    }
    .a4-price-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border: 1px solid #176b58;
      background: #f7fbf9;
      padding: 3px 6px;
      border-radius: 4px;
      margin-bottom: 3px;
    }
    .a4-price-box {
      font-size: 7.5pt;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .a4-price-val {
      font-size: 10pt;
      color: #176b58;
      font-weight: 600;
      letter-spacing: 0.5px;
      font-variant-numeric: tabular-nums;
    }
    .a4-price-note {
      color: #666666;
      font-size: 6.5pt;
    }
    .a4-qr-wrap {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .a4-qr-img svg {
      width: 20px;
      height: 20px;
      display: block;
    }
    .a4-qr-text {
      font-size: 6.5pt;
      color: #555555;
      font-weight: 600;
    }
    .a4-terms {
      font-size: 6pt;
      line-height: 1.2;
      color: #666666;
      margin-bottom: 3px;
    }
    .a4-signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      text-align: center;
      border-top: 1px solid #edf1ee;
      padding-top: 2px;
      font-size: 7pt;
    }
    .a4-sig-sub {
      font-size: 5.5pt;
      color: #777777;
    }
    .a4-sig-space {
      height: 20px;
    }
    .a4-sig-name {
      font-weight: 700;
      font-size: 7pt;
    }
    .a4-footer {
      border-top: 1px solid #e3e8e5;
      padding-top: 2px;
      text-align: center;
      font-size: 6pt;
      color: #777777;
    }
    .a4-divider {
      height: 10mm;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .a4-divider-line {
      width: 100%;
      border-top: 1px dashed #777777;
      position: absolute;
    }
    .a4-divider-text {
      position: relative;
      background: #ffffff;
      padding: 0 8px;
      font-size: 7pt;
      color: #666666;
      letter-spacing: 2px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="a4-container" id="printSheetWrapper">
    <!-- LIÊN 1: CỬA HÀNG GIỮ -->
    ${renderSingleCopyHtml('LIÊN 1 · BẢN LƯU CỬA HÀNG')}

    <!-- ĐƯỜNG CẮT PHÂN CÁCH ĐỨT NÉT 10mm -->
    <div class="a4-divider print:h-[10mm]">
      <div class="a4-divider-line"></div>
      <span class="a4-divider-text">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂</span>
    </div>

    <!-- LIÊN 2: KHÁCH HÀNG GIỮ -->
    ${renderSingleCopyHtml('LIÊN 2 · BẢN GIAO KHÁCH HÀNG')}
  </div>
</body>
</html>`;
}

/**
 * Sinh chuỗi HTML độc lập cho khổ giấy A4 gộp nhiều thiết bị (2 liên đối soát).
 */
export function renderCombinedA4ReceiptHTML(
  orders: RepairOrder[],
  origin?: string,
  branding?: TenantReceiptBranding
): string {
  if (!orders || orders.length === 0) return '';
  if (orders.length === 1) return renderA4ReceiptHTML(orders[0], origin, branding);

  const primaryOrder = orders[0];
  const currentOrigin =
    origin || (typeof window !== 'undefined' ? window.location.origin : 'https://fixo.com.vn');
  const trackUrl = `${currentOrigin}/track/${primaryOrder.id}`;

  const effectiveBranding = branding || (primaryOrder as any).tenant;
  const effectiveLogoUrl = effectiveBranding?.logoUrl || effectiveBranding?.storeLogoUrl || (primaryOrder as any).tenant?.logo_url;
  const effectiveStoreName = effectiveBranding?.storeName || (primaryOrder as any).tenant?.name || 'FIXO REPAIR OS';
  const effectiveBranch = primaryOrder.branch || effectiveBranding?.storeName || (primaryOrder as any).tenant?.name || 'FIXO Store';
  const effectiveHotline = effectiveBranding?.hotline || effectiveBranding?.storeHotline || (primaryOrder as any).tenant?.hotline;
  const effectiveFooterNote = effectiveBranding?.footerNote || effectiveBranding?.receiptFooterNote || (primaryOrder as any).tenant?.receipt_footer_note;

  const batchCode = primaryOrder.intake_batch_code || `IB26-${orders.map((o) => o.id.replace(/^FX\d+-/, '')).join('-')}`;
  const barcodeSvg = generateBarcodeSVG(primaryOrder.intake_batch_code || primaryOrder.id, {
    height: 28,
    barWidth: 1.2,
    showText: false,
  });

  const qrCodeSvg = generateQRCodeSVG(trackUrl, {
    size: 65,
    margin: 1,
  });

  const totalPrice = orders.reduce((sum, o) => sum + (Number((o as any).total_price || o.price) || 0), 0);
  const allOrderCodes = orders.map((o) => o.id).join(', ');

  const renderSingleCopyHtml = (copyTitle: string) => {
    return `
    <article class="a4-copy">
      <!-- Header -->
      <div class="a4-header">
        <div class="a4-brand-wrap">
          <div class="a4-brand-logo">
            ${effectiveLogoUrl ? `<img src="${effectiveLogoUrl}" class="a4-store-logo" alt="Logo" onerror="this.style.display='none'" />` : FIXO_LOGO_A4_SVG}
          </div>
          <div>
            <div class="a4-brand-title">${effectiveStoreName}</div>
            <div class="a4-brand-subtitle">PHIẾU TIẾP NHẬN SỬA CHỮA THIẾT BỊ ĐIỆN TỬ · ĐỢT TIẾP NHẬN GỘP (${orders.length} MÁY)</div>
          </div>
        </div>
        <div class="a4-badge">${copyTitle}</div>
      </div>

      <!-- Info Bar -->
      <div class="a4-infobar">
        <div class="a4-order-info">
          <span>MÃ ĐỢT TIẾP NHẬN:</span>
          <b class="a4-order-code">${batchCode}</b>
          <div class="a4-barcode-wrap">${barcodeSvg}</div>
        </div>
        <div class="a4-infobar-right">
          <div>Ngày nhận: <b>${primaryOrder.date || 'Hôm nay'}</b></div>
          <div>Chi nhánh: <b>${effectiveBranch}</b></div>
          ${effectiveHotline ? `<div>Hotline: <b>${effectiveHotline}</b></div>` : ''}
        </div>
      </div>

      <!-- Customer Bar -->
      <div class="a4-section" style="padding: 2.5px 6px; background: #fbfdfc; border: 1px solid #dce4e0; border-radius: 4px; margin-bottom: 3px;">
        <div style="display: flex; justify-content: space-between; font-size: 8pt;">
          <div><b>Khách hàng:</b> ${primaryOrder.name || 'Khách lẻ'} · <b>SĐT:</b> ${primaryOrder.phone || '—'}</div>
          <div><b>Số lượng:</b> ${orders.length} thiết bị · <b>Mã phiếu:</b> ${allOrderCodes}</div>
        </div>
        <div style="font-weight: bold; font-size: 8pt; margin-top: 2px; color: ${((primaryOrder as any).order_type === 'cod' || (primaryOrder as any).orderType === 'cod') ? '#b45309' : '#176b58'};">
          ${formatMultiOrderTypeLabel(orders)}
        </div>
      </div>

      <!-- Multi-device Table -->
      <div class="a4-section" style="flex: 1; overflow: hidden; margin-top: 2px;">
        <div class="a4-section-title" style="margin-bottom: 2px;">DANH SÁCH THIẾT BỊ TIẾP NHẬN (${orders.length} THIẾT BỊ)</div>
        <table class="a4-table" style="width: 100%; border-collapse: collapse; font-size: 7.5pt;">
          <thead>
            <tr style="background: #eef4f1; border-bottom: 1.5px solid #176b58;">
              <th style="padding: 2.5px 4px; text-align: center; width: 6%;">STT</th>
              <th style="padding: 2.5px 4px; text-align: left; width: 28%;">Dòng máy / Serial</th>
              <th style="padding: 2.5px 4px; text-align: left; width: 18%;">Phụ kiện</th>
              <th style="padding: 2.5px 4px; text-align: left; width: 30%;">Tình trạng lỗi khách báo</th>
              <th style="padding: 2.5px 4px; text-align: right; width: 18%;">Chi phí dự kiến</th>
            </tr>
          </thead>
          <tbody>
            ${orders
              .map(
                (dev, idx) => `
              <tr style="border-bottom: 1px dotted #ccc;">
                <td style="padding: 2px 4px; text-align: center; font-weight: bold;">${idx + 1}</td>
                <td style="padding: 2px 4px;">
                  <b>${dev.device || 'Thiết bị Apple'}</b>
                  <div style="font-size: 6.5pt; color: #555;">SN: ${dev.serial || 'Chưa cập nhật'} · Mã: ${dev.id}</div>
                </td>
                <td style="padding: 2px 4px;">${dev.accessories || 'Không gửi kèm'}</td>
                <td style="padding: 2px 4px;">
                  <div>${dev.issue || 'Kiểm tra tổng quát'}</div>
                  ${dev.appearance ? `<div style="font-size: 6.5pt; color: #666;">Ngoại hình: ${dev.appearance}</div>` : ''}
                  ${((dev.testNote || (dev as any).test_note)) ? `<div style="font-size: 6.5pt; color: #176b58; font-weight: 600;">Ghi chú test tại quầy: ${dev.testNote || (dev as any).test_note}</div>` : ''}
                </td>
                <td style="padding: 2px 4px; text-align: right; font-weight: bold; font-variant-numeric: tabular-nums;">
                  ${formatMoney((dev as any).total_price || dev.price)}
                  ${((dev as any).additional_services?.length || (dev as any).additionalServices?.length) ? `
                    <div style="font-size: 6pt; color: #176b58; font-weight: normal;">(+${((dev as any).additional_services || (dev as any).additionalServices).length} dv thêm)</div>
                  ` : ''}
                </td>
              </tr>`
              )
              .join('')}
          </tbody>
          <tfoot>
            <tr style="background: #eef6f2; border-top: 1.5px solid #176b58;">
              <td colspan="4" style="padding: 2.5px 4px; text-align: right; font-weight: bold; color: #176b58;">
                TỔNG CỘNG TIẾP NHẬN (${orders.length} THIẾT BỊ):
              </td>
              <td style="padding: 2.5px 4px; text-align: right; font-weight: 800; font-size: 9pt; color: #176b58; font-variant-numeric: tabular-nums;">
                ${formatMoney(totalPrice)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Price & QR -->
      <div class="a4-price-row" style="margin-top: 2px; padding: 2px 0;">
        <div class="a4-price-box">
          <span>TỔNG CHI PHÍ TIẾP NHẬN DỰ KIẾN:</span>
          <b class="a4-price-val">${formatMoney(totalPrice)}</b>
          <small class="a4-price-note">(${orders.length} thiết bị)</small>
        </div>
        <div class="a4-qr-wrap">
          <div class="a4-qr-img">${qrCodeSvg}</div>
          <span class="a4-qr-text">Quét tra cứu tiến độ</span>
        </div>
      </div>

      <!-- Terms -->
      <div class="a4-terms">
        * Chi phí trên là dự kiến tại thời điểm tiếp nhận. FIXO sẽ chủ động liên hệ quý khách xác nhận trước khi can thiệp nếu có phát sinh linh kiện. Quý khách vui lòng giữ phiếu này để đối chiếu khi nhận lại thiết bị.
      </div>

      <!-- Signatures -->
      <div class="a4-signatures">
        <div class="a4-sig-col">
          <b>KHÁCH HÀNG</b>
          <div class="a4-sig-sub">(Ký và ghi rõ họ tên)</div>
          <div class="a4-sig-space"></div>
          <div class="a4-sig-name">${primaryOrder.name || ''}</div>
        </div>
        <div class="a4-sig-col">
          <b>NHÂN VIÊN TIẾP NHẬN</b>
          <div class="a4-sig-sub">(Ký và ghi rõ họ tên)</div>
          <div class="a4-sig-space"></div>
          <div class="a4-sig-name">${primaryOrder.createdBy || 'FIXO'}</div>
        </div>
      </div>

      <!-- Footer -->
      <div class="a4-footer">
        ${effectiveFooterNote ? `<div style="margin-bottom: 2px;">${effectiveFooterNote}</div>` : ''}
        <div>⚡ Powered by FIXO Repair OS · fixo.vn · Phiếu tiếp nhận được lập thành 02 liên có giá trị pháp lý đối chiếu như nhau · Mã đợt: ${batchCode}</div>
      </div>
    </article>`;
  };

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>${batchCode} - In phiếu A4 Gộp (${orders.length} thiết bị)</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 5mm 7mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      width: 100%;
      margin: 0;
      padding: 0;
      background: #ffffff !important;
      color: #111111 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-size: 8.5pt;
      line-height: 1.3;
    }
    .a4-container {
      width: 100%;
      max-width: 196mm;
      margin: 0 auto;
    }
    .a4-copy {
      height: 132mm;
      max-height: 132mm;
      overflow: hidden;
      border: 1px solid #c8d3cc;
      border-radius: 6px;
      padding: 4mm 6mm;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .a4-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #176b58;
      padding-bottom: 3px;
      margin-bottom: 3px;
    }
    .a4-brand-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .a4-brand-logo {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .a4-store-logo {
      max-width: 38mm;
      max-height: 14mm;
      object-fit: contain;
      filter: contrast(110%);
    }
    .a4-brand-title {
      font-size: 11pt;
      font-weight: 800;
      color: #176b58;
      letter-spacing: -0.3px;
      line-height: 1.1;
    }
    .a4-brand-subtitle {
      font-size: 6.5pt;
      font-weight: 700;
      color: #4a5c53;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-top: 1px;
    }
    .a4-badge {
      font-size: 7.5pt;
      font-weight: 700;
      background: #176b58;
      color: #ffffff;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .a4-infobar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f4f7f5;
      padding: 3px 6px;
      border-radius: 4px;
      margin-bottom: 3px;
      font-size: 7.5pt;
    }
    .a4-order-info {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .a4-order-code {
      font-size: 10pt;
      font-family: monospace;
      color: #176b58;
      letter-spacing: 0.8px;
    }
    .a4-barcode-wrap {
      display: inline-block;
      vertical-align: middle;
    }
    .a4-barcode-wrap svg {
      height: 24px;
    }
    .a4-infobar-right {
      display: flex;
      gap: 8px;
      color: #4a5c53;
    }
    .a4-section-title {
      font-size: 7.5pt;
      font-weight: 800;
      color: #176b58;
      border-bottom: 1px solid #dce4e0;
      padding-bottom: 1.5px;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }
    .a4-price-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #eef6f2;
      border: 1px solid #b8d0c5;
      border-radius: 4px;
      padding: 3px 8px;
      margin: 2px 0;
    }
    .a4-price-box {
      font-size: 8pt;
      font-weight: 700;
      color: #176b58;
    }
    .a4-price-val {
      font-size: 11pt;
      font-weight: 800;
      margin-left: 6px;
      font-variant-numeric: tabular-nums;
    }
    .a4-price-note {
      font-size: 7pt;
      color: #555555;
      font-weight: normal;
      margin-left: 4px;
    }
    .a4-qr-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .a4-qr-img {
      width: 45px;
      height: 45px;
    }
    .a4-qr-img svg {
      width: 100%;
      height: 100%;
    }
    .a4-qr-text {
      font-size: 6.5pt;
      color: #4a5c53;
      max-width: 60px;
      line-height: 1.1;
    }
    .a4-terms {
      font-size: 6pt;
      color: #666666;
      font-style: italic;
      line-height: 1.2;
      margin: 2px 0;
    }
    .a4-signatures {
      display: flex;
      justify-content: space-between;
      text-align: center;
      margin: 2px 0;
      font-size: 7.5pt;
    }
    .a4-sig-col {
      width: 45%;
    }
    .a4-sig-sub {
      font-size: 6pt;
      color: #666666;
      font-style: italic;
    }
    .a4-sig-space {
      height: 16px;
    }
    .a4-sig-name {
      font-weight: 700;
      font-size: 7.5pt;
    }
    .a4-footer {
      border-top: 1px solid #e3e8e5;
      padding-top: 2px;
      text-align: center;
      font-size: 6pt;
      color: #777777;
    }
    .a4-divider {
      height: 10mm;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .a4-divider-line {
      width: 100%;
      border-top: 1px dashed #777777;
      position: absolute;
    }
    .a4-divider-text {
      position: relative;
      background: #ffffff;
      padding: 0 8px;
      font-size: 7pt;
      color: #666666;
      letter-spacing: 2px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="a4-container" id="printSheetWrapper">
    <!-- LIÊN 1: CỬA HÀNG GIỮ -->
    ${renderSingleCopyHtml('LIÊN 1 · BẢN LƯU CỬA HÀNG')}

    <!-- ĐƯỜNG CẮT PHÂN CÁCH ĐỨT NÉT 10mm -->
    <div class="a4-divider print:h-[10mm]">
      <div class="a4-divider-line"></div>
      <span class="a4-divider-text">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂</span>
    </div>

    <!-- LIÊN 2: KHÁCH HÀNG GIỮ -->
    ${renderSingleCopyHtml('LIÊN 2 · BẢN GIAO KHÁCH HÀNG')}
  </div>
</body>
</html>`;
}

