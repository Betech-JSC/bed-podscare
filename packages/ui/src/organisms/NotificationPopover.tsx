import React, { useState, useMemo } from 'react';
import { Icon } from '../atoms/Icons';

export type NotificationSeverity = 'info' | 'warning' | 'danger' | 'success';

export type NotificationType =
  | 'order_status'
  | 'sla_warning'
  | 'qc_action'
  | 'quote_action'
  | 'system'
  | string;

export interface NotificationItem {
  id: string | number;
  type?: NotificationType;
  title: string;
  message: string;
  orderId?: string | number;
  orderCode?: string;
  severity?: NotificationSeverity;
  timestamp: string; // ISO 8601 hoặc chuỗi thời gian
  actionUrl?: string;
  isRead?: boolean;
  readAt?: string | null;
}

export interface NotificationPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onNotificationClick?: (item: NotificationItem) => void;
  onMarkAllAsRead?: () => void;
  onMarkAsRead?: (id: string | number) => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
  className?: string;
}

type TabType = 'all' | 'unread' | 'sla' | 'orders';

/**
 * Định dạng thời gian tương đối thân thiện theo tiếng Việt.
 */
function formatRelativeTime(dateStr: string): string {
  try {
    const timestamp = new Date(dateStr).getTime();
    if (isNaN(timestamp)) {
      return dateStr;
    }

    const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);

    if (diffSeconds < 45) return 'Vừa xong';
    if (diffSeconds < 3600) return `${Math.max(1, Math.floor(diffSeconds / 60))} phút trước`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} giờ trước`;
    if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)} ngày trước`;

    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return dateStr;
  }
}

