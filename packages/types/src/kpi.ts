export interface OperationalSummary {
  active_orders: number;
  waiting_pickup_orders: number;
  waiting_parts_orders: number;
  overdue_orders: number;
  waiting_approval_count?: number;
  waiting_qc_count?: number;
}

export interface OperationalReconciliation {
  handed_over_count: number;
  handed_over_revenue?: number;
  handed_over_revenue_formatted?: string;
  ready_for_pickup_count: number;
  ready_for_pickup_amount?: number;
  ready_for_pickup_amount_formatted?: string;
  in_workshop_count: number;
  in_workshop_amount?: number;
  in_workshop_amount_formatted?: string;
  total_uncollected_amount?: number;
  total_uncollected_amount_formatted?: string;
}

export interface DashboardSummary {
  active_orders: number;
  intake_today: number;
  today_orders: number;
  daily_revenue?: number;
  daily_revenue_formatted?: string;
  selected_date?: string;
  selected_date_revenue?: number;
  selected_date_revenue_formatted?: string;
  selected_date_completed_orders?: number;
  monthly_revenue?: number;
  monthly_revenue_formatted?: string;
  selected_date_cogs?: number;
  selected_date_cogs_formatted?: string;
  monthly_cogs?: number;
  monthly_cogs_formatted?: string;
  selected_date_gross_profit?: number;
  selected_date_gross_profit_formatted?: string;
  selected_date_gross_profit_margin?: number;
  monthly_gross_profit?: number;
  monthly_gross_profit_formatted?: string;
  monthly_gross_profit_margin?: number;
  gross_profit_margin?: number;
  accounts_receivable?: number;
  accounts_receivable_formatted?: string;
  accounts_payable?: number;
  accounts_payable_formatted?: string;
  completion_rate: number;
  total_orders: number;
  completed_orders: number;
  reconciliation?: OperationalReconciliation;
  operational_summary?: OperationalSummary;
  actionable_tasks?: ActionableTasks;
}

export interface DashboardKpiResponse {
  summary: DashboardSummary;
  active_orders: number;
  intake_today: number;
  today_orders: number;
  daily_revenue?: number;
  daily_revenue_formatted?: string;
  selected_date?: string;
  selected_date_revenue?: number;
  selected_date_revenue_formatted?: string;
  selected_date_completed_orders?: number;
  monthly_revenue?: number;
  monthly_revenue_formatted?: string;
  selected_date_cogs?: number;
  selected_date_cogs_formatted?: string;
  monthly_cogs?: number;
  monthly_cogs_formatted?: string;
  selected_date_gross_profit?: number;
  selected_date_gross_profit_formatted?: string;
  selected_date_gross_profit_margin?: number;
  monthly_gross_profit?: number;
  monthly_gross_profit_formatted?: string;
  monthly_gross_profit_margin?: number;
  gross_profit_margin?: number;
  accounts_receivable?: number;
  accounts_receivable_formatted?: string;
  accounts_payable?: number;
  accounts_payable_formatted?: string;
  reconciliation: OperationalReconciliation;
  completion_rate: number;
  total_orders?: number;
  completed_orders?: number;
  status_distribution: Record<string, number>;
  workload_by_status: Record<string, number>;
  revenue_chart?: Array<{
    date: string;
    label: string;
    revenue: number;
    completed_orders: number;
  }>;
  operational_summary?: OperationalSummary;
  actionable_tasks?: ActionableTasks;
}

export interface ActionableTaskOverdue {
  id: number;
  order_code: string;
  customer_name: string;
  customer_phone?: string;
  device_model: string;
  technician_name: string;
  created_at: string;
  hours_overdue: number;
  status: string;
  issue_description?: string;
  total_price?: number;
}

export interface ActionableTaskWaitingApproval {
  id: number;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  device_model: string;
  technician_name: string;
  total_price: number;
  issue_description?: string;
  hours_pending: number;
  status: string;
  created_at?: string;
}

export interface ActionableTaskWaitingQc {
  id: number;
  order_code: string;
  customer_name: string;
  device_model: string;
  technician_name: string;
  repair_completed_at: string | null;
  hours_waiting: number;
  status: string;
  issue_description?: string;
  total_price?: number;
}

export interface ActionableTaskWaitingPickup {
  id: number;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  device_model: string;
  technician_name: string;
  total_price: number;
  status: string;
  issue_description?: string;
}

export interface ActionableTaskLowStockPart {
  id: number;
  sku: string;
  name: string;
  stock_quantity: number;
  min_stock_alert: number;
  category: string;
  storage_location: string;
  unit: string;
}

export interface ActionableTasks {
  overdue: ActionableTaskOverdue[];
  waiting_approval: ActionableTaskWaitingApproval[];
  pending_quotes?: ActionableTaskWaitingApproval[];
  waiting_qc: ActionableTaskWaitingQc[];
  pending_qc?: ActionableTaskWaitingQc[];
  waiting_pickup: ActionableTaskWaitingPickup[];
  ready_pickup?: ActionableTaskWaitingPickup[];
  low_stock_parts: ActionableTaskLowStockPart[];
}

export interface TechnicianKpiItem {
  id: number;
  technician_id?: number;
  name: string;
  email?: string;
  phone?: string | null;
  role: string;
  user_role?: string;
  branch_id?: number | null;
  branch_name?: string | null;
  count: string;
  total_orders: number;
  completed: number;
  rework_needed: number;
  in_repair?: number;
  qc_passed?: number;
  qc_total?: number;
  qc_pass_rate?: number | null;
  qcPass?: string | null;
  rating?: string | null;
  trend?: string | null;
  avg_processing_time_minutes?: number;
  avg_processing_time_hours?: number;
  avg_processing_time_formatted?: string;
  revenue_generated?: number | null;
  revenue_generated_formatted?: string | null;
}

export interface CskhKpiItem {
  id: number;
  user_id?: number;
  name: string;
  email?: string;
  phone?: string | null;
  role: string;
  user_role?: string;
  branch_id?: number | null;
  branch_name?: string | null;
  count: string;
  total_orders: number;
  orders_created_count: number;
  completed: number;
  orders_completed_count: number;
  conversion_rate: number;
  conversion_rate_formatted: string;
  qcPass?: string | null;
  rating?: string | null;
  trend?: string | null;
  revenue_generated?: number | null;
  revenue_generated_formatted?: string | null;
}

export type StaffKpiItem = TechnicianKpiItem | CskhKpiItem;

export interface StaffKpiSummary {
  total_technicians?: number;
  total_cskh?: number;
  total_orders?: number;
  total_completed: number;
  completed?: number;
  total_rework?: number;
  rework_needed?: number;
  qc_pass_rate?: number | null;
  avg_processing_time_minutes?: number;
  avg_processing_time_hours?: number;
  avg_processing_time_formatted?: string;
  avg_repair_days?: string | null;
  customer_satisfaction?: string | null;
}

export interface StaffPerformanceData {
  summary: StaffKpiSummary;
  staff: StaffKpiItem[];
  technicians: TechnicianKpiItem[];
  cskh: CskhKpiItem[];
}

export interface StaffKpiFilterParams {
  branch_id?: string | number;
  technician_id?: string | number;
  role?: 'technician' | 'cskh' | 'all' | string;
  from_date?: string;
  to_date?: string;
  date?: string;
  period?: string;
  view?: string;
  flat?: boolean;
}

