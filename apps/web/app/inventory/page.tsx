'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Button,
  Icon,
  TableSkeleton,
  useToast,
  resolveOrderStatus,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';
import {
  supplierService,
  inventoryService,
  cashbookService,
  repairService,
  type Supplier,
  type InventoryPart,
} from '@podscare/api-client';
import type { RepairOrder } from '@podscare/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { StockTab } from './components/StockTab';
import { ReceiptsTab } from './components/ReceiptsTab';
import { SuppliersTab } from './components/SuppliersTab';
import { MovementsTab } from './components/MovementsTab';
import {
  exportDailyExportedPartsExcel,
  getTodayDateStringInGmt7,
  formatSelectedDateVi,
} from './utils/dailyExportedPartsExcel';
import { exportPartsUsageExcel } from '../dashboard/utils/partsUsageExcelExport';
import {
  inferLinkedPartsFromOrderText,
  parsePartsSummaryToItems,
  formatLinkedPartsSummary,
} from '../constants/commonIssueCatalog';

type InventoryTabKey = 'stock' | 'receipts' | 'suppliers' | 'movements';

const VALID_TABS: InventoryTabKey[] = ['stock', 'receipts', 'suppliers', 'movements'];

interface RecentRepairPartDeductionItem {
  id: string;
  orderCode: string;
  deviceName: string;
  issueText: string;
  partSku: string;
  partName: string;
  quantity: number;
  unit: string;
  createdTime: string;
}

