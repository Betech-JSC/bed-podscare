'use client';

import React from 'react';
import Link from 'next/link';
import { Icon } from '@podscare/ui';

interface PricingTier {
  id: string;
  name: string;
  badge?: string;
  price: string;
  unit: string;
  description: string;
  features: string[];
  ctaText: string;
  ctaHref: string;
  isPopular?: boolean;
}

const TIERS: PricingTier[] = [
  {
    id: 'trial',
    name: 'Dùng thử',
    badge: 'Trải nghiệm',
    price: '0đ',
    unit: '/ 14 ngày',
    description:
      'Dành cho chủ cửa hàng muốn kiểm nghiệm thực tế mọi tính năng trước khi đưa vào vận hành chính thức.',
    features: [
      'Đầy đủ các module quản lý cốt lõi',
      'Quản lý tối đa 50 đơn sửa chữa',
      '1 chi nhánh & 2 tài khoản nhân viên',
      'In phiếu tiếp nhận & hóa đơn chuẩn',
      'Hướng dẫn thiết lập ban đầu qua Ultraview',
    ],
    ctaText: 'Dùng thử miễn phí 14 ngày →',
    ctaHref: '/register?plan=trial',
  },
  {
    id: 'standard',
    name: 'Tiêu chuẩn',
    badge: 'Phổ biến nhất',
    isPopular: true,
    price: '299.000đ',
    unit: '/ tháng',
    description:
      'Giải pháp chuẩn hóa toàn diện cho các cửa hàng sửa chữa điện thoại, laptop, phụ kiện độc lập.',
    features: [
      'Không giới hạn số lượng đơn sửa chữa',
      '1 chi nhánh & 5 tài khoản nhân viên',
      'Quản lý kho linh kiện & cảnh báo tồn kho',
      'Bảo hành điện tử qua QR Code & SMS',
      'Thu chi, công nợ & thanh toán VietQR tự động',
      'Báo cáo doanh thu & KPI kỹ thuật viên',
      'Hỗ trợ kỹ thuật chuyên nghiệp 7 ngày/tuần',
    ],
    ctaText: 'Chọn gói Tiêu chuẩn →',
    ctaHref: '/register?plan=standard',
  },
  {
    id: 'pro',
    name: 'Chuyên nghiệp',
    badge: 'Chuỗi & Trung tâm',
    price: '599.000đ',
    unit: '/ tháng',
    description:
      'Dành cho chuỗi nhiều chi nhánh hoặc trung tâm bảo hành thiết bị công nghệ quy mô lớn.',
    features: [
      'Tất cả quyền lợi của gói Tiêu chuẩn',
      'Không giới hạn số lượng chi nhánh & nhân viên',
      'Quản lý kho & điều chuyển linh kiện liên chi nhánh',
      'Phân quyền nâng cao theo từng vị trí nghiệp vụ',
      'Báo cáo tài chính & doanh thu đa chi nhánh realtime',
      'Tùy chỉnh mẫu phiếu in mang thương hiệu riêng',
      'Ưu tiên hỗ trợ kỹ thuật 24/7 & chuyên viên 1-1',
    ],
    ctaText: 'Chọn gói Chuyên nghiệp →',
    ctaHref: '/register?plan=pro',
  },
];

