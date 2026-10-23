'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  Button,
  Input,
  CurrencyInput,
  Textarea,
  Icon,
  useToast,
} from '@podscare/ui';
import type { RepairOrder } from '@podscare/types';
import { repairService } from '@podscare/api-client';
import { useShift } from '../providers/ShiftProvider';
import { useOptionalPodsCare } from '../providers';

export interface CheckoutHandoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: RepairOrder;
  onSuccess?: (updatedOrder: RepairOrder) => void;
}

const WARRANTY_MONTH_DAYS_MAP: Record<number, number> = {
  3: 90,
  6: 180,
  9: 270,
  12: 365,
};

const WARRANTY_OPTIONS: Array<{ months: 3 | 6 | 9 | 12; label: string; days: number }> = [
  { months: 3, label: '3 tháng', days: 90 },
  { months: 6, label: '6 tháng', days: 180 },
  { months: 9, label: '9 tháng', days: 270 },
  { months: 12, label: '12 tháng', days: 365 },
];

const QUICK_PERCENT_OPTIONS = [5, 10, 15, 20];
const QUICK_FIXED_OPTIONS = [20000, 50000, 100000];

export const CheckoutHandoverModal: React.FC<CheckoutHandoverModalProps> = ({
  isOpen,
  onClose,
  order,
  onSuccess,
}) => {
  const { toast } = useToast();
  const { refreshShift } = useShift();
  const podsCare = useOptionalPodsCare();
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const normalizeVndPrice = (raw: unknown): number => {
    const val = Number(raw) || 0;
    if (val <= 1) return 0;
    const rounded = Math.round(val);
    if (rounded >= 500 && rounded % 1000 !== 0) return Math.round(rounded / 1000) * 1000;
    return rounded;
  };

  const isWarrantyOrder =
    order.order_type === 'warranty' || (order as any).orderType === 'warranty';

  // 1. Service Price State (Nếu đơn chưa báo giá hoặc <= 1đ thì mặc định 0đ)
  const initialRawPrice = normalizeVndPrice(order.total_price !== undefined ? order.total_price : order.price);
  const [servicePrice, setServicePrice] = useState<number>(initialRawPrice <= 1 ? 0 : initialRawPrice);

  useEffect(() => {
    const raw = normalizeVndPrice(order.total_price !== undefined ? order.total_price : order.price);
    setServicePrice(raw <= 1 ? 0 : raw);
  }, [order]);

  // 2. Warranty State (Mặc định: 3 tháng)
  const [warrantyMonths, setWarrantyMonths] = useState<3 | 6 | 9 | 12>(3);

  // 3. Discount State
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'fixed'>('none');
  const [discountPercent, setDiscountPercent] = useState<number | ''>('');
  const [discountFixed, setDiscountFixed] = useState<number | ''>('');

  const moneyFormatted = (n: number) =>
    n ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫' : '0 ₫';

  // Tính ngày hết hạn bảo hành dự kiến
  const computedExpiryDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + WARRANTY_MONTH_DAYS_MAP[warrantyMonths]);
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  }, [warrantyMonths]);

  // Tính số tiền giảm giá và số tiền thực thu
  const calculatedDiscountAmount = useMemo(() => {
    if (discountType === 'percent') {
      const pct = typeof discountPercent === 'number' ? discountPercent : 0;
      return Math.min(servicePrice, Math.round((servicePrice * pct) / 100));
    }
    if (discountType === 'fixed') {
      const amt = typeof discountFixed === 'number' ? discountFixed : 0;
      return Math.min(servicePrice, Math.max(0, amt));
    }
    return 0;
  }, [discountType, discountPercent, discountFixed, servicePrice]);

  const rawTotal = servicePrice;
  const finalAmount = Math.max(0, rawTotal - calculatedDiscountAmount);

  // Reset giảm giá
  const handleClearDiscount = () => {
    setDiscountType('none');
    setDiscountPercent('');
    setDiscountFixed('');
  };

  const handlePercentChange = (val: string) => {
    if (val === '') {
      setDiscountPercent('');
      return;
    }
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setDiscountPercent(Math.min(100, Math.max(0, num)));
    }
  };

  const handleFixedChange = (val: string) => {
    if (val === '') {
      setDiscountFixed('');
      return;
    }
    const num = parseFloat(val.replace(/[^\d]/g, ''));
    if (!isNaN(num)) {
      setDiscountFixed(Math.min(servicePrice, Math.max(0, num)));
    }
  };

  const handleConfirmCheckout = async () => {
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const checkoutRes: any = await repairService.simpleCheckout(order.id, {
        payment_method: paymentMethod,
        amount: finalAmount,
        service_price: servicePrice,
        transaction_ref: transactionRef.trim() || undefined,
        notes:
          notes.trim() ||
          (isWarrantyOrder && finalAmount === 0
            ? 'Bàn giao trả máy đơn bảo hành 0 ₫ tại quầy CSKH'
            : paymentMethod === 'cash'
            ? 'Thu tiền mặt tại quầy CSKH'
            : 'Chuyển khoản trực tiếp ngoài quầy'),
        auto_confirm: true,
        discount_type: discountType !== 'none' ? discountType : undefined,
        discount_value: discountType === 'percent' ? (Number(discountPercent) || 0) : (discountType === 'fixed' ? (Number(discountFixed) || 0) : undefined),
        discount_amount: calculatedDiscountAmount > 0 ? calculatedDiscountAmount : undefined,
        warranty_months: warrantyMonths,
        warranty_terms_days: WARRANTY_MONTH_DAYS_MAP[warrantyMonths],
      });

      // Play audio chime if sound system is active
      try {
        const audio = new Audio('/sounds/cashier-chime.mp3');
        audio.play().catch(() => {});
      } catch {
        // ignore audio failure
      }

      await refreshShift().catch(() => {});

      toast(`Đã thu ${moneyFormatted(finalAmount)} và hoàn tất giao máy cho đơn ${order.id}!`, 'success');

      // Cập nhật giá thực tế lên đối tượng đơn hàng
      order.total_price = servicePrice;
      order.price = servicePrice;

      const responseTenant = checkoutRes?.data?.order?.tenant || checkoutRes?.order?.tenant || checkoutRes?.tenant;

      const updated: RepairOrder = {
        ...order,
        total_price: servicePrice,
        price: servicePrice,
        paid_amount: finalAmount,
        paidAmount: finalAmount,
        status: 'Hoàn tất',
        statusType: 'gray',
        warrantyTerm: isWarrantyOrder ? order.warrantyTerm : `${warrantyMonths} tháng`,
        warranty_terms_days: isWarrantyOrder ? order.warranty_terms_days : WARRANTY_MONTH_DAYS_MAP[warrantyMonths],
        warranty_months: isWarrantyOrder ? order.warranty_months : warrantyMonths,
        discount_type: discountType,
        discount_amount: calculatedDiscountAmount,
        handedAt: new Intl.DateTimeFormat('vi-VN').format(new Date()),
        tenant:
          responseTenant ||
          order.tenant ||
          podsCare?.tenantBranding ||
          podsCare?.currentUser?.tenant ||
          undefined,
      };

      if (onSuccess) {
        onSuccess(updated);
      }
      onClose();
    } catch (err: any) {
      console.error('Checkout failed:', err);
      const msg = err?.response?.data?.message || err?.message || 'Có lỗi xảy ra khi xác nhận thu tiền.';
      setErrorMsg(msg);
      toast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      eyebrow="BÀN GIAO THIẾT BỊ · THU TIỀN NHANH"
      title={`Thu tiền & Trả máy · ${order.id}`}
      subtitle={`Khách hàng: ${order.name} (${order.phone || 'Không có SĐT'}) · Thiết bị: ${order.device}`}
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Hủy bỏ
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={isSubmitting}
            onClick={handleConfirmCheckout}
            className="bg-[#176b58] hover:bg-[#125848] text-white font-bold"
          >
            {isSubmitting ? 'Đang ghi nhận...' : `Xác nhận thu ${moneyFormatted(finalAmount)} & Trả máy`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm max-h-[75vh] overflow-y-auto pr-1">
        {errorMsg && (
          <div className="p-3 bg-[#fef2f2] border border-[#fecaca] rounded-[8px] text-xs text-[#b91c1c] font-medium flex items-center gap-1.5">
            <Icon name="alert" size={14} />
            <span>{errorMsg}</span>
          </div>
        )}

        {isWarrantyOrder && (
          <div
            data-testid="checkout-warranty-free-banner"
            className="p-3.5 bg-[#f0f7f4] border border-[#b8d9cb] rounded-[10px] text-xs text-[#176b58] space-y-1"
          >
            <div className="font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Icon name="shield" size={14} />
              <span>Bàn giao đơn bảo hành miễn phí (0 ₫)</span>
            </div>
            <p className="m-0 text-[#2d3d35] leading-relaxed">
              Đây là <strong>Đơn Bảo Hành</strong> (mặc định thực thu <strong>0 ₫</strong>, trừ khi phát sinh phụ phí nâng cấp ngoài phạm vi bảo hành). Khi xác nhận trả máy, hệ thống sẽ đóng đơn hoàn tất (<code>completed</code>) và <strong>giữ nguyên hạn bảo hành gốc</strong>, không cộng dồn thêm hạn bảo hành mới.
            </p>
          </div>
        )}

        {/* Khối Chi phí sửa chữa / Dịch vụ thực tế (Cho phép CSKH chỉnh sửa trực tiếp) */}
        <div className="space-y-2.5 p-3.5 bg-white rounded-[10px] border-2 border-[#176b58]/40 shadow-xs">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-[#1c302b] uppercase tracking-wide">
              Chi phí sửa chữa / Dịch vụ thực tế <span className="text-red-500">*</span>
            </label>
            {initialRawPrice <= 1 ? (
              <span className="text-[11px] font-semibold text-[#b45309] bg-[#fef3c7] px-2 py-0.5 rounded border border-[#fde68a]">
                Đơn chưa báo giá lúc tiếp nhận
              </span>
            ) : (
              <span className="text-[11px] font-medium text-[#556960]">
                Giá tiếp nhận: {moneyFormatted(initialRawPrice)}
              </span>
            )}
          </div>

          {initialRawPrice <= 1 && (
            <div className="p-2 bg-[#fffbeb] border border-[#fef08a] rounded-[6px] text-xs text-[#92400e] flex items-center gap-1.5">
              <Icon name="alert" size={14} className="text-[#92400e]" />
              <span>Đơn chưa báo giá lúc tiếp nhận — Vui lòng nhập số tiền thực thu đã báo khách (hoặc để 0 ₫).</span>
            </div>
          )}

          <div className="space-y-2">
            <CurrencyInput
              label="Số tiền dịch vụ thực tế (*)"
              value={servicePrice}
              onChangeValue={(val) => {
                setServicePrice(Math.max(0, val || 0));
              }}
              placeholder="0"
              className="text-base font-bold text-[#176b58]"
            />

            {/* Chip gợi ý giá nhanh */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[11px] text-[#556960] font-medium">Chọn nhanh:</span>
              {[0, 150000, 250000, 350000, 500000].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setServicePrice(p)}
                  className={`px-2.5 py-1 rounded-[6px] text-xs font-semibold border transition-all cursor-pointer ${
                    servicePrice === p
                      ? 'bg-[#176b58] text-white border-[#176b58]'
                      : 'bg-[#f4f8f6] text-[#176b58] border-[#c2ded3] hover:bg-[#eaf4ef]'
                  }`}
                >
                  {p === 0 ? '0 ₫' : moneyFormatted(p)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Khối 1: Thời hạn bảo hành điện tử linh hoạt */}
        <div className="space-y-2 p-3 bg-[#f8faf9] rounded-[10px] border border-[#dce6e0]">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-[#1c302b] uppercase tracking-wide">
              Thời hạn bảo hành điện tử <span className="text-red-500">*</span>
            </label>
            <span className="text-[11px] font-semibold text-[#176b58] bg-[#eaf4ef] px-2 py-0.5 rounded">
              {isWarrantyOrder ? 'Giữ nguyên hạn gốc' : `${WARRANTY_MONTH_DAYS_MAP[warrantyMonths]} ngày`}
            </span>
          </div>

          {isWarrantyOrder && (
            <div
              data-testid="checkout-warranty-preserve-notice"
              className="p-2 bg-[#eaf4ef] border border-[#c2ded3] rounded-[6px] text-[11px] text-[#176b58] font-medium"
            >
              Đơn bảo hành giữ nguyên hạn bảo hành gốc từ đơn sửa chữa ban đầu — hệ thống không cộng dồn thêm hạn bảo hành mới chồng lên đơn bảo hành.
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            {WARRANTY_OPTIONS.map((opt) => (
              <button
                key={opt.months}
                type="button"
                onClick={() => setWarrantyMonths(opt.months)}
                className={`py-2 px-2.5 rounded-[8px] border-2 text-xs font-bold transition-all text-center cursor-pointer ${
                  warrantyMonths === opt.months
                    ? 'border-[#176b58] bg-[#f0f8f4] text-[#176b58] shadow-xs'
                    : 'border-[#e0e8e4] bg-white text-[#2d3d35] hover:bg-[#fbfcfb]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="text-[11px] text-[#556960] flex items-center gap-1.5 pt-0.5">
            <span>Hạn bảo hành dự kiến: đến ngày <b>{computedExpiryDateStr}</b></span>
          </div>
        </div>

        {/* Khối 2: Giảm giá / Khuyến mãi */}
        <div className="space-y-2.5 p-3 bg-white rounded-[10px] border border-[#dce6e0]">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-[#1c302b] uppercase tracking-wide">
              Giảm giá / Khuyến mãi (Tùy chọn)
            </label>
            {discountType !== 'none' && (
              <button
                type="button"
                onClick={handleClearDiscount}
                className="text-xs text-[#b91c1c] hover:underline font-semibold cursor-pointer flex items-center gap-1"
              >
                Bỏ giảm giá
              </button>
            )}
          </div>

          {/* Tab chọn chế độ giảm giá */}
          <div className="grid grid-cols-3 gap-2 p-1 bg-[#f0f4f2] rounded-[8px] text-xs font-medium">
            <button
              type="button"
              onClick={() => handleClearDiscount()}
              className={`py-1.5 px-2 rounded-[6px] transition-all text-center cursor-pointer ${
                discountType === 'none'
                  ? 'bg-white font-bold text-[#176b58] shadow-xs'
                  : 'text-[#62756d] hover:text-[#1c302b]'
              }`}
            >
              Không giảm
            </button>
            <button
              type="button"
              onClick={() => {
                setDiscountType('percent');
                if (discountPercent === '') setDiscountPercent(10);
              }}
              className={`py-1.5 px-2 rounded-[6px] transition-all text-center cursor-pointer ${
                discountType === 'percent'
                  ? 'bg-white font-bold text-[#176b58] shadow-xs'
                  : 'text-[#62756d] hover:text-[#1c302b]'
              }`}
            >
              % Theo phần trăm
            </button>
            <button
              type="button"
              onClick={() => {
                setDiscountType('fixed');
                if (discountFixed === '') setDiscountFixed(50000);
              }}
              className={`py-1.5 px-2 rounded-[6px] transition-all text-center cursor-pointer ${
                discountType === 'fixed'
                  ? 'bg-white font-bold text-[#176b58] shadow-xs'
                  : 'text-[#62756d] hover:text-[#1c302b]'
              }`}
            >
              ₫ Theo số tiền
            </button>
          </div>

          {/* Chi tiết chế độ % */}
          {discountType === 'percent' && (
            <div className="space-y-2 pt-1 animate-fadeIn">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#556960] font-medium">Chọn nhanh:</span>
                <div className="flex gap-1.5 flex-wrap">
                  {QUICK_PERCENT_OPTIONS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDiscountPercent(pct)}
                      className={`px-2.5 py-1 rounded-[6px] text-xs font-semibold border transition-all cursor-pointer ${
                        discountPercent === pct
                          ? 'bg-[#176b58] text-white border-[#176b58]'
                          : 'bg-[#f4f8f6] text-[#176b58] border-[#c2ded3] hover:bg-[#eaf4ef]'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-grow">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="Nhập % giảm giá (0 - 100)"
                    value={discountPercent}
                    onChange={(e) => handlePercentChange(e.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#62756d]">
                    %
                  </span>
                </div>
                <div className="text-right text-xs flex-shrink-0 text-[#176b58] font-bold">
                  -{moneyFormatted(calculatedDiscountAmount)}
                </div>
              </div>
            </div>
          )}

          {/* Chi tiết chế độ số tiền cố định */}
          {discountType === 'fixed' && (
            <div className="space-y-2 pt-1 animate-fadeIn">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#556960] font-medium">Chọn nhanh:</span>
                <div className="flex gap-1.5 flex-wrap">
                  {QUICK_FIXED_OPTIONS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setDiscountFixed(amt)}
                      className={`px-2.5 py-1 rounded-[6px] text-xs font-semibold border transition-all cursor-pointer ${
                        discountFixed === amt
                          ? 'bg-[#176b58] text-white border-[#176b58]'
                          : 'bg-[#f4f8f6] text-[#176b58] border-[#c2ded3] hover:bg-[#eaf4ef]'
                      }`}
                    >
                      -{moneyFormatted(amt)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-grow">
                  <Input
                    type="text"
                    placeholder="Nhập số tiền giảm giá (VNĐ)"
                    value={discountFixed !== '' ? new Intl.NumberFormat('vi-VN').format(Number(discountFixed)) : ''}
                    onChange={(e) => handleFixedChange(e.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#62756d]">
                    ₫
                  </span>
                </div>
                <div className="text-right text-xs flex-shrink-0 text-[#176b58] font-bold">
                  -{moneyFormatted(calculatedDiscountAmount)}
                </div>
              </div>

              {Number(discountFixed) > servicePrice && (
                <small className="text-[#b91c1c] text-[11px] block">
                  Số tiền giảm vượt quá tổng đơn, hệ thống tự động khóa mức giảm tối đa {moneyFormatted(servicePrice)}.
                </small>
              )}
            </div>
          )}
        </div>

        {/* Khối 3: Bảng kê tổng kết thanh toán nổi bật */}
        <div className="p-4 bg-[#eaf4ef] rounded-[10px] border-2 border-[#176b58] space-y-2">
          {calculatedDiscountAmount > 0 && (
            <div className="space-y-1 pb-2 border-b border-[#c2ded3] text-xs">
              <div className="flex items-center justify-between text-[#556960]">
                <span>Chi phí dịch vụ:</span>
                <span className="line-through">{moneyFormatted(servicePrice)}</span>
              </div>
              <div className="flex items-center justify-between text-[#b91c1c] font-semibold">
                <span>
                  Giảm giá / Chiết khấu {discountType === 'percent' ? `(${discountPercent}%)` : '(tiền mặt)'}:
                </span>
                <span>-{moneyFormatted(calculatedDiscountAmount)}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-[#176b58]">
                TỔNG TIỀN THỰC THU
              </span>
              <small className="text-[#556960] text-xs block mt-0.5">
                {calculatedDiscountAmount > 0
                  ? 'Đã áp dụng giảm giá chiết khấu'
                  : 'Bao gồm công sửa ban đầu và các dịch vụ bổ sung'}
              </small>
            </div>
            <div className="text-right">
              <b className="text-2xl font-bold text-[#176b58] font-heading font-mono">
                {moneyFormatted(finalAmount)}
              </b>
            </div>
          </div>
        </div>

        {/* Khối 4: Phương thức thanh toán 2 lựa chọn */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-[#2d3d35] uppercase tracking-wide">
            Hình thức thanh toán tại quầy <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Tiền mặt */}
            <div
              onClick={() => setPaymentMethod('cash')}
              className={`p-3.5 rounded-[10px] border-2 cursor-pointer transition-all flex items-start gap-3 ${
                paymentMethod === 'cash'
                  ? 'border-[#176b58] bg-[#f0f8f4] shadow-xs'
                  : 'border-[#e0e8e4] bg-white hover:bg-[#fbfcfb]'
              }`}
            >
              <input
                type="radio"
                name="payment_method"
                value="cash"
                checked={paymentMethod === 'cash'}
                onChange={() => setPaymentMethod('cash')}
                className="mt-1 text-[#176b58] focus:ring-[#176b58]"
              />
              <div>
                <span className="font-bold text-sm text-[#1c302b] block">
                  Tiền mặt
                </span>
                <small className="text-xs text-[#62756d] block mt-0.5">
                  Khách thanh toán tiền mặt trực tiếp tại quầy CSKH
                </small>
              </div>
            </div>

            {/* Chuyển khoản */}
            <div
              onClick={() => setPaymentMethod('bank_transfer')}
              className={`p-3.5 rounded-[10px] border-2 cursor-pointer transition-all flex items-start gap-3 ${
                paymentMethod === 'bank_transfer'
                  ? 'border-[#176b58] bg-[#f0f8f4] shadow-xs'
                  : 'border-[#e0e8e4] bg-white hover:bg-[#fbfcfb]'
              }`}
            >
              <input
                type="radio"
                name="payment_method"
                value="bank_transfer"
                checked={paymentMethod === 'bank_transfer'}
                onChange={() => setPaymentMethod('bank_transfer')}
                className="mt-1 text-[#176b58] focus:ring-[#176b58]"
              />
              <div>
                <span className="font-bold text-sm text-[#1c302b] block">
                  Chuyển khoản ngoài
                </span>
                <small className="text-xs text-[#62756d] block mt-0.5">
                  Khách tự quét mã QR cá nhân của tiệm hoặc chuyển ngoài
                </small>
              </div>
            </div>
          </div>
        </div>

        {/* Mã QR động VietQR & Mã tham chiếu nếu chuyển khoản */}
        {paymentMethod === 'bank_transfer' && (
          <div className="space-y-3">
            <div
              data-testid="checkout-vietqr-box"
              className="p-4 rounded-[10px] border-2 border-[#176b58]/30 bg-[#f4faf7] flex flex-col sm:flex-row items-center gap-4"
            >
              <div className="bg-white p-2 rounded-[8px] border border-[#cde4d8] shadow-2xs flex-none">
                <img
                  src={`https://img.vietqr.io/image/MB-0987654321-compact2.png?amount=${finalAmount}&addInfo=${encodeURIComponent(`PODSCARE ${order.id}`)}`}
                  alt={`VietQR ${order.id}`}
                  className="w-36 h-36 object-contain"
                />
              </div>
              <div className="space-y-1.5 text-xs flex-1">
                <span className="inline-block px-2 py-0.5 rounded bg-[#176b58] text-white font-bold text-[10px] uppercase tracking-wider">
                  Quét mã VietQR tự động điền tiền & nội dung
                </span>
                <div className="text-[#1c302b]">
                  <span className="text-[#5c6e65]">Số tiền chuyển khoản: </span>
                  <b className="text-base font-bold text-[#176b58] font-mono">
                    {moneyFormatted(finalAmount)}
                  </b>
                </div>
                <div className="text-[#1c302b]">
                  <span className="text-[#5c6e65]">Nội dung chuyển khoản: </span>
                  <b className="font-mono font-bold text-[#176b58] bg-white px-2 py-0.5 rounded border border-[#b8d9cb]">
                    PODSCARE {order.id}
                  </b>
                </div>
                <p className="text-[11px] text-[#62756d] m-0">
                  Khách quét mã QR trên màn hình, kiểm tra đúng số tiền và nội dung trước khi xác nhận bàn giao.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#2d3d35] mb-1">
                Mã tham chiếu ngân hàng / Mã giao dịch (tùy chọn):
              </label>
              <Input
                placeholder="Ví dụ: FT2610079988 hoặc 4 số cuối mã GD..."
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Ghi chú thêm */}
        <div>
          <label className="block text-xs font-bold text-[#2d3d35] mb-1">
            Ghi chú phiếu thu (tùy chọn):
          </label>
          <Textarea
            placeholder="Nhập ghi chú thêm nếu cần (VD: Khách nhờ gửi lại tai nghe cũ qua shipper...)"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Hộp thông tin nghiệp vụ tự động */}
        <div className="p-3 bg-[#f8faf9] rounded-[8px] border border-[#dce6e0] text-xs text-[#4e6057] space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-[#176b58]">
            <Icon name="check" size={14} />
            <span>Quy trình tự động sau khi xác nhận:</span>
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-[#63756d] m-0">
            <li>Lập phiếu thu trạng thái <b>Đã thanh toán (paid)</b> số tiền thực thu: <b>{moneyFormatted(finalAmount)}</b>.</li>
            <li>Chuyển trạng thái đơn sang <b>Hoàn tất (completed)</b> và ghi nhận thời gian bàn giao.</li>
            <li>Tự động kích hoạt <b>Sổ bảo hành điện tử</b> ({warrantyMonths} tháng / {WARRANTY_MONTH_DAYS_MAP[warrantyMonths]} ngày) đến <b>{computedExpiryDateStr}</b>.</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
};
