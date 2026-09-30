'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { repairService } from '@podscare/api-client';
import { Button } from '@podscare/ui';
import { usePodsCare } from '../../providers';
import type { RepairOrder } from '@podscare/types';

export default function PrintReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { orders } = usePodsCare();

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
            url: p.file_path || p.url,
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
        branch: o.branch?.name || 'Chi nhánh PodsCare',
        appearance: o.appearance_notes || 'Không ghi chú',
        accessories: o.accessories || 'Không gửi kèm',
        checks: mappedChecks,
        photos: mappedPhotos,
        createdBy: o.created_by_user?.name || o.createdBy || 'PodsCare',
      };
      return mapped;
    },
    enabled: Boolean(id),
  });

  const moneyFormatted = (n: number) =>
    n ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫' : '—';

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

  const renderSingleReceipt = (copyTitle: string) => (
    <article className="print-receipt bg-white text-[#111111] p-6 border border-[#e5ece8] rounded-[8px] mb-6 shadow-sm">
      {/* Header */}
      <header className="flex justify-between items-center border-b-[2px] border-[#176b51] pb-3 mb-3">
        <div>
          <b className="text-[20pt] font-extrabold text-[#176b58] tracking-tight block leading-none font-heading">
            PodsCare
          </b>
          <small className="text-[8pt] tracking-[1px] text-[#555555] block mt-1 font-bold">
            PHIẾU TIẾP NHẬN SỬA CHỮA THIẾT BỊ
          </small>
        </div>
        <strong className="text-[9pt] border border-[#777777] px-2.5 py-1 rounded-[4px] uppercase font-bold text-[#1c302b]">
          {copyTitle}
        </strong>
      </header>

      {/* Order bar */}
      <div className="flex items-center gap-3 bg-[#f2f5f2] p-2.5 rounded-[6px] mb-3 text-[9pt]">
        <span>MÃ PHIẾU:</span>
        <b className="text-[12pt] text-[#176b58] font-bold font-mono">{order.id}</b>
        <span className="ml-auto text-[8pt] text-[#555555]">
          Ngày nhận: <b>{order.date}</b> · Chi nhánh: <b>{order.branch}</b>
        </span>
      </div>

      {/* 2 Columns: Customer & Device */}
      <div className="grid grid-cols-2 gap-4 text-[8.5pt] mb-3 pb-3 border-b border-[#eeeeee]">
        <div>
          <h3 className="font-bold text-[9pt] text-[#176b58] uppercase mb-1">
            Thông tin khách hàng
          </h3>
          <p className="my-0.5">
            <b>Họ tên:</b> {order.name}
          </p>
          <p className="my-0.5">
            <b>Số điện thoại:</b> {order.phone}
          </p>
        </div>
        <div>
          <h3 className="font-bold text-[9pt] text-[#176b58] uppercase mb-1">Thiết bị tiếp nhận</h3>
          <p className="my-0.5">
            <b>Dòng máy:</b> {order.device}
          </p>
          <p className="my-0.5">
            <b>Serial / Model:</b> {order.serial || 'Chưa cập nhật'}
          </p>
          <p className="my-0.5">
            <b>Phụ kiện đi kèm:</b> {order.accessories || 'Không gửi kèm'}
          </p>
        </div>
      </div>

      {/* Issue */}
      <div className="mb-3 text-[8.5pt]">
        <h3 className="font-bold text-[9pt] text-[#176b58] uppercase mb-1">Lỗi khách báo</h3>
        <p className="bg-[#f9fbf9] p-2 rounded border border-[#edf1ee] my-0.5">{order.issue}</p>
      </div>

      {/* Test checklist at counter */}
      {order.checks && order.checks.length > 0 && (
        <div className="mb-3 text-[8pt]">
          <h3 className="font-bold text-[9pt] text-[#176b58] uppercase mb-1">
            Kết quả kiểm tra tính năng tại quầy
          </h3>
          <table className="w-full border-collapse border border-[#dddddd] text-left">
            <tbody>
              {order.checks.map((c, i) => (
                <tr key={i} className="border-b border-[#dddddd] last:border-b-0">
                  <td className="p-1 px-2 border-r border-[#dddddd] text-[#333333]">{c.label}</td>
                  <td className="p-1 px-2 font-bold w-[35%]">
                    <span
                      className={
                        c.status === 'Hoạt động'
                          ? 'text-[#287452]'
                          : c.status === 'Lỗi'
                          ? 'text-[#b85c51]'
                          : 'text-[#777777]'
                      }
                    >
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {order.testNote && (
            <p className="text-[7.5pt] text-[#555555] mt-1">
              <b>Ghi chú test:</b> {order.testNote}
            </p>
          )}
        </div>
      )}

      {/* Appearance & Photos */}
      <div className="mb-3 text-[8pt]">
        <h3 className="font-bold text-[9pt] text-[#176b58] uppercase mb-1">
          Tình trạng ngoại hình
        </h3>
        <p className="my-0.5">{order.appearance || 'Không ghi chú vết xước'}</p>
        {order.photos && order.photos.length > 0 && (
          <div className="flex gap-2 mt-1.5 overflow-hidden">
            {order.photos.map((p, idx) => (
              <img
                key={idx}
                src={p.url}
                alt="Ảnh ngoại hình"
                className="w-16 h-14 object-cover border border-[#cccccc] rounded"
              />
            ))}
          </div>
        )}
      </div>

      {/* Price */}
      <div className="flex justify-between items-center border border-[#aaaaaa] p-2.5 rounded mb-2 text-[9pt] bg-[#fbfdfb]">
        <span>
          Giá sửa chữa dự kiến{' '}
          {order.priceNote ? <small className="text-[#666666]">({order.priceNote})</small> : ''}
        </span>
        <b className="text-[13pt] text-[#176b58] font-bold">{moneyFormatted(order.price)}</b>
      </div>

      {/* Terms */}
      <p className="text-[7pt] text-[#666666] leading-tight my-2">
        * Chi phí trên là dự kiến tại thời điểm tiếp nhận. PodsCare sẽ chủ động liên hệ khách hàng để
        xác nhận trước khi can thiệp nếu có phát sinh linh kiện hoặc chi phí khác. Quý khách vui lòng
        giữ phiếu này để đối chiếu khi nhận lại máy.
      </p>

      {/* Signatures */}
      <div className="grid grid-cols-2 text-center mt-4 pt-2 border-t border-[#eeeeee] min-h-[60px] text-[8pt]">
        <div>
          <b>KHÁCH HÀNG</b>
          <small className="block text-[7pt] text-[#666666] mt-0.5">(Ký và ghi rõ họ tên)</small>
          <span className="block mt-7 font-semibold">{order.name}</span>
        </div>
        <div>
          <b>NHÂN VIÊN TIẾP NHẬN</b>
          <small className="block text-[7pt] text-[#666666] mt-0.5">(Ký và ghi rõ họ tên)</small>
          <span className="block mt-7 font-semibold">{order.createdBy || 'PodsCare'}</span>
        </div>
      </div>

      <footer className="mt-4 pt-1.5 border-t border-[#dddddd] text-center text-[7pt] text-[#777777]">
        PodsCare Repair OS · Phiếu được lập thành 02 liên có giá trị ghi nhận như nhau · {order.id}
      </footer>
    </article>
  );

  return (
    <div className="min-h-screen bg-[#f4f7f5] p-4 sm:p-8">
      {/* On-screen control bar (Hidden during print) */}
      <div className="max-w-[820px] mx-auto mb-6 flex items-center justify-between bg-white p-3.5 rounded-[10px] border border-[#e5ece8] shadow-sm print:hidden">
        <Button variant="secondary" size="md" icon="arrow" onClick={() => router.back()}>
          Quay lại danh sách
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#758780]">Định dạng chuẩn 2 liên A4</span>
          <Button
            variant="primary"
            size="md"
            icon="download"
            onClick={() => window.print()}
          >
            In phiếu (Ctrl+P / ⌘P)
          </Button>
        </div>
      </div>

      {/* Printable Sheet */}
      <div id="printSheetWrapper" className="max-w-[820px] mx-auto">
        {renderSingleReceipt('LIÊN 1 · CỬA HÀNG GIỮ')}
        <div className="my-6 border-b border-dashed border-[#888888] print:hidden" />
        {renderSingleReceipt('LIÊN 2 · KHÁCH HÀNG GIỮ')}
      </div>
    </div>
  );
}
