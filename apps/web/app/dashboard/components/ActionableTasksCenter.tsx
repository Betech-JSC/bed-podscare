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

type TabType = 'all' | 'overdue' | 'qc' | 'pickup';

export const ActionableTasksCenter: React.FC<ActionableTasksCenterProps> = ({
  actionableTasks,
  isLoading = false,
  onOpenOrderDetail,
  onOpenCheckout,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('all');

  const overdueList = useMemo(() => actionableTasks?.overdue || [], [actionableTasks]);
  const qcList = useMemo(
    () => actionableTasks?.waiting_qc || actionableTasks?.pending_qc || [],
    [actionableTasks]
  );
  const pickupList = useMemo(
    () => actionableTasks?.waiting_pickup || actionableTasks?.ready_pickup || [],
    [actionableTasks]
  );

  const overdueCount = actionableTasks?.counts?.overdue ?? overdueList.length;
  const qcCount = actionableTasks?.counts?.waiting_qc ?? qcList.length;
  const pickupCount = actionableTasks?.counts?.waiting_pickup ?? pickupList.length;
  const totalCount =
    actionableTasks?.counts?.total ??
    (overdueCount + qcCount + pickupCount);

  const formatMoney = (n?: number) =>
    n ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫' : '—';

  const tabs = [
    { key: 'all' as TabType, label: 'Tất cả', count: totalCount },
    { key: 'overdue' as TabType, label: 'Quá hạn', count: overdueCount, alert: overdueCount > 0 },
    { key: 'qc' as TabType, label: 'Chờ QC', count: qcCount },
    { key: 'pickup' as TabType, label: 'Sẵn sàng trả máy', count: pickupCount },
  ];

  const hasItemsInTab = useMemo(() => {
    switch (activeTab) {
      case 'overdue':
        return overdueList.length > 0;
      case 'qc':
        return qcList.length > 0;
      case 'pickup':
        return pickupList.length > 0;
      case 'all':
      default:
        return overdueList.length + qcList.length + pickupList.length > 0;
    }
  }, [activeTab, overdueList, qcList, pickupList]);

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
      <div className="max-h-[380px] overflow-y-auto space-y-2.5 pr-1 divide-y divide-[#f4f7f5]">
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
        ) : !hasItemsInTab ? (
          <div className="py-8 text-center text-xs text-[#7c8982]">
            <div className="w-10 h-10 rounded-full bg-[#eaf4ef] text-[#176b58] grid place-items-center mx-auto mb-2">
              <Icon name="check" size={20} />
            </div>
            <div className="font-bold text-sm text-[#1c302b]">
              Toàn bộ công việc trong mục này đã được xử lý xong!
            </div>
            <p className="mt-1 text-[#7c8982]">
              Không có đơn hàng nào bị trễ hạn, chờ QC hay chờ bàn giao máy.
            </p>
          </div>
        ) : (
          <>
            {/* 1. ĐƠN QUÁ HẠN CAM KẾT */}
            {(activeTab === 'all' || activeTab === 'overdue') &&
              overdueList.map((item) => (
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
              ))}

            {/* 2. ĐƠN CHỜ KIỂM ĐỊNH QC */}
            {(activeTab === 'all' || activeTab === 'qc') &&
              qcList.map((item) => (
                <div
                  key={`qc-${item.id}`}
                  className="pt-2.5 first:pt-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-[#fafcfa] p-2 rounded-[8px] transition-colors"
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
                      Duyệt QC ↗
                    </Button>
                  </div>
                </div>
              ))}

            {/* 3. ĐƠN CHỜ KHÁCH NHẬN MÁY */}
            {(activeTab === 'all' || activeTab === 'pickup') &&
              pickupList.map((item) => (
                <div
                  key={`pickup-${item.id}`}
                  className="pt-2.5 first:pt-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-[#fafcfa] p-2 rounded-[8px] transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-[8px] bg-[#eaf4ef] text-[#176b58] border border-[#c5e1d4] grid place-items-center flex-none mt-0.5">
                      <Icon name="truck" size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#eaf4ef] text-[#176b58] border border-[#c5e1d4]">
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
              ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="pt-3.5 mt-3 border-t border-[#f0f3f1] flex flex-wrap items-center justify-between gap-3 text-xs text-[#7c8982]">
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
