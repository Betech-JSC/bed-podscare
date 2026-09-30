import React from 'react';
import type { OrderStatusType } from '@podscare/types';

export interface StatusTagProps {
  label: string;
  type?: OrderStatusType;
  className?: string;
  showDot?: boolean;
}

const statusColorMap: Record<OrderStatusType, string> = {
  wait: 'text-[#9a6b28] bg-[#fbf3e5]',
  progress: 'text-[#477b98] bg-[#edf4f7]',
  ready: 'text-[#28765a] bg-[#e9f4ed]',
  danger: 'text-[#ad5148] bg-[#fbefed]',
  new: 'text-[#78699b] bg-[#f2eff8]',
  gray: 'text-[#687a72] bg-[#eef2ef]',
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
