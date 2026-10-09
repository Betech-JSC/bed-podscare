import assert from 'node:assert';
import test, { describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Auto Cache & Service Worker Purge Verification', () => {
  const layoutPath = path.resolve(__dirname, '../app/layout.tsx');
  const vercelConfigPath = path.resolve(__dirname, '../vercel.json');
  const nextConfigPath = path.resolve(__dirname, '../next.config.mjs');

  const layoutContent = fs.readFileSync(layoutPath, 'utf-8');
  const vercelConfigContent = fs.readFileSync(vercelConfigPath, 'utf-8');
  const nextConfigContent = fs.readFileSync(nextConfigPath, 'utf-8');

  test('1. RootLayout render script tự động dọn dẹp cache và service worker trong <head>', () => {
    // 1.1 Kiểm tra script tồn tại trong <head>
    assert.ok(
      layoutContent.includes('<head>') && layoutContent.includes('</head>'),
      'layout.tsx phải có thẻ <head>'
    );
    assert.ok(
      layoutContent.includes('BUILD_STAMP'),
      'layout.tsx phải có BUILD_STAMP để kiểm soát phiên bản client'
    );

    // 1.2 Kiểm tra logic hủy đăng ký Service Worker ngầm
    assert.ok(
      layoutContent.includes("if ('serviceWorker' in navigator)"),
      'layout.tsx phải kiểm tra serviceWorker trong navigator'
    );
    assert.ok(
      layoutContent.includes('navigator.serviceWorker.getRegistrations()'),
      'layout.tsx phải lấy danh sách serviceWorker registrations'
    );
    assert.ok(
      layoutContent.includes('regs[i].unregister()'),
      'layout.tsx phải gọi unregister() cho từng service worker'
    );

    // 1.3 Kiểm tra logic xoá sạch CacheStorage (window.caches)
    assert.ok(
      layoutContent.includes("if ('caches' in window)"),
      'layout.tsx phải kiểm tra caches trong window'
    );
    assert.ok(
      layoutContent.includes('caches.keys()') && layoutContent.includes('caches.delete(names[i])'),
      'layout.tsx phải xoá toàn bộ caches ngầm'
    );

    // 1.4 Kiểm tra dọn dẹp localStorage và reload an toàn
    assert.ok(
      layoutContent.includes('fixo_client_ver'),
      'layout.tsx phải lưu và kiểm tra fixo_client_ver'
    );
    assert.ok(
      layoutContent.includes('podscare_branches') &&
      layoutContent.includes('podscare_device_profiles') &&
      layoutContent.includes('podscare_categories'),
      'layout.tsx phải xoá các stale cache keys đã chỉ định trong localStorage'
    );
    assert.ok(
      layoutContent.includes('window.location.reload()'),
      'layout.tsx phải reload trang khi phát hiện phiên bản cũ'
    );

    // 1.5 Kiểm tra meta tags chống cache
    assert.ok(
      layoutContent.includes('httpEquiv="Cache-Control"') &&
      layoutContent.includes('content="no-store, no-cache, must-revalidate"'),
      'layout.tsx phải có meta Cache-Control no-store'
    );
    assert.ok(
      layoutContent.includes('httpEquiv="Pragma"') &&
      layoutContent.includes('content="no-cache"'),
      'layout.tsx phải có meta Pragma no-cache'
    );
  });

  test('2. vercel.json cấu hình headers chống cache trên Vercel Edge Network', () => {
    const vercelJson = JSON.parse(vercelConfigContent);
    assert.ok(Array.isArray(vercelJson.headers), 'vercel.json phải có mảng headers');

    // Rule chống cache cho HTML & tài nguyên động
    const dynamicHeaderRule = vercelJson.headers.find(h =>
      h.source.includes('?!_next/static')
    );
    assert.ok(dynamicHeaderRule, 'vercel.json phải có rule headers cho trang động / HTML');

    const cacheControlHeader = dynamicHeaderRule.headers.find(
      item => item.key === 'Cache-Control'
    );
    assert.ok(cacheControlHeader, 'rule trang động phải có header Cache-Control');
    assert.strictEqual(
      cacheControlHeader.value,
      'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
    );

    const pragmaHeader = dynamicHeaderRule.headers.find(item => item.key === 'Pragma');
    assert.ok(pragmaHeader && pragmaHeader.value === 'no-cache', 'rule trang động phải có Pragma: no-cache');

    const expiresHeader = dynamicHeaderRule.headers.find(item => item.key === 'Expires');
    assert.ok(expiresHeader && expiresHeader.value === '0', 'rule trang động phải có Expires: 0');

    // Rule cho file tĩnh có hash
    const staticHeaderRule = vercelJson.headers.find(h => h.source.startsWith('/_next/static'));
    assert.ok(staticHeaderRule, 'vercel.json phải có rule headers cho static chunk');
    const staticCacheControl = staticHeaderRule.headers.find(item => item.key === 'Cache-Control');
    assert.ok(
      staticCacheControl && staticCacheControl.value.includes('immutable'),
      'static chunk phải có Cache-Control immutable'
    );
  });

  test('3. next.config.mjs có generateBuildId và headers chống cache', async () => {
    // 3.1 Kiểm tra generateBuildId
    assert.ok(
      nextConfigContent.includes('generateBuildId:'),
      'next.config.mjs phải cấu hình generateBuildId'
    );

    // 3.2 Dynamic import nextConfig để kiểm tra runtime headers & buildId
    const nextConfigModule = await import(nextConfigPath);
    const nextConfig = nextConfigModule.default;

    assert.strictEqual(typeof nextConfig.generateBuildId, 'function');
    const buildId = await nextConfig.generateBuildId();
    assert.ok(typeof buildId === 'string' && buildId.startsWith('fixo-build-'));

    assert.strictEqual(typeof nextConfig.headers, 'function');
    const headersList = await nextConfig.headers();
    assert.ok(Array.isArray(headersList) && headersList.length >= 2);

    const htmlRule = headersList.find(h => h.source.includes('?!_next/static'));
    assert.ok(htmlRule, 'nextConfig headers phải có rule cho HTML');
    const ccHeader = htmlRule.headers.find(item => item.key === 'Cache-Control');
    assert.strictEqual(
      ccHeader.value,
      'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
    );
  });
});
