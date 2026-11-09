import { defaultHttpClient } from '@podscare/api-client';

export type ThreadsAccountStatus = 'active' | 'needs_reauth' | 'paused' | 'disabled';

export type ThreadsMediaType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL';

export type ThreadsReplyControl = 'everyone' | 'accounts_you_follow' | 'mentioned_only';

export type ThreadsPostStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled';

export type ThreadsPublishLogAction =
  | 'oauth_exchange'
  | 'token_refresh'
  | 'create_container'
  | 'poll_container'
  | 'publish'
  | 'quota_check'
  | 'fetch_permalink'
  | 'alert_sent'
  | string;

export interface ThreadsAccount {
  id: number;
  display_name: string;
  username: string | null;
  threads_user_id: string | null;
  app_group: string;
  token_expires_at: string | null;
  last_refreshed_at: string | null;
  status: ThreadsAccountStatus;
  daily_post_cap: number;
  published_today_count: number;
  active_hours_start: string;
  active_hours_end: string;
  quota_used_24h: number;
  quota_total_24h: number;
  last_error_message: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ThreadsPost {
  id: number;
  account_id: number;
  account?: {
    id: number;
    display_name: string;
    username: string | null;
    status: ThreadsAccountStatus;
    app_group: string;
  } | null;
  reply_to_post_id: number | null;
  thread_group_key: string | null;
  reply_order: number;
  content_text: string | null;
  effective_text?: string;
  media_type: ThreadsMediaType;
  media_urls: string[] | null;
  link_attachment: string | null;
  topic_tag: string | null;
  reply_control: ThreadsReplyControl;
  is_sponsored: boolean;
  sponsored_suffix: string | null;
  client_ref: string | null;
  content_hash?: string | null;
  import_batch_id?: string | null;
  scheduled_at: string | null;
  status: ThreadsPostStatus;
  container_id: string | null;
  threads_media_id: string | null;
  permalink: string | null;
  published_at: string | null;
  retry_count: number;
  next_retry_at: string | null;
  error_code: string | null;
  error_message: string | null;
  replies?: ThreadsPost[];
  created_at?: string;
  updated_at?: string;
}

export interface ThreadsPublishLog {
  id: number;
  account_id: number | null;
  post_id: number | null;
  account?: {
    id: number;
    display_name: string;
    username: string | null;
  } | null;
  action: ThreadsPublishLogAction;
  http_status: number | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  duration_ms: number | null;
  created_at: string;
}

export interface ThreadsDashboardStats {
  total_accounts: number;
  active_accounts: number;
  needs_reauth_accounts: number;
  paused_accounts: number;
  scheduled_today: number;
  published_today: number;
  failed_posts: number;
  sponsored_posts_count: number;
  recent_logs: ThreadsPublishLog[];
}

export interface CsvImportRowError {
  row: number;
  account_username?: string;
  error_code?: string;
  message: string;
}

export interface CsvImportResult {
  import_batch_id: string;
  total_rows: number;
  imported_count: number;
  failed_count: number;
  jitter_minutes: number;
  posts: ThreadsPost[];
  errors: CsvImportRowError[];
}

export interface CreateThreadsAccountPayload {
  display_name: string;
  username?: string | null;
  threads_user_id?: string | null;
  app_group?: string;
  daily_post_cap?: number;
  active_hours_start?: string;
  active_hours_end?: string;
  notes?: string | null;
}

export interface UpdateThreadsAccountPayload extends Partial<CreateThreadsAccountPayload> {
  status?: ThreadsAccountStatus;
}

export interface ThreadStepDraft {
  step_key: string;
  content_text: string;
  media_type: ThreadsMediaType;
  media_urls: string[];
  link_attachment: string;
  topic_tag: string;
  scheduled_at: string | null;
}

export interface CreateThreadsPostPayload {
  account_id: number;
  content_text: string;
  media_type: ThreadsMediaType;
  media_urls?: string[];
  link_attachment?: string | null;
  topic_tag?: string | null;
  reply_control?: ThreadsReplyControl;
  is_sponsored?: boolean;
  sponsored_suffix?: string | null;
  client_ref?: string | null;
  scheduled_at?: string | null;
  status?: ThreadsPostStatus;
  reply_to_post_id?: number | null;
  thread_group_key?: string | null;
  reply_order?: number;
  chain_mode?: 'auto' | 'scheduled';
  thread_steps?: Array<{
    content_text: string;
    media_type: ThreadsMediaType;
    media_urls?: string[];
    link_attachment?: string | null;
    topic_tag?: string | null;
    scheduled_at?: string | null;
  }>;
}

export interface ThreadsPostFilterParams {
  status?: string;
  account_id?: number | string;
  is_sponsored?: boolean | string;
  client_ref?: string;
  search?: string;
}

export interface CsvImportOptions {
  csv_text: string;
  file?: File | null;
  jitter_minutes?: number;
  active_hours_start?: string;
  active_hours_end?: string;
  default_is_sponsored?: boolean;
  default_sponsored_suffix?: string;
  default_client_ref?: string;
}

export const THREADS_MAX_CHARS = 500;
export const THREADS_MAX_UNIQUE_LINKS = 5;

/**
 * Tính văn bản xuất bản thực tế theo cơ chế `is_sponsored` Cách C:
 * 1. Mặc định giữ nguyên 100% `content_text` gốc khi `is_sponsored = false` hoặc `sponsored_suffix` rỗng.
 * 2. Chỉ khi `is_sponsored = true` VÀ `sponsored_suffix` khác rỗng (mà cuối bài chưa có hậu tố đó)
 *    thì hệ thống mới nối vào cuối bài khi tính giới hạn 500 ký tự UTF-8 và khi gửi lên Meta Threads API.
 */
export function resolveEffectiveText(
  contentText: string,
  isSponsored: boolean,
  sponsoredSuffix?: string | null
): string {
  const normalized = (contentText || '').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd();
  if (!isSponsored) {
    return normalized;
  }
  const cleanSuffix = (sponsoredSuffix || '').trim();
  if (!cleanSuffix) {
    return normalized;
  }
  if (!normalized) {
    return cleanSuffix;
  }
  if (normalized.toLowerCase().endsWith(cleanSuffix.toLowerCase())) {
    return normalized;
  }
  const separator = normalized.includes('\n') ? '\n' : ' ';
  return `${normalized}${separator}${cleanSuffix}`;
}

/**
 * Đếm chính xác số lượng ký tự UTF-8 (Unicode code points), đồng bộ với `mb_strlen($text, 'UTF-8')` trên PHP.
 */
export function countUtf8Chars(text: string): number {
  return Array.from(text || '').length;
}

/**
 * Trích xuất danh sách các URL HTTP/HTTPS duy nhất trong văn bản cộng với `link_attachment`.
 * Dùng để kiểm định giới hạn <= 5 unique links của Meta Threads API (`THREADS_API__LINK_LIMIT_EXCEEDED`).
 */
export function extractUniqueUrls(contentText: string, linkAttachment?: string | null): string[] {
  const regex = /https?:\/\/[^\s<>"')]+/gi;
  const matches = (contentText || '').match(regex) || [];
  const uniqueSet = new Set<string>();

  matches.forEach((rawUrl) => {
    const cleaned = rawUrl.replace(/[.,;!?]+$/, '').trim();
    if (cleaned) {
      uniqueSet.add(cleaned);
    }
  });

  const cleanAttachment = (linkAttachment || '').trim();
  if (cleanAttachment && /^https?:\/\//i.test(cleanAttachment)) {
    uniqueSet.add(cleanAttachment);
  }

  return Array.from(uniqueSet);
}

export interface PostValidationResult {
  valid: boolean;
  effectiveText: string;
  charCount: number;
  uniqueUrls: string[];
  errors: string[];
}

export function validateThreadsDraft(input: {
  contentText: string;
  mediaType: ThreadsMediaType;
  mediaUrls?: string[];
  linkAttachment?: string | null;
  topicTag?: string | null;
  isSponsored?: boolean;
  sponsoredSuffix?: string | null;
}): PostValidationResult {
  const errors: string[] = [];
  const effectiveText = resolveEffectiveText(
    input.contentText,
    Boolean(input.isSponsored),
    input.sponsoredSuffix
  );
  const charCount = countUtf8Chars(effectiveText);
  const uniqueUrls = extractUniqueUrls(effectiveText, input.linkAttachment);
  const mediaUrls = (input.mediaUrls || []).map((u) => u.trim()).filter(Boolean);

  if (!effectiveText.trim() && mediaUrls.length === 0) {
    errors.push('Bài đăng phải có nội dung văn bản hoặc ít nhất 1 đường dẫn media hợp lệ.');
  }

  if (charCount > THREADS_MAX_CHARS) {
    errors.push(
      `Văn bản xuất bản vượt quá giới hạn ${THREADS_MAX_CHARS} ký tự UTF-8 (hiện tại: ${charCount} ký tự).`
    );
  }

  if (uniqueUrls.length > THREADS_MAX_UNIQUE_LINKS) {
    errors.push(
      `Bài đăng chứa ${uniqueUrls.length} liên kết duy nhất, vượt quá trần ${THREADS_MAX_UNIQUE_LINKS} liên kết (THREADS_API__LINK_LIMIT_EXCEEDED).`
    );
  }

  if (input.linkAttachment && input.linkAttachment.trim()) {
    if (!/^https:\/\//i.test(input.linkAttachment.trim())) {
      errors.push('Liên kết đính kèm (link_attachment) bắt buộc sử dụng giao thức https://.');
    }
  }

  if (input.mediaType !== 'TEXT') {
    if (mediaUrls.length === 0) {
      errors.push(`Loại bài ${input.mediaType} yêu cầu cung cấp đường dẫn media công khai (https://).`);
    }
    const invalidMedia = mediaUrls.find((u) => !/^https:\/\//i.test(u));
    if (invalidMedia) {
      errors.push(`Đường dẫn media "${invalidMedia}" bắt buộc bắt đầu bằng https://.`);
    }
  }

  if (input.mediaType === 'CAROUSEL' && (mediaUrls.length < 2 || mediaUrls.length > 20)) {
    errors.push('Bài đăng CAROUSEL bắt buộc có từ 2 đến 20 đường dẫn media công khai.');
  }

  if (input.topicTag && input.topicTag.trim()) {
    const cleanTag = input.topicTag.trim();
    if (cleanTag.length > 50 || /[.&]/.test(cleanTag)) {
      errors.push('Chủ đề (topic_tag) tối đa 50 ký tự và không được chứa dấu chấm (.) hoặc ký tự (&).');
    }
  }

  return {
    valid: errors.length === 0,
    effectiveText,
    charCount,
    uniqueUrls,
    errors,
  };
}

/**
 * Dữ liệu mẫu khởi tạo 20 tài khoản Threads thuộc sở hữu công ty (Company-owned Multi-Account Network)
 * phục vụ chế độ fallback an toàn khi xem preview hoặc khi backend chưa khởi chạy.
 */
const INITIAL_DEMO_ACCOUNTS: ThreadsAccount[] = [
  {
    id: 1,
    display_name: 'PodsCare Official 01 · Flagship',
    username: 'podscare.vn',
    threads_user_id: '25400192837101',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-28T09:00:00Z',
    last_refreshed_at: '2026-10-29T02:00:00Z',
    status: 'active',
    daily_post_cap: 8,
    published_today_count: 5,
    active_hours_start: '08:00',
    active_hours_end: '22:00',
    quota_used_24h: 5,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Kênh thương hiệu chính thức toàn hệ thống',
  },
  {
    id: 2,
    display_name: 'PodsCare Official 02 · Lab Kỹ Thuật',
    username: 'podscare.lab',
    threads_user_id: '25400192837102',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-25T09:00:00Z',
    last_refreshed_at: '2026-10-26T02:00:00Z',
    status: 'active',
    daily_post_cap: 8,
    published_today_count: 4,
    active_hours_start: '08:00',
    active_hours_end: '22:00',
    quota_used_24h: 4,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Chia sẻ kiến thức sửa chữa chuyên sâu AirPods & âm thanh',
  },
  {
    id: 3,
    display_name: 'PodsCare Official 03 · Sài Gòn Q1',
    username: 'podscare.saigon',
    threads_user_id: '25400192837103',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-21T09:00:00Z',
    last_refreshed_at: '2026-10-22T02:00:00Z',
    status: 'active',
    daily_post_cap: 6,
    published_today_count: 3,
    active_hours_start: '08:30',
    active_hours_end: '21:30',
    quota_used_24h: 3,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Chi nhánh trung tâm Quận 1',
  },
  {
    id: 4,
    display_name: 'PodsCare Official 04 · Hà Nội Cầu Giấy',
    username: 'podscare.hanoi',
    threads_user_id: '25400192837104',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-11-16T09:00:00Z',
    last_refreshed_at: '2026-09-17T02:00:00Z',
    status: 'active',
    daily_post_cap: 6,
    published_today_count: 3,
    active_hours_start: '08:00',
    active_hours_end: '22:00',
    quota_used_24h: 3,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Token còn dưới 14 ngày — sẽ tự động gia hạn ở phiên cron kế tiếp',
  },
  {
    id: 5,
    display_name: 'PodsCare Official 05 · Đà Nẵng',
    username: 'podscare.danang',
    threads_user_id: '25400192837105',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-19T09:00:00Z',
    last_refreshed_at: '2026-10-20T02:00:00Z',
    status: 'active',
    daily_post_cap: 6,
    published_today_count: 2,
    active_hours_start: '08:00',
    active_hours_end: '21:30',
    quota_used_24h: 2,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Khu vực miền Trung',
  },
  {
    id: 6,
    display_name: 'PodsCare Official 06 · Chẩn Đoán Pin',
    username: 'podscare.battery',
    threads_user_id: '25400192837106',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-11-05T09:00:00Z',
    last_refreshed_at: '2026-09-06T02:00:00Z',
    status: 'needs_reauth',
    daily_post_cap: 8,
    published_today_count: 0,
    active_hours_start: '08:00',
    active_hours_end: '22:00',
    quota_used_24h: 0,
    quota_total_24h: 250,
    last_error_message: 'HTTP 401: Session has expired or user changed password ([REDACTED_TOKEN]).',
    notes: 'Cần quản trị viên bấm kết nối lại OAuth 2.0',
  },
  {
    id: 7,
    display_name: 'PodsCare Official 07 · Chống Ồn ANC',
    username: 'podscare.anc',
    threads_user_id: '25400192837107',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-30T09:00:00Z',
    last_refreshed_at: '2026-10-31T02:00:00Z',
    status: 'active',
    daily_post_cap: 8,
    published_today_count: 2,
    active_hours_start: '09:00',
    active_hours_end: '22:00',
    quota_used_24h: 2,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Chuyên đề xử lý rè mic & chống ồn chủ động',
  },
  {
    id: 8,
    display_name: 'PodsCare Official 08 · Phụ Kiện Chuẩn',
    username: 'podscare.accessories',
    threads_user_id: '25400192837108',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-18T09:00:00Z',
    last_refreshed_at: '2026-10-19T02:00:00Z',
    status: 'active',
    daily_post_cap: 8,
    published_today_count: 3,
    active_hours_start: '08:00',
    active_hours_end: '22:00',
    quota_used_24h: 3,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Review tip tai nghe, hộp sạc và cáp chuẩn',
  },
  {
    id: 9,
    display_name: 'PodsCare Official 09 · Bảo Hành Điện Tử',
    username: 'podscare.care',
    threads_user_id: '25400192837109',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-22T09:00:00Z',
    last_refreshed_at: '2026-10-23T02:00:00Z',
    status: 'active',
    daily_post_cap: 6,
    published_today_count: 1,
    active_hours_start: '08:00',
    active_hours_end: '21:00',
    quota_used_24h: 1,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Giải đáp chính sách bảo hành & tra cứu mã đơn',
  },
  {
    id: 10,
    display_name: 'PodsCare Official 10 · Vệ Sinh Chuẩn Y Khoa',
    username: 'podscare.clean',
    threads_user_id: '25400192837110',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-15T09:00:00Z',
    last_refreshed_at: '2026-10-16T02:00:00Z',
    status: 'active',
    daily_post_cap: 6,
    published_today_count: 2,
    active_hours_start: '08:30',
    active_hours_end: '21:30',
    quota_used_24h: 2,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Quy trình khử khuẩn UV & làm sạch màng loa',
  },
  {
    id: 11,
    display_name: 'PodsCare Official 11 · Góc Kỹ Sư',
    username: 'podscare.engineer',
    threads_user_id: '25400192837111',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-12T09:00:00Z',
    last_refreshed_at: '2026-10-13T02:00:00Z',
    status: 'active',
    daily_post_cap: 8,
    published_today_count: 2,
    active_hours_start: '08:00',
    active_hours_end: '22:00',
    quota_used_24h: 2,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Nhật ký ca khó tại bàn kỹ thuật',
  },
  {
    id: 12,
    display_name: 'PodsCare Official 12 · Âm Thanh Hi-Res',
    username: 'podscare.audio',
    threads_user_id: '25400192837112',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-11-11T09:00:00Z',
    last_refreshed_at: '2026-09-12T02:00:00Z',
    status: 'needs_reauth',
    daily_post_cap: 6,
    published_today_count: 0,
    active_hours_start: '09:00',
    active_hours_end: '22:00',
    quota_used_24h: 0,
    quota_total_24h: 250,
    last_error_message: 'HTTP 403: User has not authorized application threads_content_publish.',
    notes: 'Chờ xác nhận lại lời mời Threads Tester trong Meta App',
  },
  {
    id: 13,
    display_name: 'PodsCare Official 13 · Thủ Đức Hub',
    username: 'podscare.thuduc',
    threads_user_id: '25400192837113',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-27T09:00:00Z',
    last_refreshed_at: '2026-10-28T02:00:00Z',
    status: 'active',
    daily_post_cap: 6,
    published_today_count: 1,
    active_hours_start: '08:00',
    active_hours_end: '21:30',
    quota_used_24h: 1,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Điểm tiếp nhận Làng Đại Học & Khu Công Nghệ Cao',
  },
  {
    id: 14,
    display_name: 'PodsCare Official 14 · Hà Nội Đống Đa',
    username: 'podscare.dongda',
    threads_user_id: '25400192837114',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-26T09:00:00Z',
    last_refreshed_at: '2026-10-27T02:00:00Z',
    status: 'active',
    daily_post_cap: 6,
    published_today_count: 2,
    active_hours_start: '08:00',
    active_hours_end: '22:00',
    quota_used_24h: 2,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Cơ sở Đống Đa - Hà Nội',
  },
  {
    id: 15,
    display_name: 'PodsCare Official 15 · So Sánh Thiết Bị',
    username: 'podscare.compare',
    threads_user_id: '25400192837115',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-20T09:00:00Z',
    last_refreshed_at: '2026-10-21T02:00:00Z',
    status: 'active',
    daily_post_cap: 8,
    published_today_count: 2,
    active_hours_start: '08:00',
    active_hours_end: '22:00',
    quota_used_24h: 2,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Đánh giá khách quan các dòng tai nghe True Wireless',
  },
  {
    id: 16,
    display_name: 'PodsCare Official 16 · Mẹo Dùng Bền',
    username: 'podscare.tips',
    threads_user_id: '25400192837116',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-24T09:00:00Z',
    last_refreshed_at: '2026-10-25T02:00:00Z',
    status: 'active',
    daily_post_cap: 8,
    published_today_count: 3,
    active_hours_start: '08:00',
    active_hours_end: '22:00',
    quota_used_24h: 3,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Cẩm nang bảo quản pin và bản lề hộp sạc',
  },
  {
    id: 17,
    display_name: 'PodsCare Official 17 · Kiểm Định Chính Hãng',
    username: 'podscare.verify',
    threads_user_id: '25400192837117',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-23T09:00:00Z',
    last_refreshed_at: '2026-10-24T02:00:00Z',
    status: 'active',
    daily_post_cap: 6,
    published_today_count: 1,
    active_hours_start: '08:00',
    active_hours_end: '21:30',
    quota_used_24h: 1,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Hướng dẫn phân biệt linh kiện zin & linh kiện lô',
  },
  {
    id: 18,
    display_name: 'PodsCare Official 18 · Hợp Tác Đối Tác',
    username: 'podscare.partner',
    threads_user_id: '25400192837118',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-29T09:00:00Z',
    last_refreshed_at: '2026-10-30T02:00:00Z',
    status: 'active',
    daily_post_cap: 8,
    published_today_count: 2,
    active_hours_start: '08:00',
    active_hours_end: '22:00',
    quota_used_24h: 2,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Chuyên đăng nội dung hợp tác thương hiệu (Sponsored)',
  },
  {
    id: 19,
    display_name: 'PodsCare Official 19 · Hải Phòng',
    username: 'podscare.haiphong',
    threads_user_id: '25400192837119',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-14T09:00:00Z',
    last_refreshed_at: '2026-10-15T02:00:00Z',
    status: 'paused',
    daily_post_cap: 6,
    published_today_count: 0,
    active_hours_start: '08:00',
    active_hours_end: '21:00',
    quota_used_24h: 0,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Tạm dừng lịch đăng trong tuần bảo trì cửa hàng',
  },
  {
    id: 20,
    display_name: 'PodsCare Official 20 · Cần Thơ',
    username: 'podscare.cantho',
    threads_user_id: '25400192837120',
    app_group: 'primary_dev_app',
    token_expires_at: '2026-12-17T09:00:00Z',
    last_refreshed_at: '2026-10-18T02:00:00Z',
    status: 'paused',
    daily_post_cap: 6,
    published_today_count: 0,
    active_hours_start: '08:00',
    active_hours_end: '21:00',
    quota_used_24h: 0,
    quota_total_24h: 250,
    last_error_message: null,
    notes: 'Đang chuẩn bị nội dung chiến dịch miền Tây',
  },
];

const INITIAL_DEMO_POSTS: ThreadsPost[] = [
  {
    id: 101,
    account_id: 1,
    account: {
      id: 1,
      display_name: 'PodsCare Official 01 · Flagship',
      username: 'podscare.vn',
      status: 'active',
      app_group: 'primary_dev_app',
    },
    reply_to_post_id: null,
    thread_group_key: 'thread_anc_01',
    reply_order: 0,
    content_text:
      'Vì sao AirPods Pro 2 xuất hiện tiếng sôi nhẹ khi bật chống ồn chủ động (ANC) sau 18 tháng sử dụng? Dưới đây là 3 nguyên nhân thực tế từ bàn đo kiểm âm học tại PodsCare Lab.',
    media_type: 'TEXT',
    media_urls: [],
    link_attachment: null,
    topic_tag: 'PodsCareLab',
    reply_control: 'everyone',
    is_sponsored: false,
    sponsored_suffix: null,
    client_ref: null,
    scheduled_at: '2026-11-09T09:15:00Z',
    status: 'published',
    container_id: '17895695668004550',
    threads_media_id: '1802001928371001',
    permalink: 'https://www.threads.net/@podscare.vn/post/C_abc123',
    published_at: '2026-11-09T09:15:18Z',
    retry_count: 0,
    next_retry_at: null,
    error_code: null,
    error_message: null,
  },
  {
    id: 102,
    account_id: 1,
    account: {
      id: 1,
      display_name: 'PodsCare Official 01 · Flagship',
      username: 'podscare.vn',
      status: 'active',
      app_group: 'primary_dev_app',
    },
    reply_to_post_id: 101,
    thread_group_key: 'thread_anc_01',
    reply_order: 1,
    content_text:
      'Phần 2/2: Lưới micro thu âm hướng ngoài bị bít bởi bụi mịn làm sai lệch pha sóng khử ồn. Việc làm sạch bằng sóng siêu âm khô giúp khôi phục 95% hiệu suất ANC mà không cần tháo vỏ tai nghe.',
    media_type: 'IMAGE',
    media_urls: ['https://cdn.podscare.vn/threads/anc-mesh-inspection-01.jpg'],
    link_attachment: 'https://podscare.vn/kiem-tra-chong-on-anc',
    topic_tag: 'PodsCareLab',
    reply_control: 'everyone',
    is_sponsored: false,
    sponsored_suffix: null,
    client_ref: null,
    scheduled_at: '2026-11-09T09:16:05Z',
    status: 'published',
    container_id: '17895695668004551',
    threads_media_id: '1802001928371002',
    permalink: 'https://www.threads.net/@podscare.vn/post/C_abc124',
    published_at: '2026-11-09T09:16:12Z',
    retry_count: 0,
    next_retry_at: null,
    error_code: null,
    error_message: null,
  },
  {
    id: 103,
    account_id: 18,
    account: {
      id: 18,
      display_name: 'PodsCare Official 18 · Hợp Tác Đối Tác',
      username: 'podscare.partner',
      status: 'active',
      app_group: 'primary_dev_app',
    },
    reply_to_post_id: null,
    thread_group_key: null,
    reply_order: 0,
    content_text:
      'Trải nghiệm bộ đệm tai foam hoạt tính thế hệ mới giúp cách âm thụ động tốt hơn 3dB khi di chuyển máy bay đường dài.',
    media_type: 'IMAGE',
    media_urls: ['https://cdn.podscare.vn/threads/comply-foam-collab.jpg'],
    link_attachment: 'https://podscare.vn/phu-kien/dem-tai-foam',
    topic_tag: 'AudioGear',
    reply_control: 'everyone',
    is_sponsored: true,
    sponsored_suffix: '#Sponsored',
    client_ref: 'BRAND_AUDIOFOAM_Q4',
    scheduled_at: '2026-11-09T14:20:00Z',
    status: 'scheduled',
    container_id: null,
    threads_media_id: null,
    permalink: null,
    published_at: null,
    retry_count: 0,
    next_retry_at: null,
    error_code: null,
    error_message: null,
  },
  {
    id: 104,
    account_id: 2,
    account: {
      id: 2,
      display_name: 'PodsCare Official 02 · Lab Kỹ Thuật',
      username: 'podscare.lab',
      status: 'active',
      app_group: 'primary_dev_app',
    },
    reply_to_post_id: null,
    thread_group_key: 'thread_battery_02',
    reply_order: 0,
    content_text:
      'Bảng thông số nội trở chuẩn của cell pin tai nghe sau 400 chu kỳ sạc xả. Khi nội trở vượt ngưỡng 380 mOhm, tai nghe sẽ tự ngắt nguồn đột ngột dù báo còn 40% dung lượng.',
    media_type: 'TEXT',
    media_urls: [],
    link_attachment: null,
    topic_tag: 'ThayPinAirPods',
    reply_control: 'everyone',
    is_sponsored: true,
    sponsored_suffix: null,
    client_ref: 'PARTNER_CELLTECH_11',
    scheduled_at: '2026-11-09T16:05:00Z',
    status: 'scheduled',
    container_id: null,
    threads_media_id: null,
    permalink: null,
    published_at: null,
    retry_count: 0,
    next_retry_at: null,
    error_code: null,
    error_message: null,
  },
  {
    id: 105,
    account_id: 2,
    account: {
      id: 2,
      display_name: 'PodsCare Official 02 · Lab Kỹ Thuật',
      username: 'podscare.lab',
      status: 'active',
      app_group: 'primary_dev_app',
    },
    reply_to_post_id: 104,
    thread_group_key: 'thread_battery_02',
    reply_order: 1,
    content_text:
      'Bài nối tiếp (Auto-chain 30–60s): Quy trình ép hàn điểm cell pin mới tại PodsCare giữ nguyên mạch BMS gốc để biểu tượng phần trăm pin trên iOS hoạt động chính xác 100%.',
    media_type: 'TEXT',
    media_urls: [],
    link_attachment: null,
    topic_tag: 'ThayPinAirPods',
    reply_control: 'everyone',
    is_sponsored: true,
    sponsored_suffix: null,
    client_ref: 'PARTNER_CELLTECH_11',
    scheduled_at: null,
    status: 'scheduled',
    container_id: null,
    threads_media_id: null,
    permalink: null,
    published_at: null,
    retry_count: 0,
    next_retry_at: null,
    error_code: null,
    error_message: null,
  },
  {
    id: 106,
    account_id: 6,
    account: {
      id: 6,
      display_name: 'PodsCare Official 06 · Chẩn Đoán Pin',
      username: 'podscare.battery',
      status: 'needs_reauth',
      app_group: 'primary_dev_app',
    },
    reply_to_post_id: null,
    thread_group_key: null,
    reply_order: 0,
    content_text:
      '5 dấu hiệu hộp sạc bị rò nguồn tĩnh trên bo mạch khiến tai nghe để qua đêm tự tụt sạch pin.',
    media_type: 'TEXT',
    media_urls: [],
    link_attachment: null,
    topic_tag: 'PodsCare',
    reply_control: 'everyone',
    is_sponsored: false,
    sponsored_suffix: null,
    client_ref: null,
    scheduled_at: '2026-11-09T08:40:00Z',
    status: 'failed',
    container_id: '17895695668004999',
    threads_media_id: null,
    permalink: null,
    published_at: null,
    retry_count: 1,
    next_retry_at: null,
    error_code: 'OAuthException_190',
    error_message:
      'Error validating access token: Session has expired ([REDACTED_TOKEN]). Đã dừng retry tự động và chuyển tài khoản sang needs_reauth.',
  },
];

const INITIAL_DEMO_LOGS: ThreadsPublishLog[] = [
  {
    id: 5001,
    account_id: 1,
    post_id: 101,
    account: {
      id: 1,
      display_name: 'PodsCare Official 01 · Flagship',
      username: 'podscare.vn',
    },
    action: 'create_container',
    http_status: 200,
    request_payload: {
      endpoint: 'POST https://graph.threads.net/v1.0/25400192837101/threads',
      media_type: 'TEXT',
      topic_tag: 'PodsCareLab',
      access_token: '[REDACTED_TOKEN]',
    },
    response_payload: {
      id: '17895695668004550',
    },
    duration_ms: 342,
    created_at: '2026-11-09T09:15:10Z',
  },
  {
    id: 5002,
    account_id: 1,
    post_id: 101,
    account: {
      id: 1,
      display_name: 'PodsCare Official 01 · Flagship',
      username: 'podscare.vn',
    },
    action: 'publish',
    http_status: 200,
    request_payload: {
      endpoint: 'POST https://graph.threads.net/v1.0/25400192837101/threads_publish',
      creation_id: '17895695668004550',
      access_token: '[REDACTED_TOKEN]',
    },
    response_payload: {
      id: '1802001928371001',
      permalink: 'https://www.threads.net/@podscare.vn/post/C_abc123',
    },
    duration_ms: 418,
    created_at: '2026-11-09T09:15:18Z',
  },
  {
    id: 5003,
    account_id: 1,
    post_id: 102,
    account: {
      id: 1,
      display_name: 'PodsCare Official 01 · Flagship',
      username: 'podscare.vn',
    },
    action: 'publish',
    http_status: 200,
    request_payload: {
      endpoint: 'POST https://graph.threads.net/v1.0/25400192837101/threads_publish',
      creation_id: '17895695668004551',
      reply_to_id: '1802001928371001',
      access_token: '[REDACTED_TOKEN]',
    },
    response_payload: {
      id: '1802001928371002',
      permalink: 'https://www.threads.net/@podscare.vn/post/C_abc124',
    },
    duration_ms: 389,
    created_at: '2026-11-09T09:16:12Z',
  },
  {
    id: 5004,
    account_id: 6,
    post_id: 106,
    account: {
      id: 6,
      display_name: 'PodsCare Official 06 · Chẩn Đoán Pin',
      username: 'podscare.battery',
    },
    action: 'publish',
    http_status: 401,
    request_payload: {
      endpoint: 'POST https://graph.threads.net/v1.0/25400192837106/threads_publish',
      creation_id: '17895695668004999',
      access_token: '[REDACTED_TOKEN]',
    },
    response_payload: {
      error: {
        message: 'Error validating access token: Session has expired ([REDACTED_TOKEN])',
        type: 'OAuthException',
        code: 190,
      },
    },
    duration_ms: 215,
    created_at: '2026-11-09T08:40:12Z',
  },
  {
    id: 5005,
    account_id: 4,
    post_id: null,
    account: {
      id: 4,
      display_name: 'PodsCare Official 04 · Hà Nội Cầu Giấy',
      username: 'podscare.hanoi',
    },
    action: 'token_refresh',
    http_status: 200,
    request_payload: {
      endpoint: 'GET https://graph.threads.net/refresh_access_token',
      grant_type: 'th_refresh_token',
      access_token: '[REDACTED_TOKEN]',
    },
    response_payload: {
      token_type: 'bearer',
      expires_in: 5183944,
      access_token: '[REDACTED_TOKEN]',
    },
    duration_ms: 290,
    created_at: '2026-11-09T02:00:04Z',
  },
];

// In-memory state cho chế độ demo fallback
let demoAccountsStore: ThreadsAccount[] = [...INITIAL_DEMO_ACCOUNTS];
let demoPostsStore: ThreadsPost[] = [...INITIAL_DEMO_POSTS];
let demoLogsStore: ThreadsPublishLog[] = [...INITIAL_DEMO_LOGS];

function unwrapApiData<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

/**
 * Kiểm tra lỗi có phải do không kết nối được tới máy chủ Backend (offline preview / proxy 502-504) hay không.
 * Nếu Backend đã phản hồi HTTP status (400..500) hoặc trả về JSON lỗi nghiệp vụ (OAuth, Token hết hạn,
 * Chạm hạn mức Quota, Validator > 500 ký tự, > 5 links, trùng content_hash...), hàm trả về `false`
 * để bắt buộc ném lỗi thật lên giao diện, tuyệt đối không nuốt lỗi.
 */
export function isNetworkUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return true;
  }

  const record = err as Record<string, unknown>;
  const rawStatus =
    typeof record.status === 'number'
      ? record.status
      : typeof record.statusCode === 'number'
      ? record.statusCode
      : record.response &&
        typeof record.response === 'object' &&
        typeof (record.response as Record<string, unknown>).status === 'number'
      ? ((record.response as Record<string, unknown>).status as number)
      : null;

  // status === 0 hoặc null: fetch bị lỗi mạng / DNS / ECONNREFUSED
  if (rawStatus === null || rawStatus === 0) {
    return true;
  }

  // 502 Bad Gateway / 503 Service Unavailable / 504 Gateway Timeout khi proxy không gọi được Backend
  if (rawStatus === 502 || rawStatus === 503 || rawStatus === 504) {
    return true;
  }

  return false;
}

/**
 * Trích xuất thông điệp lỗi chuẩn xác từ phản hồi JSON của Backend (`apps/api`).
 */
export function extractBackendErrorMessage(err: unknown, fallbackMessage: string): string {
  if (!err) {
    return fallbackMessage;
  }

  if (typeof err === 'object') {
    const record = err as Record<string, unknown>;
    const payload =
      record.data && typeof record.data === 'object'
        ? (record.data as Record<string, unknown>)
        : record;

    const errorCode =
      typeof payload.error_code === 'string' && payload.error_code.trim() !== ''
        ? payload.error_code.trim()
        : null;

    const directMessage =
      typeof payload.message === 'string' &&
      payload.message.trim() !== '' &&
      !/^Request failed with status \d+$/i.test(payload.message.trim())
        ? payload.message.trim()
        : null;

    let firstFieldError: string | null = null;
    if (payload.errors && typeof payload.errors === 'object') {
      if (Array.isArray(payload.errors) && payload.errors.length > 0) {
        const firstItem = payload.errors[0];
        if (typeof firstItem === 'string' && firstItem.trim() !== '') {
          firstFieldError = firstItem.trim();
        } else if (firstItem && typeof firstItem === 'object') {
          const itemMsg = (firstItem as Record<string, unknown>).message;
          const itemRow = (firstItem as Record<string, unknown>).row;
          if (typeof itemMsg === 'string' && itemMsg.trim() !== '') {
            firstFieldError =
              typeof itemRow === 'number' ? `Dòng #${itemRow}: ${itemMsg.trim()}` : itemMsg.trim();
          }
        }
      } else {
        for (const [key, val] of Object.entries(payload.errors as Record<string, unknown>)) {
          if (key === 'post' || key === 'account' || key === 'publish_status') {
            continue;
          }
          if (Array.isArray(val) && typeof val[0] === 'string' && val[0].trim() !== '') {
            firstFieldError = val[0].trim();
            break;
          }
          if (typeof val === 'string' && val.trim() !== '') {
            firstFieldError = val.trim();
            break;
          }
        }
      }
    }

    const resolvedMsg = directMessage || firstFieldError;
    if (resolvedMsg) {
      if (errorCode && !resolvedMsg.includes(errorCode)) {
        return `[${errorCode}] ${resolvedMsg}`;
      }
      return resolvedMsg;
    }
  }

  if (
    err instanceof Error &&
    err.message.trim() !== '' &&
    !/^Request failed with status \d+$/i.test(err.message.trim())
  ) {
    return err.message.trim();
  }

  return fallbackMessage;
}

function normalizeAccount(raw: Partial<ThreadsAccount> & Record<string, unknown>): ThreadsAccount {
  return {
    id: Number(raw.id || 0),
    display_name: String(raw.display_name || raw.username || 'Tài khoản Threads'),
    username: raw.username ? String(raw.username) : null,
    threads_user_id: raw.threads_user_id ? String(raw.threads_user_id) : null,
    app_group: String(raw.app_group || 'primary_dev_app'),
    token_expires_at: raw.token_expires_at ? String(raw.token_expires_at) : null,
    last_refreshed_at: raw.last_refreshed_at ? String(raw.last_refreshed_at) : null,
    status: (raw.status as ThreadsAccountStatus) || 'needs_reauth',
    daily_post_cap: typeof raw.daily_post_cap === 'number' ? raw.daily_post_cap : 8,
    published_today_count:
      typeof raw.published_today_count === 'number'
        ? raw.published_today_count
        : typeof (raw as { published_today?: number }).published_today === 'number'
        ? (raw as { published_today: number }).published_today
        : 0,
    active_hours_start: String(raw.active_hours_start || '08:00'),
    active_hours_end: String(raw.active_hours_end || '22:00'),
    quota_used_24h: typeof raw.quota_used_24h === 'number' ? raw.quota_used_24h : 0,
    quota_total_24h: typeof raw.quota_total_24h === 'number' ? raw.quota_total_24h : 250,
    last_error_message: raw.last_error_message ? String(raw.last_error_message) : null,
    notes: raw.notes ? String(raw.notes) : null,
    created_at: raw.created_at ? String(raw.created_at) : undefined,
    updated_at: raw.updated_at ? String(raw.updated_at) : undefined,
  };
}

function computeDemoDashboardStats(): ThreadsDashboardStats {
  const activeCount = demoAccountsStore.filter((a) => a.status === 'active').length;
  const needsReauthCount = demoAccountsStore.filter((a) => a.status === 'needs_reauth').length;
  const pausedCount = demoAccountsStore.filter((a) => a.status === 'paused').length;
  const scheduledToday = demoPostsStore.filter((p) => p.status === 'scheduled').length;
  const publishedToday =
    demoAccountsStore.reduce((sum, a) => sum + (a.published_today_count || 0), 0) ||
    demoPostsStore.filter((p) => p.status === 'published').length;
  const failedPosts = demoPostsStore.filter((p) => p.status === 'failed').length;
  const sponsoredCount = demoPostsStore.filter((p) => p.is_sponsored).length;

  return {
    total_accounts: demoAccountsStore.length,
    active_accounts: activeCount,
    needs_reauth_accounts: needsReauthCount,
    paused_accounts: pausedCount,
    scheduled_today: scheduledToday,
    published_today: publishedToday,
    failed_posts: failedPosts,
    sponsored_posts_count: sponsoredCount,
    recent_logs: demoLogsStore.slice(0, 30),
  };
}

export async function fetchThreadsDashboardStats(): Promise<{
  stats: ThreadsDashboardStats;
  isDemoFallback: boolean;
}> {
  try {
    const res = await defaultHttpClient.get<unknown>('/api/v1/threads/dashboard', {
      skipAuthRedirect: true,
    });
    const raw = unwrapApiData<Partial<ThreadsDashboardStats> & Record<string, unknown>>(res);
    if (raw && typeof raw.total_accounts === 'number') {
      return {
        stats: {
          total_accounts: Number(raw.total_accounts ?? 0),
          active_accounts: Number(raw.active_accounts ?? 0),
          needs_reauth_accounts: Number(raw.needs_reauth_accounts ?? 0),
          paused_accounts: Number(raw.paused_accounts ?? 0),
          scheduled_today: Number(raw.scheduled_today ?? 0),
          published_today: Number(raw.published_today ?? 0),
          failed_posts: Number(raw.failed_posts ?? 0),
          sponsored_posts_count: Number(raw.sponsored_posts_count ?? 0),
          recent_logs: Array.isArray(raw.recent_logs)
            ? (raw.recent_logs as ThreadsPublishLog[])
            : Array.isArray((raw as { publish_logs?: unknown[] }).publish_logs)
            ? ((raw as { publish_logs: ThreadsPublishLog[] }).publish_logs)
            : [],
        },
        isDemoFallback: false,
      };
    }
  } catch (err: unknown) {
    if (!isNetworkUnavailableError(err)) {
      throw new Error(
        extractBackendErrorMessage(err, 'Không thể tải số liệu thống kê Threads từ máy chủ.')
      );
    }
  }

  return {
    stats: computeDemoDashboardStats(),
    isDemoFallback: true,
  };
}

export async function fetchThreadsAccounts(): Promise<{
  accounts: ThreadsAccount[];
  isDemoFallback: boolean;
}> {
  try {
    const res = await defaultHttpClient.get<unknown>('/api/v1/threads/accounts', {
      skipAuthRedirect: true,
    });
    const data = unwrapApiData<unknown>(res);
    const list = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray((data as { items?: unknown[] }).items)
      ? (data as { items: unknown[] }).items
      : null;

    if (Array.isArray(list)) {
      return {
        accounts: list.map((item) =>
          normalizeAccount(item as Partial<ThreadsAccount> & Record<string, unknown>)
        ),
        isDemoFallback: false,
      };
    }
  } catch (err: unknown) {
    if (!isNetworkUnavailableError(err)) {
      throw new Error(
        extractBackendErrorMessage(err, 'Không thể tải danh sách tài khoản Threads từ máy chủ.')
      );
    }
  }

  return {
    accounts: [...demoAccountsStore],
    isDemoFallback: true,
  };
}

export async function createThreadsAccount(
  payload: CreateThreadsAccountPayload
): Promise<ThreadsAccount> {
  try {
    const res = await defaultHttpClient.post<unknown>('/api/v1/threads/accounts', payload, {
      skipAuthRedirect: true,
    });
    const data = unwrapApiData<Partial<ThreadsAccount> & Record<string, unknown>>(res);
    if (data && data.id) {
      return normalizeAccount(data);
    }
  } catch (err: unknown) {
    if (!isNetworkUnavailableError(err)) {
      throw new Error(
        extractBackendErrorMessage(err, 'Không thể tạo tài khoản Threads trên máy chủ.')
      );
    }
  }

  const nextId =
    demoAccountsStore.reduce((max, item) => Math.max(max, item.id), 0) + 1;
  const created: ThreadsAccount = {
    id: nextId,
    display_name: payload.display_name.trim(),
    username: payload.username?.trim() || null,
    threads_user_id: payload.threads_user_id?.trim() || null,
    app_group: payload.app_group || 'primary_dev_app',
    token_expires_at: null,
    last_refreshed_at: null,
    status: 'needs_reauth',
    daily_post_cap: payload.daily_post_cap ?? 8,
    published_today_count: 0,
    active_hours_start: payload.active_hours_start || '08:00',
    active_hours_end: payload.active_hours_end || '22:00',
    quota_used_24h: 0,
    quota_total_24h: 250,
    last_error_message: null,
    notes: payload.notes || null,
  };
  demoAccountsStore = [...demoAccountsStore, created];
  return created;
}

export async function updateThreadsAccount(
  id: number,
  payload: UpdateThreadsAccountPayload
): Promise<ThreadsAccount> {
  try {
    const res = await defaultHttpClient.put<unknown>(`/api/v1/threads/accounts/${id}`, payload, {
      skipAuthRedirect: true,
    });
    const data = unwrapApiData<Partial<ThreadsAccount> & Record<string, unknown>>(res);
    if (data && data.id) {
      return normalizeAccount(data);
    }
  } catch (err: unknown) {
    if (!isNetworkUnavailableError(err)) {
      throw new Error(
        extractBackendErrorMessage(err, 'Không thể cập nhật cấu hình tài khoản Threads.')
      );
    }
  }

  demoAccountsStore = demoAccountsStore.map((acc) =>
    acc.id === id
      ? {
          ...acc,
          ...payload,
          display_name: payload.display_name ?? acc.display_name,
        }
      : acc
  );
  const found = demoAccountsStore.find((acc) => acc.id === id);
  if (!found) {
    throw new Error('Không tìm thấy tài khoản Threads.');
  }
  return found;
}

export async function toggleThreadsAccountStatus(id: number): Promise<ThreadsAccount> {
  try {
    const res = await defaultHttpClient.post<unknown>(
      `/api/v1/threads/accounts/${id}/toggle-status`,
      {},
      { skipAuthRedirect: true }
    );
    const data = unwrapApiData<Partial<ThreadsAccount> & Record<string, unknown>>(res);
    if (data && data.id) {
      return normalizeAccount(data);
    }
  } catch (err: unknown) {
    if (!isNetworkUnavailableError(err)) {
      throw new Error(
        extractBackendErrorMessage(err, 'Không thể chuyển trạng thái tài khoản Threads.')
      );
    }
  }

  demoAccountsStore = demoAccountsStore.map((acc) => {
    if (acc.id !== id) return acc;
    const nextStatus: ThreadsAccountStatus = acc.status === 'active' ? 'paused' : 'active';
    return {
      ...acc,
      status: nextStatus,
    };
  });

  const updated = demoAccountsStore.find((acc) => acc.id === id);
  if (!updated) {
    throw new Error('Không tìm thấy tài khoản cần chuyển trạng thái.');
  }
  return updated;
}

export async function requestThreadsOAuthUrl(
  accountId: number
): Promise<{ authorize_url: string; state: string }> {
  try {
    const res = await defaultHttpClient.get<unknown>(
      `/api/v1/threads/accounts/${accountId}/authorize-url`,
      { skipAuthRedirect: true }
    );
    const data = unwrapApiData<{ authorize_url?: string; url?: string; state?: string }>(res);
    const resolvedUrl = data?.authorize_url || data?.url;
    if (resolvedUrl) {
      return {
        authorize_url: resolvedUrl,
        state: data?.state || `state_${accountId}`,
      };
    }
  } catch (err: unknown) {
    if (!isNetworkUnavailableError(err)) {
      throw new Error(
        extractBackendErrorMessage(err, 'Không thể khởi tạo đường dẫn ủy quyền OAuth 2.0.')
      );
    }
  }

  const stateToken = `podscare_acct_${accountId}_${Date.now()}`;
  const redirectUri = encodeURIComponent(
    'http://localhost:8010/api/v1/threads/oauth/callback'
  );
  return {
    authorize_url: `https://threads.net/oauth/authorize?client_id=META_THREADS_DEV_APP&redirect_uri=${redirectUri}&scope=threads_basic,threads_content_publish&response_type=code&state=${stateToken}`,
    state: stateToken,
  };
}

export async function refreshThreadsAccountTokenNow(accountId: number): Promise<ThreadsAccount> {
  try {
    const res = await defaultHttpClient.post<unknown>(
      `/api/v1/threads/accounts/${accountId}/refresh-token`,
      {},
      { skipAuthRedirect: true }
    );
    const data = unwrapApiData<Partial<ThreadsAccount> & Record<string, unknown>>(res);
    if (data && data.id) {
      return normalizeAccount(data);
    }
  } catch (err: unknown) {
    if (!isNetworkUnavailableError(err)) {
      throw new Error(
        extractBackendErrorMessage(err, 'Làm mới Long-Lived Token thất bại.')
      );
    }
  }

  const now = new Date();
  const expires = new Date(now.getTime() + 60 * 24 * 3600 * 1000);
  demoAccountsStore = demoAccountsStore.map((acc) =>
    acc.id === accountId
      ? {
          ...acc,
          status: 'active',
          last_refreshed_at: now.toISOString(),
          token_expires_at: expires.toISOString(),
          last_error_message: null,
        }
      : acc
  );

  const target = demoAccountsStore.find((acc) => acc.id === accountId);
  if (target) {
    demoLogsStore = [
      {
        id: Date.now(),
        account_id: target.id,
        post_id: null,
        account: {
          id: target.id,
          display_name: target.display_name,
          username: target.username,
        },
        action: 'token_refresh',
        http_status: 200,
        request_payload: {
          endpoint: 'GET https://graph.threads.net/refresh_access_token',
          grant_type: 'th_refresh_token',
          access_token: '[REDACTED_TOKEN]',
        },
        response_payload: {
          token_type: 'bearer',
          expires_in: 5184000,
          access_token: '[REDACTED_TOKEN]',
        },
        duration_ms: 264,
        created_at: now.toISOString(),
      },
      ...demoLogsStore,
    ];
    return target;
  }

  throw new Error('Không tìm thấy tài khoản Threads để làm mới token.');
}

export async function fetchThreadsPosts(
  filters: ThreadsPostFilterParams = {}
): Promise<{ posts: ThreadsPost[]; isDemoFallback: boolean }> {
  try {
    const params: Record<string, string | number | boolean | undefined> = {};
    if (filters.status && filters.status !== 'all') params.status = filters.status;
    if (filters.account_id && filters.account_id !== 'all') params.account_id = filters.account_id;
    if (filters.is_sponsored !== undefined && filters.is_sponsored !== 'all') {
      params.is_sponsored = filters.is_sponsored;
    }
    if (filters.client_ref?.trim()) params.client_ref = filters.client_ref.trim();
    if (filters.search?.trim()) params.search = filters.search.trim();

    const res = await defaultHttpClient.get<unknown>('/api/v1/threads/posts', {
      params,
      skipAuthRedirect: true,
    });
    const raw = unwrapApiData<unknown>(res);
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown[] }).data)
      ? (raw as { data: unknown[] }).data
      : raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown[] }).items)
      ? (raw as { items: unknown[] }).items
      : null;

    if (Array.isArray(list)) {
      return {
        posts: list as ThreadsPost[],
        isDemoFallback: false,
      };
    }
  } catch (err: unknown) {
    if (!isNetworkUnavailableError(err)) {
      throw new Error(
        extractBackendErrorMessage(err, 'Không thể tải danh sách bài đăng Threads từ máy chủ.')
      );
    }
  }

  let filtered = [...demoPostsStore];
  if (filters.status && filters.status !== 'all') {
    filtered = filtered.filter((p) => p.status === filters.status);
  }
  if (filters.account_id && filters.account_id !== 'all') {
    const accId = Number(filters.account_id);
    filtered = filtered.filter((p) => p.account_id === accId);
  }
  if (filters.is_sponsored !== undefined && filters.is_sponsored !== 'all') {
    const wantSponsored =
      filters.is_sponsored === true ||
      filters.is_sponsored === 'true' ||
      filters.is_sponsored === '1';
    filtered = filtered.filter((p) => Boolean(p.is_sponsored) === wantSponsored);
  }
  if (filters.client_ref?.trim()) {
    const refQuery = filters.client_ref.trim().toLowerCase();
    filtered = filtered.filter((p) => (p.client_ref || '').toLowerCase().includes(refQuery));
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    filtered = filtered.filter(
      (p) =>
        (p.content_text || '').toLowerCase().includes(q) ||
        (p.topic_tag || '').toLowerCase().includes(q) ||
        (p.client_ref || '').toLowerCase().includes(q)
    );
  }

  return {
    posts: filtered,
    isDemoFallback: true,
  };
}

