'use client';

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Textarea,
  Checkbox,
  useToast,
  Icon,
} from '@podscare/ui';
import type { RepairOrder } from '@podscare/types';
import { repairService } from '@podscare/api-client';

export interface SpecialPartsRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders?: RepairOrder[];
  preselectedOrder?: RepairOrder | null;
  onSuccess?: (updatedOrder: RepairOrder) => void;
  invalidateOrders?: () => Promise<any> | void;
  updateOrder?: (order: RepairOrder) => void;
}

export const SpecialPartsRequestModal: React.FC<SpecialPartsRequestModalProps> = ({
  isOpen,
  onClose,
  orders = [],
  preselectedOrder,
  onSuccess,
  invalidateOrders,
  updateOrder,
}) => {
  const { toast } = useToast();

  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [pauseOrder, setPauseOrder] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Tự động gán mã đơn khi modal mở
  useEffect(() => {
    if (isOpen) {
      if (preselectedOrder) {
        setSelectedOrderId(preselectedOrder.id);
        setNote(preselectedOrder.special_parts_needed || preselectedOrder.specialPartsNeeded || '');
      } else if (orders.length > 0) {
        setSelectedOrderId(orders[0].id);
        setNote('');
      } else {
        setSelectedOrderId('');
        setNote('');
      }
      setPauseOrder(true);
      setError('');
    }
  }, [isOpen, preselectedOrder, orders]);

  if (!isOpen) return null;

  const currentOrder = preselectedOrder || orders.find((o) => o.id === selectedOrderId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedOrderId) {
      setError('Vui lòng chọn thiết bị đang sửa cần yêu cầu linh kiện');
      toast('Vui lòng chọn thiết bị đang sửa cần yêu cầu linh kiện', 'error');
      return;
    }

    if (!note.trim()) {
      setError('Vui lòng nhập rõ thông tin linh kiện cần mua ngoài');
      toast('Vui lòng nhập rõ thông tin linh kiện cần mua ngoài', 'error');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const res = await repairService.requestSpecialPart(
        selectedOrderId,
        note.trim(),
        pauseOrder
      );

      const resData = res?.data?.data || res?.data || res;
      toast('Đã gửi yêu cầu linh kiện đặc biệt tới Quầy Admin & CSKH!', 'success');

      if (currentOrder) {
        const updated: RepairOrder = {
          ...currentOrder,
          special_parts_needed: note.trim(),
          specialPartsNeeded: note.trim(),
          special_parts_status: 'pending',
          specialPartsStatus: 'pending',
          special_parts_requested_at: resData?.special_parts_requested_at || new Date().toISOString(),
          status: pauseOrder ? 'Chờ linh kiện' : currentOrder.status,
          statusType: pauseOrder ? 'wait' : currentOrder.statusType,
          paused_at: pauseOrder ? (resData?.paused_at || new Date().toISOString()) : currentOrder.paused_at,
        };

        if (updateOrder) updateOrder(updated);
        if (onSuccess) onSuccess(updated);
      }

      if (invalidateOrders) await invalidateOrders();
      onClose();
    } catch (err: any) {
      console.error('Request special part error:', err);
      const errMsg =
        err?.response?.data?.message ||
        err?.message ||
        'Không thể gửi yêu cầu linh kiện đặc biệt';
      setError(errMsg);
      toast(errMsg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      eyebrow="YÊU CẦU MUA NGOÀI"
      title="Yêu cầu linh kiện đặc biệt"
      subtitle="Gửi thông báo tới Quầy Admin & CSKH để tìm mua linh kiện ngoài kho nội bộ"
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Hủy
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            data-testid="submit-special-parts-request-btn"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="bg-[#176b58] hover:bg-[#125848] text-white font-bold text-xs sm:text-sm px-4"
          >
            {isSubmitting ? 'Đang gửi...' : 'Gửi báo cho Admin & CSKH'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            data-testid="special-parts-error"
            className="p-3 bg-[#fdf2f2] border border-[#f5c6cb] rounded-[8px] text-xs text-[#b83b3b] font-semibold flex items-center gap-1.5"
          >
            <Icon name="alert" size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* Thiết bị đang sửa */}
        {preselectedOrder ? (
          <div className="p-3 bg-[#f7faf8] border border-[#e5ece8] rounded-[8px] space-y-1">
            <span className="text-[11px] font-bold text-[#6f8077] uppercase tracking-wide block">
              Thiết bị được chọn:
            </span>
            <div className="flex items-center justify-between text-xs">
              <div>
                <b className="text-sm font-bold text-[#1c302b]">{preselectedOrder.device}</b>
                <span className="text-[#607168] block mt-0.5">
                  Khách: {preselectedOrder.name} ({preselectedOrder.phone})
                </span>
              </div>
              <span className="font-mono text-xs font-bold text-[#176b58] bg-[#eaf4ef] px-2 py-0.5 rounded">
                {preselectedOrder.id}
              </span>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-bold text-[#2d3d35] mb-1">
              Chọn máy đang sửa do bạn phụ trách: <span className="text-red-500">*</span>
            </label>
            {orders.length > 0 ? (
              <select
                data-testid="select-order-special-parts"
                value={selectedOrderId}
                onChange={(e) => {
                  setSelectedOrderId(e.target.value);
                  setError('');
                }}
                className="w-full h-9 border border-[#d6dfda] rounded-[8px] px-3 text-xs text-[#1c302b] bg-white font-medium outline-none focus:border-[#176b58] cursor-pointer"
              >
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id} - {o.device} ({o.name} - {o.phone})
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-3 bg-[#fafbfa] border border-[#edf1ee] rounded-[8px] text-xs text-[#809088]">
                Hiện bạn không có máy nào đang sửa. Hãy tiếp nhận máy vào bàn sửa trước khi tạo yêu cầu.
              </div>
            )}
          </div>
        )}

        {/* Ghi chú linh kiện cần mua ngoài */}
        <div>
          <Textarea
            label="Chi tiết linh kiện cần tìm mua ngoài (* Bắt buộc):"
            data-testid="special-parts-note-input"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (error) setError('');
            }}
            placeholder="Ví dụ: Tai lẻ AirPods Pro 2 Type-C zin bóc máy, pin dock sạc đời hiếm, vỏ màu đặc thù, IC nguồn..."
            rows={4}
            required
          />
          <span className="text-[11px] text-[#788a82] mt-1 block">
            Ghi rõ thông tin: Tên linh kiện, dòng/model, phân loại (zin bóc máy, new, linh kiện) và các yêu cầu kỹ thuật nếu có.
          </span>
        </div>

        {/* Tùy chọn tạm dừng đơn */}
        <div className="p-3 bg-[#fdfaf5] border border-[#f5ebdb] rounded-[8px]">
          <Checkbox
            label="Tạm dừng đơn hàng (chuyển trạng thái sang Chờ linh kiện) trong lúc chờ Quầy mua ngoài"
            checked={pauseOrder}
            onChange={(e) => setPauseOrder(e.target.checked)}
          />
          <span className="text-[11px] text-[#9c753b] block mt-1 ml-6">
            Mặc định tích chọn để hệ thống dừng tính giờ sửa chữa và cảnh báo trực tiếp tới quầy.
          </span>
        </div>
      </form>
    </Modal>
  );
};
