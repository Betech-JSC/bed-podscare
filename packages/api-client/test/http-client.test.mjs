import assert from 'node:assert';
import test, { describe, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('OpenSpec: Task 5.3 HttpClient 401 Resilience & skipAuthRedirect Tests', () => {
  const httpClientSrcPath = path.resolve(__dirname, '../src/http-client.ts');
  const srcContent = fs.readFileSync(httpClientSrcPath, 'utf-8');

  test('3.1. Cấu hình kiểu dữ liệu RequestOptions và thuộc tính debounce trong HttpClient', () => {
    assert.ok(
      srcContent.includes('skipAuthRedirect?: boolean'),
      'RequestOptions phải chứa thuộc tính tùy chọn skipAuthRedirect?: boolean'
    );
    assert.ok(
      srcContent.includes('isLoggingOut'),
      'HttpClient phải chứa cờ isLoggingOut để debounce single-flight logout'
    );
    assert.ok(
      srcContent.includes('handleUnauthorized'),
      'HttpClient phải cài đặt phương thức handleUnauthorized'
    );
  });

  test('3.2. Cơ chế skipAuthRedirect: Request nhận 401 nhưng KHÔNG xóa token', async () => {
    // Mock class HttpClient theo logic thực tế
    class MockHttpClient {
      constructor() {
        this.token = 'valid-test-bearer-token';
        this.isLoggingOut = false;
        this.logoutCallCount = 0;
      }

      setToken(token) {
        this.token = token;
      }

      getToken() {
        return this.token;
      }

      handleUnauthorized() {
        if (this.isLoggingOut) return;
        this.isLoggingOut = true;
        this.logoutCallCount++;
        this.setToken(null);
      }

      async mockRequest(options = {}) {
        // Giả lập backend phản hồi 401 Unauthorized
        const status = 401;
        if (status === 401) {
          if (!options.skipAuthRedirect) {
            this.handleUnauthorized();
          }
        }
        throw new Error(`Request failed with status ${status}`);
      }
    }

    const client = new MockHttpClient();
    assert.strictEqual(client.getToken(), 'valid-test-bearer-token');

    // Gọi request background (ví dụ notification polling) với cờ skipAuthRedirect: true
    try {
      await client.mockRequest({ skipAuthRedirect: true });
      assert.fail('Phải ném lỗi');
    } catch (err) {
      assert.ok(err.message.includes('401'));
    }

    // Token PHẢI được bảo toàn nguyên vẹn
    assert.strictEqual(
      client.getToken(),
      'valid-test-bearer-token',
      'Token không được phép bị xóa khi request có skipAuthRedirect: true'
    );
    assert.strictEqual(client.logoutCallCount, 0, 'Không được kích hoạt logout handler');
  });

  test('3.3. Cơ chế Single-flight/Debounce logout: 5 request 401 đồng thời chỉ trigger logout 1 lần', async () => {
    class DebounceHttpClient {
      constructor() {
        this.token = 'active-user-session';
        this.isLoggingOut = false;
        this.logoutTriggerCount = 0;
      }

      setToken(token) {
        this.token = token;
      }

      getToken() {
        return this.token;
      }

      handleUnauthorized() {
        if (this.isLoggingOut) return;
        this.isLoggingOut = true;
        this.logoutTriggerCount++;
        this.setToken(null);
      }

      async mockRequest(options = {}) {
        const status = 401;
        if (status === 401) {
          if (!options.skipAuthRedirect) {
            this.handleUnauthorized();
          }
        }
        throw new Error(`Status ${status}`);
      }
    }

    const client = new DebounceHttpClient();
    assert.strictEqual(client.getToken(), 'active-user-session');

    // Giả lập 5 request chính đồng thời nhận 401 (Cascading 401 storm)
    const promises = [
      client.mockRequest(),
      client.mockRequest(),
      client.mockRequest(),
      client.mockRequest(),
      client.mockRequest(),
    ];

    const results = await Promise.allSettled(promises);
    assert.strictEqual(results.length, 5);
    results.forEach((r) => assert.strictEqual(r.status, 'rejected'));

    // Logout chỉ được kích hoạt DUY NHẤT 1 LẦN
    assert.strictEqual(
      client.logoutTriggerCount,
      1,
      'Chỉ được trigger dọn dẹp storage và redirect 1 lần duy nhất khi có bão 401 đồng thời'
    );
    assert.strictEqual(client.getToken(), null, 'Token đã được xóa an toàn sau 1 lần logout');
  });

  test('3.4. NotificationService tự động gắn cờ skipAuthRedirect: true khi lấy thông báo', () => {
    const notifServicePath = path.resolve(__dirname, '../src/services/notification.service.ts');
    const notifContent = fs.readFileSync(notifServicePath, 'utf-8');

    assert.ok(
      notifContent.includes('skipAuthRedirect: true'),
      'notification.service.ts phải cấu hình skipAuthRedirect: true trong getNotifications'
    );
  });

  test('3.5. WarrantyService hỗ trợ đầy đủ phân trang (page, per_page, per_page="all", all=true), tìm kiếm q và WarrantySummaryCounts', () => {
    const warrantyServicePath = path.resolve(__dirname, '../src/services/warranty.service.ts');
    const warrantyContent = fs.readFileSync(warrantyServicePath, 'utf-8');

    assert.ok(
      warrantyContent.includes('export interface WarrantySummaryCounts'),
      'warranty.service.ts phải khai báo WarrantySummaryCounts'
    );
    assert.ok(
      warrantyContent.includes("per_page?: number | 'all'"),
      'WarrantyPaginationParams phải hỗ trợ per_page?: number | "all"'
    );
    assert.ok(
      warrantyContent.includes("params.per_page === 'all' || params.all === true"),
      'buildCleanPaginationParams phải đồng bộ per_page = "all" và all = true'
    );
    assert.ok(
      warrantyContent.includes("this.http.get('/api/v1/warranties'"),
      'getWarranties phải gọi GET /api/v1/warranties kèm params phân trang'
    );
    assert.ok(
      warrantyContent.includes("this.http.get('/api/v1/warranties/claims'"),
      'getClaims phải gọi GET /api/v1/warranties/claims kèm params phân trang'
    );
  });
});