export const NotificationPopover: React.FC<NotificationPopoverProps> = ({
  isOpen,
  onClose,
  notifications,
  onNotificationClick,
  onMarkAllAsRead,
  onMarkAsRead,
  isMuted = false,
  onToggleMute,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('all');

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length;
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      if (activeTab === 'unread') {
        return !item.isRead;
      }
      if (activeTab === 'sla') {
        return item.severity === 'danger' || item.type === 'sla_warning';
      }
      if (activeTab === 'orders') {
        return item.type === 'order_status' || Boolean(item.orderCode);
      }
      return true;
    });
  }, [notifications, activeTab]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Trung tâm thông báo"
      className={`absolute right-0 top-full mt-2 w-[360px] sm:w-[420px] max-w-[calc(100vw-32px)] bg-white rounded-[10px] border border-[#e5ece8] shadow-[0_20px_50px_rgba(20,40,30,0.15)] z-50 overflow-hidden flex flex-col font-sans text-[#1c302b] animate-in fade-in zoom-in-95 duration-150 ${className}`}
    >
      {/* Header */}
      <div className="p-3.5 sm:p-4 border-b border-[#e9eeeb] bg-[#fafcfb] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-[8px] bg-[#e7f3ee] text-[#176b51] grid place-items-center">
            <Icon name="bell" size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading font-bold text-sm text-[#1c302b] m-0 leading-tight">
                Thông báo vận hành
              </h3>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-[20px] text-[10px] font-semibold bg-[#faf3e7] text-[#b77a21] border border-[#f3e3ca]">
                  {unreadCount} mới
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#758780] m-0 mt-0.5">Kênh Socket thời gian thực</p>
          </div>
        </div>

        {/* Header Action Tools */}
        <div className="flex items-center gap-1.5">
          {/* Mute/Unmute Audio Toggle */}
          {onToggleMute && (
            <button
              type="button"
              onClick={onToggleMute}
              title={isMuted ? 'Bật âm thanh thông báo' : 'Tắt âm thanh thông báo'}
              aria-label={isMuted ? 'Bật âm thanh thông báo' : 'Tắt âm thanh thông báo'}
              className={`h-7 px-2 rounded-[6px] text-[10px] font-semibold flex items-center gap-1 transition-colors border ${
                isMuted
                  ? 'bg-[#fbefed] text-[#bc5b52] border-[#f5d7d3] hover:bg-[#f8e1dd]'
                  : 'bg-[#e7f3ee] text-[#176b51] border-[#cce8dc] hover:bg-[#daf0e6]'
              }`}
            >
              <Icon name="bell" size={12} />
              <span>{isMuted ? 'Tắt chuông' : 'Bật chuông'}</span>
            </button>
          )}

          {/* Close Popover */}
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-[6px] text-[#81908a] hover:bg-[#f1f4f2] hover:text-[#1c302b] grid place-items-center transition-colors"
            aria-label="Đóng bảng thông báo"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>

      {/* Tabs & Mark All Actions */}
      <div className="px-3 pt-2.5 pb-2 border-b border-[#e9eeeb] bg-white flex items-center justify-between gap-2">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 text-[11px] overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-2.5 py-1 rounded-[6px] font-semibold transition-colors flex-none ${
              activeTab === 'all'
                ? 'bg-[#176b51] text-white shadow-xs'
                : 'text-[#62736b] hover:bg-[#f1f4f2]'
            }`}
          >
            Tất cả ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('unread')}
            className={`px-2.5 py-1 rounded-[6px] font-semibold transition-colors flex-none ${
              activeTab === 'unread'
                ? 'bg-[#176b51] text-white shadow-xs'
                : 'text-[#62736b] hover:bg-[#f1f4f2]'
            }`}
          >
            Chưa đọc ({unreadCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sla')}
            className={`px-2.5 py-1 rounded-[6px] font-semibold transition-colors flex-none ${
              activeTab === 'sla'
                ? 'bg-[#176b51] text-white shadow-xs'
                : 'text-[#62736b] hover:bg-[#f1f4f2]'
            }`}
          >
            Cảnh báo SLA
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`px-2.5 py-1 rounded-[6px] font-semibold transition-colors flex-none ${
              activeTab === 'orders'
                ? 'bg-[#176b51] text-white shadow-xs'
                : 'text-[#62736b] hover:bg-[#f1f4f2]'
            }`}
          >
            Đơn hàng
          </button>
        </div>

        {/* Mark All As Read */}
        {unreadCount > 0 && onMarkAllAsRead && (
          <button
            type="button"
            onClick={onMarkAllAsRead}
            className="text-[11px] font-semibold text-[#176b51] hover:text-[#10583f] flex items-center gap-1 flex-none py-1 px-1.5 rounded hover:bg-[#e7f3ee] transition-colors"
          >
            <Icon name="check" size={13} />
            <span className="hidden sm:inline">Đọc tất cả</span>
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div className="max-h-[380px] overflow-y-auto divide-y divide-[#f0f3f1] scrollbar-thin">
        {filteredNotifications.length === 0 ? (
          /* Empty State */
          <div className="py-10 px-6 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-[#f4f7f5] text-[#81908a] grid place-items-center mb-2.5">
              <Icon name="bell" size={22} />
            </div>
            <h4 className="font-heading font-bold text-xs text-[#1c302b] m-0">
              Không có thông báo nào
            </h4>
            <p className="text-[11px] text-[#7e8e86] max-w-[260px] mt-1 m-0 leading-relaxed">
              {activeTab === 'unread'
                ? 'Bạn đã đọc hết tất cả thông báo vận hành mới.'
                : activeTab === 'sla'
                ? 'Tuyệt vời! Không có cảnh báo vượt ngưỡng SLA nào cần can thiệp.'
                : 'Các sự kiện vòng đời đơn hàng và cảnh báo từ Socket sẽ xuất hiện tại đây.'}
            </p>
          </div>
        ) : (
          filteredNotifications.map((item) => {
            const isDanger = item.severity === 'danger' || item.type === 'sla_warning';
            const isQc = item.type === 'qc_action';
            const isSuccess = item.severity === 'success';

            // Phối màu Icon box chuẩn Calm Jade & Warm Ivory
            const iconBadgeClass = isDanger
              ? 'bg-[#fbefed] text-[#bc5b52]'
              : isQc
              ? 'bg-[#f2eff8] text-[#7e729c]'
              : isSuccess
              ? 'bg-[#eaf5ef] text-[#28805e]'
              : 'bg-[#edf4f8] text-[#4778a4]';

            const iconName = isDanger ? 'alert' : isQc ? 'qc' : isSuccess ? 'check' : 'wrench';

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!item.isRead) {
                    onMarkAsRead?.(item.id);
                  }
                  onNotificationClick?.(item);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    if (!item.isRead) {
                      onMarkAsRead?.(item.id);
                    }
                    onNotificationClick?.(item);
                  }
                }}
                className={`p-3 sm:p-3.5 transition-colors cursor-pointer flex items-start gap-3 select-none text-left ${
                  !item.isRead
                    ? 'bg-[#f7faf8] hover:bg-[#edf5f0] border-l-[3px] border-[#176b51]'
                    : 'bg-white hover:bg-[#f9fbf9]'
                }`}
              >
                {/* Semantic Icon Box */}
                <div
                  className={`w-8 h-8 rounded-[8px] grid place-items-center flex-none ${iconBadgeClass}`}
                >
                  <Icon name={iconName} size={16} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className={`text-xs font-semibold truncate ${
                          !item.isRead ? 'text-[#1c302b]' : 'text-[#506057]'
                        }`}
                      >
                        {item.title}
                      </span>
                      {item.orderCode && (
                        <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-[#f0f3f1] text-[#4a5852] font-semibold flex-none">
                          {item.orderCode}
                        </span>
                      )}
                    </div>

                    {!item.isRead && (
                      <span
                        className="w-2 h-2 rounded-full bg-[#176b51] flex-none"
                        title="Chưa đọc"
                      />
                    )}
                  </div>

                  <p className="text-[11px] text-[#617169] mt-0.5 line-clamp-2 leading-relaxed m-0">
                    {item.message}
                  </p>

                  <div className="flex items-center gap-1 text-[10px] text-[#8a9992] mt-1.5">
                    <Icon name="clock" size={11} />
                    <span>{formatRelativeTime(item.timestamp)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-2.5 px-4 bg-[#f8faf9] border-t border-[#e9eeeb] flex items-center justify-between text-[11px] text-[#788880]">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#176b51]" />
          <span>PodsCare Realtime Dispatch</span>
        </div>
        <span className="text-[10px] text-[#93a29b]">Vòng đời đơn hàng & SLA</span>
      </div>
    </div>
  );
};
