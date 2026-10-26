import type { UserProfile } from '@podscare/types';

export type OnboardingStoreRoleKey =
  | 'admin'
  | 'cskh'
  | 'tech'
  | 'qc'
  | 'inventory';

export const ONBOARDING_ROLE_ORDER: readonly OnboardingStoreRoleKey[] = [
  'admin',
  'cskh',
  'tech',
  'qc',
  'inventory',
] as const;

export const ONBOARDING_ROLE_LABELS: Record<OnboardingStoreRoleKey, string> = {
  admin: 'Quản trị viên / Chủ cửa hàng',
  cskh: 'Lễ tân / CSKH',
  tech: 'Kỹ thuật viên',
  qc: 'Kiểm định Chất lượng (QC)',
  inventory: 'Thủ kho & Mua hàng',
};

export interface OnboardingRoleStep {
  stepNumber: number;
  id: string;
  title: string;
  subtitle: string;
  spotlightArea: string;
  targetModuleId: string;
  targetHref: string;
  icon: string;
  description: string;
  actionPoints: string[];
  handoverNote: string;
  guardrailNote: string;
}

export interface OnboardingRoleConfig {
  roleKey: OnboardingStoreRoleKey;
  roleLabel: string;
  badgeText: string;
  welcomeHeadline: string;
  welcomeSummary: string;
  primaryWorkspaceLabel: string;
  primaryWorkspaceHref: string;
  rbacSummary: string;
  steps: OnboardingRoleStep[];
}

export interface SetupChecklistStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  moduleId: string;
  href: string;
  ctaLabel: string;
  icon: string;
  estimatedTime: string;
}

export interface OnboardingStorageState {
  tourCompleted: boolean;
  tourDismissed: boolean;
  completedAt: string | null;
  lastCompletedRole: OnboardingStoreRoleKey | null;
  completedChecklistStepIds: string[];
  checklistDismissed: boolean;
  checklistCollapsed: boolean;
  lastSeenVersion: string | null;
  lastSeenChangelogVersion?: string | null;
}

export interface OnboardingUserContext {
  id?: string | number | null;
  role?: string | null;
  tenant_id?: string | number | null;
  tenant?: { id?: string | number | null } | null;
}

/**
 * Chuẩn hóa role người dùng về 1 trong 5 role cấp cửa hàng được phép chạy Onboarding.
 * Trả về `null` đối với `super_admin` hoặc giá trị không hợp lệ.
 */
export function normalizeOnboardingRole(
  rawRole?: string | null
): OnboardingStoreRoleKey | null {
  if (!rawRole || typeof rawRole !== 'string') {
    return null;
  }

  const lowered = rawRole.trim().toLowerCase();
  if (!lowered || lowered === 'super_admin') {
    return null;
  }

  if (lowered === 'admin') {
    return 'admin';
  }
  if (lowered === 'cskh') {
    return 'cskh';
  }
  if (lowered === 'tech' || lowered === 'technician') {
    return 'tech';
  }
  if (lowered === 'qc') {
    return 'qc';
  }
  if (lowered === 'inventory' || lowered === 'warehouse') {
    return 'inventory';
  }

  return null;
}

/**
 * Trích xuất tenantId an toàn từ UserProfile hoặc OnboardingUserContext.
 */
export function resolveOnboardingTenantId(
  user?: UserProfile | OnboardingUserContext | null
): string | number | null {
  if (!user) return null;
  if (user.tenant_id !== undefined && user.tenant_id !== null) {
    return user.tenant_id;
  }
  if (user.tenant && user.tenant.id !== undefined && user.tenant.id !== null) {
    return user.tenant.id;
  }
  return null;
}
