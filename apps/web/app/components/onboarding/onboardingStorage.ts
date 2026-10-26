import type { UserProfile } from '@podscare/types';
import {
  normalizeOnboardingRole,
  resolveOnboardingTenantId,
  type OnboardingStorageState,
  type OnboardingStoreRoleKey,
  type OnboardingUserContext,
} from './types.ts';

export const ONBOARDING_STORAGE_PREFIX = 'podscare_onboarding_v1';
export const ONBOARDING_UPDATED_EVENT = 'podscare:onboarding-updated';

export const DEFAULT_ONBOARDING_STATE: OnboardingStorageState = {
  tourCompleted: false,
  tourDismissed: false,
  completedAt: null,
  lastCompletedRole: null,
  completedChecklistStepIds: [],
  checklistDismissed: false,
  checklistCollapsed: false,
  lastSeenVersion: null,
};

const inMemoryFallbackStore = new Map<string, string>();

/**
 * Tạo khóa lưu trữ phân lập theo tenant_id và user_id trên cùng trình duyệt máy trạm POS.
 */
export function buildOnboardingStorageKey(
  tenantId?: string | number | null,
  userId?: string | number | null
): string {
  const safeTenantId =
    tenantId !== undefined &&
    tenantId !== null &&
    String(tenantId).trim() !== ''
      ? String(tenantId).trim()
      : 'default';

  const safeUserId =
    userId !== undefined && userId !== null && String(userId).trim() !== ''
      ? String(userId).trim()
      : 'anonymous';

  return `${ONBOARDING_STORAGE_PREFIX}_${safeTenantId}_${safeUserId}`;
}

function getStorageAdapter(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (
      typeof globalThis !== 'undefined' &&
      'localStorage' in globalThis &&
      globalThis.localStorage
    ) {
      return globalThis.localStorage;
    }
  } catch {
    // Bị chặn trong chế độ ẩn danh nghiêm ngặt hoặc môi trường SSR
  }
  return null;
}

function readRawItem(key: string): string | null {
  const storage = getStorageAdapter();
  if (storage) {
    try {
      const value = storage.getItem(key);
      if (value !== null) {
        return value;
      }
    } catch {
      // Fallback sang bộ nhớ tạm
    }
  }
  return inMemoryFallbackStore.get(key) ?? null;
}

function writeRawItem(key: string, value: string): void {
  inMemoryFallbackStore.set(key, value);
  const storage = getStorageAdapter();
  if (storage) {
    try {
      storage.setItem(key, value);
    } catch {
      // Giữ an toàn trong bộ nhớ tạm nếu vượt quota hoặc bị chặn
    }
  }
}

/**
 * Đọc trạng thái Onboarding & Checklist của người dùng hiện tại.
 */
export function getOnboardingState(
  tenantId?: string | number | null,
  userId?: string | number | null
): OnboardingStorageState {
  const key = buildOnboardingStorageKey(tenantId, userId);
  const raw = readRawItem(key);

  if (!raw) {
    return {
      ...DEFAULT_ONBOARDING_STATE,
      completedChecklistStepIds: [],
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingStorageState>;
    const normalizedRole = normalizeOnboardingRole(
      parsed.lastCompletedRole ?? undefined
    );
    const stepIds = Array.isArray(parsed.completedChecklistStepIds)
      ? parsed.completedChecklistStepIds.filter(
          (id): id is string => typeof id === 'string' && id.trim() !== ''
        )
      : [];

    return {
      tourCompleted: Boolean(parsed.tourCompleted),
      tourDismissed: Boolean(parsed.tourDismissed),
      completedAt:
        typeof parsed.completedAt === 'string' ? parsed.completedAt : null,
      lastCompletedRole: normalizedRole,
      completedChecklistStepIds: Array.from(new Set(stepIds)),
      checklistDismissed: Boolean(parsed.checklistDismissed),
      checklistCollapsed: Boolean(parsed.checklistCollapsed),
      lastSeenVersion:
        typeof parsed.lastSeenVersion === 'string'
          ? parsed.lastSeenVersion
          : null,
    };
  } catch {
    return {
      ...DEFAULT_ONBOARDING_STATE,
      completedChecklistStepIds: [],
    };
  }
}

/**
 * Ghi đè hoặc cập nhật một phần trạng thái Onboarding vào localStorage.
 */
export function saveOnboardingState(
  tenantId: string | number | null | undefined,
  userId: string | number | null | undefined,
  nextPartial: Partial<OnboardingStorageState>
): OnboardingStorageState {
  const current = getOnboardingState(tenantId, userId);
  const merged: OnboardingStorageState = {
    ...current,
    ...nextPartial,
    completedChecklistStepIds: Array.isArray(
      nextPartial.completedChecklistStepIds
    )
      ? Array.from(new Set(nextPartial.completedChecklistStepIds))
      : current.completedChecklistStepIds,
  };

  const key = buildOnboardingStorageKey(tenantId, userId);
  writeRawItem(key, JSON.stringify(merged));

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(
        new CustomEvent(ONBOARDING_UPDATED_EVENT, {
          detail: { key, tenantId, userId, state: merged },
        })
      );
    } catch {
      // Bỏ qua trong môi trường không hỗ trợ CustomEvent
    }
  }

  return merged;
}

