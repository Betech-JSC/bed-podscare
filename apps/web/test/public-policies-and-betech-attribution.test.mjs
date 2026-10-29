import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  POLICY_SLUGS,
  BETECH_LEGAL_ENTITY,
  SAAS_PLAN_QUOTAS,
  SAAS_PLAN_QUOTA_LIST,
  POLICY_DOCUMENTS,
  POLICY_NAV_ITEMS,
  getPolicyDocument,
  buildOrganizationJsonLd,
  buildPolicyJsonLd,
} from '../app/components/policies/policyData.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(__dirname, '../../..');
const apiDir = path.join(rootDir, 'apps/api');

const EMOJI_PRESENTATION_REGEX = /\p{Emoji_Presentation}/u;
const EXTENDED_PICTOGRAPHIC_REGEX = /(?![©®™])\p{Extended_Pictographic}/u;
const GRADIENT_REGEX =
  /bg-gradient-|linear-gradient\(|radial-gradient\(|conic-gradient\(/i;
const BACKDROP_BLUR_REGEX = /backdrop-blur/i;

/**
 * Extract all <a ... href="https://betech-digital.com/" ...> opening tags from source content.
 */
function extractBetechAnchorTags(source) {
  const anchorRegex = /<a\b[^>]*href=["']https:\/\/betech-digital\.com\/["'][^>]*>/gi;
  return [...source.matchAll(anchorRegex)].map((m) => m[0]);
}

/**
 * Convert a Next.js middleware matcher pattern (e.g. '/dashboard/:path*' or '/login') to RegExp.
 */
function matcherPatternToRegExp(pattern) {
  if (pattern.endsWith('/:path*')) {
    const base = pattern.slice(0, -'/:path*'.length);
    const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escapedBase}(?:/.*)?$`);
  }
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`);
}

describe('OpenSpec: public-policy-pages-and-betech-attribution Comprehensive Verification', () => {
  test('1. Legal Entity Constants, SaaS Plan Quotas & Complete 4-Document Policy Data Layer (policyData.ts)', () => {
    // 1.1 BETECH_LEGAL_ENTITY exact legal identity verification
    assert.equal(
      BETECH_LEGAL_ENTITY.companyName,
      'CÔNG TY TNHH DỊCH VỤ GIẢI PHÁP SỐ BETECH'
    );
    assert.equal(
      BETECH_LEGAL_ENTITY.internationalName,
      'BETECH DIGITAL SOLUTION SERVICES COMPANY LIMITED'
    );
    assert.equal(BETECH_LEGAL_ENTITY.brandName, 'Betech Digital');
    assert.equal(BETECH_LEGAL_ENTITY.productName, 'FIXO Repair OS');
    assert.equal(BETECH_LEGAL_ENTITY.taxId, '0318601210');
    assert.equal(
      BETECH_LEGAL_ENTITY.headquartersAddress,
      '92A-94 Bạch Đằng, Phường 2 (Tân Sơn Hòa), Quận Tân Bình, TP. Hồ Chí Minh'
    );
    assert.equal(
      BETECH_LEGAL_ENTITY.branchAddress,
      '73 Rạch Bùng Binh, Phường Nhiêu Lộc, Quận 3, TP. Hồ Chí Minh'
    );
    assert.equal(BETECH_LEGAL_ENTITY.hotline, '0775 600 351');
    assert.equal(BETECH_LEGAL_ENTITY.hotlineTel, '0775600351');
    assert.equal(BETECH_LEGAL_ENTITY.email, 'admin@betech-digital.com');
    assert.equal(BETECH_LEGAL_ENTITY.websiteUrl, 'https://betech-digital.com/');
    assert.ok(
      BETECH_LEGAL_ENTITY.supportHours.includes('08:00 – 21:00') &&
        BETECH_LEGAL_ENTITY.supportHours.includes('Thứ 2 – Chủ nhật'),
      'BETECH_LEGAL_ENTITY.supportHours must declare 08:00 – 21:00 (Thứ 2 – Chủ nhật)'
    );

    // 1.2 SAAS_PLAN_QUOTAS & SAAS_PLAN_QUOTA_LIST verification
    assert.equal(SAAS_PLAN_QUOTA_LIST.length, 3);
    assert.deepEqual(
      SAAS_PLAN_QUOTA_LIST.map((p) => p.id),
      ['trial', 'standard', 'pro']
    );

    assert.equal(SAAS_PLAN_QUOTAS.trial.priceMonthly, 0);
    assert.equal(SAAS_PLAN_QUOTAS.trial.priceYearly, 0);
    assert.equal(SAAS_PLAN_QUOTAS.trial.priceMonthlyDisplay, '0đ');
    assert.equal(SAAS_PLAN_QUOTAS.trial.maxBranches, 1);
    assert.equal(SAAS_PLAN_QUOTAS.trial.maxUsers, 2);
    assert.equal(SAAS_PLAN_QUOTAS.trial.maxOrdersPerMonth, 50);
    assert.equal(
      SAAS_PLAN_QUOTAS.trial.quotaSummary,
      '1 chi nhánh, 2 nhân sự, 50 đơn/tháng'
    );
    assert.equal(SAAS_PLAN_QUOTAS.trial.requiresCreditCard, false);
    assert.equal(SAAS_PLAN_QUOTAS.trial.trialDurationLabel, '1 năm');

    assert.equal(SAAS_PLAN_QUOTAS.standard.priceMonthly, 299000);
    assert.equal(SAAS_PLAN_QUOTAS.standard.priceYearly, 3289000);
    assert.equal(SAAS_PLAN_QUOTAS.standard.priceMonthlyDisplay, '299.000đ/tháng');
    assert.equal(SAAS_PLAN_QUOTAS.standard.priceYearlyDisplay, '3.289.000đ/năm');
    assert.equal(SAAS_PLAN_QUOTAS.standard.maxBranches, 2);
    assert.equal(SAAS_PLAN_QUOTAS.standard.maxUsers, 5);
    assert.equal(SAAS_PLAN_QUOTAS.standard.maxOrdersPerMonth, 300);
    assert.equal(
      SAAS_PLAN_QUOTAS.standard.quotaSummary,
      '2 chi nhánh, 5 nhân sự, 300 đơn/tháng'
    );

    assert.equal(SAAS_PLAN_QUOTAS.pro.priceMonthly, 599000);
    assert.equal(SAAS_PLAN_QUOTAS.pro.priceYearly, 6589000);
    assert.equal(SAAS_PLAN_QUOTAS.pro.priceMonthlyDisplay, '599.000đ/tháng');
    assert.equal(SAAS_PLAN_QUOTAS.pro.priceYearlyDisplay, '6.589.000đ/năm');
    assert.equal(SAAS_PLAN_QUOTAS.pro.maxBranches, null);
    assert.equal(SAAS_PLAN_QUOTAS.pro.maxUsers, null);
    assert.equal(SAAS_PLAN_QUOTAS.pro.maxOrdersPerMonth, null);
    assert.ok(
      SAAS_PLAN_QUOTAS.pro.quotaSummary.includes('Không giới hạn'),
      'Pro plan quotaSummary must specify unlimited resources'
    );

    // 1.3 POLICY_SLUGS, POLICY_NAV_ITEMS & 4 Policy Documents structural integrity
    assert.deepEqual([...POLICY_SLUGS], [
      'terms',
      'privacy',
      'billing-policy',
      'sla',
    ]);
    assert.equal(POLICY_NAV_ITEMS.length, 4);

    for (const slug of POLICY_SLUGS) {
      const doc = getPolicyDocument(slug);
      assert.equal(doc, POLICY_DOCUMENTS[slug]);
      assert.equal(doc.slug, slug);
      assert.equal(doc.path, `/${slug}`);
      assert.ok(doc.title.length > 10);
      assert.ok(doc.shortTitle.length > 5);
      assert.ok(doc.subtitle.length > 20);
      assert.ok(doc.seoTitle.includes('FIXO Repair OS'));
      assert.ok(doc.seoTitle.includes('Betech Digital'));
      assert.ok(doc.seoDescription.length > 50);
      assert.ok(doc.effectiveDate.length >= 8);
      assert.ok(doc.lastUpdated.length >= 8);
      assert.ok(
        Array.isArray(doc.summaryPoints) && doc.summaryPoints.length >= 3
      );
      assert.ok(Array.isArray(doc.sections) && doc.sections.length >= 5);

      const seenIds = new Set();
      for (const section of doc.sections) {
        assert.ok(
          /^[a-z0-9-]+$/.test(section.id),
          `Section id "${section.id}" in ${slug} must be valid kebab-case anchor`
        );
        assert.equal(
          seenIds.has(section.id),
          false,
          `Duplicate section id "${section.id}" in ${slug}`
        );
        seenIds.add(section.id);
        assert.ok(section.number.startsWith('Điều '));
        assert.ok(section.title.length > 10);
        assert.ok(
          Array.isArray(section.paragraphs) && section.paragraphs.length >= 1
        );
      }
    }

    // 1.4 Mandatory legal clauses per document
    const termsText = JSON.stringify(POLICY_DOCUMENTS.terms);
    assert.ok(termsText.includes('B2B'));
    assert.ok(termsText.includes('CÔNG TY TNHH DỊCH VỤ GIẢI PHÁP SỐ BETECH'));
    assert.ok(termsText.includes('0318601210'));
    assert.ok(termsText.includes('linh kiện'));
    assert.ok(termsText.includes('kỹ thuật sửa chữa'));
    assert.ok(termsText.includes('bảo hành thiết bị'));
    assert.ok(termsText.includes('nghĩa vụ thuế'));

    const privacyText = JSON.stringify(POLICY_DOCUMENTS.privacy);
    assert.ok(privacyText.includes('100%'));
    assert.ok(privacyText.includes('quyền sở hữu độc quyền'));
    assert.ok(privacyText.includes('tenant_id'));
    assert.ok(privacyText.includes('không khai thác thương mại chéo'));
    assert.ok(privacyText.toLowerCase().includes('không bán'));
    assert.ok(privacyText.includes('PiiHelper'));
    assert.ok(privacyText.includes('/track'));
    assert.ok(privacyText.includes('13/2023/NĐ-CP'));
    assert.ok(privacyText.includes('admin@betech-digital.com'));
    assert.ok(privacyText.includes('0775 600 351'));

    const billingText = JSON.stringify(POLICY_DOCUMENTS['billing-policy']);
    assert.ok(billingText.includes('0đ'));
    assert.ok(billingText.includes('1 chi nhánh, 2 nhân sự, 50 đơn/tháng'));
    assert.ok(billingText.includes('299.000đ/tháng'));
    assert.ok(billingText.includes('3.289.000đ/năm'));
    assert.ok(billingText.includes('2 chi nhánh, 5 nhân sự, 300 đơn/tháng'));
    assert.ok(billingText.includes('599.000đ/tháng'));
    assert.ok(billingText.includes('6.589.000đ/năm'));
    assert.ok(billingText.includes('SePay VietQR'));
    assert.ok(billingText.includes('không hoàn tiền'));
    assert.ok(billingText.includes('trùng lặp'));
    assert.ok(billingText.includes('sự cố hạ tầng nghiêm trọng'));
    assert.ok(billingText.includes('hóa đơn điện tử'));
    assert.ok(billingText.includes('Mã số thuế'));
    assert.ok(billingText.includes('30 ngày'));
    assert.ok(billingText.includes('90 ngày'));
    assert.ok(billingText.includes('5–7 ngày làm việc'));

    const slaText = JSON.stringify(POLICY_DOCUMENTS.sla);
    assert.ok(slaText.includes('99.5%'));
    assert.ok(slaText.includes('Daily Automated Backup'));
    assert.ok(slaText.includes('hàng ngày'));
    assert.ok(slaText.includes('24 giờ'));
    assert.ok(slaText.includes('08:00 – 21:00'));
    assert.ok(slaText.includes('Thứ 2 đến Chủ nhật'));
    assert.ok(slaText.includes('0775 600 351'));
    assert.ok(slaText.includes('admin@betech-digital.com'));
  });

  test('2. Cross-Layer Standard Plan Quota Synchronization (2 chi nhánh, 5 nhân sự, 300 đơn/tháng) across policyData.ts, PricingSection.tsx, register/page.tsx & SubscriptionPlanSeeder.php', () => {
    const pricingSection = fs.readFileSync(
      path.join(webDir, 'app/components/landing/PricingSection.tsx'),
      'utf-8'
    );
    const registerPage = fs.readFileSync(
      path.join(webDir, 'app/register/page.tsx'),
      'utf-8'
    );
    const seederPhp = fs.readFileSync(
      path.join(apiDir, 'database/seeders/SubscriptionPlanSeeder.php'),
      'utf-8'
    );

    // PricingSection.tsx check
    assert.ok(
      pricingSection.includes("price: '299.000đ'") &&
        pricingSection.includes('3.289.000đ/năm') &&
        pricingSection.includes('Tối đa 2 chi nhánh, 5 nhân sự, 300 đơn/tháng'),
      'PricingSection.tsx must display 299.000đ/tháng, 3.289.000đ/năm, and 2 chi nhánh, 5 nhân sự, 300 đơn/tháng'
    );

    // register/page.tsx check
    assert.ok(
      registerPage.includes(
        'Gói Tiêu chuẩn (299.000đ/tháng · 2 chi nhánh, 5 nhân sự, 300 đơn/tháng'
      ),
      'register/page.tsx must display synchronized Standard plan quota (2 chi nhánh, 5 nhân sự, 300 đơn/tháng)'
    );

    // SubscriptionPlanSeeder.php check
    assert.ok(
      seederPhp.includes("'id'                   => 'standard'") &&
        seederPhp.includes("'price'                => 299000") &&
        seederPhp.includes("'price_monthly'        => 299000") &&
        seederPhp.includes("'price_yearly'         => 3289000") &&
        seederPhp.includes("'max_branches'         => 2") &&
        seederPhp.includes("'max_users'            => 5") &&
        seederPhp.includes("'max_orders_per_month' => 300") &&
        seederPhp.includes("'Tối đa 2 chi nhánh'") &&
        seederPhp.includes("'Tối đa 5 nhân sự'") &&
        seederPhp.includes("'300 đơn sửa chữa / tháng'"),
      'SubscriptionPlanSeeder.php must synchronize standard plan to 299000/3289000, max_branches=2, max_users=5, max_orders_per_month=300'
    );

    // Stale quota regression guard across all 4 files
    const policyDataRaw = fs.readFileSync(
      path.join(webDir, 'app/components/policies/policyData.ts'),
      'utf-8'
    );
    for (const [label, content] of [
      ['policyData.ts', policyDataRaw],
      ['PricingSection.tsx', pricingSection],
      ['register/page.tsx', registerPage],
      ['SubscriptionPlanSeeder.php', seederPhp],
    ]) {
      assert.equal(
        /200\s*đơn/i.test(content),
        false,
        `${label} must NOT contain stale "200 đơn" quota`
      );
      assert.equal(
        /1\s*chi nhánh\s*&\s*5\s*tài khoản nhân viên/i.test(content),
        false,
        `${label} must NOT contain stale "1 chi nhánh & 5 tài khoản nhân viên" quota`
      );
    }
  });

  test('3. Policy Hub Layout (PolicyPageLayout.tsx), 4 Pure Server Component Routes & Public Middleware Bypass', () => {
    const layoutContent = fs.readFileSync(
      path.join(webDir, 'app/components/policies/PolicyPageLayout.tsx'),
      'utf-8'
    );

    // Header navigation to / and /register
    assert.ok(
      layoutContent.includes('href="/"') &&
        layoutContent.includes('Trang chủ') &&
        layoutContent.includes('href="/register"') &&
        layoutContent.includes('Đăng ký gian hàng'),
      'PolicyPageLayout header must link back to / and /register'
    );

    // Sidebar 4-page switcher + section anchor TOC + effective date + Legal Entity Card
    assert.ok(
      layoutContent.includes('POLICY_NAV_ITEMS.map') &&
        layoutContent.includes('Danh mục chính sách') &&
        layoutContent.includes('Mục lục điều khoản') &&
        layoutContent.includes('href={`#${section.id}`}') &&
        layoutContent.includes('id={section.id}') &&
        layoutContent.includes('href="#thong-tin-phap-nhan"') &&
        layoutContent.includes('id="thong-tin-phap-nhan"') &&
        layoutContent.includes('Ngày hiệu lực') &&
        layoutContent.includes('{doc.effectiveDate}') &&
        layoutContent.includes('Thông tin Pháp nhân &amp; Đơn vị Vận hành') &&
        layoutContent.includes('BETECH_LEGAL_ENTITY.companyName') &&
        layoutContent.includes('BETECH_LEGAL_ENTITY.taxId') &&
        layoutContent.includes('BETECH_LEGAL_ENTITY.headquartersAddress') &&
        layoutContent.includes('BETECH_LEGAL_ENTITY.branchAddress') &&
        layoutContent.includes('BETECH_LEGAL_ENTITY.hotline') &&
        layoutContent.includes('BETECH_LEGAL_ENTITY.email'),
      'PolicyPageLayout must render Sidebar, TOC anchors, Effective Date, and full Betech Legal Entity Card'
    );

    // 4 Policy Routes must be pure Server Components (no "use client")
    for (const slug of POLICY_SLUGS) {
      const routePath = path.join(webDir, `app/${slug}/page.tsx`);
      assert.ok(fs.existsSync(routePath), `Missing route file app/${slug}/page.tsx`);
      const routeContent = fs.readFileSync(routePath, 'utf-8');

      assert.equal(
        /['"]use client['"]/.test(routeContent),
        false,
        `app/${slug}/page.tsx must be a Server Component (must NOT declare 'use client')`
      );
      assert.ok(
        routeContent.includes(`<PolicyPageLayout activeSlug="${slug}" />`),
        `app/${slug}/page.tsx must render <PolicyPageLayout activeSlug="${slug}" />`
      );
    }

    // Middleware matcher verification: public routes must NOT match any protected matcher
    const middlewareContent = fs.readFileSync(
      path.join(webDir, 'middleware.ts'),
      'utf-8'
    );
    const matcherBlockMatch = middlewareContent.match(
      /matcher:\s*\[([\s\S]*?)\]/
    );
    assert.ok(matcherBlockMatch, 'middleware.ts must declare config.matcher array');

    const matcherPatterns = [
      ...matcherBlockMatch[1].matchAll(/['"]([^'"]+)['"]/g),
    ].map((m) => m[1]);
    assert.ok(matcherPatterns.length > 10);

    const compiledMatchers = matcherPatterns.map(matcherPatternToRegExp);
    const publicPaths = [
      '/',
      '/terms',
      '/privacy',
      '/billing-policy',
      '/sla',
      '/register',
      '/track',
      '/changelog',
    ];

    for (const publicPath of publicPaths) {
      const matched = compiledMatchers.some((re) => re.test(publicPath));
      assert.equal(
        matched,
        false,
        `Public route "${publicPath}" must NOT be intercepted by middleware.ts config.matcher`
      );
    }
  });

  test('4. Landing Page Trust Strip, Zero Empty href="#", Official Contact Sync & Betech Digital Dofollow Links', () => {
    const landingPreview = fs.readFileSync(
      path.join(webDir, 'app/LandingPreview.tsx'),
      'utf-8'
    );
    const landingCss = fs.readFileSync(
      path.join(webDir, 'app/landing-preview.css'),
      'utf-8'
    );
    const landingFooter = fs.readFileSync(
      path.join(webDir, 'app/components/landing/LandingFooter.tsx'),
      'utf-8'
    );
    const previewHtml = fs.readFileSync(
      path.join(webDir, 'public/preview.html'),
      'utf-8'
    );

    // Preserve root class & /changelog links on LandingPreview.tsx
    assert.ok(
      landingPreview.includes('className="landing-preview-root min-h-screen"'),
      'LandingPreview.tsx must preserve root class landing-preview-root min-h-screen'
    );
    assert.ok(
      landingPreview.includes('href="/changelog"') &&
        landingPreview.includes('href="/changelog?tab=roadmap"'),
      'LandingPreview.tsx must preserve /changelog and /changelog?tab=roadmap links'
    );

    // Data Ownership & Legal Trust Strip verification
    assert.ok(
      landingPreview.includes('className="data-trust-strip"') &&
        landingPreview.includes('Cam kết An toàn &amp; Quyền Sở hữu Dữ liệu Cửa hàng') &&
        landingPreview.includes('href="/privacy"') &&
        landingPreview.includes('href="/terms"') &&
        landingPreview.includes('href="/billing-policy"') &&
        landingPreview.includes('href="/sla"'),
      'LandingPreview.tsx must render .data-trust-strip linking to all 4 policy pages'
    );
    assert.ok(
      landingCss.includes('.data-trust-strip') &&
        landingCss.includes('background: #f6f8f6;') &&
        landingCss.includes('border-top: 1px solid #e5ece8;') &&
        landingCss.includes('.data-trust-card'),
      'landing-preview.css must style .data-trust-strip with Warm Ivory (#f6f8f6) and 1px solid border'
    );

    // Zero href="#", zero placeholder contact, and full policy/contact wiring across all 3 landing surfaces
    for (const [label, content] of [
      ['LandingPreview.tsx', landingPreview],
      ['LandingFooter.tsx', landingFooter],
      ['public/preview.html', previewHtml],
    ]) {
      assert.equal(
        /href=["']#["']/.test(content),
        false,
        `${label} must have 0 empty href="#" links`
      );
      assert.equal(
        /028\s*7300\s*1234|02873001234|support@fixo\.com\.vn/i.test(content),
        false,
        `${label} must NOT contain placeholder phone 028 7300 1234 or support@fixo.com.vn`
      );
      assert.ok(
        content.includes('0775600351') &&
          content.includes('admin@betech-digital.com'),
        `${label} must contain official hotline 0775 600 351 and email admin@betech-digital.com`
      );
      for (const requiredRoute of [
        '/terms',
        '/privacy',
        '/billing-policy',
        '/sla',
        '/track',
        '/changelog',
        '/login',
        '/register',
      ]) {
        assert.ok(
          content.includes(`href="${requiredRoute}`),
          `${label} must wire link to ${requiredRoute}`
        );
      }

      const betechAnchors = extractBetechAnchorTags(content);
      assert.ok(
        betechAnchors.length >= 2,
        `${label} must include Betech Digital anchor links to https://betech-digital.com/`
      );
      for (const tag of betechAnchors) {
        assert.ok(
          /target=["']_blank["']/i.test(tag),
          `Betech anchor in ${label} must include target="_blank": ${tag}`
        );
        assert.ok(
          /rel=["'][^"']*noopener[^"']*["']/i.test(tag),
          `Betech anchor in ${label} must include rel="noopener": ${tag}`
        );
        assert.equal(
          /nofollow/i.test(tag),
          false,
          `Betech anchor in ${label} MUST NOT include nofollow: ${tag}`
        );
      }
    }
  });

  test('5. SEO Metadata & Schema.org JSON-LD Developer Organization Attribution (app/page.tsx & 4 Policy Routes)', () => {
    // 5.1 Direct JSON-LD builder validation
    const orgJsonLd = buildOrganizationJsonLd();
    assert.equal(orgJsonLd['@type'], 'Organization');
    assert.equal(orgJsonLd.name, 'Betech Digital');
    assert.equal(
      orgJsonLd.legalName,
      'CÔNG TY TNHH DỊCH VỤ GIẢI PHÁP SỐ BETECH'
    );
    assert.equal(orgJsonLd.taxID, '0318601210');
    assert.equal(orgJsonLd.url, 'https://betech-digital.com/');
    assert.equal(orgJsonLd.email, 'admin@betech-digital.com');
    assert.equal(orgJsonLd.telephone, '0775 600 351');
    assert.equal(orgJsonLd.address.length, 2);

    for (const slug of POLICY_SLUGS) {
      const policyJsonLd = buildPolicyJsonLd(slug);
      const parsed = JSON.parse(JSON.stringify(policyJsonLd));
      assert.equal(parsed['@context'], 'https://schema.org');
      assert.equal(parsed['@type'], 'WebPage');
      assert.equal(parsed.url, `https://fixo.com.vn/${slug}`);
      assert.equal(parsed.author['@type'], 'Organization');
      assert.equal(parsed.author.name, 'Betech Digital');
      assert.equal(parsed.author.url, 'https://betech-digital.com/');
      assert.equal(parsed.publisher.url, 'https://betech-digital.com/');
      assert.equal(
        parsed.publisher.legalName,
        'CÔNG TY TNHH DỊCH VỤ GIẢI PHÁP SỐ BETECH'
      );
    }

    // 5.2 Inspect app/page.tsx and 4 policy route files for Metadata + application/ld+json script
    const homePage = fs.readFileSync(path.join(webDir, 'app/page.tsx'), 'utf-8');
    assert.ok(
      homePage.includes('export const metadata: Metadata') &&
        homePage.includes('buildOrganizationJsonLd()') &&
        homePage.includes("'@type': 'SoftwareApplication'") &&
        homePage.includes('author: developerOrganization') &&
        homePage.includes('creator: developerOrganization') &&
        homePage.includes('publisher: developerOrganization') &&
        homePage.includes('type="application/ld+json"'),
      'app/page.tsx must export Metadata and embed SoftwareApplication JSON-LD with Betech Digital Organization'
    );

    for (const slug of POLICY_SLUGS) {
      const routeContent = fs.readFileSync(
        path.join(webDir, `app/${slug}/page.tsx`),
        'utf-8'
      );
      for (const requiredField of [
        'export const metadata: Metadata',
        'title: doc.seoTitle',
        'description: doc.seoDescription',
        'authors:',
        'creator: BETECH_LEGAL_ENTITY.companyName',
        'publisher: BETECH_LEGAL_ENTITY.brandName',
        'robots:',
        'openGraph:',
        `buildPolicyJsonLd('${slug}')`,
        'type="application/ld+json"',
      ]) {
        assert.ok(
          routeContent.includes(requiredField),
          `app/${slug}/page.tsx must contain ${requiredField}`
        );
      }
    }
  });

  test('6. Public Touchpoints (/register Consent Guard, /track PII & Warranty Block, /login, /changelog & tenant-welcome.blade.php)', () => {
    const registerContent = fs.readFileSync(
      path.join(webDir, 'app/register/page.tsx'),
      'utf-8'
    );
    const trackingContent = fs.readFileSync(
      path.join(webDir, 'app/components/TrackingView.tsx'),
      'utf-8'
    );
    const loginContent = fs.readFileSync(
      path.join(webDir, 'app/login/page.tsx'),
      'utf-8'
    );
    const changelogContent = fs.readFileSync(
      path.join(webDir, 'app/changelog/ChangelogView.tsx'),
      'utf-8'
    );
    const welcomeEmailContent = fs.readFileSync(
      path.join(apiDir, 'resources/views/emails/tenant-welcome.blade.php'),
      'utf-8'
    );
    const policyLayoutContent = fs.readFileSync(
      path.join(webDir, 'app/components/policies/PolicyPageLayout.tsx'),
      'utf-8'
    );

    // 6.1 /register mandatory policy consent checkbox & submit guard
    assert.ok(
      registerContent.includes(
        'const [agreedToPolicies, setAgreedToPolicies] = useState(false)'
      ) &&
        registerContent.includes('id="register_agree_policies"') &&
        registerContent.includes('name="agreed_to_policies"') &&
        registerContent.includes('type="checkbox"') &&
        registerContent.includes('checked={agreedToPolicies}') &&
        registerContent.includes('if (!agreedToPolicies)') &&
        registerContent.includes('Điều khoản sử dụng và Chính sách bảo mật') &&
        registerContent.includes('href="/terms"') &&
        registerContent.includes('href="/privacy"'),
      'register/page.tsx must enforce unchecked-by-default agreedToPolicies checkbox blocking form submission'
    );

    // Ensure if (!agreedToPolicies) guard executes BEFORE fetch('/api/v1/tenants/register')
    const guardIdx = registerContent.indexOf('if (!agreedToPolicies)');
    const fetchIdx = registerContent.indexOf("fetch('/api/v1/tenants/register'");
    assert.ok(
      guardIdx > 0 && fetchIdx > guardIdx,
      'agreedToPolicies validation guard must execute before POST /api/v1/tenants/register'
    );

    // 6.2 /track PII Masking (PiiHelper) & Store Warranty Liability Boundary block
    assert.ok(
      trackingContent.includes('PiiHelper') &&
        trackingContent.includes('Bảo vệ dữ liệu định danh cá nhân (PII Masking)') &&
        trackingContent.includes('cửa hàng tiếp nhận máy') &&
        trackingContent.includes('Phân định trách nhiệm sửa chữa') &&
        trackingContent.includes('href="/privacy"') &&
        trackingContent.includes('href="/terms"'),
      'TrackingView.tsx must render PII Masking (PiiHelper) disclosure, store warranty boundary, and /privacy + /terms links'
    );

    // 6.3 /login, /changelog & tenant-welcome.blade.php mini-footers
    assert.ok(
      loginContent.includes('href="/terms"') &&
        loginContent.includes('href="/privacy"') &&
        loginContent.includes('href="/sla"'),
      'login/page.tsx must include mini-footer links to /terms, /privacy, and /sla'
    );
    assert.ok(
      changelogContent.includes('href="/terms"') &&
        changelogContent.includes('href="/privacy"') &&
        changelogContent.includes('href="/billing-policy"') &&
        changelogContent.includes('href="/sla"'),
      'ChangelogView.tsx must include mini-footer links to /terms, /privacy, /billing-policy, and /sla'
    );
    assert.ok(
      welcomeEmailContent.includes('/terms') &&
        welcomeEmailContent.includes('/privacy') &&
        welcomeEmailContent.includes('/billing-policy') &&
        welcomeEmailContent.includes('/sla') &&
        welcomeEmailContent.includes('CÔNG TY TNHH DỊCH VỤ GIẢI PHÁP SỐ BETECH') &&
        welcomeEmailContent.includes('0318601210') &&
        welcomeEmailContent.includes('0775 600 351') &&
        welcomeEmailContent.includes('admin@betech-digital.com'),
      'tenant-welcome.blade.php must include policy links, Betech legal identity (MST 0318601210), and official contact'
    );

    // 6.4 Universal Dofollow Verification on every Betech Digital anchor across all touchpoints
    for (const [label, content] of [
      ['PolicyPageLayout.tsx', policyLayoutContent],
      ['register/page.tsx', registerContent],
      ['TrackingView.tsx', trackingContent],
      ['login/page.tsx', loginContent],
      ['ChangelogView.tsx', changelogContent],
      ['tenant-welcome.blade.php', welcomeEmailContent],
    ]) {
      const anchors = extractBetechAnchorTags(content);
      assert.ok(
        anchors.length >= 1,
        `${label} must contain at least one anchor to https://betech-digital.com/`
      );
      for (const tag of anchors) {
        assert.ok(
          /target=["']_blank["']/i.test(tag),
          `Betech anchor in ${label} must have target="_blank": ${tag}`
        );
        assert.ok(
          /rel=["'][^"']*noopener[^"']*["']/i.test(tag),
          `Betech anchor in ${label} must have rel="noopener": ${tag}`
        );
        assert.equal(
          /nofollow/i.test(tag),
          false,
          `Betech anchor in ${label} MUST NOT contain nofollow: ${tag}`
        );
      }
    }
  });

  test('7. Strict podscare-design-system Visual Compliance (Zero-Emoji, Zero-Gradient, Zero-Backdrop-Blur, 5-Tier Icon Scale)', () => {
    const strictFullFiles = [
      path.join(webDir, 'app/components/policies/policyData.ts'),
      path.join(webDir, 'app/components/policies/PolicyPageLayout.tsx'),
      path.join(webDir, 'app/terms/page.tsx'),
      path.join(webDir, 'app/privacy/page.tsx'),
      path.join(webDir, 'app/billing-policy/page.tsx'),
      path.join(webDir, 'app/sla/page.tsx'),
      path.join(webDir, 'app/page.tsx'),
      path.join(webDir, 'app/register/page.tsx'),
      path.join(webDir, 'app/components/TrackingView.tsx'),
      path.join(webDir, 'app/login/page.tsx'),
      path.join(webDir, 'app/changelog/ChangelogView.tsx'),
      path.join(webDir, 'app/components/landing/LandingFooter.tsx'),
      path.join(apiDir, 'resources/views/emails/tenant-welcome.blade.php'),
    ];

    for (const filePath of strictFullFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relName = path.relative(rootDir, filePath);

      assert.equal(
        EMOJI_PRESENTATION_REGEX.test(content),
        false,
        `File ${relName} must NOT contain any Emoji_Presentation characters`
      );
      assert.equal(
        EXTENDED_PICTOGRAPHIC_REGEX.test(content),
        false,
        `File ${relName} must NOT contain any Extended_Pictographic Unicode emojis`
      );
      assert.equal(
        GRADIENT_REGEX.test(content),
        false,
        `File ${relName} must NOT use CSS gradients`
      );
      assert.equal(
        BACKDROP_BLUR_REGEX.test(content),
        false,
        `File ${relName} must NOT use backdrop-blur`
      );

      // Verify all <Icon ... size={N} /> adhere strictly to 5-tier scale: 12 | 14 | 16 | 18 | 24
      const sizeMatches = [...content.matchAll(/<Icon[\s\S]*?size=\{(\d+)\}/g)];
      for (const match of sizeMatches) {
        const sizeVal = Number(match[1]);
        assert.ok(
          [12, 14, 16, 18, 24].includes(sizeVal),
          `File ${relName} uses invalid Icon size={${sizeVal}}; must be one of 12, 14, 16, 18, 24`
        );
      }
    }

    // Verify Calm Jade (#176b51) & Warm Ivory (#f6f8f6) tokens in PolicyPageLayout.tsx
    const layoutContent = fs.readFileSync(
      path.join(webDir, 'app/components/policies/PolicyPageLayout.tsx'),
      'utf-8'
    );
    assert.ok(
      layoutContent.includes('bg-[#f6f8f6]') &&
        layoutContent.includes('bg-[#176b51]') &&
        layoutContent.includes('text-[#176b51]') &&
        layoutContent.includes('font-heading'),
      'PolicyPageLayout.tsx must use Warm Ivory (#f6f8f6), Calm Jade (#176b51), and Manrope (font-heading) tokens'
    );

    // Also scan the newly added .data-trust-strip section in LandingPreview.tsx & landing-preview.css
    const landingPreview = fs.readFileSync(
      path.join(webDir, 'app/LandingPreview.tsx'),
      'utf-8'
    );
    const trustStripMarkupMatch = landingPreview.match(
      /<section className="data-trust-strip"[\s\S]*?<\/section>/
    );
    assert.ok(
      trustStripMarkupMatch,
      'LandingPreview.tsx must contain <section className="data-trust-strip">'
    );
    const trustStripMarkup = trustStripMarkupMatch[0];
    assert.equal(
      EMOJI_PRESENTATION_REGEX.test(trustStripMarkup) ||
        EXTENDED_PICTOGRAPHIC_REGEX.test(trustStripMarkup),
      false,
      '.data-trust-strip markup in LandingPreview.tsx must have 0 Unicode Emojis'
    );
    assert.equal(
      GRADIENT_REGEX.test(trustStripMarkup) ||
        BACKDROP_BLUR_REGEX.test(trustStripMarkup),
      false,
      '.data-trust-strip markup in LandingPreview.tsx must have 0 gradients and 0 backdrop-blur'
    );

    const landingCss = fs.readFileSync(
      path.join(webDir, 'app/landing-preview.css'),
      'utf-8'
    );
    const trustStripCssMatch = landingCss.match(
      /\/\* =========================\s+DATA OWNERSHIP & LEGAL TRUST STRIP[\s\S]*?(?=\/\* =========================\s+CTA)/
    );
    assert.ok(
      trustStripCssMatch,
      'landing-preview.css must contain DATA OWNERSHIP & LEGAL TRUST STRIP block'
    );
    assert.equal(
      GRADIENT_REGEX.test(trustStripCssMatch[0]) ||
        BACKDROP_BLUR_REGEX.test(trustStripCssMatch[0]),
      false,
      '.data-trust-strip CSS rules must NOT use gradients or backdrop-blur'
    );
  });
});
