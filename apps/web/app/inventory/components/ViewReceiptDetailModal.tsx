'use client';

import React from 'react';
import { Modal, Button } from '@podscare/ui';
import type { GoodsReceipt } from '@podscare/api-client';

export interface ViewReceiptDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: GoodsReceipt | null;
}

const formatMoney = (val: number | string | undefined): string => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
};

export const ViewReceiptDetailModal: React.FC<ViewReceiptDetailModalProps> = ({
  isOpen,
  onClose,
  receipt,
}) => {
  if (!receipt) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Chi tiết phiếu: ${receipt.receipt_code}`}
      eyebrow="GOODS RECEIPT DETAIL"
      maxWidth="md"
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3 p-3 rounded-[8px] bg-[#f9faf9] border border-[#e2e8e5] text-xs">
          <div>
            <span className="text-[#6e7f77] block">Nhà cung cấp:</span>
            <strong className="text-sm text-[#1c302b]">{receipt.supplier?.name || '—'}</strong>
          </div>
          <div>
            <span className="text-[#6e7f77] block">Chi nhánh nhập:</span>
            <strong className="text-sm text-[#1c302b]">{receipt.branch?.name || '—'}</strong>
          </div>
          <div>
            <span className="text-[#6e7f77] block">Thời gian tạo:</span>
            <span className="font-medium text-[#1c302b]">
              {receipt.created_at ? new Date(receipt.created_at).toLocaleString('vi-VN') : '—'}
            </span>
          </div>
          <div>
            <span className="text-[#6e7f77] block">Phương thức thanh toán:</span>
            <span className="font-semibold text-[#176b58]">
              {receipt.payment_method === 'cash'
                ? 'Tiền mặt (Trừ két ca trực)'
                : receipt.payment_method === 'bank_transfer'
                ? 'Chuyển khoản ngân hàng'
                : 'Ghi nợ'}
            </span>
          </div>
          <div>
            <span className="text-[#6e7f77] block">Tổng tiền hàng:</span>
            <strong className="text-[#1c302b]">{formatMoney(receipt.total_amount)}</strong>
          </div>
          <div>
            <span className="text-[#6e7f77] block">Chiết khấu:</span>
            <strong className="text-[#1c302b]">{formatMoney(receipt.discount_amount)}</strong>
          </div>
          <div>
            <span className="text-[#6e7f77] block">Đã thanh toán ngay:</span>
            <strong className="text-[#27ae60]">{formatMoney(receipt.paid_amount)}</strong>
          </div>
          <div>
            <span className="text-[#6e7f77] block">Công nợ ghi nhận:</span>
            <strong className={Number(receipt.debt_amount) > 0 ? 'text-[#bc5b52]' : 'text-[#6e7f77]'}>
              {formatMoney(receipt.debt_amount)}
            </strong>
          </div>
        </div>

        {receipt.notes && (
          <div className="text-xs p-2.5 rounded-[6px] bg-[#fdfdfd] border border-[#edf1ee]">
            <span className="text-[#7c8b84] block font-bold mb-0.5 uppercase tracking-wider text-[10px]">
              Ghi chú:
            </span>
            <p className="text-[#47574f] m-0">{receipt.notes}</p>
          </div>
        )}

        <div>
          <h4 className="text-xs font-bold text-[#516158] uppercase mb-2">
            Danh mục linh kiện nhập kho ({receipt.items?.length || 0})
          </h4>
          <div className="rounded-[8px] border border-[#e2e8e5] overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#f4f7f5] text-[#516158] font-semibold">
                <tr>
                  <th className="py-2 px-3">Linh kiện</th>
                  <th className="py-2 px-3 text-center">SL</th>
                  <th className="py-2 px-3 text-right">Đơn giá</th>
                  <th className="py-2 px-3 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef2f0]">
                {receipt.items && receipt.items.length > 0 ? (
                  receipt.items.map((item: any) => (
                    <tr key={item.id}>
                      <td className="py-2 px-3 font-medium">
                        <div>{item.part?.name || `Part #${item.part_id}`}</div>
                        {item.part?.sku && (
                          <div className="text-[10px] font-mono text-[#86968f]">{item.part.sku}</div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-bold font-mono">
                        {item.quantity}
                      </td>
                      <td className="py-2 px-3 text-right text-[#516158] font-mono">
                        {formatMoney(item.unit_price)}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-[#1c302b] font-mono">
                        {formatMoney(item.total_price)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-3 text-center text-[#86968f]">
                      Không có chi tiết mặt hàng
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  );
};
