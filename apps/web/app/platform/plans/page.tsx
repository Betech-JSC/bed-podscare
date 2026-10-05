'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Icon, Modal, Input, useToast } from '@podscare/ui';
import { AppShell } from '../../components/AppShell';
import { platformService, type PlatformPlan } from '@podscare/api-client';

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

export default function PlatformPlansPage() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form edit states
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editMaxBranches, setEditMaxBranches] = useState<string>('1');
  const [editMaxOrders, setEditMaxOrders] = useState<string>('50');
  const [editFeatures, setEditFeatures] = useState<string>('');

  const loadPlans = useCallback(async () => {
    try {
      setLoading(true);
      const res = await platformService.getPlans();
      const raw = res?.data || res;
      const list = Array.isArray(raw) ? raw : (raw?.data || []);

      if (Array.isArray(list) && list.length > 0) {
        const mapped: SubscriptionPlan[] = list.map((p: any) => ({
          id: String(p.id),
          name: p.name,
          tagline: p.tagline || '',
          price: Number(p.price) || 0,
          period: p.period || 'tháng',
          popular: Boolean(p.popular || p.is_popular),
          activeStoresCount: Number(p.active_stores_count || p.activeStoresCount) || 0,
          maxBranches: p.max_branches === 'unlimited' || p.max_branches === 0 ? 'unlimited' : (Number(p.max_branches) || 1),
          maxUsers: p.max_users === 'unlimited' || p.max_users === 0 ? 'unlimited' : (Number(p.max_users) || 2),
          maxOrdersPerMonth: p.max_orders_per_month === 'unlimited' || p.max_orders_per_month === 0 ? 'unlimited' : (Number(p.max_orders_per_month) || 50),
          features: Array.isArray(p.features) ? p.features : (typeof p.features === 'string' ? JSON.parse(p.features) : []),
        }));
        setPlans(mapped);
      } else {
        setPlans([]);
      }
    } catch (err) {
      console.warn('Could not fetch plans from API:', err);
      toast('Không thể tải danh sách gói cước từ máy chủ.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const openEditModal = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setEditPrice(plan.price);
    setEditMaxBranches(plan.maxBranches === 'unlimited' ? 'unlimited' : String(plan.maxBranches));
    setEditMaxOrders(plan.maxOrdersPerMonth === 'unlimited' ? 'unlimited' : String(plan.maxOrdersPerMonth));
    setEditFeatures(plan.features.join('\n'));
    setIsModalOpen(true);
  };

  const handleSavePlan = async () => {
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

    const payload: Partial<PlatformPlan> = {
      price: Math.max(0, editPrice),
      max_branches: parsedBranches,
      max_orders_per_month: parsedOrders,
      features: updatedFeatures.length > 0 ? updatedFeatures : editingPlan.features,
    };

    setIsSaving(true);
    try {
      await platformService.updatePlan(editingPlan.id, payload);

      setPlans((prev) =>
        prev.map((p) =>
          p.id === editingPlan.id
            ? {
                ...p,
                price: Math.max(0, editPrice),
                maxBranches: parsedBranches,
                maxOrdersPerMonth: parsedOrders,
                features: updatedFeatures.length > 0 ? updatedFeatures : p.features,
              }
            : p
        )
      );

      setIsModalOpen(false);
      toast(`Gói cước "${editingPlan.name}" đã được cập nhật thành công lên hệ thống.`, 'success');
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Không thể cập nhật gói cước.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const formatVnd = (amount: number) => {
    if (amount === 0) return '0 đ';
    return new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
  };

  const totalActiveStores = plans.reduce((sum, p) => sum + (p.activeStoresCount || 0), 0);

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
            <Button
              variant="outline"
              size="sm"
              loading={loading}
              onClick={loadPlans}
            >
              Làm mới
            </Button>
            <div className="bg-white border border-[#e2e8f0] rounded-[8px] px-3 py-2 text-xs text-[#596962]">
              Tổng gian hàng kích hoạt: <strong className="text-[#176b58] font-bold text-sm">{totalActiveStores}</strong>
            </div>
          </div>
        </div>

        {/* Plans Grid */}
        {loading ? (
          <div className="py-16 text-center text-xs text-[#718279]">
            <div className="w-8 h-8 rounded-full border-2 border-[#176b58]/20 border-t-[#176b58] animate-spin mx-auto mb-3" />
            Đang tải dữ liệu gói cước từ máy chủ...
          </div>
        ) : plans.length === 0 ? (
          <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-12 text-center text-sm text-[#718279]">
            Chưa có gói cước nào được định cấu hình trên máy chủ.
          </div>
        ) : (
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
        )}

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
              <p className="m-0">
                Các gói cước được áp dụng tức thời cho các đối tác đăng ký mới hoặc gia hạn. Các gian hàng đang trong thời hạn hợp đồng sẽ tiếp tục áp dụng mức giá và hạn mức đã ký kết cho tới kỳ thanh toán tiếp theo. Thanh toán được tự động đối soát và kích hoạt qua cổng SePay VietQR.
              </p>
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
              disabled={isSaving}
              onClick={() => setIsModalOpen(false)}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isSaving}
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
