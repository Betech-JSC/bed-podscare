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
import { notificationService, type NotificationRecord } from '@podscare/api-client';
import { useAudioChime } from '../utils/audioChime';

import {
  isOperationalEventWhitelisted,
  isPayloadAuthorizedForSession,
  normalizeNotificationRole,
  resolveNotificationActionUrl,
  buildNotificationSessionKey,
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
  tenantId?: string | number | null;
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
 * Hook kết nối Socket channel riêng tư (`private-*`) theo Nền tảng / Gian hàng / Chi nhánh / Vai trò
 * và tích hợp realtime event bus.
 */
export function useSocketNotifications(
  options: UseSocketNotificationsOptions = {}
): UseSocketNotificationsReturn {
  const {
    tenantId,
    branchId,
    role,
    userId,
    onOperationalEvent,
    enabled = true,
  } = options;

  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Tính toán danh sách các private channels tương ứng với tenant, chi nhánh, vai trò và user
  const activeChannels = useMemo<string[]>(() => {
    if (!enabled) {
      return [];
    }
    return computeTargetChannels(tenantId, branchId, role, userId);
  }, [enabled, tenantId, branchId, role, userId]);

  // Lắng nghe realtime event bus cục bộ, Reverb WebSocket và CustomEvent từ window
  useEffect(() => {
    if (!enabled) {
      setIsConnected(false);
      return;
    }

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

    // Kết nối WebSocket Reverb native client với xác thực private-* khi có kênh hợp lệ
    let reverbClient: ReverbSocketClient | null = null;
    if (typeof window !== 'undefined' && activeChannels.length > 0) {
      try {
        reverbClient = new ReverbSocketClient(undefined, {
          onConnectionChange: (connected: boolean) => {
            setIsConnected(connected);
          },
          onEvent: (eventName, payload) => {
            onOperationalEvent?.(payload, eventName);
          },
        });
        reverbClient.setChannels(activeChannels);
        reverbClient.connect();
      } catch (err) {
        setIsConnected(false);
        if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SOCKET_DEBUG === 'true') {
          console.debug('[useSocketNotifications] ReverbSocketClient offline fallback:', err);
        }
      }
    } else {
      setIsConnected(false);
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
      const isPlatformUser = normalizeNotificationRole(role) === 'super_admin';
      const resolvedTenantId =
        payload.tenantId !== undefined
          ? payload.tenantId
          : isPlatformUser
          ? null
          : tenantId ?? null;

      const fullPayload: OperationalNotificationPayload = {
        id: payload.id || `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title:
          payload.title ||
          (isPlatformUser ? 'Thông báo Nền tảng' : 'Thông báo vận hành'),
        message: payload.message || '',
        orderId: payload.orderId,
        orderCode: payload.orderCode,
        severity: payload.severity || 'info',
        timestamp: payload.timestamp || new Date().toISOString(),
        actionUrl: resolveNotificationActionUrl({
          actionUrl: payload.actionUrl,
          type: payload.type,
          orderId: payload.orderId,
          role,
          targetRole: payload.targetRole,
        }),
        type: payload.type || (isPlatformUser ? 'tenant_registered' : 'order_status'),
        tenantId: resolvedTenantId,
        branchId: payload.branchId !== undefined ? payload.branchId : branchId,
        targetRole: payload.targetRole !== undefined ? payload.targetRole : role,
        userId: payload.userId !== undefined ? payload.userId : userId,
        eventName,
        ...payload,
      };

      return realtimeEventBus.emit(eventName, fullPayload);
    },
    [tenantId, branchId, role, userId]
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
  tenantId?: string | number | null;
  branchId?: string | number | null;
  role?: string | null;
  userId?: string | number | null;
  initialNotifications?: NotificationItem[];
  enabled?: boolean;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
  tenantId: explicitTenantId,
  branchId: explicitBranchId,
  role: explicitRole,
  userId: explicitUserId,
  initialNotifications,
  enabled = true,
}) => {
  const sessionKey = useMemo(
    () =>
      buildNotificationSessionKey({
        enabled,
        userId: explicitUserId,
        tenantId: explicitTenantId,
        role: explicitRole,
      }),
    [enabled, explicitUserId, explicitTenantId, explicitRole]
  );

  const [notifications, setNotifications] = useState<NotificationItem[]>(() =>
    enabled && initialNotifications ? initialNotifications : []
  );
  const [boundSessionKey, setBoundSessionKey] = useState<string>(sessionKey);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Tích hợp bộ phát âm thanh Web Audio Chime (Zero-Latency Audio Synthesizer)
  const { isMuted, toggleMute, setIsMuted, playChime } = useAudioChime();

  // Bộ nhớ đệm chống xử lý trùng lặp giữa Socket, RealtimeEventBus và Window CustomEvent
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  // Khóa thế hệ phiên để hủy bỏ mọi response API trễ từ phiên đăng nhập trước đó
  const sessionGenerationRef = useRef<number>(0);
  const activeSessionKeyRef = useRef<string>(sessionKey);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ngay thời điểm render khi đăng xuất (!enabled) hoặc đổi tài khoản (sessionKey lệch boundSessionKey),
  // trả về mảng rỗng tức thì (0ms, không bao giờ lóe thông báo cũ của phiên trước)
  const isolatedNotifications = useMemo<NotificationItem[]>(() => {
    if (!enabled || boundSessionKey !== sessionKey) {
      return [];
    }
    return notifications;
  }, [enabled, boundSessionKey, sessionKey, notifications]);

  // Reset sạch state & bộ nhớ chống trùng ngay khi đăng xuất hoặc đổi khóa phiên (userId, tenantId, role)
  useEffect(() => {
    if (!enabled || activeSessionKeyRef.current !== sessionKey) {
      activeSessionKeyRef.current = sessionKey;
      sessionGenerationRef.current += 1;
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      processedEventIdsRef.current.clear();
      setNotifications([]);
      setBoundSessionKey(sessionKey);
    }
  }, [enabled, sessionKey]);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, []);

  // Xác định unread count tự động từ state đã cô lập theo phiên
  const unreadCount = useMemo(() => {
    return isolatedNotifications.filter((n) => !n.isRead).length;
  }, [isolatedNotifications]);

  // Tải danh sách thông báo thực tế từ REST API (đã cô lập 3 tầng ở Backend + kiểm tra thế hệ phiên ở Client)
  const refreshNotifications = useCallback(async () => {
    if (!enabled) {
      setNotifications([]);
      return;
    }

    const normalizedRole = normalizeNotificationRole(explicitRole);
    const hasValidTenant =
      explicitTenantId !== null &&
      explicitTenantId !== undefined &&
      String(explicitTenantId).trim() !== '';

    // Fail-closed phía Client: nếu không phải super_admin mà thiếu tenantId thì xóa sạch danh sách
    if (!normalizedRole || (normalizedRole !== 'super_admin' && !hasValidTenant)) {
      setNotifications([]);
      setBoundSessionKey(sessionKey);
      return;
    }

    const requestGeneration = sessionGenerationRef.current;
    const requestSessionKey = sessionKey;

    try {
      setIsLoading(true);
      const params: Record<string, any> = { per_page: 30 };
      if (
        normalizedRole === 'admin' &&
        explicitBranchId &&
        explicitBranchId !== 'all'
      ) {
        params.branch_id = explicitBranchId;
      }

      const res = await notificationService.getNotifications(params, {
        skipAuthRedirect: true,
      });

      // Hủy bỏ kết quả nếu người dùng đã đăng xuất hoặc chuyển sang tài khoản khác trong lúc chờ mạng
      if (
        requestGeneration !== sessionGenerationRef.current ||
        activeSessionKeyRef.current !== requestSessionKey
      ) {
        return;
      }

      const raw = res?.data;
      const list: NotificationRecord[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.notifications)
        ? raw.notifications
        : Array.isArray(res)
        ? res
        : [];

      const mapped: NotificationItem[] = list
        .filter((item: NotificationRecord) => {
          // Nếu bản ghi từ API có mang metadata đa tầng thì đối chiếu thêm qua bộ lọc defense-in-depth
          const hasIsolationMetadata =
            item.tenant_id !== undefined ||
            item.target_role !== undefined ||
            item.user_id !== undefined;
          if (!hasIsolationMetadata) {
            return true;
          }
          return isPayloadAuthorizedForSession(
            {
              type: item.type,
              title: item.title,
              message: item.message,
              tenantId: item.tenant_id ?? null,
              branchId: item.branch_id ?? null,
              targetRole: item.target_role ?? null,
              userId: item.user_id ?? null,
            },
            {
              enabled,
              tenantId: explicitTenantId,
              branchId: explicitBranchId,
              role: explicitRole,
              userId: explicitUserId,
            }
          );
        })
        .map((item: NotificationRecord) => {
          const validOrderId =
            item.order_id !== null &&
            item.order_id !== undefined &&
            String(item.order_id) !== '0'
              ? item.order_id
              : undefined;

          return {
            id: item.id,
            type: item.type,
            title: item.title,
            message: item.message,
            orderId: validOrderId,
            orderCode: item.repair_order?.order_code ?? (item as any).order_code,
            severity: (item.severity as NotificationItem['severity']) || 'info',
            timestamp: item.created_at || new Date().toISOString(),
            actionUrl: resolveNotificationActionUrl({
              actionUrl: item.action_url ?? (item as any).actionUrl,
              type: item.type,
              orderId: validOrderId,
              role: explicitRole,
              targetRole: item.target_role,
            }),
            isRead: Boolean(item.is_read),
            readAt: item.read_at ?? null,
          };
        });

      setBoundSessionKey(requestSessionKey);
      setNotifications(mapped);
    } catch {
      // Nếu đã đổi phiên thì đảm bảo không bao giờ giữ lại danh sách của phiên cũ
      if (
        requestGeneration !== sessionGenerationRef.current ||
        activeSessionKeyRef.current !== requestSessionKey
      ) {
        return;
      }
      setBoundSessionKey(requestSessionKey);
    } finally {
      if (requestGeneration === sessionGenerationRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    enabled,
    explicitTenantId,
    explicitUserId,
    explicitRole,
    explicitBranchId,
    sessionKey,
  ]);

  // Callback nhận sự kiện hợp lệ từ Socket / Event Bus
  const handleIncomingOperationalEvent = useCallback(
    (payload: OperationalNotificationPayload, eventName: string) => {
      if (!enabled) {
        return;
      }

      // 1. Kiểm tra lại Whitelist nghiêm ngặt
      if (!isOperationalEventWhitelisted(eventName, payload)) {
        return;
      }

      // 2. Bộ lọc Defense-in-Depth: Chặn tuyệt đối sự kiện lệch tenantId, branchId, userId, targetRole hoặc lộ giá VNĐ cho KTV
      if (
        !isPayloadAuthorizedForSession(payload, {
          enabled,
          tenantId: explicitTenantId,
          branchId: explicitBranchId,
          role: explicitRole,
          userId: explicitUserId,
        })
      ) {
        return;
      }

      // 3. Chống xử lý trùng lặp theo ID trong phạm vi phiên hiện tại
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

      const isPlatformUser = normalizeNotificationRole(explicitRole) === 'super_admin';
      const validOrderId =
        payload.orderId !== undefined &&
        payload.orderId !== null &&
        String(payload.orderId) !== '0'
          ? payload.orderId
          : undefined;

      // 4. Chuẩn hóa payload thành NotificationItem
      const newItem: NotificationItem = {
        id: eventId,
        type: payload.type || (isPlatformUser ? 'tenant_registered' : 'order_status'),
        title:
          payload.title ||
          (isPlatformUser ? 'Thông báo Nền tảng' : 'Thông báo vận hành'),
        message: payload.message || '',
        orderId: validOrderId,
        orderCode:
          payload.orderCode || (validOrderId !== undefined ? String(validOrderId) : undefined),
        severity: payload.severity || 'info',
        timestamp: payload.timestamp || new Date().toISOString(),
        actionUrl: resolveNotificationActionUrl({
          actionUrl: payload.actionUrl,
          type: payload.type,
          orderId: validOrderId,
          role: explicitRole,
          targetRole: payload.targetRole,
        }),
        isRead: false,
        readAt: null,
      };

      const targetSessionKey = sessionKey;
      const targetGeneration = sessionGenerationRef.current;

      // 5. Prepend thông báo vào danh sách của đúng phiên hiện tại (chống trùng lặp theo ID)
      setBoundSessionKey(targetSessionKey);
      setNotifications((prev) => {
        if (activeSessionKeyRef.current !== targetSessionKey) {
          return [];
        }
        if (prev.some((item) => String(item.id) === String(newItem.id))) {
          return prev;
        }
        return [newItem, ...prev];
      });

      // 6. Kích hoạt tiếng "ting ting" chuông pha lê ngay lập tức
      playChime();

      // 7. Tự động reload lại danh sách từ database sau 400ms để đồng bộ 100%
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = setTimeout(() => {
        refreshTimeoutRef.current = null;
        if (
          targetGeneration === sessionGenerationRef.current &&
          activeSessionKeyRef.current === targetSessionKey
        ) {
          void refreshNotifications();
        }
      }, 400);
    },
    [
      enabled,
      explicitTenantId,
      explicitBranchId,
      explicitRole,
      explicitUserId,
      sessionKey,
      playChime,
      refreshNotifications,
    ]
  );

  // Kết nối socket & event bus
  const { isConnected, activeChannels, dispatchEvent } = useSocketNotifications({
    tenantId: explicitTenantId,
    branchId: explicitBranchId,
    role: explicitRole,
    userId: explicitUserId,
    onOperationalEvent: handleIncomingOperationalEvent,
    enabled,
  });

  useEffect(() => {
    if (!enabled) return;

    void refreshNotifications();

    // Chỉ bật chu kỳ polling 15 giây khi WebSocket chưa kết nối (!isConnected)
    let interval: ReturnType<typeof setInterval> | null = null;
    if (!isConnected) {
      interval = setInterval(() => {
        void refreshNotifications();
      }, 15000);
    }

    // Tự động tải lại khi người dùng quay lại tab trình duyệt
    const handleFocus = () => {
      void refreshNotifications();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
      }
    };
  }, [enabled, isConnected, refreshNotifications]);

  // Đánh dấu đã đọc một thông báo (Optimistic update + Sync REST API per-user)
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

  // Đánh dấu đã đọc tất cả (Optimistic update + Sync REST API per-user)
  const markAllAsRead = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const requestGeneration = sessionGenerationRef.current;

    // 1. Optimistic update toàn bộ danh sách của phiên hiện tại
    setNotifications((prev) =>
      prev.map((item) => ({ ...item, isRead: true, readAt: item.readAt || nowIso }))
    );

    // 2. Gọi API đồng bộ với backend (không truyền user_id từ client)
    try {
      const normalizedRole = normalizeNotificationRole(explicitRole);
      const params =
        normalizedRole === 'admin' &&
        explicitBranchId &&
        explicitBranchId !== 'all'
          ? { branch_id: explicitBranchId }
          : undefined;

      await notificationService.markAllAsRead(params);
      if (requestGeneration === sessionGenerationRef.current) {
        await refreshNotifications();
      }
    } catch (err) {
      if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SOCKET_DEBUG === 'true') {
        console.debug('[NotificationProvider] Lỗi đồng bộ đánh dấu đọc tất cả tới server:', err);
      }
    }
  }, [explicitRole, explicitBranchId, refreshNotifications]);

  // Điều hướng khi click thông báo (ưu tiên actionUrl hợp lệ từ Backend cho Super Admin, SaaS & Cửa hàng)
  const handleNotificationClick = useCallback(
    (item: NotificationItem, router?: { push: (url: string) => void }) => {
      if (!item.isRead) {
        void markAsRead(item.id);
      }

      const destination = resolveNotificationActionUrl({
        actionUrl: item.actionUrl,
        type: item.type,
        orderId: item.orderId,
        role: explicitRole,
      });

      if (router && typeof router.push === 'function') {
        router.push(destination);
      } else if (typeof window !== 'undefined') {
        window.location.href = destination;
      }
    },
    [markAsRead, explicitRole]
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
        notifications: isolatedNotifications,
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
