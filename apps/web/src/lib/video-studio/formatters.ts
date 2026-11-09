/**
 * Deterministic number, duration, file-size, and timestamp formatters for `/video-studio`.
 * Prevents SSR vs. Client hydration mismatches by binding explicitly to `vi-VN` locale
 * and `Asia/Ho_Chi_Minh` timezone instead of relying on host/browser defaults.
 */

export const FIXED_INITIAL_TIMESTAMP_ISO = '2026-11-08T00:00:00.000Z';

const viIntegerFormatter = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 0,
});

const viDecimal1Formatter = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const viDecimal2Formatter = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const viTimeShortFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * Format integer with fixed `vi-VN` grouping (e.g. `32910000` -> `"32.910.000"`).
 */
export function formatIntegerVi(value?: number | null): string {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return '0';
  return viIntegerFormatter.format(Math.round(safe));
}

/**
 * Format decimal number with fixed `vi-VN` locale.
 */
export function formatDecimalVi(value?: number | null, fractionDigits: 1 | 2 = 1): string {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return fractionDigits === 2 ? '0,00' : '0,0';
  return fractionDigits === 2
    ? viDecimal2Formatter.format(safe)
    : viDecimal1Formatter.format(safe);
}

/**
 * Format percentage with fixed `vi-VN` locale (e.g. `78.5` -> `"78,5%"`).
 */
export function formatPercentVi(value?: number | null, fractionDigits: 1 | 2 = 1): string {
  return `${formatDecimalVi(value, fractionDigits)}%`;
}

/**
 * Format milliseconds into `m:ss` clock string (e.g. `134000` -> `"2:14"`, `108000` -> `"1:48"`).
 */
export function formatDurationClock(ms?: number | null): string {
  const safeMs = Math.max(0, Math.round(Number(ms) || 0));
  const totalSeconds = Math.round(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Format milliseconds into `m:ss.d` with tenths of a second (e.g. `38200` -> `"0:38.2"`).
 */
export function formatDurationClockTenths(ms?: number | null): string {
  const safeMs = Math.max(0, Math.round(Number(ms) || 0));
  const totalTenths = Math.round(safeMs / 100);
  const minutes = Math.floor(totalTenths / 600);
  const remTenths = totalTenths % 600;
  const seconds = Math.floor(remTenths / 10);
  const tenths = remTenths % 10;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

/**
 * Format milliseconds into `mm:ss.SSS` precision timecode (e.g. `38200` -> `"00:38.200"`).
 */
export function formatDurationTimecodeMs(ms?: number | null): string {
  const safeMs = Math.max(0, Math.round(Number(ms) || 0));
  const minutes = Math.floor(safeMs / 60000);
  const rem = safeMs % 60000;
  const seconds = Math.floor(rem / 1000);
  const millis = rem % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/**
 * Format duration in milliseconds to human-readable seconds (e.g. `4500` -> `"4.5 giây"` or `"4.5s"`).
 */
export function formatDurationSecondsLabel(
  ms?: number | null,
  unit: 'giây' | 's' = 'giây'
): string {
  const safeMs = Math.max(0, Math.round(Number(ms) || 0));
  const sec = safeMs / 1000;
  const formatted =
    safeMs < 1000 && safeMs % 100 !== 0
      ? sec.toFixed(2)
      : Number.isInteger(sec)
      ? String(sec)
      : sec.toFixed(1);
  return unit === 's' ? `${formatted}s` : `${formatted} giây`;
}

/**
 * Format byte count into KB / MB with fixed `vi-VN` number formatting.
 */
export function formatFileSizeVi(bytes?: number | null): string {
  const safeBytes = Math.max(0, Number(bytes) || 0);
  if (safeBytes === 0) return '0 KB';
  if (safeBytes < 1024 * 1024) {
    const kb = Math.max(0.1, safeBytes / 1024);
    return `${viDecimal1Formatter.format(kb)} KB`;
  }
  const mb = safeBytes / (1024 * 1024);
  return `${viDecimal1Formatter.format(mb)} MB`;
}

/**
 * Format ISO timestamp to `HH:mm:ss` in `Asia/Ho_Chi_Minh` timezone so SSR and Client match.
 */
export function formatTimeShortVi(isoOrRaw?: string | null): string {
  if (!isoOrRaw) return '--:--:--';
  try {
    const d = new Date(isoOrRaw);
    if (Number.isNaN(d.getTime())) return String(isoOrRaw);
    return viTimeShortFormatter.format(d);
  } catch {
    return String(isoOrRaw);
  }
}
