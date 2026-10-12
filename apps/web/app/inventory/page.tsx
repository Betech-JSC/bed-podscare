'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Icon,
  TableSkeleton,
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
      const res = await supplierService.getSuppliers({ per_page: 100 });
      const data = res?.data;
      const list = Array.isArray(data) ? data : (data as any)?.data || [];
      setSuppliers(list);
    } catch {
      // Fallback
    }
  }, []);

  const loadParts = useCallback(async () => {
    try {
      const res = await inventoryService.getParts({ per_page: 100 });
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
