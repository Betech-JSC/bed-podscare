import type { NotificationSeverity, NotificationType } from '@podscare/ui';

/**
 * Cấu trúc Payload sự kiện vận hành & nền tảng đồng bộ với OrderOperationalEvent từ backend Laravel.
 */
export interface OperationalNotificationPayload {
  id: string | number;
  orderId?: string | number;
  orderCode?: string;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  timestamp?: string; // ISO 8601
  actionUrl?: string; // Ví dụ: "/repairs?id=123", "/platform/stores", "/subscription"
  type?: NotificationType;
  tenantId?: number | string | null;
  branchId?: number | string | null;
  targetRole?: string | null;
  userId?: number | string | null;
  eventName?: string;
  [key: string]: any;
}

/**
 * Ngữ cảnh phiên đăng nhập hiện tại trên Frontend dùng cho bộ lọc Defense-in-Depth.
 */
export interface NotificationSessionContext {
  enabled?: boolean;
  tenantId?: number | string | null;
  branchId?: number | string | null;
  role?: string | null;
  userId?: number | string | null;
}

/**
 * Danh sách loại thông báo cấp Quản trị Nền tảng (tenant_id luôn là NULL, chỉ dành cho super_admin).
 */
export const PLATFORM_NOTIFICATION_TYPES: string[] = [
  'tenant_registered',
  'tenant_approval_pending',
  'tenant_approval',
  'saas_payment_received',
  'platform_billing',
];

/**
 * Danh sách loại thông báo gói cước SaaS dành cho Chủ tiệm của Gian hàng.
 */
export const SAAS_STORE_NOTIFICATION_TYPES: string[] = [
  'fee_reminder',
  'saas_subscription_renewed',
];

/**
 * Danh sách tiền tố và type sự kiện hợp lệ (Operational & Platform Lifecycle Whitelist).
 * Nghiêm cấm nhận các thông báo quảng cáo, tiếp thị, tin tức ngoài lề.
 */
export const ALLOWED_EVENT_PREFIXES = [
  'order.',
  'sla.',
  'qc.',
  'quote.',
  'platform.',
  'tenant.',
  'saas.',
];

export const ALLOWED_NOTIFICATION_TYPES: string[] = [
  'order_status',
  'sla_warning',
  'qc_action',
  'quote_action',
  'order_created',
  'order_assigned',
  'order_in_repair',
  'order_waiting_parts',
  'order_resumed',
  'order_qc_pending',
  'order_ready_delivery',
  'order_completed',
  'order_cancelled',
  'special_part_requested',
  'special_part_fulfilled',
  'order_special_part_requested',
  'order_special_part_fulfilled',
  'additional_service_added',
  'additional_service_removed',
  ...PLATFORM_NOTIFICATION_TYPES,
  ...SAAS_STORE_NOTIFICATION_TYPES,
];

/**
 * Chuẩn hóa tên vai trò hai chiều ('tech' <-> 'technician') đồng bộ 100% với Backend.
 */
export function normalizeNotificationRole(role?: string | null): string | null {
  if (role === null || role === undefined) {
    return null;
  }
  const normalized = String(role).trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === 'tech' || normalized === 'technician') {
    return 'technician';
  }
  return normalized;
}

/**
 * Chuẩn hóa ID số nguyên dương (tenantId, branchId, userId). Trả về null nếu thiếu hoặc không hợp lệ.
 */
