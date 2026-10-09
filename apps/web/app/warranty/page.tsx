'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { warrantyService, type WarrantyItem } from '@podscare/api-client';
import { Button, StatusTag, FilterBar, EmptyState, Modal, useToast, Icon } from '@podscare/ui';
import { AppShell } from '../components/AppShell';

interface FormattedWarranty {
  id: number | string;
  code: string;
  orderCode: string;
  customerId?: number | string;
  customerName: string;
  phone: string;
  device: string;
  serial: string;
  periodDays: number;
  startsAt: string;
  expiresAt: string;
  status: string;
  statusType: 'ready' | 'gray' | 'danger' | 'wait';
  remainingDays: number;
  raw?: any;
}

export default function WarrantyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [warranties, setWarranties] = useState<FormattedWarranty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Lookup Modal state
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupQuery, setLookupQuery] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<any | null>(null);

  // Medical History Drawer state
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedWarranty, setSelectedWarranty] = useState<FormattedWarranty | null>(null);
  const [deviceHistoryData, setDeviceHistoryData] = useState<{
    customer?: { id: number; name: string; phone: string; email?: string } | null;
    total_repairs: number;
    orders: any[];
  } | null>(null);
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<any | null>(null);

  const calculateRemainingDays = (expiresAtStr?: string): number => {
    if (!expiresAtStr) return 0;
    try {
      const exp = new Date(expiresAtStr);
      exp.setHours(23, 59, 59, 999);
      const expTime = exp.getTime();
      const now = new Date().getTime();
      const diff = Math.ceil((expTime - now) / (1000 * 60 * 60 * 24));
      return diff > 0 ? diff : 0;
    } catch {
      return 0;
    }
  };

  const mapStatus = (
    rawStatus: string,
    remainingDays: number
  ): { label: string; type: 'ready' | 'gray' | 'danger' | 'wait' } => {
    if (rawStatus === 'voided') return { label: 'Đã hủy', type: 'danger' };
    if (rawStatus === 'expired' || remainingDays <= 0) return { label: 'Hết hạn', type: 'gray' };
    return { label: 'Còn hạn', type: 'ready' };
  };

  const loadWarranties = useCallback(async (queryStr?: string) => {
    setIsLoading(true);
    try {
      const params: any = { per_page: 50 };
      if (queryStr && queryStr.trim()) {
        params.q = queryStr.trim();
      }
      const res = await warrantyService.getWarranties(params);
      const raw = res?.data;
      const list: WarrantyItem[] = Array.isArray(raw) ? raw : (raw?.data || []);

      if (Array.isArray(list) && list.length > 0) {
        const mapped: FormattedWarranty[] = list.map((w: any) => {
          const startDateRaw = w.start_date ?? w.starts_at;
          const endDateRaw = w.end_date ?? w.expires_at;
          const periodDays = Number(w.duration_days ?? w.warranty_period_days) || 90;
          const remDays = calculateRemainingDays(endDateRaw);
          const st = mapStatus(w.status, remDays);
          return {
            id: w.id,
            code: w.warranty_code,
            orderCode: w.repair_order?.order_code || `PC26-${w.repair_order_id || ''}`,
            customerId: w.customer_id || w.customer?.id,
            customerName: w.customer?.name || w.repair_order?.customer?.name || 'Khách lẻ',
            phone: w.customer?.phone || w.repair_order?.customer?.phone || '',
            device: w.device_model?.name || w.repair_order?.device_model?.name || 'AirPods',
            serial: w.serial_number || w.repair_order?.serial_number || 'Chưa cập nhật',
            periodDays,
            startsAt: startDateRaw
              ? new Intl.DateTimeFormat('vi-VN').format(new Date(startDateRaw))
              : 'Hôm nay',
            expiresAt: endDateRaw
              ? new Intl.DateTimeFormat('vi-VN').format(new Date(endDateRaw))
              : '—',
            status: st.label,
            statusType: st.type,
            remainingDays: remDays,
            raw: w,
          };
        });
        setWarranties(mapped);
      } else {
        setWarranties([]);
      }
    } catch (err) {
      console.warn('Could not fetch warranties from API:', err);
      setWarranties([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadWarranties(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, loadWarranties]);

  const handleOpenMedicalHistory = async (w: FormattedWarranty) => {
    setSelectedWarranty(w);
    setHistoryDrawerOpen(true);
    setHistoryLoading(true);
    setDeviceHistoryData(null);
    setSelectedHistoryOrder(null);

    try {
      const res = await warrantyService.getDeviceHistory({
        phone: w.phone,
        serial_number: w.serial !== 'Chưa cập nhật' ? w.serial : undefined,
        customer_id: w.customerId,
        order_code: w.orderCode,
      });

      const payload = res?.data || res;
      setDeviceHistoryData(payload);

      if (payload?.orders && payload.orders.length > 0) {
        const matched = payload.orders.find((o: any) => o.order_code === w.orderCode);
        setSelectedHistoryOrder(matched || payload.orders[0]);
      }
    } catch (err) {
      console.warn('Could not fetch device medical history:', err);
      toast('Không thể tải lịch sử bệnh án thiết bị', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = lookupQuery.trim();
    if (!query) {
      toast('Vui lòng nhập mã bảo hành, serial hoặc số điện thoại', 'info');
      return;
    }

    setIsLookingUp(true);
    setLookupResult(null);

    try {
      const isPhone = /^[0-9+ ]{8,15}$/.test(query);
      const params = isPhone ? { phone: query } : { code: query };
      const res = await warrantyService.lookup(params);
      const data = res?.data;

      if (data) {
        const target = Array.isArray(data) ? data[0] : data;
        const endDateRaw = target.end_date ?? target.expires_at;
        const remDays = calculateRemainingDays(endDateRaw);
        const st = mapStatus(target.status, remDays);
        setLookupResult({
          ...target,
          status: st.label,
          remainingDays: remDays,
          periodDays: Number(target.duration_days ?? target.warranty_period_days) || 90,
          expires_at: endDateRaw
            ? new Intl.DateTimeFormat('vi-VN').format(new Date(endDateRaw))
            : (target.expires_at || '—'),
        });
        toast('Đã tìm thấy thông tin sổ bảo hành điện tử', 'success');
      } else {
        toast('Không tìm thấy sổ bảo hành khớp với thông tin', 'info');
      }
    } catch (err: any) {
      console.warn('Lookup failed:', err);
      const found = warranties.find(
        (w) =>
          w.code.toLowerCase() === query.toLowerCase() ||
          w.phone.replace(/\s+/g, '') === query.replace(/\s+/g, '') ||
          w.serial.toLowerCase() === query.toLowerCase()
      );
      if (found) {
        setLookupResult(found);
        toast('Đã tìm thấy kết quả từ danh mục', 'success');
      } else {
        toast(err?.data?.message || 'Không tìm thấy thông tin bảo hành', 'error');
      }
    } finally {
      setIsLookingUp(false);
    }
  };

  const filtered = warranties.filter((w) => {
    const q = search.toLowerCase();
    return (
      w.code.toLowerCase().includes(q) ||
      w.orderCode.toLowerCase().includes(q) ||
      w.customerName.toLowerCase().includes(q) ||
      w.phone.toLowerCase().includes(q) ||
      w.serial.toLowerCase().includes(q) ||
      w.device.toLowerCase().includes(q)
    );
  });

  return (
    <AppShell crumbName="Bảo hành">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1">
              E-WARRANTY & MEDICAL HISTORY OS
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Quản lý bảo hành & Hồ sơ bệnh án máy
            </h1>
            <p className="text-sm text-[#85928c] mt-1 mb-0">
              Tra cứu theo Số điện thoại khách hàng, Serial và đối chiếu lịch sử kỹ thuật trước đó.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="md"
              icon="clock"
              onClick={() => {
                loadWarranties(search);
                toast('Đã cập nhật danh sách bảo hành', 'info');
              }}
            >
              Làm mới
            </Button>
            <Button
              variant="primary"
              size="md"
              icon="search"
              onClick={() => setLookupOpen(true)}
            >
              Tra cứu sổ điện tử
            </Button>
          </div>
        </div>

        {/* Quick lookup banner */}
        <div className="bg-[#f0f7f3] border border-[#d2e8dc] rounded-[12px] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[10px] bg-[#176b58] text-white grid place-items-center flex-none">
              <Icon name="search" size={20} />
            </div>
            <div>
              <b className="text-sm text-[#176b58] block font-bold">
                Tra cứu bảo hành nhanh theo SĐT khách hàng & Serial
              </b>
              <small className="text-xs text-[#557564]">
                Nhập số điện thoại khách hàng, số Serial hoặc mã bảo hành để mở ngay hồ sơ bệnh án thiết bị.
              </small>
            </div>
          </div>
          <form onSubmit={handleLookup} className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="VD: 0903... hoặc Serial..."
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              className="text-xs px-3 py-2 rounded-[8px] border border-[#bad5c6] bg-white outline-none focus:border-[#176b58] focus:ring-1 focus:ring-[#176b58] flex-1 sm:w-[240px]"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isLookingUp}
            >
              {isLookingUp ? 'Đang tìm...' : 'Tra cứu'}
            </Button>
          </form>
        </div>

        {/* Warranties Table Card */}
        <div className="bg-white rounded-[12px] border border-[#e5ece8] p-4 sm:p-5 shadow-xs">
          <div className="mb-4">
            <FilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="🔍 Nhập Số điện thoại khách hàng, Số Serial hoặc Mã BH..."
            />
          </div>

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-[#176b58]/20 border-t-[#176b58] animate-spin" />
              <span className="text-xs font-medium text-[#7a8a81]">Đang tải dữ liệu sổ bảo hành...</span>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search ? 'Không tìm thấy sổ bảo hành' : 'Chưa có sổ bảo hành điện tử'}
              description={
                search
                  ? 'Không có sổ bảo hành điện tử nào khớp với số điện thoại hoặc serial tra cứu.'
                  : 'Hiện tại hệ thống chưa ghi nhận thông tin bảo hành nào cho linh kiện hoặc đơn sửa.'
              }
              icon="shield"
              actionLabel={search ? 'Xóa bộ lọc' : 'Làm mới'}
              onAction={() => {
                if (search) setSearch('');
                else loadWarranties();
              }}
            />
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#809088] uppercase tracking-wider h-10">
                    <th className="px-3">Mã sổ BH</th>
                    <th className="px-3">Mã đơn sửa</th>
                    <th className="px-3">Khách hàng</th>
                    <th className="px-3">Thiết bị & Serial</th>
                    <th className="px-3">Gói bảo hành</th>
                    <th className="px-3">Ngày hết hạn</th>
                    <th className="px-3">Trạng thái</th>
                    <th className="px-3 text-right">Bệnh án</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f2] text-sm">
                  {filtered.map((w) => (
                    <tr
                      key={w.id}
                      onClick={() => handleOpenMedicalHistory(w)}
                      className="h-13 hover:bg-[#fafcfa] cursor-pointer transition-colors"
                    >
                      <td className="px-3 font-mono font-bold text-[#176b58]">{w.code}</td>
                      <td className="px-3 font-mono font-medium text-[#2d3d35]">{w.orderCode}</td>
                      <td className="px-3">
                        <span className="font-semibold text-[#1c302b] block">{w.customerName}</span>
                        <small className="text-xs font-medium text-[#176b58] block">{w.phone}</small>
                      </td>
                      <td className="px-3">
                        <span className="font-medium text-[#2d3d35] block">{w.device}</span>
                        <small className="text-xs font-mono text-[#8a9690]">{w.serial}</small>
                      </td>
                      <td className="px-3">
                        <span className="font-semibold text-[#374941]">{w.periodDays} ngày</span>
                        <small className="block text-xs text-[#8a9690]">Từ {w.startsAt}</small>
                      </td>
                      <td className="px-3 text-xs">
                        <span className="font-semibold text-[#273931]">{w.expiresAt}</span>
                        {w.remainingDays > 0 && (
                          <small className="block text-xs text-[#176b58] font-bold">
                            (Còn {w.remainingDays} ngày)
                          </small>
                        )}
                      </td>
                      <td className="px-3">
                        <StatusTag label={w.status} type={w.statusType} />
                      </td>
                      <td className="px-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenMedicalHistory(w);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-bold bg-[#eaf4ef] text-[#176b58] hover:bg-[#d5ebdf] border border-[#c2ded0] transition-all cursor-pointer shadow-2xs"
                        >
                          <Icon name="search" size={13} />
                          <span>Xem bệnh án máy</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* DRAWER / MODAL: HỒ SƠ BỆNH ÁN & LỊCH SỬ SỬA CHỮA THIẾT BỊ */}
        <Modal
          isOpen={historyDrawerOpen}
          onClose={() => setHistoryDrawerOpen(false)}
          maxWidth="2xl"
          eyebrow="PODSCARE REPAIR OS · BỆNH ÁN THIẾT BỊ"
          title="Hồ sơ bệnh án & Lịch sử sửa chữa"
          subtitle="Chi tiết kỹ thuật lần sửa trước đó và toàn bộ lịch sử thiết bị theo SĐT khách hàng."
          headerExtra={
            selectedWarranty && (
              <div className="flex items-center gap-2">
                <StatusTag
                  label={selectedWarranty.status}
                  type={selectedWarranty.statusType}
                />
                {selectedWarranty.remainingDays > 0 && (
                  <span className="text-xs font-bold text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded-full border border-[#c4e0d2]">
                    Còn {selectedWarranty.remainingDays} ngày
                  </span>
                )}
              </div>
            )
          }
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3 w-full">
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon="payments"
                  onClick={() => {
                    toast('Đang chuẩn bị in lại phiếu bảo hành...');
                    window.print();
                  }}
                >
                  In lại phiếu bảo hành
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon="wrench"
                  onClick={() => {
                    setHistoryDrawerOpen(false);
                    router.push('/repairs');
                    toast('Chuyển sang hàng tiếp nhận bảo hành / sửa lại', 'info');
                  }}
                >
                  Tạo đơn bảo hành / Sửa lại
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHistoryDrawerOpen(false)}
              >
                Đóng
              </Button>
            </div>
          }
        >
          {historyLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <div className="w-9 h-9 rounded-full border-3 border-[#176b58]/20 border-t-[#176b58] animate-spin" />
              <span className="text-xs font-semibold text-[#5a6e64]">
                Đang truy xuất hồ sơ bệnh án thiết bị từ máy chủ...
              </span>
            </div>
          ) : !selectedWarranty ? (
            <div className="text-center py-8 text-sm text-[#7e8e86]">Không có dữ liệu</div>
          ) : (
            <div className="space-y-5">
              {/* Header Box: Thông tin khách hàng & thiết bị */}
              <div className="bg-[#f7faf8] border border-[#e1ece5] rounded-[10px] p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-[#7e8e86] block mb-0.5">Khách hàng:</span>
                    <strong className="text-sm text-[#1c302b] block">
                      {deviceHistoryData?.customer?.name || selectedWarranty.customerName}
                    </strong>
                    <span className="text-xs font-mono font-bold text-[#176b58]">
                      📞 {deviceHistoryData?.customer?.phone || selectedWarranty.phone}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#7e8e86] block mb-0.5">Thiết bị:</span>
                    <strong className="text-sm text-[#1c302b] block">
                      {selectedWarranty.device}
                    </strong>
                    <span className="text-xs font-mono text-[#54675e]">
                      Serial: {selectedWarranty.serial}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#7e8e86] block mb-0.5">Mã bảo hành:</span>
                    <strong className="text-xs font-mono font-bold text-[#176b58] block">
                      {selectedWarranty.code}
                    </strong>
                    <span className="text-[#7e8e86]">
                      Đơn gốc: <b className="font-mono text-[#2c3d35]">{selectedWarranty.orderCode}</b>
                    </span>
                  </div>

                  <div>
                    <span className="text-[#7e8e86] block mb-0.5">Thời hạn:</span>
                    <strong className="text-[#1c302b] block">
                      {selectedWarranty.periodDays} ngày
                    </strong>
                    <span className="text-[#54675e]">
                      Hết hạn: <b>{selectedWarranty.expiresAt}</b>
                    </span>
                  </div>
                </div>
              </div>

              {/* KHỐI 1: CHI TIẾT LẦN SỬA TRƯỚC ĐÓ */}
              <div className="bg-white rounded-[12px] border border-[#dce8e1] p-4.5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-[#edf3f0]">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-[7px] bg-[#eaf4ef] text-[#176b58] grid place-items-center">
                      <Icon name="device" size={15} />
                    </span>
                    <div>
                      <h4 className="font-heading font-bold text-sm text-[#1c302b] m-0">
                        Chi tiết lần sửa trước đó {selectedHistoryOrder ? `(${selectedHistoryOrder.order_code})` : ''}
                      </h4>
                      <p className="text-[11px] text-[#7d8f85] m-0">
                        Nội dung kỹ thuật viên đã can thiệp, linh kiện thay thế và kết quả nghiệm thu QC.
                      </p>
                    </div>
                  </div>
                  {selectedHistoryOrder && (
                    <span className="text-xs font-mono font-bold text-[#176b58] bg-[#f0f7f3] px-2.5 py-1 rounded-[6px] border border-[#cde5d7]">
                      {selectedHistoryOrder.total_price_formatted}
                    </span>
                  )}
                </div>

                {selectedHistoryOrder ? (
                  <div className="space-y-3.5 text-xs">
                    {/* Hàng 1: Lỗi khách báo & Ngoại quan tiếp nhận */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-3 bg-[#fbfdfc] border border-[#e8f0ec] rounded-[8px]">
                        <span className="font-bold text-[#45574f] block mb-1">
                          ⚠️ Lỗi khách báo lúc nhận:
                        </span>
                        <p className="text-[#1c302b] m-0 font-medium">
                          {selectedHistoryOrder.issue_description || 'Không ghi nhận'}
                        </p>
                      </div>

                      <div className="p-3 bg-[#fbfdfc] border border-[#e8f0ec] rounded-[8px]">
                        <span className="font-bold text-[#45574f] block mb-1">
                          🔍 Ngoại quan & tình trạng ban đầu:
                        </span>
                        <p className="text-[#1c302b] m-0 font-medium">
                          {selectedHistoryOrder.appearance_notes || 'Ngoại quan bình thường, không trầy xước nặng'}
                        </p>
                      </div>
                    </div>

                    {/* Hàng 2: KTV phụ trách & Nội dung kỹ thuật đã làm */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 bg-[#f5f9f7] border border-[#d6e8dd] rounded-[8px]">
                        <span className="font-bold text-[#176b58] block mb-1">
                          👨‍🔧 Kỹ thuật viên sửa:
                        </span>
                        <b className="text-sm text-[#1c302b] block">
                          {selectedHistoryOrder.technician_name}
                        </b>
                        <small className="text-[#64796f]">
                          Chi nhánh: {selectedHistoryOrder.branch_name || 'PodsCare Store'}
                        </small>
                      </div>

                      <div className="md:col-span-2 p-3 bg-[#fcfaf5] border border-[#ebd9bd] rounded-[8px]">
                        <span className="font-bold text-[#915e1b] block mb-1">
                          🛠️ Nội dung kỹ thuật đã kiểm tra & can thiệp:
                        </span>
                        <p className="text-[#2d3d35] m-0">
                          {selectedHistoryOrder.repair_note || 'Đã kiểm tra bo mạch, thay thế linh kiện và đo dòng sạc ổn định.'}
                        </p>
                      </div>
                    </div>

                    {/* Hàng 3: Linh kiện đã thay thế & Dịch vụ làm thêm */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-3 bg-white border border-[#e2ece6] rounded-[8px]">
                        <span className="font-bold text-[#2d3d35] block mb-1.5">
                          🔩 Linh kiện đã thay thế:
                        </span>
                        {selectedHistoryOrder.parts_used_summary ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#edf6f1] text-[#176b58] font-semibold text-xs border border-[#cbe5d6]">
                            <span>{selectedHistoryOrder.parts_used_summary}</span>
                          </div>
                        ) : (
                          <span className="text-[#7e8e86]">Không thay thế linh kiện phần cứng</span>
                        )}
                      </div>

                      <div className="p-3 bg-white border border-[#e2ece6] rounded-[8px]">
                        <span className="font-bold text-[#2d3d35] block mb-1.5">
                          ✨ Dịch vụ sửa thêm (nếu có):
                        </span>
                        {Array.isArray(selectedHistoryOrder.additional_services) && selectedHistoryOrder.additional_services.length > 0 ? (
                          <div className="space-y-1">
                            {selectedHistoryOrder.additional_services.map((srv: any, idx: number) => (
                              <div key={idx} className="flex justify-between items-center text-xs">
                                <span className="text-[#1c302b]">• {srv.name}</span>
                                <span className="font-semibold text-[#176b58]">
                                  {new Intl.NumberFormat('vi-VN').format(srv.price || 0)} ₫
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[#7e8e86]">Không phát sinh dịch vụ thêm</span>
                        )}
                      </div>
                    </div>

                    {/* Hàng 4: Kết quả kiểm định QC */}
                    <div className="p-3 bg-[#f8faf9] border border-[#e2ede7] rounded-[8px] flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full grid place-items-center text-xs font-bold ${
                          selectedHistoryOrder.qc_result?.passed !== false
                            ? 'bg-[#176b58] text-white'
                            : 'bg-[#b83b3b] text-white'
                        }`}>
                          ✓
                        </span>
                        <div>
                          <strong className="text-xs text-[#1c302b] block">
                            Kết quả kiểm định QC: {selectedHistoryOrder.qc_result?.passed !== false ? 'ĐẠT TIÊU CHUẨN (PASS)' : 'KHÔNG ĐẠT (REWORK)'}
                          </strong>
                          <span className="text-[11px] text-[#72847b]">
                            {selectedHistoryOrder.qc_result?.notes || 'Đã kiểm tra âm thanh 2 tai, micro đàm thoại, cảm biến tháo tai và sạc dock.'}
                          </span>
                        </div>
                      </div>
                      {selectedHistoryOrder.qc_result?.inspector && (
                        <span className="text-[11px] text-[#556960] bg-white px-2 py-1 rounded border border-[#d6e3dc]">
                          Kiểm định viên: <b>{selectedHistoryOrder.qc_result.inspector}</b>
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-[#7e8e86]">
                    Chưa có thông tin chi tiết kỹ thuật cho đơn này
                  </div>
                )}
              </div>

              {/* KHỐI 2: TẤT CẢ CÁC LẦN SỬA TRƯỚC ĐÂY CỦA KHÁCH / MÁY */}
              <div className="bg-white rounded-[12px] border border-[#e2ede7] p-4.5 shadow-2xs">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#edf3f0]">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-[6px] bg-[#fbf3e5] text-[#915e1b] grid place-items-center">
                      <Icon name="clock" size={13} />
                    </span>
                    <h4 className="font-heading font-bold text-sm text-[#1c302b] m-0">
                      Toàn bộ lịch sử các lần sửa chữa của khách / thiết bị này
                    </h4>
                  </div>
                  <span className="text-xs font-bold text-[#176b58] bg-[#eaf4ef] px-2.5 py-0.5 rounded-full">
                    {deviceHistoryData?.orders?.length || 0} lần tiếp nhận
                  </span>
                </div>

                {deviceHistoryData?.orders && deviceHistoryData.orders.length > 0 ? (
                  <div className="divide-y divide-[#f0f4f2]">
                    {deviceHistoryData.orders.map((ord: any) => {
                      const isSelected = selectedHistoryOrder?.id === ord.id;
                      const dateDisplay = ord.created_at
                        ? new Intl.DateTimeFormat('vi-VN').format(new Date(ord.created_at))
                        : '—';
                      return (
                        <div
                          key={ord.id}
                          onClick={() => setSelectedHistoryOrder(ord)}
                          className={`py-3 px-3 rounded-[8px] flex flex-wrap items-center justify-between gap-3 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#f0f7f3] border border-[#c2ded0]'
                              : 'hover:bg-[#fafcfa]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="font-mono text-xs font-bold text-[#176b58]">
                              {ord.order_code}
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-[#1c302b]">
                                {ord.issue_description || 'Sửa chữa AirPods'}
                              </div>
                              <div className="text-[11px] text-[#7b8c83] mt-0.5">
                                Tiếp nhận: {dateDisplay} · Thợ sửa: <b>{ord.technician_name}</b>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-[#176b58]">
                              {ord.total_price_formatted}
                            </span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              ord.status === 'completed'
                                ? 'bg-[#eaf4ef] text-[#176b58]'
                                : 'bg-[#fbf3e5] text-[#915e1b]'
                            }`}>
                              {ord.status === 'completed' ? 'Hoàn tất' : ord.status}
                            </span>
                            <span className="text-xs text-[#95a59c]">
                              {isSelected ? '✓ Đang xem' : 'Xem chi tiết ↗'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-[#7e8e86]">
                    Đây là lần sửa chữa đầu tiên được ghi nhận của khách hàng / máy này.
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>

        {/* Modal tra cứu công khai độc lập */}
        <Modal
          isOpen={lookupOpen}
          onClose={() => setLookupOpen(false)}
          maxWidth="md"
          eyebrow="E-WARRANTY LOOKUP"
          title="Tra cứu sổ bảo hành điện tử"
          subtitle="Nhập mã bảo hành, số điện thoại hoặc số serial để kiểm tra quyền lợi bảo hành."
          footer={
            <div className="flex justify-end gap-2.5 w-full">
              <Button variant="secondary" size="md" onClick={() => setLookupOpen(false)}>
                Đóng
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <form onSubmit={handleLookup} className="flex gap-2">
              <input
                type="text"
                placeholder="Nhập mã BH, SĐT hoặc Serial..."
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                className="text-sm px-3.5 py-2.5 rounded-[8px] border border-[#d2dcd6] bg-white outline-none focus:border-[#176b58] focus:ring-1 focus:ring-[#176b58] flex-1"
              />
              <Button type="submit" variant="primary" size="md" disabled={isLookingUp}>
                {isLookingUp ? 'Đang tìm...' : 'Tra cứu'}
              </Button>
            </form>

            {lookupResult && (
              <div className="p-4 bg-[#f8faf9] border border-[#e2ece6] rounded-[10px] space-y-3">
                <div className="flex justify-between items-center pb-2.5 border-b border-[#e5efe9]">
                  <div>
                    <span className="text-xs font-mono font-bold text-[#176b58]">
                      {lookupResult.warranty_code || lookupResult.code}
                    </span>
                    <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
                      {lookupResult.device_model?.name || lookupResult.device}
                    </h3>
                  </div>
                  <StatusTag
                    label={
                      lookupResult.status === 'voided' || lookupResult.status === 'Đã hủy'
                        ? 'Đã hủy'
                        : lookupResult.status === 'expired' || lookupResult.status === 'Hết hạn' || (lookupResult.remainingDays !== undefined && lookupResult.remainingDays <= 0)
                        ? 'Hết hạn'
                        : 'Còn hạn'
                    }
                    type={
                      lookupResult.status === 'voided' || lookupResult.status === 'Đã hủy'
                        ? 'danger'
                        : lookupResult.status === 'expired' || lookupResult.status === 'Hết hạn' || (lookupResult.remainingDays !== undefined && lookupResult.remainingDays <= 0)
                        ? 'gray'
                        : 'ready'
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[#86968f] block">Chủ sở hữu:</span>
                    <strong className="text-[#1c302b]">
                      {lookupResult.customer?.name || lookupResult.customerName}
                    </strong>
                    <div className="text-[#65766e]">{lookupResult.customer?.phone || lookupResult.phone}</div>
                  </div>
                  <div>
                    <span className="text-[#86968f] block">Mã đơn sửa chữa:</span>
                    <strong className="text-[#176b58] font-mono">
                      {lookupResult.repair_order?.order_code || lookupResult.orderCode}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#86968f] block">Thời hạn bảo hành:</span>
                    <strong className="text-[#1c302b]">
                      {lookupResult.duration_days ?? lookupResult.warranty_period_days ?? lookupResult.periodDays} ngày
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#86968f] block">Hạn bảo hành đến:</span>
                    <strong className="text-[#176b58]">
                      {lookupResult.expires_at || lookupResult.end_date || lookupResult.expiresAt}
                    </strong>
                  </div>
                </div>

                <div className="p-2.5 bg-white rounded border border-[#edf2ef] text-xs text-[#52635a]">
                  📌 <b>Chính sách bảo hành:</b> Bảo hành đổi mới linh kiện tương đương nếu phát sinh lỗi kỹ thuật do linh kiện (không bao gồm rơi vỡ, vô nước, can thiệp bên thứ 3).
                </div>
              </div>
            )}
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
