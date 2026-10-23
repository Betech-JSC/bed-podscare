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

export interface PartnerQueryParams {
  status?: string;
  service_type?: string;
  q?: string;
  search?: string;
  per_page?: number | 'all';
  all?: boolean;
  page?: number;
}

export class PartnerService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getPartners(params?: PartnerQueryParams): Promise<any> {
    const cleanParams: Record<string, string | number | boolean> = {};
    if (params) {
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== '') {
          cleanParams[key] = val;
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
    return this.http.get('/api/v1/partners', {
      params: Object.keys(cleanParams).length > 0 ? cleanParams : undefined,
    });
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
