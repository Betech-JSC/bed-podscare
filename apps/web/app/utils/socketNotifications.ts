import type { NotificationSeverity, NotificationType } from '@podscare/ui';

/**
 * Cấu trúc Payload sự kiện vận hành đồng bộ với OrderOperationalEvent từ backend Laravel.
 */
export interface OperationalNotificationPayload {
  id: string | number;
  orderId?: string | number;
  orderCode?: string;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  timestamp?: string; // ISO 8601
  actionUrl?: string; // Ví dụ: "/repairs?id=123" hoặc "/qc?id=123"
  type?: NotificationType;
  branchId?: number | string | null;
  targetRole?: string | null;
  userId?: number | string | null;
  eventName?: string;
  [key: string]: any;
}

/**
 * Danh sách tiền tố và type sự kiện hợp lệ (Operational Lifecycle Whitelist).
 * Nghiêm cấm nhận các thông báo quảng cáo, tiếp thị, tin tức ngoài lề.
 */
export const ALLOWED_EVENT_PREFIXES = ['order.', 'sla.', 'qc.', 'quote.'];

export const ALLOWED_NOTIFICATION_TYPES: string[] = [
  'order_status',
  'sla_warning',
  'qc_action',
  'quote_action',
  'order_created',
  'order_assigned',
  'order_in_repair',
  'order_qc_pending',
  'order_ready_delivery',
  'order_completed',
  'order_cancelled',
];

/**
 * Hàm kiểm tra sự kiện theo whitelist vận hành nghiêm ngặt.
 * Trả về true nếu thuộc vòng đời đơn hàng, SLA, QC hoặc Báo giá.
 */
export function isOperationalEventWhitelisted(
  eventName?: string,
  payload?: Partial<OperationalNotificationPayload>
): boolean {
  // 1. Kiểm tra prefix của tên sự kiện
  if (eventName) {
    const lowerEvent = eventName.toLowerCase();
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
 * Tính toán danh sách các private channels tương ứng với chi nhánh / vai trò / người dùng.
 */
export function computeTargetChannels(
  branchId?: string | number | null,
  role?: string | null,
  userId?: string | number | null
): string[] {
  const channels: string[] = ['orders.all'];

  if (branchId !== undefined && branchId !== null && branchId !== 'all') {
    channels.push(`branch.${branchId}.orders`);
    if (role) {
      channels.push(`branch.${branchId}.${role}`);
    }
  }

  if (role) {
    channels.push(`role.${role}`);
  }

  if (userId !== undefined && userId !== null) {
    channels.push(`user.${userId}`);
  }

  return channels;
}
