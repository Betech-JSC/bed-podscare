import assert from 'node:assert';
import test from 'node:test';
import {
  isOperationalEventWhitelisted,
  realtimeEventBus,
  computeTargetChannels,
  ALLOWED_EVENT_PREFIXES,
  ALLOWED_NOTIFICATION_TYPES,
  getReverbEchoConfig,
} from '../app/utils/socketNotifications.ts';

test('Task 4.1: Whitelist strictly accepts operational events', () => {
  // 1. Order events
  assert.strictEqual(isOperationalEventWhitelisted('order.created'), true);
  assert.strictEqual(isOperationalEventWhitelisted('order.qc_pending'), true);
  assert.strictEqual(isOperationalEventWhitelisted('order.ready_delivery'), true);
  assert.strictEqual(isOperationalEventWhitelisted('order.operational'), true);

  // 2. SLA events
  assert.strictEqual(isOperationalEventWhitelisted('sla.warning'), true);
  assert.strictEqual(isOperationalEventWhitelisted('sla.breached'), true);

  // 3. QC events
  assert.strictEqual(isOperationalEventWhitelisted('qc.action'), true);
  assert.strictEqual(isOperationalEventWhitelisted('qc.pending'), true);
  assert.strictEqual(isOperationalEventWhitelisted('qc.rejected'), true);

  // 4. Quote events
  assert.strictEqual(isOperationalEventWhitelisted('quote.created'), true);
  assert.strictEqual(isOperationalEventWhitelisted('quote.approved'), true);

  // 5. Types check
  assert.strictEqual(
    isOperationalEventWhitelisted(undefined, { type: 'order_status' }),
    true
  );
  assert.strictEqual(
    isOperationalEventWhitelisted(undefined, { type: 'sla_warning' }),
    true
  );
  assert.strictEqual(
    isOperationalEventWhitelisted(undefined, { type: 'qc_action' }),
    true
  );
  assert.strictEqual(
    isOperationalEventWhitelisted(undefined, { type: 'quote_action' }),
    true
  );
  assert.ok(ALLOWED_EVENT_PREFIXES.includes('order.'));
  assert.ok(ALLOWED_EVENT_PREFIXES.includes('sla.'));
  assert.ok(ALLOWED_EVENT_PREFIXES.includes('qc.'));
  assert.ok(ALLOWED_EVENT_PREFIXES.includes('quote.'));
});

test('Task 4.1: Whitelist strictly rejects irrelevant external events', () => {
  // Marketing & Promotions
  assert.strictEqual(isOperationalEventWhitelisted('marketing.promo'), false);
  assert.strictEqual(isOperationalEventWhitelisted('promo.sale'), false);
  assert.strictEqual(isOperationalEventWhitelisted('voucher.discount'), false);

  // General news and chat
  assert.strictEqual(isOperationalEventWhitelisted('news.announcement'), false);
  assert.strictEqual(isOperationalEventWhitelisted('chat.message'), false);
  assert.strictEqual(isOperationalEventWhitelisted('system.maintenance'), false);

  // Invalid payload types
  assert.strictEqual(
    isOperationalEventWhitelisted(undefined, { type: 'advertisement' }),
    false
  );
  assert.strictEqual(
    isOperationalEventWhitelisted(undefined, { type: 'social_post' }),
    false
  );
});

