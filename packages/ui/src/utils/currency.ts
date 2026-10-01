/**
 * Utility functions for Vietnamese Dong (VNĐ) currency formatting and parsing.
 * FIXO Repair OS Standard: Dot '.' as thousands separator, optional '₫' suffix.
 */

export interface FormatVNDOptions {
  /**
   * Fallback string when value is null, undefined, or NaN.
   * If not provided, defaults to "0 ₫" (or "0" when showSuffix is false).
   */
  fallback?: string;
  /**
   * Whether to append the '₫' currency suffix. Defaults to true.
   */
  showSuffix?: boolean;
}

/**
 * Formats a numeric value into a standardized VNĐ string (e.g., "850.000 ₫").
 * Handles 0 correctly, as well as null, undefined, and NaN with configurable fallback.
 */
export function formatVND(
  value: number | string | null | undefined,
  options?: FormatVNDOptions
): string {
  const showSuffix = options?.showSuffix !== false;

  if (value === null || value === undefined || value === '') {
    if (options?.fallback !== undefined) {
      return options.fallback;
    }
    return showSuffix ? '0 ₫' : '0';
  }

  const num =
    typeof value === 'number'
      ? isNaN(value)
        ? null
        : Math.floor(value)
      : parseCurrency(value);

  if (num === null) {
    if (options?.fallback !== undefined) {
      return options.fallback;
    }
    return showSuffix ? '0 ₫' : '0';
  }

  const formatted = new Intl.NumberFormat('vi-VN').format(num);
  return showSuffix ? `${formatted} ₫` : formatted;
}

/**
 * Strips all non-digit characters and returns a clean, non-negative integer.
 * Useful for normalizing form inputs before sending to API payloads.
 */
export function parseCurrency(formattedValue: string | number | null | undefined): number {
  if (formattedValue === null || formattedValue === undefined || formattedValue === '') {
    return 0;
  }
  if (typeof formattedValue === 'number') {
    return isNaN(formattedValue) ? 0 : Math.max(0, Math.floor(formattedValue));
  }
  const clean = String(formattedValue).replace(/\D/g, '');
  if (!clean) {
    return 0;
  }
  const num = parseInt(clean, 10);
  return isNaN(num) ? 0 : Math.max(0, num);
}

/**
 * Converts a raw number or string into a dot-separated thousands mask (e.g. "100.000").
 * Preserves empty string when input is empty or invalid.
 */
export function formatCurrencyMask(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') {
    return '';
  }
  const digits = String(val).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) {
    return '';
  }
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
