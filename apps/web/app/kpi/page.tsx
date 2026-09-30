'use client';

import React, { useState, useEffect } from 'react';
import { kpiService, type StaffKpiItem } from '@podscare/api-client';
import { StatCard, Button, TableSkeleton, EmptyState } from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';

export default function KPIPage() {
  const { branchId } = usePodsCare();
  const [staff, setStaff] = useState<StaffKpiItem[]>([]);
  const [summary, setSummary] = useState({
    total_completed: 0,
    avg_repair_days: '—',
    customer_satisfaction: '—',
  });
  const [isLoading, setIsLoading] = useState(true);

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
        setSummary({
          total_completed: data.summary.total_completed ?? 0,
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
              Thống kê sản lượng sửa chữa, tỷ lệ QC đạt và điểm hài lòng của khách hàng.
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
            label="Đơn hoàn tất toàn hệ thống"
            value={String(summary.total_completed)}
            icon="check"
            foot="Dữ liệu tổng hợp theo chi nhánh"
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
            <TableSkeleton rows={5} cols={6} />
          ) : staff.length === 0 ? (
            <EmptyState
              title="Chưa có dữ liệu KPI"
              description="Hiện chưa có dữ liệu đánh giá hiệu suất nhân viên trong khoảng thời gian này."
              actionLabel="Làm mới dữ liệu"
              onAction={fetchKpi}
            />
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#9aa59f] uppercase tracking-wider h-9">
                    <th className="px-3">Nhân viên</th>
                    <th className="px-3">Vai trò</th>
                    <th className="px-3">Sản lượng</th>
                    <th className="px-3">Tỷ lệ QC đạt</th>
                    <th className="px-3">Đánh giá sao</th>
                    <th className="px-3 text-right">Tăng trưởng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f2] text-sm">
                  {staff.map((s) => (
                    <tr key={s.name} className="h-11 hover:bg-[#fafcfa]">
                      <td className="px-3 font-bold text-[#1c302b]">{s.name}</td>
                      <td className="px-3 text-[#708078]">{s.role}</td>
                      <td className="px-3 font-semibold text-[#176b58]">{s.count}</td>
                      <td className="px-3 font-mono">{s.qcPass}</td>
                      <td className="px-3 text-[#b77a21] font-bold">★ {s.rating}</td>
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
