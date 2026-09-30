'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { quoteService, repairService, type QuoteRecord } from '@podscare/api-client';
import {
  Button,
  StatusTag,
  Modal,
  CurrencyInput,
  Select,
  Textarea,
  useToast,
  TableSkeleton,
  EmptyState,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';
import type { RepairOrder } from '@podscare/types';

export default function QuotesPage() {
  const { toast } = useToast();
  const { orders, invalidateOrders } = usePodsCare();

  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<RepairOrder | null>(null);
  const [rejectOrder, setRejectOrder] = useState<RepairOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [quoteAmount, setQuoteAmount] = useState<number | ''>('');
  const [warranty, setWarranty] = useState('90 ngày');
  const [quoteNote, setQuoteNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch real quotes list from API
  const {
    data: quotes = [],
    isLoading: isQuotesLoading,
    refetch: refetchQuotes,
  } = useQuery({
    queryKey: ['quotes'],
    queryFn: async () => {
      const res = await quoteService.getQuotes();
      const raw = res?.data;
      return Array.isArray(raw)
        ? raw
        : (raw as any)?.data || (Array.isArray(res) ? res : []);
    },
  });

  // Orders that are waiting for quote approval or inspection
  const quoteCandidates = orders.filter((o) =>
    ['Chờ khách duyệt', 'Đang kiểm tra', 'Tiếp nhận mới'].includes(o.status)
  );

  const moneyFormatted = (n: number) =>
    n ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫' : '—';

  const findQuoteForOrder = (order: RepairOrder): QuoteRecord | undefined => {
    if (!quotes || !Array.isArray(quotes)) return undefined;
    return quotes.find(
      (q: QuoteRecord) =>
        String(q.repair_order_id) === String(order.id) ||
        q.repair_order?.order_code === order.id
    );
  };

  const openQuoteModal = (order: RepairOrder) => {
    setSelectedOrder(order);
    setQuoteAmount(order.price || '');
    setQuoteNote(order.priceNote || '');
    setQuoteModalOpen(true);
  };

  const openRejectModal = (order: RepairOrder) => {
    setRejectOrder(order);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleSaveQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    const amount = typeof quoteAmount === 'number' ? quoteAmount : 0;
    if (amount <= 0) {
      toast('Vui lòng nhập chi phí sửa chữa hợp lệ', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const warrantyDays =
        warranty === '30 ngày'
          ? 30
          : warranty === '90 ngày'
          ? 90
          : warranty === '180 ngày'
          ? 180
          : 0;

      await quoteService.createQuote({
        repair_order_id: selectedOrder.id,
        note: quoteNote.trim() || 'Báo giá sửa chữa thiết bị',
        warranty_terms_days: warrantyDays,
        items: [
          {
            description: quoteNote.trim() || 'Chi phí linh kiện & kỹ thuật',
            quantity: 1,
            unit_price: amount,
          },
        ],
      });

      await invalidateOrders();
      await refetchQuotes();
      toast(`Đã lưu báo giá cho đơn ${selectedOrder.id}`, 'success');
      setQuoteModalOpen(false);
      setSelectedOrder(null);
    } catch (err: any) {
      toast(
        err?.response?.data?.message || err?.message || 'Không thể tạo báo giá',
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomerApprove = async (order: RepairOrder) => {
    const q = findQuoteForOrder(order);
    setIsSubmitting(true);
    try {
      if (q?.id) {
        await quoteService.approve(q.id);
      } else {
        await repairService.transition(order.id, { transition: 'waiting_tech' });
      }
      await invalidateOrders();
      await refetchQuotes();
      toast(
        `Khách hàng đã đồng ý báo giá đơn ${order.id} · Sẵn sàng chuyển kỹ thuật`,
        'success'
      );
    } catch (err: any) {
      toast(
        err?.response?.data?.message || err?.message || 'Không thể phê duyệt báo giá',
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomerReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectOrder) return;
    if (!rejectReason.trim()) {
      toast('Vui lòng nhập lý do từ chối báo giá', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const q = findQuoteForOrder(rejectOrder);
      if (q?.id) {
        await quoteService.reject(q.id, rejectReason.trim());
      } else {
        await repairService.transition(rejectOrder.id, {
          transition: 'rejected',
          decline_reason: rejectReason.trim(),
        });
      }
      await invalidateOrders();
      await refetchQuotes();
      toast(`Đã ghi nhận khách hàng từ chối đơn ${rejectOrder.id}`, 'success');
      setRejectModalOpen(false);
      setRejectOrder(null);
    } catch (err: any) {
      toast(
        err?.response?.data?.message || err?.message || 'Không thể từ chối báo giá',
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell crumbName="Báo giá">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1">
              FINANCIAL & ESTIMATES
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Quản lý báo giá sửa chữa
            </h1>
            <p className="text-sm text-[#85928c] mt-1 mb-0">
              Các phiếu cần cập nhật chi phí hoặc đang chờ khách hàng xác nhận trước khi sửa.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon="refresh"
            onClick={() => {
              invalidateOrders();
              refetchQuotes();
            }}
          >
            Làm mới
          </Button>
        </div>

        <div className="bg-white rounded-[10px] border border-[#e5ece8] p-4 sm:p-5 shadow-xs">
          {isQuotesLoading && quoteCandidates.length === 0 ? (
            <TableSkeleton rows={4} cols={6} />
          ) : quoteCandidates.length === 0 ? (
            <EmptyState
              title="Không có đơn nào cần xử lý báo giá"
              description="Tất cả các phiếu tiếp nhận hiện đã có báo giá hoặc đã được bàn giao sang kỹ thuật."
            />
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#9aa59f] uppercase tracking-wider h-9">
                    <th className="px-3">Mã đơn</th>
                    <th className="px-3">Khách hàng</th>
                    <th className="px-3">Thiết bị & lỗi</th>
                    <th className="px-3">Chi phí hiện tại</th>
                    <th className="px-3">Trạng thái</th>
                    <th className="px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f2] text-sm">
                  {quoteCandidates.map((o) => (
                    <tr key={o.id} className="h-12 hover:bg-[#fafcfa]">
                      <td className="px-3 font-mono font-bold text-[#176b58]">{o.id}</td>
                      <td className="px-3">
                        <b className="text-sm">{o.name}</b>
                        <small className="block text-xs text-[#9aa59f]">{o.phone}</small>
                      </td>
                      <td className="px-3">
                        <span className="text-sm">{o.device}</span>
                        <small className="block text-xs text-[#9ba69f] truncate max-w-[200px]">
                          {o.issue}
                        </small>
                      </td>
                      <td className="px-3 font-semibold text-[#176b58]">{moneyFormatted(o.price)}</td>
                      <td className="px-3">
                        <StatusTag label={o.status} type={o.statusType} />
                      </td>
                      <td className="px-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="secondary" size="sm" onClick={() => openQuoteModal(o)}>
                            {o.price > 0 ? 'Sửa giá' : 'Tạo giá'}
                          </Button>
                          {o.status === 'Chờ khách duyệt' && (
                            <>
                              <Button
                                variant="primary"
                                size="sm"
                                icon="check"
                                disabled={isSubmitting}
                                onClick={() => handleCustomerApprove(o)}
                              >
                                Khách đồng ý
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                icon="x"
                                disabled={isSubmitting}
                                onClick={() => openRejectModal(o)}
                              >
                                Từ chối
                              </Button>
                            </>
                          )}
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

      {/* Quote Modal */}
      {selectedOrder && (
        <Modal
          isOpen={quoteModalOpen}
          onClose={() => setQuoteModalOpen(false)}
          eyebrow={`BÁO GIÁ · ${selectedOrder.id}`}
          title="Tạo / Cập nhật báo giá"
          subtitle={`${selectedOrder.device} · ${selectedOrder.name}`}
          footer={
            <div className="flex justify-end gap-2 w-full">
              <Button variant="secondary" onClick={() => setQuoteModalOpen(false)}>
                Hủy
              </Button>
              <Button
                variant="primary"
                disabled={isSubmitting}
                onClick={handleSaveQuote}
              >
                {isSubmitting ? 'Đang lưu...' : 'Lưu báo giá'}
              </Button>
            </div>
          }
        >
          <form onSubmit={handleSaveQuote} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <CurrencyInput
                label="Chi phí sửa chữa *"
                value={quoteAmount}
                onChangeValue={(val, formatted) => setQuoteAmount(formatted ? val : '')}
                placeholder="Ví dụ: 850.000"
                required
              />
              <Select
                label="Thời hạn bảo hành"
                value={warranty}
                onChange={(e) => setWarranty(e.target.value)}
                options={['30 ngày', '90 ngày', '180 ngày', 'Không áp dụng']}
              />
            </div>
            <Textarea
              label="Hạng mục sửa chữa / Ghi chú báo khách *"
              value={quoteNote}
              onChange={(e) => setQuoteNote(e.target.value)}
              placeholder="Chi tiết linh kiện, công thay, thời gian dự kiến..."
              required
            />
          </form>
        </Modal>
      )}

      {/* Reject Quote Modal */}
      {rejectOrder && (
        <Modal
          isOpen={rejectModalOpen}
          onClose={() => setRejectModalOpen(false)}
          eyebrow={`TỪ CHỐI BÁO GIÁ · ${rejectOrder.id}`}
          title="Khách hàng từ chối sửa chữa"
          subtitle={`${rejectOrder.device} · ${rejectOrder.name}`}
          footer={
            <div className="flex justify-end gap-2 w-full">
              <Button variant="secondary" onClick={() => setRejectModalOpen(false)}>
                Đóng
              </Button>
              <Button
                variant="danger"
                disabled={isSubmitting}
                onClick={handleCustomerReject}
              >
                {isSubmitting ? 'Đang xử lý...' : 'Xác nhận từ chối'}
              </Button>
            </div>
          }
        >
          <form onSubmit={handleCustomerReject} className="space-y-4">
            <p className="text-sm text-[#516058] m-0">
              Đơn hàng sẽ chuyển sang trạng thái <b>Từ chối sửa</b> và thông báo cho nhân viên trả lại thiết bị nguyên trạng cho khách hàng.
            </p>
            <Textarea
              label="Lý do khách từ chối *"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ví dụ: Giá quá cao, khách đổi ý không sửa nữa, thời gian chờ linh kiện lâu..."
              required
            />
          </form>
        </Modal>
      )}
    </AppShell>
  );
}
