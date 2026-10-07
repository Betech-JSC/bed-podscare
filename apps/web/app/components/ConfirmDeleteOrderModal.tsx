'use client';

import React, { useState } from 'react';
import {
  Modal,
  Button,
  Input,
  useToast,
} from '@podscare/ui';
import type { RepairOrder } from '@podscare/types';
import { repairService } from '@podscare/api-client';

export interface ConfirmDeleteOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: RepairOrder;
  onSuccess?: () => void;
}

export const ConfirmDeleteOrderModal: React.FC<ConfirmDeleteOrderModalProps> = ({
  isOpen,
  onClose,
  order,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [confirmCode, setConfirmCode] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const targetCode = order.id;
  const isMatch = confirmCode.trim().toUpperCase() === targetCode.trim().toUpperCase();

  const handleDelete = async () => {
    if (!isMatch) {
      setErrorMsg(`Vui lòng nhập chính xác mã đơn "${targetCode}" để xác nhận xóa.`);
      return;
    }

    setIsDeleting(true);
    setErrorMsg('');

    try {
      await repairService.deleteOrder(order.id);
      toast(`✓ Đã xóa vĩnh viễn đơn hàng ${order.id} khỏi hệ thống!`, 'success');
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: any) {
      console.error('Delete order failed:', err);
      const msg = err?.response?.data?.message || err?.message || 'Không thể xóa đơn hàng.';
      setErrorMsg(msg);
      toast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      eyebrow="CẢNH BÁO NGUY HIỂM · STORE ADMIN ONLY"
      title={`Xác nhận xóa vĩnh viễn đơn · ${order.id}`}
      subtitle="Thao tác này sẽ xóa sạch dữ liệu khỏi cơ sở dữ liệu và không thể hoàn tác."
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" onClick={onClose} disabled={isDeleting}>
            Hủy bỏ
          </Button>
          <Button
            variant="danger"
            size="md"
            disabled={!isMatch || isDeleting}
            onClick={handleDelete}
            className="bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? 'Đang xóa sạch dữ liệu...' : '🗑️ Xóa vĩnh viễn đơn này'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        {errorMsg && (
          <div className="p-3 bg-[#fef2f2] border border-[#fecaca] rounded-[8px] text-xs text-[#b91c1c] font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Khối cảnh báo màu đỏ */}
        <div className="p-4 bg-[#fef2f2] rounded-[10px] border border-[#fca5a5] space-y-2">
          <div className="flex items-center gap-2 text-[#991b1b] font-bold text-sm">
            <span>🚨</span>
            <span>HÀNH ĐỘNG KHÔNG THỂ HOÀN TÁC</span>
          </div>
          <p className="text-xs text-[#b91c1c] leading-relaxed m-0">
            Bạn đang chuẩn bị xóa vĩnh viễn đơn sửa chữa <b className="font-mono text-sm underline">{order.id}</b> của khách hàng <b>{order.name}</b> ({order.device}).
          </p>
          <div className="pt-1 text-[11px] text-[#7f1d1d] space-y-1">
            <span className="block font-semibold">Toàn bộ dữ liệu liên quan sẽ bị dọn sạch:</span>
            <ul className="list-disc pl-4 space-y-0.5 m-0">
              <li>Hình ảnh hiện trạng tiếp nhận & danh sách checklist kiểm tra</li>
              <li>Báo giá, biên bản kiểm định chất lượng QC</li>
              <li>Lịch sử phiếu thu thanh toán & sổ bảo hành điện tử</li>
              <li>Nhật ký vận hành và thông báo nội bộ</li>
            </ul>
          </div>
        </div>

        {/* Ô xác thực nhập mã đơn */}
        <div>
          <label className="block text-xs font-bold text-[#2d3d35] mb-1.5">
            Để xác nhận, vui lòng nhập chính xác mã đơn{' '}
            <span className="font-mono font-bold text-[#dc2626] bg-[#fee2e2] px-1.5 py-0.5 rounded">
              {targetCode}
            </span>{' '}
            vào ô bên dưới:
          </label>
          <Input
            value={confirmCode}
            onChange={(e) => {
              setConfirmCode(e.target.value);
              setErrorMsg('');
            }}
            placeholder={`Nhập ${targetCode} để kích hoạt nút xóa...`}
            autoFocus
          />
        </div>
      </div>
    </Modal>
  );
};
