/**
 * thermalK80Template.ts
 * Module tạo mã HTML độc lập cho máy in nhiệt cuộn 80mm (K80).
 * 100% TypeScript thuần, không chứa React JSX, tương thích hoàn toàn với Node.js test runner.
 */

import type { RepairOrder } from '@podscare/types';
import { generateBarcodeSVG, generateQRCodeSVG } from './BarcodeQRUtils';

export const FIXO_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="36" height="36">
  <rect width="100" height="100" rx="20" fill="#000000" />
  <!-- F: vát cong & stem bo tròn -->
  <path d="M 8.5 40.5 C 8.5 37.5 10.5 35.5 13.5 35.5 H 24.5 C 28 35.5 30 38 28.5 41 C 26 45 22.5 47 16.5 47.5 H 14.5 V 49.5 H 22 C 24.5 49.5 26.5 51.5 25.5 54 C 24 57 21 59 16 59.5 H 14.5 V 61.5 C 14.5 63 13.2 64.5 11.5 64.5 C 9.8 64.5 8.5 63 8.5 61.5 Z" fill="#ffffff" />
  <!-- I: thanh bo góc -->
  <rect x="31" y="35.5" width="6.5" height="29" rx="3.2" fill="#ffffff" />
  <!-- X: hai thanh chéo cắt nhau -->
  <path d="M 40.5 38.5 C 39.5 36.5 41 35.5 43 35.5 L 46.5 35.5 C 48 35.5 49.5 36.5 50.5 38 L 62.5 59.5 C 63.5 61.5 62 64.5 59.5 64.5 L 56 64.5 C 54.5 64.5 53 63.5 52 62 Z" fill="#ffffff" />
  <path d="M 42.5 61.5 C 41.5 63.5 43 64.5 45 64.5 L 48.5 64.5 C 50 64.5 51.5 63.5 52.5 62 L 64.5 40.5 C 65.5 38.5 64 35.5 61.5 35.5 L 58 35.5 C 56.5 35.5 55 36.5 54 38 Z" fill="#ffffff" />
  <!-- O: biểu tượng cờ lê nghiêng 45 độ -->
  <g transform="translate(80, 50) rotate(-45)">
    <path fill-rule="evenodd" d="M 0 -14.5 A 14.5 14.5 0 1 1 -11 -9.5 L -14.5 -9.5 A 14.5 14.5 0 0 1 0 -14.5 Z M 0 -8.5 A 8.5 8.5 0 1 0 0 8.5 A 8.5 8.5 0 0 0 0 -8.5 Z" fill="#ffffff" />
    <path d="M -14.5 -1.6 H -2 C -3.5 -3.5 -2.5 -6 0.5 -6 C 2.5 -6 4.5 -4.5 5.5 -2.5 L 2.5 -1.2 C 1.8 -1.8 0.8 -1.8 0.2 -1.2 C -0.5 -0.5 -0.5 0.5 0.2 1.2 C 0.8 1.8 1.8 1.8 2.5 1.2 L 5.5 2.5 C 4.5 4.5 2.5 6 0.5 6 C -2.5 6 -3.5 3.5 -2 1.6 H -14.5 Z" fill="#ffffff" />
  </g>
