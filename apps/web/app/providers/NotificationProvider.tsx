'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import type { NotificationItem } from '@podscare/ui';
import { notificationService } from '@podscare/api-client';
import { useAudioChime } from '../utils/audioChime';

import {
  isOperationalEventWhitelisted,
  realtimeEventBus,
  computeTargetChannels,
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

  const [isConnected] = useState<boolean>(true);

  // Tính toán danh sách các private channels tương ứng với vai trò và chi nhánh
  const activeChannels = useMemo<string[]>(() => {
    return computeTargetChannels(branchId, role, userId);
  }, [branchId, role, userId]);

  // Lắng nghe realtime event bus cục bộ và CustomEvent từ window
  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = realtimeEventBus.subscribe(({ eventName, payload }) => {
      if (isOperationalEventWhitelisted(eventName, payload)) {
        onOperationalEvent?.(payload, eventName);
      }
    });

    // Lắng nghe CustomEvent trên window để hỗ trợ Playwright/E2E hoặc script bên ngoài
    const handleCustomEvent = (evt: Event) => {
      const customEvt = evt as CustomEvent<{
        eventName?: string;
        payload?: OperationalNotificationPayload;
      }>;
      const detail = customEvt.detail;
      if (detail && detail.payload) {
        const evName = detail.eventName || 'order.operational';
        if (isOperationalEventWhitelisted(evName, detail.payload)) {
          onOperationalEvent?.(detail.payload, evName);
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('podscare:operational_event', handleCustomEvent);
    }

    return () => {
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('podscare:operational_event', handleCustomEvent);
      }
    };
  }, [enabled, onOperationalEvent]);

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

// Dữ liệu thông báo mặc định cho môi trường khởi tạo / dev fallback
const initialDefaultNotifications: NotificationItem[] = [
  {
    id: 'notif-1',
    type: 'sla_warning',
    title: 'Cảnh báo vượt SLA tiếp nhận',
    message: 'Đơn hàng AirPods Pro 2 đã quá 2h chưa được phân công kỹ thuật viên.',
    orderId: 'PC26-00980',
    orderCode: 'PC26-00980',
    severity: 'danger',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    actionUrl: '/repairs?id=PC26-00980',
    isRead: false,
    readAt: null,
  },
  {
    id: 'notif-2',
    type: 'qc_action',
    title: 'Đơn chờ kiểm định chất lượng',
    message: 'Kỹ thuật viên Duy T. đã hoàn tất sửa chữa và chuyển sang bước kiểm định QC.',
    orderId: 'PC26-00979',
    orderCode: 'PC26-00979',
    severity: 'info',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    actionUrl: '/qc',
    isRead: false,
    readAt: null,
  },
  {
    id: 'notif-3',
    type: 'order_status',
    title: 'Đơn hàng sẵn sàng giao trả',
    message: 'Đơn AirPods Pro đã hoàn tất quy trình kiểm định đạt chuẩn 100%.',
    orderId: 'PC26-00976',
    orderCode: 'PC26-00976',
    severity: 'success',
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    actionUrl: '/repairs?id=PC26-00976',
    isRead: true,
    readAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
];

export interface NotificationProviderProps {
  children: React.ReactNode;
  branchId?: string | number | null;
  role?: string | null;
  userId?: string | number | null;
  initialNotifications?: NotificationItem[];
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
  branchId: explicitBranchId,
  role: explicitRole,
  userId: explicitUserId,
  initialNotifications,
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>(
    initialNotifications || initialDefaultNotifications
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Tích hợp bộ phát âm thanh Web Audio Chime (Zero-Latency Audio Synthesizer)
  const { isMuted, toggleMute, setIsMuted, playChime } = useAudioChime();

  // Xác định unread count tự động từ state
  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length;
  }, [notifications]);

  // Callback nhận sự kiện hợp lệ từ Socket / Event Bus
  const handleIncomingOperationalEvent = useCallback(
    (payload: OperationalNotificationPayload, eventName: string) => {
      // 1. Kiểm tra lại Whitelist nghiêm ngặt
      if (!isOperationalEventWhitelisted(eventName, payload)) {
        return;
      }

      // 2. Chuẩn hóa payload thành NotificationItem
      const newItem: NotificationItem = {
        id: payload.id
          ? String(payload.id)
          : `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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

      // 3. Prepend thông báo vào danh sách (chống trùng lặp theo ID)
      setNotifications((prev) => {
        if (prev.some((item) => String(item.id) === String(newItem.id))) {
          return prev;
        }
        return [newItem, ...prev];
      });

      // 4. Kích hoạt tiếng "ting" chuông pha lê ngay lập tức
      playChime();
    },
    [playChime]
  );

  // Kết nối socket & event bus
  const { isConnected, activeChannels, dispatchEvent } = useSocketNotifications({
    branchId: explicitBranchId,
    role: explicitRole,
    userId: explicitUserId,
    onOperationalEvent: handleIncomingOperationalEvent,
    enabled: true,
  });

  // Tải danh sách thông báo ban đầu từ REST API (với fallback an toàn)
  const refreshNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      const params: any = { per_page: 20 };
      if (explicitBranchId && explicitBranchId !== 'all') {
        params.branch_id = explicitBranchId;
      }
      if (explicitUserId) {
        params.user_id = explicitUserId;
      }

      const res = await notificationService.getNotifications(params);
      if (res && res.data && Array.isArray(res.data.data)) {
        const mapped: NotificationItem[] = res.data.data.map((item: any) => ({
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

        if (mapped.length > 0) {
          setNotifications(mapped);
        }
      }
    } catch {
      // Giữ nguyên danh sách hiện tại nếu API không phản hồi (fallback dev)
    } finally {
      setIsLoading(false);
    }
  }, [explicitBranchId, explicitUserId]);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

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
        console.warn('[NotificationProvider] Lỗi đồng bộ trạng thái đã đọc tới server:', err);
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
        user_id: explicitUserId ?? undefined,
      });
    } catch (err) {
      console.warn('[NotificationProvider] Lỗi đồng bộ đánh dấu đọc tất cả tới server:', err);
    }
  }, [explicitBranchId, explicitUserId]);

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
