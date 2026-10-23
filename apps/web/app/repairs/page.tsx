'use client';

import React, { useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
  Modal,
  useToast,
  ConfirmModal,
  Icon,
  sanitizeInputLive,
  sanitizeSearchQuery,
  matchesPhoneFlexible,
  resolveOrderStatus,
  formatVND,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { IntakeWizardModal } from '../components/IntakeWizardModal';
import { CheckoutHandoverModal } from '../components/CheckoutHandoverModal';
import { TechOrderDetailModal } from '../components/TechOrderDetailModal';
import { AdminEditOrderModal } from '../components/AdminEditOrderModal';
import { ConfirmDeleteOrderModal } from '../components/ConfirmDeleteOrderModal';
import { RefundModal } from '../components/RefundModal';
import { usePodsCare } from '../providers';
import type { RepairOrder, AdditionalServiceItem, OrderDateFilter } from '@podscare/types';
import { repairService, serviceService } from '@podscare/api-client';
import { useQuery } from '@tanstack/react-query';
import {
  normalizeStatusCode,
  canCompleteTechnicalRepair,
} from './fsm';
import { useSilentPrint, PrintButtonDropdown } from '../components/print';
import { RepairQueuePane } from './components/RepairQueuePane';
import { RepairCanvasPane } from './components/RepairCanvasPane';

function RepairsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { orders, updateOrder, branch, branchId, setBranch, branches, role, currentUser, tenantBranding, invalidateOrders } =
    usePodsCare();

  const normalizeVndPrice = (raw: unknown): number => {
    const val = Number(raw) || 0;
    if (val <= 1) return 0;
    const rounded = Math.round(val);
    if (rounded >= 500 && rounded % 1000 !== 0) return Math.round(rounded / 1000) * 1000;
    return rounded;
  };

  const initialDate = searchParams.get('date') || '';
  const initialDateTypeParam = searchParams.get('date_type');
  const initialDateType =
    initialDateTypeParam === 'completed_at' || initialDateTypeParam === 'handed_over_at'
      ? 'completed_at'
      : 'created_at';
  const initialStatusParam = searchParams.get('status') || '';
  const initialFilterParam = searchParams.get('filter') || '';
  const initialOrderTypeParam = (searchParams.get('order_type') as any) || 'all';
  const initialBranchParam = searchParams.get('branch_id');
  const initialOrderIdParam = searchParams.get('id') || searchParams.get('order_id');
  const initialSearchParam = sanitizeInputLive(
    searchParams.get('search') || searchParams.get('q') || ''
  );

  const backendToStatusLabelMap: Record<string, string> = {
    open: 'Đơn đang mở',
    in_workshop: 'Đang sửa trong xưởng',
    overdue: 'Trễ thời hạn (>24h)',
    inspecting: 'Đang kiểm tra',
    waiting_tech: 'Chờ kỹ thuật',
    assigned: 'Đã nhận đơn',
    waiting_approval: 'Chờ khách duyệt',
    in_repair: 'Đang sửa',
    waiting_parts: 'Chờ linh kiện',
    waiting_qc: 'Chờ QC',
    qc_pending: 'Chờ QC',
    ready_for_return: 'Sẵn sàng trả',
    waiting_pickup: 'Chờ khách nhận',
    completed: 'Hoàn tất',
    rejected: 'Từ chối sửa',
    cancelled: 'Đã hủy',
  };

  const resolvedInitialStatus =
    initialStatusParam || (initialFilterParam === 'overdue' ? 'overdue' : initialFilterParam);

  const [dateFilter, setDateFilter] = useState<OrderDateFilter>('today');
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [dateType, setDateType] = useState<'created_at' | 'completed_at'>(initialDateType);
  const [search, setSearch] = useState(initialSearchParam);
  const [statusFilter, setStatusFilter] = useState(
    backendToStatusLabelMap[resolvedInitialStatus] || resolvedInitialStatus
  );
  const [orderTypeFilter, setOrderTypeFilter] = useState<'all' | 'in_store' | 'cod' | 'warranty' | 'special_parts'>(
    ['all', 'in_store', 'cod', 'warranty', 'special_parts'].includes(initialOrderTypeParam)
      ? initialOrderTypeParam
      : 'all'
  );
  const [selectedOrder, setSelectedOrder] = useState<RepairOrder | null>(null);
  const [techCompleteOrder, setTechCompleteOrder] = useState<RepairOrder | null>(null);
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);
  const [initialIntakeType, setInitialIntakeType] = useState<'in_store' | 'cod' | 'warranty'>('in_store');
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [adminEditModalOpen, setAdminEditModalOpen] = useState(false);
  const [adminDeleteModalOpen, setAdminDeleteModalOpen] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isFulfillingSpecialPart, setIsFulfillingSpecialPart] = useState(false);
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

  // Inline edit COD shipping address (CSKH & Admin)
  const [isEditingShippingAddress, setIsEditingShippingAddress] = useState(false);
  const [shippingAddressInput, setShippingAddressInput] = useState('');
  const [isSavingShippingAddress, setIsSavingShippingAddress] = useState(false);

  // Đồng bộ URL query params
  React.useEffect(() => {
    const statusParam = searchParams.get('status') || '';
    const filterParam = searchParams.get('filter') || '';
    const rawStatus = statusParam || (filterParam === 'overdue' ? 'overdue' : filterParam);
    if (rawStatus) {
      setStatusFilter(backendToStatusLabelMap[rawStatus] || rawStatus);
    }
    const urlSearch = searchParams.get('search') ?? searchParams.get('q');
    if (urlSearch !== null) {
      setSearch(sanitizeInputLive(urlSearch));
    }
    const dfParam = searchParams.get('date_filter') as OrderDateFilter | null;
    const validDateFilters: OrderDateFilter[] = ['all', 'today', 'yesterday', '3_days', '7_days', '30_days'];
    if (dfParam && validDateFilters.includes(dfParam)) {
      setDateFilter(dfParam);
    } else if (rawStatus || role === 'admin' || currentUser?.role === 'admin') {
      setDateFilter('all');
    }
  }, [searchParams, role, currentUser?.role]);

  React.useEffect(() => {
    if (initialBranchParam && branches && branches.length > 0) {
      const b = branches.find((item) => String(item.id) === initialBranchParam);
      if (b) setBranch(b.name, b.id);
    }
    const intakeParam = searchParams.get('intake');
    if (intakeParam === 'warranty') {
      setInitialIntakeType('warranty');
      setIntakeModalOpen(true);
    }
  }, [initialBranchParam, branches, setBranch, searchParams]);

  const {
    data: apiOrdersData,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['repairs', branchId, search, dateFilter, selectedDate, dateType],
    queryFn: async () => {
      const params: Record<string, any> = {
        per_page: 500,
      };
      const cleanSearch = sanitizeSearchQuery(search);
      if (selectedDate) {
        params.date = selectedDate;
      } else if (cleanSearch) {
        params.date_filter = 'all';
      } else {
        params.date_filter = dateFilter;
      }
      params.date_type = dateType;

      if (branchId && branchId !== 'all') {
        params.branch_id = branchId;
      }
      if (cleanSearch) {
        params.q = cleanSearch;
      }
      const res = await repairService.getRepairs(params);
      return res?.data || res;
    },
  });

  const isRepairsLoading = isLoading || isFetching;

  const rawMappedOrders: RepairOrder[] = useMemo(() => {
    const raw = apiOrdersData?.data || apiOrdersData;
    const list = Array.isArray(raw) ? raw : [];

    return list.map((o: any) => {
      const rawStatus = o.status === 'qc_pending' ? 'waiting_qc' : o.status;
      const mappedStatus = resolveOrderStatus(rawStatus || o.status);
      const paidSum = Array.isArray(o.payments)
        ? o.payments
            .filter((p: any) => p?.status === 'paid')
            .reduce((sum: number, p: any) => sum + (Number(p?.amount) || 0), 0)
        : normalizeVndPrice(Number(o.paid_amount ?? o.paidAmount ?? 0) || 0);
      return {
        id: o.order_code || String(o.id),
        order_type: o.order_type || o.orderType || 'in_store',
        orderType: o.order_type || o.orderType || 'in_store',
        name: o.customer?.name || o.name || 'Khách lẻ',
        phone: o.customer?.phone || o.phone || '',
        deviceCategory: o.device_model?.category || o.deviceCategory || 'AirPods',
        device: o.device_model?.name || o.device || 'AirPods',
        serial: o.serial_number || o.serial || 'Chưa cập nhật',
        issue: o.issue_description || o.issue || 'Kiểm tra',
        status: mappedStatus.label,
        statusType: mappedStatus.type,
        price: normalizeVndPrice(Number(o.total_price) || Number(o.estimated_price) || Number(o.price) || 0),
        total_price: normalizeVndPrice(Number(o.total_price) || Number(o.price) || 0),
        paid_amount: paidSum,
        paidAmount: paidSum,
        payments: Array.isArray(o.payments) ? o.payments : [],
        initial_price: normalizeVndPrice(
          o.initial_price !== null && o.initial_price !== undefined
            ? Number(o.initial_price)
            : Number(o.total_price) || Number(o.price) || 0
        ),
        initialPrice: normalizeVndPrice(
          o.initial_price !== null && o.initial_price !== undefined
            ? Number(o.initial_price)
            : Number(o.total_price) || Number(o.price) || 0
        ),
        additional_services: Array.isArray(o.additional_services) ? o.additional_services : (Array.isArray(o.additionalServices) ? o.additionalServices : []),
        additionalServices: Array.isArray(o.additional_services) ? o.additional_services : (Array.isArray(o.additionalServices) ? o.additionalServices : []),
        device_model_id: o.device_model_id || o.device_model?.id || null,
        tech: o.technician?.name || o.tech || 'Chưa phân công',
        technicianId: o.technician_id ?? o.technician?.id ?? o.technicianId ?? null,
        technician_id: o.technician_id ?? o.technician?.id ?? o.technician_id ?? null,
        date: (() => {
          const dateVal =
            dateType === 'completed_at'
              ? o.handed_over_at || o.updated_at || o.created_at
              : o.created_at;
          return dateVal
            ? new Intl.DateTimeFormat('vi-VN').format(new Date(dateVal))
            : o.date || 'Hôm nay';
        })(),
        branch: o.branch?.name || o.branch || 'Chi nhánh FIXO',
        branchId: o.branch_id || o.branch?.id || o.branchId || 1,
        branchName: o.branch?.name || o.branchName || 'Chi nhánh FIXO',
        accessories: o.accessories,
        appearance: o.appearance_notes || o.appearance,
        testNote: o.test_note || o.testNote || (Array.isArray(o.intake_checklists) ? o.intake_checklists.find((c: any) => c.note)?.note : '') || '',
        test_note: o.test_note || o.testNote || '',
        repairNote: o.repair_note || o.repairNote,
        partsUsed: o.parts_used_summary || o.partsUsed,
        parts_needed: o.parts_needed ?? o.partsNeeded,
        partsNeeded: o.parts_needed ?? o.partsNeeded,
        special_parts_needed: o.special_parts_needed ?? o.specialPartsNeeded,
        specialPartsNeeded: o.special_parts_needed ?? o.specialPartsNeeded,
        special_parts_status: o.special_parts_status ?? o.specialPartsStatus,
        specialPartsStatus: o.special_parts_status ?? o.specialPartsStatus,
        special_parts_requested_at: o.special_parts_requested_at ?? o.specialPartsRequestedAt,
        specialPartsRequestedAt: o.special_parts_requested_at ?? o.specialPartsRequestedAt,
        special_parts_fulfilled_at: o.special_parts_fulfilled_at ?? o.specialPartsFulfilledAt,
        specialPartsFulfilledAt: o.special_parts_fulfilled_at ?? o.specialPartsFulfilledAt,
        warranty_terms_days: o.warranty_terms_days ?? (o.warranty_months ? Number(o.warranty_months) * 30 : undefined),
        warranty_months: o.warranty_months ?? (o.warranty_terms_days ? Math.round(Number(o.warranty_terms_days) / 30) : undefined),
        paused_at: o.paused_at ?? o.pausedAt,
        pausedAt: o.paused_at ?? o.pausedAt,
        finalCheck: o.final_check_result || o.finalCheck,
        qcIssue: o.qc_note || o.qcIssue,
        acceptedAt: o.tech_accepted_at || o.acceptedAt,
        startedAt: o.repair_started_at || o.startedAt,
        completedAt: o.repair_completed_at || o.completedAt,
        customerApprovedAt: o.customer_approved_at || o.customerApprovedAt,
        createdAt: o.created_at || o.createdAt,
        intake_batch_code: o.intake_batch_code,
        batchOrders: o.batch_orders || o.batchOrders,
        shipping_address: o.shipping_address || o.shippingAddress || null,
        shippingAddress: o.shipping_address || o.shippingAddress || null,
        tenant: o.tenant || tenantBranding || currentUser?.tenant || undefined,
      };
    });
  }, [apiOrdersData, dateType, tenantBranding, currentUser?.tenant]);

  const statusReconciliationCounts = useMemo(() => {
    const allCount = rawMappedOrders.length;
    let openCount = 0;
    let inWorkshopCount = 0;
    let waitingPickupCount = 0;
    let completedCount = 0;

    rawMappedOrders.forEach((o) => {
      if (!['Hoàn tất', 'Đã hủy', 'Từ chối sửa'].includes(o.status)) {
        openCount++;
      }
      if (
        !['Hoàn tất', 'Đã hủy', 'Từ chối sửa', 'Sẵn sàng trả', 'Chờ khách nhận'].includes(
          o.status
        )
      ) {
        inWorkshopCount++;
      }
      if (['Sẵn sàng trả', 'Chờ khách nhận'].includes(o.status)) {
        waitingPickupCount++;
      }
      if (o.status === 'Hoàn tất') {
        completedCount++;
      }
    });

    return {
      all: allCount,
      allCount,
      active: openCount,
      openCount,
      inWorkshop: inWorkshopCount,
      inWorkshopCount,
      waitingPickup: waitingPickupCount,
      waitingPickupCount,
      completed: completedCount,
      completedCount,
    };
  }, [rawMappedOrders]);

  const baseFilteredByStatus: RepairOrder[] = useMemo(() => {
    if (!statusFilter) return rawMappedOrders;
    if (statusFilter === 'Đơn đang mở') {
      return rawMappedOrders.filter(
        (item) => !['Hoàn tất', 'Đã hủy', 'Từ chối sửa'].includes(item.status)
      );
    }
    if (statusFilter === 'Đang sửa trong xưởng') {
      return rawMappedOrders.filter(
        (item) =>
          !['Hoàn tất', 'Đã hủy', 'Từ chối sửa', 'Sẵn sàng trả', 'Chờ khách nhận'].includes(
            item.status
          )
      );
    }
    if (statusFilter === 'Chờ khách nhận' || statusFilter === 'Sẵn sàng trả') {
      return rawMappedOrders.filter((item) =>
        ['Chờ khách nhận', 'Sẵn sàng trả'].includes(item.status)
      );
    }
    if (statusFilter === 'Chờ linh kiện') {
      return rawMappedOrders.filter(
        (item) =>
          (item.status === 'Chờ linh kiện' ||
            item.special_parts_status === 'pending' ||
            item.specialPartsStatus === 'pending') &&
          !['Hoàn tất', 'Đã hủy', 'Từ chối sửa'].includes(item.status)
      );
    }
    if (statusFilter === 'Trễ thời hạn (>24h)') {
      const cutoffMs = Date.now() - 24 * 3600 * 1000;
      return rawMappedOrders.filter((item) => {
        if (
          ['Hoàn tất', 'Đã hủy', 'Từ chối sửa', 'Sẵn sàng trả', 'Chờ khách nhận'].includes(
            item.status
          )
        ) {
          return false;
        }
        if (item.createdAt) {
          const ts = new Date(item.createdAt).getTime();
          if (!isNaN(ts)) return ts <= cutoffMs;
        }
        return true;
      });
    }
    if (statusFilter === 'Tiếp nhận mới' || statusFilter === 'Đang kiểm tra') {
      return rawMappedOrders.filter((item) =>
        ['Tiếp nhận mới', 'Đang kiểm tra'].includes(item.status)
      );
    }
    return rawMappedOrders.filter((item) => item.status === statusFilter);
  }, [rawMappedOrders, statusFilter]);

  const statusFilteredOrders = baseFilteredByStatus;

  const orderCounts = useMemo(() => {
    let total = 0;
    let inStore = 0;
    let cod = 0;
    let warranty = 0;
    let specialParts = 0;
    statusFilteredOrders.forEach((o: any) => {
      total++;
      const t = o.order_type || o.orderType || 'in_store';
      if (t === 'warranty') warranty++;
      else if (t === 'cod') cod++;
      else inStore++;
      if (o.special_parts_status === 'pending' || o.specialPartsStatus === 'pending') {
        specialParts++;
      }
    });
    return { total, inStore, cod, warranty, specialParts };
  }, [statusFilteredOrders]);

  const filteredOrders: RepairOrder[] = useMemo(() => {
    let base = statusFilteredOrders;
    if (orderTypeFilter === 'special_parts') {
      base = base.filter(
        (o: any) => (o.special_parts_status || o.specialPartsStatus) === 'pending'
      );
    } else if (orderTypeFilter !== 'all') {
      base = base.filter(
        (o: any) => (o.order_type || o.orderType || 'in_store') === orderTypeFilter
      );
    }
    const cleanQ = sanitizeSearchQuery(search).toLowerCase();
    if (!cleanQ) return base;
    return base.filter((o) => {
      return (
        o.id.toLowerCase().includes(cleanQ) ||
        o.name.toLowerCase().includes(cleanQ) ||
        o.phone.toLowerCase().includes(cleanQ) ||
        matchesPhoneFlexible(o.phone, cleanQ) ||
        (o.serial || '').toLowerCase().includes(cleanQ) ||
        o.device.toLowerCase().includes(cleanQ) ||
        o.issue.toLowerCase().includes(cleanQ)
      );
    });
  }, [statusFilteredOrders, orderTypeFilter, search]);

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

  React.useEffect(() => {
    if (initialOrderIdParam && filteredOrders.length > 0) {
      const target = filteredOrders.find((o) => String(o.id) === String(initialOrderIdParam));
      if (target) setSelectedOrder(target);
    }
  }, [initialOrderIdParam, filteredOrders]);

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
      const errMsg = err?.response?.data?.message || err?.message || 'Không thể mở lại ca sửa.';
      toast(errMsg, 'error');
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleFulfillSpecialPart = async (orderToFulfill: RepairOrder) => {
    try {
      setIsFulfillingSpecialPart(true);
      await repairService.fulfillSpecialPart(orderToFulfill.id, true);
      toast(`Đã xác nhận mua linh kiện cho đơn ${orderToFulfill.id}! Đơn đã được chuyển về bàn sửa KTV.`, 'success');
      refetch();
      if (invalidateOrders) await invalidateOrders();

      const updated: RepairOrder = {
        ...orderToFulfill,
        status: 'Đang sửa',
        statusType: 'progress',
        special_parts_status: 'purchased',
        specialPartsStatus: 'purchased',
        special_parts_fulfilled_at: new Date().toISOString(),
        specialPartsFulfilledAt: new Date().toISOString(),
        paused_at: null,
        pausedAt: null,
      };
      updateOrder(updated);
      if (selectedOrder && selectedOrder.id === orderToFulfill.id) {
        setSelectedOrder(updated);
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Không thể xác nhận đã mua linh kiện.';
      toast(errMsg, 'error');
    } finally {
      setIsFulfillingSpecialPart(false);
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

  const moneyFormatted = (n: number) => (n ? formatVND(n) : '—');

  const isTechRole =
    role === 'tech' ||
    (role as string) === 'technician' ||
    currentUser?.role === 'tech' ||
    currentUser?.role === 'technician';

  const canManageAdditionalServices = role === 'cskh' || role === 'admin' || (role as string) === 'super_admin';
  const canManageShippingAddress = role === 'cskh' || role === 'admin' || (role as string) === 'super_admin';

  React.useEffect(() => {
    if (selectedOrder) {
      setShippingAddressInput(selectedOrder.shipping_address || (selectedOrder as any).shippingAddress || '');
      setIsEditingShippingAddress(false);
    }
  }, [selectedOrder]);

  const handleSaveShippingAddress = async () => {
    if (!selectedOrder) return;
    setIsSavingShippingAddress(true);
    try {
      const addressValue = shippingAddressInput.trim() || null;
      await repairService.updateOrder(selectedOrder.id, {
        shipping_address: addressValue,
      });

      const updated: RepairOrder = {
        ...selectedOrder,
        shipping_address: addressValue,
        shippingAddress: addressValue,
      };

      updateOrder(updated);
      setSelectedOrder(updated);
      setIsEditingShippingAddress(false);
      const isWarranty = selectedOrder.order_type === 'warranty' || (selectedOrder as any).orderType === 'warranty';
      toast(
        isWarranty
          ? 'Đã cập nhật địa chỉ gửi trả bảo hành thành công!'
          : 'Đã cập nhật địa chỉ giao hàng COD thành công!',
        'success'
      );
      refetch();
      if (invalidateOrders) invalidateOrders();
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Không thể cập nhật địa chỉ giao hàng.';
      toast(errMsg, 'error');
    } finally {
      setIsSavingShippingAddress(false);
    }
  };

  const selectedOrderId = selectedOrder?.id;
  const selectedOrderDeviceModelId = (selectedOrder as any)?.device_model_id;

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
      .catch(() => {});

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
      toast(`Đã thêm dịch vụ "${newServiceName.trim()}" cho đơn ${selectedOrder.id}!`, 'success');

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

      const newTotalPrice = normalizeVndPrice(
        updatedRaw.total_price !== undefined
          ? Number(updatedRaw.total_price)
          : normalizeVndPrice(selectedOrder.initial_price ?? selectedOrder.price) +
              newAdditional.reduce((s: number, i: any) => s + (Number(i.price) || 0), 0)
      );

      const normalizedInitialPrice = normalizeVndPrice(
        updatedRaw.initial_price !== undefined
          ? Number(updatedRaw.initial_price)
          : selectedOrder.initial_price ?? selectedOrder.price
      );

      const updatedOrder: RepairOrder = {
        ...selectedOrder,
        price: newTotalPrice,
        total_price: newTotalPrice,
        initial_price: normalizedInitialPrice,
        initialPrice: normalizedInitialPrice,
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
      toast(`Đã hủy dịch vụ "${serviceToDelete.name}" thành công!`, 'success');

      const newAdditional = Array.isArray(updatedRaw.additional_services)
        ? updatedRaw.additional_services
        : (selectedOrder.additional_services || []).filter((s) => s.id !== serviceToDelete.id);

      const newTotalPrice = normalizeVndPrice(
        updatedRaw.total_price !== undefined
          ? Number(updatedRaw.total_price)
          : normalizeVndPrice(selectedOrder.initial_price ?? selectedOrder.price) +
              newAdditional.reduce((s: number, i: any) => s + (Number(i.price) || 0), 0)
      );

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
    { value: 'Đơn đang mở', label: 'Đơn đang mở' },
    { value: 'Đang sửa trong xưởng', label: 'Đang sửa trong xưởng' },
    { value: 'Chờ khách nhận', label: 'Chờ khách nhận' },
    { value: 'Trễ thời hạn (>24h)', label: 'Trễ thời hạn (>24h)' },
    { value: 'Tiếp nhận mới', label: 'Tiếp nhận mới' },
    { value: 'Chờ kỹ thuật', label: 'Chờ kỹ thuật' },
    { value: 'Đã nhận đơn', label: 'Đã nhận đơn' },
    { value: 'Đang kiểm tra', label: 'Đang kiểm tra' },
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

    // Chốt chặn Payment Gate trên UI: Nếu đơn có total_price > 0 và chưa thanh toán đủ,
    // mở CheckoutHandoverModal ("Thu tiền & Trả máy") thay vì gọi transition('completed') khô;
    // đơn 0 ₫ (bảo hành/miễn phí) hoặc đã thanh toán đủ vẫn hoàn tất bình thường.
    if (transitionKey === 'completed') {
      const orderTotal = normalizeVndPrice(selectedOrder.total_price ?? selectedOrder.price ?? 0);
      const discountAmt = normalizeVndPrice(selectedOrder.discount_amount ?? 0);
      const effectiveTotal = Math.max(0, orderTotal - discountAmt);
      const paidSum = Array.isArray(selectedOrder.payments)
        ? selectedOrder.payments
            .filter((p: any) => p?.status === 'paid')
            .reduce((s: number, p: any) => s + (Number(p?.amount) || 0), 0)
        : normalizeVndPrice(selectedOrder.paid_amount ?? selectedOrder.paidAmount ?? 0);

      if (effectiveTotal > 0 && paidSum < effectiveTotal) {
        setCheckoutModalOpen(true);
        return;
      }
    }

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
      if (transitionKey) {
        await repairService.transition(selectedOrder.id, { transition: transitionKey });
        refetch();
        if (invalidateOrders) await invalidateOrders();
      }
      toast(`Đã cập nhật ${selectedOrder.id} sang: ${nextStatus}`, 'success');
    } catch (err: any) {
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
            <div className="text-xs font-bold text-[#81908a] uppercase tracking-[1.05px] mb-1 flex items-center gap-2">
              <span>OPERATIONS</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#176b51]" />
              <span className="text-[#176b51] font-bold">
                {branchId === 'all' ? 'Toàn bộ chi nhánh' : branch}
              </span>
            </div>
            <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#17231f] m-0">
              Quản lý đơn sửa chữa
            </h1>
            <p className="text-sm text-[#81908a] mt-1 mb-0">
              Theo dõi toàn bộ vòng đời tiếp nhận, kiểm định và bàn giao theo từng chi nhánh.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="md"
              data-testid="repairs-warranty-intake-btn"
              onClick={() => {
                setInitialIntakeType('warranty');
                setIntakeModalOpen(true);
              }}
              className="bg-[#e9f4ef] text-[#176b51] border-[#cde4d8] hover:bg-[#d8ede1] font-bold flex items-center gap-1.5"
            >
              <Icon name="shield" size={14} />
              <span>Tiếp nhận bảo hành</span>
            </Button>
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
        </div>

        {/* Master Queue & Table Pane */}
        <RepairQueuePane
          orderTypeFilter={orderTypeFilter}
          setOrderTypeFilter={setOrderTypeFilter}
          orderCounts={orderCounts}
          dateType={dateType}
          setDateType={setDateType}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          dateFilter={dateFilter}
          setDateFilter={setDateFilter}
          role={role}
          currentUserRole={currentUser?.role}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          statusOptions={statusOptions}
          statusReconciliationCounts={statusReconciliationCounts}
          search={search}
          setSearch={setSearch}
          branch={branch}
          branchId={branchId}
          branches={branches}
          setBranch={setBranch}
          isRepairsLoading={isRepairsLoading}
          isError={isError}
          refetch={refetch}
          filteredOrders={filteredOrders}
          isTechRole={isTechRole}
          isFulfillingSpecialPart={isFulfillingSpecialPart}
          onSelectOrder={(order) => setSelectedOrder(order)}
          onOpenIntakeModal={() => setIntakeModalOpen(true)}
          onOpenTechComplete={(order) => setTechCompleteOrder(order)}
          onOpenCheckout={(order) => {
            setSelectedOrder(order);
            setCheckoutModalOpen(true);
          }}
          onResumeOrder={handleResumeOrder}
          onFulfillSpecialPart={handleFulfillSpecialPart}
          moneyFormatted={moneyFormatted}
        />
      </div>

      {/* Order Detail Modal (RepairCanvasPane) */}
      {selectedOrder && (
        <Modal
          isOpen={Boolean(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          maxWidth="lg"
          eyebrow={`REPAIR ORDER · ${selectedOrder.id}`}
          title={`${selectedOrder.device} · ${selectedOrder.name}`}
          subtitle={`Số điện thoại: ${selectedOrder.phone} · Ngày tiếp nhận: ${selectedOrder.date} · ${
            selectedOrder.order_type === 'warranty' || selectedOrder.orderType === 'warranty'
              ? 'Đơn tiếp nhận bảo hành'
              : selectedOrder.order_type === 'cod' || selectedOrder.orderType === 'cod'
              ? 'Đơn COD (Khách tỉnh)'
              : 'Đơn tại cửa hàng'
          }`}
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

                {canCompleteTechnicalRepair(selectedOrder.status, role || currentUser?.role) && (
                  <Button
                    variant="primary"
                    size="md"
                    icon="check"
                    data-testid="repairs-modal-tech-complete-btn"
                    onClick={() => setTechCompleteOrder(selectedOrder)}
                    className="bg-[#176b51] hover:bg-[#10583f] text-white font-bold text-xs sm:text-sm shadow-sm"
                  >
                    Hoàn thành sửa chữa
                  </Button>
                )}

                {['ready_for_return', 'waiting_pickup', 'in_repair', 'waiting_qc'].includes(
                  normalizeStatusCode(selectedOrder.status)
                ) && (
                  <Button
                    variant="primary"
                    size="md"
                    icon="payments"
                    data-testid="cskh-checkout-btn"
                    onClick={() => setCheckoutModalOpen(true)}
                    className="bg-[#176b51] hover:bg-[#10583f] text-white font-bold text-xs sm:text-sm shadow-sm"
                  >
                    Thu tiền & Trả máy
                  </Button>
                )}

                {(role === 'admin' || role === 'super_admin') && (
                  <>
                    <Button
                      variant="outline"
                      size="md"
                      icon="edit"
                      data-testid="admin-edit-order-btn"
                      onClick={() => setAdminEditModalOpen(true)}
                      className="text-xs text-[#176b51] border-[#cde4d8] hover:bg-[#e9f4ef] font-bold"
                    >
                      Sửa toàn diện
                    </Button>
                    <Button
                      variant="danger"
                      size="md"
                      icon="trash"
                      data-testid="admin-delete-order-btn"
                      onClick={() => setAdminDeleteModalOpen(true)}
                      className="text-xs font-bold"
                    >
                      Xóa đơn
                    </Button>
                  </>
                )}

                {['completed', 'ready_for_return', 'waiting_pickup'].includes(
                  normalizeStatusCode(selectedOrder.status)
                ) &&
                  normalizeStatusCode(selectedOrder.status) !== 'refunded' &&
                  ['admin', 'super_admin', 'cashier', 'cskh'].includes(role || '') && (
                    <Button
                      variant="outline"
                      size="md"
                      icon="payments"
                      data-testid="refund-order-btn"
                      onClick={() => setRefundModalOpen(true)}
                      className="text-xs text-[#bc5b52] border-[#f5c2c2] hover:bg-[#fbeaea] font-bold"
                    >
                      Hoàn tiền đơn
                    </Button>
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
          <RepairCanvasPane
            order={selectedOrder}
            batchOrders={selectedOrderBatchOrders}
            onSelectOrder={setSelectedOrder}
            role={role}
            isTechRole={isTechRole}
            canManageAdditionalServices={canManageAdditionalServices}
            canManageShippingAddress={canManageShippingAddress}
            isTransitioning={isTransitioning}
            isFulfillingSpecialPart={isFulfillingSpecialPart}
            onFulfillSpecialPart={handleFulfillSpecialPart}
            onResumeOrder={handleResumeOrder}
            onUpdateStatus={handleUpdateStatus}
            onQuickTechComplete={(order) => {
              setSelectedOrder(null);
              setTechCompleteOrder(order);
            }}
            onQuickCheckout={() => setCheckoutModalOpen(true)}
            onOpenQc={(orderId) => router.push(`/qc?id=${orderId}`)}
            showAddServiceForm={showAddServiceForm}
            setShowAddServiceForm={setShowAddServiceForm}
            newServiceName={newServiceName}
            setNewServiceName={setNewServiceName}
            newServicePrice={newServicePrice}
            setNewServicePrice={setNewServicePrice}
            newServiceId={newServiceId}
            setNewServiceId={setNewServiceId}
            newServiceNote={newServiceNote}
            setNewServiceNote={setNewServiceNote}
            serviceError={serviceError}
            setServiceError={setServiceError}
            isSubmittingService={isSubmittingService}
            availableServices={availableServices}
            onAddAdditionalService={handleAddAdditionalService}
            onRequestDeleteService={setServiceToDelete}
            isEditingShippingAddress={isEditingShippingAddress}
            setIsEditingShippingAddress={setIsEditingShippingAddress}
            shippingAddressInput={shippingAddressInput}
            setShippingAddressInput={setShippingAddressInput}
            isSavingShippingAddress={isSavingShippingAddress}
            onSaveShippingAddress={handleSaveShippingAddress}
            moneyFormatted={moneyFormatted}
            normalizeVndPrice={normalizeVndPrice}
          />
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
            const mergedOrder: RepairOrder = {
              ...updatedOrder,
              tenant:
                updatedOrder.tenant ||
                selectedOrder?.tenant ||
                tenantBranding ||
                currentUser?.tenant ||
                undefined,
            };
            setCheckoutModalOpen(false);
            setSelectedOrder(mergedOrder);
            updateOrder(mergedOrder);
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
            const mergedOrder: RepairOrder = {
              ...updatedOrder,
              tenant:
                updatedOrder.tenant ||
                selectedOrder?.tenant ||
                tenantBranding ||
                currentUser?.tenant ||
                undefined,
            };
            setAdminEditModalOpen(false);
            setSelectedOrder(mergedOrder);
            updateOrder(mergedOrder);
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

      {/* Refund Order Modal */}
      {selectedOrder && (
        <RefundModal
          isOpen={refundModalOpen}
          onClose={() => setRefundModalOpen(false)}
          order={selectedOrder}
          onSuccess={async () => {
            setRefundModalOpen(false);
            setSelectedOrder(null);
            refetch();
            if (invalidateOrders) await invalidateOrders();
          }}
        />
      )}

      {/* Tech Order Detail / Complete Repair Modal */}
      {techCompleteOrder && (
        <TechOrderDetailModal
          isOpen={Boolean(techCompleteOrder)}
          order={techCompleteOrder}
          onClose={() => setTechCompleteOrder(null)}
          onCompleteSuccess={() => {
            setTechCompleteOrder(null);
            refetch();
            if (invalidateOrders) invalidateOrders();
          }}
          currentUser={currentUser}
          invalidateOrders={invalidateOrders}
          updateOrder={updateOrder}
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
              <strong className="text-[#17231f]">&ldquo;{serviceToDelete.name}&rdquo;</strong>?
              <div className="mt-2 p-2 bg-[#fbeaea] rounded text-xs text-[#bc5b52]">
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

export default function RepairsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-[#81908a]">Đang tải đơn sửa chữa...</div>}>
      <RepairsPageContent />
    </Suspense>
  );
}
