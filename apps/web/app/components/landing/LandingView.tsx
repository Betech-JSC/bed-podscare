'use client';

import React, { useState } from 'react';
import { usePodsCare } from '../../providers';
import { LandingNavbar } from './LandingNavbar';
import { LandingHero } from './LandingHero';
import { TrustBar } from './TrustBar';
import { FeatureGrid } from './FeatureGrid';
import { IndustryGrid } from './IndustryGrid';
import { WorkflowSteps } from './WorkflowSteps';
import { PricingSection } from './PricingSection';
import { CTASection } from './CTASection';
import { LandingFooter } from './LandingFooter';
import { VideoModal } from './VideoModal';

export const LandingView: React.FC = () => {
  const { isAuthenticated } = usePodsCare();
  const [isVideoOpen, setIsVideoOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f6f8f6] text-[#1c302b] flex flex-col font-sans selection:bg-[#c8eadb] selection:text-[#176b58]">
      {/* Sticky Navigation Bar */}
      <LandingNavbar isAuthenticated={isAuthenticated} />

      {/* Main Landing Sections */}
      <main className="flex-1">
        {/* Hero Section with Live Mockup */}
        <LandingHero
          isAuthenticated={isAuthenticated}
          onOpenVideo={() => setIsVideoOpen(true)}
        />

        {/* Quantified Social Proof Trust Bar */}
        <TrustBar />

        {/* 8-Module Business Feature Grid */}
        <FeatureGrid />

        {/* 6-Industry Application Grid */}
        <IndustryGrid />

        {/* 4-Step Standardized Operational Workflow */}
        <WorkflowSteps />

        {/* 3-Tier SaaS Transparent Pricing Matrix */}
        <PricingSection />

        {/* Bottom Dark Forest Conversion Banner */}
        <CTASection />
      </main>

      {/* Global Brand Footer */}
      <LandingFooter />

      {/* Interactive Video Demonstration Modal */}
      <VideoModal isOpen={isVideoOpen} onClose={() => setIsVideoOpen(false)} />
    </div>
  );
};
