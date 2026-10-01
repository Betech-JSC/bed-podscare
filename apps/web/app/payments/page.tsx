'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { paymentService, repairService, type PaymentItem } from '@podscare/api-client';
import { Button, StatusTag, FilterBar, EmptyState, Modal, useToast, StatCard, CurrencyInput } from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';

interface FormattedPayment {
  id: number | string;
  paymentCode: string;
  orderCode: string;
  customerName: string;
  amount: number;
  method: string;
  methodKey: 'cash' | 'bank_transfer' | 'card_pos' | 'wallet';
  status: string;
  statusType: 'ready' | 'wait' | 'danger' | 'gray';
  receivedBy: string;
  date: string;
  transactionRef?: string;
}

interface PendingOrderOption {
  id: number | string;
  order_code: string;
  customer_name: string;
  device_name: string;
  status: string;
  price: number;
}

const VIETQR_BANK_ID = process.env.NEXT_PUBLIC_VIETQR_BANK_ID || 'MB';
const VIETQR_ACCOUNT_NO = process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NO || '';
const VIETQR_ACCOUNT_NAME = process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NAME || '';
const VIETQR_TEMPLATE = process.env.NEXT_PUBLIC_VIETQR_TEMPLATE || 'compact2';
const isVietQrConfigured = Boolean(VIETQR_BANK_ID && VIETQR_ACCOUNT_NO);

