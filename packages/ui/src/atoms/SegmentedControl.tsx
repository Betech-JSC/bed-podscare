'use client';

import React, { useCallback } from 'react';

export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: string;
  shortcutKey?: string;
  activeClassName?: string;
  dotColorClassName?: string;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  disabled = false,
  size = 'sm',
  ariaLabel = 'Lựa chọn trạng thái',
  className = '',
}: SegmentedControlProps<T>) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled || options.length === 0) return;

      // Phím số 1, 2, 3 chọn nhanh theo thứ tự option
      if (e.key === '1' && options[0]) {
        e.preventDefault();
        onChange(options[0].value);
        return;
      }
      if (e.key === '2' && options[1]) {
        e.preventDefault();
        onChange(options[1].value);
        return;
      }
      if (e.key === '3' && options[2]) {
        e.preventDefault();
        onChange(options[2].value);
        return;
      }

      const currentIdx = options.findIndex((o) => o.value === value);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = currentIdx < options.length - 1 ? currentIdx + 1 : 0;
        onChange(options[nextIdx].value);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = currentIdx > 0 ? currentIdx - 1 : options.length - 1;
        onChange(options[prevIdx].value);
      }
    },
    [disabled, onChange, options, value]
  );

  const sizeClass =
    size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-xs sm:text-sm';

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      className={`inline-flex items-center p-0.5 rounded-[8px] bg-[#f0f3f1] border border-[#e9eeeb] focus:outline-none focus:ring-2 focus:ring-[#176b51]/25 select-none ${
        disabled ? 'opacity-60 cursor-not-allowed' : ''
      } ${className}`}
    >
      {options.map((opt, idx) => {
        const isSelected = opt.value === value;
        const defaultActiveClass =
          'bg-white text-[#17231f] border-[#d6e0db] shadow-card font-bold';
        const activeClass = opt.activeClassName || defaultActiveClass;

        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!disabled) onChange(opt.value);
            }}
            title={
              opt.shortcutKey
                ? `${opt.label} (Phím ${opt.shortcutKey})`
                : `${opt.label} (Phím ${idx + 1})`
            }
            className={`${sizeClass} inline-flex items-center justify-center gap-1.5 rounded-[6px] border transition-all duration-150 cursor-pointer ${
              isSelected
                ? activeClass
                : 'border-transparent bg-transparent text-[#81908a] hover:text-[#17231f] font-medium'
            }`}
          >
            {opt.dotColorClassName && (
              <span
                className={`w-1.5 h-1.5 rounded-full flex-none ${
                  isSelected ? opt.dotColorClassName : 'bg-[#9aa59f]'
                }`}
              />
            )}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
