'use client';

import React from 'react';
import {
  Button,
  Avatar,
  Icon,
  Modal,
} from '@podscare/ui';
import type { RevenueOrderBreakdownItem } from '@podscare/types';
import { normalizeStatusCode } from '../../repairs/fsm';
import {
  formatIntakeDateForReport,
  formatOrderStatusForReport,
} from '../utils/revenueExcelExport';

export interface RevenueDrilldownModalProps {
  isOpen: boolean;
  onClose: () => void;
  drilldownPeriod: 'month' | 'day';
  setDrilldownPeriod: (period: 'month' | 'day') => void;
  selectedMonthLabel: string;
  selectedDateDisplay: string;
  fromDate?: string;
  toDate?: string;
  onDateRangeChange?: (nextFrom: string, nextTo: string) => void;
  onExportExcel?: () => void;
  isKpiLoading: boolean;
  periodTotal: number;
  periodCollected: number;
  periodUncollected: number;
  periodOrdersCount: number;
  periodUncollectedCount: number;
  periodCashAmount: number;
  periodTransferAmount: number;
  drilldownFilter: 'all' | 'collected' | 'uncollected';
  setDrilldownFilter: (filter: 'all' | 'collected' | 'uncollected') => void;
  drilldownSearch: string;
  setDrilldownSearch: (val: string) => void;
  drilldownSortKey: 'customer' | 'order' | 'total' | 'collected' | 'uncollected';
  drilldownSortDir: 'asc' | 'desc';
  onDrilldownSort: (key: 'customer' | 'order' | 'total' | 'collected' | 'uncollected') => void;
  activeDrilldownRawItems: RevenueOrderBreakdownItem[];
  filteredAndSortedDrilldownItems: RevenueOrderBreakdownItem[];
  onOpenOrderDetail: (orderCode: string, orderId?: number) => void;
  onOpenCheckout: (item: any) => void;
  onNavigateToCustomer: (query: string) => void;
  formatVND: (n?: number | string | null) => string;
}

