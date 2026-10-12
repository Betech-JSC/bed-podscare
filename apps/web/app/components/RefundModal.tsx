'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button, CurrencyInput, Textarea, useToast, Icon } from '@podscare/ui';
import { paymentService, repairService } from '@podscare/api-client';
import { useShift } from '../providers/ShiftProvider';
import { usePodsCare } from '../providers';

export interface RefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment?: {
    id: number | string;
    paymentCode?: string;
    orderCode?: string;
    customerName?: string;
    amount: number;
    method?: string;
  } | null;
  order?: {
    id: number | string;
    order_code?: string;
    name?: string;
    customerName?: string;
    total_price?: number;
    price?: number;
  } | null;
  onSuccess?: () => void;
}

const REASON_PRESETS = [
  'Khách không hài lòng về chất lượng sửa chữa',
  'Lỗi kỹ thuật không thể khắc phục triệt để',
  'Đổi trả hoàn tiền theo chính sách dịch vụ',
  'Không có linh kiện thay thế phù hợp',
  'Yêu cầu hoàn trả từ khách hàng',
];

export const RefundModal: React.FC<RefundModalProps> = ({
  isOpen,
  onClose,
  payment,
  order,
  onSuccess,
}) => {
  const { toast } = useToast();
  const { currentShift, refreshShift } = useShift();
  const { invalidateOrders } = usePodsCare();

  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundMethod, setRefundMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [refundReason, setRefundReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Compute maximum allowed refund amount based on target
  const targetAmount = payment ? Number(payment.amount) : Number(order?.total_price ?? order?.price ?? 0);
  const targetCode = payment?.paymentCode || (order ? (order.order_code || `PC26-${order.id}`) : '');
  const customerName = payment?.customerName || order?.customerName || order?.name || 'Khách hàng';

  useEffect(() => {
    if (isOpen) {
      setRefundAmount(targetAmount > 0 ? targetAmount : 0);
      setRefundMethod('cash');
      setRefundReason(REASON_PRESETS[0]);
      setErrorMsg(null);
      setIsSubmitting(false);
      refreshShift().catch(() => {});
    }
  }, [isOpen, targetAmount, refreshShift]);

  const moneyFormatted = (n: number) =>
    new Intl.NumberFormat('vi-VN').format(n) + ' ₫';

  const availableCashInDrawer = currentShift ? Number(currentShift.expected_cash || 0) : 0;
  const isCashInsufficient = refundMethod === 'cash' && currentShift && refundAmount > availableCashInDrawer;
  const isNoActiveShiftForCash = refundMethod === 'cash' && !currentShift;
  const isBlocked = isCashInsufficient || isNoActiveShiftForCash || refundAmount <= 0 || !refundReason.trim();

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting || isBlocked) return;

    if (refundAmount <= 0) {
      setErrorMsg('Vui lòng nhập số tiền hoàn lại lớn hơn 0 ₫.');
      return;
    }

    if (refundAmount > targetAmount && targetAmount > 0) {
      setErrorMsg(`Số tiền hoàn (${moneyFormatted(refundAmount)}) không được vượt quá số tiền ban đầu (${moneyFormatted(targetAmount)}).`);
      return;
    }

    if (!refundReason.trim()) {
      setErrorMsg('Vui lòng nhập lý do hoàn tiền.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const payload = {
        refund_amount: Number(refundAmount),
        refund_method: refundMethod,
        refund_reason: refundReason.trim(),
      };

      if (payment) {
        await paymentService.refundPayment(payment.id, payload);
      } else if (order) {
        await repairService.refundOrder(order.id, payload);
      } else {
        throw new Error('Không xác định được đối tượng hoàn tiền');
      }

      toast(`Hoàn tiền thành công ${moneyFormatted(refundAmount)} cho ${targetCode}!`, 'success');
      await refreshShift();
      if (invalidateOrders) {
        await invalidateOrders();
      }
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: any) {
      console.error('Refund execution error:', err);
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Không thể hoàn tiền. Vui lòng kiểm tra lại số dư ca hoặc quyền hạn.';
      setErrorMsg(msg);
      toast(`Lỗi hoàn tiền: ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      eyebrow="TÀI CHÍNH & HOÀN TIỀN"
      title={`Xác nhận hoàn tiền · ${targetCode}`}
      subtitle={`Khách hàng: ${customerName} · Số tiền ban đầu: ${moneyFormatted(targetAmount)}`}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2.5 w-full">
          <Button variant="secondary" size="md" onClick={onClose} disabled={isSubmitting}>
            Hủy bỏ
          </Button>
          <Button
            variant="danger"
            size="md"
            icon="payments"
            disabled={isBlocked || isSubmitting}
            onClick={handleSubmit}
            className="font-bold bg-[#d9383a] hover:bg-[#b82e30] text-white"
          >
            {isSubmitting ? 'Đang xử lý...' : `Xác nhận hoàn ${moneyFormatted(refundAmount)}`}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Hộp tóm tắt đối tượng hoàn tiền */}
        <div className="bg-[#fafbfb] border border-[#e5ece8] rounded-[10px] p-3 text-xs flex justify-between items-center">
          <div>
            <span className="text-[#72837a] block">Đối tượng hoàn tiền:</span>
            <b className="font-mono text-sm text-[#1c302b]">{targetCode}</b>
            <span className="text-[#84948c] block mt-0.5">{customerName}</span>
          </div>
          <div className="text-right">
            <span className="text-[#72837a] block">Số tiền gốc:</span>
            <b className="font-bold text-base text-[#176b58]">{moneyFormatted(targetAmount)}</b>
          </div>
        </div>

        {/* Số tiền hoàn lại */}
        <div>
          <CurrencyInput
            label="Số tiền hoàn trả cho khách"
            value={refundAmount}
            onChangeValue={(val) => setRefundAmount(val)}
            placeholder="0"
          />
          {targetAmount > 0 && (
            <span className="text-[11px] text-[#718279] block mt-1">
              Tối đa {moneyFormatted(targetAmount)}. Có thể hoàn một phần hoặc toàn phần.
            </span>
          )}
        </div>

        {/* Phương thức hoàn */}
        <div>
          <label className="text-xs font-bold text-[#4c5d54] block mb-1.5">
            Phương thức chi hoàn tiền:
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label
              className={`flex items-center gap-2 p-3 rounded-[8px] border text-xs cursor-pointer transition-all ${
                refundMethod === 'cash'
                  ? 'bg-[#f0f7f3] border-[#176b58] text-[#176b58] font-bold ring-1 ring-[#176b58]'
                  : 'bg-white border-[#d2dcd6] text-[#2e3e36] hover:bg-[#fafbfa]'
              }`}
            >
              <input
                type="radio"
                name="refund_method"
                value="cash"
                checked={refundMethod === 'cash'}
                onChange={() => setRefundMethod('cash')}
                className="accent-[#176b58]"
              />
              <div className="truncate">
                <span className="block font-semibold">Tiền mặt</span>
                <span className="text-[10px] text-[#718279] block">Xuất từ két ca trực</span>
              </div>
            </label>

            <label
              className={`flex items-center gap-2 p-3 rounded-[8px] border text-xs cursor-pointer transition-all ${
                refundMethod === 'bank_transfer'
                  ? 'bg-[#f0f7f3] border-[#176b58] text-[#176b58] font-bold ring-1 ring-[#176b58]'
                  : 'bg-white border-[#d2dcd6] text-[#2e3e36] hover:bg-[#fafbfa]'
              }`}
            >
              <input
                type="radio"
                name="refund_method"
                value="bank_transfer"
                checked={refundMethod === 'bank_transfer'}
                onChange={() => setRefundMethod('bank_transfer')}
                className="accent-[#176b58]"
              />
              <div className="truncate">
                <span className="block font-semibold">Chuyển khoản</span>
                <span className="text-[10px] text-[#718279] block">SePay / Ngân hàng</span>
              </div>
            </label>
          </div>
        </div>

        {/* Thông tin ca trực và số dư két tiền mặt */}
        <div className="bg-[#f5f9f7] border border-[#d6e8dd] rounded-[10px] p-3 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[#556960] font-medium flex items-center gap-1.5">
              <Icon name="clock" size={13} className="text-[#176b58]" />
              <span>Trạng thái ca trực:</span>
            </span>
            <span className="font-bold text-[#1c302b]">
              {currentShift ? `Ca đang mở (${currentShift.shift_code})` : 'Chưa mở ca trực'}
            </span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-[#e2efe7]">
            <span className="text-[#556960] font-medium">Số dư két tiền mặt hiện tại:</span>
            <b
              className={`font-mono font-bold text-sm ${
                currentShift && availableCashInDrawer >= refundAmount
                  ? 'text-[#176b58]'
                  : 'text-[#d9383a]'
              }`}
            >
              {currentShift ? moneyFormatted(availableCashInDrawer) : '0 ₫'}
            </b>
          </div>
        </div>

        {/* Cảnh báo két tiền nếu không đủ tiền mặt */}
        {isNoActiveShiftForCash && (
          <div className="p-3 bg-[#fdf2f2] border border-[#fecaca] rounded-[8px] text-xs text-[#b91c1c] flex items-start gap-2">
            <Icon name="alert" size={15} className="flex-none mt-0.5 text-[#b91c1c]" />
            <div>
              <b className="block">Chưa mở ca làm việc!</b>
              <span>
                Không thể hoàn tiền mặt khi ca trực chưa được mở. Vui lòng mở ca làm việc hoặc chuyển sang hình thức <b>Chuyển khoản</b>.
              </span>
            </div>
          </div>
        )}

        {isCashInsufficient && (
          <div className="p-3 bg-[#fdf2f2] border border-[#fecaca] rounded-[8px] text-xs text-[#b91c1c] flex items-start gap-2">
            <Icon name="alert" size={15} className="flex-none mt-0.5 text-[#b91c1c]" />
            <div>
              <b className="block">Số dư két không đủ để hoàn tiền mặt!</b>
              <span>
                Số dư trong két ({moneyFormatted(availableCashInDrawer)}) nhỏ hơn số tiền cần hoàn ({moneyFormatted(refundAmount)}).
                Vui lòng nạp thêm tiền vào ca trực hoặc chọn phương thức <b>Chuyển khoản</b>.
              </span>
            </div>
          </div>
        )}

        {/* Lý do hoàn tiền */}
        <div>
          <label className="text-xs font-bold text-[#4c5d54] block mb-1">
            Lý do hoàn tiền (Bắt buộc):
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {REASON_PRESETS.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setRefundReason(p)}
                className={`text-[11px] px-2 py-1 rounded-[6px] border transition-colors ${
                  refundReason === p
                    ? 'bg-[#176b58] text-white border-[#176b58]'
                    : 'bg-white text-[#52635a] border-[#d2dcd6] hover:bg-[#f0f4f2]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <Textarea
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
            rows={2}
            placeholder="Nhập lý do chi tiết để lưu vết kiểm toán..."
          />
        </div>

        {errorMsg && (
          <div className="p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-[8px] text-xs text-[#b91c1c] font-medium">
            {errorMsg}
          </div>
        )}

        <div className="p-2.5 bg-[#fffbeb] border border-[#fef3c7] rounded-[8px] text-[11px] text-[#92400e] leading-relaxed">
          <b>Lưu ý chính sách:</b> Khi hoàn tiền, hệ thống sẽ tự động hoàn trả linh kiện vào kho (nếu có), thu hồi sổ bảo hành sang trạng thái <b>Đã thu hồi (Revoked)</b>, trừ doanh số khách hàng và ghi vết chi tiết vào Nhật ký kiểm toán.
        </div>
      </form>
    </Modal>
  );
};
