'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { auditService, type AuditLogItem } from '@podscare/api-client';
import { Button, Input, Icon, PaginationBar, useToast, useConfirm } from '@podscare/ui';
import { AppShell } from '../../components/AppShell';
import { AuditDiffModal } from '../../components/AuditDiffModal';

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
  owner_name?: string | null;
  last_activity_at?: string | null;
  last_activity_action?: string | null;
  last_ip?: string | null;
  last_device?: string | null;
}

const ACTION_META_MAP: Record<string, { label: string; badgeClass: string }> = {
  tenant_registered: {
    label: 'Đăng ký gian hàng mới',
    badgeClass: 'bg-[#eaf4ef] text-[#176b58] border-[#cde2d6]',
  },
  user_login: {
    label: 'Đăng nhập',
    badgeClass: 'bg-[#edf4f8] text-[#4778a4] border-[#cde0ec]',
  },
  user_logout: {
    label: 'Đăng xuất',
    badgeClass: 'bg-[#f0f3f1] text-[#77847e] border-[#dce3df]',
  },
  store_approved: {
    label: 'Duyệt tiệm',
    badgeClass: 'bg-[#eaf5ef] text-[#28805e] border-[#cde2d6]',
  },
  store_suspended: {
    label: 'Tạm khóa tiệm',
    badgeClass: 'bg-[#fbefed] text-[#bc5b52] border-[#f5c7c2]',
  },
  store_activated: {
    label: 'Mở khóa tiệm',
    badgeClass: 'bg-[#eaf5ef] text-[#28805e] border-[#cde2d6]',
  },
  repair_order_created: {
    label: 'Tạo đơn sửa chữa',
    badgeClass: 'bg-[#eaf4ef] text-[#176b58] border-[#cde2d6]',
  },
  order_created: {
    label: 'Tạo đơn sửa chữa',
    badgeClass: 'bg-[#eaf4ef] text-[#176b58] border-[#cde2d6]',
  },
  state_transition: {
    label: 'Chuyển trạng thái đơn',
    badgeClass: 'bg-[#edf4f8] text-[#4778a4] border-[#cde0ec]',
  },
  quote_created: {
    label: 'Tạo báo giá',
    badgeClass: 'bg-[#faf3e7] text-[#b77a21] border-[#ecd8b4]',
  },
  quote_approved: {
    label: 'Duyệt báo giá',
    badgeClass: 'bg-[#eaf5ef] text-[#28805e] border-[#cde2d6]',
  },
  qc_passed: {
    label: 'QC đạt chuẩn',
    badgeClass: 'bg-[#eaf5ef] text-[#28805e] border-[#cde2d6]',
  },
  qc_failed: {
    label: 'QC từ chối',
    badgeClass: 'bg-[#fbefed] text-[#bc5b52] border-[#f5c7c2]',
  },
  payment_confirmed: {
    label: 'Xác nhận thanh toán',
    badgeClass: 'bg-[#eaf5ef] text-[#28805e] border-[#cde2d6]',
  },
  payment_created: {
    label: 'Ghi nhận thanh toán',
    badgeClass: 'bg-[#eaf5ef] text-[#28805e] border-[#cde2d6]',
  },
  payment_refunded: {
    label: 'Hoàn tiền',
    badgeClass: 'bg-[#fbefed] text-[#bc5b52] border-[#f5c7c2]',
  },
  stock_in: {
    label: 'Nhập kho linh kiện',
    badgeClass: 'bg-[#eaf4ef] text-[#176b58] border-[#cde2d6]',
  },
  stock_out: {
    label: 'Xuất kho linh kiện',
    badgeClass: 'bg-[#faf3e7] text-[#b77a21] border-[#ecd8b4]',
  },
};

const ROLE_LABEL_MAP: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Chủ tiệm',
  receptionist: 'Lễ tân',
  technician: 'Kỹ thuật viên',
  qc: 'Kiểm định QC',
  cashier: 'Thu ngân',
};

