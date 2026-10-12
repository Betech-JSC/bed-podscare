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

export const StaffPerformanceWidget: React.FC<StaffPerformanceWidgetProps> = ({
  branchId,
  selectedDate,
  period,
  userRole,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('technicians');

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
                KHU VỰC D · HIỆU SUẤT NHÂN SỰ
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#edf5f0] text-[#176b58] border border-[#d0e5d9]">
                {technicians.length + cskhStaff.length} nhân sự hoạt động
              </span>
            </div>
            <h3 className="font-heading font-bold text-lg text-[#1c302b] m-0">
              Bảng theo dõi năng suất & chất lượng
            </h3>
            <p className="text-xs text-[#7e8d85] mt-0.5 mb-0">
              Đo lường khối lượng đơn tiếp nhận, tỷ lệ hoàn tất sửa chữa, tiêu chuẩn QC và doanh thu theo vai trò.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon="rotate"
              disabled={isFetching}
              onClick={() => refetch()}
              className="text-xs"
            >
              {isFetching ? 'Đang tải...' : 'Làm mới'}
            </Button>
          </div>
        </div>

        {/* Cụm tóm tắt chỉ số nhanh (Summary Pill Stats) */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4 p-3 bg-[#fafbfa] rounded-[10px] border border-[#eff3f1]">
            <div>
              <span className="text-[11px] text-[#7d8d85] block">Đơn hoàn tất toàn hệ thống:</span>
              <span className="font-heading font-bold text-sm text-[#1c302b]">
                {summary.total_completed ?? summary.completed ?? 0} đơn
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
            <div>
              <span className="text-[11px] text-[#7d8d85] block">Đơn sửa lại (Rework):</span>
              <span className="font-heading font-bold text-sm text-[#bc5b52]">
                {summary.total_rework ?? summary.rework_needed ?? 0} đơn
              </span>
            </div>
          </div>
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
              {technicians.length}
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
              {cskhStaff.length}
            </span>
          </button>
        </div>

        {/* Bảng dữ liệu */}
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-xs text-[#809088]">
            <span className="w-5 h-5 rounded-full border-2 border-[#176b58] border-t-transparent animate-spin mb-2" />
            <span>Đang tải số liệu hiệu suất nhân sự...</span>
          </div>
        ) : isError ? (
          <div className="py-8 text-center text-xs text-[#bc5b52] bg-[#fbefed] rounded-[10px] border border-[#f5c7c2]">
            Không thể tải dữ liệu KPI nhân sự. Vui lòng bấm &ldquo;Làm mới&rdquo; để thử lại.
          </div>
        ) : activeTab === 'technicians' ? (
          /* TAB 1: KỸ THUẬT VIÊN */
          technicians.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#7e8d85] bg-[#fafbfa] rounded-[10px] border border-[#f0f3f1]">
              Chưa có dữ liệu phân công kỹ thuật viên trong khoảng thời gian này.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5 sm:mx-0">
              <table className="w-full text-left border-collapse min-w-[680px]">
                <thead>
                  <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#809088] uppercase tracking-wider h-9">
                    <th className="px-4">Kỹ thuật viên</th>
                    <th className="px-3 text-center">Đơn phụ trách</th>
                    <th className="px-3 text-center">Đã sửa xong</th>
                    <th className="px-3 text-center">Tỷ lệ QC</th>
                    <th className="px-3 text-center">Xử lý TB</th>
                    <th className="px-4 text-right">Doanh thu tạo ra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f2] text-xs">
                  {technicians.map((tech, idx) => {
                    const formattedRev = moneyFormatted(tech.revenue_generated, tech.revenue_generated_formatted);
                    const qcRate = tech.qc_pass_rate;

                    return (
                      <tr key={tech.id || idx} className="h-13 hover:bg-[#fafcfa] transition-colors">
                        <td className="px-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar initials={tech.name} variant={(idx % 4) as any} size="sm" />
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
          cskhStaff.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#7e8d85] bg-[#fafbfa] rounded-[10px] border border-[#f0f3f1]">
              Chưa có dữ liệu tiếp nhận của nhân sự CSKH trong khoảng thời gian này.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5 sm:mx-0">
              <table className="w-full text-left border-collapse min-w-[680px]">
                <thead>
                  <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#809088] uppercase tracking-wider h-9">
                    <th className="px-4">Nhân sự CSKH</th>
                    <th className="px-3 text-center">Đơn tiếp nhận</th>
                    <th className="px-3 text-center">Đã hoàn tất</th>
                    <th className="px-3 text-center">Tỷ lệ chốt</th>
                    <th className="px-3 text-center">Hiệu suất</th>
                    <th className="px-4 text-right">Doanh thu tiếp nhận</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f2] text-xs">
                  {cskhStaff.map((staff, idx) => {
                    const formattedRev = moneyFormatted(staff.revenue_generated, staff.revenue_generated_formatted);
                    const convRate = staff.conversion_rate;

                    return (
                      <tr key={staff.id || idx} className="h-13 hover:bg-[#fafcfa] transition-colors">
                        <td className="px-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar initials={staff.name} variant={(idx % 4) as any} size="sm" />
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

      {/* Footer Info */}
      <div className="pt-3 mt-3 border-t border-[#f0f3f1] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#809088]">
        <div className="flex items-center gap-1.5">
          <Icon name="shield" size={13} className="text-[#176b58]" />
          <span>Chính sách bảo mật Zero-Trust: Doanh thu nhân sự được mã hóa theo vai trò đăng nhập.</span>
        </div>
        <div>
          <span>Cập nhật theo dữ liệu đơn hàng hoàn tất thực tế</span>
        </div>
      </div>
    </div>
  );
};
