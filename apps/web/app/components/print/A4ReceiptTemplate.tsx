'use client';

import React from 'react';
import type { RepairOrder } from '@podscare/types';
import { generateBarcodeSVG, generateQRCodeSVG } from './BarcodeQRUtils';
import { formatMoney, FIXO_LOGO_A4_SVG, type TenantReceiptBranding } from './thermalK80HtmlBuilder';
import { renderCombinedA4ReceiptHTML } from './a4ReceiptHtmlBuilder';

export interface A4ReceiptTemplateProps {
  order?: RepairOrder;
  orders?: RepairOrder[];
  origin?: string;
  branding?: TenantReceiptBranding;
}

/**
 * Component hiển thị giao diện A4 (2 liên) trong trang xem trước và in
 */
export const A4ReceiptTemplate: React.FC<A4ReceiptTemplateProps> = ({ order: singleOrder, orders, origin, branding }) => {
  if (orders && orders.length >= 2) {
    const combinedHtml = renderCombinedA4ReceiptHTML(orders, origin, branding);
    const match = combinedHtml.match(/<body>([\s\S]*?)<\/body>/i);
    const bodyInner = match ? match[1] : combinedHtml;

    return (
      <div
        className="a4-template-wrapper w-full max-w-[196mm] mx-auto bg-white"
        dangerouslySetInnerHTML={{ __html: bodyInner }}
      />
    );
  }

  const order = singleOrder || (orders && orders[0]);
  if (!order) return null;
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

  const renderCopy = (copyTitle: string) => {
    const checks = Array.isArray(order.checks) ? order.checks : [];
    const mid = Math.ceil(checks.length / 2);
    const leftChecks = checks.slice(0, mid);
    const rightChecks = checks.slice(mid);

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
      <article className="a4-receipt-copy bg-white text-[#111111] p-4 sm:p-5 border border-[#c8d3cc] rounded-[8px] shadow-sm print:shadow-none print:border-[#c8d3cc] print:rounded-[6px] print:p-3 print:m-0 max-h-[132mm] overflow-hidden flex flex-col justify-between">
        <div>
          {/* Header */}
          <header className="flex justify-between items-center border-b-2 border-[#176b58] pb-1.5 mb-1.5">
            <div className="flex items-center gap-2">
              {effectiveLogoUrl ? (
                <img
                  src={effectiveLogoUrl}
                  alt="Logo"
                  className="max-w-[48mm] max-h-[28mm] object-contain flex-none"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div
                  className="w-8 h-8 flex-none [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: FIXO_LOGO_A4_SVG }}
                />
              )}
              <div>
                <b className="text-[13pt] font-extrabold text-[#176b58] tracking-tight block leading-none font-heading">
                  {effectiveStoreName}
                </b>
                <small className="text-[6.5pt] tracking-[0.8px] text-[#555555] block mt-0.5 font-bold uppercase">
                  PHIẾU TIẾP NHẬN SỬA CHỮA THIẾT BỊ
                </small>
              </div>
            </div>
            <strong className="text-[7.5pt] border border-[#176b58] px-2 py-0.5 rounded text-[#176b58] uppercase font-bold">
              {copyTitle}
            </strong>
          </header>

          {/* Info bar */}
          <div className="flex items-center justify-between bg-[#f2f7f4] px-2.5 py-1 rounded mb-2 text-[7.5pt]">
            <div className="flex items-center gap-2">
              <span>MÃ PHIẾU:</span>
              <b className="text-[9.5pt] text-[#176b58] font-semibold font-mono tracking-[1px] tabular-nums">{order.id}</b>
              <div
                className="hidden sm:inline-block h-5 [&>svg]:h-5 [&>svg]:max-w-[130px]"
                dangerouslySetInnerHTML={{ __html: barcodeSvg }}
              />
            </div>
            <div className="flex gap-3 text-[7pt] text-[#444444]">
              <span>Ngày nhận: <b>{order.date || 'Hôm nay'}</b></span>
              <span>Chi nhánh: <b>{effectiveBranch}</b></span>
              {effectiveHotline && <span>Hotline: <b>{effectiveHotline}</b></span>}
            </div>
          </div>

          {/* Customer & Device */}
          <div className="grid grid-cols-2 gap-3 text-[7.5pt] pb-1.5 mb-1.5 border-b border-[#edf1ee]">
            <div>
              <h3 className="font-bold text-[7pt] text-[#176b58] uppercase mb-0.5">
                Thông tin khách hàng
              </h3>
              <p className="my-0.5 leading-tight">
                <b>Họ tên:</b> {order.name}
              </p>
              <p className="my-0.5 leading-tight">
                <b>Số điện thoại:</b> {order.phone}
              </p>
            </div>
            <div>
              <h3 className="font-bold text-[7pt] text-[#176b58] uppercase mb-0.5">
                Thiết bị tiếp nhận
              </h3>
              <p className="my-0.5 leading-tight">
                <b>Dòng máy:</b> {order.device}
              </p>
              <p className="my-0.5 leading-tight">
                <b>Serial / Model:</b> {order.serial || 'Chưa cập nhật'}
              </p>
              <p className="my-0.5 leading-tight">
                <b>Phụ kiện:</b> {order.accessories || 'Không gửi kèm'}
              </p>
            </div>
          </div>

          {/* Issue */}
          <div className="mb-1.5 text-[7.5pt]">
            <h3 className="font-bold text-[7pt] text-[#176b58] uppercase mb-0.5">Lỗi khách báo</h3>
            <p className="bg-[#fafbfa] p-1.5 rounded border border-[#e1e8e3] my-0 leading-tight">
              {order.issue}
            </p>
          </div>

          {/* Test checklist */}
          {checks.length > 0 && (
            <div className="mb-1.5 text-[7pt]">
              <h3 className="font-bold text-[7pt] text-[#176b58] uppercase mb-0.5">
                Kết quả kiểm tra tính năng tại quầy
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <table className="w-full border-collapse border border-[#e3e8e5]">
                  <tbody>
                    {leftChecks.map((c, i) => (
                      <tr key={i} className="border-b border-[#e3e8e5] last:border-b-0">
                        <td className="p-0.5 px-1 text-[#333333]">{c.label}</td>
                        <td className="p-0.5 px-1 font-bold text-right w-[35%]">
                          <span
                            className={
                              c.status === 'Hoạt động'
                                ? 'text-[#176b58]'
                                : c.status === 'Lỗi'
                                ? 'text-[#c0392b]'
                                : 'text-[#777777]'
                            }
                          >
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <table className="w-full border-collapse border border-[#e3e8e5]">
                  <tbody>
                    {rightChecks.map((c, i) => (
                      <tr key={i} className="border-b border-[#e3e8e5] last:border-b-0">
                        <td className="p-0.5 px-1 text-[#333333]">{c.label}</td>
                        <td className="p-0.5 px-1 font-bold text-right w-[35%]">
                          <span
                            className={
                              c.status === 'Hoạt động'
                                ? 'text-[#176b58]'
                                : c.status === 'Lỗi'
                                ? 'text-[#c0392b]'
                                : 'text-[#777777]'
                            }
                          >
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {order.testNote && (
                <p className="text-[6.5pt] text-[#555555] mt-0.5 italic">
                  <b>Ghi chú test:</b> {order.testNote}
                </p>
              )}
            </div>
          )}

          {/* Breakdown if additional or discount */}
          {(hasAdditional || discountAmount > 0) && (
            <div className="mb-1.5 p-1 bg-[#fafdfb] border border-dashed border-[#b8d0c5] rounded text-[6.5pt]">
              <span className="font-bold text-[#176b58] block mb-0.5">BẢNG KÊ DỊCH VỤ & CHI PHÍ:</span>
              <div className="flex justify-between py-0.5">
                <span>1. Tiếp nhận ban đầu:</span>
                <b>{formatMoney(initialPriceVal)}</b>
              </div>
              {additionalServices.map((srv: any, i: number) => (
                <div key={i} className="flex justify-between py-0.5">
                  <span>{i + 2}. [Làm thêm] {srv.name}:</span>
                  <b className="text-[#176b58]">+{formatMoney(srv.price)}</b>
                </div>
              ))}
              {discountAmount > 0 && (
                <div className="flex justify-between py-0.5 text-[#b91c1c] font-bold">
                  <span>• Giảm giá:</span>
                  <b>-{formatMoney(discountAmount)}</b>
                </div>
              )}
            </div>
          )}

          {/* Price & QR Row */}
          <div className="flex justify-between items-center border border-[#176b58] p-1.5 rounded mb-1 text-[7.5pt] bg-[#f7fbf9]">
            <div>
              <span>{discountAmount > 0 ? 'Tổng thanh toán thực thu: ' : (hasAdditional ? 'Tổng cộng thanh toán: ' : 'Giá sửa chữa dự kiến: ')}</span>
              <b className="text-[9.5pt] text-[#176b58] font-semibold tabular-nums tracking-[0.5px]">{formatMoney(finalPriceVal)}</b>
              {order.priceNote && <span className="text-[#666666] text-[6.5pt] ml-1">({order.priceNote})</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-5 h-5 [&>svg]:w-5 [&>svg]:h-5"
                dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
              />
              <span className="text-[6.5pt] text-[#555555] font-semibold">Quét tra cứu</span>
            </div>
          </div>

          <p className="text-[6pt] text-[#666666] leading-tight my-0.5">
            * Chi phí trên là dự kiến tại thời điểm tiếp nhận. <b>Thời hạn bảo hành: {warrantyMonths} tháng (Đến ngày {formattedExpiryDate})</b>. FIXO sẽ chủ động liên hệ quý khách xác
            nhận trước khi can thiệp nếu có phát sinh linh kiện. Quý khách vui lòng giữ phiếu để đối chiếu.
          </p>
        </div>

        {/* Signatures & Footer */}
        <div>
          <div className="grid grid-cols-2 text-center pt-1 border-t border-[#edf1ee] min-h-[30px] text-[7pt]">
            <div>
              <b>KHÁCH HÀNG</b>
              <small className="block text-[5.5pt] text-[#666666]">(Ký và ghi rõ họ tên)</small>
              <span className="block mt-3 font-semibold">{order.name}</span>
            </div>
            <div>
              <b>NHÂN VIÊN TIẾP NHẬN</b>
              <small className="block text-[5.5pt] text-[#666666]">(Ký và ghi rõ họ tên)</small>
              <span className="block mt-3 font-semibold">{order.createdBy || 'FIXO'}</span>
            </div>
          </div>
          <footer className="mt-1 pt-0.5 border-t border-[#e3e8e5] text-center text-[5.5pt] text-[#777777]">
            {effectiveFooterNote && <div className="mb-0.5 text-[#555555]">{effectiveFooterNote}</div>}
            <div>⚡ Powered by FIXO Repair OS · fixo.vn · Phiếu được lập thành 02 liên có giá trị ghi nhận như nhau · {order.id}</div>
          </footer>
        </div>
      </article>
    );
  };

  return (
    <div id="printSheetWrapper" className="a4-template-container max-w-[820px] mx-auto print:max-w-none print:w-full space-y-4 print:space-y-0">
      {renderCopy('LIÊN 1 · CỬA HÀNG GIỮ')}

      {/* Đường phân cách nét đứt kèm ký hiệu kéo 10mm */}
      <div className="my-4 border-b border-dashed border-[#777777] print:my-0 print:h-[10mm] print:border-b-0 print:flex print:items-center print:justify-center">
        <span className="text-[7pt] text-[#777777] tracking-widest font-mono select-none flex items-center justify-center gap-2">
          ✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂
        </span>
      </div>

      {renderCopy('LIÊN 2 · KHÁCH HÀNG GIỮ')}
    </div>
  );
};
