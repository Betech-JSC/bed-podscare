import { HttpClient, defaultHttpClient } from '../http-client';
import type { ApiResponse } from '@podscare/types';

export interface TenantBrandingSettings {
  id: number;
  code: string;
  name: string;
  logo_url?: string | null;
  hotline?: string | null;
  receipt_footer_note?: string | null;
  bank_code?: string | null;
  bank_account_number?: string | null;
  bank_account_holder?: string | null;
}

export interface TenantSettings extends TenantBrandingSettings {}

export interface UpdateTenantSettingsPayload {
  name?: string;
  hotline?: string | null;
  receipt_footer_note?: string | null;
  bank_code?: string | null;
  bank_account_number?: string | null;
  bank_account_holder?: string | null;
}

export interface TelegramRecipientItem {
  id: number;
  tenant_id: number;
  branch_id?: number | null;
  branch?: { id: number; name: string; code?: string } | null;
  label: string;
  phone: string;
  target_role: 'admin' | 'cskh' | 'technician' | 'qc' | string;
  telegram_chat_id?: string | null;
  telegram_thread_id?: string | null;
  connect_token: string;
  connect_url: string;
  subscribed_events?: string[] | null;
  is_active: boolean;
  connected_at?: string | null;
  created_at?: string;
}

export interface CreateTelegramRecipientPayload {
  label: string;
  phone: string;
  branch_id?: number | null;
  target_role?: string;
  telegram_chat_id?: string | null;
  telegram_thread_id?: string | null;
  is_active?: boolean;
}

export interface UpdateTelegramRecipientPayload {
  label?: string;
  phone?: string;
  branch_id?: number | null;
  telegram_chat_id?: string | null;
  telegram_thread_id?: string | null;
  is_active?: boolean;
}

export class TenantService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getSettings(): Promise<ApiResponse<TenantSettings>> {
    return this.http.get('/api/v1/tenant/settings');
  }

  async updateSettings(payload: UpdateTenantSettingsPayload): Promise<ApiResponse<TenantSettings>> {
    return this.http.post('/api/v1/tenant/settings', payload);
  }

  async uploadLogo(file: File): Promise<ApiResponse<{ logo_url: string }>>;
  async uploadLogo(fileOrBase64: string): Promise<ApiResponse<{ logo_url: string }>>;
  async uploadLogo(fileOrBase64: File | string): Promise<ApiResponse<{ logo_url: string }>> {
    if (typeof fileOrBase64 === 'string') {
      return this.http.post('/api/v1/tenant/logo', { logo_base64: fileOrBase64 });
    }
    const formData = new FormData();
    formData.append('logo', fileOrBase64);
    return this.http.post('/api/v1/tenant/logo', formData);
  }

  async uploadLogoBase64(base64Data: string): Promise<ApiResponse<{ logo_url: string }>> {
    return this.http.post('/api/v1/tenant/logo', { logo_base64: base64Data });
  }

  async deleteLogo(): Promise<ApiResponse<{ logo_url: null }>> {
    return this.http.delete('/api/v1/tenant/logo');
  }

  async getTelegramRecipients(): Promise<ApiResponse<TelegramRecipientItem[]>> {
    return this.http.get('/api/v1/telegram-recipients');
  }

  async createTelegramRecipient(payload: CreateTelegramRecipientPayload): Promise<ApiResponse<TelegramRecipientItem>> {
    return this.http.post('/api/v1/telegram-recipients', payload);
  }

  async updateTelegramRecipient(id: number, payload: UpdateTelegramRecipientPayload): Promise<ApiResponse<TelegramRecipientItem>> {
    return this.http.put(`/api/v1/telegram-recipients/${id}`, payload);
  }

  async deleteTelegramRecipient(id: number): Promise<ApiResponse<null>> {
    return this.http.delete(`/api/v1/telegram-recipients/${id}`);
  }

  async syncTelegramRecipients(): Promise<ApiResponse<{ synced_count: number; recipients: TelegramRecipientItem[] }>> {
    return this.http.post('/api/v1/telegram-recipients/sync', {});
  }

  async testTelegramRecipient(id: number): Promise<ApiResponse<{ sent: boolean }>> {
    return this.http.post(`/api/v1/telegram-recipients/${id}/test`, {});
  }
}

export const tenantService = new TenantService();
