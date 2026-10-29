import React from 'react';
import type { Metadata } from 'next';
import { PolicyPageLayout } from '../components/policies/PolicyPageLayout';
import {
  BETECH_LEGAL_ENTITY,
  buildPolicyJsonLd,
  getPolicyDocument,
} from '../components/policies/policyData';

const doc = getPolicyDocument('privacy');
const jsonLd = buildPolicyJsonLd('privacy');

export const metadata: Metadata = {
  title: doc.seoTitle,
  description: doc.seoDescription,
  authors: [
    {
      name: BETECH_LEGAL_ENTITY.brandName,
      url: BETECH_LEGAL_ENTITY.websiteUrl,
    },
  ],
  creator: BETECH_LEGAL_ENTITY.companyName,
  publisher: BETECH_LEGAL_ENTITY.brandName,
  alternates: {
    canonical: `${BETECH_LEGAL_ENTITY.productUrl}${doc.path}`,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: doc.seoTitle,
    description: doc.seoDescription,
    url: `${BETECH_LEGAL_ENTITY.productUrl}${doc.path}`,
    siteName: BETECH_LEGAL_ENTITY.productName,
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: doc.seoTitle,
    description: doc.seoDescription,
  },
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PolicyPageLayout activeSlug="privacy" />
    </>
  );
}
