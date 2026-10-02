'use client';

import React from 'react';
import Link from 'next/link';
import { Icon } from '@podscare/ui';

interface FeatureItem {
  icon: string;
  title: string;
  description: string;
}

const FEATURES: FeatureItem[] = [
  {
    icon: 'repairs',
    title: 'Quản lý đơn sửa chữa',
    description:
      'Tạo đơn, quét mã Serial/IMEI, theo dõi tiến độ thời gian thực, in phiếu tiếp nhận và cập nhật trạng thái sửa chữa linh hoạt.',
  },
  {
    icon: 'customers',
    title: 'Quản lý khách hàng (CRM)',
    description:
      'Lưu trữ hồ sơ, lịch sử sửa chữa từng thiết bị, tra cứu nhanh qua số điện thoại và tích hợp chăm sóc khách hàng tự động.',
  },
  {
    icon: 'inventory',
    title: 'Quản lý kho linh kiện',
    description:
      'Theo dõi tồn kho theo SKU, quản lý nhập - xuất - trả linh kiện, cảnh báo khi chạm mức tối thiểu và tính giá vốn chính xác.',
  },
  {
    icon: 'warranty',
    title: 'Bảo hành điện tử',
    description:
      'Kích hoạt bảo hành điện tử qua mã QR, tra cứu thời hạn bảo hành tức thì và tự động gửi thông báo lịch hẹn kiểm tra lại.',
  },
  {
    icon: 'payments',
    title: 'Thu chi & công nợ',
    description:
      'Quản lý dòng tiền vào ra, thanh toán VietQR tự động, đối soát doanh thu kỹ thuật viên và kiểm soát công nợ đại lý/khách hàng.',
  },
  {
    icon: 'kpi',
    title: 'Báo cáo doanh thu & KPI',
    description:
      'Biểu đồ thống kê doanh thu theo ngày, tháng, nhóm dịch vụ; phân tích lợi nhuận và năng suất sửa chữa của từng kỹ thuật viên.',
  },
  {
    icon: 'users',
    title: 'Quản lý nhân viên & Phân quyền',
    description:
      'Phân quyền chi tiết cho Quản trị viên, CSKH, Kỹ thuật viên; theo dõi năng suất và tính hoa hồng tự động theo từng đơn hoàn tất.',
  },
  {
    icon: 'wrench',
    title: 'Tùy chỉnh quy trình tiệm',
    description:
      'Thiết lập danh mục thiết bị, bảng giá công thợ, mẫu phiếu in thương hiệu riêng và bộ checklist kiểm định cho từng dòng máy.',
  },
];

export const FeatureGrid: React.FC = () => {
  return (
    <section id="features" className="py-20 sm:py-24 bg-[#f8faf9] scroll-mt-20 border-b border-[#e6ebe8]">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="text-center max-w-[720px] mx-auto mb-16">
          <div className="inline-block px-3.5 py-1.5 rounded-full bg-[#e7f3ee] text-[#176b58] text-[11px] font-extrabold uppercase tracking-wider mb-4">
            TÍNH NĂNG NỔI BẬT
          </div>
          <h2 className="font-heading font-extrabold text-[32px] sm:text-[42px] text-[#102d35] leading-tight tracking-[-1.5px] mb-4">
            Tất cả những gì bạn cần để vận hành cửa hàng
          </h2>
          <p className="text-[15px] sm:text-[16px] text-[#71817b] leading-relaxed">
            Không cần chuyển đổi qua lại giữa sổ sách, Excel hay nhiều phần mềm rời rạc. FIXO tập trung toàn bộ hoạt động của cửa hàng trên một hệ thống chuẩn hóa.
          </p>
        </div>

        {/* 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 lg:gap-10 items-start">
          {/* Left Column Intro */}
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-[#e6ebe8] shadow-xs lg:sticky lg:top-28">
            <h3 className="font-heading font-extrabold text-[24px] sm:text-[28px] text-[#102d35] leading-[1.2] mb-4">
              Quản lý <span className="text-[#176b58]">đơn giản.</span>
              <br />
              Vận hành <span className="text-[#176b58]">hiệu quả.</span>
            </h3>
            <p className="text-[14px] text-[#71817b] leading-relaxed mb-6">
              FIXO được thiết kế chuyên biệt cho ngành sửa chữa thiết bị công nghệ, giúp bạn tiết kiệm thời gian, tối ưu hóa công thợ và kiểm soát doanh thu minh bạch.
            </p>
            <Link
              href="/register?plan=trial"
              className="inline-flex items-center justify-center gap-2 w-full h-[46px] rounded-[9px] bg-[#176b58] hover:bg-[#10583f] text-white text-[13px] font-bold shadow-[0_8px_20px_rgba(23,107,88,0.2)] transition-all"
            >
              <span>Dùng thử miễn phí ngay →</span>
            </Link>
          </div>

          {/* Right Column: 8 Feature Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {FEATURES.map((feature, idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl p-5 sm:p-6 border border-[#e6ebe8] hover:border-[#176b58]/40 hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(16,37,31,0.08)] transition-all group"
              >
                <div className="w-11 h-11 rounded-lg bg-[#e7f3ee] text-[#176b58] flex items-center justify-center mb-4 group-hover:bg-[#176b58] group-hover:text-white transition-colors">
                  <Icon name={feature.icon} size={22} />
                </div>
                <h4 className="font-heading font-bold text-[15px] sm:text-[16px] text-[#102d35] mb-2 leading-snug">
                  {feature.title}
                </h4>
                <p className="text-[13px] text-[#71817b] leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
