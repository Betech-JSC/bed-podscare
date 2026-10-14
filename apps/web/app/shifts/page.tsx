'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Button,
  StatusTag,
  FilterBar,
  EmptyState,
  StatCard,
  useToast,
} from '@podscare/ui';
import { shiftService, cashbookService } from '@podscare/api-client';
import type { WorkShift, CashTransaction } from '@podscare/types';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';
import { useShift } from '../providers/ShiftProvider';
import { CurrentShiftBanner } from '../components/CurrentShiftBanner';

const CATEGORY_LABELS: Record<string, string> = {
  purchasing_parts: 'Mua linh kiện ngoài',
  shipping_cod: 'Cước giao nhận COD',
  store_operations: 'Vận hành (Điện, nước, VPP)',
  refund: 'Hoàn tiền cho khách',
  other_expense: 'Chi phí khác',
  repair_order_cash: 'Thu tiền mặt sửa chữa',
  opening_float: 'Tiền float đầu ca',
  other_income: 'Khoản thu khác',
};

export default function ShiftsPage() {
  const { toast } = useToast();
  const { branchId, currentUser } = usePodsCare();
  const {
    currentShift,
    cashBalance,
    refreshShift,
    setOpenShiftModalOpen,
    setCloseShiftModalOpen,
    setCreateExpenseModalOpen,
    openPrintModal,
  } = useShift();

  const [activeTab, setActiveTab] = useState<'cashbook' | 'shifts'>('cashbook');

  // Transactions state
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [isLoadingTx, setIsLoadingTx] = useState<boolean>(true);
  const [txSearch, setTxSearch] = useState<string>('');
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [txPage, setTxPage] = useState<number>(1);
  const [txTotalPages, setTxTotalPages] = useState<number>(1);

  // Shifts state
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [isLoadingShifts, setIsLoadingShifts] = useState<boolean>(true);
  const [shiftStatusFilter, setShiftStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [shiftPage, setShiftPage] = useState<number>(1);
  const [shiftTotalPages, setShiftTotalPages] = useState<number>(1);

  const effectiveBranchId =
    (branchId && branchId !== 'all' ? branchId : currentUser?.branch_id) || undefined;

  const moneyFormatted = (n?: number | string | null) => {
    if (n === undefined || n === null || n === '') return '0 ₫';
    const num = Number(n);
    return new Intl.NumberFormat('vi-VN').format(isNaN(num) ? 0 : Math.round(num)) + ' ₫';
  };

  const loadTransactions = useCallback(async () => {
    setIsLoadingTx(true);
    try {
      const res = await cashbookService.getTransactions({
        branch_id: effectiveBranchId,
        type: txTypeFilter !== 'all' ? txTypeFilter : undefined,
        page: txPage,
        per_page: 15,
      });

      if (res.success && res.data) {
        const paginated = res.data;
        setTransactions(paginated.data || []);
        setTxTotalPages(paginated.last_page || 1);
      } else {
        setTransactions([]);
      }
    } catch {
      setTransactions([]);
    } finally {
      setIsLoadingTx(false);
    }
  }, [effectiveBranchId, txTypeFilter, txPage]);

  const loadShifts = useCallback(async () => {
    setIsLoadingShifts(true);
    try {
      const res = await shiftService.getShifts({
        branch_id: effectiveBranchId,
        status: shiftStatusFilter !== 'all' ? shiftStatusFilter : undefined,
        page: shiftPage,
        per_page: 15,
      });

      if (res.success && res.data) {
        const paginated = res.data;
        setShifts(paginated.data || []);
        setShiftTotalPages(paginated.last_page || 1);
      } else {
        setShifts([]);
      }
    } catch {
      setShifts([]);
    } finally {
      setIsLoadingShifts(false);
    }
  }, [effectiveBranchId, shiftStatusFilter, shiftPage]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  // Filtered transactions in view
  const filteredTransactions = transactions.filter((t) => {
    const q = txSearch.toLowerCase();
    const codeMatch = t.transaction_code.toLowerCase().includes(q);
    const notesMatch = t.notes ? t.notes.toLowerCase().includes(q) : false;
    const recipientMatch = t.recipient_payer
      ? t.recipient_payer.toLowerCase().includes(q)
      : false;
    const catLabel = (CATEGORY_LABELS[t.category] || t.category).toLowerCase();
    const catMatch = catLabel.includes(q);

    return codeMatch || notesMatch || recipientMatch || catMatch;
  });

  const currentCashInDrawer = currentShift
    ? Number(currentShift.expected_cash || 0)
    : cashBalance?.current_cash_balance || 0;

  const currentSystemCashIn = currentShift
    ? Number(currentShift.system_cash_in || 0)
    : cashBalance?.system_cash_in || 0;

  const currentSystemCashOut = currentShift
    ? Number(currentShift.system_cash_out || 0)
    : cashBalance?.system_cash_out || 0;

  const currentVietQrTotal = currentShift
    ? Number(currentShift.vietqr_total || 0)
    : Number((cashBalance as any)?.vietqr_total || (cashBalance as any)?.total_bank_transfer || 0);

  return (
    <AppShell crumbName="Sổ quỹ & Ca trực">
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#81908a] uppercase tracking-wider mb-1">
              FINANCE & WORK SHIFTS
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#17231f] m-0">
              Sổ quỹ chi nhánh & Ca làm việc
            </h1>
            <p className="text-sm text-[#81908a] mt-1 mb-0">
              Đối soát két tiền mặt thực tế, lập phiếu chi ngoài két và quản lý bàn giao ca.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                refreshShift();
                loadTransactions();
                loadShifts();
                toast({
                  type: 'info',
                  message: 'Dữ liệu sổ quỹ và ca trực đã được đồng bộ.',
                });
              }}
            >
              Làm mới
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => setCreateExpenseModalOpen(true)}
              className="!bg-[#176b51] hover:!bg-[#10583f] text-white"
            >
              Lập phiếu chi
            </Button>
          </div>
        </div>

        {/* Current Shift Banner Widget */}
        <CurrentShiftBanner />

        {/* Financial StatCards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Tồn két tiền mặt chi nhánh"
            value={moneyFormatted(currentCashInDrawer)}
            foot="Dòng tiền mặt khả dụng tại két"
            periodLabel=""
            trend="neutral"
          />
          <StatCard
            label="Tổng chi ngoài két trong ca"
            value={`-${moneyFormatted(currentSystemCashOut)}`}
            foot="Chi mua linh kiện, COD, vận hành"
            periodLabel=""
            trend="neutral"
          />
          <StatCard
            label="Tổng thu tiền mặt trong ca"
            value={`+${moneyFormatted(currentSystemCashIn)}`}
            foot="Thu bổ sung float hoặc khoản thu khác"
            periodLabel=""
            trend="neutral"
          />
          <StatCard
            label="Doanh thu Chuyển khoản (VietQR / CK)"
            value={moneyFormatted(currentVietQrTotal)}
            foot="Doanh thu thanh toán QR/CK trong ca"
            periodLabel=""
            trend="up"
          />
        </div>

        {/* Tabs Bar & Cross Links */}
        <div className="flex items-center justify-between border-b border-[#e9eeeb] pt-2">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('cashbook')}
              className={`pb-3 text-sm font-bold border-b-2 transition-all ${
                activeTab === 'cashbook'
                  ? 'border-[#176b51] text-[#176b51]'
                  : 'border-transparent text-[#81908a] hover:text-[#17231f]'
              }`}
            >
              Sổ quỹ tiền mặt ({transactions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('shifts')}
              className={`pb-3 text-sm font-bold border-b-2 transition-all ${
                activeTab === 'shifts'
                  ? 'border-[#176b51] text-[#176b51]'
                  : 'border-transparent text-[#81908a] hover:text-[#17231f]'
              }`}
            >
              Lịch sử ca làm việc ({shifts.length})
            </button>
          </div>

          {currentUser?.role !== 'cskh' && (
            <Link
              href="/payments"
              className="text-xs font-semibold text-[#176b51] hover:underline pb-3 flex items-center gap-1"
            >
              <span>Sang Quản lý Thanh toán đơn hàng</span>
              <span>→</span>
            </Link>
          )}
        </div>

        {/* TAB 1: SỔ QUỸ TIỀN MẶT */}
        {activeTab === 'cashbook' && (
          <div className="bg-white rounded-[10px] border border-[#e9eeeb] p-4 sm:p-5 shadow-xs space-y-4">
            {/* Filter toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex-1 min-w-[260px]">
                <FilterBar
                  searchValue={txSearch}
                  onSearchChange={setTxSearch}
                  searchPlaceholder="Tìm theo mã phiếu, nội dung, người nhận hoặc danh mục..."
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#81908a]">Phân loại:</span>
                <div className="inline-flex rounded-lg border border-[#e9eeeb] p-0.5 bg-[#f6f8f6]">
                  <button
                    type="button"
                    onClick={() => {
                      setTxTypeFilter('all');
                      setTxPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-[6px] text-xs font-semibold transition-all ${
                      txTypeFilter === 'all'
                        ? 'bg-white text-[#176b51] shadow-xs'
                        : 'text-[#81908a] hover:text-[#17231f]'
                    }`}
                  >
                    Tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTxTypeFilter('expense');
                      setTxPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-[6px] text-xs font-semibold transition-all ${
                      txTypeFilter === 'expense'
                        ? 'bg-white text-[#bc5b52] shadow-xs'
                        : 'text-[#81908a] hover:text-[#17231f]'
                    }`}
                  >
                    Phiếu chi
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTxTypeFilter('income');
                      setTxPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-[6px] text-xs font-semibold transition-all ${
                      txTypeFilter === 'income'
                        ? 'bg-white text-[#28805e] shadow-xs'
                        : 'text-[#81908a] hover:text-[#17231f]'
                    }`}
                  >
                    Phiếu thu
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            {isLoadingTx ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-[#176b51]/20 border-t-[#176b51] animate-spin" />
                <span className="text-xs font-medium text-[#81908a]">
                  Đang tải dữ liệu giao dịch sổ quỹ...
                </span>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <EmptyState
                title={txSearch ? 'Không tìm thấy giao dịch nào' : 'Chưa có giao dịch sổ quỹ nào'}
                description={
                  txSearch
                    ? 'Không có phiếu thu/chi nào khớp với từ khóa tìm kiếm.'
                    : 'Chi nhánh chưa phát sinh giao dịch thu hoặc chi tiền mặt ngoài nào.'
                }
                actionLabel={txSearch ? 'Xóa bộ lọc' : 'Lập phiếu chi đầu tiên'}
                onAction={() => {
                  if (txSearch) {
                    setTxSearch('');
                  } else {
                    setCreateExpenseModalOpen(true);
                  }
                }}
              />
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-left border-collapse min-w-[700px] text-xs">
                  <thead>
                    <tr className="border-y border-[#e9eeeb] bg-[#fafbfa] text-[11px] font-bold text-[#81908a] uppercase tracking-wider h-9">
                      <th className="px-3">Mã phiếu</th>
                      <th className="px-3">Thời gian</th>
                      <th className="px-3">Danh mục</th>
                      <th className="px-3 text-right">Số tiền</th>
                      <th className="px-3">Người nhận / nộp</th>
                      <th className="px-3">Ca trực</th>
                      <th className="px-3">Người lập</th>
                      <th className="px-3">Nội dung</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f3f1]">
                    {filteredTransactions.map((tx) => {
                      const isExpense = tx.type === 'expense';
                      const dateFormatted = tx.created_at
                        ? new Intl.DateTimeFormat('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            day: '2-digit',
                            month: '2-digit',
                          }).format(new Date(tx.created_at))
                        : '---';

                      return (
                        <tr key={tx.id} className="hover:bg-[#f8faf9] transition-colors">
                          <td className="px-3 py-3 font-mono font-bold text-[#17231f]">
                            {tx.transaction_code}
                          </td>
                          <td className="px-3 py-3 text-[#60736b]">{dateFormatted}</td>
                          <td className="px-3 py-3">
                            <span className="font-medium text-[#17231f]">
                              {CATEGORY_LABELS[tx.category] || tx.category}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-bold text-sm">
                            <span className={isExpense ? 'text-[#bc5b52]' : 'text-[#28805e]'}>
                              {isExpense ? '-' : '+'}
                              {moneyFormatted(tx.amount)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-[#17231f]">
                            {tx.recipient_payer || '---'}
                          </td>
                          <td className="px-3 py-3 font-mono text-[11px] text-[#176b51]">
                            {tx.work_shift?.shift_code || '---'}
                          </td>
                          <td className="px-3 py-3 text-[#60736b]">
                            {tx.created_by_user?.name || '---'}
                          </td>
                          <td className="px-3 py-3 text-[#81908a] max-w-[200px] truncate" title={tx.notes || ''}>
                            {tx.notes || '---'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {txTotalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-[#e9eeeb] text-xs">
                <span className="text-[#81908a]">
                  Trang {txPage} / {txTotalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={txPage <= 1}
                    onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                  >
                    Trước
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={txPage >= txTotalPages}
                    onClick={() => setTxPage((p) => p + 1)}
                  >
                    Sau
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LỊCH SỬ CA LÀM VIỆC */}
        {activeTab === 'shifts' && (
          <div className="bg-white rounded-[10px] border border-[#e9eeeb] p-4 sm:p-5 shadow-xs space-y-4">
            {/* Filter toolbar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#81908a]">Trạng thái ca:</span>
                <div className="inline-flex rounded-lg border border-[#e9eeeb] p-0.5 bg-[#f6f8f6]">
                  <button
                    type="button"
                    onClick={() => {
                      setShiftStatusFilter('all');
                      setShiftPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-[6px] text-xs font-semibold transition-all ${
                      shiftStatusFilter === 'all'
                        ? 'bg-white text-[#176b51] shadow-xs'
                        : 'text-[#81908a] hover:text-[#17231f]'
                    }`}
                  >
                    Tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShiftStatusFilter('open');
                      setShiftPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-[6px] text-xs font-semibold transition-all ${
                      shiftStatusFilter === 'open'
                        ? 'bg-white text-[#28805e] shadow-xs'
                        : 'text-[#81908a] hover:text-[#17231f]'
                    }`}
                  >
                    Đang mở
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShiftStatusFilter('closed');
                      setShiftPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-[6px] text-xs font-semibold transition-all ${
                      shiftStatusFilter === 'closed'
                        ? 'bg-white text-[#77847e] shadow-xs'
                        : 'text-[#81908a] hover:text-[#17231f]'
                    }`}
                  >
                    Đã đóng
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            {isLoadingShifts ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-[#176b51]/20 border-t-[#176b51] animate-spin" />
                <span className="text-xs font-medium text-[#81908a]">
                  Đang tải danh sách ca làm việc...
                </span>
              </div>
            ) : shifts.length === 0 ? (
              <EmptyState
                title="Chưa có ca làm việc nào"
                description="Hệ thống chưa ghi nhận ca làm việc nào tại chi nhánh được chọn."
                actionLabel="Mở ca ngay"
                onAction={() => setOpenShiftModalOpen(true)}
              />
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-left border-collapse min-w-[850px] text-xs">
                  <thead>
                    <tr className="border-y border-[#e9eeeb] bg-[#fafbfa] text-[11px] font-bold text-[#81908a] uppercase tracking-wider h-9">
                      <th className="px-3">Mã ca</th>
                      <th className="px-3">Trạng thái</th>
                      <th className="px-3">Thu ngân</th>
                      <th className="px-3">Thời gian mở</th>
                      <th className="px-3">Thời gian đóng</th>
                      <th className="px-3 text-right">Tiền đầu ca</th>
                      <th className="px-3 text-right">Thu tiền mặt</th>
                      <th className="px-3 text-right">Doanh thu CK (VietQR)</th>
                      <th className="px-3 text-right">Két lý thuyết</th>
                      <th className="px-3 text-right">Thực kiểm</th>
                      <th className="px-3 text-right">Chênh lệch</th>
                      <th className="px-3 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f3f1]">
                    {shifts.map((s) => {
                      const isOpen = s.status === 'open';
                      const diff = Number(s.difference_amount || 0);

                      const openedFormatted = s.opened_at
                        ? new Intl.DateTimeFormat('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            day: '2-digit',
                            month: '2-digit',
                          }).format(new Date(s.opened_at))
                        : '---';

                      const closedFormatted = s.closed_at
                        ? new Intl.DateTimeFormat('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            day: '2-digit',
                            month: '2-digit',
                          }).format(new Date(s.closed_at))
                        : 'Đang trực';

                      return (
                        <tr key={s.id} className="hover:bg-[#f8faf9] transition-colors">
                          <td className="px-3 py-3 font-mono font-bold text-[#17231f]">
                            {s.shift_code}
                          </td>
                          <td className="px-3 py-3">
                            <StatusTag
                              type={isOpen ? 'ready' : 'gray'}
                              label={isOpen ? 'Đang mở' : 'Đã chốt'}
                            />
                          </td>
                          <td className="px-3 py-3 font-medium text-[#17231f]">
                            {s.cashier?.name || '---'}
                          </td>
                          <td className="px-3 py-3 text-[#60736b]">{openedFormatted}</td>
                          <td className="px-3 py-3 text-[#60736b]">{closedFormatted}</td>
                          <td className="px-3 py-3 text-right font-mono font-semibold">
                            {moneyFormatted(s.opening_cash)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-semibold text-[#176b51]">
                            {moneyFormatted(Number(s.system_cash_in ?? 0))}
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-semibold text-[#176b51]">
                            {moneyFormatted(Number((s as any).vietqr_total ?? 0))}
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-semibold text-[#176b51]">
                            {moneyFormatted(s.expected_cash)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-bold">
                            {s.actual_cash !== null ? moneyFormatted(s.actual_cash) : '---'}
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-semibold">
                            {s.actual_cash === null ? (
                              <span className="text-[#81908a]">---</span>
                            ) : diff === 0 ? (
                              <span className="text-[#28805e]">0 ₫</span>
                            ) : (
                              <span className={diff > 0 ? 'text-[#4778a4]' : 'text-[#bc5b52]'}>
                                {diff > 0 ? '+' : ''}
                                {moneyFormatted(diff)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              {isOpen ? (
                                <button
                                  type="button"
                                  onClick={() => setCloseShiftModalOpen(true)}
                                  className="px-2 py-1 rounded bg-[#eaf4ef] hover:bg-[#d6ecdf] text-[#176b51] font-bold text-[11px] transition-all cursor-pointer"
                                >
                                  Chốt ca
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openPrintModal(s.id)}
                                  className="px-2 py-1 rounded bg-[#f6f8f6] hover:bg-[#e9eeeb] text-[#17231f] font-semibold text-[11px] transition-all cursor-pointer"
                                  title="In biên bản chốt ca K80/A4"
                                >
                                  In phiếu
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {shiftTotalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-[#e9eeeb] text-xs">
                <span className="text-[#81908a]">
                  Trang {shiftPage} / {shiftTotalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={shiftPage <= 1}
                    onClick={() => setShiftPage((p) => Math.max(1, p - 1))}
                  >
                    Trước
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={shiftPage >= shiftTotalPages}
                    onClick={() => setShiftPage((p) => p + 1)}
                  >
                    Sau
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
