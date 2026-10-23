/**
 * thermalK80HtmlBuilder.ts
 * Module tạo mã HTML độc lập cho máy in nhiệt cuộn 80mm (K80).
 * Hỗ trợ in 2 liên tự động ngắt trang (Auto-Cut) cho máy in POS (Xprinter, Epson...).
 * Liên 1: Bản giao khách hàng (đầy đủ bảng checklist, giá dự kiến, mã QR tra cứu realtime, chữ ký).
 * Liên 2: Bản lưu cửa hàng & Kỹ thuật dán khay (bảo mật tuyệt đối giá tiền, mã phiếu to rõ, barcode).
 * 100% TypeScript thuần, không chứa React JSX, tương thích hoàn toàn với Node.js test runner.
 */

import type { RepairOrder } from '@podscare/types';
import {
  extractOrderDisplaySuffix,
  generateBarcodeSVG,
  generateQRCodeSVG,
  FIXO_LOGO_SVG,
  FIXO_LOGO_A4_SVG,
} from './BarcodeQRUtils.ts';

export { FIXO_LOGO_SVG, FIXO_LOGO_A4_SVG };

export function formatMoney(n?: number): string {
  if (!n) return '—';
  return new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
}

export function formatOrderTypeLabel(order: any, price?: number): string {
  const type = order?.order_type || order?.orderType;
  if (type === 'warranty') {
    const p = price !== undefined ? price : (order?.total_price ?? order?.price ?? 0);
    const pStr = p > 0 ? (new Intl.NumberFormat('vi-VN').format(p) + ' ₫') : '0 ₫';
    return `LOẠI ĐƠN: TIẾP NHẬN BẢO HÀNH (${pStr})`;
  }
  if (type === 'cod') {
    return 'LOẠI ĐƠN: ĐƠN COD (KHÁCH TỈNH)';
  }
  return 'LOẠI ĐƠN: ĐƠN TẠI CỬA HÀNG';
}

export function formatMultiOrderTypeLabel(orders: any[]): string {
  const hasWarranty = orders.some(o => (o as any).order_type === 'warranty' || (o as any).orderType === 'warranty');
  const hasCod = orders.some(o => (o as any).order_type === 'cod' || (o as any).orderType === 'cod');
  if (hasWarranty) {
    const totalWPrice = orders.reduce((sum, o) => {
      if ((o as any).order_type === 'warranty' || (o as any).orderType === 'warranty') {
        return sum + (Number((o as any).total_price ?? o.price) || 0);
      }
      return sum;
    }, 0);
    const pStr = totalWPrice > 0 ? (new Intl.NumberFormat('vi-VN').format(totalWPrice) + ' ₫') : '0 ₫';
    return `LOẠI ĐƠN: TIẾP NHẬN BẢO HÀNH (${pStr})`;
  }
  if (hasCod) {
    return 'LOẠI ĐƠN: ĐƠN COD (KHÁCH TỈNH)';
  }
  return 'LOẠI ĐƠN: ĐƠN TẠI CỬA HÀNG';
}

export type ThermalK80SlipMode = 'dual' | 'customer_only' | 'store_only' | 'routing';
export type K80SlipMode = ThermalK80SlipMode;

export interface TenantReceiptBranding {
  logoUrl?: string | null;
  storeLogoUrl?: string | null;
  storeName?: string;
  hotline?: string | null;
  storeHotline?: string | null;
  footerNote?: string | null;
  receiptFooterNote?: string | null;
  bankCode?: string | null;
  bankAccountNumber?: string | null;
  bankAccountHolder?: string | null;
}

export interface ThermalK80RenderOptions {
  origin?: string;
  isRoutingSlip?: boolean;
  slipMode?: ThermalK80SlipMode; // Mặc định là 'dual'
  branding?: TenantReceiptBranding;
}

/**
 * Xây dựng nội dung Liên 1: Bản giao khách hàng giữ (Customer Copy).
 * Chứa logo FIXO, chi nhánh, hotline, barcode, thông tin khách, thiết bị,
 * bảng kiểm tra tại quầy, giá dự kiến, mã QR tra cứu realtime, 2 chữ ký và lưu ý bảo hành.
 * Cuối liên có đệm đẩy giấy 15mm và vạch chỉ dẫn cắt giấy.
 */