</svg>`;

export const FIXO_LOGO_A4_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="34" height="34">
  <rect width="100" height="100" rx="18" fill="#176b58" />
  <!-- F: vát cong & stem bo tròn -->
  <path d="M 8.5 40.5 C 8.5 37.5 10.5 35.5 13.5 35.5 H 24.5 C 28 35.5 30 38 28.5 41 C 26 45 22.5 47 16.5 47.5 H 14.5 V 49.5 H 22 C 24.5 49.5 26.5 51.5 25.5 54 C 24 57 21 59 16 59.5 H 14.5 V 61.5 C 14.5 63 13.2 64.5 11.5 64.5 C 9.8 64.5 8.5 63 8.5 61.5 Z" fill="#10b981" />
  <!-- I: thanh bo góc -->
  <rect x="31" y="35.5" width="6.5" height="29" rx="3.2" fill="#ffffff" />
  <!-- X: hai thanh chéo cắt nhau -->
  <path d="M 40.5 38.5 C 39.5 36.5 41 35.5 43 35.5 L 46.5 35.5 C 48 35.5 49.5 36.5 50.5 38 L 62.5 59.5 C 63.5 61.5 62 64.5 59.5 64.5 L 56 64.5 C 54.5 64.5 53 63.5 52 62 Z" fill="#10b981" />
  <path d="M 42.5 61.5 C 41.5 63.5 43 64.5 45 64.5 L 48.5 64.5 C 50 64.5 51.5 63.5 52.5 62 L 64.5 40.5 C 65.5 38.5 64 35.5 61.5 35.5 L 58 35.5 C 56.5 35.5 55 36.5 54 38 Z" fill="#ffffff" />
  <!-- O: biểu tượng cờ lê nghiêng 45 độ -->
  <g transform="translate(80, 50) rotate(-45)">
    <path fill-rule="evenodd" d="M 0 -14.5 A 14.5 14.5 0 1 1 -11 -9.5 L -14.5 -9.5 A 14.5 14.5 0 0 1 0 -14.5 Z M 0 -8.5 A 8.5 8.5 0 1 0 0 8.5 A 8.5 8.5 0 0 0 0 -8.5 Z" fill="#ffffff" />
    <path d="M -14.5 -1.6 H -2 C -3.5 -3.5 -2.5 -6 0.5 -6 C 2.5 -6 4.5 -4.5 5.5 -2.5 L 2.5 -1.2 C 1.8 -1.8 0.8 -1.8 0.2 -1.2 C -0.5 -0.5 -0.5 0.5 0.2 1.2 C 0.8 1.8 1.8 1.8 2.5 1.2 L 5.5 2.5 C 4.5 4.5 2.5 6 0.5 6 C -2.5 6 -3.5 3.5 -2 1.6 H -14.5 Z" fill="#ffffff" />
  </g>
</svg>`;

export function formatMoney(n?: number): string {
  if (!n) return '—';
  return new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
}

/**
 * Sinh chuỗi HTML độc lập cho mẫu in nhiệt cuộn 80mm (K80).
 */
