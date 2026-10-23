'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button, Icon } from '@podscare/ui';
import { shiftService } from '@podscare/api-client';
import type { CurrentShiftSnapshot } from '@podscare/types';
import { useShift } from '../../providers/ShiftProvider';

export interface ShiftCashbookSnapshotProps {
  branchId?: string | number;
  className?: string;
}

export const ShiftCashbookSnapshot: React.FC<ShiftCashbookSnapshotProps> = ({
  branchId,
  className = '',
}) => {
  const router = useRouter();
  const { currentShift } = useShift();

  const queryBranchParam: string | number = React.useMemo(() => {
    if (!branchId || branchId === 'all') return 'all';
    return Number(branchId);
  }, [branchId]);

  const isSameBranchAsShiftContext = Boolean(
    queryBranchParam !== 'all' &&
    currentShift &&
    Number(currentShift.branch_id) === Number(queryBranchParam)
  );

  const { data: response, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['current-shift-snapshot', queryBranchParam],
    queryFn: async () => {
      const res = await shiftService.getCurrentShift(queryBranchParam);
      return res;
    },
    initialData: isSameBranchAsShiftContext && currentShift ? {
      success: true,
      message: '',
      data: currentShift,
      has_active_shift: true,
    } : undefined,
    staleTime: 15_000,
  });

  const shift: CurrentShiftSnapshot | null = response?.data || (isSameBranchAsShiftContext ? currentShift : null);
  const hasActiveShift = Boolean(response?.has_active_shift && shift);
  const isAggregated = Boolean(shift?.is_aggregated);

  const formatMoney = (n?: number | string | null) => {
    if (n === null || n === undefined || n === '') return '0 ₫';
    const num = Number(n);
    if (isNaN(num)) return '0 ₫';
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
              KHU VỰC F · CA TRỰC & SỔ QUÝ
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
          ) : hasActiveShift ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#eaf5ef] text-[#28805e] border border-[#c5e1d4]">
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {isAggregated
                ? `Đang trong ca (${shift?.active_shifts_count || 1} chi nhánh)`
                : 'Đang trong ca'}
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
          /* TRẠNG THÁI 1: CÓ CA ĐANG MỞ */
          <div className="space-y-3.5">
            {/* Thu ngân và thời gian mở ca */}
            <div className="flex items-center justify-between p-3 rounded-[10px] bg-[#f7faf8] border border-[#e8f1ec]">
              <div className="flex items-center gap-2.5">
                <Avatar initials={isAggregated ? 'HT' : (shift.cashier?.name || 'TN')} variant={1} size="sm" />
                <div>
                  <div className="text-xs font-bold text-[#1c302b]">
                    {isAggregated
                      ? `Tổng hợp ${shift.active_shifts_count || 1} ca trực chi nhánh`
                      : (shift.cashier?.name || 'Thu ngân trực ca')}
                  </div>
                  <div className="text-[11px] text-[#71857c]">
                    Mã ca: <b className="font-mono text-[#176b58]">{shift.shift_code}</b>
                  </div>
                </div>
              </div>
              <div className="text-right text-[11px] text-[#6d8278]">
                <span>{isAggregated ? 'Ca sớm nhất:' : 'Mở lúc:'}</span>
                <div className="font-medium text-[#2d3d35]">
                  {formatDateTime(shift.opened_at)}
                </div>
              </div>
            </div>

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
                  {formatMoney(shift.expected_cash)}
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
                  {formatMoney(shift.vietqr_total || 0)}
                </div>
                <div className="text-[10px] text-[#788a82] mt-0.5 flex justify-between">
                  <span>Chuyển khoản trực tiếp</span>
                </div>
              </div>
            </div>

            {/* Chi tiết từng chi nhánh khi xem liên chi nhánh */}
            {isAggregated && shift.branches_summary && shift.branches_summary.length > 0 && (
              <div className="p-2.5 bg-[#f9fbfa] rounded-[8px] border border-[#e3ede7] space-y-1.5">
                <div className="text-[11px] font-bold text-[#176b58]">
                  Chi tiết {shift.branches_summary.length} chi nhánh đang trực:
                </div>
                <div className="space-y-1 max-h-[110px] overflow-y-auto pr-1">
                  {shift.branches_summary.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between text-[11px] py-0.5 border-b border-[#edf3ef] last:border-0"
                    >
                      <span className="text-[#3c5047] font-medium truncate max-w-[140px]">
                        {b.branch_name} ({b.cashier_name})
                      </span>
                      <span className="font-mono font-bold text-[#176b58]">
                        {formatMoney(b.expected_cash)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                <span>Chưa kích hoạt ca làm việc tại quầy</span>
              </div>
              <p className="text-xs text-[#8c7456] m-0 leading-relaxed">
                Chi nhánh chưa có ca làm việc nào đang mở. Thu ngân cần mở ca và khai báo số dư đầu ca trước khi tiến hành thanh toán hoặc xuất quỹ.
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
