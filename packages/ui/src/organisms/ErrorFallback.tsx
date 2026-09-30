import React from 'react';
import { Icon } from '../atoms/Icons';
import { Button } from '../atoms/Button';

export interface ErrorFallbackProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  technicalError?: string;
  className?: string;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  title = 'Không thể tải dữ liệu từ máy chủ',
  message = 'Đã có sự cố khi kết nối tới hệ thống hoặc đường truyền mạng bị gián đoạn. Vui lòng thử lại.',
  onRetry,
  technicalError,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-[10px] bg-white border border-[#fbefed] shadow-xs ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-[#fbefed] text-[#bc5b52] grid place-items-center mb-3">
        <Icon name="alert" size={24} />
      </div>
      <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">{title}</h3>
      <p className="text-sm text-[#7e8d85] max-w-[420px] mt-1.5 mb-4 leading-relaxed">
        {message}
      </p>

      {onRetry && (
        <Button variant="primary" size="md" icon="refresh" onClick={onRetry}>
          Thử lại
        </Button>
      )}

      {technicalError && (
        <details className="mt-4 text-left max-w-[460px] w-full text-xs text-[#708078] bg-[#f6f8f6] p-3 rounded-[8px] border border-[#e5ece8]">
          <summary className="cursor-pointer font-bold select-none">Chi tiết kỹ thuật</summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs overflow-x-auto text-[#bc5b52]">
            {technicalError}
          </pre>
        </details>
      )}
    </div>
  );
};
