'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { auditService, type AuditLogItem } from '@podscare/api-client';
import { Button, FilterBar, EmptyState, useToast } from '@podscare/ui';
import { AppShell } from '../components/AppShell';

interface FormattedEvent {
  id: number | string;
  time: string;
  title: string;
  sub: string;
  user: string;
  action: string;
  type: 'success' | 'progress' | 'warning' | 'info';
}

const fallbackEvents: FormattedEvent[] = [
  {
    id: 'fb-1',
    time: '10:42 Hôm nay',
    title: 'Cập nhật trạng thái sang Đang sửa',
    sub: 'KTV Tuấn K. · AirPods Pro 2 · PC26-00981',
    user: 'Tuấn K.',
    action: 'status_transition',
    type: 'progress',
  },
  {
    id: 'fb-2',
    time: '10:26 Hôm nay',
    title: 'Khách duyệt báo giá 850.000 ₫',
    sub: 'Khách hàng duyệt qua link tra cứu cá nhân · PC26-00980',
    user: 'Khách hàng',
    action: 'quote_approved',
    type: 'success',
  },
  {
    id: 'fb-3',
    time: '10:04 Hôm nay',
    title: 'QC thẩm định đạt 7 tiêu chí',
    sub: 'KTV Duy T. · Sẵn sàng trả máy cho khách · PC26-00979',
    user: 'Duy T.',
    action: 'qc_passed',
    type: 'success',
  },
  {
    id: 'fb-4',
    time: '09:18 Hôm nay',
    title: 'Tiếp nhận thiết bị mới tại quầy',
    sub: 'CSKH Lan Phạm · Chi nhánh Quận 1 · PC26-00978',
    user: 'Lan Phạm',
    action: 'order_created',
    type: 'info',
  },
  {
    id: 'fb-5',
    time: 'Hôm qua, 16:30',
    title: 'Hoàn tất bàn giao và bảo hành',
    sub: 'Khách hàng Nguyễn Thanh Vy đã nhận máy · PC26-00975',
    user: 'Minh Lê',
    action: 'order_completed',
    type: 'success',
  },
];

export default function TimelinePage() {
  const { toast } = useToast();
  const [events, setEvents] = useState<FormattedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const formatEventTime = (isoString?: string): string => {
    if (!isoString) return 'Vừa xong';
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date);
    } catch {
      return isoString;
    }
  };

  const getActionType = (action: string): 'success' | 'progress' | 'warning' | 'info' => {
    const act = (action || '').toLowerCase();
    if (act.includes('complete') || act.includes('pass') || act.includes('approved')) return 'success';
    if (act.includes('repair') || act.includes('progress') || act.includes('transition')) return 'progress';
    if (act.includes('reject') || act.includes('rework') || act.includes('fail')) return 'warning';
    return 'info';
  };

  const loadAuditLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await auditService.getAuditLogs({ per_page: 50 });
      const raw = res?.data;
      const list: AuditLogItem[] = Array.isArray(raw) ? raw : (raw?.data || []);

      if (Array.isArray(list) && list.length > 0) {
        const mapped: FormattedEvent[] = list.map((item: any, idx: number) => {
          const actionText = item.action || item.event || 'Cập nhật hệ thống';
          const userName = item.user?.name || item.user_name || 'Hệ thống';
          const details = item.details || item.detail || '';
          const target = item.auditable_type
            ? `${item.auditable_type.split('\\').pop()} #${item.auditable_id || ''}`
            : '';

          const subParts = [userName, details, target].filter(Boolean);

          return {
            id: item.id || `log-${idx}`,
            time: formatEventTime(item.created_at || item.time),
            title: actionText,
            sub: subParts.join(' · '),
            user: userName,
            action: item.action || 'system',
            type: getActionType(actionText),
          };
        });
        setEvents(mapped);
      } else {
        // Fallback to initial events if no logs created yet
        setEvents(fallbackEvents);
      }
    } catch (err) {
      console.warn('Could not fetch audit logs from API:', err);
      setEvents(fallbackEvents);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const filteredEvents = events.filter((ev) => {
    const query = search.toLowerCase();
    return (
      ev.title.toLowerCase().includes(query) ||
      ev.sub.toLowerCase().includes(query) ||
      ev.user.toLowerCase().includes(query)
    );
  });

  return (
    <AppShell crumbName="Timeline">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1">
              TIMELINE & AUDIT TRAIL
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Dòng sự kiện sửa chữa
            </h1>
            <p className="text-sm text-[#85928c] mt-1 mb-0">
              Diễn biến xử lý các đơn sửa chữa và nhật ký vận hành từ cơ sở dữ liệu hệ thống.
            </p>
          </div>
          <Button
            variant="secondary"
            size="md"
            icon="clock"
            onClick={() => {
              loadAuditLogs();
              toast('Đã làm mới dữ liệu timeline', 'info');
            }}
          >
            Làm mới
          </Button>
        </div>

        <div className="bg-white rounded-[10px] border border-[#e5ece8] p-5 sm:p-6 shadow-xs max-w-[900px]">
          <div className="mb-5">
            <FilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Tìm theo sự kiện, kỹ thuật viên hoặc mã đơn..."
            />
          </div>

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-[#176b58]/20 border-t-[#176b58] animate-spin" />
              <span className="text-xs font-medium text-[#7a8a81]">Đang nạp nhật ký từ máy chủ...</span>
            </div>
          ) : filteredEvents.length === 0 ? (
            <EmptyState
              title="Không tìm thấy sự kiện nào"
              description="Không có nhật ký nào phù hợp với bộ lọc tìm kiếm hiện tại."
              icon="search"
            />
          ) : (
            <div className="space-y-6 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-[1px] before:bg-[#e6ece8]">
              {filteredEvents.map((ev) => {
                const badgeColor =
                  ev.type === 'success'
                    ? 'border-[#176b58] text-[#176b58] bg-[#f0f7f3]'
                    : ev.type === 'progress'
                    ? 'border-[#2d7ba5] text-[#2d7ba5] bg-[#f0f6fa]'
                    : ev.type === 'warning'
                    ? 'border-[#c98327] text-[#c98327] bg-[#fdf8f0]'
                    : 'border-[#708078] text-[#708078] bg-[#f4f7f5]';

                return (
                  <div key={ev.id} className="flex gap-4 relative z-10">
                    <div
                      className={`w-[34px] h-[34px] rounded-full border-2 font-bold grid place-items-center text-xs flex-none shadow-xs ${badgeColor}`}
                    >
                      {ev.type === 'success' ? '✓' : ev.type === 'progress' ? '⚙' : '•'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <time className="text-xs text-[#9aa59f] font-semibold">{ev.time}</time>
                      <h4 className="font-heading font-bold text-sm text-[#1c302b] m-0 mt-0.5">
                        {ev.title}
                      </h4>
                      <p className="text-xs text-[#8c9992] m-0 mt-1 break-words">{ev.sub}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
