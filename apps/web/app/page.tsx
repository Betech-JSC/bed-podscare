import React from 'react';
import type { Metadata } from 'next';
import { LandingPreview } from './LandingPreview';

export const metadata: Metadata = {
  title: 'FIXO — Phần mềm quản lý cửa hàng sửa chữa điện thoại, laptop, thiết bị công nghệ',
  description:
    'FIXO giúp cửa hàng sửa chữa quản lý đơn sửa chữa, khách hàng, linh kiện, kho, bảo hành điện tử, thu chi và doanh thu trên một nền tảng duy nhất.',
  keywords: [
    'phần mềm quản lý sửa chữa',
    'quản lý tiệm sửa điện thoại',
    'phần mềm sửa chữa laptop',
    'FIXO',
    'FIXO Repair OS',
    'bảo hành điện tử',
    'quản lý kho linh kiện',
    'phần mềm sửa chữa công nghệ',
  ],
  authors: [{ name: 'FIXO Vietnam' }],
  creator: 'FIXO Repair Operating System',
  publisher: 'FIXO Vietnam',
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'FIXO — Phần mềm quản lý cửa hàng sửa chữa thiết bị công nghệ',
    description:
      'Quản lý toàn diện quy trình tiếp nhận, kho linh kiện, bảo hành điện tử và doanh thu cửa hàng trên một hệ thống chuẩn hóa.',
    url: 'https://fixo.com.vn',
    siteName: 'FIXO Repair OS',
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FIXO — Phần mềm quản lý cửa hàng sửa chữa',
    description:
      'Quản lý cửa hàng sửa chữa dễ dàng, chuyên nghiệp hơn với FIXO Repair Operating System.',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'FIXO Repair OS',
  operatingSystem: 'All (Web Cloud-based, macOS, Windows, iOS, Android)',
  applicationCategory: 'BusinessApplication',
  description:
    'Nền tảng B2B SaaS quản lý toàn diện quy trình tiếp nhận, kho linh kiện, bảo hành điện tử và doanh thu cho cửa hàng sửa chữa thiết bị công nghệ.',
  offers: [
    {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'VND',
      name: 'Gói Dùng thử',
      description: 'Trải nghiệm miễn phí 14 ngày đầy đủ tính năng',
    },
    {
      '@type': 'Offer',
      price: '299000',
      priceCurrency: 'VND',
      name: 'Gói Tiêu chuẩn',
      description: 'Phù hợp cửa hàng sửa chữa độc lập',
    },
    {
      '@type': 'Offer',
      price: '599000',
      priceCurrency: 'VND',
      name: 'Gói Chuyên nghiệp',
      description: 'Phù hợp chuỗi nhiều chi nhánh và trung tâm bảo hành',
    },
  ],
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.9',
    reviewCount: '520',
  },
  author: {
    '@type': 'Organization',
    name: 'FIXO Vietnam',
    url: 'https://fixo.com.vn',
  },
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