export async function createThreadsPost(
  payload: CreateThreadsPostPayload
): Promise<ThreadsPost[]> {
  try {
    const res = await defaultHttpClient.post<unknown>('/api/v1/threads/posts', payload, {
      skipAuthRedirect: true,
    });
    const data = unwrapApiData<unknown>(res);
    if (Array.isArray(data)) {
      return data as ThreadsPost[];
    }
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if (Array.isArray(record.thread_posts) && record.thread_posts.length > 0) {
        return record.thread_posts as ThreadsPost[];
      }
      if ('id' in record) {
        return [data as ThreadsPost];
      }
    }
  } catch (err: unknown) {
    if (!isNetworkUnavailableError(err)) {
      throw new Error(
        extractBackendErrorMessage(err, 'Không thể tạo bài đăng Threads do lỗi kiểm định.')
      );
    }
  }

  const acc = demoAccountsStore.find((a) => a.id === Number(payload.account_id));
  const accountSummary = acc
    ? {
        id: acc.id,
        display_name: acc.display_name,
        username: acc.username,
        status: acc.status,
        app_group: acc.app_group,
      }
    : null;

  const steps =
    payload.thread_steps && payload.thread_steps.length > 0
      ? payload.thread_steps
      : [
          {
            content_text: payload.content_text,
            media_type: payload.media_type,
            media_urls: payload.media_urls || [],
            link_attachment: payload.link_attachment || null,
            topic_tag: payload.topic_tag || null,
            scheduled_at: payload.scheduled_at || null,
          },
        ];

  const groupKey = steps.length > 1 ? `thread_${Date.now()}` : payload.thread_group_key || null;
  const createdList: ThreadsPost[] = [];
  let parentId: number | null = payload.reply_to_post_id || null;

  steps.forEach((step, idx) => {
    const nextId =
      demoPostsStore.reduce((m, item) => Math.max(m, item.id), 100) + idx + 1;
    const isRoot = idx === 0;
    const resolvedScheduledAt = isRoot
      ? step.scheduled_at || payload.scheduled_at || new Date(Date.now() + 1800_000).toISOString()
      : payload.chain_mode === 'auto'
      ? null
      : step.scheduled_at || null;

    const postItem: ThreadsPost = {
      id: nextId,
      account_id: Number(payload.account_id),
      account: accountSummary,
      reply_to_post_id: isRoot ? payload.reply_to_post_id || null : parentId,
      thread_group_key: groupKey,
      reply_order: idx,
      content_text: step.content_text,
      effective_text: resolveEffectiveText(
        step.content_text,
        Boolean(payload.is_sponsored),
        isRoot ? payload.sponsored_suffix : null
      ),
      media_type: step.media_type || 'TEXT',
      media_urls: step.media_urls || [],
      link_attachment: step.link_attachment || null,
      topic_tag: step.topic_tag || payload.topic_tag || null,
      reply_control: payload.reply_control || 'everyone',
      is_sponsored: Boolean(payload.is_sponsored),
      sponsored_suffix: isRoot ? payload.sponsored_suffix || null : null,
      client_ref: payload.client_ref || null,
      scheduled_at: resolvedScheduledAt,
      status: payload.status || 'scheduled',
      container_id: null,
      threads_media_id: null,
      permalink: null,
      published_at: null,
      retry_count: 0,
      next_retry_at: null,
      error_code: null,
      error_message: null,
    };

    parentId = nextId;
    createdList.push(postItem);
  });

  demoPostsStore = [...createdList, ...demoPostsStore];
  return createdList;
}

