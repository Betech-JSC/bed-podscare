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

  const renderSingleReceipt = (copyTitle: string) => {
    const mid = Math.ceil((order.checks?.length || 0) / 2);
    const leftCol = order.checks ? order.checks.slice(0, mid) : [];
    const rightCol = order.checks ? order.checks.slice(mid) : [];

    return (
    <article className="print-receipt bg-white text-[#111111] p-4 sm:p-6 border border-[#e5ece8] rounded-[8px] mb-4 sm:mb-6 shadow-sm print:shadow-none print:border-none print:rounded-none print:p-2 print:m-0 max-h-[132mm] overflow-hidden box-border">
      {/* Header */}
      <header className="flex justify-between items-center border-b-[2px] border-[#176b51] pb-2 sm:pb-3 mb-2 sm:mb-3 print:pb-1 print:mb-1">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt="FixQ Logo"
            className="w-10 h-10 print:w-8 print:h-8 rounded-[6px] object-cover flex-none"
          />
          <div>
            <b className="text-[18pt] sm:text-[20pt] print:text-[13pt] font-extrabold text-[#176b58] tracking-tight block leading-none font-heading">
              FixQ · PodsCare
            </b>
            <small className="text-[7.5pt] sm:text-[8pt] print:text-[6.5pt] tracking-[1px] text-[#555555] block mt-0.5 font-bold">
              PHIẾU TIẾP NHẬN SỬA CHỮA THIẾT BỊ
            </small>
          </div>
        </div>
        <strong className="text-[8pt] sm:text-[9pt] print:text-[7pt] border border-[#777777] px-2 py-0.5 rounded-[4px] uppercase font-bold text-[#1c302b]">
          {copyTitle}
        </strong>
      </header>

      {/* Order bar */}
      <div className="flex items-center gap-2 sm:gap-3 bg-[#f2f5f2] p-1.5 sm:p-2 rounded-[6px] mb-2 print:mb-1 text-[8pt] sm:text-[9pt] print:text-[7pt]">
        <span>MÃ PHIẾU:</span>
        <b className="text-[11pt] sm:text-[12pt] print:text-[9pt] text-[#176b58] font-bold font-mono">{order.id}</b>
        <span className="ml-auto text-[7.5pt] sm:text-[8pt] print:text-[6.5pt] text-[#555555]">
          Ngày nhận: <b>{order.date}</b> · Chi nhánh: <b>{order.branch}</b>
        </span>
      </div>

      {/* 2 Columns: Customer & Device */}
      <div className="grid grid-cols-2 gap-3 text-[8pt] print:text-[7pt] mb-2 print:mb-1 pb-1.5 border-b border-[#eeeeee]">
        <div>
          <h3 className="font-bold text-[8.5pt] print:text-[7pt] text-[#176b58] uppercase mb-0.5">
            Thông tin khách hàng
          </h3>
          <p className="my-0.5 leading-tight">
            <b>Họ tên:</b> {order.name}
          </p>
          <p className="my-0.5 leading-tight">
            <b>Số điện thoại:</b> {order.phone}
          </p>
        </div>
        <div>
          <h3 className="font-bold text-[8.5pt] print:text-[7pt] text-[#176b58] uppercase mb-0.5">Thiết bị tiếp nhận</h3>
          <p className="my-0.5 leading-tight">
            <b>Dòng máy:</b> {order.device}
          </p>
          <p className="my-0.5 leading-tight">
            <b>Serial / Model:</b> {order.serial || 'Chưa cập nhật'}
          </p>
          <p className="my-0.5 leading-tight">
            <b>Phụ kiện đi kèm:</b> {order.accessories || 'Không gửi kèm'}
          </p>
        </div>
      </div>

      {/* Issue */}
      <div className="mb-2 print:mb-1 text-[8pt] print:text-[7pt]">
        <h3 className="font-bold text-[8.5pt] print:text-[7pt] text-[#176b58] uppercase mb-0.5">Lỗi khách báo</h3>
        <p className="bg-[#f9fbf9] p-1.5 rounded border border-[#edf1ee] my-0.5 leading-tight">{order.issue}</p>
      </div>

      {/* Test checklist at counter */}
      {order.checks && order.checks.length > 0 && (
        <div className="mb-2 print:mb-1 text-[7.5pt] print:text-[6.5pt]">
          <h3 className="font-bold text-[8pt] print:text-[7pt] text-[#176b58] uppercase mb-0.5">
            Kết quả kiểm tra tính năng tại quầy
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <table className="w-full border-collapse border border-[#dddddd] text-left">
              <tbody>
                {leftCol.map((c, i) => (
                  <tr key={i} className="border-b border-[#dddddd] last:border-b-0">
                    <td className="p-0.5 px-1.5 border-r border-[#dddddd] text-[#333333]">{c.label}</td>
                    <td className="p-0.5 px-1.5 font-bold w-[35%]">
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
            {rightCol.length > 0 ? (
              <table className="w-full border-collapse border border-[#dddddd] text-left">
                <tbody>
                  {rightCol.map((c, i) => (
                    <tr key={i} className="border-b border-[#dddddd] last:border-b-0">
                      <td className="p-0.5 px-1.5 border-r border-[#dddddd] text-[#333333]">{c.label}</td>
                      <td className="p-0.5 px-1.5 font-bold w-[35%]">
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
            ) : (
              <div />
            )}
          </div>
          {order.testNote && (
            <p className="text-[7pt] print:text-[6.5pt] text-[#555555] mt-0.5">
              <b>Ghi chú test:</b> {order.testNote}
            </p>
          )}
        </div>
      )}

      {/* Appearance & Photos */}
      <div className="mb-2 print:mb-1 text-[7.5pt] print:text-[6.5pt]">
        <h3 className="font-bold text-[8pt] print:text-[7pt] text-[#176b58] uppercase mb-0.5">
          Tình trạng ngoại hình
        </h3>
        <p className="my-0.5 leading-tight">{order.appearance || 'Không ghi chú vết xước'}</p>
        {order.photos && order.photos.length > 0 && (
          <div className="flex gap-1.5 mt-1 overflow-hidden">
            {order.photos.slice(0, 3).map((p, idx) => (
              <img
                key={idx}
                src={p.url}
                alt="Ảnh ngoại hình"
                className="w-12 h-10 object-cover border border-[#cccccc] rounded max-h-[38px]"
              />
            ))}
          </div>
        )}
      </div>

      {/* Price */}
      <div className="flex justify-between items-center border border-[#aaaaaa] p-1.5 rounded mb-1.5 print:mb-1 text-[8pt] print:text-[7pt] bg-[#fbfdfb]">
        <span>
          Giá sửa chữa dự kiến{' '}
          {order.priceNote ? <small className="text-[#666666]">({order.priceNote})</small> : ''}
        </span>
        <b className="text-[11pt] print:text-[9.5pt] text-[#176b58] font-bold">{moneyFormatted(order.price)}</b>
      </div>

      {/* Terms */}
      <p className="text-[6.5pt] print:text-[5.5pt] text-[#666666] leading-tight my-1">
        * Chi phí trên là dự kiến tại thời điểm tiếp nhận. PodsCare sẽ chủ động liên hệ khách hàng để
        xác nhận trước khi can thiệp nếu có phát sinh linh kiện hoặc chi phí khác. Quý khách vui lòng
        giữ phiếu này để đối chiếu khi nhận lại máy.
      </p>

      {/* Signatures */}
      <div className="grid grid-cols-2 text-center mt-2 pt-1 border-t border-[#eeeeee] min-h-[38px] print:min-h-[32px] text-[7.5pt] print:text-[6.5pt]">
        <div>
          <b>KHÁCH HÀNG</b>
          <small className="block text-[6.5pt] print:text-[5.5pt] text-[#666666] mt-0.5">(Ký và ghi rõ họ tên)</small>
          <span className="block mt-4 print:mt-3 font-semibold">{order.name}</span>
        </div>
        <div>
          <b>NHÂN VIÊN TIẾP NHẬN</b>
          <small className="block text-[6.5pt] print:text-[5.5pt] text-[#666666] mt-0.5">(Ký và ghi rõ họ tên)</small>
          <span className="block mt-4 print:mt-3 font-semibold">{order.createdBy || 'PodsCare'}</span>
        </div>
      </div>

      <footer className="mt-2 pt-1 border-t border-[#dddddd] text-center text-[6.5pt] print:text-[5.5pt] text-[#777777]">
        PodsCare Repair OS · Phiếu được lập thành 02 liên có giá trị ghi nhận như nhau · {order.id}
      </footer>
    </article>
  );
  };

  return (
    <div className="min-h-screen bg-[#f4f7f5] p-4 sm:p-8 print:p-0 print:bg-white print:min-h-0">
      {/* On-screen control bar (Hidden during print) */}
      <div className="max-w-[820px] mx-auto mb-6 flex items-center justify-between bg-white p-3.5 rounded-[10px] border border-[#e5ece8] shadow-sm print:hidden no-print">
        <Button variant="secondary" size="md" icon="arrow" onClick={() => router.back()}>
          Quay lại danh sách
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#758780]">Phiếu tiếp nhận sửa chữa điện tử</span>
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
      <div id="printSheetWrapper" className="max-w-[820px] mx-auto print:max-w-none print:w-full">
        {renderSingleReceipt('LIÊN 1 · CỬA HÀNG GIỮ')}
        {/* Đường cắt giữa 2 liên 10mm */}
        <div className="my-6 border-b border-dashed border-[#888888] print:my-0 print:h-[10mm] print:border-b-0 print:flex print:items-center print:justify-center">
          <span className="hidden print:inline-block text-[7pt] text-[#888888] tracking-widest font-mono select-none">
            ✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂
          </span>
        </div>
        {renderSingleReceipt('LIÊN 2 · KHÁCH HÀNG GIỮ')}
      </div>
    </div>
  );
}

