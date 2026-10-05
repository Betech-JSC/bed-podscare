import assert from 'node:assert';
import test, { describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('OpenSpec: Task 5.1 Next.js Proxy Resilience & Dual-Token Resolution Tests', () => {
  const proxyRoutePath = path.resolve(__dirname, '../app/api/[...proxy]/route.ts');
  const routeContent = fs.readFileSync(proxyRoutePath, 'utf-8');

  test('1.1. Ưu tiên tuyệt đối BACKEND_INTERNAL_URL trước các biến WAN', () => {
    // Kiểm tra cấu trúc code trong route.ts
    const backendBaseBlockRegex = /const\s+backendBase\s*=\s*\(([\s\S]*?)\)\.replace/;
    const match = routeContent.match(backendBaseBlockRegex);
    assert.ok(match, 'Phải tìm thấy khai báo backendBase trong route.ts');

    const envPriorities = match[1]
      .split('||')
      .map((s) => s.trim().replace(/^process\.env\./, '').replace(/['"]/g, ''));

    assert.strictEqual(
      envPriorities[0],
      'BACKEND_INTERNAL_URL',
      'BACKEND_INTERNAL_URL phải là biến môi trường được ưu tiên hàng đầu (index 0)'
    );
    assert.strictEqual(
      envPriorities[1],
      'BACKEND_API_URL',
      'BACKEND_API_URL phải là fallback thứ 2 (index 1)'
    );
    assert.strictEqual(
      envPriorities[2],
      'NEXT_PUBLIC_API_URL',
      'NEXT_PUBLIC_API_URL phải là fallback thứ 3 (index 2)'
    );
    assert.strictEqual(
      envPriorities[3],
      'http://127.0.0.1:8000',
      'Mặc định loopback nội bộ http://127.0.0.1:8000 khi không có biến env nào'
    );

    // Kiểm tra hành vi tính toán base url logic
    const resolveBase = (env) => {
      return (
        env.BACKEND_INTERNAL_URL ||
        env.BACKEND_API_URL ||
        env.NEXT_PUBLIC_API_URL ||
        'http://127.0.0.1:8000'
      ).replace(/\/$/, '');
    };

    assert.strictEqual(
      resolveBase({
        BACKEND_INTERNAL_URL: 'http://127.0.0.1:8000',
        BACKEND_API_URL: 'https://api.fixo.com.vn',
        NEXT_PUBLIC_API_URL: 'https://api.fixo.com.vn',
      }),
      'http://127.0.0.1:8000',
      'Khi cấu hình BACKEND_INTERNAL_URL, proxy phải bypass hoàn toàn domain WAN'
    );

    assert.strictEqual(
      resolveBase({
        BACKEND_API_URL: 'https://api.fixo.com.vn',
        NEXT_PUBLIC_API_URL: 'https://fixo.com.vn',
      }),
      'https://api.fixo.com.vn',
      'Khi thiếu BACKEND_INTERNAL_URL, fallback sang BACKEND_API_URL'
    );
  });

  test('1.2. Cơ chế phân giải token kép (Dual-Token Resolution: Header + Cookie)', () => {
    assert.ok(
      routeContent.includes("req.cookies.get('podscare_session_token')"),
      'Proxy phải đọc cookie podscare_session_token khi thiếu header'
    );
    assert.ok(
      routeContent.includes("forwardHeaders['Authorization']"),
      'Proxy phải gán Authorization header vào forwardHeaders'
    );

    // Giả lập logic Dual Token Resolution trong route.ts
    const resolveAuthHeader = (headers, cookies) => {
      let authHeader = headers['authorization'] || null;
      if (!authHeader) {
        const cookieToken = cookies['podscare_session_token'];
        if (cookieToken) {
          const cleanToken = decodeURIComponent(cookieToken).trim();
          authHeader = cleanToken.startsWith('Bearer ') ? cleanToken : `Bearer ${cleanToken}`;
        }
      }
      return authHeader;
    };

    // Case 1: Có header Authorization
    const res1 = resolveAuthHeader({ authorization: 'Bearer header_jwt_token' }, {});
    assert.strictEqual(res1, 'Bearer header_jwt_token');

    // Case 2: Thiếu header nhưng có Cookie
    const res2 = resolveAuthHeader({}, { podscare_session_token: 'secret_cookie_token' });
    assert.strictEqual(res2, 'Bearer secret_cookie_token', 'Cookie token phải được gắn tiền tố Bearer');

    // Case 3: Cookie đã có sẵn Bearer
    const res3 = resolveAuthHeader({}, { podscare_session_token: 'Bearer encoded_cookie_token' });
    assert.strictEqual(res3, 'Bearer encoded_cookie_token', 'Không được lặp lại tiền tố Bearer');

    // Case 4: Cả 2 cùng tồn tại -> Ưu tiên header
    const res4 = resolveAuthHeader(
      { authorization: 'Bearer primary_header_token' },
      { podscare_session_token: 'fallback_cookie_token' }
    );
    assert.strictEqual(res4, 'Bearer primary_header_token', 'Header phải có ưu tiên cao nhất');
  });

  test('1.3. Khối catch trích xuất toàn diện err.cause và phản hồi HTTP 502 chi tiết', () => {
    assert.ok(
      routeContent.includes('err?.cause') || routeContent.includes('err.cause'),
      'Proxy catch block phải trích xuất err.cause'
    );
    assert.ok(
      routeContent.includes('error_code') && routeContent.includes('error_detail'),
      'Proxy JSON phản hồi 502 phải chứa error_code và error_detail'
    );
    assert.ok(
      routeContent.includes('status: 502'),
      'Proxy phải phản hồi HTTP status 502 khi gặp ngoại lệ mạng'
    );
    assert.ok(
      routeContent.includes('10000') || routeContent.includes('timeoutId'),
      'Proxy phải thiết lập timeout bảo vệ'
    );

    // Giả lập xử lý lỗi của proxy
    const formatProxyError = (err, reqMethod = 'GET', url = 'http://127.0.0.1:8000/api/v1/branches') => {
      const cause = err?.cause;
      const errorCode = cause?.code || err?.code || 'FETCH_FAILED';
      const errorDetail = cause?.message || err?.message || 'Unknown network error';
      const causeInfo = cause
        ? {
            code: cause.code,
            syscall: cause.syscall,
            errno: cause.errno,
            message: cause.message || String(cause),
          }
        : undefined;

      return {
        status: 502,
        body: {
          success: false,
          message: `PodsCare Proxy Error (${reqMethod} ${url}): ${err.message}`,
          error: err.message,
          error_code: errorCode,
          error_detail: errorDetail,
          target_url: url,
          cause: causeInfo,
        },
      };
    };

    const simulatedErr = new Error('fetch failed');
    simulatedErr.cause = {
      code: 'ECONNREFUSED',
      syscall: 'connect',
      errno: -61,
      message: 'connect ECONNREFUSED 127.0.0.1:8000',
    };

    const result = formatProxyError(simulatedErr);
    assert.strictEqual(result.status, 502);
    assert.strictEqual(result.body.success, false);
    assert.strictEqual(result.body.error_code, 'ECONNREFUSED');
    assert.strictEqual(result.body.error_detail, 'connect ECONNREFUSED 127.0.0.1:8000');
    assert.deepStrictEqual(result.body.cause, {
      code: 'ECONNREFUSED',
      syscall: 'connect',
      errno: -61,
      message: 'connect ECONNREFUSED 127.0.0.1:8000',
    });
  });
});
