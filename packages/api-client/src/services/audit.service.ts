import { HttpClient, defaultHttpClient } from '../http-client';

export interface AuditLogItem {
  id?: number;
  time?: string;
  created_at?: string;
  user?: string;
  user_name?: string;
  action: string;
  detail?: string;
  details?: string;
  source?: string;
  ip_address?: string;
  channel?: string;
}

export class AuditService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getAuditLogs(params?: {
    action?: string;
    user_id?: string | number;
    q?: string;
    page?: number;
    per_page?: number;
  }): Promise<any> {
    return this.http.get('/api/v1/audit-logs', { params });
  }

  async getAuditLogById(id: string | number): Promise<any> {
    return this.http.get(`/api/v1/audit-logs/${id}`);
  }
}

export const auditService = new AuditService();
