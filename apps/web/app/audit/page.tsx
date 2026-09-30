'use client';

import React, { useState, useEffect } from 'react';
import { auditService } from '@podscare/api-client';
import { Button } from '@podscare/ui';
import { AppShell } from '../components/AppShell';

interface AuditItem {
  time: string;
  user: string;
  action: string;
  detail: string;
  source: string;
}

const fallbackLogs: AuditItem[] = [
  { time: '10:42:18', user: 'Tuấn K.', action: 'Cập nhật trạng thái', detail: 'PC26-00981 · Đang sửa', source: '192.168.1.24' },
  { time: '10:26:05', user: 'Hệ thống', action: 'Khách duyệt báo giá', detail: 'PC26-00972 · 850.000 ₫', source: 'Customer portal' },
  { time: '10:04:41', user: 'Duy T.', action: 'QC đạt', detail: 'PC26-00970 · Sẵn sàng trả', source: '192.168.1.28' },
  { time: '09:43:12', user: 'Kho · Hạnh', action: 'Xuất linh kiện', detail: 'PC26-00977 · BAT-APP2-01 × 1', source: '192.168.1.19' },
  { time: '09:18:53', user: 'Lan Phạm', action: 'Tạo đơn sửa chữa', detail: 'PC26-00981 · Tiếp nhận mới', source: '192.168.1.31' },
  { time: '08:52:04', user: 'Hệ thống', action: 'Cập nhật shipment', detail: 'PC26-SH-114 · Đã giao thành công', source: 'GHN webhook' },
];

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditItem[]>(fallbackLogs);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await auditService.getAuditLogs({ per_page: 30 });
      const rawData = res?.data;
      const items = Array.isArray(rawData) ? rawData : rawData?.data;

      if (Array.isArray(items) && items.length > 0) {
        const mapped: AuditItem[] = items.map((log: any) => ({
          time: log.created_at
            ? new Date(log.created_at).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })
            : log.time || 'Vừa xong',
          user: log.user_name || log.user?.name || 'Hệ thống',
          action: log.action || 'Thao tác',
          detail: log.details || log.detail || '—',
          source: log.ip_address || log.channel || log.source || 'Hệ thống',
        }));
        setLogs(mapped);
      }
    } catch (err) {
      console.warn('Could not fetch audit logs from backend, using fallback:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <AppShell crumbName="Nhật ký hoạt động">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1">
              AUDIT TRAIL
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Nhật ký hoạt động hệ thống
            </h1>
            <p className="text-sm text-[#85928c] mt-1 mb-0">
              Lịch sử thao tác trong hệ thống, phục vụ đối soát và kiểm tra bảo mật.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon="refresh"
            disabled={isLoading}
            onClick={fetchLogs}
          >
            {isLoading ? 'Đang tải...' : 'Làm mới'}
          </Button>
        </div>

        <div className="bg-white rounded-[10px] border border-[#e5ece8] p-4 sm:p-5 shadow-xs">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#9aa59f] uppercase tracking-wider h-9">
                  <th className="px-3">Thời gian</th>
                  <th className="px-3">Người thực hiện</th>
                  <th className="px-3">Hoạt động</th>
                  <th className="px-3">Chi tiết</th>
                  <th className="px-3">Nguồn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f3f2] text-sm">
                {logs.map((log, i) => (
                  <tr key={i} className="h-11 hover:bg-[#fafcfa]">
                    <td className="px-3 text-[#8a9690] font-mono text-xs">{log.time}</td>
                    <td className="px-3 font-semibold text-[#1c302b]">{log.user}</td>
                    <td className="px-3 text-[#176b58] font-medium">{log.action}</td>
                    <td className="px-3 text-[#55665d]">{log.detail}</td>
                    <td className="px-3 text-[#9aa59f] font-mono text-xs">{log.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