function getActionMeta(action?: string | null): { label: string; badgeClass: string } {
  if (!action) {
    return {
      label: 'Hoạt động',
      badgeClass: 'bg-[#f4f7f5] text-[#55655d] border-[#e2e9e4]',
    };
  }
  if (ACTION_META_MAP[action]) {
    return ACTION_META_MAP[action];
  }
  return {
    label: action,
    badgeClass: 'bg-[#f4f7f5] text-[#35463e] border-[#dce5df]',
  };
}

function isNewWithin7Days(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  const createdMs = new Date(dateStr).getTime();
  if (Number.isNaN(createdMs)) return false;
  return Date.now() - createdMs <= 7 * 24 * 60 * 60 * 1000;
}

function formatDateTimeVi(dateStr?: string | null, withSeconds = false): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  });
}

function hasAuditDiff(log: AuditLogItem): boolean {
  return Boolean(
    (log.old_values && Object.keys(log.old_values).length > 0) ||
      (log.new_values && Object.keys(log.new_values).length > 0)
  );
}

export default function PlatformStoresPage() {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number | 'all'>(15);
  const [meta, setMeta] = useState({
    current_page: 1,
    last_page: 1,
    total: 0,
    from: 0 as number | null,
    to: 0 as number | null,
  });
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  // State cho Slide-over Drawer "Nhật ký hoạt động & Đăng nhập"
  const [selectedStore, setSelectedStore] = useState<StoreItem | null>(null);
  const [drawerLogs, setDrawerLogs] = useState<AuditLogItem[]>([]);
  const [drawerLoading, setDrawerLoading] = useState<boolean>(false);
  const [drawerActionGroup, setDrawerActionGroup] = useState<
    'all' | 'auth' | 'orders' | 'finance_inventory'
  >('all');
  const [drawerSearch, setDrawerSearch] = useState<string>('');
  const [drawerPage, setDrawerPage] = useState<number>(1);
  const [drawerPerPage, setDrawerPerPage] = useState<number | 'all'>(15);
  const [drawerMeta, setDrawerMeta] = useState({
    current_page: 1,
    last_page: 1,
    total: 0,
    from: 0 as number | null,
    to: 0 as number | null,
  });
  const [selectedLogForDiff, setSelectedLogForDiff] = useState<AuditLogItem | null>(null);

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
        params.append('q', searchQuery.trim());
      }
      params.append('page', String(perPage === 'all' ? 1 : page));
      params.append('per_page', String(perPage));
      if (perPage === 'all') {
        params.append('all', 'true');
      }

      const res = await fetch(`/api/v1/platform/stores?${params.toString()}`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && json?.data) {
          const rawData = json.data;
          const list = Array.isArray(rawData.data)
            ? rawData.data
            : Array.isArray(rawData)
            ? rawData
            : [];
          setStores(list);
          setMeta({
            current_page: Number(rawData.current_page ?? (perPage === 'all' ? 1 : page)),
            last_page: Number(rawData.last_page ?? 1),
            total: Number(rawData.total ?? list.length),
            from: rawData.from ?? (list.length > 0 ? 1 : 0),
            to: rawData.to ?? list.length,
          });
        }
      }
    } catch (e) {
      console.warn('Could not fetch stores list:', e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, page, perPage]);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchStores();
    }, 250);
    return () => clearTimeout(handler);
  }, [fetchStores]);

  const fetchStoreLogs = useCallback(async () => {
    if (!selectedStore) return;
    setDrawerLoading(true);
    try {
      const res = await auditService.getAuditLogs({
        tenant_id: selectedStore.id,
        action_group: drawerActionGroup !== 'all' ? drawerActionGroup : undefined,
        q: drawerSearch.trim() || undefined,
        page: drawerPerPage === 'all' ? 1 : drawerPage,
        per_page: drawerPerPage,
        all: drawerPerPage === 'all' ? true : undefined,
      });

      const rawData: any = res?.data;
      const items: AuditLogItem[] = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData?.data)
        ? rawData.data
        : [];

      setDrawerLogs(items);
      setDrawerMeta({
        current_page: Number(rawData?.current_page ?? (drawerPerPage === 'all' ? 1 : drawerPage)),
        last_page: Number(rawData?.last_page ?? 1),
        total: Number(rawData?.total ?? items.length),
        from: rawData?.from ?? (items.length > 0 ? 1 : 0),
        to: rawData?.to ?? items.length,
      });
    } catch (err) {
      console.warn('Could not fetch store audit logs:', err);
      setDrawerLogs([]);
      setDrawerMeta({ current_page: 1, last_page: 1, total: 0, from: 0, to: 0 });
    } finally {
      setDrawerLoading(false);
    }
  }, [selectedStore, drawerActionGroup, drawerSearch, drawerPage, drawerPerPage]);

  useEffect(() => {
    if (!selectedStore) return;
    const timer = setTimeout(() => {
      fetchStoreLogs();
    }, 200);
    return () => clearTimeout(timer);
  }, [selectedStore, fetchStoreLogs]);

  const openStoreLogsDrawer = (store: StoreItem) => {
    setSelectedStore(store);
    setDrawerActionGroup('all');
    setDrawerSearch('');
    setDrawerPage(1);
  };

  const closeStoreLogsDrawer = () => {
    setSelectedStore(null);
    setDrawerLogs([]);
    setSelectedLogForDiff(null);
  };

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
        if (selectedStore && selectedStore.id === id) {
          fetchStoreLogs();
        }
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

  const latestDrawerIp =
    drawerLogs[0]?.ip_address || selectedStore?.last_ip || 'Chưa ghi nhận';
  const latestDrawerDevice =
    drawerLogs[0]?.metadata?.device_summary ||
    selectedStore?.last_device ||
    'Chưa ghi nhận';

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
              <span className="text-xs text-[#87968f]">Quản lý Định danh & Nhật ký Gian hàng</span>
            </div>
            <h1 className="text-2xl font-bold font-heading text-[#1c302b] m-0">
              DANH SÁCH GIAN HÀNG NỀN TẢNG
            </h1>
            <p className="text-xs text-[#6e7d75] mt-1 mb-0">
              Tổng hợp tất cả tiệm sửa chữa độc lập trên FIXO, giám sát khách hàng mới đăng ký, thiết bị/IP đăng nhập và lịch sử hoạt động tập trung.
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
          <div className="w-full sm:w-[340px]">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo mã, tên tiệm, chủ tiệm, SĐT..."
              icon={<Icon name="search" size={16} />}
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'new_7d', label: 'Mới đăng ký (7 ngày)' },
              { id: 'active', label: 'Đang hoạt động' },
              { id: 'pending', label: 'Chờ duyệt' },
              { id: 'suspended', label: 'Tạm khóa' },
            ].map((tab) => {
              const isSelected = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`filter-store-status-${tab.id}`}
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setPage(1);
                  }}
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
                  <th className="py-3 px-4">Ngày đăng ký & Gói</th>
                  <th className="py-3 px-4">Hoạt động / Thiết bị cuối</th>
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
                    const isNewStore = isNewWithin7Days(store.created_at);
                    const hasLastActivity = Boolean(
                      store.last_activity_at || store.last_ip || store.last_device
                    );

                    return (
                      <tr key={store.id} className="hover:bg-[#f9faf9] transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-[#176b58] whitespace-nowrap">
                          {store.code}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-[#1c302b]">{store.name}</span>
                            {isNewStore && (
                              <span
                                data-testid={`badge-new-store-${store.code}`}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#eaf4ef] text-[#176b58] border border-[#cde2d6]"
                              >
                                MỚI
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#52635a] mt-0.5">
                            Chủ tiệm:{' '}
                            <span className="font-semibold text-[#1c302b]">
                              {store.owner_name || 'Chưa cập nhật'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-[#52635a]">
                          <div className="font-medium text-[#1c302b]">
                            {store.phone || 'Chưa có SĐT'}
                          </div>
                          <div className="text-[11px] text-[#819089]">{store.email || ''}</div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="text-[#1c302b] font-medium">
                            {formatDateTimeVi(store.created_at)}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#f1f5f3] text-[#3e5048]">
                              {store.plan || 'standard'}
                            </span>
                            <span className="text-[11px] text-[#6e7d75]">
                              Hạn: {expiresFormatted}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {hasLastActivity ? (
                            <div className="space-y-1">
                              <div className="text-[#1c302b] font-medium whitespace-nowrap">
                                {store.last_activity_at
                                  ? formatDateTimeVi(store.last_activity_at)
                                  : 'Vừa ghi nhận'}
                                {store.last_activity_action && (
                                  <span className="ml-1.5 text-[10px] font-semibold text-[#176b58]">
                                    · {getActionMeta(store.last_activity_action).label}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-[#52635a]">
                                <span className="font-mono font-semibold text-[#1c302b] bg-[#f4f7f5] px-1.5 py-0.5 rounded border border-[#e5ece8]">
                                  IP: {store.last_ip || '—'}
                                </span>
                                <span>{store.last_device || 'Không xác định'}</span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#87968f] italic">
                              Chưa ghi nhận
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-[#52635a] whitespace-nowrap">
                          <span>{store.branches_count ?? 1}</span>
                          <span className="text-[#a1b0a8] mx-1">/</span>
                          <span>{store.users_count ?? 1}</span>
                          <span className="text-[#a1b0a8] mx-1">/</span>
                          <span>{store.repair_orders_count ?? 0}</span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {getStatusBadge(store.status)}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            id={`btn-view-store-logs-${store.id}`}
                            data-testid={`btn-view-store-logs-${store.code}`}
                            onClick={() => openStoreLogsDrawer(store)}
                            className="text-xs font-semibold text-[#176b58] border-[#cde2d6] hover:bg-[#eaf4ef]"
                          >
                            <Icon name="audit" size={14} className="mr-1" />
                            Xem Log
                          </Button>

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
          {!loading && stores.length > 0 && (
            <div className="px-4 pb-4">
              <PaginationBar
                testIdPrefix="platform-stores"
                itemLabel="gian hàng"
                currentPage={meta.current_page}
                lastPage={meta.last_page}
                total={meta.total || stores.length}
                from={meta.from}
                to={meta.to}
                perPage={perPage}
                onPageChange={setPage}
                onPerPageChange={(val) => {
                  setPerPage(val);
                  setPage(1);
                }}
                isLoading={loading}
              />
            </div>
          )}
        </div>
      </div>

      {/* Slide-over Drawer: Nhật ký hoạt động & Đăng nhập của Gian hàng */}
      {selectedStore && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 transition-opacity"
          onClick={closeStoreLogsDrawer}
        >
          <div
            data-testid="store-audit-drawer"
            className="relative w-full max-w-4xl bg-white h-full shadow-modal border-l border-[#e5ece8] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="px-6 py-4 bg-[#fbfcfb] border-b border-[#e5ece8]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#176b58] bg-[#eaf4ef] px-2 py-0.5 rounded border border-[#cde2d6]">
                      STORE ACTIVITY & LOGIN LOGS
                    </span>
                    <span className="font-mono text-xs font-bold text-[#176b58]">
                      {selectedStore.code}
                    </span>
                    {getStatusBadge(selectedStore.status)}
                  </div>
                  <h2 className="text-lg font-bold font-heading text-[#1c302b] m-0">
                    Nhật ký hoạt động & Đăng nhập — {selectedStore.name}
                  </h2>
                </div>
                <button
                  type="button"
                  data-testid="btn-close-store-logs-drawer"
                  onClick={closeStoreLogsDrawer}
                  className="p-1.5 rounded-[8px] text-[#6e7d75] hover:text-[#1c302b] hover:bg-[#edf2ef] transition-colors cursor-pointer"
                  aria-label="Đóng nhật ký gian hàng"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>

              {/* Tóm tắt định danh Gian hàng & Thiết bị / IP gần nhất */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3.5 p-3 rounded-[10px] bg-[#f6f8f6] border border-[#e5ece8] text-xs">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#758780]">
                    Chủ tiệm & Liên hệ
                  </div>
                  <div className="font-semibold text-[#1c302b] mt-0.5">
                    {selectedStore.owner_name || 'Chưa cập nhật'}
                  </div>
                  <div className="text-[11px] text-[#52635a]">
                    {selectedStore.phone || 'Chưa có SĐT'}
                    {selectedStore.email ? ` · ${selectedStore.email}` : ''}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#758780]">
                    Ngày đăng ký & Gói cước
                  </div>
                  <div className="font-semibold text-[#1c302b] mt-0.5">
                    {formatDateTimeVi(selectedStore.created_at)}
                  </div>
                  <div className="text-[11px] text-[#52635a]">
                    Gói:{' '}
                    <span className="font-bold uppercase text-[#176b58]">
                      {selectedStore.plan || 'standard'}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#758780]">
                    Thiết bị & IP hoạt động gần nhất
                  </div>
                  <div className="font-mono font-bold text-[#176b58] mt-0.5">
                    IP: {latestDrawerIp}
                  </div>
                  <div className="text-[11px] text-[#1c302b] font-medium">
                    {latestDrawerDevice}
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Toolbar: Bộ lọc nhóm sự kiện & Tìm kiếm */}
            <div className="px-6 py-3 bg-white border-b border-[#edf1ee] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {[
                  { id: 'all', label: 'Tất cả' },
                  { id: 'auth', label: 'Đăng ký & Đăng nhập' },
                  { id: 'orders', label: 'Đơn sửa chữa' },
                  { id: 'finance_inventory', label: 'Thanh toán & Kho' },
                ].map((tab) => {
                  const active = drawerActionGroup === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      data-testid={`drawer-tab-${tab.id}`}
                      onClick={() => {
                        setDrawerActionGroup(
                          tab.id as 'all' | 'auth' | 'orders' | 'finance_inventory'
                        );
                        setDrawerPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#176b58] text-white'
                          : 'bg-[#f4f7f5] text-[#55655d] hover:bg-[#eaf0ec] hover:text-[#1c302b]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <div className="w-full sm:w-[240px]">
                  <Input
                    type="text"
                    data-testid="drawer-search-input"
                    value={drawerSearch}
                    onChange={(e) => {
                      setDrawerSearch(e.target.value);
                      setDrawerPage(1);
                    }}
                    placeholder="Tìm hành động, user, IP, thiết bị..."
                    icon={<Icon name="search" size={14} />}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fetchStoreLogs}
                  loading={drawerLoading}
                  className="font-semibold text-xs shrink-0"
                >
                  <Icon name="refresh" size={14} className="mr-1" />
                  Làm mới
                </Button>
              </div>
            </div>

            {/* Drawer Body: Danh sách nhật ký */}
            <div className="flex-1 overflow-y-auto px-6 py-4 bg-[#f6f8f6]">
              {drawerLoading ? (
                <div className="py-16 text-center text-[#6e7d75] bg-white rounded-[10px] border border-[#e5ece8]">
                  <div className="w-7 h-7 rounded-full border-2 border-[#176b58]/20 border-t-[#176b58] animate-spin mx-auto mb-2.5" />
                  <span className="text-xs font-medium">
                    Đang tải lịch sử hoạt động của gian hàng {selectedStore.name}...
                  </span>
                </div>
              ) : drawerLogs.length === 0 ? (
                <div className="py-14 px-4 text-center bg-white rounded-[10px] border border-[#e5ece8]">
                  <div className="text-sm font-bold text-[#1c302b]">
                    Chưa có bản ghi nhật ký phù hợp
                  </div>
                  <p className="text-xs text-[#758780] mt-1 mb-0">
                    Gian hàng này chưa phát sinh hoạt động nào khớp với bộ lọc hiện tại.
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-[10px] border border-[#e5ece8] overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#fbfcfb] border-b border-[#edf1ee] text-[#718279] font-bold uppercase tracking-wider">
                          <th className="py-3 px-3.5 whitespace-nowrap">Thời gian</th>
                          <th className="py-3 px-3.5 whitespace-nowrap">Người thực hiện</th>
                          <th className="py-3 px-3.5">Hành động & Chi tiết</th>
                          <th className="py-3 px-3.5 whitespace-nowrap">IP & Thiết bị đăng nhập</th>
                          <th className="py-3 px-3.5 text-right whitespace-nowrap">Chi tiết Diff</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f2f5f3]">
                        {drawerLogs.map((log, idx) => {
                          const actionMeta = getActionMeta(log.action);
                          const diffAvailable = hasAuditDiff(log);
                          const userName =
                            log.user_name || log.user?.name || 'Hệ thống / Khách đăng ký';
                          const userRole =
                            log.user?.role || (log.metadata?.role as string | undefined) || '';
                          const roleLabel = userRole
                            ? ROLE_LABEL_MAP[userRole] || userRole
                            : '';
                          const deviceSummary =
                            log.metadata?.device_summary || 'Không xác định';
                          const rawUserAgent = log.metadata?.user_agent || '';

                          return (
                            <tr
                              key={log.id ?? idx}
                              className="hover:bg-[#f9faf9] transition-colors align-top"
                            >
                              <td className="py-3 px-3.5 font-mono text-[11px] text-[#52635a] whitespace-nowrap">
                                {formatDateTimeVi(log.created_at || log.time, true)}
                              </td>
                              <td className="py-3 px-3.5 whitespace-nowrap">
                                <div className="font-semibold text-[#1c302b]">{userName}</div>
                                {roleLabel && (
                                  <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-[#f1f5f3] text-[#55655d]">
                                    {roleLabel}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] font-bold border ${actionMeta.badgeClass}`}
                                  >
                                    {actionMeta.label}
                                  </span>
                                  {log.auditable_type && (
                                    <span className="font-mono text-[10px] text-[#758780]">
                                      {String(log.auditable_type).split('\\').pop()} #
                                      {log.auditable_id}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[#35463e] text-xs mt-1 leading-relaxed">
                                  {log.details || log.detail || '—'}
                                </div>
                              </td>
                              <td className="py-3 px-3.5 whitespace-nowrap">
                                <div className="font-mono font-bold text-[#176b58] text-[11px]">
                                  {log.ip_address || '127.0.0.1'}
                                </div>
                                <div
                                  className="text-[11px] text-[#52635a] mt-0.5 max-w-[200px] truncate"
                                  title={rawUserAgent || deviceSummary}
                                >
                                  {deviceSummary}
                                </div>
                              </td>
                              <td className="py-3 px-3.5 text-right whitespace-nowrap">
                                {diffAvailable ? (
                                  <button
                                    type="button"
                                    data-testid={`drawer-view-diff-${log.id}`}
                                    onClick={() => setSelectedLogForDiff(log)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-bold bg-[#eaf4ef] text-[#176b58] border border-[#cde2d6] hover:bg-[#176b58] hover:text-white transition-colors cursor-pointer"
                                  >
                                    Xem thay đổi
                                  </button>
                                ) : (
                                  <span className="text-[#9aa59f] text-[11px]">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer: Phân trang */}
            <div className="px-6 py-3 bg-white border-t border-[#e5ece8]">
              <PaginationBar
                testIdPrefix="store-audit-logs"
                itemLabel="bản ghi log"
                currentPage={drawerMeta.current_page}
                lastPage={drawerMeta.last_page}
                total={drawerMeta.total || drawerLogs.length}
                from={drawerMeta.from}
                to={drawerMeta.to}
                perPage={drawerPerPage}
                onPageChange={setDrawerPage}
                onPerPageChange={(val) => {
                  setDrawerPerPage(val);
                  setDrawerPage(1);
                }}
                isLoading={drawerLoading}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal đối chiếu JSON Diff (Old vs New Values) */}
      <AuditDiffModal
        isOpen={Boolean(selectedLogForDiff)}
        onClose={() => setSelectedLogForDiff(null)}
        log={selectedLogForDiff}
      />
    </AppShell>
  );
}
