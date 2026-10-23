'use client';

import React from 'react';
import {
  Button,
  StatusTag,
  FilterBar,
  Avatar,
  EmptyState,
  TableSkeleton,
  ErrorFallback,
  Icon,
  sanitizeInputLive,
} from '@podscare/ui';
import type { RepairOrder, OrderDateFilter } from '@podscare/types';
import { normalizeStatusCode, canCompleteTechnicalRepair } from '../fsm';

export interface RepairQueuePaneProps {
  orderTypeFilter: 'all' | 'in_store' | 'cod' | 'warranty' | 'special_parts';
  setOrderTypeFilter: (val: 'all' | 'in_store' | 'cod' | 'warranty' | 'special_parts') => void;
  orderCounts: {
    total: number;
    inStore: number;
    cod: number;
    warranty: number;
    specialParts: number;
  };
  dateType: 'created_at' | 'completed_at';
  setDateType: (val: 'created_at' | 'completed_at') => void;
  selectedDate: string;
  setSelectedDate: (val: string) => void;
  dateFilter: OrderDateFilter;
  setDateFilter: (val: OrderDateFilter) => void;
  role?: string;
  currentUserRole?: string;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  statusOptions: { value: string; label: string }[];
  statusReconciliationCounts: {
    allCount: number;
    openCount: number;
    inWorkshopCount: number;
    waitingPickupCount: number;
    completedCount: number;
  };
  search: string;
  setSearch: (val: string) => void;
  branch: string;
  branchId: string | number;
  branches: any[];
  setBranch: (name: string, id: string | number) => void;
  isRepairsLoading: boolean;
  isError: boolean;
  refetch: () => void;
  filteredOrders: RepairOrder[];
  isTechRole: boolean;
  isFulfillingSpecialPart: boolean;
  onSelectOrder: (order: RepairOrder) => void;
  onOpenIntakeModal: () => void;
  onOpenTechComplete: (order: RepairOrder) => void;
  onOpenCheckout: (order: RepairOrder) => void;
  onResumeOrder: (order: RepairOrder) => void;
  onFulfillSpecialPart: (order: RepairOrder) => void;
  moneyFormatted: (n: number) => string;
}

