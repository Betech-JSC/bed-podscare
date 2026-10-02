'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  AppSidebar,
  Topbar,
  NotificationPopover,
  type NotificationItem,
  Avatar,
  Button,
  Icon,
  Modal,
} from '@podscare/ui';
import type { UserProfile } from '@podscare/types';
import { saasService } from '@podscare/api-client';
import { usePodsCare, useNotifications } from '../providers';

export interface AppShellProps {
  children: React.ReactNode;
  crumbName?: string;
  actions?: React.ReactNode;
}

interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  user: UserProfile | null;
  branchName: string;
  loading: boolean;
}

const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  user,
  branchName,
  loading,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={loading ? () => {} : onClose}
      title="Kết thúc ca làm việc"
      eyebrow="Xác thực phiên"
      maxWidth="sm"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button
            variant="secondary"
            size="md"
            disabled={loading}
            onClick={onClose}
            className="text-sm font-semibold"
          >
            Hủy bỏ
          </Button>

          <Button
            variant="danger"
            size="md"
            loading={loading}
            onClick={onConfirm}
            className="text-sm font-semibold"
          >
            {loading ? 'Đang kết thúc ca làm việc...' : 'Xác nhận đăng xuất'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* User Card */}
        <div className="p-4 rounded-[12px] bg-[#f7f9f8] border border-[#e5ece8] flex items-center gap-3.5">
          <Avatar
            initials={user?.initials || 'NV'}
            variant="dark"
            size="lg"
            className="shadow-sm"
          />
          <div className="min-w-0 flex-1">
            <b className="text-base text-[#1c302b] font-bold block truncate">
              {user?.name || 'Nhân viên'}
            </b>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-[#6e7f77]">
              <span className="font-semibold text-[#176b58] bg-[#eaf4ef] px-2 py-0.5 rounded-[5px] border border-[#cde2d6]">
                {user?.roleLabel || user?.role || 'Nhân sự'}
              </span>
              <span>·</span>
              <span className="truncate">{branchName}</span>
            </div>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="p-3.5 rounded-[10px] bg-[#fbefed] border border-[#f5c7c2] flex items-start gap-2.5 text-xs text-[#bc5b52] leading-relaxed">
          <Icon name="alert" size={18} className="shrink-0 mt-0.5" />
          <span>
            Bạn có chắc chắn muốn kết thúc ca làm việc? Mọi dữ liệu thao tác chưa lưu sẽ bị mất và phiên làm việc sẽ được thu hồi an toàn khỏi hệ thống.
          </span>
        </div>
      </div>
    </Modal>
  );
};

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
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  // Quản lý Notification Center Popover kết nối trực tiếp với NotificationProvider & Web Audio Chime
  const [notificationOpen, setNotificationOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    unreadCount,
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

  // Theo dõi thông tin bản quyền SaaS và hạn dùng cho Topbar badge
  const [subInfo, setSubInfo] = useState<{
    plan: string;
    daysRemaining: number | null;
    isExpired: boolean;
  } | null>(null);

  useEffect(() => {
    if (isAuthenticated && currentUser?.role !== 'super_admin') {
      saasService
        .getCurrent()
        .then((res) => {
          if (res?.success && res?.data) {
            const tenant = res.data.tenant;
            const usage = res.data.usage;
            const plan = tenant?.plan || usage?.subscription?.plan_id || 'trial';
            const days = tenant?.days_remaining ?? usage?.subscription?.days_remaining ?? 14;
            const expired =
              usage?.subscription?.is_expired || (typeof days === 'number' && days <= 0);
            setSubInfo({
              plan,
              daysRemaining: days,
              isExpired: expired,
            });
          }
        })
        .catch(() => {
          // Fallback an toàn khi chưa nạp được dữ liệu
        });
    }
  }, [isAuthenticated, currentUser?.role, pathname]);

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

  const handleLogoutConfirm = async () => {
    setLogoutLoading(true);
    try {
      await logout();
      setLogoutModalOpen(false);
      router.replace('/login');
    } finally {
      setLogoutLoading(false);
    }
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
        user={currentUser || undefined}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        branchName={branch}
        selectedBranchId={branchId}
        branches={branches}
        onBranchChange={(b) => setBranch(b.name, b.id)}
        repairsCount={repairsCount}
        qcCount={qcCount}
        onLogout={() => setLogoutModalOpen(true)}
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
          planBadgeSlot={
            currentUser?.role !== 'super_admin' ? (
              <button
                type="button"
                onClick={() => router.push('/subscription')}
                title="Quản lý Gói cước & Bản quyền"
                className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all border cursor-pointer ${
                  subInfo?.isExpired
                    ? 'bg-[#fbefed] text-[#bc5b52] border-[#f5c7c2] hover:bg-[#f8deda]'
                    : subInfo?.daysRemaining !== null &&
                      subInfo?.daysRemaining !== undefined &&
                      subInfo.daysRemaining <= 3
                    ? 'bg-[#faf3e7] text-[#b77a21] border-[#f4dfc2] hover:bg-[#f4ebd9]'
                    : subInfo?.plan === 'pro'
                    ? 'bg-[#f2eff8] text-[#6d5b97] border-[#ded7eb] hover:bg-[#e7e1f2]'
                    : subInfo?.plan === 'standard'
                    ? 'bg-[#eaf4ef] text-[#176b58] border-[#cde3d6] hover:bg-[#d6ecdf]'
                    : 'bg-[#faf3e7] text-[#b77a21] border-[#f4dfc2] hover:bg-[#f4ebd9]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    subInfo?.isExpired
                      ? 'bg-[#ef4444]'
                      : subInfo?.daysRemaining !== null &&
                        subInfo?.daysRemaining !== undefined &&
                        subInfo.daysRemaining <= 3
                      ? 'bg-[#f59e0b] animate-pulse'
                      : subInfo?.plan === 'pro'
                      ? 'bg-[#8b5cf6]'
                      : 'bg-[#10b981]'
                  }`}
                />
                <span>
                  {subInfo?.isExpired
                    ? 'Hết hạn bản quyền'
                    : subInfo?.plan === 'trial'
                    ? `Trial · Còn ${subInfo?.daysRemaining ?? 14} ngày`
                    : subInfo?.plan === 'pro'
                    ? 'Pro'
                    : typeof subInfo?.daysRemaining === 'number'
                    ? `Standard · Còn ${subInfo.daysRemaining} ngày`
                    : 'Standard'}
                </span>
              </button>
            ) : null
          }
          notificationSlot={
            <div ref={popoverRef}>
              <NotificationPopover
                isOpen={notificationOpen}
                onClose={() => setNotificationOpen(false)}
                notifications={notifications}
                onNotificationClick={handleNotificationClick}
                onMarkAllAsRead={markAllAsRead}
                onMarkAsRead={markAsRead}
              />
            </div>
          }
        />

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Enterprise Logout Confirmation Modal */}
      <LogoutConfirmModal
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={handleLogoutConfirm}
        user={currentUser}
        branchName={branch}
        loading={logoutLoading}
      />
    </div>
  );
};
