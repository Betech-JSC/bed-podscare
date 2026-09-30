import React from 'react';
import { Icon } from '../atoms/Icons';

export interface StatCardProps {
  label: string;
  value: string | number;
  icon?: string;
  foot?: string;
  trend?: 'up' | 'down' | 'neutral';
  periodLabel?: string;
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon = 'clock',
  foot,
  trend = 'neutral',
  periodLabel = '',
  onClick,
  className = '',
}) => {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`bg-white border border-[#e5ece8] rounded-[10px] p-4 min-h-[115px] shadow-[0_2px_5px_rgba(36,60,41,0.03)] text-left flex flex-col justify-between transition-all ${
        onClick ? 'hover:-translate-y-0.5 hover:shadow-[0_7px_18px_rgba(28,49,34,0.05)] cursor-pointer' : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between text-[#687871] text-sm font-medium w-full">
        <span>{label}</span>
        <span className="w-8 h-8 rounded-[8px] bg-[#eff5f1] text-[#398066] grid place-items-center flex-none">
          <Icon name={icon} size={17} />
        </span>
      </div>

      <div className="font-heading font-bold text-[24px] md:text-[28px] tracking-[-0.8px] text-[#1c302b] my-2">
        {value}
      </div>

      {foot && (
        <div className="flex items-center gap-1.5 text-xs text-[#83918a]">
          <span
            className={
              trend === 'up'
                ? 'text-[#368361] font-bold'
                : trend === 'down'
                ? 'text-[#bd7650] font-bold'
                : 'text-[#687871] font-medium'
            }
          >
            {foot}
          </span>
          {periodLabel && <span className="text-[#9ba7a1]">{periodLabel}</span>}
        </div>
      )}
    </Component>
  );
};
