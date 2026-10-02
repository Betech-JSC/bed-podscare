'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@podscare/ui';

interface LandingNavbarProps {
  isAuthenticated?: boolean;
}

export const LandingNavbar: React.FC<LandingNavbarProps> = ({ isAuthenticated = false }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleScrollTo = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      window.history.pushState(null, '', `#${id}`);
    }
  };

  return (
    <header className="sticky top-0 z-50 h-[76px] bg-white/95 backdrop-blur-md border-b border-[#e6ebe8] transition-all">
      <div className="max-w-[1280px] h-full mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <Link
          href="/"
          className="flex items-center gap-3 select-none group"
          onClick={(e) => {
            if (window.location.pathname === '/') {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
        >
          <img
            src="/logo.png"
            alt="FIXO Logo"
            className="w-[42px] h-[42px] rounded-xl object-contain shadow-sm group-hover:scale-105 transition-transform"
          />
          <div className="flex flex-col">
            <span className="font-heading font-extrabold text-[21px] text-[#102d35] leading-none tracking-tight">
              FIXO
            </span>
            <span className="text-[9px] font-bold tracking-[1.4px] text-[#84918d] uppercase mt-1">
              PHẦN MỀM QUẢN LÝ SỬA CHỮA
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-8 text-[14px] font-semibold text-[#52615c]">
          <a
            href="#features"
            onClick={(e) => handleScrollTo(e, 'features')}
            className="hover:text-[#176b58] transition-colors"
          >
            Tính năng
          </a>
          <a
            href="#industries"
            onClick={(e) => handleScrollTo(e, 'industries')}
            className="hover:text-[#176b58] transition-colors"
          >
            Ngành nghề
          </a>
          <a
            href="#workflow"
            onClick={(e) => handleScrollTo(e, 'workflow')}
            className="hover:text-[#176b58] transition-colors"
          >
            Quy trình
          </a>
          <a
            href="#pricing"
            onClick={(e) => handleScrollTo(e, 'pricing')}
            className="hover:text-[#176b58] transition-colors"
          >
            Bảng giá
          </a>
          <a
            href="#contact"
            onClick={(e) => handleScrollTo(e, 'contact')}
            className="hover:text-[#176b58] transition-colors"
          >
            Liên hệ
          </a>
        </nav>

        {/* Action Buttons */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            href="/track"
            className="inline-flex items-center justify-center gap-2 h-[44px] px-4 rounded-[9px] border border-[#e6ebe8] bg-white text-[#263631] text-[13px] font-bold hover:bg-[#f6f8f6] hover:border-[#ccd5d1] transition-all"
          >
            <Icon name="search" size={15} className="text-[#71817b]" />
            <span>Tra cứu đơn</span>
          </Link>

          {isAuthenticated ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 h-[44px] px-5 rounded-[9px] bg-[#176b58] hover:bg-[#10583f] text-white text-[13px] font-bold shadow-[0_8px_20px_rgba(23,107,88,0.2)] hover:shadow-none transition-all"
            >
              <span>Vào Dashboard →</span>
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex items-center justify-center h-[44px] px-4 rounded-[9px] border border-[#e6ebe8] bg-white text-[#263631] text-[13px] font-bold hover:bg-[#f6f8f6] hover:border-[#ccd5d1] transition-all"
              >
                Đăng nhập
              </Link>
              <Link
                href="/register?plan=trial"
                className="inline-flex items-center justify-center gap-2 h-[44px] px-5 rounded-[9px] bg-[#176b58] hover:bg-[#10583f] text-white text-[13px] font-bold shadow-[0_8px_20px_rgba(23,107,88,0.2)] hover:shadow-none transition-all"
              >
                <span>Dùng thử miễn phí →</span>
              </Link>
            </>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-2.5 rounded-lg border border-[#e6ebe8] text-[#263631] hover:bg-[#f6f8f6] transition-colors"
          aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
        >
          <Icon name={mobileMenuOpen ? 'close' : 'menu'} size={20} />
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-x-0 top-[76px] bg-white border-b border-[#e6ebe8] shadow-2xl p-6 flex flex-col gap-4 animate-in slide-in-from-top-2 duration-200 z-50">
          <nav className="flex flex-col gap-3 font-semibold text-[15px] text-[#263631] border-b border-[#e6ebe8] pb-4">
            <a
              href="#features"
              onClick={(e) => handleScrollTo(e, 'features')}
              className="py-2 px-3 rounded-lg hover:bg-[#f6f8f6] hover:text-[#176b58] transition-colors"
            >
              Tính năng
            </a>
            <a
              href="#industries"
              onClick={(e) => handleScrollTo(e, 'industries')}
              className="py-2 px-3 rounded-lg hover:bg-[#f6f8f6] hover:text-[#176b58] transition-colors"
            >
              Ngành nghề
            </a>
            <a
              href="#workflow"
              onClick={(e) => handleScrollTo(e, 'workflow')}
              className="py-2 px-3 rounded-lg hover:bg-[#f6f8f6] hover:text-[#176b58] transition-colors"
            >
              Quy trình
            </a>
            <a
              href="#pricing"
              onClick={(e) => handleScrollTo(e, 'pricing')}
              className="py-2 px-3 rounded-lg hover:bg-[#f6f8f6] hover:text-[#176b58] transition-colors"
            >
              Bảng giá
            </a>
            <a
              href="#contact"
              onClick={(e) => handleScrollTo(e, 'contact')}
              className="py-2 px-3 rounded-lg hover:bg-[#f6f8f6] hover:text-[#176b58] transition-colors"
            >
              Liên hệ
            </a>
          </nav>

          <div className="flex flex-col gap-2.5 pt-1">
            <Link
              href="/track"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center justify-center gap-2 h-[46px] rounded-[9px] border border-[#e6ebe8] bg-white text-[#263631] font-bold text-[14px]"
            >
              <Icon name="search" size={16} className="text-[#71817b]" />
              <span>Tra cứu tiến độ sửa chữa</span>
            </Link>

            {isAuthenticated ? (
              <Link
                href="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full flex items-center justify-center h-[46px] rounded-[9px] bg-[#176b58] text-white font-bold text-[14px] shadow-sm"
              >
                Vào Dashboard quản lý →
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full flex items-center justify-center h-[46px] rounded-[9px] border border-[#e6ebe8] bg-white text-[#263631] font-bold text-[14px]"
                >
                  Đăng nhập
                </Link>
                <Link
                  href="/register?plan=trial"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full flex items-center justify-center h-[46px] rounded-[9px] bg-[#176b58] text-white font-bold text-[14px] shadow-sm"
                >
                  Dùng thử miễn phí 14 ngày →
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
