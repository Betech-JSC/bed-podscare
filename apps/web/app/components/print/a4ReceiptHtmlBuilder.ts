/**
 * a4ReceiptTemplate.ts
 * Module tạo mã HTML độc lập cho khổ giấy A4 (2 liên đối soát).
 * 100% TypeScript thuần, không chứa React JSX, tương thích hoàn toàn với Node.js test runner.
 */

import type { RepairOrder } from '@podscare/types';
import { generateBarcodeSVG, generateQRCodeSVG } from './BarcodeQRUtils';
import { formatMoney } from './thermalK80HtmlBuilder';

/**
 * Sinh chuỗi HTML độc lập cho khổ giấy A4 (2 liên đối soát).
 * Đảm bảo khóa chiều cao mỗi liên <=132mm và đường cắt phân cách 10mm có biểu tượng kéo ✂.
 */
export function renderA4ReceiptHTML(order: RepairOrder, origin?: string): string {
  const currentOrigin =
    origin || (typeof window !== 'undefined' ? window.location.origin : 'https://podscare.fixo.vn');
  const trackUrl = `${currentOrigin}/track/${order.id}`;

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
    const mid = Math.ceil(checks.length / 2);
    const leftChecks = checks.slice(0, mid);
    const rightChecks = checks.slice(mid);

    const checksTableHtml =
      checks.length > 0
        ? `
      <div class="a4-section a4-checks-section">
        <div class="a4-section-title">KẾT QUẢ KIỂM TRA TÍNH NĂNG TẠI QUẦY</div>
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
        </div>
        ${
          order.testNote
            ? `<div class="a4-test-note"><b>Ghi chú test:</b> ${order.testNote}</div>`
            : ''
        }
      </div>`
        : '';

    return `
    <article class="a4-copy">
      <!-- Header -->
      <div class="a4-header">
        <div class="a4-brand-wrap">
          <div class="a4-brand-logo">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="34" height="34">
              <rect width="100" height="100" rx="16" fill="#176b58" />
              <path d="M28 26h44v13H43v13h25v12H43v22H28V26z" fill="#ffffff" />
            </svg>
          </div>
          <div>
            <div class="a4-brand-title">FIXO REPAIR OS</div>
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
          <div>Chi nhánh: <b>${order.branch || 'FIXO Store'}</b></div>
        </div>
      </div>

      <!-- Customer & Device -->
      <div class="a4-grid-2 a4-section a4-cust-dev">
        <div>
          <div class="a4-section-title">THÔNG TIN KHÁCH HÀNG</div>
          <div class="a4-line"><b>Họ tên:</b> ${order.name || 'Khách lẻ'}</div>
          <div class="a4-line"><b>Số điện thoại:</b> ${order.phone || '—'}</div>
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

      <!-- Price & QR -->
      <div class="a4-price-row">
        <div class="a4-price-box">
          <span>GIÁ SỬA CHỮA DỰ KIẾN:</span>
          <b class="a4-price-val">${formatMoney(order.price)}</b>
          ${order.priceNote ? `<small class="a4-price-note">(${order.priceNote})</small>` : ''}
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
        FIXO Repair OS · Phiếu tiếp nhận được lập thành 02 liên có giá trị pháp lý đối chiếu như nhau · Mã: ${order.id}
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
      font-family: monospace;
      color: #176b58;
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
      font-weight: 900;
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
