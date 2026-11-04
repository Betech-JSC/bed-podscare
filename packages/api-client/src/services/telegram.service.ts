import { HttpClient, defaultHttpClient } from '../http-client';
import type { ApiResponse } from '@podscare/types';

export interface TelegramRecipientRecord {
  id: number;
  tenant_id: number;
  branch_id?: number | null;
  branch?: { id: number; name: string; code?: string } | null;
  user_id?: number | null;
  user?: { id: number; name: string; phone?: string | null; role?: string } | null;
  label: string;
  phone: string;
  target_role: 'admin' | 'cskh' | 'technician' | 'qc' | string;
  telegram_chat_id?: string | null;
  telegram_user_id?: string | null;
  telegram_thread_id?: string | null;
  connect_token: string;
  connect_url: string;
  subscribed_events?: string[] | null;
  is_active: boolean;
  connected_at?: string | null;
  created_at?: string;
}

export type TelegramRecipientItem = TelegramRecipientRecord;

export interface CreateTelegramRecipientPayload {
  label: string;
  phone: string;
  branch_id?: number | null;
  user_id?: number | null;
  target_role?: 'admin' | 'cskh' | 'technician' | 'qc' | string;
  telegram_chat_id?: string | null;
  telegram_thread_id?: string | null;
  is_active?: boolean;
}

export interface UpdateTelegramRecipientPayload {
  label?: string;
  phone?: string;
  branch_id?: number | null;
  user_id?: number | null;
  target_role?: 'admin' | 'cskh' | 'technician' | 'qc' | string;
  telegram_chat_id?: string | null;
  telegram_thread_id?: string | null;
  is_active?: boolean;
}

export class TelegramService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getRecipients(): Promise<ApiResponse<TelegramRecipientRecord[]>> {
    return this.http.get('/api/v1/telegram-recipients');
  }

  async getTelegramRecipients(): Promise<ApiResponse<TelegramRecipientRecord[]>> {
    return this.getRecipients();
  }

  async createRecipient(
    payload: CreateTelegramRecipientPayload
  ): Promise<ApiResponse<TelegramRecipientRecord>> {
    return this.http.post('/api/v1/telegram-recipients', payload);
  }

  async createTelegramRecipient(
    payload: CreateTelegramRecipientPayload
  ): Promise<ApiResponse<TelegramRecipientRecord>> {
    return this.createRecipient(payload);
  }

  async updateRecipient(
    id: number,
    payload: UpdateTelegramRecipientPayload
  ): Promise<ApiResponse<TelegramRecipientRecord>> {
    return this.http.put(`/api/v1/telegram-recipients/${id}`, payload);
  }

  async updateTelegramRecipient(
    id: number,
    payload: UpdateTelegramRecipientPayload
  ): Promise<ApiResponse<TelegramRecipientRecord>> {
    return this.updateRecipient(id, payload);
  }

  async deleteRecipient(id: number): Promise<ApiResponse<null>> {
    return this.http.delete(`/api/v1/telegram-recipients/${id}`);
  }

  async deleteTelegramRecipient(id: number): Promise<ApiResponse<null>> {
    return this.deleteRecipient(id);
  }

  async syncRecipients(): Promise<
    ApiResponse<{ synced_count: number; recipients: TelegramRecipientRecord[] }>
  > {
    return this.http.post('/api/v1/telegram-recipients/sync', {});
  }

  async syncTelegramRecipients(): Promise<
    ApiResponse<{ synced_count: number; recipients: TelegramRecipientRecord[] }>
  > {
    return this.syncRecipients();
  }

  async testRecipient(id: number): Promise<ApiResponse<{ sent: boolean }>> {
    return this.http.post(`/api/v1/telegram-recipients/${id}/test`, {});
  }

  async testTelegramRecipient(id: number): Promise<ApiResponse<{ sent: boolean }>> {
    return this.testRecipient(id);
  }
}

export const telegramService = new TelegramService();
