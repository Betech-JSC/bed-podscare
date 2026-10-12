'use client';

import React, { useState } from 'react';
import {
  Button,
  StatusTag,
  FilterBar,
  EmptyState,
  TableSkeleton,
  ErrorFallback,
} from '@podscare/ui';
import {
  supplierService,
  type GoodsReceipt,
  type Supplier,
} from '@podscare/api-client';
import { useQuery } from '@tanstack/react-query';
import { ViewReceiptDetailModal } from './ViewReceiptDetailModal';
import { CreateGoodsReceiptModal, type PartSelectItem } from './CreateGoodsReceiptModal';

export interface ReceiptsTabProps {
  suppliers: Supplier[];
  parts: PartSelectItem[];
  drawerBalance?: { current_cash_balance: number; has_active_shift: boolean } | null;
  onCheckDrawer?: () => void;
  onRefreshAll?: () => void;
}

const formatMoney = (val: number | string | undefined): string => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
};

export const ReceiptsTab: React.FC<ReceiptsTabProps> = ({
  suppliers,
  parts,
  drawerBalance,
  onCheckDrawer,
  onRefreshAll,
}) => {
  const [receiptSearch, setReceiptSearch] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<GoodsReceipt | null>(null);
  const [viewDetailModalOpen, setViewDetailModalOpen] = useState(false);
  const [createReceiptModalOpen, setCreateReceiptModalOpen] = useState(false);

  const {
    data: apiReceiptsData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['goods-receipts', receiptSearch],
    queryFn: async () => {
      const res = await supplierService.getGoodsReceipts({
        search: receiptSearch.trim() || undefined,
        per_page: 50,
      });
      const data = res?.data;
      return Array.isArray(data) ? data : (data as any)?.data || [];
    },
  });

  const receipts: GoodsReceipt[] = Array.isArray(apiReceiptsData) ? apiReceiptsData : [];

  const handleOpenDetail = (gr: GoodsReceipt) => {
    setSelectedReceipt(gr);
    setViewDetailModalOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Sub-header & Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-[#87958e] uppercase tracking-wider">
          <span>PHIẾU NHẬP KHO CHÍNH QUY (MAC)</span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#176b58]" />
          <span className="text-[#176b58] font-bold">{receipts.length} Phiếu</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setReceiptSearch('');
              refetch();
            }}
          >
            Làm mới
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateReceiptModalOpen(true)}
          >
            + Lập phiếu nhập kho
          </Button>
        </div>
      </div>

      <FilterBar
        searchValue={receiptSearch}
        onSearchChange={setReceiptSearch}
        searchPlaceholder="Tìm kiếm mã phiếu nhập hoặc tên nhà cung cấp..."
      />

      {isError ? (
        <ErrorFallback onRetry={() => refetch()} />
      ) : isLoading ? (
        <TableSkeleton rows={6} cols={9} />
      ) : receipts.length === 0 ? (
        <EmptyState
          title="Chưa có phiếu nhập kho nào"
          description="Lập phiếu nhập kho linh kiện để tự động tính Giá vốn bình quân di động (MAC) và ghi nhận công nợ."
          actionLabel="+ Lập phiếu nhập kho ngay"
          onAction={() => setCreateReceiptModalOpen(true)}
        />
      ) : (
        <div className="bg-white rounded-[10px] border border-[#e5ece8] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse min-w-[800px]">
              <thead className="bg-[#fafbfa] border-b border-[#e5ece8] text-xs font-bold text-[#8fa096] uppercase tracking-wider h-10">
                <tr>
                  <th className="py-2.5 px-4">Mã phiếu</th>
                  <th className="py-2.5 px-4">Nhà cung cấp</th>
                  <th className="py-2.5 px-4">Chi nhánh</th>
                  <th className="py-2.5 px-4 text-right">Tổng tiền hàng</th>
                  <th className="py-2.5 px-4 text-right">Thanh toán ngay</th>
                  <th className="py-2.5 px-4 text-right">Ghi nợ NCC</th>
                  <th className="py-2.5 px-4 text-center">Phương thức</th>
                  <th className="py-2.5 px-4 text-center">Trạng thái</th>
                  <th className="py-2.5 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f3f2]">
                {receipts.map((gr) => (
                  <tr key={gr.id} className="hover:bg-[#fafcfa] transition-colors h-12">
                    <td className="py-3 px-4 font-mono font-bold text-[#176b58]">
                      {gr.receipt_code}
                      <div className="text-[11px] text-[#86968f] font-normal">
                        {gr.created_at ? new Date(gr.created_at).toLocaleString('vi-VN') : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#1c302b]">
                      {gr.supplier?.name || '—'}
                    </td>
                    <td className="py-3 px-4 text-xs text-[#516158]">
                      {gr.branch?.name || '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-medium font-mono">
                      {formatMoney(gr.final_amount)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-[#28805e] font-mono">
                      {formatMoney(gr.paid_amount)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold font-mono">
                      {Number(gr.debt_amount) > 0 ? (
                        <span className="text-[#bc5b52]">{formatMoney(gr.debt_amount)}</span>
                      ) : (
                        <span className="text-[#6e7f77]">0 ₫</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center text-xs">
                      <span className="bg-[#f0f4f2] text-[#4a5e52] px-2 py-0.5 rounded font-medium">
                        {gr.payment_method === 'cash'
                          ? 'Tiền mặt'
                          : gr.payment_method === 'bank_transfer'
                          ? 'Chuyển khoản'
                          : 'Ghi nợ'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <StatusTag label="Hoàn tất" type="ready" />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenDetail(gr)}
                        className="text-xs font-semibold px-2.5 py-1"
                      >
                        Chi tiết
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View Detail Modal */}
      <ViewReceiptDetailModal
        isOpen={viewDetailModalOpen}
        onClose={() => setViewDetailModalOpen(false)}
        receipt={selectedReceipt}
      />

      {/* Create Goods Receipt Modal */}
      <CreateGoodsReceiptModal
        isOpen={createReceiptModalOpen}
        onClose={() => setCreateReceiptModalOpen(false)}
        onSuccess={() => {
          refetch();
          onRefreshAll?.();
        }}
        suppliers={suppliers}
        parts={parts}
        drawerBalance={drawerBalance}
        onCheckDrawer={onCheckDrawer}
      />
    </div>
  );
};
