'use client';

import React, { useState, useMemo } from 'react';
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
import { normalizeStatusCode } from '../repairs/fsm';
import { useSilentPrint } from '../components/print';

export default function TechnicianQueuePage() {
  const { toast } = useToast();
  const { orders, currentUser, branch, branchId, setBranch, branches, role, invalidateOrders } =
    usePodsCare();

  const [selectedOrder, setSelectedOrder] = useState<RepairOrder | null>(null);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { printReceipt, isPrinting: isSilentPrinting } = useSilentPrint();

  const handlePrintRoutingSlip = async (order: RepairOrder) => {
    toast(`Đang gửi lệnh in tem khay K80 cho đơn ${order.id}...`, 'info');
    await printReceipt(order, 'k80', true);
  };

  // Completion Form State
  const [repairNote, setRepairNote] = useState('');
  const [partsUsed, setPartsUsed] = useState('');
  const [finalCheck, setFinalCheck] = useState('Đã chạy thử, hoạt động hoàn hảo');
  const [consentCheck, setConsentCheck] = useState(false);

  const techName = currentUser?.name || 'Kỹ thuật viên';

  // Lọc danh sách đơn theo chi nhánh được phân công hoặc chi nhánh đang chọn
  const branchFilteredOrders = useMemo(() => {
    if (branchId === 'all' || branchId === undefined || branchId === null) {
      return orders;
    }
    return orders.filter((o) => {
      const matchId = o.branchId !== undefined && String(o.branchId) === String(branchId);
      const matchName = o.branch ? o.branch.includes(branch) || branch.includes(o.branch) : false;
      return matchId || matchName;
    });
  }, [orders, branch, branchId]);

  // 1. Hàng đợi máy mới (Live Dispatch): Các đơn waiting_tech chưa có Kỹ Thuật nhận
  const availableOrders = useMemo(() => {
    return branchFilteredOrders.filter((o) => {
      const code = normalizeStatusCode(o.status);
      const isUnassigned = !o.technicianId && !o.technician_id;
      return (code === 'waiting_tech' || o.status === 'Chờ kỹ thuật') && isUnassigned;
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

  // Tổng số đơn Kỹ Thuật đã nhận hôm nay
  const acceptedTodayCount = myActiveOrders.length + myCompletedTodayOrders.length;

  // Hành động Tiếp nhận máy (Grab-style live dispatch: waiting_tech -> in_repair)
  const handleGrabOrder = async (order: RepairOrder) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await repairService.transition(order.id, {
        transition: 'in_repair',
        technician_id: currentUser?.id,
      });
      await invalidateOrders();
      toast(`⚡ Bạn đã nhận máy ${order.id} thành công! Đơn chuyển thẳng sang Đang sửa.`, 'success');
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Không thể nhận đơn máy', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mở modal hoàn tất sửa chữa
  const openCompleteModal = (order: RepairOrder) => {
    setSelectedOrder(order);
    setRepairNote('');
    setPartsUsed('');
    setFinalCheck('Đã chạy thử, hoạt động hoàn hảo');
    setConsentCheck(false);
    setCompleteModalOpen(true);
  };

  // Xác nhận hoàn tất sửa chữa và bàn giao ngay cho CSKH (in_repair -> ready_for_return)
  const handleCompleteRepair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || isSubmitting) return;
    if (!repairNote.trim()) {
      toast('Vui lòng nhập nội dung đã kiểm tra và sửa chữa', 'error');
      return;
    }
    if (!consentCheck) {
      toast('Vui lòng xác nhận kiểm tra hoàn chỉnh trước khi bàn giao', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await repairService.transition(selectedOrder.id, {
        transition: 'ready_for_return',
        repair_note: repairNote.trim(),
        parts_used: partsUsed.trim() || undefined,
        final_check_result: finalCheck,
      });
      await invalidateOrders();
      toast(`✓ Đã hoàn tất sửa chữa ${selectedOrder.id} · Tự động báo CSKH trả máy!`, 'success');
      setCompleteModalOpen(false);
      setSelectedOrder(null);
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Không thể hoàn tất sửa chữa', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Chuyển tạm dừng chờ linh kiện
  const handlePauseWaitingParts = async (order: RepairOrder) => {
    try {
      await repairService.transition(order.id, { transition: 'waiting_parts' });
      await invalidateOrders();
      toast(`Đã tạm dừng đơn ${order.id} chờ linh kiện`, 'info');
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Không thể chuyển trạng thái', 'error');
    }
  };

  // Tiếp tục sửa chữa từ chờ linh kiện
  const handleResumeRepair = async (order: RepairOrder) => {
    try {
      await repairService.transition(order.id, { transition: 'in_repair' });
      await invalidateOrders();
      toast(`Đã tiếp tục sửa chữa đơn ${order.id}`, 'success');
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Không thể tiếp tục sửa', 'error');
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
                {branchId === 'all' ? 'Toàn bộ chi nhánh' : branch}
              </span>
            </div>
            <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#1c302b] m-0">
              Không gian Kỹ thuật viên
            </h1>
            <p className="text-sm text-[#7e8d85] mt-1 mb-0">
              Xin chào {techName} · Tiếp nhận máy từ quầy CSKH {branchId === 'all' ? 'toàn chuỗi' : branch}, sửa chữa và hoàn tất bàn giao tức thì.
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
                  Chi nhánh trực: {branch.startsWith('FIXO') ? branch : `FIXO · ${branch}`}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 3 Thẻ KPI cá nhân phẳng (Task 4.1) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-[12px] border border-[#e5ece8] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#708078] uppercase tracking-wider">
                ĐÃ NHẬN HÔM NAY
              </span>
              <span className="w-8 h-8 rounded-[8px] bg-[#eaf4ef] text-[#176b58] grid place-items-center font-bold text-sm">
                ⚡
              </span>
            </div>
            <b className="font-heading text-3xl md:text-4xl text-[#1c302b] block mt-3">
              {String(acceptedTodayCount).padStart(2, '0')}
            </b>
            <small className="text-xs text-[#176b58] font-semibold mt-1">
              Tổng số máy đã nhận vào bàn kỹ thuật
            </small>
          </div>

          <div className="bg-white p-5 rounded-[12px] border border-[#e5ece8] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#708078] uppercase tracking-wider">
                ĐANG XỬ LÝ SỬA CHỮA
              </span>
              <span className="w-8 h-8 rounded-[8px] bg-[#faf3e7] text-[#b77a21] grid place-items-center font-bold text-sm">
                🔧
              </span>
            </div>
            <b className="font-heading text-3xl md:text-4xl text-[#1c302b] block mt-3">
              {String(myActiveOrders.length).padStart(2, '0')}
            </b>
            <small className="text-xs text-[#b77a21] font-semibold mt-1">
              Máy đang thao tác trên bàn sửa của bạn
            </small>
          </div>

          <div className="bg-white p-5 rounded-[12px] border border-[#e5ece8] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#708078] uppercase tracking-wider">
                ĐÃ HOÀN THÀNH HÔM NAY
              </span>
              <span className="w-8 h-8 rounded-[8px] bg-[#eaf5ef] text-[#28805e] grid place-items-center font-bold text-sm">
                ✓
              </span>
            </div>
            <b className="font-heading text-3xl md:text-4xl text-[#1c302b] block mt-3">
              {String(myCompletedTodayOrders.length).padStart(2, '0')}
            </b>
            <small className="text-xs text-[#28805e] font-semibold mt-1">
              Đã nghiệm thu & bàn giao quầy CSKH
            </small>
          </div>
        </div>

        {/* Khối HÀNG ĐỢI MÁY MỚI CẦN NHẬN (LIVE DISPATCH) (Task 4.2) */}
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

                    {/* Khung mô tả lỗi to rõ */}
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
                      onClick={() => {
                        setSelectedOrder(order);
                        setDetailModalOpen(true);
                      }}
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
            <EmptyState
              title="Hiện không có đơn mới chờ nhận"
              description="Tất cả thiết bị tiếp nhận đã được phân bổ cho kỹ thuật viên. Khi có đơn mới tại quầy, chuông báo sẽ tự động phát tín hiệu."
              icon="check"
            />
          )}
        </div>

        {/* Khối MÁY TÔI ĐANG SỬA (Task 4.3) */}
        <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-heading font-bold text-base text-[#1c302b] m-0">
                Máy tôi đang sửa
              </h2>
              <p className="text-xs text-[#809088] mt-0.5 mb-0">
                Các đơn máy bạn đang trực tiếp phụ trách. Sửa xong bấm [✓ Hoàn tất sửa chữa] để bàn giao tức thì cho CSKH.
              </p>
            </div>
            <span className="text-xs font-bold text-[#176b58] bg-[#eaf4ef] px-3 py-1 rounded-[10px]">
              {myActiveOrders.length} đơn
            </span>
          </div>

          {myActiveOrders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {myActiveOrders.map((order) => {
                const code = normalizeStatusCode(order.status);
                const isWaitingParts = code === 'waiting_parts';

                return (
                  <article
                    key={order.id}
                    className="bg-white border border-[#e5ece8] hover:border-[#b8d0c1] rounded-[12px] p-5 flex flex-col justify-between shadow-2xs transition-all"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-sm text-[#176b58]">
                          {order.id}
                        </span>
                        <StatusTag label={order.status} type={order.statusType} />
                      </div>

                      <div>
                        <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
                          {order.device}
                        </h3>
                        {order.serial && order.serial !== 'Chưa cập nhật' && (
                          <span className="text-xs text-[#83938b] block mt-0.5">
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
                    </div>

                    <div className="pt-4 mt-3 border-t border-[#f0f3f1] flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedOrder(order);
                          setDetailModalOpen(true);
                        }}
                        className="px-3 text-xs font-semibold"
                      >
                        Xem phiếu
                      </Button>

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

                      {isWaitingParts ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleResumeRepair(order)}
                          className="flex-1 font-bold text-xs"
                        >
                          Tiếp tục sửa →
                        </Button>
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
                            size="md"
                            icon="check"
                            disabled={isSubmitting}
                            onClick={() => openCompleteModal(order)}
                            className="flex-1 h-9 font-bold text-xs bg-[#176b58] hover:bg-[#125848] text-white shadow-xs cursor-pointer active:scale-[0.98] transition-transform"
                          >
                            ✓ Hoàn tất sửa chữa
                          </Button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Bạn chưa có đơn nào đang xử lý"
              description="Hãy nhận đơn mới từ Hàng đợi Live Dispatch bên trên để bắt đầu ca sửa chữa."
              icon="wrench"
            />
          )}
        </div>
      </div>

      {/* Completion Modal (Task 4.3: Hoàn tất sửa chữa & bàn giao CSKH) */}
      <Modal
        isOpen={completeModalOpen}
        onClose={() => setCompleteModalOpen(false)}
        eyebrow={`HOÀN TẤT SỬA CHỮA · ${selectedOrder?.id}`}
        title="Nghiệm thu kỹ thuật & Bàn giao CSKH"
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
              className="bg-[#176b58] hover:bg-[#125848] font-bold text-sm shadow-xs"
            >
              {isSubmitting ? 'Đang bàn giao...' : '✓ Xác nhận hoàn tất & Bàn giao CSKH'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCompleteRepair} className="space-y-4">
          <Textarea
            label="Nội dung đã kiểm tra & sửa chữa *"
            value={repairNote}
            onChange={(e) => setRepairNote(e.target.value)}
            placeholder="Mô tả cụ thể các thao tác kỹ thuật đã thực hiện: thay pin, thay màng loa, cân chỉnh cảm ứng..."
            required
          />

          <Input
            label="Hạng mục linh kiện đã dùng (nếu có)"
            value={partsUsed}
            onChange={(e) => setPartsUsed(e.target.value)}
            placeholder="Ví dụ: Pin AirPods Pro 2 chính hãng mã BAT-APP2-01, keo B7000..."
          />

          <Select
            label="Kết quả chạy thử nghiệm thu cuối"
            value={finalCheck}
            onChange={(e) => setFinalCheck(e.target.value)}
            options={[
              'Đã chạy thử, hoạt động hoàn hảo',
              'Đã thay pin, sạc đầy 100%, chất âm tốt',
              'Đã test chống ồn ANC & Xuyên âm ổn định',
              'Đã khắc phục lỗi, các chức năng phụ bình thường',
            ]}
          />

          <div className="p-3.5 bg-[#fafbfa] border border-[#edf1ee] rounded-[8px]">
            <Checkbox
              checked={consentCheck}
              onChange={(e) => setConsentCheck(e.target.checked)}
              label={
                <span className="text-xs text-[#3c4e45] leading-relaxed">
                  Tôi cam kết đã trực tiếp sửa chữa, kiểm tra và nghiệm thu chất lượng thiết bị đạt chuẩn, sẵn sàng để CSKH ngoài quầy liên hệ bàn giao cho khách.
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
            <div className="flex items-center justify-between w-full">
              <Button
                variant="outline"
                size="md"
                disabled={isSilentPrinting}
                onClick={() => handlePrintRoutingSlip(selectedOrder)}
                className="flex items-center gap-1.5 text-xs text-[#176b58] border-[#b8d0c5] hover:bg-[#f0f8f4]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                <span>{isSilentPrinting ? 'Đang in...' : 'In tem dán khay K80 🖨️'}</span>
              </Button>
              <Button variant="secondary" onClick={() => setDetailModalOpen(false)}>
                Đóng phiếu
              </Button>
            </div>
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
