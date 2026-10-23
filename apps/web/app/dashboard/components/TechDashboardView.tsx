'use client';

import React from 'react';
import {
  Button,
  StatCard,
  StatusTag,
  EmptyState,
} from '@podscare/ui';
import type { RepairOrder } from '@podscare/types';
import { normalizeStatusCode } from '../../repairs/fsm';

export interface TechDashboardViewProps {
  branchId: string | number;
  branch?: string;
  currentUser?: any;
  techTab: 'my_orders' | 'available' | 'completed';
  setTechTab: (tab: 'my_orders' | 'available' | 'completed') => void;
  techActiveOrders: RepairOrder[];
  techAvailableOrders: RepairOrder[];
  techCompletedOrders: RepairOrder[];
  isSilentPrinting: boolean;
  isTechSubmitting: boolean;
  onNavigateToTech: () => void;
  onPrintRoutingSlip: (order: RepairOrder) => void;
  onResumeRepair: (order: RepairOrder) => void;
  onPauseWaitingParts: (order: RepairOrder) => void;
  onOpenTechModal: (order: RepairOrder) => void;
  onGrabTechOrder: (order: RepairOrder) => void;
}

export const TechDashboardView: React.FC<TechDashboardViewProps> = ({
  branchId,
  branch,
  currentUser,
  techTab,
  setTechTab,
  techActiveOrders,
  techAvailableOrders,
  techCompletedOrders,
  isSilentPrinting,
  isTechSubmitting,
  onNavigateToTech,
  onPrintRoutingSlip,
  onResumeRepair,
  onPauseWaitingParts,
  onOpenTechModal,
  onGrabTechOrder,
}) => {
  return (
    <div className="space-y-6">
      {/* Head */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-[#81908a] uppercase tracking-[1.05px] mb-1 flex items-center gap-2">
            <span>TECHNICIAN OS</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#176b51]" />
            <span className="text-[#176b51] font-bold">
              {branchId === 'all' ? 'Toàn bộ chi nhánh' : branch || currentUser?.branch}
            </span>
          </div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#17231f] m-0">
            Không gian kỹ thuật
          </h1>
          <p className="text-sm text-[#81908a] mt-1 mb-0">
            Xin chào {currentUser?.name || 'Kỹ thuật viên'} · Tiếp nhận, sửa chữa và nghiệm thu hoàn thành bàn giao quầy CSKH.
          </p>
        </div>
        <Button variant="primary" size="md" icon="wrench" onClick={onNavigateToTech}>
          Mở toàn bộ hàng đợi Kỹ Thuật ↗
        </Button>
      </div>

      {/* Tech Stats (Clickable KPI Filter Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <StatCard
          label="Đơn đang phụ trách"
          value={String(techActiveOrders.length).padStart(2, '0')}
          icon="wrench"
          foot="Trong ca hiện tại"
          onClick={() => setTechTab('my_orders')}
          className={`cursor-pointer transition-all ${
            techTab === 'my_orders'
              ? 'border-[#176b51] ring-2 ring-[#176b51]/20 bg-[#f6f8f6]'
              : 'hover:border-[#b4d6c4]'
          }`}
        />
        <StatCard
          label="Đơn chờ nhận"
          value={String(techAvailableOrders.length).padStart(2, '0')}
          icon="plus"
          foot="Có phiếu CSKH kèm theo"
          onClick={() => setTechTab('available')}
          className={`cursor-pointer transition-all ${
            techTab === 'available'
              ? 'border-[#176b51] ring-2 ring-[#176b51]/20 bg-[#f6f8f6]'
              : 'hover:border-[#b4d6c4]'
          }`}
        />
        <StatCard
          label="Đang sửa chữa"
          value={String(
            techActiveOrders.filter(
              (o) => normalizeStatusCode(o.status) === 'in_repair' || o.status === 'Đang sửa'
            ).length
          ).padStart(2, '0')}
          icon="clock"
          foot="Cập nhật theo phiếu"
          onClick={() => setTechTab('my_orders')}
          className={`cursor-pointer transition-all ${
            techTab === 'my_orders'
              ? 'border-[#176b51] ring-2 ring-[#176b51]/20 bg-[#f6f8f6]'
              : 'hover:border-[#b4d6c4]'
          }`}
        />
        <StatCard
          label="Đã sửa xong hôm nay"
          value={String(techCompletedOrders.length).padStart(2, '0')}
          icon="check"
          foot="Sẵn sàng bàn giao CSKH"
          onClick={() => setTechTab('completed')}
          className={`cursor-pointer transition-all ${
            techTab === 'completed'
              ? 'border-[#176b51] ring-2 ring-[#176b51]/20 bg-[#f6f8f6]'
              : 'hover:border-[#b4d6c4]'
          }`}
        />
      </div>

      {/* 3 Tab Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-[#e9eeeb] pb-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setTechTab('my_orders')}
          className={`px-4 py-2.5 rounded-[8px] font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer ${
            techTab === 'my_orders'
              ? 'bg-[#176b51] text-white shadow-xs'
              : 'bg-white text-[#4a5c54] hover:bg-[#f6f8f6] border border-[#e9eeeb]'
          }`}
        >
          <span>Đơn của tôi</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold font-mono tabular-nums ${
              techTab === 'my_orders' ? 'bg-white/20 text-white' : 'bg-[#e9f4ef] text-[#176b51]'
            }`}
          >
            {techActiveOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTechTab('available')}
          className={`px-4 py-2.5 rounded-[8px] font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer ${
            techTab === 'available'
              ? 'bg-[#176b51] text-white shadow-xs'
              : 'bg-white text-[#4a5c54] hover:bg-[#f6f8f6] border border-[#e9eeeb]'
          }`}
        >
          <span>Đơn chờ nhận</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold font-mono tabular-nums ${
              techTab === 'available' ? 'bg-white/20 text-white' : 'bg-[#e9f4ef] text-[#176b51]'
            }`}
          >
            {techAvailableOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTechTab('completed')}
          className={`px-4 py-2.5 rounded-[8px] font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer ${
            techTab === 'completed'
              ? 'bg-[#176b51] text-white shadow-xs'
              : 'bg-white text-[#4a5c54] hover:bg-[#f6f8f6] border border-[#e9eeeb]'
          }`}
        >
          <span>Đã sửa xong</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold font-mono tabular-nums ${
              techTab === 'completed' ? 'bg-white/20 text-white' : 'bg-[#e9f4ef] text-[#176b51]'
            }`}
          >
            {techCompletedOrders.length}
          </span>
        </button>
      </div>

      {/* Tab Content Display */}
      {techTab === 'my_orders' && (
        <div className="bg-white rounded-[12px] border border-[#e9eeeb] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-bold text-base text-[#17231f] m-0">
                Đơn máy tôi đang phụ trách ({techActiveOrders.length})
              </h3>
              <p className="text-xs text-[#81908a] mt-0.5 mb-0">
                Danh sách thiết bị bạn đã nhận vào bàn sửa. Bấm vào đơn hoặc nút [Chi tiết & Nghiệm thu] để mở form hoàn tất.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={onNavigateToTech}>
              Xem trên bàn kỹ thuật ↗
            </Button>
          </div>

          {techActiveOrders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {techActiveOrders.map((order) => {
                const code = normalizeStatusCode(order.status);
                const isWaitingParts = code === 'waiting_parts';

                return (
                  <article
                    key={order.id}
                    className="bg-white border border-[#e9eeeb] hover:border-[#176b51] rounded-[12px] p-5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
                    onClick={() => onOpenTechModal(order)}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-sm text-[#176b51] bg-[#e9f4ef] px-2.5 py-1 rounded-[6px]">
                          {order.id}
                        </span>
                        <StatusTag label={order.status} type={order.statusType} />
                      </div>

                      <div>
                        <h4 className="font-heading font-bold text-base text-[#17231f] m-0 group-hover:text-[#176b51] transition-colors">
                          {order.device}
                        </h4>
                        {order.serial && order.serial !== 'Chưa cập nhật' && (
                          <span className="text-xs font-mono text-[#81908a] block mt-0.5">
                            SN: {order.serial}
                          </span>
                        )}
                      </div>

                      <div className="bg-[#f6f8f6] border border-[#e9eeeb] rounded-[8px] p-3 text-xs text-[#17231f] leading-relaxed">
                        <span className="font-bold text-[#81908a] block mb-0.5">Lỗi khách báo:</span>
                        {order.issue}
                      </div>

                      <div className="space-y-1 text-xs text-[#4a5c54]">
                        <div className="flex items-center justify-between">
                          <span className="text-[#81908a]">Khách hàng:</span>
                          <b className="text-[#17231f]">
                            {order.name} ({order.phone})
                          </b>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#81908a]">Chi nhánh:</span>
                          <span>{order.branch || order.branchName}</span>
                        </div>
                      </div>
                    </div>

                    <div
                      className="pt-4 mt-3 border-t border-[#e9eeeb] flex flex-wrap gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        icon="printer"
                        disabled={isSilentPrinting}
                        onClick={() => onPrintRoutingSlip(order)}
                        className="px-2.5 text-xs text-[#176b51] border-[#cde4d8] hover:bg-[#e9f4ef]"
                        title="In nhanh tem dán khay K80"
                      >
                        Tem
                      </Button>

                      {isWaitingParts ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onResumeRepair(order)}
                          className="text-xs font-semibold"
                        >
                          Tiếp tục
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onPauseWaitingParts(order)}
                          className="text-xs text-[#81908a] border-[#d6dfda]"
                          title="Tạm dừng chờ linh kiện"
                        >
                          Linh kiện
                        </Button>
                      )}

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onOpenTechModal(order)}
                        className="text-xs font-semibold"
                      >
                        Chi tiết
                      </Button>

                      <Button
                        variant="primary"
                        size="sm"
                        icon="check"
                        onClick={() => onOpenTechModal(order)}
                        className="flex-1 text-xs font-bold bg-[#176b51] hover:bg-[#10583f] text-white shadow-xs cursor-pointer"
                      >
                        Hoàn thành
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="py-8">
              <EmptyState
                title="Hiện chưa có đơn nào đang phụ trách"
                description="Bạn chưa nhận máy nào vào bàn sửa chữa trong ca này. Hãy chuyển sang Tab 'Đơn chờ nhận' để tiếp nhận máy từ quầy tiếp tân."
                icon="wrench"
                actionLabel={`Xem đơn chờ nhận ngay (${techAvailableOrders.length})`}
                onAction={() => setTechTab('available')}
              />
            </div>
          )}
        </div>
      )}

      {techTab === 'available' && (
        <div className="bg-white rounded-[12px] border border-[#e9eeeb] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#176b51] opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#176b51]" />
              </span>
              <div>
                <h3 className="font-heading font-bold text-base text-[#17231f] m-0">
                  Đơn mới sẵn sàng nhận ({techAvailableOrders.length})
                </h3>
                <p className="text-xs text-[#81908a] mt-0.5 mb-0">
                  Đơn tiếp nhận tại quầy chưa có KTV phụ trách. Bấm [Nhận đơn →] để đưa ngay vào bàn sửa chữa của bạn.
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={onNavigateToTech}>
              Xem tất cả ↗
            </Button>
          </div>

          {techAvailableOrders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {techAvailableOrders.map((order) => (
                <article
                  key={order.id}
                  className="bg-white border-2 border-[#176b51]/20 hover:border-[#176b51] rounded-[12px] p-5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-sm text-[#176b51] bg-[#e9f4ef] px-2.5 py-1 rounded-[6px]">
                        {order.id}
                      </span>
                      <StatusTag label={order.status} type={order.statusType} />
                    </div>

                    <div>
                      <h4 className="font-heading font-bold text-base text-[#17231f] m-0">
                        {order.device}
                      </h4>
                      {order.serial && order.serial !== 'Chưa cập nhật' && (
                        <span className="text-xs font-mono text-[#81908a] block mt-0.5">
                          SN: {order.serial}
                        </span>
                      )}
                    </div>

                    <div className="bg-[#f6f8f6] border border-[#e9eeeb] rounded-[8px] p-3 text-xs text-[#17231f] leading-relaxed">
                      <span className="font-bold text-[#176b51] block mb-0.5">Mô tả lỗi khách báo:</span>
                      {order.issue}
                    </div>

                    <div className="space-y-1 text-xs text-[#4a5c54]">
                      <div className="flex items-center justify-between">
                        <span className="text-[#81908a]">Khách hàng:</span>
                        <b className="text-[#17231f]">
                          {order.name} ({order.phone})
                        </b>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#81908a]">Tiếp nhận lúc:</span>
                        <span>{order.date}</span>
                      </div>
                      {order.accessories && order.accessories !== 'Không gửi kèm' && (
                        <div className="flex items-center justify-between">
                          <span className="text-[#81908a]">Phụ kiện:</span>
                          <span className="truncate max-w-[170px]">{order.accessories}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 mt-3 border-t border-[#e9eeeb] flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onOpenTechModal(order)}
                      className="px-3 text-xs font-semibold"
                    >
                      Xem chi tiết
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={isTechSubmitting}
                      onClick={() => onGrabTechOrder(order)}
                      className="flex-1 font-bold text-xs bg-[#176b51] hover:bg-[#10583f] text-white shadow-xs"
                    >
                      Nhận đơn →
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="py-8">
              <EmptyState
                title="Hiện không có đơn mới chờ nhận"
                description="Tất cả thiết bị tại quầy đã được phân công hoặc đã có KTV tiếp nhận. Khi có đơn mới tại chi nhánh, danh sách sẽ tự động đồng bộ."
                icon="check"
              />
            </div>
          )}
        </div>
      )}

      {techTab === 'completed' && (
        <div className="bg-white rounded-[12px] border border-[#e9eeeb] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-bold text-base text-[#17231f] m-0">
                Đã sửa xong trong ca hôm nay ({techCompletedOrders.length})
              </h3>
              <p className="text-xs text-[#81908a] mt-0.5 mb-0">
                Các thiết bị đã hoàn tất sửa chữa, sẵn sàng bàn giao quầy CSKH trả máy cho khách hoặc thẩm định QC.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={onNavigateToTech}>
              Mở toàn bộ ↗
            </Button>
          </div>

          {techCompletedOrders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {techCompletedOrders.map((order) => (
                <article
                  key={order.id}
                  className="bg-white border border-[#e9eeeb] rounded-[12px] p-5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-sm text-[#176b51] bg-[#e9f4ef] px-2.5 py-1 rounded-[6px]">
                        {order.id}
                      </span>
                      <StatusTag label={order.status} type={order.statusType} />
                    </div>

                    <div>
                      <h4 className="font-heading font-bold text-base text-[#17231f] m-0">
                        {order.device}
                      </h4>
                      {order.serial && order.serial !== 'Chưa cập nhật' && (
                        <span className="text-xs font-mono text-[#81908a] block mt-0.5">
                          SN: {order.serial}
                        </span>
                      )}
                    </div>

                    <div className="bg-[#e9f4ef] border border-[#cde4d8] rounded-[8px] p-3 text-xs text-[#176b51] leading-relaxed">
                      <span className="font-bold text-[#176b51] block mb-0.5">Nghiệm thu hoàn tất:</span>
                      {order.repairNote || 'Đã sửa chữa và kiểm tra hoàn chỉnh theo tiêu chuẩn xuất xưởng.'}
                    </div>

                    <div className="space-y-1 text-xs text-[#4a5c54]">
                      <div className="flex items-center justify-between">
                        <span className="text-[#81908a]">Khách hàng:</span>
                        <b className="text-[#17231f]">
                          {order.name} ({order.phone})
                        </b>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-3 border-t border-[#e9eeeb] flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      icon="printer"
                      disabled={isSilentPrinting}
                      onClick={() => onPrintRoutingSlip(order)}
                      className="px-2.5 text-xs text-[#176b51] border-[#cde4d8] hover:bg-[#e9f4ef]"
                    >
                      In tem K80
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onOpenTechModal(order)}
                      className="flex-1 text-xs font-semibold"
                    >
                      Xem chi tiết & Nghiệm thu
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="py-8">
              <EmptyState
                title="Chưa có đơn nào hoàn tất hôm nay"
                description="Sau khi sửa xong thiết bị từ tab 'Đơn của tôi' và bấm Hoàn tất sửa chữa, danh sách sẽ được lưu vết tại đây."
                icon="check"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
