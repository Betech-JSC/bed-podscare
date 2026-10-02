'use client';

import React from 'react';
import Link from 'next/link';

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
              Nền tảng quản lý cửa hàng sửa chữa thiết bị công nghệ hiện đại, đơn giản và dễ sử dụng. Giúp tối ưu hóa quy trình tiếp nhận, kho linh kiện và doanh thu trên một hệ thống duy nhất.
            </p>

            <div className="text-[13px] text-[#8fa09b] space-y-1.5">
              <p>
                <strong className="text-white">Email hỗ trợ:</strong>{' '}
                <a href="mailto:support@fixo.com.vn" className="hover:text-white transition-colors">
                  support@fixo.com.vn
                </a>
              </p>
              <p>
                <strong className="text-white">Hotline kỹ thuật:</strong>{' '}
                <a href="tel:02873001234" className="hover:text-white transition-colors">
                  028 7300 1234
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
                  href="#workflow"
                  onClick={(e) => handleScrollTo(e, 'workflow')}
                  className="hover:text-white transition-colors"
                >
                  Quy trình 4 bước
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
                <Link href="/register?plan=trial" className="hover:text-white transition-colors">
                  Dùng thử 14 ngày
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
                <a href="#contact" className="hover:text-white transition-colors">
                  Trung tâm trợ giúp
                </a>
              </li>
              <li>
                <a href="#contact" className="hover:text-white transition-colors">
                  Hướng dẫn sử dụng
                </a>
              </li>
              <li>
                <a href="mailto:support@fixo.com.vn" className="hover:text-white transition-colors">
                  Yêu cầu tư vấn triển khai
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
                <a href="#features" className="hover:text-white transition-colors">
                  Giới thiệu FIXO
                </a>
              </li>
              <li>
                <a href="#contact" className="hover:text-white transition-colors">
                  Bảo mật dữ liệu
                </a>
              </li>
              <li>
                <a href="#contact" className="hover:text-white transition-colors">
                  Điều khoản dịch vụ
                </a>
              </li>
              <li>
                <a href="#contact" className="hover:text-white transition-colors">
                  Chính sách bảo mật
                </a>
              </li>
              <li>
                <a href="#contact" className="hover:text-white transition-colors">
                  Cam kết dịch vụ (SLA)
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="pt-8 border-t border-[#1a3832] flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-[#70817c]">
          <p>© 2026 FIXO Repair Operating System. All rights reserved.</p>
          <p className="flex items-center gap-4">
            <span>Tiêu chuẩn vận hành cửa hàng công nghệ hiện đại</span>
          </p>
        </div>
      </div>
    </footer>
  );
};
