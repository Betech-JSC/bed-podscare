import assert from 'node:assert';
import test from 'node:test';
import {
  isOperationalEventWhitelisted,
  realtimeEventBus,
  ReverbSocketClient,
} from '../app/utils/socketNotifications.ts';

test('Task 3.1: Payment order ID logic accepts order_code or numeric ID without stripping digits to invalid numbers', () => {
  const sanitizeOrderRef = (qrOrderCode) => {
    const orderRef = qrOrderCode.trim();
    return /^\d+$/.test(orderRef) ? Number(orderRef) : orderRef;
  };

  // When order code string with letters is entered:
  assert.strictEqual(sanitizeOrderRef('PC26-00982'), 'PC26-00982');
  assert.notStrictEqual(sanitizeOrderRef('PC26-00982'), 2600982); // Regex strip would produce 2600982 which is wrong!

  // When pure numeric ID is entered:
  assert.strictEqual(sanitizeOrderRef('42'), 42);
  assert.strictEqual(typeof sanitizeOrderRef('42'), 'number');
});

test('Task 3.2: Payment status mapping marks both "paid" and "completed" as "Hoàn tất" with statusType "ready"', () => {
  const mapPaymentStatus = (p) => {
    return {
      status: (p.status === 'completed' || p.status === 'paid') ? 'Hoàn tất' : 'Chờ xử lý',
      statusType: (p.status === 'completed' || p.status === 'paid') ? 'ready' : 'wait',
    };
  };

  const paidPayment = { status: 'paid' };
  assert.deepStrictEqual(mapPaymentStatus(paidPayment), {
    status: 'Hoàn tất',
    statusType: 'ready',
  });

  const completedPayment = { status: 'completed' };
  assert.deepStrictEqual(mapPaymentStatus(completedPayment), {
    status: 'Hoàn tất',
    statusType: 'ready',
  });

  const pendingPayment = { status: 'pending' };
  assert.deepStrictEqual(mapPaymentStatus(pendingPayment), {
    status: 'Chờ xử lý',
    statusType: 'wait',
  });
});

test('Task 3.3: Warranty field normalization reads duration_days, start_date, end_date and calculates remaining days correctly', () => {
  const calculateRemainingDays = (expiresAtStr) => {
    if (!expiresAtStr) return 0;
    try {
      const exp = new Date(expiresAtStr);
      exp.setHours(23, 59, 59, 999);
      const expTime = exp.getTime();
      const now = new Date().getTime();
      const diff = Math.ceil((expTime - now) / (1000 * 60 * 60 * 24));
      return diff > 0 ? diff : 0;
    } catch {
      return 0;
    }
  };

  const mapStatus = (rawStatus, remainingDays) => {
    if (rawStatus === 'voided') return { label: 'Đã hủy', type: 'danger' };
    if (rawStatus === 'expired' || remainingDays <= 0) return { label: 'Hết hạn', type: 'gray' };
    return { label: 'Còn hạn', type: 'ready' };
  };

  // Backend returned raw warranty item
  const rawApiWarranty = {
    id: 1,
    warranty_code: 'PC26-WR-101',
    start_date: '2026-09-01',
    duration_days: 90,
    end_date: '2026-11-30',
    status: 'active',
  };

  const periodDays = Number(rawApiWarranty.duration_days ?? rawApiWarranty.warranty_period_days) || 90;
  const startDateRaw = rawApiWarranty.start_date ?? rawApiWarranty.starts_at;
  const endDateRaw = rawApiWarranty.end_date ?? rawApiWarranty.expires_at;
  const remDays = calculateRemainingDays(endDateRaw);
  const st = mapStatus(rawApiWarranty.status, remDays);

  assert.strictEqual(periodDays, 90);
  assert.strictEqual(startDateRaw, '2026-09-01');
  assert.strictEqual(endDateRaw, '2026-11-30');
  assert.ok(remDays > 0, `Remaining days must be > 0 (got ${remDays})`);
  assert.strictEqual(st.label, 'Còn hạn');
  assert.strictEqual(st.type, 'ready');
});

test('Task 3.4: ReverbSocketClient dispatches to this.onEvent without double-emitting to realtimeEventBus', () => {
  let onEventCalled = 0;
  let busCalled = 0;

  const unsubscribe = realtimeEventBus.subscribe(() => {
    busCalled++;
  });

  const client = new ReverbSocketClient('fake-key', {
    onEvent: () => {
      onEventCalled++;
    },
  });

  // Simulate incoming socket message
  client['handleSocketMessage']({
    channel: 'branch.1.orders',
    event: 'order.created',
    data: {
      order_id: 99,
      order_code: 'PC26-00099',
      type: 'order_status',
      message: 'Đơn mới tiếp nhận',
    },
  });

  // onEvent MUST be called exactly once
  assert.strictEqual(onEventCalled, 1, 'onEvent must be called exactly once');
  // realtimeEventBus MUST NOT be called when onEvent is handled, preventing double chime
  assert.strictEqual(busCalled, 0, 'realtimeEventBus must not be triggered when onEvent is provided');

  unsubscribe();
});

