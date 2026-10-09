export interface OperationalReconciliation {
  handed_over_count: number;
  handed_over_revenue: number;
  handed_over_revenue_formatted: string;
  ready_for_pickup_count: number;
  ready_for_pickup_amount: number;
  ready_for_pickup_amount_formatted: string;
  in_workshop_count: number;
  in_workshop_amount: number;
  in_workshop_amount_formatted: string;
  total_uncollected_amount: number;
  total_uncollected_amount_formatted: string;
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
  monthly_revenue: number;
  monthly_revenue_formatted: string;
  completion_rate: number;
  total_orders: number;
  completed_orders: number;
  reconciliation?: OperationalReconciliation;
}

export interface DashboardKpiResponse {
  summary: DashboardSummary;
  active_orders: number;
  intake_today: number;
  today_orders: number;
  daily_revenue: number;
  daily_revenue_formatted: string;
  selected_date?: string;
  selected_date_revenue?: number;
  selected_date_revenue_formatted?: string;
  selected_date_completed_orders?: number;
  monthly_revenue: number;
  monthly_revenue_formatted: string;
  reconciliation: OperationalReconciliation;
  completion_rate: number;
  status_distribution: Record<string, number>;
  workload_by_status: Record<string, number>;
  revenue_chart: Array<{
    date: string;
    label: string;
    revenue: number;
    completed_orders: number;
  }>;
}