export const PricingSection: React.FC = () => {
  return (
    <section id="pricing" className="py-20 sm:py-24 bg-white scroll-mt-20 border-b border-[#e6ebe8]">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="text-center max-w-[720px] mx-auto mb-16">
          <div className="inline-block px-3.5 py-1.5 rounded-full bg-[#e7f3ee] text-[#176b58] text-[11px] font-extrabold uppercase tracking-wider mb-4">
            BẢNG GIÁ MINH BẠCH
          </div>
          <h2 className="font-heading font-extrabold text-[32px] sm:text-[42px] text-[#102d35] leading-tight tracking-[-1.5px] mb-4">
            Bắt đầu với chi phí tối ưu nhất
          </h2>
          <p className="text-[15px] sm:text-[16px] text-[#71817b] leading-relaxed">
            Không phụ phí cài đặt. Không ràng buộc hợp đồng dài hạn. Dễ dàng nâng cấp hoặc hạ gói bất kỳ lúc nào phù hợp với nhu cầu phát triển của tiệm.
          </p>
        </div>

        {/* 3 Pricing Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch max-w-[1140px] mx-auto">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`rounded-2xl p-7 sm:p-8 flex flex-col justify-between transition-all relative ${
                tier.isPopular
                  ? 'bg-white border-2 border-[#176b58] shadow-[0_20px_50px_rgba(23,107,88,0.12)] lg:-translate-y-2'
                  : 'bg-white border border-[#e6ebe8] shadow-xs hover:border-[#ccd5d1] hover:shadow-md'
              }`}
            >
              {/* Popular Badge */}
              {tier.isPopular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#176b58] text-white text-[11px] font-extrabold tracking-wider uppercase shadow-sm">
                  {tier.badge}
                </div>
              )}

              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-heading font-bold text-[20px] text-[#102d35]">
                    {tier.name}
                  </h3>
                  {!tier.isPopular && (
                    <span className="text-[11px] font-bold text-[#71817b] bg-[#f4f7f5] px-2.5 py-1 rounded-full">
                      {tier.badge}
                    </span>
                  )}
                </div>

                {/* Price Display */}
                <div className="flex items-baseline gap-1 mb-4 pb-4 border-b border-[#f0f3f1]">
                  <span className="font-heading font-extrabold text-[36px] sm:text-[40px] text-[#102d35] tracking-tight">
                    {tier.price}
                  </span>
                  <span className="text-[14px] text-[#71817b] font-medium">
                    {tier.unit}
                  </span>
                </div>

                {/* Description */}
                <p className="text-[13px] text-[#71817b] leading-relaxed mb-6">
                  {tier.description}
                </p>

                {/* Feature Checklist */}
                <div className="space-y-3 mb-8">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#102d35] block">
                    Quyền lợi bao gồm:
                  </span>
                  {tier.features.map((feature, fIdx) => (
                    <div key={fIdx} className="flex items-start gap-2.5 text-[13px] text-[#263631]">
                      <div className="w-4 h-4 rounded-full bg-[#dcf3e9] text-[#176b58] flex items-center justify-center flex-none mt-0.5">
                        <Icon name="check" size={11} />
                      </div>
                      <span className="leading-snug">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA Button */}
              <div>
                <Link
                  href={tier.ctaHref}
                  className={`w-full inline-flex items-center justify-center h-[46px] rounded-[9px] text-[14px] font-bold transition-all ${
                    tier.isPopular
                      ? 'bg-[#176b58] hover:bg-[#10583f] text-white shadow-[0_8px_20px_rgba(23,107,88,0.25)]'
                      : 'bg-[#f4f7f5] hover:bg-[#e6ebe8] text-[#102d35] border border-[#e6ebe8]'
                  }`}
                >
                  {tier.ctaText}
                </Link>
                <p className="text-center text-[11px] text-[#8a9691] mt-2.5">
                  {tier.id === 'trial' ? 'Không cần thẻ tín dụng' : 'Hủy hoặc thay đổi bất cứ lúc nào'}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footnote reassurance */}
        <div className="mt-14 p-4 rounded-xl bg-[#f8faf9] border border-[#e6ebe8] text-center max-w-2xl mx-auto text-[13px] text-[#71817b] flex items-center justify-center gap-2">
          <Icon name="shield" size={16} className="text-[#176b58] flex-none" />
          <span>
            Tất cả các gói đều bao gồm sao lưu dữ liệu tự động mỗi ngày, bảo mật cấp doanh nghiệp và cập nhật tính năng mới miễn phí.
          </span>
        </div>
      </div>
    </section>
  );
};
