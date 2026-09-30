'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { shipmentService, type ShipmentItem } from '@podscare/api-client';
import { StatusTag, Button, FilterBar, EmptyState, TableSkeleton, useToast } from '@podscare/ui';
import { AppShell } from '../components/AppShell';

interface FormattedShipment {
  id: string;
  orderCode: string;
  customerName: string;
  method: string;
  carrier: string;
  trackingCode?: string;
  status: string;
  statusType: 'wait' | 'progress' | 'ready' | 'danger' | 'gray';
  date: string;
}

export default function ShipmentsPage() {
  const { toast } = useToast();
  const [shipments, setShipments] = useState<FormattedShipment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const mapStatus = (
    rawStatus: string
  ): { label: string; type: 'wait' | 'progress' | 'ready' | 'danger' | 'gray' } => {
    switch (rawStatus) {
      case 'delivered':
        return { label: 'Đã giao', type: 'ready' };
      case 'in_transit':
        return { label: 'Đang giao', type: 'progress' };
      case 'failed':
        return { label: 'Giao thất bại', type: 'danger' };
      case 'cancelled':
        return { label: 'Đã hủy', type: 'gray' };
      case 'pending':
      default:
        return { label: 'Chờ nhận / xử lý', type: 'wait' };
    }
  };

  const loadShipments = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await shipmentService.getShipments({ per_page: 50 });
      const raw = res?.data;
      const list: ShipmentItem[] = Array.isArray(raw) ? raw : (raw?.data || []);

      if (Array.isArray(list) && list.length > 0) {
        const mapped: FormattedShipment[] = list.map((s: any) => {
          const statusInfo = mapStatus(s.status);
          const dateStr = s.created_at
            ? new Intl.DateTimeFormat('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
              }).format(new Date(s.created_at))
            : 'Hôm nay';

          return {
            id: s.shipment_code || `PC26-SH-${s.id}`,
            orderCode: s.repair_order?.order_code || `PC26-${s.repair_order_id || '00000'}`,
            customerName: s.repair_order?.customer?.name || 'Khách lẻ',
            method: s.delivery_method === 'store_pickup' ? 'Giao tại cửa hàng' : 'Giao tận nơi',
            carrier: s.carrier_name || s.partner?.name || 'PodsCare Express',
            trackingCode: s.tracking_code || undefined,
            status: statusInfo.label,
            statusType: statusInfo.type,
            date: dateStr,
          };
        });
        setShipments(mapped);
      } else {
        setShipments([]);
      }
    } catch (err) {
      console.warn('Could not fetch shipments from API:', err);
      setShipments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShipments();
  }, [loadShipments]);

  const filtered = shipments.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.id.toLowerCase().includes(q) ||
      s.orderCode.toLowerCase().includes(q) ||
      s.customerName.toLowerCase().includes(q) ||
      s.carrier.toLowerCase().includes(q) ||
      (s.trackingCode && s.trackingCode.toLowerCase().includes(q))
    );
  });

  return (
    <AppShell crumbName="Giao nhận">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1">
              LOGISTICS & VẬN ĐƠN
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Quản lý giao nhận thiết bị
            </h1>
            <p className="text-sm text-[#85928c] mt-1 mb-0">
              Theo dõi vận đơn giao hàng, đơn vị vận chuyển GHN/GrabExpress và bàn giao máy tại quầy.
            </p>
          </div>
          <Button
            variant="secondary"
            size="md"
            icon="refresh"
            onClick={() => {
              loadShipments();
              toast('Đã làm mới danh sách vận đơn', 'info');
            }}
          >
            Làm mới
          </Button>
        </div>

        <div className="bg-white rounded-[10px] border border-[#e5ece8] p-4 sm:p-5 shadow-xs">
          <div className="mb-4">
            <FilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Tìm theo mã vận đơn, mã đơn sửa, tên khách hoặc đơn vị ship..."
            />
          </div>

          {isLoading ? (
            <TableSkeleton rows={5} cols={7} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Không tìm thấy vận đơn nào"
              description="Chưa có vận đơn nào được tạo hoặc khớp với điều kiện tìm kiếm."
              icon="shipments"
            />
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#9aa59f] uppercase tracking-wider h-9">
                    <th className="px-3">Mã vận đơn</th>
                    <th className="px-3">Mã đơn sửa</th>
                    <th className="px-3">Khách hàng</th>
                    <th className="px-3">Phương thức</th>
                    <th className="px-3">Đơn vị vận chuyển</th>
                    <th className="px-3">Trạng thái</th>
                    <th className="px-3">Thời gian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f2] text-sm">
                  {filtered.map((s) => (
                    <tr key={s.id} className="h-12 hover:bg-[#fafcfa] transition-colors">
                      <td className="px-3 font-mono font-bold text-[#176b58]">{s.id}</td>
                      <td className="px-3 font-mono font-semibold text-[#2d3d35]">{s.orderCode}</td>
                      <td className="px-3 font-medium text-[#1c302b]">{s.customerName}</td>
                      <td className="px-3 text-[#4d5e56]">{s.method}</td>
                      <td className="px-3 text-[#708078]">
                        <span className="font-medium text-[#2d3d35]">{s.carrier}</span>
                        {s.trackingCode && (
                          <small className="block text-xs font-mono text-[#8a9690]">
                            Mã: {s.trackingCode}
                          </small>
                        )}
                      </td>
                      <td className="px-3">
                        <StatusTag label={s.status} type={s.statusType} />
                      </td>
                      <td className="px-3 text-[#8a9690] text-xs">{s.date}</td>
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
