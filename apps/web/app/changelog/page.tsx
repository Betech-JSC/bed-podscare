import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { ChangelogView } from './ChangelogView';
import { CURRENT_APP_VERSION } from './changelogData';

export const metadata: Metadata = {
  title: `Nhật ký Cập nhật (${CURRENT_APP_VERSION}) & Lộ trình Phát triển | FIXO Repair OS`,
  description:
    'Theo dõi lịch sử phát hành từ v1.0.0 đến v1.5.0 và lộ trình phát triển tính năng mới của hệ điều hành quản lý cửa hàng sửa chữa thiết bị công nghệ FIXO Repair OS.',
};

export default function ChangelogPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f6f8f6] flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-[#cde2d6] border-t-[#176b51] animate-spin" />
            <span className="text-xs font-bold text-[#54645d]">
              Đang tải Nhật ký cập nhật &amp; Lộ trình phát triển...
            </span>
          </div>
        </div>
      }
    >
      <ChangelogView />
    </Suspense>
  );
}
