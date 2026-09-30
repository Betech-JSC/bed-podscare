'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import type { NotificationItem } from '@podscare/ui';
import { notificationService } from '@podscare/api-client';
import { useAudioChime } from '../utils/audioChime';

import {
  isOperationalEventWhitelisted,
  realtimeEventBus,
  computeTargetChannels,
  ReverbSocketClient,
  type OperationalNotificationPayload,
} from '../utils/socketNotifications';

export * from '../utils/socketNotifications';

/* ==========================================================================
   HOOK useSocketNotifications
   ========================================================================== */

export interface UseSocketNotificationsOptions {
  branchId?: string | number | null;
  role?: string | null;
  userId?: string | number | null;
  onOperationalEvent?: (
    payload: OperationalNotificationPayload,
    eventName: string
  ) => void;
  enabled?: boolean;
}

export interface UseSocketNotificationsReturn {
  isConnected: boolean;
  activeChannels: string[];
  dispatchEvent: (
    eventName: string,
    payload: Partial<OperationalNotificationPayload>
  ) => boolean;
}

/**
 * Hook kết nối Socket channel theo chi nhánh/vai trò và tích hợp realtime event bus.
 */
export function useSocketNotifications(
  options: UseSocketNotificationsOptions = {}
): UseSocketNotificationsReturn {
  const {
    branchId,
    role,
    userId,
    onOperationalEvent,
    enabled = true,
  } = options;

  const [isConnected, setIsConnected] = useState<boolean>(true);

  // Tính toán danh sách các private channels tương ứng với vai trò và chi nhánh
  const activeChannels = useMemo<string[]>(() => {
    return computeTargetChannels(branchId, role, userId);
  }, [branchId, role, userId]);

  // Lắng nghe realtime event bus cục bộ, Reverb WebSocket và CustomEvent từ window
  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = realtimeEventBus.subscribe(({ eventName, payload }) => {
      if (isOperationalEventWhitelisted(eventName, payload)) {
        onOperationalEvent?.(payload, eventName);
      }
    });

    // Lắng nghe CustomEvent trên window để hỗ trợ Playwright/E2E hoặc script bên ngoài
    const handleCustomEvent = (evt: Event) => {
      const customEvt = evt as CustomEvent<any>;
      const detail = customEvt.detail;
      if (detail) {
        // Hỗ trợ cả 2 dạng: detail = { eventName, payload } HOẶC detail = payload trực tiếp
        const payload: OperationalNotificationPayload = detail.payload || detail;
        const evName =
          detail.eventName ||
          (payload?.type ? `order.${payload.type}` : 'order.operational');
        if (payload && isOperationalEventWhitelisted(evName, payload)) {
          onOperationalEvent?.(payload, evName);
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('podscare:operational_event', handleCustomEvent);
    }

    // Kết nối WebSocket Reverb native client nếu ở môi trường trình duyệt
    let reverbClient: ReverbSocketClient | null = null;
    if (typeof window !== 'undefined') {
      try {
        reverbClient = new ReverbSocketClient(undefined, {
          onConnectionChange: (connected: boolean) => {
            if (connected) {
              setIsConnected(true);
            }
          },
          onEvent: (eventName, payload) => {
            onOperationalEvent?.(payload, eventName);
          },
        });
        reverbClient.setChannels(activeChannels);
        reverbClient.connect();
      } catch (err) {
        if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SOCKET_DEBUG === 'true') {
          console.debug('[useSocketNotifications] ReverbSocketClient offline fallback:', err);
        }
      }
    }

    return () => {
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('podscare:operational_event', handleCustomEvent);
      }
      if (reverbClient) {
        reverbClient.disconnect();
      }
    };
  }, [enabled, onOperationalEvent, activeChannels]);

  // Hàm phát sự kiện giả lập / thử nghiệm
  const dispatchEvent = useCallback(
    (eventName: string, payload: Partial<OperationalNotificationPayload>): boolean => {
      const fullPayload: OperationalNotificationPayload = {
        id: payload.id || `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: payload.title || 'Thông báo vận hành',
        message: payload.message || '',
        orderId: payload.orderId,
        orderCode: payload.orderCode,
        severity: payload.severity || 'info',
        timestamp: payload.timestamp || new Date().toISOString(),
        actionUrl: payload.actionUrl || (payload.orderId ? `/repairs?id=${payload.orderId}` : '/repairs'),
        type: payload.type || 'order_status',
        branchId: payload.branchId ?? branchId,
        targetRole: payload.targetRole ?? role,
        userId: payload.userId ?? userId,
        eventName,
        ...payload,
      };

      return realtimeEventBus.emit(eventName, fullPayload);
    },
    [branchId, role, userId]
  );

  return {
    isConnected,
    activeChannels,
    dispatchEvent,
  };
}

/* ==========================================================================
   NOTIFICATION PROVIDER & CONTEXT
   ========================================================================== */

export interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  isMuted: boolean;
  toggleMute: () => void;
  setIsMuted: (muted: boolean) => void;
  playChime: () => void;
  markAsRead: (id: string | number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  handleNotificationClick: (
    item: NotificationItem,
    router?: { push: (url: string) => void }
  ) => void;
  activeChannels: string[];
  isConnected: boolean;
  dispatchMockEvent: (
    eventName: string,
    payload?: Partial<OperationalNotificationPayload>
  ) => boolean;
  refreshNotifications: () => Promise<void>;
  isLoading: boolean;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications phải được sử dụng bên trong NotificationProvider');
  }
  return context;
};

export interface NotificationProviderProps {
  children: React.ReactNode;
  branchId?: string | number | null;
  role?: string | null;
  userId?: string | number | null;
  initialNotifications?: NotificationItem[];
  enabled?: boolean;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
  branchId: explicitBranchId,
  role: explicitRole,
  userId: explicitUserId,
  initialNotifications,
  enabled = true,
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>(
    initialNotifications || []
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Tích hợp bộ phát âm thanh Web Audio Chime (Zero-Latency Audio Synthesizer)
  const { isMuted, toggleMute, setIsMuted, playChime } = useAudioChime();

  // Bộ nhớ đệm chống xử lý trùng lặp giữa Socket, RealtimeEventBus và Window CustomEvent
  const processedEventIdsRef = useRef<Set<string>>(new Set());

  // Xác định unread count tự động từ state
  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length;
  }, [notifications]);

  // Tải danh sách thông báo thực tế từ REST API
  const refreshNotifications = useCallback(async () => {
    if (!enabled) return;
    try {
      setIsLoading(true);
      const params: any = { per_page: 30 };
      if (explicitBranchId && explicitBranchId !== 'all') {
        params.branch_id = explicitBranchId;
      }

      const res = await notificationService.getNotifications(params);
      const raw = res?.data;
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(res)
        ? res
        : [];

      const mapped: NotificationItem[] = list.map((item: any) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        message: item.message,
        orderId: item.order_id,
        orderCode: item.repair_order?.order_code,
        severity: item.severity || 'info',
        timestamp: item.created_at || new Date().toISOString(),
        actionUrl:
          item.action_url ||
          (item.order_id ? `/repairs?id=${item.order_id}` : '/repairs'),
        isRead: Boolean(item.is_read),
        readAt: item.read_at,
      }));

      // Luôn gán danh sách thực tế từ database
      setNotifications(mapped);
    } catch {
      // Giữ nguyên danh sách hiện tại nếu API không phản hồi (fallback an toàn)
    } finally {
      setIsLoading(false);
    }
  }, [explicitBranchId, enabled]);

  // Callback nhận sự kiện hợp lệ từ Socket / Event Bus
  const handleIncomingOperationalEvent = useCallback(
    (payload: OperationalNotificationPayload, eventName: string) => {
      // 1. Kiểm tra lại Whitelist nghiêm ngặt
      if (!isOperationalEventWhitelisted(eventName, payload)) {
        return;
      }

      // 2. Chống xử lý trùng lặp theo ID
      const eventId = payload.id
        ? String(payload.id)
        : `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      if (processedEventIdsRef.current.has(eventId)) {
        return;
      }
      processedEventIdsRef.current.add(eventId);
      if (processedEventIdsRef.current.size > 300) {
        const toDelete = Array.from(processedEventIdsRef.current).slice(0, 150);
        toDelete.forEach((id) => processedEventIdsRef.current.delete(id));
      }

      // 3. Chuẩn hóa payload thành NotificationItem
      const newItem: NotificationItem = {
        id: eventId,
        type: payload.type || 'order_status',
        title: payload.title || 'Thông báo vận hành',
        message: payload.message || '',
        orderId: payload.orderId,
        orderCode: payload.orderCode || (payload.orderId ? String(payload.orderId) : undefined),
        severity: payload.severity || 'info',
        timestamp: payload.timestamp || new Date().toISOString(),
        actionUrl:
          payload.actionUrl ||
          (payload.orderId ? `/repairs?id=${payload.orderId}` : '/repairs'),
        isRead: false,
        readAt: null,
      };

      // 4. Prepend thông báo vào danh sách (chống trùng lặp theo ID)
      setNotifications((prev) => {
        if (prev.some((item) => String(item.id) === String(newItem.id))) {
          return prev;
        }
        return [newItem, ...prev];
      });

      // 5. Kích hoạt tiếng "ting ting" chuông pha lê ngay lập tức
      playChime();

      // 6. Tự động reload lại danh sách từ database sau 400ms để đảm bảo đồng bộ 100%
      setTimeout(() => {
        refreshNotifications();
      }, 400);
    },
    [playChime, refreshNotifications]
  );

  // Kết nối socket & event bus
  const { isConnected, activeChannels, dispatchEvent } = useSocketNotifications({
    branchId: explicitBranchId,
    role: explicitRole,
    userId: explicitUserId,
    onOperationalEvent: handleIncomingOperationalEvent,
    enabled,
  });

  useEffect(() => {
    if (!enabled) return;

    refreshNotifications();

    // Chu kỳ polling thông minh mỗi 15 giây để tự động đồng bộ thông báo mới từ database
    const interval = setInterval(() => {
      refreshNotifications();
    }, 15000);

    // Tự động tải lại khi người dùng quay lại tab trình duyệt
    const handleFocus = () => {
      refreshNotifications();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
      }
    };
  }, [enabled, refreshNotifications]);

  // Đánh dấu đã đọc một thông báo (Optimistic update + Sync REST API)
  const markAsRead = useCallback(async (id: string | number) => {
    const nowIso = new Date().toISOString();

    // 1. Optimistic update tức thì trên UI
    setNotifications((prev) =>
      prev.map((item) =>
        String(item.id) === String(id)
          ? { ...item, isRead: true, readAt: nowIso }
          : item
      )
    );

    // 2. Gọi API đồng bộ với backend nếu ID là số thực tế
    const numericId = typeof id === 'number' ? id : parseInt(String(id), 10);
    if (!isNaN(numericId) && !String(id).startsWith('notif-')) {
      try {
        await notificationService.markAsRead(numericId);
      } catch (err) {
        if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SOCKET_DEBUG === 'true') {
          console.debug('[NotificationProvider] Lỗi đồng bộ trạng thái đã đọc tới server:', err);
        }
      }
    }
  }, []);

  // Đánh dấu đã đọc tất cả (Optimistic update + Sync REST API)
  const markAllAsRead = useCallback(async () => {
    const nowIso = new Date().toISOString();

    // 1. Optimistic update toàn bộ danh sách
    setNotifications((prev) =>
      prev.map((item) => ({ ...item, isRead: true, readAt: item.readAt || nowIso }))
    );

    // 2. Gọi API đồng bộ với backend
    try {
      await notificationService.markAllAsRead({
        branch_id: explicitBranchId !== 'all' ? explicitBranchId ?? undefined : undefined,
      });
      await refreshNotifications();
    } catch (err) {
      if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SOCKET_DEBUG === 'true') {
        console.debug('[NotificationProvider] Lỗi đồng bộ đánh dấu đọc tất cả tới server:', err);
      }
    }
  }, [explicitBranchId, refreshNotifications]);

  // Điều hướng khi click thông báo
  const handleNotificationClick = useCallback(
    (item: NotificationItem, router?: { push: (url: string) => void }) => {
      // Đánh dấu đã đọc
      if (!item.isRead) {
        markAsRead(item.id);
      }

      // Điều hướng tới trang đích
      const destination =
        item.actionUrl ||
        (item.orderId ? `/repairs?id=${item.orderId}` : '/repairs');

      if (router && typeof router.push === 'function') {
        router.push(destination);
      } else if (typeof window !== 'undefined') {
        window.location.href = destination;
      }
    },
    [markAsRead]
  );

  // Bắn thử nghiệm mock event
  const dispatchMockEvent = useCallback(
    (eventName: string, payload?: Partial<OperationalNotificationPayload>): boolean => {
      return dispatchEvent(eventName, payload || {});
    },
    [dispatchEvent]
  );

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isMuted,
        toggleMute,
        setIsMuted,
        playChime,
        markAsRead,
        markAllAsRead,
        handleNotificationClick,
        activeChannels,
        isConnected,
        dispatchMockEvent,
        refreshNotifications,
        isLoading,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
