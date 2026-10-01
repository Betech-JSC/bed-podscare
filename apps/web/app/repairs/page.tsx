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
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { IntakeWizardModal } from '../components/IntakeWizardModal';
import { usePodsCare } from '../providers';
import type { RepairOrder } from '@podscare/types';
import { repairService } from '@podscare/api-client';
import { useQuery } from '@tanstack/react-query';
import {
  normalizeStatusCode,
  getQuickActionsForStatus,
} from './fsm';

export default function RepairsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { orders, updateOrder, branch, branchId, setBranch, branches, role, invalidateOrders } =
    usePodsCare();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<RepairOrder | null>(null);
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

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
    queryKey: ['repairs', branchId, statusFilter, search],
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
      const res = await repairService.getRepairs(params);
      return res?.data || res;
    },
  });

  const filteredOrders: RepairOrder[] = useMemo(() => {
    const raw = apiOrdersData?.data || apiOrdersData;
    const list = Array.isArray(raw) ? raw : [];
    if (list.length === 0 && !search && !statusFilter) {
      return orders;
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
        name: o.customer?.name || 'Khách lẻ',
        phone: o.customer?.phone || '',
        deviceCategory: o.device_model?.category || 'AirPods',
        device: o.device_model?.name || 'AirPods',
        serial: o.serial_number || 'Chưa cập nhật',
        issue: o.issue_description || 'Kiểm tra',
        status: mappedStatus.label,
        statusType: mappedStatus.type,
        price: Number(o.total_price) || Number(o.estimated_price) || 0,
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
        finalCheck: o.final_check_result,
        qcIssue: o.qc_note,
        acceptedAt: o.tech_accepted_at,
        startedAt: o.repair_started_at,
        completedAt: o.repair_completed_at,
        customerApprovedAt: o.customer_approved_at,
        createdAt: o.created_at,
      };
    });
  }, [apiOrdersData, orders, search, statusFilter]);

  const moneyFormatted = (n: number) =>
    n ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫' : '—';

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
            onClick={() => setIntakeModalOpen(true)}
          >
            Tiếp nhận thiết bị mới
          </Button>
        </div>

        {/* Panel with Table and Filters */}
        <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
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
            <TableSkeleton rows={6} cols={7} />
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
                    <th className="px-4 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f2] text-sm text-[#3b4c44]">
                  {filteredOrders.map((o, idx) => (
                    <tr
                      key={o.id}
                      onClick={() => setSelectedOrder(o)}
                      className="h-14 hover:bg-[#fbfcfb] cursor-pointer transition-colors"
                    >
                      <td className="px-4 font-mono font-bold text-[#176b58]">{o.id}</td>
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
                        <StatusTag label={o.status} type={o.statusType} />
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrder(o);
                          }}
                        >
                          ···
                        </Button>
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
          subtitle={`Số điện thoại: ${selectedOrder.phone} · Ngày tiếp nhận: ${selectedOrder.date}`}
          footer={
            <div className="flex items-center justify-between w-full">
              <Button
                variant="secondary"
                icon="arrow"
                onClick={() => router.push(`/print/${selectedOrder.id}`)}
              >
                Xem phiếu tiếp nhận ↗
              </Button>
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

            {/* Quick State Transitions & Dynamic FSM UI Guard */}
            {(() => {
              const currentStatusCode = normalizeStatusCode(selectedOrder.status);
              const isWaitingQc = currentStatusCode === 'waiting_qc';
              const actions = getQuickActionsForStatus(currentStatusCode);

              return (
                <div className="space-y-2.5 pt-1 pb-3 border-b border-[#f0f3f1]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[#75857d] font-bold">Chuyển trạng thái nhanh:</span>
                    {actions.length === 0 ? (
                      <span className="text-xs text-[#86968f] italic">
                        {currentStatusCode === 'completed'
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
        onClose={() => setIntakeModalOpen(false)}
        onSuccess={() => setIntakeModalOpen(false)}
      />
    </AppShell>
  );
}
