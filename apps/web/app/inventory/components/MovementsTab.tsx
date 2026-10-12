'use client';

import React, { useState, useMemo } from 'react';
import {
  Button,
  EmptyState,
  TableSkeleton,
  ErrorFallback,
  Icon,
} from '@podscare/ui';
import {
  inventoryService,
  type InventoryTransactionItem,
} from '@podscare/api-client';
import { useQuery } from '@tanstack/react-query';
import { CreatePartTransactionModal, type PartOption } from './CreatePartTransactionModal';
import type { BranchOption } from './StockTab';

export interface MovementsTabProps {
  role?: string;
  currentUser?: any;
  branch?: string;
  branchId?: string | number;
  branches: BranchOption[];
  parts: PartOption[];
  onRefreshAll?: () => void;
}

const formatMoney = (val: number | string | undefined): string => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
};

export const MovementsTab: React.FC<MovementsTabProps> = ({
  role = 'admin',
  currentUser,
  branch = 'FIXO · Quận 1',
  branchId = 1,
  branches,
  parts,
  onRefreshAll,
}) => {
  const [search, setSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>(String(branchId || '1'));
  const [selectedType, setSelectedType] = useState<string>('');
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);

  // Sync warehouse filter when context branchId changes or for non-admin
  React.useEffect(() => {
    if (role !== 'admin') {
      const userBranchId = currentUser?.branch_id || branchId || 1;
      setSelectedBranch(String(userBranchId));
    } else if (branchId !== undefined && branchId !== null) {
      setSelectedBranch(String(branchId));
    }
  }, [branchId, role, currentUser]);

  const {
    data: apiTxData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['inventory-transactions', selectedBranch, selectedType],
    queryFn: async () => {
      const res = await inventoryService.getTransactions({
        branch_id: selectedBranch && selectedBranch !== 'all' ? Number(selectedBranch) : undefined,
        transaction_type: selectedType || undefined,
        per_page: 100,
      });
      const data = res?.data;
      return Array.isArray(data) ? data : (data as any)?.data || [];
    },
  });

  const transactions: InventoryTransactionItem[] = useMemo(() => {
    return Array.isArray(apiTxData) ? apiTxData : [];
  }, [apiTxData]);

  // Filter by search keyword on client
  const filtered = useMemo(() => {
    if (!search.trim()) return transactions;
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      const txCode = (tx.id ? String(tx.id) : '').toLowerCase();
      const partName = (tx.part?.name || '').toLowerCase();
      const partSku = (tx.part?.sku || '').toLowerCase();
      const notes = (tx.notes || '').toLowerCase();
      const orderCode = (tx.repair_order?.order_code || '').toLowerCase();
      return (
        txCode.includes(q) ||
        partName.includes(q) ||
        partSku.includes(q) ||
        notes.includes(q) ||
        orderCode.includes(q)
      );
    });
  }, [transactions, search]);

  const currentWarehouseName =
    selectedBranch === 'all'
      ? 'Toàn bộ chi nhánh'
      : branches.find((b) => String(b.id) === selectedBranch)?.name || branch;

  const renderTypeBadge = (type: string) => {
    switch (type) {
      case 'import':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-[#eaf4ef] text-[#28805e] border border-[#c5e1d4]">
            <span>Nhập kho</span>
          </span>
        );
      case 'export_repair':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-[#edf4f8] text-[#4778a4] border border-[#cbdfe9]">
            <span>Xuất sửa chữa</span>
          </span>
        );
      case 'export_damage':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-[#fbefed] text-[#bc5b52] border border-[#f5c7c2]">
            <span>Xuất hao hụt/hỏng</span>
          </span>
        );
      case 'adjust_inventory':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-[#faf3e7] text-[#b77a21] border border-[#edd9b7]">
            <span>Điều chỉnh kiểm kê</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-[#f0f3f1] text-[#77847e]">
            <span>{type}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-header & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-[#87958e] uppercase tracking-wider">
          <span>THẺ KHO & LỊCH SỬ BIẾN ĐỘNG TOÀN CHUỖI</span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#176b58]" />
          <span className="text-[#176b58] font-bold">{currentWarehouseName}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSearch('');
              setSelectedType('');
              refetch();
            }}
          >
            Làm mới
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setTransactionModalOpen(true)}
          >
            + Tạo giao dịch kho
          </Button>
        </div>
      </div>

      {/* Filter Strip */}
      <div className="bg-white rounded-[10px] border border-[#e5ece8] p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#f0f3f1]">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[300px]">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-[280px]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã SKU, tên linh kiện, mã đơn..."
                className="w-full h-9 pl-3 pr-3 border border-[#e4eae6] rounded-[8px] text-xs text-[#2b3a32] bg-white outline-none focus:border-[#75a994] focus:ring-2 focus:ring-[#176b58]/10 transition-all placeholder:text-[#9aa59f]"
              />
            </div>

            {/* Warehouse Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#7c8b84] font-medium hidden sm:inline">Kho:</span>
              {role === 'admin' ? (
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="h-9 border border-[#d6dfda] rounded-[8px] px-2.5 text-xs text-[#1c302b] bg-[#f9fbf9] font-medium outline-none focus:border-[#75a994] cursor-pointer"
                >
                  <option value="all">Tất cả chi nhánh / kho</option>
                  {branches
                    .filter((b) => b.id !== 'all')
                    .map((b) => (
                      <option key={b.id} value={String(b.id)}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                </select>
              ) : (
                <div className="h-9 border border-[#d6dfda] rounded-[8px] px-2.5 text-xs text-[#176b58] bg-[#eaf4ef] font-semibold flex items-center gap-1.5 cursor-default select-none pointer-events-none">
                  <Icon name="building" size={14} className="text-[#176b58]" />
                  <span>{branch}</span>
                </div>
              )}
            </div>

            {/* Transaction Type Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#7c8b84] font-medium hidden sm:inline">Loại GD:</span>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="h-9 border border-[#e4eae6] rounded-[8px] px-2.5 text-xs text-[#4c5c54] bg-white outline-none focus:border-[#75a994] cursor-pointer"
              >
                <option value="">Tất cả loại giao dịch</option>
                <option value="import">Nhập kho (NCC)</option>
                <option value="export_repair">Xuất sửa chữa</option>
                <option value="export_damage">Xuất hỏng / hao hụt</option>
                <option value="adjust_inventory">Điều chỉnh kiểm kê</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table / Skeleton / Empty State */}
        {isError ? (
          <ErrorFallback onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={6} cols={9} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Chưa có bản ghi biến động kho nào"
            description="Lịch sử nhập kho, xuất máy sửa chữa và điều chỉnh kiểm kê sẽ được ghi nhận tự động tại đây."
            actionLabel="+ Tạo giao dịch kho ngay"
            onAction={() => setTransactionModalOpen(true)}
          />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0 mt-3">
            <table className="w-full text-left border-collapse min-w-[850px]">
              <thead>
                <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#8fa096] uppercase tracking-wider h-9">
                  <th className="px-3">Thời gian</th>
                  <th className="px-3">Linh kiện</th>
                  <th className="px-3">Kho chi nhánh</th>
                  <th className="px-3">Loại biến động</th>
                  <th className="px-3 text-center">SL thay đổi</th>
                  {role === 'admin' && <th className="px-3 text-right">Giá vốn (MAC)</th>}
                  <th className="px-3">Đơn sửa chữa</th>
                  <th className="px-3">Nhân sự</th>
                  <th className="px-3">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f3f2] text-sm">
                {filtered.map((tx: any) => {
                  const isExport = tx.transaction_type === 'export_repair' || tx.transaction_type === 'export_damage';
                  return (
                    <tr key={tx.id} className="h-12 hover:bg-[#fafcfa] transition-colors">
                      <td className="px-3 text-xs text-[#6e7f77] whitespace-nowrap">
                        {tx.created_at ? new Date(tx.created_at).toLocaleString('vi-VN') : '—'}
                      </td>
                      <td className="px-3 font-medium text-[#1c302b]">
                        <div>{tx.part?.name || `Part #${tx.part_id}`}</div>
                        {tx.part?.sku && (
                          <div className="text-[10px] font-mono text-[#176b58] font-bold">
                            {tx.part.sku}
                          </div>
                        )}
                      </td>
                      <td className="px-3 text-xs text-[#47574f]">
                        <span className="font-semibold">{tx.branch?.name || '—'}</span>
                      </td>
                      <td className="px-3">
                        {renderTypeBadge(tx.transaction_type)}
                      </td>
                      <td className="px-3 text-center font-bold font-mono">
                        <span
                          className={
                            isExport
                              ? 'text-[#bc5b52]'
                              : 'text-[#28805e]'
                          }
                        >
                          {isExport ? `-${tx.quantity}` : `+${tx.quantity}`}
                        </span>
                      </td>
                      {role === 'admin' && (
                        <td className="px-3 text-right font-mono text-xs font-semibold text-[#176b58]">
                          {tx.unit_cost !== undefined && tx.unit_cost !== null
                            ? formatMoney(tx.unit_cost)
                            : '—'}
                        </td>
                      )}
                      <td className="px-3 font-mono text-xs">
                        {tx.repair_order?.order_code ? (
                          <span className="px-2 py-0.5 rounded bg-[#e8f2ec] text-[#176b58] font-bold">
                            {tx.repair_order.order_code}
                          </span>
                        ) : (
                          <span className="text-[#9aa59f]">—</span>
                        )}
                      </td>
                      <td className="px-3 text-xs text-[#556960]">
                        {tx.created_by_user?.name || 'Hệ thống'}
                      </td>
                      <td className="px-3 text-xs text-[#6e7f77] max-w-[180px] truncate">
                        {tx.notes || tx.supplier_name || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Transaction Modal */}
      <CreatePartTransactionModal
        isOpen={transactionModalOpen}
        onClose={() => setTransactionModalOpen(false)}
        onSuccess={() => {
          refetch();
          onRefreshAll?.();
        }}
        parts={parts}
        branchId={selectedBranch === 'all' ? 1 : Number(selectedBranch) || 1}
        branchName={currentWarehouseName}
        role={role}
      />
    </div>
  );
};
