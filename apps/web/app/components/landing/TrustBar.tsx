'use client';

import React from 'react';
import { Icon } from '@podscare/ui';

export const TrustBar: React.FC = () => {
  return (
    <div className="relative z-10 max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 -mt-6 sm:-mt-8 mb-12 sm:mb-16">
      <div className="bg-white rounded-2xl border border-[#e6ebe8] shadow-[0_10px_35px_rgba(16,37,31,0.06)] p-6 sm:p-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 divide-y lg:divide-y-0 lg:divide-x divide-[#e6ebe8]">
          {/* Stat 1 */}
          <div className="text-center pt-2 lg:pt-0">
            <div className="font-heading font-extrabold text-[28px] sm:text-[34px] text-[#176b58] leading-none tracking-tight">
              500+
            </div>
            <div className="text-[13px] sm:text-[14px] font-medium text-[#71817b] mt-1.5">
              Cửa hàng tin dùng
            </div>
          </div>

          {/* Stat 2 */}
          <div className="text-center pt-2 lg:pt-0">
            <div className="font-heading font-extrabold text-[28px] sm:text-[34px] text-[#176b58] leading-none tracking-tight">
              50.000+
            </div>
            <div className="text-[13px] sm:text-[14px] font-medium text-[#71817b] mt-1.5">
              Đơn sửa chữa mỗi tháng
            </div>
          </div>

          {/* Stat 3 */}
          <div className="text-center pt-6 lg:pt-0">
            <div className="font-heading font-extrabold text-[28px] sm:text-[34px] text-[#176b58] leading-none tracking-tight">
              100.000+
            </div>
            <div className="text-[13px] sm:text-[14px] font-medium text-[#71817b] mt-1.5">
              Khách hàng được phục vụ
            </div>
          </div>

          {/* Stat 4 */}
          <div className="text-center pt-6 lg:pt-0">
            <div className="font-heading font-extrabold text-[28px] sm:text-[34px] text-[#176b58] leading-none tracking-tight flex items-center justify-center gap-1">
              <span>4.9/5</span>
              <Icon name="star" size={24} className="text-[#f59e0b] fill-[#f59e0b] inline-block" />
            </div>
            <div className="text-[13px] sm:text-[14px] font-medium text-[#71817b] mt-1.5">
              Đánh giá từ khách hàng
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
