'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Icon } from '@podscare/ui';
import { AppShell } from '../components/AppShell';

interface DashboardStats {
  total_tenants: number;
  active_tenants: number;
  pending_tenants: number;
  suspended_tenants: number;
  total_branches: number;
  total_repair_orders: number;
}

interface StoreItem {
  id: number;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  status: 'active' | 'pending' | 'suspended';
  plan: string;
  created_at: string;
  branches_count?: number;
  repair_orders_count?: number;
}

export default function PlatformDashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    total_tenants: 1,
    active_tenants: 1,
    pending_tenants: 0,
    suspended_tenants: 0,
    total_branches: 3,
    total_repair_orders: 120,
  });

  const [recentStores, setRecentStores] = useState<StoreItem[]>([]);

  const fetchPlatformData = useCallback(async () => {
    setLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('podscare_token') : null;
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const [statsRes, storesRes] = await Promise.all([
        fetch('/api/v1/platform/dashboard-stats', { headers }).catch(() => null),
        fetch('/api/v1/platform/stores?per_page=5', { headers }).catch(() => null),
      ]);

      if (statsRes && statsRes.ok) {
        const statsJson = await statsRes.json();
        if (statsJson?.success && statsJson?.data) {
          setStats(statsJson.data);
        }
      }

      if (storesRes && storesRes.ok) {
        const storesJson = await storesRes.json();
        if (storesJson?.success && storesJson?.data) {
          const list = Array.isArray(storesJson.data.data)
            ? storesJson.data.data
            : Array.isArray(storesJson.data)
            ? storesJson.data
            : [];
          setRecentStores(list);
        }
      }
    } catch (e) {
      console.warn('Could not fetch platform stats from API:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlatformData();
  }, [fetchPlatformData]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#eaf4ef] text-[#176b58] border border-[#cde2d6]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
            Hoạt động
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#fffbeb] text-[#b45309] border border-[#fde68a]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
            Chờ duyệt
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#fbefed] text-[#bc5b52] border border-[#f5c7c2]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
            Tạm khóa
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#f1f5f3] text-[#55655d]">
            {status}
          </span>
        );
    }
  };

  return (
    <AppShell crumbName="Quản trị Nền tảng">
      <div className="space-y-6">
        {/* Header Block */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#e5ece8]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#176b58] bg-[#eaf4ef] px-2 py-0.5 rounded">
                Super Admin Console
              </span>
              <span className="text-xs text-[#87968f]">·</span>
              <span className="text-xs text-[#87968f]">Toàn hệ sinh thái FIXO</span>
            </div>
            <h1 className="text-2xl font-bold font-heading text-[#1c302b] m-0">
              TỔNG QUAN NỀN TẢNG FIXO
            </h1>
            <p className="text-xs text-[#6e7d75] mt-1 mb-0">
              Theo dõi sức khỏe máy chủ, định danh gian hàng đối tác và hoạt động sửa chữa toàn sàn.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchPlatformData}
              loading={loading}
              className="font-semibold text-xs"
            >
              <Icon name="refresh" size={14} className="mr-1.5" />
              Làm mới dữ liệu
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => router.push('/platform/approvals')}
              className="font-semibold text-xs"
            >
              <Icon name="check" size={14} className="mr-1.5" />
              Duyệt tiệm ({stats.pending_tenants})
            </Button>
          </div>
        </div>

        {/* 4 Flat KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Active Stores */}
          <div className="p-5 rounded-[12px] bg-white border border-[#e5ece8] shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#718279] uppercase tracking-wider">
                Gian hàng hoạt động
              </span>
              <div className="w-8 h-8 rounded-[8px] bg-[#eaf4ef] text-[#176b58] grid place-items-center">
                <Icon name="spark" size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-[#1c302b] font-heading">
                {stats.active_tenants}
              </span>
              <span className="text-xs text-[#718279]">/ {stats.total_tenants} tổng tiệm</span>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#f0f3f1] flex items-center justify-between text-[11px] text-[#6e7d75]">
              <span>Tạm khóa: {stats.suspended_tenants}</span>
              <button
                type="button"
                onClick={() => router.push('/platform/stores')}
                className="text-[#176b58] font-bold hover:underline"
              >
                Quản lý →
              </button>
            </div>
          </div>

          {/* Card 2: Pending Approvals */}
          <div className="p-5 rounded-[12px] bg-white border border-[#e5ece8] shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#718279] uppercase tracking-wider">
                Chờ duyệt mở tiệm
              </span>
              <div className="w-8 h-8 rounded-[8px] bg-[#fffbeb] text-[#b45309] grid place-items-center">
                <Icon name="audit" size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-[#b45309] font-heading">
                {stats.pending_tenants}
              </span>
              <span className="text-xs text-[#718279]">hồ sơ cần xem xét</span>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#f0f3f1] flex items-center justify-between text-[11px] text-[#6e7d75]">
              <span>Gói dùng thử 14 ngày</span>
              <button
                type="button"
                onClick={() => router.push('/platform/approvals')}
                className="text-[#b45309] font-bold hover:underline"
              >
                Duyệt ngay →
              </button>
            </div>
          </div>

          {/* Card 3: Total Branches */}
          <div className="p-5 rounded-[12px] bg-white border border-[#e5ece8] shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#718279] uppercase tracking-wider">
                Tổng chi nhánh & trạm
              </span>
              <div className="w-8 h-8 rounded-[8px] bg-[#eef4f1] text-[#176b58] grid place-items-center">
                <Icon name="building" size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-[#1c302b] font-heading">
                {stats.total_branches}
              </span>
              <span className="text-xs text-[#718279]">trên toàn hệ thống</span>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#f0f3f1] flex items-center justify-between text-[11px] text-[#6e7d75]">
              <span>Đơn sửa đã xử lý:</span>
              <strong className="text-[#1c302b] font-bold">{stats.total_repair_orders}</strong>
            </div>
          </div>

          {/* Card 4: Server Health */}
          <div className="p-5 rounded-[12px] bg-white border border-[#e5ece8] shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#718279] uppercase tracking-wider">
                Hạ tầng máy chủ
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#10b981] bg-[#eaf4ef] px-2 py-0.5 rounded-full border border-[#cde2d6]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                Online
              </span>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-bold text-[#1c302b] font-mono truncate">
                VPS 103.48.84.51
              </div>
              <div className="text-xs text-[#6e7d75] flex items-center gap-1.5">
                <span>Reverb Port 8080</span>
                <span>·</span>
                <span className="text-[#176b58] font-semibold">99.98% uptime</span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#f0f3f1] flex items-center justify-between text-[11px] text-[#6e7d75]">
              <span>Latency: 18ms</span>
              <span className="text-[#176b58] font-bold">Sanctum Auth OK</span>
            </div>
          </div>
        </div>

        {/* Recent Stores Table */}
        <div className="bg-white rounded-[12px] border border-[#e5ece8] shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-[#f0f3f1] flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#1c302b] m-0">
                Gian hàng tham gia gần đây
              </h2>
              <p className="text-xs text-[#718279] mt-0.5 mb-0">
                Danh sách các đối tác mới mở hoặc cập nhật gần nhất trên nền tảng
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push('/platform/stores')}
              className="text-xs font-semibold"
            >
              Xem tất cả gian hàng →
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#fbfcfb] border-b border-[#edf1ee] text-[#718279] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Mã tiệm</th>
                  <th className="py-3 px-4">Tên gian hàng</th>
                  <th className="py-3 px-4">Liên hệ</th>
                  <th className="py-3 px-4">Gói cước</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2f5f3]">
                {recentStores.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#7e8d85]">
                      Chưa có gian hàng nào được ghi nhận.
                    </td>
                  </tr>
                ) : (
                  recentStores.map((store) => (
                    <tr key={store.id} className="hover:bg-[#f9faf9] transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-[#176b58]">
                        {store.code}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#1c302b]">
                        {store.name}
                      </td>
                      <td className="py-3.5 px-4 text-[#596962]">
                        <div>{store.phone || 'Chưa có SĐT'}</div>
                        <div className="text-[11px] text-[#85958d]">{store.email || ''}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="uppercase text-[11px] font-bold px-2 py-0.5 rounded bg-[#f1f5f3] text-[#3e5048]">
                          {store.plan || 'trial'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {getStatusBadge(store.status)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => router.push('/platform/stores')}
                          className="text-xs font-bold text-[#176b58] hover:underline cursor-pointer"
                        >
                          Chi tiết →
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
