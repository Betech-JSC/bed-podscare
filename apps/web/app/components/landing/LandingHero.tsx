'use client';

import React from 'react';
import Link from 'next/link';
import { Icon } from '@podscare/ui';
import { DashboardMockup } from './DashboardMockup';

interface LandingHeroProps {
  isAuthenticated?: boolean;
  onOpenVideo: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({
  isAuthenticated = false,
  onOpenVideo,
}) => {
  return (
    <section className="relative pt-10 sm:pt-14 pb-12 sm:pb-16 overflow-hidden bg-gradient-to-b from-[#f6faf8] via-[#f9fbf9] to-white border-b border-[#e6ebe8]">
      {/* Background Radial Glow */}
      <div
        className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-[#176b58]/5 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Copywriting & CTAs (5 cols / 6 cols) */}
          <div className="lg:col-span-6 xl:col-span-5 flex flex-col items-start text-left">
            {/* Eyebrow Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#e7f3ee] text-[#176b58] text-[12px] font-extrabold uppercase tracking-wider mb-5">
              <span>✦</span>
              <span>Giải pháp quản lý cửa hàng sửa chữa thiết bị công nghệ</span>
            </div>

            {/* H1 Heading */}
            <h1 className="font-heading font-extrabold text-[38px] sm:text-[48px] xl:text-[56px] text-[#102d35] leading-[1.08] tracking-[-2px] mb-5">
              Quản lý cửa hàng sửa chữa{' '}
              <span className="text-[#176b58]">dễ dàng, chuyên nghiệp hơn</span>
            </h1>

            {/* Subtitle / Description */}
            <p className="text-[16px] sm:text-[18px] text-[#66756f] leading-relaxed mb-8 max-w-[540px]">
              FIXO giúp bạn chuẩn hóa toàn bộ quy trình sửa chữa, quản lý khách hàng, kiểm soát kho linh kiện, kích hoạt bảo hành điện tử và theo dõi doanh thu trên một nền tảng duy nhất.
            </p>

            {/* Dual Actions */}
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto mb-10">
              {isAuthenticated ? (
                <Link
                  href="/dashboard"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-[48px] px-6 rounded-[9px] bg-[#176b58] hover:bg-[#10583f] text-white text-[14px] font-bold shadow-[0_8px_20px_rgba(23,107,88,0.2)] hover:shadow-none transition-all"
                >
                  <span>Vào Dashboard quản lý →</span>
                </Link>
              ) : (
                <Link
                  href="/register?plan=trial"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-[48px] px-6 rounded-[9px] bg-[#176b58] hover:bg-[#10583f] text-white text-[14px] font-bold shadow-[0_8px_20px_rgba(23,107,88,0.2)] hover:shadow-none transition-all"
                >
                  <span>Dùng thử miễn phí 14 ngày →</span>
                </Link>
              )}

              <button
                type="button"
                onClick={onOpenVideo}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-[48px] px-5 rounded-[9px] border border-[#ccd5d1] bg-white text-[#263631] text-[14px] font-bold hover:bg-[#f6f8f6] hover:border-[#176b58] transition-all shadow-xs"
              >
                <span className="text-[#176b58]">▶</span>
                <span>Xem video giới thiệu</span>
              </button>
            </div>

            {/* 4 Value Commitments */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-[#e6ebe8] w-full">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#dcf3e9] flex items-center justify-center text-[#176b58] flex-none">
                  <Icon name="spark" size={15} />
                </div>
                <div>
                  <strong className="block text-[12px] font-bold text-[#102d35] leading-tight">
                    Dễ sử dụng
                  </strong>
                  <span className="block text-[10px] text-[#8a9691] leading-tight mt-0.5">
                    Bắt đầu ngay
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#dcf3e9] flex items-center justify-center text-[#176b58] flex-none">
                  <Icon name="device" size={15} />
                </div>
                <div>
                  <strong className="block text-[12px] font-bold text-[#102d35] leading-tight">
                    Đa nền tảng
                  </strong>
                  <span className="block text-[10px] text-[#8a9691] leading-tight mt-0.5">
                    PC & Điện thoại
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#dcf3e9] flex items-center justify-center text-[#176b58] flex-none">
                  <Icon name="shield" size={15} />
                </div>
                <div>
                  <strong className="block text-[12px] font-bold text-[#102d35] leading-tight">
                    An toàn dữ liệu
                  </strong>
                  <span className="block text-[10px] text-[#8a9691] leading-tight mt-0.5">
                    Sao lưu tự động
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#dcf3e9] flex items-center justify-center text-[#176b58] flex-none">
                  <Icon name="check" size={15} />
                </div>
                <div>
                  <strong className="block text-[12px] font-bold text-[#102d35] leading-tight">
                    Hỗ trợ tận tâm
                  </strong>
                  <span className="block text-[10px] text-[#8a9691] leading-tight mt-0.5">
                    7 ngày/tuần
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Dashboard Mockup (7 cols / 7 cols) */}
          <div className="lg:col-span-6 xl:col-span-7">
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
};
