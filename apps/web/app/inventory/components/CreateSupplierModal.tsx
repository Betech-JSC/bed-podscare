'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button, useToast } from '@podscare/ui';
import { supplierService, type Supplier } from '@podscare/api-client';

export interface CreateSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  supplier?: Supplier | null;
}

export const CreateSupplierModal: React.FC<CreateSupplierModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  supplier,
}) => {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    tax_code: '',
    notes: '',
    is_active: true,
  });

  useEffect(() => {
    if (isOpen) {
      if (supplier) {
        setForm({
          name: supplier.name,
          phone: supplier.phone,
          email: supplier.email || '',
          address: supplier.address || '',
          tax_code: supplier.tax_code || '',
          notes: supplier.notes || '',
          is_active: supplier.is_active,
        });
      } else {
        setForm({
          name: '',
          phone: '',
          email: '',
          address: '',
          tax_code: '',
          notes: '',
          is_active: true,
        });
      }
    }
  }, [isOpen, supplier]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      toast('Vui lòng nhập tên và số điện thoại nhà cung cấp', 'error');
      return;
    }

    setIsSaving(true);
    try {
      if (supplier) {
        await supplierService.updateSupplier(supplier.id, form);
        toast('Cập nhật thông tin nhà cung cấp thành công!', 'success');
      } else {
        await supplierService.createSupplier(form);
        toast('Tạo mới nhà cung cấp thành công!', 'success');
      }
      onClose();
      onSuccess?.();
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Có lỗi xảy ra khi lưu nhà cung cấp', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={supplier ? `Chỉnh sửa: ${supplier.name}` : 'Thêm Nhà cung cấp mới'}
      eyebrow="SUPPLIER MANAGEMENT"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-[#516158] uppercase mb-1">
            Tên Nhà cung cấp <span className="text-[#bc5b52]">*</span>
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="VD: Công ty TNHH Linh Kiện Sài Gòn"
            className="w-full px-3.5 py-2 rounded-[8px] border border-[#cde2d6] text-sm focus:outline-none focus:ring-2 focus:ring-[#176b58]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#516158] uppercase mb-1">
              Số điện thoại <span className="text-[#bc5b52]">*</span>
            </label>
            <input
              type="text"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="0901234567"
              className="w-full px-3.5 py-2 rounded-[8px] border border-[#cde2d6] text-sm focus:outline-none focus:ring-2 focus:ring-[#176b58]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#516158] uppercase mb-1">
              Mã số thuế
            </label>
            <input
              type="text"
              value={form.tax_code}
              onChange={(e) => setForm({ ...form, tax_code: e.target.value })}
              placeholder="0312345678"
              className="w-full px-3.5 py-2 rounded-[8px] border border-[#cde2d6] text-sm focus:outline-none focus:ring-2 focus:ring-[#176b58]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-[#516158] uppercase mb-1">
            Email liên hệ
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="ncc@domain.vn"
            className="w-full px-3.5 py-2 rounded-[8px] border border-[#cde2d6] text-sm focus:outline-none focus:ring-2 focus:ring-[#176b58]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-[#516158] uppercase mb-1">
            Địa chỉ kho / trụ sở
          </label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Số nhà, đường, quận/huyện, tỉnh/thành phố"
            className="w-full px-3.5 py-2 rounded-[8px] border border-[#cde2d6] text-sm focus:outline-none focus:ring-2 focus:ring-[#176b58]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-[#516158] uppercase mb-1">
            Ghi chú
          </label>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Chính sách chiết khấu, hạn nợ, cam kết chất lượng..."
            className="w-full px-3.5 py-2 rounded-[8px] border border-[#cde2d6] text-sm focus:outline-none focus:ring-2 focus:ring-[#176b58]"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e2e8e5]">
          <Button
            variant="secondary"
            type="button"
            onClick={onClose}
          >
            Hủy bỏ
          </Button>
          <Button variant="primary" type="submit" loading={isSaving}>
            {supplier ? 'Lưu thay đổi' : 'Tạo nhà cung cấp'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
