import React from 'react';
import { Icon } from '../atoms/Icons';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  selectValue?: string;
  onSelectChange?: (value: string) => void;
  selectOptions?: FilterOption[];
  selectPlaceholder?: string;
  actions?: React.ReactNode;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = '⌕  Tìm mã đơn, khách hàng...',
  selectValue,
  onSelectChange,
  selectOptions,
  selectPlaceholder = 'Tất cả trạng thái',
  actions,
  className = '',
}) => {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 mb-4 ${className}`}>
      <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[340px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#91a098] pointer-events-none">
            <Icon name="search" size={16} />
          </span>
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-10 pl-9 pr-3 border border-[#e4eae6] rounded-[8px] text-sm text-[#2b3a32] bg-white outline-none focus:border-[#75a994] focus:ring-2 focus:ring-[#176b58]/10 transition-all placeholder:text-[#9aa59f]"
          />
        </div>

        {/* Select filter */}
        {selectOptions && onSelectChange && (
          <select
            value={selectValue}
            onChange={(e) => onSelectChange(e.target.value)}
            className="h-10 border border-[#e4eae6] rounded-[8px] px-3 text-sm text-[#54645c] bg-white outline-none focus:border-[#75a994] cursor-pointer"
          >
            {selectPlaceholder && <option value="">{selectPlaceholder}</option>}
            {selectOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
};
