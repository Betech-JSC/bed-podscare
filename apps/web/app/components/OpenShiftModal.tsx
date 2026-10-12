'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button, CurrencyInput, Textarea, useToast } from '@podscare/ui';
import { shiftService } from '@podscare/api-client';
import type { WorkShift } from '@podscare/types';
import { usePodsCare } from '../providers';
import { useShift } from '../providers/ShiftProvider';

export interface OpenShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (shift: WorkShift) => void;
  suggestedOpeningCash?: number;
}

export const OpenShiftModal: React.FC<OpenShiftModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  suggestedOpeningCash = 0,
}) => {
  const { toast } = useToast();
  const { branch, branchId, currentUser } = usePodsCare();
  const { refreshShift } = useShift();

  const [openingCash, setOpeningCash] = useState<number>(suggestedOpeningCash);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setOpeningCash(suggestedOpeningCash || 0);
      setNotes('');
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, suggestedOpeningCash]);

  const effectiveBranchId =
    branchId && branchId !== 'all' ? branchId : currentUser?.branch_id;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    if (!effectiveBranchId) {
      setErrorMsg('Vui lòng chọn chi nhánh làm việc cụ thể trước khi mở ca.');
      return;
    }

    if (openingCash < 0) {
      setErrorMsg('Số tiền mặt đầu ca không được là số âm.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await shiftService.openShift({
        branch_id: effectiveBranchId,
        opening_cash: Number(openingCash) || 0,
        notes: notes.trim() || undefined,
      });

      if (res.success && res.data) {
        toast({
          type: 'success',
          message: `Mở ca thành công: Ca trực ${res.data.shift_code} đã được kích hoạt.`,
        });
        await refreshShift();
        onSuccess?.(res.data);
        onClose();
      } else {
        setErrorMsg(res.message || 'Không thể mở ca làm việc. Vui lòng thử lại.');
      }
    } catch (err: any) {
      const serverMessage =
        err?.data?.message || err?.message || 'Có lỗi xảy ra khi gửi yêu cầu mở ca.';
      setErrorMsg(serverMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="QUẢN LÝ CA TRỰC"
      title="Mở ca làm việc mới"
      subtitle="Bắt đầu ca trực tại chi nhánh và khai báo số tiền mặt ban đầu trong két"
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
            Xác nhận mở ca
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

        {/* Thông tin ngữ cảnh chi nhánh & thu ngân */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-[#f6f8f6] border border-[#e9eeeb] rounded-[8px]">
          <div>
            <div className="text-[11px] font-bold text-[#81908a] uppercase tracking-[0.8px]">
              Chi nhánh
            </div>
            <div className="font-semibold text-[#17231f] mt-0.5 truncate">
              {branch || 'Chi nhánh mặc định'}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-[#81908a] uppercase tracking-[0.8px]">
              Nhân sự mở ca
            </div>
            <div className="font-semibold text-[#17231f] mt-0.5 truncate">
              {currentUser?.name || 'Nhân viên thu ngân'}
            </div>
          </div>
        </div>

        {/* Ô nhập tiền mặt đầu ca */}
        <div>
          <label className="block text-xs font-semibold text-[#17231f] mb-1.5">
            Số tiền mặt đầu ca trong két <span className="text-[#bc5b52]">*</span>
          </label>
          <CurrencyInput
            value={openingCash}
            onChangeValue={(numericVal) => {
              setOpeningCash(numericVal);
              if (errorMsg) setErrorMsg(null);
            }}
            placeholder="0"
            suffix="₫"
            className="w-full text-base font-semibold text-[#17231f]"
          />
          <p className="text-[11px] text-[#81908a] mt-1.5">
            Số tiền mặt bàn giao từ ca trước hoặc tiền quỹ float bổ sung sẵn có trong ngăn kéo.
          </p>
        </div>

        {/* Ghi chú đầu ca */}
        <div>
          <label className="block text-xs font-semibold text-[#17231f] mb-1.5">
            Ghi chú đầu ca (tùy chọn)
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Nhập ghi chú tình trạng két hoặc bàn giao nếu có..."
            rows={3}
            className="w-full text-xs"
          />
        </div>
      </form>
    </Modal>
  );
};
