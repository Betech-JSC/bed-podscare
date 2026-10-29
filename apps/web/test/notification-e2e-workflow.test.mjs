import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(__dirname, '../../..');

// 1. Setup Mock Web Audio API before importing audio module
let audioOscillatorCalls = [];
let audioGainCalls = [];
let audioContextResumeCalls = 0;

class MockAudioParam {
  constructor(defaultValue = 0) {
    this.value = defaultValue;
    this.calls = [];
  }
  setValueAtTime(val, time) {
    this.calls.push({ method: 'setValueAtTime', val, time });
    this.value = val;
  }
  exponentialRampToValueAtTime(val, time) {
    this.calls.push({ method: 'exponentialRampToValueAtTime', val, time });
    this.value = val;
  }
}

class MockGainNode {
  constructor() {
    this.gain = new MockAudioParam(1);
    this.connectedTo = null;
  }
  connect(dest) {
    this.connectedTo = dest;
    audioGainCalls.push({ type: 'connect', dest });
  }
}

class MockOscillatorNode {
  constructor() {
    this.type = 'sine';
    this.frequency = new MockAudioParam(440);
    this.connectedTo = null;
    this.startedAt = null;
    this.stoppedAt = null;
  }
  connect(dest) {
    this.connectedTo = dest;
    audioOscillatorCalls.push({ type: 'connect', dest });
  }
  start(time) {
    this.startedAt = time;
    audioOscillatorCalls.push({ type: 'start', time });
  }
  stop(time) {
    this.stoppedAt = time;
    audioOscillatorCalls.push({ type: 'stop', time });
  }
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 100.0;
    this.destination = { id: 'speakers' };
  }
  resume() {
    audioContextResumeCalls++;
    this.state = 'running';
    return Promise.resolve();
  }
  createOscillator() {
    const osc = new MockOscillatorNode();
    audioOscillatorCalls.push({ type: 'createOscillator', instance: osc });
    return osc;
  }
  createGain() {
    const gain = new MockGainNode();
    audioGainCalls.push({ type: 'createGain', instance: gain });
    return gain;
  }
}

// Attach mock window and AudioContext
globalThis.window = {
  AudioContext: MockAudioContext,
  addEventListener: () => {},
  removeEventListener: () => {},
};

// Import modules under test
const { playChimeTone } = await import('../app/utils/audioChime.ts');
const {
  isOperationalEventWhitelisted,
  isPayloadAuthorizedForSession,
  buildNotificationSessionKey,
  resolveNotificationActionUrl,
  computeTargetChannels,
} = await import('../app/utils/socketNotifications.ts');

