'use client';

import React, { useCallback } from 'react';
import type { ChecklistStatus } from '@podscare/types';
import { Icon } from '../atoms/Icons';

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
    keyHint: string;
    text: string;
    activeBtnClass: string;
    inactiveBtnClass: string;
    activeIconClass: string;
    inactiveIconClass: string;
    renderIndicator: () => React.ReactNode;
  }[] = [
    {
      status: 'Hoạt động',
      keyHint: '1',
      text: 'Hoạt động',
      activeBtnClass: 'bg-[#eaf5ef] border-[#28805e] text-[#28805e] shadow-xs',
      inactiveBtnClass:
        'bg-white border-[#e9eeeb] text-[#81908a] hover:bg-[#f6f8f6] hover:border-[#ccd7d0] hover:text-[#17231f]',
      activeIconClass: 'bg-[#28805e] text-white border-[#28805e]',
      inactiveIconClass: 'border-[#cbd3ce] text-[#9aa59f] bg-transparent',
      renderIndicator: () => <Icon name="check" size={10} />,
    },
    {
      status: 'Lỗi',
      keyHint: '2',
      text: 'Lỗi',
      activeBtnClass: 'bg-[#fbefed] border-[#bc5b52] text-[#bc5b52] shadow-xs',
      inactiveBtnClass:
        'bg-white border-[#e9eeeb] text-[#81908a] hover:bg-[#fcf5f4] hover:border-[#dfc3bf] hover:text-[#17231f]',
      activeIconClass: 'bg-[#bc5b52] text-white border-[#bc5b52]',
      inactiveIconClass: 'border-[#cbd3ce] text-[#9aa59f] bg-transparent',
      renderIndicator: () => <span>!</span>,
    },
    {
      status: 'Không kiểm tra',
      keyHint: '3',
      text: 'Không test',
      activeBtnClass: 'bg-[#f0f3f1] border-[#cbd3ce] text-[#77847e] shadow-xs',
      inactiveBtnClass:
        'bg-white border-[#e9eeeb] text-[#81908a] hover:bg-[#f7f9f8] hover:border-[#cbd3ce] hover:text-[#17231f]',
      activeIconClass: 'bg-[#77847e] text-white border-[#77847e]',
      inactiveIconClass: 'border-[#cbd3ce] text-[#9aa59f] bg-transparent',
      renderIndicator: () => <span>-</span>,
    },
  ];

  const handleSelect = (e: React.MouseEvent<HTMLButtonElement>, status: ChecklistStatus) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    onChange?.(status);
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.key === '1') {
        e.preventDefault();
        onChange?.('Hoạt động');
      } else if (e.key === '2') {
        e.preventDefault();
        onChange?.('Lỗi');
      } else if (e.key === '3') {
        e.preventDefault();
        onChange?.('Không kiểm tra');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const order: ChecklistStatus[] = ['Hoạt động', 'Lỗi', 'Không kiểm tra'];
        const nextIdx = (order.indexOf(value) + 1) % order.length;
        onChange?.(order[nextIdx]);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const order: ChecklistStatus[] = ['Hoạt động', 'Lỗi', 'Không kiểm tra'];
        const prevIdx = (order.indexOf(value) - 1 + order.length) % order.length;
        onChange?.(order[prevIdx]);
      }
    },
    [disabled, onChange, value]
  );

  return (
    <div
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 md:px-3 md:py-2.5 border-b border-[#e9eeeb] last:border-b-0 gap-2 sm:gap-3 hover:bg-[#fafbfa] focus:bg-[#f6f8f6] focus:outline-none transition-colors"
    >
      <span className="text-xs sm:text-sm font-semibold text-[#17231f]">{label}</span>
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
              title={`${opt.text} (Phím ${opt.keyHint})`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:py-1 rounded-[6px] text-xs font-semibold border transition-all select-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#176b51]/30 active:scale-[0.98] touch-manipulation ${
                disabled ? 'opacity-60 cursor-not-allowed' : ''
              } ${isSelected ? opt.activeBtnClass : opt.inactiveBtnClass}`}
            >
              <span
                className={`w-4 h-4 rounded-full border text-[10px] font-bold grid place-items-center transition-colors not-italic leading-none ${
                  isSelected ? opt.activeIconClass : opt.inactiveIconClass
                }`}
              >
                {opt.renderIndicator()}
              </span>
              <span>{opt.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

