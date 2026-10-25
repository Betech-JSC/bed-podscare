'use client';

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Icon,
  StatusTag,
  rolePermissions,
  sanitizeInputLive,
} from '@podscare/ui';
import type { UserProfile } from '@podscare/types';
import {
  STORE_ROLE_LABELS,
  STORE_ROLE_ORDER,
  normalizeStoreRole,
  type HelpTabId,
  type RoleGuideConfig,
  type StoreRoleKey,
} from './types';
import { SystemOverviewSection } from './SystemOverviewSection';
import { RoleGuideSection } from './RoleGuideSection';
import { cskhGuideData } from './cskhGuideData';
import { techGuideData } from './techGuideData';
import { qcGuideData } from './qcGuideData';
import { inventoryGuideData } from './inventoryGuideData';
import { adminGuideData } from './adminGuideData';

export interface HelpCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: UserProfile | null;
  branchName?: string;
  onNavigate: (path: string) => void;
  roleGuidesOverride?: Partial<Record<StoreRoleKey, RoleGuideConfig>>;
}

export const STORE_ROLE_GUIDES: Record<StoreRoleKey, RoleGuideConfig> = {
  cskh: cskhGuideData,
  tech: techGuideData,
  qc: qcGuideData,
  inventory: inventoryGuideData,
  admin: adminGuideData,
};

export const HelpCenterModal: React.FC<HelpCenterModalProps> = ({
  isOpen,
  onClose,
  user,
  branchName = 'FIXO · Quận 1',
  onNavigate,
  roleGuidesOverride,
}) => {
  const normalizedUserRoleRaw = normalizeStoreRole(user?.role);
  const currentUserRole: StoreRoleKey =
    normalizedUserRoleRaw === 'super_admin' ? 'admin' : normalizedUserRoleRaw;

  const [activeTab, setActiveTab] = useState<HelpTabId>(currentUserRole);
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-select the logged-in user's role tab whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(currentUserRole);
      setSearchQuery('');
    }
  }, [isOpen, currentUserRole]);

  // Do not render store help center for super_admin
  if (normalizedUserRoleRaw === 'super_admin') {
    return null;
  }

  const mergedRoleGuides: Record<StoreRoleKey, RoleGuideConfig> = {
    ...STORE_ROLE_GUIDES,
    ...(roleGuidesOverride || {}),
  };

  const allowedModuleIds = rolePermissions[currentUserRole] || [];

  const handleNavigateModule = (href: string, moduleId: string) => {
    if (!allowedModuleIds.includes(moduleId)) {
      return;
    }
    onClose();
    onNavigate(href);
  };

  const activeRoleGuide =
    activeTab === 'overview' ? null : mergedRoleGuides[activeTab];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      eyebrow="TRUNG TÂM HỖ TRỢ VẬN HÀNH · FIXO REPAIR OS"
      title="Cẩm nang Vận hành Hệ thống & Phân quyền Theo Vai trò"
      subtitle="Tra cứu trực tiếp luồng xử lý đơn hàng 6 giai đoạn liên bộ phận, chức năng từng module trên Sidebar, quy trình tác nghiệp chuẩn và quy tắc bảo mật RBAC."
      headerExtra={
        <div className="space-y-3">
          {/* Role & Overview Tabs Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-2 rounded-[8px] text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer border ${
                activeTab === 'overview'
                  ? 'bg-[#176b51] text-white border-[#176b51]'
                  : 'bg-[#f6f8f6] text-[#4b5b54] border-[#e5ece8] hover:bg-[#e9f4ef] hover:text-[#176b51]'
              }`}
            >
              <span>Tổng quan 6 bước</span>
            </button>

            <div className="h-5 w-[1px] bg-[#e5ece8] mx-0.5 flex-none" />

            {STORE_ROLE_ORDER.map((roleKey) => {
              const isSelected = activeTab === roleKey;
              const isUserOwnRole = currentUserRole === roleKey;
              return (
                <button
                  key={roleKey}
                  type="button"
                  onClick={() => setActiveTab(roleKey)}
                  className={`px-3 py-2 rounded-[8px] text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-2 cursor-pointer border ${
                    isSelected
                      ? 'bg-[#176b51] text-white border-[#176b51]'
                      : 'bg-white text-[#4b5b54] border-[#e5ece8] hover:bg-[#f6f8f6] hover:text-[#17231f]'
                  }`}
                >
                  <span>{STORE_ROLE_LABELS[roleKey]}</span>
                  {isUserOwnRole && (
                    <span
                      className={`px-1.5 py-0.5 rounded-[5px] text-[10px] font-bold ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-[#e9f4ef] text-[#176b51]'
                      }`}
                    >
                      Vai trò của bạn
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search Filter & Quick Switch Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#81908a] pointer-events-none">
                <Icon name="search" size={16} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(sanitizeInputLive(e.target.value))}
                placeholder="Tìm nhanh tên module, bước quy trình, trạng thái FSM, bảo hành, hoàn tiền, SePay..."
                aria-label="Tìm kiếm trong Trung tâm Hướng dẫn Vận hành"
                className="w-full h-9 pl-9 pr-20 rounded-[8px] bg-[#f6f8f6] border border-[#dce6e0] text-xs text-[#17231f] placeholder:text-[#81908a] focus:outline-none focus:bg-white focus:border-[#176b51]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-[5px] text-[10px] font-bold bg-[#e9eeeb] text-[#4b5b54] hover:bg-[#dce6e0] cursor-pointer"
                >
                  Xóa lọc
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-none">
              {activeTab !== 'overview' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveTab('overview')}
                  className="text-xs"
                >
                  Xem Tổng quan 6 bước
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveTab(currentUserRole)}
                  className="text-xs"
                >
                  Về tab {STORE_ROLE_LABELS[currentUserRole]}
                </Button>
              )}
            </div>
          </div>
        </div>
      }
      footer={
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#596962]">
            <span>
              Tài khoản đang đăng nhập:{' '}
              <strong className="text-[#17231f]">{user?.name || 'Nhân viên'}</strong>
            </span>
            <span>·</span>
            <StatusTag
              type="ready"
              label={`Vai trò: ${STORE_ROLE_LABELS[currentUserRole]} (${allowedModuleIds.length} module)`}
            />
            <span>·</span>
            <span className="text-[#81908a]">{branchName}</span>
          </div>

          <div className="flex items-center justify-end gap-2">
            {activeTab !== currentUserRole && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActiveTab(currentUserRole)}
              >
                Mở hướng dẫn của bạn ({STORE_ROLE_LABELS[currentUserRole]})
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={onClose}>
              Đóng hướng dẫn
            </Button>
          </div>
        </div>
      }
    >
      {activeTab === 'overview' || !activeRoleGuide ? (
        <SystemOverviewSection
          onSelectRoleTab={(roleKey) => setActiveTab(roleKey)}
          onNavigateModule={handleNavigateModule}
          allowedModuleIds={allowedModuleIds}
          searchQuery={searchQuery}
        />
      ) : (
        <RoleGuideSection
          guide={activeRoleGuide}
          currentUserRole={currentUserRole}
          searchQuery={searchQuery}
          onNavigateModule={handleNavigateModule}
          onOpenOverviewTab={() => setActiveTab('overview')}
        />
      )}
    </Modal>
  );
};
