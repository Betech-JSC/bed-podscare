import assert from 'node:assert/strict';
import test, { describe, beforeEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ONBOARDING_ROLE_ORDER,
  ONBOARDING_ROLE_LABELS,
  normalizeOnboardingRole,
  resolveOnboardingTenantId,
} from '../app/components/onboarding/types.ts';
import {
  ONBOARDING_STORAGE_PREFIX,
  DEFAULT_ONBOARDING_STATE,
  buildOnboardingStorageKey,
  clearOnboardingMemoryStore,
  getOnboardingState,
  markOnboardingCompleted,
  markOnboardingDismissed,
  resetOnboardingTour,
  toggleChecklistStep,
  dismissChecklist,
  setChecklistCollapsed,
  markChangelogVersionSeen,
  shouldAutoOpenOnboarding,
} from '../app/components/onboarding/onboardingStorage.ts';
import {
  ONBOARDING_ROLE_CONFIGS,
  ADMIN_SETUP_CHECKLIST_STEPS,
  getOnboardingRoleConfig,
} from '../app/components/onboarding/onboardingData.ts';
import {
  CURRENT_APP_VERSION,
  CHANGELOG_RELEASES,
  PRODUCT_ROADMAP_ITEMS,
  ROADMAP_STATUS_ORDER,
  ROADMAP_STATUS_META,
  filterChangelogReleases,
  getRoadmapByStatus,
} from '../app/changelog/changelogData.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(__dirname, '../../..');

const EMOJI_REGEX =
  /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;

