'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button, Icon } from '@podscare/ui';
import { shiftService } from '@podscare/api-client';
import type { CurrentShiftSnapshot } from '@podscare/types';

export interface ShiftCashbookSnapshotProps {
  branchId?: string | number;
  variant?: 'card' | 'full';
  className?: string;
}

export const ShiftCashbookSnapshot: React.FC<ShiftCashbookSnapshotProps> = ({
  branchId,
  variant = 'full',
  className = '',
}) => {
  const router = useRouter();

  const branchParam = React.useMemo(() => {
    if (!branchId || branchId === 'all') return 'all';
    const parsed = Number(branchId);
    return Number.isNaN(parsed) ? branchId : parsed;
  }, [branchId]);

  const { data: response, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['current-shift-snapshot', branchParam],
    queryFn: async () => {
      return await shiftService.getCurrentShift(branchParam);
    },
  });

  const shift: CurrentShiftSnapshot | null = response?.data || null;
  const isAggregated = Boolean(
    response?.is_aggregated || shift?.is_aggregated || branchParam === 'all'
  );
  const openBranchesCount = Number(shift?.open_branches_count ?? 0);
  const totalBranchesCount = Number(shift?.total_branches_count ?? 0);
  const hasActiveShift = isAggregated
    ? openBranchesCount > 0 || Boolean(response?.has_active_shift)
    : Boolean(response?.has_active_shift && shift);

  const expectedCash = Number(shift?.expected_cash ?? 0);
  const vietqrTotal = Number(shift?.vietqr_total ?? 0);
  const totalShiftFund = expectedCash + vietqrTotal;

  const formatMoney = (n?: number | string | null) => {
    if (n === null || n === undefined || n === '') return '0 ₫';
    const num = Number(n);
    if (Number.isNaN(num)) return '0 ₫';
    return new Intl.NumberFormat('vi-VN').format(num) + ' ₫';
  };

  const formatDateTime = (isoStr?: string | null) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      return `${hours}:${mins} - ${day}/${month}`;
    } catch {
      return isoStr;
    }
  };

  if (variant === 'card') {
    return (
      <div
        data-testid="zone1-card-shift-cashbook"
        className={`rounded-[14px] border p-4 sm:p-5 shadow-xs flex flex-col justify-between transition-all ${
          hasActiveShift
            ? 'bg-white border-[#e5ece8]'
            : 'bg-[#fcfaf5] border-[#ebd9bd]'
        } ${className}`}
      >
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#6d7f77]">
              KÉT TIỀN & CA TRỰC
            </span>
            <div className="flex items-center gap-1.5">
              {isLoading ? (
                <span className="h-5 w-20 rounded-full bg-[#edf4f0] animate-pulse" />
              ) : isAggregated ? (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                    hasActiveShift
                      ? 'bg-[#eaf5ef] text-[#176b58] border-[#c5e1d4]'
                      : 'bg-[#fbf3e5] text-[#915e1b] border-[#ebd9bd]'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      hasActiveShift ? 'bg-[#176b58]' : 'bg-[#d97706]'
                    }`}
                  />
                  <span>
                    {openBranchesCount}/{totalBranchesCount} chi nhánh đang mở ca
                  </span>
                </span>
              ) : hasActiveShift ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#eaf5ef] text-[#176b58] border border-[#c5e1d4]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#176b58]" />
                  <span>Đang mở ca</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#fbf3e5] text-[#915e1b] border border-[#ebd9bd]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#d97706]" />
                  <span>Chưa mở ca</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="w-6 h-6 rounded-[6px] text-[#73857d] hover:bg-[#eff4f1] grid place-items-center cursor-pointer"
                title="Cập nhật số liệu ca trực"
              >
                <Icon name="rotate" size={12} />
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2 py-1 animate-pulse">
              <div className="h-7 w-36 rounded bg-[#e5ece8]" />
              <div className="h-3.5 w-48 rounded bg-[#edf4f0]" />
            </div>
          ) : isError ? (
            <div className="text-xs text-[#bc5b52] py-2">
              Không thể tải thông tin ca trực.
            </div>
          ) : (
            <>
              <div className="font-heading font-extrabold text-2xl text-[#1c302b] tracking-tight">
                {formatMoney(totalShiftFund)}
              </div>
              <div className="text-xs text-[#5d6f67] mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>
                  Tiền mặt két: <b className="text-[#176b58]">{formatMoney(expectedCash)}</b>
                </span>
                <span className="text-[#c5d1cb]">·</span>
                <span>
                  Thu VietQR ca: <b className="text-[#2a6280]">{formatMoney(vietqrTotal)}</b>
                </span>
              </div>
            </>
          )}
        </div>

        <div className="pt-2.5 mt-3 border-t border-[#edf2ee] flex items-center justify-between gap-2 text-xs">
          <div className="text-[#65766e] truncate">
            {isAggregated ? (
              hasActiveShift ? (
                <span>
                  Đã giao trong ca: <b className="text-[#1c302b]">{shift?.orders_completed_count ?? 0} đơn</b>
                </span>
              ) : (
                <span className="text-[#915e1b]">Chưa có chi nhánh mở ca</span>
              )
            ) : hasActiveShift && shift ? (
              <span>
                Thu ngân: <b className="text-[#1c302b]">{shift.cashier?.name || 'Quầy'}</b> ({shift.shift_code})
              </span>
            ) : (
              <span className="text-[#915e1b]">Quầy chưa kích hoạt ca trực</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => router.push('/shifts')}
            className="inline-flex items-center gap-1 font-bold text-[#176b58] hover:text-[#115042] cursor-pointer whitespace-nowrap"
          >
            <span>Sổ quỹ</span>
            <Icon name="arrow" size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-[14px] border p-5 sm:p-6 shadow-xs flex flex-col justify-between transition-all ${
        hasActiveShift
          ? 'bg-white border-[#e5ece8]'
          : 'bg-[#fcfaf5] border-[#ebd9bd]'
      } ${className}`}
    >
      <div>
        {/* Header Widget */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                hasActiveShift ? 'bg-[#176b58]' : 'bg-[#d97706]'
              }`}
            />
            <span className="text-xs font-bold text-[#819089] uppercase tracking-[1px]">
              CA TRỰC & SỔ QUỸ
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            icon="rotate"
            disabled={isFetching}
            onClick={() => refetch()}
            className="text-[11px] h-6 px-1.5 text-[#73857d] hover:bg-[#eff4f1]"
            title="Cập nhật số liệu ca trực"
          >
            {isFetching ? '...' : ''}
          </Button>
        </div>

        {/* Tiêu đề & Trạng thái Ca */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
          <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
            Két tiền & Ca hiện tại
          </h3>

          {isLoading ? (
            <span className="text-[11px] text-[#81908a]">Đang kiểm tra...</span>
          ) : isAggregated ? (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                hasActiveShift
                  ? 'bg-[#eaf5ef] text-[#28805e] border-[#c5e1d4]'
                  : 'bg-[#fbf3e5] text-[#915e1b] border-[#ebd9bd]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  hasActiveShift ? 'bg-current' : 'bg-[#d97706]'
                }`}
              />
              {openBranchesCount}/{totalBranchesCount} chi nhánh đang mở ca
            </span>
          ) : hasActiveShift ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#eaf5ef] text-[#28805e] border border-[#c5e1d4]">
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              Đang trong ca
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#fbf3e5] text-[#915e1b] border border-[#ebd9bd]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#d97706]" />
              Chưa mở ca
            </span>
          )}
        </div>

        {/* Thân hiển thị theo trạng thái */}
        {isLoading ? (
          <div className="py-8 flex flex-col items-center justify-center text-xs text-[#809088]">
            <span className="w-5 h-5 rounded-full border-2 border-[#176b58] border-t-transparent animate-spin mb-2" />
            <span>Đang kiểm tra trạng thái ca làm việc...</span>
          </div>
        ) : isError ? (
          <div className="p-3.5 mb-3 bg-[#fbefed] rounded-[9px] border border-[#f5c7c2] text-xs text-[#bc5b52]">
            Không thể tải thông tin ca trực của chi nhánh.
          </div>
        ) : hasActiveShift && shift ? (
          /* TRẠNG THÁI 1: CÓ CA ĐANG MỞ (ĐƠN LẺ HOẶC GỘP CHI NHÁNH) */
          <div className="space-y-3.5">
            {!isAggregated ? (
              <div className="flex items-center justify-between p-3 rounded-[10px] bg-[#f7faf8] border border-[#e8f1ec]">
                <div className="flex items-center gap-2.5">
                  <Avatar initials={shift.cashier?.name || 'TN'} variant={1} size="sm" />
                  <div>
                    <div className="text-xs font-bold text-[#1c302b]">
                      {shift.cashier?.name || 'Thu ngân trực ca'}
                    </div>
                    <div className="text-[11px] text-[#71857c]">
                      Mã ca: <b className="font-mono text-[#176b58]">{shift.shift_code}</b>
                    </div>
                  </div>
                </div>
                <div className="text-right text-[11px] text-[#6d8278]">
                  <span>Mở lúc:</span>
                  <div className="font-medium text-[#2d3d35]">
                    {formatDateTime(shift.opened_at)}
                  </div>
                </div>
              </div>
            ) : (
              shift.open_shifts &&
              shift.open_shifts.length > 0 && (
                <div className="p-2.5 rounded-[10px] bg-[#f7faf8] border border-[#e8f1ec] space-y-1.5 max-h-28 overflow-y-auto">
                  {shift.open_shifts.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-xs py-1 px-1.5 rounded bg-white border border-[#edf2ee]"
                    >
                      <div className="truncate pr-2">
                        <span className="font-bold text-[#1c302b]">
                          {item.branch_name || item.branch?.name || `CN #${item.branch_id}`}
                        </span>
                        <span className="text-[#71857c] ml-1.5">
                          · {item.cashier_name || item.cashier?.name || 'Thu ngân'}
                        </span>
                      </div>
                      <span className="font-heading font-bold text-[#176b58] whitespace-nowrap">
                        {formatMoney(item.expected_cash)}
                      </span>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* 2 Chỉ số tài chính trọng yếu */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Tiền mặt trong két */}
              <div className="p-3 bg-white rounded-[9px] border border-[#cbe1d5] shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#176b58]">
                    Tiền mặt trong két
                  </span>
                  <span className="w-5 h-5 rounded-[5px] bg-[#eaf4ef] text-[#176b58] grid place-items-center">
                    <Icon name="account_balance_wallet" size={12} />
                  </span>
                </div>
                <div className="font-heading font-extrabold text-xl text-[#176b58]">
                  {formatMoney(expectedCash)}
                </div>
                <div className="text-[10px] text-[#788a82] mt-0.5 flex justify-between">
                  <span>Đầu ca: {formatMoney(shift.opening_cash)}</span>
                </div>
              </div>

              {/* Doanh thu VietQR trong ca */}
              <div className="p-3 bg-white rounded-[9px] border border-[#cadce6] shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#356d8a]">
                    VietQR trong ca
                  </span>
                  <span className="w-5 h-5 rounded-[5px] bg-[#edf4f8] text-[#356d8a] grid place-items-center">
                    <Icon name="qr" size={12} />
                  </span>
                </div>
                <div className="font-heading font-extrabold text-xl text-[#2a6280]">
                  {formatMoney(vietqrTotal)}
                </div>
                <div className="text-[10px] text-[#788a82] mt-0.5 flex justify-between">
                  <span>Chuyển khoản trực tiếp</span>
                </div>
              </div>
            </div>

            {/* Chỉ số phụ: Số đơn hoàn thành trong ca */}
            <div className="flex items-center justify-between px-3 py-2 bg-[#fafbfa] rounded-[8px] border border-[#edf1ee] text-xs">
              <span className="text-[#65766e]">Đơn bàn giao xong trong ca:</span>
              <span className="font-heading font-bold text-[#1c302b]">
                {shift.orders_completed_count ?? 0} đơn
              </span>
            </div>
          </div>
        ) : (
          /* TRẠNG THÁI 2: CHƯA MỞ CA LÀM VIỆC */
          <div className="space-y-3">
            <div className="p-3.5 bg-white/90 rounded-[10px] border border-[#eddcc4]">
              <div className="text-xs font-bold text-[#915e1b] mb-1 flex items-center gap-1.5">
                <Icon name="alert" size={14} className="text-[#d97706]" />
                <span>
                  {isAggregated
                    ? 'Chưa có chi nhánh nào mở ca làm việc'
                    : 'Chưa kích hoạt ca làm việc tại quầy'}
                </span>
              </div>
              <p className="text-xs text-[#8c7456] m-0 leading-relaxed">
                {isAggregated
                  ? 'Hiện tại tất cả chi nhánh đều đang đóng ca. Thu ngân tại từng chi nhánh cần mở ca và khai báo số dư đầu ca trước khi thu/chi.'
                  : 'Chi nhánh chưa có ca làm việc nào đang mở. Thu ngân cần mở ca và khai báo số dư đầu ca trước khi tiến hành thanh toán hoặc xuất quỹ.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2.5 rounded-[8px] bg-white border border-[#eddcc4]">
                <span className="text-[10px] text-[#915e1b] block">Tiền két chưa kiểm kê</span>
                <span className="font-heading font-bold text-sm text-[#915e1b]">—</span>
              </div>
              <div className="p-2.5 rounded-[8px] bg-white border border-[#eddcc4]">
                <span className="text-[10px] text-[#915e1b] block">VietQR ca mới</span>
                <span className="font-heading font-bold text-sm text-[#915e1b]">0 ₫</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="pt-3 mt-4 border-t border-[#edf2ee]">
        {hasActiveShift ? (
          <button
            type="button"
            onClick={() => router.push('/shifts')}
            className="w-full py-2 px-3 bg-[#176b58] hover:bg-[#125846] text-white text-xs font-bold rounded-[8px] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <span>Vào sổ quỹ / Chốt ca</span>
            <Icon name="arrow" size={13} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => router.push('/shifts')}
            className="w-full py-2 px-3 bg-[#b77a21] hover:bg-[#9a6416] text-white text-xs font-bold rounded-[8px] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Icon name="plus" size={13} />
            <span>Mở ca làm việc ngay</span>
          </button>
        )}
      </div>
    </div>
  );
};

