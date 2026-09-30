'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { warrantyService, type WarrantyItem } from '@podscare/api-client';
import { Button, StatusTag, FilterBar, EmptyState, Modal, useToast, Icon } from '@podscare/ui';
import { AppShell } from '../components/AppShell';

interface FormattedWarranty {
  id: number | string;
  code: string;
  orderCode: string;
  customerName: string;
  phone: string;
  device: string;
  serial: string;
  periodDays: number;
  startsAt: string;
  expiresAt: string;
  status: string;
  statusType: 'ready' | 'gray' | 'danger' | 'wait';
  remainingDays: number;
}

export default function WarrantyPage() {
  const { toast } = useToast();
  const [warranties, setWarranties] = useState<FormattedWarranty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Lookup Modal state
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupQuery, setLookupQuery] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<any | null>(null);

  const calculateRemainingDays = (expiresAtStr?: string): number => {
    if (!expiresAtStr) return 0;
    try {
      const exp = new Date(expiresAtStr);
      // Đặt hạn chót vào cuối ngày để không bị tính là hết hạn sớm trong ngày
      exp.setHours(23, 59, 59, 999);
      const expTime = exp.getTime();
      const now = new Date().getTime();
      const diff = Math.ceil((expTime - now) / (1000 * 60 * 60 * 24));
      return diff > 0 ? diff : 0;
    } catch {
      return 0;
    }
  };

  const mapStatus = (
    rawStatus: string,
    remainingDays: number
  ): { label: string; type: 'ready' | 'gray' | 'danger' | 'wait' } => {
    if (rawStatus === 'voided') return { label: 'Đã hủy', type: 'danger' };
    if (rawStatus === 'expired' || remainingDays <= 0) return { label: 'Hết hạn', type: 'gray' };
    return { label: 'Còn hạn', type: 'ready' };
  };

  const loadWarranties = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await warrantyService.getWarranties({ per_page: 50 });
      const raw = res?.data;
      const list: WarrantyItem[] = Array.isArray(raw) ? raw : (raw?.data || []);

      if (Array.isArray(list) && list.length > 0) {
        const mapped: FormattedWarranty[] = list.map((w: any) => {
          const startDateRaw = w.start_date ?? w.starts_at;
          const endDateRaw = w.end_date ?? w.expires_at;
          const periodDays = Number(w.duration_days ?? w.warranty_period_days) || 90;
          const remDays = calculateRemainingDays(endDateRaw);
          const st = mapStatus(w.status, remDays);
          return {
            id: w.id,
            code: w.warranty_code,
            orderCode: w.repair_order?.order_code || `PC26-${w.repair_order_id || ''}`,
            customerName: w.customer?.name || w.repair_order?.customer?.name || 'Khách lẻ',
            phone: w.customer?.phone || w.repair_order?.customer?.phone || '',
            device: w.device_model?.name || w.repair_order?.device_model?.name || 'AirPods',
            serial: w.serial_number || w.repair_order?.serial_number || 'Chưa cập nhật',
            periodDays,
            startsAt: startDateRaw
              ? new Intl.DateTimeFormat('vi-VN').format(new Date(startDateRaw))
              : 'Hôm nay',
            expiresAt: endDateRaw
              ? new Intl.DateTimeFormat('vi-VN').format(new Date(endDateRaw))
              : '—',
            status: st.label,
            statusType: st.type,
            remainingDays: remDays,
          };
        });
        setWarranties(mapped);
      } else {
        setWarranties([]);
      }
    } catch (err) {
      console.warn('Could not fetch warranties from API:', err);
      setWarranties([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWarranties();
  }, [loadWarranties]);

  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = lookupQuery.trim();
    if (!query) {
      toast('Vui lòng nhập mã bảo hành hoặc số điện thoại', 'info');
      return;
    }

    setIsLookingUp(true);
    setLookupResult(null);

    try {
      const isPhone = /^[0-9+ ]{8,15}$/.test(query);
      const params = isPhone ? { phone: query } : { code: query };
      const res = await warrantyService.lookup(params);
      const data = res?.data;

      if (data) {
        const endDateRaw = data.end_date ?? data.expires_at;
        const remDays = calculateRemainingDays(endDateRaw);
        const st = mapStatus(data.status, remDays);
        setLookupResult({
          ...data,
          status: st.label,
          remainingDays: remDays,
          periodDays: Number(data.duration_days ?? data.warranty_period_days) || 90,
          expires_at: endDateRaw
            ? new Intl.DateTimeFormat('vi-VN').format(new Date(endDateRaw))
            : (data.expires_at || '—'),
        });
        toast('Đã tìm thấy thông tin sổ bảo hành điện tử', 'success');
      } else {
        toast('Không tìm thấy sổ bảo hành khớp với thông tin', 'info');
      }
    } catch (err: any) {
      console.warn('Lookup failed:', err);
      // Fallback local lookup
      const found = warranties.find(
        (w) =>
          w.code.toLowerCase() === query.toLowerCase() ||
          w.phone.replace(/\s+/g, '') === query.replace(/\s+/g, '')
      );
      if (found) {
        setLookupResult(found);
        toast('Đã tìm thấy kết quả từ danh mục', 'success');
      } else {
        toast(err?.data?.message || 'Không tìm thấy thông tin bảo hành', 'error');
      }
    } finally {
      setIsLookingUp(false);
    }
  };

  const filtered = warranties.filter((w) => {
    const q = search.toLowerCase();
    return (
      w.code.toLowerCase().includes(q) ||
      w.orderCode.toLowerCase().includes(q) ||
      w.customerName.toLowerCase().includes(q) ||
      w.phone.toLowerCase().includes(q) ||
      w.device.toLowerCase().includes(q)
    );
  });

  return (
    <AppShell crumbName="Bảo hành">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1">
              E-WARRANTY OS
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Quản lý chính sách bảo hành
            </h1>
            <p className="text-sm text-[#85928c] mt-1 mb-0">
              Tra cứu và quản trị sổ bảo hành điện tử 30 ngày, 90 ngày hoặc 180 ngày cho linh kiện đã thay thế.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="md"
              icon="clock"
              onClick={() => {
                loadWarranties();
                toast('Đã cập nhật danh sách bảo hành', 'info');
              }}
            >
              Làm mới
            </Button>
            <Button
              variant="primary"
              size="md"
              icon="search"
              onClick={() => setLookupOpen(true)}
            >
              Tra cứu sổ điện tử
            </Button>
          </div>
        </div>

        {/* Quick lookup banner */}
        <div className="bg-[#f0f7f3] border border-[#d2e8dc] rounded-[12px] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[10px] bg-[#176b58] text-white grid place-items-center flex-none">
              <Icon name="search" size={20} />
            </div>
            <div>
              <b className="text-sm text-[#176b58] block font-bold">Tra cứu sổ bảo hành điện tử</b>
              <small className="text-xs text-[#557564]">
                Nhập mã bảo hành hoặc số điện thoại khách hàng để kiểm tra thời hạn và lịch sử khiếu nại.
              </small>
            </div>
          </div>
          <form onSubmit={handleLookup} className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="VD: PC26-WR-101 hoặc 0903..."
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              className="text-xs px-3 py-2 rounded-[8px] border border-[#bad5c6] bg-white outline-none focus:border-[#176b58] focus:ring-1 focus:ring-[#176b58] flex-1 sm:w-[220px]"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isLookingUp}
            >
              {isLookingUp ? 'Đang tìm...' : 'Tra cứu'}
            </Button>
          </form>
        </div>

        {/* Warranties Table Card */}
        <div className="bg-white rounded-[10px] border border-[#e5ece8] p-4 sm:p-5 shadow-xs">
          <div className="mb-4">
            <FilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Tìm theo mã bảo hành, mã đơn, tên khách, số điện thoại..."
            />
          </div>

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-[#176b58]/20 border-t-[#176b58] animate-spin" />
              <span className="text-xs font-medium text-[#7a8a81]">Đang tải dữ liệu sổ bảo hành...</span>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search ? 'Không tìm thấy sổ bảo hành' : 'Chưa có sổ bảo hành điện tử'}
              description={
                search
                  ? 'Không có sổ bảo hành điện tử nào khớp với bộ lọc.'
                  : 'Hiện tại hệ thống chưa ghi nhận thông tin bảo hành nào cho linh kiện hoặc đơn sửa.'
              }
              icon="shield"
              actionLabel={search ? 'Xóa bộ lọc' : 'Làm mới'}
              onAction={() => {
                if (search) setSearch('');
                else loadWarranties();
              }}
            />
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#9aa59f] uppercase tracking-wider h-9">
                    <th className="px-3">Mã sổ BH</th>
                    <th className="px-3">Mã đơn sửa</th>
                    <th className="px-3">Khách hàng</th>
                    <th className="px-3">Thiết bị & Serial</th>
                    <th className="px-3">Gói bảo hành</th>
                    <th className="px-3">Ngày hết hạn</th>
                    <th className="px-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f2] text-sm">
                  {filtered.map((w) => (
                    <tr
                      key={w.id}
                      onClick={() => {
                        setLookupResult(w);
                        setLookupOpen(true);
                      }}
                      className="h-12 hover:bg-[#fafcfa] cursor-pointer transition-colors"
                    >
                      <td className="px-3 font-mono font-bold text-[#176b58]">{w.code}</td>
                      <td className="px-3 font-mono font-medium text-[#2d3d35]">{w.orderCode}</td>
                      <td className="px-3">
                        <span className="font-semibold text-[#1c302b] block">{w.customerName}</span>
                        <small className="text-xs text-[#7f8f87]">{w.phone}</small>
                      </td>
                      <td className="px-3">
                        <span className="font-medium text-[#2d3d35] block">{w.device}</span>
                        <small className="text-xs font-mono text-[#8a9690]">{w.serial}</small>
                      </td>
                      <td className="px-3">
                        <span className="font-semibold text-[#374941]">{w.periodDays} ngày</span>
                        <small className="block text-xs text-[#8a9690]">Từ {w.startsAt}</small>
                      </td>
                      <td className="px-3 text-xs">
                        <span className="font-semibold text-[#273931]">{w.expiresAt}</span>
                        {w.remainingDays > 0 && (
                          <small className="block text-xs text-[#176b58] font-bold">
                            (Còn {w.remainingDays} ngày)
                          </small>
                        )}
                      </td>
                      <td className="px-3">
                        <StatusTag label={w.status} type={w.statusType} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Lookup Result Modal */}
        <Modal
          isOpen={lookupOpen}
          onClose={() => setLookupOpen(false)}
          maxWidth="md"
          eyebrow="E-WARRANTY LOOKUP"
          title="Tra cứu sổ bảo hành điện tử"
          subtitle="Nhập thông tin mã bảo hành hoặc số điện thoại để xem chi tiết quyền lợi bảo hành."
          footer={
            <div className="flex justify-end gap-2.5 w-full">
              <Button variant="secondary" size="md" onClick={() => setLookupOpen(false)}>
                Đóng
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <form onSubmit={handleLookup} className="flex gap-2">
              <input
                type="text"
                placeholder="Nhập mã bảo hành (PC26-WR-...) hoặc số điện thoại..."
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                className="text-sm px-3.5 py-2.5 rounded-[8px] border border-[#d2dcd6] bg-white outline-none focus:border-[#176b58] focus:ring-1 focus:ring-[#176b58] flex-1"
              />
              <Button type="submit" variant="primary" size="md" disabled={isLookingUp}>
                {isLookingUp ? 'Đang tìm...' : 'Tra cứu'}
              </Button>
            </form>

            {lookupResult && (
              <div className="p-4 bg-[#f8faf9] border border-[#e2ece6] rounded-[10px] space-y-3">
                <div className="flex justify-between items-center pb-2.5 border-b border-[#e5efe9]">
                  <div>
                    <span className="text-xs font-mono font-bold text-[#176b58]">
                      {lookupResult.warranty_code || lookupResult.code}
                    </span>
                    <h3 className="font-heading font-bold text-base text-[#1c302b] m-0">
                      {lookupResult.device_model?.name || lookupResult.device}
                    </h3>
                  </div>
                  <StatusTag
                    label={
                      lookupResult.status === 'voided' || lookupResult.status === 'Đã hủy'
                        ? 'Đã hủy'
                        : lookupResult.status === 'expired' || lookupResult.status === 'Hết hạn' || (lookupResult.remainingDays !== undefined && lookupResult.remainingDays <= 0)
                        ? 'Hết hạn'
                        : 'Còn hạn'
                    }
                    type={
                      lookupResult.status === 'voided' || lookupResult.status === 'Đã hủy'
                        ? 'danger'
                        : lookupResult.status === 'expired' || lookupResult.status === 'Hết hạn' || (lookupResult.remainingDays !== undefined && lookupResult.remainingDays <= 0)
                        ? 'gray'
                        : 'ready'
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[#86968f] block">Chủ sở hữu:</span>
                    <strong className="text-[#1c302b]">
                      {lookupResult.customer?.name || lookupResult.customerName}
                    </strong>
                    <div className="text-[#65766e]">{lookupResult.customer?.phone || lookupResult.phone}</div>
                  </div>
                  <div>
                    <span className="text-[#86968f] block">Mã đơn sửa chữa:</span>
                    <strong className="text-[#176b58] font-mono">
                      {lookupResult.repair_order?.order_code || lookupResult.orderCode}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#86968f] block">Thời hạn bảo hành:</span>
                    <strong className="text-[#1c302b]">
                      {lookupResult.duration_days ?? lookupResult.warranty_period_days ?? lookupResult.periodDays} ngày
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#86968f] block">Hạn bảo hành đến:</span>
                    <strong className="text-[#176b58]">
                      {lookupResult.expires_at || lookupResult.end_date || lookupResult.expiresAt}
                    </strong>
                  </div>
                </div>

                <div className="p-2.5 bg-white rounded border border-[#edf2ef] text-xs text-[#52635a]">
                  📌 <b>Chính sách bảo hành:</b> Bảo hành đổi mới linh kiện tương đương nếu phát sinh lỗi kỹ thuật do linh kiện (không bao gồm rơi vỡ, vô nước, can thiệp bên thứ 3).
                </div>
              </div>
            )}
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
