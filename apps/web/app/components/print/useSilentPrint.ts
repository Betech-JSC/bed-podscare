'use client';

import { useState, useEffect, useCallback } from 'react';
import type { RepairOrder } from '@podscare/types';
import {
  type PrintFormat,
  getStoredPrintFormat,
  setStoredPrintFormat,
} from './printerPreference';
import {
  renderThermalK80HTML,
  type ThermalK80RenderOptions,
} from './thermalK80HtmlBuilder';
import { renderA4ReceiptHTML } from './a4ReceiptHtmlBuilder';

export interface UseSilentPrintOptions {
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

export interface UseSilentPrintReturn {
  isPrinting: boolean;
  currentFormat: PrintFormat;
  setFormat: (format: PrintFormat) => void;
  printReceipt: (
    order: RepairOrder,
    formatOverride?: PrintFormat,
    optionsOrRoutingSlip?: ThermalK80RenderOptions | boolean
  ) => Promise<boolean>;
}

/**
 * Custom Hook điều khiển Silent Printing qua Hidden Iframe.
 * Hoạt động 100% Client-side, không reload trang, không chuyển route.
 */
export function useSilentPrint(options?: UseSilentPrintOptions): UseSilentPrintReturn {
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [currentFormat, setCurrentFormatState] = useState<PrintFormat>(getStoredPrintFormat);

  // Lắng nghe thay đổi format từ các component hoặc tab khác
  useEffect(() => {
    const handleFormatChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ format: PrintFormat }>;
      if (customEvent.detail?.format) {
        setCurrentFormatState(customEvent.detail.format);
      }
    };

    window.addEventListener('podscare_printer_format_changed', handleFormatChange);
    return () => {
      window.removeEventListener('podscare_printer_format_changed', handleFormatChange);
    };
  }, []);

  const setFormat = useCallback((newFormat: PrintFormat) => {
    setCurrentFormatState(newFormat);
    setStoredPrintFormat(newFormat);
  }, []);

  /**
   * Kích hoạt in ngầm phiếu sửa chữa hoặc phiếu kỹ thuật
   */
  const printReceipt = useCallback(
    async (
      order: RepairOrder,
      formatOverride?: PrintFormat,
      optionsOrRoutingSlip: ThermalK80RenderOptions | boolean = false
    ): Promise<boolean> => {
      if (typeof window === 'undefined' || !order) {
        return false;
      }

      const activeFormat = formatOverride || currentFormat || 'k80';
      setIsPrinting(true);

      return new Promise<boolean>((resolve) => {
        try {
          // 1. Tạo iframe ẩn ngoài viewport
          const iframe = document.createElement('iframe');
          iframe.setAttribute('role', 'presentation');
          iframe.setAttribute('title', 'silent-print-job');
          iframe.style.position = 'fixed';
          iframe.style.top = '-9999px';
          iframe.style.left = '-9999px';
          iframe.style.width = '0px';
          iframe.style.height = '0px';
          iframe.style.border = 'none';
          iframe.style.opacity = '0';
          iframe.style.pointerEvents = 'none';

          // 2. Chuẩn bị nội dung HTML tương ứng
          const origin = window.location.origin;
          const branding =
            typeof optionsOrRoutingSlip === 'object' && optionsOrRoutingSlip !== null
              ? optionsOrRoutingSlip.branding
              : undefined;
          const htmlContent =
            activeFormat === 'a4'
              ? renderA4ReceiptHTML(order, origin, branding)
              : renderThermalK80HTML(order, origin, optionsOrRoutingSlip);

          // Biến quản lý dọn dẹp (chỉ chạy 1 lần)
          let cleanedUp = false;
          const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            try {
              if (iframe.parentNode) {
                iframe.parentNode.removeChild(iframe);
              }
            } catch (err) {
              console.warn('[useSilentPrint] Error removing iframe:', err);
            }
            setIsPrinting(false);
            resolve(true);
            options?.onSuccess?.();
          };

          // 3. Gắn iframe vào DOM
          document.body.appendChild(iframe);

          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!iframeDoc) {
            throw new Error('Cannot access iframe document');
          }

          // 4. Ghi nội dung HTML vào iframe
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();

          // 5. Kích hoạt print khi document đã tải xong
          const triggerPrint = () => {
            const win = iframe.contentWindow;
            if (!win) {
              cleanup();
              return;
            }

            try {
              // Lắng nghe sự kiện sau khi in xong (hoặc người dùng bấm Cancel)
              win.addEventListener('afterprint', () => {
                cleanup();
              });
            } catch {}

            // Fallback timeout: Tự dọn dẹp sau 2.5s nếu trình duyệt không bắn afterprint
            const fallbackTimer = setTimeout(() => {
              cleanup();
            }, 2500);

            try {
              win.focus();
              win.print();
            } catch (printErr: any) {
              clearTimeout(fallbackTimer);
              cleanup();
              options?.onError?.(printErr);
            }
          };

          // Đợi một khoảng ngắn để trình duyệt render SVG và font chữ
          if (iframe.contentWindow?.document.readyState === 'complete') {
            setTimeout(triggerPrint, 80);
          } else {
            iframe.onload = () => {
              setTimeout(triggerPrint, 80);
            };
          }
        } catch (err: any) {
          console.error('[useSilentPrint] Execution failed:', err);
          setIsPrinting(false);
          options?.onError?.(err);
          resolve(false);
        }
      });
    },
    [currentFormat, options]
  );

  return {
    isPrinting,
    currentFormat,
    setFormat,
    printReceipt,
  };
}
