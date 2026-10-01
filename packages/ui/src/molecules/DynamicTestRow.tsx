'use client';

import React from 'react';
import type { ChecklistStatus } from '@podscare/types';

export interface DynamicTestRowProps {
  label: string;
  name?: string;
  value?: ChecklistStatus;
  onChange?: (status: ChecklistStatus) => void;
  disabled?: boolean;
}

export const DynamicTestRow: React.FC<DynamicTestRowProps> = ({
  label,
  value = 'Không kiểm tra',
  onChange,
  disabled = false,
}) => {
  const options: {
    status: ChecklistStatus;
    icon: string;
    text: string;
    activeBtnClass: string;
    inactiveBtnClass: string;
    activeIconClass: string;
    inactiveIconClass: string;
  }[] = [
    {
      status: 'Hoạt động',
      icon: '✓',
      text: 'Hoạt động',
      activeBtnClass: 'bg-[#e7f3ec] border-[#91c4a6] text-[#287452] shadow-xs',
      inactiveBtnClass:
        'bg-white border-[#dfe7e2] text-[#708078] hover:bg-[#f6f9f7] hover:border-[#ccd7d0] hover:text-[#37453f]',
      activeIconClass: 'bg-[#287452] text-white border-[#287452]',
      inactiveIconClass: 'border-[#cbd3ce] text-[#9aa69f] bg-transparent',
    },
    {
      status: 'Lỗi',
      icon: '!',
      text: 'Lỗi',
      activeBtnClass: 'bg-[#fbeeed] border-[#e6b2ac] text-[#b85c51] shadow-xs',
      inactiveBtnClass:
        'bg-white border-[#dfe7e2] text-[#708078] hover:bg-[#fcf5f4] hover:border-[#dfc3bf] hover:text-[#37453f]',
      activeIconClass: 'bg-[#b85c51] text-white border-[#b85c51]',
      inactiveIconClass: 'border-[#cbd3ce] text-[#9aa69f] bg-transparent',
    },
    {
      status: 'Không kiểm tra',
      icon: '—',
      text: 'Không test',
      activeBtnClass: 'bg-[#f1f3f2] border-[#cbd3ce] text-[#55635c] shadow-xs',
      inactiveBtnClass:
        'bg-white border-[#dfe7e2] text-[#708078] hover:bg-[#f7f9f8] hover:border-[#cbd3ce] hover:text-[#37453f]',
      activeIconClass: 'bg-[#79857e] text-white border-[#79857e]',
      inactiveIconClass: 'border-[#cbd3ce] text-[#9aa69f] bg-transparent',
    },
  ];

  const handleSelect = (e: React.MouseEvent<HTMLButtonElement>, status: ChecklistStatus) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    onChange?.(status);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 md:px-3 md:py-2.5 border-b border-[#f0f3f1] last:border-b-0 gap-2 sm:gap-3 hover:bg-[#fbfcfb] transition-colors">
      <span className="text-xs sm:text-sm font-semibold text-[#37453f]">{label}</span>
      <div
        className="flex items-center gap-1.5 sm:gap-2 flex-wrap"
        role="group"
        aria-label={`Trạng thái kiểm tra ${label}`}
      >
        {options.map((opt) => {
          const isSelected = value === opt.status;
          return (
            <button
              key={opt.status}
              type="button"
              disabled={disabled}
              onClick={(e) => handleSelect(e, opt.status)}
              aria-pressed={isSelected}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:py-1 rounded-[6px] text-xs font-semibold border transition-all select-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#176b51]/30 active:scale-[0.98] touch-manipulation ${
                disabled ? 'opacity-60 cursor-not-allowed' : ''
              } ${isSelected ? opt.activeBtnClass : opt.inactiveBtnClass}`}
            >
              <span
                className={`w-4 h-4 rounded-full border text-[10px] font-bold grid place-items-center transition-colors not-italic leading-none ${
                  isSelected ? opt.activeIconClass : opt.inactiveIconClass
                }`}
              >
                {opt.icon}
              </span>
              <span>{opt.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
