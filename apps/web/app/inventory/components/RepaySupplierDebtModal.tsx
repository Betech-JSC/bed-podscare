'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button, Icon, useToast } from '@podscare/ui';
import { supplierService, type Supplier } from '@podscare/api-client';

export interface RepaySupplierDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  supplier: Supplier | null;
  drawerBalance?: { current_cash_balance: number; has_active_shift: boolean } | null;
  onCheckDrawer?: () => void;
}

const formatMoney = (val: number | string | undefined): string => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
};

export const RepaySupplierDebtModal: React.FC<RepaySupplierDebtModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  supplier,
  drawerBalance,
  onCheckDrawer,
}) => {
  const { toast } = useToast();
  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [repayNotes, setRepayNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && supplier) {
      setRepayAmount(String(Number(supplier.debt_balance) || ''));
      setRepayMethod('cash');
      setRepayNotes('');
      onCheckDrawer?.();
    }
  }, [isOpen, supplier, onCheckDrawer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplier) return;

    const amount = Number(repayAmount);
    if (!amount || amount <= 0) {
      toast('Vui lòng nhập số tiền chi trả hợp lệ lớn hơn 0', 'error');
      return;
    }

    const currentDebt = Number(supplier.debt_balance) || 0;
    if (amount > currentDebt) {
      toast(`Số tiền trả không thể vượt quá số nợ hiện tại (${formatMoney(currentDebt)})`, 'error');
      return;
    }

    if (repayMethod === 'cash') {
      if (!drawerBalance?.has_active_shift) {
        toast('Chi nhánh chưa mở ca trực! Không thể chi tiền mặt từ két.', 'error');
        return;
      }
      if (drawerBalance.current_cash_balance < amount) {
        toast(
          `Số dư két ca trực không đủ (${formatMoney(drawerBalance.current_cash_balance)} < ${formatMoney(amount)})`,
          'error'
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await supplierService.repayDebt(supplier.id, {
        amount,
        payment_method: repayMethod,
        notes: repayNotes.trim() || undefined,
      });

      toast(`Đã thanh toán ${formatMoney(amount)} cho ${supplier.name}!`, 'success');
      onClose();
      onSuccess?.();
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Lỗi xử lý thanh toán', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!supplier) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Chi trả nợ: ${supplier.name}`}
      eyebrow="ACCOUNTS PAYABLE DISBURSEMENT"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3.5 rounded-[10px] bg-[#fbfcfb] border border-[#e2e8e5] flex items-center justify-between">
          <div>
            <span className="text-xs text-[#6e7f77] block font-medium">Số nợ hiện tại:</span>
            <span className="text-lg font-bold text-[#bc5b52]">
              {formatMoney(supplier.debt_balance)}
            </span>
          </div>
          {drawerBalance?.has_active_shift && (
            <div className="text-right">
              <span className="text-xs text-[#6e7f77] block font-medium">Két ca trực hiện tại:</span>
              <span className="text-sm font-bold text-[#176b58]">
                {formatMoney(drawerBalance.current_cash_balance)}
              </span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-[#516158] uppercase mb-1">
            Số tiền chi trả (VND) <span className="text-[#bc5b52]">*</span>
          </label>
          <input
            type="number"
            required
            min={1000}
            max={Number(supplier.debt_balance)}
            value={repayAmount}
            onChange={(e) => setRepayAmount(e.target.value)}
            placeholder="VD: 1000000"
            className="w-full px-3.5 py-2.5 rounded-[8px] border border-[#cde2d6] text-base font-semibold text-[#1c302b] focus:outline-none focus:ring-2 focus:ring-[#176b58]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-[#516158] uppercase mb-1">
            Phương thức chi trả <span className="text-[#bc5b52]">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRepayMethod('cash')}
              className={`p-3 rounded-[8px] border text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                repayMethod === 'cash'
                  ? 'border-[#176b58] bg-[#eaf4ef] text-[#176b58]'
                  : 'border-[#e2e8e5] text-[#516158] hover:bg-[#f9faf9]'
              }`}
            >
              <Icon name="payments" size={18} />
              <span>Tiền mặt (Trừ két)</span>
            </button>
            <button
              type="button"
              onClick={() => setRepayMethod('bank_transfer')}
              className={`p-3 rounded-[8px] border text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                repayMethod === 'bank_transfer'
                  ? 'border-[#176b58] bg-[#eaf4ef] text-[#176b58]'
                  : 'border-[#e2e8e5] text-[#516158] hover:bg-[#f9faf9]'
              }`}
            >
              <Icon name="spark" size={18} />
              <span>Chuyển khoản NH</span>
            </button>
          </div>
        </div>

        {repayMethod === 'cash' && !drawerBalance?.has_active_shift && (
          <div className="p-3 rounded-[8px] bg-[#fbefed] border border-[#f5c7c2] text-xs text-[#bc5b52] flex items-center gap-2">
            <Icon name="alert" size={16} />
            <span>Chi nhánh chưa mở ca trực! Bạn cần mở ca trực để xuất quỹ tiền mặt.</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-[#516158] uppercase mb-1">
            Ghi chú chi trả
          </label>
          <input
            type="text"
            value={repayNotes}
            onChange={(e) => setRepayNotes(e.target.value)}
            placeholder="VD: Trả dứt điểm tiền màn hình đợt tháng 10"
            className="w-full px-3.5 py-2 rounded-[8px] border border-[#cde2d6] text-sm focus:outline-none focus:ring-2 focus:ring-[#176b58]"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e2e8e5]">
          <Button
            variant="secondary"
            type="button"
            onClick={onClose}
          >
            Hủy bỏ
          </Button>
          <Button variant="primary" type="submit" loading={isSubmitting}>
            Xác nhận chi trả
          </Button>
        </div>
      </form>
    </Modal>
  );
};
