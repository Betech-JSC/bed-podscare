import { HttpClient, defaultHttpClient } from '../http-client';

export interface PartnerItem {
  id: number;
  code: string;
  name: string;
  service_type: string;
  contact_person?: string | null;
  phone?: string | null;
  status: 'active' | 'inactive';
  api_config?: Record<string, any> | null;
  shipments_count?: number;
  created_at?: string;
  updated_at?: string;
}

export class PartnerService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getPartners(params?: {
    status?: string;
    service_type?: string;
    q?: string;
    per_page?: number;
    page?: number;
  }): Promise<any> {
    return this.http.get('/api/v1/partners', { params });
  }

  async getPartnerById(id: number | string): Promise<any> {
    return this.http.get(`/api/v1/partners/${id}`);
  }

  async createPartner(dto: {
    code: string;
    name: string;
    service_type: string;
    contact_person?: string;
    phone?: string;
    status?: string;
    api_config?: Record<string, any>;
  }): Promise<any> {
    return this.http.post('/api/v1/partners', dto);
  }

  async updatePartner(
    id: number | string,
    dto: Partial<{
      code: string;
      name: string;
      service_type: string;
      contact_person?: string;
      phone?: string;
      status?: string;
      api_config?: Record<string, any>;
    }>
  ): Promise<any> {
    return this.http.put(`/api/v1/partners/${id}`, dto);
  }
}

export const partnerService = new PartnerService();
