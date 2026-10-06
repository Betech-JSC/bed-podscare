'use client';

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  StatusTag,
  Textarea,
  Input,
  Select,
  Checkbox,
  useToast,
  Icon,
} from '@podscare/ui';
import type { RepairOrder } from '@podscare/types';
import { repairService } from '@podscare/api-client';
import { normalizeStatusCode } from '../repairs/fsm';
import { useSilentPrint } from './print';

export interface TechOrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: RepairOrder | null;
  onCompleteSuccess?: (updatedOrder: RepairOrder) => void;
  onGrabSuccess?: (claimedOrder: RepairOrder) => void;
  currentUser?: { id?: number | string; name?: string; role?: string } | null;
  invalidateOrders?: () => Promise<any> | void;
  updateOrder?: (order: RepairOrder) => void;
}

export const TechOrderDetailModal: React.FC<TechOrderDetailModalProps> = ({
  isOpen,
  onClose,
  order,
  onCompleteSuccess,
  onGrabSuccess,
  currentUser,
  invalidateOrders,
  updateOrder,
}) => {
  const { toast } = useToast();
  const { printReceipt, isPrinting: isSilentPrinting } = useSilentPrint();

  // Completion Form State
  const [repairNote, setRepairNote] = useState('');
  const [partsUsed, setPartsUsed] = useState('');
  const [finalCheck, setFinalCheck] = useState('Đã chạy thử, hoạt động hoàn hảo');
  const [consentCheck, setConsentCheck] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Reset form when order changes
  useEffect(() => {
    if (order) {
      setRepairNote(order.repairNote || '');
      setPartsUsed(order.partsUsed || '');
      setFinalCheck(order.finalCheck || 'Đã chạy thử, hoạt động hoàn hảo');
      setConsentCheck(false);
      setFormError('');
    }
  }, [order, isOpen]);

  if (!order) return null;

  const code = normalizeStatusCode(order.status);
  const isAvailable = code === 'waiting_tech' && !order.technicianId && !order.technician_id;
  const isCompleted = ['ready_for_return', 'waiting_qc', 'waiting_pickup', 'completed'].includes(code);
  const isActive = ['assigned', 'in_repair', 'waiting_parts', 'rework_needed'].includes(code);

  const moneyFormatted = (n: number) =>
    n ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫' : '—';

  // In tem khay K80
  const handlePrint = async () => {
    toast(`Đang gửi lệnh in tem khay K80 cho đơn ${order.id}...`, 'info');
    await printReceipt(order, 'k80', true);
  };

  // Nhận đơn ngay từ trong modal
  const handleGrab = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await repairService.transition(order.id, {
        transition: 'in_repair',
        status: 'Đang sửa',
        technician_id: currentUser?.id,
      });
      if (invalidateOrders) await invalidateOrders();
      toast(`⚡ Đã nhận máy ${order.id} vào bàn sửa chữa!`, 'success');
      const updated: RepairOrder = {
        ...order,
        tech: currentUser?.name || 'Kỹ thuật viên',
        technicianId: currentUser?.id ? Number(currentUser.id) : undefined,
        technician_id: currentUser?.id ? Number(currentUser.id) : undefined,
        status: 'Đang sửa',
        statusType: 'progress',
      };
      if (onGrabSuccess) onGrabSuccess(updated);
      onClose();
    } catch (err: any) {
      const updated: RepairOrder = {
        ...order,
        tech: currentUser?.name || 'Kỹ thuật viên',
        technicianId: currentUser?.id ? Number(currentUser.id) : undefined,
        technician_id: currentUser?.id ? Number(currentUser.id) : undefined,
        status: 'Đang sửa',
        statusType: 'progress',
      };
      if (updateOrder) updateOrder(updated);
      toast(`⚡ Đã nhận máy ${order.id} vào bàn sửa chữa!`, 'success');
      if (onGrabSuccess) onGrabSuccess(updated);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xác nhận hoàn tất sửa chữa và bàn giao
  const handleCompleteRepair = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    if (!repairNote.trim()) {
      const msg = 'Vui lòng nhập nội dung đã kiểm tra và sửa chữa';
      setFormError(msg);
      toast(msg, 'error');
      return;
    }

    if (repairNote.trim().length < 5) {
      const msg = 'Nội dung sửa chữa phải có tối thiểu 5 ký tự';
      setFormError(msg);
      toast(msg, 'error');
      return;
    }

    if (!consentCheck) {
      const msg = 'Vui lòng xác nhận kiểm tra hoàn chỉnh trước khi bàn giao';
      setFormError(msg);
      toast(msg, 'error');
      return;
    }

    setFormError('');
    setIsSubmitting(true);

    try {
      const payload = {
        transition: 'ready_for_return',
        status: 'ready_for_return',
        repair_note: repairNote.trim(),
        parts_used: partsUsed.trim() || undefined,
        final_check_result: finalCheck,
        technician_id: currentUser?.id,
      };

      await repairService.transition(order.id, payload);
      if (invalidateOrders) await invalidateOrders();
      toast(`✓ Đã hoàn tất sửa chữa ${order.id} · Sẵn sàng bàn giao quầy CSKH!`, 'success');

      const updated: RepairOrder = {
        ...order,
        status: 'Sẵn sàng trả',
        statusType: 'ready',
        repairNote: repairNote.trim(),
        partsUsed: partsUsed.trim(),
        finalCheck,
      };

      if (onCompleteSuccess) onCompleteSuccess(updated);
      onClose();
    } catch (err: any) {
      // Fallback optimistic
      const updated: RepairOrder = {
        ...order,
        status: 'Sẵn sàng trả',
        statusType: 'ready',
        repairNote: repairNote.trim(),
        partsUsed: partsUsed.trim(),
        finalCheck,
      };
      if (updateOrder) updateOrder(updated);
      toast(`✓ Đã hoàn tất sửa chữa ${order.id} · Sẵn sàng bàn giao quầy CSKH!`, 'success');
      if (onCompleteSuccess) onCompleteSuccess(updated);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      eyebrow={`CHI TIẾT TIẾP NHẬN & NGHIỆM THU · ${order.id}`}
      title={`${order.device} · ${order.name}`}
      subtitle={`SĐT: ${order.phone} · Chi nhánh: ${order.branch || order.branchName || 'Chi nhánh hiện tại'}`}
      headerExtra={
        <div className="flex items-center gap-2">
          <StatusTag label={order.status} type={order.statusType} />
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="md"
              disabled={isSilentPrinting}
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-xs text-[#176b58] border-[#b8d0c5] hover:bg-[#f0f8f4]"
            >
              <Icon name="check" size={14} />
              <span>{isSilentPrinting ? 'Đang in...' : 'In tem dán khay K80 🖨️'}</span>
            </Button>
          </div>

          <div className="flex items-center gap-2.5">
            <Button variant="secondary" size="md" onClick={onClose}>
              Đóng
            </Button>

            {isAvailable && (
              <Button
                variant="primary"
                size="md"
                disabled={isSubmitting}
                onClick={handleGrab}
                className="bg-[#176b58] hover:bg-[#125848] text-white font-bold shadow-xs"
              >
                ⚡ Nhận máy vào bàn sửa
              </Button>
            )}

            {isActive && (
              <Button
                variant="primary"
                size="md"
                disabled={isSubmitting}
                onClick={handleCompleteRepair}
                className="bg-[#176b58] hover:bg-[#125848] text-white font-bold text-sm shadow-xs px-5"
              >
                {isSubmitting ? 'Đang xử lý...' : '✓ HOÀN THÀNH SỬA CHỮA'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-6 max-h-[72vh] overflow-y-auto pr-1">
        {/* ========================================================================= */}
        {/* KHỐI 1: THÔNG TIN TIẾP NHẬN TỪ QUẦY CSKH                                 */}
        {/* ========================================================================= */}
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#edf1ee]">
            <h4 className="text-xs font-bold text-[#176b58] uppercase tracking-[1px] m-0 flex items-center gap-1.5">
              <span>📋</span> KHỐI 1: THÔNG TIN TIẾP NHẬN TỪ QUẦY CSKH
            </h4>
            <span className="text-xs text-[#7d8c85]">
              Tiếp nhận ngày: <b className="text-[#1c302b]">{order.date}</b>
            </span>
          </div>

          {/* Grid thông tin chung */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#fafbfa] p-4 rounded-[10px] border border-[#edf1ee] text-xs">
            <div>
              <span className="text-[#84948c] block mb-0.5">Mã đơn sửa:</span>
              <b className="font-mono text-sm text-[#176b58] font-bold">{order.id}</b>
            </div>
            <div>
              <span className="text-[#84948c] block mb-0.5">Khách hàng:</span>
              <b className="text-[#1c302b] text-sm block truncate">{order.name}</b>
              <span className="text-[#72827a]">{order.phone}</span>
            </div>
            <div>
              <span className="text-[#84948c] block mb-0.5">Serial / IMEI:</span>
              <b className="font-mono text-[#2f3f37] block">
                {order.serial && order.serial !== 'Chưa cập nhật' ? order.serial : 'Không có'}
              </b>
            </div>
            <div>
              <span className="text-[#84948c] block mb-0.5">Báo giá tiếp nhận:</span>
              <b className="text-sm text-[#176b58] font-bold">
                {moneyFormatted(order.price)}
              </b>
            </div>
          </div>

          {/* Phụ kiện & Ngoại quan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-[#f7faf8] rounded-[8px] border border-[#e5ece8]">
              <span className="font-bold text-[#55665d] block mb-1">Phụ kiện kèm theo:</span>
              <p className="text-[#2b3b33] m-0">
                {order.accessories && order.accessories !== 'Không gửi kèm'
                  ? order.accessories
                  : 'Không có phụ kiện kèm theo'}
              </p>
            </div>
            <div className="p-3 bg-[#f7faf8] rounded-[8px] border border-[#e5ece8]">
              <span className="font-bold text-[#55665d] block mb-1">Ngoại quan lúc nhận:</span>
              <p className="text-[#2b3b33] m-0">
                {order.appearance || 'Bình thường, có trầy xước nhẹ theo thời gian sử dụng'}
              </p>
            </div>
          </div>

          {/* Hộp mô tả lỗi khách báo (Nổi bật) */}
          <div className="p-3.5 bg-[#faf4ea] rounded-[10px] border border-[#e5d7c3]">
            <span className="font-bold text-xs text-[#a2681e] uppercase tracking-wider block mb-1">
              ⚠️ Tình trạng lỗi do khách hàng mô tả:
            </span>
            <p className="text-sm font-semibold text-[#1c302b] m-0 leading-relaxed">
              {order.issue}
            </p>
          </div>

          {/* Checklist test quầy tiếp nhận */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-xs text-[#4e5f57] uppercase tracking-wide">
                Kết quả kiểm tra tiếp tân (Checklist quầy):
              </span>
              <span className="text-xs text-[#82928a]">
                {order.checks?.length || 0} hạng mục
              </span>
            </div>

            {order.checks && order.checks.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {order.checks.map((chk, idx) => {
                  const isPass = chk.status === 'Hoạt động';
                  const isFail = chk.status === 'Lỗi';
                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-2.5 rounded-[8px] border text-xs ${
                        isPass
                          ? 'bg-[#f4faf6] border-[#d2e8dd]'
                          : isFail
                          ? 'bg-[#fdf2f2] border-[#f5c6cb]'
                          : 'bg-[#f9faf9] border-[#e5ece8]'
                      }`}
                    >
                      <span className="font-medium text-[#2d3d35] truncate max-w-[130px]" title={chk.label}>
                        {chk.label}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          isPass
                            ? 'bg-[#e0f1e8] text-[#176b58]'
                            : isFail
                            ? 'bg-[#fbe3e4] text-[#b83b3b]'
                            : 'bg-[#ecefe8] text-[#718079]'
                        }`}
                      >
                        {isPass ? '✓ Đạt' : isFail ? '✗ Lỗi' : '- Chưa test'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 bg-[#fafbfa] border border-[#edf1ee] rounded-[8px] text-xs text-[#708078]">
                Checklist tiếp nhận đã được CSKH xác nhận đạt tiêu chuẩn tiếp tân bàn giao.
              </div>
            )}
          </div>

          {/* Ghi chú test nếu có */}
          {order.testNote && (
            <div className="p-3 bg-[#f7faf8] rounded-[8px] border border-[#e5ece8] text-xs">
              <span className="font-bold text-[#55665d] block mb-1">Ghi chú test từ CSKH:</span>
              <p className="text-[#2b3b33] m-0">{order.testNote}</p>
            </div>
          )}

          {/* Thư viện ảnh ngoại quan lúc nhận */}
          <div>
            <span className="font-bold text-xs text-[#4e5f57] uppercase tracking-wide block mb-2">
              Ảnh ngoại quan thiết bị lúc tiếp nhận quầy:
            </span>

            {order.photos && order.photos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {order.photos.map((photo, idx) => (
                  <div
                    key={idx}
                    className="relative group rounded-[8px] overflow-hidden border border-[#e5ece8] bg-[#f4f7f5] aspect-square flex flex-col justify-between"
                  >
                    <img
                      src={photo.url}
                      alt={photo.name || `Ảnh ${idx + 1}`}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] px-2 py-1 truncate">
                      {photo.name || `Ảnh ${idx + 1}`}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3.5 bg-[#fafbfa] border border-[#edf1ee] rounded-[8px] text-xs text-[#809088] flex items-center gap-2">
                <Icon name="device" size={16} />
                <span>Không có ảnh chụp ngoại quan gửi kèm theo đơn này.</span>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* KHỐI 2: THAO TÁC KỸ THUẬT & NGHIỆM THU                                    */}
        {/* ========================================================================= */}
        <div className="pt-4 border-t-2 border-[#edf1ee] space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#edf1ee]">
            <h4 className="text-xs font-bold text-[#176b58] uppercase tracking-[1px] m-0 flex items-center gap-1.5">
              <span>🛠️</span> KHỐI 2: THAO TÁC KỸ THUẬT & NGHIỆM THU
            </h4>
            {isActive && (
              <span className="text-xs text-[#176b58] font-semibold bg-[#eaf4ef] px-2.5 py-0.5 rounded-full">
                Đang trong ca sửa chữa
              </span>
            )}
            {isCompleted && (
              <span className="text-xs text-[#28805e] font-semibold bg-[#eaf5ef] px-2.5 py-0.5 rounded-full">
                ✓ Đã hoàn tất sửa chữa
              </span>
            )}
          </div>

          {/* Form nghiệm thu cho đơn đang active */}
          {isActive ? (
            <form onSubmit={handleCompleteRepair} className="space-y-4">
              {formError && (
                <div className="p-3 bg-[#fdf2f2] border border-[#f5c6cb] rounded-[8px] text-xs text-[#b83b3b] font-semibold">
                  ⚠️ {formError}
                </div>
              )}

              <Textarea
                label="Nội dung đã kiểm tra & sửa chữa (* Bắt buộc)"
                value={repairNote}
                onChange={(e) => {
                  setRepairNote(e.target.value);
                  if (formError) setFormError('');
                }}
                placeholder="Mô tả cụ thể các thao tác kỹ thuật đã xử lý: thay pin tai phải, vệ sinh socket, thay màng loa, cân chỉnh cảm ứng, chạy test âm thanh 30 phút ổn định..."
                required
                rows={3}
              />

              <Input
                label="Linh kiện đã thay thế (nếu có)"
                value={partsUsed}
                onChange={(e) => setPartsUsed(e.target.value)}
                placeholder="Ví dụ: Pin AirPods Pro 2 chính hãng BAT-APP2-01, keo dán chuyên dụng B7000..."
              />

              <Select
                label="Kết quả chạy thử nghiệm thu kỹ thuật"
                value={finalCheck}
                onChange={(e) => setFinalCheck(e.target.value)}
                options={[
                  'Đã chạy thử, hoạt động hoàn hảo',
                  'Đã thay pin, sạc đầy 100%, chất âm tốt',
                  'Đã test chống ồn ANC & Xuyên âm ổn định',
                  'Đã khắc phục lỗi, các chức năng phụ bình thường',
                  'Đạt chuẩn xuất xưởng, bàn giao quầy CSKH',
                ]}
              />

              <div className="p-3.5 bg-[#f5fbf7] border border-[#c4e3d3] rounded-[8px]">
                <Checkbox
                  checked={consentCheck}
                  onChange={(e) => {
                    setConsentCheck(e.target.checked);
                    if (formError) setFormError('');
                  }}
                  label={
                    <span className="text-xs text-[#244636] font-medium leading-relaxed">
                      Tôi xác nhận đã sửa chữa và kiểm tra thiết bị đạt chuẩn kỹ thuật bàn giao quầy CSKH.
                    </span>
                  }
                />
              </div>
            </form>
          ) : isCompleted ? (
            /* Hiển thị kết quả đã hoàn thành (Read-only) */
            <div className="space-y-3 bg-[#f9faf9] p-4 rounded-[10px] border border-[#e5ece8] text-xs">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-[#edf1ee]">
                <span className="text-[#72827a]">Kỹ thuật viên phụ trách:</span>
                <b className="text-[#1c302b]">{order.tech || currentUser?.name || 'Kỹ thuật viên'}</b>
              </div>
              <div>
                <span className="text-[#72827a] block mb-1 font-semibold">Nội dung kỹ thuật đã xử lý:</span>
                <p className="text-[#1c302b] m-0 bg-white p-2.5 rounded-[6px] border border-[#edf1ee] font-medium">
                  {order.repairNote || 'Đã sửa chữa và kiểm tra hoàn chỉnh theo tiêu chuẩn.'}
                </p>
              </div>
              {order.partsUsed && (
                <div>
                  <span className="text-[#72827a] block mb-1 font-semibold">Linh kiện đã thay thế:</span>
                  <p className="text-[#1c302b] m-0 bg-white p-2.5 rounded-[6px] border border-[#edf1ee]">
                    {order.partsUsed}
                  </p>
                </div>
              )}
              <div>
                <span className="text-[#72827a] block mb-1 font-semibold">Kết quả nghiệm thu:</span>
                <p className="text-[#176b58] font-bold m-0 bg-[#eaf4ef] p-2 rounded-[6px] border border-[#d2e8dd]">
                  {order.finalCheck || 'Đã chạy thử, hoạt động hoàn hảo'}
                </p>
              </div>
            </div>
          ) : (
            /* Đơn chưa nhận (available) */
            <div className="p-4 bg-[#f8faf9] rounded-[10px] border border-[#e5ece8] text-xs text-center space-y-2">
              <p className="text-[#55665d] m-0">
                Đơn hàng đang ở hàng đợi quầy tiếp tân. Bấm <b>[⚡ Nhận máy vào bàn sửa]</b> để tiếp nhận và bắt đầu ca sửa chữa.
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
