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

export interface WarrantySummaryCounts {
  total: number;
  active: number;
  expiring_soon: number;
  expired: number;
  total_warranties?: number;
  active_count?: number;
  expiring_soon_count?: number;
  expired_or_revoked_count?: number;
}

export type WarrantySummary = WarrantySummaryCounts;

export interface WarrantyPaginationParams {
  page?: number;
  per_page?: number | 'all';
  all?: boolean;
  q?: string;
  search?: string;
  status?: string;
}

export interface WarrantyQueryParams extends WarrantyPaginationParams {
  phone?: string;
  serial_number?: string;
}

export interface WarrantyClaimQueryParams extends WarrantyPaginationParams {}

export interface WarrantyLookupParams {
  [key: string]: string | number | boolean | undefined;
  code?: string;
  phone?: string;
}

function buildCleanPaginationParams(
  params?: Record<string, string | number | boolean | undefined>
): Record<string, string | number | boolean> | undefined {
  if (!params || typeof params !== 'object') {
    return undefined;
  }

  const cleanParams: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      cleanParams[key] = value;
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

  return Object.keys(cleanParams).length > 0 ? cleanParams : undefined;
}

export class WarrantyService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getWarranties(params?: WarrantyQueryParams): Promise<any> {
    const cleanParams = buildCleanPaginationParams(params as Record<string, string | number | boolean | undefined>);
    return this.http.get('/api/v1/warranties', {
      params: cleanParams,
    });
  }

  async getDeviceHistory(params: {
    phone?: string;
    customer_phone?: string;
    serial_number?: string;
    customer_id?: string | number;
    order_code?: string;
  }): Promise<any> {
    return this.http.get('/api/v1/warranties/history', { params });
  }

  async lookup(params: WarrantyLookupParams): Promise<any> {
    return this.http.get('/api/v1/warranties/lookup', { params });
  }

  async getClaims(params?: WarrantyClaimQueryParams): Promise<any> {
    const cleanParams = buildCleanPaginationParams(params as Record<string, string | number | boolean | undefined>);
    return this.http.get('/api/v1/warranties/claims', {
      params: cleanParams,
    });
  }

  async createClaim(dto: CreateWarrantyClaimDTO): Promise<any> {
    return this.http.post('/api/v1/warranties/claims', {
      resolution_mode: 'store_check',
      ...dto,
    });
  }
}

export const warrantyService = new WarrantyService();
