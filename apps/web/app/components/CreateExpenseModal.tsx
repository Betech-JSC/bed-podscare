'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button, CurrencyInput, Input, Textarea, Select, useToast } from '@podscare/ui';
import { cashbookService } from '@podscare/api-client';
import type { CashTransaction, ExpenseCategoryKey } from '@podscare/types';
import { usePodsCare } from '../providers';
import { useShift } from '../providers/ShiftProvider';

export interface CreateExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (transaction: CashTransaction) => void;
}

const EXPENSE_CATEGORIES: { value: ExpenseCategoryKey; label: string }[] = [
  { value: 'purchasing_parts', label: 'Mua linh kiện ngoài' },
  { value: 'shipping_cod', label: 'Cước giao nhận COD' },
  { value: 'store_operations', label: 'Vận hành cửa hàng (Điện, nước, VPP)' },
  { value: 'refund', label: 'Hoàn tiền cho khách' },
  { value: 'other_expense', label: 'Chi phí khác' },
];

export const CreateExpenseModal: React.FC<CreateExpenseModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { toast } = useToast();
  const { branch, branchId, currentUser } = usePodsCare();
  const { refreshShift, currentShift } = useShift();

  const [amount, setAmount] = useState<number>(0);
  const [category, setCategory] = useState<ExpenseCategoryKey>('purchasing_parts');
  const [recipientPayer, setRecipientPayer] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAmount(0);
      setCategory('purchasing_parts');
      setRecipientPayer('');
      setPaymentMethod('cash');
      setNotes('');
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const effectiveBranchId =
    branchId && branchId !== 'all' ? branchId : currentUser?.branch_id;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    if (!effectiveBranchId) {
      setErrorMsg('Vui lòng chọn chi nhánh làm việc cụ thể trước khi lập phiếu chi.');
      return;
    }

    if (!amount || amount <= 0) {
      setErrorMsg('Vui lòng nhập số tiền chi lớn hơn 0 ₫.');
      return;
    }

    if (paymentMethod === 'cash') {
      if (!currentShift) {
        setErrorMsg('Chi nhánh chưa mở ca trực. Không thể xuất tiền mặt từ két.');
        return;
      }
      const availableCash = Number(currentShift.expected_cash || 0);
      if (amount > availableCash) {
        setErrorMsg(
          `Số dư két tiền mặt hiện tại không đủ (${new Intl.NumberFormat('vi-VN').format(availableCash)} ₫ < ${new Intl.NumberFormat('vi-VN').format(amount)} ₫).`
        );
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await cashbookService.createExpense({
        branch_id: effectiveBranchId,
        amount: Number(amount),
        category,
        recipient_payer: recipientPayer.trim() || undefined,
        payment_method: paymentMethod,
        notes: notes.trim() || undefined,
      });

      if (res.success && res.data) {
        toast({
          type: 'success',
          message: `Lập phiếu chi thành công: Phiếu ${res.data.transaction_code} đã được ghi vào sổ quỹ.`,
        });
        await refreshShift();
        onSuccess?.(res.data);
        onClose();
      } else {
        setErrorMsg(res.message || 'Không thể tạo phiếu chi. Vui lòng kiểm tra lại.');
      }
    } catch (err: any) {
      const serverMessage =
        err?.data?.message || err?.message || 'Có lỗi xảy ra khi tạo phiếu chi.';
      setErrorMsg(serverMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="SỔ QUỸ CHI NHÁNH"
      title="Lập phiếu chi tiền mặt"
      subtitle="Ghi nhận chi phí phát sinh ngoài két tiền mặt (mua linh kiện, vận hành, COD...)"
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Hủy
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => handleSubmit()}
            loading={isSubmitting}
            disabled={isSubmitting}
            className="!bg-[#176b51] hover:!bg-[#10583f] text-white"
          >
            Xác nhận tạo phiếu chi
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-sm font-sans">
        {errorMsg && (
          <div className="p-3 bg-[#fbefed] border border-[#f5c7c2] rounded-[8px] text-[#bc5b52] text-xs leading-relaxed">
            {errorMsg}
          </div>
        )}

        {/* Ngữ cảnh chi nhánh và ca làm việc */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-[#f6f8f6] border border-[#e9eeeb] rounded-[8px]">
          <div>
            <div className="text-[10px] font-bold text-[#81908a] uppercase tracking-[0.8px]">
              Chi nhánh
            </div>
            <div className="font-semibold text-xs text-[#17231f] mt-0.5 truncate">
              {branch || 'Chi nhánh mặc định'}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-[#81908a] uppercase tracking-[0.8px]">
              Ca làm việc
            </div>
            <div className="font-semibold text-xs text-[#176b51] mt-0.5 truncate font-mono">
              {currentShift ? currentShift.shift_code : 'Chưa mở ca (cần mở ca để xuất tiền mặt)'}
            </div>
          </div>
        </div>

        {/* Số tiền chi */}
        <div>
          <label className="block text-xs font-semibold text-[#17231f] mb-1.5">
            Số tiền chi <span className="text-[#bc5b52]">*</span>
          </label>
          <CurrencyInput
            value={amount}
            onChangeValue={(val) => {
              setAmount(val);
              if (errorMsg) setErrorMsg(null);
            }}
            placeholder="0"
            suffix="₫"
            className="w-full text-base font-bold text-[#17231f]"
          />
        </div>

        {/* Danh mục chi */}
        <div>
          <label className="block text-xs font-semibold text-[#17231f] mb-1.5">
            Danh mục chi phí <span className="text-[#bc5b52]">*</span>
          </label>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategoryKey)}
            options={EXPENSE_CATEGORIES}
            className="w-full text-sm"
          />
        </div>

        {/* Người nhận tiền & Phương thức */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#17231f] mb-1.5">
              Người nhận tiền
            </label>
            <Input
              value={recipientPayer}
              onChange={(e) => setRecipientPayer(e.target.value)}
              placeholder="VD: Anh Tuấn (Shipper), Chị Mai..."
              className="w-full text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#17231f] mb-1.5">
              Phương thức chi
            </label>
            <Select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              options={[
                { value: 'cash', label: 'Tiền mặt tại két' },
                { value: 'bank_transfer', label: 'Chuyển khoản chi nhánh' },
              ]}
              className="w-full text-sm"
            />
          </div>
        </div>

        {/* Ghi chú nội dung chi */}
        <div>
          <label className="block text-xs font-semibold text-[#17231f] mb-1.5">
            Nội dung / Ghi chú chi phí
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Mô tả cụ thể mục đích chi (VD: Mua 2 cáp sạc thử máy, nạp 50k nước uống...)"
            rows={2}
            className="w-full text-xs"
          />
        </div>
      </form>
    </Modal>
  );
};
