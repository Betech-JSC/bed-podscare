import { HttpClient, defaultHttpClient } from '../http-client';
import type {
  OperationalSummary,
  ActionableTasks,
  DashboardKpiResponse,
  TechnicianKpiItem,
  CskhKpiItem,
  StaffKpiItem,
  StaffKpiSummary,
  StaffPerformanceData,
  StaffKpiFilterParams,
  ApiResponse,
} from '@podscare/types';

export type {
  OperationalSummary,
  ActionableTasks,
  DashboardKpiResponse,
  TechnicianKpiItem,
  CskhKpiItem,
  StaffKpiItem,
  StaffKpiSummary,
  StaffPerformanceData,
  StaffKpiFilterParams,
};

export interface KpiSummary {
  total_technicians?: number;
  total_orders?: number;
  total_completed: number;
  completed?: number;
  total_rework?: number;
  rework_needed?: number;
  qc_pass_rate?: number;
  avg_processing_time_minutes?: number;
  avg_processing_time_hours?: number;
  avg_processing_time_formatted?: string;
  avg_repair_days: string;
  customer_satisfaction: string;
}

export interface KpiData {
  summary: KpiSummary;
  staff: StaffKpiItem[];
}

export interface DashboardStats {
  active_orders?: number;
  today_orders?: number;
  daily_revenue?: number;
  daily_revenue_formatted?: string;
  selected_date?: string;
  selected_date_revenue?: number;
  selected_date_revenue_formatted?: string;
  selected_date_completed_orders?: number;
  monthly_revenue?: number;
  monthly_revenue_formatted?: string;
  total_revenue?: number;
  revenue_display?: string;
  qc_pass_rate?: number;
  completed_orders?: number;
  total_uncollected_amount?: number;
  total_uncollected_amount_formatted?: string;
  reconciliation?: {
    handed_over_count: number;
    handed_over_revenue: number;
    handed_over_revenue_formatted: string;
    ready_for_pickup_count: number;
    ready_for_pickup_amount: number;
    ready_for_pickup_amount_formatted: string;
    in_workshop_count: number;
    in_workshop_amount: number;
    in_workshop_amount_formatted: string;
    total_uncollected_amount?: number;
    total_uncollected_amount_formatted?: string;
  };
  operational_summary?: OperationalSummary;
  actionable_tasks?: ActionableTasks;
  [key: string]: any;
}

export interface RevenueChartPoint {
  date: string;
  revenue: number;
  orders_count?: number;
  [key: string]: any;
}

export interface DashboardKpiData {
  stats?: DashboardStats;
  status_distribution?: Record<string, number>;
  revenue_chart?: RevenueChartPoint[];
  recent_orders?: any[];
  operational_summary?: OperationalSummary;
  actionable_tasks?: ActionableTasks;
  [key: string]: any;
}

export class KpiService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getStaffKpi(
    params?: StaffKpiFilterParams
  ): Promise<ApiResponse<StaffPerformanceData>> {
    return this.http.get('/api/v1/kpi/staff', { params: params as Record<string, string | number | boolean | undefined> });
  }

  async getDashboardKpi(params?: {
    branch_id?: string | number;
    period?: string;
    date?: string;
  }): Promise<any> {
    return this.http.get('/api/v1/kpi/dashboard', { params });
  }
}

export const kpiService = new KpiService();
