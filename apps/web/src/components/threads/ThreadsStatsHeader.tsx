'use client';

import React from 'react';
import type { ThreadsDashboardStats } from '@/src/lib/threads-api';

export interface ThreadsStatsHeaderProps {
  stats: ThreadsDashboardStats;
  loading?: boolean;
  onSelectFilter?: (
    target:
      | 'active_accounts'
      | 'needs_reauth'
      | 'scheduled_today'
      | 'published_today'
      | 'failed_posts'
      | 'sponsored_posts'
  ) => void;
}

interface KpiCardItem {
  key:
    | 'active_accounts'
    | 'needs_reauth'
    | 'scheduled_today'
    | 'published_today'
    | 'failed_posts'
    | 'sponsored_posts';
  label: string;
  valueDisplay: string;
  subLabel: string;
  badgeText: string;
  badgeClasses: string;
  dotColor: string;
}

export const ThreadsStatsHeader: React.FC<ThreadsStatsHeaderProps> = ({
  stats,
  loading = false,
  onSelectFilter,
}) => {
  const cards: KpiCardItem[] = [
    {
      key: 'active_accounts',
      label: 'Tài khoản hoạt động',
      valueDisplay: `${stats.active_accounts}/${stats.total_accounts || 20}`,
      subLabel: `Tạm dừng: ${stats.paused_accounts || 0} tài khoản`,
      badgeText: 'OAuth 60 ngày',
      badgeClasses: 'text-[#28805e] bg-[#eaf5ef]',
      dotColor: 'bg-[#28805e]',
    },
    {
      key: 'needs_reauth',
      label: 'Cần kết nối lại OAuth',
      valueDisplay: String(stats.needs_reauth_accounts),
      subLabel:
        stats.needs_reauth_accounts > 0
          ? 'Cần cấp lại quyền Threads Tester'
          : '100% token hợp lệ',
      badgeText: stats.needs_reauth_accounts > 0 ? 'Cần xử lý' : 'An toàn',
      badgeClasses:
        stats.needs_reauth_accounts > 0
          ? 'text-[#b77a21] bg-[#faf3e7]'
          : 'text-[#28805e] bg-[#eaf5ef]',
      dotColor: stats.needs_reauth_accounts > 0 ? 'bg-[#b77a21]' : 'bg-[#28805e]',
    },
    {
      key: 'scheduled_today',
      label: 'Đã lên lịch hôm nay',
      valueDisplay: String(stats.scheduled_today),
      subLabel: 'Rải lịch tự động + Random Jitter',
      badgeText: 'Hàng đợi',
      badgeClasses: 'text-[#4778a4] bg-[#edf4f8]',
      dotColor: 'bg-[#4778a4]',
    },
    {
      key: 'published_today',
      label: 'Đã đăng hôm nay',
      valueDisplay: String(stats.published_today),
      subLabel: 'Quy trình 2 bước Container API',
      badgeText: 'Đã xuất bản',
      badgeClasses: 'text-[#28805e] bg-[#eaf5ef]',
      dotColor: 'bg-[#28805e]',
    },
    {
      key: 'failed_posts',
      label: 'Bài lỗi cần xử lý',
      valueDisplay: String(stats.failed_posts),
      subLabel:
        stats.failed_posts > 0
          ? 'Đã cảnh báo qua Telegram Bot'
          : 'Không có bài lỗi tồn đọng',
      badgeText: stats.failed_posts > 0 ? 'Cảnh báo' : 'Ổn định',
      badgeClasses:
        stats.failed_posts > 0
          ? 'text-[#bc5b52] bg-[#fbefed]'
          : 'text-[#77847e] bg-[#f0f3f1]',
      dotColor: stats.failed_posts > 0 ? 'bg-[#bc5b52]' : 'bg-[#77847e]',
    },
    {
      key: 'sponsored_posts',
      label: 'Bài hợp tác trả phí',
      valueDisplay: String(stats.sponsored_posts_count),
      subLabel: 'Theo dõi chiến dịch & đối tác',
      badgeText: 'Sponsored',
      badgeClasses: 'text-[#7e729c] bg-[#f2eff8]',
      dotColor: 'bg-[#7e729c]',
    },
  ];

  return (
    <section
      aria-label="Chỉ số tổng quan hệ thống 20 tài khoản Threads"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3"
    >
      {cards.map((card) => (
        <button
          key={card.key}
          type="button"
          onClick={() => onSelectFilter?.(card.key)}
          data-testid={`threads-kpi-${card.key}`}
          className="text-left bg-[#ffffff] border border-[#e9eeeb] rounded-[10px] p-3.5 transition-colors hover:border-[#176b51] focus:outline-none focus:ring-2 focus:ring-[#176b51]/20"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] font-semibold text-[#81908a] uppercase tracking-[0.6px] truncate">
              {card.label}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[20px] text-[10px] font-semibold shrink-0 ${card.badgeClasses}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${card.dotColor}`} />
              {card.badgeText}
            </span>
          </div>

          <div className="font-heading text-[24px] font-bold tracking-[-0.8px] text-[#17231f] leading-tight">
            {loading ? '...' : card.valueDisplay}
          </div>

          <p className="mt-1.5 text-[11px] text-[#81908a] truncate">{card.subLabel}</p>
        </button>
      ))}
    </section>
  );
};

export default ThreadsStatsHeader;
