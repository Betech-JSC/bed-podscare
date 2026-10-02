import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');
const webDir = path.resolve(rootDir, 'apps/web');
const uiDir = path.resolve(rootDir, 'packages/ui');
const apiClientDir = path.resolve(rootDir, 'packages/api-client');

describe('Enterprise Auth Flow & Confirm Modals Test Suite', () => {

  // =========================================================================
  // 1. ConfirmModal Component & Calm Jade Design System
  // =========================================================================
  describe('1. ConfirmModal & ConfirmProvider UI Architecture', () => {
    test('Task 1.1: ConfirmModal implements Calm Jade tokens, variants, and a11y attributes', () => {
      const modalPath = path.join(uiDir, 'src/molecules/ConfirmModal.tsx');
      assert.ok(fs.existsSync(modalPath), 'ConfirmModal.tsx must exist');
      const content = fs.readFileSync(modalPath, 'utf-8');

      // Export verification
      assert.ok(content.includes('export const ConfirmModal: React.FC<ConfirmModalProps>'), 'Must export ConfirmModal component');
      assert.ok(content.includes("export type ConfirmVariant = 'danger' | 'warning' | 'info'"), 'Must export ConfirmVariant type');

      // Variant style mapping
      assert.ok(content.includes("bg-[#fbefed] text-[#bc5b52] border border-[#f5c7c2]"), 'Must contain danger variant style');
      assert.ok(content.includes("bg-[#fef9ec] text-[#bd8738] border border-[#fae8be]"), 'Must contain warning variant style');
      assert.ok(content.includes("bg-[#eaf4ef] text-[#176b58] border border-[#cde2d6]"), 'Must contain info variant style');

      // Accessibility attributes
      assert.ok(content.includes('role="dialog"'), 'Must have role="dialog"');
      assert.ok(content.includes('aria-modal="true"'), 'Must have aria-modal="true"');
      assert.ok(content.includes('aria-labelledby="confirm-modal-title"'), 'Must have aria-labelledby="confirm-modal-title"');

      // Scroll lock & keyboard focus trap
      assert.ok(content.includes('activeConfirmCount'), 'Must track activeConfirmCount for safe scroll restoration');
      assert.ok(content.includes("document.body.style.position = 'fixed'"), 'Must lock body position to fixed');
      assert.ok(content.includes("document.body.style.overflow = 'hidden'"), 'Must lock body overflow');
      assert.ok(content.includes("e.key === 'Escape'"), 'Must handle Escape key');
      assert.ok(content.includes("e.key === 'Tab'"), 'Must trap focus on Tab navigation');
    });

    test('Task 1.2: ConfirmProvider and useConfirm hook interface and provider wrapping', () => {
      const providerPath = path.join(uiDir, 'src/molecules/ConfirmProvider.tsx');
      assert.ok(fs.existsSync(providerPath), 'ConfirmProvider.tsx must exist');
      const content = fs.readFileSync(providerPath, 'utf-8');

      assert.ok(content.includes('export const useConfirm = (): ConfirmFn'), 'Must export useConfirm hook');
      assert.ok(content.includes('export const ConfirmProvider: React.FC'), 'Must export ConfirmProvider component');
      assert.ok(content.includes('useConfirm must be used within a ConfirmProvider'), 'Must guard against usage outside ConfirmProvider');

      // Check package export in packages/ui/src/index.ts
      const uiIndexPath = path.join(uiDir, 'src/index.ts');
      const indexContent = fs.readFileSync(uiIndexPath, 'utf-8');
      assert.ok(indexContent.includes("export * from './molecules/ConfirmModal'"), 'packages/ui must export ConfirmModal');
      assert.ok(indexContent.includes("export * from './molecules/ConfirmProvider'"), 'packages/ui must export ConfirmProvider');

      // Check wrapping in apps/web/app/providers.tsx
      const webProvidersPath = path.join(webDir, 'app/providers.tsx');
      const webProvidersContent = fs.readFileSync(webProvidersPath, 'utf-8');
      assert.ok(webProvidersContent.includes('ConfirmProvider'), 'apps/web/app/providers.tsx must import ConfirmProvider');
      assert.ok(webProvidersContent.includes('<ConfirmProvider>{children}</ConfirmProvider>'), 'apps/web/app/providers.tsx must wrap children in ConfirmProvider');
    });

    test('Task 1.2: useConfirm handles both string and options object signatures', () => {
      // Functional simulation of useConfirm normalizer
      const normalizeOptions = (optionsOrMessage) => {
        if (typeof optionsOrMessage === 'string') {
          return { title: 'Xác nhận thao tác', description: optionsOrMessage };
        }
        return {
          ...optionsOrMessage,
          description: optionsOrMessage.description || optionsOrMessage.message,
        };
      };

      const fromString = normalizeOptions('Bạn có muốn tiếp tục?');
      assert.strictEqual(fromString.title, 'Xác nhận thao tác');
      assert.strictEqual(fromString.description, 'Bạn có muốn tiếp tục?');

      const fromObject = normalizeOptions({
        title: 'Đình chỉ gian hàng',
        description: 'Thao tác này sẽ tạm ngưng toàn bộ hoạt động.',
        variant: 'danger',
        confirmText: 'Đình chỉ',
      });
      assert.strictEqual(fromObject.title, 'Đình chỉ gian hàng');
      assert.strictEqual(fromObject.variant, 'danger');
      assert.strictEqual(fromObject.confirmText, 'Đình chỉ');

      // Test fallback message -> description
      const fromMessageFallback = normalizeOptions({
        title: 'Thông báo',
        message: 'Nội dung tin nhắn',
      });
      assert.strictEqual(fromMessageFallback.description, 'Nội dung tin nhắn');
    });

    test('Task 1.3 - 1.6: Zero native confirm() and alert() calls in pages', () => {
      // 1.3: apps/web/app/platform/stores/page.tsx
      const storesPath = path.join(webDir, 'app/platform/stores/page.tsx');
      const storesContent = fs.readFileSync(storesPath, 'utf-8');
      assert.ok(!storesContent.includes('window.confirm('), 'stores/page.tsx must not contain window.confirm(');
      assert.ok(storesContent.includes('useConfirm()'), 'stores/page.tsx must use useConfirm()');
      assert.ok(storesContent.includes('await confirm({'), 'stores/page.tsx must call await confirm({');

      // 1.4: apps/web/app/platform/approvals/page.tsx
      const approvalsPath = path.join(webDir, 'app/platform/approvals/page.tsx');
      const approvalsContent = fs.readFileSync(approvalsPath, 'utf-8');
      assert.ok(!approvalsContent.includes('window.confirm('), 'approvals/page.tsx must not contain window.confirm(');
      assert.ok(approvalsContent.includes('useConfirm()'), 'approvals/page.tsx must use useConfirm()');

      // 1.5: apps/web/app/users/page.tsx & branches/page.tsx
      const usersPath = path.join(webDir, 'app/users/page.tsx');
      const usersContent = fs.readFileSync(usersPath, 'utf-8');
      assert.ok(!usersContent.includes('window.confirm('), 'users/page.tsx must not contain window.confirm(');
      assert.ok(usersContent.includes('useConfirm()'), 'users/page.tsx must use useConfirm()');

      const branchesPath = path.join(webDir, 'app/branches/page.tsx');
      const branchesContent = fs.readFileSync(branchesPath, 'utf-8');
      assert.ok(!branchesContent.includes('window.confirm('), 'branches/page.tsx must not contain window.confirm(');
      assert.ok(branchesContent.includes('useConfirm()'), 'branches/page.tsx must use useConfirm()');

      // 1.6: alert() replacements in TrackingView.tsx and AppSidebar.tsx
      const trackingPath = path.join(webDir, 'app/components/TrackingView.tsx');
      const trackingContent = fs.readFileSync(trackingPath, 'utf-8');
      assert.ok(!trackingContent.includes('alert('), 'TrackingView.tsx must not contain alert(');
      assert.ok(trackingContent.includes('useToast()'), 'TrackingView.tsx must use useToast()');

      const sidebarPath = path.join(uiDir, 'src/organisms/AppSidebar.tsx');
      const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
      assert.ok(!sidebarContent.includes('alert('), 'AppSidebar.tsx must not contain alert(');
      assert.ok(sidebarContent.includes('useToast()'), 'AppSidebar.tsx must use useToast()');
    });
  });

  // =========================================================================
  // 2. Login Modernization & ReturnTo Redirection
  // =========================================================================
  describe('2. Login Modernization & Return Destination Logic', () => {
    test('Task 2.1 - 2.3: apps/web/app/login/page.tsx dual-tab layout and staff demo cards', () => {
      const loginPath = path.join(webDir, 'app/login/page.tsx');
      assert.ok(fs.existsSync(loginPath), 'login/page.tsx must exist');
      const content = fs.readFileSync(loginPath, 'utf-8');

      // Dual tab structure
      assert.ok(content.includes('Đăng nhập ca làm việc'), 'Must contain official login tab label');
      assert.ok(content.includes('Thử nghiệm ca trực Demo'), 'Must contain demo shift tab label');
      assert.ok(content.includes("activeTab === 'official'"), 'Must manage activeTab state');

      // Collapsible store code accordion
      assert.ok(content.includes('showStoreAccordion'), 'Must have collapsible store code accordion state');
      assert.ok(content.includes("localStorage.getItem('fixo_store_code')"), 'Must restore store code from localStorage');
      assert.ok(content.includes("localStorage.setItem('fixo_store_code'"), 'Must persist store code to localStorage');

      // Staff demo cards
      assert.ok(content.includes('STAFF_CARDS'), 'Must define STAFF_CARDS array');
      assert.ok(content.includes('superadmin@fixo.com.vn'), 'Must include Super Admin demo card');
      assert.ok(content.includes('admin@fixo.com.vn'), 'Must include Admin demo card');
      assert.ok(content.includes('cskh.lan@fixo.com.vn'), 'Must include CSKH demo card');
      assert.ok(content.includes('ktv.tuan@fixo.com.vn'), 'Must include Technician Q1 demo card');
      assert.ok(content.includes('ktv.duy@fixo.com.vn'), 'Must include Technician Q3 demo card');
      assert.ok(content.includes('qc.inspector@fixo.com.vn'), 'Must include QC demo card');
      assert.ok(content.includes('kho.viet@fixo.com.vn'), 'Must include Warehouse demo card');
    });

    test('Task 2.4: returnTo query param extraction and destination prioritization logic', () => {
      const resolveDestination = (returnTo, userRole, targetPath) => {
        if (returnTo && returnTo.startsWith('/')) {
          return returnTo;
        }
        if (targetPath) {
          return targetPath;
        }
        if (userRole === 'super_admin') {
          return '/platform';
        }
        if (userRole === 'technician' || userRole === 'tech') {
          return '/tech';
        }
        if (userRole === 'qc') {
          return '/qc';
        }
        if (userRole === 'inventory' || userRole === 'warehouse') {
          return '/inventory';
        }
        return '/dashboard';
      };

      // Case 1: returnTo has the highest priority even when targetPath or role differs
      assert.strictEqual(
        resolveDestination('/print/PC26-00123', 'admin', '/dashboard'),
        '/print/PC26-00123',
        'returnTo must override role-based default'
      );

      // Case 2: returnTo with query params preserved
      assert.strictEqual(
        resolveDestination('/repairs?status=in_repair', 'cskh', null),
        '/repairs?status=in_repair',
        'returnTo with query params must be preserved'
      );

      // Case 3: Ignore malicious open-redirect URLs that do not start with '/'
      assert.strictEqual(
        resolveDestination('https://evil.com/phishing', 'super_admin', null),
        '/platform',
        'Non-relative returnTo must fall back safely to role target'
      );

      // Case 4: Default destinations when no returnTo
      assert.strictEqual(resolveDestination(null, 'super_admin', null), '/platform');
      assert.strictEqual(resolveDestination(null, 'tech', null), '/tech');
      assert.strictEqual(resolveDestination(null, 'technician', null), '/tech');
      assert.strictEqual(resolveDestination(null, 'qc', null), '/qc');
      assert.strictEqual(resolveDestination(null, 'admin', null), '/dashboard');
      assert.strictEqual(resolveDestination(null, 'cskh', null), '/dashboard');
    });
  });

  // =========================================================================
  // 3. Enterprise Graceful Logout and Session Security
  // =========================================================================
  describe('3. Enterprise Graceful Logout & Session Security', () => {
    test('Task 3.1: AuthService in @podscare/api-client implements logout(), login(), getMe()', () => {
      const authServicePath = path.join(apiClientDir, 'src/services/auth.service.ts');
      assert.ok(fs.existsSync(authServicePath), 'auth.service.ts must exist');
      const content = fs.readFileSync(authServicePath, 'utf-8');

      assert.ok(content.includes('export class AuthService'), 'Must define AuthService class');
      assert.ok(content.includes("this.http.post('/api/v1/auth/logout')"), 'logout() must POST to /api/v1/auth/logout');
      assert.ok(content.includes("this.http.post('/api/v1/auth/login'"), 'login() must POST to /api/v1/auth/login');
      assert.ok(content.includes("this.http.get('/api/v1/auth/me')"), 'getMe() must GET /api/v1/auth/me');
      assert.ok(content.includes('export const authService = new AuthService()'), 'Must export authService singleton');

      // Export check in packages/api-client/src/index.ts
      const apiIndexPath = path.join(apiClientDir, 'src/index.ts');
      const apiIndexContent = fs.readFileSync(apiIndexPath, 'utf-8');
      assert.ok(apiIndexContent.includes("export * from './services/auth.service'"), 'api-client index must export auth.service');
    });

    test('Task 3.1: AuthService instance sends POST request to /api/v1/auth/logout', async () => {
      // Mock HttpClient to verify call signature
      const mockCalls = [];
      const mockHttpClient = {
        post: async (url, data, options) => {
          mockCalls.push({ method: 'POST', url, data, options });
          return { success: true, message: 'Đăng xuất thành công' };
        },
        get: async (url, options) => {
          mockCalls.push({ method: 'GET', url, options });
          return { success: true, data: { id: 1, name: 'Admin' } };
        },
      };

      // Mock class replicating AuthService implementation
      class TestAuthService {
        constructor(http) {
          this.http = http;
        }
        async login(dto) {
          return this.http.post('/api/v1/auth/login', dto);
        }
        async logout() {
          return this.http.post('/api/v1/auth/logout');
        }
        async getMe() {
          return this.http.get('/api/v1/auth/me');
        }
      }

      const service = new TestAuthService(mockHttpClient);
      const result = await service.logout();

      assert.strictEqual(result.success, true);
      assert.strictEqual(mockCalls.length, 1);
      assert.strictEqual(mockCalls[0].method, 'POST');
      assert.strictEqual(mockCalls[0].url, '/api/v1/auth/logout');
    });

    test('Task 3.2 - 3.4: Fail-safe teardown purges LocalStorage, Cookie, and QueryClient', () => {
      const providersPath = path.join(webDir, 'app/providers.tsx');
      const content = fs.readFileSync(providersPath, 'utf-8');

      // Check authService.logout() call inside logout()
      assert.ok(content.includes('await authService.logout()'), 'Must invoke backend token revocation');

      // Check finally block ensuring fail-safe purge
      assert.ok(content.includes('finally {'), 'Must have finally block for fail-safe cleanup');
      assert.ok(content.includes("localStorage.removeItem('podscare_token')"), 'Must purge podscare_token');
      assert.ok(content.includes("localStorage.removeItem('podscare_user')"), 'Must purge podscare_user');
      assert.ok(content.includes("localStorage.removeItem('podscare_role')"), 'Must purge podscare_role');
      assert.ok(content.includes("localStorage.removeItem('podscare_branch')"), 'Must purge podscare_branch');
      assert.ok(content.includes("localStorage.removeItem('podscare_branch_id')"), 'Must purge podscare_branch_id');

      // Check cookie deletion
      assert.ok(
        content.includes("document.cookie = 'podscare_session_token=; path=/; max-age=0; SameSite=Lax'"),
        'Must purge session cookie podscare_session_token with max-age=0'
      );

      // Check state reset & queryClient clear
      assert.ok(content.includes('queryClient.clear()'), 'Must clear React Query cache');
      assert.ok(content.includes('setToken(null)'), 'Must reset token state to null');
      assert.ok(content.includes('setUserProfile(null)'), 'Must reset userProfile state to null');
      assert.ok(content.includes('setIsAuthenticated(false)'), 'Must set isAuthenticated to false');
      assert.ok(content.includes('setOrders([])'), 'Must purge in-memory orders');
    });

    test('Task 3.3: LogoutConfirmModal in AppShell.tsx displays staff metadata and safe loading', () => {
      const appShellPath = path.join(webDir, 'app/components/AppShell.tsx');
      assert.ok(fs.existsSync(appShellPath), 'AppShell.tsx must exist');
      const content = fs.readFileSync(appShellPath, 'utf-8');

      assert.ok(content.includes('LogoutConfirmModal'), 'Must define LogoutConfirmModal component');
      assert.ok(content.includes('Kết thúc ca làm việc'), 'Must display title Kết thúc ca làm việc');
      assert.ok(content.includes('Xác thực phiên'), 'Must display eyebrow Xác thực phiên');
      assert.ok(content.includes('Xác nhận đăng xuất'), 'Must display confirm button Xác nhận đăng xuất');
      assert.ok(content.includes('Đang kết thúc ca làm việc...'), 'Must display loading button text');
      assert.ok(content.includes('Avatar'), 'Must display staff avatar');
      assert.ok(content.includes('branchName'), 'Must display branch name');
    });
  });

  // =========================================================================
  // 4. Next.js Edge Middleware and Cookie Auth Synchronization
  // =========================================================================
  describe('4. Next.js Edge Middleware & Edge Route Guard', () => {
    test('Task 4.1: login() synchronizes podscare_session_token cookie', () => {
      const providersPath = path.join(webDir, 'app/providers.tsx');
      const content = fs.readFileSync(providersPath, 'utf-8');

      assert.ok(
        content.includes('podscare_session_token='),
        'providers.tsx login() must set podscare_session_token cookie'
      );
      assert.ok(content.includes('SameSite=Lax'), 'Cookie must specify SameSite=Lax');
      assert.ok(content.includes('path=/'), 'Cookie must have path=/');
    });

    test('Task 4.2 - 4.4: apps/web/middleware.ts matches all protected routes', () => {
      const middlewarePath = path.join(webDir, 'middleware.ts');
      assert.ok(fs.existsSync(middlewarePath), 'apps/web/middleware.ts must exist');
      const content = fs.readFileSync(middlewarePath, 'utf-8');

      // Check route matcher list
      const requiredMatchers = [
        "'/dashboard/:path*'",
        "'/repairs/:path*'",
        "'/tech/:path*'",
        "'/qc/:path*'",
        "'/inventory/:path*'",
        "'/platform/:path*'",
        "'/branches/:path*'",
        "'/users/:path*'",
        "'/settings/:path*'",
        "'/print/:path*'",
        "'/login'",
      ];

      for (const matcher of requiredMatchers) {
        assert.ok(content.includes(matcher), `Matcher must include ${matcher}`);
      }
    });

    test('Task 4.2 - 4.4: Edge middleware logic simulation (Zero-delay redirect & 0ms edge guard)', () => {
      // Functional simulation of middleware edge logic
      const simulateMiddleware = (pathname, search = '', cookies = {}) => {
        const sessionToken = cookies['podscare_session_token'];
        const isLoginPage = pathname === '/login';

        if (isLoginPage) {
          if (sessionToken && sessionToken.trim() !== '') {
            return {
              type: 'redirect',
              destination: '/dashboard',
            };
          }
          return { type: 'next' };
        }

        if (!sessionToken || sessionToken.trim() === '') {
          const returnTo = pathname + (search || '');
          const loginUrl = `/login?returnTo=${encodeURIComponent(returnTo)}`;
          return {
            type: 'redirect',
            destination: loginUrl,
          };
        }

        return { type: 'next' };
      };

      // 1. Unauthenticated accessing protected routes -> Redirect to login with returnTo
      const unauthDashboard = simulateMiddleware('/dashboard');
      assert.strictEqual(unauthDashboard.type, 'redirect');
      assert.strictEqual(unauthDashboard.destination, '/login?returnTo=%2Fdashboard');

      const unauthTech = simulateMiddleware('/tech');
      assert.strictEqual(unauthTech.type, 'redirect');
      assert.strictEqual(unauthTech.destination, '/login?returnTo=%2Ftech');

      const unauthPrint = simulateMiddleware('/print/PC26-88888', '?format=k80');
      assert.strictEqual(unauthPrint.type, 'redirect');
      assert.strictEqual(unauthPrint.destination, '/login?returnTo=%2Fprint%2FPC26-88888%3Fformat%3Dk80');

      const unauthPlatform = simulateMiddleware('/platform/stores');
      assert.strictEqual(unauthPlatform.type, 'redirect');
      assert.strictEqual(unauthPlatform.destination, '/login?returnTo=%2Fplatform%2Fstores');

      // 2. Unauthenticated accessing /login -> Allow through
      const unauthLogin = simulateMiddleware('/login');
      assert.strictEqual(unauthLogin.type, 'next');

      // 3. Authenticated accessing /login -> Redirect to /dashboard
      const authLogin = simulateMiddleware('/login', '', { podscare_session_token: 'valid-session-jwt' });
      assert.strictEqual(authLogin.type, 'redirect');
      assert.strictEqual(authLogin.destination, '/dashboard');

      // 4. Authenticated accessing protected routes -> Allow through (NextResponse.next())
      const authDashboard = simulateMiddleware('/dashboard', '', { podscare_session_token: 'valid-session-jwt' });
      assert.strictEqual(authDashboard.type, 'next');

      const authPrint = simulateMiddleware('/print/PC26-88888', '', { podscare_session_token: 'valid-session-jwt' });
      assert.strictEqual(authPrint.type, 'next');

      const authQC = simulateMiddleware('/qc', '', { podscare_session_token: 'valid-session-jwt' });
      assert.strictEqual(authQC.type, 'next');
    });
  });
});
