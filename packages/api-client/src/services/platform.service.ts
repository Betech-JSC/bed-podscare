import { HttpClient, defaultHttpClient } from '../http-client';

export interface PlatformBillingStats {
  mrr: number;
  mrr_formatted?: string;
  mrr_growth_percentage?: number;
  active_stores_count: number;
  total_stores_count: number;
  expiring_soon_count: number;
  weekly_sepay_transactions_count: number;
  expiring_stores?: Array<{
    id: number;
    code: string;
    name: string;
    phone: string;
    plan: string;
    expires_at: string;
    days_remaining: number;
  }>;
}

export interface PlatformTransaction {
  id: string | number;
  ref_code: string;
  store_code: string;
  store_name: string;
  plan_name: string;
  amount: number;
  bank?: string;
  payment_method?: string;
  created_at?: string;
  timestamp?: string;
  status: 'completed' | 'processing' | 'pending' | 'failed';
}

export interface PlatformPlan {
  id: string;
  name: string;
  tagline: string;
  price: number;
  period: string;
  popular?: boolean;
  active_stores_count?: number;
  max_branches: number | 'unlimited';
  max_users: number | 'unlimited';
  max_orders_per_month: number | 'unlimited';
  features: string[];
}

export interface PlatformSepayConfig {
  bank_code: string;
  bank_name?: string;
  account_number: string;
  account_name: string;
  api_token: string;
  webhook_secret: string;
  webhook_url?: string;
  is_connected?: boolean;
}

export class PlatformService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getBillingStats(): Promise<any> {
    return this.http.get('/api/v1/platform/billing-stats');
  }

  async getTransactions(params?: {
    page?: number;
    per_page?: number;
    search?: string;
    status?: string;
  }): Promise<any> {
    return this.http.get('/api/v1/platform/transactions', { params });
  }

  async remindFee(storeId: number | string): Promise<any> {
    return this.http.post(`/api/v1/platform/stores/${storeId}/remind-fee`);
  }

  async renewStore(storeId: number | string, data?: { days?: number; months?: number }): Promise<any> {
    return this.http.post(`/api/v1/platform/stores/${storeId}/renew`, data);
  }

  async getPlans(): Promise<any> {
    return this.http.get('/api/v1/platform/plans');
  }

  async updatePlan(planId: string | number, data: Partial<PlatformPlan>): Promise<any> {
    return this.http.put(`/api/v1/platform/plans/${planId}`, data);
  }

  async getSepayConfig(): Promise<any> {
    return this.http.get('/api/v1/platform/integrations/sepay');
  }

  async updateSepayConfig(data: Partial<PlatformSepayConfig>): Promise<any> {
    return this.http.post('/api/v1/platform/integrations/sepay', data);
  }

  async testSepayConnection(): Promise<any> {
    return this.http.post('/api/v1/platform/integrations/sepay/test-connection');
  }
}

export const platformService = new PlatformService();
