import { HttpClient, defaultHttpClient } from '../http-client';

export interface CommonIssueItem {
  id?: number;
  issue_name: string;
  category?: string;
  solution?: string;
  estimated_time?: string;
  estimated_cost?: number;
  order_index?: number;
  is_active?: boolean;
}

export class ServiceService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getServices(params?: { category?: string; device_model_id?: string | number }): Promise<any> {
    return this.http.get('/api/v1/services', { params });
  }

  async getCommonIssues(
    params?: { category?: string } | string
  ): Promise<any> {
    const queryParams = typeof params === 'string' ? { category: params } : params;
    return this.http.get('/api/v1/services/common-issues', { params: queryParams });
  }

  async getServiceById(id: string | number): Promise<any> {
    return this.http.get(`/api/v1/services/${id}`);
  }
}

export const serviceService = new ServiceService();
