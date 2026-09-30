export interface Branch {
  id: number | string;
  code: string;
  name: string;
  address?: string;
  phone?: string;
  is_active?: boolean;
  users_count?: number;
  repair_orders_count?: number;
}
