'use client';

import React, { useMemo, useState } from 'react';
import type {
  ThreadsSeedingStrategy,
  ThreadsDispatchDirectRequest,
} from '@podscare/types';
import {
  threadsSeedingService,
  ThreadsSeedingService,
  type ThreadsAccountItem,
} from '@podscare/api-client/src/threads-seeding';
import { StrategySelector } from './StrategySelector';

const seedingApi = threadsSeedingService || new ThreadsSeedingService();

interface DirectSeedingTabProps {
  accounts: ThreadsAccountItem[];
  onDispatchSuccess: (campaignName: string, jobsCount: number, campaignId?: number) => void;
}

interface ParsedUrlItem {
  rawUrl: string;
  isValid: boolean;
  postCode?: string;
  username?: string;
  errorMessage?: string;
}

export const DirectSeedingTab: React.FC<DirectSeedingTabProps> = ({
  accounts,
  onDispatchSuccess,
}) => {
  const [campaignName, setCampaignName] = useState<string>('');
  const [rawUrlsText, setRawUrlsText] = useState<string>(
    'https://www.threads.net/@tech_reviewer/post/DA123456789\nhttps://www.threads.net/@apple_fans_vn/post/DB987654321'
  );
  const [replyText, setReplyText] = useState<string>(
    'Dòng này bên em sẵn linh kiện thay thế lấy ngay sau 30 phút, bảo hành điện tử chính hãng ạ.'
  );
  const [strategy, setStrategy] = useState<ThreadsSeedingStrategy>('round_robin');
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Ký tự đếm (Hệ thống Seeding hỗ trợ tối đa 1000 ký tự theo API backend)
  const charCount = replyText.length;
  const isOverCharLimit = charCount > 1000;

  // Bóc tách & phân tích tính hợp lệ của từng dòng URL
  const parsedUrls: ParsedUrlItem[] = useMemo(() => {
    const lines = rawUrlsText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    return lines.map((line) => {
      try {
        const urlObj = new URL(line);
        if (!urlObj.hostname.includes('threads.net')) {
          return {
            rawUrl: line,
            isValid: false,
            errorMessage: 'Không thuộc tên miền threads.net',
          };
        }
        // Match regex: /@([a-zA-Z0-9._]+)/post/([a-zA-Z0-9_-]+) or /t/([a-zA-Z0-9_-]+)
        const match = urlObj.pathname.match(/(?:@([^/]+)\/post\/|post\/|t\/)([^/?#]+)/);
        if (!match || !match[2]) {
          return {
            rawUrl: line,
            isValid: false,
            errorMessage: 'Không tìm thấy mã định danh bài viết (post_code)',
          };
        }
        return {
          rawUrl: line,
          isValid: true,
          username: match[1] || 'threads_user',
          postCode: match[2],
        };
      } catch {
        return {
          rawUrl: line,
          isValid: false,
          errorMessage: 'Định dạng URL không hợp lệ',
        };
      }
    });
  }, [rawUrlsText]);

  const validUrls = parsedUrls.filter((u) => u.isValid);
  const invalidUrls = parsedUrls.filter((u) => !u.isValid);

  // Danh sách tài khoản khả dụng cho chiến lược
  const availableAccounts = useMemo(() => {
    if (strategy === 'manual') {
      return accounts.filter((a) => selectedAccountIds.includes(a.id));
    }
    return accounts.filter((a) => a.status === 'active');
  }, [accounts, strategy, selectedAccountIds]);

  // Preview ghép cặp Bài viết <--> Tài khoản Threads
  const previewAssignments = useMemo(() => {
    if (validUrls.length === 0 || availableAccounts.length === 0) return [];

    const assignments: {
      postUrl: string;
      postCode: string;
      accountName: string;
      delayEstimate: string;
      clusterIndex?: number;
    }[] = [];

    let currentDelaySec = 0;

    validUrls.forEach((urlItem, idx) => {
      if (strategy === 'cluster') {
        // Gán 2 accounts vào cùng 1 URL
        const acc1 = availableAccounts[idx % availableAccounts.length];
        const acc2 = availableAccounts[(idx + 1) % availableAccounts.length];

        currentDelaySec += Math.floor(Math.random() * 60) + 180;
        assignments.push({
          postUrl: urlItem.rawUrl,
          postCode: urlItem.postCode || '',
          accountName: `@${acc1.username || acc1.display_name}`,
          delayEstimate: `Ngay sau ${Math.round(currentDelaySec / 60)} phút`,
          clusterIndex: 1,
        });

        // Nick 2 trễ 15 phút sau nick 1
        const clusterDelay = currentDelaySec + 900;
        assignments.push({
          postUrl: urlItem.rawUrl,
          postCode: urlItem.postCode || '',
          accountName: `@${acc2.username || acc2.display_name}`,
          delayEstimate: `Tung hứng sau ${Math.round(clusterDelay / 60)} phút (+15m)`,
          clusterIndex: 2,
        });
      } else {
        // Round-robin hoặc Manual
        const acc = availableAccounts[idx % availableAccounts.length];
        currentDelaySec += Math.floor(Math.random() * 60) + 180;
        assignments.push({
          postUrl: urlItem.rawUrl,
          postCode: urlItem.postCode || '',
          accountName: `@${acc.username || acc.display_name}`,
          delayEstimate: `Sau khoảng ${Math.round(currentDelaySec / 60)} phút`,
        });
      }
    });

    return assignments;
  }, [validUrls, availableAccounts, strategy]);

  const handleToggleAccount = (accId: number) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accId) ? prev.filter((id) => id !== accId) : [...prev, accId]
    );
  };

  const handleDispatch = async () => {
    if (validUrls.length === 0) {
      setSubmitError('Vui lòng dán ít nhất 1 đường dẫn URL Threads hợp lệ.');
      return;
    }
    if (invalidUrls.length > 0) {
      setSubmitError(
        `Phát hiện ${invalidUrls.length} liên kết không đúng định dạng. Vui lòng xóa hoặc sửa lại trước khi gửi.`
      );
      return;
    }
    if (!replyText.trim()) {
      setSubmitError('Nội dung bình luận không được để trống.');
      return;
    }
    if (isOverCharLimit) {
      setSubmitError('Nội dung bình luận vượt quá giới hạn 1000 ký tự của hệ thống Seeding.');
      return;
    }
    if (strategy === 'manual' && selectedAccountIds.length === 0) {
      setSubmitError('Vui lòng tick chọn ít nhất 1 tài khoản Threads để thực thi.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const payload: ThreadsDispatchDirectRequest = {
      name:
        campaignName.trim() ||
        `Direct Seeding ${validUrls.length} bài - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      post_urls: validUrls.map((u) => u.rawUrl),
      reply_text: replyText.trim(),
      dispatch_strategy: strategy,
      account_ids: strategy === 'manual' ? selectedAccountIds : undefined,
      cooldown_min_seconds: 180,
      cooldown_max_seconds: 420,
    };

    try {
      const res: any = await seedingApi.dispatchDirect(payload);
      const data = res?.campaign ? res : res?.data || res;
      onDispatchSuccess(payload.name, data?.jobs_count || previewAssignments.length, data?.campaign?.id);
    } catch (err: any) {
      const apiMsg =
        err?.data?.message ||
        (err?.data?.errors ? Object.values(err.data.errors).flat().join(' ') : null);
      setSubmitError(
        apiMsg ||
          (err instanceof Error
            ? err.message
            : 'Lỗi khi kích hoạt seeding chỉ định. Vui lòng kiểm tra lại kết nối.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Vùng dán danh sách URL */}
      <div className="bg-[#ffffff] border border-[#e2e9e4] rounded-[12px] p-5 shadow-sm space-y-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#176b51]">
            Bước 1 · Danh sách bài viết mục tiêu
          </span>
          <h2 className="text-[18px] font-bold font-heading text-[#17231f] mt-1">
            Seeding Chỉ định theo Danh sách Liên kết Threads
          </h2>
          <p className="text-[13px] text-[#516059] mt-1 leading-relaxed">
            Dán một hoặc nhiều liên kết bài viết công khai trên Threads (mỗi dòng 1 URL). Hệ thống
            sẽ tự động bóc tách mã bài viết và phân bổ ngẫu nhiên vào mạng lưới 20 nick.
          </p>
        </div>

        {/* Tên chiến dịch */}
        <div>
          <label className="block text-[12px] font-bold text-[#17231f] mb-1">
            Tên Chiến dịch Chỉ định
          </label>
          <input
            type="text"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="Ví dụ: Seeding bài đối tác ngày 11/11..."
            className="w-full h-10 px-3.5 rounded-[8px] bg-[#fafbfa] border border-[#e2e9e4] text-[13px] text-[#17231f] focus:bg-[#ffffff] focus:border-[#176b51] outline-none"
          />
        </div>

        {/* Textarea nhập URL */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[12px] font-bold text-[#17231f]">
              Danh sách URL bài viết Threads (1 link / dòng)
            </label>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-[#176b51] font-semibold">
                {validUrls.length} hợp lệ
              </span>
              {invalidUrls.length > 0 && (
                <span className="text-[#bc5b52] font-semibold">
                  · {invalidUrls.length} lỗi
                </span>
              )}
            </div>
          </div>

          <textarea
            rows={5}
            value={rawUrlsText}
            onChange={(e) => setRawUrlsText(e.target.value)}
            placeholder="https://www.threads.net/@user/post/DA...\nhttps://www.threads.net/@user2/post/DB..."
            className="w-full p-3.5 font-mono text-[12px] rounded-[8px] bg-[#fafbfa] border border-[#e2e9e4] text-[#17231f] leading-relaxed outline-none focus:bg-[#ffffff] focus:border-[#176b51]"
          />
        </div>

        {/* Badges preview URL validation */}
        {parsedUrls.length > 0 && (
          <div className="p-3 rounded-[8px] bg-[#fafbfa] border border-[#e9eeeb] space-y-1.5 max-h-40 overflow-y-auto">
            <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#516059]">
              Kiểm tra tính hợp lệ liên kết ({validUrls.length}/{parsedUrls.length}):
            </div>
            {parsedUrls.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-[11px] py-1 border-b border-[#f0f4f2] last:border-none"
              >
                <div className="flex items-center gap-2 truncate max-w-md">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      item.isValid ? 'bg-[#176b51]' : 'bg-[#bc5b52]'
                    }`}
                  />
                  <span className="font-mono text-[#17231f] truncate">{item.rawUrl}</span>
                </div>
                {item.isValid ? (
                  <span className="text-[#176b51] font-mono shrink-0 ml-2">
                    ID: {item.postCode}
                  </span>
                ) : (
                  <span className="text-[#bc5b52] shrink-0 ml-2 font-medium">
                    {item.errorMessage}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Soạn thảo nội dung & Chọn Chiến lược */}
      <div className="bg-[#ffffff] border border-[#e2e9e4] rounded-[12px] p-5 shadow-sm space-y-5">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#176b51]">
            Bước 2 · Cấu hình kịch bản
          </span>
          <h3 className="text-[16px] font-bold font-heading text-[#17231f] mt-0.5">
            Nội dung phản hồi &amp; Phân bổ mạng lưới nick
          </h3>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[12px] font-bold text-[#17231f]">
              Nội dung bình luận soạn sẵn
            </label>
            <span
              className={`text-[11px] font-mono font-semibold ${
                isOverCharLimit ? 'text-[#bc5b52]' : 'text-[#516059]'
              }`}
            >
              {charCount} / 1000 ký tự
            </span>
          </div>
          <textarea
            rows={4}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Nhập nội dung bình luận..."
            className={`w-full p-3.5 rounded-[8px] bg-[#fafbfa] border text-[13px] text-[#17231f] leading-relaxed outline-none focus:bg-[#ffffff] ${
              isOverCharLimit
                ? 'border-[#bc5b52] focus:border-[#bc5b52]'
                : 'border-[#e2e9e4] focus:border-[#176b51]'
            }`}
          />
        </div>

        {/* Bộ chọn chiến lược */}
        <StrategySelector value={strategy} onChange={setStrategy} />

        {/* Manual Account Checklist nếu chọn manual */}
        {strategy === 'manual' && (
          <div className="p-4 rounded-[10px] bg-[#fafbfa] border border-[#e2e9e4] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-[#17231f]">
                Tick chọn các nick tham gia:
              </span>
              <span className="text-[11px] text-[#176b51] font-semibold">
                Đã chọn {selectedAccountIds.length} / {accounts.length} nick
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {accounts.map((acc) => {
                const isChecked = selectedAccountIds.includes(acc.id);
                const isAvailable = acc.status === 'active';
                return (
                  <label
                    key={acc.id}
                    className={`flex items-center gap-2 p-2 rounded-[6px] border text-[12px] cursor-pointer transition-colors ${
                      isChecked
                        ? 'bg-[#ffffff] border-[#176b51] text-[#176b51] font-semibold'
                        : 'bg-[#fafbfa] border-[#e9eeeb] text-[#516059]'
                    } ${!isAvailable ? 'opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={!isAvailable}
                      onChange={() => handleToggleAccount(acc.id)}
                      className="w-3.5 h-3.5 rounded text-[#176b51] focus:ring-[#176b51]"
                    />
                    <span className="truncate">@{acc.username || acc.display_name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Bảng xem trước danh sách tài khoản sẽ thực thi */}
        {previewAssignments.length > 0 && (
          <div className="border border-[#e2e9e4] rounded-[10px] overflow-hidden">
            <div className="p-3 bg-[#fafbfa] border-b border-[#e9eeeb] flex items-center justify-between">
              <span className="text-[12px] font-bold font-heading text-[#17231f]">
                Bảng xem trước phân bổ Seeding ({previewAssignments.length} lượt chạy dự kiến)
              </span>
              <span className="text-[11px] text-[#516059]">
                Giãn cách ngẫu nhiên 3–7 phút
              </span>
            </div>

            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="bg-[#fafbfa] border-b border-[#e9eeeb] text-[10px] font-bold uppercase tracking-[0.6px] text-[#81908a]">
                    <th className="py-2.5 px-3">STT</th>
                    <th className="py-2.5 px-3">Bài viết mục tiêu</th>
                    <th className="py-2.5 px-3">Tài khoản thực thi</th>
                    <th className="py-2.5 px-3">Thời gian dự kiến</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e9eeeb]">
                  {previewAssignments.map((asgn, i) => (
                    <tr key={i} className="hover:bg-[#fafbfa]">
                      <td className="py-2.5 px-3 font-mono text-[#77847e]">{i + 1}</td>
                      <td className="py-2.5 px-3 font-mono text-[#17231f] truncate max-w-xs">
                        {asgn.postUrl}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-[#176b51] bg-[#eaf5ef] px-2 py-0.5 rounded-[4px]">
                          {asgn.accountName}
                        </span>
                        {asgn.clusterIndex && (
                          <span className="ml-1 text-[10px] text-[#77847e]">
                            (Nick #{asgn.clusterIndex})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[#516059] font-mono text-[11px]">
                        {asgn.delayEstimate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Submit Error */}
        {submitError && (
          <div className="p-3 rounded-[8px] bg-[#fbefed] border border-[#f3d0cb] text-[12px] text-[#bc5b52] flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{submitError}</span>
          </div>
        )}

        {/* Submit Button */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#e9eeeb]">
          <div className="text-[12px] text-[#516059]">
            Tự động kiểm tra Anti-Collision chống gửi trùng nội dung trong 24h.
          </div>

          <button
            type="button"
            onClick={handleDispatch}
            disabled={isSubmitting || validUrls.length === 0 || isOverCharLimit}
            className="w-full sm:w-auto h-11 px-6 rounded-[8px] bg-[#176b51] hover:bg-[#12543f] text-[#ffffff] font-bold text-[13px] font-heading transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>Đang đẩy vào Hàng đợi Seeding...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                <span>Kích hoạt Seeding Chỉ định ({validUrls.length} bài)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
