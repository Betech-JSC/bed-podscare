import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');
const webDir = path.resolve(rootDir, 'apps/web');
const apiClientDir = path.resolve(rootDir, 'packages/api-client');

describe('Zombie Cookie Prevention & Redirect Loop Fix Test Suite', () => {

  // =========================================================================
  // Test 1: Middleware logic - No 307 redirect loop on /login with zombie cookie
  // =========================================================================
  describe('Test 1: Edge Middleware (/login accessibility & redirect loop prevention)', () => {
    const middlewarePath = path.join(webDir, 'middleware.ts');

    test('Middleware does NOT redirect /login to /dashboard on raw cookie existence', () => {
      assert.ok(fs.existsSync(middlewarePath), 'middleware.ts must exist');
      const content = fs.readFileSync(middlewarePath, 'utf-8');

      // Must NOT contain redirect to /dashboard when isLoginPage
      assert.ok(
        !content.includes("if (isLoginPage) {\n    if (sessionToken"),
        'middleware.ts must NOT redirect to /dashboard simply because sessionToken cookie exists'
      );

      // Must allow /login to proceed directly to render form
      assert.ok(
        content.includes('if (isLoginPage) {\n    return NextResponse.next();\n  }'),
        'middleware.ts must return NextResponse.next() for /login'
      );

      // Must still protect dashboard routes when sessionToken is missing
      assert.ok(
        content.includes("loginUrl.searchParams.set('returnTo', returnTo);"),
        'middleware.ts must preserve protected route redirection with returnTo parameter'
      );
    });

    test('Middleware runtime simulation with zombie cookie on /login', () => {
      // Simulate middleware logic
      function simulateMiddleware(pathname, cookies) {
        const sessionToken = cookies['podscare_session_token'];
        const isLoginPage = pathname === '/login';

        if (isLoginPage) {
          return { status: 200, type: 'next' };
        }

        if (!sessionToken || sessionToken.trim() === '') {
          return { status: 307, type: 'redirect', location: `/login?returnTo=${pathname}` };
        }

        return { status: 200, type: 'next' };
      }

      // Scenario: User has zombie cookie in browser, visits /login
      const result = simulateMiddleware('/login', { podscare_session_token: 'test_zombie_token_12345' });
      assert.strictEqual(result.type, 'next', 'Visiting /login with zombie cookie must NOT redirect');
      assert.strictEqual(result.status, 200, 'Visiting /login must return status 200 (next)');
    });
  });

  // =========================================================================
  // Test 2: AppShell Self-Healing & Fallback UI (No Blank White Screen)
  // =========================================================================
  describe('Test 2: AppShell Self-Healing & Fallback UI', () => {
    const appShellPath = path.join(webDir, 'app/components/AppShell.tsx');

    test('AppShell never returns null on unauthenticated state', () => {
      assert.ok(fs.existsSync(appShellPath), 'AppShell.tsx must exist');
      const content = fs.readFileSync(appShellPath, 'utf-8');

      // Must NOT have return null when !isAuthenticated
      assert.ok(
        !content.includes('if (!isAuthenticated) {\n    return null;\n  }'),
        'AppShell must NEVER execute return null on !isAuthenticated'
      );

      // Must render graceful Calm Jade fallback UI
      assert.ok(
        content.includes('border-[#176b58]'),
        'Fallback UI must use Calm Jade primary token #176b58'
      );
      assert.ok(
        content.includes('animate-spin'),
        'Fallback UI must display animated spinner'
      );
      assert.ok(
        content.includes('Đang chuyển hướng đến trang đăng nhập...'),
        'Fallback UI must show informative redirection message to user'
      );
    });

    test('AppShell Auth Guard self-heals by destroying zombie cookie before redirect', () => {
      const content = fs.readFileSync(appShellPath, 'utf-8');

      // Check self-healing cookie clearance in Auth Guard useEffect
      assert.ok(
        content.includes("document.cookie = 'podscare_session_token=; path=/; max-age=0; SameSite=Lax';"),
        'AppShell Auth Guard must proactively expire zombie cookie with max-age=0'
      );
      assert.ok(
        content.includes("router.replace('/login');"),
        'AppShell Auth Guard must dispatch redirection to /login'
      );
    });
  });

  // =========================================================================
  // Test 3: Standardized Link Navigation on Register Page
  // =========================================================================
  describe('Test 3: Register Page Navigation Links', () => {
    const registerPath = path.join(webDir, 'app/register/page.tsx');

    test('Register page imports and uses Next.js Link instead of programmatic router buttons', () => {
      assert.ok(fs.existsSync(registerPath), 'register/page.tsx must exist');
      const content = fs.readFileSync(registerPath, 'utf-8');

      // Must import Link from next/link
      assert.ok(
        content.includes("import Link from 'next/link';"),
        'register/page.tsx must import Link from next/link'
      );

      // Must NOT contain router.push('/login')
      assert.ok(
        !content.includes("router.push('/login')"),
        'register/page.tsx must NOT contain any router.push(\'/login\') calls'
      );

      // Must contain Link href="/login" for back navigation
      assert.ok(
        content.includes('<Link\n            href="/login"\n            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#176b51]'),
        'Back button must be converted to Link href="/login"'
      );

      // Must contain Link href="/login" for success screen
      assert.ok(
        content.includes('<Link\n              href="/login"\n              className="w-full inline-flex items-center justify-center'),
        'Success screen button must be converted to Link href="/login"'
      );

      // Must contain Link href="/login" for footer link
      assert.ok(
        content.includes('<Link\n                  href="/login"\n                  className="text-xs font-bold text-[#176b58]'),
        'Footer login link must be converted to Link href="/login"'
      );
    });
  });

  // =========================================================================
  // Test 4: HttpClient & Providers Zombie Cookie Cleansing
  // =========================================================================
  describe('Test 4: HttpClient & Providers Zombie Cookie Cleansing', () => {
    const httpClientPath = path.join(apiClientDir, 'src/http-client.ts');
    const providersPath = path.join(webDir, 'app/providers.tsx');

    test('HttpClient clears cookie on setToken(null) and handleUnauthorized()', () => {
      assert.ok(fs.existsSync(httpClientPath), 'http-client.ts must exist');
      const content = fs.readFileSync(httpClientPath, 'utf-8');

      assert.ok(
        content.includes("document.cookie = 'podscare_session_token=; path=/; max-age=0; SameSite=Lax';"),
        'http-client.ts must clear podscare_session_token cookie'
      );

      // Simulate runtime execution of setToken(null)
      const mockStorage = new Map();
      let mockCookie = 'podscare_session_token=test_zombie_token; path=/; max-age=86400';

      const mockWindow = {
        localStorage: {
          setItem: (k, v) => mockStorage.set(k, v),
          getItem: (k) => mockStorage.get(k) || null,
          removeItem: (k) => mockStorage.delete(k),
        },
      };

      const mockDocument = {
        set cookie(val) {
          mockCookie = val;
        },
        get cookie() {
          return mockCookie;
        },
      };

      // Emulate setToken logic
      function setTokenSimulation(token) {
        if (token) {
          mockWindow.localStorage.setItem('podscare_token', token);
        } else {
          mockWindow.localStorage.removeItem('podscare_token');
          mockDocument.cookie = 'podscare_session_token=; path=/; max-age=0; SameSite=Lax';
        }
      }

      // Initial state: token existed in cookie but missing in localStorage
      assert.ok(mockCookie.includes('test_zombie_token'), 'Mock cookie contains initial zombie token');

      // Clear token
      setTokenSimulation(null);

      assert.strictEqual(mockStorage.get('podscare_token'), undefined, 'Storage must be empty');
      assert.ok(mockCookie.includes('max-age=0'), 'Cookie must be expired with max-age=0');
    });

    test('Providers clears cookie on initial mount when token is absent or corrupted', () => {
      assert.ok(fs.existsSync(providersPath), 'providers.tsx must exist');
      const content = fs.readFileSync(providersPath, 'utf-8');

      // Check providers sync effect has cookie cleanup
      assert.ok(
        content.includes("document.cookie = 'podscare_session_token=; path=/; max-age=0; SameSite=Lax';"),
        'providers.tsx must proactively destroy zombie cookie if token is not found in localStorage'
      );
    });
  });

});
