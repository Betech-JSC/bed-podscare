'use client';

import React, { useState, useMemo } from 'react';
import {
  Button,
  EmptyState,
  TableSkeleton,
  ErrorFallback,
  Modal,
  Input,
  CurrencyInput,
  Textarea,
  useToast,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';
import { inventoryService } from '@podscare/api-client';
import { useQuery } from '@tanstack/react-query';

export interface BranchInventoryItem {
  id?: number;
  sku: string;
  name: string;
  category: string;
  stock: number;
  min: number;
  price: string;
  rawPrice: number;
  location: string;
  shelf: string;
  branchId: number;
  branchName: string;
  branchCode: string;
}

export default function InventoryPage() {
  const { toast } = useToast();
  const { branch, branchId, setBranch, branches, role } = usePodsCare();

  const [search, setSearch] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(
    String(branchId || '1')
  );
  const [selectedShelf, setSelectedShelf] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Modal tạo giao dịch kho
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [txPartId, setTxPartId] = useState<number | string>('');
  const [txType, setTxType] = useState<string>('import');
  const [txQuantity, setTxQuantity] = useState<number>(1);
  const [txCost, setTxCost] = useState<number | ''>('');
  const [txSupplier, setTxSupplier] = useState<string>('');
  const [txNotes, setTxNotes] = useState<string>('');
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);

  // Sync warehouse filter when context branchId changes
  React.useEffect(() => {
    if (branchId !== undefined && branchId !== null) {
      setSelectedWarehouse(String(branchId));
    }
  }, [branchId]);

  const handleWarehouseFilterChange = (val: string) => {
    setSelectedWarehouse(val);
    const found = branches.find((b) => String(b.id) === val);
    if (found) {
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
    queryKey: ['inventory-parts', selectedCategory, onlyLowStock, search],
    queryFn: async () => {
      const res = await inventoryService.getParts({
        category: selectedCategory || undefined,
        low_stock: onlyLowStock ? true : undefined,
        q: search.trim() || undefined,
        per_page: 50,
      });
      return res?.data || res;
    },
  });

  const allParts: BranchInventoryItem[] = useMemo(() => {
    const raw = apiPartsData?.data || apiPartsData;
    const list = Array.isArray(raw) ? raw : [];
    const activeBranch = branches.find((b) => String(b.id) === selectedWarehouse) || {
      id: Number(selectedWarehouse) || 1,
      name: branch || 'PodsCare · Quận 1',
      code: 'Q1',
    };

    return list.map((p: any) => {
      const stock = Number(p.stock_quantity) || 0;
      const min = Number(p.min_stock_alert) || 5;
      const rawPrice = Number(p.retail_price) || Number(p.unit_price) || 0;
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
        location: loc,
        shelf,
        branchId: Number(activeBranch.id) || 1,
        branchName: activeBranch.name,
        branchCode: activeBranch.code || 'Q1',
      };
    });
  }, [apiPartsData, branches, selectedWarehouse, branch]);

  // Get available shelves based on current loaded parts
  const availableShelves = useMemo(() => {
    const set = new Set(allParts.map((item) => item.shelf).filter(Boolean));
    return Array.from(set).sort();
  }, [allParts]);

  // Categories list
  const categoriesList = useMemo(() => {
    const set = new Set(allParts.map((item) => item.category).filter(Boolean));
    return Array.from(set);
  }, [allParts]);

  // Filtered inventory list
  const filtered = useMemo(() => {
    return allParts.filter((item) => {
      if (selectedShelf && item.shelf !== selectedShelf) {
        return false;
      }
      return true;
    });
  }, [allParts, selectedShelf]);

  // Summary statistics
  const stats = useMemo(() => {
    const totalItems = filtered.reduce((acc, curr) => acc + curr.stock, 0);
    const lowStockCount = filtered.filter((i) => i.stock <= i.min).length;
    const totalEstValue = filtered.reduce((acc, curr) => acc + curr.stock * curr.rawPrice, 0);

    return {
      skuCount: filtered.length,
      totalItems,
      lowStockCount,
      totalEstValue: new Intl.NumberFormat('vi-VN').format(totalEstValue) + ' ₫',
    };
  }, [filtered]);

  const currentWarehouseName =
    selectedWarehouse === 'all'
      ? 'Toàn bộ chi nhánh'
      : branches.find((b) => String(b.id) === selectedWarehouse)?.name || branch;

  // Xử lý tạo giao dịch nhập xuất kho
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
      const activeBranchId = selectedWarehouse === 'all' ? 1 : selectedWarehouse;
      await inventoryService.createTransaction({
        part_id: txPartId,
        branch_id: activeBranchId,
        transaction_type: txType,
        quantity: txQuantity,
        unit_cost: typeof txCost === 'number' ? txCost : undefined,
        supplier_name: txSupplier.trim() || undefined,
        notes: txNotes.trim() || undefined,
      });

      toast(
        `Tạo phiếu ${
          txType === 'import'
            ? 'nhập kho'
            : txType === 'export_repair'
            ? 'xuất sửa chữa'
            : 'điều chỉnh kho'
        } thành công!`,
        'success'
      );
      setTransactionModalOpen(false);
      setTxQuantity(1);
      setTxCost('');
      setTxSupplier('');
      setTxNotes('');
      refetch();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Không thể tạo giao dịch kho', 'error');
    } finally {
      setIsSubmittingTx(false);
    }
  };

  return (
    <AppShell crumbName="Kho linh kiện">
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1 flex items-center gap-2">
              <span>INVENTORY MANAGEMENT</span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#176b58]" />
              <span className="text-[#176b58] font-bold">{currentWarehouseName}</span>
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Quản lý kho linh kiện & Tồn kho thực tế
            </h1>
            <p className="text-xs text-[#85928c] mt-1 mb-0">
              Dữ liệu tồn kho, vị trí kệ và định mức an toàn nạp trực tiếp qua API máy chủ.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon="refresh"
              onClick={() => {
                setSearch('');
                setSelectedShelf('');
                setSelectedCategory('');
                setOnlyLowStock(false);
                refetch();
              }}
            >
              Đặt lại bộ lọc
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="plus"
              onClick={() => {
                if (allParts.length > 0 && !txPartId) {
                  setTxPartId(allParts[0].id || '');
                }
                setTransactionModalOpen(true);
              }}
            >
              Tạo phiếu nhập / xuất
            </Button>
          </div>
        </div>

        {/* 4 KPI Summary Cards for Current Warehouse */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

          <div className="bg-white p-3.5 rounded-[9px] border border-[#e5ece8] shadow-xs">
            <span className="text-xs text-[#758780] font-semibold block uppercase tracking-wider">
              GIÁ TRỊ TỒN KHO
            </span>
            <b className="font-heading text-xl text-[#1c302b] block mt-1 truncate">
              {stats.totalEstValue}
            </b>
            <span className="text-xs text-[#81918a]">Định giá niêm yết</span>
          </div>
        </div>

        {/* Filters Bar & Data Table */}
        <div className="bg-white rounded-[10px] border border-[#e5ece8] p-4 sm:p-5 shadow-xs space-y-4">
          {/* Multi-criteria Filter Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#f0f3f1]">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[300px]">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px] max-w-[280px]">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="⌕  Tìm mã SKU, tên, vị trí..."
                  className="w-full h-9 pl-3 pr-3 border border-[#e4eae6] rounded-[8px] text-xs text-[#2b3a32] bg-white outline-none focus:border-[#75a994] focus:ring-2 focus:ring-[#176b58]/10 transition-all placeholder:text-[#9aa59f]"
                />
              </div>

              {/* Warehouse Selector Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#7c8b84] font-medium hidden sm:inline">Kho:</span>
                <select
                  value={selectedWarehouse}
                  onChange={(e) => handleWarehouseFilterChange(e.target.value)}
                  className="h-9 border border-[#d6dfda] rounded-[8px] px-2.5 text-xs text-[#1c302b] bg-[#f9fbf9] font-medium outline-none focus:border-[#75a994] cursor-pointer"
                >
                  {role === 'admin' && (
                    <option value="all">🏢 Tất cả chi nhánh / kho</option>
                  )}
                  {branches
                    .filter((b) => b.id !== 'all')
                    .map((b) => (
                      <option key={b.id} value={String(b.id)}>
                        📍 {b.name} ({b.code})
                      </option>
                    ))}
                </select>
              </div>

              {/* Shelf Location Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#7c8b84] font-medium hidden sm:inline">Kệ:</span>
                <select
                  value={selectedShelf}
                  onChange={(e) => setSelectedShelf(e.target.value)}
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
                  onChange={(e) => setSelectedCategory(e.target.value)}
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
                onChange={(e) => setOnlyLowStock(e.target.checked)}
                className="w-4 h-4 rounded text-[#176b58] accent-[#176b58] cursor-pointer"
              />
              <span className="text-xs font-semibold text-[#bc5b52]">Chỉ xem mã sắp hết hàng</span>
            </label>
          </div>

          {/* Table / Loading / Error */}
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
                        <td className="px-3 font-semibold text-[#485951]">{item.price}</td>
                        <td className="px-3 text-right">
                          {isLow ? (
                            <span className="inline-block px-2 py-0.5 rounded-[10px] text-xs font-bold bg-[#fbefed] text-[#bc5b52] border border-[#f5d5d0]">
                              ⚠ Cần nhập kho
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-[10px] text-xs font-bold bg-[#eaf4ef] text-[#28805e]">
                              ✓ Đủ tồn kho
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
        </div>
      </div>

      {/* Transaction Modal (Nhập / Xuất kho) */}
      <Modal
        isOpen={transactionModalOpen}
        onClose={() => setTransactionModalOpen(false)}
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
              onClick={() => setTransactionModalOpen(false)}
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
              Chọn linh kiện <span className="text-[#bc5b52]">*</span>
            </label>
            <select
              value={txPartId}
              onChange={(e) => setTxPartId(e.target.value)}
              required
              className="w-full h-10 border border-[#d6dfda] rounded-[8px] px-3 text-sm text-[#1c302b] bg-white outline-none focus:border-[#75a994]"
            >
              <option value="">-- Chọn linh kiện --</option>
              {allParts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} - {p.name} (Tồn: {p.stock})
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <CurrencyInput
                label="Đơn giá (nếu có)"
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
    </AppShell>
  );
}
