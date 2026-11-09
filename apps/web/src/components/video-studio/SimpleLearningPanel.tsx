'use client';

import React, { useMemo, useState } from 'react';
import type { SimpleLearningProposalItem } from '@/src/lib/video-studio/types';

export interface SimpleLearningRuleItem {
  id: string;
  index?: number;
  text: string;
}

export interface SimpleLearningPanelProps {
  /** Mã dự án hiện tại */
  projectId?: string;
  /** Danh sách các đề xuất quy tắc từ bản sửa CapCut */
  proposals: SimpleLearningProposalItem[];
  /** Danh sách chuỗi quy tắc đang áp dụng (tối đa 30 quy tắc) */
  appliedRules: string[];
  /** Danh sách đối tượng quy tắc có id (phục vụ xóa quy tắc khi bộ nhớ đầy) */
  ruleItems?: SimpleLearningRuleItem[];
  /** Giới hạn số bài học tối đa (mặc định: 30) */
  maxRules?: number;
  /** Trạng thái đang đồng bộ với API `/api/video-studio/learn` */
  isLoading?: boolean;
  /** ID đề xuất đang thực thi Duyệt / Bỏ qua */
  actingProposalId?: string | null;
  /** ID quy tắc đang xóa */
  actingRuleId?: string | null;
  /** Thông báo phản hồi ngắn gọn sau khi Duyệt / Bỏ qua / Xóa */
  feedbackMessage?: string | null;
  /** Callback khi người dùng bấm "Duyệt" */
  onApproveProposal: (proposalId: string, ruleText?: string) => Promise<void> | void;
  /** Callback khi người dùng bấm "Bỏ qua" */
  onDismissProposal: (proposalId: string) => Promise<void> | void;
  /** Callback khi người dùng xóa 1 quy tắc đã lưu trong mục thu gọn */
  onDeleteRule?: (ruleId: string, ruleText?: string) => Promise<void> | void;
  /** Callback đóng ngăn "Học & cải thiện" */
  onClose?: () => void;
}

