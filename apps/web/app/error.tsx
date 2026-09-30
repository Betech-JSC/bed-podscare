'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { Icon, Button } from '@podscare/ui';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Ghi log lỗi runtime để phục vụ truy vết và giám sát hệ thống
    console.error('PodsCare Route Runtime Error:', error);
  }, [error]);

  return (
    <div className="min-h-[75vh] w-full flex items-center justify-center p-4 sm:p-6 bg-[#f4f7f5]">
      <div className="w-full max-w-[480px] bg-white rounded-[10px] border border-[#e5ece8] shadow-[0_2px_5px_rgba(36,60,41,0.03)] p-6 sm:p-8 text-center flex flex-col items-center">
        {/* Danger Alert Icon Badge */}
        <div className="w-14 h-14 rounded-full bg-[#fbefed] text-[#bc5b52] flex items-center justify-center mb-4">
          <Icon name="alert" size={28} />
        </div>

        <span className="text-[10px] font-bold uppercase tracking-[1.05px] text-[#758780] mb-1">
          PodsCare Repair OS · Lỗi Phân Tuyến
        </span>

        <h1 className="font-heading font-bold text-xl sm:text-2xl text-[#1c302b] tracking-tight">
          Đã xảy ra sự cố gián đoạn
        </h1>

        <p className="font-sans text-sm text-[#758780] mt-2 mb-6 leading-relaxed max-w-[380px]">
          Hệ thống gặp lỗi ngoài dự kiến trong khi tải hoặc xử lý dữ liệu của trang. Vui lòng thử khôi phục lại trạng thái hoặc quay về trang chủ.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
          <Button
            variant="primary"
            size="md"
            icon="refresh"
            onClick={() => reset()}
            className="w-full sm:w-auto"
          >
            Thử lại
          </Button>

          <Link href="/" className="w-full sm:w-auto">
            <Button
              variant="secondary"
              size="md"
              icon="dashboard"
              className="w-full sm:w-auto"
            >
              Về trang chủ
            </Button>
          </Link>
        </div>

        {/* Technical Error Details */}
        {error && (
          <details className="mt-6 text-left w-full text-xs text-[#758780] bg-[#fafbfa] p-3 rounded-[8px] border border-[#e5ece8]">
            <summary className="cursor-pointer font-semibold text-[#1c302b] select-none flex items-center gap-1.5">
              <Icon name="wrench" size={14} className="text-[#758780]" />
              <span>Chi tiết kỹ thuật</span>
            </summary>
            <div className="mt-2.5 pt-2 border-t border-[#e5ece8] space-y-1">
              {error.digest && (
                <p className="font-mono text-[11px] text-[#758780]">
                  Mã digest: <span className="text-[#1c302b] font-medium">{error.digest}</span>
                </p>
              )}
              <pre className="whitespace-pre-wrap font-mono text-[11px] text-[#bc5b52] overflow-x-auto p-1.5 rounded bg-white border border-[#e5ece8]">
                {error.message || 'Lỗi không xác định'}
              </pre>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
