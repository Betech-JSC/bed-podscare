'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { auditService } from '@podscare/api-client';
import { Button, EmptyState, FilterBar, Icon } from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { AuditDiffModal } from '../components/AuditDiffModal';

interface AuditItem {
  id: number;
  time: string;
  created_at?: string;
  user: string;
  action: string;
  detail: string;
  source: string;
  auditable_type?: string | null;
  auditable_id?: number | null;
  old_values?: Record<string, any> | null;
  new_values?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  has_diff: boolean;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState('');
  const [onlyWithDiff, setOnlyWithDiff] = useState(false);
  const [selectedLogForDiff, setSelectedLogForDiff] = useState<AuditItem | null>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: any = { per_page: 50 };
      if (search.trim()) params.q = search.trim();
      if (onlyWithDiff) params.has_diff = true;

      const res = await auditService.getAuditLogs(params);
      const rawData = res?.data;
      const items = Array.isArray(rawData) ? rawData : rawData?.data;

      if (Array.isArray(items) && items.length > 0) {
        const mapped: AuditItem[] = items.map((log: any) => {
          const hasDiff = Boolean(
            (log.old_values && Object.keys(log.old_values).length > 0) ||
            (log.new_values && Object.keys(log.new_values).length > 0)
          );
          return {
            id: log.id,
            time: log.created_at
              ? new Date(log.created_at).toLocaleString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  day: '2-digit',
                  month: '2-digit',
                })
              : log.time || 'Vừa xong',
            created_at: log.created_at,
            user: log.user_name || log.user?.name || 'Hệ thống',
            action: log.action || 'Thao tác',
            detail: log.details || log.detail || '—',
            source: log.ip_address || log.channel || log.source || 'Hệ thống',
            auditable_type: log.auditable_type,
            auditable_id: log.auditable_id,
            old_values: log.old_values,
            new_values: log.new_values,
            metadata: log.metadata,
            has_diff: hasDiff,
          };
        });
        setLogs(mapped);
      } else {
        setLogs([]);
      }
    } catch (err) {
      console.warn('Could not fetch audit logs from backend:', err);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [search, onlyWithDiff]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLogs();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchLogs]);

  return (
    <AppShell crumbName="Nhật ký hoạt động">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1">
              FIELD-LEVEL AUDIT TRAIL OS
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Nhật ký hoạt động & Kiểm toán thay đổi
            </h1>
            <p className="text-sm text-[#85928c] mt-1 mb-0">
              Theo dõi toàn bộ lịch sử thao tác, đối soát tài chính và so sánh JSON diffs (giá trị cũ vs giá trị mới).
            </p>
          </div>
          <div className="flex items-center gap-2.5">
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
        </div>

        <div className="bg-white rounded-[10px] border border-[#e5ece8] p-4 sm:p-5 shadow-xs space-y-4">
          {/* Bộ lọc tìm kiếm và chỉ xem bản ghi có diff */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[260px]">
              <FilterBar
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Tìm theo người thực hiện, hành động, nội dung chi tiết..."
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="filter-all-logs"
                onClick={() => setOnlyWithDiff(false)}
                className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer ${
                  !onlyWithDiff
                    ? 'bg-[#176b58] text-white shadow-xs'
                    : 'bg-[#f4f7f5] text-[#556960] hover:bg-[#eaf0ec]'
                }`}
              >
                Tất cả hoạt động
              </button>
              <button
                type="button"
                data-testid="filter-diff-logs"
                onClick={() => setOnlyWithDiff(true)}
                className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  onlyWithDiff
                    ? 'bg-[#176b58] text-white shadow-xs'
                    : 'bg-[#f4f7f5] text-[#556960] hover:bg-[#eaf0ec]'
                }`}
              >
                <Icon name="refresh" size={13} />
                <span>Chỉ bản ghi có Diff (Old vs New)</span>
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-[#176b58]/20 border-t-[#176b58] animate-spin" />
              <span className="text-xs font-medium text-[#7a8a81]">Đang nạp nhật ký kiểm toán...</span>
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              icon="audit"
              title="Chưa có nhật ký hoạt động phù hợp"
              description="Chưa có bản ghi hoạt động nào khớp với bộ lọc tra cứu trong hệ thống."
              actionLabel="Làm mới"
              onAction={fetchLogs}
            />
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="border-y border-[#f0f3f1] bg-[#fafbfa] text-xs font-bold text-[#9aa59f] uppercase tracking-wider h-10">
                    <th className="px-3">Thời gian</th>
                    <th className="px-3">Người thực hiện</th>
                    <th className="px-3">Hoạt động</th>
                    <th className="px-3">Đối tượng</th>
                    <th className="px-3">Chi tiết</th>
                    <th className="px-3 text-center">Diff JSON</th>
                    <th className="px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f2] text-sm">
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => {
                        if (log.has_diff) {
                          setSelectedLogForDiff(log);
                        }
                      }}
                      className={`h-12 transition-colors ${
                        log.has_diff ? 'hover:bg-[#f6faf8] cursor-pointer' : 'hover:bg-[#fafcfa]'
                      }`}
                    >
                      <td className="px-3 text-[#8a9690] font-mono text-xs whitespace-nowrap">
                        {log.time}
                      </td>
                      <td className="px-3 font-semibold text-[#1c302b] whitespace-nowrap">
                        {log.user}
                      </td>
                      <td className="px-3 text-[#176b58] font-bold whitespace-nowrap">
                        {log.action}
                      </td>
                      <td className="px-3 text-xs font-mono text-[#556960] whitespace-nowrap">
                        {log.auditable_type ? `${log.auditable_type} #${log.auditable_id}` : '—'}
                      </td>
                      <td className="px-3 text-[#44554d] text-xs max-w-[280px]">
                        <p className="line-clamp-2 m-0" title={log.detail}>
                          {log.detail}
                        </p>
                      </td>
                      <td className="px-3 text-center">
                        {log.has_diff ? (
                          <span
                            data-testid={`diff-badge-${log.id}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[10px] font-black uppercase tracking-wider bg-[#eaf4ef] text-[#176b58] border border-[#c2ded0]"
                          >
                            <Icon name="refresh" size={10} />
                            <span>CÓ DIFF</span>
                          </span>
                        ) : (
                          <span className="text-[#a5b3ab] text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 text-right whitespace-nowrap">
                        {log.has_diff ? (
                          <button
                            type="button"
                            data-testid={`view-diff-btn-${log.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLogForDiff(log);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-xs font-bold bg-[#176b58] text-white hover:bg-[#125848] transition-colors cursor-pointer shadow-2xs"
                          >
                            <span>So sánh Diff</span>
                            <span className="text-[10px]">↗</span>
                          </button>
                        ) : (
                          <span className="text-[#a5b3ab] text-xs font-mono">{log.source}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal So sánh JSON Diff Old vs New Values */}
        <AuditDiffModal
          isOpen={Boolean(selectedLogForDiff)}
          onClose={() => setSelectedLogForDiff(null)}
          log={selectedLogForDiff as any}
        />
      </div>
    </AppShell>
  );
}
