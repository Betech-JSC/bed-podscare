/**
 * thermalK80Template.ts
 * Module tạo mã HTML độc lập cho máy in nhiệt cuộn 80mm (K80).
 * 100% TypeScript thuần, không chứa React JSX, tương thích hoàn toàn với Node.js test runner.
 */

import type { RepairOrder } from '@podscare/types';
import { generateBarcodeSVG, generateQRCodeSVG } from './BarcodeQRUtils';

export const FIXO_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="36" height="36">
  <rect width="100" height="100" rx="20" fill="#000000" />
  <path d="M28 26h44v13H43v13h25v12H43v22H28V26z" fill="#ffffff" />
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
