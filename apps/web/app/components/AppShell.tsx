'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AppSidebar, Topbar, NotificationPopover, type NotificationItem } from '@podscare/ui';
import { usePodsCare, useNotifications } from '../providers';
import { playChimeTone } from '../utils/audioChime';

export interface AppShellProps {
  children: React.ReactNode;
  crumbName?: string;
  actions?: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children, crumbName = 'Tổng quan' }) => {
  const router = useRouter();
  const pathname = usePathname();
  const {
    currentUser,
    branch,
    branchId,
    setBranch,
    branches,
    orders,
    isAuthenticated,
    isLoadingAuth,
    logout,
  } = usePodsCare();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');

  // Quản lý Notification Center Popover kết nối trực tiếp với NotificationProvider & Web Audio Chime
  const [notificationOpen, setNotificationOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    unreadCount,
    isMuted,
    toggleMute,
    markAsRead,
    markAllAsRead,
    handleNotificationClick: handleContextNotificationClick,
  } = useNotifications();

  // Click-outside listener để đóng popover khi người dùng nhấp ra ngoài
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
    };

    if (notificationOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [notificationOpen]);

  // Auth & Role Guard: redirect if unauthenticated or accessing unauthorized portal
  useEffect(() => {
    if (!isLoadingAuth) {
      if (!isAuthenticated) {
        router.replace('/login');
      } else {
        const isPlatformRoute = pathname.startsWith('/platform');
        if (currentUser?.role === 'super_admin' && !isPlatformRoute) {
          router.replace('/platform');
        } else if (currentUser?.role !== 'super_admin' && isPlatformRoute) {
          router.replace('/dashboard');
        }
      }
    }
  }, [isLoadingAuth, isAuthenticated, currentUser?.role, pathname, router]);

  const currentNav =
    pathname === '/dashboard' || pathname === '/'
      ? 'dashboard'
      : pathname;

  const handleNavigate = (page: string) => {
    const target = page.startsWith('/')
      ? page
      : page === 'dashboard'
      ? '/dashboard'
      : `/${page}`;
    router.push(target, { scroll: false });
  };


  const handleNotificationClick = (item: NotificationItem) => {
    setNotificationOpen(false);
    handleContextNotificationClick(item, router);
  };

  const repairsCount = orders.filter((o) => !['Hoàn tất', 'Đã hủy'].includes(o.status)).length;
  const qcCount = orders.filter((o) => o.status === 'Chờ QC').length;

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-[#f4f7f5] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-3 border-[#176b58]/20 border-t-[#176b58] animate-spin" />
          <span className="text-sm font-semibold text-[#516158]">Đang khởi tạo FIXO Repair OS...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-[#1c302b]">
      {/* Sidebar with role filtering & auto group hide */}
      <AppSidebar
        currentPath={currentNav}
        onNavigate={handleNavigate}
        user={currentUser}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        branchName={branch}
        selectedBranchId={branchId}
        branches={branches}
        onBranchChange={(b) => setBranch(b.name, b.id)}
        repairsCount={repairsCount}
        qcCount={qcCount}
        onLogout={() => {
          if (confirm('Bạn có chắc chắn muốn đăng xuất không?')) {
            logout();
            router.push('/login');
          }
        }}
      />

      {/* Main Area */}
      <div className="lg:ml-[260px] min-h-screen flex flex-col">
        {/* Topbar với Notification Center Popover thả xuống */}
        <Topbar
          crumbName={crumbName}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          searchValue={searchVal}
          onSearchChange={setSearchVal}
          unreadCount={unreadCount}
          isNotificationOpen={notificationOpen}
          onOpenNotifications={() => setNotificationOpen((prev) => !prev)}
          notificationSlot={
            <div ref={popoverRef}>
              <NotificationPopover
                isOpen={notificationOpen}
                onClose={() => setNotificationOpen(false)}
                notifications={notifications}
                onNotificationClick={handleNotificationClick}
                onMarkAllAsRead={markAllAsRead}
                onMarkAsRead={markAsRead}
                isMuted={isMuted}
                onToggleMute={toggleMute}
                onTestSound={() => playChimeTone()}
              />
            </div>
          }
        />

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
