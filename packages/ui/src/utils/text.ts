/**
 * Tiện ích làm sạch ký tự điều hướng / tàng hình Unicode (Zalo, iOS/macOS Contacts)
 * và chuẩn hóa / đối chiếu số điện thoại linh hoạt trên toàn hệ thống Frontend.
 */

/**
 * Biểu thức chính quy khớp toàn bộ các ký tự điều hướng và khoảng trắng vô hình Unicode:
 * - \u200B-\u200F: Zero-width space, ZWNJ, ZWJ, LRM, RLM
 * - \u202A-\u202E: LRE, RLE, PDF (\u202C), LRO (\u202D), RLO
 * - \u2060-\u206F: Word joiner & invisible operators
 * - \uFEFF: Zero-width no-break space (BOM)
 * - \u00AD: Soft hyphen
 */
export const INVISIBLE_UNICODE_REGEX = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD]/g;

/**
 * Làm sạch tức thời chuỗi nhập vào ô input (onChange):
 * - Xóa toàn bộ ký tự điều hướng/tàng hình Unicode (\u202D, \u202C, \u200B, \uFEFF...).
 * - Đổi non-breaking space (\u00A0) sang khoảng trắng thường (' ').
 * - Không trim() khoảng trắng cuối để người dùng gõ họ tên có dấu cách ("xuân hải") tự nhiên.
 */
export function sanitizeInputLive(val: string | null | undefined): string {
  if (val === null || val === undefined || val === '') {
    return '';
  }
  return String(val)
    .replace(INVISIBLE_UNICODE_REGEX, '')
    .replace(/\u00A0/g, ' ');
}

/**
 * Loại bỏ toàn bộ ký tự điều hướng / tàng hình Unicode khỏi chuỗi văn bản đầu vào.
 * An toàn khi gắn trực tiếp vào sự kiện onChange của Input, FilterBar và Topbar.
 */
export function sanitizeInputText(val: string | null | undefined): string {
  return sanitizeInputLive(val);
}

/**
 * Làm sạch chuỗi truy vấn tìm kiếm trước khi gửi API hoặc so sánh:
 * - Xóa ký tự ẩn Unicode, đổi \u00A0 sang khoảng trắng thường, gộp khoảng trắng thừa và trim() 2 đầu.
 */
export function sanitizeSearchQuery(val: string | null | undefined): string {
  return sanitizeInputLive(val).replace(/\s+/g, ' ').trim();
}

/**
 * Chuẩn hóa số điện thoại khách hàng về định dạng chữ số tiêu chuẩn Việt Nam (bắt đầu bằng 0)
 * trước khi lưu hoặc gửi API:
 * - Xóa ký tự ẩn Unicode, khoảng trắng, dấu chấm, gạch ngang, dấu ngoặc.
 * - Đổi tiền tố +84 / 84 (khi chuỗi số dài >= 11 chữ số) về 0.
 * - Tự động thêm số 0 ở đầu nếu chuỗi gồm 9-10 chữ số bắt đầu bằng [35789] (vd: "9877839144" -> "09877839144").
 */
export function normalizePhoneForStorage(phone: string | null | undefined): string {
  const sanitized = sanitizeSearchQuery(phone);
  if (!sanitized) {
    return '';
  }

  const hasPlus84 = sanitized.startsWith('+84');
  const digits = sanitized.replace(/[^0-9]/g, '');

  if (!digits) {
    return sanitized;
  }

  if (digits.startsWith('84') && (hasPlus84 || digits.length >= 11)) {
    return '0' + digits.slice(2);
  }

  if (!digits.startsWith('0') && /^[35789]\d{8,9}$/.test(digits)) {
    return '0' + digits;
  }

  return digits;
}

/**
 * Alias tương thích cho normalizePhoneForStorage khi chuẩn hóa SĐT trong form submit.
 */
export function normalizePhoneForSubmit(phone: string | null | undefined): string {
  return normalizePhoneForStorage(phone);
}

/**
 * Bóc tách chuỗi chữ số lõi (đã bỏ tiền tố 84 hoặc số 0 ở đầu) để đối chiếu hai chiều.
 */
export function extractPhoneCoreDigits(val: string | null | undefined): string {
  const sanitized = sanitizeSearchQuery(val);
  if (!sanitized) {
    return '';
  }

  const hasPlus84 = sanitized.startsWith('+84');
  const digits = sanitized.replace(/[^0-9]/g, '');
  if (!digits) {
    return '';
  }

  if (digits.startsWith('84') && (hasPlus84 || digits.length >= 9)) {
    return digits.slice(2);
  }

  if (digits.startsWith('0') && digits.length >= 4) {
    return digits.slice(1);
  }

  return digits;
}

/**
 * Kiểm tra xem từ khóa tìm kiếm có phải là truy vấn dạng số điện thoại (3-15 chữ số,
 * cho phép khoảng trắng, dấu cộng, dấu chấm, gạch ngang, dấu ngoặc) hay không.
 */
export function isPhoneLikeQuery(query: string | null | undefined): boolean {
  const clean = sanitizeSearchQuery(query);
  if (!clean) {
    return false;
  }
  const stripped = clean.replace(/[\s.\-()+]+/g, '');
  return /^\d{3,15}$/.test(stripped);
}

/**
 * Đối chiếu số điện thoại ứng viên với từ khóa tìm kiếm một cách linh hoạt:
 * - Bỏ qua ký tự ẩn Unicode, khoảng trắng, dấu chấm, gạch ngang.
 * - Khớp chính xác bất kể DB hay từ khóa tìm kiếm lưu thiếu số 0 đầu ("9877839144" vs "09877839144"),
 *   dùng mã quốc gia "+84", hay chỉ nhập 4-10 chữ số cuối.
 */
export function matchesPhoneFlexible(
  candidatePhone: string | null | undefined,
  query: string | null | undefined
): boolean {
  const cleanCandidate = sanitizeSearchQuery(candidatePhone);
  const cleanQuery = sanitizeSearchQuery(query);

  if (!cleanCandidate || !cleanQuery) {
    return false;
  }

  if (cleanCandidate.toLowerCase().includes(cleanQuery.toLowerCase())) {
    return true;
  }

  const strippedQuery = cleanQuery.replace(/[\s.\-()+]+/g, '');
  if (!/^\d{3,15}$/.test(strippedQuery)) {
    return false;
  }

  const candidateDigits = cleanCandidate.replace(/[^0-9]/g, '');
  if (!candidateDigits) {
    return false;
  }

  if (candidateDigits.includes(strippedQuery)) {
    return true;
  }

  const queryCore = extractPhoneCoreDigits(cleanQuery);
  const candidateCore = extractPhoneCoreDigits(cleanCandidate);
  const candidateNormalized = normalizePhoneForStorage(cleanCandidate);

  if (queryCore.length >= 3) {
    if (
      candidateDigits.includes(queryCore) ||
      candidateCore.includes(queryCore) ||
      candidateNormalized.includes('0' + queryCore)
    ) {
      return true;
    }
  }

  return false;
}
