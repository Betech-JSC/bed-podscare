'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button, Icon, StatusTag } from '@podscare/ui';
import { kpiService } from '@podscare/api-client';
import type { TechnicianKpiItem, CskhKpiItem, StaffPerformanceData } from '@podscare/types';

export interface StaffPerformanceWidgetProps {
  branchId?: string | number;
  selectedDate?: string;
  period?: string;
  userRole?: string;
  className?: string;
}

type TabKey = 'technicians' | 'cskh';
type SortDirection = 'asc' | 'desc';
type TechSortKey =
  | 'name'
  | 'total_orders'
  | 'completed'
  | 'warranty_rate'
  | 'qc_pass_rate'
  | 'avg_processing_time_minutes'
  | 'revenue_generated';
type CskhSortKey =
  | 'name'
  | 'orders_created_count'
  | 'orders_completed_count'
  | 'conversion_rate'
  | 'efficiency'
  | 'revenue_generated';

export const StaffPerformanceWidget: React.FC<StaffPerformanceWidgetProps> = ({
  branchId,
  selectedDate,
  period,
  userRole,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('technicians');
  const [techSortKey, setTechSortKey] = useState<TechSortKey>('completed');
  const [techSortDir, setTechSortDir] = useState<SortDirection>('desc');
  const [cskhSortKey, setCskhSortKey] = useState<CskhSortKey>('orders_created_count');
  const [cskhSortDir, setCskhSortDir] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<5 | 8>(5);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, branchId, selectedDate, period, pageSize]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['staff-kpi', branchId, selectedDate, period],
    queryFn: async () => {
      const res = await kpiService.getStaffKpi({
        branch_id: branchId && branchId !== 'all' ? branchId : undefined,
        date: selectedDate,
        period: period,
        role: 'all',
      });
      return (res?.data || res) as StaffPerformanceData;
    },
  });

  const technicians: TechnicianKpiItem[] = useMemo(() => {
    if (data?.technicians && Array.isArray(data.technicians)) {
      return data.technicians;
    }
    if (data?.staff && Array.isArray(data.staff)) {
      return data.staff.filter((s): s is TechnicianKpiItem => s.role !== 'CSKH' && s.user_role !== 'cskh');
    }
    return [];
  }, [data]);

  const cskhStaff: CskhKpiItem[] = useMemo(() => {
    if (data?.cskh && Array.isArray(data.cskh)) {
      return data.cskh;
    }
    if (data?.staff && Array.isArray(data.staff)) {
      return data.staff.filter(
        (s): s is CskhKpiItem => s.role === 'CSKH' || s.user_role === 'cskh'
      );
    }
    return [];
  }, [data]);

  const getTechWarrantyRate = (tech: TechnicianKpiItem): number => {
    if (tech.warranty_rate !== undefined && tech.warranty_rate !== null) {
      return Number(tech.warranty_rate);
    }
    const completed = Number(tech.completed) || 0;
    const rework = Number(tech.warranty_count ?? tech.rework_needed) || 0;
    return completed > 0 ? Math.round((rework / completed) * 1000) / 10 : 0;
  };

  const handleTechSort = (key: TechSortKey) => {
    if (techSortKey === key) {
      setTechSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setTechSortKey(key);
      setTechSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const handleCskhSort = (key: CskhSortKey) => {
    if (cskhSortKey === key) {
      setCskhSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setCskhSortKey(key);
      setCskhSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const sortedTechnicians = useMemo(() => {
    const list = [...technicians];
    list.sort((a, b) => {
      if (techSortKey === 'name') {
        const cmp = (a.name || '').localeCompare(b.name || '', 'vi');
        return techSortDir === 'asc' ? cmp : -cmp;
      }
      const getVal = (item: TechnicianKpiItem): number => {
        switch (techSortKey) {
          case 'total_orders':
            return Number(item.total_orders ?? 0);
          case 'completed':
            return Number(item.completed ?? 0);
          case 'warranty_rate':
            return getTechWarrantyRate(item);
          case 'qc_pass_rate':
            return item.qc_pass_rate !== null && item.qc_pass_rate !== undefined
              ? Number(item.qc_pass_rate)
              : -1;
          case 'avg_processing_time_minutes':
            return item.avg_processing_time_minutes !== null &&
              item.avg_processing_time_minutes !== undefined
              ? Number(item.avg_processing_time_minutes)
              : -1;
          case 'revenue_generated':
            return item.revenue_generated !== null && item.revenue_generated !== undefined
              ? Number(item.revenue_generated)
              : -1;
          default:
            return 0;
        }
      };
      const valA = getVal(a);
      const valB = getVal(b);
      return techSortDir === 'asc' ? valA - valB : valB - valA;
    });
    return list;
  }, [technicians, techSortKey, techSortDir]);

  const sortedCskhStaff = useMemo(() => {
    const list = [...cskhStaff];
    list.sort((a, b) => {
      if (cskhSortKey === 'name') {
        const cmp = (a.name || '').localeCompare(b.name || '', 'vi');
        return cskhSortDir === 'asc' ? cmp : -cmp;
      }
      const getVal = (item: CskhKpiItem): number => {
        switch (cskhSortKey) {
          case 'orders_created_count':
            return Number(item.orders_created_count ?? 0);
          case 'orders_completed_count':
            return Number(item.orders_completed_count ?? 0);
          case 'conversion_rate':
          case 'efficiency':
            return Number(item.conversion_rate ?? 0);
          case 'revenue_generated':
            return item.revenue_generated !== null && item.revenue_generated !== undefined
              ? Number(item.revenue_generated)
              : -1;
          default:
            return 0;
        }
      };
      const valA = getVal(a);
      const valB = getVal(b);
      return cskhSortDir === 'asc' ? valA - valB : valB - valA;
    });
    return list;
  }, [cskhStaff, cskhSortKey, cskhSortDir]);

  const activeListLength =
    activeTab === 'technicians' ? sortedTechnicians.length : sortedCskhStaff.length;
  const totalPages = Math.max(1, Math.ceil(activeListLength / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedTechnicians = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedTechnicians.slice(start, start + pageSize);
  }, [sortedTechnicians, safePage, pageSize]);

  const paginatedCskhStaff = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedCskhStaff.slice(start, start + pageSize);
  }, [sortedCskhStaff, safePage, pageSize]);

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

  const isStaffLoading = isLoading || isFetching;
  const summary = data?.summary;

  const canViewRevenue = useMemo(() => {
    const role = (userRole || '').toLowerCase();
    return ['admin', 'super_admin', 'manager'].includes(role);
  }, [userRole]);

  const moneyFormatted = (val?: number | null, formattedStr?: string | null) => {
    if (!canViewRevenue || val === null || val === undefined) {
      return null;
    }
    if (formattedStr) return formattedStr;
    return new Intl.NumberFormat('vi-VN').format(val) + ' ₫';
  };

  return (
    <div className={`bg-white rounded-[14px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs flex flex-col justify-between ${className}`}>
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-[#176b58]" />
              <span className="text-xs font-bold text-[#819089] uppercase tracking-[1px]">
                HIỆU SUẤT NHÂN SỰ
              </span>
              {isStaffLoading ? (
                <span
                  data-testid="staff-kpi-loading-skeleton"
                  className="inline-block h-5 w-32 rounded-full bg-[#edf4f0] border border-[#d0e5d9] animate-pulse"
                />
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#edf5f0] text-[#176b58] border border-[#d0e5d9]">
                  {technicians.length + cskhStaff.length} nhân sự hoạt động
                </span>
              )}
            </div>
            <h3 className="font-heading font-bold text-lg text-[#1c302b] m-0">
              Bảng theo dõi năng suất & chất lượng
            </h3>
            <p className="text-xs text-[#7e8d85] mt-0.5 mb-0">
              Đo lường khối lượng đơn tiếp nhận, tỷ lệ bảo hành, tiêu chuẩn QC và doanh thu theo vai trò.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon="rotate"
              disabled={isStaffLoading}
              onClick={() => refetch()}
              className="text-xs"
            >
              {isStaffLoading ? 'Đang tải...' : 'Làm mới'}
            </Button>
          </div>
        </div>

        {/* Cụm tóm tắt chỉ số nhanh (Summary Pill Stats) */}
        {isStaffLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4 p-3 bg-[#fafbfa] rounded-[10px] border border-[#eff3f1] animate-pulse">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="h-3 w-28 rounded bg-[#e5ece8]" />
                <div className="h-4 w-16 rounded bg-[#edf4f0]" />
              </div>
            ))}
          </div>
        ) : (
          summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4 p-3 bg-[#fafbfa] rounded-[10px] border border-[#eff3f1]">
              <div>
                <span className="text-[11px] text-[#7d8d85] block">Đơn hoàn tất toàn hệ thống:</span>
                <span className="font-heading font-bold text-sm text-[#1c302b]">
                  {summary.total_completed ?? summary.completed ?? 0} đơn
                </span>
              </div>
              <div>
                <span className="text-[11px] text-[#7d8d85] block">Tỷ lệ bảo hành:</span>
                <span className="font-heading font-bold text-sm text-[#bc5b52]">
                  {summary.warranty_rate_formatted ||
                    `${summary.warranty_rate ?? 0}%`}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-[#7d8d85] block">Tỷ lệ QC đạt chuẩn:</span>
                <span className="font-heading font-bold text-sm text-[#176b58]">
                  {summary.qc_pass_rate !== null && summary.qc_pass_rate !== undefined ? `${summary.qc_pass_rate}%` : '—'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-[#7d8d85] block">Thời gian xử lý TB:</span>
                <span className="font-heading font-bold text-sm text-[#2d3d35]">
                  {summary.avg_processing_time_formatted || '—'}
                </span>
              </div>
            </div>
          )
        )}

        {/* Tab Switcher: Kỹ thuật viên vs CSKH */}
        <div className="flex items-center gap-2 border-b border-[#f0f3f1] pb-3 mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('technicians')}
            className={`px-3.5 py-1.5 rounded-[8px] text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'technicians'
                ? 'bg-[#176b58] text-white shadow-xs'
                : 'bg-white text-[#566861] border border-[#d9e3dd] hover:bg-[#f2f6f4]'
            }`}
          >
            <span>Kỹ thuật viên</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'technicians' ? 'bg-white/20 text-white' : 'bg-[#eef3f0] text-[#176b58]'
              }`}
            >
              {isStaffLoading ? (
                <span className="inline-block w-3 h-2.5 rounded bg-current/30 animate-pulse align-middle" />
              ) : (
                technicians.length
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cskh')}
            className={`px-3.5 py-1.5 rounded-[8px] text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'cskh'
                ? 'bg-[#176b58] text-white shadow-xs'
                : 'bg-white text-[#566861] border border-[#d9e3dd] hover:bg-[#f2f6f4]'
            }`}
          >
            <span>CSKH / Tiếp nhận</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'cskh' ? 'bg-white/20 text-white' : 'bg-[#eef3f0] text-[#176b58]'
              }`}
            >
              {isStaffLoading ? (
                <span className="inline-block w-3 h-2.5 rounded bg-current/30 animate-pulse align-middle" />
              ) : (
                cskhStaff.length
              )}
            </span>
          </button>
        </div>

        {/* Bảng dữ liệu */}
        {isStaffLoading ? (
          <div
            data-testid="staff-performance-loading-skeleton"
            className="space-y-2.5 py-2 animate-pulse"
          >
            {[1, 2, 3, 4].map((idx) => (
              <div
                key={idx}
                data-testid="staff-kpi-loading-skeleton"
                className="flex items-center justify-between gap-4 p-3 rounded-[10px] border border-[#edf2ef] bg-[#fafbfa]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#e5ece8] shrink-0" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-32 rounded bg-[#e5ece8]" />
                    <div className="h-2.5 w-20 rounded bg-[#edf4f0]" />
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-6">
                  <div className="h-4 w-12 rounded bg-[#e5ece8]" />
                  <div className="h-4 w-12 rounded bg-[#edf4f0]" />
                  <div className="h-5 w-16 rounded-full bg-[#e5ece8]" />
                  <div className="h-4 w-20 rounded bg-[#edf4f0]" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="py-8 text-center text-xs text-[#bc5b52] bg-[#fbefed] rounded-[10px] border border-[#f5c7c2]">
            Không thể tải dữ liệu KPI nhân sự. Vui lòng bấm &ldquo;Làm mới&rdquo; để thử lại.
          </div>
        ) : activeTab === 'technicians' ? (
          /* TAB 1: KỸ THUẬT VIÊN */
          sortedTechnicians.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#7e8d85] bg-[#fafbfa] rounded-[10px] border border-[#f0f3f1]">
              Chưa có dữ liệu phân công kỹ thuật viên trong khoảng thời gian này.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5 sm:mx-0">
              <table className="w-full text-left border-collapse min-w-[740px]">
                <thead>
                  <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#809088] uppercase tracking-wider h-9">
                    <th
                      data-testid="sort-tech-name"
                      onClick={() => handleTechSort('name')}
                      className="px-4 cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Kỹ thuật viên</span>
                      {renderSortIcon(techSortKey === 'name', techSortDir)}
                    </th>
                    <th
                      data-testid="sort-tech-total_orders"
                      onClick={() => handleTechSort('total_orders')}
                      className="px-3 text-center cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Đơn phụ trách</span>
                      {renderSortIcon(techSortKey === 'total_orders', techSortDir)}
                    </th>
                    <th
                      data-testid="sort-tech-completed"
                      onClick={() => handleTechSort('completed')}
                      className="px-3 text-center cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Đã sửa xong</span>
                      {renderSortIcon(techSortKey === 'completed', techSortDir)}
                    </th>
                    <th
                      data-testid="sort-tech-warranty_rate"
                      onClick={() => handleTechSort('warranty_rate')}
                      className="px-3 text-center cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Tỷ lệ bảo hành</span>
                      {renderSortIcon(techSortKey === 'warranty_rate', techSortDir)}
                    </th>
                    <th
                      data-testid="sort-tech-qc_pass_rate"
                      onClick={() => handleTechSort('qc_pass_rate')}
                      className="px-3 text-center cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Tỷ lệ QC</span>
                      {renderSortIcon(techSortKey === 'qc_pass_rate', techSortDir)}
                    </th>
                    <th
                      data-testid="sort-tech-avg_processing_time_minutes"
                      onClick={() => handleTechSort('avg_processing_time_minutes')}
                      className="px-3 text-center cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Xử lý TB</span>
                      {renderSortIcon(techSortKey === 'avg_processing_time_minutes', techSortDir)}
                    </th>
                    <th
                      data-testid="sort-tech-revenue_generated"
                      onClick={() => handleTechSort('revenue_generated')}
                      className="px-4 text-right cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Doanh thu tạo ra</span>
                      {renderSortIcon(techSortKey === 'revenue_generated', techSortDir)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f2] text-xs">
                  {paginatedTechnicians.map((tech, idx) => {
                    const formattedRev = moneyFormatted(tech.revenue_generated, tech.revenue_generated_formatted);
                    const qcRate = tech.qc_pass_rate;
                    const warrantyRate = getTechWarrantyRate(tech);
                    const globalIdx = (safePage - 1) * pageSize + idx;

                    return (
                      <tr key={tech.id || globalIdx} className="h-12 hover:bg-[#fafcfa] transition-colors">
                        <td className="px-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar initials={tech.name} variant={(globalIdx % 4) as any} size="sm" />
                            <div>
                              <div className="font-bold text-[#1c302b]">{tech.name}</div>
                              <div className="text-[11px] text-[#7e8d85] flex items-center gap-1.5">
                                <span>{tech.branch_name || 'Chi nhánh'}</span>
                                {tech.rework_needed > 0 && (
                                  <span className="text-[#bc5b52] font-semibold">
                                    · {tech.rework_needed} đơn sửa lại
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-3 text-center">
                          <span className="font-heading font-bold text-sm text-[#1c302b]">
                            {tech.total_orders}
                          </span>
                          <span className="text-[10px] text-[#7e8d85] block">
                            {tech.in_repair ? `${tech.in_repair} đang làm` : 'đơn'}
                          </span>
                        </td>

                        <td className="px-3 text-center">
                          <span className="font-heading font-bold text-sm text-[#176b58]">
                            {tech.completed}
                          </span>
                          <span className="text-[10px] text-[#7e8d85] block">hoàn tất</span>
                        </td>

                        <td className="px-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[11px] ${
                              warrantyRate === 0
                                ? 'bg-[#eaf5ef] text-[#28805e]'
                                : warrantyRate <= 5
                                ? 'bg-[#faf3e7] text-[#b77a21]'
                                : 'bg-[#fbefed] text-[#bc5b52]'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {tech.warranty_rate_formatted || `${warrantyRate}%`}
                          </span>
                        </td>

                        <td className="px-3 text-center">
                          {qcRate !== null && qcRate !== undefined ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[11px] ${
                                qcRate >= 95
                                  ? 'bg-[#eaf5ef] text-[#28805e]'
                                  : qcRate >= 80
                                  ? 'bg-[#faf3e7] text-[#b77a21]'
                                  : 'bg-[#fbefed] text-[#bc5b52]'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              {qcRate}%
                            </span>
                          ) : (
                            <span className="text-[#81908a]">—</span>
                          )}
                          {tech.qc_total ? (
                            <span className="text-[10px] text-[#7e8d85] block mt-0.5">
                              {tech.qc_passed}/{tech.qc_total} lượt
                            </span>
                          ) : null}
                        </td>

                        <td className="px-3 text-center">
                          <span className="font-medium text-[#2d3d35]">
                            {tech.avg_processing_time_formatted || '—'}
                          </span>
                          <span className="text-[10px] text-[#7e8d85] block">/ máy</span>
                        </td>

                        <td className="px-4 text-right">
                          {formattedRev !== null ? (
                            <span className="font-heading font-bold text-sm text-[#176b58]">
                              {formattedRev}
                            </span>
                          ) : (
                            /* Zero-Trust RBAC Masking: Hiển thị mặt nạ bảo mật kèm icon lock */
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[6px] bg-[#f0f3f1] text-[#77847e] font-mono text-xs select-none"
                              title="Chỉ Quản lý mới có quyền xem doanh thu nhân sự"
                            >
                              <Icon name="lock" size={12} className="text-[#81908a]" />
                              <span>••••••</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* TAB 2: CSKH / TIẾP NHẬN */
          sortedCskhStaff.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#7e8d85] bg-[#fafbfa] rounded-[10px] border border-[#f0f3f1]">
              Chưa có dữ liệu tiếp nhận của nhân sự CSKH trong khoảng thời gian này.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5 sm:mx-0">
              <table className="w-full text-left border-collapse min-w-[680px]">
                <thead>
                  <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#809088] uppercase tracking-wider h-9">
                    <th
                      data-testid="sort-cskh-name"
                      onClick={() => handleCskhSort('name')}
                      className="px-4 cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Nhân sự CSKH</span>
                      {renderSortIcon(cskhSortKey === 'name', cskhSortDir)}
                    </th>
                    <th
                      data-testid="sort-cskh-orders_created_count"
                      onClick={() => handleCskhSort('orders_created_count')}
                      className="px-3 text-center cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Đơn tiếp nhận</span>
                      {renderSortIcon(cskhSortKey === 'orders_created_count', cskhSortDir)}
                    </th>
                    <th
                      data-testid="sort-cskh-orders_completed_count"
                      onClick={() => handleCskhSort('orders_completed_count')}
                      className="px-3 text-center cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Đã hoàn tất</span>
                      {renderSortIcon(cskhSortKey === 'orders_completed_count', cskhSortDir)}
                    </th>
                    <th
                      data-testid="sort-cskh-conversion_rate"
                      onClick={() => handleCskhSort('conversion_rate')}
                      className="px-3 text-center cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Tỷ lệ chốt</span>
                      {renderSortIcon(cskhSortKey === 'conversion_rate', cskhSortDir)}
                    </th>
                    <th
                      data-testid="sort-cskh-efficiency"
                      onClick={() => handleCskhSort('efficiency')}
                      className="px-3 text-center cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Hiệu suất</span>
                      {renderSortIcon(cskhSortKey === 'efficiency', cskhSortDir)}
                    </th>
                    <th
                      data-testid="sort-cskh-revenue_generated"
                      onClick={() => handleCskhSort('revenue_generated')}
                      className="px-4 text-right cursor-pointer select-none hover:text-[#176b58] transition-colors"
                    >
                      <span>Doanh thu tiếp nhận</span>
                      {renderSortIcon(cskhSortKey === 'revenue_generated', cskhSortDir)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f2] text-xs">
                  {paginatedCskhStaff.map((staff, idx) => {
                    const formattedRev = moneyFormatted(staff.revenue_generated, staff.revenue_generated_formatted);
                    const convRate = staff.conversion_rate;
                    const globalIdx = (safePage - 1) * pageSize + idx;

                    return (
                      <tr key={staff.id || globalIdx} className="h-12 hover:bg-[#fafcfa] transition-colors">
                        <td className="px-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar initials={staff.name} variant={(globalIdx % 4) as any} size="sm" />
                            <div>
                              <div className="font-bold text-[#1c302b]">{staff.name}</div>
                              <div className="text-[11px] text-[#7e8d85]">
                                {staff.branch_name || 'Chi nhánh quầy'}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-3 text-center">
                          <span className="font-heading font-bold text-sm text-[#1c302b]">
                            {staff.orders_created_count}
                          </span>
                          <span className="text-[10px] text-[#7e8d85] block">tiếp nhận</span>
                        </td>

                        <td className="px-3 text-center">
                          <span className="font-heading font-bold text-sm text-[#176b58]">
                            {staff.orders_completed_count}
                          </span>
                          <span className="text-[10px] text-[#7e8d85] block">bàn giao xong</span>
                        </td>

                        <td className="px-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[11px] bg-[#eaf5ef] text-[#28805e]">
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {staff.conversion_rate_formatted || `${convRate}%`}
                          </span>
                        </td>

                        <td className="px-3 text-center">
                          <StatusTag
                            label={convRate >= 70 ? 'Tích cực' : convRate >= 40 ? 'Đang xử lý' : 'Cần hỗ trợ'}
                            type={convRate >= 70 ? 'ready' : convRate >= 40 ? 'progress' : 'wait'}
                          />
                        </td>

                        <td className="px-4 text-right">
                          {formattedRev !== null ? (
                            <span className="font-heading font-bold text-sm text-[#176b58]">
                              {formattedRev}
                            </span>
                          ) : (
                            /* Zero-Trust RBAC Masking */
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[6px] bg-[#f0f3f1] text-[#77847e] font-mono text-xs select-none"
                              title="Chỉ Quản lý mới có quyền xem doanh thu nhân sự"
                            >
                              <Icon name="lock" size={12} className="text-[#81908a]" />
                              <span>••••••</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Compact Pagination + Footer Info */}
      <div className="pt-3 mt-3 border-t border-[#f0f3f1] flex flex-wrap items-center justify-between gap-2.5 text-[11px] text-[#809088]">
        <div className="flex items-center gap-2">
          <Icon name="shield" size={13} className="text-[#176b58]" />
          <span>
            {activeListLength > 0
              ? `Hiển thị ${(safePage - 1) * pageSize + 1}–${Math.min(
                  safePage * pageSize,
                  activeListLength
                )} / ${activeListLength} nhân sự`
              : 'Chính sách bảo mật Zero-Trust theo vai trò'}
          </span>
        </div>

        <div
          data-testid="staff-kpi-compact-pagination"
          className="flex items-center gap-2"
        >
          <div className="flex items-center gap-1 bg-[#f4f7f5] p-0.5 rounded-[7px] border border-[#e5ece8]">
            {([5, 8] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setPageSize(size)}
                className={`px-2 py-0.5 rounded-[5px] text-[11px] font-bold transition-colors cursor-pointer ${
                  pageSize === size
                    ? 'bg-[#176b58] text-white'
                    : 'text-[#5b6c64] hover:text-[#1c302b]'
                }`}
              >
                {size} dòng
              </button>
            ))}
          </div>

          <span className="font-semibold text-[#2d3d35] px-1">
            Trang {safePage}/{totalPages}
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-2 py-1 rounded-[6px] border border-[#d9e3dd] bg-white text-[#2d3d35] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f2f6f4] cursor-pointer"
            >
              Trước
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-2 py-1 rounded-[6px] border border-[#d9e3dd] bg-white text-[#2d3d35] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f2f6f4] cursor-pointer"
            >
              Sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
