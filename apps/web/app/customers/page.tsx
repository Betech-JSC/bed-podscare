'use client';

import React, { useState, useMemo } from 'react';
import { FilterBar, Avatar, CardsSkeleton, EmptyState, ErrorFallback } from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { customerService } from '@podscare/api-client';
import { useQuery } from '@tanstack/react-query';

interface CustomerViewModel {
  id: number;
  name: string;
  phone: string;
  email?: string;
  orders: number;
  spent: string;
  since: string;
  initials: string;
}

export default function CustomersPage() {
  const [search, setSearch] = useState('');

  // Nạp danh sách khách hàng trực tiếp từ API và tìm kiếm động
  const {
    data: apiCustomersData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['customers', search],
    queryFn: async () => {
      const res = await customerService.getCustomers(search.trim() || undefined);
      return res?.data || res;
    },
  });

  const customers: CustomerViewModel[] = useMemo(() => {
    const raw = apiCustomersData?.data || apiCustomersData;
    const list = Array.isArray(raw) ? raw : [];

    return list.map((c: any) => {
      const name = c.name || 'Khách lẻ';
      const initials =
        name
          .split(' ')
          .filter(Boolean)
          .map((w: string) => w[0])
          .slice(-2)
          .join('')
          .toUpperCase() || 'KH';

      const ordersCount =
        c.repair_orders_count ??
        c.orders_count ??
        (Array.isArray(c.repair_orders) ? c.repair_orders.length : 0);

      const totalSpent =
        c.total_spent ??
        (Array.isArray(c.repair_orders)
          ? c.repair_orders.reduce((sum: number, o: any) => sum + (Number(o.total_price) || 0), 0)
          : 0);

      const formattedSpent = totalSpent > 0
        ? new Intl.NumberFormat('vi-VN').format(totalSpent) + ' ₫'
        : '0 ₫';

      const sinceStr = c.created_at
        ? new Intl.DateTimeFormat('vi-VN', { month: '2-digit', year: 'numeric' }).format(new Date(c.created_at))
        : 'Mới tiếp nhận';

      return {
        id: c.id,
        name,
        phone: c.phone || 'Chưa cập nhật SĐT',
        email: c.email,
        orders: ordersCount,
        spent: formattedSpent,
        since: sinceStr,
        initials,
      };
    });
  }, [apiCustomersData]);

  return (
    <AppShell crumbName="Khách hàng">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1">
              CRM
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Danh sách khách hàng
            </h1>
            <p className="text-sm text-[#85928c] mt-1 mb-0">
              Quản lý hồ sơ, lịch sử sửa chữa và tổng chi tiêu của khách hàng.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-[10px] border border-[#e5ece8] p-4 sm:p-5 shadow-xs">
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm theo họ tên hoặc số điện thoại..."
          />

          {isError ? (
            <ErrorFallback onRetry={() => refetch()} />
          ) : isLoading ? (
            <CardsSkeleton count={6} />
          ) : customers.length === 0 ? (
            <EmptyState
              title="Không tìm thấy khách hàng nào"
              description="Thử tìm kiếm với số điện thoại hoặc họ tên khác."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {customers.map((c, i) => (
                <div
                  key={c.id || c.phone}
                  className="bg-white border border-[#e5ece8] rounded-[9px] p-4 flex flex-col justify-between hover:border-[#b7d2c3] transition-all"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar initials={c.initials} variant={(i % 4) as any} size="md" />
                    <div>
                      <h3 className="font-heading font-bold text-sm text-[#1c302b] m-0">
                        {c.name}
                      </h3>
                      <small className="text-xs text-[#929e97]">{c.phone}</small>
                      {c.email && (
                        <small className="block text-[11px] text-[#abb8b0] truncate max-w-[200px]">
                          {c.email}
                        </small>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-[#edf1ee] pt-2.5 mt-2 flex justify-between text-xs text-[#7f8c85]">
                    <div>
                      <span>Đã sửa: </span>
                      <b className="text-[#3e4d45]">{c.orders} đơn</b>
                    </div>
                    <div>
                      <span>Tổng chi tiêu: </span>
                      <b className="text-[#176b58]">{c.spent}</b>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