export async function updateThreadsPost(
  postId: number,
  payload: Partial<CreateThreadsPostPayload>
): Promise<ThreadsPost> {
  try {
    const res = await defaultHttpClient.put<unknown>(
      `/api/v1/threads/posts/${postId}`,
      payload,
      { skipAuthRedirect: true }
    );
    const data = unwrapApiData<ThreadsPost>(res);
    if (data && data.id) {
      return data;
    }
  } catch (err: unknown) {
    if (!isNetworkUnavailableError(err)) {
      throw new Error(
        extractBackendErrorMessage(err, 'Không thể cập nhật bài đăng Threads.')
      );
    }
  }

  demoPostsStore = demoPostsStore.map((p) =>
    p.id === postId
      ? {
          ...p,
          content_text: payload.content_text ?? p.content_text,
          media_type: payload.media_type ?? p.media_type,
          media_urls: payload.media_urls ?? p.media_urls,
          link_attachment:
            payload.link_attachment !== undefined ? payload.link_attachment : p.link_attachment,
          topic_tag: payload.topic_tag !== undefined ? payload.topic_tag : p.topic_tag,
          is_sponsored:
            payload.is_sponsored !== undefined ? Boolean(payload.is_sponsored) : p.is_sponsored,
          sponsored_suffix:
            payload.sponsored_suffix !== undefined ? payload.sponsored_suffix : p.sponsored_suffix,
          client_ref: payload.client_ref !== undefined ? payload.client_ref : p.client_ref,
          scheduled_at:
            payload.scheduled_at !== undefined ? payload.scheduled_at : p.scheduled_at,
          status: payload.status ?? p.status,
        }
      : p
  );

  const found = demoPostsStore.find((p) => p.id === postId);
  if (!found) {
    throw new Error('Không tìm thấy bài đăng cần cập nhật.');
  }
  return found;
}

