'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Button,
  StatusTag,
  Textarea,
  useToast,
} from '@podscare/ui';
import type { RepairOrder, HandoverReasonTag, HandoverPayload } from '@podscare/types';
import { repairService, userService } from '@podscare/api-client';

export interface HandoverTechModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: RepairOrder | null;
  currentUser?: { id?: number | string; name?: string; role?: string } | null;
  onSuccess?: (updatedOrder: RepairOrder) => void;
  invalidateOrders?: () => Promise<any> | void;
}

const REASON_TAGS: Array<{ tag: HandoverReasonTag; label: string; icon: string; description: string }> = [
  {
    tag: 'wrong_order',
    label: 'Nhận nhầm đơn',
    icon: '🏷️',
    description: 'Bấm nhầm nút tiếp nhận hoặc dòng máy không thuộc chuyên môn',
  },
  {
    tag: 'complex_repair',
    label: 'Máy khó / Cần thợ chuyên',
    icon: '🔬',
    description: 'Chập vi mạch, socket sâu, cần thợ tay nghề cao xử lý',
  },
  {
    tag: 'shift_change',
    label: 'Đổi ca / Hết giờ làm',
    icon: '⏰',
    description: 'Hết ca làm việc hoặc cần di chuyển công tác đột xuất',
  },
  {
    tag: 'missing_parts_tools',
    label: 'Thiếu linh kiện / Dụng cụ',
    icon: '🧰',
    description: 'Hết linh kiện tại bàn hoặc thiếu thiết bị đo kiểm chuyên dụng',
  },
];

