'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { repairService } from '@podscare/api-client';
import { Button } from '@podscare/ui';
import { usePodsCare } from '../../providers';
import type { RepairOrder } from '@podscare/types';
import {
  A4ReceiptTemplate,
  ThermalK80Receipt,
  type PrintFormat,
  getStoredPrintFormat,
  setStoredPrintFormat,
  useSilentPrint,
} from '../../components/print';

export default function PrintReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { orders } = usePodsCare();

  const [format, setFormatState] = useState<PrintFormat>(getStoredPrintFormat);
  const { printReceipt, isPrinting } = useSilentPrint();

  const handleSelectFormat = (newFormat: PrintFormat) => {
    setFormatState(newFormat);
    setStoredPrintFormat(newFormat);
  };

  const { data: order, isLoading, isError } = useQuery<RepairOrder | null>({
    queryKey: ['repair-print', id],
    queryFn: async () => {
      if (!id) return null;
      // Do not use existing from global state if missing checks or createdBy
      const existing = orders.find((o) => o.id === id);
      if (
        existing &&
        Array.isArray(existing.checks) &&
        existing.checks.length > 0 &&
        existing.createdBy
      ) {
        return existing;
      }

      // Otherwise fetch dynamically from API with dual-lookup (integer ID or order_code)
      const res = await repairService.getRepairById(id);
      const o = res?.data || res;
      if (!o) return null;

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
        label: o.status || 'Tiếp nhận mới',
        type: 'wait',
      };

      const mappedChecks = Array.isArray(o.intake_checklists)
        ? o.intake_checklists.map((c: any) => ({
            label: c.item_name,
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

      const mappedPhotos = Array.isArray(o.intake_photos)
        ? o.intake_photos.map((p: any) => ({
            name: p.photo_type || 'Ảnh thiết bị',
            url: p.photo_url || p.file_path || p.url,
          }))
        : Array.isArray(o.photos)
        ? o.photos.map((p: any) => ({
            name: p.name || p.photo_type || 'Ảnh thiết bị',
            url: p.photo_url || p.file_path || p.url,
          }))
        : [];

      const mapped: RepairOrder = {
        id: o.order_code || String(o.id),
        name: o.customer?.name || 'Khách hàng',
        phone: o.customer?.phone || '',
        deviceCategory: o.device_model?.category || 'AirPods',
        device: o.device_model?.name || 'Thiết bị Apple',
        serial: o.serial_number || 'Chưa cập nhật',
        issue: o.issue_description || 'Kiểm tra tổng quát',
        status: mappedStatus.label,
        statusType: mappedStatus.type,
        price: Number(o.total_price) || Number(o.estimated_price) || 0,
        priceNote: o.price_note,
        tech: o.technician?.name || 'Chưa phân công',
        date: o.created_at
          ? new Intl.DateTimeFormat('vi-VN').format(new Date(o.created_at))
          : 'Hôm nay',
        branch: o.branch?.name || 'Chi nhánh FIXO',
        appearance: o.appearance_notes || 'Không ghi chú',
        accessories: o.accessories || 'Không gửi kèm',
        checks: mappedChecks,
        photos: mappedPhotos,
        createdBy: o.created_by_user?.name || o.createdBy || 'FIXO',
      };
      return mapped;
    },
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f4f7f5] p-8 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#176b58] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-[#7e8d85]">Đang tải dữ liệu phiếu in...</p>
        </div>
      </div>
    );
  }

  if (!order || isError) {
    return (
      <div className="min-h-screen bg-[#f4f7f5] p-8 flex items-center justify-center">
        <div className="bg-white p-8 rounded-[12px] border border-[#e5ece8] text-center max-w-md w-full shadow-sm space-y-4">
          <h2 className="font-heading font-bold text-lg text-[#1c302b] m-0">
            Không tìm thấy phiếu sửa chữa
          </h2>
          <p className="text-sm text-[#7e8d85] m-0">
            Không tìm thấy thông tin cho mã đơn <b>{id}</b> trên hệ thống.
          </p>
          <Button variant="secondary" onClick={() => router.back()}>
            Quay lại
          </Button>
        </div>
      </div>
    );
  }

  const handlePrint = () => {
    printReceipt(order, format);
  };

  return (
    <div className="min-h-screen bg-[#f4f7f5] p-4 sm:p-8 print:p-0 print:bg-white print:min-h-0">
      {/* On-screen control bar (Hidden during print) */}
      <div className="max-w-[820px] mx-auto mb-6 flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-[10px] border border-[#e5ece8] shadow-sm print:hidden no-print">
        <Button variant="secondary" size="md" icon="arrow" onClick={() => router.back()}>
          Quay lại danh sách
        </Button>

        {/* Khổ in switcher */}
        <div className="flex items-center gap-1 bg-[#f0f4f1] p-1 rounded-[8px] border border-[#dce6e0]">
          <button
            type="button"
            onClick={() => handleSelectFormat('k80')}
            className={`px-3 py-1.5 rounded-[6px] text-xs font-bold transition-all ${
              format === 'k80'
                ? 'bg-white text-[#176b58] shadow-xs'
                : 'text-[#62746b] hover:text-[#1c302b]'
            }`}
          >
            🧾 In nhiệt K80
          </button>
          <button
            type="button"
            onClick={() => handleSelectFormat('a4')}
            className={`px-3 py-1.5 rounded-[6px] text-xs font-bold transition-all ${
              format === 'a4'
                ? 'bg-white text-[#176b58] shadow-xs'
                : 'text-[#62746b] hover:text-[#1c302b]'
            }`}
          >
            📄 In A4 (2 liên)
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="md"
            disabled={isPrinting}
            onClick={handlePrint}
            className="flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>{isPrinting ? 'Đang in...' : 'In phiếu (Ctrl+P / ⌘P)'}</span>
          </Button>
        </div>
      </div>

      {/* Printable Sheet View - Quy chuẩn khổ A4 2 liên: max-h-[132mm], đường cắt print:h-[10mm], ký hiệu ✂ */}
      <div id="printSheetWrapper" className="max-w-[820px] mx-auto print:max-w-none print:w-full">
        {format === 'k80' ? (
          <ThermalK80Receipt order={order} />
        ) : (
          <A4ReceiptTemplate order={order} />
        )}
      </div>
    </div>
  );
}
