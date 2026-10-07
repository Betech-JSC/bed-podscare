'use client';

import React from 'react';
import type { RepairOrder } from '@podscare/types';
import { generateBarcodeSVG, generateQRCodeSVG } from './BarcodeQRUtils';
import {
  FIXO_LOGO_SVG,
  formatMoney,
  renderCombinedThermalK80HTML,
  type ThermalK80SlipMode,
  type TenantReceiptBranding,
} from './thermalK80HtmlBuilder';

export interface ThermalK80ReceiptProps {
  order?: RepairOrder;
  orders?: RepairOrder[];
  origin?: string;
  isRoutingSlip?: boolean;
  slipMode?: ThermalK80SlipMode;
  branding?: TenantReceiptBranding;
}

/**
 * Liên 1: Bản giao khách hàng giữ (Customer Copy)
 */
const CustomerSlip: React.FC<{
  order: RepairOrder;
  origin?: string;
  branding?: TenantReceiptBranding;
}> = ({ order, origin, branding }) => {
  const currentOrigin =
    origin || (typeof window !== 'undefined' ? window.location.origin : 'https://fixo.com.vn');
  const trackUrl = `${currentOrigin}/track/${order.id}`;

  const effectiveBranding = branding || (order as any).tenant;
  const effectiveLogoUrl = effectiveBranding?.logoUrl || effectiveBranding?.storeLogoUrl || (order as any).tenant?.logo_url;
  const effectiveStoreName = effectiveBranding?.storeName || (order as any).tenant?.name || 'FIXO REPAIR OS';
  const effectiveBranch = order.branch || effectiveBranding?.storeName || (order as any).tenant?.name || 'FIXO Store';
  const effectiveHotline = effectiveBranding?.hotline || effectiveBranding?.storeHotline || (order as any).tenant?.hotline || '1900.6868 · fixo.vn';
  const effectiveFooterNote = effectiveBranding?.footerNote || effectiveBranding?.receiptFooterNote || (order as any).tenant?.receipt_footer_note || '* Quý khách vui lòng giữ phiếu này để đối chiếu khi nhận máy.<br />Cảm ơn quý khách đã tin tưởng dịch vụ FIXO Care!';

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

  return (
    <div className="k80-customer-copy">
      {/* Header */}
      <div className="text-center border-b border-dashed border-black pb-2 mb-2">
        {effectiveLogoUrl ? (
          <div className="text-center mb-1">
            <img
              src={effectiveLogoUrl}
              alt="Logo"
              className="k80-store-logo max-w-[42mm] max-h-[24mm] object-contain mx-auto mb-1 block"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
            <h1 className="font-heading font-black text-sm tracking-tight m-0 text-black">
              {effectiveStoreName}
            </h1>
            <p className="text-[9px] font-bold tracking-wide uppercase m-0 text-gray-700">
              PHIẾU TIẾP NHẬN SỬA CHỮA · LIÊN KHÁCH HÀNG
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 mb-1">
            <div
              className="w-9 h-9 flex-none"
              dangerouslySetInnerHTML={{ __html: FIXO_LOGO_SVG }}
            />
            <div className="text-left">
              <h1 className="font-heading font-bold text-sm tracking-tight m-0 text-black">
                FIXO REPAIR OS
              </h1>
              <p className="text-[9px] font-bold tracking-wide uppercase m-0 text-gray-700">
                PHIẾU TIẾP NHẬN SỬA CHỮA · LIÊN KHÁCH HÀNG
              </p>
            </div>
          </div>
        )}
        <p className="text-[9.5px] text-gray-800 m-0">
          <b>Chi nhánh:</b> {effectiveBranch}
        </p>
        <p className="text-[9.5px] text-gray-800 m-0">
          <b>Hotline CSKH:</b> {effectiveHotline}
        </p>
      </div>

      {/* Order Box */}
      <div className="text-center p-1.5 my-1.5 bg-gray-50 border border-black rounded-[4px]">
        <span className="text-[8.5px] font-bold text-gray-600 block uppercase">
          MÃ PHIẾU TIẾP NHẬN
        </span>
        <span className="text-base font-semibold font-mono tracking-[1.2px] tabular-nums block">
          {order.id}
        </span>
        <div
          className="flex justify-center mt-1 [&>svg]:max-w-[90%] [&>svg]:h-7"
          dangerouslySetInnerHTML={{ __html: barcodeSvg }}
        />
      </div>

      <div className="flex justify-between text-[9px] border-b border-dotted border-gray-400 pb-1 mb-1.5">
        <span>Ngày nhận: <b>{order.date || 'Hôm nay'}</b></span>
        <span>NV: <b>{order.createdBy || 'FIXO'}</b></span>
      </div>

      {/* Customer & Device */}
      <div className="space-y-0.5 text-[10.5px]">
        <div className="flex justify-between">
          <span className="text-gray-700 w-20 flex-shrink-0">Khách hàng:</span>
          <b className="text-right flex-grow">{order.name || 'Khách lẻ'}</b>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-700 w-20 flex-shrink-0">Số ĐT:</span>
          <b className="text-right flex-grow font-mono font-semibold tabular-nums tracking-[0.5px]">{order.phone || '—'}</b>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-700 w-20 flex-shrink-0">Thiết bị:</span>
          <b className="text-right flex-grow">{order.device || 'Thiết bị Apple'}</b>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-700 w-20 flex-shrink-0">Serial/Model:</span>
          <b className="text-right flex-grow font-mono font-semibold tabular-nums tracking-[0.5px]">{order.serial || 'Chưa cập nhật'}</b>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-700 w-20 flex-shrink-0">Phụ kiện:</span>
          <span className="text-right flex-grow font-medium">{order.accessories || 'Không gửi kèm'}</span>
        </div>
        {order.appearance && (
          <div className="flex justify-between">
            <span className="text-gray-700 w-20 flex-shrink-0">Ngoại hình:</span>
            <span className="text-right flex-grow font-bold">{order.appearance}</span>
          </div>
        )}
      </div>

      {/* Issue */}
      <div className="mt-2 pt-1.5 border-t border-dashed border-gray-400">
        <span className="text-[10px] font-extrabold uppercase block mb-0.5">
          Lỗi khách báo tiếp nhận
        </span>
        <p className="bg-gray-50 border border-gray-200 p-1.5 rounded text-[10px] m-0">
          {order.issue || 'Kiểm tra tổng quát'}
        </p>
      </div>

      {/* Checks at counter */}
      {checks.length > 0 && (
        <div className="mt-2 pt-1.5 border-t border-dashed border-gray-400">
          <span className="text-[10px] font-extrabold uppercase block mb-0.5">
            Kiểm tra chức năng tại quầy
          </span>
          <table className="w-full border-collapse text-[9.5px]">
            <tbody>
              {checks.map((c, i) => (
                <tr key={i} className="border-b border-dotted border-gray-200">
                  <td className="py-0.5 text-gray-800">{c.label}</td>
                  <td className="py-0.5 text-right font-bold">
                    <span
                      className={
                        c.status === 'Hoạt động'
                          ? 'text-black'
                          : c.status === 'Lỗi'
                          ? 'text-black underline'
                          : 'text-gray-600'
                      }
                    >
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {order.testNote && (
            <p className="text-[9px] italic text-gray-600 mt-1 m-0">
              <b>Ghi chú:</b> {order.testNote}
            </p>
          )}
        </div>
      )}

      {/* Price breakdown if additional or discount */}
      {(hasAdditional || discountAmount > 0) && (
        <div className="mt-2 pt-1 border-t border-dashed border-black text-[9px]">
          <span className="font-extrabold uppercase block mb-0.5">BẢNG KÊ DỊCH VỤ & CHI PHÍ:</span>
          <div className="flex justify-between py-0.5">
            <span>• Tiếp nhận ban đầu:</span>
            <span className="font-semibold">{formatMoney(initialPriceVal)}</span>
          </div>
          {additionalServices.map((srv: any, i: number) => (
            <div key={i} className="flex justify-between py-0.5">
              <span>• [Thêm] {srv.name}:</span>
              <span className="font-semibold">+{formatMoney(srv.price)}</span>
            </div>
          ))}
          {discountAmount > 0 && (
            <div className="flex justify-between py-0.5 font-bold">
              <span>• Giảm giá:</span>
              <span>-{formatMoney(discountAmount)}</span>
            </div>
          )}
        </div>
      )}

      {/* Price */}
      <div className="mt-2 p-1.5 border border-black rounded-[4px] flex justify-between items-center bg-gray-50">
        <div>
          <span className="text-[10px] font-bold block">
            {discountAmount > 0 ? 'TỔNG THỰC THU:' : (hasAdditional ? 'TỔNG CỘNG THANH TOÁN:' : 'GIÁ DỰ KIẾN:')}
          </span>
          {order.priceNote && (
            <span className="text-[8px] text-gray-600 block">({order.priceNote})</span>
          )}
        </div>
        <b className="text-sm font-semibold tabular-nums tracking-[0.5px]">{formatMoney(finalPriceVal)}</b>
      </div>

      {/* Warranty Badge */}
      <div className="text-center mt-2 p-1.5 border border-dashed border-gray-600 rounded bg-gray-50">
        <div className="text-[9.5px] font-extrabold text-black">🛡️ BẢO HÀNH ĐIỆN TỬ: {warrantyMonths} THÁNG</div>
        <div className="text-[8.5px] text-gray-700 mt-0.5">Thời hạn bảo hành: {warrantyMonths} tháng (Đến ngày {formattedExpiryDate})</div>
      </div>

      {/* QR Code */}
      <div className="mt-2 pt-2 border-t border-dashed border-gray-400 text-center">
        <div
          className="inline-block w-[24mm] h-[24mm] mx-auto [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
        />
        <p className="text-[8.5px] font-medium text-gray-700 m-0 mt-0.5">
          Quét mã QR để theo dõi tiến độ sửa chữa realtime
        </p>
      </div>

      {/* Signatures */}
      <div className="flex justify-between text-center mt-2.5 pt-1 text-[9.5px]">
        <div className="w-1/2">
          <b>KHÁCH HÀNG</b>
          <div className="h-7" />
          <p className="font-semibold m-0">{order.name || ''}</p>
        </div>
        <div className="w-1/2">
          <b>TIẾP NHẬN</b>
          <div className="h-7" />
          <p className="font-semibold m-0">{order.createdBy || 'FIXO'}</p>
        </div>
      </div>

      <p
        className="text-center text-[8px] text-gray-500 mt-2 border-t border-dotted border-gray-400 pt-1 leading-tight m-0"
        dangerouslySetInnerHTML={{ __html: effectiveFooterNote }}
      />
      <div className="k80-powered-by text-center text-[8px] text-gray-500 mt-1">
        ⚡ Powered by FIXO Repair OS · fixo.vn
      </div>

      {/* Cut feed spacer */}
      <div className="h-[15mm]" />
      <div className="text-center font-mono text-[9px] text-gray-500 my-1 tracking-wider">
        ✂ - - - - - CẮT GIẤY - - - - - ✂
      </div>
    </div>
  );
};

/**
 * Liên 2: Bản lưu cửa hàng & Kỹ thuật dán khay (Store Copy)
 * Tuyệt đối không hiển thị giá tiền, QR tra cứu, chữ ký và cam kết.
 */
const StoreSlip: React.FC<{ order: RepairOrder }> = ({ order }) => {
  const barcodeSvgStore = generateBarcodeSVG(order.id, {
    height: 24,
    barWidth: 1.35,
    showText: false,
  });

  const checks = Array.isArray(order.checks) ? order.checks : [];

  return (
    <div className="k80-store-copy">
      {/* Header */}
      <div className="text-center border-b border-dashed border-black pb-2 mb-2">
        <h2 className="font-heading font-bold text-xs tracking-tight uppercase m-0 text-black">
          FIXO REPAIR OS · BẢN LƯU CỬA HÀNG & KỸ THUẬT
        </h2>
        <div className="text-[9px] font-bold text-gray-700 tracking-wide uppercase mt-0.5">
          BẢN LƯU CỬA HÀNG & KỸ THUẬT (KHÔNG CÓ GIÁ TIỀN)
        </div>
        <div className="text-[9px] font-semibold text-gray-600 uppercase">
          PHIẾU ĐIỀU PHỐI / TEM KHAY KỸ THUẬT
        </div>
        <p className="text-[9px] text-gray-600 m-0 mt-1">
          Chi nhánh: {order.branch || 'FIXO Store'} · Ngày: {order.date || 'Hôm nay'} · NV: {order.createdBy || 'FIXO'}
        </p>
      </div>

      {/* Order Box Prominent */}
      <div className="text-center p-1.5 my-1.5 bg-gray-50 border border-black rounded-[4px]">
        <span className="text-[8.5px] font-bold text-gray-600 block uppercase">
          MÃ PHIẾU TIẾP NHẬN
        </span>
        <span className="text-lg font-semibold font-mono tracking-[1.2px] tabular-nums block">
          {order.id}
        </span>
        <div
          className="flex justify-center mt-1 [&>svg]:max-w-[90%] [&>svg]:h-6"
          dangerouslySetInnerHTML={{ __html: barcodeSvgStore }}
        />
      </div>

      {/* Customer & Device */}
      <div className="space-y-0.5 text-[10.5px]">
        <div className="flex justify-between">
          <span className="text-gray-700 w-20 flex-shrink-0">Khách hàng:</span>
          <b className="text-right flex-grow font-semibold tabular-nums">{order.name || 'Khách lẻ'} - {order.phone || '—'}</b>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-700 w-20 flex-shrink-0">Thiết bị:</span>
          <b className="text-right flex-grow">{order.device || 'Thiết bị Apple'}</b>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-700 w-20 flex-shrink-0">Serial/Model:</span>
          <b className="text-right flex-grow font-mono font-semibold tabular-nums tracking-[0.5px]">{order.serial || 'Chưa cập nhật'}</b>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-700 w-20 flex-shrink-0">Phụ kiện:</span>
          <span className="text-right flex-grow font-medium">{order.accessories || 'Không gửi kèm'}</span>
        </div>
        {order.appearance && (
          <div className="flex justify-between">
            <span className="text-gray-700 w-20 flex-shrink-0">Ngoại hình:</span>
            <span className="text-right flex-grow font-bold">{order.appearance}</span>
          </div>
        )}
      </div>

      {/* Issue Highlight Box */}
      <div className="mt-2 pt-1.5 border-t border-dashed border-gray-400">
        <span className="text-[10px] font-extrabold uppercase block mb-0.5">
          BỆNH MÁY TIẾP NHẬN
        </span>
        <p className="bg-gray-50 border-2 border-black p-1.5 rounded text-[11px] font-bold text-black m-0 leading-snug">
          {order.issue || 'Kiểm tra tổng quát'}
        </p>
      </div>

      {/* Checks at counter */}
      {checks.length > 0 && (
        <div className="mt-2 pt-1.5 border-t border-dashed border-gray-400">
          <span className="text-[10px] font-extrabold uppercase block mb-0.5">
            Test chức năng tại quầy
          </span>
          <table className="w-full border-collapse text-[9.5px]">
            <tbody>
              {checks.map((c, i) => (
                <tr key={i} className="border-b border-dotted border-gray-200">
                  <td className="py-0.5 text-gray-800">{c.label}</td>
                  <td className="py-0.5 text-right font-bold">
                    <span
                      className={
                        c.status === 'Hoạt động'
                          ? 'text-black'
                          : c.status === 'Lỗi'
                          ? 'text-black underline'
                          : 'text-gray-600'
                      }
                    >
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {order.testNote && (
            <p className="text-[9px] italic text-gray-600 mt-1 m-0">
              <b>Ghi chú:</b> {order.testNote}
            </p>
          )}
        </div>
      )}

      {/* Handwritten Tech Note Box */}
      <div className="mt-2 p-1.5 border border-dashed border-black rounded-[4px] text-center font-bold text-[10px] bg-white">
        Khay số: [ ..... ] | Kỹ Thuật: [ .......... ]
      </div>

      {/* Feed Spacer End */}
      <div className="h-[18mm]" />
    </div>
  );
};

/**
 * Component hiển thị giao diện nhiệt K80 (80mm) trong ứng dụng React.
 * Hỗ trợ hiển thị 2 liên trên màn hình xem trước (preview modal) với đường cắt mô phỏng dao cắt Xprinter.
 */
export const ThermalK80Receipt: React.FC<ThermalK80ReceiptProps> = ({
  order: singleOrder,
  orders,
  origin,
  isRoutingSlip = false,
  slipMode,
  branding,
}) => {
  if (orders && orders.length >= 2) {
    const combinedHtml = renderCombinedThermalK80HTML(orders, {
      origin,
      isRoutingSlip,
      slipMode,
      branding,
    });
    const match = combinedHtml.match(/<body>([\s\S]*?)<\/body>/i);
    const bodyInner = match ? match[1] : combinedHtml;

    return (
      <article
        className="thermal-receipt bg-white text-black p-3 rounded-[6px] border border-gray-300 shadow-sm w-[74mm] max-w-[74mm] font-sans text-[11px] leading-[1.35] mx-auto select-none print:shadow-none print:border-none print:p-0"
        dangerouslySetInnerHTML={{ __html: bodyInner }}
      />
    );
  }

  const order = singleOrder || (orders && orders[0]);
  if (!order) return null;

  const effectiveMode: ThermalK80SlipMode =
    slipMode || (isRoutingSlip ? 'store_only' : 'dual');

  return (
    <article className="thermal-receipt bg-white text-black p-3 rounded-[6px] border border-gray-300 shadow-sm w-[74mm] max-w-[74mm] font-sans text-[11px] leading-[1.35] mx-auto select-none print:shadow-none print:border-none print:p-0">
      {effectiveMode === 'dual' && (
        <>
          <CustomerSlip order={order} origin={origin} branding={branding} />

          {/* Vạch phân cách mô phỏng dao cắt giấy POS - Ẩn khi in thực tế */}
          <div className="my-4 py-2 border-y-2 border-dashed border-gray-400 bg-gray-100 text-center font-mono text-[10px] text-gray-600 flex items-center justify-center gap-2 select-none print:hidden">
            <span>✂</span>
            <span>- - - - - ĐIỂM DAO CẮT TỰ ĐỘNG (XPRINTER AUTO-CUTTER) - - - - -</span>
            <span>✂</span>
          </div>

          {/* Ngắt trang khi in trực tiếp từ trình duyệt */}
          <div
            className="hidden print:block print:clear-both"
            style={{ pageBreakAfter: 'always', breakAfter: 'page' }}
          />

          <StoreSlip order={order} />
        </>
      )}

      {effectiveMode === 'customer_only' && (
        <CustomerSlip order={order} origin={origin} branding={branding} />
      )}

      {(effectiveMode === 'store_only' || effectiveMode === 'routing') && (
        <StoreSlip order={order} />
      )}
    </article>
  );
};