function InventoryMasterView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const {
    orders,
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
  const [isExportingOrderParts, setIsExportingOrderParts] = useState<boolean>(false);

  // Tải danh sách giao dịch kho trong ngày đã chọn để hiển thị chỉ số nhanh trên đầu Kho & Mua hàng
  const { data: dailyTxData } = useQuery({
    queryKey: ['inventory-daily-export-summary', branchId, selectedExportDate],
    queryFn: async () => {
      const res = await inventoryService.getTransactions({
        branch_id:
          branchId && branchId !== 'all' ? Number(branchId) : undefined,
        from_date: selectedExportDate,
        to_date: selectedExportDate,
        per_page: 'all',
        all: true,
      } as any);
      return res?.data || res;
    },
  });

  // Tải danh sách đơn sửa chữa theo ngày để phục vụ xuất Excel Linh kiện trừ theo đơn tại Kho & Mua hàng
  const { data: dailyRepairsData } = useQuery({
    queryKey: ['inventory-daily-repairs-parts', branchId, selectedExportDate],
    queryFn: async () => {
      const res = await repairService.getRepairs({
        branch_id:
          branchId && branchId !== 'all' ? Number(branchId) : undefined,
        date: selectedExportDate,
        per_page: 'all',
        all: true,
      });
      return res?.data || res;
    },
  });

  const dailyTransactionsList = useMemo(() => {
    if (Array.isArray(dailyTxData)) return dailyTxData;
    if (Array.isArray((dailyTxData as any)?.data)) return (dailyTxData as any).data;
    return [];
  }, [dailyTxData]);

  const mappedOrdersForInventory: RepairOrder[] = useMemo(() => {
    const rawList = Array.isArray(dailyRepairsData)
      ? dailyRepairsData
      : Array.isArray((dailyRepairsData as any)?.data)
      ? (dailyRepairsData as any).data
      : [];

    if (rawList.length > 0) {
      return rawList.map((o: any) => {
        const mappedStatus = resolveOrderStatus(o.status);
        return {
          id: o.order_code || String(o.id),
          name: o.customer?.name || o.name || 'Khách lẻ',
          phone: o.customer?.phone || o.phone || '',
          deviceCategory: o.device_model?.category || o.deviceCategory || 'AirPods',
          device: o.device_model?.name || o.device || 'AirPods',
          serial: o.serial_number || o.serial || 'Chưa cập nhật',
          issue: o.issue_description || o.issue || 'Kiểm tra',
          status: mappedStatus.label,
          statusType: mappedStatus.type,
          price: Number(o.total_price || o.estimated_price || o.price || 0),
          total_price: Number(o.total_price || o.price || 0),
          tech: o.technician?.name || o.tech || 'Chưa phân công',
          date: o.created_at
            ? new Intl.DateTimeFormat('vi-VN').format(new Date(o.created_at))
            : o.date || formatSelectedDateVi(selectedExportDate),
          createdAt: o.created_at || o.createdAt,
          branch: o.branch?.name || o.branch || branch || 'FIXO',
          branchId: o.branch_id || o.branch?.id || 1,
          accessories: o.accessories,
          parts_needed: o.parts_needed ?? o.partsNeeded,
          partsNeeded: o.parts_needed ?? o.partsNeeded,
          partsUsed: o.parts_used_summary || o.partsUsed,
          additional_services: Array.isArray(o.additional_services)
            ? o.additional_services
            : [],
        } as RepairOrder;
      });
    }

    // Fallback sang danh sách đơn trong Context nếu API chưa trả dữ liệu riêng cho ngày đó
    return Array.isArray(orders) ? orders : [];
  }, [dailyRepairsData, orders, branch, selectedExportDate]);

  // Tổng hợp các lượt xuất linh kiện khi tạo đơn sửa chữa (export_repair)
  const repairExportStats = useMemo(() => {
    const deductions: RecentRepairPartDeductionItem[] = [];
    const seenKeys = new Set<string>();
    const orderCodesSet = new Set<string>();

    // 1. Lấy từ giao dịch kho thực tế (transaction_type === 'export_repair')
    dailyTransactionsList
      .filter((tx: any) => tx?.transaction_type === 'export_repair')
      .forEach((tx: any, idx: number) => {
        const orderObj = tx?.repair_order || tx?.repairOrder || {};
        const orderCode = String(orderObj?.order_code || '').trim() || 'Đơn sửa chữa';
        const matchedOrder = mappedOrdersForInventory.find((o) => o.id === orderCode);
        const issueText =
          orderObj?.issue_description ||
          matchedOrder?.issue ||
          String(tx?.notes || '').replace(/^Tự động trừ kho khi tạo đơn[^:]*:\s*/i, '') ||
          'Thay thế linh kiện theo lỗi';
        const deviceName =
          orderObj?.device_model?.name ||
          orderObj?.deviceModel?.name ||
          matchedOrder?.device ||
          tx?.part?.category ||
          'Thiết bị';
        const partSku = String(tx?.part?.sku || `SKU-${tx?.part_id || idx + 1}`).trim();
        const partName = String(tx?.part?.name || `Linh kiện #${tx?.part_id || idx + 1}`).trim();
        const qty = Math.max(1, Math.abs(Number(tx?.quantity) || 1));
        const unit = String(tx?.part?.unit || 'Cái');
        const createdTime = tx?.created_at
          ? new Date(tx.created_at).toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : formatSelectedDateVi(selectedExportDate);

        const dedupKey = `${orderCode}__${partSku}`;
        seenKeys.add(dedupKey);
        if (orderCode) orderCodesSet.add(orderCode);

        deductions.push({
          id: `tx-${tx?.id ?? idx}`,
          orderCode,
          deviceName,
          issueText,
          partSku,
          partName,
          quantity: qty,
          unit,
          createdTime,
        });
      });

    // 2. Bổ sung từ danh sách đơn sửa chữa nếu đơn đã gắn linh kiện lỗi (parts_needed / issue)
    mappedOrdersForInventory.forEach((ord) => {
      if (['Đã hủy', 'Từ chối sửa'].includes(ord.status)) return;
      const explicitParts = parsePartsSummaryToItems(
        ord.parts_needed || ord.partsNeeded || ord.partsUsed
      );
      const effectiveParts =
        explicitParts.length > 0
          ? explicitParts
          : inferLinkedPartsFromOrderText(
              ord.issue,
              ord.deviceCategory || ord.device,
              undefined,
              ord.device
            ).linkedParts;

      effectiveParts.forEach((pt, pIdx) => {
        const dedupKey = `${ord.id}__${pt.part_sku}`;
        if (seenKeys.has(dedupKey)) return;
        seenKeys.add(dedupKey);
        orderCodesSet.add(ord.id);

        deductions.push({
          id: `ord-${ord.id}-${pIdx}`,
          orderCode: ord.id,
          deviceName: ord.device,
          issueText: ord.issue,
          partSku: pt.part_sku,
          partName: pt.part_name,
          quantity: Math.max(1, Number(pt.quantity) || 1),
          unit: pt.unit || 'Cái',
          createdTime: ord.createdAt
            ? new Date(ord.createdAt).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : ord.date || formatSelectedDateVi(selectedExportDate),
        });
      });
    });

    const totalDeductedQty = deductions.reduce((sum, item) => sum + item.quantity, 0);
    return {
      exportRepairCount: deductions.length,
      totalDeductedQty,
      orderCount: orderCodesSet.size,
      recentDeductions: deductions.slice(0, 6),
    };
  }, [dailyTransactionsList, mappedOrdersForInventory, selectedExportDate]);

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

  // Xuất Excel Linh Kiện Trừ Theo Đơn Sửa Chữa (.xls) ngay tại Kho & Mua hàng
  const handleExportOrderPartsUsage = useCallback(
    async (targetDate?: string) => {
      const dateToUse = (targetDate || selectedExportDate || getTodayDateStringInGmt7()).trim();
      setIsExportingOrderParts(true);
      try {
        let ordersToExport: RepairOrder[] = mappedOrdersForInventory;

        // Thử nạp danh sách đơn mới nhất từ API nếu có thể
        try {
          const res = await repairService.getRepairs({
            branch_id: branchId && branchId !== 'all' ? Number(branchId) : undefined,
            date: dateToUse,
            per_page: 'all',
            all: true,
          });
          const raw = res?.data?.data || res?.data || res;
          if (Array.isArray(raw) && raw.length > 0) {
            ordersToExport = raw.map((o: any) => {
              const mappedStatus = resolveOrderStatus(o.status);
              const fallbackParts = formatLinkedPartsSummary(
                inferLinkedPartsFromOrderText(
                  o.issue_description || o.issue,
                  o.device_model?.category || o.deviceCategory,
                  undefined,
                  o.device_model?.name || o.device
                ).linkedParts
              );
              return {
                id: o.order_code || String(o.id),
                name: o.customer?.name || o.name || 'Khách lẻ',
                phone: o.customer?.phone || o.phone || '',
                deviceCategory: o.device_model?.category || o.deviceCategory || 'AirPods',
                device: o.device_model?.name || o.device || 'AirPods',
                serial: o.serial_number || o.serial || 'Chưa cập nhật',
                issue: o.issue_description || o.issue || 'Kiểm tra',
                status: mappedStatus.label,
                statusType: mappedStatus.type,
                price: Number(o.total_price || o.estimated_price || o.price || 0),
                total_price: Number(o.total_price || o.price || 0),
                tech: o.technician?.name || o.tech || 'Chưa phân công',
                date: o.created_at
                  ? new Intl.DateTimeFormat('vi-VN').format(new Date(o.created_at))
                  : formatSelectedDateVi(dateToUse),
                createdAt: o.created_at || o.createdAt,
                branch: o.branch?.name || o.branch || branch || 'FIXO',
                branchId: o.branch_id || o.branch?.id || 1,
                accessories: o.accessories,
                parts_needed: o.parts_needed || o.partsNeeded || fallbackParts,
                partsNeeded: o.parts_needed || o.partsNeeded || fallbackParts,
                partsUsed: o.parts_used_summary || o.partsUsed,
                additional_services: Array.isArray(o.additional_services)
                  ? o.additional_services
                  : [],
              } as RepairOrder;
            });
          }
        } catch {
          // Giữ fallback mappedOrdersForInventory
        }

        const branchLabel =
          !branchId || branchId === 'all'
            ? 'Toàn bộ chi nhánh'
            : branches.find((b) => String(b.id) === String(branchId))?.name ||
              branch ||
              'FIXO';

        const exported = exportPartsUsageExcel({
          orders: ordersToExport,
          periodLabel: `Ngày ${formatSelectedDateVi(dateToUse)}`,
          branchLabel,
          fileNamePrefix: `Bao_Cao_Linh_Kien_Theo_Don_${dateToUse}`,
          hideRevenue: role !== 'admin' && (role as string) !== 'super_admin',
        });

        toast(
          `Đã xuất file Linh kiện theo đơn (.xls): ${exported.totalPartQuantity} linh kiện đã trừ kho / ${exported.orderCount} đơn sửa chữa!`,
          'success'
        );
      } finally {
        setIsExportingOrderParts(false);
      }
    },
    [selectedExportDate, mappedOrdersForInventory, branchId, branches, branch, role, toast]
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
    queryClient.invalidateQueries({ queryKey: ['inventory-daily-export-summary'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-daily-repairs-parts'] });
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
    {
      id: 'suppliers',
      label: 'Nhà cung cấp & Sổ nợ',
      icon: 'partners',
      badgeCount: suppliers.filter((s) => Number(s.debt_balance) > 0).length || undefined,
    },
    { id: 'movements', label: 'Thẻ kho & Biến động', icon: 'timeline' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1 flex items-center gap-2">
            <span>INVENTORY &amp; PROCUREMENT HUB</span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#176b58]" />
            <span className="text-[#176b58] font-bold">{branch || 'FIXO'}</span>
          </div>
          <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
            Kho &amp; Mua hàng
          </h1>
          <p className="text-xs text-[#85928c] mt-1 mb-0">
            Trung tâm quản lý tồn kho linh kiện, tự động trừ kho theo lỗi khi tạo đơn sửa chữa và xuất báo cáo xuất kho (.xls).
          </p>
        </div>
      </div>

      {/* KHU VỰC NỔI BẬT: Thông tin Xuất Kho Linh Kiện Sửa Chữa & Xuất Báo Cáo (.xls) */}
      <div
        data-testid="inventory-export-parts-hub"
        className="bg-white rounded-[12px] border-2 border-[#cde2d6] p-4 sm:p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-3.5 border-b border-[#e8f0ec]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded bg-[#176b58] text-white text-[10px] font-bold uppercase tracking-wider">
                TRUNG TÂM XUẤT LINH KIỆN
              </span>
              <span className="text-xs font-bold text-[#176b58]">
                Ngày báo cáo: {formatSelectedDateVi(selectedExportDate)}
              </span>
            </div>
            <h2 className="font-heading font-bold text-base sm:text-lg text-[#1c302b] m-0">
              Thông tin Xuất Kho Linh Kiện Sửa Chữa &amp; Xuất Báo Cáo (.xls)
            </h2>
            <p className="text-xs text-[#6e7f77] mt-0.5 mb-0">
              Theo dõi toàn bộ linh kiện tự động trừ kho khi tạo đơn sửa chữa và xuất file báo cáo Excel (.xls) tập trung tại Kho &amp; Mua hàng.
            </p>
          </div>

          {/* Cụm điều khiển Chọn ngày xuất kho (exportDate) + 2 Nút xuất file (.xls) */}
          <div className="flex flex-wrap items-center gap-2 bg-[#f7faf8] border border-[#cde2d6] rounded-[10px] p-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[#556960] whitespace-nowrap">
                Ngày xuất kho:
              </span>
              <input
                type="date"
                data-testid="inventory-export-date-input"
                value={selectedExportDate}
                onChange={(e) => setSelectedExportDate(e.target.value)}
                className="h-9 px-2.5 text-xs font-medium text-[#1c302b] bg-white border border-[#cde2d6] rounded-[8px] outline-none focus:border-[#176b58] cursor-pointer"
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
                  : 'Xuất Excel Giao Dịch Xuất Kho Ngày (.xls)'}
              </span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              icon="download"
              data-testid="inventory-export-order-parts-btn"
              disabled={isExportingOrderParts}
              onClick={() => handleExportOrderPartsUsage(selectedExportDate)}
              className="bg-white text-[#176b58] border-[#176b58] hover:bg-[#eaf4ef] font-bold text-xs px-3.5 h-9 flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
            >
              <span>
                {isExportingOrderParts
                  ? 'Đang tổng hợp...'
                  : 'Xuất Excel Linh Kiện Trừ Theo Đơn Sửa Chữa (.xls)'}
              </span>
            </Button>
          </div>
        </div>

        {/* 3 Chỉ số nhanh trong ngày */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-[10px] bg-[#f4faf7] border border-[#cde2d6] flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#176b58] uppercase block">
                Lượt xuất linh kiện sửa chữa (export_repair)
              </span>
              <span className="text-[11px] text-[#5c6f66] block mt-0.5">
                Tự động trừ kho ngay khi tạo đơn
              </span>
            </div>
            <strong
              data-testid="inventory-export-repair-tx-count"
              className="font-heading text-2xl font-extrabold text-[#176b58] tabular-nums"
            >
              {repairExportStats.exportRepairCount}{' '}
              <small className="text-xs font-semibold">lượt</small>
            </strong>
          </div>

          <div className="p-3.5 rounded-[10px] bg-[#fbefed] border border-[#f5d5d0] flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#bc5b52] uppercase block">
                Tổng linh kiện đã trừ kho theo đơn
              </span>
              <span className="text-[11px] text-[#7a433e] block mt-0.5">
                Số lượng linh kiện xuất cho đơn sửa chữa
              </span>
            </div>
            <strong
              data-testid="inventory-export-repair-total-qty"
              className="font-heading text-2xl font-extrabold text-[#bc5b52] tabular-nums"
            >
              -{repairExportStats.totalDeductedQty}{' '}
              <small className="text-xs font-semibold">cái</small>
            </strong>
          </div>

          <div className="p-3.5 rounded-[10px] bg-[#faf3e7] border border-[#edd9b7] flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#b77a21] uppercase block">
                Số đơn sửa chữa đã trừ linh kiện
              </span>
              <span className="text-[11px] text-[#78531a] block mt-0.5">
                Đơn gắn lỗi &amp; mã SKU linh kiện kho
              </span>
            </div>
            <strong
              data-testid="inventory-export-repair-order-count"
              className="font-heading text-2xl font-extrabold text-[#b77a21] tabular-nums"
            >
              {repairExportStats.orderCount}{' '}
              <small className="text-xs font-semibold">đơn</small>
            </strong>
          </div>
        </div>

        {/* Danh sách tóm tắt các linh kiện vừa xuất cho đơn sửa chữa */}
        <div
          data-testid="inventory-recent-repair-exports-list"
          className="rounded-[10px] border border-[#e5ece8] bg-[#fafcfa] p-3.5 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon name="timeline" size={15} className="text-[#176b58]" />
              <span className="text-xs font-bold text-[#1c302b] uppercase tracking-wide">
                Danh sách linh kiện vừa xuất trừ kho theo đơn sửa chữa
              </span>
            </div>
            <button
              type="button"
              data-testid="inventory-goto-movements-btn"
              onClick={() => handleTabChange('movements')}
              className="text-xs font-bold text-[#176b58] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Xem toàn bộ Lịch sử Nhập/Xuất (Thẻ kho) ↗</span>
            </button>
          </div>

          {repairExportStats.recentDeductions.length === 0 ? (
            <div className="text-xs text-[#758780] py-2 text-center">
              Chưa có lượt xuất linh kiện theo đơn sửa chữa nào trong ngày{' '}
              {formatSelectedDateVi(selectedExportDate)}. Khi tạo đơn sửa chữa mới có gắn lỗi, linh kiện sẽ tự động trừ kho và hiển thị tại đây.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[680px]">
                <thead>
                  <tr className="border-b border-[#e2eae5] text-[11px] font-bold text-[#758780] uppercase">
                    <th className="py-1.5 px-2">Mã đơn</th>
                    <th className="py-1.5 px-2">Thiết bị &amp; Lỗi sửa chữa</th>
                    <th className="py-1.5 px-2">Linh kiện đã trừ kho (SKU)</th>
                    <th className="py-1.5 px-2 text-center">SL trừ</th>
                    <th className="py-1.5 px-2 text-right">Thời gian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef3f0]">
                  {repairExportStats.recentDeductions.map((item) => (
                    <tr key={item.id} className="hover:bg-white transition-colors">
                      <td className="py-2 px-2 font-mono font-bold text-[#176b58]">
                        #{item.orderCode}
                      </td>
                      <td className="py-2 px-2 text-[#1c302b]">
                        <span className="font-semibold">{item.deviceName}: </span>
                        <span className="text-[#556960]">{item.issueText}</span>
                      </td>
                      <td className="py-2 px-2">
                        <span className="font-semibold text-[#1c302b]">{item.partName}</span>{' '}
                        <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#eaf4ef] text-[#176b58] border border-[#cde2d6]">
                          {item.partSku}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center font-mono font-bold text-[#bc5b52]">
                        -{item.quantity} {item.unit}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-[#6e7f77]">
                        {item.createdTime}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive ? 'bg-[#d8ece1] text-[#176b58]' : 'bg-[#eef2ef] text-[#6b7b74]'
                  }`}
                >
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
