'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Icon, formatVND, useToast } from '@podscare/ui';
import { paymentService, tenantService } from '@podscare/api-client';
import { playAudioChime } from '../utils/useAudioChime';

export interface VietQrPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentId?: number | string;
  orderCode?: string;
  amount?: number;
  qrUrl?: string;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
  transferContent?: string;
  onSuccess?: (payment?: any) => void;
}

export const VietQrPaymentModal: React.FC<VietQrPaymentModalProps> = ({
  isOpen,
  onClose,
  paymentId,
  orderCode = '',
  amount = 0,
  qrUrl: propQrUrl,
  bankCode: propBankCode,
  accountNumber: propAccountNumber,
  accountName: propAccountName,
  transferContent: propTransferContent,
  onSuccess,
}) => {
  const { toast } = useToast();

  const [loadingQr, setLoadingQr] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [transactionRef, setTransactionRef] = useState('');

  // Dynamic QR details state
  const [qrUrl, setQrUrl] = useState<string>(propQrUrl || '');
  const [bankCode, setBankCode] = useState<string>(propBankCode || 'MB');
  const [accountNumber, setAccountNumber] = useState<string>(propAccountNumber || '');
  const [accountName, setAccountName] = useState<string>(propAccountName || '');
  const [transferContent, setTransferContent] = useState<string>(propTransferContent || orderCode);
  const [paymentAmount, setPaymentAmount] = useState<number>(amount);

  const [paidSuccess, setPaidSuccess] = useState(false);
  const autoCloseRef = useRef<NodeJS.Timeout | null>(null);

  // Load VietQR and Store bank account details
  useEffect(() => {
    if (!isOpen) {
      setPaidSuccess(false);
      setIsConfirming(false);
      setTransactionRef('');
      if (autoCloseRef.current) {
        clearTimeout(autoCloseRef.current);
        autoCloseRef.current = null;
      }
      return;
    }

    setPaidSuccess(false);
    setIsConfirming(false);
    setTransactionRef('');

    if (propQrUrl) setQrUrl(propQrUrl);
    if (propBankCode) setBankCode(propBankCode);
    if (propAccountNumber) setAccountNumber(propAccountNumber);
    if (propAccountName) setAccountName(propAccountName);
    if (propTransferContent) setTransferContent(propTransferContent);
    else if (orderCode) setTransferContent(orderCode);
    if (amount > 0) setPaymentAmount(amount);

    if (paymentId) {
      setLoadingQr(true);
      paymentService
        .getVietQr(paymentId)
        .then(async (res: any) => {
          const data = res?.data || res;
          if (data) {
            if (data.qr_url) setQrUrl(data.qr_url);
            if (data.bank_code) setBankCode(data.bank_code);
            if (data.account_number) setAccountNumber(data.account_number);
            if (data.account_holder || data.account_name) {
              setAccountName(data.account_holder || data.account_name);
            }
            if (data.transfer_content || data.content) {
              setTransferContent(data.transfer_content || data.content);
            }
            if (data.amount) setPaymentAmount(Number(data.amount));

            // Nếu thông tin tài khoản chưa có trong payment, lấy từ cài đặt cửa hàng
            if (!data.account_number) {
              try {
                const settingsRes = await tenantService.getSettings();
                if (settingsRes?.success && settingsRes.data) {
                  if (settingsRes.data.bank_code) setBankCode(settingsRes.data.bank_code);
                  if (settingsRes.data.bank_account_number) setAccountNumber(settingsRes.data.bank_account_number);
                  if (settingsRes.data.bank_account_holder) setAccountName(settingsRes.data.bank_account_holder);
                }
              } catch (settingErr) {
                console.warn('Could not fallback to tenant settings:', settingErr);
              }
            }

            if (data.status === 'paid' || data.status === 'completed') {
              setPaidSuccess(true);
            }
          }
        })
        .catch(async (err) => {
          console.warn('Could not fetch VietQR for payment, fallback to tenant settings:', err);
          try {
            const settingsRes = await tenantService.getSettings();
            if (settingsRes?.success && settingsRes.data) {
              if (settingsRes.data.bank_code) setBankCode(settingsRes.data.bank_code);
              if (settingsRes.data.bank_account_number) setAccountNumber(settingsRes.data.bank_account_number);
              if (settingsRes.data.bank_account_holder) setAccountName(settingsRes.data.bank_account_holder);
            }
          } catch (settingErr) {
            console.warn('Could not load tenant settings:', settingErr);
          }
        })
        .finally(() => {
          setLoadingQr(false);
        });
    } else if (!propAccountNumber) {
      // Trường hợp không truyền paymentId
      tenantService.getSettings().then((settingsRes) => {
        if (settingsRes?.success && settingsRes.data) {
          if (settingsRes.data.bank_code) setBankCode(settingsRes.data.bank_code);
          if (settingsRes.data.bank_account_number) setAccountNumber(settingsRes.data.bank_account_number);
          if (settingsRes.data.bank_account_holder) setAccountName(settingsRes.data.bank_account_holder);
        }
      }).catch((err) => {
        console.warn('Could not load tenant settings:', err);
      });
    }
  }, [
    isOpen,
    paymentId,
    propQrUrl,
    propBankCode,
    propAccountNumber,
    propAccountName,
    propTransferContent,
    orderCode,
    amount,
  ]);

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

  const handleConfirmByCskh = async () => {
    if (!paymentId) {
      toast('Không tìm thấy mã phiếu thu để xác nhận.', 'error');
      return;
    }

    setIsConfirming(true);
    try {
      const res = await paymentService.confirmPayment(paymentId, {
        transaction_ref: transactionRef.trim() || undefined,
        notes: 'CSKH xác nhận đã nhận tiền chuyển khoản tại quầy',
      });
      const data = res?.data || res;
      setPaidSuccess(true);
      try {
        playAudioChime();
      } catch (audioErr) {
        console.warn('Audio chime error:', audioErr);
      }
      toast('CSKH đã xác nhận nhận tiền thành công!', 'success');

      if (onSuccess) {
        onSuccess(data);
      }

      autoCloseRef.current = setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Failed to confirm payment by CSKH:', err);
      const errMsg =
        err?.response?.data?.message ||
        err?.message ||
        'Có lỗi khi duyệt thanh toán. Vui lòng thử lại.';
      toast(`Lỗi duyệt: ${errMsg}`, 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  // Fallback direct VietQR image URL if none returned from server
  const effectiveQrUrl =
    qrUrl ||
    (accountNumber
      ? `https://img.vietqr.io/image/${bankCode || 'MB'}-${accountNumber}-compact2.png?amount=${paymentAmount}&addInfo=${encodeURIComponent(
          transferContent || orderCode
        )}&accountName=${encodeURIComponent(accountName)}`
      : '');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        paidSuccess
          ? 'Thanh toán thành công!'
          : `Thanh toán VietQR đơn ${orderCode || `#${paymentId || ''}`}`
      }
      eyebrow="QUẦY THU NGÂN · XÁC NHẬN CHUYỂN KHOẢN TIỆM"
      maxWidth="md"
      footer={
        paidSuccess ? (
          <div className="flex justify-end w-full">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => {
                if (onSuccess) onSuccess();
                onClose();
              }}
              className="font-bold px-6 bg-[#176b58] hover:bg-[#0e4b3d]"
            >
              Hoàn tất &amp; Đóng →
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={onClose}
              disabled={isConfirming}
            >
              Đóng
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              loading={isConfirming}
              disabled={isConfirming || loadingQr}
              onClick={handleConfirmByCskh}
              className="bg-[#176b58] hover:bg-[#0e4b3d] text-white font-bold text-xs sm:text-sm px-6 py-2.5 shadow-md flex items-center justify-center gap-2"
            >
              <Icon name="check" size={16} />
              <span>CSKH: Đã nhận tiền thành công</span>
            </Button>
          </div>
        )
      }
    >
      {paidSuccess ? (
        /* Paid Success View */
        <div className="py-8 px-4 text-center animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 rounded-full bg-[#eaf4ef] text-[#176b58] mx-auto grid place-items-center mb-4 ring-8 ring-[#eaf4ef]/50">
            <Icon name="check" size={32} />
          </div>
          <h3 className="font-heading font-extrabold text-2xl text-[#1c302b] mb-2">
            Đã nhận thanh toán thành công!
          </h3>
          <p className="text-sm text-[#4c5f56] leading-relaxed max-w-[420px] mx-auto mb-6">
            Đơn hàng <strong className="text-[#176b58] font-mono">{orderCode}</strong> đã được CSKH xác nhận thanh toán chuyển khoản thành công.
          </p>
          <div className="p-4 rounded-[12px] bg-[#f8faf9] border border-[#e5ece8] text-xs text-left max-w-[380px] mx-auto space-y-2 mb-2">
            <div className="flex justify-between">
              <span className="text-[#718279]">Mã đơn hàng:</span>
              <span className="font-mono font-bold text-[#1c302b]">{orderCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#718279]">Số tiền nhận được:</span>
              <span className="font-bold text-[#176b58]">{formatVND(paymentAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#718279]">Phương thức:</span>
              <span className="font-semibold text-[#1c302b]">Chuyển khoản VietQR</span>
            </div>
            {transactionRef && (
              <div className="flex justify-between">
                <span className="text-[#718279]">Mã GD ngân hàng:</span>
                <span className="font-mono font-bold text-[#1c302b]">{transactionRef}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[#718279]">Trạng thái:</span>
              <span className="font-bold text-[#10b981]">Đã thanh toán (PAID)</span>
            </div>
          </div>
        </div>
      ) : loadingQr ? (
        /* Loading QR View */
        <div className="py-16 text-center">
          <div className="w-10 h-10 rounded-full border-3 border-[#176b58]/20 border-t-[#176b58] animate-spin mx-auto mb-4" />
          <p className="text-sm font-semibold text-[#1c302b]">
            Đang tải thông tin tài khoản và mã VietQR...
          </p>
          <p className="text-xs text-[#819089] mt-1">
            Đang kết nối hệ thống cửa hàng
          </p>
        </div>
      ) : (
        /* Active VietQR Display */
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            {/* Left QR Image */}
            <div className="flex flex-col items-center justify-center p-4 rounded-[12px] bg-[#f8faf9] border border-[#e5ece8] text-center">
              {effectiveQrUrl ? (
                <div className="bg-white p-2 rounded-[10px] border border-[#d6e5dd] shadow-xs">
                  <img
                    src={effectiveQrUrl}
                    alt={`Mã VietQR ${orderCode}`}
                    className="w-52 h-52 object-contain"
                  />
                </div>
              ) : (
                <div className="w-52 h-52 bg-[#f0f4f2] rounded-[10px] grid place-items-center text-xs text-[#718279] p-4 text-center">
                  Cửa hàng chưa cấu hình Số tài khoản ngân hàng trong phần Cài đặt thương hiệu.
                </div>
              )}
              <span className="text-[11px] text-[#697972] mt-2.5 flex items-center gap-1.5 font-medium">
                <Icon name="spark" size={13} className="text-[#176b58]" />
                Quét bằng mọi ứng dụng Ngân hàng
              </span>
            </div>

            {/* Right Transfer Details */}
            <div className="space-y-2.5 text-xs">
              <div className="p-3.5 rounded-[12px] bg-white border border-[#e5ece8] space-y-2.5 shadow-xs">
                {bankCode && (
                  <div className="flex items-center justify-between pb-2 border-b border-[#f0f4f2]">
                    <span className="text-[#788880]">Ngân hàng:</span>
                    <span className="font-bold text-[#1c302b]">{bankCode}</span>
                  </div>
                )}

                {accountNumber ? (
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
                ) : (
                  <div className="flex items-center justify-between pb-2 border-b border-[#f0f4f2]">
                    <span className="text-[#788880]">Số tài khoản:</span>
                    <span className="text-amber-600 font-semibold text-xs">Chưa cài đặt</span>
                  </div>
                )}

                {accountName && (
                  <div className="flex items-center justify-between pb-2 border-b border-[#f0f4f2]">
                    <span className="text-[#788880]">Chủ tài khoản:</span>
                    <span className="font-bold text-[#1c302b] uppercase">{accountName}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pb-2 border-b border-[#f0f4f2]">
                  <span className="text-[#788880]">Số tiền:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-heading font-extrabold text-[#1c302b] text-sm">
                      {formatVND(paymentAmount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(String(paymentAmount), 'Số tiền', 'amt')}
                      className="px-2 py-0.5 rounded-[5px] bg-[#f0f4f2] hover:bg-[#e4ece7] text-[#4d5e56] text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      {copiedKey === 'amt' ? 'Đã chép' : 'Sao chép'}
                    </button>
                  </div>
                </div>

                {/* Transfer Content */}
                <div className="p-2.5 rounded-[8px] bg-[#f7faf8] border border-[#d3e6db]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-[#176b58] uppercase tracking-wider">
                      Nội dung chuyển khoản:
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(transferContent, 'Nội dung chuyển khoản', 'content')
                      }
                      className="px-2.5 py-1 rounded-[5px] bg-[#176b58] hover:bg-[#10583f] text-white text-[10px] font-extrabold transition-colors cursor-pointer shadow-xs"
                    >
                      {copiedKey === 'content' ? '✓ Đã sao chép' : 'Sao chép mã'}
                    </button>
                  </div>
                  <div className="font-mono font-extrabold text-sm text-[#1c302b] tracking-wider py-0.5">
                    {transferContent}
                  </div>
                </div>
              </div>

              {/* Optional Transaction Reference Input */}
              <div className="p-3 rounded-[10px] bg-white border border-[#e5ece8] space-y-1.5 shadow-xs">
                <label className="text-xs font-bold text-[#2a3c36] flex items-center justify-between">
                  <span>Mã GD ngân hàng (Tùy chọn)</span>
                  <span className="text-[10px] text-[#718279] font-normal">Nhập nếu cần đối soát</span>
                </label>
                <input
                  type="text"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  placeholder="Ví dụ: FT2409... hoặc 889922"
                  disabled={isConfirming}
                  className="w-full px-3 py-1.5 text-xs font-mono font-medium rounded-[6px] border border-[#d2ded8] focus:outline-none focus:border-[#176b58] bg-white"
                />
              </div>

              <div className="p-3 rounded-[8px] bg-[#f0f8f4] border border-[#c3e6d8] text-[11px] text-[#176b58] leading-relaxed flex items-start gap-2">
                <Icon name="spark" size={15} className="shrink-0 mt-0.5 text-[#176b58]" />
                <span>
                  Tiền chuyển thẳng vào tài khoản của tiệm. Sau khi kiểm tra tiền đã vào tài khoản, CSKH bấm <strong>&ldquo;CSKH: Đã nhận tiền thành công&rdquo;</strong> để hoàn tất đơn hàng.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
