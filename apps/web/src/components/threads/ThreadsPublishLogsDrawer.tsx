'use client';

import React, { useMemo, useState } from 'react';
import { Icon } from '@podscare/ui';
import type { ThreadsPublishLog } from '@/src/lib/threads-api';

export interface ThreadsPublishLogsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  logs: ThreadsPublishLog[];
  inlineMode?: boolean;
  onRefreshLogs?: () => Promise<void>;
}

const ACTION_LABELS: Record<string, string> = {
  oauth_exchange: 'Đổi mã OAuth 2.0',
  token_refresh: 'Gia hạn Token 60 ngày',
  create_container: 'Bước 1 · Tạo Container',
  poll_container: 'Kiểm tra trạng thái Container',
  publish: 'Bước 2 · Xuất bản bài đăng',
  quota_check: 'Kiểm tra hạn mức 24h',
  fetch_permalink: 'Đồng bộ Permalink',
  alert_sent: 'Cảnh báo Telegram Bot',
};

/**
 * Đảm bảo mọi chuỗi token nhạy cảm luôn được hiển thị là [REDACTED_TOKEN]
 * ngay cả khi kiểm tra chéo ở tầng giao diện.
 */
function formatRedactedJson(payload: Record<string, unknown> | null): string {
  if (!payload) return '{}';
  try {
    const raw = JSON.stringify(payload, null, 2);
    return raw
      .replace(/("access_token"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED_TOKEN]"')
      .replace(/("client_secret"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED_TOKEN]"')
      .replace(/access_token=[^&\s"]+/gi, 'access_token=[REDACTED_TOKEN]');
  } catch {
    return '{}';
  }
}

export const ThreadsPublishLogsDrawer: React.FC<ThreadsPublishLogsDrawerProps> = ({
  isOpen,
  onClose,
  logs,
  inlineMode = false,
  onRefreshLogs,
}) => {
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<number | null>(logs[0]?.id ?? null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const filteredLogs = useMemo(() => {
    if (actionFilter === 'all') return logs;
    return logs.filter((l) => l.action === actionFilter);
  }, [actionFilter, logs]);

  if (!isOpen && !inlineMode) return null;

  const handleRefresh = async () => {
    if (!onRefreshLogs) return;
    setIsRefreshing(true);
    try {
      await onRefreshLogs();
    } finally {
      setIsRefreshing(false);
    }
  };

  const content = (
    <div className="bg-[#ffffff] border border-[#e9eeeb] rounded-[10px] overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-[#e9eeeb] bg-[#fafbfa] flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-[16px] font-bold text-[#17231f]">
              Nhật ký Gọi Meta Threads Graph API (threads_publish_logs)
            </h2>
            <span className="px-2 py-0.5 rounded-[20px] bg-[#eaf5ef] text-[#28805e] font-mono text-[10px] font-semibold">
              AES-256-GCM · Redacted
            </span>
          </div>
          <p className="text-[11px] text-[#81908a] mt-0.5">
            Toàn bộ trường access_token và client_secret đã được lọc bỏ tự động bằng [REDACTED_TOKEN] trước khi lưu DB
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            aria-label="Lọc nhật ký theo hành động"
            className="h-8 px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[11px] text-[#17231f]"
          >
            <option value="all">Tất cả hành động ({logs.length})</option>
            <option value="create_container">create_container (Bước 1)</option>
            <option value="poll_container">poll_container</option>
            <option value="publish">publish (Bước 2)</option>
            <option value="token_refresh">token_refresh (Gia hạn 60 ngày)</option>
            <option value="oauth_exchange">oauth_exchange</option>
            <option value="quota_check">quota_check</option>
            <option value="alert_sent">alert_sent (Telegram)</option>
          </select>

          {onRefreshLogs && (
            <button
              type="button"
              disabled={isRefreshing}
              onClick={() => void handleRefresh()}
              className="h-8 px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] hover:border-[#176b51] text-[#176b51] text-[11px] font-semibold inline-flex items-center gap-1.5"
            >
              <Icon name="refresh" size={14} />
              <span>{isRefreshing ? 'Đang tải...' : 'Làm mới'}</span>
            </button>
          )}

          {!inlineMode && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng ngăn nhật ký"
              className="w-8 h-8 rounded-[7px] inline-flex items-center justify-center text-[#516059] hover:bg-[#f0f3f1]"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Danh sách Logs */}
      <div className="divide-y divide-[#e9eeeb] overflow-y-auto flex-1">
        {filteredLogs.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-[#81908a]">
            Chưa có bản ghi nhật ký xuất bản nào cho bộ lọc này.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isSuccess =
              log.http_status !== null && log.http_status >= 200 && log.http_status < 300;
            const isExpanded = expandedLogId === log.id;

            return (
              <div key={log.id} className="p-3.5 hover:bg-[#f6f8f6]/60 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[20px] font-mono text-[10px] font-semibold ${
                        isSuccess
                          ? 'bg-[#eaf5ef] text-[#28805e]'
                          : 'bg-[#fbefed] text-[#bc5b52]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isSuccess ? 'bg-[#28805e]' : 'bg-[#bc5b52]'
                        }`}
                      />
                      HTTP {log.http_status ?? 200}
                    </span>

                    <span className="font-mono text-[11px] font-bold text-[#17231f] px-2 py-0.5 rounded bg-[#f0f3f1]">
                      {log.action}
                    </span>

                    <span className="text-[12px] font-medium text-[#516059]">
                      {ACTION_LABELS[log.action] || log.action}
                    </span>

                    {log.account && (
                      <span className="font-mono text-[11px] text-[#176b51]">
                        · @{log.account.username || log.account.display_name}
                      </span>
                    )}

                    {log.post_id && (
                      <span className="font-mono text-[11px] text-[#81908a]">
                        · Post #{log.post_id}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {log.duration_ms !== null && (
                      <span className="font-mono text-[11px] text-[#81908a]">
                        {log.duration_ms} ms
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-[#81908a]">
                      {new Date(log.created_at).toLocaleString('vi-VN')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      className="h-7 px-2.5 rounded-[6px] bg-[#ffffff] border border-[#e2e9e4] text-[10px] font-semibold text-[#17231f] hover:border-[#176b51]"
                    >
                      {isExpanded ? 'Thu gọn JSON' : 'Xem Payload'}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="p-2.5 rounded-[7px] bg-[#f6f8f6] border border-[#e9eeeb]">
                      <div className="text-[10px] font-bold uppercase tracking-[0.6px] text-[#81908a] mb-1">
                        Request Payload (Đã ẩn Access Token)
                      </div>
                      <pre className="font-mono text-[11px] text-[#17231f] whitespace-pre-wrap break-all overflow-x-auto">
                        {formatRedactedJson(log.request_payload)}
                      </pre>
                    </div>

                    <div className="p-2.5 rounded-[7px] bg-[#f6f8f6] border border-[#e9eeeb]">
                      <div className="text-[10px] font-bold uppercase tracking-[0.6px] text-[#81908a] mb-1">
                        Response Payload (Từ Meta Graph API)
                      </div>
                      <pre className="font-mono text-[11px] text-[#17231f] whitespace-pre-wrap break-all overflow-x-auto">
                        {formatRedactedJson(log.response_payload)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  if (inlineMode) {
    return content;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ngăn tra cứu lịch sử gọi API Threads"
      className="fixed inset-0 z-50 flex justify-end bg-[#17231f]/40"
    >
      <div className="w-full max-w-[780px] h-full bg-[#ffffff] shadow-modal p-4 overflow-hidden flex flex-col">
        {content}
      </div>
    </div>
  );
};

export default ThreadsPublishLogsDrawer;
