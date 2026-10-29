'use client';

import React from 'react';
import Link from 'next/link';
import { Icon } from '@podscare/ui';
import {
  BETECH_LEGAL_ENTITY,
  POLICY_NAV_ITEMS,
  SAAS_PLAN_QUOTA_LIST,
  getPolicyDocument,
  type PolicyDocument,
  type PolicySlug,
} from './policyData';

export interface PolicyPageLayoutProps {
  activeSlug: PolicySlug;
  document?: PolicyDocument;
}

export const PolicyPageLayout: React.FC<PolicyPageLayoutProps> = ({
  activeSlug,
  document,
}) => {
  const doc = document ?? getPolicyDocument(activeSlug);

  return (
    <div className="min-h-screen bg-[#f6f8f6] text-[#17231f] flex flex-col">
      <a
        href="#policy-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-3.5 focus:py-2 focus:rounded-[7px] focus:bg-[#176b51] focus:text-white focus:text-xs focus:font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17231f]"
      >
        Chuyển đến nội dung chính sách
      </a>

      {/* Sticky Top Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#e5ece8]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 min-h-[64px] py-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-[#17231f] hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51] rounded-[8px]"
            >
              <img
                src="/logo.png"
                alt=""
                className="w-8 h-8 rounded-[8px] object-contain border border-[#e5ece8] flex-none"
              />
              <div>
                <strong className="font-heading font-extrabold text-lg tracking-[-0.03em] text-[#17231f] block leading-none">
                  FIXO
                </strong>
                <span className="block text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.08em] text-[#758780] mt-0.5">
                  TRUNG TÂM CHÍNH SÁCH &amp; PHÁP LÝ
                </span>
              </div>
            </Link>
          </div>

          <nav
            aria-label="Cổng thông tin công khai"
            className="flex flex-wrap items-center gap-1.5 sm:gap-2.5"
          >
            <Link
              href="/"
              className="px-2.5 sm:px-3 py-1.5 rounded-[7px] text-xs font-bold text-[#516059] hover:text-[#17231f] hover:bg-[#f6f8f6] border border-transparent hover:border-[#e5ece8] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
            >
              Trang chủ
            </Link>

            <Link
              href="/track"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-xs font-bold text-[#516059] hover:text-[#17231f] hover:bg-[#f6f8f6] border border-transparent hover:border-[#e5ece8] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
            >
              <Icon name="search" size={14} />
              <span>Tra cứu đơn</span>
            </Link>

            <Link
              href="/login"
              className="px-2.5 sm:px-3 py-1.5 rounded-[7px] text-xs font-bold bg-white text-[#17231f] border border-[#e5ece8] hover:bg-[#f6f8f6] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
            >
              Đăng nhập
            </Link>

            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-[7px] text-xs font-bold bg-[#176b51] text-white border border-[#176b51] hover:bg-[#10583f] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
            >
              <span>Đăng ký gian hàng</span>
              <Icon name="chevronRight" size={14} />
            </Link>
          </nav>
        </div>
      </header>

      {/* Main 2-Column Layout (Desktop 2 columns / Mobile stacked) */}
      <div className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Left Column: Policy Hub Sidebar + Table of Contents */}
          <aside
            aria-label="Danh mục và mục lục chính sách"
            className="lg:col-span-4 xl:col-span-3 space-y-5 lg:sticky lg:top-24"
          >
            {/* Block 1: Policy Switcher Sidebar (4 pages) */}
            <div className="bg-white rounded-[12px] border border-[#e5ece8] p-4">
              <h2
                id="policy-hub-nav-heading"
                className="font-heading text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#758780] mb-3"
              >
                Danh mục chính sách
              </h2>
              <nav aria-labelledby="policy-hub-nav-heading">
                <ul className="space-y-1.5">
                  {POLICY_NAV_ITEMS.map((item) => {
                    const isActive = item.slug === doc.slug;
                    return (
                      <li key={item.slug}>
                        <Link
                          href={item.path}
                          aria-current={isActive ? 'page' : undefined}
                          className={`block rounded-[9px] px-3 py-2.5 border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51] ${
                            isActive
                              ? 'bg-[#e9f4ef] text-[#176b51] border-[#cde2d6]'
                              : 'bg-white text-[#17231f] border-transparent hover:bg-[#f6f8f6] hover:border-[#e5ece8]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-heading text-xs sm:text-[13px] font-bold leading-snug">
                              {item.shortTitle}
                            </span>
                            {isActive && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-[#176b51] flex-none"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                          <span
                            className={`block text-[11px] mt-1 leading-relaxed ${
                              isActive ? 'text-[#176b51]' : 'text-[#758780]'
                            }`}
                          >
                            {item.description}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>

            {/* Block 2: Section Anchor Table of Contents (TOC) */}
            <div className="bg-white rounded-[12px] border border-[#e5ece8] p-4">
              <h2
                id="policy-toc-heading"
                className="font-heading text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#758780] mb-3"
              >
                Mục lục điều khoản
              </h2>
              <nav aria-labelledby="policy-toc-heading">
                <ol className="space-y-1">
                  {doc.sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="block rounded-[7px] px-2.5 py-2 text-xs text-[#516059] hover:text-[#176b51] hover:bg-[#e9f4ef] transition-colors leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
                      >
                        <strong className="font-heading font-bold text-[#17231f]">
                          {section.number}:
                        </strong>{' '}
                        <span>{section.title}</span>
                      </a>
                    </li>
                  ))}
                  <li className="pt-1.5 mt-1.5 border-t border-[#e5ece8]">
                    <a
                      href="#thong-tin-phap-nhan"
                      className="block rounded-[7px] px-2.5 py-2 text-xs font-semibold text-[#176b51] bg-[#f6f8f6] hover:bg-[#e9f4ef] border border-[#e5ece8] transition-colors leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
                    >
                      Thông tin Pháp nhân &amp; Đơn vị Vận hành
                    </a>
                  </li>
                </ol>
              </nav>
            </div>
          </aside>

          {/* Right Column: Legal Document Content */}
          <main
            id="policy-main-content"
            tabIndex={-1}
            className="lg:col-span-8 xl:col-span-9 space-y-6 focus:outline-none"
          >
            {/* 1. Document Title & Executive Summary Card */}
            <article className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-7 space-y-5">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[20px] bg-[#e9f4ef] border border-[#cde2d6] text-[11px] font-bold text-[#176b51]">
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-[#176b51]"
                      aria-hidden="true"
                    />
                    <span>Văn bản pháp lý B2B SaaS · {doc.shortTitle}</span>
                  </span>
                </div>

                <h1 className="font-heading font-extrabold text-xl sm:text-2xl lg:text-[26px] text-[#17231f] tracking-[-0.02em] leading-tight">
                  {doc.title}
                </h1>

                <p className="text-[13px] sm:text-sm text-[#516059] leading-relaxed">
                  {doc.subtitle}
                </p>
              </div>

              {/* Effective Date, Last Updated & Issuing Legal Entity Strip */}
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-3.5 border-y border-[#e5ece8] text-xs">
                <div>
                  <dt className="text-[#758780] font-semibold">Ngày hiệu lực</dt>
                  <dd className="font-heading font-bold text-[#17231f] mt-0.5">
                    {doc.effectiveDate}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#758780] font-semibold">
                    Cập nhật lần cuối
                  </dt>
                  <dd className="font-heading font-bold text-[#17231f] mt-0.5">
                    {doc.lastUpdated}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#758780] font-semibold">
                    Đơn vị ban hành
                  </dt>
                  <dd className="font-heading font-bold text-[#17231f] mt-0.5">
                    {BETECH_LEGAL_ENTITY.companyName} (MST:{' '}
                    {BETECH_LEGAL_ENTITY.taxId})
                  </dd>
                </div>
              </dl>

              {/* Core Commitments Summary Box */}
              <div className="bg-[#f6f8f6] rounded-[10px] border border-[#e5ece8] p-4 sm:p-5 space-y-2.5">
                <h2 className="font-heading text-xs font-extrabold uppercase tracking-[0.06em] text-[#176b51]">
                  Tóm tắt các cam kết cốt lõi
                </h2>
                <ul role="list" className="space-y-2">
                  {doc.summaryPoints.map((point, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2.5 text-xs sm:text-[13px] text-[#17231f] leading-relaxed"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-[#176b51] flex-none mt-2"
                        aria-hidden="true"
                      />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>

            {/* 2. Billing Policy Only: 3-Plan Standardized Quota Comparison Table */}
            {doc.slug === 'billing-policy' && (
              <section
                aria-labelledby="saas-plan-comparison-heading"
                className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-7 space-y-4"
              >
                <div className="space-y-1">
                  <h2
                    id="saas-plan-comparison-heading"
                    className="font-heading font-bold text-base sm:text-[18px] text-[#17231f]"
                  >
                    Bảng đối chiếu biểu phí và hạn mức 3 gói cước SaaS
                  </h2>
                  <p className="text-xs sm:text-[13px] text-[#516059] leading-relaxed">
                    Biểu phí và hạn mức dưới đây được chuẩn hóa đồng nhất trên
                    trang chủ, cổng đăng ký gian hàng và phân hệ quản lý bản
                    quyền.
                  </p>
                </div>

                <div
                  tabIndex={0}
                  role="region"
                  aria-labelledby="saas-plan-comparison-caption"
                  className="overflow-x-auto rounded-[10px] border border-[#e5ece8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
                >
                  <table className="w-full min-w-[640px] border-collapse text-left text-xs sm:text-[13px]">
                    <caption
                      id="saas-plan-comparison-caption"
                      className="sr-only"
                    >
                      Bảng so sánh biểu phí tháng, biểu phí năm và hạn mức tài
                      nguyên của 3 gói cước FIXO Repair OS
                    </caption>
                    <thead>
                      <tr className="bg-[#f6f8f6] border-b border-[#e5ece8]">
                        <th
                          scope="col"
                          className="sticky left-0 z-10 bg-[#f6f8f6] px-4 py-3 font-heading font-bold text-[#17231f] border-r border-[#e5ece8]"
                        >
                          Gói cước
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 font-heading font-bold text-[#17231f]"
                        >
                          Chu kỳ tháng
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 font-heading font-bold text-[#17231f]"
                        >
                          Chu kỳ năm
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 font-heading font-bold text-[#17231f]"
                        >
                          Hạn mức tài nguyên chuẩn hóa
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {SAAS_PLAN_QUOTA_LIST.map((plan) => (
                        <tr
                          key={plan.id}
                          className="border-b border-[#e5ece8] last:border-b-0 bg-white"
                        >
                          <th
                            scope="row"
                            className="sticky left-0 z-10 bg-white px-4 py-3.5 font-heading font-bold text-[#17231f] border-r border-[#e5ece8] align-top whitespace-nowrap"
                          >
                            <div className="flex flex-col items-start gap-1">
                              <span>{plan.name}</span>
                              {plan.id === 'standard' && (
                                <span className="inline-block px-2 py-0.5 rounded-[20px] bg-[#e9f4ef] border border-[#cde2d6] text-[10px] font-bold text-[#176b51]">
                                  Phổ biến cho cửa hàng
                                </span>
                              )}
                            </div>
                          </th>
                          <td className="px-4 py-3.5 font-heading font-bold text-[#176b51] align-top whitespace-nowrap">
                            {plan.priceMonthlyDisplay}
                          </td>
                          <td className="px-4 py-3.5 font-semibold text-[#516059] align-top whitespace-nowrap">
                            {plan.priceYearlyDisplay}
                          </td>
                          <td className="px-4 py-3.5 text-[#17231f] align-top">
                            <div className="font-semibold">
                              {plan.quotaSummary}
                            </div>
                            <p className="text-xs text-[#758780] mt-1 leading-relaxed">
                              {plan.description}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-[#516059]">
                  <span>
                    Mọi tài khoản đăng ký mới đều được trải nghiệm miễn phí
                    không yêu cầu thẻ tín dụng.
                  </span>
                  <Link
                    href="/register?plan=trial"
                    className="inline-flex items-center gap-1 font-bold text-[#176b51] hover:text-[#10583f] underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
                  >
                    <span>Khởi tạo gian hàng dùng thử</span>
                    <Icon name="chevronRight" size={14} />
                  </Link>
                </div>
              </section>
            )}

            {/* 3. Policy Sections List */}
            {doc.sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24 bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-7 space-y-4"
              >
                <div className="flex flex-wrap items-center gap-2.5 pb-3 border-b border-[#e5ece8]">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-[6px] bg-[#e9f4ef] border border-[#cde2d6] font-heading text-xs font-extrabold text-[#176b51]">
                    {section.number}
                  </span>
                  <h2 className="font-heading font-bold text-base sm:text-[18px] text-[#17231f] leading-snug">
                    {section.title}
                  </h2>
                </div>

                <div className="space-y-3">
                  {section.paragraphs.map((paragraph, pIdx) => (
                    <p
                      key={pIdx}
                      className="text-[13px] sm:text-sm text-[#17231f] leading-relaxed"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>

                {section.bullets && section.bullets.length > 0 && (
                  <ul role="list" className="space-y-2.5 pt-1">
                    {section.bullets.map((bullet, bIdx) => (
                      <li
                        key={bIdx}
                        className="flex items-start gap-2.5 text-[13px] sm:text-sm text-[#516059] leading-relaxed"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-[#176b51] flex-none mt-2"
                          aria-hidden="true"
                        />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {section.highlightNote && (
                  <div className="rounded-[9px] bg-[#e9f4ef] border border-[#cde2d6] p-3.5 sm:p-4 text-xs sm:text-[13px] text-[#17231f] leading-relaxed">
                    <strong className="font-heading font-bold text-[#176b51]">
                      Lưu ý quan trọng:{' '}
                    </strong>
                    <span>{section.highlightNote}</span>
                  </div>
                )}
              </section>
            ))}

            {/* 4. Legal Entity & Operating Organization Card */}
            <section
              id="thong-tin-phap-nhan"
              className="scroll-mt-24 bg-white rounded-[12px] border border-[#cde2d6] p-5 sm:p-7 space-y-5"
            >
              <div className="space-y-1.5 pb-4 border-b border-[#e5ece8]">
                <span className="inline-block text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#176b51]">
                  Định danh đơn vị chủ quản &amp; liên hệ chính thức
                </span>
                <h2 className="font-heading font-extrabold text-lg sm:text-xl text-[#17231f]">
                  Thông tin Pháp nhân &amp; Đơn vị Vận hành
                </h2>
                <p className="text-xs sm:text-[13px] text-[#516059] leading-relaxed">
                  Nền tảng phần mềm quản lý cửa hàng sửa chữa thiết bị công nghệ{' '}
                  <strong className="text-[#17231f]">
                    {BETECH_LEGAL_ENTITY.productName}
                  </strong>{' '}
                  được phát triển, sở hữu bản quyền và vận hành trực tiếp bởi:
                </p>
              </div>

              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-[13px]">
                <div className="rounded-[9px] bg-[#f6f8f6] border border-[#e5ece8] p-4 space-y-1 md:col-span-2">
                  <dt className="text-[#758780] font-semibold">
                    Tên pháp nhân doanh nghiệp
                  </dt>
                  <dd className="font-heading font-extrabold text-sm sm:text-base text-[#17231f]">
                    {BETECH_LEGAL_ENTITY.companyName}
                  </dd>
                  <dd className="text-xs text-[#516059] font-medium">
                    Tên quốc tế: {BETECH_LEGAL_ENTITY.internationalName}
                  </dd>
                </div>

                <div className="rounded-[9px] bg-[#f6f8f6] border border-[#e5ece8] p-4 space-y-1">
                  <dt className="text-[#758780] font-semibold">
                    Thương hiệu phát triển
                  </dt>
                  <dd className="font-heading font-bold text-[#17231f]">
                    <a
                      href="https://betech-digital.com/"
                      target="_blank"
                      rel="noopener"
                      className="text-[#176b51] hover:text-[#10583f] underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
                    >
                      {BETECH_LEGAL_ENTITY.brandName}
                    </a>
                  </dd>
                </div>

                <div className="rounded-[9px] bg-[#f6f8f6] border border-[#e5ece8] p-4 space-y-1">
                  <dt className="text-[#758780] font-semibold">Mã số thuế</dt>
                  <dd className="font-heading font-bold text-[#17231f]">
                    {BETECH_LEGAL_ENTITY.taxId}
                  </dd>
                </div>

                <div className="rounded-[9px] bg-[#f6f8f6] border border-[#e5ece8] p-4 space-y-1">
                  <dt className="text-[#758780] font-semibold">Trụ sở chính</dt>
                  <dd className="text-[#17231f] font-medium leading-relaxed">
                    {BETECH_LEGAL_ENTITY.headquartersAddress}
                  </dd>
                </div>

                <div className="rounded-[9px] bg-[#f6f8f6] border border-[#e5ece8] p-4 space-y-1">
                  <dt className="text-[#758780] font-semibold">Chi nhánh</dt>
                  <dd className="text-[#17231f] font-medium leading-relaxed">
                    {BETECH_LEGAL_ENTITY.branchAddress}
                  </dd>
                </div>

                <div className="rounded-[9px] bg-[#f6f8f6] border border-[#e5ece8] p-4 space-y-1">
                  <dt className="text-[#758780] font-semibold">
                    Hotline / Zalo hỗ trợ
                  </dt>
                  <dd className="font-heading font-bold text-[#17231f]">
                    <a
                      href="tel:0775600351"
                      className="text-[#176b51] hover:text-[#10583f] underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
                    >
                      {BETECH_LEGAL_ENTITY.hotline}
                    </a>
                  </dd>
                  <dd className="text-xs text-[#516059]">
                    Khung giờ: {BETECH_LEGAL_ENTITY.supportHours}
                  </dd>
                </div>

                <div className="rounded-[9px] bg-[#f6f8f6] border border-[#e5ece8] p-4 space-y-1">
                  <dt className="text-[#758780] font-semibold">
                    Email hỗ trợ &amp; pháp lý
                  </dt>
                  <dd className="font-heading font-bold text-[#17231f] break-all">
                    <a
                      href="mailto:admin@betech-digital.com"
                      className="text-[#176b51] hover:text-[#10583f] underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
                    >
                      {BETECH_LEGAL_ENTITY.email}
                    </a>
                  </dd>
                  <dd className="text-xs text-[#516059]">
                    Website chính thức:{' '}
                    <a
                      href="https://betech-digital.com/"
                      target="_blank"
                      rel="noopener"
                      className="font-semibold text-[#176b51] hover:text-[#10583f] underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
                    >
                      https://betech-digital.com/
                    </a>
                  </dd>
                </div>
              </dl>
            </section>
          </main>
        </div>
      </div>

      {/* Policy Hub Footer */}
      <footer className="bg-white border-t border-[#e5ece8] mt-8">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4 text-xs text-[#516059]">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-[#e5ece8]">
            <nav
              aria-label="Chính sách pháp lý"
              className="flex flex-wrap items-center gap-x-5 gap-y-2 font-semibold"
            >
              {POLICY_NAV_ITEMS.map((item) => (
                <Link
                  key={item.slug}
                  href={item.path}
                  aria-current={item.slug === doc.slug ? 'page' : undefined}
                  className={`transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51] ${
                    item.slug === doc.slug
                      ? 'text-[#176b51] font-bold'
                      : 'text-[#516059] hover:text-[#176b51]'
                  }`}
                >
                  {item.shortTitle}
                </Link>
              ))}
            </nav>

            <nav
              aria-label="Liên kết nhanh hệ thống"
              className="flex flex-wrap items-center gap-x-5 gap-y-2 font-semibold"
            >
              <Link
                href="/"
                className="hover:text-[#176b51] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
              >
                Trang chủ
              </Link>
              <Link
                href="/register"
                className="hover:text-[#176b51] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
              >
                Đăng ký gian hàng
              </Link>
              <Link
                href="/track"
                className="hover:text-[#176b51] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
              >
                Tra cứu đơn
              </Link>
              <Link
                href="/changelog"
                className="hover:text-[#176b51] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
              >
                Nhật ký cập nhật
              </Link>
            </nav>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[#758780]">
            <p>
              &copy; {new Date().getFullYear()}{' '}
              <strong className="text-[#17231f]">FIXO Repair OS</strong> — Sản
              phẩm của{' '}
              <a
                href="https://betech-digital.com/"
                target="_blank"
                rel="noopener"
                className="font-bold text-[#176b51] hover:text-[#10583f] underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
              >
                Betech Digital
              </a>{' '}
              ({BETECH_LEGAL_ENTITY.companyName} · MST:{' '}
              {BETECH_LEGAL_ENTITY.taxId}).
            </p>
            <p>
              Hotline / Zalo:{' '}
              <a
                href="tel:0775600351"
                className="font-semibold text-[#17231f] hover:text-[#176b51]"
              >
                {BETECH_LEGAL_ENTITY.hotline}
              </a>{' '}
              · Email:{' '}
              <a
                href="mailto:admin@betech-digital.com"
                className="font-semibold text-[#17231f] hover:text-[#176b51]"
              >
                {BETECH_LEGAL_ENTITY.email}
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
