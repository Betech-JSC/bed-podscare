import assert from 'node:assert';
import test from 'node:test';

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
  realtimeEventBus,
} = await import('../app/utils/socketNotifications.ts');

test('E2E Operational Flow: CSKH tạo đơn -> KTV nhận việc -> QC kiểm định -> Cảnh báo SLA', async () => {
  // Clear audio tracking logs
  audioOscillatorCalls = [];
  audioGainCalls = [];

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

    // 2. Normalize to NotificationItem
    const newItem = {
      id: String(payload.id),
      type: payload.type || 'order_status',
      title: payload.title,
      message: payload.message,
      orderId: payload.orderId,
      orderCode: payload.orderCode,
      severity: payload.severity || 'info',
      timestamp: payload.timestamp || new Date().toISOString(),
      actionUrl: payload.actionUrl || `/repairs?id=${payload.orderId}`,
      isRead: false,
      readAt: null,
    };

    // 3. Prepend into list (with deduplication)
    if (!notifications.some((n) => n.id === newItem.id)) {
      notifications = [newItem, ...notifications];
    }

    // 4. Trigger audio chime
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
  };

  const step2Handled = handleIncomingOperationalEvent('order.in_progress', step2Payload, simulatedClock);
  assert.strictEqual(step2Handled, true, 'Bước 2: Sự kiện KTV nhận việc phải được xử lý');
  assert.strictEqual(notifications.length, 2, 'Danh sách phải có 2 thông báo');
  // Thứ tự prepend: KTV phải ở vị trí 0 (trên cùng), CSKH ở vị trí 1
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
  };

  const step3Handled = handleIncomingOperationalEvent('qc.action', step3Payload, simulatedClock);
  assert.strictEqual(step3Handled, true, 'Bước 3: Sự kiện QC kiểm định phải được xử lý');
  assert.strictEqual(notifications.length, 3, 'Danh sách phải có 3 thông báo');
  // Thứ tự prepend: QC ở index 0, KTV ở index 1, CSKH ở index 2
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
  };

  const step4Handled = handleIncomingOperationalEvent('sla.warning', step4Payload, simulatedClock);
  assert.strictEqual(step4Handled, true, 'Bước 4: Sự kiện SLA warning phải được xử lý');
  assert.strictEqual(notifications.length, 4, 'Danh sách phải có 4 thông báo');

  // =========================================================================
  // KIỂM TRA THỨ TỰ CẬP NHẬT CHÍNH XÁC (STRICT ORDER VERIFICATION)
  // Vị trí 0: Bước 4 (Cảnh báo SLA nguy cấp - mới nhất)
  // Vị trí 1: Bước 3 (QC kiểm định)
  // Vị trí 2: Bước 2 (KTV nhận việc)
  // Vị trí 3: Bước 1 (CSKH tạo đơn ban đầu)
  // =========================================================================
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
  // Đọc 1 thông báo SLA nguy cấp
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

  // Đọc tất cả thông báo
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
    if (item.actionUrl) {
      router.push(item.actionUrl);
    } else if (item.orderId) {
      router.push(`/repairs?id=${item.orderId}`);
    }
  };

  const qcItem = notifications.find((n) => n.id === 'evt-qc-03');
  handleNotificationClick(qcItem, mockRouter);
  assert.strictEqual(pushedUrls[0], '/qc', 'Click vào QC notification chuyển hướng đến /qc');

  const repairItem = notifications.find((n) => n.id === 'evt-cskh-01');
  handleNotificationClick(repairItem, mockRouter);
  assert.strictEqual(pushedUrls[1], '/repairs?id=PC26-88001', 'Click vào đơn hàng chuyển hướng đến /repairs?id=PC26-88001');
});
