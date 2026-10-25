import type { OrderStatusType } from '@podscare/types';

export type StoreRoleKey = 'cskh' | 'tech' | 'qc' | 'inventory' | 'admin';

export type HelpTabId = 'overview' | StoreRoleKey;

export type SidebarGroupKey = 'WORKSPACE' | 'VẬN HÀNH' | 'HỆ THỐNG';

export interface ModuleSubSectionItem {
  title: string;
  badge?: string;
  badgeType?: OrderStatusType;
  description: string;
}

export interface ModuleGuideItem {
  id: string;
  label: string;
  href: string;
  group: SidebarGroupKey;
  summary: string;
  keyActions: string[];
  subSections?: ModuleSubSectionItem[];
}

export interface WorkflowStatusTransition {
  from?: string;
  to: string;
  statusType?: OrderStatusType;
}

export interface WorkflowStepItem {
  step: number;
  title: string;
  moduleLabel: string;
  moduleHref?: string;
  statusTransition?: WorkflowStatusTransition;
  description: string;
  checkpoints: string[];
  handoverTo?: string;
}

export interface SpecialScenarioItem {
  id: string;
  title: string;
  trigger: string;
  statusLabel?: string;
  statusType?: OrderStatusType;
  resolutionSteps: string[];
  relatedModule?: string;
}

export type SpecialCaseItem = SpecialScenarioItem;

export interface RbacGuardrailItem {
  id: string;
  ruleTitle: string;
  policyCode?: string;
  severity?: 'strict' | 'warning' | 'info';
  description: string;
  reason: string;
}

export type GuardrailItem = RbacGuardrailItem;

export interface RoleGuideConfig {
  roleKey: StoreRoleKey;
  tabLabel: string;
  roleTitle: string;
  badgeLabel: string;
  missionSummary: string;
  dataScope: string;
  coreResponsibilities: string[];
  financialVisibility: string;
  modules: ModuleGuideItem[];
  dailyWorkflow: WorkflowStepItem[];
  specialScenarios: SpecialScenarioItem[];
  rbacGuardrails: RbacGuardrailItem[];
}

export const STORE_ROLE_ORDER: StoreRoleKey[] = [
  'cskh',
  'tech',
  'qc',
  'inventory',
  'admin',
];

export const STORE_ROLE_LABELS: Record<StoreRoleKey, string> = {
  cskh: 'Lễ tân / CSKH',
  tech: 'Kỹ thuật viên',
  qc: 'Kiểm định QC',
  inventory: 'Thủ kho',
  admin: 'Quản trị viên',
};

export function normalizeStoreRole(
  rawRole?: string | null
): StoreRoleKey | 'super_admin' {
  if (!rawRole) return 'admin';
  const lowered = rawRole.trim().toLowerCase();
  if (lowered === 'super_admin') return 'super_admin';
  if (lowered === 'technician' || lowered === 'tech') return 'tech';
  if (lowered === 'cskh') return 'cskh';
  if (lowered === 'qc') return 'qc';
  if (lowered === 'inventory' || lowered === 'warehouse') return 'inventory';
  return 'admin';
}
