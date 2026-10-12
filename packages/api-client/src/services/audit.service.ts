import { HttpClient, defaultHttpClient } from '../http-client';

export interface AuditLogItem {
  id?: number;
  time?: string;
  created_at?: string;
  user_id?: number | null;
  user?: any;
  user_name?: string;
  action: string;
  auditable_type?: string | null;
  auditable_id?: number | null;
  old_values?: Record<string, any> | null;
  new_values?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  detail?: string;
  details?: string;
  source?: string;
  ip_address?: string;
  channel?: string;
}

export interface AuditLogFilterDTO {
  action?: string;
  auditable_type?: string;
  auditable_id?: number | string;
  user_id?: string | number;
  has_diff?: boolean | string;
  from_date?: string;
  to_date?: string;
  q?: string;
  page?: number;
  per_page?: number;
  [key: string]: any;
}

export class AuditService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getAuditLogs(params?: AuditLogFilterDTO): Promise<any> {
    return this.http.get('/api/v1/audit-logs', { params: params as any });
  }

  async getAuditLogById(id: string | number): Promise<any> {
    return this.http.get(`/api/v1/audit-logs/${id}`);
  }
}

export const auditService = new AuditService();
