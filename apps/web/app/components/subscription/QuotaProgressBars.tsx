'use client';

import React from 'react';
import { Icon } from '@podscare/ui';

export interface QuotaItem {
  used: number;
  limit: number | null;
  unlimited?: boolean;
  percentage: number;
}

export interface QuotaProgressBarsProps {
  branches?: QuotaItem;
  users?: QuotaItem;
  orders?: QuotaItem;
  className?: string;
}

export const QuotaProgressBars: React.FC<QuotaProgressBarsProps> = ({
  branches = { used: 0, limit: 1, percentage: 0 },
  users = { used: 0, limit: 2, percentage: 0 },
  orders = { used: 0, limit: 50, percentage: 0 },
  className = '',
}) => {
  const renderMetricCard = (
    label: string,
    iconName: string,
    metric: QuotaItem,
    unit: string,
    note: string
  ) => {
    const isUnlimited = metric.unlimited || metric.limit === null || metric.limit === -1;
    const pct = isUnlimited ? 100 : Math.min(100, Math.max(0, metric.percentage || 0));

    // Dynamic color coding based on threshold
    let barColor = 'bg-[#176b58]';
    let textColor = 'text-[#176b58]';
    let bgBadge = 'bg-[#eaf4ef] text-[#176b58] border-[#cce4d7]';

    if (!isUnlimited) {
      if (pct >= 100) {
        barColor = 'bg-[#bc5b52]';
        textColor = 'text-[#bc5b52]';
        bgBadge = 'bg-[#fbefed] text-[#bc5b52] border-[#f5c7c2]';
      } else if (pct >= 80) {
        barColor = 'bg-[#d49342]';
        textColor = 'text-[#b77a21]';
        bgBadge = 'bg-[#faf3e7] text-[#b77a21] border-[#f4dfc2]';
      }
    } else {
      barColor = 'bg-[#10b981]';
      textColor = 'text-[#059669]';
      bgBadge = 'bg-[#ecfdf5] text-[#059669] border-[#a7f3d0]';
    }

    return (
      <div className="bg-white rounded-[12px] border border-[#e5ece8] p-4 sm:p-5 shadow-xs flex flex-col justify-between hover:border-[#ccd9d1] transition-all">
        {/* Metric Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[8px] bg-[#f0f4f2] text-[#176b58] grid place-items-center flex-none">
              <Icon name={iconName} size={16} />
            </div>
            <div>
              <span className="text-xs font-bold text-[#1c302b] block">{label}</span>
              <span className="text-[11px] text-[#788880]">{note}</span>
            </div>
          </div>

          <span
            className={`px-2 py-0.5 rounded-[6px] border text-[11px] font-bold flex-none ${bgBadge}`}
          >
            {isUnlimited ? 'Vô hạn' : `${Math.round(pct)}%`}
          </span>
        </div>

        {/* Value Display */}
        <div className="flex items-baseline justify-between mb-2">
          <div className="flex items-baseline gap-1">
            <span className="font-heading font-extrabold text-2xl text-[#1c302b] tracking-tight">
              {metric.used}
            </span>
            <span className="text-xs text-[#718279]">
              / {isUnlimited ? '∞ Không giới hạn' : `${metric.limit} ${unit}`}
            </span>
          </div>

          {!isUnlimited && pct >= 80 && (
            <span className={`text-[11px] font-bold ${textColor}`}>
              {pct >= 100 ? 'Đã đạt giới hạn' : 'Sắp đạt hạn mức'}
            </span>
          )}
        </div>

        {/* Progress Bar Track */}
        <div className="w-full h-2 rounded-full bg-[#eef3f0] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-sm font-bold text-[#1c302b] uppercase tracking-[0.5px] m-0 flex items-center gap-2">
          <Icon name="kpi" size={16} className="text-[#176b58]" />
          Hạn mức sử dụng theo gói cước (Quotas)
        </h3>
        <span className="text-[11px] text-[#7a8a82]">Tự động cập nhật thời gian thực</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {renderMetricCard(
          'Số lượng Chi nhánh',
          'building',
          branches,
          'chi nhánh',
          'Điểm sửa chữa vật lý'
        )}
        {renderMetricCard(
          'Tài khoản Nhân sự',
          'customers',
          users,
          'nhân sự',
          'KTV, Tiếp tân, Quản lý'
        )}
        {renderMetricCard(
          'Đơn sửa chữa tháng',
          'repairs',
          orders,
          'đơn/tháng',
          'Tính trong tháng hiện tại'
        )}
      </div>
    </div>
  );
};