export const RepairQueuePane: React.FC<RepairQueuePaneProps> = ({
  orderTypeFilter,
  setOrderTypeFilter,
  orderCounts,
  dateType,
  setDateType,
  selectedDate,
  setSelectedDate,
  dateFilter,
  setDateFilter,
  role,
  currentUserRole,
  statusFilter,
  setStatusFilter,
  statusOptions,
  statusReconciliationCounts,
  search,
  setSearch,
  branch,
  branchId,
  branches,
  setBranch,
  isRepairsLoading,
  isError,
  refetch,
  filteredOrders,
  isTechRole,
  isFulfillingSpecialPart,
  onSelectOrder,
  onOpenIntakeModal,
  onOpenTechComplete,
  onOpenCheckout,
  onResumeOrder,
  onFulfillSpecialPart,
  moneyFormatted,
}) => {
  const isAdmin =
    role === 'admin' ||
    currentUserRole === 'admin' ||
    role === 'super_admin' ||
    currentUserRole === 'super_admin';

  return (
    <div className="bg-white rounded-[12px] border border-[#e9eeeb] p-5 sm:p-6 shadow-xs">
      {/* Quick Filter Tabs: Tất cả, Tại cửa hàng, Đơn COD, Đơn bảo hành, Cần mua ngoài */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e9eeeb] pb-3 mb-4">
        <button
          type="button"
          data-testid="tab-filter-all"
          onClick={() => setOrderTypeFilter('all')}
          className={`px-3.5 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            orderTypeFilter === 'all'
              ? 'bg-[#176b51] text-white shadow-sm'
              : 'bg-[#f6f8f6] text-[#4a5c54] hover:bg-[#e9f4ef]'
          }`}
        >
          <span>Tất cả đơn</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono tabular-nums ${
              orderTypeFilter === 'all' ? 'bg-white/25 text-white' : 'bg-[#e9eeeb] text-[#17231f]'
            } ${isRepairsLoading ? 'animate-pulse opacity-60' : ''}`}
          >
            {orderCounts.total}
          </span>
        </button>
        <button
          type="button"
          data-testid="tab-filter-in-store"
          onClick={() => setOrderTypeFilter('in_store')}
          className={`px-3.5 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            orderTypeFilter === 'in_store'
              ? 'bg-[#176b51] text-white shadow-sm'
              : 'bg-[#f6f8f6] text-[#4a5c54] hover:bg-[#e9f4ef]'
          }`}
        >
          <span>Tại cửa hàng</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono tabular-nums ${
              orderTypeFilter === 'in_store' ? 'bg-white/25 text-white' : 'bg-[#e9eeeb] text-[#17231f]'
            } ${isRepairsLoading ? 'animate-pulse opacity-60' : ''}`}
          >
            {orderCounts.inStore}
          </span>
        </button>
        <button
          type="button"
          data-testid="tab-filter-cod"
          onClick={() => setOrderTypeFilter('cod')}
          className={`px-3.5 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            orderTypeFilter === 'cod'
              ? 'bg-[#b77a21] text-white shadow-sm'
              : 'bg-[#faf1df] text-[#b77a21] hover:bg-[#f2deba]'
          }`}
        >
          <span>Đơn COD (Khách tỉnh)</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono tabular-nums ${
              orderTypeFilter === 'cod' ? 'bg-white/25 text-white' : 'bg-[#f2deba] text-[#78350f]'
            } ${isRepairsLoading ? 'animate-pulse opacity-60' : ''}`}
          >
            {orderCounts.cod}
          </span>
        </button>
        <button
          type="button"
          data-testid="tab-filter-warranty"
          onClick={() => setOrderTypeFilter('warranty')}
          className={`px-3.5 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            orderTypeFilter === 'warranty'
              ? 'bg-[#176b51] text-white shadow-sm'
              : 'bg-[#e9f4ef] text-[#176b51] hover:bg-[#cde4d8]'
          }`}
        >
          <span>Đơn bảo hành</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono tabular-nums ${
              orderTypeFilter === 'warranty' ? 'bg-white/25 text-white' : 'bg-[#cde4d8] text-[#176b51]'
            } ${isRepairsLoading ? 'animate-pulse opacity-60' : ''}`}
          >
            {orderCounts.warranty}
          </span>
        </button>
        <button
          type="button"
          data-testid="tab-filter-special-parts"
          onClick={() => setOrderTypeFilter('special_parts')}
          className={`px-3.5 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            orderTypeFilter === 'special_parts'
              ? 'bg-red-600 text-white shadow-sm'
              : 'bg-red-50 text-red-700 border border-red-300 font-bold hover:bg-red-100'
          }`}
        >
          <Icon name="bell" size={14} />
          <span>Cần mua ngoài</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono tabular-nums ${
              orderTypeFilter === 'special_parts'
                ? 'bg-white/25 text-white'
                : 'bg-red-100 text-red-700 border border-red-300 font-bold'
            } ${isRepairsLoading ? 'animate-pulse opacity-60' : ''}`}
          >
            {orderCounts.specialParts}
          </span>
        </button>
      </div>

      {/* Date Filter Pills (Shift Day & History Scope) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e9eeeb] pb-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-[#f6f8f6] p-0.5 rounded-[8px] border border-[#e9eeeb]">
            <button
              type="button"
              data-testid="date-type-created"
              onClick={() => setDateType('created_at')}
              className={`px-2.5 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                dateType === 'created_at'
                  ? 'bg-white text-[#176b51] shadow-xs'
                  : 'text-[#81908a] hover:text-[#17231f]'
              }`}
            >
              Theo ngày tiếp nhận
            </button>
            <button
              type="button"
              data-testid="date-type-completed"
              onClick={() => setDateType('completed_at')}
              className={`px-2.5 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                dateType === 'completed_at'
                  ? 'bg-white text-[#176b51] shadow-xs'
                  : 'text-[#81908a] hover:text-[#17231f]'
              }`}
            >
              Theo ngày hoàn tất
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-[#81908a]">Ngày:</span>
            <input
              type="date"
              data-testid="date-picker-input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-8 px-2 text-xs border border-[#d6dfda] rounded-[8px] bg-white text-[#17231f] outline-none focus:border-[#176b51]"
            />
            {selectedDate && (
              <button
                type="button"
                data-testid="clear-date-picker-btn"
                onClick={() => setSelectedDate('')}
                className="text-xs text-[#81908a] hover:text-[#bc5b52] font-semibold underline px-1 cursor-pointer"
              >
                Xóa lọc ngày
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs font-semibold text-[#81908a] mr-0.5">Ca:</span>
            {([
              { id: 'today', label: 'Hôm nay', testId: 'date-filter-today' },
              { id: 'yesterday', label: 'Hôm qua', testId: 'date-filter-yesterday' },
              { id: '7_days', label: '7 ngày qua', testId: 'date-filter-7_days' },
              { id: '30_days', label: '30 ngày qua', testId: 'date-filter-30_days' },
              { id: 'all', label: 'Toàn bộ', testId: 'date-filter-all' },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={item.testId}
                onClick={() => {
                  setSelectedDate('');
                  setDateFilter(item.id);
                }}
                className={`px-2.5 py-1 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center ${
                  !selectedDate && dateFilter === item.id
                    ? 'bg-[#176b51] text-white shadow-xs'
                    : 'bg-[#f6f8f6] text-[#4a5c54] hover:bg-[#e9f4ef]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {selectedDate ? (
          <span className="text-[11px] text-[#176b51] bg-[#e9f4ef] px-2 py-0.5 rounded-full font-medium">
            Đang lọc ngày {selectedDate} ({dateType === 'completed_at' ? 'ngày hoàn tất' : 'ngày tiếp nhận'})
          </span>
        ) : dateFilter === 'today' ? (
          <span className="text-[11px] text-[#4a5c54] bg-[#e9f4ef] px-2 py-0.5 rounded-full font-medium">
            {dateType === 'completed_at'
              ? 'Chỉ hiển thị đơn hoàn tất/bàn giao trong ngày hôm nay'
              : 'Chỉ hiển thị đơn tiếp nhận trong ngày hôm nay'}
          </span>
        ) : null}
      </div>

      {/* Admin Status Reconciliation Bar */}
      {isAdmin && (
        <div
          data-testid="admin-repairs-status-reconciliation-bar"
          className="flex flex-wrap items-center gap-2 border-b border-[#e9eeeb] pb-3 mb-4"
        >
          <span className="text-xs font-semibold text-[#81908a] mr-0.5">Đối chiếu trạng thái:</span>
          <button
            type="button"
            data-testid="status-pill-all"
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              !statusFilter
                ? 'bg-[#176b51] text-white shadow-xs'
                : 'bg-[#f6f8f6] text-[#4a5c54] hover:bg-[#e9f4ef]'
            }`}
          >
            <span>Tất cả trạng thái ({statusReconciliationCounts.allCount})</span>
          </button>
          <button
            type="button"
            data-testid="status-pill-open"
            onClick={() => setStatusFilter('Đơn đang mở')}
            className={`px-3 py-1 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'Đơn đang mở'
                ? 'bg-[#176b51] text-white shadow-xs'
                : 'bg-[#e9f4ef] text-[#176b51] border border-[#cde4d8] hover:bg-[#d8ede1]'
            }`}
          >
            <span>
              Đơn đang mở ({statusReconciliationCounts.openCount}:{' '}
              {statusReconciliationCounts.inWorkshopCount} trong xưởng ·{' '}
              {statusReconciliationCounts.waitingPickupCount} chờ nhận)
            </span>
          </button>
          <button
            type="button"
            data-testid="status-pill-in-workshop"
            onClick={() => setStatusFilter('Đang sửa trong xưởng')}
            className={`px-3 py-1 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'Đang sửa trong xưởng'
                ? 'bg-[#176b51] text-white shadow-xs'
                : 'bg-[#f6f8f6] text-[#4a5c54] hover:bg-[#e9f4ef]'
            }`}
          >
            <span>Đang sửa trong xưởng ({statusReconciliationCounts.inWorkshopCount})</span>
          </button>
          <button
            type="button"
            data-testid="status-pill-waiting-pickup"
            onClick={() => setStatusFilter('Chờ khách nhận')}
            className={`px-3 py-1 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'Chờ khách nhận'
                ? 'bg-[#176b51] text-white shadow-xs'
                : 'bg-[#f6f8f6] text-[#4a5c54] hover:bg-[#e9f4ef]'
            }`}
          >
            <span>Chờ khách nhận ({statusReconciliationCounts.waitingPickupCount})</span>
          </button>
          <button
            type="button"
            data-testid="status-pill-completed"
            onClick={() => setStatusFilter('Hoàn tất')}
            className={`px-3 py-1 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'Hoàn tất'
                ? 'bg-[#176b51] text-white shadow-xs'
                : 'bg-[#f6f8f6] text-[#4a5c54] hover:bg-[#e9f4ef]'
            }`}
          >
            <span>Hoàn tất ({statusReconciliationCounts.completedCount})</span>
          </button>
        </div>
      )}

      <FilterBar
        searchValue={search}
        onSearchChange={(val) => setSearch(sanitizeInputLive(val))}
        selectValue={statusFilter}
        onSelectChange={setStatusFilter}
        selectOptions={statusOptions}
        selectPlaceholder="Tất cả trạng thái"
        actions={
          <div className="flex items-center gap-2">
            {role === 'admin' ? (
              <select
                value={String(branchId || 'all')}
                onChange={(e) => {
                  const b = branches.find((item) => String(item.id) === e.target.value);
                  if (b) setBranch(b.name, b.id);
                }}
                className="h-9 border border-[#d6dfda] rounded-[8px] px-2.5 text-xs text-[#17231f] bg-[#f6f8f6] font-medium outline-none focus:border-[#176b51] cursor-pointer"
              >
                <option value="all">Tất cả chi nhánh</option>
                {branches
                  .filter((b) => b.id !== 'all')
                  .map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name} ({b.code})
                    </option>
                  ))}
              </select>
            ) : (
              <div className="h-9 border border-[#d6dfda] rounded-[8px] px-2.5 text-xs text-[#176b51] bg-[#e9f4ef] font-semibold flex items-center gap-1.5 cursor-default select-none pointer-events-none">
                <Icon name="building" size={14} className="text-[#176b51]" />
                <span>{branch}</span>
              </div>
            )}
            <Button
              variant="secondary"
              size="sm"
              icon="refresh"
              disabled={isRepairsLoading}
              onClick={() => refetch()}
            >
              {isRepairsLoading ? 'Đang tải...' : 'Làm mới'}
            </Button>
          </div>
        }
      />

      {/* 4-Layer Resilient UI States */}
      {isError ? (
        <ErrorFallback onRetry={() => refetch()} />
      ) : isRepairsLoading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title={`Không tìm thấy đơn sửa chữa nào tại ${
            branchId === 'all' ? 'toàn bộ chi nhánh' : branch
          }`}
          description={
            role === 'admin'
              ? 'Thử thay đổi bộ lọc tìm kiếm hoặc chuyển sang chi nhánh khác để kiểm tra.'
              : 'Không có đơn sửa chữa nào trong danh mục hoặc tìm kiếm hiện tại.'
          }
          actionLabel={
            role === 'admin' && branchId !== 'all'
              ? 'Xem tất cả chi nhánh'
              : 'Tạo phiếu tiếp nhận mới'
          }
          onAction={() => {
            if (role === 'admin' && branchId !== 'all') {
              setBranch('Tất cả chi nhánh', 'all');
            } else {
              onOpenIntakeModal();
            }
          }}
        />
      ) : (
        <div className="overflow-x-auto -mx-5 sm:mx-0">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead>
              <tr className="border-y border-[#e9eeeb] bg-[#f6f8f6] text-xs font-bold text-[#81908a] uppercase tracking-wider h-10">
                <th className="px-3 py-2 text-center w-12 text-xs font-bold text-[#81908a] uppercase tracking-wider">
                  STT
                </th>
                <th className="px-4">Mã đơn</th>
                <th className="px-4">Khách hàng</th>
                <th className="px-4">Thiết bị & lỗi</th>
                <th className="px-4">Trạng thái</th>
                {!isTechRole && <th className="px-4">Chi phí</th>}
                <th className="px-4">Kỹ thuật viên</th>
                <th className="px-4">Ngày nhận & Kho</th>
                <th className="px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e9eeeb] text-sm text-[#17231f]">
              {filteredOrders.map((o, idx) => (
                <tr
                  key={o.id}
                  onClick={() => onSelectOrder(o)}
                  className="h-14 hover:bg-[#f6f8f6] cursor-pointer transition-colors"
                >
                  <td
                    data-testid="order-row-stt"
                    className="px-3 py-3 text-center text-xs font-semibold text-[#81908a] font-mono tabular-nums"
                  >
                    {filteredOrders.length - idx}
                  </td>
                  <td className="px-4">
                    <div className="font-mono font-bold text-[#176b51]">{o.id}</div>
                    <div className="mt-1">
                      {o.order_type === 'warranty' || o.orderType === 'warranty' ? (
                        <span
                          data-testid="badge-order-type-warranty"
                          className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#176b51] bg-[#e9f4ef] px-1.5 py-0.5 rounded border border-[#cde4d8]"
                        >
                          Bảo hành
                        </span>
                      ) : o.order_type === 'cod' || o.orderType === 'cod' ? (
                        <span
                          data-testid="badge-order-type-cod"
                          className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#b77a21] bg-[#faf1df] px-1.5 py-0.5 rounded border border-[#f2deba]"
                        >
                          Đơn COD
                        </span>
                      ) : (
                        <span
                          data-testid="badge-order-type-in-store"
                          className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#176b51] bg-[#e9f4ef] px-1.5 py-0.5 rounded border border-[#cde4d8]"
                        >
                          Tại quầy
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar initials={o.name} variant={(idx % 4) as any} size="sm" />
                      <div>
                        <b className="block text-[#17231f] font-semibold">{o.name}</b>
                        <small className="block text-[#81908a] text-xs font-mono">{o.phone}</small>
                      </div>
                    </div>
                  </td>
                  <td className="px-4">
                    <span className="font-semibold text-[#17231f] block">{o.device}</span>
                    <small className="text-[#81908a] text-xs block truncate max-w-[220px]">
                      {o.issue}
                    </small>
                  </td>
                  <td className="px-4">
                    <div className="space-y-1">
                      <StatusTag label={o.status} type={o.statusType} />
                      {o.special_parts_status === 'pending' || o.specialPartsStatus === 'pending' ? (
                        <div
                          data-testid={`badge-special-part-pending-${o.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-300 max-w-[210px] truncate shadow-2xs"
                          title={`Linh kiện cần mua ngoài: ${
                            o.special_parts_needed || o.specialPartsNeeded || 'Chưa cập nhật'
                          }`}
                        >
                          <Icon name="bell" size={12} className="text-red-600 flex-none" />
                          <span className="truncate">
                            Cần mua ngoài: {o.special_parts_needed || o.specialPartsNeeded || 'Cần tìm mua'}
                          </span>
                        </div>
                      ) : o.special_parts_status === 'purchased' || o.specialPartsStatus === 'purchased' ? (
                        <div
                          data-testid={`badge-special-part-purchased-${o.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#176b51] bg-[#e9f4ef] px-2 py-0.5 rounded border border-[#cde4d8] max-w-[210px] truncate"
                          title="Quầy đã mua xong linh kiện"
                        >
                          <Icon name="check" size={12} className="text-[#176b51]" />
                          <span className="truncate">Đã mua linh kiện</span>
                        </div>
                      ) : o.parts_needed || o.partsNeeded || normalizeStatusCode(o.status) === 'waiting_parts' ? (
                        <div
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b77a21] bg-[#faf1df] px-2 py-0.5 rounded border border-[#f2deba] max-w-[190px] truncate"
                          title={`Linh kiện yêu cầu: ${o.parts_needed || o.partsNeeded || 'Chưa cập nhật'}`}
                        >
                          <Icon name="package" size={12} />
                          <span className="truncate">
                            Cần: {o.parts_needed || o.partsNeeded || 'Chờ linh kiện'}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </td>
                  {!isTechRole && (
                    <td className="px-4 font-semibold text-[#17231f] font-mono tabular-nums">
                      {moneyFormatted(o.price)}
                    </td>
                  )}
                  <td className="px-4 text-[#4a5c54]">{o.tech}</td>
                  <td className="px-4 text-[#81908a]">
                    <span className="block font-medium font-mono tabular-nums">{o.date}</span>
                    <span className="inline-block mt-0.5 text-xs font-mono font-bold text-[#176b51] bg-[#e9f4ef] px-1.5 py-0.5 rounded">
                      {o.branchName || o.branch}
                    </span>
                  </td>
                  <td className="px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {canCompleteTechnicalRepair(o.status, role || currentUserRole) && (
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`row-tech-complete-btn-${o.id}`}
                          className="text-xs bg-[#e9f4ef] text-[#176b51] border-[#cde4d8] hover:bg-[#d8ede1] font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenTechComplete(o);
                          }}
                        >
                          <Icon name="check" size={12} />
                          <span>Hoàn thành sửa chữa</span>
                        </Button>
                      )}

                      {['ready_for_return', 'waiting_pickup', 'in_repair', 'waiting_qc'].includes(
                        normalizeStatusCode(o.status)
                      ) ? (
                        <Button
                          variant="primary"
                          size="sm"
                          data-testid={`row-checkout-btn-${o.id}`}
                          className="bg-[#176b51] hover:bg-[#10583f] text-white font-bold text-xs px-2.5 py-1 flex items-center gap-1 shadow-xs whitespace-nowrap cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenCheckout(o);
                          }}
                        >
                          <Icon name="payments" size={12} />
                          <span>Thanh toán</span>
                        </Button>
                      ) : normalizeStatusCode(o.status) === 'completed' ? (
                        <span
                          data-testid={`row-paid-badge-${o.id}`}
                          className="text-[11px] font-semibold text-[#81908a] bg-[#f6f8f6] px-2 py-0.5 rounded border border-[#e9eeeb] whitespace-nowrap"
                        >
                          Đã thu
                        </span>
                      ) : null}

                      {normalizeStatusCode(o.status) === 'waiting_parts' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs bg-[#e9f4ef] text-[#176b51] border-[#cde4d8] hover:bg-[#d8ede1] font-bold whitespace-nowrap"
                          onClick={(e) => {
                            e.stopPropagation();
                            onResumeOrder(o);
                          }}
                        >
                          Đã có linh kiện
                        </Button>
                      )}

                      {(o.special_parts_status === 'pending' || o.specialPartsStatus === 'pending') && (
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`row-fulfill-special-part-btn-${o.id}`}
                          disabled={isFulfillingSpecialPart}
                          className="text-xs bg-[#faf1df] text-[#b77a21] border-[#f2deba] hover:bg-[#f2deba] font-bold whitespace-nowrap"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFulfillSpecialPart(o);
                          }}
                        >
                          Đã mua linh kiện
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`row-action-btn-${o.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectOrder(o);
                        }}
                      >
                        ···
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