export async function approveThreadsPost(
  postId: number,
  scheduledAt?: string | null
): Promise<ThreadsPost> {
  try {
    const res = await defaultHttpClient.post<unknown>(
      `/api/v1/threads/posts/${postId}/approve`,
      scheduledAt ? { scheduled_at: scheduledAt } : {},
      { skipAuthRedirect: true }
    );
    const data = unwrapApiData<ThreadsPost>(res);
    if (data && data.id) {
      return data;
    }
  } catch (err: unknown) {
    if (!isNetworkUnavailableError(err)) {
      throw new Error(
        extractBackendErrorMessage(err, 'Không thể duyệt bài đăng vào hàng đợi xuất bản.')
      );
    }
  }

  demoPostsStore = demoPostsStore.map((p) =>
    p.id === postId
      ? {
          ...p,
          status: 'scheduled',
          scheduled_at:
            scheduledAt || p.scheduled_at || new Date(Date.now() + 300_000).toISOString(),
          error_code: null,
          error_message: null,
        }
      : p
  );

  const found = demoPostsStore.find((p) => p.id === postId);
  if (!found) {
    throw new Error('Không tìm thấy bài đăng cần duyệt lịch.');
  }
  return found;
}

export async function publishThreadsPostNow(postId: number): Promise<ThreadsPost> {
  try {
    const res = await defaultHttpClient.post<unknown>(
      `/api/v1/threads/posts/${postId}/publish-now`,
      {},
      { skipAuthRedirect: true }
    );
    const data = unwrapApiData<ThreadsPost>(res);
    if (data && data.id) {
      return data;
    }
  } catch (err: unknown) {
    if (!isNetworkUnavailableError(err)) {
      throw new Error(
        extractBackendErrorMessage(err, 'Xuất bản bài đăng Threads thất bại.')
      );
    }
  }

  const nowIso = new Date().toISOString();
  const autoChainTriggerIso = new Date(Date.now() + 45_000).toISOString();
  const generatedMediaId = `180200${Date.now().toString().slice(-8)}`;

  demoPostsStore = demoPostsStore.map((p) => {
    if (p.id === postId) {
      return {
        ...p,
        status: 'published',
        published_at: nowIso,
        container_id: p.container_id || `178956${Date.now().toString().slice(-8)}`,
        threads_media_id: generatedMediaId,
        permalink: `https://www.threads.net/@${p.account?.username || 'podscare.vn'}/post/C_${postId}`,
        error_code: null,
        error_message: null,
      };
    }
    // Tự động kích hoạt bài con Auto-chain (scheduled_at === null) sau 30-60s
    if (p.reply_to_post_id === postId && p.scheduled_at === null && p.status === 'scheduled') {
      return {
        ...p,
        scheduled_at: autoChainTriggerIso,
      };
    }
    return p;
  });

  const target = demoPostsStore.find((p) => p.id === postId);
  if (!target) {
    throw new Error('Không tìm thấy bài đăng cần xuất bản.');
  }

  demoLogsStore = [
    {
      id: Date.now(),
      account_id: target.account_id,
      post_id: target.id,
      account: target.account
        ? {
            id: target.account.id,
            display_name: target.account.display_name,
            username: target.account.username,
          }
        : null,
      action: 'publish',
      http_status: 200,
      request_payload: {
        endpoint: `POST https://graph.threads.net/v1.0/${target.account_id}/threads_publish`,
        creation_id: target.container_id,
        access_token: '[REDACTED_TOKEN]',
      },
      response_payload: {
        id: target.threads_media_id,
        permalink: target.permalink,
      },
      duration_ms: 356,
      created_at: nowIso,
    },
    ...demoLogsStore,
  ];

  return target;
}

