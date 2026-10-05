import { HttpClient, defaultHttpClient } from '../http-client';
import type { ApiResponse } from '@podscare/types';

export interface TenantBrandingSettings {
  id: number;
  code: string;
  name: string;
  logo_url?: string | null;
  hotline?: string | null;
  receipt_footer_note?: string | null;
}

export interface UpdateTenantSettingsPayload {
  name?: string;
  hotline?: string | null;
  receipt_footer_note?: string | null;
}

export class TenantService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getSettings(): Promise<ApiResponse<TenantBrandingSettings>> {
    return this.http.get('/api/v1/tenant/settings');
  }

  async updateSettings(payload: UpdateTenantSettingsPayload): Promise<ApiResponse<TenantBrandingSettings>> {
    return this.http.post('/api/v1/tenant/settings', payload);
  }

  async uploadLogo(file: File): Promise<ApiResponse<{ logo_url: string }>> {
    const formData = new FormData();
    formData.append('logo', file);
    return this.http.post('/api/v1/tenant/logo', formData);
  }

  async deleteLogo(): Promise<ApiResponse<{ logo_url: null }>> {
    return this.http.delete('/api/v1/tenant/logo');
  }
}

export const tenantService = new TenantService();
