'use client';

import React from 'react';
import type { RepairOrder } from '@podscare/types';
import { generateBarcodeSVG, generateQRCodeSVG } from './BarcodeQRUtils';
import {
  FIXO_LOGO_SVG,
  formatMoney,
} from './thermalK80HtmlBuilder';

export interface ThermalK80ReceiptProps {
  order: RepairOrder;
  origin?: string;
  isRoutingSlip?: boolean;
}

/**
 * Component hiển thị giao diện nhiệt K80 (80mm) trong ứng dụng React
 */
export const ThermalK80Receipt: React.FC<ThermalK80ReceiptProps> = ({
  order,
  origin,
  isRoutingSlip = false,
}) => {
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
  const slipTitle = isRoutingSlip
    ? 'PHIẾU ĐIỀU PHỐI / TEM KHAY KỸ THUẬT'
    : 'PHIẾU TIẾP NHẬN SỬA CHỮA';

  return (
    <article className="thermal-receipt bg-white text-black p-3 rounded-[6px] border border-gray-300 shadow-sm w-[74mm] max-w-[74mm] font-sans text-[11px] leading-[1.35] mx-auto select-none print:shadow-none print:border-none print:p-0">
      {/* Header */}
      <div className="text-center border-b border-dashed border-black pb-2 mb-2">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div
            className="w-9 h-9 flex-none"
            dangerouslySetInnerHTML={{ __html: FIXO_LOGO_SVG }}
          />
          <div className="text-left">
            <h1 className="font-heading font-black text-sm tracking-tight m-0 text-black">
              FIXO REPAIR OS
            </h1>
            <p className="text-[9px] font-bold tracking-wide uppercase m-0 text-gray-700">
              {slipTitle}
            </p>
          </div>
        </div>
        <p className="text-[9.5px] text-gray-800 m-0">
          <b>Chi nhánh:</b> {order.branch || 'FIXO Store'}
        </p>
        <p className="text-[9.5px] text-gray-800 m-0">
          <b>Hotline:</b> 1900.6868 · fixo.vn
        </p>
      </div>

      {/* Order Box */}
      <div className="text-center p-1.5 my-1.5 bg-gray-50 border border-black rounded-[4px]">
        <span className="text-[8.5px] font-bold text-gray-600 block uppercase">
          MÃ PHIẾU TIẾP NHẬN
        </span>
        <span className="text-base font-black font-mono tracking-wider block">
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
          <b className="text-right flex-grow">{order.name}</b>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-700 w-20 flex-shrink-0">Số ĐT:</span>
          <b className="text-right flex-grow font-mono">{order.phone}</b>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-700 w-20 flex-shrink-0">Thiết bị:</span>
          <b className="text-right flex-grow">{order.device}</b>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-700 w-20 flex-shrink-0">Serial/Model:</span>
          <b className="text-right flex-grow font-mono">{order.serial || 'Chưa cập nhật'}</b>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-700 w-20 flex-shrink-0">Phụ kiện:</span>
          <span className="text-right flex-grow font-medium">{order.accessories || 'Không gửi kèm'}</span>
        </div>
      </div>

      {/* Issue */}
      <div className="mt-2 pt-1.5 border-t border-dashed border-gray-400">
        <span className="text-[10px] font-extrabold uppercase block mb-0.5">
          Lỗi khách báo tiếp nhận
        </span>
        <p className="bg-gray-50 border border-gray-200 p-1.5 rounded text-[10px] m-0">
          {order.issue}
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
        </div>
      )}

      {/* Price */}
      <div className="mt-2 p-1.5 border border-black rounded-[4px] flex justify-between items-center bg-gray-50">
        <span className="text-[10px] font-bold">GIÁ DỰ KIẾN:</span>
        <b className="text-sm font-black">{formatMoney(order.price)}</b>
      </div>

      {/* QR Code */}
      <div className="mt-2 pt-2 border-t border-dashed border-gray-400 text-center">
        <div
          className="inline-block w-[24mm] h-[24mm] mx-auto [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
        />
        <p className="text-[8.5px] font-medium text-gray-700 m-0 mt-0.5">
          Quét mã QR để theo dõi tiến độ sửa chữa
        </p>
      </div>

      {/* Signatures */}
      <div className="flex justify-between text-center mt-2.5 pt-1 text-[9.5px]">
        <div className="w-1/2">
          <b>KHÁCH HÀNG</b>
          <div className="h-7" />
          <p className="font-semibold m-0">{order.name}</p>
        </div>
        <div className="w-1/2">
          <b>TIẾP NHẬN</b>
          <div className="h-7" />
          <p className="font-semibold m-0">{order.createdBy || 'FIXO'}</p>
        </div>
      </div>

      {/* Cut feed spacer */}
      <div className="h-[18mm]" />
    </article>
  );
};