export async function retryThreadsPost(postId: number): Promise<ThreadsPost> {
  try {
    const res = await defaultHttpClient.post<unknown>(
      `/api/v1/threads/posts/${postId}/retry`,
      {},
      { skipAuthRedirect: true }
    );
    const data = unwrapApiData<ThreadsPost>(res);
    if (data && data.id) {
      return data;
    }
  } catch (err: unknown) {
    if (!isNetworkUnavailableError(err)) {
      throw new Error(
        extractBackendErrorMessage(err, 'Không thể thử lại bài đăng Threads.')
      );
    }
  }

  demoPostsStore = demoPostsStore.map((p) =>
    p.id === postId
      ? {
          ...p,
          status: 'scheduled',
          scheduled_at: new Date(Date.now() + 60_000).toISOString(),
          error_code: null,
          error_message: null,
        }
      : p
  );

  const found = demoPostsStore.find((p) => p.id === postId);
  if (!found) {
    throw new Error('Không tìm thấy bài đăng cần thử lại.');
  }
  return found;
}

export async function deleteThreadsPost(postId: number): Promise<void> {
  try {
    await defaultHttpClient.delete(`/api/v1/threads/posts/${postId}`, {
      skipAuthRedirect: true,
    });
  } catch (err: unknown) {
    if (!isNetworkUnavailableError(err)) {
      throw new Error(
        extractBackendErrorMessage(err, 'Không thể xóa bài đăng Threads.')
      );
    }
  }
  demoPostsStore = demoPostsStore.filter((p) => p.id !== postId);
}

