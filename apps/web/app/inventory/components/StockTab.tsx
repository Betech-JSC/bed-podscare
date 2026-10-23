'use client';

import React, { useState, useMemo } from 'react';
import {
  Button,
  EmptyState,
  TableSkeleton,
  ErrorFallback,
  Icon,
  PaginationBar,
} from '@podscare/ui';
import { inventoryService } from '@podscare/api-client';
import { useQuery } from '@tanstack/react-query';
import { CreatePartTransactionModal } from './CreatePartTransactionModal';

export interface BranchOption {
  id: string | number;
  name: string;
  code?: string;
}

export interface BranchInventoryItem {
  id?: number;
  sku: string;
  name: string;
  category: string;
  stock: number;
  min: number;
  price: string;
  rawPrice: number;
  costPrice?: number;
  costPriceFormatted?: string;
  location: string;
  shelf: string;
  branchId: number;
  branchName: string;
  branchCode: string;
}

export interface StockTabProps {
  role?: string;
  currentUser?: any;
  branch?: string;
  branchId?: string | number;
  branches: BranchOption[];
  setBranch?: (name: string, id: string | number) => void;
  onRefreshAll?: () => void;
}

export const StockTab: React.FC<StockTabProps> = ({
  role = 'admin',
  currentUser,
  branch = 'FIXO · Quận 1',
  branchId = 1,
  branches,
  setBranch,
  onRefreshAll,
}) => {
  const [search, setSearch] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(String(branchId || '1'));
  const [selectedShelf, setSelectedShelf] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number | 'all'>(15);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);

  // Sync warehouse filter when context branchId changes or for non-admin
  React.useEffect(() => {
    if (role !== 'admin') {
      const userBranchId = currentUser?.branch_id || branchId || 1;
      setSelectedWarehouse(String(userBranchId));
    } else if (branchId !== undefined && branchId !== null) {
      setSelectedWarehouse(String(branchId));
    }
    setPage(1);
  }, [branchId, role, currentUser]);

  const handleWarehouseFilterChange = (val: string) => {
    if (role !== 'admin') return;
    setSelectedWarehouse(val);
    setPage(1);
    const found = branches.find((b) => String(b.id) === val);
    if (found && setBranch) {
      setBranch(found.name, found.id);
    }
  };

  // Nạp danh sách phụ tùng trực tiếp từ API
  const {
    data: apiPartsData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['inventory-parts', selectedWarehouse, selectedCategory, onlyLowStock, search, page, perPage],
    queryFn: async () => {
      const res = await inventoryService.getParts({
        branch_id: selectedWarehouse && selectedWarehouse !== 'all' ? Number(selectedWarehouse) : undefined, // branch_id: selectedWarehouse ? Number(selectedWarehouse) : undefined
        category: selectedCategory || undefined,
        low_stock: onlyLowStock ? true : undefined,
        q: search.trim() || undefined,
        page: perPage === 'all' ? 1 : page,
        per_page: perPage,
        all: perPage === 'all' ? true : undefined,
      });
      return res?.data || res;
    },
  });

  const allParts: BranchInventoryItem[] = useMemo(() => {
    const raw = apiPartsData?.data || apiPartsData;
    const list = Array.isArray(raw) ? raw : [];
    const activeBranch = branches.find((b) => String(b.id) === selectedWarehouse) || {
      id: Number(selectedWarehouse) || 1,
      name: branch || 'FIXO · Quận 1',
      code: 'Q1',
    };

    return list.map((p: any) => {
      const stock = Number(p.stock_quantity) || 0;
      const min = Number(p.min_stock_alert) || 5;
      const rawPrice = Number(p.retail_price) || Number(p.unit_price) || 0;
      const costPrice =
        p.cost_price !== undefined && p.cost_price !== null ? Number(p.cost_price) : undefined;
      const costPriceFormatted =
        costPrice !== undefined
          ? new Intl.NumberFormat('vi-VN').format(costPrice) + ' ₫'
          : undefined;
      const loc = p.storage_location || p.location || 'Kệ A · Tầng 1';
      const shelf = loc.split('·')?.[0]?.trim() || 'Kệ A';

      return {
        id: p.id,
        sku: p.sku || `PART-${p.id}`,
        name: p.name,
        category: p.category || 'Linh kiện',
        stock,
        min,
        price: rawPrice ? new Intl.NumberFormat('vi-VN').format(rawPrice) + ' ₫' : '—',
        rawPrice,
        costPrice,
        costPriceFormatted,
        location: loc,
        shelf,
        branchId: Number(activeBranch.id) || 1,
        branchName: activeBranch.name,
        branchCode: activeBranch.code || 'Q1',
      };
    });
  }, [apiPartsData, branches, selectedWarehouse, branch]);

  // Danh sách kệ
  const availableShelves = useMemo(() => {
    const set = new Set(allParts.map((item) => item.shelf).filter(Boolean));
    return Array.from(set).sort();
  }, [allParts]);

  // Danh mục
  const categoriesList = useMemo(() => {
    const set = new Set(allParts.map((item) => item.category).filter(Boolean));
    return Array.from(set).sort();
  }, [allParts]);

  // Lọc theo kệ
  const filtered = useMemo(() => {
    return allParts.filter((item) => {
      if (selectedShelf && item.shelf !== selectedShelf) {
        return false;
      }
      return true;
    });
  }, [allParts, selectedShelf]);

  // Summary statistics (ưu tiên lấy từ apiPartsData.summary của Backend, fallback sang mảng hiện tại)
  const serverSummary = apiPartsData?.summary;
  const stats = useMemo(() => {
    const fallbackTotalItems = filtered.reduce((acc, curr) => acc + curr.stock, 0);
    const fallbackLowStockCount = filtered.filter((i) => i.stock <= i.min).length;
    const fallbackOutOfStockCount = filtered.filter((i) => i.stock <= 0).length;
    const fallbackTotalEstValue = filtered.reduce((acc, curr) => acc + curr.stock * curr.rawPrice, 0);
    const fallbackTotalCostValue = filtered.reduce(
      (acc, curr) => acc + curr.stock * (curr.costPrice || 0),
      0
    );

    const skuCount =
      serverSummary?.total_sku ??
      serverSummary?.total_parts ??
      apiPartsData?.total ??
      filtered.length;
    const totalItems =
      serverSummary?.total_quantity ??
      serverSummary?.total_stock_quantity ??
      fallbackTotalItems;
    const lowStockCount =
      serverSummary?.low_stock_count ?? fallbackLowStockCount;
    const outOfStockCount =
      serverSummary?.out_of_stock_count ?? fallbackOutOfStockCount;
    const rawCostValue =
      serverSummary?.total_stock_value ??
      serverSummary?.total_cost_value ??
      fallbackTotalCostValue;

    return {
      skuCount,
      totalItems,
      lowStockCount,
      outOfStockCount,
      totalEstValue: new Intl.NumberFormat('vi-VN').format(fallbackTotalEstValue) + ' ₫',
      totalCostValue: new Intl.NumberFormat('vi-VN').format(Number(rawCostValue) || 0) + ' ₫',
    };
  }, [filtered, serverSummary, apiPartsData]);

  const total = apiPartsData?.total ?? filtered.length;
  const currentPage = apiPartsData?.current_page ?? page;
  const lastPage = apiPartsData?.last_page ?? 1;
  const from = apiPartsData?.from ?? (filtered.length > 0 ? 1 : 0);
  const to = apiPartsData?.to ?? filtered.length;

  const currentWarehouseName =
    selectedWarehouse === 'all'
      ? 'Toàn bộ chi nhánh'
      : branches.find((b) => String(b.id) === selectedWarehouse)?.name || branch;

  return (
    <div className="space-y-5">
      {/* Sub-header & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-[#87958e] uppercase tracking-wider">
          <span>TỒN KHO LINH KIỆN</span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#176b58]" />
          <span className="text-[#176b58] font-bold">{currentWarehouseName}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSearch('');
              setSelectedShelf('');
              setSelectedCategory('');
              setOnlyLowStock(false);
              setPage(1);
              refetch();
            }}
          >
            Đặt lại bộ lọc
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setTransactionModalOpen(true)}
          >
            + Tạo phiếu nhập / xuất
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className={`grid grid-cols-2 ${role === 'admin' ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-3`}>
        <div className="bg-white p-3.5 rounded-[9px] border border-[#e5ece8] shadow-xs">
          <span className="text-xs text-[#758780] font-semibold block uppercase tracking-wider">
            MÃ LINH KIỆN
          </span>
          <b className="font-heading text-2xl text-[#1c302b] block mt-1">
            {stats.skuCount} <small className="text-xs font-normal text-[#86968f]">SKU</small>
          </b>
          <span className="text-xs text-[#28805e]">Trong phạm vi kho</span>
        </div>

        <div className="bg-white p-3.5 rounded-[9px] border border-[#e5ece8] shadow-xs">
          <span className="text-xs text-[#758780] font-semibold block uppercase tracking-wider">
            TỔNG SỐ LƯỢNG TỒN
          </span>
          <b className="font-heading text-2xl text-[#176b58] block mt-1">
            {stats.totalItems} <small className="text-xs font-normal text-[#86968f]">cái</small>
          </b>
          <span className="text-xs text-[#556960]">Đang sẵn sàng cấp phát</span>
        </div>

        <div className="bg-white p-3.5 rounded-[9px] border border-[#e5ece8] shadow-xs">
          <span className="text-xs text-[#758780] font-semibold block uppercase tracking-wider">
            CẢNH BÁO SẮP HẾT
          </span>
          <b
            className={`font-heading text-2xl block mt-1 ${
              stats.lowStockCount > 0 ? 'text-[#bc5b52]' : 'text-[#28805e]'
            }`}
          >
            {stats.lowStockCount} <small className="text-xs font-normal text-[#86968f]">mã</small>
          </b>
          <span
            className={`text-xs font-semibold ${
              stats.lowStockCount > 0 ? 'text-[#bc5b52]' : 'text-[#28805e]'
            }`}
          >
            {stats.lowStockCount > 0 ? 'Cần làm phiếu nhập kho' : 'Mức tồn an toàn'}
          </span>
        </div>

        {/* COGS Valuation for Admin */}
        {role === 'admin' && (
          <div className="bg-white p-3.5 rounded-[9px] border border-[#e5ece8] shadow-xs">
            <span className="text-xs text-[#758780] font-semibold block uppercase tracking-wider">
              TỔNG GIÁ TRỊ VỐN KHO
            </span>
            <b className="font-heading text-xl text-[#176b58] block mt-1 truncate">
              {stats.totalCostValue}
            </b>
            <span className="text-xs text-[#81918a]">Định giá vốn COGS (MAC)</span>
          </div>
        )}
      </div>

      {/* Filters Bar & Table */}
      <div className="bg-white rounded-[10px] border border-[#e5ece8] p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#f0f3f1]">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[300px]">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-[280px]">
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm mã SKU, tên, vị trí..."
                className="w-full h-9 pl-3 pr-3 border border-[#e4eae6] rounded-[8px] text-xs text-[#2b3a32] bg-white outline-none focus:border-[#75a994] focus:ring-2 focus:ring-[#176b58]/10 transition-all placeholder:text-[#9aa59f]"
              />
            </div>

            {/* Warehouse Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#7c8b84] font-medium hidden sm:inline">Kho:</span>
              {role === 'admin' ? (
                <select
                  value={selectedWarehouse}
                  onChange={(e) => handleWarehouseFilterChange(e.target.value)}
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

            {/* Shelf Location Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#7c8b84] font-medium hidden sm:inline">Kệ:</span>
              <select
                value={selectedShelf}
                onChange={(e) => {
                  setSelectedShelf(e.target.value);
                  setPage(1);
                }}
                className="h-9 border border-[#e4eae6] rounded-[8px] px-2.5 text-xs text-[#4c5c54] bg-white outline-none focus:border-[#75a994] cursor-pointer"
              >
                <option value="">Tất cả vị trí kệ</option>
                {availableShelves.map((sh) => (
                  <option key={sh} value={sh}>
                    {sh}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1.5">
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setPage(1);
                }}
                className="h-9 border border-[#e4eae6] rounded-[8px] px-2.5 text-xs text-[#4c5c54] bg-white outline-none focus:border-[#75a994] cursor-pointer"
              >
                <option value="">Tất cả danh mục</option>
                {categoriesList.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Low stock toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-[8px] bg-[#f7f9f7] hover:bg-[#eff4f1] transition-colors border border-[#e2eae5]">
            <input
              type="checkbox"
              checked={onlyLowStock}
              onChange={(e) => {
                setOnlyLowStock(e.target.checked);
                setPage(1);
              }}
              className="w-4 h-4 rounded text-[#176b58] accent-[#176b58] cursor-pointer"
            />
            <span className="text-xs font-semibold text-[#bc5b52]">Chỉ xem mã sắp hết hàng</span>
          </label>
        </div>

        {/* Table / Skeleton / Empty State */}
        {isError ? (
          <ErrorFallback onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Không tìm thấy linh kiện nào phù hợp"
            description="Thử thay đổi bộ lọc tìm kiếm hoặc tạo phiếu nhập thêm linh kiện mới vào kho."
            actionLabel="Tạo phiếu nhập kho ngay"
            onAction={() => setTransactionModalOpen(true)}
          />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#8fa096] uppercase tracking-wider h-9">
                  <th className="px-3">Mã SKU</th>
                  <th className="px-3">Tên linh kiện</th>
                  <th className="px-3">Danh mục</th>
                  <th className="px-3">Kho chi nhánh</th>
                  <th className="px-3">Vị trí lưu trữ</th>
                  <th className="px-3">Tồn kho</th>
                  <th className="px-3">Định mức Min</th>
                  {role === 'admin' && <th className="px-3">Giá vốn (MAC)</th>}
                  <th className="px-3">Giá bán lẻ</th>
                  <th className="px-3 text-right">Trạng thái tồn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f3f2] text-sm">
                {filtered.map((item) => {
                  const isLow = item.stock <= item.min;
                  return (
                    <tr
                      key={`${item.branchId}-${item.sku}`}
                      className="h-12 hover:bg-[#fafcfa] transition-colors"
                    >
                      <td className="px-3 font-mono font-bold text-[#176b58]">{item.sku}</td>
                      <td className="px-3 font-medium text-[#1c302b]">
                        <span>{item.name}</span>
                      </td>
                      <td className="px-3">
                        <span className="px-2 py-0.5 rounded-[6px] bg-[#f2f5f3] text-[#556960] text-xs font-medium">
                          {item.category}
                        </span>
                      </td>
                      <td className="px-3">
                        <span className="inline-flex items-center gap-1.5 font-medium text-[#2d4239]">
                          <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-[#e8f2ec] text-[#176b58]">
                            {item.branchCode}
                          </span>
                          <span className="text-xs truncate max-w-[140px]">{item.branchName}</span>
                        </span>
                      </td>
                      <td className="px-3 text-[#586961] font-mono text-xs">{item.location}</td>
                      <td className="px-3">
                        <b className={`font-mono text-sm ${isLow ? 'text-[#bc5b52]' : 'text-[#1c302b]'}`}>
                          {item.stock}
                        </b>{' '}
                        <small className="text-[#8b9991]">cái</small>
                      </td>
                      <td className="px-3 font-mono text-[#829289] text-xs">{item.min} cái</td>
                      {role === 'admin' && (
                        <td className="px-3 font-semibold text-[#176b58] font-mono">
                          {item.costPriceFormatted ?? '—'}
                        </td>
                      )}
                      <td className="px-3 font-semibold text-[#485951] font-mono">{item.price}</td>
                      <td className="px-3 text-right">
                        {isLow ? (
                          <span className="inline-block px-2 py-0.5 rounded-[10px] text-xs font-bold bg-[#fbefed] text-[#bc5b52] border border-[#f5d5d0]">
                            Cần nhập kho
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-[10px] text-xs font-bold bg-[#eaf4ef] text-[#28805e]">
                            Đủ tồn kho
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <PaginationBar
          testIdPrefix="inventory-stock"
          itemLabel="mã linh kiện"
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

      {/* Transaction Modal */}
      <CreatePartTransactionModal
        isOpen={transactionModalOpen}
        onClose={() => setTransactionModalOpen(false)}
        onSuccess={() => {
          refetch();
          onRefreshAll?.();
        }}
        parts={allParts}
        branchId={selectedWarehouse === 'all' ? 1 : Number(selectedWarehouse) || 1}
        branchName={currentWarehouseName}
        role={role}
      />
    </div>
  );
};
