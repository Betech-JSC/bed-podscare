'use client';

import React, { useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
  StatusTag,
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
  Icon,
  sanitizeInputLive,
  sanitizeSearchQuery,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { IntakeWizardModal } from '../components/IntakeWizardModal';
import { CheckoutHandoverModal } from '../components/CheckoutHandoverModal';
import { AdminEditOrderModal } from '../components/AdminEditOrderModal';
import { ConfirmDeleteOrderModal } from '../components/ConfirmDeleteOrderModal';
import { RefundModal } from '../components/RefundModal';
import { usePodsCare } from '../providers';
import type {
  RepairOrder,
  AdditionalServiceItem,
  OrderDateFilter,
  OrderListMetaSummary,
  OrderWorkshopStepFilter,
} from '@podscare/types';
import { repairService, serviceService } from '@podscare/api-client';
import { useQuery } from '@tanstack/react-query';
import {
  normalizeStatusCode,
  getQuickActionsForStatus,
  isTechnicalStageStatus,
} from './fsm';
import { useSilentPrint, PrintButtonDropdown } from '../components/print';

type StatusCardKey = 'all' | 'open' | 'in_workshop' | 'waiting_pickup' | 'completed';
type WorkshopStepKey =
  | 'all'
  | 'inspecting'
  | 'waiting_approval'
  | 'in_repair'
  | 'waiting_parts'
  | 'waiting_qc'
  | 'overdue';

const WORKSHOP_STEP_KEYS: WorkshopStepKey[] = [
  'inspecting',
  'waiting_approval',
  'in_repair',
  'waiting_parts',
  'waiting_qc',
  'overdue',
];

function resolveStatusAndWorkshopStepFromUrl(
  statusParam: string,
  filterParam: string,
  workshopStepParam: string
): { statusCard: StatusCardKey; workshopStep: WorkshopStepKey } {
  const rawStep = (workshopStepParam || '').trim() as WorkshopStepKey;
  if (WORKSHOP_STEP_KEYS.includes(rawStep)) {
    return { statusCard: 'in_workshop', workshopStep: rawStep };
  }

  const rawStatus = (statusParam || (filterParam === 'overdue' ? 'overdue' : filterParam)).trim();
  if (WORKSHOP_STEP_KEYS.includes(rawStatus as WorkshopStepKey)) {
    return { statusCard: 'in_workshop', workshopStep: rawStatus as WorkshopStepKey };
  }
  if (rawStatus === 'qc_pending' || rawStatus === 'qc_inspecting') {
    return { statusCard: 'in_workshop', workshopStep: 'waiting_qc' };
  }
  if (rawStatus === 'quote_pending') {
    return { statusCard: 'in_workshop', workshopStep: 'waiting_approval' };
  }
  if (['waiting_tech', 'assigned', 'rework_needed'].includes(rawStatus)) {
    return { statusCard: 'in_workshop', workshopStep: 'in_repair' };
  }
  if (rawStatus === 'ready_for_return' || rawStatus === 'waiting_pickup') {
    return { statusCard: 'waiting_pickup', workshopStep: 'all' };
  }
  if (['all', 'open', 'in_workshop', 'waiting_pickup', 'completed'].includes(rawStatus)) {
    return { statusCard: rawStatus as StatusCardKey, workshopStep: 'all' };
  }
  return { statusCard: 'all', workshopStep: 'all' };
}

function buildPageNumbers(current: number, total: number): Array<number | '...'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: Array<number | '...'> = [1];
  if (current > 3) {
    pages.push('...');
  }
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let p = start; p <= end; p++) {
    pages.push(p);
  }
  if (current < total - 2) {
    pages.push('...');
  }
  pages.push(total);
  return pages;
}

