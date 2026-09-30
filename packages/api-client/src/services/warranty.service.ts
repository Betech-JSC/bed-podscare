import { HttpClient, defaultHttpClient } from '../http-client';

export interface WarrantyItem {
  id: number;
  warranty_code: string;
  repair_order_id: number;
  customer_id: number;
  device_model_id: number;
  serial_number?: string;
  warranty_period_days: number;
  starts_at: string;
  expires_at: string;
  status: 'active' | 'expired' | 'voided' | string;
  terms?: string;
  notes?: string;
  created_at?: string;
  repair_order?: {
    id: number;
    order_code: string;
  };
  customer?: {
    id: number;
    name: string;
    phone: string;
  };
  device_model?: {
    id: number;
    name: string;
    category?: string;
  };
  claims?: WarrantyClaimItem[];
}

export interface WarrantyClaimItem {
  id: number;
  warranty_id: number;
  claim_code?: string;
  issue_description: string;
  resolution_mode: 'store_check' | 'send_tech' | 'replace_part' | 'rejected' | string;
  status: 'pending' | 'in_progress' | 'resolved' | 'rejected' | string;
  rework_order_id?: number | null;
  received_by_user_id?: number | null;
  notes?: string | null;
  created_at?: string;
  warranty?: WarrantyItem;
  received_by_user?: {
    id: number;
    name: string;
  };
}

export interface CreateWarrantyClaimDTO {
  warranty_id: number | string;
  issue_description: string;
  resolution_mode?: 'store_check' | 'send_tech' | 'replace_part' | 'rejected' | string;
  notes?: string;
}

export interface WarrantyLookupParams {
  [key: string]: string | number | boolean | undefined;
  code?: string;
  phone?: string;
}

export class WarrantyService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getWarranties(params?: {
    status?: string;
    q?: string;
    search?: string;
    per_page?: number;
    page?: number;
  }): Promise<any> {
    return this.http.get('/api/v1/warranties', {
      params: {
        ...params,
        q: params?.q || params?.search,
      },
    });
  }

  async lookup(params: WarrantyLookupParams): Promise<any> {
    return this.http.get('/api/v1/warranties/lookup', { params });
  }

  async getClaims(params?: {
    status?: string;
    per_page?: number;
    page?: number;
  }): Promise<any> {
    return this.http.get('/api/v1/warranties/claims', { params });
  }

  async createClaim(dto: CreateWarrantyClaimDTO): Promise<any> {
    return this.http.post('/api/v1/warranties/claims', {
      resolution_mode: 'store_check',
      ...dto,
    });
  }
}

export const warrantyService = new WarrantyService();