test('E2E Operational Flow: CSKH tạo đơn -> KTV nhận việc -> QC kiểm định -> Cảnh báo SLA', async () => {
  // Clear audio tracking logs
  audioOscillatorCalls = [];
  audioGainCalls = [];

  // Active Store Session (Tenant 10, Branch 1, Store Owner viewing Branch 1)
  const storeSession = {
    enabled: true,
    tenantId: 10,
    branchId: 1,
    role: 'admin',
    userId: 100,
  };

  // State mimicking NotificationProvider
  let notifications = [];
  let chimePlayCount = 0;
  let isMuted = false;
  let lastChimeTime = 0;
  const CHIME_THROTTLE_MS = 800;

  const playChime = (overrideTime = Date.now()) => {
    if (isMuted) return false;
    if (overrideTime - lastChimeTime < CHIME_THROTTLE_MS) {
      return false; // Throttled
    }
    lastChimeTime = overrideTime;
    chimePlayCount++;
    playChimeTone();
    return true;
  };

  const handleIncomingOperationalEvent = (eventName, payload, timestamp = Date.now()) => {
    // 1. Whitelist validation
    if (!isOperationalEventWhitelisted(eventName, payload)) {
      return false;
    }

    // 2. Multi-tenant & RBAC defense-in-depth validation
    if (!isPayloadAuthorizedForSession(payload, storeSession)) {
      return false;
    }

    // 3. Normalize to NotificationItem
    const newItem = {
      id: String(payload.id),
      type: payload.type || 'order_status',
      title: payload.title,
      message: payload.message,
      orderId: payload.orderId,
      orderCode: payload.orderCode,
      severity: payload.severity || 'info',
      timestamp: payload.timestamp || new Date().toISOString(),
      actionUrl: resolveNotificationActionUrl({
        actionUrl: payload.actionUrl,
        type: payload.type,
        orderId: payload.orderId,
        role: storeSession.role,
        targetRole: payload.targetRole,
      }),
      isRead: false,
      readAt: null,
    };

    // 4. Prepend into list (with deduplication)
    if (!notifications.some((n) => n.id === newItem.id)) {
      notifications = [newItem, ...notifications];
    }

    // 5. Trigger audio chime
    playChime(timestamp);
    return true;
  };

  let simulatedClock = 1000000;

  // =========================================================================
  // BƯỚC 1: CSKH Tạo đơn tiếp nhận mới (AirPods Pro 2 - PC26-88001)
  // =========================================================================
  const step1Payload = {
    id: 'evt-cskh-01',
    orderId: 'PC26-88001',
    orderCode: 'PC26-88001',
    title: 'CSKH: Tiếp nhận đơn mới',
    message: 'Khách hàng Nguyễn Văn A gửi sửa AirPods Pro 2 rè loa phải.',
    severity: 'info',
    timestamp: new Date(simulatedClock).toISOString(),
    actionUrl: '/repairs?id=PC26-88001',
    type: 'order_status',
    tenantId: 10,
    branchId: 1,
  };

  const step1Handled = handleIncomingOperationalEvent('order.created', step1Payload, simulatedClock);
  assert.strictEqual(step1Handled, true, 'Bước 1: Sự kiện CSKH tạo đơn phải được xử lý');
  assert.strictEqual(notifications.length, 1, 'Danh sách phải có 1 thông báo');
  assert.strictEqual(notifications[0].orderCode, 'PC26-88001');
  assert.strictEqual(notifications[0].title, 'CSKH: Tiếp nhận đơn mới');
  assert.strictEqual(notifications[0].isRead, false);
  assert.strictEqual(chimePlayCount, 1, 'Âm thanh "ting" chuông pha lê phải vang lên ở Bước 1');

  // Kiểm tra thông số sóng âm Web Audio: Dual Sine 659.25Hz -> 880Hz, decay 0.35s
  const osc1 = audioOscillatorCalls.find((c) => c.type === 'createOscillator')?.instance;
  assert.ok(osc1, 'Oscillator phải được tạo thành công');
  assert.strictEqual(osc1.type, 'sine', 'Dạng sóng phải là Sine wave êm ái');
  const freqCalls1 = osc1.frequency.calls;
  assert.strictEqual(freqCalls1[0].val, 659.25, 'Tần số gốc phải là 659.25Hz (E5)');
  assert.strictEqual(freqCalls1[1].val, 880.0, 'Tần số chuyển tiếp phải là 880Hz (A5)');

  // =========================================================================
  // BƯỚC 2: Kỹ thuật viên (KTV) Nhận việc sửa chữa
  // =========================================================================
  simulatedClock += 1000; // Cách 1000ms (> throttle 800ms)
  const step2Payload = {
    id: 'evt-ktv-02',
    orderId: 'PC26-88001',
    orderCode: 'PC26-88001',
    title: 'KTV: Bắt đầu xử lý đơn',
    message: 'Kỹ thuật viên Trần B đã nhận đơn và bắt đầu thay màng loa.',
    severity: 'info',
    timestamp: new Date(simulatedClock).toISOString(),
    actionUrl: '/repairs?id=PC26-88001',
    type: 'order_status',
    tenantId: 10,
    branchId: 1,
  };

  const step2Handled = handleIncomingOperationalEvent('order.in_progress', step2Payload, simulatedClock);
  assert.strictEqual(step2Handled, true, 'Bước 2: Sự kiện KTV nhận việc phải được xử lý');
  assert.strictEqual(notifications.length, 2, 'Danh sách phải có 2 thông báo');
  assert.strictEqual(notifications[0].id, 'evt-ktv-02');
  assert.strictEqual(notifications[0].title, 'KTV: Bắt đầu xử lý đơn');
  assert.strictEqual(notifications[1].id, 'evt-cskh-01');
  assert.strictEqual(chimePlayCount, 2, 'Âm thanh "ting" phải phát lần 2 cho KTV nhận việc');

  // =========================================================================
  // BƯỚC 3: Chuyển sang khâu Kiểm định chất lượng (QC Action / QC Pending)
  // =========================================================================
  simulatedClock += 1200; // Cách 1200ms
  const step3Payload = {
    id: 'evt-qc-03',
    orderId: 'PC26-88001',
    orderCode: 'PC26-88001',
    title: 'QC: Yêu cầu kiểm định âm thanh',
    message: 'Đã hoàn tất sửa chữa, đơn chuyển sang kiểm định đáp tuyến âm thanh và ANC.',
    severity: 'info',
    timestamp: new Date(simulatedClock).toISOString(),
    actionUrl: '/qc',
    type: 'qc_action',
    tenantId: 10,
    branchId: 1,
  };

  const step3Handled = handleIncomingOperationalEvent('qc.action', step3Payload, simulatedClock);
  assert.strictEqual(step3Handled, true, 'Bước 3: Sự kiện QC kiểm định phải được xử lý');
  assert.strictEqual(notifications.length, 3, 'Danh sách phải có 3 thông báo');
  assert.strictEqual(notifications[0].id, 'evt-qc-03');
  assert.strictEqual(notifications[0].type, 'qc_action');
  assert.strictEqual(notifications[1].id, 'evt-ktv-02');
  assert.strictEqual(notifications[2].id, 'evt-cskh-01');
  assert.strictEqual(chimePlayCount, 3, 'Âm thanh "ting" phải phát lần 3 cho QC kiểm định');

  // =========================================================================
  // BƯỚC 4: Cảnh báo SLA (SLA Warning nguy cấp)
  // =========================================================================
  simulatedClock += 1500; // Cách 1500ms
  const step4Payload = {
    id: 'evt-sla-04',
    orderId: 'PC26-88001',
    orderCode: 'PC26-88001',
    title: 'CẢNH BÁO SLA: Sắp quá hạn kiểm định',
    message: 'Đơn hàng PC26-88001 đã ở trạng thái chờ QC quá 60 phút, cần xử lý ngay!',
    severity: 'danger',
    timestamp: new Date(simulatedClock).toISOString(),
    actionUrl: '/repairs?id=PC26-88001',
    type: 'sla_warning',
    tenantId: 10,
    branchId: 1,
  };

  const step4Handled = handleIncomingOperationalEvent('sla.warning', step4Payload, simulatedClock);
  assert.strictEqual(step4Handled, true, 'Bước 4: Sự kiện SLA warning phải được xử lý');
  assert.strictEqual(notifications.length, 4, 'Danh sách phải có 4 thông báo');

  assert.deepStrictEqual(
    notifications.map((n) => ({ id: n.id, severity: n.severity, type: n.type })),
    [
      { id: 'evt-sla-04', severity: 'danger', type: 'sla_warning' },
      { id: 'evt-qc-03', severity: 'info', type: 'qc_action' },
      { id: 'evt-ktv-02', severity: 'info', type: 'order_status' },
      { id: 'evt-cskh-01', severity: 'info', type: 'order_status' },
    ],
    'Thứ tự danh sách thông báo phải đảo ngược theo thời gian (mới nhất trên cùng)'
  );

  assert.strictEqual(chimePlayCount, 4, 'Tổng số lần phát âm thanh chuông "ting" phải chính xác là 4');
  assert.strictEqual(
    notifications.filter((n) => !n.isRead).length,
    4,
    'Tất cả 4 thông báo mới nhận đều ở trạng thái chưa đọc'
  );

  // =========================================================================
  // KIỂM TRA CƠ CHẾ THROTTLE & CHỐNG SPAM ÂM THANH (800MS THROTTLE)
  // =========================================================================
  const spamTime = simulatedClock + 200; // Chỉ cách 200ms (< 800ms)
  const burstPayload = {
    id: 'evt-sla-burst',
    orderId: 'PC26-88002',
    orderCode: 'PC26-88002',
    title: 'Cảnh báo phụ',
    message: 'Sự kiện dồn dập',
    severity: 'danger',
    type: 'sla_warning',
    tenantId: 10,
    branchId: 1,
  };
  handleIncomingOperationalEvent('sla.warning', burstPayload, spamTime);
  assert.strictEqual(notifications.length, 5, 'Thông báo vẫn được thêm vào danh sách');
  assert.strictEqual(chimePlayCount, 4, 'Âm thanh phải bị throttle chặn lại (vẫn giữ 4 lần)');

  // =========================================================================
  // KIỂM TRA TÙY CHỌN MUTE / UNMUTE ÂM THANH
  // =========================================================================
  isMuted = true;
  simulatedClock += 2000;
  const mutedPayload = {
    id: 'evt-cskh-muted',
    orderId: 'PC26-88003',
    orderCode: 'PC26-88003',
    title: 'Đơn mới khi Mute',
    message: 'Khi tắt chuông',
    severity: 'info',
    type: 'order_status',
    tenantId: 10,
    branchId: 1,
  };
  handleIncomingOperationalEvent('order.created', mutedPayload, simulatedClock);
  assert.strictEqual(notifications.length, 6);
  assert.strictEqual(chimePlayCount, 4, 'Khi isMuted = true, âm thanh tuyệt đối không phát');

  // Bật chuông lại (Unmute)
  isMuted = false;
  simulatedClock += 1000;
  const unmutedPayload = {
    id: 'evt-cskh-unmuted',
    orderId: 'PC26-88004',
    orderCode: 'PC26-88004',
    title: 'Đơn mới khi Unmute',
    message: 'Chuông hoạt động trở lại',
    severity: 'info',
    type: 'order_status',
    tenantId: 10,
    branchId: 1,
  };
  handleIncomingOperationalEvent('order.created', unmutedPayload, simulatedClock);
  assert.strictEqual(notifications.length, 7);
  assert.strictEqual(chimePlayCount, 5, 'Khi bật chuông trở lại, âm thanh phát bình thường (lần 5)');

  // =========================================================================
  // KIỂM TRA LỌC TAB (NOTIFICATION POPOVER FILTERING)
  // =========================================================================
  const slaTabItems = notifications.filter(
    (item) => item.severity === 'danger' || item.type === 'sla_warning'
  );
  assert.strictEqual(slaTabItems.length, 2, 'Tab SLA lọc đúng 2 thông báo SLA');
  assert.strictEqual(slaTabItems[0].id, 'evt-sla-burst');
  assert.strictEqual(slaTabItems[1].id, 'evt-sla-04');

  const ordersTabItems = notifications.filter(
    (item) => item.type === 'order_status' || Boolean(item.orderCode)
  );
  assert.strictEqual(ordersTabItems.length, 7, 'Tab Orders hiển thị các thông báo có mã đơn');

  // =========================================================================
  // KIỂM TRA ĐÁNH DẤU ĐÃ ĐỌC (OPTIMISTIC MARK AS READ & MARK ALL AS READ)
  // =========================================================================
  notifications = notifications.map((n) =>
    n.id === 'evt-sla-04' ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
  );
  assert.strictEqual(
    notifications.find((n) => n.id === 'evt-sla-04')?.isRead,
    true,
    'evt-sla-04 phải chuyển sang isRead: true'
  );
  assert.strictEqual(
    notifications.filter((n) => !n.isRead).length,
    6,
    'Unread count giảm từ 7 xuống 6'
  );

  notifications = notifications.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }));
  assert.strictEqual(
    notifications.filter((n) => !n.isRead).length,
    0,
    'Unread count phải về 0 sau khi Đọc tất cả'
  );
  assert.strictEqual(notifications.every((n) => n.isRead), true);

  // =========================================================================
  // KIỂM TRA ĐIỀU HƯỚNG ACTION URL KHI CLICK
  // =========================================================================
  const pushedUrls = [];
  const mockRouter = {
    push: (url) => pushedUrls.push(url),
  };

  const handleNotificationClick = (item, router) => {
    const dest = resolveNotificationActionUrl({
      actionUrl: item.actionUrl,
      type: item.type,
      orderId: item.orderId,
      role: storeSession.role,
    });
    router.push(dest);
  };

  const qcItem = notifications.find((n) => n.id === 'evt-qc-03');
  handleNotificationClick(qcItem, mockRouter);
  assert.strictEqual(pushedUrls[0], '/qc', 'Click vào QC notification chuyển hướng đến /qc');

  const repairItem = notifications.find((n) => n.id === 'evt-cskh-01');
  handleNotificationClick(repairItem, mockRouter);
  assert.strictEqual(
    pushedUrls[1],
    '/repairs?id=PC26-88001',
    'Click vào đơn hàng chuyển hướng đến /repairs?id=PC26-88001'
  );
});

