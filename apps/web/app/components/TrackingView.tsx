'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button, StatusTag, Icon, StepperWidget, useToast } from '@podscare/ui';
import type { RepairOrder } from '@podscare/types';
import { repairService } from '@podscare/api-client';

export const TrackingView: React.FC<{ initialId?: string }> = ({ initialId = '' }) => {
  const router = useRouter();
  const { toast } = useToast();
  const [searchId, setSearchId] = useState(initialId);
  const [searchPhone, setSearchPhone] = useState('');
  const [hasSearched, setHasSearched] = useState(Boolean(initialId));
  const [searchedOrder, setSearchedOrder] = useState<RepairOrder | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const executeSearch = useCallback(async (code: string, phone?: string) => {
    const cleanId = code.trim().toUpperCase();
    if (!cleanId) return;

    setIsLoading(true);
    setHasSearched(true);
    setSearchedOrder(null);

    try {
      let o: any = null;
      try {
        const res = await repairService.trackOrder(cleanId, phone ? phone.trim() : undefined);
        const data = res?.data || res;
        o = data?.order || data;
      } catch {
        // Fallback to getRepairById if trackOrder fails
        try {
          const res = await repairService.getRepairById(cleanId);
          o = res?.data || res;
        } catch {
          o = null;
        }
      }

      if (o && (o.id || o.order_code)) {
        const statusMap: Record<string, { label: string; type: any }> = {
          inspecting: { label: 'Đang kiểm tra', type: 'progress' },
          waiting_approval: { label: 'Chờ khách duyệt', type: 'wait' },
          waiting_tech: { label: 'Chờ kỹ thuật', type: 'new' },
          assigned: { label: 'Đã nhận đơn', type: 'wait' },
          in_repair: { label: 'Đang sửa', type: 'progress' },
          waiting_parts: { label: 'Chờ linh kiện', type: 'wait' },
          rework_needed: { label: 'Cần sửa lại', type: 'danger' },
          waiting_qc: { label: 'Chờ QC', type: 'ready' },
          ready_for_return: { label: 'Sẵn sàng trả', type: 'ready' },
          waiting_pickup: { label: 'Chờ khách nhận', type: 'ready' },
          completed: { label: 'Hoàn tất', type: 'gray' },
          rejected: { label: 'Từ chối sửa', type: 'danger' },
          cancelled: { label: 'Đã hủy', type: 'gray' },
        };

        const mappedStatus = statusMap[o.status] || {
          label: o.status || 'Đang xử lý',
          type: 'wait',
        };

        const mappedOrder: RepairOrder = {
          id: o.order_code || cleanId,
          name: o.customer?.name || 'Khách hàng',
          phone: o.customer?.phone || phone || '',
          deviceCategory: o.device_model?.category || 'AirPods',
          device: o.device_model?.name || 'Thiết bị',
          serial: o.serial_number || 'Chưa cập nhật',
          issue: o.issue_description || 'Kiểm tra tổng quát',
          status: mappedStatus.label,
          statusType: mappedStatus.type,
          price:
            Number(o.total_price) ||
            Number(o.estimated_price) ||
            (o.quotes?.[0]?.total_amount ? Number(o.quotes[0].total_amount) : 0),
          tech: o.technician?.name || 'Kỹ thuật viên chi nhánh',
          date: o.created_at
            ? new Intl.DateTimeFormat('vi-VN').format(new Date(o.created_at))
            : 'Hôm nay',
          branch: o.branch?.name || 'Chi nhánh FIXO',
        };
        setSearchedOrder(mappedOrder);
      } else {
        setSearchedOrder(null);
      }
    } catch {
      setSearchedOrder(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialId) {
      executeSearch(initialId);
    }
  }, [initialId, executeSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(searchId, searchPhone);
  };

  const moneyFormatted = (n: number) =>
    n ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫' : '—';

  const getStepIndex = (status: string) => {
    switch (status) {
      case 'Tiếp nhận mới':
        return 0;
      case 'Chờ kỹ thuật':
      case 'Đang kiểm tra':
      case 'Chờ khách duyệt':
        return 1;
      case 'Đã nhận đơn':
      case 'Đang sửa':
      case 'Chờ linh kiện':
        return 2;
      case 'Chờ QC':
        return 3;
      case 'Sẵn sàng trả':
      case 'Hoàn tất':
      default:
        return 4;
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-[#1c302b] flex flex-col items-center p-4 sm:p-8">
      <div className="max-w-[760px] w-full space-y-6">
        {/* Brand Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-[#e5ece8]">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="FIXO Logo"
              className="w-9 h-9 rounded-[10px] object-contain shadow-sm flex-none"
            />
            <div>
              <b className="font-heading font-extrabold text-xl tracking-tight text-[#1c302b]">
                FIXO Tra cứu
              </b>
              <small className="block text-xs tracking-[1.1px] text-[#7f8f87] font-bold">
                CUSTOMER TRACKING PORTAL
              </small>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
            Dành cho nhân viên ↗
          </Button>
        </div>

        {/* Hero & Search Card */}
        <div className="bg-white p-6 sm:p-8 rounded-[14px] border border-[#e5ece8] shadow-soft">
          <div className="text-xs font-bold text-[#176b58] uppercase tracking-[1.05px] mb-1.5">
            CUSTOMER PORTAL
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-[#1c302b] m-0">
            Theo dõi tiến độ sửa chữa thiết bị
          </h1>
          <p className="text-sm text-[#7e8d85] mt-2 mb-6 max-w-[540px] leading-relaxed">
            Nhập mã phiếu sửa chữa và số điện thoại trên biên nhận để xem cập nhật thời gian thực từ
            kỹ thuật viên.
          </p>

          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="Mã phiếu (ví dụ: PC26-00981)"
              required
              className="flex-1 h-11 px-4 border border-[#e1e9e4] rounded-[8px] text-sm outline-none focus:border-[#75a994] focus:ring-2 focus:ring-[#176b58]/10"
            />
            <input
              type="tel"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              placeholder="Số điện thoại người gửi máy"
              className="sm:w-[220px] h-11 px-4 border border-[#e1e9e4] rounded-[8px] text-sm outline-none focus:border-[#75a994] focus:ring-2 focus:ring-[#176b58]/10"
            />
            <Button
              variant="primary"
              size="lg"
              disabled={isLoading}
              className="h-11 px-6 font-bold text-sm"
            >
              {isLoading ? 'Đang tra cứu...' : 'Tra cứu tiến độ'}
            </Button>
          </form>
        </div>

        {/* Result Card or Not Found */}
        {hasSearched && searchedOrder ? (
          <div className="bg-white rounded-[14px] border border-[#e5ece8] shadow-soft overflow-hidden">
            {/* Order Head */}
            <div className="flex flex-wrap items-center justify-between p-5 sm:p-6 border-b border-[#e5ece8] gap-3 bg-[#fafbfa]">
              <div>
                <div className="text-xs font-bold text-[#819089] uppercase tracking-[1px] mb-1">
                  MÃ PHIẾU · {searchedOrder.id}
                </div>
                <h2 className="font-heading font-bold text-lg sm:text-xl text-[#1c302b] m-0">
                  {searchedOrder.device}
                </h2>
                <p className="text-sm text-[#7e8d85] mt-1 mb-0">
                  {searchedOrder.name} · Ngày tiếp nhận: {searchedOrder.date} · Chi nhánh{' '}
                  {searchedOrder.branch}
                </p>
              </div>
              <StatusTag
                label={searchedOrder.status}
                type={searchedOrder.statusType}
                className="text-xs px-3 py-1.5"
              />
            </div>

            {/* Stepper */}
            <div className="p-5 sm:p-6 border-b border-[#f0f3f1]">
              <StepperWidget
                steps={[
                  { id: '1', label: 'Tiếp nhận' },
                  { id: '2', label: 'Kiểm tra & Báo giá' },
                  { id: '3', label: 'Đang sửa chữa' },
                  { id: '4', label: 'Kiểm định QC' },
                  { id: '5', label: 'Sẵn sàng giao' },
                ]}
                currentStepIndex={getStepIndex(searchedOrder.status)}
              />
            </div>

            {/* Content Details */}
            <div className="p-5 sm:p-6 space-y-4">
              <div className="bg-[#f7faf8] p-4 sm:p-5 rounded-[10px] border border-[#e4ede7]">
                <b className="block text-sm text-[#1c302b] mb-1.5 font-bold">Cập nhật tiến độ gần nhất</b>
                <p className="text-sm text-[#46574f] leading-relaxed m-0">
                  {searchedOrder.status === 'Đang sửa'
                    ? `Kỹ thuật viên đang xử lý tình trạng: "${searchedOrder.issue}". Dự kiến hoàn thành trong ngày.`
                    : searchedOrder.status === 'Chờ QC'
                    ? 'Kỹ thuật viên đã hoàn tất sửa chữa và đã chuyển sang bộ phận QC để kiểm tra 9 tiêu chí chức năng.'
                    : searchedOrder.status === 'Sẵn sàng trả'
                    ? 'Thiết bị đã kiểm định QC đạt chuẩn 100%. Quý khách có thể đến chi nhánh nhận lại máy.'
                    : `Trạng thái hiện tại: ${searchedOrder.status}. Chi phí dự kiến: ${moneyFormatted(
                        searchedOrder.price
                      )}.`}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm">
                <div className="p-4 bg-white rounded-[8px] border border-[#e5ece8]">
                  <span className="text-[#84948c] block mb-1 text-xs">Tình trạng lỗi tiếp nhận:</span>
                  <b className="text-[#1c302b]">{searchedOrder.issue}</b>
                </div>
                <div className="p-4 bg-white rounded-[8px] border border-[#e5ece8]">
                  <span className="text-[#84948c] block mb-1 text-xs">Chi phí sửa chữa xác nhận:</span>
                  <b className="text-[#176b58] font-heading text-base">
                    {moneyFormatted(searchedOrder.price)}
                  </b>
                </div>
              </div>

              {/* QR Code section */}
              <div className="flex flex-wrap items-center gap-4 p-4 border border-dashed border-[#d9e3dc] rounded-[10px] bg-[#fbfdfb]">
                <div className="w-[60px] h-[60px] bg-white border border-[#e3e8e4] p-1 grid place-items-center flex-none">
                  <Icon name="qr" size={44} className="text-[#1c302b]" />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <b className="text-sm text-[#1c302b] block font-bold">Mã QR tra cứu nhanh</b>
                  <p className="text-xs text-[#7e8d85] mt-0.5 mb-0">
                    Lưu mã này để tiện tra cứu trên điện thoại mà không cần nhập lại mã đơn.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="download"
                  onClick={() => {
                    if (typeof window !== 'undefined' && navigator.clipboard) {
                      const shareUrl = `${window.location.origin}/track?id=${encodeURIComponent(searchedOrder.id)}`;
                      navigator.clipboard.writeText(shareUrl).catch(() => {});
                    }
                    toast(`Đã sao chép link tra cứu đơn ${searchedOrder.id}`, 'success');
                  }}
                >
                  Sao chép liên kết
                </Button>
              </div>
            </div>
          </div>
        ) : hasSearched ? (
          <div className="bg-white p-8 rounded-[14px] border border-[#fbefed] text-center space-y-3.5">
            <div className="w-12 h-12 rounded-full bg-[#fbefed] text-[#bc5b52] grid place-items-center mx-auto">
              <Icon name="alert" size={24} />
            </div>
            <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
              Không tìm thấy đơn sửa chữa phù hợp
            </h3>
            <p className="text-sm text-[#7e8d85] max-w-[440px] mx-auto leading-relaxed">
              Không tìm thấy phiếu có mã <b>{searchId}</b>. Quý khách vui lòng kiểm tra lại mã số
              trên biên lai hoặc liên hệ hotline cửa hàng để được hỗ trợ.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
};
