'use client';

import React from 'react';
import type { ThreadsSeedingStrategy } from '@podscare/types';

interface StrategyOption {
  key: ThreadsSeedingStrategy;
  title: string;
  badge: string;
  description: string;
  formula: string;
}

const STRATEGIES: StrategyOption[] = [
  {
    key: 'round_robin',
    title: 'Round-Robin Tự động',
    badge: 'Khuyến nghị · 1:1',
    description:
      'Tự động phân bổ đều 10 bài viết cho 10 tài khoản khác nhau đang Active. Mỗi nick đảm nhiệm duy nhất 1 bài để tối ưu độ phủ tự nhiên.',
    formula: '1 Bài viết <--> 1 Nick riêng biệt',
  },
  {
    key: 'manual',
    title: 'Chọn Nick Thủ công',
    badge: 'Tùy biến cao',
    description:
      'Cho phép bạn chủ động tick chọn danh sách các nick cụ thể trong nhóm 20 tài khoản để tham gia chiến dịch seeding này.',
    formula: 'Chỉ phân bổ vào các nick được tick chọn',
  },
  {
    key: 'cluster',
    title: 'Cluster Seeding (Tung hứng)',
    badge: 'Tạo luồng thảo luận',
    description:
      'Gán 2 tài khoản vào cùng 1 bài viết mục tiêu. Nick thứ hai sẽ bình luận sau nick thứ nhất tối thiểu 15 phút để tạo chuỗi thảo luận tự nhiên.',
    formula: '2 Nicks / 1 Bài viết (Giãn cách >= 15 phút)',
  },
];

interface StrategySelectorProps {
  value: ThreadsSeedingStrategy;
  onChange: (strategy: ThreadsSeedingStrategy) => void;
  disabled?: boolean;
}

export const StrategySelector: React.FC<StrategySelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-bold text-[#17231f] font-heading flex items-center gap-2">
          <span>Chiến lược phân bổ 20 Tài khoản</span>
        </label>
        <span className="text-[11px] text-[#516059]">
          Bảo vệ độ uy tín tài khoản với giãn cách ngẫu nhiên
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {STRATEGIES.map((strat) => {
          const isSelected = value === strat.key;
          return (
            <button
              key={strat.key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(strat.key)}
              className={`text-left p-3.5 rounded-[9px] border transition-all relative ${
                isSelected
                  ? 'bg-[#ffffff] border-[#176b51] ring-2 ring-[#176b51]/15 shadow-sm'
                  : 'bg-[#fafbfa] border-[#e2e9e4] hover:bg-[#ffffff] hover:border-[#cde2d8]'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`text-[13px] font-bold font-heading ${
                    isSelected ? 'text-[#176b51]' : 'text-[#17231f]'
                  }`}
                >
                  {strat.title}
                </span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-[5px] uppercase tracking-[0.5px] ${
                    isSelected
                      ? 'bg-[#eaf5ef] text-[#176b51]'
                      : 'bg-[#e9eeeb] text-[#516059]'
                  }`}
                >
                  {strat.badge}
                </span>
              </div>
              <p className="text-[12px] text-[#516059] leading-relaxed line-clamp-2 mb-2">
                {strat.description}
              </p>
              <div className="text-[11px] font-mono text-[#77847e] bg-[#f0f4f2] px-2 py-1 rounded-[5px]">
                {strat.formula}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
