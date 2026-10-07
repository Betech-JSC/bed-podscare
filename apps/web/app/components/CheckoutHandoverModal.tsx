'use client';

import React, { useState } from 'react';
import {
  Modal,
  Button,
  Input,
  Textarea,
  useToast,
} from '@podscare/ui';
import type { RepairOrder } from '@podscare/types';
import { repairService } from '@podscare/api-client';

export interface CheckoutHandoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: RepairOrder;
  onSuccess?: (updatedOrder: RepairOrder) => void;
}

export const CheckoutHandoverModal: React.FC<CheckoutHandoverModalProps> = ({
  isOpen,
  onClose,
  order,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const totalPrice = Number(order.total_price !== undefined ? order.total_price : order.price) || 0;

  const moneyFormatted = (n: number) =>
    n ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫' : '0 ₫';

  const handleConfirmCheckout = async () => {
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      await repairService.simpleCheckout(order.id, {
        payment_method: paymentMethod,
        amount: totalPrice,
        transaction_ref: transactionRef.trim() || undefined,
        notes: notes.trim() || (paymentMethod === 'cash' ? 'Thu tiền mặt tại quầy CSKH' : 'Chuyển khoản trực tiếp ngoài quầy'),
        auto_confirm: true,
      });

      // Play audio chime if sound system is active
      try {
        const audio = new Audio('/sounds/cashier-chime.mp3');
        audio.play().catch(() => {});
      } catch {
        // ignore audio failure
      }

      toast(`✓ Đã thu ${moneyFormatted(totalPrice)} và hoàn tất giao máy cho đơn ${order.id}!`, 'success');

      const updated: RepairOrder = {
        ...order,
        status: 'Hoàn tất',
        statusType: 'gray',
        handedAt: new Intl.DateTimeFormat('vi-VN').format(new Date()),
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
            {isSubmitting ? 'Đang ghi nhận...' : '✓ Xác nhận thu tiền & Trả máy'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        {errorMsg && (
          <div className="p-3 bg-[#fef2f2] border border-[#fecaca] rounded-[8px] text-xs text-[#b91c1c] font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Tổng tiền cần thu nổi bật */}
        <div className="p-4 bg-[#eaf4ef] rounded-[10px] border-2 border-[#176b58] flex items-center justify-between">
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-[#176b58]">
              TỔNG SỐ TIỀN CẦN THU
            </span>
            <small className="text-[#556960] text-xs block mt-0.5">
              Bao gồm công sửa ban đầu và các dịch vụ bổ sung
            </small>
          </div>
          <div className="text-right">
            <b className="text-2xl font-bold text-[#176b58] font-heading font-mono">
              {moneyFormatted(totalPrice)}
            </b>
          </div>
        </div>

        {/* Phương thức thanh toán 2 lựa chọn */}
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
                  💵 Tiền mặt
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
                  💳 Chuyển khoản ngoài
                </span>
                <small className="text-xs text-[#62756d] block mt-0.5">
                  Khách tự quét mã QR cá nhân của tiệm hoặc chuyển ngoài
                </small>
              </div>
            </div>
          </div>
        </div>

        {/* Mã tham chiếu nếu chuyển khoản */}
        {paymentMethod === 'bank_transfer' && (
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
            <span>✓</span> Quy trình tự động sau khi xác nhận:
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-[#63756d] m-0">
            <li>Lập phiếu thu trạng thái <b>Đã thanh toán (paid)</b> không cần sinh mã QR SePay.</li>
            <li>Chuyển trạng thái đơn sang <b>Hoàn tất (completed)</b> và ghi nhận thời gian bàn giao.</li>
            <li>Tự động kích hoạt <b>Sổ bảo hành điện tử</b> ({order.warrantyTerm || '90 ngày'}) và tích lũy doanh số khách hàng.</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
};
