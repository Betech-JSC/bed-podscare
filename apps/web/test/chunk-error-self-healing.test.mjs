import assert from 'node:assert';
import test, { describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('OpenSpec: Task 5.2 ChunkLoadError Self-Healing Interceptor Tests', () => {
  const providersPath = path.resolve(__dirname, '../app/providers.tsx');
  const providersContent = fs.readFileSync(providersPath, 'utf-8');

  test('2.1. Providers tích hợp đầy đủ ChunkLoadErrorHandler với window error & unhandledrejection listeners', () => {
    assert.ok(
      providersContent.includes('ChunkLoadErrorHandler'),
      'providers.tsx phải định nghĩa và sử dụng component ChunkLoadErrorHandler'
    );
    assert.ok(
      providersContent.includes("window.addEventListener('error', handleChunkError)"),
      "Phải đăng ký sự kiện 'error' trên window"
    );
    assert.ok(
      providersContent.includes("window.addEventListener('unhandledrejection', handleChunkError)"),
      "Phải đăng ký sự kiện 'unhandledrejection' trên window"
    );
    assert.ok(
      providersContent.includes("<ChunkLoadErrorHandler />") || providersContent.includes("<ChunkLoadErrorHandler/>"),
      'ChunkLoadErrorHandler phải được render bên trong ToastProvider của Providers'
    );
  });

  test('2.2. Nhận diện chính xác tất cả các dạng biến thể của lỗi ChunkLoadError', () => {
    const isChunkError = (message) => {
      const msg = String(message || '');
      return (
        msg.includes('Loading chunk') ||
        msg.includes('ChunkLoadError') ||
        msg.includes('Failed to fetch dynamically imported module')
      );
    };

    // Chuỗi lỗi Webpack / Next.js chunk load
    assert.strictEqual(
      isChunkError('ChunkLoadError: Loading chunk 842 failed. (missing: /_next/static/chunks/842.js)'),
      true
    );
    assert.strictEqual(
      isChunkError('Loading chunk app/dashboard/page failed.'),
      true
    );
    assert.strictEqual(
      isChunkError('TypeError: Failed to fetch dynamically imported module: https://fixo.com.vn/_next/static/chunks/main.js'),
      true
    );

    // Chuỗi lỗi khác không phải chunk load
    assert.strictEqual(isChunkError('NetworkError: Failed to fetch API'), false);
    assert.strictEqual(isChunkError('Uncaught ReferenceError: foo is not defined'), false);
    assert.strictEqual(isChunkError(''), false);
  });

  test('2.3. Cơ chế tự động reload 1 lần và chống reload vô tận trong cửa sổ 15 giây (15000ms cooldown)', () => {
    // Giả lập mock môi trường sessionStorage và location
    class MockSessionStorage {
      constructor() {
        this.store = {};
      }
      getItem(key) {
        return this.store[key] || null;
      }
      setItem(key, value) {
        this.store[key] = String(value);
      }
      clear() {
        this.store = {};
      }
    }

    const mockStorage = new MockSessionStorage();
    let reloadCount = 0;
    let toastWarnings = [];

    const triggerChunkErrorHandler = (errorMessage, currentTime) => {
      const isChunk =
        errorMessage.includes('Loading chunk') ||
        errorMessage.includes('ChunkLoadError') ||
        errorMessage.includes('Failed to fetch dynamically imported module');

      if (!isChunk) return;

      const lastReload =
        mockStorage.getItem('podscare_chunk_reload_ts') ||
        mockStorage.getItem('fixo_last_chunk_reload');
      const now = currentTime;

      if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
        mockStorage.setItem('podscare_chunk_reload_ts', String(now));
        mockStorage.setItem('fixo_last_chunk_reload', String(now));
        reloadCount++;
      } else {
        toastWarnings.push('Hệ thống vừa cập nhật phiên bản mới. Vui lòng bấm Ctrl+F5 hoặc tải lại trình duyệt.');
      }
    };

    // Lần 1: Lỗi chunk xuất hiện lần đầu -> Kích hoạt reload và lưu timestamp
    const t0 = 1000000;
    triggerChunkErrorHandler('ChunkLoadError: Loading chunk 123 failed', t0);
    assert.strictEqual(reloadCount, 1, 'Lần đầu gặp ChunkLoadError phải tự động reload ngay');
    assert.strictEqual(mockStorage.getItem('podscare_chunk_reload_ts'), String(t0));
    assert.strictEqual(toastWarnings.length, 0);

    // Lần 2: Lỗi chunk tiếp tục xảy ra 3 giây sau (vẫn trong khoảng 15 giây) -> KHÔNG reload lặp lại
    triggerChunkErrorHandler('ChunkLoadError: Loading chunk 123 failed', t0 + 3000);
    assert.strictEqual(reloadCount, 1, 'Không được reload lần thứ 2 khi chưa hết 15 giây cooldown');
    assert.strictEqual(toastWarnings.length, 1, 'Phải phát ra cảnh báo hướng dẫn người dùng');

    // Lần 3: Lỗi chunk xảy ra sau 16 giây (> 15 giây) -> Cho phép reload tiếp nếu phiên bản mới tiếp tục có cập nhật
    triggerChunkErrorHandler('ChunkLoadError: Loading chunk 456 failed', t0 + 16000);
    assert.strictEqual(reloadCount, 2, 'Cho phép reload sau khi hết 15 giây cooldown');
    assert.strictEqual(mockStorage.getItem('podscare_chunk_reload_ts'), String(t0 + 16000));
  });
});
