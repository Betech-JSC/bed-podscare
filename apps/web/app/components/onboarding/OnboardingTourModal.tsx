'use client';

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Icon,
  StatusTag,
  rolePermissions,
} from '@podscare/ui';
import type { UserProfile } from '@podscare/types';
import {
  normalizeOnboardingRole,
  resolveOnboardingTenantId,
  type OnboardingRoleConfig,
  type OnboardingStoreRoleKey,
} from './types';
import {
  ONBOARDING_ROLE_CONFIGS,
  getOnboardingRoleConfig,
} from './onboardingData';
import {
  markOnboardingCompleted,
  markOnboardingDismissed,
} from './onboardingStorage';

export interface OnboardingTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: UserProfile | null;
  branchName?: string;
  onNavigate: (path: string) => void;
  onComplete?: () => void;
  onDismiss?: () => void;
  roleConfigsOverride?: Partial<
    Record<OnboardingStoreRoleKey, OnboardingRoleConfig>
  >;
}

export const OnboardingTourModal: React.FC<OnboardingTourModalProps> = ({
  isOpen,
  onClose,
  user,
  branchName = 'FIXO · Quận 1',
  onNavigate,
  onComplete,
  onDismiss,
  roleConfigsOverride,
}) => {
  const roleKey = normalizeOnboardingRole(user?.role);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Luôn đặt lại về Bước 1 (index 0) mỗi khi mở lại Modal hoặc đổi vai trò
  useEffect(() => {
    if (isOpen) {
      setCurrentStepIndex(0);
    }
  }, [isOpen, roleKey]);

  // Tuyệt đối không hiển thị Onboarding của cửa hàng cho super_admin hoặc khi chưa xác định role hợp lệ
  if (!roleKey) {
    return null;
  }

  const mergedConfigs: Record<OnboardingStoreRoleKey, OnboardingRoleConfig> = {
    ...ONBOARDING_ROLE_CONFIGS,
    ...(roleConfigsOverride || {}),
  };

  const roleConfig =
    mergedConfigs[roleKey] || getOnboardingRoleConfig(roleKey) || mergedConfigs.admin;
  const steps = roleConfig.steps;
  const totalSteps = steps.length;
  const safeStepIndex =
    currentStepIndex >= 0 && currentStepIndex < totalSteps
      ? currentStepIndex
      : 0;
  const currentStep = steps[safeStepIndex];
  const isFirstStep = safeStepIndex === 0;
  const isLastStep = safeStepIndex === totalSteps - 1;

  const tenantId = resolveOnboardingTenantId(user);
  const allowedModuleIds = rolePermissions[roleKey] || [];
  const canNavigateToStepModule = Boolean(
    currentStep && allowedModuleIds.includes(currentStep.targetModuleId)
  );
  const canNavigateToPrimaryWorkspace = Boolean(
    roleConfig.primaryWorkspaceHref &&
      allowedModuleIds.some(
        (modId) =>
          roleConfig.primaryWorkspaceHref === `/${modId}` ||
          (modId === 'dashboard' &&
            roleConfig.primaryWorkspaceHref === '/dashboard')
      )
  );

  const handleSkipTour = () => {
    markOnboardingDismissed(tenantId, user?.id, roleKey);
    onDismiss?.();
    onClose();
  };

  const handleFinishTour = () => {
    markOnboardingCompleted(tenantId, user?.id, roleKey);
    onComplete?.();
    onClose();
  };

  const handleJumpToModule = (href: string, moduleId: string) => {
    if (!allowedModuleIds.includes(moduleId)) {
      return;
    }
    markOnboardingCompleted(tenantId, user?.id, roleKey);
    onComplete?.();
    onClose();
    onNavigate(href);
  };

  const handleOpenPrimaryWorkspace = () => {
    if (!canNavigateToPrimaryWorkspace) {
      return;
    }
    markOnboardingCompleted(tenantId, user?.id, roleKey);
    onComplete?.();
    onClose();
    onNavigate(roleConfig.primaryWorkspaceHref);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleSkipTour}
      maxWidth="xl"
      eyebrow={roleConfig.badgeText}
      title={roleConfig.welcomeHeadline}
      subtitle={roleConfig.welcomeSummary}
      headerExtra={
        <div className="space-y-3">
          {/* Welcome Context Banner */}
          <div className="p-3.5 rounded-[12px] bg-[#f6f8f6] border border-[#e5ece8] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-[10px] bg-[#e9f4ef] border border-[#cde2d6] text-[#176b51] flex items-center justify-center flex-none">
                <Icon name="shield" size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-extrabold text-[#17231f]">
                    Xin chào, {user?.name || 'Nhân sự FIXO'}
                  </span>
                  <StatusTag
                    label={roleConfig.roleLabel}
                    type="ready"
                    showDot={true}
                  />
                  <span className="text-[11px] font-semibold text-[#5e6e67] bg-white px-2 py-0.5 rounded-[6px] border border-[#e5ece8]">
                    Chi nhánh: {branchName}
                  </span>
                </div>
                <p className="text-xs text-[#54645d] mt-1 leading-relaxed">
                  {roleConfig.rbacSummary}
                </p>
              </div>
            </div>

            {canNavigateToPrimaryWorkspace && (
              <div className="flex-none">
                <button
                  type="button"
                  onClick={handleOpenPrimaryWorkspace}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-bold bg-white text-[#176b51] border border-[#cde2d6] hover:bg-[#e9f4ef] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>Mở {roleConfig.primaryWorkspaceLabel}</span>
                  <Icon name="chevronRight" size={14} />
                </button>
              </div>
            )}
          </div>

          {/* 4-Step Interactive Progress Selector */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-2"
            role="tablist"
            aria-label="Các bước hướng dẫn làm quen hệ thống"
          >
            {steps.map((step, index) => {
              const isActive = index === safeStepIndex;
              const isPassed = index < safeStepIndex;

              return (
                <button
                  key={step.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setCurrentStepIndex(index)}
                  className={`p-2.5 rounded-[10px] border text-left transition-colors cursor-pointer flex items-center gap-2.5 ${
                    isActive
                      ? 'bg-[#176b51] text-white border-[#176b51]'
                      : isPassed
                      ? 'bg-[#e9f4ef] text-[#176b51] border-[#cde2d6] hover:bg-[#dff0e8]'
                      : 'bg-[#f6f8f6] text-[#4b5b54] border-[#e5ece8] hover:bg-[#eef3f0]'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full text-[11px] font-extrabold flex items-center justify-center flex-none border ${
                      isActive
                        ? 'bg-white text-[#176b51] border-white'
                        : isPassed
                        ? 'bg-[#176b51] text-white border-[#176b51]'
                        : 'bg-white text-[#54645d] border-[#d5dfd9]'
                    }`}
                  >
                    {isPassed ? (
                      <Icon name="check" size={12} />
                    ) : (
                      step.stepNumber
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        isActive
                          ? 'text-[#d4ece2]'
                          : isPassed
                          ? 'text-[#176b51]'
                          : 'text-[#76867f]'
                      }`}
                    >
                      Bước {step.stepNumber}/{totalSteps}
                    </div>
                    <div className="text-xs font-bold truncate">
                      {step.title}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      }
      footer={
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkipTour}
              className="text-xs font-semibold text-[#5e6e67] hover:text-[#17231f]"
            >
              Bỏ qua hướng dẫn
            </Button>
            <span className="hidden md:inline text-[11px] text-[#81908a]">
              (Bạn luôn có thể mở lại từ mục Trợ giúp trên thanh bên)
            </span>
          </div>

          <div className="flex items-center justify-end gap-2.5">
            {!isFirstStep && (
              <Button
                variant="secondary"
                size="md"
                onClick={() =>
                  setCurrentStepIndex((prev) => Math.max(0, prev - 1))
                }
                className="text-xs font-bold"
              >
                Quay lại
              </Button>
            )}

            {!isLastStep ? (
              <Button
                variant="primary"
                size="md"
                onClick={() =>
                  setCurrentStepIndex((prev) =>
                    Math.min(totalSteps - 1, prev + 1)
                  )
                }
                className="text-xs font-bold bg-[#176b51] hover:bg-[#10583f]"
              >
                <span>Bước tiếp theo</span>
                <Icon name="chevronRight" size={14} />
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                onClick={handleFinishTour}
                className="text-xs font-bold bg-[#176b51] hover:bg-[#10583f]"
              >
                <Icon name="check" size={14} />
                <span>Bắt đầu làm việc ngay</span>
              </Button>
            )}
          </div>
        </div>
      }
    >
      {currentStep && (
        <div className="space-y-4">
          {/* Active Step Header Card */}
          <div className="p-4 sm:p-5 rounded-[14px] bg-[#f6f8f6] border border-[#e5ece8] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-[12px] bg-[#176b51] text-white flex items-center justify-center flex-none">
                  <Icon name={currentStep.icon} size={18} />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] font-extrabold bg-[#e9f4ef] text-[#176b51] border border-[#cde2d6]">
                      BƯỚC {currentStep.stepNumber} / {totalSteps}
                    </span>
                    <span className="text-xs font-semibold text-[#54645d]">
                      {currentStep.subtitle}
                    </span>
                  </div>
                  <h4 className="text-base sm:text-lg font-extrabold text-[#17231f] tracking-[-0.01em]">
                    {currentStep.title}
                  </h4>
                </div>
              </div>

              {canNavigateToStepModule && (
                <button
                  type="button"
                  onClick={() =>
                    handleJumpToModule(
                      currentStep.targetHref,
                      currentStep.targetModuleId
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[9px] text-xs font-bold bg-white text-[#176b51] border border-[#cde2d6] hover:bg-[#e9f4ef] transition-colors cursor-pointer self-start whitespace-nowrap"
                >
                  <span>Đi tới module ({currentStep.targetHref})</span>
                  <Icon name="chevronRight" size={14} />
                </button>
              )}
            </div>

            {/* Spotlight UI Location Badge */}
            <div className="p-3 rounded-[10px] bg-white border border-[#e5ece8] flex items-start gap-2.5">
              <Icon
                name="dashboard"
                size={16}
                className="text-[#176b51] flex-none mt-0.5"
              />
              <div className="text-xs leading-relaxed">
                <span className="font-bold text-[#17231f]">
                  Vị trí khu vực thao tác trên giao diện:{' '}
                </span>
                <span className="text-[#4b5b54] font-medium">
                  {currentStep.spotlightArea}
                </span>
              </div>
            </div>

            <p className="text-sm text-[#2d3e37] leading-relaxed">
              {currentStep.description}
            </p>
          </div>

          {/* Operational Action Points Checklist */}
          <div className="p-4 sm:p-5 rounded-[14px] bg-white border border-[#e5ece8] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h5 className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#176b51] flex items-center gap-2">
                <Icon name="check" size={14} />
                <span>Thao tác chuẩn cần nắm vững tại bước này</span>
              </h5>
              <span className="text-[11px] font-semibold text-[#76867f]">
                {currentStep.actionPoints.length} thao tác trọng tâm
              </span>
            </div>

            <ul className="space-y-2.5">
              {currentStep.actionPoints.map((point, idx) => (
                <li
                  key={idx}
                  className="p-3 rounded-[10px] bg-[#f6f8f6] border border-[#e9eeeb] flex items-start gap-3 text-xs sm:text-[13px] text-[#1c302b] leading-relaxed"
                >
                  <span className="w-5 h-5 rounded-full bg-[#e9f4ef] border border-[#cde2d6] text-[#176b51] font-extrabold text-[11px] flex items-center justify-center flex-none mt-0.5">
                    {idx + 1}
                  </span>
                  <span className="flex-1 font-medium">{point}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 6-Stage Repair Handover & RBAC Guardrail Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-[12px] bg-[#e9f4ef] border border-[#cde2d6] space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-extrabold text-[#176b51]">
                <Icon name="clock" size={14} />
                <span>Điểm chạm bàn giao liên bộ phận (6 bước)</span>
              </div>
              <p className="text-xs text-[#23483c] leading-relaxed">
                {currentStep.handoverNote}
              </p>
            </div>

            <div className="p-3.5 rounded-[12px] bg-[#faf3e7] border border-[#f4dfc2] space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-extrabold text-[#9a6416]">
                <Icon name="shield" size={14} />
                <span>Quy tắc phân quyền & Bảo mật RBAC</span>
              </div>
              <p className="text-xs text-[#6f4a12] leading-relaxed">
                {currentStep.guardrailNote}
              </p>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
