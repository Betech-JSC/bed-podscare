'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Button, Icon } from '@podscare/ui';
import type {
  ActionableTasks,
  ActionableTaskOverdue,
  ActionableTaskWaitingApproval,
  ActionableTaskWaitingParts,
  ActionableTaskWaitingQc,
  ActionableTaskWaitingPickup,
} from '@podscare/types';

export type ActionableExceptionTab =
  | 'overdue'
  | 'waiting_approval'
  | 'waiting_parts'
  | 'waiting_qc'
  | 'waiting_pickup';

export interface ActionableTasksCenterProps {
  actionableTasks?: ActionableTasks;
  isLoading?: boolean;
  initialTab?: ActionableExceptionTab;
  onOpenOrderDetail?: (orderCode: string, orderId?: number) => void;
  onOpenCheckout?: (order: any) => void;
  onNavigate?: (path: string) => void;
}

export const ActionableTasksCenter: React.FC<ActionableTasksCenterProps> = ({
  actionableTasks,
  isLoading = false,
  initialTab = 'overdue',
  onOpenOrderDetail,
  onOpenCheckout,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<ActionableExceptionTab>(initialTab);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<5 | 8>(5);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, pageSize]);

  const overdueList: ActionableTaskOverdue[] = useMemo(
    () => actionableTasks?.overdue || [],
    [actionableTasks]
  );
  const waitingApprovalList: ActionableTaskWaitingApproval[] = useMemo(
    () => actionableTasks?.waiting_approval || actionableTasks?.pending_quotes || [],
    [actionableTasks]
  );
  const waitingPartsList: ActionableTaskWaitingParts[] = useMemo(
    () => actionableTasks?.waiting_parts || actionableTasks?.special_parts || [],
    [actionableTasks]
  );
  const waitingQcList: ActionableTaskWaitingQc[] = useMemo(
    () => actionableTasks?.waiting_qc || actionableTasks?.pending_qc || [],
    [actionableTasks]
  );
  const waitingPickupList: ActionableTaskWaitingPickup[] = useMemo(
    () => actionableTasks?.waiting_pickup || actionableTasks?.ready_pickup || [],
    [actionableTasks]
  );

  const overdueCount = actionableTasks?.counts?.overdue ?? overdueList.length;
  const waitingApprovalCount =
    actionableTasks?.counts?.waiting_approval ?? waitingApprovalList.length;
  const waitingPartsCount =
    actionableTasks?.counts?.waiting_parts ?? waitingPartsList.length;
  const waitingQcCount = actionableTasks?.counts?.waiting_qc ?? waitingQcList.length;
  const waitingPickupCount =
    actionableTasks?.counts?.waiting_pickup ?? waitingPickupList.length;

  const totalExceptionCount =
    overdueCount +
    waitingApprovalCount +
    waitingPartsCount +
    waitingQcCount +
    waitingPickupCount;

  const formatMoney = (n?: number | null) =>
    n !== undefined && n !== null ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫' : '0 ₫';

  const tabs: Array<{
    key: ActionableExceptionTab;
    label: string;
    count: number;
    alert?: boolean;
    drilldownUrl: string;
  }> = [
    {
      key: 'overdue',
      label: 'Quá hạn >24h',
      count: overdueCount,
      alert: overdueCount > 0,
      drilldownUrl: '/repairs?date_filter=all&status=in_workshop&workshop_step=overdue',
    },
    {
      key: 'waiting_approval',
      label: 'Chờ duyệt báo giá',
      count: waitingApprovalCount,
      drilldownUrl: '/repairs?date_filter=all&status=in_workshop&workshop_step=waiting_approval',
    },
    {
      key: 'waiting_parts',
      label: 'Cần mua linh kiện',
      count: waitingPartsCount,
      drilldownUrl: '/repairs?date_filter=all&status=in_workshop&workshop_step=waiting_parts',
    },
    {
      key: 'waiting_qc',
      label: 'Chờ QC',
      count: waitingQcCount,
      drilldownUrl: '/repairs?date_filter=all&status=in_workshop&workshop_step=waiting_qc',
    },
    {
      key: 'waiting_pickup',
      label: 'Chờ khách lấy',
      count: waitingPickupCount,
      drilldownUrl: '/repairs?date_filter=all&status=waiting_pickup',
    },
  ];

  const activeTabMeta = tabs.find((t) => t.key === activeTab) || tabs[0];

  const activeListLength = useMemo(() => {
    switch (activeTab) {
      case 'overdue':
        return overdueList.length;
      case 'waiting_approval':
        return waitingApprovalList.length;
      case 'waiting_parts':
        return waitingPartsList.length;
      case 'waiting_qc':
        return waitingQcList.length;
      case 'waiting_pickup':
        return waitingPickupList.length;
      default:
        return 0;
    }
  }, [
    activeTab,
    overdueList.length,
    waitingApprovalList.length,
    waitingPartsList.length,
    waitingQcList.length,
    waitingPickupList.length,
  ]);

  const totalPages = Math.max(1, Math.ceil(activeListLength / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;

  const paginatedOverdue = useMemo(
    () => overdueList.slice(startIndex, startIndex + pageSize),
    [overdueList, startIndex, pageSize]
  );
  const paginatedWaitingApproval = useMemo(
    () => waitingApprovalList.slice(startIndex, startIndex + pageSize),
    [waitingApprovalList, startIndex, pageSize]
  );
  const paginatedWaitingParts = useMemo(
    () => waitingPartsList.slice(startIndex, startIndex + pageSize),
    [waitingPartsList, startIndex, pageSize]
  );
  const paginatedWaitingQc = useMemo(
    () => waitingQcList.slice(startIndex, startIndex + pageSize),
    [waitingQcList, startIndex, pageSize]
  );
  const paginatedWaitingPickup = useMemo(
    () => waitingPickupList.slice(startIndex, startIndex + pageSize),
    [waitingPickupList, startIndex, pageSize]
  );

  return (
    <div
      data-testid="zone3-actionable-tasks-center"
      className="bg-white rounded-[14px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#176b58]" />
            <span className="text-xs font-bold text-[#819089] uppercase tracking-[1px]">
              ĐƠN HÀNG CẦN XỬ LÝ NGAY
            </span>
            {isLoading ? (
              <span className="h-5 w-28 rounded-full bg-[#edf5f0] animate-pulse" />
            ) : (
              totalExceptionCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#fbefed] text-[#bc5b52] border border-[#f5c7c2]">
                  {totalExceptionCount} đơn cần can thiệp
                </span>
              )
            )}
          </div>
          <h3 className="font-heading font-bold text-lg text-[#1c302b] m-0">
            Danh sách đơn hàng ngoại lệ cần xử lý ngay
          </h3>
          <p className="text-xs text-[#7e8d85] mt-0.5 mb-0">
            Danh sách các đơn quá hạn &gt;24h, chờ khách duyệt giá, thiếu linh kiện, chờ QC và chờ khách lấy.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate?.(activeTabMeta.drilldownUrl)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-bold bg-[#f4f7f5] text-[#176b58] border border-[#d6e4dc] hover:bg-[#eaf3ee] transition-colors cursor-pointer"
        >
          <span>Mở trong Quản lý đơn ({activeTabMeta.label})</span>
          <Icon name="arrow" size={12} />
        </button>
      </div>

      {/* 5 Exception Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 border-b border-[#f0f3f1] mb-4 scrollbar-none">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              data-testid={`actionable-tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-[8px] transition-all cursor-pointer whitespace-nowrap flex-none ${
                isActive
                  ? 'bg-[#176b58] text-white font-bold shadow-xs'
                  : 'bg-[#f4f7f5] text-[#55665e] hover:bg-[#e8efeb] font-medium'
              }`}
            >
              <span>{tab.label}</span>
              {isLoading ? (
                <span className="inline-block w-4 h-3.5 rounded-full bg-current/20 animate-pulse" />
              ) : (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isActive
                      ? 'bg-white/20 text-white font-bold'
                      : tab.alert
                      ? 'bg-[#fbefed] text-[#bc5b52] font-bold'
                      : 'bg-[#e5ece8] text-[#55665e]'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Paginated Task List */}
      <div className="space-y-2.5 divide-y divide-[#f4f7f5]">
        {isLoading ? (
          <div data-testid="actionable-tasks-loading-skeleton" className="space-y-3 py-2">
            {[1, 2, 3].map((row) => (
              <div
                key={row}
                className="flex items-center justify-between gap-3 p-2.5 rounded-[8px] border border-[#f0f3f1]"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-[8px] bg-[#edf5f0] animate-pulse flex-none" />
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="h-4 w-16 rounded bg-[#e5ece8] animate-pulse" />
                      <span className="h-4 w-24 rounded bg-[#edf4f0] animate-pulse" />
                    </div>
                    <div className="h-3.5 w-3/4 rounded bg-[#edf4f0] animate-pulse" />
                  </div>
                </div>
                <div className="h-8 w-28 rounded-[7px] bg-[#e5ece8] animate-pulse flex-none" />
              </div>
            ))}
          </div>
        ) : activeListLength === 0 ? (
          <div className="py-8 text-center text-xs text-[#7c8982]">
            <div className="w-10 h-10 rounded-full bg-[#eaf4ef] text-[#176b58] grid place-items-center mx-auto mb-2">
              <Icon name="check" size={20} />
            </div>
            <div className="font-bold text-sm text-[#1c302b]">
              Không có đơn ngoại lệ trong mục &ldquo;{activeTabMeta.label}&rdquo;
            </div>
            <p className="mt-1 text-[#7c8982]">
              Toàn bộ đơn hàng thuộc nhóm này đã được giải quyết.
            </p>
          </div>
        ) : (
          <>
            {/* TAB 1: QUÁ HẠN >24H */}
            {activeTab === 'overdue' &&
              paginatedOverdue.map((item) => (
                <div
                  key={`overdue-${item.id}`}
                  className="pt-2.5 first:pt-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-[#fafcfa] p-2.5 rounded-[8px] transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-[8px] bg-[#fbefed] text-[#bc5b52] border border-[#f5c7c2] grid place-items-center flex-none mt-0.5">
                      <Icon name="alert" size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#fbefed] text-[#bc5b52] border border-[#f5c7c2]">
                          Quá hạn &gt;24h
                        </span>
                        <span className="font-mono font-bold text-xs text-[#176b58]">
                          {item.order_code}
                        </span>
                        <span className="font-semibold text-xs text-[#1c302b]">
                          {item.device_model}
                        </span>
                      </div>
                      <div className="text-xs text-[#6e7f77] flex flex-wrap items-center gap-1.5">
                        <span>
                          Khách: <b className="text-[#2b3c35]">{item.customer_name}</b>
                        </span>
                        {item.customer_phone && (
                          <span className="text-[#7c8982]">({item.customer_phone})</span>
                        )}
                        <span>·</span>
                        <span>
                          KTV: <b className="text-[#2b3c35]">{item.technician_name}</b>
                        </span>
                        {item.issue_description && (
                          <span className="text-[#86968f] truncate max-w-[220px]">
                            · {item.issue_description}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-semibold text-[#bc5b52] flex items-center gap-1 mt-1">
                        <Icon name="clock" size={12} />
                        <span>+{item.hours_overdue}h trễ cam kết xử lý</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-none w-full sm:w-auto justify-end">
                    {item.customer_phone && (
                      <a
                        href={`tel:${item.customer_phone}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[7px] text-xs font-bold bg-[#fcfaf5] text-[#915e1b] border border-[#ebd9bd] hover:bg-[#f7f0e2] transition-colors"
                      >
                        <Icon name="comment" size={13} />
                        <span>Gọi khách</span>
                      </a>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      icon="wrench"
                      onClick={() => onOpenOrderDetail?.(item.order_code, item.id)}
                      className="border-[#f5c7c2] text-[#bc5b52] hover:bg-[#fbefed]"
                    >
                      Giục KTV / Xem đơn
                    </Button>
                  </div>
                </div>
              ))}

            {/* TAB 2: CHỜ DUYỆT BÁO GIÁ */}
            {activeTab === 'waiting_approval' &&
              paginatedWaitingApproval.map((item) => (
                <div
                  key={`approval-${item.id}`}
                  className="pt-2.5 first:pt-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-[#fafcfa] p-2.5 rounded-[8px] transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-[8px] bg-[#fcfaf5] text-[#b77a21] border border-[#ebd9bd] grid place-items-center flex-none mt-0.5">
                      <Icon name="quotes" size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#fcfaf5] text-[#b77a21] border border-[#ebd9bd]">
                          Chờ duyệt giá
                        </span>
                        <span className="font-mono font-bold text-xs text-[#176b58]">
                          {item.order_code}
                        </span>
                        <span className="font-semibold text-xs text-[#1c302b]">
                          {item.device_model}
                        </span>
                      </div>
                      <div className="text-xs text-[#6e7f77] flex flex-wrap items-center gap-1.5">
                        <span>
                          Khách: <b className="text-[#2b3c35]">{item.customer_name}</b>
                        </span>
                        {item.customer_phone && (
                          <span className="text-[#7c8982]">({item.customer_phone})</span>
                        )}
                        <span>·</span>
                        <span>
                          Báo giá: <b className="text-[#176b58]">{formatMoney(item.total_price)}</b>
                        </span>
                        <span>·</span>
                        <span>
                          Chờ: <b className="text-[#b77a21]">{item.hours_pending}h</b>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-none w-full sm:w-auto justify-end">
                    {item.customer_phone && (
                      <a
                        href={`tel:${item.customer_phone}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[7px] text-xs font-bold bg-[#fcfaf5] text-[#915e1b] border border-[#ebd9bd] hover:bg-[#f7f0e2] transition-colors"
                      >
                        <Icon name="comment" size={13} />
                        <span>Gọi chốt giá</span>
                      </a>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      icon="quotes"
                      onClick={() => onOpenOrderDetail?.(item.order_code, item.id)}
                    >
                      Xử lý báo giá
                    </Button>
                  </div>
                </div>
              ))}

            {/* TAB 3: CẦN MUA LINH KIỆN */}
            {activeTab === 'waiting_parts' &&
              paginatedWaitingParts.map((item) => (
                <div
                  key={`parts-${item.id}`}
                  className="pt-2.5 first:pt-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-[#fafcfa] p-2.5 rounded-[8px] transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-[8px] bg-[#fcfaf5] text-[#915e1b] border border-[#ebd9bd] grid place-items-center flex-none mt-0.5">
                      <Icon name="inventory" size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#fcfaf5] text-[#915e1b] border border-[#ebd9bd]">
                          Chờ linh kiện
                        </span>
                        <span className="font-mono font-bold text-xs text-[#176b58]">
                          {item.order_code}
                        </span>
                        <span className="font-semibold text-xs text-[#1c302b]">
                          {item.device_model}
                        </span>
                      </div>
                      <div className="text-xs text-[#6e7f77] flex flex-wrap items-center gap-1.5">
                        <span>
                          KTV: <b className="text-[#2b3c35]">{item.technician_name}</b>
                        </span>
                        {item.special_parts_needed && (
                          <>
                            <span>·</span>
                            <span>
                              Cần mua: <b className="text-[#915e1b]">{item.special_parts_needed}</b>
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span>Chờ {item.hours_waiting ?? 0}h</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-none w-full sm:w-auto justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      icon="inventory"
                      onClick={() => onOpenOrderDetail?.(item.order_code, item.id)}
                    >
                      Cập nhật linh kiện
                    </Button>
                  </div>
                </div>
              ))}

            {/* TAB 4: CHỜ KIỂM ĐỊNH QC */}
            {activeTab === 'waiting_qc' &&
              paginatedWaitingQc.map((item) => (
                <div
                  key={`qc-${item.id}`}
                  className="pt-2.5 first:pt-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-[#fafcfa] p-2.5 rounded-[8px] transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-[8px] bg-[#eaf4ef] text-[#176b58] border border-[#c5e1d4] grid place-items-center flex-none mt-0.5">
                      <Icon name="qc" size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#eaf4ef] text-[#176b58] border border-[#c5e1d4]">
                          Chờ QC
                        </span>
                        <span className="font-mono font-bold text-xs text-[#176b58]">
                          {item.order_code}
                        </span>
                        <span className="font-semibold text-xs text-[#1c302b]">
                          {item.device_model}
                        </span>
                      </div>
                      <div className="text-xs text-[#6e7f77] flex flex-wrap items-center gap-1.5">
                        <span>
                          KTV: <b className="text-[#2b3c35]">{item.technician_name}</b> đã hoàn tất
                        </span>
                        {item.hours_waiting !== undefined && (
                          <span className="text-[#176b58] font-medium flex items-center gap-1">
                            · <Icon name="clock" size={11} /> Chờ {item.hours_waiting}h
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-none w-full sm:w-auto justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      icon="qc"
                      onClick={() => onNavigate?.('/qc')}
                    >
                      Duyệt QC
                    </Button>
                  </div>
                </div>
              ))}

            {/* TAB 5: CHỜ KHÁCH NHẬN MÁY */}
            {activeTab === 'waiting_pickup' &&
              paginatedWaitingPickup.map((item) => (
                <div
                  key={`pickup-${item.id}`}
                  className="pt-2.5 first:pt-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-[#fafcfa] p-2.5 rounded-[8px] transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-[8px] bg-[#eaf4ef] text-[#176b58] border border-[#c5e1d4] grid place-items-center flex-none mt-0.5">
                      <Icon name="truck" size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#eaf4ef] text-[#176b58] border border-[#c5e1d4]">
                          Chờ khách lấy
                        </span>
                        <span className="font-mono font-bold text-xs text-[#176b58]">
                          {item.order_code}
                        </span>
                        <span className="font-semibold text-xs text-[#1c302b]">
                          {item.device_model}
                        </span>
                      </div>
                      <div className="text-xs text-[#6e7f77] flex flex-wrap items-center gap-1.5">
                        <span>
                          Khách: <b className="text-[#2b3c35]">{item.customer_name}</b>
                        </span>
                        {item.customer_phone && (
                          <span className="text-[#7c8982]">({item.customer_phone})</span>
                        )}
                        <span>·</span>
                        <span>
                          Tiền cần thu:{' '}
                          <b className="text-[#176b58] font-bold">{formatMoney(item.total_price)}</b>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-none w-full sm:w-auto justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      icon="payments"
                      onClick={() => onOpenCheckout?.(item)}
                    >
                      Thu tiền &amp; Trả máy
                    </Button>
                  </div>
                </div>
              ))}
          </>
        )}
      </div>

      {/* Compact Pagination Footer */}
      <div className="pt-3.5 mt-3 border-t border-[#f0f3f1] flex flex-wrap items-center justify-between gap-3 text-xs text-[#7c8982]">
        <div className="flex items-center gap-1.5">
          <Icon name="clock" size={13} className="text-[#176b58]" />
          <span>
            {activeListLength > 0
              ? `Hiển thị ${startIndex + 1}–${Math.min(
                  startIndex + pageSize,
                  activeListLength
                )} trên tổng số ${activeListLength} đơn thuộc mục "${activeTabMeta.label}"`
              : `Đang xem mục "${activeTabMeta.label}"`}
          </span>
        </div>

        <div
          data-testid="actionable-tasks-compact-pagination"
          className="flex flex-wrap items-center gap-2"
        >
          <div className="flex items-center gap-1 bg-[#f4f7f5] p-0.5 rounded-[7px] border border-[#e5ece8]">
            {([5, 8] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setPageSize(size)}
                className={`px-2 py-0.5 rounded-[5px] text-[11px] font-bold transition-colors cursor-pointer ${
                  pageSize === size
                    ? 'bg-[#176b58] text-white'
                    : 'text-[#5b6c64] hover:text-[#1c302b]'
                }`}
              >
                {size} dòng
              </button>
            ))}
          </div>

          <span className="font-semibold text-[#2d3d35] px-1 text-[11px]">
            Trang {safePage}/{totalPages}
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded-[6px] border border-[#d9e3dd] bg-white text-[#2d3d35] text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f2f6f4] cursor-pointer"
            >
              Trước
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 rounded-[6px] border border-[#d9e3dd] bg-white text-[#2d3d35] text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f2f6f4] cursor-pointer"
            >
              Sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

