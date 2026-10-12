'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, CurrencyInput, Textarea, useToast, Icon } from '@podscare/ui';
import { inventoryService } from '@podscare/api-client';

export interface PartOption {
  id?: number | string;
  sku: string;
  name: string;
  stock?: number;
  costPrice?: number;
}

export interface CreatePartTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  parts: PartOption[];
  branchId?: number | string;
  branchName?: string;
  defaultPartId?: number | string;
  role?: string;
}

export const CreatePartTransactionModal: React.FC<CreatePartTransactionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  parts,
  branchId = 1,
  branchName = 'Kho chính',
  defaultPartId,
  role = 'admin',
}) => {
  const { toast } = useToast();

  const [txPartId, setTxPartId] = useState<number | string>(defaultPartId || '');
  const [txType, setTxType] = useState<string>('import');
  const [txQuantity, setTxQuantity] = useState<number>(1);
  const [txCost, setTxCost] = useState<number | ''>('');
  const [txSupplier, setTxSupplier] = useState<string>('');
  const [txNotes, setTxNotes] = useState<string>('');
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (defaultPartId) {
        setTxPartId(defaultPartId);
      } else if (parts.length > 0 && !txPartId) {
        setTxPartId(parts[0].id || '');
      }
    }
  }, [isOpen, defaultPartId, parts, txPartId]);

  const handleReset = () => {
    setTxQuantity(1);
    setTxCost('');
    setTxSupplier('');
    setTxNotes('');
    setTxType('import');
  };

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txPartId) {
      toast('Vui lòng chọn linh kiện', 'error');
      return;
    }
    if (!txQuantity || txQuantity <= 0) {
      toast('Số lượng giao dịch phải lớn hơn 0', 'error');
      return;
    }

    setIsSubmittingTx(true);
    try {
      await inventoryService.createTransaction({
        part_id: txPartId,
        branch_id: Number(branchId) || 1,
        transaction_type: txType,
        quantity: txQuantity,
        unit_cost: role === 'admin' && typeof txCost === 'number' ? txCost : undefined,
        supplier_name: txSupplier.trim() || undefined,
        notes: txNotes.trim() || undefined,
      });

      const typeLabel =
        txType === 'import'
          ? 'nhập kho'
          : txType === 'export_repair'
          ? 'xuất sửa chữa'
          : txType === 'export_damage'
          ? 'xuất hỏng / hao hụt'
          : 'điều chỉnh kho';

      toast(`Tạo phiếu ${typeLabel} thành công!`, 'success');
      handleReset();
      onClose();
      onSuccess?.();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Không thể tạo giao dịch kho', 'error');
    } finally {
      setIsSubmittingTx(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      eyebrow="INVENTORY TRANSACTION"
      title="Tạo giao dịch nhập / xuất kho"
      subtitle="Cập nhật biến động số lượng linh kiện trực tiếp vào cơ sở dữ liệu."
      footer={
        <div className="flex justify-end gap-2.5 w-full">
          <Button
            variant="secondary"
            size="md"
            disabled={isSubmittingTx}
            onClick={onClose}
          >
            Hủy
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={isSubmittingTx}
            onClick={handleCreateTransaction}
          >
            {isSubmittingTx ? 'Đang lưu...' : 'Xác nhận tạo phiếu'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleCreateTransaction} className="space-y-4 text-sm">
        <div>
          <label className="block text-xs font-bold text-[#556960] mb-1">
            Kho chi nhánh thực hiện giao dịch
          </label>
          <div className="h-10 border border-[#d6dfda] rounded-[8px] px-3 bg-[#f7f9f7] text-xs font-semibold text-[#176b58] flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Icon name="building" size={14} className="text-[#176b58]" />
              <span>{branchName}</span>
            </span>
            <span className="text-[11px] text-[#788880] font-normal">
              {role === 'admin' ? '(Theo bộ lọc đang chọn)' : 'Gán tự động theo kho của bạn'}
            </span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-[#556960] mb-1">
            Chọn linh kiện <span className="text-[#bc5b52]">*</span>
          </label>
          <select
            value={txPartId}
            onChange={(e) => setTxPartId(e.target.value)}
            required
            className="w-full h-10 border border-[#d6dfda] rounded-[8px] px-3 text-sm text-[#1c302b] bg-white outline-none focus:border-[#75a994]"
          >
            <option value="">-- Chọn linh kiện --</option>
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} - {p.name} {p.stock !== undefined ? `(Tồn: ${p.stock})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#556960] mb-1">
              Loại giao dịch <span className="text-[#bc5b52]">*</span>
            </label>
            <select
              value={txType}
              onChange={(e) => setTxType(e.target.value)}
              className="w-full h-10 border border-[#d6dfda] rounded-[8px] px-3 text-sm text-[#1c302b] bg-white outline-none focus:border-[#75a994]"
            >
              <option value="import">Nhập kho (Nhà cung cấp)</option>
              <option value="export_repair">Xuất sửa chữa</option>
              <option value="export_damage">Xuất hỏng / hao hụt</option>
              <option value="adjust_inventory">Điều chỉnh kiểm kê</option>
            </select>
          </div>
          <div>
            <Input
              label="Số lượng"
              type="number"
              min="1"
              required
              value={String(txQuantity)}
              onChange={(e) => setTxQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
        </div>

        {role === 'admin' ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <CurrencyInput
                label="Đơn giá vốn nhập (nếu có)"
                placeholder="Ví dụ: 250.000"
                value={txCost}
                onChangeValue={(val, formatted) => setTxCost(formatted ? val : '')}
              />
            </div>
            <div>
              <Input
                label="Nhà cung cấp / Đối tác"
                placeholder="Apple OEM Parts..."
                value={txSupplier}
                onChange={(e) => setTxSupplier(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div>
            <Input
              label="Nhà cung cấp / Đối tác"
              placeholder="Apple OEM Parts..."
              value={txSupplier}
              onChange={(e) => setTxSupplier(e.target.value)}
            />
            <p className="text-xs text-[#809088] mt-1.5 mb-0 italic">
              * Đơn giá vốn sẽ được hệ thống tự động kế thừa theo danh mục giá vốn quy định.
            </p>
          </div>
        )}

        <div>
          <Textarea
            label="Ghi chú giao dịch"
            rows={2}
            placeholder="Nhập ghi chú hoặc lý do nhập/xuất..."
            value={txNotes}
            onChange={(e) => setTxNotes(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
};
