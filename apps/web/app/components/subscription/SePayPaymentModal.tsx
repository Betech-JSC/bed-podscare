'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, Button, Icon, formatVND, useToast } from '@podscare/ui';
import { saasService, type SubscribeResponseData } from '@podscare/api-client';
import { playChimeTone } from '../../utils/useAudioChime';

export interface SePayPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  planName: string;
  price: number;
  billingCycle?: 'monthly' | 'yearly';
  onSuccess: () => void;
}

export const SePayPaymentModal: React.FC<SePayPaymentModalProps> = ({
  isOpen,
  onClose,
  planId,
  planName,
  price,
  billingCycle = 'monthly',
  onSuccess,
}) => {
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<SubscribeResponseData | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Countdown timer in seconds (15 minutes = 900s)
  const [timeLeft, setTimeLeft] = useState<number>(900);
  const [isPaid, setIsPaid] = useState<boolean>(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoCloseRef = useRef<NodeJS.Timeout | null>(null);

  // Clear all background intervals & timers
  const clearTimers = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
  }, []);

  // Handle successful payment
  const handlePaymentSuccess = useCallback(() => {
    setIsPaid(true);
    clearTimers();
    try {
      playChimeTone(1.0);
    } catch {
      // Audio chime fallback
    }
    toast('Thanh toán thành công! Gói cước đã được kích hoạt.', 'success');

    // Auto close modal after 3 seconds
    autoCloseRef.current = setTimeout(() => {
      onSuccess();
      onClose();
    }, 3000);
  }, [clearTimers, onClose, onSuccess, toast]);

  // Khởi tạo hóa đơn và link VietQR SePay
  const initializeInvoice = useCallback(async () => {
    if (!planId) return;

    setLoading(true);
    setError(null);
    setIsPaid(false);
    setTimeLeft(900);
    clearTimers();

    try {
      const res = await saasService.subscribe({
        plan_id: planId,
        billing_cycle: billingCycle,
      });

      if (res?.success && res?.data) {
        setInvoice(res.data);
        const refCode = res.data.reference_code;

        // 1. Start 1-second countdown timer
        timerRef.current = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              clearTimers();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        // 2. Start polling invoice status every 2.5 seconds (2500ms)
        pollingRef.current = setInterval(async () => {
          try {
            const statusRes = await saasService.getInvoiceStatus(refCode);
            const statusData = statusRes?.data;
            const currentStatus = (statusData as any)?.status;
            const isStatusPaid = (statusData as any)?.is_paid || currentStatus === 'paid';

            if (isStatusPaid) {
              handlePaymentSuccess();
            }
          } catch (pollErr) {
            console.warn('[SePay Polling Error]', pollErr);
          }
        }, 2500);
      } else {
        setError(res?.message || 'Không thể tạo hóa đơn thanh toán. Vui lòng thử lại.');
      }
    } catch (err: any) {
      setError(
        err?.message || 'Không thể kết nối đến cổng SePay. Vui lòng kiểm tra kết nối mạng và thử lại.'
      );
    } finally {
      setLoading(false);
    }
  }, [planId, billingCycle, clearTimers, handlePaymentSuccess]);

  // Effect on modal open/close
  useEffect(() => {
    if (isOpen) {
      initializeInvoice();
    } else {
      clearTimers();
      setInvoice(null);
      setIsPaid(false);
      setError(null);
    }

    return () => {
      clearTimers();
    };
  }, [isOpen, initializeInvoice, clearTimers]);

  // Format countdown mm:ss
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Copy helper
  const copyToClipboard = async (text: string, label: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast(`Đã sao chép ${label}!`, 'info');
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2000);
    } catch {
      toast('Không thể sao chép tự động', 'error');
    }
  };

  const bankName =
    invoice?.bank_code === 'MB'
      ? 'MB Bank (Ngân hàng Quân Đội)'
      : invoice?.bank_code || 'MB Bank';
  const accountNumber = invoice?.account_number || '0388960848';
  const accountHolder = invoice?.account_holder || 'CONG TY FIXO VIET NAM';
  const referenceCode = invoice?.reference_code || '';
  const amountToPay = invoice?.amount || price;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isPaid
          ? 'Kích hoạt gói cước thành công!'
          : `Thanh toán bản quyền ${planName} qua VietQR SePay`
      }
      eyebrow="CỔNG THANH TOÁN VIETQR 24/7"
      maxWidth="md"
      footer={
        isPaid ? (
          <div className="flex justify-end w-full">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => {
                onSuccess();
                onClose();
              }}
              className="font-bold px-6"
            >
              Hoàn tất ngay →
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-[#788880] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
              <span>Đang lắng nghe giao dịch SePay...</span>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={onClose}
              className="text-xs font-semibold"
            >
              Đóng cửa sổ
            </Button>
          </div>
        )
      }
    >
      {/* State 1: Paid Success Screen */}
      {isPaid ? (
        <div className="py-8 px-4 text-center animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 rounded-full bg-[#eaf4ef] text-[#176b58] mx-auto grid place-items-center mb-4 ring-8 ring-[#eaf4ef]/50">
            <Icon name="check" size={32} />
          </div>
          <h3 className="font-heading font-extrabold text-2xl text-[#1c302b] mb-2">
            Thanh toán thành công!
          </h3>
          <p className="text-sm text-[#4c5f56] leading-relaxed max-w-[420px] mx-auto mb-6">
            Gói cước <strong className="text-[#176b58]">{planName}</strong> đã được kích hoạt thành công cho gian hàng của bạn. Hệ thống đang tự động làm mới dữ liệu...
          </p>
          <div className="p-4 rounded-[12px] bg-[#f8faf9] border border-[#e5ece8] text-xs text-left max-w-[380px] mx-auto space-y-2 mb-2">
            <div className="flex justify-between">
              <span className="text-[#718279]">Mã hóa đơn:</span>
              <span className="font-mono font-bold text-[#1c302b]">{referenceCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#718279]">Số tiền đã thanh toán:</span>
              <span className="font-bold text-[#176b58]">{formatVND(amountToPay)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#718279]">Trạng thái:</span>
              <span className="font-bold text-[#10b981]">Đã thanh toán (PAID)</span>
            </div>
          </div>
        </div>
      ) : loading ? (
        /* State 2: Loading Invoice */
        <div className="py-16 text-center">
          <div className="w-10 h-10 rounded-full border-3 border-[#176b58]/20 border-t-[#176b58] animate-spin mx-auto mb-4" />
          <p className="text-sm font-semibold text-[#1c302b]">
            Đang khởi tạo mã VietQR SePay...
          </p>
          <p className="text-xs text-[#819089] mt-1">
            Đang kết nối cổng thanh toán ngân hàng trực tuyến
          </p>
        </div>
      ) : error ? (
        /* State 3: Error Generating Invoice */
        <div className="py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-[#fbefed] text-[#bc5b52] mx-auto grid place-items-center mb-3">
            <Icon name="alert" size={24} />
          </div>
          <h4 className="text-base font-bold text-[#bc5b52] mb-1">Không thể tạo hóa đơn</h4>
          <p className="text-xs text-[#6e7d75] max-w-[380px] mx-auto mb-6">{error}</p>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={initializeInvoice}
            className="font-bold"
          >
            Thử lại
          </Button>
        </div>
      ) : invoice ? (
        /* State 4: Active VietQR Payment Display */
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Timer & Warning Notice */}
          <div className="flex items-center justify-between p-3 rounded-[10px] bg-[#faf3e7] border border-[#f4dfc2] text-xs">
            <div className="flex items-center gap-2 text-[#b77a21] font-semibold">
              <Icon name="clock" size={16} />
              <span>Thời gian hiệu lực thanh toán:</span>
            </div>
            <span
              className={`font-mono font-extrabold text-sm ${
                timeLeft < 180 ? 'text-[#bc5b52] animate-pulse' : 'text-[#b77a21]'
              }`}
            >
              {formatTimer(timeLeft)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
            {/* Left: Dynamic QR Code */}
            <div className="flex flex-col items-center justify-center p-4 rounded-[14px] bg-[#f8faf9] border border-[#e5ece8] text-center">
              {invoice.qr_url ? (
                <div className="relative group">
                  <img
                    src={invoice.qr_url}
                    alt="VietQR SePay"
                    className="w-56 h-56 sm:w-60 sm:h-60 rounded-[12px] border border-[#d6e5dd] shadow-sm object-contain bg-white p-2"
                  />
                  <div className="absolute inset-0 bg-[#17251f]/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-[12px] pointer-events-none" />
                </div>
              ) : (
                <div className="w-56 h-56 bg-[#f0f4f2] rounded-[12px] grid place-items-center text-xs text-[#718279]">
                  Đang tải mã QR...
                </div>
              )}
              <span className="text-[11px] text-[#697972] mt-2.5 flex items-center gap-1.5 font-medium">
                <Icon name="spark" size={13} className="text-[#176b58]" />
                Mở ứng dụng Ngân hàng để quét mã
              </span>
            </div>

            {/* Right: Bank Transfer Information Box */}
            <div className="space-y-2.5">
              <div className="p-3.5 rounded-[12px] bg-[#ffffff] border border-[#e5ece8] space-y-2.5 text-xs shadow-xs">
                {/* Bank Name */}
                <div className="flex items-center justify-between pb-2 border-b border-[#f0f4f2]">
                  <span className="text-[#788880]">Ngân hàng:</span>
                  <span className="font-bold text-[#1c302b]">{bankName}</span>
                </div>

                {/* Account Number */}
                <div className="flex items-center justify-between pb-2 border-b border-[#f0f4f2]">
                  <span className="text-[#788880]">Số tài khoản:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-extrabold text-[#176b58] text-sm tracking-wide">
                      {accountNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(accountNumber, 'Số tài khoản', 'acc')}
                      className="px-2 py-0.5 rounded-[5px] bg-[#eaf4ef] hover:bg-[#d8ece1] text-[#176b58] text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      {copiedKey === 'acc' ? 'Đã chép' : 'Sao chép'}
                    </button>
                  </div>
                </div>

                {/* Account Holder */}
                <div className="flex items-center justify-between pb-2 border-b border-[#f0f4f2]">
                  <span className="text-[#788880]">Chủ tài khoản:</span>
                  <span className="font-bold text-[#1c302b] uppercase">{accountHolder}</span>
                </div>

                {/* Amount */}
                <div className="flex items-center justify-between pb-2 border-b border-[#f0f4f2]">
                  <span className="text-[#788880]">Số tiền:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-heading font-extrabold text-[#1c302b] text-sm">
                      {formatVND(amountToPay)}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(String(amountToPay), 'Số tiền', 'amt')}
                      className="px-2 py-0.5 rounded-[5px] bg-[#f0f4f2] hover:bg-[#e4ece7] text-[#4d5e56] text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      {copiedKey === 'amt' ? 'Đã chép' : 'Sao chép'}
                    </button>
                  </div>
                </div>

                {/* Reference Code Syntax */}
                <div className="p-2.5 rounded-[8px] bg-[#f7faf8] border border-[#d3e6db]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-[#176b58] uppercase tracking-wider">
                      Cú pháp chuyển khoản:
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(referenceCode, 'Cú pháp chuyển khoản', 'ref')
                      }
                      className="px-2.5 py-1 rounded-[5px] bg-[#176b58] hover:bg-[#10583f] text-white text-[10px] font-extrabold transition-colors cursor-pointer shadow-xs"
                    >
                      {copiedKey === 'ref' ? '✓ Đã sao chép' : 'Sao chép mã'}
                    </button>
                  </div>
                  <div className="font-mono font-extrabold text-base text-[#1c302b] tracking-wider py-0.5">
                    {referenceCode}
                  </div>
                </div>
              </div>

              {/* Security & Warning Notice */}
              <div className="p-3 rounded-[8px] bg-[#fbefed] border border-[#f5c7c2] text-[11px] text-[#bc5b52] leading-relaxed flex items-start gap-2">
                <Icon name="alert" size={15} className="shrink-0 mt-0.5" />
                <span>
                  <strong>Lưu ý quan trọng:</strong> Quý khách vui lòng giữ nguyên nội dung chuyển khoản{' '}
                  <strong className="font-mono">{referenceCode}</strong> để hệ thống SePay tự động ghi nhận và kích hoạt bản quyền trong vòng 3-10 giây.
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
};
