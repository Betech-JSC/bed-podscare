'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { repairService } from '@podscare/api-client';
import {
  Button,
  StatusTag,
  StatCard,
  useToast,
  EmptyState,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { TechOrderDetailModal } from '../components/TechOrderDetailModal';
import { HandoverTechModal } from '../components/HandoverTechModal';
import { usePodsCare } from '../providers';
import type { RepairOrder } from '@podscare/types';
import { normalizeStatusCode } from '../repairs/fsm';
import { useSilentPrint } from '../components/print';

export default function TechnicianQueuePage() {
  const { toast } = useToast();
  const {
    orders,
    currentUser,
    branch,
    branchId,
    setBranch,
    branches,
    role,
    invalidateOrders,
    updateOrder,
  } = usePodsCare();

  const [dateFilter, setDateFilter] = useState<'today' | '3_days'>('today');
  const [activeTab, setActiveTab] = useState<'my_orders' | 'available' | 'completed'>('my_orders');
  const [selectedOrder, setSelectedOrder] = useState<RepairOrder | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [handoverOrderTarget, setHandoverOrderTarget] = useState<RepairOrder | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { printReceipt, isPrinting: isSilentPrinting } = useSilentPrint();

  // Nạp đơn hàng theo phạm vi thời gian (ca làm việc) của kỹ thuật viên
  const {
    data: apiOrdersData,
    refetch,
  } = useQuery({
    queryKey: ['tech-orders', branchId, dateFilter],
    queryFn: async () => {
      const params: Record<string, any> = { per_page: 50, date_filter: dateFilter };
      if (branchId && branchId !== 'all') {
        params.branch_id = branchId;
      }
      const res = await repairService.getRepairs(params);
      return res?.data || res;
    },
  });

  const handlePrintRoutingSlip = async (order: RepairOrder) => {
    toast(`Đang gửi lệnh in tem khay K80 cho đơn ${order.id}...`, 'info');
    await printReceipt(order, 'k80', true);
  };

  const handleOpenHandoverModal = (order: RepairOrder) => {
    setHandoverOrderTarget(order);
    setHandoverModalOpen(true);
  };

  const techName = currentUser?.name || 'Kỹ thuật viên';
  const branchString = typeof branch === 'string' ? branch : ((branch as any)?.name || 'Chi nhánh FIXO');
  const displayBranchText = branchString.startsWith('FIXO') ? branchString : `FIXO · ${branchString}`;

  const moneyFormatted = (n: number) =>
    n ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫' : '—';

  const mappedApiOrders: RepairOrder[] = useMemo(() => {
    const raw = apiOrdersData?.data || apiOrdersData;
    if (!Array.isArray(raw)) {
      return orders || [];
    }
    const statusMap: Record<string, { label: string; type: any }> = {
      inspecting: { label: 'Đang kiểm tra', type: 'progress' },
      waiting_approval: { label: 'Chờ khách duyệt', type: 'wait' },
      waiting_tech: { label: 'Chờ kỹ thuật', type: 'new' },
      assigned: { label: 'Đã nhận đơn', type: 'wait' },
      in_repair: { label: 'Đang sửa', type: 'progress' },
      waiting_parts: { label: 'Chờ linh kiện', type: 'wait' },
      rework_needed: { label: 'Cần sửa lại', type: 'danger' },
      waiting_qc: { label: 'Chờ QC', type: 'ready' },
      qc_pending: { label: 'Chờ QC', type: 'ready' },
      ready_for_return: { label: 'Sẵn sàng trả', type: 'ready' },
      waiting_pickup: { label: 'Chờ khách nhận', type: 'ready' },
      completed: { label: 'Hoàn tất', type: 'gray' },
      rejected: { label: 'Từ chối sửa', type: 'danger' },
      cancelled: { label: 'Đã hủy', type: 'gray' },
    };
    return raw.map((o: any) => {
      const rawStatus = o.status === 'qc_pending' ? 'waiting_qc' : o.status;
      const mappedStatus = statusMap[rawStatus] || statusMap[o.status] || {
        label: o.status || 'Tiếp nhận mới',
        type: 'wait',
      };
      return {
        id: o.order_code || String(o.id),
        order_type: o.order_type || o.orderType || 'in_store',
        orderType: o.order_type || o.orderType || 'in_store',
        name: o.customer?.name || 'Khách lẻ',
        phone: o.customer?.phone || '',
        deviceCategory: o.device_model?.category || 'AirPods',
        device: o.device_model?.name || 'AirPods',
        serial: o.serial_number || 'Chưa cập nhật',
        issue: o.issue_description || 'Kiểm tra',
        status: mappedStatus.label,
        statusType: mappedStatus.type,
        price: Number(o.total_price) || Number(o.estimated_price) || 0,
        total_price: Number(o.total_price) || Number(o.price) || 0,
        initial_price: o.initial_price !== null && o.initial_price !== undefined ? Number(o.initial_price) : (Number(o.total_price) || Number(o.price) || 0),
        initialPrice: o.initial_price !== null && o.initial_price !== undefined ? Number(o.initial_price) : (Number(o.total_price) || Number(o.price) || 0),
        additional_services: Array.isArray(o.additional_services) ? o.additional_services : (Array.isArray(o.additionalServices) ? o.additionalServices : []),
        additionalServices: Array.isArray(o.additional_services) ? o.additional_services : (Array.isArray(o.additionalServices) ? o.additionalServices : []),
        device_model_id: o.device_model_id || o.device_model?.id || null,
        tech: o.technician?.name || 'Chưa phân công',
        technicianId: o.technician_id ?? o.technician?.id ?? null,
        technician_id: o.technician_id ?? o.technician?.id ?? null,
        date: o.created_at
          ? new Intl.DateTimeFormat('vi-VN').format(new Date(o.created_at))
          : 'Hôm nay',
        branch: o.branch?.name || 'Chi nhánh FIXO',
        branchId: o.branch_id || o.branch?.id || 1,
        branchName: o.branch?.name || 'Chi nhánh FIXO',
        accessories: o.accessories,
        appearance: o.appearance_notes,
        testNote: o.test_note || o.testNote || (Array.isArray(o.intake_checklists) ? o.intake_checklists.find((c: any) => c.note)?.note : '') || '',
        test_note: o.test_note || o.testNote || '',
        repairNote: o.repair_note,
        partsUsed: o.parts_used_summary,
        parts_needed: o.parts_needed,
        partsNeeded: o.parts_needed,
        paused_at: o.paused_at,
        pausedAt: o.paused_at,
        finalCheck: o.final_check_result,
        qcIssue: o.qc_note,
        acceptedAt: o.tech_accepted_at,
        startedAt: o.repair_started_at,
        completedAt: o.repair_completed_at,
        customerApprovedAt: o.customer_approved_at,
        createdAt: o.created_at,
        intake_batch_code: o.intake_batch_code,
        batchOrders: o.batch_orders || o.batchOrders,
      };
    });
  }, [apiOrdersData, orders]);

  // Lọc danh sách đơn theo chi nhánh được phân công hoặc chi nhánh đang chọn
  const branchFilteredOrders = useMemo(() => {
    if (branchId === 'all' || branchId === undefined || branchId === null) {
      return mappedApiOrders;
    }
    const branchString = typeof branch === 'string' ? branch : ((branch as any)?.name || '');
    return mappedApiOrders.filter((o) => {
      const matchId = o.branchId !== undefined && String(o.branchId) === String(branchId);
      const matchName = o.branch && branchString ? o.branch.includes(branchString) || branchString.includes(o.branch) : false;
      return matchId || matchName;
    });
  }, [mappedApiOrders, branch, branchId]);

  // 1. Hàng đợi máy mới (Live Dispatch): Các đơn waiting_tech chưa có Kỹ Thuật nhận
  const availableOrders = useMemo(() => {
    return branchFilteredOrders.filter((o) => {
      const code = normalizeStatusCode(o.status);
      const isUnassigned = !o.technicianId && !o.technician_id;
      return (
        isUnassigned &&
        (code === 'waiting_tech' || ['Chờ kỹ thuật', 'Đã duyệt', 'Tiếp nhận mới'].includes(o.status))
      );
    });
  }, [branchFilteredOrders]);

  // 2. Máy Kỹ Thuật đang sửa: Các đơn in_repair, waiting_parts, rework_needed do Kỹ Thuật phụ trách
  const myActiveOrders = useMemo(() => {
    return branchFilteredOrders.filter((o) => {
      const code = normalizeStatusCode(o.status);
      const isMyOrder =
        currentUser?.role === 'admin' ||
        (currentUser?.id !== undefined &&
          currentUser?.id !== null &&
          Number(o.technicianId || o.technician_id) === Number(currentUser.id));
      return (
        isMyOrder &&
        ['in_repair', 'waiting_parts', 'rework_needed', 'assigned'].includes(code)
      );
    });
  }, [branchFilteredOrders, currentUser?.id, currentUser?.role]);

  // 3. Đã hoàn thành hôm nay: Các đơn do Kỹ Thuật phụ trách đã chuyển sang ready_for_return, waiting_pickup, completed
  const myCompletedTodayOrders = useMemo(() => {
    return branchFilteredOrders.filter((o) => {
      const code = normalizeStatusCode(o.status);
      const isMyOrder =
        currentUser?.role === 'admin' ||
        (currentUser?.id !== undefined &&
          currentUser?.id !== null &&
          Number(o.technicianId || o.technician_id) === Number(currentUser.id));
      return (
        isMyOrder &&
        ['ready_for_return', 'waiting_pickup', 'completed', 'waiting_qc'].includes(code)
      );
    });
  }, [branchFilteredOrders, currentUser?.id, currentUser?.role]);

  // Đếm đơn đang thao tác sửa
  const inRepairCount = useMemo(() => {
    return myActiveOrders.filter(
      (o) => normalizeStatusCode(o.status) === 'in_repair' || o.status === 'Đang sửa'
    ).length;
  }, [myActiveOrders]);

  // Hành động Tiếp nhận máy (Grab-style live dispatch: waiting_tech -> in_repair)
  const handleGrabOrder = async (order: RepairOrder) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await repairService.transition(order.id, {
        transition: 'in_repair',
        status: 'Đang sửa',
        technician_id: currentUser?.id,
      });
      await invalidateOrders();
      refetch();
      toast(`⚡ Bạn đã nhận máy ${order.id} thành công! Đơn chuyển vào Đơn của tôi.`, 'success');
      setActiveTab('my_orders');
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
      toast(`⚡ Bạn đã nhận máy ${order.id} thành công! Đơn chuyển vào Đơn của tôi.`, 'success');
      setActiveTab('my_orders');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mở modal xem chi tiết & nghiệm thu
  const handleOpenDetailModal = (order: RepairOrder) => {
    setSelectedOrder(order);
    setDetailModalOpen(true);
  };

  // Bắt đầu sửa chữa (assigned / rework_needed -> in_repair)
  const handleStartRepair = async (order: RepairOrder) => {
    try {
      await repairService.transition(order.id, { transition: 'in_repair', status: 'Đang sửa' });
      await invalidateOrders();
      refetch();
      toast(`⚡ Đã bắt đầu sửa chữa đơn ${order.id}`, 'success');
    } catch {
      updateOrder({ ...order, status: 'Đang sửa', statusType: 'progress' });
      toast(`⚡ Đã bắt đầu sửa chữa đơn ${order.id}`, 'success');
    }
  };

  // Chuyển tạm dừng chờ linh kiện
  const handlePauseWaitingParts = async (order: RepairOrder) => {
    try {
      await repairService.transition(order.id, { transition: 'waiting_parts', status: 'Chờ linh kiện' });
      await invalidateOrders();
      refetch();
      toast(`Đã tạm dừng đơn ${order.id} chờ linh kiện`, 'info');
    } catch {
      updateOrder({ ...order, status: 'Chờ linh kiện', statusType: 'wait' });
      toast(`Đã tạm dừng đơn ${order.id} chờ linh kiện`, 'info');
    }
  };

  // Tiếp tục sửa chữa từ chờ linh kiện
  const handleResumeRepair = async (order: RepairOrder) => {
    try {
      await repairService.transition(order.id, { transition: 'in_repair', status: 'Đang sửa' });
      await invalidateOrders();
      refetch();
      toast(`Đã tiếp tục sửa chữa đơn ${order.id}`, 'success');
    } catch {
      updateOrder({ ...order, status: 'Đang sửa', statusType: 'progress' });
      toast(`Đã tiếp tục sửa chữa đơn ${order.id}`, 'success');
    }
  };

  return (
    <AppShell crumbName="Không gian kỹ thuật">
      <div className="space-y-6">
        {/* Page Head */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#819089] uppercase tracking-[1.05px] mb-1 flex items-center gap-2">
              <span>TECHNICIAN WORKSPACE</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#176b58]" />
              <span className="text-[#176b58] font-bold">
                {branchId === 'all' ? 'Toàn bộ chi nhánh' : branchString}
              </span>
            </div>
            <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#1c302b] m-0">
              Không gian Kỹ thuật viên
            </h1>
            <p className="text-sm text-[#7e8d85] mt-1 mb-0">
              Xin chào {techName} · Tiếp nhận máy từ quầy CSKH {branchId === 'all' ? 'toàn chuỗi' : branchString}, sửa chữa và hoàn tất bàn giao tức thì.
            </p>
          </div>
          {role === 'admin' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#7c8b84] font-medium hidden sm:inline">Chi nhánh trực:</span>
              <select
                value={String(branchId || 'all')}
                onChange={(e) => {
                  const b = branches.find((item) => String(item.id) === e.target.value);
                  if (b) setBranch(b.name, b.id);
                }}
                className="h-9 border border-[#d6dfda] rounded-[8px] px-2.5 text-xs text-[#1c302b] bg-[#f9fbf9] font-medium outline-none focus:border-[#75a994] cursor-pointer"
              >
                <option value="all">🏢 Tất cả chi nhánh</option>
                {branches
                  .filter((b) => b.id !== 'all')
                  .map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      📍 {b.name} ({b.code})
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-9 border border-[#d6dfda] rounded-[8px] px-3 text-xs text-[#176b58] bg-[#eaf4ef] font-semibold flex items-center gap-1.5 cursor-default select-none pointer-events-none">
                <span>
                  Chi nhánh trực: {displayBranchText}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 4 Thẻ KPI tương tác chuyển Tab */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <StatCard
            label="Đơn đang phụ trách"
            value={String(myActiveOrders.length).padStart(2, '0')}
            icon="wrench"
            foot="Trong ca hiện tại"
            onClick={() => setActiveTab('my_orders')}
            className={`cursor-pointer transition-all ${
              activeTab === 'my_orders'
                ? 'border-[#176b58] ring-2 ring-[#176b58]/20 bg-[#f7faf8]'
                : 'hover:border-[#b4d6c4]'
            }`}
          />

          <StatCard
            label="Đơn chờ nhận"
            value={String(availableOrders.length).padStart(2, '0')}
            icon="plus"
            foot="Có phiếu CSKH kèm theo"
            onClick={() => setActiveTab('available')}
            className={`cursor-pointer transition-all ${
              activeTab === 'available'
                ? 'border-[#176b58] ring-2 ring-[#176b58]/20 bg-[#f7faf8]'
                : 'hover:border-[#b4d6c4]'
            }`}
          />

          <StatCard
            label="Đang sửa chữa"
            value={String(inRepairCount).padStart(2, '0')}
            icon="clock"
            foot="Cập nhật theo phiếu"
            onClick={() => setActiveTab('my_orders')}
            className={`cursor-pointer transition-all ${
              activeTab === 'my_orders'
                ? 'border-[#176b58] ring-2 ring-[#176b58]/20 bg-[#f7faf8]'
                : 'hover:border-[#b4d6c4]'
            }`}
          />

          <StatCard
            label="Đã sửa xong hôm nay"
            value={String(myCompletedTodayOrders.length).padStart(2, '0')}
            icon="check"
            foot="Sẵn sàng bàn giao CSKH"
            onClick={() => setActiveTab('completed')}
            className={`cursor-pointer transition-all ${
              activeTab === 'completed'
                ? 'border-[#176b58] ring-2 ring-[#176b58]/20 bg-[#f7faf8]'
                : 'hover:border-[#b4d6c4]'
            }`}
          />
        </div>

        {/* Date Filter Pills (Technician Scope: Đúng 2 nút - Hôm nay & 3 ngày qua) */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#e5ece8] rounded-[10px] p-2.5 px-3.5 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#5c6e64] uppercase tracking-wider flex items-center gap-1.5">
              <span>Phạm vi ca:</span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="tech-date-filter-today"
                onClick={() => setDateFilter('today')}
                className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  dateFilter === 'today'
                    ? 'bg-[#176b58] text-white shadow-xs'
                    : 'bg-[#f4f7f5] text-[#556960] hover:bg-[#eaf0ec]'
                }`}
              >
                <span>☀️ Hôm nay</span>
              </button>
              <button
                type="button"
                data-testid="tech-date-filter-3_days"
                onClick={() => setDateFilter('3_days')}
                className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  dateFilter === '3_days'
                    ? 'bg-[#176b58] text-white shadow-xs'
                    : 'bg-[#f4f7f5] text-[#556960] hover:bg-[#eaf0ec]'
                }`}
              >
                <span>⏱️ 3 ngày qua (Tối đa 3 ngày)</span>
              </button>
            </div>
          </div>
          <div className="text-[11px] text-[#6b7d74] flex items-center gap-1.5">
            {dateFilter === 'today' ? (
              <span className="text-[#176b58] bg-[#eaf4ef] px-2 py-0.5 rounded font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#176b58] animate-pulse" />
                Đơn ca hôm nay & các đơn dở dang tồn lại
              </span>
            ) : (
              <span className="text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded font-medium flex items-center gap-1.5 border border-[#cbe3d6]">
                <span>💡</span>
                <span>Chọn &quot;3 ngày qua&quot; để xem lại các máy nhận từ hôm qua, hôm kia và bấm Hoàn thành sửa chữa.</span>
              </span>
            )}
          </div>
        </div>

        {/* 3 Tab Navigation Bar */}
        <div className="flex items-center gap-2 border-b border-[#e5ece8] pb-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('my_orders')}
            className={`px-4 py-2.5 rounded-[8px] font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'my_orders'
                ? 'bg-[#176b58] text-white shadow-xs'
                : 'bg-white text-[#52635a] hover:bg-[#f0f4f2] border border-[#e5ece8]'
            }`}
          >
            <span>🔧 Đơn của tôi</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                activeTab === 'my_orders'
                  ? 'bg-white/20 text-white'
                  : 'bg-[#eaf4ef] text-[#176b58]'
              }`}
            >
              {myActiveOrders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('available')}
            className={`px-4 py-2.5 rounded-[8px] font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'available'
                ? 'bg-[#176b58] text-white shadow-xs'
                : 'bg-white text-[#52635a] hover:bg-[#f0f4f2] border border-[#e5ece8]'
            }`}
          >
            <span>⚡ Đơn chờ nhận</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                activeTab === 'available'
                  ? 'bg-white/20 text-white'
                  : 'bg-[#eaf4ef] text-[#176b58]'
              }`}
            >
              {availableOrders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`px-4 py-2.5 rounded-[8px] font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'completed'
                ? 'bg-[#176b58] text-white shadow-xs'
                : 'bg-white text-[#52635a] hover:bg-[#f0f4f2] border border-[#e5ece8]'
            }`}
          >
            <span>✓ Đã sửa xong hôm nay</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                activeTab === 'completed'
                  ? 'bg-white/20 text-white'
                  : 'bg-[#eaf4ef] text-[#176b58]'
              }`}
            >
              {myCompletedTodayOrders.length}
            </span>
          </button>
        </div>

        {/* Tab Content 1: ĐƠN CỦA TÔI */}
        {activeTab === 'my_orders' && (
          <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-heading font-bold text-base text-[#1c302b] m-0">
                  Máy tôi đang phụ trách ({myActiveOrders.length})
                </h2>
                <p className="text-xs text-[#809088] mt-0.5 mb-0">
                  Các đơn máy bạn đang trực tiếp phụ trách. Bấm vào đơn hoặc nút [✓ Hoàn tất] để mở biểu mẫu nghiệm thu bàn giao CSKH.
                </p>
              </div>
              <span className="text-xs font-bold text-[#176b58] bg-[#eaf4ef] px-3 py-1 rounded-[10px]">
                {myActiveOrders.length} đơn đang sửa
              </span>
            </div>

            {myActiveOrders.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {myActiveOrders.map((order) => {
                  const code = normalizeStatusCode(order.status);
                  const isWaitingParts = code === 'waiting_parts';
                  const isAssignedOrRework = code === 'assigned' || code === 'rework_needed';

                  return (
                    <article
                      key={order.id}
                      className="bg-white border border-[#e5ece8] hover:border-[#176b58] rounded-[12px] p-5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
                      onClick={() => handleOpenDetailModal(order)}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-sm text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded-[6px]">
                            {order.id}
                          </span>
                          <StatusTag label={order.status} type={order.statusType} />
                        </div>

                        <div>
                          <h3 className="font-heading font-bold text-base text-[#1c302b] m-0 group-hover:text-[#176b58] transition-colors">
                            {order.device}
                          </h3>
                          {order.serial && order.serial !== 'Chưa cập nhật' && (
                            <span className="text-xs font-mono text-[#83938b] block mt-0.5">
                              SN: {order.serial}
                            </span>
                          )}
                        </div>

                        <div className="bg-[#f8faf9] border border-[#e5ece8] rounded-[8px] p-3 text-xs text-[#3d4d45] leading-relaxed">
                          <span className="font-bold text-[#708078] block mb-1">Tình trạng lỗi:</span>
                          {order.issue}
                        </div>

                        <div className="space-y-1 text-xs text-[#52635a]">
                          <div className="flex items-center justify-between">
                            <span className="text-[#809088]">Khách hàng:</span>
                            <b className="text-[#1c302b]">{order.name} ({order.phone})</b>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[#809088]">Chi nhánh:</span>
                            <span>{order.branch}</span>
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
                          title="In nhanh tem dán khay linh kiện khổ nhiệt K80"
                        >
                          🖨️ Tem K80
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenHandoverModal(order)}
                          className="px-2.5 text-xs text-[#176b58] border-[#b8d0c5] hover:bg-[#eef6f2] font-semibold"
                          title="Bàn giao đơn cho KTV khác hoặc trả về hàng đợi chung"
                        >
                          🔄 Bàn giao
                        </Button>

                        {isWaitingParts ? (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleResumeRepair(order)}
                            className="text-xs font-bold"
                          >
                            ▶ Tiếp tục sửa
                          </Button>
                        ) : isAssignedOrRework ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleStartRepair(order)}
                              className="text-xs text-[#176b58] border-[#c4ded0] hover:bg-[#eef6f2] font-semibold"
                            >
                              ⚡ Bắt đầu sửa
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              icon="check"
                              onClick={() => handleOpenDetailModal(order)}
                              className="flex-1 font-bold text-xs bg-[#176b58] hover:bg-[#125848] text-white shadow-xs cursor-pointer"
                            >
                              ✓ Hoàn tất
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePauseWaitingParts(order)}
                              className="text-xs text-[#708078] border-[#d6dfda]"
                              title="Tạm dừng chờ linh kiện"
                            >
                              ⏸ Chờ linh kiện
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              icon="check"
                              onClick={() => handleOpenDetailModal(order)}
                              className="flex-1 font-bold text-xs bg-[#176b58] hover:bg-[#125848] text-white shadow-xs cursor-pointer"
                            >
                              ✓ Hoàn tất sửa chữa
                            </Button>
                          </>
                        )}

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenDetailModal(order)}
                          className="text-xs font-semibold"
                        >
                          Chi tiết
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
                  description="Bạn chưa nhận máy nào vào bàn sửa chữa trong ca này. Hãy chuyển sang Tab 'Đơn chờ nhận' để nhận máy từ quầy tiếp tân."
                  icon="wrench"
                  actionLabel={`⚡ Xem đơn chờ nhận (${availableOrders.length})`}
                  onAction={() => setActiveTab('available')}
                />
              </div>
            )}
          </div>
        )}

        {/* Tab Content 2: ĐƠN CHỜ NHẬN (LIVE DISPATCH) */}
        {activeTab === 'available' && (
          <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#176b58] opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[#176b58]" />
                </span>
                <div>
                  <h2 className="font-heading font-bold text-base text-[#1c302b] m-0 flex items-center gap-2">
                    Hàng đợi máy mới cần nhận (Live Dispatch)
                  </h2>
                  <p className="text-xs text-[#809088] mt-0.5 mb-0">
                    Đơn do CSKH vừa tiếp nhận tại quầy. Bấm nhận máy ngay để đưa vào bàn sửa chữa.
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-[#176b58] bg-[#eaf4ef] px-3 py-1 rounded-[10px] border border-[#d2e8dd]">
                {availableOrders.length} máy chờ nhận
              </span>
            </div>

            {availableOrders.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {availableOrders.map((order) => (
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
                        <h3 className="font-heading font-bold text-lg text-[#1c302b] m-0">
                          {order.device}
                        </h3>
                        {order.serial && order.serial !== 'Chưa cập nhật' && (
                          <span className="inline-block font-mono text-xs text-[#708078] bg-[#f4f7f5] px-2 py-0.5 rounded mt-1">
                            SN: {order.serial}
                          </span>
                        )}
                      </div>

                      <div className="bg-[#f8faf9] border border-[#e5ece8] rounded-[8px] p-3 text-xs text-[#3d4d45] leading-relaxed">
                        <span className="font-bold text-[#176b58] block mb-1">Mô tả lỗi khách báo:</span>
                        {order.issue}
                      </div>

                      <div className="space-y-1 pt-1 text-xs text-[#52635a]">
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
                            <span className="truncate max-w-[180px]">{order.accessories}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 mt-3 border-t border-[#f0f3f1] flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenDetailModal(order)}
                        className="px-3 text-xs font-semibold"
                      >
                        Xem phiếu
                      </Button>
                      <Button
                        variant="primary"
                        size="md"
                        disabled={isSubmitting}
                        onClick={() => handleGrabOrder(order)}
                        className="flex-1 h-10 font-bold text-sm bg-[#176b58] hover:bg-[#125848] text-white shadow-xs cursor-pointer active:scale-[0.98] transition-transform"
                      >
                        ⚡ Nhận máy ngay
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="py-8">
                <EmptyState
                  title="Hiện không có đơn mới chờ nhận"
                  description="Tất cả thiết bị tiếp nhận đã được phân bổ cho kỹ thuật viên. Khi có đơn mới tại quầy, chuông báo sẽ tự động phát tín hiệu."
                  icon="check"
                />
              </div>
            )}
          </div>
        )}

        {/* Tab Content 3: ĐÃ SỬA XONG HÔM NAY */}
        {activeTab === 'completed' && (
          <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-heading font-bold text-base text-[#1c302b] m-0">
                  Đã hoàn thành sửa chữa hôm nay ({myCompletedTodayOrders.length})
                </h2>
                <p className="text-xs text-[#809088] mt-0.5 mb-0">
                  Danh sách các thiết bị bạn đã nghiệm thu xong, sẵn sàng chuyển trả cho CSKH hoặc kiểm định QC.
                </p>
              </div>
              <span className="text-xs font-bold text-[#28805e] bg-[#eaf5ef] px-3 py-1 rounded-[10px]">
                {myCompletedTodayOrders.length} máy đã bàn giao
              </span>
            </div>

            {myCompletedTodayOrders.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {myCompletedTodayOrders.map((order) => (
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
                        <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
                          {order.device}
                        </h3>
                        {order.serial && order.serial !== 'Chưa cập nhật' && (
                          <span className="text-xs font-mono text-[#83938b] block mt-0.5">
                            SN: {order.serial}
                          </span>
                        )}
                      </div>

                      <div className="bg-[#f2f8f5] border border-[#d2e8dd] rounded-[8px] p-3 text-xs text-[#1e583f] leading-relaxed">
                        <span className="font-bold text-[#176b58] block mb-1">✓ Nghiệm thu hoàn tất:</span>
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
                        onClick={() => handleOpenDetailModal(order)}
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

      {/* Technician Inspection & Completion Modal */}
      <TechOrderDetailModal
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedOrder(null);
        }}
        order={selectedOrder}
        currentUser={currentUser}
        invalidateOrders={invalidateOrders}
        updateOrder={updateOrder}
        onCompleteSuccess={(updated) => {
          if (updateOrder) updateOrder(updated);
          setActiveTab('completed');
        }}
        onGrabSuccess={(claimed) => {
          if (updateOrder) updateOrder(claimed);
          setActiveTab('my_orders');
        }}
      />

      {/* Handover & Reassignment Modal */}
      {handoverModalOpen && (
        <HandoverTechModal
          isOpen={handoverModalOpen}
          onClose={() => {
            setHandoverModalOpen(false);
            setHandoverOrderTarget(null);
          }}
          order={handoverOrderTarget}
          currentUser={currentUser}
          invalidateOrders={async () => {
            if (invalidateOrders) await invalidateOrders();
            refetch();
          }}
          onSuccess={(updated) => {
            if (updateOrder) updateOrder(updated);
            refetch();
            setHandoverModalOpen(false);
            setHandoverOrderTarget(null);
          }}
        />
      )}
    </AppShell>
  );
}
