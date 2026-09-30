'use client';

import React, { useEffect } from 'react';
import { Icon, Button } from '@podscare/ui';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Ghi log lỗi cấp layout gốc (root layout error)
    console.error('PodsCare Global Root Error:', error);
  }, [error]);

  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    } else {
      reset();
    }
  };

  return (
    <html lang="vi">
      <body className="min-h-screen bg-[#f4f7f5] text-[#1c302b] flex items-center justify-center p-4 antialiased font-sans">
        <div className="w-full max-w-[500px] bg-white rounded-[10px] border border-[#e5ece8] shadow-[0_24px_90px_rgba(18,37,27,0.18)] p-6 sm:p-8 text-center flex flex-col items-center">
          {/* Danger Alert Icon Badge */}
          <div className="w-16 h-16 rounded-full bg-[#fbefed] text-[#bc5b52] flex items-center justify-center mb-4">
            <Icon name="alert" size={32} />
          </div>

          <span className="text-[10px] font-bold uppercase tracking-[1.05px] text-[#758780] mb-1">
            PodsCare Repair OS · Hệ Thống Cốt Lõi
          </span>

          <h1 className="font-heading font-extrabold text-2xl text-[#1c302b] tracking-tight">
            Sự cố hệ thống nghiêm trọng
          </h1>

          <p className="font-sans text-sm text-[#758780] mt-2 mb-6 leading-relaxed max-w-[400px]">
            Hệ thống giao diện gốc gặp lỗi ngoài dự kiến và không thể tiếp tục kết xuất. Dữ liệu của bạn được an toàn. Vui lòng tải lại ứng dụng để khôi phục.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
            <Button
              variant="primary"
              size="md"
              icon="refresh"
              onClick={handleReload}
              className="w-full sm:w-auto"
            >
              Tải lại trang
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon="rotate"
              onClick={() => reset()}
              className="w-full sm:w-auto"
            >
              Thử khôi phục
            </Button>
          </div>

          {error && (
            <details className="mt-6 text-left w-full text-xs text-[#758780] bg-[#fafbfa] p-3 rounded-[8px] border border-[#e5ece8]">
              <summary className="cursor-pointer font-semibold text-[#1c302b] select-none flex items-center gap-1.5">
                <Icon name="wrench" size={14} className="text-[#758780]" />
                <span>Chi tiết lỗi hệ thống</span>
              </summary>
              <div className="mt-2.5 pt-2 border-t border-[#e5ece8] space-y-1">
                {error.digest && (
                  <p className="font-mono text-[11px] text-[#758780]">
                    Mã chẩn đoán: <span className="text-[#1c302b] font-medium">{error.digest}</span>
                  </p>
                )}
                <pre className="whitespace-pre-wrap font-mono text-[11px] text-[#bc5b52] overflow-x-auto p-1.5 rounded bg-white border border-[#e5ece8]">
                  {error.message || 'Lỗi cấp ứng dụng không xác định'}
                </pre>
              </div>
            </details>
          )}
        </div>
      </body>
    </html>
  );
}