export function renderThermalK80HTML(
  order: RepairOrder,
  origin?: string,
  isRoutingSlip = false
): string {
  const currentOrigin =
    origin || (typeof window !== 'undefined' ? window.location.origin : 'https://podscare.fixo.vn');
  const trackUrl = `${currentOrigin}/track/${order.id}`;

  const barcodeSvg = generateBarcodeSVG(order.id, {
    height: 36,
    barWidth: 1.35,
    showText: false,
  });

  const qrCodeSvg = generateQRCodeSVG(trackUrl, {
    size: 96,
    margin: 1,
  });

  const checks = Array.isArray(order.checks) ? order.checks : [];
  const checksHtml =
    checks.length > 0
      ? `
      <div class="k80-section">
        <div class="k80-section-title">KIỂM TRA CHỨC NĂNG TẠI QUẦY</div>
        <table class="k80-table">
          ${checks
            .map(
              (c) => `
            <tr>
              <td class="td-label">${c.label}</td>
              <td class="td-status ${
                c.status === 'Hoạt động'
                  ? 'status-pass'
                  : c.status === 'Lỗi'
                  ? 'status-fail'
                  : 'status-na'
              }">${c.status}</td>
            </tr>`
            )
            .join('')}
        </table>
        ${order.testNote ? `<div class="k80-test-note"><b>Ghi chú:</b> ${order.testNote}</div>` : ''}
      </div>`
      : '';

  const slipTitle = isRoutingSlip
    ? 'PHIẾU ĐIỀU PHỐI / TEM KHAY KỸ THUẬT'
    : 'PHIẾU TIẾP NHẬN SỬA CHỮA';

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>${order.id} - In nhiệt K80</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 2mm 3mm 5mm 3mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      width: 74mm;
      max-width: 74mm;
      margin: 0 auto;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .k80-wrapper {
      padding: 2mm 1mm;
    }
    .k80-header {
      text-align: center;
      border-bottom: 1.5px dashed #000000;
      padding-bottom: 6px;
      margin-bottom: 6px;
    }
    .k80-brand {
      font-size: 16px;
      font-weight: 900;
      letter-spacing: -0.5px;
      margin: 4px 0 2px 0;
    }
    .k80-subtitle {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .k80-branch-info {
      font-size: 9.5px;
      color: #222222;
      margin-top: 3px;
      line-height: 1.25;
    }
    .k80-order-box {
      text-align: center;
      margin: 6px 0;
      padding: 5px 0;
      background: #f4f4f4;
      border: 1px solid #000000;
      border-radius: 4px;
    }
    .k80-order-code {
      font-size: 17px;
      font-weight: 900;
      font-family: "Courier New", Courier, monospace;
      letter-spacing: 1px;
    }
    .k80-barcode {
      display: flex;
      justify-content: center;
      margin-top: 4px;
    }
    .k80-barcode svg {
      max-width: 90%;
      height: 32px;
    }
    .k80-meta {
      font-size: 9px;
      display: flex;
      justify-content: space-between;
      margin: 4px 0 6px 0;
      padding: 0 2px;
      border-bottom: 1px dotted #888888;
      padding-bottom: 4px;
    }
    .k80-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin: 3px 0;
      font-size: 10.5px;
    }
    .k80-label {
      color: #333333;
      flex-shrink: 0;
      width: 25mm;
      font-weight: normal;
    }
    .k80-val {
      font-weight: 700;
      text-align: right;
      flex-grow: 1;
      word-break: break-word;
    }
    .k80-section {
      margin-top: 6px;
      padding-top: 5px;
      border-top: 1px dashed #444444;
    }
    .k80-section-title {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .k80-issue-box {
      background: #fafafa;
      border: 1px solid #cccccc;
      padding: 5px;
      font-size: 10.5px;
      line-height: 1.3;
      border-radius: 3px;
      word-break: break-word;
    }
    .k80-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
      margin-top: 2px;
    }
    .k80-table td {
      padding: 2px 3px;
      border-bottom: 1px dotted #dddddd;
    }
    .td-label {
      width: 65%;
      color: #222222;
    }
    .td-status {
      width: 35%;
      text-align: right;
      font-weight: 700;
    }
    .status-pass {
      color: #000000;
    }
    .status-fail {
      color: #000000;
      text-decoration: underline;
    }
    .k80-test-note {
      font-size: 9px;
      margin-top: 3px;
      font-style: italic;
    }
    .k80-price-box {
      margin-top: 7px;
      padding: 6px;
      border: 1.5px solid #000000;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fbfbfb;
    }
    .k80-price-title {
      font-size: 10.5px;
      font-weight: 700;
    }
    .k80-price-amount {
      font-size: 15px;
      font-weight: 900;
    }
    .k80-qr-wrapper {
      text-align: center;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px dashed #444444;
    }
    .k80-qr-box {
      display: inline-block;
      width: 25mm;
      height: 25mm;
      margin: 0 auto;
    }
    .k80-qr-box svg {
      width: 100%;
      height: 100%;
    }
    .k80-qr-hint {
      font-size: 8.5px;
      font-weight: 600;
      margin-top: 3px;
      color: #333333;
    }
    .k80-signatures {
      display: flex;
      justify-content: space-between;
      text-align: center;
      margin-top: 8px;
      padding-top: 4px;
      font-size: 9.5px;
    }
    .k80-sig-col {
      width: 48%;
    }
    .k80-sig-space {
      height: 28px;
    }
    .k80-footer-note {
      text-align: center;
      font-size: 8px;
      color: #555555;
      margin-top: 6px;
      line-height: 1.25;
      border-top: 1px dotted #888888;
      padding-top: 4px;
    }
    .k80-feed-spacer {
      height: 18mm;
      display: block;
    }
  </style>
