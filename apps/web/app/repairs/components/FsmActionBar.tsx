'use client';

import React from 'react';
import { Button } from '@podscare/ui';
import type { RepairOrder } from '@podscare/types';
import {
  normalizeStatusCode,
  getQuickActionsForStatus,
  isTechnicalStageStatus,
  canCompleteTechnicalRepair,
} from '../fsm';

export interface FsmActionBarProps {
  order: RepairOrder;
  role?: string;
  isTransitioning: boolean;
  onUpdateStatus: (nextStatus: string, nextType: any, targetStatus?: string) => void;
  onQuickTechComplete: (order: RepairOrder) => void;
  onQuickCheckout: () => void;
  onOpenQc: (orderId: string) => void;
}

export const FsmActionBar: React.FC<FsmActionBarProps> = ({
  order,
  role,
  isTransitioning,
  onUpdateStatus,
  onQuickTechComplete,
  onQuickCheckout,
  onOpenQc,
}) => {
  const currentStatusCode = normalizeStatusCode(order.status);
  const isWaitingQc = currentStatusCode === 'waiting_qc';
  const actions = getQuickActionsForStatus(currentStatusCode, role as any);
  const inTechPhase = isTechnicalStageStatus(currentStatusCode);

  const orderTotal = Number(order.total_price ?? order.price ?? 0) || 0;
  const orderDiscount = Number(order.discount_amount ?? 0) || 0;
  const effectiveTotal = Math.max(0, orderTotal - orderDiscount);
  const paidSum = Array.isArray(order.payments)
    ? order.payments
        .filter((p: any) => p?.status === 'paid')
        .reduce((s: number, p: any) => s + (Number(p?.amount) || 0), 0)
    : Number(order.paid_amount ?? order.paidAmount ?? 0) || 0;
  const hasUnpaidBalance = effectiveTotal > 0 && paidSum < effectiveTotal;

  return (
    <div className="space-y-2.5 pt-1 pb-3 border-b border-[#e9eeeb]">
      {/* Status Banner cho CSKH khi đơn ở giai đoạn kỹ thuật */}
      {role === 'cskh' && inTechPhase && currentStatusCode !== 'waiting_parts' && (
        <div className="flex items-center gap-2.5 p-3 rounded-[8px] bg-[#e9f4ef] border border-[#cde4d8] text-xs text-[#176b51]">
          <span className="w-2 h-2 rounded-full bg-[#176b51] animate-pulse flex-none" />
          <span>
            <strong>Tiến độ:</strong> Thiết bị đang trong quá trình xử lý kỹ thuật bởi Kỹ Thuật. CSKH không can thiệp trạng thái ở bước này.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[#81908a] font-bold">Chuyển trạng thái nhanh:</span>
        {actions.length === 0 ? (
          <span className="text-xs text-[#81908a] italic">
            {role === 'cskh' && inTechPhase
              ? 'Đang được Kỹ Thuật xử lý trong phòng kỹ thuật'
              : currentStatusCode === 'completed'
              ? 'Đơn hàng đã hoàn tất vòng đời'
              : currentStatusCode === 'cancelled'
              ? 'Đơn hàng đã hủy'
              : 'Không có bước chuyển trạng thái tiếp theo'}
          </span>
        ) : (
          actions.map((act) => (
            <Button
              key={act.targetStatus}
              variant={act.variant || 'secondary'}
              size="sm"
              icon={act.icon}
              disabled={isTransitioning}
              onClick={() => {
                if (act.targetStatus === 'completed' && hasUnpaidBalance) {
                  onQuickCheckout();
                  return;
                }
                onUpdateStatus(act.label, act.statusType, act.targetStatus);
              }}
            >
              {act.label}
            </Button>
          ))
        )}

        {/* Nút Hoàn thành sửa chữa nhanh cho CSKH / Kỹ Thuật / Admin */}
        {canCompleteTechnicalRepair(currentStatusCode, role) && (
          <Button
            variant="primary"
            size="sm"
            icon="check_circle"
            data-testid="repairs-quick-tech-complete-btn"
            onClick={() => onQuickTechComplete(order)}
            className="bg-[#176b51] hover:bg-[#10583f] text-white font-bold text-xs shadow-sm"
          >
            Hoàn thành sửa chữa
          </Button>
        )}

        {/* Nút thanh toán & bàn giao nhanh cho CSKH */}
        {['ready_for_return', 'waiting_pickup', 'in_repair', 'waiting_qc'].includes(currentStatusCode) && (
          <Button
            variant="primary"
            size="sm"
            icon="payments"
            data-testid="cskh-checkout-btn-quick"
            onClick={onQuickCheckout}
            className="bg-[#176b51] hover:bg-[#10583f] text-white font-bold text-xs shadow-sm"
          >
            Thu tiền & Trả máy
          </Button>
        )}

        {/* Nút phụ điều hướng kiểm định QC khi đơn ở trạng thái Chờ QC */}
        {isWaitingQc && (
          <Button
            variant="outline"
            size="sm"
            icon="arrow"
            onClick={() => onOpenQc(order.id)}
            className="text-[#176b51] font-semibold border-[#b8d9cb] hover:bg-[#e9f4ef]"
          >
            Mở phiếu kiểm định QC ↗
          </Button>
        )}
      </div>

      {/* Thông báo nghiệp vụ chuyên biệt cho trạng thái Chờ QC */}
      {isWaitingQc && (
        <div className="flex items-center gap-2 p-2.5 rounded-[8px] bg-[#e9f4ef] border border-[#cde4d8] text-xs text-[#176b51]">
          <span className="w-2 h-2 rounded-full bg-[#176b51] animate-pulse flex-none" />
          <span>
            <strong>Lưu ý QC:</strong> Đơn hàng đang chờ kiểm định chất lượng. Kỹ thuật viên cần phối hợp với bộ phận QC để hoàn tất biên bản kiểm tra trước khi chuyển sang sẵn sàng giao trả.
          </span>
        </div>
      )}
    </div>
  );
};
