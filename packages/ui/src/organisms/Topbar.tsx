import React from 'react';
import { Icon } from '../atoms/Icons';

export interface TopbarProps {
  crumbName: string;
  onOpenMobileMenu?: () => void;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  onOpenNotifications?: () => void;
  hasUnreadNotification?: boolean;
  unreadCount?: number;
  isNotificationOpen?: boolean;
  notificationSlot?: React.ReactNode;
  planBadgeSlot?: React.ReactNode;
}

export const Topbar: React.FC<TopbarProps> = ({
  crumbName,
  onOpenMobileMenu,
  searchValue = '',
  onSearchChange,
  onOpenNotifications,
  hasUnreadNotification = false,
  unreadCount,
  isNotificationOpen = false,
  notificationSlot,
  planBadgeSlot,
}) => {
  const todayFormatted = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date()).toUpperCase();

  return (
    <header className="h-16 bg-white border-b border-[#e5ece8] sticky top-0 z-30 px-4 md:px-8 flex items-center justify-between">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden w-9 h-9 rounded-[8px] text-[#708078] hover:bg-[#f1f4f2] grid place-items-center"
            aria-label="Mở menu"
          >
            <Icon name="menu" size={20} />
          </button>
        )}
        <div className="flex items-center gap-2 text-xs md:text-sm text-[#7e8e86]">
          <span>FIXO OS</span>
          <i className="not-italic text-[#c2cbc6]">/</i>
          <b className="text-[#20332d] font-semibold">{crumbName}</b>
        </div>
      </div>

      {/* Right: Plan Badge, Search, Notifications, Date */}
      <div className="flex items-center gap-2.5 sm:gap-4">
        {planBadgeSlot}

        {/* Global Search with ⌘K */}
        <div className="w-[200px] md:w-[260px] h-9 border border-[#e4eae6] rounded-[8px] hidden sm:flex items-center px-3 gap-2 text-[#91a098] bg-white focus-within:border-[#75a994] focus-within:ring-2 focus-within:ring-[#176b58]/10 transition-all">
          <Icon name="search" size={16} />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Tìm mã đơn, khách..."
            className="w-full text-sm outline-none bg-transparent text-[#1c302b] placeholder:text-[#9aa59f]"
          />
          <kbd className="text-xs font-sans border border-[#e6ebe8] rounded px-1.5 py-0.5 text-[#86928c] flex-none">
            ⌘ K
          </kbd>
        </div>

        {/* Notification Icon with Dot / Count & Popover Slot */}
        <div className="relative">
          {onOpenNotifications && (
            <button
              type="button"
              onClick={onOpenNotifications}
              className={`relative w-9 h-9 rounded-[8px] transition-colors grid place-items-center ${
                isNotificationOpen
                  ? 'bg-[#e7f3ee] text-[#176b51]'
                  : 'text-[#708078] hover:bg-[#f1f4f2]'
              }`}
              aria-label="Thông báo"
              aria-expanded={isNotificationOpen}
            >
              <Icon name="bell" size={19} />
              {typeof unreadCount === 'number' && unreadCount > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#d4874c] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white leading-none shadow-sm">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : hasUnreadNotification ? (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#d4874c] border border-white" />
              ) : null}
            </button>
          )}
          {notificationSlot}
        </div>

        <div className="h-6 border-l border-[#e5ece8] hidden md:block" />

        {/* Date Display */}
        <div className="text-xs tracking-[0.6px] text-[#7c8c85] font-semibold hidden md:block">
          {todayFormatted}
        </div>
      </div>
    </header>
  );
};
