'use client';

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Input,
  CurrencyInput,
  Textarea,
  useToast,
} from '@podscare/ui';
import type { RepairOrder } from '@podscare/types';
import { repairService, userService, type UserRecord } from '@podscare/api-client';
import { usePodsCare } from '../providers';

export interface AdminEditOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: RepairOrder;
  onSuccess?: (updatedOrder: RepairOrder) => void;
}

export const AdminEditOrderModal: React.FC<AdminEditOrderModalProps> = ({
  isOpen,
  onClose,
  order,
  onSuccess,
}) => {
  const { toast } = useToast();
  const { branches } = usePodsCare();

  const [customerName, setCustomerName] = useState(order.name || '');
  const [customerPhone, setCustomerPhone] = useState(order.phone || '');
  const [serialNumber, setSerialNumber] = useState(order.serial === 'Chưa cập nhật' ? '' : order.serial || '');
  const [issueDescription, setIssueDescription] = useState(order.issue || '');
  const [accessories, setAccessories] = useState(order.accessories === 'Không gửi kèm' ? '' : order.accessories || '');
  const [appearanceNotes, setAppearanceNotes] = useState(order.appearance || '');
  const [orderType, setOrderType] = useState<'in_store' | 'cod'>((order.order_type as any) || (order.orderType as any) || 'in_store');
  const [totalPrice, setTotalPrice] = useState<number | string>(
    order.total_price !== undefined ? order.total_price : order.price || 0
  );
  const [selectedBranchId, setSelectedBranchId] = useState<string | number>(
    (order as any).branch_id || (order as any).branchId || 1
  );
  const [selectedTechId, setSelectedTechId] = useState<string>(
    (order as any).technician_id ? String((order as any).technician_id) : ''
  );
  const [warrantyDays, setWarrantyDays] = useState<number | string>(
    (order as any).warranty_terms_days || 90
  );

  const [technicians, setTechnicians] = useState<UserRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Sync state when order prop changes
  useEffect(() => {
    if (order) {
      setCustomerName(order.name || '');
      setCustomerPhone(order.phone || '');
      setSerialNumber(order.serial === 'Chưa cập nhật' ? '' : order.serial || '');
      setIssueDescription(order.issue || '');
      setAccessories(order.accessories === 'Không gửi kèm' ? '' : order.accessories || '');
      setAppearanceNotes(order.appearance || '');
      setOrderType((order.order_type as any) || (order.orderType as any) || 'in_store');
      setTotalPrice(order.total_price !== undefined ? order.total_price : order.price || 0);
      setSelectedBranchId((order as any).branch_id || (order as any).branchId || 1);
      setSelectedTechId((order as any).technician_id ? String((order as any).technician_id) : '');
      setWarrantyDays((order as any).warranty_terms_days || 90);
    }
  }, [order]);

  // Load technicians list
  useEffect(() => {
    let active = true;
    userService
      .getUsers({ role: 'technician' })
      .then((res) => {
        if (!active) return;
        const list = Array.isArray(res?.data?.data)
          ? res.data.data
          : Array.isArray(res?.data)
          ? res.data
          : [];
        setTechnicians(list);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const handleSave = async () => {
    if (!customerName.trim()) {
      setErrorMsg('Vui lòng nhập họ tên khách hàng.');
      return;
    }
    if (!issueDescription.trim()) {
      setErrorMsg('Vui lòng nhập mô tả lỗi thiết bị.');
      return;
    }

    const priceNum = typeof totalPrice === 'number' ? totalPrice : Number(totalPrice) || 0;
    const warrantyNum = typeof warrantyDays === 'number' ? warrantyDays : Number(warrantyDays) || 0;

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const payload: Record<string, any> = {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        serial_number: serialNumber.trim() || null,
        issue_description: issueDescription.trim(),
        accessories: accessories.trim() || null,
        appearance_notes: appearanceNotes.trim() || null,
        order_type: orderType,
        total_price: priceNum,
        branch_id: selectedBranchId,
        technician_id: selectedTechId ? Number(selectedTechId) : null,
        warranty_terms_days: warrantyNum,
      };

      await repairService.adminUpdate(order.id, payload);

      toast(`✓ Admin đã cập nhật toàn diện thông tin đơn ${order.id}!`, 'success');

      const updatedOrder: RepairOrder = {
        ...order,
        name: customerName.trim(),
        phone: customerPhone.trim(),
        serial: serialNumber.trim() || 'Chưa cập nhật',
        issue: issueDescription.trim(),
        accessories: accessories.trim() || 'Không gửi kèm',
        appearance: appearanceNotes.trim() || 'Không ghi chú',
        order_type: orderType,
        orderType: orderType,
        price: priceNum,
        total_price: priceNum,
        technician_id: selectedTechId ? Number(selectedTechId) : null,
        tech: technicians.find((t) => String(t.id) === selectedTechId)?.name || order.tech,
      };

      if (onSuccess) {
        onSuccess(updatedOrder);
      }
      onClose();
    } catch (err: any) {
      console.error('Admin update failed:', err);
      const msg = err?.response?.data?.message || err?.message || 'Không thể lưu thay đổi đơn hàng.';
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
      eyebrow="QUẢN TRỊ VIÊN CỬA HÀNG · FULL CRUD"
      title={`Chỉnh sửa toàn diện đơn · ${order.id}`}
      subtitle="Chỉ dành cho Store Admin & Super Admin. Mọi thay đổi đều được ghi vết Audit Log."
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Hủy bỏ
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={isSubmitting}
            onClick={handleSave}
            className="bg-[#176b58] hover:bg-[#125848] text-white font-bold"
          >
            {isSubmitting ? 'Đang lưu...' : '✓ Lưu thay đổi thông tin đơn'}
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

        {/* Phân loại đơn: Tại quầy vs COD */}
        <div className="p-3.5 bg-[#f7faf8] rounded-[10px] border border-[#d8e6de] space-y-2">
          <label className="block text-xs font-bold text-[#176b58] uppercase tracking-wide">
            Kênh tiếp nhận / Phân loại đơn <span className="text-red-500">*</span>:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              onClick={() => setOrderType('in_store')}
              className={`p-3 rounded-[8px] border-2 cursor-pointer transition-all flex items-center gap-2.5 ${
                orderType === 'in_store'
                  ? 'border-[#176b58] bg-[#eaf4ef] shadow-xs'
                  : 'border-[#e0e8e4] bg-white hover:bg-[#fbfcfb]'
              }`}
            >
              <input
                type="radio"
                name="admin_order_type"
                value="in_store"
                checked={orderType === 'in_store'}
                onChange={() => setOrderType('in_store')}
                className="text-[#176b58] focus:ring-[#176b58]"
              />
              <div>
                <span className="font-bold text-xs text-[#1c302b] block">
                  🏪 Khách tại cửa hàng
                </span>
                <span className="text-[11px] text-[#6b7c74]">Khách mang máy đến quầy</span>
              </div>
            </div>

            <div
              onClick={() => setOrderType('cod')}
              className={`p-3 rounded-[8px] border-2 cursor-pointer transition-all flex items-center gap-2.5 ${
                orderType === 'cod'
                  ? 'border-[#d97706] bg-[#fef3c7] shadow-xs'
                  : 'border-[#e0e8e4] bg-white hover:bg-[#fbfcfb]'
              }`}
            >
              <input
                type="radio"
                name="admin_order_type"
                value="cod"
                checked={orderType === 'cod'}
                onChange={() => setOrderType('cod')}
                className="text-[#d97706] focus:ring-[#d97706]"
              />
              <div>
                <span className="font-bold text-xs text-[#92400e] block">
                  📦 Đơn COD (Khách tỉnh)
                </span>
                <span className="text-[11px] text-[#b45309]">Gửi bưu điện, chuyển phát nhanh</span>
              </div>
            </div>
          </div>
        </div>

        {/* Thông tin khách hàng */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#2d3d35] mb-1">
              Tên khách hàng <span className="text-red-500">*</span>:
            </label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nguyễn Văn A..."
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#2d3d35] mb-1">
              Số điện thoại:
            </label>
            <Input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="090..."
            />
          </div>
        </div>

        {/* Thiết bị & Serial */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#2d3d35] mb-1">
              Dòng thiết bị:
            </label>
            <Input
              value={order.device}
              disabled
              className="bg-[#f5f7f6] text-[#6b7c74] cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#2d3d35] mb-1">
              Số Serial / Model:
            </label>
            <Input
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="Nhập số serial nếu có..."
            />
          </div>
        </div>

        {/* Chi phí & Chi nhánh & Kỹ thuật viên */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <CurrencyInput
              label="Tổng chi phí sửa chữa (VNĐ) *"
              value={totalPrice}
              onChangeValue={(val) => setTotalPrice(val)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#2d3d35] mb-1">
              Chi nhánh tiếp nhận:
            </label>
            <select
              value={String(selectedBranchId)}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full h-10 border border-[#d6dfda] rounded-[8px] px-2.5 text-xs text-[#1c302b] bg-white font-medium outline-none focus:border-[#75a994]"
            >
              {branches
                .filter((b) => b.id !== 'all')
                .map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name} ({b.code})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#2d3d35] mb-1">
              Kỹ thuật viên phụ trách:
            </label>
            <select
              value={selectedTechId}
              onChange={(e) => setSelectedTechId(e.target.value)}
              className="w-full h-10 border border-[#d6dfda] rounded-[8px] px-2.5 text-xs text-[#1c302b] bg-white font-medium outline-none focus:border-[#75a994]"
            >
              <option value="">Chưa phân công</option>
              {technicians.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name} ({t.phone || 'KTV'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Mô tả lỗi & Phụ kiện */}
        <div>
          <label className="block text-xs font-bold text-[#2d3d35] mb-1">
            Mô tả lỗi tiếp nhận <span className="text-red-500">*</span>:
          </label>
          <Textarea
            rows={2}
            value={issueDescription}
            onChange={(e) => setIssueDescription(e.target.value)}
            placeholder="Mô tả lỗi thiết bị..."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#2d3d35] mb-1">
              Phụ kiện gửi kèm:
            </label>
            <Input
              value={accessories}
              onChange={(e) => setAccessories(e.target.value)}
              placeholder="VD: Hộp sạc, tips tai size M, dây cáp..."
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#2d3d35] mb-1">
              Thời hạn bảo hành (ngày):
            </label>
            <Input
              type="number"
              value={warrantyDays}
              onChange={(e) => setWarrantyDays(e.target.value)}
              placeholder="90"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-[#2d3d35] mb-1">
            Ghi chú ngoại hình / hiện trạng tiếp nhận:
          </label>
          <Input
            value={appearanceNotes}
            onChange={(e) => setAppearanceNotes(e.target.value)}
            placeholder="VD: Trầy xước nhẹ nắp lưng, móp góc cấn nhẹ..."
          />
        </div>
      </div>
    </Modal>
  );
};