export async function fetchThreadsPublishLogs(params?: {
  account_id?: number;
  post_id?: number;
  action?: string;
}): Promise<{ logs: ThreadsPublishLog[]; isDemoFallback: boolean }> {
  try {
    const res = await defaultHttpClient.get<unknown>('/api/v1/threads/logs', {
      params: params as Record<string, string | number | boolean | undefined>,
      skipAuthRedirect: true,
    });
    const raw = unwrapApiData<unknown>(res);
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown[] }).data)
      ? (raw as { data: unknown[] }).data
      : null;
    if (Array.isArray(list)) {
      return {
        logs: list as ThreadsPublishLog[],
        isDemoFallback: false,
      };
    }
  } catch (err: unknown) {
    if (!isNetworkUnavailableError(err)) {
      throw new Error(
        extractBackendErrorMessage(err, 'Không thể tải nhật ký xuất bản Threads từ máy chủ.')
      );
    }
  }

  let logs = [...demoLogsStore];
  if (params?.account_id) {
    logs = logs.filter((l) => l.account_id === Number(params.account_id));
  }
  if (params?.post_id) {
    logs = logs.filter((l) => l.post_id === Number(params.post_id));
  }
  if (params?.action && params.action !== 'all') {
    logs = logs.filter((l) => l.action === params.action);
  }
  return {
    logs,
    isDemoFallback: true,
  };
}