test('E2E Multi-Account & Multi-Tenant Session Isolation: Tenant A (CSKH vs KTV VNĐ Masking) -> Logout -> Tenant B -> Super Admin Platform Mode', async () => {
  // Stateful harness mirroring NotificationProvider.tsx session isolation & generation guards
  function createIsolatedNotificationHarness(initialSession) {
    let session = { ...initialSession };
    let activeSessionKey = buildNotificationSessionKey(session);
    let boundSessionKey = activeSessionKey;
    let sessionGeneration = 0;
    const processedEventIds = new Set();
    let rawNotifications = [];

    const getVisibleNotifications = () => {
      const currentKey = buildNotificationSessionKey(session);
      if (!session.enabled || boundSessionKey !== currentKey) {
        return [];
      }
      return rawNotifications;
    };

    const updateSession = (nextSession) => {
      session = { ...nextSession };
      const nextKey = buildNotificationSessionKey(session);
      if (!session.enabled || nextKey !== activeSessionKey) {
        activeSessionKey = nextKey;
        sessionGeneration += 1;
        processedEventIds.clear();
        rawNotifications = [];
        boundSessionKey = nextKey;
      }
    };

    const receiveRealtimeEvent = (eventName, payload) => {
      if (!session.enabled) return false;
      if (!isOperationalEventWhitelisted(eventName, payload)) return false;
      if (!isPayloadAuthorizedForSession(payload, session)) return false;

      const eventId = String(payload.id);
      if (processedEventIds.has(eventId)) return false;
      processedEventIds.add(eventId);

      const item = {
        id: eventId,
        type: payload.type || 'order_status',
        title: payload.title,
        message: payload.message || '',
        orderId: payload.orderId,
        orderCode: payload.orderCode,
        actionUrl: resolveNotificationActionUrl({
          actionUrl: payload.actionUrl,
          type: payload.type,
          orderId: payload.orderId,
          role: session.role,
          targetRole: payload.targetRole,
        }),
        isRead: false,
      };
      boundSessionKey = activeSessionKey;
      rawNotifications = [item, ...rawNotifications];
      return true;
    };

    const refreshFromApi = async (asyncApiCall) => {
      if (!session.enabled) {
        rawNotifications = [];
        return false;
      }
      const reqGeneration = sessionGeneration;
      const reqSessionKey = activeSessionKey;
      const records = await asyncApiCall();

      // Drop stale response if user logged out or switched account while request was in flight
      if (reqGeneration !== sessionGeneration || reqSessionKey !== activeSessionKey) {
        return false;
      }

      rawNotifications = records
        .filter((rec) =>
          isPayloadAuthorizedForSession(
            {
              type: rec.type,
              title: rec.title,
              message: rec.message,
              tenantId: rec.tenant_id ?? null,
              branchId: rec.branch_id ?? null,
              targetRole: rec.target_role ?? null,
              userId: rec.user_id ?? null,
            },
            session
          )
        )
        .map((rec) => ({
          id: String(rec.id),
          type: rec.type,
          title: rec.title,
          message: rec.message,
          actionUrl: resolveNotificationActionUrl({
            actionUrl: rec.action_url,
            type: rec.type,
            orderId: rec.order_id,
            role: session.role,
            targetRole: rec.target_role,
          }),
          isRead: Boolean(rec.is_read),
        }));
      boundSessionKey = reqSessionKey;
      return true;
    };

    return {
      get sessionKey() {
        return activeSessionKey;
      },
      get activeChannels() {
        return session.enabled
          ? computeTargetChannels(session.tenantId, session.branchId, session.role, session.userId)
          : [];
      },
      get notifications() {
        return getVisibleNotifications();
      },
      get unreadCount() {
        return getVisibleNotifications().filter((n) => !n.isRead).length;
      },
      get processedIdsCount() {
        return processedEventIds.size;
      },
      updateSession,
      receiveRealtimeEvent,
      refreshFromApi,
    };
  }

  // =========================================================================
  // PHASE A: Tenant A CSKH (tenantId: 10, branchId: 1, role: 'cskh', userId: 101)
  // =========================================================================
  const harness = createIsolatedNotificationHarness({
    enabled: true,
    tenantId: 10,
    branchId: 1,
    role: 'cskh',
    userId: 101,
  });

  assert.strictEqual(harness.sessionKey, 'cskh:10:101');
  assert.deepStrictEqual(harness.activeChannels, [
    'tenant.10.branch.1.orders',
    'tenant.10.branch.1.cskh',
    'user.101',
  ]);

  // Tenant A Branch 1 order & quote with VNĐ -> accepted for CSKH
  assert.strictEqual(
    harness.receiveRealtimeEvent('order.created', {
      id: 'shared-id-1',
      type: 'order_created',
      title: 'Tiếp nhận đơn mới',
      message: 'Đơn PC26-00101 tại Gian hàng A CN1',
      orderId: 'PC26-00101',
      tenantId: 10,
      branchId: 1,
    }),
    true
  );
  assert.strictEqual(
    harness.receiveRealtimeEvent('quote.approved', {
      id: 'quote-a-1',
      type: 'quote_action',
      title: 'Khách duyệt báo giá',
      message: 'Đơn PC26-00101 đã duyệt 550.000₫',
      orderId: 'PC26-00101',
      tenantId: 10,
      branchId: 1,
      targetRole: 'cskh',
    }),
    true
  );
  assert.strictEqual(harness.notifications.length, 2);
  assert.strictEqual(harness.unreadCount, 2);

  // Cross-tenant (Tenant B = 20), Cross-branch (Branch 2), and Platform events -> BLOCKED
  assert.strictEqual(
    harness.receiveRealtimeEvent('order.created', {
      id: 'leak-tenant-b',
      type: 'order_created',
      title: 'Đơn Gian hàng B',
      tenantId: 20,
      branchId: 1,
    }),
    false
  );
  assert.strictEqual(
    harness.receiveRealtimeEvent('order.created', {
      id: 'leak-branch-2',
      type: 'order_created',
      title: 'Đơn Chi nhánh 2',
      tenantId: 10,
      branchId: 2,
    }),
    false
  );
  assert.strictEqual(
    harness.receiveRealtimeEvent('platform.tenant_registered', {
      id: 'leak-platform',
      type: 'tenant_registered',
      title: 'Gian hàng mới đăng ký',
      tenantId: null,
      targetRole: 'super_admin',
    }),
    false
  );
  assert.strictEqual(harness.notifications.length, 2);

  // Start slow in-flight API fetch for Tenant A, then LOG OUT before it resolves!
  let resolveStaleTenantAApi;
  const staleApiPromise = harness.refreshFromApi(
    () =>
      new Promise((resolve) => {
        resolveStaleTenantAApi = resolve;
      })
  );

  // User logs out (enabled: false)
  harness.updateSession({
    enabled: false,
    tenantId: null,
    branchId: null,
    role: null,
    userId: null,
  });

  // Immediate 0ms purge upon logout
  assert.strictEqual(harness.sessionKey, 'logged_out');
  assert.deepStrictEqual(harness.activeChannels, []);
  assert.deepStrictEqual(harness.notifications, []);
  assert.strictEqual(harness.unreadCount, 0);
  assert.strictEqual(harness.processedIdsCount, 0);

  // Now resolve the delayed Tenant A response -> must be dropped by sessionGeneration!
  resolveStaleTenantAApi([
    {
      id: 999,
      type: 'order_created',
      title: 'Dữ liệu trễ của phiên cũ Tenant A',
      message: 'Không được phép xuất hiện sau khi logout',
      tenant_id: 10,
      branch_id: 1,
      is_read: false,
    },
  ]);
  const staleApplied = await staleApiPromise;
  assert.strictEqual(staleApplied, false, 'Stale API response from previous session must be discarded');
  assert.deepStrictEqual(harness.notifications, []);

  // =========================================================================
  // PHASE B: Login as Tenant A Technician ('tech') -> VNĐ Financial Masking
  // =========================================================================
  harness.updateSession({
    enabled: true,
    tenantId: 10,
    branchId: 1,
    role: 'tech',
    userId: 102,
  });
  assert.strictEqual(harness.sessionKey, 'technician:10:102');
  assert.deepStrictEqual(harness.activeChannels, [
    'tenant.10.branch.1.orders',
    'tenant.10.branch.1.technician',
    'user.102',
  ]);

  // Clean technical notification with Vietnamese "đồng ý" & "đồng hồ" -> ACCEPTED
  assert.strictEqual(
    harness.receiveRealtimeEvent('order.in_repair', {
      id: 'shared-id-1', // Re-used ID proves processedEventIds was cleared cleanly across sessions
      type: 'order_status',
      title: 'Khách đồng ý phương án sửa đồng hồ',
      message: 'Đơn PC26-00101 đã sẵn sàng, KTV bắt đầu thay pin.',
      orderId: 'PC26-00101',
      tenantId: 10,
      branchId: 1,
      targetRole: 'technician',
    }),
    true
  );
  // Financial notifications (+350k / 550.000₫ / quote_action) -> BLOCKED for Technician
  assert.strictEqual(
    harness.receiveRealtimeEvent('order.additional_service', {
      id: 'tech-price-leak-1',
      type: 'additional_service_added',
      title: 'Thêm dịch vụ vệ sinh (+350k)',
      message: 'Đơn PC26-00101 phát sinh dịch vụ',
      tenantId: 10,
      branchId: 1,
    }),
    false
  );
  assert.strictEqual(
    harness.receiveRealtimeEvent('quote.approved', {
      id: 'tech-price-leak-2',
      type: 'quote_action',
      title: 'Đã duyệt báo giá',
      message: 'Đơn PC26-00101 tổng 550.000₫',
      tenantId: 10,
      branchId: 1,
    }),
    false
  );
  assert.strictEqual(harness.notifications.length, 1);
  assert.strictEqual(harness.notifications[0].title, 'Khách đồng ý phương án sửa đồng hồ');

  // =========================================================================
  // PHASE C: Direct Account Switch -> Tenant B Store Owner (tenantId: 20, role: 'admin')
  // =========================================================================
  harness.updateSession({
    enabled: true,
    tenantId: 20,
    branchId: 'all',
    role: 'admin',
    userId: 201,
  });
  assert.strictEqual(harness.sessionKey, 'admin:20:201');
  // Tenant A notifications purged immediately on account switch!
  assert.deepStrictEqual(harness.notifications, []);
  assert.strictEqual(harness.unreadCount, 0);

  // Tenant A event rejected, Tenant B SaaS fee_reminder accepted and routed to /subscription
  assert.strictEqual(
    harness.receiveRealtimeEvent('order.created', {
      id: 'from-tenant-a',
      type: 'order_created',
      title: 'Đơn của Gian hàng A',
      tenantId: 10,
      branchId: 1,
    }),
    false
  );
  assert.strictEqual(
    harness.receiveRealtimeEvent('saas.fee_reminder', {
      id: 'tenant-b-fee',
      type: 'fee_reminder',
      title: 'Nhắc gia hạn gói cước SaaS',
      message: 'Gói Standard của Gian hàng B sắp đến hạn sau 3 ngày.',
      tenantId: 20,
      targetRole: 'admin',
      userId: 201,
    }),
    true
  );
  assert.strictEqual(harness.notifications.length, 1);
  assert.strictEqual(harness.notifications[0].actionUrl, '/subscription');

  // =========================================================================
  // PHASE D: Switch to Platform Super Admin (tenantId: null, role: 'super_admin')
  // =========================================================================
  harness.updateSession({
    enabled: true,
    tenantId: null,
    branchId: 'all',
    role: 'super_admin',
    userId: 1,
  });
  assert.strictEqual(harness.sessionKey, 'super_admin:platform:1');
  assert.deepStrictEqual(harness.activeChannels, ['platform.super_admin', 'user.1']);
  assert.deepStrictEqual(harness.notifications, [], 'Tenant B state must be purged immediately');

  // Store repair event (even from Master Tenant 1) -> BLOCKED for Super Admin
  assert.strictEqual(
    harness.receiveRealtimeEvent('order.created', {
      id: 'master-store-order',
      type: 'order_created',
      title: 'Đơn sửa chữa Master Tenant',
      tenantId: 1,
      branchId: 1,
    }),
    false
  );

  // Platform lifecycle events (tenantId: null) -> ACCEPTED & routed to /platform/*
  assert.strictEqual(
    harness.receiveRealtimeEvent('platform.tenant_registered', {
      id: 'plat-reg-1',
      type: 'tenant_registered',
      title: 'Gian hàng mới đăng ký: Táo Việt Care',
      message: 'Gian hàng Táo Việt Care vừa kích hoạt dùng thử 90 ngày.',
      tenantId: null,
      targetRole: 'super_admin',
    }),
    true
  );
  assert.strictEqual(
    harness.receiveRealtimeEvent('saas.payment_received', {
      id: 'plat-pay-2',
      type: 'saas_payment_received',
      title: 'Thanh toán gói cước SaaS thành công',
      message: 'Hóa đơn FIXSUB88 vừa thanh toán qua SePay.',
      tenantId: null,
      targetRole: 'super_admin',
    }),
    true
  );

  assert.strictEqual(harness.notifications.length, 2);
  assert.strictEqual(harness.notifications[0].actionUrl, '/platform/billing');
  assert.strictEqual(harness.notifications[1].actionUrl, '/platform/stores');
});

