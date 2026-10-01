'use client';

import React, { useState } from 'react';
import { repairService } from '@podscare/api-client';
import {
  Button,
  StatusTag,
  Modal,
  Textarea,
  Input,
  Select,
  Checkbox,
  useToast,
  EmptyState,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';
import type { RepairOrder } from '@podscare/types';

export default function TechnicianQueuePage() {
  const { toast } = useToast();
  const { orders, currentUser, branch, branchId, setBranch, branches, role, invalidateOrders } = usePodsCare();

  const [selectedOrder, setSelectedOrder] = useState<RepairOrder | null>(null);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Completion Form State
  const [repairNote, setRepairNote] = useState('');
  const [partsUsed, setPartsUsed] = useState('');
  const [finalCheck, setFinalCheck] = useState('Đã chạy thử, hoạt động bình thường');
  const [consentCheck, setConsentCheck] = useState(false);

  const techName = currentUser.name;

  // Filter orders by branch
  const branchFilteredOrders = React.useMemo(() => {
    if (branchId === 'all' || branchId === undefined || branchId === null) {
      return orders;
    }
    return orders.filter((o) => {
      const matchId = o.branchId !== undefined && String(o.branchId) === String(branchId);
      const matchName = o.branch ? o.branch.includes(branch) || branch.includes(o.branch) : false;
      return matchId || matchName;
    });
  }, [orders, branch, branchId]);

  // Available orders: unassigned and waiting for tech in current branch (Task 3.5)
  const availableOrders = React.useMemo(() => {
    return branchFilteredOrders.filter(
      (o) =>
        (!o.technicianId && !o.technician_id) &&
        (o.status === 'Chờ kỹ thuật' || o.status === 'waiting_tech')
    );
  }, [branchFilteredOrders]);

  // Active orders assigned to this tech in current branch
  const myActiveOrders = React.useMemo(() => {
    return branchFilteredOrders.filter(
      (o) =>
        (currentUser.role === 'admin' || Number(o.technicianId || o.technician_id) === Number(currentUser.id)) &&
        !['Hoàn tất kỹ thuật', 'Chờ QC', 'Sẵn sàng trả', 'Hoàn tất', 'Đã hủy'].includes(o.status)
    );
  }, [branchFilteredOrders, currentUser.id, currentUser.role]);

  // Completed today by this tech in current branch
  const completedToday = React.useMemo(() => {
    return branchFilteredOrders.filter(
      (o) =>
        (currentUser.role === 'admin' || Number(o.technicianId || o.technician_id) === Number(currentUser.id)) &&
        ['Chờ QC', 'Sẵn sàng trả', 'Hoàn tất'].includes(o.status)
    );
  }, [branchFilteredOrders, currentUser.id, currentUser.role]);

  const handleAcceptOrder = async (order: RepairOrder) => {
    try {
      await repairService.transition(order.id, { transition: 'assigned' });
      await invalidateOrders();
      toast(`Bạn đã nhận phụ trách đơn ${order.id}`, 'success');
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Không thể nhận đơn', 'error');
    }
  };

  const handleStartRepair = async (order: RepairOrder) => {
    try {
      await repairService.transition(order.id, { transition: 'in_repair' });
      await invalidateOrders();
      toast(`Đã bắt đầu sửa chữa ${order.id}`, 'success');
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Không thể bắt đầu sửa chữa', 'error');
    }
  };

  const openCompleteModal = (order: RepairOrder) => {
    setSelectedOrder(order);
    setRepairNote('');
    setPartsUsed('');
    setConsentCheck(false);
    setCompleteModalOpen(true);
  };

  const handleCompleteRepair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    if (!repairNote.trim()) {
      toast('Vui lòng nhập nội dung đã kiểm tra và sửa chữa', 'error');
      return;
    }
    if (!consentCheck) {
      toast('Vui lòng xác nhận kiểm tra trước khi chuyển QC', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await repairService.transition(selectedOrder.id, {
        transition: 'waiting_qc',
        repair_note: repairNote.trim(),
        parts_used: partsUsed.trim() || undefined,
      });
      await invalidateOrders();
      toast(`Đã hoàn tất đơn ${selectedOrder.id} · Chuyển bộ phận QC`, 'success');
      setCompleteModalOpen(false);
      setSelectedOrder(null);
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Không thể hoàn tất sửa chữa', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderTechCard = (order: RepairOrder, isAvailable: boolean) => (
    <article
      key={order.id}
      className="bg-white border border-[#e5ece8] rounded-[10px] p-4 flex flex-col justify-between shadow-xs hover:border-[#b8d0c1] transition-all"
    >
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono font-bold text-xs text-[#176b58]">{order.id}</span>
          <StatusTag label={order.status} type={order.statusType} />
        </div>

        <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
          {order.device}
          {order.serial && (
            <small className="block font-sans font-normal text-xs text-[#83938b] mt-0.5 truncate">
              {order.serial}
            </small>
          )}
        </h3>

        <p className="text-xs text-[#62736b] my-2.5 min-h-[32px] line-clamp-2 leading-relaxed">
          {order.issue}
        </p>

        <div className="flex items-center gap-2 pt-2.5 border-t border-[#f0f3f1] text-xs text-[#2c3d34]">
          <div className="w-6 h-6 rounded-full bg-[#eaf4ef] text-[#176b58] font-bold grid place-items-center text-xs">
            {order.name.slice(0, 1)}
          </div>
          <div>
            <b>{order.name}</b>
            <span className="text-[#84948c] ml-1.5">{order.phone}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-[#83938b] my-2.5">
          <span>Tiếp nhận: {order.date}</span>
          <span>{order.branch}</span>
        </div>
      </div>

      <div className="pt-2 flex gap-1.5 mt-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => {
            setSelectedOrder(order);
            setDetailModalOpen(true);
          }}
        >
          Xem phiếu
        </Button>

        {isAvailable ? (
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            onClick={() => handleAcceptOrder(order)}
          >
            Nhận đơn →
          </Button>
        ) : order.status === 'Đang sửa' ? (
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            onClick={() => openCompleteModal(order)}
          >
            Hoàn tất →
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            onClick={() => handleStartRepair(order)}
          >
            Bắt đầu sửa →
          </Button>
        )}
      </div>
    </article>
  );

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
                {branchId === 'all' ? 'Toàn bộ chi nhánh' : branch}
              </span>
            </div>
            <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#1c302b] m-0">
              Hàng đợi xử lý kỹ thuật viên
            </h1>
            <p className="text-sm text-[#7e8d85] mt-1 mb-0">
              Xin chào {techName} · Nhận máy mới từ quầy CSKH {branchId === 'all' ? 'toàn chuỗi' : branch}, ghi nhận linh kiện và chuyển duyệt QC.
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
                  Chi nhánh trực: {branch.startsWith('PodsCare') ? branch : `PodsCare · ${branch}`}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-[10px] border border-[#e5ece8] shadow-xs">
            <span className="text-xs text-[#708078] block font-medium">Đơn đang phụ trách</span>
            <b className="font-heading text-2xl md:text-3xl text-[#1c302b] block mt-1.5">
              {String(myActiveOrders.length).padStart(2, '0')}
            </b>
            <small className="text-xs text-[#368361] font-semibold">Đang trong ca làm việc</small>
          </div>
          <div className="bg-white p-4 rounded-[10px] border border-[#e5ece8] shadow-xs">
            <span className="text-xs text-[#708078] block font-medium">Đơn mới chờ nhận</span>
            <b className="font-heading text-2xl md:text-3xl text-[#1c302b] block mt-1.5">
              {String(availableOrders.length).padStart(2, '0')}
            </b>
            <small className="text-xs text-[#a4722f] font-semibold">Có phiếu CSKH kèm theo</small>
          </div>
          <div className="bg-white p-4 rounded-[10px] border border-[#e5ece8] shadow-xs">
            <span className="text-xs text-[#708078] block font-medium">Đang sửa chữa</span>
            <b className="font-heading text-2xl md:text-3xl text-[#1c302b] block mt-1.5">
              {String(myActiveOrders.filter((o) => o.status === 'Đang sửa').length).padStart(
                2,
                '0'
              )}
            </b>
            <small className="text-xs text-[#4778a4] font-semibold">Thao tác linh kiện</small>
          </div>
          <div className="bg-white p-4 rounded-[10px] border border-[#e5ece8] shadow-xs">
            <span className="text-xs text-[#708078] block font-medium">Đã sửa xong hôm nay</span>
            <b className="font-heading text-2xl md:text-3xl text-[#1c302b] block mt-1.5">
              {String(completedToday.length).padStart(2, '0')}
            </b>
            <small className="text-xs text-[#28805e] font-semibold">Đang chờ QC kiểm định</small>
          </div>
        </div>

        {/* Section 1: My active jobs */}
        <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-heading font-bold text-base text-[#1c302b] m-0">
                Đơn tôi đang xử lý
              </h2>
              <p className="text-xs text-[#809088] mt-0.5 mb-0">
                Mở phiếu để xem ghi chú quầy, bắt đầu sửa và ghi nhận kết quả.
              </p>
            </div>
            <span className="text-xs font-bold text-[#176b58] bg-[#eaf4ef] px-3 py-1 rounded-[10px]">
              {myActiveOrders.length} đơn
            </span>
          </div>

          {myActiveOrders.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {myActiveOrders.map((o) => renderTechCard(o, false))}
            </div>
          ) : (
            <EmptyState
              title="Bạn chưa có đơn nào đang xử lý"
              description="Hãy nhận đơn mới từ danh sách bên dưới để bắt đầu ca sửa chữa."
              icon="wrench"
            />
          )}
        </div>

        {/* Section 2: Available jobs to pick up */}
        <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-heading font-bold text-base text-[#1c302b] m-0">
                Đơn mới sẵn sàng nhận
              </h2>
              <p className="text-xs text-[#809088] mt-0.5 mb-0">
                Phiếu tiếp nhận do CSKH lập kèm lỗi khách báo và kết quả test ban đầu.
              </p>
            </div>
            <span className="text-xs font-bold text-[#a4722f] bg-[#faf3e7] px-3 py-1 rounded-[10px]">
              {availableOrders.length} đơn
            </span>
          </div>

          {availableOrders.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {availableOrders.map((o) => renderTechCard(o, true))}
            </div>
          ) : (
            <EmptyState
              title="Hiện không có đơn mới chờ nhận"
              description="Tất cả các máy tiếp nhận đã được phân bổ cho kỹ thuật viên."
              icon="check"
            />
          )}
        </div>
      </div>

      {/* Completion Modal */}
      <Modal
        isOpen={completeModalOpen}
        onClose={() => setCompleteModalOpen(false)}
        eyebrow={`HOÀN TẤT SỬA CHỮA · ${selectedOrder?.id}`}
        title="Ghi nhận kết quả kỹ thuật"
        subtitle={`${selectedOrder?.device} · ${selectedOrder?.name}`}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="secondary" onClick={() => setCompleteModalOpen(false)}>
              Quay lại
            </Button>
            <Button
              variant="primary"
              icon="check"
              disabled={isSubmitting}
              onClick={handleCompleteRepair}
            >
              {isSubmitting ? 'Đang chuyển QC...' : 'Hoàn tất & Chuyển QC'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCompleteRepair} className="space-y-4">
          <Textarea
            label="Nội dung đã kiểm tra & sửa chữa *"
            value={repairNote}
            onChange={(e) => setRepairNote(e.target.value)}
            placeholder="Mô tả các hạng mục đã thay thế, cân chỉnh, hàn linh kiện hoặc test thử..."
            required
          />

          <Input
            label="Hạng mục linh kiện đã dùng (nếu có)"
            value={partsUsed}
            onChange={(e) => setPartsUsed(e.target.value)}
            placeholder="Ví dụ: Pin AirPods Pro 2 mã BAT-APP2-01, lưới chống bụi..."
          />

          <Select
            label="Kết quả chạy thử cuối"
            value={finalCheck}
            onChange={(e) => setFinalCheck(e.target.value)}
            options={[
              'Đã chạy thử, hoạt động bình thường',
              'Cần QC kiểm tra kỹ thêm phần chống ồn',
              'Đã thay pin, sạc đầy 100%',
              'Chưa hoàn thiện hết, cần QC thẩm định',
            ]}
          />

          <div className="p-3.5 bg-[#fafbfa] border border-[#edf1ee] rounded-[8px]">
            <Checkbox
              checked={consentCheck}
              onChange={(e) => setConsentCheck(e.target.checked)}
              label={
                <span className="text-xs text-[#485950] leading-relaxed">
                  Tôi xác nhận đã ghi nhận trung thực kết quả thao tác kỹ thuật và chuyển đơn sang bộ
                  phận kiểm định QC.
                </span>
              }
            />
          </div>
        </form>
      </Modal>

      {/* Tech Detail Modal */}
      {selectedOrder && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          eyebrow={`PHIẾU KỸ THUẬT · ${selectedOrder.id}`}
          title={`${selectedOrder.device} · ${selectedOrder.name}`}
          subtitle={`SĐT: ${selectedOrder.phone} · Tiếp nhận ngày: ${selectedOrder.date}`}
          footer={
            <Button variant="secondary" onClick={() => setDetailModalOpen(false)}>
              Đóng phiếu
            </Button>
          }
        >
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3.5 bg-[#fafbfa] p-4 rounded-[10px] border border-[#edf1ee]">
              <div>
                <span className="text-xs text-[#7d8c85] block mb-0.5">Kỹ thuật viên giữ máy:</span>
                <b className="text-sm text-[#1c302b]">{selectedOrder.tech}</b>
              </div>
              <div>
                <span className="text-xs text-[#7d8c85] block mb-0.5">Chi phí báo khách:</span>
                <b className="text-base text-[#176b58] font-heading font-bold">
                  {selectedOrder.price
                    ? new Intl.NumberFormat('vi-VN').format(selectedOrder.price) + ' ₫'
                    : 'Chưa có giá'}
                </b>
              </div>
            </div>

            <div>
              <span className="text-xs text-[#77867f] font-bold block mb-1">Lỗi khách báo ban đầu:</span>
              <p className="bg-[#f7faf8] p-3 rounded-[8px] border border-[#e5ece8] m-0 text-sm">
                {selectedOrder.issue}
              </p>
            </div>

            {selectedOrder.checks && selectedOrder.checks.length > 0 && (
              <div>
                <span className="text-xs text-[#77867f] font-bold block mb-1.5 uppercase tracking-wide">
                  Kết quả test chức năng tại quầy CSKH:
                </span>
                <div className="border border-[#e5ece8] rounded-[8px] overflow-hidden divide-y divide-[#f0f3f1]">
                  {selectedOrder.checks.map((c, i) => (
                    <div key={i} className="flex justify-between p-2.5 text-sm">
                      <span className="text-[#485850]">{c.label}</span>
                      <span
                        className={`font-bold ${
                          c.status === 'Hoạt động'
                            ? 'text-[#287452]'
                            : c.status === 'Lỗi'
                            ? 'text-[#b85c51]'
                            : 'text-[#7e8d85]'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedOrder.testNote && (
              <div>
                <span className="text-xs text-[#77867f] font-bold block mb-1">Ghi chú từ CSKH:</span>
                <p className="bg-[#f7faf8] p-3 rounded-[8px] border border-[#e5ece8] m-0 text-sm">
                  {selectedOrder.testNote}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
