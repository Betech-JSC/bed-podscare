'use client';

import React from 'react';
import Link from 'next/link';

export const CTASection: React.FC = () => {
  return (
    <section className="py-16 sm:py-20 bg-white">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative bg-[#102d35] rounded-3xl p-8 sm:p-14 lg:p-16 text-center text-white overflow-hidden shadow-xl">
          {/* Subtle Ambient Glow */}
          <div
            className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-[#176b58]/20 blur-3xl pointer-events-none"
            aria-hidden="true"
          />
          <div
            className="absolute -left-24 -bottom-24 w-96 h-96 rounded-full bg-[#176b58]/15 blur-3xl pointer-events-none"
            aria-hidden="true"
          />

          <div className="relative z-10 max-w-3xl mx-auto">
            {/* Tag */}
            <div className="inline-block px-3.5 py-1.5 rounded-full bg-white/10 text-[#b8e4d3] text-[11px] font-extrabold uppercase tracking-wider mb-6">
              KHỞI ĐỘNG HÔM NAY
            </div>

            {/* Heading */}
            <h2 className="font-heading font-extrabold text-[32px] sm:text-[44px] text-white leading-tight tracking-[-1.5px] mb-5">
              Sẵn sàng đưa cửa hàng lên một hệ thống mới?
            </h2>

            {/* Description */}
            <p className="text-[16px] sm:text-[18px] text-[#b9c8c3] leading-relaxed mb-8 max-w-2xl mx-auto">
              Hơn 500+ cửa hàng sửa chữa thiết bị công nghệ đã chuẩn hóa quy trình và gia tăng lợi nhuận cùng FIXO. Đăng ký dùng thử ngay hôm nay để trải nghiệm sự khác biệt.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mb-8">
              <Link
                href="/register?plan=trial"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-[50px] px-8 rounded-[9px] bg-[#176b58] hover:bg-[#125945] text-white text-[15px] font-bold shadow-[0_10px_25px_rgba(23,107,88,0.35)] transition-all"
              >
                <span>Bắt đầu dùng thử miễn phí 14 ngày →</span>
              </Link>
              <a
                href="tel:02873001234"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-[50px] px-6 rounded-[9px] border border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 text-white text-[15px] font-bold transition-all"
              >
                <span>📞 Hotline: 028 7300 1234</span>
              </a>
            </div>

            {/* 3 Reassurances */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-[12px] sm:text-[13px] text-[#91a29d]">
              <span className="flex items-center gap-1.5">
                <span className="text-[#10b981]">✓</span> Không cần thẻ tín dụng
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#10b981]">✓</span> Khởi tạo xong trong 2 phút
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#10b981]">✓</span> Hỗ trợ chuyển dữ liệu miễn phí
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
