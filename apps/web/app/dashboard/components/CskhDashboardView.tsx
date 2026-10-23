'use client';

import React from 'react';
import {
  Button,
  StatCard,
  StatusTag,
  Icon,
  Modal,
} from '@podscare/ui';
import type { RepairOrder } from '@podscare/types';
import { normalizeStatusCode } from '../../repairs/fsm';

export interface CskhDashboardViewProps {
  currentUser?: any;
  todayOrdersCount: number;
  branchOrdersCount: number;
  cskhReadyOrders: RepairOrder[];
  repairingCount: number;
  cskhPendingOrders: RepairOrder[];
  cskhPendingModalOpen: boolean;
  setCskhPendingModalOpen: (open: boolean) => void;
  onOpenWarrantyIntake: () => void;
  onOpenRegularIntake: () => void;
  onOpenCheckout: (order: RepairOrder) => void;
  onNavigateToRepairs: () => void;
  moneyFormatted: (n: number) => string;
}

export const CskhDashboardView: React.FC<CskhDashboardViewProps> = ({
  currentUser,
  todayOrdersCount,
  branchOrdersCount,
  cskhReadyOrders,
  repairingCount,
  cskhPendingOrders,
  cskhPendingModalOpen,
  setCskhPendingModalOpen,
  onOpenWarrantyIntake,
  onOpenRegularIntake,
  onOpenCheckout,
  onNavigateToRepairs,
  moneyFormatted,
}) => {
  const getCskhNextAction = (o: RepairOrder) => {
    switch (o.status) {
      case 'Cần sửa lại':
        return 'Theo dõi kỹ thuật sửa lại';
      case 'Sẵn sàng trả':
      case 'Chờ khách nhận':
        return 'Thu tiền & Bàn giao máy cho khách';
      case 'Chờ QC':
        return 'Theo dõi kết quả kiểm định QC';
      case 'Chờ kỹ thuật':
        return 'Theo dõi nhận đơn kỹ thuật';
      case 'Đang sửa':
        return 'Cập nhật tiến độ cho khách';
      default:
        return 'Mở phiếu để xử lý';
    }
  };

  return (
    <div className="space-y-6">
      {/* Head */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-[#81908a] uppercase tracking-[1.05px] mb-1">
            CSKH · WORKSPACE
          </div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#17231f] m-0">
            Chào buổi sáng, {currentUser?.name || 'Nhân viên'}
          </h1>
          <p className="text-sm text-[#81908a] mt-1 mb-0">
            Bảng công việc CSKH · Tập trung tiếp nhận, trả máy và chăm sóc khách hàng.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="md"
            icon="shield"
            data-testid="cskh-warranty-intake-btn"
            onClick={onOpenWarrantyIntake}
            className="bg-[#e9f4ef] text-[#176b51] border-[#cde4d8] hover:bg-[#d8ede1] font-bold"
          >
            Tiếp nhận bảo hành
          </Button>
          <Button variant="primary" size="md" icon="plus" onClick={onOpenRegularIntake}>
            Tiếp nhận khách mới
          </Button>
        </div>
      </div>

      {/* CSKH Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <StatCard
          label="Tiếp nhận hôm nay"
          value={String(todayOrdersCount).padStart(2, '0')}
          icon="plus"
          foot={`${branchOrdersCount} đơn tại chi nhánh`}
        />
        <StatCard
          label="Máy sẵn sàng trả"
          value={String(cskhReadyOrders.length).padStart(2, '0')}
          icon="check"
          foot="Sẵn sàng thu tiền & bàn giao"
        />
        <StatCard
          label="Cần cập nhật tiến độ"
          value={String(repairingCount).padStart(2, '0')}
          icon="arrow"
          foot="Đơn đang trong ca sửa"
        />
        <StatCard
          label="Máy chưa hoàn tất"
          value={String(cskhPendingOrders.length)}
          icon="alert"
          foot="Bấm để mở danh sách"
          trend="down"
          onClick={() => setCskhPendingModalOpen(true)}
        />
      </div>

      {/* Panel: "Máy sẵn sàng trả" */}
      <div
        data-testid="cskh-ready-orders-panel"
        className="bg-white rounded-[12px] border border-[#cde4d8] p-5 sm:p-6 shadow-xs"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-heading font-bold text-base text-[#176b51] m-0 flex items-center gap-2">
              <Icon name="check" size={18} className="text-[#176b51]" />
              <span>Máy sẵn sàng trả ({cskhReadyOrders.length})</span>
            </h3>
            <p className="text-xs text-[#81908a] mt-0.5 mb-0">
              Thiết bị đã sửa xong & kiểm định đạt, sẵn sàng thu tiền và bàn giao cho khách hàng.
            </p>
          </div>
          <span className="text-xs font-bold text-[#176b51] bg-[#e9f4ef] px-3 py-1 rounded-[10px]">
            {cskhReadyOrders.length} máy chờ giao
          </span>
        </div>

        {cskhReadyOrders.length === 0 ? (
          <div className="p-4 rounded-[10px] bg-[#f6f8f6] border border-dashed border-[#d8e3dc] text-center text-xs text-[#81908a]">
            Hiện không có thiết bị nào đang chờ bàn giao cho khách.
          </div>
        ) : (
          <div className="divide-y divide-[#e9eeeb]">
            {cskhReadyOrders.map((o) => (
              <div
                key={o.id}
                className="py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-[#f6f8f6] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[10px] bg-[#e9f4ef] text-[#176b51] grid place-items-center flex-none">
                    <Icon name="headphones" size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <b className="text-sm text-[#17231f]">{o.device}</b>
                      <span className="font-mono text-xs text-[#176b51] font-bold">{o.id}</span>
                    </div>
                    <div className="text-xs text-[#81908a] mt-0.5">
                      {o.name} ({o.phone}) ·{' '}
                      <span className="text-[#176b51] font-bold font-mono tabular-nums">
                        {moneyFormatted(o.total_price ?? o.price)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <StatusTag label={o.status} type={o.statusType} />
                  <Button
                    variant="primary"
                    size="sm"
                    icon="payments"
                    data-testid={`cskh-btn-checkout-${o.id}`}
                    onClick={() => onOpenCheckout(o)}
                    className="bg-[#176b51] hover:bg-[#10583f] text-white font-bold text-xs shadow-xs"
                  >
                    Thu tiền & Trả máy
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Panel: "Máy còn cần xử lý hôm nay" */}
      <div className="bg-white rounded-[12px] border border-[#e9eeeb] p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-heading font-bold text-base text-[#17231f] m-0">
              Máy còn cần xử lý hôm nay
            </h3>
            <p className="text-xs text-[#81908a] mt-0.5 mb-0">
              Các phiếu chưa hoàn tất, xếp theo thứ tự ưu tiên việc cần làm tiếp theo.
            </p>
          </div>
          <span className="text-xs font-bold text-[#176b51] bg-[#e9f4ef] px-3 py-1 rounded-[10px]">
            {cskhPendingOrders.length} máy
          </span>
        </div>

        <div className="divide-y divide-[#e9eeeb]">
          {cskhPendingOrders.slice(0, 6).map((o) => {
            const isReadyToReturn =
              normalizeStatusCode(o.status) === 'ready_for_return' ||
              normalizeStatusCode(o.status) === 'waiting_pickup' ||
              normalizeStatusCode(o.status) === 'waiting_qc' ||
              o.status === 'Sẵn sàng trả' ||
              o.status === 'Chờ khách nhận' ||
              o.status === 'Chờ QC';

            return (
              <div
                key={o.id}
                onClick={onNavigateToRepairs}
                className="py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-[#f6f8f6] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[10px] bg-[#e9f4ef] text-[#176b51] grid place-items-center flex-none">
                    <Icon name="headphones" size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <b className="text-sm text-[#17231f]">{o.device}</b>
                      <span className="font-mono text-xs text-[#176b51] font-bold">{o.id}</span>
                    </div>
                    <div className="text-xs text-[#81908a] mt-0.5">
                      {o.name} · <span className="text-[#4a5c54]">{o.issue}</span>
                    </div>
                    <div className="text-xs text-[#176b51] font-semibold mt-1">
                      Việc tiếp theo: <b>{getCskhNextAction(o)}</b>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <StatusTag label={o.status} type={o.statusType} />
                  {isReadyToReturn && (
                    <Button
                      variant="primary"
                      size="sm"
                      icon="payments"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCheckout(o);
                      }}
                      className="bg-[#176b51] hover:bg-[#10583f] text-white font-bold text-xs"
                    >
                      Thu tiền & Trả máy
                    </Button>
                  )}
                  <Button variant="secondary" size="sm">
                    Mở phiếu ↗
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CSKH Pending Modal */}
      <Modal
        isOpen={cskhPendingModalOpen}
        onClose={() => setCskhPendingModalOpen(false)}
        maxWidth="lg"
        eyebrow="CSKH · THEO DÕI TIẾN ĐỘ"
        title="Danh sách máy chưa hoàn tất hôm nay"
        subtitle={`${cskhPendingOrders.length} phiếu đang cần theo dõi tiến độ.`}
        footer={
          <div className="flex justify-end gap-2.5 w-full">
            <Button variant="secondary" size="md" onClick={() => setCskhPendingModalOpen(false)}>
              Đóng
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setCskhPendingModalOpen(false);
                onNavigateToRepairs();
              }}
            >
              Mở danh sách đơn ↗
            </Button>
          </div>
        }
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {cskhPendingOrders.map((o) => {
            const isReadyToReturn =
              normalizeStatusCode(o.status) === 'ready_for_return' ||
              normalizeStatusCode(o.status) === 'waiting_pickup' ||
              normalizeStatusCode(o.status) === 'waiting_qc' ||
              o.status === 'Sẵn sàng trả' ||
              o.status === 'Chờ khách nhận' ||
              o.status === 'Chờ QC';

            return (
              <div
                key={o.id}
                className="p-3.5 bg-white rounded-[10px] border border-[#e9eeeb] flex flex-col gap-2"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2.5">
                    <b className="text-sm text-[#17231f]">{o.device}</b>
                    <span className="font-mono text-xs text-[#176b51] font-bold">{o.id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusTag label={o.status} type={o.statusType} />
                    {isReadyToReturn && (
                      <Button
                        variant="primary"
                        size="sm"
                        icon="payments"
                        onClick={() => {
                          setCskhPendingModalOpen(false);
                          onOpenCheckout(o);
                        }}
                        className="bg-[#176b51] hover:bg-[#10583f] text-white font-bold text-xs"
                      >
                        Thu tiền & Trả máy
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-[#4a5c54]">
                  <div>
                    <span className="text-[#81908a] block">Chủ máy:</span>
                    <b>
                      {o.name} · {o.phone}
                    </b>
                  </div>
                  <div>
                    <span className="text-[#81908a] block">Kỹ thuật viên giữ máy:</span>
                    <b className={o.tech !== 'Chưa phân công' ? 'text-[#176b51]' : 'text-[#b77a21]'}>
                      {o.tech}
                    </b>
                  </div>
                </div>
                <div className="text-xs text-[#176b51] pt-1.5 border-t border-[#e9eeeb]">
                  Việc tiếp theo: <b>{getCskhNextAction(o)}</b>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
};