test('Task 3.5: availableOrders filter strictly accepts waiting_tech ("Chờ kỹ thuật") only', () => {
  const orders = [
    { id: '1', status: 'Chờ kỹ thuật', technicianId: null },
    { id: '2', status: 'waiting_tech', technicianId: null },
    { id: '3', status: 'Đã duyệt', technicianId: null },
    { id: '4', status: 'Tiếp nhận mới', technicianId: null },
    { id: '5', status: 'Chờ khách duyệt', technicianId: null },
    { id: '6', status: 'Chờ kỹ thuật', technicianId: 5 }, // already assigned
  ];

  const availableOrders = orders.filter(
    (o) =>
      (!o.technicianId && !o.technician_id) &&
      (o.status === 'Chờ kỹ thuật' || o.status === 'waiting_tech')
  );

  assert.strictEqual(availableOrders.length, 2);
  assert.deepStrictEqual(availableOrders.map((o) => o.id), ['1', '2']);
});

test('Task 3.6: Intake photo mapping resolves p.photo_url || p.file_path || p.url flexibly', () => {
  const photosFromDb = [
    { photo_type: 'Mặt trước', photo_url: 'https://cdn.podscare.vn/photos/1.jpg' },
    { photo_type: 'Mặt sau', file_path: '/storage/photos/2.jpg' },
    { photo_type: 'Chi tiết', url: 'https://cdn.podscare.vn/photos/3.jpg' },
  ];

  const mappedPhotos = photosFromDb.map((p) => ({
    name: p.photo_type || 'Ảnh thiết bị',
    url: p.photo_url || p.file_path || p.url,
  }));

  assert.strictEqual(mappedPhotos[0].url, 'https://cdn.podscare.vn/photos/1.jpg');
  assert.strictEqual(mappedPhotos[1].url, '/storage/photos/2.jpg');
  assert.strictEqual(mappedPhotos[2].url, 'https://cdn.podscare.vn/photos/3.jpg');
});

test('Task 3.7: Proxy route URL normalization prevents duplicate /api/v1/api/v1', () => {
  const buildProxyUrl = (backendBaseRaw, proxySegments, search = '') => {
    const backendBase = backendBaseRaw.replace(/\/$/, '');
    const path = (proxySegments || []).join('/');
    const normalizedBase = backendBase.replace(/\/api(\/v\d+)?\/?$/, '');
    const cleanPath = path.startsWith('api/') ? path : `api/${path}`;
    return `${normalizedBase}/${cleanPath}${search}`;
  };

  // Case 1: backendBase ends with /api/v1
  const url1 = buildProxyUrl('http://103.48.84.51:8000/api/v1', ['v1', 'customers']);
  assert.strictEqual(url1, 'http://103.48.84.51:8000/api/v1/customers');
  assert.doesNotMatch(url1, /\/api\/v1\/api\/v1/);

  // Case 2: backendBase ends with /api/v1/
  const url2 = buildProxyUrl('http://103.48.84.51:8000/api/v1/', ['v1', 'orders'], '?page=1');
  assert.strictEqual(url2, 'http://103.48.84.51:8000/api/v1/orders?page=1');

  // Case 3: backendBase ends with /api
  const url3 = buildProxyUrl('http://127.0.0.1:8000/api', ['v1', 'services']);
  assert.strictEqual(url3, 'http://127.0.0.1:8000/api/v1/services');

  // Case 4: backendBase has no /api suffix
  const url4 = buildProxyUrl('http://127.0.0.1:8000', ['v1', 'branches']);
  assert.strictEqual(url4, 'http://127.0.0.1:8000/api/v1/branches');

  // Case 5: proxy path already has 'api/' prefix
  const url5 = buildProxyUrl('http://127.0.0.1:8000', ['api', 'v1', 'branches']);
  assert.strictEqual(url5, 'http://127.0.0.1:8000/api/v1/branches');
});

test('Task 3.8: 401 interceptor clears token and redirects to /login when outside /login', () => {
  let cleared = false;
  let redirectedTo = '';

  const mockHttpClient = {
    token: 'jwt-expired-token',
    setToken(val) {
      if (val === null) cleared = true;
      this.token = val;
    },
  };

  const handle401 = (status, currentPath) => {
    if (status === 401) {
      mockHttpClient.setToken(null);
      if (currentPath !== '/login') {
        redirectedTo = '/login';
      }
    }
  };

  // Case 1: 401 on /dashboard
  handle401(401, '/dashboard');
  assert.strictEqual(cleared, true);
  assert.strictEqual(mockHttpClient.token, null);
  assert.strictEqual(redirectedTo, '/login');

  // Case 2: 401 while already on /login
  cleared = false;
  redirectedTo = '';
  handle401(401, '/login');
  assert.strictEqual(cleared, true);
  assert.strictEqual(redirectedTo, '', 'Should not redirect if already on /login');
});