const VALID_DATE_FILTERS: OrderDateFilter[] = [
  'all',
  'today',
  'yesterday',
  '3_days',
  '7_days',
  'this_month',
  '30_days',
  'custom',
];

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
  const initialWorkshopStepParam = searchParams.get('workshop_step') || '';
  const initialOrderTypeParam = (searchParams.get('order_type') as any) || 'all';
  const initialBranchParam = searchParams.get('branch_id');
  const initialOrderIdParam = searchParams.get('id') || searchParams.get('order_id');
  const initialSearchParam = sanitizeInputLive(
    searchParams.get('search') || searchParams.get('q') || ''
  );
  const initialPageParam = Math.max(1, Number(searchParams.get('page')) || 1);
  const initialPerPageParam = [15, 20, 30, 50].includes(Number(searchParams.get('per_page')))
    ? Number(searchParams.get('per_page'))
    : 15;

  const initialResolvedStatus = resolveStatusAndWorkshopStepFromUrl(
    initialStatusParam,
    initialFilterParam,
    initialWorkshopStepParam
  );

  const initialDateFilterParam = searchParams.get('date_filter') as OrderDateFilter | null;

  const [dateFilter, setDateFilter] = useState<OrderDateFilter>(() => {
    if (initialDate) return 'custom';
    if (initialDateFilterParam && VALID_DATE_FILTERS.includes(initialDateFilterParam)) {
      return initialDateFilterParam;
    }
    if (
      initialStatusParam ||
      initialFilterParam ||
      initialWorkshopStepParam ||
      role === 'admin' ||
      currentUser?.role === 'admin'
    ) {
      return 'all';
    }
    return 'today';
  });
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [dateType, setDateType] = useState<'created_at' | 'completed_at'>(initialDateType);
  const [search, setSearch] = useState(initialSearchParam);
  const [statusCardFilter, setStatusCardFilter] = useState<StatusCardKey>(
    initialResolvedStatus.statusCard
  );
  const [workshopStepFilter, setWorkshopStepFilter] = useState<WorkshopStepKey>(
    initialResolvedStatus.workshopStep
  );
  const [orderTypeFilter, setOrderTypeFilter] = useState<
    'all' | 'in_store' | 'cod' | 'warranty' | 'special_parts'
  >(
    ['all', 'in_store', 'cod', 'warranty', 'special_parts'].includes(initialOrderTypeParam)
      ? initialOrderTypeParam
      : 'all'
  );
  const [currentPage, setCurrentPage] = useState<number>(initialPageParam);
  const [perPage, setPerPage] = useState<number>(initialPerPageParam);

  const [selectedOrder, setSelectedOrder] = useState<RepairOrder | null>(null);
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

  // Đồng bộ URL query params (status, filter, workshop_step, date_filter, date_type, date, order_type, search/q)
  React.useEffect(() => {
    const statusParam = searchParams.get('status') || '';
    const filterParam = searchParams.get('filter') || '';
    const wsParam = searchParams.get('workshop_step') || '';
    if (statusParam || filterParam || wsParam) {
      const resolved = resolveStatusAndWorkshopStepFromUrl(statusParam, filterParam, wsParam);
      setStatusCardFilter(resolved.statusCard);
      setWorkshopStepFilter(resolved.workshopStep);
    }

    const otParam = searchParams.get('order_type') as any;
    if (otParam && ['all', 'in_store', 'cod', 'warranty', 'special_parts'].includes(otParam)) {
      setOrderTypeFilter(otParam);
    }

    const dtParam = searchParams.get('date_type');
    if (dtParam === 'completed_at' || dtParam === 'handed_over_at') {
      setDateType('completed_at');
    } else if (dtParam === 'created_at') {
      setDateType('created_at');
    }

    const dateParam = searchParams.get('date');
    if (dateParam) {
      setSelectedDate(dateParam);
      setDateFilter('custom');
    }

    const urlSearch = searchParams.get('search') ?? searchParams.get('q');
    if (urlSearch !== null) {
      setSearch(sanitizeInputLive(urlSearch));
    }

    const dfParam = searchParams.get('date_filter') as OrderDateFilter | null;
    if (!dateParam) {
      if (dfParam && VALID_DATE_FILTERS.includes(dfParam)) {
        setDateFilter(dfParam);
      } else if (
        statusParam ||
        filterParam ||
        wsParam ||
        role === 'admin' ||
        currentUser?.role === 'admin'
      ) {
        setDateFilter('all');
      }
    }
    setCurrentPage(1);
  }, [searchParams, role, currentUser?.role]);

  // Khởi tạo branch_id và intake=warranty từ URL nếu có
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

  // Nạp đơn hàng qua API với Server-side Pagination chuẩn + meta.summary
  const {
    data: apiOrdersData,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: [
      'repairs',
      branchId,
      search,
      dateFilter,
      selectedDate,
      dateType,
      orderTypeFilter,
      statusCardFilter,
      workshopStepFilter,
      currentPage,
      perPage,
    ],
    queryFn: async () => {
      const params: Record<string, any> = {
        page: currentPage,
        per_page: perPage,
        date_type: dateType,
        order_type: orderTypeFilter,
        status: statusCardFilter,
      };
      if (statusCardFilter === 'in_workshop' && workshopStepFilter && workshopStepFilter !== 'all') {
        params.workshop_step = workshopStepFilter as OrderWorkshopStepFilter;
      }

      const cleanSearch = sanitizeSearchQuery(search);
      if (selectedDate) {
        params.date = selectedDate;
      } else {
        params.date_filter = dateFilter === 'custom' ? 'all' : dateFilter;
      }

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
        normalized_total_price:
          o.normalized_total_price !== undefined && o.normalized_total_price !== null
            ? Number(o.normalized_total_price)
            : null,
        paid_amount:
          o.paid_amount !== undefined && o.paid_amount !== null ? Number(o.paid_amount) : null,
        cash_paid_amount:
          o.cash_paid_amount !== undefined && o.cash_paid_amount !== null
            ? Number(o.cash_paid_amount)
            : null,
        transfer_paid_amount:
          o.transfer_paid_amount !== undefined && o.transfer_paid_amount !== null
            ? Number(o.transfer_paid_amount)
            : null,
        remaining_amount:
          o.remaining_amount !== undefined && o.remaining_amount !== null
            ? Number(o.remaining_amount)
            : null,
        payment_method_summary: o.payment_method_summary,
        payment_status_label: o.payment_status_label,
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
        tenant: o.tenant || tenantBranding || currentUser?.tenant || undefined,
      };
    });
  }, [apiOrdersData, dateType, tenantBranding, currentUser?.tenant]);

  const metaSummary: OrderListMetaSummary | undefined =
    apiOrdersData?.meta?.summary || apiOrdersData?.summary;

  const paginationMeta = useMemo(() => {
    const meta = apiOrdersData?.meta || apiOrdersData || {};
    const total = Number(meta.total ?? apiOrdersData?.total ?? rawMappedOrders.length);
    const resolvedPerPage = Number(meta.per_page ?? apiOrdersData?.per_page ?? perPage) || 15;
    const resolvedCurrentPage = Number(meta.current_page ?? apiOrdersData?.current_page ?? currentPage) || 1;
    const lastPage = Math.max(
      1,
      Number(meta.last_page ?? apiOrdersData?.last_page ?? Math.ceil(total / resolvedPerPage)) || 1
    );
    const from =
      total === 0
        ? 0
        : Number(meta.from ?? apiOrdersData?.from ?? (resolvedCurrentPage - 1) * resolvedPerPage + 1);
    const to =
      total === 0
        ? 0
        : Number(meta.to ?? apiOrdersData?.to ?? Math.min(total, resolvedCurrentPage * resolvedPerPage));

    return {
      total,
      perPage: resolvedPerPage,
      currentPage: resolvedCurrentPage,
      lastPage,
      from,
      to,
    };
  }, [apiOrdersData, rawMappedOrders.length, perPage, currentPage]);

  // Tầng 1: Số đếm 5 Tab phân loại đơn từ meta.summary.order_type_counts (giữ nguyên khi đổi tab hoặc chuyển trang)
  const orderCounts = useMemo(() => {
    const otc = metaSummary?.order_type_counts;
    if (otc) {
      return {
        total: Number(otc.all || 0),
        inStore: Number(otc.in_store || 0),
        cod: Number(otc.cod || 0),
        warranty: Number(otc.warranty || 0),
        specialParts: Number(otc.special_parts || 0),
      };
    }
    let total = 0;
    let inStore = 0;
    let cod = 0;
    let warranty = 0;
    let specialParts = 0;
    rawMappedOrders.forEach((o: any) => {
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
  }, [metaSummary, rawMappedOrders]);

  // Tầng 2: 5 Thẻ Đối Soát Trạng Thái & Dòng Tiền từ meta.summary.status_cards
  const statusCardsSummary = useMemo(() => {
    const sc = metaSummary?.status_cards;
    const counts = metaSummary?.status_counts;
    return {
      all: {
        count: Number(sc?.all?.count ?? counts?.all ?? 0),
        total_amount: sc?.all?.total_amount ?? 0,
      },
      open: {
        count: Number(sc?.open?.count ?? counts?.open ?? 0),
        total_amount: sc?.open?.total_amount ?? 0,
      },
      in_workshop: {
        count: Number(sc?.in_workshop?.count ?? counts?.in_workshop ?? 0),
        expected_amount: sc?.in_workshop?.expected_amount ?? sc?.in_workshop?.total_amount ?? 0,
      },
      waiting_pickup: {
        count: Number(sc?.waiting_pickup?.count ?? counts?.waiting_pickup ?? 0),
        total_amount: sc?.waiting_pickup?.total_amount ?? 0,
        deposit_amount: sc?.waiting_pickup?.deposit_amount ?? 0,
        uncollected_amount: sc?.waiting_pickup?.uncollected_amount ?? 0,
      },
      completed: {
        count: Number(sc?.completed?.count ?? counts?.completed ?? 0),
        collected_amount: sc?.completed?.collected_amount ?? sc?.completed?.total_amount ?? 0,
        cash_amount: sc?.completed?.cash_amount ?? 0,
        transfer_amount: sc?.completed?.transfer_amount ?? 0,
      },
    };
  }, [metaSummary]);

  // Dải Sub-filter 6 bước kỹ thuật + Quá hạn từ meta.summary.workshop_steps
  const workshopStepsCounts = useMemo(() => {
    const ws = metaSummary?.workshop_steps;
    return {
      all: Number(ws?.all ?? ws?.in_workshop ?? statusCardsSummary.in_workshop.count ?? 0),
      inspecting: Number(ws?.inspecting ?? 0),
      waiting_approval: Number(ws?.waiting_approval ?? 0),
      in_repair: Number(ws?.in_repair ?? 0),
      waiting_parts: Number(ws?.waiting_parts ?? 0),
      waiting_qc: Number(ws?.waiting_qc ?? 0),
      overdue: Number(ws?.overdue ?? 0),
    };
  }, [metaSummary, statusCardsSummary.in_workshop.count]);

  const filteredOrders: RepairOrder[] = rawMappedOrders;

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

  // Tự động mở chi tiết đơn khi điều hướng từ Notification Popover hoặc query param ?id=...
  React.useEffect(() => {
    if (initialOrderIdParam && filteredOrders.length > 0) {
      const target = filteredOrders.find(
        (o) => String(o.id) === String(initialOrderIdParam)
      );
      if (target) {
        setSelectedOrder(target);
      }
    }
  }, [initialOrderIdParam, filteredOrders]);


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

  // Admin / CSKH xác nhận đã mua linh kiện đặc biệt
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
      console.error('Fulfill special part error:', err);
      const errMsg =
        err?.response?.data?.message ||
        err?.message ||
        'Không thể xác nhận đã mua linh kiện.';
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

  const moneyFormatted = (n: number) =>
    n ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫' : '—';

  const isTechRole =
    role === 'tech' ||
    (role as string) === 'technician' ||
    currentUser?.role === 'tech' ||
    currentUser?.role === 'technician';

  const canManageAdditionalServices = role === 'cskh' || role === 'admin' || (role as string) === 'super_admin';
  const canManageShippingAddress = role === 'cskh' || role === 'admin' || (role as string) === 'super_admin';

  // Đồng bộ địa chỉ giao hàng khi mở đơn khác
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
      console.error('Failed to update shipping address:', err);
      const errMsg = err?.response?.data?.message || err?.message || 'Không thể cập nhật địa chỉ giao hàng.';
      toast(errMsg, 'error');
    } finally {
      setIsSavingShippingAddress(false);
    }
  };

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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="md"
              data-testid="repairs-warranty-intake-btn"
              onClick={() => {
                setInitialIntakeType('warranty');
                setIntakeModalOpen(true);
              }}
              className="bg-[#eaf5ef] text-[#176b58] border-[#a9c9b9] hover:bg-[#d8ede1] font-bold flex items-center gap-1.5"
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

        {/* Panel with Two-Tier Reconciliation Bar, Table, and Server-side Pagination */}
        <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs space-y-4">
          {/* TẦNG 1: Toolbar Tìm kiếm & Bộ lọc Ngữ cảnh */}
          <div
            data-testid="repairs-tier1-context-bar"
            className="space-y-3 border-b border-[#e5ece8] pb-4"
          >
            {/* Hàng 1: Ô tìm kiếm + Toggle Ngày nhận/Ngày bàn giao + Kỳ thời gian + Chọn ngày + Chi nhánh + Làm mới */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Ô tìm kiếm đa năng */}
              <div className="relative flex-1 min-w-[220px] max-w-[340px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#91a098] pointer-events-none">
                  <Icon name="search" size={16} />
                </span>
                <input
                  type="text"
                  data-testid="repairs-search-input"
                  value={search}
                  onChange={(e) => {
                    setSearch(sanitizeInputLive(e.target.value));
                    setCurrentPage(1);
                  }}
                  placeholder="Tìm mã đơn, tên khách, SĐT, serial, thiết bị..."
                  className="w-full h-9 pl-9 pr-8 border border-[#d6dfda] rounded-[8px] text-xs sm:text-sm text-[#1c302b] bg-[#fafcfa] outline-none focus:border-[#176b58] focus:bg-white transition-all placeholder:text-[#8f9f97]"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setCurrentPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#7c8c84] hover:text-[#1c302b] cursor-pointer"
                  >
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>

              {/* Cụm điều khiển Thời gian & Chi nhánh */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Toggle Ngày nhận / Ngày bàn giao */}
                <div className="flex items-center gap-1 bg-[#f4f7f5] p-0.5 rounded-[8px] border border-[#e5ece8]">
                  <button
                    type="button"
                    data-testid="date-type-created"
                    onClick={() => {
                      setDateType('created_at');
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                      dateType === 'created_at'
                        ? 'bg-white text-[#176b58] shadow-xs'
                        : 'text-[#667a70] hover:text-[#1c302b]'
                    }`}
                  >
                    Ngày nhận
                  </button>
                  <button
                    type="button"
                    data-testid="date-type-completed"
                    onClick={() => {
                      setDateType('completed_at');
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                      dateType === 'completed_at'
                        ? 'bg-white text-[#176b58] shadow-xs'
                        : 'text-[#667a70] hover:text-[#1c302b]'
                    }`}
                  >
                    Ngày bàn giao
                  </button>
                </div>

                {/* Cụm chọn Kỳ nhanh */}
                <div className="flex items-center gap-1 flex-wrap">
                  {(
                    [
                      { key: 'all', label: 'Toàn bộ' },
                      { key: 'today', label: 'Hôm nay' },
                      { key: 'yesterday', label: 'Hôm qua' },
                      { key: '7_days', label: '7 ngày qua' },
                      { key: 'this_month', label: 'Tháng này' },
                    ] as Array<{ key: OrderDateFilter; label: string }>
                  ).map((item) => {
                    const isActive = !selectedDate && dateFilter === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        data-testid={`date-filter-${item.key}`}
                        onClick={() => {
                          setSelectedDate('');
                          setDateFilter(item.key);
                          setCurrentPage(1);
                        }}
                        className={`px-2.5 py-1 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center ${
                          isActive
                            ? 'bg-[#176b58] text-white shadow-xs'
                            : 'bg-[#f4f7f5] text-[#556960] hover:bg-[#eaf0ec]'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                {/* Chọn ngày cụ thể */}
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    data-testid="date-picker-input"
                    value={selectedDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedDate(val);
                      if (val) {
                        setDateFilter('custom');
                      } else {
                        setDateFilter('all');
                      }
                      setCurrentPage(1);
                    }}
                    className="h-8 px-2 text-xs border border-[#d6dfda] rounded-[8px] bg-white text-[#1c302b] outline-none focus:border-[#176b58]"
                  />
                  {selectedDate && (
                    <button
                      type="button"
                      data-testid="clear-date-picker-btn"
                      onClick={() => {
                        setSelectedDate('');
                        setDateFilter('all');
                        setCurrentPage(1);
                      }}
                      className="text-xs text-[#819089] hover:text-[#bc5b52] font-semibold underline px-1 cursor-pointer"
                    >
                      Xóa lọc ngày
                    </button>
                  )}
                </div>

                {/* Bộ chọn Chi nhánh & Nút Làm mới */}
                <div className="flex items-center gap-2">
                  {role === 'admin' || (role as string) === 'super_admin' ? (
                    <select
                      data-testid="repairs-branch-select"
                      value={String(branchId || 'all')}
                      onChange={(e) => {
                        if (e.target.value === 'all') {
                          setBranch('Tất cả chi nhánh', 'all');
                        } else {
                          const b = branches.find((item) => String(item.id) === e.target.value);
                          if (b) setBranch(b.name, b.id);
                        }
                        setCurrentPage(1);
                      }}
                      className="h-8 border border-[#d6dfda] rounded-[8px] px-2.5 text-xs text-[#1c302b] bg-[#f9fbf9] font-semibold outline-none focus:border-[#176b58] cursor-pointer"
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
                  ) : (
                    <div className="h-8 border border-[#d6dfda] rounded-[8px] px-2.5 text-xs text-[#176b58] bg-[#eaf4ef] font-semibold flex items-center gap-1.5 cursor-default select-none pointer-events-none">
                      <Icon name="building" size={14} className="text-[#176b58]" />
                      <span>{branch}</span>
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="refresh"
                    disabled={isRepairsLoading}
                    onClick={() => refetch()}
                  >
                    {isRepairsLoading ? 'Đang tải...' : 'Làm mới'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Hàng 2: 5 Tab phân loại đơn đọc từ meta.summary.order_type_counts */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="tab-filter-all"
                  onClick={() => {
                    setOrderTypeFilter('all');
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    orderTypeFilter === 'all'
                      ? 'bg-[#176b58] text-white shadow-xs'
                      : 'bg-[#f4f7f5] text-[#556960] hover:bg-[#eaf0ec]'
                  }`}
                >
                  <span>Tất cả đơn</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                      orderTypeFilter === 'all' ? 'bg-white/25 text-white' : 'bg-[#e2e9e5] text-[#42584e]'
                    } ${isRepairsLoading ? 'animate-pulse opacity-60' : ''}`}
                  >
                    {orderCounts.total}
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="tab-filter-in-store"
                  onClick={() => {
                    setOrderTypeFilter('in_store');
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    orderTypeFilter === 'in_store'
                      ? 'bg-[#176b58] text-white shadow-xs'
                      : 'bg-[#f4f7f5] text-[#556960] hover:bg-[#eaf0ec]'
                  }`}
                >
                  <span>Tại quầy</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                      orderTypeFilter === 'in_store' ? 'bg-white/25 text-white' : 'bg-[#e2e9e5] text-[#42584e]'
                    } ${isRepairsLoading ? 'animate-pulse opacity-60' : ''}`}
                  >
                    {orderCounts.inStore}
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="tab-filter-cod"
                  onClick={() => {
                    setOrderTypeFilter('cod');
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    orderTypeFilter === 'cod'
                      ? 'bg-[#915e1b] text-white shadow-xs'
                      : 'bg-[#fcfaf5] text-[#915e1b] border border-[#ebd9bd] hover:bg-[#fbf3e5]'
                  }`}
                >
                  <span>Ship COD</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                      orderTypeFilter === 'cod' ? 'bg-white/25 text-white' : 'bg-[#fbf3e5] text-[#78490f]'
                    } ${isRepairsLoading ? 'animate-pulse opacity-60' : ''}`}
                  >
                    {orderCounts.cod}
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="tab-filter-warranty"
                  onClick={() => {
                    setOrderTypeFilter('warranty');
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    orderTypeFilter === 'warranty'
                      ? 'bg-[#176b58] text-white shadow-xs'
                      : 'bg-[#eaf4ef] text-[#176b58] border border-[#b8d7c8] hover:bg-[#d8ede1]'
                  }`}
                >
                  <span>Bảo hành</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                      orderTypeFilter === 'warranty' ? 'bg-white/25 text-white' : 'bg-[#d5eadf] text-[#176b58]'
                    } ${isRepairsLoading ? 'animate-pulse opacity-60' : ''}`}
                  >
                    {orderCounts.warranty}
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="tab-filter-special-parts"
                  onClick={() => {
                    setOrderTypeFilter('special_parts');
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    orderTypeFilter === 'special_parts'
                      ? 'bg-[#bc5b52] text-white shadow-xs'
                      : 'bg-[#fcf4f2] text-[#bc5b52] border border-[#f3c7c2] hover:bg-[#fbefed]'
                  }`}
                >
                  <Icon name="bell" size={14} />
                  <span>Cần mua LK</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                      orderTypeFilter === 'special_parts'
                        ? 'bg-white/25 text-white'
                        : 'bg-[#fbefed] text-[#bc5b52] border border-[#f3c7c2] font-bold'
                    } ${isRepairsLoading ? 'animate-pulse opacity-60' : ''}`}
                  >
                    {orderCounts.specialParts}
                  </span>
                </button>
              </div>

              {selectedDate ? (
                <span className="text-[11px] text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded-full font-semibold">
                  Đang lọc ngày {selectedDate} ({dateType === 'completed_at' ? 'ngày bàn giao' : 'ngày nhận'})
                </span>
              ) : null}
            </div>
          </div>

          {/* TẦNG 2: Dải 5 Thẻ Đối Soát Trạng Thái & Dòng Tiền (Server-side Summary Cards) */}
          <div className="space-y-2.5 border-b border-[#e5ece8] pb-4">
            <div
              data-testid="admin-repairs-status-reconciliation-bar"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5"
            >
              {/* Thẻ 1: Tất cả trạng thái */}
              <button
                type="button"
                data-testid="status-pill-all"
                onClick={() => {
                  setStatusCardFilter('all');
                  setWorkshopStepFilter('all');
                  setCurrentPage(1);
                }}
                className={`p-3 rounded-[10px] border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  statusCardFilter === 'all'
                    ? 'bg-[#176b58] text-white border-[#176b58] shadow-xs'
                    : 'bg-[#fafcfa] text-[#1c302b] border-[#dce6e0] hover:border-[#176b58]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs font-bold ${
                      statusCardFilter === 'all' ? 'text-white' : 'text-[#4e5e56]'
                    }`}
                  >
                    Tất cả trạng thái
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-mono font-extrabold ${
                      statusCardFilter === 'all'
                        ? 'bg-white/20 text-white'
                        : 'bg-[#eaf4ef] text-[#176b58]'
                    }`}
                  >
                    {statusCardsSummary.all.count} đơn
                  </span>
                </div>
                {!isTechRole && (
                  <div
                    className={`text-[11px] font-medium mt-1.5 ${
                      statusCardFilter === 'all' ? 'text-white/90' : 'text-[#667a70]'
                    }`}
                  >
                    Tổng giá trị:{' '}
                    <b className="font-mono">
                      {moneyFormatted(Number(statusCardsSummary.all.total_amount || 0))}
                    </b>
                  </div>
                )}
              </button>

              {/* Thẻ 2: Đơn đang mở */}
              <button
                type="button"
                data-testid="status-pill-open"
                onClick={() => {
                  setStatusCardFilter('open');
                  setWorkshopStepFilter('all');
                  setCurrentPage(1);
                }}
                className={`p-3 rounded-[10px] border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  statusCardFilter === 'open'
                    ? 'bg-[#176b58] text-white border-[#176b58] shadow-xs'
                    : 'bg-[#f4f9f6] text-[#1c302b] border-[#c5e1d4] hover:border-[#176b58]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs font-bold ${
                      statusCardFilter === 'open' ? 'text-white' : 'text-[#176b58]'
                    }`}
                  >
                    Đơn đang mở
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-mono font-extrabold ${
                      statusCardFilter === 'open'
                        ? 'bg-white/20 text-white'
                        : 'bg-white text-[#176b58] border border-[#c5e1d4]'
                    }`}
                  >
                    {statusCardsSummary.open.count} đơn
                  </span>
                </div>
                <div
                  className={`text-[11px] font-medium mt-1.5 ${
                    statusCardFilter === 'open' ? 'text-white/90' : 'text-[#52635a]'
                  }`}
                >
                  {!isTechRole ? (
                    <>
                      Tổng giá trị:{' '}
                      <b className="font-mono">
                        {moneyFormatted(Number(statusCardsSummary.open.total_amount || 0))}
                      </b>{' '}
                      <span className="opacity-80">
                        ({statusCardsSummary.in_workshop.count} xưởng ·{' '}
                        {statusCardsSummary.waiting_pickup.count} chờ nhận)
                      </span>
                    </>
                  ) : (
                    <span>
                      {statusCardsSummary.in_workshop.count} trong xưởng ·{' '}
                      {statusCardsSummary.waiting_pickup.count} chờ nhận
                    </span>
                  )}
                </div>
              </button>

              {/* Thẻ 3: Đang trong xưởng */}
              <button
                type="button"
                data-testid="status-pill-in-workshop"
                onClick={() => {
                  setStatusCardFilter('in_workshop');
                  setWorkshopStepFilter('all');
                  setCurrentPage(1);
                }}
                className={`p-3 rounded-[10px] border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  statusCardFilter === 'in_workshop'
                    ? 'bg-[#176b58] text-white border-[#176b58] shadow-xs'
                    : 'bg-[#fafcfa] text-[#1c302b] border-[#dce6e0] hover:border-[#176b58]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs font-bold ${
                      statusCardFilter === 'in_workshop' ? 'text-white' : 'text-[#4e5e56]'
                    }`}
                  >
                    Đang trong xưởng
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-mono font-extrabold ${
                      statusCardFilter === 'in_workshop'
                        ? 'bg-white/20 text-white'
                        : 'bg-[#eaf4ef] text-[#176b58]'
                    }`}
                  >
                    {statusCardsSummary.in_workshop.count} đơn
                  </span>
                </div>
                {!isTechRole && (
                  <div
                    className={`text-[11px] font-medium mt-1.5 ${
                      statusCardFilter === 'in_workshop' ? 'text-white/90' : 'text-[#667a70]'
                    }`}
                  >
                    Giá trị dự kiến:{' '}
                    <b className="font-mono">
                      {moneyFormatted(Number(statusCardsSummary.in_workshop.expected_amount || 0))}
                    </b>
                  </div>
                )}
              </button>

              {/* Thẻ 4: Chờ khách nhận */}
              <button
                type="button"
                data-testid="status-pill-waiting-pickup"
                onClick={() => {
                  setStatusCardFilter('waiting_pickup');
                  setWorkshopStepFilter('all');
                  setCurrentPage(1);
                }}
                className={`p-3 rounded-[10px] border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  statusCardFilter === 'waiting_pickup'
                    ? 'bg-[#915e1b] text-white border-[#915e1b] shadow-xs'
                    : 'bg-[#fcfaf5] text-[#1c302b] border-[#ebd9bd] hover:border-[#915e1b]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs font-bold ${
                      statusCardFilter === 'waiting_pickup' ? 'text-white' : 'text-[#915e1b]'
                    }`}
                  >
                    Chờ khách nhận
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-mono font-extrabold ${
                      statusCardFilter === 'waiting_pickup'
                        ? 'bg-white/20 text-white'
                        : 'bg-[#fbf3e5] text-[#915e1b] border border-[#ebd9bd]'
                    }`}
                  >
                    {statusCardsSummary.waiting_pickup.count} đơn
                  </span>
                </div>
                {!isTechRole && (
                  <div
                    className={`text-[11px] font-medium mt-1.5 ${
                      statusCardFilter === 'waiting_pickup' ? 'text-white/90' : 'text-[#8c6527]'
                    }`}
                  >
                    Còn thu:{' '}
                    <b className="font-mono">
                      {moneyFormatted(
                        Number(statusCardsSummary.waiting_pickup.uncollected_amount || 0)
                      )}
                    </b>
                  </div>
                )}
              </button>

              {/* Thẻ 5: Đã bàn giao */}
              <button
                type="button"
                data-testid="status-pill-completed"
                onClick={() => {
                  setStatusCardFilter('completed');
                  setWorkshopStepFilter('all');
                  setCurrentPage(1);
                }}
                className={`p-3 rounded-[10px] border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  statusCardFilter === 'completed'
                    ? 'bg-[#176b58] text-white border-[#176b58] shadow-xs'
                    : 'bg-[#fafcfa] text-[#1c302b] border-[#dce6e0] hover:border-[#176b58]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs font-bold ${
                      statusCardFilter === 'completed' ? 'text-white' : 'text-[#4e5e56]'
                    }`}
                  >
                    Đã bàn giao
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-mono font-extrabold ${
                      statusCardFilter === 'completed'
                        ? 'bg-white/20 text-white'
                        : 'bg-[#eaf4ef] text-[#176b58]'
                    }`}
                  >
                    {statusCardsSummary.completed.count} đơn
                  </span>
                </div>
                {!isTechRole && (
                  <div
                    className={`text-[11px] font-medium mt-1.5 ${
                      statusCardFilter === 'completed' ? 'text-white/90' : 'text-[#667a70]'
                    }`}
                  >
                    Thực thu:{' '}
                    <b className="font-mono">
                      {moneyFormatted(Number(statusCardsSummary.completed.collected_amount || 0))}
                    </b>
                  </div>
                )}
              </button>
            </div>

            {/* Dải Sub-filter 6 bước kỹ thuật + Quá hạn khi chọn Đang trong xưởng */}
            {(statusCardFilter === 'in_workshop' || workshopStepFilter !== 'all') && (
              <div
                data-testid="workshop-steps-subfilter-bar"
                className="flex flex-wrap items-center gap-1.5 pt-1 bg-[#f7faf8] border border-[#dce8e1] rounded-[10px] p-2.5"
              >
                <span className="text-xs font-bold text-[#176b58] mr-1 flex items-center gap-1.5">
                  <Icon name="wrench" size={13} />
                  <span>Bước xử lý trong xưởng:</span>
                </span>
                {(
                  [
                    { key: 'all', label: 'Tất cả xưởng', count: workshopStepsCounts.all },
                    { key: 'inspecting', label: 'Kiểm tra', count: workshopStepsCounts.inspecting },
                    {
                      key: 'waiting_approval',
                      label: 'Chờ duyệt giá',
                      count: workshopStepsCounts.waiting_approval,
                    },
                    { key: 'in_repair', label: 'Đang sửa', count: workshopStepsCounts.in_repair },
                    {
                      key: 'waiting_parts',
                      label: 'Chờ LK',
                      count: workshopStepsCounts.waiting_parts,
                    },
                    { key: 'waiting_qc', label: 'Chờ QC', count: workshopStepsCounts.waiting_qc },
                  ] as Array<{ key: WorkshopStepKey; label: string; count: number }>
                ).map((step) => {
                  const isActive = workshopStepFilter === step.key;
                  return (
                    <button
                      key={step.key}
                      type="button"
                      data-testid={`workshop-step-${step.key}`}
                      onClick={() => {
                        setStatusCardFilter('in_workshop');
                        setWorkshopStepFilter(step.key);
                        setCurrentPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-[7px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        isActive
                          ? 'bg-[#176b58] text-white shadow-2xs'
                          : 'bg-white text-[#52635a] border border-[#d6e2db] hover:bg-[#edf4f0]'
                      }`}
                    >
                      <span>{step.label}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                          isActive ? 'bg-white/20 text-white' : 'bg-[#eaf4ef] text-[#176b58]'
                        }`}
                      >
                        {step.count}
                      </span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  data-testid="workshop-step-overdue"
                  onClick={() => {
                    setStatusCardFilter('in_workshop');
                    setWorkshopStepFilter('overdue');
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-[7px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    workshopStepFilter === 'overdue'
                      ? 'bg-[#bc5b52] text-white shadow-2xs'
                      : 'bg-[#fcf4f2] text-[#bc5b52] border border-[#f3c7c2] hover:bg-[#fbefed]'
                  }`}
                >
                  <Icon name="alert" size={12} />
                  <span>Quá hạn &gt;24h</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                      workshopStepFilter === 'overdue'
                        ? 'bg-white/20 text-white'
                        : 'bg-[#fbefed] text-[#bc5b52]'
                    }`}
                  >
                    {workshopStepsCounts.overdue}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* 4-Layer Resilient UI States */}
          {isError ? (
            <ErrorFallback onRetry={() => refetch()} />
          ) : isRepairsLoading ? (
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
            <div className="space-y-4">
              <div className="overflow-x-auto -mx-5 sm:mx-0">
                <table className="w-full text-left border-collapse min-w-[780px]">
                  <thead>
                    <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#809088] uppercase tracking-wider h-10">
                      <th className="px-3 py-2 text-center w-12 text-xs font-bold text-[#809088] uppercase tracking-wider">
                        STT
                      </th>
                      <th className="px-4">Mã đơn</th>
                      <th className="px-4">Khách hàng</th>
                      <th className="px-4">Thiết bị & lỗi</th>
                      <th className="px-4">Trạng thái</th>
                      {!isTechRole && <th className="px-4">Chi phí & Thanh toán</th>}
                      <th className="px-4">Kỹ thuật viên</th>
                      <th className="px-4">Ngày nhận & Kho</th>
                      <th className="px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f3f2] text-sm text-[#3b4c44]">
                    {filteredOrders.map((o, idx) => {
                      const continuousStt =
                        (paginationMeta.currentPage - 1) * paginationMeta.perPage + idx + 1;
                      const totalVal = Number(
                        o.normalized_total_price ?? o.total_price ?? o.price ?? 0
                      );
                      const paidVal = Number(o.paid_amount ?? 0);
                      const remainingVal = Number(
                        o.remaining_amount ?? Math.max(0, totalVal - paidVal)
                      );
                      const methodSummary = o.payment_method_summary;
                      const isCompletedStatus = normalizeStatusCode(o.status) === 'completed';
                      const isFullyPaid =
                        totalVal > 0 && (paidVal >= totalVal || (isCompletedStatus && remainingVal <= 0));
                      const methodLabel =
                        methodSummary === 'transfer'
                          ? 'VietQR/CK'
                          : methodSummary === 'mixed'
                          ? 'TM + CK'
                          : 'Tiền mặt';

                      return (
                        <tr
                          key={o.id}
                          onClick={() => setSelectedOrder(o)}
                          className="h-14 hover:bg-[#fbfcfb] cursor-pointer transition-colors"
                        >
                          <td
                            data-testid="order-row-stt"
                            className="px-3 py-3 text-center text-xs font-mono font-bold text-[#667a70]"
                          >
                            {continuousStt}
                          </td>
                          <td className="px-4">
                            <div className="font-mono font-bold text-[#176b58]">{o.id}</div>
                            <div className="mt-1">
                              {o.order_type === 'warranty' || o.orderType === 'warranty' ? (
                                <span
                                  data-testid="badge-order-type-warranty"
                                  className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#047857] bg-[#ecfdf5] px-1.5 py-0.5 rounded border border-[#a7f3d0]"
                                >
                                  Bảo hành
                                </span>
                              ) : o.order_type === 'cod' || o.orderType === 'cod' ? (
                                <span
                                  data-testid="badge-order-type-cod"
                                  className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#b45309] bg-[#fef3c7] px-1.5 py-0.5 rounded border border-[#fde68a]"
                                >
                                  Đơn COD
                                </span>
                              ) : (
                                <span
                                  data-testid="badge-order-type-in-store"
                                  className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#176b58] bg-[#eaf4ef] px-1.5 py-0.5 rounded border border-[#b8d7c8]"
                                >
                                  Tại quầy
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
                              {o.special_parts_status === 'pending' ||
                              o.specialPartsStatus === 'pending' ? (
                                <div
                                  data-testid={`badge-special-part-pending-${o.id}`}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-300 max-w-[210px] truncate shadow-2xs"
                                  title={`Linh kiện cần mua ngoài: ${
                                    o.special_parts_needed || o.specialPartsNeeded || 'Chưa cập nhật'
                                  }`}
                                >
                                  <Icon name="bell" size={12} className="text-red-600 flex-none" />
                                  <span className="truncate">
                                    Cần mua ngoài:{' '}
                                    {o.special_parts_needed || o.specialPartsNeeded || 'Cần tìm mua'}
                                  </span>
                                </div>
                              ) : o.special_parts_status === 'purchased' ||
                                o.specialPartsStatus === 'purchased' ? (
                                <div
                                  data-testid={`badge-special-part-purchased-${o.id}`}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#28805e] bg-[#eaf5ef] px-2 py-0.5 rounded border border-[#c2e4d3] max-w-[210px] truncate"
                                  title="Quầy đã mua xong linh kiện"
                                >
                                  <Icon name="check" size={12} className="text-[#28805e]" />
                                  <span className="truncate">Đã mua linh kiện</span>
                                </div>
                              ) : o.parts_needed ||
                                o.partsNeeded ||
                                normalizeStatusCode(o.status) === 'waiting_parts' ? (
                                <div
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b45309] bg-[#fef3c7] px-2 py-0.5 rounded border border-[#fde68a] max-w-[190px] truncate"
                                  title={`Linh kiện yêu cầu: ${
                                    o.parts_needed || o.partsNeeded || 'Chưa cập nhật'
                                  }`}
                                >
                                  <Icon name="package" size={12} />
                                  <span className="truncate">
                                    Cần: {o.parts_needed || o.partsNeeded || 'Chờ linh kiện'}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </td>
                          {!isTechRole && (
                            <td
                              data-testid={`order-row-payment-${o.id}`}
                              className="px-4 py-2.5"
                            >
                              <div className="font-mono font-bold text-[#1c302b]">
                                {moneyFormatted(totalVal)}
                              </div>
                              {totalVal <= 0 ? (
                                <span className="inline-flex items-center text-[10px] font-semibold text-[#556960] bg-[#f4f7f5] px-1.5 py-0.5 rounded border border-[#dce5e0] mt-0.5">
                                  Miễn phí / Bảo hành 0 ₫
                                </span>
                              ) : isFullyPaid ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#176b58] bg-[#eaf4ef] px-1.5 py-0.5 rounded border border-[#b8d7c8] mt-0.5">
                                  Đã thu đủ · {methodLabel}
                                </span>
                              ) : paidVal > 0 ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#915e1b] bg-[#fcfaf5] px-1.5 py-0.5 rounded border border-[#ebd9bd] mt-0.5">
                                  Đã cọc {moneyFormatted(paidVal)} · Còn thu{' '}
                                  {moneyFormatted(remainingVal)}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#bc5b52] bg-[#fcf4f2] px-1.5 py-0.5 rounded border border-[#f3c7c2] mt-0.5">
                                  Chưa thu
                                </span>
                              )}
                            </td>
                          )}
                          <td className="px-4 text-[#5e6f66]">{o.tech}</td>
                          <td className="px-4 text-[#7b8a82]">
                            <span className="block font-medium">{o.date}</span>
                            <span className="inline-block mt-0.5 text-xs font-mono font-bold text-[#176b58] bg-[#eaf4ef] px-1.5 py-0.5 rounded">
                              {o.branchName || o.branch}
                            </span>
                          </td>
                          <td className="px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {['ready_for_return', 'waiting_pickup', 'in_repair'].includes(
                                normalizeStatusCode(o.status)
                              ) ? (
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
                                  <Icon name="payments" size={12} />
                                  <span>Thanh toán</span>
                                </Button>
                              ) : normalizeStatusCode(o.status) === 'completed' ? (
                                <span
                                  data-testid={`row-paid-badge-${o.id}`}
                                  className="text-[11px] font-semibold text-[#667770] bg-[#edf2ef] px-2 py-0.5 rounded border border-[#d8e0dc] whitespace-nowrap"
                                >
                                  Đã thu
                                </span>
                              ) : null}

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
                                  Đã có linh kiện
                                </Button>
                              )}

                              {(o.special_parts_status === 'pending' ||
                                o.specialPartsStatus === 'pending') && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  data-testid={`row-fulfill-special-part-btn-${o.id}`}
                                  disabled={isFulfillingSpecialPart}
                                  className="text-xs bg-[#fffbeb] text-[#b45309] border-[#fde68a] hover:bg-[#fef3c7] font-bold whitespace-nowrap"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFulfillSpecialPart(o);
                                  }}
                                >
                                  Đã mua linh kiện
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
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Thanh điều khiển Server-side Pagination chuẩn */}
              <div
                data-testid="repairs-pagination-footer"
                className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#e5ece8] text-xs text-[#556960]"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    Hiển thị từ <b className="text-[#1c302b]">{paginationMeta.from}</b> đến{' '}
                    <b className="text-[#1c302b]">{paginationMeta.to}</b> trên tổng số{' '}
                    <b className="text-[#176b58]">{paginationMeta.total}</b> đơn
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span>Hiển thị:</span>
                    <select
                      data-testid="repairs-per-page-select"
                      value={perPage}
                      onChange={(e) => {
                        setPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="h-7 border border-[#d6dfda] rounded-[6px] px-2 text-xs text-[#1c302b] bg-white font-semibold outline-none focus:border-[#176b58] cursor-pointer"
                    >
                      <option value={15}>15 dòng/trang</option>
                      <option value={30}>30 dòng/trang</option>
                      <option value={50}>50 dòng/trang</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    data-testid="pagination-first"
                    disabled={paginationMeta.currentPage <= 1 || isRepairsLoading}
                    onClick={() => setCurrentPage(1)}
                    className="px-2.5 py-1 rounded-[6px] border border-[#d6dfda] bg-white text-xs font-semibold text-[#42584e] hover:bg-[#f4f7f5] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Trang đầu
                  </button>
                  <button
                    type="button"
                    data-testid="pagination-prev"
                    disabled={paginationMeta.currentPage <= 1 || isRepairsLoading}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-[6px] border border-[#d6dfda] bg-white text-xs font-semibold text-[#42584e] hover:bg-[#f4f7f5] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Trang trước
                  </button>

                  {buildPageNumbers(paginationMeta.currentPage, paginationMeta.lastPage).map(
                    (p, i) =>
                      p === '...' ? (
                        <span key={`ellipsis-${i}`} className="px-2 py-1 text-xs text-[#819089]">
                          ...
                        </span>
                      ) : (
                        <button
                          key={p}
                          type="button"
                          data-testid={`pagination-page-${p}`}
                          disabled={isRepairsLoading}
                          onClick={() => setCurrentPage(Number(p))}
                          className={`min-w-[28px] px-2 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                            paginationMeta.currentPage === p
                              ? 'bg-[#176b58] text-white border border-[#176b58]'
                              : 'bg-white text-[#42584e] border border-[#d6dfda] hover:bg-[#f4f7f5]'
                          }`}
                        >
                          {p}
                        </button>
                      )
                  )}

                  <button
                    type="button"
                    data-testid="pagination-next"
                    disabled={
                      paginationMeta.currentPage >= paginationMeta.lastPage || isRepairsLoading
                    }
                    onClick={() =>
                      setCurrentPage((p) => Math.min(paginationMeta.lastPage, p + 1))
                    }
                    className="px-2.5 py-1 rounded-[6px] border border-[#d6dfda] bg-white text-xs font-semibold text-[#42584e] hover:bg-[#f4f7f5] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Trang sau
                  </button>
                  <button
                    type="button"
                    data-testid="pagination-last"
                    disabled={
                      paginationMeta.currentPage >= paginationMeta.lastPage || isRepairsLoading
                    }
                    onClick={() => setCurrentPage(paginationMeta.lastPage)}
                    className="px-2.5 py-1 rounded-[6px] border border-[#d6dfda] bg-white text-xs font-semibold text-[#42584e] hover:bg-[#f4f7f5] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Trang cuối
                  </button>
                </div>
              </div>
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
          subtitle={`Số điện thoại: ${selectedOrder.phone} · Ngày tiếp nhận: ${selectedOrder.date} · ${
            (selectedOrder.order_type === 'warranty' || selectedOrder.orderType === 'warranty')
              ? 'Đơn tiếp nhận bảo hành'
              : ((selectedOrder.order_type === 'cod' || selectedOrder.orderType === 'cod') ? 'Đơn COD (Khách tỉnh)' : 'Đơn tại cửa hàng')
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

                {/* CSKH Simplified Checkout Button */}
                {['ready_for_return', 'waiting_pickup', 'in_repair'].includes(normalizeStatusCode(selectedOrder.status)) && (
                  <Button
                    variant="primary"
                    size="md"
                    icon="payments"
                    data-testid="cskh-checkout-btn"
                    onClick={() => setCheckoutModalOpen(true)}
                    className="bg-[#176b58] hover:bg-[#125848] text-white font-bold text-xs sm:text-sm shadow-sm"
                  >
                    Thu tiền & Trả máy
                  </Button>
                )}

                {/* Admin Full CRUD Actions */}
                {(role === 'admin' || role === 'super_admin') && (
                  <>
                    <Button
                      variant="outline"
                      size="md"
                      icon="edit"
                      data-testid="admin-edit-order-btn"
                      onClick={() => setAdminEditModalOpen(true)}
                      className="text-xs text-[#176b58] border-[#a9c9b9] hover:bg-[#eaf5ef] font-bold"
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

                {/* Refund Order Action (Admin, Super Admin, Cashier, CSKH) */}
                {['completed', 'ready_for_return', 'waiting_pickup'].includes(normalizeStatusCode(selectedOrder.status)) &&
                  normalizeStatusCode(selectedOrder.status) !== 'refunded' &&
                  ['admin', 'super_admin', 'cashier', 'cskh'].includes(role || '') && (
                    <Button
                      variant="outline"
                      size="md"
                      icon="payments"
                      data-testid="refund-order-btn"
                      onClick={() => setRefundModalOpen(true)}
                      className="text-xs text-[#d9383a] border-[#fecaca] hover:bg-[#fef2f2] font-bold"
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
          <div className="space-y-4 text-sm">
            {/* Đợt tiếp nhận liên kết đa thiết bị */}
            {selectedOrder.intake_batch_code && selectedOrderBatchOrders && selectedOrderBatchOrders.length > 1 && (
              <div className="p-3 bg-[#f0f8f4] rounded-[10px] border border-[#d0e5d9] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon name="package" size={16} className="text-[#176b58]" />
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

            {/* Khối thông tin nổi bật cảnh báo: Yêu cầu mua linh kiện ngoài */}
            {Boolean(selectedOrder.special_parts_needed || selectedOrder.specialPartsNeeded || selectedOrder.special_parts_status) && (
              <div
                data-testid="drawer-special-parts-warning"
                className={`p-4 rounded-[10px] border-2 space-y-3 shadow-xs ${
                  (selectedOrder.special_parts_status === 'purchased' || selectedOrder.specialPartsStatus === 'purchased')
                    ? 'bg-[#f4faf7] border-[#28805e]'
                    : 'bg-red-50/60 border-red-400 ring-1 ring-red-400/20'
                }`}
              >
                <div className={`flex items-center justify-between pb-2 border-b ${
                  (selectedOrder.special_parts_status === 'purchased' || selectedOrder.specialPartsStatus === 'purchased')
                    ? 'border-[#c2e4d3]'
                    : 'border-red-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <Icon
                      name={(selectedOrder.special_parts_status === 'purchased' || selectedOrder.specialPartsStatus === 'purchased') ? "cart" : "bell"}
                      size={16}
                      className={(selectedOrder.special_parts_status === 'purchased' || selectedOrder.specialPartsStatus === 'purchased') ? "text-[#28805e]" : "text-red-600"}
                    />
                    <h4 className={`text-xs font-bold uppercase tracking-wide m-0 ${
                      (selectedOrder.special_parts_status === 'purchased' || selectedOrder.specialPartsStatus === 'purchased')
                        ? 'text-[#28805e]'
                        : 'text-red-700'
                    }`}>
                      YÊU CẦU MUA LINH KIỆN NGOÀI (KTV BÁO QUẦY)
                    </h4>
                  </div>
                  <span
                    data-testid="drawer-special-parts-status"
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      (selectedOrder.special_parts_status === 'purchased' || selectedOrder.specialPartsStatus === 'purchased')
                        ? 'bg-[#eaf5ef] text-[#28805e] border border-[#c2e4d3]'
                        : 'bg-red-50 text-red-700 border border-red-300 font-bold'
                    }`}
                  >
                    {(selectedOrder.special_parts_status === 'purchased' || selectedOrder.specialPartsStatus === 'purchased')
                      ? 'Quầy đã mua linh kiện'
                      : 'Chờ Quầy tìm mua ngoài'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[#92400e] font-semibold block mb-0.5">Linh kiện cần mua ngoài:</span>
                    <b className="text-[#78350f] text-sm block">
                      {selectedOrder.special_parts_needed || selectedOrder.specialPartsNeeded || 'Chưa ghi rõ'}
                    </b>
                  </div>
                  <div>
                    <span className="text-[#92400e] font-semibold block mb-0.5">KTV yêu cầu:</span>
                    <b className="text-[#78350f] text-sm block">
                      {selectedOrder.tech || 'Kỹ thuật viên'}
                    </b>
                  </div>
                </div>

                {selectedOrder.special_parts_requested_at && (
                  <div className="text-xs text-[#92400e]">
                    <span>Thời gian yêu cầu: </span>
                    <b className="text-[#78350f]">{new Date(selectedOrder.special_parts_requested_at).toLocaleString('vi-VN')}</b>
                  </div>
                )}

                {selectedOrder.special_parts_fulfilled_at && (
                  <div className="text-xs text-[#1e583f] bg-[#eaf5ef] p-2 rounded border border-[#c2e4d3]">
                    <span>Đã mua lúc: </span>
                    <b>{new Date(selectedOrder.special_parts_fulfilled_at).toLocaleString('vi-VN')}</b>
                  </div>
                )}

                {/* 1 Nút hành động duy nhất cho Admin / CSKH */}
                {(selectedOrder.special_parts_status === 'pending' || selectedOrder.specialPartsStatus === 'pending') && (
                  <div className="pt-2 border-t border-[#fde68a] flex items-center justify-between">
                    <span className="text-xs text-[#92400e] italic font-medium">
                      Bấm xác nhận sau khi đã mua để chuyển đơn về bàn sửa KTV.
                    </span>
                    <Button
                      variant="primary"
                      size="md"
                      data-testid="fulfill-special-part-btn"
                      disabled={isFulfillingSpecialPart}
                      onClick={() => handleFulfillSpecialPart(selectedOrder)}
                      className="bg-[#d97706] hover:bg-[#b45309] text-white font-bold text-xs sm:text-sm px-4 py-2 shadow-sm cursor-pointer"
                    >
                      {isFulfillingSpecialPart ? 'Đang xử lý...' : 'Đã mua linh kiện'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Khối cảnh báo màu cam nổi bật khi đơn chờ linh kiện */}
            {(normalizeStatusCode(selectedOrder.status) === 'waiting_parts' || Boolean(selectedOrder.parts_needed) || Boolean(selectedOrder.partsNeeded)) && (
              <div className="p-4 bg-[#fffbeb] rounded-[10px] border border-[#fde68a] space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#b45309] uppercase tracking-wide m-0 flex items-center gap-1.5">
                    <Icon name="alert" size={14} className="text-[#b45309]" /> YÊU CẦU LINH KIỆN TỪ PHÒNG KỸ THUẬT
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
                      Đã có linh kiện - Báo KTV tiếp tục sửa
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Status overview strip */}
            <div className={`grid ${isTechRole ? 'grid-cols-2' : 'grid-cols-3'} gap-3 p-4 bg-[#fafbfa] rounded-[10px] border border-[#edf1ee]`}>
              <div>
                <span className="text-[#7e8e86] block text-xs mb-1">Trạng thái</span>
                <StatusTag label={selectedOrder.status} type={selectedOrder.statusType} />
              </div>
              {!isTechRole && (
                <div>
                  <span className="text-[#7e8e86] block text-xs mb-0.5">Chi phí sửa chữa</span>
                  <b className="text-base text-[#176b58] font-heading font-bold">
                    {moneyFormatted(selectedOrder.price)}
                  </b>
                </div>
              )}
              <div>
                <span className="text-[#7e8e86] block text-xs mb-0.5">Kỹ thuật viên</span>
                <b className="text-sm text-[#1c302b]">{selectedOrder.tech}</b>
              </div>
            </div>

            {/* BẢNG KÊ DỊCH VỤ SỬA CHỮA & CHI PHÍ */}
            <div className="p-4 bg-[#fbfdfc] rounded-[10px] border border-[#dce8e1] space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#e8f1ec]">
                <h4 className="text-xs font-bold text-[#176b58] uppercase tracking-[0.8px] m-0 flex items-center gap-1.5">
                  <Icon name="receipt" size={14} className="text-[#176b58]" />{' '}
                  {isTechRole ? 'BẢNG KÊ DỊCH VỤ SỬA CHỮA' : 'BẢNG KÊ DỊCH VỤ SỬA CHỮA & CHI PHÍ'}
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
                    <Icon name="plus" size={12} />
                    <span>Thêm dịch vụ sửa thêm</span>
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
                      Đóng
                    </button>
                  </div>

                  {serviceError && (
                    <div className="p-2 rounded bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] text-xs font-medium flex items-center gap-1.5">
                      <Icon name="alert" size={14} />
                      <span>{serviceError}</span>
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
                        {isSubmittingService ? 'Đang lưu...' : 'Xác nhận thêm dịch vụ'}
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
                  {!isTechRole && (
                    <div className="text-right">
                      <span className="font-bold text-sm text-[#2d3d35] font-mono">
                        {moneyFormatted(
                          normalizeVndPrice(
                            selectedOrder.initial_price !== undefined && selectedOrder.initial_price !== null
                              ? selectedOrder.initial_price
                              : selectedOrder.initialPrice !== undefined && selectedOrder.initialPrice !== null
                              ? selectedOrder.initialPrice
                              : selectedOrder.price
                          )
                        )}
                      </span>
                      <span className="block text-[10px] text-[#72837b]">Giá ban đầu</span>
                    </div>
                  )}
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
                            {!isTechRole && (
                              <span className="text-xs font-bold text-[#176b58] font-mono bg-white px-2 py-0.5 rounded border border-[#b8d9cb]">
                                +{moneyFormatted(srv.price)}
                              </span>
                            )}
                          </div>
                          {srv.note && (
                            <p className="text-[#556960] italic m-0 text-xs flex items-center gap-1">
                              <Icon name="comment" size={12} />
                              <span>Dặn dò: {srv.note}</span>
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
                            <Icon name="trash" size={12} />
                            <span>Xóa</span>
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
                {!isTechRole && (
                  <div className="p-3 bg-[#eaf4ef] rounded-[8px] border-2 border-[#176b58] flex items-center justify-between">
                    <span className="font-bold text-xs uppercase tracking-wide text-[#176b58]">
                      TỔNG CỘNG THANH TOÁN:
                    </span>
                    <b className="text-lg font-bold text-[#176b58] font-heading">
                      {moneyFormatted(
                        normalizeVndPrice(
                          selectedOrder.total_price !== undefined ? selectedOrder.total_price : selectedOrder.price
                        )
                      )}
                    </b>
                  </div>
                )}
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
                    {['ready_for_return', 'waiting_pickup', 'in_repair'].includes(currentStatusCode) && (
                      <Button
                        variant="primary"
                        size="sm"
                        icon="payments"
                        data-testid="cskh-checkout-btn-quick"
                        onClick={() => setCheckoutModalOpen(true)}
                        className="bg-[#176b58] hover:bg-[#125848] text-white font-bold text-xs shadow-sm"
                      >
                        Thu tiền & Trả máy
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

            {/* Khối Thông tin & Cập nhật nhanh Địa chỉ Giao hàng / Gửi trả máy (COD & Bảo hành) */}
            {(() => {
              const isWarrantyOrder = selectedOrder.order_type === 'warranty' || selectedOrder.orderType === 'warranty';
              const isCodOrder = selectedOrder.order_type === 'cod' || selectedOrder.orderType === 'cod';
              const hasShippingAddress = Boolean(selectedOrder.shipping_address || (selectedOrder as any).shippingAddress);
              const shouldShowShippingCard = isCodOrder || isWarrantyOrder || hasShippingAddress;

              if (!shouldShowShippingCard) return null;

              return (
                <div
                  data-testid="cod-shipping-address-card"
                  className={`p-4 rounded-[10px] border transition-all ${
                    hasShippingAddress
                      ? 'bg-[#f8faf9] border-[#d8e3dc]'
                      : isWarrantyOrder
                      ? 'bg-[#f0fdf4] border-[#bbf7d0]'
                      : 'bg-[#fffdf7] border-[#fde68a]'
                  }`}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-[#e8f1ec]">
                    <h4 className={`text-xs font-bold uppercase tracking-[0.8px] m-0 ${
                      isWarrantyOrder ? 'text-[#047857]' : 'text-[#b45309]'
                    }`}>
                      <span>
                        {isWarrantyOrder
                          ? 'ĐỊA CHỈ GỬI TRẢ MÁY BẢO HÀNH (KHÁCH TỈNH)'
                          : 'ĐỊA CHỈ GIAO HÀNG COD (KHÁCH TỈNH)'}
                      </span>
                    </h4>
                    {canManageShippingAddress && !isEditingShippingAddress && (
                      <button
                        type="button"
                        data-testid="edit-cod-shipping-address-btn"
                        onClick={() => {
                          setShippingAddressInput(
                            selectedOrder.shipping_address || (selectedOrder as any).shippingAddress || ''
                          );
                          setIsEditingShippingAddress(true);
                        }}
                        className="text-xs font-bold text-[#176b58] hover:text-[#125848] bg-[#eaf4ef] hover:bg-[#d8ece1] px-2.5 py-1 rounded-[6px] border border-[#b8d9cb] transition-colors cursor-pointer"
                      >
                        {hasShippingAddress ? 'Sửa địa chỉ' : '+ Thêm địa chỉ'}
                      </button>
                    )}
                  </div>

                  <div className="pt-2.5">
                    {isEditingShippingAddress ? (
                      <div className="space-y-2.5">
                        <Input
                          value={shippingAddressInput}
                          onChange={(e) => setShippingAddressInput(e.target.value)}
                          placeholder="Nhập số nhà, ngõ/đường, phường/xã, quận/huyện, tỉnh/thành phố..."
                          data-testid="inline-shipping-address-input"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSavingShippingAddress}
                            onClick={() => {
                              setIsEditingShippingAddress(false);
                              setShippingAddressInput(
                                selectedOrder.shipping_address || (selectedOrder as any).shippingAddress || ''
                              );
                            }}
                          >
                            Hủy
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            data-testid="save-cod-shipping-address-btn"
                            disabled={isSavingShippingAddress}
                            onClick={handleSaveShippingAddress}
                            className="bg-[#176b58] hover:bg-[#125848] text-white font-bold"
                          >
                            {isSavingShippingAddress ? 'Đang lưu...' : 'Lưu địa chỉ'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {hasShippingAddress ? (
                          <p className="text-sm text-[#1c302b] font-medium m-0 bg-white p-2.5 rounded-[6px] border border-[#d8e3dc]">
                            {selectedOrder.shipping_address || (selectedOrder as any).shippingAddress}
                          </p>
                        ) : (
                          <div className={`p-2.5 rounded-[6px] border border-dashed text-xs flex items-center justify-between gap-2 ${
                            isWarrantyOrder
                              ? 'bg-[#f0fdf4] border-[#bbf7d0] text-[#166534]'
                              : 'bg-[#fef8e7] border-[#fde68a] text-[#92400e]'
                          }`}>
                            <span>
                              {isWarrantyOrder
                                ? 'Chưa cập nhật địa chỉ gửi trả (CSKH ghi chú sau khi liên hệ khách)'
                                : 'Chưa cập nhật địa chỉ giao hàng (CSKH ghi chú sau khi liên hệ khách)'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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

              {/* Ghi chú kết quả test tại quầy */}
              {(selectedOrder.testNote || (selectedOrder as any).test_note) && (
                <div className="py-1.5" data-testid="order-detail-test-note-box">
                  <span className="text-[#176b58] font-bold block mb-1 text-xs uppercase tracking-wide">
                    Ghi chú kết quả test tại quầy:
                  </span>
                  <p className="bg-[#eaf5ef] p-3 rounded-[8px] border border-[#a9c9b9] text-[#176b58] m-0 text-sm whitespace-pre-wrap font-medium">
                    {selectedOrder.testNote || (selectedOrder as any).test_note}
                  </p>
                </div>
              )}

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

export default function RepairsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <RepairsPageContent />
    </Suspense>
  );
}