export function buildCustomerCopyHtml(order: RepairOrder, origin?: string, branding?: TenantReceiptBranding): string {
  const currentOrigin =
    origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://fixo.com.vn');
  const trackUrl = `${currentOrigin}/track/${order.id}`;

  const effectiveLogoUrl = branding?.logoUrl || branding?.storeLogoUrl || (order as any).tenant?.logo_url;
  const effectiveStoreName = branding?.storeName || (order as any).tenant?.name || 'FIXO REPAIR OS';
  const effectiveBranch = order.branch || branding?.storeName || (order as any).tenant?.name || 'FIXO Store';
  const effectiveHotline = branding?.hotline || branding?.storeHotline || (order as any).tenant?.hotline || '1900.6868 · fixo.vn';
  const effectiveFooterNote = branding?.footerNote || branding?.receiptFooterNote || (order as any).tenant?.receipt_footer_note || '* Quý khách vui lòng giữ phiếu này để đối chiếu khi nhận máy.<br />Cảm ơn quý khách đã tin tưởng dịch vụ FIXO Care!';

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
  const testNoteVal = ((order.testNote || (order as any).test_note || '') as string).trim();
  const checksHtml =
    (checks.length > 0 || Boolean(testNoteVal))
      ? `
      <div class="k80-section">
        <div class="k80-section-title">KIỂM TRA CHỨC NĂNG TẠI QUẦY</div>
        ${checks.length > 0 ? `
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
        </table>` : ''}
        ${testNoteVal ? `<div class="k80-test-note"><b>Ghi chú test tại quầy:</b> ${testNoteVal}</div>` : ''}
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

  return `<div class="k80-wrapper k80-customer-copy">
    <div class="k80-header">
      ${effectiveLogoUrl ? `
      <div style="text-align: center; margin-bottom: 3px;">
        <img src="${effectiveLogoUrl}" class="k80-store-logo" alt="Logo" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-block';" />
        <div class="k80-logo-fallback" style="display: none;">${FIXO_LOGO_SVG}</div>
      </div>
      <div class="k80-brand">${effectiveStoreName}</div>
      <div class="k80-subtitle">PHIẾU TIẾP NHẬN SỬA CHỮA · LIÊN KHÁCH HÀNG</div>
      ` : `
      <div style="display: flex; justify-content: center; align-items: center; gap: 6px;">
        ${FIXO_LOGO_SVG}
        <div style="text-align: left;">
          <div class="k80-brand">${effectiveStoreName}</div>
          <div class="k80-subtitle">PHIẾU TIẾP NHẬN SỬA CHỮA · LIÊN KHÁCH HÀNG</div>
        </div>
      </div>
      `}
      <div class="k80-branch-info">
        <b>Chi nhánh:</b> ${effectiveBranch}
      </div>
      <div class="k80-branch-info">
        <b>Hotline CSKH:</b> ${effectiveHotline}
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
      <div style="font-weight: bold; font-size: 11px; margin: 4px 0;">${formatOrderTypeLabel(order, finalPriceVal)}</div>
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

    ${(hasAdditional || discountAmount > 0) ? `
    <div class="k80-section" style="margin-top: 4px; padding-top: 3px; border-top: 1px dashed #000;">
      <div class="k80-section-title" style="font-size: 9px; font-weight: 800;">BẢNG KÊ DỊCH VỤ & CHI PHÍ:</div>
      <div style="display: flex; justify-content: space-between; font-size: 9px; padding: 1.5px 0;">
        <span>• Tiếp nhận ban đầu:</span>
        <span style="font-weight: 600;">${formatMoney(initialPriceVal)}</span>
      </div>
      ${additionalServices.map((srv: any) => `
      <div style="display: flex; justify-content: space-between; font-size: 9px; padding: 1.5px 0;">
        <span>• [Thêm] ${srv.name}:</span>
        <span style="font-weight: 600;">+${formatMoney(srv.price)}</span>
      </div>`).join('')}
      ${discountAmount > 0 ? `
      <div style="display: flex; justify-content: space-between; font-size: 9px; padding: 1.5px 0; font-weight: 700;">
        <span>• Giảm giá:</span>
        <span>-${formatMoney(discountAmount)}</span>
      </div>` : ''}
    </div>` : ''}

    <div class="k80-price-box">
      <div>
        <div class="k80-price-title">${discountAmount > 0 ? 'TỔNG THỰC THU:' : (hasAdditional ? 'TỔNG CỘNG THANH TOÁN:' : 'GIÁ DỰ KIẾN:')}</div>
        ${order.priceNote ? `<div style="font-size: 8px; color: #555555;">(${order.priceNote})</div>` : ''}
      </div>
      <div class="k80-price-amount">${formatMoney(finalPriceVal)}</div>
    </div>

    <div class="k80-warranty-badge" style="margin-top: 6px; padding: 4px 6px; border: 1px dashed #444444; border-radius: 4px; background: #fafafa; font-size: 8.5px; line-height: 1.25; color: #222222;">
      <div style="font-size: 9.5px; font-weight: 800; color: #000000; text-align: center; text-transform: uppercase;">BẢO HÀNH ĐIỆN TỬ: ${warrantyMonths} THÁNG</div>
      <div style="font-size: 8.5px; font-weight: bold; margin-top: 2px; color: #176b58; text-align: center;">Thời hạn bảo hành: ${warrantyMonths} tháng (Đến ngày ${formattedExpiryDate})</div>
      <div style="font-size: 8px; color: #444444; margin-top: 4px; border-top: 1px dotted #cccccc; padding-top: 3px; text-align: left;">
        <div style="font-weight: 800; text-align: center; margin-bottom: 2px; text-transform: uppercase;">ĐIỀU KHOẢN & CHÍNH SÁCH BẢO HÀNH</div>
        <div style="margin-bottom: 1.5px;">• <b>Tem niêm phong:</b> Thiết bị còn nguyên tem PodsCare, không có dấu hiệu tẩy xóa, rách rời.</div>
        <div style="margin-bottom: 1.5px;">• <b>Từ chối bảo hành:</b> Rơi vỡ, cấn móp, biến dạng vật lý hoặc chất lỏng/nước xâm nhập.</div>
        <div style="margin-bottom: 1.5px;">• <b>Phạm vi:</b> Chỉ bảo hành đúng linh kiện & chức năng thay thế/sửa chữa ghi trên phiếu.</div>
        <div>• <b>Tra cứu:</b> Tra cứu bảo hành điện tử bằng SĐT hoặc quét mã QR bên dưới.</div>
      </div>
    </div>

    <div class="k80-qr-wrapper">
      <div class="k80-qr-box" data-track-url="${trackUrl}">
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
      ${effectiveFooterNote}
    </div>
    <div class="k80-powered-by" style="font-size: 8px; color: #666; margin-top: 4px; text-align: center;">Powered by FIXO Repair OS · fixo.vn</div>

    <div class="k80-feed-spacer"></div>
    <div class="k80-cut-line">✂ - - - - - CẮT GIẤY - - - - - ✂</div>
  </div>`;
}

/**
 * Xây dựng nội dung Liên 2: Bản lưu cửa hàng & Kỹ thuật dán khay (Store Copy).
 * Thiết kế gọn nhẹ, tối ưu dán khay linh kiện:
 * - Header nhận diện bản lưu cửa hàng và tem khay kỹ thuật.
 * - Mã phiếu to đậm (font-size 18-20px) kèm Barcode Code 128 (cao 24px) dễ quét.
 * - Thông tin khách hàng, số điện thoại, thiết bị, phụ kiện, ngoại hình.
 * - Ô nổi bật BỆNH MÁY TIẾP NHẬN viền đậm, font 12px bold.
 * - Vùng ghi chú viết tay cho KTV: Khay số và Tên Kỹ thuật viên.
 * - TUYỆT ĐỐI KHÔNG CHỨA: Giá tiền, mã QR tra cứu, chữ ký khách và cam kết bảo hành.
 * - Cuối liên có đệm đẩy giấy 18mm để máy in cắt trọn vẹn không sót mép giấy.
 */
export function buildStoreCopyHtml(order: RepairOrder, branding?: TenantReceiptBranding): string {
  const effectiveStoreName = branding?.storeName || (order as any).tenant?.name || 'FIXO REPAIR OS';
  const barcodeSvgStore = generateBarcodeSVG(order.id, {
    height: 24,
    barWidth: 1.35,
    showText: false,
  });

  const checks = Array.isArray(order.checks) ? order.checks : [];
  const testNoteVal = ((order.testNote || (order as any).test_note || '') as string).trim();
  const checksHtml =
    (checks.length > 0 || Boolean(testNoteVal))
      ? `
      <div class="k80-section">
        <div class="k80-section-title">TEST TẠI QUẦY</div>
        ${checks.length > 0 ? `
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
        </table>` : ''}
        ${testNoteVal ? `<div class="k80-test-note"><b>Ghi chú test tại quầy:</b> ${testNoteVal}</div>` : ''}
      </div>`
      : '';

  return `<div class="k80-wrapper k80-store-copy">
    <div class="k80-store-header">${effectiveStoreName} · BẢN LƯU CỬA HÀNG & KỸ THUẬT</div>
    <div class="k80-store-title">PHIẾU ĐIỀU PHỐI / TEM KHAY KỸ THUẬT</div>
    <div class="k80-store-sub">Chi nhánh: ${order.branch || 'FIXO Store'} · Ngày: ${order.date || 'Hôm nay'} · NV: ${order.createdBy || 'FIXO'}</div>

    <div class="k80-order-box k80-store-order-box">
      <div style="font-size: 8.5px; font-weight: bold; color: #555555; text-transform: uppercase;">MÃ PHIẾU TIẾP NHẬN</div>
      <div class="k80-order-code k80-store-order-code">${order.id}</div>
      <div class="k80-barcode">
        ${barcodeSvgStore}
      </div>
    </div>

    <div class="k80-section" style="border-top: none; margin-top: 0; padding-top: 0;">
      <div class="k80-row">
        <span class="k80-label">Khách hàng:</span>
        <span class="k80-val">${order.name || 'Khách lẻ'} - ${order.phone || '—'}</span>
      </div>
      <div style="font-weight: bold; font-size: 11px; margin: 4px 0;">${formatOrderTypeLabel(order)}</div>
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
      <div class="k80-section-title">BỆNH MÁY TIẾP NHẬN</div>
      <div class="k80-store-issue-box">${order.issue || 'Kiểm tra tổng quát'}</div>
    </div>

    ${checksHtml}

    <div class="k80-handwrite-box">
      Khay số: [ ..... ] | Kỹ Thuật: [ .......... ]
    </div>

    <div class="k80-feed-spacer end"></div>
  </div>`;
}

/**
 * Xây dựng nội dung Liên 1 Gộp: Bản giao khách hàng cho đợt tiếp nhận nhiều thiết bị.
 * Hiển thị đầy đủ danh sách thiết bị [1], [2]..., giá từng máy và khối tổng cộng tiếp nhận.
 */
export function buildCombinedCustomerCopyHtml(
  orders: RepairOrder[],
  origin?: string,
  branding?: TenantReceiptBranding
): string {
  const primaryOrder = orders[0];
  const currentOrigin =
    origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://fixo.com.vn');
  const trackUrl = `${currentOrigin}/track/${primaryOrder.id}`;

  const effectiveLogoUrl = branding?.logoUrl || branding?.storeLogoUrl || (primaryOrder as any).tenant?.logo_url;
  const effectiveStoreName = branding?.storeName || (primaryOrder as any).tenant?.name || 'FIXO REPAIR OS';
  const effectiveBranch = primaryOrder.branch || branding?.storeName || (primaryOrder as any).tenant?.name || 'FIXO Store';
  const effectiveHotline = branding?.hotline || branding?.storeHotline || (primaryOrder as any).tenant?.hotline || '1900.6868 · fixo.vn';
  const effectiveFooterNote = branding?.footerNote || branding?.receiptFooterNote || (primaryOrder as any).tenant?.receipt_footer_note || '* Quý khách vui lòng giữ phiếu này để đối chiếu khi nhận máy.<br />Cảm ơn quý khách đã tin tưởng dịch vụ FIXO Care!';

  const batchCode = primaryOrder.intake_batch_code || `IB26-${orders.map((o) => extractOrderDisplaySuffix(o.id)).join('-')}`;
  const barcodeSvg = generateBarcodeSVG(primaryOrder.intake_batch_code || primaryOrder.id, {
    height: 36,
    barWidth: 1.35,
    showText: false,
  });

  const qrCodeSvg = generateQRCodeSVG(trackUrl, {
    size: 96,
    margin: 1,
  });

  const totalPrice = orders.reduce((sum, o) => sum + (Number((o as any).total_price || o.price) || 0), 0);
  const allOrderCodes = orders.map((o) => o.id).join(', ');

  const warrantyDays = primaryOrder.warranty_terms_days
    || (primaryOrder.warranty_months ? (primaryOrder.warranty_months === 12 ? 365 : primaryOrder.warranty_months * 30) : null)
    || 90;
  const warrantyMonths = primaryOrder.warranty_months
    || (warrantyDays === 365 ? 12 : Math.round(warrantyDays / 30))
    || 3;

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + warrantyDays);
  const formattedExpiryDate = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(expiryDate);

  const devicesHtml = orders
    .map((dev, idx) => {
      const checks = Array.isArray(dev.checks) ? dev.checks : [];
      const failChecks = checks.filter((c) => c.status === 'Lỗi');

      return `
      <div class="k80-combined-device" style="margin: 5px 0 7px 0; padding: 5px 6px; border: 1px dashed #555555; border-radius: 4px; background: #fafafa;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dotted #bbbbbb; padding-bottom: 3px; margin-bottom: 3px;">
          <span style="font-weight: 700; font-size: 11.5px; color: #000000;">[${idx + 1}] ${dev.device || 'Thiết bị Apple'}</span>
          <span style="font-size: 9.5px; font-family: monospace; font-weight: 700; color: #333333;">${dev.id}</span>
        </div>
        <div class="k80-row" style="margin: 1.5px 0;">
          <span class="k80-label" style="width: 22mm;">Serial:</span>
          <span class="k80-val">${dev.serial || 'Chưa cập nhật'}</span>
        </div>
        <div class="k80-row" style="margin: 1.5px 0;">
          <span class="k80-label" style="width: 22mm;">Phụ kiện:</span>
          <span class="k80-val">${dev.accessories || 'Không gửi kèm'}</span>
        </div>
        <div class="k80-row" style="margin: 1.5px 0;">
          <span class="k80-label" style="width: 22mm;">Lỗi khách báo:</span>
          <span class="k80-val" style="color: #000000; font-weight: 700;">${dev.issue || 'Kiểm tra tổng quát'}</span>
        </div>
        ${dev.appearance ? `
        <div class="k80-row" style="margin: 1.5px 0;">
          <span class="k80-label" style="width: 22mm;">Ngoại hình:</span>
          <span class="k80-val">${dev.appearance}</span>
        </div>` : ''}
        ${checks.length > 0 ? `
        <div style="font-size: 9px; margin-top: 2px; color: #444444;">
          Test quầy: ${failChecks.length > 0 ? `<b style="color: #000; text-decoration: underline;">Lỗi (${failChecks.length}): ${failChecks.map((f) => f.label).join(', ')}</b>` : 'Tất cả chức năng cơ bản đạt'}
        </div>` : ''}
        ${(dev.testNote || (dev as any).test_note) ? `<div class="k80-test-note" style="margin-top: 2px;"><b>Ghi chú test tại quầy:</b> ${dev.testNote || (dev as any).test_note}</div>` : ''}
        ${((dev as any).additional_services?.length || (dev as any).additionalServices?.length) ? `
        <div style="font-size: 8.5px; color: #444; margin-top: 2px; padding: 2px 0; border-top: 1px dotted #ddd;">
          <span style="font-weight: 700;">Dịch vụ làm thêm:</span>
          ${((dev as any).additional_services || (dev as any).additionalServices).map((s: any) => `
            <div style="display: flex; justify-content: space-between; padding: 1px 0;">
              <span>+ ${s.name}:</span>
              <b>+${formatMoney(s.price)}</b>
            </div>`).join('')}
        </div>` : ''}
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding-top: 3px; border-top: 1px dotted #cccccc;">
          <span style="font-size: 9.5px; font-weight: 700;">Chi phí máy [${idx + 1}]:</span>
          <span style="font-size: 12px; font-weight: 700; color: #000000;">${formatMoney((dev as any).total_price || dev.price)}</span>
        </div>
      </div>`;
    })
    .join('');

  return `<div class="k80-wrapper k80-customer-copy">
    <div class="k80-header">
      ${effectiveLogoUrl ? `
      <div style="text-align: center; margin-bottom: 3px;">
        <img src="${effectiveLogoUrl}" class="k80-store-logo" alt="Logo" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-block';" />
        <div class="k80-logo-fallback" style="display: none;">${FIXO_LOGO_SVG}</div>
      </div>
      <div class="k80-brand">${effectiveStoreName}</div>
      <div class="k80-subtitle">PHIẾU TIẾP NHẬN SỬA CHỮA · LIÊN KHÁCH HÀNG</div>
      <div style="font-size: 9px; font-weight: 800; color: #176b58; margin-top: 1px;">(ĐỢT TIẾP NHẬN GỘP ${orders.length} THIẾT BỊ)</div>
      ` : `
      <div style="display: flex; justify-content: center; align-items: center; gap: 6px;">
        ${FIXO_LOGO_SVG}
        <div style="text-align: left;">
          <div class="k80-brand">${effectiveStoreName}</div>
          <div class="k80-subtitle">PHIẾU TIẾP NHẬN SỬA CHỮA · LIÊN KHÁCH HÀNG</div>
          <div style="font-size: 9px; font-weight: 800; color: #176b58; margin-top: 1px;">(ĐỢT TIẾP NHẬN GỘP ${orders.length} THIẾT BỊ)</div>
        </div>
      </div>
      `}
      <div class="k80-branch-info">
        <b>Chi nhánh:</b> ${effectiveBranch}
      </div>
      <div class="k80-branch-info">
        <b>Hotline CSKH:</b> ${effectiveHotline}
      </div>
    </div>

    <div class="k80-order-box">
      <div style="font-size: 8.5px; font-weight: bold; color: #555555; text-transform: uppercase;">MÃ ĐỢT TIẾP NHẬN GỘP</div>
      <div class="k80-order-code">${batchCode}</div>
      <div class="k80-barcode">
        ${barcodeSvg}
      </div>
      <div style="font-size: 8.5px; color: #444444; margin-top: 3px; padding: 0 4px;">
        Mã phiếu: <b>${allOrderCodes}</b>
      </div>
    </div>

    <div class="k80-meta">
      <span>Ngày nhận: <b>${primaryOrder.date || 'Hôm nay'}</b></span>
      <span>NV: <b>${primaryOrder.createdBy || 'FIXO'}</b></span>
    </div>

    <div class="k80-section" style="border-top: none; margin-top: 0; padding-top: 0;">
      <div class="k80-row">
        <span class="k80-label">Khách hàng:</span>
        <span class="k80-val">${primaryOrder.name || 'Khách lẻ'}</span>
      </div>
      <div class="k80-row">
        <span class="k80-label">Số điện thoại:</span>
        <span class="k80-val">${primaryOrder.phone || '—'}</span>
      </div>
      <div style="font-weight: bold; font-size: 11px; margin: 4px 0;">${formatMultiOrderTypeLabel(orders)}</div>
      <div class="k80-row">
        <span class="k80-label">Số lượng máy:</span>
        <span class="k80-val"><b>${orders.length} thiết bị</b></span>
      </div>
    </div>

    <div class="k80-section" style="margin-top: 4px; padding-top: 4px;">
      <div class="k80-section-title" style="font-weight: 800;">DANH SÁCH THIẾT BỊ (${orders.length} MÁY)</div>
      ${devicesHtml}
    </div>

    <div class="k80-price-box" style="margin-top: 7px; padding: 7px 8px; border: 2px solid #000000; background: #fbfbfb;">
      <div>
        <div class="k80-price-title" style="font-size: 11px;">TỔNG CỘNG TIẾP NHẬN:</div>
        <div style="font-size: 8.5px; color: #555555;">(${orders.length} thiết bị gửi sửa)</div>
      </div>
      <div class="k80-price-amount" style="font-size: 16px; font-weight: 700; color: #000000;">${formatMoney(totalPrice)}</div>
    </div>

    <div class="k80-warranty-badge" style="margin-top: 6px; padding: 4px 6px; border: 1px dashed #444444; border-radius: 4px; background: #fafafa; font-size: 8.5px; line-height: 1.25; color: #222222;">
      <div style="font-size: 9.5px; font-weight: 800; color: #000000; text-align: center; text-transform: uppercase;">BẢO HÀNH ĐIỆN TỬ: ${warrantyMonths} THÁNG</div>
      <div style="font-size: 8.5px; font-weight: bold; margin-top: 2px; color: #176b58; text-align: center;">Thời hạn bảo hành: ${warrantyMonths} tháng (Đến ngày ${formattedExpiryDate})</div>
      <div style="font-size: 8px; color: #444444; margin-top: 4px; border-top: 1px dotted #cccccc; padding-top: 3px; text-align: left;">
        <div style="font-weight: 800; text-align: center; margin-bottom: 2px; text-transform: uppercase;">ĐIỀU KHOẢN VÀ CHÍNH SÁCH BẢO HÀNH TIÊU CHUẨN</div>
        <div style="margin-bottom: 1.5px;">• <b>Tem niêm phong:</b> Thiết bị còn nguyên tem PodsCare, không có dấu hiệu tẩy xóa, rách rời.</div>
        <div style="margin-bottom: 1.5px;">• <b>Từ chối bảo hành:</b> Rơi vỡ, cấn móp, biến dạng vật lý hoặc chất lỏng/nước xâm nhập.</div>
        <div style="margin-bottom: 1.5px;">• <b>Phạm vi:</b> Chỉ bảo hành đúng linh kiện & chức năng thay thế/sửa chữa ghi trên phiếu.</div>
        <div>• <b>Tra cứu:</b> Tra cứu bảo hành điện tử bằng SĐT hoặc quét mã QR bên dưới.</div>
      </div>
    </div>

    <div class="k80-qr-wrapper">
      <div class="k80-qr-box" data-track-url="${trackUrl}">
        ${qrCodeSvg}
      </div>
      <div class="k80-qr-hint">Quét mã QR để theo dõi tiến độ sửa chữa realtime</div>
    </div>

    <div class="k80-signatures">
      <div class="k80-sig-col">
        <b>KHÁCH HÀNG</b>
        <div class="k80-sig-space"></div>
        <div style="font-weight: 600;">${primaryOrder.name || ''}</div>
      </div>
      <div class="k80-sig-col">
        <b>TIẾP NHẬN</b>
        <div class="k80-sig-space"></div>
        <div style="font-weight: 600;">${primaryOrder.createdBy || 'FIXO'}</div>
      </div>
    </div>

    <div class="k80-footer-note">
      ${effectiveFooterNote}
    </div>
    <div class="k80-powered-by" style="font-size: 8px; color: #666; margin-top: 4px; text-align: center;">Powered by FIXO Repair OS · fixo.vn</div>

    <div class="k80-feed-spacer"></div>
    <div class="k80-cut-line">✂ - - - - - CẮT GIẤY - - - - - ✂</div>
  </div>`;
}

/**
 * Xây dựng nội dung Liên 2 Gộp: Bản lưu cửa hàng & Kỹ thuật dán khay cho đợt tiếp nhận nhiều thiết bị.
 * Liệt kê tất cả các máy trong đợt để thủ kho/kỹ thuật kẹp khay đối soát.
 */
export function buildCombinedStoreCopyHtml(orders: RepairOrder[], branding?: TenantReceiptBranding): string {
  const primaryOrder = orders[0];
  const effectiveStoreName = branding?.storeName || (primaryOrder as any).tenant?.name || 'FIXO REPAIR OS';
  const batchCode = primaryOrder.intake_batch_code || `IB26-${orders.map((o) => extractOrderDisplaySuffix(o.id)).join('-')}`;
  const barcodeSvgStore = generateBarcodeSVG(primaryOrder.intake_batch_code || primaryOrder.id, {
    height: 24,
    barWidth: 1.35,
    showText: false,
  });
  const allOrderCodes = orders.map((o) => o.id).join(', ');

  const devicesHtml = orders
    .map((dev, idx) => {
      const checks = Array.isArray(dev.checks) ? dev.checks : [];
      return `
      <div style="margin: 4px 0 6px 0; padding: 4px 5px; border: 1.5px solid #000000; border-radius: 4px; background: #ffffff;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #000000; padding-bottom: 2px; margin-bottom: 3px;">
          <span style="font-weight: 800; font-size: 11px;">[${idx + 1}] ${dev.id}</span>
          <span style="font-weight: 700; font-size: 10.5px;">${dev.device || 'Thiết bị Apple'}</span>
        </div>
        <div class="k80-row" style="margin: 1px 0;">
          <span class="k80-label" style="width: 20mm;">Serial:</span>
          <span class="k80-val">${dev.serial || 'Chưa cập nhật'}</span>
        </div>
        <div class="k80-row" style="margin: 1px 0;">
          <span class="k80-label" style="width: 20mm;">Phụ kiện:</span>
          <span class="k80-val">${dev.accessories || 'Không gửi kèm'}</span>
        </div>
        <div style="font-size: 9.5px; margin: 2px 0;">
          <b>Bệnh máy:</b> <span style="font-weight: 700;">${dev.issue || 'Kiểm tra'}</span>
        </div>
        ${checks.length > 0 ? `
        <div style="font-size: 8.5px; color: #333333;">
          Kiểm tra quầy: ${checks.map((c) => `${c.label}: ${c.status}`).join(' | ')}
        </div>` : ''}
        <div class="k80-handwrite-box" style="margin-top: 3px; padding: 3px; font-size: 9px;">
          Khay số: [ ..... ] | Kỹ Thuật: [ .......... ]
        </div>
      </div>`;
    })
    .join('');

  return `<div class="k80-wrapper k80-store-copy">
    <div class="k80-store-header">${effectiveStoreName} · BẢN LƯU CỬA HÀNG & KỸ THUẬT</div>
    <div class="k80-store-title">PHIẾU ĐIỀU PHỐI / BẢN LƯU GỘP (${orders.length} THIẾT BỊ)</div>
    <div class="k80-store-sub">Chi nhánh: ${primaryOrder.branch || 'FIXO Store'} · Ngày: ${primaryOrder.date || 'Hôm nay'} · NV: ${primaryOrder.createdBy || 'FIXO'}</div>

    <div class="k80-order-box k80-store-order-box">
      <div style="font-size: 8.5px; font-weight: bold; color: #555555; text-transform: uppercase;">MÃ ĐỢT TIẾP NHẬN GỘP</div>
      <div class="k80-order-code k80-store-order-code">${batchCode}</div>
      <div class="k80-barcode">
        ${barcodeSvgStore}
      </div>
      <div style="font-size: 8.5px; color: #333333; margin-top: 2px;">
        Mã đơn: <b>${allOrderCodes}</b>
      </div>
    </div>

    <div class="k80-section" style="border-top: none; margin-top: 0; padding-top: 0;">
      <div class="k80-row">
        <span class="k80-label">Khách hàng:</span>
        <span class="k80-val">${primaryOrder.name || 'Khách lẻ'} - ${primaryOrder.phone || '—'}</span>
      </div>
      <div style="font-weight: bold; font-size: 11px; margin: 4px 0;">${formatMultiOrderTypeLabel(orders)}</div>
      <div class="k80-row">
        <span class="k80-label">Số lượng máy:</span>
        <span class="k80-val"><b>${orders.length} thiết bị</b></span>
      </div>
    </div>

    <div class="k80-section" style="margin-top: 4px; padding-top: 4px;">
      <div class="k80-section-title">DANH SÁCH THIẾT BỊ DÁN KHAY</div>
      ${devicesHtml}
    </div>

    <div class="k80-feed-spacer end"></div>
  </div>`;
}

/**
 * Sinh chuỗi HTML độc lập cho mẫu in nhiệt cuộn 80mm (K80) gộp nhiều thiết bị.
 */
export function renderCombinedThermalK80HTML(
  orders: RepairOrder[],
  options?: ThermalK80RenderOptions
): string {
  if (!orders || orders.length === 0) return '';
  if (orders.length === 1) return renderThermalK80HTML(orders[0], options);

  const primaryOrder = orders[0];
  const effectiveOrigin =
    options?.origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://fixo.com.vn');

  const effectiveMode: ThermalK80SlipMode =
    options?.slipMode || (options?.isRoutingSlip ? 'store_only' : 'dual');

  const effectiveBranding: TenantReceiptBranding | undefined =
    options?.branding || (primaryOrder as any).tenant
      ? {
          logoUrl: options?.branding?.logoUrl || options?.branding?.storeLogoUrl || (primaryOrder as any).tenant?.logo_url,
          storeName: options?.branding?.storeName || (primaryOrder as any).tenant?.name,
          hotline: options?.branding?.hotline || options?.branding?.storeHotline || (primaryOrder as any).tenant?.hotline,
          footerNote: options?.branding?.footerNote || options?.branding?.receiptFooterNote || (primaryOrder as any).tenant?.receipt_footer_note,
        }
      : undefined;

  let bodyContent = '';
  if (effectiveMode === 'dual') {
    bodyContent = `${buildCombinedCustomerCopyHtml(orders, effectiveOrigin, effectiveBranding)}
    <div class="k80-slip-separator"></div>
    ${buildCombinedStoreCopyHtml(orders, effectiveBranding)}`;
  } else if (effectiveMode === 'customer_only') {
    bodyContent = buildCombinedCustomerCopyHtml(orders, effectiveOrigin, effectiveBranding);
  } else {
    bodyContent = buildCombinedStoreCopyHtml(orders, effectiveBranding);
  }

  const batchCode = primaryOrder.intake_batch_code || `IB26-${orders.length}Devices`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>${batchCode} - In nhiệt K80 Gộp (${orders.length} thiết bị)</title>
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
    .k80-slip-separator {
      page-break-after: always;
      break-after: page;
      clear: both;
      display: block;
      height: 0;
      margin: 0;
      padding: 0;
      border: none;
    }
    .k80-feed-spacer {
      height: 15mm;
      display: block;
    }
    .k80-feed-spacer.end {
      height: 18mm;
      display: block;
    }
    .k80-cut-line {
      text-align: center;
      font-size: 9px;
      font-family: monospace;
      color: #333333;
      margin: 4px 0;
      letter-spacing: 0.5px;
      font-weight: 600;
    }
    .k80-store-logo {
      max-width: 42mm;
      max-height: 24mm;
      object-fit: contain;
      margin: 0 auto 3px auto;
      display: block;
      filter: contrast(110%);
    }
    .k80-powered-by {
      font-size: 8px;
      color: #666666;
      margin-top: 4px;
      text-align: center;
    }
    .k80-header {
      text-align: center;
      border-bottom: 1.5px dashed #000000;
      padding-bottom: 6px;
      margin-bottom: 6px;
    }
    .k80-brand {
      font-size: 16px;
      font-weight: 700;
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
      font-weight: 600;
      font-family: "Courier New", Courier, monospace;
      letter-spacing: 1.2px;
      font-variant-numeric: tabular-nums;
    }
    .k80-store-order-code {
      font-size: 19px;
      font-weight: 600;
      letter-spacing: 1.2px;
      font-variant-numeric: tabular-nums;
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
      font-weight: 600;
      font-variant-numeric: tabular-nums;
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
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.3px;
      margin-bottom: 4px;
      color: #000000;
    }
    .k80-store-header {
      font-size: 9px;
      font-weight: 700;
      text-align: center;
      letter-spacing: 0.5px;
    }
    .k80-store-title {
      font-size: 14px;
      font-weight: 800;
      text-align: center;
      margin: 2px 0;
    }
    .k80-store-sub {
      font-size: 9px;
      text-align: center;
      color: #333333;
      margin-bottom: 4px;
    }
    .k80-store-order-box {
      border: 2px solid #000000;
      background: #ffffff;
      padding: 4px 0;
    }
    .k80-handwrite-box {
      margin-top: 6px;
      padding: 5px 6px;
      border: 1.5px dashed #000000;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-align: center;
      background: #ffffff;
      letter-spacing: 0.3px;
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
      font-weight: 600;
      letter-spacing: 0.5px;
      font-variant-numeric: tabular-nums;
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
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}

/**
 * Sinh chuỗi HTML độc lập cho mẫu in nhiệt cuộn 80mm (K80).
 * Hỗ trợ các chế độ:
 * - 'dual' (mặc định): In Liên 1 + Bộ ngắt trang CSS (.k80-slip-separator) + Liên 2.
 * - 'customer_only': Chỉ in duy nhất Liên 1 (bản khách).
 * - 'store_only' / 'routing': Chỉ in duy nhất Liên 2 (bản lưu cửa hàng & kỹ thuật).
 * 
 * Hỗ trợ in 1 đơn hoặc mảng đơn hàng gộp.
 */
export function renderThermalK80HTML(
  orderOrOrders: RepairOrder | RepairOrder[],
  originOrOptions?: string | ThermalK80RenderOptions,
  optionsOrRoutingSlip?: ThermalK80RenderOptions | boolean
): string {
  let origin: string | undefined;
  let options: ThermalK80RenderOptions = {};

  if (typeof originOrOptions === 'string') {
    origin = originOrOptions;
  } else if (originOrOptions && typeof originOrOptions === 'object') {
    options = { ...originOrOptions };
    origin = options.origin;
  }

  if (typeof optionsOrRoutingSlip === 'boolean') {
    options = { ...options, isRoutingSlip: optionsOrRoutingSlip };
  } else if (optionsOrRoutingSlip && typeof optionsOrRoutingSlip === 'object') {
    options = { ...options, ...optionsOrRoutingSlip };
    if (!origin && options.origin) {
      origin = options.origin;
    }
  }

  if (origin && !options.origin) {
    options.origin = origin;
  }

  // Nếu là mảng đơn hàng
  if (Array.isArray(orderOrOrders)) {
    if (orderOrOrders.length === 0) return '';
    if (orderOrOrders.length === 1) {
      return renderThermalK80HTML(orderOrOrders[0], options);
    }
    return renderCombinedThermalK80HTML(orderOrOrders, options);
  }

  const order = orderOrOrders;

  const effectiveOrigin =
    origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://fixo.com.vn');

  const effectiveMode: ThermalK80SlipMode =
    options.slipMode || (options.isRoutingSlip ? 'store_only' : 'dual');

  const effectiveBranding: TenantReceiptBranding | undefined =
    options.branding || (order as any).tenant
      ? {
          logoUrl: options.branding?.logoUrl || options.branding?.storeLogoUrl || (order as any).tenant?.logo_url,
          storeName: options.branding?.storeName || (order as any).tenant?.name,
          hotline: options.branding?.hotline || options.branding?.storeHotline || (order as any).tenant?.hotline,
          footerNote: options.branding?.footerNote || options.branding?.receiptFooterNote || (order as any).tenant?.receipt_footer_note,
        }
      : undefined;

  let bodyContent = '';
  if (effectiveMode === 'dual') {
    bodyContent = `${buildCustomerCopyHtml(order, effectiveOrigin, effectiveBranding)}
    <div class="k80-slip-separator"></div>
    ${buildStoreCopyHtml(order, effectiveBranding)}`;
  } else if (effectiveMode === 'customer_only') {
    bodyContent = buildCustomerCopyHtml(order, effectiveOrigin, effectiveBranding);
  } else {
    // 'store_only' or 'routing'
    bodyContent = buildStoreCopyHtml(order, effectiveBranding);
  }

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
    .k80-slip-separator {
      page-break-after: always;
      break-after: page;
      clear: both;
      display: block;
      height: 0;
      margin: 0;
      padding: 0;
      border: none;
    }
    .k80-feed-spacer {
      height: 15mm;
      display: block;
    }
    .k80-feed-spacer.end {
      height: 18mm;
      display: block;
    }
    .k80-cut-line {
      text-align: center;
      font-size: 9px;
      font-family: monospace;
      color: #333333;
      margin: 4px 0;
      letter-spacing: 0.5px;
      font-weight: 600;
    }
    .k80-store-logo {
      max-width: 42mm;
      max-height: 24mm;
      object-fit: contain;
      margin: 0 auto 3px auto;
      display: block;
      filter: contrast(110%);
    }
    .k80-powered-by {
      font-size: 8px;
      color: #666666;
      margin-top: 4px;
      text-align: center;
    }
    .k80-header {
      text-align: center;
      border-bottom: 1.5px dashed #000000;
      padding-bottom: 6px;
      margin-bottom: 6px;
    }
    .k80-brand {
      font-size: 16px;
      font-weight: 700;
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
      font-weight: 600;
      font-family: "Courier New", Courier, monospace;
      letter-spacing: 1.2px;
      font-variant-numeric: tabular-nums;
    }
    .k80-store-order-code {
      font-size: 19px;
      font-weight: 600;
      letter-spacing: 1.2px;
      font-variant-numeric: tabular-nums;
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
      font-weight: 600;
      font-variant-numeric: tabular-nums;
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
    .k80-store-issue-box {
      background: #fafafa;
      border: 2px solid #000000;
      padding: 6px;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.3;
      border-radius: 3px;
      word-break: break-word;
    }
    .k80-store-header {
      font-size: 11.5px;
      font-weight: 700;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: -0.2px;
      margin-bottom: 2px;
    }
    .k80-store-title {
      font-size: 9px;
      font-weight: 700;
      text-align: center;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: #333333;
      margin-bottom: 2px;
    }
    .k80-store-sub {
      font-size: 9px;
      color: #444444;
      text-align: center;
      margin-top: 2px;
    }
    .k80-handwrite-box {
      margin-top: 6px;
      padding: 5px 6px;
      border: 1.5px dashed #000000;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-align: center;
      background: #ffffff;
      letter-spacing: 0.3px;
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
      font-weight: 600;
      letter-spacing: 0.5px;
      font-variant-numeric: tabular-nums;
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
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}
