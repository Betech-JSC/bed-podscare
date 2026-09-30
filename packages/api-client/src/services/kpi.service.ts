import { HttpClient, defaultHttpClient } from '../http-client';

export interface StaffKpiItem {
  id?: number | string;
  technician_id?: number | string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  user_role?: string;
  branch_id?: number | null;
  branch_name?: string | null;
  count: string;
  total_orders?: number;
  completed?: number;
  rework_needed?: number;
  in_repair?: number;
  qc_passed?: number;
  qc_total?: number;
  qc_pass_rate?: number;
  qcPass: string;
  rating: string;
  trend: string;
  avg_processing_time_minutes?: number;
  avg_processing_time_hours?: number;
  avg_processing_time_formatted?: string;
}

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
  total_revenue?: number;
  revenue_display?: string;
  qc_pass_rate?: number;
  completed_orders?: number;
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
  [key: string]: any;
}

export class KpiService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getStaffKpi(params?: {
    branch_id?: string | number;
    technician_id?: string | number;
    from_date?: string;
    to_date?: string;
    view?: string;
    flat?: boolean;
  }): Promise<any> {
    return this.http.get('/api/v1/kpi/staff', { params });
  }

  async getDashboardKpi(params?: {
    branch_id?: string | number;
    period?: string;
  }): Promise<any> {
    return this.http.get('/api/v1/kpi/dashboard', { params });
  }
}

export const kpiService = new KpiService();
