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
} from '@podscare/ui';
import { AppShell } from './components/AppShell';
import { IntakeWizardModal } from './components/IntakeWizardModal';
import { usePodsCare } from './providers';
import type { RepairOrder } from '@podscare/types';
import { kpiService, repairService } from '@podscare/api-client';
import { useQuery } from '@tanstack/react-query';

export default function DashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { role, currentUser, orders, updateOrder, branchId, branch, invalidateOrders } = usePodsCare();

  const [intakeModalOpen, setIntakeModalOpen] = useState(false);
  const [cskhPendingModalOpen, setCskhPendingModalOpen] = useState(false);
  const [period, setPeriod] = useState<'7_days' | '14_days' | '30_days'>('14_days');

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
  const techActiveOrders = branchOrders.filter(
    (o) =>
      o.tech === currentUser.name &&
      !['Hoàn tất kỹ thuật', 'Chờ QC', 'Sẵn sàng trả', 'Hoàn tất'].includes(o.status)
  );

  const techAvailableOrders = branchOrders.filter(
    (o) =>
      o.tech === 'Chưa phân công' &&
      ['Đã duyệt', 'Chờ kỹ thuật', 'Tiếp nhận mới'].includes(o.status)
  );

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
      ? (branchRevenue / 1000000).toFixed(1).replace('.', ',') + 'tr'
      : new Intl.NumberFormat('vi-VN').format(branchRevenue) + ' ₫');

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
            PODSCARE · TỔNG QUAN
          </div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#1c302b] m-0">
            Chào buổi sáng, {currentUser.name} 👋
          </h1>
          <p className="text-sm text-[#7e8d85] mt-1 mb-0">
            Đây là tình hình vận hành PodsCare hôm nay tại {branch || currentUser.branch}.
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <StatCard
          label="Đơn đang xử lý"
          value={activeOrdersCount}
          icon="clock"
          foot="↑ 12,8%"
          trend="up"
        />
        <StatCard
          label="Tiếp nhận hôm nay"
          value={String(todayOrdersCount).padStart(2, '0')}
          icon="plus"
          foot="↑ 8,3%"
          trend="up"
        />
        <StatCard
          label="Doanh thu tháng"
          value={branchRevenueDisplay}
          icon="payments"
          foot="↑ 18,2%"
          trend="up"
        />
        <StatCard
          label="Tỷ lệ hoàn thành"
          value={completionRateDisplay}
          icon="check"
          foot="↑ 2,4%"
          trend="up"
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
                Tổng quan hoạt động trong tháng 9, 2026
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
            Chào buổi sáng, {currentUser.name} 👋
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
          <div className="text-xs font-bold text-[#819089] uppercase tracking-[1.05px] mb-1">
            TECHNICIAN OS
          </div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#1c302b] m-0">
            Không gian kỹ thuật
          </h1>
          <p className="text-sm text-[#7e8d85] mt-1 mb-0">
            Xin chào {currentUser.name} · Đây là danh sách việc cần xử lý trong ca hôm nay.
          </p>
        </div>
        <Button variant="primary" size="md" icon="wrench" onClick={() => router.push('/tech')}>
          Mở toàn bộ hàng đợi KTV ↗
        </Button>
      </div>

      {/* Tech Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <StatCard
          label="Đơn đang phụ trách"
          value={String(techActiveOrders.length).padStart(2, '0')}
          icon="wrench"
          foot="Trong ca hiện tại"
        />
        <StatCard
          label="Đơn chờ nhận"
          value={String(techAvailableOrders.length).padStart(2, '0')}
          icon="plus"
          foot="Có phiếu CSKH kèm theo"
        />
        <StatCard
          label="Đang sửa chữa"
          value={String(
            techActiveOrders.filter((o) => o.status === 'Đang sửa').length
          ).padStart(2, '0')}
          icon="clock"
          foot="Cập nhật theo phiếu"
        />
        <StatCard
          label="Đã sửa xong hôm nay"
          value={String(
            branchOrders.filter(
              (o) =>
                o.tech === currentUser.name &&
                ['Chờ QC', 'Sẵn sàng trả', 'Hoàn tất'].includes(o.status)
            ).length
          ).padStart(2, '0')}
          icon="check"
          foot="Chờ QC tiếp nhận"
        />
      </div>

      {/* Section: Đơn mới chờ nhận preview */}
      <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
            Đơn mới sẵn sàng nhận ({techAvailableOrders.length})
          </h3>
          <Button variant="secondary" size="sm" onClick={() => router.push('/tech')}>
            Xem tất cả ↗
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {techAvailableOrders.slice(0, 3).map((o) => (
            <div
              key={o.id}
              className="bg-white border border-[#e5ece8] rounded-[10px] p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="font-mono font-bold text-xs text-[#176b58]">{o.id}</span>
                  <StatusTag label={o.status} type={o.statusType} />
                </div>
                <b className="font-heading text-sm text-[#1c302b] block font-bold">{o.device}</b>
                <p className="text-xs text-[#708078] my-2">{o.issue}</p>
              </div>
              <Button
                variant="primary"
                size="sm"
                className="w-full mt-2"
                onClick={async () => {
                  try {
                    await repairService.transition(o.id, { transition: 'assigned' });
                    if (invalidateOrders) await invalidateOrders();
                  } catch {
                    const updated: RepairOrder = {
                      ...o,
                      tech: currentUser.name,
                      status: 'Đã nhận đơn',
                      statusType: 'progress',
                    };
                    updateOrder(updated);
                  }
                  toast(`Bạn đã nhận đơn ${o.id}`, 'success');
                }}
              >
                Nhận đơn →
              </Button>
            </div>
          ))}
        </div>
      </div>
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
    </AppShell>
  );
}
