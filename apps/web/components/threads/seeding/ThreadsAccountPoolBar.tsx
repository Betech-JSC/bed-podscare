'use client';

import React, { useState } from 'react';
import type { ThreadsAccountItem } from '@podscare/api-client';

interface ThreadsAccountPoolBarProps {
  accounts: ThreadsAccountItem[];
  loading?: boolean;
  onRefresh?: () => void;
  selectedAccountIds?: number[];
  onToggleAccountSelect?: (id: number) => void;
  selectable?: boolean;
}

export const ThreadsAccountPoolBar: React.FC<ThreadsAccountPoolBarProps> = ({
  accounts,
  loading = false,
  onRefresh,
  selectedAccountIds = [],
  onToggleAccountSelect,
  selectable = false,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const activeAccounts = accounts.filter((a) => a.status === 'active');
  const cooldownAccounts = accounts.filter((a) => a.status === 'cooldown');
  const expiredAccounts = accounts.filter(
    (a) => a.status === 'expired' || a.status === 'needs_reauth'
  );

  const totalDailyComments = accounts.reduce(
    (sum, a) => sum + (a.daily_comment_count || 0),
    0
  );
  const totalDailyCap = accounts.reduce(
    (sum, a) => sum + (a.daily_post_cap || 10),
    0
  );

  return (
    <div className="bg-[#ffffff] border border-[#e2e9e4] rounded-[12px] p-4 shadow-sm">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#e9eeeb]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[8px] bg-[#eaf5ef] flex items-center justify-center text-[#176b51]">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
            </svg>
          </div>
          <div>
            <h3 className="text-[14px] font-bold font-heading text-[#17231f] flex items-center gap-2">
              Kho 20 Tài khoản Threads
              <span className="text-[11px] font-normal text-[#516059]">
                (Hệ thống Multi-Account Seeding)
              </span>
            </h3>
            <p className="text-[12px] text-[#516059]">
              Quản lý tự động theo cơ chế Anti-Collision &amp; Cooldown giãn cách
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="h-8 px-2.5 rounded-[7px] bg-[#f6f8f6] border border-[#e2e9e4] text-[#17231f] hover:bg-[#eaf5ef] hover:text-[#176b51] text-[12px] font-semibold transition-colors flex items-center gap-1.5"
            >
              <svg
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>{loading ? 'Đang đồng bộ...' : 'Làm mới'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[#516059] hover:text-[#17231f] text-[12px] font-semibold transition-colors flex items-center gap-1"
          >
            <span>{isExpanded ? 'Thu gọn' : 'Xem chi tiết nick'}</span>
            <svg
              className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
        {/* Active */}
        <div className="p-2.5 rounded-[8px] bg-[#fafbfa] border border-[#e2e9e4] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-[#516059]">Sẵn sàng (Active)</div>
            <div className="text-[18px] font-bold font-heading text-[#176b51] mt-0.5">
              {activeAccounts.length}{' '}
              <span className="text-[11px] font-normal text-[#516059]">/ {accounts.length}</span>
            </div>
          </div>
          <span className="w-2.5 h-2.5 rounded-full bg-[#176b51]" />
        </div>

        {/* Cooldown */}
        <div className="p-2.5 rounded-[8px] bg-[#fafbfa] border border-[#e2e9e4] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-[#516059]">Nghỉ Cooldown (3-7m)</div>
            <div className="text-[18px] font-bold font-heading text-[#b77a21] mt-0.5">
              {cooldownAccounts.length}
            </div>
          </div>
          <span className="w-2.5 h-2.5 rounded-full bg-[#b77a21]" />
        </div>

        {/* Expired / Reauth */}
        <div className="p-2.5 rounded-[8px] bg-[#fafbfa] border border-[#e2e9e4] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-[#516059]">Hết hạn Token</div>
            <div className="text-[18px] font-bold font-heading text-[#bc5b52] mt-0.5">
              {expiredAccounts.length}
            </div>
          </div>
          <span className="w-2.5 h-2.5 rounded-full bg-[#bc5b52]" />
        </div>

        {/* Daily Cap */}
        <div className="p-2.5 rounded-[8px] bg-[#fafbfa] border border-[#e2e9e4] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-[#516059]">Đã đăng hôm nay</div>
            <div className="text-[18px] font-bold font-heading text-[#17231f] mt-0.5">
              {totalDailyComments}{' '}
              <span className="text-[11px] font-normal text-[#516059]">/ {totalDailyCap}</span>
            </div>
          </div>
          <div className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#f0f4f2] text-[#516059]">
            Hạn mức
          </div>
        </div>
      </div>

      {/* Expanded Account Grid */}
      {isExpanded && (
        <div className="mt-4 pt-3 border-t border-[#e9eeeb]">
          <div className="text-[12px] font-semibold text-[#17231f] mb-2 flex items-center justify-between">
            <span>Danh sách 20 tài khoản chi tiết:</span>
            {selectable && (
              <span className="text-[11px] text-[#176b51]">
                Đã chọn {selectedAccountIds.length} / {accounts.length} nick
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
            {accounts.map((acc) => {
              const isSelected = selectedAccountIds.includes(acc.id);
              let statusBadgeClass = 'bg-[#eaf5ef] text-[#176b51]';
              let statusLabel = 'Active';
              if (acc.status === 'cooldown') {
                statusBadgeClass = 'bg-[#faf3e7] text-[#b77a21]';
                statusLabel = 'Cooldown';
              } else if (acc.status === 'expired' || acc.status === 'needs_reauth') {
                statusBadgeClass = 'bg-[#fbefed] text-[#bc5b52]';
                statusLabel = acc.status === 'needs_reauth' ? 'Needs Reauth' : 'Token Expired';
              } else if (acc.status === 'paused' || acc.status === 'disabled') {
                statusBadgeClass = 'bg-[#f0f3f1] text-[#77847e]';
                statusLabel = 'Paused';
              }

              return (
                <div
                  key={acc.id}
                  onClick={() => selectable && onToggleAccountSelect?.(acc.id)}
                  className={`p-2.5 rounded-[8px] border text-left transition-all ${
                    selectable ? 'cursor-pointer' : ''
                  } ${
                    isSelected
                      ? 'bg-[#ffffff] border-[#176b51] ring-1 ring-[#176b51]'
                      : 'bg-[#fafbfa] border-[#e2e9e4] hover:bg-[#ffffff]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-bold text-[#17231f] truncate max-w-[120px]">
                      @{acc.username || acc.display_name}
                    </span>
                    <span
                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-[4px] uppercase ${statusBadgeClass}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#516059]">
                    <span>Hôm nay:</span>
                    <span className="font-mono font-semibold text-[#17231f]">
                      {acc.daily_comment_count} / {acc.daily_post_cap}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
