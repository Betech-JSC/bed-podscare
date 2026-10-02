'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Icon, useToast } from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import {
  QuotaProgressBars,
  PricingPlanGrid,
  SePayPaymentModal,
} from '../components/subscription';
import {
  saasService,
  type SaasCurrentResponse,
} from '@podscare/api-client';

export default function SubscriptionPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SaasCurrentResponse['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal payment state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('standard');
  const [selectedPlanName, setSelectedPlanName] = useState<string>('Gói Tiêu chuẩn');
  const [selectedPrice, setSelectedPrice] = useState<number>(299000);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const fetchSubscription = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await saasService.getCurrent();
      if (res?.success && res?.data) {
        setData(res.data);
      } else {
        setError(res?.message || 'Không thể nạp thông tin gói cước.');
      }
    } catch (err: any) {
      setError(err?.message || 'Không thể kết nối đến máy chủ.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const handleOpenPayment = (
    planId: string,
    cycle: 'monthly' | 'yearly',
    price: number,
    planName: string
  ) => {
    setSelectedPlanId(planId);
    setSelectedBillingCycle(cycle);
    setSelectedPrice(price);
    setSelectedPlanName(planName);
    setPaymentModalOpen(true);
  };

  const handlePaymentSuccess = () => {
    toast('Đã kích hoạt bản quyền thành công! Đang đồng bộ hạn mức mới.', 'success');
    fetchSubscription();
  };

  // Helper date formatter: DD/MM/YYYY
  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Vô thời hạn';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return isoString;
    }
  };

  const currentPlanId = data?.tenant?.plan || data?.usage?.subscription?.plan_id || 'trial';
  const planName = data?.current_plan?.name || data?.usage?.subscription?.plan_name || 'Gói Dùng thử';
  const daysRemaining = data?.tenant?.days_remaining ?? data?.usage?.subscription?.days_remaining ?? 14;
  const expiresAt = data?.tenant?.expires_at || data?.usage?.subscription?.expires_at;
  const isExpired = data?.usage?.subscription?.is_expired || (typeof daysRemaining === 'number' && daysRemaining <= 0);
  const isExpiringSoon = !isExpired && typeof daysRemaining === 'number' && daysRemaining <= 3;

  const planBadges: Record<string, { label: string; bg: string; text: string; border: string }> = {
    trial: {
      label: 'DÙNG THỬ (TRIAL)',
      bg: 'bg-[#faf3e7]',
      text: 'text-[#b77a21]',
      border: 'border-[#f4dfc2]',
    },
    standard: {
      label: 'TIÊU CHUẨN (STANDARD)',
      bg: 'bg-[#eaf4ef]',
      text: 'text-[#176b58]',
      border: 'border-[#cde3d6]',
    },
    pro: {
      label: 'CHUYÊN NGHIỆP (PRO)',
      bg: 'bg-[#f2eff8]',
      text: 'text-[#6d5b97]',
      border: 'border-[#ded7eb]',
    },
  };

  const badgeStyle = planBadges[currentPlanId] || planBadges.trial;

  return (
    <AppShell crumbName="Gói cước & Bản quyền">
      <div className="space-y-8 animate-in fade-in duration-200">
        {/* Top Header Page Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#e5ece8]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#176b58]" />
              <span className="text-xs font-bold text-[#819089] uppercase tracking-wider">
                HỆ THỐNG QUẢN LÝ BẢN QUYỀN SAAS
              </span>
            </div>
            <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#1c302b] m-0 tracking-tight">
              Gói cước & Hạn mức gian hàng
            </h1>
            <p className="text-xs text-[#6e7d75] mt-1 mb-0 max-w-[680px]">
              Theo dõi tình trạng bản quyền, thời hạn sử dụng và dung lượng tài nguyên (chi nhánh, nhân sự, đơn hàng) của gian hàng.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto flex-none">
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={loading}
              onClick={fetchSubscription}
              icon={<Icon name="refresh" size={14} />}
              className="text-xs font-bold"
            >
              Làm mới
            </Button>
            {currentPlanId !== 'pro' && (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() =>
                  handleOpenPayment(
                    currentPlanId === 'trial' ? 'standard' : 'pro',
                    'monthly',
                    currentPlanId === 'trial' ? 299000 : 599000,
                    currentPlanId === 'trial' ? 'Gói Tiêu chuẩn' : 'Gói Chuyên nghiệp'
                  )
                }
                icon={<Icon name="spark" size={14} />}
                className="text-xs font-bold shadow-xs"
              >
                Nâng cấp ngay
              </Button>
            )}
          </div>
        </div>

        {/* Loading / Error States */}
        {loading && !data ? (
          <div className="py-20 text-center bg-white rounded-[16px] border border-[#e5ece8]">
            <div className="w-10 h-10 rounded-full border-3 border-[#176b58]/20 border-t-[#176b58] animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#1c302b]">
              Đang tải thông tin gói cước và hạn mức...
            </p>
          </div>
        ) : error && !data ? (
          <div className="p-8 text-center bg-white rounded-[16px] border border-[#f5c7c2]">
            <div className="w-12 h-12 rounded-full bg-[#fbefed] text-[#bc5b52] mx-auto grid place-items-center mb-3">
              <Icon name="alert" size={24} />
            </div>
            <h3 className="text-base font-bold text-[#bc5b52] mb-1">Không thể tải dữ liệu bản quyền</h3>
            <p className="text-xs text-[#788880] mb-4">{error}</p>
            <Button type="button" variant="primary" size="md" onClick={fetchSubscription}>
              Thử tải lại
            </Button>
          </div>
        ) : (
          <>
            {/* 1. Header Card: Current Subscription Status */}
            <div className="rounded-[16px] bg-white border border-[#e5ece8] p-6 sm:p-7 shadow-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                {/* Left: Plan & Tenant Status */}
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-[14px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none shadow-xs border border-[#cde3d6]">
                    <Icon name="spark" size={28} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                      <span className="text-xs font-bold text-[#7a8a82]">Gian hàng:</span>
                      <strong className="text-sm font-extrabold text-[#1c302b]">
                        {data?.tenant?.name || 'Gian hàng FIXO'}
                      </strong>
                      <span className="font-mono text-xs text-[#8a9992] bg-[#f0f4f2] px-2 py-0.5 rounded-[5px]">
                        Mã: {data?.tenant?.code || 'store'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="font-heading font-extrabold text-2xl text-[#1c302b] m-0">
                        {planName}
                      </h2>
                      <span
                        className={`px-3 py-1 rounded-full border text-xs font-extrabold uppercase tracking-wider ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                      >
                        {badgeStyle.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Expiry Counter & Status Badges */}
                <div className="flex flex-wrap items-center gap-4 lg:self-center">
                  {/* Days Countdown Badge */}
                  <div
                    className={`p-3.5 rounded-[12px] border flex items-center gap-3 min-w-[200px] ${
                      isExpired
                        ? 'bg-[#fbefed] border-[#f5c7c2] text-[#bc5b52]'
                        : isExpiringSoon
                        ? 'bg-[#faf3e7] border-[#f4dfc2] text-[#b77a21]'
                        : 'bg-[#f7faf8] border-[#d6e8de] text-[#176b58]'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-white grid place-items-center shadow-xs flex-none">
                      <Icon name="clock" size={18} />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold block uppercase tracking-wider opacity-85">
                        {isExpired ? 'Trạng thái bản quyền' : 'Thời gian còn lại'}
                      </span>
                      <strong className="text-base font-extrabold tracking-tight">
                        {isExpired
                          ? 'Đã hết hạn bản quyền'
                          : typeof daysRemaining === 'number'
                          ? `Còn lại ${daysRemaining} ngày`
                          : 'Đang hoạt động'}
                      </strong>
                    </div>
                  </div>

                  {/* Expiration Date Info */}
                  <div className="p-3.5 rounded-[12px] bg-[#fbfcfb] border border-[#e5ece8] min-w-[170px]">
                    <span className="text-[11px] font-bold text-[#819089] block uppercase tracking-wider">
                      Ngày hết hạn:
                    </span>
                    <strong className="text-sm font-extrabold text-[#1c302b] mt-0.5 block">
                      {formatDate(expiresAt)}
                    </strong>
                    <span className="text-[10px] text-[#718279]">
                      {currentPlanId === 'trial' ? 'Chu kỳ 14 ngày dùng thử' : 'Tự động gia hạn theo hóa đơn'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expiring / Expired Warning Banner */}
              {isExpired ? (
                <div className="mt-5 p-3.5 rounded-[10px] bg-[#fbefed] border border-[#f5c7c2] text-xs text-[#bc5b52] flex items-center justify-between gap-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <Icon name="alert" size={16} className="shrink-0" />
                    <span>
                      <strong>Bản quyền gian hàng đã hết hạn!</strong> Một số tính năng tạo đơn, thêm nhân viên hoặc chi nhánh có thể bị tạm khóa. Vui lòng gia hạn hoặc nâng cấp gói để tiếp tục sử dụng bình thường.
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      handleOpenPayment('standard', 'monthly', 299000, 'Gói Tiêu chuẩn')
                    }
                    className="font-bold flex-none text-xs"
                  >
                    Gia hạn ngay
                  </Button>
                </div>
              ) : isExpiringSoon ? (
                <div className="mt-5 p-3.5 rounded-[10px] bg-[#faf3e7] border border-[#f4dfc2] text-xs text-[#b77a21] flex items-center justify-between gap-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <Icon name="alert" size={16} className="shrink-0" />
                    <span>
                      Gói cước của bạn sẽ hết hạn trong <strong>{daysRemaining} ngày</strong> tới. Quý khách có thể gia hạn sớm để tránh gián đoạn quy trình tiếp nhận máy sửa chữa.
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      handleOpenPayment(
                        currentPlanId === 'trial' ? 'standard' : currentPlanId,
                        'monthly',
                        currentPlanId === 'pro' ? 599000 : 299000,
                        currentPlanId === 'pro' ? 'Gói Chuyên nghiệp' : 'Gói Tiêu chuẩn'
                      )
                    }
                    className="font-bold flex-none text-xs border-[#f4dfc2] hover:bg-[#fff9f0]"
                  >
                    Gia hạn trước
                  </Button>
                </div>
              ) : null}
            </div>

            {/* 2. Quota Usage Progress Bars */}
            <div className="rounded-[16px] bg-white border border-[#e5ece8] p-6 sm:p-7 shadow-xs">
              <QuotaProgressBars
                branches={data?.usage?.branches}
                users={data?.usage?.users}
                orders={data?.usage?.orders}
              />
            </div>

            {/* 3. Pricing Plan Grid for Upgrade / Renewal */}
            <div className="rounded-[16px] bg-white border border-[#e5ece8] p-6 sm:p-7 shadow-xs">
              <PricingPlanGrid
                currentPlanId={currentPlanId}
                onSelectPlan={handleOpenPayment}
              />
            </div>
          </>
        )}
      </div>

      {/* 4. SePay VietQR Payment & Polling Modal */}
      <SePayPaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        planId={selectedPlanId}
        planName={selectedPlanName}
        price={selectedPrice}
        billingCycle={selectedBillingCycle}
        onSuccess={handlePaymentSuccess}
      />
    </AppShell>
  );
}
