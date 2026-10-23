'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { qcService, repairService, deviceService } from '@podscare/api-client';
import {
  Button,
  StatusTag,
  PaginationBar,
  Modal,
  Textarea,
  Checkbox,
  useToast,
  EmptyState,
  resolveOrderStatus,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';
import type { RepairOrder } from '@podscare/types';

export default function QCInspectionPage() {
  const { toast } = useToast();
  const { orders, branchId, invalidateOrders } = usePodsCare();

  const [selectedOrder, setSelectedOrder] = useState<RepairOrder | null>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingCriteria, setLoadingCriteria] = useState(false);

  // Pagination state cho danh sách Chờ QC và Lịch sử kiểm định
  const [pendingPage, setPendingPage] = useState<number>(1);
  const [pendingPerPage, setPendingPerPage] = useState<number | 'all'>(15);
  const [historyPage, setHistoryPage] = useState<number>(1);
  const [historyPerPage, setHistoryPerPage] = useState<number | 'all'>(15);

  // QC Checklist Items State: boolean map
  const [qcCriteria, setQcCriteria] = useState<string[]>([]);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [reworkReason, setReworkReason] = useState('');
  const [qcNotes, setQcNotes] = useState('');

  React.useEffect(() => {
    setPendingPage(1);
    setHistoryPage(1);
  }, [branchId]);

  // Nạp trực tiếp các đơn chờ QC (status: 'waiting_qc') từ server với per_page: 'all'
  const { data: apiPendingQcData, isLoading: isPendingQcLoading, refetch: refetchPendingQc } = useQuery({
    queryKey: ['qc-pending-orders', branchId],
    queryFn: async () => {
      const params: Record<string, any> = {
        status: 'waiting_qc',
        per_page: 'all',
        all: true,
        date_filter: 'all',
      };
      if (branchId && branchId !== 'all') {
        params.branch_id = branchId;
      }
      const res = await repairService.getRepairs(params);
      return res?.data || res;
    },
  });

  // Nạp độc lập danh sách đơn hàng QC với per_page: 'all', date_filter: 'all' để không sót các đơn chờ QC tồn đọng và lịch sử kiểm định
  const { data: apiQcOrdersData, isLoading: isHistoryQcLoading, refetch: refetchHistoryQc } = useQuery({
    queryKey: ['qc-orders', branchId],
    queryFn: async () => {
      const params: Record<string, any> = {
        per_page: 'all',
        all: true,
        date_filter: 'all',
      };
      if (branchId && branchId !== 'all') {
        params.branch_id = branchId;
      }
      const res = await repairService.getRepairs(params);
      return res?.data || res;
    },
  });

  const mapRawOrderToRepairOrder = (o: any): RepairOrder => {
    const mappedStatus = resolveOrderStatus(o.status);
    return {
      id: o.order_code || String(o.id),
      order_type: o.order_type || o.orderType || 'in_store',
      orderType: o.order_type || o.orderType || 'in_store',
      name: o.customer?.name || 'Khách lẻ',
      phone: o.customer?.phone || '',
      deviceCategory: o.device_model?.category || 'AirPods',
      device: o.device_model?.name || 'AirPods',
      device_id: o.device_model_id || o.device_model?.id || o.device_id || null,
      device_model_id: o.device_model_id || o.device_model?.id || o.device_id || null,
      serial: o.serial_number || 'Chưa cập nhật',
      issue: o.issue_description || 'Kiểm tra',
      status: mappedStatus.label,
      statusType: mappedStatus.type,
      price: Number(o.total_price) || Number(o.estimated_price) || 0,
      total_price: Number(o.total_price) || Number(o.price) || 0,
      tech: o.technician?.name || 'Chưa phân công',
      technicianId: o.technician_id ?? o.technician?.id ?? null,
      technician_id: o.technician_id ?? o.technician?.id ?? null,
      date: o.created_at
        ? new Intl.DateTimeFormat('vi-VN').format(new Date(o.created_at))
        : 'Hôm nay',
      branch: o.branch?.name || 'Chi nhánh FIXO',
      branchId: o.branch_id || o.branch?.id || 1,
      branchName: o.branch?.name || 'Chi nhánh FIXO',
      repairNote: o.repair_note,
      partsUsed: o.parts_used_summary,
      finalCheck: o.final_check_result,
      qcIssue: o.qc_note,
    };
  };

  const mergedOrders: RepairOrder[] = useMemo(() => {
    const raw = apiQcOrdersData?.data || apiQcOrdersData;
    const apiList = Array.isArray(raw) ? raw : [];
    const mappedApi: RepairOrder[] = apiList.map(mapRawOrderToRepairOrder);

    const rawPending = apiPendingQcData?.data || apiPendingQcData;
    const pendingList = Array.isArray(rawPending) ? rawPending : [];
    const mappedPending: RepairOrder[] = pendingList.map(mapRawOrderToRepairOrder);

    if (mappedApi.length === 0 && mappedPending.length === 0) {
      return orders;
    }

    const byId = new Map<string, RepairOrder>();
    orders.forEach((o) => byId.set(String(o.id), o));
    mappedApi.forEach((o) => {
      const existing = byId.get(String(o.id));
      byId.set(String(o.id), existing ? { ...existing, ...o } : o);
    });
    mappedPending.forEach((o) => {
      const existing = byId.get(String(o.id));
      byId.set(String(o.id), existing ? { ...existing, ...o } : o);
    });
    return Array.from(byId.values());
  }, [apiQcOrdersData, apiPendingQcData, orders]);

  // Orders waiting for QC inspection
  const qcOrders = mergedOrders.filter((o) => o.status === 'Chờ QC');
  const pastQcOrders = mergedOrders.filter((o) =>
    ['Sẵn sàng trả', 'Cần sửa lại', 'Hoàn tất'].includes(o.status)
  );

  // Pagination calculation for Pending QC
  const pendingTotal = qcOrders.length;
  const pendingLastPage = useMemo(() => {
    if (pendingPerPage === 'all') return 1;
    const size = Math.max(1, Number(pendingPerPage) || 15);
    return Math.max(1, Math.ceil(pendingTotal / size));
  }, [pendingPerPage, pendingTotal]);
  const pendingCurrentPage = useMemo(() => {
    if (pendingPerPage === 'all') return 1;
    return Math.min(Math.max(1, pendingPage), pendingLastPage);
  }, [pendingPerPage, pendingPage, pendingLastPage]);
  const pendingFrom = useMemo(() => {
    if (pendingTotal === 0) return 0;
    if (pendingPerPage === 'all') return 1;
    const size = Math.max(1, Number(pendingPerPage) || 15);
    return (pendingCurrentPage - 1) * size + 1;
  }, [pendingTotal, pendingPerPage, pendingCurrentPage]);
  const pendingTo = useMemo(() => {
    if (pendingTotal === 0) return 0;
    if (pendingPerPage === 'all') return pendingTotal;
    const size = Math.max(1, Number(pendingPerPage) || 15);
    return Math.min(pendingTotal, pendingCurrentPage * size);
  }, [pendingTotal, pendingPerPage, pendingCurrentPage]);
  const paginatedQcOrders = useMemo(() => {
    if (pendingPerPage === 'all') return qcOrders;
    const size = Math.max(1, Number(pendingPerPage) || 15);
    const start = Math.max(0, (pendingCurrentPage - 1) * size);
    return qcOrders.slice(start, start + size);
  }, [qcOrders, pendingPerPage, pendingCurrentPage]);

  // Pagination calculation for Past QC History
  const historyTotal = pastQcOrders.length;
  const historyLastPage = useMemo(() => {
    if (historyPerPage === 'all') return 1;
    const size = Math.max(1, Number(historyPerPage) || 15);
    return Math.max(1, Math.ceil(historyTotal / size));
  }, [historyPerPage, historyTotal]);
  const historyCurrentPage = useMemo(() => {
    if (historyPerPage === 'all') return 1;
    return Math.min(Math.max(1, historyPage), historyLastPage);
  }, [historyPerPage, historyPage, historyLastPage]);
  const historyFrom = useMemo(() => {
    if (historyTotal === 0) return 0;
    if (historyPerPage === 'all') return 1;
    const size = Math.max(1, Number(historyPerPage) || 15);
    return (historyCurrentPage - 1) * size + 1;
  }, [historyTotal, historyPerPage, historyCurrentPage]);
  const historyTo = useMemo(() => {
    if (historyTotal === 0) return 0;
    if (historyPerPage === 'all') return historyTotal;
    const size = Math.max(1, Number(historyPerPage) || 15);
    return Math.min(historyTotal, historyCurrentPage * size);
  }, [historyTotal, historyPerPage, historyCurrentPage]);
  const paginatedPastQcOrders = useMemo(() => {
    if (historyPerPage === 'all') return pastQcOrders;
    const size = Math.max(1, Number(historyPerPage) || 15);
    const start = Math.max(0, (historyCurrentPage - 1) * size);
    return pastQcOrders.slice(start, start + size);
  }, [pastQcOrders, historyPerPage, historyCurrentPage]);

  const defaultQcCriteria = [
    'Chức năng âm thanh hai bên cân bằng, không rè âm',
    'Khả năng sạc đầy pin và nhận nguồn bình thường',
    'Kết nối Bluetooth ổn định trong cự ly 10m',
    'Chống ồn chủ động ANC & Xuyên âm hoạt động tốt',
    'Micro đàm thoại nghe rõ, lọc gió tốt',
    'Cảm ứng / gõ chạm phản hồi chính xác',
    'Vệ sinh sạch sẽ, không để lại vết keo hoặc bụi màng loa',
  ];

  const openInspectModal = async (order: RepairOrder) => {
    setSelectedOrder(order);
    setReworkReason('');
    setQcNotes('');
    setInspectModalOpen(true);
    setLoadingCriteria(true);

    try {
      const deviceId = order.device_id || order.device_model_id;
      const res = await deviceService.getChecklistTemplate(
        deviceId ? { device_model_id: deviceId } : { category: order.deviceCategory }
      );
      const raw = res?.data || res;
      const list = Array.isArray(raw) ? raw : (raw?.data || []);
      const items = list
        .map((item: any) => item.item_name || item.name || (typeof item === 'string' ? item : ''))
        .filter(Boolean);

      const effectiveCriteria = items.length > 0 ? items : defaultQcCriteria;
      setQcCriteria(effectiveCriteria);

      const initialMap: Record<string, boolean> = {};
      effectiveCriteria.forEach((crit: string) => {
        initialMap[crit] = true;
      });
      setCheckedItems(initialMap);
    } catch (err) {
      console.warn('Could not load dynamic checklist template for device:', err);
      setQcCriteria(defaultQcCriteria);
      const initialMap: Record<string, boolean> = {};
      defaultQcCriteria.forEach((crit) => {
        initialMap[crit] = true;
      });
      setCheckedItems(initialMap);
    } finally {
      setLoadingCriteria(false);
    }
  };

  const handleToggleCrit = (crit: string) => {
    setCheckedItems((prev) => ({
      ...prev,
      [crit]: !prev[crit],
    }));
  };

  const isAllPassed = qcCriteria.length > 0 && qcCriteria.every((crit) => checkedItems[crit]);

  const handlePassQC = async () => {
    if (!selectedOrder) return;
    setIsSubmitting(true);
    try {
      const criteriaData = qcCriteria.map((c) => ({
        criterion: c,
        is_passed: checkedItems[c] ?? true,
      }));

      await qcService.createInspection({
        repair_order_id: selectedOrder.id,
        result: 'pass',
        notes: qcNotes || undefined,
        criteria: criteriaData,
      });

      try {
        await repairService.transition(selectedOrder.id, {
          transition: 'ready_for_return',
        });
      } catch {
        // Backend store may have already transitioned status
      }

      await invalidateOrders();
      refetchPendingQc();
      refetchHistoryQc();
      toast(`Đơn ${selectedOrder.id} đã ĐẠT QC · Sẵn sàng trả máy cho khách`, 'success');
      setInspectModalOpen(false);
      setSelectedOrder(null);
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Có lỗi xảy ra khi lưu kết quả QC', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectQC = async () => {
    if (!selectedOrder) return;
    if (!reworkReason.trim()) {
      toast('Vui lòng nhập lý do từ chối QC để kỹ thuật viên nắm rõ', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const criteriaData = qcCriteria.map((c) => ({
        criterion: c,
        is_passed: checkedItems[c] ?? false,
      }));

      await qcService.createInspection({
        repair_order_id: selectedOrder.id,
        result: 'fail',
        rework_reason: reworkReason.trim(),
        notes: qcNotes || undefined,
        criteria: criteriaData,
      });

      try {
        await repairService.transition(selectedOrder.id, {
          transition: 'rework_needed',
          rework_reason: reworkReason.trim(),
        });
      } catch {
        // Backend store may have already transitioned status
      }

      await invalidateOrders();
      refetchPendingQc();
      refetchHistoryQc();
      toast(`Đơn ${selectedOrder.id} đã bị TỪ CHỐI QC · Chuyển về kỹ thuật sửa lại`, 'error');
      setInspectModalOpen(false);
      setSelectedOrder(null);
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Có lỗi xảy ra khi từ chối QC', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell crumbName="Kiểm định QC">
      <div className="space-y-6">
        {/* Head */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1">
              QUALITY CONTROL
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Kiểm định chất lượng sửa chữa (QC Inspection)
            </h1>
            <p className="text-sm text-[#85928c] mt-1 mb-0">
              Thẩm định thiết bị sau khi kỹ thuật viên sửa xong trước khi bàn giao cho khách hàng.
            </p>
          </div>
        </div>

        {/* Pending QC List */}
        <div className="bg-white rounded-[10px] border border-[#e5ece8] p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-heading font-bold text-base text-[#1c302b] m-0">
                Đơn hàng chờ kiểm định ({qcOrders.length})
              </h2>
              <p className="text-xs text-[#89958f] mt-0.5 mb-0">
                Được kỹ thuật viên báo hoàn tất, cần kiểm tra tiêu chuẩn xuất xưởng theo dòng máy.
              </p>
            </div>
            <span className="text-xs font-bold text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded-[10px]">
              {qcOrders.length} máy chờ duyệt
            </span>
          </div>

          {qcOrders.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {paginatedQcOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white border border-[#e5ece8] rounded-[10px] p-4 flex flex-col justify-between shadow-xs hover:border-[#b8d0c1] transition-all"
                  >
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-mono font-bold text-xs text-[#176b58]">
                          {order.id}
                        </span>
                        <StatusTag label={order.status} type={order.statusType} />
                      </div>

                      <h3 className="font-heading font-bold text-sm text-[#1c302b] m-0">
                        {order.device}
                      </h3>
                      <p className="text-xs text-[#75837b] my-1">
                        Kỹ Thuật:{' '}<b>{order.tech}</b> · {order.date}
                      </p>

                      <div className="bg-[#f7faf8] p-2.5 rounded border border-[#edf1ee] my-2 text-xs">
                        <span className="text-[#81908a] block">Lỗi ban đầu:</span>
                        <b className="text-[#33443c] block truncate">{order.issue}</b>
                        {order.repairNote && (
                          <>
                            <span className="text-[#81908a] block mt-1">Nội dung Kỹ Thuật đã sửa:</span>
                            <span className="text-[#176b58] font-medium block truncate">
                              {order.repairNote}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full mt-2"
                      icon="check"
                      onClick={() => openInspectModal(order)}
                    >
                      Tiến hành kiểm định QC →
                    </Button>
                  </div>
                ))}
              </div>
              <PaginationBar
                testIdPrefix="qc-pending"
                currentPage={pendingCurrentPage}
                lastPage={pendingLastPage}
                total={pendingTotal}
                from={pendingFrom}
                to={pendingTo}
                perPage={pendingPerPage}
                onPageChange={(nextPage) => setPendingPage(nextPage)}
                onPerPageChange={(nextPerPage) => {
                  setPendingPerPage(nextPerPage);
                  setPendingPage(1);
                }}
                itemLabel="đơn chờ QC"
                isLoading={isPendingQcLoading}
              />
            </>
          ) : (
            <EmptyState
              title="Hiện không có đơn nào chờ kiểm định QC"
              description="Tất cả các máy sau sửa chữa đã được thẩm định và bàn giao thành công."
              icon="check"
            />
          )}
        </div>

        {/* Recent QC History */}
        <div className="bg-white rounded-[10px] border border-[#e5ece8] p-4 sm:p-5">
          <h2 className="font-heading font-bold text-base text-[#1c302b] mb-3">
            Lịch sử kiểm định gần đây
          </h2>
          {pastQcOrders.length > 0 ? (
            <>
              <div className="divide-y divide-[#f1f3f2]">
                {paginatedPastQcOrders.map((o) => (
                  <div key={o.id} className="py-2.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-[#176b58]">{o.id}</span>
                      <b>{o.device}</b>
                      <span className="text-[#81908a]">Kỹ Thuật: {o.tech}</span>
                    </div>
                    <StatusTag label={o.status} type={o.statusType} />
                  </div>
                ))}
              </div>
              <PaginationBar
                testIdPrefix="qc-history"
                currentPage={historyCurrentPage}
                lastPage={historyLastPage}
                total={historyTotal}
                from={historyFrom}
                to={historyTo}
                perPage={historyPerPage}
                onPageChange={(nextPage) => setHistoryPage(nextPage)}
                onPerPageChange={(nextPerPage) => {
                  setHistoryPerPage(nextPerPage);
                  setHistoryPage(1);
                }}
                itemLabel="lịch sử kiểm định"
                isLoading={isHistoryQcLoading}
              />
            </>
          ) : (
            <p className="text-xs text-[#89958f] m-0">Chưa có lịch sử kiểm định QC nào.</p>
          )}
        </div>
      </div>

      {/* QC Inspection Modal */}
      {selectedOrder && (
        <Modal
          isOpen={inspectModalOpen}
          onClose={() => setInspectModalOpen(false)}
          maxWidth="lg"
          eyebrow={`KIỂM ĐỊNH QC · ${selectedOrder.id}`}
          title={`Thẩm định chất lượng: ${selectedOrder.device}`}
          subtitle={`Chủ máy: ${selectedOrder.name} · Kỹ thuật viên: ${selectedOrder.tech}`}
          footer={
            <div className="flex items-center justify-between w-full">
              <Button variant="ghost" onClick={() => setInspectModalOpen(false)}>
                Đóng
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="danger" icon="alert" disabled={isSubmitting} onClick={handleRejectQC}>
                  {isSubmitting ? 'Đang xử lý...' : 'Từ chối QC · Yêu cầu sửa lại'}
                </Button>
                <Button
                  variant="primary"
                  icon="check"
                  disabled={!isAllPassed || isSubmitting}
                  onClick={handlePassQC}
                >
                  {isSubmitting ? 'Đang lưu...' : 'Xác nhận QC ĐẠT → Sẵn sàng trả máy'}
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Summary info from Tech */}
            <div className="bg-[#f7faf8] p-3 rounded-[8px] border border-[#edf1ee] text-xs">
              <div className="flex justify-between items-center mb-1">
                <span>
                  Lỗi ban đầu: <b>{selectedOrder.issue}</b>
                </span>
                <span>
                  Linh kiện đã dùng:{' '}<b>{selectedOrder.partsUsed || 'Không'}</b>
                </span>
              </div>
              <p className="text-[#516058] m-0">
                <b>Ghi chú Kỹ Thuật:</b> {selectedOrder.repairNote || 'Kỹ Thuật chưa ghi chú chi tiết'}
              </p>
            </div>

            {/* Checklist */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-heading font-bold text-sm text-[#1c302b] m-0">
                  {qcCriteria.length} Tiêu chuẩn kiểm tra chức năng ({selectedOrder.device})
                </h4>
                <span className="text-xs text-[#81908a]">
                  Bỏ chọn nếu phát hiện tiêu chí không đạt
                </span>
              </div>

              {loadingCriteria ? (
                <div className="p-8 text-center text-xs text-[#718279] border border-[#e5ece8] rounded-[8px] bg-white">
                  <div className="w-6 h-6 rounded-full border-2 border-[#176b58]/20 border-t-[#176b58] animate-spin mx-auto mb-2" />
                  Đang nạp danh mục tiêu chí kiểm tra theo dòng máy {selectedOrder.device}...
                </div>
              ) : (
                <div className="border border-[#e5ece8] rounded-[8px] overflow-hidden divide-y divide-[#f0f3f1] bg-white">
                  {qcCriteria.map((crit, idx) => {
                    const isChecked = checkedItems[crit] ?? true;
                    return (
                      <div
                        key={idx}
                        onClick={() => handleToggleCrit(crit)}
                        className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                          isChecked ? 'hover:bg-[#fbfdfb]' : 'bg-[#fff8f7]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Checkbox
                            checked={isChecked}
                            onChange={() => handleToggleCrit(crit)}
                            id={`qc-crit-${idx}`}
                          />
                          <span
                            className={`text-sm ${
                              isChecked ? 'text-[#33443c] font-medium' : 'text-[#bc5b52] font-bold'
                            }`}
                          >
                            {crit}
                          </span>
                        </div>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-[10px] ${
                            isChecked
                              ? 'bg-[#eaf4ef] text-[#28805e]'
                              : 'bg-[#fbefed] text-[#bc5b52]'
                          }`}
                        >
                          {isChecked ? 'ĐẠT' : 'KHÔNG ĐẠT'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Rework reason textarea (shows when any criteria failed) */}
            {!isAllPassed && (
              <div className="p-3 bg-[#fdf5f4] rounded-[8px] border border-[#f5dcd8]">
                <Textarea
                  label="Lý do không đạt / Yêu cầu Kỹ Thuật xử lý lại *"
                  value={reworkReason}
                  onChange={(e) => setReworkReason(e.target.value)}
                  placeholder="Ghi rõ tiêu chí nào chưa đạt, ví dụ: Tai trái vẫn còn tiếng rè nhỏ khi tăng âm lượng quá 80%..."
                  required
                />
              </div>
            )}

            <Textarea
              label="Ghi chú thẩm định QC (tùy chọn)"
              value={qcNotes}
              onChange={(e) => setQcNotes(e.target.value)}
              placeholder="Ghi nhận thêm đánh giá chất lượng tổng thể..."
            />
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