test('Task 4.1 & 4.2: Realtime Event Bus dispatches whitelisted events and drops invalid events', () => {
  const received = [];

  const unsubscribe = realtimeEventBus.subscribe((evt) => {
    received.push(evt);
  });

  // 1. Dispatch valid operational event
  const validPayload = {
    id: 'test-1',
    orderId: 'PC26-00999',
    orderCode: 'PC26-00999',
    title: 'Đơn mới tiếp nhận',
    message: 'AirPods Pro 2 cần kiểm tra',
    severity: 'info',
    timestamp: new Date().toISOString(),
    actionUrl: '/repairs?id=PC26-00999',
    type: 'order_status',
  };

  const dispatchResultValid = realtimeEventBus.emit('order.created', validPayload);
  assert.strictEqual(dispatchResultValid, true);
  assert.strictEqual(received.length, 1);
  assert.strictEqual(received[0].payload.id, 'test-1');
  assert.strictEqual(received[0].payload.orderCode, 'PC26-00999');

  // 2. Dispatch invalid external event
  const invalidPayload = {
    id: 'spam-1',
    title: 'Khuyến mãi 50%',
    message: 'Giảm giá cuối tuần',
    type: 'marketing',
  };

  const dispatchResultInvalid = realtimeEventBus.emit('marketing.promo', invalidPayload);
  assert.strictEqual(dispatchResultInvalid, false);
  assert.strictEqual(received.length, 1); // No new event received

  unsubscribe();
});

test('Task 4.1: computeTargetChannels correctly constructs private channels', () => {
  // Case 1: Default/no branch
  assert.deepStrictEqual(computeTargetChannels(), ['orders.all']);

  // Case 2: Branch 1, no role
  assert.deepStrictEqual(computeTargetChannels(1), [
    'orders.all',
    'branch.1.orders',
  ]);

  // Case 3: Branch 1, technician role
  assert.deepStrictEqual(computeTargetChannels(1, 'technician'), [
    'orders.all',
    'branch.1.orders',
    'branch.1.technician',
    'role.technician',
  ]);

  // Case 4: Branch 2, cskh role, user 10
  assert.deepStrictEqual(computeTargetChannels(2, 'cskh', 10), [
    'orders.all',
    'branch.2.orders',
    'branch.2.cskh',
    'role.cskh',
    'user.10',
  ]);

  // Case 5: Branch 'all' (all branches view)
  assert.deepStrictEqual(computeTargetChannels('all', 'admin', 1), [
    'orders.all',
    'role.admin',
    'user.1',
  ]);
});

test('Task 4.2 & 4.3: Operational notification state lifecycle (prepend, unread count, mark as read)', () => {
  // Mock notification list state
  let notifications = [
    { id: '1', title: 'Đơn cũ 1', isRead: true, orderCode: 'PC26-00001' },
    { id: '2', title: 'Đơn cũ 2', isRead: false, orderCode: 'PC26-00002' },
  ];

  // Helper function mimicking NotificationProvider state updates
  const handleIncomingEvent = (item) => {
    const newItem = { ...item, isRead: false };
    // Prepend and deduplicate
    if (!notifications.some((n) => String(n.id) === String(newItem.id))) {
      notifications = [newItem, ...notifications];
    }
  };

  const markAsRead = (id) => {
    notifications = notifications.map((n) =>
      String(n.id) === String(id) ? { ...n, isRead: true } : n
    );
  };

  const markAllAsRead = () => {
    notifications = notifications.map((n) => ({ ...n, isRead: true }));
  };

  // 1. Initial unread count
  assert.strictEqual(notifications.filter((n) => !n.isRead).length, 1);

  // 2. Prepend new incoming notification
  handleIncomingEvent({ id: '3', title: 'Đơn SLA nguy cấp', orderCode: 'PC26-00003' });
  assert.strictEqual(notifications.length, 3);
  assert.strictEqual(notifications[0].id, '3');
  assert.strictEqual(notifications[0].orderCode, 'PC26-00003');
  assert.strictEqual(notifications.filter((n) => !n.isRead).length, 2);

  // 3. Deduplication check: re-dispatching same ID should NOT duplicate
  handleIncomingEvent({ id: '3', title: 'Đơn SLA nguy cấp', orderCode: 'PC26-00003' });
  assert.strictEqual(notifications.length, 3);

  // 4. Mark item 3 as read (optimistic update)
  markAsRead('3');
  assert.strictEqual(notifications.find((n) => n.id === '3')?.isRead, true);
  assert.strictEqual(notifications.filter((n) => !n.isRead).length, 1);

  // 5. Mark all as read
  markAllAsRead();
  assert.strictEqual(notifications.filter((n) => !n.isRead).length, 0);
  assert.strictEqual(notifications.every((n) => n.isRead), true);
});