export default function PaymentsPage() {
  const { toast } = useToast();
  const { invalidateOrders } = usePodsCare();
  const [payments, setPayments] = useState<FormattedPayment[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrderOption[]>([]);
  const [selectedPendingCode, setSelectedPendingCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // VietQR modal state
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrOrderCode, setQrOrderCode] = useState('PC26-00985');
  const [qrAmount, setQrAmount] = useState<number>(1200000);
  const [qrMethod, setQrMethod] = useState<'bank_transfer' | 'cash'>('bank_transfer');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const moneyFormatted = (n: number) =>
    n ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫' : '0 ₫';

  const mapMethodLabel = (methodKey: string): string => {
    switch (methodKey) {
      case 'bank_transfer':
        return 'VietQR Chuyển khoản';
      case 'cash':
        return 'Tiền mặt';
      case 'card_pos':
        return 'Thẻ POS';
      case 'wallet':
        return 'Ví điện tử';
      default:
        return 'Chuyển khoản';
    }
  };

  const loadPayments = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await paymentService.getPayments({ per_page: 50 });
      const raw = res?.data;
      const list: PaymentItem[] = Array.isArray(raw) ? raw : (raw?.data || []);

      if (Array.isArray(list) && list.length > 0) {
        const mapped: FormattedPayment[] = list.map((p: any) => {
          const dateStr = p.paid_at || p.created_at
            ? new Intl.DateTimeFormat('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              }).format(new Date(p.paid_at || p.created_at))
            : 'Hôm nay';

          return {
            id: p.id,
            paymentCode: p.payment_code || `PC26-PY-${p.id}`,
            orderCode: p.repair_order?.order_code || `PC26-${p.repair_order_id}`,
            customerName: p.repair_order?.customer?.name || 'Khách lẻ',
            amount: Number(p.amount) || 0,
            method: mapMethodLabel(p.payment_method),
            methodKey: p.payment_method,
            status: (p.status === 'completed' || p.status === 'paid') ? 'Hoàn tất' : 'Chờ xử lý',
            statusType: (p.status === 'completed' || p.status === 'paid') ? 'ready' : 'wait',
            receivedBy: p.received_by_user?.name || 'Hệ thống SePay',
            date: dateStr,
            transactionRef: p.transaction_ref || undefined,
          };
        });
        setPayments(mapped);
      } else {
        setPayments([]);
      }
    } catch (err) {
      console.warn('Could not fetch payments from API:', err);
      setPayments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadPendingOrders = useCallback(async () => {
    try {
      const res = await repairService.getRepairs({ per_page: 50 });
      const raw = res?.data;
      const list = Array.isArray(raw) ? raw : (raw?.data || (Array.isArray(res) ? res : []));
      if (Array.isArray(list) && list.length > 0) {
        const eligible = list.filter((o: any) =>
          ['ready_for_return', 'waiting_pickup', 'waiting_qc', 'in_repair', 'waiting_tech', 'waiting_approval', 'completed'].includes(o.status)
        );
        eligible.sort((a: any, b: any) => {
          const priority = (s: string) => (s === 'ready_for_return' || s === 'waiting_pickup' ? 0 : 1);
          return priority(a.status) - priority(b.status);
        });
        const mapped: PendingOrderOption[] = eligible.map((o: any) => ({
          id: o.id,
          order_code: o.order_code || `PC26-${o.id}`,
          customer_name: o.customer?.name || 'Khách lẻ',
          device_name: o.device_model?.name || 'Thiết bị',
          status: o.status,
          price: Number(o.total_price) || Number(o.estimated_price) || 0,
        }));
        setPendingOrders(mapped);
      }
    } catch (err) {
      console.warn('Could not fetch pending orders for payments:', err);
    }
  }, []);

  useEffect(() => {
    loadPayments();
    loadPendingOrders();
  }, [loadPayments, loadPendingOrders]);

  const handleSelectPendingOrder = (orderCode: string) => {
    setSelectedPendingCode(orderCode);
    if (!orderCode) return;
    const found = pendingOrders.find((o) => o.order_code === orderCode || String(o.id) === orderCode);
    if (found) {
      setQrOrderCode(found.order_code);
      if (found.price > 0) {
        setQrAmount(found.price);
      }
    }
  };

  const handleSimulatePayment = async () => {
    if (!qrOrderCode || qrAmount <= 0) {
      toast('Vui lòng chọn hoặc nhập mã đơn và số tiền hợp lệ', 'info');
      return;
    }

    setIsSubmitting(true);
    try {
      const orderRef = qrOrderCode.trim();
      const repairOrderId = /^\d+$/.test(orderRef) ? Number(orderRef) : orderRef;

      // 1. Ghi nhận phiếu thu tiền mặt thanh toán hoàn tất
      await paymentService.createPayment({
        repair_order_id: repairOrderId,
        amount: qrAmount,
        payment_method: 'cash',
        notes: `Thanh toán giả lập tại quầy cho đơn ${orderRef}`,
      });

      // 2. Chuyển đổi trạng thái đơn hàng sang completed trên State Machine
      try {
        await repairService.transition(repairOrderId, {
          transition: 'completed',
          repair_note: 'Hoàn tất bàn giao sau khi thanh toán giả lập tại quầy',
        });
      } catch (transErr: any) {
        console.warn('Could not transition order to completed automatically:', transErr);
      }

      toast(`⚡ Đã giả lập thanh toán thành công cho đơn ${orderRef}!`, 'success');
      setQrModalOpen(false);
      await loadPayments();
      await loadPendingOrders();
      if (invalidateOrders) {
        await invalidateOrders();
      }
    } catch (err: any) {
      console.error('Could not simulate payment:', err);
      const errMsg =
        err?.response?.data?.message ||
        err?.message ||
        'Không thể giả lập thanh toán. Vui lòng kiểm tra lại kết nối.';
      toast(`Lỗi giả lập thanh toán: ${errMsg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreatePayment = async () => {
    if (!qrOrderCode || qrAmount <= 0) {
      toast('Vui lòng nhập mã đơn và số tiền hợp lệ', 'info');
      return;
    }

    setIsSubmitting(true);
    try {
      // Task 3.1: Loại bỏ regex strip số, gửi trực tiếp order_code hoặc repair_order_id số
      const orderRef = qrOrderCode.trim();
      const repairOrderId = /^\d+$/.test(orderRef) ? Number(orderRef) : orderRef;
      await paymentService.createPayment({
        repair_order_id: repairOrderId,
        amount: qrAmount,
        payment_method: qrMethod,
        notes: `Thanh toán cho đơn ${orderRef}`,
      });

      toast('Tạo phiếu thu thành công', 'success');
      setQrModalOpen(false);
      loadPayments();
      loadPendingOrders();
    } catch (err: any) {
      console.error('Could not create payment on API:', err);
      const errMsg =
        err?.response?.data?.message ||
        err?.message ||
        'Không thể tạo phiếu thu trên hệ thống. Vui lòng kiểm tra lại kết nối.';
      toast(`Lỗi tạo phiếu thu: ${errMsg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
  const transferCount = payments.filter((p) => p.methodKey === 'bank_transfer').length;
  const cashCount = payments.filter((p) => p.methodKey === 'cash').length;

  const filtered = payments.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.paymentCode.toLowerCase().includes(q) ||
      p.orderCode.toLowerCase().includes(q) ||
      p.customerName.toLowerCase().includes(q) ||
      p.method.toLowerCase().includes(q)
    );
  });

  // Dynamic VietQR link generation from environment configuration
  const vietQrUrl = isVietQrConfigured
    ? `https://img.vietqr.io/image/${VIETQR_BANK_ID}-${VIETQR_ACCOUNT_NO}-${VIETQR_TEMPLATE}.png?amount=${qrAmount}&addInfo=${encodeURIComponent(
        qrOrderCode
      )}&accountName=${encodeURIComponent(VIETQR_ACCOUNT_NAME)}`
    : '';

  return (
    <AppShell crumbName="Thanh toán">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1">
              FINANCE & PAYMENTS
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Giao dịch & Thanh toán
            </h1>
            <p className="text-sm text-[#85928c] mt-1 mb-0">
              Lịch sử phiếu thu, chuyển khoản tự động VietQR SePay và đối soát sổ sách.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="md"
              icon="clock"
              onClick={() => {
                loadPayments();
                toast('Đã làm mới dữ liệu giao dịch', 'info');
              }}
            >
              Làm mới
            </Button>
            <Button
              variant="primary"
              size="md"
              icon="payments"
              onClick={() => setQrModalOpen(true)}
            >
              Tạo mã VietQR / Thu tiền
            </Button>
          </div>
        </div>

        {/* Financial StatCards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <StatCard
            label="Tổng thực thu"
            value={moneyFormatted(totalAmount)}
            icon="payments"
            foot="Toàn bộ giao dịch"
            periodLabel=""
            trend="neutral"
          />
          <StatCard
            label="Chuyển khoản VietQR"
            value={`${transferCount} giao dịch`}
            icon="check"
            foot="Tự động qua SePay"
            periodLabel=""
            trend="neutral"
          />
          <StatCard
            label="Tiền mặt tại quầy"
            value={`${cashCount} phiếu thu`}
            icon="money"
            foot="Đã xác nhận thu ngân"
            periodLabel=""
            trend="neutral"
          />
          <StatCard
            label="Tổng phiếu thu"
            value={String(payments.length).padStart(2, '0')}
            icon="quotes"
            foot="Cập nhật theo thời gian thực"
            periodLabel=""
            trend="neutral"
          />
        </div>

        {/* Payments Table Card */}
        <div className="bg-white rounded-[10px] border border-[#e5ece8] p-4 sm:p-5 shadow-xs">
          <div className="mb-4">
            <FilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Tìm theo mã phiếu thu, mã đơn sửa, tên khách hoặc phương thức..."
            />
          </div>

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-[#176b58]/20 border-t-[#176b58] animate-spin" />
              <span className="text-xs font-medium text-[#7a8a81]">Đang tải dữ liệu phiếu thu...</span>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search ? 'Không tìm thấy phiếu thu nào' : 'Chưa có phiếu thu nào'}
              description={
                search
                  ? 'Không có bản ghi thanh toán nào khớp với từ khóa tìm kiếm.'
                  : 'Hiện tại chưa có dữ liệu giao dịch hoặc phiếu thu nào được ghi nhận.'
              }
              icon="receipt"
              actionLabel={search ? 'Xóa bộ lọc' : 'Làm mới'}
              onAction={() => {
                if (search) setSearch('');
                else loadPayments();
              }}
            />
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#9aa59f] uppercase tracking-wider h-9">
                    <th className="px-3">Mã phiếu thu</th>
                    <th className="px-3">Mã đơn sửa</th>
                    <th className="px-3">Khách hàng</th>
                    <th className="px-3">Phương thức</th>
                    <th className="px-3">Số tiền</th>
                    <th className="px-3">Người thu</th>
                    <th className="px-3">Thời gian</th>
                    <th className="px-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f2] text-sm">
                  {filtered.map((p) => (
                    <tr key={p.id} className="h-12 hover:bg-[#fafcfa] transition-colors">
                      <td className="px-3 font-mono font-bold text-[#176b58]">{p.paymentCode}</td>
                      <td className="px-3 font-mono font-medium text-[#2d3d35]">{p.orderCode}</td>
                      <td className="px-3 font-medium text-[#1c302b]">{p.customerName}</td>
                      <td className="px-3 text-[#4d5e56]">
                        <span className="block font-medium">{p.method}</span>
                        {p.transactionRef && (
                          <small className="block text-xs font-mono text-[#8a9690]">
                            {p.transactionRef}
                          </small>
                        )}
                      </td>
                      <td className="px-3 font-bold text-[#1c302b]">{moneyFormatted(p.amount)}</td>
                      <td className="px-3 text-[#708078] text-xs">{p.receivedBy}</td>
                      <td className="px-3 text-[#8a9690] text-xs">{p.date}</td>
                      <td className="px-3">
                        <StatusTag label={p.status} type={p.statusType} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* VietQR Generator Modal */}
        <Modal
          isOpen={qrModalOpen}
          onClose={() => setQrModalOpen(false)}
          maxWidth="md"
          eyebrow="SEPAY · VIETQR GATEWAY"
          title="Tạo mã thanh toán VietQR động"
          subtitle="Sinh mã QR thanh toán chuẩn VietQR tự động khớp đơn và đối soát qua SePay."
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2.5 w-full">
              <Button
                variant="secondary"
                size="md"
                disabled={isSubmitting || !qrOrderCode}
                onClick={handleSimulatePayment}
                title="Giả lập thanh toán tiền mặt và hoàn tất đơn hàng"
              >
                ⚡ Giả lập thanh toán thành công
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" size="md" onClick={() => setQrModalOpen(false)}>
                  Đóng
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  disabled={isSubmitting}
                  onClick={handleCreatePayment}
                >
                  {isSubmitting ? 'Đang ghi nhận...' : 'Xác nhận thu tiền'}
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Bộ chọn đơn chờ thanh toán từ hệ thống */}
            <div>
              <label className="text-xs font-bold text-[#516158] block mb-1">
                Chọn đơn chờ thanh toán trong hệ thống
              </label>
              <select
                value={selectedPendingCode}
                onChange={(e) => handleSelectPendingOrder(e.target.value)}
                className="w-full text-xs font-medium px-3 py-2 rounded-[8px] border border-[#d2dcd6] bg-white outline-none focus:border-[#176b58] text-[#1c302b]"
              >
                <option value="">-- Chọn đơn chờ thanh toán / thu tiền --</option>
                {pendingOrders.map((o) => (
                  <option key={o.id} value={o.order_code}>
                    {o.order_code} · {o.customer_name} ({o.device_name}) - {moneyFormatted(o.price)} [{o.status}]
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[#516158] block mb-1">Mã đơn sửa chữa</label>
                <input
                  type="text"
                  value={qrOrderCode}
                  onChange={(e) => setQrOrderCode(e.target.value)}
                  className="w-full text-xs font-mono font-bold px-3 py-2 rounded-[8px] border border-[#d2dcd6] bg-white outline-none focus:border-[#176b58]"
                />
              </div>
              <div>
                <CurrencyInput
                  label="Số tiền thanh toán"
                  value={qrAmount}
                  onChangeValue={(val) => setQrAmount(val)}
                  placeholder="850.000"
                />
              </div>
            </div>

            <div className="flex gap-4 items-center">
              <label className="text-xs font-bold text-[#516158]">Hình thức:</label>
              <label className="flex items-center gap-1.5 text-xs text-[#2e3e36] cursor-pointer">
                <input
                  type="radio"
                  name="method"
                  checked={qrMethod === 'bank_transfer'}
                  onChange={() => setQrMethod('bank_transfer')}
                />
                VietQR (Chuyển khoản SePay)
              </label>
              <label className="flex items-center gap-1.5 text-xs text-[#2e3e36] cursor-pointer">
                <input
                  type="radio"
                  name="method"
                  checked={qrMethod === 'cash'}
                  onChange={() => setQrMethod('cash')}
                />
                Tiền mặt tại quầy
              </label>
            </div>

            {qrMethod === 'bank_transfer' && (
              !isVietQrConfigured ? (
                <div className="p-4 bg-[#fff8eb] border border-[#fde68a] rounded-[10px] text-xs text-[#92400e] space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-sm text-[#b45309]">
                    ⚠️ Chưa cấu hình thông tin ngân hàng VietQR
                  </div>
                  <p>
                    Vui lòng khai báo các biến môi trường <code>NEXT_PUBLIC_VIETQR_BANK_ID</code>,{' '}
                    <code>NEXT_PUBLIC_VIETQR_ACCOUNT_NO</code> và <code>NEXT_PUBLIC_VIETQR_ACCOUNT_NAME</code>{' '}
                    trong file cấu hình để tạo mã VietQR tự động.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-[#f8faf9] border border-[#e2ece6] rounded-[10px] flex flex-col sm:flex-row items-center gap-5">
                  <div className="bg-white p-2 rounded-lg border border-[#dae5df] shadow-xs flex-none">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={vietQrUrl}
                      alt="Mã QR thanh toán VietQR"
                      className="w-[160px] h-[160px] object-contain rounded"
                    />
                  </div>
                  <div className="space-y-1.5 text-xs text-[#3a4b43] min-w-0">
                    <div className="text-xs font-bold text-[#176b58] uppercase">
                      Quét mã QR bằng App Ngân hàng
                    </div>
                    <div>
                      Ngân hàng: <b>{VIETQR_BANK_ID}</b>
                    </div>
                    <div>
                      Số tài khoản: <b className="font-mono text-sm text-[#1c302b]">{VIETQR_ACCOUNT_NO}</b>
                    </div>
                    <div>
                      Chủ tài khoản: <b>{VIETQR_ACCOUNT_NAME || 'FIXO VIETNAM'}</b>
                    </div>
                    <div>
                      Số tiền: <b className="text-sm text-[#176b58]">{moneyFormatted(qrAmount)}</b>
                    </div>
                    <div>
                      Nội dung CK: <b className="font-mono bg-[#eaf4ef] text-[#176b58] px-1.5 py-0.5 rounded">{qrOrderCode}</b>
                    </div>
                    <div className="text-xs text-[#7e8d85] pt-1">
                      ⚡ SePay Webhook tự động nhận diện và cập nhật phiếu thu trong 3-5 giây.
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