/**
 * Tách 1 dòng CSV có hỗ trợ dấu ngoặc kép chuẩn RFC 4180.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Nhập hàng loạt bài đăng từ CSV (100+ bài) kèm thuật toán Random Jitter Scheduler.
 */
export async function importThreadsCsv(options: CsvImportOptions): Promise<CsvImportResult> {
  const jitterMinutes = Math.max(3, Math.min(15, Number(options.jitter_minutes) || 8));

  try {
    if (options.file) {
      const formData = new FormData();
      formData.append('file', options.file);
      formData.append('jitter_minutes', String(jitterMinutes));
      if (options.active_hours_start) {
        formData.append('active_hours_start', options.active_hours_start);
      }
      if (options.active_hours_end) {
        formData.append('active_hours_end', options.active_hours_end);
      }
      const res = await defaultHttpClient.post<unknown>(
        '/api/v1/threads/posts/import-csv',
        formData,
        { skipAuthRedirect: true }
      );
      const data = unwrapApiData<CsvImportResult>(res);
      if (data && typeof data.imported_count === 'number') {
        return data;
      }
    } else if (options.csv_text.trim()) {
      const res = await defaultHttpClient.post<unknown>(
        '/api/v1/threads/posts/import-csv',
        {
          csv_text: options.csv_text,
          jitter_minutes: jitterMinutes,
          active_hours_start: options.active_hours_start,
          active_hours_end: options.active_hours_end,
          default_is_sponsored: options.default_is_sponsored,
          default_sponsored_suffix: options.default_sponsored_suffix,
          default_client_ref: options.default_client_ref,
        },
        { skipAuthRedirect: true }
      );
      const data = unwrapApiData<CsvImportResult>(res);
      if (data && typeof data.imported_count === 'number') {
        return data;
      }
    }
  } catch (err: unknown) {
    if (!isNetworkUnavailableError(err)) {
      throw new Error(
        extractBackendErrorMessage(err, 'Dữ liệu CSV không vượt qua bộ kiểm định ThreadsPostValidator.')
      );
    }
    // Fallback xử lý kiểm định & rải lịch Random Jitter trực tiếp trên trình duyệt khi xem preview offline
  }

  const rawLines = options.csv_text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (rawLines.length < 2) {
    return {
      import_batch_id: `batch_${Date.now()}`,
      total_rows: 0,
      imported_count: 0,
      failed_count: 1,
      jitter_minutes: jitterMinutes,
      posts: [],
      errors: [
        {
          row: 1,
          message: 'File CSV trống hoặc thiếu dòng tiêu đề cột (header).',
        },
      ],
    };
  }

  const headers = parseCsvLine(rawLines[0]).map((h) => h.toLowerCase().trim());
  const batchId = `batch_${Date.now()}`;
  const importedPosts: ThreadsPost[] = [];
  const rowErrors: CsvImportRowError[] = [];
  const seenHashes = new Set<string>();
  const slotCounterByAccount = new Map<number, number>();
  const groupLastPostId = new Map<string, number>();

  const parseHourMinute = (hm: string, fallbackMinutes: number): number => {
    const parts = (hm || '').split(':');
    if (parts.length !== 2) return fallbackMinutes;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (Number.isNaN(h) || Number.isNaN(m)) return fallbackMinutes;
    return h * 60 + m;
  };

  const windowStartMin = parseHourMinute(options.active_hours_start || '08:00', 8 * 60);
  const windowEndMin = parseHourMinute(options.active_hours_end || '22:00', 22 * 60);
  const totalWindowMinutes = Math.max(120, windowEndMin - windowStartMin);

  let nextPostId = demoPostsStore.reduce((m, item) => Math.max(m, item.id), 200) + 1;

  for (let i = 1; i < rawLines.length; i++) {
    const rowNumber = i + 1;
    const cols = parseCsvLine(rawLines[i]);
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = cols[idx] ?? '';
    });

    const usernameOrId = (record.account_username || record.username || record.account_id || '').trim();
    const matchedAccount =
      demoAccountsStore.find(
        (a) =>
          (a.username && a.username.toLowerCase() === usernameOrId.toLowerCase()) ||
          String(a.id) === usernameOrId
      ) || demoAccountsStore[(i - 1) % demoAccountsStore.length];

    const contentText = (record.content_text || record.text || '').trim();
    const mediaType = ((record.media_type || 'TEXT').toUpperCase().trim() ||
      'TEXT') as ThreadsMediaType;
    const mediaUrls = (record.media_urls || '')
      .split('|')
      .map((u) => u.trim())
      .filter(Boolean);
    const linkAttachment = (record.link_attachment || '').trim() || null;
    const topicTag = (record.topic_tag || '').trim() || null;
    const threadGroupKey = (record.thread_group_key || '').trim() || null;
    const replyOrder = Number(record.reply_order || 0) || 0;

    const rawSponsored = (record.is_sponsored || '').toLowerCase().trim();
    const isSponsored =
      rawSponsored === '1' ||
      rawSponsored === 'true' ||
      rawSponsored === 'yes' ||
      Boolean(options.default_is_sponsored && rawSponsored === '');

    const sponsoredSuffix =
      (record.sponsored_suffix || options.default_sponsored_suffix || '').trim() || null;
    const clientRef = (record.client_ref || options.default_client_ref || '').trim() || null;

    const validation = validateThreadsDraft({
      contentText,
      mediaType,
      mediaUrls,
      linkAttachment,
      topicTag,
      isSponsored,
      sponsoredSuffix: replyOrder === 0 ? sponsoredSuffix : null,
    });

    if (!validation.valid) {
      rowErrors.push({
        row: rowNumber,
        account_username: matchedAccount.username || String(matchedAccount.id),
        error_code: 'VALIDATION_FAILED',
        message: validation.errors.join(' '),
      });
      continue;
    }

    const normalizedForHash = validation.effectiveText.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seenHashes.has(normalizedForHash)) {
      rowErrors.push({
        row: rowNumber,
        account_username: matchedAccount.username || String(matchedAccount.id),
        error_code: 'DUPLICATE_CONTENT_HASH',
        message: 'Nội dung trùng lặp (content_hash) với một dòng khác trong cùng lô CSV.',
      });
      continue;
    }
    seenHashes.add(normalizedForHash);

    let scheduledAtIso: string | null = (record.scheduled_at || '').trim() || null;
    let replyToPostId: number | null = null;

    if (threadGroupKey && replyOrder > 0) {
      const parentPostId = groupLastPostId.get(`${matchedAccount.id}:${threadGroupKey}`);
      if (parentPostId) {
        replyToPostId = parentPostId;
      }
      // Nếu bài con để trống scheduled_at -> giữ null để chạy Auto-chain (30-60s sau bài cha)
    } else if (!scheduledAtIso) {
      // Thuật toán Random Jitter Scheduler rải đều theo khung giờ + lệch pha theo account_id
      const currentSlot = slotCounterByAccount.get(matchedAccount.id) || 0;
      slotCounterByAccount.set(matchedAccount.id, currentSlot + 1);

      const cap = Math.max(1, matchedAccount.daily_post_cap || 8);
      const dayOffset = Math.floor(currentSlot / cap);
      const slotInDay = currentSlot % cap;
      const intervalMinutes = Math.floor(totalWindowMinutes / cap);

      // Lệch ngẫu nhiên có kiểm soát trong biên độ [-jitterMinutes, +jitterMinutes] + lệch pha account_id * 37s
      const deterministicWave = ((i * 73 + matchedAccount.id * 29) % (jitterMinutes * 2 + 1)) - jitterMinutes;
      const jitterSeconds = deterministicWave * 60 + ((matchedAccount.id * 37 + i * 13) % 59);

      const baseDate = new Date();
      baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset + 1);
      baseDate.setUTCHours(0, 0, 0, 0);

      const targetMinutesFromMidnight =
        windowStartMin + slotInDay * intervalMinutes + Math.floor(intervalMinutes / 2);
      const finalTimestampMs =
        baseDate.getTime() + targetMinutesFromMidnight * 60_000 + jitterSeconds * 1000;
      scheduledAtIso = new Date(finalTimestampMs).toISOString();
    }

    const postId = nextPostId++;
    if (threadGroupKey) {
      groupLastPostId.set(`${matchedAccount.id}:${threadGroupKey}`, postId);
    }

    const createdPost: ThreadsPost = {
      id: postId,
      account_id: matchedAccount.id,
      account: {
        id: matchedAccount.id,
        display_name: matchedAccount.display_name,
        username: matchedAccount.username,
        status: matchedAccount.status,
        app_group: matchedAccount.app_group,
      },
      reply_to_post_id: replyToPostId,
      thread_group_key: threadGroupKey,
      reply_order: replyOrder,
      content_text: contentText,
      effective_text: validation.effectiveText,
      media_type: mediaType,
      media_urls: mediaUrls,
      link_attachment: linkAttachment,
      topic_tag: topicTag,
      reply_control: 'everyone',
      is_sponsored: isSponsored,
      sponsored_suffix: replyOrder === 0 ? sponsoredSuffix : null,
      client_ref: clientRef,
      import_batch_id: batchId,
      scheduled_at: scheduledAtIso,
      status: 'scheduled',
      container_id: null,
      threads_media_id: null,
      permalink: null,
      published_at: null,
      retry_count: 0,
      next_retry_at: null,
      error_code: null,
      error_message: null,
    };

    importedPosts.push(createdPost);
  }

  if (importedPosts.length > 0) {
    demoPostsStore = [...importedPosts, ...demoPostsStore];
  }

  return {
    import_batch_id: batchId,
    total_rows: rawLines.length - 1,
    imported_count: importedPosts.length,
    failed_count: rowErrors.length,
    jitter_minutes: jitterMinutes,
    posts: importedPosts,
    errors: rowErrors,
  };
}

