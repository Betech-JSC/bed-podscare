'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button, useToast, PaginationBar } from '@podscare/ui';
import {
  supplierService,
  type Supplier,
  type SupplierDebtTransaction,
} from '@podscare/api-client';

export interface SupplierDebtHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier | null;
}

const formatMoney = (val: number | string | undefined): string => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
};

export const SupplierDebtHistoryModal: React.FC<SupplierDebtHistoryModalProps> = ({
  isOpen,
  onClose,
  supplier,
}) => {
  const { toast } = useToast();
  const [debtTransactions, setDebtTransactions] = useState<SupplierDebtTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number | 'all'>(15);
  const [meta, setMeta] = useState<{
    total: number;
    currentPage: number;
    lastPage: number;
    from: number;
    to: number;
  }>({
    total: 0,
    currentPage: 1,
    lastPage: 1,
    from: 0,
    to: 0,
  });

  useEffect(() => {
    if (isOpen) {
      setPage(1);
    }
  }, [isOpen, supplier?.id]);

  useEffect(() => {
    if (isOpen && supplier) {
      const loadHistory = async () => {
        setIsLoading(true);
        try {
          const res = await supplierService.getDebtHistory(supplier.id, {
            page: perPage === 'all' ? 1 : page,
            per_page: perPage,
            all: perPage === 'all' ? true : undefined,
          });
          const data: any = res?.data || res;
          const list = Array.isArray(data) ? data : data?.data || [];
          setDebtTransactions(list);
          setMeta({
            total: data?.total ?? list.length,
            currentPage: data?.current_page ?? page,
            lastPage: data?.last_page ?? 1,
            from: data?.from ?? (list.length > 0 ? 1 : 0),
            to: data?.to ?? list.length,
          });
        } catch (err) {
          console.warn('Could not load debt history:', err);
          toast('Không thể tải lịch sử biến động công nợ', 'error');
        } finally {
          setIsLoading(false);
        }
      };

      loadHistory();
    }
  }, [isOpen, supplier, page, perPage, toast]);

  if (!supplier) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Sổ công nợ: ${supplier.name}`}
      eyebrow="SUPPLIER ACCOUNTS PAYABLE LEDGER"
      maxWidth="lg"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#516158] p-3 rounded-[8px] bg-[#f9faf9] border border-[#e2e8e5]">
          <span>
            Mã NCC: <strong className="font-mono text-[#176b58] font-semibold">{supplier.code}</strong>
          </span>
          <span>
            Số dư nợ hiện tại:{' '}
            <strong className="text-base text-[#bc5b52] font-bold font-mono">
              {formatMoney(supplier.debt_balance)}
            </strong>
          </span>
        </div>

        {isLoading ? (
          <div className="py-8 flex justify-center items-center text-sm text-[#6e7f77] gap-2">
            <div className="w-5 h-5 rounded-full border-2 border-[#176b58] border-t-transparent animate-spin" />
            <span>Đang tải lịch sử công nợ...</span>
          </div>
        ) : debtTransactions.length === 0 ? (
          <div className="py-8 text-center text-sm text-[#86968f]">
            Chưa có phát sinh biến động công nợ nào với nhà cung cấp này.
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto rounded-[8px] border border-[#e2e8e5]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f4f7f5] text-[#516158] uppercase font-semibold sticky top-0 z-10 border-b border-[#e2e8e5]">
                <tr>
                  <th className="py-2.5 px-3">Thời gian</th>
                  <th className="py-2.5 px-3">Mã GD</th>
                  <th className="py-2.5 px-3">Loại biến động</th>
                  <th className="py-2.5 px-3 text-right">Số tiền</th>
                  <th className="py-2.5 px-3 text-right">Dư nợ sau</th>
                  <th className="py-2.5 px-3">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef2f0]">
                {debtTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#fafbfa]">
                    <td className="py-2.5 px-3 text-[#6e7f77]">
                      {tx.created_at ? new Date(tx.created_at).toLocaleString('vi-VN') : ''}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-medium text-[#176b58]">
                      {tx.transaction_code}
                    </td>
                    <td className="py-2.5 px-3">
                      {tx.transaction_type === 'purchase_debt' ? (
                        <span className="text-[#bc5b52] font-semibold bg-[#fbefed] px-2 py-0.5 rounded border border-[#f5c7c2]">
                          + Ghi nợ nhập kho
                        </span>
                      ) : (
                        <span className="text-[#28805e] font-semibold bg-[#eaf4ef] px-2 py-0.5 rounded border border-[#c5e1d4]">
                          - Chi trả nợ
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold font-mono">
                      {formatMoney(tx.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-[#1c302b] font-mono">
                      {formatMoney(tx.debt_after)}
                    </td>
                    <td className="py-2.5 px-3 text-[#6e7f77] max-w-[150px] truncate">
                      {tx.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <PaginationBar
          testIdPrefix="supplier-debt-history"
          itemLabel="bút toán công nợ"
          compact
          currentPage={meta.currentPage}
          lastPage={meta.lastPage}
          total={meta.total}
          from={meta.from}
          to={meta.to}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={setPerPage}
          isLoading={isLoading}
        />

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  );
};
