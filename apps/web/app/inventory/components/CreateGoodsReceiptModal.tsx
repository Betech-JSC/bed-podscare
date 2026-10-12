'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Button, Icon, useToast } from '@podscare/ui';
import { supplierService, type Supplier } from '@podscare/api-client';

export interface PartSelectItem {
  id?: number | string;
  sku: string;
  name: string;
  stock_quantity?: number;
  stock?: number;
  cost_price?: number | string;
  costPrice?: number;
}

export interface CreateGoodsReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  suppliers: Supplier[];
  parts: PartSelectItem[];
  drawerBalance?: { current_cash_balance: number; has_active_shift: boolean } | null;
  onCheckDrawer?: () => void;
}

const formatMoney = (val: number | string | undefined): string => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
};

export const CreateGoodsReceiptModal: React.FC<CreateGoodsReceiptModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  suppliers,
  parts,
  drawerBalance,
  onCheckDrawer,
}) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptSupplierId, setReceiptSupplierId] = useState<number | string>('');
  const [receiptItems, setReceiptItems] = useState<
    Array<{ part_id: number; quantity: number; unit_price: number }>
  >([{ part_id: 0, quantity: 1, unit_price: 0 }]);
  const [receiptDiscount, setReceiptDiscount] = useState('0');
  const [receiptPaidAmount, setReceiptPaidAmount] = useState('0');
  const [receiptPaymentMethod, setReceiptPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [receiptNotes, setReceiptNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (suppliers.length > 0 && !receiptSupplierId) {
        setReceiptSupplierId(suppliers[0].id);
      }
      const initialPart = parts[0];
      const initialCost = Number(initialPart?.cost_price ?? initialPart?.costPrice) || 0;
      setReceiptItems([
        {
          part_id: Number(initialPart?.id) || 0,
          quantity: 1,
          unit_price: initialCost,
        },
      ]);
      setReceiptDiscount('0');
      setReceiptPaidAmount('0');
      setReceiptPaymentMethod('cash');
      setReceiptNotes('');
      onCheckDrawer?.();
    }
  }, [isOpen, suppliers, parts, receiptSupplierId, onCheckDrawer]);

  const handleAddReceiptItem = () => {
    const defaultPart = parts[0];
    const defaultCost = Number(defaultPart?.cost_price ?? defaultPart?.costPrice) || 0;
    setReceiptItems((prev) => [
      ...prev,
      {
        part_id: Number(defaultPart?.id) || 0,
        quantity: 1,
        unit_price: defaultCost,
      },
    ]);
  };

  const handleRemoveReceiptItem = (index: number) => {
    if (receiptItems.length <= 1) {
      toast('Phiếu nhập kho phải có ít nhất 1 linh kiện', 'error');
      return;
    }
    setReceiptItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    setReceiptItems((prev) => {
      const next = [...prev];
      if (field === 'part_id') {
        const partId = Number(value);
        const p = parts.find((item) => Number(item.id) === partId);
        const autoCost = Number(p?.cost_price ?? p?.costPrice) || 0;
        next[index] = {
          ...next[index],
          part_id: partId,
          unit_price: autoCost || next[index].unit_price,
        };
      } else {
        next[index] = { ...next[index], [field]: Number(value) };
      }
      return next;
    });
  };

  const receiptTotalAmount = useMemo(() => {
    return receiptItems.reduce((sum, item) => sum + (item.quantity * item.unit_price || 0), 0);
  }, [receiptItems]);

  const receiptFinalAmount = useMemo(() => {
    const disc = Number(receiptDiscount) || 0;
    return Math.max(0, receiptTotalAmount - disc);
  }, [receiptTotalAmount, receiptDiscount]);

  const receiptDebtAmount = useMemo(() => {
    const paid = Number(receiptPaidAmount) || 0;
    return Math.max(0, receiptFinalAmount - paid);
  }, [receiptFinalAmount, receiptPaidAmount]);

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptSupplierId) {
      toast('Vui lòng chọn nhà cung cấp', 'error');
      return;
    }

    const invalidItem = receiptItems.find((it) => !it.part_id || it.quantity <= 0);
    if (invalidItem) {
      toast('Vui lòng chọn linh kiện và nhập số lượng lớn hơn 0 cho mọi dòng', 'error');
      return;
    }

    const paid = Number(receiptPaidAmount) || 0;
    if (paid > receiptFinalAmount) {
      toast('Số tiền trả ngay không thể lớn hơn tổng tiền phiếu nhập sau chiết khấu', 'error');
      return;
    }

    if (paid > 0 && receiptPaymentMethod === 'cash') {
      if (!drawerBalance?.has_active_shift) {
        toast('Chi nhánh chưa mở ca trực! Không thể chi tiền mặt từ két.', 'error');
        return;
      }
      if (drawerBalance.current_cash_balance < paid) {
        toast(
          `Két tiền mặt không đủ (${formatMoney(drawerBalance.current_cash_balance)} < ${formatMoney(paid)})`,
          'error'
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await supplierService.createGoodsReceipt({
        supplier_id: Number(receiptSupplierId),
        items: receiptItems.map((it) => ({
          part_id: Number(it.part_id),
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
        })),
        discount_amount: Number(receiptDiscount) || 0,
        paid_amount: paid,
        payment_method: paid > 0 ? receiptPaymentMethod : 'none',
        notes: receiptNotes.trim() || undefined,
      });

      toast('Tạo phiếu nhập kho và cập nhật giá vốn MAC thành công!', 'success');
      onClose();
      onSuccess?.();
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Lỗi tạo phiếu nhập kho', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Lập phiếu nhập kho linh kiện chính quy"
      eyebrow="GOODS RECEIPT & MAC VALUATION"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmitReceipt} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#516158] uppercase mb-1">
              Nhà cung cấp <span className="text-[#bc5b52]">*</span>
            </label>
            <select
              required
              value={receiptSupplierId}
              onChange={(e) => setReceiptSupplierId(e.target.value)}
              className="w-full px-3.5 py-2 rounded-[8px] border border-[#cde2d6] text-sm focus:outline-none focus:ring-2 focus:ring-[#176b58] bg-white font-medium"
            >
              <option value="">-- Chọn Nhà cung cấp --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code}) - Dư nợ: {formatMoney(s.debt_balance)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#516158] uppercase mb-1">
              Ghi chú phiếu nhập
            </label>
            <input
              type="text"
              value={receiptNotes}
              onChange={(e) => setReceiptNotes(e.target.value)}
              placeholder="VD: Lô hàng nhập linh kiện thay thế đợt 1..."
              className="w-full px-3.5 py-2 rounded-[8px] border border-[#cde2d6] text-sm focus:outline-none focus:ring-2 focus:ring-[#176b58]"
            />
          </div>
        </div>

        {/* Danh sách linh kiện nhập */}
        <div className="border border-[#e2e8e5] rounded-[10px] p-3.5 space-y-3 bg-[#fafbfa]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#516158] uppercase tracking-wider">
              Danh mục linh kiện nhập kho ({receiptItems.length})
            </span>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={handleAddReceiptItem}
              className="text-xs font-semibold px-2.5 py-1"
            >
              + Thêm dòng linh kiện
            </Button>
          </div>

          <div className="space-y-2.5">
            {receiptItems.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2.5 bg-white p-2.5 rounded-[8px] border border-[#e2e8e5]"
              >
                <div className="flex-1">
                  <select
                    value={item.part_id}
                    onChange={(e) => handleItemChange(idx, 'part_id', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-[6px] border border-[#cde2d6] text-xs bg-white font-medium outline-none focus:border-[#176b58]"
                  >
                    <option value={0}>-- Chọn linh kiện --</option>
                    {parts.map((p) => {
                      const qty = p.stock_quantity ?? p.stock ?? 0;
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} [{p.sku}] - Tồn: {qty}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="w-20">
                  <input
                    type="number"
                    min={1}
                    placeholder="SL"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                    className="w-full px-2 py-1.5 rounded-[6px] border border-[#cde2d6] text-xs text-center font-bold"
                  />
                </div>

                <div className="w-32">
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    placeholder="Đơn giá nhập"
                    value={item.unit_price}
                    onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)}
                    className="w-full px-2 py-1.5 rounded-[6px] border border-[#cde2d6] text-xs text-right font-semibold"
                  />
                </div>

                <div className="w-28 text-right font-bold text-xs text-[#1c302b] font-mono">
                  {formatMoney(item.quantity * item.unit_price)}
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveReceiptItem(idx)}
                  className="text-[#bc5b52] hover:text-[#9c3f37] p-1 transition-colors"
                  title="Xóa dòng"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Khối tính toán tiền và phân bổ công nợ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-[10px] bg-[#f7f9f8] border border-[#e2e8e5]">
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[#6e7f77]">Tổng tiền hàng:</span>
              <span className="font-semibold text-sm font-mono">{formatMoney(receiptTotalAmount)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#6e7f77]">Chiết khấu giảm giá:</span>
              <input
                type="number"
                min={0}
                value={receiptDiscount}
                onChange={(e) => setReceiptDiscount(e.target.value)}
                className="w-28 px-2 py-1 text-right rounded border border-[#cde2d6] text-xs font-semibold font-mono"
              />
            </div>
            <div className="flex justify-between border-t border-[#e2e8e5] pt-1.5 font-bold">
              <span>Tiền sau chiết khấu:</span>
              <span className="text-sm text-[#176b58] font-mono">{formatMoney(receiptFinalAmount)}</span>
            </div>
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="block text-[11px] font-bold text-[#516158] uppercase mb-1">
                Thanh toán ngay cho NCC (VND)
              </label>
              <input
                type="number"
                min={0}
                max={receiptFinalAmount}
                value={receiptPaidAmount}
                onChange={(e) => setReceiptPaidAmount(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-[6px] border border-[#cde2d6] text-sm font-bold text-right font-mono"
              />
            </div>

            {Number(receiptPaidAmount) > 0 && (
              <div>
                <label className="block text-[11px] font-bold text-[#516158] uppercase mb-1">
                  Phương thức thanh toán
                </label>
                <select
                  value={receiptPaymentMethod}
                  onChange={(e) => setReceiptPaymentMethod(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded-[6px] border border-[#cde2d6] text-xs bg-white font-medium"
                >
                  <option value="cash">Tiền mặt (Trừ ca trực)</option>
                  <option value="bank_transfer">Chuyển khoản ngân hàng</option>
                </select>
              </div>
            )}

            <div className="flex justify-between items-center border-t border-[#e2e8e5] pt-1.5 text-xs font-bold">
              <span className="text-[#bc5b52]">Số tiền ghi nợ NCC:</span>
              <span className="text-sm text-[#bc5b52] font-mono">{formatMoney(receiptDebtAmount)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e2e8e5]">
          <Button
            variant="secondary"
            type="button"
            onClick={onClose}
          >
            Hủy bỏ
          </Button>
          <Button variant="primary" type="submit" loading={isSubmitting}>
            Xác nhận nhập kho & tính MAC
          </Button>
        </div>
      </form>
    </Modal>
  );
};
