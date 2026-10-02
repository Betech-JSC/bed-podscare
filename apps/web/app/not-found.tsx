'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon, Button } from '@podscare/ui';

export default function NotFound() {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    <div className="min-h-[80vh] w-full flex items-center justify-center p-4 sm:p-6 bg-[#f4f7f5]">
      <div className="w-full max-w-[480px] bg-white rounded-[10px] border border-[#e5ece8] shadow-[0_2px_5px_rgba(36,60,41,0.03)] p-6 sm:p-8 text-center flex flex-col items-center">
        {/* Brand Search Icon Badge */}
        <div className="w-16 h-16 rounded-full bg-[#e7f3ee] text-[#176b58] flex items-center justify-center mb-4">
          <Icon name="search" size={30} />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[20px] text-[10px] font-bold uppercase tracking-[1.05px] text-[#176b58] bg-[#e7f3ee] mb-2">
          404 · Không Tìm Thấy
        </div>

        <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#1c302b] tracking-tight">
          Trang không tồn tại
        </h1>

        <p className="font-sans text-sm text-[#758780] mt-2 mb-6 leading-relaxed max-w-[380px]">
          Đường dẫn bạn vừa truy cập không tồn tại hoặc đã được di chuyển trên hệ điều hành FIXO Repair OS.
        </p>

        {/* Action Button: History Back */}
        <Button
          variant="primary"
          size="md"
          icon="arrow"
          onClick={handleBack}
          className="w-full sm:w-auto"
        >
          ← Quay lại trang trước
        </Button>

        {/* Secondary Safe Fallback Link */}
        <div className="mt-4 pt-3 border-t border-[#f0f3f1] w-full">
          <Link
            href="/"
            className="text-xs font-semibold text-[#176b58] hover:text-[#125344] hover:underline transition-colors"
          >
            Hoặc về trang chủ / tổng quan
          </Link>
        </div>
      </div>
    </div>
  );
}
