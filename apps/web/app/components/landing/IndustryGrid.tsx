'use client';

import React from 'react';
import { Icon } from '@podscare/ui';

interface IndustryItem {
  icon: string;
  name: string;
  subtext: string;
}

const INDUSTRIES: IndustryItem[] = [
  {
    icon: 'device',
    name: 'Điện thoại',
    subtext: 'iPhone, Samsung, Xiaomi...',
  },
  {
    icon: 'device',
    name: 'Laptop & Máy tính',
    subtext: 'MacBook, Dell, ThinkPad...',
  },
  {
    icon: 'headphones',
    name: 'Tai nghe & Âm thanh',
    subtext: 'AirPods, Sony, Bose...',
  },
  {
    icon: 'watch',
    name: 'Đồng hồ thông minh',
    subtext: 'Apple Watch, Garmin...',
  },
  {
    icon: 'device',
    name: 'Máy tính bảng',
    subtext: 'iPad, Galaxy Tab, Surface...',
  },
  {
    icon: 'wrench',
    name: 'Phụ kiện công nghệ',
    subtext: 'Sạc, Cáp, Bàn phím, Drone...',
  },
];

export const IndustryGrid: React.FC = () => {
  return (
    <section id="industries" className="py-20 sm:py-24 bg-white scroll-mt-20 border-b border-[#e6ebe8]">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="text-center max-w-[720px] mx-auto mb-16">
          <div className="inline-block px-3.5 py-1.5 rounded-full bg-[#e7f3ee] text-[#176b58] text-[11px] font-extrabold uppercase tracking-wider mb-4">
            PHÙ HỢP NHIỀU NGÀNH NGHỀ
          </div>
          <h2 className="font-heading font-extrabold text-[32px] sm:text-[42px] text-[#102d35] leading-tight tracking-[-1.5px] mb-4">
            Một phần mềm cho mọi cửa hàng sửa chữa
          </h2>
          <p className="text-[15px] sm:text-[16px] text-[#71817b] leading-relaxed">
            Dù bạn chuyên sửa điện thoại, laptop, thiết bị âm thanh hay mở rộng đa ngành hàng, FIXO đều dễ dàng cấu hình danh mục và quy trình phù hợp.
          </p>
        </div>

        {/* 6 Industries Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-5">
          {INDUSTRIES.map((item, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl p-6 border border-[#e6ebe8] hover:border-[#176b58]/50 hover:-translate-y-1 hover:shadow-[0_12px_24px_rgba(16,37,31,0.06)] transition-all text-center flex flex-col items-center justify-center group"
            >
              <div className="w-12 h-12 rounded-xl bg-[#f4f7f5] text-[#102d35] flex items-center justify-center mb-3 group-hover:bg-[#176b58] group-hover:text-white transition-colors">
                <Icon name={item.icon} size={24} />
              </div>
              <strong className="block text-[14px] sm:text-[15px] font-heading font-bold text-[#102d35] leading-tight">
                {item.name}
              </strong>
              <span className="block text-[11px] text-[#8a9691] mt-1 leading-tight">
                {item.subtext}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
