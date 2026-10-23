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
  search?: string;
  page?: number;
  per_page?: number | 'all';
  all?: boolean;
  [key: string]: any;
}

export class AuditService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getAuditLogs(params?: AuditLogFilterDTO): Promise<any> {
    const cleanParams: Record<string, string | number | boolean> = {};
    if (params) {
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== '') {
          cleanParams[key] = val as string | number | boolean;
        }
      }
      const queryText = params.q ?? params.search;
      if (queryText !== undefined && String(queryText).trim() !== '') {
        cleanParams.q = String(queryText).trim();
      }
      if (params.per_page === 'all' || params.all === true) {
        cleanParams.per_page = 'all';
        cleanParams.all = true;
      }
    }
    return this.http.get('/api/v1/audit-logs', {
      params: Object.keys(cleanParams).length > 0 ? cleanParams : undefined,
    });
  }

  async getAuditLogById(id: string | number): Promise<any> {
    return this.http.get(`/api/v1/audit-logs/${id}`);
  }
}

export const auditService = new AuditService();
