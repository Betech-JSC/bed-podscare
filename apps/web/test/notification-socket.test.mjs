import assert from 'node:assert';
import test from 'node:test';
import {
  isOperationalEventWhitelisted,
  isPayloadAuthorizedForSession,
  normalizeNotificationRole,
  toPrivateChannelName,
  containsVietnameseCurrency,
  buildNotificationSessionKey,
  resolveNotificationActionUrl,
  realtimeEventBus,
  computeTargetChannels,
  ALLOWED_EVENT_PREFIXES,
  ALLOWED_NOTIFICATION_TYPES,
  PLATFORM_NOTIFICATION_TYPES,
  SAAS_STORE_NOTIFICATION_TYPES,
  getReverbEchoConfig,
  ReverbSocketClient,
} from '../app/utils/socketNotifications.ts';

test('Task 4.1: Whitelist strictly accepts operational, platform, and SaaS subscription events', () => {
  // 1. Order events
  assert.strictEqual(isOperationalEventWhitelisted('order.created'), true);
  assert.strictEqual(isOperationalEventWhitelisted('order.qc_pending'), true);
  assert.strictEqual(isOperationalEventWhitelisted('order.ready_delivery'), true);
  assert.strictEqual(isOperationalEventWhitelisted('order.operational'), true);
  assert.strictEqual(isOperationalEventWhitelisted('.order.operational'), true);

  // 2. SLA, QC, Quote events
  assert.strictEqual(isOperationalEventWhitelisted('sla.warning'), true);
  assert.strictEqual(isOperationalEventWhitelisted('sla.breached'), true);
  assert.strictEqual(isOperationalEventWhitelisted('qc.action'), true);
  assert.strictEqual(isOperationalEventWhitelisted('qc.pending'), true);
  assert.strictEqual(isOperationalEventWhitelisted('qc.rejected'), true);
  assert.strictEqual(isOperationalEventWhitelisted('quote.created'), true);
  assert.strictEqual(isOperationalEventWhitelisted('quote.approved'), true);

  // 3. Platform & SaaS events
  assert.strictEqual(isOperationalEventWhitelisted('platform.tenant_registered'), true);
  assert.strictEqual(isOperationalEventWhitelisted('tenant.registered'), true);
  assert.strictEqual(isOperationalEventWhitelisted('saas.payment_received'), true);

  // 4. Payload type checks (operational + platform + SaaS)
  for (const allowedType of [
    'order_status',
    'sla_warning',
    'qc_action',
    'quote_action',
    'order_created',
    'special_part_requested',
    'additional_service_added',
    'tenant_registered',
    'tenant_approval_pending',
    'saas_payment_received',
    'platform_billing',
    'fee_reminder',
    'saas_subscription_renewed',
  ]) {
    assert.strictEqual(
      isOperationalEventWhitelisted(undefined, { type: allowedType }),
      true,
      `Payload type "${allowedType}" must be whitelisted`
    );
  }

  for (const prefix of ['order.', 'sla.', 'qc.', 'quote.', 'platform.', 'tenant.', 'saas.']) {
    assert.ok(ALLOWED_EVENT_PREFIXES.includes(prefix), `Missing allowed prefix: ${prefix}`);
  }
  assert.ok(PLATFORM_NOTIFICATION_TYPES.includes('tenant_registered'));
  assert.ok(PLATFORM_NOTIFICATION_TYPES.includes('saas_payment_received'));
  assert.ok(SAAS_STORE_NOTIFICATION_TYPES.includes('fee_reminder'));
  assert.ok(SAAS_STORE_NOTIFICATION_TYPES.includes('saas_subscription_renewed'));
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
    tenantId: 10,
    branchId: 1,
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

test('Task 4.1: computeTargetChannels isolates 3-tier private channels by tenantId, branchId, normalized role, and super_admin (fail-closed)', () => {
  // Tier 1: Platform Super Admin -> ONLY platform.super_admin + user.{id}, NEVER any tenant.* or store channel
  assert.deepStrictEqual(computeTargetChannels(null, null, 'super_admin', 1), [
    'platform.super_admin',
    'user.1',
  ]);
  assert.deepStrictEqual(computeTargetChannels(10, 2, 'super_admin', 1), [
    'platform.super_admin',
    'user.1',
  ]);
  assert.deepStrictEqual(computeTargetChannels(null, 'all', 'SUPER_ADMIN', null), [
    'platform.super_admin',
  ]);

  // Fail-Closed when tenantId is missing or invalid for non-super_admin
  assert.deepStrictEqual(computeTargetChannels(), []);
  assert.deepStrictEqual(computeTargetChannels(null, 1, 'admin', null), []);
  assert.deepStrictEqual(computeTargetChannels(undefined, 1, 'cskh', 42), ['user.42']);
  assert.deepStrictEqual(computeTargetChannels(0, 1, 'tech', 42), ['user.42']);
  assert.deepStrictEqual(computeTargetChannels('invalid', 1, 'admin', 7), ['user.7']);

  // Tier 2: Store Owner (role === 'admin')
  assert.deepStrictEqual(computeTargetChannels(10, 'all', 'admin', 100), [
    'tenant.10.orders',
    'tenant.10.role.admin',
    'user.100',
  ]);
  assert.deepStrictEqual(computeTargetChannels(10, 3, 'admin', 100), [
    'tenant.10.orders',
    'tenant.10.role.admin',
    'tenant.10.branch.3.orders',
    'user.100',
  ]);

  // Tier 3: Branch operational staff (cskh, tech/technician, qc)
  // Must NOT subscribe to tenant.{id}.orders or tenant.{id}.role.admin (avoids cross-branch leaks & 403)
  assert.deepStrictEqual(computeTargetChannels(10, 3, 'cskh', 101), [
    'tenant.10.branch.3.orders',
    'tenant.10.branch.3.cskh',
    'user.101',
  ]);

  // Bidirectional role normalization ('tech' <-> 'technician')
  assert.strictEqual(normalizeNotificationRole('tech'), 'technician');
  assert.strictEqual(normalizeNotificationRole('TECHNICIAN'), 'technician');
  assert.deepStrictEqual(computeTargetChannels(10, 3, 'tech', 102), [
    'tenant.10.branch.3.orders',
    'tenant.10.branch.3.technician',
    'user.102',
  ]);
  assert.deepStrictEqual(
    computeTargetChannels(10, 3, 'tech', 102),
    computeTargetChannels(10, 3, 'technician', 102)
  );

  // QC in Tenant 20 Branch 7
  assert.deepStrictEqual(computeTargetChannels(20, 7, 'qc', 205), [
    'tenant.20.branch.7.orders',
    'tenant.20.branch.7.qc',
    'user.205',
  ]);

  // Unassigned branch staff only gets personal user channel
  assert.deepStrictEqual(computeTargetChannels(10, null, 'cskh', 101), ['user.101']);

  // Ensure legacy global channels are completely absent
  const allComputed = [
    ...computeTargetChannels(null, null, 'super_admin', 1),
    ...computeTargetChannels(10, 3, 'admin', 100),
    ...computeTargetChannels(10, 3, 'cskh', 101),
    ...computeTargetChannels(10, 3, 'tech', 102),
  ];
  assert.strictEqual(allComputed.includes('orders.all'), false);
  assert.strictEqual(allComputed.includes('branch.3.orders'), false);
  assert.strictEqual(allComputed.includes('role.admin'), false);
});

test('Task 4.1: toPrivateChannelName normalizes Pusher v7 private-* prefix without double-prefixing', () => {
  assert.strictEqual(toPrivateChannelName('tenant.10.orders'), 'private-tenant.10.orders');
  assert.strictEqual(
    toPrivateChannelName('private-tenant.10.orders'),
    'private-tenant.10.orders'
  );
  assert.strictEqual(
    toPrivateChannelName('presence-tenant.10.shift'),
    'presence-tenant.10.shift'
  );
  assert.strictEqual(toPrivateChannelName('platform.super_admin'), 'private-platform.super_admin');
  assert.strictEqual(toPrivateChannelName(''), '');
  assert.strictEqual(toPrivateChannelName('   '), '');
});

test('Task 4.1: ReverbSocketClient private-* channel handshake via POST /api/v1/broadcasting/auth (200 OK HMAC subscribe, 401/403 fail-closed, dynamic unsubscribe & disconnect)', async () => {
  const previousWindow = globalThis.window;
  const createdSockets = [];

  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 1; // OPEN
      this.sentFrames = [];
      this.onopen = null;
      this.onmessage = null;
      this.onerror = null;
      this.onclose = null;
      createdSockets.push(this);
    }

    send(raw) {
      this.sentFrames.push(JSON.parse(raw));
    }

    close() {
      this.readyState = 3; // CLOSED
    }

    receiveServerFrame(frame) {
      if (this.onmessage) {
        this.onmessage({ data: JSON.stringify(frame) });
      }
    }
  }

  globalThis.window = {
    location: {
      protocol: 'http:',
      hostname: 'localhost',
      origin: 'http://localhost:3000',
    },
    WebSocket: MockWebSocket,
  };

  try {
    // =========================================================================
    // SUB-CASE A: 200 OK Auth Handshake -> pusher:subscribe with HMAC signature
    // =========================================================================
    const authRequests = [];
    const authErrorsA = [];
    const connectionChangesA = [];

    const mockFetch200 = async (url, init) => {
      const parsedBody = JSON.parse(init.body);
      authRequests.push({
        url,
        method: init.method,
        headers: init.headers,
        body: parsedBody,
      });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            auth: `podscare_reverb_key:hmac_for_${parsedBody.channel_name}`,
          };
        },
      };
    };

    const clientA = new ReverbSocketClient(
      {
        key: 'podscare_reverb_key',
        wsHost: 'localhost',
        wsPort: 8080,
        scheme: 'http',
        authEndpoint: 'http://localhost:3000/api/v1/broadcasting/auth',
      },
      {
        tokenProvider: () => 'sanctum-token-tenant-10',
        fetchImpl: mockFetch200,
        onConnectionChange: (connected) => connectionChangesA.push(connected),
        onAuthError: (ch, status) => authErrorsA.push({ ch, status }),
      }
    );

    try {
      // Pass one raw channel and one already-prefixed private-* channel to verify zero double-prefixing
      clientA.setChannels(['tenant.10.branch.3.orders', 'private-user.101']);
      clientA.connect();

      assert.strictEqual(createdSockets.length, 1);
      const wsA = createdSockets[0];
      assert.match(wsA.url, /^ws:\/\/localhost:8080\/app\/podscare_reverb_key\?protocol=7/);

      // Simulate Reverb sending pusher:connection_established
      wsA.receiveServerFrame({
        event: 'pusher:connection_established',
        data: JSON.stringify({ socket_id: '9876.54321', activity_timeout: 30 }),
      });

      // Flush microtasks for async fetchImpl & subscribeChannel
      await new Promise((resolve) => setTimeout(resolve, 20));

      assert.strictEqual(clientA.isConnected, true);
      assert.strictEqual(clientA.currentSocketId, '9876.54321');
      assert.strictEqual(authErrorsA.length, 0);
      assert.strictEqual(authRequests.length, 2);

      // Verify auth requests used Bearer token, socket_id, and exact single private- prefix
      for (const req of authRequests) {
        assert.strictEqual(req.url, 'http://localhost:3000/api/v1/broadcasting/auth');
        assert.strictEqual(req.method, 'POST');
        assert.strictEqual(req.headers.Authorization, 'Bearer sanctum-token-tenant-10');
        assert.strictEqual(req.body.socket_id, '9876.54321');
        assert.strictEqual(
          req.body.channel_name.startsWith('private-private-'),
          false,
          'Channel name must NEVER double-prefix private-private-'
        );
      }

      const requestedChannelNames = authRequests.map((r) => r.body.channel_name).sort();
      assert.deepStrictEqual(requestedChannelNames, [
        'private-tenant.10.branch.3.orders',
        'private-user.101',
      ]);

      // Verify pusher:subscribe frames sent over WebSocket carry HMAC auth signature
      const subscribeFrames = wsA.sentFrames.filter((f) => f.event === 'pusher:subscribe');
      assert.strictEqual(subscribeFrames.length, 2);
      assert.deepStrictEqual(
        subscribeFrames.map((f) => f.data).sort((a, b) => a.channel.localeCompare(b.channel)),
        [
          {
            channel: 'private-tenant.10.branch.3.orders',
            auth: 'podscare_reverb_key:hmac_for_private-tenant.10.branch.3.orders',
          },
          {
            channel: 'private-user.101',
            auth: 'podscare_reverb_key:hmac_for_private-user.101',
          },
        ]
      );

      // Dynamic setChannels removes tenant.10.branch.3.orders -> sends pusher:unsubscribe
      clientA.setChannels(['user.101']);
      const unsubscribeFrames = wsA.sentFrames.filter((f) => f.event === 'pusher:unsubscribe');
      assert.strictEqual(unsubscribeFrames.length, 1);
      assert.deepStrictEqual(unsubscribeFrames[0].data, {
        channel: 'private-tenant.10.branch.3.orders',
      });
      assert.deepStrictEqual(clientA.subscribedChannelList, ['private-user.101']);
    } finally {
      clientA.disconnect();
    }

    assert.strictEqual(clientA.isConnected, false);
    assert.strictEqual(clientA.currentSocketId, null);
    assert.deepStrictEqual(clientA.subscribedChannelList, []);

    // =========================================================================
    // SUB-CASE B: 403 Forbidden Cross-Tenant -> Fail-Closed (NO pusher:subscribe)
    // =========================================================================
    const authErrors403 = [];
    const client403 = new ReverbSocketClient(
      {
        key: 'podscare_reverb_key',
        wsHost: 'localhost',
        wsPort: 8080,
        scheme: 'http',
        authEndpoint: 'http://localhost:3000/api/v1/broadcasting/auth',
      },
      {
        tokenProvider: () => 'sanctum-token-tenant-10',
        fetchImpl: async () => ({
          ok: false,
          status: 403,
          async json() {
            return { message: 'Forbidden' };
          },
        }),
        onAuthError: (ch, status) => authErrors403.push({ ch, status }),
      }
    );

    try {
      client403.setChannels(['tenant.99.orders']);
      client403.connect();
      const ws403 = createdSockets[createdSockets.length - 1];

      ws403.receiveServerFrame({
        event: 'pusher:connection_established',
        data: JSON.stringify({ socket_id: '1111.2222' }),
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      assert.deepStrictEqual(authErrors403, [
        { ch: 'private-tenant.99.orders', status: 403 },
      ]);
      assert.strictEqual(
        ws403.sentFrames.some((f) => f.event === 'pusher:subscribe'),
        false,
        'Must NEVER send pusher:subscribe when /broadcasting/auth returns 403'
      );
      assert.deepStrictEqual(client403.subscribedChannelList, []);
    } finally {
      client403.disconnect();
    }

    // =========================================================================
    // SUB-CASE C: Missing Bearer Token -> Fail-Closed before network call (401)
    // =========================================================================
    let fetchCalledWithoutToken = false;
    const authErrorsNoToken = [];
    const clientNoToken = new ReverbSocketClient(
      {
        key: 'podscare_reverb_key',
        wsHost: 'localhost',
        wsPort: 8080,
        scheme: 'http',
        authEndpoint: 'http://localhost:3000/api/v1/broadcasting/auth',
      },
      {
        tokenProvider: () => null,
        fetchImpl: async () => {
          fetchCalledWithoutToken = true;
          return { ok: false, status: 401, async json() { return {}; } };
        },
        onAuthError: (ch, status) => authErrorsNoToken.push({ ch, status }),
      }
    );

    try {
      clientNoToken.setChannels(['tenant.10.orders']);
      clientNoToken.connect();
      const wsNoToken = createdSockets[createdSockets.length - 1];

      wsNoToken.receiveServerFrame({
        event: 'pusher:connection_established',
        data: JSON.stringify({ socket_id: '3333.4444' }),
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      assert.strictEqual(fetchCalledWithoutToken, false, 'Must not call auth endpoint without Bearer token');
      assert.deepStrictEqual(authErrorsNoToken, [
        { ch: 'private-tenant.10.orders', status: 401 },
      ]);
      assert.strictEqual(
        wsNoToken.sentFrames.some((f) => f.event === 'pusher:subscribe'),
        false,
        'Must NEVER fall back to unauthenticated pusher:subscribe'
      );
    } finally {
      clientNoToken.disconnect();
    }
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});

test('Task 4.2: containsVietnameseCurrency detects VNĐ price formats without false-positives on Vietnamese compound words or order/model codes', () => {
  // True positives: Vietnamese currency expressions
  const currencySamples = [
    'Khách đã duyệt báo giá 350.000₫ cho đơn PC26-0012',
    'Tổng cộng (VNĐ): 450.000',
    'Thanh toán gói cước 500.000 VND',
    'Thêm dịch vụ vệ sinh màng loa +350k',
    'Chi phí dự kiến 500k',
    'Giảm giá -50k',
    'Báo giá 1.200k',
    'Phí thay pin +350.000 đ',
    'Miễn phí kiểm tra 0đ',
    'Tổng tiền 500.000 đồng',
    'Thanh toán 1,5 triệu đồng',
  ];
  for (const sample of currencySamples) {
    assert.strictEqual(
      containsVietnameseCurrency(sample),
      true,
      `Expected containsVietnameseCurrency("${sample}") to be true`
    );
  }

  // True negatives: Vietnamese compound words with "đồng" and model/order/resolution codes
  const nonCurrencySamples = [
    'Đơn PC26-0012 khách đã đồng ý phương án thay pin',
    'Tiếp nhận sửa đồng hồ Apple Watch Series 9',
    'Đã đồng bộ trạng thái với đồng nghiệp tại quầy',
    'Kiểm tra màn hình 4K và 5K sắc nét',
    'Model A2999K mã đơn PC26-0100K',
    'Kỹ thuật viên bắt đầu thay màng loa AirPods Pro 2',
  ];
  for (const sample of nonCurrencySamples) {
    assert.strictEqual(
      containsVietnameseCurrency(sample),
      false,
      `Expected containsVietnameseCurrency("${sample}") to be false`
    );
  }
});

test('Task 4.2: isPayloadAuthorizedForSession enforces 3-tier defense-in-depth & Technician VNĐ masking', () => {
  // 1. Tier 1: Platform Super Admin
  const superAdminSession = {
    enabled: true,
    tenantId: null,
    branchId: 'all',
    role: 'super_admin',
    userId: 1,
  };
  assert.strictEqual(
    isPayloadAuthorizedForSession(
      { type: 'tenant_registered', title: 'Gian hàng mới', tenantId: null, targetRole: 'super_admin' },
      superAdminSession
    ),
    true
  );
  assert.strictEqual(
    isPayloadAuthorizedForSession(
      { type: 'saas_payment_received', title: 'Thanh toán SaaS', tenantId: null, userId: 1 },
      superAdminSession
    ),
    true
  );
  // Super Admin MUST NOT receive store repair notifications (even from Master Tenant ID = 1)
  assert.strictEqual(
    isPayloadAuthorizedForSession(
      { type: 'order_created', title: 'Đơn mới cửa hàng', tenantId: 1, branchId: 1 },
      superAdminSession
    ),
    false
  );
  // Super Admin MUST NOT receive personal notifications addressed to another userId
  assert.strictEqual(
    isPayloadAuthorizedForSession(
      { type: 'tenant_registered', title: 'Gian hàng mới', tenantId: null, userId: 99 },
      superAdminSession
    ),
    false
  );

  // 2. Tier 2: Store Owner (Master Tenant 1 & Tenant A = 10)
  const masterOwnerSession = {
    enabled: true,
    tenantId: 1,
    branchId: 'all',
    role: 'admin',
    userId: 2,
  };
  // Master Tenant Owner MUST NOT see platform tenant_registered (tenantId: null) or Tenant B (tenantId: 20)
  assert.strictEqual(
    isPayloadAuthorizedForSession(
      { type: 'tenant_registered', title: 'Gian hàng B vừa đăng ký', tenantId: null, targetRole: 'super_admin' },
      masterOwnerSession
    ),
    false
  );
  assert.strictEqual(
    isPayloadAuthorizedForSession(
      { type: 'order_created', title: 'Đơn của Tenant B', tenantId: 20, branchId: 5 },
      masterOwnerSession
    ),
    false
  );
  // Fail-closed when payload has no tenantId
  assert.strictEqual(
    isPayloadAuthorizedForSession(
      { type: 'order_created', title: 'Thiếu tenantId', tenantId: null, branchId: 1 },
      masterOwnerSession
    ),
    false
  );

  // Tenant A Owner viewing all branches vs filtered branch 1
  const tenantAOwnerAll = {
    enabled: true,
    tenantId: 10,
    branchId: 'all',
    role: 'admin',
    userId: 100,
  };
  const tenantAOwnerBranch1 = {
    enabled: true,
    tenantId: 10,
    branchId: 1,
    role: 'admin',
    userId: 100,
  };
  assert.strictEqual(
    isPayloadAuthorizedForSession(
      { type: 'fee_reminder', title: 'Nhắc phí gói cước', tenantId: 10, targetRole: 'admin', userId: 100 },
      tenantAOwnerAll
    ),
    true
  );
  assert.strictEqual(
    isPayloadAuthorizedForSession(
      { type: 'order_created', title: 'Đơn CN 2', tenantId: 10, branchId: 2 },
      tenantAOwnerAll
    ),
    true
  );
  assert.strictEqual(
    isPayloadAuthorizedForSession(
      { type: 'order_created', title: 'Đơn CN 2', tenantId: 10, branchId: 2 },
      tenantAOwnerBranch1
    ),
    false
  );

  // 3. Tier 3: Branch Staff (CSKH vs Technician in Tenant 10, Branch 1)
  const cskhSession = {
    enabled: true,
    tenantId: 10,
    branchId: 1,
    role: 'cskh',
    userId: 101,
  };
  const techShortRoleSession = {
    enabled: true,
    tenantId: 10,
    branchId: 1,
    role: 'tech',
    userId: 102,
  };
  const technicianFullRoleSession = {
    enabled: true,
    tenantId: 10,
    branchId: 1,
    role: 'technician',
    userId: 102,
  };

  // CSKH sees Quote with VNĐ in own branch, but NOT other branch, other tenant, colleague userId, or admin fee_reminder
  assert.strictEqual(
    isPayloadAuthorizedForSession(
      {
        type: 'quote_action',
        title: 'Khách duyệt báo giá',
        message: 'Đơn PC26-0012 đã duyệt báo giá 450.000₫',
        tenantId: 10,
        branchId: 1,
        targetRole: 'cskh',
      },
      cskhSession
    ),
    true
  );
  assert.strictEqual(
    isPayloadAuthorizedForSession(
      { type: 'order_created', title: 'Đơn chi nhánh 2', tenantId: 10, branchId: 2 },
      cskhSession
    ),
    false
  );
  assert.strictEqual(
    isPayloadAuthorizedForSession(
      { type: 'fee_reminder', title: 'Nhắc phí phần mềm', tenantId: 10, branchId: 1, targetRole: 'admin' },
      cskhSession
    ),
    false
  );
  assert.strictEqual(
    isPayloadAuthorizedForSession(
      { type: 'order_assigned', title: 'Giao riêng cho KTV 102', tenantId: 10, branchId: 1, userId: 102 },
      cskhSession
    ),
    false
  );

  // Technician ('tech' & 'technician') accepts clean technical notifications (including Vietnamese "đồng ý" / "đồng hồ")
  const cleanTechPayload = {
    type: 'order_status',
    title: 'Khách đồng ý phương án sửa chữa',
    message: 'Đơn PC26-0012 sửa đồng hồ đã được xác nhận, KTV bắt đầu thao tác.',
    tenantId: 10,
    branchId: 1,
    targetRole: 'technician',
  };
  assert.strictEqual(isPayloadAuthorizedForSession(cleanTechPayload, techShortRoleSession), true);
  assert.strictEqual(
    isPayloadAuthorizedForSession(cleanTechPayload, technicianFullRoleSession),
    true
  );

  // Technician ('tech' & 'technician') strictly rejects quote_action and any VNĐ currency payload
  for (const forbiddenPayload of [
    {
      type: 'quote_action',
      title: 'Cập nhật phương án báo giá',
      message: 'Đơn PC26-0012 có cập nhật mới',
      tenantId: 10,
      branchId: 1,
    },
    {
      type: 'additional_service_added',
      title: 'Thêm dịch vụ phát sinh (+350k)',
      message: 'Thay pin tai nghe trái',
      tenantId: 10,
      branchId: 1,
    },
    {
      type: 'order_status',
      title: 'Khách đã duyệt sửa chữa',
      message: 'Tổng chi phí 450.000₫ cho đơn PC26-0012',
      tenantId: 10,
      branchId: 1,
    },
    {
      type: 'order_status',
      title: 'Khách đã duyệt sửa chữa',
      message: 'Tổng cộng (VNĐ): 450.000',
      tenantId: 10,
      branchId: 1,
    },
  ]) {
    assert.strictEqual(
      isPayloadAuthorizedForSession(forbiddenPayload, techShortRoleSession),
      false,
      `Tech ('tech') must block financial payload: ${forbiddenPayload.title} / ${forbiddenPayload.message}`
    );
    assert.strictEqual(
      isPayloadAuthorizedForSession(forbiddenPayload, technicianFullRoleSession),
      false,
      `Technician ('technician') must block financial payload: ${forbiddenPayload.title}`
    );
  }

  // Logged out or missing session tenantId -> always false
  assert.strictEqual(
    isPayloadAuthorizedForSession(cleanTechPayload, { ...techShortRoleSession, enabled: false }),
    false
  );
  assert.strictEqual(
    isPayloadAuthorizedForSession(cleanTechPayload, { ...techShortRoleSession, tenantId: null }),
    false
  );
});

test('Task 4.2 & 4.3: buildNotificationSessionKey & resolveNotificationActionUrl route platform, SaaS, and store notifications accurately', () => {
  // Session key checks
  assert.strictEqual(
    buildNotificationSessionKey({ enabled: false, userId: 1, tenantId: 10, role: 'admin' }),
    'logged_out'
  );
  assert.strictEqual(
    buildNotificationSessionKey({ enabled: true, userId: 1, tenantId: null, role: 'super_admin' }),
    'super_admin:platform:1'
  );
  assert.strictEqual(
    buildNotificationSessionKey({ enabled: true, userId: 102, tenantId: 10, role: 'tech' }),
    'technician:10:102'
  );
  assert.notStrictEqual(
    buildNotificationSessionKey({ enabled: true, userId: 100, tenantId: 10, role: 'admin' }),
    buildNotificationSessionKey({ enabled: true, userId: 200, tenantId: 20, role: 'admin' })
  );

  // Action URL resolution for Platform Super Admin
  assert.strictEqual(
    resolveNotificationActionUrl({ type: 'tenant_registered', role: 'super_admin' }),
    '/platform/stores'
  );
  assert.strictEqual(
    resolveNotificationActionUrl({ type: 'tenant_approval_pending', role: 'super_admin' }),
    '/platform/approvals'
  );
  assert.strictEqual(
    resolveNotificationActionUrl({ type: 'saas_payment_received', role: 'super_admin' }),
    '/platform/billing'
  );
  // Must override accidental /repairs fallback URL when in super_admin context
  assert.strictEqual(
    resolveNotificationActionUrl({
      actionUrl: '/repairs?id=0',
      type: 'tenant_registered',
      role: 'super_admin',
    }),
    '/platform/stores'
  );

  // Action URL resolution for SaaS Store Owner & Repair Orders
  assert.strictEqual(
    resolveNotificationActionUrl({ type: 'fee_reminder', role: 'admin' }),
    '/subscription'
  );
  assert.strictEqual(
    resolveNotificationActionUrl({ type: 'saas_subscription_renewed', role: 'admin' }),
    '/subscription'
  );
  assert.strictEqual(
    resolveNotificationActionUrl({ type: 'order_created', orderId: 'PC26-00888', role: 'cskh' }),
    '/repairs?id=PC26-00888'
  );
});

test('Task 4.2 & 4.3: Operational notification state lifecycle (prepend, unread count, mark as read)', () => {
  let notifications = [
    { id: '1', title: 'Đơn cũ 1', isRead: true, orderCode: 'PC26-00001' },
    { id: '2', title: 'Đơn cũ 2', isRead: false, orderCode: 'PC26-00002' },
  ];

  const handleIncomingEvent = (item) => {
    const newItem = { ...item, isRead: false };
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

  assert.strictEqual(notifications.filter((n) => !n.isRead).length, 1);

  handleIncomingEvent({ id: '3', title: 'Đơn SLA nguy cấp', orderCode: 'PC26-00003' });
  assert.strictEqual(notifications.length, 3);
  assert.strictEqual(notifications[0].id, '3');
  assert.strictEqual(notifications[0].orderCode, 'PC26-00003');
  assert.strictEqual(notifications.filter((n) => !n.isRead).length, 2);

  handleIncomingEvent({ id: '3', title: 'Đơn SLA nguy cấp', orderCode: 'PC26-00003' });
  assert.strictEqual(notifications.length, 3);

  markAsRead('3');
  assert.strictEqual(notifications.find((n) => n.id === '3')?.isRead, true);
  assert.strictEqual(notifications.filter((n) => !n.isRead).length, 1);

  markAllAsRead();
  assert.strictEqual(notifications.filter((n) => !n.isRead).length, 0);
  assert.strictEqual(notifications.every((n) => n.isRead), true);
});

test('Task 1 & 2: order_created is in ALLOWED_NOTIFICATION_TYPES whitelist and dispatches via RealtimeEventBus', () => {
  assert.ok(ALLOWED_NOTIFICATION_TYPES.includes('order_created'), 'order_created must be in whitelist');
  assert.strictEqual(
    isOperationalEventWhitelisted('order.created', { type: 'order_created' }),
    true
  );
  assert.strictEqual(
    isOperationalEventWhitelisted(undefined, { type: 'order_created' }),
    true
  );

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
    tenantId: 10,
    branchId: 1,
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

test('Task 2: getReverbEchoConfig provides flexible connection defaults, /api/v1/broadcasting/auth endpoint, and parses env variables', () => {
  const defaultConfig = getReverbEchoConfig();
  assert.strictEqual(defaultConfig.broadcaster, 'reverb');
  assert.ok(defaultConfig.wsHost);
  assert.ok(defaultConfig.wsPort > 0);
  assert.ok(defaultConfig.key);
  assert.match(defaultConfig.authEndpoint, /\/api\/v1\/broadcasting\/auth$/);

  const originalHost = process.env.NEXT_PUBLIC_REVERB_HOST;
  const originalPort = process.env.NEXT_PUBLIC_REVERB_PORT;
  const originalScheme = process.env.NEXT_PUBLIC_REVERB_SCHEME;
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

  process.env.NEXT_PUBLIC_REVERB_HOST = 'api.podscare.vn';
  process.env.NEXT_PUBLIC_REVERB_PORT = '443';
  process.env.NEXT_PUBLIC_REVERB_SCHEME = 'https';
  process.env.NEXT_PUBLIC_API_URL = 'https://api.podscare.vn/api/v1';

  const customConfig = getReverbEchoConfig();
  assert.strictEqual(customConfig.wsHost, 'api.podscare.vn');
  assert.strictEqual(customConfig.wsPort, 443);
  assert.strictEqual(customConfig.wssPort, 443);
  assert.strictEqual(customConfig.scheme, 'https');
  assert.strictEqual(customConfig.forceTLS, true);
  assert.deepStrictEqual(customConfig.enabledTransports, ['wss']);
  assert.strictEqual(
    customConfig.authEndpoint,
    'https://api.podscare.vn/api/v1/broadcasting/auth'
  );

  if (originalHost !== undefined) process.env.NEXT_PUBLIC_REVERB_HOST = originalHost;
  else delete process.env.NEXT_PUBLIC_REVERB_HOST;
  if (originalPort !== undefined) process.env.NEXT_PUBLIC_REVERB_PORT = originalPort;
  else delete process.env.NEXT_PUBLIC_REVERB_PORT;
  if (originalScheme !== undefined) process.env.NEXT_PUBLIC_REVERB_SCHEME = originalScheme;
  else delete process.env.NEXT_PUBLIC_REVERB_SCHEME;
  if (originalApiUrl !== undefined) process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  else delete process.env.NEXT_PUBLIC_API_URL;
});
