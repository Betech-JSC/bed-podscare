'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Button,
  Icon,
  TableSkeleton,
  useToast,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';
import {
  supplierService,
  inventoryService,
  cashbookService,
  type Supplier,
  type InventoryPart,
} from '@podscare/api-client';
import { useQueryClient } from '@tanstack/react-query';

import { StockTab } from './components/StockTab';
import { ReceiptsTab } from './components/ReceiptsTab';
import { SuppliersTab } from './components/SuppliersTab';
import { MovementsTab } from './components/MovementsTab';
import {
  exportDailyExportedPartsExcel,
  getTodayDateStringInGmt7,
} from './utils/dailyExportedPartsExcel';

type InventoryTabKey = 'stock' | 'receipts' | 'suppliers' | 'movements';

const VALID_TABS: InventoryTabKey[] = ['stock', 'receipts', 'suppliers', 'movements'];

function InventoryMasterView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const {
    branch,
    branchId,
    setBranch,
    branches,
    role,
    currentUser,
  } = usePodsCare();
  const { toast } = useToast();

  // Ngày xuất báo cáo nguyên liệu xuất kho (mặc định Hôm nay theo giờ Việt Nam)
  const [selectedExportDate, setSelectedExportDate] = useState<string>(() =>
    getTodayDateStringInGmt7()
  );
  const [isExportingDailyParts, setIsExportingDailyParts] = useState<boolean>(false);

  const handleExportDailyParts = useCallback(
    async (targetDate?: string, overrideBranchId?: string | number) => {
      const dateToUse = (targetDate || selectedExportDate || getTodayDateStringInGmt7()).trim();
      const effectiveBranch =
        overrideBranchId !== undefined ? overrideBranchId : branchId;

      setIsExportingDailyParts(true);
      try {
        const res = await inventoryService.getTransactions({
          branch_id:
            effectiveBranch && effectiveBranch !== 'all'
              ? Number(effectiveBranch)
              : undefined,
          from_date: dateToUse,
          to_date: dateToUse,
          per_page: 'all',
          all: true,
        } as any);

        const rawData = res?.data;
        const txList = Array.isArray(rawData)
          ? rawData
          : Array.isArray(rawData?.data)
          ? rawData.data
          : Array.isArray(res)
          ? res
          : [];

        const branchLabel =
          !effectiveBranch || effectiveBranch === 'all'
            ? 'Toàn bộ chi nhánh'
            : branches.find((b) => String(b.id) === String(effectiveBranch))?.name ||
              branch ||
              'FIXO';

        const exported = exportDailyExportedPartsExcel({
          transactions: txList,
          selectedDate: dateToUse,
          branchLabel,
          fileNamePrefix: 'Bao_Cao_Xuat_Kho_Linh_Kien',
        });

        toast(
          `Đã xuất file ${exported.fileName} (${exported.distinctSkuCount} mã nguyên liệu · Xuất: ${exported.totalExportedQuantity} · Hoàn: ${exported.totalReturnedQuantity} · Thực xuất: ${exported.totalNetExportedQuantity})!`,
          'success'
        );
      } catch (err: any) {
        const errMsg =
          err?.response?.data?.message ||
          err?.message ||
          'Không thể xuất báo cáo nguyên liệu xuất kho trong ngày.';
        toast(errMsg, 'error');
      } finally {
        setIsExportingDailyParts(false);
      }
    },
    [selectedExportDate, branchId, branches, branch, toast]
  );

  // URL Tab Resolution with Fallback
  const rawTab = searchParams.get('tab') as InventoryTabKey | null;
  const activeTab: InventoryTabKey =
    rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'stock';

  const handleTabChange = (newTab: InventoryTabKey) => {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    params.set('tab', newTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Shared state: Suppliers and Parts for cross-modal usage
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [availableParts, setAvailableParts] = useState<InventoryPart[]>([]);
  const [drawerBalance, setDrawerBalance] = useState<{
    current_cash_balance: number;
    has_active_shift: boolean;
  } | null>(null);

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await supplierService.getSuppliers({ per_page: 'all', all: true });
      const data = res?.data;
      const list = Array.isArray(data) ? data : (data as any)?.data || [];
      setSuppliers(list);
    } catch {
      // Fallback
    }
  }, []);

  const loadParts = useCallback(async () => {
    try {
      const res = await inventoryService.getParts({ per_page: 'all', all: true });
      const data = res?.data;
      const list = Array.isArray(data) ? data : (data as any)?.data || [];
      setAvailableParts(list);
    } catch {
      // Fallback
    }
  }, []);

  const checkCashDrawer = useCallback(async () => {
    try {
      const res = await cashbookService.getBranchBalance();
      if (res?.data) {
        setDrawerBalance({
          current_cash_balance: res.data.current_cash_balance || 0,
          has_active_shift: res.data.has_active_shift || false,
        });
      }
    } catch {
      setDrawerBalance(null);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
    loadParts();
    checkCashDrawer();
  }, [loadSuppliers, loadParts, checkCashDrawer]);

  const handleRefreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory-parts'] });
    queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] });
    loadSuppliers();
    loadParts();
    checkCashDrawer();
  };

  const tabsConfig: Array<{
    id: InventoryTabKey;
    label: string;
    icon: string;
    badgeCount?: number;
  }> = [
    { id: 'stock', label: 'Tồn kho & Kệ tủ', icon: 'inventory' },
    { id: 'receipts', label: 'Nhập hàng từ NCC', icon: 'receipt' },
    { id: 'suppliers', label: 'Nhà cung cấp & Sổ nợ', icon: 'partners', badgeCount: suppliers.filter((s) => Number(s.debt_balance) > 0).length || undefined },
    { id: 'movements', label: 'Thẻ kho & Biến động', icon: 'timeline' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1 flex items-center gap-2">
            <span>INVENTORY & PROCUREMENT HUB</span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#176b58]" />
            <span className="text-[#176b58] font-bold">{branch || 'FIXO'}</span>
          </div>
          <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
            Kho & Mua hàng
          </h1>
          <p className="text-xs text-[#85928c] mt-1 mb-0">
            Hợp nhất quản lý tồn kho linh kiện, vị trí kệ tủ, nhập hàng nhà cung cấp và theo dõi công nợ toàn chuỗi.
          </p>
        </div>

        {/* Thanh công cụ Chọn ngày & Xuất Excel nguyên liệu xuất kho trong ngày */}
        <div className="flex flex-wrap items-center gap-2.5 bg-white border border-[#dce6e0] rounded-[10px] p-2.5 shadow-2xs">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-[#556960] whitespace-nowrap">
              Ngày xuất kho:
            </span>
            <input
              type="date"
              data-testid="inventory-export-date-input"
              value={selectedExportDate}
              onChange={(e) => setSelectedExportDate(e.target.value)}
              className="h-9 px-2.5 text-xs font-medium text-[#1c302b] bg-[#f7f9f8] border border-[#cde2d6] rounded-[8px] outline-none focus:border-[#176b58] cursor-pointer"
            />
            <button
              type="button"
              data-testid="inventory-export-today-btn"
              onClick={() => setSelectedExportDate(getTodayDateStringInGmt7())}
              className={`h-9 px-2.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer border ${
                selectedExportDate === getTodayDateStringInGmt7()
                  ? 'bg-[#eaf4ef] text-[#176b58] border-[#b8d9cb]'
                  : 'bg-white text-[#596962] border-[#e2e8e5] hover:bg-[#f5f8f6]'
              }`}
            >
              Hôm nay
            </button>
          </div>

          <Button
            variant="primary"
            size="sm"
            icon="download"
            data-testid="export-daily-inventory-btn"
            disabled={isExportingDailyParts}
            onClick={() => handleExportDailyParts(selectedExportDate)}
            className="bg-[#176b58] hover:bg-[#125848] text-white font-bold text-xs px-3.5 h-9 flex items-center gap-1.5 shadow-xs whitespace-nowrap"
          >
            <span>
              {isExportingDailyParts
                ? 'Đang xuất Excel...'
                : 'Xuất Excel xuất kho ngày (.xls)'}
            </span>
          </Button>
        </div>
      </div>

      {/* Unified Tab Navigation Bar */}
      <div className="flex items-center border-b border-[#e2e8e5] gap-4 sm:gap-8 text-sm font-semibold overflow-x-auto no-scrollbar">
        {tabsConfig.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`pb-3 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                isActive
                  ? 'border-[#176b58] text-[#176b58] font-bold'
                  : 'border-transparent text-[#6e7f77] hover:text-[#1c302b]'
              }`}
            >
              <Icon name={tab.icon} size={18} />
              <span>{tab.label}</span>
              {tab.badgeCount !== undefined && tab.badgeCount > 0 && (
                <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                  isActive ? 'bg-[#d8ece1] text-[#176b58]' : 'bg-[#eef2ef] text-[#6b7b74]'
                }`}>
                  {tab.badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {activeTab === 'stock' && (
        <StockTab
          role={role}
          currentUser={currentUser}
          branch={branch}
          branchId={branchId}
          branches={branches}
          setBranch={setBranch}
          onRefreshAll={handleRefreshAll}
        />
      )}

      {activeTab === 'receipts' && (
        <ReceiptsTab
          suppliers={suppliers}
          parts={availableParts}
          drawerBalance={drawerBalance}
          onCheckDrawer={checkCashDrawer}
          onRefreshAll={handleRefreshAll}
        />
      )}

      {activeTab === 'suppliers' && (
        <SuppliersTab
          parts={availableParts}
          drawerBalance={drawerBalance}
          onCheckDrawer={checkCashDrawer}
          onRefreshAll={handleRefreshAll}
        />
      )}

      {activeTab === 'movements' && (
        <MovementsTab
          role={role}
          currentUser={currentUser}
          branch={branch}
          branchId={branchId}
          branches={branches}
          parts={availableParts}
          selectedExportDate={selectedExportDate}
          onSelectExportDate={setSelectedExportDate}
          onExportDailyParts={handleExportDailyParts}
          isExportingDailyParts={isExportingDailyParts}
          onRefreshAll={handleRefreshAll}
        />
      )}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <AppShell crumbName="Kho & Mua hàng">
      <Suspense fallback={<TableSkeleton rows={8} cols={6} />}>
        <InventoryMasterView />
      </Suspense>
    </AppShell>
  );
}