function parsePositiveIntId(value?: string | number | null): number | null {
  if (value === null || value === undefined || value === '' || value === 'all') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  const trimmed = String(value).trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Đảm bảo tên kênh luôn có đúng một tiền tố `private-` (hoặc `presence-`) chuẩn Pusher Protocol v7,
 * tuyệt đối không nhân đôi thành `private-private-...`.
 */
export function toPrivateChannelName(channel: string): string {
  const trimmed = String(channel || '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('private-') || trimmed.startsWith('presence-')) {
    return trimmed;
  }
  return `private-${trimmed}`;
}

const VIETNAMESE_DONG_COMPOUND_LOOKAHEAD = String.raw`(?![\p{L}\p{N}])(?!\s+(?:ý|hồ|bộ|nghiệp|thời|loạt|nhất|tình|thuận|hành|kiểm|phục|dạng|tâm|cảm|loại|cư|hương|sở|chí|bào|minh|phẳng|thau|đen|đỏ|trắng|vàng|xanh|bạc|kẽm|chì|thép|sắt|nhôm|trục|tốc|pha|mức|hạng)(?![\p{L}\p{N}]))`;

// 1. Hậu tố VNĐ / VND (sử dụng Unicode boundary thay vì ASCII \b để bắt chuẩn "(VNĐ):", "350.000VNĐ", "VND")
const VND_CODE_REGEX = /(?<![\p{L}\p{N}])vn[đd](?![\p{L}\p{N}])|(?<![\p{L}])\+?\d[\d.,]*\s*vn[đd](?![\p{L}\p{N}])/iu;

// 2. Mệnh giá viết tắt nghìn đồng bằng hậu tố k / K ("500k", "+350k", "-50k", "1.200k", "+5k")
//    Loại trừ độ phân giải màn hình 1 chữ số ("4K", "5K", "8K") và mã model/serial/CPU ("A2999K", "PC26-0100K", "i7-13700K")
const VND_SHORTHAND_K_REGEX =
  /(?<![\p{L}\p{N}])\+\s*\d+(?:[.,]\d{3})*\s*k(?![\p{L}\p{N}])|(?:(?<![\p{L}\p{N}.-])|(?<![\p{L}\p{N}])-\s*)(?:\d{1,3}(?:[.,]\d{3})+|\d{2,})\s*k(?![\p{L}\p{N}])/iu;

// 3. Mệnh giá đi kèm đơn vị "đ" ("0đ", "350.000đ", "350.000 đ", "+150,000đ")
const VND_SHORT_D_REGEX =
  /(?:(?<![\p{L}\p{N}.-])|(?<![\p{L}\p{N}])[+-]\s*)(?:0|\d{1,3}(?:[.,]\d{3})+|\d{3,}|\d+(?:[.,]\d+)?\s*(?:nghìn|ngàn|triệu|tỷ))\s*đ(?![\p{L}\p{N}])/iu;

// 4. Mệnh giá đi kèm đơn vị "đồng" ("0 đồng", "500 đồng", "350.000 đồng", "1,5 triệu đồng")
//    Loại trừ mã đơn hàng ("PC26-0012") và toàn bộ từ ghép tiếng Việt ("đồng ý", "đồng hồ", "đồng bộ"...)
const VND_DONG_WORD_REGEX = new RegExp(
  String.raw`(?:(?<![\p{L}\p{N}.-])|(?<![\p{L}\p{N}])[+-]\s*)(?:0|\d{1,3}(?:[.,]\d{3})+|\d{3,}|\d+(?:[.,]\d+)?\s*(?:nghìn|ngàn|triệu|tỷ))\s*đồng` +
    VIETNAMESE_DONG_COMPOUND_LOOKAHEAD,
  'iu'
);

/**
 * Nhận diện chuỗi có chứa giá trị tiền tệ VNĐ (₫, VNĐ, VND, 500k, +350k, 350.000 đ, 500.000 đồng)
 * mà không bắt nhầm mã đơn hàng, số model hay từ ghép tiếng Việt ("PC26-0012 đồng ý...", "Series 9 đồng hồ...", "4K").
 */
export function containsVietnameseCurrency(text?: string | null): boolean {
  if (!text) {
    return false;
  }
  const str = String(text);
  if (str.includes('₫')) {
    return true;
  }
  if (VND_CODE_REGEX.test(str)) {
    return true;
  }
  if (VND_SHORTHAND_K_REGEX.test(str)) {
    return true;
  }
  if (VND_SHORT_D_REGEX.test(str)) {
    return true;
  }
  return VND_DONG_WORD_REGEX.test(str);
}

/**
 * Sinh khóa phiên định danh duy nhất `(role, tenantId, userId)` để phát hiện tức thì khi đăng xuất hoặc đổi tài khoản.
 */
export function buildNotificationSessionKey(session: {
  enabled?: boolean;
  userId?: string | number | null;
  tenantId?: string | number | null;
  role?: string | null;
}): string {
  if (!session.enabled) {
    return 'logged_out';
  }
  const normRole = normalizeNotificationRole(session.role) ?? 'none';
  const validUserId = parsePositiveIntId(session.userId);
  const validTenantId = parsePositiveIntId(session.tenantId);
  const tenantPart =
    normRole === 'super_admin'
      ? 'platform'
      : validTenantId !== null
      ? String(validTenantId)
      : 'no_tenant';
  const userPart = validUserId !== null ? String(validUserId) : 'anon';
  return `${normRole}:${tenantPart}:${userPart}`;
}

/**
 * Giải quyết đường dẫn điều hướng chuẩn xác cho cả thông báo Nền tảng (super_admin), gói cước SaaS và đơn sửa chữa.
 */
export function resolveNotificationActionUrl(input: {
  actionUrl?: string | null;
  type?: string | null;
  orderId?: string | number | null;
  role?: string | null;
  targetRole?: string | null;
}): string {
  const normalizedSessionRole = normalizeNotificationRole(input.role);
  const normalizedTargetRole = normalizeNotificationRole(input.targetRole);
  const lowerType = String(input.type || '').trim().toLowerCase();
  const isPlatformContext =
    normalizedSessionRole === 'super_admin' ||
    normalizedTargetRole === 'super_admin' ||
    PLATFORM_NOTIFICATION_TYPES.includes(lowerType);

  const rawUrl = typeof input.actionUrl === 'string' ? input.actionUrl.trim() : '';
  if (rawUrl && !(isPlatformContext && rawUrl.startsWith('/repairs'))) {
    return rawUrl;
  }

  switch (lowerType) {
    case 'tenant_registered':
      return '/platform/stores';
    case 'tenant_approval_pending':
    case 'tenant_approval':
      return '/platform/approvals';
    case 'saas_payment_received':
    case 'platform_billing':
      return '/platform/billing';
    case 'fee_reminder':
    case 'saas_subscription_renewed':
      return isPlatformContext ? '/platform/billing' : '/subscription';
    default: {
      if (isPlatformContext) {
        return '/platform/stores';
      }
      const hasValidOrderId =
        input.orderId !== undefined &&
        input.orderId !== null &&
        String(input.orderId).trim() !== '' &&
        String(input.orderId).trim() !== '0';
      return hasValidOrderId ? `/repairs?id=${input.orderId}` : '/repairs';
    }
  }
}

/**
 * Bộ lọc Defense-in-Depth phía Client đối chiếu nghiêm ngặt `tenantId`, `branchId`, `userId`, `targetRole`
 * và quy tắc bảo mật giá tiền VNĐ đối với Kỹ thuật viên (`tech`/`technician`).
 */
export function isPayloadAuthorizedForSession(
  payload: Partial<OperationalNotificationPayload> | null | undefined,
  session: NotificationSessionContext
): boolean {
  if (!payload || session.enabled === false) {
    return false;
  }

  const sessionRole = normalizeNotificationRole(session.role);
  if (!sessionRole) {
    return false;
  }

  const sessionTenantId = parsePositiveIntId(session.tenantId);
  const sessionBranchId =
    session.branchId === 'all' ? null : parsePositiveIntId(session.branchId);
  const sessionUserId = parsePositiveIntId(session.userId);

  const rawPayloadTenantId = payload.tenantId ?? (payload as any).tenant_id ?? null;
  const rawPayloadBranchId = payload.branchId ?? (payload as any).branch_id ?? null;
  const rawPayloadUserId = payload.userId ?? (payload as any).user_id ?? null;

  const hasPayloadTenantField =
    rawPayloadTenantId !== null &&
    rawPayloadTenantId !== undefined &&
    String(rawPayloadTenantId).trim() !== '';
  const payloadTenantId = hasPayloadTenantField ? parsePositiveIntId(rawPayloadTenantId) : null;

  const hasPayloadBranchField =
    rawPayloadBranchId !== null &&
    rawPayloadBranchId !== undefined &&
    String(rawPayloadBranchId).trim() !== '' &&
    rawPayloadBranchId !== 'all';
  const payloadBranchId = hasPayloadBranchField ? parsePositiveIntId(rawPayloadBranchId) : null;

  const hasPayloadUserField =
    rawPayloadUserId !== null &&
    rawPayloadUserId !== undefined &&
    String(rawPayloadUserId).trim() !== '';
  const payloadUserId = hasPayloadUserField ? parsePositiveIntId(rawPayloadUserId) : null;

  const payloadTargetRole = normalizeNotificationRole(
    payload.targetRole ?? (payload as any).target_role ?? null
  );
  const lowerType = String(payload.type || '').trim().toLowerCase();

  // Tầng 1: Quản trị Nền tảng (super_admin)
  // Chỉ nhận thông báo cấp Nền tảng (tenantId == null) VÀ (targetRole === 'super_admin' hoặc userId === currentUserId).
  if (sessionRole === 'super_admin') {
    if (hasPayloadTenantField) {
      return false;
    }
    if (hasPayloadUserField) {
      if (sessionUserId === null || payloadUserId === null || payloadUserId !== sessionUserId) {
        return false;
      }
      return true;
    }
    return payloadTargetRole === 'super_admin';
  }

  // Tầng 2 & Tầng 3: Tài khoản thuộc Gian hàng (Fail-Closed nếu thiếu tenantId)
  if (sessionTenantId === null) {
    return false;
  }

  // Chặn tuyệt đối thông báo cấp Nền tảng (tenantId == null) và thông báo khác Tenant
  if (!hasPayloadTenantField || payloadTenantId === null || payloadTenantId !== sessionTenantId) {
    return false;
  }

  if (payloadTargetRole === 'super_admin' || PLATFORM_NOTIFICATION_TYPES.includes(lowerType)) {
    return false;
  }

  // Nếu payload chỉ định đích danh userId thì bắt buộc khớp với user đang đăng nhập
  if (hasPayloadUserField) {
    if (sessionUserId === null || payloadUserId === null || payloadUserId !== sessionUserId) {
      return false;
    }
  }

  // Tầng 2: Chủ tiệm (admin của Gian hàng)
  if (sessionRole === 'admin') {
    // Nếu Chủ tiệm đang lọc một chi nhánh cụ thể trên Topbar, chỉ nhận sự kiện thuộc chi nhánh đó hoặc gửi đích danh cho mình
    if (sessionBranchId !== null && hasPayloadBranchField) {
      if (payloadBranchId === null || payloadBranchId !== sessionBranchId) {
        return false;
      }
    }
    return true;
  }

  // Tầng 3: Nhân sự vận hành chi nhánh (cskh, technician/tech, qc, inventory...)
  if (sessionBranchId !== null) {
    if (hasPayloadBranchField) {
      if (payloadBranchId === null || payloadBranchId !== sessionBranchId) {
        return false;
      }
    } else if (!hasPayloadUserField || payloadUserId !== sessionUserId) {
      return false;
    }
  } else {
    // Nhân sự chưa được gán chi nhánh chỉ được nhận thông báo cá nhân đích danh
    if (hasPayloadBranchField || !hasPayloadUserField || payloadUserId !== sessionUserId) {
      return false;
    }
  }

  if (payloadTargetRole !== null && payloadTargetRole !== sessionRole) {
    return false;
  }

  // Bảo mật tài chính RBAC: Kỹ thuật viên tuyệt đối không nhận thông báo báo giá hoặc có chứa giá tiền VNĐ
  if (sessionRole === 'technician') {
    if (
      lowerType === 'quote_action' ||
      lowerType === 'quote' ||
      containsVietnameseCurrency(payload.title) ||
      containsVietnameseCurrency(payload.message)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Hàm kiểm tra sự kiện theo whitelist vận hành & nền tảng nghiêm ngặt.
 * Trả về true nếu thuộc vòng đời đơn hàng, SLA, QC, Báo giá, Quản trị Nền tảng hoặc Gói cước SaaS.
 */
export function isOperationalEventWhitelisted(
  eventName?: string,
  payload?: Partial<OperationalNotificationPayload>
): boolean {
  // 1. Kiểm tra prefix của tên sự kiện
  if (eventName) {
    const lowerEvent = eventName.replace(/^\.+/, '').toLowerCase();
    const hasValidPrefix = ALLOWED_EVENT_PREFIXES.some((prefix) =>
      lowerEvent.startsWith(prefix)
    );
    if (hasValidPrefix) return true;
  }

  // 2. Kiểm tra thuộc tính type trong payload
  if (payload?.type) {
    const lowerType = String(payload.type).toLowerCase();
    if (ALLOWED_NOTIFICATION_TYPES.includes(lowerType)) {
      return true;
    }
    const hasTypePrefix = ALLOWED_EVENT_PREFIXES.some(
      (prefix) =>
        lowerType.startsWith(prefix) ||
        lowerType.startsWith(prefix.replace('.', '_'))
    );
    if (hasTypePrefix) return true;
  }

  // 3. Loại bỏ hoàn toàn các sự kiện ngoài lề: marketing, ads, promo, chat, news
  return false;
}

/* ==========================================================================
   REALTIME EVENT BUS (Hỗ trợ Mock Dev/Local và Inter-Component Communication)
   ========================================================================== */

export type BusListener = (event: {
  eventName: string;
  payload: OperationalNotificationPayload;
}) => void;

export class RealtimeEventBus {
  private listeners = new Set<BusListener>();

  subscribe(listener: BusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(eventName: string, payload: OperationalNotificationPayload): boolean {
    if (!isOperationalEventWhitelisted(eventName, payload)) {
      if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
        console.warn(
          `[RealtimeEventBus] Sự kiện bị từ chối bởi Whitelist: "${eventName}"`,
          payload
        );
      }
      return false;
    }

    this.listeners.forEach((listener) => {
      try {
        listener({ eventName, payload });
      } catch (err) {
        console.error('[RealtimeEventBus] Lỗi khi xử lý listener:', err);
      }
    });
    return true;
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}

export const realtimeEventBus = new RealtimeEventBus();

// Gắn devtools helper vào window nếu trong môi trường browser
if (typeof window !== 'undefined') {
  (window as any).__podscareEventBus = realtimeEventBus;
  (window as any).__podscareDispatchNotification = (
    eventName: string,
    payload: OperationalNotificationPayload
  ) => realtimeEventBus.emit(eventName, payload);
}

/**
 * Tính toán danh sách các kênh private tương ứng với Nền tảng / Gian hàng / Chi nhánh / Vai trò / Người dùng.
 * Khớp 100% với phân quyền tại `apps/api/routes/channels.php` và thực thi cơ chế Fail-Closed khi thiếu `tenantId`.
 */
export function computeTargetChannels(
  tenantId?: string | number | null,
  branchId?: string | number | null,
  role?: string | null,
  userId?: string | number | null
): string[] {
  const normalizedRole = normalizeNotificationRole(role);
  const validTenantId = parsePositiveIntId(tenantId);
  const validBranchId = branchId === 'all' ? null : parsePositiveIntId(branchId);
  const validUserId = parsePositiveIntId(userId);

  // 1. Tầng 1 (super_admin): Chỉ đăng ký kênh cấp Nền tảng và kênh cá nhân, tuyệt đối không vào kênh cửa hàng
  if (normalizedRole === 'super_admin') {
    const platformChannels: string[] = ['platform.super_admin'];
    if (validUserId !== null) {
      platformChannels.push(`user.${validUserId}`);
    }
    return Array.from(new Set(platformChannels));
  }

  // 2. Fail-Closed: Nếu tài khoản không phải super_admin nhưng thiếu tenantId hợp lệ -> Không subscribe kênh cửa hàng nào
  if (validTenantId === null) {
    return validUserId !== null ? [`user.${validUserId}`] : [];
  }

  // 3. Tầng 2 (Chủ tiệm role === 'admin'): Kênh đơn hàng toàn tiệm, kênh role admin của tiệm, kênh chi nhánh đang lọc (nếu có) và kênh cá nhân
  if (normalizedRole === 'admin') {
    const adminChannels: string[] = [
      `tenant.${validTenantId}.orders`,
      `tenant.${validTenantId}.role.admin`,
    ];
    if (validBranchId !== null) {
      adminChannels.push(`tenant.${validTenantId}.branch.${validBranchId}.orders`);
    }
    if (validUserId !== null) {
      adminChannels.push(`user.${validUserId}`);
    }
    return Array.from(new Set(adminChannels));
  }

  // 4. Tầng 3 (Nhân sự chi nhánh: cskh, technician/tech, qc, inventory...):
  // Chỉ subscribe kênh của đúng chi nhánh được phân công + vai trò chuẩn hóa và kênh cá nhân (tránh 403 trên kênh chỉ dành cho admin)
  const staffChannels: string[] = [];
  if (validBranchId !== null) {
    staffChannels.push(`tenant.${validTenantId}.branch.${validBranchId}.orders`);
    if (normalizedRole) {
      staffChannels.push(
        `tenant.${validTenantId}.branch.${validBranchId}.${normalizedRole}`
      );
    }
  }
  if (validUserId !== null) {
    staffChannels.push(`user.${validUserId}`);
  }

  return Array.from(new Set(staffChannels));
}

/* ==========================================================================
   REVERB / ECHO CONFIGURATION & WEBSOCKET CLIENT
   ========================================================================== */

/**
 * Cấu hình kết nối Laravel Reverb / Echo linh hoạt cho môi trường Local Dev và VPS.
 */
export interface ReverbEchoConfig {
  broadcaster: 'reverb' | 'pusher';
  key: string;
  wsHost: string;
  wsPort: number;
  wssPort: number;
  forceTLS: boolean;
  enabledTransports: ('ws' | 'wss')[];
  authEndpoint: string;
  scheme: 'http' | 'https';
}

/**
 * Chuẩn hóa URL xác thực broadcasting luôn trỏ đúng tới `/api/v1/broadcasting/auth`
 * trên cả môi trường dùng `NEXT_PUBLIC_API_URL` trực tiếp lẫn qua Next.js `/api/[...proxy]`.
 */
function resolveBroadcastAuthEndpoint(isBrowser: boolean): string {
  if (process.env.NEXT_PUBLIC_BROADCAST_AUTH_URL) {
    return process.env.NEXT_PUBLIC_BROADCAST_AUTH_URL;
  }

  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (rawApiUrl) {
    const cleanBase = rawApiUrl.replace(/\/+$/, '');
    if (cleanBase.endsWith('/api/v1')) {
      return `${cleanBase}/broadcasting/auth`;
    }
    if (cleanBase.endsWith('/api')) {
      return `${cleanBase}/v1/broadcasting/auth`;
    }
    return `${cleanBase}/api/v1/broadcasting/auth`;
  }

  if (isBrowser && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/v1/broadcasting/auth`;
  }

  return 'http://localhost:8000/api/v1/broadcasting/auth';
}

/**
 * Trích xuất cấu hình Reverb/Echo từ Environment Variables với fallback thông minh:
 * - NEXT_PUBLIC_REVERB_HOST (mặc định theo hostname hiện tại hoặc 'localhost')
 * - NEXT_PUBLIC_REVERB_PORT (mặc định 8080 nếu http, 443 nếu https)
 * - NEXT_PUBLIC_REVERB_SCHEME ('http' | 'https', mặc định theo window.location.protocol hoặc 'http')
 * - NEXT_PUBLIC_REVERB_APP_KEY (mặc định 'podscare_reverb_key')
 */
export function getReverbEchoConfig(): ReverbEchoConfig {
  const isBrowser = typeof window !== 'undefined';
  const protocol = isBrowser ? window.location?.protocol : 'http:';
  const currentHostname = isBrowser ? window.location?.hostname || 'localhost' : 'localhost';

  const schemeEnv = process.env.NEXT_PUBLIC_REVERB_SCHEME?.toLowerCase();
  const scheme: 'http' | 'https' =
    schemeEnv === 'https'
      ? 'https'
      : schemeEnv === 'http'
      ? 'http'
      : protocol === 'https:'
      ? 'https'
      : 'http';

  let host =
    process.env.NEXT_PUBLIC_REVERB_HOST ||
    process.env.NEXT_PUBLIC_WS_HOST;

  if (!host) {
    if (isBrowser && (currentHostname === 'fixo.com.vn' || currentHostname.endsWith('.fixo.com.vn'))) {
      host = 'api.fixo.com.vn';
    } else {
      host = currentHostname;
    }
  }

  const defaultPort = scheme === 'https' ? 443 : 8080;
  const portStr = process.env.NEXT_PUBLIC_REVERB_PORT || process.env.NEXT_PUBLIC_WS_PORT;
  const port = portStr ? parseInt(portStr, 10) : defaultPort;

  const key =
    process.env.NEXT_PUBLIC_REVERB_APP_KEY ||
    process.env.NEXT_PUBLIC_REVERB_KEY ||
    'podscare_reverb_key';

  const authEndpoint = resolveBroadcastAuthEndpoint(isBrowser);

  return {
    broadcaster: 'reverb',
    key,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS: scheme === 'https',
    enabledTransports: scheme === 'https' ? ['wss'] : ['ws', 'wss'],
    authEndpoint,
    scheme,
  };
}

export interface ReverbSocketClientOptions {
  onConnectionChange?: (connected: boolean) => void;
  onEvent?: (eventName: string, payload: OperationalNotificationPayload) => void;
  onAuthError?: (channel: string, status: number, error?: unknown) => void;
  tokenProvider?: () => string | null;
  fetchImpl?: typeof fetch;
}

/**
 * Quản lý kết nối WebSocket native trực tiếp tới Laravel Reverb server.
 * Tương thích 100% giao thức Pusher v7 được Reverb triển khai:
 * - Tự động handshake `pusher:connection_established` và lưu `socket_id`
 * - Xác thực kênh riêng tư `private-*` qua `POST /api/v1/broadcasting/auth` kèm Sanctum Bearer Token
 * - Gửi lệnh `pusher:subscribe` có đính kèm chữ ký HMAC `auth` (Fail-Closed khi 401/403 hoặc thiếu token)
 * - Phản hồi `pusher:ping` -> `pusher:pong` giữ kết nối alive (Heartbeat)
 * - Tự động reconnect với exponential backoff khi mất kết nối mạng
 * - Bắn các event nhận được vào callback / RealtimeEventBus sau khi kiểm tra whitelist
 */
export class ReverbSocketClient {
  private ws: any = null;
  private config: ReverbEchoConfig;
  private channels: Set<string> = new Set();
  private subscribedChannels: Set<string> = new Set();
  private pendingAuthControllers: Map<string, AbortController> = new Map();
  private socketId: string | null = null;
  private reconnectTimer: any = null;
  private pingInterval: any = null;
  private isDestroyed: boolean = false;
  private _isConnected: boolean = false;
  private retryCount: number = 0;
  private onConnectionChange?: (connected: boolean) => void;
  private onEvent?: (eventName: string, payload: OperationalNotificationPayload) => void;
  private onAuthError?: (channel: string, status: number, error?: unknown) => void;
  private tokenProvider?: () => string | null;
  private fetchImpl?: typeof fetch;

  constructor(
    config?: Partial<ReverbEchoConfig> | string,
    options?: ReverbSocketClientOptions
  ) {
    const normalizedConfig: Partial<ReverbEchoConfig> | undefined =
      typeof config === 'string' ? { key: config } : config;
    this.config = { ...getReverbEchoConfig(), ...normalizedConfig };
    this.onConnectionChange = options?.onConnectionChange;
    this.onEvent = options?.onEvent;
    this.onAuthError = options?.onAuthError;
    this.tokenProvider = options?.tokenProvider;
    this.fetchImpl = options?.fetchImpl;
  }

  public get isConnected(): boolean {
    return this._isConnected;
  }

  public get currentSocketId(): string | null {
    return this.socketId;
  }

  public get subscribedChannelList(): string[] {
    return Array.from(this.subscribedChannels);
  }

  public setChannels(newChannels: string[]) {
    const normalizedList = newChannels
      .map((ch) => toPrivateChannelName(ch))
      .filter((ch) => ch.length > 0);
    const prev = new Set(this.channels);
    this.channels = new Set(normalizedList);

    if (this._isConnected && this.socketId && this.ws && this.ws.readyState === 1) {
      normalizedList.forEach((ch) => {
        if (!prev.has(ch)) {
          void this.subscribeChannel(ch);
        }
      });
      prev.forEach((ch) => {
        if (!this.channels.has(ch)) {
          this.unsubscribeChannel(ch);
        }
      });
    } else {
      prev.forEach((ch) => {
        if (!this.channels.has(ch)) {
          this.abortPendingAuth(ch);
        }
      });
    }
  }

  public connect() {
    if (typeof window === 'undefined') return;
    const WebSocketClass =
      (window as any).WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    if (!WebSocketClass) return;

    if (this.isDestroyed) return;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
      return;
    }

    const { scheme, wsHost, wsPort, key } = this.config;
    const wsProtocol = scheme === 'https' ? 'wss' : 'ws';

    // Nhận diện Mixed Content: Trang đang chạy trên HTTPS nhưng socket lại cấu hình ws:// không mã hóa
    const isBrowserHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:';
    if (isBrowserHttps && wsProtocol === 'ws') {
      console.debug(
        '[ReverbSocketClient] Tạm dừng kết nối ws:// trên trang HTTPS (tránh Mixed Content) - Chuyển sang cơ chế Smart Polling.'
      );
      this.setConnected(false);
      return;
    }

    const portSuffix =
      (wsProtocol === 'wss' && wsPort === 443) || (wsProtocol === 'ws' && wsPort === 80)
        ? ''
        : `:${wsPort}`;
    const wsUrl = `${wsProtocol}://${wsHost}${portSuffix}/app/${key}?protocol=7&client=js&version=8.4.0-reverb&flash=false`;

    try {
      this.ws = new WebSocketClass(wsUrl);

      this.ws.onopen = () => {
        // Chờ pusher:connection_established trả về socket_id trước khi authorize & subscribe
      };

      this.ws.onmessage = (event: any) => {
        try {
          const message = JSON.parse(event.data);
          this.handleSocketMessage(message);
        } catch {
          // Bỏ qua tin nhắn không phải JSON
        }
      };

      this.ws.onerror = (e: any) => {
        // Silent error handler to suppress unhandled console noise
        if (e && typeof e.stopPropagation === 'function') {
          e.stopPropagation();
        }
        this.setConnected(false);
      };

      this.ws.onclose = () => {
        this.socketId = null;
        this.subscribedChannels.clear();
        this.abortAllPendingAuths();
        this.setConnected(false);
        this.cleanupHeartbeat();
        if (!this.isDestroyed) {
          this.scheduleReconnect();
        }
      };
    } catch {
      this.setConnected(false);
      this.scheduleReconnect();
    }
  }

  private resolveBearerToken(): string | null {
    if (this.tokenProvider) {
      const provided = this.tokenProvider();
      if (provided && String(provided).trim()) {
        return String(provided).trim();
      }
    }

    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage?.getItem('podscare_token');
        if (stored && stored.trim()) {
          return stored.trim();
        }
      } catch {
        // Bỏ qua lỗi truy cập localStorage
      }
    }

    return null;
  }

  private handleSocketMessage(msg: { event: string; channel?: string; data?: any }) {
    if (msg.event === 'pusher:connection_established') {
      let connectionData = msg.data;
      if (typeof connectionData === 'string') {
        try {
          connectionData = JSON.parse(connectionData);
        } catch {
          connectionData = null;
        }
      }

      this.socketId = connectionData?.socket_id ? String(connectionData.socket_id) : null;
      this.retryCount = 0;
      this.subscribedChannels.clear();
      this.setConnected(true);
      this.startHeartbeat();

      if (this.socketId) {
        this.channels.forEach((ch) => {
          void this.subscribeChannel(ch);
        });
      }
      return;
    }

    if (msg.event === 'pusher:ping') {
      this.send({ event: 'pusher:pong', data: {} });
      return;
    }

    if (
      msg.event === 'pusher_internal:subscription_succeeded' ||
      msg.event === 'pusher:subscription_succeeded'
    ) {
      return;
    }

    if (msg.event === 'pusher:subscription_error' || msg.event === 'pusher:error') {
      if (msg.channel) {
        this.subscribedChannels.delete(msg.channel);
      }
      return;
    }

    if (msg.channel && msg.event && !msg.event.startsWith('pusher:') && !msg.event.startsWith('pusher_internal:')) {
      let payloadData = msg.data;
      if (typeof payloadData === 'string') {
        try {
          payloadData = JSON.parse(payloadData);
        } catch {
          // Giữ nguyên chuỗi
        }
      }

      const normalizedPayload: OperationalNotificationPayload = {
        id: payloadData?.id || `ws-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: payloadData?.title || 'Thông báo vận hành',
        message: payloadData?.message || '',
        orderId: payloadData?.order_id ?? payloadData?.orderId,
        orderCode: payloadData?.order_code ?? payloadData?.orderCode,
        severity: payloadData?.severity || 'info',
        timestamp: payloadData?.timestamp || payloadData?.created_at || new Date().toISOString(),
        actionUrl: payloadData?.action_url || payloadData?.actionUrl,
        type: payloadData?.type || 'order_status',
        tenantId: payloadData?.tenant_id ?? payloadData?.tenantId ?? null,
        branchId: payloadData?.branch_id ?? payloadData?.branchId ?? null,
        targetRole: payloadData?.target_role ?? payloadData?.targetRole ?? null,
        userId: payloadData?.user_id ?? payloadData?.userId ?? null,
        ...payloadData,
      };

      const eventName = msg.event.replace(/^\.+/, '');
      if (isOperationalEventWhitelisted(eventName, normalizedPayload)) {
        // Chỉ gọi callback this.onEvent nếu được cung cấp, ngược lại mới emit qua realtimeEventBus
        // để tránh việc NotificationProvider vừa nhận onEvent vừa nhận từ bus gây double chime và trùng lặp toast
        if (this.onEvent) {
          this.onEvent(eventName, normalizedPayload);
        } else {
          realtimeEventBus.emit(eventName, normalizedPayload);
        }
      }
    }
  }

  private async authorizePrivateChannel(
    privateChannel: string,
    signal?: AbortSignal
  ): Promise<{ auth: string; channel_data?: string } | null> {
    if (!this.socketId || this.isDestroyed) {
      return null;
    }

    const token = this.resolveBearerToken();
    if (!token) {
      // Fail-Closed: Không có Bearer Token thì tuyệt đối không gửi subscribe public
      this.onAuthError?.(privateChannel, 401, new Error('Missing Sanctum Bearer token'));
      return null;
    }

    const fetchFn =
      this.fetchImpl ||
      (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);

    if (!fetchFn) {
      return null;
    }

    const authHeaderValue = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

    try {
      const response = await fetchFn(this.config.authEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: authHeaderValue,
        },
        body: JSON.stringify({
          socket_id: this.socketId,
          channel_name: privateChannel,
        }),
        signal,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // Gỡ kênh bị từ chối khỏi danh sách theo dõi hiện tại để tránh spam auth lặp lại
          this.channels.delete(privateChannel);
        }
        this.onAuthError?.(privateChannel, response.status);
        return null;
      }

      const rawJson = await response.json();
      const authSignature: string | undefined = rawJson?.auth ?? rawJson?.data?.auth;
      const channelData: string | undefined =
        rawJson?.channel_data ?? rawJson?.data?.channel_data;

      if (!authSignature || typeof authSignature !== 'string') {
        this.onAuthError?.(privateChannel, 500, new Error('Invalid broadcasting auth payload'));
        return null;
      }

      return channelData !== undefined
        ? { auth: authSignature, channel_data: channelData }
        : { auth: authSignature };
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        this.onAuthError?.(privateChannel, 0, err);
      }
      return null;
    }
  }

  private async subscribeChannel(rawChannel: string): Promise<boolean> {
    const channel = toPrivateChannelName(rawChannel);
    if (!channel || this.isDestroyed || !this.socketId) {
      return false;
    }

    if (this.subscribedChannels.has(channel)) {
      return true;
    }

    this.abortPendingAuth(channel);
    const controller = new AbortController();
    this.pendingAuthControllers.set(channel, controller);

    try {
      const authPayload = await this.authorizePrivateChannel(channel, controller.signal);
      if (
        !authPayload ||
        this.isDestroyed ||
        !this._isConnected ||
        !this.socketId ||
        !this.channels.has(channel)
      ) {
        return false;
      }

      const subscribeData: Record<string, any> = {
        channel,
        auth: authPayload.auth,
      };
      if (authPayload.channel_data !== undefined) {
        subscribeData.channel_data = authPayload.channel_data;
      }

      this.subscribedChannels.add(channel);
      this.send({
        event: 'pusher:subscribe',
        data: subscribeData,
      });
      return true;
    } finally {
      if (this.pendingAuthControllers.get(channel) === controller) {
        this.pendingAuthControllers.delete(channel);
      }
    }
  }

  private unsubscribeChannel(rawChannel: string) {
    const channel = toPrivateChannelName(rawChannel);
    if (!channel) return;

    this.abortPendingAuth(channel);
    if (this.subscribedChannels.has(channel)) {
      this.subscribedChannels.delete(channel);
      this.send({
        event: 'pusher:unsubscribe',
        data: { channel },
      });
    }
  }

  private abortPendingAuth(channel: string) {
    const existing = this.pendingAuthControllers.get(channel);
    if (existing) {
      try {
        existing.abort();
      } catch {
        // ignore
      }
      this.pendingAuthControllers.delete(channel);
    }
  }

  private abortAllPendingAuths() {
    this.pendingAuthControllers.forEach((ctrl) => {
      try {
        ctrl.abort();
      } catch {
        // ignore
      }
    });
    this.pendingAuthControllers.clear();
  }

  private send(obj: any) {
    if (this.ws && this.ws.readyState === 1) {
      try {
        this.ws.send(JSON.stringify(obj));
      } catch {
        // Bỏ qua lỗi gửi
      }
    }
  }

  private startHeartbeat() {
    this.cleanupHeartbeat();
    this.pingInterval = setInterval(() => {
      this.send({ event: 'pusher:ping', data: {} });
    }, 30000);
  }

  private cleanupHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(delayMs?: number) {
    if (this.reconnectTimer) return;
    this.retryCount++;

    // Exponential backoff: 5s -> 15s -> 30s -> 60s
    let delay = delayMs;
    if (delay === undefined) {
      if (this.retryCount === 1) {
        delay = 5000;
      } else if (this.retryCount === 2) {
        delay = 15000;
      } else if (this.retryCount === 3) {
        delay = 30000;
      } else {
        delay = 60000;
      }
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private setConnected(val: boolean) {
    if (this._isConnected !== val) {
      this._isConnected = val;
      this.onConnectionChange?.(val);
    }
  }

  public disconnect() {
    this.isDestroyed = true;
    this.socketId = null;
    this.subscribedChannels.clear();
    this.abortAllPendingAuths();
    this.cleanupHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onerror = () => {};
        this.ws.onclose = () => {};
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.setConnected(false);
  }
}

