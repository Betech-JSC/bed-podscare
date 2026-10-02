'use client';

import React, { useState, useEffect } from 'react';
import { Button, Icon, Modal, Input, useToast } from '@podscare/ui';
import { AppShell } from '../../components/AppShell';

export interface SubscriptionPlan {
  id: string;
  name: string;
  tagline: string;
  price: number;
  period: string;
  popular?: boolean;
  activeStoresCount: number;
  maxBranches: number | 'unlimited';
  maxUsers: number | 'unlimited';
  maxOrdersPerMonth: number | 'unlimited';
  features: string[];
}

const DEFAULT_PLANS: SubscriptionPlan[] = [
  {
    id: 'trial',
    name: 'Gói Dùng thử',
    tagline: 'Trải nghiệm toàn diện nền tảng trong 14 ngày',
    price: 0,
    period: '14 ngày',
    activeStoresCount: 4,
    maxBranches: 1,
    maxUsers: 2,
    maxOrdersPerMonth: 50,
    features: [
      '1 Chi nhánh hoạt động',
      'Tối đa 2 tài khoản nhân sự',
      '50 đơn sửa chữa / tháng',
      'Tiếp nhận & quản lý sửa chữa',
      'In phiếu biên nhận chuẩn hóa',
      'Báo cáo doanh số cơ bản',
    ],
  },
  {
    id: 'standard',
    name: 'Gói Tiêu chuẩn',
    tagline: 'Phù hợp cửa hàng sửa chữa vừa và nhỏ đang tăng trưởng',
    price: 299000,
    period: 'tháng',
    popular: true,
    activeStoresCount: 22,
    maxBranches: 2,
    maxUsers: 5,
    maxOrdersPerMonth: 300,
    features: [
      'Tối đa 2 chi nhánh hoạt động',
      'Tối đa 5 tài khoản nhân sự',
      '300 đơn sửa chữa / tháng',
      'Thu tiền tự động SePay VietQR',
      'Tra cứu đơn online cho khách hàng',
      'Quy trình kiểm định QC 2 bước',
      'Quản lý kho linh kiện tiêu chuẩn',
      'Hỗ trợ kỹ thuật giờ hành chính',
    ],
  },
  {
    id: 'pro',
    name: 'Gói Chuyên nghiệp',
    tagline: 'Dành cho chuỗi cửa hàng và trung tâm bảo hành quy mô lớn',
    price: 599000,
    period: 'tháng',
    activeStoresCount: 6,
    maxBranches: 'unlimited',
    maxUsers: 'unlimited',
    maxOrdersPerMonth: 'unlimited',
    features: [
      'Không giới hạn số chi nhánh',
      'Không giới hạn tài khoản nhân sự',
      'Không giới hạn đơn sửa chữa',
      'Tự động hóa toàn trình VietQR SePay',
      'Điều chuyển kho liên chi nhánh thời gian thực',
      'Phân quyền vai trò nâng cao (Role Matrix)',
      'Báo cáo phân tích KPI & Nhật ký kiểm toán',
      'Hỗ trợ kỹ thuật VIP ưu tiên 24/7',
    ],
  },
];

const STORAGE_KEY = 'fixo_platform_plans_config';