test('E2E UI Contract Verification: NotificationPopover Platform Mode ("Thông báo Nền tảng"), AppShell/Providers wiring, and Calm Jade & Warm Ivory Design System compliance', () => {
  const providersContent = fs.readFileSync(path.join(webDir, 'app/providers.tsx'), 'utf-8');
  const notificationProviderContent = fs.readFileSync(
    path.join(webDir, 'app/providers/NotificationProvider.tsx'),
    'utf-8'
  );
  const appShellContent = fs.readFileSync(
    path.join(webDir, 'app/components/AppShell.tsx'),
    'utf-8'
  );
  const popoverContent = fs.readFileSync(
    path.join(rootDir, 'packages/ui/src/organisms/NotificationPopover.tsx'),
    'utf-8'
  );

  // 1. providers.tsx passes tenantId, role, userId, and enabled={isAuthenticated} to NotificationProvider
  assert.ok(
    providersContent.includes('<NotificationProvider') &&
      providersContent.includes('tenantId={') &&
      providersContent.includes('currentUser?.tenant_id') &&
      providersContent.includes('enabled={isAuthenticated}'),
    'providers.tsx must wire tenantId and enabled={isAuthenticated} into NotificationProvider'
  );

  // 2. NotificationProvider.tsx resets state & processedEventIdsRef immediately on logout / sessionKey change
  assert.ok(
    notificationProviderContent.includes('processedEventIdsRef.current.clear()') &&
      notificationProviderContent.includes('setNotifications([])') &&
      notificationProviderContent.includes('isPayloadAuthorizedForSession'),
    'NotificationProvider.tsx must clear processedEventIdsRef, clear notifications, and enforce isPayloadAuthorizedForSession'
  );

  // 3. AppShell.tsx passes role and platform/store mode to NotificationPopover
  assert.ok(
    appShellContent.includes('<NotificationPopover') &&
      appShellContent.includes('role={currentUser?.role}'),
    'AppShell.tsx must pass role={currentUser?.role} to NotificationPopover'
  );

  // 4. NotificationPopover.tsx renders "Thông báo Nền tảng" for super_admin, hides store-only tabs in platform mode, and adheres strictly to Calm Jade & Warm Ivory tokens without arbitrary gradients
  assert.ok(
    popoverContent.includes("'Thông báo Nền tảng'") &&
      popoverContent.includes("'Thông báo vận hành'") &&
      popoverContent.includes("'FIXO Platform Center'"),
    'NotificationPopover.tsx must support "Thông báo Nền tảng" and "FIXO Platform Center" for super_admin'
  );
  assert.ok(
    popoverContent.includes("if (isPlatformMode)") &&
      popoverContent.includes("{ key: 'all', label: 'Tất cả'") &&
      popoverContent.includes("{ key: 'unread', label: 'Chưa đọc'"),
    'NotificationPopover.tsx must restrict platform mode tabs to Tất cả and Chưa đọc (hiding SLA/Orders/Quotes)'
  );
  assert.ok(
    popoverContent.includes('#176b51') && popoverContent.includes('#f6f8f6'),
    'NotificationPopover.tsx must use Calm Jade (#176b51) and Warm Ivory (#f6f8f6) design tokens'
  );
  assert.strictEqual(
    /bg-gradient-to-|linear-gradient\(|radial-gradient\(/i.test(popoverContent),
    false,
    'NotificationPopover.tsx must NOT use prohibited arbitrary CSS gradients'
  );
});
