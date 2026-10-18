'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  StatCard,
  StatusTag,
  Icon,
  Modal,
  useToast,
  EmptyState,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { IntakeWizardModal } from '../components/IntakeWizardModal';
import { TechOrderDetailModal } from '../components/TechOrderDetailModal';
import { CheckoutHandoverModal } from '../components/CheckoutHandoverModal';
import { ActionableTasksCenter } from './components/ActionableTasksCenter';
import { StaffPerformanceWidget } from './components/StaffPerformanceWidget';
import { usePodsCare } from '../providers';
import { useShift } from '../providers/ShiftProvider';
import type { RepairOrder } from '@podscare/types';
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
  const todayStr = React.useMemo(() => formatDateInGmt7(new Date()), []);

  const yesterdayStr = React.useMemo(() => {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return formatDateInGmt7(d);
  }, []);

  const [activePreset, setActivePreset] = useState<
    'today' | 'yesterday' | '7_days' | 'this_month' | 'custom'
  >('today');

  const [selectedDate, setSelectedDate] = useState<string>(() => formatDateInGmt7(new Date()));

  // Technician Workspace State
  const [techTab, setTechTab] = useState<'my_orders' | 'available' | 'completed'>('my_orders');
  const [selectedTechOrder, setSelectedTechOrder] = useState<RepairOrder | null>(null);
  const [techModalOpen, setTechModalOpen] = useState(false);
  const [isTechSubmitting, setIsTechSubmitting] = useState(false);
  const { printReceipt, isPrinting: isSilentPrinting } = useSilentPrint();

  // Checkout Handover Modal State for Admin Action Center & CSKH Dashboard
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<RepairOrder | null>(null);

  // Đấu nối KPI Dashboard API (Single Source of Truth)
  const {
    data: kpiData,
    isLoading: isLoadingKpi,
    isFetching: isFetchingKpi,
  } = useQuery({
    queryKey: ['kpi-dashboard', branchId, activePreset, selectedDate],
    queryFn: async () => {
      const res = await kpiService.getDashboardKpi({
        branch_id: branchId && branchId !== 'all' ? branchId : undefined,
        period: activePreset,
        date: selectedDate,
      });
      return res?.data || res;
    },
  });

  const isKpiLoading = isLoadingKpi || isFetchingKpi;

  const moneyFormatted = (n: number) =>
    n ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫' : '—';

  const formatVND = (n?: number | string | null) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return '0 ₫';
    return new Intl.NumberFormat('vi-VN').format(Math.round(num)) + ' ₫';
  };

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

  const getCskhNextAction = (o: RepairOrder) => {
    switch (o.status) {
      case 'Cần sửa lại':
        return 'Theo dõi kỹ thuật sửa lại';
      case 'Sẵn sàng trả':
      case 'Chờ khách nhận':
        return 'Thu tiền & Bàn giao máy cho khách';
      case 'Chờ QC':
        return 'Theo dõi kết quả kiểm định QC';
      case 'Chờ kỹ thuật':
        return 'Theo dõi nhận đơn kỹ thuật';
      case 'Đang sửa':
        return 'Cập nhật tiến độ cho khách';
      default:
        return 'Mở phiếu để xử lý';
    }
  };

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

  // Thao tác cho Admin Action Center & Bảng chi tiết
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

      // Nếu thiếu checks hoặc photos từ danh sách rút gọn, nạp bổ sung chi tiết từ API
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

  // Thao tác nhanh cho Kỹ thuật viên
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
    } catch {
      const updated: RepairOrder = {
        ...order,
        tech: currentUser?.name || 'Kỹ thuật viên',
        technicianId: currentUser?.id ? Number(currentUser.id) : undefined,
        technician_id: currentUser?.id ? Number(currentUser.id) : undefined,
        status: 'Đang sửa',
        statusType: 'progress',
      };
      updateOrder(updated);
      toast(`Bạn đã nhận đơn ${order.id} vào bàn sửa chữa!`, 'success');
      setTechTab('my_orders');
    } finally {
      setIsTechSubmitting(false);
    }
  };

  const handlePauseWaitingParts = async (order: RepairOrder) => {
    try {
      await repairService.transition(order.id, { transition: 'waiting_parts', status: 'Chờ linh kiện' });
      if (invalidateOrders) await invalidateOrders();
      toast(`Đã tạm dừng đơn ${order.id} chờ linh kiện`, 'info');
    } catch {
      updateOrder({ ...order, status: 'Chờ linh kiện', statusType: 'wait' });
      toast(`Đã tạm dừng đơn ${order.id} chờ linh kiện`, 'info');
    }
  };

  const handleResumeRepair = async (order: RepairOrder) => {
    try {
      await repairService.transition(order.id, { transition: 'in_repair', status: 'Đang sửa' });
      if (invalidateOrders) await invalidateOrders();
      toast(`Đã tiếp tục sửa chữa đơn ${order.id}`, 'success');
    } catch {
      updateOrder({ ...order, status: 'Đang sửa', statusType: 'progress' });
      toast(`Đã tiếp tục sửa chữa đơn ${order.id}`, 'success');
    }
  };

  // Statistics for Dashboard Cards (Single Source of Truth từ GET /api/v1/kpi/dashboard)
  const kpiSummary = kpiData?.summary || kpiData;
  const periodMetrics = kpiData?.period_metrics ?? kpiSummary?.period_metrics;
  const storeLiveFinancials =
    kpiData?.store_live_financials ?? kpiSummary?.store_live_financials;
  const workshopPipeline =
    kpiData?.workshop_pipeline ?? kpiSummary?.workshop_pipeline;

  const todayOrdersCount = kpiData?.intake_today ?? 0;

  const inspectingCount =
    workshopPipeline?.inspecting ?? kpiData?.workload_by_status?.inspecting ?? 0;
  const waitingApprovalCount =
    workshopPipeline?.waiting_approval ??
    kpiData?.workload_by_status?.waiting_approval ??
    0;
  const repairingCount =
    workshopPipeline?.in_repair ?? kpiData?.workload_by_status?.in_repair ?? 0;
  const waitingPartsPipelineCount =
    workshopPipeline?.waiting_parts ??
    kpiData?.operational_summary?.waiting_parts_orders ??
    0;
  const waitingQcPipelineCount =
    workshopPipeline?.waiting_qc ??
    kpiData?.operational_summary?.waiting_qc_count ??
    0;
  const readyCount =
    workshopPipeline?.waiting_pickup ??
    workshopPipeline?.ready_for_return ??
    kpiData?.workload_by_status?.ready_for_return ??
    0;

  // Zone 1 Period Metrics values
  const handoverRevenue = periodMetrics?.handover_revenue;
  const profitAndCogs = periodMetrics?.profit_and_cogs;
  const orderFlow = periodMetrics?.order_flow;

  const zone1CollectedRevenue = Number(
    handoverRevenue?.collected_amount ??
      kpiData?.selected_date_collected_amount ??
      kpiSummary?.selected_date_collected_amount ??
      0
  );
  const zone1CashAmount = Number(handoverRevenue?.cash_amount ?? 0);
  const zone1TransferAmount = Number(handoverRevenue?.transfer_amount ?? 0);
  const zone1CompletedOrdersCount = Number(
    handoverRevenue?.completed_orders_count ??
      periodMetrics?.completed_count ??
      kpiData?.selected_date_completed_orders ??
      0
  );

  const zone1GrossProfit = Number(
    profitAndCogs?.gross_profit ??
      kpiData?.selected_date_gross_profit ??
      kpiSummary?.selected_date_gross_profit ??
      0
  );
  const zone1CogsAmount = Number(
    profitAndCogs?.cogs_amount ??
      profitAndCogs?.cogs ??
      kpiData?.selected_date_cogs ??
      0
  );
  const zone1GrossMargin = Number(
    profitAndCogs?.gross_profit_margin ??
      kpiData?.selected_date_gross_profit_margin ??
      kpiData?.gross_profit_margin ??
      0
  );
  const zone1AccountsPayable = Number(
    profitAndCogs?.accounts_payable ??
      kpiData?.accounts_payable ??
      kpiSummary?.accounts_payable ??
      0
  );

  const zone1IntakeCount = Number(
    orderFlow?.intake_count ??
      periodMetrics?.intake_count ??
      kpiData?.intake_today ??
      0
  );
  const zone1CompletedFlowCount = Number(
    orderFlow?.completed_count ??
      periodMetrics?.completed_count ??
      zone1CompletedOrdersCount
  );
  const zone1WarrantyCount = Number(
    orderFlow?.warranty_count ??
      periodMetrics?.warranty_count ??
      kpiData?.warranty_count ??
      0
  );

  const monthlySummary = periodMetrics?.monthly_revenue_summary;
  const monthlyCollectedRevenue = Number(
    monthlySummary?.collected_amount ??
      kpiData?.monthly_collected_amount ??
      kpiSummary?.monthly_collected_amount ??
      kpiData?.monthly_revenue ??
      kpiSummary?.monthly_revenue ??
      0
  );
  const monthlyCashAmount = Number(
    monthlySummary?.cash_amount ?? (kpiData as any)?.monthly_cash_amount ?? 0
  );
  const monthlyTransferAmount = Number(
    monthlySummary?.transfer_amount ?? (kpiData as any)?.monthly_transfer_amount ?? 0
  );
  const monthlyCompletedCount = Number(
    monthlySummary?.completed_orders_count ??
      kpiData?.monthly_completed_orders_count ??
      kpiSummary?.monthly_completed_orders_count ??
      kpiData?.monthly_completed_orders ??
      kpiSummary?.monthly_completed_orders ??
      0
  );

  // Zone 2 All-time Live Snapshot values
  const liveWaitingPickupCount = Number(
    storeLiveFinancials?.waiting_pickup_count ??
      storeLiveFinancials?.ready_for_pickup?.count ??
      kpiData?.reconciliation?.ready_for_pickup_count ??
      0
  );
  const liveWaitingPickupTotalAmount = Number(
    storeLiveFinancials?.waiting_pickup_total_amount ??
      storeLiveFinancials?.ready_for_pickup?.total_amount ??
      0
  );
  const liveWaitingPickupDepositAmount = Number(
    storeLiveFinancials?.waiting_pickup_deposit_amount ??
      storeLiveFinancials?.ready_for_pickup?.deposit_amount ??
      0
  );
  const liveWaitingPickupUncollectedAmount = Number(
    storeLiveFinancials?.waiting_pickup_uncollected_amount ??
      storeLiveFinancials?.ready_for_pickup?.uncollected_amount ??
      kpiData?.reconciliation?.ready_for_pickup_amount ??
      0
  );

  const liveInWorkshopCount = Number(
    storeLiveFinancials?.in_workshop_count ??
      storeLiveFinancials?.in_workshop?.count ??
      workshopPipeline?.in_workshop_count ??
      kpiData?.reconciliation?.in_workshop_count ??
      0
  );
  const liveInWorkshopExpectedAmount = Number(
    storeLiveFinancials?.in_workshop_expected_amount ??
      storeLiveFinancials?.in_workshop?.expected_amount ??
      kpiData?.reconciliation?.in_workshop_amount ??
      0
  );

  const liveOpenOrdersCount = Number(
    storeLiveFinancials?.open_orders_count ??
      workshopPipeline?.open_orders_count ??
      liveInWorkshopCount + liveWaitingPickupCount
  );

  const liveOverdueCount = Number(
    workshopPipeline?.overdue_count ??
      workshopPipeline?.overdue_orders ??
      kpiData?.operational_summary?.overdue_orders ??
      0
  );

  const selectedDateDisplay = React.useMemo(() => {
    const parts = (selectedDate || todayStr).split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return selectedDate || todayStr;
  }, [selectedDate, todayStr]);

  const periodQueryString = React.useMemo(() => {
    if (activePreset === 'custom') {
      return `date_filter=custom&date=${encodeURIComponent(selectedDate)}`;
    }
    return `date_filter=${encodeURIComponent(activePreset)}`;
  }, [activePreset, selectedDate]);

  // Thuật toán sinh đồ thị doanh thu SVG động (Dynamic SVG Path Generator)
  const renderRevenueChart = () => {
    if (isKpiLoading) {
      return (
        <div
          data-testid="kpi-card-loading-skeleton"
          className="h-[220px] w-full p-4 flex flex-col justify-between rounded-[10px] bg-[#fafcfa]"
        >
          <div className="space-y-4">
            <div className="h-3 w-full rounded bg-[#edf4f0] animate-pulse" />
            <div className="h-3 w-11/12 rounded bg-[#edf4f0] animate-pulse" />
            <div className="h-24 w-full rounded-[8px] bg-[#e5ece8] animate-pulse" />
          </div>
          <div className="flex justify-between pt-2">
            <span className="h-3 w-10 rounded bg-[#e5ece8] animate-pulse" />
            <span className="h-3 w-10 rounded bg-[#e5ece8] animate-pulse" />
            <span className="h-3 w-10 rounded bg-[#e5ece8] animate-pulse" />
            <span className="h-3 w-10 rounded bg-[#e5ece8] animate-pulse" />
          </div>
        </div>
      );
    }

    const rawChart: Array<{ date?: string; label?: string; revenue?: number; completed_orders?: number }> =
      Array.isArray(periodMetrics?.revenue_chart) && periodMetrics.revenue_chart.length > 0
        ? (periodMetrics.revenue_chart as any[])
        : Array.isArray(kpiData?.revenue_chart)
        ? (kpiData.revenue_chart as any[])
        : [];

    if (rawChart.length === 0) {
      return (
        <div className="h-[220px] w-full flex items-center justify-center p-4">
          <EmptyState
            title="Chưa có dữ liệu doanh thu"
            description="Chưa có dữ liệu doanh thu phát sinh trong khoảng thời gian này."
            icon="payments"
          />
        </div>
      );
    }

    const maxRevRaw = Math.max(...rawChart.map((d) => Number(d.revenue) || 0), 10000000);
    const maxRev = Math.ceil(maxRevRaw / 10000000) * 10000000 || 10000000;
    const maxOrders = Math.max(...rawChart.map((d) => Number(d.completed_orders) || 0), 5);

    const points = rawChart.map((item, index) => {
      const x = 42 + (index / Math.max(rawChart.length - 1, 1)) * 568;
      const yRev = 158 - ((Number(item.revenue) || 0) / maxRev) * 138;
      const yOrd = 158 - ((Number(item.completed_orders) || 0) / maxOrders) * 110;
      return {
        x,
        yRev: Math.max(20, Math.min(158, yRev)),
        yOrd: Math.max(30, Math.min(158, yOrd)),
        label: item.label || `T${index + 1}`,
        revenue: item.revenue || 0,
        orders: item.completed_orders || 0,
      };
    });

    const pathArea =
      `M ${points[0].x} ${points[0].yRev} ` +
      points.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.yRev.toFixed(1)}`).join(' ') +
      ` L ${points[points.length - 1].x} 158 L ${points[0].x} 158 Z`;

    const pathLine =
      `M ${points[0].x} ${points[0].yRev} ` +
      points.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.yRev.toFixed(1)}`).join(' ');

    const pathOrders =
      `M ${points[0].x} ${points[0].yOrd} ` +
      points.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.yOrd.toFixed(1)}`).join(' ');

    const stepLabel = points.length > 20 ? 4 : points.length > 10 ? 2 : 1;
    const displayedLabels = points.filter((_, idx) => idx % stepLabel === 0 || idx === points.length - 1);

    const formatMil = (v: number) => (v >= 1000000 ? `${Math.round(v / 1000000)}tr` : '0');

    return (
      <div className="h-[220px] w-full p-2">
        <svg viewBox="0 0 620 190" preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4b9b77" stopOpacity="0.22" />
              <stop offset="1" stopColor="#4b9b77" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1="42" y1="20" x2="610" y2="20" stroke="#edf1ee" strokeDasharray="3 5" />
          <line x1="42" y1="62" x2="610" y2="62" stroke="#edf1ee" strokeDasharray="3 5" />
          <line x1="42" y1="104" x2="610" y2="104" stroke="#edf1ee" strokeDasharray="3 5" />
          <line x1="42" y1="146" x2="610" y2="146" stroke="#edf1ee" strokeDasharray="3 5" />

          {/* Y Axis Labels */}
          <text x="3" y="23" className="text-xs fill-[#97a39c]">{formatMil(maxRev)}</text>
          <text x="3" y="65" className="text-xs fill-[#97a39c]">{formatMil(maxRev * 0.75)}</text>
          <text x="3" y="107" className="text-xs fill-[#97a39c]">{formatMil(maxRev * 0.5)}</text>
          <text x="3" y="149" className="text-xs fill-[#97a39c]">{formatMil(maxRev * 0.25)}</text>
          <text x="18" y="174" className="text-xs fill-[#97a39c]">0</text>

          {/* Dynamic Fill Area */}
          <path d={pathArea} fill="url(#chartFill)" />

          {/* Dynamic Stroke Line: Revenue */}
          <path
            d={pathLine}
            fill="none"
            stroke="#176b58"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dynamic Dashed Stroke Line: Completed Orders */}
          <path
            d={pathOrders}
            fill="none"
            stroke="#bdc9c2"
            strokeWidth="2"
            strokeDasharray="4 4"
          />

          {/* Dynamic X Axis Labels */}
          {displayedLabels.map((p, i) => (
            <text
              key={i}
              x={Math.max(36, Math.min(594, p.x - 8))}
              y="178"
              className="text-xs fill-[#97a39c]"
            >
              {p.label}
            </text>
          ))}
        </svg>
      </div>
    );
  };

  /* ========================================================================= */
  /* ADMIN COMMAND CENTER VIEW (3-ZONE ARCHITECTURE — PHƯƠNG ÁN A + CÁCH 1)    */
  /* ========================================================================= */
  const renderAdminDashboard = () => {
    const pipelineSteps = [
      {
        key: 'inspecting',
        label: '1. Chờ KT / Đang khám',
        count: inspectingCount,
        icon: 'search',
        barColor: 'bg-[#4d9877]',
        badgeBg: 'bg-[#edf5f0] text-[#478065]',
        href: '/repairs?date_filter=all&status=in_workshop&workshop_step=inspecting',
      },
      {
        key: 'waiting_approval',
        label: '2. Chờ khách duyệt giá',
        count: waitingApprovalCount,
        icon: 'quotes',
        barColor: 'bg-[#d2a25d]',
        badgeBg: 'bg-[#fbf3e5] text-[#915e1b]',
        href: '/repairs?date_filter=all&status=in_workshop&workshop_step=waiting_approval',
      },
      {
        key: 'in_repair',
        label: '3. Đang sửa chữa',
        count: repairingCount,
        icon: 'wrench',
        barColor: 'bg-[#356d8a]',
        badgeBg: 'bg-[#edf4f7] text-[#356d8a]',
        href: '/repairs?date_filter=all&status=in_workshop&workshop_step=in_repair',
      },
      {
        key: 'waiting_parts',
        label: '4. Chờ linh kiện',
        count: waitingPartsPipelineCount,
        icon: 'inventory',
        barColor: 'bg-[#b77a21]',
        badgeBg: 'bg-[#fcfaf5] text-[#915e1b]',
        href: '/repairs?date_filter=all&status=in_workshop&workshop_step=waiting_parts',
      },
      {
        key: 'waiting_qc',
        label: '5. Chờ kiểm định QC',
        count: waitingQcPipelineCount,
        icon: 'qc',
        barColor: 'bg-[#28805e]',
        badgeBg: 'bg-[#eaf4ef] text-[#176b58]',
        href: '/repairs?date_filter=all&status=in_workshop&workshop_step=waiting_qc',
      },
      {
        key: 'waiting_pickup',
        label: '6. Sẵn sàng trả khách',
        count: liveWaitingPickupCount || readyCount,
        icon: 'truck',
        barColor: 'bg-[#176b58]',
        badgeBg: 'bg-[#eaf5ef] text-[#176b58]',
        href: '/repairs?date_filter=all&status=waiting_pickup',
      },
    ];

    return (
      <div className="space-y-6">
        {/* Heading */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#819089] uppercase tracking-[1.05px] mb-1">
              FIXO · TRUNG TÂM ĐIỀU HÀNH (COMMAND CENTER)
            </div>
            <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#1c302b] m-0">
              Chào buổi sáng, {currentUser?.name || 'Quản trị viên'}
            </h1>
            <p className="text-sm text-[#7e8d85] mt-1 mb-0">
              Trung tâm kiểm soát tài chính theo kỳ &amp; điều phối xưởng thời gian thực tại{' '}
              <b className="text-[#1c302b]">{branch || currentUser?.branch || 'Tất cả chi nhánh'}</b>.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="md"
              icon="download"
              onClick={() => toast('Đang chuẩn bị xuất báo cáo Excel...')}
            >
              Xuất báo cáo
            </Button>
            <Button
              variant="outline"
              size="md"
              icon="shield"
              data-testid="admin-warranty-intake-btn"
              onClick={() => {
                setInitialIntakeType('warranty');
                setIntakeModalOpen(true);
              }}
              className="bg-[#eaf5ef] text-[#176b58] border-[#a9c9b9] hover:bg-[#d8ede1] font-bold"
            >
              Tiếp nhận bảo hành
            </Button>
            <Button
              variant="primary"
              size="md"
              icon="plus"
              onClick={() => {
                setInitialIntakeType('in_store');
                setIntakeModalOpen(true);
              }}
            >
              Tạo đơn mới
            </Button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* ZONE 1: HIỆU QUẢ KINH DOANH & TÀI CHÍNH THEO KỲ (PERIOD METRICS)     */}
        {/* =================================================================== */}
        <section data-testid="admin-zone1-period-metrics" className="space-y-4">
          {/* Thanh điều khiển Kỳ tra cứu Zone 1 */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-[12px] border border-[#e5ece8] p-3.5 sm:px-5 sm:py-3.5 shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold text-[#1c302b] uppercase tracking-[0.8px] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#176b58]" />
                <span>KỲ BÁO CÁO:</span>
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { key: 'today', label: 'Hôm nay' },
                    { key: 'yesterday', label: 'Hôm qua' },
                    { key: '7_days', label: '7 ngày qua' },
                    { key: 'this_month', label: 'Tháng này' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    data-testid={`zone1-period-${preset.key}`}
                    onClick={() => {
                      setActivePreset(preset.key);
                      if (preset.key === 'today') setSelectedDate(todayStr);
                      if (preset.key === 'yesterday') setSelectedDate(yesterdayStr);
                    }}
                    className={`text-xs px-3 py-1.5 rounded-[8px] transition-all cursor-pointer ${
                      activePreset === preset.key
                        ? 'bg-[#176b58] text-white font-bold shadow-xs'
                        : 'bg-white text-[#596962] border border-[#d8e2dc] hover:bg-[#f0f4f2]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}

                <input
                  type="date"
                  data-testid="zone1-date-picker"
                  value={selectedDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    setSelectedDate(val);
                    if (val === todayStr) {
                      setActivePreset('today');
                    } else if (val === yesterdayStr) {
                      setActivePreset('yesterday');
                    } else {
                      setActivePreset('custom');
                    }
                  }}
                  className="text-xs border border-[#d8e2dc] bg-[#fafbfa] text-[#2d3d35] rounded-[8px] px-3 py-1.5 outline-none focus:border-[#176b58] focus:bg-white transition-all cursor-pointer font-medium"
                />
              </div>
            </div>

            <div className="text-xs text-[#687871] flex items-center gap-2">
              <span>
                Kỳ đang chọn:{' '}
                <b className="text-[#176b58] font-semibold">
                  {periodMetrics?.period_label || selectedDateDisplay}
                </b>
              </span>
              {!isKpiLoading && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#edf5f0] text-[#176b58] font-bold text-[11px] border border-[#d0e5d9]">
                  {zone1CompletedOrdersCount} đơn đã bàn giao
                </span>
              )}
            </div>
          </div>

          {/* 4 Thẻ Tài chính & Vận hành chủ lực trong Kỳ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* CARD 1: DOANH THU BÀN GIAO */}
            <div
              data-testid="zone1-card-handover-revenue"
              onClick={() =>
                router.push(
                  `/repairs?status=completed&date_type=completed_at&${periodQueryString}`
                )
              }
              className="bg-white border border-[#c5e1d4] rounded-[14px] p-4 sm:p-5 shadow-xs hover:border-[#176b58] transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#406856]">
                    DOANH THU BÀN GIAO
                  </span>
                  <span className="w-7 h-7 rounded-[7px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none">
                    <Icon name="payments" size={15} />
                  </span>
                </div>

                {isKpiLoading ? (
                  <div data-testid="kpi-card-loading-skeleton" className="space-y-2 py-1">
                    <div className="h-7 w-36 rounded bg-[#e5ece8] animate-pulse" />
                    <div className="h-3.5 w-44 rounded bg-[#edf4f0] animate-pulse" />
                  </div>
                ) : (
                  <>
                    <div className="font-heading font-extrabold text-2xl text-[#176b58] tracking-tight">
                      {formatVND(zone1CollectedRevenue)}
                    </div>
                    <div className="text-xs text-[#5d6f67] mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>
                        TM: <b className="text-[#1c302b]">{formatVND(zone1CashAmount)}</b>
                      </span>
                      <span className="text-[#c5d1cb]">|</span>
                      <span>
                        CK: <b className="text-[#2a6280]">{formatVND(zone1TransferAmount)}</b>
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="pt-2.5 mt-3 border-t border-[#edf2ee] flex items-center justify-between gap-2 text-xs">
                <span className="text-[#287452] font-semibold">
                  {zone1CompletedOrdersCount} đơn đã giao
                </span>
                <span className="inline-flex items-center gap-1 font-bold text-[#176b58]">
                  <span>Xem</span>
                  <Icon name="arrow" size={12} />
                </span>
              </div>
            </div>

            {/* CARD 2: LỢI NHUẬN GỘP */}
            <div
              data-testid="zone1-card-gross-profit"
              className="bg-white border border-[#e5ece8] rounded-[14px] p-4 sm:p-5 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#6d7f77]">
                    LỢI NHUẬN GỘP
                  </span>
                  <span className="w-7 h-7 rounded-[7px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none">
                    <Icon name="trending_up" size={15} />
                  </span>
                </div>

                {isKpiLoading ? (
                  <div data-testid="kpi-card-loading-skeleton" className="space-y-2 py-1">
                    <div className="h-7 w-36 rounded bg-[#e5ece8] animate-pulse" />
                    <div className="h-3.5 w-44 rounded bg-[#edf4f0] animate-pulse" />
                  </div>
                ) : (
                  <>
                    <div className="font-heading font-extrabold text-2xl text-[#1c302b] tracking-tight">
                      {formatVND(zone1GrossProfit)}
                    </div>
                    <div className="text-xs text-[#5d6f67] mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>
                        Giá vốn LK: <b className="text-[#1c302b]">{formatVND(zone1CogsAmount)}</b>
                      </span>
                      <span className="text-[#c5d1cb]">·</span>
                      <span>
                        Biên lãi: <b className="text-[#176b58]">{zone1GrossMargin}%</b>
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="pt-2.5 mt-3 border-t border-[#edf2ee] flex items-center justify-between gap-2 text-xs text-[#65766e]">
                <span>
                  Công nợ NCC: <b className="text-[#915e1b]">{formatVND(zone1AccountsPayable)}</b>
                </span>
                <button
                  type="button"
                  onClick={() => router.push('/suppliers')}
                  className="inline-flex items-center gap-1 font-bold text-[#176b58] hover:text-[#115042] cursor-pointer"
                >
                  <span>NCC</span>
                  <Icon name="arrow" size={12} />
                </button>
              </div>
            </div>

            {/* CARD 3: LƯU LƯỢNG ĐƠN & TIẾP NHẬN */}
            <div
              data-testid="zone1-card-order-flow"
              className="bg-white border border-[#e5ece8] rounded-[14px] p-4 sm:p-5 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#6d7f77]">
                    LƯU LƯỢNG ĐƠN &amp; TIẾP NHẬN
                  </span>
                  <span className="w-7 h-7 rounded-[7px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none">
                    <Icon name="repairs" size={15} />
                  </span>
                </div>

                {isKpiLoading ? (
                  <div data-testid="kpi-card-loading-skeleton" className="space-y-2 py-1">
                    <div className="h-7 w-36 rounded bg-[#e5ece8] animate-pulse" />
                    <div className="h-3.5 w-44 rounded bg-[#edf4f0] animate-pulse" />
                  </div>
                ) : (
                  <>
                    <div className="font-heading font-extrabold text-2xl text-[#1c302b] tracking-tight">
                      {zone1IntakeCount} đơn mới
                    </div>
                    <div className="text-xs text-[#5d6f67] mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/repairs?status=completed&date_type=completed_at&${periodQueryString}`
                          )
                        }
                        className="hover:text-[#176b58] hover:underline cursor-pointer"
                      >
                        Đã bàn giao: <b className="text-[#176b58]">{zone1CompletedFlowCount} đơn</b>
                      </button>
                      <span className="text-[#c5d1cb]">|</span>
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/repairs?order_type=warranty&${periodQueryString}`)
                        }
                        className="hover:text-[#176b58] hover:underline cursor-pointer"
                      >
                        Bảo hành: <b className="text-[#915e1b]">{zone1WarrantyCount} đơn</b>
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="pt-2.5 mt-3 border-t border-[#edf2ee] flex items-center justify-between gap-2 text-xs">
                <span className="text-[#65766e] font-medium">Tiếp nhận mới trong kỳ</span>
                <button
                  type="button"
                  onClick={() => router.push(`/repairs?date_type=created_at&${periodQueryString}`)}
                  className="inline-flex items-center gap-1 font-bold text-[#176b58] hover:text-[#115042] cursor-pointer"
                >
                  <span>Xem đơn mới</span>
                  <Icon name="arrow" size={12} />
                </button>
              </div>
            </div>

            {/* CARD 4: TỔNG DOANH THU THÁNG */}
            <div
              data-testid="zone1-card-monthly-revenue"
              onClick={() =>
                router.push('/repairs?status=completed&date_type=completed_at&date_filter=this_month')
              }
              className="bg-white border border-[#c5e1d4] rounded-[14px] p-4 sm:p-5 shadow-xs hover:border-[#176b58] transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#406856]">
                      TỔNG DOANH THU THÁNG
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#eaf4ef] text-[#176b58]">
                      {monthlySummary?.month_label || 'Tháng này'}
                    </span>
                  </div>
                  <span className="w-7 h-7 rounded-[7px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none">
                    <Icon name="payments" size={15} />
                  </span>
                </div>

                {isKpiLoading ? (
                  <div data-testid="kpi-card-loading-skeleton" className="space-y-2 py-1">
                    <div className="h-7 w-36 rounded bg-[#e5ece8] animate-pulse" />
                    <div className="h-3.5 w-44 rounded bg-[#edf4f0] animate-pulse" />
                  </div>
                ) : (
                  <>
                    <div className="font-heading font-extrabold text-2xl text-[#176b58] tracking-tight">
                      {formatVND(monthlyCollectedRevenue)}
                    </div>
                    <div className="text-xs text-[#5d6f67] mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>
                        TM: <b className="text-[#1c302b]">{formatVND(monthlyCashAmount)}</b>
                      </span>
                      <span className="text-[#c5d1cb]">|</span>
                      <span>
                        CK: <b className="text-[#2a6280]">{formatVND(monthlyTransferAmount)}</b>
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="pt-2.5 mt-3 border-t border-[#edf2ee] flex items-center justify-between gap-2 text-xs">
                <span className="text-[#287452] font-semibold">
                  {monthlyCompletedCount} đơn hoàn tất tháng
                </span>
                <span className="inline-flex items-center gap-1 font-bold text-[#176b58]">
                  <span>Xem</span>
                  <Icon name="arrow" size={12} />
                </span>
              </div>
            </div>
          </div>

          {/* Hàng 2 cột (50% / 50%): Biểu đồ xu hướng Doanh thu & Bảng Hiệu suất Nhân sự (Compact Pagination) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            {/* Cột trái (50%): Biểu đồ Xu hướng Doanh thu & Đơn bàn giao */}
            <div className="bg-white rounded-[14px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-[#176b58]" />
                      <span className="text-xs font-bold text-[#819089] uppercase tracking-[1px]">
                        XU HƯỚNG DOANH THU &amp; BÀN GIAO
                      </span>
                    </div>
                    <h3 className="font-heading font-bold text-lg text-[#1c302b] m-0">
                      Biểu đồ thực thu &amp; sản lượng bàn giao
                    </h3>
                    <p className="text-xs text-[#7e8d85] mt-0.5 mb-0">
                      Biến động doanh thu bàn giao ({periodMetrics?.period_label || selectedDateDisplay})
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/repairs?status=completed&date_type=completed_at&${periodQueryString}`
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-bold bg-[#f4f7f5] text-[#176b58] border border-[#d6e4dc] hover:bg-[#eaf3ee] cursor-pointer"
                  >
                    <span>Đối soát đơn hoàn tất</span>
                    <Icon name="arrow" size={12} />
                  </button>
                </div>

                {renderRevenueChart()}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#808f87] pt-3 mt-3 border-t border-[#f0f3f1]">
                <div className="flex items-center gap-5">
                  <span className="flex items-center gap-1.5">
                    <i className="w-2.5 h-2.5 rounded-full bg-[#176b58] inline-block" /> Doanh thu thực thu
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="w-2.5 h-2.5 rounded-full bg-[#bdc9c2] inline-block" /> Đơn bàn giao xong
                  </span>
                </div>
                <span className="text-[11px] text-[#7c8982]">
                  Tổng thực thu kỳ: <b className="text-[#176b58]">{formatVND(zone1CollectedRevenue)}</b>
                </span>
              </div>
            </div>

            {/* Cột phải (50%): Bảng Hiệu suất Nhân sự KTV / CSKH đồng bộ kỳ & phân trang gọn */}
            <StaffPerformanceWidget
              branchId={branchId}
              selectedDate={selectedDate}
              period={activePreset}
              userRole={role}
            />
          </div>
        </section>

        {/* =================================================================== */}
        {/* ZONE 2: ĐIỀU PHỐI XƯỞNG & TIỀN TỒN KHO THỜI GIAN THỰC (ALL-TIME)     */}
        {/* =================================================================== */}
        <section
          data-testid="admin-zone2-live-workshop"
          className="bg-white rounded-[14px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0f3f1] pb-3.5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-[#176b58]" />
                <span className="text-xs font-bold text-[#819089] uppercase tracking-[1px]">
                  TRẠM ĐIỀU PHỐI XƯỞNG &amp; DÒNG TIỀN ĐƠN ĐANG MỞ
                </span>
              </div>
              <h3 className="font-heading font-bold text-lg text-[#1c302b] m-0">
                Tiền đang nằm tại cửa hàng &amp; Đường ống 6 bước xử lý
              </h3>
              <p className="text-xs text-[#7e8d85] mt-0.5 mb-0">
                Số liệu thực tế toàn thời gian độc lập với bộ lọc ngày — khớp 100% với trang Quản lý đơn khi chọn chế độ &ldquo;Toàn bộ&rdquo;.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push('/repairs?date_filter=all&status=open')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-bold bg-[#eaf5ef] text-[#176b58] border border-[#c5e1d4] hover:bg-[#d8ede1] cursor-pointer"
            >
              <span>Tổng đơn đang mở: {liveOpenOrdersCount} máy</span>
              <Icon name="arrow" size={12} />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
            {/* CỘT TRÁI (1/3): TIỀN ĐANG NẰM TẠI CỬA HÀNG */}
            <div className="lg:col-span-1 bg-[#fcfaf5] border border-[#ebd9bd] rounded-[12px] p-4 sm:p-5 flex flex-col justify-between space-y-3.5">
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#915e1b] flex items-center gap-1.5">
                    <Icon name="account_balance_wallet" size={15} />
                    <span>TIỀN ĐANG NẰM TẠI CỬA HÀNG</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-[#915e1b] border border-[#ebd9bd]">
                    Thời gian thực
                  </span>
                </div>

                {/* Khối 1: CHỜ KHÁCH NHẬN */}
                <button
                  type="button"
                  data-testid="zone2-card-waiting-pickup"
                  onClick={() =>
                    router.push('/repairs?date_filter=all&status=waiting_pickup')
                  }
                  className="w-full text-left p-3.5 bg-white rounded-[10px] border border-[#e6d3b3] hover:border-[#176b58] transition-all cursor-pointer shadow-2xs"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[#915e1b] uppercase">
                      CHỜ KHÁCH NHẬN ({liveWaitingPickupCount} máy)
                    </span>
                    <Icon name="arrow" size={12} className="text-[#915e1b]" />
                  </div>
                  <div className="font-heading font-extrabold text-xl text-[#915e1b]">
                    {formatVND(liveWaitingPickupUncollectedAmount)}
                  </div>
                  <div className="text-[11px] text-[#6d7f77] mt-1">
                    Cần thu nốt khi khách lấy máy
                  </div>
                  <div className="text-[11px] text-[#8c7456] mt-1 pt-1 border-t border-[#f5eee2] font-medium">
                    (Tổng giá: {formatVND(liveWaitingPickupTotalAmount)} - Đã thu/cọc:{' '}
                    {formatVND(liveWaitingPickupDepositAmount)})
                  </div>
                </button>

                {/* Khối 2: ĐANG TRONG XƯỞNG */}
                <button
                  type="button"
                  data-testid="zone2-card-in-workshop"
                  onClick={() =>
                    router.push('/repairs?date_filter=all&status=in_workshop')
                  }
                  className="w-full text-left p-3.5 bg-white rounded-[10px] border border-[#dce6e0] hover:border-[#176b58] transition-all cursor-pointer shadow-2xs"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[#1c302b] uppercase">
                      ĐANG TRONG XƯỞNG ({liveInWorkshopCount} máy)
                    </span>
                    <Icon name="arrow" size={12} className="text-[#176b58]" />
                  </div>
                  <div className="font-heading font-extrabold text-xl text-[#1c302b]">
                    {formatVND(liveInWorkshopExpectedAmount)}
                  </div>
                  <div className="text-[11px] text-[#6d7f77] mt-1">
                    Dự kiến thu sau khi hoàn tất sửa chữa &amp; QC
                  </div>
                </button>
              </div>

              {/* Thanh tổng kết chân cột */}
              <button
                type="button"
                data-testid="zone2-open-orders-footer"
                onClick={() => router.push('/repairs?date_filter=all&status=open')}
                className="w-full p-3 rounded-[9px] bg-[#f5ede0] hover:bg-[#ece2d1] border border-[#ebd9bd] text-left transition-colors cursor-pointer flex items-center justify-between gap-2"
              >
                <div className="text-xs font-bold text-[#7a4e16]">
                  TỔNG ĐƠN ĐANG MỞ: {liveOpenOrdersCount} máy
                  <span className="block text-[11px] font-medium text-[#8c7456] mt-0.5">
                    ({liveInWorkshopCount} trong xưởng + {liveWaitingPickupCount} chờ nhận)
                  </span>
                </div>
                <Icon name="arrow" size={13} className="text-[#7a4e16] flex-none" />
              </button>
            </div>

            {/* CỘT PHẢI (2/3): ĐƯỜNG ỐNG 6 BƯỚC XỬ LÝ (PIPELINE) */}
            <div className="lg:col-span-2 bg-[#fafcfa] border border-[#e5ece8] rounded-[12px] p-4 sm:p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-[#176b58] block">
                      ĐƯỜNG ỐNG 6 BƯỚC XỬ LÝ (WORKSHOP PIPELINE)
                    </span>
                    <span className="text-xs text-[#6d7f77]">
                      Tổng đơn đang mở: <b className="text-[#1c302b]">{liveOpenOrdersCount} máy</b> — Bấm vào từng khâu để lọc ngay danh sách đơn tương ứng
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push('/repairs?date_filter=all&status=open')}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#176b58] hover:text-[#115042] cursor-pointer"
                  >
                    <span>Xem tất cả</span>
                    <Icon name="arrow" size={12} />
                  </button>
                </div>

                {/* 6 Thanh tiến độ tương tác */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {pipelineSteps.map((step) => {
                    const pct =
                      liveOpenOrdersCount > 0
                        ? Math.min(100, Math.round((step.count / liveOpenOrdersCount) * 100))
                        : 0;
                    return (
                      <button
                        key={step.key}
                        type="button"
                        data-testid={`zone2-pipeline-${step.key}`}
                        onClick={() => router.push(step.href)}
                        className="p-3 rounded-[10px] bg-white border border-[#e5ece8] hover:border-[#176b58] transition-all text-left cursor-pointer group"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-7 h-7 rounded-[7px] grid place-items-center flex-none ${step.badgeBg}`}
                            >
                              <Icon name={step.icon} size={14} />
                            </span>
                            <span className="text-xs font-bold text-[#1c302b] group-hover:text-[#176b58] truncate">
                              {step.label}
                            </span>
                          </div>
                          <span className="font-heading font-extrabold text-sm text-[#1c302b] whitespace-nowrap">
                            {step.count} đơn
                          </span>
                        </div>
                        <div className="h-2 bg-[#edf2ef] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${step.barColor}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Thanh cảnh báo đỏ ở đáy cho đơn Quá hạn > 24h */}
              <div
                data-testid="zone2-overdue-banner"
                className={`p-3.5 rounded-[10px] border flex flex-wrap items-center justify-between gap-3 ${
                  liveOverdueCount > 0
                    ? 'bg-[#fbefed] border-[#f5c7c2]'
                    : 'bg-[#eaf5ef] border-[#c5e1d4]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-8 h-8 rounded-[8px] grid place-items-center flex-none ${
                      liveOverdueCount > 0
                        ? 'bg-white text-[#bc5b52] border border-[#f5c7c2]'
                        : 'bg-white text-[#176b58] border border-[#c5e1d4]'
                    }`}
                  >
                    <Icon name={liveOverdueCount > 0 ? 'alert' : 'check'} size={16} />
                  </span>
                  <div>
                    <div
                      className={`text-xs font-extrabold uppercase tracking-wide ${
                        liveOverdueCount > 0 ? 'text-[#bc5b52]' : 'text-[#176b58]'
                      }`}
                    >
                      {liveOverdueCount > 0
                        ? `CẢNH BÁO ĐỎ: ${liveOverdueCount} đơn Quá hạn >24h trong xưởng`
                        : 'ĐÚNG TIẾN ĐỘ: Không có đơn hàng nào quá hạn >24h'}
                    </div>
                    <div className="text-[11px] text-[#5e6f67]">
                      {liveOverdueCount > 0
                        ? 'Các thiết bị lưu xưởng quá 24h chưa hoàn tất sửa chữa cần ưu tiên can thiệp ngay.'
                        : 'Toàn bộ thiết bị đang sửa trong xưởng đều nằm trong thời gian cam kết.'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      '/repairs?date_filter=all&status=in_workshop&workshop_step=overdue'
                    )
                  }
                  className={`px-3.5 py-2 rounded-[8px] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    liveOverdueCount > 0
                      ? 'bg-[#bc5b52] hover:bg-[#a64b43] text-white'
                      : 'bg-white text-[#176b58] border border-[#c5e1d4] hover:bg-[#eff6f2]'
                  }`}
                >
                  <span>Xử lý ngay</span>
                  <Icon name="arrow" size={12} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================== */}
        {/* ZONE 3: BÀN XỬ LÝ NGOẠI LỆ (ACTIONABLE TASKS CENTER — 1 BẢNG DUY NHẤT) */}
        {/* =================================================================== */}
        <ActionableTasksCenter
          actionableTasks={kpiData?.actionable_tasks}
          isLoading={isKpiLoading}
          onOpenOrderDetail={handleOpenOrderDetail}
          onOpenCheckout={handleOpenCheckout}
          onNavigate={(path) => router.push(path)}
        />
      </div>
    );
  };

  /* ========================================================================= */
  /* CSKH DASHBOARD VIEW                                                       */
  /* ========================================================================= */
  const renderCskhDashboard = () => (
    <div className="space-y-6">
      {/* Head */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-[#819089] uppercase tracking-[1.05px] mb-1">
            CSKH · WORKSPACE
          </div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#1c302b] m-0">
            Chào buổi sáng, {currentUser?.name || 'Nhân viên'}
          </h1>
          <p className="text-sm text-[#7e8d85] mt-1 mb-0">
            Bảng công việc CSKH · Tập trung tiếp nhận, trả máy và chăm sóc khách hàng.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="md"
            icon="shield"
            data-testid="cskh-warranty-intake-btn"
            onClick={() => {
              setInitialIntakeType('warranty');
              setIntakeModalOpen(true);
            }}
            className="bg-[#eaf5ef] text-[#176b58] border-[#a9c9b9] hover:bg-[#d8ede1] font-bold"
          >
            Tiếp nhận bảo hành
          </Button>
          <Button
            variant="primary"
            size="md"
            icon="plus"
            onClick={() => {
              setInitialIntakeType('in_store');
              setIntakeModalOpen(true);
            }}
          >
            Tiếp nhận khách mới
          </Button>
        </div>
      </div>

      {/* CSKH Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <StatCard
          label="Tiếp nhận hôm nay"
          value={String(todayOrdersCount).padStart(2, '0')}
          icon="plus"
          foot={`${branchOrders.length} đơn tại chi nhánh`}
        />
        <StatCard
          label="Máy sẵn sàng trả"
          value={String(cskhReadyOrders.length).padStart(2, '0')}
          icon="check"
          foot="Sẵn sàng thu tiền & bàn giao"
        />
        <StatCard
          label="Cần cập nhật tiến độ"
          value={String(repairingCount).padStart(2, '0')}
          icon="arrow"
          foot="Đơn đang trong ca sửa"
        />
        <StatCard
          label="Máy chưa hoàn tất"
          value={String(cskhPendingOrders.length)}
          icon="alert"
          foot="Bấm để mở danh sách"
          trend="down"
          onClick={() => setCskhPendingModalOpen(true)}
        />
      </div>

      {/* Panel: "Máy sẵn sàng trả" (Thu tiền & Bàn giao ngay trên Dashboard CSKH) */}
      <div
        data-testid="cskh-ready-orders-panel"
        className="bg-white rounded-[12px] border border-[#c5e1d4] p-5 sm:p-6 shadow-xs"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-heading font-bold text-base text-[#176b58] m-0 flex items-center gap-2">
              <Icon name="check" size={18} className="text-[#176b58]" />
              <span>Máy sẵn sàng trả ({cskhReadyOrders.length})</span>
            </h3>
            <p className="text-xs text-[#64786e] mt-0.5 mb-0">
              Thiết bị đã sửa xong & kiểm định đạt, sẵn sàng thu tiền và bàn giao cho khách hàng.
            </p>
          </div>
          <span className="text-xs font-bold text-[#176b58] bg-[#eaf4ef] px-3 py-1 rounded-[10px]">
            {cskhReadyOrders.length} máy chờ giao
          </span>
        </div>

        {cskhReadyOrders.length === 0 ? (
          <div className="p-4 rounded-[10px] bg-[#f8faf9] border border-dashed border-[#d8e3dc] text-center text-xs text-[#73857d]">
            Hiện không có thiết bị nào đang chờ bàn giao cho khách.
          </div>
        ) : (
          <div className="divide-y divide-[#edf1ee]">
            {cskhReadyOrders.map((o) => (
              <div
                key={o.id}
                className="py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-[#fafcfa] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[10px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none">
                    <Icon name="headphones" size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <b className="text-sm text-[#1c302b]">{o.device}</b>
                      <span className="font-mono text-xs text-[#176b58] font-bold">{o.id}</span>
                    </div>
                    <div className="text-xs text-[#7e8e86] mt-0.5">
                      {o.name} ({o.phone}) · <span className="text-[#176b58] font-bold">{moneyFormatted(o.total_price ?? o.price)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <StatusTag label={o.status} type={o.statusType} />
                  <Button
                    variant="primary"
                    size="sm"
                    icon="payments"
                    data-testid={`cskh-btn-checkout-${o.id}`}
                    onClick={() => {
                      setCheckoutOrder(o);
                      setCheckoutModalOpen(true);
                    }}
                    className="bg-[#176b58] hover:bg-[#125848] text-white font-bold text-xs shadow-xs"
                  >
                    Thu tiền & Trả máy
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Panel: "Máy còn cần xử lý hôm nay" */}
      <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
              Máy còn cần xử lý hôm nay
            </h3>
            <p className="text-xs text-[#8a9891] mt-0.5 mb-0">
              Các phiếu chưa hoàn tất, xếp theo thứ tự ưu tiên việc cần làm tiếp theo.
            </p>
          </div>
          <span className="text-xs font-bold text-[#176b58] bg-[#eaf4ef] px-3 py-1 rounded-[10px]">
            {cskhPendingOrders.length} máy
          </span>
        </div>

        <div className="divide-y divide-[#edf1ee]">
          {cskhPendingOrders.slice(0, 6).map((o) => {
            const isReadyToReturn =
              normalizeStatusCode(o.status) === 'ready_for_return' ||
              normalizeStatusCode(o.status) === 'waiting_pickup' ||
              o.status === 'Sẵn sàng trả' ||
              o.status === 'Chờ khách nhận';

            return (
              <div
                key={o.id}
                onClick={() => router.push('/repairs')}
                className="py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-[#fafcfa] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[10px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none">
                    <Icon name="headphones" size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <b className="text-sm text-[#1c302b]">{o.device}</b>
                      <span className="font-mono text-xs text-[#176b58] font-bold">{o.id}</span>
                    </div>
                    <div className="text-xs text-[#7e8e86] mt-0.5">
                      {o.name} · <span className="text-[#495952]">{o.issue}</span>
                    </div>
                    <div className="text-xs text-[#287452] font-semibold mt-1">
                      Việc tiếp theo: <b>{getCskhNextAction(o)}</b>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <StatusTag label={o.status} type={o.statusType} />
                  {isReadyToReturn && (
                    <Button
                      variant="primary"
                      size="sm"
                      icon="payments"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCheckoutOrder(o);
                        setCheckoutModalOpen(true);
                      }}
                      className="bg-[#176b58] hover:bg-[#125848] text-white font-bold text-xs"
                    >
                      Thu tiền & Trả máy
                    </Button>
                  )}
                  <Button variant="secondary" size="sm">
                    Mở phiếu ↗
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  /* ========================================================================= */
  /* TECH DASHBOARD VIEW                                                       */
  /* ========================================================================= */
  const renderTechDashboard = () => (
    <div className="space-y-6">
      {/* Head */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-[#819089] uppercase tracking-[1.05px] mb-1 flex items-center gap-2">
            <span>TECHNICIAN OS</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#176b58]" />
            <span className="text-[#176b58] font-bold">
              {branchId === 'all' ? 'Toàn bộ chi nhánh' : branch || currentUser?.branch}
            </span>
          </div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#1c302b] m-0">
            Không gian kỹ thuật
          </h1>
          <p className="text-sm text-[#7e8d85] mt-1 mb-0">
            Xin chào {currentUser?.name || 'Kỹ thuật viên'} · Tiếp nhận, sửa chữa và nghiệm thu hoàn thành bàn giao quầy CSKH.
          </p>
        </div>
        <Button variant="primary" size="md" icon="wrench" onClick={() => router.push('/tech')}>
          Mở toàn bộ hàng đợi Kỹ Thuật ↗
        </Button>
      </div>

      {/* Tech Stats (Clickable KPI Filter Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <StatCard
          label="Đơn đang phụ trách"
          value={String(techActiveOrders.length).padStart(2, '0')}
          icon="wrench"
          foot="Trong ca hiện tại"
          onClick={() => setTechTab('my_orders')}
          className={`cursor-pointer transition-all ${
            techTab === 'my_orders'
              ? 'border-[#176b58] ring-2 ring-[#176b58]/20 bg-[#f7faf8]'
              : 'hover:border-[#b4d6c4]'
          }`}
        />
        <StatCard
          label="Đơn chờ nhận"
          value={String(techAvailableOrders.length).padStart(2, '0')}
          icon="plus"
          foot="Có phiếu CSKH kèm theo"
          onClick={() => setTechTab('available')}
          className={`cursor-pointer transition-all ${
            techTab === 'available'
              ? 'border-[#176b58] ring-2 ring-[#176b58]/20 bg-[#f7faf8]'
              : 'hover:border-[#b4d6c4]'
          }`}
        />
        <StatCard
          label="Đang sửa chữa"
          value={String(
            techActiveOrders.filter(
              (o) => normalizeStatusCode(o.status) === 'in_repair' || o.status === 'Đang sửa'
            ).length
          ).padStart(2, '0')}
          icon="clock"
          foot="Cập nhật theo phiếu"
          onClick={() => setTechTab('my_orders')}
          className={`cursor-pointer transition-all ${
            techTab === 'my_orders'
              ? 'border-[#176b58] ring-2 ring-[#176b58]/20 bg-[#f7faf8]'
              : 'hover:border-[#b4d6c4]'
          }`}
        />
        <StatCard
          label="Đã sửa xong hôm nay"
          value={String(techCompletedOrders.length).padStart(2, '0')}
          icon="check"
          foot="Sẵn sàng bàn giao CSKH"
          onClick={() => setTechTab('completed')}
          className={`cursor-pointer transition-all ${
            techTab === 'completed'
              ? 'border-[#176b58] ring-2 ring-[#176b58]/20 bg-[#f7faf8]'
              : 'hover:border-[#b4d6c4]'
          }`}
        />
      </div>

      {/* 3 Tab Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-[#e5ece8] pb-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setTechTab('my_orders')}
          className={`px-4 py-2.5 rounded-[8px] font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer ${
            techTab === 'my_orders'
              ? 'bg-[#176b58] text-white shadow-xs'
              : 'bg-white text-[#52635a] hover:bg-[#f0f4f2] border border-[#e5ece8]'
          }`}
        >
          <span>Đơn của tôi</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              techTab === 'my_orders'
                ? 'bg-white/20 text-white'
                : 'bg-[#eaf4ef] text-[#176b58]'
            }`}
          >
            {techActiveOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTechTab('available')}
          className={`px-4 py-2.5 rounded-[8px] font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer ${
            techTab === 'available'
              ? 'bg-[#176b58] text-white shadow-xs'
              : 'bg-white text-[#52635a] hover:bg-[#f0f4f2] border border-[#e5ece8]'
          }`}
        >
          <span>Đơn chờ nhận</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              techTab === 'available'
                ? 'bg-white/20 text-white'
                : 'bg-[#eaf4ef] text-[#176b58]'
            }`}
          >
            {techAvailableOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTechTab('completed')}
          className={`px-4 py-2.5 rounded-[8px] font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer ${
            techTab === 'completed'
              ? 'bg-[#176b58] text-white shadow-xs'
              : 'bg-white text-[#52635a] hover:bg-[#f0f4f2] border border-[#e5ece8]'
          }`}
        >
          <span>Đã sửa xong</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              techTab === 'completed'
                ? 'bg-white/20 text-white'
                : 'bg-[#eaf4ef] text-[#176b58]'
            }`}
          >
            {techCompletedOrders.length}
          </span>
        </button>
      </div>

      {/* Tab Content Display */}
      {techTab === 'my_orders' && (
        <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
                Đơn máy tôi đang phụ trách ({techActiveOrders.length})
              </h3>
              <p className="text-xs text-[#809088] mt-0.5 mb-0">
                Danh sách thiết bị bạn đã nhận vào bàn sửa. Bấm vào đơn hoặc nút [Chi tiết & Nghiệm thu] để mở form hoàn tất.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => router.push('/tech')}>
              Xem trên bàn kỹ thuật ↗
            </Button>
          </div>

          {techActiveOrders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {techActiveOrders.map((order) => {
                const code = normalizeStatusCode(order.status);
                const isWaitingParts = code === 'waiting_parts';

                return (
                  <article
                    key={order.id}
                    className="bg-white border border-[#e5ece8] hover:border-[#176b58] rounded-[12px] p-5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
                    onClick={() => {
                      setSelectedTechOrder(order);
                      setTechModalOpen(true);
                    }}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-sm text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded-[6px]">
                          {order.id}
                        </span>
                        <StatusTag label={order.status} type={order.statusType} />
                      </div>

                      <div>
                        <h4 className="font-heading font-bold text-base text-[#1c302b] m-0 group-hover:text-[#176b58] transition-colors">
                          {order.device}
                        </h4>
                        {order.serial && order.serial !== 'Chưa cập nhật' && (
                          <span className="text-xs font-mono text-[#798a82] block mt-0.5">
                            SN: {order.serial}
                          </span>
                        )}
                      </div>

                      <div className="bg-[#f8faf9] border border-[#e5ece8] rounded-[8px] p-3 text-xs text-[#3d4d45] leading-relaxed">
                        <span className="font-bold text-[#708078] block mb-0.5">Lỗi khách báo:</span>
                        {order.issue}
                      </div>

                      <div className="space-y-1 text-xs text-[#52635a]">
                        <div className="flex items-center justify-between">
                          <span className="text-[#809088]">Khách hàng:</span>
                          <b className="text-[#1c302b]">{order.name} ({order.phone})</b>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#809088]">Chi nhánh:</span>
                          <span>{order.branch || order.branchName}</span>
                        </div>
                      </div>
                    </div>

                    <div
                      className="pt-4 mt-3 border-t border-[#f0f3f1] flex flex-wrap gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        icon="printer"
                        disabled={isSilentPrinting}
                        onClick={() => handlePrintRoutingSlip(order)}
                        className="px-2.5 text-xs text-[#176b58] border-[#c4ded0] hover:bg-[#eef6f2]"
                        title="In nhanh tem dán khay K80"
                      >
                        Tem
                      </Button>

                      {isWaitingParts ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleResumeRepair(order)}
                          className="text-xs font-semibold"
                        >
                          Tiếp tục
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePauseWaitingParts(order)}
                          className="text-xs text-[#708078] border-[#d6dfda]"
                          title="Tạm dừng chờ linh kiện"
                        >
                          Linh kiện
                        </Button>
                      )}

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedTechOrder(order);
                          setTechModalOpen(true);
                        }}
                        className="text-xs font-semibold"
                      >
                        Chi tiết
                      </Button>

                      <Button
                        variant="primary"
                        size="sm"
                        icon="check"
                        onClick={() => {
                          setSelectedTechOrder(order);
                          setTechModalOpen(true);
                        }}
                        className="flex-1 text-xs font-bold bg-[#176b58] hover:bg-[#125848] text-white shadow-xs cursor-pointer"
                      >
                        Hoàn thành
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="py-8">
              <EmptyState
                title="Hiện chưa có đơn nào đang phụ trách"
                description="Bạn chưa nhận máy nào vào bàn sửa chữa trong ca này. Hãy chuyển sang Tab 'Đơn chờ nhận' để tiếp nhận máy từ quầy tiếp tân."
                icon="wrench"
                actionLabel={`Xem đơn chờ nhận ngay (${techAvailableOrders.length})`}
                onAction={() => setTechTab('available')}
              />
            </div>
          )}
        </div>
      )}

      {techTab === 'available' && (
        <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#176b58] opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#176b58]" />
              </span>
              <div>
                <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
                  Đơn mới sẵn sàng nhận ({techAvailableOrders.length})
                </h3>
                <p className="text-xs text-[#809088] mt-0.5 mb-0">
                  Đơn tiếp nhận tại quầy chưa có KTV phụ trách. Bấm [Nhận đơn →] để đưa ngay vào bàn sửa chữa của bạn.
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => router.push('/tech')}>
              Xem tất cả ↗
            </Button>
          </div>

          {techAvailableOrders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {techAvailableOrders.map((order) => (
                <article
                  key={order.id}
                  className="bg-white border-2 border-[#176b58]/20 hover:border-[#176b58] rounded-[12px] p-5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-sm text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded-[6px]">
                        {order.id}
                      </span>
                      <StatusTag label={order.status} type={order.statusType} />
                    </div>

                    <div>
                      <h4 className="font-heading font-bold text-base text-[#1c302b] m-0">
                        {order.device}
                      </h4>
                      {order.serial && order.serial !== 'Chưa cập nhật' && (
                        <span className="text-xs font-mono text-[#798a82] block mt-0.5">
                          SN: {order.serial}
                        </span>
                      )}
                    </div>

                    <div className="bg-[#f8faf9] border border-[#e5ece8] rounded-[8px] p-3 text-xs text-[#3d4d45] leading-relaxed">
                      <span className="font-bold text-[#176b58] block mb-0.5">Mô tả lỗi khách báo:</span>
                      {order.issue}
                    </div>

                    <div className="space-y-1 text-xs text-[#52635a]">
                      <div className="flex items-center justify-between">
                        <span className="text-[#809088]">Khách hàng:</span>
                        <b className="text-[#1c302b]">{order.name} ({order.phone})</b>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#809088]">Tiếp nhận lúc:</span>
                        <span>{order.date}</span>
                      </div>
                      {order.accessories && order.accessories !== 'Không gửi kèm' && (
                        <div className="flex items-center justify-between">
                          <span className="text-[#809088]">Phụ kiện:</span>
                          <span className="truncate max-w-[170px]">{order.accessories}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 mt-3 border-t border-[#f0f3f1] flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSelectedTechOrder(order);
                        setTechModalOpen(true);
                      }}
                      className="px-3 text-xs font-semibold"
                    >
                      Xem chi tiết
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={isTechSubmitting}
                      onClick={() => handleGrabTechOrder(order)}
                      className="flex-1 font-bold text-xs bg-[#176b58] hover:bg-[#125848] text-white shadow-xs"
                    >
                      Nhận đơn →
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="py-8">
              <EmptyState
                title="Hiện không có đơn mới chờ nhận"
                description="Tất cả thiết bị tại quầy đã được phân công hoặc đã có KTV tiếp nhận. Khi có đơn mới tại chi nhánh, danh sách sẽ tự động đồng bộ."
                icon="check"
              />
            </div>
          )}
        </div>
      )}

      {techTab === 'completed' && (
        <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
                Đã sửa xong trong ca hôm nay ({techCompletedOrders.length})
              </h3>
              <p className="text-xs text-[#809088] mt-0.5 mb-0">
                Các thiết bị đã hoàn tất sửa chữa, sẵn sàng bàn giao quầy CSKH trả máy cho khách hoặc thẩm định QC.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => router.push('/tech')}>
              Mở toàn bộ ↗
            </Button>
          </div>

          {techCompletedOrders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {techCompletedOrders.map((order) => (
                <article
                  key={order.id}
                  className="bg-white border border-[#e5ece8] rounded-[12px] p-5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-sm text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded-[6px]">
                        {order.id}
                      </span>
                      <StatusTag label={order.status} type={order.statusType} />
                    </div>

                    <div>
                      <h4 className="font-heading font-bold text-base text-[#1c302b] m-0">
                        {order.device}
                      </h4>
                      {order.serial && order.serial !== 'Chưa cập nhật' && (
                        <span className="text-xs font-mono text-[#798a82] block mt-0.5">
                          SN: {order.serial}
                        </span>
                      )}
                    </div>

                    <div className="bg-[#f2f8f5] border border-[#d2e8dd] rounded-[8px] p-3 text-xs text-[#1e583f] leading-relaxed">
                      <span className="font-bold text-[#176b58] block mb-0.5">Nghiệm thu hoàn tất:</span>
                      {order.repairNote || 'Đã sửa chữa và kiểm tra hoàn chỉnh theo tiêu chuẩn xuất xưởng.'}
                    </div>

                    <div className="space-y-1 text-xs text-[#52635a]">
                      <div className="flex items-center justify-between">
                        <span className="text-[#809088]">Khách hàng:</span>
                        <b className="text-[#1c302b]">{order.name} ({order.phone})</b>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-3 border-t border-[#f0f3f1] flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      icon="printer"
                      disabled={isSilentPrinting}
                      onClick={() => handlePrintRoutingSlip(order)}
                      className="px-2.5 text-xs text-[#176b58] border-[#c4ded0] hover:bg-[#eef6f2]"
                    >
                      In tem K80
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSelectedTechOrder(order);
                        setTechModalOpen(true);
                      }}
                      className="flex-1 text-xs font-semibold"
                    >
                      Xem chi tiết & Nghiệm thu
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="py-8">
              <EmptyState
                title="Chưa có đơn nào hoàn tất hôm nay"
                description="Sau khi sửa xong thiết bị từ tab 'Đơn của tôi' và bấm Hoàn tất sửa chữa, danh sách sẽ được lưu vết tại đây."
                icon="check"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <AppShell crumbName={role === 'admin' ? 'Tổng quan' : role === 'cskh' ? 'Bàn CSKH' : 'Kỹ thuật'}>
      {role === 'cskh'
        ? renderCskhDashboard()
        : role === 'tech' || role === 'technician'
        ? renderTechDashboard()
        : renderAdminDashboard()}

      {/* Intake Wizard Modal */}
      <IntakeWizardModal
        isOpen={intakeModalOpen}
        initialIntakeType={initialIntakeType}
        defaultOrderType={initialIntakeType}
        onClose={() => setIntakeModalOpen(false)}
        onSuccess={() => setIntakeModalOpen(false)}
      />

      {/* CSKH Pending Modal */}
      <Modal
        isOpen={cskhPendingModalOpen}
        onClose={() => setCskhPendingModalOpen(false)}
        maxWidth="lg"
        eyebrow="CSKH · THEO DÕI TIẾN ĐỘ"
        title="Danh sách máy chưa hoàn tất hôm nay"
        subtitle={`${cskhPendingOrders.length} phiếu đang cần theo dõi tiến độ.`}
        footer={
          <div className="flex justify-end gap-2.5 w-full">
            <Button variant="secondary" size="md" onClick={() => setCskhPendingModalOpen(false)}>
              Đóng
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setCskhPendingModalOpen(false);
                router.push('/repairs');
              }}
            >
              Mở danh sách đơn ↗
            </Button>
          </div>
        }
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {cskhPendingOrders.map((o) => {
            const isReadyToReturn =
              normalizeStatusCode(o.status) === 'ready_for_return' ||
              normalizeStatusCode(o.status) === 'waiting_pickup' ||
              o.status === 'Sẵn sàng trả' ||
              o.status === 'Chờ khách nhận';

            return (
              <div
                key={o.id}
                className="p-3.5 bg-white rounded-[10px] border border-[#e5ece8] flex flex-col gap-2"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2.5">
                    <b className="text-sm text-[#1c302b]">{o.device}</b>
                    <span className="font-mono text-xs text-[#176b58] font-bold">{o.id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusTag label={o.status} type={o.statusType} />
                    {isReadyToReturn && (
                      <Button
                        variant="primary"
                        size="sm"
                        icon="payments"
                        onClick={() => {
                          setCskhPendingModalOpen(false);
                          setCheckoutOrder(o);
                          setCheckoutModalOpen(true);
                        }}
                        className="bg-[#176b58] hover:bg-[#125848] text-white font-bold text-xs"
                      >
                        Thu tiền & Trả máy
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-[#4e5e56]">
                  <div>
                    <span className="text-[#84948c] block">Chủ máy:</span>
                    <b>
                      {o.name} · {o.phone}
                    </b>
                  </div>
                  <div>
                    <span className="text-[#84948c] block">Kỹ thuật viên giữ máy:</span>
                    <b className={o.tech !== 'Chưa phân công' ? 'text-[#176b58]' : 'text-[#a4722f]'}>
                      {o.tech}
                    </b>
                  </div>
                </div>
                <div className="text-xs text-[#287452] pt-1.5 border-t border-[#f0f3f1]">
                  Việc tiếp theo: <b>{getCskhNextAction(o)}</b>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

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

      {/* Checkout Handover Modal for Admin Action Center & CSKH Dashboard */}
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
    </AppShell>
  );
}

