'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  StatusTag,
  FilterBar,
  Avatar,
  Modal,
  EmptyState,
  TableSkeleton,
  ErrorFallback,
  useToast,
  Input,
  Textarea,
  CurrencyInput,
  ConfirmModal,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { IntakeWizardModal } from '../components/IntakeWizardModal';
import { CheckoutHandoverModal } from '../components/CheckoutHandoverModal';
import { AdminEditOrderModal } from '../components/AdminEditOrderModal';
import { ConfirmDeleteOrderModal } from '../components/ConfirmDeleteOrderModal';
import { usePodsCare } from '../providers';
import type { RepairOrder, AdditionalServiceItem } from '@podscare/types';
import { repairService, serviceService } from '@podscare/api-client';
import { useQuery } from '@tanstack/react-query';
import {
  normalizeStatusCode,
  getQuickActionsForStatus,
  isTechnicalStageStatus,
} from './fsm';
import { useSilentPrint, PrintButtonDropdown } from '../components/print';

export default function RepairsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { orders, updateOrder, branch, branchId, setBranch, branches, role, invalidateOrders } =
    usePodsCare();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [orderTypeFilter, setOrderTypeFilter] = useState<'all' | 'in_store' | 'cod'>('all');
  const [selectedOrder, setSelectedOrder] = useState<RepairOrder | null>(null);
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);
  const [initialIntakeType, setInitialIntakeType] = useState<'in_store' | 'cod'>('in_store');
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [adminEditModalOpen, setAdminEditModalOpen] = useState(false);
  const [adminDeleteModalOpen, setAdminDeleteModalOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { printReceipt, isPrinting: isSilentPrinting } = useSilentPrint();

  // Additional services state (CSKH & Admin)
  const [showAddServiceForm, setShowAddServiceForm] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState<number | string>('');
  const [newServiceId, setNewServiceId] = useState<number | null>(null);
  const [newServiceNote, setNewServiceNote] = useState('');
  const [serviceError, setServiceError] = useState('');
  const [isSubmittingService, setIsSubmittingService] = useState(false);
  const [availableServices, setAvailableServices] = useState<any[]>([]);
  const [serviceToDelete, setServiceToDelete] = useState<AdditionalServiceItem | null>(null);
  const [isDeletingService, setIsDeletingService] = useState(false);

  // Map label to backend status code
  const statusToBackendMap: Record<string, string> = {
    'Tiếp nhận mới': 'inspecting',
    'Chờ kỹ thuật': 'waiting_tech',
    'Đã nhận đơn': 'assigned',
    'Đang kiểm tra': 'inspecting',
    'Chờ khách duyệt': 'waiting_approval',
    'Đang sửa': 'in_repair',
    'Chờ linh kiện': 'waiting_parts',
    'Chờ QC': 'waiting_qc',
    'Sẵn sàng trả': 'ready_for_return',
    'Hoàn tất': 'completed',
  };

  // Nạp đơn hàng trực tiếp qua API với bộ lọc chi nhánh, trạng thái và tìm kiếm
  const {
    data: apiOrdersData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['repairs', branchId, statusFilter, search, orderTypeFilter],
    queryFn: async () => {
      const params: Record<string, any> = { per_page: 50 };
      if (branchId && branchId !== 'all') {
        params.branch_id = branchId;
      }
      if (statusFilter && statusToBackendMap[statusFilter]) {
        params.status = statusToBackendMap[statusFilter];
      }
      if (search.trim()) {
        params.q = search.trim();
      }
      if (orderTypeFilter && orderTypeFilter !== 'all') {
        params.order_type = orderTypeFilter;
      }
      const res = await repairService.getRepairs(params);
      return res?.data || res;
    },
  });

  const orderCounts = useMemo(() => {
    const raw = apiOrdersData?.data || apiOrdersData;
    const list = Array.isArray(raw) ? raw : (orders || []);
    let total = 0;
    let inStore = 0;
    let cod = 0;
    list.forEach((o: any) => {
      total++;
      const t = o.order_type || o.orderType || 'in_store';
      if (t === 'cod') {
        cod++;
      } else {
        inStore++;
      }
    });
    return { total, inStore, cod };
  }, [apiOrdersData, orders]);

  const filteredOrders: RepairOrder[] = useMemo(() => {
    const raw = apiOrdersData?.data || apiOrdersData;
    let list = Array.isArray(raw) ? raw : [];
    if (list.length === 0 && !search && !statusFilter) {
      list = orders;
    }
    if (orderTypeFilter !== 'all') {
      list = list.filter((o: any) => (o.order_type || o.orderType || 'in_store') === orderTypeFilter);
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
    return list.map((o: any) => {
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
  }, [apiOrdersData, orders, search, statusFilter, orderTypeFilter]);

  // Lắng nghe sự kiện realtime cập nhật trạng thái đơn (kèm chuông Audio Chime)
  React.useEffect(() => {
    const handleOperationalEvent = (e: any) => {
      const detail = e.detail;
      const evName = detail?.eventName || detail?.payload?.eventName || '';
      const pType = detail?.type || detail?.payload?.type || '';
      if (evName === 'order.waiting_parts' || pType === 'order_waiting_parts' || evName.startsWith('order.')) {
        refetch();
      }
    };

    window.addEventListener('podscare:operational_event', handleOperationalEvent);
    return () => {
      window.removeEventListener('podscare:operational_event', handleOperationalEvent);
    };
  }, [refetch]);

  // Admin / CSKH kích hoạt tiếp tục sửa chữa khi đã có linh kiện
  const handleResumeOrder = async (orderToResume: RepairOrder) => {
    try {
      setIsTransitioning(true);
      await repairService.transition(orderToResume.id, { transition: 'in_repair' });
      refetch();
      if (invalidateOrders) await invalidateOrders();
      toast(`Đã chuyển trạng thái: Tiếp tục sửa chữa. KTV đã nhận được thông báo.`, 'success');

      const updated: RepairOrder = {
        ...orderToResume,
        status: 'Đang sửa',
        statusType: 'progress',
        paused_at: null,
        pausedAt: null,
      };
      updateOrder(updated);
      if (selectedOrder && selectedOrder.id === orderToResume.id) {
        setSelectedOrder(updated);
      }
    } catch (err: any) {
      console.warn('Resume order error:', err);
      const errMsg =
        err?.response?.data?.message ||
        err?.message ||
        'Không thể mở lại ca sửa.';
      toast(errMsg, 'error');
    } finally {
      setIsTransitioning(false);
    }
  };

  const selectedOrderBatchOrders = useMemo(() => {
    if (!selectedOrder) return undefined;
    if (selectedOrder.batchOrders && selectedOrder.batchOrders.length > 1) {
      return selectedOrder.batchOrders;
    }
    if (selectedOrder.intake_batch_code) {
      const allCandidateOrders = filteredOrders.length > 0 ? filteredOrders : orders;
      const siblings = allCandidateOrders.filter(
        (o: RepairOrder) => o.intake_batch_code === selectedOrder.intake_batch_code
      );
      if (siblings.length > 1) return siblings;
    }
    return undefined;
  }, [selectedOrder, filteredOrders, orders]);

  const moneyFormatted = (n: number) =>
    n ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫' : '—';

  const canManageAdditionalServices = role === 'cskh' || role === 'admin' || (role as string) === 'super_admin';

  const selectedOrderId = selectedOrder?.id;
  const selectedOrderDeviceModelId = (selectedOrder as any)?.device_model_id;

  // Nạp danh mục dịch vụ sửa chữa theo model để gợi ý nhanh
  React.useEffect(() => {
    let active = true;
    if (!selectedOrderId) return;
    serviceService
      .getServices({ device_model_id: selectedOrderDeviceModelId || undefined })
      .then((res) => {
        if (!active) return;
        const list = Array.isArray(res?.data?.data)
          ? res.data.data
          : Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res)
          ? res
          : [];
        setAvailableServices(list);
      })
      .catch((err) => console.warn('Could not fetch services catalog:', err));

    return () => {
      active = false;
    };
  }, [selectedOrderId, selectedOrderDeviceModelId]);

  const handleAddAdditionalService = async () => {
    if (!selectedOrder) return;

    if (!newServiceName.trim()) {
      setServiceError('Vui lòng chọn hoặc nhập tên dịch vụ bổ sung');
      return;
    }

    const priceNum = typeof newServicePrice === 'number' ? newServicePrice : Number(newServicePrice);
    if (!priceNum || isNaN(priceNum) || priceNum <= 0) {
      setServiceError('Đơn giá dịch vụ là bắt buộc và phải lớn hơn 0 VNĐ');
      return;
    }

    setServiceError('');
    setIsSubmittingService(true);

    try {
      const res = await repairService.addAdditionalService(selectedOrder.id, {
        name: newServiceName.trim(),
        price: priceNum,
        service_id: newServiceId || undefined,
        note: newServiceNote.trim() || undefined,
      });

      const updatedRaw = res?.data?.data || res?.data || res;
      toast(`✓ Đã thêm dịch vụ "${newServiceName.trim()}" cho đơn ${selectedOrder.id}!`, 'success');

      const newAdditional = Array.isArray(updatedRaw.additional_services)
        ? updatedRaw.additional_services
        : [
            ...(selectedOrder.additional_services || []),
            {
              id: 'srv_' + Date.now(),
              name: newServiceName.trim(),
              price: priceNum,
              note: newServiceNote.trim() || null,
              created_at: new Date().toISOString(),
              created_by_name: 'CSKH',
            },
          ];

      const newTotalPrice = updatedRaw.total_price !== undefined
        ? Number(updatedRaw.total_price)
        : (Number(selectedOrder.initial_price || selectedOrder.price) + newAdditional.reduce((s: number, i: any) => s + (Number(i.price) || 0), 0));

      const updatedOrder: RepairOrder = {
        ...selectedOrder,
        price: newTotalPrice,
        total_price: newTotalPrice,
        initial_price: updatedRaw.initial_price !== undefined ? Number(updatedRaw.initial_price) : (selectedOrder.initial_price || selectedOrder.price),
        initialPrice: updatedRaw.initial_price !== undefined ? Number(updatedRaw.initial_price) : (selectedOrder.initial_price || selectedOrder.price),
        additional_services: newAdditional,
        additionalServices: newAdditional,
      };

      setSelectedOrder(updatedOrder);
      updateOrder(updatedOrder);
      if (invalidateOrders) await invalidateOrders();
      refetch();

      setNewServiceName('');
      setNewServicePrice('');
      setNewServiceId(null);
      setNewServiceNote('');
      setShowAddServiceForm(false);
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Không thể thêm dịch vụ bổ sung';
      setServiceError(errMsg);
      toast(errMsg, 'error');
    } finally {
      setIsSubmittingService(false);
    }
  };

  const handleDeleteAdditionalService = async () => {
    if (!selectedOrder || !serviceToDelete) return;

    setIsDeletingService(true);
    try {
      const res = await repairService.deleteAdditionalService(selectedOrder.id, serviceToDelete.id);
      const updatedRaw = res?.data?.data || res?.data || res;
      toast(`✓ Đã hủy dịch vụ "${serviceToDelete.name}" thành công!`, 'success');

      const newAdditional = Array.isArray(updatedRaw.additional_services)
        ? updatedRaw.additional_services
        : (selectedOrder.additional_services || []).filter((s) => s.id !== serviceToDelete.id);

      const newTotalPrice = updatedRaw.total_price !== undefined
        ? Number(updatedRaw.total_price)
        : (Number(selectedOrder.initial_price || selectedOrder.price) + newAdditional.reduce((s: number, i: any) => s + (Number(i.price) || 0), 0));

      const updatedOrder: RepairOrder = {
        ...selectedOrder,
        price: newTotalPrice,
        total_price: newTotalPrice,
        additional_services: newAdditional,
        additionalServices: newAdditional,
      };

      setSelectedOrder(updatedOrder);
      updateOrder(updatedOrder);
      if (invalidateOrders) await invalidateOrders();
      refetch();
      setServiceToDelete(null);
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Không thể xóa dịch vụ bổ sung';
      toast(errMsg, 'error');
    } finally {
      setIsDeletingService(false);
    }
  };

  const statusOptions = [
    { value: 'Tiếp nhận mới', label: 'Tiếp nhận mới' },
    { value: 'Chờ kỹ thuật', label: 'Chờ kỹ thuật' },
    { value: 'Đã nhận đơn', label: 'Đã nhận đơn' },
    { value: 'Đang kiểm tra', label: 'Đang kiểm tra' },
    { value: 'Chờ khách duyệt', label: 'Chờ khách duyệt' },
    { value: 'Đang sửa', label: 'Đang sửa' },
    { value: 'Chờ linh kiện', label: 'Chờ linh kiện' },
    { value: 'Chờ QC', label: 'Chờ QC' },
    { value: 'Sẵn sàng trả', label: 'Sẵn sàng trả' },
    { value: 'Hoàn tất', label: 'Hoàn tất' },
  ];

  const handleUpdateStatus = async (
    nextStatus: string,
    nextType: any,
    targetStatus?: string
  ) => {
    if (!selectedOrder || isTransitioning) return;
    setIsTransitioning(true);
    const previousOrder = { ...selectedOrder };
    const prevStatus = selectedOrder.status;
    const prevType = selectedOrder.statusType;

    const updated: RepairOrder = {
      ...selectedOrder,
      status: nextStatus,
      statusType: nextType,
    };
    updateOrder(updated);
    setSelectedOrder(updated);

    try {
      const statusToTransitionMap: Record<string, string> = {
        'Đang sửa': 'in_repair',
        'Chờ QC': 'waiting_qc',
        'Sẵn sàng trả': 'ready_for_return',
        'Hoàn tất': 'completed',
        'Chờ kỹ thuật': 'waiting_tech',
        'Chờ khách duyệt': 'waiting_approval',
        'Chờ linh kiện': 'waiting_parts',
        'Khách từ chối': 'rejected',
        'Đã hủy': 'cancelled',
        'Chờ khách nhận': 'waiting_pickup',
        'Cần sửa lại': 'rework_needed',
      };
      const transitionKey =
        targetStatus || statusToTransitionMap[nextStatus] || normalizeStatusCode(nextStatus);
      if (transitionKey) {
        await repairService.transition(selectedOrder.id, { transition: transitionKey });
        refetch();
        if (invalidateOrders) await invalidateOrders();
      }
      toast(`Đã cập nhật ${selectedOrder.id} sang: ${nextStatus}`, 'success');
    } catch (err: any) {
      console.warn('Transition API error:', err);
      // Rollback RAM state về trạng thái trước đó
      const revertedOrder: RepairOrder = {
        ...previousOrder,
        status: prevStatus,
        statusType: prevType,
      };
      updateOrder(revertedOrder);
      setSelectedOrder(revertedOrder);

      const errMsg =
        err?.response?.data?.message ||
        err?.data?.message ||
        err?.message ||
        'Không thể chuyển trạng thái do vi phạm quy tắc quy trình FSM.';
      toast(errMsg, 'error');
    } finally {
      setIsTransitioning(false);
    }
  };

  return (
    <AppShell crumbName="Đơn sửa chữa">
      <div className="space-y-6">
        {/* Page Heading */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-[#819089] uppercase tracking-[1.05px] mb-1 flex items-center gap-2">
              <span>OPERATIONS</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#176b58]" />
              <span className="text-[#176b58] font-bold">
                {branchId === 'all' ? 'Toàn bộ chi nhánh' : branch}
              </span>
            </div>
            <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#1c302b] m-0">
              Quản lý đơn sửa chữa
            </h1>
            <p className="text-sm text-[#7e8d85] mt-1 mb-0">
              Theo dõi toàn bộ vòng đời tiếp nhận, kiểm định và bàn giao theo từng chi nhánh.
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            icon="plus"
            data-testid="intake-main-btn"
            onClick={() => {
              setInitialIntakeType('in_store');
              setIntakeModalOpen(true);
            }}
            className="flex items-center gap-1.5"
          >
            <span>Tiếp nhận thiết bị</span>
          </Button>
        </div>

        {/* Panel with Table and Filters */}
        <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
          {/* Quick Filter Tabs: Tất cả, Tại cửa hàng, Đơn COD */}
          <div className="flex flex-wrap items-center gap-2 border-b border-[#e5ece8] pb-3 mb-4">
            <button
              type="button"
              data-testid="tab-filter-all"
              onClick={() => setOrderTypeFilter('all')}
              className={`px-3.5 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                orderTypeFilter === 'all'
                  ? 'bg-[#176b58] text-white shadow-sm'
                  : 'bg-[#f4f7f5] text-[#556960] hover:bg-[#eaf0ec]'
              }`}
            >
              <span>📋 Tất cả đơn</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  orderTypeFilter === 'all' ? 'bg-white/25 text-white' : 'bg-[#e2e9e5] text-[#42584e]'
                }`}
              >
                {orderCounts.total}
              </span>
            </button>
            <button
              type="button"
              data-testid="tab-filter-in-store"
              onClick={() => setOrderTypeFilter('in_store')}
              className={`px-3.5 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                orderTypeFilter === 'in_store'
                  ? 'bg-[#176b58] text-white shadow-sm'
                  : 'bg-[#f4f7f5] text-[#556960] hover:bg-[#eaf0ec]'
              }`}
            >
              <span>🏪 Tại cửa hàng</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  orderTypeFilter === 'in_store' ? 'bg-white/25 text-white' : 'bg-[#e2e9e5] text-[#42584e]'
                }`}
              >
                {orderCounts.inStore}
              </span>
            </button>
            <button
              type="button"
              data-testid="tab-filter-cod"
              onClick={() => setOrderTypeFilter('cod')}
              className={`px-3.5 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                orderTypeFilter === 'cod'
                  ? 'bg-[#d97706] text-white shadow-sm'
                  : 'bg-[#fef3c7] text-[#92400e] hover:bg-[#fde68a]'
              }`}
            >
              <span>📦 Đơn COD (Khách tỉnh)</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  orderTypeFilter === 'cod' ? 'bg-white/25 text-white' : 'bg-[#fde68a] text-[#78350f]'
                }`}
              >
                {orderCounts.cod}
              </span>
            </button>
          </div>

          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            selectValue={statusFilter}
            onSelectChange={setStatusFilter}
            selectOptions={statusOptions}
            selectPlaceholder="Tất cả trạng thái"
            actions={
              <div className="flex items-center gap-2">
                {role === 'admin' ? (
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
                ) : (
                  <div className="h-9 border border-[#d6dfda] rounded-[8px] px-2.5 text-xs text-[#176b58] bg-[#eaf4ef] font-semibold flex items-center gap-1.5 cursor-default select-none pointer-events-none">
                    <span>📍 {branch}</span>
                  </div>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  icon="refresh"
                  disabled={isLoading}
                  onClick={() => refetch()}
                >
                  {isLoading ? 'Đang tải...' : 'Làm mới'}
                </Button>
              </div>
            }
          />

          {/* 4-Layer Resilient UI States */}
          {isError ? (
            <ErrorFallback onRetry={() => refetch()} />
          ) : isLoading ? (
            <TableSkeleton rows={6} cols={8} />
          ) : filteredOrders.length === 0 ? (
            <EmptyState
              title={`Không tìm thấy đơn sửa chữa nào tại ${
                branchId === 'all' ? 'toàn bộ chi nhánh' : branch
              }`}
              description={
                role === 'admin'
                  ? 'Thử thay đổi bộ lọc tìm kiếm hoặc chuyển sang chi nhánh khác để kiểm tra.'
                  : 'Không có đơn sửa chữa nào trong danh mục hoặc tìm kiếm hiện tại.'
              }
              actionLabel={
                role === 'admin' && branchId !== 'all'
                  ? 'Xem tất cả chi nhánh'
                  : 'Tạo phiếu tiếp nhận mới'
              }
              onAction={() => {
                if (role === 'admin' && branchId !== 'all') {
                  setBranch('Tất cả chi nhánh', 'all');
                } else {
                  setIntakeModalOpen(true);
                }
              }}
            />
          ) : (
            <div className="overflow-x-auto -mx-5 sm:mx-0">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#809088] uppercase tracking-wider h-10">
                    <th className="px-4">Mã đơn</th>
                    <th className="px-4">Khách hàng</th>
                    <th className="px-4">Thiết bị & lỗi</th>
                    <th className="px-4">Trạng thái</th>
                    <th className="px-4">Chi phí</th>
                    <th className="px-4">Kỹ thuật viên</th>
                    <th className="px-4">Ngày nhận & Kho</th>
                    <th className="px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f2] text-sm text-[#3b4c44]">
                  {filteredOrders.map((o, idx) => (
                    <tr
                      key={o.id}
                      onClick={() => setSelectedOrder(o)}
                      className="h-14 hover:bg-[#fbfcfb] cursor-pointer transition-colors"
                    >
                      <td className="px-4">
                        <div className="font-mono font-bold text-[#176b58]">{o.id}</div>
                        <div className="mt-1">
                          {(o.order_type === 'cod' || o.orderType === 'cod') ? (
                            <span
                              data-testid="badge-order-type-cod"
                              className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#b45309] bg-[#fef3c7] px-1.5 py-0.5 rounded border border-[#fde68a]"
                            >
                              📦 Đơn COD
                            </span>
                          ) : (
                            <span
                              data-testid="badge-order-type-in-store"
                              className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#176b58] bg-[#eaf4ef] px-1.5 py-0.5 rounded border border-[#b8d7c8]"
                            >
                              🏪 Tại quầy
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4">
                        <div className="flex items-center gap-2.5">
                          <Avatar initials={o.name} variant={(idx % 4) as any} size="sm" />
                          <div>
                            <b className="block text-[#273730] font-semibold">{o.name}</b>
                            <small className="block text-[#86968f] text-xs">{o.phone}</small>
                          </div>
                        </div>
                      </td>
                      <td className="px-4">
                        <span className="font-semibold text-[#3a4b42] block">{o.device}</span>
                        <small className="text-[#84948c] text-xs block truncate max-w-[220px]">
                          {o.issue}
                        </small>
                      </td>
                      <td className="px-4">
                        <div className="space-y-1">
                          <StatusTag label={o.status} type={o.statusType} />
                          {(o.parts_needed || o.partsNeeded || normalizeStatusCode(o.status) === 'waiting_parts') && (
                            <div
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b45309] bg-[#fef3c7] px-2 py-0.5 rounded border border-[#fde68a] max-w-[190px] truncate"
                              title={`Linh kiện yêu cầu: ${o.parts_needed || o.partsNeeded || 'Chưa cập nhật'}`}
                            >
                              <span>📦</span>
                              <span className="truncate">Cần: {o.parts_needed || o.partsNeeded || 'Chờ linh kiện'}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 font-semibold text-[#405048]">
                        {moneyFormatted(o.price)}
                      </td>
                      <td className="px-4 text-[#5e6f66]">{o.tech}</td>
                      <td className="px-4 text-[#7b8a82]">
                        <span className="block font-medium">{o.date}</span>
                        <span className="inline-block mt-0.5 text-xs font-mono font-bold text-[#176b58] bg-[#eaf4ef] px-1.5 py-0.5 rounded">
                          {o.branchName || o.branch}
                        </span>
                      </td>
                      <td className="px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {normalizeStatusCode(o.status) !== 'completed' ? (
                            <Button
                              variant="primary"
                              size="sm"
                              data-testid={`row-checkout-btn-${o.id}`}
                              className="bg-[#176b58] hover:bg-[#125848] text-white font-bold text-xs px-2.5 py-1 flex items-center gap-1 shadow-xs whitespace-nowrap cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOrder(o);
                                setCheckoutModalOpen(true);
                              }}
                            >
                              <span>💳 Thanh toán</span>
                            </Button>
                          ) : (
                            <span
                              data-testid={`row-paid-badge-${o.id}`}
                              className="text-[11px] font-semibold text-[#667770] bg-[#edf2ef] px-2 py-0.5 rounded border border-[#d8e0dc] whitespace-nowrap"
                            >
                              ✓ Đã thu
                            </span>
                          )}

                          {normalizeStatusCode(o.status) === 'waiting_parts' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs bg-[#eaf5ef] text-[#176b58] border-[#a9c9b9] hover:bg-[#d8ede1] font-bold whitespace-nowrap"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResumeOrder(o);
                              }}
                            >
                              ▶ Đã có linh kiện
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`row-action-btn-${o.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOrder(o);
                            }}
                          >
                            ···
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <Modal
          isOpen={Boolean(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          maxWidth="lg"
          eyebrow={`REPAIR ORDER · ${selectedOrder.id}`}
          title={`${selectedOrder.device} · ${selectedOrder.name}`}
          subtitle={`Số điện thoại: ${selectedOrder.phone} · Ngày tiếp nhận: ${selectedOrder.date} · ${((selectedOrder.order_type === 'cod' || selectedOrder.orderType === 'cod') ? '📦 Đơn COD (Khách tỉnh)' : '🏪 Đơn tại cửa hàng')}`}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2.5 w-full">
              <div className="flex flex-wrap items-center gap-2">
                <PrintButtonDropdown
                  order={selectedOrder}
                  batchOrders={selectedOrderBatchOrders}
                  isPrinting={isSilentPrinting}
                  direction="up"
                  onPrint={(ordOrOrds, fmt) => {
                    if (Array.isArray(ordOrOrds)) {
                      toast(
                        `Đang gửi lệnh in phiếu gộp ${ordOrOrds.length} thiết bị (${fmt.toUpperCase()})...`,
                        'info'
                      );
                      printReceipt(ordOrOrds, fmt);
                    } else {
                      toast(`Đang gửi lệnh in phiếu ${ordOrOrds.id} (${fmt.toUpperCase()})...`, 'info');
                      printReceipt(ordOrOrds, fmt);
                    }
                  }}
                  variant="secondary"
                  size="md"
                  buttonText="In phiếu tiếp nhận"
                />

                {/* CSKH Simplified Checkout Button */}
                {['ready_for_return', 'waiting_pickup'].includes(normalizeStatusCode(selectedOrder.status)) && (
                  <Button
                    variant="primary"
                    size="md"
                    data-testid="cskh-checkout-btn"
                    onClick={() => setCheckoutModalOpen(true)}
                    className="bg-[#176b58] hover:bg-[#125848] text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm"
                  >
                    <span>💳 Thu tiền & Trả máy</span>
                  </Button>
                )}

                {/* Admin Full CRUD Actions */}
                {(role === 'admin' || role === 'super_admin') && (
                  <>
                    <Button
                      variant="outline"
                      size="md"
                      data-testid="admin-edit-order-btn"
                      onClick={() => setAdminEditModalOpen(true)}
                      className="text-xs text-[#176b58] border-[#a9c9b9] hover:bg-[#eaf5ef] font-bold flex items-center gap-1"
                    >
                      <span>✏️ Sửa toàn diện</span>
                    </Button>
                    <Button
                      variant="danger"
                      size="md"
                      data-testid="admin-delete-order-btn"
                      onClick={() => setAdminDeleteModalOpen(true)}
                      className="text-xs font-bold flex items-center gap-1"
                    >
                      <span>🗑️ Xóa đơn</span>
                    </Button>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setSelectedOrder(null)}>
                  Đóng
                </Button>
                <Button
                  variant="primary"
                  onClick={() => router.push(`/track/${selectedOrder.id}`)}
                >
                  Mở trang tra cứu ↗
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4 text-sm">
            {/* Đợt tiếp nhận liên kết đa thiết bị */}
            {selectedOrder.intake_batch_code && selectedOrderBatchOrders && selectedOrderBatchOrders.length > 1 && (
              <div className="p-3 bg-[#f0f8f4] rounded-[10px] border border-[#d0e5d9] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">📦</span>
                  <div className="text-xs">
                    <span className="text-[#556960]">Đợt tiếp nhận: </span>
                    <strong className="font-mono text-[#176b58] font-bold">{selectedOrder.intake_batch_code}</strong>
                    <span className="text-[#556960] ml-1.5">({selectedOrderBatchOrders.length} thiết bị cùng đợt)</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {selectedOrderBatchOrders.map((bo: RepairOrder) => (
                    <button
                      key={bo.id}
                      type="button"
                      onClick={() => setSelectedOrder(bo)}
                      className={`px-2 py-0.5 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                        bo.id === selectedOrder.id
                          ? 'bg-[#176b58] text-white font-bold'
                          : 'bg-white text-[#176b58] border border-[#c3d7cb] hover:bg-[#e4eee8]'
                      }`}
                    >
                      {bo.id}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Khối cảnh báo màu cam nổi bật khi đơn chờ linh kiện */}
            {(normalizeStatusCode(selectedOrder.status) === 'waiting_parts' || Boolean(selectedOrder.parts_needed) || Boolean(selectedOrder.partsNeeded)) && (
              <div className="p-4 bg-[#fffbeb] rounded-[10px] border border-[#fde68a] space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#b45309] uppercase tracking-wide m-0 flex items-center gap-1.5">
                    <span>⚠️</span> YÊU CẦU LINH KIỆN TỪ PHÒNG KỸ THUẬT
                  </h4>
                  {selectedOrder.paused_at && (
                    <span className="text-[11px] text-[#92400e] font-medium">
                      Tạm dừng: {new Date(selectedOrder.paused_at).toLocaleTimeString('vi-VN')}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[#92400e] font-semibold block mb-0.5">Linh kiện cần:</span>
                    <b className="text-[#78350f] text-sm block">
                      {selectedOrder.parts_needed || selectedOrder.partsNeeded || 'Chưa ghi rõ'}
                    </b>
                  </div>
                  <div>
                    <span className="text-[#92400e] font-semibold block mb-0.5">KTV phụ trách:</span>
                    <b className="text-[#78350f] text-sm block">
                      {selectedOrder.tech || 'Kỹ thuật viên'}
                    </b>
                  </div>
                </div>

                {selectedOrder.repairNote && (
                  <div className="text-xs">
                    <span className="text-[#92400e] font-semibold block mb-0.5">Ghi chú KTV:</span>
                    <p className="text-[#78350f] bg-white/70 p-2 rounded border border-[#fef3c7] m-0">
                      {selectedOrder.repairNote}
                    </p>
                  </div>
                )}

                {normalizeStatusCode(selectedOrder.status) === 'waiting_parts' && (
                  <div className="pt-1 flex items-center justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={isTransitioning}
                      onClick={() => handleResumeOrder(selectedOrder)}
                      className="bg-[#176b58] hover:bg-[#125848] text-white font-bold text-xs"
                    >
                      ▶ Đã có linh kiện - Báo KTV tiếp tục sửa
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Status overview strip */}
            <div className="grid grid-cols-3 gap-3 p-4 bg-[#fafbfa] rounded-[10px] border border-[#edf1ee]">
              <div>
                <span className="text-[#7e8e86] block text-xs mb-1">Trạng thái</span>
                <StatusTag label={selectedOrder.status} type={selectedOrder.statusType} />
              </div>
              <div>
                <span className="text-[#7e8e86] block text-xs mb-0.5">Chi phí sửa chữa</span>
                <b className="text-base text-[#176b58] font-heading font-bold">
                  {moneyFormatted(selectedOrder.price)}
                </b>
              </div>
              <div>
                <span className="text-[#7e8e86] block text-xs mb-0.5">Kỹ thuật viên</span>
                <b className="text-sm text-[#1c302b]">{selectedOrder.tech}</b>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* 📋 BẢNG KÊ DỊCH VỤ SỬA CHỮA & CHI PHÍ                                      */}
            {/* ========================================================================= */}
            <div className="p-4 bg-[#fbfdfc] rounded-[10px] border border-[#dce8e1] space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#e8f1ec]">
                <h4 className="text-xs font-bold text-[#176b58] uppercase tracking-[0.8px] m-0 flex items-center gap-1.5">
                  <span>📋</span> BẢNG KÊ DỊCH VỤ SỬA CHỮA & CHI PHÍ
                </h4>
                {canManageAdditionalServices && !['completed', 'cancelled'].includes(normalizeStatusCode(selectedOrder.status)) && !showAddServiceForm && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAddServiceForm(true);
                      setServiceError('');
                      setNewServiceName('');
                      setNewServicePrice('');
                      setNewServiceId(null);
                      setNewServiceNote('');
                    }}
                    className="text-xs text-[#176b58] border-[#b8d0c5] hover:bg-[#eaf4ef] font-semibold py-1 px-2.5 h-auto flex items-center gap-1"
                  >
                    <span>➕</span> Thêm dịch vụ sửa thêm
                  </Button>
                )}
              </div>

              {/* Form thêm dịch vụ bổ sung */}
              {showAddServiceForm && (
                <div className="p-3.5 bg-[#f2f8f5] rounded-[8px] border border-[#b8d9cb] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#176b58] uppercase tracking-wide">
                      Thêm dịch vụ khách yêu cầu làm thêm
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddServiceForm(false)}
                      className="text-[#71857c] hover:text-[#2d3d35] text-xs font-bold cursor-pointer"
                    >
                      ✕ Đóng
                    </button>
                  </div>

                  {serviceError && (
                    <div className="p-2 rounded bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] text-xs font-medium">
                      ⚠️ {serviceError}
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {/* Gợi ý chọn dịch vụ hoặc gõ tự do */}
                    <div>
                      <label className="block text-xs font-bold text-[#2d3d35] mb-1">
                        Tên dịch vụ làm thêm <span className="text-red-500">*</span>:
                      </label>
                      <div className="space-y-1.5">
                        <Input
                          placeholder="Gõ tên dịch vụ hoặc chọn gợi ý bên dưới..."
                          value={newServiceName}
                          onChange={(e) => {
                            setNewServiceName(e.target.value);
                            setServiceError('');
                          }}
                        />
                        {availableServices.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            <span className="text-[11px] text-[#6b7c74] self-center">Gợi ý nhanh:</span>
                            {availableServices.slice(0, 5).map((srv) => (
                              <button
                                key={srv.id}
                                type="button"
                                onClick={() => {
                                  setNewServiceName(srv.name);
                                  setNewServiceId(srv.id);
                                  setServiceError('');
                                }}
                                className="text-[11px] px-2 py-0.5 rounded bg-white hover:bg-[#d8ece1] border border-[#c5ddd1] text-[#176b58] transition-colors cursor-pointer"
                              >
                                {srv.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Đơn giá bắt buộc nhập tay */}
                    <div>
                      <CurrencyInput
                        label="Đơn giá dịch vụ thỏa thuận (VNĐ) *"
                        placeholder="Nhập số tiền đã báo khách (bắt buộc > 0)..."
                        value={newServicePrice}
                        onChangeValue={(val) => {
                          setNewServicePrice(val);
                          setServiceError('');
                        }}
                      />
                      <span className="text-[11px] text-[#71857c] italic block mt-0.5">
                        * Bắt buộc nhập tay theo giá đã chốt với khách hàng.
                      </span>
                    </div>

                    {/* Ghi chú */}
                    <div>
                      <Textarea
                        label="Ghi chú dặn dò của khách (nếu có):"
                        placeholder="Ví dụ: Khách dặn lấy pin dung lượng chuẩn, dùng keo viền chống nước..."
                        rows={2}
                        value={newServiceNote}
                        onChange={(e) => setNewServiceNote(e.target.value)}
                      />
                    </div>

                    {/* Nút lưu & hủy */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isSubmittingService}
                        onClick={() => setShowAddServiceForm(false)}
                      >
                        Hủy
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isSubmittingService}
                        onClick={handleAddAdditionalService}
                        className="bg-[#176b58] hover:bg-[#125848] text-white font-bold"
                      >
                        {isSubmittingService ? 'Đang lưu...' : '✓ Xác nhận thêm dịch vụ'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Bảng kê chi tiết phân rã */}
              <div className="space-y-2 text-xs">
                {/* 1. Dịch vụ tiếp nhận ban đầu */}
                <div className="p-2.5 rounded-[8px] bg-white border border-[#e5ece8] flex items-center justify-between">
                  <div>
                    <span className="font-bold text-[#2d3d35] block text-[13px]">
                      1. Tiếp nhận ban đầu: {selectedOrder.device}
                    </span>
                    <span className="text-[#65766e] block mt-0.5">
                      Lỗi ghi nhận: {selectedOrder.issue}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-sm text-[#2d3d35] font-mono">
                      {moneyFormatted(
                        selectedOrder.initial_price !== undefined && selectedOrder.initial_price !== null
                          ? selectedOrder.initial_price
                          : selectedOrder.initialPrice !== undefined && selectedOrder.initialPrice !== null
                          ? selectedOrder.initialPrice
                          : selectedOrder.price
                      )}
                    </span>
                    <span className="block text-[10px] text-[#72837b]">Giá ban đầu</span>
                  </div>
                </div>

                {/* 2. Dịch vụ sửa thêm */}
                {((selectedOrder.additional_services && selectedOrder.additional_services.length > 0) ||
                  (selectedOrder.additionalServices && selectedOrder.additionalServices.length > 0)) ? (
                  <div className="space-y-1.5">
                    <span className="font-bold text-[#176b58] uppercase tracking-wide block pt-1 text-[11px]">
                      Dịch vụ khách yêu cầu làm thêm ({(selectedOrder.additional_services || selectedOrder.additionalServices || []).length} mục):
                    </span>
                    {(selectedOrder.additional_services || selectedOrder.additionalServices || []).map((srv, idx) => (
                      <div
                        key={srv.id || idx}
                        className="p-2.5 rounded-[8px] bg-[#f8fbf9] border border-[#d2e6dc] flex items-start justify-between gap-2"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[#1c302b] text-sm">
                              #{idx + 2}. {srv.name}
                            </span>
                            <span className="text-xs font-bold text-[#176b58] font-mono bg-white px-2 py-0.5 rounded border border-[#b8d9cb]">
                              +{moneyFormatted(srv.price)}
                            </span>
                          </div>
                          {srv.note && (
                            <p className="text-[#556960] italic m-0 text-xs">
                              💬 Dặn dò: {srv.note}
                            </p>
                          )}
                          <div className="text-[11px] text-[#788c82]">
                            Tạo bởi: <b className="text-[#3b4c45]">{srv.created_by_name || 'CSKH'}</b>
                            {srv.created_at && (
                              <span className="ml-1">({new Date(srv.created_at).toLocaleString('vi-VN')})</span>
                            )}
                          </div>
                        </div>

                        {canManageAdditionalServices && !['completed', 'cancelled'].includes(normalizeStatusCode(selectedOrder.status)) && (
                          <button
                            type="button"
                            onClick={() => setServiceToDelete(srv)}
                            className="text-[#b91c1c] hover:bg-[#fee2e2] px-2 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1 flex-none cursor-pointer"
                            title="Hủy dịch vụ này"
                          >
                            <span>🗑️</span> Xóa
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-2.5 rounded-[8px] bg-[#fdfefe] border border-dashed border-[#d2dfd8] text-center text-[#7e8e86] text-xs">
                    Chưa phát sinh dịch vụ sửa thêm. Khách có thể yêu cầu bổ sung bất cứ lúc nào trước khi hoàn tất sửa chữa.
                  </div>
                )}

                {/* 3. Dòng Tổng cộng thanh toán */}
                <div className="p-3 bg-[#eaf4ef] rounded-[8px] border-2 border-[#176b58] flex items-center justify-between">
                  <span className="font-bold text-xs uppercase tracking-wide text-[#176b58]">
                    TỔNG CỘNG THANH TOÁN:
                  </span>
                  <b className="text-lg font-bold text-[#176b58] font-heading">
                    {moneyFormatted(selectedOrder.total_price !== undefined ? selectedOrder.total_price : selectedOrder.price)}
                  </b>
                </div>
              </div>
            </div>

            {/* Quick State Transitions & Dynamic FSM UI Guard */}
            {(() => {
              const currentStatusCode = normalizeStatusCode(selectedOrder.status);
              const isWaitingQc = currentStatusCode === 'waiting_qc';
              const actions = getQuickActionsForStatus(currentStatusCode, role);
              const inTechPhase = isTechnicalStageStatus(currentStatusCode);

              return (
                <div className="space-y-2.5 pt-1 pb-3 border-b border-[#f0f3f1]">
                  {/* Status Banner cho CSKH khi đơn ở giai đoạn kỹ thuật */}
                  {role === 'cskh' && inTechPhase && currentStatusCode !== 'waiting_parts' && (
                    <div className="flex items-center gap-2.5 p-3 rounded-[8px] bg-[#eaf4ef] border border-[#d0e5d9] text-xs text-[#176b58]">
                      <span className="w-2 h-2 rounded-full bg-[#176b58] animate-pulse flex-none" />
                      <span>
                        <strong>Tiến độ:</strong> Thiết bị đang trong quá trình xử lý kỹ thuật bởi Kỹ Thuật. CSKH không can thiệp trạng thái ở bước này.
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[#75857d] font-bold">Chuyển trạng thái nhanh:</span>
                    {actions.length === 0 ? (
                      <span className="text-xs text-[#86968f] italic">
                        {role === 'cskh' && inTechPhase
                          ? 'Đang được Kỹ Thuật xử lý trong phòng kỹ thuật'
                          : currentStatusCode === 'completed'
                          ? 'Đơn hàng đã hoàn tất vòng đời'
                          : currentStatusCode === 'cancelled'
                          ? 'Đơn hàng đã hủy'
                          : 'Không có bước chuyển trạng thái tiếp theo'}
                      </span>
                    ) : (
                      actions.map((act) => (
                        <Button
                          key={act.targetStatus}
                          variant={act.variant || 'secondary'}
                          size="sm"
                          icon={act.icon}
                          disabled={isTransitioning}
                          onClick={() =>
                            handleUpdateStatus(act.label, act.statusType, act.targetStatus)
                          }
                        >
                          {act.label}
                        </Button>
                      ))
                    )}

                    {/* Nút thanh toán & bàn giao nhanh cho CSKH */}
                    {['ready_for_return', 'waiting_pickup'].includes(currentStatusCode) && (
                      <Button
                        variant="primary"
                        size="sm"
                        data-testid="cskh-checkout-btn-quick"
                        onClick={() => setCheckoutModalOpen(true)}
                        className="bg-[#176b58] hover:bg-[#125848] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
                      >
                        <span>💳 Thu tiền & Trả máy</span>
                      </Button>
                    )}

                    {/* Nút phụ điều hướng kiểm định QC khi đơn ở trạng thái Chờ QC */}
                    {isWaitingQc && (
                      <Button
                        variant="outline"
                        size="sm"
                        icon="arrow"
                        onClick={() => router.push(`/qc?id=${selectedOrder.id}`)}
                        className="text-[#176b58] font-semibold border-[#b8d9cb] hover:bg-[#eaf4ef]"
                      >
                        Mở phiếu kiểm định QC ↗
                      </Button>
                    )}
                  </div>

                  {/* Thông báo nghiệp vụ chuyên biệt cho trạng thái Chờ QC */}
                  {isWaitingQc && (
                    <div className="flex items-center gap-2 p-2.5 rounded-[8px] bg-[#f0f7f4] border border-[#d2e7dd] text-xs text-[#1c4d3d]">
                      <span className="w-2 h-2 rounded-full bg-[#176b58] animate-pulse flex-none" />
                      <span>
                        <strong>Lưu ý QC:</strong> Đơn hàng đang chờ kiểm định chất lượng. Kỹ thuật viên cần phối hợp với bộ phận QC để hoàn tất biên bản kiểm tra trước khi chuyển sang sẵn sàng giao trả.
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Specs & info */}
            <div className="space-y-2.5">
              <div className="flex justify-between py-1.5 border-b border-[#f1f4f2]">
                <span className="text-[#798881]">Mã serial / model:</span>
                <b>{selectedOrder.serial || 'Chưa cập nhật'}</b>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#f1f4f2]">
                <span className="text-[#798881]">Phụ kiện kèm theo:</span>
                <b>{selectedOrder.accessories || 'Không gửi kèm'}</b>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#f1f4f2]">
                <span className="text-[#798881]">Chi nhánh tiếp nhận:</span>
                <b>{selectedOrder.branch}</b>
              </div>
              <div className="py-1.5">
                <span className="text-[#798881] block mb-1">Mô tả lỗi tiếp nhận:</span>
                <p className="bg-[#f7faf8] p-3 rounded-[8px] border border-[#e5ece8] m-0 text-sm">
                  {selectedOrder.issue}
                </p>
              </div>

              {/* Checklist at counter */}
              {selectedOrder.checks && selectedOrder.checks.length > 0 && (
                <div className="pt-2">
                  <span className="text-[#72837b] font-bold block mb-1.5 text-xs uppercase tracking-wide">
                    Kết quả test tại quầy CSKH:
                  </span>
                  <div className="border border-[#e5ece8] rounded-[8px] overflow-hidden divide-y divide-[#f0f3f1]">
                    {selectedOrder.checks.map((chk, i) => (
                      <div key={i} className="flex justify-between p-2.5 text-sm">
                        <span>{chk.label}</span>
                        <b
                          className={
                            chk.status === 'Hoạt động'
                              ? 'text-[#287452]'
                              : chk.status === 'Lỗi'
                              ? 'text-[#b85c51]'
                              : 'text-[#7e8d85]'
                          }
                        >
                          {chk.status}
                        </b>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Intake Wizard Modal */}
      <IntakeWizardModal
        isOpen={intakeModalOpen}
        initialIntakeType={initialIntakeType}
        defaultOrderType={initialIntakeType}
        onClose={() => setIntakeModalOpen(false)}
        onSuccess={() => {
          setIntakeModalOpen(false);
          refetch();
          if (invalidateOrders) invalidateOrders();
        }}
      />

      {/* CSKH Simplified Checkout Modal */}
      {selectedOrder && (
        <CheckoutHandoverModal
          isOpen={checkoutModalOpen}
          order={selectedOrder}
          onClose={() => setCheckoutModalOpen(false)}
          onSuccess={(updatedOrder) => {
            setCheckoutModalOpen(false);
            setSelectedOrder(updatedOrder);
            refetch();
            if (invalidateOrders) invalidateOrders();
          }}
        />
      )}

      {/* Admin Edit Order Modal */}
      {selectedOrder && (role === 'admin' || role === 'super_admin') && (
        <AdminEditOrderModal
          isOpen={adminEditModalOpen}
          order={selectedOrder}
          onClose={() => setAdminEditModalOpen(false)}
          onSuccess={(updatedOrder) => {
            setAdminEditModalOpen(false);
            setSelectedOrder(updatedOrder);
            refetch();
            if (invalidateOrders) invalidateOrders();
          }}
        />
      )}

      {/* Admin Confirm Delete Order Modal */}
      {selectedOrder && (role === 'admin' || role === 'super_admin') && (
        <ConfirmDeleteOrderModal
          isOpen={adminDeleteModalOpen}
          order={selectedOrder}
          onClose={() => setAdminDeleteModalOpen(false)}
          onSuccess={() => {
            setAdminDeleteModalOpen(false);
            setSelectedOrder(null);
            refetch();
            if (invalidateOrders) invalidateOrders();
          }}
        />
      )}

      {/* Confirm Modal Xóa Dịch Vụ Bổ Sung */}
      {serviceToDelete && (
        <ConfirmModal
          isOpen={Boolean(serviceToDelete)}
          onClose={() => setServiceToDelete(null)}
          onConfirm={handleDeleteAdditionalService}
          title="Xác nhận hủy dịch vụ bổ sung"
          description={
            <div>
              Bạn có chắc chắn muốn hủy dịch vụ{' '}
              <strong className="text-[#1c302b]">&ldquo;{serviceToDelete.name}&rdquo;</strong>?
              <div className="mt-2 p-2 bg-[#fef2f2] rounded text-xs text-[#991b1b]">
                Số tiền <strong>{moneyFormatted(serviceToDelete.price)}</strong> sẽ tự động được trừ lại khỏi tổng thanh toán của đơn hàng.
              </div>
            </div>
          }
          confirmText="Xác nhận xóa"
          cancelText="Giữ lại"
          variant="danger"
          loading={isDeletingService}
        />
      )}
    </AppShell>
  );
}
