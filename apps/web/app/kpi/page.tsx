'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { kpiService, type StaffKpiItem } from '@podscare/api-client';
import { StatCard, Button, TableSkeleton, EmptyState, Icon } from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';

type KpiSortKey = 'name' | 'role' | 'count' | 'warranty_rate' | 'qcPass' | 'rating' | 'trend';
type SortDirection = 'asc' | 'desc';

export default function KPIPage() {
  const { branchId } = usePodsCare();
  const [staff, setStaff] = useState<StaffKpiItem[]>([]);
  const [summary, setSummary] = useState({
    total_completed: 0,
    warranty_rate: 0,
    warranty_rate_formatted: '0%',
    avg_repair_days: '—',
    customer_satisfaction: '—',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<KpiSortKey>('count');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const fetchKpi = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await kpiService.getStaffKpi({
        branch_id: branchId === 'all' ? undefined : branchId,
      });
      const data = res?.data || res;
      if (data?.staff && Array.isArray(data.staff)) {
        setStaff(data.staff);
      } else {
        setStaff([]);
      }
      if (data?.summary) {
        const totalCompleted = data.summary.total_completed ?? data.summary.completed ?? 0;
        const totalRework = data.summary.warranty_count ?? data.summary.total_rework ?? data.summary.rework_needed ?? 0;
        const computedWarrantyRate =
          data.summary.warranty_rate !== undefined && data.summary.warranty_rate !== null
            ? Number(data.summary.warranty_rate)
            : totalCompleted > 0
            ? Math.round((totalRework / totalCompleted) * 1000) / 10
            : 0;
        setSummary({
          total_completed: totalCompleted,
          warranty_rate: computedWarrantyRate,
          warranty_rate_formatted:
            data.summary.warranty_rate_formatted || `${computedWarrantyRate}%`,
          avg_repair_days: data.summary.avg_repair_days ?? '—',
          customer_satisfaction: data.summary.customer_satisfaction ?? '—',
        });
      }
    } catch (err) {
      console.error('Error fetching KPI from backend:', err);
      setStaff([]);
    } finally {
      setIsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    fetchKpi();
  }, [fetchKpi]);

  const getStaffWarrantyRate = (s: StaffKpiItem): number => {
    if (s.warranty_rate !== undefined && s.warranty_rate !== null) {
      return Number(s.warranty_rate);
    }
    const completed = Number(s.completed) || 0;
    const rework = Number((s as any).warranty_count ?? (s as any).rework_needed) || 0;
    return completed > 0 ? Math.round((rework / completed) * 1000) / 10 : 0;
  };

  const handleSort = (key: KpiSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'role' ? 'asc' : 'desc');
    }
  };

  const sortedStaff = useMemo(() => {
    const list = [...staff];
    list.sort((a, b) => {
      if (sortKey === 'name' || sortKey === 'role') {
        const strA = String(a[sortKey] || '');
        const strB = String(b[sortKey] || '');
        const cmp = strA.localeCompare(strB, 'vi');
        return sortDir === 'asc' ? cmp : -cmp;
      }

      const getNumericVal = (item: StaffKpiItem): number => {
        switch (sortKey) {
          case 'count':
            return Number(item.total_orders ?? parseFloat(String(item.count || '0')) ?? 0);
          case 'warranty_rate':
            return getStaffWarrantyRate(item);
          case 'qcPass': {
            const rawRate = (item as any).qc_pass_rate;
            if (rawRate !== null && rawRate !== undefined) return Number(rawRate);
            const parsed = parseFloat(String(item.qcPass || '').replace('%', ''));
            return Number.isNaN(parsed) ? -1 : parsed;
          }
          case 'rating': {
            const parsed = parseFloat(String(item.rating || '0'));
            return Number.isNaN(parsed) ? -1 : parsed;
          }
          case 'trend': {
            const normalized = String(item.trend || '0')
              .replace('−', '-')
              .replace(/[^0-9.-]/g, '');
            const parsed = parseFloat(normalized);
            return Number.isNaN(parsed) ? 0 : parsed;
          }
          default:
            return 0;
        }
      };

      const valA = getNumericVal(a);
      const valB = getNumericVal(b);
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });
    return list;
  }, [staff, sortKey, sortDir]);

  const renderSortIcon = (active: boolean, dir: SortDirection) => {
    if (!active) {
      return <span className="ml-1 text-[10px] text-[#b4c2bb]">↕</span>;
    }
    return (
      <span className="ml-1 text-[10px] text-[#176b58]">
        {dir === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  return (
    <AppShell crumbName="Hiệu suất KPI">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1">
              PERFORMANCE
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Hiệu suất & Năng suất KPI
            </h1>
            <p className="text-sm text-[#85928c] mt-1 mb-0">
              Thống kê sản lượng sửa chữa, tỷ lệ bảo hành, tỷ lệ QC đạt và điểm hài lòng của khách hàng.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon="refresh"
            disabled={isLoading}
            onClick={fetchKpi}
          >
            {isLoading ? 'Đang tải...' : 'Làm mới'}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            label="Tỷ lệ bảo hành (%)"
            value={summary.warranty_rate_formatted || `${summary.warranty_rate}%`}
            icon="shield"
            foot={`Trên tổng ${summary.total_completed} đơn hoàn tất`}
            periodLabel=""
            trend="neutral"
          />
          <StatCard
            label="Thời gian sửa trung bình"
            value={summary.avg_repair_days}
            icon="clock"
            foot="Tính trên các đơn hoàn tất"
            periodLabel=""
            trend="neutral"
          />
          <StatCard
            label="Điểm hài lòng khách hàng"
            value={summary.customer_satisfaction}
            icon="star"
            foot="Đánh giá sau dịch vụ"
            periodLabel=""
            trend="neutral"
          />
        </div>

        <div className="bg-white rounded-[10px] border border-[#e5ece8] p-4 sm:p-5 shadow-xs">
          {isLoading ? (
            <TableSkeleton rows={5} cols={7} />
          ) : sortedStaff.length === 0 ? (
            <EmptyState
              title="Chưa có dữ liệu KPI"
              description="Hiện chưa có dữ liệu đánh giá hiệu suất nhân viên trong khoảng thời gian này."
              actionLabel="Làm mới dữ liệu"
              onAction={fetchKpi}
            />
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-left border-collapse min-w-[740px]">
                <thead>
                  <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#9aa59f] uppercase tracking-wider h-9">
                    <th
                      data-testid="kpi-sort-name"
                      onClick={() => handleSort('name')}
                      className="px-3 cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Nhân viên</span>
                      {renderSortIcon(sortKey === 'name', sortDir)}
                    </th>
                    <th
                      data-testid="kpi-sort-role"
                      onClick={() => handleSort('role')}
                      className="px-3 cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Vai trò</span>
                      {renderSortIcon(sortKey === 'role', sortDir)}
                    </th>
                    <th
                      data-testid="kpi-sort-count"
                      onClick={() => handleSort('count')}
                      className="px-3 cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Sản lượng</span>
                      {renderSortIcon(sortKey === 'count', sortDir)}
                    </th>
                    <th
                      data-testid="kpi-sort-warranty_rate"
                      onClick={() => handleSort('warranty_rate')}
                      className="px-3 cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Tỷ lệ bảo hành</span>
                      {renderSortIcon(sortKey === 'warranty_rate', sortDir)}
                    </th>
                    <th
                      data-testid="kpi-sort-qcPass"
                      onClick={() => handleSort('qcPass')}
                      className="px-3 cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Tỷ lệ QC đạt</span>
                      {renderSortIcon(sortKey === 'qcPass', sortDir)}
                    </th>
                    <th
                      data-testid="kpi-sort-rating"
                      onClick={() => handleSort('rating')}
                      className="px-3 cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Đánh giá sao</span>
                      {renderSortIcon(sortKey === 'rating', sortDir)}
                    </th>
                    <th
                      data-testid="kpi-sort-trend"
                      onClick={() => handleSort('trend')}
                      className="px-3 text-right cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Tăng trưởng</span>
                      {renderSortIcon(sortKey === 'trend', sortDir)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f2] text-sm">
                  {sortedStaff.map((s) => {
                    const warrantyRate = getStaffWarrantyRate(s);
                    return (
                      <tr key={s.id || s.name} className="h-11 hover:bg-[#fafcfa]">
                        <td className="px-3 font-bold text-[#1c302b]">{s.name}</td>
                        <td className="px-3 text-[#708078]">{s.role}</td>
                        <td className="px-3 font-semibold text-[#176b58]">{s.count}</td>
                        <td className="px-3 font-mono font-semibold text-[#bc5b52]">
                          {s.warranty_rate_formatted || `${warrantyRate}%`}
                        </td>
                        <td className="px-3 font-mono">{s.qcPass}</td>
                        <td className="px-3 text-[#b77a21] font-bold">
                          <div className="flex items-center gap-1">
                            <Icon name="star" size={14} className="text-[#b77a21]" />
                            <span>{s.rating}</span>
                          </div>
                        </td>
                        <td className="px-3 text-right">
                          <span
                            className={`font-bold ${
                              s.trend && s.trend.includes('−') ? 'text-[#bd7650]' : 'text-[#368361]'
                            }`}
                          >
                            {s.trend}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
