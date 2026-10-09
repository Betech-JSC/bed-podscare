'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  StatCard,
  StatusTag,
  Avatar,
  Icon,
  Modal,
  useToast,
  EmptyState,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { IntakeWizardModal } from '../components/IntakeWizardModal';
import { TechOrderDetailModal } from '../components/TechOrderDetailModal';
import { usePodsCare } from '../providers';
import type { RepairOrder } from '@podscare/types';
import { kpiService, repairService } from '@podscare/api-client';
import { useQuery } from '@tanstack/react-query';
import { normalizeStatusCode } from '../repairs/fsm';
import { useSilentPrint } from '../components/print';

export default function DashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { role, currentUser, orders, updateOrder, branchId, branch, invalidateOrders } = usePodsCare();

  const [intakeModalOpen, setIntakeModalOpen] = useState(false);
  const [cskhPendingModalOpen, setCskhPendingModalOpen] = useState(false);
  const [period, setPeriod] = useState<'7_days' | '14_days' | '30_days'>('14_days');

  // Technician Workspace State
  const [techTab, setTechTab] = useState<'my_orders' | 'available' | 'completed'>('my_orders');
  const [selectedTechOrder, setSelectedTechOrder] = useState<RepairOrder | null>(null);
  const [techModalOpen, setTechModalOpen] = useState(false);
  const [isTechSubmitting, setIsTechSubmitting] = useState(false);
  const { printReceipt, isPrinting: isSilentPrinting } = useSilentPrint();

  // Đấu nối KPI Dashboard API
  const { data: kpiData } = useQuery({
    queryKey: ['kpi-dashboard', branchId, period],
    queryFn: async () => {
      const res = await kpiService.getDashboardKpi({
        branch_id: branchId && branchId !== 'all' ? branchId : undefined,
        period,
      });
      return res?.data || res;
    },
  });

  const moneyFormatted = (n: number) =>
    n ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫' : '—';

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

  // CSKH Pending calculations
  const cskhPendingOrders = branchOrders
    .filter((o) => !['Hoàn tất', 'Đã hủy', 'Đã trả máy'].includes(o.status))
    .sort((a, b) => {
      const priority: Record<string, number> = {
        'Chờ khách duyệt': 1,
        'Cần sửa lại': 2,
        'Sẵn sàng trả': 3,
        'Chờ QC': 4,
        'Chờ kỹ thuật': 5,
        'Đã nhận đơn': 6,
        'Đang sửa': 7,
      };
      return (priority[a.status] || 9) - (priority[b.status] || 9);
    });

  const getCskhNextAction = (o: RepairOrder) => {
    switch (o.status) {
      case 'Chờ khách duyệt':
        return 'Nhắc khách xác nhận báo giá';
      case 'Cần sửa lại':
        return 'Theo dõi kỹ thuật sửa lại';
      case 'Sẵn sàng trả':
        return 'Liên hệ khách đến nhận máy';
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
      toast(`⚡ Bạn đã nhận đơn ${order.id} vào bàn sửa chữa!`, 'success');
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
      toast(`⚡ Bạn đã nhận đơn ${order.id} vào bàn sửa chữa!`, 'success');
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

  // Statistics for Dashboard Cards (Ưu tiên API KPI, fallback linh hoạt theo orders)
  const activeOrdersCount =
    kpiData?.active_orders ??
    branchOrders.filter((o) => !['Hoàn tất', 'Đã hủy'].includes(o.status)).length;

  const todayOrdersCount =
    kpiData?.intake_today ??
    branchOrders.filter((o) => {
      const todayStr = new Intl.DateTimeFormat('vi-VN').format(new Date());
      return o.date === 'Hôm nay' || o.date === todayStr;
    }).length;

  const branchRevenue = branchOrders
    .filter((o) => o.status === 'Hoàn tất')
    .reduce((sum, o) => sum + (o.price || 0), 0);

  const branchRevenueDisplay =
    kpiData?.monthly_revenue_formatted ??
    (branchRevenue >= 1000000
      ? (branchRevenue / 1000000).toFixed(1).replace('.', ',') + 'tr ₫'
      : new Intl.NumberFormat('vi-VN').format(branchRevenue) + ' ₫');

  const dailyRevenue = kpiData?.daily_revenue ?? 0;
  const dailyRevenueDisplay =
    kpiData?.daily_revenue_formatted ??
    (dailyRevenue >= 1000000
      ? (dailyRevenue / 1000000).toFixed(1).replace('.', ',') + 'tr ₫'
      : new Intl.NumberFormat('vi-VN').format(dailyRevenue) + ' ₫');

  const completedCount =
    kpiData?.completed_orders ?? branchOrders.filter((o) => o.status === 'Hoàn tất').length;

  const completionRateDisplay =
    kpiData?.completion_rate !== undefined
      ? `${kpiData.completion_rate}%`.replace('.', ',')
      : branchOrders.length > 0
      ? ((completedCount / branchOrders.length) * 100).toFixed(1).replace('.', ',') + '%'
      : '0%';

  const inspectingCount =
    kpiData?.workload_by_status?.inspecting ??
    branchOrders.filter((o) => o.status === 'Đang kiểm tra').length;

  const waitingApprovalCount =
    kpiData?.workload_by_status?.waiting_approval ??
    branchOrders.filter((o) => o.status === 'Chờ khách duyệt').length;

  const repairingCount =
    kpiData?.workload_by_status?.in_repair ??
    branchOrders.filter((o) => o.status === 'Đang sửa').length;

  const readyCount =
    kpiData?.workload_by_status?.ready_for_return ??
    branchOrders.filter((o) =>
      ['Chờ QC', 'Sẵn sàng trả', 'Chờ khách nhận'].includes(o.status)
    ).length;

  const reconciliation = kpiData?.reconciliation ?? {
    handed_over_count: completedCount,
    handed_over_revenue: branchRevenue,
    handed_over_revenue_formatted: branchRevenueDisplay,
    ready_for_pickup_count: readyCount,
    ready_for_pickup_amount: 0,
    ready_for_pickup_amount_formatted: '0 ₫',
    in_workshop_count: inspectingCount + waitingApprovalCount + repairingCount,
    in_workshop_amount: 0,
    in_workshop_amount_formatted: '0 ₫',
  };

  // Thuật toán sinh đồ thị doanh thu SVG động (Dynamic SVG Path Generator)
  const renderRevenueChart = () => {
    const rawChart: any[] = Array.isArray(kpiData?.revenue_chart) && kpiData.revenue_chart.length > 0
      ? kpiData.revenue_chart
      : Array.from({ length: period === '7_days' ? 7 : period === '30_days' ? 30 : 14 }, (_, i) => ({
          date: `2026-09-${String(i + 1).padStart(2, '0')}`,
          label: `T${i + 1}`,
          revenue: 0,
          completed_orders: 0,
        }));

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
      <div className="h-[210px] w-full p-2">
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
  /* ADMIN DASHBOARD VIEW                                                      */
  /* ========================================================================= */
  const renderAdminDashboard = () => (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-[#819089] uppercase tracking-[1.05px] mb-1">
            FIXO · TỔNG QUAN
          </div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#1c302b] m-0">
            Chào buổi sáng, {currentUser?.name || 'Nhân viên'} 👋
          </h1>
          <p className="text-sm text-[#7e8d85] mt-1 mb-0">
            Đây là tình hình vận hành FIXO hôm nay tại {branch || currentUser?.branch}.
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
            variant="primary"
            size="md"
            icon="plus"
            onClick={() => setIntakeModalOpen(true)}
          >
            Tạo đơn mới
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <StatCard
          label="Đơn đang xử lý"
          value={activeOrdersCount}
          icon="clock"
          foot={`${branchOrders.length} đơn tại chi nhánh`}
        />
        <StatCard
          label="Tiếp nhận hôm nay"
          value={String(todayOrdersCount).padStart(2, '0')}
          icon="plus"
          foot="Cập nhật theo ngày thực tế"
        />
        <StatCard
          label="Doanh thu hôm nay"
          value={dailyRevenueDisplay}
          icon="payments"
          foot="Đã thu trong ca hôm nay"
          trend="up"
        />
        <StatCard
          label="Doanh thu tháng"
          value={branchRevenueDisplay}
          icon="payments"
          foot={`Tháng ${new Date().getMonth() + 1}, ${new Date().getFullYear()}`}
        />
        <StatCard
          label="Tỷ lệ hoàn thành"
          value={completionRateDisplay}
          icon="check"
          foot={`${completedCount} đơn đã hoàn tất`}
        />
      </div>

      {/* Grid: Revenue Chart & Workload breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
                Doanh thu & đơn hàng
              </h3>
              <p className="text-xs text-[#8a9891] mt-0.5 mb-0">
                Tổng quan hoạt động trong tháng {new Date().getMonth() + 1}, {new Date().getFullYear()}
              </p>
            </div>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className="text-xs border border-[#e4eae6] rounded-[7px] px-3 py-1.5 bg-white text-[#55655d] outline-none cursor-pointer"
            >
              <option value="14_days">14 ngày gần nhất</option>
              <option value="7_days">7 ngày gần nhất</option>
              <option value="30_days">30 ngày gần nhất</option>
            </select>
          </div>
          {renderRevenueChart()}
          <div className="flex items-center gap-5 text-xs text-[#808f87] px-2 pt-3 border-t border-[#f0f3f1]">
            <span className="flex items-center gap-1.5">
              <i className="w-2.5 h-2.5 rounded-full bg-[#176b58]" /> Doanh thu
            </span>
            <span className="flex items-center gap-1.5">
              <i className="w-2.5 h-2.5 rounded-full bg-[#bdc9c2]" /> Đơn hoàn tất
            </span>
          </div>
        </div>

        {/* Workload */}
        <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
                Đơn theo trạng thái
              </h3>
              <p className="text-xs text-[#8a9891] mt-0.5 mb-0">
                Phân bổ {branchOrders.length} đơn trong hệ thống
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon="arrow"
              onClick={() => router.push('/repairs')}
            />
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-[30px_1fr_30px] gap-3 items-center">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-[#edf5f0] text-[#478065] grid place-items-center">
                <Icon name="search" size={15} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-[#2d3d35]">Đang kiểm tra</span>
                  <span className="text-[#7c8982]">{String(inspectingCount).padStart(2, '0')} đơn</span>
                </div>
                <div className="h-2 bg-[#f0f3f1] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#4d9877] rounded-full"
                    style={{ width: `${branchOrders.length > 0 ? (inspectingCount / branchOrders.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <b className="text-xs text-right text-[#1c302b]">{inspectingCount}</b>
            </div>

            <div className="grid grid-cols-[30px_1fr_30px] gap-3 items-center">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-[#fbf3e5] text-[#a4722f] grid place-items-center">
                <Icon name="money" size={15} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-[#2d3d35]">Chờ khách duyệt</span>
                  <span className="text-[#7c8982]">{String(waitingApprovalCount).padStart(2, '0')} đơn</span>
                </div>
                <div className="h-2 bg-[#f0f3f1] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#d2a25d] rounded-full"
                    style={{ width: `${branchOrders.length > 0 ? (waitingApprovalCount / branchOrders.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <b className="text-xs text-right text-[#1c302b]">{waitingApprovalCount}</b>
            </div>

            <div className="grid grid-cols-[30px_1fr_30px] gap-3 items-center">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-[#edf4f7] text-[#477b98] grid place-items-center">
                <Icon name="wrench" size={15} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-[#2d3d35]">Đang sửa chữa</span>
                  <span className="text-[#7c8982]">{String(repairingCount).padStart(2, '0')} đơn</span>
                </div>
                <div className="h-2 bg-[#f0f3f1] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#477b98] rounded-full"
                    style={{ width: `${branchOrders.length > 0 ? (repairingCount / branchOrders.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <b className="text-xs text-right text-[#1c302b]">{repairingCount}</b>
            </div>

            <div className="grid grid-cols-[30px_1fr_30px] gap-3 items-center">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-[#eaf4ef] text-[#28805e] grid place-items-center">
                <Icon name="check" size={15} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-[#2d3d35]">Chờ QC / trả máy</span>
                  <span className="text-[#7c8982]">{String(readyCount).padStart(2, '0')} đơn</span>
                </div>
                <div className="h-2 bg-[#f0f3f1] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#28805e] rounded-full"
                    style={{ width: `${branchOrders.length > 0 ? (readyCount / branchOrders.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <b className="text-xs text-right text-[#1c302b]">{readyCount}</b>
            </div>
          </div>
        </div>
      </div>

      {/* Khối đối chiếu vận hành & dòng tiền (Máy khách đã lấy vs Máy khách chưa lấy) */}
      <div className="bg-white rounded-[14px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <div className="text-xs font-bold text-[#819089] uppercase tracking-[1px] mb-1">
              ĐỐI SOÁT VẬN HÀNH & DÒNG TIỀN
            </div>
            <h3 className="font-heading font-bold text-lg text-[#1c302b] m-0">
              Đối chiếu máy khách đã lấy vs chưa lấy
            </h3>
            <p className="text-xs text-[#7e8d85] mt-0.5 mb-0">
              Cán cân doanh thu thực thu so với dòng tiền chờ thu tại quầy và thiết bị đang xử lý trong xưởng.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#eaf4ef] text-[#176b58]">
              <span className="w-2 h-2 rounded-full bg-[#176b58]" />
              Tổng quan toàn quầy
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* CỘT 1: Calm Jade - Máy khách đã lấy (Đã bàn giao) */}
          <div className="bg-[#f2f8f5] border border-[#c5e1d4] rounded-[12px] p-5 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-28 h-28 bg-[#176b58]/5 rounded-bl-full pointer-events-none" />
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#176b58] bg-white px-2.5 py-1 rounded-full border border-[#c5e1d4]">
                  🟢 Máy khách đã lấy (Đã bàn giao)
                </span>
                <span className="text-xs text-[#627a6f] font-medium">Hoàn tất quy trình</span>
              </div>

              <div className="mt-2 mb-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl md:text-4xl font-heading font-extrabold text-[#176b58]">
                    {reconciliation.handed_over_count}
                  </span>
                  <span className="text-sm font-semibold text-[#406856]">máy đã giao khách</span>
                </div>
                <div className="mt-3 p-3 bg-white/80 rounded-[9px] border border-[#d2e8dd]">
                  <div className="text-xs text-[#657d72] mb-0.5 font-medium">Doanh thu thực thu:</div>
                  <div className="text-xl md:text-2xl font-heading font-bold text-[#145747]">
                    {reconciliation.handed_over_revenue_formatted}
                  </div>
                  <div className="text-[11px] text-[#718b7f] mt-1">
                    Đã thanh toán đủ (tại quầy VietQR/tiền mặt & COD giao thành công)
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#d5eadf]">
              <button
                type="button"
                onClick={() => router.push('/repairs?status=completed')}
                className="w-full py-2.5 px-3 bg-[#176b58] hover:bg-[#135a4a] text-white text-xs font-bold rounded-[8px] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>Xem danh sách máy đã bàn giao</span>
                <Icon name="arrow" size={14} />
              </button>
            </div>
          </div>

          {/* CỘT 2: Warm Ivory / Amber - Máy khách chưa lấy (Tại cửa hàng) */}
          <div className="bg-[#fcfaf5] border border-[#ebd9bd] rounded-[12px] p-5 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-28 h-28 bg-[#d2a25d]/5 rounded-bl-full pointer-events-none" />
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#915e1b] bg-white px-2.5 py-1 rounded-full border border-[#ebd9bd]">
                  🟡 Máy khách chưa lấy (Tại cửa hàng)
                </span>
                <span className="text-xs text-[#8c7456] font-medium">
                  {reconciliation.ready_for_pickup_count + reconciliation.in_workshop_count} máy tồn tại shop
                </span>
              </div>

              {/* 2 Mục phân rã */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 mb-4">
                {/* Mục 1: Đã sửa xong chờ lấy */}
                <div className="p-3.5 bg-white rounded-[9px] border border-[#eddcc4] shadow-2xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-[#915e1b]">Đã sửa xong chờ lấy</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#fbf3e5] text-[#915e1b]">
                      {reconciliation.ready_for_pickup_count} máy
                    </span>
                  </div>
                  <div className="text-xs text-[#7e8e86] mb-0.5">Tiền chờ thu tại quầy:</div>
                  <div className="text-lg font-heading font-bold text-[#915e1b]">
                    {reconciliation.ready_for_pickup_amount_formatted}
                  </div>
                  <div className="text-[11px] text-[#a48a6e] mt-1">
                    Trạng thái: Sẵn sàng trả / Chờ nhận
                  </div>
                </div>

                {/* Mục 2: Đang sửa trong xưởng */}
                <div className="p-3.5 bg-white rounded-[9px] border border-[#e5ece8] shadow-2xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-[#2d3d35]">Đang sửa trong xưởng</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#edf5f0] text-[#176b58]">
                      {reconciliation.in_workshop_count} máy
                    </span>
                  </div>
                  <div className="text-xs text-[#7e8e86] mb-0.5">Giá trị tạm tính:</div>
                  <div className="text-lg font-heading font-bold text-[#2d3d35]">
                    {reconciliation.in_workshop_amount_formatted}
                  </div>
                  <div className="text-[11px] text-[#7e8e86] mt-1">
                    Đang khám / chờ linh kiện / sửa / QC
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#ede2ce]">
              <button
                type="button"
                onClick={() => router.push('/repairs')}
                className="w-full py-2.5 px-3 bg-[#f5ede0] hover:bg-[#ece2d1] text-[#7a4e16] text-xs font-bold rounded-[8px] transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-[#ebd9bd]"
              >
                <span>Xem danh sách đơn chưa giao tại shop</span>
                <Icon name="arrow" size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders table preview */}
      <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
              Đơn sửa chữa gần đây
            </h3>
            <span className="text-xs text-[#7e8e86] bg-[#f0f4f2] px-2.5 py-0.5 rounded-[10px] font-medium">
              {branchOrders.slice(0, 5).length} đơn mới
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => router.push('/repairs')}>
            Xem tất cả đơn ↗
          </Button>
        </div>

        <div className="overflow-x-auto -mx-5 sm:mx-0">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#809088] uppercase tracking-wider h-9">
                <th className="px-4">Mã đơn</th>
                <th className="px-4">Khách hàng</th>
                <th className="px-4">Thiết bị</th>
                <th className="px-4">Trạng thái</th>
                <th className="px-4">Chi phí</th>
                <th className="px-4">Kỹ thuật</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f2] text-sm">
              {branchOrders.slice(0, 5).map((o, i) => (
                <tr
                  key={o.id}
                  onClick={() => router.push('/repairs')}
                  className="h-12 hover:bg-[#fafcfa] cursor-pointer transition-colors"
                >
                  <td className="px-4 font-mono font-bold text-[#176b58]">{o.id}</td>
                  <td className="px-4">
                    <div className="flex items-center gap-2">
                      <Avatar initials={o.name} variant={(i % 4) as any} size="sm" />
                      <span className="font-semibold text-[#273730]">{o.name}</span>
                    </div>
                  </td>
                  <td className="px-4 font-medium text-[#4b5b53]">{o.device}</td>
                  <td className="px-4">
                    <StatusTag label={o.status} type={o.statusType} />
                  </td>
                  <td className="px-4 font-semibold text-[#405048]">{moneyFormatted(o.price)}</td>
                  <td className="px-4 text-[#667770]">{o.tech}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick shortcuts */}
      <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
        <h3 className="font-heading font-bold text-base text-[#1c302b] mb-4">
          Thao tác nhanh
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => setIntakeModalOpen(true)}
            className="p-3.5 rounded-[10px] border border-[#edf1ee] bg-white hover:bg-[#f7faf8] hover:border-[#b4d6c4] flex items-center gap-3 text-left transition-all"
          >
            <div className="w-9 h-9 rounded-[8px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none">
              <Icon name="plus" size={18} />
            </div>
            <div>
              <b className="text-sm text-[#1c302b] block font-bold">Tạo đơn mới</b>
              <small className="text-xs text-[#87968f]">Tiếp nhận thiết bị</small>
            </div>
          </button>

          <button
            onClick={() => router.push('/qc')}
            className="p-3.5 rounded-[10px] border border-[#edf1ee] bg-white hover:bg-[#f7faf8] hover:border-[#b4d6c4] flex items-center gap-3 text-left transition-all"
          >
            <div className="w-9 h-9 rounded-[8px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none">
              <Icon name="check" size={18} />
            </div>
            <div>
              <b className="text-sm text-[#1c302b] block font-bold">Kiểm định QC</b>
              <small className="text-xs text-[#87968f]">Thẩm định chất lượng</small>
            </div>
          </button>

          <button
            onClick={() => router.push('/track')}
            className="p-3.5 rounded-[10px] border border-[#edf1ee] bg-white hover:bg-[#f7faf8] hover:border-[#b4d6c4] flex items-center gap-3 text-left transition-all"
          >
            <div className="w-9 h-9 rounded-[8px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none">
              <Icon name="search" size={18} />
            </div>
            <div>
              <b className="text-sm text-[#1c302b] block font-bold">Tra cứu đơn</b>
              <small className="text-xs text-[#87968f]">Dành cho khách hàng</small>
            </div>
          </button>

          <button
            onClick={() => router.push('/devices')}
            className="p-3.5 rounded-[10px] border border-[#edf1ee] bg-white hover:bg-[#f7faf8] hover:border-[#b4d6c4] flex items-center gap-3 text-left transition-all"
          >
            <div className="w-9 h-9 rounded-[8px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none">
              <Icon name="device" size={18} />
            </div>
            <div>
              <b className="text-sm text-[#1c302b] block font-bold">Cấu hình máy</b>
              <small className="text-xs text-[#87968f]">Checklist động</small>
            </div>
          </button>
        </div>
      </div>
    </div>
  );

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
            Chào buổi sáng, {currentUser?.name || 'Nhân viên'} 👋
          </h1>
          <p className="text-sm text-[#7e8d85] mt-1 mb-0">
            Bảng công việc CSKH · Tập trung tiếp nhận, báo giá và chăm sóc khách hàng.
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          icon="plus"
          onClick={() => setIntakeModalOpen(true)}
        >
          Tiếp nhận khách mới
        </Button>
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
          label="Chờ khách phản hồi"
          value={String(waitingApprovalCount).padStart(2, '0')}
          icon="clock"
          foot="Cần nhắc khách duyệt"
          trend="down"
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
          {cskhPendingOrders.slice(0, 6).map((o) => (
            <div
              key={o.id}
              onClick={() => router.push('/repairs')}
              className="py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-[#fafcfa] cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[10px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none">
                  <Icon name="device" size={19} />
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
                <Button variant="secondary" size="sm">
                  Mở phiếu ↗
                </Button>
              </div>
            </div>
          ))}
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
          <span>🔧 Đơn của tôi</span>
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
          <span>⚡ Đơn chờ nhận</span>
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
          <span>✓ Đã sửa xong</span>
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
                        {order.price ? (
                          <div className="flex items-center justify-between pt-1 border-t border-[#f0f3f1]">
                            <span className="text-[#809088]">Báo giá:</span>
                            <b className="text-[#176b58] font-bold">{moneyFormatted(order.price)}</b>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div
                      className="pt-4 mt-3 border-t border-[#f0f3f1] flex flex-wrap gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isSilentPrinting}
                        onClick={() => handlePrintRoutingSlip(order)}
                        className="px-2.5 text-xs text-[#176b58] border-[#c4ded0] hover:bg-[#eef6f2]"
                        title="In nhanh tem dán khay K80"
                      >
                        🖨️ Tem
                      </Button>

                      {isWaitingParts ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleResumeRepair(order)}
                          className="text-xs font-semibold"
                        >
                          ▶ Tiếp tục
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePauseWaitingParts(order)}
                          className="text-xs text-[#708078] border-[#d6dfda]"
                          title="Tạm dừng chờ linh kiện"
                        >
                          ⏸ Linh kiện
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
                        ✓ Hoàn thành
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
                actionLabel={`⚡ Xem đơn chờ nhận ngay (${techAvailableOrders.length})`}
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
                      ⚡ Nhận đơn →
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
                      <span className="font-bold text-[#176b58] block mb-0.5">✓ Nghiệm thu hoàn tất:</span>
                      {order.repairNote || 'Đã sửa chữa và kiểm tra hoàn chỉnh theo tiêu chuẩn xuất xưởng.'}
                    </div>

                    <div className="space-y-1 text-xs text-[#52635a]">
                      <div className="flex items-center justify-between">
                        <span className="text-[#809088]">Khách hàng:</span>
                        <b className="text-[#1c302b]">{order.name} ({order.phone})</b>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#809088]">Chi phí:</span>
                        <b className="text-[#176b58] font-bold">{moneyFormatted(order.price)}</b>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-3 border-t border-[#f0f3f1] flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSilentPrinting}
                      onClick={() => handlePrintRoutingSlip(order)}
                      className="px-2.5 text-xs text-[#176b58] border-[#c4ded0] hover:bg-[#eef6f2]"
                    >
                      🖨️ In tem K80
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
          {cskhPendingOrders.map((o) => (
            <div
              key={o.id}
              className="p-3.5 bg-white rounded-[10px] border border-[#e5ece8] flex flex-col gap-2"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <b className="text-sm text-[#1c302b]">{o.device}</b>
                  <span className="font-mono text-xs text-[#176b58] font-bold">{o.id}</span>
                </div>
                <StatusTag label={o.status} type={o.statusType} />
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
          ))}
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
    </AppShell>
  );
}