export const HandoverTechModal: React.FC<HandoverTechModalProps> = ({
  isOpen,
  onClose,
  order,
  currentUser,
  onSuccess,
  invalidateOrders,
}) => {
  const { toast } = useToast();

  const [target, setTarget] = useState<string>('queue');
  const [reasonTag, setReasonTag] = useState<HandoverReasonTag>('wrong_order');
  const [handoverNotes, setHandoverNotes] = useState<string>('');
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [loadingTechs, setLoadingTechs] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Tải danh bạ KTV cùng chi nhánh
  useEffect(() => {
    let active = true;
    if (!isOpen) return;

    setLoadingTechs(true);
    userService
      .getUsers({ role: 'technician', is_active: true, per_page: 50 })
      .then((res: any) => {
        if (!active) return;
        const list = Array.isArray(res?.data?.data)
          ? res.data.data
          : Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res)
          ? res
          : [];
        setTechnicians(list);
      })
      .catch((err) => {
        console.warn('Could not fetch branch technicians:', err);
      })
      .finally(() => {
        if (active) setLoadingTechs(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  // Lọc bỏ KTV hiện tại khỏi danh sách nhận
  const peerTechnicians = useMemo(() => {
    const currentId = currentUser?.id !== undefined ? Number(currentUser.id) : null;
    return technicians.filter((t) => {
      if (currentId && Number(t.id) === currentId) {
        return false;
      }
      return true;
    });
  }, [technicians, currentUser?.id]);

  // Reset form khi mở modal hoặc thay đổi order
  useEffect(() => {
    if (isOpen) {
      setTarget('queue');
      setReasonTag('wrong_order');
      setHandoverNotes('');
      setErrorMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen, order?.id]);

  if (!order) return null;

  const isComplexRepair = reasonTag === 'complex_repair';
  const notesLength = handoverNotes.trim().length;
  const isNotesValid = !isComplexRepair || notesLength >= 3;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    if (isComplexRepair && notesLength < 3) {
      const msg = 'Vui lòng nhập ghi chú chi tiết (tối thiểu 3 ký tự) khi bàn giao ca máy khó để hỗ trợ thợ sau.';
      setErrorMsg(msg);
      toast(msg, 'error');
      return;
    }

    if (target !== 'queue' && !target) {
      const msg = 'Vui lòng chọn kỹ thuật viên tiếp nhận hoặc hàng đợi chung.';
      setErrorMsg(msg);
      toast(msg, 'error');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const payload: HandoverPayload = {
        target: target === 'queue' ? 'queue' : 'technician',
        technician_id: target === 'queue' ? null : Number(target),
        reason_tag: reasonTag,
        handover_notes: handoverNotes.trim() || undefined,
      };

      const res = await repairService.handoverOrder(order.id, payload);
      const updatedOrderData = res?.data || res;

      const targetLabel = target === 'queue'
        ? 'Hàng đợi chung'
        : peerTechnicians.find((t) => String(t.id) === String(target))?.name || `KTV #${target}`;

      toast(`✓ Đã bàn giao đơn ${order.id} cho [${targetLabel}] thành công!`, 'success');

      if (invalidateOrders) {
        await invalidateOrders();
      }

      if (onSuccess) {
        onSuccess(updatedOrderData || {
          ...order,
          status: target === 'queue' ? 'Chờ kỹ thuật' : 'Đã nhận đơn',
          technician_id: target === 'queue' ? null : Number(target),
        });
      }

      onClose();
    } catch (err: any) {
      console.error('Handover order failed:', err);
      const msg = err?.response?.data?.message || err?.message || 'Không thể bàn giao đơn hàng. Vui lòng thử lại.';
      setErrorMsg(msg);
      toast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      eyebrow="QUY TRÌNH ĐIỀU PHỐI KỸ THUẬT"
      title={`Bàn giao đơn sửa chữa · ${order.id}`}
      subtitle="Bàn giao thiết bị trực tiếp cho kỹ thuật viên khác cùng xưởng hoặc hoàn trả về hàng đợi tiếp nhận chung."
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="secondary" size="md" onClick={onClose} disabled={isSubmitting}>
            Hủy bỏ
          </Button>

          <Button
            variant="primary"
            size="md"
            disabled={isSubmitting || !isNotesValid}
            onClick={handleSubmit}
            className="bg-[#176b58] hover:bg-[#125848] text-white font-bold flex items-center gap-1.5 shadow-xs px-5"
          >
            <span>{isSubmitting ? 'Đang chuyển giao...' : '🔄 Xác nhận bàn giao'}</span>
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5 text-xs text-[#2d3d35]">
        {errorMsg && (
          <div className="p-3 bg-[#fdf2f2] border border-[#f5c6cb] rounded-[8px] text-xs text-[#b83b3b] font-semibold">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Khối tóm tắt thông tin đơn hàng */}
        <div className="bg-[#fafbfa] p-3.5 rounded-[10px] border border-[#e5ece8] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-sm text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded-[6px]">
              {order.id}
            </span>
            <div>
              <span className="font-bold text-[#1c302b] block text-xs">{order.device}</span>
              <span className="text-[11px] text-[#718279]">
                Khách: <b>{order.name}</b> ({order.phone})
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#718279]">Trạng thái:</span>
            <StatusTag label={order.status} type={order.statusType} />
          </div>
        </div>

        {/* 1. Chọn Đối tượng nhận */}
        <div>
          <label className="block text-xs font-bold text-[#1c302b] mb-1.5">
            1. Bàn giao đến đối tượng: <span className="text-[#b91c1c]">*</span>
          </label>
          <div className="relative">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={isSubmitting}
              className="w-full h-10 px-3.5 pr-8 bg-white border border-[#b8d0c5] focus:border-[#176b58] focus:ring-1 focus:ring-[#176b58] rounded-[8px] text-xs font-medium text-[#1c302b] outline-hidden cursor-pointer"
            >
              <option value="queue">
                ⚡ Trả về hàng đợi chung (Đơn chờ nhận) — Bấm nhầm đơn / Chờ thợ khác nhận
              </option>
              {peerTechnicians.length > 0 && (
                <optgroup label="── Kỹ thuật viên đồng nghiệp cùng chi nhánh ──">
                  {peerTechnicians.map((tech) => (
                    <option key={tech.id} value={String(tech.id)}>
                      👨‍🔧 KTV {tech.name} {tech.phone ? `(${tech.phone})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          {loadingTechs && (
            <span className="text-[11px] text-[#809088] mt-1 block">
              Đang tải danh bạ kỹ thuật viên cùng chi nhánh...
            </span>
          )}
          {!loadingTechs && peerTechnicians.length === 0 && (
            <span className="text-[11px] text-[#809088] mt-1 block">
              Không có kỹ thuật viên khác đang hoạt động trong chi nhánh này. Bạn có thể hoàn trả về hàng đợi chung.
            </span>
          )}
        </div>

        {/* 2. Thẻ lý do bàn giao nhanh */}
        <div>
          <label className="block text-xs font-bold text-[#1c302b] mb-1.5">
            2. Thẻ lý do bàn giao chuẩn hóa: <span className="text-[#b91c1c]">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {REASON_TAGS.map((item) => {
              const isSelected = reasonTag === item.tag;
              return (
                <div
                  key={item.tag}
                  onClick={() => {
                    setReasonTag(item.tag);
                    if (errorMsg) setErrorMsg('');
                  }}
                  className={`p-3 rounded-[8px] border-2 cursor-pointer transition-all flex items-start gap-2.5 ${
                    isSelected
                      ? 'border-[#176b58] bg-[#eaf4ef] shadow-2xs'
                      : 'border-[#e0e8e4] bg-white hover:bg-[#fbfcfb] hover:border-[#b8d0c5]'
                  }`}
                >
                  <span className="text-base select-none mt-0.5">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span
                      className={`block font-bold text-xs ${
                        isSelected ? 'text-[#176b58]' : 'text-[#1c302b]'
                      }`}
                    >
                      {item.label}
                    </span>
                    <span className="text-[11px] text-[#6b7c74] block mt-0.5 line-clamp-2">
                      {item.description}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="text-[#176b58] font-bold text-xs select-none">✓</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Textarea ghi chú dặn dò */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-[#1c302b]">
              3. Ghi chú dặn dò thợ sau / Lý do chi tiết:
              {isComplexRepair && <span className="text-[#b91c1c] ml-1">* (Tối thiểu 3 ký tự)</span>}
            </label>
            {isComplexRepair && (
              <span
                className={`text-[11px] font-mono ${
                  notesLength >= 3 ? 'text-[#176b58] font-semibold' : 'text-[#b91c1c]'
                }`}
              >
                {notesLength}/3 ký tự
              </span>
            )}
          </div>
          <Textarea
            value={handoverNotes}
            onChange={(e) => {
              setHandoverNotes(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
            placeholder={
              isComplexRepair
                ? 'Mô tả chi tiết tình trạng hỏng hóc, vị trí chân chập hoặc lưu ý vi mạch để hỗ trợ thợ sau...'
                : 'Nhập ghi chú thêm cho thợ tiếp nhận (linh kiện đã thử, tình trạng phụ kiện, dặn dò khác)...'
            }
            rows={3}
            className={
              isComplexRepair && notesLength > 0 && notesLength < 3
                ? 'border-[#fca5a5] focus:border-[#dc2626]'
                : ''
            }
          />
          {isComplexRepair && notesLength < 3 && (
            <p className="text-[11px] text-[#b91c1c] mt-1 mb-0 font-medium">
              ⚠️ Ca máy khó bắt buộc phải nhập ghi chú rõ ràng (tối thiểu 3 ký tự) để thợ sau nắm bắt thông tin.
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
};
