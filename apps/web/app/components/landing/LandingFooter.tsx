'use client';

import React from 'react';
import Link from 'next/link';
import { BETECH_LEGAL_ENTITY } from '../policies/policyData';

export const LandingFooter: React.FC = () => {
  const handleScrollTo = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      window.history.pushState(null, '', `#${id}`);
    }
  };

  return (
    <footer id="contact" className="bg-[#0c211d] text-white pt-16 pb-10 border-t border-[#1a3832]">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-12 mb-14">
          {/* Brand & Mission column */}
          <div className="lg:col-span-2">
            <Link
              href="/"
              className="inline-flex items-center gap-3 select-none mb-4 group"
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
                className="w-[42px] h-[42px] rounded-xl object-contain shadow-sm"
              />
              <div className="flex flex-col">
                <span className="font-heading font-extrabold text-[21px] text-white leading-none tracking-tight">
                  FIXO
                </span>
                <span className="text-[9px] font-bold tracking-[1.4px] text-[#8fa09b] uppercase mt-1">
                  PHẦN MỀM QUẢN LÝ SỬA CHỮA
                </span>
              </div>
            </Link>

            <p className="text-[#91a29d] text-[13px] leading-relaxed max-w-[360px] mb-6">
              Phần mềm quản lý cửa hàng sửa chữa thiết bị công nghệ hàng đầu Việt Nam — Một sản phẩm được phát triển bởi{' '}
              <a
                href="https://betech-digital.com/"
                target="_blank"
                rel="noopener"
                className="font-bold text-[#c8eadb] hover:text-white underline underline-offset-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c8eadb]"
              >
                Betech Digital
              </a>
              .
            </p>

            <div className="text-[13px] text-[#8fa09b] space-y-1.5">
              <p>
                <strong className="text-white">Email hỗ trợ &amp; pháp lý:</strong>{' '}
                <a href="mailto:admin@betech-digital.com" className="text-[#c8eadb] hover:text-white transition-colors">
                  {BETECH_LEGAL_ENTITY.email}
                </a>
              </p>
              <p>
                <strong className="text-white">Hotline / Zalo hỗ trợ:</strong>{' '}
                <a href="tel:0775600351" className="text-[#c8eadb] hover:text-white transition-colors">
                  {BETECH_LEGAL_ENTITY.hotline}
                </a>
              </p>
            </div>
          </div>

          {/* Col 1: Sản phẩm */}
          <div>
            <h4 className="text-[14px] font-heading font-bold text-white mb-4 tracking-wide uppercase">
              Sản phẩm
            </h4>
            <ul className="space-y-2.5 text-[13px] text-[#8fa09b]">
              <li>
                <a
                  href="#features"
                  onClick={(e) => handleScrollTo(e, 'features')}
                  className="hover:text-white transition-colors"
                >
                  Tính năng nổi bật
                </a>
              </li>
              <li>
                <a
                  href="#industries"
                  onClick={(e) => handleScrollTo(e, 'industries')}
                  className="hover:text-white transition-colors"
                >
                  Ngành nghề hỗ trợ
                </a>
              </li>
              <li>
                <a
                  href="#pricing"
                  onClick={(e) => handleScrollTo(e, 'pricing')}
                  className="hover:text-white transition-colors"
                >
                  Bảng giá SaaS
                </a>
              </li>
              <li>
                <Link href="/changelog" className="hover:text-white transition-colors">
                  Nhật ký cập nhật
                </Link>
              </li>
              <li>
                <Link href="/changelog?tab=roadmap" className="hover:text-white transition-colors">
                  Lộ trình phát triển
                </Link>
              </li>
              <li>
                <Link href="/register?plan=trial" className="hover:text-white transition-colors">
                  Dùng thử 1 năm
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 2: Hỗ trợ */}
          <div>
            <h4 className="text-[14px] font-heading font-bold text-white mb-4 tracking-wide uppercase">
              Hỗ trợ
            </h4>
            <ul className="space-y-2.5 text-[13px] text-[#8fa09b]">
              <li>
                <Link href="/track" className="hover:text-white transition-colors">
                  Tra cứu đơn sửa chữa
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-white transition-colors">
                  Đăng nhập hệ thống
                </Link>
              </li>
              <li>
                <Link href="/sla" className="hover:text-white transition-colors">
                  Cam kết vận hành &amp; Hỗ trợ
                </Link>
              </li>
              <li>
                <a href="tel:0775600351" className="hover:text-white transition-colors">
                  Hotline / Zalo: 0775 600 351
                </a>
              </li>
              <li>
                <a href="mailto:admin@betech-digital.com" className="hover:text-white transition-colors">
                  Email: admin@betech-digital.com
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Công ty */}
          <div>
            <h4 className="text-[14px] font-heading font-bold text-white mb-4 tracking-wide uppercase">
              Về FIXO
            </h4>
            <ul className="space-y-2.5 text-[13px] text-[#8fa09b]">
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Điều khoản sử dụng
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Chính sách bảo mật
                </Link>
              </li>
              <li>
                <Link href="/billing-policy" className="hover:text-white transition-colors">
                  Chính sách thanh toán
                </Link>
              </li>
              <li>
                <Link href="/sla" className="hover:text-white transition-colors">
                  Cam kết dịch vụ (SLA)
                </Link>
              </li>
              <li>
                <a
                  href="https://betech-digital.com/"
                  target="_blank"
                  rel="noopener"
                  className="hover:text-white transition-colors"
                >
                  Về Betech Digital
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="pt-8 border-t border-[#1a3832] flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-[#70817c]">
          <p>
            © 2026 FIXO. Sản phẩm được phát triển bởi{' '}
            <a
              href="https://betech-digital.com/"
              target="_blank"
              rel="noopener"
              className="font-bold text-[#c8eadb] hover:text-white underline underline-offset-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c8eadb]"
            >
              Betech Digital
            </a>{' '}
            (CÔNG TY TNHH DỊCH VỤ GIẢI PHÁP SỐ BETECH · MST: 0318601210).
          </p>
          <p className="flex items-center gap-4">
            <span>Tiêu chuẩn vận hành cửa hàng công nghệ hiện đại</span>
          </p>
        </div>
      </div>
    </footer>
  );
};
