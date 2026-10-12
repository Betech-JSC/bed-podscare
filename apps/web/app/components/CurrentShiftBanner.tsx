'use client';

import React from 'react';
import { Button, StatusTag } from '@podscare/ui';
import { useShift } from '../providers/ShiftProvider';
import { usePodsCare } from '../providers';

export interface CurrentShiftBannerProps {
  className?: string;
}

export const CurrentShiftBanner: React.FC<CurrentShiftBannerProps> = ({
  className = '',
}) => {
  const { branch } = usePodsCare();
  const {
    currentShift,
    isLoading,
    setOpenShiftModalOpen,
    setCloseShiftModalOpen,
    setCreateExpenseModalOpen,
  } = useShift();

  const moneyFormatted = (n?: number | null) => {
    if (n === undefined || n === null) return '0 ₫';
    return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫';
  };

  const openedAtFormatted = currentShift?.opened_at
    ? new Intl.DateTimeFormat('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(currentShift.opened_at))
    : '';

  if (isLoading) {
    return (
      <div
        className={`p-4 bg-white border border-[#e9eeeb] rounded-[10px] animate-pulse ${className}`}
      >
        <div className="h-5 bg-[#f6f8f6] rounded w-1/4 mb-3" />
        <div className="h-10 bg-[#f6f8f6] rounded w-full" />
      </div>
    );
  }

  if (!currentShift) {
    return (
      <div
        className={`p-4 bg-white border border-[#e9eeeb] rounded-[10px] flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${className}`}
      >
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-[8px] bg-[#faf3e7] text-[#b77a21] flex items-center justify-center font-bold text-sm flex-none">
            !
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[#17231f]">
                Chưa mở ca trực tại {branch || 'chi nhánh'}
              </span>
              <StatusTag type="wait" label="Chưa mở ca" />
            </div>
            <p className="text-xs text-[#81908a] mt-0.5">
              Vui lòng mở ca làm việc để khai báo số dư đầu ca và đối soát két tiền mặt trong ngày.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-none">
          <Button
            type="button"
            variant="primary"
            onClick={() => setOpenShiftModalOpen(true)}
            className="!bg-[#176b51] hover:!bg-[#10583f] text-white"
          >
            Mở ca làm việc
          </Button>
        </div>
      </div>
    );
  }

  const openingCash = Number(currentShift.opening_cash || 0);
  const systemCashIn = Number(currentShift.system_cash_in || 0);
  const systemCashOut = Number(currentShift.system_cash_out || 0);
  const expectedCash = Number(currentShift.expected_cash || 0);

  return (
    <div
      className={`p-4 bg-white border border-[#cde3d6] rounded-[10px] shadow-xs ${className}`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3.5 border-b border-[#e9eeeb]">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#28805e] animate-pulse flex-none" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#81908a] uppercase tracking-[0.8px]">
                Ca trực đang mở
              </span>
              <span className="font-bold text-sm text-[#176b51] font-mono">
                {currentShift.shift_code}
              </span>
              <StatusTag type="ready" label="Đang hoạt động" />
            </div>
            <div className="text-xs text-[#81908a] mt-0.5 flex flex-wrap items-center gap-x-3">
              <span>
                Thu ngân:{' '}
                <b className="text-[#17231f] font-semibold">
                  {currentShift.cashier?.name || 'Nhân viên thu ngân'}
                </b>
              </span>
              <span>•</span>
              <span>
                Bắt đầu lúc: <b className="text-[#17231f]">{openedAtFormatted}</b>
              </span>
              <span>•</span>
              <span>
                Chi nhánh:{' '}
                <b className="text-[#17231f]">
                  {currentShift.branch?.name || branch}
                </b>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-none">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCreateExpenseModalOpen(true)}
            className="text-xs"
          >
            Tạo phiếu chi
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => setCloseShiftModalOpen(true)}
            className="!bg-[#176b51] hover:!bg-[#10583f] text-white text-xs"
          >
            Chốt ca & Bàn giao
          </Button>
        </div>
      </div>

      {/* Số liệu thống kê chi tiết két tiền mặt trong ca */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
        <div className="bg-[#f6f8f6] p-2.5 rounded-[8px]">
          <div className="text-[10px] font-bold text-[#81908a] uppercase tracking-[0.6px]">
            Tiền đầu ca
          </div>
          <div className="text-sm font-bold text-[#17231f] font-mono mt-0.5">
            {moneyFormatted(openingCash)}
          </div>
        </div>

        <div className="bg-[#f6f8f6] p-2.5 rounded-[8px]">
          <div className="text-[10px] font-bold text-[#81908a] uppercase tracking-[0.6px]">
            Thu tiền mặt
          </div>
          <div className="text-sm font-bold text-[#28805e] font-mono mt-0.5">
            +{moneyFormatted(systemCashIn)}
          </div>
        </div>

        <div className="bg-[#f6f8f6] p-2.5 rounded-[8px]">
          <div className="text-[10px] font-bold text-[#81908a] uppercase tracking-[0.6px]">
            Chi tiền mặt ngoài
          </div>
          <div className="text-sm font-bold text-[#bc5b52] font-mono mt-0.5">
            -{moneyFormatted(systemCashOut)}
          </div>
        </div>

        <div className="bg-[#eaf4ef] p-2.5 rounded-[8px] border border-[#cde3d6]">
          <div className="text-[10px] font-bold text-[#176b51] uppercase tracking-[0.6px]">
            Két lý thuyết hiện tại
          </div>
          <div className="text-base font-bold text-[#176b51] font-mono mt-0.5">
            {moneyFormatted(expectedCash)}
          </div>
        </div>
      </div>
    </div>
  );
};
