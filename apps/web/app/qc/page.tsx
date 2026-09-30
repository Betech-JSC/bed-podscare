'use client';

import React, { useState } from 'react';
import { qcService, repairService } from '@podscare/api-client';
import {
  Button,
  StatusTag,
  Modal,
  Textarea,
  Checkbox,
  useToast,
  EmptyState,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';
import type { RepairOrder } from '@podscare/types';

export default function QCInspectionPage() {
  const { toast } = useToast();
  const { orders, invalidateOrders } = usePodsCare();

  const [selectedOrder, setSelectedOrder] = useState<RepairOrder | null>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // QC Checklist Items State: boolean map
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [reworkReason, setReworkReason] = useState('');
  const [qcNotes, setQcNotes] = useState('');

  // Orders waiting for QC inspection
  const qcOrders = orders.filter((o) => o.status === 'Chờ QC');
  const pastQcOrders = orders.filter((o) =>
    ['Sẵn sàng trả', 'Cần sửa lại', 'Hoàn tất'].includes(o.status)
  );

  const defaultQcCriteria = [
    'Chức năng âm thanh hai bên cân bằng, không rè âm',
    'Khả năng sạc đầy pin và nhận nguồn bình thường',
    'Kết nối Bluetooth ổn định trong cự ly 10m',
    'Chống ồn chủ động ANC & Xuyên âm hoạt động tốt',
    'Micro đàm thoại nghe rõ, lọc gió tốt',
    'Cảm ứng / gõ chạm phản hồi chính xác',
    'Vệ sinh sạch sẽ, không để lại vết keo hoặc bụi màng loa',
  ];

  const openInspectModal = (order: RepairOrder) => {
    setSelectedOrder(order);
    // Initialize all criteria as checked by default
    const initialMap: Record<string, boolean> = {};
    defaultQcCriteria.forEach((crit) => {
      initialMap[crit] = true;
    });
    setCheckedItems(initialMap);
    setReworkReason('');
    setQcNotes('');
    setInspectModalOpen(true);
  };

  const handleToggleCrit = (crit: string) => {
    setCheckedItems((prev) => ({
      ...prev,
      [crit]: !prev[crit],
    }));
  };

  const isAllPassed = defaultQcCriteria.every((crit) => checkedItems[crit]);

  const handlePassQC = async () => {
    if (!selectedOrder) return;
    setIsSubmitting(true);
    try {
      const criteriaData = defaultQcCriteria.map((c) => ({
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
      const criteriaData = defaultQcCriteria.map((c) => ({
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
                Được kỹ thuật viên báo hoàn tất, cần kiểm tra 7 tiêu chuẩn xuất xưởng.
              </p>
            </div>
            <span className="text-xs font-bold text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded-[10px]">
              {qcOrders.length} máy chờ duyệt
            </span>
          </div>

          {qcOrders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {qcOrders.map((order) => (
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
                      KTV: <b>{order.tech}</b> · {order.date}
                    </p>

                    <div className="bg-[#f7faf8] p-2.5 rounded border border-[#edf1ee] my-2 text-xs">
                      <span className="text-[#81908a] block">Lỗi ban đầu:</span>
                      <b className="text-[#33443c] block truncate">{order.issue}</b>
                      {order.repairNote && (
                        <>
                          <span className="text-[#81908a] block mt-1">Nội dung KTV đã sửa:</span>
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
          <div className="divide-y divide-[#f1f3f2]">
            {pastQcOrders.slice(0, 5).map((o) => (
              <div key={o.id} className="py-2.5 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-[#176b58]">{o.id}</span>
                  <b>{o.device}</b>
                  <span className="text-[#81908a]">KTV: {o.tech}</span>
                </div>
                <StatusTag label={o.status} type={o.statusType} />
              </div>
            ))}
          </div>
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
                  Linh kiện đã dùng: <b>{selectedOrder.partsUsed || 'Không'}</b>
                </span>
              </div>
              <p className="text-[#516058] m-0">
                <b>Ghi chú KTV:</b> {selectedOrder.repairNote || 'KTV chưa ghi chú chi tiết'}
              </p>
            </div>

            {/* Checklist */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-heading font-bold text-sm text-[#1c302b] m-0">
                  7 Tiêu chuẩn kiểm tra chức năng
                </h4>
                <span className="text-xs text-[#81908a]">
                  Bỏ chọn nếu phát hiện tiêu chí không đạt
                </span>
              </div>

              <div className="border border-[#e5ece8] rounded-[8px] overflow-hidden divide-y divide-[#f0f3f1] bg-white">
                {defaultQcCriteria.map((crit, idx) => {
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
            </div>

            {/* Rework reason textarea (shows when any criteria failed) */}
            {!isAllPassed && (
              <div className="p-3 bg-[#fdf5f4] rounded-[8px] border border-[#f5dcd8]">
                <Textarea
                  label="Lý do không đạt / Yêu cầu KTV xử lý lại *"
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
