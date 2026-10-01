'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Icon, useToast } from '@podscare/ui';
import { AppShell } from '../../components/AppShell';

interface PendingStore {
  id: number;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  status: string;
  plan: string;
  created_at: string;
}

export default function PlatformApprovalsPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [stores, setStores] = useState<PendingStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const fetchPendingStores = useCallback(async () => {
    setLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('podscare_token') : null;
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch('/api/v1/platform/stores?status=pending', { headers });
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
      console.warn('Could not fetch pending stores:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingStores();
  }, [fetchPendingStores]);

  const handleApprove = async (id: number, name: string) => {
    if (!confirm(`Xác nhận phê duyệt và kích hoạt gian hàng "${name}"?`)) {
      return;
    }

    setActionLoadingId(id);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('podscare_token') : null;
      const res = await fetch(`/api/v1/platform/stores/${id}/approve`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.success) {
        toast(`Đã kích hoạt thành công gian hàng "${name}".`, 'success');
        fetchPendingStores();
      } else {
        toast(json?.message || 'Không thể phê duyệt gian hàng. Vui lòng thử lại.', 'error');
      }
    } catch (err: any) {
      toast(err?.message || 'Lỗi kết nối máy chủ.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (id: number, name: string) => {
    if (!confirm(`Từ chối hồ sơ đăng ký của gian hàng "${name}"?`)) {
      return;
    }

    setActionLoadingId(id);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('podscare_token') : null;
      const res = await fetch(`/api/v1/platform/stores/${id}/suspend`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.success) {
        toast(`Đã từ chối hồ sơ gian hàng "${name}".`, 'info');
        fetchPendingStores();
      } else {
        toast(json?.message || 'Không thể cập nhật hồ sơ.', 'error');
      }
    } catch (err: any) {
      toast(err?.message || 'Lỗi kết nối máy chủ.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <AppShell crumbName="Duyệt đăng ký gian hàng">
      <div className="space-y-6">
        {/* Header Block */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#e5ece8]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#b45309] bg-[#fffbeb] px-2 py-0.5 rounded border border-[#fde68a]">
                Hồ sơ chờ xem xét
              </span>
              <span className="text-xs text-[#87968f]">·</span>
              <span className="text-xs text-[#87968f]">
                {stores.length} hồ sơ đang chờ duyệt
              </span>
            </div>
            <h1 className="text-2xl font-bold font-heading text-[#1c302b] m-0">
              DUYỆT ĐĂNG KÝ GIAN HÀNG MỚI
            </h1>
            <p className="text-xs text-[#6e7d75] mt-1 mb-0">
              Xem xét thông tin đối tác mở tiệm, kích hoạt tài khoản chủ tiệm và cấp bản quyền dùng thử 14 ngày.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchPendingStores}
              loading={loading}
              className="font-semibold text-xs"
            >
              <Icon name="refresh" size={14} className="mr-1.5" />
              Làm mới
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => router.push('/platform/stores')}
              className="font-semibold text-xs"
            >
              Xem tất cả gian hàng →
            </Button>
          </div>
        </div>

        {/* List of Pending Stores */}
        {loading ? (
          <div className="bg-white rounded-[12px] border border-[#e5ece8] p-12 text-center text-[#7e8d85] text-xs">
            <div className="w-8 h-8 rounded-full border-2 border-[#176b58]/20 border-t-[#176b58] animate-spin mx-auto mb-3" />
            Đang tải danh sách hồ sơ chờ duyệt...
          </div>
        ) : stores.length === 0 ? (
          <div className="bg-white rounded-[12px] border border-[#e5ece8] p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-[#eaf4ef] text-[#176b58] mx-auto grid place-items-center mb-3">
              <Icon name="check" size={24} />
            </div>
            <h3 className="text-sm font-bold text-[#1c302b] mb-1">
              Không có hồ sơ nào đang chờ duyệt
            </h3>
            <p className="text-xs text-[#6e7d75] max-w-[360px] mx-auto mb-4">
              Tất cả các yêu cầu mở gian hàng mới đã được xử lý xong. Hồ sơ mới sẽ hiển thị tại đây khi có đối tác đăng ký.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push('/platform/stores')}
              className="text-xs font-semibold"
            >
              Quản lý danh sách gian hàng →
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stores.map((store) => {
              const isActioning = actionLoadingId === store.id;
              const formattedDate = store.created_at
                ? new Date(store.created_at).toLocaleString('vi-VN')
                : 'Mới gửi';

              return (
                <div
                  key={store.id}
                  className="bg-white rounded-[12px] border border-[#e5ece8] p-5 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#176b58] bg-[#eaf4ef] px-2 py-0.5 rounded">
                          {store.code}
                        </span>
                        <h3 className="text-base font-bold text-[#1c302b] mt-1.5 mb-0">
                          {store.name}
                        </h3>
                      </div>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#fffbeb] text-[#b45309] border border-[#fde68a] shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                        Chờ duyệt
                      </span>
                    </div>

                    <div className="space-y-2 py-3 border-y border-[#f0f3f1] text-xs text-[#52635a]">
                      <div className="flex items-center justify-between">
                        <span className="text-[#87968f]">Số điện thoại:</span>
                        <span className="font-semibold text-[#1c302b]">{store.phone || 'Chưa cung cấp'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#87968f]">Email đăng ký:</span>
                        <span className="font-medium text-[#1c302b]">{store.email || 'Chưa cung cấp'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#87968f]">Gói ban đầu:</span>
                        <span className="uppercase font-bold text-[11px] text-[#176b58]">
                          {store.plan || 'Trial (14 ngày)'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#87968f]">Thời gian gửi:</span>
                        <span className="text-[#6e7d75]">{formattedDate}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      loading={isActioning}
                      disabled={isActioning}
                      onClick={() => handleApprove(store.id, store.name)}
                      className="flex-1 font-bold text-xs"
                    >
                      <Icon name="check" size={14} className="mr-1" />
                      Phê duyệt & Kích hoạt
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={isActioning}
                      disabled={isActioning}
                      onClick={() => handleReject(store.id, store.name)}
                      className="text-xs font-semibold text-[#bc5b52] hover:bg-[#fbefed] border-[#f5c7c2]"
                    >
                      Từ chối
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
