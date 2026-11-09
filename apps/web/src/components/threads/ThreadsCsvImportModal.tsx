'use client';

import React, { useState } from 'react';
import { Icon } from '@podscare/ui';
import {
  generateSampleThreadsCsv,
  type CsvImportOptions,
  type CsvImportResult,
} from '@/src/lib/threads-api';

export interface ThreadsCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportCsv: (options: CsvImportOptions) => Promise<CsvImportResult>;
}

export const ThreadsCsvImportModal: React.FC<ThreadsCsvImportModalProps> = ({
  isOpen,
  onClose,
  onImportCsv,
}) => {
  const [csvText, setCsvText] = useState<string>(() => generateSampleThreadsCsv(12));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeHoursStart, setActiveHoursStart] = useState<string>('08:00');
  const [activeHoursEnd, setActiveHoursEnd] = useState<string>('22:00');
  const [jitterMinutes, setJitterMinutes] = useState<number>(8);

  const [defaultIsSponsored, setDefaultIsSponsored] = useState<boolean>(false);
  const [defaultSponsoredSuffix, setDefaultSponsoredSuffix] = useState<string>('');
  const [defaultClientRef, setDefaultClientRef] = useState<string>('');

  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDownloadSampleCsv = (rowCount: number) => {
    const content = generateSampleThreadsCsv(rowCount);
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `podscare-threads-sample-${rowCount}-posts.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLoad100RowsPreset = () => {
    setSelectedFile(null);
    setCsvText(generateSampleThreadsCsv(100));
    setImportResult(null);
    setErrorMessage(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setImportResult(null);
    setErrorMessage(null);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setCsvText(reader.result);
        }
      };
      reader.readAsText(file, 'utf-8');
    }
  };

  const handleRunImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText.trim() && !selectedFile) {
      setErrorMessage('Vui lòng tải lên file CSV hoặc dán nội dung CSV vào khung dữ liệu.');
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);
    try {
      const res = await onImportCsv({
        csv_text: csvText,
        file: selectedFile,
        jitter_minutes: jitterMinutes,
        active_hours_start: activeHoursStart,
        active_hours_end: activeHoursEnd,
        default_is_sponsored: defaultIsSponsored,
        default_sponsored_suffix: defaultSponsoredSuffix.trim() || undefined,
        default_client_ref: defaultClientRef.trim() || undefined,
      });
      setImportResult(res);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Lỗi không xác định khi nhập file CSV.'
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nhập hàng loạt 100+ bài đăng từ CSV kèm Random Jitter"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#17231f]/50 p-3 sm:p-6 overflow-y-auto"
    >
      <div className="w-full max-w-[920px] bg-[#ffffff] border border-[#e9eeeb] rounded-[10px] shadow-modal overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#e9eeeb] flex items-center justify-between bg-[#fafbfa]">
          <div>
            <h2 className="font-heading text-[17px] font-bold text-[#17231f]">
              Nhập hàng loạt CSV (100+ Bài) & Tự động rải lịch Random Jitter
            </h2>
            <p className="text-[12px] text-[#81908a] mt-0.5">
              Kiểm định tự động từng dòng qua ThreadsPostValidator, liên kết chuỗi bài và phân tán thời gian đăng tự nhiên cho 20 tài khoản
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ nhập CSV"
            className="w-8 h-8 rounded-[7px] inline-flex items-center justify-center text-[#516059] hover:bg-[#f0f3f1]"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <form onSubmit={handleRunImport} className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Thanh tải CSV mẫu & Nạp nhanh 100 bài */}
          <div className="p-3.5 rounded-[10px] bg-[#e9f4ef] border border-[#c8eadb] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-[12px] text-[#17231f]">
              <div className="font-bold text-[#176b51]">
                Định dạng cột chuẩn CSV (12 cột hỗ trợ chuỗi bài &amp; bài hợp tác trả phí)
              </div>
              <div className="font-mono text-[11px] text-[#516059] mt-0.5 break-all">
                account_username, content_text, media_type, media_urls, link_attachment, topic_tag,
                thread_group_key, reply_order, scheduled_at, is_sponsored, sponsored_suffix, client_ref
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleDownloadSampleCsv(12)}
                className="h-8 px-3 rounded-[7px] bg-[#ffffff] border border-[#176b51] text-[#176b51] hover:bg-[#176b51] hover:text-[#ffffff] text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <Icon name="download" size={14} />
                <span>Tải CSV mẫu</span>
              </button>
              <button
                type="button"
                onClick={handleLoad100RowsPreset}
                className="h-8 px-3 rounded-[7px] bg-[#176b51] text-[#ffffff] hover:bg-[#10583f] text-[11px] font-semibold transition-colors"
              >
                Nạp sẵn 100 bài thử nghiệm (20 kênh)
              </button>
            </div>
          </div>

          {/* Cấu hình khung giờ hoạt động + Random Jitter + Nhãn hợp tác mặc định */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 p-4 rounded-[10px] bg-[#f6f8f6] border border-[#e9eeeb]">
            <div>
              <label className="block text-[11px] font-semibold text-[#17231f] mb-1">
                Giờ bắt đầu rải lịch
              </label>
              <input
                type="time"
                value={activeHoursStart}
                onChange={(e) => setActiveHoursStart(e.target.value)}
                className="w-full h-[34px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] font-mono text-[12px] text-[#17231f]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#17231f] mb-1">
                Giờ kết thúc trong ngày
              </label>
              <input
                type="time"
                value={activeHoursEnd}
                onChange={(e) => setActiveHoursEnd(e.target.value)}
                className="w-full h-[34px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] font-mono text-[12px] text-[#17231f]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#17231f] mb-1">
                Biên độ Random Jitter (±phút)
              </label>
              <select
                value={jitterMinutes}
                onChange={(e) => setJitterMinutes(Number(e.target.value))}
                className="w-full h-[34px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[12px] text-[#17231f]"
              >
                <option value={3}>±3 phút (Lệch nhẹ)</option>
                <option value={5}>±5 phút (Tiêu chuẩn)</option>
                <option value={8}>±8 phút (Khuyến nghị tự nhiên)</option>
                <option value={12}>±12 phút (Phân tán rộng)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#17231f] mb-1">
                Tải file CSV từ máy (.csv)
              </label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="w-full text-[11px] text-[#516059] file:mr-2 file:py-1.5 file:px-2.5 file:rounded-[6px] file:border file:border-[#e2e9e4] file:bg-[#ffffff] file:text-[11px] file:font-semibold file:text-[#17231f]"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4 pt-2 border-t border-[#e9eeeb] flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#17231f] cursor-pointer">
                <input
                  type="checkbox"
                  checked={defaultIsSponsored}
                  onChange={(e) => setDefaultIsSponsored(e.target.checked)}
                  className="w-4 h-4 rounded border-[#e2e9e4] text-[#176b51]"
                />
                <span>Áp dụng mặc định is_sponsored = true cho các dòng để trống cột hợp tác</span>
              </label>

              {defaultIsSponsored && (
                <>
                  <input
                    type="text"
                    value={defaultClientRef}
                    onChange={(e) => setDefaultClientRef(e.target.value)}
                    placeholder="client_ref mặc định (VD: CAMPAIGN_11)"
                    className="h-[32px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] font-mono text-[11px] text-[#17231f]"
                  />
                  <input
                    type="text"
                    value={defaultSponsoredSuffix}
                    onChange={(e) => setDefaultSponsoredSuffix(e.target.value)}
                    placeholder="sponsored_suffix tùy chọn (để trống = giữ nguyên gốc)"
                    className="h-[32px] w-[260px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[11px] text-[#17231f]"
                  />
                </>
              )}
            </div>
          </div>

          {/* Khung soạn/xem trước nội dung CSV */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-[#17231f]">
                Nội dung dữ liệu CSV (có thể chỉnh sửa trực tiếp trước khi chạy kiểm định & phân bổ lịch)
              </label>
              <span className="font-mono text-[11px] text-[#81908a]">
                Số dòng dữ liệu ước tính:{' '}
                {Math.max(
                  0,
                  csvText
                    .trim()
                    .split('\n')
                    .filter(Boolean).length - 1
                )}{' '}
                dòng
              </span>
            </div>
            <textarea
              rows={7}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full p-3 rounded-[7px] bg-[#fafbfa] border border-[#e2e9e4] font-mono text-[11px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
            />
          </div>

          {errorMessage && (
            <div className="p-3 rounded-[7px] bg-[#fbefed] border border-[#bc5b52] text-[12px] text-[#bc5b52] font-medium">
              {errorMessage}
            </div>
          )}

          {/* Hiển thị kết quả sau khi chạy Import & Random Jitter */}
          {importResult && (
            <div
              data-testid="csv-import-result-panel"
              className="p-4 rounded-[10px] bg-[#f6f8f6] border border-[#176b51]/30 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-[20px] bg-[#eaf5ef] text-[#28805e] text-[11px] font-bold">
                    Đã tạo lịch: {importResult.imported_count}/{importResult.total_rows} bài
                  </span>
                  {importResult.failed_count > 0 && (
                    <span className="px-2.5 py-1 rounded-[20px] bg-[#fbefed] text-[#bc5b52] text-[11px] font-bold">
                      Dòng lỗi: {importResult.failed_count}
                    </span>
                  )}
                </div>
                <span className="font-mono text-[11px] text-[#81908a]">
                  Mã lô: {importResult.import_batch_id} · Random Jitter: ±{importResult.jitter_minutes} phút
                </span>
              </div>

              {importResult.errors.length > 0 && (
                <div className="p-3 rounded-[7px] bg-[#fbefed] border border-[#bc5b52]/30 space-y-1 max-h-[140px] overflow-y-auto">
                  <div className="text-[11px] font-bold text-[#bc5b52]">
                    Chi tiết các dòng bị từ chối bởi ThreadsPostValidator:
                  </div>
                  {importResult.errors.map((err, idx) => (
                    <div key={idx} className="text-[11px] text-[#bc5b52] font-mono">
                      Dòng #{err.row} ({err.account_username || 'N/A'}): {err.message}
                    </div>
                  ))}
                </div>
              )}

              {importResult.posts.length > 0 && (
                <div className="max-h-[210px] overflow-y-auto border border-[#e9eeeb] rounded-[7px] bg-[#ffffff]">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="border-b border-[#e9eeeb] bg-[#fafbfa] text-[10px] font-bold uppercase text-[#81908a]">
                        <th className="py-2 px-3">ID</th>
                        <th className="py-2 px-3">Tài khoản</th>
                        <th className="py-2 px-3">Chuỗi / Thứ tự</th>
                        <th className="py-2 px-3">Lịch xuất bản (đã cộng Jitter)</th>
                        <th className="py-2 px-3">Nội dung xuất bản thực tế</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e9eeeb]">
                      {importResult.posts.slice(0, 15).map((post) => (
                        <tr key={post.id}>
                          <td className="py-2 px-3 font-mono text-[#81908a]">#{post.id}</td>
                          <td className="py-2 px-3 font-mono font-medium text-[#17231f]">
                            @{post.account?.username || post.account_id}
                          </td>
                          <td className="py-2 px-3 font-mono text-[#516059]">
                            {post.thread_group_key
                              ? `${post.thread_group_key} (#${post.reply_order + 1})`
                              : 'Bài đơn'}
                          </td>
                          <td className="py-2 px-3 font-mono text-[#176b51]">
                            {post.scheduled_at
                              ? new Date(post.scheduled_at).toLocaleString('vi-VN')
                              : 'Auto-chain (30–60s sau bài cha)'}
                          </td>
                          <td className="py-2 px-3 text-[#17231f] max-w-[300px] truncate">
                            {post.effective_text || post.content_text}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="pt-2 border-t border-[#e9eeeb] flex items-center justify-between gap-2">
            <span className="text-[11px] text-[#81908a]">
              Tự động lệch pha theo account_id để 20 tài khoản không đăng trùng giây
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-[34px] px-3.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[#516059] text-[12px] font-semibold"
              >
                Đóng
              </button>
              <button
                type="submit"
                disabled={isImporting}
                className="h-[34px] px-4 rounded-[7px] bg-[#176b51] text-[#ffffff] hover:bg-[#10583f] text-[12px] font-semibold disabled:opacity-50"
              >
                {isImporting
                  ? 'Đang kiểm định & rải lịch...'
                  : 'Kiểm định & Lên lịch hàng loạt'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ThreadsCsvImportModal;
