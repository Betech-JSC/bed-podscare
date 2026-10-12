'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Button, CurrencyInput, Textarea, StatusTag, useToast } from '@podscare/ui';
import { shiftService } from '@podscare/api-client';
import type { WorkShift } from '@podscare/types';
import { useShift } from '../providers/ShiftProvider';

export interface CloseShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  shift: WorkShift | null;
  onSuccess?: (closedShift: WorkShift) => void;
}

export const CloseShiftModal: React.FC<CloseShiftModalProps> = ({
  isOpen,
  onClose,
  shift,
  onSuccess,
}) => {
  const { toast } = useToast();
  const { refreshShift, openPrintModal } = useShift();

  const [actualCash, setActualCash] = useState<number>(0);
  const [carriedOverCash, setCarriedOverCash] = useState<number>(0);
  const [reconciliationNotes, setReconciliationNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openingCash = Number(shift?.opening_cash || 0);
  const systemCashIn = Number(shift?.system_cash_in || 0);
  const systemCashOut = Number(shift?.system_cash_out || 0);
  const expectedCash = Number(shift?.expected_cash || (openingCash + systemCashIn - systemCashOut));

  // Initialize values when modal opens
  useEffect(() => {
    if (isOpen && shift) {
      setActualCash(expectedCash);
      setCarriedOverCash(0);
      setReconciliationNotes('');
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, shift, expectedCash]);

  // Realtime discrepancy calculation
  const difference = useMemo(() => {
    return (Number(actualCash) || 0) - expectedCash;
  }, [actualCash, expectedCash]);

  const isMismatched = Math.abs(difference) > 0.001;

  // Deposited cash to safe / owner
  const depositedCash = useMemo(() => {
    const total = Number(actualCash) || 0;
    const carry = Number(carriedOverCash) || 0;
    return Math.max(0, total - carry);
  }, [actualCash, carriedOverCash]);

  const moneyFormatted = (val: number) => {
    return new Intl.NumberFormat('vi-VN').format(Math.round(val)) + ' ₫';
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting || !shift) return;

    if (actualCash < 0) {
      setErrorMsg('Số tiền mặt thực tế kiểm đếm không được là số âm.');
      return;
    }

    if (carriedOverCash < 0) {
      setErrorMsg('Số tiền để lại két cho ca sau không được là số âm.');
      return;
    }

    if (carriedOverCash > actualCash) {
      setErrorMsg('Số tiền để lại két không thể lớn hơn tổng tiền mặt thực tế.');
      return;
    }

    if (isMismatched && !reconciliationNotes.trim()) {
      setErrorMsg('Két tiền mặt bị chênh lệch. Vui lòng nhập lý do giải trình bắt buộc.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await shiftService.closeShift(shift.id, {
        actual_cash: Number(actualCash) || 0,
        carried_over_cash: Number(carriedOverCash) || 0,
        notes: reconciliationNotes.trim() || undefined,
      });

      if (res.success && res.data) {
        toast({
          type: 'success',
          message: `Đóng ca thành công: Đã hoàn tất đối soát két tiền mặt cho ca ${shift.shift_code}.`,
        });

        const closedShift = res.data;
        await refreshShift();
        onSuccess?.(closedShift);
        onClose();

        // Mở modal in biên bản chốt ca
        openPrintModal(closedShift.id);
      } else {
        setErrorMsg(res.message || 'Không thể đóng ca làm việc. Vui lòng kiểm tra lại.');
      }
    } catch (err: any) {
      const serverMessage =
        err?.data?.message || err?.message || 'Có lỗi xảy ra khi đóng ca làm việc.';
      setErrorMsg(serverMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!shift) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="ĐỐI SOÁT & BÀN GIAO"
      title="Chốt ca làm việc"
      subtitle={`Kiểm đếm tiền két và bàn giao ca ${shift.shift_code}`}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Hủy
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={() => handleSubmit()}
              loading={isSubmitting}
              disabled={isSubmitting}
              className="!bg-[#176b51] hover:!bg-[#10583f] text-white"
            >
              Xác nhận đóng ca
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-sm font-sans">
        {errorMsg && (
          <div className="p-3 bg-[#fbefed] border border-[#f5c7c2] rounded-[8px] text-[#bc5b52] text-xs leading-relaxed">
            {errorMsg}
          </div>
        )}

        {/* Thông tin số liệu hệ thống ghi nhận trong ca */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-[#f6f8f6] border border-[#e9eeeb] rounded-[8px]">
          <div>
            <div className="text-[10px] font-bold text-[#81908a] uppercase tracking-[0.8px]">
              Tiền đầu ca
            </div>
            <div className="font-semibold text-xs text-[#17231f] mt-1 font-mono">
              {moneyFormatted(openingCash)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-[#81908a] uppercase tracking-[0.8px]">
              Thu tiền mặt
            </div>
            <div className="font-semibold text-xs text-[#28805e] mt-1 font-mono">
              +{moneyFormatted(systemCashIn)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-[#81908a] uppercase tracking-[0.8px]">
              Chi tiền mặt
            </div>
            <div className="font-semibold text-xs text-[#bc5b52] mt-1 font-mono">
              -{moneyFormatted(systemCashOut)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-[#176b51] uppercase tracking-[0.8px]">
              Két lý thuyết
            </div>
            <div className="font-bold text-sm text-[#176b51] mt-0.5 font-mono">
              {moneyFormatted(expectedCash)}
            </div>
          </div>
        </div>

        {/* DUY NHẤT 1 Ô NHẬP TIỀN THỰC TẾ THEO ĐÚNG CHỈ ĐẠO CỐT LÕI */}
        <div className="p-4 bg-white border-2 border-[#176b51]/30 rounded-[10px] space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-[#17231f] uppercase tracking-[0.5px]">
              Tiền mặt thực tế kiểm đếm trong két <span className="text-[#bc5b52]">*</span>
            </label>
            {/* Nhãn trạng thái đối soát */}
            <div>
              {!isMismatched ? (
                <StatusTag type="ready" label="Khớp két 0 ₫" />
              ) : difference > 0 ? (
                <StatusTag type="wait" label={`Lệch thừa: +${moneyFormatted(difference)}`} />
              ) : (
                <StatusTag type="danger" label={`Lệch thiếu: ${moneyFormatted(difference)}`} />
              )}
            </div>
          </div>

          <CurrencyInput
            value={actualCash}
            onChangeValue={(numericVal) => {
              setActualCash(numericVal);
              if (errorMsg) setErrorMsg(null);
            }}
            placeholder="0"
            suffix="₫"
            className="w-full text-lg font-bold text-[#17231f] h-12"
          />

          <div className="flex items-center justify-between text-[11px] text-[#81908a] pt-1">
            <span>Nhập trực tiếp tổng số tiền mặt sau khi đếm xong ngăn kéo két tiền.</span>
            <button
              type="button"
              onClick={() => setActualCash(expectedCash)}
              className="text-[#176b51] hover:underline font-medium"
            >
              Gán bằng két lý thuyết ({moneyFormatted(expectedCash)})
            </button>
          </div>
        </div>

        {/* Ô giải trình chênh lệch két (Bắt buộc khi có chênh lệch) */}
        {isMismatched && (
          <div className="p-3 bg-[#faf7f2] border border-[#e8dfcf] rounded-[8px] space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-[#8c6729]">
                Lý do giải trình chênh lệch két <span className="text-[#bc5b52]">*</span>
              </label>
              <span className="text-[10px] font-bold text-[#bc5b52] uppercase">
                Bắt buộc điền
              </span>
            </div>
            <Textarea
              value={reconciliationNotes}
              onChange={(e) => {
                setReconciliationNotes(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="Giải trình cụ thể nguyên nhân thừa hoặc thiếu tiền két (VD: Khách trả thừa tiền bo, chi phí gấp chưa kịp lưu phiếu...)"
              rows={2}
              className="w-full text-xs bg-white"
            />
          </div>
        )}

        {/* Phân bổ tiền mặt chốt ca */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-xs font-semibold text-[#17231f] mb-1.5">
              Tiền để lại két cho ca sau (Float)
            </label>
            <CurrencyInput
              value={carriedOverCash}
              onChangeValue={(val) => {
                setCarriedOverCash(val);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="0"
              suffix="₫"
              className="w-full text-sm"
            />
            <span className="text-[10px] text-[#81908a] mt-1 block">
              Số tiền để lại ngăn kéo làm tiền thối cho ca tiếp theo.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#17231f] mb-1.5">
              Tiền nộp két an toàn / Bàn giao chủ
            </label>
            <div className="h-10 px-3 bg-[#f6f8f6] border border-[#e9eeeb] rounded-[8px] flex items-center justify-between text-sm font-bold text-[#176b51] font-mono">
              <span>{moneyFormatted(depositedCash)}</span>
              <span className="text-[10px] text-[#81908a] font-sans font-normal uppercase">
                Tự động cân đối
              </span>
            </div>
            <span className="text-[10px] text-[#81908a] mt-1 block">
              = Tổng tiền thực tế - Tiền để lại két
            </span>
          </div>
        </div>
      </form>
    </Modal>
  );
};
