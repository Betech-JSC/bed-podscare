/**
 * printerPreference.ts
 * Quản lý cấu hình khổ in mặc định của máy quầy giao dịch qua localStorage.
 * Chuẩn hóa 2 định dạng: 'k80' (in nhiệt cuộn 80mm) và 'a4' (văn phòng 2 liên).
 */

export type PrintFormat = 'k80' | 'a4';

export const PRINT_STORAGE_KEY = 'podscare_printer_format_pref';

/**
 * Đọc khổ in mặc định đã lưu của trình duyệt.
 * Mặc định trả về 'k80' (khổ nhiệt phổ biến cho quầy tiếp nhận siêu tốc).
 */
export function getStoredPrintFormat(): PrintFormat {
  if (typeof window === 'undefined') {
    return 'k80';
  }
  try {
    const stored = window.localStorage.getItem(PRINT_STORAGE_KEY);
    if (stored === 'a4' || stored === 'k80') {
      return stored;
    }
  } catch (err) {
    console.warn('[printerPreference] Failed to read from localStorage:', err);
  }
  return 'k80';
}

/**
 * Lưu khổ in ưa thích mới vào localStorage của thiết bị máy quầy.
 */
export function setStoredPrintFormat(format: PrintFormat): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(PRINT_STORAGE_KEY, format);
    // Bắn custom event để các component cùng trang cập nhật reactive state tức thì
    window.dispatchEvent(
      new CustomEvent('podscare_printer_format_changed', { detail: { format } })
    );
  } catch (err) {
    console.warn('[printerPreference] Failed to save to localStorage:', err);
  }
}