/**
 * Sinh nội dung CSV mẫu chuẩn UTF-8 phục vụ tải về hoặc nạp nhanh 100+ bài thử nghiệm.
 */
export function generateSampleThreadsCsv(rowCount = 12): string {
  const header =
    'account_username,content_text,media_type,media_urls,link_attachment,topic_tag,thread_group_key,reply_order,scheduled_at,is_sponsored,sponsored_suffix,client_ref';

  const sampleTopics = [
    'PodsCareLab',
    'ThayPinAirPods',
    'ChongOnANC',
    'VeSinhTaiNghe',
    'AudioGear',
    'MeoDungBen',
  ];

  const rows: string[] = [header];

  // Thêm 1 chuỗi Multi-post Thread 2 bước mẫu ở đầu file
  rows.push(
    'podscare.vn,"Chuỗi bài kỹ thuật 1/2: Khi nào cần thay pin tai nghe True Wireless để không làm phù nắp hộp sạc?",TEXT,,,ThayPinAirPods,group_pin_01,0,,0,,'
  );
  rows.push(
    'podscare.vn,"Chuỗi bài kỹ thuật 2/2 (Auto-chain): Khi thời lượng nghe liên tục giảm xuống dưới 90 phút hoặc tai nghe báo pin ảo tụt từ 50% về 10%.",IMAGE,https://cdn.podscare.vn/threads/battery-curve.jpg,https://podscare.vn/bang-gia-thay-pin,ThayPinAirPods,group_pin_01,1,,0,,'
  );

  for (let i = 3; i <= rowCount; i++) {
    const acc = INITIAL_DEMO_ACCOUNTS[(i - 1) % INITIAL_DEMO_ACCOUNTS.length];
    const username = acc.username || `podscare.${i}`;
    const topic = sampleTopics[(i - 1) % sampleTopics.length];
    const isSponsored = i % 4 === 0 ? '1' : '0';
    const suffix = i % 8 === 0 ? '#Sponsored' : '';
    const clientRef = isSponsored === '1' ? `CAMPAIGN_Q4_${String(i).padStart(2, '0')}` : '';
    const text = `Bản tin kỹ thuật #${i} tại ${acc.display_name}: Quy trình kiểm định 12 bước âm học và đo dòng sạc chuẩn xác cho thiết bị âm thanh cá nhân.`;

    rows.push(
      `${username},"${text}",TEXT,,,${topic},,0,,${isSponsored},${suffix},${clientRef}`
    );
  }

  return rows.join('\n');
}
