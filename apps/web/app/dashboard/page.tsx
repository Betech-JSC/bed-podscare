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
import { CheckoutHandoverModal } from '../components/CheckoutHandoverModal';
import { ActionableTasksCenter } from './components/ActionableTasksCenter';
import { StaffPerformanceWidget } from './components/StaffPerformanceWidget';
import { ShiftCashbookSnapshot } from './components/ShiftCashbookSnapshot';
import { usePodsCare } from '../providers';
import { useShift } from '../providers/ShiftProvider';
import type { RepairOrder, RevenueOrderBreakdownItem } from '@podscare/types';
import { kpiService, repairService } from '@podscare/api-client';
import { useQuery } from '@tanstack/react-query';
import { normalizeStatusCode } from '../repairs/fsm';
import { useSilentPrint } from '../components/print';

export default function DashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { role, currentUser, orders, updateOrder, branchId, branch, invalidateOrders } = usePodsCare();
  const { refreshShift } = useShift();

  const [intakeModalOpen, setIntakeModalOpen] = useState(false);
  const [initialIntakeType, setInitialIntakeType] = useState<'in_store' | 'cod' | 'warranty'>('in_store');
  const [cskhPendingModalOpen, setCskhPendingModalOpen] = useState(false);
  const [period, setPeriod] = useState<'7_days' | '14_days' | '30_days'>('14_days');

  const todayStr = React.useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const yesterdayStr = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const [activePreset, setActivePreset] = useState<'today' | 'yesterday' | '7_days' | '30_days' | 'custom'>('today');

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });

  // Technician Workspace State
  const [techTab, setTechTab] = useState<'my_orders' | 'available' | 'completed'>('my_orders');
  const [selectedTechOrder, setSelectedTechOrder] = useState<RepairOrder | null>(null);
  const [techModalOpen, setTechModalOpen] = useState(false);
  const [isTechSubmitting, setIsTechSubmitting] = useState(false);
  const { printReceipt, isPrinting: isSilentPrinting } = useSilentPrint();

  // Checkout Handover Modal State for Admin Action Center & CSKH Dashboard
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<RepairOrder | null>(null);

  // Customer Revenue & Debt Drill-Down Modal State (Admin 4 Financial Cards)
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

  // Đấu nối KPI Dashboard API
  const { data: kpiData } = useQuery({
    queryKey: ['kpi-dashboard', branchId, period, selectedDate],
    queryFn: async () => {
      const res = await kpiService.getDashboardKpi({
        branch_id: branchId && branchId !== 'all' ? branchId : undefined,
        period,
        date: selectedDate,
      });
      return res?.data || res;
    },
  });

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

  // Máy chưa xong chi tiết tại xưởng (in_repair, waiting_parts, assigned, rework_needed)
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
      if (days > 0) {
        return `${days} ngày ${remHours > 0 ? `${remHours}h` : ''}`.trim();
      }
      if (hours > 0) {
        return `${hours} giờ`;
      }
      const mins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
      return `${mins} phút`;
    } catch {
      return '—';
    }
  };

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

  // Statistics for Dashboard Cards (Ưu tiên API KPI, fallback linh hoạt theo orders)
  const activeOrdersCount =
    kpiData?.active_orders ??
    branchOrders.filter((o) => !['Hoàn tất', 'Đã hủy'].includes(o.status)).length;

  const todayOrdersCount =
    kpiData?.intake_today ??
    branchOrders.filter((o) => {
      const todayFormatted = new Intl.DateTimeFormat('vi-VN').format(new Date());
      return o.date === 'Hôm nay' || o.date === todayFormatted;
    }).length;

  const branchRevenue = branchOrders
    .filter((o) => o.status === 'Hoàn tất')
    .reduce((sum, o) => sum + (o.price || 0), 0);

  const branchRevenueDisplay =
    kpiData?.monthly_revenue_formatted ?? formatVND(branchRevenue);

  const completedCount =
    kpiData?.completed_orders ??
    kpiData?.summary?.completed_orders ??
    branchOrders.filter((o) => o.status === 'Hoàn tất').length;

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
    total_uncollected_amount: 0,
    // Đơn bàn giao chưa thu đủ
    total_uncollected_amount_formatted:
      kpiData?.accounts_receivable_formatted ||
      kpiData?.reconciliation?.total_uncollected_amount_formatted ||
      '0 ₫',
  };

  // Chuẩn hóa nhãn Tháng & Ngày đang chọn
  const selectedMonthLabel = React.useMemo(() => {
    const parts = (selectedDate || todayStr).split('-');
    if (parts.length >= 2) {
      return `Tháng ${Number(parts[1])}/${parts[0]}`;
    }
    return `Tháng ${new Date().getMonth() + 1}/${new Date().getFullYear()}`;
  }, [selectedDate, todayStr]);

  const selectedDateDisplay = React.useMemo(() => {
    const parts = (selectedDate || todayStr).split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return selectedDate || todayStr;
  }, [selectedDate, todayStr]);

  // Tính toán Fallback thông minh từ branchOrders cho các máy đã xong (ready_for_return, waiting_pickup, completed)
  const { fallbackMonthlyBreakdown, fallbackDailyBreakdown } = React.useMemo(() => {
    const targetMonthPrefix = (selectedDate || todayStr).slice(0, 7); // YYYY-MM
    const targetDayStr = selectedDate || todayStr; // YYYY-MM-DD

    // Đếm tổng số đơn theo khách hàng để xác định Khách quen / Khách mới
    const customerCounts = new Map<string, number>();
    branchOrders.forEach((o) => {
      const key = (o.phone || o.name || '').trim();
      if (key) {
        customerCounts.set(key, (customerCounts.get(key) || 0) + 1);
      }
    });

    const extractIsoDate = (raw?: string | null): string => {
      if (!raw) return todayStr;
      if (raw === 'Hôm nay') return todayStr;
      if (raw === 'Hôm qua') return yesterdayStr;
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
      const dmyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (dmyMatch) {
        return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
      }
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      return todayStr;
    };

    const finishedOrders = branchOrders.filter((o) => {
      const code = normalizeStatusCode(o.status);
      return (
        ['ready_for_return', 'waiting_pickup', 'completed'].includes(code) ||
        ['Sẵn sàng trả', 'Chờ khách nhận', 'Hoàn tất', 'Đã trả máy'].includes(o.status)
      );
    });

    const toBreakdownItem = (o: RepairOrder): RevenueOrderBreakdownItem & { _isoDate: string } => {
      const code = normalizeStatusCode(o.status);
      const totalPrice = Number(o.total_price ?? o.price ?? 0);
      const rawPayments = Array.isArray((o as any).payments) ? (o as any).payments : [];

      let collectedAmount = 0;
      let cashAmount = 0;
      let transferAmount = 0;

      if (rawPayments.length > 0) {
        rawPayments.forEach((p: any) => {
          if (!p.status || p.status === 'paid' || p.status === 'completed') {
            const amt = Number(p.amount || 0);
            collectedAmount += amt;
            const method = String(p.payment_method || p.method || '').toLowerCase();
            if (method.includes('transfer') || method.includes('bank') || method.includes('qr')) {
              transferAmount += amt;
            } else {
              cashAmount += amt;
            }
          }
        });
      } else if ((o as any).collected_amount !== undefined || (o as any).paid_amount !== undefined) {
        collectedAmount = Number((o as any).collected_amount ?? (o as any).paid_amount ?? 0);
        cashAmount = Number((o as any).cash_amount ?? collectedAmount);
        transferAmount = Number((o as any).transfer_amount ?? 0);
      } else if (code === 'completed' || o.status === 'Hoàn tất') {
        collectedAmount = totalPrice;
        cashAmount = totalPrice;
      }

      const uncollectedAmount = Math.max(0, totalPrice - collectedAmount);
      const refDateRaw =
        (o as any).handed_over_at ||
        (o as any).completed_at ||
        (o as any).updated_at ||
        o.createdAt ||
        o.date;
      const isoDate = extractIsoDate(refDateRaw);
      const custKey = (o.phone || o.name || '').trim();

      return {
        id: o.id,
        order_code: (o as any).order_code || String(o.id),
        customer_id: (o as any).customer_id ?? (o as any).customerId ?? null,
        customer_name: o.name || (o as any).customer_name || 'Khách vãng lai',
        customer_phone: o.phone || (o as any).customer_phone || '',
        customer_orders_count: custKey ? customerCounts.get(custKey) || 1 : 1,
        device_name: o.device || (o as any).device_name || (o as any).device_model || 'Thiết bị',
        status: code || o.status,
        total_price: totalPrice,
        total_price_formatted: formatVND(totalPrice),
        collected_amount: collectedAmount,
        collected_amount_formatted: formatVND(collectedAmount),
        cash_amount: cashAmount,
        transfer_amount: transferAmount,
        uncollected_amount: uncollectedAmount,
        uncollected_amount_formatted: formatVND(uncollectedAmount),
        completed_at: refDateRaw || null,
        _isoDate: isoDate,
      };
    };

    const mapped = finishedOrders.map(toBreakdownItem);
    const monthly = mapped.filter((item) => item._isoDate.startsWith(targetMonthPrefix));
    const daily = mapped.filter((item) => item._isoDate === targetDayStr);

    return {
      fallbackMonthlyBreakdown: monthly,
      fallbackDailyBreakdown: daily,
    };
  }, [branchOrders, selectedDate, todayStr, yesterdayStr]);

  const kpiSummary = kpiData?.summary || kpiData;

  const monthlyOrdersBreakdown: RevenueOrderBreakdownItem[] = React.useMemo(() => {
    const raw =
      kpiData?.monthly_orders_breakdown ??
      kpiSummary?.monthly_orders_breakdown;
    if (Array.isArray(raw)) return raw;
    return fallbackMonthlyBreakdown;
  }, [kpiData, kpiSummary, fallbackMonthlyBreakdown]);

  const selectedDateOrdersBreakdown: RevenueOrderBreakdownItem[] = React.useMemo(() => {
    const raw =
      kpiData?.selected_date_orders_breakdown ??
      kpiSummary?.selected_date_orders_breakdown;
    if (Array.isArray(raw)) return raw;
    return fallbackDailyBreakdown;
  }, [kpiData, kpiSummary, fallbackDailyBreakdown]);

  // 1. Chỉ số Tháng (Tổng tháng, Thực thu tháng, Công nợ chưa thu ở tháng)
  const monthlyTotalRevenue = Number(
    kpiData?.monthly_total_revenue ??
      kpiSummary?.monthly_total_revenue ??
      kpiData?.monthly_revenue ??
      kpiSummary?.monthly_revenue ??
      monthlyOrdersBreakdown.reduce((sum, item) => sum + Number(item.total_price || 0), 0)
  );

  const monthlyCollectedAmount = Number(
    kpiData?.monthly_collected_amount ??
      kpiSummary?.monthly_collected_amount ??
      monthlyOrdersBreakdown.reduce((sum, item) => sum + Number(item.collected_amount || 0), 0)
  );

  const monthlyUncollectedAmount = Number(
    kpiData?.monthly_uncollected_amount ??
      kpiSummary?.monthly_uncollected_amount ??
      Math.max(0, monthlyTotalRevenue - monthlyCollectedAmount)
  );

  const monthlyOrdersCount = Number(
    kpiData?.monthly_finished_orders_count ??
      kpiSummary?.monthly_finished_orders_count ??
      kpiData?.monthly_completed_orders ??
      kpiSummary?.monthly_completed_orders ??
      monthlyOrdersBreakdown.length
  );

  const monthlyUncollectedCount = Number(
    kpiData?.monthly_uncollected_orders_count ??
      kpiSummary?.monthly_uncollected_orders_count ??
      monthlyOrdersBreakdown.filter((item) => Number(item.uncollected_amount || 0) > 0).length
  );

  // 2. Chỉ số Ngày đã chọn (Tổng ngày đã chọn, Thực thu ngày, Công nợ chưa thu theo ngày)
  const selectedDateTotalRevenue = Number(
    kpiData?.selected_date_total_revenue ??
      kpiSummary?.selected_date_total_revenue ??
      kpiData?.selected_date_revenue ??
      kpiSummary?.selected_date_revenue ??
      selectedDateOrdersBreakdown.reduce((sum, item) => sum + Number(item.total_price || 0), 0)
  );

  const selectedDateCollectedAmount = Number(
    kpiData?.selected_date_collected_amount ??
      kpiSummary?.selected_date_collected_amount ??
      selectedDateOrdersBreakdown.reduce((sum, item) => sum + Number(item.collected_amount || 0), 0)
  );

  const selectedDateUncollectedAmount = Number(
    kpiData?.selected_date_uncollected_amount ??
      kpiSummary?.selected_date_uncollected_amount ??
      Math.max(0, selectedDateTotalRevenue - selectedDateCollectedAmount)
  );

  const selectedDateOrdersCount = Number(
    kpiData?.selected_date_finished_orders_count ??
      kpiSummary?.selected_date_finished_orders_count ??
      kpiData?.selected_date_completed_orders ??
      kpiSummary?.selected_date_completed_orders ??
      selectedDateOrdersBreakdown.length
  );

  const selectedDateUncollectedCount = Number(
    kpiData?.selected_date_uncollected_orders_count ??
      kpiSummary?.selected_date_uncollected_orders_count ??
      selectedDateOrdersBreakdown.filter((item) => Number(item.uncollected_amount || 0) > 0).length
  );

  // Dữ liệu hiển thị trong Modal Chi tiết Doanh thu & Công nợ Khách hàng
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
      if (drilldownFilter === 'collected' && Number(item.collected_amount || 0) <= 0) {
        return false;
      }
      if (drilldownFilter === 'uncollected' && Number(item.uncollected_amount || 0) <= 0) {
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

  // Thuật toán sinh đồ thị doanh thu SVG động (Dynamic SVG Path Generator)
  const renderRevenueChart = () => {
    const rawChart: Array<{ date?: string; label?: string; revenue?: number; completed_orders?: number }> =
      Array.isArray(kpiData?.revenue_chart) ? (kpiData.revenue_chart as any[]) : [];

    if (rawChart.length === 0) {
      return (
        <div className="h-[210px] w-full flex items-center justify-center p-4">
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
            Chào buổi sáng, {currentUser?.name || 'Nhân viên'}
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

      {/* Thanh điều khiển chọn ngày tra cứu */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-[12px] border border-[#e5ece8] p-3.5 sm:px-5 sm:py-3.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-[#1c302b] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#176b58]" />
            {role === 'admin' ? 'Tra cứu doanh thu theo ngày:' : 'Tra cứu tiến độ theo ngày:'}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedDate(val);
                if (val === todayStr) {
                  setActivePreset('today');
                } else if (val === yesterdayStr) {
                  setActivePreset('yesterday');
                } else {
                  setActivePreset('custom');
                }
              }}
              className="text-xs border border-[#e4eae6] bg-[#fafbfa] text-[#2d3d35] rounded-[8px] px-3 py-1.5 outline-none focus:border-[#176b58] focus:bg-white transition-all cursor-pointer font-medium"
            />

            {/* Cụm 4 nút bấm chọn nhanh chu kỳ (Date Range Presets) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setActivePreset('today');
                  setSelectedDate(todayStr);
                }}
                className={`text-xs px-3 py-1.5 rounded-[8px] transition-all cursor-pointer ${
                  activePreset === 'today' && selectedDate === todayStr
                    ? 'bg-[#176b58] text-white font-bold shadow-xs'
                    : 'bg-white text-[#596962] border border-[#d8e2dc] hover:bg-[#f0f4f2]'
                }`}
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePreset('yesterday');
                  setSelectedDate(yesterdayStr);
                }}
                className={`text-xs px-3 py-1.5 rounded-[8px] transition-all cursor-pointer ${
                  activePreset === 'yesterday' && selectedDate === yesterdayStr
                    ? 'bg-[#176b58] text-white font-bold shadow-xs'
                    : 'bg-white text-[#596962] border border-[#d8e2dc] hover:bg-[#f0f4f2]'
                }`}
              >
                Hôm qua
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePreset('7_days');
                  setPeriod('7_days');
                }}
                className={`text-xs px-3 py-1.5 rounded-[8px] transition-all cursor-pointer ${
                  activePreset === '7_days' && period === '7_days'
                    ? 'bg-[#176b58] text-white font-bold shadow-xs'
                    : 'bg-white text-[#596962] border border-[#d8e2dc] hover:bg-[#f0f4f2]'
                }`}
              >
                7 ngày qua
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePreset('30_days');
                  setPeriod('30_days');
                }}
                className={`text-xs px-3 py-1.5 rounded-[8px] transition-all cursor-pointer ${
                  activePreset === '30_days' && period === '30_days'
                    ? 'bg-[#176b58] text-white font-bold shadow-xs'
                    : 'bg-white text-[#596962] border border-[#d8e2dc] hover:bg-[#f0f4f2]'
                }`}
              >
                Tháng này
              </button>
            </div>
          </div>
        </div>
        <div className="text-xs text-[#7e8d85]">
          Ngày đang chọn: <b className="text-[#176b58] font-mono">{selectedDate === todayStr ? `Hôm nay (${selectedDate})` : selectedDate}</b>
          {kpiData?.selected_date_completed_orders !== undefined && (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-[#edf5f0] text-[#176b58] font-semibold text-[11px]">
              {kpiData.selected_date_completed_orders} đơn hoàn tất
            </span>
          )}
        </div>
      </div>

      {/* Stats Cards (Khu vực A: Phân quyền tài chính RBAC - 4 Ô Doanh thu & Công nợ) */}
      {role === 'admin' ? (
        /* Khi role === 'admin': 4 thẻ chỉ số Doanh thu & Công nợ theo đúng thứ tự yêu cầu */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Ô 1: Tổng tháng (Doanh thu tháng) */}
          <button
            type="button"
            data-testid="admin-card-monthly-total"
            onClick={() => handleOpenDrilldownModal('month', 'all')}
            className="bg-white border border-[#c5e1d4] rounded-[12px] p-4 min-h-[124px] shadow-[0_2px_5px_rgba(36,60,41,0.03)] hover:border-[#176b58] hover:-translate-y-0.5 hover:shadow-[0_7px_18px_rgba(28,49,34,0.06)] text-left flex flex-col justify-between transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[#406856] text-sm font-semibold w-full">
              <span>Tổng tháng</span>
              <span className="w-8 h-8 rounded-[8px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none">
                <Icon name="payments" size={17} />
              </span>
            </div>

            <div className="font-heading font-extrabold text-[22px] xl:text-[26px] tracking-[-0.6px] text-[#176b58] my-2">
              {formatVND(monthlyTotalRevenue)}
            </div>

            <div className="flex items-center justify-between gap-1 text-xs text-[#287452] font-semibold pt-1.5 border-t border-[#edf4f0] w-full">
              <span>
                Thực thu: {formatVND(monthlyCollectedAmount)} · {monthlyOrdersCount} đơn ({selectedMonthLabel})
              </span>
              <Icon name="arrow" size={12} className="text-[#176b58] flex-none" />
            </div>
          </button>

          {/* Ô 2: Công nợ chưa thu ở tháng */}
          <button
            type="button"
            data-testid="admin-card-monthly-uncollected"
            onClick={() => handleOpenDrilldownModal('month', 'uncollected')}
            className={`border rounded-[12px] p-4 min-h-[124px] shadow-[0_2px_5px_rgba(36,60,41,0.03)] hover:-translate-y-0.5 hover:shadow-[0_7px_18px_rgba(28,49,34,0.06)] text-left flex flex-col justify-between transition-all cursor-pointer group ${
              monthlyUncollectedAmount > 0
                ? 'bg-[#fcfaf5] border-[#ebd9bd] hover:border-[#d2a25d]'
                : 'bg-white border-[#e5ece8] hover:border-[#176b58]'
            }`}
          >
            <div className="flex items-center justify-between text-sm font-semibold w-full">
              <span className={monthlyUncollectedAmount > 0 ? 'text-[#915e1b]' : 'text-[#687871]'}>
                Công nợ chưa thu ở tháng
              </span>
              <span
                className={`w-8 h-8 rounded-[8px] grid place-items-center flex-none ${
                  monthlyUncollectedAmount > 0
                    ? 'bg-[#fbf3e5] text-[#915e1b]'
                    : 'bg-[#eff5f1] text-[#398066]'
                }`}
              >
                <Icon name="account_balance_wallet" size={17} />
              </span>
            </div>

            <div
              className={`font-heading font-extrabold text-[22px] xl:text-[26px] tracking-[-0.6px] my-2 ${
                monthlyUncollectedAmount > 0 ? 'text-[#bc5b52]' : 'text-[#1c302b]'
              }`}
            >
              {formatVND(monthlyUncollectedAmount)}
            </div>

            <div className="flex items-center justify-between gap-1 text-xs pt-1.5 border-t border-[#f0ece3] w-full">
              <span
                className={
                  monthlyUncollectedAmount > 0
                    ? 'text-[#915e1b] font-semibold'
                    : 'text-[#687871] font-medium'
                }
              >
                {monthlyUncollectedCount} đơn chưa thu đủ ({selectedMonthLabel})
              </span>
              <Icon
                name="arrow"
                size={12}
                className={
                  monthlyUncollectedAmount > 0 ? 'text-[#915e1b] flex-none' : 'text-[#176b58] flex-none'
                }
              />
            </div>
          </button>

          {/* Ô 3: Tổng ngày đã chọn */}
          <button
            type="button"
            data-testid="admin-card-daily-total"
            onClick={() => handleOpenDrilldownModal('day', 'all')}
            className="bg-white border border-[#c5e1d4] rounded-[12px] p-4 min-h-[124px] shadow-[0_2px_5px_rgba(36,60,41,0.03)] hover:border-[#176b58] hover:-translate-y-0.5 hover:shadow-[0_7px_18px_rgba(28,49,34,0.06)] text-left flex flex-col justify-between transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[#406856] text-sm font-semibold w-full">
              <span>Tổng ngày đã chọn</span>
              <span className="w-8 h-8 rounded-[8px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none">
                <Icon name="payments" size={17} />
              </span>
            </div>

            <div className="font-heading font-extrabold text-[22px] xl:text-[26px] tracking-[-0.6px] text-[#176b58] my-2">
              {formatVND(selectedDateTotalRevenue)}
            </div>

            <div className="flex items-center justify-between gap-1 text-xs text-[#287452] font-semibold pt-1.5 border-t border-[#edf4f0] w-full">
              <span>
                Thực thu: {formatVND(selectedDateCollectedAmount)} · {selectedDateOrdersCount} đơn hoàn tất
              </span>
              <Icon name="arrow" size={12} className="text-[#176b58] flex-none" />
            </div>
          </button>

          {/* Ô 4: Công nợ chưa thu theo ngày */}
          <button
            type="button"
            data-testid="admin-card-daily-uncollected"
            onClick={() => handleOpenDrilldownModal('day', 'uncollected')}
            className={`border rounded-[12px] p-4 min-h-[124px] shadow-[0_2px_5px_rgba(36,60,41,0.03)] hover:-translate-y-0.5 hover:shadow-[0_7px_18px_rgba(28,49,34,0.06)] text-left flex flex-col justify-between transition-all cursor-pointer group ${
              selectedDateUncollectedAmount > 0
                ? 'bg-[#fcfaf5] border-[#ebd9bd] hover:border-[#d2a25d]'
                : 'bg-white border-[#e5ece8] hover:border-[#176b58]'
            }`}
          >
            <div className="flex items-center justify-between text-sm font-semibold w-full">
              <span className={selectedDateUncollectedAmount > 0 ? 'text-[#915e1b]' : 'text-[#687871]'}>
                Công nợ chưa thu theo ngày
              </span>
              <span
                className={`w-8 h-8 rounded-[8px] grid place-items-center flex-none ${
                  selectedDateUncollectedAmount > 0
                    ? 'bg-[#fbf3e5] text-[#915e1b]'
                    : 'bg-[#eff5f1] text-[#398066]'
                }`}
              >
                <Icon name="account_balance_wallet" size={17} />
              </span>
            </div>

            <div
              className={`font-heading font-extrabold text-[22px] xl:text-[26px] tracking-[-0.6px] my-2 ${
                selectedDateUncollectedAmount > 0 ? 'text-[#bc5b52]' : 'text-[#1c302b]'
              }`}
            >
              {formatVND(selectedDateUncollectedAmount)}
            </div>

            <div className="flex items-center justify-between gap-1 text-xs pt-1.5 border-t border-[#f0ece3] w-full">
              <span
                className={
                  selectedDateUncollectedAmount > 0
                    ? 'text-[#915e1b] font-semibold'
                    : 'text-[#687871] font-medium'
                }
              >
                {selectedDateUncollectedCount} đơn chưa thu đủ ngày {selectedDateDisplay}
              </span>
              <Icon
                name="arrow"
                size={12}
                className={
                  selectedDateUncollectedAmount > 0 ? 'text-[#915e1b] flex-none' : 'text-[#176b58] flex-none'
                }
              />
            </div>
          </button>
        </div>
      ) : (
        /* Khi role !== 'admin': 6 thẻ chỉ số vận hành hữu ích */
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <StatCard
            label="Đơn đang xử lý"
            value={kpiData?.active_orders ?? activeOrdersCount}
            icon="clock"
            foot={`${kpiData?.active_orders ?? activeOrdersCount} đơn đang hoạt động`}
            onClick={() => router.push('/repairs')}
          />
          <StatCard
            label="Tiếp nhận hôm nay"
            value={String(kpiData?.intake_today ?? todayOrdersCount).padStart(2, '0')}
            icon="plus"
            foot="Cập nhật theo ngày thực tế"
          />
          <StatCard
            label="Đang kiểm tra / sửa chữa"
            value={String(repairingCount ?? 0).padStart(2, '0')}
            icon="wrench"
            foot="Máy đang xử lý tại xưởng"
            onClick={() => router.push('/repairs?status=in_repair')}
          />
          <StatCard
            label="Chờ kiểm định QC"
            value={String(
              kpiData?.operational_summary?.waiting_qc_count ??
              kpiData?.actionable_tasks?.waiting_qc?.length ??
              0
            ).padStart(2, '0')}
            icon="verified"
            foot="Chờ nghiệm thu chất lượng"
            onClick={() => router.push('/qc')}
          />
          <StatCard
            label="Sẵn sàng giao khách"
            value={String(
              kpiData?.reconciliation?.ready_for_pickup_count ??
              kpiData?.actionable_tasks?.ready_pickup?.length ??
              readyCount ??
              0
            ).padStart(2, '0')}
            icon="local_shipping"
            foot="Máy xong chờ trả khách"
            onClick={() => router.push('/repairs?status=waiting_pickup')}
          />
          <StatCard
            label="Tỉ lệ bảo hành"
            value={`${kpiData?.summary?.warranty_rate ?? kpiData?.warranty_rate ?? 0}%`}
            icon="shield"
            foot="Tỷ lệ máy bảo hành trong kỳ"
            onClick={() => router.push('/repairs?intake_type=warranty')}
          />
        </div>
      )}

      {/* [MỚI] KHU VỰC B: CHỈ SỐ ĐIỀU HÀNH VẬN HÀNH (4 Thẻ) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#176b58]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#73857d] m-0">
              CHỈ SỐ ĐIỀU HÀNH CA LÀM VIỆC (OPERATIONAL METRICS)
            </h3>
          </div>
          <span className="text-[11px] text-[#86968f]">
            Cập nhật thời gian thực theo trạng thái đơn
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. Đơn đang mở */}
          <div
            onClick={() => router.push('/repairs')}
            className="bg-white border border-[#e5ece8] rounded-[12px] p-4 shadow-xs hover:border-[#c5e1d4] hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-sm font-medium text-[#687871]">
              <span>Đơn đang mở</span>
              <span className="w-8 h-8 rounded-[8px] bg-[#eff5f1] text-[#176b58] grid place-items-center">
                <Icon name="repairs" size={17} />
              </span>
            </div>
            <div className="font-heading font-extrabold text-2xl md:text-3xl text-[#1c302b] my-2">
              {kpiData?.operational_summary?.active_orders ?? activeOrdersCount}
            </div>
            <div className="flex items-center justify-between text-xs text-[#7c8982]">
              <span>Đang xử lý trong quy trình</span>
              <Icon name="arrow" size={12} className="text-[#176b58]" />
            </div>
          </div>

          {/* 2. Chờ khách nhận máy */}
          <div
            onClick={() => router.push('/repairs?status=waiting_pickup')}
            className="bg-white border border-[#e5ece8] rounded-[12px] p-4 shadow-xs hover:border-[#c5e1d4] hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-sm font-medium text-[#687871]">
              <span>Chờ khách nhận</span>
              <span className="w-8 h-8 rounded-[8px] bg-[#eff5f1] text-[#176b58] grid place-items-center">
                <Icon name="truck" size={17} />
              </span>
            </div>
            <div className="font-heading font-extrabold text-2xl md:text-3xl text-[#176b58] my-2">
              {kpiData?.operational_summary?.waiting_pickup_orders ?? 0}
            </div>
            <div className="flex items-center justify-between text-xs text-[#7c8982]">
              <span>Đã xong & QC đạt, chờ giao</span>
              <Icon name="arrow" size={12} className="text-[#176b58]" />
            </div>
          </div>

          {/* 3. Chờ linh kiện */}
          <div
            onClick={() => router.push('/repairs?status=waiting_parts')}
            className="bg-white border border-[#e5ece8] rounded-[12px] p-4 shadow-xs hover:border-[#ebd9bd] hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-sm font-medium text-[#687871]">
              <span>Chờ linh kiện</span>
              <span className="w-8 h-8 rounded-[8px] bg-[#fdf9f0] text-[#915e1b] grid place-items-center">
                <Icon name="inventory" size={17} />
              </span>
            </div>
            <div className="font-heading font-extrabold text-2xl md:text-3xl text-[#915e1b] my-2">
              {kpiData?.operational_summary?.waiting_parts_orders ?? 0}
            </div>
            <div className="flex items-center justify-between text-xs text-[#7c8982]">
              <span>Tạm dừng do thiếu phụ tùng</span>
              <Icon name="arrow" size={12} className="text-[#915e1b]" />
            </div>
          </div>

          {/* 4. Trễ thời hạn cam kết */}
          <div
            onClick={() => router.push('/repairs?filter=overdue')}
            className={`border rounded-[12px] p-4 shadow-xs transition-all cursor-pointer flex flex-col justify-between ${
              (kpiData?.operational_summary?.overdue_orders ?? 0) > 0
                ? 'bg-[#fbefed] border-[#f5c7c2] hover:border-[#ea9d94]'
                : 'bg-white border-[#e5ece8] hover:border-[#c5e1d4]'
            }`}
          >
            <div className="flex items-center justify-between text-sm font-medium">
              <span className={(kpiData?.operational_summary?.overdue_orders ?? 0) > 0 ? 'text-[#bc5b52] font-semibold' : 'text-[#687871]'}>
                Trễ thời hạn
              </span>
              <span className={`w-8 h-8 rounded-[8px] grid place-items-center ${
                (kpiData?.operational_summary?.overdue_orders ?? 0) > 0
                  ? 'bg-white text-[#bc5b52]'
                  : 'bg-[#eff5f1] text-[#176b58]'
              }`}>
                <Icon name="alert" size={17} />
              </span>
            </div>
            <div className={`font-heading font-extrabold text-2xl md:text-3xl my-2 ${
              (kpiData?.operational_summary?.overdue_orders ?? 0) > 0 ? 'text-[#bc5b52]' : 'text-[#1c302b]'
            }`}>
              {kpiData?.operational_summary?.overdue_orders ?? 0}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className={(kpiData?.operational_summary?.overdue_orders ?? 0) > 0 ? 'text-[#bc5b52] font-medium' : 'text-[#7c8982]'}>
                {(kpiData?.operational_summary?.overdue_orders ?? 0) > 0
                  ? 'Cần can thiệp ngay trong ca'
                  : 'Đúng tiến độ cam kết'}
              </span>
              <Icon
                name="arrow"
                size={12}
                className={(kpiData?.operational_summary?.overdue_orders ?? 0) > 0 ? 'text-[#bc5b52]' : 'text-[#176b58]'}
              />
            </div>
          </div>
        </div>
      </div>

      {/* [MỚI] KHU VỰC C: TRUNG TÂM HÀNH ĐỘNG ("VIỆC CẦN XỬ LÝ TRONG CA") */}
      <ActionableTasksCenter
        actionableTasks={kpiData?.actionable_tasks}
        onOpenOrderDetail={handleOpenOrderDetail}
        onOpenCheckout={handleOpenCheckout}
        onNavigate={(path) => router.push(path)}
      />

      {/* Grid: Revenue Chart & Workload breakdown */}
      {role === 'admin' ? (
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
                  <Icon name="clock" size={15} />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-[#2d3d35]">Chờ kỹ thuật nhận</span>
                    <span className="text-[#7c8982]">{String(techAvailableOrders.length).padStart(2, '0')} đơn</span>
                  </div>
                  <div className="h-2 bg-[#f0f3f1] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#d2a25d] rounded-full"
                      style={{ width: `${branchOrders.length > 0 ? (techAvailableOrders.length / branchOrders.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <b className="text-xs text-right text-[#1c302b]">{techAvailableOrders.length}</b>
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
      ) : (
        /* Workload Distribution Grid cho Non-Admin: Phân bổ trạng thái trực quan thay thế biểu đồ doanh thu */
        <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
                Phân bổ tiến độ & trạng thái đơn hàng
              </h3>
              <p className="text-xs text-[#8a9891] mt-0.5 mb-0">
                Tổng hợp tình hình xử lý {branchOrders.length} đơn tại chi nhánh
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon="arrow"
              onClick={() => router.push('/repairs')}
            >
              Mở danh sách đơn ↗
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-[10px] bg-[#edf5f0] border border-[#d2e7dc]">
              <div className="flex items-center justify-between text-xs text-[#406856] font-semibold mb-2">
                <span>ĐANG KIỂM TRA</span>
                <span className="w-7 h-7 rounded-[7px] bg-white text-[#478065] grid place-items-center">
                  <Icon name="search" size={15} />
                </span>
              </div>
              <div className="font-heading font-bold text-2xl text-[#1c302b]">
                {String(inspectingCount).padStart(2, '0')} <small className="text-xs font-normal text-[#6b7c74]">đơn</small>
              </div>
              <div className="mt-2 text-[11px] text-[#5c7066]">Chờ kiểm tra lỗi ban đầu</div>
            </div>

            <div className="p-4 rounded-[10px] bg-[#fbf3e5] border border-[#ebd9bd]">
              <div className="flex items-center justify-between text-xs text-[#8c6527] font-semibold mb-2">
                <span>CHỜ KỸ THUẬT</span>
                <span className="w-7 h-7 rounded-[7px] bg-white text-[#a4722f] grid place-items-center">
                  <Icon name="clock" size={15} />
                </span>
              </div>
              <div className="font-heading font-bold text-2xl text-[#915e1b]">
                {String(techAvailableOrders.length).padStart(2, '0')} <small className="text-xs font-normal text-[#915e1b]/70">đơn</small>
              </div>
              <div className="mt-2 text-[11px] text-[#8c6527]">Chờ kỹ thuật viên nhận máy</div>
            </div>

            <div className="p-4 rounded-[10px] bg-[#edf4f7] border border-[#cadce6]">
              <div className="flex items-center justify-between text-xs text-[#3b6780] font-semibold mb-2">
                <span>ĐANG SỬA CHỮA</span>
                <span className="w-7 h-7 rounded-[7px] bg-white text-[#477b98] grid place-items-center">
                  <Icon name="wrench" size={15} />
                </span>
              </div>
              <div className="font-heading font-bold text-2xl text-[#1c302b]">
                {String(repairingCount).padStart(2, '0')} <small className="text-xs font-normal text-[#6b7c74]">đơn</small>
              </div>
              <div className="mt-2 text-[11px] text-[#477b98]">Kỹ thuật viên đang xử lý thiết bị</div>
            </div>

            <div className="p-4 rounded-[10px] bg-[#eaf4ef] border border-[#c5e1d4]">
              <div className="flex items-center justify-between text-xs text-[#1e6b4e] font-semibold mb-2">
                <span>CHỜ QC / TRẢ MÁY</span>
                <span className="w-7 h-7 rounded-[7px] bg-white text-[#28805e] grid place-items-center">
                  <Icon name="check" size={15} />
                </span>
              </div>
              <div className="font-heading font-bold text-2xl text-[#176b58]">
                {String(readyCount).padStart(2, '0')} <small className="text-xs font-normal text-[#176b58]/70">đơn</small>
              </div>
              <div className="mt-2 text-[11px] text-[#28805e]">Đã hoàn thành hoặc chờ bàn giao</div>
            </div>
          </div>
        </div>
      )}

      {/* Khối đối chiếu vận hành & dòng tiền (Chỉ render khi role === 'admin' để bảo vệ quyền riêng tư tài chính) */}
      {role === 'admin' && (
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
                    <span className="w-2 h-2 rounded-full bg-[#176b58]" />
                    <span>Máy khách đã lấy (Đã bàn giao)</span>
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
                    <div className="text-xs text-[#657d72] mb-0.5 font-medium">Doanh thu thực thu tích lũy toàn thời gian:</div>
                    <div className="text-xl md:text-2xl font-heading font-bold text-[#145747]">
                      {reconciliation.handed_over_revenue_formatted}
                    </div>
                    <div className="text-[11px] text-[#718b7f] mt-1">
                      Tích lũy toàn thời gian (tại quầy VietQR/tiền mặt & COD giao thành công)
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#d5eadf]">
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/repairs?date=${selectedDate}&date_type=completed_at&status=completed`
                    )
                  }
                  className="w-full py-2.5 px-3 bg-[#176b58] hover:bg-[#135a4a] text-white text-xs font-bold rounded-[8px] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <span>Xem danh sách máy đã bàn giao</span>
                  <Icon name="arrow" size={14} />
                </button>
              </div>
            </div>

            {/* CỘT 2: Warm Ivory / Amber - Máy khách chưa lấy / dòng tiền chưa thu */}
            <div className="bg-[#fcfaf5] border border-[#ebd9bd] rounded-[12px] p-5 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-28 h-28 bg-[#d2a25d]/5 rounded-bl-full pointer-events-none" />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#915e1b] bg-white px-2.5 py-1 rounded-full border border-[#ebd9bd]">
                    <span className="w-2 h-2 rounded-full bg-[#d97706]" />
                    <span>Máy khách chưa lấy (Tại cửa hàng)</span>
                  </span>
                  <span className="text-xs text-[#8c7456] font-medium">
                    {reconciliation.ready_for_pickup_count + reconciliation.in_workshop_count} máy tồn tại shop
                  </span>
                </div>

                <div className="mt-2 mb-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl md:text-4xl font-heading font-extrabold text-[#915e1b]">
                      {reconciliation.ready_for_pickup_count + reconciliation.in_workshop_count}
                    </span>
                    <span className="text-sm font-semibold text-[#8c7456]">máy chưa bàn giao</span>
                  </div>

                  {/* Card tổng kết nổi bật: TỔNG TIỀN CHƯA THU */}
                  <div className="mt-3 p-3 bg-white/90 rounded-[9px] border border-[#ecdac1] shadow-2xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#915e1b]">
                        Tổng tiền chưa thu:
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#fbf3e5] text-[#915e1b] border border-[#ebd9bd]">
                        Chờ thu & dở dang
                      </span>
                    </div>
                    <div className="text-xl md:text-2xl font-heading font-bold text-[#915e1b]">
                      {reconciliation.total_uncollected_amount_formatted ||
                        moneyFormatted(
                          (reconciliation.ready_for_pickup_amount || 0) +
                            (reconciliation.in_workshop_amount || 0)
                        )}
                    </div>
                    <div className="text-[11px] text-[#a48a6e] mt-1">
                      Bao gồm tiền chắc chắn thu khi giao và giá trị công dở dang trong xưởng
                    </div>
                  </div>

                  {/* 2 dòng phân rã chi tiết theo Phương án A */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    {/* Dòng 1: Đã sửa xong chờ lấy / Chờ giao */}
                    <div className="p-3.5 bg-white rounded-[9px] border border-[#eddcc4] shadow-2xs">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-[#915e1b]">Đã sửa xong chờ lấy / Chờ giao</span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#fbf3e5] text-[#915e1b]">
                          {reconciliation.ready_for_pickup_count} máy
                        </span>
                      </div>
                      <div className="text-xs text-[#7e8e86] mb-0.5">Tiền chắc chắn thu khi giao:</div>
                      <div className="text-lg font-heading font-bold text-[#915e1b]">
                        {reconciliation.ready_for_pickup_amount_formatted}
                      </div>
                      <div className="text-[11px] text-[#a48a6e] mt-1">
                        Trạng thái: Sẵn sàng trả / Chờ nhận
                      </div>
                    </div>

                    {/* Dòng 2: Đang sửa trong xưởng */}
                    <div className="p-3.5 bg-white rounded-[9px] border border-[#e5ece8] shadow-2xs">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-[#2d3d35]">Đang sửa trong xưởng</span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#edf5f0] text-[#176b58]">
                          {reconciliation.in_workshop_count} máy
                        </span>
                      </div>
                      <div className="text-xs text-[#7e8e86] mb-0.5">Giá trị tạm tính dở dang:</div>
                      <div className="text-lg font-heading font-bold text-[#2d3d35]">
                        {reconciliation.in_workshop_amount_formatted}
                      </div>
                      <div className="text-[11px] text-[#7e8e86] mt-1">
                        Đang khám / chờ linh kiện / sửa / QC
                      </div>
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
      )}

      {/* [MỚI] KHU VỰC D & F: HIỆU SUẤT NHÂN SỰ & TÓM TẮT CA TRỰC SỔ QUỸ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <StaffPerformanceWidget
            branchId={branchId}
            selectedDate={selectedDate}
            period={period}
            userRole={role}
          />
        </div>
        <div className="lg:col-span-1">
          <ShiftCashbookSnapshot branchId={branchId} />
        </div>
      </div>

      {/* Khối Không gian Kỹ thuật - Máy chưa xong chi tiết */}
      <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-[8px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none">
              <Icon name="wrench" size={17} />
            </span>
            <div>
              <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
                Không gian Kỹ thuật - Máy chưa xong chi tiết
              </h3>
              <p className="text-xs text-[#809088] mt-0.5 mb-0">
                Danh sách các thiết bị đang xử lý dở dang tại xưởng ({unfinishedTechOrders.length} máy)
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push('/tech')}
            className="flex items-center gap-1.5"
          >
            <span>Mở Không gian Kỹ thuật</span>
            <span>↗</span>
          </Button>
        </div>

        {unfinishedTechOrders.length === 0 ? (
          <div className="p-8 text-center rounded-[10px] border border-dashed border-[#d8e3dc] bg-[#fafcfa] text-xs text-[#667a70]">
            Không có máy nào đang xử lý dở dang tại xưởng. Tất cả đơn đã được hoàn tất hoặc chuyển sang các khâu tiếp theo.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 sm:mx-0">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#809088] uppercase tracking-wider h-9">
                  <th className="px-4">Mã đơn</th>
                  <th className="px-4">Khách hàng</th>
                  <th className="px-4">Thiết bị</th>
                  <th className="px-4">KTV phụ trách</th>
                  <th className="px-4">Trạng thái</th>
                  <th className="px-4 text-right">Thời gian lưu tại xưởng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f3f2] text-sm">
                {unfinishedTechOrders.map((o, i) => (
                  <tr
                    key={o.id}
                    onClick={() => handleOpenOrderDetail(o.id)}
                    className="h-12 hover:bg-[#fafcfa] cursor-pointer transition-colors"
                  >
                    <td className="px-4 font-mono font-bold text-[#176b58]">{o.id}</td>
                    <td className="px-4">
                      <div className="flex items-center gap-2">
                        <Avatar initials={o.name} variant={(i % 4) as any} size="sm" />
                        <div>
                          <span className="font-semibold text-[#273730] block">{o.name}</span>
                          {o.phone && <span className="font-mono text-xs text-[#7e8e86]">{o.phone}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 font-medium text-[#4b5b53]">{o.device}</td>
                    <td className="px-4">
                      <span className="inline-flex items-center gap-1.5 font-medium text-[#2d3d35] text-xs">
                        <span className="w-2 h-2 rounded-full bg-[#176b58]" />
                        {o.tech || 'Chưa phân công'}
                      </span>
                    </td>
                    <td className="px-4">
                      <StatusTag label={o.status} type={o.statusType} />
                    </td>
                    <td className="px-4 text-right font-mono text-xs text-[#52635a] font-semibold">
                      {formatWorkshopDuration(o.createdAt || o.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                  onClick={() => handleOpenOrderDetail(o.id)}
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

      {/* Customer Revenue & Debt Drill-Down Modal (Admin 4 Top Financial Cards) */}
      <Modal
        isOpen={drilldownModalOpen}
        onClose={() => setDrilldownModalOpen(false)}
        maxWidth="2xl"
        eyebrow="FIXO · ĐỐI SOÁT DOANH THU & CÔNG NỢ KHÁCH HÀNG"
        title={
          drilldownPeriod === 'month'
            ? `Chi tiết Doanh thu & Công nợ Khách hàng — ${selectedMonthLabel}`
            : `Chi tiết Doanh thu & Công nợ Khách hàng — Ngày ${selectedDateDisplay}`
        }
        subtitle="Đối chiếu đầy đủ từng đồng: Tổng phát sinh = Thực thu (Tiền mặt + Chuyển khoản) + Công nợ chưa thu."
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2.5 w-full">
            <div className="text-xs text-[#64786e]">
              Đang hiển thị <b>{filteredAndSortedDrilldownItems.length}</b> / <b>{activeDrilldownRawItems.length}</b> đơn máy đã xong
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setDrilldownModalOpen(false)}
              >
                Đóng
              </Button>
            </div>
          </div>
        }
      >
        <div data-testid="revenue-debt-drilldown-modal" className="space-y-4">
          {/* Thanh chuyển đổi nhanh Kỳ xem: [ Theo Tháng ] / [ Theo Ngày chọn ] */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f7faf8] border border-[#dce8e1] rounded-[10px] p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#2d3d35]">
              <span className="w-2 h-2 rounded-full bg-[#176b58]" />
              <span>
                {drilldownPeriod === 'month'
                  ? `Chi tiết Doanh thu & Công nợ Khách hàng — ${selectedMonthLabel}`
                  : `Chi tiết Doanh thu & Công nợ Khách hàng — Ngày ${selectedDateDisplay}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="drilldown-period-month"
                onClick={() => setDrilldownPeriod('month')}
                className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer ${
                  drilldownPeriod === 'month'
                    ? 'bg-[#176b58] text-white shadow-xs'
                    : 'bg-white text-[#52635a] border border-[#d6e2db] hover:bg-[#edf4f0]'
                }`}
              >
                Theo Tháng ({selectedMonthLabel})
              </button>
              <button
                type="button"
                data-testid="drilldown-period-day"
                onClick={() => setDrilldownPeriod('day')}
                className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer ${
                  drilldownPeriod === 'day'
                    ? 'bg-[#176b58] text-white shadow-xs'
                    : 'bg-white text-[#52635a] border border-[#d6e2db] hover:bg-[#edf4f0]'
                }`}
              >
                Theo Ngày chọn ({selectedDateDisplay})
              </button>
            </div>
          </div>

          {/* TẦNG 1: Thanh 3 ô tổng hợp dòng tiền của kỳ đang xem (Số tiền đầy đủ từng đồng) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* 1. Tổng phát sinh (Máy đã xong) */}
            <div className="p-4 rounded-[12px] bg-[#f2f8f5] border border-[#c5e1d4] flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#176b58]">
                <span>Tổng phát sinh (Máy đã xong)</span>
                <span className="px-2 py-0.5 rounded-full bg-white text-[#176b58] border border-[#c5e1d4]">
                  {periodOrdersCount} đơn
                </span>
              </div>
              <div className="font-heading font-extrabold text-xl sm:text-2xl text-[#176b58] my-2">
                {formatVND(periodTotal)}
              </div>
              <div className="text-xs text-[#406856] font-medium">
                Tổng giá trị các đơn đã hoàn tất sửa chữa trong kỳ
              </div>
            </div>

            {/* 2. Thực thu (Đã thanh toán) */}
            <div className="p-4 rounded-[12px] bg-white border border-[#c5e1d4] flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#287452]">
                <span>Thực thu (Đã thanh toán)</span>
                <Icon name="check" size={15} className="text-[#176b58]" />
              </div>
              <div className="font-heading font-extrabold text-xl sm:text-2xl text-[#1c302b] my-2">
                {formatVND(periodCollected)}
              </div>
              <div className="text-xs text-[#52635a] font-medium flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Tiền mặt: <b className="text-[#176b58]">{formatVND(periodCashAmount)}</b></span>
                <span>·</span>
                <span>Chuyển khoản: <b className="text-[#176b58]">{formatVND(periodTransferAmount)}</b></span>
              </div>
            </div>

            {/* 3. Công nợ chưa thu */}
            <div
              className={`p-4 rounded-[12px] border flex flex-col justify-between ${
                periodUncollected > 0
                  ? 'bg-[#fcfaf5] border-[#ebd9bd]'
                  : 'bg-white border-[#e5ece8]'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#915e1b]">
                <span>Công nợ chưa thu</span>
                <span className="px-2 py-0.5 rounded-full bg-[#fbf3e5] text-[#915e1b] border border-[#ebd9bd]">
                  {periodUncollectedCount} đơn chưa thu đủ
                </span>
              </div>
              <div
                className={`font-heading font-extrabold text-xl sm:text-2xl my-2 ${
                  periodUncollected > 0 ? 'text-[#bc5b52]' : 'text-[#1c302b]'
                }`}
              >
                {formatVND(periodUncollected)}
              </div>
              <div className="text-xs text-[#8c6527] font-medium">
                Chênh lệch Tổng phát sinh trừ Thực thu trong kỳ
              </div>
            </div>
          </div>

          {/* TẦNG 2: Thanh lọc (Tất cả / Đã thực thu / Còn nợ chưa thu) & Tìm kiếm */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#e5ece8] rounded-[10px] p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-testid="drilldown-tab-all"
                onClick={() => setDrilldownFilter('all')}
                className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer ${
                  drilldownFilter === 'all'
                    ? 'bg-[#176b58] text-white shadow-xs'
                    : 'bg-[#f4f7f5] text-[#52635a] hover:bg-[#e8efeb]'
                }`}
              >
                Tất cả ({activeDrilldownRawItems.length})
              </button>
              <button
                type="button"
                data-testid="drilldown-tab-collected"
                onClick={() => setDrilldownFilter('collected')}
                className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer ${
                  drilldownFilter === 'collected'
                    ? 'bg-[#176b58] text-white shadow-xs'
                    : 'bg-[#f4f7f5] text-[#52635a] hover:bg-[#e8efeb]'
                }`}
              >
                Đã thực thu (
                {activeDrilldownRawItems.filter((i) => Number(i.collected_amount || 0) > 0).length}
                )
              </button>
              <button
                type="button"
                data-testid="drilldown-tab-uncollected"
                onClick={() => setDrilldownFilter('uncollected')}
                className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer ${
                  drilldownFilter === 'uncollected'
                    ? 'bg-[#bc5b52] text-white shadow-xs'
                    : 'bg-[#fcf4f2] text-[#bc5b52] border border-[#f5c7c2] hover:bg-[#fbefed]'
                }`}
              >
                Còn nợ chưa thu (
                {activeDrilldownRawItems.filter((i) => Number(i.uncollected_amount || 0) > 0).length}
                )
              </button>
            </div>

            <div className="relative flex-1 min-w-[220px] max-w-[340px]">
              <input
                type="text"
                data-testid="drilldown-search-input"
                value={drilldownSearch}
                onChange={(e) => setDrilldownSearch(e.target.value)}
                placeholder="Tìm tên khách hàng, SĐT, mã đơn, thiết bị..."
                className="w-full text-xs border border-[#dce6e0] bg-[#fafcfa] text-[#1c302b] rounded-[8px] pl-3 pr-8 py-2 outline-none focus:border-[#176b58] focus:bg-white transition-all"
              />
              {drilldownSearch && (
                <button
                  type="button"
                  onClick={() => setDrilldownSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#7c8c84] hover:text-[#1c302b] cursor-pointer"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* TẦNG 3: Bảng chi tiết theo từng Khách hàng & Đơn máy (Click tiêu đề cột để sắp xếp asc/desc) */}
          {filteredAndSortedDrilldownItems.length === 0 ? (
            <div className="p-8 rounded-[12px] border border-dashed border-[#d8e3dc] bg-[#fafcfa] text-center text-xs text-[#667a70]">
              Không có đơn hàng nào khớp với bộ lọc hiện tại trong kỳ đang chọn.
            </div>
          ) : (
            <div className="overflow-x-auto border border-[#e5ece8] rounded-[12px] bg-white">
              <table className="w-full text-left border-collapse min-w-[820px]">
                <thead>
                  <tr className="border-b border-[#e5ece8] bg-[#fafbfa] text-[11px] font-bold text-[#687871] uppercase tracking-wider h-10 select-none">
                    <th
                      data-testid="drilldown-sort-customer"
                      onClick={() => handleDrilldownSort('customer')}
                      className="px-4 cursor-pointer hover:text-[#176b58] transition-colors"
                    >
                      <span className="inline-flex items-center gap-1">
                        <span>Khách hàng & Liên hệ</span>
                        <span>
                          {drilldownSortKey === 'customer'
                            ? drilldownSortDir === 'asc'
                              ? '▲'
                              : '▼'
                            : '↕'}
                        </span>
                      </span>
                    </th>
                    <th
                      data-testid="drilldown-sort-order"
                      onClick={() => handleDrilldownSort('order')}
                      className="px-4 cursor-pointer hover:text-[#176b58] transition-colors"
                    >
                      <span className="inline-flex items-center gap-1">
                        <span>Đơn & Thiết bị</span>
                        <span>
                          {drilldownSortKey === 'order'
                            ? drilldownSortDir === 'asc'
                              ? '▲'
                              : '▼'
                            : '↕'}
                        </span>
                      </span>
                    </th>
                    <th
                      data-testid="drilldown-sort-total"
                      onClick={() => handleDrilldownSort('total')}
                      className="px-4 text-right cursor-pointer hover:text-[#176b58] transition-colors"
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        <span>Tổng đơn</span>
                        <span>
                          {drilldownSortKey === 'total'
                            ? drilldownSortDir === 'asc'
                              ? '▲'
                              : '▼'
                            : '↕'}
                        </span>
                      </span>
                    </th>
                    <th
                      data-testid="drilldown-sort-collected"
                      onClick={() => handleDrilldownSort('collected')}
                      className="px-4 text-right cursor-pointer hover:text-[#176b58] transition-colors"
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        <span>Thực thu</span>
                        <span>
                          {drilldownSortKey === 'collected'
                            ? drilldownSortDir === 'asc'
                              ? '▲'
                              : '▼'
                            : '↕'}
                        </span>
                      </span>
                    </th>
                    <th
                      data-testid="drilldown-sort-uncollected"
                      onClick={() => handleDrilldownSort('uncollected')}
                      className="px-4 text-right cursor-pointer hover:text-[#176b58] transition-colors"
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        <span>Còn nợ chưa thu</span>
                        <span>
                          {drilldownSortKey === 'uncollected'
                            ? drilldownSortDir === 'asc'
                              ? '▲'
                              : '▼'
                            : '↕'}
                        </span>
                      </span>
                    </th>
                    <th className="px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f2] text-sm">
                  {filteredAndSortedDrilldownItems.map((item, idx) => {
                    const isLoyal = Number(item.customer_orders_count || 1) > 1;
                    const normStatus = normalizeStatusCode(item.status);
                    const isHandedOver =
                      normStatus === 'completed' || item.status === 'Hoàn tất';
                    const uncollectedVal = Number(item.uncollected_amount || 0);

                    return (
                      <tr
                        key={`${item.order_code || item.id}-${idx}`}
                        className="hover:bg-[#fafcfa] transition-colors"
                      >
                        {/* Cột 1: Khách hàng & Liên hệ */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar
                              initials={item.customer_name || 'KH'}
                              variant={(idx % 4) as any}
                              size="sm"
                            />
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <b className="text-[#1c302b] font-semibold">
                                  {item.customer_name || 'Khách vãng lai'}
                                </b>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isLoyal
                                      ? 'bg-[#eaf4ef] text-[#176b58] border border-[#c5e1d4]'
                                      : 'bg-[#f4f6f5] text-[#64756d]'
                                  }`}
                                >
                                  {isLoyal ? 'Khách quen' : 'Khách mới'}
                                </span>
                              </div>
                              <div className="text-xs font-mono text-[#6e7f77] mt-0.5">
                                {item.customer_phone || 'Chưa cập nhật SĐT'}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Cột 2: Đơn & Thiết bị */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                setDrilldownModalOpen(false);
                                handleOpenOrderDetail(
                                  String(item.order_code || item.id),
                                  typeof item.id === 'number' ? item.id : undefined
                                );
                              }}
                              className="font-mono font-bold text-xs text-[#176b58] hover:underline cursor-pointer"
                            >
                              {item.order_code || item.id}
                            </button>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isHandedOver
                                  ? 'bg-[#eaf4ef] text-[#176b58]'
                                  : 'bg-[#fbf3e5] text-[#915e1b]'
                              }`}
                            >
                              {isHandedOver ? 'Đã giao máy' : 'Chờ khách lấy'}
                            </span>
                          </div>
                          <div className="text-xs text-[#4b5b53] font-medium mt-0.5">
                            {item.device_name || 'Thiết bị'}
                          </div>
                        </td>

                        {/* Cột 3: Tổng đơn */}
                        <td className="px-4 py-3 text-right font-mono font-bold text-[#1c302b]">
                          {formatVND(item.total_price)}
                        </td>

                        {/* Cột 4: Thực thu */}
                        <td className="px-4 py-3 text-right font-mono font-semibold text-[#176b58]">
                          {formatVND(item.collected_amount)}
                        </td>

                        {/* Cột 5: Còn nợ chưa thu */}
                        <td className="px-4 py-3 text-right">
                          {uncollectedVal > 0 ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-[8px] bg-[#fbefed] border border-[#f5c7c2] text-[#bc5b52] font-mono font-extrabold text-xs">
                              {formatVND(uncollectedVal)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-[8px] bg-[#eaf4ef] text-[#176b58] font-bold text-xs">
                              Đã thu đủ (0 ₫)
                            </span>
                          )}
                        </td>

                        {/* Cột 6: Thao tác */}
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {uncollectedVal > 0 && (
                              <Button
                                variant="primary"
                                size="sm"
                                icon="payments"
                                data-testid={`drilldown-btn-collect-${item.order_code || item.id}`}
                                onClick={() => {
                                  setDrilldownModalOpen(false);
                                  handleOpenCheckout(item);
                                }}
                                className="bg-[#176b58] hover:bg-[#125848] text-white font-bold text-xs"
                              >
                                Thu tiền
                              </Button>
                            )}
                            <Button
                              variant="secondary"
                              size="sm"
                              data-testid={`drilldown-btn-customer-${item.order_code || item.id}`}
                              onClick={() => {
                                setDrilldownModalOpen(false);
                                router.push(
                                  `/customers?q=${encodeURIComponent(
                                    item.customer_phone || item.customer_name || ''
                                  )}`
                                );
                              }}
                              className="text-xs font-semibold"
                            >
                              Hồ sơ khách
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </AppShell>
  );
}
