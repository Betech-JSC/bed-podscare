'use client';

import React from 'react';
import { useShift } from '../providers/ShiftProvider';
import { OpenShiftModal } from './OpenShiftModal';
import { CloseShiftModal } from './CloseShiftModal';
import { CreateExpenseModal } from './CreateExpenseModal';
import { ShiftReceiptPrintModal } from './print/ShiftReceiptPrint';

export interface ShiftControlWidgetProps {
  className?: string;
  compact?: boolean;
}

export const ShiftControlWidget: React.FC<ShiftControlWidgetProps> = ({
  className = '',
  compact = false,
}) => {
  const {
    currentShift,
    isLoading,
    openShiftModalOpen,
    setOpenShiftModalOpen,
    closeShiftModalOpen,
    setCloseShiftModalOpen,
    createExpenseModalOpen,
    setCreateExpenseModalOpen,
    printModalOpen,
    printShiftId,
    closePrintModal,
  } = useShift();

  const moneyFormatted = (n?: number | null) => {
    if (n === undefined || n === null) return '0 ₫';
    return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫';
  };

  const expectedCash = currentShift
    ? Number(currentShift.expected_cash || 0)
    : 0;

  return (
    <>
      <div className={`inline-flex items-center gap-2 ${className}`}>
        {isLoading ? (
          <div className="h-8 px-3 rounded-full bg-[#f4f7f5] border border-[#e5ece8] flex items-center gap-2 text-xs text-[#81908a]">
            <span className="w-2 h-2 rounded-full bg-[#81908a]/50 animate-pulse" />
            <span>Đang tải ca...</span>
          </div>
        ) : !currentShift ? (
          <button
            type="button"
            onClick={() => setOpenShiftModalOpen(true)}
            className="h-8 px-3 rounded-full bg-[#eaf4ef] hover:bg-[#d6ecdf] text-[#176b51] border border-[#cde3d6] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Nhấn để bắt đầu ca trực mới tại chi nhánh"
          >
            <span className="w-2 h-2 rounded-full bg-[#b77a21]" />
            <span>Mở ca làm việc</span>
          </button>
        ) : (
          <div className="h-8 pl-3 pr-1.5 rounded-full bg-[#eaf4ef] border border-[#cde3d6] text-[#176b51] text-xs flex items-center gap-2 font-medium">
            <span className="w-2 h-2 rounded-full bg-[#28805e] animate-pulse" />
            <div className="flex items-center gap-1.5">
              <span className="font-bold font-mono tracking-tight">
                {currentShift.shift_code}
              </span>
              {!compact && (
                <>
                  <span className="text-[#a4c5b5] font-light">|</span>
                  <span className="font-semibold font-mono text-[#17231f]">
                    {moneyFormatted(expectedCash)}
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setCloseShiftModalOpen(true)}
              className="ml-1 px-2.5 py-1 rounded-full bg-white hover:bg-[#f6f8f6] text-[#bc5b52] hover:text-[#9e463e] border border-[#e5ece8] text-[11px] font-bold transition-all cursor-pointer shadow-xs"
              title="Chốt két tiền mặt và bàn giao ca"
            >
              Chốt ca
            </button>
          </div>
        )}
      </div>

      {/* Global Modals for Shift Operations */}
      <OpenShiftModal
        isOpen={openShiftModalOpen}
        onClose={() => setOpenShiftModalOpen(false)}
        suggestedOpeningCash={0}
      />

      <CloseShiftModal
        isOpen={closeShiftModalOpen}
        onClose={() => setCloseShiftModalOpen(false)}
        shift={currentShift}
      />

      <CreateExpenseModal
        isOpen={createExpenseModalOpen}
        onClose={() => setCreateExpenseModalOpen(false)}
      />

      <ShiftReceiptPrintModal
        isOpen={printModalOpen}
        onClose={closePrintModal}
        shiftId={printShiftId}
      />
    </>
  );
};