/**
 * Đánh dấu người dùng đã hoàn thành toàn bộ các bước Onboarding Tour.
 */
export function markOnboardingCompleted(
  tenantId: string | number | null | undefined,
  userId: string | number | null | undefined,
  role?: OnboardingStoreRoleKey | string | null
): OnboardingStorageState {
  const normalizedRole = normalizeOnboardingRole(role ?? undefined);
  return saveOnboardingState(tenantId, userId, {
    tourCompleted: true,
    tourDismissed: false,
    completedAt: new Date().toISOString(),
    lastCompletedRole: normalizedRole,
  });
}

/**
 * Đánh dấu người dùng chủ động nhấn "Bỏ qua hướng dẫn".
 */
export function markOnboardingDismissed(
  tenantId: string | number | null | undefined,
  userId: string | number | null | undefined,
  role?: OnboardingStoreRoleKey | string | null
): OnboardingStorageState {
  const normalizedRole = normalizeOnboardingRole(role ?? undefined);
  return saveOnboardingState(tenantId, userId, {
    tourDismissed: true,
    lastCompletedRole: normalizedRole,
  });
}

/**
 * Khôi phục lại trạng thái để mở lại Onboarding Tour từ HelpCenterModal
 * (đồng thời bật lại StoreSetupChecklist nếu trước đó Admin đã ẩn).
 */
export function resetOnboardingTour(
  tenantId: string | number | null | undefined,
  userId: string | number | null | undefined
): OnboardingStorageState {
  return saveOnboardingState(tenantId, userId, {
    tourCompleted: false,
    tourDismissed: false,
    completedAt: null,
    checklistDismissed: false,
    checklistCollapsed: false,
  });
}

/**
 * Đánh dấu hoặc bỏ đánh dấu 1 bước trong StoreSetupChecklist (5 bước của Admin).
 */
export function toggleChecklistStep(
  tenantId: string | number | null | undefined,
  userId: string | number | null | undefined,
  stepId: string,
  forceCompleted?: boolean
): OnboardingStorageState {
  const current = getOnboardingState(tenantId, userId);
  const cleanId = stepId.trim();
  if (!cleanId) return current;

  const exists = current.completedChecklistStepIds.includes(cleanId);
  const shouldBeCompleted =
    typeof forceCompleted === 'boolean' ? forceCompleted : !exists;

  const nextIds = shouldBeCompleted
    ? Array.from(new Set([...current.completedChecklistStepIds, cleanId]))
    : current.completedChecklistStepIds.filter((id) => id !== cleanId);

  return saveOnboardingState(tenantId, userId, {
    completedChecklistStepIds: nextIds,
  });
}

/**
 * Ẩn bảng thiết lập cửa hàng (StoreSetupChecklist) trên trang /dashboard.
 */
export function dismissChecklist(
  tenantId: string | number | null | undefined,
  userId: string | number | null | undefined
): OnboardingStorageState {
  return saveOnboardingState(tenantId, userId, {
    checklistDismissed: true,
  });
}

/**
 * Thu gọn hoặc mở rộng thẻ StoreSetupChecklist.
 */
export function setChecklistCollapsed(
  tenantId: string | number | null | undefined,
  userId: string | number | null | undefined,
  collapsed: boolean
): OnboardingStorageState {
  return saveOnboardingState(tenantId, userId, {
    checklistCollapsed: collapsed,
  });
}

/**
 * Ghi nhận phiên bản Changelog mới nhất mà người dùng đã xem (ví dụ 'v1.5.0').
 */
export function markChangelogVersionSeen(
  tenantId: string | number | null | undefined,
  userId: string | number | null | undefined,
  version: string
): OnboardingStorageState {
  const cleanVersion = version.trim();
  return saveOnboardingState(tenantId, userId, {
    lastSeenVersion: cleanVersion,
    lastSeenChangelogVersion: cleanVersion,
  });
}

/**
 * Kiểm tra xem có cần tự động bật OnboardingTourModal cho người dùng hiện tại hay không.
 * Loại trừ hoàn toàn `super_admin` và chỉ kích hoạt khi chưa hoàn thành & chưa bỏ qua.
 */
export function shouldAutoOpenOnboarding(
  user?: UserProfile | OnboardingUserContext | null
): boolean {
  if (!user) {
    return false;
  }

  const storeRole = normalizeOnboardingRole(user.role);
  if (!storeRole) {
    return false;
  }

  const tenantId = resolveOnboardingTenantId(user);
  const state = getOnboardingState(tenantId, user.id);

  return !state.tourCompleted && !state.tourDismissed;
}

/**
 * Làm sạch bộ nhớ đệm in-memory (phục vụ kiểm thử tự động).
 */
export function clearOnboardingMemoryStore(): void {
  inMemoryFallbackStore.clear();
}
