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
  Icon,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { TechOrderDetailModal } from '../components/TechOrderDetailModal';
import { HandoverTechModal } from '../components/HandoverTechModal';
import { SpecialPartsRequestModal } from '../components/SpecialPartsRequestModal';
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

  const [dateFilter, setDateFilter] = useState<'today' | '3_days' | '7_days'>('today');
  const [activeTab, setActiveTab] = useState<'my_orders' | 'available' | 'completed' | 'special_parts'>('my_orders');
  const [selectedOrder, setSelectedOrder] = useState<RepairOrder | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [handoverOrderTarget, setHandoverOrderTarget] = useState<RepairOrder | null>(null);
  const [specialPartsModalOpen, setSpecialPartsModalOpen] = useState(false);
  const [specialPartsOrderTarget, setSpecialPartsOrderTarget] = useState<RepairOrder | null>(null);
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
        special_parts_needed: o.special_parts_needed,
        specialPartsNeeded: o.special_parts_needed,
        special_parts_status: o.special_parts_status,
        specialPartsStatus: o.special_parts_status,
        special_parts_requested_at: o.special_parts_requested_at,
        specialPartsRequestedAt: o.special_parts_requested_at,
        special_parts_fulfilled_at: o.special_parts_fulfilled_at,
        specialPartsFulfilledAt: o.special_parts_fulfilled_at,
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

  // 4. Máy có yêu cầu mua linh kiện ngoài: Các đơn có special_parts_needed hoặc special_parts_status
  const mySpecialPartsOrders = useMemo(() => {
    return branchFilteredOrders.filter((o) => {
      const isMyOrder =
        currentUser?.role === 'admin' ||
        (currentUser?.id !== undefined &&
          currentUser?.id !== null &&
          Number(o.technicianId || o.technician_id) === Number(currentUser.id));
      const hasSpecialPart = Boolean(
        o.special_parts_needed ||
        o.specialPartsNeeded ||
        o.special_parts_status ||
        o.specialPartsStatus
      );
      return isMyOrder && hasSpecialPart;
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
      toast(`Bạn đã nhận máy ${order.id} thành công! Đơn chuyển vào Đơn của tôi.`, 'success');
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
      toast(`Bạn đã nhận máy ${order.id} thành công! Đơn chuyển vào Đơn của tôi.`, 'success');
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
      toast(`Đã bắt đầu sửa chữa đơn ${order.id}`, 'success');
    } catch {
      updateOrder({ ...order, status: 'Đang sửa', statusType: 'progress' });
      toast(`Đã bắt đầu sửa chữa đơn ${order.id}`, 'success');
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
                <option value="all">Tất cả chi nhánh</option>
                {branches
                  .filter((b) => b.id !== 'all')
                  .map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name} ({b.code})
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

        {/* Top Red Alert Banner khi có linh kiện đặc biệt đang chờ mua ngoài */}
        {mySpecialPartsOrders.some(
          (o) => (o.special_parts_status || o.specialPartsStatus) === 'pending'
        ) && (
          <div
            data-testid="tech-special-parts-red-alert-banner"
            onClick={() => setActiveTab('special_parts')}
            className="bg-red-50 border border-red-300 rounded-[12px] p-3.5 px-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-red-100/70 transition-all shadow-2xs"
          >
            <div className="flex items-center gap-2.5 text-red-700">
              <span className="w-8 h-8 rounded-[8px] bg-red-600 text-white grid place-items-center flex-none">
                <Icon name="bell" size={16} />
              </span>
              <div>
                <b className="text-xs sm:text-sm font-bold block text-red-800">
                  CẢNH BÁO: Có{' '}
                  {
                    mySpecialPartsOrders.filter(
                      (o) => (o.special_parts_status || o.specialPartsStatus) === 'pending'
                    ).length
                  }{' '}
                  đơn đang chờ Quầy mua linh kiện đặc biệt bên ngoài!
                </b>
                <span className="text-xs text-red-700">
                  Bấm vào đây để chuyển ngay sang tab Linh kiện đặc biệt và theo dõi tiến độ mua hàng.
                </span>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-[8px] bg-red-600 text-white text-xs font-bold flex items-center gap-1.5">
              <span>Xem danh sách</span>
              <span>→</span>
            </span>
          </div>
        )}

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
            label={
              dateFilter === 'today'
                ? 'Đã sửa xong hôm nay'
                : dateFilter === '3_days'
                ? 'Đã sửa xong (3 ngày)'
                : 'Đã sửa xong (7 ngày)'
            }
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
                <span>Hôm nay</span>
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
                <span>3 ngày qua</span>
              </button>
              <button
                type="button"
                data-testid="tech-date-filter-7_days"
                onClick={() => setDateFilter('7_days')}
                className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  dateFilter === '7_days'
                    ? 'bg-[#176b58] text-white shadow-xs'
                    : 'bg-[#f4f7f5] text-[#556960] hover:bg-[#eaf0ec]'
                }`}
              >
                <span>7 ngày qua (Tối đa 7 ngày)</span>
              </button>
            </div>
          </div>
          <div className="text-[11px] text-[#6b7d74] flex items-center gap-1.5">
            {dateFilter === 'today' ? (
              <span className="text-[#176b58] bg-[#eaf4ef] px-2 py-0.5 rounded font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#176b58] animate-pulse" />
                Đơn ca hôm nay & các đơn dở dang tồn lại
              </span>
            ) : dateFilter === '3_days' ? (
              <span className="text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded font-medium flex items-center gap-1.5 border border-[#cbe3d6]">
                <Icon name="alert" size={14} className="text-[#176b58]" />
                <span>Hiển thị các máy nhận trong 3 ngày qua để theo dõi và hoàn tất sửa chữa.</span>
              </span>
            ) : (
              <span className="text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded font-medium flex items-center gap-1.5 border border-[#cbe3d6]">
                <Icon name="alert" size={14} className="text-[#176b58]" />
                <span>Mở rộng phạm vi 7 ngày qua: Theo dõi toàn bộ máy dở dang và hoàn thành trong tuần.</span>
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
            <span>Đơn của tôi</span>
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
            <span>Đơn chờ nhận</span>
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
            <span>
              {dateFilter === 'today'
                ? 'Đã sửa xong hôm nay'
                : dateFilter === '3_days'
                ? 'Đã sửa xong (3 ngày)'
                : 'Đã sửa xong (7 ngày)'}
            </span>
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

          <button
            type="button"
            data-testid="tech-tab-special-parts"
            onClick={() => setActiveTab('special_parts')}
            className={`px-4 py-2.5 rounded-[8px] font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'special_parts'
                ? 'bg-[#176b58] text-white shadow-xs'
                : 'bg-white text-[#52635a] hover:bg-[#f0f4f2] border border-[#e5ece8]'
            }`}
          >
            <Icon name="cart" size={14} />
            <span>Linh kiện đặc biệt</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                activeTab === 'special_parts'
                  ? 'bg-white/20 text-white'
                  : 'bg-red-100 text-red-700 border border-red-300 font-bold'
              }`}
            >
              {mySpecialPartsOrders.length}
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
                  Các đơn máy bạn đang trực tiếp phụ trách. Bấm vào đơn hoặc nút [Hoàn tất] để mở biểu mẫu nghiệm thu bàn giao CSKH.
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
                  const isSpecialPartsPending = order.special_parts_status === 'pending' || order.specialPartsStatus === 'pending';

                  return (
                    <article
                      key={order.id}
                      className={`bg-white border rounded-[12px] p-5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-all cursor-pointer group ${
                        isSpecialPartsPending
                          ? 'border-red-400 ring-1 ring-red-400/20 bg-red-50/10'
                          : 'border-[#e5ece8] hover:border-[#176b58]'
                      }`}
                      onClick={() => handleOpenDetailModal(order)}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-sm text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded-[6px]">
                              {order.id}
                            </span>
                            {(order.order_type === 'warranty' || order.orderType === 'warranty') && (
                              <span
                                data-testid="warranty-badge"
                                className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-[#d9383a] text-white shadow-xs"
                              >
                                BẢO HÀNH
                              </span>
                            )}
                          </div>
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
                        </div>

                        {/* QC Guardrail Alert cho đơn bảo hành */}
                        {(order.order_type === 'warranty' || order.orderType === 'warranty') && (
                          <div
                            data-testid="warranty-qc-alert"
                            className="bg-[#fef2f2] border border-[#fecaca] rounded-[8px] p-2 text-xs font-bold text-[#b91c1c] flex items-center gap-1.5"
                          >
                            <Icon name="alert" size={13} className="text-[#b91c1c] flex-none" />
                            <span>Bắt buộc kiểm định QC Đạt trước khi hoàn tất</span>
                          </div>
                        )}

                        {/* Badges linh kiện đặc biệt (mua ngoài) */}
                        {isSpecialPartsPending && (
                          <div
                            data-testid={`card-special-parts-pending-${order.id}`}
                            className="bg-red-50 text-red-700 border border-red-300 font-bold rounded-[8px] p-2 text-xs flex items-center gap-1.5 shadow-2xs"
                          >
                            <Icon name="bell" size={13} className="text-red-600 flex-none" />
                            <span className="truncate">Cần mua ngoài: {order.special_parts_needed || order.specialPartsNeeded}</span>
                          </div>
                        )}
                        {(order.special_parts_status === 'purchased' || order.specialPartsStatus === 'purchased') && (
                          <div
                            data-testid={`card-special-parts-purchased-${order.id}`}
                            className="bg-[#eaf5ef] border border-[#c2e4d3] rounded-[8px] p-2 text-xs text-[#28805e] flex items-center justify-between gap-1.5"
                          >
                            <span className="font-bold flex items-center gap-1">
                              <Icon name="check" size={13} className="text-[#28805e]" />
                              Quầy đã mua linh kiện
                            </span>
                            {isWaitingParts && (
                              <button
                                type="button"
                                data-testid={`tech-resume-purchased-btn-${order.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleResumeRepair(order);
                                }}
                                className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#176b58] text-white hover:bg-[#125848] transition-colors cursor-pointer"
                              >
                                Tiếp tục sửa
                              </button>
                            )}
                          </div>
                        )}
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
                          title="In nhanh tem dán khay linh kiện khổ nhiệt K80"
                        >
                          Tem K80
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          icon="refresh"
                          onClick={() => handleOpenHandoverModal(order)}
                          className="px-2.5 text-xs text-[#176b58] border-[#b8d0c5] hover:bg-[#eef6f2] font-semibold"
                          title="Bàn giao đơn cho KTV khác hoặc trả về hàng đợi chung"
                        >
                          Bàn giao
                        </Button>

                        {isWaitingParts ? (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleResumeRepair(order)}
                            className="text-xs font-bold"
                          >
                            Tiếp tục sửa
                          </Button>
                        ) : isAssignedOrRework ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              icon="wrench"
                              onClick={() => handleStartRepair(order)}
                              className="text-xs text-[#176b58] border-[#c4ded0] hover:bg-[#eef6f2] font-semibold"
                            >
                              Bắt đầu sửa
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              icon="check"
                              onClick={() => handleOpenDetailModal(order)}
                              className="flex-1 font-bold text-xs bg-[#176b58] hover:bg-[#125848] text-white shadow-xs cursor-pointer"
                            >
                              Hoàn tất
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
                              Chờ linh kiện
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              icon="check"
                              onClick={() => handleOpenDetailModal(order)}
                              className="flex-1 font-bold text-xs bg-[#176b58] hover:bg-[#125848] text-white shadow-xs cursor-pointer"
                            >
                              Hoàn tất sửa chữa
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
                  actionLabel={`Xem đơn chờ nhận (${availableOrders.length})`}
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
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-sm text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded-[6px]">
                            {order.id}
                          </span>
                          {(order.order_type === 'warranty' || order.orderType === 'warranty') && (
                            <span
                              data-testid="warranty-badge"
                              className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-[#d9383a] text-white shadow-xs"
                            >
                              BẢO HÀNH
                            </span>
                          )}
                        </div>
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

                      {/* QC Guardrail Alert cho đơn bảo hành */}
                      {(order.order_type === 'warranty' || order.orderType === 'warranty') && (
                        <div
                          data-testid="warranty-qc-alert"
                          className="bg-[#fef2f2] border border-[#fecaca] rounded-[8px] p-2 text-xs font-bold text-[#b91c1c] flex items-center gap-1.5"
                        >
                          <Icon name="alert" size={13} className="text-[#b91c1c] flex-none" />
                          <span>Bắt buộc kiểm định QC Đạt trước khi hoàn tất</span>
                        </div>
                      )}
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
                        Nhận máy ngay
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
              <span className="text-xs font-bold text-[#28805e] bg-[#eaf4ef] px-3 py-1 rounded-[10px]">
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
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-sm text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded-[6px]">
                            {order.id}
                          </span>
                          {(order.order_type === 'warranty' || order.orderType === 'warranty') && (
                            <span
                              data-testid="warranty-badge"
                              className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-[#d9383a] text-white shadow-xs"
                            >
                              BẢO HÀNH
                            </span>
                          )}
                        </div>
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
                        <span className="font-bold text-[#176b58] block mb-1">Nghiệm thu hoàn tất:</span>
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

        {/* Tab Content 4: LINH KIỆN ĐẶC BIỆT */}
        {activeTab === 'special_parts' && (
          <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-heading font-bold text-base text-[#1c302b] m-0 flex items-center gap-2">
                  <Icon name="cart" size={18} className="text-[#176b58]" />
                  <span>Danh sách máy cần mua linh kiện ngoài ({mySpecialPartsOrders.length})</span>
                </h2>
                <p className="text-xs text-[#809088] mt-0.5 mb-0">
                  Các thiết bị cần linh kiện đặc biệt không có sẵn trong kho nội bộ, đang chờ hoặc đã được Quầy tìm mua.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  data-testid="tech-open-add-special-parts-modal-btn"
                  onClick={() => {
                    setSpecialPartsOrderTarget(null);
                    setSpecialPartsModalOpen(true);
                  }}
                  className="bg-[#176b58] hover:bg-[#125848] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <Icon name="plus" size={14} />
                  <span>+ Thêm yêu cầu mua ngoài</span>
                </Button>
              </div>
            </div>

            {mySpecialPartsOrders.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {mySpecialPartsOrders.map((order) => {
                  const code = normalizeStatusCode(order.status);
                  const isWaitingParts = code === 'waiting_parts';
                  const isPurchased = order.special_parts_status === 'purchased' || order.specialPartsStatus === 'purchased';

                  return (
                    <article
                      key={order.id}
                      className={`bg-white border rounded-[12px] p-5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-all cursor-pointer group ${
                        isPurchased ? 'border-[#a7d9c0] hover:border-[#176b58]' : 'border-red-400 ring-1 ring-red-400/20 bg-red-50/10 hover:border-red-500'
                      }`}
                      onClick={() => handleOpenDetailModal(order)}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-sm text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded-[6px]">
                              {order.id}
                            </span>
                            {(order.order_type === 'warranty' || order.orderType === 'warranty') && (
                              <span
                                data-testid="warranty-badge"
                                className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-[#d9383a] text-white shadow-xs"
                              >
                                BẢO HÀNH
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {isPurchased ? (
                              <span
                                data-testid={`tech-purchased-badge-${order.id}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[20px] text-[10px] font-bold text-[#28805e] bg-[#eaf5ef] border border-[#c2e4d3]"
                              >
                                <Icon name="check" size={12} className="text-[#28805e]" />
                                Quầy đã mua linh kiện
                              </span>
                            ) : (
                              <span
                                data-testid={`tech-pending-badge-${order.id}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[20px] text-[10px] font-bold text-red-700 bg-red-50 border border-red-300 shadow-2xs"
                              >
                                <Icon name="bell" size={12} className="text-red-600" />
                                Đang chờ Quầy mua
                              </span>
                            )}
                          </div>
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

                        {/* Ghi chú linh kiện cần mua ngoài */}
                        <div className={`p-3 rounded-[8px] border text-xs leading-relaxed ${
                          isPurchased ? 'bg-[#f4faf7] border-[#d2eadc] text-[#1c302b]' : 'bg-red-50 text-red-700 border-red-300'
                        }`}>
                          <span className="font-bold block mb-1 flex items-center gap-1">
                            <Icon name={isPurchased ? "cart" : "bell"} size={12} className={isPurchased ? "" : "text-red-600"} />
                            Linh kiện cần mua ngoài:
                          </span>
                          <p className="m-0 font-medium whitespace-pre-wrap">
                            {order.special_parts_needed || order.specialPartsNeeded || 'Chưa ghi rõ nội dung'}
                          </p>
                          {order.special_parts_requested_at && (
                            <span className="text-[10px] opacity-75 block mt-1.5">
                              Yêu cầu lúc: {new Date(order.special_parts_requested_at).toLocaleString('vi-VN')}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1 text-xs text-[#52635a]">
                          <div className="flex items-center justify-between">
                            <span className="text-[#809088]">Khách hàng:</span>
                            <b className="text-[#1c302b]">{order.name} ({order.phone})</b>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[#809088]">KTV phụ trách:</span>
                            <span className="font-semibold text-[#1c302b]">{order.tech}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[#809088]">Chi nhánh:</span>
                            <span>{order.branch}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[#809088]">Trạng thái máy:</span>
                            <StatusTag label={order.status} type={order.statusType} />
                          </div>
                        </div>
                      </div>

                      <div
                        className="pt-4 mt-3 border-t border-[#f0f3f1] flex flex-wrap gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isPurchased && isWaitingParts ? (
                          <Button
                            variant="primary"
                            size="sm"
                            data-testid={`tech-resume-special-part-btn-${order.id}`}
                            onClick={() => handleResumeRepair(order)}
                            className="flex-1 text-xs font-bold bg-[#176b58] hover:bg-[#125848] text-white"
                          >
                            Tiếp tục sửa máy
                          </Button>
                        ) : null}

                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`tech-edit-special-part-btn-${order.id}`}
                          onClick={() => {
                            setSpecialPartsOrderTarget(order);
                            setSpecialPartsModalOpen(true);
                          }}
                          className="text-xs text-[#b45309] border-[#fde68a] hover:bg-[#fef3c7] font-semibold"
                        >
                          Sửa ghi chú
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenDetailModal(order)}
                          className="text-xs font-semibold"
                        >
                          Chi tiết máy
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="py-8">
                <EmptyState
                  title="Chưa có yêu cầu mua linh kiện ngoài nào"
                  description="Khi phát hiện thiết bị cần linh kiện đặc biệt không có sẵn trong kho, hãy bấm nút '+ Thêm yêu cầu mua ngoài' để thông báo tới Quầy."
                  icon="inventory"
                  actionLabel="+ Thêm yêu cầu mua ngoài"
                  onAction={() => {
                    setSpecialPartsOrderTarget(null);
                    setSpecialPartsModalOpen(true);
                  }}
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

      {/* Special Parts Request Modal */}
      <SpecialPartsRequestModal
        isOpen={specialPartsModalOpen}
        onClose={() => {
          setSpecialPartsModalOpen(false);
          setSpecialPartsOrderTarget(null);
        }}
        orders={myActiveOrders}
        preselectedOrder={specialPartsOrderTarget}
        invalidateOrders={async () => {
          if (invalidateOrders) await invalidateOrders();
          refetch();
        }}
        updateOrder={updateOrder}
        onSuccess={(updated) => {
          if (updateOrder) updateOrder(updated);
          refetch();
          setActiveTab('special_parts');
        }}
      />
    </AppShell>
  );
}