</head>
<body>
  <div class="k80-wrapper">
    <div class="k80-header">
      <div style="display: flex; justify-content: center; align-items: center; gap: 6px;">
        ${FIXO_LOGO_SVG}
        <div style="text-align: left;">
          <div class="k80-brand">FIXO REPAIR OS</div>
          <div class="k80-subtitle">${slipTitle}</div>
        </div>
      </div>
      <div class="k80-branch-info">
        <b>Chi nhánh:</b> ${order.branch || 'FIXO Store'}
      </div>
      <div class="k80-branch-info">
        <b>Hotline CSKH:</b> 1900.6868 · fixo.vn
      </div>
    </div>

    <div class="k80-order-box">
      <div style="font-size: 8.5px; font-weight: bold; color: #555555; text-transform: uppercase;">MÃ PHIẾU TIẾP NHẬN</div>
      <div class="k80-order-code">${order.id}</div>
      <div class="k80-barcode">
        ${barcodeSvg}
      </div>
    </div>

    <div class="k80-meta">
      <span>Ngày nhận: <b>${order.date || 'Hôm nay'}</b></span>
      <span>NV: <b>${order.createdBy || 'FIXO'}</b></span>
    </div>

    <div class="k80-section" style="border-top: none; margin-top: 0; padding-top: 0;">
      <div class="k80-row">
        <span class="k80-label">Khách hàng:</span>
        <span class="k80-val">${order.name || 'Khách lẻ'}</span>
      </div>
      <div class="k80-row">
        <span class="k80-label">Số điện thoại:</span>
        <span class="k80-val">${order.phone || '—'}</span>
      </div>
      <div class="k80-row">
        <span class="k80-label">Thiết bị:</span>
        <span class="k80-val">${order.device || 'Thiết bị Apple'}</span>
      </div>
      <div class="k80-row">
        <span class="k80-label">Serial / Model:</span>
        <span class="k80-val">${order.serial || 'Chưa cập nhật'}</span>
      </div>
      <div class="k80-row">
        <span class="k80-label">Phụ kiện:</span>
        <span class="k80-val">${order.accessories || 'Không gửi kèm'}</span>
      </div>
      ${order.appearance ? `
      <div class="k80-row">
        <span class="k80-label">Ngoại hình:</span>
        <span class="k80-val">${order.appearance}</span>
      </div>` : ''}
    </div>

    <div class="k80-section">
      <div class="k80-section-title">LỖI KHÁCH BÁO TIẾP NHẬN</div>
      <div class="k80-issue-box">${order.issue || 'Kiểm tra tổng quát'}</div>
    </div>

    ${checksHtml}

    <div class="k80-price-box">
      <div>
        <div class="k80-price-title">GIÁ DỰ KIẾN:</div>
        ${order.priceNote ? `<div style="font-size: 8px; color: #555555;">(${order.priceNote})</div>` : ''}
      </div>
      <div class="k80-price-amount">${formatMoney(order.price)}</div>
    </div>

    <div class="k80-qr-wrapper">
      <div class="k80-qr-box">
        ${qrCodeSvg}
      </div>
      <div class="k80-qr-hint">Quét mã QR để theo dõi tiến độ sửa chữa realtime</div>
    </div>

    <div class="k80-signatures">
      <div class="k80-sig-col">
        <b>KHÁCH HÀNG</b>
        <div class="k80-sig-space"></div>
        <div style="font-weight: 600;">${order.name || ''}</div>
      </div>
      <div class="k80-sig-col">
        <b>TIẾP NHẬN</b>
        <div class="k80-sig-space"></div>
        <div style="font-weight: 600;">${order.createdBy || 'FIXO'}</div>
      </div>
    </div>

    <div class="k80-footer-note">
      * Quý khách vui lòng giữ phiếu này để đối chiếu khi nhận máy.<br />
      Cảm ơn quý khách đã tin tưởng dịch vụ FIXO Care!
    </div>

    <div class="k80-feed-spacer"></div>
  </div>
</body>
</html>`;
}
