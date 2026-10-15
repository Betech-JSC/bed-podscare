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
  type TenantReceiptBranding,
} from './thermalK80HtmlBuilder';
import { renderA4ReceiptHTML } from './a4ReceiptHtmlBuilder';
import { useOptionalPodsCare } from '../../providers';

export interface UseSilentPrintOptions {
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

export interface UseSilentPrintReturn {
  isPrinting: boolean;
  currentFormat: PrintFormat;
  setFormat: (format: PrintFormat) => void;
  printReceipt: (
    orderOrOrders: RepairOrder | RepairOrder[],
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
  const podsCare = useOptionalPodsCare();

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
   * Kích hoạt in ngầm phiếu sửa chữa hoặc phiếu kỹ thuật (hỗ trợ đơn lẻ hoặc mảng đơn hàng gộp)
   */
  const printReceipt = useCallback(
    async (
      orderOrOrders: RepairOrder | RepairOrder[],
      formatOverride?: PrintFormat,
      optionsOrRoutingSlip: ThermalK80RenderOptions | boolean = false
    ): Promise<boolean> => {
      if (typeof window === 'undefined' || !orderOrOrders) {
        return false;
      }
      if (Array.isArray(orderOrOrders) && orderOrOrders.length === 0) {
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

          // 2. Chuẩn bị nội dung HTML tương ứng (Single-flight Print Job) + Fallback Tenant Branding
          const origin = window.location.origin;
          const primaryOrder = Array.isArray(orderOrOrders) ? orderOrOrders[0] : orderOrOrders;
          let storedTenant: any = null;
          try {
            const rawUser = window.localStorage.getItem('podscare_user');
            if (rawUser) {
              storedTenant = JSON.parse(rawUser)?.tenant || null;
            }
          } catch {}

          const fallbackTenant =
            primaryOrder?.tenant ||
            podsCare?.tenantBranding ||
            podsCare?.currentUser?.tenant ||
            storedTenant;

          const callerBranding =
            typeof optionsOrRoutingSlip === 'object' && optionsOrRoutingSlip !== null
              ? optionsOrRoutingSlip.branding
              : undefined;

          const effectiveBranding: TenantReceiptBranding | undefined =
            callerBranding || fallbackTenant
              ? {
                  logoUrl:
                    callerBranding?.logoUrl !== undefined
                      ? callerBranding.logoUrl
                      : fallbackTenant?.logo_url ?? null,
                  storeName:
                    callerBranding?.storeName ||
                    fallbackTenant?.name ||
                    undefined,
                  hotline:
                    callerBranding?.hotline !== undefined
                      ? callerBranding.hotline
                      : fallbackTenant?.hotline ?? null,
                  footerNote:
                    callerBranding?.footerNote !== undefined
                      ? callerBranding.footerNote
                      : fallbackTenant?.receipt_footer_note ?? null,
                  bankCode:
                    callerBranding?.bankCode !== undefined
                      ? callerBranding.bankCode
                      : (fallbackTenant as any)?.bank_code ?? null,
                  bankAccountNumber:
                    callerBranding?.bankAccountNumber !== undefined
                      ? callerBranding.bankAccountNumber
                      : (fallbackTenant as any)?.bank_account_number ?? null,
                  bankAccountHolder:
                    callerBranding?.bankAccountHolder !== undefined
                      ? callerBranding.bankAccountHolder
                      : (fallbackTenant as any)?.bank_account_holder ?? null,
                }
              : undefined;

          const k80Options: ThermalK80RenderOptions =
            typeof optionsOrRoutingSlip === 'boolean'
              ? { isRoutingSlip: optionsOrRoutingSlip, branding: effectiveBranding }
              : { ...optionsOrRoutingSlip, branding: effectiveBranding };

          const htmlContent =
            activeFormat === 'a4'
              ? renderA4ReceiptHTML(orderOrOrders, origin, effectiveBranding)
              : renderThermalK80HTML(orderOrOrders, origin, k80Options);

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

          // 5. Kích hoạt print khi document và toàn bộ ảnh (logo, QR) đã tải xong
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

          let printTriggered = false;
          const waitForImagesAndPrint = () => {
            if (printTriggered) return;
            printTriggered = true;

            const images = Array.from(iframeDoc.images || []);
            const pendingImages = images.filter((img) => !img.complete);

            if (pendingImages.length === 0) {
              setTimeout(triggerPrint, 80);
              return;
            }

            const imagePromises = pendingImages.map(
              (img) =>
                new Promise<void>((resImg) => {
                  const onDone = () => {
                    img.removeEventListener('load', onDone);
                    img.removeEventListener('error', onDone);
                    resImg();
                  };
                  img.addEventListener('load', onDone);
                  img.addEventListener('error', onDone);
                })
            );

            const timeoutPromise = new Promise<void>((resTimeout) => {
              setTimeout(resTimeout, 1500);
            });

            Promise.race([Promise.all(imagePromises), timeoutPromise]).then(() => {
              setTimeout(triggerPrint, 50);
            });
          };

          // Đợi trình duyệt tải xong DOM và toàn bộ ảnh trong iframe trước khi gọi lệnh in
          if (iframe.contentWindow?.document.readyState === 'complete') {
            waitForImagesAndPrint();
          } else {
            iframe.onload = () => {
              waitForImagesAndPrint();
            };
            setTimeout(waitForImagesAndPrint, 120);
          }
        } catch (err: any) {
          console.error('[useSilentPrint] Execution failed:', err);
          setIsPrinting(false);
          options?.onError?.(err);
          resolve(false);
        }
      });
    },
    [currentFormat, options, podsCare?.tenantBranding, podsCare?.currentUser?.tenant]
  );

  return {
    isPrinting,
    currentFormat,
    setFormat,
    printReceipt,
  };
}

