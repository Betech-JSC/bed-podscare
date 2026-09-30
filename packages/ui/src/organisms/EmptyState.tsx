import React from 'react';
import { Icon } from '../atoms/Icons';
import { Button } from '../atoms/Button';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Không có dữ liệu',
  description = 'Chưa có thông tin phù hợp với điều kiện tìm kiếm hoặc chưa có dữ liệu tiếp nhận.',
  icon = 'repairs',
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-[10px] bg-white border border-[#e5ece8] ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-[#f4f7f5] text-[#176b58] grid place-items-center mb-3">
        <Icon name={icon} size={24} />
      </div>
      <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">{title}</h3>
      <p className="text-sm text-[#7e8d85] max-w-[380px] mt-1.5 mb-4 leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="primary" size="md" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
