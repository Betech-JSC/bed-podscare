import React from 'react';
import type { Metadata } from 'next';
import { LandingPreview } from './LandingPreview';
import {
  BETECH_LEGAL_ENTITY,
  SAAS_PLAN_QUOTAS,
  buildOrganizationJsonLd,
} from './components/policies/policyData';

export const metadata: Metadata = {
  title: 'FIXO — Phần mềm quản lý cửa hàng sửa chữa điện thoại, laptop, thiết bị công nghệ',
  description:
    'FIXO giúp cửa hàng sửa chữa quản lý đơn sửa chữa, khách hàng, linh kiện, kho, bảo hành điện tử, thu chi và doanh thu trên một nền tảng B2B SaaS duy nhất do Betech Digital phát triển.',
  keywords: [
    'phần mềm quản lý sửa chữa',
    'quản lý tiệm sửa điện thoại',
    'phần mềm sửa chữa laptop',
    'FIXO',
    'FIXO Repair OS',
    'Betech Digital',
    'bảo hành điện tử',
    'quản lý kho linh kiện',
    'phần mềm sửa chữa công nghệ',
  ],
  authors: [
    {
      name: BETECH_LEGAL_ENTITY.brandName,
      url: BETECH_LEGAL_ENTITY.websiteUrl,
    },
  ],
  creator: BETECH_LEGAL_ENTITY.companyName,
  publisher: BETECH_LEGAL_ENTITY.brandName,
  alternates: {
    canonical: BETECH_LEGAL_ENTITY.productUrl,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'FIXO — Phần mềm quản lý cửa hàng sửa chữa thiết bị công nghệ',
    description:
      'Quản lý toàn diện quy trình tiếp nhận, kho linh kiện, bảo hành điện tử và doanh thu cửa hàng trên một hệ thống B2B SaaS chuẩn hóa do Betech Digital phát triển.',
    url: BETECH_LEGAL_ENTITY.productUrl,
    siteName: BETECH_LEGAL_ENTITY.productName,
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FIXO — Phần mềm quản lý cửa hàng sửa chữa thiết bị công nghệ',
    description:
      'Quản lý cửa hàng sửa chữa dễ dàng, chuyên nghiệp hơn với nền tảng FIXO Repair OS do Betech Digital phát triển và vận hành.',
  },
};

const developerOrganization = buildOrganizationJsonLd();

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: BETECH_LEGAL_ENTITY.productName,
  url: BETECH_LEGAL_ENTITY.productUrl,
  inLanguage: 'vi-VN',
  operatingSystem: 'All (Web Cloud-based, macOS, Windows, iOS, Android)',
  applicationCategory: 'BusinessApplication',
  description:
    'Nền tảng B2B SaaS quản lý toàn diện quy trình tiếp nhận, kho linh kiện, bảo hành điện tử và doanh thu cho cửa hàng sửa chữa thiết bị công nghệ do Betech Digital (CÔNG TY TNHH DỊCH VỤ GIẢI PHÁP SỐ BETECH) phát triển và vận hành.',
  offers: [
    {
      '@type': 'Offer',
      price: String(SAAS_PLAN_QUOTAS.trial.priceMonthly),
      priceCurrency: 'VND',
      name: SAAS_PLAN_QUOTAS.trial.name,
      description: `Trải nghiệm miễn phí 1 năm (${SAAS_PLAN_QUOTAS.trial.quotaSummary})`,
    },
    {
      '@type': 'Offer',
      price: String(SAAS_PLAN_QUOTAS.standard.priceMonthly),
      priceCurrency: 'VND',
      name: SAAS_PLAN_QUOTAS.standard.name,
      description: `${SAAS_PLAN_QUOTAS.standard.billingSummary} (${SAAS_PLAN_QUOTAS.standard.quotaSummary})`,
    },
    {
      '@type': 'Offer',
      price: String(SAAS_PLAN_QUOTAS.pro.priceMonthly),
      priceCurrency: 'VND',
      name: SAAS_PLAN_QUOTAS.pro.name,
      description: `${SAAS_PLAN_QUOTAS.pro.billingSummary} (${SAAS_PLAN_QUOTAS.pro.quotaSummary})`,
    },
  ],
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.9',
    reviewCount: '520',
  },
  author: developerOrganization,
  creator: developerOrganization,
  publisher: developerOrganization,
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPreview />
    </>
  );
}