export const RevenueDrilldownModal: React.FC<RevenueDrilldownModalProps> = ({
  isOpen,
  onClose,
  drilldownPeriod,
  setDrilldownPeriod,
  selectedMonthLabel,
  selectedDateDisplay,
  fromDate,
  toDate,
  onDateRangeChange,
  onExportExcel,
  isKpiLoading,
  periodTotal,
  periodCollected,
  periodUncollected,
  periodOrdersCount,
  periodUncollectedCount,
  periodCashAmount,
  periodTransferAmount,
  drilldownFilter,
  setDrilldownFilter,
  drilldownSearch,
  setDrilldownSearch,
  drilldownSortKey,
  drilldownSortDir,
  onDrilldownSort,
  activeDrilldownRawItems,
  filteredAndSortedDrilldownItems,
  onOpenOrderDetail,
  onOpenCheckout,
  onNavigateToCustomer,
  formatVND,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      eyebrow="FIXO · ĐỐI SOÁT DOANH THU & CÔNG NỢ KHÁCH HÀNG"
      title={
        drilldownPeriod === 'month'
          ? `Chi tiết Doanh thu & Công nợ Khách hàng — ${selectedMonthLabel}`
          : `Chi tiết Doanh thu & Công nợ Khách hàng — Ngày ${selectedDateDisplay}`
      }
      subtitle="Đối chiếu đầy đủ từng đồng: Tổng phát sinh = Thực thu (Tiền mặt + Chuyển khoản) + Công nợ chưa thu."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2.5 w-full">
          <div className="text-xs text-[#81908a]">
            Đang hiển thị <b>{filteredAndSortedDrilldownItems.length}</b> / <b>{activeDrilldownRawItems.length}</b> đơn hàng trong kỳ
          </div>
          <div className="flex items-center gap-2">
            {onExportExcel && (
              <Button
                variant="primary"
                size="md"
                icon="download"
                data-testid="drilldown-export-excel-btn"
                onClick={onExportExcel}
              >
                Xuất Excel
              </Button>
            )}
            <Button variant="secondary" size="md" onClick={onClose}>
              Đóng
            </Button>
          </div>
        </div>
      }
    >
      <div data-testid="revenue-debt-drilldown-modal" className="space-y-4">
        {/* Thanh chuyển đổi nhanh Kỳ xem: [ Theo Tháng ] / [ Theo Ngày chọn ] & lọc Từ ngày - Đến ngày */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f6f8f6] border border-[#e9eeeb] rounded-[10px] p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#17231f]">
            <span className="w-2 h-2 rounded-full bg-[#176b51]" />
            <span>
              {drilldownPeriod === 'month'
                ? `Chi tiết Doanh thu & Công nợ Khách hàng — ${selectedMonthLabel}`
                : `Chi tiết Doanh thu & Công nợ Khách hàng — Ngày ${selectedDateDisplay}`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onDateRangeChange && (
              <div className="flex items-center gap-1.5 bg-white border border-[#d6e2db] rounded-[8px] px-2.5 py-1">
                <span className="text-[11px] font-semibold text-[#81908a]">Từ ngày</span>
                <input
                  type="date"
                  data-testid="drilldown-from-date-input"
                  value={fromDate || ''}
                  onChange={(e) => {
                    const nextFrom = e.target.value;
                    setDrilldownPeriod('day');
                    onDateRangeChange(nextFrom, toDate || nextFrom);
                  }}
                  className="text-xs bg-transparent text-[#17231f] outline-none cursor-pointer font-medium"
                />
                <span className="text-[11px] font-semibold text-[#81908a] px-0.5">Đến ngày</span>
                <input
                  type="date"
                  data-testid="drilldown-to-date-input"
                  value={toDate || ''}
                  onChange={(e) => {
                    const nextTo = e.target.value;
                    setDrilldownPeriod('day');
                    onDateRangeChange(fromDate || nextTo, nextTo);
                  }}
                  className="text-xs bg-transparent text-[#17231f] outline-none cursor-pointer font-medium"
                />
              </div>
            )}
            <button
              type="button"
              data-testid="drilldown-period-month"
              onClick={() => setDrilldownPeriod('month')}
              className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer ${
                drilldownPeriod === 'month'
                  ? 'bg-[#176b51] text-white shadow-xs'
                  : 'bg-white text-[#4a5c54] border border-[#d6e2db] hover:bg-[#e9f4ef]'
              }`}
            >
              Theo Tháng ({selectedMonthLabel})
            </button>
            <button
              type="button"
              data-testid="drilldown-period-day"
              onClick={() => setDrilldownPeriod('day')}
              className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer ${
                drilldownPeriod === 'day'
                  ? 'bg-[#176b51] text-white shadow-xs'
                  : 'bg-white text-[#4a5c54] border border-[#d6e2db] hover:bg-[#e9f4ef]'
              }`}
            >
              Theo Ngày chọn ({selectedDateDisplay})
            </button>
          </div>
        </div>

        {/* TẦNG 1: Thanh 3 ô tổng hợp dòng tiền của kỳ đang xem */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* 1. Tổng phát sinh (Máy đã xong) */}
          <div className="p-4 rounded-[12px] bg-[#e9f4ef] border border-[#cde4d8] flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#176b51]">
              <span>Tổng phát sinh (Máy đã xong)</span>
              {isKpiLoading ? (
                <span className="h-5 w-14 rounded-full bg-[#cde4d8] animate-pulse" />
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-white text-[#176b51] border border-[#cde4d8]">
                  {periodOrdersCount} đơn
                </span>
              )}
            </div>
            {isKpiLoading ? (
              <div data-testid="kpi-card-loading-skeleton" className="h-8 w-36 rounded-[6px] bg-[#cde4d8] animate-pulse my-2" />
            ) : (
              <div className="font-heading font-extrabold text-xl sm:text-2xl text-[#176b51] my-2 tabular-nums">
                {formatVND(periodTotal)}
              </div>
            )}
            <div className="text-xs text-[#176b51] font-medium">
              Tổng giá trị các đơn đã hoàn tất sửa chữa trong kỳ
            </div>
          </div>

          {/* 2. Thực thu (Đã thanh toán) */}
          <div className="p-4 rounded-[12px] bg-white border border-[#cde4d8] flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#176b51]">
              <span>Thực thu (Đã thanh toán)</span>
              <Icon name="check" size={15} className="text-[#176b51]" />
            </div>
            {isKpiLoading ? (
              <div data-testid="kpi-card-loading-skeleton" className="h-8 w-36 rounded-[6px] bg-[#e9eeeb] animate-pulse my-2" />
            ) : (
              <div className="font-heading font-extrabold text-xl sm:text-2xl text-[#17231f] my-2 tabular-nums">
                {formatVND(periodCollected)}
              </div>
            )}
            <div className="text-xs text-[#4a5c54] font-medium flex flex-wrap items-center gap-x-2 gap-y-1">
              {isKpiLoading ? (
                <span className="h-4 w-48 rounded bg-[#f6f8f6] animate-pulse" />
              ) : (
                <>
                  <span>
                    Tiền mặt: <b className="text-[#176b51] font-mono tabular-nums">{formatVND(periodCashAmount)}</b>
                  </span>
                  <span>·</span>
                  <span>
                    Chuyển khoản: <b className="text-[#176b51] font-mono tabular-nums">{formatVND(periodTransferAmount)}</b>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 3. Công nợ chưa thu */}
          <div
            className={`p-4 rounded-[12px] border flex flex-col justify-between ${
              !isKpiLoading && periodUncollected > 0
                ? 'bg-[#faf1df] border-[#f2deba]'
                : 'bg-white border-[#e9eeeb]'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#b77a21]">
              <span>Công nợ chưa thu</span>
              {isKpiLoading ? (
                <span className="h-5 w-28 rounded-full bg-[#f2deba] animate-pulse" />
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-white text-[#b77a21] border border-[#f2deba]">
                  {periodUncollectedCount} đơn chờ khách nhận
                </span>
              )}
            </div>
            {isKpiLoading ? (
              <div data-testid="kpi-card-loading-skeleton" className="h-8 w-36 rounded-[6px] bg-[#f2deba] animate-pulse my-2" />
            ) : (
              <div
                className={`font-heading font-extrabold text-xl sm:text-2xl my-2 tabular-nums ${
                  periodUncollected > 0 ? 'text-[#bc5b52]' : 'text-[#17231f]'
                }`}
              >
                {formatVND(periodUncollected)}
              </div>
            )}
            <div className="text-xs text-[#b77a21] font-medium">
              Chênh lệch Tổng phát sinh trừ Thực thu trong kỳ
            </div>
          </div>
        </div>

        {/* TẦNG 2: Thanh lọc & Tìm kiếm */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#e9eeeb] rounded-[10px] p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="drilldown-tab-all"
              onClick={() => setDrilldownFilter('all')}
              className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer ${
                drilldownFilter === 'all'
                  ? 'bg-[#176b51] text-white shadow-xs'
                  : 'bg-[#f6f8f6] text-[#4a5c54] hover:bg-[#e9f4ef]'
              }`}
            >
              Tất cả ({activeDrilldownRawItems.length})
            </button>
            <button
              type="button"
              data-testid="drilldown-tab-collected"
              onClick={() => setDrilldownFilter('collected')}
              className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer ${
                drilldownFilter === 'collected'
                  ? 'bg-[#176b51] text-white shadow-xs'
                  : 'bg-[#f6f8f6] text-[#4a5c54] hover:bg-[#e9f4ef]'
              }`}
            >
              Đã thực thu (
              {
                activeDrilldownRawItems.filter(
                  (i) =>
                    normalizeStatusCode(i.status) === 'completed' ||
                    i.status === 'Hoàn tất' ||
                    Number(i.collected_amount || 0) > 0
                ).length
              }
              )
            </button>
            <button
              type="button"
              data-testid="drilldown-tab-uncollected"
              onClick={() => setDrilldownFilter('uncollected')}
              className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer ${
                drilldownFilter === 'uncollected'
                  ? 'bg-[#bc5b52] text-white shadow-xs'
                  : 'bg-[#fbeaea] text-[#bc5b52] border border-[#f5c2c2] hover:bg-[#f5c2c2]/40'
              }`}
            >
              Còn nợ chưa thu (
              {
                activeDrilldownRawItems.filter(
                  (i) =>
                    (normalizeStatusCode(i.status) !== 'completed' && i.status !== 'Hoàn tất') ||
                    Number(i.uncollected_amount || 0) > 0
                ).length
              }
              )
            </button>
          </div>

          <div className="relative flex-1 min-w-[220px] max-w-[340px]">
            <input
              type="text"
              data-testid="drilldown-search-input"
              value={drilldownSearch}
              onChange={(e) => setDrilldownSearch(e.target.value)}
              placeholder="Tìm tên khách hàng, SĐT, mã đơn, thiết bị..."
              className="w-full text-xs border border-[#d6dfda] bg-[#f6f8f6] text-[#17231f] rounded-[8px] pl-3 pr-8 py-2 outline-none focus:border-[#176b51] focus:bg-white transition-all"
            />
            {drilldownSearch && (
              <button
                type="button"
                onClick={() => setDrilldownSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#81908a] hover:text-[#17231f] cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* TẦNG 3: Bảng chi tiết theo từng Khách hàng & Đơn máy */}
        {isKpiLoading ? (
          <div
            data-testid="kpi-card-loading-skeleton"
            className="p-4 rounded-[12px] border border-[#e9eeeb] bg-white space-y-3"
          >
            {[1, 2, 3].map((row) => (
              <div
                key={row}
                className="flex items-center justify-between gap-4 py-2 border-b border-[#e9eeeb] last:border-b-0"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#e9eeeb] animate-pulse" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-32 rounded bg-[#e9eeeb] animate-pulse" />
                    <div className="h-3 w-24 rounded bg-[#f6f8f6] animate-pulse" />
                  </div>
                </div>
                <div className="h-4 w-28 rounded bg-[#f6f8f6] animate-pulse" />
                <div className="h-4 w-20 rounded bg-[#e9eeeb] animate-pulse" />
                <div className="h-4 w-20 rounded bg-[#f6f8f6] animate-pulse" />
                <div className="h-6 w-24 rounded bg-[#faf1df] animate-pulse" />
              </div>
            ))}
          </div>
        ) : filteredAndSortedDrilldownItems.length === 0 ? (
          <div className="p-8 rounded-[12px] border border-dashed border-[#d8e3dc] bg-[#f6f8f6] text-center text-xs text-[#81908a]">
            Không có đơn hàng nào khớp với bộ lọc hiện tại trong kỳ đang chọn.
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#e9eeeb] rounded-[12px] bg-white">
            <table className="w-full text-left border-collapse min-w-[820px]">
              <thead>
                <tr className="border-b border-[#e9eeeb] bg-[#f6f8f6] text-[11px] font-bold text-[#81908a] uppercase tracking-wider h-10 select-none">
                  <th
                    data-testid="drilldown-sort-customer"
                    onClick={() => onDrilldownSort('customer')}
                    className="px-4 cursor-pointer hover:text-[#176b51] transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>Khách hàng & Liên hệ</span>
                      <span>
                        {drilldownSortKey === 'customer'
                          ? drilldownSortDir === 'asc'
                            ? '▲'
                            : '▼'
                          : '↕'}
                      </span>
                    </span>
                  </th>
                  <th
                    data-testid="drilldown-sort-order"
                    onClick={() => onDrilldownSort('order')}
                    className="px-4 cursor-pointer hover:text-[#176b51] transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>Đơn & Thiết bị</span>
                      <span>
                        {drilldownSortKey === 'order'
                          ? drilldownSortDir === 'asc'
                            ? '▲'
                            : '▼'
                          : '↕'}
                      </span>
                    </span>
                  </th>
                  <th
                    data-testid="drilldown-sort-total"
                    onClick={() => onDrilldownSort('total')}
                    className="px-4 text-right cursor-pointer hover:text-[#176b51] transition-colors"
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      <span>Tổng đơn</span>
                      <span>
                        {drilldownSortKey === 'total'
                          ? drilldownSortDir === 'asc'
                            ? '▲'
                            : '▼'
                          : '↕'}
                      </span>
                    </span>
                  </th>
                  <th
                    data-testid="drilldown-sort-collected"
                    onClick={() => onDrilldownSort('collected')}
                    className="px-4 text-right cursor-pointer hover:text-[#176b51] transition-colors"
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      <span>Thực thu</span>
                      <span>
                        {drilldownSortKey === 'collected'
                          ? drilldownSortDir === 'asc'
                            ? '▲'
                            : '▼'
                          : '↕'}
                      </span>
                    </span>
                  </th>
                  <th
                    data-testid="drilldown-sort-uncollected"
                    onClick={() => onDrilldownSort('uncollected')}
                    className="px-4 text-right cursor-pointer hover:text-[#176b51] transition-colors"
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      <span>Còn nợ chưa thu</span>
                      <span>
                        {drilldownSortKey === 'uncollected'
                          ? drilldownSortDir === 'asc'
                            ? '▲'
                            : '▼'
                          : '↕'}
                      </span>
                    </span>
                  </th>
                  <th className="px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e9eeeb] text-sm">
                {filteredAndSortedDrilldownItems.map((item, idx) => {
                  const isLoyal = Number(item.customer_orders_count || 1) > 1;
                  const normStatus = normalizeStatusCode(item.status);
                  const isHandedOver = normStatus === 'completed' || item.status === 'Hoàn tất';
                  const isReadyPickup =
                    normStatus === 'ready_for_return' || normStatus === 'waiting_pickup';
                  const statusBadgeLabel = isHandedOver
                    ? 'Đã giao máy'
                    : isReadyPickup
                    ? 'Chờ khách lấy'
                    : formatOrderStatusForReport(item.status);
                  const statusBadgeClass = isHandedOver
                    ? 'bg-[#e9f4ef] text-[#176b51]'
                    : isReadyPickup
                    ? 'bg-[#faf1df] text-[#b77a21]'
                    : 'bg-[#edf4f8] text-[#4778a4]';
                  const intakeDateLabel = formatIntakeDateForReport(item.created_at);
                  const uncollectedVal = Number(item.uncollected_amount || 0);

                  return (
                    <tr
                      key={`${item.order_code || item.id}-${idx}`}
                      className="hover:bg-[#f6f8f6] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar
                            initials={item.customer_name || 'KH'}
                            variant={(idx % 4) as any}
                            size="sm"
                          />
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <b className="text-[#17231f] font-semibold">
                                {item.customer_name || 'Khách vãng lai'}
                              </b>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  isLoyal
                                    ? 'bg-[#e9f4ef] text-[#176b51] border border-[#cde4d8]'
                                    : 'bg-[#f6f8f6] text-[#81908a]'
                                }`}
                              >
                                {isLoyal ? 'Khách quen' : 'Khách mới'}
                              </span>
                            </div>
                            <div className="text-xs font-mono text-[#81908a] mt-0.5">
                              {item.customer_phone || 'Chưa cập nhật SĐT'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenOrderDetail(
                                String(item.order_code || item.id),
                                typeof item.id === 'number' ? item.id : undefined
                              );
                            }}
                            className="font-mono font-bold text-xs text-[#176b51] hover:underline cursor-pointer"
                          >
                            {item.order_code || item.id}
                          </button>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusBadgeClass}`}
                          >
                            {statusBadgeLabel}
                          </span>
                        </div>
                        <div className="text-xs text-[#4a5c54] font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>{item.device_name || 'Thiết bị'}</span>
                          {intakeDateLabel && (
                            <span className="text-[11px] font-mono text-[#81908a]">
                              · Ngày nhận: {intakeDateLabel}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-[#17231f]">
                        {formatVND(item.total_price)}
                      </td>

                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-[#176b51]">
                        {formatVND(item.collected_amount)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {uncollectedVal > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-[8px] bg-[#fbeaea] border border-[#f5c2c2] text-[#bc5b52] font-mono tabular-nums font-extrabold text-xs">
                            {formatVND(uncollectedVal)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-[8px] bg-[#e9f4ef] text-[#176b51] font-bold text-xs">
                            Đã thu đủ (0 ₫)
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {uncollectedVal > 0 && (
                            <Button
                              variant="primary"
                              size="sm"
                              icon="payments"
                              data-testid={`drilldown-btn-collect-${item.order_code || item.id}`}
                              onClick={() => {
                                onClose();
                                onOpenCheckout(item);
                              }}
                              className="bg-[#176b51] hover:bg-[#10583f] text-white font-bold text-xs"
                            >
                              Thu tiền
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            data-testid={`drilldown-btn-customer-${item.order_code || item.id}`}
                            onClick={() => {
                              onClose();
                              onNavigateToCustomer(item.customer_phone || item.customer_name || '');
                            }}
                            className="text-xs font-semibold"
                          >
                            Hồ sơ khách
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
};
