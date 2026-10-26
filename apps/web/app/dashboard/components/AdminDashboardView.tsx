'use client';

import React from 'react';
import {
  Button,
  StatCard,
  StatusTag,
  Avatar,
  Icon,
  EmptyState,
} from '@podscare/ui';
import type { RepairOrder } from '@podscare/types';
import { ActionableTasksCenter } from './ActionableTasksCenter';
import { StaffPerformanceWidget } from './StaffPerformanceWidget';
import { ShiftCashbookSnapshot } from './ShiftCashbookSnapshot';
import { StoreSetupChecklist } from '../../components/onboarding/StoreSetupChecklist';

export interface AdminDashboardViewProps {
  role?: string;
  currentUser?: any;
  branch?: string;
  branchId: string | number;
  selectedDate: string;
  setSelectedDate: (val: string) => void;
  fromDate?: string;
  toDate?: string;
  onDateRangeChange?: (nextFrom: string, nextTo: string) => void;
  todayStr: string;
  yesterdayStr: string;
  sevenDaysAgoStr?: string;
  monthStartStr?: string;
  activePreset: 'today' | 'yesterday' | '7_days' | '30_days' | 'custom';
  setActivePreset: (val: 'today' | 'yesterday' | '7_days' | '30_days' | 'custom') => void;
  period: '7_days' | '14_days' | '30_days';
  setPeriod: (val: '7_days' | '14_days' | '30_days') => void;
  isKpiLoading: boolean;
  kpiData: any;
  monthlyTotalRevenue: number;
  monthlyCollectedAmount: number;
  monthlyCompletedCount: number;
  monthlyUncollectedAmount: number;
  monthlyUncollectedCount: number;
  selectedMonthLabel: string;
  selectedDateTotalRevenue: number;
  selectedDateCollectedAmount: number;
  selectedDateCompletedCount: number;
  selectedDateUncollectedAmount: number;
  selectedDateUncollectedCount: number;
  selectedDateDisplay: string;
  activeOrdersCount: number;
  todayOrdersCount: number;
  repairingCount: number;
  readyCount: number;
  inspectingCount: number;
  waitingApprovalCount: number;
  activeOrdersTotal: number;
  inWorkshopCount: number;
  waitingPickupCount: number;
  completedCount: number;
  reconciliation: any;
  branchOrders: RepairOrder[];
  unfinishedTechOrders: RepairOrder[];
  onExportReport: () => void;
  onOpenWarrantyIntake: () => void;
  onOpenRegularIntake: () => void;
  onOpenDrilldownModal: (period: 'month' | 'day', filter: 'all' | 'collected' | 'uncollected') => void;
  onOpenOrderDetail: (orderCode: string, orderId?: number) => void;
  onOpenCheckout: (item: any) => void;
  onNavigate: (path: string) => void;
  formatVND: (n?: number | string | null) => string;
  moneyFormatted: (n: number) => string;
  formatWorkshopDuration: (createdAtStr?: string) => string;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  role,
  currentUser,
  branch,
  branchId,
  selectedDate,
  setSelectedDate,
  fromDate,
  toDate,
  onDateRangeChange,
  todayStr,
  yesterdayStr,
  sevenDaysAgoStr,
  monthStartStr,
  activePreset,
  setActivePreset,
  period,
  setPeriod,
  isKpiLoading,
  kpiData,
  monthlyTotalRevenue,
  monthlyCollectedAmount,
  monthlyCompletedCount,
  monthlyUncollectedAmount,
  monthlyUncollectedCount,
  selectedMonthLabel,
  selectedDateTotalRevenue,
  selectedDateCollectedAmount,
  selectedDateCompletedCount,
  selectedDateUncollectedAmount,
  selectedDateUncollectedCount,
  selectedDateDisplay,
  activeOrdersCount,
  todayOrdersCount,
  repairingCount,
  readyCount,
  inspectingCount,
  waitingApprovalCount,
  activeOrdersTotal,
  inWorkshopCount,
  waitingPickupCount,
  completedCount,
  reconciliation,
  branchOrders,
  unfinishedTechOrders,
  onExportReport,
  onOpenWarrantyIntake,
  onOpenRegularIntake,
  onOpenDrilldownModal,
  onOpenOrderDetail,
  onOpenCheckout,
  onNavigate,
  formatVND,
  moneyFormatted,
  formatWorkshopDuration,
}) => {
  const renderRevenueChart = () => {
    if (isKpiLoading) {
      return (
        <div
          data-testid="kpi-card-loading-skeleton"
          className="h-[210px] w-full p-4 flex flex-col justify-between rounded-[10px] bg-[#f6f8f6]"
        >
          <div className="space-y-4">
            <div className="h-3 w-full rounded bg-[#e9f4ef] animate-pulse" />
            <div className="h-3 w-11/12 rounded bg-[#e9f4ef] animate-pulse" />
            <div className="h-24 w-full rounded-[8px] bg-[#e9eeeb] animate-pulse" />
          </div>
          <div className="flex justify-between pt-2">
            <span className="h-3 w-10 rounded bg-[#e9eeeb] animate-pulse" />
            <span className="h-3 w-10 rounded bg-[#e9eeeb] animate-pulse" />
            <span className="h-3 w-10 rounded bg-[#e9eeeb] animate-pulse" />
            <span className="h-3 w-10 rounded bg-[#e9eeeb] animate-pulse" />
          </div>
        </div>
      );
    }

    const rawChart: Array<{ date?: string; label?: string; revenue?: number; completed_orders?: number }> =
      Array.isArray(kpiData?.revenue_chart) ? (kpiData.revenue_chart as any[]) : [];

    if (rawChart.length === 0) {
      return (
        <div className="h-[210px] w-full flex items-center justify-center p-4">
          <EmptyState
            title="Chưa có dữ liệu doanh thu"
            description="Chưa có dữ liệu doanh thu phát sinh trong khoảng thời gian này."
            icon="payments"
          />
        </div>
      );
    }

    const maxRevRaw = Math.max(...rawChart.map((d) => Number(d.revenue) || 0), 10000000);
    const maxRev = Math.ceil(maxRevRaw / 10000000) * 10000000 || 10000000;
    const maxOrders = Math.max(...rawChart.map((d) => Number(d.completed_orders) || 0), 5);
    const formatMil = (v: number) => (v >= 1000000 ? `${Math.round(v / 1000000)}tr` : '0');

    return (
      <div className="h-[210px] w-full p-2 flex flex-col justify-between" data-testid="revenue-css-chart">
        <div className="flex-1 flex gap-2 items-stretch min-h-0">
          {/* Y-Axis Labels */}
          <div className="flex flex-col justify-between text-[11px] font-mono tabular-nums text-[#81908a] pr-1 pb-5 select-none">
            <span>{formatMil(maxRev)}</span>
            <span>{formatMil(maxRev * 0.75)}</span>
            <span>{formatMil(maxRev * 0.5)}</span>
            <span>{formatMil(maxRev * 0.25)}</span>
            <span>0</span>
          </div>

          {/* Bars Grid */}
          <div className="flex-1 relative flex items-end justify-between gap-1.5 pb-5 border-b border-[#e9eeeb]">
            {rawChart.map((item, idx) => {
              const rev = Number(item.revenue) || 0;
              const ord = Number(item.completed_orders) || 0;
              const revPct = Math.max(4, Math.min(100, (rev / maxRev) * 100));
              const ordPct = Math.max(4, Math.min(100, (ord / maxOrders) * 85));
              const showLabel =
                rawChart.length <= 10 ||
                idx % (rawChart.length > 20 ? 4 : 2) === 0 ||
                idx === rawChart.length - 1;

              return (
                <div
                  key={`${item.date || idx}`}
                  className="flex-1 h-full flex flex-col justify-end items-center group relative"
                  title={`${item.label || item.date}: ${formatVND(rev)} (${ord} đơn)`}
                >
                  <div className="w-full h-full flex items-end justify-center gap-0.5">
                    <div
                      className="w-full max-w-[14px] rounded-t-[4px] bg-[#176b51] group-hover:bg-[#10583f] transition-all"
                      style={{ height: `${revPct}%` }}
                    />
                    <div
                      className="w-full max-w-[6px] rounded-t-[3px] bg-[#bdc9c2]"
                      style={{ height: `${ordPct}%` }}
                    />
                  </div>
                  {showLabel && (
                    <span className="absolute -bottom-5 text-[10px] font-mono text-[#81908a] whitespace-nowrap">
                      {item.label || `T${idx + 1}`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-[#81908a] uppercase tracking-[1.05px] mb-1">
            FIXO · TỔNG QUAN
          </div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#17231f] m-0">
            Chào buổi sáng, {currentUser?.name || 'Nhân viên'}
          </h1>
          <p className="text-sm text-[#81908a] mt-1 mb-0">
            Đây là tình hình vận hành FIXO hôm nay tại {branch || currentUser?.branch}.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="md"
            icon="download"
            data-testid="admin-export-excel-btn"
            onClick={onExportReport}
          >
            Xuất báo cáo
          </Button>
          <Button
            variant="outline"
            size="md"
            icon="shield"
            data-testid="admin-warranty-intake-btn"
            onClick={onOpenWarrantyIntake}
            className="bg-[#e9f4ef] text-[#176b51] border-[#cde4d8] hover:bg-[#d8ede1] font-bold"
          >
            Tiếp nhận bảo hành
          </Button>
          <Button variant="primary" size="md" icon="plus" onClick={onOpenRegularIntake}>
            Tạo đơn mới
          </Button>
        </div>
      </div>

      {/* Bảng kiểm Thiết lập Cửa hàng 5 Bước dành riêng cho Chủ cửa hàng (role === 'admin') */}
      {(role === 'admin' || currentUser?.role === 'admin') && (
        <StoreSetupChecklist
          user={currentUser}
          role={role || currentUser?.role}
          tenantId={currentUser?.tenant_id ?? currentUser?.tenant?.id}
          userId={currentUser?.id}
          onNavigate={onNavigate}
        />
      )}

      {/* Thanh điều khiển chọn ngày / khoảng thời gian tra cứu */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-[12px] border border-[#e9eeeb] p-3.5 sm:px-5 sm:py-3.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-[#17231f] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#176b51]" />
            {role === 'admin' ? 'Tra cứu doanh thu theo ngày:' : 'Tra cứu tiến độ theo ngày:'}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[#f6f8f6] border border-[#e9eeeb] rounded-[8px] px-2.5 py-1">
              <span className="text-[11px] font-semibold text-[#81908a]">Từ ngày</span>
              <input
                type="date"
                data-testid="dashboard-from-date-input"
                value={fromDate || selectedDate}
                onChange={(e) => {
                  const nextFrom = e.target.value;
                  if (onDateRangeChange) {
                    onDateRangeChange(nextFrom, toDate || selectedDate || nextFrom);
                  } else {
                    setSelectedDate(nextFrom);
                  }
                }}
                className="text-xs bg-transparent text-[#17231f] outline-none cursor-pointer font-medium"
              />
              <span className="text-[11px] font-semibold text-[#81908a] px-0.5">Đến ngày</span>
              <input
                type="date"
                data-testid="dashboard-to-date-input"
                value={toDate || selectedDate}
                onChange={(e) => {
                  const nextTo = e.target.value;
                  if (onDateRangeChange) {
                    onDateRangeChange(fromDate || selectedDate || nextTo, nextTo);
                  } else {
                    setSelectedDate(nextTo);
                  }
                }}
                className="text-xs bg-transparent text-[#17231f] outline-none cursor-pointer font-medium"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setActivePreset('today');
                  if (onDateRangeChange) {
                    onDateRangeChange(todayStr, todayStr);
                  } else {
                    setSelectedDate(todayStr);
                  }
                }}
                className={`text-xs px-3 py-1.5 rounded-[8px] transition-all cursor-pointer ${
                  activePreset === 'today' && (fromDate || selectedDate) === todayStr && (toDate || selectedDate) === todayStr
                    ? 'bg-[#176b58] text-white font-bold shadow-xs'
                    : 'bg-white text-[#4a5c54] border border-[#d8e2dc] hover:bg-[#f0f4f2]'
                }`}
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePreset('yesterday');
                  if (onDateRangeChange) {
                    onDateRangeChange(yesterdayStr, yesterdayStr);
                  } else {
                    setSelectedDate(yesterdayStr);
                  }
                }}
                className={`text-xs px-3 py-1.5 rounded-[8px] transition-all cursor-pointer ${
                  activePreset === 'yesterday' && (fromDate || selectedDate) === yesterdayStr && (toDate || selectedDate) === yesterdayStr
                    ? 'bg-[#176b58] text-white font-bold shadow-xs'
                    : 'bg-white text-[#4a5c54] border border-[#d8e2dc] hover:bg-[#f0f4f2]'
                }`}
              >
                Hôm qua
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePreset('7_days');
                  setPeriod('7_days');
                  if (onDateRangeChange && sevenDaysAgoStr) {
                    onDateRangeChange(sevenDaysAgoStr, todayStr);
                  }
                }}
                className={`text-xs px-3 py-1.5 rounded-[8px] transition-all cursor-pointer ${
                  activePreset === '7_days' && period === '7_days'
                    ? 'bg-[#176b58] text-white font-bold shadow-xs'
                    : 'bg-white text-[#4a5c54] border border-[#d8e2dc] hover:bg-[#f0f4f2]'
                }`}
              >
                7 ngày qua
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePreset('30_days');
                  setPeriod('30_days');
                  if (onDateRangeChange && monthStartStr) {
                    onDateRangeChange(monthStartStr, todayStr);
                  }
                }}
                className={`text-xs px-3 py-1.5 rounded-[8px] transition-all cursor-pointer ${
                  activePreset === '30_days' && period === '30_days'
                    ? 'bg-[#176b58] text-white font-bold shadow-xs'
                    : 'bg-white text-[#4a5c54] border border-[#d8e2dc] hover:bg-[#f0f4f2]'
                }`}
              >
                Tháng này
              </button>
            </div>
          </div>
        </div>
        <div className="text-xs text-[#81908a] flex items-center">
          <span>
            Ngày đang chọn:{' '}
            <b className="text-[#176b51] font-mono">
              {fromDate && toDate && fromDate !== toDate
                ? selectedDateDisplay
                : selectedDate === todayStr
                ? `Hôm nay (${selectedDate})`
                : selectedDate}
            </b>
          </span>
          {isKpiLoading ? (
            <span
              data-testid="kpi-card-loading-skeleton"
              className="ml-2 inline-block h-5 w-24 rounded-full bg-[#e9f4ef] animate-pulse"
            />
          ) : (
            kpiData?.selected_date_completed_orders !== undefined && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-[#e9f4ef] text-[#176b51] font-semibold text-[11px]">
                {kpiData.selected_date_completed_orders} đơn hoàn tất
              </span>
            )
          )}
        </div>
      </div>

      {/* Stats Cards (Khu vực A: Phân quyền tài chính RBAC - 4 Ô Doanh thu & Công nợ) */}
      {role === 'admin' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Ô 1: Tổng tháng */}
          <button
            type="button"
            data-testid="admin-card-monthly-total"
            onClick={() => onOpenDrilldownModal('month', 'all')}
            className="bg-white border border-[#cde4d8] rounded-[12px] p-4 min-h-[124px] shadow-xs hover:border-[#176b51] hover:-translate-y-0.5 text-left flex flex-col justify-between transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[#176b51] text-sm font-semibold w-full">
              <span>Tổng tháng</span>
              <span className="w-8 h-8 rounded-[8px] bg-[#e9f4ef] text-[#176b51] grid place-items-center flex-none">
                <Icon name="payments" size={17} />
              </span>
            </div>

            {isKpiLoading ? (
              <div data-testid="kpi-card-loading-skeleton" className="my-2 w-full">
                <div className="h-8 w-40 rounded-[6px] bg-[#e9eeeb] animate-pulse" />
              </div>
            ) : (
              <div className="font-heading font-extrabold text-[22px] xl:text-[26px] tracking-[-0.6px] text-[#176b51] my-2 tabular-nums">
                {formatVND(monthlyTotalRevenue)}
              </div>
            )}

            <div className="flex items-center justify-between gap-1 text-xs text-[#176b51] font-semibold pt-1.5 border-t border-[#e9eeeb] w-full">
              {isKpiLoading ? (
                <span className="h-4 w-full rounded-[4px] bg-[#f6f8f6] animate-pulse" />
              ) : (
                <div className="min-w-0">
                  <div>
                    Thực thu: {formatVND(monthlyCollectedAmount)} · {monthlyCompletedCount} đơn hoàn tất · Chờ thu: {formatVND(monthlyUncollectedAmount)} ({monthlyUncollectedCount} đơn chờ lấy) ({selectedMonthLabel})
                  </div>
                  {(kpiData?.monthly_in_workshop_orders_count !== undefined && kpiData.monthly_in_workshop_orders_count > 0) && (
                    <div className="text-[11px] text-[#176b51]/80 font-normal mt-0.5">
                      ({kpiData?.monthly_ready_for_pickup_orders_count ?? monthlyUncollectedCount} chờ lấy · {kpiData.monthly_in_workshop_orders_count} đang sửa)
                    </div>
                  )}
                </div>
              )}
              <Icon name="arrow" size={12} className="text-[#176b51] flex-none" />
            </div>
          </button>

          {/* Ô 2: Công nợ chưa thu ở tháng */}
          <button
            type="button"
            data-testid="admin-card-monthly-uncollected"
            onClick={() => onOpenDrilldownModal('month', 'uncollected')}
            className={`border rounded-[12px] p-4 min-h-[124px] shadow-xs hover:-translate-y-0.5 text-left flex flex-col justify-between transition-all cursor-pointer group ${
              !isKpiLoading && monthlyUncollectedAmount > 0
                ? 'bg-[#faf1df] border-[#f2deba] hover:border-[#b77a21]'
                : 'bg-white border-[#e9eeeb] hover:border-[#176b51]'
            }`}
          >
            <div className="flex items-center justify-between text-sm font-semibold w-full">
              <span className={!isKpiLoading && monthlyUncollectedAmount > 0 ? 'text-[#b77a21]' : 'text-[#81908a]'}>
                Công nợ chưa thu ở tháng
              </span>
              <span
                className={`w-8 h-8 rounded-[8px] grid place-items-center flex-none ${
                  !isKpiLoading && monthlyUncollectedAmount > 0
                    ? 'bg-white text-[#b77a21]'
                    : 'bg-[#e9f4ef] text-[#176b51]'
                }`}
              >
                <Icon name="account_balance_wallet" size={17} />
              </span>
            </div>

            {isKpiLoading ? (
              <div data-testid="kpi-card-loading-skeleton" className="my-2 w-full">
                <div className="h-8 w-40 rounded-[6px] bg-[#e9eeeb] animate-pulse" />
              </div>
            ) : (
              <div
                className={`font-heading font-extrabold text-[22px] xl:text-[26px] tracking-[-0.6px] my-2 tabular-nums ${
                  monthlyUncollectedAmount > 0 ? 'text-[#bc5b52]' : 'text-[#17231f]'
                }`}
              >
                {formatVND(monthlyUncollectedAmount)}
              </div>
            )}

            <div className="flex items-center justify-between gap-1 text-xs pt-1.5 border-t border-[#e9eeeb] w-full">
              {isKpiLoading ? (
                <span className="h-4 w-full rounded-[4px] bg-[#f6f8f6] animate-pulse" />
              ) : (
                <span
                  className={
                    monthlyUncollectedAmount > 0
                      ? 'text-[#b77a21] font-semibold'
                      : 'text-[#81908a] font-medium'
                  }
                >
                  {monthlyUncollectedCount} đơn chờ khách nhận ({selectedMonthLabel})
                </span>
              )}
              <Icon
                name="arrow"
                size={12}
                className={
                  !isKpiLoading && monthlyUncollectedAmount > 0 ? 'text-[#b77a21] flex-none' : 'text-[#176b51] flex-none'
                }
              />
            </div>
          </button>

          {/* Ô 3: Tổng ngày đã chọn */}
          <button
            type="button"
            data-testid="admin-card-daily-total"
            onClick={() => onOpenDrilldownModal('day', 'all')}
            className="bg-white border border-[#cde4d8] rounded-[12px] p-4 min-h-[124px] shadow-xs hover:border-[#176b51] hover:-translate-y-0.5 text-left flex flex-col justify-between transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[#176b51] text-sm font-semibold w-full">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span>Tổng ngày đã chọn</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#e9f4ef] text-[#176b51]">
                  {selectedDateDisplay}
                </span>
              </div>
              <span className="w-8 h-8 rounded-[8px] bg-[#e9f4ef] text-[#176b51] grid place-items-center flex-none">
                <Icon name="payments" size={17} />
              </span>
            </div>

            {isKpiLoading ? (
              <div data-testid="kpi-card-loading-skeleton" className="my-2 w-full">
                <div className="h-8 w-40 rounded-[6px] bg-[#e9eeeb] animate-pulse" />
              </div>
            ) : (
              <div className="font-heading font-extrabold text-[22px] xl:text-[26px] tracking-[-0.6px] text-[#176b51] my-2 tabular-nums">
                {formatVND(selectedDateTotalRevenue)}
              </div>
            )}

            <div className="flex items-center justify-between gap-1 text-xs text-[#176b51] font-semibold pt-1.5 border-t border-[#e9eeeb] w-full">
              {isKpiLoading ? (
                <span className="h-4 w-full rounded-[4px] bg-[#f6f8f6] animate-pulse" />
              ) : (
                <div className="min-w-0">
                  <div>
                    Thực thu: {formatVND(selectedDateCollectedAmount)} · {selectedDateCompletedCount} đơn hoàn tất · Chờ thu: {formatVND(selectedDateUncollectedAmount)} ({selectedDateUncollectedCount} đơn chờ lấy)
                  </div>
                  {(kpiData?.selected_date_in_workshop_orders_count !== undefined && kpiData.selected_date_in_workshop_orders_count > 0) && (
                    <div className="text-[11px] text-[#176b51]/80 font-normal mt-0.5">
                      ({kpiData?.selected_date_ready_for_pickup_orders_count ?? selectedDateUncollectedCount} chờ lấy · {kpiData.selected_date_in_workshop_orders_count} đang sửa)
                    </div>
                  )}
                </div>
              )}
              <Icon name="arrow" size={12} className="text-[#176b51] flex-none" />
            </div>
          </button>

          {/* Ô 4: Công nợ chưa thu theo ngày */}
          <button
            type="button"
            data-testid="admin-card-daily-uncollected"
            onClick={() => onOpenDrilldownModal('day', 'uncollected')}
            className={`border rounded-[12px] p-4 min-h-[124px] shadow-xs hover:-translate-y-0.5 text-left flex flex-col justify-between transition-all cursor-pointer group ${
              !isKpiLoading && selectedDateUncollectedAmount > 0
                ? 'bg-[#faf1df] border-[#f2deba] hover:border-[#b77a21]'
                : 'bg-white border-[#e9eeeb] hover:border-[#176b51]'
            }`}
          >
            <div className="flex items-center justify-between text-sm font-semibold w-full">
              <span className={!isKpiLoading && selectedDateUncollectedAmount > 0 ? 'text-[#b77a21]' : 'text-[#81908a]'}>
                Công nợ chưa thu theo ngày
              </span>
              <span
                className={`w-8 h-8 rounded-[8px] grid place-items-center flex-none ${
                  !isKpiLoading && selectedDateUncollectedAmount > 0
                    ? 'bg-white text-[#b77a21]'
                    : 'bg-[#e9f4ef] text-[#176b51]'
                }`}
              >
                <Icon name="account_balance_wallet" size={17} />
              </span>
            </div>

            {isKpiLoading ? (
              <div data-testid="kpi-card-loading-skeleton" className="my-2 w-full">
                <div className="h-8 w-40 rounded-[6px] bg-[#e9eeeb] animate-pulse" />
              </div>
            ) : (
              <div
                className={`font-heading font-extrabold text-[22px] xl:text-[26px] tracking-[-0.6px] my-2 tabular-nums ${
                  selectedDateUncollectedAmount > 0 ? 'text-[#bc5b52]' : 'text-[#17231f]'
                }`}
              >
                {formatVND(selectedDateUncollectedAmount)}
              </div>
            )}

            <div className="flex items-center justify-between gap-1 text-xs pt-1.5 border-t border-[#e9eeeb] w-full">
              {isKpiLoading ? (
                <span className="h-4 w-full rounded-[4px] bg-[#f6f8f6] animate-pulse" />
              ) : (
                <span
                  className={
                    selectedDateUncollectedAmount > 0
                      ? 'text-[#b77a21] font-semibold'
                      : 'text-[#81908a] font-medium'
                  }
                >
                  {selectedDateUncollectedCount} đơn chờ khách nhận ngày {selectedDateDisplay}
                </span>
              )}
              <Icon
                name="arrow"
                size={12}
                className={
                  !isKpiLoading && selectedDateUncollectedAmount > 0 ? 'text-[#b77a21] flex-none' : 'text-[#176b51] flex-none'
                }
              />
            </div>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {isKpiLoading ? (
            [
              { label: 'Đơn đang xử lý', icon: 'clock' },
              { label: 'Tiếp nhận hôm nay', icon: 'plus' },
              { label: 'Đang kiểm tra / sửa chữa', icon: 'wrench' },
              { label: 'Chờ kiểm định QC', icon: 'verified' },
              { label: 'Sẵn sàng giao khách', icon: 'local_shipping' },
              { label: 'Tỉ lệ bảo hành', icon: 'shield' },
            ].map((item) => (
              <div
                key={item.label}
                data-testid="kpi-card-loading-skeleton"
                className="bg-white border border-[#e9eeeb] rounded-[10px] p-4 min-h-[115px] shadow-xs flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-[#81908a] text-sm font-medium w-full">
                  <span>{item.label}</span>
                  <span className="w-8 h-8 rounded-[8px] bg-[#e9f4ef] text-[#176b51] grid place-items-center flex-none">
                    <Icon name={item.icon} size={17} />
                  </span>
                </div>
                <div className="h-8 w-16 rounded-[6px] bg-[#e9eeeb] animate-pulse my-2" />
                <div className="h-3.5 w-28 rounded-[4px] bg-[#f6f8f6] animate-pulse" />
              </div>
            ))
          ) : (
            <>
              <StatCard
                label="Đơn đang xử lý"
                value={kpiData?.active_orders ?? activeOrdersCount}
                icon="clock"
                foot={`${kpiData?.active_orders ?? activeOrdersCount} đơn đang hoạt động`}
                onClick={() => onNavigate('/repairs')}
              />
              <StatCard
                label="Tiếp nhận hôm nay"
                value={String(kpiData?.intake_today ?? todayOrdersCount).padStart(2, '0')}
                icon="plus"
                foot="Cập nhật theo ngày thực tế"
              />
              <StatCard
                label="Đang kiểm tra / sửa chữa"
                value={String(repairingCount ?? 0).padStart(2, '0')}
                icon="wrench"
                foot="Máy đang xử lý tại xưởng"
                onClick={() => onNavigate('/repairs?status=in_repair')}
              />
              <StatCard
                label="Chờ kiểm định QC"
                value={String(
                  kpiData?.operational_summary?.waiting_qc_count ??
                  kpiData?.actionable_tasks?.waiting_qc?.length ??
                  0
                ).padStart(2, '0')}
                icon="verified"
                foot="Chờ nghiệm thu chất lượng"
                onClick={() => onNavigate('/qc')}
              />
              <StatCard
                label="Sẵn sàng giao khách"
                value={String(
                  kpiData?.reconciliation?.ready_for_pickup_count ??
                  kpiData?.actionable_tasks?.ready_pickup?.length ??
                  readyCount ??
                  0
                ).padStart(2, '0')}
                icon="local_shipping"
                foot="Máy xong chờ trả khách"
                onClick={() => onNavigate('/repairs?status=waiting_pickup')}
              />
              <StatCard
                label="Tỉ lệ bảo hành"
                value={`${kpiData?.summary?.warranty_rate ?? kpiData?.warranty_rate ?? 0}%`}
                icon="shield"
                foot="Tỷ lệ máy bảo hành trong kỳ"
                onClick={() => onNavigate('/repairs?intake_type=warranty')}
              />
            </>
          )}
        </div>
      )}

      {/* KHU VỰC B: CHỈ SỐ ĐIỀU HÀNH VẬN HÀNH */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#176b51]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#81908a] m-0">
              CHỈ SỐ ĐIỀU HÀNH CA LÀM VIỆC (OPERATIONAL METRICS)
            </h3>
          </div>
          <span className="text-[11px] text-[#81908a]">
            Cập nhật thời gian thực theo trạng thái đơn
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. Đơn đang mở */}
          <div
            onClick={() =>
              role === 'admin'
                ? onNavigate('/repairs?status=open&date_filter=all')
                : onNavigate('/repairs')
            }
            className="bg-white border border-[#e9eeeb] rounded-[12px] p-4 shadow-xs hover:border-[#cde4d8] hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-sm font-medium text-[#81908a]">
              <span>Đơn đang mở</span>
              <span className="w-8 h-8 rounded-[8px] bg-[#e9f4ef] text-[#176b51] grid place-items-center">
                <Icon name="repairs" size={17} />
              </span>
            </div>
            {isKpiLoading ? (
              <div data-testid="kpi-card-loading-skeleton" className="my-2">
                <div className="h-8 w-16 rounded-[6px] bg-[#e9eeeb] animate-pulse" />
              </div>
            ) : (
              <div className="font-heading font-extrabold text-2xl md:text-3xl text-[#17231f] my-2 tabular-nums">
                {kpiData?.period_operational_summary?.active_orders ?? kpiData?.operational_summary?.active_orders ?? activeOrdersTotal}
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-[#81908a]">
              {isKpiLoading ? (
                <span className="h-4 w-44 rounded-[4px] bg-[#f6f8f6] animate-pulse" />
              ) : (
                <span>
                  {inWorkshopCount} đang sửa trong xưởng · {waitingPickupCount} chờ khách nhận
                </span>
              )}
              <Icon name="arrow" size={12} className="text-[#176b51]" />
            </div>
          </div>

          {/* 2. Chờ khách nhận máy */}
          <div
            onClick={() =>
              role === 'admin'
                ? onNavigate('/repairs?status=waiting_pickup&date_filter=all')
                : onNavigate('/repairs?status=waiting_pickup')
            }
            className="bg-white border border-[#e9eeeb] rounded-[12px] p-4 shadow-xs hover:border-[#cde4d8] hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-sm font-medium text-[#81908a]">
              <span>Chờ khách nhận</span>
              <span className="w-8 h-8 rounded-[8px] bg-[#e9f4ef] text-[#176b51] grid place-items-center">
                <Icon name="truck" size={17} />
              </span>
            </div>
            {isKpiLoading ? (
              <div data-testid="kpi-card-loading-skeleton" className="my-2">
                <div className="h-8 w-16 rounded-[6px] bg-[#e9eeeb] animate-pulse" />
              </div>
            ) : (
              <div className="font-heading font-extrabold text-2xl md:text-3xl text-[#176b51] my-2 tabular-nums">
                {kpiData?.period_operational_summary?.waiting_pickup_orders ?? kpiData?.operational_summary?.waiting_pickup_orders ?? waitingPickupCount}
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-[#81908a]">
              {isKpiLoading ? (
                <span className="h-4 w-36 rounded-[4px] bg-[#f6f8f6] animate-pulse" />
              ) : (
                <span>Đã xong & QC đạt, chờ giao</span>
              )}
              <Icon name="arrow" size={12} className="text-[#176b51]" />
            </div>
          </div>

          {/* 3. Chờ linh kiện */}
          <div
            onClick={() =>
              role === 'admin'
                ? onNavigate('/repairs?status=waiting_parts&date_filter=all')
                : onNavigate('/repairs?status=waiting_parts')
            }
            className="bg-white border border-[#e9eeeb] rounded-[12px] p-4 shadow-xs hover:border-[#f2deba] hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-sm font-medium text-[#81908a]">
              <span>Chờ linh kiện</span>
              <span className="w-8 h-8 rounded-[8px] bg-[#faf1df] text-[#b77a21] grid place-items-center">
                <Icon name="inventory" size={17} />
              </span>
            </div>
            {isKpiLoading ? (
              <div data-testid="kpi-card-loading-skeleton" className="my-2">
                <div className="h-8 w-16 rounded-[6px] bg-[#e9eeeb] animate-pulse" />
              </div>
            ) : (
              <div className="font-heading font-extrabold text-2xl md:text-3xl text-[#b77a21] my-2 tabular-nums">
                {kpiData?.period_operational_summary?.waiting_parts_orders ?? kpiData?.operational_summary?.waiting_parts_orders ?? 0}
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-[#81908a]">
              {isKpiLoading ? (
                <span className="h-4 w-40 rounded-[4px] bg-[#faf1df] animate-pulse" />
              ) : (
                <span>Tạm dừng do thiếu phụ tùng</span>
              )}
              <Icon name="arrow" size={12} className="text-[#b77a21]" />
            </div>
          </div>

          {/* 4. Trễ thời hạn cam kết */}
          <div
            onClick={() =>
              role === 'admin'
                ? onNavigate('/repairs?filter=overdue&date_filter=all')
                : onNavigate('/repairs?filter=overdue')
            }
            className={`border rounded-[12px] p-4 shadow-xs transition-all cursor-pointer flex flex-col justify-between ${
              !isKpiLoading && (kpiData?.period_operational_summary?.overdue_orders ?? kpiData?.operational_summary?.overdue_orders ?? 0) > 0
                ? 'bg-[#fbeaea] border-[#f5c2c2] hover:border-[#bc5b52]'
                : 'bg-white border-[#e9eeeb] hover:border-[#cde4d8]'
            }`}
          >
            <div className="flex items-center justify-between text-sm font-medium">
              <span
                className={
                  !isKpiLoading && (kpiData?.period_operational_summary?.overdue_orders ?? kpiData?.operational_summary?.overdue_orders ?? 0) > 0
                    ? 'text-[#bc5b52] font-semibold'
                    : 'text-[#81908a]'
                }
              >
                Trễ thời hạn
              </span>
              <span
                className={`w-8 h-8 rounded-[8px] grid place-items-center ${
                  !isKpiLoading && (kpiData?.period_operational_summary?.overdue_orders ?? kpiData?.operational_summary?.overdue_orders ?? 0) > 0
                    ? 'bg-white text-[#bc5b52]'
                    : 'bg-[#e9f4ef] text-[#176b51]'
                }`}
              >
                <Icon name="alert" size={17} />
              </span>
            </div>
            {isKpiLoading ? (
              <div data-testid="kpi-card-loading-skeleton" className="my-2">
                <div className="h-8 w-16 rounded-[6px] bg-[#e9eeeb] animate-pulse" />
              </div>
            ) : (
              <div
                className={`font-heading font-extrabold text-2xl md:text-3xl my-2 tabular-nums ${
                  (kpiData?.period_operational_summary?.overdue_orders ?? kpiData?.operational_summary?.overdue_orders ?? 0) > 0
                    ? 'text-[#bc5b52]'
                    : 'text-[#17231f]'
                }`}
              >
                {kpiData?.period_operational_summary?.overdue_orders ?? kpiData?.operational_summary?.overdue_orders ?? 0}
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              {isKpiLoading ? (
                <span className="h-4 w-44 rounded-[4px] bg-[#f6f8f6] animate-pulse" />
              ) : (
                <span
                  className={
                    (kpiData?.period_operational_summary?.overdue_orders ?? kpiData?.operational_summary?.overdue_orders ?? 0) > 0
                      ? 'text-[#bc5b52] font-medium'
                      : 'text-[#81908a]'
                  }
                >
                  Máy đang sửa quá 24h trong xưởng
                </span>
              )}
              <Icon
                name="arrow"
                size={12}
                className={
                  !isKpiLoading && (kpiData?.operational_summary?.overdue_orders ?? 0) > 0
                    ? 'text-[#bc5b52]'
                    : 'text-[#176b51]'
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* KHU VỰC C: TRUNG TÂM HÀNH ĐỘNG */}
      <ActionableTasksCenter
        actionableTasks={kpiData?.actionable_tasks}
        isLoading={isKpiLoading}
        onOpenOrderDetail={onOpenOrderDetail}
        onOpenCheckout={onOpenCheckout}
        onNavigate={onNavigate}
      />

      {/* Grid: Revenue Chart & Workload breakdown */}
      {role === 'admin' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Chart */}
          <div className="lg:col-span-2 bg-white rounded-[12px] border border-[#e9eeeb] p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-heading font-bold text-base text-[#17231f] m-0">
                  Doanh thu & đơn hàng
                </h3>
                <p className="text-xs text-[#81908a] mt-0.5 mb-0">
                  Tổng quan hoạt động trong tháng {new Date().getMonth() + 1}, {new Date().getFullYear()}
                </p>
              </div>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as any)}
                className="text-xs border border-[#e9eeeb] rounded-[7px] px-3 py-1.5 bg-white text-[#4a5c54] outline-none cursor-pointer"
              >
                <option value="14_days">14 ngày gần nhất</option>
                <option value="7_days">7 ngày gần nhất</option>
                <option value="30_days">30 ngày gần nhất</option>
              </select>
            </div>
            {renderRevenueChart()}
            <div className="flex items-center gap-5 text-xs text-[#81908a] px-2 pt-3 border-t border-[#e9eeeb]">
              <span className="flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-full bg-[#176b51]" /> Doanh thu
              </span>
              <span className="flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-full bg-[#bdc9c2]" /> Đơn hoàn tất
              </span>
            </div>
          </div>

          {/* Workload */}
          <div className="bg-white rounded-[12px] border border-[#e9eeeb] p-5 sm:p-6 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-heading font-bold text-base text-[#17231f] m-0">
                  Đơn theo trạng thái
                </h3>
                <p className="text-xs text-[#81908a] mt-0.5 mb-0">
                  Phân bổ {branchOrders.length} đơn trong hệ thống
                </p>
              </div>
              <Button variant="ghost" size="sm" icon="arrow" onClick={() => onNavigate('/repairs')} />
            </div>

            {isKpiLoading ? (
              <div data-testid="kpi-card-loading-skeleton" className="space-y-4">
                {[1, 2, 3, 4].map((idx) => (
                  <div key={idx} className="grid grid-cols-[30px_1fr_30px] gap-3 items-center">
                    <div className="w-[30px] h-[30px] rounded-[8px] bg-[#e9f4ef] animate-pulse" />
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="h-3.5 w-24 rounded bg-[#e9eeeb] animate-pulse" />
                        <span className="h-3.5 w-10 rounded bg-[#f6f8f6] animate-pulse" />
                      </div>
                      <div className="h-2 bg-[#f6f8f6] rounded-full animate-pulse" />
                    </div>
                    <span className="h-4 w-5 ml-auto rounded bg-[#e9eeeb] animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3.5">
                {/* 1. Đang kiểm tra */}
                <div className="grid grid-cols-[30px_1fr_30px] gap-3 items-center">
                  <div className="w-[30px] h-[30px] rounded-[8px] bg-[#e9f4ef] text-[#176b51] grid place-items-center">
                    <Icon name="search" size={15} />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-[#17231f]">Đang kiểm tra</span>
                      <span className="text-[#81908a] font-mono">
                        {String(Number(kpiData?.period_workload_by_status?.inspecting ?? inspectingCount)).padStart(2, '0')} đơn
                      </span>
                    </div>
                    <div className="h-2 bg-[#f6f8f6] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#176b51] rounded-full"
                        style={{
                          width: `${activeOrdersTotal > 0 ? Math.min(100, (Number(kpiData?.period_workload_by_status?.inspecting ?? inspectingCount) / activeOrdersTotal) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <b className="text-xs text-right text-[#17231f] font-mono">
                    {Number(kpiData?.period_workload_by_status?.inspecting ?? inspectingCount)}
                  </b>
                </div>

                {/* 2. Chờ kỹ thuật nhận */}
                <div className="grid grid-cols-[30px_1fr_30px] gap-3 items-center">
                  <div className="w-[30px] h-[30px] rounded-[8px] bg-[#faf1df] text-[#b77a21] grid place-items-center">
                    <Icon name="clock" size={15} />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-[#17231f]">Chờ kỹ thuật nhận</span>
                      <span className="text-[#81908a] font-mono">
                        {String(Number(kpiData?.period_workload_by_status?.waiting_approval ?? waitingApprovalCount)).padStart(2, '0')} đơn
                      </span>
                    </div>
                    <div className="h-2 bg-[#f6f8f6] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#b77a21] rounded-full"
                        style={{
                          width: `${activeOrdersTotal > 0 ? Math.min(100, (Number(kpiData?.period_workload_by_status?.waiting_approval ?? waitingApprovalCount) / activeOrdersTotal) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <b className="text-xs text-right text-[#17231f] font-mono">
                    {Number(kpiData?.period_workload_by_status?.waiting_approval ?? waitingApprovalCount)}
                  </b>
                </div>

                {/* 3. Đang sửa chữa */}
                <div className="grid grid-cols-[30px_1fr_30px] gap-3 items-center">
                  <div className="w-[30px] h-[30px] rounded-[8px] bg-[#e9f1f9] text-[#4778a4] grid place-items-center">
                    <Icon name="wrench" size={15} />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-[#17231f]">Đang sửa chữa</span>
                      <span className="text-[#81908a] font-mono">
                        {String(Number(kpiData?.period_workload_by_status?.in_repair ?? repairingCount)).padStart(2, '0')} đơn
                      </span>
                    </div>
                    <div className="h-2 bg-[#f6f8f6] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#4778a4] rounded-full"
                        style={{
                          width: `${activeOrdersTotal > 0 ? Math.min(100, (Number(kpiData?.period_workload_by_status?.in_repair ?? repairingCount) / activeOrdersTotal) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <b className="text-xs text-right text-[#17231f] font-mono">
                    {Number(kpiData?.period_workload_by_status?.in_repair ?? repairingCount)}
                  </b>
                </div>

                {/* 4. Chờ linh kiện */}
                <div className="grid grid-cols-[30px_1fr_30px] gap-3 items-center">
                  <div className="w-[30px] h-[30px] rounded-[8px] bg-[#faf1df] text-[#b77a21] grid place-items-center">
                    <Icon name="inventory" size={15} />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-[#17231f]">Chờ linh kiện</span>
                      <span className="text-[#81908a] font-mono">
                        {String(Number(kpiData?.period_workload_by_status?.waiting_parts ?? kpiData?.operational_summary?.waiting_parts_orders ?? 0)).padStart(2, '0')} đơn
                      </span>
                    </div>
                    <div className="h-2 bg-[#f6f8f6] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#d97706] rounded-full"
                        style={{
                          width: `${activeOrdersTotal > 0 ? Math.min(100, (Number(kpiData?.period_workload_by_status?.waiting_parts ?? kpiData?.operational_summary?.waiting_parts_orders ?? 0) / activeOrdersTotal) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <b className="text-xs text-right text-[#17231f] font-mono">
                    {Number(kpiData?.period_workload_by_status?.waiting_parts ?? kpiData?.operational_summary?.waiting_parts_orders ?? 0)}
                  </b>
                </div>

                {/* 5. Chờ QC */}
                <div className="grid grid-cols-[30px_1fr_30px] gap-3 items-center">
                  <div className="w-[30px] h-[30px] rounded-[8px] bg-[#edf4f8] text-[#356d8a] grid place-items-center">
                    <Icon name="qc" size={15} />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-[#17231f]">Chờ QC</span>
                      <span className="text-[#81908a] font-mono">
                        {String(Number(kpiData?.period_workload_by_status?.waiting_qc ?? kpiData?.operational_summary?.waiting_qc_count ?? 0)).padStart(2, '0')} đơn
                      </span>
                    </div>
                    <div className="h-2 bg-[#f6f8f6] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#356d8a] rounded-full"
                        style={{
                          width: `${activeOrdersTotal > 0 ? Math.min(100, (Number(kpiData?.period_workload_by_status?.waiting_qc ?? kpiData?.operational_summary?.waiting_qc_count ?? 0) / activeOrdersTotal) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <b className="text-xs text-right text-[#17231f] font-mono">
                    {Number(kpiData?.period_workload_by_status?.waiting_qc ?? kpiData?.operational_summary?.waiting_qc_count ?? 0)}
                  </b>
                </div>

                {/* 6. Chờ QC / trả máy */}
                <div className="grid grid-cols-[30px_1fr_30px] gap-3 items-center">
                  <div className="w-[30px] h-[30px] rounded-[8px] bg-[#e9f4ef] text-[#176b51] grid place-items-center">
                    <Icon name="check" size={15} />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-[#17231f]">Chờ QC / trả máy</span>
                      <span className="text-[#81908a] font-mono">
                        {String(Number(kpiData?.period_workload_by_status?.ready_for_return ?? readyCount)).padStart(2, '0')} đơn
                      </span>
                    </div>
                    <div className="h-2 bg-[#f6f8f6] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#176b51] rounded-full"
                        style={{
                          width: `${activeOrdersTotal > 0 ? Math.min(100, (Number(kpiData?.period_workload_by_status?.ready_for_return ?? readyCount) / activeOrdersTotal) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <b className="text-xs text-right text-[#17231f] font-mono">
                    {Number(kpiData?.period_workload_by_status?.ready_for_return ?? readyCount)}
                  </b>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[12px] border border-[#e9eeeb] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-bold text-base text-[#17231f] m-0">
                Phân bổ tiến độ & trạng thái đơn hàng
              </h3>
              <p className="text-xs text-[#81908a] mt-0.5 mb-0">
                Tổng hợp tình hình xử lý đơn hàng tại chi nhánh
              </p>
            </div>
            <Button variant="secondary" size="sm" icon="arrow" onClick={() => onNavigate('/repairs')}>
              Mở danh sách đơn ↗
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-[10px] bg-[#e9f4ef] border border-[#cde4d8]">
              <div className="flex items-center justify-between text-xs text-[#176b51] font-semibold mb-2">
                <span>ĐANG KIỂM TRA</span>
                <span className="w-7 h-7 rounded-[7px] bg-white text-[#176b51] grid place-items-center">
                  <Icon name="search" size={15} />
                </span>
              </div>
              {isKpiLoading ? (
                <div data-testid="kpi-card-loading-skeleton" className="h-8 w-16 rounded-[6px] bg-[#cde4d8] animate-pulse" />
              ) : (
                <div className="font-heading font-bold text-2xl text-[#17231f] tabular-nums">
                  {String(inspectingCount).padStart(2, '0')} <small className="text-xs font-normal text-[#81908a]">đơn</small>
                </div>
              )}
              <div className="mt-2 text-[11px] text-[#4a5c54]">Chờ kiểm tra lỗi ban đầu</div>
            </div>

            <div className="p-4 rounded-[10px] bg-[#faf1df] border border-[#f2deba]">
              <div className="flex items-center justify-between text-xs text-[#b77a21] font-semibold mb-2">
                <span>CHỜ KỸ THUẬT</span>
                <span className="w-7 h-7 rounded-[7px] bg-white text-[#b77a21] grid place-items-center">
                  <Icon name="clock" size={15} />
                </span>
              </div>
              {isKpiLoading ? (
                <div data-testid="kpi-card-loading-skeleton" className="h-8 w-16 rounded-[6px] bg-[#f2deba] animate-pulse" />
              ) : (
                <div className="font-heading font-bold text-2xl text-[#b77a21] tabular-nums">
                  {String(waitingApprovalCount).padStart(2, '0')} <small className="text-xs font-normal text-[#b77a21]/70">đơn</small>
                </div>
              )}
              <div className="mt-2 text-[11px] text-[#b77a21]">Chờ kỹ thuật viên nhận máy</div>
            </div>

            <div className="p-4 rounded-[10px] bg-[#e9f1f9] border border-[#cde0ef]">
              <div className="flex items-center justify-between text-xs text-[#4778a4] font-semibold mb-2">
                <span>ĐANG SỬA CHỮA</span>
                <span className="w-7 h-7 rounded-[7px] bg-white text-[#4778a4] grid place-items-center">
                  <Icon name="wrench" size={15} />
                </span>
              </div>
              {isKpiLoading ? (
                <div data-testid="kpi-card-loading-skeleton" className="h-8 w-16 rounded-[6px] bg-[#cde0ef] animate-pulse" />
              ) : (
                <div className="font-heading font-bold text-2xl text-[#17231f] tabular-nums">
                  {String(repairingCount).padStart(2, '0')} <small className="text-xs font-normal text-[#81908a]">đơn</small>
                </div>
              )}
              <div className="mt-2 text-[11px] text-[#4778a4]">Kỹ thuật viên đang xử lý thiết bị</div>
            </div>

            <div className="p-4 rounded-[10px] bg-[#e9f4ef] border border-[#cde4d8]">
              <div className="flex items-center justify-between text-xs text-[#176b51] font-semibold mb-2">
                <span>CHỜ QC / TRẢ MÁY</span>
                <span className="w-7 h-7 rounded-[7px] bg-white text-[#176b51] grid place-items-center">
                  <Icon name="check" size={15} />
                </span>
              </div>
              {isKpiLoading ? (
                <div data-testid="kpi-card-loading-skeleton" className="h-8 w-16 rounded-[6px] bg-[#cde4d8] animate-pulse" />
              ) : (
                <div className="font-heading font-bold text-2xl text-[#176b51] tabular-nums">
                  {String(readyCount).padStart(2, '0')} <small className="text-xs font-normal text-[#176b51]/70">đơn</small>
                </div>
              )}
              <div className="mt-2 text-[11px] text-[#176b51]">Đã hoàn thành hoặc chờ bàn giao</div>
            </div>
          </div>
        </div>
      )}

      {/* Khối đối chiếu vận hành & dòng tiền (Chỉ render khi role === 'admin') */}
      {role === 'admin' && (
        <div className="bg-white rounded-[14px] border border-[#e9eeeb] p-5 sm:p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <div className="text-xs font-bold text-[#81908a] uppercase tracking-[1px] mb-1">
                ĐỐI SOÁT VẬN HÀNH & DÒNG TIỀN
              </div>
              <h3 className="font-heading font-bold text-lg text-[#17231f] m-0">
                Đối chiếu máy khách đã lấy vs chưa lấy
              </h3>
              <p className="text-xs text-[#81908a] mt-0.5 mb-0">
                Cán cân doanh thu thực thu so với dòng tiền chờ thu tại quầy và thiết bị đang xử lý trong xưởng.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#e9f4ef] text-[#176b51]">
                <span className="w-2 h-2 rounded-full bg-[#176b51]" />
                Tổng quan toàn quầy
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* CỘT 1: Calm Jade - Máy khách đã lấy */}
            <div className="bg-[#e9f4ef] border border-[#cde4d8] rounded-[12px] p-5 flex flex-col justify-between relative overflow-hidden">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#176b51] bg-white px-2.5 py-1 rounded-full border border-[#cde4d8]">
                    <span className="w-2 h-2 rounded-full bg-[#176b51]" />
                    <span>Máy khách đã lấy (Đã bàn giao)</span>
                  </span>
                  <span className="text-xs text-[#4a5c54] font-medium">Hoàn tất quy trình</span>
                </div>

                <div className="mt-2 mb-4">
                  <div className="flex items-baseline gap-2">
                    {isKpiLoading ? (
                      <span
                        data-testid="kpi-card-loading-skeleton"
                        className="inline-block h-9 w-16 rounded-[6px] bg-[#cde4d8] animate-pulse"
                      />
                    ) : (
                      <span className="text-3xl md:text-4xl font-heading font-extrabold text-[#176b51] tabular-nums">
                        {reconciliation?.handed_over_count ?? completedCount}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-[#176b51]">máy đã giao khách</span>
                  </div>
                  <div className="mt-3 p-3 bg-white rounded-[9px] border border-[#cde4d8]">
                    <div className="text-xs text-[#4a5c54] mb-0.5 font-medium">
                      Doanh thu thực thu tích lũy toàn thời gian:
                    </div>
                    {isKpiLoading ? (
                      <div className="h-7 w-40 rounded-[6px] bg-[#cde4d8] animate-pulse my-0.5" />
                    ) : (
                      <div className="text-xl md:text-2xl font-heading font-bold text-[#176b51] tabular-nums">
                        {reconciliation?.handed_over_revenue_formatted ??
                          formatVND(reconciliation?.handed_over_revenue)}
                      </div>
                    )}
                    <div className="text-[11px] text-[#81908a] mt-1">
                      Tích lũy toàn thời gian (tại quầy VietQR/tiền mặt & COD giao thành công)
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#cde4d8]">
                <button
                  type="button"
                  onClick={() =>
                    onNavigate(
                      `/repairs?date=${selectedDate}&date_type=completed_at&status=completed`
                    )
                  }
                  className="w-full py-2.5 px-3 bg-[#176b51] hover:bg-[#10583f] text-white text-xs font-bold rounded-[8px] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <span>Xem danh sách máy đã bàn giao</span>
                  <Icon name="arrow" size={14} />
                </button>
              </div>
            </div>

            {/* CỘT 2: Warm Ivory / Amber - Máy khách chưa lấy */}
            <div className="bg-[#faf1df] border border-[#f2deba] rounded-[12px] p-5 flex flex-col justify-between relative overflow-hidden">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#b77a21] bg-white px-2.5 py-1 rounded-full border border-[#f2deba]">
                    <span className="w-2 h-2 rounded-full bg-[#b77a21]" />
                    <span>Máy khách chưa lấy (Tại cửa hàng)</span>
                  </span>
                  {isKpiLoading ? (
                    <span className="inline-block h-4 w-24 rounded bg-[#f2deba] animate-pulse" />
                  ) : (
                    <span className="text-xs text-[#b77a21] font-medium">
                      {(reconciliation?.ready_for_pickup_count ?? 0) + (reconciliation?.in_workshop_count ?? 0)} máy tồn tại shop
                    </span>
                  )}
                </div>

                <div className="mt-2 mb-4">
                  <div className="flex items-baseline gap-2">
                    {isKpiLoading ? (
                      <span
                        data-testid="kpi-card-loading-skeleton"
                        className="inline-block h-9 w-16 rounded-[6px] bg-[#f2deba] animate-pulse"
                      />
                    ) : (
                      <span className="text-3xl md:text-4xl font-heading font-extrabold text-[#b77a21] tabular-nums">
                        {(reconciliation?.ready_for_pickup_count ?? 0) + (reconciliation?.in_workshop_count ?? 0)}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-[#b77a21]">máy chưa bàn giao</span>
                  </div>

                  <div className="mt-3 p-3 bg-white rounded-[9px] border border-[#f2deba] shadow-2xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#b77a21]">
                        Tổng tiền chưa thu:
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#faf1df] text-[#b77a21] border border-[#f2deba]">
                        Chờ thu & dở dang
                      </span>
                    </div>
                    {isKpiLoading ? (
                      <div className="h-7 w-40 rounded-[6px] bg-[#f2deba] animate-pulse my-0.5" />
                    ) : (
                      <div className="text-xl md:text-2xl font-heading font-bold text-[#b77a21] tabular-nums">
                        {reconciliation?.total_uncollected_amount_formatted ||
                          kpiData?.accounts_receivable_formatted ||
                          formatVND(
                            reconciliation?.total_uncollected_amount ??
                              (reconciliation?.ready_for_pickup_amount || 0) +
                                (reconciliation?.in_workshop_amount || 0)
                          )}
                      </div>
                    )}
                    <div className="text-[11px] text-[#81908a] mt-1">
                      Bao gồm tiền chắc chắn thu khi giao và giá trị công dở dang trong xưởng
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <div
                      onClick={() => onNavigate('/repairs?status=waiting_pickup&date_filter=all')}
                      className="p-3.5 bg-white rounded-[9px] border border-[#f2deba] shadow-2xs cursor-pointer hover:border-[#176b51]/40 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-[#b77a21]">Đã sửa xong chờ lấy / Chờ giao</span>
                        {isKpiLoading ? (
                          <span className="inline-block h-4 w-12 rounded-full bg-[#faf1df] animate-pulse" />
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#faf1df] text-[#b77a21]">
                            {reconciliation?.ready_for_pickup_count ?? 0} máy
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#81908a] mb-0.5">Tiền chắc chắn thu khi giao:</div>
                      {isKpiLoading ? (
                        <div className="h-6 w-28 rounded-[6px] bg-[#faf1df] animate-pulse my-0.5" />
                      ) : (
                        <div className="text-lg font-heading font-bold text-[#b77a21] tabular-nums">
                          {reconciliation?.ready_for_pickup_amount_formatted ??
                            formatVND(reconciliation?.ready_for_pickup_amount)}
                        </div>
                      )}
                      <div className="text-[11px] text-[#81908a] mt-1">
                        Trạng thái: Sẵn sàng trả / Chờ nhận
                      </div>
                    </div>

                    <div
                      onClick={() => onNavigate('/repairs?status=in_workshop&date_filter=all')}
                      className="p-3.5 bg-white rounded-[9px] border border-[#e9eeeb] shadow-2xs cursor-pointer hover:border-[#b77a21]/40 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-[#17231f]">Đang sửa trong xưởng</span>
                        {isKpiLoading ? (
                          <span className="inline-block h-4 w-12 rounded-full bg-[#e9f4ef] animate-pulse" />
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#e9f4ef] text-[#176b51]">
                            {reconciliation?.in_workshop_count ?? 0} máy
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#81908a] mb-0.5">Giá trị tạm tính dở dang:</div>
                      {isKpiLoading ? (
                        <div className="h-6 w-28 rounded-[6px] bg-[#e9f4ef] animate-pulse my-0.5" />
                      ) : (
                        <div className="text-lg font-heading font-bold text-[#17231f] tabular-nums">
                          {reconciliation?.in_workshop_amount_formatted ??
                            formatVND(reconciliation?.in_workshop_amount)}
                        </div>
                      )}
                      <div className="text-[11px] text-[#81908a] mt-1">
                        Đang khám / chờ linh kiện / sửa / QC
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#f2deba]">
                <button
                  type="button"
                  onClick={() => onNavigate('/repairs?status=open&date_filter=all')}
                  className="w-full py-2.5 px-3 bg-white hover:bg-[#f6f8f6] text-[#b77a21] text-xs font-bold rounded-[8px] transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-[#f2deba]"
                >
                  <span>Xem danh sách đơn chưa giao tại shop</span>
                  <Icon name="arrow" size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KHU VỰC D & F: HIỆU SUẤT NHÂN SỰ & TÓM TẮT CA TRỰC SỔ QUỸ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <StaffPerformanceWidget
            branchId={branchId}
            selectedDate={selectedDate}
            fromDate={fromDate}
            toDate={toDate}
            period={period}
            userRole={role}
          />
        </div>
        <div className="lg:col-span-1">
          <ShiftCashbookSnapshot branchId={branchId} />
        </div>
      </div>

      {/* Khối Không gian Kỹ thuật - Máy chưa xong chi tiết */}
      <div className="bg-white rounded-[12px] border border-[#e9eeeb] p-5 sm:p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-[8px] bg-[#e9f4ef] text-[#176b51] grid place-items-center flex-none">
              <Icon name="wrench" size={17} />
            </span>
            <div>
              <h3 className="font-heading font-bold text-base text-[#17231f] m-0">
                Không gian Kỹ thuật - Máy chưa xong chi tiết
              </h3>
              <p className="text-xs text-[#81908a] mt-0.5 mb-0">
                Danh sách các thiết bị đang xử lý dở dang tại xưởng ({unfinishedTechOrders.length} máy)
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate('/tech')}
            className="flex items-center gap-1.5"
          >
            <span>Mở Không gian Kỹ thuật</span>
            <span>↗</span>
          </Button>
        </div>

        {unfinishedTechOrders.length === 0 ? (
          <div className="p-8 text-center rounded-[10px] border border-dashed border-[#d8e3dc] bg-[#f6f8f6] text-xs text-[#81908a]">
            Không có máy nào đang xử lý dở dang tại xưởng. Tất cả đơn đã được hoàn tất hoặc chuyển sang các khâu tiếp theo.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 sm:mx-0">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-y border-[#e9eeeb] bg-[#f6f8f6] text-xs font-bold text-[#81908a] uppercase tracking-wider h-9">
                  <th className="px-4">Mã đơn</th>
                  <th className="px-4">Khách hàng</th>
                  <th className="px-4">Thiết bị</th>
                  <th className="px-4">KTV phụ trách</th>
                  <th className="px-4">Trạng thái</th>
                  <th className="px-4 text-right">Thời gian lưu tại xưởng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e9eeeb] text-sm">
                {unfinishedTechOrders.map((o, i) => (
                  <tr
                    key={o.id}
                    onClick={() => onOpenOrderDetail(o.id)}
                    className="h-12 hover:bg-[#f6f8f6] cursor-pointer transition-colors"
                  >
                    <td className="px-4 font-mono font-bold text-[#176b51]">{o.id}</td>
                    <td className="px-4">
                      <div className="flex items-center gap-2">
                        <Avatar initials={o.name} variant={(i % 4) as any} size="sm" />
                        <div>
                          <span className="font-semibold text-[#17231f] block">{o.name}</span>
                          {o.phone && <span className="font-mono text-xs text-[#81908a]">{o.phone}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 font-medium text-[#4a5c54]">{o.device}</td>
                    <td className="px-4">
                      <span className="inline-flex items-center gap-1.5 font-medium text-[#17231f] text-xs">
                        <span className="w-2 h-2 rounded-full bg-[#176b51]" />
                        {o.tech || 'Chưa phân công'}
                      </span>
                    </td>
                    <td className="px-4">
                      <StatusTag label={o.status} type={o.statusType} />
                    </td>
                    <td className="px-4 text-right font-mono text-xs text-[#4a5c54] font-semibold">
                      {formatWorkshopDuration(o.createdAt || o.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Orders table preview */}
      <div className="bg-white rounded-[12px] border border-[#e9eeeb] p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="font-heading font-bold text-base text-[#17231f] m-0">
              Đơn sửa chữa gần đây
            </h3>
            <span className="text-xs text-[#81908a] bg-[#f6f8f6] px-2.5 py-0.5 rounded-[10px] font-medium">
              {branchOrders.slice(0, 5).length} đơn mới
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onNavigate('/repairs')}>
            Xem tất cả đơn ↗
          </Button>
        </div>

        <div className="overflow-x-auto -mx-5 sm:mx-0">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-y border-[#e9eeeb] bg-[#f6f8f6] text-xs font-bold text-[#81908a] uppercase tracking-wider h-9">
                <th className="px-4">Mã đơn</th>
                <th className="px-4">Khách hàng</th>
                <th className="px-4">Thiết bị</th>
                <th className="px-4">Trạng thái</th>
                <th className="px-4">Chi phí</th>
                <th className="px-4">Kỹ thuật</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e9eeeb] text-sm">
              {branchOrders.slice(0, 5).map((o, i) => (
                <tr
                  key={o.id}
                  onClick={() => onOpenOrderDetail(o.id)}
                  className="h-12 hover:bg-[#f6f8f6] cursor-pointer transition-colors"
                >
                  <td className="px-4 font-mono font-bold text-[#176b51]">{o.id}</td>
                  <td className="px-4">
                    <div className="flex items-center gap-2">
                      <Avatar initials={o.name} variant={(i % 4) as any} size="sm" />
                      <span className="font-semibold text-[#17231f]">{o.name}</span>
                    </div>
                  </td>
                  <td className="px-4 font-medium text-[#4a5c54]">{o.device}</td>
                  <td className="px-4">
                    <StatusTag label={o.status} type={o.statusType} />
                  </td>
                  <td className="px-4 font-semibold text-[#17231f] font-mono tabular-nums">
                    {moneyFormatted(o.price)}
                  </td>
                  <td className="px-4 text-[#81908a]">{o.tech}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick shortcuts */}
      <div className="bg-white rounded-[12px] border border-[#e9eeeb] p-5 sm:p-6 shadow-xs">
        <h3 className="font-heading font-bold text-base text-[#17231f] mb-4">Thao tác nhanh</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={onOpenRegularIntake}
            className="p-3.5 rounded-[10px] border border-[#e9eeeb] bg-white hover:bg-[#f6f8f6] hover:border-[#cde4d8] flex items-center gap-3 text-left transition-all cursor-pointer"
          >
            <div className="w-9 h-9 rounded-[8px] bg-[#e9f4ef] text-[#176b51] grid place-items-center flex-none">
              <Icon name="plus" size={18} />
            </div>
            <div>
              <b className="text-sm text-[#17231f] block font-bold">Tạo đơn mới</b>
              <small className="text-xs text-[#81908a]">Tiếp nhận thiết bị</small>
            </div>
          </button>

          <button
            onClick={() => onNavigate('/qc')}
            className="p-3.5 rounded-[10px] border border-[#e9eeeb] bg-white hover:bg-[#f6f8f6] hover:border-[#cde4d8] flex items-center gap-3 text-left transition-all cursor-pointer"
          >
            <div className="w-9 h-9 rounded-[8px] bg-[#e9f4ef] text-[#176b51] grid place-items-center flex-none">
              <Icon name="check" size={18} />
            </div>
            <div>
              <b className="text-sm text-[#17231f] block font-bold">Kiểm định QC</b>
              <small className="text-xs text-[#81908a]">Thẩm định chất lượng</small>
            </div>
          </button>

          <button
            onClick={() => onNavigate('/track')}
            className="p-3.5 rounded-[10px] border border-[#e9eeeb] bg-white hover:bg-[#f6f8f6] hover:border-[#cde4d8] flex items-center gap-3 text-left transition-all cursor-pointer"
          >
            <div className="w-9 h-9 rounded-[8px] bg-[#e9f4ef] text-[#176b51] grid place-items-center flex-none">
              <Icon name="search" size={18} />
            </div>
            <div>
              <b className="text-sm text-[#17231f] block font-bold">Tra cứu đơn</b>
              <small className="text-xs text-[#81908a]">Dành cho khách hàng</small>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
