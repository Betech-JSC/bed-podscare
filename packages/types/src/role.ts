export type UserRole = 'admin' | 'cskh' | 'tech' | 'technician' | 'qc' | 'inventory' | 'warehouse';

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
}