describe('OpenSpec: user-onboarding-and-system-changelog Comprehensive Verification', () => {
  beforeEach(() => {
    clearOnboardingMemoryStore();
  });

  test('1. Part 1 & 2: Role-Based Onboarding Data covers all 5 store roles (4 steps each) and strictly excludes super_admin', () => {
    assert.deepEqual(
      [...ONBOARDING_ROLE_ORDER],
      ['admin', 'cskh', 'tech', 'qc', 'inventory']
    );

    // Role normalization & super_admin exclusion
    assert.equal(normalizeOnboardingRole('admin'), 'admin');
    assert.equal(normalizeOnboardingRole('CSKH'), 'cskh');
    assert.equal(normalizeOnboardingRole('tech'), 'tech');
    assert.equal(normalizeOnboardingRole('technician'), 'tech');
    assert.equal(normalizeOnboardingRole('qc'), 'qc');
    assert.equal(normalizeOnboardingRole('inventory'), 'inventory');
    assert.equal(normalizeOnboardingRole('warehouse'), 'inventory');
    assert.equal(normalizeOnboardingRole('super_admin'), null);
    assert.equal(normalizeOnboardingRole(''), null);
    assert.equal(normalizeOnboardingRole(null), null);
    assert.equal(getOnboardingRoleConfig('super_admin'), null);

    // Each of the 5 store roles has 4 well-formed steps
    for (const roleKey of ONBOARDING_ROLE_ORDER) {
      const config = ONBOARDING_ROLE_CONFIGS[roleKey];
      assert.ok(config, `Missing onboarding config for role ${roleKey}`);
      assert.equal(config.roleKey, roleKey);
      assert.equal(config.roleLabel, ONBOARDING_ROLE_LABELS[roleKey]);
      assert.equal(
        config.steps.length,
        4,
        `Role ${roleKey} must have exactly 4 onboarding steps`
      );

      config.steps.forEach((step, idx) => {
        assert.equal(step.stepNumber, idx + 1);
        assert.ok(step.id.startsWith(`${roleKey}-step-`));
        assert.ok(step.title.length > 5);
        assert.ok(step.subtitle.length > 5);
        assert.ok(step.spotlightArea.length > 5);
        assert.ok(step.targetModuleId.length > 0);
        assert.ok(step.targetHref.startsWith('/'));
        assert.ok(step.description.length > 15);
        assert.ok(
          Array.isArray(step.actionPoints) && step.actionPoints.length >= 3
        );
        assert.ok(step.handoverNote.length > 10);
        assert.ok(step.guardrailNote.length > 10);
      });
    }
  });

  test('2. Part 1 & 2: Technician (tech) Onboarding strictly enforces RBAC workspace isolation (/tech) and hides financial figures', () => {
    const techConfig = ONBOARDING_ROLE_CONFIGS.tech;
    assert.equal(techConfig.primaryWorkspaceHref, '/tech');

    for (const step of techConfig.steps) {
      assert.equal(
        step.targetModuleId,
        'tech',
        `Tech step ${step.id} must only target 'tech' module`
      );
      assert.equal(
        step.targetHref,
        '/tech',
        `Tech step ${step.id} must only link to '/tech'`
      );

      const serializedStep = JSON.stringify(step).toLowerCase();
      assert.ok(
        !serializedStep.includes('/payments') &&
          !serializedStep.includes('/shifts') &&
          !serializedStep.includes('/subscription'),
        `Tech step ${step.id} must never link to financial routes`
      );
      assert.ok(
        !/\d+\.\d{3}\.000\s*đ/i.test(serializedStep),
        `Tech step ${step.id} must never contain monetary amounts`
      );
    }
  });

  test('3. Part 1 & 2: localStorage Engine isolates state by tenant_id + user_id and handles all tour/checklist/changelog transitions', () => {
    const keyStaffA = buildOnboardingStorageKey(101, 2);
    const keyStaffB = buildOnboardingStorageKey(101, 3);
    const keyOtherTenant = buildOnboardingStorageKey(202, 2);

    assert.equal(keyStaffA, `${ONBOARDING_STORAGE_PREFIX}_101_2`);
    assert.equal(keyStaffB, `${ONBOARDING_STORAGE_PREFIX}_101_3`);
    assert.equal(keyOtherTenant, `${ONBOARDING_STORAGE_PREFIX}_202_2`);
    assert.notEqual(keyStaffA, keyStaffB);
    assert.notEqual(keyStaffA, keyOtherTenant);

    // Resolve tenantId from UserProfile variants
    assert.equal(resolveOnboardingTenantId({ tenant_id: 88 }), 88);
    assert.equal(resolveOnboardingTenantId({ tenant: { id: 99 } }), 99);
    assert.equal(resolveOnboardingTenantId(null), null);

    // Initial state for Staff A (CSKH) and Staff B (Tech)
    const userA = { id: 2, role: 'cskh', tenant_id: 101 };
    const userB = { id: 3, role: 'technician', tenant_id: 101 };
    const superAdmin = { id: 1, role: 'super_admin', tenant_id: 101 };

    assert.equal(shouldAutoOpenOnboarding(userA), true);
    assert.equal(shouldAutoOpenOnboarding(userB), true);
    assert.equal(
      shouldAutoOpenOnboarding(superAdmin),
      false,
      'super_admin must never auto-open store onboarding'
    );

    // Staff A completes onboarding -> Staff A does not auto-open, Staff B still auto-opens
    const completedA = markOnboardingCompleted(101, 2, 'cskh');
    assert.equal(completedA.tourCompleted, true);
    assert.equal(completedA.tourDismissed, false);
    assert.equal(completedA.lastCompletedRole, 'cskh');
    assert.ok(typeof completedA.completedAt === 'string');

    assert.equal(shouldAutoOpenOnboarding(userA), false);
    assert.equal(
      shouldAutoOpenOnboarding(userB),
      true,
      'Staff B on the same POS browser must still see their own onboarding'
    );

    // Staff B dismisses onboarding -> Staff B no longer auto-opens
    const dismissedB = markOnboardingDismissed(101, 3, 'technician');
    assert.equal(dismissedB.tourDismissed, true);
    assert.equal(dismissedB.lastCompletedRole, 'tech');
    assert.equal(shouldAutoOpenOnboarding(userB), false);

    // Admin checklist step toggling, collapse, dismiss, and replay reset
    const step1 = toggleChecklistStep(101, 10, 'step-branding');
    assert.deepEqual(step1.completedChecklistStepIds, ['step-branding']);
    const step2 = toggleChecklistStep(101, 10, 'step-branches');
    assert.deepEqual(step2.completedChecklistStepIds, [
      'step-branding',
      'step-branches',
    ]);
    const step1Unchecked = toggleChecklistStep(101, 10, 'step-branding');
    assert.deepEqual(step1Unchecked.completedChecklistStepIds, [
      'step-branches',
    ]);

    const collapsedState = setChecklistCollapsed(101, 10, true);
    assert.equal(collapsedState.checklistCollapsed, true);

    const dismissedChecklist = dismissChecklist(101, 10);
    assert.equal(dismissedChecklist.checklistDismissed, true);

    markOnboardingDismissed(101, 10, 'admin');
    assert.equal(
      shouldAutoOpenOnboarding({ id: 10, role: 'admin', tenant_id: 101 }),
      false
    );

    // Replay reset restores both tour and checklist visibility while keeping completed steps
    const resetState = resetOnboardingTour(101, 10);
    assert.equal(resetState.tourCompleted, false);
    assert.equal(resetState.tourDismissed, false);
    assert.equal(resetState.checklistDismissed, false);
    assert.equal(resetState.checklistCollapsed, false);
    assert.deepEqual(resetState.completedChecklistStepIds, ['step-branches']);
    assert.equal(
      shouldAutoOpenOnboarding({ id: 10, role: 'admin', tenant_id: 101 }),
      true
    );

    // Changelog version tracking
    const seenState = markChangelogVersionSeen(101, 10, CURRENT_APP_VERSION);
    assert.equal(seenState.lastSeenVersion, 'v1.5.0');
    assert.equal(
      getOnboardingState(101, 10).lastSeenVersion,
      CURRENT_APP_VERSION
    );
  });

  test('4. Part 3: Admin 5-Step Store Setup Checklist (StoreSetupChecklist.tsx & AdminDashboardView.tsx)', () => {
    assert.equal(ADMIN_SETUP_CHECKLIST_STEPS.length, 5);
    assert.deepEqual(
      ADMIN_SETUP_CHECKLIST_STEPS.map((s) => s.href),
      ['/branding', '/branches', '/users', '/devices', '/shifts']
    );

    const checklistComponent = fs.readFileSync(
      path.join(webDir, 'app/components/onboarding/StoreSetupChecklist.tsx'),
      'utf-8'
    );
    const adminDashboardView = fs.readFileSync(
      path.join(webDir, 'app/dashboard/components/AdminDashboardView.tsx'),
      'utf-8'
    );

    assert.ok(
      checklistComponent.includes("effectiveRole !== 'admin'") &&
        checklistComponent.includes('storageState.checklistDismissed'),
      'StoreSetupChecklist must only render for admin role when not dismissed'
    );
    assert.ok(
      checklistComponent.includes('hoàn thành') &&
        checklistComponent.includes('Ẩn bảng thiết lập') &&
        checklistComponent.includes('Thu gọn') &&
        checklistComponent.includes('Mở rộng'),
      'StoreSetupChecklist must display progress X/5 hoàn thành, collapse toggle, and dismiss button'
    );
    assert.ok(
      adminDashboardView.includes('StoreSetupChecklist') &&
        adminDashboardView.includes('<StoreSetupChecklist'),
      'AdminDashboardView.tsx must mount <StoreSetupChecklist /> at the top of the dashboard'
    );
  });

  test('5. Part 4: Replay Onboarding in HelpCenterModal.tsx and Version Badge in AppSidebar.tsx + AppShell.tsx', () => {
    const helpModalContent = fs.readFileSync(
      path.join(webDir, 'app/components/help-center/HelpCenterModal.tsx'),
      'utf-8'
    );
    const sidebarContent = fs.readFileSync(
      path.join(rootDir, 'packages/ui/src/organisms/AppSidebar.tsx'),
      'utf-8'
    );
    const appShellContent = fs.readFileSync(
      path.join(webDir, 'app/components/AppShell.tsx'),
      'utf-8'
    );

    // HelpCenterModal replay button
    assert.ok(
      helpModalContent.includes('onReplayOnboarding?: () => void') &&
        helpModalContent.includes('Xem lại hướng dẫn bắt đầu') &&
        helpModalContent.includes('resetOnboardingTour') &&
        helpModalContent.includes('onReplayOnboarding?.()'),
      'HelpCenterModal.tsx must support onReplayOnboarding and render Xem lại hướng dẫn bắt đầu button'
    );

    // AppSidebar version changelog badge
    assert.ok(
      sidebarContent.includes("appVersion = 'v1.5.0'") &&
        sidebarContent.includes('Nhật ký cập nhật') &&
        sidebarContent.includes('sidebar-changelog-badge') &&
        sidebarContent.includes('sidebar-changelog-unread-dot') &&
        sidebarContent.includes("onNavigate('/changelog')"),
      'AppSidebar.tsx must render v1.5.0 · Nhật ký cập nhật badge and unread indicator dot'
    );

    // AppShell wiring
    assert.ok(
      appShellContent.includes('<OnboardingTourModal') &&
        appShellContent.includes('handleReplayOnboarding') &&
        appShellContent.includes('setHelpModalOpen(false)') &&
        appShellContent.includes('setOnboardingModalOpen(true)') &&
        appShellContent.includes('appVersion={CURRENT_APP_VERSION}') &&
        appShellContent.includes('hasUnreadChangelog={hasUnreadChangelog}') &&
        appShellContent.includes("onChangelogClick={() => handleNavigate('/changelog')}"),
      'AppShell.tsx must connect OnboardingTourModal, HelpCenterModal replay handler, and AppSidebar changelog badge'
    );
  });

  test('6. Part 5: Changelog Data (v1.0.0 - v1.5.0), 3-Column Roadmap, Public Route /changelog, LandingPreview Links & Middleware', () => {
    assert.equal(CURRENT_APP_VERSION, 'v1.5.0');
    assert.equal(CHANGELOG_RELEASES.length, 6);
    assert.deepEqual(
      CHANGELOG_RELEASES.map((r) => r.version),
      ['v1.5.0', 'v1.4.0', 'v1.3.0', 'v1.2.0', 'v1.1.0', 'v1.0.0']
    );
    assert.equal(CHANGELOG_RELEASES[0].isLatest, true);

    // Test category & keyword filtering
    const securityReleases = filterChangelogReleases(
      CHANGELOG_RELEASES,
      'security',
      ''
    );
    assert.ok(securityReleases.length >= 2);
    for (const rel of securityReleases) {
      for (const item of rel.changes) {
        assert.equal(item.category, 'security');
      }
    }

    const sepayMatches = filterChangelogReleases(
      CHANGELOG_RELEASES,
      'all',
      'SePay'
    );
    assert.ok(
      sepayMatches.some((r) => r.version === 'v1.1.0'),
      'Searching for SePay must match release v1.1.0'
    );

    const emptyMatches = filterChangelogReleases(
      CHANGELOG_RELEASES,
      'all',
      'khong-ton-tai-tu-khoa-xyz-999'
    );
    assert.equal(emptyMatches.length, 0);

    // Test 3-column Product Roadmap
    assert.deepEqual(
      [...ROADMAP_STATUS_ORDER],
      ['in_progress', 'planned', 'exploring']
    );
    assert.equal(ROADMAP_STATUS_META.in_progress.label, 'Đang phát triển');
    assert.equal(ROADMAP_STATUS_META.planned.label, 'Dự kiến sắp tới');
    assert.equal(ROADMAP_STATUS_META.exploring.label, 'Đang nghiên cứu');

    for (const status of ROADMAP_STATUS_ORDER) {
      const items = getRoadmapByStatus(PRODUCT_ROADMAP_ITEMS, status);
      assert.ok(
        items.length >= 2,
        `Roadmap status ${status} must have at least 2 items`
      );
    }

    // Check ChangelogView.tsx, page.tsx, LandingPreview.tsx, and middleware.ts
    const changelogViewContent = fs.readFileSync(
      path.join(webDir, 'app/changelog/ChangelogView.tsx'),
      'utf-8'
    );
    const changelogPageContent = fs.readFileSync(
      path.join(webDir, 'app/changelog/page.tsx'),
      'utf-8'
    );
    const landingContent = fs.readFileSync(
      path.join(webDir, 'app/LandingPreview.tsx'),
      'utf-8'
    );
    const middlewareContent = fs.readFileSync(
      path.join(webDir, 'middleware.ts'),
      'utf-8'
    );

    assert.ok(
      changelogViewContent.includes('markChangelogVersionSeen') &&
        changelogViewContent.includes('filterChangelogReleases') &&
        changelogViewContent.includes('getRoadmapByStatus') &&
        changelogViewContent.includes('sanitizeInputLive') &&
        changelogViewContent.includes('Xóa bộ lọc'),
      'ChangelogView.tsx must integrate markChangelogVersionSeen, filterChangelogReleases, getRoadmapByStatus, sanitizeInputLive, and reset filter button'
    );
    assert.ok(
      changelogPageContent.includes('<Suspense') &&
        changelogPageContent.includes('<ChangelogView'),
      'app/changelog/page.tsx must wrap <ChangelogView /> in <Suspense>'
    );
    assert.ok(
      landingContent.includes('href="/changelog"') &&
        landingContent.includes('Cập nhật') &&
        landingContent.includes('Nhật ký cập nhật') &&
        landingContent.includes('Lộ trình phát triển'),
      'LandingPreview.tsx must include /changelog links in Navbar and Footer'
    );
    assert.ok(
      !middlewareContent.includes("'/changelog"),
      'middleware.ts must NOT block /changelog route so it remains 100% public'
    );
  });

  test('7. Part 6: Strict podscare-design-system Compliance (Zero-Emoji, Zero-Gradient, Zero-Backdrop-Blur, Calm Jade & Warm Ivory)', () => {
    const targetFiles = [
      path.join(webDir, 'app/components/onboarding/types.ts'),
      path.join(webDir, 'app/components/onboarding/onboardingStorage.ts'),
      path.join(webDir, 'app/components/onboarding/onboardingData.ts'),
      path.join(webDir, 'app/components/onboarding/OnboardingTourModal.tsx'),
      path.join(webDir, 'app/components/onboarding/StoreSetupChecklist.tsx'),
      path.join(webDir, 'app/changelog/changelogData.ts'),
      path.join(webDir, 'app/changelog/ChangelogView.tsx'),
      path.join(webDir, 'app/changelog/page.tsx'),
      path.join(webDir, 'app/components/help-center/HelpCenterModal.tsx'),
    ];

    for (const filePath of targetFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relName = path.relative(rootDir, filePath);

      assert.equal(
        EMOJI_REGEX.test(content),
        false,
        `File ${relName} must NOT contain any Unicode Emojis`
      );
      assert.equal(
        /bg-gradient-to-|linear-gradient\(/i.test(content),
        false,
        `File ${relName} must NOT use CSS gradients`
      );
      assert.equal(
        /backdrop-blur/i.test(content),
        false,
        `File ${relName} must NOT use backdrop-blur`
      );

      // Verify all <Icon ... size={N} /> adhere to the 5-tier scale (12 | 14 | 16 | 18 | 24)
      const sizeMatches = [...content.matchAll(/<Icon[\s\S]*?size=\{(\d+)\}/g)];
      for (const match of sizeMatches) {
        const sizeVal = Number(match[1]);
        assert.ok(
          [12, 14, 16, 18, 24].includes(sizeVal),
          `File ${relName} uses invalid Icon size={${sizeVal}}; must be one of 12, 14, 16, 18, 24`
        );
      }
    }
  });

  test('8. Anti-Spam Registration Guardrails (Tier 1 Rate Limit 429, Tier 2 Honeypot & Form Timing, Tier 3 VN Phone & No +tag Email) in app/register/page.tsx', () => {
    const registerPagePath = path.join(webDir, 'app/register/page.tsx');
    const registerContent = fs.readFileSync(registerPagePath, 'utf-8');

    // Tier 1: 429 Too Many Requests handling
    assert.ok(
      registerContent.includes('res.status === 429'),
      'register/page.tsx must explicitly handle HTTP 429 Too Many Requests'
    );

    // Tier 2: Honeypot field & Form Timing guard
    assert.ok(
      registerContent.includes('const [websiteUrl, setWebsiteUrl] = useState(\'\')') &&
        registerContent.includes('name="website_url"') &&
        registerContent.includes('tabIndex={-1}') &&
        registerContent.includes('autoComplete="off"') &&
        registerContent.includes('aria-hidden="true"') &&
        registerContent.includes('Phát hiện yêu cầu đăng ký tự động không hợp lệ.'),
      'register/page.tsx must implement hidden website_url honeypot field and client guard'
    );
    assert.ok(
      registerContent.includes('const [formStartedAt] = useState<number>(() => Date.now())') &&
        registerContent.includes('website_url: websiteUrl') &&
        registerContent.includes('form_started_at: formStartedAt'),
      'register/page.tsx must track formStartedAt and send website_url + form_started_at in POST body'
    );

    // Tier 3: VN 10-digit phone normalization/validation & Email +tag blocking
    assert.ok(
      registerContent.includes('normalizeVnPhone') &&
        registerContent.includes('/^0[235789][0-9]{8}$/.test(normalizedPhone)') &&
        registerContent.includes(
          'Số điện thoại không đúng định dạng 10 số hợp lệ tại Việt Nam (ví dụ: 0901234567).'
        ) &&
        registerContent.includes('phone: normalizedPhone'),
      'register/page.tsx must normalize VN phone numbers (+84 -> 0), validate 10-digit mobile/landline format, and submit normalizedPhone'
    );
    assert.ok(
      registerContent.includes("includes('+')") &&
        registerContent.includes(
          'Địa chỉ email không được chứa ký tự bí danh (+). Vui lòng sử dụng địa chỉ email chính thức của cửa hàng.'
        ),
      'register/page.tsx must reject +tag email aliases'
    );

    // Design System compliance on register/page.tsx
    assert.equal(
      EMOJI_REGEX.test(registerContent),
      false,
      'register/page.tsx must NOT contain any Unicode Emojis'
    );
    assert.equal(
      /bg-gradient-to-|linear-gradient\(/i.test(registerContent),
      false,
      'register/page.tsx must NOT use CSS gradients'
    );
    assert.equal(
      /backdrop-blur/i.test(registerContent),
      false,
      'register/page.tsx must NOT use backdrop-blur'
    );
  });
});
