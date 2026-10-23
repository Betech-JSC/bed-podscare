import React from 'react';
import type { OrderStatusType } from '@podscare/types';

export interface StatusTagProps {
  label: string;
  type?: OrderStatusType;
  className?: string;
  showDot?: boolean;
}

const statusColorMap: Record<OrderStatusType, string> = {
  wait: 'text-[#b77a21] bg-[#faf3e7]',
  progress: 'text-[#4778a4] bg-[#edf4f8]',
  ready: 'text-[#28805e] bg-[#eaf5ef]',
  danger: 'text-[#bc5b52] bg-[#fbefed]',
  new: 'text-[#7e729c] bg-[#f2eff8]',
  gray: 'text-[#77847e] bg-[#f0f3f1]',
};

export const StatusTag: React.FC<StatusTagProps> = ({
  label,
  type = 'wait',
  className = '',
  showDot = true,
}) => {
  const colorClass = statusColorMap[type] || statusColorMap.gray;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[20px] text-xs font-semibold tracking-wide ${colorClass} ${className}`}
    >
      {showDot && <span className="w-1.5 h-1.5 rounded-full bg-current flex-none" />}
      <span>{label}</span>
    </span>
  );
};
