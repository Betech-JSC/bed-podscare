'use client';

import React, { useState, useMemo } from 'react';
import { Button, Icon } from '@podscare/ui';
import type { ActionableTasks } from '@podscare/types';

export interface ActionableTasksCenterProps {
  actionableTasks?: ActionableTasks;
  isLoading?: boolean;
  onOpenOrderDetail?: (orderCode: string, orderId?: number) => void;
  onOpenCheckout?: (order: any) => void;
  onNavigate?: (path: string) => void;
}

type TabType = 'all' | 'overdue' | 'waiting_approval' | 'waiting_parts' | 'qc' | 'pickup';

export const ActionableTasksCenter: React.FC<ActionableTasksCenterProps> = ({
  actionableTasks,
  isLoading = false,
  onOpenOrderDetail,
  onOpenCheckout,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [pageSize, setPageSize] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const overdueList = useMemo(() => actionableTasks?.overdue || [], [actionableTasks]);
  const waitingApprovalList = useMemo(
    () => actionableTasks?.waiting_approval || actionableTasks?.pending_quotes || [],
    [actionableTasks]
  );
  const waitingPartsList = useMemo(
    () => actionableTasks?.waiting_parts || [],
    [actionableTasks]
  );
  const qcList = useMemo(
    () => actionableTasks?.waiting_qc || actionableTasks?.pending_qc || [],
    [actionableTasks]
  );
  const pickupList = useMemo(
    () => actionableTasks?.waiting_pickup || actionableTasks?.ready_pickup || [],
    [actionableTasks]
  );

  const overdueCount = actionableTasks?.counts?.overdue ?? overdueList.length;
  const waitingApprovalCount = actionableTasks?.counts?.waiting_approval ?? waitingApprovalList.length;
  const waitingPartsCount = actionableTasks?.counts?.waiting_parts ?? waitingPartsList.length;
  const qcCount = actionableTasks?.counts?.waiting_qc ?? qcList.length;
  const pickupCount = actionableTasks?.counts?.waiting_pickup ?? pickupList.length;
  const totalCount =
    actionableTasks?.counts?.total ??
    (overdueCount + waitingApprovalCount + waitingPartsCount + qcCount + pickupCount);

  const formatMoney = (n?: number) =>
    n ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫' : '—';

  const tabs = [
    { key: 'all' as TabType, label: 'Tất cả', count: totalCount },
    { key: 'overdue' as TabType, label: 'Quá hạn >24h', count: overdueCount, alert: overdueCount > 0 },
    { key: 'waiting_approval' as TabType, label: 'Báo giá chờ duyệt', count: waitingApprovalCount },
    { key: 'waiting_parts' as TabType, label: 'Cần mua linh kiện / Chờ LK', count: waitingPartsCount },
    { key: 'qc' as TabType, label: 'Chờ QC', count: qcCount },
    { key: 'pickup' as TabType, label: 'Chờ khách lấy / Sẵn sàng trả máy', count: pickupCount },
  ];

  const currentItems = useMemo(() => {
    switch (activeTab) {
      case 'overdue':
        return overdueList.map((item) => ({ ...item, taskType: 'overdue' as const }));
      case 'waiting_approval':
        return waitingApprovalList.map((item) => ({ ...item, taskType: 'waiting_approval' as const }));
      case 'waiting_parts':
        return waitingPartsList.map((item) => ({ ...item, taskType: 'waiting_parts' as const }));
      case 'qc':
        return qcList.map((item) => ({ ...item, taskType: 'qc' as const }));
      case 'pickup':
        return pickupList.map((item) => ({ ...item, taskType: 'pickup' as const }));
      case 'all':
      default:
        return [
          ...overdueList.map((item) => ({ ...item, taskType: 'overdue' as const })),
          ...waitingApprovalList.map((item) => ({ ...item, taskType: 'waiting_approval' as const })),
          ...waitingPartsList.map((item) => ({ ...item, taskType: 'waiting_parts' as const })),
          ...qcList.map((item) => ({ ...item, taskType: 'qc' as const })),
          ...pickupList.map((item) => ({ ...item, taskType: 'pickup' as const })),
        ];
    }
  }, [activeTab, overdueList, waitingApprovalList, waitingPartsList, qcList, pickupList]);

  const totalPages = Math.max(1, Math.ceil(currentItems.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return currentItems.slice(start, start + pageSize);
  }, [currentItems, safeCurrentPage, pageSize]);

  return (
    <div className="bg-white rounded-[14px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#176b58]" />
            <span className="text-xs font-bold text-[#819089] uppercase tracking-[1px]">
              ACTION CENTER · TRUNG TÂM TÁC NGHIỆP
            </span>
            {isLoading ? (
              <span className="h-5 w-28 rounded-full bg-[#edf5f0] animate-pulse" />
            ) : (
              totalCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#fbefed] text-[#bc5b52] border border-[#f5c7c2]">
                  {totalCount} việc cần can thiệp
                </span>
              )
            )}
          </div>
          <h3 className="font-heading font-bold text-lg text-[#1c302b] m-0">
            Việc cần xử lý trong ca
          </h3>
          <p className="text-xs text-[#7e8d85] mt-0.5 mb-0">
            Tập trung các điểm nghẽn tác nghiệp cần xử lý ngay để giải phóng thiết bị, trả máy cho khách và thông suốt quy trình.
          </p>
        </div>
      </div>

      {/* Tabs Filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-[#f0f3f1] mb-4 scrollbar-none">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-[8px] transition-all cursor-pointer whitespace-nowrap flex-none ${
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

      {/* Task List */}
      <div className="space-y-2.5 divide-y divide-[#f4f7f5]">
        {isLoading ? (
          <div data-testid="actionable-tasks-loading-skeleton" className="space-y-3 py-2">
            {[1, 2, 3].map((row) => (
              <div
                key={row}
                className="flex items-center justify-between gap-3 p-2 rounded-[8px] border border-[#f0f3f1]"
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
        ) : currentItems.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#7c8982]">
            <div className="w-10 h-10 rounded-full bg-[#eaf4ef] text-[#176b51] grid place-items-center mx-auto mb-2">
              <Icon name="check" size={20} />
            </div>
            <div className="font-bold text-sm text-[#1c302b]">
              Toàn bộ công việc trong mục này đã được xử lý xong!
            </div>
            <p className="mt-1 text-[#7c8982]">
              Không có đơn hàng nào bị trễ hạn, chờ báo giá, thiếu linh kiện, chờ QC hay chờ bàn giao máy.
            </p>
          </div>
        ) : (
          pagedItems.map((item: any) => {
            if (item.taskType === 'overdue') {
              return (
                <div
                  key={`overdue-${item.id}`}
                  className="pt-2.5 first:pt-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-[#fafcfa] p-2 rounded-[8px] transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-[8px] bg-[#fbefed] text-[#bc5b52] border border-[#f5c7c2] grid place-items-center flex-none mt-0.5">
                      <Icon name="alert" size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#fbefed] text-[#bc5b52] border border-[#f5c7c2]">
                          Quá hạn
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
                          <span className="text-[#86968f] truncate max-w-[200px]">
                            · {item.issue_description}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-semibold text-[#bc5b52] flex items-center gap-1 mt-1">
                        <Icon name="clock" size={12} />
                        <span>+{item.hours_overdue}h trễ cam kết</span>
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
              );
            }

            if (item.taskType === 'waiting_approval') {
              return (
                <div
                  key={`approval-${item.id}`}
                  className="pt-2.5 first:pt-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-[#fafcfa] p-2 rounded-[8px] transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-[8px] bg-[#faf3e7] text-[#b77a21] border border-[#edd9bd] grid place-items-center flex-none mt-0.5">
                      <Icon name="payments" size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#faf3e7] text-[#b77a21] border border-[#edd9bd]">
                          Báo giá chờ duyệt
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
                          Báo giá: <b className="text-[#176b58] font-mono">{formatMoney(item.total_price)}</b>
                        </span>
                        {item.hours_pending !== undefined && (
                          <span className="text-[#b77a21] font-medium flex items-center gap-1">
                            · <Icon name="clock" size={11} /> Chờ duyệt {item.hours_pending}h
                          </span>
                        )}
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
                      icon="search"
                      onClick={() => onOpenOrderDetail?.(item.order_code, item.id)}
                    >
                      Xem đơn
                    </Button>
                  </div>
                </div>
              );
            }

            if (item.taskType === 'waiting_parts') {
              return (
                <div
                  key={`parts-${item.id}`}
                  className="pt-2.5 first:pt-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-[#fafcfa] p-2 rounded-[8px] transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-[8px] bg-[#faf1df] text-[#b77a21] border border-[#f2deba] grid place-items-center flex-none mt-0.5">
                      <Icon name="clock" size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#faf1df] text-[#b77a21] border border-[#f2deba]">
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
                        <span>·</span>
                        <span>
                          Khách: <b className="text-[#2b3c35]">{item.customer_name}</b>
                        </span>
                        {item.hours_waiting !== undefined && (
                          <span className="text-[#b77a21] font-medium flex items-center gap-1">
                            · <Icon name="clock" size={11} /> Chờ {item.hours_waiting}h
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-none w-full sm:w-auto justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      icon="search"
                      onClick={() => onOpenOrderDetail?.(item.order_code, item.id)}
                    >
                      Xem đơn
                    </Button>
                  </div>
                </div>
              );
            }

            if (item.taskType === 'qc') {
              return (
                <div
                  key={`qc-${item.id}`}
                  className="pt-2.5 first:pt-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-[#fafcfa] p-2 rounded-[8px] transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-[8px] bg-[#eaf4ef] text-[#176b51] border border-[#c5e1d4] grid place-items-center flex-none mt-0.5">
                      <Icon name="qc" size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#eaf4ef] text-[#176b51] border border-[#c5e1d4]">
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
                      Duyệt QC ↗
                    </Button>
                  </div>
                </div>
              );
            }

            // pickup
            return (
              <div
                key={`pickup-${item.id}`}
                className="pt-2.5 first:pt-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-[#fafcfa] p-2 rounded-[8px] transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-[8px] bg-[#eaf4ef] text-[#176b51] border border-[#c5e1d4] grid place-items-center flex-none mt-0.5">
                    <Icon name="truck" size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#eaf4ef] text-[#176b51] border border-[#c5e1d4]">
                        Chờ lấy máy
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
                    Thu tiền & Trả máy
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Compact Pagination Bar */}
      {currentItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#f0f3f1] text-xs text-[#6e7f77]">
          <div className="flex items-center gap-2">
            <span>
              {currentItems.length === 0
                ? '0'
                : `${(safeCurrentPage - 1) * pageSize + 1} - ${Math.min(
                    safeCurrentPage * pageSize,
                    currentItems.length
                  )}`}{' '}
              / {currentItems.length} việc
            </span>
            <div className="flex items-center gap-1 bg-[#f4f7f5] rounded-[6px] p-0.5">
              {[5, 8].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => {
                    setPageSize(size);
                    setCurrentPage(1);
                  }}
                  className={`px-2 py-0.5 rounded-[4px] text-[11px] font-semibold cursor-pointer transition-colors ${
                    pageSize === size
                      ? 'bg-[#176b58] text-white'
                      : 'text-[#55665e] hover:bg-[#e5ece8]'
                  }`}
                >
                  {size} dòng
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded-[6px] border border-[#d8e2dc] bg-white text-[#1c302b] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f6f8f6] cursor-pointer text-xs font-medium"
            >
              Trước
            </button>
            <span className="text-[11px] font-mono text-[#55665e] px-1">
              Trang {safeCurrentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 rounded-[6px] border border-[#d8e2dc] bg-white text-[#1c302b] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f6f8f6] cursor-pointer text-xs font-medium"
            >
              Sau
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="pt-3 mt-3 border-t border-[#f0f3f1] flex flex-wrap items-center justify-between gap-3 text-xs text-[#7c8982]">
        <div className="flex items-center gap-1.5">
          <Icon name="clock" size={13} className="text-[#176b58]" />
          <span>Đang hiển thị các đầu việc cần xử lý ưu tiên trong ca làm việc.</span>
        </div>
        <button
          type="button"
          onClick={() => onNavigate?.('/repairs')}
          className="text-[#176b58] hover:text-[#115042] font-semibold cursor-pointer flex items-center gap-1 transition-colors"
        >
          <span>Xem tất cả trong Quản lý đơn</span>
          <Icon name="arrow" size={12} />
        </button>
      </div>
    </div>
  );
};
