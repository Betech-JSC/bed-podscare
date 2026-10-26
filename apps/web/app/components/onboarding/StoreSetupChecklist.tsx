'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Icon, StatusTag } from '@podscare/ui';
import type { UserProfile } from '@podscare/types';
import {
  normalizeOnboardingRole,
  resolveOnboardingTenantId,
  type OnboardingStorageState,
  type OnboardingUserContext,
  type SetupChecklistStep,
} from './types';
import { ADMIN_SETUP_CHECKLIST_STEPS } from './onboardingData';
import {
  DEFAULT_ONBOARDING_STATE,
  ONBOARDING_UPDATED_EVENT,
  dismissChecklist,
  getOnboardingState,
  setChecklistCollapsed,
  toggleChecklistStep,
} from './onboardingStorage';

export interface StoreSetupChecklistProps {
  user?: UserProfile | OnboardingUserContext | null;
  role?: string | null;
  tenantId?: string | number | null;
  userId?: string | number | null;
  onNavigate: (path: string) => void;
  stepsOverride?: SetupChecklistStep[];
}

export const StoreSetupChecklist: React.FC<StoreSetupChecklistProps> = ({
  user,
  role,
  tenantId,
  userId,
  onNavigate,
  stepsOverride,
}) => {
  const effectiveRole = normalizeOnboardingRole(role ?? user?.role);
  const effectiveTenantId =
    tenantId !== undefined ? tenantId : resolveOnboardingTenantId(user);
  const effectiveUserId = userId !== undefined ? userId : user?.id;

  const [isMounted, setIsMounted] = useState(false);
  const [storageState, setStorageState] = useState<OnboardingStorageState>(
    DEFAULT_ONBOARDING_STATE
  );

  const syncStateFromStorage = useCallback(() => {
    const latest = getOnboardingState(effectiveTenantId, effectiveUserId);
    setStorageState(latest);
  }, [effectiveTenantId, effectiveUserId]);

  useEffect(() => {
    setIsMounted(true);
    syncStateFromStorage();
  }, [syncStateFromStorage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorageOrCustomUpdate = () => {
      syncStateFromStorage();
    };

    window.addEventListener(
      ONBOARDING_UPDATED_EVENT,
      handleStorageOrCustomUpdate
    );
    window.addEventListener('storage', handleStorageOrCustomUpdate);

    return () => {
      window.removeEventListener(
        ONBOARDING_UPDATED_EVENT,
        handleStorageOrCustomUpdate
      );
      window.removeEventListener('storage', handleStorageOrCustomUpdate);
    };
  }, [syncStateFromStorage]);

  // Chỉ hiển thị duy nhất cho vai trò Chủ cửa hàng / Quản trị viên (`admin`) và khi chưa bấm ẩn
  if (
    !isMounted ||
    effectiveRole !== 'admin' ||
    storageState.checklistDismissed
  ) {
    return null;
  }

  const steps =
    stepsOverride && stepsOverride.length > 0
      ? stepsOverride
      : ADMIN_SETUP_CHECKLIST_STEPS;
  const totalSteps = steps.length;
  const completedIds = storageState.completedChecklistStepIds || [];
  const completedCount = steps.filter((step) =>
    completedIds.includes(step.id)
  ).length;
  const progressPercent =
    totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;
  const isAllCompleted = completedCount === totalSteps && totalSteps > 0;

  const handleToggleStep = (stepId: string) => {
    const updated = toggleChecklistStep(
      effectiveTenantId,
      effectiveUserId,
      stepId
    );
    setStorageState(updated);
  };

  const handleToggleCollapse = () => {
    const updated = setChecklistCollapsed(
      effectiveTenantId,
      effectiveUserId,
      !storageState.checklistCollapsed
    );
    setStorageState(updated);
  };

  const handleDismiss = () => {
    const updated = dismissChecklist(effectiveTenantId, effectiveUserId);
    setStorageState(updated);
  };

  return (
    <section
      data-testid="store-setup-checklist"
      aria-label="Bảng kiểm thiết lập cửa hàng 5 bước"
      className="bg-white rounded-[14px] border border-[#cde2d6] p-4 sm:p-5 shadow-xs space-y-4"
    >
      {/* Top Header & Progress Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#176b51]">
              <Icon name="spark" size={14} />
              <span>THIẾT LẬP GIAN HÀNG CHUẨN · DÀNH CHO CHỦ CỬA HÀNG</span>
            </span>
            <StatusTag
              label={`${completedCount}/${totalSteps} hoàn thành (${progressPercent}%)`}
              type={isAllCompleted ? 'ready' : 'progress'}
              showDot={true}
            />
          </div>

          <h2 className="font-heading font-extrabold text-base sm:text-lg text-[#17231f] m-0">
            {isAllCompleted
              ? 'Gian hàng FIXO của bạn đã hoàn tất 5 bước cấu hình nền tảng'
              : 'Hoàn tất 5 bước cấu hình cốt lõi để vận hành cửa hàng trơn tru'}
          </h2>
          <p className="text-xs text-[#54645d] m-0 leading-relaxed">
            Thiết lập thương hiệu phiếu in, chi nhánh, tài khoản 5 bộ phận, danh
            mục thiết bị và ca trực đầu tiên. Tiến độ được lưu tự động cho tài
            khoản Quản trị viên của bạn.
          </p>
        </div>

        {/* Progress Bar & Action Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-none">
          <div className="w-full sm:w-44 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-[#54645d]">Tiến độ thiết lập</span>
              <span className="text-[#176b51] font-mono tabular-nums">
                {completedCount}/{totalSteps} hoàn thành · {progressPercent}%
              </span>
            </div>
            <div
              className="w-full h-2 rounded-full bg-[#e5ece8] overflow-hidden"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-[#176b51] transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleToggleCollapse}
              data-testid="store-setup-collapse-btn"
              className="text-xs font-bold"
            >
              <span>
                {storageState.checklistCollapsed ? 'Mở rộng' : 'Thu gọn'}
              </span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              data-testid="store-setup-dismiss-btn"
              className="text-xs font-semibold text-[#6e7f77] hover:text-[#17231f]"
            >
              Ẩn bảng thiết lập
            </Button>
          </div>
        </div>
      </div>

      {/* 5-Step Checklist Body */}
      {!storageState.checklistCollapsed && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 pt-1 border-t border-[#e9eeeb]">
          {steps.map((step) => {
            const isCompleted = completedIds.includes(step.id);

            return (
              <div
                key={step.id}
                data-testid={`setup-step-card-${step.id}`}
                className={`p-3.5 rounded-[12px] border flex flex-col justify-between gap-3 transition-colors ${
                  isCompleted
                    ? 'bg-[#e9f4ef] border-[#cde2d6]'
                    : 'bg-[#f6f8f6] border-[#e5ece8] hover:border-[#cde2d6]'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleStep(step.id)}
                      data-testid={`setup-step-toggle-${step.id}`}
                      aria-pressed={isCompleted}
                      title={
                        isCompleted
                          ? 'Bỏ đánh dấu hoàn thành bước này'
                          : 'Đánh dấu đã hoàn thành bước này'
                      }
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-[7px] text-[11px] font-extrabold border transition-colors cursor-pointer ${
                        isCompleted
                          ? 'bg-[#176b51] text-white border-[#176b51]'
                          : 'bg-white text-[#17231f] border-[#d5dfd9] hover:border-[#176b51]'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                          isCompleted
                            ? 'bg-white text-[#176b51] border-white'
                            : 'bg-[#f6f8f6] text-transparent border-[#b8c7bf]'
                        }`}
                      >
                        <Icon name="check" size={12} />
                      </span>
                      <span>
                        {isCompleted
                          ? 'Đã hoàn tất'
                          : `Bước ${step.stepNumber}`}
                      </span>
                    </button>

                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6e7f77] bg-white px-2 py-0.5 rounded-[6px] border border-[#e5ece8]">
                      <Icon name={step.icon} size={12} className="text-[#176b51]" />
                      <span>{step.estimatedTime}</span>
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h3
                      className={`text-xs sm:text-[13px] font-extrabold leading-snug m-0 ${
                        isCompleted
                          ? 'text-[#176b51]'
                          : 'text-[#17231f]'
                      }`}
                    >
                      {step.title}
                    </h3>
                    <p className="text-[11px] text-[#54645d] leading-relaxed m-0">
                      {step.description}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#e2ebe6] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate(step.href)}
                    data-testid={`setup-step-cta-${step.id}`}
                    className={`w-full inline-flex items-center justify-between px-2.5 py-1.5 rounded-[8px] text-xs font-bold border transition-colors cursor-pointer ${
                      isCompleted
                        ? 'bg-white text-[#176b51] border-[#cde2d6] hover:bg-[#dff0e8]'
                        : 'bg-[#176b51] text-white border-[#176b51] hover:bg-[#10583f]'
                    }`}
                  >
                    <span>{step.ctaLabel}</span>
                    <Icon name="chevronRight" size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