export function SimpleLearningPanel({
  proposals,
  appliedRules,
  ruleItems,
  maxRules = 30,
  isLoading = false,
  actingProposalId = null,
  actingRuleId = null,
  feedbackMessage = null,
  onApproveProposal,
  onDismissProposal,
  onDeleteRule,
  onClose,
}: SimpleLearningPanelProps) {
  const [showAllAppliedRules, setShowAllAppliedRules] = useState<boolean>(false);

  const pendingProposals = useMemo(
    () => (proposals || []).filter((p) => p.status === 'pending'),
    [proposals]
  );

  const normalizedRuleItems: SimpleLearningRuleItem[] = useMemo(() => {
    if (Array.isArray(ruleItems) && ruleItems.length > 0) {
      return ruleItems.slice(0, maxRules);
    }
    return (appliedRules || []).slice(0, maxRules).map((text, idx) => ({
      id: `rule_${idx + 1}`,
      index: idx,
      text,
    }));
  }, [appliedRules, maxRules, ruleItems]);

  const rulesCount = normalizedRuleItems.length;

  return (
    <section
      aria-label="Học từ bản sửa CapCut của bạn"
      data-testid="simple-learning-panel"
      className="bg-[#FFFFFF] border-b border-[#E5E0D8]"
    >
      <div className="max-w-[1160px] mx-auto px-4 sm:px-6 py-5">
        {/* Đầu ngăn: Tiêu đề + Bộ đếm quy tắc x/30 + Nút đóng */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#e9eeeb]">
          <div>
            <h2 className="font-heading font-bold text-[18px] leading-[26px] text-[#17231f]">
              Học từ bản sửa CapCut của bạn
            </h2>
            <p className="mt-0.5 text-[15px] leading-[24px] text-[#4a5d54] max-w-[68ch]">
              AI đã so sánh bản cắt tự động với bản bạn chỉnh lại trong CapCut để rút ra quy tắc
              mới cho các video tiếp theo.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              data-testid="learning-rules-counter"
              className="font-mono tabular-nums text-[13px] leading-[20px] font-medium text-[#176b51] bg-[#e9f4ef] px-2.5 py-1 rounded-[6px]"
            >
              Bộ nhớ quy tắc: {rulesCount}/{maxRules}
            </span>
            {onClose && (
              <button
                type="button"
                data-testid="close-learning-panel-button"
                onClick={onClose}
                className="px-3 min-h-[44px] rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] text-[13px] leading-[20px] font-medium text-[#17231f] hover:bg-[#f6f8f6] transition-colors"
              >
                Đóng ngăn ×
              </button>
            )}
          </div>
        </div>

        {/* Danh sách đề xuất chờ duyệt (Mỗi mục có lời giải thích ngắn gọn + 2 nút Duyệt / Bỏ qua) */}
        {pendingProposals.length > 0 ? (
          <div
            data-testid="learning-pending-proposals-list"
            className="mt-4 divide-y divide-[#e9eeeb] border border-[#d5e0d7] rounded-[6px] bg-[#ffffff]"
          >
            {pendingProposals.map((item, idx) => {
              const isBusy = actingProposalId === item.id;
              return (
                <div
                  key={item.id}
                  data-testid={`learning-proposal-item-${idx + 1}`}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 max-w-[68ch]">
                    <p className="text-[15px] leading-[24px] font-medium text-[#17231f]">
                      {idx + 1}. {item.rule_text}
                    </p>
                    <p className="text-[13px] leading-[20px] text-[#4a5d54]">
                      {item.detected_at_label}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-none">
                    <button
                      type="button"
                      data-testid={`approve-proposal-${item.id}`}
                      disabled={isBusy || isLoading}
                      onClick={() => void onApproveProposal(item.id, item.rule_text)}
                      className="px-3.5 min-h-[44px] rounded-[6px] bg-[#176b51] hover:bg-[#10583f] text-[#ffffff] text-[13px] leading-[20px] font-medium transition-colors disabled:opacity-60"
                    >
                      Duyệt
                    </button>
                    <button
                      type="button"
                      data-testid={`dismiss-proposal-${item.id}`}
                      disabled={isBusy || isLoading}
                      onClick={() => void onDismissProposal(item.id)}
                      className="px-3.5 min-h-[44px] rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] hover:bg-[#f6f8f6] text-[#4a5d54] text-[13px] leading-[20px] font-medium transition-colors disabled:opacity-60"
                    >
                      Bỏ qua
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            data-testid="learning-empty-proposals"
            className="mt-4 p-4 rounded-[6px] border border-[#e9eeeb] bg-[#f6f8f6] text-[15px] leading-[24px] text-[#4a5d54]"
          >
            Bạn đã xử lý hết các đề xuất quy tắc mới.
          </div>
        )}

        {feedbackMessage && (
          <p
            role="status"
            aria-live="polite"
            className="mt-2.5 text-[13px] leading-[20px] font-medium text-[#176b51]"
          >
            {feedbackMessage}
          </p>
        )}

        {/* Mục thu gọn để xem / xóa các quy tắc đã lưu khi cần */}
        <div className="mt-3">
          <button
            type="button"
            data-testid="toggle-applied-rules-button"
            aria-expanded={showAllAppliedRules}
            onClick={() => setShowAllAppliedRules((prev) => !prev)}
            className="min-h-[44px] text-[13px] leading-[20px] font-medium text-[#176b51] hover:underline py-1 inline-flex items-center gap-1.5"
          >
            <span aria-hidden="true">{showAllAppliedRules ? '▾' : '▸'}</span>
            <span>
              {showAllAppliedRules
                ? `Thu gọn ${rulesCount}/${maxRules} quy tắc đang áp dụng`
                : `Xem ${rulesCount}/${maxRules} quy tắc đang áp dụng (Bấm để mở rộng danh sách)`}
            </span>
          </button>

          {showAllAppliedRules && (
            <ol
              data-testid="applied-rules-list"
              className="mt-2 p-4 rounded-[6px] border border-[#e9eeeb] bg-[#f6f8f6] space-y-2 list-decimal list-inside text-[13px] leading-[20px] text-[#17231f]"
            >
              {normalizedRuleItems.map((rule) => {
                const isDeleting = actingRuleId === rule.id;
                return (
                  <li
                    key={rule.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-0.5"
                  >
                    <span className="max-w-[68ch]">{rule.text}</span>
                    {onDeleteRule && (
                      <button
                        type="button"
                        disabled={isDeleting || isLoading}
                        onClick={() => void onDeleteRule(rule.id, rule.text)}
                        className="px-3 min-h-[44px] min-w-[44px] rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] hover:bg-[#fbefed] text-[12px] leading-[18px] font-medium text-[#4a5d54] hover:text-[#993f37] transition-colors disabled:opacity-60 inline-flex items-center justify-center shrink-0"
                        aria-label={`Xóa quy tắc: ${rule.text}`}
                      >
                        Xóa
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

export default SimpleLearningPanel;
