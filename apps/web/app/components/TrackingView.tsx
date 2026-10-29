'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button,
  StatusTag,
  Icon,
  StepperWidget,
  HardwarePartSelector,
  parseHardwarePartsFromText,
  resolveOrderStatus,
  getOrderStepIndex,
  formatVND,
  useToast,
} from '@podscare/ui';
import type { RepairOrder } from '@podscare/types';
import { repairService } from '@podscare/api-client';
import { generateQRCodeSVG } from './print/BarcodeQRUtils';

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
      const res = await repairService.trackOrder(cleanId, phone ? phone.trim() : undefined);
      const data = res?.data || res;
      const o = data?.order || data;

      if (o && (o.id || o.order_code)) {
        const mappedStatus = resolveOrderStatus(o.status, 'Đang xử lý');

        const mappedChecks = Array.isArray(o.intake_checklists)
          ? o.intake_checklists.map((c: any) => ({
              label: c.item_name || c.label || 'Hạng mục kiểm tra',
              status:
                c.status === 'pass' || c.status === 'passed' || c.status === 'good' || c.status === 'Hoạt động'
                  ? ('Hoạt động' as const)
                  : c.status === 'fail' || c.status === 'failed' || c.status === 'Lỗi'
                  ? ('Lỗi' as const)
                  : ('Không kiểm tra' as const),
            }))
          : Array.isArray(o.checks)
          ? o.checks
          : [];

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
          accessories: o.accessories || '',
          appearance: o.appearance_notes || o.appearance || '',
          checks: mappedChecks,
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

  const moneyFormatted = (n: number) => (n ? formatVND(n) : '—');

  const qrSvgMarkup = useMemo(() => {
    if (!searchedOrder?.id) return '';
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://fixo.vn';
    const trackUrl = `${origin}/track?id=${encodeURIComponent(searchedOrder.id)}`;
    return generateQRCodeSVG(trackUrl, { size: 64, margin: 1 });
  }, [searchedOrder?.id]);

  const selectedHardwareParts = useMemo(() => {
    return parseHardwarePartsFromText(searchedOrder?.accessories);
  }, [searchedOrder?.accessories]);

  return (
    <div className="min-h-screen bg-[#f6f8f6] text-[#17231f] flex flex-col items-center p-4 sm:p-8">
      <div className="max-w-[760px] w-full space-y-6">
        {/* Brand Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-[#e9eeeb]">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="FIXO Logo"
              className="w-9 h-9 rounded-[10px] object-contain shadow-sm flex-none"
            />
            <div>
              <b className="font-heading font-extrabold text-xl tracking-tight text-[#17231f]">
                FIXO Tra cứu
              </b>
              <small className="block text-xs tracking-[1.1px] text-[#81908a] font-bold">
                CUSTOMER TRACKING PORTAL
              </small>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
            Dành cho nhân viên →
          </Button>
        </div>

        {/* Hero & Search Card */}
        <div className="bg-white p-6 sm:p-8 rounded-[14px] border border-[#e9eeeb] shadow-soft">
          <div className="text-xs font-bold text-[#176b51] uppercase tracking-[1.05px] mb-1.5">
            CUSTOMER PORTAL
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-[#17231f] m-0">
            Theo dõi tiến độ sửa chữa thiết bị
          </h1>
          <p className="text-sm text-[#81908a] mt-2 mb-6 max-w-[540px] leading-relaxed">
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
              className="flex-1 h-11 px-4 border border-[#e9eeeb] rounded-[8px] text-sm outline-none focus:border-[#176b51] focus:ring-2 focus:ring-[#176b51]/10"
            />
            <input
              type="tel"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              placeholder="Số điện thoại người gửi máy"
              className="sm:w-[220px] h-11 px-4 border border-[#e9eeeb] rounded-[8px] text-sm outline-none focus:border-[#176b51] focus:ring-2 focus:ring-[#176b51]/10"
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
          <div className="bg-white rounded-[14px] border border-[#e9eeeb] shadow-soft overflow-hidden">
            {/* Order Head */}
            <div className="flex flex-wrap items-center justify-between p-5 sm:p-6 border-b border-[#e9eeeb] gap-3 bg-[#f6f8f6]">
              <div>
                <div className="text-xs font-bold text-[#81908a] uppercase tracking-[1px] mb-1">
                  MÃ PHIẾU · {searchedOrder.id}
                </div>
                <h2 className="font-heading font-bold text-lg sm:text-xl text-[#17231f] m-0">
                  {searchedOrder.device}
                </h2>
                <p className="text-sm text-[#81908a] mt-1 mb-0">
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
            <div className="p-5 sm:p-6 border-b border-[#e9eeeb]">
              <StepperWidget
                steps={[
                  { id: '1', label: 'Tiếp nhận' },
                  { id: '2', label: 'Kiểm tra & Báo giá' },
                  { id: '3', label: 'Đang sửa chữa' },
                  { id: '4', label: 'Kiểm định QC' },
                  { id: '5', label: 'Sẵn sàng giao' },
                ]}
                currentStepIndex={getOrderStepIndex(searchedOrder.status)}
              />
            </div>

            {/* Content Details */}
            <div className="p-5 sm:p-6 space-y-4">
              <div className="bg-[#e9f4ef] p-4 sm:p-5 rounded-[10px] border border-[#cce3d8]">
                <b className="block text-sm text-[#17231f] mb-1.5 font-bold">Cập nhật tiến độ gần nhất</b>
                <p className="text-sm text-[#17231f] leading-relaxed m-0">
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
                <div className="p-4 bg-white rounded-[8px] border border-[#e9eeeb]">
                  <span className="text-[#81908a] block mb-1 text-xs">Tình trạng lỗi tiếp nhận:</span>
                  <b className="text-[#17231f]">{searchedOrder.issue}</b>
                </div>
                <div className="p-4 bg-white rounded-[8px] border border-[#e9eeeb]">
                  <span className="text-[#81908a] block mb-1 text-xs">Chi phí sửa chữa xác nhận:</span>
                  <b className="text-[#176b51] font-heading text-base font-mono tabular-nums">
                    {moneyFormatted(searchedOrder.price)}
                  </b>
                </div>
              </div>

              {/* Linh kiện bàn giao (L / R / Case) */}
              <div className="p-4 bg-white rounded-[8px] border border-[#e9eeeb] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#81908a] uppercase tracking-wider">
                    Thành phần linh kiện tiếp nhận (L / R / Case)
                  </span>
                  {searchedOrder.accessories && (
                    <span className="text-xs text-[#17231f] font-medium">
                      {searchedOrder.accessories}
                    </span>
                  )}
                </div>
                <HardwarePartSelector
                  selectedParts={selectedHardwareParts}
                  readOnly
                />
              </div>

              {/* Bảng checklist tiếp nhận ban đầu */}
              {Array.isArray(searchedOrder.checks) && searchedOrder.checks.length > 0 && (
                <div className="p-4 bg-white rounded-[8px] border border-[#e9eeeb] space-y-2.5">
                  <span className="text-xs font-bold text-[#81908a] uppercase tracking-wider block">
                    Biên bản kiểm tra tình trạng tiếp nhận ({searchedOrder.checks.length} hạng mục)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {searchedOrder.checks.map((chk, idx) => (
                      <div
                        key={`${chk.label}-${idx}`}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-[6px] bg-[#f6f8f6] border border-[#e9eeeb] text-xs"
                      >
                        <span className="text-[#17231f] font-medium truncate">{chk.label}</span>
                        <span
                          className={`px-2 py-0.5 rounded font-bold whitespace-nowrap ${
                            chk.status === 'Hoạt động'
                              ? 'bg-[#e9f4ef] text-[#176b51]'
                              : chk.status === 'Lỗi'
                              ? 'bg-[#fbefed] text-[#bc5b52]'
                              : 'bg-[#eff2f0] text-[#5c6964]'
                          }`}
                        >
                          {chk.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* QR Code section */}
              <div className="flex flex-wrap items-center gap-4 p-4 border border-dashed border-[#d9e3dc] rounded-[10px] bg-[#fbfdfb]">
                <div
                  className="w-[72px] h-[72px] bg-white border border-[#e9eeeb] p-1 grid place-items-center flex-none rounded-[6px]"
                  dangerouslySetInnerHTML={{ __html: qrSvgMarkup }}
                />
                <div className="flex-1 min-w-[200px]">
                  <b className="text-sm text-[#17231f] block font-bold">Mã QR tra cứu nhanh</b>
                  <p className="text-xs text-[#81908a] mt-0.5 mb-0">
                    Quét mã QR bằng camera điện thoại hoặc lưu liên kết để tra cứu trực tiếp đơn {searchedOrder.id}.
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
            <h3 className="font-heading font-bold text-base text-[#17231f] m-0">
              Không tìm thấy phiếu sửa chữa
            </h3>
            <p className="text-sm text-[#81908a] max-w-[440px] mx-auto leading-relaxed">
              Không tìm thấy phiếu có mã{' '}
              <b>{searchId}</b>. Quý khách vui lòng kiểm tra lại mã số
              trên biên lai hoặc liên hệ hotline cửa hàng để được hỗ trợ.
            </p>
          </div>
        ) : null}

        {/* PII Protection & Store Warranty Liability Transparency Block */}
        <section
          aria-labelledby="tracking-pii-warranty-heading"
          className="bg-white border border-[#e5ece8] rounded-[12px] p-4 sm:p-5 space-y-4"
        >
          <div className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-[1px] text-[#176b51]">
              CAM KẾT MINH BẠCH DỮ LIỆU &amp; BẢO HÀNH
            </span>
            <h2
              id="tracking-pii-warranty-heading"
              className="font-heading font-bold text-sm sm:text-[15px] text-[#17231f] m-0"
            >
              Minh bạch Bảo mật Thông tin Cá nhân (PII) &amp; Phân định Trách nhiệm Bảo hành
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs leading-relaxed">
            <div className="p-3.5 rounded-[9px] bg-[#f6f8f6] border border-[#e5ece8] space-y-1">
              <strong className="font-heading font-bold text-[#17231f] block">
                Bảo vệ dữ liệu định danh cá nhân (PII Masking)
              </strong>
              <p className="text-[#516059] m-0">
                Để bảo vệ quyền riêng tư trên cổng tra cứu công khai, hệ thống tự động che mờ họ tên,
                số điện thoại và địa chỉ giao nhận (qua cơ chế bảo vệ PII{' '}
                <span className="font-mono text-[11px] text-[#176b51]">PiiHelper</span>) khi chưa xác
                thực đúng thông tin chủ đơn.
              </p>
            </div>

            <div className="p-3.5 rounded-[9px] bg-[#f6f8f6] border border-[#e5ece8] space-y-1">
              <strong className="font-heading font-bold text-[#17231f] block">
                Phân định trách nhiệm sửa chữa &amp; bảo hành thiết bị
              </strong>
              <p className="text-[#516059] m-0">
                Nghĩa vụ kỹ thuật sửa chữa, linh kiện thay thế và cam kết bảo hành thiết bị thực tế do{' '}
                <strong className="text-[#17231f]">cửa hàng tiếp nhận máy</strong> trực tiếp đảm nhiệm
                theo phiếu biên nhận. FIXO Repair OS là nền tảng phần mềm quản trị vận hành và tra cứu
                điện tử.
              </p>
            </div>
          </div>

          <footer className="pt-3.5 border-t border-[#e9eeeb] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 text-xs text-[#516059]">
            <nav
              aria-label="Liên kết chính sách cổng tra cứu"
              className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-semibold"
            >
              <Link
                href="/privacy"
                className="text-[#176b51] hover:text-[#10583f] hover:underline transition-colors"
              >
                Chính sách bảo mật
              </Link>
              <Link
                href="/terms"
                className="text-[#176b51] hover:text-[#10583f] hover:underline transition-colors"
              >
                Điều khoản sử dụng
              </Link>
              <Link
                href="/"
                className="hover:text-[#176b51] hover:underline transition-colors"
              >
                Trang chủ FIXO
              </Link>
            </nav>

            <div className="text-[#758780]">
              Đơn vị phát triển:{' '}
              <a
                href="https://betech-digital.com/"
                target="_blank"
                rel="noopener"
                className="font-semibold text-[#176b51] hover:text-[#10583f] hover:underline"
              >
                Betech Digital
              </a>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
};