test('Task 1 & 2: order_created is in ALLOWED_NOTIFICATION_TYPES whitelist and dispatches via RealtimeEventBus', () => {
  // 1. Whitelist verification
  assert.ok(ALLOWED_NOTIFICATION_TYPES.includes('order_created'), 'order_created must be in whitelist');
  assert.strictEqual(
    isOperationalEventWhitelisted('order.created', { type: 'order_created' }),
    true
  );
  assert.strictEqual(
    isOperationalEventWhitelisted(undefined, { type: 'order_created' }),
    true
  );

  // 2. RealtimeEventBus dispatch verification
  let captured = null;
  const unsubscribe = realtimeEventBus.subscribe(({ eventName, payload }) => {
    if (payload.type === 'order_created') {
      captured = { eventName, payload };
    }
  });

  const payload = {
    id: 'notif-PC26-12345-test',
    type: 'order_created',
    title: 'Tiếp nhận đơn mới',
    message: 'Đơn PC26-12345 (Nguyễn Văn B) đã được tiếp nhận thành công.',
    orderCode: 'PC26-12345',
    orderId: 'PC26-12345',
    severity: 'info',
    timestamp: new Date().toISOString(),
  };

  const emitted = realtimeEventBus.emit('order.created', payload);
  assert.strictEqual(emitted, true);
  assert.ok(captured);
  assert.strictEqual(captured.payload.orderCode, 'PC26-12345');
  assert.strictEqual(captured.payload.title, 'Tiếp nhận đơn mới');
  assert.strictEqual(captured.payload.type, 'order_created');

  unsubscribe();
});

test('Task 2: getReverbEchoConfig provides flexible connection defaults and parses env variables', () => {
  // Default fallback check
  const defaultConfig = getReverbEchoConfig();
  assert.strictEqual(defaultConfig.broadcaster, 'reverb');
  assert.ok(defaultConfig.wsHost);
  assert.ok(defaultConfig.wsPort > 0);
  assert.ok(defaultConfig.key);
  assert.ok(defaultConfig.authEndpoint);

  // Test custom env overrides
  const originalHost = process.env.NEXT_PUBLIC_REVERB_HOST;
  const originalPort = process.env.NEXT_PUBLIC_REVERB_PORT;
  const originalScheme = process.env.NEXT_PUBLIC_REVERB_SCHEME;

  process.env.NEXT_PUBLIC_REVERB_HOST = 'api.podscare.vn';
  process.env.NEXT_PUBLIC_REVERB_PORT = '443';
  process.env.NEXT_PUBLIC_REVERB_SCHEME = 'https';

  const customConfig = getReverbEchoConfig();
  assert.strictEqual(customConfig.wsHost, 'api.podscare.vn');
  assert.strictEqual(customConfig.wsPort, 443);
  assert.strictEqual(customConfig.wssPort, 443);
  assert.strictEqual(customConfig.scheme, 'https');
  assert.strictEqual(customConfig.forceTLS, true);
  assert.deepStrictEqual(customConfig.enabledTransports, ['wss']);

  // Restore env
  if (originalHost !== undefined) process.env.NEXT_PUBLIC_REVERB_HOST = originalHost;
  else delete process.env.NEXT_PUBLIC_REVERB_HOST;
  if (originalPort !== undefined) process.env.NEXT_PUBLIC_REVERB_PORT = originalPort;
  else delete process.env.NEXT_PUBLIC_REVERB_PORT;
  if (originalScheme !== undefined) process.env.NEXT_PUBLIC_REVERB_SCHEME = originalScheme;
  else delete process.env.NEXT_PUBLIC_REVERB_SCHEME;
});

