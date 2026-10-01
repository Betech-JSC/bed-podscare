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

  const apiBase =
    process.env.NEXT_PUBLIC_API_URL ||
    (isBrowser && window.location ? `${window.location.origin}/api/v1` : 'http://localhost:8000/api/v1');

  const authEndpoint =
    process.env.NEXT_PUBLIC_BROADCAST_AUTH_URL || `${apiBase}/broadcasting/auth`;

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

/**
 * Quản lý kết nối WebSocket native trực tiếp tới Laravel Reverb server.
 * Tương thích 100% giao thức Pusher v7 được Reverb triển khai:
 * - Tự động handshake `pusher:connection_established`
 * - Gửi lệnh `pusher:subscribe` cho từng channel trong target channels
 * - Phản hồi `pusher:ping` -> `pusher:pong` giữ kết nối alive (Heartbeat)
 * - Tự động reconnect với exponential backoff khi mất kết nối mạng
 * - Bắn các event nhận được vào RealtimeEventBus sau khi kiểm tra whitelist
 */
export class ReverbSocketClient {
  private ws: any = null;
  private config: ReverbEchoConfig;
  private channels: Set<string> = new Set();
  private reconnectTimer: any = null;
  private pingInterval: any = null;
  private isDestroyed: boolean = false;
  private _isConnected: boolean = false;
  private retryCount: number = 0;
  private onConnectionChange?: (connected: boolean) => void;
  private onEvent?: (eventName: string, payload: OperationalNotificationPayload) => void;

  constructor(
    config?: Partial<ReverbEchoConfig>,
    options?: {
      onConnectionChange?: (connected: boolean) => void;
      onEvent?: (eventName: string, payload: OperationalNotificationPayload) => void;
    }
  ) {
    this.config = { ...getReverbEchoConfig(), ...config };
    this.onConnectionChange = options?.onConnectionChange;
    this.onEvent = options?.onEvent;
  }

  public get isConnected(): boolean {
    return this._isConnected;
  }

  public setChannels(newChannels: string[]) {
    const prev = new Set(this.channels);
    this.channels = new Set(newChannels);

    if (this._isConnected && this.ws && this.ws.readyState === 1) {
      newChannels.forEach((ch) => {
        if (!prev.has(ch)) {
          this.subscribeChannel(ch);
        }
      });
      prev.forEach((ch) => {
        if (!this.channels.has(ch)) {
          this.unsubscribeChannel(ch);
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
        // Chờ pusher:connection_established trước khi đánh dấu connected
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

  private handleSocketMessage(msg: { event: string; channel?: string; data?: any }) {
    if (msg.event === 'pusher:connection_established') {
      this.retryCount = 0;
      this.setConnected(true);
      this.startHeartbeat();
      this.channels.forEach((ch) => this.subscribeChannel(ch));
      return;
    }

    if (msg.event === 'pusher:ping') {
      this.send({ event: 'pusher:pong', data: {} });
      return;
    }

    if (msg.event === 'pusher_internal:subscription_succeeded') {
      return;
    }

    if (msg.channel && msg.event && !msg.event.startsWith('pusher:')) {
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
        orderId: payloadData?.order_id || payloadData?.orderId,
        orderCode: payloadData?.order_code || payloadData?.orderCode,
        severity: payloadData?.severity || 'info',
        timestamp: payloadData?.timestamp || payloadData?.created_at || new Date().toISOString(),
        actionUrl: payloadData?.action_url || payloadData?.actionUrl,
        type: payloadData?.type || 'order_status',
        branchId: payloadData?.branch_id ?? payloadData?.branchId,
        ...payloadData,
      };

      const eventName = msg.event;
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

  private subscribeChannel(channel: string) {
    this.send({
      event: 'pusher:subscribe',
      data: { channel },
    });
  }

  private unsubscribeChannel(channel: string) {
    this.send({
      event: 'pusher:unsubscribe',
      data: { channel },
    });
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

