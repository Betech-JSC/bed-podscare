import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'PodsCare · Quản trị Mạng 20 Tài khoản Threads',
  description:
    'Hệ thống quản trị tập trung và tự động lên lịch xuất bản cho mạng lưới 20 tài khoản Threads thuộc sở hữu công ty qua Meta Threads Graph API v1.0.',
};

export default function ThreadsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
