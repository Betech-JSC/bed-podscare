'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button } from '@podscare/ui';
import { shiftService } from '@podscare/api-client';
import type { ShiftReconciliationSummary } from '@podscare/types';

export interface ShiftReceiptPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  shiftId: number | string | null;
}

export const ShiftReceiptPrintModal: React.FC<ShiftReceiptPrintModalProps> = ({
  isOpen,
  onClose,
  shiftId,
}) => {
  const [format, setFormat] = useState<'k80' | 'a4'>('k80');
  const [data, setData] = useState<ShiftReconciliationSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && shiftId) {
      setIsLoading(true);
      setErrorMsg(null);
      shiftService
        .getShiftPrintData(shiftId)
        .then((res) => {
          if (res.success && res.data) {
            setData(res.data);
          } else {
            setErrorMsg(res.message || 'Không thể tải dữ liệu biên bản ca.');
          }
        })
        .catch((err) => {
          setErrorMsg(err?.message || 'Có lỗi xảy ra khi tải dữ liệu in ấn.');
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setData(null);
    }
  }, [isOpen, shiftId]);

  const moneyFormatted = (n?: number | null) => {
    if (n === undefined || n === null) return '0 ₫';
    return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫';
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  if (!isOpen) return null;

  const shift = data?.shift;
  const branch = data?.branch;
  const tenant = data?.tenant;
  const cashier = data?.cashier;
  const closedBy = data?.closed_by;
  const totals = data?.totals;
  const dates = data?.formatted_dates;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="BIÊN BẢN CHỐT CA"
      title="In phiếu chốt ca & bàn giao"
      subtitle={`Mã ca: ${shift?.shift_code || '---'}`}
      maxWidth={format === 'a4' ? 'xl' : 'md'}
      footer={
        <div className="flex items-center justify-between w-full no-print">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#81908a]">Khổ in:</span>
            <div className="inline-flex rounded-lg border border-[#e9eeeb] p-0.5 bg-[#f6f8f6]">
              <button
                type="button"
                onClick={() => setFormat('k80')}
                className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all ${
                  format === 'k80'
                    ? 'bg-white text-[#176b51] shadow-xs'
                    : 'text-[#81908a] hover:text-[#17231f]'
                }`}
              >
                Nhiệt K80 (80mm)
              </button>
              <button
                type="button"
                onClick={() => setFormat('a4')}
                className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all ${
                  format === 'a4'
                    ? 'bg-white text-[#176b51] shadow-xs'
                    : 'text-[#81908a] hover:text-[#17231f]'
                }`}
              >
                Văn bản A4
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Đóng
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handlePrint}
              disabled={isLoading || !data}
              className="!bg-[#176b51] hover:!bg-[#10583f] text-white"
            >
              In phiếu ({format.toUpperCase()})
            </Button>
          </div>
        </div>
      }
    >
      <div className="min-h-[300px]">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-[#81908a]">
            <div className="w-8 h-8 rounded-full border-2 border-[#176b51] border-t-transparent animate-spin mb-3" />
            <span className="text-xs font-medium">Đang tải dữ liệu biên bản...</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 bg-[#fbefed] border border-[#f5c7c2] rounded-[8px] text-[#bc5b52] text-xs leading-relaxed">
            {errorMsg}
          </div>
        )}

        {!isLoading && data && (
          <div className="shift-print-container">
            {format === 'k80' ? (
              /* ================= KHỔ IN NHIỆT K80 (80mm) ================= */
              <div className="w-full max-w-[80mm] mx-auto bg-white p-3 border border-[#e5ece8] rounded shadow-xs text-[#17231f] text-[11px] font-mono leading-tight">
                {/* Header */}
                <div className="text-center pb-2 border-b border-dashed border-[#b8c5bf]">
                  <div className="font-bold text-xs uppercase tracking-tight font-sans">
                    {tenant?.name || 'PODSCARE REPAIR OS'}
                  </div>
                  <div className="text-[10px] text-[#556961] mt-0.5">
                    {branch?.name} · {branch?.phone || '1900.6868'}
                  </div>
                  {branch?.address && (
                    <div className="text-[9px] text-[#71847c] mt-0.5 leading-snug">
                      {branch.address}
                    </div>
                  )}
                  <div className="font-bold text-[12px] uppercase mt-2 pt-1 border-t border-dotted border-[#cbd6d0] font-sans">
                    BIÊN BẢN CHỐT CA
                  </div>
                  <div className="text-[10px] font-bold text-[#176b51] mt-0.5">
                    {shift?.shift_code}
                  </div>
                </div>

                {/* Thông tin ca */}
                <div className="py-2 border-b border-dashed border-[#b8c5bf] space-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-[#687b73]">Giờ mở:</span>
                    <span>{dates?.opened_at || '---'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#687b73]">Giờ chốt:</span>
                    <span>{dates?.closed_at || '---'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#687b73]">Thu ngân mở:</span>
                    <span className="font-semibold">{cashier?.name || '---'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#687b73]">Người chốt:</span>
                    <span className="font-semibold">{closedBy?.name || '---'}</span>
                  </div>
                </div>

                {/* Số liệu két tiền */}
                <div className="py-2 border-b border-dashed border-[#b8c5bf] space-y-1">
                  <div className="flex justify-between">
                    <span>1. Tiền đầu ca:</span>
                    <span className="font-semibold">{moneyFormatted(totals?.opening_cash)}</span>
                  </div>
                  <div className="flex justify-between text-[#28805e]">
                    <span>2. Tổng thu mặt:</span>
                    <span className="font-semibold">+{moneyFormatted(totals?.system_cash_in)}</span>
                  </div>
                  <div className="flex justify-between text-[#bc5b52]">
                    <span>3. Tổng chi mặt:</span>
                    <span className="font-semibold">-{moneyFormatted(totals?.system_cash_out)}</span>
                  </div>
                  <div className="flex justify-between font-bold pt-1 border-t border-dotted border-[#d2ded8]">
                    <span>Két lý thuyết:</span>
                    <span>{moneyFormatted(totals?.expected_cash)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-xs pt-0.5">
                    <span>Két thực kiểm:</span>
                    <span className="text-[#176b51]">{moneyFormatted(totals?.actual_cash)}</span>
                  </div>
                  <div className="flex justify-between font-semibold pt-0.5">
                    <span>Chênh lệch:</span>
                    <span
                      className={
                        (totals?.difference_amount || 0) === 0
                          ? 'text-[#28805e]'
                          : (totals?.difference_amount || 0) > 0
                          ? 'text-[#4778a4]'
                          : 'text-[#bc5b52]'
                      }
                    >
                      {(totals?.difference_amount || 0) >= 0 ? '+' : ''}
                      {moneyFormatted(totals?.difference_amount)}
                    </span>
                  </div>
                </div>

                {/* Phân bổ tiền mặt */}
                <div className="py-2 border-b border-dashed border-[#b8c5bf] space-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-[#687b73]">Để lại két ca sau:</span>
                    <span className="font-semibold">{moneyFormatted(totals?.carried_over_cash)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-[#176b51]">
                    <span>Nộp két an toàn / chủ:</span>
                    <span>{moneyFormatted(totals?.deposited_cash)}</span>
                  </div>
                </div>

                {/* Ghi chú giải trình nếu có */}
                {shift?.reconciliation_notes && (
                  <div className="py-2 border-b border-dashed border-[#b8c5bf] text-[10px]">
                    <div className="font-bold text-[#8c6729] mb-0.5">Ghi chú giải trình:</div>
                    <div className="italic text-[#556961] bg-[#faf7f2] p-1.5 rounded">
                      &ldquo;{shift.reconciliation_notes}&rdquo;
                    </div>
                  </div>
                )}

                {/* Chữ ký */}
                <div className="pt-3 pb-2 grid grid-cols-2 text-center text-[10px] font-sans">
                  <div>
                    <div className="font-bold">Người bàn giao</div>
                    <div className="text-[9px] text-[#81908a]">(Ký & ghi họ tên)</div>
                    <div className="h-10" />
                    <div className="font-semibold">{cashier?.name}</div>
                  </div>
                  <div>
                    <div className="font-bold">Người nhận / Quản lý</div>
                    <div className="text-[9px] text-[#81908a]">(Ký & ghi họ tên)</div>
                    <div className="h-10" />
                    <div className="font-semibold">{closedBy?.name}</div>
                  </div>
                </div>

                <div className="text-center text-[9px] text-[#81908a] pt-2 border-t border-dotted border-[#cbd6d0] font-sans">
                  Biên bản in tự động từ hệ thống PodsCare OS
                </div>
              </div>
            ) : (
              /* ================= KHỔ IN VĂN BẢN A4 ================= */
              <div className="w-full max-w-[210mm] mx-auto bg-white p-8 border border-[#e5ece8] rounded shadow-xs text-[#17231f] text-xs font-sans leading-relaxed">
                {/* Header Hành chính */}
                <div className="flex justify-between items-start pb-4 border-b-2 border-[#176b51]">
                  <div>
                    <div className="font-bold text-sm uppercase text-[#176b51] tracking-tight">
                      {tenant?.name || 'HỆ THỐNG SỬA CHỮA PODSCARE'}
                    </div>
                    <div className="font-semibold text-xs text-[#17231f] mt-0.5">
                      {branch?.name}
                    </div>
                    <div className="text-[11px] text-[#60736b] mt-0.5">
                      Địa chỉ: {branch?.address || 'Toàn quốc'} · Điện thoại: {branch?.phone || '1900.6868'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-[#81908a]">Mã văn bản</div>
                    <div className="font-bold text-sm font-mono text-[#176b51]">
                      {shift?.shift_code}
                    </div>
                    <div className="text-[10px] text-[#81908a] mt-0.5">
                      Trạng thái: ĐÃ ĐỐI SOÁT
                    </div>
                  </div>
                </div>

                {/* Tiêu đề biên bản */}
                <div className="text-center my-6">
                  <h2 className="text-base font-bold uppercase tracking-tight text-[#17231f]">
                    BIÊN BẢN ĐỐI SOÁT KÉT & BÀN GIAO CA LÀM VIỆC
                  </h2>
                  <p className="text-xs text-[#60736b] mt-1">
                    Thời gian chốt ca: {dates?.closed_at || '---'}
                  </p>
                </div>

                {/* Thông tin nhân sự trực */}
                <div className="grid grid-cols-2 gap-4 p-3.5 bg-[#f6f8f6] border border-[#e9eeeb] rounded-[8px] mb-4">
                  <div>
                    <div className="text-[10px] font-bold text-[#81908a] uppercase">
                      Thu ngân mở ca
                    </div>
                    <div className="font-bold text-sm text-[#17231f] mt-0.5">
                      {cashier?.name || '---'}
                    </div>
                    <div className="text-xs text-[#60736b] mt-0.5">
                      Thời gian mở: {dates?.opened_at || '---'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#81908a] uppercase">
                      Nhân sự chốt & nhận bàn giao
                    </div>
                    <div className="font-bold text-sm text-[#17231f] mt-0.5">
                      {closedBy?.name || '---'}
                    </div>
                    <div className="text-xs text-[#60736b] mt-0.5">
                      Thời gian chốt: {dates?.closed_at || '---'}
                    </div>
                  </div>
                </div>

                {/* Bảng số liệu chi tiết két */}
                <div className="mb-4">
                  <div className="text-xs font-bold uppercase text-[#17231f] mb-2">
                    I. Bảng cân đối két tiền mặt
                  </div>
                  <table className="w-full border-collapse border border-[#e5ece8] text-xs">
                    <thead>
                      <tr className="bg-[#f4f7f5] text-[#17231f]">
                        <th className="border border-[#e5ece8] p-2 text-left font-bold w-12">STT</th>
                        <th className="border border-[#e5ece8] p-2 text-left font-bold">Chỉ tiêu đối soát</th>
                        <th className="border border-[#e5ece8] p-2 text-right font-bold w-40">Số tiền (VNĐ)</th>
                        <th className="border border-[#e5ece8] p-2 text-left font-bold">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-[#e5ece8] p-2 text-center">1</td>
                        <td className="border border-[#e5ece8] p-2 font-medium">Tiền mặt tồn đầu ca (Float)</td>
                        <td className="border border-[#e5ece8] p-2 text-right font-mono font-semibold">
                          {moneyFormatted(totals?.opening_cash)}
                        </td>
                        <td className="border border-[#e5ece8] p-2 text-[#60736b]">Bàn giao từ ca trước</td>
                      </tr>
                      <tr>
                        <td className="border border-[#e5ece8] p-2 text-center">2</td>
                        <td className="border border-[#e5ece8] p-2 font-medium text-[#28805e]">
                          Tổng thu tiền mặt phát sinh trong ca
                        </td>
                        <td className="border border-[#e5ece8] p-2 text-right font-mono font-semibold text-[#28805e]">
                          +{moneyFormatted(totals?.system_cash_in)}
                        </td>
                        <td className="border border-[#e5ece8] p-2 text-[#60736b]">
                          {data.total_income_count} giao dịch thu
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-[#e5ece8] p-2 text-center">3</td>
                        <td className="border border-[#e5ece8] p-2 font-medium text-[#bc5b52]">
                          Tổng chi tiền mặt ngoài két trong ca
                        </td>
                        <td className="border border-[#e5ece8] p-2 text-right font-mono font-semibold text-[#bc5b52]">
                          -{moneyFormatted(totals?.system_cash_out)}
                        </td>
                        <td className="border border-[#e5ece8] p-2 text-[#60736b]">
                          {data.total_expense_count} phiếu chi ngoài
                        </td>
                      </tr>
                      <tr className="bg-[#f9faf9] font-bold">
                        <td className="border border-[#e5ece8] p-2 text-center">4</td>
                        <td className="border border-[#e5ece8] p-2 text-[#176b51]">
                          Két lý thuyết hệ thống tính toán (1 + 2 - 3)
                        </td>
                        <td className="border border-[#e5ece8] p-2 text-right font-mono text-[#176b51]">
                          {moneyFormatted(totals?.expected_cash)}
                        </td>
                        <td className="border border-[#e5ece8] p-2 text-[#60736b]">Số dư sổ quỹ lý thuyết</td>
                      </tr>
                      <tr className="bg-white font-bold">
                        <td className="border border-[#e5ece8] p-2 text-center">5</td>
                        <td className="border border-[#e5ece8] p-2">Tiền mặt thực tế kiểm đếm sau cùng</td>
                        <td className="border border-[#e5ece8] p-2 text-right font-mono text-sm text-[#17231f]">
                          {moneyFormatted(totals?.actual_cash)}
                        </td>
                        <td className="border border-[#e5ece8] p-2 text-[#60736b]">Thực đếm trong ngăn kéo</td>
                      </tr>
                      <tr className="font-bold">
                        <td className="border border-[#e5ece8] p-2 text-center">6</td>
                        <td className="border border-[#e5ece8] p-2">Chênh lệch két (5 - 4)</td>
                        <td
                          className={`border border-[#e5ece8] p-2 text-right font-mono ${
                            (totals?.difference_amount || 0) === 0
                              ? 'text-[#28805e]'
                              : (totals?.difference_amount || 0) > 0
                              ? 'text-[#4778a4]'
                              : 'text-[#bc5b52]'
                          }`}
                        >
                          {(totals?.difference_amount || 0) >= 0 ? '+' : ''}
                          {moneyFormatted(totals?.difference_amount)}
                        </td>
                        <td className="border border-[#e5ece8] p-2">
                          {(totals?.difference_amount || 0) === 0 ? (
                            <span className="text-[#28805e]">Khớp tuyệt đối 100%</span>
                          ) : (
                            <span className="text-[#bc5b52]">Có chênh lệch cần giải trình</span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Bảng phân bổ tiền mặt */}
                <div className="mb-4">
                  <div className="text-xs font-bold uppercase text-[#17231f] mb-2">
                    II. Phân bổ bàn giao tiền mặt
                  </div>
                  <div className="grid grid-cols-2 gap-3 p-3 bg-[#f6f8f6] border border-[#e9eeeb] rounded-[8px]">
                    <div>
                      <div className="text-[10px] text-[#81908a] font-bold uppercase">
                        Tiền để lại két cho ca sau (Float ca tới)
                      </div>
                      <div className="text-sm font-bold font-mono text-[#17231f] mt-0.5">
                        {moneyFormatted(totals?.carried_over_cash)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#176b51] font-bold uppercase">
                        Tiền nộp két an toàn / Bàn giao quản lý, chủ
                      </div>
                      <div className="text-sm font-bold font-mono text-[#176b51] mt-0.5">
                        {moneyFormatted(totals?.deposited_cash)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lý do giải trình chênh lệch nếu có */}
                {shift?.reconciliation_notes && (
                  <div className="mb-6 p-3 bg-[#faf7f2] border border-[#e8dfcf] rounded-[8px]">
                    <div className="text-xs font-bold text-[#8c6729] mb-1">
                      III. Giải trình chênh lệch két tiền mặt:
                    </div>
                    <div className="text-xs italic text-[#556961]">
                      &ldquo;{shift.reconciliation_notes}&rdquo;
                    </div>
                  </div>
                )}

                {/* Ba chữ ký xác nhận */}
                <div className="mt-8 pt-4 grid grid-cols-3 text-center text-xs">
                  <div>
                    <div className="font-bold text-[#17231f]">NGƯỜI BÀN GIAO</div>
                    <div className="text-[10px] text-[#81908a]">(Ký và ghi rõ họ tên)</div>
                    <div className="h-16" />
                    <div className="font-bold text-[#17231f]">{cashier?.name}</div>
                  </div>
                  <div>
                    <div className="font-bold text-[#17231f]">NGƯỜI NHẬN BÀN GIAO</div>
                    <div className="text-[10px] text-[#81908a]">(Ký và ghi rõ họ tên)</div>
                    <div className="h-16" />
                    <div className="font-bold text-[#17231f]">{closedBy?.name}</div>
                  </div>
                  <div>
                    <div className="font-bold text-[#17231f]">QUẢN LÝ CHI NHÁNH</div>
                    <div className="text-[10px] text-[#81908a]">(Ký duyệt và đóng dấu)</div>
                    <div className="h-16" />
                    <div className="font-bold text-[#17231f]">........................</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
