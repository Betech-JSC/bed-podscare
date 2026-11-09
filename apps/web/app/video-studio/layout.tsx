import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'PodsCare · Cắt vấp Video',
  description: 'Công cụ tự động cắt đoạn nói vấp, khoảng lặng dài và xuất dự án CapCut cho video lời nói tiếng Việt.',
};

export default function VideoStudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