export default function PlatformPlansPage() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<SubscriptionPlan[]>(DEFAULT_PLANS);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form edit states
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editMaxBranches, setEditMaxBranches] = useState<string>('1');
  const [editMaxOrders, setEditMaxOrders] = useState<string>('50');
  const [editFeatures, setEditFeatures] = useState<string>('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPlans(parsed);
        }
      }
    } catch (e) {
      console.warn('Could not read saved plans from localStorage', e);
    }
  }, []);

  const openEditModal = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setEditPrice(plan.price);
    setEditMaxBranches(plan.maxBranches === 'unlimited' ? 'unlimited' : String(plan.maxBranches));
    setEditMaxOrders(plan.maxOrdersPerMonth === 'unlimited' ? 'unlimited' : String(plan.maxOrdersPerMonth));
    setEditFeatures(plan.features.join('\n'));
    setIsModalOpen(true);
  };

  const handleSavePlan = () => {
    if (!editingPlan) return;

    const parsedBranches: number | 'unlimited' =
      editMaxBranches === 'unlimited' || editMaxBranches === '0'
        ? 'unlimited'
        : parseInt(editMaxBranches, 10) || 1;

    const parsedOrders: number | 'unlimited' =
      editMaxOrders === 'unlimited' || editMaxOrders === '0'
        ? 'unlimited'
        : parseInt(editMaxOrders, 10) || 50;

    const updatedFeatures = editFeatures
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    const updatedPlans: SubscriptionPlan[] = plans.map((p) => {
      if (p.id === editingPlan.id) {
        return {
          ...p,
          price: Math.max(0, editPrice),
          maxBranches: parsedBranches,
          maxOrdersPerMonth: parsedOrders,
          features: updatedFeatures.length > 0 ? updatedFeatures : p.features,
        };
      }
      return p;
    });

    setPlans(updatedPlans);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPlans));
    } catch (e) {
      console.warn('Failed to save plans to localStorage', e);
    }

    setIsModalOpen(false);
    toast(`Gói cước "${editingPlan.name}" đã được cập nhật thành công.`, 'success');
  };

  const formatVnd = (amount: number) => {
    if (amount === 0) return '0 đ';
    return new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
  };

  return (
    <AppShell crumbName="Gói cước & Bản quyền">
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Header section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#e2e8f0]">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#eaf4ef] text-[#176b58] border border-[#cde2d6] mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
              Bản quyền SaaS Multi-tenant
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#1c302b]">
              GÓI CƯỚC & BẢN QUYỀN NỀN TẢNG
            </h1>
            <p className="text-sm text-[#596962] mt-1">
              Quản lý phân hạng gói dịch vụ SaaS, hạn mức chi nhánh và chính sách giá toàn hệ thống FIXO.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white border border-[#e2e8f0] rounded-[8px] px-3 py-2 text-xs text-[#596962]">
              Tổng gian hàng kích hoạt: <strong className="text-[#176b58] font-bold text-sm">32</strong>
            </div>
          </div>
        </div>

        {/* 3 Plans Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {plans.map((plan) => {
            const isPopular = plan.popular;
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col justify-between rounded-[10px] bg-white border p-6 transition-all ${
                  isPopular
                    ? 'border-[#176b58] shadow-[0_4px_12px_rgba(23,107,88,0.08)] ring-1 ring-[#176b58]'
                    : 'border-[#e2e8f0] shadow-sm hover:border-[#cbd5e1]'
                }`}
              >
                {/* Popular Badge */}
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[#176b58] text-white text-[11px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full shadow-sm">
                      Phổ biến nhất
                    </span>
                  </div>
                )}

                <div>
                  {/* Plan Header */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h2 className="text-lg font-bold text-[#1c302b]">{plan.name}</h2>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#f1f5f3] text-[#475750]">
                      <Icon name="spark" size={13} className="text-[#176b58]" />
                      {plan.activeStoresCount} gian hàng
                    </span>
                  </div>

                  <p className="text-xs text-[#718279] min-h-[34px] leading-relaxed mb-4">
                    {plan.tagline}
                  </p>

                  {/* Price */}
                  <div className="py-4 border-y border-[#f1f5f3] mb-5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold text-[#1c302b]">
                        {formatVnd(plan.price)}
                      </span>
                      <span className="text-xs font-medium text-[#718279]">
                        / {plan.period}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-[#596962]">
                      <span>
                        Chi nhánh:{' '}
                        <strong className="text-[#1c302b]">
                          {plan.maxBranches === 'unlimited' ? 'Không giới hạn' : plan.maxBranches}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Đơn/tháng:{' '}
                        <strong className="text-[#1c302b]">
                          {plan.maxOrdersPerMonth === 'unlimited' ? 'Không giới hạn' : plan.maxOrdersPerMonth}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Feature list */}
                  <div className="space-y-2.5 mb-6">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#86968f]">
                      Đặc quyền gói cước:
                    </p>
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs text-[#334155]">
                        <span className="w-4 h-4 rounded-full bg-[#eaf4ef] text-[#176b58] flex items-center justify-center flex-none mt-0.5">
                          <Icon name="check" size={11} />
                        </span>
                        <span className="leading-snug">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer Action */}
                <div className="pt-4 border-t border-[#f1f5f3]">
                  <Button
                    variant={isPopular ? 'primary' : 'outline'}
                    size="md"
                    className="w-full"
                    onClick={() => openEditModal(plan)}
                  >
                    Chỉnh sửa đặc quyền
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Info card */}
        <div className="bg-[#f8faf9] border border-[#e2e8f0] rounded-[10px] p-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-[8px] bg-[#eaf4ef] text-[#176b58] flex items-center justify-center flex-none">
              <Icon name="shield" size={18} />
            </div>
            <div className="text-xs text-[#596962] leading-relaxed">
              <strong className="text-[#1c302b] block text-sm font-bold mb-1">
                Nguyên tắc áp dụng hạn mức SaaS FIXO
              </strong>
              Các gói cước được áp dụng tức thời cho các đối tác đăng ký mới hoặc gia hạn. Các gian hàng đang trong thời hạn hợp đồng sẽ tiếp tục áp dụng mức giá và hạn mức đã ký kết cho tới kỳ thanh toán tiếp theo. Thanh toán được tự động đối soát và kích hoạt qua cổng SePay VietQR.
            </div>
          </div>
        </div>
      </div>

      {/* Edit Plan Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Chỉnh sửa gói: ${editingPlan?.name || ''}`}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#1c302b] uppercase mb-1.5">
              Giá niêm yết (VNĐ / tháng)
            </label>
            <Input
              type="number"
              value={editPrice}
              onChange={(e) => setEditPrice(Number(e.target.value))}
              placeholder="Ví dụ: 299000"
            />
            <span className="text-[11px] text-[#718279] mt-1 block">
              Hiển thị: {formatVnd(editPrice)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#1c302b] uppercase mb-1.5">
                Số chi nhánh tối đa
              </label>
              <Input
                type="text"
                value={editMaxBranches}
                onChange={(e) => setEditMaxBranches(e.target.value)}
                placeholder="Ví dụ: 2 hoặc unlimited"
              />
              <span className="text-[10px] text-[#718279] mt-1 block">
                Nhập số hoặc &quot;unlimited&quot;
              </span>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#1c302b] uppercase mb-1.5">
                Số đơn sửa tối đa / tháng
              </label>
              <Input
                type="text"
                value={editMaxOrders}
                onChange={(e) => setEditMaxOrders(e.target.value)}
                placeholder="Ví dụ: 300 hoặc unlimited"
              />
              <span className="text-[10px] text-[#718279] mt-1 block">
                Nhập số hoặc &quot;unlimited&quot;
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#1c302b] uppercase mb-1.5">
              Danh sách quyền lợi (Mỗi dòng 1 quyền lợi)
            </label>
            <textarea
              rows={6}
              value={editFeatures}
              onChange={(e) => setEditFeatures(e.target.value)}
              className="w-full text-xs font-sans p-3 rounded-[8px] border border-[#dce5e0] focus:outline-none focus:ring-1 focus:ring-[#176b58] focus:border-[#176b58] text-[#1c302b]"
              placeholder="Nhập mỗi tính năng trên một dòng..."
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#f1f5f3]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSavePlan}
            >
              Lưu thay đổi
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
