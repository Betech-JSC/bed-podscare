export type UserRole = 'admin' | 'cskh' | 'tech' | 'technician' | 'qc' | 'inventory' | 'warehouse' | 'super_admin';

export interface TenantInfo {
  id: number;
  code: string;
  name: string;
  status: string;
  plan: string;
  expires_at?: string | null;
  logo_url?: string | null;
  hotline?: string | null;
  receipt_footer_note?: string | null;
}

export interface UserProfile {
  id: string | number;
  name: string;
  role: UserRole;
  roleLabel: string;
  branch?: string;
  branch_id?: number | null;
  initials: string;
  email?: string;
  phone?: string;
  avatar_url?: string | null;
  is_active?: boolean;
  tenant_id?: number | null;
  tenant?: TenantInfo | null;
}

