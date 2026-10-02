'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Icon, useToast, useConfirm } from '@podscare/ui';
import { AppShell } from '../../components/AppShell';

interface StoreItem {
  id: number;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  status: 'active' | 'pending' | 'suspended';
  plan: string;
  expires_at?: string | null;
  created_at: string;
  branches_count?: number;
  users_count?: number;
  repair_orders_count?: number;
}

export default function PlatformStoresPage() {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const fetchStores = useCallback(async () => {
    setLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('podscare_token') : null;
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      params.append('per_page', '50');

      const res = await fetch(`/api/v1/platform/stores?${params.toString()}`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && json?.data) {
          const list = Array.isArray(json.data.data)
            ? json.data.data
            : Array.isArray(json.data)
            ? json.data
            : [];
          setStores(list);
        }
      }
    } catch (e) {
      console.warn('Could not fetch stores list:', e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchStores();
    }, 250);
    return () => clearTimeout(handler);
  }, [fetchStores]);

  const handleAction = async (action: 'approve' | 'suspend' | 'activate', id: number, name: string) => {
    const actionLabel =
      action === 'approve'
        ? 'Phê duyệt & kích hoạt'
        : action === 'suspend'
        ? 'Tạm khóa'
        : 'Kích hoạt lại';

    const isDangerous = action === 'suspend';
    const ok = await confirm({
      title: `${actionLabel} gian hàng`,
      description: `Bạn có chắc chắn muốn ${actionLabel.toLowerCase()} gian hàng "${name}"?`,
      confirmText: actionLabel,
      cancelText: 'Hủy bỏ',
      variant: isDangerous ? 'danger' : 'info',
    });

    if (!ok) {
      return;
    }

    setActionLoadingId(id);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('podscare_token') : null;
      const res = await fetch(`/api/v1/platform/stores/${id}/${action}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.success) {
        toast(`Đã ${actionLabel.toLowerCase()} gian hàng "${name}" thành công.`, 'success');
        fetchStores();
      } else {
        toast(json?.message || `Thao tác thất bại. Vui lòng thử lại.`, 'error');
      }
    } catch (err: any) {
      toast(err?.message || 'Lỗi kết nối máy chủ.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#eaf4ef] text-[#176b58] border border-[#cde2d6]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
            Hoạt động
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#fffbeb] text-[#b45309] border border-[#fde68a]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
            Chờ duyệt
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#fbefed] text-[#bc5b52] border border-[#f5c7c2]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
            Tạm khóa
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#f1f5f3] text-[#55655d]">
            {status}
          </span>
        );
    }
  };

  return (
    <AppShell crumbName="Danh sách Gian hàng">
      <div className="space-y-6">
        {/* Header Block */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#e5ece8]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#176b58] bg-[#eaf4ef] px-2 py-0.5 rounded">
                Multi-Tenant Registry
              </span>
              <span className="text-xs text-[#87968f]">·</span>
              <span className="text-xs text-[#87968f]">Quản lý Định danh Gian hàng</span>
            </div>
            <h1 className="text-2xl font-bold font-heading text-[#1c302b] m-0">
              DANH SÁCH GIAN HÀNG NỀN TẢNG
            </h1>
            <p className="text-xs text-[#6e7d75] mt-1 mb-0">
              Tổng hợp tất cả tiệm sửa chữa độc lập trên FIXO, kiểm soát trạng thái hoạt động và cấu hình bản quyền.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchStores}
              loading={loading}
              className="font-semibold text-xs"
            >
              <Icon name="refresh" size={14} className="mr-1.5" />
              Làm mới
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => router.push('/platform/approvals')}
              className="font-semibold text-xs"
            >
              <Icon name="spark" size={14} className="mr-1.5" />
              Duyệt đăng ký
            </Button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white rounded-[12px] border border-[#e5ece8] p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="w-full sm:w-[320px]">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm theo mã, tên tiệm, SĐT..."
              icon={<Icon name="search" size={16} />}
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'active', label: 'Đang hoạt động' },
              { id: 'pending', label: 'Chờ duyệt' },
              { id: 'suspended', label: 'Tạm khóa' },
            ].map((tab) => {
              const isSelected = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#176b58] text-white'
                      : 'bg-[#f4f7f5] text-[#55655d] hover:bg-[#eaf0ec] hover:text-[#1c302b]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Stores Table */}
        <div className="bg-white rounded-[12px] border border-[#e5ece8] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#fbfcfb] border-b border-[#edf1ee] text-[#718279] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Mã gian hàng</th>
                  <th className="py-3 px-4">Tên cửa hàng</th>
                  <th className="py-3 px-4">Thông tin liên hệ</th>
                  <th className="py-3 px-4">Gói cước</th>
                  <th className="py-3 px-4">Hạn dùng</th>
                  <th className="py-3 px-4 text-center">Chi nhánh / NV / Đơn</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2f5f3]">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[#7e8d85]">
                      <div className="w-6 h-6 rounded-full border-2 border-[#176b58]/20 border-t-[#176b58] animate-spin mx-auto mb-2" />
                      Đang tải danh sách gian hàng...
                    </td>
                  </tr>
                ) : stores.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-[#7e8d85]">
                      Không tìm thấy gian hàng nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  stores.map((store) => {
                    const isBusy = actionLoadingId === store.id;
                    const expiresFormatted = store.expires_at
                      ? new Date(store.expires_at).toLocaleDateString('vi-VN')
                      : 'Vô thời hạn';

                    return (
                      <tr key={store.id} className="hover:bg-[#f9faf9] transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-[#176b58]">
                          {store.code}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-[#1c302b]">
                          {store.name}
                        </td>
                        <td className="py-3.5 px-4 text-[#52635a]">
                          <div>{store.phone || 'Chưa có SĐT'}</div>
                          <div className="text-[11px] text-[#819089]">{store.email || ''}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="uppercase text-[11px] font-bold px-2 py-0.5 rounded bg-[#f1f5f3] text-[#3e5048]">
                            {store.plan || 'standard'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-[#6e7d75]">
                          {expiresFormatted}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-[#52635a]">
                          <span>{store.branches_count ?? 1}</span>
                          <span className="text-[#a1b0a8] mx-1">/</span>
                          <span>{store.users_count ?? 1}</span>
                          <span className="text-[#a1b0a8] mx-1">/</span>
                          <span>{store.repair_orders_count ?? 0}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          {getStatusBadge(store.status)}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                          {store.status === 'pending' && (
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => handleAction('approve', store.id, store.name)}
                              className="font-bold text-xs"
                            >
                              Duyệt tiệm
                            </Button>
                          )}

                          {store.status === 'active' && store.code !== 'fixo-master' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => handleAction('suspend', store.id, store.name)}
                              className="text-xs font-semibold text-[#bc5b52] hover:bg-[#fbefed] border-[#f5c7c2]"
                            >
                              Tạm khóa
                            </Button>
                          )}

                          {store.status === 'suspended' && (
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => handleAction('activate', store.id, store.name)}
                              className="font-bold text-xs"
                            >
                              Mở khóa
                            </Button>
                          )}

                          {store.code === 'fixo-master' && (
                            <span className="text-[11px] font-semibold text-[#87968f] italic px-2">
                              Master Tiệm gốc
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
