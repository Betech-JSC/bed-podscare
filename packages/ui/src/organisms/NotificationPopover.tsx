import React, { useState, useMemo } from 'react';
import { Icon } from '../atoms/Icons';

export type NotificationSeverity = 'info' | 'warning' | 'danger' | 'success';

export type NotificationType =
  | 'order_status'
  | 'order_created'
  | 'order_reception'
  | 'repair'
  | 'sla_warning'
  | 'sla'
  | 'qc_action'
  | 'qc'
  | 'quote_action'
  | 'quote'
  | 'delivery'
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
  onTestSound?: () => void;
  className?: string;
}

type TabType = 'all' | 'unread' | 'sla' | 'orders' | 'quotes';

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

interface EventVisual {
  iconName: string;
  unreadIconClass: string;
  readIconClass: string;
}

/**
 * Phân loại trực quan icon và màu sắc theo nghiệp vụ FIXO Design System
 */
function getNotificationVisual(item: NotificationItem): EventVisual {
  const title = (item.title || '').toLowerCase();
  const msg = (item.message || '').toLowerCase();
  const type = (item.type || '').toLowerCase();
  const sev = item.severity;

  // 1. Cảnh báo SLA / Quá hạn / Nguy cấp (Icon chuông báo alert - Màu hổ phách/đỏ cam)
  if (
    sev === 'danger' ||
    type === 'sla_warning' ||
    type === 'sla' ||
    title.includes('sla') ||
    title.includes('quá hạn') ||
    title.includes('cảnh báo') ||
    msg.includes('quá hạn') ||
    msg.includes('vượt ngưỡng')
  ) {
    return {
      iconName: 'alert',
      unreadIconClass: 'bg-[#fbefed] text-[#bc5b52] border border-[#f5dbd7]',
      readIconClass: 'bg-[#faf2f0] text-[#b8766f] border border-[#f0dedb]',
    };
  }

  // 2. Tiếp nhận / Đơn mới tạo (Icon hộp / thiết bị / tiếp nhận - Calm Jade)
  if (
    type === 'order_created' ||
    type === 'order_reception' ||
    type === 'intake' ||
    title.includes('tiếp nhận') ||
    title.includes('đơn mới') ||
    msg.includes('tiếp nhận') ||
    msg.includes('đã được tiếp nhận')
  ) {
    return {
      iconName: 'package',
      unreadIconClass: 'bg-[#e7f3ee] text-[#176b51] border border-[#d2eadc]',
      readIconClass: 'bg-[#f2f7f4] text-[#5e776c] border border-[#e5ebe7]',
    };
  }

  // 3. Báo giá (Icon hóa đơn / biên lai / quotes - Vàng hổ phách Warm Ivory)
  if (
    type === 'quote_action' ||
    type === 'quote' ||
    title.includes('báo giá') ||
    msg.includes('báo giá')
  ) {
    return {
      iconName: 'receipt',
      unreadIconClass: 'bg-[#faf3e7] text-[#b77a21] border border-[#f3e3ca]',
      readIconClass: 'bg-[#f7f4ee] text-[#8e764f] border border-[#eae3d5]',
    };
  }

  // 4. Kiểm định QC (Icon khiên / tích xanh - Tím nhạt)
  if (
    type === 'qc_action' ||
    type === 'qc' ||
    title.includes('qc') ||
    title.includes('kiểm định') ||
    msg.includes('kiểm định')
  ) {
    return {
      iconName: 'qc',
      unreadIconClass: 'bg-[#f2eff8] text-[#7e729c] border border-[#e4dcf0]',
      readIconClass: 'bg-[#f5f3f9] text-[#7b7194] border border-[#ebe7f2]',
    };
  }

  // 5. Sẵn sàng giao / Hoàn tất / Đã giao (Icon xe giao / check - Xanh lá tươi)
  if (
    type === 'delivery' ||
    type === 'ready' ||
    type === 'completed' ||
    sev === 'success' ||
    title.includes('giao') ||
    title.includes('hoàn tất') ||
    title.includes('sẵn sàng')
  ) {
    return {
      iconName: 'truck',
      unreadIconClass: 'bg-[#eaf5ef] text-[#28805e] border border-[#d2eadc]',
      readIconClass: 'bg-[#f2f7f4] text-[#567a6b] border border-[#e5ece8]',
    };
  }

  // 6. Kỹ thuật / Sửa chữa (Icon cờ lê / mỏ lết - Xanh dương)
  if (
    type === 'repair' ||
    type === 'order_status' ||
    title.includes('sửa chữa') ||
    title.includes('kỹ thuật') ||
    title.includes('linh kiện')
  ) {
    return {
      iconName: 'wrench',
      unreadIconClass: 'bg-[#edf4f8] text-[#4778a4] border border-[#d3e5f2]',
      readIconClass: 'bg-[#f3f6f9] text-[#5a7b97] border border-[#e2eaf0]',
    };
  }

  // 7. Mặc định
  return {
    iconName: 'bell',
    unreadIconClass: 'bg-[#e7f3ee] text-[#176b51] border border-[#d2eadc]',
    readIconClass: 'bg-[#f2f7f4] text-[#77847e] border border-[#e5ebe7]',
  };
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
  onTestSound,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('all');

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length;
  }, [notifications]);

  // Thống kê số lượng theo từng nhóm tab
  const tabCounts = useMemo(() => {
    let unread = 0;
    let sla = 0;
    let orders = 0;
    let quotes = 0;

    notifications.forEach((item) => {
      const title = (item.title || '').toLowerCase();
      const msg = (item.message || '').toLowerCase();
      const type = (item.type || '').toLowerCase();

      if (!item.isRead) unread++;
      if (
        item.severity === 'danger' ||
        type === 'sla_warning' ||
        type === 'sla' ||
        title.includes('sla') ||
        title.includes('quá hạn') ||
        msg.includes('sla')
      ) {
        sla++;
      }
      if (
        type === 'order_status' ||
        type === 'order' ||
        type === 'order_created' ||
        type === 'order_reception' ||
        Boolean(item.orderCode) ||
        title.includes('đơn') ||
        title.includes('tiếp nhận')
      ) {
        orders++;
      }
      if (
        type === 'quote_action' ||
        type === 'quote' ||
        title.includes('báo giá') ||
        msg.includes('báo giá')
      ) {
        quotes++;
      }
    });

    return {
      all: notifications.length,
      unread,
      sla,
      orders,
      quotes,
    };
  }, [notifications]);

  const tabs: { key: TabType; label: string; count?: number }[] = [
    { key: 'all', label: 'Tất cả', count: tabCounts.all },
    { key: 'unread', label: 'Chưa đọc', count: tabCounts.unread },
    { key: 'sla', label: 'Cảnh báo SLA', count: tabCounts.sla > 0 ? tabCounts.sla : undefined },
    { key: 'orders', label: 'Đơn sửa chữa', count: tabCounts.orders > 0 ? tabCounts.orders : undefined },
    { key: 'quotes', label: 'Báo giá', count: tabCounts.quotes > 0 ? tabCounts.quotes : undefined },
  ];

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      const title = (item.title || '').toLowerCase();
      const msg = (item.message || '').toLowerCase();
      const type = (item.type || '').toLowerCase();

      if (activeTab === 'unread') {
        return !item.isRead;
      }
      if (activeTab === 'sla') {
        return (
          item.severity === 'danger' ||
          type === 'sla_warning' ||
          type === 'sla' ||
          title.includes('sla') ||
          title.includes('quá hạn') ||
          msg.includes('sla')
        );
      }
      if (activeTab === 'orders') {
        return (
          type === 'order_status' ||
          type === 'order' ||
          type === 'order_created' ||
          type === 'order_reception' ||
          Boolean(item.orderCode) ||
          title.includes('đơn') ||
          title.includes('tiếp nhận')
        );
      }
      if (activeTab === 'quotes') {
        return (
          type === 'quote_action' ||
          type === 'quote' ||
          title.includes('báo giá') ||
          msg.includes('báo giá')
        );
      }
      return true;
    });
  }, [notifications, activeTab]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Trung tâm thông báo"
      className={`absolute right-0 top-full mt-2 w-[440px] sm:w-[460px] max-w-[calc(100vw-24px)] bg-white rounded-[12px] border border-[#e5ece8] shadow-[0_24px_60px_rgba(20,40,30,0.18)] z-50 overflow-hidden flex flex-col font-sans text-[#1c302b] animate-in fade-in zoom-in-95 duration-150 ${className}`}
    >
      {/* 1. Header Tinh chỉnh */}
      <div className="p-3.5 sm:p-4 border-b border-[#e9eeeb] bg-[#fafcfb] flex items-center justify-between gap-3">
        {/* Left: Icon chuông xanh Calm Jade + Tiêu đề + Badge mới + Subtitle Realtime */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-[10px] bg-[#e7f3ee] text-[#176b51] border border-[#d6eae0] grid place-items-center shrink-0 shadow-2xs">
            <Icon name="bell" size={17} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-heading font-bold text-[14px] text-[#1c302b] m-0 leading-none whitespace-nowrap">
                Thông báo vận hành
              </h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#faf3e7] text-[#b77a21] border border-[#f3e3ca] shadow-2xs shrink-0 whitespace-nowrap">
                  {unreadCount} mới
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#176b51] animate-pulse shrink-0" />
              <p className="text-[11px] text-[#758780] m-0 font-medium whitespace-nowrap">
                Kênh Socket thời gian thực
              </p>
            </div>
          </div>
        </div>

        {/* Right: Header Action Tools (Test sound, Mute audio & Close) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Test Sound Button: Nút "Thử âm thanh" với icon loa để phát tiếng chuông tức thì */}
          {onTestSound && (
            <button
              type="button"
              onClick={onTestSound}
              title="Thử âm thanh chuông thông báo"
              aria-label="Thử âm thanh chuông thông báo"
              className="h-7 px-2.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-all border shadow-2xs cursor-pointer bg-[#fbfdfc] text-[#176b51] border-[#d8ebe1] hover:bg-[#eaf5ef] active:scale-95"
            >
              <Icon name="volume" size={12} />
              <span className="whitespace-nowrap">Thử âm thanh</span>
            </button>
          )}

          {/* Mute/Unmute Audio Toggle: Pill button bo góc mềm mại, icon chuông gạch chéo tinh tế */}
          {onToggleMute && (
            <button
              type="button"
              onClick={onToggleMute}
              title={isMuted ? 'Bật âm thanh thông báo' : 'Tắt âm thanh thông báo'}
              aria-label={isMuted ? 'Bật âm thanh thông báo' : 'Tắt âm thanh thông báo'}
              className={`h-7 px-2.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-all border shadow-2xs cursor-pointer ${
                isMuted
                  ? 'bg-[#fcf3f2] text-[#bc5b52] border-[#f5dbd7] hover:bg-[#fae7e4]'
                  : 'bg-[#f0f7f4] text-[#176b51] border-[#d4eae0] hover:bg-[#e4f2eb]'
              }`}
            >
              <Icon name={isMuted ? 'bellOff' : 'bell'} size={12} />
              <span className="whitespace-nowrap">{isMuted ? 'Tắt chuông' : 'Bật chuông'}</span>
            </button>
          )}

          {/* Close Popover (X) cân đối */}
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full text-[#81908a] hover:bg-[#f0f3f1] hover:text-[#1c302b] grid place-items-center transition-colors cursor-pointer"
            aria-label="Đóng bảng thông báo"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>

      {/* 2. Thanh phân loại Tabs (Toàn quyền độ rộng, cuộn ngang mượt mà, không bao giờ bị cắt chữ) */}
      <div className="px-3.5 py-2.5 border-b border-[#e9eeeb] bg-[#fafbfa] flex items-center gap-1.5 overflow-x-auto scrollbar-none no-scrollbar whitespace-nowrap select-none">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`h-7 px-3 rounded-full text-[11px] shrink-0 inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-[#176b51] text-white font-semibold shadow-xs border border-[#176b51]'
                  : 'bg-[#f0f3f1] text-[#55655f] hover:bg-[#e6ebe8] hover:text-[#1c302b] font-medium border border-transparent'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] leading-tight ${
                    isActive
                      ? 'bg-white/20 text-white font-semibold'
                      : 'bg-white text-[#55655f] border border-[#e0e6e2]'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 2b. Thanh công cụ phụ tinh tế: Hiển thị trạng thái chưa đọc & Đọc tất cả (không chèn ép các tab) */}
      {unreadCount > 0 && onMarkAllAsRead && (
        <div className="px-4 py-2 bg-[#f6faf8] border-b border-[#e5ebe7] flex items-center justify-between text-[11px] select-none">
          <div className="flex items-center gap-1.5 text-[#5e776c]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#176b51]" />
            <span>
              Có <strong className="text-[#176b51] font-bold">{unreadCount} thông báo</strong> chưa đọc
            </span>
          </div>
          <button
            type="button"
            onClick={onMarkAllAsRead}
            title="Đánh dấu tất cả là đã đọc"
            className="font-semibold text-[#176b51] hover:text-[#10583f] flex items-center gap-1 transition-colors cursor-pointer py-0.5 px-2 rounded-md hover:bg-[#e7f3ee]"
          >
            <Icon name="checkCheck" size={13} />
            <span>Đọc tất cả</span>
          </button>
        </div>
      )}

      {/* 3. Danh sách thông báo (Notification Items) */}
      <div className="max-h-[400px] overflow-y-auto divide-y divide-[#f0f3f1] scrollbar-thin">
        {filteredNotifications.length === 0 ? (
          /* Empty State */
          <div className="py-12 px-6 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-[#f4f7f5] text-[#81908a] grid place-items-center mb-3 border border-[#e5ebe7]">
              <Icon name="bell" size={22} />
            </div>
            <h4 className="font-heading font-bold text-[13px] text-[#1c302b] m-0">
              Không có thông báo nào trong mục này
            </h4>
            <p className="text-[11px] text-[#758780] max-w-[280px] mt-1.5 m-0 leading-relaxed">
              {activeTab === 'unread'
                ? 'Bạn đã đọc hết tất cả thông báo vận hành mới.'
                : activeTab === 'sla'
                ? 'Tuyệt vời! Không có cảnh báo vượt ngưỡng SLA nào cần can thiệp.'
                : activeTab === 'orders'
                ? 'Chưa có thông báo liên quan đến đơn hàng trong mục này.'
                : activeTab === 'quotes'
                ? 'Chưa có thông báo liên quan đến báo giá trong mục này.'
                : 'Các sự kiện vòng đời đơn hàng và cảnh báo từ Socket sẽ xuất hiện tại đây.'}
            </p>
          </div>
        ) : (
          filteredNotifications.map((item) => {
            const visual = getNotificationVisual(item);
            const isUnread = !item.isRead;

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (isUnread) {
                    onMarkAsRead?.(item.id);
                  }
                  onNotificationClick?.(item);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    if (isUnread) {
                      onMarkAsRead?.(item.id);
                    }
                    onNotificationClick?.(item);
                  }
                }}
                className={`p-3.5 sm:p-4 transition-all cursor-pointer flex items-start gap-3 select-none text-left ${
                  isUnread
                    ? 'bg-emerald-50/40 hover:bg-emerald-50/70 border-l-[3.5px] border-[#176b51]'
                    : 'bg-white hover:bg-[#fafbfa] border-l-[3.5px] border-transparent'
                }`}
              >
                {/* Semantic Icon Box */}
                <div
                  className={`w-8.5 h-8.5 rounded-[9px] grid place-items-center shrink-0 ${
                    isUnread ? visual.unreadIconClass : visual.readIconClass
                  }`}
                >
                  <Icon name={visual.iconName} size={16} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className={`text-xs truncate ${
                          isUnread
                            ? 'font-bold text-[#1c302b]'
                            : 'font-semibold text-stone-600'
                        }`}
                      >
                        {item.title}
                      </span>
                      {item.orderCode && (
                        <span
                          className={`font-mono px-2 py-0.5 rounded-md text-xs shrink-0 ${
                            isUnread
                              ? 'bg-stone-100 text-stone-700 font-semibold border border-stone-200/80'
                              : 'bg-stone-100/70 text-stone-500 font-medium border border-stone-200/60'
                          }`}
                        >
                          {item.orderCode}
                        </span>
                      )}
                    </div>

                    {isUnread && (
                      <span
                        className="w-2.5 h-2.5 rounded-full bg-emerald-600 ring-4 ring-emerald-100 shrink-0 ml-1"
                        title="Chưa đọc"
                      />
                    )}
                  </div>

                  <p
                    className={`text-[12px] mt-1 line-clamp-2 leading-relaxed m-0 ${
                      isUnread ? 'text-[#4a5852]' : 'text-stone-500'
                    }`}
                  >
                    {item.message}
                  </p>

                  <div
                    className={`flex items-center gap-1.5 text-[11px] mt-2 ${
                      isUnread ? 'text-[#7e8e86]' : 'text-stone-400'
                    }`}
                  >
                    <Icon name="clock" size={12} className={isUnread ? 'text-[#81908a]' : 'text-stone-400'} />
                    <span>{formatRelativeTime(item.timestamp)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Footer Info */}
      <div className="p-3 px-4 bg-[#f8faf9] border-t border-[#e9eeeb] flex items-center justify-between text-[11px] text-[#758780]">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#176b51] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#176b51]" />
          </span>
          <span className="font-medium text-[#1c302b]">FIXO Realtime Dispatch</span>
        </div>
        <span className="text-[10px] text-[#81908a]">Vòng đời đơn hàng & SLA</span>
      </div>
    </div>
  );
};
