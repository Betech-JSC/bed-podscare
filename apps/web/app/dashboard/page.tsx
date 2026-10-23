'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useToast,
  formatVND as sharedFormatVND,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { IntakeWizardModal } from '../components/IntakeWizardModal';
import { TechOrderDetailModal } from '../components/TechOrderDetailModal';
import { CheckoutHandoverModal } from '../components/CheckoutHandoverModal';
import { AdminDashboardView } from './components/AdminDashboardView';
import { CskhDashboardView } from './components/CskhDashboardView';
import { TechDashboardView } from './components/TechDashboardView';
import { RevenueDrilldownModal } from './components/RevenueDrilldownModal';
import { downloadRevenueExcelReport } from './utils/revenueExcelExport';
import { usePodsCare } from '../providers';
import { useShift } from '../providers/ShiftProvider';
import type { RepairOrder, RevenueOrderBreakdownItem } from '@podscare/types';
import { kpiService, repairService } from '@podscare/api-client';
import { useQuery } from '@tanstack/react-query';
import { normalizeStatusCode } from '../repairs/fsm';
import { useSilentPrint } from '../components/print';

const formatDateInGmt7 = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

export default function DashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { role, currentUser, orders, updateOrder, branchId, branch, invalidateOrders } = usePodsCare();
  const { refreshShift } = useShift();

  const [intakeModalOpen, setIntakeModalOpen] = useState(false);
  const [initialIntakeType, setInitialIntakeType] = useState<'in_store' | 'cod' | 'warranty'>('in_store');
  const [cskhPendingModalOpen, setCskhPendingModalOpen] = useState(false);
  const [period, setPeriod] = useState<'7_days' | '14_days' | '30_days'>('14_days');

  const todayStr = React.useMemo(() => formatDateInGmt7(new Date()), []);
  const yesterdayStr = React.useMemo(() => {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return formatDateInGmt7(d);
  }, []);
  const sevenDaysAgoStr = React.useMemo(() => {
    const d = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    return formatDateInGmt7(d);
  }, []);
  const monthStartStr = React.useMemo(() => {
    const parts = todayStr.split('-');
    return parts.length === 3 ? `${parts[0]}-${parts[1]}-01` : todayStr;
  }, [todayStr]);

  const [activePreset, setActivePreset] = useState<'today' | 'yesterday' | '7_days' | '30_days' | 'custom'>('today');
  const [selectedDate, setSelectedDate] = useState<string>(() => formatDateInGmt7(new Date()));
  const [fromDate, setFromDate] = useState<string>(() => formatDateInGmt7(new Date()));
  const [toDate, setToDate] = useState<string>(() => formatDateInGmt7(new Date()));

  const handleDateRangeChange = React.useCallback(
    (nextFromRaw: string, nextToRaw: string) => {
      const cleanFrom = (nextFromRaw || todayStr).trim();
      const cleanTo = (nextToRaw || cleanFrom || todayStr).trim();
      const [normFrom, normTo] =
        cleanFrom <= cleanTo ? [cleanFrom, cleanTo] : [cleanTo, cleanFrom];

      setFromDate(normFrom);
      setToDate(normTo);
      setSelectedDate(normTo);

      if (normFrom === normTo && normFrom === todayStr) {
        setActivePreset('today');
      } else if (normFrom === normTo && normFrom === yesterdayStr) {
        setActivePreset('yesterday');
      } else if (normFrom === sevenDaysAgoStr && normTo === todayStr) {
        setActivePreset('7_days');
      } else if (normFrom === monthStartStr && normTo === todayStr) {
        setActivePreset('30_days');
      } else {
        setActivePreset('custom');
      }
    },
    [todayStr, yesterdayStr, sevenDaysAgoStr, monthStartStr]
  );

  const handleSingleDateChange = React.useCallback(
    (val: string) => {
      handleDateRangeChange(val, val);
    },
    [handleDateRangeChange]
  );

  // Technician Workspace State
  const [techTab, setTechTab] = useState<'my_orders' | 'available' | 'completed'>('my_orders');
  const [selectedTechOrder, setSelectedTechOrder] = useState<RepairOrder | null>(null);
  const [techModalOpen, setTechModalOpen] = useState(false);
  const [isTechSubmitting, setIsTechSubmitting] = useState(false);
  const { printReceipt, isPrinting: isSilentPrinting } = useSilentPrint();

  // Checkout Handover Modal State
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<RepairOrder | null>(null);

  // Customer Revenue & Debt Drill-Down Modal State
  const [drilldownModalOpen, setDrilldownModalOpen] = useState(false);
  const [drilldownPeriod, setDrilldownPeriod] = useState<'month' | 'day'>('month');
  const [drilldownFilter, setDrilldownFilter] = useState<'all' | 'collected' | 'uncollected'>('all');
  const [drilldownSearch, setDrilldownSearch] = useState('');
  const [drilldownSortKey, setDrilldownSortKey] = useState<
    'customer' | 'order' | 'total' | 'collected' | 'uncollected'
  >('uncollected');
  const [drilldownSortDir, setDrilldownSortDir] = useState<'asc' | 'desc'>('desc');

  const handleOpenDrilldownModal = (
    targetPeriod: 'month' | 'day',
    targetFilter: 'all' | 'collected' | 'uncollected'
  ) => {
    setDrilldownPeriod(targetPeriod);
    setDrilldownFilter(targetFilter);
    setDrilldownSearch('');
    setDrilldownModalOpen(true);
  };

  const handleDrilldownSort = (
    key: 'customer' | 'order' | 'total' | 'collected' | 'uncollected'
  ) => {
    if (drilldownSortKey === key) {
      setDrilldownSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setDrilldownSortKey(key);
      setDrilldownSortDir(key === 'customer' || key === 'order' ? 'asc' : 'desc');
    }
  };

  // Đấu nối KPI Dashboard API (Single Source of Truth)
  const {
    data: kpiData,
    isLoading: isLoadingKpi,
    isFetching: isFetchingKpi,
  } = useQuery({
    queryKey: ['kpi-dashboard', branchId, period, selectedDate, fromDate, toDate],
    queryFn: async () => {
      const res = await kpiService.getDashboardKpi({
        branch_id: branchId && branchId !== 'all' ? branchId : undefined,
        period,
        date: selectedDate,
        from_date: fromDate,
        to_date: toDate,
      });
      return res?.data || res;
    },
  });

  const isKpiLoading = isLoadingKpi || isFetchingKpi;

  const moneyFormatted = (n: number) => (n ? sharedFormatVND(n) : '—');
  const formatVND = (n?: number | string | null) => sharedFormatVND(n);

  // Lọc orders theo chi nhánh hiện hành
  const branchOrders = React.useMemo(() => {
    if (!branchId || branchId === 'all') return orders;
    return orders.filter(
      (o) =>
        String(o.branchId) === String(branchId) ||
        o.branch === branch ||
        o.branchName === branch
    );
  }, [orders, branchId, branch]);

  // CSKH Ready-for-Return calculations
  const cskhReadyOrders = React.useMemo(() => {
    return branchOrders.filter((o) => {
      const code = normalizeStatusCode(o.status);
      return (
        code === 'ready_for_return' ||
        code === 'waiting_pickup' ||
        o.status === 'Sẵn sàng trả' ||
        o.status === 'Chờ khách nhận'
      );
    });
  }, [branchOrders]);

  // CSKH Pending calculations
  const cskhPendingOrders = branchOrders
    .filter((o) => !['Hoàn tất', 'Đã hủy', 'Đã trả máy'].includes(o.status))
    .sort((a, b) => {
      const priority: Record<string, number> = {
        'Sẵn sàng trả': 1,
        'Chờ khách nhận': 1,
        'Cần sửa lại': 2,
        'Chờ QC': 3,
        'Chờ kỹ thuật': 4,
        'Đã nhận đơn': 5,
        'Đang sửa': 6,
      };
      return (priority[a.status] || 9) - (priority[b.status] || 9);
    });

  // Tech Queue calculations
  const currentUserId = currentUser?.id ? Number(currentUser.id) : null;

  const techActiveOrders = React.useMemo(() => {
    return branchOrders.filter((o) => {
      const code = normalizeStatusCode(o.status);
      const isMyOrder =
        currentUser?.role === 'admin' ||
        (currentUserId !== null && Number(o.technicianId || o.technician_id) === currentUserId);
      return (
        isMyOrder &&
        ['assigned', 'in_repair', 'waiting_parts', 'rework_needed'].includes(code)
      );
    });
  }, [branchOrders, currentUser?.role, currentUserId]);

  const techAvailableOrders = React.useMemo(() => {
    return branchOrders.filter((o) => {
      const code = normalizeStatusCode(o.status);
      const isUnassigned = !o.technicianId && !o.technician_id;
      return (
        isUnassigned &&
        (code === 'waiting_tech' || ['Đã duyệt', 'Chờ kỹ thuật', 'Tiếp nhận mới'].includes(o.status))
      );
    });
  }, [branchOrders]);

  const techCompletedOrders = React.useMemo(() => {
    return branchOrders.filter((o) => {
      const code = normalizeStatusCode(o.status);
      const isMyOrder =
        currentUser?.role === 'admin' ||
        (currentUserId !== null && Number(o.technicianId || o.technician_id) === currentUserId);
      return (
        isMyOrder &&
        ['ready_for_return', 'waiting_qc', 'waiting_pickup', 'completed'].includes(code)
      );
    });
  }, [branchOrders, currentUser?.role, currentUserId]);

  const unfinishedTechOrders = React.useMemo(() => {
    return branchOrders.filter((o) => {
      const code = normalizeStatusCode(o.status);
      return ['in_repair', 'waiting_parts', 'assigned', 'rework_needed'].includes(code);
    });
  }, [branchOrders]);

  const formatWorkshopDuration = (createdAtStr?: string) => {
    if (!createdAtStr) return '—';
    try {
      const created = new Date(createdAtStr);
      if (isNaN(created.getTime())) return createdAtStr;
      const diffMs = Math.max(0, Date.now() - created.getTime());
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      if (days > 0) return `${days} ngày ${remHours > 0 ? `${remHours}h` : ''}`.trim();
      if (hours > 0) return `${hours} giờ`;
      const mins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
      return `${mins} phút`;
    } catch {
      return '—';
    }
  };

  const handleOpenOrderDetail = async (orderCode: string, orderId?: number) => {
    const found = branchOrders.find(
      (o) =>
        String(o.id) === String(orderCode) ||
        (orderId !== undefined && String(o.id) === String(orderId)) ||
        (o as any).order_code === orderCode ||
        (o as any).orderCode === orderCode
    );
    if (found) {
      const enriched: RepairOrder = {
        ...found,
        checks: found.checks || [],
        photos: found.photos || [],
        accessories: found.accessories,
        appearance: found.appearance,
        testNote: found.testNote || found.test_note || '',
        parts_needed: found.parts_needed || found.partsNeeded,
        special_parts_needed: found.special_parts_needed || found.specialPartsNeeded,
        special_parts_status: found.special_parts_status || found.specialPartsStatus,
        additional_services: found.additional_services || found.additionalServices || [],
        order_type: found.order_type || found.orderType || 'in_store',
        warranty_terms_days: found.warranty_terms_days,
        warranty_months: found.warranty_months,
      };
      setSelectedTechOrder(enriched);
      setTechModalOpen(true);

      if ((!enriched.checks || enriched.checks.length === 0) && (!enriched.photos || enriched.photos.length === 0)) {
        try {
          const detailRes = await repairService.getRepairById(found.id);
          const raw = detailRes?.data || detailRes;
          if (raw && (raw.order_code || raw.id)) {
            const mappedChecks = Array.isArray(raw.intake_checklists)
              ? raw.intake_checklists.map((c: any) => ({
                  label: c.item_label || c.label || c.item_key,
                  status:
                    c.status === 'good' || c.status === 'ok' || c.status === 'Hoạt động'
                      ? 'Hoạt động'
                      : c.status === 'broken' || c.status === 'error' || c.status === 'Lỗi'
                      ? 'Lỗi'
                      : 'Chưa rõ',
                }))
              : enriched.checks || [];
            const mappedPhotos = Array.isArray(raw.intake_photos)
              ? raw.intake_photos.map((p: any) => ({
                  name: p.photo_type || p.name || 'Ảnh thiết bị',
                  url: p.photo_url || p.file_path || p.url,
                }))
              : enriched.photos || [];
            setSelectedTechOrder((prev) =>
              prev && prev.id === enriched.id
                ? {
                    ...prev,
                    checks: mappedChecks,
                    photos: mappedPhotos,
                    accessories: raw.accessories ?? prev.accessories,
                    appearance: raw.appearance_notes ?? prev.appearance,
                    testNote: raw.test_note || raw.testNote || prev.testNote || '',
                    parts_needed: raw.parts_needed ?? prev.parts_needed,
                    special_parts_needed: raw.special_parts_needed ?? prev.special_parts_needed,
                    special_parts_status: raw.special_parts_status ?? prev.special_parts_status,
                  }
                : prev
            );
          }
        } catch {
          // ignore fallback error
        }
      }
    } else {
      router.push(`/repairs?search=${encodeURIComponent(orderCode)}`);
    }
  };

  const handleOpenCheckout = (item: any) => {
    const found = branchOrders.find(
      (o) =>
        String(o.id) === String(item.order_code) ||
        String(o.id) === String(item.id) ||
        (o as any).order_code === item.order_code ||
        (o as any).orderCode === item.order_code
    );
    const targetOrder: RepairOrder = (found || {
      id: String(item.order_code || item.id),
      name: item.customer_name || 'Khách hàng',
      phone: item.customer_phone || '',
      device: item.device_name || item.device_model || 'Thiết bị',
      issue: item.issue_description || 'Sửa chữa',
      status: item.status || 'Chờ khách nhận',
      statusType: 'ready',
      price: Number(item.total_price) || 0,
      total_price: Number(item.total_price) || 0,
      paid_amount: Number(item.collected_amount) || 0,
      tech: item.technician_name || 'Chưa phân công',
      date: new Date().toISOString(),
      branch: branch || 'Chi nhánh',
      branchId: branchId || undefined,
    }) as any;

    setCheckoutOrder(targetOrder);
    setCheckoutModalOpen(true);
  };

  const handlePrintRoutingSlip = async (order: RepairOrder) => {
    toast(`Đang gửi lệnh in tem khay K80 cho đơn ${order.id}...`, 'info');
    await printReceipt(order, 'k80', true);
  };

  const handleGrabTechOrder = async (order: RepairOrder) => {
    if (isTechSubmitting) return;
    setIsTechSubmitting(true);
    try {
      await repairService.transition(order.id, {
        transition: 'in_repair',
        status: 'Đang sửa',
        technician_id: currentUser?.id,
      });
      if (invalidateOrders) await invalidateOrders();
      toast(`Bạn đã nhận đơn ${order.id} vào bàn sửa chữa!`, 'success');
      setTechTab('my_orders');
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Không thể nhận đơn sửa chữa.';
      toast(errMsg, 'error');
    } finally {
      setIsTechSubmitting(false);
    }
  };

  const handlePauseWaitingParts = async (order: RepairOrder) => {
    try {
      await repairService.transition(order.id, { transition: 'waiting_parts', status: 'Chờ linh kiện' });
      if (invalidateOrders) await invalidateOrders();
      toast(`Đã tạm dừng đơn ${order.id} chờ linh kiện`, 'info');
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Không thể tạm dừng chờ linh kiện.';
      toast(errMsg, 'error');
    }
  };

  const handleResumeRepair = async (order: RepairOrder) => {
    try {
      await repairService.transition(order.id, { transition: 'in_repair', status: 'Đang sửa' });
      if (invalidateOrders) await invalidateOrders();
      toast(`Đã tiếp tục sửa chữa đơn ${order.id}`, 'success');
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Không thể tiếp tục sửa chữa.';
      toast(errMsg, 'error');
    }
  };

  // Statistics for Dashboard Cards
  const activeOrdersCount =
    kpiData?.operational_summary?.active_orders ?? kpiData?.active_orders ?? 0;
  const todayOrdersCount = kpiData?.intake_today ?? 0;
  const completedCount =
    kpiData?.completed_orders ?? kpiData?.summary?.completed_orders ?? 0;
  const inspectingCount = kpiData?.workload_by_status?.inspecting ?? 0;
  const waitingApprovalCount = kpiData?.workload_by_status?.waiting_approval ?? 0;
  const repairingCount = kpiData?.workload_by_status?.in_repair ?? 0;
  const readyCount = kpiData?.workload_by_status?.ready_for_return ?? 0;
  const reconciliation = kpiData?.period_reconciliation ?? kpiData?.reconciliation;

  const waitingPickupCount =
    kpiData?.operational_summary?.waiting_pickup_orders ??
    kpiData?.reconciliation?.ready_for_pickup_count ??
    0;
  const activeOrdersTotal =
    kpiData?.operational_summary?.active_orders ?? activeOrdersCount;
  const inWorkshopCount =
    kpiData?.reconciliation?.in_workshop_count ??
    Math.max(0, activeOrdersTotal - waitingPickupCount);

  const selectedMonthLabel = React.useMemo(() => {
    const parts = (selectedDate || todayStr).split('-');
    if (parts.length >= 2) {
      return `Tháng ${Number(parts[1])}/${parts[0]}`;
    }
    return `Tháng ${new Date().getMonth() + 1}/${new Date().getFullYear()}`;
  }, [selectedDate, todayStr]);

  const formatDateDisplayVi = React.useCallback((dateStr: string) => {
    const parts = (dateStr || '').split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }, []);

  const selectedDateDisplay = React.useMemo(() => {
    const effectiveFrom = fromDate || selectedDate || todayStr;
    const effectiveTo = toDate || selectedDate || todayStr;
    if (effectiveFrom !== effectiveTo) {
      return `${formatDateDisplayVi(effectiveFrom)} - ${formatDateDisplayVi(effectiveTo)}`;
    }
    return formatDateDisplayVi(effectiveFrom);
  }, [fromDate, toDate, selectedDate, todayStr, formatDateDisplayVi]);

  const kpiSummary = kpiData?.summary || kpiData;

  const monthlyOrdersBreakdown: RevenueOrderBreakdownItem[] = React.useMemo(() => {
    const raw =
      kpiData?.monthly_orders_breakdown ?? kpiSummary?.monthly_orders_breakdown;
    return Array.isArray(raw) ? raw : [];
  }, [kpiData, kpiSummary]);

  const selectedDateOrdersBreakdown: RevenueOrderBreakdownItem[] = React.useMemo(() => {
    const raw =
      kpiData?.selected_date_orders_breakdown ?? kpiSummary?.selected_date_orders_breakdown;
    return Array.isArray(raw) ? raw : [];
  }, [kpiData, kpiSummary]);

  const monthlyTotalRevenue = Number(
    kpiData?.monthly_total_revenue ??
      kpiSummary?.monthly_total_revenue ??
      kpiData?.monthly_revenue ??
      kpiSummary?.monthly_revenue ??
      0
  );
  const monthlyCollectedAmount = Number(
    kpiData?.monthly_collected_amount ?? kpiSummary?.monthly_collected_amount ?? 0
  );
  const monthlyUncollectedAmount = Number(
    kpiData?.monthly_uncollected_amount ?? kpiSummary?.monthly_uncollected_amount ?? 0
  );
  const monthlyOrdersCount = Number(
    kpiData?.monthly_finished_orders_count ??
      kpiSummary?.monthly_finished_orders_count ??
      kpiData?.monthly_completed_orders ??
      kpiSummary?.monthly_completed_orders ??
      monthlyOrdersBreakdown.length
  );
  const monthlyCompletedCount = Number(
    kpiData?.monthly_completed_orders_count ??
      kpiSummary?.monthly_completed_orders_count ??
      kpiData?.monthly_completed_orders ??
      kpiSummary?.monthly_completed_orders ??
      0
  );
  const monthlyUncollectedCount = Number(
    kpiData?.monthly_uncollected_orders_count ??
      kpiSummary?.monthly_uncollected_orders_count ??
      0
  );

  const selectedDateTotalRevenue = Number(
    kpiData?.selected_date_total_revenue ??
      kpiSummary?.selected_date_total_revenue ??
      kpiData?.selected_date_revenue ??
      kpiSummary?.selected_date_revenue ??
      0
  );
  const selectedDateCollectedAmount = Number(
    kpiData?.selected_date_collected_amount ??
      kpiSummary?.selected_date_collected_amount ??
      0
  );
  const selectedDateUncollectedAmount = Number(
    kpiData?.selected_date_uncollected_amount ??
      kpiSummary?.selected_date_uncollected_amount ??
      0
  );
  const selectedDateOrdersCount = Number(
    kpiData?.selected_date_finished_orders_count ??
      kpiSummary?.selected_date_finished_orders_count ??
      kpiData?.selected_date_completed_orders ??
      kpiSummary?.selected_date_completed_orders ??
      selectedDateOrdersBreakdown.length
  );
  const selectedDateCompletedCount = Number(
    kpiData?.selected_date_completed_orders_count ??
      kpiSummary?.selected_date_completed_orders_count ??
      kpiData?.selected_date_completed_orders ??
      kpiSummary?.selected_date_completed_orders ??
      0
  );
  const selectedDateUncollectedCount = Number(
    kpiData?.selected_date_uncollected_orders_count ??
      kpiSummary?.selected_date_uncollected_orders_count ??
      0
  );

  const activeDrilldownRawItems =
    drilldownPeriod === 'month' ? monthlyOrdersBreakdown : selectedDateOrdersBreakdown;
  const periodTotal =
    drilldownPeriod === 'month' ? monthlyTotalRevenue : selectedDateTotalRevenue;
  const periodCollected =
    drilldownPeriod === 'month' ? monthlyCollectedAmount : selectedDateCollectedAmount;
  const periodUncollected =
    drilldownPeriod === 'month' ? monthlyUncollectedAmount : selectedDateUncollectedAmount;
  const periodOrdersCount =
    drilldownPeriod === 'month' ? monthlyOrdersCount : selectedDateOrdersCount;
  const periodUncollectedCount =
    drilldownPeriod === 'month' ? monthlyUncollectedCount : selectedDateUncollectedCount;

  const periodCashAmount = activeDrilldownRawItems.reduce(
    (sum, item) => sum + Number(item.cash_amount ?? item.collected_amount ?? 0),
    0
  );
  const periodTransferAmount = activeDrilldownRawItems.reduce(
    (sum, item) => sum + Number(item.transfer_amount ?? 0),
    0
  );

  const filteredAndSortedDrilldownItems = React.useMemo(() => {
    const q = drilldownSearch.trim().toLowerCase();

    const filtered = activeDrilldownRawItems.filter((item) => {
      if (
        drilldownFilter === 'collected' &&
        !(
          (normalizeStatusCode(item.status) === 'completed' || item.status === 'Hoàn tất') &&
          Number(item.uncollected_amount || 0) <= 0
        )
      ) {
        return false;
      }
      if (
        drilldownFilter === 'uncollected' &&
        !(
          (normalizeStatusCode(item.status) !== 'completed' && item.status !== 'Hoàn tất') ||
          Number(item.uncollected_amount || 0) > 0
        )
      ) {
        return false;
      }
      if (q) {
        const matchName = (item.customer_name || '').toLowerCase().includes(q);
        const matchPhone = (item.customer_phone || '').toLowerCase().includes(q);
        const matchCode = String(item.order_code || item.id || '').toLowerCase().includes(q);
        const matchDevice = (item.device_name || '').toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchCode && !matchDevice) {
          return false;
        }
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (drilldownSortKey === 'customer') {
        cmp = (a.customer_name || '').localeCompare(b.customer_name || '', 'vi');
      } else if (drilldownSortKey === 'order') {
        cmp = String(a.order_code || a.id || '').localeCompare(
          String(b.order_code || b.id || ''),
          'vi'
        );
      } else if (drilldownSortKey === 'total') {
        cmp = Number(a.total_price || 0) - Number(b.total_price || 0);
      } else if (drilldownSortKey === 'collected') {
        cmp = Number(a.collected_amount || 0) - Number(b.collected_amount || 0);
      } else if (drilldownSortKey === 'uncollected') {
        cmp = Number(a.uncollected_amount || 0) - Number(b.uncollected_amount || 0);
      }
      return drilldownSortDir === 'asc' ? cmp : -cmp;
    });
  }, [activeDrilldownRawItems, drilldownFilter, drilldownSearch, drilldownSortKey, drilldownSortDir]);

  const handleExportRevenueExcel = React.useCallback(
    (exportScope: 'day' | 'month' | 'modal' = 'day') => {
      const isMonthScope =
        exportScope === 'month' || (exportScope === 'modal' && drilldownPeriod === 'month');
      const itemsToExport =
        exportScope === 'modal'
          ? filteredAndSortedDrilldownItems
          : isMonthScope
          ? monthlyOrdersBreakdown
          : selectedDateOrdersBreakdown;
      const periodLabel = isMonthScope ? selectedMonthLabel : selectedDateDisplay;

      const exported = downloadRevenueExcelReport({
        items: itemsToExport,
        periodLabel,
        fromDate: isMonthScope ? monthStartStr : fromDate,
        toDate: isMonthScope ? todayStr : toDate,
        branchName: branch || currentUser?.branch,
      });

      toast(
        `Đã xuất file Excel (${exported.rowCount} đơn · Tổng tiền: ${formatVND(exported.totalAmount)})`,
        'success'
      );
    },
    [
      drilldownPeriod,
      filteredAndSortedDrilldownItems,
      monthlyOrdersBreakdown,
      selectedDateOrdersBreakdown,
      selectedMonthLabel,
      selectedDateDisplay,
      monthStartStr,
      todayStr,
      fromDate,
      toDate,
      branch,
      currentUser?.branch,
      toast,
    ]
  );

  // Drilldown route shortcuts: router.push('/repairs?status=waiting_pickup'), router.push('/repairs?status=waiting_parts'), router.push('/repairs?filter=overdue')

  return (
    <AppShell crumbName={role === 'admin' ? 'Tổng quan' : role === 'cskh' ? 'Bàn CSKH' : 'Kỹ thuật'}>
      {role === 'cskh' ? (
        <CskhDashboardView
          currentUser={currentUser}
          todayOrdersCount={todayOrdersCount}
          branchOrdersCount={branchOrders.length}
          cskhReadyOrders={cskhReadyOrders}
          repairingCount={repairingCount}
          cskhPendingOrders={cskhPendingOrders}
          cskhPendingModalOpen={cskhPendingModalOpen}
          setCskhPendingModalOpen={setCskhPendingModalOpen}
          onOpenWarrantyIntake={() => {
            setInitialIntakeType('warranty');
            setIntakeModalOpen(true);
          }}
          onOpenRegularIntake={() => {
            setInitialIntakeType('in_store');
            setIntakeModalOpen(true);
          }}
          onOpenCheckout={(o) => {
            setCheckoutOrder(o);
            setCheckoutModalOpen(true);
          }}
          onNavigateToRepairs={() => router.push('/repairs')}
          moneyFormatted={moneyFormatted}
        />
      ) : role === 'tech' || (role as string) === 'technician' ? (
        <TechDashboardView
          branchId={branchId}
          branch={branch}
          currentUser={currentUser}
          techTab={techTab}
          setTechTab={setTechTab}
          techActiveOrders={techActiveOrders}
          techAvailableOrders={techAvailableOrders}
          techCompletedOrders={techCompletedOrders}
          isSilentPrinting={isSilentPrinting}
          isTechSubmitting={isTechSubmitting}
          onNavigateToTech={() => router.push('/tech')}
          onPrintRoutingSlip={handlePrintRoutingSlip}
          onResumeRepair={handleResumeRepair}
          onPauseWaitingParts={handlePauseWaitingParts}
          onOpenTechModal={(order) => {
            setSelectedTechOrder(order);
            setTechModalOpen(true);
          }}
          onGrabTechOrder={handleGrabTechOrder}
        />
      ) : (
        <AdminDashboardView
          role={role}
          currentUser={currentUser}
          branch={branch}
          branchId={branchId}
          selectedDate={selectedDate}
          setSelectedDate={handleSingleDateChange}
          fromDate={fromDate}
          toDate={toDate}
          onDateRangeChange={handleDateRangeChange}
          todayStr={todayStr}
          yesterdayStr={yesterdayStr}
          sevenDaysAgoStr={sevenDaysAgoStr}
          monthStartStr={monthStartStr}
          activePreset={activePreset}
          setActivePreset={setActivePreset}
          period={period}
          setPeriod={setPeriod}
          isKpiLoading={isKpiLoading}
          kpiData={kpiData}
          monthlyTotalRevenue={monthlyTotalRevenue}
          monthlyCollectedAmount={monthlyCollectedAmount}
          monthlyCompletedCount={monthlyCompletedCount}
          monthlyUncollectedAmount={monthlyUncollectedAmount}
          monthlyUncollectedCount={monthlyUncollectedCount}
          selectedMonthLabel={selectedMonthLabel}
          selectedDateTotalRevenue={selectedDateTotalRevenue}
          selectedDateCollectedAmount={selectedDateCollectedAmount}
          selectedDateCompletedCount={selectedDateCompletedCount}
          selectedDateUncollectedAmount={selectedDateUncollectedAmount}
          selectedDateUncollectedCount={selectedDateUncollectedCount}
          selectedDateDisplay={selectedDateDisplay}
          activeOrdersCount={activeOrdersCount}
          todayOrdersCount={todayOrdersCount}
          repairingCount={repairingCount}
          readyCount={readyCount}
          inspectingCount={inspectingCount}
          waitingApprovalCount={waitingApprovalCount}
          activeOrdersTotal={activeOrdersTotal}
          inWorkshopCount={inWorkshopCount}
          waitingPickupCount={waitingPickupCount}
          completedCount={completedCount}
          reconciliation={reconciliation}
          branchOrders={branchOrders}
          unfinishedTechOrders={unfinishedTechOrders}
          onExportReport={() => handleExportRevenueExcel('day')}
          onOpenWarrantyIntake={() => {
            setInitialIntakeType('warranty');
            setIntakeModalOpen(true);
          }}
          onOpenRegularIntake={() => {
            setInitialIntakeType('in_store');
            setIntakeModalOpen(true);
          }}
          onOpenDrilldownModal={handleOpenDrilldownModal}
          onOpenOrderDetail={handleOpenOrderDetail}
          onOpenCheckout={handleOpenCheckout}
          onNavigate={(path) => router.push(path)}
          formatVND={formatVND}
          moneyFormatted={moneyFormatted}
          formatWorkshopDuration={formatWorkshopDuration}
        />
      )}

      {/* Intake Wizard Modal */}
      <IntakeWizardModal
        isOpen={intakeModalOpen}
        initialIntakeType={initialIntakeType}
        defaultOrderType={initialIntakeType}
        onClose={() => setIntakeModalOpen(false)}
        onSuccess={() => setIntakeModalOpen(false)}
      />

      {/* Technician Order Detail & Inspection Modal */}
      <TechOrderDetailModal
        isOpen={techModalOpen}
        onClose={() => {
          setTechModalOpen(false);
          setSelectedTechOrder(null);
        }}
        order={selectedTechOrder}
        currentUser={currentUser}
        invalidateOrders={invalidateOrders}
        updateOrder={updateOrder}
        onCompleteSuccess={(updated) => {
          if (updateOrder) updateOrder(updated);
          setTechTab('completed');
        }}
        onGrabSuccess={(claimed) => {
          if (updateOrder) updateOrder(claimed);
          setTechTab('my_orders');
        }}
      />

      {/* Checkout Handover Modal */}
      {checkoutOrder && (
        <CheckoutHandoverModal
          isOpen={checkoutModalOpen}
          order={checkoutOrder}
          onClose={() => {
            setCheckoutModalOpen(false);
            setCheckoutOrder(null);
          }}
          onSuccess={(updatedOrder) => {
            if (updateOrder) updateOrder(updatedOrder);
            if (invalidateOrders) invalidateOrders();
            refreshShift().catch(() => {});
            setCheckoutModalOpen(false);
            setCheckoutOrder(null);
            toast('Đã thanh toán và bàn giao thiết bị thành công!');
          }}
        />
      )}

      {/* Customer Revenue & Debt Drill-Down Modal */}
      <RevenueDrilldownModal
        isOpen={drilldownModalOpen}
        onClose={() => setDrilldownModalOpen(false)}
        drilldownPeriod={drilldownPeriod}
        setDrilldownPeriod={setDrilldownPeriod}
        selectedMonthLabel={selectedMonthLabel}
        selectedDateDisplay={selectedDateDisplay}
        fromDate={fromDate}
        toDate={toDate}
        onDateRangeChange={handleDateRangeChange}
        onExportExcel={() => handleExportRevenueExcel('modal')}
        isKpiLoading={isKpiLoading}
        periodTotal={periodTotal}
        periodCollected={periodCollected}
        periodUncollected={periodUncollected}
        periodOrdersCount={periodOrdersCount}
        periodUncollectedCount={periodUncollectedCount}
        periodCashAmount={periodCashAmount}
        periodTransferAmount={periodTransferAmount}
        drilldownFilter={drilldownFilter}
        setDrilldownFilter={setDrilldownFilter}
        drilldownSearch={drilldownSearch}
        setDrilldownSearch={setDrilldownSearch}
        drilldownSortKey={drilldownSortKey}
        drilldownSortDir={drilldownSortDir}
        onDrilldownSort={handleDrilldownSort}
        activeDrilldownRawItems={activeDrilldownRawItems}
        filteredAndSortedDrilldownItems={filteredAndSortedDrilldownItems}
        onOpenOrderDetail={handleOpenOrderDetail}
        onOpenCheckout={handleOpenCheckout}
        onNavigateToCustomer={(query) =>
          router.push(`/customers?q=${encodeURIComponent(query)}`)
        }
        formatVND={formatVND}
      />
    </AppShell>
  );
}
