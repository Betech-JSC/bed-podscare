'use client';

import React, { useState } from 'react';
import { Button, Icon, formatVND } from '@podscare/ui';

export interface PricingPlanGridProps {
  currentPlanId?: string; // 'trial' | 'standard' | 'pro'
  onSelectPlan: (planId: string, billingCycle: 'monthly' | 'yearly', price: number, planName: string) => void;
  className?: string;
}

export const PricingPlanGrid: React.FC<PricingPlanGridProps> = ({
  currentPlanId = 'trial',
  onSelectPlan,
  className = '',
}) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  // Plan Definitions
  const plans = [
    {
      id: 'standard',
      name: 'Gói Tiêu chuẩn',
      tagline: 'Phù hợp cửa hàng sửa chữa độc lập và tiệm quy mô vừa & nhỏ',
      priceMonthly: 299000,
      priceYearly: 299000 * 10, // Giảm giá 2 tháng khi trả theo năm
      popular: true,
      features: [
        'Tối đa 2 chi nhánh hoạt động',
        'Tối đa 5 tài khoản nhân sự',
        '300 đơn sửa chữa / tháng',
        'Thanh toán tự động VietQR SePay',
        'Tra cứu đơn online cho khách hàng',
        'Quy trình kiểm định QC 2 bước',
        'Quản lý kho linh kiện & xuất nhập tồn',
        'Hỗ trợ kỹ thuật chuẩn trong giờ hành chính',
      ],
    },
    {
      id: 'pro',
      name: 'Gói Chuyên nghiệp',
      tagline: 'Dành cho chuỗi nhiều chi nhánh & trung tâm bảo hành lớn',
      priceMonthly: 599000,
      priceYearly: 599000 * 10, // Giảm giá 2 tháng khi trả theo năm
      popular: false,
      features: [
        'Không giới hạn số chi nhánh (∞)',
        'Không giới hạn tài khoản nhân sự (∞)',
        'Không giới hạn đơn sửa chữa (∞)',
        'Tự động hóa toàn trình VietQR SePay',
        'Điều chuyển kho linh kiện liên chi nhánh',
        'Phân quyền nâng cao theo vị trí (Role Matrix)',
        'Báo cáo phân tích KPI & Nhật ký kiểm toán',
        'Ưu tiên hỗ trợ kỹ thuật VIP 24/7',
      ],
    },
  ];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header & Billing Cycle Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-heading text-base font-bold text-[#1c302b] m-0 flex items-center gap-2">
            <Icon name="payments" size={18} className="text-[#176b58]" />
            Nâng cấp & Gia hạn bản quyền
          </h3>
          <p className="text-xs text-[#73847c] mt-1 mb-0">
            Thanh toán tự động 24/7 qua VietQR SePay. Gói cước được kích hoạt ngay lập tức sau khi chuyển khoản.
          </p>
        </div>

        {/* Cycle Toggle */}
        <div className="flex items-center p-1 rounded-[10px] bg-[#f0f4f2] border border-[#e2eae5] self-start sm:self-auto flex-none">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`px-3 py-1.5 rounded-[7px] text-xs font-bold transition-all cursor-pointer ${
              billingCycle === 'monthly'
                ? 'bg-white text-[#176b58] shadow-xs border border-[#d6e5dd]'
                : 'text-[#697972] hover:text-[#1c302b]'
            }`}
          >
            Hàng tháng
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            className={`px-3 py-1.5 rounded-[7px] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              billingCycle === 'yearly'
                ? 'bg-white text-[#176b58] shadow-xs border border-[#d6e5dd]'
                : 'text-[#697972] hover:text-[#1c302b]'
            }`}
          >
            <span>Hàng năm</span>
            <span className="px-1.5 py-0.5 rounded-full bg-[#e8f5e9] text-[#1b5e20] text-[10px] font-extrabold">
              Tiết kiệm 17%
            </span>
          </button>
        </div>
      </div>

      {/* 2 Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {plans.map((p) => {
          const isCurrentPlan = currentPlanId === p.id;
          const price = billingCycle === 'yearly' ? p.priceYearly : p.priceMonthly;
          const displayPrice = formatVND(price);

          // Determine CTA Label
          let ctaLabel = `Nâng cấp lên ${p.name}`;
          let ctaVariant: 'primary' | 'secondary' = 'primary';
          let disabled = false;

          if (currentPlanId === 'trial') {
            ctaLabel = `Nâng cấp lên ${p.name}`;
            ctaVariant = p.popular ? 'primary' : 'primary';
          } else if (currentPlanId === 'standard') {
            if (p.id === 'standard') {
              ctaLabel = `Gia hạn gói Standard (+${billingCycle === 'yearly' ? '365' : '30'} ngày)`;
              ctaVariant = 'secondary';
            } else {
              ctaLabel = 'Nâng cấp lên Pro';
              ctaVariant = 'primary';
            }
          } else if (currentPlanId === 'pro') {
            if (p.id === 'pro') {
              ctaLabel = `Gia hạn gói Pro (+${billingCycle === 'yearly' ? '365' : '30'} ngày)`;
              ctaVariant = 'primary';
            } else {
              ctaLabel = 'Đang sử dụng gói cao hơn';
              ctaVariant = 'secondary';
              disabled = true;
            }
          }

          return (
            <div
              key={p.id}
              className={`rounded-[16px] bg-white border transition-all flex flex-col justify-between p-6 sm:p-7 relative ${
                isCurrentPlan
                  ? 'border-[#176b58] ring-2 ring-[#176b58]/15 shadow-sm'
                  : p.popular
                  ? 'border-[#176b58]/40 shadow-xs hover:border-[#176b58]'
                  : 'border-[#e5ece8] hover:border-[#ccd9d1]'
              }`}
            >
              {/* Badge Top */}
              <div className="flex items-center justify-between mb-4">
                {isCurrentPlan ? (
                  <span className="px-2.5 py-1 rounded-full bg-[#eaf4ef] border border-[#cde3d6] text-[#176b58] text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                    Gói hiện tại của bạn
                  </span>
                ) : p.popular ? (
                  <span className="px-2.5 py-1 rounded-full bg-[#faf3e7] border border-[#f4dfc2] text-[#b77a21] text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                    <Icon name="spark" size={12} />
                    Phổ biến nhất
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-[#f2eff8] border border-[#ded7eb] text-[#6d5b97] text-[11px] font-extrabold uppercase tracking-wider">
                    Quy mô Chuỗi
                  </span>
                )}
                <span className="text-[11px] text-[#819089] font-medium">Bản quyền FIXO OS</span>
              </div>

              {/* Plan Info */}
              <div>
                <h4 className="font-heading font-extrabold text-xl text-[#1c302b] m-0">
                  {p.name}
                </h4>
                <p className="text-xs text-[#718279] mt-1.5 mb-4 leading-relaxed min-h-[36px]">
                  {p.tagline}
                </p>

                {/* Price Display */}
                <div className="p-4 rounded-[12px] bg-[#f8faf9] border border-[#e8efe9] mb-5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-heading font-extrabold text-3xl text-[#176b58] tracking-tight">
                      {displayPrice}
                    </span>
                    <span className="text-xs font-semibold text-[#66776f]">
                      / {billingCycle === 'yearly' ? 'năm (12 tháng)' : 'tháng'}
                    </span>
                  </div>
                  {billingCycle === 'yearly' && (
                    <p className="text-[11px] text-[#2e7d32] font-semibold mt-1 mb-0 flex items-center gap-1">
                      <Icon name="check" size={13} />
                      Tặng thêm 2 tháng sử dụng miễn phí
                    </p>
                  )}
                </div>

                {/* Features List */}
                <div className="space-y-2.5 mb-6">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#819089] block mb-2">
                    Tính năng & Hạn mức bao gồm:
                  </span>
                  {p.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-[#3d4f47]">
                      <div className="w-4 h-4 rounded-full bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none mt-0.5">
                        <Icon name="check" size={11} />
                      </div>
                      <span className="leading-snug">{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 border-t border-[#f0f3f1] mt-auto">
                <Button
                  type="button"
                  variant={ctaVariant}
                  size="md"
                  disabled={disabled}
                  onClick={() => onSelectPlan(p.id, billingCycle, price, p.name)}
                  className="w-full font-bold text-xs py-2.5"
                >
                  {ctaLabel} →
                </Button>
                <p className="text-[10px] text-[#8a9992] text-center mt-2 mb-0">
                  Tự động kích hoạt sau khi SePay xác nhận chuyển khoản
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
