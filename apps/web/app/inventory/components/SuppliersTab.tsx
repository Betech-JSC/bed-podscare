'use client';

import React, { useState, useMemo } from 'react';
import {
  Button,
  StatusTag,
  FilterBar,
  EmptyState,
  TableSkeleton,
  ErrorFallback,
  StatCard,
  PaginationBar,
} from '@podscare/ui';
import {
  supplierService,
  type Supplier,
} from '@podscare/api-client';
import { useQuery } from '@tanstack/react-query';
import { CreateSupplierModal } from './CreateSupplierModal';
import { RepaySupplierDebtModal } from './RepaySupplierDebtModal';
import { SupplierDebtHistoryModal } from './SupplierDebtHistoryModal';
import { CreateGoodsReceiptModal, type PartSelectItem } from './CreateGoodsReceiptModal';

export interface SuppliersTabProps {
  parts: PartSelectItem[];
  drawerBalance?: { current_cash_balance: number; has_active_shift: boolean } | null;
  onCheckDrawer?: () => void;
  onRefreshAll?: () => void;
}

const formatMoney = (val: number | string | undefined): string => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
};

export const SuppliersTab: React.FC<SuppliersTabProps> = ({
  parts,
  drawerBalance,
  onCheckDrawer,
  onRefreshAll,
}) => {
  const [supplierSearch, setSupplierSearch] = useState('');
  const [hasDebtFilter, setHasDebtFilter] = useState<'all' | 'has_debt'>('all');
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number | 'all'>(15);

  // Modals state
  const [createSupplierModalOpen, setCreateSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [repayModalOpen, setRepayModalOpen] = useState(false);
  const [selectedSupplierForRepay, setSelectedSupplierForRepay] = useState<Supplier | null>(null);

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedSupplierForHistory, setSelectedSupplierForHistory] = useState<Supplier | null>(null);

  const [createReceiptModalOpen, setCreateReceiptModalOpen] = useState(false);

  const {
    data: apiSuppliersData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['suppliers', supplierSearch, hasDebtFilter, page, perPage],
    queryFn: async () => {
      const res = await supplierService.getSuppliers({
        q: supplierSearch.trim() || undefined,
        search: supplierSearch.trim() || undefined,
        has_debt: hasDebtFilter === 'has_debt' ? true : undefined,
        page: perPage === 'all' ? 1 : page,
        per_page: perPage,
        all: perPage === 'all' ? true : undefined,
      });
      return res?.data || res;
    },
  });

  const suppliers: Supplier[] = useMemo(() => {
    if (Array.isArray(apiSuppliersData)) return apiSuppliersData;
    const nested = (apiSuppliersData as any)?.data;
    return Array.isArray(nested) ? nested : [];
  }, [apiSuppliersData]);

  const supplierSummary = (apiSuppliersData as any)?.summary;
  const total = (apiSuppliersData as any)?.total ?? suppliers.length;
  const currentPage = (apiSuppliersData as any)?.current_page ?? page;
  const lastPage = (apiSuppliersData as any)?.last_page ?? 1;
  const from = (apiSuppliersData as any)?.from ?? (suppliers.length > 0 ? 1 : 0);
  const to = (apiSuppliersData as any)?.to ?? suppliers.length;

  // KPI summaries (ưu tiên summary từ server, fallback về mảng hiện tại)
  const totalAccountsPayable = useMemo(() => {
    if (supplierSummary?.total_debt !== undefined) {
      return Number(supplierSummary.total_debt) || 0;
    }
    return suppliers
      .filter((s) => s.is_active)
      .reduce((sum, s) => sum + (Number(s.debt_balance) || 0), 0);
  }, [suppliers, supplierSummary]);

  const suppliersWithDebtCount = useMemo(() => {
    if (supplierSummary?.debt_suppliers_count !== undefined) {
      return Number(supplierSummary.debt_suppliers_count) || 0;
    }
    return suppliers.filter((s) => Number(s.debt_balance) > 0).length;
  }, [suppliers, supplierSummary]);

  const totalSuppliersCount = useMemo(() => {
    if (supplierSummary?.total_suppliers !== undefined) {
      return Number(supplierSummary.total_suppliers) || 0;
    }
    return total;
  }, [supplierSummary, total]);

  // Handlers
  const handleOpenCreateSupplier = () => {
    setEditingSupplier(null);
    setCreateSupplierModalOpen(true);
  };

  const handleOpenEditSupplier = (sup: Supplier) => {
    setEditingSupplier(sup);
    setCreateSupplierModalOpen(true);
  };

  const handleOpenRepay = (sup: Supplier) => {
    setSelectedSupplierForRepay(sup);
    setRepayModalOpen(true);
    onCheckDrawer?.();
  };

  const handleOpenHistory = (sup: Supplier) => {
    setSelectedSupplierForHistory(sup);
    setHistoryModalOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* Sub-header & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-[#87958e] uppercase tracking-wider">
          <span>NHÀ CUNG CẤP & CÔNG NỢ PHẢI TRẢ (AP)</span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#176b58]" />
          <span className="text-[#176b58] font-bold">{totalSuppliersCount} Đối tác</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpenCreateSupplier}
          >
            + Thêm NCC
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateReceiptModalOpen(true)}
          >
            + Nhập kho linh kiện
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          label="Tiền NCC còn phải trả"
          value={formatMoney(totalAccountsPayable)}
          icon="receipt"
          foot="Tổng công nợ phải trả đối tác active"
        />
        <StatCard
          label="Số NCC có công nợ"
          value={`${suppliersWithDebtCount} đối tác`}
          icon="account_balance_wallet"
          foot="Đang có số dư nợ > 0 ₫"
        />
        <StatCard
          label="Tổng nhà cung cấp"
          value={`${totalSuppliersCount} đối tác`}
          icon="partners"
          foot="Danh mục quản lý toàn chuỗi"
        />
      </div>

      {/* Filter Bar & Data Table */}
      <div className="space-y-4">
        <FilterBar
          searchValue={supplierSearch}
          onSearchChange={(val: string) => {
            setSupplierSearch(val);
            setPage(1);
          }}
          searchPlaceholder="Tìm theo tên, mã NCC hoặc số điện thoại..."
          selectValue={hasDebtFilter}
          onSelectChange={(val: string) => {
            setHasDebtFilter(val as any);
            setPage(1);
          }}
          selectPlaceholder="Lọc theo công nợ"
          selectOptions={[
            { label: 'Tất cả nhà cung cấp', value: 'all' },
            { label: 'Chỉ NCC có nợ (> 0 ₫)', value: 'has_debt' },
          ]}
        />

        {isError ? (
          <ErrorFallback onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : suppliers.length === 0 ? (
          <EmptyState
            title="Chưa có nhà cung cấp nào"
            description="Tạo nhà cung cấp linh kiện để quản lý hồ sơ và theo dõi công nợ mua hàng chính quy."
            actionLabel="+ Thêm nhà cung cấp ngay"
            onAction={handleOpenCreateSupplier}
          />
        ) : (
          <div className="bg-white rounded-[10px] border border-[#e5ece8] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse min-w-[760px]">
                <thead className="bg-[#fafbfa] border-b border-[#e5ece8] text-xs font-bold text-[#8fa096] uppercase tracking-wider h-10">
                  <tr>
                    <th className="py-2.5 px-4">Mã NCC</th>
                    <th className="py-2.5 px-4">Tên Nhà cung cấp</th>
                    <th className="py-2.5 px-4">Số điện thoại</th>
                    <th className="py-2.5 px-4">Địa chỉ / MST</th>
                    <th className="py-2.5 px-4 text-right">Công nợ hiện tại</th>
                    <th className="py-2.5 px-4 text-center">Trạng thái</th>
                    <th className="py-2.5 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f2]">
                  {suppliers.map((s) => {
                    const debt = Number(s.debt_balance) || 0;
                    return (
                      <tr key={s.id} className="hover:bg-[#fafcfa] transition-colors h-12">
                        <td className="py-3 px-4 font-mono font-bold text-[#176b58]">
                          {s.code}
                        </td>
                        <td className="py-3 px-4 font-semibold text-[#1c302b]">
                          <div>{s.name}</div>
                          {s.email && <div className="text-xs text-[#6e7f77] font-normal">{s.email}</div>}
                        </td>
                        <td className="py-3 px-4 text-[#4a5e52] font-mono text-xs">
                          {s.phone}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#6e7f77] max-w-[200px] truncate">
                          <div>{s.address || '—'}</div>
                          {s.tax_code && <div className="text-[11px]">MST: {s.tax_code}</div>}
                        </td>
                        <td className="py-3 px-4 text-right font-bold font-mono">
                          {debt > 0 ? (
                            <span className="text-[#bc5b52] bg-[#fbefed] px-2.5 py-1 rounded-[6px] border border-[#f5c7c2]">
                              {formatMoney(debt)}
                            </span>
                          ) : (
                            <span className="text-[#28805e] bg-[#eaf4ef] px-2.5 py-1 rounded-[6px] border border-[#c5e1d4]">
                              0 ₫
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <StatusTag
                            label={s.is_active ? 'Đang giao dịch' : 'Tạm ngưng'}
                            type={s.is_active ? 'ready' : 'gray'}
                          />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {debt > 0 && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleOpenRepay(s)}
                                className="text-xs font-semibold px-2.5 py-1"
                              >
                                Trả nợ
                              </Button>
                            )}
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenHistory(s)}
                              className="text-xs font-semibold px-2.5 py-1"
                              title="Xem sổ theo dõi biến động nợ"
                            >
                              Sổ nợ
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenEditSupplier(s)}
                              className="text-xs font-semibold px-2 py-1"
                              title="Chỉnh sửa thông tin"
                            >
                              Sửa
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 pb-4">
              <PaginationBar
                testIdPrefix="inventory-suppliers"
                itemLabel="nhà cung cấp"
                currentPage={currentPage}
                lastPage={lastPage}
                total={total}
                from={from}
                to={to}
                perPage={perPage}
                onPageChange={setPage}
                onPerPageChange={setPerPage}
                isLoading={isLoading}
              />
            </div>
          </div>
        )}
      </div>

      {/* Supplier Create/Edit Modal */}
      <CreateSupplierModal
        isOpen={createSupplierModalOpen}
        onClose={() => setCreateSupplierModalOpen(false)}
        onSuccess={() => {
          refetch();
          onRefreshAll?.();
        }}
        supplier={editingSupplier}
      />

      {/* Repay Debt Modal */}
      <RepaySupplierDebtModal
        isOpen={repayModalOpen}
        onClose={() => setRepayModalOpen(false)}
        onSuccess={() => {
          refetch();
          onRefreshAll?.();
        }}
        supplier={selectedSupplierForRepay}
        drawerBalance={drawerBalance}
        onCheckDrawer={onCheckDrawer}
      />

      {/* Debt Ledger Modal */}
      <SupplierDebtHistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        supplier={selectedSupplierForHistory}
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
